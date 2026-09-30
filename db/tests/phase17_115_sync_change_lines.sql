-- bb2dash :: db/tests/phase17_115_sync_change_lines.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-08. Worker W-44.
-- Tests migration 115: `sync_change_lines` speaks three more counts (auto_graded, linked
-- readings, files back in Blackboard), stays silent on the two steady-state counts (P-72), keeps
-- 051's "Nothing changed" rule, reads reading_links as jsonb without casting the object, and
-- keeps its grants and volatility.
--
-- Pure function calls; nothing is written. RUN IT:
-- `node scripts/db-test.mjs --only phase17_115_sync_change_lines.sql`, or paste the whole file
-- into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_out  jsonb;
begin
  v_out := sync_change_lines('{"gradebook":{"auto_graded":2},"files":{"reading_links":{"linked":2},"missing_cleared":1},"assignments":{"conflicts_settled":6,"shared_columns":1}}'::jsonb);
  if jsonb_array_length(v_out) <> 3 then
    v_fail := v_fail || format('three new counts gave %s sentence(s): %s', jsonb_array_length(v_out), v_out);
  end if;
  if not v_out @> '["2 assignment(s) marked graded because Blackboard posted a score"]'::jsonb then
    v_fail := v_fail || format('no auto_graded sentence in %s', v_out);
  end if;
  if not v_out @> '["2 reading(s) linked to their file"]'::jsonb then
    v_fail := v_fail || format('no reading_links sentence in %s', v_out);
  end if;
  if not v_out @> '["1 file(s) are back in Blackboard"]'::jsonb then
    v_fail := v_fail || format('no missing_cleared sentence in %s', v_out);
  end if;

  -- P-72: the steady-state counts alone say nothing changed (051's closing rule).
  if sync_change_lines('{"assignments":{"conflicts_settled":6,"shared_columns":1}}'::jsonb)
     is distinct from '["Nothing changed"]'::jsonb then
    v_fail := v_fail || 'steady-state counts produced a sentence'::text;
  end if;
  if sync_change_lines('{}'::jsonb) is distinct from '["Nothing changed"]'::jsonb then
    v_fail := v_fail || 'an empty stage map is not "Nothing changed"'::text;
  end if;

  -- Zero counts say nothing; a reading_links value that is not an object does not raise.
  if sync_change_lines('{"gradebook":{"auto_graded":0},"files":{"reading_links":{"linked":0},"missing_cleared":0}}'::jsonb)
     is distinct from '["Nothing changed"]'::jsonb then
    v_fail := v_fail || 'zero counts produced a sentence'::text;
  end if;
  if sync_change_lines('{"files":{"reading_links":5}}'::jsonb) is distinct from '["Nothing changed"]'::jsonb then
    v_fail := v_fail || 'a scalar reading_links produced a sentence'::text;
  end if;

  -- An older sentence still fires (051's body is intact).
  if not sync_change_lines('{"gradebook":{"scores_new":1},"gaps":{"attention_raised":2}}'::jsonb)
         @> '["1 new grade(s) posted", "2 gap(s) added to the Inbox"]'::jsonb then
    v_fail := v_fail || '051''s sentences no longer fire'::text;
  end if;

  if coalesce(obj_description('public.sync_change_lines(jsonb)'::regprocedure, 'pg_proc'), '')
     not like '%steady state%' then
    v_fail := v_fail || 'the P-72 convention is not in the function comment'::text;
  end if;
  if (select provolatile from pg_proc where oid = 'public.sync_change_lines(jsonb)'::regprocedure) <> 'i'
     or (select prosecdef from pg_proc where oid = 'public.sync_change_lines(jsonb)'::regprocedure) then
    v_fail := v_fail || 'sync_change_lines is no longer immutable and invoker'::text;
  end if;
  if not has_function_privilege('authenticated', 'public.sync_change_lines(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.sync_change_lines(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.sync_change_lines(jsonb)', 'execute') then
    v_fail := v_fail || 'sync_change_lines grants moved'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase17_115: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase17_115_sync_change_lines: PASS'                                            as result,
       sync_change_lines('{"gradebook":{"auto_graded":2},"files":{"reading_links":{"linked":2},"missing_cleared":1}}'::jsonb) as sample;

rollback;
