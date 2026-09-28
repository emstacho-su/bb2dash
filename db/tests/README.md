# db/tests — the SQL suite and how to run it

These files assert facts about the **production** database (`goultdzqcavefcgnifdy`). Every one of
them opens its own transaction and ends with `rollback;`, so nothing a test writes survives. They
are run by `scripts/db-test.mjs`, the runner added in Phase 15 (brief 95, R-79).

This README supersedes the "RUN IT: paste the whole file into one `execute_sql` call" header that
the sprint-1 files still carry. Pasting a file into `execute_sql` still works; the runner is the
supported way.

## Once per machine

1. `npm --prefix scripts ci` — installs the runner's single dependency, `pg`, pinned exact.
2. Put the connection string in `.env.local` at the root of the checkout, as
   `BB2DASH_TEST_DB_URL`. `.env.local` is gitignored and must never be committed; the canonical
   copy lives in the main checkout (`C:/Users/estac/projects/bb2dash/.env.local`) and is copied
   into worktrees by hand. The runner also reads the variable straight from the process
   environment, which wins over the file.

The role is `db_test_runner` (migration `100_db_test_runner_role.sql`): a login role with
`BYPASSRLS`, `select` everywhere in `public`, and `insert/update/delete` and `execute` on only what
the suite actually writes and calls. Its password is set by hand and is in no file in this repo.

The DSN must be a **direct** or **session-pooler** connection (port 5432). The runner refuses port
6543, the transaction pooler: four units run `set local role` mid-transaction, which needs a
session-scoped connection.

It must also end `?uselibpqcompat=true&sslmode=require`, not `?sslmode=require` on its own. `pg`
8.23 reads a bare `sslmode=require` as libpq's `verify-full`, and the Supabase pooler's certificate
chains to a private root, so the connection dies with
`db-test: connection failed: self-signed certificate in certificate chain` and exit 2.
`uselibpqcompat=true` restores libpq's own `require` — encrypted, no chain check — which is what
`psql` does. Anyone writing this DSN by hand needs both parameters.

## Running it

| Command | Does |
|---|---|
| `node scripts/db-test.mjs` | every unit in `db/tests/`, in name order |
| `node scripts/db-test.mjs --only <file.sql>` | one `db/tests` file, with its loader if it has one |
| `node scripts/db-test.mjs --file <path.sql>` | one file from anywhere (e.g. `scripts/fixtures/db-test/passes.sql`) |
| `node scripts/db-test.mjs <path.sql>` | the positional form of `--file` |
| `node scripts/db-test.mjs --list` | prints the plan and connects to nothing |
| `node scripts/db-test.mjs --ping` | connects and prints the role it connected as |

Output is one line per unit — `PASS  <file>` or `FAIL  <file>  <first line of the server error>` —
then a summary line, `db-test: passed <p>, failed <f>, units <n>`. Exit code 0 when nothing failed,
1 when a unit failed, and 2 on a usage, config, lint or connection error. Everything goes to
stdout, so the counts can be grepped out of a pipe.

No output ever holds the DSN or its password: both are stripped from every line, including server
errors.

## Units and the loader map

A **unit** is one test file, or a loader followed by its test file sent as one text. Three of
today's files need a loader; the loaders never run alone. The map is a frozen constant in
`scripts/db-test.mjs`:

| Loader | runs in front of |
|---|---|
| `phase10a_load_fixtures.sql` | `phase10a_stage_attempts.sql` |
| `phase10a_load_fixtures.sql` | `phase10a_stage_gradebook.sql` |
| `phase12b_load_fixture.sql` | `phase12b_085_stage_attempts_v4.sql` |

A loader opens the transaction (`begin;`) and deliberately does not commit; its test file asserts
and rolls back. A new test that needs a loader adds one line to that map in the same PR.

The name in every output line is the **test file's** basename, whichever form named it.

## The pass rule

A unit passes only if the server raises nothing **and** one result row's first column ends in
`: PASS`. That is the convention the sprint-1 files already follow:

```sql
select 'phase12b_073_workload_visibility: PASS' as result, ...;
```

A file that raises nothing but prints no such row is a FAIL. Failures are raised the repo's way:

```sql
raise exception 'FAIL v_work_items lost security_invoker or is readable by anon';
```

The first line of that exception is what the FAIL line shows, so write the message so it reads on
its own.

## The lint rules (checked before anything connects)

Comments and dollar-quoted bodies are stripped first, then the unit must:

* begin with `begin;` as its first statement (for a loader + test unit, the loader supplies it);
* end with `rollback;` as its last statement;
* contain no top-level `commit` or `end` statement.

A unit that breaks a rule prints `db-test: lint <file>: <rule>` and exits 2 **without opening a
connection**, so a file that would leave writes behind never reaches prod. `on commit drop`,
`case … end` and a `;` inside a string literal are not confused for statements.

`scripts/fixtures/db-test/` holds three fixtures that pin this behaviour: `passes.sql`,
`fails.sql`, and `commits.sql` (refused by lint).

## Naming

New files are named `phaseNN_NNN_name.sql`, where `NNN` is the migration the file tests — for
example `phase15_100_db_test_runner_role.sql` tests `db/migrations/100_db_test_runner_role.sql`. A
file that tests no single migration drops the number: `phase9_transform_states.sql`. This is a
convention for reading the directory, not a lint rule; the runner takes any `*.sql`.

Every unit rolls back, so the calendar-push cron and `transform_tick` never see a test row.
