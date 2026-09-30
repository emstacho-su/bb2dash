-- bb2dash :: db/tests/phase15_100_db_test_runner_role.sql
-- Phase 15, task 7 (P-100). Tests migration 100: the limits that define `db_test_runner` are a
-- test, so they cannot quietly widen. Every section is a read-only assertion over prod catalogs.
--
-- The role this file describes is the role running it, so the file also proves that the credential
-- in `.env.local` is the narrow one and not the owner: section 1 fails outright if `current_user`
-- is anything else.
--
-- RUN IT: `node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql`. A failing
-- assertion raises; a pass ends with one summary row. The file opens its own transaction and its
-- last statement is `rollback`: it writes nothing, and nothing it reads survives.
--
-- WHEN A LATER MIGRATION GRANTS A FURTHER MEMBERSHIP, extend the expected list in section 3 in the
-- same PR (brief 95 §Seams, "Phases 14 and 21 (memberships)"): brief 100's
-- `094_sync_runner_test_membership.sql` adds `sync_runner`, and brief 102's 142 adds
-- `workspace_runner`, each with inherit false.

begin;

-- =============================================================================================
-- 1. This is the role, and these are its attributes
-- =============================================================================================
do $$
declare
  r record;
begin
  if current_user <> 'db_test_runner' then
    raise exception 'FAIL this file must run as db_test_runner, not %', current_user;
  end if;

  select rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolreplication,
         rolconnlimit
    into r
    from pg_roles
   where rolname = 'db_test_runner';
  if not found then
    raise exception 'FAIL db_test_runner does not exist';
  end if;

  -- LOGIN because the runner connects as it; BYPASSRLS because the units write their fixtures as
  -- the session role. Everything else off, and at most two concurrent connections.
  if not r.rolcanlogin then raise exception 'FAIL db_test_runner cannot log in'; end if;
  if not r.rolbypassrls then raise exception 'FAIL db_test_runner lost BYPASSRLS'; end if;
  if r.rolsuper then raise exception 'FAIL db_test_runner is a superuser'; end if;
  if r.rolcreaterole then raise exception 'FAIL db_test_runner can create roles'; end if;
  if r.rolcreatedb then raise exception 'FAIL db_test_runner can create databases'; end if;
  if r.rolreplication then raise exception 'FAIL db_test_runner can replicate'; end if;
  if r.rolconnlimit <> 2 then
    raise exception 'FAIL db_test_runner connection limit is %, expected 2', r.rolconnlimit;
  end if;
end $$;

-- =============================================================================================
-- 2. The two per-role settings 100 set
-- =============================================================================================
do $$
declare
  v_cfg text[];
begin
  select coalesce(rolconfig, '{}'::text[]) into v_cfg
    from pg_roles where rolname = 'db_test_runner';
  if not (v_cfg @> array['statement_timeout=60s']) then
    raise exception 'FAIL db_test_runner has no statement_timeout=60s, config is %', v_cfg;
  end if;
  if not (v_cfg @> array['idle_in_transaction_session_timeout=30s']) then
    raise exception 'FAIL db_test_runner has no idle_in_transaction_session_timeout=30s, config is %',
      v_cfg;
  end if;
end $$;

-- =============================================================================================
-- 3. Memberships: exactly the roles granted so far, each inherit false
-- =============================================================================================
do $$
declare
  v_expected text := 'anon(inherit=f,set=t), authenticated(inherit=f,set=t)';
  v_got      text;
  v_bad      text;
begin
  -- The whole list, with the two options that matter. `inherit=f` keeps anon's and
  -- authenticated's privileges out of this role outside a `set local role`; `set=t` is what lets
  -- the four units switch into them mid-transaction.
  select coalesce(string_agg(r.rolname
                             || '(inherit=' || left(m.inherit_option::text, 1)
                             || ',set='     || left(m.set_option::text, 1) || ')',
                             ', ' order by r.rolname), '<none>')
    into v_got
    from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles g on g.oid = m.member
   where g.rolname = 'db_test_runner';
  if v_got <> v_expected then
    raise exception 'FAIL db_test_runner memberships are %, expected %', v_got, v_expected;
  end if;

  -- Named separately, so a future edit to the list above cannot let one of these in by accident.
  select string_agg(r.rolname, ', ' order by r.rolname) into v_bad
    from pg_auth_members m
    join pg_roles r on r.oid = m.roleid
    join pg_roles g on g.oid = m.member
   where g.rolname = 'db_test_runner'
     and r.rolname in ('service_role', 'postgres', 'authenticator', 'pg_read_all_data',
                       'supabase_privileged_role', 'supabase_admin', 'supabase_storage_admin',
                       'supabase_auth_admin', 'pg_write_all_data', 'pg_execute_server_program',
                       'pg_read_server_files', 'pg_write_server_files');
  if v_bad is not null then
    raise exception 'FAIL db_test_runner is a member of %', v_bad;
  end if;
end $$;

-- =============================================================================================
-- 4. It owns nothing, and it cannot create anything
-- =============================================================================================
do $$
declare
  n    int;
  v_on text;
begin
  -- pg_shdepend deptype 'o' is every object in the cluster whose owner is this role.
  select count(*) into n
    from pg_shdepend
   where refclassid = 'pg_authid'::regclass
     and refobjid = 'db_test_runner'::regrole
     and deptype = 'o';
  if n <> 0 then
    raise exception 'FAIL db_test_runner owns % object(s)', n;
  end if;

  select string_agg(s, ', ' order by s) into v_on
    from unnest(array['public', 'extensions']) s
   where has_schema_privilege('db_test_runner', s, 'CREATE');
  if v_on is not null then
    raise exception 'FAIL db_test_runner holds CREATE on %', v_on;
  end if;
end $$;

-- =============================================================================================
-- 5. Schemas: its name appears on public and extensions, and nowhere else
-- =============================================================================================
do $$
declare
  v_got  text;
  v_have text;
begin
  -- 100 grants USAGE on two schemas; 117 (Phase 17) adds `private`, for 113's heartbeat test.
  -- No others. Anything else the role can reach, it reaches through PUBLIC.
  select coalesce(string_agg(n.nspname, ', ' order by n.nspname), '<none>') into v_got
    from pg_namespace n, aclexplode(n.nspacl) a
   where a.grantee = 'db_test_runner'::regrole
     and a.privilege_type = 'USAGE';
  if v_got <> 'extensions, private, public' then
    raise exception 'FAIL 100/117 grant db_test_runner USAGE on %, expected extensions, private, public', v_got;
  end if;

  -- The four it must not reach at all. `net` is deliberately absent: PUBLIC holds usage on it, so
  -- every role in the cluster has it, and closing that would mean revoking PUBLIC's usage on
  -- `net` - a wider change than Phase 15 takes (brief 95 §Contract).
  select string_agg(s, ', ' order by s) into v_have
    from unnest(array['vault', 'storage', 'auth', 'cron']) s
   where has_schema_privilege('db_test_runner', s, 'USAGE');
  if v_have is not null then
    raise exception 'FAIL db_test_runner has USAGE on %', v_have;
  end if;

  -- And the three it reaches only through PUBLIC, which is why section 5's ACL list is short.
  select string_agg(s, ', ' order by s) into v_have
    from unnest(array['pg_catalog', 'information_schema', 'net']) s
   where not has_schema_privilege('db_test_runner', s, 'USAGE');
  if v_have is not null then
    raise exception 'FAIL db_test_runner lost PUBLIC usage on %', v_have;
  end if;
end $$;

-- =============================================================================================
-- 6. It cannot read Stack's Google OAuth secrets
-- =============================================================================================
do $$
declare
  v_can text;
begin
  -- The two service_role-only Vault RPCs (DECISIONS 2026-09-15). Not callable directly, and not
  -- callable after `set local role anon` or `authenticated` either, since neither holds them.
  select string_agg(f, ', ' order by f) into v_can
    from unnest(array['public.calendar_secrets()',
                      'public.calendar_secret_set(text, text)']) f
   where has_function_privilege('db_test_runner', f, 'EXECUTE')
      or has_function_privilege('anon', f, 'EXECUTE')
      or has_function_privilege('authenticated', f, 'EXECUTE');
  if v_can is not null then
    raise exception 'FAIL db_test_runner can reach %', v_can;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase15_100_db_test_runner_role: PASS'                                       as result,
       current_user                                                                  as ran_as,
       (select rolconnlimit from pg_roles where rolname = 'db_test_runner')           as conn_limit,
       (select count(*) from pg_auth_members m join pg_roles g on g.oid = m.member
         where g.rolname = 'db_test_runner')                                         as memberships,
       (select count(*) from pg_namespace n, aclexplode(n.nspacl) a
         where a.grantee = 'db_test_runner'::regrole and a.privilege_type = 'USAGE')  as schemas_granted,
       (select count(*) from information_schema.table_privileges
         where grantee = 'db_test_runner' and table_schema = 'public'
           and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))                     as write_grants,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and has_function_privilege('db_test_runner', p.oid, 'EXECUTE'))           as callable_public_fns;

rollback;
