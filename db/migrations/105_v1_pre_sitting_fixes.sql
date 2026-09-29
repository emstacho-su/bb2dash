-- 105_v1_pre_sitting_fixes.sql
-- Phase 16 · R-29, R-30, P-1. Three data fixes that must land before the first V-1 sitting.
--
--   1. IST.466/major-project-1-synchrony.confidence confirmed -> tentative (B-9 default). The
--      schedule lists both days of each Major Project pair without naming groups (DECISIONS
--      2026-09-15), so the 2026-10-20 date is as unsure as major-project-2's 11/17, which is
--      already tentative. The date itself stays: 084's out-of-term guard fires before the
--      tentative overwrite, and item 145 carries the standing keep (task 9's test replays it).
--   2. grade_components 24 (IST.466 major_cases) notes: "Major Case Group #3" -> "Major Case
--      Group #2". Stack is Major Case Group 2 (DECISIONS 2026-09-22); the notes were missed.
--   3. Two "Not graded" grade_column_links rows for the GEO.103 attendance columns, each a posted
--      0.000 out of 100 (B-10, P-1): (GEO.103.lecture, _3602583_1) "Absences" and
--      (GEO.103.recitation, _3602445_1) "Attendance". The picker writes exactly this row shape,
--      but is not offered on a confirmed link (linkStates, web/src/lib/grade-model-view.ts).
--      057's one-target check holds: component_id null, excluded true.
--
-- Data only. Every write is row-count guarded (079's pattern). A _105_before snapshot proves
-- assignment_progress and reading_progress unchanged (078's pattern) and is dropped at the end.
-- No top-level transaction statement: the dry run and apply_migration supply the wrapper.

-- =============================================================================================
-- 0. Snapshot of Stack's planner state: row count and a whole-row fingerprint per table
-- =============================================================================================
create temp table _105_before as
select 'assignment_progress'::text as tbl, count(*) as n,
       md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as fingerprint
  from assignment_progress t
union all
select 'reading_progress', count(*),
       md5(coalesce(string_agg(t::text, '|' order by t::text), ''))
  from reading_progress t;

-- =============================================================================================
-- 1-3. The fixes
-- =============================================================================================
do $$
declare
  n integer;
begin
  -- 1. major-project-1 back to tentative, matching major-project-2.
  update assignments
     set confidence = 'tentative',
         updated_at = now()
   where id = 'IST.466/major-project-1-synchrony'
     and confidence = 'confirmed';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '105: expected 1 confirmed IST.466/major-project-1-synchrony row, updated %', n;
  end if;

  -- 2. Component 24's group number.
  update grade_components
     set notes = replace(notes, 'Major Case Group #3', 'Major Case Group #2')
   where id = 24
     and course_id = 'IST.466'
     and code = 'major_cases'
     and notes like '%Major Case Group #3%';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '105: expected 1 IST.466 major_cases component (id 24) naming Group #3, updated %', n;
  end if;

  -- 3. The two GEO.103 attendance columns marked "Not graded". A row already on either key means
  --    someone decided it since this file was written: stop rather than overwrite that decision.
  select count(*) into n
    from grade_column_links
   where (course_id, column_id) in (('GEO.103.lecture', '_3602583_1'),
                                    ('GEO.103.recitation', '_3602445_1'));
  if n <> 0 then
    raise exception '105: % grade_column_links row(s) already on the GEO.103 attendance columns', n;
  end if;

  insert into grade_column_links (course_id, column_id, component_id, excluded)
  values ('GEO.103.lecture',    '_3602583_1', null, true),    -- Absences
         ('GEO.103.recitation', '_3602445_1', null, true);    -- Attendance
  get diagnostics n = row_count;
  if n <> 2 then
    raise exception '105: expected 2 GEO.103 "Not graded" links inserted, inserted %', n;
  end if;
end $$;

-- =============================================================================================
-- 4. Guard: Stack's planner state did not move
-- =============================================================================================
do $$
declare
  moved text;
begin
  select string_agg(b.tbl, ', ' order by b.tbl) into moved
    from _105_before b
    join (select 'assignment_progress'::text as tbl, count(*) as n,
                 md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as fingerprint
            from assignment_progress t
          union all
          select 'reading_progress', count(*),
                 md5(coalesce(string_agg(t::text, '|' order by t::text), ''))
            from reading_progress t) a on a.tbl = b.tbl
   where a.n <> b.n or a.fingerprint <> b.fingerprint;
  if moved is not null then
    raise exception '105: planner state changed: %', moved;
  end if;
end $$;

drop table _105_before;
