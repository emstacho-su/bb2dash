# bb2dash — Orchestrator context

> The document a PM session loads at the start of every sitting. Call it with `/bb2dash-pm`.
> Updated with each phase PR, like STATUS and DECISIONS. Last update: **2026-09-24** (**sprint 2 planned**:
> requirements `91_REQUIREMENTS_v3.md`, research `92_*` + `93_SPRINT2_RESEARCH_SYNTHESIS.md`, phases
> `94_SPRINT2_PHASES.md`, briefs `95_`–`103_`; planning PR open on `docs/sprint2-planning`; every
> product call provisional until Stack answers the batch in `93_` §5 and approves `94_`. Before that,
> 2026-09-22: sprint 1 closed, PR #25; planning docs by sprint under `docs/planning/`, index
> `docs/planning/README.md`.)
> If STATUS and this file disagree, STATUS is the newer fact; fix this file in the same PR.

## 0. Roles and the working arrangement

* **Stack** is the product manager. He makes product calls, merges PRs, and reviews anything
  visual. He does not want to be asked mid-phase for routine decisions.
* **The PM session** (this Claude Code session, Fable) is the project manager: it reads state,
  defines the phase, writes the brief and frozen contract, spawns Opus execution subagents, and
  integrates. It never merges to `main`.
* **Opus workers** build. One per work stream, each on its own branch in its own git worktree
  (`C:/Users/estac/projects/bb2dash-wt-<name>`), cut from the phase branch. They commit and
  push to their branch; the PM merges into the phase branch.
* Other Claude sessions may be active on the repo and on prod at the same time. Fetch before
  acting, never force-push, and treat any worktree or branch you did not create as someone
  else's until proven otherwise.
* **The shared checkout `C:/Users/estac/projects/bb2dash` stays on `main` and is never branched
  or committed in.** A PM session creates its phase branch as its own worktree
  (`git worktree add C:/Users/estac/projects/bb2dash-wt-<phase> -b feat/<phase> origin/main`)
  and edits the brief there. On 2026-09-15 two PM sessions edited two briefs in that one
  working tree inside 25 seconds; nothing was lost only because one of them checked
  `git status` first.

## 1. Where the product is (one screen)

Sprint 1 closed 2026-09-22 (PRs #7–#25; migrations 026–090 live; 059 and 070–072 unused). The hub is live
on Vercel with the Blackboard → Supabase pipeline, the Classroom-style course page, the sync loop and
Inbox, the gradebook mirror and one "graded so far" figure, the planner with Google Calendar push and
recurring events, the Electron shell, and the `/inbox-apply` worker. Prod is Supabase `goultdzqcavefcgnifdy`.
The materials MCP server (`mcp-server/`) is registered at user scope from `~/.claude.json` and runs
`C:/Users/estac/projects/bb2dash/mcp-server/dist/index.js` with the service key inline in that entry
(Phase 14 moves the key to a file; `dist` predates `src` commit 57f1e2e and needs a rebuild). The harness
(`~/agentic-harness`) holds V-2 (built 2026-09-16) and the vault as git realms at `C:/Users/estac/vault`
(2026-09-23/24). Sprint 1's phase table is STATUS's "Sprint 1 record"; the record behind every phase is
`docs/planning/sprint-1-hub/`.

**Sprint 2** (planned 2026-09-24; `docs/planning/sprint-2/94_SPRINT2_PHASES.md` is the plan; requirements
`91_REQUIREMENTS_v3.md`; research `93_SPRINT2_RESEARCH_SYNTHESIS.md`, whose §5 is the question batch):

| Phase | Name | Brief | Requirements | Migrations | State |
|---|---|---|---|---|---|
| 15 | Database hygiene and the SQL test runner | `briefs/95_PHASE15_db_hygiene.md` | R-78..R-80, R-54 | 100–104 | planned; first |
| 16 | Grades: V-1 sittings and the reconciliation migration | `briefs/96_PHASE16_grades_v1.md` | R-29..R-36 | 105–109 | planned; Stack's six sittings, IST.323 before 2026-12-03 |
| 17 | Web polish: quick fixes, carried bugs, Inbox/planner leftovers, live proofs | `briefs/97_PHASE17_web_polish.md` | R-37..R-45, R-47..R-52, R-55..R-59, R-108; S2-home-1/2, S2-materials-1, S2-bugs-1 | 110–119 | planned; with 18 |
| 18 | Ingest and corpus | `briefs/98_PHASE18_ingest_corpus.md` | R-60..R-63, R-66..R-70, R-72..R-75, R-77; S2-rag-1 | 120–129 | planned; with 17 |
| 19 | Content identity, per-crawl history, sync honesty | `briefs/99_PHASE19_content_history.md` | R-38, R-41, R-64, R-65, R-71, R-76 | 130–139 | planned; after 17 and 18 |
| 14 | Containers (R-28) | `briefs/100_PHASE14_containers.md` (supersedes `82_`'s Contract) | R-81..R-96; S2-containers-1 | 091–099 | planned; the spike gates its sync half; three repos, one PR each |
| 20 | Harness closure: V-2 on record, note quality, checkpoint redaction | `briefs/101_PHASE20_harness_closure.md` | R-97..R-104, R-106 | none here | planned; harness repo; R-97 first |
| 21 | Workspace: chat routed by complexity, on the subscription | `briefs/102_PHASE21_workspace.md` | S2-workspace-1 | 140–149 | planned; after 14 |
| 22 | Styling | `briefs/103_PHASE22_styling.md` | R-53, R-46; S2-styling-1 | none | planned; last |

Outside the phases: R-109 and the state-doc refresh landed on the planning branch (Stage D); R-105 and
R-107 are harness-owned; R-96 is Phase 14's deferred list; R-87 (a scheduled sync) stays declined until
Stack adopts the reversal.

## 2. Execution order and what each phase hands to the next

```
 15 (db hygiene, runner) ──┬──► 16 (grades / V-1: Stack's sittings, own calendar)
                           ├──► 17 (web polish) ──────────────► 19 (content identity + history) ──┐
                           ├──► 18 (ingest + corpus) ─────────► 19                                │
                           └──► 14 (containers; spike gate first) ──► 21 (workspace) ──► 22 (styling, last)
 20 (harness closure) runs beside everything in the harness repo; R-97 lands first.
```

Rules that fall out of the graph:

1. **15 first and short.** Its runner, test role and `search_path` pin are what every later SQL check
   runs through; its trigger (R-54) is one migration.
2. **16, 17, 18 run in parallel** on disjoint files: 16 is Stack's sittings plus `db/`, `scripts/` and
   the grades engine's `manual.ts`; 17 is `web/` screens, the 027/063-shaped view migrations and the
   Inbox; 18 is `ingest/`, `skills/bb-sync`, `stage_files`, the search RPCs and `db/tests`. Frozen seams:
   17 owns the `v_course_stream` / `v_content_tree` migrations; 18 owns `stage_files` and the search
   functions; neither touches `stage_content` (19's, DECISIONS 2026-09-17).
3. **19 after 17 and 18** because it re-creates `stage_content`, adds the history table the Stream reads
   and redefines the transform driver (R-65); its register-first semantics are frozen before 14's
   `sync_register_run` is written.
4. **14 is the long pole** and can start with 15: the spike (R-82) gates only its sync half; its
   infrastructure half needs nothing from 16–19. It inherits 18's scripted fetch and embed step (P-36).
5. **21 after 14**, **22 last** (Stack's "cleaning" placement; the Workspace page is in 22's inventory).
6. **Migration ranges with slack**: 091–099 (14), 100–104 (15), 105–109 (16), 110–119 (17), 120–129 (18),
   130–139 (19), 140–149 (21). A phase that runs out takes the next free block of ten and records it in
   DECISIONS, never a number inside another phase's block. Every migration is additive, applied under the
   file's name, byte-identical.
7. **What each phase hands on** is the seam table in `94_SPRINT2_PHASES.md` §3.

Term calendar: week 1 = Aug 24. Weeks 9 (Oct 19–25) and 11 (Nov 2–8) are exam-heavy; week 14
is Thanksgiving; Nov 30 – Dec 13 is a code freeze. Phase 16's IST.323 sitting precedes 2026-12-03.

## 3. The per-phase cycle (what a PM session actually does)

1. **Read state.** STATUS, DECISIONS, the open PRs (`gh pr list`), `git worktree list`,
   `git fetch` — and compare `origin/main` with the local checkout. Assume another session may
   have moved things.
2. **Define the phase.** Pick from §1 in order unless Stack says otherwise. Write
   `docs/planning/sprint-<N>-<sprint>/briefs/NN_PHASE<n>_<name>.md`: why, a **frozen contract** (routes, views, RPC
   signatures, return columns, request fields, file names), the worker list with branch and
   worktree names, seams with any parallel phase, out-of-scope, integration steps, and the
   reserved migration range. Cite R-numbers from `60_REQUIREMENTS_v2.md`.
3. **Branch and worktrees.** `feat/<phase>` off `origin/main` **as its own worktree**
   (`bb2dash-wt-<phase>`), pushed; the brief is committed there, never in the shared checkout.
   One `feat/<phase>-<stream>` branch + worktree per worker, cut from the phase branch after
   the brief is committed. Park any brief draft in the session scratchpad until the worktree
   exists.
4. **Spawn Opus workers** (`Agent`, `model: "opus"`, one per stream) with the brief path, the
   rules below, and a report format capped at ~300 words. Workers apply additive migrations to
   prod via `apply_migration` under the file's name, dry-run first in `begin; … rollback;`,
   keep the repo file byte-identical, and never touch earlier migrations. Workers never touch
   `project-state/`.
5. **Integrate.** Merge worker branches into the phase branch; regenerate
   `web/src/lib/supabase/database.types.ts` when an RPC signature changed; `npm ci` if deps
   changed; run typecheck + build + tests in `web/` and `mcp-server/`; live smoke against prod
   (curl to the edge function, the `bb2dash` MCP tools).
6. **Gates.** `/code-review main high` and `/security-review`. Confirmed findings go back to
   the same workers as a numbered "round 2" section appended to the brief; re-integrate.
7. **Docs + PR.** Update STATUS, DECISIONS and this file in the same PR; open it with `gh pr
   create`; anything visual gets a Vercel preview for Stack. **Stop at "ready when you say so."**
8. **After the merge** (only on Stack's word): switch the checkout to `main`, remove the phase's
   worktrees and branches, update memory.

**Two PM sessions at once (learned 2026-09-15):** when another phase's PM session owns the main
checkout (`C:/Users/estac/projects/bb2dash`), cut the phase branch as its own worktree
(`bb2dash-wt-<phase>`) straight from `origin/main` and never commit in the shared checkout. Each
session regenerates `database.types.ts` for its own PR; the second to merge regenerates again.
Vercel is GitHub-linked, so every pushed branch already has a preview at
`web-git-<branch>-emstacho-sus-projects.vercel.app` (behind Vercel SSO: Stack opens it signed in).

**Learned in Phase 10b (2026-09-16):** a worker stream can stall (watchdog, 600 s) with hours of
uncommitted work — tell workers to commit and push per task, and on a stall make a PM checkpoint
commit on the worker's branch, then resume the same agent with `SendMessage` (its context
survives). When another phase's migrations are live but unmerged, a regenerated
`database.types.ts` carries their objects; scope the file to your own phase's objects (main's file
plus your hunks) and let the second PR to merge regenerate. Freeze shared engine types as a
PM-owned file before cutting worker branches, and give screens an engine export for any rule
they need rather than letting the web layer copy it — the copy drifted within one round.

Environment facts that bite: this machine is Stack's Windows laptop, not a sandbox — curl to
`*.supabase.co` works here (cloud sessions must use `pg_net`). Native binaries need `C:/…`
paths, not `/c/…`. Repo files are CRLF on checkout; edit with tools that preserve endings.
The `bb2dash` MCP server runs with the service key from `~/.claude.json`; never copy it into
the repo.

Learned in Phase 11b (2026-09-16):
* `generate_typescript_types` returns ~140 KB, more than a tool result can carry; the harness saves
  it as a one-line JSON file (`{"types": "…"}`). Write it out with
  `node -e` + `JSON.parse(...).types` rather than transcribing it by hand.
* A contract that renames a column a live edge function reads needs a **cut-over**: switch the
  consumer off (`gcal_enabled = false`), apply, deploy, prove one run makes zero writes to existing
  rows, switch on. Run a pre-flight first that feeds prod rows to the new code and compares hashes.
* The push has no staging calendar: web workers mock `planner_events`; a live proof inserts
  labelled test rows by SQL and deletes them in the same sitting.
* Git Bash `sed -i` strips CRLF from working-tree files. Git normalises on commit, so the diff stays
  clean, but prefer the Edit tool for docs.
* `node --test <folder>` treats the folder as one failing test; pass the `*_test.ts` files.

Learned in Phase 12b (2026-09-17):
* A list-driven phase works: ids → triage → one researcher per page → ONE batch of questions with a default each → brief → workers. Stack answered 18 questions in one message.
* Freeze a shared vocabulary file (`progress-status.ts`) on the phase branch before cutting worker branches; four workers then never touched the same constant.
* A probe that returns 200 with empty results is not proof of no data: v3's attempts endpoint was the wrong one for a student. Discover endpoints from the UI's own network log, keep key names only, delete captured bodies in the same sitting.
* When Stack wants a subsystem deleted on principle, build the comparison first: the numbers kept the engine's arithmetic and removed only the layer around it.
* Laptop sleep does not kill workers, but the watchdog can (600 s): tell workers to keep tool calls short and push per step; checkpoint-commit and `SendMessage` to resume.
* Playwright may only write screenshots under the shared checkout's `.playwright-mcp/`; copy them into the phase worktree, never leave files in the shared checkout root.
* Run the code-review gate before the last workers land, not after: its findings become a round for workers that are still warm.

Learned in Phase 12 (2026-09-17):
* A worker agent dies with its PM session. On resume: check mtimes and `ListAgents` to be sure nothing is live, make a PM checkpoint commit of the orphaned work on the worker's branch, then spawn a finisher with the commit list.
* One worker that finishes a stream can be resumed with `SendMessage` as the integrator and again for round 2; its context made the merge map and the fixes cheap.
* A JS `String.replace` with a replacement containing `$` followed by a backtick pastes the text before the match: it duplicated half the brief. Use a function replacement when writing docs from a script.
* A search-and-replace patch whose search text is LF silently matches nothing in a CRLF file; verify every scripted patch applied. That is how a test run put a real error dialog on Stack's screen.
* e2e for a desktop app must never open a modal: under the test env var, fatal paths log, record and exit non-zero.
* The packed-exe smoke caught a defect no test did (the launch tick reloading a window still on its first load). Keep the smoke in the round-2 checklist.


Learned at the sprint 1 close (2026-09-22) and in sprint 2 planning (2026-09-24):
* **Walk direct loads, not only click-throughs.** The assignment page returned 404 on a direct URL while
  every in-app click worked (S2-carry-10); an acceptance walk loads each route cold from the address bar,
  with the query cache cleared, and reads the console.
* **A skill step written as prose gets skipped — script it.** bb-sync's step 4b stayed prose for a week
  and never ran inside a sync; `/inbox-apply`'s vault path stayed an OneDrive literal after the cutover.
  A step is a script with a test, or a check the runner executes, never a paragraph.
* A planning stage stops only where Stack's input is required; everything else proceeds on stated
  defaults and is written to DECISIONS when he answers (2026-09-23).
* Fan-out subagents run on Opus (verifiers, reviewers, builders) or Sonnet (researchers); the PM session
  is Fable (2026-09-23).
* One agent cannot merge 254 items in one prompt; per-area merges with compact JSON did. Verify every
  extracted claim against the repo and prod before it becomes a requirement: 28 of 201 were refuted.

## 4. Open items that are Stack's, not the PM's

* Answer the sprint 2 question batch (`docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §5, 59
  items, each with the default the PM took) and approve the phase plan (`94_`); say where Phase 14 sits
  (default: it starts with Phase 15).
* Read the Google OAuth consent screen's publishing status; if it is still Testing, publish it and re-run
  the consent, or the calendar token dies again about 2026-10-01 17:03Z (batch item 28).
* Run Task 0's Blackboard session probes (batch item 47); the Duo remember-me window takes 14 days.
* Phase 16 sittings, IST.323 first, before 2026-12-03 (batch item 11).
* Phase 12 proofs still his: see the three toasts and click one from a banner and one from the Action
  Center; press Sync inside the shell and confirm "command copied" (batch items 57–58).
* Place ECN.304 Quiz 2 and Attendance with "Counts toward…" on the course Grades tab if the figure
  should include them.

## 5. Context the orchestrator reviews at session start

Read in this order. Each line says what the file is for and what to look for.

| # | File | Why it matters now |
|---|---|---|
| 1 | `project-state/STATUS.md` | Where the product is, what shipped last, "What's next — Sprint 2". Diff its header date against `git log -1 origin/main` to see if another session moved `main`. |
| 2 | `project-state/DECISIONS.md` (tail ~20 rows) | The newest decisions, including the 2026-09-23/24 planning rows; do not relitigate silently. |
| 3 | `docs/planning/README.md` + `docs/planning/sprint-2/90_SPRINT2_INTAKE.md` | Where every planning doc lives (numbers never restart) and the sprint's carried-in list. |
| 4 | `docs/planning/sprint-2/91_REQUIREMENTS_v3.md` §1–§4 | The R-numbers every sprint 2 brief cites; §2 the PM- and research-added steps; §3 Stack's items; §4 what stays declined. |
| 5 | `docs/planning/sprint-2/94_SPRINT2_PHASES.md` + the brief of the phase at hand (`briefs/95_`–`103_`) | The plan, the graph, the seams; the frozen Contract, MVP, DoD and task list with a deterministic check per task. |
| 6 | `docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §1 and §6; `research/92_*` for the area | What the research changed about each requirement, and the defaults taken; for Phase 14 also `82_` and `research/82_*`. |
| 7 | `CLAUDE.md` (repo root) | The SOP and the project facts, corrected 2026-09-24. |
| 8 | `DATA_SYNTAX.md` §search layer · `web/README.md` · `mcp-server/README.md` | The retrieval contract; the web scripts and type-regeneration step; the materials server's registration. |
| 9 | `gh pr list --state open` · `git worktree list` · `git branch -r` | Live state that no document captures; foreign worktrees stay untouched. |
| 10 | Auto-memory `MEMORY.md` | Session-scoped facts; verify any path or flag it names still exists. |
| 11 | For a harness phase: `~/agentic-harness/README.md`, `hooks/README.md`, `docs/portable.md`, `docs/vault-migration-requirements.md` | V-2 is built there; the vault is realms; Phase 14's C-4 is superseded by it. |

Not to read at start: `docs/planning/sprint-0-foundation/superseded/*`, the eval/POC docs unless retrieval
quality is the topic, and `docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md` (history).

## 6. Session prompts, one per session (copy-paste; sprint 2, written 2026-09-24)

Every bb2dash prompt starts with `/bb2dash-pm` so the session loads this file and runs the live-state
checks before acting. A session may run several phases with parallel Opus subagents; each prompt says
which and why. Every brief is PROVISIONAL until Stack answers `93_` §5 and approves `94_`; the prompts
assume he has. The used sprint 1 prompts are history in
`docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md`.

Every prompt starts with `/bb2dash-pm`. One session may run several phases with parallel Opus
subagents; the prompt says which and why. Each stops at "ready when you say so". Every brief is
PROVISIONAL until Stack answers `93_` §5 and approves `94_`; the prompts assume he has.

**Session A — Phase 15 then Phase 16** (one session: 15 is a morning and 16's first tasks reuse its runner)

> `/bb2dash-pm` Start Phase 15 (R-78, R-79, R-80, R-54; brief `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md`,
> migrations 100–104). Cut `feat/db-hygiene-15` from `origin/main` as its own worktree, spawn the workers the brief
> names (Opus), run every task's check, integrate, run `/code-review main high` and `/security-review`, update
> STATUS, DECISIONS and ORCHESTRATOR, open the PR and stop. Then, without merging, start Phase 16 in a second
> worktree cut from `origin/main` (R-29..R-36; `96_PHASE16_grades_v1.md`, migrations 105–109): fix the launcher,
> regenerate the export from a committed query, run the invariants baseline through Phase 15's runner (on its
> branch until it merges), and stop before sitting 1 with the exact `validate-grading` command for me. I run
> the sittings (IST.323 first); after each one you spot-check three citations, and after the sixth you write
> the reconciliation migration, run the invariants again, and open the PR.

**Session B — Phases 17 and 18 in parallel, then 19** (disjoint files: web/ vs ingest/ + stage_files; 19 needs both merged)

> `/bb2dash-pm` Start Phases 17 and 18 together. Cut `feat/web-polish-17` and `feat/ingest-corpus-18` from
> `origin/main` as two worktrees; the seams are frozen in `94_SPRINT2_PHASES.md` §3 (17 owns the
> `v_course_stream` / `v_content_tree` migrations 110–119, 18 owns `stage_files` and the search RPCs in
> 120–129, neither touches `stage_content`). Spawn each brief's workers (Opus) in their own worktrees, run
> every deterministic check, integrate each phase on its branch, run the gates, open two PRs with Vercel
> previews, and stop. Book the one logged-in probe sitting (P-27) and the proofs sitting (R-47, R-55, R-59,
> R-108) with me before the PRs. When both are merged (my word), start Phase 19 (`99_PHASE19_content_history.md`,
> 130–139) on their seams the same way.

**Session C — Phase 14, then Phase 21** (three repos; 21 reuses 14's container, token and MCP image)

> `/bb2dash-pm` Start Phase 14 (R-81..R-96; `100_PHASE14_containers.md`, which supersedes `82_`'s Contract;
> migrations 091–099). First put the brief's open items to me and wait; then create `bb2dash-stack` with me,
> run the noVNC login spike (R-82) as a gate before any sync-side task, and only if it passes cut
> `feat/containers-14` in bb2dash and `feat/containers` in agentic-harness as worktrees, spawn the workers
> (Opus), integrate, run the gates on all three PRs (one per repo, recorded in DECISIONS), and stop. Keep the
> Windows path working until my acceptance sitting. After the merge, start Phase 21 (`102_PHASE21_workspace.md`,
> 140–149) as a fourth service in the umbrella, read-only tools only, on my subscription token.

**Session D — Phase 20** (harness repo; can run first of all: R-97 is a live bug)

> You are the PM for Phase 20 of bb2dash, working in `C:/Users/estac/agentic-harness` with the bb2dash worktree
> beside it. Read `C:/Users/estac/projects/bb2dash/docs/planning/sprint-2/briefs/101_PHASE20_harness_closure.md`
> in full. Fix R-97 first (the `/inbox-apply` vault path) on a bb2dash branch and open its PR the same day.
> Then the harness work on `feat/v2-closure`: the phase-spelling decision, the tags fixture, the backfill pass,
> the checkpoint redaction payload, the untagged cadence; walk the V-2 acceptance list live and write the
> verification note under `docs/planning/sprint-2/verification/`. Migrations to `harness-memory` under the
> file's name, byte-identical. One PR per repo; do not merge.

**Session E — Phase 22** (last, after every screen exists)

> `/bb2dash-pm` Start Phase 22 (R-53, R-46; `103_PHASE22_styling.md`). First list every route and shared
> component in `web/` (the Workspace page included) and confirm none is a stub; land the token audit as a
> test-only ratchet if Phase 17 did not; propose three style tiles as Artifact pages with a live toggle and
> wait for my pick. Then cut `feat/styling-22`, spawn workers (CSS custom properties only, no Tailwind, no
> new dependencies, no layout change except C-1 and the toggle), walk every screen light and dark on the
> preview, and stop at the PR.

