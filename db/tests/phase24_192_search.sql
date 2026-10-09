-- bb2dash :: db/tests/phase24_192_search.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 15, and the
-- store's checks 22 and 23 (answer 17). Worker W-76.
-- Tests migration 192: `workspace_search`, its twin `hybrid_search_workspace_text` and
-- `workspace_attachment_read`.
--
--   0. installed and fenced: invoker, pinned path, service_role and the test login only; anon and
--      authenticated get 42501; the twin ranks with operator(extensions.<=>)
--   1. three kinds from synthetic rows, the kind on every row and never null; a document in
--      `deleting` or `failed` is never returned
--   2. exactly 3 rows (2 upload, 1 memory) for a token only those three units hold
--   3. a course scope leaves out another course's unit and keeps an untagged upload and the memory
--   4. a kind list, a kind's limit, a passage of at most 2,000 characters, the [notes] marker
--   5. the model: a unit whose only vector is under another model name has no similarity under the
--      default `p_model` and has one when `p_model` is that name
--   6. workspace_attachment_read: read, cut (whole units, the first cut when alone too long), the
--      40-id cap, no_text, not_ready, failed, missing, and the eleven keys in every state
--
-- Every row is synthetic and written inside the unit's own transaction. The course units are
-- written as the owner's session (the session role holds no write on the course text tables); the
-- tokens are made-up words, and a similarity floor of 0.999 with a basis vector keeps the real
-- corpus out of the vector arm, so the counts are exact on prod. Nothing is committed.
-- RUN IT: `node scripts/db-test.mjs --only phase24_192_search.sql`.

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

-- The unit vector of axis n: cosine 1 with itself and 0 with any other axis.
create function pg_temp.w76_basis(p_n integer) returns extensions.vector
  language sql immutable as $$
  select ('[' || array_to_string(array(select case when i = p_n then 1 else 0 end
                                         from generate_series(1, 384) i), ',') || ']')::extensions.vector(384)
$$;

create function pg_temp.w76_doc(p_kind text, p_title text, p_course text, p_state text,
                                p_tag text, p_conv uuid default null) returns bigint
  language plpgsql as $$
declare
  v_sha text := md5('w76-192-' || p_tag) || md5('w76-192b-' || p_tag);
  v_id  bigint;
begin
  if p_kind = 'upload' then
    insert into workspace_documents (kind, title, course_id, mime, byte_size, sha256, storage_key, state)
    values ('upload', p_title, p_course, 'text/plain', 10, v_sha, 'u/' || v_sha, p_state)
    returning id into v_id;
  else
    insert into workspace_documents (kind, title, conversation_id, state)
    values ('memory', p_title, p_conv, p_state)
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- One unit and, when a vector is given, its one stored part under p_model.
create function pg_temp.w76_unit(p_doc bigint, p_kind text, p_no integer, p_text text,
                                 p_vec extensions.vector, p_model text default 'gte-small') returns bigint
  language plpgsql as $$
declare
  v_id bigint;
begin
  insert into workspace_document_text (document_id, unit_kind, unit_no, text, embedded_at)
  values (p_doc, p_kind, p_no, p_text, case when p_vec is null then null else now() end)
  returning id into v_id;
  if p_vec is not null then
    insert into workspace_text_embeddings (text_id, part_no, model, embedding)
    values (v_id, 1, p_model, p_vec);
  end if;
  return v_id;
end $$;

-- =============================================================================================
-- 0. Installed and fenced
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  v_got  text;
  r      record;
  f      text;
  v_fns  text[] := array[
    'public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision)',
    'public.workspace_search(text, extensions.vector, text[], text[], integer, double precision, text)',
    'public.workspace_attachment_read(text, bigint, integer)'];
begin
  foreach f in array v_fns loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase24_192: migration 192 is not applied (% is missing)', f;
    end if;
    select p.prosecdef, l.lanname, coalesce(p.proconfig, '{}') as cfg, p.provolatile,
           obj_description(p.oid, 'pg_proc') as note
      into r from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f::regprocedure;
    if r.prosecdef then v_fail := v_fail || format('%s is security definer', f); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path = public, pg_temp', f);
    end if;
    if r.provolatile <> 's' then v_fail := v_fail || format('%s is not stable', f); end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
  end loop;

  select string_agg(w.who || ':' || g.fn, ', ' order by w.who collate "C", g.fn collate "C") into v_got
    from (values ('public'), ('anon'), ('authenticated'), ('workspace_runner'), ('sync_runner')) as w(who)
    cross join unnest(v_fns) as g(fn)
   where has_function_privilege(w.who::name, g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('executable beyond service_role: %s', v_got);
  end if;
  select string_agg(g.fn, ', ') into v_got
    from unnest(v_fns) as g(fn)
   where not has_function_privilege('service_role', g.fn, 'execute')
      or not has_function_privilege('db_test_runner', g.fn, 'execute');
  if v_got is not null then
    v_fail := v_fail || format('service_role or db_test_runner cannot execute %s', v_got);
  end if;

  if position('operator(extensions.<=>)' in pg_get_functiondef(v_fns[1]::regprocedure)) = 0 then
    v_fail := v_fail || 'hybrid_search_workspace_text does not use operator(extensions.<=>)'::text;
  end if;
  -- The signature the fixture folder freezes.
  if pg_get_function_result(v_fns[2]::regprocedure) is distinct from
     'TABLE(kind text, unit_id bigint, file_id bigint, document_id bigint, course_id text, title text, '
     'unit_kind text, unit_no integer, part_no integer, similarity double precision, '
     'score double precision, passage text, has_notes boolean)' then
    v_fail := v_fail || format('workspace_search returns [%s]', pg_get_function_result(v_fns[2]::regprocedure));
  end if;
  if pg_get_function_identity_arguments(v_fns[2]::regprocedure) is distinct from
     'p_q text, p_query_embedding extensions.vector, p_kinds text[], p_courses text[], p_limit integer, '
     'p_min_similarity double precision, p_model text' then
    v_fail := v_fail || format('workspace_search takes (%s)', pg_get_function_identity_arguments(v_fns[2]::regprocedure));
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_192 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 5. Search
-- =============================================================================================
do $$
declare
  v_owner  uuid := app_owner();
  v_e9     extensions.vector := pg_temp.w76_basis(9);
  v_e8     extensions.vector := pg_temp.w76_basis(8);
  v_e7     extensions.vector := pg_temp.w76_basis(7);
  c_floor  constant double precision := 0.999;
  v_c1 text; v_c2 text;
  v_f1 bigint; v_f2 bigint;
  v_m1 bigint; v_m2 bigint;                              -- course units of F1 (c1) and F2 (c2)
  v_d1 bigint; v_d2 bigint; v_d3 bigint; v_d4 bigint; v_d5 bigint;   -- uploads of the alpha token
  v_d6 bigint; v_d7 bigint; v_d8 bigint; v_d9 bigint;                -- beta, gamma, delta, notes
  v_x1 bigint; v_x2 bigint;                               -- memory documents
  v_u1 bigint; v_u2 bigint; v_u3 bigint; v_u4 bigint; v_u5 bigint;
  v_u6 bigint; v_u7 bigint; v_u8 bigint; v_u9 bigint; v_x1u bigint; v_x2u bigint;
  v_conv1 uuid; v_conv2 uuid;
  v_got   text;
  v_want  text;
  v_n     integer;
  v_row   record;
begin
  if v_owner is null then
    raise exception 'FAIL phase24_192: app_owner() returned null, so the owner cannot be simulated';
  end if;
  select (array_agg(c.id order by c.id))[1], (array_agg(c.id order by c.id))[2]
    into v_c1, v_c2 from courses c;
  if v_c2 is null then
    raise exception 'FAIL phase24_192 (setup): the unit needs two courses in the courses table';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- Setup (not an assertion). Course files: two files in two courses, the alpha token in both.
  -- ---------------------------------------------------------------------------------------------
  insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
  select c.bb_course_id, c.id, 'readings', 'w76 192 file one.pdf',
         'https://example.invalid/_w76_192_f1', 'rule', now()
    from courses c where c.id = v_c1;
  insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
  select c.bb_course_id, c.id, 'readings', 'w76 192 file two.pdf',
         'https://example.invalid/_w76_192_f2', 'rule', now()
    from courses c where c.id = v_c2;
  select f.id into v_f1 from bb_files f where f.source_url = 'https://example.invalid/_w76_192_f1';
  select f.id into v_f2 from bb_files f where f.source_url = 'https://example.invalid/_w76_192_f2';
  if v_f1 is null or v_f2 is null then
    raise exception 'FAIL phase24_192 (setup): the synthetic course files were not written';
  end if;
  if pg_temp.w76_try('authenticated', v_owner::text, format(
       'insert into bb_file_text (file_id, unit_kind, unit_no, text) values (%s, ''slide'', 1, %L), (%s, ''slide'', 1, %L), (%s, ''slide'', 2, %L)',
       v_f1, 'Synthetic slide about qzxwvalpha in the first course.', v_f2,
       'Synthetic slide about qzxwvalpha in the second course.', v_f1,
       'Second slide of the first file. [notes] Speaker words with qzxwvnotes inside.')) <> 'ok:3' then
    raise exception 'FAIL phase24_192 (setup): the synthetic course units were not written';
  end if;
  select t.id into v_m1 from bb_file_text t where t.file_id = v_f1 and t.unit_no = 1;
  select t.id into v_m2 from bb_file_text t where t.file_id = v_f2 and t.unit_no = 1;
  if pg_temp.w76_try('authenticated', v_owner::text, format(
       'insert into bb_text_embeddings (text_id, part_no, part_range, model, embedding) values (%s, 1, int4range(0, 60), ''gte-small'', %L), (%s, 1, int4range(0, 60), ''gte-small'', %L)',
       v_m1, pg_temp.w76_basis(9)::text, v_m2, pg_temp.w76_basis(9)::text)) <> 'ok:2' then
    raise exception 'FAIL phase24_192 (setup): the synthetic course vectors were not written';
  end if;

  -- Uploads and remembered items.
  insert into workspace_conversations (title) values ('w76 192 one') returning id into v_conv1;
  insert into workspace_conversations (title) values ('w76 192 two') returning id into v_conv2;
  v_d1 := pg_temp.w76_doc('upload', 'w76 u1 untagged', null, 'indexed', 'u1');
  v_d2 := pg_temp.w76_doc('upload', 'w76 u2 second course', v_c2, 'indexed', 'u2');
  v_d3 := pg_temp.w76_doc('upload', 'w76 u3 first course', v_c1, 'text_ready', 'u3');
  v_d4 := pg_temp.w76_doc('upload', 'w76 u4 failed', null, 'failed', 'u4');
  v_d5 := pg_temp.w76_doc('upload', 'w76 u5 deleting', null, 'deleting', 'u5');
  v_d6 := pg_temp.w76_doc('upload', 'w76 u6 beta', null, 'indexed', 'u6');
  v_d7 := pg_temp.w76_doc('upload', 'w76 u7 beta', null, 'indexed', 'u7');
  v_d8 := pg_temp.w76_doc('upload', 'w76 u8 gamma', null, 'indexed', 'u8');
  v_d9 := pg_temp.w76_doc('upload', 'w76 u9 long', null, 'indexed', 'u9');
  v_x1 := pg_temp.w76_doc('memory', 'w76 remembered one', null, 'indexed', 'x1', v_conv1);
  v_x2 := pg_temp.w76_doc('memory', 'w76 remembered two', null, 'indexed', 'x2', v_conv2);
  v_u1 := pg_temp.w76_unit(v_d1, 'doc', 1, 'Upload one holds qzxwvalpha plainly.', v_e9);
  v_u2 := pg_temp.w76_unit(v_d2, 'doc', 1, 'Upload two holds qzxwvalpha plainly.', v_e9);
  v_u3 := pg_temp.w76_unit(v_d3, 'doc', 1, 'Upload three holds qzxwvalpha plainly.', v_e9);
  v_u4 := pg_temp.w76_unit(v_d4, 'doc', 1, 'Upload four, failed, holds qzxwvalpha plainly.', v_e9);
  v_u5 := pg_temp.w76_unit(v_d5, 'doc', 1, 'Upload five, deleting, holds qzxwvalpha plainly.', v_e9);
  v_x1u := pg_temp.w76_unit(v_x1, 'doc', 1, 'Remembered item one holds qzxwvalpha plainly.', v_e9);
  v_u6 := pg_temp.w76_unit(v_d6, 'page', 1, 'Upload six holds qzxwvbeta plainly.', v_e8);
  v_u7 := pg_temp.w76_unit(v_d7, 'page', 1, 'Upload seven holds qzxwvbeta plainly.', v_e8);
  v_x2u := pg_temp.w76_unit(v_x2, 'doc', 1, 'Remembered item two holds qzxwvbeta plainly.', v_e8);
  -- The gamma unit has one vector, under another model name.
  v_u8 := pg_temp.w76_unit(v_d8, 'doc', 1, 'Upload eight holds qzxwvgamma plainly.', v_e7, 'other-model');
  -- A long unit and a unit with the speaker-notes marker.
  v_u9 := pg_temp.w76_unit(v_d9, 'doc', 1, repeat('qzxwvdelta filler words fill this line. ', 200), pg_temp.w76_basis(6));
  insert into workspace_document_text (document_id, unit_kind, unit_no, text)
  values (v_d9, 'slide', 2, 'Slide with qzxwvnotes before the mark. [notes] Speaker words after it.');

  -- ---------------------------------------------------------------------------------------------
  -- 1. Three kinds, the kind on every row, nothing from a document in deleting or failed
  -- ---------------------------------------------------------------------------------------------
  select string_agg(s.kind || ':' || s.unit_id, ',' order by s.kind collate "C", s.unit_id), count(*) filter (where s.kind is null)
    into v_got, v_n
    from workspace_search('qzxwvalpha', v_e9, array['material', 'upload', 'memory'], null, 10, c_floor) s;
  v_want := 'material:' || least(v_m1, v_m2) || ',material:' || greatest(v_m1, v_m2)
         || ',memory:' || v_x1u
         || ',upload:' || v_u1 || ',upload:' || v_u2 || ',upload:' || v_u3;
  -- the order of the upload ids is the order they were written in
  if v_got is distinct from v_want or v_n <> 0 then
    raise exception 'FAIL 1: the alpha search returned [%], expected [%] (null kinds: %)', v_got, v_want, v_n;
  end if;
  if exists (select 1 from workspace_search('qzxwvalpha', v_e9, null, null, 10, c_floor) s
              where s.unit_id in (v_u4, v_u5) and s.kind = 'upload') then
    raise exception 'FAIL 1: a document in failed or deleting came back';
  end if;
  -- The shape of a row: a course unit has file_id and no document_id, the others the reverse.
  for v_row in select * from workspace_search('qzxwvalpha', v_e9, null, null, 10, c_floor) loop
    if v_row.kind = 'material' and (v_row.file_id is null or v_row.document_id is not null) then
      raise exception 'FAIL 1: a material row reads %', row_to_json(v_row);
    end if;
    if v_row.kind <> 'material' and (v_row.file_id is not null or v_row.document_id is null) then
      raise exception 'FAIL 1: a % row reads %', v_row.kind, row_to_json(v_row);
    end if;
    if v_row.kind not in ('material', 'upload', 'memory') or v_row.passage is null
       or v_row.has_notes is null or v_row.title is null then
      raise exception 'FAIL 1: a row has a null kind, passage, title or has_notes: %', row_to_json(v_row);
    end if;
  end loop;
  -- The unit ids resolve to the right documents.
  if (select s.document_id from workspace_search('qzxwvalpha', v_e9, array['memory'], null, 10, c_floor) s) is distinct from v_x1 then
    raise exception 'FAIL 1: the remembered row names another document';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 2. Exactly 3 rows for a token only 3 units hold: 2 upload, 1 memory
  -- ---------------------------------------------------------------------------------------------
  select string_agg(s.kind || ':' || s.unit_id, ',' order by s.kind collate "C", s.unit_id) into v_got
    from workspace_search('qzxwvbeta', v_e8, array['material', 'upload', 'memory'], null, 10, c_floor) s;
  if v_got is distinct from 'memory:' || v_x2u || ',upload:' || least(v_u6, v_u7) || ',upload:' || greatest(v_u6, v_u7) then
    raise exception 'FAIL 2: the beta search returned [%]', v_got;
  end if;
  -- The keyword arm alone (a query vector far from every stored vector) finds the same three.
  select count(*) into v_n
    from workspace_search('qzxwvbeta', pg_temp.w76_basis(100), null, null, 10, c_floor) s;
  if v_n <> 3 then
    raise exception 'FAIL 2: the keyword arm alone returned % rows, expected 3', v_n;
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 3. A course scope
  -- ---------------------------------------------------------------------------------------------
  select string_agg(s.kind || ':' || s.unit_id, ',' order by s.kind collate "C", s.unit_id) into v_got
    from workspace_search('qzxwvalpha', v_e9, null, array[v_c1], 10, c_floor) s;
  v_want := 'material:' || v_m1 || ',memory:' || v_x1u || ',upload:' || v_u1 || ',upload:' || v_u3;
  if v_got is distinct from v_want then
    raise exception 'FAIL 3: scope [first course] returned [%], expected [%]', v_got, v_want;
  end if;
  select string_agg(s.kind || ':' || s.unit_id, ',' order by s.kind collate "C", s.unit_id) into v_got
    from workspace_search('qzxwvalpha', v_e9, null, array[v_c2], 10, c_floor) s;
  v_want := 'material:' || v_m2 || ',memory:' || v_x1u || ',upload:' || v_u1 || ',upload:' || v_u2;
  if v_got is distinct from v_want then
    raise exception 'FAIL 3: scope [second course] returned [%], expected [%]', v_got, v_want;
  end if;
  select count(*) into v_n from workspace_search('qzxwvalpha', v_e9, null, array[v_c1, v_c2], 10, c_floor) s;
  if v_n <> 6 then
    raise exception 'FAIL 3: scope [both courses] returned % rows, expected 6', v_n;
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 4. A kind list, a kind's limit, a long passage, the notes marker
  -- ---------------------------------------------------------------------------------------------
  select string_agg(distinct s.kind, ',') into v_got
    from workspace_search('qzxwvalpha', v_e9, array['memory'], null, 10, c_floor) s;
  if v_got is distinct from 'memory' then
    raise exception 'FAIL 4: kinds [memory] returned [%]', v_got;
  end if;
  select string_agg(distinct s.kind, ',') into v_got
    from workspace_search('qzxwvalpha', v_e9, array['upload', 'material'], null, 10, c_floor) s;
  if v_got is distinct from 'material,upload' then
    raise exception 'FAIL 4: kinds [upload, material] returned [%]', v_got;
  end if;
  -- p_limit is a kind's limit: one row of each of the three kinds.
  select string_agg(s.kind, ',' order by s.kind collate "C") into v_got
    from workspace_search('qzxwvalpha', v_e9, null, null, 1, c_floor) s;
  if v_got is distinct from 'material,memory,upload' then
    raise exception 'FAIL 4: p_limit 1 returned [%], expected one row of each kind', v_got;
  end if;
  -- A passage is at most 2000 characters, however long the unit.
  select max(char_length(s.passage)) into v_n
    from workspace_search('qzxwvdelta', pg_temp.w76_basis(6), null, null, 10, c_floor) s;
  if v_n is null or v_n > 2000 or v_n < 100 then
    raise exception 'FAIL 4: the longest passage of the long unit is % characters, expected 100 to 2000', v_n;
  end if;
  -- has_notes: a passage that holds the marker says so; a plain one does not.
  select count(*) into v_n
    from workspace_search('qzxwvnotes', pg_temp.w76_basis(100), array['upload'], null, 10, c_floor) s
   where s.has_notes and s.unit_id <> v_u1;
  if v_n < 1 then
    raise exception 'FAIL 4: no upload row says it holds the [notes] marker';
  end if;
  if exists (select 1 from workspace_search('qzxwvalpha', v_e9, array['upload'], null, 10, c_floor) s
              where s.has_notes) then
    raise exception 'FAIL 4: a plain upload passage says it holds the [notes] marker';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 5. The model
  -- ---------------------------------------------------------------------------------------------
  select s.similarity into v_row from workspace_search('qzxwvgamma', v_e7, array['upload'], null, 10, c_floor) s
   where s.unit_id = v_u8;
  if not found or v_row.similarity is not null then
    raise exception 'FAIL 5: under the default model the unit with only an other-model vector reads %',
      row_to_json(v_row);
  end if;
  select s.similarity into v_row
    from workspace_search('qzxwvgamma', v_e7, array['upload'], null, 10, c_floor, 'other-model') s
   where s.unit_id = v_u8;
  if not found or v_row.similarity is null or v_row.similarity < 0.999 then
    raise exception 'FAIL 5: under p_model other-model the unit reads %', row_to_json(v_row);
  end if;
  -- Without the keyword, the vector alone ranks under its own model name only.
  select count(*) into v_n
    from workspace_search('nosuchtokenatall', v_e7, array['upload'], null, 10, c_floor) s where s.unit_id = v_u8;
  if v_n <> 0 then
    raise exception 'FAIL 5: a vector of another model was ranked under the default model';
  end if;
  select count(*) into v_n
    from workspace_search('nosuchtokenatall', v_e7, array['upload'], null, 10, c_floor, 'other-model') s
   where s.unit_id = v_u8;
  if v_n <> 1 then
    raise exception 'FAIL 5: the vector of other-model was not ranked when p_model named it';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 0b. anon and authenticated are refused (42501), whatever they pass
  -- ---------------------------------------------------------------------------------------------
  for v_row in
    select * from (values ('anon'), ('authenticated')) as x(who)
  loop
    foreach v_got in array array[
      'select * from public.workspace_search(''x'', null, null, null, 10)',
      'select * from public.hybrid_search_workspace_text(''x'', null)',
      'select public.workspace_attachment_read(''upload'', 1, 100)']
    loop
      if pg_temp.w76_try(v_row.who, v_owner::text, v_got) <> '42501' then
        raise exception 'FAIL 0b: % calling [%] did not end in 42501', v_row.who, v_got;
      end if;
    end loop;
  end loop;

  -- ---------------------------------------------------------------------------------------------
  -- 6. workspace_attachment_read
  -- ---------------------------------------------------------------------------------------------
  declare
    v_out jsonb;
    v_f3  bigint;
    v_f4  bigint;
    v_ids bigint[];
  begin
    -- F1 holds two units; give it a third so a cut is possible. Units: 62, 74 and 100 characters.
    if pg_temp.w76_try('authenticated', v_owner::text, format(
         'insert into bb_file_text (file_id, unit_kind, unit_no, text) values (%s, ''slide'', 3, repeat(''z'', 100))', v_f1)) <> 'ok:1' then
      raise exception 'FAIL phase24_192 (setup): the third unit was not written';
    end if;
    select array_agg(t.id order by t.unit_no) into v_ids from bb_file_text t where t.file_id = v_f1;
    -- whole file
    v_out := workspace_attachment_read('file', v_f1, 100000);
    if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
       is distinct from 'chars_read,chars_total,course_id,id,kind,left_out_unit_ids,state,title,units,units_read,units_total' then
      raise exception 'FAIL 6: the keys are %', (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k);
    end if;
    if v_out->>'state' <> 'read' or (v_out->>'units_total')::int <> 3 or (v_out->>'units_read')::int <> 3
       or v_out->>'chars_read' <> v_out->>'chars_total' or jsonb_array_length(v_out->'left_out_unit_ids') <> 0
       or v_out->>'title' <> 'w76 192 file one.pdf' or v_out->>'course_id' <> v_c1
       or (v_out->'units'->0->>'unit_id')::bigint <> v_ids[1] or v_out->'units'->0->>'unit_kind' <> 'slide'
       or (v_out->'units'->2->>'unit_no')::int <> 3 then
      raise exception 'FAIL 6: the whole-file read returned %', v_out;
    end if;
    -- a cut between units: the third unit would pass 150
    v_out := workspace_attachment_read('file', v_f1, 150);
    if v_out->>'state' <> 'cut' or (v_out->>'units_read')::int <> 2
       or v_out->'left_out_unit_ids' <> to_jsonb(array[v_ids[3]]) or (v_out->>'units_total')::int <> 3
       or (v_out->>'chars_read')::int <> (select sum(char_length(t.text)) from bb_file_text t where t.file_id = v_f1 and t.unit_no < 3)
       or jsonb_array_length(v_out->'units') <> 2 then
      raise exception 'FAIL 6: a cut between units returned %', v_out;
    end if;
    -- the first unit alone is longer than the limit: it is cut to the limit
    v_out := workspace_attachment_read('file', v_f1, 20);
    if v_out->>'state' <> 'cut' or (v_out->>'units_read')::int <> 1 or (v_out->>'chars_read')::int <> 20
       or char_length(v_out->'units'->0->>'text') <> 20
       or v_out->'left_out_unit_ids' <> to_jsonb(array[v_ids[2], v_ids[3]]) then
      raise exception 'FAIL 6: a first unit cut to the limit returned %', v_out;
    end if;
    -- the cap of 40 ids, in order
    insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
    select c.bb_course_id, c.id, 'readings', 'w76 192 many units.pdf',
           'https://example.invalid/_w76_192_f3', 'rule', now() from courses c where c.id = v_c1;
    select f.id into v_f3 from bb_files f where f.source_url = 'https://example.invalid/_w76_192_f3';
    if pg_temp.w76_try('authenticated', v_owner::text, format(
         'insert into bb_file_text (file_id, unit_kind, unit_no, text) select %s, ''page'', g, repeat(''p'', 100) from generate_series(1, 45) g', v_f3)) <> 'ok:45' then
      raise exception 'FAIL phase24_192 (setup): the many units were not written';
    end if;
    v_out := workspace_attachment_read('file', v_f3, 100);
    select array_agg(t.id order by t.unit_no) into v_ids from bb_file_text t where t.file_id = v_f3;
    if v_out->>'state' <> 'cut' or (v_out->>'units_read')::int <> 1 or (v_out->>'units_total')::int <> 45
       or jsonb_array_length(v_out->'left_out_unit_ids') <> 40
       or (v_out->'left_out_unit_ids'->>0)::bigint <> v_ids[2] or (v_out->'left_out_unit_ids'->>39)::bigint <> v_ids[41] then
      raise exception 'FAIL 6: the 40-id cap returned %', v_out;
    end if;
    -- a file with no unit
    insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
    select c.bb_course_id, c.id, 'readings', 'w76 192 empty.pdf',
           'https://example.invalid/_w76_192_f4', 'rule', now() from courses c where c.id = v_c1;
    select f.id into v_f4 from bb_files f where f.source_url = 'https://example.invalid/_w76_192_f4';
    v_out := workspace_attachment_read('file', v_f4, 1000);
    if v_out->>'state' <> 'no_text' or (v_out->>'units_total')::int <> 0 or v_out->'units' <> '[]'::jsonb
       or v_out->'left_out_unit_ids' <> '[]'::jsonb or v_out->>'title' <> 'w76 192 empty.pdf' then
      raise exception 'FAIL 6: a file with no unit returned %', v_out;
    end if;
    -- a file that is not there
    v_out := workspace_attachment_read('file', 0, 1000);
    if v_out->>'state' <> 'missing' or v_out->'title' <> 'null'::jsonb or v_out->'course_id' <> 'null'::jsonb
       or (v_out->>'units_total')::int <> 0 or (v_out->>'chars_total')::int <> 0
       or (select count(*) from jsonb_object_keys(v_out)) <> 11 then
      raise exception 'FAIL 6: a missing file returned %', v_out;
    end if;
    -- uploads: indexed (read), failed, stored and reading (not_ready), deleting and absent (missing)
    v_out := workspace_attachment_read('upload', v_d1, 1000);
    if v_out->>'state' <> 'read' or v_out->>'title' <> 'w76 u1 untagged' or (v_out->>'units_read')::int <> 1
       or (v_out->'units'->0->>'unit_id')::bigint <> v_u1 then
      raise exception 'FAIL 6: an indexed upload returned %', v_out;
    end if;
    v_out := workspace_attachment_read('upload', v_d3, 1000);      -- text_ready is read too
    if v_out->>'state' <> 'read' then
      raise exception 'FAIL 6: an upload in text_ready returned %', v_out;
    end if;
    v_out := workspace_attachment_read('upload', v_d4, 1000);
    if v_out->>'state' <> 'failed' or v_out->>'title' <> 'w76 u4 failed' or (v_out->>'units_total')::int <> 0 then
      raise exception 'FAIL 6: a failed upload returned %', v_out;
    end if;
    update workspace_documents set state = 'stored' where id = v_d6;
    update workspace_documents set state = 'reading' where id = v_d7;
    if workspace_attachment_read('upload', v_d6, 1000)->>'state' <> 'not_ready'
       or workspace_attachment_read('upload', v_d7, 1000)->>'state' <> 'not_ready' then
      raise exception 'FAIL 6: an upload in stored or reading is not not_ready';
    end if;
    v_out := workspace_attachment_read('upload', v_d5, 1000);
    if v_out->>'state' <> 'missing' or v_out->'title' <> 'null'::jsonb then
      raise exception 'FAIL 6: an upload in deleting returned %', v_out;
    end if;
    if workspace_attachment_read('upload', 0, 1000)->>'state' <> 'missing' then
      raise exception 'FAIL 6: an absent upload is not missing';
    end if;
    -- a remembered item is not an upload
    if workspace_attachment_read('upload', v_x1, 1000)->>'state' <> 'missing' then
      raise exception 'FAIL 6: a memory document read as an upload is not missing';
    end if;
    -- refusals
    if pg_temp.w76_try(null, '', 'select public.workspace_attachment_read(''image'', 1, 100)') <> '22023'
       or pg_temp.w76_try(null, '', format('select public.workspace_attachment_read(''file'', %s, 0)', v_f1)) <> '22023' then
      raise exception 'FAIL 6: a bad kind or a limit of 0 did not end in 22023';
    end if;
  end;
end $$;

select 'phase24_192_search: PASS' as result;

rollback;
