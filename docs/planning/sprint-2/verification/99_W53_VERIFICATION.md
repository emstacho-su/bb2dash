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
