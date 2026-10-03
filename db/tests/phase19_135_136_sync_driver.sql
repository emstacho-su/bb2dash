-- bb2dash :: db/tests/phase19_135_136_sync_driver.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), tasks 2, 12, 13 and 14.
-- Worker W-53. Tests migrations 135 (`sync_runs.interrupted_at`, the trigger
-- `agent_requests_open_sync_run`, `run_transform` adopting the row the trigger opened) and 136
-- (`transform_tick`: a registered run folds only on its calendar row; the terminal rule).
--
--   0. installed and shaped as the Contract freezes it; the premise for calling the tick here
--   1. 135: a claim that carries a run id opens exactly one `running` row, on update and on
--      insert, once; a claim with no run id, a `done` request and a `transform` request open none
--   2. 136: a registered run with a course row five minutes old and no calendar row is not folded,
--      and an unregistered crawl is not quarantined while a sync is in flight
--   3. 135 + 136: the same run with its calendar row is folded once, into the row the claim opened
--      (same id, `finished_at > started_at`, stage `history` recorded); the drain picks the newest
--      COMPLETE registered run, never a newer incomplete one; a second tick folds nothing
--   4. the installed (old) skill's order still folds: claim with no run id, crawl, then set run_id
--   5. 136's terminal rule: a `running` row 31 minutes old reads `failed` and interrupted, its
--      claimed request is closed and raises one Inbox item; a claimed request with no run id 31
--      minutes old is closed with one item; a 29-minute one and a fresh `running` row are left alone
--   6. a second tick adds nothing, and an interrupted run is never folded when its calendar row
--      arrives late
--   7. quarantine is unchanged: once no sync is in flight the unregistered crawl is recorded once,
--      and a registered incomplete run is neither quarantined nor folded by the idle rule
--   8. 135: a claim naming a quarantined run id is refused with 42501
--
-- Every fixture run id is `00000000-1953-4000-8000-…`, never a real crawl's, and every fixture
-- shell is `_w53fx…`, which resolves to no course, so a fold here reads no real course's payload.
-- RUN IT: `node scripts/db-test.mjs --only phase19_135_136_sync_driver.sql`, or paste the whole
-- file into one `execute_sql` call. A failing assertion raises; a pass ends with one summary row.
-- NOTHING IS COMMITTED: the file opens its own transaction and its last statement is `rollback`.

begin;

create temp table _fx19 (label text primary key, run_id uuid, request_id bigint, sync_run_id bigint)
  on commit drop;

-- =============================================================================================
-- 0a. Installed, and shaped as the Contract freezes it
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_trg  text;
  f      text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'sync_runs'
                    and column_name = 'interrupted_at')
     or to_regprocedure('public.sync_request_open_run()') is null
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.agent_requests'::regclass
                       and tgname = 'agent_requests_open_sync_run' and not tgisinternal) then
    raise exception 'FAIL phase19_135_136: migration 135 is not applied (sync_runs.interrupted_at, '
                    'sync_request_open_run() or the trigger agent_requests_open_sync_run is missing)';
  end if;
  if pg_get_functiondef('public.transform_tick()'::regprocedure) not like '%interrupted_requests%' then
    raise exception 'FAIL phase19_135_136: migration 136 is not applied (transform_tick() returns no '
                    'interrupted_requests key)';
  end if;

  select pg_get_triggerdef(oid) into v_trg from pg_trigger
   where tgrelid = 'public.agent_requests'::regclass and tgname = 'agent_requests_open_sync_run';
  if v_trg not like '%AFTER INSERT OR UPDATE OF state, run_id ON public.agent_requests FOR EACH ROW%'
     or v_trg not like '%new.kind = ''sync''%'
     or v_trg not like '%new.state = ''claimed''%'
     or v_trg not like '%new.run_id IS NOT NULL%'
     or v_trg not like '%EXECUTE FUNCTION sync_request_open_run()%' then
    v_fail := v_fail || format('the trigger is not the Contract''s definition: %s', v_trg);
  end if;

  foreach f in array array['public.sync_request_open_run()', 'public.run_transform(uuid,text)',
                           'public.transform_tick()'] loop
    if has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute') then
      v_fail := v_fail || format('%s is executable by anon or authenticated', f);
    end if;
    if not (select prosecdef from pg_proc where oid = f::regprocedure) then
      v_fail := v_fail || format('%s is not security definer', f);
    end if;
    if not coalesce((select proconfig from pg_proc where oid = f::regprocedure), '{}')
           @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
  end loop;

  foreach f in array array['public.run_transform(uuid,text)', 'public.transform_tick()'] loop
    if not has_function_privilege('service_role', f, 'execute')
       or not has_function_privilege('db_test_runner', f, 'execute') then
      v_fail := v_fail || format('%s lost its service_role or db_test_runner execute grant', f);
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_135_136 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 0b. The premise for calling transform_tick() here, asserted rather than assumed
-- =============================================================================================
-- The tick folds every complete registered crawl, quarantines every idle unregistered one, closes
-- every stale claim and drains every queued transform request. Inside this transaction all of it
-- rolls back, but a real one in the way would be locked for the length of the unit and would be
-- counted in figures this unit asserts as its own. So the unit refuses to start instead.
do $$
declare v_n int;
begin
  select count(*) into v_n from agent_requests where kind = 'sync' and state = 'claimed';
  if v_n > 0 then
    raise exception 'FAIL premise: % real sync request(s) are claimed, so a sync is in flight. Run '
                    'this unit again once it has closed.', v_n;
  end if;

  select count(*) into v_n from agent_requests where kind = 'transform' and state = 'queued';
  if v_n > 0 then
    raise exception 'FAIL premise: % real transform request(s) are queued; the scheduled tick '
                    'drains them within two minutes. Run this unit again once it has.', v_n;
  end if;

  select count(*) into v_n from sync_runs where status = 'running';
  if v_n > 0 then
    raise exception 'FAIL premise: % real sync_runs row(s) are running, so this unit''s reaped and '
                    'folded counts would not be its own. Run it again once they have closed.', v_n;
  end if;

  select count(*) into v_n
    from (select a.run_id
            from agent_requests a
           where a.kind = 'sync' and a.run_id is not null and a.state in ('claimed', 'done')
             and not exists (select 1 from sync_runs s
                              where s.run_id = a.run_id and s.scope is distinct from 'unregistered'
                                and s.status <> 'running')
             and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'course')
             and exists (select 1 from bb_raw b where b.run_id = a.run_id and b.kind = 'calendar')
           group by a.run_id) w;
  if v_n > 0 then
    raise exception 'FAIL premise: % registered crawl(s) are waiting to be folded, so transform_tick() '
                    'would fold real data inside this test transaction. Run this unit again once '
                    'the scheduled tick has folded them.', v_n;
  end if;

  select count(*) into v_n
    from (select b.run_id
            from bb_raw b
           where b.kind = 'course'
             and not exists (select 1 from sync_runs s where s.run_id = b.run_id)
             and not exists (select 1 from agent_requests a
                              where a.kind = 'sync' and a.run_id = b.run_id)
           group by b.run_id) w;
  if v_n > 0 then
    raise exception 'FAIL premise: % unregistered crawl(s) are waiting to be quarantined, so this '
                    'unit''s quarantined count would not be its own. Run it again once the '
                    'scheduled tick has recorded them.', v_n;
  end if;
end $$;

-- =============================================================================================
-- 1. 135: a claim that carries a run id opens exactly one running row
-- =============================================================================================
do $$
declare
  v_req bigint; v_n int; r record;
begin
  -- A. The register-first skill: claim and run id in ONE update.
  insert into agent_requests (kind, scope, state, note)
  values ('sync', 'all', 'queued', 'W-53 fixture A (phase19_135_136_sync_driver.sql). Test-only; rolled back.')
  returning id into v_req;
  if exists (select 1 from sync_runs where run_id = '00000000-1953-4000-8000-000000000001') then
    raise exception 'FAIL fixture run A already has a sync_runs row';
  end if;
  update agent_requests
     set state = 'claimed', claimed_at = now(), claimed_by = 'w53 fixture',
         run_id = '00000000-1953-4000-8000-000000000001'
   where id = v_req and state = 'queued';

  select count(*) into v_n from sync_runs where run_id = '00000000-1953-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'FAIL a claim with a run id opened % sync_runs row(s), expected exactly 1', v_n;
  end if;
  select * into r from sync_runs where run_id = '00000000-1953-4000-8000-000000000001';
  if r.status is distinct from 'running' or r.trigger is distinct from 'manual'
     or r.source::text is distinct from 'blackboard' or r.scope is distinct from 'all'
     or r.started_at is null or r.finished_at is not null or r.interrupted_at is not null then
    raise exception 'FAIL the row opened at claim reads %', to_jsonb(r) - 'summary';
  end if;
  insert into _fx19 values ('A', '00000000-1953-4000-8000-000000000001', v_req, r.id);

  -- The trigger fires again whenever state or run_id is named; it must not open a second row.
  update agent_requests set state = 'claimed' where id = v_req;
  update agent_requests set run_id = run_id where id = v_req;
  select count(*) into v_n from sync_runs where run_id = '00000000-1953-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'FAIL re-touching the claim left % sync_runs row(s) for the run, expected 1', v_n;
  end if;

  -- B. A sync asked for with no request id: the row is INSERTED already claimed. It never crawls,
  --    so its running row is also the "fresh row is left alone" boundary of section 5.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, run_id, note)
  values ('sync', 'all', 'claimed', now(), 'w53 fixture', '00000000-1953-4000-8000-000000000002',
          'W-53 fixture B. Test-only; rolled back.')
  returning id into v_req;
  select count(*) into v_n from sync_runs
   where run_id = '00000000-1953-4000-8000-000000000002' and status = 'running';
  if v_n <> 1 then
    raise exception 'FAIL a request inserted as claimed with a run id opened % running row(s), expected 1', v_n;
  end if;
  insert into _fx19
  select 'B', run_id, v_req, id from sync_runs where run_id = '00000000-1953-4000-8000-000000000002';

  -- What must NOT open a row: a transform request that carries a run id (the drain writes one on
  -- every request it closes), and a sync request that is already done (phase 9's fixture shape).
  insert into agent_requests (kind, state, claimed_at, claimed_by, run_id, note)
  values ('transform', 'claimed', now(), 'w53 fixture', '00000000-1953-4000-8000-000000000004',
          'W-53 fixture D. Test-only; rolled back.');
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, run_id, note)
  values ('sync', 'all', 'done', now(), 'w53 fixture', now(), '00000000-1953-4000-8000-000000000008',
          'W-53 fixture Z. Test-only; rolled back.');
  select count(*) into v_n from sync_runs
   where run_id in ('00000000-1953-4000-8000-000000000004', '00000000-1953-4000-8000-000000000008');
  if v_n <> 0 then
    raise exception 'FAIL a transform request or a done sync request opened % sync_runs row(s), expected 0', v_n;
  end if;
  update agent_requests set state = 'done', finished_at = now()
   where kind = 'transform' and run_id = '00000000-1953-4000-8000-000000000004';
end $$;

-- =============================================================================================
-- 2. 136: a registered run with no calendar row is not folded, however long it has been idle
-- =============================================================================================
-- A: one course row five minutes old. Under 044 the three-minute idle rule folded this run and
--    dropped every course that had not landed yet.
insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
values ('00000000-1953-4000-8000-000000000001', 'course', '_w53fxa_1',
        '{"crawler":{"version":5},"content":[]}'::jsonb, now() - interval '5 minutes');

-- E: registered (a request the skill already closed), one course row landed this instant, no
--    calendar row. It is the newest registered crawl in bb_raw and it is incomplete: section 3's
--    drain must not pick it.
insert into agent_requests (kind, scope, state, claimed_at, claimed_by, finished_at, run_id, note)
values ('sync', 'all', 'done', now(), 'w53 fixture', now(), '00000000-1953-4000-8000-000000000005',
        'W-53 fixture E. Test-only; rolled back.');
insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
values ('00000000-1953-4000-8000-000000000005', 'course', '_w53fxe_1',
        '{"crawler":{"version":5},"content":[]}'::jsonb, now());

-- U: a crawl nobody registered, idle five minutes. Quarantine's own rule, for section 7.
insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
values ('00000000-1953-4000-8000-000000000007', 'course', '_w53fxu_1',
        '{"crawler":{"version":5},"content":[]}'::jsonb, now() - interval '5 minutes');

do $$
declare
  v_res jsonb; v_a _fx19%rowtype; r record;
begin
  select * into v_a from _fx19 where label = 'A';
  v_res := transform_tick();

  if (v_res->>'folded')::int <> 0 then
    raise exception 'FAIL tick 1 folded % run(s); a registered run with no calendar row must not fold (%)',
      v_res->>'folded', v_res - 'ical';
  end if;
  if (v_res->>'reaped')::int <> 0 or (v_res->>'interrupted_requests')::int <> 0 then
    raise exception 'FAIL tick 1 reaped % and interrupted % with nothing 30 minutes old',
      v_res->>'reaped', v_res->>'interrupted_requests';
  end if;
  if (v_res->>'quarantined')::int <> 0 or (v_res->>'quarantine_held_for_sync')::boolean is not true then
    raise exception 'FAIL tick 1 quarantined % (held = %); quarantine must hold while a sync is claimed',
      v_res->>'quarantined', v_res->>'quarantine_held_for_sync';
  end if;

  select * into r from sync_runs where id = v_a.sync_run_id;
  if r.status is distinct from 'running' or r.finished_at is not null then
    raise exception 'FAIL after tick 1 the claim-opened row reads status %, finished_at %', r.status, r.finished_at;
  end if;
  if exists (select 1 from sync_stage_runs where sync_run_id = v_a.sync_run_id) then
    raise exception 'FAIL tick 1 wrote stage rows for a run whose calendar row has not landed';
  end if;
  if exists (select 1 from sync_runs where run_id in ('00000000-1953-4000-8000-000000000005',
                                                       '00000000-1953-4000-8000-000000000007')) then
    raise exception 'FAIL tick 1 wrote a sync_runs row for the incomplete run E or the held crawl U';
  end if;
end $$;

-- =============================================================================================
-- 3. 135 + 136: the calendar row lands, and the run folds once into the row the claim opened
-- =============================================================================================
insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
values ('00000000-1953-4000-8000-000000000001', 'calendar', null, '{"results":[]}'::jsonb,
        now() - interval '1 minute');

-- A transform request for the drain. E's course row is newer than A's calendar row, so E is the
-- newest registered crawl in bb_raw; the drain must still take A, the newest COMPLETE one.
insert into agent_requests (kind, state, note)
values ('transform', 'queued', 'W-53 fixture T. Test-only; rolled back.');

do $$
declare
  v_res jsonb; v_a _fx19%rowtype; r record; v_n int; v_stages text; t record; v_finished timestamptz;
begin
  select * into v_a from _fx19 where label = 'A';
  v_res := transform_tick();

  if (v_res->>'folded')::int <> 1 or v_res->'sync_run_ids' is distinct from jsonb_build_array(v_a.sync_run_id) then
    raise exception 'FAIL tick 2 folded % (sync_run_ids %), expected 1 fold into row %',
      v_res->>'folded', v_res->'sync_run_ids', v_a.sync_run_id;
  end if;

  select count(*) into v_n from sync_runs
   where run_id = v_a.run_id and scope is distinct from 'unregistered';
  if v_n <> 1 then
    raise exception 'FAIL the folded run has % sync_runs row(s); the fold must keep the row the claim opened', v_n;
  end if;
  select * into r from sync_runs where id = v_a.sync_run_id;
  if r.status not in ('ok', 'partial') then
    raise exception 'FAIL the folded run reads status %, expected ok or partial (notes: %)', r.status, r.notes;
  end if;
  if r.finished_at is null or not (r.finished_at > r.started_at) then
    raise exception 'FAIL the folded run has started_at % and finished_at %; finished_at must be later',
      r.started_at, r.finished_at;
  end if;
  if r.trigger is distinct from 'scheduled' then
    raise exception 'FAIL the adopted row''s trigger is %, expected scheduled (set from p_trigger)', r.trigger;
  end if;
  if r.interrupted_at is not null then
    raise exception 'FAIL a folded run carries interrupted_at';
  end if;

  select string_agg(stage, ',' order by stage) into v_stages
    from sync_stage_runs where sync_run_id = v_a.sync_run_id;
  if v_stages is distinct from 'announcements,assignments,attempts,content,courses,files,gaps,gradebook,history' then
    raise exception 'FAIL the fold wrote stages %, expected the nine with history',
      coalesce(v_stages, '(none)');
  end if;
  if (select status from sync_stage_runs where sync_run_id = v_a.sync_run_id and stage = 'history')
       is distinct from 'ok' then
    raise exception 'FAIL the history stage reads % (%)',
      (select status from sync_stage_runs where sync_run_id = v_a.sync_run_id and stage = 'history'),
      (select error from sync_stage_runs where sync_run_id = v_a.sync_run_id and stage = 'history');
  end if;
  if jsonb_typeof(r.summary->'stages'->'history') is distinct from 'object' then
    raise exception 'FAIL summary.stages has no history object: %', r.summary->'stages';
  end if;
  if (select count(*) from sync_stage_runs where sync_run_id = v_a.sync_run_id and status = 'failed') > 0
       and r.status <> 'partial' then
    raise exception 'FAIL a stage failed and the run reads %', r.status;
  end if;

  -- The drain: newest complete registered run, not the newer incomplete one.
  select * into t from agent_requests where kind = 'transform' and note like 'W-53 fixture T.%';
  if t.state is distinct from 'done' or t.run_id is distinct from v_a.run_id
     or t.sync_run_id is distinct from v_a.sync_run_id then
    raise exception 'FAIL the drain closed the transform request as % on run % (sync_runs %), expected done on A',
      t.state, t.run_id, t.sync_run_id;
  end if;
  if (t.result->>'folded_a_new_crawl')::boolean is not false then
    raise exception 'FAIL the drain says folded_a_new_crawl = % for a run the fold pass had already folded',
      t.result->>'folded_a_new_crawl';
  end if;
  if exists (select 1 from sync_runs where run_id = '00000000-1953-4000-8000-000000000005') then
    raise exception 'FAIL the incomplete newest run E has a sync_runs row; the drain folded it';
  end if;

  -- Idempotent: the next tick has nothing to fold and leaves the finished row alone.
  v_finished := r.finished_at;
  v_res := transform_tick();
  if (v_res->>'folded')::int <> 0 or (v_res->>'requests_done')::int <> 0 then
    raise exception 'FAIL tick 3 folded % and drained %, expected 0 and 0',
      v_res->>'folded', v_res->>'requests_done';
  end if;
  if (select finished_at from sync_runs where id = v_a.sync_run_id) is distinct from v_finished then
    raise exception 'FAIL tick 3 rewrote a finished run';
  end if;
  if run_transform(v_a.run_id, 'manual') is distinct from v_a.sync_run_id
     or (select finished_at from sync_runs where id = v_a.sync_run_id) is distinct from v_finished then
    raise exception 'FAIL run_transform on a finished run did not return it unchanged';
  end if;

  -- The skill's step 5.
  update agent_requests set state = 'done', finished_at = now(), sync_run_id = v_a.sync_run_id
   where id = v_a.request_id;
end $$;

-- =============================================================================================
-- 4. The installed skill's order still folds: claim, crawl, THEN set run_id
-- =============================================================================================
do $$
declare
  v_res jsonb; v_req bigint; v_id bigint; v_n int; r record;
begin
  insert into agent_requests (kind, scope, state, note)
  values ('sync', 'all', 'queued', 'W-53 fixture C. Test-only; rolled back.')
  returning id into v_req;
  update agent_requests set state = 'claimed', claimed_at = now(), claimed_by = 'bb-sync session'
   where id = v_req and state = 'queued';
  if exists (select 1 from sync_runs where run_id = '00000000-1953-4000-8000-000000000003') then
    raise exception 'FAIL a claim with no run id opened a sync_runs row';
  end if;

  insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
  values ('00000000-1953-4000-8000-000000000003', 'course', '_w53fxc_1',
          '{"crawler":{"version":5},"content":[]}'::jsonb, now() - interval '2 minutes'),
         ('00000000-1953-4000-8000-000000000003', 'calendar', null, '{"results":[]}'::jsonb,
          now() - interval '1 minute');

  -- Step 3a of the installed skill.
  update agent_requests set run_id = '00000000-1953-4000-8000-000000000003'
   where id = v_req and state = 'claimed';
  select count(*), max(id) into v_n, v_id from sync_runs
   where run_id = '00000000-1953-4000-8000-000000000003' and status = 'running';
  if v_n <> 1 then
    raise exception 'FAIL setting run_id on a claimed request opened % running row(s), expected 1', v_n;
  end if;

  v_res := transform_tick();
  if (v_res->>'folded')::int <> 1 or v_res->'sync_run_ids' is distinct from jsonb_build_array(v_id) then
    raise exception 'FAIL the old order folded % (sync_run_ids %), expected 1 fold into row %',
      v_res->>'folded', v_res->'sync_run_ids', v_id;
  end if;
  select * into r from sync_runs where id = v_id;
  if r.status not in ('ok', 'partial') or not (r.finished_at > r.started_at) then
    raise exception 'FAIL the old order left the run at status %, started %, finished %',
      r.status, r.started_at, r.finished_at;
  end if;
  if (v_res->>'interrupted_requests')::int <> 0 then
    raise exception 'FAIL the terminal rule fired inside an ordinary crawl';
  end if;

  update agent_requests set state = 'done', finished_at = now(), sync_run_id = v_id where id = v_req;
end $$;

-- =============================================================================================
-- 5. 136's terminal rule
-- =============================================================================================
do $$
declare
  v_res jsonb; v_f bigint; v_g bigint; v_h bigint; v_frow bigint; v_n int;
  r record; q record; i record; v_b _fx19%rowtype; v_a _fx19%rowtype;
begin
  select * into v_a from _fx19 where label = 'A';
  select * into v_b from _fx19 where label = 'B';

  -- F: claimed with a run id 31 minutes ago, one course row landed, then the tab died.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, run_id, note)
  values ('sync', 'all', 'claimed', now() - interval '31 minutes', 'w53 fixture',
          '00000000-1953-4000-8000-000000000006', 'W-53 fixture F. Test-only; rolled back.')
  returning id into v_f;
  update sync_runs
     set started_at = now() - interval '31 minutes', notes = 'w53 fixture: died with its tab'
   where run_id = '00000000-1953-4000-8000-000000000006' and status = 'running'
  returning id into v_frow;
  if v_frow is null then
    raise exception 'FAIL fixture F: the claim opened no running row to age';
  end if;
  insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
  values ('00000000-1953-4000-8000-000000000006', 'course', '_w53fxf_1',
          '{"crawler":{"version":5},"content":[]}'::jsonb, now() - interval '31 minutes');
  insert into _fx19 values ('F', '00000000-1953-4000-8000-000000000006', v_f, v_frow);

  -- G: claimed 31 minutes ago and never registered a run. H: the same, 29 minutes ago.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, note)
  values ('sync', 'all', 'claimed', now() - interval '31 minutes', 'w53 fixture',
          'W-53 fixture G. Test-only; rolled back.')
  returning id into v_g;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, note)
  values ('sync', 'all', 'claimed', now() - interval '29 minutes', 'w53 fixture',
          'W-53 fixture H. Test-only; rolled back.')
  returning id into v_h;
  insert into _fx19 values ('G', null, v_g, null), ('H', null, v_h, null);

  v_res := transform_tick();

  if (v_res->>'reaped')::int <> 1 or (v_res->>'interrupted_requests')::int <> 2 then
    raise exception 'FAIL the terminal tick reaped % and interrupted %, expected 1 and 2 (%)',
      v_res->>'reaped', v_res->>'interrupted_requests', v_res - 'ical';
  end if;
  if (v_res->>'folded')::int <> 0 then
    raise exception 'FAIL the terminal tick folded % run(s)', v_res->>'folded';
  end if;

  -- The run.
  select * into r from sync_runs where id = v_frow;
  if r.status is distinct from 'failed' or r.interrupted_at is null or r.finished_at is null then
    raise exception 'FAIL the 31-minute running row reads status %, interrupted_at %, finished_at %',
      r.status, r.interrupted_at, r.finished_at;
  end if;
  if coalesce(r.notes, '') not like 'w53 fixture: died with its tab%'
     or right(coalesce(r.notes, ''), length('interrupted (reaped)')) <> 'interrupted (reaped)' then
    raise exception 'FAIL the reaped row''s notes are %, expected the old note kept and "interrupted (reaped)" last',
      coalesce(r.notes, '(null)');
  end if;

  -- Its request.
  select * into q from agent_requests where id = v_f;
  if q.state is distinct from 'failed' or q.finished_at is null
     or q.result->>'error' is distinct from 'interrupted'
     or (q.result->>'sync_run_id')::bigint is distinct from v_frow then
    raise exception 'FAIL the interrupted run''s request reads state %, result %', q.state, q.result;
  end if;

  -- Its one Inbox item.
  select count(*) into v_n from attention_items
   where ref = 'agent_request:' || v_f and state = 'open';
  if v_n <> 1 then
    raise exception 'FAIL % open item(s) carry ref agent_request:%, expected exactly 1', v_n, v_f;
  end if;
  select * into i from attention_items where ref = 'agent_request:' || v_f and state = 'open';
  if i.kind is distinct from 'stack_must_confirm' or i.course_id is not null or i.field is not null
     or i.entity is distinct from 'agent_request' or i.raised_by is distinct from v_frow
     or coalesce(i.question, '') = '' then
    raise exception 'FAIL the interrupted run''s item reads %', to_jsonb(i);
  end if;

  -- The claim that never registered a run.
  select * into q from agent_requests where id = v_g;
  if q.state is distinct from 'failed' or q.finished_at is null
     or q.result->>'error' is distinct from 'interrupted before a run was registered' then
    raise exception 'FAIL the 31-minute claim with no run id reads state %, result %', q.state, q.result;
  end if;
  select count(*) into v_n from attention_items
   where ref = 'agent_request:' || v_g and state = 'open'
     and kind = 'stack_must_confirm' and course_id is null and field is null
     and entity = 'agent_request' and raised_by is null;
  if v_n <> 1 then
    raise exception 'FAIL % open item(s) for the claim with no run id, expected exactly 1', v_n;
  end if;

  -- The boundaries: 29 minutes is not 30, a fresh running row is running, a finished run stands.
  if (select state from agent_requests where id = v_h) is distinct from 'claimed'
     or exists (select 1 from attention_items where ref = 'agent_request:' || v_h) then
    raise exception 'FAIL the 29-minute claim was closed or raised an item';
  end if;
  if (select status from sync_runs where id = v_b.sync_run_id) is distinct from 'running'
     or (select state from agent_requests where id = v_b.request_id) is distinct from 'claimed' then
    raise exception 'FAIL the terminal rule took a running row that started a moment ago';
  end if;
  if (select status from sync_runs where id = v_a.sync_run_id) not in ('ok', 'partial') then
    raise exception 'FAIL the terminal rule touched a finished run';
  end if;
end $$;

-- =============================================================================================
-- 6. A second tick adds nothing; an interrupted run is never folded
-- =============================================================================================
-- The interrupted crawl's calendar row arrives late. Nothing is retried.
insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
values ('00000000-1953-4000-8000-000000000006', 'calendar', null, '{"results":[]}'::jsonb, now());

do $$
declare
  v_res jsonb; v_f _fx19%rowtype; v_g _fx19%rowtype; v_n int; v_at timestamptz;
begin
  select * into v_f from _fx19 where label = 'F';
  select * into v_g from _fx19 where label = 'G';
  select interrupted_at into v_at from sync_runs where id = v_f.sync_run_id;

  v_res := transform_tick();

  if (v_res->>'reaped')::int <> 0 or (v_res->>'interrupted_requests')::int <> 0
     or (v_res->>'folded')::int <> 0 then
    raise exception 'FAIL the second terminal tick reaped %, interrupted % and folded %, expected 0, 0 and 0',
      v_res->>'reaped', v_res->>'interrupted_requests', v_res->>'folded';
  end if;
  select count(*) into v_n from attention_items
   where ref in ('agent_request:' || v_f.request_id, 'agent_request:' || v_g.request_id);
  if v_n <> 2 then
    raise exception 'FAIL after a second tick % item(s) exist for the two closed requests, expected 2', v_n;
  end if;
  if (select status from sync_runs where id = v_f.sync_run_id) is distinct from 'failed'
     or (select interrupted_at from sync_runs where id = v_f.sync_run_id) is distinct from v_at
     or (select count(*) from sync_runs where run_id = v_f.run_id) <> 1
     or exists (select 1 from sync_stage_runs where sync_run_id = v_f.sync_run_id) then
    raise exception 'FAIL the interrupted run was folded, re-stamped or duplicated when its calendar row arrived';
  end if;
end $$;

-- =============================================================================================
-- 7. Quarantine is unchanged
-- =============================================================================================
-- Close the two claims still open, so no sync is in flight and quarantine's hold lifts.
update agent_requests set state = 'cancelled', finished_at = now()
 where id in (select request_id from _fx19 where label in ('B', 'H'));

do $$
declare
  v_res jsonb; v_n int; r record;
begin
  v_res := transform_tick();

  if (v_res->>'quarantined')::int <> 1 or (v_res->>'quarantine_held_for_sync')::boolean is not false then
    raise exception 'FAIL the quarantine tick recorded % (held = %), expected 1 and not held',
      v_res->>'quarantined', v_res->>'quarantine_held_for_sync';
  end if;
  select count(*) into v_n from sync_runs where run_id = '00000000-1953-4000-8000-000000000007';
  if v_n <> 1 then
    raise exception 'FAIL the unregistered crawl has % sync_runs row(s), expected 1', v_n;
  end if;
  select * into r from sync_runs where run_id = '00000000-1953-4000-8000-000000000007';
  if r.scope is distinct from 'unregistered' or r.status is distinct from 'failed'
     or r.interrupted_at is not null
     or not exists (select 1 from sync_stage_runs
                     where sync_run_id = r.id and stage = 'crawl' and status = 'skipped') then
    raise exception 'FAIL the quarantine row reads scope %, status %, interrupted_at %',
      r.scope, r.status, r.interrupted_at;
  end if;

  -- E is registered and incomplete: not quarantined, and no idle rule folds it.
  if (v_res->>'folded')::int <> 0
     or exists (select 1 from sync_runs where run_id = '00000000-1953-4000-8000-000000000005') then
    raise exception 'FAIL the registered incomplete run E was folded or quarantined';
  end if;
end $$;

-- =============================================================================================
-- 8. 135: a claim naming a quarantined run id is refused
-- =============================================================================================
do $$
declare
  v_req bigint; v_refused boolean := false;
begin
  insert into agent_requests (kind, scope, state, note)
  values ('sync', 'all', 'queued', 'W-53 fixture Q. Test-only; rolled back.')
  returning id into v_req;

  begin
    update agent_requests
       set state = 'claimed', claimed_at = now(), claimed_by = 'w53 fixture',
           run_id = '00000000-1953-4000-8000-000000000007'
     where id = v_req and state = 'queued';
  exception when insufficient_privilege then
    v_refused := true;
  end;

  if not v_refused then
    raise exception 'FAIL a claim naming a quarantined run id was accepted; expected SQLSTATE 42501';
  end if;
  if (select state from agent_requests where id = v_req) is distinct from 'queued'
     or (select run_id from agent_requests where id = v_req) is not null then
    raise exception 'FAIL the refused claim still changed the request';
  end if;
  if exists (select 1 from sync_runs
              where run_id = '00000000-1953-4000-8000-000000000007'
                and scope is distinct from 'unregistered') then
    raise exception 'FAIL a real sync_runs row was opened for a quarantined run';
  end if;
end $$;

-- =============================================================================================
-- 9. Pass
-- =============================================================================================
select 'phase19_135_136_sync_driver: PASS' as result,
       (select s.status from sync_runs s join _fx19 f on f.sync_run_id = s.id where f.label = 'A') as folded_status,
       (select string_agg(g.stage || '=' || g.status, ', ' order by g.stage)
          from sync_stage_runs g join _fx19 f on f.sync_run_id = g.sync_run_id where f.label = 'A') as stages,
       (select s.notes from sync_runs s join _fx19 f on f.sync_run_id = s.id where f.label = 'F') as interrupted_notes,
       (select count(*) from attention_items a join _fx19 f on a.ref = 'agent_request:' || f.request_id
         where f.label in ('F', 'G') and a.state = 'open') as inbox_items;

rollback;
