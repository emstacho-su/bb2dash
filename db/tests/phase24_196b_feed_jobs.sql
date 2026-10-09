-- bb2dash :: db/tests/phase24_196b_feed_jobs.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 19, second half.
-- Worker W-76. Tests migration 196's `workspace_planner_feed`, `workspace_job_claim` and
-- `workspace_job_finish` (the first half, phase24_196_runner_v2.sql, holds the shape, the claim,
-- the context and the put; the file was split so neither is over 800 lines).
--
--   4. planner_feed: exactly the eight keys, a window of 400 days clamped to 180, a scope that leaves
--      out another course, only posted scores, the counts agree with the views, the order
--   5. job_claim / job_finish: the first memory call stamps memory_since and no later call moves it;
--      who is eligible (answer older than the stamp, archived, opted out, not yet quiet); a rolling
--      job and its through-point; lease, release, three failures; the memory upsert (a first write,
--      the same summary, a new summary from indexed and from failed alike)
--   6. anon and authenticated cannot call any of the six
--
-- Every call is made under `set local role workspace_runner` (142's membership). The unit first
-- parks, INSIDE this transaction only, every request, every conversation's memory and every job lease
-- that really exists. The planner feed is read over whatever real rows the views hold (it checks
-- shape, order, counts and filters, never a value). All data is synthetic. Nothing is committed.
-- An `execute_sql` dry run adds `grant workspace_runner to postgres with inherit false, set true;`
-- in front (142's note). RUN IT: `node scripts/db-test.mjs --only phase24_196b_feed_jobs.sql`.

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

-- Park everything that really exists, inside this transaction only.
do $$
begin
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now()
   where state in ('queued', 'claimed');
  if to_regprocedure('public.workspace_job_claim(text, text[])') is null then
    raise exception 'FAIL phase24_196b: migration 196 is not applied (workspace_job_claim is missing)';
  end if;
end $$;

-- =============================================================================================
-- 4. planner_feed (read over whatever real rows the views hold: shape, order, counts, filters)
-- =============================================================================================
do $$
declare
  c_role  constant text := 'workspace_runner';
  c_r1    constant text := 'w76-r1';
  c_r2    constant text := 'w76-r2';
  v_q4 bigint;
  v_c1 text;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_ru bigint; v_rs bigint; v_rq bigint;
  v_out jsonb;
  v_n integer;
  v_prev integer := -1;
  v_undated boolean := false;
  v_prev_seen timestamptz;
  v_seen timestamptz;
  e jsonb;
begin
  select c.id into v_c1 from courses c order by c.id limit 1;
  v_q4 := pg_temp.w76_req('w76 196 scoped', 'claimed', interval '1 minute', c_r1);
  insert into workspace_request_options (request_id, course_ids) values (v_q4, array[v_c1]);

  -- 4a. A request scoped to one course: the eight keys, the default window, rows of that course alone.
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_planner_feed(%s, %L, null, null)', v_q4, c_r1));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'as_of,from,graded_so_far,scores,scores_more,to,work,work_more' then
    raise exception 'FAIL 4a: the keys are %', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k);
  end if;
  if (v_out->>'from')::date <> v_today - 7 or (v_out->>'to')::date <> v_today + 28
     or v_out->>'graded_so_far' <> 'on the Grades screen' or v_out->>'as_of' is null then
    raise exception 'FAIL 4a: the default window or the marker is wrong: % to %', v_out->>'from', v_out->>'to';
  end if;
  for e in select * from jsonb_array_elements(v_out->'work') loop
    if e->>'course_id' <> v_c1 then
      raise exception 'FAIL 4a: a request scoped to % was handed a work row of %', v_c1, e->>'course_id';
    end if;
  end loop;
  for e in select * from jsonb_array_elements(v_out->'scores') loop
    if e->>'course_id' <> v_c1 then
      raise exception 'FAIL 4a: a request scoped to % was handed a score of %', v_c1, e->>'course_id';
    end if;
  end loop;

  -- 4b. An unscoped request, a window of 400 days each side: clamped to 180. Counts agree with the views.
  v_ru := pg_temp.w76_req('w76 196 unscoped', 'claimed', interval '1 minute', c_r1);
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_planner_feed(%s, %L, %L::date, %L::date)', v_ru, c_r1, v_today - 400, v_today + 400));
  if (v_out->>'from')::date <> v_today - 180 or (v_out->>'to')::date <> v_today + 180 then
    raise exception 'FAIL 4b: a window of 400 days was clamped to % to %, expected 180 either side', v_out->>'from', v_out->>'to';
  end if;
  select count(*) into v_n from v_work_items w where w.due_on is null or w.due_on between v_today - 180 and v_today + 180;
  if jsonb_array_length(v_out->'work') + (v_out->>'work_more')::int <> v_n or jsonb_array_length(v_out->'work') > 60 then
    raise exception 'FAIL 4b: work holds % rows with % more, the view has % in the window', jsonb_array_length(v_out->'work'), v_out->>'work_more', v_n;
  end if;
  select count(*) into v_n from v_gradebook_latest g
   where g.column_kind = 'item' and (g.display_score is not null or g.display_grade is not null);
  if jsonb_array_length(v_out->'scores') + (v_out->>'scores_more')::int <> v_n or jsonb_array_length(v_out->'scores') > 60 then
    raise exception 'FAIL 4b: scores holds % rows with % more, the view has % posted', jsonb_array_length(v_out->'scores'), v_out->>'scores_more', v_n;
  end if;
  -- The keys of a work row and of a score row; a score row has a score or a grade posted; the dated
  -- work rows run nearest today first and the undated rows come last; the scores run newest first.
  for e in select * from jsonb_array_elements(v_out->'work') loop
    if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(e) k)
       is distinct from 'course_id,due_at,due_on,in_workload,item_id,item_kind,points_possible,status,title,type,undated' then
      raise exception 'FAIL 4b: a work row has the keys %', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(e) k);
    end if;
    if e->'due_on' = 'null'::jsonb then
      v_undated := true;
    else
      if v_undated or abs((e->>'due_on')::date - v_today) < v_prev then
        raise exception 'FAIL 4b: the work rows are not nearest-first with the undated last at %', e->>'title';
      end if;
      v_prev := abs((e->>'due_on')::date - v_today);
    end if;
  end loop;
  for e in select * from jsonb_array_elements(v_out->'scores') loop
    if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(e) k)
       is distinct from 'assignment_id,column_id,course_id,display_grade,display_score,grades_released,is_exempt,name,possible,seen_at,submission_status'
       or (e->'display_score' = 'null'::jsonb and e->'display_grade' = 'null'::jsonb) then
      raise exception 'FAIL 4b: a score row is off: %', e;
    end if;
    v_seen := (e->>'seen_at')::timestamptz;
    if v_prev_seen is not null and v_seen > v_prev_seen then
      raise exception 'FAIL 4b: the scores are not newest first';
    end if;
    v_prev_seen := v_seen;
  end loop;

  -- 4c. The default window, a window turned round, a one-day window.
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_planner_feed(%s, %L, null, null)', v_ru, c_r1));
  select count(*) into v_n from v_work_items w where w.due_on is null or w.due_on between v_today - 7 and v_today + 28;
  if jsonb_array_length(v_out->'work') + (v_out->>'work_more')::int <> v_n then
    raise exception 'FAIL 4c: the default window holds % rows, the view has %', jsonb_array_length(v_out->'work') + (v_out->>'work_more')::int, v_n;
  end if;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_planner_feed(%s, %L, %L::date, %L::date)', v_ru, c_r1, v_today + 10, v_today - 10));
  if (v_out->>'to')::date <> (v_out->>'from')::date then
    raise exception 'FAIL 4c: a window turned round was not made empty at its start';
  end if;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_planner_feed(%s, %L, %L::date, %L::date)', v_ru, c_r1, v_today, v_today));
  select count(*) into v_n from v_work_items w where w.due_on is null or w.due_on = v_today;
  if (v_out->>'from')::date <> v_today or (v_out->>'to')::date <> v_today
     or jsonb_array_length(v_out->'work') + (v_out->>'work_more')::int <> v_n then
    raise exception 'FAIL 4c: a one-day window holds % rows, the view has %', jsonb_array_length(v_out->'work') + (v_out->>'work_more')::int, v_n;
  end if;

  -- 4d. A scope that names a course nobody has: no row of another course, none at all.
  v_rs := pg_temp.w76_req('w76 196 scoped nowhere', 'claimed', interval '1 minute', c_r1);
  insert into workspace_request_options (request_id, course_ids) values (v_rs, array['NO.SUCH.COURSE']);
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_planner_feed(%s, %L, null, null)', v_rs, c_r1));
  if v_out->'work' <> '[]'::jsonb or v_out->'scores' <> '[]'::jsonb
     or (v_out->>'work_more')::int <> 0 or (v_out->>'scores_more')::int <> 0 then
    raise exception 'FAIL 4d: a scope of no course returned rows';
  end if;

  -- 4e. 22023 unless the request is claimed by the caller; and the progress tables stay out of reach.
  v_rq := pg_temp.w76_req('w76 196 queued for the feed', 'queued', interval '1 minute');
  foreach v_n in array array[1, 2, 3, 4] loop
    if pg_temp.w76_try(c_role, null, case v_n
         when 1 then format('select public.workspace_planner_feed(%s, %L, null, null)', v_rq, c_r1)
         when 2 then format('select public.workspace_planner_feed(%s, %L, null, null)', v_ru, c_r2)
         when 3 then format('select public.workspace_planner_feed(%s, null, null, null)', v_ru)
         else format('select public.workspace_planner_feed(%s, %L, null, null)', 0, c_r1) end) <> '22023' then
      raise exception 'FAIL 4e: case % did not end in 22023', v_n;
    end if;
  end loop;
  if pg_temp.w76_try(c_role, null, 'select 1 from assignment_progress limit 1') <> '42501'
     or pg_temp.w76_try(c_role, null, 'select 1 from reading_progress limit 1') <> '42501'
     or pg_temp.w76_try(c_role, null, 'select 1 from v_work_items limit 1') <> '42501'
     or pg_temp.w76_try(c_role, null, 'select 1 from v_gradebook_latest limit 1') <> '42501' then
    raise exception 'FAIL 4e: workspace_runner can read the progress tables or the views directly';
  end if;
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now() where id in (v_ru, v_rs, v_rq, v_q4);
end $$;

-- =============================================================================================
-- 5. job_claim and job_finish
-- =============================================================================================
do $$
declare
  c_role  constant text := 'workspace_runner';
  c_r1    constant text := 'w76-r1';
  c_r2    constant text := 'w76-r2';
  v_x timestamptz := now() - interval '1 day';
  v_qq bigint;
  v_out jsonb;
  v_ms timestamptz;
  v_rm bigint; v_ro bigint; v_ra bigint; v_rq bigint; v_rr bigint; v_rp bigint; v_rl bigint;
  v_cm uuid; v_co uuid; v_ca uuid; v_cq uuid; v_cr uuid; v_cp uuid; v_cl uuid;
  v_ans uuid;
  v_doc bigint; v_unit bigint;
  v_through timestamptz;
  v_row record;
  v_got text;
  v_n integer;
begin
  -- Park every conversation that exists now, the unit's own ones from section 4 included, so a job
  -- can only be one of the conversations made below.
  insert into workspace_conversation_state (conversation_id, memory_opt_out, job_claimed_by, job_claimed_at)
  select c.id, true, 'w76-parked', now() from workspace_conversations c
  on conflict (conversation_id) do update
     set memory_opt_out = true, job_claimed_by = 'w76-parked', job_claimed_at = now();

  -- 5a. memory_since: stamped by the FIRST call that asks for memory jobs, and never moved.
  update workspace_profile set memory_since = null where id = 1;
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1)) is not null
     or (select p.memory_since from workspace_profile p where p.id = 1) is not null then
    raise exception 'FAIL 5a: a rolling-only call returned a job or stamped memory_since';
  end if;
  v_qq := pg_temp.w76_req('w76 196 queued for jobs', 'queued', interval '1 minute');
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r1)) is not null then
    raise exception 'FAIL 5a: a job was handed over while a request was queued';
  end if;
  if (select p.memory_since from workspace_profile p where p.id = 1) is null then
    raise exception 'FAIL 5a: the first call that asked for memory did not stamp memory_since';
  end if;
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now() where id = v_qq;
  update workspace_profile set memory_since = v_x where id = 1;
  perform pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory'', ''rolling''])', c_r1));
  if (select p.memory_since from workspace_profile p where p.id = 1) is distinct from v_x then
    raise exception 'FAIL 5a: a later call moved memory_since';
  end if;
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[]::text[])', c_r1)) is not null then
    raise exception 'FAIL 5a: an empty list of kinds returned a job';
  end if;
  foreach v_got in array array[
    format('select public.workspace_job_claim(%L, array[''summary''])', c_r1),
    format('select public.workspace_job_claim(%L, null)', c_r1),
    format('select public.workspace_job_claim(%L, array[''memory'', null])', c_r1),
    'select public.workspace_job_claim('' '', array[''memory''])'] loop
    if pg_temp.w76_try(c_role, null, v_got) <> '22023' then
      raise exception 'FAIL 5a: [%] did not end in 22023', v_got;
    end if;
  end loop;

  -- 5b. Who is eligible for a memory job. M: a real answer 30 minutes old. O: answered before the stamp.
  --     A: archived. Q: opted out. R: answered 5 minutes ago. P: only a stopped answer.
  v_rm := pg_temp.w76_req('w76 196 M', 'done', interval '3 hours'); select r.conversation_id into v_cm from workspace_requests r where r.id = v_rm;
  v_ro := pg_temp.w76_req('w76 196 O', 'done', interval '3 days'); select r.conversation_id into v_co from workspace_requests r where r.id = v_ro;
  v_ra := pg_temp.w76_req('w76 196 A2', 'done', interval '3 hours'); select r.conversation_id into v_ca from workspace_requests r where r.id = v_ra;
  v_rq := pg_temp.w76_req('w76 196 Q', 'done', interval '3 hours'); select r.conversation_id into v_cq from workspace_requests r where r.id = v_rq;
  v_rr := pg_temp.w76_req('w76 196 R', 'done', interval '3 hours'); select r.conversation_id into v_cr from workspace_requests r where r.id = v_rr;
  v_rp := pg_temp.w76_req('w76 196 P', 'done', interval '3 hours'); select r.conversation_id into v_cp from workspace_requests r where r.id = v_rp;
  perform pg_temp.w76_msg(v_cm, 'assistant', 'answer M', interval '30 minutes', true, null, 'mid', v_rm);
  perform pg_temp.w76_msg(v_co, 'assistant', 'answer O', interval '2 days', true, null, 'mid', v_ro);
  perform pg_temp.w76_msg(v_ca, 'assistant', 'answer A', interval '30 minutes', true, null, 'mid', v_ra);
  perform pg_temp.w76_msg(v_cq, 'assistant', 'answer Q', interval '30 minutes', true, null, 'mid', v_rq);
  perform pg_temp.w76_msg(v_cr, 'assistant', 'answer R', interval '5 minutes', true, null, 'mid', v_rr);
  perform pg_temp.w76_msg(v_cp, 'assistant', 'answer P, sto', interval '30 minutes', true, 'cancelled', 'mid', v_rp);
  update workspace_conversations set archived = true where id = v_ca;
  insert into workspace_conversation_state (conversation_id, memory_opt_out) values (v_cq, true)
  on conflict (conversation_id) do update set memory_opt_out = true;

  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r1));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,kind,messages,previous_summary,through'
     or v_out->>'kind' <> 'memory' or (v_out->>'conversation_id')::uuid <> v_cm or v_out->'previous_summary' <> 'null'::jsonb then
    raise exception 'FAIL 5b: the first memory claim returned %', v_out;
  end if;
  select m.created_at into v_ms from workspace_messages m where m.conversation_id = v_cm and m.role = 'assistant';
  if (select string_agg((x->>'role') || ':' || (x->>'content'), '|' order by ord) from jsonb_array_elements(v_out->'messages') with ordinality as y(x, ord))
     is distinct from 'user:question w76 196 M|assistant:answer M'
     or (v_out->>'through')::timestamptz is distinct from v_ms
     or (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out#>'{messages,0}') k) <> 'content,created_at,role' then
    raise exception 'FAIL 5b: the memory job''s messages or through-point are wrong: %', v_out;
  end if;
  -- The lease: while M is held, nobody gets a job; the others are not eligible.
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r2)) is not null then
    raise exception 'FAIL 5b: a second runner was handed a memory job (O, A, Q, P, R or the held M)';
  end if;
  -- R is quiet once its answer is 30 minutes old.
  update workspace_messages set created_at = now() - interval '30 minutes' where conversation_id = v_cr and role = 'assistant';
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r2));
  if (v_out->>'conversation_id')::uuid is distinct from v_cr then
    raise exception 'FAIL 5b: R was not handed over once it was quiet: %', v_out;
  end if;
  perform pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''released'', null, null)', c_r2, v_cr));
  update workspace_conversation_state set memory_opt_out = true where conversation_id = v_cr;   -- R is done with

  -- 5c. job_finish. A job the caller does not hold; bad arguments.
  foreach v_got in array array[
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', ''x'', now())', c_r2, v_cm),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', ''x'', now())', c_r1, gen_random_uuid()),
    format('select public.workspace_job_finish(%L, %L, ''summary'', ''done'', ''x'', now())', c_r1, v_cm),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''finished'', ''x'', now())', c_r1, v_cm),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', ''   '', now())', c_r1, v_cm),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', null, now())', c_r1, v_cm),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', ''x'', null)', c_r1, v_cm),
    format('select public.workspace_job_finish(%L, %L, ''memory'', ''done'', repeat(''m'', 1001), now())', c_r1, v_cm),
    format('select public.workspace_job_finish('' '', %L, ''memory'', ''done'', ''x'', now())', v_cm)] loop
    if pg_temp.w76_try(c_role, null, v_got) <> '22023' then
      raise exception 'FAIL 5c: [%] did not end in 22023', v_got;
    end if;
  end loop;
  -- A job cut short by a claim is released and counts no failure; the job comes round again.
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''released'', null, null)', c_r1, v_cm));
  select s.job_failures, s.job_claimed_by into v_row from workspace_conversation_state s where s.conversation_id = v_cm;
  if v_out <> '{"stored": false, "document_id": null}'::jsonb or v_row.job_failures <> 0 or v_row.job_claimed_by is not null then
    raise exception 'FAIL 5c: a released job returned % and the state reads %', v_out, row_to_json(v_row);
  end if;
  -- Three failures park the conversation until a newer message arrives.
  for v_n in 1..3 loop
    v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r1));
    if (v_out->>'conversation_id')::uuid is distinct from v_cm then
      raise exception 'FAIL 5c: claim % of M returned %', v_n, v_out;
    end if;
    perform pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''failed'', null, null)', c_r1, v_cm));
    if (select s.job_failures from workspace_conversation_state s where s.conversation_id = v_cm) <> v_n then
      raise exception 'FAIL 5c: failure % was not counted', v_n;
    end if;
  end loop;
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r1)) is not null then
    raise exception 'FAIL 5c: a parked conversation was handed over';
  end if;
  -- A newer message lifts the park (it is a question, so M still has the same last answer).
  perform pg_temp.w76_msg(v_cm, 'user', 'a newer question', interval '-1 minute');
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r1));
  if (v_out->>'conversation_id')::uuid is distinct from v_cm then
    raise exception 'FAIL 5c: a newer message did not lift the park: %', v_out;
  end if;
  v_through := (v_out->>'through')::timestamptz;

  -- done: a first write is one document and one unit, state text_ready, attempts 0, embedded_at null.
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''done'', %L, %L::timestamptz)', c_r1, v_cm, 'Synthetic remembered summary.', v_through));
  v_doc := (v_out->>'document_id')::bigint;
  select d.kind, d.state, d.attempts, d.error_code, d.claimed_by, d.title, d.sha256, d.storage_key, d.signed_url into v_row from workspace_documents d where d.id = v_doc;
  if (v_out->>'stored')::boolean is not true or v_row.kind <> 'memory' or v_row.state <> 'text_ready' or v_row.attempts <> 0
     or v_row.error_code is not null or v_row.claimed_by is not null or v_row.title <> 'w76 196 M'
     or v_row.sha256 is not null or v_row.storage_key is not null or v_row.signed_url is not null then
    raise exception 'FAIL 5c: the first memory write returned % and the document reads %', v_out, row_to_json(v_row);
  end if;
  select t.id into v_unit from workspace_document_text t where t.document_id = v_doc;
  if (select count(*) from workspace_document_text t where t.document_id = v_doc) <> 1
     or (select t.unit_kind || t.unit_no || t.text from workspace_document_text t where t.id = v_unit) <> 'doc1Synthetic remembered summary.'
     or (select t.embedded_at from workspace_document_text t where t.id = v_unit) is not null then
    raise exception 'FAIL 5c: the remembered unit is not one unit of kind doc, number 1, with no embedded_at';
  end if;
  select s.memory_written_at, s.job_failures, s.job_claimed_by into v_row from workspace_conversation_state s where s.conversation_id = v_cm;
  if v_row.memory_written_at is distinct from v_through or v_row.job_failures <> 0 or v_row.job_claimed_by is not null then
    raise exception 'FAIL 5c: the conversation state after the write reads %', row_to_json(v_row);
  end if;
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''memory''])', c_r1)) is not null then
    raise exception 'FAIL 5c: M was handed over again after its remembered item was written';
  end if;

  -- The same summary again: one document, one unit, and neither the unit's embedded_at nor the
  -- document's state moves. (The item has been embedded meanwhile.)
  update workspace_document_text set embedded_at = now() - interval '1 hour' where id = v_unit;
  insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (v_unit, 1, 'gte-small', pg_temp.w76_basis(1));
  update workspace_documents set state = 'indexed' where id = v_doc;
  update workspace_conversation_state set job_claimed_by = 'memory:' || c_r1, job_claimed_at = now() where conversation_id = v_cm;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''done'', %L, %L::timestamptz)', c_r1, v_cm, 'Synthetic remembered summary.', v_through));
  if (v_out->>'stored')::boolean is not false or (v_out->>'document_id')::bigint <> v_doc
     or (select d.state from workspace_documents d where d.id = v_doc) <> 'indexed'
     or (select t.embedded_at from workspace_document_text t where t.id = v_unit) is distinct from (now() - interval '1 hour')
     or (select count(*) from workspace_text_embeddings e where e.text_id = v_unit) <> 1
     or (select count(*) from workspace_documents d where d.kind = 'memory' and d.conversation_id = v_cm) <> 1
     or (select count(*) from workspace_document_text t where t.document_id = v_doc) <> 1 then
    raise exception 'FAIL 5c: the same summary again returned % and moved the document or its unit', v_out;
  end if;

  -- A new summary from indexed: the new text, the vectors gone, embedded_at null, text_ready, attempts 0.
  update workspace_documents set attempts = 2 where id = v_doc;
  update workspace_conversation_state set job_claimed_by = 'memory:' || c_r1, job_claimed_at = now() where conversation_id = v_cm;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''done'', %L, %L::timestamptz)', c_r1, v_cm, 'A different summary.', v_through));
  select d.state, d.attempts, d.error_code into v_row from workspace_documents d where d.id = v_doc;
  if (v_out->>'stored')::boolean is not true or (v_out->>'document_id')::bigint <> v_doc
     or v_row.state <> 'text_ready' or v_row.attempts <> 0
     or (select count(*) from workspace_document_text t where t.document_id = v_doc) <> 1
     or (select t.text from workspace_document_text t where t.document_id = v_doc) <> 'A different summary.'
     or (select t.embedded_at from workspace_document_text t where t.document_id = v_doc) is not null
     or exists (select 1 from workspace_text_embeddings e join workspace_document_text t on t.id = e.text_id where t.document_id = v_doc)
     or (select count(*) from workspace_documents d where d.kind = 'memory' and d.conversation_id = v_cm) <> 1 then
    raise exception 'FAIL 5c: a new summary from indexed returned % and the document reads %', v_out, row_to_json(v_row);
  end if;

  -- A new summary from failed.
  select t.id into v_unit from workspace_document_text t where t.document_id = v_doc;
  update workspace_documents set state = 'failed', attempts = 3, error_code = 'embed_failed' where id = v_doc;
  update workspace_conversation_state set job_claimed_by = 'memory:' || c_r1, job_claimed_at = now() where conversation_id = v_cm;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''done'', %L, %L::timestamptz)', c_r1, v_cm, 'A third summary.', v_through));
  select d.state, d.attempts, d.error_code into v_row from workspace_documents d where d.id = v_doc;
  if (v_out->>'stored')::boolean is not true or v_row.state <> 'text_ready' or v_row.attempts <> 0 or v_row.error_code is not null
     or (select t.text from workspace_document_text t where t.document_id = v_doc) <> 'A third summary.' then
    raise exception 'FAIL 5c: a new summary from failed returned % and the document reads %', v_out, row_to_json(v_row);
  end if;

  -- An opted-out conversation writes nothing and frees the lease.
  update workspace_conversation_state set job_claimed_by = 'memory:' || c_r1, job_claimed_at = now() where conversation_id = v_cq;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''memory'', ''done'', ''Should not be stored.'', now())', c_r1, v_cq));
  if v_out <> '{"stored": false, "document_id": null}'::jsonb
     or exists (select 1 from workspace_documents d where d.conversation_id = v_cq)
     or (select s.job_claimed_by from workspace_conversation_state s where s.conversation_id = v_cq) is not null then
    raise exception 'FAIL 5c: an opted-out conversation wrote or kept its lease: %', v_out;
  end if;

  -- 5d. Rolling: not held to memory_since (set into the future here), a through-point, the 14,000 / 12,000
  --     rule, the lease and its expiry, and the summary so far handed back.
  update workspace_profile set memory_since = now() + interval '1 day' where id = 1;
  v_rl := pg_temp.w76_req('w76 196 L', 'done', interval '100 minutes');
  select r.conversation_id into v_cl from workspace_requests r where r.id = v_rl;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  select v_cl, case when g % 2 = 0 then 'user' else 'assistant' end, repeat(chr(64 + g), 4000), true,
         now() - interval '90 minutes' + g * interval '5 minutes'
    from generate_series(1, 8) g;
  v_qq := pg_temp.w76_req('w76 196 queued for rolling', 'queued', interval '1 minute');
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1)) is not null then
    raise exception 'FAIL 5d: a rolling job was handed over while a request was queued';
  end if;
  update workspace_requests set state = 'cancelled', error_code = 'cancelled', finished_at = now() where id = v_qq;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1));
  select max(m.created_at) into v_through from workspace_messages m where m.conversation_id = v_cl and m.content = repeat('D', 4000);
  if v_out->>'kind' <> 'rolling' or (v_out->>'conversation_id')::uuid <> v_cl or v_out->'previous_summary' <> 'null'::jsonb
     or jsonb_array_length(v_out->'messages') <> 5
     or v_out#>>'{messages,0,content}' <> 'question w76 196 L' or v_out#>>'{messages,4,content}' <> repeat('D', 4000)
     or (v_out->>'through')::timestamptz is distinct from v_through then
    raise exception 'FAIL 5d: the rolling job reads kind [%], % messages, through [%] (expected the question and A to D, through D: the 199 rule keeps E, the fourth newest, verbatim)',
      v_out->>'kind', jsonb_array_length(v_out->'messages'), v_out->>'through';
  end if;
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r2)) is not null then
    raise exception 'FAIL 5d: a second runner was handed the held rolling job';
  end if;
  -- The lease runs out after 5 minutes.
  update workspace_conversation_state set job_claimed_at = now() - interval '6 minutes' where conversation_id = v_cl;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r2));
  if (v_out->>'conversation_id')::uuid is distinct from v_cl then
    raise exception 'FAIL 5d: the rolling job was not handed over after its lease ran out';
  end if;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''rolling'', ''done'', %L, %L::timestamptz)', c_r2, v_cl, 'Synthetic rolling summary.', v_through));
  select s.rolling_summary, s.summarised_through, s.job_failures, s.job_claimed_by into v_row from workspace_conversation_state s where s.conversation_id = v_cl;
  if v_out <> '{"stored": true, "document_id": null}'::jsonb or v_row.rolling_summary <> 'Synthetic rolling summary.'
     or v_row.summarised_through is distinct from v_through or v_row.job_failures <> 0 or v_row.job_claimed_by is not null then
    raise exception 'FAIL 5d: a rolling done returned % and the state reads %', v_out, row_to_json(v_row);
  end if;
  if exists (select 1 from workspace_documents d where d.conversation_id = v_cl) then
    raise exception 'FAIL 5d: a rolling summary made a remembered item';
  end if;
  -- Nothing more is due until the unsummarised messages pass the rule again.
  if pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1)) is not null then
    raise exception 'FAIL 5d: a rolling job was handed over with only the recent messages left';
  end if;
  insert into workspace_messages (conversation_id, role, content, finished, created_at)
  select v_cl, case when g % 2 = 0 then 'user' else 'assistant' end, repeat(chr(80 + g), 4000), true,
         now() - interval '50 minutes' + g * interval '5 minutes'
    from generate_series(1, 4) g;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_claim(%L, array[''rolling''])', c_r1));
  if (v_out->>'conversation_id')::uuid is distinct from v_cl or v_out->>'previous_summary' <> 'Synthetic rolling summary.'
     or jsonb_array_length(v_out->'messages') <> 4 or v_out#>>'{messages,0,content}' <> repeat('E', 4000) then
    raise exception 'FAIL 5d: the second rolling job read previous [%] with % messages', v_out->>'previous_summary', jsonb_array_length(v_out->'messages');
  end if;
  -- The same summary again stores nothing but moves the through-point forward; 3001 characters are refused.
  if pg_temp.w76_try(c_role, null, format('select public.workspace_job_finish(%L, %L, ''rolling'', ''done'', repeat(''r'', 3001), now())', c_r1, v_cl)) <> '22023' then
    raise exception 'FAIL 5d: a rolling summary of 3001 characters was not refused';
  end if;
  v_out := pg_temp.w76_call(c_role, null, format('public.workspace_job_finish(%L, %L, ''rolling'', ''done'', %L, %L::timestamptz)', c_r1, v_cl, 'Synthetic rolling summary.', (v_out->>'through')));
  if v_out <> '{"stored": false, "document_id": null}'::jsonb
     or (select s.summarised_through from workspace_conversation_state s where s.conversation_id = v_cl) <= v_through then
    raise exception 'FAIL 5d: the same rolling summary returned % or did not move the through-point on', v_out;
  end if;
end $$;

-- =============================================================================================
-- 6. Who else may call
-- =============================================================================================
do $$
declare
  v_case record;
  v_got  text;
begin
  for v_case in
    select * from (values
      ('anon'), ('authenticated')
    ) as x(who)
  loop
    foreach v_got in array array[
      'select * from public.workspace_claim_v2(''x'')',
      'select public.workspace_turn_context(1, ''x'')',
      'select public.workspace_turn_put(1, ''x'', null, null)',
      'select public.workspace_planner_feed(1, ''x'', null, null)',
      'select public.workspace_job_claim(''x'', array[''memory''])',
      'select public.workspace_job_finish(''x'', gen_random_uuid(), ''memory'', ''released'', null, null)']
    loop
      if pg_temp.w76_try(v_case.who, null, v_got) <> '42501' then
        raise exception 'FAIL 6: % calling [%] did not end in 42501', v_case.who, v_got;
      end if;
    end loop;
  end loop;
end $$;

select 'phase24_196b_feed_jobs: PASS' as result;

rollback;
