-- bb2dash :: 061_calendar_push_state.sql
-- Phase 11 (docs/planning/69_PHASE11_planner.md, Contract "Migrations", 061). Worker W-21.
--
-- Contents
--   app_settings.gcal_*                the switch, the calendar id, and the in-flight bookkeeping
--   calendar_push_runs                 one row per push run - the push's own log
--   assignments_mark_calendar_dirty    the statement trigger that says "something moved"
--
-- ---------------------------------------------------------------------------------------------
-- WHY A SEPARATE RUN TABLE AND NOT sync_runs
-- ---------------------------------------------------------------------------------------------
-- sync_runs.source is an enum shared with the Activity feed and its filter. Adding a 'gcal'
-- value would mean editing the enum, the Activity filter and v_data_freshness, and it would put
-- "calendar pushed" rows in the same list as "Blackboard crawled" - a different kind of event
-- with a different failure mode. The Contract's seam rule is that Phase 11 never edits the
-- Phase 9 driver, so the push gets its own table, its own cron job and its own reaper, and the
-- definition of done's "sync_stage_runs row per push run" reads as calendar_push_runs from here.
--
-- ---------------------------------------------------------------------------------------------
-- WHY A STATEMENT-LEVEL TRIGGER, AND WHY ON assignments ONLY
-- ---------------------------------------------------------------------------------------------
-- The push has to know that something worth pushing changed. Every writer of a due date ends up
-- in one place - an INSERT/UPDATE/DELETE on assignments - whether it is stage_assignments during
-- a transform, apply_resolutions() applying one of Stack's Inbox answers, or Stack editing a row
-- by hand. Watching that one table covers all three without a single edit to a Phase 9 function.
--
-- FOR EACH STATEMENT, not FOR EACH ROW: a transform that touches 80 assignments would otherwise
-- fire 80 updates of the same one-row table, each taking the same row lock. The flag is a
-- boolean - one write per statement says everything 80 would have said.
--
-- The trigger is deliberately over-eager. A title change or a points change also sets the flag,
-- and the push will then find every content_hash unchanged and make zero Google calls. A cheap
-- false positive is the right trade against a missed date change, and the no-op run is exactly
-- the idempotency proof the definition of done asks for.
--
-- SECURITY INVOKER (the default), because the Contract does not ask for definer here: the owner
-- policy on app_settings already lets Stack's JWT and the service role write the flag, and the
-- transform runs as postgres. A role that cannot see app_settings also cannot write assignments.

-- ---------------------------------------------------------------------------------------------
-- 1. app_settings gains the calendar-push state. Additive; nothing existing is touched.
-- ---------------------------------------------------------------------------------------------
alter table app_settings
  add column gcal_enabled           boolean not null default false,
  add column gcal_calendar_id       text,
  add column gcal_dirty             boolean not null default false,
  add column gcal_push_request_id   bigint,
  add column gcal_push_requested_at timestamptz,
  add column gcal_last_push_at      timestamptz,
  add column gcal_last_status       text,
  add column gcal_last_error        text;

-- The push must never write to the account's default calendar. This is the database half of
-- that promise; the edge function reads the id only from here and refuses a null.
alter table app_settings
  add constraint app_settings_gcal_calendar_not_primary
    check (gcal_calendar_id is null or gcal_calendar_id <> 'primary');

alter table app_settings
  add constraint app_settings_gcal_last_status_values
    check (gcal_last_status is null or gcal_last_status in ('ok','partial','failed'));

comment on column app_settings.gcal_enabled is
  'Master switch. The PM flips it to true after Stack finishes the one-time Google setup; while '
  'it is false calendar_push_tick() fires nothing and the edge function refuses to run.';
comment on column app_settings.gcal_calendar_id is
  'The id of the dedicated "bb2dash" calendar Stack created by hand, written by '
  'scripts/google-consent.mjs. A check constraint refuses the literal ''primary'' so a '
  'misconfiguration cannot scribble on his personal calendar.';
comment on column app_settings.gcal_dirty is
  'Something in assignments changed since the last fully successful push. Set by the statement '
  'trigger assignments_mark_calendar_dirty, cleared only by a push that finished with status '
  'ok - a partial or failed run leaves it set so the next tick retries.';
comment on column app_settings.gcal_push_request_id is
  'pg_net request id of the push currently in flight, else null. Non-null is the lock that stops '
  'a second tick firing a concurrent push; the tick''s reaper clears it after 30 minutes.';
comment on column app_settings.gcal_last_status is
  'ok / partial / failed, from the last push that finished, whatever its outcome.';

-- ---------------------------------------------------------------------------------------------
-- 2. calendar_push_runs - the push's own log
-- ---------------------------------------------------------------------------------------------
create table calendar_push_runs (
  id           bigint generated always as identity primary key,
  trigger      text not null check (trigger in ('scheduled','manual')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running','ok','partial','failed')),
  counts       jsonb not null default '{}'::jsonb,   -- {scanned, inserted, patched, deleted, unchanged, failed}
  error        text
);

alter table calendar_push_runs enable row level security;

create policy calendar_push_runs_owner_read on calendar_push_runs
  for select to authenticated using ((select auth.uid()) = (select public.app_owner()));
-- no insert/update/delete policy: the tick (postgres) and the edge function (service role) write
revoke all on calendar_push_runs from anon;

comment on table calendar_push_runs is
  'One row per Google Calendar push run. Opened as running by calendar_push_tick() (or by the '
  'edge function itself when it is invoked by hand), closed by the edge function with its counts '
  '- scanned, inserted, patched, deleted, unchanged, failed. Deliberately not sync_runs: the '
  'push is not a Blackboard sync and must not appear in the Activity feed or in freshness.';
comment on column calendar_push_runs.trigger is
  'scheduled when calendar_push_tick() fired it; manual when the function was invoked directly '
  'without a run id (the PM''s acceptance script).';
comment on column calendar_push_runs.status is
  'running until the function reports; then ok (every item succeeded), partial (some items '
  'failed, the rest went through) or failed (the run could not start or could not authenticate).';

-- ---------------------------------------------------------------------------------------------
-- 3. The dirty trigger
-- ---------------------------------------------------------------------------------------------
create or replace function assignments_mark_calendar_dirty() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  -- `not gcal_dirty` keeps an already-dirty settings row untouched, so a long transform does not
  -- rewrite it once per statement and updated_at keeps meaning "configuration changed".
  update app_settings set gcal_dirty = true where id and not gcal_dirty;
  return null;
end $$;

comment on function assignments_mark_calendar_dirty() is
  'Statement-level AFTER trigger on assignments: sets app_settings.gcal_dirty so the next '
  'calendar_push_tick fires a push. One write per statement, not per row, and a no-op when the '
  'flag is already set. Covers the transform, apply_resolutions() and hand edits alike, which is '
  'why no Phase 9 function had to be touched.';

create trigger assignments_mark_calendar_dirty
  after insert or update or delete on assignments
  for each statement execute function assignments_mark_calendar_dirty();

-- ---------------------------------------------------------------------------------------------
-- 4. Privileges. A trigger function needs no runtime EXECUTE (it is checked at CREATE TRIGGER),
--    and it returns `trigger`, so PostgREST cannot expose it either way. Revoked regardless.
-- ---------------------------------------------------------------------------------------------
revoke all on function public.assignments_mark_calendar_dirty() from public, anon, authenticated;

grant select on calendar_push_runs to authenticated, service_role;
grant insert, update on calendar_push_runs to service_role;
