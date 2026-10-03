# 100 · W-55 verification — the sync runner and its database side (tasks 6–13, 7a)

Worker W-55, Phase 14 (brief `docs/planning/sprint-2/briefs/100_PHASE14_containers.md`). Branch
`feat/containers-14-sync` in bb2dash, worktree `C:/Users/stack/projects/bb2dash-wt-containers-14-sync`,
cut from `feat/containers-14` at 3284858 (Phase 19 merged from `main`). Machine: stack-laptop,
Windows 11, Node v24.19.0, npm 11.17.0. The SQL test credential is `.env.local` (gitignored); no
secret was printed, written to a file or committed.

Baseline before any change: `node scripts/db-test.mjs` → `db-test: passed 59, failed 0, units 59`
(the PM's run, 2026-10-03).

## PM calls taken during the work (2026-10-03)

1. **Named-hunk edit of Phase 15's `scripts/db-test.test.mjs`.** Its test "the loader map is frozen and
   holds exactly the three sprint-1 pairs" (`scripts/db-test.test.mjs:95-102`) deep-equals the map, so
   task 6's one loader-map entry fails it. The PM said yes: the fourth pair is added to that test's
   expected object and nothing else in the file changes. Both Phase 15 files are edited only in their
   named hunk: `scripts/db-test.mjs` (`LOADER_MAP`, one line) and `scripts/db-test.test.mjs` (the
   expected object, one line).
2. **094 grants `sync_login_sync_due(timestamptz)` to `db_test_runner`.** The 091 unit has to ask the
   helper about fixed instants (2026-10-31 03:30Z, the 2026-11-01 fall-back); `sync_enqueue` only
   ever passes `now()`. The PM said yes, on three conditions, all met: the helper's comment and 094's
   header say the test role is its only grantee besides the owner, and why; the unit still asserts
   that `sync_runner`, `anon` and `authenticated` cannot execute it; the helper stays `stable` and
   read-only. The PM writes the DECISIONS row at integration.

## Task 6 — the 091 unit first, and the loader-map entry

* `db/tests/phase14_091_sync_runner.sql` written before 091 exists, sections 0–11 covering the brief's
  assertion list (§Tables and migrations) in order.
* `scripts/db-test.mjs`: one entry in `LOADER_MAP`, `'phase14_091_sync_runner.sql':
  'phase14_load_crawl_v4.sql'`.

```
node scripts/db-test.mjs --list | grep -c "phase14_load_crawl_v4.sql + phase14_091_sync_runner.sql"
1

node --test scripts/db-test.test.mjs
ℹ tests 59
ℹ pass 59
ℹ fail 0
```
