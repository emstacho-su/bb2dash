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

after_final_median_ms=36.946
after_attendance_median_ms=49.487

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
