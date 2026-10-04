-- bb2dash :: db/migrations/094_sync_runner_test_membership.sql
-- Phase 14 (docs/planning/sprint-2/briefs/100_PHASE14_containers.md), task 7a (R-84; open item 6,
-- answered yes by Stack on 2026-10-02). Worker W-55.
--
-- WHY. `db/tests/phase14_091_sync_runner.sql` tests the behaviour of 091's twelve functions on every
-- suite run, not once by hand. It calls each one the way the runner does, as `sync_runner`, inside
-- its own rolled-back transaction. So the test role holds `sync_runner` WITH INHERIT FALSE: it can
-- `set local role sync_runner` and inherits nothing outside one.
--
-- THE HELPER. `sync_login_sync_due(timestamptz)` is granted to `db_test_runner`, and to nobody else:
-- the test role is its only grantee besides the owner (`sync_runner`, anon, authenticated and
-- service_role cannot execute it, and the 091 unit asserts that). The unit has to ask it about fixed
-- instants (2026-10-31 03:30Z, the 2026-11-01 fall-back), which `sync_enqueue` cannot: it only ever
-- passes now(). The helper is stable and only reads `agent_requests`, which the test role can
-- already select (100). PM's call, 2026-10-03.
--
-- TABLE WRITES. None are added. The two phase14 units (the loader and the 091 unit) write, as the
-- session role, exactly these tables, each already granted by 100:
--   agent_requests   insert, update   (fixture requests; the setup that cancels open syncs)
--   attention_items  -                (written only through the DEFINER functions)
--   bb_files         insert           (two fixture rows for the file pair)
--   bb_raw           insert           (the loader, and the second load)
--   sync_runs        insert, update   (a quarantine row; the simulated fold)
--
-- REPLAY ORDER. 094 names `db_test_runner`, so a rebuild replays it after 100 although its number
-- is lower: a repo-order rule, not drift (DECISIONS 2026-10-02, "Phase 14 freeze: migration 094 is
-- written and replays after 100"). The guard below refuses to run before 100.
--
-- The same PR extends the expected membership list in db/tests/phase15_100_db_test_runner_role.sql
-- with `sync_runner(inherit=f,set=t)` (95 §Seams).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'db_test_runner') then
    raise exception '094: role db_test_runner does not exist; apply 100_db_test_runner_role first';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'sync_runner') then
    raise exception '094: role sync_runner does not exist; apply 091_sync_runner_role first';
  end if;
end $$;

grant sync_runner to db_test_runner with inherit false;

grant execute on function public.sync_login_sync_due(timestamptz) to db_test_runner;

-- =============================================================================================
-- Guard
-- =============================================================================================
do $$
begin
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'sync_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.inherit_option and m.set_option) then
    raise exception 'FAIL 094: db_test_runner does not hold sync_runner with inherit false and set true';
  end if;
  if exists (select 1 from pg_roles where rolname = 'sync_runner' and rolbypassrls) then
    raise exception 'FAIL 094: sync_runner bypasses RLS';
  end if;
  if has_function_privilege('sync_runner', 'public.sync_login_sync_due(timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.sync_login_sync_due(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_login_sync_due(timestamptz)', 'execute')
     or has_function_privilege('service_role', 'public.sync_login_sync_due(timestamptz)', 'execute') then
    raise exception 'FAIL 094: sync_login_sync_due is executable beyond its owner and the test role';
  end if;
end $$;
