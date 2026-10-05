-- bb2dash :: db/migrations/095_bb_file_storage_key.sql
-- Phase 14 follow-up, W-73 round 2 (R2-1, R2-3), from `/code-review fix/storage-key-safe-chars high`
-- on 2026-10-05. Worker W-73. 091, 093 and 094 stay byte-frozen.
--
-- WHY. Supabase Storage refuses an object key holding any character outside storage-api's
-- VALID_OBJECT_KEY (supabase/storage `src/storage/limits.ts` @ 69bb550: ASCII letters and digits and
-- `_/!.*'() &$=@;:+,?-`). File 2489's name carries a curly apostrophe, so its upload drew
-- `400 InvalidKey` on every sync on 2026-10-05 (request 1856, Inbox item 3441). W-73 made
-- `ingest/pull_files.mjs`'s `storageKeyFor` replace every refused character with `_`. But
-- `sync_file_stored` (091) still derives the expected key as `replace(relpath, '#', '_')`: the
-- container runner would upload 2489's bytes under the new key, post its text, and then be refused
-- here with 22023, and every later sync would meet that occupied key and refuse it for good.
--
-- WHAT
--   1. `public.bb_file_storage_key(text)`: the relpath -> Storage key rule in SQL, character for
--      character the same as `storageKeyFor` (each code point outside the set becomes `_`; `/` and
--      the allowed characters are kept). There is no Unicode folding on either side: `unaccent` is
--      not installed (prod, 2026-10-05), and a fold in only one of the two would let them disagree.
--      `db/fixtures/phase14/storage_keys.json` is the contract both meet (12 cases):
--      `ingest/pull_files.test.mjs` reads it, and `db/tests/phase14_095_storage_key.sql` carries the
--      same cases inline (Postgres cannot read the repo), which pull_files.test.mjs checks byte for byte.
--      IMMUTABLE, not SECURITY DEFINER, `search_path` pinned the way 101 pins every function.
--      It keeps the default PUBLIC execute, as `bb_file_relpath` does: it is a pure string function.
--   2. `public.sync_file_stored`, re-created from its LIVE definition. Read 2026-10-05 through
--      `scripts/db-test.mjs` as db_test_runner: md5(prosrc) 67376c6b7dc845e399affd648f4a6516, which is
--      091's body as written, SECURITY DEFINER, `search_path=public, pg_temp`, owner postgres, ACL
--      {postgres=X/postgres, sync_runner=X/postgres}. Every line of the body below is that body
--      except the two marked 095: the gate now compares the key to `bb_file_storage_key(relpath)`,
--      and its comment says so. Signature, language, security and search_path are unchanged, so
--      `create or replace` keeps the owner and the grants, which are re-asserted as 091 has them.
--   3. a guard block.
--
-- REPLAY ORDER. 095 replays after 091, 093 and 094 by name and before 100; it names no
-- `db_test_runner`, so a rebuild needs no special order for it.
--
-- Additive: one new function, one function body changed in one line. No table, no data.

-- =============================================================================================
-- 1. bb_file_storage_key
-- =============================================================================================
create or replace function public.bb_file_storage_key(p_relpath text)
  returns text
  language sql immutable parallel safe set search_path = public, pg_temp as $$
  select regexp_replace(p_relpath, '[^A-Za-z0-9_/!.*''() &$=@;:+,?-]', '_', 'g')
$$;

comment on function public.bb_file_storage_key(text) is
  'The Supabase Storage object key for a relpath (095, W-73): every character outside storage-api''s '
  'VALID_OBJECT_KEY (ASCII letters, digits and _/!.*''() &$=@;:+,?-) becomes _, one per character; / '
  'and the allowed characters are kept. The same rule as ingest/pull_files.mjs storageKeyFor; '
  'db/fixtures/phase14/storage_keys.json is the contract both meet.';

-- =============================================================================================
-- 2. sync_file_stored: the gate uses bb_file_storage_key
-- =============================================================================================
create or replace function public.sync_file_stored(
    p_id bigint, p_key text, p_relpath text, p_sha256 text, p_bytes integer, p_mime text,
    p_text_status text)
  returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_relpath text;
  v_status  text_status;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'sync_file_stored: sha256 must be 64 lowercase hex characters'
      using errcode = '22023';
  end if;
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'sync_file_stored: bytes must be positive' using errcode = '22023';
  end if;
  if p_mime is null or btrim(p_mime) = '' then
    raise exception 'sync_file_stored: mime is required' using errcode = '22023';
  end if;
  if p_text_status is null then
    raise exception 'sync_file_stored: text_status is required' using errcode = '22023';
  end if;
  v_status := p_text_status::text_status;   -- an unknown status raises 22P02 here

  -- The row's own relpath and the key it implies (095: bb_file_storage_key = storageKeyFor). The
  -- caller cannot point a row at another path or key; the prefixes are added here, not by it.
  select bb_file_relpath(f.id) into v_relpath from bb_files f where f.id = p_id;
  if v_relpath is null then
    return false;
  end if;
  if p_relpath is distinct from v_relpath then
    raise exception 'sync_file_stored: relpath is not bb_file_relpath(%)', p_id using errcode = '22023';
  end if;
  if p_key is distinct from public.bb_file_storage_key(v_relpath) then   -- 095
    raise exception 'sync_file_stored: key is not the relpath''s storage key' using errcode = '22023';
  end if;

  -- What pull_files.mjs's bbFilesUpdateSql writes, and only onto a row with no bytes yet.
  update bb_files f
     set storage_path  = 'bb-files/' || p_key,
         local_path    = 'course context/' || p_relpath,
         sha256        = p_sha256,
         bytes         = p_bytes,
         mime_type     = case when f.bucket = 'my_submissions' then coalesce(f.mime_type, p_mime)
                              else p_mime end,
         downloaded_at = now(),
         text_status   = v_status,
         notes         = coalesce(f.notes, '') || ' | bytes pulled '
                         || to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD')
                         || ' by sync-runner'
   where f.id = p_id and f.storage_path is null;
  return found;
end $$;

comment on function public.sync_file_stored(bigint, text, text, text, integer, text, text) is
  'Records one pulled file for the sync runner (091), writing what pull_files.mjs''s bbFilesUpdateSql '
  'writes: storage_path bb-files/<key>, local_path course context/<relpath>, sha256, bytes, mime_type '
  '(coalesced for my_submissions), downloaded_at, text_status, and a notes line naming sync-runner. Only '
  'where storage_path is null; the relpath must be bb_file_relpath(id) and the key '
  'bb_file_storage_key(relpath) (095). sync_runner only.';

revoke all on function public.sync_file_stored(bigint, text, text, text, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.sync_file_stored(bigint, text, text, text, integer, text, text)
  to sync_runner;

-- =============================================================================================
-- 3. Guard
-- =============================================================================================
do $$
declare
  v_got text;
  v_fn  record;
begin
  -- (a) sync_runner's SECURITY DEFINER set is still 093's thirteen.
  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('sync_runner', p.oid, 'execute');
  if v_got is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_requeue_orphans,'
     'sync_run_outcome,sync_sweep_stale' then
    raise exception 'FAIL 095: sync_runner executes SECURITY DEFINER functions %, expected the thirteen', v_got;
  end if;

  -- (b) sync_file_stored kept its security, path and grants, and its gate is the new rule.
  select p.prosecdef, p.proconfig, p.prosrc into v_fn
    from pg_proc p
   where p.oid = 'public.sync_file_stored(bigint, text, text, text, integer, text, text)'::regprocedure;
  if not v_fn.prosecdef or v_fn.proconfig is distinct from array['search_path=public, pg_temp'] then
    raise exception 'FAIL 095: sync_file_stored lost SECURITY DEFINER or its search_path';
  end if;
  if position('public.bb_file_storage_key(v_relpath)' in v_fn.prosrc) = 0
     or position('replace(v_relpath, ''#'', ''_'')' in v_fn.prosrc) > 0 then
    raise exception 'FAIL 095: sync_file_stored''s gate is not bb_file_storage_key(relpath)';
  end if;
  if not has_function_privilege('sync_runner', 'public.sync_file_stored(bigint, text, text, text, integer, text, text)', 'execute')
     or has_function_privilege('anon', 'public.sync_file_stored(bigint, text, text, text, integer, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.sync_file_stored(bigint, text, text, text, integer, text, text)', 'execute')
     or has_function_privilege('service_role', 'public.sync_file_stored(bigint, text, text, text, integer, text, text)', 'execute') then
    raise exception 'FAIL 095: sync_file_stored is not executable by sync_runner alone';
  end if;

  -- (c) bb_file_storage_key: immutable, not SECURITY DEFINER, path pinned, and the rule holds.
  select p.provolatile, p.prosecdef, p.proconfig into v_fn
    from pg_proc p where p.oid = 'public.bb_file_storage_key(text)'::regprocedure;
  if v_fn.provolatile <> 'i' or v_fn.prosecdef
     or v_fn.proconfig is distinct from array['search_path=public, pg_temp'] then
    raise exception 'FAIL 095: bb_file_storage_key is not immutable, invoker-rights and path-pinned';
  end if;
  if public.bb_file_storage_key('A/b#1' || chr(8217) || 's ' || chr(233) || '.pdf') <> 'A/b_1_s _.pdf'
     or public.bb_file_storage_key('A/O''Brien (1) & co, + A=B @x: y; z? $5 *! -_.pdf')
          <> 'A/O''Brien (1) & co, + A=B @x: y; z? $5 *! -_.pdf'
     or public.bb_file_storage_key('A/100% [draft] ~v2.pdf') <> 'A/100_ _draft_ _v2.pdf' then
    raise exception 'FAIL 095: bb_file_storage_key does not apply the storage-api rule';
  end if;
end $$;
