-- bb2dash :: 048_classifier_blackboard.sql
-- Phase 10a (docs/planning/67_PHASE10A_grades.md, Contract section "048 + 049 - bb_files for
-- submissions"). R-17.
--
-- ALONE IN ITS MIGRATION, ON PURPOSE. Postgres cannot use an enum value in the same transaction
-- that adds it, and migration 049 both writes a policy naming 'blackboard' and lets stage_attempts
-- insert rows carrying it. Splitting the ADD VALUE into its own migration is the only way to have
-- both in one deploy. Nothing else belongs in this file.
--
-- WHY A NEW CLASSIFIER AT ALL. bb_files.classified_by already distinguishes a rule-classified
-- crawl file ('rule'), an agent-classified one ('agent') and something Stack put there himself
-- ('stack'). A file pulled back out of a Blackboard submission is none of those: Blackboard is
-- stating what was handed in, which is a fact about the submission, not a guess about the file.
-- It also has to be distinguishable from 'stack' so the popout can label a pulled-back copy
-- differently from one Stack staged, and so 049's anon policy can refuse both.
--
-- `if not exists` is added to the Contract's statement so the migration is re-runnable; the
-- effect on a database that does not have the value is identical.

alter type classifier add value if not exists 'blackboard';
