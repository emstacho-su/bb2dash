-- bb2dash :: 089_work_items_due_on_new_york.sql
-- Phase 12b post-MVP tail, round 3 (found in the PM's browser walk). Worker W-35.
-- A `create or replace view` of v_work_items and nothing else: the same 24 columns in the same
-- order with the same types, the same security_invoker, the same privileges. Three expressions
-- change; 016 and 073 stay byte-frozen.
--
-- ---------------------------------------------------------------------------------------------
-- THE BUG: `::date` ON A timestamptz USES THE SESSION ZONE, AND THE SERVER'S IS UTC
-- ---------------------------------------------------------------------------------------------
-- `due_on` was `coalesce(a.due_at::date, a.due_date)`. On Supabase every connection runs with
-- TimeZone = UTC, so `a.due_at::date` is the UTC date of the instant, not Stack's date. Every
-- Blackboard deadline at 11:59 PM New York is 03:59 or 04:59 the NEXT day in UTC, so it landed
-- on the wrong day on every planner surface that reads due_on - Today, the tracker, Undated,
-- workload, the course stream.
--
-- Measured on prod before this migration: 44 assignments carry a due_at, 38 of them with no
-- due_date to fall back on, and **22 of the 44** had a due_on one day later than the day Stack
-- sees in New York. The PM's example: IST.323/lab-1-performing-a-ransomware-attack, due_at
-- 2026-09-24 03:59+00 - Wednesday the 23rd at 11:59 PM in New York - read due_on = 2026-09-24.
--
-- THE FIX: read the LOCAL date, `(a.due_at at time zone 'America/New_York')::date`, in all three
-- places that derived a day from the instant - `due_on`, the `suggested_start(...)` argument and
-- the `undated` flag. The expression is repeated rather than factored into a lateral so that this
-- file is the smallest possible diff against 073's definition.
--
-- This is the instant -> local date direction, which is unambiguous (an instant has exactly one
-- local date in a given zone), so 067's K-9 rule is untouched: nothing here rebuilds an instant
-- from a wall clock. `due_at` itself is still emitted exactly as stored, and the reading arm is
-- unchanged - `readings.for_date` is already a date.
--
-- 'America/New_York' is hard-coded here for the same reason the rest of the schema hard-codes it
-- (060's event_at, 068's week_start): bb2dash is one person's Syracuse timetable. If that ever
-- stops being true it becomes a setting, in one migration, in all of those places at once.
--
-- ---------------------------------------------------------------------------------------------
-- WHAT DEPENDS ON THIS VIEW
-- ---------------------------------------------------------------------------------------------
-- `v_course_stream` (reads due_on - it gets the fix, which is the point) and
-- `v_calendar_push_items` (reads only w.status and w.in_workload from here; its own event_at is
-- built from a.due_at / a.due_date directly). So the Google mirror does not move: no content
-- hash changes and the next push is a zero-write run. `create or replace view` keeps the column
-- list identical, so neither dependent needs recreating.

-- =============================================================================================
-- The view
-- =============================================================================================
create or replace view v_work_items
  with (security_invoker = true) as
select 'assignment'::text                          as item_kind,
       a.id::text                                  as item_id,
       a.course_id,
       a.title,
       a.type::text                                as type,
       e.category,
       e.glyph,
       (e.in_workload and not a.hidden_from_workload) as in_workload,
       a.due_at,
       coalesce((a.due_at at time zone 'America/New_York')::date, a.due_date) as due_on,
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
       suggested_start(a.course_id,
                       coalesce((a.due_at at time zone 'America/New_York')::date, a.due_date),
                       e.effort)                   as suggested_start,
       (coalesce((a.due_at at time zone 'America/New_York')::date, a.due_date) is null) as undated,
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
       (r.required is not false),
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
  'Union of assignments and readings for every planner surface: due_on, undated flag, coalesced '
  'planner status, effort with its source label, glyph/category, in_workload and the suggested '
  'start date. v_upcoming/v_overdue stay as-is for compatibility. in_workload (073): an assignment '
  'counts when its type counts (effort_base) AND Stack has not set hidden_from_workload; a reading '
  'counts when required is not false. Rows are never dropped - hidden work is still listed in '
  'Materials, the gradebook and the course pages. due_on (089): the NEW YORK date of due_at, not '
  'its UTC date - a cast alone uses the session zone, which is UTC on this server, so every '
  '11:59 PM deadline used to land on the next day.';

-- =============================================================================================
-- Privileges, re-stated (036's rule). These are the same three statements 073 ran; nothing about
-- who can read this view changes.
-- =============================================================================================
alter view v_work_items set (security_invoker = true);
revoke all on v_work_items from public, anon;
grant select on v_work_items to authenticated, service_role;

-- =============================================================================================
-- Guards: the shape, the setting and the boundary are what they were
-- =============================================================================================
do $$
declare
  n_cols int;
  bad    text;
begin
  select count(*) into n_cols from information_schema.columns
   where table_schema = 'public' and table_name = 'v_work_items';
  if n_cols <> 24 then
    raise exception '089: v_work_items has % columns, expected 24', n_cols;
  end if;

  if not exists (select 1 from pg_options_to_table(
                   (select reloptions from pg_class where oid = 'v_work_items'::regclass))
                  where option_name = 'security_invoker' and option_value = 'true') then
    raise exception '089: v_work_items lost security_invoker';
  end if;

  select string_agg(grantee || ' ' || privilege_type, ', ') into bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'v_work_items' and grantee in ('anon', 'PUBLIC');
  if bad is not null then
    raise exception '089: v_work_items is readable by %', bad;
  end if;

  -- No UTC date survives anywhere in the definition.
  if pg_get_viewdef('v_work_items'::regclass, true) like '%a.due_at::date%' then
    raise exception '089: v_work_items still casts due_at to a date without a zone';
  end if;
end $$;
