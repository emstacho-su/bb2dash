-- bb2dash :: 107_gradebook_counts_toward_links.sql
-- Phase 16. Audit: docs/planning/sprint-2/verification/115_SQL_UNITS_AUDIT_2026-10-09.md, section C.
-- Worker W-93. 047 stays byte-frozen; this re-creates one of its views.
--
-- THE PROBLEM
--   v_gradebook_latest.counts_toward_grade (047) is coalesce(bool_or(assignments.component_id is
--   not null), false) over the assignments linked to the column. It never reads grade_column_links,
--   the table the Grades tab's "Counts toward..." picker writes (057). The grade model view already
--   follows the link (081, the column_items CTE), so the figure and the Grades table disagree:
--     * a column placed on a component with the picker, whose assignment has no component of its own,
--       reads false (GEO.103.lecture/exam-1 on prod);
--     * a column marked "Not graded" (an excluded link), whose assignment still carries a component,
--       reads true, so the Grades table lists it among the items (the two GEO.103 attendance columns).
--
-- THE FIX, one expression: for a gradebook row (course_id, column_id), counts_toward_grade is
--     false  when a grade_column_links row for it is excluded;
--     true   else when a grade_column_links row for it is not excluded (057 gives it a component);
--     else   what it was: bool_or(component_id is not null) over the linked assignments, false when
--            there are none.
--   The expression is marked "-- 107:" below.
--
-- WHAT DOES NOT CHANGE
--   `create or replace view` with the same 36 columns in the same order, names and types, the same
--   rows, security_invoker, and the grants (create or replace keeps them). The five views that read
--   this one (v_assignment_grade, v_course_grade, v_grade_model_items, v_grade_model_total,
--   v_assignment_attempts) are not re-created. No table, no data, no grant is touched; this
--   migration writes nothing. The live text of the view is 047's: no later migration re-created it
--   (grep v_gradebook_latest db/migrations: 046 and 047 define it, the rest only read it).
--   On prod, in a rolled-back transaction, exactly three rows change: exam-1 to true, the two
--   attendance columns to false.
--
-- Unit: db/tests/phase16_107_counts_toward_links.sql. No top-level transaction statement.

create or replace view public.v_gradebook_latest
  with (security_invoker = true) as
with latest as (
  select distinct on (gb.course_id, gb.column_id) gb.*
    from bb_gradebook gb
   where exists (select 1 from sync_runs s
                  where s.run_id = gb.run_id and s.scope is distinct from 'unregistered')
   order by gb.course_id, gb.column_id, gb.seen_at desc, gb.id desc
)
select l.id,
       l.run_id,
       l.sync_run_id,
       l.course_id,
       l.column_id,
       l.name,
       l.position,
       l.content_id,
       l.category_id,
       l.possible,
       l.due_at,
       l.calc_type,
       l.is_calc,
       l.is_total,
       l.column_kind,
       l.aggregation,
       l.visible,
       l.grades_released,
       l.multiple_attempts,
       l.attempts_left,
       l.effective_score,
       l.manual_score,
       l.display_score,
       l.display_grade,
       l.is_override,
       l.is_exempt,
       l.feedback,
       l.submission_status,
       l.last_attempt_status,
       l.last_attempt_created,
       l.last_attempt_submitted,
       l.last_attempt_score,
       l.seen_at,
       lk.assignment_id,
       lk.linked_assignments,
       lk.counts_toward_grade
  from latest l
  left join lateral (
    select case when count(*) = 1 then min(a.id) end            as assignment_id,
           count(*)::int                                        as linked_assignments,
           -- 107: the picker's link decides first (excluded = false, placed = true);
           -- only with no link does the assignments rule of 047 apply.
           case
             when exists (select 1 from grade_column_links lnk
                           where lnk.course_id = l.course_id and lnk.column_id = l.column_id
                             and lnk.excluded) then false
             when exists (select 1 from grade_column_links lnk
                           where lnk.course_id = l.course_id and lnk.column_id = l.column_id
                             and not lnk.excluded and lnk.component_id is not null) then true
             else coalesce(bool_or(a.component_id is not null), false)
           end                                                  as counts_toward_grade
      from assignments a
     where a.course_id = l.course_id and a.bb_column_id = l.column_id) lk on true;

comment on view public.v_gradebook_latest is
  'The newest bb_gradebook row per (course_id, column_id) from a registered crawl, plus the '
  'assignments link. assignment_id is the ONE assignments row carrying this bb_column_id and is '
  'null when there are none or more than one; linked_assignments says which. '
  'counts_toward_grade follows the Grades tab''s picker (107): false when grade_column_links marks '
  'the column "Not graded", true when a grade_column_links row places it on a component, else true '
  'when a linked assignment has a grade_components link (V-1''s data - 10a reads it and never sets '
  'it). It decides whether an attendance column renders among the items or in the bookkeeping '
  'group.';

-- =============================================================================================
-- Guard: the view is what 107 says it is
-- =============================================================================================
do $$
declare
  -- The 36 columns, in order, exactly as 047 created them. create or replace cannot reorder them,
  -- and this list is what the five dependent views and the web layer read.
  expected_columns constant text[] := array[
    'id', 'run_id', 'sync_run_id', 'course_id', 'column_id', 'name', 'position', 'content_id',
    'category_id', 'possible', 'due_at', 'calc_type', 'is_calc', 'is_total', 'column_kind',
    'aggregation', 'visible', 'grades_released', 'multiple_attempts', 'attempts_left',
    'effective_score', 'manual_score', 'display_score', 'display_grade', 'is_override', 'is_exempt',
    'feedback', 'submission_status', 'last_attempt_status', 'last_attempt_created',
    'last_attempt_submitted', 'last_attempt_score', 'seen_at', 'assignment_id',
    'linked_assignments', 'counts_toward_grade'];
  actual_columns text[];
begin
  if not exists (select 1 from pg_class c
                  where c.oid = 'public.v_gradebook_latest'::regclass
                    and 'security_invoker=true' = any (c.reloptions)) then
    raise exception '107: v_gradebook_latest is not security_invoker';
  end if;
  if has_table_privilege('anon', 'public.v_gradebook_latest', 'select') then
    raise exception '107: anon can select v_gradebook_latest';
  end if;
  if not has_table_privilege('authenticated', 'public.v_gradebook_latest', 'select') then
    raise exception '107: authenticated cannot select v_gradebook_latest';
  end if;

  select array_agg(c.column_name::text order by c.ordinal_position) into actual_columns
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'v_gradebook_latest';
  if actual_columns is distinct from expected_columns then
    raise exception '107: v_gradebook_latest columns are %, expected %', actual_columns, expected_columns;
  end if;

  if position('grade_column_links' in pg_get_viewdef('public.v_gradebook_latest'::regclass)) = 0 then
    raise exception '107: v_gradebook_latest does not read grade_column_links';
  end if;
end $$;
