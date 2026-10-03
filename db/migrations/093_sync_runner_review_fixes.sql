-- bb2dash :: db/migrations/093_sync_runner_review_fixes.sql
-- Phase 14 (docs/planning/sprint-2/briefs/100_PHASE14_containers.md), "Round 2 — W-55", from
-- `/code-review main high` on the phase branch, 2026-10-03. Worker W-55. 091 and 094 stay
-- byte-frozen; this file holds every SQL fix of the round (088's precedent).
--
-- WHAT
--   1. (item 1, item 7) `sync_own_claims()`: the sync runner's own claimed sync requests, as
--      (id, run_id, claimed_at, claim_attempts). The runner resumes the registered ones it never
--      closed (a fold-wait timeout, a stop during the wait, a throw after `sync_register_run`):
--      once the tick has folded such a run, 136's terminal rule never touches it,
--      `sync_requeue_orphans` skips it, and `sync_enqueue` would return its id for good. It reads
--      `claimed_by = 'sync-runner'` rows only, so the runner never sees, let alone closes, a claim
--      it did not make. `claim_attempts` is the column's value for the report (item 7).
--
-- Privileges: revoked from public, anon, authenticated and service_role; granted to sync_runner
-- only. sync_runner's SECURITY DEFINER set grows from twelve to thirteen.

-- =============================================================================================
-- 1. sync_own_claims
-- =============================================================================================
create or replace function public.sync_own_claims()
  returns table (id bigint, run_id uuid, claimed_at timestamptz, claim_attempts smallint)
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select a.id, a.run_id, a.claimed_at, a.claim_attempts
      from agent_requests a
     where a.kind = 'sync' and a.state = 'claimed' and a.claimed_by = 'sync-runner'
     order by a.claimed_at, a.id;
end $$;

comment on function public.sync_own_claims() is
  'The sync runner''s own claimed sync requests (093): (id, run_id, claimed_at, claim_attempts) where '
  'claimed_by = sync-runner. The runner resumes the registered ones it never closed, and reports '
  'claim_attempts. Never another claimant''s row. sync_runner only.';

revoke all on function public.sync_own_claims() from public, anon, authenticated, service_role;
grant execute on function public.sync_own_claims() to sync_runner;
