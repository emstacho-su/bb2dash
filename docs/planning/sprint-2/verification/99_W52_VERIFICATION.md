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

## STATE WHEN THIS WORKER STOPPED (2026-10-02 06:42 UTC): 130 is on prod, 131 is NOT

130 was applied. The `apply_migration` call for 131 that followed it did not run: the first
attempt returned `Invalid or expired requestState` (checked straight after: no
`schema_migrations` row, path key still present, `stage_content` unchanged), and the retry was
refused by the session's permission layer. W-52 did not send 131 by any other route.

Until 131 lands, **no sync may be folded**. The live `stage_content` is still 026's path-keyed
body. A fold now would (1) rewrite `detail` on the 21 merged rows through
`bb_content_detail_merge`, which drops `previous_paths`, and (2) turn any rename into a new
ghost pair, which 131's unique key would then refuse.

Prod, read at 06:42 UTC: last two migrations `163_session_link_archived_answers`,
`130_bb_content_ghost_collapse`; `bb_content_course_id_path_key` present, `bb_content_course_item_key`
absent; `stage_content` `md5(prosrc)` still `92260a274cb7bcc356de5d0fa9910084`; 218 rows, 5
vanished, 0 duplicate pairs, 21 rows with `previous_paths`; 0 sync requests queued or claimed.

Tasks 7 to 11 (132, 133, 134, their tests, `DATA_SYNTAX.md`) are not started: migrations go in
number order, so they wait on 131.

## Task 3 — migration 130 (applied)

Immediately before 130 (2026-10-02 06:07:03 UTC), one `execute_sql` call:

| query | value |
|---|---|
| `select count(*) from agent_requests where kind = 'sync' and state in ('queued','claimed')` | 0 |
| S₀ `select count(*) from bb_content where detail->>'missing_since' is not null` | 26 |
| D₀ `select count(*) from (select course_id, bb_item_id from bb_content group by 1, 2 having count(*) > 1) d` | 21 |
| N₀ `select count(*) from bb_content` | 239 |

Dry run first, the whole file inside `begin; … rollback;`: D 0, S 5, N 218, 0 vanished rows with
a link, 21 linked rows, 21 rows with `previous_paths`, 0 orphaned `parent_id`.

Applied as `130_bb_content_ghost_collapse`, version `20261002060746`, from commit `584a268`.

After 130:

| check | expected | actual |
|---|---|---|
| the D₀ query | 0 | 0 |
| `select count(*) from bb_content where assignment_id is not null and detail->>'missing_since' is not null` | 0 | 0 |
| the S₀ query | S₀ − D₀ = 5 | 5 |
| the N₀ query | N₀ − D₀ = 218 | 218 |

```
$ node scripts/db-test.mjs --only phase19_130_ghost_collapse.sql      (inside the full run below)
PASS  phase19_130_ghost_collapse.sql
```

## Task 4 — migration 131 (file committed at `c8aba6d`, NOT applied)

Dry run (130, then 131, then the body of `phase19_131`, all inside one `begin; … rollback;`,
before 130 was applied). The test body passed. The re-fold of
`2a4d4a2e-80ff-4e20-8185-c96a5e2e459a` returned:

```
{"items": 220, "courses": 7, "inserted": 7, "updated": 3, "unchanged": 210, "missing": 0,
 "missing_cleared": 0, "duplicate_paths": 7, "title_fallbacks": 26, "unresolved_items": 0,
 "unresolved_courses": 0, "older_run": false}
```

A second fold of the same run in that transaction: `inserted 0, updated 0, unchanged 220`.
The 7 inserted rows are IST.466's `_12939632_1`, `_12939634_1`, `_12939635_1`, `_12939636_1`,
`_12939652_1`, `_12939654_1`, `_12939673_1`. The 3 updated rows are IST.466 rows 82, 84 and 85,
whose `parent_id` moves from the first Information / Assignments lesson to the second.
In the dry run: `bb_content_course_id_path_key` 0, `bb_content_course_item_key` 1,
`select count(*) from v_content_tree where file_id in (17, 19)` 2, task 6's `bb_type` query 0,
N 225, S 5, both functions' ACL `{postgres, service_role, db_test_runner}`.

These are dry-run values. Task 4's, 5's and 6's checks have not been run against an applied 131.

## md5 table

| migration | commit | `git show HEAD:<file> \| md5sum` | `md5(statements[1])` on prod |
|---|---|---|---|
| `130_bb_content_ghost_collapse` | `584a268` | `3a5a3269fac57ac943eff0f7fcfc7ee2` | `3a5a3269fac57ac943eff0f7fcfc7ee2` (equal) |
| `131_bb_content_item_key` | `c8aba6d` | `24670dbbfad382d9d244eca6cd67093b` | not applied |

## Full suite, with 130 applied and 131 not (2026-10-02 06:40 UTC)

```
$ node scripts/db-test.mjs
FAIL  phase19_131_stage_content_item_key.sql  FAIL phase19_131: (S) no unique bb_content_course_item_key (course_id, bb_item_id); (S) bb_content_course_id_path_key still exists; (S) no index bb_content_course_path_idx; (S) bb_content.bb_item_id is nullable; (S) bb_content_path_history(jsonb, jsonb, text, text) does not exist; (S) v_content_tree's comment still calls path unique per course
db-test: passed 48, failed 1, units 49
exit 1
```

The 47 baseline units and `phase19_130` pass. `phase19_131` is red because 131 is not applied.

## Two existing tests that the Contract's later migrations will turn red (not W-52's files)

* `db/tests/phase18_124_stage_files_replay.sql` block (4) pins `stage_content`'s `md5(prosrc)` to
  `92260a274cb7bcc356de5d0fa9910084`, Phase 18's guard that 124 left the function alone. 131
  re-creates the function, so that block fails once 131 is applied.
* `db/tests/phase17_110_course_stream.sql` seeds a `bb_files` row and expects it on the Stream
  ("the seeded kept file is not on the Stream"). 133 posts materials only from
  `bb_material_history`, so a file with no history row is not posted and that assertion fails
  once 133 is applied.

Both assert behaviour the frozen Contract replaces. They need the PM's call.
