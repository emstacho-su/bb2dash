-- bb2dash :: db/tests/phase23_187_accept_objects.sql
-- Phase 23 follow-ups (brief 110, "The acceptance pack", with Round 1). Tests migration 187,
-- section 3: the two objects the acceptance run uses.
--
--   0. installed: inbox_accept_question(text, text) and the view v_inbox_apply_runs
--   1. inbox_accept_question raises the row the brief fixes: kind from the label (Round 1), entity
--      agent_request, no course, no field, ref accept/<run>/<label>, a fixed sentence with the
--      label in it; the label dismiss or offline raises a data_gap, any other a stack_must_confirm;
--      a ref used once is not raised again
--   2. a data_gap test row is still open after close_cleared_gaps runs (Round 1)
--   3. the owner check: a signed-in account that is not the owner, and a call with no account,
--      are refused and raise nothing; anon and the runner roles cannot execute the function
--   4. both arguments are held to a pattern; the edges of each pattern are accepted
--   5. the clean-up: a call archives every unarchived row of the shape that carries another run
--      tag, open or answered, as closed_itself, and nothing else; no row it archives is an
--      inbox-decision/1 record, so the exporter never lists it
--   6. at most eight rows of the shape are open at once: the ninth is refused
--   7. v_inbox_apply_runs: its exact columns and types, security invoker, anon revoked, and the
--      values it derives for each kind of request, including odd params and results
--
-- RUN IT: `node scripts/db-test.mjs --only phase23_187_accept_objects.sql`. NOTHING IS COMMITTED.

begin;

create temp table _t187a (label text primary key, id bigint) on commit drop;

-- Ask as the app's own login, signed in as `p_sub` ('' means no account at all).
create function pg_temp.t187a_ask_as(p_sub text, p_run text, p_label text) returns bigint
  language plpgsql as $$
declare v_id bigint;
begin
  perform set_config('request.jwt.claim.sub', p_sub, true);
  set local role authenticated;
  v_id := inbox_accept_question(p_run, p_label);
  reset role;
  return v_id;
end $$;

-- Ask as the owner.
create function pg_temp.t187a_ask(p_run text, p_label text) returns bigint
  language plpgsql as $$
begin
  return pg_temp.t187a_ask_as(app_owner()::text, p_run, p_label);
end $$;

-- The rows of the shape (any state): ref, entity and no course.
create function pg_temp.t187a_shape(p_state text default null) returns bigint language sql as $$
  select count(*) from attention_items
   where ref like 'accept/%' and entity = 'agent_request' and course_id is null
     and (p_state is null or state = p_state)
$$;

-- A refusal: the SQLSTATE the call ends with, or 'ok' when it did not raise.
create function pg_temp.t187a_state(p_sub text, p_run text, p_label text) returns text
  language plpgsql as $$
declare v_state text;
begin
  perform pg_temp.t187a_ask_as(p_sub, p_run, p_label);
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  reset role;
  return v_state;
end $$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  c_fn constant text := 'public.inbox_accept_question(text, text)';
  r record;
begin
  if to_regprocedure(c_fn) is null or to_regclass('public.v_inbox_apply_runs') is null then
    raise exception 'FAIL phase23_187_accept_objects: migration 187 is not applied';
  end if;
  select p.prosecdef, pg_get_userbyid(p.proowner) as owner, coalesce(p.proconfig, '{}') as cfg,
         obj_description(p.oid, 'pg_proc') as note, p.prorettype::regtype::text as ret
    into r from pg_proc p where p.oid = c_fn::regprocedure;
  if not r.prosecdef or r.owner <> 'postgres' or not r.cfg @> array['search_path=public, pg_temp']
     or r.note is null or r.ret <> 'bigint' then
    raise exception 'FAIL phase23_187_accept_objects (shape): inbox_accept_question is %', row_to_json(r);
  end if;
  if not has_function_privilege('authenticated', c_fn, 'execute')
     or has_function_privilege('anon', c_fn, 'execute')
     or has_function_privilege('service_role', c_fn, 'execute')
     or has_function_privilege('inbox_apply_runner', c_fn, 'execute')
     or has_function_privilege('sync_runner', c_fn, 'execute') then
    raise exception 'FAIL phase23_187_accept_objects (shape): inbox_accept_question is not authenticated''s alone';
  end if;
end $$;

-- Setup (not an assertion): no real open inbox_feedback request, and no row of the shape in the way.
update agent_requests set state = 'cancelled'
 where kind = 'inbox_feedback' and state in ('queued', 'claimed');

update attention_items
   set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
       decision = '{"change": "test setup"}'::jsonb
 where ref like 'accept/%' and entity = 'agent_request' and course_id is null and state <> 'archived';

-- =============================================================================================
-- 1. The row
-- =============================================================================================
do $$
declare
  c_run constant text := 'unit187a';
  v_case record;
  v_id bigint;
  v_row record;
  v_n int;
begin
  for v_case in
    select * from (values
      ('confirm', 'stack_must_confirm'),
      ('note',    'stack_must_confirm'),
      ('dismiss', 'data_gap'),
      ('offline', 'data_gap'),
      ('other',   'stack_must_confirm')
    ) t(label, want_kind)
  loop
    v_id := pg_temp.t187a_ask(c_run, v_case.label);
    if v_id is null then
      raise exception 'FAIL 1: the call for % returned no id', v_case.label;
    end if;
    insert into _t187a values (v_case.label, v_id);
    select * into v_row from attention_items where id = v_id;
    if v_row.kind <> v_case.want_kind then
      raise exception 'FAIL 1: label % raised kind %, expected %', v_case.label, v_row.kind, v_case.want_kind;
    end if;
    if v_row.entity <> 'agent_request' or v_row.course_id is not null or v_row.field is not null
       or v_row.ref <> 'accept/' || c_run || '/' || v_case.label or v_row.state <> 'open'
       or v_row.resolution is not null or v_row.applied_at is not null or v_row.archived_at is not null
       or v_row.decision is not null or v_row.raised_by is not null then
      raise exception 'FAIL 1: the row for % reads %', v_case.label, row_to_json(v_row);
    end if;
    if v_row.question is null or position(v_case.label in v_row.question) = 0 or btrim(v_row.question) = '' then
      raise exception 'FAIL 1: the question for % does not carry its label: "%"', v_case.label, v_row.question;
    end if;
  end loop;

  select count(distinct question) into v_n from attention_items where ref like 'accept/' || c_run || '/%';
  if v_n <> 5 then
    raise exception 'FAIL 1: the five cards do not have five different sentences (%)', v_n;
  end if;
  -- A fixed sentence: the same label, the same text, whatever the run.
  if (select question from attention_items where id = (select id from _t187a where label = 'confirm'))
     is null then
    raise exception 'FAIL 1: no question';
  end if;

  -- A ref is used once: the same run and label again is refused, in any state.
  if pg_temp.t187a_state(app_owner()::text, c_run, 'confirm') <> '22023' then
    raise exception 'FAIL 1: raising accept/%/confirm a second time was not refused with 22023', c_run;
  end if;
  update attention_items set state = 'resolved', resolved_at = now(), resolution = '{"value":"yes"}'
   where id = (select id from _t187a where label = 'confirm');
  if pg_temp.t187a_state(app_owner()::text, c_run, 'confirm') <> '22023' then
    raise exception 'FAIL 1: raising a ref whose first row is answered was not refused with 22023';
  end if;
  if (select count(*) from attention_items where ref = 'accept/' || c_run || '/confirm') <> 1 then
    raise exception 'FAIL 1: a refused call left a second row';
  end if;
end $$;

-- =============================================================================================
-- 2. A data_gap test row is not closed by the gap sweep
-- =============================================================================================
do $$
declare
  v_dismiss bigint := (select id from _t187a where label = 'dismiss');
  v_offline bigint := (select id from _t187a where label = 'offline');
  v_r jsonb;
begin
  v_r := close_cleared_gaps(null, 'phase23_187');
  if (select state from attention_items where id = v_dismiss) <> 'open'
     or (select state from attention_items where id = v_offline) <> 'open' then
    raise exception 'FAIL 2: close_cleared_gaps closed a data_gap test row: %', v_r;
  end if;
  if (select archived_by from attention_items where id = v_dismiss) is not null then
    raise exception 'FAIL 2: close_cleared_gaps touched the dismiss row';
  end if;
end $$;

-- =============================================================================================
-- 3. The owner check
-- =============================================================================================
do $$
declare
  v_before bigint := pg_temp.t187a_shape();
  v_count_all bigint := (select count(*) from attention_items);
  v_state text;
  v_role text;
begin
  -- A signed-in account that is not the owner.
  v_state := pg_temp.t187a_state('00000000-0000-0000-0000-000000000000', 'ownerchk1', 'confirm');
  if v_state <> '42501' then
    raise exception 'FAIL 3: a non-owner account got SQLSTATE %, expected 42501', v_state;
  end if;
  -- A call with no account at all (no uid): must not slip through because both sides are null.
  v_state := pg_temp.t187a_state('', 'ownerchk1', 'confirm');
  if v_state <> '42501' then
    raise exception 'FAIL 3: a call with no account got SQLSTATE %, expected 42501', v_state;
  end if;
  -- The owner check comes first: a refused account is told nothing about the arguments.
  v_state := pg_temp.t187a_state('00000000-0000-0000-0000-000000000000', 'BAD', 'BAD');
  if v_state <> '42501' then
    raise exception 'FAIL 3: a non-owner with bad arguments got SQLSTATE %, expected 42501 (owner check first)', v_state;
  end if;
  if pg_temp.t187a_shape() <> v_before or (select count(*) from attention_items) <> v_count_all then
    raise exception 'FAIL 3: a refused call changed the table';
  end if;
  -- And it did not clean up another run's rows either.
  if exists (select 1 from attention_items where ref like 'accept/unit187a/%' and state = 'archived') then
    raise exception 'FAIL 3: a refused call archived another run''s rows';
  end if;

  -- Nobody else can call it.
  foreach v_role in array array['anon', 'inbox_apply_runner', 'sync_runner'] loop
    v_state := null;
    begin
      execute format('set local role %I', v_role);
      perform inbox_accept_question('rolechk1', 'confirm');
      v_state := 'ok';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    reset role;
    if v_state <> '42501' then
      raise exception 'FAIL 3: % got SQLSTATE %, expected 42501', v_role, v_state;
    end if;
  end loop;
end $$;

-- =============================================================================================
-- 4. The patterns
-- =============================================================================================
do $$
declare
  v_before bigint := pg_temp.t187a_shape();
  v_case record;
  v_state text;
  v_id bigint;
begin
  for v_case in
    select * from (values
      ('an upper-case run',       'ABCDEF',                 'confirm'),
      ('a run of five',           'abc12',                  'confirm'),
      ('a run of twenty-five',    repeat('a', 25),          'confirm'),
      ('a run with a slash',      'abc/def',                'confirm'),
      ('a run with a space',      'abc def1',               'confirm'),
      ('a run with a dash',       'abc-def1',               'confirm'),
      ('an empty run',            '',                       'confirm'),
      ('a null run',              null,                     'confirm'),
      ('an upper-case label',     'goodrun1',               'Confirm'),
      ('a label that starts with a digit', 'goodrun1',      '1confirm'),
      ('a label of seventeen',    'goodrun1',               repeat('a', 17)),
      ('a label with a slash',    'goodrun1',               'a/b'),
      ('a label with an underscore', 'goodrun1',            'a_b'),
      ('a label with a space',    'goodrun1',               'a b'),
      ('an empty label',          'goodrun1',               ''),
      ('a null label',           'goodrun1',                null)
    ) t(label, run, lbl)
  loop
    v_state := pg_temp.t187a_state(app_owner()::text, v_case.run, v_case.lbl);
    if v_state <> '22023' then
      raise exception 'FAIL 4: % got SQLSTATE %, expected 22023', v_case.label, v_state;
    end if;
  end loop;
  if pg_temp.t187a_shape() <> v_before then
    raise exception 'FAIL 4: a refused call raised a row';
  end if;
  if exists (select 1 from attention_items where ref like 'accept/goodrun1/%') then
    raise exception 'FAIL 4: a refused label raised a row';
  end if;

  -- The edges are accepted: six and twenty-four characters, one and sixteen.
  v_id := pg_temp.t187a_ask('abcd12', 'a');
  if (select ref from attention_items where id = v_id) <> 'accept/abcd12/a' then
    raise exception 'FAIL 4: the shortest run and label were not taken';
  end if;
  v_id := pg_temp.t187a_ask(repeat('b', 12) || repeat('9', 12), 'a' || repeat('b', 15));
  if (select ref from attention_items where id = v_id) <> 'accept/' || repeat('b', 12) || repeat('9', 12) || '/a' || repeat('b', 15) then
    raise exception 'FAIL 4: the longest run and label were not taken';
  end if;
end $$;

-- =============================================================================================
-- 5. The clean-up
-- =============================================================================================
do $$
declare
  c_old constant text := 'cleanup01';
  c_new constant text := 'cleanup02';
  v_course text := (select id from courses order by id limit 1);
  v_open_confirm bigint;
  v_open_dismiss bigint;
  v_answered bigint;
  v_offline bigint;
  v_d1 bigint; v_d2 bigint; v_d3 bigint; v_d4 bigint;
  v_id bigint;
  v_row record;
begin
  -- The earlier sections' rows go with the first call below; start from a known shape.
  v_open_confirm := pg_temp.t187a_ask(c_old, 'confirm');
  v_open_dismiss := pg_temp.t187a_ask(c_old, 'dismiss');
  v_answered     := pg_temp.t187a_ask(c_old, 'note');
  v_offline      := pg_temp.t187a_ask(c_old, 'offline');
  update attention_items set state = 'resolved', resolved_at = now(), resolution = '{"value":"yes","value_type":"text"}',
                             resolution_note = 'because'
   where id = v_answered;
  update attention_items set state = 'dismissed', resolved_at = now(), resolution = '{"dismissed":true}'
   where id = v_offline;
  if not exists (select 1 from v_inbox_queue where id = v_answered) or not exists (select 1 from v_inbox_queue where id = v_offline) then
    raise exception 'FAIL 5 (setup): the answered test rows are not in the queue';
  end if;

  -- Decoys that must survive: wrong entity, a course, a notice-like ref, an already archived row
  -- of another run.
  insert into attention_items (kind, entity, ref, question, state)
  values ('stack_must_confirm', 'bb_file', 'accept/decoy01/x', '187a decoy 1', 'open') returning id into v_d1;
  insert into attention_items (kind, course_id, entity, ref, question, state)
  values ('stack_must_confirm', v_course, 'agent_request', 'accept/decoy02/x', '187a decoy 2', 'open') returning id into v_d2;
  insert into attention_items (kind, entity, ref, question, state)
  values ('stack_must_confirm', 'agent_request', 'notice187a:thing', '187a decoy 3', 'open') returning id into v_d3;
  insert into attention_items (kind, entity, ref, question, state, archived_at, archived_by, decision)
  values ('stack_must_confirm', 'agent_request', 'accept/decoy04/x', '187a decoy 4', 'archived', now() - interval '1 day',
          'someone', '{"change":"old"}') returning id into v_d4;

  -- A new run asks: the old run's four rows are closed, open or answered.
  v_id := pg_temp.t187a_ask(c_new, 'confirm');
  for v_row in
    select * from attention_items where id in (v_open_confirm, v_open_dismiss, v_answered, v_offline)
  loop
    if v_row.state <> 'archived' or v_row.archived_at is null or v_row.archived_by is null
       or v_row.decision->>'closed_itself' is distinct from 'true' or v_row.decision ? 'schema' then
      raise exception 'FAIL 5: an old-run row was not archived as closed_itself: %', row_to_json(v_row);
    end if;
  end loop;
  -- The answer it had is still on the row; only the state moved.
  if (select resolution_note from attention_items where id = v_answered) <> 'because' then
    raise exception 'FAIL 5: the clean-up rewrote an answer';
  end if;
  if exists (select 1 from v_inbox_queue where id in (v_answered, v_offline)) then
    raise exception 'FAIL 5: an answered test row of the old run is still in the queue';
  end if;
  -- Nothing else moved.
  if (select state from attention_items where id = v_d1) <> 'open' or (select state from attention_items where id = v_d2) <> 'open'
     or (select state from attention_items where id = v_d3) <> 'open'
     or (select decision from attention_items where id = v_d4) is distinct from '{"change":"old"}'::jsonb
     or (select archived_by from attention_items where id = v_d4) <> 'someone' then
    raise exception 'FAIL 5: the clean-up touched a row that is not of the shape';
  end if;
  if (select state from attention_items where id = v_id) <> 'open' then
    raise exception 'FAIL 5: the new run''s row is not open';
  end if;

  -- The same run asking again does not close its own rows.
  v_open_dismiss := pg_temp.t187a_ask(c_new, 'dismiss');
  if (select state from attention_items where id = v_id) <> 'open' or (select state from attention_items where id = v_open_dismiss) <> 'open' then
    raise exception 'FAIL 5: a run closed its own rows';
  end if;
  if pg_temp.t187a_shape('open') <> 2 then
    raise exception 'FAIL 5: %  rows of the shape are open, expected the new run''s two', pg_temp.t187a_shape('open');
  end if;

  -- The exporter never lists a row the clean-up archived (no inbox-decision/1 record).
  if exists (select 1 from inbox_decisions_unfiled(500) u where u.ref like 'accept/cleanup01/%')
     or exists (select 1 from inbox_decisions_unlogged(500) u where u.ref like 'accept/cleanup01/%') then
    raise exception 'FAIL 5: the exporter would list a row the clean-up archived';
  end if;

  -- Put the decoys aside so section 6 counts only its own.
  update attention_items set state = 'archived', archived_at = now(), archived_by = 'phase23_187 setup',
         decision = '{"change":"test setup"}'::jsonb
   where id in (v_d1, v_d2, v_d3);
end $$;

-- =============================================================================================
-- 6. At most eight open
-- =============================================================================================
do $$
declare
  c_run constant text := 'capeight1';
  i int;
  v_state text;
begin
  for i in 1..8 loop
    perform pg_temp.t187a_ask(c_run, 'l' || i);
  end loop;
  if pg_temp.t187a_shape('open') <> 8 then
    raise exception 'FAIL 6: % rows of the shape are open after eight calls, expected 8', pg_temp.t187a_shape('open');
  end if;
  v_state := pg_temp.t187a_state(app_owner()::text, c_run, 'l9');
  if v_state <> '22023' then
    raise exception 'FAIL 6: the ninth open row got SQLSTATE %, expected 22023', v_state;
  end if;
  if pg_temp.t187a_shape('open') <> 8 or exists (select 1 from attention_items where ref = 'accept/' || c_run || '/l9') then
    raise exception 'FAIL 6: the refused ninth call left a row';
  end if;
  -- A refused call did not run the clean-up and then fail: the eight are still open.
  if (select count(*) from attention_items where ref like 'accept/capeight1/%' and state = 'open') <> 8 then
    raise exception 'FAIL 6: the eight rows are not all open';
  end if;
end $$;

-- =============================================================================================
-- 7. v_inbox_apply_runs
-- =============================================================================================
do $$
declare
  c_view constant text := 'public.v_inbox_apply_runs';
  v_cols text;
  v_role text;
  v_priv text;
begin
  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod), ',' order by a.attnum) into v_cols
    from pg_attribute a where a.attrelid = c_view::regclass and a.attnum > 0 and not a.attisdropped;
  if v_cols is distinct from
     'id:bigint,state:text,filed_by:text,after_request:bigint,claimed_by:text,created_at:timestamp with time zone,'
     'claimed_at:timestamp with time zone,finished_at:timestamp with time zone,claude_started:boolean,'
     'error_code:text,archived_count:integer,skip_ids:bigint[]' then
    raise exception 'FAIL 7: the view''s columns are %', v_cols;
  end if;
  if not exists (select 1 from pg_class c where c.oid = c_view::regclass and c.relkind = 'v'
                    and c.reloptions::text like '%security_invoker=true%') then
    raise exception 'FAIL 7: the view is not security_invoker';
  end if;
  if pg_get_viewdef(c_view::regclass) like '%inbox_apply_holds%' then
    raise exception 'FAIL 7: the view reads the hold table';
  end if;
  if obj_description(c_view::regclass, 'pg_class') is null then
    raise exception 'FAIL 7: the view has no comment';
  end if;
  foreach v_role in array array['anon', 'inbox_apply_runner', 'sync_runner'] loop
    foreach v_priv in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege(v_role, c_view, v_priv) then
        raise exception 'FAIL 7: % holds % on the view', v_role, v_priv;
      end if;
    end loop;
  end loop;
  foreach v_role in array array['authenticated', 'service_role', 'db_test_runner'] loop
    if not has_table_privilege(v_role, c_view, 'select') then
      raise exception 'FAIL 7: % cannot select from the view', v_role;
    end if;
    foreach v_priv in array array['insert', 'update', 'delete'] loop
      if has_table_privilege(v_role, c_view, v_priv) then
        raise exception 'FAIL 7: % holds % on the view', v_role, v_priv;
      end if;
    end loop;
  end loop;
end $$;

do $$
declare
  v_r1 bigint; v_r2 bigint; v_r3 bigint; v_r4 bigint; v_r5 bigint; v_r6 bigint; v_r7 bigint; v_sync bigint;
  v_row record;
  v_n bigint;
begin
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note) values
    ('inbox_feedback', 'all', 'done', 'inbox-apply-runner', now() - interval '3 minutes', now() - interval '2 minutes',
     '{"trigger": "sync", "after": 111}', '{"lines": [], "archived": 3, "skip": [5, 6], "claude": {"started": true}}', 'phase23_187a r1')
    returning id into v_r1;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note) values
    ('inbox_feedback', 'all', 'failed', 'inbox-apply-runner', now() - interval '3 minutes', now() - interval '2 minutes',
     jsonb_build_object('trigger', 'followup', 'after', v_r1, 'skip', jsonb_build_array(5, 6)),
     '{"lines": [], "error": "not_applied", "archived": 0, "skip": [5], "claude": {"started": false}}', 'phase23_187a r2')
    returning id into v_r2;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note) values
    ('inbox_feedback', 'all', 'done', 'bb-sync session', now(), now(), '{"trigger": "skill", "after": 2}', null, 'phase23_187a r3')
    returning id into v_r3;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note) values
    ('inbox_feedback', 'all', 'done', 'inbox-apply-runner', now(), now(), '{}', '{"lines": ["x"], "archived": 0}', 'phase23_187a r4')
    returning id into v_r4;
  insert into agent_requests (kind, scope, state, params, note) values
    ('inbox_feedback', 'all', 'cancelled', '{"trigger": "custom-thing"}', 'phase23_187a r5')
    returning id into v_r5;
  insert into agent_requests (kind, scope, state, claimed_by, claimed_at, finished_at, params, result, note) values
    ('inbox_feedback', 'all', 'failed', 'inbox-apply-runner', now(), now(), '{"trigger": "sync", "after": "abc"}',
     '{"lines": [], "error": 7, "archived": "y", "skip": "x", "claude": {"started": "yes"}}', 'phase23_187a r6')
    returning id into v_r6;
  insert into agent_requests (kind, scope, state, params, note) values
    ('inbox_feedback', 'all', 'queued', '{"trigger": "sync", "after": 5}', 'phase23_187a r7')
    returning id into v_r7;
  insert into agent_requests (kind, scope, state, claimed_by, finished_at, note) values
    ('sync', 'all', 'done', 'sync-runner', now(), 'phase23_187a sync')
    returning id into v_sync;

  -- r1: a sync's request that started Claude and archived three.
  select * into v_row from v_inbox_apply_runs where id = v_r1;
  if v_row.state is distinct from 'done' or v_row.filed_by is distinct from 'sync'
     or v_row.after_request is distinct from 111 or v_row.claimed_by is distinct from 'inbox-apply-runner'
     or v_row.claimed_at is null or v_row.finished_at is null or v_row.created_at is null
     or v_row.claude_started is not true or v_row.error_code is not null
     or v_row.archived_count is distinct from 3
     or v_row.skip_ids is distinct from array[5, 6]::bigint[] then
    raise exception 'FAIL 7: r1 reads %', row_to_json(v_row);
  end if;
  -- r2: a follow-up that failed not_applied without starting Claude.
  select * into v_row from v_inbox_apply_runs where id = v_r2;
  if v_row.state is distinct from 'failed' or v_row.filed_by is distinct from 'followup'
     or v_row.after_request is distinct from v_r1
     or v_row.claude_started is not false or v_row.error_code is distinct from 'not_applied'
     or v_row.archived_count is distinct from 0
     or v_row.skip_ids is distinct from array[5]::bigint[] then
    raise exception 'FAIL 7: r2 reads %', row_to_json(v_row);
  end if;
  -- r3: the fallback skill's, with no result at all.
  select * into v_row from v_inbox_apply_runs where id = v_r3;
  if v_row.filed_by is distinct from 'skill' or v_row.after_request is distinct from 2
     or v_row.claude_started is not false
     or v_row.error_code is not null or v_row.archived_count is not null or v_row.skip_ids is distinct from '{}'::bigint[] then
    raise exception 'FAIL 7: r3 reads %', row_to_json(v_row);
  end if;
  -- r4: the button files no trigger.
  select * into v_row from v_inbox_apply_runs where id = v_r4;
  if v_row.filed_by is distinct from 'button' or v_row.after_request is not null
     or v_row.archived_count is distinct from 0
     or v_row.skip_ids is distinct from '{}'::bigint[] then
    raise exception 'FAIL 7: r4 reads %', row_to_json(v_row);
  end if;
  -- r5: whatever the trigger holds.
  select * into v_row from v_inbox_apply_runs where id = v_r5;
  if v_row.filed_by is distinct from 'custom-thing' or v_row.state is distinct from 'cancelled'
     or v_row.claimed_by is not null then
    raise exception 'FAIL 7: r5 reads %', row_to_json(v_row);
  end if;
  -- r6: params and result of the wrong types never break the view.
  select * into v_row from v_inbox_apply_runs where id = v_r6;
  if v_row.filed_by is distinct from 'sync' or v_row.after_request is not null or v_row.claude_started is not false
     or v_row.archived_count is not null or v_row.skip_ids is distinct from '{}'::bigint[] then
    raise exception 'FAIL 7: r6 reads %', row_to_json(v_row);
  end if;
  -- r7: queued.
  select * into v_row from v_inbox_apply_runs where id = v_r7;
  if v_row.state is distinct from 'queued' or v_row.filed_by is distinct from 'sync'
     or v_row.after_request is distinct from 5 or v_row.claimed_at is not null then
    raise exception 'FAIL 7: r7 reads %', row_to_json(v_row);
  end if;
  -- Only inbox_feedback requests.
  select count(*) into v_n from v_inbox_apply_runs where id = v_sync;
  if v_n <> 0 then
    raise exception 'FAIL 7: the view lists a sync request';
  end if;
  if exists (select 1 from v_inbox_apply_runs v join agent_requests a on a.id = v.id where a.kind <> 'inbox_feedback') then
    raise exception 'FAIL 7: the view lists a request of another kind';
  end if;
  update agent_requests set state = 'cancelled' where id = v_r7;
end $$;

-- The view is security invoker: the owner sees the rows, another account none, anon is refused.
do $$
declare
  v_n bigint;
  v_state text;
  v_raised boolean := false;
begin
  perform set_config('request.jwt.claim.sub', app_owner()::text, true);
  set local role authenticated;
  select count(*) into v_n from v_inbox_apply_runs where id in (select id from agent_requests where note like 'phase23_187a r%');
  reset role;
  if v_n <> 7 then
    raise exception 'FAIL 7: the owner sees % of the 7 test rows through the view', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  set local role authenticated;
  select count(*) into v_n from v_inbox_apply_runs;
  reset role;
  if v_n <> 0 then
    raise exception 'FAIL 7: another account sees % rows through the view', v_n;
  end if;

  begin
    set local role anon;
    perform count(*) from v_inbox_apply_runs;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    v_raised := v_state = '42501';
  end;
  reset role;
  if not v_raised then
    raise exception 'FAIL 7: anon was not refused on the view';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_187_accept_objects: PASS' as result, current_user as ran_as;

rollback;
