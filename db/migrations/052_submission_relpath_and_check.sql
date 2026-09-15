-- bb2dash :: 052_submission_relpath_and_check.sql
-- Phase 10a round 2, finding R2-2 (code review) + the PM's security finding on 049's check.
-- See docs/planning/67_PHASE10A_grades.md § "Round 2 — review fixes (2026-09-15)".
--
-- 046-051 are frozen. Both changes here are `create or replace` / `alter` against the LIVE
-- definitions, read out of prod first:
--     select pg_get_functiondef('public.bb_file_relpath(bigint)'::regprocedure);
--     select pg_get_constraintdef(oid) from pg_constraint where conname = 'bb_files_source_or_staged';
--
-- ---------------------------------------------------------------------------------------------
-- 1. THE COLLISION. Two different files can want the same Storage key.
-- ---------------------------------------------------------------------------------------------
-- A submission file arrives by two routes and both land in the same bucket:
--   * pulled back from Blackboard by stage_attempts + bb-sync step 4b (classified_by =
--     'blackboard', attempt_id set),
--   * staged by Stack in the drop zone (classified_by = 'stack', attempt_id null).
-- Until now both keyed to `<course>/my_submissions/<assignment-slug>/<file_name>`. Drop
-- `Report.docx` on an assignment, submit `Report.docx` in Blackboard, and the two rows compute the
-- same key. Storage is insert-only for anon, so the second upload 409s — and the skill treated a
-- 409 as "already there, done" and stamped the Blackboard row's `storage_path` with a key holding
-- Stack's staged bytes. The file the popout then offers as "what you submitted" would be the
-- draft, not the submission. That is exactly the kind of quiet lie this project exists to avoid.
--
-- THE FIX, in two halves. This migration does the durable one: a pulled-back file gets its own
-- segment, `attempt-<digits of attempt_id>/`, immediately before the file name. Attempt ids are
-- unique per submission, so two attempts of the same assignment no longer collide with each other
-- either — which also fixes a second, quieter bug: re-submitting `Report.docx` used to overwrite
-- the key of the previous attempt's copy. The other half is in `skills/bb-sync/SKILL.md`: a 409 is
-- never "done", the row is left with a null `storage_path` and reported.
--
-- STAGED ROWS ARE UNCHANGED. `attempt_id` is null on them, so their key is byte-for-byte what it
-- was, and W-18's `submissionRelPath` helper (which computes the staged key client-side before the
-- row exists) stays correct without a change. That is deliberate: only one of the two colliding
-- paths had to move, and moving the one bb2dash does not own would have been the wrong one.
--
-- NOTHING MOVES TODAY. `bb_files` holds zero rows with `bucket = 'my_submissions'`, so no existing
-- Storage object is orphaned by this and `v_file_layout.needs_move` is 0 before and after. If a
-- pulled-back row ever exists when a later migration changes this function again, its bytes have
-- to be copied to the new key first — `needs_move` is what shows that.
--
-- WHAT IS DELIBERATELY NOT CHANGED: `bb_file_relpath` still has no `set search_path`. It is one of
-- the seven pre-existing `function_search_path_mutable` advisor findings (lint 0011), it predates
-- this phase, and adding it here would change an advisor count for a reason unrelated to the
-- finding being fixed. It belongs in a migration that does all seven at once.

create or replace function bb_file_relpath(p_file_id bigint) returns text
  language sql
  stable
as $function$
  select f.course_id || '/' || f.bucket::text || '/' ||
         case when f.assignment_id is not null then split_part(f.assignment_id, '/', 2) || '/'
              when f.bucket in ('lecture_slides','readings') and f.week_no is not null then 'week-' || lpad(f.week_no::text, 2, '0') || '/'
              else '' end ||
         -- A pulled-back submission gets its attempt's own folder, so it can never land on the key
         -- of a file Stack staged under the same name, nor on an earlier attempt's copy.
         case when f.bucket = 'my_submissions' and f.attempt_id is not null
              then 'attempt-' || regexp_replace(f.attempt_id, '\D', '', 'g') || '/'
              else '' end ||
         f.file_name
  from bb_files f where f.id = p_file_id
$function$;

comment on function bb_file_relpath(bigint) is
  'The canonical relative path of one catalogued file, used for BOTH the Storage key '
  '(''bb-files/'' || relpath) and the local mirror (''course context/'' || relpath). '
  '<course>/<bucket>/[<assignment-slug>/|week-NN/][attempt-<digits>/]<file_name>. The attempt '
  'segment appears only on a pulled-back submission (bucket = my_submissions with an attempt_id) '
  'and is what keeps it off the key of a file Stack staged under the same name.';

-- ---------------------------------------------------------------------------------------------
-- 2. THE NULL HOLE in 049's check.
-- ---------------------------------------------------------------------------------------------
-- 049 froze `check (source_url is not null or classified_by = 'stack')`. `classified_by` is
-- nullable, so a row with BOTH null evaluates to `null or null` = NULL, and a NULL check PASSES.
-- The one thing the constraint exists to refuse — a catalog row that points at no Blackboard file
-- and that nobody staged — was the one thing it let through. W-17's own verification note flagged
-- it (§9, "open item for a fix round"); the PM's security pass called it in.
--
-- `coalesce(classified_by::text, '') = 'stack'` is never NULL, so the OR is never NULL either.
-- Re-added NOT VALID-free: all 74 existing rows satisfy it (0 have a null source_url), so the
-- validating scan is free and the constraint is trustworthy from the moment it lands.
alter table bb_files drop constraint bb_files_source_or_staged;
alter table bb_files add constraint bb_files_source_or_staged
  check (source_url is not null or coalesce(classified_by::text, '') = 'stack');
