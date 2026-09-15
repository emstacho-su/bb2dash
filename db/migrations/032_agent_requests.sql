-- bb2dash :: 032_agent_requests.sql
-- Phase 9 (docs/planning/62_PHASE9_sync_loop.md, "Migration 032 - agent_requests").
-- DDL from docs/planning/21_D2_architecture_direction.md section 3.012.
--
-- Why: this is the app-to-agent direction, and the only durable one. The web app cannot run a
-- Claude session, and Stack may close the tab between asking for a sync and the sync happening.
-- The Sync button inserts a row here; the bb-sync skill claims it, runs the crawl, and closes
-- it. transform_tick() (migration 035) drains the 'transform' kind on its own.
--
-- DEVIATIONS from the D2 DDL, deliberate:
--   * The `alter table sync_runs add constraint sync_runs_request_fk` line is DROPPED. Migration
--     019 already dropped the sync_runs.request_id column it referenced (per
--     docs/planning/40_RECONCILIATION_2026-09-09.md), so there is nothing to point at. The link
--     runs the other way: agent_requests.sync_run_id.
--   * The kind check lists only 'sync' and 'transform'. D2 listed nine kinds for skills that do
--     not exist; a check constraint that permits states nothing can produce is not a contract,
--     it is decoration. Widen it in the phase that adds the next kind.
--   * An index on sync_run_id. D2 indexes only the queue; an unindexed foreign key trips the
--     Supabase performance advisor.
--
-- RLS owner-scoped exactly like migration 020.

create table agent_requests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('sync','transform')),
  scope       text,                         -- course id, assignment id, or 'all'
  params      jsonb not null default '{}',
  note        text,                         -- what Stack typed, when he typed anything
  state       text not null default 'queued'
      check (state in ('queued','claimed','done','failed','cancelled')),
  claimed_at  timestamptz,
  claimed_by  text,                         -- session label, free text
  finished_at timestamptz,
  sync_run_id bigint references sync_runs(id),
  result      jsonb
);

create index agent_requests_queue_idx on agent_requests (state, created_at);
create index agent_requests_sync_run_idx on agent_requests (sync_run_id);

alter table agent_requests enable row level security;
create policy agent_requests_owner_all on agent_requests for all to authenticated
  using (auth.uid() = public.app_owner()) with check (auth.uid() = public.app_owner());

comment on table agent_requests is
  'Durable app-to-agent queue. The app inserts (Sync button, Run transform); an agent or '
  'transform_tick() claims and closes. Kinds this phase: sync (needs a logged-in Blackboard '
  'tab, so a human runs the bb-sync skill) and transform (the cron drains it unattended).';
comment on column agent_requests.claimed_by is
  'Free-text session label of whoever claimed the row - a Claude session id, or '
  '''transform_tick'' when the cron took it. Advisory only; the state column is the lock.';
comment on column agent_requests.sync_run_id is
  'The sync_runs row this request produced, once it produced one. Replaces D2''s '
  'sync_runs.request_id, which migration 019 dropped.';
