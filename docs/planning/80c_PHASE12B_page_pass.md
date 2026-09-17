# Phase 12b — Fine-tooth-comb pass: every page, every feature

Date: 2026-09-16 (brief). Product manager: Stack. Phase branch `fix/page-pass-12b`, one PR.
**After Phase 12 is on `main`, before Phase 13.** Migration range **073–079** if Phase 12 leaves
it unused, otherwise 082–089 (the PM session confirms against `main` before reserving).

## Why

* Phases 8–12 shipped fast, several in parallel. Each was walked against its own acceptance
  script; nobody has walked the whole product end to end.
* Stack uses the app daily and keeps a list of bugs and feature changes. This phase clears it
  before the styling pass (13) paints over it and before containers (14) freeze the process layer.

## Method (how this phase runs — different from the other briefs)

* **Input = Stack's list.** He hands the PM session one extensive list of bugs and changes,
  grouped by page. The PM session does not start from requirements; it starts from that list.
* **The PM session does not build first.** In order:
  1. Read the list. Give every item an id `P-<page>-<n>` and copy it verbatim into §Intake below.
  2. Triage each item: **bug** (behaves wrong) / **change** (behaves as built, Stack wants it
     different) / **question** (unclear, goes back to Stack) / **out** (belongs to 13 styling,
     14 containers, V-1 data, or a later phase — say which).
  3. Research: one Sonnet researcher per page (or per cluster) reproduces each bug on the
     preview or prod in a logged-in browser, finds the code path (`file:line`), and sizes the
     fix S / M / L. Changes get a one-paragraph design note and any contract impact (view, RPC,
     migration, engine export).
  4. Put the `question` items to Stack in one batch. Wait.
  5. Plan: cut the list into an **MVP** (what must ship for the phase to count) and a
     **post-MVP** tail, write the DoD and the task loops into this file, freeze it.
  6. Only then: worktrees, Opus workers (one per page cluster, disjoint files), integrate, gates.
* **Nothing is silently dropped.** Every intake id ends in exactly one state: fixed, deferred
  (with the phase it moved to), or declined (with Stack's word).

## Pages and features in scope (the comb's teeth)

* Today (tracker, paging, needs-attention row) · Course: Stream / Classwork / Grades / Info ·
  popouts (assignment, session, submission block, upload drop zone) · Materials · ⌘K search ·
  Planner (week grid, planner events form, Events band) · Grades (`/grades`, grade model,
  what-if, target solver, "Counts toward…" picker, history) · Inbox · Announcements + bell ·
  Sync button + Activity · courses sidebar + shell · login, `/privacy`, `/terms` ·
  Electron shell (window, tray, toasts, Sync) · Google Calendar push as seen in Google.
* Known carry-ins the PM session adds to the intake itself:
  * PR #16's planner CSS was never browser-checked.
  * STATUS "Known issues" rows that are code, not data (IST.466 duplicate folder paths,
    `fp-proposal` / `fp-log-final` shared column skipped by the push, `calendar_events` TRUNCATE
    grant, 21 `auth_rls_initplan` policies, `numeric(9,3)` score width).
  * Phase 13's C-1..C-3 stay in 13 unless Stack moves them.

## Intake — Stack's list (verbatim, filled by the PM session)

| id | page | Stack's words | type | size | state |
|---|---|---|---|---|---|
| P-home-1 | home · upcoming work | needs a different shading scheme for clarity | change | S | researched |
| P-home-2 | home · upcoming work | side scroll instead of clickable buttons(keep the buttons as well) | change | M | researched |
| P-home-3 | home · upcoming work | upcoming work and todays work section should be together in some kind of visual element. | change | S | researched |
| P-home-4 | home · needs attention | functionality... (this will get covered again in the inbox page): after feedback is written when is it reviewed for changes to be made? | question (answered with P-inbox-1) | — | researched |
| P-home-5 | home · needs attention | move this section elsewhere on the page, my thoughts are to move it to the bottom. | change | S | researched |
| P-home-6 | home · undated | undated series placeholders are confusing, remove or hide them | change | S | researched |
| P-home-7 | home · undated | 9/10 of the ist466 HBR undated readings are actually the case studies for the other ethics groups. My ethics group is assigned "Apple Vs. The FBI". You should be able to review the schedule (which will be updated in the next sync most likely) to get the dates for that presentation. Since these readings are for other groups there is no date and therefore they shouldn't show up in undated. leave them in the materials storage however. | bug (data) | M | researched |
| P-home-8 | home · course cards | clicking on a courses card in the courses tab should open that courses page | bug (card looks clickable, has no link) | S | researched |
| P-home-9 | home · course cards | when the course page opens, the sidebar should default to closing again (especially if course was opened through the sidebar) | change | S | researched |
| P-home-10 | home · course cards | display current grade on the course card. | change | M | researched |
| P-planner-1 | planner · assignments | assignments sections should be collapsible, hidden on default. | change | S | researched |
| P-planner-2 | planner · calendar | In order to visually fit multiple items into a one hour block, the height of the block (for that hour, or however long the block with overlapping items is) should scale up instead of cramming assignments and classes into the same block and require scaling | change | L | researched |
| P-planner-3 | planner · calendar | I also want to remove the scroll bars from assignments within the planner, adding the scaling feature should remove the need for them (they are also visually ugly) | change | S (after P-planner-2) | researched |
| P-planner-4 | planner · calendar | implement text wrap to elements so that it visually matches how google calendar/teams calendars work. | change | S (best with P-planner-2) | researched |
| P-planner-5 | planner · assignments popouts | the popout should be much smaller. I had envisioned a much smaller, almost localized popout when clicking assignments. This popout can have the further option to see the full details which upon clicking should take you to a page similar to what we have now within that assignments course page. | change | L | researched |
| P-planner-6 | planner · events | add the ability to set appointments/meetings/events as reoccurring/recurring (whichever is grammatically correct). | change (new feature; "recurring") | L | researched |
| P-planner-7 | planner · PM carry-in | PR #16's planner CSS was never browser-checked | bug? (verify) | S | researched |
| P-inbox-1 | inbox · logic | who reads inbox, appends changes, and makes edits? I would like to position the feedback provided from inbox as feedback for an agentic worker eventually... | question | S (hook) | researched |
| P-inbox-2 | inbox · feedback entry | clarify accept bb vs. keep mine, what each entails specific to the example. | change | M | researched |
| P-inbox-3 | inbox · feedback entry | surfaced info and the source of it need a more clear manner of display | change | M | researched |
| P-grades-1 | grades · sections | I want the sections to be collapsible, score of items graded so far displayed in the header (graded so far should be the standard for what grade is showing) | change | M | researched |
| P-grades-2 | grades · course tab button | the course title should highlight as a hyperlink and function to take you to the course instead of using an explicit button. | change | S | researched |
| P-grades-3 | grades · our model | remove this section and the underlying logic behind it. We will be calculating blackboard grades from the data scraped from blackboard on syncs only. determinism emphasized here. | change (reverses Phase 10b; DECISIONS row) | L | researched |
| P-grades-4 | grades · item/assignment details | I want to pull the documents I have submitted from completed assignment submissions in blackboard and attach them to a section within assignment details. | change | — (built; waits for first v3 sync) | researched |
| P-grades-5 | grades · item/assignment details | ensure submissions are appended to a new section of materials so I always have them on hand | change | — (built; waits for first v3 sync) | researched |
| P-grades-6 | grades · submission column | "graded", and "last attempt:COMPLETED" are redundant | bug (display) | S | researched |
| P-grades-7 | grades · submission column | the list of options on the submission dropdown everywhere on the app has a few too many options. I want to consolidate the list of options. Currently thinking of using "not opened", "in-progress", "completed", "graded", and "dnf" as the options. Push back if these don't cover all of the assignment states (should cover all potential options generally at the very lease) | change (enum; DECISIONS row) | L | researched |
| P-grades-8 | grades · submission/score history | move the history feature that toggles displaying the grading history to inside of the assignment details popout | change | S | researched |
| P-grades-9 | grades · submission/score history | "feedback" entries should be added into the popout as well | change | S | researched |
| P-grades-10 | grades · submission/score history | add an indicator to an assignments item/entry to help tell the user when the assignment has feedback. | change | M | researched |
| P-materials-1 | materials · sections | sections should be collapsible. | change | S | researched |
| P-materials-2 | materials · off-platform | off-platform but in bb should be pulled and changed to in library if possible, external if possible as well | bug (data/label) | M | researched |
| P-materials-3 | materials · reading section layout | naturally "block" readings within the reading section into the blocks of readings assigned for a given date. | change | M | researched |
| P-materials-4 | materials · off-platform | "Off-platform, How to access" should be linked to the syllabus for that class so the user can quickly identify where to access the off-platform materials. | change | S | researched |
| P-shell-1 | shell · PM carry-in (Phase 12) | `proxy-session.ts` drops refreshed auth cookies on its two redirect branches | bug | S | researched |
| P-shell-2 | desktop · PM carry-in (Phase 12) | police `will-redirect` / `will-frame-navigate` | change (hardening) | S | researched |
| P-data-1 | classwork · PM carry-in | IST.466 duplicate folder paths; `(course_id, path)` key keeps one branch | bug | L | researched |
| P-data-2 | calendar push · PM carry-in | `fp-proposal` / `fp-log-final` share one column; push skips both | bug | M | researched |
| P-db-1 | db · PM carry-in | `calendar_events` TRUNCATE grant to `authenticated` | bug (grant) | S | researched |
| P-db-2 | db · PM carry-in | 21 `auth_rls_initplan` policies | change (perf) | M (22 policies, not 21) | researched |
| P-db-3 | db · PM carry-in | `numeric(9,3)` score width | change | L (8 dependent views) | researched |

## MVP (in Stack's words — drafted by the PM session after triage, confirmed by Stack)

"I walk Home, Planner, Inbox, Grades and Materials in order and nothing on my list marked MVP is
still wrong; nothing that worked before is broken. Grades shows one deterministic figure per
course, computed only from what the sync scraped, and I have seen the numbers that justify the
method. Every status dropdown offers the same six choices and 'graded' sets itself."

**MVP ids (30):** P-home-1..10 · P-planner-1, 2, 3, 4, 7 · P-inbox-1, 2, 3 · P-grades-1, 2, 3, 6,
7, 8, 9, 10 · P-materials-1, 2, 3, 4 · P-shell-1, P-shell-2, P-data-2, P-db-1, P-db-2.
**Verify only (built; needs the pre-development sync):** P-grades-4, P-grades-5.
**Post-MVP tail, same phase, after Stack's MVP walk:** P-planner-6 (recurring, *including* "this
one / all following / whole series" — his answer 15), P-planner-5 (small popover + full-details page).
**Deferred:** P-data-1 → the next phase that touches `stage_content` (key change, L).
**Declined (PM proposal, Stack to confirm at approval):** P-db-3 (eight views recreated for one
third decimal).

### Stack's answers (2026-09-17), numbered as asked

1. Graded-so-far: **explore the weighted alternative** (syllabus weights × Blackboard scores).
   A task of this phase is a **comparison suite on dummy data**: raw points ratio vs the model we
   built (and the slim weighted calc), measured against hand-derived true grades. The numbers
   decide what stays. → task G-0, a gate before any removal.
2. Zero-point columns: out of the ratio, shown as completion ticks.
3. "Our model": the **"Counts toward…" picker may stay** (the weighted calc needs column → part
   links); what-if, target solver, placeholder rows and the scenario table's use go. DB objects
   left in place only if unused; nothing is dropped in this phase.
4. "Sections" = **each course's block collapses**; the sub-groups inside (grading parts,
   uncounted columns) collapse too.
5. Status list: **not opened · in progress · submitted · graded · excused · DNF.** "Graded" sets
   itself when Blackboard posts a score (DECISIONS row: the one sanctioned sync write to planner
   state; forward-only from not opened / in progress / submitted, never from excused or DNF).
6. Feedback indicator: a small superscript mark (`*` or `!`) — on the **item** cell, since that is
   the link to the details; the submission cell is the fallback if it reads badly.
7. Ethics = **Team 3** (Team 2 is his Synchrony team). Schedule: Team 3 practice 9/22,
   presentation **2026-09-24**. `readings` 89 gets `for_date = 2026-09-24`; the assignment row
   `IST.466/ethics-team-2-presentation` is mis-titled for him and is corrected in the same data fix.
8. `required = false` readings leave Undated and workload in every course; they stay in Materials.
9. All three undated series rows are placeholders (GEO.103 discussion questions included: prep
   only, handwritten, handed in in person, no Blackboard item). Hide all three.
10. Sidebar closes for that navigation only; the saved preference is untouched.
11. Tracker scroll spans **the full date range of the assignments**; on open it anchors at today.
    ◂ ▸ stay.
12. Course card shows the same figure as Grades (answer 1's winner) + Blackboard's total where
    one exists.
13. Only hours with overlaps grow; capped.
14. Small popover on Planner only; full-details page under the course, linkable from anywhere.
15. Recurring: daily / weekly / monthly, mandatory end date, ≤ 52 occurrences, deleting a series
    leaves past occurrences — **and single-occurrence edit/delete ships with it, not later.**
16. Inbox: the hook only (`v_inbox_feedback` + a request kind), no agent; buttons on kinds that
    never apply say "recorded only".
17. GEO.103's daily reading-question documents and the readings **are files on Blackboard**.
    **Stack runs a sync before development starts**; the 18 unmatched rows are re-counted after it.
18. Alongside the MVP: a task list whose every row has a **testable DoD, backend and front end**,
    the front-end half run by driving his machine (Playwright on the logged-in preview; the
    unpacked Electron build for shell items). → §Task loops.

### Frozen design notes (what workers build to)

* **Grade method (G-0 → G-1).** Three pure functions over the same input (latest gradebook rows +
  `grade_components` + links): `pointsRatio`, `weightedSoFar` (per part: Σscore/Σpossible over
  graded, non-zero-point items; course = Σ(weight × part ratio) / Σ(weights of parts with ≥ 1
  graded item); points-based schemes reduce to the ratio over linked items), and the existing
  engine's graded-so-far. Fixtures: ≥ 12 synthetic gradebooks (weighted, points, drop-lowest,
  zero-point columns, extra credit, one part ungraded, unlinked column, exempt item), each with a
  hand-written derivation of the true grade-so-far. Output `80e_GRADE_METHOD_COMPARISON.md`:
  absolute error per fixture per method. **Stack reads it and picks; nothing is deleted before.**
  Whatever loses is removed from the web tree; `v_gradebook_history` and `ScoreHistory` stay in
  every outcome (the desktop poller reads the view).
* **Status.** The Postgres enum is not altered (additive rule): UI labels map `not_started` →
  "Not opened", `missed` → "DNF"; `planned`, `waived`, `not_applicable` leave the menu; a data
  migration folds existing `waived` / `not_applicable` rows into `excused` and `planned` into
  `not_started`. One PM-owned file, `web/src/lib/progress-status.ts`, holds values, labels and
  order and is committed **before** worker branches are cut; every screen imports it.
  Auto-graded: a step at the end of `stage_gradebook` upserts `assignment_progress.status =
  'graded'` for a linked assignment with a non-null score, forward-only as in answer 5.
* **Workload visibility.** `assignments.hidden_from_workload boolean not null default false`
  (no stage function writes it) set on the three series ids; `v_work_items.in_workload` becomes
  `required is not false` for readings and `not hidden_from_workload` for assignments; every
  consumer filters on `in_workload` (the db worker proves which already do).
* **Reading ↔ file link.** Backfill `bb_files.reading_id` (67 → 47, 69 → 48, plus whatever the
  pre-development sync brings), and a link step in `stage_files` for bucket `readings`:
  normalised title/citation match, exactly-one-candidate only, otherwise an Inbox row.
* **Planner rows.** A per-slot height table (base 24 px; a slot grows with its max concurrent
  lanes, capped at 4×) and cumulative offsets behind one `slotToPx()` used by blocks, event
  segments, the now-line, click slots and the clamp. Lanes stay for > cap.
* **Recurring (post-MVP).** `planner_event_series` + `planner_events.series_id`,
  `series_detached boolean`; occurrences are ordinary rows, so the push is untouched. "This one"
  edits the row and detaches it; "all following" splits the series; "whole series" rewrites
  non-detached future rows. Migrations 082–083.
* **Migrations.** 073 workload visibility + readings data · 074 reading link · 075 shared-item
  restamp (P-data-2) · 076 TRUNCATE revoke + 22 initplan policies · 077 `v_inbox_feedback` + kind
  · 078 status fold + auto-graded · 079 slack. Post-MVP 082–083.
* **DECISIONS rows owed:** grade method outcome (reverses part of 10b) · status list + the
  auto-graded exception · workload visibility flag · sidebar closes on navigation · Inbox notes
  as agent feedback · P-db-3 declined.

## Definition of done (fixed parts; the PM session adds per-item checks)

- [ ] Every intake id has a final state; the table above has no blank `state` cell.
- [ ] Every fixed **bug** has a regression test that failed before the fix (RED → GREEN shown
      in the worker's verification note).
- [ ] Every **change** touching a frozen contract of an earlier phase has a DECISIONS row.
- [ ] No fabricated numbers introduced; planner state still never overwritten by a sync.
- [ ] Web typecheck + build + vitest green (count not below `main`'s); mcp-server and desktop
      suites green; SQL tests roll back clean.
- [ ] **PM browser walk** of every page on the Vercel preview, logged in, one screenshot per
      page before/after in `80d_PHASE12B_WALK.md`.
- [ ] **Stack's acceptance walk**: he re-walks his own list on the preview and ticks each MVP id.
- [ ] SOP gates: `/code-review main high` CRITICAL + HIGH cleared; `/security-review` if any
      item touches auth, input, secrets or an endpoint; STATUS + DECISIONS + ORCHESTRATOR updated.
      (`/security-review` is required here: P-shell-1 is auth, 076 is RLS.)
- [ ] **Every row of §Item task list passes both of its checks**, backend and front end, and the
      evidence (test name, SQL result, screenshot path) is in the worker's verification note or
      `80d_PHASE12B_WALK.md`.
- [ ] `80e_GRADE_METHOD_COMPARISON.md` exists and Stack's pick is recorded before any grade code
      is deleted.
- [ ] The pre-development sync has run and its re-count (attempts, submission files, GEO.103
      reading files, IST.466 schedule) is written under §Sync gate.
- [ ] No status value other than the six appears in any menu; no row in `assignment_progress` /
      `reading_progress` holds `planned`, `waived` or `not_applicable`.

## Task loops (skeleton — the PM session expands rows 4–6 per page cluster)

| # | task | executable check | owner |
|---|---|---|---|
| 1 | Intake: ids + verbatim copy + triage | table filled, no untyped row | PM session |
| 2 | Research: reproduce, locate, size (Sonnet, one per page) | each bug has repro steps + `file:line`; each change has a design note | researchers |
| 3 | Questions to Stack in one batch; MVP / post-MVP cut; freeze this brief | Stack's answers recorded; MVP section written | PM session + Stack |
| 3a | **Sync gate**: Stack runs a sync; PM re-counts and fills §Sync gate; PM commits `progress-status.ts` | counts written; file + tests on the phase branch | Stack + PM session |
| 3b | **G-0 gate**: comparison suite + `80e`; Stack picks the grade method | pick recorded in §answers | W-31 + Stack |
| 4 | Worktrees + Opus workers per page cluster (disjoint files; §Workers) | branches pushed, one commit per item id (`fix(P-planner-3): …`) | PM session |
| 5 | Fix loop per row of §Item task list: failing test → fix → green → PM front-end check; a row that fails either check goes back to its worker | verification note per worker; both checks ticked per row | workers + PM session |
| 6 | Integrate, regenerate types if an RPC changed, full suites | all green | PM session |
| 7 | PM browser walk + before/after screenshots | `80d` written | PM session |
| 8 | Gates + docs + PR with preview | SOP list | PM session |
| 9 | **Stack's acceptance walk** | every MVP id ticked | Stack |
| 10 | Post-MVP tail, same branch or a follow-up PR (Stack's call) | — | workers |

### Sync gate (task 3a — Stack, before any worker)

Stack runs one sync from the app's Sync button (`main` checkout, crawler v3). The PM session then
records here: `bb_attempts` rows, `bb_files` rows in `my_submissions`, GEO.103 reading files now
matchable to the 18 unlinked readings, any IST.466 schedule change touching 9/22 or 9/24.

**Filled 2026-09-17** (Stack approved the brief and ran the sync: request 20, sync run 47, crawl
`1b5e8da5-…`, captured 15:35 UTC, **crawler v3** on all seven course rows, 49 gradebook columns).

* `bb_attempts` = **0**, `my_submissions` files = **0**. The v3 probe ran 21 column requests
  (`/learn/api/v1/courses/<c>/gradebook/columns/<col>/attempts?userId=<me>&limit=100`); every one
  answered `200` with `results: []`, including columns Blackboard shows as GRADED with a
  submitted attempt. **The endpoint is wrong for a student session — P-grades-4 / P-grades-5 are
  a crawler bug, not a data wait.** New task **G-7a** below; G-7 stays the verification after it.
* GEO.103 `readings`-bucket files: 7, of which 4 unlinked; on-Blackboard readings with no linked
  file: 20 (unchanged). The reading files Stack describes are not being harvested by the crawl;
  file pull is bb-sync step 4 / `bb-course-pull`. M-2's worker lists what `bb_content` holds for
  those titles and the PM runs a file pull for GEO.103 before M-2's front-end check.
* The course payload now carries a `schedule` key. Not consumed by any stage yet; out of scope
  here unless H-4 needs it (9/24 already stands in `sessions`).

| task | ids | owner | backend / unit check | front-end check |
|---|---|---|---|---|
| G-7a | P-grades-4, 5 | PM (discovery, in Stack's logged-in Blackboard tab) → W-30 (`ingest/bb_crawler.js`) | PM records the request Blackboard's own UI makes when a student opens a submitted attempt (network panel), with status and top-level keys, in `80f_ATTEMPTS_ENDPOINT.md`; W-30 points the probe at it (v4), keeps the `keys` list, adds a fixture from the real payload with names scrubbed; `stage_attempts` SQL test passes on it | after the next sync: G-7 |

### Workers (disjoint files; cut after `progress-status.ts` is committed)

| worker | branch / worktree | owns |
|---|---|---|
| W-30 db | `fix/page-pass-12b-db` · `bb2dash-wt-12b-db` | `db/migrations/073–078`, `db/tests/`, `desktop/src/main/navigation.ts` + its policy/tests, `web/src/lib/supabase/proxy-session.ts` |
| W-31 grades | `fix/page-pass-12b-grades` · `bb2dash-wt-12b-grades` | `web/src/lib/grade-model*`, `queries.grade*.ts`, `web/src/components/grades/`, the two grades screens, `web/src/components/popout/SubmissionBlock.tsx` |
| W-32 home + inbox + materials | `fix/page-pass-12b-pages` · `bb2dash-wt-12b-pages` | `Today.tsx`, `web/src/components/tracker/`, `web/src/components/shell/`, `globals.css` type tokens, `inbox/`, `queries.sync.ts`, `materials/`, `queries.materials.ts`, `queries.today.ts`, `StatusSelect.tsx`, the status `<select>` in `AssignmentPopout.tsx` |
| W-33 planner | `fix/page-pass-12b-planner` · `bb2dash-wt-12b-planner` | `web/src/components/planner/`, `planner-week.ts`, `planner-events-grid.ts`; post-MVP: recurrence (082–083, form, grid) and the anchored popover + full-details route |

Workers commit and push per item id (`fix(P-home-8): …`), never touch `project-state/`, apply
migrations under the file's name after a `begin; … rollback;` dry run. Front-end checks are run by
the PM session in Playwright against the logged-in Vercel preview of the phase branch (and the
unpacked Electron build for P-shell-2), one screenshot per check into `80d`.

### Item task list (every row: a backend check and a front-end check)

| task | ids | owner | backend / unit check (executable) | front-end check (PM drives the browser) |
|---|---|---|---|---|
| G-0 | P-grades-3, P-grades-1 (method) | W-31 | `vitest grade-method-comparison`: ≥ 12 fixtures, each asserts its hand-derived truth; report `80e` generated from the run | — (Stack reads `80e`, picks; **gate**) |
| G-1 | P-grades-3 | W-31 | losing method's files and tests deleted; `grep -r grade-model web/src` matches only what survives; typecheck + build green; `v_gradebook_history` untouched | `/grades` and a course Grades tab show no "Our model", no what-if cells, no target solver; picker present only if the winner needs links |
| G-2 | P-grades-1, P-home-10 | W-31 (card: W-32) | unit tests: header figure per course equals the winner's function on the 9/16 fixtures; zero-point columns excluded; nothing-graded state has its own sentence | each course block collapses and reopens; inner groups toggle; header shows the figure with "as of"; Home course card shows the same number as `/grades` for every course |
| G-3 | P-grades-2 | W-31 | component test: title is a link to `/course/<id>`; no "Course tab →" button | click the title on `/grades` → lands on the course |
| G-4 | P-grades-6 | W-31 | RED→GREEN: a GRADED + COMPLETED row renders one label | no row on `/grades` reads "last attempt: COMPLETED" beside "Graded" |
| G-5 | P-grades-8, 9 | W-31 | component tests: popout renders history and feedback from `useAssignmentGrade`; table no longer renders the history toggle | open IST.352 "Research – Role of Systems Analyst" from `/grades`: feedback text and history both inside the popout |
| G-6 | P-grades-10 | W-31 | unit: mark present iff `feedback` non-empty; has an accessible name | that same row shows the superscript mark on the item cell; a row without feedback shows none |
| G-7 | P-grades-4, 5 | PM (verify) | after the sync: `select count(*)` on `bb_attempts` and `my_submissions` files > 0, sha256 present | a submitted assignment's popout lists the file and opens it; Materials shows "My submissions" |
| S-1 | P-grades-7 | PM then W-30 + W-32 | `progress-status.ts` unit tests (six values, order, label map); 078 SQL test: fold leaves 0 rows in retired values; auto-graded moves not opened / in progress / submitted → graded and leaves excused / DNF alone; replay writes 0 rows | every status menu (Today, tracker, Classwork, popout, Planner quick-edit) lists exactly the six; after the sync a newly scored item reads "Graded" without a click |
| H-1 | P-home-1 | W-32 | token contrast test (each type pair ≥ 3:1 against its neighbour and the card, both themes) | tracker screenshot: five types tell apart at a glance, light and dark |
| H-2 | P-home-2 | W-32 | `anchor.ts` tests: range = min..max dated item, initial anchor = today, buttons still page 14 days; Stream reuse still passes | wheel / drag scrolls from the first to the last assignment date; reload re-anchors at today; ◂ ▸ work |
| H-3 | P-home-3, 5 | W-32 | render test: tracker strip and today panel share one card; needs-attention is the last section | Home screenshot: one card; needs-attention at the bottom |
| H-4 | P-home-6, 7 | W-30 (+ W-32 filter) | 073 SQL test: the three series ids and nine case-pool readings have `in_workload = false`; reading 89 `for_date = 2026-09-24`; all ten still in `readings` and Materials queries | Undated lists none of the twelve; "Apple vs. The FBI" sits on 9/24; Materials still shows all ten cases |
| H-5 | P-home-8 | W-32 | RED→GREEN: card is a link to `/course/<display_id>`; keyboard focusable | click each of the course cards → its course page |
| H-6 | P-home-9 | W-32 | test: navigation closes the sidebar in wide mode without writing the preference key | open a course from the sidebar → it closes; reload Home → the sidebar is as the preference says |
| PL-1 | P-planner-1 | W-33 | component test: band collapsed by default, toggle persists | `/planner` opens with Assignments collapsed; toggle survives reload |
| PL-2 | P-planner-2, 3, 4 | W-33 | `slotToPx` property tests (monotonic, continuous, base case identical to today when no overlaps, cap honoured); now-line and click-slot tests through the same map; no `overflow-y:auto` in planner CSS | a week with a class + two due items in one hour: that hour is taller, nothing scrolls inside a block, titles wrap; clicking an empty slot below it still creates an event at the right time |
| PL-3 | P-planner-7 | W-33 | tests for the three inspected risks (empty-week label, chip positioning, pre-hydration height reserved) | empty week screenshot: label not clipped; load `/planner` with a cleared cache: no layout jump, no console error |
| I-1 | P-inbox-1, P-home-4 | W-30 | 077 SQL test: `v_inbox_feedback` is `security_invoker`, anon revoked, returns resolved rows with notes; the new kind is accepted and ignored by `transform_tick` | — (brief §answers is the written explanation; Inbox gets a one-line "what happens to my answer" help text: I-2) |
| I-2 | P-inbox-2 | W-32 | `outcomeText()` unit tests per kind and field, New York formatting, "recorded only" on kinds `apply_resolutions` skips | a due-date conflict row states both outcomes with real dates under its buttons |
| I-3 | P-inbox-3 | W-32 | render tests: no raw JSON; course, kind, age, source run, link to the thing | an assignment row's link opens that assignment; a course-level row shows where it came from in words |
| M-1 | P-materials-1, 3 | W-32 | grouping unit tests: by `for_date`, undated last, IST.466 cases under one "Case pool" header; collapse state | Materials: buckets collapse; ECN.304 readings sit under date headers |
| M-2 | P-materials-2 | W-30 | 074 SQL test: backfill links the known pairs; the link step links on exactly one candidate, raises an Inbox row on several, replay writes 0 | the linked GEO.103 readings read "In library" and open; the 21 textbook chapters still read "Off-platform" |
| M-3 | P-materials-4 | W-32 | unit: syllabus resolver picks the file matching `syllabus_path`'s basename per course, including the recitation shell | "How to access" on an off-platform reading opens that course's syllabus |
| X-1 | P-shell-1 | W-30 | RED→GREEN: both redirect branches carry the refreshed cookies | stay signed in across an expired-token redirect (preview; then Electron after hours in the tray — Stack) |
| X-2 | P-shell-2 | W-30 | desktop unit + e2e: `will-redirect` and `will-frame-navigate` to a foreign origin are blocked and logged | unpacked build still loads, signs in, and opens Blackboard links externally |
| X-3 | P-data-2, P-db-1, P-db-2 | W-30 | 075: both IST.323 rows restamped by a replay of the newest crawl and present in `v_calendar_push_items`; 076: no TRUNCATE for `authenticated`, advisor shows 0 `auth_rls_initplan`, owner sees all rows and another uid sees none | the two IST.323 final-project events appear on the `bb2dash` Google calendar after one push |
| T-1 (post-MVP) | P-planner-6 | W-33 + W-30 | 082–083 SQL tests (bounds, DST, detach, split); push proof: N inserts, zero-write re-run, one-occurrence edit = 1 patch, series delete leaves past rows; test rows deleted in the same sitting | create weekly until a date → occurrences on the grid and in Google; edit one; edit all following; delete the series |
| T-2 (post-MVP) | P-planner-5 | W-33 | popover unit tests (anchoring, escape, focus return); new route renders the full details | click a due item on `/planner` → small anchored popover; "See full details" → the page under the course |

## Out of scope

* Visual restyling (Phase 13) — a layout **bug** is in; a taste change is 13's.
* Containers, scheduler, dev container (Phase 14).
* V-1 grading data corrections (rules, placeholder points).
* New features not on Stack's list.

## Session prompt (copy-paste)

> `/bb2dash-pm` Start Phase 12b (fine-tooth-comb pass). Read
> `docs/planning/80c_PHASE12B_page_pass.md` and follow its Method exactly. My list of bugs and
> changes by page follows below. Give every item an id, triage it, spawn Sonnet researchers (one
> per page) to reproduce, locate and size, then bring me your questions in one batch. After my
> answers, write the MVP, DoD and task loops into the brief and stop for my approval before
> spawning any worker.
>
> <paste the list here, grouped by page>
