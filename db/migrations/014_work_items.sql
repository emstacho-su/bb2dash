-- bb2dash :: 014_work_items.sql
-- v_work_items: the one view every planner surface reads (21_D2 §3.016, renumbered per
-- docs/planning/40_RECONCILIATION_2026-09-09.md), plus the suggested-start rule from
-- 20_D1 §3.
--
-- Why the view exists: there are 86 readings against 66 assignments and the tracker legend
-- leads with "R reading", but v_upcoming/v_overdue read `assignments` only, so readings
-- cannot render at all. Those two views also key on coalesce(due_at::date, due_date), so
-- assignments with neither date are invisible everywhere. v_work_items unions both kinds,
-- keeps finished and missed items visible (a calendar strip needs them as "done", not gone),
-- and flags undated rows instead of dropping them.
--
-- v_upcoming and v_overdue are left untouched for compatibility; the app reads v_work_items
-- and filters.

-- ---------------------------------------------------------------------------
-- Suggested start date (20_D1 §3): start = due - (ceil(effort / 2) - 1) days, stepping back
-- over dates that have a sessions.kind = 'no_class' row for that course, so a 10-point final
-- does not get a lead that runs straight through Thanksgiving. Weekends are NOT skipped —
-- that is deliberate (seven courses; weekends are working days).
-- ---------------------------------------------------------------------------
create or replace function suggested_start(p_course_id text, p_due date, p_effort numeric)
returns date
language sql stable as $$
  select case
           when p_course_id is null or p_due is null or p_effort is null then null
           else coalesce(
             (select g.d::date
              from generate_series(p_due - 60, p_due, interval '1 day') g(d)
              where not exists (
                select 1 from sessions s
                where s.course_id = p_course_id
                  and s.session_date = g.d::date
                  and s.kind = 'no_class')
              order by g.d desc
              offset greatest(ceil(p_effort / 2)::int - 1, 0)
              limit 1),
             p_due - greatest(ceil(p_effort / 2)::int - 1, 0))
         end;
$$;

comment on function suggested_start(text, date, numeric) is
  'Suggested start date for a work item: due minus (ceil(effort/2) - 1) days, skipping the course''s no_class dates (20_D1 §3). Weekends are not skipped.';

-- ---------------------------------------------------------------------------
-- v_work_items
--   item_kind      'assignment' | 'reading'
--   due_on         coalesce(due_at::date, due_date) for assignments, for_date for readings
--   undated        true when the item has no date at all -> the undated tray, no bar
--   status         coalesce(<progress>.status, 'not_started'), never null
--   effort         always populated, always with effort_source alongside it
--   in_workload    false for meeting/attendance/participation: excluded from day-load sums
--
-- Readings all score the reading base (1) in v1. 20_D1 §3's deliberate omission: only 13 of
-- 86 readings link to harvested text with a char_count, and 13 of 86 is not enough coverage
-- to score by length. This overrides 21_D2 §3.016's required-vs-optional 1.0/0.5 split, per
-- the reconciliation's adoption of "the effort model in full (20_D1 §3)".
-- ---------------------------------------------------------------------------
create view v_work_items as
select 'assignment'::text                          as item_kind,
       a.id::text                                  as item_id,
       a.course_id,
       a.title,
       a.type::text                                as type,
       e.category,
       e.glyph,
       e.in_workload,
       a.due_at,
       coalesce(a.due_at::date, a.due_date)        as due_on,
       a.due_rule,
       a.points_possible,
       a.submission::text                          as submission,
       a.series_key,
       a.sequence_no,
       coalesce(p.status, 'not_started')::text     as status,
       p.priority::text                            as priority,
       e.effort,
       e.effort_source,
       e.is_override,
       e.multiplier_applied,
       suggested_start(a.course_id, coalesce(a.due_at::date, a.due_date), e.effort) as suggested_start,
       (coalesce(a.due_at::date, a.due_date) is null) as undated,
       a.confidence::text                          as confidence
from assignments a
join v_assignment_effort e        on e.id = a.id
left join assignment_progress p   on p.assignment_id = a.id
union all
select 'reading'::text,
       r.id::text,
       r.course_id,
       r.citation,
       'reading'::text,
       'reading'::text,
       'R'::text,
       true,
       null::timestamptz,
       r.for_date,
       null::text,
       null::numeric,
       null::text,
       null::text,
       null::smallint,
       coalesce(rp.status, 'not_started')::text,
       null::text,
       coalesce((select b.base from effort_base b where b.type = 'reading'), 2.0),
       'base'::text,
       false,
       false,
       suggested_start(r.course_id, r.for_date,
                       coalesce((select b.base from effort_base b where b.type = 'reading'), 2.0)),
       (r.for_date is null),
       r.confidence::text
from readings r
left join reading_progress rp on rp.reading_id = r.id;

comment on view v_work_items is
  'Union of assignments and readings for every planner surface: due_on, undated flag, coalesced planner status, effort with its source label, glyph/category, in_workload and the suggested start date. v_upcoming/v_overdue stay as-is for compatibility.';
