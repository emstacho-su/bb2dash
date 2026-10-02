# 99 — W-52 verification (Phase 19, content identity and history)

Worker W-52 · branch `feat/content-history-19-content` · worktree
`bb2dash-wt-content-history-19-content` · brief
`docs/planning/sprint-2/briefs/99_PHASE19_content_history.md` (frozen 2026-10-02).
Runner: `node scripts/db-test.mjs --only <file>` as `db_test_runner` (Phase 15).
Each migration: dry run inside `begin; … rollback;` via `execute_sql`, then `apply_migration`
under the file's name, then md5 of `supabase_migrations.schema_migrations.statements[1]` compared
with `git show HEAD:<file> | md5sum` (the LF blob).

## Read at the start (prod, 2026-10-02)

* `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner`.
* No `sync` request `queued` or `claimed` (0). S₀ 26, D₀ 21, N₀ 239, as the start-of-phase record
  says. 0 rows with a null `bb_item_id`.
* 12 registered crawls, all folded `ok`. The newest is
  `2a4d4a2e-80ff-4e20-8185-c96a5e2e459a` (2026-10-01 18:48 UTC). IST.466 carries 39 items in it
  and 7 of them have no `bb_content` row (5 on 2026-09-24): `_12939632_1`, `_12939634_1`,
  `_12939635_1`, `_12939636_1`, `_12939652_1`, `_12939654_1`, `_12939673_1`.
* Live `stage_content`: `md5(prosrc)` = `92260a274cb7bcc356de5d0fa9910084` (98c recorded the same),
  ACL `{postgres=X/postgres,service_role=X/postgres}`.
* All 21 pairs are one live row and one `missing_since` row. 0 ghost rows carry an
  `assignment_id`. Ghost rows have 14 children between them, every one itself a ghost.

## Task 1 — the two tests, written first

RED (2026-10-02, before 130 and 131):

```
$ node scripts/db-test.mjs --only phase19_130_ghost_collapse.sql
FAIL  phase19_130_ghost_collapse.sql  FAIL phase19_130: (1) 21 (course_id, bb_item_id) pair(s) still held by more than one row; (3) no row carries detail.previous_paths: the ghosts' paths were not kept; (4) 14 live row(s) hang under a row that has a twin
db-test: passed 0, failed 1, units 1
exit 1

$ node scripts/db-test.mjs --only phase19_131_stage_content_item_key.sql
FAIL  phase19_131_stage_content_item_key.sql  FAIL phase19_131: (S) no unique bb_content_course_item_key (course_id, bb_item_id); (S) bb_content_course_id_path_key still exists; (S) no index bb_content_course_path_idx; (S) bb_content.bb_item_id is nullable; (S) bb_content_path_history(jsonb, jsonb, text, text) does not exist; (S) v_content_tree's comment still calls path unique per course
db-test: passed 0, failed 1, units 1
exit 1
```

`phase19_131` raises its schema failures before it calls any function, so the RED line names
what 131 has to build instead of a permission error on `stage_content`.
