-- bb2dash :: 049_bb_files_submissions.sql
-- Phase 10a (docs/planning/67_PHASE10A_grades.md, Contract section "048 + 049 - bb_files for
-- submissions"). R-17, R-18.
--
-- Two kinds of file now live under bucket = 'my_submissions', and neither looks like a crawl file:
--
--   PULLED BACK (classified_by = 'blackboard'). What Blackboard says Stack actually handed in.
--   stage_attempts (050) catalogues the row from the attempts payload; bb-sync's new step 4b
--   downloads the bytes in the logged-in tab and fills storage_path / sha256 / bytes.
--
--   STAGED (classified_by = 'stack'). A file Stack dropped on an assignment in bb2dash so it is
--   ready to attach in Blackboard. It has no Blackboard URL, because it has never been in
--   Blackboard - which is why source_url has to stop being NOT NULL.
--
-- WHAT CHANGES, AND WHY EACH ONE
--   1. source_url loses NOT NULL. A staged upload has no Blackboard URL and inventing one would
--      put a dead link in the catalog.
--   2. attempt_id is added: the bb_attempts.attempt_id a pulled-back file came from, so the
--      popout can say which attempt a file belongs to without re-reading the payload.
--   3. A check constraint keeps the pair honest: a row with no source_url must be one Stack
--      staged himself.
--   4. The anon INSERT policy is narrowed. It was `with check (true)` - the crawler runs in a
--      browser tab holding only the publishable key and has to be able to catalogue crawl files.
--      That is still allowed. What is not: an anonymous caller writing a submission row, or
--      writing anything on Stack's behalf or Blackboard's. Those two classifiers are now the
--      property of the owner's session and of stage_attempts (a SECURITY DEFINER function, which
--      runs as its owner and is not subject to this policy).
--
-- NOT CHANGED, DELIBERATELY
--   * stage_files (034/037/043) matches on source_url. NULL never equals anything, so a staged
--     row can never be matched, re-pointed or marked missing by it; rows with classified_by =
--     'stack' are already excluded by every one of its statements. No stage change is needed.
--   * The Storage-side policy on storage.objects is left as it is. bb-sync's step 4b uploads
--     submission BYTES with the publishable key, and an anonymous object with no bb_files row is
--     invisible to every screen in the app, because every screen reads the catalog, not the
--     bucket. Recorded as a DECISIONS row by the PM.
--   * bb_file_relpath() is unchanged: a submission file keys to
--     <course>/my_submissions/<assignment-slug>/<file_name>, or <course>/my_submissions/<file_name>
--     when the column has no assignment. storage_path = 'bb-files/' || relpath, local_path =
--     'course context/' || relpath.
--
-- KNOWN LOOSENESS, recorded rather than silently tightened. The Contract freezes the check as
-- `source_url is not null or classified_by = 'stack'`. classified_by is nullable, so a row with
-- BOTH null source_url and null classified_by evaluates to NULL and a NULL check passes. That
-- combination cannot be written by anon (the policy below refuses it unless bucket is not
-- my_submissions, and a null classified_by with a null source_url is not something any writer in
-- the codebase produces), and tightening the constraint would be a change to a frozen line. It is
-- written down in docs/planning/66_W17_VERIFICATION.md for the PM to settle in a fix round.

-- 1-3. The columns and the constraint -----------------------------------------------------------
alter table bb_files alter column source_url drop not null;   -- a staged upload has no Blackboard URL
alter table bb_files add column attempt_id text;              -- the bb_attempts.attempt_id a pulled-back file came from
alter table bb_files add constraint bb_files_source_or_staged
  check (source_url is not null or classified_by = 'stack');

comment on column bb_files.attempt_id is
  'The Blackboard attempt this file was submitted under (bb_attempts.attempt_id). Set by '
  'stage_attempts on a pulled-back submission file; null on a crawl file and on a file Stack '
  'staged in bb2dash.';
comment on column bb_files.source_url is
  'The durable Blackboard URL the bytes came from. Null only on a file Stack staged in bb2dash, '
  'which has never been in Blackboard - see the bb_files_source_or_staged constraint.';

-- 4. anon may still catalogue crawl files, but never a submission and never on Stack's behalf ----
drop policy bb_files_anon_insert on bb_files;
create policy bb_files_anon_insert on bb_files for insert to anon
  with check (bucket <> 'my_submissions' and classified_by is distinct from 'stack'
              and classified_by is distinct from 'blackboard');
