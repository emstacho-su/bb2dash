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
| _to be filled_ | | | | | |

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
