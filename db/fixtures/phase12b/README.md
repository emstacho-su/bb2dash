# Phase 12b fixtures — the attempts chain (G-7a / P-grades-4, P-grades-5)

Two `bb_raw` course payloads, both **synthetic**, for `db/tests/phase12b_085_stage_attempts_v4.sql`.

| file | crawler | what it is |
|---|---|---|
| `attempts_v4.json` | 4 | the chain of `docs/planning/80f_ATTEMPTS_ENDPOINT.md`, four columns |
| `attempts_v3_empty.json` | 3 | what v3 really produced: every column `200` with `results: []` |

**No real value appears in either file.** The Blackboard shell and column ids are real (the fixture
has to resolve to a course and to Stack's assignments), but every attempt id, grade id, receipt,
file name, `bbFileUuid`, `xid-…` URL and sentence is invented. Nothing Stack wrote or was sent is
here — that is the whole reason the PM's discovery session deleted the captured bodies the same
sitting.

## What `attempts_v4.json` covers

| column | what it exercises |
|---|---|
| `_3560530_1` | the happy path: a grade row, two attempts, three files across them, real mime types, durable `bbcswebdav/xid-…` URLs. Bound to exactly one assignment, so `bb_files.assignment_id` resolves. |
| `_3569973_1` | the column **two** assignments share (`fp-proposal` / `fp-log-final`): one attempt, one file, `assignment_id` must stay null rather than be filed under the wrong one. |
| `_3598132_1` | step 3 answers `500`: the submission is still recorded from the step-2 list row, without files, and `entry.status` keeps the failure. |
| `_3560541_1` | step 1 answers `403`: the chain stops, `results` is empty, and the crawl carries on. |

It also carries the two keys the drift guard uses and the database never sees:

* `_rawResponses` — the invented Blackboard responses the payload was generated from.
* `_gradebookProbed` — the gradebook rows handed to `shouldProbeColumn`, including a calculated
  column and an `UNOPENED` one that must produce no chain at all.

`web/test/fixtures.phase12b.test.ts` re-derives `payload.attempts` from `_rawResponses` through the
real crawler mappers, so the fixture cannot drift from `ingest/bb_crawler.js`.

## Regenerating the loader

```
node db/fixtures/phase12b/build_load_sql.js
```

writes `db/tests/phase12b_load_fixture.sql`. The same vitest file fails if the committed copy is
not what the generator produces today.

## One thing the fixture deliberately does not carry

Step 1's grade row has `instructorFeedback`, and the crawler does **not** copy it onto the attempt.
A professor's feedback already reaches `bb_gradebook.feedback` from the course-wide gradebook call
(migration 046), and the Grades screen reads it there. A second copy on the attempt would be the
same text in two tables with two different caps.
