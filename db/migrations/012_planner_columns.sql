-- bb2dash :: 012_planner_columns.sql
-- Planner-owned column for the effort model (21_D2 §3.014, renumbered per
-- docs/planning/40_RECONCILIATION_2026-09-09.md).
--
-- Rung 1 of the effort fallback ladder (20_D1 §3) is a manual override that wins over
-- every computed figure. It is unambiguously app-owned: a Blackboard sync must never
-- write or clear it, exactly like the rest of assignment_progress.
--
-- Scope note: 21_D2 §3.014 also proposed announcements.read_at / announcements.author for
-- the bell badge. The reconciliation cut the bell and announcements from this term's
-- scope, so those two columns are deliberately NOT added here.

alter table assignment_progress
  add column effort_override numeric(4,2);   -- NOT est_minutes; both are wanted (20_D1 §3 ladder rungs 1 and 2)

comment on column assignment_progress.effort_override is
  'Stack''s manual effort score for this assignment, in effort points. Wins over every computed figure (ladder rung 1, source=override). App-owned: syncs never write it.';
