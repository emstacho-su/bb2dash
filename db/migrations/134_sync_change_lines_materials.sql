-- bb2dash :: 134_sync_change_lines_materials.sql
-- Phase 19 (docs/planning/sprint-2/briefs/99_PHASE19_content_history.md), task 10 (R-71).
-- Worker W-52.
--
-- HOW THIS WAS BUILT. `sync_change_lines` is re-created with `create or replace` from its LIVE
-- prod body, read with `select pg_get_functiondef('public.sync_change_lines(jsonb)'::regprocedure)`
-- on 2026-10-02: Phase 17's 115 (051 stays frozen). Its ACL that day was
-- `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`.
-- Every sentence is carried byte for byte except the two content-tree sentences, including
-- Phase 17's steady-state convention (P-72) and 051's closing "Nothing changed".
--
-- WHAT CHANGES. "N new item(s) in the course content tree" and "N content item(s) are no
-- longer in Blackboard" counted bb_content rows, so a folder, its document and the document's
-- file read as three anonymous items, and a crawl replayed out of order could say anything.
-- They are replaced, in the same place, by three sentences from the `history` stage that 135's
-- run_transform records (material_history_record, 132):
--   "N new material(s): A, B, C (+k more)"
--   "N material(s) changed: A, B, C (+k more)"
--   "N material(s) no longer in Blackboard: A, B, C (+k more)"
-- The names are the stage's `sample` titles for that change kind, in its order (files first),
-- at most three. With no usable name the sentence is the count alone. A sample that is not an
-- array, or an element that is not an object with a non-blank title, is ignored.
--
-- Still immutable and invoker, with search_path pinned; grants re-asserted as 051 set them,
-- and db_test_runner's execute (migration 100) re-asserted.

CREATE OR REPLACE FUNCTION public.sync_change_lines(p_stages jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb := '[]'::jsonb;
  n int;
  v_hist   jsonb;
  v_sample jsonb;
  v_kind   text;
  v_names  text[];
  v_line   text;
begin
  n := coalesce((p_stages->'courses'->>'courses_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('Course details changed for %s course(s)', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new staff member(s) from Blackboard', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s staff name disagreement(s) need your call', n)); end if;
  n := coalesce((p_stages->'courses'->>'courses_unresolved')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard shell(s) match no course here', n)); end if;

  -- 134: materials new, changed or gone in this crawl, named, from the history stage (132).
  -- Replaces 051's two content-tree sentences.
  v_hist := case when jsonb_typeof(p_stages->'history') = 'object'
                 then p_stages->'history' else '{}'::jsonb end;
  v_sample := case when jsonb_typeof(v_hist->'sample') = 'array'
                   then v_hist->'sample' else '[]'::jsonb end;
  foreach v_kind in array array['appeared', 'changed', 'vanished'] loop
    n := coalesce((v_hist->>v_kind)::int, 0);
    if n > 0 then
      select coalesce(array_agg(s.title order by s.ord), '{}'::text[]) into v_names
        from (select e->>'title' as title, x.ord
                from jsonb_array_elements(v_sample) with ordinality as x(e, ord)
               where jsonb_typeof(x.e) = 'object'
                 and x.e->>'change' = v_kind
                 and nullif(btrim(coalesce(x.e->>'title', '')), '') is not null
               order by x.ord
               limit 3) s;
      v_line := format(case v_kind
                         when 'appeared' then '%s new material(s)'
                         when 'changed'  then '%s material(s) changed'
                         else '%s material(s) no longer in Blackboard' end, n);
      if cardinality(v_names) > 0 then
        v_line := v_line || ': ' || array_to_string(v_names, ', ');
        if n > cardinality(v_names) then
          v_line := v_line || format(' (+%s more)', n - cardinality(v_names));
        end if;
      end if;
      v := v || to_jsonb(v_line);
    end if;
  end loop;

  n := coalesce((p_stages->'assignments'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new gradebook column(s) added as tentative assignments', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_filled')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s missing due date or point value filled in from Blackboard', n)); end if;
  n := coalesce((p_stages->'assignments'->>'fields_overwritten')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s tentative value(s) replaced by Blackboard''s', n)); end if;
  n := coalesce((p_stages->'assignments'->>'repointed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s assignment(s) re-pointed at a re-created Blackboard item', n)); end if;
  n := coalesce((p_stages->'assignments'->>'conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s disagreement(s) with Blackboard left for you to settle', n)); end if;
  n := coalesce((p_stages->'assignments'->>'out_of_term_dates')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard due date(s) fall outside the term and were not applied', n)); end if;
  n := coalesce((p_stages->'assignments'->>'resolutions_applied_blackboard')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_keep')::int, 0)
     + coalesce((p_stages->'assignments'->>'resolutions_applied_value')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s of your Inbox answers applied', n)); end if;

  -- Phase 10a. Blackboard's numbers, said in Stack's words. Nothing here is computed by bb2dash:
  -- scores_new and scores_changed count gradebook ITEM columns whose effectiveScore moved since
  -- the previous crawl, and files_catalogued counts submission files now in the catalog.
  n := coalesce((p_stages->'gradebook'->>'scores_new')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new grade(s) posted', n)); end if;
  n := coalesce((p_stages->'gradebook'->>'scores_changed')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s score(s) changed', n)); end if;
  -- 115: the status write 087 makes when Blackboard posts a score (reported, not added).
  n := coalesce((p_stages->'gradebook'->>'auto_graded')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s assignment(s) marked graded because Blackboard posted a score', n)); end if;
  n := coalesce((p_stages->'attempts'->>'files_catalogued')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s submission file(s) catalogued', n)); end if;

  n := coalesce((p_stages->'announcements'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new announcement(s)', n)); end if;
  n := coalesce((p_stages->'announcements'->>'updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s announcement(s) changed', n)); end if;

  n := coalesce((p_stages->'files'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new file(s) catalogued', n)); end if;
  n := coalesce((p_stages->'files'->>'source_url_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) were re-uploaded in Blackboard; the stored copy may be stale', n)); end if;
  n := coalesce((p_stages->'files'->>'marked_missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) are no longer in Blackboard', n)); end if;
  -- 115: files Blackboard lists again, and readings tied to their file. reading_links is an
  -- object ({linked, ...}); only its `linked` member is read, as jsonb.
  n := coalesce((p_stages->'files'->>'missing_cleared')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) are back in Blackboard', n)); end if;
  n := coalesce((p_stages->'files'->'reading_links'->>'linked')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s reading(s) linked to their file', n)); end if;
  n := coalesce((p_stages->'files'->>'session_scoped_skipped')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s file(s) had no durable link and were skipped', n)); end if;

  n := coalesce((p_stages->'gaps'->>'attention_raised')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s gap(s) added to the Inbox', n)); end if;

  if jsonb_array_length(v) = 0 then
    v := v || to_jsonb('Nothing changed'::text);
  end if;
  return v;
end $function$;

comment on function public.sync_change_lines(jsonb) is
  'Activity sentences for one sync (051; three counts added in 115: gradebook.auto_graded, '
  'files.reading_links.linked, files.missing_cleared; 134: the content-tree sentences replaced '
  'by three from the history stage, "N new material(s): A, B, C (+k more)", "N material(s) '
  'changed: ..." and "N material(s) no longer in Blackboard: ...", naming up to three sample '
  'titles). Convention (P-72): a count that repeats the same value on every fold is steady '
  'state and is not a change line, so assignments.conflicts_settled and '
  'assignments.shared_columns get no sentence. When no sentence fires the result is '
  '["Nothing changed"].';

revoke all on function public.sync_change_lines(jsonb) from public, anon;
grant execute on function public.sync_change_lines(jsonb) to authenticated, service_role;
grant execute on function public.sync_change_lines(jsonb) to db_test_runner;
