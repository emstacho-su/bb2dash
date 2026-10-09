-- bb2dash :: db/tests/phase24_196_runner_v2.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 19, and the
-- store's memory write (answer 17, point 4). Worker W-76.
-- Tests migration 196: the runner's six new SECURITY DEFINER functions (`workspace_claim_v2`,
-- `workspace_turn_context`, `workspace_turn_put`, `workspace_planner_feed`, `workspace_job_claim`,
-- `workspace_job_finish`) and the role's list of eleven.
--
--   0. installed, shaped and fenced: the eleven, no table grant, nobody else executes the six, a
--      select on assignment_progress or reading_progress is still 42501
--   1. claim_v2: one question at a time across runners, the caller's own dead turn closed at once, the
--      10-minute sweep, a fresh claim of another runner blocks
--   2. turn_context: exactly the eleven keys, the options and defaults, the routine, the attachments
--      and their states, the messages (finished, after the through-point, capped at 60), the last auto
--      tier; 22023 for a request not claimed by the caller
--   3. turn_put: the facts, the sources in order, ids that do not exist dropped, the unit's own row
--      filling the tool source, the 40-row cut, the append, 22023
--   4. planner_feed: exactly the eight keys, a window of 400 days clamped to 180, a scope that leaves
--      out another course, only posted scores, the counts agree with the views, the order
--   5. job_claim / job_finish: the first memory call stamps memory_since and no later call moves it;
--      who is eligible (answer older than the stamp, archived, opted out, not yet quiet); a rolling
--      job and its through-point; lease, release, three failures; the memory upsert (a first write,
--      the same summary, a new summary from indexed and from failed alike)
--
-- Every call is made under `set local role workspace_runner` (142's membership), the way the runner
-- calls it; setup rows are written as the session role. The unit first parks, INSIDE this
-- transaction only, every request, every conversation's memory and every job lease that really
-- exists, so a claim cannot meet a row that is not its own. All data is synthetic. Nothing is
-- committed. The planner feed is read over whatever real rows the views hold (it checks shape,
-- order, counts and filters, never a value).
--
-- AN `execute_sql` DRY RUN of this unit adds, inside its own transaction and before the unit,
--     grant workspace_runner to postgres with inherit false, set true;
-- (142's note). RUN IT: `node scripts/db-test.mjs --only phase24_196_runner_v2.sql`.

begin;

create function pg_temp.w76_try(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  v text;
  n integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := 'ok:' || n;
  exception when others then
    v := sqlstate;
  end;
  reset role;
  return v;
end $$;

create function pg_temp.w76_call(p_role text, p_sub text, p_expr text) returns jsonb
  language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  execute 'select ' || p_expr into v;
  reset role;
  return v;
end $$;

-- A conversation with its first question and a request in the given state, created p_age ago.
create function pg_temp.w76_req(p_title text, p_state text, p_age interval, p_by text default null) returns bigint
  language plpgsql as $$
declare
  v_conv uuid; v_msg uuid; v_req bigint;
begin
  insert into workspace_conversations (title) values (p_title) returning id into v_conv;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  values (v_conv, 'user', 'question ' || p_title, true, now() - p_age) returning id into v_msg;
  insert into workspace_requests (conversation_id, user_message_id, state, claimed_by, claimed_at, created_at,
                                  finished_at)
  values (v_conv, v_msg, p_state, p_by, case when p_state = 'claimed' then now() - p_age end, now() - p_age,
          case when p_state in ('done', 'failed', 'cancelled') then now() - p_age end)
  returning id into v_req;
  return v_req;
end $$;

-- One message of a conversation at a given age.
create function pg_temp.w76_msg(p_conv uuid, p_role text, p_content text, p_age interval,
                                p_finished boolean default true, p_code text default null,
                                p_tier text default null, p_req bigint default null) returns uuid
  language plpgsql as $$
declare
  v_id uuid;
begin
  insert into workspace_messages (conversation_id, role, content, finished, error_code, tier, request_id, created_at)
  values (p_conv, p_role, p_content, p_finished, p_code, p_tier, p_req, now() - p_age) returning id into v_id;
  return v_id;
end $$;

create function pg_temp.w76_basis(p_n integer) returns extensions.vector
  language sql immutable as $$
  select ('[' || array_to_string(array(select case when i = p_n then 1 else 0 end
                                         from generate_series(1, 384) i), ',') || ']')::extensions.vector(384)
$$;

-- =============================================================================================
-- 0. Installed, shaped and fenced
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  r      record;
  f      text;
  v_six  text[] := array[
    'public.workspace_claim_v2(text)',
    'public.workspace_turn_context(bigint, text)',
    'public.workspace_turn_put(bigint, text, jsonb, jsonb)',
    'public.workspace_planner_feed(bigint, text, date, date)',
    'public.workspace_job_claim(text, text[])',
    'public.workspace_job_finish(text, uuid, text, text, text, timestamptz)'];
begin
  foreach f in array v_six loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase24_196: migration 196 is not applied (% is missing)', f;
    end if;
    select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner,
           coalesce(p.proconfig, '{}') as cfg, obj_description(p.oid, 'pg_proc') as note
      into r from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f::regprocedure;
    if not r.prosecdef then v_fail := v_fail || format('%s is not security definer', f); end if;
    if r.lanname <> 'plpgsql' then v_fail := v_fail || format('%s is not plpgsql', f); end if;
    if r.owner <> 'postgres' then v_fail := v_fail || format('%s is owned by %s', f, r.owner); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
  end loop;

  for r in
    select * from (values
      ('public.workspace_claim_v2(text)', 'p_runner text',
       'TABLE(request_id bigint, conversation_id uuid, user_message_id uuid, prompt text)'),
      ('public.workspace_turn_context(bigint, text)', 'p_request_id bigint, p_runner text', 'jsonb'),
      ('public.workspace_turn_put(bigint, text, jsonb, jsonb)',
       'p_request_id bigint, p_runner text, p_facts jsonb, p_sources jsonb', 'integer'),
      ('public.workspace_planner_feed(bigint, text, date, date)',
       'p_request_id bigint, p_runner text, p_from date, p_to date', 'jsonb'),
      ('public.workspace_job_claim(text, text[])', 'p_runner text, p_kinds text[]', 'jsonb'),
      ('public.workspace_job_finish(text, uuid, text, text, text, timestamp with time zone)',
       'p_runner text, p_conversation_id uuid, p_kind text, p_outcome text, p_summary text, p_through timestamp with time zone',
       'jsonb')
    ) as x(sig, args, result)
  loop
    if pg_get_function_identity_arguments(r.sig::regprocedure) is distinct from r.args then
      v_fail := v_fail || format('%s takes (%s)', r.sig, pg_get_function_identity_arguments(r.sig::regprocedure));
    end if;
    if pg_get_function_result(r.sig::regprocedure) is distinct from r.result then
      v_fail := v_fail || format('%s returns %s', r.sig, pg_get_function_result(r.sig::regprocedure));
    end if;
  end loop;

  -- The eleven are exactly the SECURITY DEFINER functions the role can execute in public.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_begin,workspace_claim,workspace_claim_v2,workspace_finish,workspace_heartbeat,'
     'workspace_job_claim,workspace_job_finish,workspace_planner_feed,workspace_stream,'
     'workspace_turn_context,workspace_turn_put' then
    v_fail := v_fail || format('workspace_runner executes the SECURITY DEFINER functions [%s]', v_got);
  end if;

  -- Nobody else executes any of the six.
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'),
                 ('sync_runner'), ('inbox_apply_runner')) as w(who)
    cross join unnest(v_six) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('executable beyond workspace_runner: %s', v_got);
  end if;

  -- Still no table, view or sequence privilege in public, on a relation or on a column.
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and ((c.relkind in ('r', 'p', 'v', 'm', 'f')
           and (has_table_privilege('workspace_runner', c.oid,
                                    'select, insert, update, delete, truncate, references, trigger')
                or has_any_column_privilege('workspace_runner', c.oid,
                                            'select, insert, update, references')))
          or (c.relkind = 'S'
              and has_sequence_privilege('workspace_runner', c.oid, 'usage, select, update')));
  if v_got is not null then
    v_fail := v_fail || format('workspace_runner holds a privilege on %s', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_196 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. claim_v2
-- =============================================================================================
do $$
declare
  c_role  constant text := 'workspace_runner';
  c_r1    constant text := 'w76-r1';
  c_r2    constant text := 'w76-r2';
  v_ra bigint; v_rb bigint; v_rc bigint; v_rd bigint; v_re bigint; v_rf bigint;
  v_out jsonb;
  v_row record;
begin
  -- Setup (not an assertion): park everything that really exists, inside this transaction only.
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  insert into workspace_conversation_state (conversation_id, memory_opt_out, job_claimed_by, job_claimed_at)
  select c.id, true, 'w76-parked', now() from workspace_conversations c
  on conflict (conversation_id) do update
     set memory_opt_out = true, job_claimed_by = 'w76-parked', job_claimed_at = now();

  v_ra := pg_temp.w76_req('w76 196 A', 'queued', interval '2 hours');
  v_rb := pg_temp.w76_req('w76 196 B', 'queued', interval '1 hour');
  v_out := pg_temp.w76_call(c_role, null, format('(select to_jsonb(c) from public.workspace_claim_v2(%L) c)', c_r1));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,prompt,request_id,user_message_id'
     or (v_out->>'request_id')::bigint <> v_ra or v_out->>'prompt' <> 'question w76 196 A' then
    raise exception 'FAIL 1a: the first claim returned %', v_out;
  end if;
  select r.state, r.claimed_by, r.attempts, r.claimed_at is not null as stamped,
         r.conversation_id, r.user_message_id into v_row from workspace_requests r where r.id = v_ra;
  if v_row.state <> 'claimed' or v_row.claimed_by <> c_r1 or v_row.attempts <> 1 or not v_row.stamped
     or (v_out->>'conversation_id')::uuid is distinct from v_row.conversation_id
     or (v_out->>'user_message_id')::uuid is distinct from v_row.user_message_id then
    raise exception 'FAIL 1a: after the claim the request reads %', row_to_json(v_row);
  end if;

  -- 1b. Answers are held to one at a time across runners.
  if pg_temp.w76_call(c_role, null, format('(select to_jsonb(c) from public.workspace_claim_v2(%L) c)', c_r2)) is not null then
    raise exception 'FAIL 1b: a second runner was handed a request while one was claimed';
  end if;
  if (select r.state from workspace_requests r where r.id = v_rb) <> 'queued' then
    raise exception 'FAIL 1b: the queued request moved';
  end if;

  -- 1c. The caller's own dead turn is closed at once, with its assistant row, and the next is claimed.
  perform pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_begin(%s, ''mid'', ''claude-cli'', ''sonnet''))', v_ra));
  v_out := pg_temp.w76_call(c_role, null, format('(select to_jsonb(c) from public.workspace_claim_v2(%L) c)', c_r1));
  select r.state, r.error_code, r.finished_at is not null as closed into v_row from workspace_requests r where r.id = v_ra;
  if v_row.state <> 'failed' or v_row.error_code <> 'stale_claim' or not v_row.closed then
    raise exception 'FAIL 1c: the runner''s own dead turn reads %', row_to_json(v_row);
  end if;
  if not exists (select 1 from workspace_messages m where m.request_id = v_ra and m.role = 'assistant'
                    and m.finished and m.error_code = 'stale_claim') then
    raise exception 'FAIL 1c: the dead turn''s assistant row was not finished with stale_claim';
  end if;
  if (v_out->>'request_id')::bigint <> v_rb or (select r.claimed_by from workspace_requests r where r.id = v_rb) <> c_r1 then
    raise exception 'FAIL 1c: the claim after the closed turn returned %', v_out;
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_rb;

  -- 1d. The 10-minute sweep: another runner's stale claim is closed and the next request is claimed.
  v_rc := pg_temp.w76_req('w76 196 C', 'claimed', interval '11 minutes', 'w76-other');
  v_rd := pg_temp.w76_req('w76 196 D', 'queued', interval '1 minute');
  v_out := pg_temp.w76_call(c_role, null, format('(select to_jsonb(c) from public.workspace_claim_v2(%L) c)', c_r2));
  if (select r.state || '/' || r.error_code from workspace_requests r where r.id = v_rc) <> 'failed/stale_claim'
     or (v_out->>'request_id')::bigint <> v_rd then
    raise exception 'FAIL 1d: the sweep or the claim after it went wrong: %', v_out;
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_rd;

  -- 1e. A fresh claim of another runner blocks, and is not closed.
  v_re := pg_temp.w76_req('w76 196 E', 'claimed', interval '1 minute', 'w76-other');
  v_rf := pg_temp.w76_req('w76 196 F', 'queued', interval '30 seconds');
  if pg_temp.w76_call(c_role, null, format('(select to_jsonb(c) from public.workspace_claim_v2(%L) c)', c_r1)) is not null
     or (select r.state from workspace_requests r where r.id = v_re) <> 'claimed'
     or (select r.state from workspace_requests r where r.id = v_rf) <> 'queued' then
    raise exception 'FAIL 1e: a fresh claim of another runner did not block the queue';
  end if;
  if pg_temp.w76_try(c_role, null, 'select * from public.workspace_claim_v2(null)') <> '22023'
     or pg_temp.w76_try(c_role, null, 'select * from public.workspace_claim_v2(''  '')') <> '22023' then
    raise exception 'FAIL 1e: an empty runner name did not end in 22023';
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_re;
  v_out := pg_temp.w76_call(c_role, null, format('(select to_jsonb(c) from public.workspace_claim_v2(%L) c)', c_r1));
  if (v_out->>'request_id')::bigint <> v_rf then
    raise exception 'FAIL 1e: after the block lifted the claim returned %', v_out;
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_rf;

  -- 1f. workspace_claim(text) is as it was: it still answers, for the old image, to the old name.
  if to_regprocedure('public.workspace_claim(text)') is null
     or not has_function_privilege('workspace_runner', 'public.workspace_claim(text)', 'execute') then
    raise exception 'FAIL 1f: workspace_claim(text) is gone or lost its grant';
  end if;
end $$;

-- =============================================================================================
-- 2. turn_context. Conversation K: three answered requests (high / deep, mid / no options row,
--    low / quick), a stopped answer, an unfinished message, a message before the summary's
--    through-point and one after the question; then the request that is claimed now.
-- =============================================================================================
do $$
declare
  c_role  constant text := 'workspace_runner';
  c_r1    constant text := 'w76-r1';
  c_r2    constant text := 'w76-r2';
  v_owner uuid := app_owner();
  v_c1 text; v_c2 text;
  v_q1 bigint; v_q2 bigint; v_q3 bigint; v_q4 bigint; v_rg bigint;
  v_f1 bigint; v_f2 bigint; v_d1 bigint; v_d2 bigint; v_t1 bigint;
  v_conv uuid; v_conv2 uuid;
  v_sha text := md5('w76-196-d1') || md5('w76-196-d1b');
  v_sha2 text := md5('w76-196-d2') || md5('w76-196-d2b');
  v_out jsonb; v_o2 jsonb;
  v_got text;
begin
  select (array_agg(c.id order by c.id))[1], (array_agg(c.id order by c.id))[2] into v_c1, v_c2 from courses c;
  if v_c2 is null then
    raise exception 'FAIL phase24_196 (setup): the unit needs two courses in the courses table';
  end if;
  v_q4 := pg_temp.w76_req('w76 196 K', 'queued', interval '10 minutes');
  select r.conversation_id into v_conv from workspace_requests r where r.id = v_q4;
  insert into workspace_requests (conversation_id, user_message_id, state, finished_at, created_at)
  select v_conv, r.user_message_id, 'done', now() - interval '3 hours', now() - interval '3 hours' from workspace_requests r where r.id = v_q4
  returning id into v_q1;
  insert into workspace_requests (conversation_id, user_message_id, state, finished_at, created_at)
  select v_conv, r.user_message_id, 'done', now() - interval '2 hours', now() - interval '2 hours' from workspace_requests r where r.id = v_q4
  returning id into v_q2;
  insert into workspace_requests (conversation_id, user_message_id, state, finished_at, created_at)
  select v_conv, r.user_message_id, 'done', now() - interval '1 hour', now() - interval '1 hour' from workspace_requests r where r.id = v_q4
  returning id into v_q3;
  insert into workspace_request_options (request_id, depth) values (v_q1, 'deep'), (v_q3, 'quick');
  perform pg_temp.w76_msg(v_conv, 'user', 'too old, before the through-point', interval '5 hours');
  perform pg_temp.w76_msg(v_conv, 'user', 'first question', interval '3 hours');
  perform pg_temp.w76_msg(v_conv, 'assistant', 'first answer', interval '170 minutes', true, null, 'high', v_q1);
  perform pg_temp.w76_msg(v_conv, 'user', 'second question', interval '2 hours');
  perform pg_temp.w76_msg(v_conv, 'assistant', 'second answer', interval '110 minutes', true, null, 'mid', v_q2);
  perform pg_temp.w76_msg(v_conv, 'user', 'third question', interval '1 hour');
  perform pg_temp.w76_msg(v_conv, 'assistant', 'third answer, sto', interval '50 minutes', true, 'cancelled', 'low', v_q3);
  perform pg_temp.w76_msg(v_conv, 'assistant', 'never finished', interval '45 minutes', false);
  perform pg_temp.w76_msg(v_conv, 'user', 'asked after this request''s question', interval '1 minute');
  insert into workspace_conversation_state (conversation_id, rolling_summary, summarised_through)
  values (v_conv, 'Synthetic rolling summary.', now() - interval '4 hours')
  on conflict (conversation_id) do update
     set rolling_summary = excluded.rolling_summary, summarised_through = excluded.summarised_through;
  update workspace_profile set about_me = 'Synthetic about me.' where id = 1;

  insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
  select c.bb_course_id, c.id, 'readings', 'w76 196 file ' || g, 'https://example.invalid/_w76_196_f' || g, 'rule', now()
    from courses c, generate_series(1, 2) g where c.id = v_c1;
  select f.id into v_f1 from bb_files f where f.source_url = 'https://example.invalid/_w76_196_f1';
  select f.id into v_f2 from bb_files f where f.source_url = 'https://example.invalid/_w76_196_f2';
  if pg_temp.w76_try('authenticated', v_owner::text, format(
       'insert into bb_file_text (file_id, unit_kind, unit_no, text) values (%s, ''slide'', 1, ''Synthetic slide text.'')', v_f1)) <> 'ok:1' then
    raise exception 'FAIL phase24_196 (setup): the course unit was not written';
  end if;
  select t.id into v_t1 from bb_file_text t where t.file_id = v_f1;
  insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state, course_id)
  values ('upload', 'w76 196 upload one', 'text/plain', 10, v_sha, 'u/' || v_sha, 'indexed', v_c1) returning id into v_d1;
  insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state)
  values ('upload', 'w76 196 upload two', 'text/plain', 10, v_sha2, 'u/' || v_sha2, 'stored') returning id into v_d2;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (v_d1, 'page', 1, 'Synthetic page text.');
  insert into workspace_request_options (request_id, course_display_id, course_ids, depth, routine_id, format)
  values (v_q4, v_c1, array[v_c1], 'standard', 'study-guide', 'plain');
  insert into workspace_request_attachments (request_id, ord, kind, file_id, document_id) values
    (v_q4, 1, 'file', v_f1, null), (v_q4, 2, 'file', v_f2, null), (v_q4, 3, 'file', 0, null),
    (v_q4, 4, 'upload', null, v_d1), (v_q4, 5, 'upload', null, v_d2);
  update workspace_requests set state = 'claimed', claimed_by = c_r1, claimed_at = now(), attempts = 1 where id = v_q4;

  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_turn_context(%s, %L)', v_q4, c_r1));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'about_me,attachments,courses,last_auto_tier,messages,messages_left_out,options,rolling_summary,routine,summarised_through,today' then
    raise exception 'FAIL 2a: the keys are %', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k);
  end if;
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out->'options') k)
     is distinct from 'course_display_id,course_ids,depth,format,routine_id'
     or v_out#>>'{options,depth}' <> 'standard' or v_out#>>'{options,format}' <> 'plain'
     or v_out#>>'{options,routine_id}' <> 'study-guide' or v_out#>>'{options,course_display_id}' <> v_c1
     or v_out#>'{options,course_ids}' <> to_jsonb(array[v_c1]) then
    raise exception 'FAIL 2a: the options read %', v_out->'options';
  end if;
  if v_out#>>'{routine,id}' <> 'study-guide' or v_out#>>'{routine,title}' <> 'Study guide'
     or v_out#>>'{routine,instructions}' is distinct from (select r.instructions from workspace_routines r where r.id = 'study-guide')
     or (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out->'routine') k) <> 'id,instructions,title' then
    raise exception 'FAIL 2a: the routine reads %', v_out->'routine';
  end if;
  if (select string_agg((a->>'ord') || ':' || (a->>'kind') || ':' || coalesce(a->>'id', '-') || ':' || coalesce(a->>'title', '-') || ':' || (a->>'state'), '|' order by (a->>'ord')::int)
        from jsonb_array_elements(v_out->'attachments') a)
     is distinct from '1:file:' || v_f1 || ':w76 196 file 1:ready|2:file:' || v_f2 || ':w76 196 file 2:no_text|3:file:0:-:missing|4:upload:' || v_d1 || ':w76 196 upload one:indexed|5:upload:' || v_d2 || ':w76 196 upload two:stored' then
    raise exception 'FAIL 2a: the attachments read %', v_out->'attachments';
  end if;
  if v_out->>'about_me' <> 'Synthetic about me.' or v_out->>'rolling_summary' <> 'Synthetic rolling summary.'
     or v_out->>'summarised_through' is null or v_out->>'today' <> ((now() at time zone 'America/New_York')::date)::text
     or v_out->>'last_auto_tier' <> 'mid' or (v_out->>'messages_left_out')::int <> 0 then
    raise exception 'FAIL 2a: the context reads about_me [%], summary [%], through [%], today [%], tier [%], left out [%]',
      v_out->>'about_me', v_out->>'rolling_summary', v_out->>'summarised_through', v_out->>'today', v_out->>'last_auto_tier', v_out->>'messages_left_out';
  end if;
  -- The messages: finished, before the question, after the through-point, oldest first, a stopped
  -- answer with its code, and the request's own question last. Never the unfinished one, the old
  -- one, or the one asked after.
  select string_agg((m->>'role') || ':' || (m->>'content') || ':' || coalesce(m->>'error_code', '-'), '|' order by ord)
    into v_got from jsonb_array_elements(v_out->'messages') with ordinality as x(m, ord);
  if v_got is distinct from 'user:first question:-|assistant:first answer:-|user:second question:-|assistant:second answer:-|user:third question:-|assistant:third answer, sto:cancelled' then
    raise exception 'FAIL 2a: the messages read [%]', v_got;
  end if;
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out#>'{messages,0}') k) <> 'content,created_at,error_code,id,role'
     or (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out#>'{courses,0}') k) <> 'display_id,id,title'
     or jsonb_array_length(v_out->'courses') <> (select count(*) from courses) then
    raise exception 'FAIL 2a: a message or a course has other keys than the fixture''s, or the course list is short';
  end if;

  -- 2b. A request with no options row gets the defaults, a null routine and no attachment.
  v_rg := pg_temp.w76_req('w76 196 G', 'claimed', interval '1 minute', c_r1);
  v_o2 := pg_temp.w76_call(c_role, null, format('public.workspace_turn_context(%s, %L)', v_rg, c_r1));
  if v_o2->'options' <> '{"depth": "auto", "format": "plain", "routine_id": null, "course_display_id": null, "course_ids": null}'::jsonb
     or v_o2->'routine' <> 'null'::jsonb or v_o2->'attachments' <> '[]'::jsonb or v_o2->'last_auto_tier' <> 'null'::jsonb
     or v_o2->'rolling_summary' <> 'null'::jsonb then
    raise exception 'FAIL 2b: a request with no options row read %', v_o2->'options';
  end if;
  update workspace_requests set state = 'done', finished_at = now() where id = v_rg;

  -- 2c. 22023 unless the request is claimed by the caller.
  v_rg := pg_temp.w76_req('w76 196 H', 'queued', interval '1 minute');
  foreach v_got in array array[
    format('select public.workspace_turn_context(%s, %L)', v_rg, c_r1),          -- queued
    format('select public.workspace_turn_context(%s, %L)', v_q4, c_r2),          -- claimed by another
    format('select public.workspace_turn_context(%s, null)', v_q4),
    format('select public.workspace_turn_context(%s, %L)', 0, c_r1),
    format('select public.workspace_turn_context(%s, %L)', v_q3, c_r1)]          -- done
  loop
    if pg_temp.w76_try(c_role, null, v_got) <> '22023' then
      raise exception 'FAIL 2c: [%] did not end in 22023', v_got;
    end if;
  end loop;
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now() where id = v_rg;

  -- 2d. Caps: 70 small messages keep the newest 60; three of 100000 bytes keep two.
  v_rg := pg_temp.w76_req('w76 196 caps', 'claimed', interval '1 second', c_r1);
  select r.conversation_id into v_conv2 from workspace_requests r where r.id = v_rg;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  select v_conv2, case when g % 2 = 0 then 'assistant' else 'user' end, 'cap ' || lpad(g::text, 3, '0'), true,
         now() - interval '1 day' + g * interval '1 minute'
    from generate_series(1, 70) g;
  v_o2 := pg_temp.w76_call(c_role, null, format('public.workspace_turn_context(%s, %L)', v_rg, c_r1));
  if jsonb_array_length(v_o2->'messages') <> 60 or (v_o2->>'messages_left_out')::int <> 10
     or v_o2#>>'{messages,0,content}' <> 'cap 011' or v_o2#>>'{messages,59,content}' <> 'cap 070' then
    raise exception 'FAIL 2d: 70 messages kept % with % left out (first [%], last [%])', jsonb_array_length(v_o2->'messages'),
      v_o2->>'messages_left_out', v_o2#>>'{messages,0,content}', v_o2#>>'{messages,59,content}';
  end if;
  delete from workspace_messages where conversation_id = v_conv2 and content like 'cap %';
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  select v_conv2, 'assistant', repeat(chr(96 + g::int), 100000), true, now() - interval '1 day' + g * interval '1 minute'
    from generate_series(1, 3) g;
  v_o2 := pg_temp.w76_call(c_role, null, format('public.workspace_turn_context(%s, %L)', v_rg, c_r1));
  if jsonb_array_length(v_o2->'messages') <> 2 or (v_o2->>'messages_left_out')::int <> 1
     or left(v_o2#>>'{messages,1,content}', 1) <> 'c' or left(v_o2#>>'{messages,0,content}', 1) <> 'b' then
    raise exception 'FAIL 2d: three messages of 100000 bytes kept % with % left out', jsonb_array_length(v_o2->'messages'), v_o2->>'messages_left_out';
  end if;
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now() where id = v_rg;

  -- Carried to the next sections.
  perform set_config('w76.q3', v_q3::text, true);
  perform set_config('w76.q4', v_q4::text, true);
  perform set_config('w76.conv', v_conv::text, true);
  perform set_config('w76.c1', v_c1, true);
  perform set_config('w76.c2', v_c2, true);
  perform set_config('w76.f1', v_f1::text, true);
  perform set_config('w76.d1', v_d1::text, true);
  perform set_config('w76.t1', v_t1::text, true);
end $$;

-- =============================================================================================
-- 3. turn_put on the claimed request
-- =============================================================================================
do $$
declare
  c_role  constant text := 'workspace_runner';
  c_r1    constant text := 'w76-r1';
  c_r2    constant text := 'w76-r2';
  v_owner uuid := app_owner();
  v_q3 bigint := current_setting('w76.q3')::bigint;
  v_q4 bigint := current_setting('w76.q4')::bigint;
  v_conv uuid := current_setting('w76.conv')::uuid;
  v_c1 text := current_setting('w76.c1');
  v_c2 text := current_setting('w76.c2');
  v_f1 bigint := current_setting('w76.f1')::bigint;
  v_d1 bigint := current_setting('w76.d1')::bigint;
  v_t1 bigint := current_setting('w76.t1')::bigint;
  v_mem bigint; v_memt bigint; v_dt bigint; v_txt2 bigint;
  v_facts jsonb := '{"depth": "standard", "tier": "mid", "plan_state": "planned", "retrieval_state": "found", "found_n": 3, "passages_n": 2, "memory_n": 1, "feed_rows": 5, "attachments": [{"kind": "file", "id": 1, "state": "cut"}], "prompt_bytes": 48211, "plan_ms": 1480, "retrieval_ms": 912, "plan_cost_usd": 0.0016}';
  v_n integer;
  v_got text;
begin
  select t.id into v_dt from workspace_document_text t where t.document_id = v_d1;
  insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
  select c.bb_course_id, c.id, 'readings', 'w76 196 tool file', 'https://example.invalid/_w76_196_f3', 'rule', now()
    from courses c where c.id = v_c2;
  if pg_temp.w76_try('authenticated', v_owner::text, format(
       'insert into bb_file_text (file_id, unit_kind, unit_no, text) values (%s, ''slide'', 9, ''Tool slide text.'')',
       (select f.id from bb_files f where f.source_url = 'https://example.invalid/_w76_196_f3'))) <> 'ok:1' then
    raise exception 'FAIL phase24_196 (setup): the tool unit was not written';
  end if;
  select t.id into v_txt2 from bb_file_text t join bb_files f on f.id = t.file_id where f.source_url = 'https://example.invalid/_w76_196_f3';
  insert into workspace_documents (kind, title, conversation_id, state) values ('memory', 'w76 196 remembered', v_conv, 'indexed') returning id into v_mem;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (v_mem, 'doc', 1, 'Synthetic remembered text.') returning id into v_memt;

  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, %L::jsonb))', v_q4, c_r1, v_facts::text,
    jsonb_build_array(
      jsonb_build_object('kind', 'material', 'origin', 'auto', 'file_id', 999999, 'text_id', v_t1, 'similarity', 0.871, 'title', 'ignored'),
      jsonb_build_object('kind', 'upload', 'origin', 'auto', 'document_id', v_d1, 'doc_text_id', v_dt, 'similarity', 0.842),
      jsonb_build_object('kind', 'memory', 'origin', 'auto', 'document_id', v_mem, 'doc_text_id', v_memt, 'similarity', 0.803),
      jsonb_build_object('kind', 'feed', 'origin', 'auto', 'title', 'Planner and grades', 'file_id', 5),
      jsonb_build_object('kind', 'material', 'origin', 'attached', 'file_id', v_f1),
      jsonb_build_object('kind', 'upload', 'origin', 'attached', 'document_id', v_d1),
      jsonb_build_object('kind', 'material', 'origin', 'auto', 'text_id', 0, 'file_id', 1),
      jsonb_build_object('kind', 'upload', 'origin', 'auto', 'document_id', v_mem),
      jsonb_build_object('kind', 'material', 'origin', 'attached', 'file_id', 0))::text)))::text::int;
  if v_n <> 6 then
    raise exception 'FAIL 3a: turn_put kept % rows, expected 6 (the unit that is not there, the memory row filed as an upload and the file that is not there are dropped)', v_n;
  end if;
  select string_agg(s.ord || ':' || s.kind || ':' || s.origin || ':' || coalesce(s.file_id::text, '-') || ':' || coalesce(s.text_id::text, '-')
                    || ':' || coalesce(s.document_id::text, '-') || ':' || coalesce(s.doc_text_id::text, '-') || ':' || coalesce(s.unit_kind, '-')
                    || ':' || coalesce(s.unit_no::text, '-') || ':' || coalesce(s.title, '-'), '|' order by s.ord)
    into v_got from workspace_sources s where s.request_id = v_q4;
  if v_got is distinct from
     '1:material:auto:' || v_f1 || ':' || v_t1 || ':-:-:slide:1:w76 196 file 1|2:upload:auto:-:-:' || v_d1 || ':' || v_dt || ':page:1:w76 196 upload one|'
     || '3:memory:auto:-:-:' || v_mem || ':' || v_memt || ':doc:1:w76 196 remembered|4:feed:auto:-:-:-:-:-:-:Planner and grades|'
     || '5:material:attached:' || v_f1 || ':-:-:-:-:-:w76 196 file 1|6:upload:attached:-:-:' || v_d1 || ':-:-:-:w76 196 upload one' then
    raise exception 'FAIL 3a: the sources read [%]', v_got;
  end if;
  if (select s.similarity from workspace_sources s where s.request_id = v_q4 and s.ord = 1) is distinct from 0.871::double precision
     or (select s.course_id from workspace_sources s where s.request_id = v_q4 and s.ord = 1) is distinct from v_c1 then
    raise exception 'FAIL 3a: the similarity or the course of the first source is wrong';
  end if;
  select t.depth || '/' || t.tier || '/' || t.plan_state || '/' || t.retrieval_state || '/' || t.found_n || '/' || t.passages_n || '/' || t.memory_n || '/' || t.feed_rows
         || '/' || t.prompt_bytes || '/' || t.plan_ms || '/' || t.retrieval_ms || '/' || t.plan_cost_usd || '/' || jsonb_array_length(t.attachments)
    into v_got from workspace_turns t where t.request_id = v_q4;
  if v_got is distinct from 'standard/mid/planned/found/3/2/1/5/48211/1480/912/0.0016/1' then
    raise exception 'FAIL 3a: the turn row reads [%]', v_got;
  end if;

  -- 3b. The second call, with no facts, appends the model's own source after the rows there. The
  --     function fills the file, course, unit and title from the unit's row.
  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, null, %L::jsonb))', v_q4, c_r1,
    jsonb_build_array(jsonb_build_object('kind', 'material', 'origin', 'tool', 'text_id', v_txt2),
                      jsonb_build_object('kind', 'material', 'origin', 'tool', 'text_id', 0))::text)))::text::int;
  select s.ord || ':' || s.origin || ':' || s.file_id || ':' || s.course_id || ':' || s.unit_kind || ':' || s.unit_no || ':' || s.title
    into v_got from workspace_sources s where s.request_id = v_q4 and s.ord = 7;
  if v_n <> 1 or v_got is distinct from '7:tool:' || (select t.file_id from bb_file_text t where t.id = v_txt2) || ':' || v_c2 || ':slide:9:w76 196 tool file'
     or (select count(*) from workspace_sources s where s.request_id = v_q4) <> 7
     or (select t.found_n from workspace_turns t where t.request_id = v_q4) <> 3 then
    raise exception 'FAIL 3b: the appended call kept % rows and the tool source reads [%]', v_n, v_got;
  end if;

  -- 3c. A second call with facts replaces the facts and the sources.
  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, %L::jsonb))', v_q4, c_r1,
    '{"depth": "deep", "tier": "high", "plan_state": "fallback", "retrieval_state": "empty"}',
    jsonb_build_array(jsonb_build_object('kind', 'feed', 'origin', 'auto'))::text)))::text::int;
  if v_n <> 1 or (select t.depth || t.tier || t.plan_state || t.retrieval_state || t.found_n from workspace_turns t where t.request_id = v_q4) <> 'deephighfallbackempty0'
     or (select count(*) from workspace_sources s where s.request_id = v_q4) <> 1
     or (select count(*) from workspace_turns t where t.request_id = v_q4) <> 1 then
    raise exception 'FAIL 3c: the replacing call left the turn or the sources wrong';
  end if;

  -- 3d. A 41st source is cut, never refused; a full list takes no more.
  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, %L::jsonb, (select jsonb_agg(jsonb_build_object(''kind'', ''feed'', ''origin'', ''auto'')) from generate_series(1, 45))))', v_q4, c_r1,
    '{"depth": "deep", "tier": "high", "plan_state": "planned", "retrieval_state": "found"}')))::text::int;
  if v_n <> 40 or (select count(*) from workspace_sources s where s.request_id = v_q4) <> 40
     or (select max(s.ord) from workspace_sources s where s.request_id = v_q4) <> 40 then
    raise exception 'FAIL 3d: 45 sources kept % rows', v_n;
  end if;
  v_n := (pg_temp.w76_call(c_role, null, format('to_jsonb(public.workspace_turn_put(%s, %L, null, %L::jsonb))', v_q4, c_r1,
    jsonb_build_array(jsonb_build_object('kind', 'material', 'origin', 'tool', 'text_id', v_txt2))::text)))::text::int;
  if v_n <> 0 or (select count(*) from workspace_sources s where s.request_id = v_q4) <> 40 then
    raise exception 'FAIL 3d: a full list took another row (%)', v_n;
  end if;

  -- 3e. What turn_put refuses.
  foreach v_got in array array[
    format('select public.workspace_turn_put(%s, %L, null, null)', v_q3, c_r1),                    -- done
    format('select public.workspace_turn_put(%s, %L, null, null)', v_q4, c_r2),                    -- another runner
    format('select public.workspace_turn_put(%s, %L, null, null)', 0, c_r1),
    format('select public.workspace_turn_put(%s, %L, ''[]''::jsonb, null)', v_q4, c_r1),            -- facts not an object
    format('select public.workspace_turn_put(%s, %L, null, ''{}''::jsonb)', v_q4, c_r1),             -- sources not an array
    format('select public.workspace_turn_put(%s, %L, null, ''[{"kind": "web", "origin": "auto"}]''::jsonb)', v_q4, c_r1),
    format('select public.workspace_turn_put(%s, %L, null, ''[{"kind": "feed", "origin": "guess"}]''::jsonb)', v_q4, c_r1),
    format('select public.workspace_turn_put(%s, %L, null, ''["x"]''::jsonb)', v_q4, c_r1),
    format('select public.workspace_turn_put(%s, %L, ''{"depth": "deep", "tier": "high", "plan_state": "planned", "retrieval_state": "found", "found_n": "many"}''::jsonb, null)', v_q4, c_r1)]
  loop
    if pg_temp.w76_try(c_role, null, v_got) <> '22023' then
      raise exception 'FAIL 3e: [%] did not end in 22023', v_got;
    end if;
  end loop;
  if pg_temp.w76_try(c_role, null, format('select public.workspace_turn_put(%s, %L, ''{"depth": "deep", "tier": "max", "plan_state": "planned", "retrieval_state": "found"}''::jsonb, null)', v_q4, c_r1)) <> '23514' then
    raise exception 'FAIL 3e: a tier off the three did not end in 23514';
  end if;
end $$;

select 'phase24_196_runner_v2: PASS' as result,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef
           and has_function_privilege('workspace_runner', p.oid, 'execute')) as runner_definer_functions;

rollback;
