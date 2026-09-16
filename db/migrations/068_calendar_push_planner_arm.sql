-- bb2dash :: 068_calendar_push_planner_arm.sql
-- Phase 11b (docs/planning/69b_PHASE11B_planner_events.md, Contract "Migrations", 068, and PM
-- kickoff notes K-5, K-6). Worker W-23.
-- 001-067 are applied and byte-frozen; this renames one column, adds one, swaps one primary key
-- and recreates one view.
--
-- Contents
--   calendar_events         assignment_id -> ref_id, + source, primary key (source, ref_id)
--   v_calendar_push_items   v2: leading source / ref_id / event_id, plus the planner arm
--
-- ---------------------------------------------------------------------------------------------
-- K-5. THIS MIGRATION BREAKS calendar-push v3, SO IT LANDS INSIDE A CUT-OVER
-- ---------------------------------------------------------------------------------------------
-- v3 reads calendar_events.assignment_id and orders the view by assignment_id. The rename below
-- makes its mirror read fail the moment this commits (a failed run, never a destructive one).
-- The order, with timestamps in docs/planning/69c_W23_VERIFICATION.md:
--   1. app_settings.gcal_enabled = false, and no push holds the lock (gcal_push_run_id is null)
--   2. apply this migration
--   3. deploy calendar-push v4 (verify_jwt false)
--   4. one push must report zero inserts, patches and deletes on the assignment arm
--   5. gcal_enabled = true
-- Step 4 is the proof that every existing row kept its event id: the rename carries every value
-- across untouched, source defaults every existing row to 'assignment', and event_id is not
-- recomputed anywhere.
--
-- "View-compatible rename" (Contract) is read as K-5 reads it: the column becomes ref_id, and
-- the VIEW keeps an assignment_id column (null on planner rows) so any reader of the view that
-- only knows assignments keeps working. Nothing depends on the view or the table (checked on
-- prod before writing this), so the view is dropped and recreated with a new column order, and
-- security_invoker, the anon revoke and the grants are applied again.
--
-- ---------------------------------------------------------------------------------------------
-- THE ASSIGNMENT ARM IS 066's VIEW, COLUMN FOR COLUMN
-- ---------------------------------------------------------------------------------------------
-- Same joins, same event_at rule, same absent_from_blackboard rule, same filters. calendar-push
-- v4 builds the assignment event body from exactly the columns v3 read, so any drift here would
-- move every content_hash and patch all of Stack's due-date events. The new columns on this arm
-- are all null except the three leading ones.
--
-- ---------------------------------------------------------------------------------------------
-- THE PLANNER ARM (K-6)
-- ---------------------------------------------------------------------------------------------
--   event_id    'pe' || the first 32 hex characters of sha256(planner_events.id::text).
--               Hex is inside Google's base32hex id charset, and the 'pe' prefix cannot collide
--               with an assignment's 'bb'.
--   summary     [<course code> . ]<kind label> . <title>, joined with a middle dot (U+00B7,
--               written as a Unicode escape so this file stays ASCII). concat_ws skips the null
--               course code of an event with no course. v4 prefixes a check mark to the whole
--               summary for a task that is done.
--   kind_label  exactly: Event, Task, Out of office, Focus time, Working location,
--               Appointment slot. The description's "bb2dash: <kind label>" line uses it.
--   starts_at / ends_at / time_zone   the stored instants and the event's own zone; v4 sends
--               the instants as dateTime with timeZone = time_zone, so Google keeps the instant
--               and displays it in that zone.
--   start_date / end_date   all-day rows only: the local dates in time_zone. end_date is the
--               exclusive end migration 067 enforces (K-3), which is Google's convention too.
--   week_start  the Monday of the planner week the "open in bb2dash" link opens: the New York
--               date of starts_at for a timed event, the local start date for an all-day one
--               (K-9: the grid places an all-day event on its own dates, whatever its zone).
--               date_trunc('week', ...) is ISO, so Monday.
--   event_at    starts_at, so the column means "when" on both arms.
--   absent_from_blackboard   false: a planner event is never in Blackboard.

-- ---------------------------------------------------------------------------------------------
-- 1. calendar_events: keyed by (source, ref_id)
-- ---------------------------------------------------------------------------------------------
alter table calendar_events rename column assignment_id to ref_id;

alter table calendar_events
  add column source text not null default 'assignment'
    constraint calendar_events_source_values check (source in ('assignment','planner'));

alter table calendar_events drop constraint calendar_events_pkey;
alter table calendar_events add constraint calendar_events_pkey primary key (source, ref_id);

comment on table calendar_events is
  'What bb2dash believes is currently on Stack''s Google "bb2dash" calendar: one row per pushed '
  'item, keyed by (source, ref_id) - an assignment id or a planner_events uuid - with no foreign '
  'key so that an orphan row survives to tell the pusher to delete the event. Written only by the '
  'calendar-push edge function (service role); the owner may read it. Never contains a secret.';
comment on column calendar_events.ref_id is
  'assignments.id when source is assignment, planner_events.id (as text) when source is planner. '
  'Named assignment_id until migration 068; every existing row kept its value and its event_id.';
comment on column calendar_events.source is
  'Which arm of v_calendar_push_items the event came from: assignment (a due date) or planner (an '
  'event Stack created in the planner). Existing rows defaulted to assignment in migration 068.';

-- ---------------------------------------------------------------------------------------------
-- 2. v_calendar_push_items v2
-- ---------------------------------------------------------------------------------------------
drop view v_calendar_push_items;

create view v_calendar_push_items as
with newest_crawl as (
  select s.run_id
    from sync_runs s
   where s.source = 'blackboard'
     and s.status in ('ok','partial')
     and s.scope is distinct from 'unregistered'
     and s.run_id is not null
   order by s.started_at desc nulls last
   limit 1
)
select 'assignment'::text           as source,
       a.id                         as ref_id,
       calendar_event_id(a.id)      as event_id,
       a.id                         as assignment_id,
       a.course_id,
       c.subject || ' ' || c.number as course_code,
       a.title,
       a.type::text                 as type,
       a.due_at,
       a.due_date,
       case
         when a.due_at is not null then a.due_at
         when a.type in ('project','exam','final_exam') and m.start_time is not null
           then (a.due_date + m.start_time) at time zone 'America/New_York'
         else (a.due_date + time '23:59') at time zone 'America/New_York'
       end                          as event_at,
       a.points_possible,
       w.status,
       coalesce(a.bb_item_id is not null and a.bb_last_seen < crawl.captured_at,
                false)              as absent_from_blackboard,
       null::text                   as kind,
       null::text                   as kind_label,
       null::text                   as summary,
       null::timestamptz            as starts_at,
       null::timestamptz            as ends_at,
       null::text                   as time_zone,
       null::boolean                as all_day,
       null::date                   as start_date,
       null::date                   as end_date,
       null::date                   as week_start,
       null::text                   as location_kind,
       null::text                   as location,
       null::text                   as notes,
       null::boolean                as done
  from assignments a
  join courses c      on c.id = a.course_id
  join v_work_items w on w.item_kind = 'assignment' and w.item_id = a.id
  -- meetings.day_of_week is 0 = Sunday (066), which is extract(dow).
  left join lateral (
       select mm.start_time
         from meetings mm
        where mm.course_id = a.course_id
          and mm.day_of_week = extract(dow from a.due_date)::smallint
          and mm.start_time is not null
          and (mm.starts_on is null or a.due_date >= mm.starts_on)
          and (mm.ends_on   is null or a.due_date <= mm.ends_on)
        order by mm.start_time
        limit 1) m on true
  -- When this course was crawled in the newest folded run (065).
  left join lateral (
       select b.captured_at
         from bb_raw b, newest_crawl n
        where b.run_id = n.run_id
          and b.kind = 'course'
          and b.bb_course_id = c.bb_id
        limit 1) crawl on true
 where w.in_workload
   and coalesce(a.due_at::date, a.due_date) is not null

union all

select 'planner'::text              as source,
       p.id::text                   as ref_id,
       'pe' || left(encode(sha256(convert_to(p.id::text, 'UTF8')), 'hex'), 32)
                                    as event_id,
       null::text                   as assignment_id,
       p.course_id,
       pc.subject || ' ' || pc.number
                                    as course_code,
       p.title,
       null::text                   as type,
       null::timestamptz            as due_at,
       null::date                   as due_date,
       p.starts_at                  as event_at,
       null::numeric(7,2)           as points_possible,
       null::text                   as status,
       false                        as absent_from_blackboard,
       p.kind::text                 as kind,
       k.label                      as kind_label,
       concat_ws(U&' \00B7 ', pc.subject || ' ' || pc.number, k.label, p.title)
                                    as summary,
       p.starts_at,
       p.ends_at,
       p.time_zone,
       p.all_day,
       case when p.all_day then (p.starts_at at time zone p.time_zone)::date end
                                    as start_date,
       case when p.all_day then (p.ends_at at time zone p.time_zone)::date end
                                    as end_date,
       date_trunc('week',
                  case when p.all_day then (p.starts_at at time zone p.time_zone)::date
                       else (p.starts_at at time zone 'America/New_York')::date end)::date
                                    as week_start,
       p.location_kind,
       p.location,
       p.notes,
       p.done
  from planner_events p
  left join courses pc on pc.id = p.course_id
  cross join lateral (
       select case p.kind
                when 'event'            then 'Event'
                when 'task'             then 'Task'
                when 'out_of_office'    then 'Out of office'
                when 'focus_time'       then 'Focus time'
                when 'working_location' then 'Working location'
                when 'appointment_slot' then 'Appointment slot'
              end as label) k;

alter view v_calendar_push_items set (security_invoker = true);

comment on view v_calendar_push_items is
  'Everything that belongs on the Google "bb2dash" calendar, one row per item, keyed by (source, '
  'ref_id) with the deterministic Google event_id. source = assignment: every dated assignment in '
  'the workload, event_at resolved in SQL and absent_from_blackboard computed exactly as in 066. '
  'source = planner (068): every planner_events row with its summary, kind_label, instants, zone, '
  'all-day local dates (exclusive end), week_start for the bb2dash link, location, notes and done. '
  'assignment_id is kept for readers that only know assignments and is null on planner rows. '
  'security_invoker with anon revoked, as 036 requires.';

-- ---------------------------------------------------------------------------------------------
-- 3. Privileges. A dropped view loses its grants; these are the ones 060-066 established.
-- ---------------------------------------------------------------------------------------------
revoke all on v_calendar_push_items from anon;
grant select on v_calendar_push_items to authenticated, service_role;
