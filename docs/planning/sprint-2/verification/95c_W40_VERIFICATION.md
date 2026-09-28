# 95c — W-40 verification note (Phase 15, the migrations stream)

Worker W-40 · branch `feat/db-hygiene-15-migrations` · worktree `bb2dash-wt-15-migrations`
Owns `db/migrations/101_search_path_pin.sql`, `db/migrations/102_planner_series_orphan_trigger.sql`,
`db/tests/phase15_101_search_path_pin.sql`, `db/tests/phase15_102_planner_series_orphan.sql`,
`DATA_SYNTAX.md` (the Recurrence paragraph only), and this file.
Task order (brief 95 §Workers): **12, 14, 15, 13, 16**.

**Wave 1 (2026-09-27) applied nothing to prod.** Migration 100 (W-38's) is not on prod yet and
`scripts/db-test.mjs` is not on this branch yet, so every check below was run by pasting a whole
unit into one `mcp__plugin_supabase__execute_sql` call — the way the suite ran all through sprint 1
— and each migration was dry-run inside `begin; … rollback;`. `apply_migration` was not called.
No Auth or dashboard setting was touched. Prod was re-read after every rollback (§Prod is clean).

---

## Task 12 — `db/tests/phase15_102_planner_series_orphan.sql`, RED first

**The check, as brief 95 §Task list row 12 writes it:**

> before 102: runner `--only phase15_102_planner_series_orphan.sql` →
> `db-test: passed 0, failed 1, units 1`, exit 1 (the detached-last-row case)

**Runner form: waiting on W-38.** `scripts/db-test.mjs` is not on this branch and there is no
`.env.local` on this machine (Stack writes it at task 5), so the paste form of the same unit was
run instead. The runner's pass rule is "the server raises nothing **and** a row's first column ends
in `: PASS`", so a raised `FAIL …` is exactly what makes the runner print `FAIL` and exit 1.

**What the file covers** (all five cases brief 95 row 12 names, in this order):

1. a detached last row's plain delete → 0 series
2. "This event" on the last attached row → 0 series
3. a series with rows left is untouched (rule, `until_date` and the survivor's `series_id`)
4. a stranger uid deletes nothing, and the owner's series survives whole
5. `planner_series_delete` 'following' from the first occurrence, and 'all', still return 2

Case 1 is first because it is the reported bug (Phase 12b tail finding W-3) and the case the RED
check names. Read against `db/migrations/082_*`, `083_*`, `088_*` and
`web/src/lib/queries.plannerSeries.ts` before writing, so the cases match the real RPCs and RLS.

### RED output (2026-09-27)

Command: the file's header through case 1, pasted into one `execute_sql` call against
`goultdzqcavefcgnifdy` (`begin;` … `rollback;`).

```
ERROR:  P0001: FAIL series 08a59f32-ebfa-4ba2-b7aa-6926f1d4bf73 outlived its last occurrence: a detached row deleted the plain way left the rule behind
CONTEXT:  PL/pgSQL function inline_code_block line 27 at RAISE
```

That is the detached-last-row case, failing for the right reason: today nothing deletes a series
whose last occurrence went by a plain row delete, because "this event" is not an RPC.

### GREEN, proved against a dry run of 102 (task 13's evidence too)

Command: migration 102's whole text, then the whole test file minus its own `begin;`/`rollback;`,
in one `execute_sql` call wrapped in `begin; … rollback;`.

```
[{"result":"phase15_102_planner_series_orphan: PASS","trigger_present":1,"planner_events_at_start":"1","series_at_start":"0"}]
```

All five cases pass under the trigger, the whole-table orphan count is 0, and
`planner_events` / `planner_event_series` end on the counts they started with (1 and 0).

### Notes on the fixture

* Every instant is derived from `now()` (`date_trunc('hour', now()) + interval 'N days'`), never a
  literal date, so this file cannot age out the way `phase10a_stage_gradebook.sql` did (P-30) or
  the way brief 95 §Open items row 6 warns `phase12b_082_083_planner_series.sql` eventually will.
* Zone `UTC` with `Z` offsets and `all_day false` satisfies 067/069's K-2 and K-3 without depending
  on a DST rule.
* Ids travel in transaction-local GUCs, not a temp table: the file runs as `authenticated`, which
  holds no TEMP privilege (the `phase12b_082_083` convention).
* **Nothing was ever committed.** A committed `planner_events` row reaches Stack's real Google
  calendar within two minutes (DECISIONS 2026-09-16), so every unit above ended in `rollback`.
