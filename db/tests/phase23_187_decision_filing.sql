-- bb2dash :: db/tests/phase23_187_decision_filing.sql
-- Phase 23 follow-ups (brief 110, Item 3; DECISIONS 2026-10-08, "Schedule the decisions exporter",
-- "Notes only"). Tests migration 187, section 2: a decision is filed in two steps.
--
--   0. installed: inbox_decision_filed re-created, three new functions, all invoker rights and the
--      service role's alone (plus the test login)
--   1. a mark with a note path and no log path is accepted, and the row is then listed as unlogged;
--      a mark with a null log path is the same; a mark with both is not listed as unlogged
--   2. inbox_decision_logged adds log_path and logged_at once, and the row leaves the list
--   3. inbox_decision_skipped marks a row with {"skipped": true, "why"} and no path, once; such a
--      row is on neither list; a row that is filed or skipped cannot be skipped again
--   4. refusals: a blank or a numeric log path, a missing note path, a blank why / log path
--   5. the other reads and stamps still refuse what 182 refused (not archived, not inbox-decision/1)
--   6. inbox_apply_runner and authenticated can execute none of the four functions
--   7. item 3782, the test item of the cut-over run, is marked skipped when the row exists
--
-- RUN IT: `node scripts/db-test.mjs --only phase23_187_decision_filing.sql`. NOTHING IS COMMITTED.

begin;

create temp table _t187f (label text primary key, id bigint) on commit drop;

-- An archived inbox-decision/1 row, `p_age` minutes old (oldest first in the lists).
create function pg_temp.t187f_decided(p_label text, p_age integer) returns bigint language sql as $$
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note,
                               archived_at, archived_by, decision)
  values ('stack_must_confirm', 'assignment', 'test187f:' || p_label, '187f ' || p_label, 'archived', now(),
          '{"value":"yes"}', 'add it', now() - make_interval(mins => p_age), 'inbox-apply request 1',
          '{"schema":"inbox-decision/1","item":1,"request":1,"mode":"unattended","bucket":"needs_change","change":"confirmed","rule":"precedent"}')
  returning id
$$;

-- Ids of this unit's rows on a list, oldest first.
create function pg_temp.t187f_unlogged() returns bigint[] language plpgsql as $$
declare v_ids bigint[];
begin
  select coalesce(array_agg(u.id order by u.archived_at, u.id), '{}'::bigint[]) into v_ids
    from inbox_decisions_unlogged(500) u where u.ref like 'test187f:%';
  return v_ids;
end $$;

create function pg_temp.t187f_unfiled() returns bigint[] language plpgsql as $$
declare v_ids bigint[];
begin
  select coalesce(array_agg(u.id order by u.archived_at, u.id), '{}'::bigint[]) into v_ids
    from inbox_decisions_unfiled(500) u where u.ref like 'test187f:%';
  return v_ids;
end $$;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  f text;
begin
  if to_regprocedure('public.inbox_decisions_unlogged(integer)') is null
     or to_regprocedure('public.inbox_decision_logged(bigint, text)') is null
     or to_regprocedure('public.inbox_decision_skipped(bigint, text)') is null then
    raise exception 'FAIL phase23_187_decision_filing: migration 187 is not applied';
  end if;
  if position('log_path' in (select prosrc from pg_proc
                              where oid = 'public.inbox_decision_filed(bigint, jsonb)'::regprocedure)) = 0
     or position('187' in (select prosrc from pg_proc
                            where oid = 'public.inbox_decision_filed(bigint, jsonb)'::regprocedure)) = 0 then
    raise exception 'FAIL phase23_187_decision_filing: migration 187 is not applied (inbox_decision_filed is still 182''s body)';
  end if;
  foreach f in array array['public.inbox_decisions_unfiled(integer)',
                           'public.inbox_decision_filed(bigint, jsonb)',
                           'public.inbox_decisions_unlogged(integer)',
                           'public.inbox_decision_logged(bigint, text)',
                           'public.inbox_decision_skipped(bigint, text)'] loop
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      v_fail := v_fail || format('%s is security definer', f);
    end if;
    if not has_function_privilege('service_role', f, 'execute')
       or not has_function_privilege('db_test_runner', f, 'execute')
       or has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('inbox_apply_runner', f, 'execute')
       or has_function_privilege('sync_runner', f, 'execute') then
      v_fail := v_fail || format('%s is not service_role''s alone (and the test login)', f);
    end if;
    if obj_description(f::regprocedure, 'pg_proc') is null then
      v_fail := v_fail || format('%s has no comment', f);
    end if;
  end loop;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase23_187_decision_filing (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Fixture: five archived inbox-decision/1 rows, oldest first: o1 (30 min), o2 (20), o3 (10), o4 (5),
-- o5 (1). Plus one archived the old way, one answered and one open, which no list may carry.
-- =============================================================================================
do $$
declare v_old bigint; v_ans bigint; v_open bigint;
begin
  insert into _t187f values
    ('o1', pg_temp.t187f_decided('o1', 30)), ('o2', pg_temp.t187f_decided('o2', 20)),
    ('o3', pg_temp.t187f_decided('o3', 10)), ('o4', pg_temp.t187f_decided('o4', 5)),
    ('o5', pg_temp.t187f_decided('o5', 1));
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution,
                               archived_at, archived_by, decision)
  values ('stack_must_confirm', 'assignment', 'test187f:old', '187f old', 'archived', now(), '{"value":"yes"}',
          now() - interval '3 minutes', 'inbox-apply request 0',
          '{"change":"confirmed","rule":"old","note_id":"bb2dash-inbox-decision-0"}')
  returning id into v_old;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test187f:answered', '187f answered', 'resolved', now(), '{"value":"yes"}')
  returning id into v_ans;
  insert into attention_items (kind, entity, ref, question)
  values ('missing', 'assignment', 'test187f:open', '187f open')
  returning id into v_open;
  insert into _t187f values ('old', v_old), ('answered', v_ans), ('open', v_open);
end $$;

-- =============================================================================================
-- 1. A mark without a log path
-- =============================================================================================
do $$
declare
  v_o1 bigint := (select id from _t187f where label = 'o1');
  v_o2 bigint := (select id from _t187f where label = 'o2');
  v_o3 bigint := (select id from _t187f where label = 'o3');
  v_note jsonb := '{"note_path":"projects/bb2dash/decisions/inbox-1.md","ingested":true}';
  v_row record;
begin
  if pg_temp.t187f_unlogged() <> '{}' then
    raise exception 'FAIL 1 (setup): rows are listed as unlogged before any mark: %', pg_temp.t187f_unlogged();
  end if;

  -- Absent log_path.
  if not inbox_decision_filed(v_o1, v_note) then
    raise exception 'FAIL 1: a mark with a note path and no log path was not accepted';
  end if;
  select decision_filed_at, decision_filed into v_row from attention_items where id = v_o1;
  if v_row.decision_filed_at is null or v_row.decision_filed is distinct from v_note then
    raise exception 'FAIL 1: after the mark o1 reads %', row_to_json(v_row);
  end if;
  if pg_temp.t187f_unlogged() <> array[v_o1] then
    raise exception 'FAIL 1: o1 is not listed as unlogged: %', pg_temp.t187f_unlogged();
  end if;
  if v_o1 = any (pg_temp.t187f_unfiled()) then
    raise exception 'FAIL 1: o1 is still listed as unfiled';
  end if;

  -- A log_path of null is the same as none.
  if not inbox_decision_filed(v_o2, '{"note_path":"projects/bb2dash/decisions/inbox-2.md","log_path":null}'::jsonb) then
    raise exception 'FAIL 1: a mark with a null log path was not accepted';
  end if;
  if pg_temp.t187f_unlogged() <> array[v_o1, v_o2] then
    raise exception 'FAIL 1: o2 (null log path) is not listed as unlogged: %', pg_temp.t187f_unlogged();
  end if;

  -- A mark with both paths is complete: not unlogged.
  if not inbox_decision_filed(v_o3, '{"note_path":"projects/bb2dash/decisions/inbox-3.md","log_path":"docs/inbox-decisions/2026-10-07.md","ingested":false}'::jsonb) then
    raise exception 'FAIL 1: a mark with both paths was not accepted';
  end if;
  if v_o3 = any (pg_temp.t187f_unlogged()) or v_o3 = any (pg_temp.t187f_unfiled()) then
    raise exception 'FAIL 1: a fully filed row is on a list';
  end if;

  -- Once only, as in 182.
  if inbox_decision_filed(v_o1, v_note) then
    raise exception 'FAIL 1: a second mark on o1 returned true';
  end if;
end $$;

-- =============================================================================================
-- 2. The log step
-- =============================================================================================
do $$
declare
  v_o1 bigint := (select id from _t187f where label = 'o1');
  v_o2 bigint := (select id from _t187f where label = 'o2');
  v_o3 bigint := (select id from _t187f where label = 'o3');
  v_o4 bigint := (select id from _t187f where label = 'o4');
  v_row record;
  v_at timestamptz;
begin
  -- The oldest first: o1 then o2.
  if pg_temp.t187f_unlogged() <> array[v_o1, v_o2] then
    raise exception 'FAIL 2 (setup): unlogged is %, expected o1 then o2', pg_temp.t187f_unlogged();
  end if;
  -- The same columns as inbox_decisions_unfiled.
  select * into v_row from inbox_decisions_unlogged(500) u where u.id = v_o1;
  if v_row.question <> '187f o1' or v_row.resolution_note <> 'add it' or v_row.archived_by <> 'inbox-apply request 1'
     or v_row.decision->>'change' <> 'confirmed' or v_row.course_id is not null or v_row.entity <> 'assignment' then
    raise exception 'FAIL 2: the unlogged row for o1 reads %', row_to_json(v_row);
  end if;

  select decision_filed_at into v_at from attention_items where id = v_o1;
  if not inbox_decision_logged(v_o1, 'docs/inbox-decisions/2026-10-08.md') then
    raise exception 'FAIL 2: inbox_decision_logged did not stamp o1';
  end if;
  select decision_filed_at, decision_filed into v_row from attention_items where id = v_o1;
  if v_row.decision_filed->>'log_path' is distinct from 'docs/inbox-decisions/2026-10-08.md'
     or v_row.decision_filed->>'note_path' is distinct from 'projects/bb2dash/decisions/inbox-1.md'
     or v_row.decision_filed->>'ingested' is distinct from 'true'
     or jsonb_typeof(v_row.decision_filed->'logged_at') is distinct from 'string'
     or (v_row.decision_filed->>'logged_at')::timestamptz is null
     or v_row.decision_filed_at is distinct from v_at then
    raise exception 'FAIL 2: after the log step o1 reads %', row_to_json(v_row);
  end if;
  if pg_temp.t187f_unlogged() <> array[v_o2] then
    raise exception 'FAIL 2: after the log step unlogged is %, expected o2 alone', pg_temp.t187f_unlogged();
  end if;

  -- Once: a second stamp, even with another path, changes nothing.
  if inbox_decision_logged(v_o1, 'docs/inbox-decisions/other.md') then
    raise exception 'FAIL 2: a second log stamp on o1 returned true';
  end if;
  if (select decision_filed->>'log_path' from attention_items where id = v_o1) <> 'docs/inbox-decisions/2026-10-08.md' then
    raise exception 'FAIL 2: a second log stamp rewrote the path';
  end if;

  -- A row that has a note path and a log path already, one with no mark, and one skipped cannot be logged.
  if inbox_decision_logged(v_o3, 'docs/inbox-decisions/x.md') then
    raise exception 'FAIL 2: a fully filed row (o3) was stamped as logged';
  end if;
  if inbox_decision_logged(v_o4, 'docs/inbox-decisions/x.md') then
    raise exception 'FAIL 2: an unfiled row (o4) was stamped as logged';
  end if;
  if (select decision_filed_at from attention_items where id = v_o4) is not null then
    raise exception 'FAIL 2: logging an unfiled row marked it filed';
  end if;
  if inbox_decision_logged(-1, 'docs/inbox-decisions/x.md') then
    raise exception 'FAIL 2: inbox_decision_logged stamped a missing row';
  end if;
end $$;

-- =============================================================================================
-- 3. The skip
-- =============================================================================================
do $$
declare
  v_o4 bigint := (select id from _t187f where label = 'o4');
  v_o1 bigint := (select id from _t187f where label = 'o1');
  v_o2 bigint := (select id from _t187f where label = 'o2');
  v_o5 bigint := (select id from _t187f where label = 'o5');
  v_row record;
begin
  if not inbox_decision_skipped(v_o4, 'a test question of an acceptance run') then
    raise exception 'FAIL 3: inbox_decision_skipped did not mark o4';
  end if;
  select decision_filed_at, decision_filed into v_row from attention_items where id = v_o4;
  if v_row.decision_filed_at is null
     or v_row.decision_filed is distinct from jsonb_build_object('skipped', true, 'why', 'a test question of an acceptance run') then
    raise exception 'FAIL 3: after the skip o4 reads %', row_to_json(v_row);
  end if;
  if v_o4 = any (pg_temp.t187f_unfiled()) or v_o4 = any (pg_temp.t187f_unlogged()) then
    raise exception 'FAIL 3: a skipped row is on a list';
  end if;
  -- Once, and only a row nothing was filed for.
  if inbox_decision_skipped(v_o4, 'again') then
    raise exception 'FAIL 3: a second skip on o4 returned true';
  end if;
  if inbox_decision_skipped(v_o1, 'why') or inbox_decision_skipped(v_o2, 'why') then
    raise exception 'FAIL 3: a row that already has a note path was skipped';
  end if;
  if inbox_decision_filed(v_o4, '{"note_path":"x"}'::jsonb) then
    raise exception 'FAIL 3: a skipped row was marked filed';
  end if;
  if inbox_decision_logged(v_o4, 'docs/x.md') then
    raise exception 'FAIL 3: a skipped row was stamped as logged';
  end if;
  -- The three rows that no list may carry cannot be skipped either.
  if inbox_decision_skipped((select id from _t187f where label = 'old'), 'why')
     or inbox_decision_skipped((select id from _t187f where label = 'answered'), 'why')
     or inbox_decision_skipped((select id from _t187f where label = 'open'), 'why')
     or inbox_decision_skipped(-1, 'why') then
    raise exception 'FAIL 3: a row that is not an archived inbox-decision/1 row was skipped';
  end if;
  -- And o5, left alone, is still the one unfiled row of this unit besides the unlogged ones.
  if pg_temp.t187f_unfiled() <> array[v_o5] then
    raise exception 'FAIL 3: unfiled is %, expected o5 alone', pg_temp.t187f_unfiled();
  end if;
end $$;

-- =============================================================================================
-- 4. Refusals
-- =============================================================================================
do $$
declare
  v_o5 bigint := (select id from _t187f where label = 'o5');
  v_o2 bigint := (select id from _t187f where label = 'o2');
  v_case record;
  v_state text;
  v_raised boolean;
begin
  -- inbox_decision_filed: 182's five refusals, and the ones the new rule adds.
  for v_case in
    select * from (values
      ('null',                  null::jsonb),
      ('an array',              '[]'::jsonb),
      ('no note_path',          '{"log_path":"x"}'::jsonb),
      ('a null note_path',      '{"note_path":null}'::jsonb),
      ('a blank note_path',     '{"note_path":" "}'::jsonb),
      ('a blank log_path',      '{"note_path":"x","log_path":" "}'::jsonb),
      ('an empty log_path',     '{"note_path":"x","log_path":""}'::jsonb),
      ('a numeric log_path',    '{"note_path":"x","log_path":1}'::jsonb),
      ('an object log_path',    '{"note_path":"x","log_path":{}}'::jsonb),
      ('a numeric note_path',   '{"note_path":1,"log_path":"x"}'::jsonb)
    ) t(label, filed)
  loop
    v_raised := false;
    begin
      perform inbox_decision_filed(v_o5, v_case.filed);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '22023';
    end;
    if not v_raised then
      raise exception 'FAIL 4: inbox_decision_filed accepted %', v_case.label;
    end if;
  end loop;
  if (select decision_filed_at from attention_items where id = v_o5) is not null then
    raise exception 'FAIL 4: a refused mark changed o5';
  end if;

  -- inbox_decision_logged and inbox_decision_skipped.
  for v_case in
    select * from (values
      ('a null log path',    'logged',  null::text),
      ('a blank log path',   'logged',  '  '),
      ('an empty log path',  'logged',  ''),
      ('a null why',         'skipped', null),
      ('a blank why',        'skipped', ' '),
      ('an empty why',       'skipped', '')
    ) t(label, fn, arg)
  loop
    v_raised := false;
    begin
      if v_case.fn = 'logged' then
        perform inbox_decision_logged(v_o2, v_case.arg);
      else
        perform inbox_decision_skipped(v_o5, v_case.arg);
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '22023';
    end;
    if not v_raised then
      raise exception 'FAIL 4: % was accepted', v_case.label;
    end if;
  end loop;
  if (select decision_filed_at from attention_items where id = v_o5) is not null
     or (select coalesce(jsonb_typeof(decision_filed->'log_path'), 'null') from attention_items where id = v_o2) <> 'null' then
    raise exception 'FAIL 4: a refused call changed a row';
  end if;
end $$;

-- =============================================================================================
-- 5. Rows that are not archived inbox-decision/1 rows
-- =============================================================================================
do $$
declare
  v_old bigint := (select id from _t187f where label = 'old');
  v_ans bigint := (select id from _t187f where label = 'answered');
  v_open bigint := (select id from _t187f where label = 'open');
  v_id bigint;
  v_filed jsonb := '{"note_path":"x"}';
begin
  foreach v_id in array array[v_old, v_ans, v_open, -1] loop
    if inbox_decision_filed(v_id, v_filed) then
      raise exception 'FAIL 5: inbox_decision_filed stamped row %', v_id;
    end if;
  end loop;
  if exists (select 1 from inbox_decisions_unlogged(500) u where u.ref in ('test187f:old', 'test187f:answered', 'test187f:open'))
     or exists (select 1 from inbox_decisions_unfiled(500) u where u.ref in ('test187f:old', 'test187f:answered', 'test187f:open')) then
    raise exception 'FAIL 5: a row that is not an archived inbox-decision/1 row is on a list';
  end if;
  -- The limit is clamped as inbox_decisions_unfiled's is.
  if (select count(*) from inbox_decisions_unlogged(0)) > 1 or (select count(*) from inbox_decisions_unlogged(-5)) > 1 then
    raise exception 'FAIL 5: the limit of inbox_decisions_unlogged is not clamped';
  end if;
  if (select count(*) from inbox_decisions_unlogged(null)) < 1 then
    raise exception 'FAIL 5: a null limit did not mean the default';
  end if;
end $$;

-- =============================================================================================
-- 6. The role Claude writes as, and the app's login, cannot touch any of them
-- =============================================================================================
do $$
declare
  v_o5 bigint := (select id from _t187f where label = 'o5');
  v_stmt text;
  v_role text;
  v_state text;
  v_raised boolean;
begin
  foreach v_role in array array['inbox_apply_runner', 'authenticated', 'anon', 'sync_runner'] loop
    foreach v_stmt in array array[
      'select count(*) from inbox_decisions_unfiled(1)',
      'select count(*) from inbox_decisions_unlogged(1)',
      format('select inbox_decision_filed(%s, ''{"note_path":"x"}''::jsonb)', v_o5),
      format('select inbox_decision_logged(%s, ''x'')', v_o5),
      format('select inbox_decision_skipped(%s, ''x'')', v_o5)] loop
      v_raised := false;
      begin
        execute format('set local role %I', v_role);
        execute v_stmt;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate;
        v_raised := v_state = '42501';
      end;
      reset role;
      if not v_raised then
        raise exception 'FAIL 6: % was not refused: %', v_role, v_stmt;
      end if;
    end loop;
  end loop;
  if (select decision_filed_at from attention_items where id = v_o5) is not null then
    raise exception 'FAIL 6: o5 was marked';
  end if;
end $$;

-- =============================================================================================
-- 7. The test item of the cut-over run
-- =============================================================================================
-- Migration 187 marks item 3782 skipped, with no note and no day-file entry, when that row is an
-- archived inbox-decision/1 row. On a database without it the migration does nothing, so this case
-- reads the row only when it exists.
do $$
declare
  v_row record;
begin
  select i.state, i.decision->>'schema' as schema, i.decision_filed_at, i.decision_filed
    into v_row from attention_items i where i.id = 3782;
  if found and v_row.state = 'archived' and v_row.schema = 'inbox-decision/1' then
    if v_row.decision_filed_at is null or (v_row.decision_filed->>'skipped') is distinct from 'true'
       or v_row.decision_filed ? 'note_path' or v_row.decision_filed ? 'log_path' then
      raise exception 'FAIL 7: item 3782 is not marked skipped with no path: %', row_to_json(v_row);
    end if;
    if exists (select 1 from inbox_decisions_unfiled(500) u where u.id = 3782)
       or exists (select 1 from inbox_decisions_unlogged(500) u where u.id = 3782) then
      raise exception 'FAIL 7: item 3782 is on a list';
    end if;
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_187_decision_filing: PASS' as result, current_user as ran_as;

rollback;
