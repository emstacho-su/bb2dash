-- bb2dash :: db/tests/phase12b_076_rls_initplan_and_truncate.sql
-- Phase 12b, item X-3 (P-db-1, P-db-2). Tests migration 076:
--   * no policy anywhere calls auth.uid() per row - every one of them wraps it in a scalar
--     subquery, which is what the auth_rls_initplan advisor asks for;
--   * neither `anon` nor `authenticated` holds TRUNCATE on anything in `public`, and the default
--     privileges no longer hand it to new tables;
--   * the boundary still holds: as the owner's uid the rows are there, as any other uid they are
--     not, and a TRUNCATE from `authenticated` is refused.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Section 4 attempts a TRUNCATE it
-- expects to be refused; the file's last statement is `rollback`, so even a surprise success is
-- undone.

begin;

-- =============================================================================================
-- 1. No policy re-evaluates auth.uid() per row
-- =============================================================================================
do $$
declare bare text;
begin
  select string_agg(schemaname || '.' || tablename || ' ' || policyname, ', '
                    order by schemaname, tablename, policyname) into bare
    from pg_policies
   where replace(replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                         '( SELECT auth.uid() AS uid)', ''),
                 '(select auth.uid())', '') like '%auth.uid()%';
  if bare is not null then
    raise exception 'FAIL these policies still call auth.uid() per row: %', bare;
  end if;

  -- And the 22 that were rewritten are all still there, still scoped to the owner.
  if (select count(*) from pg_policies
       where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%app_owner%') < 35 then
    raise exception 'FAIL owner-scoped policies went missing: only % remain',
      (select count(*) from pg_policies
        where coalesce(qual, '') || ' ' || coalesce(with_check, '') like '%app_owner%');
  end if;
end $$;

-- =============================================================================================
-- 2. TRUNCATE is not a privilege the browser roles hold
-- =============================================================================================
do $$
declare held text;
begin
  select string_agg(grantee || ' on ' || table_name, ', ' order by grantee, table_name) into held
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type = 'TRUNCATE';
  if held is not null then
    raise exception 'FAIL TRUNCATE is still granted: %', held;
  end if;

  -- A table created by a later migration must not get it back.
  if exists (select 1 from pg_default_acl d, unnest(d.defaclacl) a
              where d.defaclnamespace = 'public'::regnamespace
                and d.defaclobjtype = 'r'
                and d.defaclrole = 'postgres'::regrole
                and a::text ~ '^(anon|authenticated)=[a-zA-Z]*D') then
    raise exception 'FAIL the default privileges still grant TRUNCATE on new public tables';
  end if;
end $$;

-- =============================================================================================
-- 3. The boundary still holds: owner sees the rows, another uid sees none
-- =============================================================================================
select set_config('request.jwt.claim.sub', (select app_owner()::text), true);
set local role authenticated;

do $$
begin
  if (select count(*) from assignments) = 0 then
    raise exception 'FAIL the owner can no longer read assignments';
  end if;
  if (select count(*) from readings) = 0 then
    raise exception 'FAIL the owner can no longer read readings';
  end if;
  if (select count(*) from v_work_items) = 0 then
    raise exception 'FAIL the owner can no longer read v_work_items';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set local role authenticated;

do $$
begin
  if (select count(*) from assignments) <> 0 then
    raise exception 'FAIL a stranger can read % assignments', (select count(*) from assignments);
  end if;
  if (select count(*) from readings) <> 0 then
    raise exception 'FAIL a stranger can read readings';
  end if;
  if (select count(*) from v_work_items) <> 0 then
    raise exception 'FAIL a stranger can read v_work_items';
  end if;
end $$;

-- =============================================================================================
-- 4. TRUNCATE from `authenticated` is refused (still in the authenticated role here)
-- =============================================================================================
do $$
begin
  begin
    truncate calendar_events;
    raise exception 'FAIL authenticated was allowed to TRUNCATE calendar_events';
  exception when insufficient_privilege then
    null;
  end;
  begin
    truncate assignments cascade;
    raise exception 'FAIL authenticated was allowed to TRUNCATE assignments';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase12b_076_rls_initplan_and_truncate: PASS'                              as result,
       (select count(*) from pg_policies
         where coalesce(qual,'') || ' ' || coalesce(with_check,'') like '%auth.uid%') as policies_using_auth_uid,
       (select count(*) from information_schema.role_table_grants
         where table_schema = 'public' and grantee in ('anon','authenticated')
           and privilege_type = 'TRUNCATE')                                        as truncate_grants;

rollback;
