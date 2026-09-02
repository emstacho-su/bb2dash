-- bb2dash :: 002_raw_landing.sql
-- Raw landing zone for Blackboard crawls. One row per (run, course|calendar|memberships). Immutable; transforms read from here.
create table bb_raw (
  id           bigint generated always as identity primary key,
  run_id       uuid not null,
  captured_at  timestamptz not null default now(),
  bb_course_id text,
  kind         text not null,        -- 'course' | 'calendar' | 'memberships'
  payload      jsonb not null,
  bytes        integer generated always as (octet_length(payload::text)) stored
);
create index bb_raw_run_idx on bb_raw (run_id, kind);
alter table bb_raw enable row level security;
create policy bb_raw_owner_all on bb_raw for all to authenticated using (true) with check (true);
-- Browser-side crawler posts with the anon/publishable key: insert-only, no read-back.
create policy bb_raw_anon_insert on bb_raw for insert to anon with check (true);
