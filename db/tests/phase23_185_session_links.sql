-- bb2dash :: db/tests/phase23_185_session_links.sql
-- Phase 23 (Inbox auto-apply), the first live run's gap (STATUS "Phase 23", 2026-10-07). Tests
-- migration 185, acting as the role:
--
--   0. installed and shaped: the two reads and their policies, the columns of bb_files that are
--      withheld, no write on either table, the two function bodies
--   1. the role reads bb_files (its columns only) and sessions, and is refused the rest
--   2. inbox_apply_prepare: a session answer carries its file's link; any other row carries none
--
-- 185 also re-created inbox_apply_close; 186 replaced that body, and phase23_186_notices.sql tests it.
--
-- Every call is made under `set local role inbox_apply_runner` (181 grants db_test_runner the
-- role with inherit false). RUN IT: `node scripts/db-test.mjs --only phase23_185_session_links.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t185 (label text primary key, id bigint, txt text) on commit drop;
grant all on _t185 to inbox_apply_runner;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  c      text;
  f      text;
  r      record;
  v_read text[] := array['id', 'course_id', 'path', 'file_name', 'mime_type', 'bytes', 'captured_at',
                         'bucket', 'week_no', 'session_id', 'assignment_id', 'reading_id',
                         'classified_by', 'classification_confidence', 'storage_path', 'downloaded_at',
                         'bb_modified_at', 'text_status', 'notes', 'superseded_by', 'link_confidence'];
  v_held text[] := array['run_id', 'bb_course_id', 'content_id', 'source_url', 'sha256', 'local_path',
                         'attempt_id'];
begin
  if position('session_link' in (select prosrc from pg_proc
                                  where oid = 'public.inbox_apply_prepare(bigint)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_185: migration 185 is not applied (inbox_apply_prepare sends no session_link)';
  end if;

  foreach c in array v_read loop
    if not has_column_privilege('inbox_apply_runner', 'public.bb_files', c, 'select') then
      v_fail := v_fail || format('bb_files.%s is not readable', c);
    end if;
  end loop;
  foreach c in array v_held loop
    if has_column_privilege('inbox_apply_runner', 'public.bb_files', c, 'select') then
      v_fail := v_fail || format('bb_files.%s is readable', c);
    end if;
  end loop;
  -- Every column of bb_files is in one list or the other: a column added later is a decision.
  select string_agg(a.attname, ',' order by a.attname) into c
    from pg_attribute a
   where a.attrelid = 'public.bb_files'::regclass and a.attnum > 0 and not a.attisdropped
     and not (a.attname = any (v_read || v_held));
  if c is not null then
    v_fail := v_fail || format('bb_files has columns this unit does not place: %s', c);
  end if;

  if not has_table_privilege('inbox_apply_runner', 'public.sessions', 'select') then
    v_fail := v_fail || 'sessions is not readable'::text;
  end if;
  foreach f in array array['insert', 'update', 'delete', 'truncate'] loop
    if has_table_privilege('inbox_apply_runner', 'public.bb_files', f)
       or has_table_privilege('inbox_apply_runner', 'public.sessions', f) then
      v_fail := v_fail || format('the role may %s bb_files or sessions', f);
    end if;
  end loop;
  if has_any_column_privilege('inbox_apply_runner', 'public.bb_files', 'insert, update')
     or has_any_column_privilege('inbox_apply_runner', 'public.sessions', 'insert, update') then
    v_fail := v_fail || 'the role may write a column of bb_files or sessions'::text;
  end if;

  foreach f in array array['bb_files', 'sessions'] loop
    if not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = f
                      and p.policyname = f || '_inbox_apply_read' and p.cmd = 'SELECT'
                      and p.roles = '{inbox_apply_runner}') then
      v_fail := v_fail || format('%s has no read policy for the role alone', f);
    end if;
    if exists (select 1 from pg_policies p
                where p.schemaname = 'public' and p.tablename = f
                  and 'inbox_apply_runner' = any (p.roles) and p.cmd <> 'SELECT') then
      v_fail := v_fail || format('%s has a write policy for the role', f);
    end if;
  end loop;

  foreach f in array array['public.inbox_apply_prepare(bigint)', 'public.inbox_apply_close(bigint, text, jsonb)'] loop
    select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg
      into r from pg_proc p where p.oid = f::regprocedure;
    if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s lost SECURITY DEFINER, its owner or its search_path', f);
    end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute')
       or not has_function_privilege('inbox_apply_runner', f, 'execute') then
      v_fail := v_fail || format('%s is not executable by inbox_apply_runner alone', f);
    end if;
  end loop;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase23_185 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- 1. The role's two reads, and what it is still refused
-- =============================================================================================
do $$
declare
  v_case   record;
  v_raised boolean;
  v_state  text;
  v_files  bigint;
  v_sess   bigint;
begin
  set local role inbox_apply_runner;
  select count(*) into v_files from (select id, session_id, storage_path, superseded_by from bb_files limit 5) x;
  select count(*) into v_sess from (select id, course_id, session_date, week_no, kind from sessions limit 5) x;
  reset role;
  if v_files = 0 or v_sess = 0 then
    raise exception 'FAIL 1: the role read % bb_files rows and % sessions rows; its policies let none through', v_files, v_sess;
  end if;

  for v_case in
    select * from (values
      ('read a file''s Blackboard link', 'select source_url from bb_files limit 1'),
      ('read a file''s path on the host', 'select local_path from bb_files limit 1'),
      ('read every column of bb_files',  'select * from bb_files limit 1'),
      ('link a file to a session',       'update bb_files set session_id = session_id where false'),
      ('delete a file',                  'delete from bb_files where false'),
      ('change a session',               'update sessions set topic = topic where false'),
      ('delete a session',               'delete from sessions where false')
    ) t(label, stmt)
  loop
    v_raised := false;
    begin
      set local role inbox_apply_runner;
      execute v_case.stmt;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '42501';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 1: the role was not refused (42501) when it tried to %', v_case.label;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- Setup (not an assertion): no real open inbox_feedback request, no real answered row and no real
-- open failure item is in the way. Changed inside this transaction only.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_185 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed')
    or (state = 'open' and ref in ('inbox-apply-failed', 'apply-login-required'));

do $$
declare
  v_linked bigint; v_session bigint; v_unlinked bigint; v_old bigint;
  v_missing constant bigint := 999999999999;
  v_id bigint;
begin
  select f.id, f.session_id into v_linked, v_session from bb_files f
   where f.session_id is not null and f.superseded_by is null order by f.id limit 1;
  select f.id into v_unlinked from bb_files f
   where f.session_id is null and f.superseded_by is null order by f.id limit 1;
  select f.id into v_old from bb_files f where f.superseded_by is not null order by f.id limit 1;
  if v_linked is null or v_unlinked is null or v_old is null then
    raise exception 'FAIL phase23_185 (setup): bb_files holds no linked, unlinked or superseded file to test with';
  end if;
  if exists (select 1 from bb_files where id = v_missing) then
    raise exception 'FAIL phase23_185 (setup): file % exists', v_missing;
  end if;
  insert into _t185 values ('linked', v_linked, null), ('session', v_session, null),
                           ('unlinked', v_unlinked, null), ('old', v_old, null), ('missing', v_missing, null);

  -- A pick the fold applied; "none"; a pick on a superseded file; a pick on no file; a pick that is
  -- not a number; and a row that is no session answer at all.
  insert into attention_items (kind, entity, ref, field, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'bb_file', 'session_link/' || v_linked, 'session_id', '185 linked', 'resolved', now(),
          jsonb_build_object('session_id', v_session))
  returning id into v_id;
  insert into _t185 values ('i_linked', v_id, null);
  insert into attention_items (kind, entity, ref, field, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'bb_file', 'session_link/' || v_unlinked, 'session_id', '185 none', 'resolved',
          now() + interval '1 second', '{"accept": "none"}')
  returning id into v_id;
  insert into _t185 values ('i_none', v_id, null);
  insert into attention_items (kind, entity, ref, field, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'bb_file', 'session_link/' || v_old, 'session_id', '185 old', 'resolved',
          now() + interval '2 seconds', jsonb_build_object('session_id', v_session))
  returning id into v_id;
  insert into _t185 values ('i_old', v_id, null);
  insert into attention_items (kind, entity, ref, field, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'bb_file', 'session_link/' || v_missing, 'session_id', '185 missing', 'resolved',
          now() + interval '3 seconds', '{"session_id": "abc"}')
  returning id into v_id;
  insert into _t185 values ('i_missing', v_id, null);
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test185:plain', '185 plain', 'resolved',
          now() + interval '4 seconds', '{"value":"yes","value_type":"text"}')
  returning id into v_id;
  insert into _t185 values ('i_plain', v_id, null);
  -- A ref that only looks like a session answer: another entity.
  insert into attention_items (kind, entity, ref, field, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'session_link/' || v_linked, 'session_id', '185 other entity', 'resolved',
          now() + interval '5 seconds', jsonb_build_object('session_id', v_session))
  returning id into v_id;
  insert into _t185 values ('i_other', v_id, null);

  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('inbox_feedback', 'all', 'claimed', now(), 'inbox-apply-runner', 1, 'phase23_185 R1')
  returning id into v_id;
  insert into _t185 values ('r1', v_id, null);
end $$;

-- =============================================================================================
-- 2. inbox_apply_prepare sends each session answer its file's link
-- =============================================================================================
do $$
declare
  v_r1 bigint := (select id from _t185 where label = 'r1');
  v_prepared jsonb;
  v_got jsonb;
  v_want jsonb;
  v_case record;
begin
  set local role inbox_apply_runner;
  v_prepared := inbox_apply_prepare(v_r1);
  reset role;

  if jsonb_array_length(v_prepared->'queue') <> 6 then
    raise exception 'FAIL 2: the queue holds % rows, expected the 6 of this unit', jsonb_array_length(v_prepared->'queue');
  end if;

  for v_case in
    select t.item, t.want from (values
      ('i_linked',  jsonb_build_object('file_id', (select id from _t185 where label = 'linked'),
                                       'pick', (select id from _t185 where label = 'session'),
                                       'file_found', true, 'file_current', true,
                                       'file_session_id', (select id from _t185 where label = 'session'))),
      ('i_none',    jsonb_build_object('file_id', (select id from _t185 where label = 'unlinked'),
                                       'pick', null, 'file_found', true, 'file_current', true,
                                       'file_session_id', null)),
      ('i_missing', jsonb_build_object('file_id', (select id from _t185 where label = 'missing'),
                                       'pick', null, 'file_found', false, 'file_current', false,
                                       'file_session_id', null)),
      ('i_plain',   'null'::jsonb),
      ('i_other',   'null'::jsonb)
    ) t(item, want)
  loop
    select q->'session_link' into v_got
      from jsonb_array_elements(v_prepared->'queue') q
     where (q->>'id')::bigint = (select id from _t185 where label = v_case.item);
    if v_got is distinct from v_case.want then
      raise exception 'FAIL 2: % carries session_link %, expected %', v_case.item, v_got, v_case.want;
    end if;
  end loop;

  -- The superseded file: found, not current, and the pick still read.
  select q->'session_link' into v_got
    from jsonb_array_elements(v_prepared->'queue') q
   where (q->>'id')::bigint = (select id from _t185 where label = 'i_old');
  v_want := jsonb_build_object('file_id', (select id from _t185 where label = 'old'),
                               'pick', (select id from _t185 where label = 'session'),
                               'file_found', true, 'file_current', false);
  if not (v_got @> v_want) then
    raise exception 'FAIL 2: the superseded file carries session_link %, expected it to hold %', v_got, v_want;
  end if;

  -- Everything 181's prepare sent is still there.
  if not (v_prepared ? 'params' and v_prepared ? 'runs_today')
     or exists (select 1 from jsonb_array_elements(v_prepared->'queue') q
                 where not (q ?& array['id', 'kind', 'course_id', 'entity', 'ref', 'field', 'question', 'state',
                                       'accept', 'has_note', 'was_applied', 'applied_at', 'resolved_at',
                                       'session_link'])) then
    raise exception 'FAIL 2: inbox_apply_prepare lost a key 181 sent: %', v_prepared;
  end if;

  -- Not the worker's claim: still refused.
  begin
    set local role inbox_apply_runner;
    perform inbox_apply_prepare(-1);
    reset role;
    raise exception 'FAIL 2: inbox_apply_prepare answered for a request that is not the worker''s claim';
  exception when sqlstate '22023' then
    reset role;
  end;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_185_session_links: PASS' as result, current_user as ran_as;

rollback;
