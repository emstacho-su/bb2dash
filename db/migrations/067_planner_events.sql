-- bb2dash :: 067_planner_events.sql
-- Phase 11b (docs/planning/69b_PHASE11B_planner_events.md, Contract "Migrations", 067, and PM
-- kickoff notes K-2, K-3, K-4). Worker W-23.
--
-- Contents
--   planner_event_kind                  the six kinds Stack plans with
--   planner_events                      events created in the planner and pushed to Google
--   planner_events_check_time()         BEFORE trigger: IANA zone (K-2) and all-day shape (K-3)
--   planner_events_mark_calendar_dirty  statement trigger that says "the calendar must move"
--
-- ---------------------------------------------------------------------------------------------
-- WHAT A ROW IS
-- ---------------------------------------------------------------------------------------------
-- Something Stack put on his week in bb2dash: an event, a task, out of office, focus time, a
-- working location or an appointment slot. The row is the source of truth and Google only ever
-- receives a copy (migration 068 and calendar-push v4). Nothing here links to assignments, and
-- ticking a task writes `done` on this table only (Q4).
--
-- starts_at / ends_at are INSTANTS. time_zone is the IANA zone the event was entered in, which
-- is how Google and the grid display it; it never changes which instant the row means. SQL
-- never re-derives an instant from a wall clock (K-9: Postgres resolves a DST fold the other way
-- from Temporal's "compatible" rule, so the web converts once and stores the result).
--
-- ---------------------------------------------------------------------------------------------
-- K-2. WHY THE ZONE IS CHECKED BY A TRIGGER AND NOT A CHECK CONSTRAINT
-- ---------------------------------------------------------------------------------------------
-- Postgres accepts POSIX strings such as 'UTC+3' as a zone and reads their sign the opposite
-- way from ISO (three hours WEST); Intl and Google read them differently or reject them. So the
-- rule is: 'UTC', or a name shaped like Area/Location that pg_timezone_names actually knows. A
-- check constraint cannot run that lookup (it is not immutable), so a BEFORE INSERT OR UPDATE
-- trigger enforces it and says which value it refused.
--
-- ---------------------------------------------------------------------------------------------
-- K-3. ALL-DAY ROWS STORE AN EXCLUSIVE END
-- ---------------------------------------------------------------------------------------------
-- all_day = true means starts_at is 00:00 of the first day in time_zone and ends_at is 00:00 of
-- the day AFTER the last day - Google's convention - so a one-day event spans one local day and
-- the view can send (starts_at at time zone time_zone)::date and the same for ends_at.
-- "00:00 local" is accepted in either of two readings, so the database and the web agree at the
-- DST edges in zones whose transitions happen at midnight:
--   * the local wall clock reads 00:00 (covers a repeated midnight, whichever instant was taken);
--   * the instant is Postgres's own resolution of that date's 00:00 (covers a skipped midnight,
--     which both Postgres and Temporal's "compatible" rule move to the first instant of the day).
-- And the local end date must be after the local start date.
--
-- ---------------------------------------------------------------------------------------------
-- WHY A STATEMENT-LEVEL DIRTY TRIGGER
-- ---------------------------------------------------------------------------------------------
-- The same reasoning as 061's trigger on assignments: one write per statement, a no-op when the
-- flag is already up, and a cheap false positive (a notes edit that changes nothing Google sees)
-- costs a push that finds every content_hash unchanged. It is a separate function rather than a
-- second use of assignments_mark_calendar_dirty() so pg_trigger reads truthfully. SECURITY
-- INVOKER: the owner's JWT may write app_settings under its owner policy, the service role
-- bypasses RLS, and a role that cannot write planner_events never gets this far.
--
-- RLS is owner-only for all four verbs in 038's scalar-subquery form (evaluated once per
-- statement, so the auth_rls_initplan advisor stays quiet). anon holds nothing.

-- ---------------------------------------------------------------------------------------------
-- 1. The kind
-- ---------------------------------------------------------------------------------------------
create type planner_event_kind as enum
  ('event','task','out_of_office','focus_time','working_location','appointment_slot');

comment on type planner_event_kind is
  'The six kinds of planner event (Phase 11b). Google accepts outOfOffice, focusTime and '
  'workingLocation only on a primary calendar, so every kind is pushed as an ordinary event whose '
  'title prefix and colour carry the kind.';

-- ---------------------------------------------------------------------------------------------
-- 2. planner_events
-- ---------------------------------------------------------------------------------------------
create table planner_events (
  id            uuid primary key default gen_random_uuid(),
  kind          planner_event_kind not null,
  title         text not null
                check (length(title) between 1 and 200)
                check (btrim(title) <> ''),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  time_zone     text not null default 'America/New_York',   -- IANA name; trigger-checked (K-2)
  all_day       boolean not null default false,              -- exclusive end; trigger-checked (K-3)
  location_kind text check (location_kind in ('in_person','online')),
  location      text check (location is null or length(location) <= 500),
  notes         text check (notes is null or length(notes) <= 2000),
  done          boolean,                                     -- tasks only, null otherwise
  course_id     text references courses(id),                 -- optional; its code leads the title
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint planner_events_ends_after_start check (ends_at >= starts_at),
  -- a place name for in_person, a URL for online, and both null when there is no location
  constraint planner_events_location_pair    check ((location_kind is null) = (location is null)),
  constraint planner_events_online_is_url    check (location_kind is distinct from 'online'
                                                    or location ~* '^https?://[^[:space:]]+$'),
  constraint planner_events_done_iff_task    check ((kind = 'task') = (done is not null))
);

comment on table planner_events is
  'Events Stack creates in the bb2dash planner (Phase 11b): one row per event, task, out of '
  'office, focus time, working location or appointment slot. The source of truth; calendar-push '
  'writes a copy to the bb2dash Google calendar and nothing is ever read back. Never linked to '
  'assignments. Owner-only under RLS for every verb; anon has no access.';
comment on column planner_events.starts_at is
  'The instant the event starts. For an all-day row, 00:00 of the first day in time_zone.';
comment on column planner_events.ends_at is
  'The instant the event ends (>= starts_at; a zero-length task is allowed). For an all-day row, '
  '00:00 of the day AFTER the last day in time_zone - an exclusive end, Google''s convention.';
comment on column planner_events.time_zone is
  'IANA zone the event was entered in (''UTC'' or Area/Location, present in pg_timezone_names). '
  'Google and the grid display the event in it; it does not change the stored instants. POSIX '
  'strings such as UTC+3 are refused by planner_events_check_time().';
comment on column planner_events.location is
  'A place name when location_kind is in_person, an http(s) URL when online, null when there is '
  'no location. An online URL is also written into the Google event description.';
comment on column planner_events.done is
  'Tasks only: false or true. Null for every other kind (check constraint). Ticking it never '
  'touches assignment_progress.';
comment on column planner_events.course_id is
  'Optional course link. Its code leads the Google title; the kind, not the course, sets the '
  'colour.';

-- ---------------------------------------------------------------------------------------------
-- 3. The zone and all-day trigger (K-2, K-3)
-- ---------------------------------------------------------------------------------------------
create or replace function planner_events_check_time() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
declare
  v_local_start timestamp;
  v_local_end   timestamp;
begin
  -- K-2: 'UTC' or Area/Location, and a name the server's zone database actually holds.
  if not (new.time_zone = 'UTC'
          or (new.time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$'
              and exists (select 1 from pg_timezone_names z where z.name = new.time_zone))) then
    raise exception 'planner_events: time_zone % is not an IANA zone name (e.g. America/New_York)',
      quote_literal(new.time_zone)
      using errcode = 'check_violation';
  end if;

  if new.all_day then
    v_local_start := new.starts_at at time zone new.time_zone;
    v_local_end   := new.ends_at   at time zone new.time_zone;

    -- K-3: both instants are local midnights in the event's own zone ...
    if not (v_local_start::time = time '00:00'
            or new.starts_at = (v_local_start::date::timestamp at time zone new.time_zone))
       or not (v_local_end::time = time '00:00'
               or new.ends_at = (v_local_end::date::timestamp at time zone new.time_zone)) then
      raise exception 'planner_events: an all-day event must start and end at 00:00 in %',
        new.time_zone
        using errcode = 'check_violation';
    end if;

    -- ... and the exclusive end falls on a later local date than the start.
    if v_local_end::date <= v_local_start::date then
      raise exception 'planner_events: an all-day event ends at 00:00 of the day after its last day'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

comment on function planner_events_check_time() is
  'BEFORE INSERT OR UPDATE trigger on planner_events. K-2: time_zone must be ''UTC'' or an '
  'Area/Location name present in pg_timezone_names (POSIX strings such as UTC+3 are refused). '
  'K-3: an all-day row starts and ends at local 00:00 in its own zone, and its exclusive end '
  'date is after its start date.';

create trigger planner_events_check_time
  before insert or update on planner_events
  for each row execute function planner_events_check_time();

create trigger planner_events_updated_at
  before update on planner_events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- 4. The dirty trigger
-- ---------------------------------------------------------------------------------------------
create or replace function planner_events_mark_calendar_dirty() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  update app_settings set gcal_dirty = true where id and not gcal_dirty;
  return null;
end $$;

comment on function planner_events_mark_calendar_dirty() is
  'Statement-level AFTER trigger on planner_events: sets app_settings.gcal_dirty so the next '
  'calendar_push_tick fires a push. One write per statement and a no-op when the flag is already '
  'set, like assignments_mark_calendar_dirty (061).';

create trigger planner_events_mark_calendar_dirty
  after insert or update or delete on planner_events
  for each statement execute function planner_events_mark_calendar_dirty();

-- ---------------------------------------------------------------------------------------------
-- 5. RLS: owner only, every verb, 038's form
-- ---------------------------------------------------------------------------------------------
alter table planner_events enable row level security;

create policy planner_events_owner_select on planner_events for select to authenticated
  using ((select auth.uid()) = (select public.app_owner()));
create policy planner_events_owner_insert on planner_events for insert to authenticated
  with check ((select auth.uid()) = (select public.app_owner()));
create policy planner_events_owner_update on planner_events for update to authenticated
  using ((select auth.uid()) = (select public.app_owner()))
  with check ((select auth.uid()) = (select public.app_owner()));
create policy planner_events_owner_delete on planner_events for delete to authenticated
  using ((select auth.uid()) = (select public.app_owner()));

-- ---------------------------------------------------------------------------------------------
-- 6. Privileges. The project's default ACL hands every new table to anon; take it back, and
--    give authenticated exactly the four verbs the policies govern.
-- ---------------------------------------------------------------------------------------------
revoke all on planner_events from anon;
revoke all on planner_events from authenticated;
grant select, insert, update, delete on planner_events to authenticated;
grant select, insert, update, delete on planner_events to service_role;

revoke all on function public.planner_events_check_time() from public, anon, authenticated;
revoke all on function public.planner_events_mark_calendar_dirty() from public, anon, authenticated;
