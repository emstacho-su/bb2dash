-- bb2dash :: db/tests/inbox_apply_090_attention_archive.sql
-- Inbox feedback loop, automation half. Tests migration 090:
--   * archive_attention_item() moves a resolved row and a dismissed row to `archived`, stamps
--     archived_at / archived_by / decision, and returns the row;
--   * it refuses an open row, an already-archived row, a non-object decision and a blank worker;
--   * a kept conflict that has been archived still satisfies attention_keep_stands(), so
--     raise_attention() does not re-raise it while Blackboard's value is unchanged, and DOES
--     raise it once the value moves;
--   * an archived missing/data_gap key still counts as answered (attention_answered);
--   * v_inbox_queue lists resolved and dismissed rows, drops archived ones, and needs no note;
--   * the state check rejects an unknown state; anon cannot read the view or run the function.
--
-- RUN IT: paste the whole file into one `execute_sql` call, or `psql "$DATABASE_URL" -f <file>`.
-- A failing assertion raises; a pass ends with one summary row. Every row this file inserts is
-- synthetic (course_id null, ref prefixed test090:); its last statement is `rollback`, so none
-- of it survives.

begin;

do $$
declare
  v_res  bigint; v_dis bigint; v_open bigint; v_keep bigint;
  v_row  attention_items;
  v_before int; v_after int;
  v_raised boolean;
  v_bb jsonb := to_jsonb('Robert Test'::text);
begin
  -- =========================================================================================
  -- Fixture: one resolved (no note), one dismissed, one open, one kept conflict
  -- =========================================================================================
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution)
  values ('stack_must_confirm', 'assignment', 'test090:resolved', '090 resolved', 'resolved', now(),
          '{"value":"yes","value_type":"text"}')
  returning id into v_res;
  insert into attention_items (kind, entity, ref, question, state, resolved_at, resolution, resolution_note)
  values ('data_gap', 'bb_file', 'test090:dismissed', '090 dismissed', 'dismissed', now(),
          '{"dismissed":true}', 'not a real gap')
  returning id into v_dis;
  insert into attention_items (kind, entity, ref, question)
  values ('missing', 'assignment', 'test090:open', '090 open')
  returning id into v_open;
  insert into attention_items (kind, entity, ref, field, to_value, question, state, resolved_at, resolution)
  values ('conflict', 'course_staff', 'staff:test090', 'name', v_bb, '090 keep', 'resolved', now(),
          '{"accept":"keep"}')
  returning id into v_keep;

  -- =========================================================================================
  -- A. The queue lists the two closed rows (note or not) and not the open one
  -- =========================================================================================
  select count(*) into v_before from v_inbox_queue where ref like 'test090:%' or ref = 'staff:test090';
  if v_before <> 3 then
    raise exception 'FAIL v_inbox_queue should list 3 closed fixture rows, listed %', v_before;
  end if;
  if exists (select 1 from v_inbox_queue where id = v_open) then
    raise exception 'FAIL v_inbox_queue listed an open row';
  end if;
  if (select has_note from v_inbox_queue where id = v_res) then
    raise exception 'FAIL has_note is true for a row with no note';
  end if;

  -- =========================================================================================
  -- B. Archiving a resolved row and a dismissed row
  -- =========================================================================================
  v_row := archive_attention_item(v_res, '{"change":"confirmed","rule":"test"}', 'inbox-apply test');
  if v_row.state <> 'archived' or v_row.archived_at is null
     or v_row.archived_by <> 'inbox-apply test' or v_row.decision->>'change' <> 'confirmed' then
    raise exception 'FAIL archive_attention_item did not stamp the resolved row: %', to_jsonb(v_row);
  end if;
  v_row := archive_attention_item(v_dis, '{"change":"recorded only"}');
  if v_row.state <> 'archived' or v_row.archived_by <> 'inbox-apply' then
    raise exception 'FAIL archive_attention_item did not archive the dismissed row (default by)';
  end if;

  select count(*) into v_after from v_inbox_queue where ref like 'test090:%' or ref = 'staff:test090';
  if v_after <> 1 then
    raise exception 'FAIL archived rows should leave v_inbox_queue; % left', v_after;
  end if;

  -- =========================================================================================
  -- C. Refusals
  -- =========================================================================================
  begin
    perform archive_attention_item(v_open, '{"change":"x"}');
    raise exception 'FAIL an open row was archived';
  exception when no_data_found then null;
  end;
  begin
    perform archive_attention_item(v_res, '{"change":"again"}');
    raise exception 'FAIL an archived row was archived twice';
  exception when no_data_found then null;
  end;
  begin
    perform archive_attention_item(v_keep, '"not an object"'::jsonb);
    raise exception 'FAIL a non-object decision was accepted';
  exception when check_violation then null;
  end;
  begin
    perform archive_attention_item(v_keep, '{"change":"x"}', '  ');
    raise exception 'FAIL a blank worker name was accepted';
  exception when check_violation then null;
  end;
  begin
    update attention_items set state = 'bogus' where id = v_open;
    raise exception 'FAIL the state check accepted bogus';
  exception when check_violation then null;
  end;

  -- =========================================================================================
  -- D. A kept conflict stays kept after archiving; a moved value is raised again
  -- =========================================================================================
  perform archive_attention_item(v_keep, '{"change":"recorded only","rule":"same person"}');
  if not attention_keep_stands(null, 'staff:test090', 'name', v_bb) then
    raise exception 'FAIL attention_keep_stands is false for an archived keep';
  end if;
  v_raised := raise_attention(null, 'conflict', null, 'course_staff', 'staff:test090', 'name',
                              to_jsonb('Bob Test'::text), v_bb, '090 re-raise?', null);
  if v_raised then
    raise exception 'FAIL raise_attention re-raised a kept, archived conflict with an unchanged value';
  end if;
  v_raised := raise_attention(null, 'conflict', null, 'course_staff', 'staff:test090', 'name',
                              to_jsonb('Bob Test'::text), to_jsonb('R. Test'::text), '090 moved', null);
  if not v_raised then
    raise exception 'FAIL raise_attention did not raise a conflict whose Blackboard value moved';
  end if;

  -- =========================================================================================
  -- E. An archived gap still counts as answered
  -- =========================================================================================
  if not attention_answered('data_gap', null, 'test090:dismissed', null) then
    raise exception 'FAIL attention_answered is false for an archived dismissal';
  end if;
  v_raised := raise_attention(null, 'data_gap', null, 'bb_file', 'test090:dismissed', null,
                              null, null, '090 re-ask?', null);
  if v_raised then
    raise exception 'FAIL raise_attention re-asked an archived dismissal';
  end if;

  -- =========================================================================================
  -- F. Privileges
  -- =========================================================================================
  if has_table_privilege('anon', 'public.v_inbox_queue', 'select') then
    raise exception 'FAIL v_inbox_queue is readable by anon';
  end if;
  if has_function_privilege('anon', 'archive_attention_item(bigint, jsonb, text)', 'execute') then
    raise exception 'FAIL archive_attention_item is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'archive_attention_item(bigint, jsonb, text)', 'execute') then
    raise exception 'FAIL archive_attention_item is not executable by authenticated';
  end if;
end $$;

select 'inbox_apply_090_attention_archive: PASS' as result,
       (select count(*) from attention_items where state = 'archived') as archived_rows_in_txn;

rollback;
