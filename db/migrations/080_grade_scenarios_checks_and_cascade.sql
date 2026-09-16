-- bb2dash :: 080_grade_scenarios_checks_and_cascade.sql
-- Phase 10b round 2 (docs/planning/68_PHASE10B_grade_model.md, "Round 2 - review fixes",
-- R2-6 + R2-11). Worker W-20. Additive fix to 057, which stays byte-frozen.
--
-- R2-6: THE SHAPE CHECK LET ARRAYS THROUGH
--   057's grade_scenarios_item_scores_shape used a lax-mode jsonpath. In lax mode `$.*` unwraps
--   arrays and swallows structural errors, so a value that is an array (`{"k": [1]}`), an empty
--   array, a nested object or null could satisfy "no member is a non-number". The check is
--   re-created with two strict-mode paths, one per rule: every member's type must be number, and
--   no number may be negative. Checked by the PM on prod: refuses an array, an empty array, null,
--   a nested object, a string and a negative; accepts `{}` and plain numbers. The two tables were
--   empty when this ran, so the new check validates nothing existing.
--
-- R2-11: A COURSE DELETE WAS BLOCKED BY ITS LINKS
--   grade_column_links.course_id referenced courses(id) with no action, while grade_scenarios
--   (057) cascades. A link is Stack's state about a column of that course and means nothing once
--   the course is gone, so the foreign key is re-created `on delete cascade`, matching the
--   scenario table.
--
-- Nothing else changes: no grant, policy, trigger, index or view is touched.

-- =============================================================================================
-- 1. grade_scenarios: strict-mode shape check
-- =============================================================================================
alter table grade_scenarios drop constraint grade_scenarios_item_scores_shape;

alter table grade_scenarios add constraint grade_scenarios_item_scores_shape check (
  jsonb_typeof(item_scores) = 'object'
  and not jsonb_path_exists(item_scores, 'strict $.* ? (@.type() != "number")')
  and not jsonb_path_exists(item_scores, 'strict $.* ? (@.type() == "number" && @ < 0)'));

comment on constraint grade_scenarios_item_scores_shape on grade_scenarios is
  'item_scores is a json object whose every member is a number >= 0. Strict-mode jsonpath '
  '(080): lax mode unwraps arrays, which let {"k": [1]} and similar shapes through 057''s check.';

-- =============================================================================================
-- 2. grade_column_links.course_id: cascade with the course
-- =============================================================================================
alter table grade_column_links drop constraint grade_column_links_course_id_fkey;

alter table grade_column_links add constraint grade_column_links_course_id_fkey
  foreign key (course_id) references courses(id) on delete cascade;
