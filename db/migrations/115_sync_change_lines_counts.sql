-- bb2dash :: 115_sync_change_lines_counts.sql
-- Phase 17 (docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md), T-08 (R-58, P-72, B-30).
-- Worker W-44. 051 is byte-frozen; `sync_change_lines` is re-created here with `create or
-- replace` from its LIVE prod body (pg_get_functiondef, read 2026-09-29), with three sentences
-- added (marked "115") and nothing else changed. Phase 19's 134 re-creates it from this body.
--
-- The sync summary dropped five counts the stages already report. Three are changes Stack
-- would want to hear about, and get a sentence when above 0:
--   gradebook.auto_graded           assignments stage_gradebook marked graded (087's one
--                                   sanctioned planner write; this reports it, adds none)
--   files.reading_links -> linked   readings link_reading_files tied to their file; reading_links
--                                   is an object, so `linked` is read out of it as jsonb and the
--                                   object itself is never cast
--   files.missing_cleared           files Blackboard lists again after a missing mark
-- Two get no sentence, under the P-72 convention in the comment below:
-- assignments.conflicts_settled and assignments.shared_columns.
-- 051's closing rule stands: no sentence at all returns ["Nothing changed"].

CREATE OR REPLACE FUNCTION public.sync_change_lines(p_stages jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb := '[]'::jsonb;
  n int;
begin
  n := coalesce((p_stages->'courses'->>'courses_updated')::int, 0);
  if n > 0 then v := v || to_jsonb(format('Course details changed for %s course(s)', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new staff member(s) from Blackboard', n)); end if;
  n := coalesce((p_stages->'courses'->>'staff_conflicts')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s staff name disagreement(s) need your call', n)); end if;
  n := coalesce((p_stages->'courses'->>'courses_unresolved')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s Blackboard shell(s) match no course here', n)); end if;

  n := coalesce((p_stages->'content'->>'inserted')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s new item(s) in the course content tree', n)); end if;
  n := coalesce((p_stages->'content'->>'missing')::int, 0);
  if n > 0 then v := v || to_jsonb(format('%s content item(s) are no longer in Blackboard', n)); end if;

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
  'files.reading_links.linked, files.missing_cleared). Convention (P-72): a count that repeats '
  'the same value on every fold is steady state and is not a change line, so '
  'assignments.conflicts_settled and assignments.shared_columns get no sentence. When no '
  'sentence fires the result is ["Nothing changed"].';

revoke all on function public.sync_change_lines(jsonb) from public, anon;
grant execute on function public.sync_change_lines(jsonb) to authenticated, service_role;
