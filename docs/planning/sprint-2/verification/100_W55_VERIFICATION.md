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

## Task 7 — 091: the role, `claim_attempts`, the twelve functions and the helper

Precondition, read on prod just before the dry run and again just before the apply (2026-10-03):

```
select count(*) from supabase_migrations.schema_migrations where name in ('100_db_test_runner_role',
  '135_sync_run_open_at_claim', '136_transform_tick_register_first', '137_sync_status_run_state')
4
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  and p.prosecdef and has_function_privilege('public', p.oid, 'execute')
0
open sync requests (queued or claimed): 0
```

Dry run, two passes in `begin; … rollback;` through `execute_sql` (as `postgres`, with an in-transaction
`grant sync_runner to postgres with inherit false, set true` standing in for 094's test-role grant, and a
nine-row stub in place of the 284 KB loader):

1. 091 + 094 + the unit's sections 0–11: sections 0–8 passed; section 9 failed on the unit's own
   bug (section 3 had closed a request `done` today, so the login trigger correctly queued nothing).
   The unit now clears that row before section 9 (commit 245d986).
2. 091's section-9/10 functions + 094's grants + sections 9–11: all passed, ending at the
   deliberate final `raise`.

The `log_connections` refusal (DoD, `/security-review` item), tried once at the end of the dry run:

```
alter role sync_runner set log_connections = on;
55P02 parameter "log_connections" cannot be set after connection start
```

So the platform refuses it, and the runner's own per-connect log line (`sync/src/db.ts`) stands.

Applied as `091_sync_runner_role` from commit 245d986. Recorded statement vs the repo blob (DoD method):

| Migration | prod `md5(statements[1])` | `git show HEAD:db/migrations/<file> \| md5sum` | bytes |
|---|---|---|---|
| `091_sync_runner_role` | `6b577e2f09310c189a0a1078c4841f80` | `6b577e2f09310c189a0a1078c4841f80` | 28559 |

Post-apply checks (task 7 (b)):

```
twelve names  -> sync_claim,sync_close,sync_enqueue,sync_file_stored,sync_file_worklist,sync_login_ok,sync_login_required,sync_next,sync_register_run,sync_requeue_orphans,sync_run_outcome,sync_sweep_stale
table privileges of sync_runner on public tables/views -> 0
anon/authenticated execute on the twelve and the helper -> 0
select count(*) from cron.job where jobname like '%scheduled-sync%' -> 0   (task 13 (b))
```

### Owed to Stack (task 7 (d)): the password, then `--ping`

1. In the Supabase SQL editor for project `goultdzqcavefcgnifdy`, in an unsaved tab, with a password
   he picks (never written to a file, a commit or a chat):

   ```sql
   alter role sync_runner with password '<he picks>';
   ```

2. Then, from the root of a bb2dash checkout, PowerShell (the DSN lives only in that shell; URL-encode
   any `@`, `:`, `/`, `?`, `#` or `%` in the password):

   ```powershell
   $env:BB2DASH_TEST_DB_URL = 'postgresql://sync_runner.goultdzqcavefcgnifdy:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require'
   node scripts/db-test.mjs --ping
   Remove-Item Env:BB2DASH_TEST_DB_URL
   ```

   Expected: `db-test: connected as sync_runner`, exit 0. The line goes here. The same DSN is the
   value of the `sync_runner_db_url` secret file (`C:/Users/stack/.bb2dash-secrets/`, via
   `set-secret.ps1`).

`--ping` line: _owed (Stack)._

## Task 7a — 094: the test role's membership

RED, with the expected list amended and before 094 was applied:

```
node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql
FAIL  phase15_100_db_test_runner_role.sql  FAIL db_test_runner memberships are anon(inherit=f,set=t), authenticated(inherit=f,set=t), expected anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t)
db-test: passed 0, failed 1, units 1
exit 1
```

Applied as `094_sync_runner_test_membership` from commit e978214:

| Migration | prod `md5(statements[1])` | `git show HEAD:db/migrations/<file> \| md5sum` | bytes |
|---|---|---|---|
| `094_sync_runner_test_membership` | `90aa5bc9944bfdc1de77bb17d9432710` | `90aa5bc9944bfdc1de77bb17d9432710` | 3901 |

```
select count(*) from pg_auth_members m where m.roleid = 'sync_runner'::regrole
  and m.member = 'db_test_runner'::regrole and not m.inherit_option          -> 1
select rolbypassrls from pg_roles where rolname = 'sync_runner'               -> false
ls db/migrations | grep -c "^09[1-9]_"                                        -> 2
select count(*) from supabase_migrations.schema_migrations where name ~ '^09[1-9]_'  -> 2
```

GREEN:

```
node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql
PASS  phase15_100_db_test_runner_role.sql
db-test: passed 1, failed 0, units 1
exit 0
```

## Task 6 / 11 / 13 — the 091 unit GREEN

The first run after 094 failed on the unit itself: section 11's sequence check called
`has_sequence_privilege` on an index in `auth` (`"saml_providers_pkey" is not a sequence`) because the
planner evaluated it before the relkind filter. The check is now guarded by a `CASE`; no SQL in 091
changed.

```
node scripts/db-test.mjs --only phase14_091_sync_runner.sql
PASS  phase14_091_sync_runner.sql
db-test: passed 1, failed 0, units 1
exit 0

ls db/migrations | grep -c "^092_"
0

node scripts/db-test.mjs            (whole suite)
db-test: passed 60, failed 0, units 60
exit 0
```

## Task 9 — the runner core and the login watch

`sync/src/login.ts` (the login rule, `LoginWatch`, ported from the spike's `session-age.mjs`),
`sync/src/loop.ts` (one pass, the loop), `sync/src/crawl.ts` (run id, crawler injection, fold wait),
`sync/src/db.ts` (the twelve RPCs over a query function; the pg adapter with its per-connect log
line), `sync/src/report.ts` (its tests are task 11's).

RED (tests first):

```
cd sync && npx vitest run test/login.test.ts
 FAIL  test/login.test.ts
 Error: Cannot find module '../src/login.js' imported from …/sync/test/login.test.ts
 Test Files  1 failed (1)      Tests  no tests

cd sync && npx vitest run test/loop.test.ts
 FAIL  test/loop.test.ts
 Error: Cannot find module '../src/loop.js' imported from …/sync/test/loop.test.ts
 Test Files  1 failed (1)      Tests  no tests
```

GREEN (after one test fix: the loop does not sleep after the pass that saw the stop):

```
cd sync && npx vitest run test/login.test.ts test/loop.test.ts
 Test Files  2 passed (2)
      Tests  42 passed (42)
```

The brief's named cases, each a test: every `LOGIN_HOSTS` entry (classifyProbe, and a pass on a
login-host tab); `users/me` 401 and 403 close `queued → failed`; claim lost; register refused (and a
quarantined 42501); fold timeout leaves the row claimed; crawl throws → failed; done. Login watch on
vitest's fake clock: a dead start calls `sync_login_required` once and probes every `LOGIN_WATCH_MS`;
dead → alive calls `sync_login_ok` then `sync_enqueue('login')` once; alive ticks every
`KEEPALIVE_MINUTES` ± jitter and loads the `KEEPALIVE_PAGES` in turn; a tick during a pass is
skipped; a dead probe loads `/ultra/` once before raising, and a 200 after it raises nothing; while
dead nothing navigates; alive → dead raises again; `KEEPALIVE_MINUTES=0` stops the ticks.
`MAX_CLAIM_ATTEMPTS` is read out of 091's two `c_max_claim_attempts` constants and must equal the TS
one.

Design calls (W-55):

* A pass's step-3 probe is the watch's own `check`, so it gets the same silent re-login before a
  request is failed as `login_required`, and it is serialised with the keep-alive on the one tab.
* A probe that answers neither 200 nor 401/403 (a 500, a network error) changes nothing: the
  request stays queued for the next pass and the watch probes again in `LOGIN_WATCH_MS`.
* A transition's RPC that fails (the database unreachable) is retried on the next check, so a
  login death is never left un-raised.
* The report's `claim_attempts` counts this process's claims of the request (the role cannot read
  `agent_requests.claim_attempts`); a restart starts the count again.
