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
