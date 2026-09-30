-- bb2dash :: db/tests/phase17_114_close_cleared_gaps.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-07. Worker W-44.
-- Tests migration 114: stage_gaps questions close themselves when the fact arrives.
--
--   A. an open storage_path gap whose file gets a storage_path by a plain UPDATE is archived at
--      once by the bb_files trigger: archived_by 'stage_gaps', decision.closed_itself true,
--      trigger 'bb_files_update'; attention_answered for that key is then false
--   B. the same key closing itself again within 24 h stays open, flagged
--      suggested.reopened_within_24h, and a later call neither closes nor re-flags it
--   C. a key Stack answered (archived by /inbox-apply, no closed_itself) still counts as answered,
--      and stage_gaps does not raise it again
--   D. archive_attention_item on an open row still raises
--   E. the other three conditions (reading dated, grading scheme recorded, assignment dated)
--      close on stage_gaps, with trigger 'fold', the fold's sync_run_id and counts.gaps_closed
--   F. no browser role can execute close_cleared_gaps or the trigger function
--
-- Every fixture is a row this file seeds; existing prod rows are only read (a dated assignment
-- and a course with a grading scheme, chosen so that no machine-closed row for their key exists
-- in the last 24 hours). RUN IT: `node scripts/db-test.mjs --only phase17_114_close_cleared_gaps.sql`,
-- or paste the whole file into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail   text[] := '{}';
  v_course constant text := 'IST.352';
  v_f1     bigint;
  v_a1     bigint;
  v_a2     bigint;
  v_rd1    bigint;
  v_rd2    bigint;
  v_a3     bigint;
  v_a4     bigint;
  v_a5     bigint;
  v_gs     text;
  v_asg    record;
  v_sr     bigint;
  v_r      jsonb;
  v_row    attention_items;
  v_raised boolean;
begin
  if to_regprocedure('public.close_cleared_gaps(bigint,text)') is null
     or not exists (select 1 from pg_trigger
                     where tgrelid = 'public.bb_files'::regclass
                       and tgname = 'bb_files_close_cleared_gaps_trg') then
    raise exception 'FAIL phase17_114: close_cleared_gaps or bb_files_close_cleared_gaps_trg does not exist';
  end if;

  -- -------------------------------------------------------------------------------------------
  -- A. storage_path lands by UPDATE -> the gap closes itself
  -- -------------------------------------------------------------------------------------------
  insert into bb_files (bb_course_id, course_id, path, file_name, source_url, bucket)
  values ('_w44_114', v_course, 'W44 / 114', 'w44_114.pdf', 'https://example.invalid/w44_114', 'readings')
  returning id into v_f1;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('data_gap', v_course, 'bb_file', v_f1::text, 'storage_path', 'W44 114 case A',
          '{"source": "stage_gaps"}'::jsonb)
  returning id into v_a1;

  update bb_files set storage_path = 'bb-files/w44/114a.pdf' where id = v_f1;

  select * into v_row from attention_items where id = v_a1;
  if v_row.state is distinct from 'archived' or v_row.archived_by is distinct from 'stage_gaps'
     or v_row.archived_at is null
     or v_row.decision->>'closed_itself' is distinct from 'true'
     or v_row.decision->>'rule' is distinct from 'file_stored_or_superseded'
     or v_row.decision->>'trigger' is distinct from 'bb_files_update' then
    v_fail := v_fail || format('A: storage_path gap after UPDATE is state %s, by %s, decision %s',
                               v_row.state, v_row.archived_by, v_row.decision);
  end if;
  if attention_answered('data_gap', v_course, v_f1::text, 'storage_path') then
    v_fail := v_fail || 'A: attention_answered is true for a machine-closed key'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- B. the hole reopens and closes again within 24 h -> stays open, flagged, once
  -- -------------------------------------------------------------------------------------------
  update bb_files set storage_path = null where id = v_f1;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('data_gap', v_course, 'bb_file', v_f1::text, 'storage_path', 'W44 114 case B',
          '{"source": "stage_gaps"}'::jsonb)
  returning id into v_a2;
  update bb_files set storage_path = 'bb-files/w44/114b.pdf' where id = v_f1;

  select * into v_row from attention_items where id = v_a2;
  if v_row.state is distinct from 'open' or v_row.suggested->>'reopened_within_24h' is distinct from 'true' then
    v_fail := v_fail || format('B: a second self-close within 24 h left state %s, suggested %s',
                               v_row.state, v_row.suggested);
  end if;

  v_r := close_cleared_gaps(null, 'w44_test');
  if not (v_r ? 'closed' and v_r ? 'flagged') then
    v_fail := v_fail || format('B: close_cleared_gaps returned %s', v_r);
  end if;
  if (v_r->>'flagged')::int <> 0 then
    v_fail := v_fail || format('B: an already flagged row was flagged again (%s)', v_r);
  end if;
  if (select state from attention_items where id = v_a2) is distinct from 'open' then
    v_fail := v_fail || 'B: a flagged row was machine-closed on a later call'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- C. a key Stack answered still counts
  -- -------------------------------------------------------------------------------------------
  insert into readings (course_id, citation) values (v_course, 'W44 114 dismissed reading')
  returning id into v_rd1;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested, state,
                               resolved_at, archived_at, archived_by, decision)
  values ('data_gap', v_course, 'reading', v_rd1::text, 'for_date', 'W44 114 case C',
          '{"source": "stage_gaps"}'::jsonb, 'archived', now(), now(), 'inbox-apply request w44',
          '{"why": "W44 fixture: Stack dismissed this"}'::jsonb);
  if not attention_answered('data_gap', v_course, v_rd1::text, 'for_date') then
    v_fail := v_fail || 'C: attention_answered is false for a key Stack answered'::text;
  end if;
  -- And every closed row already on prod that the machine did not close still counts.
  if exists (select 1 from attention_items ai
              where ai.state <> 'open'
                and ai.decision->>'closed_itself' is distinct from 'true'
                and not attention_answered(ai.kind, ai.course_id, ai.ref, ai.field)) then
    v_fail := v_fail || 'C: a closed row Stack answered no longer counts as answered'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- D. archive_attention_item still refuses an open row
  -- -------------------------------------------------------------------------------------------
  v_raised := false;
  begin
    perform archive_attention_item(v_a2, '{"why": "W44"}'::jsonb, 'w44');
  exception when no_data_found then
    v_raised := true;
  end;
  if not v_raised then
    v_fail := v_fail || 'D: archive_attention_item archived an open row'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- E. the other three conditions close on stage_gaps
  -- -------------------------------------------------------------------------------------------
  insert into readings (course_id, citation, for_date) values (v_course, 'W44 114 dated reading', date '2026-10-01')
  returning id into v_rd2;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('data_gap', v_course, 'reading', v_rd2::text, 'for_date', 'W44 114 case E reading',
          '{"source": "stage_gaps"}'::jsonb)
  returning id into v_a3;

  select g.course_id into v_gs from grading_schemes g
   where not exists (select 1 from attention_items ai
                      where ai.kind = 'missing' and ai.ref = g.course_id and ai.field = 'grading_scheme'
                        and (ai.state = 'open'
                             or (ai.decision->>'closed_itself' = 'true'
                                 and ai.archived_at > now() - interval '24 hours')))
   order by g.course_id limit 1;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('missing', v_gs, 'course', v_gs, 'grading_scheme', 'W44 114 case E scheme',
          '{"source": "stage_gaps"}'::jsonb)
  returning id into v_a4;

  select a.id, a.course_id into v_asg from assignments a
   where a.due_at is not null
     and not exists (select 1 from attention_items ai
                      where ai.kind = 'missing' and ai.ref = a.id and ai.field = 'due_at'
                        and (ai.state = 'open'
                             or (ai.decision->>'closed_itself' = 'true'
                                 and ai.archived_at > now() - interval '24 hours')))
   order by a.id limit 1;
  insert into attention_items (kind, course_id, entity, ref, field, question, suggested)
  values ('missing', v_asg.course_id, 'assignment', v_asg.id, 'due_at', 'W44 114 case E assignment',
          '{"source": "stage_gaps"}'::jsonb)
  returning id into v_a5;

  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)
  values ('00000000-0114-4000-8000-000000000044', 'ok', now(), now(), 'manual', 'blackboard', 'all')
  returning id into v_sr;

  v_r := stage_gaps('00000000-0114-4000-8000-000000000044', v_sr);
  if v_r->>'status' is distinct from 'ok' then
    v_fail := v_fail || format('E: stage_gaps returned %s', v_r);
  elsif coalesce((v_r->'counts'->>'gaps_closed')::int, 0) < 3 then
    v_fail := v_fail || format('E: stage_gaps counts.gaps_closed is %s, expected at least 3',
                               v_r->'counts'->>'gaps_closed');
  end if;

  if exists (select 1 from attention_items
              where id in (v_a3, v_a4, v_a5)
                and (state <> 'archived' or archived_by is distinct from 'stage_gaps'
                     or decision->>'closed_itself' is distinct from 'true'
                     or decision->>'trigger' is distinct from 'fold'
                     or (decision->>'sync_run_id')::bigint is distinct from v_sr)) then
    v_fail := v_fail || format('E: not every cleared gap closed on the fold: %s',
      (select string_agg(format('%s=%s/%s', field, state, decision), ', ')
         from attention_items where id in (v_a3, v_a4, v_a5)));
  end if;
  if (select decision->>'rule' from attention_items where id = v_a3) is distinct from 'reading_dated'
     or (select decision->>'rule' from attention_items where id = v_a4) is distinct from 'grading_scheme_recorded'
     or (select decision->>'rule' from attention_items where id = v_a5) is distinct from 'assignment_dated' then
    v_fail := v_fail || 'E: a closed gap names the wrong rule'::text;
  end if;

  -- C, continued: the fold did not re-raise the key Stack answered.
  if exists (select 1 from attention_items
              where state = 'open' and kind = 'data_gap' and ref = v_rd1::text and field = 'for_date') then
    v_fail := v_fail || 'C: stage_gaps re-raised a key Stack answered'::text;
  end if;

  -- -------------------------------------------------------------------------------------------
  -- F. privileges
  -- -------------------------------------------------------------------------------------------
  if has_function_privilege('authenticated', 'public.close_cleared_gaps(bigint,text)', 'execute')
     or has_function_privilege('anon', 'public.close_cleared_gaps(bigint,text)', 'execute') then
    v_fail := v_fail || 'F: a browser role can execute close_cleared_gaps'::text;
  end if;
  if has_function_privilege('authenticated', 'public.bb_files_close_cleared_gaps()', 'execute')
     or has_function_privilege('anon', 'public.bb_files_close_cleared_gaps()', 'execute') then
    v_fail := v_fail || 'F: a browser role can execute bb_files_close_cleared_gaps'::text;
  end if;
  if has_function_privilege('authenticated', 'public.stage_gaps(uuid,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.attention_answered(text,text,text,text)', 'execute') then
    v_fail := v_fail || 'F: authenticated can execute stage_gaps or attention_answered'::text;
  end if;
  if not has_function_privilege('service_role', 'public.close_cleared_gaps(bigint,text)', 'execute') then
    v_fail := v_fail || 'F: service_role cannot execute close_cleared_gaps'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_114: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_114_close_cleared_gaps: PASS'                                              as result,
       (select count(*) from attention_items
         where state = 'open' and suggested->>'source' = 'stage_gaps')                      as open_gaps_in_txn;

rollback;
