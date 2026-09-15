-- bb2dash :: 060_calendar_events.sql
-- Phase 11 (docs/planning/69_PHASE11_planner.md, Contract "Migrations", 060). Worker W-21.
--
-- Contents
--   calendar_event_id()     the deterministic Google event id for an assignment
--   calendar_events         the mirror of what has actually been pushed to Google
--   v_calendar_push_items   what SHOULD be on the calendar, with the event instant already
--                           resolved in SQL and the "Blackboard dropped it" flag computed
--
-- ---------------------------------------------------------------------------------------------
-- WHY THE ID IS DERIVED AND NOT STORED
-- ---------------------------------------------------------------------------------------------
-- Google lets the caller choose an event's id, and an insert with an id that already exists
-- returns 409 instead of creating a duplicate. That single property is what makes this push safe
-- to re-run: no cursor, no "did the last run finish", no risk of a second copy of every due date
-- after a crashed run. The id has to be reproducible from the assignment alone, and Google's
-- charset for it is base32hex (0-9, a-v), 5-1024 characters, unique per calendar.
--   'bb' || left(sha256_hex(assignment_id), 32)
-- Hex is a strict subset of base32hex, so 34 hex-safe characters need no re-encoding, and 128
-- bits of a sha256 make a collision across ~80 assignments a non-event. assignments.id is a
-- stable text key ('IST.323/quiz-03'), so the same item always lands on the same event.
--
-- ---------------------------------------------------------------------------------------------
-- WHY calendar_events HAS NO FOREIGN KEY
-- ---------------------------------------------------------------------------------------------
-- Deliberate. An orphan row - a mirror entry whose assignment no longer exists - is exactly how
-- the pusher learns that an event must be DELETED from Google. A foreign key with cascade would
-- silently erase that instruction and leave the event on Stack's calendar forever; a restricting
-- one would make deleting an assignment fail. The mirror is a record of what is on Google, not a
-- child of the assignment.
--
-- ---------------------------------------------------------------------------------------------
-- event_at: Q2, resolved in SQL so that DST is Postgres's problem
-- ---------------------------------------------------------------------------------------------
--   due_at set                              -> that instant, unchanged
--   date-only, type project/exam/final_exam -> the start of that course's class meeting on that
--                                              weekday (America/New_York wall clock)
--   date-only, anything else, or a project/exam/final_exam on a weekday the course does not meet
--                                           -> 23:59 America/New_York
-- "(due_date + start_time) at time zone 'America/New_York'" builds a local timestamp and then
-- asks Postgres which instant that was, so 2026-11-02 10:35 is EST and 2026-09-23 10:35 is EDT
-- without a single line of offset arithmetic. Doing this in TypeScript would mean shipping a
-- timezone table into the edge function and getting the fall-back hour wrong once a year.
-- meetings.day_of_week is ISO (1 = Monday), which is what extract(isodow) returns.
--
-- ---------------------------------------------------------------------------------------------
-- absent_from_blackboard: Q3, the only reason an event is deleted while the row still exists
-- ---------------------------------------------------------------------------------------------
-- Blackboard crawls are appended to the db, never diffed destructively, so "this assignment is
-- gone from Blackboard" is not a column anyone writes - it has to be derived. Three conditions,
-- all required:
--   1. the row is Blackboard-linked at all (bb_item_id is not null). A syllabus-only item was
--      never in Blackboard, so it can never be missing from it, and its event must survive.
--   2. the newest folded Blackboard crawl actually covered this course - there is a bb_raw
--      course payload for courses.bb_id under that run. A crawl that skipped a course says
--      nothing about that course's items.
--   3. stage_assignments did not touch the row during that crawl: bb_last_seen is older than the
--      run's started_at.
-- A null bb_last_seen on a Blackboard-linked row leaves the comparison unknown, and the coalesce
-- resolves that to false: "we cannot tell" must never delete one of Stack's events. If the item
-- reappears in a later crawl its event is re-created under the same deterministic id.
--
-- The view filters in_workload (Q6: readings and attendance are too noisy) and requires a date.
-- It does NOT filter absent_from_blackboard: it exposes the flag, and the pusher drops those
-- rows from the desired set so that step 4 of its diff deletes the events.

-- ---------------------------------------------------------------------------------------------
-- 1. calendar_event_id
-- ---------------------------------------------------------------------------------------------
create or replace function calendar_event_id(p_assignment_id text) returns text
  language sql immutable set search_path = public, pg_temp as $$
  select 'bb' || left(encode(sha256(convert_to(p_assignment_id, 'UTF8')), 'hex'), 32)
$$;

comment on function calendar_event_id(text) is
  'The Google Calendar event id for an assignment: ''bb'' || the first 32 hex characters of '
  'sha256(assignment id). Deterministic, so a re-run addresses the same event instead of '
  'creating a second one, and hex-safe for Google''s base32hex id charset (0-9, a-v).';

-- ---------------------------------------------------------------------------------------------
-- 2. calendar_events - the mirror
-- ---------------------------------------------------------------------------------------------
create table calendar_events (
  assignment_id   text primary key,                 -- no FK on purpose: an orphan row is how
                                                    -- the pusher learns to delete the event
  event_id        text not null unique,             -- 'bb' || left(sha256_hex(assignment_id), 32)
  calendar_id     text not null,                    -- app_settings.gcal_calendar_id at push time
  content_hash    text not null,                    -- sha256 of the canonical event body
  etag            text,
  state           text not null default 'live' check (state in ('live','deleting')),
  last_pushed_at  timestamptz not null default now(),
  last_error      text,
  updated_at      timestamptz not null default now()
);

alter table calendar_events enable row level security;

-- 038's house form: the subselects are evaluated once per statement instead of once per row.
create policy calendar_events_owner_read on calendar_events
  for select to authenticated using ((select auth.uid()) = (select public.app_owner()));
-- no insert/update/delete policy: only the service role (the edge function) writes
revoke all on calendar_events from anon;

comment on table calendar_events is
  'What bb2dash believes is currently on Stack''s Google "bb2dash" calendar: one row per pushed '
  'assignment, keyed by assignment_id with no foreign key so that an orphan row survives to tell '
  'the pusher to delete the event. Written only by the calendar-push edge function (service '
  'role); the owner may read it. Never contains a secret.';
comment on column calendar_events.content_hash is
  'sha256 of the canonical event body the pusher built. Equal hash means Google already holds '
  'this exact event, so the item is skipped with no API call - the whole idempotency proof.';
comment on column calendar_events.state is
  'live, or deleting while a delete is being attempted; a row that reaches Google''s delete (or '
  'a 404, which means it is already gone) is removed from this table entirely.';
comment on column calendar_events.calendar_id is
  'The calendar this event was written to, recorded at push time. If Stack ever points '
  'app_settings.gcal_calendar_id at a different calendar, this column is what says the old '
  'events live somewhere else.';

-- ---------------------------------------------------------------------------------------------
-- 3. v_calendar_push_items - the desired set
-- ---------------------------------------------------------------------------------------------
create or replace view v_calendar_push_items as
with newest_crawl as (
  select s.run_id, s.started_at
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
       coalesce(
         a.bb_item_id is not null
         and exists (select 1
                       from bb_raw b, newest_crawl n
                      where b.run_id = n.run_id
                        and b.kind = 'course'
                        and b.bb_course_id = c.bb_id)
         and a.bb_last_seen < (select n.started_at from newest_crawl n),
         false)                     as absent_from_blackboard
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
 where w.in_workload
   and coalesce(a.due_at::date, a.due_date) is not null;

alter view v_calendar_push_items set (security_invoker = true);

comment on view v_calendar_push_items is
  'Every dated assignment that belongs on the Google calendar (Q6: v_work_items.in_workload, so '
  'no readings and no attendance), with event_at already resolved to an instant - due_at, or '
  'class start for a date-only project/exam/final_exam, or 23:59 America/New_York - and '
  'absent_from_blackboard saying whether the newest folded crawl of that course stopped '
  'reporting the item. The pusher drops absent rows from its desired set, which is what deletes '
  'their events. security_invoker with anon revoked, as 036 requires.';

-- ---------------------------------------------------------------------------------------------
-- 4. Privileges
-- ---------------------------------------------------------------------------------------------
revoke all on v_calendar_push_items from anon;
grant select on v_calendar_push_items to authenticated, service_role;

revoke all on function public.calendar_event_id(text) from public, anon;
grant execute on function public.calendar_event_id(text) to authenticated, service_role;
