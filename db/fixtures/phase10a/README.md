# Phase 10a fixtures — gradebook and attempts

What the Grades work is tested against, so nobody has to hold a Blackboard session to run a test.
Brief: `docs/planning/sprint-1-hub/briefs/67_PHASE10A_grades.md`. Verification note: `docs/planning/sprint-1-hub/verification/66_W17_VERIFICATION.md`.

## What is here

| File | What it is | Real or synthetic |
|---|---|---|
| `gradebook_ECN304.json` | 2 columns: one attendance column with a score, one instructor-override item | **Real**, crawl `bf2f81e5-ea4c-4b64-bc43-129fd53d4616`, 2026-09-14 |
| `gradebook_IST323.json` | 12 columns: the one calculated **total** on the project, the one **letter** column, 10 items, one of them linked to two assignments | **Real**, same crawl |
| `gradebook_IST471.json` | 6 items, one carrying real instructor **feedback**, statuses `GRADED` and `UNOPENED` | **Real**, same crawl |
| `attempts_synthetic.json` | 4 probed columns: two attempts on one, one attempt with no files, one attempt on the ambiguously-linked column, one failed (403) probe | **Synthetic** — see below |
| `build_load_sql.js` | Generates `db/tests/phase10a_load_fixtures.sql` from the four files above | — |

Between them the gradebook fixtures cover every `column_kind` (`item`, `attendance`, `total`,
`letter`), a score that does not fit `numeric(9,3)` exactly (ECN.304 Attendance, 83.33333), an
instructor override (`displayGrade.isOverride`), a `displayGrade.grade` of `Complete`, unlimited
attempts (`attemptsLeft: -1`), a three-attempt quiz, real feedback, and a column attached to two
assignments. `calc_other` has no real example: every calculated column on this project is the
total.

**These are Stack's own scores.** They are already in the repo's data dictionary and in the
verification notes, and the repo is his. Nothing here is redacted, and nothing here belongs to
anybody else — no other student, no instructor material.

## Why the attempts payload is synthetic

No crawl on record carries an `attempts` key: the probe ships with **crawler version 3** and has
never run against a live Blackboard session, because every crawl needs Stack's MFA (Contract,
Stack's answer 7). The fixture is hand-built in the frozen Contract shape. Its column ids, course
and assignment links are real; the attempts, files, receipts and the `keys` array are invented and
say so in the file's own `_note`.

So `db/tests/phase10a_stage_attempts.sql` proves the stage reads the **frozen shape** correctly.
It does not prove Blackboard's real key names — the `keys` probe settles those after Stack's
acceptance crawl, and the list of keys it has to settle is in the verification note.

## Running the SQL tests

The loader opens a transaction; each test file asserts and rolls back. Concatenate them:

```bash
cat db/tests/phase10a_load_fixtures.sql db/tests/phase10a_stage_gradebook.sql | psql "$DATABASE_URL"
cat db/tests/phase10a_load_fixtures.sql db/tests/phase10a_stage_attempts.sql  | psql "$DATABASE_URL"
```

Or paste each concatenation into one `execute_sql` call through the Supabase MCP, which is how
they were run for the verification note. A pass ends with a single `... : PASS` row; a failure
raises with a message that starts `FAIL`.

Everything loads under the fixture run id `00000000-10a0-4000-8000-000000000001` (and `…0002` for
the second, score-movement crawl), never under a real crawl's, so the suite is safe to run against
prod: it cannot collide with or overwrite anything even if a transaction were left open. It is
also written to pass against a database that already holds the real crawl of the same columns —
every assertion that would otherwise depend on that history is scoped to the fixture run.

## Regenerating the loader

`db/tests/phase10a_load_fixtures.sql` is generated. After editing any fixture:

```bash
node db/fixtures/phase10a/build_load_sql.js
```

`web/test/fixtures.phase10a.test.ts` re-runs the generator in memory and fails if the committed
`.sql` is not what it produces, so the two cannot drift apart unnoticed.

## Refreshing the real payloads

They came out of prod with:

```sql
select jsonb_pretty(jsonb_build_object(
  'run_id', b.run_id, 'kind', b.kind, 'bb_course_id', b.bb_course_id,
  'course_id', bb_resolve_course(b.bb_course_id), 'captured_at', b.captured_at,
  'payload', jsonb_build_object('crawler', jsonb_build_object('version', 3),
                                'course', b.payload->'course',
                                'gradebook', bb_jarray(b.payload->'gradebook'))))
  from bb_raw b
 where b.run_id = 'bf2f81e5-ea4c-4b64-bc43-129fd53d4616' and b.kind = 'course'
   and b.bb_course_id = '_571529_1';
```

The `crawler: { version: 3 }` envelope is added by that query: the 2026-09-14 crawl predates the
versioned envelope, and stages read a missing key as version 2. Everything else is verbatim.
Re-cutting the fixtures against a newer crawl changes the expected counts in the test files, so
update both together.
