-- bb2dash :: db/tests/phase19_134_sync_change_lines.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), task 10. Worker W-52.
-- Tests migration 134: sync_change_lines names up to three materials per change kind, from
-- p_stages->'history' (R-71), and carries every other sentence unchanged.
--
-- Blocks:
--   (1) the brief's fixture: exactly "2 new material(s): A, B" and
--       "1 material(s) no longer in Blackboard: C"
--   (2) more items than names: "5 new material(s): A, B, C (+2 more)"; a changed line;
--       a count with no sample says the count alone; a fourth sample name is not printed
--   (3) the two content-tree sentences are gone: content.inserted and content.missing say nothing
--   (4) zeros, a missing history stage, and a sample that is not an array say nothing and do not
--       raise
--   (5) every other sentence, fired at once with a different count each, comes back word for
--       word and in order, with the three material lines where the content lines used to be
--   (6) still immutable and invoker, search_path pinned, the P-72 convention in the comment,
--       grants as 051 left them (authenticated and service_role yes, anon no)
--
-- Pure function calls; nothing is written. RUN IT:
-- `node scripts/db-test.mjs --only phase19_134_sync_change_lines.sql`, or paste the whole file
-- into one `execute_sql` call. The last statement is `rollback`.

begin;

do $$
declare
  v_fail text[] := '{}';
  v_out  jsonb;
  v_want jsonb;
begin
  -- (1)
  v_out := sync_change_lines('{"history":{"appeared":2,"changed":0,"vanished":1,"baseline_courses":0,"older_run":false,
    "sample":[{"change":"appeared","entity":"file","title":"A"},
              {"change":"appeared","entity":"content","title":"B"},
              {"change":"vanished","entity":"file","title":"C"}]}}'::jsonb);
  if v_out is distinct from '["2 new material(s): A, B", "1 material(s) no longer in Blackboard: C"]'::jsonb then
    v_fail := v_fail || format('(1) the brief''s fixture gave %s', v_out);
  end if;

  -- (2)
  v_out := sync_change_lines('{"history":{"appeared":5,"changed":1,"vanished":2,
    "sample":[{"change":"appeared","entity":"file","title":"A"},
              {"change":"appeared","entity":"file","title":"B"},
              {"change":"appeared","entity":"content","title":"C"},
              {"change":"appeared","entity":"content","title":"never printed"},
              {"change":"changed","entity":"file","title":"D"}]}}'::jsonb);
  if v_out is distinct from '["5 new material(s): A, B, C (+2 more)", "1 material(s) changed: D",
                              "2 material(s) no longer in Blackboard"]'::jsonb then
    v_fail := v_fail || format('(2) names and the remainder gave %s', v_out);
  end if;

  -- (3)
  if sync_change_lines('{"content":{"inserted":3,"missing":2,"updated":4}}'::jsonb)
     is distinct from '["Nothing changed"]'::jsonb then
    v_fail := v_fail || format('(3) the content stage still speaks: %s',
                               sync_change_lines('{"content":{"inserted":3,"missing":2,"updated":4}}'::jsonb));
  end if;

  -- (4)
  if sync_change_lines('{"history":{"appeared":0,"changed":0,"vanished":0,"sample":[]}}'::jsonb)
     is distinct from '["Nothing changed"]'::jsonb
     or sync_change_lines('{"history":{}}'::jsonb) is distinct from '["Nothing changed"]'::jsonb
     or sync_change_lines('{"history":null}'::jsonb) is distinct from '["Nothing changed"]'::jsonb then
    v_fail := v_fail || '(4) an empty history stage produced a sentence'::text;
  end if;
  if sync_change_lines('{"history":{"appeared":1,"sample":"not an array"}}'::jsonb)
     is distinct from '["1 new material(s)"]'::jsonb
     or sync_change_lines('{"history":{"appeared":1,"sample":[{"change":"appeared","title":""},{"change":"appeared"},7]}}'::jsonb)
     is distinct from '["1 new material(s)"]'::jsonb then
    v_fail := v_fail || '(4) a malformed sample was not ignored'::text;
  end if;

  -- (5)
  v_out := sync_change_lines('{
    "courses":{"courses_updated":1,"staff_inserted":2,"staff_conflicts":3,"courses_unresolved":4},
    "content":{"inserted":98,"missing":99},
    "history":{"appeared":5,"changed":6,"vanished":7,
               "sample":[{"change":"appeared","entity":"file","title":"new.pdf"},
                         {"change":"changed","entity":"content","title":"Week 3"},
                         {"change":"vanished","entity":"file","title":"old.pdf"}]},
    "assignments":{"inserted":8,"fields_filled":9,"fields_overwritten":10,"repointed":11,"conflicts":12,
                   "out_of_term_dates":13,"resolutions_applied_blackboard":1,"resolutions_applied_keep":2,
                   "resolutions_applied_value":11,"conflicts_settled":6,"shared_columns":1},
    "gradebook":{"scores_new":15,"scores_changed":16,"auto_graded":17},
    "attempts":{"files_catalogued":18},
    "announcements":{"inserted":19,"updated":20},
    "files":{"inserted":21,"source_url_updated":22,"marked_missing":23,"missing_cleared":24,
             "reading_links":{"linked":25},"session_scoped_skipped":26},
    "gaps":{"attention_raised":27}}'::jsonb);
  v_want := jsonb_build_array(
    'Course details changed for 1 course(s)',
    '2 new staff member(s) from Blackboard',
    '3 staff name disagreement(s) need your call',
    '4 Blackboard shell(s) match no course here',
    '5 new material(s): new.pdf (+4 more)',
    '6 material(s) changed: Week 3 (+5 more)',
    '7 material(s) no longer in Blackboard: old.pdf (+6 more)',
    '8 new gradebook column(s) added as tentative assignments',
    '9 missing due date or point value filled in from Blackboard',
    '10 tentative value(s) replaced by Blackboard''s',
    '11 assignment(s) re-pointed at a re-created Blackboard item',
    '12 disagreement(s) with Blackboard left for you to settle',
    '13 Blackboard due date(s) fall outside the term and were not applied',
    '14 of your Inbox answers applied',
    '15 new grade(s) posted',
    '16 score(s) changed',
    '17 assignment(s) marked graded because Blackboard posted a score',
    '18 submission file(s) catalogued',
    '19 new announcement(s)',
    '20 announcement(s) changed',
    '21 new file(s) catalogued',
    '22 file(s) were re-uploaded in Blackboard; the stored copy may be stale',
    '23 file(s) are no longer in Blackboard',
    '24 file(s) are back in Blackboard',
    '25 reading(s) linked to their file',
    '26 file(s) had no durable link and were skipped',
    '27 gap(s) added to the Inbox');
  if v_out is distinct from v_want then
    v_fail := v_fail || format('(5) every sentence at once gave %s', v_out);
  end if;

  -- (6)
  if (select provolatile <> 'i' or prosecdef or proconfig is distinct from array['search_path=public, pg_temp']
        from pg_proc where oid = 'public.sync_change_lines(jsonb)'::regprocedure) then
    v_fail := v_fail || '(6) sync_change_lines is no longer immutable, invoker and pinned'::text;
  end if;
  if coalesce(obj_description('public.sync_change_lines(jsonb)'::regprocedure, 'pg_proc'), '')
     not like '%steady state%' then
    v_fail := v_fail || '(6) the P-72 convention is not in the function comment'::text;
  end if;
  if not has_function_privilege('authenticated', 'public.sync_change_lines(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.sync_change_lines(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.sync_change_lines(jsonb)', 'execute') then
    v_fail := v_fail || '(6) sync_change_lines grants moved'::text;
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'FAIL phase19_134: %', array_to_string(v_fail, '; ');
  end if;
end $$;

select 'phase19_134_sync_change_lines: PASS'                                             as result,
       sync_change_lines('{"history":{"appeared":2,"vanished":1,"sample":[{"change":"appeared","title":"A"},{"change":"appeared","title":"B"},{"change":"vanished","title":"C"}]}}'::jsonb) as sample;

rollback;
