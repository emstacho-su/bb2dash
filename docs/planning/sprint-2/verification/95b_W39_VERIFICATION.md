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
