-- bb2dash :: db/tests/phase14_095_storage_key.sql
-- Phase 14 follow-up, W-73 round 2 (R2-1, R2-3). Worker W-73. Tests migration 095:
--
--   1. bb_file_storage_key meets the shared relpath -> key contract,
--      db/fixtures/phase14/storage_keys.json. Its `cases` array is carried inline between
--      $storage_keys$ tags, because Postgres cannot read the repo; ingest/pull_files.test.mjs fails
--      if this copy and the file ever differ, and checks storageKeyFor against the same file.
--   2. sync_file_stored, called as sync_runner, accepts a row's sanitised key and refuses every other
--      key with 22023: 091's `#`-only key, the raw relpath, an arbitrary key. A refusal writes nothing.
--   3. attributes and privileges: bb_file_storage_key is immutable, invoker-rights, path-pinned and
--      callable by the suite; sync_file_stored is still SECURITY DEFINER, path-pinned, owned by
--      postgres and executable by sync_runner alone, and sync_runner's DEFINER set is 093's thirteen.
--
-- No loader: it needs one fixture bb_files row and no crawl. Every sync_file_stored call is made
-- under `set local role sync_runner` (094); the setup and the reads run as the session role.
--
-- RUN IT: `node scripts/db-test.mjs --only phase14_095_storage_key.sql`. A failing assertion raises;
-- a pass ends with one row reading `phase14_095_storage_key: PASS`. NOTHING IS COMMITTED.

begin;

-- =============================================================================================
-- 1. bb_file_storage_key on the shared contract
-- =============================================================================================
do $$
declare
  v_cases jsonb := $storage_keys$
[
  { "case": "file 2489's name: a curly apostrophe", "relpath": "GEO.103/readings/Musk\u2019s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf", "key": "GEO.103/readings/Musk_s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf" },
  { "case": "# (the pre-W-73 rule)", "relpath": "IST.323/lecture_slides/week-04/Lecture#4-Chap 3a.pptx", "key": "IST.323/lecture_slides/week-04/Lecture_4-Chap 3a.pptx" },
  { "case": "every allowed character is kept", "relpath": "IST.352/readings/O'Brien (1) & co, + A=B @x: y; z? $5 *! -_.pdf", "key": "IST.352/readings/O'Brien (1) & co, + A=B @x: y; z? $5 *! -_.pdf" },
  { "case": "precomposed e-acute (NFC)", "relpath": "ECN.304/readings/Caf\u00e9 notes.pdf", "key": "ECN.304/readings/Caf_ notes.pdf" },
  { "case": "e + combining acute (NFD): the base letter stays", "relpath": "ECN.304/readings/Cafe\u0301 notes.pdf", "key": "ECN.304/readings/Cafe_ notes.pdf" },
  { "case": "smart double quotes", "relpath": "IST.352/readings/\u201cSmart\u201d quotes.docx", "key": "IST.352/readings/_Smart_ quotes.docx" },
  { "case": "%, [, ] and ~", "relpath": "IST.471/assignment_spec/100% [draft] ~v2.pdf", "key": "IST.471/assignment_spec/100_ _draft_ _v2.pdf" },
  { "case": "en and em dashes", "relpath": "IST.466/readings/Week 3 \u2013 Notes \u2014 final.pdf", "key": "IST.466/readings/Week 3 _ Notes _ final.pdf" },
  { "case": "an astral character (emoji) is one code point, one _", "relpath": "GEO.103/readings/Notes \ud83d\udcda.pdf", "key": "GEO.103/readings/Notes _.pdf" },
  { "case": "a submission keeps its attempt segment", "relpath": "IST.352/my_submissions/role-of-systems-analyst/attempt-431219701/R\u00e9sum\u00e9 #2.docx", "key": "IST.352/my_submissions/role-of-systems-analyst/attempt-431219701/R_sum_ _2.docx" },
  { "case": "double quote, no-break space and backslash", "relpath": "IST.323/readings/a\"b\u00a0c\\d.pdf", "key": "IST.323/readings/a_b_c_d.pdf" },
  { "case": "a plain name is unchanged", "relpath": "IST.323/lecture_slides/week-01/Lecture 1.pdf", "key": "IST.323/lecture_slides/week-01/Lecture 1.pdf" }
]
$storage_keys$::jsonb;
  v_case  jsonb;
  v_got   text;
  v_bad   text[] := '{}';
begin
  if to_regprocedure('public.bb_file_storage_key(text)') is null then
    raise exception 'FAIL phase14_095: migration 095 is not applied (bb_file_storage_key is missing)';
  end if;
  if jsonb_array_length(v_cases) not between 10 and 12 then
    raise exception 'FAIL 1: the contract holds % cases, expected 10 to 12', jsonb_array_length(v_cases);
  end if;
  for v_case in select value from jsonb_array_elements(v_cases) loop
    v_got := bb_file_storage_key(v_case->>'relpath');
    if v_got is distinct from v_case->>'key' then
      v_bad := v_bad || format('%s: got %s', v_case->>'case', v_got);
    end if;
    -- storage-api's VALID_OBJECT_KEY, as STORAGE_KEY_VALID in ingest/pull_files.mjs.
    if v_got !~ '^[A-Za-z0-9_/!.*''() &$=@;:+,?-]*$' then
      v_bad := v_bad || format('%s: Storage would refuse %s', v_case->>'case', v_got);
    end if;
    if bb_file_storage_key(v_got) is distinct from v_got then
      v_bad := v_bad || format('%s: a second pass changes the key', v_case->>'case');
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'FAIL 1: %', array_to_string(v_bad, '; ');
  end if;
end $$;

-- =============================================================================================
-- 2. sync_file_stored accepts the sanitised key and refuses any other
-- =============================================================================================
do $$
declare
  v_course text := (select id from courses order by id limit 1);
  v_name   text := 'w73 ' || chr(8217) || 's #fixture ' || chr(233) || '.pdf';
  v_f      bigint;
  v_rel    text;
  v_key    text;
  v_ok     boolean;
  v_raised boolean;
  v_case   record;
  v_row    record;
  v_sha    text := repeat('cd', 32);
begin
  insert into bb_files (bb_course_id, course_id, file_name, source_url, captured_at, bucket,
                        text_status, mime_type, notes)
  values ('_w73fx_1', v_course, v_name,
          'https://blackboard.syracuse.edu/bbcswebdav/xid-w73fx_1', now(), 'lecture_slides',
          'pending', 'application/pdf', 'phase14_095 fixture')
  returning id into v_f;
  v_rel := bb_file_relpath(v_f);
  v_key := bb_file_storage_key(v_rel);
  if v_key is distinct from v_course || '/lecture_slides/w73 _s _fixture _.pdf' then
    raise exception 'FAIL 2: the fixture row''s key reads %', v_key;
  end if;

  for v_case in
    select * from (values
      ('091''s #-only key', replace(v_rel, '#', '_')),
      ('the raw relpath',   v_rel),
      ('an arbitrary key',  'elsewhere/file.pdf')
    ) t(label, k)
  loop
    v_raised := false;
    begin
      set local role sync_runner;
      perform sync_file_stored(v_f, v_case.k, v_rel, v_sha, 2048, 'application/pdf', 'extracted');
    exception when sqlstate '22023' then
      v_raised := true;
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 2: sync_file_stored accepted %', v_case.label;
    end if;
  end loop;
  if (select storage_path from bb_files where id = v_f) is not null then
    raise exception 'FAIL 2: a refused sync_file_stored wrote the row';
  end if;

  set local role sync_runner;
  v_ok := sync_file_stored(v_f, v_key, v_rel, v_sha, 2048, 'application/pdf', 'extracted');
  reset role;
  if not v_ok then
    raise exception 'FAIL 2: sync_file_stored returned false for the sanitised key on an unstored row';
  end if;
  select * into v_row from bb_files where id = v_f;
  if v_row.storage_path is distinct from 'bb-files/' || v_key
     or v_row.local_path is distinct from 'course context/' || v_rel
     or v_row.file_name is distinct from v_name
     or v_row.sha256 is distinct from v_sha then
    raise exception 'FAIL 2: the stored row reads storage_path %, local_path %, file_name %',
      v_row.storage_path, v_row.local_path, v_row.file_name;
  end if;
end $$;

-- =============================================================================================
-- 3. Attributes and privileges
-- =============================================================================================
do $$
declare
  v_fn  record;
  v_got text;
  v_sfs text := 'public.sync_file_stored(bigint, text, text, text, integer, text, text)';
  v_bad text[] := '{}';
begin
  select p.provolatile, p.prosecdef, p.proconfig into v_fn
    from pg_proc p where p.oid = 'public.bb_file_storage_key(text)'::regprocedure;
  if v_fn.provolatile <> 'i' then v_bad := v_bad || 'bb_file_storage_key is not immutable'::text; end if;
  if v_fn.prosecdef then v_bad := v_bad || 'bb_file_storage_key is SECURITY DEFINER'::text; end if;
  if v_fn.proconfig is distinct from array['search_path=public, pg_temp'] then
    v_bad := v_bad || format('bb_file_storage_key proconfig is %s', v_fn.proconfig);
  end if;
  if not has_function_privilege(current_user, 'public.bb_file_storage_key(text)', 'execute') then
    v_bad := v_bad || 'the suite cannot execute bb_file_storage_key'::text;
  end if;

  select p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) as owner into v_fn
    from pg_proc p where p.oid = v_sfs::regprocedure;
  if not v_fn.prosecdef then v_bad := v_bad || 'sync_file_stored lost SECURITY DEFINER'::text; end if;
  if v_fn.proconfig is distinct from array['search_path=public, pg_temp'] then
    v_bad := v_bad || format('sync_file_stored proconfig is %s', v_fn.proconfig);
  end if;
  if v_fn.owner <> 'postgres' then
    v_bad := v_bad || format('sync_file_stored is owned by %s', v_fn.owner);
  end if;
  if not has_function_privilege('sync_runner', v_sfs, 'execute') then
    v_bad := v_bad || 'sync_runner cannot execute sync_file_stored'::text;
  end if;
  if has_function_privilege('anon', v_sfs, 'execute')
     or has_function_privilege('authenticated', v_sfs, 'execute')
     or has_function_privilege('service_role', v_sfs, 'execute') then
    v_bad := v_bad || 'anon, authenticated or service_role can execute sync_file_stored'::text;
  end if;

  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('sync_runner', p.oid, 'execute');
  if v_got is distinct from
     'sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,'
     'sync_login_required,sync_next,sync_own_claims,sync_register_run,sync_requeue_orphans,'
     'sync_run_outcome,sync_sweep_stale' then
    v_bad := v_bad || format('sync_runner executes SECURITY DEFINER functions %s', v_got);
  end if;

  if cardinality(v_bad) > 0 then
    raise exception 'FAIL 3: %', array_to_string(v_bad, '; ');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_095_storage_key: PASS' as result, current_user as ran_as;

rollback;
