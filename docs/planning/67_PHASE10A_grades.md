# Phase 10a — Grades: gradebook mirror, Grades screens, submissions

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirements: R-10, R-11 (a)+(d),
R-17, R-18 from `60_REQUIREMENTS_v2.md`. Phase branch `feat/grades-10a`, one PR. Runs **in
parallel with Phase 11, V-1 and V-2**. **Migration range 041–059** (Phase 11 owns 060–069).

**Base.** Cut from `main` after Phase 9 (PR #10) merges: 10a needs Phase 8's assignment popout
and Phase 9's automated transform (`stage_*` driver, `sync_stage_runs`, `agent_requests`).

## Why

Blackboard holds Stack's scores, feedback and submission records; bb2dash shows none of them.
Grades are the one thing he checks in Blackboard that the hub cannot yet answer. 10a mirrors the
gradebook honestly (Blackboard's numbers, labelled as Blackboard's), shows every item's score and
feedback, proves what was submitted, and lets him stage a file on an assignment before he submits
it in Blackboard. The computed standing and what-if wait for 10b.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.3)

* Surfaces: **global Grades page + per-course Grades tab**, latest score per item (score,
  possible, date seen, feedback, submission status); Blackboard's total where it publishes one.
  No score-change history in the UI (the mirror still appends per run; 10b surfaces history).
* Submissions: **status + timestamp + the submitted files** pulled back via the attempts
  endpoint into Storage under `my_submissions`, visible in the popout and Materials.
* Upload: **web-only drop zone** on the popout and the Classwork row → Storage + `bb_files` row
  (`classified_by = 'stack'`, `bucket = 'my_submissions'`, `assignment_id` set) → Materials.
  Local mirroring follows Phase 12's post-MVP task.
* A course with no Blackboard calculated total shows **"Blackboard publishes no total"**; what
  to do instead is decided in V-1's questions step, not here.
* Definition of done = SOP gates **+ Stack's acceptance script** on the Vercel preview.
* Every task carries an **executable check**; no task without one.

## MVP (in Stack's words)

Open `/grades` and see, per course, Blackboard's total as of the last sync (or the explicit
"no total" state) and every gradebook item with its score, possible points, when we saw it,
the instructor's feedback, and whether it was submitted and when. Open an assignment popout and
see the same for that item plus the file(s) actually submitted, downloadable. Drop a file on an
assignment and find it in Materials under that course's `my_submissions`, ready to attach in
Blackboard.

## Contract — to be frozen by the phase PM session before workers spawn

The PM session completes this section (routes, table/view DDL, RPC signatures, request/response
shapes, file names), puts open questions to Stack, and waits for answers. It must specify:

* `bb_gradebook` (append-per-run history keyed by `run_id`, `column_id`; columns read from
  `effectiveScore` / `displayGrade.score` / `feedback` / `lastAttempt` / `submissionStatus`;
  attendance columns flagged; `isCalc` totals identified) and views `v_gradebook_latest`,
  `v_assignment_grade`, `v_course_grade` (R-10). Migration numbers from 041.
* `bb_attempts` (attempt id, status, created, submitted, score, feedback, file refs) and the
  Storage path convention for pulled-back files (R-17); the crawler's new endpoint and the
  widened `slim()` keep-list (`dueDate`, `points`, `gradebookColumnId`, `attemptsAllowed`).
* `stage_gradebook` and `stage_attempts` as Phase 9-style transform stages, idempotent on
  `run_id`, writing `sync_stage_runs`.
* Routes `/grades` and `/course/[id]/grades` (replacing Phase 8's placeholder pane); the
  popout's submission block; the upload drop zone's client → Storage → `bb_files` path and its
  RLS (owner-only insert on `my_submissions`).
* `queries.grades.ts` shapes; `database.types.ts` regeneration.
* Honesty rules: every number on screen is Blackboard's and says so with its `seen_at`; nothing
  is summed or projected in 10a.

## Seams (frozen)

* **V-1** owns `grading_schemes` / `grade_components` data; 10a reads, never writes them.
* **Phase 11** owns `announcements` read state, the planner and calendar tables (060–069); 10a
  does not touch them. Both phases edit `web/src/app/(app)/` in different routes; the popout
  component is 10a's to extend (11 only links to it).
* **Phase 9** owns the transform driver; 10a adds stages to it under the driver's contract.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.3) + research `research/72_RESEARCH_phase10a_grades.md` §5.

- [ ] **Stack's acceptance script (on the preview):** (1) open `/grades` and see every course,
      each with Blackboard's total "as of <seen_at>" or exactly "Blackboard publishes no total";
      (2) open one course tab and compare one real item row (score, possible, seen_at, feedback,
      submission status) side by side with the same row in Blackboard; (3) open that item's
      popout, see submitted/not-submitted with the timestamp and attempt N of M, and download
      the pulled-back file; (4) drop a file on an assignment, find it in Materials under
      `my_submissions` labelled "Staged — attach in Blackboard ↗"; (5) confirm no number
      anywhere on these screens was computed by bb2dash. All five ticked.
- [ ] Fixture `bb_raw` gradebook + attempts payloads committed for ≥ 3 courses;
      `stage_gradebook` and `stage_attempts` tests green against them.
- [ ] Idempotency: re-running each stage on the same `run_id` adds zero rows (SQL assertion).
- [ ] Reconciliation SQL in the verification note: per course, gradebook column count in
      `bb_raw` == count in `v_gradebook_latest`, and every `effectiveScore` matches its source.
- [ ] Three distinct empty states, each with a renderer test: no published total / item
      ungraded (`—`, never 0) / never synced.
- [ ] Attendance and non-total `isCalc` columns excluded from item rows; SQL count assertion.
- [ ] Feedback renders in full when expanded and is HTML-escaped; fixture test with markup.
- [ ] Attempt files use the two-call pattern (attempt files metadata → per-file download);
      pulled-back files land under `my_submissions` with a `bb_files` row carrying
      `assignment_id` and `classified_by = 'blackboard'`; SQL + screenshot.
- [ ] Drop zone produces a Storage object + `bb_files` row (`classified_by = 'stack'`,
      `bucket = 'my_submissions'`) visible in Materials within one refresh.
- [ ] No control anywhere reads "Submit" (grep assertion over `web/src`); the staged-file label
      is the only call to action.
- [ ] sha256 comparison renders one of matches / differs / no submitted copy yet; unit test on
      all three branches.
- [ ] RLS: owner-only insert on `my_submissions` paths; anon sees 0 rows of `bb_gradebook` /
      `bb_attempts`; no service key in the client bundle (grep assertion).
- [ ] Crawler: attempts endpoint added, `slim()` keeps `dueDate`, `points`,
      `gradebookColumnId`, `attemptsAllowed`; `bb_raw` envelope version bumped; a real crawl
      lands both payloads (verification note).
- [ ] SOP gates: typecheck/build/test green in `web/` and `mcp-server/`; `/code-review main
      high` HIGH cleared; `/security-review`; STATUS + DECISIONS + ORCHESTRATOR updated; Vercel
      preview posted.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Freeze the Contract section; put open questions to Stack | Stack's answers recorded in the brief | — | PM session |
| 2 | Crawler: attempts endpoint + widened `slim()` + envelope version | real crawl → `bb_raw` holds gradebook + attempts payloads | — | W-17 |
| 3 | Fixtures: ≥ 3 courses' gradebook + attempts payloads | files committed; loader test parses them | — | W-17 |
| 4 | `bb_gradebook` (041) + `stage_gradebook` | stage test green on fixtures; idempotency SQL = 0 new rows | — | W-17 |
| 5 | Views `v_gradebook_latest`, `v_assignment_grade`, `v_course_grade` (042) | reconciliation SQL: counts and `effectiveScore` match `bb_raw` | — | W-17 |
| 6 | `bb_attempts` (043) + `stage_attempts` + file pull-back into Storage | stage test; SQL: `bb_files` rows with `assignment_id`; a signed URL downloads | — | W-17 |
| 7 | Register both stages with the Phase 9 driver | `sync_stage_runs` rows appear after a run | — | W-17 |
| 8 | `queries.grades.ts` + regenerated types | typecheck; query tests with fixtures | — | W-18 |
| 9 | `/grades` global page | RTL tests: total-with-date, no-total, never-synced states | "every course, Blackboard's number or the honest empty state" | W-18 |
| 10 | `/course/[id]/grades` tab (replaces the placeholder) | RTL tests: item rows, `—` for null, feedback expand + escaping | "one row matches Blackboard side by side" | W-18 |
| 11 | Popout submission block | RTL tests: status/timestamp/attempt N of M, file list, sha256 three branches | "I download what I actually submitted" | W-18 |
| 12 | Upload drop zone + RLS | RTL test; SQL: owner-only insert; Materials shows the row | "I stage a file and see it in Materials" | W-18 |
| 13 | "No Submit control" + "no computed numbers" audits | grep assertions in tests | — | PM session |
| 14 | Live smoke on prod | curl/SQL: a real gradebook row visible on `/grades` with its `seen_at` | — | PM session |
| 15 | Gates + docs + preview | SOP list | — | PM session |
| 16 | **Stack's acceptance script** | — | the five steps above | Stack |

Open questions from the research, for Stack (also in `70_MVP_INDEX.md` §5): show Blackboard's
submission confirmation number on the row if the attempts payload carries it; global `/grades`
ordered by course or as one flat newest-graded-first list; a row with feedback but no score reads
"returned, ungraded" or stays "submitted"; once R-17 pulls a matching submitted copy, does the
staged file stay, get marked superseded, or disappear.

## Out of scope

Computed standing, what-if, score history UI (10b); the local file mirror (Phase 12); any
change to grading rules (V-1); Home course cards showing grades (never, per Stack).

## Workers (proposed; the PM session confirms)

* **W-17 database + ingest** (`feat/grades-10a-db`, worktree `bb2dash-wt-g-db`): migrations
  041+, crawler attempts endpoint, transform stages, verification note.
* **W-18 web** (`feat/grades-10a-web`, worktree `bb2dash-wt-g-web`): Grades page, course tab,
  popout submission block, upload drop zone, `queries.grades.ts`, tests.

## Integration (PM)

Merge worker branches; regenerate types; `npm ci` if deps changed; typecheck + build + tests in
`web/` and `mcp-server/`; live smoke on prod (a real gradebook row appears on `/grades` with its
`seen_at`); `/code-review main high` + `/security-review`; STATUS, DECISIONS, ORCHESTRATOR
updated; Vercel preview; Stack's acceptance script; stop at the PR.
