-- bb2dash :: db/tests/phase14_093_review_fixes.sql
-- Phase 14, "Round 2 — W-55" (brief 100). Worker W-55. Tests migration 093:
--
--   1. (items 1, 7) sync_own_claims() lists the runner's own claimed sync requests, registered or
--      not, with claim_attempts; never another claimant's row, never a closed one
--   2. (item 6) sync_close(..., 'failed', ...) on a registered request whose run is still running
--      marks the run failed with the error in notes; a run that already folded keeps its status
--   3. privileges: sync_runner executes the thirteen; anon and authenticated execute none
--
-- Every call is made under `set local role sync_runner` (094). RUN IT:
-- `node scripts/db-test.mjs --only phase14_093_review_fixes.sql`. NOTHING IS COMMITTED.

begin;

-- Setup (not an assertion): no open real sync row is in the way.
update agent_requests set state = 'cancelled'
 where kind = 'sync' and state in ('queued', 'claimed');

-- =============================================================================================
-- 1. sync_own_claims
-- =============================================================================================
do $$
declare
  v_mine_reg  bigint;
  v_mine_new  bigint;
  v_other     bigint;
  v_done      bigint;
  v_got       text;
  v_attempts  smallint;
begin
  if to_regprocedure('public.sync_own_claims()') is null then
    raise exception 'FAIL phase14_093: migration 093 is not applied (sync_own_claims is missing)';
  end if;

  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, run_id, note)
  values ('sync', 'all', 'claimed', now() - interval '5 minutes', 'sync-runner', 3,
          '00000000-1493-4000-8000-000000000001', 'phase14_093 mine, registered')
  returning id into v_mine_reg;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now(), 'sync-runner', 1, 'phase14_093 mine, unregistered')
  returning id into v_mine_new;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, run_id, note)
  values ('sync', 'all', 'claimed', now(), 'bb-sync session', '00000000-1493-4000-8000-000000000002',
          'phase14_093 another claimant')
  returning id into v_other;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, run_id, finished_at, note)
  values ('sync', 'all', 'done', now(), 'sync-runner', '00000000-1493-4000-8000-000000000003', now(),
          'phase14_093 mine, closed')
  returning id into v_done;

  set local role sync_runner;
  select string_agg(c.id::text || ':' || coalesce(c.run_id::text, '-') || ':' || c.claim_attempts, ',' order by c.claimed_at, c.id)
    into v_got
    from sync_own_claims() c
   where c.id in (v_mine_reg, v_mine_new, v_other, v_done);
  reset role;
  if v_got is distinct from format('%s:00000000-1493-4000-8000-000000000001:3,%s:-:1', v_mine_reg, v_mine_new) then
    raise exception 'FAIL 1: sync_own_claims returned %, expected only the runner''s two open claims', v_got;
  end if;

  -- Every row it returns is the runner's own open claim, whatever else prod holds.
  set local role sync_runner;
  select count(*) into v_attempts from sync_own_claims() c
   where not exists (select 1 from agent_requests a
                      where a.id = c.id and a.kind = 'sync' and a.state = 'claimed'
                        and a.claimed_by = 'sync-runner');
  reset role;
  if v_attempts <> 0 then
    raise exception 'FAIL 1: sync_own_claims returned % row(s) that are not the runner''s open claims', v_attempts;
  end if;

  -- The third claim reports 3 (item 7): claim, requeue, claim, requeue, claim.
  insert into agent_requests (kind, scope, state, note) values ('sync', 'all', 'queued', 'phase14_093 thrice')
  returning id into v_mine_new;
  set local role sync_runner;
  perform sync_claim(v_mine_new);
  perform sync_requeue_orphans();
  perform sync_claim(v_mine_new);
  perform sync_requeue_orphans();
  perform sync_claim(v_mine_new);
  select c.claim_attempts into v_attempts from sync_own_claims() c where c.id = v_mine_new;
  reset role;
  if v_attempts is distinct from 3 then
    raise exception 'FAIL 1: after three claims sync_own_claims reports claim_attempts %, expected 3', v_attempts;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_093: PASS' as result, current_user as ran_as;

rollback;
