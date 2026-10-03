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

## Task 8 — the scrubbed recorded crawl

* Source: run `3b5174b8-1347-448f-96db-50a0b635dc58` (request 39, `sync_runs` 62), read on 2026-10-03
  through the SQL test credential by `node db/fixtures/phase14/scrub_crawl.mjs --from-db`; scrubbed in
  memory, then written. 9 rows; 272 non-empty values removed.
* `SCRUB_FIELDS` (W-55's call, beyond the brief's `studentSubmission`): `studentSubmission`,
  `studentComments`, `feedback`, `instructorFeedback`, `score`, `manualScore`, `effectiveScore`,
  `displayScore`, `displayGrade`, `receipt`, `receiptId`, `email`, `body`, `description`. A first pass
  without `body` and `description` still carried professors' email addresses and a mobile number in
  announcement and content bodies (6 `@syr.edu` hits); after it: 0 `.edu` addresses, 0 phone-like
  strings. Why each key is there: `db/fixtures/phase14/README.md`.
* The sync package skeleton (`sync/package.json`, `package-lock.json`, `tsconfig.json`,
  `vitest.config.ts`) lands with this task because its check runs under `sync/`.

RED (test first, no fixture yet):

```
cd sync && npx vitest run test/fixture-scrub.test.ts
 FAIL  test/fixture-scrub.test.ts
 Error: ENOENT: no such file or directory, open '…/db/fixtures/phase14/crawl_v4_scrubbed.json'
 Test Files  1 failed (1)      Tests  no tests
```

GREEN:

```
cd sync && npx vitest run test/fixture-scrub.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

The 091 unit's RED line, after the loader exists and before 091 (task 6's check):

```
node scripts/db-test.mjs --only phase14_091_sync_runner.sql
FAIL  phase14_091_sync_runner.sql  FAIL phase14_091: migration 091 is not applied (no role sync_runner)
db-test: passed 0, failed 1, units 1
exit 1
```
