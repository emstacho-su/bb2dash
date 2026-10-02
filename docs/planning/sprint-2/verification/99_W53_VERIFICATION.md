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
