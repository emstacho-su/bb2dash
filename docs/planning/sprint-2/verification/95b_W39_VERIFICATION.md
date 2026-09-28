# 95b — W-39 verification note (Phase 15, suite repair)

Worker W-39 · branch `feat/db-hygiene-15-suite` · worktree `bb2dash-wt-15-suite`
Brief: `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md` (§Task list rows 8–11).
Every output below is pasted as the tool or the shell returned it.

**Wave 1 (2026-09-27).** There is no `.env.local` and no test-runner credential on this machine
yet (brief task 5 is Stack's), and `scripts/db-test.mjs` (W-38's) is not on this branch yet, so the
live checks of tasks 9, 10 and 11 were run the way this suite was run all through sprint 1: the
whole unit (loader + test file as one text) pasted into one `mcp__plugin_supabase_supabase__execute_sql`
call against prod `goultdzqcavefcgnifdy`. Wave 2 reruns each of them in the brief's runner form
(`node scripts/db-test.mjs --only <file>`) and records that output under the same task heading.

---

## Task 8 — P-30 + P-101: `captured_at` off `now()`, loader regenerated, drift guard extended

Owner W-39. Files: `db/fixtures/phase10a/build_load_sql.js`,
`db/tests/phase10a_load_fixtures.sql` (generated), `web/test/fixtures.phase10a.test.ts`,
`db/fixtures/phase10a/README.md`.

### The check, as the brief writes it

> `cd web && npx vitest run test/fixtures.phase10a.test.ts` → 0 failures;
> `grep -c "'::timestamptz);" db/tests/phase10a_load_fixtures.sql` → 0 (3 today)

### RED (2026-09-27) — the new guard case fails before the generator change

The new case was added to `web/test/fixtures.phase10a.test.ts` first, with the generator still
emitting quoted literals. Command, from `C:/Users/estac/projects/bb2dash-wt-15-suite/web`:

```
npx vitest run test/fixtures.phase10a.test.ts
```

```
 FAIL  test/fixtures.phase10a.test.ts > db/tests/phase10a_load_fixtures.sql is in sync with the fixtures > feeds captured_at from now(), never a quoted timestamp literal
AssertionError: expected '-- bb2dash :: db/tests/phase10a_load_…' not to match /::timestamptz/
 ❯ test/fixtures.phase10a.test.ts:236:21
    234|   it('feeds captured_at from now(), never a quoted timestamp literal',…
    235|     const sql = builder.build();
    236|     expect(sql).not.toMatch(/::timestamptz/);
       |                     ^
    237|
    238|     const offsets = [...sql.matchAll(/^ {3}now\(\) - interval '(\d+(?:…

 Test Files  1 failed (1)
      Tests  1 failed | 18 passed (19)
```

exit code 1. (The assertion's diff prints the whole generated loader; the lines above are the
failure header, the assertion and the counts, unedited. The full capture is not kept in the repo.)

The brief's second check, before the change:

```
$ grep -c "'::timestamptz);" db/tests/phase10a_load_fixtures.sql
3
```

### GREEN (2026-09-27)

Generator changed, then regenerated — never hand-edited:

```
$ node db/fixtures/phase10a/build_load_sql.js
wrote db\tests\phase10a_load_fixtures.sql
```

```
$ cd web && npx vitest run test/fixtures.phase10a.test.ts

 RUN  v5.0.0 C:/Users/estac/projects/bb2dash-wt-15-suite/web

 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  21:53:03
   Duration  2.08s (environment 76%, setup 17%, transform 4%, tests 2%, import 1%)
```

exit code 0.

```
$ grep -c "'::timestamptz);" db/tests/phase10a_load_fixtures.sql
0
```

### The fixture's before / after shape

`grep -n "now() - interval\|::timestamptz" db/tests/phase10a_load_fixtures.sql`

before (the three shells, in generated order — sorted by `bb_course_id`):

```
   '2026-09-14T17:19:20.009246+00:00'::timestamptz);   -- _570161_1  IST.471
   '2026-09-14T17:19:23.154459+00:00'::timestamptz);   -- _571529_1  IST.323 (the newest shell)
   '2026-09-14T17:19:21.002817+00:00'::timestamptz);   -- _572517_1  ECN.304
```

after:

```
47:   now() - interval '3.145213 seconds');   -- _570161_1  IST.471
53:   now() - interval '0 seconds');          -- _571529_1  IST.323 (the anchor: the newest shell)
59:   now() - interval '2.151642 seconds');   -- _572517_1  ECN.304
```

Order and spacing are the originals to the microsecond: IST.471 is 3.145213 s and ECN.304 is
2.151642 s behind IST.323, exactly as the crawl recorded them. The new vitest case asserts both —
no `::timestamptz` anywhere in the generated text, three `now() - interval '<n> seconds'`
expressions, and offsets that reproduce the fixtures' own gaps (recomputed from the JSON in the
test, microsecond-accurate, because `Date.parse` truncates at milliseconds). The byte-for-byte
drift guard is untouched and still passes.

Prod facts behind the choice of anchor (read `2026-09-28 01:48:24+00`, SELECT only): `bb_raw` has no
check constraint on `captured_at` (`bb_raw_pkey` is its only constraint), `max(captured_at)` over
every real row is `2026-09-27 21:00:10.597331+00`, and 8 sync runs are registered. Anchoring the
newest shell on `now()` therefore puts the fixture crawl ahead of every registered crawl on any day
it is run, and `phase10a_stage_gradebook.sql` §5's second crawl (`captured_at + interval '1 day'`)
stays newer again.

---

## Task 9 — the phase10a pair on today's prod: **FAIL** (blocked outside W-39's file set)

Owner W-39. The task has no file of its own: task 8's generator change is the whole build. Both
units were run by pasting the loader and the test file as one text into one `execute_sql` call
against prod `goultdzqcavefcgnifdy`.

### The check, as the brief writes it

> runner `--only phase10a_stage_gradebook.sql` → `db-test: passed 1, failed 0, units 1`; same for
> `--only phase10a_stage_attempts.sql`

### RED, before task 8's change (2026-09-27)

`phase10a_load_fixtures.sql` (committed copy, quoted literals) + `phase10a_stage_gradebook.sql`:

```
Failed to run sql query: ERROR:  P0001: FAIL 2 course(s) disagree on column count between bb_raw and v_gradebook_latest
CONTEXT:  PL/pgSQL function inline_code_block line 14 at RAISE
```

`phase10a_load_fixtures.sql` + `phase10a_stage_attempts.sql`:

```
Failed to run sql query: ERROR:  P0001: FAIL IST.323/quiz-01 has 3 attempt row(s), expected 2
CONTEXT:  PL/pgSQL function inline_code_block line 6 at RAISE
```

### After task 8's change (2026-09-27): both units fail with the **same two lines**

Same two units re-run with the regenerated `now()`-relative loader:

```
Failed to run sql query: ERROR:  P0001: FAIL 2 course(s) disagree on column count between bb_raw and v_gradebook_latest
CONTEXT:  PL/pgSQL function inline_code_block line 14 at RAISE
```

```
Failed to run sql query: ERROR:  P0001: FAIL IST.323/quiz-01 has 3 attempt row(s), expected 2
CONTEXT:  PL/pgSQL function inline_code_block line 6 at RAISE
```

So **task 9 does not pass, and it cannot be made to pass from W-39's file set.** Neither failure is
the newest-run guard the brief's §Why names (P-30). Both are assertions that compare a
*fixture-scoped* count against an *unscoped* read of prod, and prod has grown since 2026-09-14.
They live in two files the brief's §Files does not list as changed and gives to nobody:
`db/tests/phase10a_stage_gradebook.sql` and `db/tests/phase10a_stage_attempts.sql`.

**§4a of `phase10a_stage_gradebook.sql` (line 137-148).** It counts gradebook columns per course in
the fixture's own `bb_raw` payload (`where b.run_id = (select run_id from _fx)`) and joins that to
`select course_id, count(*) from v_gradebook_latest group by 1` — the whole view, every run.
`v_gradebook_latest` keeps one row per (course, column) ever mirrored, so it holds today's columns,
not the fixture's. Prod, read 2026-09-27:

```
course_id            view_cols     fixture payload
ECN.304                      5     2
IST.323                     16     12
IST.471                      6     6
```

Exactly two courses disagree, which is the number in the FAIL line. No `captured_at` can close
that gap: the columns Blackboard has added since September are in the view whatever order the runs
are in.

**§5 of `phase10a_stage_attempts.sql` (line 212-213).** `select count(*) from v_assignment_attempts
where assignment_id = 'IST.323/quiz-01'` → 3, expected 2. The fixture contributes 2 synthetic
attempts; prod holds one real one, `_43045300_1`, first mirrored 2026-09-22 16:07:56 and re-seen
2026-09-23 and 2026-09-27. `v_attempts_latest` is `distinct on (course_id, column_id, attempt_id)`
across every registered run, so a real attempt and a fixture attempt both count and the total is
2 + 1. This unit was therefore already red when the brief was frozen: §Why's "two files are red on
today's prod" is three.

### What the fix looks like (for whoever the PM gives those two files to)

Both are one-clause changes, in the P-30 family the brief already sanctions, and **both depend on
task 8**: they only read correctly once the fixture crawl is the newest one.

* §4a: scope the view side to the fixture run, e.g. `select course_id, count(*) as view_cols from
  v_gradebook_latest where run_id in (select run_id from _fx) group by 1`. Because the fixture is
  now the newest crawl, `v_gradebook_latest`'s `distinct on` resolves each of the fixture's 20
  columns to the fixture's own row, so the scoped count is 6 / 12 / 2 and matches `bb_raw`. Before
  task 8 that same scoping would have returned 0 rows for those courses.
* §5: count the fixture's own attempts rather than every attempt on the column, e.g.
  `... where assignment_id = 'IST.323/quiz-01' and attempt_id in ('_8100001_1','_8100002_1')`, or
  add the fixture-run scope the rest of the file uses. `attempt_no = 1` is unaffected: the real
  attempt was created 2026-08-31 22:49:07, after the fixture's first at 22:14:11, so `_8100001_1`
  is still attempt 1.

W-39 did not make either change: those files are not in its set (brief §Workers), and the brief is
frozen. Recorded here for the PM.

### Nothing left behind

After the runs (`select count(*) from bb_raw` / `agent_requests` where `run_id` is either fixture
run): `0` and `0`.

---

## Task 10 — P-2: `phase10b_grade_model.sql` lines 171–172 and §4f

Owner W-39. Lines 167–168 (the GEO recitation seed) were **not touched**: they are brief 96's task
10a (W-42), and the diff shows them as unchanged context.

### The check, as the brief writes it

> runner `--only phase10b_grade_model.sql` → `db-test: passed 1, failed 0, units 1` (RED before the
> edit recorded in 95b)

### RED (2026-09-27), before the edit

The file pasted alone into one `execute_sql` call:

```
Failed to run sql query: ERROR:  23505: duplicate key value violates unique constraint "grade_column_links_pkey"
CONTEXT:  SQL statement "insert into grade_column_links (course_id, column_id, excluded)
  values ('IST.323', '_3598132_1', true)"
PL/pgSQL function inline_code_block line 26 at SQL statement
```

Not a `FAIL …` assertion: an unhandled `23505` from section 3's "Not graded" seed, which killed the
file before section 4 ran at all. Prod's `grade_column_links`, read the same day:

```
ECN.304   _3621234_1   component 2     excluded false   2026-09-27 21:17:10.479867+00
IST.323   _3560527_1   component 13    excluded false   2026-09-22 16:14:26.757772+00
IST.323   _3560541_1   component 16    excluded false   2026-09-22 16:14:44.234065+00
IST.323   _3569973_1   component 18    excluded false   2026-09-22 16:14:36.736971+00
IST.323   _3598132_1   component null   excluded true    2026-09-22 16:16:57.448326+00
```

Two facts follow, and the edit answers both: the seed's row already exists (line 171–172), and the
column §4f expected to be *unlinked*, `_3569973_1`, now carries Stack's own override to component
18.

### The edit

* **Lines 171–172** keep the same seed and add `on conflict (course_id, column_id) do update set
  excluded = true, component_id = null`. The case's meaning is unchanged — the link exists, is
  excluded, carries no component — and it now holds whether or not prod already has the row. It is
  written as the owner through RLS (section 3 sets `request.jwt.claims` and `set local role
  authenticated` first), so the update path is the owner's own, not a bypass.
* **§4f** reads `_3569973_1`'s current link state into `lnk` (`select * into lnk from
  grade_column_links where course_id = 'IST.323' and column_id = '_3569973_1'`) and asserts relative
  to it. The invariant the case exists for is asserted unconditionally: a column bound to two
  assignments never resolves to an assignment (`r.assignment_id is not null` → FAIL). The rest
  follows the table: with a link, 058 must read `link_source = 'override'`, the same `excluded`, and
  `component_id` = the link's (null when the link is excluded); with no link, no component and no
  source at all — September's expectation, kept for the day the override goes away. One variable
  (`lnk record`) was added to section 4's `declare`, which is what "reads … into a variable" needs.

### GREEN (2026-09-27)

Same paste, after the edit. Final result row, exactly as returned:

```
[{"result":"phase10b_grade_model: PASS","model_items":85,"kinds":{"item":53,"attendance":5,"placeholder":27},"unsure_links":7,"ist323_bb_running":true,"history_changed_columns":10}]
```

First column: `phase10b_grade_model: PASS`.

### Nothing left behind

The unit now **updates** a real prod row inside its transaction, so this was checked explicitly
after the rollback. `select course_id, column_id, component_id, excluded, updated_at from
grade_column_links order by course_id, column_id` returns the same five rows as before the run, row
for row, `updated_at` included — `IST.323/_3598132_1` still reads `component_id null, excluded true,
2026-09-22 16:16:57.448326+00`, so the upsert did not restamp it. `select count(*) from
grade_scenarios` is still `0`.

### Still needs the runner (wave 2)

`node scripts/db-test.mjs --only phase10b_grade_model.sql` → `db-test: passed 1, failed 0, units 1`.
The file's lint shape is unchanged: first statement `begin;`, last `rollback;`, no top-level
`commit`/`end`, and it ends in a `: PASS` row.

---

## Task 11 — P-8: `db/tests/phase9_transform_states.sql`

Owner W-39. New file; nothing else touched.

### The check, as the brief writes it

> runner `--only phase9_transform_states.sql` → `db-test: passed 1, failed 0, units 1`
>
> (task row) A crafted payload makes one stage raise, so `run_transform` leaves
> `sync_runs.status = 'partial'` with exactly one `sync_stage_runs` row `failed`. A `running` row
> with `started_at = now() - interval '31 minutes'` reads `failed`, with notes ending
> `interrupted (reaped)`, after `transform_tick()`, whose result has `reaped` >= 1

### RED (2026-09-27)

Before this commit the file did not exist, so there was no proof of either state: `partial` and a
reaped `failed` were the two `sync_runs` statuses no test in `db/tests/` ever produced (P-8's
reason). `--only phase9_transform_states.sql` had nothing to name.

Because "the file did not exist" is a weak RED, the assertions were also shown to bite. The same
unit was re-run as a **mutation probe** with one character class changed — `created` given a valid
date (`2026-09-20T12:00:00.000Z`) instead of `the fourteenth of never` — so no stage raises. Pasted
through `execute_sql`, it fails exactly where it should:

```
Failed to run sql query: ERROR:  P0001: FAIL run_transform left sync_runs.status = ok, expected partial
CONTEXT:  PL/pgSQL function inline_code_block line 7 at RAISE
```

The probe is not in the repo; the committed file is the one below.

### GREEN (2026-09-27)

The whole file pasted as one `execute_sql` call against prod `goultdzqcavefcgnifdy`. Result row:

```
result:        phase9_transform_states: PASS
folded_status: partial
stages:        announcements=failed, assignments=ok, attempts=ok, content=ok, courses=ok, files=ok, gaps=ok, gradebook=ok
reaped_notes:  phase9 fixture: died with its session | interrupted (reaped)
fresh_status:  running
```

Every clause of the brief's row is in that one row: eight stages ran, exactly one (`announcements`)
is `failed`, the run is `partial`, the 31-minute-old `running` row came back `failed` with notes
*ending* `interrupted (reaped)` and with the note it already had kept in front of it, and the run
started a moment ago is still `running` (the 30-minute boundary is a real boundary). The file also
asserts `transform_tick()`'s own `reaped` >= 1, that the failed stage recorded error text, that the
run carries its reason in `summary->errors`, that `finished_at` is set, and that the broken stage
wrote no announcement row.

How the one stage is made to raise: `announcements[0].created` is `the fourteenth of never`, which
034:715 casts to `timestamptz` inside `stage_announcements`'s own `begin … exception` block. The
cast raises before the upsert, so the stage records `failed` and writes nothing. No other stage
reads the `announcements` key, and the payload carries nothing else, so the other seven report `ok`.

### Nothing left behind

After the rollback (same instant, separate `execute_sql` call):

```
fixture_sync_runs      0
fixture_bb_raw         0
fixture_requests       0
fixture_announcements  0
running_rows           0
reaped_rows            0
```

`transform_tick()` is called inside the transaction. Prod held 0 unfolded registered crawls and 0
`running` rows when this ran, so the tick folded nothing, quarantined nothing, and the only row it
reaped was the fixture's — and that rolled back with the rest.

### Still needs the runner (wave 2)

The brief's own form of this check, `node scripts/db-test.mjs --only phase9_transform_states.sql`
→ `db-test: passed 1, failed 0, units 1`. The file already satisfies the runner's lint rules by
construction: first statement `begin;`, last statement `rollback;`, no top-level `commit` or `end`
(`on commit drop` is inside a `create temp table`, and each `end` is inside a dollar-quoted body),
and it returns a row whose first column ends in `: PASS`.

---

## Task 9, second pass — both phase10a units green (file set extended by the PM)

On 2026-09-27 the PM extended W-39's file set to `db/tests/phase10a_stage_gradebook.sql` and
`db/tests/phase10a_stage_attempts.sql`, verified both causes above independently, and asked for the
two assertions to be **scoped to the fixture's own rows** — never weakened, never deleted. The
brief's error (§Why's "two files are red" is three, and §Files lists neither of these) goes in the
phase PR. Lines 167–168 of `phase10b_grade_model.sql` remain untouched.

### `db/tests/phase10a_stage_attempts.sql` — §5, the first three clauses

RED (already captured above, unchanged by task 8):

```
Failed to run sql query: ERROR:  P0001: FAIL IST.323/quiz-01 has 3 attempt row(s), expected 2
CONTEXT:  PL/pgSQL function inline_code_block line 6 at RAISE
```

What changed: the three clauses that read the column as a whole now name the fixture's own two
attempt ids. The count becomes `where assignment_id = 'IST.323/quiz-01' and attempt_id in
('_8100001_1', '_8100002_1')`; the numbering clause compares the two attempts' `attempt_no` to each
other (`_8100001_1` strictly below `_8100002_1`) instead of asserting that `attempt_no = 1` is
`_8100001_1`; and `attempts_allowed` is read by `attempt_id = '_8100001_1'` instead of by
`attempt_no = 1`. The unused `v text` declaration went with the clause that used it.

What it still proves: both of the fixture's attempts reach `v_assignment_attempts`, they are numbered
oldest first, and `attempts_allowed` is 3 from the gradebook column — the same three properties,
now stated so that a real attempt on the same column (or a new submission tomorrow) cannot move
them. Nothing was weakened: no assertion was dropped, and none was replaced by a range.

GREEN (2026-09-27), loader + file pasted as one `execute_sql` call:

```json
{"result":"phase10a_stage_attempts: PASS","attempt_rows":4,"pulled_back_files":3,"view_rows":14}
```


### `db/tests/phase10a_stage_gradebook.sql` — §4a, and then §4d

RED, §4a (already captured above):

```
Failed to run sql query: ERROR:  P0001: FAIL 2 course(s) disagree on column count between bb_raw and v_gradebook_latest
CONTEXT:  PL/pgSQL function inline_code_block line 14 at RAISE
```

What changed in §4a: the view side of the join is scoped to the fixture run —
`select course_id, count(*) as view_cols from v_gradebook_latest where run_id in (select run_id from
_fx) group by 1` — and the join became a `left join` with `coalesce(vc.view_cols, 0)`, so a course
that vanished from the view is a disagreement rather than a row the inner join quietly dropped. The
message text is unchanged.

What it still proves: per course, every gradebook column in the fixture's `bb_raw` payload is
mirrored exactly once in `v_gradebook_latest` under that run — 6 / 12 / 2 for IST.471 / IST.323 /
ECN.304. It reads that way only because the fixture crawl is now the newest one (task 8): with the
old 2026-09-14 literals the real crawls' rows would win the view's `distinct on` and the scoped
count would have been 0.

Scoping §4a moved the failure on to **§4d**, which the first pass never reached:

```
Failed to run sql query: ERROR:  P0001: FAIL IST.323 item_count = 14, expected 10
CONTEXT:  PL/pgSQL function inline_code_block line 60 at RAISE
```

§4d could not be scoped the same way. `v_course_grade` aggregates the whole of `v_gradebook_latest`
per course through a lateral and exposes no run at all (`pg_get_viewdef`, read 2026-09-27), so its
`item_count` and `graded_item_count` are today's gradebook by construction: IST.323 read 10 items
when these payloads were cut and 14 on 2026-09-27. Rather than pin a new literal that would rot the
same way, each count is now asserted against the same view computed independently by
`column_kind`, plus the exclusion that is the actual property — the course carries kinds that are
not items, and `item_count` must be strictly below its column count. A guard in front refuses to
let the case go quiet: if IST.323 ever loses its total or its letter column, or ECN.304 its
attendance column, it raises `FAIL the fixture courses no longer carry a total, a letter and an
attendance column, so 4d proves nothing`.

What it still proves: `item_count` counts items and only items, `graded_item_count` counts the
scored ones and never exceeds `item_count`, and both exclude the total, the letter and the
attendance column. Prod, read 2026-09-27: IST.323 14 items (7 scored) of 16 columns, ECN.304 4 items
of 5.

GREEN (2026-09-27), loader + file pasted as one `execute_sql` call:

```json
{"result":"phase10a_stage_gradebook: PASS","gradebook_rows":355,"latest_rows":60,"courses_with_gradebook":7,"courses_with_total":1,"kinds":{"item":53,"total":1,"letter":1,"attendance":5}}
```

Sections 5, 5b, 6 and 7 ran for the first time on this prod and needed no change: they are already
fixture-scoped (`run_id in (select run_id from _fx)`, `raised_by in (select sync_run_id from _fx)`)
or derive their expectation from the counts the stage itself returned.

### All four units green together (2026-09-27)

Re-run from the final working tree, each unit pasted as one `execute_sql` call, in one sitting:

```json
{"result":"phase10a_stage_gradebook: PASS","gradebook_rows":355,"latest_rows":60,"courses_with_gradebook":7,"courses_with_total":1,"kinds":{"item":53,"total":1,"letter":1,"attendance":5}}
{"result":"phase10a_stage_attempts: PASS","attempt_rows":4,"pulled_back_files":3,"view_rows":14}
{"result":"phase10b_grade_model: PASS","model_items":85,"kinds":{"item":53,"attendance":5,"placeholder":27},"unsure_links":7,"ist323_bb_running":true,"history_changed_columns":10}
{"result":"phase9_transform_states: PASS","folded_status":"partial","stages":"announcements=failed, assignments=ok, attempts=ok, content=ok, courses=ok, files=ok, gaps=ok, gradebook=ok","reaped_notes":"phase9 fixture: died with its session | interrupted (reaped)","fresh_status":"running"}
```

Residue after all four, every figure as it was before them:

```
bb_raw, fixture run ids (10a0- and 0900-)          0
agent_requests, fixture run ids                    0
grade_column_links                                 5 rows
IST.323/_3598132_1                                 component_id null, excluded true, updated_at 2026-09-22 16:16:57.448326+00
grade_scenarios                                    0
sync_runs running or reaped                        0
announcements 'phase9-broken-timestamp'            0
```

Two figures in those rows are live-data drift the files are written to absorb, not failures:
`history_changed_columns` reads 10 against a floor of 5 (the mirror is append-only, so the floor can
only grow), and `view_rows` reads 14 because real attempts share the fixture's columns — which is
exactly why §5 now names its own attempt ids.

### Still needs the runner (wave 2)

`node scripts/db-test.mjs --only phase10a_stage_gradebook.sql` and `--only
phase10a_stage_attempts.sql` → `db-test: passed 1, failed 0, units 1` each, with the loader in front
of both (the frozen loader map). Both files keep their lint shape: first statement `begin;`, last
`rollback;`, no top-level `commit`/`end`, `: PASS` row at the end.

---

# Wave 2 — the runner form (2026-09-27)

`feat/db-hygiene-15` merged into this branch (merge `bff50c9`), so W-38's `scripts/db-test.mjs`, its
fixtures and migration 100 are on disk, and `npm --prefix scripts ci` installed `pg`
(`added 14 packages … found 0 vulnerabilities`; Node v24.13.0). `.env.local` was already in the
worktree, gitignored (`git check-ignore -q .env.local` → 0), and is neither committed nor printed
here; its `?uselibpqcompat=true&sslmode=require` is left exactly as the PM wrote it.

The loader map puts `phase10a_load_fixtures.sql` in front of both phase10a units by itself, with no
argument from me — `node scripts/db-test.mjs --list`:

```
unit 02  phase10a_load_fixtures.sql + phase10a_stage_attempts.sql
unit 03  phase10a_load_fixtures.sql + phase10a_stage_gradebook.sql
unit 04  phase10b_grade_model.sql
unit 18  phase9_transform_states.sql
```

## Task 9 — runner form

```
$ node scripts/db-test.mjs --only phase10a_stage_gradebook.sql
PASS  phase10a_stage_gradebook.sql
db-test: passed 1, failed 0, units 1
exit=0

$ node scripts/db-test.mjs --only phase10a_stage_attempts.sql
PASS  phase10a_stage_attempts.sql
db-test: passed 1, failed 0, units 1
exit=0
```

Both match the brief's row. W-40 was applying 101 and then 102 to prod during these runs; no unit
raised, and nothing in any output names a pinned `search_path` or the new planner trigger.

## Task 8 — the guard re-run on the merged tree

```
$ cd web && npx vitest run test/fixtures.phase10a.test.ts
 Test Files  1 passed (1)
      Tests  19 passed (19)
   Start at  22:59:44
   Duration  12.20s (environment 85%, setup 14%, transform 1%)
exit=0
```

## Task 10 — runner form

```
$ node scripts/db-test.mjs --only phase10b_grade_model.sql
PASS  phase10b_grade_model.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## Task 11 — runner form

```
$ node scripts/db-test.mjs --only phase9_transform_states.sql
PASS  phase9_transform_states.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## Residue after the wave-2 runs

Read straight after them, SELECT only:

```
bb_raw, fixture run ids (10a0- and 0900-)   0
agent_requests, fixture run ids             0
grade_column_links                          5
grade_scenarios                             0
sync_runs running or reaped                 0
IST.323/_3598132_1 updated_at               2026-09-22 16:16:57.448326+00
```

Every W-39 row of the brief's §Task list has now passed its own check in the form the row names.

---

# Wave 3 — the four pre-existing red units (2026-09-27)

Stack decided Phase 15 absorbs them; the PM extended W-39's file set again and writes the DECISIONS
line (brief open item 6's pattern: a P-30-shaped fix in the phase that finds it). Migrations 101 and
102 are on prod for every run below. None of the four is a product defect, and no assertion was
weakened: each was scoped, seeded, or made relative.

Baseline on this branch after merging `origin/feat/db-hygiene-15`, `node scripts/db-test.mjs`:

```
FAIL  phase12b_077_inbox_feedback.sql  FAIL v_inbox_feedback is empty - prod has closed rows with notes
FAIL  phase12b_078_status_fold_and_auto_graded.sql  FAIL 0 of the 4 advanceable rows read graded
FAIL  phase12b_084_shared_column_conflict.sql  FAIL the IST.323 shared-column row is not dismissed
FAIL  phase12b_089_work_items_due_on.sql  FAIL the Lab #1 fixture row is gone from v_work_items
db-test: passed 14, failed 4, units 18
```

exit 1. (18 units, not 21: `phase15_100_db_test_runner_role.sql` and W-40's two `phase15_*` test
files are not on this branch yet — the merge brought the runner, 100 and the walk doc only. The four
failures are the four named.)

## `phase12b_077_inbox_feedback.sql` — seed the view's own closed row

RED: `FAIL v_inbox_feedback is empty - prod has closed rows with notes` (line 60).

Cause, verified first-hand: migration 090 added a fourth state, `archived`, and `/inbox-apply` moved
every closed row into it. `attention_items` on prod holds 5 `open` and 142 `archived` rows and **no**
`resolved` or `dismissed` row at all, while `v_inbox_feedback` filters
`state = any (array['resolved','dismissed']) and coalesce(btrim(resolution_note),'') <> ''`
(`pg_get_viewdef`, 2026-09-27). So `n_view = n_expected = 0`, the count assertion passed on nothing,
and the emptiness assertion raised.

The fix: the unit seeds its own `resolved` row (`state = 'resolved'`, a note, `resolution
{"accept": true}`, `applied_at` set) into `attention_items` inside its transaction, records its id in
a temp table, and asserts the view carries **that** row by id, on top of the assertions already
there. Nothing was relaxed: the counts must still agree, no `open` row may leak, no row may arrive
without a note, a `resolved` row must be present, and `was_applied` / `feedback` / `accept` must still
agree with `attention_items` row for row.

What it still proves: `v_inbox_feedback` returns exactly the closed rows that carry a note, with the
answer and the applied flag travelling with them — and now it proves it on any database, instead of
depending on prod holding a state `/inbox-apply` no longer leaves behind.

GREEN:

```
$ node scripts/db-test.mjs --only phase12b_077_inbox_feedback.sql
PASS  phase12b_077_inbox_feedback.sql
db-test: passed 1, failed 0, units 1
exit=0
```

## `phase12b_084_shared_column_conflict.sql` — `archived` counts as closed

RED: `FAIL the IST.323 shared-column row is not dismissed` (line 43).

Cause, verified first-hand — the same 090 drift. The row is there, with 084's own note intact, but
`/inbox-apply` has archived it (prod 2026-09-27):

```
id 137 | state archived | resolved_at set | archived_at set | archived_by 'inbox-apply request 35'
note   Closed by 084: a shared gradebook column is handled by 075; nothing to decide.
```

The fix: `state in ('dismissed', 'archived')`. `resolved_at is not null` stays, so a row archived
without ever having been resolved still fails. §2's `v_after = v_before` was left exactly as it is,
as instructed — it is the one assertion a concurrent committed `/inbox-apply` could break.

What it still proves: the shared-column conflict is closed, never re-raised, carries 084's own note,
and no `bb_column_id` conflict on a `column:%` ref is open. Only where a *closed* row is filed stopped
being asserted, and archiving is a one-way move out of the Inbox that never re-opens a row.

GREEN:

```
$ node scripts/db-test.mjs --only phase12b_084_shared_column_conflict.sql
PASS  phase12b_084_shared_column_conflict.sql
db-test: passed 1, failed 0, units 1
exit=0
```
