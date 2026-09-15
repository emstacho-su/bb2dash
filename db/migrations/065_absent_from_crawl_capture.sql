-- bb2dash :: 065_absent_from_crawl_capture.sql
-- Phase 11, round 2 (docs/planning/69_PHASE11_planner.md, "Round 2", R2-1). Worker W-21.
-- 060-064 are applied and byte-frozen; this recreates one view and nothing else.
--
-- ---------------------------------------------------------------------------------------------
-- THE BUG: two different clocks, three minutes apart
-- ---------------------------------------------------------------------------------------------
-- 060 implemented the Contract's rule literally - an item is missing from Blackboard when its
-- bb_last_seen is older than the newest folded run's `sync_runs.started_at`. Measured on prod,
-- that made 22 of the 64 push-set rows "absent" although every one of them is in the newest
-- crawl's payload, and the first live push would have deleted 22 of Stack's events.
--
-- The two timestamps are not the same clock:
--   bb_raw.captured_at      when the browser crawled that course   2026-09-14 17:19:21..17:19:31
--   sync_runs.started_at    when the transform folded the crawl    2026-09-14 17:22:00
-- stage_assignments stamps bb_last_seen with the crawl row's captured_at, so EVERY item the crawl
-- saw carries a timestamp roughly three minutes older than started_at, and "older than the fold"
-- is true for all of them. The comparison had no discriminating power at all.
--
-- THE FIX is to compare like with like: bb_last_seen against the captured_at of the very bb_raw
-- row the stage read. An item present in that crawl carries exactly that captured_at, so
-- `<` is false for it and true only for an item the crawl did not report.
--
-- Everything else about the rule is unchanged and is repeated here because the view is recreated
-- whole: a syllabus-only row (bb_item_id null) can never be absent, and a course with no bb_raw
-- `course` row under that run was not crawled at all, so its items are not absent either - the
-- left join yields a null captured_at and the coalesce resolves the unknown to false. "We cannot
-- tell" must never delete one of Stack's events.
--
-- NOT FIXED HERE, and reported to the PM instead: two IST.323 rows (`fp-proposal` and
-- `fp-log-final`) share one bb_item_id (_12983388_1) and one bb_column_id (_3569973_1). The item
-- IS in the newest crawl's payload, but stage_assignments re-stamped neither row, so both still
-- carry bb_last_seen from 2026-09-02 and this corrected rule reports them absent. That is a
-- Phase 9 staging question about duplicate bb_item_id, not a calendar question, and Phase 11
-- does not edit Phase 9 functions. See 69a_W21_VERIFICATION.md section 4.

create or replace view v_calendar_push_items as
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
select a.id                         as assignment_id,
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
                false)              as absent_from_blackboard
  from assignments a
  join courses c      on c.id = a.course_id
  join v_work_items w on w.item_kind = 'assignment' and w.item_id = a.id
  left join lateral (
       select mm.start_time
         from meetings mm
        where mm.course_id = a.course_id
          and mm.day_of_week = extract(isodow from a.due_date)::smallint
          and mm.start_time is not null
          and (mm.starts_on is null or a.due_date >= mm.starts_on)
          and (mm.ends_on   is null or a.due_date <= mm.ends_on)
        order by mm.start_time
        limit 1) m on true
  -- When this course was crawled in the newest folded run. Null when the run skipped it, which
  -- is the "says nothing about that course" case. At most one row: bb_raw is unique on
  -- (run_id, kind, coalesce(bb_course_id, '')) since migration 035.
  left join lateral (
       select b.captured_at
         from bb_raw b, newest_crawl n
        where b.run_id = n.run_id
          and b.kind = 'course'
          and b.bb_course_id = c.bb_id
        limit 1) crawl on true
 where w.in_workload
   and coalesce(a.due_at::date, a.due_date) is not null;

alter view v_calendar_push_items set (security_invoker = true);

comment on view v_calendar_push_items is
  'Every dated assignment that belongs on the Google calendar (Q6: v_work_items.in_workload, so '
  'no attendance and no syllabus readings), with event_at already resolved to an instant - '
  'due_at, or class start for a date-only project/exam/final_exam, or 23:59 America/New_York - '
  'and absent_from_blackboard saying whether the newest folded crawl of that course stopped '
  'reporting the item. Absent means: the row is Blackboard-linked, that crawl did cover its '
  'course, and bb_last_seen is older than THAT CRAWL ROW''s captured_at - the same clock '
  'stage_assignments stamps with, not the later sync_runs.started_at (migration 065). The '
  'pusher drops absent rows from its desired set, which is what deletes their events. '
  'security_invoker with anon revoked, as 036 requires.';

-- Recreating a view resets nothing here (create or replace keeps grants and reloptions), but the
-- two lines below are the ones 036's guard and the Phase 8 review care about, so they are stated
-- rather than assumed.
revoke all on v_calendar_push_items from anon;
grant select on v_calendar_push_items to authenticated, service_role;
