-- bb2dash :: db/tests/phase24_193_ingest_role.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 16, and the
-- ingest queue of the store (answer 17, point 4). Worker W-76.
-- Tests migration 193: the login role `workspace_ingest_runner`, its four SECURITY DEFINER
-- functions (`workspace_ingest_claim`, `_put_text`, `_finish`, `_heartbeat`) and the heartbeat table.
--
--   0. installed, shaped and fenced: the role's attributes, the four signatures, what the role can
--      and cannot execute or read, who holds it; the file carries no password
--   1. claim: oldest first, one document at a time, the sha256 handed over, a remembered item with
--      no link and no hash, the lease and its sweep
--   2. put_text: a second put with the same units leaves one set and no vector of a replaced unit;
--      every bad input is 22023 and writes nothing; a document the caller does not hold
--   3. finish: indexed (needs a unit, its embedded_at and a vector), failed, retry and its three
--      tries; the link is cleared on indexed and on failed alike
--   4. heartbeat; who else may call; what the role itself cannot read
--
-- Every call is made under `set local role workspace_ingest_runner` (193's membership), the way the
-- worker calls it; setup rows and the reads that check a call's effect run as the session role. The
-- unit first parks every document that is really waiting, INSIDE this transaction only, so a claim
-- cannot meet a row that is not its own. All data is synthetic. Nothing is committed.
--
-- AN `execute_sql` DRY RUN of this unit adds, inside its own transaction and before the unit,
--     grant workspace_ingest_runner to postgres with inherit false, set true;
-- because `postgres` cannot `set role` into a login role otherwise. Section 0 allows for that row.
-- RUN IT: `node scripts/db-test.mjs --only phase24_193_ingest_role.sql`.

begin;

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

create function pg_temp.w76_call(p_role text, p_expr text) returns jsonb
  language plpgsql as $$
declare
  v jsonb;
begin
  if p_role is not null then
    execute format('set local role %I', p_role);
  end if;
  execute 'select ' || p_expr into v;
  reset role;
  return v;
end $$;

-- An upload row in a given state, with a link when asked, created p_age ago.
create function pg_temp.w76_up(p_tag text, p_state text, p_age interval, p_link boolean) returns bigint
  language plpgsql as $$
declare
  c_host constant text := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  v_sha  text := md5('w76-193-' || p_tag) || md5('w76-193b-' || p_tag);
  v_id   bigint;
begin
  insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state,
                                   signed_url, signed_url_expires_at, created_at)
  values ('upload', 'w76 193 ' || p_tag, 'text/plain', 10, v_sha, 'u/' || v_sha, p_state,
          case when p_link then c_host || 'u/' || v_sha || '?token=synthetic' end,
          case when p_link then now() + interval '7 days' end, now() - p_age)
  returning id into v_id;
  return v_id;
end $$;

create function pg_temp.w76_basis(p_n integer) returns extensions.vector
  language sql immutable as $$
  select ('[' || array_to_string(array(select case when i = p_n then 1 else 0 end
                                         from generate_series(1, 384) i), ',') || ']')::extensions.vector(384)
$$;

-- =============================================================================================
-- 0. Installed, shaped and fenced
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  r      record;
  f      text;
  v_fns  text[] := array[
    'public.workspace_ingest_claim(text)',
    'public.workspace_ingest_put_text(text, bigint, jsonb)',
    'public.workspace_ingest_finish(text, bigint, text, text)',
    'public.workspace_ingest_heartbeat(text)'];
begin
  if not exists (select 1 from pg_roles where rolname = 'workspace_ingest_runner') then
    raise exception 'FAIL phase24_193: migration 193 is not applied (no role workspace_ingest_runner)';
  end if;
  foreach f in array v_fns loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase24_193: migration 193 is not applied (% is missing)', f;
    end if;
  end loop;
  if to_regclass('public.workspace_ingest_heartbeat') is null then
    raise exception 'FAIL phase24_193: migration 193 is not applied (the heartbeat table is missing)';
  end if;

  select rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolreplication,
         rolconnlimit, coalesce(rolconfig, '{}') as cfg
    into r from pg_roles where rolname = 'workspace_ingest_runner';
  if not r.rolcanlogin then v_fail := v_fail || 'workspace_ingest_runner cannot log in'::text; end if;
  if r.rolinherit then v_fail := v_fail || 'workspace_ingest_runner inherits'::text; end if;
  if r.rolbypassrls then v_fail := v_fail || 'workspace_ingest_runner bypasses RLS'::text; end if;
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication then
    v_fail := v_fail || 'workspace_ingest_runner holds superuser, createrole, createdb or replication'::text;
  end if;
  if r.rolconnlimit <> 4 then v_fail := v_fail || format('connection limit is %s', r.rolconnlimit); end if;
  if not r.cfg @> array['statement_timeout=30s'] then
    v_fail := v_fail || format('no statement_timeout=30s (config %s)', r.cfg);
  end if;

  foreach f in array v_fns loop
    select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner,
           coalesce(p.proconfig, '{}') as cfg, obj_description(p.oid, 'pg_proc') as note
      into r from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f::regprocedure;
    if not r.prosecdef then v_fail := v_fail || format('%s is not security definer', f); end if;
    if r.lanname <> 'plpgsql' then v_fail := v_fail || format('%s is not plpgsql', f); end if;
    if r.owner <> 'postgres' then v_fail := v_fail || format('%s is owned by %s', f, r.owner); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
  end loop;
  for r in
    select * from (values
      ('public.workspace_ingest_claim(text)', 'p_runner text', 'jsonb'),
      ('public.workspace_ingest_put_text(text, bigint, jsonb)', 'p_runner text, p_document_id bigint, p_units jsonb', 'integer'),
      ('public.workspace_ingest_finish(text, bigint, text, text)', 'p_runner text, p_document_id bigint, p_outcome text, p_error_code text', 'text'),
      ('public.workspace_ingest_heartbeat(text)', 'p_runner text', 'void')
    ) as x(sig, args, result)
  loop
    if pg_get_function_identity_arguments(r.sig::regprocedure) is distinct from r.args then
      v_fail := v_fail || format('%s takes (%s)', r.sig, pg_get_function_identity_arguments(r.sig::regprocedure));
    end if;
    if pg_get_function_result(r.sig::regprocedure) is distinct from r.result then
      v_fail := v_fail || format('%s returns %s', r.sig, pg_get_function_result(r.sig::regprocedure));
    end if;
  end loop;

  -- The four are exactly the SECURITY DEFINER functions the role can execute in public.
  select string_agg(p.proname, ',' order by p.proname collate "C") into v_got
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('workspace_ingest_runner', p.oid, 'execute');
  if v_got is distinct from
     'workspace_ingest_claim,workspace_ingest_finish,workspace_ingest_heartbeat,workspace_ingest_put_text' then
    v_fail := v_fail || format('the role executes the SECURITY DEFINER functions [%s]', v_got);
  end if;
  -- Nobody else executes any of the four.
  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('service_role'), ('db_test_runner'),
                 ('sync_runner'), ('workspace_runner')) as w(who)
    cross join unnest(v_fns) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('executable beyond workspace_ingest_runner: %s', v_got);
  end if;

  -- No table, view or sequence privilege in public, on a relation or on a column of one.
  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and ((c.relkind in ('r', 'p', 'v', 'm', 'f')
           and (has_table_privilege('workspace_ingest_runner', c.oid,
                                    'select, insert, update, delete, truncate, references, trigger')
                or has_any_column_privilege('workspace_ingest_runner', c.oid,
                                            'select, insert, update, references')))
          or (c.relkind = 'S'
              and has_sequence_privilege('workspace_ingest_runner', c.oid, 'usage, select, update')));
  if v_got is not null then
    v_fail := v_fail || format('workspace_ingest_runner holds a privilege on %s', v_got);
  end if;
  if not has_schema_privilege('workspace_ingest_runner', 'public', 'usage')
     or has_schema_privilege('workspace_ingest_runner', 'public', 'create') then
    v_fail := v_fail || 'no usage on public, or create on it'::text;
  end if;
  select string_agg(s, ', ' order by s) into v_got
    from unnest(array['realtime', 'auth', 'storage', 'vault', 'cron', 'private']) s
   where has_schema_privilege('workspace_ingest_runner', s, 'usage');
  if v_got is not null then
    v_fail := v_fail || format('usage on %s', v_got);
  end if;

  -- Who holds the role: db_test_runner (inherit false, set true, no admin), and the creator's own row
  -- or an execute_sql dry run's.
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'workspace_ingest_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.inherit_option and m.set_option and not m.admin_option) then
    v_fail := v_fail || 'db_test_runner does not hold the role with inherit false, set true'::text;
  end if;
  select string_agg(m.member::regrole::text, ', ' order by m.member::regrole::text) into v_got
    from pg_auth_members m
   where m.roleid = 'workspace_ingest_runner'::regrole
     and (m.member not in ('db_test_runner'::regrole, 'postgres'::regrole) or m.inherit_option);
  if v_got is not null then
    v_fail := v_fail || format('the role is granted to %s', v_got);
  end if;
  if exists (select 1 from pg_auth_members m where m.member = 'workspace_ingest_runner'::regrole) then
    v_fail := v_fail || 'the role is itself a member of another role'::text;
  end if;

  -- The heartbeat table: one row by check, row security on, the owner reads it, anon nothing.
  if not exists (select 1 from pg_class c where c.oid = 'public.workspace_ingest_heartbeat'::regclass and c.relrowsecurity) then
    v_fail := v_fail || 'row security is off on workspace_ingest_heartbeat'::text;
  end if;
  if has_table_privilege('anon', 'public.workspace_ingest_heartbeat', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.workspace_ingest_heartbeat', 'insert, update, delete')
     or not has_table_privilege('authenticated', 'public.workspace_ingest_heartbeat', 'select') then
    v_fail := v_fail || 'the heartbeat table''s grants are not select for authenticated alone'::text;
  end if;
  if not exists (select 1 from pg_policies p
                  where p.tablename = 'workspace_ingest_heartbeat' and p.cmd = 'SELECT'
                    and coalesce(p.qual, '') like '%app_owner()%') then
    v_fail := v_fail || 'the heartbeat table has no owner select policy'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_193 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 4. The worker's turn, call by call
-- =============================================================================================
do $$
declare
  c_r1 constant text := 'w76-ing-1';
  c_r2 constant text := 'w76-ing-2';
  c_r3 constant text := 'w76-ing-3';
  c_role constant text := 'workspace_ingest_runner';
  v_a bigint; v_b bigint; v_c bigint; v_d bigint; v_e bigint; v_f bigint;
  v_conv  uuid;
  v_out   jsonb;
  v_row   record;
  v_got   text;
  v_n     integer;
  v_u1    bigint; v_u2 bigint;
  v_units jsonb := '[{"unit_kind": "page", "unit_no": 1, "text": "Synthetic page one."}, {"unit_kind": "page", "unit_no": 2, "text": "Synthetic page two."}]';
  v_case  record;
begin
  -- ---------------------------------------------------------------------------------------------
  -- Setup (not an assertion). Park every document that really waits, inside this transaction only.
  -- ---------------------------------------------------------------------------------------------
  update workspace_documents
     set state = 'failed', error_code = 'embed_failed', signed_url = null, signed_url_expires_at = null,
         claimed_by = null, claimed_at = null
   where state in ('stored', 'reading', 'text_ready');
  v_a := pg_temp.w76_up('a', 'stored', interval '3 days', true);
  v_c := pg_temp.w76_up('c', 'stored', interval '1 day', true);
  insert into workspace_conversations (title) values ('w76 193') returning id into v_conv;
  insert into workspace_documents (kind, title, conversation_id, state, created_at)
  values ('memory', 'w76 193 remembered', v_conv, 'text_ready', now() - interval '2 days')
  returning id into v_b;
  insert into workspace_document_text (document_id, unit_kind, unit_no, text)
  values (v_b, 'doc', 1, 'Synthetic remembered summary.');

  -- ---------------------------------------------------------------------------------------------
  -- 1. Claim
  -- ---------------------------------------------------------------------------------------------
  v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r1));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'attempts,byte_size,document_id,kind,mime,sha256,signed_url,signed_url_expires_at,step' then
    raise exception 'FAIL 1a: the claim returned %', v_out;
  end if;
  if (v_out->>'document_id')::bigint <> v_a or v_out->>'kind' <> 'upload' or v_out->>'step' <> 'read'
     or v_out->>'mime' <> 'text/plain' or (v_out->>'byte_size')::int <> 10 or (v_out->>'attempts')::int <> 0
     or v_out->>'sha256' is distinct from (select d.sha256 from workspace_documents d where d.id = v_a)
     or v_out->>'signed_url' is distinct from (select d.signed_url from workspace_documents d where d.id = v_a)
     or v_out->>'signed_url_expires_at' is null then
    raise exception 'FAIL 1a: the oldest document was not handed over whole: %', v_out;
  end if;
  select d.state, d.claimed_by, d.claimed_at is not null as leased into v_row from workspace_documents d where d.id = v_a;
  if v_row.state <> 'reading' or v_row.claimed_by <> c_r1 or not v_row.leased then
    raise exception 'FAIL 1a: after the claim the row reads %', row_to_json(v_row);
  end if;

  -- 1b. A runner that holds a document gets nothing.
  if pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r1)) is not null then
    raise exception 'FAIL 1b: a runner that holds a document was handed a second one';
  end if;

  -- 1c. A remembered item: step embed, no link and no hash, and it stays text_ready.
  v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r2));
  if (v_out->>'document_id')::bigint <> v_b or v_out->>'kind' <> 'memory' or v_out->>'step' <> 'embed'
     or v_out->'mime' <> 'null'::jsonb or v_out->'byte_size' <> 'null'::jsonb or v_out->'sha256' <> 'null'::jsonb
     or v_out->'signed_url' <> 'null'::jsonb or v_out->'signed_url_expires_at' <> 'null'::jsonb then
    raise exception 'FAIL 1c: the remembered item was claimed as %', v_out;
  end if;
  if (select d.state from workspace_documents d where d.id = v_b) <> 'text_ready'
     or (select d.claimed_by from workspace_documents d where d.id = v_b) <> c_r2 then
    raise exception 'FAIL 1c: the remembered item''s state or holder is wrong after the claim';
  end if;

  -- 1d. The next runner gets the next oldest, and then nothing is left.
  v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r3));
  if (v_out->>'document_id')::bigint <> v_c or v_out->>'step' <> 'read' then
    raise exception 'FAIL 1d: the third claim returned %', v_out;
  end if;
  if pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', 'w76-ing-4')) is not null then
    raise exception 'FAIL 1d: a claim with nothing waiting returned a document';
  end if;
  if pg_temp.w76_try(c_role, null, 'select public.workspace_ingest_claim('''')') <> '22023'
     or pg_temp.w76_try(c_role, null, 'select public.workspace_ingest_claim(null)') <> '22023' then
    raise exception 'FAIL 1d: an empty runner name did not end in 22023';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 2. put_text
  -- ---------------------------------------------------------------------------------------------
  v_n := (pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_put_text(%L, %s, %L::jsonb))', c_r1, v_a, v_units)))::text::int;
  if v_n <> 2 then
    raise exception 'FAIL 2a: put_text returned %', v_n;
  end if;
  select d.state, d.claimed_by into v_row from workspace_documents d where d.id = v_a;
  if v_row.state <> 'text_ready' or v_row.claimed_by <> c_r1
     or (select count(*) from workspace_document_text t where t.document_id = v_a) <> 2 then
    raise exception 'FAIL 2a: after put_text the row reads %', row_to_json(v_row);
  end if;
  if (select string_agg(t.unit_kind || t.unit_no || ':' || t.text, '|' order by t.unit_no)
        from workspace_document_text t where t.document_id = v_a)
     is distinct from 'page1:Synthetic page one.|page2:Synthetic page two.' then
    raise exception 'FAIL 2a: the units are not the ones put';
  end if;

  -- 2b. Put again with the same units: one set, and no vector of a replaced unit is left.
  select t.id into v_u1 from workspace_document_text t where t.document_id = v_a and t.unit_no = 1;
  select t.id into v_u2 from workspace_document_text t where t.document_id = v_a and t.unit_no = 2;
  update workspace_document_text set embedded_at = now() where document_id = v_a;
  insert into workspace_text_embeddings (text_id, part_no, model, embedding)
  values (v_u1, 1, 'gte-small', pg_temp.w76_basis(1)), (v_u2, 1, 'gte-small', pg_temp.w76_basis(2));
  -- A document in text_ready is not in reading: a put is refused until the row is read again.
  if pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_put_text(%L, %s, %L::jsonb)', c_r1, v_a, v_units)) <> '22023' then
    raise exception 'FAIL 2b: put_text on a document in text_ready was not refused';
  end if;
  update workspace_documents set state = 'reading' where id = v_a;      -- the worker read it again
  v_n := (pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_put_text(%L, %s, %L::jsonb))', c_r1, v_a, v_units)))::text::int;
  if v_n <> 2 or (select count(*) from workspace_document_text t where t.document_id = v_a) <> 2
     or (select count(*) from workspace_text_embeddings e where e.text_id in (v_u1, v_u2)) <> 0
     or exists (select 1 from workspace_document_text t where t.document_id = v_a and t.embedded_at is not null) then
    raise exception 'FAIL 2b: a second put left % unit(s), % old vector(s)',
      (select count(*) from workspace_document_text t where t.document_id = v_a),
      (select count(*) from workspace_text_embeddings e where e.text_id in (v_u1, v_u2));
  end if;

  -- 2c. What put_text refuses: a document the caller does not hold, a document not in reading, and
  --     every bad p_units; none writes a unit. (C is held by runner 3, in reading, with no unit.)
  for v_case in
    select * from (values
      ('a document another runner holds', format('select public.workspace_ingest_put_text(%L, %s, %L::jsonb)', c_r2, v_c, v_units)),
      ('a document nobody holds', format('select public.workspace_ingest_put_text(%L, %s, %L::jsonb)', c_r3, 0, v_units)),
      ('a remembered item', format('select public.workspace_ingest_put_text(%L, %s, %L::jsonb)', c_r2, v_b, v_units)),
      ('an empty runner name', format('select public.workspace_ingest_put_text('''', %s, %L::jsonb)', v_c, v_units)),
      ('units that are not an array', format('select public.workspace_ingest_put_text(%L, %s, ''{}''::jsonb)', c_r3, v_c)),
      ('null units', format('select public.workspace_ingest_put_text(%L, %s, null)', c_r3, v_c)),
      ('no unit', format('select public.workspace_ingest_put_text(%L, %s, ''[]''::jsonb)', c_r3, v_c)),
      ('1001 units', format('select public.workspace_ingest_put_text(%L, %s, (select jsonb_agg(jsonb_build_object(''unit_kind'', ''page'', ''unit_no'', g, ''text'', ''x'')) from generate_series(1, 1001) g))', c_r3, v_c)),
      ('a unit with empty text', format('select public.workspace_ingest_put_text(%L, %s, ''[{"unit_kind": "page", "unit_no": 1, "text": "  "}]''::jsonb)', c_r3, v_c)),
      ('a unit with no kind', format('select public.workspace_ingest_put_text(%L, %s, ''[{"unit_no": 1, "text": "x"}]''::jsonb)', c_r3, v_c)),
      ('a unit with a kind of 41 characters', format('select public.workspace_ingest_put_text(%L, %s, jsonb_build_array(jsonb_build_object(''unit_kind'', repeat(''k'', 41), ''unit_no'', 1, ''text'', ''x'')))', c_r3, v_c)),
      ('a unit number of 0', format('select public.workspace_ingest_put_text(%L, %s, ''[{"unit_kind": "page", "unit_no": 0, "text": "x"}]''::jsonb)', c_r3, v_c)),
      ('a unit number that is a string', format('select public.workspace_ingest_put_text(%L, %s, ''[{"unit_kind": "page", "unit_no": "2", "text": "x"}]''::jsonb)', c_r3, v_c)),
      ('a unit that is not an object', format('select public.workspace_ingest_put_text(%L, %s, ''["x"]''::jsonb)', c_r3, v_c)),
      ('one (kind, number) twice', format('select public.workspace_ingest_put_text(%L, %s, ''[{"unit_kind": "page", "unit_no": 1, "text": "x"}, {"unit_kind": "page", "unit_no": 1, "text": "y"}]''::jsonb)', c_r3, v_c)),
      ('over 1.5 million characters', format('select public.workspace_ingest_put_text(%L, %s, jsonb_build_array(jsonb_build_object(''unit_kind'', ''doc'', ''unit_no'', 1, ''text'', repeat(''w'', 1500001))))', c_r3, v_c))
    ) as x(label, stmt)
  loop
    v_got := pg_temp.w76_try(c_role, null, v_case.stmt);
    if v_got <> '22023' then
      raise exception 'FAIL 2c: %: got [%], expected 22023', v_case.label, v_got;
    end if;
  end loop;
  if (select count(*) from workspace_document_text t where t.document_id = v_c) <> 0
     or (select d.state from workspace_documents d where d.id = v_c) <> 'reading' then
    raise exception 'FAIL 2c: a refused put wrote a unit or moved the row';
  end if;
  -- Exactly 1000 units and exactly 1.5 million characters are accepted.
  v_n := (pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_put_text(%L, %s, (select jsonb_agg(jsonb_build_object(''unit_kind'', ''page'', ''unit_no'', g, ''text'', ''x'')) from generate_series(1, 1000) g)))', c_r3, v_c)))::text::int;
  if v_n <> 1000 then
    raise exception 'FAIL 2c: 1000 units were not accepted (%)', v_n;
  end if;
  update workspace_documents set state = 'reading' where id = v_c;
  v_n := (pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_put_text(%L, %s, jsonb_build_array(jsonb_build_object(''unit_kind'', ''doc'', ''unit_no'', 1, ''text'', repeat(''w'', 1500000)))))', c_r3, v_c)))::text::int;
  if v_n <> 1 or (select count(*) from workspace_document_text t where t.document_id = v_c) <> 1 then
    raise exception 'FAIL 2c: 1.5 million characters were not accepted, or the 1000 units were not replaced';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 3. finish
  -- ---------------------------------------------------------------------------------------------
  -- 3a. indexed is refused while a unit has no embedded_at, or no vector.
  select t.id into v_u1 from workspace_document_text t where t.document_id = v_a and t.unit_no = 1;
  select t.id into v_u2 from workspace_document_text t where t.document_id = v_a and t.unit_no = 2;
  update workspace_documents set state = 'text_ready' where id = v_a;
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''indexed'', null)', c_r1, v_a));
  if v_got <> '22023' then
    raise exception 'FAIL 3a: indexed with units that have no embedded_at ended with [%], expected 22023', v_got;
  end if;
  update workspace_document_text set embedded_at = now() where document_id = v_a;
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''indexed'', null)', c_r1, v_a));
  if v_got <> '22023' then
    raise exception 'FAIL 3a: indexed with units that have no vector ended with [%], expected 22023', v_got;
  end if;
  insert into workspace_text_embeddings (text_id, part_no, model, embedding)
  values (v_u1, 1, 'gte-small', pg_temp.w76_basis(1)), (v_u2, 1, 'gte-small', pg_temp.w76_basis(2));
  v_got := pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_finish(%L, %s, ''indexed'', null))', c_r1, v_a))#>>'{}';
  select d.state, d.signed_url, d.signed_url_expires_at, d.claimed_by, d.claimed_at, d.error_code into v_row
    from workspace_documents d where d.id = v_a;
  if v_got <> 'indexed' or v_row.state <> 'indexed' or v_row.signed_url is not null
     or v_row.signed_url_expires_at is not null or v_row.claimed_by is not null or v_row.claimed_at is not null
     or v_row.error_code is not null then
    raise exception 'FAIL 3a: indexed returned [%] and the row reads %', v_got, row_to_json(v_row);
  end if;

  -- 3b. indexed is refused for a document with no unit (a remembered item with its unit removed),
  --     and for a document the caller does not hold.
  delete from workspace_document_text where document_id = v_b;
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''indexed'', null)', c_r2, v_b));
  if v_got <> '22023' then
    raise exception 'FAIL 3b: indexed for a document with no unit ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''indexed'', null)', c_r1, v_b));
  if v_got <> '22023' then
    raise exception 'FAIL 3b: finish by a runner that does not hold the document ended with [%], expected 22023', v_got;
  end if;

  -- 3c. failed: the row ends failed with its code, and the link is cleared.
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''failed'', ''nope'')', c_r3, v_c));
  if v_got <> '22023' then
    raise exception 'FAIL 3c: failed with a code off the ten ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''failed'', null)', c_r3, v_c));
  if v_got <> '22023' then
    raise exception 'FAIL 3c: failed with no code ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_finish(%L, %s, ''bogus'', null)', c_r3, v_c));
  if v_got <> '22023' then
    raise exception 'FAIL 3c: an outcome off the three ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_finish(%L, %s, ''failed'', ''bad_bytes''))', c_r3, v_c))#>>'{}';
  select d.state, d.error_code, d.signed_url, d.signed_url_expires_at, d.claimed_by into v_row from workspace_documents d where d.id = v_c;
  if v_got <> 'failed' or v_row.state <> 'failed' or v_row.error_code <> 'bad_bytes'
     or v_row.signed_url is not null or v_row.signed_url_expires_at is not null or v_row.claimed_by is not null then
    raise exception 'FAIL 3c: failed returned [%] and the row reads %', v_got, row_to_json(v_row);
  end if;

  -- 3d. retry: three tries. From reading the row goes back to stored; the third ends it failed.
  v_e := pg_temp.w76_up('e', 'stored', interval '30 minutes', true);
  for v_n in 1..3 loop
    v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r1));
    if (v_out->>'document_id')::bigint <> v_e or (v_out->>'attempts')::int <> v_n - 1 then
      raise exception 'FAIL 3d: claim % of the retried row returned %', v_n, v_out;
    end if;
    v_got := pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_finish(%L, %s, ''retry'', ''download_failed''))', c_r1, v_e))#>>'{}';
    select d.state, d.attempts, d.claimed_by, d.signed_url is not null as has_link, d.error_code into v_row
      from workspace_documents d where d.id = v_e;
    if v_n < 3 and (v_got <> 'stored' or v_row.state <> 'stored' or v_row.attempts <> v_n
                    or v_row.claimed_by is not null or not v_row.has_link) then
      raise exception 'FAIL 3d: retry % returned [%] and the row reads %', v_n, v_got, row_to_json(v_row);
    end if;
    if v_n = 3 and (v_got <> 'failed' or v_row.state <> 'failed' or v_row.attempts <> 3
                    or v_row.error_code <> 'download_failed' or v_row.has_link) then
      raise exception 'FAIL 3d: the third retry returned [%] and the row reads %', v_got, row_to_json(v_row);
    end if;
    -- 199: a retried document is not handed out again until 60 seconds times its attempts have passed
    -- since the try (claimed_at); the clock is moved by setting claimed_at back.
    if v_n < 3 then
      if pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r1)) is not null then
        raise exception 'FAIL 3d: retry % was handed out again at once', v_n;
      end if;
      update workspace_documents set claimed_at = now() - (v_n * 60 - 1) * interval '1 second' where id = v_e;
      if pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r1)) is not null then
        raise exception 'FAIL 3d: retry % was handed out 1 second early', v_n;
      end if;
      update workspace_documents set claimed_at = now() - v_n * interval '60 seconds' where id = v_e;
    end if;
  end loop;
  -- A retry of a step in text_ready stays in text_ready.
  v_d := pg_temp.w76_up('d', 'text_ready', interval '20 minutes', false);
  v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', c_r1));
  if (v_out->>'document_id')::bigint <> v_d or v_out->>'step' <> 'embed' then
    raise exception 'FAIL 3d: the embed step of an upload was claimed as %', v_out;
  end if;
  v_got := pg_temp.w76_call(c_role, format('to_jsonb(public.workspace_ingest_finish(%L, %s, ''retry'', ''embed_failed''))', c_r1, v_d))#>>'{}';
  select d.state, d.attempts, d.claimed_by into v_row from workspace_documents d where d.id = v_d;
  if v_got <> 'text_ready' or v_row.state <> 'text_ready' or v_row.attempts <> 1 or v_row.claimed_by is not null then
    raise exception 'FAIL 3d: a retry from text_ready returned [%] and the row reads %', v_got, row_to_json(v_row);
  end if;

  -- 3e. The lease. A hold older than 10 minutes died with its worker: the next claim counts it as a
  --     try, hands the row over again, and the third such hold ends it failed.
  v_f := pg_temp.w76_up('f', 'reading', interval '10 minutes', true);
  update workspace_documents set claimed_by = 'w76-dead', claimed_at = now() - interval '11 minutes',
         created_at = now() - interval '10 days', state = 'reading' where id = v_f;
  update workspace_documents set state = 'failed', error_code = 'embed_failed', claimed_by = null, claimed_at = null where id = v_d;
  v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', 'w76-ing-5'));
  if (v_out->>'document_id')::bigint <> v_f or (v_out->>'attempts')::int <> 1 or v_out->>'step' <> 'read' then
    raise exception 'FAIL 3e: the claim after a dead hold returned %', v_out;
  end if;
  update workspace_documents set claimed_by = 'w76-dead', claimed_at = now() - interval '11 minutes', attempts = 2 where id = v_f;
  v_out := pg_temp.w76_call(c_role, format('public.workspace_ingest_claim(%L)', 'w76-ing-6'));
  select d.state, d.error_code, d.attempts, d.signed_url, d.claimed_by into v_row from workspace_documents d where d.id = v_f;
  if v_out is not null or v_row.state <> 'failed' or v_row.error_code <> 'extract_failed' or v_row.attempts <> 3
     or v_row.signed_url is not null or v_row.claimed_by is not null then
    raise exception 'FAIL 3e: the third dead hold returned % and the row reads %', v_out, row_to_json(v_row);
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 4. heartbeat, and who else may call
  -- ---------------------------------------------------------------------------------------------
  delete from workspace_ingest_heartbeat where id = 1;
  if pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_heartbeat(%L)', c_r1)) <> 'ok:1' then
    raise exception 'FAIL 4a: the heartbeat call failed';
  end if;
  if (select count(*) from workspace_ingest_heartbeat) <> 1
     or (select h.runner from workspace_ingest_heartbeat h where h.id = 1) <> c_r1 then
    raise exception 'FAIL 4a: the heartbeat row is not the first call''s';
  end if;
  update workspace_ingest_heartbeat set polled_at = now() - interval '1 hour', runner = 'old' where id = 1;
  perform pg_temp.w76_try(c_role, null, format('select public.workspace_ingest_heartbeat(%L)', c_r2));
  if (select count(*) from workspace_ingest_heartbeat) <> 1
     or (select h.runner from workspace_ingest_heartbeat h where h.id = 1) <> c_r2
     or (select h.polled_at from workspace_ingest_heartbeat h where h.id = 1) < now() - interval '1 minute' then
    raise exception 'FAIL 4a: a second heartbeat did not update the one row';
  end if;
  if pg_temp.w76_try(c_role, null, 'select public.workspace_ingest_heartbeat('' '')') <> '22023' then
    raise exception 'FAIL 4a: a blank runner name did not end in 22023';
  end if;
  insert into workspace_conversations (title) values ('w76 193 owner') returning id into v_conv;

  for v_case in
    select * from (values
      ('anon', format('select public.workspace_ingest_claim(%L)', c_r1)),
      ('anon', format('select public.workspace_ingest_heartbeat(%L)', c_r1)),
      ('authenticated', format('select public.workspace_ingest_claim(%L)', c_r1)),
      ('authenticated', format('select public.workspace_ingest_finish(%L, 1, ''failed'', ''bad_bytes'')', c_r1)),
      ('authenticated', format('select public.workspace_ingest_put_text(%L, 1, ''[]''::jsonb)', c_r1)),
      ('workspace_ingest_runner', 'select 1 from workspace_documents limit 1'),
      ('workspace_ingest_runner', 'select 1 from workspace_document_text limit 1'),
      ('workspace_ingest_runner', 'select 1 from workspace_text_embeddings limit 1'),
      ('workspace_ingest_runner', 'select 1 from workspace_conversations limit 1'),
      ('workspace_ingest_runner', 'select 1 from workspace_messages limit 1'),
      ('workspace_ingest_runner', 'select 1 from assignment_progress limit 1'),
      ('workspace_ingest_runner', 'select 1 from workspace_ingest_heartbeat limit 1'),
      ('workspace_ingest_runner', 'update workspace_documents set state = ''indexed'''),
      ('workspace_ingest_runner', 'select public.workspace_claim(''x'')'),
      ('workspace_ingest_runner', 'select public.workspace_upload_register(''x'', ''t'', ''text/plain'', 1, ''u'', now())')
    ) as x(who, stmt)
  loop
    v_got := pg_temp.w76_try(v_case.who, null, v_case.stmt);
    if v_got <> '42501' then
      raise exception 'FAIL 4b: % running [%] ended with [%], expected 42501', v_case.who, v_case.stmt, v_got;
    end if;
  end loop;
end $$;

select 'phase24_193_ingest_role: PASS' as result,
       (select count(*) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.prosecdef
           and has_function_privilege('workspace_ingest_runner', p.oid, 'execute')) as ingest_definer_functions;

rollback;
