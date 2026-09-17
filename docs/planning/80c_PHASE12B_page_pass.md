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
| P-home-1 | home · upcoming work | needs a different shading scheme for clarity | change | | open |
| P-home-2 | home · upcoming work | side scroll instead of clickable buttons(keep the buttons as well) | change | | open |
| P-home-3 | home · upcoming work | upcoming work and todays work section should be together in some kind of visual element. | change | | open |
| P-home-4 | home · needs attention | functionality... (this will get covered again in the inbox page): after feedback is written when is it reviewed for changes to be made? | question (answered with P-inbox-1) | | open |
| P-home-5 | home · needs attention | move this section elsewhere on the page, my thoughts are to move it to the bottom. | change | | open |
| P-home-6 | home · undated | undated series placeholders are confusing, remove or hide them | change | | open |
| P-home-7 | home · undated | 9/10 of the ist466 HBR undated readings are actually the case studies for the other ethics groups. My ethics group is assigned "Apple Vs. The FBI". You should be able to review the schedule (which will be updated in the next sync most likely) to get the dates for that presentation. Since these readings are for other groups there is no date and therefore they shouldn't show up in undated. leave them in the materials storage however. | bug (data) | | open |
| P-home-8 | home · course cards | clicking on a courses card in the courses tab should open that courses page | change | | open |
| P-home-9 | home · course cards | when the course page opens, the sidebar should default to closing again (especially if course was opened through the sidebar) | change | | open |
| P-home-10 | home · course cards | display current grade on the course card. | change | | open |
| P-planner-1 | planner · assignments | assignments sections should be collapsible, hidden on default. | change | | open |
| P-planner-2 | planner · calendar | In order to visually fit multiple items into a one hour block, the height of the block (for that hour, or however long the block with overlapping items is) should scale up instead of cramming assignments and classes into the same block and require scaling | change | | open |
| P-planner-3 | planner · calendar | I also want to remove the scroll bars from assignments within the planner, adding the scaling feature should remove the need for them (they are also visually ugly) | change | | open |
| P-planner-4 | planner · calendar | implement text wrap to elements so that it visually matches how google calendar/teams calendars work. | change | | open |
| P-planner-5 | planner · assignments popouts | the popout should be much smaller. I had envisioned a much smaller, almost localized popout when clicking assignments. This popout can have the further option to see the full details which upon clicking should take you to a page similar to what we have now within that assignments course page. | change | | open |
| P-planner-6 | planner · events | add the ability to set appointments/meetings/events as reoccurring/recurring (whichever is grammatically correct). | change (new feature; "recurring") | | open |
| P-planner-7 | planner · PM carry-in | PR #16's planner CSS was never browser-checked | bug? (verify) | | open |
| P-inbox-1 | inbox · logic | who reads inbox, appends changes, and makes edits? I would like to position the feedback provided from inbox as feedback for an agentic worker eventually... | question | | open |
| P-inbox-2 | inbox · feedback entry | clarify accept bb vs. keep mine, what each entails specific to the example. | change | | open |
| P-inbox-3 | inbox · feedback entry | surfaced info and the source of it need a more clear manner of display | change | | open |
| P-grades-1 | grades · sections | I want the sections to be collapsible, score of items graded so far displayed in the header (graded so far should be the standard for what grade is showing) | change | | open |
| P-grades-2 | grades · course tab button | the course title should highlight as a hyperlink and function to take you to the course instead of using an explicit button. | change | | open |
| P-grades-3 | grades · our model | remove this section and the underlying logic behind it. We will be calculating blackboard grades from the data scraped from blackboard on syncs only. determinism emphasized here. | change (reverses Phase 10b; DECISIONS row) | | open |
| P-grades-4 | grades · item/assignment details | I want to pull the documents I have submitted from completed assignment submissions in blackboard and attach them to a section within assignment details. | change | | open |
| P-grades-5 | grades · item/assignment details | ensure submissions are appended to a new section of materials so I always have them on hand | change | | open |
| P-grades-6 | grades · submission column | "graded", and "last attempt:COMPLETED" are redundant | bug (display) | | open |
| P-grades-7 | grades · submission column | the list of options on the submission dropdown everywhere on the app has a few too many options. I want to consolidate the list of options. Currently thinking of using "not opened", "in-progress", "completed", "graded", and "dnf" as the options. Push back if these don't cover all of the assignment states (should cover all potential options generally at the very lease) | change (enum; DECISIONS row) | | open |
| P-grades-8 | grades · submission/score history | move the history feature that toggles displaying the grading history to inside of the assignment details popout | change | | open |
| P-grades-9 | grades · submission/score history | "feedback" entries should be added into the popout as well | change | | open |
| P-grades-10 | grades · submission/score history | add an indicator to an assignments item/entry to help tell the user when the assignment has feedback. | change | | open |
| P-materials-1 | materials · sections | sections should be collapsible. | change | | open |
| P-materials-2 | materials · off-platform | off-platform but in bb should be pulled and changed to in library if possible, external if possible as well | bug (data/label) | | open |
| P-materials-3 | materials · reading section layout | naturally "block" readings within the reading section into the blocks of readings assigned for a given date. | change | | open |
| P-materials-4 | materials · off-platform | "Off-platform, How to access" should be linked to the syllabus for that class so the user can quickly identify where to access the off-platform materials. | change | | open |
| P-shell-1 | shell · PM carry-in (Phase 12) | `proxy-session.ts` drops refreshed auth cookies on its two redirect branches | bug | | open |
| P-shell-2 | desktop · PM carry-in (Phase 12) | police `will-redirect` / `will-frame-navigate` | change (hardening) | | open |
| P-data-1 | classwork · PM carry-in | IST.466 duplicate folder paths; `(course_id, path)` key keeps one branch | bug | | open |
| P-data-2 | calendar push · PM carry-in | `fp-proposal` / `fp-log-final` share one column; push skips both | bug | | open |
| P-db-1 | db · PM carry-in | `calendar_events` TRUNCATE grant to `authenticated` | bug (grant) | | open |
| P-db-2 | db · PM carry-in | 21 `auth_rls_initplan` policies | change (perf) | | open |
| P-db-3 | db · PM carry-in | `numeric(9,3)` score width | change | | open |

## MVP (in Stack's words — drafted by the PM session after triage, confirmed by Stack)

_To be written. Shape: "I walk every page in order and nothing on my list marked MVP is still
wrong; nothing that worked before is broken."_

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

## Task loops (skeleton — the PM session expands rows 4–6 per page cluster)

| # | task | executable check | owner |
|---|---|---|---|
| 1 | Intake: ids + verbatim copy + triage | table filled, no untyped row | PM session |
| 2 | Research: reproduce, locate, size (Sonnet, one per page) | each bug has repro steps + `file:line`; each change has a design note | researchers |
| 3 | Questions to Stack in one batch; MVP / post-MVP cut; freeze this brief | Stack's answers recorded; MVP section written | PM session + Stack |
| 4 | Worktrees + Opus workers per page cluster (disjoint files) | branches pushed, one commit per item id (`fix(P-planner-3): …`) | PM session |
| 5 | Fix loop per item: failing test → fix → green | verification note per worker | workers |
| 6 | Integrate, regenerate types if an RPC changed, full suites | all green | PM session |
| 7 | PM browser walk + before/after screenshots | `80d` written | PM session |
| 8 | Gates + docs + PR with preview | SOP list | PM session |
| 9 | **Stack's acceptance walk** | every MVP id ticked | Stack |
| 10 | Post-MVP tail, same branch or a follow-up PR (Stack's call) | — | workers |

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
