# 95a — W-38 verification note (Phase 15, runner + role stream)

Worker W-38 · branch `feat/db-hygiene-15-runner` · worktree `bb2dash-wt-15-runner` · Node v24.13.0
Brief: `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md` (frozen 2026-09-27).
Tasks owned: 1, 2, 3, 4, 6, 7 (and 103, then 104, if a grant gap is reported).

Wave 1 covers tasks 1–4. Tasks 6 and 7 need a live connection as `db_test_runner`, which does not
exist on this machine until Stack runs acceptance step 1 (task 5). They are not attempted here.

Every block below is pasted output, not a summary of it.

---

## Task 1 — runner core, RED first

Brief's check: `node --test scripts/db-test.test.mjs` → 0 failures (RED run with the stubs recorded
in 95a first).

### RED

`scripts/db-test.test.mjs` was written first, with `scripts/db-test.mjs` holding only stubs (every
export present, nothing implemented), so the imports resolve and the assertions are what fail.

Command:

```
node --test scripts/db-test.test.mjs
```

First lines:

```
✖ the loader map is frozen and holds exactly the three sprint-1 pairs (3.9702ms)
✖ buildPlan puts units in name order and numbers them from 01 (1.0067ms)
✖ buildPlan prefixes each mapped test with its loader and never makes a loader a unit (0.6189ms)
✖ buildPlan ignores anything that is not a .sql file (0.5629ms)
✖ formatPlanLine prints the frozen --list strings (0.5833ms)
✖ parseArgs maps every documented form (1.7006ms)
✖ a bare positional path is the --file form (0.3612ms)
✖ parseArgs refuses unknown flags, missing values and two targets (0.3668ms)
✖ stripSql removes line comments, block comments, dollar-quoted bodies and string literals (0.315ms)
✔ lint accepts the repo shape: begin; first, rollback; last (0.376ms)
✔ lint accepts a loader + test unit, where begin comes from the loader (0.1629ms)
✖ lint refuses a missing begin (0.6326ms)
✖ lint refuses a missing final rollback (0.1855ms)
✖ lint refuses a top-level commit (0.1421ms)
✖ lint refuses a top-level end (0.2102ms)
✖ lint refuses a unit with no statements at all (0.1281ms)
✔ lint is not fooled by `on commit drop`, a case ... end, or a semicolon inside a literal (0.133ms)
✖ the commits.sql fixture fails lint; passes.sql and fails.sql do not (0.8366ms)
✖ a transaction-pooler DSN on port 6543 is refused, and the message holds no DSN (0.3163ms)
✔ a session-pooler DSN on 5432 is allowed (0.1536ms)
✖ redact removes the DSN and its password from any text (0.2195ms)
✖ firstLine takes only the first line of a server error (0.2697ms)
✖ findPassRow accepts one Result or an array, and only a ": PASS" first column (0.4228ms)
✔ loadDsn and openClient are exported functions (0.525ms)
✖ loadDsn reads the process environment first and refuses 6543 from it (0.4195ms)
✖ loadDsn fails with a clear config error when nothing sets the variable (1.7631ms)
✖ --list prints the plan, exits 0 and opens no client (5.9765ms)
✖ a unit that fails lint exits 2, prints the frozen lint line, and opens no client (0.4609ms)
✖ lint runs before the credential is read, so a committing file is refused with no DSN at all (1.195ms)
✖ a passing unit prints PASS and the summary, and exits 0 (0.4494ms)
```

Footer, and the process exit code:

```
ℹ tests 42
ℹ suites 0
ℹ pass 5
ℹ fail 37
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 181.3379
EXIT=1
```

(The five that pass against the stubs are the ones whose expected answer is "nothing is wrong":
`lintUnitText` stubbed to `null`, `assertDsnAllowed` stubbed to the identity, and the two exports
existing. Every behavioural assertion is red.)

### GREEN

Command:

```
node --test scripts/db-test.test.mjs
```

```
ℹ tests 42
ℹ suites 0
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 157.9065
EXIT=0
```

**Task 1: PASS.**

What the 42 cases cover, against the brief's runner contract:

* plan builder — name order, numbering from `01`, the frozen loader map (`Object.isFrozen`), the
  two `phase10a` pairs and the one `phase12b` pair, loaders never units of their own, non-`.sql`
  entries ignored, the frozen `unit NN  loader + file` string;
* arguments — `--only`, `--file`, the bare positional path as `--file`, `--list`, `--ping`, and
  usage refusals for an unknown flag, a missing value and two targets;
* lint — comments (line, nested block), string literals, quoted identifiers and dollar-quoted
  bodies (`$$` and `$tag$`) stripped first; `begin;` first, `rollback;` last, no top-level `commit`
  or `end`, no empty unit; not fooled by `on commit drop`, a `case … end`, or a `;` inside a
  literal; the loader+test shape (the `begin;` comes from the loader) accepted; the three fixtures
  classified;
* the DSN refusal — port 6543 rejected, 5432 accepted, and the refusal message carries neither the
  password nor the host;
* redaction — the DSN, its password and its host removed from any printed text, including a FAIL
  line and a connection error;
* the pass rule — only a **first** column ending in `: PASS`, over a single Result or an array;
* exits — 0 with no failure, 1 on a FAIL, 2 on usage, config, lint and connection errors;
* **a lint failure opens no client** — asserted twice (`factory.opened.length === 0`), once with a
  DSN present and once with no DSN anywhere, since lint runs before the credential is read;
* one `pg.Client` per unit (`factory.opened.length === 3` over three units), one simple-protocol
  query per unit with the loader text first, `rollback` sent as the last query after an error, and
  one broken unit not hiding the two around it;
* `--list` opening no client; `--ping` printing `db-test: connected as db_test_runner`.

`loadDsn()` and `openClient()` are exported. Importing the module has no side effects: the CLI
block at the foot runs only when `process.argv[1]` resolves to this module's own URL, and `pg` is
imported lazily inside `openClient()`, so the unit tests run with no dependency installed.

Commit: `feat(15-01): db-test runner core with its unit tests (RED first)`

---

## Task 2 — package, lockfile, `.env.example`, `db/tests/README.md`

Brief's check: `npm --prefix scripts ci` exit 0; `grep -c "^BB2DASH_TEST_DB_URL=" .env.example` → 1;
`git check-ignore -q .env.local; echo $?` → 0.

`scripts/package.json` declares one dependency, `pg` **8.23.0**, pinned exact (no range), with
`scripts/package-lock.json` committed beside it. `scripts/node_modules/` is covered by the repo's
existing `node_modules/` ignore rule (`git check-ignore -q scripts/node_modules` → 0).

`node_modules` was deleted first, so `npm ci` really installed from the lockfile:

```
$ rm -rf scripts/node_modules && npm --prefix scripts ci
npm ci exit=0

added 14 packages, and audited 15 packages in 1s

found 0 vulnerabilities
```

```
$ grep -c "^BB2DASH_TEST_DB_URL=" .env.example
1
```

```
$ git check-ignore -q .env.local; echo $?
0
```

`db/tests/README.md` is written: the once-per-machine setup (`npm --prefix scripts ci`, the
`BB2DASH_TEST_DB_URL` line in the gitignored `.env.local`, the 5432-not-6543 rule and why), the six
commands with their output and exit codes, the loader map as a table with the rule that a loader
never runs alone, the pass rule (`: PASS` in a result row's first column) with the repo's
`raise exception 'FAIL …'` convention, the lint rules and that a lint failure exits 2 without
connecting, the three fixtures, and the `phaseNN_NNN_name.sql` naming convention (`phaseNN_name.sql`
where there is no single migration) as a convention, not a lint rule. It says outright that it
supersedes the sprint-1 files' "RUN IT" headers.

Re-run of task 1's check after `scripts/package.json` (`"type": "module"`) landed, to prove it
changed nothing:

```
ℹ tests 42
ℹ pass 42
ℹ fail 0
```

**Task 2: PASS.**

Commit: `feat(15-02): scripts package with pg pinned, .env.example line, db/tests README`

---

## Task 3 — `--list` over today's suite

Brief's check: `node scripts/db-test.mjs --list | grep -c "^unit "` → 17 on W-38's branch before
task 7; `… | grep -c "phase10a_load_fixtures.sql + "` → 2;
`… | grep -c "phase12b_load_fixture.sql + "` → 1.

```
$ node scripts/db-test.mjs --list | grep -c "^unit "
17
$ node scripts/db-test.mjs --list | grep -c "phase10a_load_fixtures.sql + "
2
$ node scripts/db-test.mjs --list | grep -c "phase12b_load_fixture.sql + "
1
```

The plan itself, and its exit code:

```
$ node scripts/db-test.mjs --list
unit 01  inbox_apply_090_attention_archive.sql
unit 02  phase10a_load_fixtures.sql + phase10a_stage_attempts.sql
unit 03  phase10a_load_fixtures.sql + phase10a_stage_gradebook.sql
unit 04  phase10b_grade_model.sql
unit 05  phase10b_round2.sql
unit 06  phase12b_073_workload_visibility.sql
unit 07  phase12b_074_reading_file_links.sql
unit 08  phase12b_075_shared_column_restamp.sql
unit 09  phase12b_076_rls_initplan_and_truncate.sql
unit 10  phase12b_077_inbox_feedback.sql
unit 11  phase12b_078_status_fold_and_auto_graded.sql
unit 12  phase12b_082_083_planner_series.sql
unit 13  phase12b_084_shared_column_conflict.sql
unit 14  phase12b_load_fixture.sql + phase12b_085_stage_attempts_v4.sql
unit 15  phase12b_086_reading_link_settles.sql
unit 16  phase12b_087_auto_graded_sticks.sql
unit 17  phase12b_089_work_items_due_on.sql
EXIT=0
```

17 units out of the 19 `.sql` files in `db/tests/`: the two loaders are not units of their own. The
new `db/tests/README.md` is ignored, because the plan takes only `*.sql`. `--list` opened no
connection (asserted in task 1's suite, and the command needs no DSN, which there is none of on
this machine yet).

Offline cross-check that the whole suite would get past lint, so no unit is refused when the
credential arrives:

```
$ node -e "…buildPlan(readdirSync('db/tests'))… lintUnitText(loader+test)…"
units 17 lint failures 0
```

**Task 3: PASS.**

Commit: `feat(15-03): record --list over today's suite (17 units, 3 with loaders)` — the record
only: `--list` needed no new code beyond task 1's.

---

## Task 4 — migration 100

Brief's checks:
`select rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolconnlimit from pg_roles
where rolname = 'db_test_runner'` → `t, t, f, f, f, 2`;
`select count(*) from supabase_migrations.schema_migrations where name = '100_db_test_runner_role'` → 1.

### How the three grant lists were derived

`db/migrations/100_db_test_runner_role.sql` carries no password. The lists were derived by reading
every file in `db/tests/` with a script that strips comments, tracks `set local role` / `reset role`
and reports each DML statement and each public-function call with the **effective** role, so
statements that run as `anon` or `authenticated` (on those roles' own grants) are excluded.

Tables written as the session role, 12 in all — `agent_requests`, `assignment_progress`,
`assignments`, `attention_items`, `bb_files`, `bb_gradebook`, `bb_raw`, `courses`,
`grade_column_links`, `grade_scenarios`, `readings`, `sync_runs`. `planner_events` and
`planner_event_series` are deliberately absent: every write to them in
`phase12b_082_083_planner_series.sql` sits between its `set local role authenticated` (line 34) and
`reset role` (line 664), and `phase12b_089`'s `assignments` writes are inside its own authenticated
block too (26–148), which is why `assignments` is on the list only for `phase12b_075:88` and
`phase12b_084:77,168`.

One grant is derived rather than read off a statement: `assignments_mark_calendar_dirty()` is a
SECURITY INVOKER statement trigger on `assignments`, and its body is
`update app_settings set gcal_dirty = true where id and not gcal_dirty`. That UPDATE runs as this
role whenever `phase12b_075` or `phase12b_084` touches `assignments`, so 100 grants `update` (only)
on `public.app_settings`.

One function grant is derived the same way and is **not named in the brief**:
`public.calendar_event_id(text)` has no PUBLIC execute, and it is called inside
`v_calendar_push_items`, which is `security_invoker` (036) and is read by `phase12b_075` (4 places),
`phase12b_084` (3) and `phase12b_089:183`, all as the session role. Without it those three units
would have gone red and cost a 103. Every public view's definition was checked against every public
function that lacks PUBLIC execute; `calendar_event_id` is the only hit.

`suggested_start(text, date, numeric)` (behind `v_work_items`), `classify_bb_file(text, text, text)`
and `set_updated_at()` still hold PUBLIC execute on prod, so they need no grant. Trigger functions
are not granted: Postgres checks EXECUTE on a trigger function at CREATE TRIGGER time, not when it
fires — which is why `authenticated`, with no execute on `assignments_mark_calendar_dirty()`, can
insert `assignments` in `phase12b_089` today.

The 22 function grants are written by identity signature, so a later overload cannot inherit one.
The six sequence grants are on identity sequences (`attidentity = 'a'` on all six), which Postgres
advances without a USAGE check; they are in the file because the contract names them.

### Dry run

The whole file was sent through `mcp__plugin_supabase__execute_sql` inside `begin; … rollback;`,
with a probe select before the rollback. It needed no fix:

```
[{"result":"dry run 100: reached the end","attrs":"true,true,false,false,false,2","memberships":2,
  "dml_grants":37,"temp_ok":true,"can_stage":true}]
```

`attrs` is `rolcanlogin,rolbypassrls,rolsuper,rolcreaterole,rolcreatedb,rolconnlimit`; `dml_grants`
37 = 12 tables x 3 + app_settings UPDATE; `temp_ok` confirms the brief's
`has_database_privilege(…, 'TEMP')` fact still holds for the four units that create temp tables.

**`BYPASSRLS` was accepted on a login role.** Open item 1's fallback is not needed, and nothing in
the brief changes.

### Apply

Applied with `mcp__plugin_supabase__apply_migration`, name `100_db_test_runner_role`, the file's
bytes unchanged (12748 bytes, LF):

```
{"success":true}
```

```
$ md5sum db/migrations/100_db_test_runner_role.sql
ec1f7d3d80a222d356cf59571f0b46db *db/migrations/100_db_test_runner_role.sql
```

```
select count(*), md5(array_to_string(statements, '')), array_length(statements, 1), version
  from supabase_migrations.schema_migrations where name = '100_db_test_runner_role';
[{"migration_rows":1,"applied_md5":"ec1f7d3d80a222d356cf59571f0b46db","statement_count":1,
  "version":"20260928021303"}]
```

The applied md5 equals the file's md5: repo and prod are byte-identical (task 21's pair, matching
already).

### The brief's two SELECTs

```
select rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolconnlimit
  from pg_roles where rolname = 'db_test_runner';
[{"rolcanlogin":true,"rolbypassrls":true,"rolsuper":false,"rolcreaterole":false,
  "rolcreatedb":false,"rolconnlimit":2}]
```

→ `t, t, f, f, f, 2`, as the row asks.

```
select count(*) from supabase_migrations.schema_migrations where name = '100_db_test_runner_role';
1
```

### What the role actually holds now (the shape task 7 will assert)

```
[{"memberships":"anon (inherit=false), authenticated (inherit=false)",
  "schemas_granted":"extensions, public",
  "select_grants":59,
  "write_tables":"agent_requests, app_settings, assignment_progress, assignments, attention_items, bb_files, bb_gradebook, bb_raw, courses, grade_column_links, grade_scenarios, readings, sync_runs",
  "executable_public_fns":25,
  "usable_sequences":6,
  "vault":false,"storage":false,"auth":false,"cron":false,"net":true,
  "create_on_public":false,
  "vault_rpc_1":false,"vault_rpc_2":false,
  "owned_objects":0}]
```

`executable_public_fns` is 25, not 22: the three extra are `classify_bb_file`, `set_updated_at` and
`suggested_start`, which reach the role through PUBLIC. `net` is true through PUBLIC, as the brief
records. Nothing on `vault`, `storage`, `auth` or `cron`; no `CREATE` on `public`; no owned objects;
neither Vault RPC executable.

**Task 4: PASS.**

Commit: `feat(15-04): migration 100 — the db_test_runner login role, applied to prod`

---

## Task 5 (Stack's) — the credential, as W-38 saw it

Not W-38's row, recorded because tasks 6 and 7 rest on it. From `bb2dash-wt-15-runner`, with the
PM's copy of the gitignored `.env.local` in place:

```
$ node scripts/db-test.mjs --ping
db-test: connected as db_test_runner
EXIT=0
```

The DSN ends `?uselibpqcompat=true&sslmode=require`. A bare `sslmode=require` fails on this machine:
`pg` 8.23 aliases `require` to `verify-full`, and the Supabase pooler chains to a private root, so
the runner reports `db-test: connection failed: self-signed certificate in certificate chain` and
exits 2 — correctly, and with the DSN redacted. `uselibpqcompat=true` restores libpq's own `require`
(encrypted, no chain check), which is what `psql` does and what research 92 assumed. The PM is
recording it in DECISIONS row 5; `db/tests/README.md` now carries a paragraph on it, since the next
person to write this DSN by hand will hit it. No change to `scripts/db-test.mjs`: the runner refuses
6543 and redacts, and takes whatever else the DSN says.

---

## Task 6 — live exit contract on the three fixtures

Brief's check: `passes.sql` → `db-test: passed 1, failed 0, units 1` then 0; `fails.sql` →
`db-test: passed 0, failed 1, units 1` then 1; `commits.sql` → one line starting
`db-test: lint commits.sql:` then 2 (task 1's unit test asserts no client was opened).

```
$ node scripts/db-test.mjs --file scripts/fixtures/db-test/passes.sql; echo $?
PASS  passes.sql
db-test: passed 1, failed 0, units 1
EXIT=0

$ node scripts/db-test.mjs --file scripts/fixtures/db-test/fails.sql; echo $?
FAIL  fails.sql  FAIL this fixture always fails, on purpose
db-test: passed 0, failed 1, units 1
EXIT=1

$ node scripts/db-test.mjs --file scripts/fixtures/db-test/commits.sql; echo $?
db-test: lint commits.sql: top-level `commit` is not allowed; a unit must roll back
EXIT=2
```

All three as the row gives them. `fails.sql`'s FAIL line is the first line of the real server error
(the `CONTEXT: PL/pgSQL function inline_code_block` line behind it is dropped), and `commits.sql`
never opened a connection — the offline half of that is task 1's
`assert.equal(factory.opened.length, 0)`, asserted both with and without a DSN present.

**Task 6: PASS.**

Commit: `feat(15-06): live exit contract on the three fixtures; DSN sslmode note in the README`

---

## Task 7 — `db/tests/phase15_100_db_test_runner_role.sql`

Brief's check: runner `--only phase15_100_db_test_runner_role.sql` →
`db-test: passed 1, failed 0, units 1`.

Six sections, covering the row's list: (1) `current_user` is `db_test_runner` and its attributes are
LOGIN + BYPASSRLS, not superuser / createrole / createdb / replication, `connection limit 2`;
(2) the two per-role settings 100 set; (3) memberships **exactly** `anon` and `authenticated`, each
`inherit=f` (and `set=t`, which is what lets the four units switch into them), plus a separate list
that names `service_role`, `postgres`, `authenticator`, `pg_read_all_data` and eight more privileged
roles and raises if any of them is a membership; (4) 0 owned objects (`pg_shdepend` deptype `'o'`,
which is every object in the cluster this role owns) and no `CREATE` on `public` or `extensions`;
(5) the only schemas whose ACL names it are `public` and `extensions`, `has_schema_privilege` is
false on `vault`, `storage`, `auth` and `cron`, and true on `pg_catalog`, `information_schema` and
`net`, which it reaches only through PUBLIC — the reason section 5's ACL list is short; (6) neither
Vault RPC is executable by it, by `anon` or by `authenticated`.

Section 3 carries the comment the §Seams row asks for: a later migration that grants a further
membership (brief 100's 094 `sync_runner`, brief 102's 142 `workspace_runner`) extends the expected
list in the same PR.

### RED

The file asserts facts that are already true, so it cannot be red as written without weakening it.
Section 3's guard was shown to have teeth instead: its body, **unchanged**, was run through
`execute_sql` as `postgres` inside `begin; … rollback;` with one fact falsified by
`grant pg_read_all_data to db_test_runner`:

```
ERROR:  P0001: FAIL db_test_runner memberships are anon(inherit=f,set=t), authenticated(inherit=f,set=t), pg_read_all_data(inherit=t,set=t), expected anon(inherit=f,set=t), authenticated(inherit=f,set=t)
CONTEXT:  PL/pgSQL function inline_code_block line 17 at RAISE
```

The raise aborted the transaction, so the falsified grant never landed:

```
select … from pg_auth_members … where g.rolname = 'db_test_runner';
[{"memberships_now":"anon(inherit=f), authenticated(inherit=f)"}]
```

### GREEN

```
$ node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql; echo $?
PASS  phase15_100_db_test_runner_role.sql
db-test: passed 1, failed 0, units 1
EXIT=0
```

The unit's own summary row, read back as `db_test_runner` through the module's exported
`loadDsn()` / `openClient()` (which is also the first use of those two exports):

```
{"result":"phase15_100_db_test_runner_role: PASS","ran_as":"db_test_runner","conn_limit":2,
 "memberships":"2","schemas_granted":"2","write_grants":"37","callable_public_fns":"25"}
```

The plan is now 18 units on this branch, not 17, as task 3's note says, and `db/tests` holds 20
`.sql` files:

```
$ node scripts/db-test.mjs --list | grep -c "^unit "
18
$ ls db/tests/*.sql | wc -l
20
```

**Task 7: PASS.** No grant gap: nothing in this wave produced a `permission denied`, so no 103.

Commit: `feat(15-07): phase15_100 - the role's limits as a test unit`

---

## Diagnostic: the whole suite on today's prod (not a task row)

Run once after the credential arrived, to find grant gaps before W-40 puts 102 on prod. **No unit
failed on a privilege** — every FAIL below is an assertion about prod data, so **no 103 is needed
from this wave**.

```
$ node scripts/db-test.mjs; echo $?
PASS  inbox_apply_090_attention_archive.sql
FAIL  phase10a_stage_attempts.sql  FAIL IST.323/quiz-01 has 3 attempt row(s), expected 2
FAIL  phase10a_stage_gradebook.sql  FAIL 2 course(s) disagree on column count between bb_raw and v_gradebook_latest
FAIL  phase10b_grade_model.sql  duplicate key value violates unique constraint "grade_column_links_pkey"
PASS  phase10b_round2.sql
PASS  phase12b_073_workload_visibility.sql
PASS  phase12b_074_reading_file_links.sql
PASS  phase12b_075_shared_column_restamp.sql
PASS  phase12b_076_rls_initplan_and_truncate.sql
FAIL  phase12b_077_inbox_feedback.sql  FAIL v_inbox_feedback is empty - prod has closed rows with notes
FAIL  phase12b_078_status_fold_and_auto_graded.sql  FAIL 0 of the 4 advanceable rows read graded
PASS  phase12b_082_083_planner_series.sql
FAIL  phase12b_084_shared_column_conflict.sql  FAIL the IST.323 shared-column row is not dismissed
PASS  phase12b_085_stage_attempts_v4.sql
PASS  phase12b_086_reading_link_settles.sql
PASS  phase12b_087_auto_graded_sticks.sql
FAIL  phase12b_089_work_items_due_on.sql  FAIL the Lab #1 fixture row is gone from v_work_items
db-test: passed 10, failed 7, units 17
EXIT=1
```

(This run predates task 7's file, hence 17 units.) Three of the seven are the ones this phase
repairs — `phase10a_stage_attempts`, `phase10a_stage_gradebook` (W-39 task 9, P-30) and
`phase10b_grade_model` (W-39 task 10, P-2). **Four are not**, and by the brief's task 17 rule a red
unit other than the three repaired here stops the PM:

| Unit | FAIL line | Cause, checked as `postgres` |
|---|---|---|
| `phase12b_077_inbox_feedback.sql` | `FAIL v_inbox_feedback is empty - prod has closed rows with notes` | `v_inbox_feedback` 0 rows and `attention_items` with state `resolved`/`dismissed` and a note: 0. 142 rows are now `archived`, so the view the unit expects to be non-empty is legitimately empty. |
| `phase12b_084_shared_column_conflict.sql` | `FAIL the IST.323 shared-column row is not dismissed` | `ref = 'column:_3569973_1'` reads `archived resolved_at=2026-09-17 19:10:19.200505+00`. The note assertion just above it still passes; only the `state = 'dismissed'` clause fails. |
| `phase12b_089_work_items_due_on.sql` | `FAIL the Lab #1 fixture row is gone from v_work_items` | `assignments` holds 0 rows for `IST.323/lab-1-performing-a-ransomware-attack`. The assignment itself is gone from prod, not just from the view. |
| `phase12b_078_status_fold_and_auto_graded.sql` | `FAIL 0 of the 4 advanceable rows read graded` | Fixture-dependent, not reduced to a one-line probe. Its shape matches the others: `assignment_progress` has moved under `/inbox-apply` and the 12b fold since sprint 1. |

Every figure above is identical when read as `postgres` through `execute_sql`, so none of it is
caused by `db_test_runner`, `BYPASSRLS` or the `inherit false` memberships. The theme is the same
one P-30 names for `phase10a`: units that assert on prod rows which later syncs, the 090 archive and
`/inbox-apply` have since moved. It is open item 6's risk ("some existing units build rows on
literal future dates") arriving a row earlier than expected, and it is the PM's call, not W-38's —
these are not W-38's files.

---

## Notes for the PM

1. **A grant the brief did not name.** `public.calendar_event_id(text)` (see task 4). It is in 100,
   derived and documented inside the file.
2. **`app_settings` UPDATE.** Also in 100, derived from the `assignments` trigger. It is the one
   table in the write list that no unit names directly.
3. **Two existing assertions weaken under a non-inheriting role, but do not go red.**
   `phase12b_076_rls_initplan_and_truncate.sql:48` and `phase12b_082_083_planner_series.sql:705` read
   `information_schema.role_table_grants`, which shows only rows whose grantor or grantee is a
   *currently enabled* role. `db_test_runner` is a member of `anon` and `authenticated` **with
   inherit false**, so neither is enabled outside a `set local role`, and those two queries will
   likely return no rows. Both assertions are of the form "must be null / must be 0", so they still
   pass — vacuously. Rewriting them to `has_table_privilege('anon', …, 'TRUNCATE')` would restore
   the teeth; that is not W-38's file and not in this brief, so it is flagged, not fixed.
4. **Table writes by W-40's two new units are not in 100.** The contract derives 100's table list
   from writes as the session role, and names only *function* additions for the new units
   (`run_transform`, `transform_tick`, `bb_file_relpath`, the three search functions), all of which
   are in. If `phase15_102_planner_series_orphan.sql` writes `planner_events` or
   `planner_event_series` as the session role rather than under `set local role authenticated` (the
   way `phase12b_082_083` does), it needs a 103. W-38 is ready to write one.

---

# Round 2 — the review-gate findings in W-38's files

Seven findings from `/code-review main high` and `/security-review`, all in
`scripts/db-test.mjs`, `scripts/db-test.test.mjs`, `db/tests/README.md` and `.env.example`.
**`db/migrations/100_db_test_runner_role.sql` was not touched**: `git diff` against the phase branch
shows no change under `db/migrations/`, and `git show HEAD:db/migrations/100_db_test_runner_role.sql
| md5sum` is still `ec1f7d3d80a222d356cf59571f0b46db`.

`origin/feat/db-hygiene-15` was merged into this branch first, so the suite checks below run against
the integrated 21 units rather than W-38's 18.

One commit per finding. The unit-test count grew 42 → 59.

## Finding 1 — a second top-level `rollback` used to commit the tail

The real hole. A unit reaches the server as **one multi-statement simple query**, so a `rollback` in
the middle of the batch ends the transaction block and Postgres runs everything after it in a fresh
implicit transaction that it **commits** when the message completes. The old rules — first statement
`begin`, last statement `rollback`, no top-level `commit` or `end` — were all satisfied by
`begin; …A…; rollback; …B…; rollback;`, which wrote B to prod as a `BYPASSRLS` role holding DELETE on
the planner-state tables. The `end` spelling of the same batch split was already blocked and tested
at `db-test.test.mjs:228`; the `rollback` spelling was neither. `db/tests/README.md` sold the old
rules as the guarantee, so this was a broken control, not a missing one.

`lintUnitText()` now collects every top-level `rollback`, refuses a unit holding more than one, and
requires the terminator to be a plain one: `rollback transaction` and `rollback work` count,
`rollback and chain` does not, and `rollback to [savepoint] x` is refused because it leaves the block
open. That last one **aborts rather than commits**, so it is not a write path — it is rejected as a
unit terminator, and the message says so. No file in `db/tests` uses savepoints (grep: 0 hits), so it
is refused at top level anywhere; a unit that needs one changes the rule in its own PR.

A fourth fixture pins it. Its tail is a temp table, not a DELETE, because the fixture is checked in
and must stay harmless if anyone runs it by hand. It was never run against prod: lint refuses it
before a client is opened, and it was written in the same commit as the fix.

```
$ node scripts/db-test.mjs --file scripts/fixtures/db-test/rollback_then_writes.sql; echo $?
db-test: lint rollback_then_writes.sql: only the last statement may be a top-level `rollback`: a rollback in the middle of the batch ends the transaction, and Postgres commits everything after it
EXIT=2
```

Five new cases beside the existing `end` one, and every real unit still lints clean:

```
$ node -e "…buildPlan(readdirSync('db/tests'))… lintUnitText(loader+test)…"
units 21 lint failures 0
```

Commit: `0e47f9c fix(15-r2): lint refuses a second top-level rollback, which used to commit the tail`

## Finding 2 — `redact()` missed the bare hostname

`url.host` is `host:port`, and the common driver failure names neither port nor password:
`getaddrinfo ENOTFOUND aws-0-us-east-1.pooler.supabase.com`. That went through unredacted, against
the function's own contract. `url.hostname` is now redacted alongside `url.host`, with a test using
that exact string. Proven on a real failure under finding 5 below.

Commit: `df57144 fix(15-r2): redact the bare hostname, not only host:port`

## Finding 3 — `loadDsn()` fell through to the global `process.env`, and mutated it

It honoured the injected `env` for the first read, then called `process.loadEnvFile(envFile)` and
read `process.env`. Two consequences: `loadEnvFile` does not override existing values, so a caller
passing an explicit `env` without the variable silently picked up the ambient credential — an
intended "different database" call got the default one — and every call mutated the real
`process.env` with the whole of `.env.local`, a side effect on a module whose header advertises none.

A new exported `parseEnvFile()` reads the file into a local object (`KEY=value`, `#` comments,
blanks, an optional `export ` prefix, matching quotes stripped, and everything after the first `=`
kept for an unquoted value, because a generated password may contain a `#`). `loadDsn()` consults
`options.env` and then that object, and nothing else. Precedence is unchanged: the process
environment still wins over the file.

Four new cases, one of which writes a marker key into a temp `.env.local` and asserts it never
reaches `process.env`. The real gitignored file still resolves:

```
$ node scripts/db-test.mjs --ping
db-test: connected as db_test_runner
EXIT=0
```

Commit: `788ffc4 fix(15-r2): loadDsn parses .env.local locally instead of into process.env`

## Finding 4 — zero units exited 0

`db-test: passed 0, failed 0, units 0` returning 0 meant a relocated script or a renamed directory
reported green having executed nothing — the worst kind of green, since the DoD gate and Stack's
acceptance step 3 both read the exit code. The all-units mode now raises
`no units found in <dir>: nothing was run` and exits 2, printing no summary line at all.

`--only` and `--file` naming a missing file are **unchanged**: they already exit 2, from
`unitForOnly` / `unitForFile` (`--only nope.sql: no such file in <dir>`, `--file <path>: no such
file`), and the existing test for that is untouched.

Commit: `7380814 fix(15-r2): zero units in the all-units mode exits 2, not 0`

## Finding 5 — a client was dropped without `end()` when `connect()` rejected

The CLI sets `process.exitCode` rather than calling `process.exit`, so the handle `pg` left behind
kept the event loop alive and the command hung after a connection failure instead of exiting 2 — the
one case where a wrong DSN or a down pooler is most likely. `connect()` now awaits
`endQuietly(client)` before rethrowing.

Two regression tests, for the all-units path and for `--ping`, each asserting the dropped client was
ended. Also checked live against a host that does not resolve; it returned promptly, and finding 2's
redaction is visible on a real driver error:

```
$ BB2DASH_TEST_DB_URL='postgresql://…@no-such-host.invalid:5432/postgres?sslmode=require' node scripts/db-test.mjs --ping; echo $?
db-test: connection failed: getaddrinfo ENOTFOUND <redacted>
EXIT=2
```

Commit: `243fce0 fix(15-r2): end the client when connect() rejects, so a failed connection cannot hang`

## Finding 6 — `.env.example` documented a value that cannot connect

The line was empty, so a DSN written from the template lacked
`?uselibpqcompat=true&sslmode=require` and died with `self-signed certificate in certificate chain`.
It now carries the full working shape with `PASSWORD` as the placeholder, and the comment above it
explains the 5432-not-6543 rule, why both query parameters are needed, and that the runner refuses a
DSN with no `sslmode` or with `disable`/`allow`/`prefer`. The real value still lives only in the
gitignored `.env.local`, and the brief's task 2 grep is unaffected:

```
$ grep -c "^BB2DASH_TEST_DB_URL=" .env.example
1
$ node -e "…parseEnvFile('.env.example')… new URL(…)…"
port 5432 | sslmode require | uselibpqcompat true | password placeholder PASSWORD
```

Commit: `de56731 fix(15-r2): .env.example carries a DSN shape that can actually connect`

## Finding 7 — the DSN must name an encrypted transport (contract addition)

The only change here that alters behaviour for a DSN that used to be valid.
`assertDsnAllowed()` validated the port only, so `sslmode=disable` — or no `sslmode` at all, where
node-postgres connects in cleartext — reached prod unremarked, as a `BYPASSRLS` role. It now accepts
`require`, `verify-ca`, `verify-full` and `no-verify`, and refuses `disable`, `allow`, `prefer`, an
unknown spelling, and an absent `sslmode`. The message names the fix and carries no part of the DSN
beyond the `sslmode` word it is rejecting. Both the URL form and a libpq keyword/value string are
read.

Deliberately the cheap half of the problem: it stops an accidental cleartext connection without
pretending to solve chain verification, which needs Supabase's CA from the dashboard and is Stack's
call. `?uselibpqcompat=true&sslmode=require` keeps working — the test fixture DSN now carries it,
and `--ping` still connects. Six new cases cover every accepted and refused spelling, the
keyword/value form, the no-leak property and the exit-2 path through `run()`. The rule is documented
in `db/tests/README.md` beside the 6543 rule.

Commit: `3c8417f feat(15-r2): the DSN must name an encrypted transport, not only a session port`

## Round 2 — the checks the PM asked for

```
$ node --test scripts/db-test.test.mjs
ℹ tests 59
ℹ pass 59
ℹ fail 0
```

The DoD's own gate, both files together:

```
$ node --test scripts/db-test.test.mjs scripts/google-consent.test.mjs
ℹ tests 68
ℹ pass 68
ℹ fail 0
EXIT=0
```

Task 6's row, still as the brief gives it, plus the new fixture:

```
$ node scripts/db-test.mjs --file scripts/fixtures/db-test/passes.sql; echo $?
PASS  passes.sql
db-test: passed 1, failed 0, units 1
EXIT=0

$ node scripts/db-test.mjs --file scripts/fixtures/db-test/fails.sql; echo $?
FAIL  fails.sql  FAIL this fixture always fails, on purpose
db-test: passed 0, failed 1, units 1
EXIT=1

$ node scripts/db-test.mjs --file scripts/fixtures/db-test/commits.sql; echo $?
db-test: lint commits.sql: top-level `commit` is not allowed; a unit must roll back
EXIT=2

$ node scripts/db-test.mjs --file scripts/fixtures/db-test/rollback_then_writes.sql; echo $?
db-test: lint rollback_then_writes.sql: only the last statement may be a top-level `rollback`: a rollback in the middle of the batch ends the transaction, and Postgres commits everything after it
EXIT=2
```

The whole suite from this branch, after merging the phase branch:

```
$ node scripts/db-test.mjs; echo $?
PASS  inbox_apply_090_attention_archive.sql
PASS  phase10a_stage_attempts.sql
PASS  phase10a_stage_gradebook.sql
PASS  phase10b_grade_model.sql
PASS  phase10b_round2.sql
PASS  phase12b_073_workload_visibility.sql
PASS  phase12b_074_reading_file_links.sql
PASS  phase12b_075_shared_column_restamp.sql
PASS  phase12b_076_rls_initplan_and_truncate.sql
PASS  phase12b_077_inbox_feedback.sql
PASS  phase12b_078_status_fold_and_auto_graded.sql
PASS  phase12b_082_083_planner_series.sql
PASS  phase12b_084_shared_column_conflict.sql
PASS  phase12b_085_stage_attempts_v4.sql
PASS  phase12b_086_reading_link_settles.sql
PASS  phase12b_087_auto_graded_sticks.sql
PASS  phase12b_089_work_items_due_on.sql
PASS  phase15_100_db_test_runner_role.sql
PASS  phase15_101_search_path_pin.sql
PASS  phase15_102_planner_series_orphan.sql
PASS  phase9_transform_states.sql
db-test: passed 21, failed 0, units 21
EXIT=0
```

Files changed in round 2, and nothing else:

```
$ git diff --stat d0ffe37..HEAD
 .env.example                                      |   8 +-
 db/tests/README.md                                |  36 +++-
 scripts/db-test.mjs                               | 146 +++++++++++++--
 scripts/db-test.test.mjs                          | 205 +++++++++++++++++++++-
 scripts/fixtures/db-test/rollback_then_writes.sql |  27 +++
 5 files changed, 400 insertions(+), 22 deletions(-)
```

## One thing the PM should know

Finding 7 changes the Contract table's `--ping` / credential paragraph, which the PM said they would
amend. Nothing else in round 2 changes a brief check: task 2's grep, task 3's counts, task 6's three
lines and task 7's unit are all unchanged, and task 17's gate now reads `passed 21, failed 0,
units 21` from this branch.

The two least-privilege notes still with a reviewer (the forward-dated
`alter default privileges … grant select`, and `update on app_settings` being table-wide rather than
column-level) would both need a new migration rather than an edit to 100, which is the PM's call.
Neither is touched here.
