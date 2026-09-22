# R-10a research — grades mirror, Grades screens, submissions

Researcher R-10a, 2026-09-14. Inputs: `70_MVP_INDEX.md` §1.1/§1.3/§2, `60_REQUIREMENTS_v2.md`
§3.3 (R-10, R-11, R-17, R-18), `67_PHASE10A_grades.md`, `CLAUDE.md`. Scope: mirror-only screens —
nothing summed, nothing projected (that is 10b).

## 1. Comparables

1. **Canvas student Grades page + What-If** — one row per assignment: name, due, **Status** before
   **Score**, `score / out of`, an icons column for feedback/rubric/comments. Ungraded cells show a
   dash, never 0; a sidebar checkbox **"Calculate based only on graded assignments"** switches
   between *current* and *total*
   ([Penn](https://infocanvas.upenn.edu/students/viewing-grades-feedback/),
   [Pitt](https://teaching.pitt.edu/resources/how-to-use-the-gradebook-to-enter-and-calculate-grades-in-canvas/)).
   [What-If](https://community.instructure.com/en/kb/articles/661309) reuses the score cell as the
   input and marks the result with an arrow glyph.
2. **Google Classroom student work** — a small, closed, colour-coded status vocabulary: *Assigned /
   Turned in / Graded / Returned*, **Missing** in red, turned-in in green
   ([Classroom Help](https://support.google.com/edu/classroom/answer/9157286)). Per item you can see
   **how the grade changed and how many times the student submitted**
   ([gradebook](https://support.google.com/edu/classroom/answer/9199710)).
3. **Blackboard Ultra student grades** — an **Overall Grade pill** on the global Grades page *and*
   the per-course page; selecting it explains the calculation; attempts remaining and late flags sit
   alongside ([Northwood ITLC](https://itlc.northwoodtech.edu/blackboard/coursegrade),
   [attempts + feedback](https://itlc.northwoodtech.edu/blackboard/feedback)). Ultra also issues a
   **submission receipt with a confirmation number** (popup, email, gradebook student tab) —
   Blackboard's own evidence token
   ([Syracuse OLS](https://su-jsm.atlassian.net/wiki/spaces/blackboard01/pages/154389411/)).
4. **Blackboard Learn REST attempts + attempt files** — students may read their own attempt; the
   visible subset is `id, userId, groupAttemptId, status, text, score, groupOverride, feedback,
   studentComments, studentSubmission, exempt, created`
   ([Learn API](https://help.blackboard.com/node/48891),
   [CourseGradesApi](https://github.com/mcharris/blackboard-rest-php/blob/master/docs/Api/CourseGradesApi.md)).
   Files come from `…/gradebook/attempts/{attemptId}/files` then
   `…/files/{attemptFileId}/download` — **metadata list first, per-file download second**.
5. **Moodle + Gradescope, for staging and evidence** — Moodle's two-state model is explicit:
   uploaded-but-unsent is **"Draft (not submitted)"** until *Submit assignment*, then **"Submitted
   for grading"** ([Using Assignment](https://docs.moodle.org/502/en/Using_Assignment)). Gradescope
   keeps one **active submission** and emails a timestamped receipt, but keeps **no revision
   history** for written work
   ([Guides](https://guides.gradescope.com/hc/en-us/articles/21589761635341)).

## 2. Patterns to copy

**Row anatomy** (one row = one gradebook column, Canvas order): item name → status pill → `score /
possible` → "seen <date>" → feedback disclosure. Ungraded renders `—`, not 0. Pill text is
Blackboard's `submissionStatus` / attempt `status` verbatim, with Classroom's colour semantics
(missing = alert, submitted = positive, graded = neutral). Feedback collapses to two lines with an
expander — instructor prose, never silently truncated.

**Header.** Blackboard's total as a pill labelled **"Blackboard's number, as of <seen_at>"** —
Ultra's own affordance, minus the "how it's calculated" popover we cannot honestly fill.

**Three distinct empty states**, never collapsed: (a) no `isCalc` total → "Blackboard publishes no
total"; (b) item ungraded → `—` + "not graded yet"; (c) gradebook never crawled → "not synced yet"
+ last run time. Canvas's graded-only checkbox exists *because* (a)/(b) get confused; we dodge it
by not computing.

**Evidence display.** Per attempt: status, `created`, submitted timestamp, "Attempt N of M"
(`attemptsAllowed`), then file rows with filename, size, short sha256, signed-URL download. Show
Blackboard's confirmation number if the payload carries it — the receipt Stack can cite.

**Upload staging.** Copy Moodle's wording discipline: a dropped file is **staged**, never
submitted — "Staged in bb2dash — attach in Blackboard ↗". Once R-17 pulls the attempt, compare
sha256 and show *matches / differs / no submitted copy yet* (R-18).

## 3. Anti-patterns

* **A computed total presented as official.** 10a sums nothing. Any number without a "Blackboard's,
  as of" label is a bug.
* **Ungraded treated as zero** (Canvas's unchecked box) — the single largest source of student grade
  confusion. Never default to it.
* **A bare number with no "as of".** A mirror is always stale; an undated figure reads as live.
* **Delta/"grade changed" badging.** The mirror appends per run, but history UI is 10b; showing a
  change in 10a implies a diff we have not validated.
* **Attendance and non-total calculated columns in the item list** — they double-count visually
  (R-10 already flags attendance; extend the exclusion to `isCalc` non-totals).
* **Gradescope's no-revision-history** — do not copy. Our per-run append with `seen_at` is the
  advantage.
* **Any button reading "Submit".** The app never submits to Blackboard.

## 4. Standard operating procedure

Grade-mirroring is an ETL correctness problem, and the sector tests it in four layers:

1. **Fixture payloads.** Commit a redacted real `bb_raw` gradebook + attempts payload per course
   and run the stages against them. Canvas does exactly this for its own submission serializer
   ([`spec/lib/api/v1/submission_spec.rb`](https://github.com/instructure/canvas-lms/blob/master/spec/lib/api/v1/submission_spec.rb)).
2. **Snapshot / idempotency.** Run the stage twice on one fixture; output must be byte-identical —
   the standard pipeline snapshot check
   ([dbt](https://www.getdbt.com/blog/data-quality-checks)).
3. **Reconciliation against source.** Row-count, aggregate and per-key checksum comparison between
   source and mirror is the canonical ETL recon frame
   ([soda.io](https://soda.io/blog/data-integrity-testing),
   [iceDQ](https://icedq.com/data-reconciliation-tool)). Here: column count in `bb_raw` ==
   `v_gradebook_latest`; per-column `effectiveScore` equal; total matches Blackboard's displayed
   total.
4. **Conformance-style sign-off.** 1EdTech certifies OneRoster Gradebook implementations by running
   a fixed mandatory suite and filing the results
   ([conformance testing](https://www.1edtech.org/standards/oneroster/conformance-testing)). Lift
   the shape: a fixed SQL assertion set, run per phase, output pasted into the PR.

## 5. Proposed DoD checklist

- [ ] Fixture `bb_raw` gradebook + attempts payloads committed for ≥ 3 courses; `stage_gradebook`
      and `stage_attempts` tests run green against them.
- [ ] Idempotency: re-running each stage on the same `run_id` adds zero rows (SQL assertion in PR).
- [ ] Reconciliation SQL in the PR: per course, gradebook column count in `bb_raw` == count in
      `v_gradebook_latest`, and every `effectiveScore` matches its source.
- [ ] Every course with an `isCalc` total shows it on `/grades` labelled "Blackboard's number, as of
      <seen_at>"; screenshot.
- [ ] Every course without one shows exactly "Blackboard publishes no total" — no 0, no dash, no
      computed fallback; screenshot.
- [ ] Ungraded items render `—`, never 0; renderer test for a `null` score.
- [ ] Attendance and non-total `isCalc` columns excluded from item rows; SQL count assertion.
- [ ] Per-item row shows score, possible, `seen_at`, feedback, submission status; one real row
      demoed on the preview side by side with the same row in Blackboard.
- [ ] Feedback renders in full when expanded and is HTML-escaped; fixture test with markup.
- [ ] Popout shows submitted/not-submitted + timestamp + attempt N of M and lists pulled-back
      file(s) with a working signed-URL download; demoed on one real assignment.
- [ ] Pulled-back files land under `my_submissions` with a `bb_files` row carrying `assignment_id`
      and appear in Materials; SQL + screenshot.
- [ ] Drop zone produces a Storage object + `bb_files` row (`classified_by='stack'`,
      `bucket='my_submissions'`) visible in Materials within one refresh; demoed live.
- [ ] Staged file labelled "Staged — attach in Blackboard ↗"; no control reads "Submit" (grep
      assertion over `web/src`).
- [ ] sha256 comparison renders one of matches / differs / no submitted copy yet; unit test on all
      three branches.
- [ ] RLS owner-only insert on `my_submissions`; `/security-review` clean; no service key in the
      client bundle (grep assertion).
- [ ] No number on any 10a screen is computed by bb2dash — confirmed in `/code-review`.

## 6. Open questions for Stack

1. **Confirmation number.** If Blackboard's receipt/confirmation number is present in the attempts
   payload, show it on the row? It is the only token that matches what he'd quote to a professor.
2. **Global `/grades` ordering.** By course (Ultra's shape) or one flat list newest-graded-first
   (better for "what changed since last sync")?
3. **Feedback with no score.** Instructors sometimes return comments before a score. Does that row
   read "returned, ungraded" or stay "submitted"?
4. **Staged-file lifecycle.** Once R-17 pulls a matching submitted copy, does the staged file stay
   visible in Materials, get marked superseded, or disappear?
