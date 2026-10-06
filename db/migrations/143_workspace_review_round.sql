-- bb2dash :: db/migrations/143_workspace_review_round.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), the review round: ruling V3
-- on `/code-review main high` (CR-4, CR-7, CR-8) and on the note under `/security-review`
-- (docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md). Worker W-63.
--
-- WHY. The two reviews read 140 and 142 after they were applied. Those files are frozen (the repo
-- file stays byte-identical to what prod recorded), so the four changes the PM took are made here,
-- on top of them.
--
-- WHAT
--   1. v_workspace_status gains a last column, polled_age_seconds                        (CR-8)
--   2. workspace_finish refuses a request that is not claimed or cancelled      (security note)
--   3. workspace_claim's sweep also finishes an assistant row its request left behind    (CR-4)
--   4. the updated_at trigger does not fire for an update that changes only `archived`   (CR-7)
--   5. a guard block
--
-- ADDITIVE: `create or replace` only. No drop, no rename, no new object, no signature changed.
-- `create or replace` keeps an object's owner, its grants and its comment, so no grant is stated
-- again; section 5 re-reads them instead. Two things it does NOT keep, and they are stated again:
--   * a view's options. `create or replace view` replaces the options list with the one it is
--     given, even an empty one, so `with (security_invoker = true)` is written out below. Left
--     out, the view would run as its owner and show the heartbeat to every caller.
--   * a function's `security definer` and `set search_path`. They belong to the definition.
-- Each `comment on` below replaces a text that 140 or 142 wrote and that this file made wrong.
--
-- THE TWO FUNCTION BODIES are 142's, with only what is marked `143` changed: one constant and one
-- statement in workspace_claim, one refusal in workspace_finish.
--
-- No password, key or DSN is in this file.

do $$
begin
  if to_regclass('public.v_workspace_status') is null
     or to_regclass('public.workspace_conversations') is null then
    raise exception '143: v_workspace_status or workspace_conversations does not exist; apply 140_workspace_tables first';
  end if;
  if to_regprocedure('public.workspace_claim(text)') is null
     or to_regprocedure('public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text)') is null then
    raise exception '143: workspace_claim or workspace_finish does not exist; apply 142_workspace_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. v_workspace_status: polled_age_seconds (CR-8)
-- =============================================================================================
-- The page decided "offline" by comparing the browser's clock with polled_at, so a skewed clock
-- gave a wrong service line. The age is now measured where polled_at was written: the whole
-- seconds from polled_at to the server's now(), rounded down. Never negative (a reader whose
-- transaction began just before the heartbeat's reads 0), and null before the first heartbeat:
-- `greatest` skips a null, so the null is kept by the `case`, not by the arithmetic.
--
-- The first four columns are 140's, unchanged in name, type and order; the new one is last.
create or replace view public.v_workspace_status
  with (security_invoker = true) as
select h.polled_at,
       h.runner,
       (select count(*) from public.workspace_requests r
         where r.state in ('queued', 'claimed'))::integer as open_requests,
       (select min(r.created_at) from public.workspace_requests r
         where r.state in ('queued', 'claimed'))          as oldest_open_at,
       case when h.polled_at is not null
            then greatest(0, floor(extract(epoch from (now() - h.polled_at))))::integer
       end                                                as polled_age_seconds
  from (select 1 as id) one
  left join public.workspace_runner_heartbeat h on h.id = one.id;

comment on view public.v_workspace_status is
  'The Workspace service line (migration 140; polled_age_seconds added by 143): always exactly one '
  'row. polled_at and runner are the runner''s heartbeat, null before the first one; open_requests '
  'and oldest_open_at count the queued and claimed requests; polled_age_seconds is the whole '
  'seconds from polled_at to the server''s now(), never negative, null before the first heartbeat. '
  'Offline = polled_age_seconds null or over 120, read on the server''s clock: the page adds the '
  'time that has passed since its read and never compares its own wall clock with polled_at. '
  'security_invoker with anon revoked, as 036 requires: a caller who is not the owner gets the row '
  'with nulls and 0.';

-- =============================================================================================
-- 2. workspace_finish: a request that is not claimed or cancelled is refused (security note)
-- =============================================================================================
-- 142's body closed any request that exists, so a second call on a request already done or failed
-- wrote over its stored answer. Now only a claimed request (the turn the runner holds) and a
-- cancelled one (Stop was pressed during the turn; the partial text is still stored) can be
-- finished. The runner reads this 22023 as "already closed" and does not retry it.
create or replace function public.workspace_finish(
    p_request_id bigint, p_state text, p_content text, p_tool_calls jsonb, p_error_code text,
    p_cost_usd numeric, p_duration_ms integer, p_claude_session_id text, p_model text)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_content_max constant integer := 100000;
  c_tools_max   constant integer := 20;
  v_state   text;
  v_conv    uuid;
  v_message uuid;
  v_final   text;
  v_code    text;
  v_tools   jsonb;
  v_session text;
begin
  if p_state is null or p_state not in ('done', 'failed') then
    raise exception 'workspace_finish: state must be done or failed, not %', coalesce(p_state, 'null')
      using errcode = '22023';
  end if;
  if p_error_code is not null
     and p_error_code not in ('budget_exceeded', 'timeout', 'stale_claim', 'provider_not_configured',
                              'cli_error', 'cancelled', 'usage_limit', 'sign_in_expired') then
    raise exception 'workspace_finish: % is not one of the eight error codes', p_error_code
      using errcode = '22023';
  end if;
  if p_tool_calls is not null and jsonb_typeof(p_tool_calls) <> 'array' then
    raise exception 'workspace_finish: p_tool_calls must be a json array, not %',
      jsonb_typeof(p_tool_calls) using errcode = '22023';
  end if;

  select r.state, r.conversation_id into v_state, v_conv
    from workspace_requests r
   where r.id = p_request_id
     for update;
  if not found then
    raise exception 'workspace_finish: request % does not exist', p_request_id
      using errcode = '22023';
  end if;
  -- 143: a queued, done or failed request is not the runner's to close.
  if v_state not in ('claimed', 'cancelled') then
    raise exception 'workspace_finish: request % is not claimed or cancelled (it is %)',
      p_request_id, v_state using errcode = '22023';
  end if;

  -- Stop wins: a request already cancelled stays cancelled, and its message gets cancelled.
  if v_state = 'cancelled' then
    v_final := 'cancelled';
    v_code  := 'cancelled';
  else
    v_final := p_state;
    v_code  := p_error_code;
    update workspace_requests r
       set state = p_state, finished_at = now(), error_code = p_error_code
     where r.id = p_request_id;
  end if;

  -- The first 20 tool calls, in call order. A longer array is cut, never refused, as content is.
  select coalesce(jsonb_agg(t.elem order by t.ord), '[]'::jsonb) into v_tools
    from jsonb_array_elements(coalesce(p_tool_calls, '[]'::jsonb)) with ordinality as t(elem, ord)
   where t.ord <= c_tools_max;

  update workspace_messages m
     set content     = left(coalesce(p_content, ''), c_content_max),
         tool_calls  = v_tools,
         error_code  = v_code,
         cost_usd    = p_cost_usd,
         duration_ms = p_duration_ms,
         model       = coalesce(p_model, m.model),
         finished    = true
   where m.request_id = p_request_id and m.role = 'assistant'
  returning m.id into v_message;

  -- The session the next turn resumes. An id that is not uuid-shaped is stored as null, never
  -- raised on: the next turn then starts fresh and replays the stored history.
  v_session := case when p_claude_session_id
                         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then p_claude_session_id end;
  update workspace_conversations c
     set claude_session_id = v_session, updated_at = now()
   where c.id = v_conv;

  perform realtime.send(
    jsonb_build_object('request_id', p_request_id, 'message_id', v_message, 'state', v_final),
    'done', 'workspace:' || v_conv::text, true);
end $$;

comment on function public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text) is
  'Closes a Workspace turn (142; the claimed-or-cancelled refusal added by 143). p_state is done or '
  'failed; p_error_code is null or one of the eight codes. Refuses (22023) a request that is not '
  'claimed or cancelled, so a request already done or failed cannot be finished again and its '
  'stored answer cannot be written over. A cancelled request stays cancelled and its message gets '
  'cancelled; a claimed request is set to p_state with finished_at stamped and p_error_code on the '
  'request row as well as on the message. Writes the assistant message: content cut at 100000 '
  'characters, p_tool_calls cut to its first 20 elements (never refused for length), cost_usd (the '
  'CLI''s total_cost_usd as reported), duration_ms, p_model over the alias when it is not null, '
  'finished. Stamps the conversation''s claude_session_id (null when p_claude_session_id is not '
  'uuid-shaped) and updated_at, and sends done {request_id, message_id, state} on '
  'workspace:<conversation uuid>. workspace_runner only.';

-- =============================================================================================
-- 3. workspace_claim: the sweep also finishes an assistant row its request left behind (CR-4)
-- =============================================================================================
-- 142's sweep touches requests that are still claimed. When Stop is pressed the request becomes
-- cancelled at once, and the assistant row is finished by the runner's own workspace_finish call.
-- A runner that died before that call left the row unfinished for good. The second statement
-- below closes it once the request has been closed for 10 minutes, long enough that no finish of
-- a live turn is still on its way (a turn is killed at 8 minutes).
create or replace function public.workspace_claim(p_runner text)
  returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text,
                 claude_session_id text, prior_tier text, history jsonb)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_stale_after constant interval := interval '10 minutes';
  c_orphan_after constant interval := interval '10 minutes';   -- 143
  c_history     constant integer  := 20;
  v_id          bigint;
  v_conv        uuid;
  v_message     uuid;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_claim: p_runner is required' using errcode = '22023';
  end if;

  -- The stale sweep: a claim older than 10 minutes died with its runner. It touches claimed rows
  -- only, so a queued request never expires.
  with swept as (
    update workspace_requests r
       set state = 'failed', error_code = 'stale_claim', finished_at = now()
     where r.state = 'claimed'
       and coalesce(r.claimed_at, r.created_at) < now() - c_stale_after
    returning r.id
  )
  update workspace_messages m
     set error_code = 'stale_claim', finished = true
    from swept s
   where m.request_id = s.id and m.role = 'assistant';

  -- 143, the orphan sweep: an assistant row still unfinished although its request closed
  -- (cancelled, failed or done) more than 10 minutes ago. The row is finished with the request's
  -- own code (cancelled for a stopped one, null for a done one). Its content, the request row and
  -- the conversation are not touched, and nothing is broadcast. A closed request with no
  -- finished_at is left alone: how long it has been closed is not known.
  update workspace_messages m
     set finished = true, error_code = r.error_code
    from workspace_requests r
   where r.id = m.request_id
     and m.role = 'assistant'
     and not m.finished
     and r.state in ('cancelled', 'failed', 'done')
     and r.finished_at < now() - c_orphan_after;

  -- The oldest queued request, whatever its age.
  select r.id, r.conversation_id, r.user_message_id
    into v_id, v_conv, v_message
    from workspace_requests r
   where r.state = 'queued'
   order by r.created_at, r.id
   limit 1
     for update skip locked;
  if not found then
    return;
  end if;

  update workspace_requests r
     set state = 'claimed', claimed_at = now(), claimed_by = p_runner, attempts = r.attempts + 1
   where r.id = v_id;

  return query
    select v_id                as request_id,
           v_conv              as conversation_id,
           v_message           as user_message_id,
           um.content          as prompt,
           c.claude_session_id as claude_session_id,
           (select a.tier
              from workspace_messages a
             where a.conversation_id = v_conv and a.role = 'assistant'
             order by a.created_at desc, a.id desc
             limit 1)          as prior_tier,
           coalesce((select jsonb_agg(jsonb_build_object('role', h.role, 'content', h.content)
                                      order by h.created_at, h.id)
                       from (select m.id, m.role, m.content, m.created_at
                               from workspace_messages m
                              where m.conversation_id = v_conv
                                and m.id <> v_message
                                and m.created_at <= um.created_at
                              order by m.created_at desc, m.id desc
                              limit c_history) h),
                    '[]'::jsonb) as history
      from workspace_messages um
      join workspace_conversations c on c.id = v_conv
     where um.id = v_message;
end $$;

comment on function public.workspace_claim(text) is
  'The Workspace runner''s poll (142; the second sweep added by 143). Sweeps claims older than 10 '
  'minutes to failed / stale_claim (on the request row and on its assistant row); finishes an '
  'assistant row left unfinished by a request that closed (cancelled, failed or done) more than 10 '
  'minutes ago, with the request''s own error_code; then claims the oldest queued request with for '
  'update skip locked, attempts + 1; a queued request does not expire. Returns at most one row: '
  'the prompt, the conversation''s claude_session_id, prior_tier (the tier of its latest assistant '
  'message, null when none) and history, the last 20 messages before the request''s own user '
  'message, oldest first, as [{role, content}] ([] for a first question). Does not stamp the '
  'heartbeat. workspace_runner only.';

-- =============================================================================================
-- 4. The updated_at trigger: archiving is not activity (CR-7)
-- =============================================================================================
-- The list is ordered by updated_at, newest first, and 140's trigger stamped it on every update,
-- so archiving or restoring an old chat moved it to the top. The trigger now stays silent for an
-- update whose only changed value is `archived`. Every other update fires it as before: one that
-- changes any other column (with or without `archived`), and one that changes nothing at all.
-- workspace_finish does not depend on it: it writes updated_at itself.
--
-- Every column of the table is named, so a column added later must be added here too; the 143
-- unit fails when one is missing.
create or replace trigger workspace_conversations_updated_at
  before update on public.workspace_conversations
  for each row
  when (new.archived is not distinct from old.archived
        or new.title is distinct from old.title
        or new.claude_session_id is distinct from old.claude_session_id
        or new.updated_at is distinct from old.updated_at
        or new.created_at is distinct from old.created_at
        or new.id is distinct from old.id)
  execute function public.set_updated_at();

-- =============================================================================================
-- 5. Guard (scoped to schema public, as 142's is)
-- =============================================================================================
do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The view still runs as its caller, and its columns are 140's four with 143's one last.
  if coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                 from pg_class c, unnest(c.reloptions) o
                where c.oid = 'public.v_workspace_status'::regclass
                  and split_part(o, '=', 1) = 'security_invoker'), false) is false then
    raise exception 'FAIL 143: v_workspace_status is not security_invoker';
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
    into v_got
    from pg_attribute a
   where a.attrelid = 'public.v_workspace_status'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_got is distinct from
     'polled_at timestamp with time zone, runner text, open_requests integer, '
     'oldest_open_at timestamp with time zone, polled_age_seconds integer' then
    raise exception 'FAIL 143: v_workspace_status columns are [%]', v_got;
  end if;

  -- (b) The view's grants came through: authenticated and service_role read it and nothing more,
  --     anon and workspace_runner hold nothing.
  if not has_table_privilege('authenticated', 'public.v_workspace_status', 'select')
     or not has_table_privilege('service_role', 'public.v_workspace_status', 'select')
     or has_table_privilege('authenticated', 'public.v_workspace_status',
                            'insert, update, delete, truncate, references, trigger')
     or has_table_privilege('anon', 'public.v_workspace_status',
                            'select, insert, update, delete, truncate, references, trigger')
     or has_any_column_privilege('anon', 'public.v_workspace_status',
                                 'select, insert, update, references')
     or has_table_privilege('workspace_runner', 'public.v_workspace_status',
                            'select, insert, update, delete, truncate, references, trigger') then
    raise exception 'FAIL 143: the grants on v_workspace_status are not 140''s';
  end if;

  -- (c) The five are still exactly the SECURITY DEFINER functions workspace_runner can execute,
  --     each plpgsql with its search_path pinned.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_finish,workspace_heartbeat,workspace_stream' then
    raise exception 'FAIL 143: workspace_runner executes SECURITY DEFINER functions %, expected the five', v_got;
  end if;
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
   where n.nspname = 'public'
     and p.proname = any (array['workspace_claim', 'workspace_begin', 'workspace_stream',
                                'workspace_finish', 'workspace_heartbeat'])
     and (not p.prosecdef or l.lanname <> 'plpgsql'
          or not coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']);
  if v_bad is not null then
    raise exception 'FAIL 143: not security definer, not plpgsql or search_path not pinned: %', v_bad;
  end if;

  -- (d) None of the five is executable by anon, authenticated, service_role or PUBLIC.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any (array['workspace_claim', 'workspace_begin', 'workspace_stream',
                                'workspace_finish', 'workspace_heartbeat'])
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 143: anon, authenticated, service_role or PUBLIC can execute %', v_bad;
  end if;

  -- (e) workspace_runner still holds no table, view or sequence privilege in public.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('workspace_runner', c.oid, 'usage,select,update')
               else has_table_privilege('workspace_runner', c.oid,
                                        'select,insert,update,delete,truncate,references,trigger')
          end);
  if v_bad is not null then
    raise exception 'FAIL 143: workspace_runner holds a privilege on %', v_bad;
  end if;

  -- (f) The trigger: still the table's one trigger, before update, for each row, on
  --     set_updated_at(), enabled, and now with a when clause.
  select string_agg(g.tgname, ', ' order by g.tgname) into v_got
    from pg_trigger g
   where g.tgrelid = 'public.workspace_conversations'::regclass and not g.tgisinternal;
  if v_got is distinct from 'workspace_conversations_updated_at' then
    raise exception 'FAIL 143: the triggers on workspace_conversations are [%]', v_got;
  end if;
  if not exists (select 1 from pg_trigger g
                  where g.tgrelid = 'public.workspace_conversations'::regclass
                    and g.tgname = 'workspace_conversations_updated_at'
                    and g.tgfoid = 'public.set_updated_at()'::regprocedure
                    and g.tgtype = 19          -- row (1) + before (2) + update (16)
                    and g.tgenabled = 'O'
                    and g.tgqual is not null) then
    raise exception 'FAIL 143: workspace_conversations_updated_at is not a before-update row trigger on set_updated_at() with a when clause';
  end if;

  -- (g) phase15_101's three catalogue rules still hold across public: every function of this
  --     project pins a search_path, every view is security_invoker, and the only SECURITY DEFINER
  --     functions on the API surface are app_owner() and calendar_push_now() (none for anon).
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
                      where c like 'search_path=%');
  if v_bad is not null then
    raise exception 'FAIL 143: functions without search_path: %', v_bad;
  end if;
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and coalesce((select lower(split_part(o, '=', 2)) in ('true', 'on', '1', 'yes', 't', 'y')
                     from unnest(c.reloptions) o
                    where split_part(o, '=', 1) = 'security_invoker'), false) is false;
  if v_bad is not null then
    raise exception 'FAIL 143: these public views run as their owner: %', v_bad;
  end if;
  select coalesce(string_agg(p.proname || '()', ', ' order by p.proname), '') into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_got <> 'app_owner(), calendar_push_now()' then
    raise exception 'FAIL 143: authenticated may execute these SECURITY DEFINER functions in public: [%]', v_got;
  end if;
  select string_agg(p.proname || '()', ', ' order by p.proname) into v_bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'FAIL 143: anon may execute these SECURITY DEFINER functions in public: %', v_bad;
  end if;
end $$;
