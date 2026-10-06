-- bb2dash :: db/migrations/142_workspace_runner_role.sql
-- Phase 21 (docs/planning/sprint-2/briefs/102_PHASE21_workspace.md), task 6 (P-85, P-88). Worker W-63.
--
-- WHY. The Workspace's container process answers questions with the `claude` CLI. It cannot sign
-- in as the owner, and a service key in its own queue connection would let it write anything. So,
-- as the sync runner did in 091, it gets its own login role, `workspace_runner`, with no table,
-- view or sequence grant at all: it reaches the queue only through the five SECURITY DEFINER
-- functions below. That login cannot read `assignment_progress`, `reading_progress` or any fact
-- table, which is what "read-only v1" rests on for the runner's own connection.
--
-- THE FILE CARRIES NO PASSWORD, EVER. Stack sets it out of band, so this file stays byte-identical
-- to what prod recorded. The role connects through the session pooler (port 5432, user
-- `workspace_runner.goultdzqcavefcgnifdy`), never the transaction pooler on 6543.
--
-- WHAT
--   1. role `workspace_runner` (login, noinherit, nobypassrls), statement_timeout 15s, usage on
--      schema `public`
--   2. workspace_claim      the stale sweep, then the oldest queued request with its history
--   3. workspace_begin      the assistant message, unfinished
--   4. workspace_stream     one text delta to the page; false once the request is no longer claimed
--   5. workspace_finish     the answer, the request's end state, the session id, the done broadcast
--   6. workspace_heartbeat  the one heartbeat row
--   7. privileges: each function revoked from public, anon, authenticated and service_role, then
--      granted to workspace_runner; `db_test_runner` holds the role WITH INHERIT FALSE, so the
--      141 and 142 units can `set local role workspace_runner`
--   8. a guard block
--
-- REFUSALS. A refusal a function raises itself carries SQLSTATE 22023 and a message that starts
-- with the function's name.
--
-- THE BROADCASTS. `realtime.send` is SECURITY INVOKER, so inside these functions it inserts as
-- `postgres`, which bypasses row security on `realtime.messages`; a client cannot send (141 gives
-- it no insert policy). It catches its own insert error as a warning: on a day with no partition
-- of `realtime.messages` a send stores nothing and raises nothing. A missed broadcast costs live
-- text, never the answer, because the stored row is the record.
--
-- THE GUARD STOPS AT SCHEMA `public` (091's guard (b) form). What PUBLIC holds on pg_net's schema
-- (`net.http_post` and its two tables) is the same for every login, `sync_runner` included, and
-- `postgres` cannot revoke it, so a guard written across all schemas would abort this migration.
--
-- Constants shared with the runner (`workspace/src/config.ts`): a claim older than 10 minutes is
-- stale (the runner kills its own turn at 8); the history is the last 20 messages; a delta is at
-- most 16000 characters; content is cut at 100000; tool calls at 20.
--
-- Additive only: no drop, no rename, no existing function body changed.

do $$
begin
  if to_regclass('public.workspace_requests') is null then
    raise exception '142: table workspace_requests does not exist; apply 140_workspace_tables first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '142: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
end $$;

-- =============================================================================================
-- 1. The role
-- =============================================================================================
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'workspace_runner') then
    raise notice 'workspace_runner already exists; its settings and grants are re-applied below';
  else
    create role workspace_runner login noinherit nobypassrls;
  end if;
end $$;

-- One call of the runner is one short statement; a statement that hangs must not hold the queue.
alter role workspace_runner set statement_timeout = '15s';

comment on role workspace_runner is
  'The Workspace runner (Phase 21, migration 142). No table, view or sequence grant: it reaches the '
  'queue only through the five SECURITY DEFINER workspace_* functions of 142. Password set out of '
  'band; connects through the session pooler (5432).';

grant usage on schema public to workspace_runner;

-- =============================================================================================
-- 2. workspace_claim
-- =============================================================================================
-- Every column the body reads is qualified by its table alias, and every result column is
-- aliased: the returns-table names are also column names, so an unqualified one raises 42702 at
-- call time, which no dry run of the file alone shows.
create or replace function public.workspace_claim(p_runner text)
  returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text,
                 claude_session_id text, prior_tier text, history jsonb)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_stale_after constant interval := interval '10 minutes';
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
  'The Workspace runner''s poll (142). Sweeps claims older than 10 minutes to failed / stale_claim '
  '(on the request row and on its assistant row), then claims the oldest queued request with for '
  'update skip locked, attempts + 1; a queued request does not expire. Returns at most one row: '
  'the prompt, the conversation''s claude_session_id, prior_tier (the tier of its latest assistant '
  'message, null when none) and history, the last 20 messages before the request''s own user '
  'message, oldest first, as [{role, content}] ([] for a first question). Does not stamp the '
  'heartbeat. workspace_runner only.';

-- =============================================================================================
-- 3. workspace_begin
-- =============================================================================================
create or replace function public.workspace_begin(
    p_request_id bigint, p_tier text, p_provider text, p_model text)
  returns uuid
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_state   text;
  v_conv    uuid;
  v_message uuid;
  v_id      uuid;
begin
  if p_tier is null or p_tier not in ('low', 'mid', 'high') then
    raise exception 'workspace_begin: tier must be low, mid or high, not %', coalesce(p_tier, 'null')
      using errcode = '22023';
  end if;
  if p_provider is null or p_provider not in ('claude-cli', 'ollama', 'frontier-api') then
    raise exception 'workspace_begin: provider must be claude-cli, ollama or frontier-api, not %',
      coalesce(p_provider, 'null') using errcode = '22023';
  end if;

  select r.state, r.conversation_id, r.user_message_id
    into v_state, v_conv, v_message
    from workspace_requests r
   where r.id = p_request_id
     for update;
  if not found or v_state <> 'claimed' then
    raise exception 'workspace_begin: request % is not claimed (it is %)',
      p_request_id, coalesce(v_state, 'missing') using errcode = '22023';
  end if;
  -- One answer per request: the page joins a request to its assistant message by request_id.
  if exists (select 1 from workspace_messages m
              where m.request_id = p_request_id and m.role = 'assistant') then
    raise exception 'workspace_begin: request % already has its assistant message', p_request_id
      using errcode = '22023';
  end if;

  insert into workspace_messages (conversation_id, parent_message_id, role, request_id, tier,
                                  provider, model, finished)
  values (v_conv, v_message, 'assistant', p_request_id, p_tier, p_provider, p_model, false)
  returning id into v_id;
  return v_id;
end $$;

comment on function public.workspace_begin(bigint, text, text, text) is
  'Opens the answer to a claimed request (142): inserts the assistant message, unfinished, with '
  'parent = the user message, request_id = the request, the tier, the provider and p_model (the '
  'alias --model receives), and returns its id. Refuses a request that is not claimed, a second '
  'call for one request, and a tier or provider off its list (22023). workspace_runner only.';

-- =============================================================================================
-- 4. workspace_stream
-- =============================================================================================
create or replace function public.workspace_stream(p_request_id bigint, p_seq integer, p_delta text)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_delta_max constant integer := 16000;
  v_state     text;
  v_conv      uuid;
begin
  if char_length(p_delta) > c_delta_max then
    raise exception 'workspace_stream: a delta is at most % characters, not % (the runner splits first)',
      c_delta_max, char_length(p_delta) using errcode = '22023';
  end if;

  select r.state, r.conversation_id into v_state, v_conv
    from workspace_requests r
   where r.id = p_request_id;
  if not found or v_state <> 'claimed' then
    return false;   -- Stop was pressed, or the claim is gone: nothing is sent
  end if;

  -- An empty delta sends nothing and consumes no seq: it only answers "still claimed".
  if p_delta is null or p_delta = '' then
    return true;
  end if;

  if p_seq is null or p_seq < 1 then
    raise exception 'workspace_stream: seq starts at 1, not %', coalesce(p_seq::text, 'null')
      using errcode = '22023';
  end if;

  perform realtime.send(
    jsonb_build_object('request_id', p_request_id, 'seq', p_seq, 'delta', p_delta),
    'delta', 'workspace:' || v_conv::text, true);
  return true;
end $$;

comment on function public.workspace_stream(bigint, integer, text) is
  'Sends one text delta of a claimed request to the page (142): realtime.send of {request_id, seq, '
  'delta}, event delta, on the private topic workspace:<conversation uuid>. Returns false, sending '
  'nothing, once the request is no longer claimed (Stop). An empty delta sends nothing and consumes '
  'no seq: it only answers whether the request is still claimed. Raises 22023 for a delta over '
  '16000 characters (the runner splits first) and for a seq below 1. workspace_runner only.';

-- =============================================================================================
-- 5. workspace_finish
-- =============================================================================================
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
  'Closes a Workspace turn (142). p_state is done or failed; p_error_code is null or one of the '
  'eight codes. A request already cancelled stays cancelled and its message gets cancelled; any '
  'other request is set to p_state with finished_at stamped and p_error_code on the request row as '
  'well as on the message. Writes the assistant message: content cut at 100000 characters, '
  'p_tool_calls cut to its first 20 elements (never refused for length), cost_usd (the CLI''s '
  'total_cost_usd as reported), duration_ms, p_model over the alias when it is not null, finished. '
  'Stamps the conversation''s claude_session_id (null when p_claude_session_id is not uuid-shaped) '
  'and updated_at, and sends done {request_id, message_id, state} on workspace:<conversation uuid>. '
  'workspace_runner only.';

-- =============================================================================================
-- 6. workspace_heartbeat
-- =============================================================================================
create or replace function public.workspace_heartbeat(p_runner text)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_heartbeat: p_runner is required' using errcode = '22023';
  end if;
  insert into workspace_runner_heartbeat as h (id, polled_at, runner)
  values (1, now(), p_runner)
  on conflict (id) do update
     set polled_at = excluded.polled_at, runner = excluded.runner;
end $$;

comment on function public.workspace_heartbeat(text) is
  'The Workspace runner''s heartbeat (142): upserts the one row of workspace_runner_heartbeat (id = 1) '
  'with polled_at = now() and runner = p_runner. The runner calls it every 30 s on its own timer, '
  'during turns too; the page calls the service offline when polled_at is null or older than 120 s. '
  'workspace_runner only.';

-- =============================================================================================
-- 7. Privileges. On prod a new function in public is born executable by all four.
-- =============================================================================================
revoke all on function
  public.workspace_claim(text),
  public.workspace_begin(bigint, text, text, text),
  public.workspace_stream(bigint, integer, text),
  public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text),
  public.workspace_heartbeat(text)
from public, anon, authenticated, service_role;

grant execute on function
  public.workspace_claim(text),
  public.workspace_begin(bigint, text, text, text),
  public.workspace_stream(bigint, integer, text),
  public.workspace_finish(bigint, text, text, jsonb, text, numeric, integer, text, text),
  public.workspace_heartbeat(text)
to workspace_runner;

-- The suite calls each function the way the runner does, as workspace_runner, inside its own
-- rolled-back transaction: brief 95's pattern for anon and authenticated, 094's for sync_runner.
-- No table privilege goes with it.
grant workspace_runner to db_test_runner with inherit false;

-- =============================================================================================
-- 8. Guard (scoped to schema public)
-- =============================================================================================
do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The five are exactly the SECURITY DEFINER functions workspace_runner can execute.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_finish,workspace_heartbeat,workspace_stream' then
    raise exception 'FAIL 142: workspace_runner executes SECURITY DEFINER functions %, expected the five', v_got;
  end if;

  -- (b) No table, view or sequence privilege in public.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('workspace_runner', c.oid, 'usage,select,update')
               else has_table_privilege('workspace_runner', c.oid,
                                        'select,insert,update,delete,truncate,references,trigger')
          end);
  if v_bad is not null then
    raise exception 'FAIL 142: workspace_runner holds a privilege on %', v_bad;
  end if;

  -- (c) None of the five is executable by anon, authenticated, service_role or PUBLIC.
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
    raise exception 'FAIL 142: anon, authenticated, service_role or PUBLIC can execute %', v_bad;
  end if;

  -- (d) The role is granted to db_test_runner only (inherit false, set true). The one other row
  --     allowed is the one PostgreSQL 16+ gives a role's creator: member postgres, admin option,
  --     neither inherit nor set.
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'workspace_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.admin_option and not m.inherit_option and m.set_option) then
    raise exception 'FAIL 142: db_test_runner does not hold workspace_runner with inherit false and set true';
  end if;
  select string_agg(m.member::regrole::text, ', ' order by m.member::regrole::text) into v_bad
    from pg_auth_members m
   where m.roleid = 'workspace_runner'::regrole
     and not (m.member = 'db_test_runner'::regrole
              and not m.admin_option and not m.inherit_option and m.set_option)
     and not (m.member = 'postgres'::regrole
              and m.admin_option and not m.inherit_option and not m.set_option);
  if v_bad is not null then
    raise exception 'FAIL 142: workspace_runner is granted to %', v_bad;
  end if;

  -- (e) The role's attributes and its one setting.
  if exists (select 1 from pg_roles
              where rolname = 'workspace_runner'
                and (not rolcanlogin or rolinherit or rolbypassrls or rolsuper or rolcreaterole
                     or rolcreatedb or rolreplication)) then
    raise exception 'FAIL 142: workspace_runner is not login, noinherit, nobypassrls and nothing more';
  end if;
  if not exists (select 1 from pg_roles
                  where rolname = 'workspace_runner'
                    and coalesce(rolconfig, '{}') @> array['statement_timeout=15s']) then
    raise exception 'FAIL 142: workspace_runner has no statement_timeout = 15s';
  end if;
end $$;
