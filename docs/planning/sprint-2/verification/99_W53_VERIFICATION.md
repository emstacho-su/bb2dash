# 99 — W-53 verification (Phase 19, sync honesty: the driver)

Worker W-53 · branch `feat/content-history-19-driver` · worktree `bb2dash-wt-content-history-19-driver` ·
brief 99 (frozen 2026-10-02). Tasks 2, 12–18.

Prod reads this work started from (2026-10-02, `execute_sql`, read-only): `pg_get_functiondef` of
`run_transform(uuid, text)` and `transform_tick()`, `pg_get_viewdef` of `v_sync_status` and
`v_data_freshness`. No sync request was `queued` or `claimed`, no `sync_runs` row was `running`, and
`sync_stage_runs` held 0 `history` rows.

## Task 2 — the two tests, written first (RED)

Before 135–137 exist on prod:

```
$ node scripts/db-test.mjs --only phase19_135_136_sync_driver.sql
FAIL  phase19_135_136_sync_driver.sql  FAIL phase19_135_136: migration 135 is not applied (sync_runs.interrupted_at, sync_request_open_run() or the trigger agent_requests_open_sync_run is missing)
db-test: passed 0, failed 1, units 1
exit=1

$ node scripts/db-test.mjs --only phase19_137_sync_status.sql
FAIL  phase19_137_sync_status.sql  FAIL phase19_137: migration 137 is not applied (v_sync_status columns are id,run_id,status,started_at,finished_at,trigger,summary,open_attention,freshness)
db-test: passed 0, failed 1, units 1
exit=1
```

Fixtures, as the task row lists them. Driver unit: a claim with `run_id` (A, one update; B, inserted
claimed); a claim naming a quarantined run (section 8, against the row the tick itself quarantined);
a registered run with a course row and no calendar row, aged 5 min (A, tick 1); the same with its
calendar row (A, tick 2); a `running` row aged 31 min (F); a claimed request with no `run_id`, aged
31 min (G). Added beyond the row: the installed skill's order (C: claim, crawl, then `run_id`), the
29-minute and fresh-row boundaries (H, B), an interrupted run whose calendar row lands late, and the
drain's newest-complete pick (E, T). 137 unit: a reaped run; the `history` stage with no row, one
`failed` row, one `ok` row finished two days ago, one finished now (plus 23 hours, the one-day edge).

## Drafts of 135–137 and the pre-gate dry run (2026-10-02)

Ordering gate when the drafts were written: `select name from supabase_migrations.schema_migrations
where name ~ '^13[0-4]_' order by name` → `130_bb_content_ghost_collapse` only. 131–134 were not on
prod, so nothing was applied.

Dry run, one `execute_sql` call: `begin; set local lock_timeout = '500ms';` + 135 + 136 + 137 + the
bodies of both test files + `rollback;`. Two changes from the files, both because 132's
`material_history_record(uuid)` did not exist yet: 135's closing guard for that function was left
out, and the driver unit's `history = ok` assertion read `failed`. Every other assertion ran as
written and none raised. The summary row:

| | |
|---|---|
| folded run (fixture A) | `partial` |
| its stages | `announcements=ok, assignments=ok, attempts=ok, content=ok, courses=ok, files=ok, gaps=ok, gradebook=ok, history=failed` |
| history error | `42883 function material_history_record(uuid) does not exist` |
| reaped notes (fixture F) | `w53 fixture: died with its tab \| interrupted (reaped)` |
| Inbox question | "A Blackboard sync did not finish within 30 minutes and was marked interrupted. Nothing from it was folded in. Press Sync to run it again." |
| open items for the two closed requests | 2 |
| `v_sync_status` on the reaped fixture | `status = failed`, `interrupted = true` |

So the history stage's failure path is proven here (one failed stage, the run `partial`, the other
eight `ok`), which no committed unit can force once 132 exists. After the rollback prod read: 0
trigger, 0 `interrupted_at` column, no `sync_request_open_run()`, 0 fixture rows.

## Task 18 — runbook step 5 and the crawler's comments

Done before the ordering gate opened (it needs no prod apply). Runbook: step 5 only. Crawler: the
`runAll({ runId })` header block and the comment above `runAll`; no code line changed.

```
$ grep -c 'opened when the sync request is claimed' ingest/CADENCE_RUNBOOK.md
1
$ grep -c 'WHY THE SKILL STILL REGISTERS AFTER THE CRAWL' ingest/bb_crawler.js
0
$ grep -c 'It is NOT yet safe' ingest/bb_crawler.js
0
$ git diff -U0 -- ingest/bb_crawler.js | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' | grep -vE '^[+-]\s*(\*|//)' | wc -l
0
$ cd web && npx vitest run test/crawler.announcements.test.ts test/crawler.attempts.test.ts
 Test Files  2 passed (2)
      Tests  114 passed (114)
```

Not edited, outside this worker's lines, and now stale: runbook step 1 still shows
`bb.runAll({termName: 'Fall 2026'})` with no `runId`, and the crawler header's line 4 still names
the built-in Claude browser. Flagged to the PM.

## Post-gate dry run, with the real 132 (2026-10-03)

Gate: `130_bb_content_ghost_collapse, 131_bb_content_item_key, 132_material_history,
133_course_stream_history, 134_sync_change_lines_materials` on prod (applied by the PM);
`material_history_record(uuid)` present, returns `jsonb`, ACL `postgres, service_role,
db_test_runner`; `bb_material_history` 229 rows; open syncs 0, running rows 0, queued transform
requests 0.

Two `execute_sql` calls, each `begin; set local lock_timeout = '500ms';` + the full text of 135, 136
and 137 (comments stripped, nothing else changed, 135's `material_history_record` guard included) +
test bodies + `rollback;`. No migration line changed after this run: the three blobs are byte-equal
to `ae33266`'s.

**Call A: 135 + 136 + 137 + `phase19_135_136_sync_driver.sql` (as committed).** No assertion raised.

| | |
|---|---|
| result | `phase19_135_136_sync_driver: PASS` |
| folded run (fixture A) | `ok` |
| its stages | `announcements=ok, assignments=ok, attempts=ok, content=ok, courses=ok, files=ok, gaps=ok, gradebook=ok, history=ok` |
| history counts | `{"appeared":0,"changed":0,"vanished":0,"baseline_courses":0,"older_run":false,"sample":[]}` (fixture shells resolve to no course) |
| summary.changes | `["1 Blackboard shell(s) match no course here"]` |
| reaped notes (fixture F) | `w53 fixture: died with its tab \| interrupted (reaped)` |
| open items for the two closed requests | 2 |

**Call B: 135 + 136 + 137 + `phase9_transform_states.sql` + `phase19_137_sync_status.sql`.** No
assertion raised. One addition between the two bodies, dry-run only: phase 9's fresh `running`
fixture row was deleted after its unit had asserted on it, so the 137 body started from the same
state it has when it runs alone.

| | |
|---|---|
| phase 9: folded status | `partial` |
| phase 9: stages | `announcements=failed, assignments=ok, attempts=ok, content=ok, courses=ok, files=ok, gaps=ok, gradebook=ok, history=ok` (exactly one failed, as it asserts) |
| phase 9: reaped notes | `phase9 fixture: died with its session \| interrupted (reaped)` |
| phase 9: fresh row | `running` |
| 137: view row | `status = failed`, `interrupted = true`, notes end `interrupted (reaped)` |
| 137: streams at the end | `announcements=stale, assignments=fresh, attempts=fresh, content=fresh, courses=fresh, files=fresh, gaps=fresh, gradebook=fresh, history=fresh` (announcements: its last `ok` on prod is 2026-10-01, more than a day old; phase 9's fixture fold failed that stage) |

Checked after both rollbacks: no trigger, no `interrupted_at`, no `sync_request_open_run()`, 0
fixture rows on prod.

Runbook step 1 (outside step 5, allowed by the PM on 2026-10-03): its example now reads
`bb.runAll({ termName: 'Fall 2026', runId })` with the run id step 2 registered.

## Tasks 12–16 — post-apply checks (2026-10-03)

The PM applied 135, 136 and 137 from `c846e1e` (135 and 136 back to back; 0 open syncs and 0
running rows just before). This branch then merged `origin/feat/content-history-19` (`0f08f2b`);
the merge changed none of W-53's files.

md5 on prod, `select md5(statements[1]) from supabase_migrations.schema_migrations where name = '<name>'`,
against `git show c846e1e:db/migrations/<file> | md5sum`:

| Migration | prod | blob | bytes |
|---|---|---|---|
| `135_sync_run_open_at_claim` | `adc27d3b3dee004ef4801519db78e260` | `adc27d3b3dee004ef4801519db78e260` | 17489 |
| `136_transform_tick_register_first` | `9feca071a6bc2c95239d3f1f48bae386` | `9feca071a6bc2c95239d3f1f48bae386` | 16689 |
| `137_sync_status_run_state` | `30ff47427f7b0d12ee0de259e127b16e` | `30ff47427f7b0d12ee0de259e127b16e` | 7354 |

Runner:

```
$ node scripts/db-test.mjs --only phase19_135_136_sync_driver.sql
PASS  phase19_135_136_sync_driver.sql
db-test: passed 1, failed 0, units 1
$ node scripts/db-test.mjs --only phase19_137_sync_status.sql
PASS  phase19_137_sync_status.sql
db-test: passed 1, failed 0, units 1
$ node scripts/db-test.mjs --only phase9_transform_states.sql
PASS  phase9_transform_states.sql
db-test: passed 1, failed 0, units 1
$ node scripts/db-test.mjs --only phase10a_stage_gradebook.sql
PASS  phase10a_stage_gradebook.sql
db-test: passed 1, failed 0, units 1
```

SQL checks:

| Task | Check | Expected | Actual |
|---|---|---|---|
| 12 | pre-135 count of `sync` requests `queued`/`claimed` | 0 | 0 (PM, just before applying) |
| 12 | `select count(*) from pg_trigger where tgname = 'agent_requests_open_sync_run'` | 1 | 1 |
| 12 | `select has_function_privilege('authenticated', 'public.sync_request_open_run()', 'execute')` | false | false |
| 13 | `select schedule from cron.job where jobname = 'bb2dash-transform-tick'` | `*/2 * * * *` | `*/2 * * * *` |
| 15 | `v_sync_status` columns (`pg_attribute`) | `id,run_id,status,started_at,finished_at,trigger,summary,open_attention,freshness,notes,interrupted,streams` | the same |
| 15 | `select has_table_privilege('anon', 'public.v_sync_status', 'select')` | false | false |
| 16 | `string_agg(e->>'stream', ',' order by e->>'stream')` over `streams` | `announcements,assignments,attempts,content,courses,files,gaps,gradebook,history` | the same |
| 16 | elements disagreeing with `v_data_freshness` | 0 | 0 |
| 16 | owner JWT, `set local role authenticated`, `jsonb_array_length(streams)` | 9 | 9 |
| 16 | before the first fold after 135: `select count(*) from sync_stage_runs where stage = 'history'` | 0 | 0 |
| 16 | before the first fold after 135: `history` element's `state` | `never` | `never` |

The "right after task 27" half of task 16 (`history` → `fresh`) is the PM's. When these were read,
a real register-first sync was in flight: request 580, inserted `claimed` with `run_id`
`c2789684-…` at 17:22:26 UTC. The two pre-fold values above were read while 0 `history` rows existed.
