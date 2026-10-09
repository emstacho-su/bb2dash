-- bb2dash :: db/tests/phase24_194_ask_options.sql
-- Phase 24a (docs/planning/sprint-2/briefs/109_PHASE24_workspace_assistant.md), task 17 and check
-- 12 / 19. Worker W-76.
-- Tests migration 194: `workspace_routines` (six rows), `workspace_request_options`,
-- `workspace_request_attachments` and the SECURITY DEFINER function `workspace_ask_with`.
--
--   0. installed and shaped: the three tables, their rights, every policy naming app_owner(), the
--      function's execute list, and the six routines (their text pinned by md5 against the frozen
--      fixture, workspace/test/fixtures/contract24/seed/routines.json)
--   1. the owner asks with options: stored whole, five attachments numbered files first, null means
--      absent, a course display id is expanded to its shells
--   2. what it refuses, each storing nothing: a sixth attachment, an unknown routine, a routine whose
--      needs are not met, a bad value, an unknown file, upload or course, an upload in deleting
--   3. another signed-in uid, no uid, anon: 42501 and nothing stored
--   4. a direct write of the options or attachments: 42501 for the owner's own session too
--   5. workspace_ask(uuid, text) still returns its three ids and is still invoker
--
-- Every call is made the way the browser makes it (`request.jwt.claim.sub`, `set local role
-- authenticated`); setup rows are written as the session role. Synthetic data; nothing is committed.
-- RUN IT: `node scripts/db-test.mjs --only phase24_194_ask_options.sql`.
-- (phase21_140_workspace_tables.sql is run unedited beside it: the task's other half.)

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
  t      text;
  r      record;
  v_tabs text[] := array['workspace_routines', 'workspace_request_options', 'workspace_request_attachments'];
begin
  foreach t in array v_tabs loop
    if to_regclass('public.' || t) is null then
      raise exception 'FAIL phase24_194: migration 194 is not applied (public.% is missing)', t;
    end if;
  end loop;
  if to_regprocedure('public.workspace_ask_with(uuid, text, jsonb)') is null then
    raise exception 'FAIL phase24_194: migration 194 is not applied (workspace_ask_with is missing)';
  end if;

  select string_agg(c.relname, ', ' order by c.relname collate "C") into v_got
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname = any (v_tabs) and not c.relrowsecurity;
  if v_got is not null then v_fail := v_fail || format('row security is off on %s', v_got); end if;

  foreach t in array v_tabs loop
    if has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('anon', 'public.' || t, 'select, insert, update, references') then
      v_fail := v_fail || format('anon holds a privilege on %s', t);
    end if;
    if not has_table_privilege('authenticated', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete, truncate, references, trigger')
       or has_any_column_privilege('authenticated', 'public.' || t, 'insert, update, references') then
      v_fail := v_fail || format('authenticated does not hold select alone on %s', t);
    end if;
    if has_table_privilege('workspace_runner', 'public.' || t, 'select, insert, update, delete')
       or has_any_column_privilege('workspace_runner', 'public.' || t, 'select, insert, update') then
      v_fail := v_fail || format('workspace_runner holds a privilege on %s', t);
    end if;
  end loop;

  -- Every policy on the three: the owner's, in the initplan form, and select only.
  select string_agg(p.tablename || '.' || p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, '+'),
                    ', ' order by p.tablename collate "C", p.policyname collate "C") into v_got
    from pg_policies p where p.schemaname = 'public' and p.tablename = any (v_tabs);
  if v_got is distinct from
     'workspace_request_attachments.workspace_request_attachments_owner_select:SELECT:authenticated, '
     'workspace_request_options.workspace_request_options_owner_select:SELECT:authenticated, '
     'workspace_routines.workspace_routines_owner_select:SELECT:authenticated' then
    v_fail := v_fail || format('the policies are [%s]', v_got);
  end if;
  select string_agg(p.policyname, ', ' order by p.policyname collate "C") into v_got
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = any (v_tabs)
     and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') not like '%app_owner()%';
  if v_got is not null then v_fail := v_fail || format('these policies do not name app_owner(): %s', v_got); end if;

  -- The function: definer, pinned, commented, authenticated alone.
  select p.prosecdef, l.lanname, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg,
         obj_description(p.oid, 'pg_proc') as note
    into r from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.workspace_ask_with(uuid, text, jsonb)'::regprocedure;
  if not r.prosecdef then v_fail := v_fail || 'workspace_ask_with is not security definer'::text; end if;
  if r.lanname <> 'plpgsql' then v_fail := v_fail || 'workspace_ask_with is not plpgsql'::text; end if;
  if not r.cfg @> array['search_path=public, pg_temp'] then
    v_fail := v_fail || 'workspace_ask_with does not pin search_path = public, pg_temp'::text;
  end if;
  if r.note is null then v_fail := v_fail || 'workspace_ask_with has no comment'::text; end if;
  if pg_get_function_identity_arguments('public.workspace_ask_with(uuid, text, jsonb)'::regprocedure)
     is distinct from 'p_conversation_id uuid, p_text text, p_options jsonb' then
    v_fail := v_fail || 'workspace_ask_with takes other arguments than the fixture folder freezes'::text;
  end if;
  select string_agg(w.who, ', ' order by w.who collate "C") into v_got
    from (values ('public'), ('anon'), ('service_role'), ('db_test_runner'), ('workspace_runner'),
                 ('sync_runner')) as w(who)
   where has_function_privilege(w.who::name, 'public.workspace_ask_with(uuid, text, jsonb)', 'execute');
  if v_got is not null then v_fail := v_fail || format('workspace_ask_with is executable by %s', v_got); end if;
  if not has_function_privilege('authenticated', 'public.workspace_ask_with(uuid, text, jsonb)', 'execute') then
    v_fail := v_fail || 'authenticated cannot execute workspace_ask_with'::text;
  end if;
  if (select p.prosecdef from pg_proc p where p.oid = 'public.workspace_ask(uuid, text)'::regprocedure) then
    v_fail := v_fail || 'workspace_ask(uuid, text) is no longer security invoker'::text;
  end if;

  -- The six routines: the order, the groups, what each needs, and the text, pinned by md5 against
  -- the frozen fixture (seed/routines.json), whose wording is the PM's.
  select string_agg(r2.id || '|' || r2.grp || '|' || r2.title || '|' || r2.needs || '|' || r2.sort
                    || '|' || r2.enabled || '|' || md5(r2.instructions), E'\n' order by r2.sort) into v_got
    from workspace_routines r2;
  if v_got is distinct from array_to_string(array[
       'quiz|study|Quiz me|course_or_file|10|true|51df46fe8a67ff9216ac387a23d8e61c',
       'study-guide|study|Study guide|course_or_file|20|true|2a1238b3221872eb5f4294911e6f237f',
       'explain-file|study|Explain this file|file|30|true|c1d9357d3484d62065b26ce24f581d9b',
       'summarise-reading|study|Summarise a reading|file|40|true|85dbb29babb0ac018c4abf400ff3643d',
       'plan-week|plan|Plan my week|nothing|50|true|79bfd4bf4fbb65d1db8bb4d1c7830a16',
       'draft-help|write|Drafting help|nothing|60|true|50f30a6ebfc507840c3c6cbcecea8b75'], chr(10)) then
    v_fail := v_fail || format('the routines read [%s]', v_got);
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase24_194 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1 to 5. Behaviour
-- =============================================================================================
do $$
declare
  c_host constant text := 'https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/';
  v_owner uuid := app_owner();
  v_other uuid := gen_random_uuid();
  v_disp  text; v_shells text[]; v_c1 text;
  v_f1 bigint; v_f2 bigint;
  v_d1 bigint; v_d2 bigint; v_d3 bigint; v_d4 bigint; v_mem bigint;
  v_conv uuid;
  v_sha   text;
  v_out   jsonb;
  v_req   bigint;
  v_got   text;
  v_n     integer;
  v_row   record;
  v_case  record;
begin
  if v_owner is null then
    raise exception 'FAIL phase24_194: app_owner() returned null, so the owner cannot be simulated';
  end if;
  select d.display_id, d.shell_ids into v_disp, v_shells from v_course_display d order by d.display_id limit 1;
  if v_disp is null then
    raise exception 'FAIL phase24_194 (setup): the unit needs a course in v_course_display';
  end if;
  select c.id into v_c1 from courses c order by c.id limit 1;

  -- Setup (not an assertion): two course files, three uploads (indexed x2, stored) and one being deleted.
  insert into bb_files (bb_course_id, course_id, bucket, file_name, source_url, classified_by, captured_at)
  select c.bb_course_id, c.id, 'readings', 'w76 194 file ' || g, 'https://example.invalid/_w76_194_f' || g, 'rule', now()
    from courses c, generate_series(1, 2) g where c.id = v_c1;
  select f.id into v_f1 from bb_files f where f.source_url = 'https://example.invalid/_w76_194_f1';
  select f.id into v_f2 from bb_files f where f.source_url = 'https://example.invalid/_w76_194_f2';
  for v_n in 1..4 loop
    v_sha := md5('w76-194-' || v_n) || md5('w76-194b-' || v_n);
    insert into workspace_documents (kind, title, mime, byte_size, sha256, storage_key, state)
    values ('upload', 'w76 194 upload ' || v_n, 'text/plain', 10, v_sha, 'u/' || v_sha,
            case v_n when 4 then 'deleting' when 3 then 'stored' else 'indexed' end);
  end loop;
  select d.id into v_d1 from workspace_documents d where d.title = 'w76 194 upload 1';
  select d.id into v_d2 from workspace_documents d where d.title = 'w76 194 upload 2';
  select d.id into v_d3 from workspace_documents d where d.title = 'w76 194 upload 3';
  select d.id into v_d4 from workspace_documents d where d.title = 'w76 194 upload 4';
  insert into workspace_conversations (title) values ('w76 194 memory conversation') returning id into v_conv;
  insert into workspace_documents (kind, title, conversation_id, state) values ('memory', 'w76 194 memory', v_conv, 'indexed')
  returning id into v_mem;

  -- ---------------------------------------------------------------------------------------------
  -- 1a. Options and five attachments are stored, numbered files first.
  -- ---------------------------------------------------------------------------------------------
  v_out := pg_temp.w76_call('authenticated', v_owner::text, format(
    'public.workspace_ask_with(null, %L, jsonb_build_object(''course'', %L, ''depth'', ''deep'', ''routine'', ''study-guide'', ''format'', ''rich'', ''files'', jsonb_build_array(%s, %s), ''uploads'', jsonb_build_array(%s, %s, %s)))',
    'w76-194 question one', v_disp, v_f1, v_f2, v_d1, v_d2, v_d3));
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,message_id,request_id' then
    raise exception 'FAIL 1a: workspace_ask_with returned %', v_out;
  end if;
  v_req := (v_out->>'request_id')::bigint;
  select o.course_display_id, o.course_ids, o.depth, o.routine_id, o.format into v_row
    from workspace_request_options o where o.request_id = v_req;
  if not found or v_row.course_display_id <> v_disp or v_row.course_ids is distinct from v_shells
     or v_row.depth <> 'deep' or v_row.routine_id <> 'study-guide' or v_row.format <> 'rich' then
    raise exception 'FAIL 1a: the options read %', row_to_json(v_row);
  end if;
  select string_agg(a.ord || ':' || a.kind || ':' || coalesce(a.file_id::text, '-') || ':' || coalesce(a.document_id::text, '-'),
                    ',' order by a.ord) into v_got
    from workspace_request_attachments a where a.request_id = v_req;
  if v_got is distinct from
     '1:file:' || v_f1 || ':-,2:file:' || v_f2 || ':-,3:upload:-:' || v_d1 || ',4:upload:-:' || v_d2 || ',5:upload:-:' || v_d3 then
    raise exception 'FAIL 1a: the attachments read [%]', v_got;
  end if;
  -- The three rows of workspace_ask: a conversation, a question, a queued request.
  if (select count(*) from workspace_requests r where r.id = v_req and r.state = 'queued'
         and r.conversation_id = (v_out->>'conversation_id')::uuid
         and r.user_message_id = (v_out->>'message_id')::uuid) <> 1
     or (select c.title from workspace_conversations c where c.id = (v_out->>'conversation_id')::uuid) <> 'w76-194 question one' then
    raise exception 'FAIL 1a: the conversation, message and request are not the three workspace_ask makes';
  end if;

  -- 1b. Nothing given: a row of defaults. Null values are absent. Routines with their needs met.
  v_out := pg_temp.w76_call('authenticated', v_owner::text,
    'public.workspace_ask_with(null, ''w76-194 question two'', ''{"course": null, "depth": null, "routine": null, "format": null, "files": null, "uploads": null}''::jsonb)');
  select o.course_display_id, o.course_ids, o.depth, o.routine_id, o.format into v_row
    from workspace_request_options o where o.request_id = (v_out->>'request_id')::bigint;
  if not found or v_row.course_display_id is not null or v_row.course_ids is not null or v_row.depth <> 'auto'
     or v_row.routine_id is not null or v_row.format <> 'plain'
     or exists (select 1 from workspace_request_attachments a where a.request_id = (v_out->>'request_id')::bigint) then
    raise exception 'FAIL 1b: an all-null options object stored %', row_to_json(v_row);
  end if;
  v_out := pg_temp.w76_call('authenticated', v_owner::text, 'public.workspace_ask_with(null, ''w76-194 question three'', null)');
  if not exists (select 1 from workspace_request_options o where o.request_id = (v_out->>'request_id')::bigint and o.depth = 'auto') then
    raise exception 'FAIL 1b: null options stored no row of defaults';
  end if;
  for v_case in
    select * from (values
      ('plan-week', null::text, '{}'::jsonb),
      ('draft-help', null, '{}'::jsonb),
      ('quiz', v_disp, '{}'::jsonb),
      ('study-guide', null, jsonb_build_object('files', jsonb_build_array(v_f1))),
      ('explain-file', null, jsonb_build_object('uploads', jsonb_build_array(v_d1))),
      ('summarise-reading', null, jsonb_build_object('files', jsonb_build_array(v_f1)))
    ) as x(routine, course, extra)
  loop
    v_got := pg_temp.w76_try('authenticated', v_owner::text, format(
      'select public.workspace_ask_with(null, %L, %L::jsonb || jsonb_build_object(''routine'', %L) || case when %L is null then ''{}''::jsonb else jsonb_build_object(''course'', %L) end)',
      'w76-194 routine ' || v_case.routine, v_case.extra::text, v_case.routine, v_case.course, v_case.course));
    if v_got <> 'ok:1' then
      raise exception 'FAIL 1b: routine % with its needs met ended with [%]', v_case.routine, v_got;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------------------------
  -- 2. Refusals, and each one stores nothing (no conversation of that title is left).
  -- ---------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('a sixth attachment', '23514', format('{"files": [%s, %s, %s], "uploads": [%s, %s, %s]}', v_f1, v_f2, v_f1, v_d1, v_d2, v_d1)),
      ('an unknown routine', '23503', '{"routine": "no-such-routine"}'),
      ('explain-file with no file', '23514', '{"routine": "explain-file"}'),
      ('summarise-reading with only a course', '23514', jsonb_build_object('routine', 'summarise-reading', 'course', v_disp)::text),
      ('quiz with no course and no file', '23514', '{"routine": "quiz"}'),
      ('study-guide with no course and no file', '23514', '{"routine": "study-guide"}'),
      ('a depth off the four', '23514', '{"depth": "extreme"}'),
      ('a format off the two', '23514', '{"format": "html"}'),
      ('a key that is not one of the six', '23514', '{"model": "opus"}'),
      ('an unknown course display id', '23514', '{"course": "NO.SUCH.COURSE"}'),
      ('an unknown file id', '23503', '{"files": [0]}'),
      ('an unknown upload id', '23503', '{"uploads": [0]}'),
      ('a memory document as an upload', '23503', format('{"uploads": [%s]}', v_mem)),
      ('an upload in deleting', '23514', format('{"uploads": [%s]}', v_d4)),
      ('a file id that is not a whole number', '23514', '{"files": ["7"]}'),
      ('a fractional file id', '23514', '{"files": [1.5]}'),
      ('files that is not a list', '23514', '{"files": 7}'),
      ('a depth that is a number', '23514', '{"depth": 3}')
    ) as x(label, want, opts)
  loop
    v_got := pg_temp.w76_try('authenticated', v_owner::text, format(
      'select public.workspace_ask_with(null, %L, %L::jsonb)', 'w76-194 refused ' || v_case.label, v_case.opts));
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 2: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  v_got := pg_temp.w76_try('authenticated', v_owner::text, 'select public.workspace_ask_with(null, ''w76-194 refused array'', ''[]''::jsonb)');
  if v_got <> '23514' then
    raise exception 'FAIL 2: options that are an array ended with [%], expected 23514', v_got;
  end if;
  if (select count(*) from workspace_conversations c where c.title like 'w76-194 refused%') <> 0 then
    raise exception 'FAIL 2: a refused call left a conversation behind';
  end if;
  -- The question's own refusals are workspace_ask's: 22023 for the length, 23505 for a second open request.
  v_got := pg_temp.w76_try('authenticated', v_owner::text, format('select public.workspace_ask_with(null, %L, null)', repeat('x', 8001)));
  if v_got <> '22023' then
    raise exception 'FAIL 2: a question of 8001 characters ended with [%], expected 22023', v_got;
  end if;
  v_got := pg_temp.w76_try('authenticated', v_owner::text, format('select public.workspace_ask_with(null, %L, null)', '   '));
  if v_got <> '22023' then
    raise exception 'FAIL 2: a blank question ended with [%], expected 22023', v_got;
  end if;
  v_out := pg_temp.w76_call('authenticated', v_owner::text, 'public.workspace_ask_with(null, ''w76-194 open conversation'', ''{"depth": "quick"}''::jsonb)');
  v_got := pg_temp.w76_try('authenticated', v_owner::text, format(
    'select public.workspace_ask_with(%L, ''a second question while the first is open'', ''{"depth": "deep"}''::jsonb)', v_out->>'conversation_id'));
  if v_got <> '23505' then
    raise exception 'FAIL 2: a second open request ended with [%], expected 23505', v_got;
  end if;
  if (select count(*) from workspace_messages m where m.conversation_id = (v_out->>'conversation_id')::uuid) <> 1
     or (select count(*) from workspace_request_options o
          join workspace_requests r on r.id = o.request_id
         where r.conversation_id = (v_out->>'conversation_id')::uuid) <> 1 then
    raise exception 'FAIL 2: the refused second question left a message or an options row';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 3. Another signed-in uid, no uid, anon.
  -- ---------------------------------------------------------------------------------------------
  select count(*) into v_n from workspace_request_options;
  for v_case in
    select * from (values
      ('a stranger', 'authenticated', v_other::text, '42501'),
      ('a caller with no uid', 'authenticated', '', '42501'),
      ('anon', 'anon', '', '42501')
    ) as x(label, role, sub, want)
  loop
    v_got := pg_temp.w76_try(v_case.role, v_case.sub,
      'select public.workspace_ask_with(null, ''w76-194 stranger'', ''{"depth": "deep"}''::jsonb)');
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 3: %: got [%], expected %', v_case.label, v_got, v_case.want;
    end if;
  end loop;
  if (select count(*) from workspace_conversations c where c.title = 'w76-194 stranger') <> 0
     or (select count(*) from workspace_request_options) <> v_n then
    raise exception 'FAIL 3: a refused call stored something';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 4. A direct write of the options or the attachments is 42501, for the owner's session too.
  -- ---------------------------------------------------------------------------------------------
  for v_case in
    select * from (values
      ('an insert into workspace_request_options', format('insert into workspace_request_options (request_id, depth) values (%s, ''deep'')', v_req)),
      ('an update of workspace_request_options', 'update workspace_request_options set depth = ''quick'''),
      ('a delete from workspace_request_options', 'delete from workspace_request_options'),
      ('an insert into workspace_request_attachments', format('insert into workspace_request_attachments (request_id, ord, kind, file_id) values (%s, 5, ''file'', %s)', v_req, v_f1)),
      ('an update of workspace_request_attachments', 'update workspace_request_attachments set ord = 5'),
      ('a delete from workspace_request_attachments', 'delete from workspace_request_attachments'),
      ('an update of workspace_routines', 'update workspace_routines set instructions = ''x'''),
      ('an insert into workspace_routines', 'insert into workspace_routines (id, grp, title, description, needs, instructions) values (''evil'', ''g'', ''t'', ''d'', ''nothing'', ''i'')'),
      ('a delete from workspace_routines', 'delete from workspace_routines')
    ) as x(label, stmt)
  loop
    v_got := pg_temp.w76_try('authenticated', v_owner::text, v_case.stmt);
    if v_got <> '42501' then
      raise exception 'FAIL 4: %: got [%], expected 42501', v_case.label, v_got;
    end if;
  end loop;
  -- The owner reads them; a stranger reads none.
  if pg_temp.w76_try('authenticated', v_owner::text, format('select 1 from workspace_request_attachments where request_id = %s', v_req)) <> 'ok:5'
     or pg_temp.w76_try('authenticated', v_other::text, format('select 1 from workspace_request_attachments where request_id = %s', v_req)) <> 'ok:0'
     or pg_temp.w76_try('authenticated', v_owner::text, 'select 1 from workspace_routines') <> 'ok:6'
     or pg_temp.w76_try('authenticated', v_other::text, 'select 1 from workspace_routines') <> 'ok:0'
     or pg_temp.w76_try('anon', '', 'select 1 from workspace_routines') <> '42501' then
    raise exception 'FAIL 4: the owner does not read the five attachments and the six routines, or a stranger or anon does';
  end if;
  -- A deleted upload leaves its slot, with the document gone.
  delete from workspace_documents where id = v_d2;
  if (select a.document_id from workspace_request_attachments a where a.request_id = v_req and a.ord = 4) is not null
     or (select count(*) from workspace_request_attachments a where a.request_id = v_req) <> 5 then
    raise exception 'FAIL 4: deleting an upload did not leave its attachment slot with a null document';
  end if;

  -- ---------------------------------------------------------------------------------------------
  -- 5. workspace_ask(uuid, text) is as it was.
  -- ---------------------------------------------------------------------------------------------
  v_out := pg_temp.w76_call('authenticated', v_owner::text, 'public.workspace_ask(null, ''w76-194 plain ask'')');
  if (select string_agg(k, ',' order by k collate "C") from jsonb_object_keys(v_out) k)
     is distinct from 'conversation_id,message_id,request_id'
     or exists (select 1 from workspace_request_options o where o.request_id = (v_out->>'request_id')::bigint) then
    raise exception 'FAIL 5: workspace_ask returned % or stored an options row', v_out;
  end if;
end $$;

select 'phase24_194_ask_options: PASS' as result;

rollback;
