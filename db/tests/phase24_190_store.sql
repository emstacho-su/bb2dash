-- bb2dash :: db/tests/phase24_190_store.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 13. Worker W-76.
-- Tests migration 190: the store's three tables (`workspace_documents`, `workspace_document_text`,
-- `workspace_text_embeddings`), `v_workspace_memory`, and the owner's three SECURITY DEFINER
-- functions (`workspace_upload_register`, `workspace_upload_retry`, `workspace_document_delete`).
--
--   0. installed and shaped: the vector column, its index and keys, the rights of every role on the
--      three tables (table AND column), the policies, the functions' execute lists
--   1. the owner: register (and the upsert on the hash), refusals, retry, the two-step delete
--   2. another signed-in uid, a caller with no uid, and anon: 42501, and nothing written
--   3. what the owner's own session may write directly (a title, a course) and what it may not
--   4. the constraints: three CHECKs and the keys, tried as the session role
--   5. v_workspace_memory
--
-- The memory branch of `workspace_document_delete` writes `workspace_conversation_state`, which 195
-- creates, so that branch is tested in phase24_195_turn_state.sql.
--
-- Every function is called through a small pg_temp helper that sets the caller's uid and role the
-- way the browser's request does (`request.jwt.claim.sub`, `set local role`), so a refusal is read
-- as a SQLSTATE and a success as its jsonb. Setup rows are written as the session role. All data is
-- synthetic; nothing is committed: the file opens its own transaction and its last statement is
-- `rollback`. The unit asserts on its own rows by hash and id and never on a table's total.
--
-- A DRY RUN through `execute_sql` as postgres (migration pasted in front, inside one transaction)
-- works as well: `set local role authenticated` and `anon` are allowed there.
-- RUN IT: `node scripts/db-test.mjs --only phase24_190_store.sql`.

begin;

-- One statement, run as p_role with uid p_sub; the SQLSTATE of a refusal, or 'ok:<rows>'.
create function pg_temp.w76_try(p_role text, p_sub text, p_sql text) returns text
  language plpgsql as $$
declare
  v text;
  n integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := 'ok:' || n;
  exception when others then
    v := sqlstate;
  end;
  reset role;
  return v;
end $$;

-- One expression that returns jsonb, run as p_role with uid p_sub. A refusal propagates.
create function pg_temp.w76_call(p_role text, p_sub text, p_expr text) returns jsonb
  language plpgsql as $$
declare
  v jsonb;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  execute 'select ' || p_expr into v;
  reset role;
  return v;
end $$;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  r      record;
  t      text;
  who    text;
  f      text;
  v_fns  text[] := array[
    'public.workspace_upload_register(text, text, text, bigint, text, timestamptz, text)',
    'public.workspace_upload_retry(bigint, text, timestamptz)',
    'public.workspace_document_delete(bigint, boolean)'];
  v_tabs text[] := array['workspace_documents', 'workspace_document_text', 'workspace_text_embeddings'];
begin
  foreach t in array v_tabs loop
    if to_regclass('public.' || t) is null then
      raise exception 'FAIL phase24_190: migration 190 is not applied (public.% is missing)', t;
    end if;
  end loop;
  foreach f in array v_fns loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase24_190: migration 190 is not applied (% is missing)', f;
    end if;
  end loop;
  if to_regclass('public.v_workspace_memory') is null then
    raise exception 'FAIL phase24_190: migration 190 is not applied (public.v_workspace_memory is missing)';
  end if;

  -- The store: the vector column, its model, its keys and its index.
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.workspace_text_embeddings'::regclass
                    and a.attname = 'embedding' and not a.attisdropped
                    and a.atttypid = 'extensions.vector'::regtype
                    and a.atttypmod = 384 and a.attnotnull) then
    v_fail := v_fail || 'workspace_text_embeddings.embedding is not vector(384) not null'::text;
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.workspace_text_embeddings'::regclass
                    and a.attname = 'model' and not a.attisdropped and a.attnotnull) then
    v_fail := v_fail || 'workspace_text_embeddings.model is nullable'::text;
  end if;
  select string_agg(cl.relname || ' ' || pg_get_constraintdef(c.oid), '; ' order by cl.relname collate "C")
    into v_got
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
   where c.conrelid in ('public.workspace_text_embeddings'::regclass,
                        'public.workspace_document_text'::regclass)
     and c.contype = 'u';
  if v_got is distinct from
     'workspace_document_text UNIQUE (document_id, unit_kind, unit_no); '
     'workspace_text_embeddings UNIQUE (text_id, model, part_no)' then
    v_fail := v_fail || format('the unique keys are [%s]', v_got);
  end if;
  select ic.relname || ' ' || am.amname || ' ' || oc.opcname || case when i.indisvalid then ' valid' else ' INVALID' end
    into v_got
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_am am on am.oid = ic.relam
    join pg_opclass oc on oc.oid = i.indclass[0]
   where i.indrelid = 'public.workspace_text_embeddings'::regclass and am.amname = 'hnsw';
  if v_got is distinct from 'workspace_text_embeddings_hnsw hnsw vector_cosine_ops valid' then
    v_fail := v_fail || format('the hnsw index of the vector table is [%s]', v_got);
  end if;
  if not exists (select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid
                  where i.indrelid = 'public.workspace_documents'::regclass
                    and ic.relname = 'workspace_documents_upload_sha256_key'
                    and i.indisunique and pg_get_expr(i.indpred, i.indrelid) like '%upload%') then
    v_fail := v_fail || 'there is no unique index on an upload''s sha256'::text;
  end if;
  if not exists (select 1 from pg_class ic
                  where ic.relname = 'workspace_document_text_fts_idx' and ic.relkind = 'i') then
    v_fail := v_fail || 'workspace_document_text_fts_idx is missing'::text;
  end if;

  -- Row security is on for the three, and the policies are the owner's, in the initplan form.
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relname = any (v_tabs) and not c.relrowsecurity;
  if v_got is not null then
    v_fail := v_fail || format('row security is off on %s', v_got);
  end if;
  select string_agg(p.tablename || '.' || p.policyname || ':' || p.cmd || ':'
                    || array_to_string(p.roles, '+') || ':' || p.permissive, ', '
                    order by p.tablename collate "C", p.policyname collate "C") into v_got
    from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_tabs);
  if v_got is distinct from
     'workspace_document_text.workspace_document_text_owner_select:SELECT:authenticated:PERMISSIVE, '
     'workspace_documents.workspace_documents_owner_select:SELECT:authenticated:PERMISSIVE, '
     'workspace_documents.workspace_documents_owner_update:UPDATE:authenticated:PERMISSIVE' then
    v_fail := v_fail || format('the policies are [%s]', v_got);
  end if;
  select string_agg(p.policyname, ', ' order by p.policyname collate "C") into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_tabs)
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_got is not null then
    v_fail := v_fail || format('these policies do not name app_owner(): %s', v_got);
  end if;

  -- anon, the three login roles and the test role's peers hold nothing on the three, on the table
  -- or on a column (a new table starts with every command open to anon and authenticated).
  foreach who in array array['anon', 'workspace_runner', 'sync_runner', 'inbox_apply_runner',
                             'workspace_ingest_runner'] loop
    continue when not exists (select 1 from pg_roles where rolname = who);
    foreach t in array v_tabs loop
      if has_table_privilege(who::name, 'public.' || t,
                             'select, insert, update, delete, truncate, references, trigger')
         or has_any_column_privilege(who::name, 'public.' || t, 'select, insert, update, references') then
        v_fail := v_fail || format('%s holds a privilege on %s', who, t);
      end if;
    end loop;
  end loop;

  -- authenticated: select on the first two and nothing else at table level; update on exactly
  -- title and course_id of the first; nothing at all on the vector table, table or column.
  foreach t in array array['workspace_documents', 'workspace_document_text'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'select') then
      v_fail := v_fail || format('authenticated cannot select %s', t);
    end if;
    if has_table_privilege('authenticated', 'public.' || t,
                           'insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('authenticated', 'public.' || t, 'insert, references') then
      v_fail := v_fail || format('authenticated holds more than select on %s', t);
    end if;
  end loop;
  select string_agg(a.attname, ', ' order by a.attname collate "C") into v_got
    from pg_attribute a
   where a.attrelid = 'public.workspace_documents'::regclass and a.attnum > 0 and not a.attisdropped
     and has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE');
  if v_got is distinct from 'course_id, title' then
    v_fail := v_fail || format('authenticated may update the columns [%s] of workspace_documents', v_got);
  end if;
  if has_any_column_privilege('authenticated', 'public.workspace_document_text', 'update') then
    v_fail := v_fail || 'authenticated may update a column of workspace_document_text'::text;
  end if;
  if has_table_privilege('authenticated', 'public.workspace_text_embeddings',
                         'select, insert, update, delete, truncate, references, trigger')
     or has_any_column_privilege('authenticated', 'public.workspace_text_embeddings',
                                 'select, insert, update, references') then
    v_fail := v_fail || 'authenticated holds a privilege on workspace_text_embeddings'::text;
  end if;
  if has_table_privilege('anon', 'public.v_workspace_memory', 'select') then
    v_fail := v_fail || 'anon can select v_workspace_memory'::text;
  end if;

  -- The three functions: definer, plpgsql, pinned path, commented; executed by authenticated alone.
  foreach f in array v_fns loop
    select p.prosecdef, l.lanname, coalesce(p.proconfig, '{}') as cfg,
           obj_description(p.oid, 'pg_proc') as note
      into r from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f::regprocedure;
    if not r.prosecdef then v_fail := v_fail || format('%s is not security definer', f); end if;
    if r.lanname <> 'plpgsql' then v_fail := v_fail || format('%s is not plpgsql', f); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
  end loop;
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C") into v_got
    from (values ('public'), ('anon'), ('service_role'), ('db_test_runner'), ('workspace_runner'),
                 ('sync_runner')) as w(who)
    cross join unnest(v_fns) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('executable beyond authenticated: %s', v_got);
  end if;
  select string_agg(g.fn, ', ') into v_got
    from unnest(v_fns) as g(fn) where not has_function_privilege('authenticated', g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('authenticated cannot execute %s', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_190 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 5. Behaviour
-- =============================================================================================
do $$
declare
  c_host  constant text := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  v_owner uuid := app_owner();
  v_other uuid := gen_random_uuid();
  v_sha_a text := md5('w76-190-a') || md5('w76-190-a2');
  v_sha_b text := md5('w76-190-b') || md5('w76-190-b2');
  v_sha_c text := md5('w76-190-c') || md5('w76-190-c2');
  v_url_a text;
  v_url_b text;
  v_vec1  extensions.vector(384);
  v_vec2  extensions.vector(384);
  v_out   jsonb;
  v_a bigint; v_c bigint; v_u1 bigint; v_u2 bigint;
  v_conv  uuid;
  v_course text;
  v_row   record;
  v_got   text;
  v_m     bigint;
  v_case  record;
begin
  if v_owner is null then
    raise exception 'FAIL phase24_190: app_owner() returned null, so the owner cannot be simulated';
  end if;
  v_url_a := c_host || 'u/' || v_sha_a || '?token=synthetic-a';
  v_url_b := c_host || 'u/' || v_sha_b || '?token=synthetic-b';
  v_vec1 := ('[' || array_to_string(array(select case when i = 1 then 1 else 0 end
                                           from generate_series(1, 384) i), ',') || ']')::extensions.vector(384);
  v_vec2 := ('[' || array_to_string(array(select case when i = 2 then 1 else 0 end
                                           from generate_series(1, 384) i), ',') || ']')::extensions.vector(384);
  select c.id into v_course from courses c order by c.id limit 1;

  -- -------------------------------------------------------------------------------------------
  -- 1a. The owner registers a file: a row in `stored`, the key made from the hash.
  -- -------------------------------------------------------------------------------------------
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
    'public.workspace_upload_register(%L, %L, %L, 1234, %L, now() + interval ''7 days'', null)',
    v_sha_a, '  w76 190 first  ', 'application/pdf', v_url_a));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'existing,id,state' or v_out->>'state' <> 'stored'
     or (v_out->>'existing')::boolean is not false then
    raise exception 'FAIL 1a: workspace_upload_register returned %', v_out;
  end if;
  v_a := (v_out->>'id')::bigint;
  select d.kind, d.title, d.storage_key, d.sha256, d.mime, d.byte_size, d.state, d.attempts, d.signed_url,
         d.signed_url_expires_at is not null as has_expiry, d.claimed_by, d.conversation_id, d.error_code
    into v_row from workspace_documents d where d.id = v_a;
  if not found or v_row.kind <> 'upload' or v_row.title <> 'w76 190 first'
     or v_row.storage_key <> 'u/' || v_sha_a or v_row.sha256 <> v_sha_a
     or v_row.mime <> 'application/pdf' or v_row.byte_size <> 1234 or v_row.state <> 'stored'
     or v_row.attempts <> 0 or v_row.signed_url <> v_url_a or not v_row.has_expiry
     or v_row.claimed_by is not null or v_row.conversation_id is not null or v_row.error_code is not null then
    raise exception 'FAIL 1a: the registered row reads %', row_to_json(v_row);
  end if;

  -- 1b. The same bytes again: the first id comes back with existing true, nothing is written.
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
    'public.workspace_upload_register(%L, %L, %L, 99, %L, now() + interval ''7 days'', null)',
    v_sha_a, 'another title', 'text/plain', v_url_a));
  if (v_out->>'id')::bigint <> v_a or (v_out->>'existing')::boolean is not true
     or v_out->>'state' <> 'stored' then
    raise exception 'FAIL 1b: a second register of one hash returned %', v_out;
  end if;
  if (select count(*) from workspace_documents d where d.sha256 = v_sha_a) <> 1
     or (select d.title from workspace_documents d where d.id = v_a) <> 'w76 190 first'
     or (select d.byte_size from workspace_documents d where d.id = v_a) <> 1234 then
    raise exception 'FAIL 1b: the second register changed or added a row';
  end if;

  -- 1c. In any state: a failed upload still holds its hash. (A failed row has no link.)
  update workspace_documents set state = 'failed', error_code = 'embed_failed', attempts = 3,
         signed_url = null, signed_url_expires_at = null where id = v_a;
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
    'public.workspace_upload_register(%L, %L, %L, 1234, %L, now() + interval ''7 days'', null)',
    v_sha_a, 'w76 190 first', 'application/pdf', v_url_a));
  if (v_out->>'id')::bigint <> v_a or (v_out->>'existing')::boolean is not true
     or v_out->>'state' <> 'failed' then
    raise exception 'FAIL 1c: a register of the hash of a failed row returned %', v_out;
  end if;

  -- 1d. What register refuses, and that a refused call leaves no row behind.
  for v_case in
    select * from (values
      ('a hash that is short', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', 'abc', v_url_b)),
      ('an upper-case hash', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', upper(v_sha_b), v_url_b)),
      ('a null hash', '23514', format('select public.workspace_upload_register(null, ''t'', ''text/plain'', 10, %L, now(), null)', v_url_b)),
      ('a type outside the six', '23514', format('select public.workspace_upload_register(%L, ''t'', ''image/png'', 10, %L, now(), null)', v_sha_b, v_url_b)),
      ('a size of 0', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 0, %L, now(), null)', v_sha_b, v_url_b)),
      ('a size over 20 MiB', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 20971521, %L, now(), null)', v_sha_b, v_url_b)),
      ('a blank title', '23514', format('select public.workspace_upload_register(%L, ''   '', ''text/plain'', 10, %L, now(), null)', v_sha_b, v_url_b)),
      ('a 201-character title', '23514', format('select public.workspace_upload_register(%L, repeat(''t'', 201), ''text/plain'', 10, %L, now(), null)', v_sha_b, v_url_b)),
      ('a link on another host', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', v_sha_b, 'https://evil.example.com/storage/v1/object/sign/workspace-uploads/u/' || v_sha_b || '?token=x')),
      ('a link under another bucket', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', v_sha_b, replace(v_url_b, 'workspace-uploads', 'bb-files'))),
      ('a link ending in another key', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', v_sha_b, c_host || 'u/' || v_sha_c || '?token=x')),
      ('a link with no query string', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', v_sha_b, c_host || 'u/' || v_sha_b)),
      ('a link with an empty query string', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', v_sha_b, c_host || 'u/' || v_sha_b || '?')),
      ('a link with white space in it', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), null)', v_sha_b, v_url_b || ' x')),
      ('no expiry', '23514', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, null, null)', v_sha_b, v_url_b)),
      ('an unknown course', '23503', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now(), ''NO.SUCH.COURSE'')', v_sha_b, v_url_b))
    ) as x(label, want, stmt)
  loop
    v_got := pg_temp.w76_try('authenticated', v_owner::text, v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 1d: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  if (select count(*) from workspace_documents d where d.sha256 = v_sha_b) <> 0 then
    raise exception 'FAIL 1d: a refused register left a row behind';
  end if;

  -- 1e. A good one for another file, with a course.
  if v_course is not null then
    v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
      'public.workspace_upload_register(%L, %L, %L, 5, %L, now() + interval ''7 days'', %L)',
      v_sha_c, 'w76 190 third', 'text/markdown', c_host || 'u/' || v_sha_c || '?token=c', v_course));
    v_c := (v_out->>'id')::bigint;
    if (select d.course_id from workspace_documents d where d.id = v_c) is distinct from v_course then
      raise exception 'FAIL 1e: the course was not stored';
    end if;
  else
    v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
      'public.workspace_upload_register(%L, %L, %L, 5, %L, now() + interval ''7 days'', null)',
      v_sha_c, 'w76 190 third', 'text/markdown', c_host || 'u/' || v_sha_c || '?token=c'));
    v_c := (v_out->>'id')::bigint;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- 1f. Retry: a failed upload, and only a failed one.
  -- -------------------------------------------------------------------------------------------
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_upload_retry(%s, %L, now() + interval ''7 days'')', v_c, c_host || 'u/' || v_sha_c || '?token=c2'));
  if v_got <> '22023' then
    raise exception 'FAIL 1f: retry of a stored upload ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_upload_retry(%s, %L, now() + interval ''7 days'')', 0, v_url_a));
  if v_got <> '22023' then
    raise exception 'FAIL 1f: retry of a missing row ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_upload_retry(%s, %L, now() + interval ''7 days'')', v_a, c_host || 'u/' || v_sha_c || '?token=x'));
  if v_got <> '23514' then
    raise exception 'FAIL 1f: retry with a link for another key ended with [%], expected 23514', v_got;
  end if;
  v_out := pg_temp.w76_call('authenticated', v_owner::text,
    format('public.workspace_upload_retry(%s, %L, now() + interval ''7 days'')', v_a, v_url_a || '2'));
  select d.state, d.attempts, d.error_code, d.signed_url, d.claimed_by into v_row
    from workspace_documents d where d.id = v_a;
  if (v_out->>'state') <> 'stored' or (v_out->>'id')::bigint <> v_a
     or v_row.state <> 'stored' or v_row.attempts <> 0 or v_row.error_code is not null
     or v_row.signed_url <> v_url_a || '2' or v_row.claimed_by is not null then
    raise exception 'FAIL 1f: retry returned % and the row reads %', v_out, row_to_json(v_row);
  end if;

  -- -------------------------------------------------------------------------------------------
  -- 1g. The two-step delete. A has two units, each with a vector.
  -- -------------------------------------------------------------------------------------------
  update workspace_documents set state = 'text_ready' where id = v_a;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text)
  values (v_a, 'page', 1, 'w76 190 synthetic page one') returning id into v_u1;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text)
  values (v_a, 'page', 2, 'w76 190 synthetic page two') returning id into v_u2;
  insert into workspace_text_embeddings (text_id, part_no, model, embedding)
  values (v_u1, 1, 'gte-small', v_vec1), (v_u2, 1, 'gte-small', v_vec2);

  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_document_delete(%s, true)', v_a));
  if v_got <> '22023' then
    raise exception 'FAIL 1g: the second step on a row not in deleting ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_document_delete(%s, null)', v_a));
  if v_got <> '22023' then
    raise exception 'FAIL 1g: a null flag ended with [%], expected 22023', v_got;
  end if;

  v_out := pg_temp.w76_call('authenticated', v_owner::text,
    format('public.workspace_document_delete(%s, false)', v_a));
  if v_out->>'state' <> 'deleting' or v_out->>'storage_key' <> 'u/' || v_sha_a
     or v_out->>'kind' <> 'upload' or (v_out->>'id')::bigint <> v_a then
    raise exception 'FAIL 1g: the first delete call returned %', v_out;
  end if;
  select d.state, d.signed_url, d.signed_url_expires_at, d.storage_key, d.claimed_by into v_row
    from workspace_documents d where d.id = v_a;
  if v_row.state <> 'deleting' or v_row.signed_url is not null or v_row.signed_url_expires_at is not null
     or v_row.storage_key <> 'u/' || v_sha_a then
    raise exception 'FAIL 1g: after the first call the row reads %', row_to_json(v_row);
  end if;
  if (select count(*) from workspace_document_text t where t.document_id = v_a) <> 0
     or (select count(*) from workspace_text_embeddings e where e.text_id in (v_u1, v_u2)) <> 0 then
    raise exception 'FAIL 1g: the first delete call left units or vectors behind';
  end if;
  -- Repeatable: the same key again.
  v_out := pg_temp.w76_call('authenticated', v_owner::text,
    format('public.workspace_document_delete(%s, false)', v_a));
  if v_out->>'state' <> 'deleting' or v_out->>'storage_key' <> 'u/' || v_sha_a then
    raise exception 'FAIL 1g: a second first-step call returned %', v_out;
  end if;
  -- A row in deleting still holds its hash, so the same file is not registered again.
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
    'public.workspace_upload_register(%L, %L, %L, 1234, %L, now() + interval ''7 days'', null)',
    v_sha_a, 'w76 190 first', 'application/pdf', v_url_a));
  if (v_out->>'id')::bigint <> v_a or v_out->>'state' <> 'deleting'
     or (v_out->>'existing')::boolean is not true then
    raise exception 'FAIL 1g: a register of the hash of a row in deleting returned %', v_out;
  end if;
  -- Retry refuses a row in deleting.
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_upload_retry(%s, %L, now() + interval ''7 days'')', v_a, v_url_a));
  if v_got <> '22023' then
    raise exception 'FAIL 1g: retry of a row in deleting ended with [%], expected 22023', v_got;
  end if;
  -- The second step drops the row.
  v_out := pg_temp.w76_call('authenticated', v_owner::text,
    format('public.workspace_document_delete(%s, true)', v_a));
  if v_out->>'state' <> 'deleted' or v_out->>'storage_key' <> 'u/' || v_sha_a then
    raise exception 'FAIL 1g: the second step returned %', v_out;
  end if;
  if exists (select 1 from workspace_documents d where d.id = v_a) then
    raise exception 'FAIL 1g: the second step left the row';
  end if;
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select public.workspace_document_delete(%s, true)', v_a));
  if v_got <> '22023' then
    raise exception 'FAIL 1g: the second step on a dropped row ended with [%], expected 22023', v_got;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- 2. Another signed-in uid, a caller with no uid, and anon: refused, and nothing written.
  -- -------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('a stranger registering', 'authenticated', v_other::text, '42501', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now() + interval ''7 days'', null)', v_sha_b, v_url_b)),
      ('a caller with no uid registering', 'authenticated', '', '42501', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now() + interval ''7 days'', null)', v_sha_b, v_url_b)),
      ('a stranger registering a hash that exists', 'authenticated', v_other::text, '42501', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now() + interval ''7 days'', null)', v_sha_c, c_host || 'u/' || v_sha_c || '?token=c')),
      ('a stranger retrying', 'authenticated', v_other::text, '42501', format('select public.workspace_upload_retry(%s, %L, now() + interval ''7 days'')', v_c, v_url_a)),
      ('a stranger deleting', 'authenticated', v_other::text, '42501', format('select public.workspace_document_delete(%s, false)', v_c)),
      ('a caller with no uid deleting', 'authenticated', '', '42501', format('select public.workspace_document_delete(%s, false)', v_c)),
      ('anon registering', 'anon', '', '42501', format('select public.workspace_upload_register(%L, ''t'', ''text/plain'', 10, %L, now() + interval ''7 days'', null)', v_sha_b, v_url_b)),
      ('anon deleting', 'anon', '', '42501', format('select public.workspace_document_delete(%s, false)', v_c))
    ) as x(label, role, sub, want, stmt)
  loop
    v_got := pg_temp.w76_try(v_case.role, v_case.sub, v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 2: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  if (select count(*) from workspace_documents d where d.sha256 = v_sha_b) <> 0
     or (select d.state from workspace_documents d where d.id = v_c) <> 'stored' then
    raise exception 'FAIL 2: a refused call wrote something';
  end if;

  -- -------------------------------------------------------------------------------------------
  -- 3. What the owner's own session may write directly, and what it may not.
  -- -------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('a direct insert into workspace_documents', v_owner::text, '42501',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''x'', ''text/plain'', 1, %L, %L)', v_sha_b, 'u/' || v_sha_b)),
      ('a direct update of signed_url', v_owner::text, '42501',
       format('update workspace_documents set signed_url = %L, signed_url_expires_at = now() where id = %s', v_url_b, v_c)),
      ('a direct update of state', v_owner::text, '42501',
       format('update workspace_documents set state = ''indexed'' where id = %s', v_c)),
      ('a direct update of sha256', v_owner::text, '42501',
       format('update workspace_documents set sha256 = %L where id = %s', v_sha_b, v_c)),
      ('a direct delete', v_owner::text, '42501',
       format('delete from workspace_documents where id = %s', v_c)),
      ('a direct insert into workspace_document_text', v_owner::text, '42501',
       format('insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (%s, ''page'', 9, ''x'')', v_c)),
      ('a direct update of workspace_document_text', v_owner::text, '42501',
       'update workspace_document_text set text = ''x'''),
      ('a direct delete from workspace_document_text', v_owner::text, '42501',
       'delete from workspace_document_text'),
      ('a select from workspace_text_embeddings', v_owner::text, '42501',
       'select 1 from workspace_text_embeddings limit 1'),
      ('an insert into workspace_text_embeddings', v_owner::text, '42501',
       format('insert into workspace_text_embeddings (text_id, model, embedding) values (1, ''gte-small'', %L)', v_vec1::text)),
      ('the owner updating a title', v_owner::text, 'ok:1',
       format('update workspace_documents set title = ''w76 190 renamed'' where id = %s', v_c)),
      ('the owner updating a course to null', v_owner::text, 'ok:1',
       format('update workspace_documents set course_id = null where id = %s', v_c)),
      ('the owner updating a title past 200 characters', v_owner::text, '23514',
       format('update workspace_documents set title = repeat(''t'', 201) where id = %s', v_c)),
      ('a stranger updating a title: the row is not visible', v_other::text, 'ok:0',
       format('update workspace_documents set title = ''stolen'' where id = %s', v_c)),
      ('the owner reading the row', v_owner::text, 'ok:1',
       format('select 1 from workspace_documents where id = %s', v_c)),
      ('a stranger reading the row', v_other::text, 'ok:0',
       format('select 1 from workspace_documents where id = %s', v_c))
    ) as x(label, sub, want, stmt)
  loop
    v_got := pg_temp.w76_try('authenticated', v_case.sub, v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 3: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  v_got := pg_temp.w76_try('anon', '', 'select 1 from workspace_documents limit 1');
  if v_got <> '42501' then
    raise exception 'FAIL 3: anon reading workspace_documents ended with [%], expected 42501', v_got;
  end if;
  if (select d.title from workspace_documents d where d.id = v_c) <> 'w76 190 renamed'
     or (select d.state from workspace_documents d where d.id = v_c) <> 'stored' then
    raise exception 'FAIL 3: the owner''s title is not stored, or a refused write changed the state';
  end if;

  -- -------------------------------------------------------------------------------------------
  -- 4. The constraints and keys, tried as the session role (which bypasses RLS).
  -- -------------------------------------------------------------------------------------------
  insert into workspace_conversations (title) values ('w76 190 conversation') returning id into v_conv;
  for v_case in
    select * from (values
      ('a first memory row', 'ok:1',
       format('insert into workspace_documents (kind, title, conversation_id, state) values (''memory'', ''m'', %L, ''text_ready'')', v_conv)),
      ('a second memory row for one conversation', '23505',
       format('insert into workspace_documents (kind, title, conversation_id, state) values (''memory'', ''m2'', %L, ''text_ready'')', v_conv)),
      ('a memory row with a hash', '23514',
       format('insert into workspace_documents (kind, title, conversation_id, sha256) values (''memory'', ''m'', %L, %L)', gen_random_uuid(), v_sha_b)),
      ('a memory row with a type', '23514',
       format('insert into workspace_documents (kind, title, conversation_id, mime) values (''memory'', ''m'', %L, ''text/plain'')', gen_random_uuid())),
      ('an upload with a conversation', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, conversation_id) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, %L)', v_sha_b, 'u/' || v_sha_b, v_conv)),
      ('an upload whose hash is short', '23514',
       'insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''u'', ''text/plain'', 1, ''abc'', ''u/abc'')'),
      ('an upload whose hash is upper case', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''u'', ''text/plain'', 1, %L, %L)', upper(v_sha_b), 'u/' || upper(v_sha_b))),
      ('an upload with no hash', '23514',
       'insert into workspace_documents (kind, title, mime, byte_size, storage_key) values (''upload'', ''u'', ''text/plain'', 1, ''u/x'')'),
      ('an upload whose key is not u/ + its hash', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''u'', ''text/plain'', 1, %L, %L)', v_sha_b, 'u/' || v_sha_c)),
      ('an upload whose key has an upper-case letter', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''u'', ''text/plain'', 1, %L, ''U/A'')', v_sha_b)),
      ('an upload with a link on another host', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, signed_url, signed_url_expires_at) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, %L, now())', v_sha_b, 'u/' || v_sha_b, 'https://evil.example.com/storage/v1/object/sign/workspace-uploads/u/' || v_sha_b || '?t=1')),
      ('an upload with a link under another bucket', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, signed_url, signed_url_expires_at) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, %L, now())', v_sha_b, 'u/' || v_sha_b, replace(v_url_b, 'workspace-uploads', 'bb-files'))),
      ('an upload with a link ending in another key', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, signed_url, signed_url_expires_at) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, %L, now())', v_sha_b, 'u/' || v_sha_b, c_host || 'u/' || v_sha_c || '?t=1')),
      ('a link without its expiry', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, signed_url) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, %L)', v_sha_b, 'u/' || v_sha_b, v_url_b)),
      ('a state off the six', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, ''paused'')', v_sha_b, 'u/' || v_sha_b)),
      ('an error code off the ten', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, error_code) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, ''nope'')', v_sha_b, 'u/' || v_sha_b)),
      ('four attempts', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, attempts) values (''upload'', ''u'', ''text/plain'', 1, %L, %L, 4)', v_sha_b, 'u/' || v_sha_b)),
      ('a type off the six', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''u'', ''image/png'', 1, %L, %L)', v_sha_b, 'u/' || v_sha_b)),
      ('a 20 MiB + 1 file', '23514',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''u'', ''text/plain'', 20971521, %L, %L)', v_sha_b, 'u/' || v_sha_b)),
      ('a second upload with a hash that is held', '23505',
       format('insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key) values (''upload'', ''dup'', ''text/plain'', 1, %L, %L)', v_sha_c, 'u/' || v_sha_c)),
      ('a first unit', 'ok:1',
       format('insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (%s, ''doc'', 1, ''w76 190 unit'')', v_c)),
      ('a second unit with one (document, kind, number)', '23505',
       format('insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (%s, ''doc'', 1, ''again'')', v_c)),
      ('a unit with number 0', '23514',
       format('insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (%s, ''doc'', 0, ''x'')', v_c)),
      ('a unit for a document that is not there', '23503',
       'insert into workspace_document_text (document_id, unit_kind, unit_no, text) values (0, ''doc'', 1, ''x'')')
    ) as x(label, want, stmt)
  loop
    v_got := pg_temp.w76_try(null, '', v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 4: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  select t.id into v_u1 from workspace_document_text t where t.document_id = v_c and t.unit_kind = 'doc' and t.unit_no = 1;
  for v_case in
    select * from (values
      ('a first vector', 'ok:1',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (%s, 1, ''gte-small'', %L)', v_u1, v_vec1::text)),
      ('a second vector for one (text, model, part)', '23505',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (%s, 1, ''gte-small'', %L)', v_u1, v_vec2::text)),
      ('the same part under another model', 'ok:1',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (%s, 1, ''other-model'', %L)', v_u1, v_vec2::text)),
      ('a vector with no model', '23502',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (%s, 2, null, %L)', v_u1, v_vec1::text)),
      ('a row with no vector', '23502',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (%s, 2, ''gte-small'', null)', v_u1)),
      ('a vector of 3 dimensions', '22000',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (%s, 2, ''gte-small'', ''[1,2,3]'')', v_u1)),
      ('a vector for a unit that is not there', '23503',
       format('insert into workspace_text_embeddings (text_id, part_no, model, embedding) values (0, 1, ''gte-small'', %L)', v_vec1::text))
    ) as x(label, want, stmt)
  loop
    v_got := pg_temp.w76_try(null, '', v_case.stmt);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 4: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  -- A unit's removal takes its vectors with it.
  delete from workspace_document_text where id = v_u1;
  if exists (select 1 from workspace_text_embeddings e where e.text_id = v_u1) then
    raise exception 'FAIL 4: a deleted unit left its vectors behind';
  end if;

  -- -------------------------------------------------------------------------------------------
  -- 5. v_workspace_memory: the remembered items, for the owner alone.
  -- -------------------------------------------------------------------------------------------
  select d.id into v_m from workspace_documents d where d.kind = 'memory' and d.conversation_id = v_conv;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text)
  values (v_m, 'doc', 1, 'w76 190 remembered summary');
  select m.document_id, m.conversation_id, m.state, m.summary into v_row
    from v_workspace_memory m where m.document_id = v_m;
  if not found or v_row.conversation_id <> v_conv or v_row.state <> 'text_ready'
     or v_row.summary <> 'w76 190 remembered summary' then
    raise exception 'FAIL 5: v_workspace_memory reads %', row_to_json(v_row);
  end if;
  if (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
       where a.attrelid = 'public.v_workspace_memory'::regclass and a.attnum > 0 and not a.attisdropped)
     is distinct from 'document_id,conversation_id,state,created_at,updated_at,summary' then
    raise exception 'FAIL 5: the columns of v_workspace_memory are not the six';
  end if;
  if exists (select 1 from v_workspace_memory m where m.document_id = v_c) then
    raise exception 'FAIL 5: an upload shows in v_workspace_memory';
  end if;
  v_got := pg_temp.w76_try('authenticated', v_owner::text,
    format('select 1 from v_workspace_memory where document_id = %s', v_m));
  if v_got <> 'ok:1' then
    raise exception 'FAIL 5: the owner reading v_workspace_memory ended with [%], expected ok:1', v_got;
  end if;
  v_got := pg_temp.w76_try('authenticated', v_other::text,
    format('select 1 from v_workspace_memory where document_id = %s', v_m));
  if v_got <> 'ok:0' then
    raise exception 'FAIL 5: a stranger reading v_workspace_memory ended with [%], expected ok:0', v_got;
  end if;
  v_got := pg_temp.w76_try('anon', '', 'select 1 from v_workspace_memory limit 1');
  if v_got <> '42501' then
    raise exception 'FAIL 5: anon reading v_workspace_memory ended with [%], expected 42501', v_got;
  end if;
end $$;

select 'phase24_190_store: PASS' as result,
       (select count(*) from pg_policies p
         where p.schemaname = 'public'
           and p.tablename in ('workspace_documents', 'workspace_document_text',
                               'workspace_text_embeddings')) as store_policies;

rollback;
