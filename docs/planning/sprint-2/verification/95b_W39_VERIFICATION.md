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
