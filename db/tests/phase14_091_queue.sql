-- bb2dash :: db/tests/phase14_091_queue.sql
-- Phase 14 (brief 100), tasks 6, 11 and 13; split out of phase14_091_sync_runner.sql by R2 item 11.
-- Worker W-55. The queue: shape, claim, register, outcome, close, quarantine, requeue.
--
--   0. installed and shaped as the Contract freezes it (the thirteen, with 093)
--   1. setup
--   2. the recorded crawl loaded twice inserts 0 rows
--   3. claim -> register -> outcome -> close, and the refusals on the way
--   4. the 42501 on a quarantined run id
--   8. requeue on start
--
-- Runs behind its loader, `db/tests/phase14_load_crawl_v4.sql`, which opens the transaction and lands
-- the scrubbed recorded crawl under the fixture run id 00000000-1491-4000-8000-000000000001. Every
-- function call is made under `set local role sync_runner` (094); the setup and the reads that check
-- a call's effect run as the session role. Fixture run ids are `00000000-1491-4000-8000-…`.
--
-- RUN IT: `node scripts/db-test.mjs --only phase14_091_queue.sql`. A failing assertion raises; a pass ends
-- with one row reading `phase14_091_queue: PASS`. NOTHING IS COMMITTED: the loader opens the
-- transaction and this file's last statement is `rollback`.


create temp table _t14 (label text primary key, id bigint, run_id uuid) on commit drop;

-- =============================================================================================
-- 0. Installed, and shaped as the Contract freezes it
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  r      record;
  f      text;
  v_fns  text[] := array[
    'public.sync_next()',
    'public.sync_claim(bigint)',
    'public.sync_requeue_orphans()',
    'public.sync_register_run(bigint, uuid)',
    'public.sync_run_outcome(uuid)',
    'public.sync_file_worklist()',
    'public.sync_file_stored(bigint, text, text, text, integer, text, text)',
    'public.sync_close(bigint, text, jsonb)',
    'public.sync_sweep_stale()',
    'public.sync_enqueue(text)',
    'public.sync_login_ok()',
    'public.sync_login_required()'];
begin
  if not exists (select 1 from pg_roles where rolname = 'sync_runner') then
    raise exception 'FAIL phase14_091: migration 091 is not applied (no role sync_runner)';
  end if;
  foreach f in array v_fns || 'public.sync_login_sync_due(timestamp with time zone)'::text loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase14_091: migration 091 is not applied (% is missing)', f;
    end if;
  end loop;

  select rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolreplication
    into r from pg_roles where rolname = 'sync_runner';
  if not r.rolcanlogin then v_fail := v_fail || 'sync_runner cannot log in'::text; end if;
  if r.rolinherit then v_fail := v_fail || 'sync_runner inherits'::text; end if;
  if r.rolbypassrls then v_fail := v_fail || 'sync_runner bypasses RLS'::text; end if;
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication then
    v_fail := v_fail || 'sync_runner holds superuser, createrole, createdb or replication'::text;
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'agent_requests'
                    and column_name = 'claim_attempts' and data_type = 'smallint'
                    and is_nullable = 'NO' and column_default = '0') then
    v_fail := v_fail || 'agent_requests.claim_attempts is not smallint not null default 0'::text;
  end if;

  foreach f in array v_fns || 'public.sync_login_sync_due(timestamp with time zone)'::text loop
    select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner,
           coalesce(p.proconfig, '{}') as cfg, obj_description(p.oid, 'pg_proc') as note,
           p.provolatile
      into r
      from pg_proc p join pg_language l on l.oid = p.prolang
     where p.oid = f::regprocedure;
    if not r.prosecdef then v_fail := v_fail || format('%s is not security definer', f); end if;
    if r.lanname <> 'plpgsql' then v_fail := v_fail || format('%s is not plpgsql', f); end if;
    if r.owner <> 'postgres' then v_fail := v_fail || format('%s is owned by %s', f, r.owner); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
  end loop;

  if (select provolatile from pg_proc
       where oid = 'public.sync_login_sync_due(timestamp with time zone)'::regprocedure) <> 's' then
    v_fail := v_fail || 'sync_login_sync_due is not stable'::text;
  end if;

  -- The thirteen (091's twelve and 093's sync_own_claims) are exactly what sync_runner can run with
  -- the owner's rights (task 7's check, as 093 amends it).
  if (select string_agg(p.proname, ',' order by p.proname)
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and has_function_privilege('sync_runner', p.oid, 'execute'))
     is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_requeue_orphans,'
     'sync_run_outcome,sync_sweep_stale' then
    v_fail := v_fail || 'sync_runner can execute a SECURITY DEFINER function beyond the thirteen, or lacks one'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase14_091 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. Setup (not an assertion)
-- =============================================================================================
-- An open real sync would be the one `sync_next()` and `sync_enqueue` return; a real `done` sync
-- on today's New York date, or on the dates section 9 names, would make the login trigger queue
-- nothing. Both are changed inside this transaction only; the rollback restores them.
update agent_requests set state = 'cancelled'
 where kind = 'sync' and state in ('queued', 'claimed');

update agent_requests set state = 'failed'
 where kind = 'sync' and state = 'done'
   and ((finished_at at time zone 'America/New_York')::date
          = (now() at time zone 'America/New_York')::date
        or (finished_at >= '2026-10-30 00:00Z' and finished_at < '2026-11-04 00:00Z'));

-- =============================================================================================
-- 2. The recorded crawl, loaded a second time under the same run id, inserts nothing
-- =============================================================================================
do $$
declare
  v_n int;
begin
  select count(*) into v_n from bb_raw where run_id = '00000000-1491-4000-8000-000000000001';
  if v_n <> 9 then
    raise exception 'FAIL 2: the loader landed % bb_raw rows, expected 9', v_n;
  end if;

  insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)
  select '00000000-1491-4000-8000-000000000001', f.kind, f.bb_course_id, f.payload, f.captured_at
    from _fx14_raw f
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FAIL 2: the second load inserted % rows, expected 0', v_n;
  end if;
end $$;

-- =============================================================================================
-- 3. claim -> register -> outcome -> close, and the refusals on the way
-- =============================================================================================
do $$
declare
  v_a    bigint;   -- the request the runner works
  v_b    bigint;   -- a second queued request, newer
  v_t    bigint;   -- a transform request
  v_o    bigint;   -- another claimant's sync request
  v_run  uuid := '00000000-1491-4000-8000-000000000003';
  v_id   bigint;
  v_ok   boolean;
  v_out  record;
  v_req  record;
  v_run_id bigint;
  v_changes jsonb;
begin
  insert into agent_requests (kind, scope, state, created_at, note)
  values ('sync', 'all', 'queued', now() - interval '2 minutes', 'phase14_091 A')
  returning id into v_a;
  insert into agent_requests (kind, scope, state, created_at, note)
  values ('sync', 'all', 'queued', now() - interval '1 minute', 'phase14_091 B')
  returning id into v_b;
  insert into agent_requests (kind, scope, state, note)
  values ('transform', 'all', 'queued', 'phase14_091 T') returning id into v_t;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, note)
  values ('sync', 'all', 'claimed', now(), 'bb-sync session', 'phase14_091 O') returning id into v_o;

  set local role sync_runner;
  select n.id into v_id from sync_next() n;
  reset role;
  if v_id is distinct from v_a then
    raise exception 'FAIL 3: sync_next() returned %, expected the oldest queued sync %', v_id, v_a;
  end if;

  -- The claim, and the claims that must be refused.
  set local role sync_runner;
  v_ok := sync_claim(v_a);
  reset role;
  if not v_ok then raise exception 'FAIL 3: sync_claim(A) returned false'; end if;
  select state, claimed_by, claim_attempts, claimed_at into v_req from agent_requests where id = v_a;
  if v_req.state <> 'claimed' or v_req.claimed_by <> 'sync-runner' or v_req.claim_attempts <> 1
     or v_req.claimed_at is null then
    raise exception 'FAIL 3: after the claim A reads %', row_to_json(v_req);
  end if;

  set local role sync_runner;
  v_ok := sync_claim(v_a);                     -- lost: already claimed
  reset role;
  if v_ok then raise exception 'FAIL 3: a second sync_claim(A) returned true'; end if;
  set local role sync_runner;
  v_ok := sync_claim(v_t);                     -- not a sync row
  reset role;
  if v_ok then raise exception 'FAIL 3: sync_claim on a transform request returned true'; end if;
  set local role sync_runner;
  v_ok := sync_claim(-1);                      -- no such row
  reset role;
  if v_ok then raise exception 'FAIL 3: sync_claim on a missing id returned true'; end if;
  if (select claim_attempts from agent_requests where id = v_a) <> 1 then
    raise exception 'FAIL 3: a lost claim moved claim_attempts';
  end if;

  -- Register-first: the trigger opens the running row.
  set local role sync_runner;
  v_ok := sync_register_run(v_a, v_run);
  reset role;
  if not v_ok then raise exception 'FAIL 3: sync_register_run(A) returned false'; end if;
  if (select run_id from agent_requests where id = v_a) is distinct from v_run then
    raise exception 'FAIL 3: A does not carry the registered run id';
  end if;

  set local role sync_runner;
  select o.sync_run_id, o.status, o.summary into v_out from sync_run_outcome(v_run) o;
  reset role;
  if v_out.status is distinct from 'running' then
    raise exception 'FAIL 3: sync_run_outcome after register reads %, expected running', v_out.status;
  end if;
  v_run_id := v_out.sync_run_id;

  -- The five refusals: already registered, a run id on another request, not claimed, not sync,
  -- another claimant.
  set local role sync_runner;
  v_ok := sync_register_run(v_a, '00000000-1491-4000-8000-000000000004');
  reset role;
  if v_ok then raise exception 'FAIL 3: a second registration on A returned true'; end if;

  set local role sync_runner;
  v_ok := sync_claim(v_b);
  v_ok := sync_register_run(v_b, v_run);
  reset role;
  if v_ok then raise exception 'FAIL 3: a run id already on A registered on B'; end if;

  update agent_requests set state = 'queued', claimed_at = null, claimed_by = null where id = v_b;
  set local role sync_runner;
  v_ok := sync_register_run(v_b, '00000000-1491-4000-8000-000000000005');
  reset role;
  if v_ok then raise exception 'FAIL 3: a queued request was registered'; end if;

  update agent_requests set state = 'claimed', claimed_at = now(), claimed_by = 'sync-runner'
   where id = v_t;
  set local role sync_runner;
  v_ok := sync_register_run(v_t, '00000000-1491-4000-8000-000000000006');
  reset role;
  if v_ok then raise exception 'FAIL 3: a transform request was registered'; end if;

  set local role sync_runner;
  v_ok := sync_register_run(v_o, '00000000-1491-4000-8000-000000000007');
  reset role;
  if v_ok then raise exception 'FAIL 3: another claimant''s request was registered'; end if;

  -- The fold, simulated: the run finishes with one change line of its own.
  update sync_runs set status = 'ok', finished_at = clock_timestamp(),
                       summary = '{"changes": ["fold line"], "errors": []}'::jsonb
   where id = v_run_id;

  set local role sync_runner;
  select o.status into v_out from sync_run_outcome(v_run) o;
  reset role;
  if v_out.status is distinct from 'ok' then
    raise exception 'FAIL 3: sync_run_outcome after the fold reads %, expected ok', v_out.status;
  end if;

  set local role sync_runner;
  perform sync_close(v_a, 'done',
    '{"lines": ["runner line 1", "runner line 2"], "error": null,
      "files": {"pulled": 0, "not_pulled": []}, "claim_attempts": 1}'::jsonb);
  reset role;

  select state, finished_at, result, sync_run_id into v_req from agent_requests where id = v_a;
  if v_req.state <> 'done' or v_req.finished_at is null or v_req.sync_run_id is distinct from v_run_id
     or v_req.result->'lines' <> '["runner line 1", "runner line 2"]'::jsonb then
    raise exception 'FAIL 3: after close A reads %', row_to_json(v_req);
  end if;
  select summary->'changes' into v_changes from sync_runs where id = v_run_id;
  if v_changes <> '["fold line", "runner line 1", "runner line 2"]'::jsonb then
    raise exception 'FAIL 3: sync_close did not append its lines; changes are %', v_changes;
  end if;

  insert into _t14 values ('A', v_a, v_run), ('B', v_b, null), ('O', v_o, null);
end $$;

-- =============================================================================================
-- 4. A quarantined run id is refused with 42501
-- =============================================================================================
do $$
declare
  v_q   uuid := '00000000-1491-4000-8000-000000000008';
  v_c   bigint;
  v_ok  boolean;
  v_raised boolean := false;
begin
  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope, notes)
  values (v_q, 'failed', now(), now(), 'scheduled', 'blackboard', 'unregistered', 'phase14_091 quarantine');
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now(), 'sync-runner', 1, 'phase14_091 C') returning id into v_c;

  begin
    set local role sync_runner;
    v_ok := sync_register_run(v_c, v_q);
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  if not v_raised then
    raise exception 'FAIL 4: registering a quarantined run id did not raise 42501';
  end if;
  if (select run_id from agent_requests where id = v_c) is not null then
    raise exception 'FAIL 4: the quarantined run id was written onto the request';
  end if;
end $$;

-- =============================================================================================
-- 8. Requeue on start
-- =============================================================================================
do $$
declare
  v_orphan bigint; v_reg bigint; v_full bigint; v_other bigint;
  v_n int;
  v_row record;
begin
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now(), 'sync-runner', 1, 'phase14_091 R1') returning id into v_orphan;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, run_id, note)
  values ('sync', 'all', 'claimed', now(), 'sync-runner', 1, '00000000-1491-4000-8000-000000000009', 'phase14_091 R2')
  returning id into v_reg;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now(), 'sync-runner', 3, 'phase14_091 R3') returning id into v_full;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('sync', 'all', 'claimed', now(), 'bb-sync session', 0, 'phase14_091 R4') returning id into v_other;

  set local role sync_runner;
  v_n := sync_requeue_orphans();
  reset role;
  if v_n < 1 then raise exception 'FAIL 8: sync_requeue_orphans() returned %', v_n; end if;

  select state, claimed_at, claimed_by, claim_attempts into v_row from agent_requests where id = v_orphan;
  if v_row.state <> 'queued' or v_row.claimed_at is not null or v_row.claimed_by is not null
     or v_row.claim_attempts <> 1 then
    raise exception 'FAIL 8: the orphan reads %', row_to_json(v_row);
  end if;
  if (select state from agent_requests where id = v_reg) <> 'claimed' then
    raise exception 'FAIL 8: a registered row was requeued';
  end if;
  if (select state from agent_requests where id = v_full) <> 'claimed' then
    raise exception 'FAIL 8: a row at 3 claims was requeued';
  end if;
  if (select state from agent_requests where id = v_other) <> 'claimed' then
    raise exception 'FAIL 8: another claimant''s row was requeued';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_091_queue: PASS' as result, current_user as ran_as;

rollback;
