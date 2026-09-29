-- bb2dash :: db/tests/phase16_105_pre_sitting_fixes.sql
-- Phase 16, task 9 (R-29, R-30, P-1). Tests migration 105_v1_pre_sitting_fixes, so it passes only
-- once 105 is on prod:
--   1. IST.466/major-project-1-synchrony is tentative again (B-9).
--   2. A stage_assignments replay of the newest registered crawl keeps its due_date at 2026-10-20
--      and raises nothing on its ref: tentative is 084's overwrite switch, and the out-of-term
--      guard (IST.466's 2021 column dates, DECISIONS 2026-09-22) has to fire before it.
--   3. Component 24's notes name Major Case Group #2, not #3.
--   4. The two GEO.103 attendance columns carry "Not graded" links (B-10, P-1).
--
-- RUN IT: node scripts/db-test.mjs --only phase16_105_pre_sitting_fixes.sql. Section 2 folds
-- the newest crawl; the file's last statement is `rollback`, so none of it survives.

begin;

-- =============================================================================================
-- 1. major-project-1 is tentative, still dated 2026-10-20
-- =============================================================================================
do $$
declare r record;
begin
  select confidence::text as confidence, due_date, due_at into r
    from assignments where id = 'IST.466/major-project-1-synchrony';
  if not found then
    raise exception 'FAIL IST.466/major-project-1-synchrony is missing';
  end if;
  if r.confidence is distinct from 'tentative' then
    raise exception 'FAIL major-project-1 confidence is %, expected tentative', r.confidence;
  end if;
  if r.due_date is distinct from date '2026-10-20' then
    raise exception 'FAIL major-project-1 due_date is %, expected 2026-10-20', r.due_date;
  end if;
end $$;

-- =============================================================================================
-- 2. A replay of the newest registered crawl keeps the date and raises nothing on the row
-- =============================================================================================
do $$
declare
  v_ref    constant text := 'IST.466/major-project-1-synchrony';
  v_run    uuid;
  v_sync   bigint;
  v_before int;
  v_after  int;
  v_due    date;
  v_due_at timestamptz;
  a        record;
  r        jsonb;
begin
  select s.run_id, s.id into v_run, v_sync
    from sync_runs s
   where s.source = 'blackboard' and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered' and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1;
  if v_run is null then
    raise exception 'FAIL there is no folded Blackboard crawl to replay';
  end if;

  select due_date, due_at into v_due, v_due_at from assignments where id = v_ref;
  select count(*) into v_before from attention_items where ref = v_ref;

  r := stage_assignments(v_run, v_sync);
  if r->>'status' <> 'ok' then
    raise exception 'FAIL the replay failed: %', r;
  end if;

  select count(*) into v_after from attention_items where ref = v_ref;
  if v_after <> v_before then
    raise exception 'FAIL the replay raised % attention_items row(s) on %', v_after - v_before, v_ref;
  end if;

  select confidence::text as confidence, due_date, due_at into a from assignments where id = v_ref;
  if a.due_date is distinct from date '2026-10-20' or a.due_date is distinct from v_due
     or a.due_at is distinct from v_due_at then
    raise exception 'FAIL the replay moved major-project-1: due_date % -> %, due_at % -> %',
      v_due, a.due_date, v_due_at, a.due_at;
  end if;
  if a.confidence is distinct from 'tentative' then
    raise exception 'FAIL the replay set major-project-1 confidence to %', a.confidence;
  end if;
end $$;

-- =============================================================================================
-- 3. Component 24 names Group #2
-- =============================================================================================
do $$
declare v_notes text;
begin
  select notes into v_notes from grade_components
   where id = 24 and course_id = 'IST.466' and code = 'major_cases';
  if v_notes is null then
    raise exception 'FAIL component 24 (IST.466 major_cases) is missing or has no notes';
  end if;
  if position('Major Case Group #2' in v_notes) = 0 then
    raise exception 'FAIL component 24 notes do not name Major Case Group #2: %', v_notes;
  end if;
  if position('Major Case Group #3' in v_notes) > 0 then
    raise exception 'FAIL component 24 notes still name Major Case Group #3: %', v_notes;
  end if;
end $$;

-- =============================================================================================
-- 4. Two "Not graded" links on the GEO.103 attendance columns
-- =============================================================================================
do $$
declare n int;
begin
  select count(*) into n
    from grade_column_links
   where (course_id, column_id) in (('GEO.103.lecture', '_3602583_1'),
                                    ('GEO.103.recitation', '_3602445_1'))
     and excluded and component_id is null;
  if n <> 2 then
    raise exception 'FAIL % of 2 GEO.103 attendance columns are linked "Not graded"', n;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase16_105_pre_sitting_fixes: PASS' as result,
       (select count(*) from grade_column_links)                           as links,
       (select confidence::text from assignments
         where id = 'IST.466/major-project-1-synchrony')                   as major_project_1;

rollback;
