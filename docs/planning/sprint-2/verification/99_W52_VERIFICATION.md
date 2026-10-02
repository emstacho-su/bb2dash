# 99 — W-52 verification (Phase 19, content identity and history)

Worker W-52 · branch `feat/content-history-19-content` · worktree
`bb2dash-wt-content-history-19-content` · brief
`docs/planning/sprint-2/briefs/99_PHASE19_content_history.md` (frozen 2026-10-02).
Runner: `node scripts/db-test.mjs --only <file>` as `db_test_runner` (Phase 15).
Each migration: dry run inside `begin; … rollback;` via `execute_sql`, then `apply_migration`
under the file's name, then md5 of `supabase_migrations.schema_migrations.statements[1]` compared
with `git show HEAD:<file> | md5sum` (the LF blob).

**Who applied what.** W-52 applied 130. The PM applied 131 from the PM session after Stack's
approval, and applies 132, 133 and 134 the same way; W-52 hands over the commit and the blob md5
and runs the checks afterwards. See "The stop between 130 and 131" below.

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

GREEN (2026-10-02 06:53 UTC, 130 and 131 both on prod):

```
$ node scripts/db-test.mjs --only phase19_130_ghost_collapse.sql
PASS  phase19_130_ghost_collapse.sql
db-test: passed 1, failed 0, units 1
exit 0

$ node scripts/db-test.mjs --only phase19_131_stage_content_item_key.sql
PASS  phase19_131_stage_content_item_key.sql
db-test: passed 1, failed 0, units 1
exit 0
```

## Task 3 — migration 130 (applied by W-52)

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

## The stop between 130 and 131 (06:08 to 06:51 UTC)

130 and 131 were meant to go back to back. W-52's `apply_migration` call for 131 did not run:
the first attempt returned `Invalid or expired requestState` (checked straight after: no
`schema_migrations` row, path key still present, `stage_content` unchanged), and the retry was
refused by the session's permission layer. W-52 did not send 131 by any other route, recorded
the state and reported to the PM. Prod sat with 130 applied and 131 not for 43 minutes. No sync
request was queued or claimed at 06:07, 06:42 or 06:52, and at 06:52 the 21 `previous_paths`
rows were intact and there were 0 duplicate pairs, so nothing was folded in the gap. Stack then
approved the remaining migrations and the PM applied 131 from the PM session.

## Tasks 4, 5 and 6 — migration 131 (applied by the PM, version `20261002065120`)

Dry run before 130 was applied (130, then 131, then the body of `phase19_131`, in one
`begin; … rollback;`): the test body passed and the re-fold of
`2a4d4a2e-80ff-4e20-8185-c96a5e2e459a` returned

```
{"items": 220, "courses": 7, "inserted": 7, "updated": 3, "unchanged": 210, "missing": 0,
 "missing_cleared": 0, "duplicate_paths": 7, "title_fallbacks": 26, "unresolved_items": 0,
 "unresolved_courses": 0, "older_run": false}
```

and a second fold of the same run `inserted 0, updated 0, unchanged 220`. The 3 updated rows
are IST.466 rows 82, 84 and 85, whose `parent_id` moves from the first Information /
Assignments lesson to the second.

**The run 131 re-folded: `2a4d4a2e-80ff-4e20-8185-c96a5e2e459a`.**

Against prod with 131 applied (2026-10-02 06:52:13 UTC), W-52's own read:

| check (brief task) | expected | actual |
|---|---|---|
| (4) `select count(*) from pg_constraint where conrelid = 'public.bb_content'::regclass and conname = 'bb_content_course_id_path_key'` | 0 | 0 |
| (4) the same for `bb_content_course_item_key` | 1 | 1 |
| (4) `select count(*) from v_content_tree where file_id in (17, 19)` | 2 | 2 |
| (4), (5) `node scripts/db-test.mjs --only phase19_131_stage_content_item_key.sql` | `passed 1, failed 0, units 1` | `db-test: passed 1, failed 0, units 1` |
| (6) the `bb_type` query with `<run>` = `2a4d4a2e-80ff-4e20-8185-c96a5e2e459a` | 0 | 0 |
| (6) `select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'bb_content' and column_name ilike '%handler%'` | 0 | 0 |

Also read: `bb_content` 225 rows (218 + the 7 IST.466 items, not the 5 the brief counted on
2026-09-24), 5 vanished, 21 with `previous_paths`; 10 rows carry the re-fold's write (7 inserted,
3 updated); `stage_content` `md5(prosrc)` = `ec78ca41daa2addb02fa113c85b7829d`, ACL
`{postgres=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`;
`bb_content_path_history` the same ACL. Task 5's two assertions (a second fold returns
`updated` 0 and `unchanged` = the item count; the older fixture run returns `older_run` true
and changes 0 rows) are blocks (A2) and (O) of `phase19_131`.

Still green after 131:

```
$ node scripts/db-test.mjs --only phase9_transform_states.sql
PASS  phase9_transform_states.sql
db-test: passed 1, failed 0, units 1
$ node scripts/db-test.mjs --only phase10a_stage_gradebook.sql
PASS  phase10a_stage_gradebook.sql
db-test: passed 1, failed 0, units 1
```

### `phase18_124_stage_files_replay.sql`, assertion (4) (PM's call, 2026-10-02)

Assertion (4) pinned `stage_content`'s `md5(prosrc)` to `92260a274cb7bcc356de5d0fa9910084`,
Phase 18's proof that 124 left the function alone. 131 re-creates the function on purpose, so
the pin was stale. Changed: the constant `STAGE_CONTENT_MD5` is now
`ec78ca41daa2addb02fa113c85b7829d` (read from prod after the apply), and the header's
description of (4) says so. Nothing else in the file is touched.

```
$ node scripts/db-test.mjs --only phase18_124_stage_files_replay.sql
PASS  phase18_124_stage_files_replay.sql
db-test: passed 1, failed 0, units 1
exit 0
```

## md5 table

| migration | commit | `git show <commit>:<file> \| md5sum` | `md5(statements[1])` on prod |
|---|---|---|---|
| `130_bb_content_ghost_collapse` | `584a268` | `3a5a3269fac57ac943eff0f7fcfc7ee2` | `3a5a3269fac57ac943eff0f7fcfc7ee2` (equal) |
| `131_bb_content_item_key` | `c8aba6d` | `24670dbbfad382d9d244eca6cd67093b` | `24670dbbfad382d9d244eca6cd67093b` (equal) |
