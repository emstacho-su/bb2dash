# 98c — W-48 verification (Phase 18, db stream)

Worker W-48 · branch `feat/ingest-corpus-18-db` · worktree `bb2dash-wt-18-db` · brief
`docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md` (frozen 2026-09-29).
Runner: `node scripts/db-test.mjs --only <file>` as `db_test_runner` (Phase 15).
Each migration: dry run inside `begin; … rollback;` via `execute_sql`, then `apply_migration`
under the file's name, then md5 of `supabase_migrations.schema_migrations.statements[1]` compared
with `git show HEAD:<file> | md5sum` (the LF blob).

## Drift read at the start (prod, 2026-09-29)

* Current files 89 (brief: 84), current units 775 (brief: 784), parts 1,545.
* Four current files catalogued since the brief and not yet pulled: 161, 162, 163, 452
  (`text_status = 'pending'`, no bytes). File 160's four units (785–788) have no embedding.
  Both are the gate sync's job (tasks 16, 17); task 1's (a) and (c) name them until then.
* Files 2, 74, 151 and IST.323's `syllabus_path` read as the brief says (2 and 74 current, 151
  `unclassified` / `rule` / 0.6, `IST.323/323Fall26V1.3.1.docx`).

## Task 1 — `db/tests/phase18_post_embed_checks.sql`

RED (2026-09-29, before task 7):

```
FAIL  phase18_post_embed_checks.sql  FAIL (a) no text unit: 161, 162, 163, 452; (b) na without twin: 68; (c) parts: 785 no parts, 786 no parts, 787 no parts, 788 no parts; (d) unlabelled notes: hybrid subrequirements/482, hybrid supplicant/738, hybrid supplicant/750, keyword supplicant/738, keyword supplicant/750, vector part 1/750
db-test: passed 0, failed 1, units 1
exit=1
```

File 68 is named under (b) and `supplicant` under (d), as the brief's RED line requires. GREEN
needs task 7 (121) for (d), task 20 (file 68, PM) for (b), and the gate sync's pull and embed for
(a) and (c).

## Task 6 — migration 120 + `db/tests/phase18_120_supersede_file_chains.sql`

Prod re-read before writing (2026-09-29): 2 and 74 current; 151 `unclassified` / `rule` / 0.60;
file 2's confidence 0.99; IST.323 `syllabus_path` = `IST.323/323Fall26V1.3.1.docx`. The newest
registered crawls (6923d85d on 9/27, f24a7ff5 on 9/29) still show `_12928159_1` carrying only
V1.4 and `_12939631_1` only Wk4xyz.

RED:

```
FAIL  phase18_120_supersede_file_chains.sql  FAIL chains: 2->null, 74->null; 151 bucket: unclassified; 151 classification: rule/0.60; IST.323 syllabus_path: IST.323/323Fall26V1.3.1.docx; search still returns file 2
db-test: passed 0, failed 1, units 1
exit=1
```

Dry run (`begin; <120>; select …; rollback;`): first attempt raised `column reference
"syllabus_path" is ambiguous` (a PL/pgSQL constant named like the column); renamed to
`V14_SYLLABUS_KEY`; second dry run: 2→151, 74→149, 151 `syllabus_policy` / `agent` / 0.99,
`syllabus_path` V1.4, search count for file 2 = 0.

Applied: `apply_migration` name `120_supersede_file_chains`, version 20260929172703.
md5 `statements[1]` = `505acb95ec9884441baad779539772bc` = `git show HEAD:db/migrations/120_supersede_file_chains.sql | md5sum`.

GREEN:

```
PASS  phase18_120_supersede_file_chains.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## Recorded before 121 and 124 (prod, 2026-09-29)

* `hybrid_search_file_text` / `search_file_text`: `prosecdef` false; `proconfig`
  `{"search_path=public, pg_temp"}` (Phase 15's pin); `proacl` (both)
  `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,db_test_runner=X/postgres}`.
* `md5(prosrc)` before 121: hybrid `2fdec94b506ff5813ffcc7a78061c068`, keyword `a26d6b2ab4acbf5f8344deddf5a58584`.
* `stage_content`: `md5(prosrc)` = `92260a274cb7bcc356de5d0fa9910084` (task 11 compares against this).
* `stage_files`: `proacl` `{postgres=X/postgres,service_role=X/postgres}`, `md5(prosrc)` `ba12d5b65bdc2f885d7b249f2b3f21b7`.

## Task 8 — R-77 re-measure

W10 B3's probe (`51_W10_VERIFICATION.md` §B3): `explain (analyze, buffers, format json)` of
`hybrid_search_file_text(q, <stored gte-small embedding of text 277 part 1>, 'gte-small', null, 12)`,
one warm-up run discarded, then 5 runs per query, median of `Execution Time`.

Before 121 (2026-09-29): final exam date 21.614, 21.173, 20.191, 20.655, 20.298 ms; attendance
policy 35.750, 35.590, 35.456, 35.350, 35.250 ms.

before_final_median_ms=20.655
before_attendance_median_ms=35.456

Both before-medians are under 50 ms, so 121 does not build `part_fts`:

part_fts=not_built

## Task 7 — migration 121 + `db/tests/phase18_121_search_contract.sql`

The contract test holds (s) the signature literals, `prosecdef`, the pin and the ACL recorded
above, and (n) a sweep of the notes label rule over the whole current corpus (every part of every
current `[notes]` unit as a vector-only hit; one notes word per unit in keyword and hybrid mode;
the three live leaks).

RED (before 121; the message is one line, cut here):

```
FAIL  phase18_121_search_contract.sql  FAIL (n) snippet crosses the notes marker: hybrid acquisition -> 562, hybrid acquisition -> 564, hybrid Activities -> 27, … (over 100 probe/unit pairs)
db-test: passed 0, failed 1, units 1
exit=1
```

Dry run (`begin; <121's two functions>; <the (n) sweep>; rollback;`): 3,090 probe rows, 194
labelled, 0 crossing the marker; hybrid `supplicant` on 750 → `750/fts_headline: [notes] encryption (4). …`.

Applied: `apply_migration` name `121_search_notes_label`, version 20260929173148.
md5 `statements[1]` = `86c19ac23c00bd22d84c2e78934441e8` = `git show HEAD:db/migrations/121_search_notes_label.sql | md5sum`.

GREEN:

```
PASS  phase18_121_search_contract.sql
db-test: passed 1, failed 0, units 1
exit=0
```

Post-embed after 121 — (d) no longer appears; (a), (b), (c) wait on the gate sync and task 20:

```
FAIL  phase18_post_embed_checks.sql  FAIL (a) no text unit: 161, 162, 163, 452; (b) na without twin: 68; (c) parts: 785 no parts, 786 no parts, 787 no parts, 788 no parts
db-test: passed 0, failed 1, units 1
exit=1
```

## Task 8 — after 121 (FAILS the 1.25× rule; blocker for the PM)

Same probe, right after 121 was applied, before 122: final exam date 44.335, 42.089, 36.946,
36.593, 36.574 ms (median 36.946, 1.79× before); attendance policy 49.771, 49.378, 49.109,
49.487, 50.382 ms (median 49.487, 1.40× before).

History (121 as applied, superseded by 129 below; written without the `=` form so the
check's grep counts only the current lines): after-121 final median 36.946 ms, after-121
attendance median 49.487 ms.

Cause, found by dry runs inside `begin; … rollback;` with each body swapped in (5 warm runs each):

| body | final exam date | attendance policy |
|---|---|---|
| pre-121 (the old body, re-created in the transaction) | 20.200 | 35.838 |
| 121 as applied | 36.946 | 49.487 |
| 121 with lazy `case` in `chosen` only | 36.811 | 48.707 |
| 121 with `hit as materialized` and `chosen as materialized` | 19.652 | 35.537 |

The planner inlines the chain of single-use CTEs and substitutes each derived column's expression
at every reference, so the `substring`/`to_tsvector` expressions behind `slice_in_notes`,
`pre_raw` and `post_raw` are evaluated many times per row. Materializing the 10–12-row `hit` and
`chosen` CTEs restores parity with the old body (both within 3% of it), and the label rule is
unchanged. 121 is applied and may not be edited, and every number in 120–129 is already assigned,
so the repair needs a migration slot the PM names. `part_fts` stays not built (both
before-medians under 50 ms).

## Migrations applied (all nine md5s match the LF blob at the committing SHA)

| name | version | md5 (statements[1] = `git show HEAD:<file> \| md5sum`) |
|---|---|---|
| 120_supersede_file_chains | 20260929172703 | 505acb95ec9884441baad779539772bc |
| 121_search_notes_label | 20260929173148 | 86c19ac23c00bd22d84c2e78934441e8 |
| 122_supersede_replaced_files | 20260929173811 | 92239814305baa122606ae1d7a5a6b78 |
| 123_file_week_session_links | 20260929174144 | 9fb583ba33588ed7cec66b7592501328 |
| 124_stage_files_rules | 20260929174434 | fb3a1e542f5eecf6601c0e623c793809 |
| 125_geo103_reading_routes | 20260929174526 | c1e0b4207b98e34ac017adf5f9057a65 |
| 126_assignment_bb_url | 20260929175023 | 15da113fe17aaf6eec5c56b7bf25b9e7 |
| 127_retire_ical_poll | 20260929175100 | 8699a61900e0a199b389283ec8b53623 |
| 128_db_test_runner_phase18_grants | 20260929175130 | 6611ad0d1e551c417c95070881215281 |

Each was dry-run first inside `begin; … rollback;` with the checks its test makes (122, 124 and
126 also re-created and exercised in the same transaction; 124 and 126 line-diffed against the
live `prosrc`: only the intended lines differ, plus the old body's trailing `end ` space).
`get_advisors` (security) after 128: no `function_search_path_mutable` finding (only the two
accepted lint-0029 WARNs and leaked-password protection).

## Task 9 — migration 122 + `db/tests/phase18_122_supersede_rule.sql` (DRIFT, not green)

RED: `FAIL  phase18_122_supersede_rule.sql  function supersede_replaced_files(uuid, bigint) does not exist`, exit 1.

GREEN run (after 128):

```
FAIL  phase18_122_supersede_rule.sql  FAIL (1) newest run f24a7ff5-6ee2-4ecd-98b9-6584ec59b5ba wrote 3: 2->151, 74->149, 150->162
db-test: passed 0, failed 1, units 1
exit=1
```

Drift: the brief expects exactly 2 writes. Since it was read, two crawls were registered
(6923d85d on 9/27, f24a7ff5 on 9/29). In f24a7ff5, IST.466 item `_12939679_1` ("Class Schedule")
carries only `IST466_2Schedule_wK5.docx` (file 162), replacing `IST466_2Schedule_wK4.docx` (file
150, current, `missing_since_run=6923d85d…`). So the rule correctly writes a third link,
150 → 162. Assertions (2)–(6) pass (replay 0; 31/32/47/155/156 and `stack` rows unchanged; older
run 6923d85d → `older_run` true, 0 writes; the name-only synthetic raises 1 question, writes 0).
The test keeps the brief's expectation; the PM decides whether (1) becomes the three links. 122
itself writes no data. 150 stays current in prod until the next real fold, which 124 now
supersedes to 162.

## Task 10 — migration 123 + `db/tests/phase18_123_file_sessions.sql`

RED: `FAIL  phase18_123_file_sessions.sql  function link_file_sessions(unknown) does not exist`, exit 1.

Backfill counts (dry run and apply): hand links 3; `weeks_set` 18, `sessions_linked` 21,
`ambiguous` 10, `attention_raised` 10 (open questions for files 6, 7, 8, 18, 19, 30, 44, 119,
152, 157); replay 0/0/0. `link_confidence` is written only where null, because 4 files (67, 69,
142, 143) carry 086's reading-link coverage there: a deviation from the brief's "(link_confidence
1.0)" for those four, noted for the PM. Sessions of kind `no_class` are never candidates (file
67's reading date 9/7 is Labor Day, so it links to 9/9 through the week at 0.8).

GREEN (after 128):

```
PASS  phase18_123_file_sessions.sql
db-test: passed 1, failed 0, units 1
exit=0
```

Prod: `select count(*) from bb_files where (id, session_id) in ((31,129),(47,130),(32,131))` → 3.

## Task 11 — migration 124 + `db/tests/phase18_124_stage_files_replay.sql`

RED: `FAIL  phase18_124_stage_files_replay.sql  permission denied for function stage_files`, exit 1
(the dry run as the owner showed the old body's `counts` without `superseded_auto` /
`session_links`).

The test folds the newest crawl once, then replays it. The first fold inside the transaction
changes one row, 150 (the task 9 drift, superseded to 162); the replay changes 0.
`stage_content` md5 = `92260a274cb7bcc356de5d0fa9910084`, as recorded before 124.

GREEN (after 128):

```
PASS  phase18_124_stage_files_replay.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## Task 12 — migration 125 + `db/tests/phase18_125_geo103_reading_routes.sql`

RED:

```
FAIL  phase18_125_geo103_reading_routes.sql  FAIL (1) still on_blackboard: 39, 41, 44, 49, 52, 58, 59, 60, 61, 62; (2) reading 45 url: null
db-test: passed 0, failed 1, units 1
exit=1
```

GREEN:

```
PASS  phase18_125_geo103_reading_routes.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## Task 13 — migration 126 + `db/tests/phase18_126_assignment_bb_url.sql` (count DRIFT)

RED: `FAIL  phase18_126_assignment_bb_url.sql  function assignment_bb_url(unknown, unknown) does not exist`, exit 1.

GREEN (after 128):

```
PASS  phase18_126_assignment_bb_url.sql
db-test: passed 1, failed 0, units 1
exit=0
```

Prod: `select count(*) from assignments where bb_url like 'https://blackboard.syracuse.edu/ultra/courses/%/outline/assessment/test/%gradeitemView=details'`
→ **40**, not the brief's 37: assignments grew from 88 to 93 rows since 2026-09-24, and 40 of
them now point at a `resource/x-bb-asmt-test-link` item (1 survey, 3 with no content row, 19
column-only stay null). 126's backfill guard holds 40, the count read in its dry run.
`assignment_bb_url('IST.323','_12928193_1')` = the walk's expected Lab 1 URL (test assertion 1).

## Task 14 — migration 127 (no db/tests file; `execute_sql` reads)

Before: `cron.job` had `bb2dash-ical-poll` (jobid 2, `17 6 * * *`). After apply:
`select count(*) from cron.job where jobname = 'bb2dash-ical-poll'` → 0;
`… jobname in ('bb2dash-transform-tick','bb2dash-calendar-push')` → 2.

ical_sync_runs_at_apply=19
ical_apply_time_utc=2026-09-29 17:51:00 (migration version 20260929175100; last ical row 2026-09-29 06:17:00 UTC)

The 48-hour re-read (`select count(*) from sync_runs where source = 'ical'` → 19) is the PM's.

## Migration 128

`has_function_privilege('db_test_runner', …, 'EXECUTE')` → true for all five functions in the
dry run. One grant beyond the brief's row: `stage_files(uuid, bigint)`, which task 11's test
calls (124 keeps 038's service_role-only ACL). Tasks 9, 10, 11 and 13's GREEN runs above were
taken after 128.

## Task 25 (DATA_SYNTAX part)

`grep -cF "highlighted snippet" DATA_SYNTAX.md` → 1 before, 0 after. The search section now
states each mode's shape, the notes rule (121), auto-supersession (122/124), week and session
links (123), `assignment_bb_url` (126); the iCal note records 127.

## Whole suite after 128 (for the PM)

`node scripts/db-test.mjs` → passed 25, failed 4. Mine: `phase18_122_supersede_rule.sql` (task 9
drift above) and `phase18_post_embed_checks.sql` (`(a) 161, 162, 163, 452; (b) 68`, the gate
sync's and task 20's). Not from 120–128: `phase12b_077_inbox_feedback.sql` (`v_inbox_feedback
does not exist`) and `phase15_100_db_test_runner_role.sql` (the role has USAGE on a new schema
`private`); both come from objects changed outside this range.

## Round 2 — task 9 GREEN (PM call)

The PM ruled the third write correct. The brief's "exactly 2" was read before the 2026-09-29
crawl f24a7ff5, in which IST.466 item `_12939679_1` carries only wK5 (162), replacing wK4 (150).
Assertion (1) now requires exactly the three links by id: 2→151, 74→149, 150→162.

GREEN:

```
PASS  phase18_122_supersede_rule.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## Round 2 — task 8 repair: migration 129 (PM call)

`db/migrations/129_search_notes_label_materialize.sql`: both search functions re-created from
121's bodies with `hit` and `chosen` (hybrid) and `chosen` (keyword) `materialized`; nothing
else changed (a `diff` of the function text against 121 shows only those three lines).

New test `db/tests/phase18_129_search_materialize.sql`: (m) both live bodies are materialized;
(r) 121's bodies re-created as `pg_temp` functions give the same rows, in order, as the live
functions for "final exam date" and "attendance policy" (hybrid limit 12 with W10 B3's probe,
keyword limit 20). It carries no fixed values, so it holds on any corpus.

RED (before 129): `FAIL  phase18_129_search_materialize.sql  FAIL (m) not materialized: hybrid_search_file_text, search_file_text`, exit 1.

Dry run (`begin; <129>; …; rollback;`): results before and after identical (hybrid 12/12 rows
both queries, keyword 4 and 10 rows); medians 19.535 / 35.598 ms.

Applied: `apply_migration` name `129_search_notes_label_materialize`, version 20260929175709.
md5 `statements[1]` = `a634e4a02edaac98159de6efa9177048` = `git show HEAD:db/migrations/129_search_notes_label_materialize.sql | md5sum`.

After 129, 5 warm runs each, limit 12. A first run right after apply was contended (final 21.0,
27.9, 29.8, 33.0, 31.5; attendance 58.6, 58.3, 59.2, 47.6, 36.1 ms, rising and falling within the
run) and is kept here as history; the re-run a minute later was steady: final exam date 20.780,
20.578, 19.977, 19.474, 19.449 ms; attendance policy 35.620, 35.755, 35.431, 35.605, 35.699 ms.

after_final_median_ms=19.977
after_attendance_median_ms=35.62

19.977 ≤ 1.25 × 20.655 (25.82) and 35.62 ≤ 1.25 × 35.456 (44.32): the R-77 rule holds.

GREEN:

```
PASS  phase18_129_search_materialize.sql
PASS  phase18_121_search_contract.sql
FAIL  phase18_post_embed_checks.sql  FAIL (a) no text unit: 161, 162, 163, 452; (b) na without twin: 68
```

Post-embed (d) no longer appears, so (d) PASSes; (a) and (b) wait on the gate sync and task 20.
