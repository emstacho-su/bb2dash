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

_(pending in this wave — filled in below when run)_

---

## Task 4 — migration 100

_(pending in this wave — filled in below when run)_
