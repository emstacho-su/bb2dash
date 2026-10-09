-- bb2dash :: db/tests/phase23_181_inbox_apply_runner.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07). Tests migration 181, with 184's claim and
-- 185's reads and close, acting as the role:
--
--   0. installed and shaped: the role, its seven functions, its exact table privileges
--   1. what the role must be refused: tables outside its list, delete, a state change, a column
--      outside courses.group_notes, the calendar settings, apply_resolutions, a direct archive
--   2. a write with no item, and with a forged item that is not answered, is refused by the trigger
--   3. (the one-open-request index is 183's; its unit is phase23_183_one_open_inbox_feedback.sql)
--   4. the run: claim -> prepare -> begin_item -> write -> archive -> run_facts -> close done
--   5. the decision shape is enforced; an item taken back is skipped
--   6. the follow-up: filed after a run that archived something, never for skipped rows
--   7. a failed close raises one item; a later done close archives it once no answered row waits
--      (185; phase23_185_session_links.sql holds the rest of that rule)
--   8. claim, as 184 amends it: it releases the worker's own claim past 16 minutes and anybody's
--      past 30, and leaves a live claim alone, the worker's own included
--
-- Every call is made under `set local role inbox_apply_runner` (181 grants db_test_runner the
-- role with inherit false). RUN IT: `node scripts/db-test.mjs --only phase23_181_inbox_apply_runner.sql`.
-- NOTHING IS COMMITTED: the last statement is `rollback`.

begin;

create temp table _t181 (label text primary key, id bigint, txt text) on commit drop;
grant all on _t181 to inbox_apply_runner;

-- =============================================================================================
-- 0. Installed and shaped
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  r      record;
  f      text;
  v_got  text;
  v_fns  text[] := array[
    'public.inbox_apply_claim()',
    'public.inbox_apply_prepare(bigint)',
    'public.inbox_apply_begin_item(bigint, bigint)',
    'public.inbox_apply_archive(bigint, bigint, jsonb)',
    'public.inbox_apply_run_facts(bigint)',
    'public.inbox_apply_close(bigint, text, jsonb)'];
begin
  if not exists (select 1 from pg_roles where rolname = 'inbox_apply_runner') then
    raise exception 'FAIL phase23_181: migration 181 is not applied (no role inbox_apply_runner)';
  end if;
  if position('c_own_release_after' in (select prosrc from pg_proc where oid = 'public.inbox_apply_claim()'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_181: migration 184 is not applied (inbox_apply_claim is still 181''s body)';
  end if;
  foreach f in array v_fns loop
    if to_regprocedure(f) is null then
      raise exception 'FAIL phase23_181: migration 181 is not applied (% is missing)', f;
    end if;
  end loop;

  select rolcanlogin, rolinherit, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolreplication,
         rolconnlimit, coalesce(rolconfig, '{}') as cfg
    into r from pg_roles where rolname = 'inbox_apply_runner';
  if not r.rolcanlogin then v_fail := v_fail || 'cannot log in'::text; end if;
  if r.rolinherit then v_fail := v_fail || 'inherits'::text; end if;
  if r.rolbypassrls then v_fail := v_fail || 'bypasses RLS'::text; end if;
  if r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication then
    v_fail := v_fail || 'holds superuser, createrole, createdb or replication'::text;
  end if;
  if r.rolconnlimit <> 4 then v_fail := v_fail || 'connection limit is not 4'::text; end if;
  if not r.cfg @> array['statement_timeout=30s'] then v_fail := v_fail || 'no statement_timeout 30s'::text; end if;

  foreach f in array v_fns loop
    select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg,
           obj_description(p.oid, 'pg_proc') as note
      into r from pg_proc p where p.oid = f::regprocedure;
    if not r.prosecdef then v_fail := v_fail || format('%s is not security definer', f); end if;
    if r.owner <> 'postgres' then v_fail := v_fail || format('%s is owned by %s', f, r.owner); end if;
    if not r.cfg @> array['search_path=public, pg_temp'] then
      v_fail := v_fail || format('%s does not pin search_path', f);
    end if;
    if r.note is null then v_fail := v_fail || format('%s has no comment', f); end if;
    if has_function_privilege('anon', f, 'execute') or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('service_role', f, 'execute') or has_function_privilege('sync_runner', f, 'execute') then
      v_fail := v_fail || format('%s is executable beyond inbox_apply_runner', f);
    end if;
  end loop;

  select string_agg(p.proname, ',' order by p.proname) into v_got
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('inbox_apply_runner', p.oid, 'execute');
  if v_got is distinct from
     'inbox_apply_archive,inbox_apply_begin_item,inbox_apply_claim,inbox_apply_close,'
     'inbox_apply_prepare,inbox_apply_run_facts,raise_attention' then
    v_fail := v_fail || format('the role executes SECURITY DEFINER functions %s', v_got);
  end if;

  select string_agg(c.relname || ':' || p.priv, ',' order by c.relname, p.priv) into v_got
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) p(priv)
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
     and has_table_privilege('inbox_apply_runner', c.oid, p.priv);
  -- 107 gives the role select on grade_column_links (v_gradebook_latest, which it reads, is
  -- security_invoker and reads that table), and phase16_107 pins that. Before 107 it is absent here.
  v_got := replace(v_got, 'grade_column_links:select,', '');
  if v_got is distinct from
     'assignment_progress:insert,assignment_progress:select,assignment_progress:update,'
     'assignments:insert,assignments:select,assignments:update,attention_items:select,'
     'bb_gradebook:select,course_staff:insert,course_staff:select,course_staff:update,'
     'courses:select,grade_components:select,inbox_apply_writes:insert,sessions:select,'
     'sync_runs:select,v_gradebook_latest:select,v_inbox_queue:select' then
    v_fail := v_fail || format('the role holds table privileges %s', v_got);
  end if;

  if not has_column_privilege('inbox_apply_runner', 'public.courses', 'group_notes', 'update')
     or has_column_privilege('inbox_apply_runner', 'public.courses', 'title_short', 'update')
     or not has_column_privilege('inbox_apply_runner', 'public.app_settings', 'gcal_dirty', 'update')
     or has_column_privilege('inbox_apply_runner', 'public.app_settings', 'ical_url', 'select')
     or has_column_privilege('inbox_apply_runner', 'public.attention_items', 'state', 'update')
     or has_column_privilege('inbox_apply_runner', 'public.attention_items', 'applied_at', 'update') then
    v_fail := v_fail || 'the role''s column privileges are not courses.group_notes and app_settings.gcal_dirty alone'::text;
  end if;
  -- 185: bb_files is read by column, so it is not in the table list above; no column of it is written.
  if not has_column_privilege('inbox_apply_runner', 'public.bb_files', 'session_id', 'select')
     or has_column_privilege('inbox_apply_runner', 'public.bb_files', 'source_url', 'select')
     or has_any_column_privilege('inbox_apply_runner', 'public.bb_files', 'insert, update') then
    v_fail := v_fail || 'the role does not read bb_files by its 185 columns alone'::text;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.inbox_apply_writes'::regclass) then
    v_fail := v_fail || 'inbox_apply_writes has no row level security'::text;
  end if;
  if has_table_privilege('anon', 'public.inbox_apply_writes', 'select')
     or has_table_privilege('authenticated', 'public.inbox_apply_writes', 'insert') then
    v_fail := v_fail || 'inbox_apply_writes is open to anon, or writable by authenticated'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase23_181 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Setup (not an assertion): no real open inbox_feedback request, no real answered row and no real
-- open failure item is in the way. Changed inside this transaction only.
-- =============================================================================================
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_181 setup',
       decision = '{"change": "test setup"}'::jsonb
 where state in ('resolved', 'dismissed')
    or (state = 'open' and ref in ('inbox-apply-failed', 'apply-login-required'));

-- The worker's real runs of today would count toward runs_today; inside this transaction they are
-- somebody else's.
update agent_requests set claimed_by = 'phase23_181 setup'
 where kind = 'inbox_feedback' and claimed_by = 'inbox-apply-runner' and state in ('done', 'failed');

do $$
declare v_a bigint; v_b bigint; v_c bigint; v_open bigint; v_asg text; v_course text;
begin
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note)
  values ('stack_must_confirm', 'assignment', 'test181:a', '181 A', 'resolved', now(),
          '{"value":"yes","value_type":"text"}', 'yes, add it')
  returning id into v_a;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note)
  values ('data_gap', 'bb_file', 'test181:b', '181 B', 'dismissed', now() + interval '1 second',
          '{"dismissed":true}', 'not a real gap')
  returning id into v_b;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test181:c', '181 C', 'resolved', now() + interval '2 seconds',
          '{"value":"yes","value_type":"text"}')
  returning id into v_c;
  insert into attention_items (kind, entity, ref, question)
  values ('missing', 'assignment', 'test181:open', '181 open')
  returning id into v_open;
  select a.id, a.course_id into v_asg, v_course from assignments a
   where a.course_id is not null order by a.id limit 1;
  if v_asg is null then
    raise exception 'FAIL phase23_181 (setup): no assignments row to write';
  end if;
  insert into _t181 values ('a', v_a, null), ('b', v_b, null), ('c', v_c, null), ('open', v_open, null),
                           ('asg', null, v_asg), ('course', null, v_course);
end $$;

-- =============================================================================================
-- 1. What the role must be refused
-- =============================================================================================
do $$
declare
  v_case record;
  v_raised boolean;
  v_state text;
begin
  for v_case in
    select * from (values
      ('read bb_raw',                 'select 1 from bb_raw limit 1'),
      ('read reading_progress',       'select 1 from reading_progress limit 1'),
      ('read agent_requests',         'select 1 from agent_requests limit 1'),
      ('read the write log',          'select 1 from inbox_apply_writes limit 1'),
      ('read the iCal URL',           'select ical_url from app_settings'),
      ('delete an assignment',        'delete from assignments where false'),
      ('delete a progress row',       'delete from assignment_progress where false'),
      ('change an item''s state',     'update attention_items set state = ''open'' where false'),
      ('stamp applied_at directly',   'update attention_items set applied_at = now() where false'),
      ('write a course title',        'update courses set title_short = title_short where false'),
      ('write reading_progress',      'update reading_progress set status = status where false'),
      ('file a request directly',     'insert into agent_requests (kind) values (''inbox_feedback'')'),
      ('run apply_resolutions',       'select apply_resolutions()'),
      ('archive directly',            'select archive_attention_item(1, ''{"change":"x"}''::jsonb)'),
      ('ask whose claim it is',       'select inbox_apply_is_own_claim(1)'),
      ('file a sync request',         'select sync_enqueue(''just'')')
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
-- 2. A write must name an answered item
-- =============================================================================================
do $$
declare
  v_asg  text := (select txt from _t181 where label = 'asg');
  v_open bigint := (select id from _t181 where label = 'open');
  v_state text;
  v_raised boolean;
  v_setting text;
begin
  foreach v_setting in array array['', v_open::text, 'not a number', '-1'] loop
    v_raised := false;
    begin
      set local role inbox_apply_runner;
      perform set_config('inbox_apply.item', v_setting, true);
      update assignments set title = title where id = v_asg;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '42501';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 2: a write with inbox_apply.item = % was not refused', quote_literal(v_setting);
    end if;
  end loop;
  perform set_config('inbox_apply.item', '', true);
  if exists (select 1 from inbox_apply_writes where table_name = 'assignments' and row_key = v_asg
               and written_at >= transaction_timestamp()) then
    raise exception 'FAIL 2: a refused write was logged';
  end if;

  -- Another role's write fires no trigger and logs nothing.
  update assignments set title = title where id = v_asg;
  if exists (select 1 from inbox_apply_writes where written_at >= transaction_timestamp()) then
    raise exception 'FAIL 2: a write by another role was logged';
  end if;
end $$;

-- =============================================================================================
-- 3. The request the run works (the one-open-request rule itself is 183's)
-- =============================================================================================
do $$
declare v_first bigint;
begin
  insert into agent_requests (kind, scope, state, note)
  values ('inbox_feedback', 'all', 'queued', 'phase23_181 R1') returning id into v_first;
  insert into _t181 values ('r1', v_first, null);
end $$;

-- =============================================================================================
-- 4. The run
-- =============================================================================================
do $$
declare
  v_r1   bigint := (select id from _t181 where label = 'r1');
  v_a    bigint := (select id from _t181 where label = 'a');
  v_b    bigint := (select id from _t181 where label = 'b');
  v_c    bigint := (select id from _t181 where label = 'c');
  v_asg  text := (select txt from _t181 where label = 'asg');
  v_course text := (select txt from _t181 where label = 'course');
  v_id   bigint;
  v_prep jsonb;
  v_ok   boolean;
  v_facts jsonb;
  v_follow bigint;
  v_row  record;
  v_n    int;
begin
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  if v_id is distinct from v_r1 then
    raise exception 'FAIL 4: inbox_apply_claim() returned %, expected %', v_id, v_r1;
  end if;
  select state, claimed_by, claim_attempts into v_row from agent_requests where id = v_r1;
  if v_row.state <> 'claimed' or v_row.claimed_by <> 'inbox-apply-runner' or v_row.claim_attempts <> 1 then
    raise exception 'FAIL 4: after the claim the request reads %', row_to_json(v_row);
  end if;

  set local role inbox_apply_runner;
  v_prep := inbox_apply_prepare(v_r1);
  reset role;
  if jsonb_array_length(v_prep->'queue') <> 3
     or (v_prep->'queue'->0->>'id')::bigint <> v_a or (v_prep->'queue'->1->>'id')::bigint <> v_b
     or (v_prep->'queue'->2->>'id')::bigint <> v_c
     or v_prep->'queue'->1->>'state' <> 'dismissed' or (v_prep->'queue'->0->>'has_note')::boolean is not true
     or (v_prep->>'runs_today')::int <> 0 or jsonb_typeof(v_prep->'params') <> 'object' then
    raise exception 'FAIL 4: inbox_apply_prepare returned %', v_prep;
  end if;

  -- Item A: a change. One transaction in the worker; here, one block.
  set local role inbox_apply_runner;
  v_ok := inbox_apply_begin_item(v_r1, v_a);
  update assignments set title = title where id = v_asg;
  update courses set group_notes = group_notes where id = v_course;
  reset role;
  if not v_ok then raise exception 'FAIL 4: inbox_apply_begin_item(A) returned false'; end if;
  select count(*) into v_n from inbox_apply_writes
   where item_id = v_a and request_id = v_r1 and op = 'update' and old_row is not null
     and ((table_name = 'assignments' and row_key = v_asg) or (table_name = 'courses' and row_key = v_course));
  if v_n <> 2 then
    raise exception 'FAIL 4: the two writes for A logged % rows, expected 2', v_n;
  end if;
  if (select gcal_dirty from app_settings where id) is not true then
    raise exception 'FAIL 4: the calendar-dirty trigger did not run for the role''s assignments write';
  end if;

  set local role inbox_apply_runner;
  v_ok := inbox_apply_archive(v_r1, v_a, jsonb_build_object(
    'schema', 'inbox-decision/1', 'item', v_a, 'request', v_r1, 'mode', 'unattended',
    'bucket', 'needs_change', 'change', 'confirmed under Homework', 'rule', 'follows the course precedent',
    'sources', jsonb_build_array('assignments'), 'flagged', null));
  reset role;
  if not v_ok then raise exception 'FAIL 4: inbox_apply_archive(A) returned false'; end if;
  select state, applied_at, archived_by, decision->>'change' as change into v_row from attention_items where id = v_a;
  if v_row.state <> 'archived' or v_row.applied_at is null
     or v_row.archived_by <> 'inbox-apply request ' || v_r1 or v_row.change <> 'confirmed under Homework' then
    raise exception 'FAIL 4: after the archive A reads %', row_to_json(v_row);
  end if;
  if coalesce(current_setting('inbox_apply.item', true), '') <> '' then
    raise exception 'FAIL 4: the archive left inbox_apply.item set';
  end if;

  -- Item B: recorded only. No write, so applied_at stays null.
  set local role inbox_apply_runner;
  v_ok := inbox_apply_archive(v_r1, v_b, jsonb_build_object(
    'schema', 'inbox-decision/1', 'item', v_b, 'request', v_r1, 'mode', 'unattended',
    'bucket', 'dismissed', 'change', 'recorded only', 'rule', 'dismissed: not a real gap'));
  reset role;
  if not v_ok or (select applied_at from attention_items where id = v_b) is not null then
    raise exception 'FAIL 4: a recorded-only archive failed or stamped applied_at';
  end if;

  set local role inbox_apply_runner;
  v_facts := inbox_apply_run_facts(v_r1);
  reset role;
  if v_facts->'archived_ids' <> jsonb_build_array(v_a, v_b) or v_facts->'changed_ids' <> jsonb_build_array(v_a)
     or (v_facts->>'writes')::int <> 2 or v_facts->'unarchived_writes' <> '[]'::jsonb
     or v_facts->'left_ids' <> jsonb_build_array(v_c) then
    raise exception 'FAIL 4: inbox_apply_run_facts returned %', v_facts;
  end if;

  -- 6. The close files one follow-up for C; with C skipped it would file none (checked below).
  set local role inbox_apply_runner;
  v_follow := inbox_apply_close(v_r1, 'done', jsonb_build_object(
    'lines', jsonb_build_array('1 answer applied, 1 recorded only'), 'archived', 2, 'changed', 1,
    'claude', jsonb_build_object('started', true)));
  reset role;
  select state, finished_at, result->'lines'->>0 as line into v_row from agent_requests where id = v_r1;
  if v_row.state <> 'done' or v_row.finished_at is null or v_row.line <> '1 answer applied, 1 recorded only' then
    raise exception 'FAIL 4: after the close the request reads %', row_to_json(v_row);
  end if;
  if v_follow is null then
    raise exception 'FAIL 6: a close with a row left filed no follow-up';
  end if;
  select state, params into v_row from agent_requests where id = v_follow;
  if v_row.state <> 'queued'
     -- 187 (R3): this request has no trigger, so it is a press's request and its follow-up carries
     -- retry_held: true; before 187 it carries nothing more. The unit reads both the same.
     or (v_row.params - 'retry_held') is distinct from jsonb_build_object('trigger', 'followup', 'after', v_r1, 'skip', '[]'::jsonb) then
    raise exception 'FAIL 6: the follow-up reads %', row_to_json(v_row);
  end if;
  insert into _t181 values ('r2', v_follow, null);
end $$;

-- =============================================================================================
-- 5. The decision shape, an item taken back, and a request that is not the worker's
-- =============================================================================================
do $$
declare
  v_r1 bigint := (select id from _t181 where label = 'r1');
  v_r2 bigint := (select id from _t181 where label = 'r2');
  v_c  bigint := (select id from _t181 where label = 'c');
  v_good jsonb;
  v_case record;
  v_state text;
  v_raised boolean;
  v_id bigint;
  v_ok boolean;
begin
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  if v_id is distinct from v_r2 then
    raise exception 'FAIL 5 (setup): the follow-up was not claimed (%).', v_id;
  end if;

  -- The first request started Claude today (its result says so): the daily count reads 1.
  set local role inbox_apply_runner;
  v_id := (inbox_apply_prepare(v_r2)->>'runs_today')::bigint;
  reset role;
  if v_id <> 1 then
    raise exception 'FAIL 5: runs_today reads %, expected 1', v_id;
  end if;

  v_good := jsonb_build_object('schema', 'inbox-decision/1', 'item', v_c, 'request', v_r2,
                               'mode', 'unattended', 'bucket', 'kept', 'change', 'recorded only', 'rule', '');
  for v_case in
    select * from (values
      ('no schema',            v_good - 'schema'),
      ('another item',         v_good || jsonb_build_object('item', v_c + 1)),
      ('another request',      v_good || jsonb_build_object('request', v_r1)),
      ('an unknown bucket',    v_good || '{"bucket": "whatever"}'::jsonb),
      ('no bucket',            v_good - 'bucket'),
      ('a session mode',       v_good || '{"mode": "session"}'::jsonb),
      ('a blank change',       v_good || '{"change": "  "}'::jsonb),
      ('no rule',              v_good - 'rule'),
      ('sources not an array', v_good || '{"sources": "x"}'::jsonb),
      ('flagged a string',     v_good || '{"flagged": "x"}'::jsonb),
      ('an array',             '[]'::jsonb)
    ) t(label, decision)
  loop
    v_raised := false;
    begin
      set local role inbox_apply_runner;
      perform inbox_apply_archive(v_r2, v_c, v_case.decision);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '22023';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 5: inbox_apply_archive accepted a decision with %', v_case.label;
    end if;
  end loop;
  if (select state from attention_items where id = v_c) <> 'resolved' then
    raise exception 'FAIL 5: a refused decision archived the item';
  end if;

  -- A closed request is not the worker's claim any more: every function refuses it.
  for v_case in
    select * from (values
      ('prepare',    format('select inbox_apply_prepare(%s)', v_r1)),
      ('begin_item', format('select inbox_apply_begin_item(%s, %s)', v_r1, v_c)),
      ('archive',    format('select inbox_apply_archive(%s, %s, %L::jsonb)', v_r1, v_c, v_good || jsonb_build_object('request', v_r1))),
      ('close',      format('select inbox_apply_close(%s, ''done'', ''{"lines": []}''::jsonb)', v_r1)),
      ('close with a bad state',  format('select inbox_apply_close(%s, ''cancelled'', ''{"lines": []}''::jsonb)', v_r2)),
      ('close with no lines',     format('select inbox_apply_close(%s, ''done'', ''{}''::jsonb)', v_r2)),
      ('close with a bad skip',   format('select inbox_apply_close(%s, ''done'', ''{"lines": [], "skip": ["x"]}''::jsonb)', v_r2)),
      ('run_facts of a sync',     'select inbox_apply_run_facts(-1)')
    ) t(label, stmt)
  loop
    v_raised := false;
    begin
      set local role inbox_apply_runner;
      execute v_case.stmt;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '22023';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 5: % was not refused with 22023', v_case.label;
    end if;
  end loop;

  -- An item taken back (Undo) between the batch read and the write is skipped, not written.
  update attention_items set state = 'open', resolved_at = null, resolution = null where id = v_c;
  set local role inbox_apply_runner;
  v_ok := inbox_apply_begin_item(v_r2, v_c);
  reset role;
  if v_ok then raise exception 'FAIL 5: begin_item returned true for an item taken back'; end if;
  set local role inbox_apply_runner;
  v_ok := inbox_apply_archive(v_r2, v_c, v_good);
  reset role;
  if v_ok then raise exception 'FAIL 5: an item taken back was archived'; end if;
  update attention_items set state = 'resolved', resolved_at = now(), resolution = '{"value":"yes","value_type":"text"}'
   where id = v_c;
end $$;

-- =============================================================================================
-- 6 and 7. No follow-up for a skipped row or a run that archived nothing; the failure item
-- =============================================================================================
do $$
declare
  v_r2 bigint := (select id from _t181 where label = 'r2');
  v_c  bigint := (select id from _t181 where label = 'c');
  v_follow bigint;
  v_r3 bigint;
  v_n int;
begin
  -- A failed close that archived nothing: no follow-up, one failure item.
  set local role inbox_apply_runner;
  v_follow := inbox_apply_close(v_r2, 'failed', jsonb_build_object(
    'lines', jsonb_build_array('The run timed out.'), 'error', 'timed_out', 'archived', 0,
    'skip', jsonb_build_array(v_c)));
  reset role;
  if v_follow is not null then
    raise exception 'FAIL 6: a run that archived nothing filed a follow-up';
  end if;
  select count(*) into v_n from attention_items
   where ref = 'inbox-apply-failed' and state = 'open' and kind = 'stack_must_confirm' and course_id is null;
  if v_n <> 1 then
    raise exception 'FAIL 7: a failed close left % open inbox-apply-failed items, expected 1', v_n;
  end if;

  -- An expired sign-in raises its own ref.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('inbox_feedback', 'all', 'claimed', now(), 'inbox-apply-runner', 1, 'phase23_181 R3')
  returning id into v_r3;
  set local role inbox_apply_runner;
  v_follow := inbox_apply_close(v_r3, 'failed', '{"lines": [], "error": "sign_in_expired", "archived": 1, "skip": []}'::jsonb);
  reset role;
  if (select count(*) from attention_items where ref = 'apply-login-required' and state = 'open') <> 1 then
    raise exception 'FAIL 7: an expired sign-in did not raise apply-login-required';
  end if;
  -- It archived one and C is left and not skipped: a follow-up, even though the run failed.
  if v_follow is null then
    raise exception 'FAIL 6: a failed run that archived something filed no follow-up for the rest';
  end if;

  -- The follow-up runs Claude, skips C, archives nothing new: done, no further follow-up. The run
  -- proves the sign-in, so that notice closes; C still waits, so the failure notice stays (185).
  set local role inbox_apply_runner;
  perform inbox_apply_claim();
  v_follow := inbox_apply_close(v_follow, 'done', jsonb_build_object(
    'lines', jsonb_build_array('Nothing new to apply'), 'archived', 1, 'skip', jsonb_build_array(v_c),
    'claude', jsonb_build_object('started', true)));
  reset role;
  if v_follow is not null then
    raise exception 'FAIL 6: a follow-up was filed for a queue that holds only skipped rows';
  end if;
  if (select count(*) from attention_items where ref = 'inbox-apply-failed' and state = 'open') <> 1
     or exists (select 1 from attention_items where ref = 'apply-login-required' and state = 'open') then
    raise exception 'FAIL 7: a done run over a waiting answer did not leave the failure notice open and close the sign-in notice';
  end if;

  -- C leaves the queue (taken back, or answered again and applied): the next done close archives
  -- the failure notice.
  update attention_items
     set state = 'archived', archived_at = now(), archived_by = 'phase23_181 setup',
         decision = '{"change": "test setup"}'::jsonb
   where id = v_c;
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('inbox_feedback', 'all', 'claimed', now(), 'inbox-apply-runner', 1, 'phase23_181 R4')
  returning id into v_r3;
  set local role inbox_apply_runner;
  v_follow := inbox_apply_close(v_r3, 'done', '{"lines": ["Nothing to apply"], "archived": 0, "skip": []}'::jsonb);
  reset role;
  if exists (select 1 from attention_items
              where ref in ('inbox-apply-failed', 'apply-login-required') and state = 'open') then
    raise exception 'FAIL 7: a done close over an empty queue left a failure item open';
  end if;
  if (select count(*) from attention_items
       where ref in ('inbox-apply-failed', 'apply-login-required') and state = 'archived'
         and archived_by = 'inbox-apply-runner' and decision->>'closed_itself' = 'true'
         and archived_at = now()) <> 2 then  -- this transaction's own: prod holds real ones since the cut-over
    raise exception 'FAIL 7: the failure items were not archived as closed_itself';
  end if;
end $$;

-- =============================================================================================
-- 8. The claim's releases
-- =============================================================================================
do $$
declare
  v_mine bigint; v_live bigint; v_old bigint; v_next bigint;
  v_id bigint;
  v_row record;
begin
  -- (a) The worker's own claim (184): while it is younger than 16 minutes it is a live run, of this
  --     worker or of another container holding the same login, and nothing is taken beside it.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, claim_attempts, note)
  values ('inbox_feedback', 'all', 'claimed', now() - interval '15 minutes', 'inbox-apply-runner', 1, 'phase23_181 mine')
  returning id into v_mine;
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  if v_id is not null or (select state from agent_requests where id = v_mine) <> 'claimed' then
    raise exception 'FAIL 8: a 15-minute claim of the worker''s own was touched (claim returned %)', v_id;
  end if;

  --     Past 16 minutes no process is behind it: closed failed, interrupted, and counted as a run.
  update agent_requests set claimed_at = now() - interval '17 minutes' where id = v_mine;
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  select state, result->>'error' as error, result->'claude'->>'started' as started into v_row
    from agent_requests where id = v_mine;
  if v_id is not null or v_row.state <> 'failed' or v_row.error <> 'interrupted' or v_row.started <> 'true' then
    raise exception 'FAIL 8: the worker''s dead claim reads % (claim returned %)', row_to_json(v_row), v_id;
  end if;
  if (select count(*) from attention_items where ref = 'inbox-apply-failed' and state = 'open') <> 1 then
    raise exception 'FAIL 8: releasing the dead claim did not raise the failure item';
  end if;

  -- (b) Somebody else's live claim: left alone, and nothing is claimed beside it.
  insert into agent_requests (kind, scope, state, claimed_at, claimed_by, note)
  values ('inbox_feedback', 'all', 'claimed', now() - interval '29 minutes', 'inbox-apply session', 'phase23_181 live')
  returning id into v_live;
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  if v_id is not null or (select state from agent_requests where id = v_live) <> 'claimed' then
    raise exception 'FAIL 8: a live claim of somebody else''s was touched (claim returned %)', v_id;
  end if;

  -- (c) The same claim past 30 minutes: released (R-96), and a queued request is then taken.
  update agent_requests set claimed_at = now() - interval '31 minutes' where id = v_live;
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  select state, result->>'error' as error into v_row from agent_requests where id = v_live;
  if v_row.state <> 'failed' or v_row.error <> 'interrupted' then
    raise exception 'FAIL 8: a 31-minute claim was not released: %', row_to_json(v_row);
  end if;
  insert into agent_requests (kind, scope, state, params, note)
  values ('inbox_feedback', 'all', 'queued', '{"trigger": "sync", "after": 1}', 'phase23_181 next')
  returning id into v_next;
  set local role inbox_apply_runner;
  select c.id into v_id from inbox_apply_claim() c;
  reset role;
  if v_id is distinct from v_next then
    raise exception 'FAIL 8: after the release the queued request was not claimed (%).', v_id;
  end if;

  -- A sync request is never claimed by this worker.
  if exists (select 1 from agent_requests where kind <> 'inbox_feedback' and claimed_by = 'inbox-apply-runner') then
    raise exception 'FAIL 8: the apply worker claimed a request that is not inbox_feedback';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_181_inbox_apply_runner: PASS' as result, current_user as ran_as;

rollback;
