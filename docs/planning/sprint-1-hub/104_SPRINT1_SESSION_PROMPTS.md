# 104 — Sprint 1 session prompts (history)

Moved here from `project-state/ORCHESTRATOR.md` §6 on 2026-09-24, when sprint 2's prompts replaced them
(Stage D of the sprint 2 planning prompt). Every prompt below was used in sprint 1 or superseded by it;
the sprint 2 planning prompt (the last entry) is the one this planning round ran under, kept here because
PR #26 holds its final wording. Nothing here is live: the current prompts are in ORCHESTRATOR §6.

Filed under `sprint-1-hub/` with the next repo-wide number (docs/planning/README.md: numbers never restart).

---
Every bb2dash prompt starts with `/bb2dash-pm` so the session loads this file and runs the
live-state checks before acting. Run one phase per session. Where a brief does not exist yet,
the session writes it and stops for Stack's answers before spawning workers (SOP: substantial
new scope is verified before development begins).

**After PR #8 merges — Phase 9 hand-in**

> `/bb2dash-pm` Phase 9 (sync loop) is integrated on `feat/sync-loop` but has no PR. Merge
> `origin/main` into it (Phase 8 just landed; the seam is `stage_content`), resolve conflicts
> in favour of the frozen contract in `62_PHASE9_sync_loop.md`, regenerate `database.types.ts`,
> run typecheck/build/tests in `web/` and `mcp-server/`, live-smoke the transform driver and
> Inbox against prod, run `/code-review main high` and `/security-review`, update STATUS,
> DECISIONS and ORCHESTRATOR, and open the Phase 9 PR. Do not merge it.

**Phase 10a — grades: mirror, screens, submissions**

> `/bb2dash-pm` Start Phase 10a (R-10 gradebook mirror, R-11 Grades screens, R-17 submission
> pull-back, R-18 upload drop zone). Complete the **Contract** section of `docs/planning/sprint-1-hub/briefs/67_PHASE10A_grades.md` (MVP, DoD and task loops are already frozen there; migration range 041–059), and the seams with Phase 11 and V-1 (V-1 owns
> `grading_schemes`/`grade_components` data; 10a reads them, never writes). Put your open
> questions to me and wait for my answers. Then branch `feat/grades-10a` off `main`, create the
> worker worktrees, and spawn Opus workers. Stop at the PR.

**Phase 10b — grades: methodology model + what-if** (ran 2026-09-16; Stack waived the V-1 precondition — kept for the record)

> `/bb2dash-pm` Start Phase 10b (R-12 methodology model and what-if). Preconditions: 10a is on
> `main`, `bb_gradebook` holds more than ten non-attendance scores, and
> `65_GRADING_VALIDATION_SUMMARY.md` shows every course signed off with its reconciliation
> migration applied. Verify all three and stop if any fails. Then complete the Contract section of
> `docs/planning/sprint-1-hub/briefs/68_PHASE10B_grade_model.md`, ask your open questions, wait, and build the way
> 10a was built. Every computed figure is labelled as a model; IST.471 shows not-computable.

**Phase 11 — planner and calendar** (in parallel with 10a)

> `/bb2dash-pm` Start Phase 11 (R-19 planner week grid, R-25 push-only Google Calendar sync,
> R-20 bell + Announcements page, R-16 data gaps). Complete the Contract section of `docs/planning/sprint-1-hub/briefs/69_PHASE11_planner.md`
> (MVP, DoD and task loops are frozen there; migration range 060–069); Phase 10a is running in parallel on
> `feat/grades-10a`, so declare the seams (announcements table from Phase 9, popout from
> Phase 8) and touch nothing under 10a's range. Google OAuth for the single user is server-side
> with the token in Supabase Vault — list the setup steps I must do myself. Ask your open
> questions, wait, then branch `feat/planner-11`, spawn workers, stop at the PR.

**V-1 — grading schema validation** (Stack's sitting; not a PM session)

> From the repo root in PowerShell: `.\scripts\validate-grading.ps1 IST.323` — one course per
> sitting, in the order IST.323, IST.466, IST.352, ECN.304, GEO.103 (lecture + recitation),
> IST.471. The script supplies the session's prompt; you answer its open rows. When all seven
> verdict files exist, run a PM session with: `/bb2dash-pm` V-1 is complete; read
> `65_GRADING_VALIDATION_SUMMARY.md`, write the reconciliation data migration in Phase 10's
> range, apply it, and open a small PR.

**V-2 — session archival and RAG hand-off** (a session in `~/agentic-harness`, not bb2dash)

> You are the PM for stream V-2 of bb2dash, working in `C:/Users/estac/agentic-harness`. Read
> `C:/Users/estac/projects/bb2dash/docs/planning/sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md` in full — it is the
> frozen contract (R-27) — then this repo's `README.md`, `docs/ingestion.md`,
> `docs/retrieval.md`, `~/.claude/hooks/session-capture.mjs`, and a sample note under the vault's
> `projects/bb2dash-retrieval/sessions/`. Confirm the five gaps in the brief still hold. Two
> Opus workers on their own branches and worktrees: W-H1 hook + vault (`feat/session-context`)
> and W-H2 pipeline + retrieval (`feat/ingest-on-capture`). The frontmatter field names in the
> brief are frozen. Tests must not drop below 261. Migrations to `harness-memory` are applied
> under the file's name and kept byte-identical. Open one PR per worker; do not merge.

**Phase 11b — planner events** (used 2026-09-16; PR #14 + #16 merged; worktrees and branches removed; 10b merged second and
regenerated `database.types.ts`.)

> `/bb2dash-pm` Start Phase 11b (planner events created in bb2dash and pushed to the `bb2dash`
> calendar). The brief `docs/planning/sprint-1-hub/briefs/69b_PHASE11B_planner_events.md` is frozen with my answers of
> 2026-09-16 (own time zone per event, optional physical or online location, working location as
> an ordinary kind, appointment slot kept, no task→assignment link, kind colour wins). Migration
> range 067–072; Phase 12 moves to 073–079. Cut `feat/planner-events-11b` from `main` in its own
> worktree, confirm the seams with whatever 10a has merged (its `run_transform` is untouched by
> this phase), spawn W-23 (db + push: 067–068, `calendar-push` v4, live proof) and W-24 (web:
> query layer, form, blocks, zone handling), integrate, run the gates, update STATUS, DECISIONS
> and ORCHESTRATOR, open the PR with a preview, and stop at "ready when you say so".

**Phase 12 — Electron shell** (ran 2026-09-16; Contract and answers in `80_`; the brief file is `80_`, not `70_`)

> `/bb2dash-pm` Start Phase 12 (R-23 Electron shell, R-26 desktop notifications). Complete the Contract section of
> `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md`: a new `desktop/` package that loads the deployed web
> app, zero renderer changes, jobs = mirror files to `course context/<course>/<bucket>/`,
> desktop notifications, Sync button that opens Windows Terminal with the sync command ready;
> no crawl, no `shell.openPath` from the mirror, no installer. Ask your open questions
> (launch-at-login default, notification sources), wait, then branch `feat/electron-12`, spawn
> workers, stop at the PR with an unpacked build I can run.

**Phase 13 — styling pass** (last, after every screen exists)

> `/bb2dash-pm` Start Phase 13 (R-21 styling). First list every screen and component in `web/`
> and confirm none is a stub. Propose three visual directions as a design canvas for me to pick
> from; wait. Then complete `docs/planning/sprint-2/parked/81_PHASE13_styling.md`, branch `feat/styling-13`, and
> spawn workers: CSS custom properties only, no Tailwind, no layout changes, no new
> dependencies. Vercel preview before the PR; stop there.

**Phase 12b — fine-tooth-comb pass** (after 12 merges, before 13)

> `/bb2dash-pm` Start Phase 12b. Read `docs/planning/sprint-1-hub/briefs/80c_PHASE12B_page_pass.md` and follow its
> Method exactly. My list of bugs and changes by page follows below. Give every item an id,
> triage it, spawn Sonnet researchers (one per page) to reproduce, locate and size, then bring me
> your questions in one batch. After my answers, write the MVP, DoD and task loops into the brief
> and stop for my approval before spawning any worker.
>
> <the list, grouped by page>

**Phase 14 — containers (R-28)** (Stack places it in sprint 2)

> `/bb2dash-pm` Start Phase 14. Read `docs/planning/sprint-2/82_PHASE14_containers.md` and the six
> `research/82_RESEARCH_phase14_*` files. Re-check R5's Electron seam against the merged
> `desktop/src/main/` code. Put the brief's open questions to me and wait. Then freeze the
> Contract, create the `bb2dash-stack` and `vault` repos with me, run task 2 (the noVNC login
> spike) as a gate before anything else, and only if it passes cut worktrees in bb2dash and
> agentic-harness, spawn W-27 / W-28 / W-29, integrate, run the gates on all three PRs, and stop
> at "ready when you say so". Keep the Windows path working until my acceptance sitting.

**Sprint 2 — planning** (added 2026-09-22 at the sprint 1 close)

> `/bb2dash-pm` Start sprint 2 planning. Read `docs/planning/sprint-2/90_SPRINT2_INTAKE.md` (the carried-in
> items) and `docs/planning/README.md` (where planning docs live now). My list of features and changes
> follows below, grouped by area. Give every item an id, add it to the intake, triage into phases, spawn
> Sonnet researchers (one per area) to size and locate, then bring me your questions in ONE batch with a
> default each. After my answers, write one brief per phase under `docs/planning/sprint-2/briefs/` with a
> frozen Contract, MVP in my words, DoD and task loops, reserve migration ranges from 091, and stop for my
> approval before spawning any worker. Phase 14 (containers) goes where I say in the list.
>
> <the list, grouped by area>
