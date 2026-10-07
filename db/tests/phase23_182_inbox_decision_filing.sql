-- bb2dash :: db/tests/phase23_182_inbox_decision_filing.sql
-- Phase 23 (Inbox auto-apply; DECISIONS 2026-10-07). Tests migration 182:
--
--   0. installed: the two columns, the constraint, two invoker-rights functions for service_role
--   1. inbox_decisions_unfiled lists an archived inbox-decision/1 row and never a row archived the
--      old way, an open row or an answered row; oldest first; the limit is clamped
--   2. inbox_decision_filed stamps a row once, and refuses a malformed p_filed
--   3. it never stamps a row that is not an archived inbox-decision/1 row
--   4. the marker cannot sit on a row that is not archived (the check constraint)
--   5. inbox_apply_runner can call neither function
--
-- RUN IT: `node scripts/db-test.mjs --only phase23_182_inbox_decision_filing.sql`. NOTHING IS COMMITTED.

begin;

create temp table _t182 (label text primary key, id bigint) on commit drop;

-- =============================================================================================
-- 0. Installed
-- =============================================================================================
do $$
declare
  v_fail text[] := '{}';
  f text;
begin
  if to_regprocedure('public.inbox_decisions_unfiled(integer)') is null
     or to_regprocedure('public.inbox_decision_filed(bigint, jsonb)') is null then
    raise exception 'FAIL phase23_182: migration 182 is not applied';
  end if;
  foreach f in array array['public.inbox_decisions_unfiled(integer)',
                           'public.inbox_decision_filed(bigint, jsonb)'] loop
    if (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      v_fail := v_fail || format('%s is security definer', f);
    end if;
    if not has_function_privilege('service_role', f, 'execute')
       or has_function_privilege('anon', f, 'execute')
       or has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('inbox_apply_runner', f, 'execute')
       or has_function_privilege('sync_runner', f, 'execute') then
      v_fail := v_fail || format('%s is not service_role''s alone', f);
    end if;
    if obj_description(f::regprocedure, 'pg_proc') is null then
      v_fail := v_fail || format('%s has no comment', f);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.attention_items'::regclass
                    and conname = 'attention_items_decision_filed_archived') then
    v_fail := v_fail || 'the decision_filed_archived check is missing'::text;
  end if;
  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase23_182 (shape): %', array_to_string(v_fail, '; ');
  end if;
end $$;

-- =============================================================================================
-- Fixture: two archived inbox-decision/1 rows (B older than A), one archived the old way, one
-- answered, one open
-- =============================================================================================
do $$
declare v_a bigint; v_b bigint; v_old bigint; v_ans bigint; v_open bigint;
begin
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note,
                               archived_at, archived_by, decision)
  values ('stack_must_confirm', 'assignment', 'test182:a', '182 A', 'archived', now(), '{"value":"yes"}', 'add it',
          now() - interval '1 minute', 'inbox-apply request 1',
          '{"schema":"inbox-decision/1","item":1,"request":1,"mode":"unattended","bucket":"needs_change","change":"confirmed","rule":"precedent"}')
  returning id into v_a;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution,
                               archived_at, archived_by, decision)
  values ('data_gap', 'bb_file', 'test182:b', '182 B', 'archived', now(), '{"dismissed":true}',
          now() - interval '2 minutes', 'inbox-apply request 1',
          '{"schema":"inbox-decision/1","item":2,"request":1,"mode":"unattended","bucket":"dismissed","change":"recorded only","rule":""}')
  returning id into v_b;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution,
                               archived_at, archived_by, decision)
  values ('stack_must_confirm', 'assignment', 'test182:old', '182 old', 'archived', now(), '{"value":"yes"}',
          now() - interval '3 minutes', 'inbox-apply request 0',
          '{"change":"confirmed","rule":"old","note_id":"bb2dash-inbox-decision-0"}')
  returning id into v_old;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test182:answered', '182 answered', 'resolved', now(), '{"value":"yes"}')
  returning id into v_ans;
  insert into attention_items (kind, entity, ref, question)
  values ('missing', 'assignment', 'test182:open', '182 open')
  returning id into v_open;
  insert into _t182 values ('a', v_a), ('b', v_b), ('old', v_old), ('answered', v_ans), ('open', v_open);
end $$;

-- =============================================================================================
-- 1. The read
-- =============================================================================================
do $$
declare
  v_a bigint := (select id from _t182 where label = 'a');
  v_b bigint := (select id from _t182 where label = 'b');
  v_ids bigint[];
  v_row record;
begin
  select array_agg(u.id order by u.archived_at, u.id) into v_ids
    from inbox_decisions_unfiled(500) u where u.ref like 'test182:%';
  if v_ids is distinct from array[v_b, v_a] then
    raise exception 'FAIL 1: inbox_decisions_unfiled listed %, expected B then A (%)', v_ids, array[v_b, v_a];
  end if;

  select u.question, u.resolution_note, u.archived_by, u.decision->>'change' as change into v_row
    from inbox_decisions_unfiled(500) u where u.id = v_a;
  if v_row.question <> '182 A' or v_row.resolution_note <> 'add it'
     or v_row.archived_by <> 'inbox-apply request 1' or v_row.change <> 'confirmed' then
    raise exception 'FAIL 1: the row for A reads %', row_to_json(v_row);
  end if;

  -- The limit is clamped to 1..500, and null means the default.
  if (select count(*) from inbox_decisions_unfiled(0)) <> 1
     or (select count(*) from inbox_decisions_unfiled(-5)) <> 1
     or (select count(*) from inbox_decisions_unfiled(null)) < 2 then
    raise exception 'FAIL 1: the limit is not clamped';
  end if;
end $$;

-- =============================================================================================
-- 2 and 3. The stamp
-- =============================================================================================
do $$
declare
  v_a bigint := (select id from _t182 where label = 'a');
  v_case record;
  v_ok boolean;
  v_state text;
  v_raised boolean;
  v_filed jsonb := '{"note_path":"projects/bb2dash/decisions/inbox-1.md","log_path":"docs/inbox-decisions/2026-10-07.md","ingested":true}';
  v_row record;
begin
  for v_case in
    select * from (values
      ('null',            null::jsonb),
      ('an array',        '[]'::jsonb),
      ('no note_path',    '{"log_path":"x"}'::jsonb),
      ('a blank log_path','{"note_path":"x","log_path":" "}'::jsonb),
      ('a numeric path',  '{"note_path":1,"log_path":"x"}'::jsonb)
    ) t(label, filed)
  loop
    v_raised := false;
    begin
      perform inbox_decision_filed(v_a, v_case.filed);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '22023';
    end;
    if not v_raised then
      raise exception 'FAIL 2: inbox_decision_filed accepted %', v_case.label;
    end if;
  end loop;

  v_ok := inbox_decision_filed(v_a, v_filed);
  select decision_filed_at, decision_filed, decision->>'change' as change into v_row
    from attention_items where id = v_a;
  if not v_ok or v_row.decision_filed_at is null or v_row.decision_filed <> v_filed or v_row.change <> 'confirmed' then
    raise exception 'FAIL 2: after the stamp A reads %', row_to_json(v_row);
  end if;
  if inbox_decision_filed(v_a, v_filed) then
    raise exception 'FAIL 2: a second stamp on A returned true';
  end if;
  if exists (select 1 from inbox_decisions_unfiled(500) u where u.id = v_a) then
    raise exception 'FAIL 2: a filed row is still listed';
  end if;

  for v_case in
    select * from (values ('old'), ('answered'), ('open')) t(label)
  loop
    if inbox_decision_filed((select id from _t182 where label = v_case.label), v_filed) then
      raise exception 'FAIL 3: inbox_decision_filed stamped the % row', v_case.label;
    end if;
  end loop;
  if inbox_decision_filed(-1, v_filed) then
    raise exception 'FAIL 3: inbox_decision_filed stamped a missing row';
  end if;
end $$;

-- =============================================================================================
-- 4. The marker needs an archived row
-- =============================================================================================
do $$
declare
  v_open bigint := (select id from _t182 where label = 'open');
  v_raised boolean := false;
begin
  begin
    update attention_items set decision_filed_at = now() where id = v_open;
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL 4: decision_filed_at was set on an open row';
  end if;
end $$;

-- =============================================================================================
-- 5. The role Claude writes as cannot touch the marker
-- =============================================================================================
do $$
declare
  v_b bigint := (select id from _t182 where label = 'b');
  v_stmt text;
  v_state text;
  v_raised boolean;
begin
  foreach v_stmt in array array[
    'select count(*) from inbox_decisions_unfiled(1)',
    format('select inbox_decision_filed(%s, ''{"note_path":"x","log_path":"y"}''::jsonb)', v_b),
    format('update attention_items set decision_filed_at = now() where id = %s', v_b)] loop
    v_raised := false;
    begin
      set local role inbox_apply_runner;
      execute v_stmt;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      v_raised := v_state = '42501';
    end;
    reset role;
    if not v_raised then
      raise exception 'FAIL 5: inbox_apply_runner was not refused: %', v_stmt;
    end if;
  end loop;
  if (select decision_filed_at from attention_items where id = v_b) is not null then
    raise exception 'FAIL 5: B was marked filed';
  end if;
end $$;

-- =============================================================================================
-- Pass
-- =============================================================================================
select 'phase23_182_inbox_decision_filing: PASS' as result, current_user as ran_as;

rollback;
