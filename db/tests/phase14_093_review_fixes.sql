-- bb2dash :: db/tests/phase14_093_review_fixes.sql
-- Phase 14, "Round 2 — W-55" (brief 100). Worker W-55. Tests migration 093:
--
--   1. (items 1, 7) sync_own_claims() lists the runner's own claimed sync requests, registered or
--      not, with claim_attempts; never another claimant's row, never a closed one
--   2. (item 6) sync_close(..., 'failed', ...) on a registered request whose run is still running
--      marks the run failed with the error in notes; a run that already folded keeps its status
--   3. privileges: sync_runner executes the fourteen (the thirteen and 180's
--      sync_request_inbox_apply); anon and authenticated execute none
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
  v_ids       bigint[];
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
  -- (The ids are read as sync_runner, which cannot read the table; the check runs as the test role.)
  set local role sync_runner;
  select coalesce(array_agg(c.id), '{}') into v_ids from sync_own_claims() c;
  reset role;
  select count(*) into v_attempts from unnest(v_ids) i
   where not exists (select 1 from agent_requests a
                      where a.id = i and a.kind = 'sync' and a.state = 'claimed'
                        and a.claimed_by = 'sync-runner');
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
-- 2. A failed close fails a still-running run (item 6); a finished run keeps its status
-- =============================================================================================
do $$
declare
  v_a    bigint;
  v_b    bigint;
  v_run  record;
begin
  insert into agent_requests (kind, scope, state, note) values ('sync', 'all', 'queued', 'phase14_093 crawl threw')
  returning id into v_a;
  set local role sync_runner;
  perform sync_claim(v_a);
  perform sync_register_run(v_a, '00000000-1493-4000-8000-000000000011');
  perform sync_close(v_a, 'failed', '{"lines": ["Sync runner: crawl failed: TypeError"], "error": "crawl failed: TypeError"}'::jsonb);
  reset role;
  select status, finished_at, notes, summary into v_run from sync_runs
   where run_id = '00000000-1493-4000-8000-000000000011' and scope is distinct from 'unregistered';
  if v_run.status <> 'failed' or v_run.finished_at is null
     or v_run.notes not like '%sync-runner: crawl failed: TypeError' then
    raise exception 'FAIL 2: after a failed close the running run reads status %, finished %, notes %',
      v_run.status, v_run.finished_at, v_run.notes;
  end if;

  -- A run that already folded keeps ok when the files step fails the close.
  insert into agent_requests (kind, scope, state, note) values ('sync', 'all', 'queued', 'phase14_093 files failed')
  returning id into v_b;
  set local role sync_runner;
  perform sync_claim(v_b);
  perform sync_register_run(v_b, '00000000-1493-4000-8000-000000000012');
  reset role;
  update sync_runs set status = 'ok', finished_at = now(), summary = '{"changes": []}'::jsonb
   where run_id = '00000000-1493-4000-8000-000000000012';
  set local role sync_runner;
  perform sync_close(v_b, 'failed', '{"lines": ["Sync runner: files failed: x"], "error": "files failed: x"}'::jsonb);
  reset role;
  if (select status from sync_runs where run_id = '00000000-1493-4000-8000-000000000012') <> 'ok' then
    raise exception 'FAIL 2: a failed close changed a run that had already folded';
  end if;
end $$;

-- =============================================================================================
-- 3. Privileges: the fourteen, and nobody else
-- =============================================================================================
do $$
begin
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_request_inbox_apply,'
     'sync_requeue_orphans,sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 3: sync_runner does not execute exactly the fourteen';
  end if;
  if has_function_privilege('anon', 'public.sync_own_claims()', 'execute')
     or has_function_privilege('authenticated', 'public.sync_own_claims()', 'execute')
     or has_function_privilege('service_role', 'public.sync_own_claims()', 'execute') then
    raise exception 'FAIL 3: sync_own_claims is executable beyond sync_runner';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_093: PASS' as result, current_user as ran_as;

rollback;
