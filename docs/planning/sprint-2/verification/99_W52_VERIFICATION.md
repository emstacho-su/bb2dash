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

## Tasks 7, 9 and 10 — the three tests, written first

RED (2026-10-02 07:0x UTC, 130 and 131 on prod, 132 to 134 not written yet):

```
$ node scripts/db-test.mjs --only phase19_132_material_history.sql
FAIL  phase19_132_material_history.sql  FAIL phase19_132: (S) table bb_material_history does not exist
db-test: passed 0, failed 1, units 1
exit 1

$ node scripts/db-test.mjs --only phase19_133_course_stream_history.sql
FAIL  phase19_133_course_stream_history.sql  FAIL phase19_133: (S) v_course_stream does not read bb_material_history; (S) this role cannot seed bb_material_history
db-test: passed 0, failed 1, units 1
exit 1

$ node scripts/db-test.mjs --only phase19_134_sync_change_lines.sql
FAIL  phase19_134_sync_change_lines.sql  FAIL phase19_134: (1) the brief's fixture gave ["Nothing changed"]; (2) names and the remainder gave ["Nothing changed"]; (3) the content stage still speaks: ["3 new item(s) in the course content tree", "2 content item(s) are no longer in Blackboard"]; (4) a malformed sample was not ignored; (5) every sentence at once gave [... "98 new item(s) in the course content tree", "99 content item(s) are no longer in Blackboard", ...]
db-test: passed 0, failed 1, units 1
exit 1
```

(The (5) line is cut here; the runner prints all 26 sentences.)

### `phase17_110_course_stream.sql` (PM's call, 2026-10-02)

Phase 17's test seeds one kept file, one `my_submissions` file, one file noted missing and one
vanished node, and asserts the first is on the Stream and the other three are not. 133 posts a
material only when `bb_material_history` holds an `appeared` or `changed` row for it, so the
kept file would stop posting and the three exclusions would pass with nothing to exclude.
Changed: one `insert into bb_material_history` after the seeds gives each of the four seeded
rows an `appeared` row. No assertion is edited or removed. It needs 132's table and 133's
insert grant, so it is red until 133 is on prod:

```
$ node scripts/db-test.mjs --only phase17_110_course_stream.sql
FAIL  phase17_110_course_stream.sql  relation "bb_material_history" does not exist
db-test: passed 0, failed 1, units 1
exit 1
```

## Task 7 and 8 — migration 132, DRY RUN (not applied)

Every dry run since 2026-10-03 sets `statement_timeout = '90s'` and `lock_timeout = '10s'` inside
its transaction. (An earlier, unbounded dry-run call of 132 on 2026-10-02 never returned to the
worker; on 2026-10-03 `pg_stat_activity` showed no open session and nothing of it persisted.
Timed in pieces, one call of `material_history_record` takes 25 to 51 ms.)

Dry run 2026-10-03, one `begin; … rollback;`: 132's statements (table, policy, function,
grants, backfill, restamp), then the body of `phase19_132_material_history.sql`. The test body
passed (blocks S, P, V, 1, 2, 2b, O, 4, 6, 8, X and the stranger block N).

Backfill, per crawl, oldest first (`{appeared, changed, vanished}`):

| crawl | appeared | changed | vanished | note |
|---|---|---|---|---|
| `3e12fd89` | 0 | 0 | 0 | baseline for all 7 courses |
| `6b122650` | 34 | 10 | 4 | |
| `bf2f81e5` | 45 | 7 | 2 | |
| `c877b0cc` | 5 | 14 | 2 | |
| `1b5e8da5` | 2 | 0 | 0 | |
| `9080daeb` | 34 | 15 | 7 | |
| `3b5174b8` | 8 | 3 | 0 | |
| `6923d85d` | 8 | 1 | 1 | |
| `f24a7ff5` | 8 | 0 | 0 | |
| `1f10c823` | 6 | 8 | 1 | |
| `8bfe8c51` | 0 | 1 | 0 | |
| `2a4d4a2e` | 3 | 0 | 0 | |

229 rows: content 82 appeared, 55 changed, 6 vanished; files 71 appeared, 4 changed, 11
vanished. Changed fields: content `{modified}` 30, `{path}` 10, `{title,path,modified}` 6,
`{url,modified}` 4, `{path,modified}` 3, `{title,path,url,modified}` 2; files `{url}` 4.
82 file rows carry a `bb_file_id`; 4 `appeared` file rows do not (IST.352 `_13229019_1`,
`_13252373_1`, `_13276647_1`; IST.466 `_12939673_1`): each of those files was re-uploaded
later, `stage_files` moved its `bb_files.source_url` to the new url, and the old url no longer
matches. They post as Changed at the re-upload, not as New at first sight. This only happens in
the backfill: a live fold matches right after `stage_files`, and the id is stored.

Restamp (P-98): 2 rows, GEO.103.lecture 106 (`_13177626_1`) and 99 (`_13177625_1`),
`bf2f81e5` → `6b122650`, as the brief says. The other three stale rows already carry the
run their `vanished` row names (`9080daeb`).

Brief checks, in the dry-run transaction:

| check | expected | dry run |
|---|---|---|
| (7) `select has_function_privilege('authenticated', 'public.material_history_record(uuid)', 'execute')` | false | false |
| (7) `has_table_privilege('anon', 'public.bb_material_history', 'select')` | false | false |
| (8) the P-98 query (stamped rows whose run has history but no matching `vanished` row) | 0 | 0 |
| (8) base-table columns named `missing_since%` | 0 | 0 |
| (7) `phase19_132` body | passes | passes |

## Task 9 — migration 133, DRY RUN (not applied)

Dry run 2026-10-03, one `begin; … rollback;`: 132 (table, policy, function, grants, backfill),
then 133, then the body of `phase19_133_course_stream_history.sql` and the seeded block of
`phase17_110_course_stream.sql` as edited. Both passed. (First attempt failed on the test
itself: `format('%s', boolean)` prints `t`, not `true`; fixed in `cdde75a`.)

| check | expected | dry run |
|---|---|---|
| (9) column list of `v_course_stream` | `course_id,post_kind,posted_at,ref_kind,ref_id,title,body,meta` | same |
| (9) material posts whose `meta->>'run_id'` has no history row | 0 | 0 |
| (9) `phase19_133` body (`security_invoker`, no anon select, `my_submissions` and missing items excluded) | passes | passes |
| `reloptions` | `{security_invoker=true}` | `{security_invoker=true}` |
| `has_table_privilege('anon', 'public.v_course_stream', 'select')` | false | false |

Material posts after the backfill: 65 (101 before 133): files 57 appeared and 4 changed, nodes 3
appeared and 1 changed. By course: IST.466 20, IST.352 18, GEO.103.lecture 16, IST.323 6,
IST.471 3, ECN.304 2. The other arms are unchanged: 27 announcement rows, 54
`assignment_posted`, 81 `assignment_due`.

## Task 10 — migration 134, DRY RUN (not applied)

Dry run 2026-10-03, one `begin; … rollback;`: 134, then the body of
`phase19_134_sync_change_lines.sql` (blocks 1 to 6), `phase17_115`'s assertions and
`phase10a_stage_gradebook`'s one call. All passed. The brief's fixture gives exactly
`["2 new material(s): A, B", "1 material(s) no longer in Blackboard: C"]`.
`md5(prosrc)` live before: `bd31229e9a8d32d99e13342466bf28af`; after 134 in the dry run:
`90da0fec8b3c8aa5f246746ff328e49d`. ACL after:
`{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`.

## Task 11 — `DATA_SYNTAX.md`

```
$ grep -c 'bb_material_history' DATA_SYNTAX.md
4
$ grep -c 'course_id, bb_item_id' DATA_SYNTAX.md
6
```

## Handed to the PM to apply (132, 133, 134)

Each file is ASCII only, with no tabs, no trailing spaces and no CR in the blob.

| migration | apply the blob at | `git show <sha>:db/migrations/<file> \| md5sum` | bytes |
|---|---|---|---|
| `132_material_history` | `54b8c27` (unchanged at HEAD) | `9189a345726a5615807431ae38c05909` | 23,206 |
| `133_course_stream_history` | `10ae0a5` (unchanged at HEAD) | `3fb825885544a91b0a666158b0325cfd` | 7,381 |
| `134_sync_change_lines_materials` | `e14cf24` (unchanged at HEAD) | `77268e7d2216bb26d7ddd4c0cc59f214` | 9,442 |

After the applies: run the post-apply checks for tasks 7 to 10 as the brief writes them, the five
`phase19_13x` tests, `phase17_110`, `phase18_124`, `phase9_transform_states`,
`phase10a_stage_gradebook`, and the full suite. `phase17_110` is red on prod until 133 is applied.

## Round 2 (brief 99, rows R2-1 to R2-5 and R2-8), 2026-10-03

`origin/feat/content-history-19` (58a86b1) merged in. R2-8: the 130–134 section of
`DATA_SYNTAX.md` now sits after the 110–116 bullets (`38ddc53`).

### 138 tests, written first

`phase19_138_material_history_counts.sql` is new. `phase19_132_material_history.sql` is moved to
138's semantics: crawl 2 now counts `{appeared 1, changed 3, vanished 1}` (8 rows, unchanged),
the sample holds 5, the second formulation in (P) uses the R2-3 and R2-4 rules, crawls are
folded in order, and an (R2-5) block is added. RED against live 132 (2026-10-03):

```
$ node scripts/db-test.mjs --only phase19_132_material_history.sql
FAIL  phase19_132_material_history.sql  FAIL phase19_132: (2) crawl 2 returned {... "changed": 4, "appeared": 2, "vanished": 2 ...}; (2) sample reads [... 7 elements ...]; (R2-5) crawl 6 after folded crawls 7 and 8 returned {"sample": [], "changed": 0, "appeared": 0, "vanished": 0, "older_run": false, "baseline_courses": 0}
db-test: passed 0, failed 1, units 1
exit 1

$ node scripts/db-test.mjs --only phase19_138_material_history_counts.sql
FAIL  phase19_138_material_history_counts.sql  FAIL phase19_138: (2) rows read ... changed content _w52k_d_1 {path} ; changed content _w52k_f_1 {title,path} ; changed content _w52k_k_1 {path} ; changed content _w52k_l_1 {path} ; changed content _w52k_s_1 {url}; (2) counts {"changed": 5, "appeared": 6, "vanished": 0, ...}; (2) sample titles e.pdf,Handout,handout.pdf,Reading,Session link,Slides; (3) counts {"changed": 2, "appeared": 1, ...}; (5) crawl 3 after a folded, unrecorded crawl 4 returned {... "older_run": false ...}; (X) 14 fixture rows, want 10
db-test: passed 0, failed 1, units 1
exit 1
```

The prod blocks (P) and (V) of `phase19_132` still pass against the 229 backfilled rows.

### 138, DRY RUN (not applied)

Three rolled-back calls on 2026-10-03, each `statement_timeout = '90s'`, `lock_timeout = '10s'`:

1. 138's function, then the body of `phase19_138`: passed. In the same transaction:
   `has_function_privilege('authenticated', 'public.material_history_record(uuid)', 'execute')`
   false; task 8's P-98 query 0; task 9's untraced material posts 0; prod history 229 rows and
   65 Stream material posts, unchanged (138 rewrites no row).
2. 138's function, then the body of `phase19_132` as moved to 138 (blocks P, V, 1, 2, 2b, O, 4,
   6, 8, R2-5, X): passed. The (P) block's second formulation, now with 138's path and
   session-url rules, still equals the newest recorded crawl's rows (`2a4d4a2e`).
3. 138's function, then `phase9_transform_states`'s two blocks (a fixture crawl whose
   announcement breaks one stage, folded by `run_transform`; a 31-minute `running` row reaped
   by `transform_tick`): passed. The run reads `partial`, exactly one stage `failed`
   (`announcements`), the `history` stage `ok` with
   `{"appeared":0,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false,"sample":[]}`,
   and the tick reports `reaped: 1`. (A first attempt at this call pasted a cut-down function
   by mistake; its result is not counted.)

`phase10a_stage_gradebook` calls neither `run_transform` nor `material_history_record`, so it
is run after the apply, not in the dry run.

Not rewritten by 138: the 229 backfilled rows keep 132's rules. Up to 10 of them are content
rows whose only changed field is `path`, the kind R2-3 stops writing when the path changed
because an ancestor was renamed.

### 139 test, written first

RED against live 131 (2026-10-03):

```
$ node scripts/db-test.mjs --only phase19_139_stage_content_rekey.sql
FAIL  phase19_139_stage_content_rekey.sql  FAIL phase19_139: (B) crawl B returned {"items": 9, ..., "missing": 4, "updated": 1, "inserted": 5, ...}; (B) the Knowledge Check reads 3056|_w52r_kc_a|ECN.304/attendance|; (B) Week 2 reads 3061|_w52r_w2_a|, its child hangs under 3066; (B5) a second fold returned {... no "rekeyed" key ...} and changed 0 row(s)
db-test: passed 0, failed 1, units 1
exit 1
```

Under 131 the link stays on the old Knowledge Check row, which is stamped missing, and Week 2's
child moves to a new row. (B2), (B3) and (B4) already hold under 131 and must keep holding.

### Re-created items in prod's crawl history (R2-1's check)

Every pair of consecutive registered crawls per course, read from `bb_raw` on 2026-10-03: an
item id that leaves and a new id that arrives on the same path. One occurrence in 12 crawls:
IST.352 "Assignments / Project Assignment #1A - Project Description"
(`resource/x-bb-asmt-test-link`), `_13192249_1` → `_13195312_1` at crawl `6b122650`, one new and
one gone on that path. It was folded by 026, whose path key updated the row in place and kept
the old id in `previous_ids`, so no link was lost. Under 131 the same crawl would have stranded
any link on a ghost row; under 139 it is re-keyed.

### 139, DRY RUN (not applied)

Two rolled-back calls on 2026-10-03, each `statement_timeout = '90s'`, `lock_timeout = '10s'`:

1. 139's function as in the file, then a re-fold of the newest registered crawl, then the body
   of `phase19_139`: passed. `md5(prosrc)` in the transaction
   `ba31b9cb3be68f3ae7ee277258dcb271`, equal to the md5 computed locally from the committed
   file (the same local method gives 131's live `ec78ca41daa2addb02fa113c85b7829d`), so the
   `phase18_124` pin becomes `ba31b9cb3be68f3ae7ee277258dcb271` once the PM confirms it on prod
   after the apply. Re-fold of `2a4d4a2e`: `inserted 0, updated 0, unchanged 220, missing 0,
   rekeyed 0`. ACL `{postgres=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`;
   225 rows, 21 linked, unchanged.
2. 139's function, then `phase19_131`'s fold sequence (A, A2, B, O, C and the "nothing outside
   the fixture moved" check, with `rekeyed 0` expected on every fold) and `phase9_transform_states`'s
   partial block (`run_transform` on the broken-announcement crawl: `partial`, one stage
   `failed`, `announcements`; the content stage `ok` with `rekeyed: 0`): passed.

`phase17_110`, `phase17_115` and `phase10a_stage_gradebook` reach neither function, so they are
run after the applies with the full suite.

## Handed to the PM to apply (138, 139), in that order

| migration | apply the blob at | `git show <sha>:db/migrations/<file> \| md5sum` | bytes |
|---|---|---|---|
| `138_material_history_counts` | `d7b3318` (unchanged at HEAD) | `eded5cb4cfae311bf64d9df586358e3e` | 18,242 |
| `139_stage_content_rekey` | `aacedcf` (unchanged at HEAD) | `54ea43dc65ede8b5eb2a5368719811b3` | 20,947 |

After the applies: `phase19_132`, `phase19_138`, `phase19_139`, `phase19_131` and
`phase19_133` green; `phase18_124`'s pin moved to 139's body (expected
`ba31b9cb3be68f3ae7ee277258dcb271`) and green; full suite.

## After the PM applied 138 and 139 (2026-10-03, about 18:00Z), APPLIED

Prod read by W-52: all ten Phase 19 migrations recorded, md5 prefixes
130 `3a5a3269`, 131 `24670dbb`, 132 `9189a345`, 133 `3fb82588`, 134 `77268e7d`, 135 `adc27d3b`,
136 `9feca071`, 137 `30ff4742`, 138 `eded5cb4`, 139 `54ea43dc`. `stage_content` `md5(prosrc)` =
`ba31b9cb3be68f3ae7ee277258dcb271`, as predicted; `material_history_record`
`1bd8b046c1da6191cae67a339c220550`.

`phase18_124` assertion (4) pinned to `ba31b9cb3be68f3ae7ee277258dcb271` (`fd39dea`).
`origin/feat/content-history-19` merged in before the full suite (`2d9289b`), so it includes
W-53's `phase19_135_136_sync_driver` and `phase19_137_sync_status`.

```
$ node scripts/db-test.mjs --only <unit>      (one at a time, 2026-10-03)
PASS  phase19_131_stage_content_item_key.sql
PASS  phase19_132_material_history.sql
PASS  phase19_133_course_stream_history.sql
PASS  phase19_134_sync_change_lines.sql
PASS  phase19_138_material_history_counts.sql
PASS  phase19_139_stage_content_rekey.sql
PASS  phase18_124_stage_files_replay.sql
PASS  phase10a_stage_gradebook.sql
PASS  phase17_110_course_stream.sql
PASS  phase17_115_sync_change_lines.sql
PASS  phase9_transform_states.sql

$ node scripts/db-test.mjs
db-test: passed 56, failed 0, units 56
exit 0
```

## Round 3 (brief 99, rows R3-1 to R3-5 and R3-9), 2026-10-03

`origin/feat/content-history-19` (78d0be8) merged in first. Block 170–179.

### Tests, written first (RED against live 138 and 139)

* `phase19_132`: crawls are now registered one at a time (R3-1 makes a newer registered crawl,
  folded or not, an older-run trigger); still passes against live 138.
* `phase19_138`: crawl 4 is registered but not folded, and the fixture carries the `bb_files`
  rows `stage_files` would have written.
* `phase19_170_activity_stream.sql` (new): R3-4 (Activity equals the Stream's posts for the
  run), R3-2 (a null `bb_file_id` resolves at read time), R3-3 (prod: no path-only row 138 would
  not write).
* `phase19_171_stage_content_fresh_rekey.sql` (new): R3-5.

```
PASS  phase19_132_material_history.sql
FAIL  phase19_138_material_history_counts.sql  FAIL phase19_138: (5) crawl 3 after a registered, unfolded crawl 4 returned {"sample": [], "changed": 0, "appeared": 0, "vanished": 0, "older_run": false, "baseline_courses": 0}
FAIL  phase19_170_activity_stream.sql  FAIL phase19_170: (R3-3) 10 path-only row(s) left that 138 would not write; (R3-4) crawl 2 counts {"changed": 1, "appeared": 1, ...}; (R3-4) crawl 2 sample Lecture notes v2,g.pdf; (R3-4) crawl 2: Activity 1/1, Stream appeared 2 changed 0; (R3-4) crawl 3 counts {... "vanished": 2 ...}; (R3-2) the unresolved rows post (none), want 1522
FAIL  phase19_171_stage_content_fresh_rekey.sql  FAIL phase19_171: (C) crawl C returned {... "rekeyed": 1, ... "inserted": 0 ...}; (C) the Knowledge Check rows read _w52f_kc_c:ECN.304/attendance:live; (D) the re-posted Knowledge Check reads 3153|_w52f_kc_d|["_w52f_kc_a", "_w52f_kc_c"]; (D) the ghost reads _w52f_kc_d|ECN.304/attendance|
```

`phase19_171`'s RED line is R3-5's bug as the review describes it: under 139 the new Knowledge
Check posted at a reused path takes the weeks-old ghost's row and its link.

### 170, DRY RUN (not applied)

Rolled-back calls on 2026-10-03, each `statement_timeout` 90 s or less and `lock_timeout = '10s'`:

1. 170's view, compared with the live 133 view inside the transaction, then 170's data step.
   View: the same 8 columns; the announcement, `assignment_posted` and `assignment_due` arms
   return the same row counts; material posts 65 → 69, with 0 rows lost and 4 added. The 4 are
   R3-2's null `bb_file_id` rows, now resolved: IST.352 files 144 (`9080daeb`), 72 (`bf2f81e5`),
   452 (`f24a7ff5`) and IST.466 file 161 (`6923d85d`), each `appeared`. So R3-9's course
   pushdown changed no other row. Data step (R3-3): 10 path-only rows before, 10 deleted, 0
   after; the closing recomputation finds 0; history 229 → 219; material posts stay 69 (none
   of the 10 was posting).
2. 170 in full (view, function, data step), then the body of `phase19_170`: passed (R3-4 on
   both crawls, the Activity = Stream check, R3-2, R3-3).

Expected `md5(prosrc)` of 170's `material_history_record`, computed locally from the committed
file with the method that reproduces 138's live `1bd8b046c1da6191cae67a339c220550`:
`af19c79f8e00a9608f220dd8986e4bd5`.

`phase19_132` and `phase19_138` pass against live 138 with their round-3 fixtures; their run
under 170 comes after the apply, with the full suite.

### 171, DRY RUN (not applied)

1. 171's function as in the file, then the body of `phase19_171`: passed. `md5(prosrc)` in the
   transaction `1cdcd890648153eb9664c6417077866d`, equal to the local computation, so the
   `phase18_124` pin becomes that value once the PM confirms it on prod.
2. 171's function, a re-fold of the newest registered crawl (`inserted 0, updated 0,
   unchanged 220, rekeyed 0, missing 0`), then `phase19_139`'s re-key cases (the linked
   Knowledge Check and Week 2 still re-keyed, `rekeyed 2, inserted 3, missing 2`): passed.

## Handed to the PM to apply (170, then 171)

| migration | apply the blob at | `git show <sha>:db/migrations/<file> \| md5sum` | bytes |
|---|---|---|---|
| `170_material_history_round3` | `11e40bc` (unchanged at HEAD) | `ae78cfc7649bd6d52d54be083c24c403` | 31,745 |
| `171_stage_content_rekey_fresh_only` | `6de6f62` (unchanged at HEAD) | `5eed0b5f07a118a7bfd0cd306c51c570` | 20,826 |

## After the PM applied 170 and 171 (2026-10-03), APPLIED

`stage_content` `md5(prosrc)` re-read on prod: `1cdcd890648153eb9664c6417077866d`, as predicted.
`phase18_124` assertion (4) re-pinned to it (`548e130`). `origin/feat/content-history-19` merged
in before the runs (`c6c661b`).

```
$ node scripts/db-test.mjs --only <unit>      (one at a time)
PASS  phase19_170_activity_stream.sql
PASS  phase19_171_stage_content_fresh_rekey.sql
PASS  phase19_138_material_history_counts.sql
PASS  phase19_132_material_history.sql
PASS  phase19_139_stage_content_rekey.sql
PASS  phase19_133_course_stream_history.sql
PASS  phase18_124_stage_files_replay.sql
PASS  phase17_110_course_stream.sql
PASS  phase9_transform_states.sql

$ node scripts/db-test.mjs
db-test: passed 58, failed 0, units 58
exit 0
```

`phase19_132` and `phase19_138`, traced by hand before the apply, pass under 170 as expected.

## Round 4: migration 172, LTI items (Kaltura videos) as Stream links (2026-10-03)

Stack: "Videos don't need to be downloaded and stored... Only keep the link to it." Live reads:
`v_course_stream` viewdef md5 `8059c79fce2db2c316c3cb7de49f579b`, `material_history_record`
`md5(prosrc)` `af19c79f8e00a9608f220dd8986e4bd5` (both 170's).

Test first: `phase19_172_stream_lti.sql` (`5662f22`, fixed in `e65828a`: the single-post check
runs while the video is live, since a vanished node leaves the Stream by 110's rule). RED against
live 170:

```
FAIL  phase19_172_stream_lti.sql  FAIL phase19_172: (1) crawl 2 posts (none); (1) the video does not post exactly once; (2) crawl 2 returned {"sample": [], "changed": 0, "appeared": 0, ...}; (3) crawl 3 returned {... "vanished": 0 ...}
```

Block (4), nothing is fetched for a video, already holds: `stage_files` on the fixture crawl
catalogues no `bb_files` row and the history has no `file` row for the item.

172 (`edc0f08`) is 170's view and function text with `'lti'` added to the content arm's kinds
and to the vanished rule's kinds, plus their comments; the diff against 170 is those lines only.

DRY RUN (one rolled-back call; both changes applied to the live 170 bodies by text
substitution, then the body of `phase19_172`): passed. Same 8 columns; material posts 69 → 71,
0 lost. The two history rows that newly post: IST.323 "IST-323 Lab #2 Tips" (content 3341,
`appeared`, run `3a7b8572`) and "Orange Instant Access (course textoobk ebooks)" (content
102, `changed`, run `6b122650`).

Expected `md5(prosrc)` of 172's `material_history_record`, computed locally:
`bdc2844aa109a166af24a3bef93adbbc`.

| migration | apply the blob at | `git show <sha>:db/migrations/172_stream_lti_materials.sql \| md5sum` | bytes |
|---|---|---|---|
| `172_stream_lti_materials` | `edc0f08` (unchanged at HEAD) | `cc483bff25feca48870f14b605bc7ee1` | 25863 |

## After the PM applied 172 (2026-10-03), APPLIED

PM's read: blob md5 `cc483bff25feca48870f14b605bc7ee1` equal on prod; `material_history_record`
`md5(prosrc)` `bdc2844aa109a166af24a3bef93adbbc`, as predicted; material posts 69 → 71; 0
`bb_files` rows for any `lti` item. `origin/feat/content-history-19` merged in (`4db6427`).

```
$ node scripts/db-test.mjs --only <unit>      (one at a time)
PASS  phase19_172_stream_lti.sql
PASS  phase19_170_activity_stream.sql
PASS  phase19_133_course_stream_history.sql
PASS  phase19_138_material_history_counts.sql
PASS  phase17_110_course_stream.sql

$ node scripts/db-test.mjs
db-test: passed 59, failed 0, units 59
exit 0
```
