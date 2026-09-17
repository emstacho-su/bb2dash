-- bb2dash :: db/tests/phase12b_087_auto_graded_sticks.sql
-- Phase 12b round 3, CR-3. Tests migration 087: the auto-graded step advances an assignment to
-- `graded` only when Blackboard's score is NEW or CHANGED in this fold, so a status Stack moved
-- back himself stands until the score really moves.
--
-- 078 forced `graded` on every fold of the newest crawl. Stack setting an item to "in progress"
-- because he is redoing the attempt, or to "submitted" because he has asked for a regrade, was
-- overwritten by the next transform tick - two minutes later, and every two minutes after that.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. This file rewrites one of Stack's
-- real progress rows and registers two synthetic crawls; its last statement is `rollback`, so
-- none of it survives.

begin;

do $$
declare
  v_run   uuid;  v_sync  bigint;
  v_run2  uuid := '00000000-0087-4000-8000-000000000002';
  v_run3  uuid := '00000000-0087-4000-8000-000000000003';
  v_sync2 bigint; v_sync3 bigint;
  v_col   text;   v_shell text;  v_score numeric;
  r       jsonb;  s       text;
begin
  select s2.run_id, s2.id into v_run, v_sync
    from sync_runs s2
   where s2.source = 'blackboard' and s2.status in ('ok', 'partial')
     and s2.scope is distinct from 'unregistered' and s2.run_id is not null
   order by s2.started_at desc limit 1;
  select bb_column_id into v_col   from assignments where id = 'IST.323/quiz-02';
  select bb_course_id into v_shell from courses     where id = 'IST.323';
  select effective_score into v_score from bb_gradebook
   where run_id = v_run and course_id = 'IST.323' and column_id = v_col;
  if v_col is null or v_score is null then
    raise exception 'FAIL the fixture assignment has no scored gradebook column to test with';
  end if;

  -- ---------------------------------------------------------------------------------------
  -- A. Stack reverts, and the SAME crawl is folded again. A replay must write nothing at all.
  -- ---------------------------------------------------------------------------------------
  update assignment_progress set status = 'in_progress' where assignment_id = 'IST.323/quiz-02';
  r := stage_gradebook(v_run, v_sync);
  if (r->'counts'->>'auto_graded')::int <> 0 then
    raise exception 'FAIL a replay wrote % auto-graded row(s)', r->'counts'->>'auto_graded';
  end if;
  select status::text into s from assignment_progress where assignment_id = 'IST.323/quiz-02';
  if s <> 'in_progress' then
    raise exception 'FAIL a replay turned Stack''s revert into %', s;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- B. A LATER crawl carrying the identical score. Mirrored as history, but nothing advances.
  -- ---------------------------------------------------------------------------------------
  insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
  values ('sync', 'all', 'done', v_run2, '087 test crawl', '087 test', now(), now());
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values (v_run2, 'ok', now(), now(), 'manual', 'blackboard', 'all') returning id into v_sync2;
  insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
  values (v_run2, 'course', v_shell,
          jsonb_build_object('crawler', jsonb_build_object('version', 4),
            'gradebook', jsonb_build_array(jsonb_build_object(
              'columnId', v_col, 'name', 'Quiz #2', 'effectiveScore', v_score, 'isCalc', false))),
          now() + interval '1 hour');

  r := stage_gradebook(v_run2, v_sync2);
  if (r->'counts'->>'inserted')::int <> 1 then
    raise exception 'FAIL the later crawl did not mirror its column: %', r->'counts';
  end if;
  if (r->'counts'->>'auto_graded')::int <> 0 then
    raise exception 'FAIL an unchanged score advanced % row(s)', r->'counts'->>'auto_graded';
  end if;
  select status::text into s from assignment_progress where assignment_id = 'IST.323/quiz-02';
  if s <> 'in_progress' then
    raise exception 'FAIL an identical crawl turned the revert into %', s;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- C. Blackboard really changes the score. Now it advances again - that is the feature.
  -- ---------------------------------------------------------------------------------------
  insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)
  values ('sync', 'all', 'done', v_run3, '087 test crawl', '087 test', now(), now());
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values (v_run3, 'ok', now(), now(), 'manual', 'blackboard', 'all') returning id into v_sync3;
  insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
  values (v_run3, 'course', v_shell,
          jsonb_build_object('crawler', jsonb_build_object('version', 4),
            'gradebook', jsonb_build_array(jsonb_build_object(
              'columnId', v_col, 'name', 'Quiz #2', 'effectiveScore', v_score + 1, 'isCalc', false))),
          now() + interval '2 hours');

  r := stage_gradebook(v_run3, v_sync3);
  if (r->'counts'->>'auto_graded')::int <> 1 then
    raise exception 'FAIL a changed score advanced % row(s), expected 1', r->'counts'->>'auto_graded';
  end if;
  select status::text into s from assignment_progress where assignment_id = 'IST.323/quiz-02';
  if s <> 'graded' then
    raise exception 'FAIL a changed score left the row at %', s;
  end if;

  -- ---------------------------------------------------------------------------------------
  -- D. Stack's judgements are still untouchable, whatever the score does.
  -- ---------------------------------------------------------------------------------------
  update assignment_progress set status = 'excused' where assignment_id = 'IST.323/quiz-02';
  update bb_gradebook set effective_score = v_score + 2 where run_id = v_run3 and column_id = v_col;
  r := stage_gradebook(v_run3, v_sync3);
  select status::text into s from assignment_progress where assignment_id = 'IST.323/quiz-02';
  if s <> 'excused' then
    raise exception 'FAIL an excused row became %', s;
  end if;

  update assignment_progress set status = 'missed' where assignment_id = 'IST.323/quiz-02';
  r := stage_gradebook(v_run3, v_sync3);
  select status::text into s from assignment_progress where assignment_id = 'IST.323/quiz-02';
  if s <> 'missed' then
    raise exception 'FAIL a missed row became %', s;
  end if;
end $$;

-- =============================================================================================
-- The two new predicates are really in the body
-- =============================================================================================
do $$
declare def text;
begin
  def := pg_get_functiondef('public.stage_gradebook(uuid,bigint)'::regprocedure);
  if position('v_is_newest and v_ins > 0' in def) = 0 then
    raise exception 'FAIL the auto-graded step still runs on a replay';
  end if;
  if position('prev.effective_score is distinct from' in def) = 0 then
    raise exception 'FAIL the auto-graded step still ignores whether the score moved';
  end if;
  if position($q$status in ('not_started', 'planned', 'in_progress', 'submitted')$q$ in def) = 0 then
    raise exception 'FAIL the auto-graded step lost its forward-only gate';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_087_auto_graded_sticks: PASS'                                      as result,
       (select count(*) from assignment_progress where status = 'graded')           as graded_rows,
       (select count(*) from assignment_progress
         where status in ('planned', 'waived', 'not_applicable'))                   as retired_rows;

rollback;
