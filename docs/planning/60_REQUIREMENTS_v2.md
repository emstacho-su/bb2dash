# Requirements v2 — post-Phase 7 scope

Date: 2026-09-10. Author: PM session (Fable), from Stack's direction of the same day. Status:
**DRAFT — awaiting Stack's answers to §6 before any phase brief is written.**

This document supersedes the four scattered requirement sources for everything after Phase 7
(retrieval polish): the GUI README task list T-01–T-17, D1's ranked feature list
(`20_D1_gui_direction.md` §2), the unbuilt phases of the Sep 8 plan (`30_PHASED_PLAN.md`
Phases 0/2/4/5/6/7), and the STATUS backlog. Where those disagree with this file, this file wins.
Reversals of items the Sep 8 plan declined (§11 there) are listed in §5 and must each get a
DECISIONS row when a phase adopts them.

## 1. Stack's direction (verbatim intent, 2026-09-10)

1. **Original plan: complete all of it.** Every unbuilt item from Phases 0, 2, 4, 5, 6, 7 of the
   Sep 8 plan is in scope, re-homed onto the Vercel + Supabase stack (no Docker).
2. **Grades (orig Phase 5), expanded.** Grades read out of posted scores *and* the grading
   methodology from class content, to assess standing. The displayed grade mirrors Blackboard,
   because Blackboard is where graded assignments are pulled from. Needs logic that tracks each
   assignment: when it was submitted and with what. Plus a feature to **upload the materials for
   an assignment** so the file is linked to that assignment and organized both locally and in
   Materials, ready to attach when submitting.
3. **Electron (orig Phase 6), narrowed.** Electron hosts the dashboard itself. Opening a material
   stays a web action (signed URL in the browser), not a native file open from the OneDrive mirror.
4. **GUI: the by-course dimension is missing.** A course should have its own page structured the
   way Blackboard (or Google Classroom) structures a class, not only the week-rail timeline.
5. **GUI: scrollable and interactive elements** from the artboards must work and must have been
   retained. Audit below (§2).

## 2. GUI audit — artboards vs. built screens (2026-09-10)

Read `web/src/app/(app)/Today.tsx`, `course/[id]/CourseScreen.tsx`, `CourseSubBar.tsx`,
`components/shell/TopNav.tsx`, `materials/MaterialsBrowser.tsx` against `13-home-v2`,
`14-course-v2`, `00-mvp-plan` and the README decisions.

| Artboard feature | Built? | Note |
|---|---|---|
| Tracker: 14 day columns, bar = Σ effort, Monday rule, month label, click-to-detail | yes | Today.tsx |
| Tracker: `◂ ▸` paging across 8 weeks, hidden scrollbar | **partial** | Container is `overflow-x: auto` with the scrollbar hidden, but only 14 days are fetched and there are no `◂ ▸` controls. This was a *recorded* cut (reconciliation: "14-day tracker window, not 56"). Reinstating it is a §3 item. |
| ☰ Courses pop-down → course page | yes | TopNav.tsx |
| Bell with unread badge → dropdown → See all | **no** | Disabled placeholder. Recorded cut ("no bell/announcements this term"). |
| Needs attention: collapsed typed counts + last sync, click to expand | **reduced** | Only the last-sync line ships. Recorded cut; the full row needs `attention_items`. |
| Course cards 2-up: code/title, meeting line, typed next-due counts, Open, M–F strip | yes | Grade line removed by rule. The **one-line note** slot from decision 3c is not rendered. |
| Undated tray, status quick-edit (T-06) | yes | |
| Planner day view (T-17) / week grid (T-01) | **no** | Stub route. |
| Course sub-bar: Stream · Grades · Materials · Info + meeting/room + Blackboard link | **partial** | Tabs render but are inert; only Stream (the timeline) exists. |
| Course page **per-course "Upcoming work" tracker** (8 weeks, `◂ ▸`) | **no** | The artboard has it at the top of 14-course-v2; CourseScreen has no tracker at all. Not a recorded cut — **dropped**. |
| Week rail 1–16, Current / Show weeks 1–16, ring = graded, click past week → all mode | yes | |
| Lecture lane / assignment lane by week, session panel on click | yes | Session rows show "no files" on most sessions because `bb_files.session_id` is populated on 2 of 64; D1 said to hide the count until linking exists. Cosmetic fix. |
| "3 attempts", "moved to 9/9" meta on assignment rows | no | Recorded cuts (data does not exist). |
| Lecture popout (03) / assignment popout (04) | **no** | Still v1 left-rail artboards; never ported. Assignment popout was orig Phase 4 item 4.9. |
| Materials library (T-02): course → Blackboard folder path → files | **partial** | Built as course → `file_bucket` sections (ten-value enum), not the Blackboard folder tree. `bb_content.path` gives the tree for free but is unused. |
| ⌘K search (T-12) | yes | Phase 7 improves it. |

Net: two genuine drops (per-course tracker, course-card note), one structural gap (Blackboard
folder tree in Materials), one unfinished sub-bar, and a set of recorded cuts that §3 now
un-cuts. Nothing built contradicts the spec.

## 3. Requirements

Numbered R-xx so phase briefs can cite them. Effort tags as in D1: S ≤ 1 day, M a few days or a
new view, L a new ingest path / table / engine.

### 3.1 Course dimension (Stack item 4, audit gaps)

* **R-01 Per-course page with Blackboard-shaped structure.** The existing sub-bar tabs become
  real: **Stream** = the current week-rail timeline (keep). **Materials** = the course's
  Blackboard content tree from `bb_content.path`, each folder listing its linked `bb_files`
  (join `bb_files.content_id = bb_content.bb_item_id`), Ultra progress marker from
  `bb_content.state`, and the file Open ladder already built. **Grades** = per-course view of
  R-10. **Info** = T-05: staff + office hours (`course_staff`), meeting patterns, late/AI policy,
  letter scale, syllabus file, group memberships (`courses.group_notes` verbatim until the
  IST.466 contradiction is resolved). Effort M (Materials, Info) + wiring.
  Data preconditions: `bb_content` is stale (last refreshed 9/2) and 11 rows are titled
  `ultraDocumentBody`; the content transform must re-run and fall back to the parent path segment
  for titles (R2 punch list 2) before this ships.
* **R-02 Per-course upcoming-work tracker** at the top of the course page: same component as
  Home, filtered to that course, 14 visible, scrollable/pageable across 8 weeks. Effort S once
  R-03 exists.
* **R-03 Tracker paging.** Home and course trackers gain `◂ ▸` paging across an 8-week horizon
  (56 days fetched, 14 visible, scrollbar hidden). Reverses the 14-day-window cut. Effort S.
* **R-04 Course-card note line** (decision 3c). One line from a new nullable
  `courses.card_note text` (Stack-edited). Effort S.
* **R-05 Assignment popout and lecture popout** ported to the top-nav layout (orig 4.9 content:
  description, component sub-line, series strip, late policy, full planner block, AI policy,
  and, once R-10 exists, score/feedback/submission disagreement). Effort M.
* **R-06 Global Materials gains the Blackboard folder tree** as a second grouping alongside the
  bucket view (T-02 as specced). Effort S once R-01's tree exists.

### 3.2 Sync loop and trust (orig Phases 0, 2, 4)

* **R-07 Automated transform.** `bb_raw` → typed tables within minutes of a crawl, no human
  step. Replaces the Docker hub with `pg_cron` + `pg_net` (or a Supabase Edge scheduled
  function) invoking the transform stages: courses, content, assignments, files, gradebook,
  announcements. Each stage idempotent on `run_id`, writing `sync_stage_runs`. Retires
  `CADENCE_RUNBOOK.md` step 3. Effort L. Highest-value backend item; prerequisite for R-10.
* **R-08 Crawl status honesty.** Crawler / session opens a `running` `sync_runs` row before the
  first fetch; stuck runs > 30 min read as interrupted; partial runs read as partial. Freshness
  per data class from `v_data_freshness` (exists, migration 019). Effort S–M.
* **R-09 Attention inbox.** `attention_items` table (kinds: conflict, missing,
  stack_must_confirm, deadline, data_gap; unique key so re-runs are safe) seeded by the transform
  and by `course_maps` gaps; Inbox screen grouped by kind with resolve action; the Home
  needs-attention row becomes the collapsed typed-count row from the artboard. Effort M.
* **R-13 Agent requests.** `agent_requests` table with three states; "Run transform" and
  "Refresh from Blackboard" controls (clipboard copy of `claude "/bb-sync <id>"`). Effort S–M.
* **R-14 AI-policy gate.** `courses.ai_assist_allowed` set from syllabus text; every skill and
  the MCP server refuse summarization/drafting for a course where it is false, quoting the
  policy. Display already ships. Effort S + M.
* **R-15 Recurring crawl cadence** documented and, where Duo allows, scheduled; iCal feed URL
  captured and polled by a `pg_cron` job that logs skipped while blank. Effort S.
* **R-16 Data gaps** (STATUS backlog 4): IST.323 Security-in-the-News group/date, IST.466
  Group #3 slots, OCR for the two image-only files, `bb_files.week_no`/`session_id`
  classification pass (un-declines the Sep 8 plan's "not this term"). Effort M.

### 3.3 Grades and submissions (Stack item 2, orig Phase 5)

* **R-10 Gradebook mirror.** `bb_gradebook` append-per-run history from `bb_raw` gradebook
  payloads reading `effectiveScore` / `displayGrade.score` / `feedback` / `lastAttempt` /
  `submissionStatus` (never `score`, null on all columns). Attendance columns flagged
  `is_attendance` and excluded from headlines. Views `v_gradebook_latest`, `v_assignment_grade`,
  `v_course_grade`. Blackboard's own `Total Score` column is the mirrored course grade where
  `isCalc` is true. Effort M. Precondition: R-07 (the transform runs it).
* **R-11 Grades screens.** Global Grades page (per course: mirrored Blackboard total, "graded N
  of M", per-item rows with score, possible, seen-at date, feedback) and the per-course Grades
  tab (R-01). Every figure labelled "Blackboard's number, as of <date>". IST.471's qualitative
  model shows an explicit not-computable state. Effort M.
* **R-12 Methodology-based assessment.** A *labelled model* (never "your grade") that applies
  each course's `grading_schemes` / `grade_components` rules to the mirrored scores: the six
  aggregation behaviours (`manual`, `single`, `sum`, `average_drop_lowest`, `rank_weighted`,
  `normalized`), declining gracefully on `manual` components and on IST.471. Shown beside the
  Blackboard mirror with the delta explained. Later: what-if entry (T-07, D1 rank 14). Effort L.
  This reverses the Sep 8 plan's "no grade engine this term"; ship it after R-10 has real data.
* **R-17 Submission tracking.** Per assignment: submitted-at, attempt count, attempt files,
  per-attempt feedback and rubric result. `lastAttempt` gives only `{status, created, submitted,
  score}`; the full record needs the **attempts endpoint**
  (`/learn/api/v1/courses/{C}/gradebook/columns/{colId}/attempts?userId={U}`), which the Sep 8
  plan froze out ("no new Blackboard endpoints this term"). Also widen `slim()`'s keep list so
  `dueDate`, `points`, `gradebookColumnId`, `attemptsAllowed` survive into `bb_content.detail`.
  New table `bb_attempts`. Effort L (new ingest path). Precondition for the "with what" half of
  Stack's ask.
* **R-18 Assignment upload / attach.** From the assignment popout (R-05): upload one or more
  files → Storage bucket `bb-files` under `my_submissions` (a `file_bucket` value with zero rows
  today) → `bb_files` row with `assignment_id` set, `classified_by = 'stack'` → mirrored to the
  OneDrive `course context/` tree under the course's submissions folder by the existing local
  mirror runbook → visible in Materials (global and per-course) and in the popout. The app does
  **not** submit to Blackboard (no write API, Duo); it stages the file and shows an "attach in
  Blackboard ↗" link; the next crawl's `lastAttempt` / R-17 attempt file confirms the submission
  and the popout shows the match. Effort M (upload + link) + S (mirror).

### 3.4 Remaining GUI (orig Phase 4 slack, T-list)

* **R-19 Planner.** One screen with a day tab (T-17: meetings + sessions + rooms + files) and a
  week tab (T-01 grid). Work-windows lane appears only once `planned_start` has data. Effort M.
* **R-20 Announcements.** Bell with unread badge → dropdown → Announcements screen (T-03);
  `announcements.read_at`, crawler captures the creator. Effort S–M.
* **R-21 Styling pass.** Replace the Nocturne placeholder skin with signed-off colors and type,
  CSS custom properties only. Effort M. Needs Stack's direction first.
* **R-22 Small D1 items.** Office-hours panel (rank 11, in R-01 Info), content progress and
  provenance hover in Materials (rank 12, in R-01), attendance-matters badge scoped to IST.466
  (rank 13), group/team panel once the IST.466 contradiction is resolved (rank 8), this-week's
  slides digest gated on R-14 and R-16's linking pass (rank 10). Effort S each.

### 3.5 Shell and beyond (orig Phases 6, 7)

* **R-23 Electron shell for the dashboard.** Window, single instance, `contextBridge`, session
  persisted via `safeStorage` instead of `localStorage`, loads the Vercel app (or a local
  build). Opening a material calls `shell.openExternal` on the signed URL, per Stack: **no**
  `shell.openPath` from the OneDrive mirror, **no** download interception, **no** embedded
  Blackboard webview. Terminal spawn for `claude "/bb-sync"` optional. Unpacked build + shortcut,
  no installer. Effort M. The Sep 8 justification test is waived by Stack's direction.
* **R-24 Professional-side stub.** Two-page memo naming integration points and the `domain`
  column blast radius (orig §10a); IST.471 as first tenant. No schema. Effort S.

## 4. Proposed phase split (for Stack to approve or reorder)

Ordered by dependency, then by term value. One PR per phase, per SOP.

| Phase | Name | Requirements | Why this order |
|---|---|---|---|
| 8 | Sync loop | R-07, R-08, R-09, R-13, R-14, R-15 | Automated transform is the prerequisite for every grade feature and for a trustworthy Inbox. Highest compounding return. |
| 9 | Course dimension | R-01, R-02, R-03, R-04, R-05, R-06 | Stack's stated GUI gap; needs only existing data plus the content re-transform from Phase 8. |
| 10 | Grades and submissions | R-10, R-11, R-17, R-18, then R-12 | Needs Phase 8's transform and Phase 9's popout. R-12 lands last, after real October scores exist. |
| 11 | Planner, announcements, polish | R-19, R-20, R-16, R-22, R-21 | Independent of grades; can run in parallel with Phase 10 on a second worker if Stack wants. |
| 12 | Electron shell | R-23 | After the web app is stable; no renderer changes allowed. |
| 13 | Professional stub | R-24 | Memo only, after the term. |

Term calendar reminder from the Sep 8 plan: weeks 9 and 11 (Oct 19–25, Nov 2–8) are exam-heavy,
week 14 is Thanksgiving, and Nov 30–Dec 13 was a code freeze by design. Phases 8–10 are the ones
that pay off inside the term; 11–13 can slip past Dec 15 without loss.

## 5. Reversals of Sep 8 plan §11 declines (each needs a DECISIONS row when adopted)

| Declined item | Reversed by | Condition |
|---|---|---|
| Grade engine with rank-weighted/normalized aggregation this term | R-12 | Only after R-10 holds > 10 non-attendance scores; always labelled as a model |
| No new Blackboard endpoints this term | R-17 (attempts endpoint), R-20 (creator field) | Crawler change reviewed; `bb_raw` envelope versioned |
| 14-day tracker window, not 56 | R-03 | Fetch 56, show 14 |
| No bell / announcements this term | R-20 | — |
| No `bb_files.week_no` / `session_id` classification pass | R-16 | Offline, no Blackboard access needed |
| Electron only if the justification test passes | R-23 | Stack waived the test; scope narrowed to the shell |
| No Planner day/week view | R-19 | Work-windows lane still gated on data |

Still declined, unchanged: in-app chat assistant; agent write path into `assignment_progress` /
`reading_progress`; scheduled crawls as a Claude task (Duo); service-role key anywhere client-side;
exposing the stack beyond the single owner; installer / code signing / auto-update.

## 6. Open questions for Stack (answer before Phase 8's brief)

1. **Course dimension shape.** R-01 reads "structured like Blackboard" as four real tabs with a
   Blackboard folder tree under Materials. Is that the intent, or do you want the course page's
   *default* view to be the folder tree rather than the week timeline?
2. **Submissions: crawler widening.** R-17 needs the attempts endpoint added to the crawler
   (one more fetch per gradebook column). OK to widen the crawl surface for it?
3. **Upload semantics.** R-18 stages and links the file; you still attach it in Blackboard. Is
   that acceptable, or did you want the app to attempt the Blackboard submission itself? (Not
   feasible without a write API and Duo; the answer changes nothing else.)
4. **Local mirror for uploads.** Under `course context/<course>/` which folder name for
   submissions? Default proposal: `my_submissions/` matching the bucket enum.
5. **Phase order.** Sync loop first (§4) delays the visible course-dimension work by one phase.
   Accept, or run Phases 8 and 9 in parallel on two workers?
6. **Styling direction** for R-21: keep Nocturne dark as the base, or start from a new palette?

## 7. Where things go from here

* Answers to §6 land as edits to this file, then one DECISIONS row per reversal.
* Each phase gets `docs/planning/5N_PHASE<N>_<name>.md` with a frozen contract citing R-numbers,
  following the Phase 7 brief's shape.
* STATUS "Slotted for the future" is replaced by a pointer to §4 of this file.
