-- bb2dash :: db/tests/phase12b_078_status_fold_and_auto_graded.sql
-- Phase 12b, item S-1, database half (P-grades-7). Tests migration 078:
--   * no row in either progress table holds `planned`, `waived` or `not_applicable`;
--   * `stage_gradebook` advances a scored assignment to `graded` from the four values
--     AUTO_GRADED_FROM lists in web/src/lib/progress-status.ts, and from nothing else - `excused`
--     and `missed` are Stack's judgement and survive a fold untouched;
--   * a second fold of the same crawl writes 0, and an older crawl writes 0 whatever it carries.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Section 3 deliberately rewrites
-- the status of seven of Stack's rows and folds a crawl twice; the file's last statement is
-- `rollback`, so none of it survives.

begin;

-- =============================================================================================
-- 1. The fold left nothing behind
-- =============================================================================================
do $$
declare left_over text;
begin
  select string_agg(q.t || ' ' || q.s, ', ') into left_over
    from (select 'assignment_progress' as t, status::text as s from assignment_progress
           where status in ('planned', 'waived', 'not_applicable')
          union all
          select 'reading_progress', status::text from reading_progress
           where status in ('planned', 'waived', 'not_applicable')) q;
  if left_over is not null then
    raise exception 'FAIL a retired status is still stored: %', left_over;
  end if;

  -- The enum itself is untouched: migrations are additive.
  if (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
       where t.typname = 'progress_status') <> 9 then
    raise exception 'FAIL progress_status no longer has its nine values';
  end if;
end $$;

-- =============================================================================================
-- 2. The step is in stage_gradebook, with the same four source values as progress-status.ts
-- =============================================================================================
do $$
declare def text;
begin
  def := pg_get_functiondef('public.stage_gradebook(uuid,bigint)'::regprocedure);
  if position('auto_graded' in def) = 0 then
    raise exception 'FAIL stage_gradebook does not report auto_graded';
  end if;
  if position($q$status in ('not_started', 'planned', 'in_progress', 'submitted')$q$ in def) = 0 then
    raise exception 'FAIL stage_gradebook does not gate the write on AUTO_GRADED_FROM';
  end if;
  if position('excused' in def) > 0 or position('missed' in def) > 0 then
    raise exception 'FAIL stage_gradebook mentions excused or missed - it must never write them';
  end if;
end $$;

-- =============================================================================================
-- 3. Behaviour on the newest crawl
-- =============================================================================================
create temp table _078_run on commit drop as
select s.run_id, s.id as sync_run_id
  from sync_runs s
 where s.source = 'blackboard' and s.status in ('ok', 'partial')
   and s.scope is distinct from 'unregistered' and s.run_id is not null
 order by s.started_at desc nulls last
 limit 1;

create temp table _078_older on commit drop as
select s.run_id, s.id as sync_run_id
  from sync_runs s
 where s.source = 'blackboard' and s.status in ('ok', 'partial')
   and s.scope is distinct from 'unregistered' and s.run_id is not null
   and s.run_id <> (select run_id from _078_run)
 order by s.started_at desc nulls last
 limit 1;

create temp table _078_cand on commit drop as
select a.id, row_number() over (order by a.id) as rn
  from bb_gradebook g
  join assignments a on a.course_id = g.course_id and a.bb_column_id = g.column_id
 where g.run_id = (select run_id from _078_run)
   and g.column_kind = 'item'
   and g.effective_score is not null
   and coalesce(g.is_exempt, false) = false
   and (select count(*) from assignments a2
         where a2.course_id = g.course_id and a2.bb_column_id = g.column_id) = 1;

do $$
declare
  r        jsonb;
  n        int;
  v_status text;
begin
  if (select count(*) from _078_cand) < 7 then
    raise exception 'FAIL only % scored assignments to test with, need 7', (select count(*) from _078_cand);
  end if;

  -- One row per interesting starting point.
  insert into assignment_progress (assignment_id, status)
  select c.id,
         (array['not_started','planned','in_progress','submitted','excused','missed','graded'])[c.rn]::progress_status
    from _078_cand c where c.rn <= 7
  on conflict (assignment_id) do update set status = excluded.status;

  -- Everything on those rows except `status`, as it stands before the fold. Several of them carry
  -- scores, notes and graded_at from Stack's own editing; none of it may move.
  drop table if exists pg_temp._078_pre;
  create temp table _078_pre as
  select p.* from assignment_progress p join _078_cand c on c.id = p.assignment_id;

  r := stage_gradebook((select run_id from _078_run), (select sync_run_id from _078_run));
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the fold failed: %', r;
  end if;
  if (r->'counts'->>'older_run')::boolean then
    raise exception 'FAIL the newest crawl was treated as an older run';
  end if;

  -- The four that AUTO_GRADED_FROM allows moved, and only those four.
  select count(*) into n
    from assignment_progress p join _078_cand c on c.id = p.assignment_id
   where c.rn <= 4 and p.status = 'graded';
  if n <> 4 then
    raise exception 'FAIL % of the 4 advanceable rows read graded', n;
  end if;
  if (r->'counts'->>'auto_graded')::int <> 4 then
    raise exception 'FAIL auto_graded reported %, expected 4', r->'counts'->>'auto_graded';
  end if;

  select p.status::text into v_status
    from assignment_progress p join _078_cand c on c.id = p.assignment_id where c.rn = 5;
  if v_status <> 'excused' then
    raise exception 'FAIL an excused row was overwritten with %', v_status;
  end if;
  select p.status::text into v_status
    from assignment_progress p join _078_cand c on c.id = p.assignment_id where c.rn = 6;
  if v_status <> 'missed' then
    raise exception 'FAIL a missed row was overwritten with %', v_status;
  end if;

  -- Nothing but `status` is written: the sync does not touch Stack's planner fields.
  if exists (
    select 1 from _078_pre b join assignment_progress p on p.assignment_id = b.assignment_id
     where (p.priority, p.planned_start, p.planned_finish, p.est_minutes, p.submitted_at,
            p.graded_at, p.score, p.score_max, p.letter, p.feedback, p.notes, p.effort_override)
        is distinct from
           (b.priority, b.planned_start, b.planned_finish, b.est_minutes, b.submitted_at,
            b.graded_at, b.score, b.score_max, b.letter, b.feedback, b.notes, b.effort_override)) then
    raise exception 'FAIL the auto-graded step wrote something other than status';
  end if;

  -- 4. A replay writes nothing.
  r := stage_gradebook((select run_id from _078_run), (select sync_run_id from _078_run));
  if (r->'counts'->>'auto_graded')::int <> 0 then
    raise exception 'FAIL a replay wrote % auto-graded row(s)', r->'counts'->>'auto_graded';
  end if;
end $$;

-- =============================================================================================
-- 5. An older crawl writes nothing, whatever it carries
-- =============================================================================================
do $$
declare
  r        jsonb;
  v_status text;
begin
  if not exists (select 1 from _078_older) then
    raise exception 'FAIL there is no older registered crawl to test the guard with';
  end if;

  update assignment_progress set status = 'submitted'
   where assignment_id = (select id from _078_cand where rn = 1);

  r := stage_gradebook((select run_id from _078_older), (select sync_run_id from _078_older));
  if not (r->'counts'->>'older_run')::boolean then
    raise exception 'FAIL the older crawl was treated as the newest';
  end if;
  if (r->'counts'->>'auto_graded')::int <> 0 then
    raise exception 'FAIL an older crawl wrote % auto-graded row(s)', r->'counts'->>'auto_graded';
  end if;

  select status::text into v_status from assignment_progress
   where assignment_id = (select id from _078_cand where rn = 1);
  if v_status <> 'submitted' then
    raise exception 'FAIL an older crawl moved a row to %', v_status;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_078_status_fold_and_auto_graded: PASS'                             as result,
       (select count(*) from assignment_progress where status = 'graded')           as graded_rows,
       (select count(*) from assignment_progress where status = 'excused')          as excused_rows,
       (select count(*) from assignment_progress
         where status in ('planned', 'waived', 'not_applicable'))                   as retired_rows;

rollback;
