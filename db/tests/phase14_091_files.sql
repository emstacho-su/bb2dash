-- bb2dash :: db/tests/phase14_091_files.sql
-- Phase 14 (brief 100), tasks 6, 11 and 13; split out of phase14_091_sync_runner.sql by R2 item 11.
-- Worker W-55. The file pair and the privileges.
--
--   1. setup
--   10. sync_file_worklist and sync_file_stored
--   11. privileges
--
-- Runs behind its loader, `db/tests/phase14_load_crawl_v4.sql`, which opens the transaction and lands
-- the scrubbed recorded crawl under the fixture run id 00000000-1491-4000-8000-000000000001. Every
-- function call is made under `set local role sync_runner` (094); the setup and the reads that check
-- a call's effect run as the session role. Fixture run ids are `00000000-1491-4000-8000-…`.
--
-- RUN IT: `node scripts/db-test.mjs --only phase14_091_files.sql`. A failing assertion raises; a pass ends
-- with one row reading `phase14_091_files: PASS`. NOTHING IS COMMITTED: the loader opens the
-- transaction and this file's last statement is `rollback`.


create temp table _t14 (label text primary key, id bigint, run_id uuid) on commit drop;

-- =============================================================================================
-- 1. Setup (not an assertion)
-- =============================================================================================
-- An open real sync would be the one `sync_next()` and `sync_enqueue` return; a real `done` sync
-- on today's New York date, or on the dates section 9 names, would make the login trigger queue
-- nothing. Both are changed inside this transaction only; the rollback restores them.
update agent_requests set state = 'cancelled'
 where kind = 'sync' and state in ('queued', 'claimed');

update agent_requests set state = 'failed'
 where kind = 'sync' and state = 'done'
   and ((finished_at at time zone 'America/New_York')::date
          = (now() at time zone 'America/New_York')::date
        or (finished_at >= '2026-10-30 00:00Z' and finished_at < '2026-11-04 00:00Z'));

-- =============================================================================================
-- 10. The file pair
-- =============================================================================================
do $$
declare
  v_course text := (select id from courses order by id limit 1);
  v_f      bigint;
  v_sub    bigint;
  v_rel    text;
  v_srel   text;
  v_ok     boolean;
  v_row    record;
  v_listed record;
  v_raised boolean;
  v_case   record;
  v_sha    text := repeat('ab', 32);
begin
  insert into bb_files (bb_course_id, course_id, file_name, source_url, captured_at, bucket,
                        text_status, mime_type, notes)
  values ('_w55fx_1', v_course, 'w55 #fixture.pdf',
          'https://blackboard.syracuse.edu/bbcswebdav/xid-w55fx_1', now(), 'lecture_slides',
          'pending', 'application/pdf', 'phase14_091 fixture')
  returning id into v_f;
  insert into bb_files (bb_course_id, course_id, file_name, source_url, captured_at, bucket,
                        text_status, mime_type, attempt_id, notes)
  values ('_w55fx_1', v_course, 'w55-submission.docx',
          'https://blackboard.syracuse.edu/bbcswebdav/xid-w55fx_2', now(), 'my_submissions',
          'pending', 'application/msword', '_w55fx_attempt_9_1', 'phase14_091 fixture')
  returning id into v_sub;
  v_rel  := bb_file_relpath(v_f);
  v_srel := bb_file_relpath(v_sub);

  set local role sync_runner;
  select w.* into v_listed from sync_file_worklist() w where w.id = v_f;
  reset role;
  if v_listed.id is null or v_listed.relpath <> v_rel or v_listed.file_name <> 'w55 #fixture.pdf'
     or v_listed.bucket <> 'lecture_slides' or v_listed.mime <> 'application/pdf'
     or v_listed.source_url <> 'https://blackboard.syracuse.edu/bbcswebdav/xid-w55fx_1' then
    raise exception 'FAIL 10: the worklist row reads %', row_to_json(v_listed);
  end if;

  -- Refused: a relpath that is not the row's, a key that is not the relpath's, a bad sha256, a
  -- text status outside the enum. Each raises; none writes.
  for v_case in
    select * from (values
      ('relpath not the row''s', 'x/' || v_rel, replace('x/' || v_rel, '#', '_'), v_sha, 'extracted'),
      ('key not the relpath''s', v_rel, 'elsewhere/file.pdf', v_sha, 'extracted'),
      ('sha256 not hex',         v_rel, replace(v_rel, '#', '_'), 'nothex', 'extracted'),
      ('text status unknown',    v_rel, replace(v_rel, '#', '_'), v_sha, 'done')
    ) t(label, rel, k, sha, ts)
  loop
    v_raised := false;
    begin
      set local role sync_runner;
      perform sync_file_stored(v_f, v_case.k, v_case.rel, v_case.sha, 2048, 'application/pdf', v_case.ts);
    exception when others then
      v_raised := true;
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 10: sync_file_stored accepted %', v_case.label;
    end if;
  end loop;
  if (select storage_path from bb_files where id = v_f) is not null then
    raise exception 'FAIL 10: a refused sync_file_stored wrote the row';
  end if;

  set local role sync_runner;
  v_ok := sync_file_stored(v_f, replace(v_rel, '#', '_'), v_rel, v_sha, 2048, 'application/pdf', 'extracted');
  reset role;
  if not v_ok then raise exception 'FAIL 10: sync_file_stored returned false on an unstored row'; end if;
  select * into v_row from bb_files where id = v_f;
  if v_row.storage_path <> 'bb-files/' || replace(v_rel, '#', '_')
     or v_row.local_path <> 'course context/' || v_rel
     or v_row.sha256 <> v_sha or v_row.bytes <> 2048 or v_row.mime_type <> 'application/pdf'
     or v_row.text_status::text <> 'extracted' or v_row.downloaded_at is null
     or v_row.notes not like 'phase14_091 fixture | bytes pulled ____-__-__ by sync-runner' then
    raise exception 'FAIL 10: the stored row reads storage_path %, local_path %, notes %',
      v_row.storage_path, v_row.local_path, v_row.notes;
  end if;

  set local role sync_runner;
  v_ok := sync_file_stored(v_f, replace(v_rel, '#', '_'), v_rel, v_sha, 2048, 'application/pdf', 'extracted');
  reset role;
  if v_ok then raise exception 'FAIL 10: sync_file_stored wrote a row that already had bytes'; end if;

  set local role sync_runner;
  select w.* into v_listed from sync_file_worklist() w where w.id = v_f;
  reset role;
  if v_listed.id is not null then
    raise exception 'FAIL 10: a stored row is still on the worklist';
  end if;

  -- A submission keeps the mime type Blackboard declared.
  set local role sync_runner;
  v_ok := sync_file_stored(v_sub, replace(v_srel, '#', '_'), v_srel, v_sha, 4096,
                           'application/octet-stream', 'failed');
  reset role;
  if not v_ok or (select mime_type from bb_files where id = v_sub) <> 'application/msword' then
    raise exception 'FAIL 10: a submission''s declared mime type was not kept';
  end if;
end $$;

-- =============================================================================================
-- 11. Privileges
-- =============================================================================================
do $$
declare
  v_t      text;
  v_f      text;
  v_raised boolean;
  v_bad    text[] := '{}';
begin
  -- As sync_runner, the three tables it reaches only through the functions raise 42501.
  foreach v_t in array array['agent_requests', 'bb_files', 'attention_items'] loop
    v_raised := false;
    begin
      set local role sync_runner;
      execute format('select 1 from public.%I limit 1', v_t);
    exception when insufficient_privilege then
      v_raised := true;
    end;
    reset role;
    if not v_raised then v_bad := v_bad || format('sync_runner can read %s', v_t); end if;
    if has_table_privilege('sync_runner', 'public.' || v_t, 'select') then
      v_bad := v_bad || format('has_table_privilege(sync_runner, %s, select) is true', v_t);
    end if;
  end loop;

  -- No table, view or sequence grant at all (task 7's check).
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
         and has_table_privilege('sync_runner', c.oid, 'select,insert,update,delete')) <> 0 then
    v_bad := v_bad || 'sync_runner holds a privilege on a public table or view'::text;
  end if;
  -- The CASE keeps has_sequence_privilege off every relation that is not a sequence: the planner
  -- may evaluate it before the relkind filter, and on an index it raises.
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'S'
         and case when c.relkind = 'S'
                  then has_sequence_privilege('sync_runner', c.oid, 'usage,select,update')
                  else false end) <> 0 then
    v_bad := v_bad || 'sync_runner holds a privilege on a public sequence'::text;
  end if;

  -- The helper is not sync_runner's to call.
  v_raised := false;
  begin
    set local role sync_runner;
    perform sync_login_sync_due(now());
  exception when insufficient_privilege then
    v_raised := true;
  end;
  reset role;
  if not v_raised then v_bad := v_bad || 'sync_runner can execute sync_login_sync_due'::text; end if;

  -- anon and authenticated execute none of the twelve, nor the helper; sync_runner not the helper.
  foreach v_f in array array[
    'public.sync_next()', 'public.sync_claim(bigint)', 'public.sync_requeue_orphans()',
    'public.sync_register_run(bigint, uuid)', 'public.sync_run_outcome(uuid)',
    'public.sync_file_worklist()',
    'public.sync_file_stored(bigint, text, text, text, integer, text, text)',
    'public.sync_close(bigint, text, jsonb)', 'public.sync_sweep_stale()',
    'public.sync_enqueue(text)', 'public.sync_login_ok()', 'public.sync_login_required()',
    'public.sync_login_sync_due(timestamp with time zone)'] loop
    if has_function_privilege('anon', v_f, 'execute')
       or has_function_privilege('authenticated', v_f, 'execute') then
      v_bad := v_bad || format('anon or authenticated can execute %s', v_f);
    end if;
  end loop;
  if has_function_privilege('sync_runner', 'public.sync_login_sync_due(timestamp with time zone)', 'execute')
     or has_function_privilege('service_role', 'public.sync_login_sync_due(timestamp with time zone)', 'execute') then
    v_bad := v_bad || 'sync_runner or service_role can execute sync_login_sync_due'::text;
  end if;

  -- No default ACL names sync_runner, as owner or grantee.
  if exists (select 1 from pg_default_acl d where d.defaclrole = 'sync_runner'::regrole)
     or exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
                 where a.grantee = 'sync_runner'::regrole) then
    v_bad := v_bad || 'a pg_default_acl row names sync_runner'::text;
  end if;

  -- 094: the test role holds sync_runner with inherit false, and sync_runner holds no role at all.
  if not exists (select 1 from pg_auth_members m
                  where m.roleid = 'sync_runner'::regrole and m.member = 'db_test_runner'::regrole
                    and not m.inherit_option) then
    v_bad := v_bad || 'db_test_runner does not hold sync_runner with inherit false'::text;
  end if;
  if exists (select 1 from pg_auth_members m where m.member = 'sync_runner'::regrole) then
    v_bad := v_bad || 'sync_runner is a member of another role'::text;
  end if;

  if cardinality(v_bad) > 0 then
    raise exception 'FAIL 11: %', array_to_string(v_bad, '; ');
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase14_091_files: PASS' as result, current_user as ran_as;

rollback;
