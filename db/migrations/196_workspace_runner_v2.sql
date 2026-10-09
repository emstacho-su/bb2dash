-- bb2dash :: db/migrations/196_workspace_runner_v2.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 19. Worker W-76.
--
-- WHY. Every turn of the new runner is a new CLI session whose context is rebuilt from the database:
-- the stored messages, the rolling summary, the About me note, the request's options, the planner and
-- the posted scores. The runner's login (`workspace_runner`, 142) holds no table, view or sequence
-- grant, so each of those reads, and each write of a trace, is a SECURITY DEFINER function here. After
-- this file the role executes ELEVEN such functions (142's five and these six) and still holds no
-- grant on any table, view or sequence.
--
-- WHAT
--   1. workspace_claim_v2       one question at a time across runners; closes the caller's own dead turn
--   2. workspace_turn_context   the request's context as one jsonb (11 keys)
--   3. workspace_turn_put       the turn's facts and its sources, ids and counts only
--   4. workspace_planner_feed   due work and posted scores, with the window and the course filter
--                               enforced inside the function (8 keys)
--   5. workspace_job_claim      a rolling-summary or a memory job, a 5-minute lease
--   6. workspace_job_finish     writes a rolling summary, or a remembered item (an upsert)
--   7. privileges, then a guard block that the role's list is the eleven
--
-- REFUSALS. A refusal a function raises itself carries SQLSTATE 22023 and a message that starts with
-- the function's name. Each of the first four refuses a request, and `workspace_job_finish` a job,
-- that the caller does not hold.
--
-- WHAT THE ROLE CAN READ AFTER THIS FILE, by function (brief 109, "The planner and grades feed"):
--   claim_v2          the claimed request's ids and the text of its question
--   turn_context      the request's options, the routine's instructions, each attachment's kind, id,
--                     title and state, the About me note, the rolling summary, the conversation's
--                     stored messages, the last auto tier, the course list
--   planner_feed      assignments and readings (title, type, due, points, in workload, status only,
--                     never the progress columns beyond status), posted scores of gradebook item
--                     columns (name, points, score, grade, released, exempt, submission status, date
--                     seen, the linked assignment's id)
--   job_claim         a job's kind, its conversation's id and the messages it is to summarise
--   turn_put, job_finish   ids and counts only
-- Course text is not on the list: the role cannot read bb_file_text, an upload's units or a vector.
-- The "graded so far" figure is not computed here: the feed carries scores as Blackboard shows them.
-- Nothing here writes planner state, a grade or a fact table.
--
-- THE WORKSPACE_CLAIM_V2 LOCK. It takes a transaction-level advisory lock, so two runners cannot claim
-- at once, and it returns nothing while any request is `claimed`: answers are held to one at a time
-- across runners. The key 1400910024 is new (180's is 1400910002). `workspace_claim(text)` stays as
-- it is, with its grant, so the old image works until the cut-over.
--
-- Constants shared with the runner (`workspace/src/config.ts`): a claim older than 10 minutes is stale;
-- a context holds 60 messages or 200,000 bytes; a feed holds 60 rows of each part; a source list
-- holds 40 rows; a job lease is 5 minutes; a conversation is quiet after 15 minutes.
--
-- Additive only: six new functions and their grants. Nothing existing changes. No password, key or
-- DSN is in this file.

do $$
begin
  if to_regprocedure('public.workspace_claim(text)') is null then
    raise exception '196: workspace_claim does not exist; apply 142_workspace_runner_role and 143 first';
  end if;
  if to_regclass('public.workspace_request_options') is null or to_regclass('public.workspace_routines') is null then
    raise exception '196: the options tables do not exist; apply 194_workspace_ask_options first';
  end if;
  if to_regclass('public.workspace_turns') is null or to_regclass('public.workspace_conversation_state') is null then
    raise exception '196: the turn-state tables do not exist; apply 195_workspace_turn_state first';
  end if;
  if to_regclass('public.workspace_documents') is null then
    raise exception '196: workspace_documents does not exist; apply 190_workspace_store first';
  end if;
  if to_regclass('public.v_work_items') is null or to_regclass('public.v_gradebook_latest') is null then
    raise exception '196: v_work_items or v_gradebook_latest does not exist';
  end if;
end $$;

-- =============================================================================================
-- 1. workspace_claim_v2
-- =============================================================================================
-- Every column the body reads is qualified by its table alias: the returns-table names are also
-- column names, so an unqualified one raises 42702 at call time (142's note).
create or replace function public.workspace_claim_v2(p_runner text)
  returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text)
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lock_key     constant bigint   := 1400910024;
  c_stale_after  constant interval := interval '10 minutes';
  c_orphan_after constant interval := interval '10 minutes';
  v_id      bigint;
  v_conv    uuid;
  v_message uuid;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_claim_v2: p_runner is required' using errcode = '22023';
  end if;

  -- One claim at a time, across runners, until this transaction ends.
  perform pg_advisory_xact_lock(c_lock_key);

  -- A runner asks for a claim only when it holds no turn, so a request still `claimed` under its own
  -- name is its own dead turn: closed at once, with its assistant row.
  with own as (
    update workspace_requests r
       set state = 'failed', error_code = 'stale_claim', finished_at = now()
     where r.state = 'claimed' and r.claimed_by = p_runner
    returning r.id
  )
  update workspace_messages m
     set error_code = 'stale_claim', finished = true
    from own o
   where m.request_id = o.id and m.role = 'assistant';

  -- 143's two sweeps: claims older than 10 minutes, and an assistant row a closed request left behind.
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

  update workspace_messages m
     set finished = true, error_code = r.error_code
    from workspace_requests r
   where r.id = m.request_id
     and m.role = 'assistant'
     and not m.finished
     and r.state in ('cancelled', 'failed', 'done')
     and r.finished_at < now() - c_orphan_after;

  -- Answers are held to one at a time: nothing while any request is claimed.
  if exists (select 1 from workspace_requests r where r.state = 'claimed') then
    return;
  end if;

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
    select v_id, v_conv, v_message, um.content
      from workspace_messages um
     where um.id = v_message;
end $$;

comment on function public.workspace_claim_v2(text) is
  'The new runner''s poll (196). Takes a transaction-level advisory lock; closes as failed / '
  'stale_claim any request still claimed under p_runner''s own name (its dead turn), with its '
  'assistant row; runs 143''s two sweeps; returns NOTHING while any request is claimed (answers are '
  'held to one at a time across runners); otherwise claims the oldest queued request (for update '
  'skip locked, attempts + 1) and returns (request_id, conversation_id, user_message_id, prompt). '
  'Everything else a turn needs comes from workspace_turn_context. workspace_claim(text) is '
  'unchanged. workspace_runner only.';

-- =============================================================================================
-- 2. workspace_turn_context
-- =============================================================================================
create or replace function public.workspace_turn_context(p_request_id bigint, p_runner text)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_messages constant integer := 60;
  c_max_bytes    constant integer := 200000;
  v_state    text;
  v_by       text;
  v_conv     uuid;
  v_message  uuid;
  v_asked_at timestamptz;
  v_options  jsonb;
  v_routine  jsonb;
  v_attach   jsonb;
  v_about    text;
  v_summary  text;
  v_through  timestamptz;
  v_msgs     jsonb;
  v_total    integer;
  v_kept     integer;
  v_tier     text;
  v_courses  jsonb;
begin
  select r.state, r.claimed_by, r.conversation_id, r.user_message_id
    into v_state, v_by, v_conv, v_message
    from workspace_requests r
   where r.id = p_request_id;
  if not found or v_state <> 'claimed' or v_by is distinct from p_runner then
    raise exception 'workspace_turn_context: request % is not claimed by %', p_request_id,
      coalesce(p_runner, 'null') using errcode = '22023';
  end if;
  select um.created_at into v_asked_at from workspace_messages um where um.id = v_message;

  -- The options. A request with no options row means: depth auto, plain, no routine, no scope.
  select jsonb_build_object('depth',             coalesce(o.depth, 'auto'),
                            'format',            coalesce(o.format, 'plain'),
                            'routine_id',        o.routine_id,
                            'course_display_id', o.course_display_id,
                            'course_ids',        to_jsonb(o.course_ids))
    into v_options
    from (select 1) one
    left join workspace_request_options o on o.request_id = p_request_id;

  select jsonb_build_object('id', rt.id, 'title', rt.title, 'instructions', rt.instructions)
    into v_routine
    from workspace_request_options o
    join workspace_routines rt on rt.id = o.routine_id
   where o.request_id = p_request_id;

  -- The attachments: a file's state is ready (it has a unit), no_text or missing; an upload's is its
  -- document's state, or missing once the document is gone.
  select coalesce(jsonb_agg(jsonb_build_object(
           'ord',   a.ord,
           'kind',  a.kind,
           'id',    case when a.kind = 'file' then a.file_id else a.document_id end,
           'title', case when a.kind = 'file' then f.file_name else d.title end,
           'state', case when a.kind = 'file'
                         then case when f.id is null then 'missing'
                                   when exists (select 1 from bb_file_text t where t.file_id = f.id) then 'ready'
                                   else 'no_text' end
                         else coalesce(d.state, 'missing') end)
         order by a.ord), '[]'::jsonb)
    into v_attach
    from workspace_request_attachments a
    left join bb_files f on a.kind = 'file' and f.id = a.file_id
    left join workspace_documents d on a.kind = 'upload' and d.id = a.document_id
   where a.request_id = p_request_id;

  select p.about_me into v_about from workspace_profile p where p.id = 1;
  select s.rolling_summary, s.summarised_through into v_summary, v_through
    from workspace_conversation_state s where s.conversation_id = v_conv;

  -- The stored messages before this request's own question and after the summary's through-point,
  -- newest first until 60 messages or 200,000 bytes are passed (the message that passes the limit is
  -- kept, so the newest is never lost), handed over oldest first. A stopped or failed answer carries
  -- its code.
  with eligible as (
    select m.id, m.role, m.content, m.created_at, m.error_code,
           row_number() over (order by m.created_at desc, m.id desc) as rn,
           coalesce(sum(octet_length(m.content)) over (order by m.created_at desc, m.id desc
                                                       rows between unbounded preceding and 1 preceding), 0) as bytes_before
      from workspace_messages m
     where m.conversation_id = v_conv
       and m.finished
       and m.id <> v_message
       and m.created_at <= v_asked_at
       and (v_through is null or m.created_at > v_through)
  ),
  kept as (
    select e.* from eligible e where e.rn <= c_max_messages and e.bytes_before < c_max_bytes
  )
  select (select count(*) from eligible)::integer,
         (select count(*) from kept)::integer,
         coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'role', k.role, 'content', k.content,
                                               'created_at', k.created_at, 'error_code', k.error_code)
                            order by k.created_at, k.id), '[]'::jsonb)
    into v_total, v_kept, v_msgs
    from kept k;

  -- The tier of the newest answer whose request had depth auto, or no options row.
  select a.tier into v_tier
    from workspace_messages a
    join workspace_requests rq on rq.id = a.request_id
    left join workspace_request_options o on o.request_id = rq.id
   where a.conversation_id = v_conv and a.role = 'assistant' and a.tier is not null
     and rq.id <> p_request_id
     and (o.request_id is null or o.depth = 'auto')
   order by a.created_at desc, a.id desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title_short,
                                               'display_id', coalesce(c.parent_course_id, c.id))
                            order by c.id), '[]'::jsonb)
    into v_courses
    from courses c;

  return jsonb_build_object(
    'options',            v_options,
    'routine',            v_routine,
    'attachments',        v_attach,
    'about_me',           coalesce(v_about, ''),
    'rolling_summary',    v_summary,
    'summarised_through', v_through,
    'messages',           v_msgs,
    'messages_left_out',  v_total - v_kept,
    'last_auto_tier',     v_tier,
    'courses',            v_courses,
    'today',              (now() at time zone 'America/New_York')::date);
end $$;

comment on function public.workspace_turn_context(bigint, text) is
  'The context of a claimed request as one jsonb (196), eleven keys: options {depth, format, '
  'routine_id, course_display_id, course_ids} (defaults when the request has no options row), '
  'routine {id, title, instructions} or null, attachments [{ord, kind, id, title, state}], about_me, '
  'rolling_summary and summarised_through, messages [{id, role, content, created_at, error_code}] '
  '(the conversation''s finished messages before the request''s own question and after the '
  'summary''s through-point, newest first until 60 messages or 200000 bytes are passed, handed over '
  'oldest first) and messages_left_out, last_auto_tier, courses [{id, title, display_id}] and today '
  '(New York). Refuses (22023) unless the request is claimed by p_runner. workspace_runner only.';

-- =============================================================================================
-- 3. workspace_turn_put
-- =============================================================================================
create or replace function public.workspace_turn_put(
    p_request_id bigint, p_runner text, p_facts jsonb, p_sources jsonb)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_max_sources constant integer := 40;
  v_state    text;
  v_by       text;
  v_conv     uuid;
  v_inserted boolean;
  v_ret_state text;
  v_found_n  integer;
  v_next     integer;
  v_kept     integer := 0;
  v_el       jsonb;
  v_kind     text;
  v_origin   text;
  v_file     bigint;
  v_text     bigint;
  v_doc      bigint;
  v_doc_text bigint;
  v_course   text;
  v_ukind    text;
  v_uno      integer;
  v_title    text;
  v_sim      double precision;
  v_dkind    text;
begin
  select r.state, r.claimed_by, r.conversation_id into v_state, v_by, v_conv
    from workspace_requests r where r.id = p_request_id;
  if not found or v_state <> 'claimed' or v_by is distinct from p_runner then
    raise exception 'workspace_turn_put: request % is not claimed by %', p_request_id,
      coalesce(p_runner, 'null') using errcode = '22023';
  end if;
  if p_facts is not null and jsonb_typeof(p_facts) <> 'object' then
    raise exception 'workspace_turn_put: p_facts must be a json object or null' using errcode = '22023';
  end if;
  if p_sources is not null and jsonb_typeof(p_sources) <> 'array' then
    raise exception 'workspace_turn_put: p_sources must be a json array or null' using errcode = '22023';
  end if;

  if p_facts is not null then
    -- The facts: a first call writes the row and sends the event `sources`; a second call replaces
    -- the facts and sends no second event.
    begin
      insert into workspace_turns as t
             (request_id, depth, tier, plan_state, retrieval_state, found_n, passages_n, memory_n,
              feed_rows, attachments, prompt_bytes, plan_ms, retrieval_ms, plan_cost_usd)
      values (p_request_id,
              p_facts->>'depth', p_facts->>'tier', p_facts->>'plan_state', p_facts->>'retrieval_state',
              coalesce((p_facts->>'found_n')::integer, 0), coalesce((p_facts->>'passages_n')::integer, 0),
              coalesce((p_facts->>'memory_n')::integer, 0), coalesce((p_facts->>'feed_rows')::integer, 0),
              case when jsonb_typeof(p_facts->'attachments') = 'array' then p_facts->'attachments'
                   else '[]'::jsonb end,
              (p_facts->>'prompt_bytes')::integer, (p_facts->>'plan_ms')::integer,
              (p_facts->>'retrieval_ms')::integer, (p_facts->>'plan_cost_usd')::numeric)
      on conflict (request_id) do update
         set depth = excluded.depth, tier = excluded.tier, plan_state = excluded.plan_state,
             retrieval_state = excluded.retrieval_state, found_n = excluded.found_n,
             passages_n = excluded.passages_n, memory_n = excluded.memory_n,
             feed_rows = excluded.feed_rows, attachments = excluded.attachments,
             prompt_bytes = excluded.prompt_bytes, plan_ms = excluded.plan_ms,
             retrieval_ms = excluded.retrieval_ms, plan_cost_usd = excluded.plan_cost_usd
      returning (t.xmax = 0), t.retrieval_state, t.found_n
        into v_inserted, v_ret_state, v_found_n;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'workspace_turn_put: a number in p_facts is not a number' using errcode = '22023';
    end;

    -- The sources of this call replace whatever was there.
    delete from workspace_sources s where s.request_id = p_request_id;
    v_next := 1;

    if v_inserted then
      perform realtime.send(
        jsonb_build_object('request_id', p_request_id, 'state', v_ret_state, 'found_n', v_found_n),
        'sources', 'workspace:' || v_conv::text, true);
    end if;
  else
    -- No facts: append after the rows that are there (the model''s own tool sources).
    select coalesce(max(s.ord), 0) + 1 into v_next from workspace_sources s where s.request_id = p_request_id;
  end if;

  for v_el in select e.value from jsonb_array_elements(coalesce(p_sources, '[]'::jsonb)) with ordinality as e(value, ord)
               order by e.ord
  loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'workspace_turn_put: each source is a json object' using errcode = '22023';
    end if;
    v_kind   := v_el->>'kind';
    v_origin := v_el->>'origin';
    if v_kind is null or v_kind not in ('material', 'upload', 'memory', 'feed')
       or v_origin is null or v_origin not in ('auto', 'attached', 'tool') then
      raise exception 'workspace_turn_put: a source needs a kind of material, upload, memory or feed and an origin of auto, attached or tool'
        using errcode = '22023';
    end if;
    -- A row past the 40th is cut, never refused (the shape above is checked for every row).
    exit when v_next > c_max_sources;

    v_file := null; v_text := null; v_doc := null; v_doc_text := null;
    v_course := null; v_ukind := null; v_uno := null; v_title := null;
    begin
      v_file     := case when jsonb_typeof(v_el->'file_id') = 'number' then (v_el->>'file_id')::bigint end;
      v_text     := case when jsonb_typeof(v_el->'text_id') = 'number' then (v_el->>'text_id')::bigint end;
      v_doc      := case when jsonb_typeof(v_el->'document_id') = 'number' then (v_el->>'document_id')::bigint end;
      v_doc_text := case when jsonb_typeof(v_el->'doc_text_id') = 'number' then (v_el->>'doc_text_id')::bigint end;
      v_sim      := case when jsonb_typeof(v_el->'similarity') = 'number'
                         then greatest(-1, least(1, (v_el->>'similarity')::double precision)) end;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'workspace_turn_put: an id in p_sources is not a whole number' using errcode = '22023';
    end;
    v_course := nullif(v_el->>'course_id', '');
    v_ukind  := case when jsonb_typeof(v_el->'unit_kind') = 'string' then left(v_el->>'unit_kind', 40) end;
    v_uno    := case when jsonb_typeof(v_el->'unit_no') = 'number' and (v_el->>'unit_no') ~ '^[0-9]{1,9}$'
                     then (v_el->>'unit_no')::integer end;
    v_title  := left(nullif(v_el->>'title', ''), 300);

    if v_kind = 'material' then
      if v_text is not null then
        -- A unit: the database fills the file, the course, the unit and the title from the unit's row.
        select t.file_id, f.course_id, t.unit_kind, t.unit_no, f.file_name
          into v_file, v_course, v_ukind, v_uno, v_title
          from bb_file_text t join bb_files f on f.id = t.file_id
         where t.id = v_text;
        if not found then continue; end if;
      elsif v_file is not null then
        -- An attached file read whole or in part: no unit.
        select f.course_id, f.file_name into v_course, v_title from bb_files f where f.id = v_file;
        if not found then continue; end if;
        v_ukind := null; v_uno := null;
      else
        continue;
      end if;
      v_doc := null; v_doc_text := null;
    elsif v_kind in ('upload', 'memory') then
      if v_doc_text is not null then
        select t.document_id, t.unit_kind, t.unit_no, d.course_id, d.title, d.kind
          into v_doc, v_ukind, v_uno, v_course, v_title, v_dkind
          from workspace_document_text t join workspace_documents d on d.id = t.document_id
         where t.id = v_doc_text;
        if not found or v_dkind <> v_kind then continue; end if;
      elsif v_doc is not null then
        select d.course_id, d.title, d.kind into v_course, v_title, v_dkind
          from workspace_documents d where d.id = v_doc;
        if not found or v_dkind <> v_kind then continue; end if;
        v_ukind := null; v_uno := null;
      else
        continue;
      end if;
      v_file := null; v_text := null;
    else
      -- feed: one row whenever the feed block is in the prompt; no ids.
      v_file := null; v_text := null; v_doc := null; v_doc_text := null;
      v_course := null; v_ukind := null; v_uno := null; v_sim := null;
    end if;

    insert into workspace_sources (request_id, ord, kind, origin, file_id, text_id, document_id, doc_text_id,
                                   course_id, unit_kind, unit_no, similarity, title)
    values (p_request_id, v_next, v_kind, v_origin, v_file, v_text, v_doc, v_doc_text,
            v_course, v_ukind, v_uno, v_sim, v_title);
    v_next := v_next + 1;
    v_kept := v_kept + 1;
  end loop;
  return v_kept;
end $$;

comment on function public.workspace_turn_put(bigint, text, jsonb, jsonb) is
  'Writes a turn''s trace (196). Called twice. First, before the answering turn, p_facts not null: '
  'writes the workspace_turns row (depth, tier, plan_state, retrieval_state, counts, attachments, '
  'sizes, timings, plan cost), replaces the request''s sources with p_sources and sends the Realtime '
  'event sources {request_id, state, found_n} on workspace:<conversation>. Second, before finish, '
  'p_facts null: appends p_sources (the model''s tool sources) after the rows that are there. A '
  'second call with p_facts replaces the facts and sends no second event. Rows keep array order. A '
  'row whose id is not found is dropped; a row past the 40th is cut, never refused; for a unit the '
  'function fills file_id, course_id, unit_kind, unit_no and title from the unit''s row. Returns the '
  'rows kept by this call. Ids, titles and counts only. Refuses (22023) unless the request is '
  'claimed by p_runner. workspace_runner only.';

-- =============================================================================================
-- 4. workspace_planner_feed
-- =============================================================================================
create or replace function public.workspace_planner_feed(
    p_request_id bigint, p_runner text, p_from date, p_to date)
  returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c_rows   constant integer := 60;
  c_before constant integer := 7;
  c_after  constant integer := 28;
  c_clamp  constant integer := 180;
  v_state  text;
  v_by     text;
  v_today  date := (now() at time zone 'America/New_York')::date;
  v_from   date;
  v_to     date;
  v_scope  text[];
  v_work   jsonb;
  v_work_n integer;
  v_scores jsonb;
  v_score_n integer;
begin
  select r.state, r.claimed_by into v_state, v_by from workspace_requests r where r.id = p_request_id;
  if not found or v_state <> 'claimed' or v_by is distinct from p_runner then
    raise exception 'workspace_planner_feed: request % is not claimed by %', p_request_id,
      coalesce(p_runner, 'null') using errcode = '22023';
  end if;

  -- The window is clamped inside the function to 180 days either side of today in New York; null means
  -- 7 days back to 28 days ahead.
  v_from := least(greatest(coalesce(p_from, v_today - c_before), v_today - c_clamp), v_today + c_clamp);
  v_to   := least(greatest(coalesce(p_to,   v_today + c_after),  v_today - c_clamp), v_today + c_clamp);
  if v_to < v_from then
    v_to := v_from;
  end if;

  -- The courses are the request's own stored scope. The function takes no course argument.
  select o.course_ids into v_scope from workspace_request_options o where o.request_id = p_request_id;

  -- Work: assignments AND readings (v_work_items has both arms). Dated rows in the window, nearest
  -- today first, then the undated rows.
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_kind', x.item_kind, 'item_id', x.item_id, 'course_id', x.course_id, 'title', x.title,
           'type', x.type, 'due_at', x.due_at, 'due_on', x.due_on, 'undated', x.undated,
           'status', x.status, 'points_possible', x.points_possible, 'in_workload', x.in_workload)
         order by x.rn) filter (where x.rn <= c_rows), '[]'::jsonb),
         greatest(count(*) - c_rows, 0)::integer
    into v_work, v_work_n
    from (select w.item_kind, w.item_id, w.course_id, w.title, w.type, w.due_at, w.due_on, w.undated,
                 w.status, w.points_possible, w.in_workload,
                 row_number() over (order by (w.due_on is null), abs(w.due_on - v_today), w.due_on,
                                             w.due_at, w.item_kind, w.item_id) as rn
            from v_work_items w
           where (w.due_on is null or w.due_on between v_from and v_to)
             and (v_scope is null or w.course_id = any (v_scope))) x;

  -- Scores: gradebook item columns with a score or a grade posted, newest seen first, not windowed.
  select coalesce(jsonb_agg(jsonb_build_object(
           'course_id', y.course_id, 'column_id', y.column_id, 'name', y.name, 'possible', y.possible,
           'display_score', y.display_score, 'display_grade', y.display_grade,
           'grades_released', y.grades_released, 'is_exempt', y.is_exempt,
           'submission_status', y.submission_status, 'seen_at', y.seen_at, 'assignment_id', y.assignment_id)
         order by y.rn) filter (where y.rn <= c_rows), '[]'::jsonb),
         greatest(count(*) - c_rows, 0)::integer
    into v_scores, v_score_n
    from (select g.course_id, g.column_id, g.name, g.possible, g.display_score, g.display_grade,
                 g.grades_released, g.is_exempt, g.submission_status, g.seen_at, g.assignment_id,
                 row_number() over (order by g.seen_at desc nulls last, g.id) as rn
            from v_gradebook_latest g
           where g.column_kind = 'item'
             and (g.display_score is not null or g.display_grade is not null)
             and (v_scope is null or g.course_id = any (v_scope))) y;

  return jsonb_build_object(
    'as_of',          now(),
    'from',           v_from,
    'to',             v_to,
    'work',           v_work,
    'scores',         v_scores,
    'work_more',      v_work_n,
    'scores_more',    v_score_n,
    'graded_so_far',  'on the Grades screen');
end $$;

comment on function public.workspace_planner_feed(bigint, text, date, date) is
  'The planner and the posted scores for a claimed request (196), one jsonb of eight keys: as_of, '
  'from and to (the window after the clamp), work, scores, work_more and scores_more (the rows past '
  'the 60 of each part), graded_so_far (a fixed marker: the figure is on the Grades screen). The '
  'window is clamped inside the function to 180 days either side of today in New York (null: 7 days '
  'back, 28 ahead) and the courses are the request''s own stored scope (none: all). work: rows of '
  'v_work_items (assignments and readings) whose due_on is in the window, nearest today first, then '
  'the undated rows; scores: gradebook item columns with a score or a grade posted, newest first, '
  'not windowed. Status only from the progress tables. No write. Refuses (22023) unless the '
  'request is claimed by p_runner. workspace_runner only.';

-- =============================================================================================
-- 5. workspace_job_claim
-- =============================================================================================
create or replace function public.workspace_job_claim(p_runner text, p_kinds text[])
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_lease        constant interval := interval '5 minutes';
  c_quiet        constant interval := interval '15 minutes';
  c_roll_keep    constant integer  := 14000;
  c_roll_due     constant integer  := 12000;
  c_memory_bytes constant integer  := 60000;
  c_max_failures constant integer  := 3;
  v_conv    uuid;
  v_since   timestamptz;
  v_prev    text;
  v_msgs    jsonb;
  v_through timestamptz;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_job_claim: p_runner is required' using errcode = '22023';
  end if;
  if p_kinds is null or exists (select 1 from unnest(p_kinds) k where k is null or k not in ('rolling', 'memory')) then
    raise exception 'workspace_job_claim: p_kinds holds rolling and memory only' using errcode = '22023';
  end if;
  if cardinality(p_kinds) = 0 then
    return null;
  end if;

  -- The first call that asks for memory jobs stamps the time, once. Nothing said before it is remembered.
  if 'memory' = any (p_kinds) then
    update workspace_profile p set memory_since = now() where p.id = 1 and p.memory_since is null;
  end if;

  -- No job while any request is queued or claimed.
  if exists (select 1 from workspace_requests r where r.state in ('queued', 'claimed')) then
    return null;
  end if;

  -- ---- rolling: the messages older than the newest 14,000 bytes and newer than the through-point,
  --      when they pass 12,000 bytes. Not held to memory_since.
  if 'rolling' = any (p_kinds) then
    select q.cid into v_conv
      from (select o.cid, max(o.created_at) as last_older, sum(octet_length(o.content)) as bytes
              from (select m.conversation_id as cid, m.created_at, m.content,
                           sum(octet_length(m.content)) over (partition by m.conversation_id
                                                              order by m.created_at desc, m.id desc) as cum_incl
                      from workspace_messages m
                      left join workspace_conversation_state s on s.conversation_id = m.conversation_id
                     where m.finished and m.content <> ''
                       and (s.summarised_through is null or m.created_at > s.summarised_through)) o
             where o.cum_incl > c_roll_keep
             group by o.cid) q
      left join workspace_conversation_state s on s.conversation_id = q.cid
     where q.bytes > c_roll_due
       and (s.conversation_id is null
            or ((s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease)
                and (s.job_failures < c_max_failures
                     or exists (select 1 from workspace_messages n
                                 where n.conversation_id = q.cid and n.finished
                                   and n.created_at > coalesce(s.job_claimed_at, '-infinity')))))
     order by q.last_older, q.cid
     limit 1;

    if v_conv is not null then
      insert into workspace_conversation_state (conversation_id) values (v_conv) on conflict do nothing;
      update workspace_conversation_state s
         set job_claimed_by = p_runner, job_claimed_at = now()
       where s.conversation_id = v_conv
         and (s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease)
      returning s.rolling_summary, s.summarised_through into v_prev, v_since;
      if found then
        select coalesce(jsonb_agg(jsonb_build_object('role', o.role, 'content', o.content,
                                                     'created_at', o.created_at)
                                  order by o.created_at, o.id), '[]'::jsonb),
               max(o.created_at)
          into v_msgs, v_through
          from (select m.id, m.role, m.content, m.created_at,
                       sum(octet_length(m.content)) over (order by m.created_at desc, m.id desc) as cum_incl
                  from workspace_messages m
                 where m.conversation_id = v_conv and m.finished and m.content <> ''
                   and (v_since is null or m.created_at > v_since)) o
         where o.cum_incl > c_roll_keep;
        return jsonb_build_object('kind', 'rolling', 'conversation_id', v_conv, 'through', v_through,
                                  'previous_summary', v_prev, 'messages', v_msgs);
      end if;
    end if;
  end if;

  -- ---- memory: a conversation whose last finished answer is later than memory_since, quiet for 15
  --      minutes, not archived, not opted out, and not yet remembered up to that answer.
  if 'memory' = any (p_kinds) then
    select c.id into v_conv
      from workspace_conversations c
      join workspace_profile p on p.id = 1 and p.memory_since is not null
      left join workspace_conversation_state s on s.conversation_id = c.id
     cross join lateral (select max(m.created_at) as last_answer
                           from workspace_messages m
                          where m.conversation_id = c.id and m.role = 'assistant'
                            and m.finished and m.error_code is null and m.content <> '') la
     where not c.archived
       and not coalesce(s.memory_opt_out, false)
       and la.last_answer is not null
       and la.last_answer > p.memory_since
       and la.last_answer <= now() - c_quiet
       and (s.memory_written_at is null or la.last_answer > s.memory_written_at)
       and (s.conversation_id is null
            or ((s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease)
                and (s.job_failures < c_max_failures
                     or exists (select 1 from workspace_messages n
                                 where n.conversation_id = c.id and n.finished
                                   and n.created_at > coalesce(s.job_claimed_at, '-infinity')))))
     order by la.last_answer, c.id
     limit 1;

    if v_conv is not null then
      insert into workspace_conversation_state (conversation_id) values (v_conv) on conflict do nothing;
      update workspace_conversation_state s
         set job_claimed_by = p_runner, job_claimed_at = now()
       where s.conversation_id = v_conv
         and (s.job_claimed_by is null or s.job_claimed_at <= now() - c_lease);
      if found then
        -- The conversation's finished messages, the newest 60,000 bytes at most (the newest is always
        -- kept), oldest first.
        select coalesce(jsonb_agg(jsonb_build_object('role', o.role, 'content', o.content,
                                                     'created_at', o.created_at)
                                  order by o.created_at, o.id), '[]'::jsonb),
               max(o.created_at)
          into v_msgs, v_through
          from (select m.id, m.role, m.content, m.created_at,
                       row_number() over (order by m.created_at desc, m.id desc) as rn,
                       sum(octet_length(m.content)) over (order by m.created_at desc, m.id desc) as cum_incl
                  from workspace_messages m
                 where m.conversation_id = v_conv and m.finished and m.content <> '') o
         where o.rn = 1 or o.cum_incl <= c_memory_bytes;
        return jsonb_build_object('kind', 'memory', 'conversation_id', v_conv, 'through', v_through,
                                  'previous_summary', null, 'messages', v_msgs);
      end if;
    end if;
  end if;

  return null;
end $$;

comment on function public.workspace_job_claim(text, text[]) is
  'Hands the idle runner at most one background job (196), with a 5-minute lease; null when there is '
  'none, and null while any request is queued or claimed. p_kinds holds rolling and memory. rolling: '
  'a conversation whose finished messages older than the newest 14000 bytes and newer than its '
  'summarised_through pass 12000 bytes; messages are those older ones, oldest first, previous_summary '
  'the rolling summary so far, through the created_at of the last. memory: a conversation not '
  'archived and not opted out whose last finished answer is later than workspace_profile.memory_since '
  'and older than 15 minutes and not yet remembered; messages are its finished messages, the newest '
  '60000 bytes at most, oldest first. The FIRST call that asks for memory stamps memory_since, once, '
  'and no later call moves it. Three failures park a conversation''s jobs until newer messages '
  'arrive. Returns {kind, conversation_id, through, previous_summary, messages [{role, content, '
  'created_at}]}. workspace_runner only.';

-- =============================================================================================
-- 6. workspace_job_finish
-- =============================================================================================
create or replace function public.workspace_job_finish(
    p_runner text, p_conversation_id uuid, p_kind text, p_outcome text, p_summary text,
    p_through timestamptz)
  returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_held     boolean;
  v_opt_out  boolean;
  v_old      text;
  v_doc      bigint;
  v_unit_text text;
  v_title    text;
  v_stored   boolean := false;
  v_doc_out  bigint;
  v_summary  text := btrim(coalesce(p_summary, ''));
  v_limit    integer;
begin
  if p_runner is null or btrim(p_runner) = '' then
    raise exception 'workspace_job_finish: p_runner is required' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('rolling', 'memory') then
    raise exception 'workspace_job_finish: p_kind is rolling or memory, not %', coalesce(p_kind, 'null')
      using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('done', 'failed', 'released') then
    raise exception 'workspace_job_finish: p_outcome is done, failed or released, not %', coalesce(p_outcome, 'null')
      using errcode = '22023';
  end if;

  select s.job_claimed_by = p_runner, s.memory_opt_out, s.rolling_summary
    into v_held, v_opt_out, v_old
    from workspace_conversation_state s
   where s.conversation_id = p_conversation_id
     for update;
  if not found or v_held is not true then
    raise exception 'workspace_job_finish: the job on conversation % is not held by %', p_conversation_id,
      p_runner using errcode = '22023';
  end if;

  if p_outcome = 'failed' then
    update workspace_conversation_state s
       set job_failures = s.job_failures + 1, job_claimed_by = null
     where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', false, 'document_id', null);
  elsif p_outcome = 'released' then
    update workspace_conversation_state s set job_claimed_by = null where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', false, 'document_id', null);
  end if;

  -- done
  if v_summary = '' then
    raise exception 'workspace_job_finish: a done job needs its summary' using errcode = '22023';
  end if;
  if p_through is null then
    raise exception 'workspace_job_finish: a done job needs p_through' using errcode = '22023';
  end if;
  v_limit := case p_kind when 'rolling' then 3000 else 1000 end;
  if char_length(v_summary) > v_limit then
    raise exception 'workspace_job_finish: a % summary is at most % characters, not %', p_kind,
      v_limit, char_length(v_summary) using errcode = '22023';
  end if;

  if p_kind = 'rolling' then
    v_stored := v_old is distinct from v_summary;
    update workspace_conversation_state s
       set rolling_summary = v_summary,
           summarised_through = greatest(coalesce(s.summarised_through, p_through), p_through),
           job_failures = 0, job_claimed_by = null
     where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', v_stored, 'document_id', null);
  end if;

  -- memory: an upsert on the conversation. An opted-out conversation writes nothing.
  if v_opt_out then
    update workspace_conversation_state s set job_claimed_by = null where s.conversation_id = p_conversation_id;
    return jsonb_build_object('stored', false, 'document_id', null);
  end if;

  select left(c.title, 200) into v_title from workspace_conversations c where c.id = p_conversation_id;
  select d.id into v_doc
    from workspace_documents d
   where d.kind = 'memory' and d.conversation_id = p_conversation_id
     for update;
  if not found then
    insert into workspace_documents (kind, title, conversation_id, state)
    values ('memory', coalesce(v_title, 'Remembered conversation'), p_conversation_id, 'text_ready')
    returning id into v_doc;
    insert into workspace_document_text (document_id, unit_kind, unit_no, text)
    values (v_doc, 'doc', 1, v_summary);
    v_stored := true;
  else
    select t.text into v_unit_text
      from workspace_document_text t
     where t.document_id = v_doc and t.unit_kind = 'doc' and t.unit_no = 1;
    if found and v_unit_text = v_summary then
      -- The same summary: nothing is written and no state moves.
      v_stored := false;
    else
      -- A new summary: the old unit and its vectors go, a new unit comes (so a late embed of the old
      -- text finds no unit), and the document goes back to the state the ingest claim takes, with no
      -- try used, whatever state it was in.
      delete from workspace_text_embeddings e
       using workspace_document_text t
       where t.document_id = v_doc and e.text_id = t.id;
      delete from workspace_document_text t where t.document_id = v_doc;
      insert into workspace_document_text (document_id, unit_kind, unit_no, text)
      values (v_doc, 'doc', 1, v_summary);
      update workspace_documents d
         set state = 'text_ready', attempts = 0, error_code = null, claimed_by = null, claimed_at = null,
             title = coalesce(v_title, d.title)
       where d.id = v_doc;
      v_stored := true;
    end if;
  end if;

  update workspace_conversation_state s
     set memory_written_at = greatest(coalesce(s.memory_written_at, p_through), p_through),
         job_failures = 0, job_claimed_by = null
   where s.conversation_id = p_conversation_id;
  return jsonb_build_object('stored', v_stored, 'document_id', v_doc);
end $$;

comment on function public.workspace_job_finish(text, uuid, text, text, text, timestamptz) is
  'Ends a background job (196). p_outcome done: p_summary is required (3000 characters at most for '
  'rolling, 1000 for memory) and p_through. rolling stores the summary and moves summarised_through '
  'forward; memory is an UPSERT on the conversation: no memory document yet -> one document and one '
  'unit, state text_ready; the same summary as the stored one -> nothing is written and no state '
  'moves; a new summary -> the unit''s text is replaced, its vectors are removed, embedded_at is '
  'null and the document goes back to text_ready with attempts 0, whatever state it was in. An '
  'opted-out conversation writes nothing. failed: job_failures + 1. released: a claim cut the job '
  'short, no failure is counted. Every outcome frees the lease. Returns {stored, document_id} '
  '(stored is false for the same summary; document_id is the remembered item''s, null for rolling). '
  'Refuses (22023) a job p_runner does not hold. workspace_runner only.';

-- =============================================================================================
-- 7. Privileges and the guard
-- =============================================================================================
revoke all on function
  public.workspace_claim_v2(text),
  public.workspace_turn_context(bigint, text),
  public.workspace_turn_put(bigint, text, jsonb, jsonb),
  public.workspace_planner_feed(bigint, text, date, date),
  public.workspace_job_claim(text, text[]),
  public.workspace_job_finish(text, uuid, text, text, text, timestamptz)
from public, anon, authenticated, service_role;

grant execute on function
  public.workspace_claim_v2(text),
  public.workspace_turn_context(bigint, text),
  public.workspace_turn_put(bigint, text, jsonb, jsonb),
  public.workspace_planner_feed(bigint, text, date, date),
  public.workspace_job_claim(text, text[]),
  public.workspace_job_finish(text, uuid, text, text, text, timestamptz)
to workspace_runner;

do $$
declare
  v_got text;
  v_bad text;
begin
  -- (a) The eleven are exactly the SECURITY DEFINER functions workspace_runner can execute.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_finish,workspace_heartbeat,'
     'workspace_job_claim,workspace_job_finish,workspace_planner_feed,workspace_stream,'
     'workspace_turn_context,workspace_turn_put' then
    raise exception 'FAIL 196: workspace_runner executes SECURITY DEFINER functions %, expected the eleven', v_got;
  end if;

  -- (b) Still no table, view or sequence privilege in public, on a relation or on a column.
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f', 'S')
     and (case when c.relkind = 'S'
               then has_sequence_privilege('workspace_runner', c.oid, 'usage,select,update')
               else has_table_privilege('workspace_runner', c.oid,
                                        'select,insert,update,delete,truncate,references,trigger')
                    or has_any_column_privilege('workspace_runner', c.oid, 'select,insert,update,references')
          end);
  if v_bad is not null then
    raise exception 'FAIL 196: workspace_runner holds a privilege on %', v_bad;
  end if;

  -- (c) None of the six is executable by anon, authenticated, service_role or PUBLIC.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = any (array['workspace_claim_v2', 'workspace_turn_context', 'workspace_turn_put',
                                'workspace_planner_feed', 'workspace_job_claim', 'workspace_job_finish'])
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('service_role', p.oid, 'execute')
          or has_function_privilege('public', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'FAIL 196: anon, authenticated, service_role or PUBLIC can execute %', v_bad;
  end if;

  -- (d) The six are SECURITY DEFINER with a pinned path.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = any (array['workspace_claim_v2', 'workspace_turn_context', 'workspace_turn_put',
                                'workspace_planner_feed', 'workspace_job_claim', 'workspace_job_finish'])
     and (not p.prosecdef or not coalesce(p.proconfig, '{}') @> array['search_path=public, pg_temp']);
  if v_bad is not null then
    raise exception 'FAIL 196: not security definer, or search_path not pinned: %', v_bad;
  end if;
end $$;
