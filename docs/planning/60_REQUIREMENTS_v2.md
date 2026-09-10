# Requirements v2 — post-Phase 7 scope

Date: 2026-09-10. Author: PM session (Fable), from Stack's direction of the same day and his
answers to five rounds of clarifying questions (§6). Status: **DIRECTION CONFIRMED** — phase
briefs may cite R-numbers from this file. Residual assumptions are listed in §6.2.

This document supersedes the four scattered requirement sources for everything after Phase 7
(retrieval polish): the GUI README task list T-01–T-17, D1's ranked feature list
(`20_D1_gui_direction.md` §2), the unbuilt phases of the Sep 8 plan (`30_PHASED_PLAN.md`
Phases 0/2/4/5/6/7), and the STATUS backlog. Where those disagree with this file, this file wins.
Reversals of items the Sep 8 plan declined (§11 there) are listed in §5 and must each get a
DECISIONS row when a phase adopts them.

## 1. Stack's direction (2026-09-10)

1. **Original plan: complete all of it**, re-homed onto Vercel + Supabase (no Docker), except
   the professional-side stub, which is **dropped** (§6).
2. **Grades, expanded.** Three surfaces per course: Blackboard's own total mirrored; our
   computed standing from the syllabus grading rules, labelled as a model; and what-if
   projection. Per-item rows with score, date seen, feedback. Visible on a global Grades page
   and a per-course Grades tab; **not** on Home course cards and not in the popout (Stack's
   choice; the popout may link to the tab).
3. **Submissions.** Per assignment: a reliable submitted / not-submitted status with timestamp,
   and the actual file(s) submitted pulled back from Blackboard into Materials. Plus the upload
   half: drop a file on an assignment in bb2dash to link it, file it locally and in Materials,
   ready to attach in Blackboard. The app never submits to Blackboard.
4. **Course page in Google Classroom style.** Stream feed (announcements, new/changed
   materials, assignments as they open and come due), Classwork grouped by Blackboard's own
   folder tree, Grades tab, Info tab. The week-rail timeline is kept as a view, not the landing.
5. **Electron** hosts the dashboard in its own window with a taskbar icon and runs local jobs:
   mirror files to OneDrive, desktop notifications, a Sync button that opens the terminal with
   the sync command ready. Materials open on the web (signed URL). No crawl inside Electron.
6. **Sync cadence:** Stack triggers the crawl; everything after it (transform, Inbox items,
   notifications, mirroring) is automatic.
7. **Inbox** for items needing his input, with a resolve action **and a free-text "why"** on
   each resolution so the rules can be tuned later.
8. **Planner** = week grid (classes + due items) and **push-only Google Calendar sync**. No
   work-window planning, no day view.
9. **Announcements** back in scope: course Stream + top-bar bell with unread badge + all-courses
   page.
10. **Local files** organized **by bucket type per course** (as today), submissions under a
    `my_submissions` folder per course.
11. **AI policy: display only, no enforcement** in agents or skills.
12. **Styling pass deferred** until every screen exists.
13. **Priority:** course dimension first, sync loop in parallel on a second worker.

## 2. GUI audit — artboards vs. built screens (2026-09-10)

Read `web/src/app/(app)/Today.tsx`, `course/[id]/CourseScreen.tsx`, `CourseSubBar.tsx`,
`components/shell/TopNav.tsx`, `materials/MaterialsBrowser.tsx` against `13-home-v2`,
`14-course-v2`, `00-mvp-plan` and the README decisions.

| Artboard feature | Built? | Note |
|---|---|---|
| Tracker: 14 day columns, bar = Σ effort, Monday rule, month label, click-to-detail | yes | Today.tsx |
| Tracker: `◂ ▸` paging across 8 weeks, hidden scrollbar | **partial** | Container is `overflow-x: auto` with the scrollbar hidden, but only 14 days are fetched and there are no `◂ ▸` controls. Recorded cut (reconciliation: "14-day tracker window, not 56"). Reinstated by R-03. |
| ☰ Courses pop-down → course page | yes | TopNav.tsx |
| Bell with unread badge → dropdown → See all | **no** | Disabled placeholder. Recorded cut. Reinstated by R-20. |
| Needs attention: collapsed typed counts + last sync, click to expand | **reduced** | Only the last-sync line ships. Recorded cut; reinstated by R-09. |
| Course cards 2-up: code/title, meeting line, typed next-due counts, Open, M–F strip | yes | Grade line stays off by Stack's choice. The **one-line note** slot from decision 3c is not rendered (R-04). |
| Undated tray, status quick-edit (T-06) | yes | |
| Planner day view (T-17) / week grid (T-01) | **no** | Stub route. R-19 builds the week grid only. |
| Course sub-bar: Stream · Grades · Materials · Info + meeting/room + Blackboard link | **partial** | Tabs render but are inert; only the timeline exists. Replaced by R-01. |
| Course page **per-course "Upcoming work" tracker** (8 weeks, `◂ ▸`) | **no** | In the artboard, absent from CourseScreen. Not a recorded cut — **dropped**. R-02. |
| Week rail 1–16, Current / Show weeks 1–16, ring = graded, click past week → all mode | yes | Kept as the Timeline view inside R-01. |
| Lecture lane / assignment lane by week, session panel on click | yes | Session rows show "no files" on most sessions because `bb_files.session_id` is populated on 2 of 64. Cosmetic; hide the count until R-16 links files. |
| "3 attempts", "moved to 9/9" meta on assignment rows | no | Recorded cuts (data does not exist). Attempts come with R-17. |
| Lecture popout (03) / assignment popout (04) | **no** | Never ported. R-05. |
| Materials library (T-02): course → Blackboard folder path → files | **partial** | Built as course → `file_bucket` sections, not the folder tree. R-01 Classwork and R-06. |
| ⌘K search (T-12) | yes | Phase 7 improves it. |

Net: two genuine drops (per-course tracker, course-card note), one structural gap (Blackboard
folder tree), one unfinished sub-bar, and a set of recorded cuts that §3 now un-cuts. Nothing
built contradicts the spec.

## 3. Requirements

Numbered R-xx so phase briefs can cite them. Effort tags as in D1: S ≤ 1 day, M a few days or a
new view, L a new ingest path / table / engine.

### 3.1 Course dimension (Google Classroom style)

* **R-01 Course page with four tabs; Stream is the landing view.**
  * **Stream** — a reverse-chronological feed of: announcements for the course (read/unread);
    new or changed materials (from crawl-to-crawl diffs of `bb_files` / `bb_content`);
    assignments as they are posted and as they come due (card with due date, points, status
    quick-edit). Each post links to its item.
  * **Classwork** — Blackboard's own folder tree from `bb_content.path`, each folder listing its
    content items and linked files (`bb_files.content_id = bb_content.bb_item_id`), Ultra's
    Started/Completed marker from `bb_content.state`, the existing Open ladder. Zero invented
    structure. The week-rail timeline moves to a **Timeline** sub-view reachable from Classwork
    (or a fifth tab; PM's call at brief time).
  * **Grades** — the per-course view of R-11.
  * **Info** — T-05: staff + office hours (`course_staff`), meeting patterns, room, late policy,
    AI policy verbatim, letter scale, syllabus file, group memberships (`courses.group_notes`
    verbatim until the IST.466 contradiction is resolved), Blackboard link.
  Effort M per tab. Data preconditions: `bb_content` is stale (last refreshed 9/2) and 11 rows
  are titled `ultraDocumentBody`; the content transform must re-run and fall back to the parent
  path segment for titles before Classwork ships. Stream's "changed materials" needs the
  transform to keep per-run history (R-07).
* **R-02 Per-course upcoming-work tracker** at the top of the course page (Stream tab): same
  component as Home filtered to that course, 14 visible, pageable across 8 weeks. Effort S once
  R-03 exists.
* **R-03 Tracker paging.** Home and course trackers gain `◂ ▸` paging across an 8-week
  horizon (56 days fetched, 14 visible, scrollbar hidden). Effort S.
* **R-04 Course-card note line** (decision 3c) from a new nullable `courses.card_note text`,
  Stack-edited. Effort S.
* **R-05 Assignment popout and lecture popout** ported to the top-nav layout: description,
  component sub-line, series strip, late policy, full planner block, AI policy, submission
  status + submitted file(s) once R-17 exists, upload drop zone (R-18), link to the Grades tab.
  Effort M.
* **R-06 Global Materials keeps the bucket view** (Stack's local layout choice) and gains a
  per-course link into the Classwork tree. Effort S.

### 3.2 Sync loop and trust

* **R-07 Automated transform.** After a crawl lands in `bb_raw`, `pg_cron` + `pg_net` (or a
  scheduled Edge function) run the transform stages within minutes, no human step: courses,
  content, assignments, files, gradebook, announcements, attempts (R-17). Each stage idempotent
  on `run_id`, writing `sync_stage_runs`, keeping per-run history so Stream and grades can diff.
  Retires `CADENCE_RUNBOOK.md` step 3. Effort L. Prerequisite for R-10, R-17, Stream diffs.
* **R-08 Crawl status honesty.** A `running` `sync_runs` row before the first fetch; stuck runs
  > 30 min read as interrupted; partial reads as partial; freshness per data class from
  `v_data_freshness`. Effort S–M.
* **R-09 Inbox.** `attention_items` (kinds: conflict, missing, stack_must_confirm, deadline,
  data_gap; unique key so re-runs are safe) seeded by the transform and by `course_maps` gaps.
  Inbox screen grouped by kind; each row: question, source citation, suggested answer, resolve
  action, and a **free-text `resolution_note`** ("why") stored with the resolution for later rule
  tuning. Home gets the collapsed typed-count row from the artboard. The transform applies
  resolutions on the next run; until then the row reads "answered, applies on next sync".
  Effort M.
* **R-13 Sync trigger and requests.** `agent_requests` with three states. "Sync" in the web app
  copies `claude "/bb-sync <id>"` to the clipboard; in Electron (R-23) it opens the terminal
  with the command ready. "Run transform" enqueues a transform. Effort S–M.
* **R-14 AI policy: display only.** Verbatim policy on the course page, Info tab, and
  assignment popout. **No enforcement** in the MCP server or skills (Stack's decision;
  supersedes orig 4.6's gate and D3 failure mode 9). Effort S (already mostly shipped).
* **R-15 Sync reminders, none.** Stack triggers syncs; no schedule, no nag. The iCal feed URL
  is still captured if found, polled by a job that logs skipped while blank. Effort S.
* **R-16 Data gaps:** IST.323 Security-in-the-News group/date, IST.466 Group #3 slots, OCR for
  the two image-only files, `bb_files.week_no`/`session_id` classification pass. Effort M.
* **R-26 Desktop notifications** (via R-23): sync landed with N changes, grade posted, item due
  tomorrow. Web app shows the same as an in-app toast/list. Effort S.

### 3.3 Grades and submissions

* **R-10 Gradebook mirror.** `bb_gradebook` append-per-run history from `bb_raw` gradebook
  payloads reading `effectiveScore` / `displayGrade.score` / `feedback` / `lastAttempt` /
  `submissionStatus` (never `score`, null on all columns). Attendance columns flagged and
  excluded from headlines. Views `v_gradebook_latest`, `v_assignment_grade`, `v_course_grade`.
  Blackboard's `Total Score` column is the mirrored course grade where `isCalc` is true.
  Effort M. Precondition: R-07.
* **R-11 Grades screens.** Global Grades page and per-course Grades tab, each per course:
  (a) Blackboard's total, labelled "Blackboard's number, as of <date>"; (b) our computed
  standing from R-12, labelled as a model, with the delta to (a) explained; (c) what-if
  projection; (d) per-item rows: score, possible, date seen, feedback, submission status,
  score changes over time. IST.471 shows an explicit not-computable state. Not on Home cards.
  Effort M.
* **R-12 Methodology model + what-if.** Applies `grading_schemes` / `grade_components` rules to
  mirrored scores: `manual`, `single`, `sum`, `average_drop_lowest`, `rank_weighted`,
  `normalized`; declines gracefully on `manual` components and IST.471. What-if: enter
  hypothetical scores for ungraded items, see projected standing and what is needed on remaining
  work to reach a target. Effort L. Ships after R-10 holds real October scores.
* **R-17 Submission pull-back.** Add the attempts endpoint
  (`/learn/api/v1/courses/{C}/gradebook/columns/{colId}/attempts?userId={U}`) to the crawler;
  new `bb_attempts` table (attempt id, status, created, submitted, score, feedback, file refs).
  Submitted files are downloaded into Storage under the course's `my_submissions` bucket path
  and get a `bb_files` row with `assignment_id` set. Also widen `slim()`'s keep list so
  `dueDate`, `points`, `gradebookColumnId`, `attemptsAllowed` survive. Per assignment the
  popout shows: submitted / not submitted with timestamp, the submitted file(s), feedback.
  Effort L (new ingest path).
* **R-18 Assignment upload (pre-submission).** Drop a file on an assignment (popout or Classwork
  row) → Storage `bb-files` under `my_submissions` → `bb_files` row with `assignment_id`,
  `classified_by = 'stack'`, `bucket = 'my_submissions'` → mirrored to
  `course context/<course>/my_submissions/` by R-23 → visible in Materials and the popout with an
  "attach in Blackboard ↗" link. After R-17 pulls the submitted copy, the popout shows whether
  the staged file matches (sha256) or differs. Effort M.

### 3.4 Planner, announcements, polish

* **R-19 Planner week grid.** Calendar-style week: course meetings (with room) and due items
  placed on their days; `◂ ▸` by week; today highlighted. No work-window lane, no day view.
  Effort M.
* **R-25 Google Calendar push.** One bb2dash calendar in Stack's Google account: an event per
  assignment/quiz/exam due date and recurring events per course meeting pattern; updated when
  dates change, deleted when items vanish. Push only; nothing read back. Needs Google OAuth for
  the one user (server-side, token in Supabase Vault or an Edge function secret). Effort M.
* **R-20 Announcements.** Crawler captures the creator field; `announcements.read_at`; course
  Stream posts (R-01); top-bar bell with unread badge → dropdown (unread first, course · author ·
  date, mark all read) → all-courses Announcements page. Effort M.
* **R-21 Styling pass — last.** After every screen in this file exists: replace the Nocturne
  placeholder with a signed-off system, CSS custom properties only. Direction chosen then.
* **R-22 Small D1 items** folded into the tabs above: office hours (Info), content progress and
  provenance hover (Classwork), attendance-matters badge scoped to IST.466 (Info/Stream), group
  panel once the IST.466 contradiction is resolved (Info). Effort S each.

### 3.5 Shell

* **R-23 Electron shell.** Own window, single instance, taskbar icon, launch-at-login option,
  `contextBridge`, session in `safeStorage`. Loads the deployed web app. Jobs: (a) **mirror
  files** — download new `bb_files` from Storage into `course context/<course>/<bucket>/`, and
  copy Stack's uploads (R-18) to `my_submissions/`; hashes verified, never writes elsewhere;
  (b) **desktop notifications** (R-26); (c) **Sync button** opens Windows Terminal in the repo
  with `claude "/bb-sync <id>"` ready. Materials open via `shell.openExternal` on the signed
  URL. **No** `shell.openPath` from the mirror, **no** download interception, **no** Blackboard
  webview or crawl inside Electron. Unpacked build + shortcut, no installer. Effort M+.
* **R-24 Professional-side stub: dropped.** Never. IST.471's hours log (T-09) is also out.

## 4. Phase plan (confirmed order)

One PR per phase, per SOP. Phases 8 and 9 run in parallel on two workers.

| Phase | Name | Requirements | Notes |
|---|---|---|---|
| 8 | Course dimension | R-01 (Stream w/o diffs, Classwork, Info), R-02, R-03, R-04, R-05 (w/o submission block), R-06, R-22 | Content transform re-run + title fix is the first task. Stream's announcements need R-20's crawler field; ship Stream with what `announcements` holds today. |
| 9 | Sync loop | R-07, R-08, R-09, R-13, R-15, R-20 (crawler + table), R-26 (in-app) | In parallel with 8; touches db/, ingest/, edge functions, one Inbox screen. |
| 10 | Grades and submissions | R-10, R-11, R-17, R-18, then R-12 | Needs 8's popout and 9's transform. R-12 last, once October scores exist. |
| 11 | Planner and calendar | R-19, R-25, R-20 (bell + page), R-16 | Independent of grades; can pair with 10. |
| 12 | Electron shell | R-23, R-26 (desktop) | After the web app is stable. No renderer changes. |
| 13 | Styling | R-21 | Last. |

Term calendar: weeks 9 and 11 (Oct 19–25, Nov 2–8) are exam-heavy; week 14 is Thanksgiving;
Nov 30–Dec 13 was a code freeze by design. Phases 8–10 pay off inside the term.

## 5. Reversals of Sep 8 plan §11 declines (each needs a DECISIONS row when adopted)

| Declined item | Reversed by | Condition |
|---|---|---|
| Grade engine with rank-weighted/normalized aggregation this term | R-12 | After R-10 holds > 10 non-attendance scores; always labelled as a model |
| No new Blackboard endpoints this term | R-17 (attempts), R-20 (creator field) | Crawler change reviewed; `bb_raw` envelope versioned |
| 14-day tracker window, not 56 | R-03 | Fetch 56, show 14 |
| No bell / announcements this term | R-01 Stream, R-20 | — |
| No `bb_files.week_no` / `session_id` classification pass | R-16 | Offline, no Blackboard access |
| Electron only if the justification test passes | R-23 | Stack waived; scope is shell + local jobs |
| No Planner view | R-19 | Week grid only |
| AI-policy enforcement gate (orig 4.6) was *planned*; now **dropped** | R-14 | Stack: display only |
| Professional-side stub (orig Phase 7) was *planned*; now **dropped** | R-24 | Stack: never |

Still declined, unchanged: in-app chat assistant; agent write path into `assignment_progress` /
`reading_progress`; scheduled or in-Electron crawls (Duo); service-role key anywhere client-side;
exposing the stack beyond the single owner; installer / code signing / auto-update; native file
open from the OneDrive mirror.

## 6. Clarification record (2026-09-10)

### 6.1 Answers

| Question | Answer |
|---|---|
| Course page default and structure | Google Classroom style |
| Grade surfaces | Blackboard total mirrored + our computed standing + what-if |
| Submission tracking | Actual submitted file(s) pulled back + submitted/not-submitted status |
| Electron need | Own window and taskbar icon + always-on local jobs |
| Stream contents | Announcements, new/changed materials, assignments opening and due |
| Classwork grouping | By Blackboard folder |
| Upload flow | Both halves: upload in bb2dash before, pull Blackboard's copy after |
| Electron jobs | Mirror to OneDrive, desktop notifications, Sync button opens terminal |
| Inbox | Full Inbox screen with resolve action plus a "why" note per resolution |
| Planner | Week grid + Google Calendar sync |
| Grade visibility | Global Grades page + per-course Grades tab only |
| Calendar direction | Push to Google Calendar (nothing there yet) |
| Announcements surface | Bell with badge + all-courses page |
| Local file layout | By bucket type per course |
| AI policy enforcement | Do not enforce |
| Sync cadence | Stack triggers; the app does the rest |
| Styling | Defer until features are in |
| Professional side | Never |
| Priority | Course dimension first, sync loop in parallel |

### 6.2 Residual assumptions (PM's calls; say so if wrong)

1. Calendar push covers **both** due dates and class meetings, on one dedicated bb2dash
   calendar, so it can be deleted wholesale.
2. Submitted files pulled from Blackboard land in the same `my_submissions` bucket as uploads,
   distinguished by `classified_by` (`blackboard` vs `stack`).
3. The week-rail timeline survives as a sub-view under Classwork rather than a fifth tab.
4. Grades stay off the assignment popout except a link to the Grades tab; submission status
   and files do appear in the popout.
5. Electron launch-at-login is an option, off by default.

## 7. Where things go from here

* **Phase 6 closed 2026-09-10:** Stack gave visual sign-off on the deployed screens and disabled
  signups in Supabase Auth. Still open and now owned by Phase 9 day one: the `bb-files` bucket is
  `public: true` (verified 2026-09-10).
* Phase 8 and Phase 9 briefs: `61_PHASE8_course_dimension.md`, `62_PHASE9_sync_loop.md`, each
  with a frozen contract citing R-numbers. Migration ranges: Phase 8 = 026–029, Phase 9 = 030–039.
* One DECISIONS row per §5 row at the phase that adopts it.
* STATUS "Slotted for the future" is replaced by a pointer to §4 of this file.
