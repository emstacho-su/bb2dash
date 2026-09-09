-- bb2dash :: 016_files_current.sql
-- Spec: docs/planning/21_D2_architecture_direction.md section 3.018, renumbered 018 -> 016 by
-- docs/planning/40_RECONCILIATION_2026-09-09.md.
--
-- Five stale IST.466 documents (bb_files 16, 40, 58 schedules; 35 roster) are today marked
-- superseded only in the notes prose, so a Materials list on day one shows four schedule
-- versions and two rosters. superseded_by makes that machine-readable: a file points at the
-- file that replaced it, and the current-files view is the chain head.
--
-- Owner of the DATA is the bb-classify-files pass, not this migration. NOTHING is seeded here
-- on purpose; superseded_by stays null on all 64 rows until that pass (or Stack) sets it.
-- link_confidence records how sure the classify pass is about the week_no / session_id it set;
-- it is separate from classification_confidence, which is about bucket.
alter table bb_files
  add column superseded_by   bigint references bb_files(id),
  add column link_confidence numeric(3,2);

comment on column bb_files.superseded_by is
  'Id of the bb_files row that replaces this one (newer version of the same document). '
  'Null = current. Set by the bb-classify-files pass from path/filename/notes provenance.';
comment on column bb_files.link_confidence is
  'Confidence 0.00-1.00 in the week_no / session_id / assignment_id link set by the classify '
  'pass. Distinct from classification_confidence, which covers bucket.';

-- Latest non-superseded file per document identity: the head of every supersession chain,
-- plus every file that was never superseded.
create view v_bb_files_current as
  select * from bb_files where superseded_by is null;

comment on view v_bb_files_current is
  'bb_files minus anything a newer version replaced. Materials lists and file pickers read '
  'this, never bb_files directly. Column list is frozen at creation: a later migration that '
  'adds a bb_files column must recreate this view.';
