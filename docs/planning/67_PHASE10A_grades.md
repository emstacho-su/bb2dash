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

_Pending research (R-10a report) — filled in PR #11._

## Task loops

_Pending research (R-10a report) — filled in PR #11._

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
