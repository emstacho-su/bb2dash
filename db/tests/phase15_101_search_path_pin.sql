-- bb2dash :: db/tests/phase15_101_search_path_pin.sql
-- Phase 15 (docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md), task 14. Worker W-40.
-- Standing guards over the three security shapes this project has decided it wants, plus the
-- proof that pinning a search_path (101) did not change a single answer:
--
--   (a) every function in public resolves names against its OWN search_path, not the caller's
--   (b) every view in public is security_invoker, so RLS decides what it returns   (036)
--   (c) the only SECURITY DEFINER functions authenticated may execute are app_owner() and
--       calendar_push_now(); anon may execute none                                 (038, 068)
--   (d) under the most hostile caller path there is - an EMPTY search_path - the three retrieval
--       functions still answer. This is the guard that would have caught 101 being written with
--       the wrong value: `public, pg_temp` keeps them working, `pg_temp` alone would not.
--   (e) bb_file_relpath returns the same string under an empty path as under the default one
--   (f) calendar_push_now() refuses a uid that is not the owner. The lint-0029 WARN on it is
--       accepted (DECISIONS, Phase 15 row 1) BECAUSE of this guard, so the guard lives here.
--
-- (a) is first on purpose: it is the finding this file was written for, and its message is the
-- one the phase's RED check greps for.
--
-- RUN IT: `node scripts/db-test.mjs --only phase15_101_search_path_pin.sql`, or paste the whole
-- file into one `execute_sql` call. A failing assertion raises; a pass ends with one summary row.
-- The file writes nothing at all, and the last statement is `rollback`, so prod is untouched.
--
-- Values travel between statements in transaction-local GUCs (`set_config(..., true)`) rather
-- than a temp table: part of this file runs as `authenticated`, which holds no TEMP privilege,
-- and a GUC is rolled back with everything else.

begin;

-- =============================================================================================
-- 0. What the default search_path answers, and what the tables held before
-- =============================================================================================
-- Every value below is stored through `coalesce(…, '<null>')`. `set_config(name, NULL, true)` does
-- NOT store a null — it RESETS the GUC, and `current_setting` then yields `''`. Without the
-- sentinel, a null `bb_file_relpath` would make guard (e) compare `NULL is distinct from ''` and
-- raise although both paths agreed, and an empty `bb_files` would make `'' ::bigint` fail on a cast
-- rather than on the thing the guard is about. `<null>` cannot collide with a real value here: a
-- relpath always contains '/', a file id is digits, gcal_dirty is a boolean and search_path is set.
select set_config('w40.file_id',
  coalesce((select min(id)::text from public.bb_files), '<null>'), true);
select set_config('w40.relpath_default',
  coalesce((select public.bb_file_relpath((select min(id) from public.bb_files))), '<null>'), true);
select set_config('w40.gcal_dirty_before',
  coalesce((select gcal_dirty::text from public.app_settings limit 1), '<null>'), true);
select set_config('w40.search_path_default',
  coalesce(current_setting('search_path'), '<null>'), true);

-- There must be a file to ask about at all, or (d) and (e) would pass by vacuity.
do $$
begin
  if current_setting('w40.file_id') = '<null>' then
    raise exception 'FAIL bb_files is empty, so guards (d) and (e) would prove nothing';
  end if;
end $$;

-- =============================================================================================
-- (a) No function in public resolves names against the caller's search_path
-- =============================================================================================
-- Extension-owned functions are excluded: pgcrypto, pg_net and the rest are not this project's
-- definitions, and the advisor does not count them either.
--
-- `d.classid = 'pg_proc'::regclass` is load-bearing, not decoration. `pg_depend.objid` is only
-- meaningful together with `classid` — oids are unique per catalogue, not across catalogues — so
-- without it ANY extension-dependent entry (a type, a relation, an operator) whose oid happens to
-- equal a function's oid would silently excuse that function from this guard. The exclusion would
-- then grow quietly wider every time an extension is installed.
--
-- MIGRATION 101 CARRIES THIS FLAW in its own one-time guard block and is left exactly as applied
-- (`db/migrations/101_search_path_pin.sql`, section 2): it has run, and on the catalogue of
-- 2026-09-27 its answer was right — the corrected predicate here counts the same 0. It is frozen
-- because the repo file must stay byte-identical to what was applied. **A future replay of 101
-- must not be trusted as a check**; this file is the authoritative standing guard for the rule.
do $$
declare
  n    int;
  list text;
begin
  select count(*), string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into n, list
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d
                      where d.classid = 'pg_proc'::regclass
                        and d.objid = p.oid
                        and d.deptype = 'e')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
                      where c like 'search_path=%');
  if n > 0 then
    raise exception '%', format('FAIL %s functions without search_path: %s', n, list);
  end if;
end $$;

-- =============================================================================================
-- (b) Every view in public is security_invoker
-- =============================================================================================
do $$
declare list text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into list
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relkind = 'v'
     and coalesce((select o = 'security_invoker=true'
                     from unnest(c.reloptions) o where o like 'security_invoker=%'), false) is false;
  if list is not null then
    raise exception 'FAIL these public views still run as their owner: %', list;
  end if;
end $$;

-- =============================================================================================
-- (c) Which SECURITY DEFINER functions are on the API surface
-- =============================================================================================
-- Exactly two, both recorded: app_owner() because RLS policy evaluation needs it (DECISIONS
-- 2026-09-10), calendar_push_now() because it is owner-guarded inside, which (f) proves.
do $$
declare
  v_auth text;
  v_anon text;
begin
  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), '') into v_auth
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute');
  if v_auth <> 'app_owner(), calendar_push_now()' then
    raise exception 'FAIL authenticated may execute these SECURITY DEFINER functions in public: '
                    '[%], expected [app_owner(), calendar_push_now()]', v_auth;
  end if;

  select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.proname), '') into v_anon
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute');
  if v_anon <> '' then
    raise exception 'FAIL anon may execute these SECURITY DEFINER functions in public: %', v_anon;
  end if;
end $$;

-- =============================================================================================
-- (d) and (e) The hostile caller: an empty search_path
-- =============================================================================================
-- Nothing at all is on the path here (pg_catalog is always implicitly searched, which is why
-- count(*) and current_setting still resolve). Every name in this section is schema-qualified,
-- so a failure can only come from inside a function body - which is the point.
set local search_path = '';

do $$
declare
  q          text;
  n          bigint;
  v_relpath  text;
begin
  foreach q in array array['final exam date', 'attendance policy']
  loop
    select count(*) into n from public.search_file_text(q, null, 12, false);
    if n < 1 then
      raise exception 'FAIL search_file_text(%) returned % rows under an empty search_path', q, n;
    end if;

    -- The vector arm's query IS the embedding, so both iterations send the same stored
    -- gte-small vector; what changes is only that the call is made twice.
    select count(*) into n from public.match_file_text(
             (select e.embedding from public.bb_text_embeddings e
               where e.model = 'gte-small' order by e.id limit 1),
             'gte-small', null, 12, false);
    if n < 1 then
      raise exception 'FAIL match_file_text returned % rows under an empty search_path '
                      '(iteration %)', n, q;
    end if;

    select count(*) into n from public.hybrid_search_file_text(q,
             (select e.embedding from public.bb_text_embeddings e
               where e.model = 'gte-small' order by e.id limit 1),
             'gte-small', null, 12);
    if n < 1 then
      raise exception 'FAIL hybrid_search_file_text(%) returned % rows under an empty '
                      'search_path', q, n;
    end if;
  end loop;

  -- (e) Same input, same answer, whichever path the caller happens to hold. Both sides carry the
  -- same '<null>' sentinel the header stored, so "both returned null" agrees instead of raising.
  v_relpath := coalesce(public.bb_file_relpath(current_setting('w40.file_id')::bigint), '<null>');
  if v_relpath <> current_setting('w40.relpath_default') then
    raise exception 'FAIL bb_file_relpath(%) returned [%] under an empty search_path and [%] '
                    'under [%]',
      current_setting('w40.file_id'),
      v_relpath,
      current_setting('w40.relpath_default'),
      current_setting('w40.search_path_default');
  end if;
end $$;

set local search_path = public, extensions, pg_temp;

-- =============================================================================================
-- (f) calendar_push_now() refuses a uid that is not the owner
-- =============================================================================================
-- The WARN that authenticated can call this SECURITY DEFINER function is accepted, and this is
-- the reason on record: a JWT-borne call that is not the owner's is refused inside. A null uid -
-- a direct SQL session - is trusted by design (068), so the test must arrive with a uid.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set local role authenticated;

do $$
declare v_said text;
begin
  begin
    perform public.calendar_push_now();
    v_said := '(it returned without raising)';
  exception when others then
    v_said := sqlerrm;
  end;

  if v_said not like '%only the owner%' then
    raise exception 'FAIL calendar_push_now() as a stranger uid said [%], expected a refusal '
                    'naming "only the owner"', v_said;
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', true);

-- =============================================================================================
-- Nothing was written
-- =============================================================================================
-- This file only reads, and (f)'s one call is meant to raise before it writes. If it ever stops
-- raising, app_settings.gcal_dirty is where that shows, so it is checked rather than assumed.
do $$
begin
  if coalesce((select gcal_dirty::text from public.app_settings limit 1), '<null>')
     <> current_setting('w40.gcal_dirty_before') then
    raise exception 'FAIL app_settings.gcal_dirty is now %, it was %',
      coalesce((select gcal_dirty::text from public.app_settings limit 1), '<null>'),
      current_setting('w40.gcal_dirty_before');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase15_101_search_path_pin: PASS'                      as result,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and not exists (select 1 from pg_depend d
                            where d.classid = 'pg_proc'::regclass
                              and d.objid = p.oid
                              and d.deptype = 'e')) as public_functions,
       current_setting('w40.search_path_default')                as default_search_path,
       current_setting('w40.relpath_default')                    as relpath_checked;

rollback;
