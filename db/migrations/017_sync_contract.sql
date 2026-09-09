-- bb2dash :: 017_sync_contract.sql
-- Spec: docs/planning/21_D2_architecture_direction.md section 3.010, renumbered 010 -> 017 by
-- docs/planning/40_RECONCILIATION_2026-09-09.md ("sync contract ... minus the request_id FK").
--
-- sync_runs today is (id, ran_at, source, scope, summary, notes), written after the fact, so a
-- run that dies leaves nothing behind and the GUI cannot say "last sync today 09:14" honestly.
-- Everything below is additive: the 13 historical rows keep every existing column value.
--
-- DEVIATIONS from the local spec, deliberate:
--   * request_id bigint (+ its later FK to agent_requests) is DROPPED per the reconciliation
--     doc; agent_requests is deferred and is not being built.
--   * the sync_runs_summary_envelope check constraint from the spec is NOT applied here. Even
--     as NOT VALID it validates every FUTURE insert, and no current writer (bb-course-pull,
--     the orchestrator runs, the eval pass) emits the counts/changes/errors shape. It lands
--     with the typed envelope in ingest/transform/index.ts, not before.

-- 1. Status columns on sync_runs -------------------------------------------------------------
alter table sync_runs
  add column run_id      uuid,                       -- ties a crawl to bb_raw.run_id
  add column status      text not null default 'ok'
      check (status in ('running','ok','partial','failed')),
  add column started_at  timestamptz,
  add column finished_at timestamptz,
  add column trigger     text check (trigger in ('manual','scheduled','app_request'));

-- Backfill the two new timestamp columns only, from the row's own ran_at, so history is
-- coherent (a completed run with no finish time is not renderable). No pre-existing column is
-- touched; status takes its default 'ok' because all 13 rows are completed runs.
update sync_runs set started_at = ran_at, finished_at = ran_at where finished_at is null;

create index sync_runs_status_idx on sync_runs (status, finished_at desc);

comment on column sync_runs.run_id is 'Crawl correlation id; matches bb_raw.run_id.';
comment on column sync_runs.status is
  'running -> ok|partial|failed. Reaping rule: a running row whose started_at is older than 30 '
  'minutes is presumed dead, rendered as "interrupted", and marked failed by the next run.';
comment on column sync_runs.trigger is 'manual | scheduled | app_request. Null on history.';

-- 2. Per-stage rows ---------------------------------------------------------------------------
-- One sync_runs row per crawl cannot say that grades are two hours old while files are three
-- days old. Each stage writes its own row; this is what v_data_freshness reads.
create table sync_stage_runs (
  id           bigint generated always as identity primary key,
  sync_run_id  bigint not null references sync_runs(id) on delete cascade,
  stage        text not null,     -- 'crawl'|'gradebook'|'announcements'|'assignments'|'content'|'files'|'text'|'classify'
  course_id    text references courses(id),
  status       text not null check (status in ('running','ok','partial','failed','skipped')),
  counts       jsonb not null default '{}',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text
);
create index sync_stage_runs_stage_idx on sync_stage_runs (stage, finished_at desc);

alter table sync_stage_runs enable row level security;
create policy sync_stage_runs_owner_all on sync_stage_runs for all to authenticated using (true) with check (true);

-- 3. Freshness view ---------------------------------------------------------------------------
-- One query, select * from v_data_freshness, feeds every staleness indicator in the app; each
-- surface declares which stage it belongs to.
create view v_data_freshness as
select stage,
       max(finished_at) filter (where status = 'ok')      as fresh_as_of,
       max(finished_at)                                   as last_attempt_at,
       (max(finished_at) filter (where status = 'ok')) is distinct from max(finished_at) as last_attempt_failed
from sync_stage_runs group by stage;

comment on view v_data_freshness is
  'Age of each data class, one row per stage. fresh_as_of = last successful finish; '
  'last_attempt_failed = the most recent attempt did not succeed. Empty until the first '
  'instrumented sync run writes sync_stage_runs rows.';
