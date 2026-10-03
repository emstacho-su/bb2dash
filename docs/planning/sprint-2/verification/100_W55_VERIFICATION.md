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

## Task 10 — files and embed on Phase 18's signed fetch and embed loop

RED:

```
cd sync && npx vitest run test/files.test.ts
 FAIL  test/files.test.ts
 Error: Cannot find module '../src/files.js' imported from …/sync/test/files.test.ts
 Test Files  1 failed (1)      Tests  no tests
```

GREEN:

```
cd sync && npx vitest run test/files.test.ts
 Test Files  1 passed (1)
      Tests  21 passed (21)

grep -c "fetch_signed.mjs" sync/src/files.ts
1
```

Named cases: the sha256 reaches `sync_file_stored`; `session_expired` (401 and 403) stops the step
and later rows are not tried; `gone` (404), `refused` (a redirect off the CDN) and a Storage 409 (and a
400 "Duplicate" answer) are reported in `not_pulled` and never passed to `sync_file_stored`; an
`EXDEV` from the move takes copy-then-unlink; `embed_corpus.mjs` is spawned once after ≥ 1 unit and
never on 0. Also: a relpath that climbs out of course-files is refused before any request (W-55's
addition: `bb_file_relpath` ends in Blackboard's own file name); bytes that are not the file; a
`bb_file_text` error; an extraction failure (bytes stored, `text_status` failed); `sync_file_stored`
refusing.

The extractor runs `uv run --locked --project ingest python ingest/extract_text.py <file>`, the
same command W-56's task 14 gives `extractUnits` on `feat/containers-14-images` (589e302), so the
runner and the pull use one locked set once the branches integrate.

## Task 11 — the report, the sweep, the login item and its self-close, and the skill's step 1

RED (`report.ts` held out of the tree while its test ran first):

```
cd sync && npx vitest run test/report.test.ts
 FAIL  test/report.test.ts
 Error: Cannot find module '../src/report.js' imported from …/sync/test/report.test.ts
 Test Files  1 failed (1)      Tests  no tests
```

GREEN:

```
cd sync && npx vitest run test/report.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)

node scripts/db-test.mjs --only phase14_091_sync_runner.sql
PASS  phase14_091_sync_runner.sql
db-test: passed 1, failed 0, units 1
```

The files line `report.test.ts` pins (task 28 quotes it beside `walk-14/03`): `Files: nothing new to
pull`, `Files: <n> pulled`, or `Files: <n> pulled, <m> not pulled`, then one `Not pulled: file <id>
(<reason>)` line per file, at most 10, then `…and <k> more not pulled`.

**Brief deviation (PM, 2026-10-03, from the launcher's code review):** the Chrome skill and the
container do not share a login item. `skills/bb-sync/SKILL.md` step 1's insert takes ref
**`chrome-login-required`**, not the brief's `sync-login-required`, which stays the container's alone
(raised by `sync_close` and `sync_login_required` with kind `stack_must_confirm` and entity
`agent_request`; archived only by `sync_login_ok()`, which never touches `chrome-login-required`).
Task 11's grep check becomes:

```
grep -c "'chrome-login-required'" skills/bb-sync/SKILL.md
1
grep -c "'sync-login-required'" skills/bb-sync/SKILL.md
0
grep -c "migration 031" skills/bb-sync/SKILL.md
0
```

`sync_login_required()` returns the open item's id by reading it back from `attention_items` after
`raise_attention`, which returns a boolean (041:127–130); the brief's bigint return stands.

## Task 12 — integration and coverage; the three entry points

`sync/src/secrets.ts` (three secrets from `X`, `X_FILE` or `/run/secrets/<name>`, BOM/CR/LF stripped, a
service key refused in every slot, the DSN refused on 6543 or without an encrypted sslmode),
`sync/src/main.ts` (`startRunner` on injected ports; `realDeps` wires Playwright, pg and the
filesystem), `sync/src/probe.ts`, `sync/src/enqueue.ts`.

RED:

```
cd sync && npx vitest run test/secrets.test.ts
 FAIL  test/secrets.test.ts
 Error: Cannot find module '../src/secrets.js' imported from …/sync/test/secrets.test.ts

cd sync && npx vitest run test/integration.test.ts
 FAIL  test/integration.test.ts
 Error: Cannot find module '../src/enqueue.js' imported from …/sync/test/integration.test.ts
```

GREEN, the DoD's sync line:

```
cd sync && npm run typecheck && npm run build && npx vitest run --coverage
 Test Files  7 passed (7)
      Tests  107 passed (107)
Statements   : 87.64% ( 681/777 )
Branches     : 81.89% ( 371/453 )
Functions    : 75.28% ( 131/174 )
Lines        : 89.94% ( 626/696 )
exit 0
```

`integration.test.ts`: the scrubbed crawl replayed twice through a fake page into a fake database
that answers the twelve functions by name (through the real `createRpc`), across two runner starts
with a `just sync-now` (`enqueue.js`) between them. The call order is
`claim, register, crawl, wait, files, embed, close`; a second pass on the done request calls nothing
after `sync_next()`; each replay lands 9 `bb_raw` rows under its own run id; the run's
`summary.changes` reads `["fold line", "Files: 1 pulled"]`. Playwright is mocked to pin the real
launch (`headless: false`, `chromiumSandbox: true`) and the probe (`users/me`, `maxRedirects: 0`).

The built entry points, run from the repo root with no credential:

```
node sync/dist/probe.js               -> users/me none 2026-10-03T21:22:45.227Z      exit 3
node sync/dist/probe.js --heartbeat   -> heartbeat stale or missing                   exit 1
node sync/dist/enqueue.js             -> enqueue: SYNC_RUNNER_DB_URL is not set: …    exit 2
node sync/dist/main.js                -> sync-runner: cannot start: SYNC_RUNNER_DB_URL is not set: …  exit 2
```

### For W-56 (task 15) and the PM: what the image and compose need from the runner

* Build: `cd sync && npm ci && npm run build` (esbuild bundles `src/main.ts`, `probe.ts`, `enqueue.ts`
  to `sync/dist/`; npm packages stay external, so `sync/node_modules` must be in the image; the
  `ingest/*.mjs` imports stay external and resolve to `/app/ingest/` at run time).
  `desktop/src/core/sync-id.ts` is bundled in, so the image needs no `desktop/`.
* Run: `node sync/dist/main.js` from `/app` as `pwuser` with `DISPLAY` set.
* Secrets: `sync_runner_db_url`, `supabase_publishable_key`, `supabase_anon_jwt` mounted at
  `/run/secrets/`; the runner reads them itself, so `docker compose exec sync node sync/dist/enqueue.js`
  needs no shim.
* Environment (all optional): `KEEPALIVE_MINUTES` (default 20; 0 turns the keep-alive off; the spike's
  `JITTER_MINUTES` and `LOGIN_WATCH_SECONDS` are fixed constants in the runner, not env),
  `BB_PROFILE_DIR` (default `/home/pwuser/bb-profile`), `COURSE_FILES_DIR` (default
  `/app/course context`), `SYNC_STATE_DIR` (default `/tmp/bb2dash-sync`), `SYNC_TMP_DIR` (default
  `/tmp/bb2dash-sync/downloads`; tmpfs), `SUPABASE_URL` (default the project's).
* Healthcheck: `node sync/dist/probe.js --heartbeat` (exit 0 while the heartbeat, written every
  30 s, is younger than 120 s).
* The image needs `uv` and `ingest/`'s locked project for `extract_text.py` (task 14), and Node for
  `ingest/embed_corpus.mjs`.

## Open, owed and found

* **Owed to Stack:** the `sync_runner` password and the `--ping` line (task 7 (d), above).
* **Brief inconsistency:** `KEEPALIVE_MINUTES` reads 20 in the 2026-10-03 amendment, the named
  constants and the DECISIONS keep-alive row, but 60 in "Open items for Stack" ("Re-answered
  2026-10-03: item 2 … defaults to 60") and in the DECISIONS morning-sync row ("every 60 minutes while
  it is alive"). The runner uses 20, the later and more specific call.
* **The `log_connections` refusal** is `55P02 parameter "log_connections" cannot be set after
  connection start`, not the permission error the DoD predicted; either way the platform refuses it.
* **Not verified here:** a live run in the container (task 28); whether Ultra's
  Content-Security-Policy lets `addScriptTag` run the crawler (the runner falls back to evaluating
  the source, and logs it); the session pooler accepting `sync_runner` (Stack's `--ping`).

## Round 2 — R2-1: two heartbeat writes at startup shared one temp name

Found by W-56 building the image: every start logged `heartbeat write failed: ENOENT`.
`writeAtomic` (`sync/src/main.ts`) named its temp file `${file}.${pid}.tmp`, so two writes in flight
shared it and the second rename found it gone. Merged `origin/feat/containers-14` first (a
fast-forward to 1cc986e).

RED (20 concurrent writes to one file; two did not reproduce it reliably on Windows):

```
cd sync && npx vitest run test/integration.test.ts -t writeAtomic
 × concurrent writes to the same file all succeed and leave valid JSON
   "code": "ENOENT", "message": "ENOENT: no such file or directory, rename '…\state\login.json.10376.tmp' -> '…\state\login.json'"
```

A per-write counter alone then failed on Windows with `EPERM` (two renames onto one target at once),
so writes to one file are also serialised in call order (the last call wins); the temp file is
removed if its rename fails.

GREEN:

```
cd sync && npx vitest run test/integration.test.ts -t writeAtomic
 Test Files  1 passed (1)      Tests  1 passed | 16 skipped (17)

cd sync && npm run typecheck && npm run build && npx vitest run --coverage
 Test Files  7 passed (7)      Tests  108 passed (108)      Lines : 89.57% ( 636/710 )      exit 0
```

## Task 7 (d) — Stack's password and the `--ping`, 2026-10-03 (recorded by the PM)

Stack set `sync_runner`'s password in the Supabase SQL editor (never in a file) and stored the session-pooler
DSN as `sync_runner_db_url` in `C:/Users/stack/.bb2dash-secrets/` (user `sync_runner.goultdzqcavefcgnifdy`,
port 5432, `sslmode=require`). The first `--ping`, before the `alter role` had run, failed with
`db-test: connection failed: (EAUTHQUERY) unsupported or invalid secret format`: the pooler's answer for a
role with no password. After it:

* `node scripts/db-test.mjs --ping` with that DSN as `BB2DASH_TEST_DB_URL` → `db-test: connected as sync_runner`, exit 0
* as `sync_runner` through the same pooler: `select count(*)` from `agent_requests`, `bb_files` and
  `attention_items` each → SQLSTATE `42501`; `select * from sync_next()` → 0 rows (nothing queued)

All eleven secret files now exist in `SECRETS_DIR`.

## Round 2 — W-55 (brief 100, "## Round 2 — W-55"), 2026-10-03

Merged `origin/feat/containers-14` first (b0c1881). Note: `fix(14-R2-1)` was already used by the
heartbeat temp-name fix (d5eabe5); this round's item commits use the same `fix(14-R2-<n>)` form.

### Item 12 — `FilesStepResult.embedded` dropped (fec6015)

```
RED   files.test.ts › an embed that exits non-zero …   × (keys were embedError, embedded, files, stopped)
GREEN files.test.ts                                     21 passed
```

### Item 1 — the runner resumes its own registered, unclosed claims

`sync_own_claims()` (093) returns `(id, run_id, claimed_at, claim_attempts)` for `claimed_by =
'sync-runner'` open sync claims only. At the top of every pass (so also on start) the runner waits
for each registered one's run again: folded → files, embed, `sync_close`; failed → `sync_close`
failed; still running → left for the next pass. `sync_close` itself refuses any other claimant.

```
RED   loop.test.ts   4 failed | 21 passed  (timeout, stop, throw after register, a failed run)
GREEN loop.test.ts   25 passed; the whole sync suite 113 passed; tsc exit 0
RED   node scripts/db-test.mjs --only phase14_093_review_fixes.sql
      FAIL  phase14_093_review_fixes.sql  FAIL phase14_093: migration 093 is not applied (sync_own_claims is missing)
      db-test: passed 0, failed 1, units 1
```

### Item 2 — a course file already in Storage is recorded, not stranded

`duplicateIsAcceptable(isSubmissionRow(row))` from `pull_files.mjs`: a course file's 409/Duplicate goes
on to the text POST and `sync_file_stored`; a submission's stays "never done". A text POST that answers
409/`23505` keeps the existing units (`textPostOutcome`).

```
RED   files.test.ts   2 failed | 22 passed  (a course Duplicate; upload-then-text-fails, then a second pass)
GREEN files.test.ts   24 passed; tsc exit 0
```

### Item 3 — one file's 401/403 is not a dead login

On a first-hop 401/403 the files step asks the login watch's `check('files')` (users/me, with the
silent re-login): `dead` stops the step (the watch's alive → dead path raises the login item); `alive`
reports that file `refused: status <n> at the first hop, but the login check passed` and goes on; no
answer is not a dead login either.

```
RED   files.test.ts   5 failed | 22 passed
GREEN files.test.ts   27 passed; the whole sync suite 119 passed; tsc exit 0
```

### Item 6 — a failed close fails a still-running run at once (093)

093 re-creates `sync_close` from its live body (091's): a `failed` close of a registered request whose
run is still `running` sets the run `failed`, `finished_at`, and appends `sync-runner: <error>` to its
notes; a run that already folded keeps its status. The SQL case is `phase14_093_review_fixes.sql`
section 2; the 091 unit's name check now expects thirteen (093's `sync_own_claims`). Checked after
093's apply (below).

### Item 7 — the report's `claim_attempts` is the column's value

After the claim the runner reads its row back through `sync_own_claims()` (093); the process-local
Map is gone.

```
RED   loop.test.ts › reports the claim_attempts column the database holds …   × (reported 1)
GREEN loop.test.ts   26 passed (incl. "the third claim of a request reports claim_attempts 3");
      the SQL side is phase14_093_review_fixes.sql section 1 (claim, requeue, claim, requeue, claim -> 3)
```

### 093 applied (items 1, 6, 7)

Dry run in `begin; … rollback;` through `execute_sql` (093, then the unit's sections 1–2 as `postgres`
with an in-transaction `grant sync_runner to postgres with inherit false, set true`): reached its final
`raise`. No sync request was open on prod just before. Applied as `093_sync_runner_review_fixes` from
commit 1cdc354:

| Migration | prod `md5(statements[1])` | `git show HEAD:db/migrations/<file> \| md5sum` | bytes |
|---|---|---|---|
| `093_sync_runner_review_fixes` | `4626aad4b27dd6fb6935eb52d466953e` | `4626aad4b27dd6fb6935eb52d466953e` | 8733 |

`ls db/migrations | grep -c "^09[1-9]_"` → 3; prod `name ~ '^09[1-9]_'` → 3.

The unit's first run failed on the unit itself (a read of `agent_requests` inside `set local role
sync_runner`); the check now runs as the test role.

```
node scripts/db-test.mjs --only phase14_093_review_fixes.sql   -> PASS; db-test: passed 1, failed 0, units 1
node scripts/db-test.mjs --only phase14_091_sync_runner.sql    -> PASS; db-test: passed 1, failed 0, units 1
```

### Item 4 — `KEEPALIVE_MINUTES=0` no longer blinds the watch

0 turns off the navigation only; while alive the watch probes every `LOGIN_CHECK_MINUTES = 60`
(with the silent re-login on a dead answer), so an overnight death is seen.

```
RED   login.test.ts › KEEPALIVE_MINUTES=0 stops the navigation only …   ×
GREEN login.test.ts   22 passed (fake clock: a probe at 60 min, no goto; then 401 -> re-login -> dead -> raised)
```

### Item 8 — connection-class SQLSTATEs drop the client

`isStatementError` (db.ts): class `08`, `57P` and `XX000` (and anything without a SQLSTATE) drop the
client; the next call reconnects. A statement refusal (`22023`) keeps it.

```
RED   integration.test.ts › SQLSTATE 08006 / 08003 / 57P01 / 57P03 / XX000 …   5 failed
GREEN integration.test.ts   22 passed
```

### Item 10 — one `readTextOrNull`, in `secrets.ts`, that tells unreadable from missing

ENOENT → null (not set); any other error (EACCES, EISDIR, …) → a `ConfigError` naming the path, never
the contents. `main.ts`, `probe.ts` and `enqueue.ts` import it; their copies are gone (`probe.js
--heartbeat` treats an unreadable heartbeat as stale).

```
RED   secrets.test.ts   2 failed (the helper; no copies in main/probe/enqueue)
GREEN the whole sync suite 127 passed; tsc exit 0
```

### Item 9 — reuse, and no child gets the parent's environment

The embed step calls `embed_corpus.mjs`'s exported `runEmbedLoop` with its `makePost(supabaseUrl,
anonJwt)` in-process (no child process at all). The extractor is `pull_files.mjs`'s exported
`extractUnits` (the locked project), run with an environment of only what `uv` needs (`PATH`, `HOME`,
temp and locale, `UV_*`, `PYTHON*`); none of the runner's secrets reaches it. `spawnCollect` is gone.

```
RED   files.test.ts   3 failed (extractUnits + uv env; in-process embed; no ...env spread or spawn)
GREEN the whole sync suite 128 passed; tsc exit 0
```

### Item 5 — the heartbeat proves progress; named timeouts; a watchdog

* The heartbeat is written by progress only (a loop turn, every fold poll, every file, a crawl's
  start and end); the 30-second interval writer is gone.
* `CRAWL_TIMEOUT_MS = 900_000` on the in-page `runAll` (a `CrawlError`, so the pass closes failed);
  `EMBED_TIMEOUT_MS = 600_000` on the in-process embed loop (its later posts answer 408, so the loop
  ends without another call).
* `WATCHDOG_MS = 1_200_000` (longer than every step with its own timeout): checked every
  `WATCHDOG_CHECK_MS = 60_000`; past it the runner logs `no progress for … s` and exits 1
  (`realDeps.onWatchdog`), so `restart: unless-stopped` restarts the container.
* `probe.js --heartbeat` now calls the heartbeat stale at `WATCHDOG_MS` (it rests through a crawl).

```
RED   4 failed (fold-poll progress; watchdog + no interval writer; crawl timeout; embed timeout)
GREEN the whole sync suite 132 passed; tsc exit 0
```

For W-56 / the PM: the compose healthcheck command is unchanged; it turns unhealthy only after
20 minutes without progress, when the watchdog has already exited the runner.
