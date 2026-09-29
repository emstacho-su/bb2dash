# bb2dash — Orchestrator context

> The document a PM session loads at the start of every sitting. Call it with `/bb2dash-pm`.
> Updated with each phase PR, like STATUS and DECISIONS. Last update: **2026-09-27** (PR #28 merged as 67269b5; the briefs verified in three
> rounds, record `105_BRIEF_VERIFICATION_2026-09-27.md`; §6's prompts rewritten to them). Before that, **2026-09-24** (**sprint 2 planned**:
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
  (`C:/Users/stack/projects/bb2dash-wt-<name>`), cut from the phase branch. They commit and
  push to their branch; the PM merges into the phase branch.
* Other Claude sessions may be active on the repo and on prod at the same time. Fetch before
  acting, never force-push, and treat any worktree or branch you did not create as someone
  else's until proven otherwise.
* **The shared checkout `C:/Users/stack/projects/bb2dash` stays on `main` and is never branched
  or committed in.** A PM session creates its phase branch as its own worktree
  (`git worktree add C:/Users/stack/projects/bb2dash-wt-<phase> -b feat/<phase> origin/main`)
  and edits the brief there. On 2026-09-15 two PM sessions edited two briefs in that one
  working tree inside 25 seconds; nothing was lost only because one of them checked
  `git status` first.

## 1. Where the product is (one screen)

Sprint 1 closed 2026-09-22 (PRs #7–#25; migrations 026–090 live; 059 and 070–072 unused). The hub is live
on Vercel with the Blackboard → Supabase pipeline, the Classroom-style course page, the sync loop and
Inbox, the gradebook mirror and one "graded so far" figure, the planner with Google Calendar push and
recurring events, the Electron shell, and the `/inbox-apply` worker. Prod is Supabase `goultdzqcavefcgnifdy`.
The materials MCP server (`mcp-server/`) is **not yet registered on `stack-laptop`** (2026-09-29): on the old
machine it ran at user scope from `~/.claude.json` as `C:/Users/stack/projects/bb2dash/mcp-server/dist/index.js`
with the service key inline in that entry; here `dist` is not built and `~/.claude.json` has no `bb2dash` entry
(`mcp-server/README.md` §Setup; Phase 14 moves the key to a file; Phase 16's sittings need it first). The harness
(`~/agentic-harness`) holds V-2 (built 2026-09-16) and the vault as git realms at `C:/Users/stack/vault`
(2026-09-23/24). Sprint 1's phase table is STATUS's "Sprint 1 record"; the record behind every phase is
`docs/planning/sprint-1-hub/`.

**Sprint 2** (planned 2026-09-24; `docs/planning/sprint-2/94_SPRINT2_PHASES.md` is the plan; requirements
`91_REQUIREMENTS_v3.md`; research `93_SPRINT2_RESEARCH_SYNTHESIS.md`, whose §5 is the question batch):

| Phase | Name | Brief | Requirements | Migrations | State |
|---|---|---|---|---|---|
| 15 | Database hygiene and the SQL test runner | `briefs/95_PHASE15_db_hygiene.md` | R-78..R-80, R-54 | 100–104 | planned; first |
| 16 | Grades: V-1 sittings and the reconciliation migration | `briefs/96_PHASE16_grades_v1.md` | R-29..R-36 | 105–109 | planned; Stack's six sittings, IST.323 before 2026-12-03 |
| 17 | Web polish: quick fixes, carried bugs, Inbox/planner leftovers, live proofs | `briefs/97_PHASE17_web_polish.md` | R-37, R-39 (interim), R-40, R-42..R-45, R-47..R-52, R-55..R-59, R-108; S2-home-1/2, S2-materials-1, S2-bugs-1 | 110–119 | planned; with 18 |
| 18 | Ingest and corpus | `briefs/98_PHASE18_ingest_corpus.md` | R-60..R-63, R-66..R-70, R-72..R-75, R-77; S2-rag-1 | 120–129 | planned; with 17 |
| 19 | Content identity, per-crawl history, sync honesty | `briefs/99_PHASE19_content_history.md` | R-38, R-41, R-64, R-65, R-71, R-76 | 130–139 | planned; after 17 and 18 |
| 14 | Containers (R-28) | `briefs/100_PHASE14_containers.md` (supersedes `82_`'s Contract) | R-81..R-96; S2-containers-1 | 091–099 | planned; the spike gates its sync half, whose workers (W-55, W-56) also wait for 15, 18 and 19 on `main`; three repos, one PR per repo plus the early `syncLauncher` PR (B-51) |
| 20 | Harness closure: V-2 on record, note quality, checkpoint redaction | `briefs/101_PHASE20_harness_closure.md` | R-97..R-104, R-106 | none here | planned; harness repo plus bb2dash, three PRs (PR-A for R-97 first, PR-B harness, PR-C bb2dash docs) |
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
 20 (harness closure) runs beside everything, in the harness repo plus two bb2dash PRs; R-97 lands first.
```

Rules that fall out of the graph:

1. **15 first and short.** Its runner, test role and `search_path` pin are what every later SQL check
   runs through; its trigger (R-54) is one migration.
2. **16, 17, 18 run in parallel** on disjoint files, except the named hunks 17 and 18 share (`CourseScreen.tsx`;
   §6 Session B notes where briefs 97 and 98 differ): 16 is Stack's sittings plus `db/`, `scripts/`,
   `skills/inbox-apply/SKILL.md` and the grades files in `web/` (R-36's rule line; `manual.ts` only if Stack
   asks for a rule, brief 96 open item 1); 17 is `web/` screens, the 027/063-shaped view migrations and the
   Inbox; 18 is `ingest/`, `skills/bb-sync`, `stage_files`, the search RPCs and `db/tests`. Frozen seams:
   17 owns the `v_course_stream` / `v_content_tree` migrations; 18 owns `stage_files` and the search
   functions; neither touches `stage_content` (19's, DECISIONS 2026-09-17).
3. **19 after 17 and 18** because it re-creates `stage_content`, adds the history table the Stream reads
   and redefines the transform driver (R-65); its register-first semantics are frozen before 14's
   `sync_register_run` is written.
4. **14 is the long pole** and can start with 15: task 1's freeze and Task 0's probes (B-47: start now)
   come first, the spike (R-82, task 4) gates its sync half, and W-57 (harness jobs) and W-58 (umbrella,
   dev container) may be cut after task 1. W-55 (sync runner and database) and W-56 (images, MCP, desktop,
   repo hygiene) are cut only after the spike's PASS, with 15, 18 and 19 on `main` (brief 100). It
   inherits 18's scripted fetch and embed step (P-36) and 19's register-first driver.
5. **21 after 14**, **22 last** (Stack's "cleaning" placement; the Workspace page is in 22's inventory).
6. **Migration ranges with slack**: 091–099 (14), 100–104 (15), 105–109 (16), 110–119 (17), 120–129 (18),
   130–139 (19), 140–149 (21). A phase that runs out takes the next free block of ten and records it in
   DECISIONS, never a number inside another phase's block. Every migration is additive, applied under the
   file's name, byte-identical.
7. **What each phase hands on** is the seam table in `94_SPRINT2_PHASES.md` §3.

~~Term calendar: week 1 = Aug 24. Weeks 9 (Oct 19–25) and 11 (Nov 2–8) are exam-heavy; week 14
is Thanksgiving;~~ nothing is paced by week (2026-09-27: no date-paced tasks, DECISIONS). Two term-calendar bounds stand:
Nov 30 – Dec 13 is a code freeze (no merge and no prod apply inside it; it stands, DECISIONS 2026-09-27), and
Phase 16's migration 106 is on prod before the IST.323 column is graded (2026-12-03), which the freeze makes
before Nov 30. `docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md`'s header lists every outside bound.

## 3. The per-phase cycle (what a PM session actually does)

1. **Read state.** STATUS, DECISIONS, the open PRs (`gh pr list`), `git worktree list`,
   `git fetch` — and compare `origin/main` with the local checkout. Assume another session may
   have moved things.
2. **Define the phase.** Pick from §1 in order unless Stack says otherwise. Write
   `docs/planning/sprint-<N>-<sprint>/briefs/NN_PHASE<n>_<name>.md`: why, a **frozen contract** (routes, views, RPC
   signatures, return columns, request fields, file names), the worker list with branch and
   worktree names, seams with any parallel phase, out-of-scope, integration steps, and the
   reserved migration range. Cite R-numbers from the sprint's requirements file (sprint 2:
   `docs/planning/sprint-2/91_REQUIREMENTS_v3.md`).
3. **Branch and worktrees.** `feat/<phase>` off `origin/main` **as its own worktree**
   (`bb2dash-wt-<phase>`), pushed; the brief is committed there, never in the shared checkout.
   One `feat/<phase>-<stream>` branch + worktree per worker, cut from the phase branch after
   the brief is committed. Park any brief draft in the session scratchpad until the worktree
   exists.
4. **Spawn Opus workers** (`Agent`, `model: "opus"`, one per stream) with the brief path, the
   rules below, and a report format capped at ~300 words. Workers (or the PM, where the brief's
   §Workers says so: Phases 16 and 17) apply additive migrations to prod via `apply_migration`
   under the file's name, dry-run first in `begin; … rollback;`,
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
checkout (`C:/Users/stack/projects/bb2dash`), cut the phase branch as its own worktree
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

* ~~Answer the sprint 2 question batch (`docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §5, 59
  items, each with the default the PM took) and approve the phase plan (`94_`); say where Phase 14 sits
  (default: it starts with Phase 15).~~ Done by delegation 2026-09-27 (DECISIONS rows of that date; Phase 14 starts
  with Phase 15). Stack may still overturn any row by saying so; the phase's PM then rewrites the B-table row.
* **Hold the Inbox "Apply answers" button and `/bb-sync` until Phase 20's PR-A (R-97) merges:** `/inbox-apply` still
  writes its decision notes to the OneDrive stub, not the realm vault (inbox-541..544.md landed there on 2026-09-27);
  the PM copies those four notes into the realm when PR-A lands (brief 101 §Seams). Found by the 2026-09-27 decision panel.
  On `stack-laptop` there is no OneDrive stub: the 2026-09-29 run (request 186) wrote inbox-752..756 straight into the
  realm `C:/Users/stack/vault/projects/bb2dash/decisions/`, so PR-A's copy covers only the four notes from the old machine.
* Task 0's Blackboard session probes **started 2026-09-29 15:25Z** (baseline `200`): the record `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` holds
  the baseline row; once a login is confirmed the PM spawns idle probes periodically, self-paced, for as long as the login lives (your call 2026-09-29: not an hourly clock), each read-only through Claude in Chrome and written as a row (batch item 47; brief 100
  Task 0). Your part: keep the Chrome extension connected, the Blackboard tab open and the laptop awake while the idle series runs,
  and let the reopen probes happen on their days. "Stay signed in?" is **yes**, always (your standing rule, 2026-09-29).
* Name the presentation slot whenever you know it; each B-9 answer must land before the day it names (9/30 is the
  earliest candidate slot), a bound, not pacing (batch item 9): whether 11/4 was the SITN pick or the individual slot,
  and which individual slot is yours (9/30, 10/14, 10/26, 11/4 or 11/16); each answer goes in as an Inbox value resolution.
* The Google OAuth consent screen **stays in Testing for now** (your call, 2026-09-29; you know how to publish it):
  the calendar token dies again about 2026-10-01 17:03Z, and you re-mint with `scripts/google-consent.mjs` when the
  push starts failing, or publish first and then re-mint (batch item 28; DECISIONS 2026-09-29).
* Phase 16's six sittings as fast as you can sit them, in the order IST.323, IST.466, IST.352, ECN.304, GEO.103,
  IST.471; migration 106 on prod before the Nov 30 – Dec 13 code freeze (the IST.323 column is graded inside it, 2026-12-03)
  is the one bound (brief 96 open item 4; batch item 11; no date-paced tasks, the freeze stands, DECISIONS 2026-09-27).
* Say whether the Nov 30 – Dec 13 code freeze still stands. Default: it stands, as a window, not pacing (DECISIONS
  2026-09-27, no-date-paced-tasks row). If you strike it, migration 106's bound becomes 2026-12-03 and B-6's window goes.
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
| 5 | `docs/planning/sprint-2/94_SPRINT2_PHASES.md` + `docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` + the brief of the phase at hand (`briefs/95_`–`103_`) + `docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md` §3 | The plan, the graph, the seams; the run sheet (which run is next, its gate, concurrency, checklists, fallbacks; no calendar); the frozen Contract, MVP, DoD and task list with a deterministic check per task; that brief's residual round-3 notes, fixed or struck in the phase's own PR before workers are cut. |
| 6 | `docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §1 and §6; `research/92_*` for the area | What the research changed about each requirement, and the defaults taken; for Phase 14 also `82_` and `research/82_*`. |
| 7 | `CLAUDE.md` (repo root) | The SOP and the project facts, corrected 2026-09-24. |
| 8 | `DATA_SYNTAX.md` §search layer · `web/README.md` · `mcp-server/README.md` | The retrieval contract; the web scripts and type-regeneration step; the materials server's registration. |
| 9 | `gh pr list --state open` · `git worktree list` · `git branch -r` | Live state that no document captures; foreign worktrees stay untouched. |
| 10 | Auto-memory `MEMORY.md` | Session-scoped facts; verify any path or flag it names still exists. |
| 11 | For a harness phase: `~/agentic-harness/README.md`, `hooks/README.md`, `docs/portable.md`, `docs/vault-migration-requirements.md` | V-2 is built there; the vault is realms; Phase 14's C-4 is superseded by it. |

Not to read at start: `docs/planning/sprint-0-foundation/superseded/*`, the eval/POC docs unless retrieval
quality is the topic, and `docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md` (history).

## 6. Session prompts, one per phase in five sessions (copy-paste; sprint 2, rewritten 2026-09-27 to the verified briefs)

One prompt per phase, grouped into the five sessions below; a session pastes its prompts in the order shown, when
its heading says. The order to run them, concurrency, checklists and fallbacks are in
`docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` (no calendar). The bb2dash prompts (A1, A2, B1, B2, B3, C1, C2, E) start with `/bb2dash-pm` so the session loads
this file and runs the live-state checks before acting; Session D runs in the harness repo, so its prompt starts by
naming `C:/Users/stack/agentic-harness`. Every brief was PROVISIONAL until Stack answered `93_` §5 and approved `94_`, which he did by delegation on 2026-09-27 (DECISIONS rows of that date);
the prompts carry the PROVISIONAL line, and each phase's PM first records whatever answers he has given against its
brief's B-table. Before cutting workers, the phase's PM reads that brief's residual notes in
`docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md`
§3 and fixes or strikes each one in the phase's own PR. The used sprint 1 prompts are history in
`docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md`.

**Session A — Phase 15 then Phase 16** (one session: 15 is size S/M; paste A2 once 15's PR is open, without waiting for its merge, since 16's SQL checks run through 15's runner from its branch)

A1 — Phase 15

> `/bb2dash-pm` Start Phase 15: `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md`, R-78, R-79, R-80, R-54.
> PROVISIONAL until I answer 93 §5 (B-41, B-42, B-16) and approve 94: rewrite §Stack's calls to my answers and show me
> any task whose check changed. Nothing gates it; it runs first. Create worktree `bb2dash-wt-15` on
> `feat/db-hygiene-15` from `origin/main`, cut the three worker worktrees and spawn W-38, W-39, W-40 (Opus) on their
> disjoint files, every check failing first where its row says so. Migrations 100–104 only; one PR, no exception taken;
> nothing visual, so no Vercel preview walk. Stop when 100 is on prod and put acceptance step 1's snippet on my
> clipboard (task 5): I set the `db_test_runner` password and write `.env.local`. After my `--ping` passes, finish
> tasks 6–19 and 21–24 and open the PR. I then run steps 2–4, read the advisors (step 5), open the signups setting for
> your screenshot (step 6, task 20) and read the six DECISIONS rows (step 7). Change no Auth setting.
> Stop at "ready when you say so".

A2 — Phase 16

> `/bb2dash-pm` Start Phase 16 without waiting for Phase 15's merge: `docs/planning/sprint-2/briefs/96_PHASE16_grades_v1.md`,
> R-29, R-30, R-31, R-32, R-33, R-34, R-35, R-36. PROVISIONAL until I answer 93 §5 (B-9, B-10, B-11, B-12, B-13,
> B-14, B-15, B-16, plus B-23 and B-42) and approve 94. Worktree `bb2dash-wt-16` on `feat/grades-v1-16` from
> `origin/main`; W-41, W-42, W-43 (Opus); migrations 105–109; one PR, no exception taken (open item 4 names the one
> contingency). Gate: every SQL check runs through Phase 15's runner, from 15's branch until it merges; apply 105
> only after 100–104 are on prod and task 10a's commit is on `feat/db-hygiene-15` (if 15 has merged without 10a, ask
> me before task 10). Run tasks 1–15, then stop with `.\scripts\validate-grading.ps1 IST.323` on my clipboard. I
> launch it (step 2) and sit six courses as fast as I can, in the order IST.323, IST.466, IST.352, ECN.304,
> GEO.103, IST.471; migration 106 on prod before the Nov 30 – Dec 13 code freeze (the IST.323 column is graded inside it,
> 2026-12-03) is the one bound. You spot-check three citations after each. After
> sitting 6, write 106, rerun the invariants and open the PR with a preview. I walk step 1 and steps 5–10 (step 9
> after ECN.304 Exam 1 posts).
> Stop at "ready when you say so".

**Session B — Phases 17 and 18 in parallel, then 19** (paste B1 and B2 one after the other: each phase in its own worktrees, seams frozen in `94_` §2 rule 2 and §3; paste B3 once both are merged, because 19 builds on both)

B1 — Phase 17

> `/bb2dash-pm` Start Phase 17 beside Phase 18 (B2, this session): `docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md`,
> R-37, R-39 (the interim hide only), R-40, R-42, R-43, R-44, R-45, R-47, R-48, R-49, R-50, R-51, R-52, R-55, R-56,
> R-57, R-58, R-59, R-108; S2-home-1, S2-home-2, S2-materials-1, S2-bugs-1. PROVISIONAL until I answer 93 §5 (B-1,
> B-2, B-3, B-7, B-17, B-19, B-20, B-21, B-22, B-23, B-25, B-26, B-27, B-28, B-29, B-30, B-31, B-57, B-58; and B-42
> through Phase 15) and approve 94. Gate: Phase 15's runner on `main`. Ask me B-7's "anything else?" once. Worktree
> `bb2dash-wt-17` on `feat/web-polish-17`; W-44..W-47 (Opus); migrations 110–119 (110–117 used). One PR, no
> exception of its own; Phase 22's test-only tasks 1–2 may ride it as 22's commits under brief 103's B-6 exception,
> whose DECISIONS row is written the day I answer B-6. My sittings (acceptance steps 8–11): the desktop shell (T-24),
> the production planner and staging walk (T-26), and the consent-screen read before 2026-10-01 17:03Z (T-27; a bound, not pacing); then
> acceptance steps 1–7 and 12 on the preview. Stop at "ready when you say so".

B2 — Phase 18

> `/bb2dash-pm` Start Phase 18 beside Phase 17 (B1): `docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md`,
> R-60, R-61, R-62, R-63, R-66, R-67, R-68, R-69, R-70, R-72, R-73, R-74, R-75, R-77; S2-rag-1. PROVISIONAL until I
> answer 93 §5 (B-8, B-32, B-33, B-34, B-35, B-36, B-37, B-38, B-40; and B-42 through Phase 15) and approve 94. Gate:
> Phase 15 merged and `node scripts/db-test.mjs` exits 0 on `main`. Worktree `bb2dash-wt-18` on `feat/ingest-corpus-18`;
> W-48, W-49, W-50, W-51 (Opus), with `.env.local` copied into each worktree, `npm --prefix scripts ci` run there and
> `--ping` passing (L3); migrations 120–129; one PR, no exception taken. Stop when tasks 2–5 and 15 are on the phase
> branch: I run the sync gate (task 16) by
> hand from `bb2dash-wt-18`, never with the desktop Sync button, and stay for the probe sitting. Stop again when task
> 18 is on the branch (unless B-36's fallback ran): I run the second sync (L7). Then finish tasks 17–29, walk the
> preview into `walks/walk-18/` and open the PR; I walk the acceptance script on the preview. Merge and the `search`
> redeploy only on my word. Stop at "ready when you say so".

(brief 97 §Seams says Phase 17 edits neither `AssignmentDetailBody.tsx` nor `PlannerItemPopover.tsx` and shares `CourseScreen.tsx` with 18 in named hunks; brief 98 §Seams says both phases touch all three, named hunks only. Brief 97 also shares W-47's `queries.announcements.ts`, `Bell.tsx` and the not-recorded cases of `Bell.test.tsx` under B-36's fallback, and `DATA_SYNTAX.md` in separate sections.)

B3 — Phase 19

> `/bb2dash-pm` Start Phase 19: `docs/planning/sprint-2/briefs/99_PHASE19_content_history.md`, R-38, R-41 (run
> states and the per-stream read), R-64, R-65, R-71, R-76. PROVISIONAL until I answer 93 §5 (B-18, B-19, B-20, B-39,
> and B-42 through Phase 15's test role) and approve 94. Gate: Phases 17 and 18 merged to `main`, with Phase 15's
> runner. B-19's ghost merge and B-20's terminal rule are PM picks: build them only on my explicit yes. Re-measure S₀,
> D₀ and N₀ (task 3) and files 17 and 19 (task 4) on prod. Worktree `bb2dash-wt-content-history-19` on
> `feat/content-history-19`; W-52, W-53, W-54 (Opus); migrations 130–139; one PR, no exception. I run the first
> register-first sync (task 27). Open the PR with its Vercel preview; I walk the acceptance script there, one sync
> interrupted on purpose (step 5) included, and read the nine DECISIONS rows. Stop at "ready when you say so".

(brief 95 §Out of scope says R-41's run-state UI is Phase 17's; briefs 97 §Out of scope and 99 give R-41's run states, UI included, to Phase 19.)

**Session C — Phase 14, then Phase 21** (three repos; paste C1 as soon as Phase 15 starts, per `94_` §2 rule 4 and §6's default (Phase 14 starts with 15); paste C2 after Phase 14 merges: 21 reuses 14's container, token and MCP image)

C1 — Phase 14

> `/bb2dash-pm` Start Phase 14: `docs/planning/sprint-2/briefs/100_PHASE14_containers.md` (it supersedes `82_`'s
> Contract), R-81, R-82, R-83, R-84, R-85, R-86, R-87 (conditional on B-45), R-88, R-89, R-90, R-91, R-92, R-93,
> R-94, R-95, R-96 (the deferred list); S2-containers-1. PROVISIONAL until I answer 93 §5 (B-4, B-43, B-44, B-45,
> B-46, B-47, B-48, B-49, B-50, B-51; its live SQL on Phase 15's B-42) and approve 94. Put open items 1–6 to me;
> task 1 then freezes it in eleven DECISIONS rows (ten if open item 6 or B-42 drops 094), row (5) the exception: one
> PR per repo, plus the early `syncLauncher` PR. Branches `feat/containers-14` (bb2dash), `feat/containers` (agentic-harness),
> `feat/containers-14-stack` (bb2dash-stack, which I create first); worktree `bb2dash-wt-containers-14`;
> W-55..W-58 (Opus); migrations 091–099. W-57 and W-58 may be cut after task 1; the noVNC spike (task 4) gates every
> sync-side task, and W-55 and W-56 wait for its PASS with Phases 15, 18 and 19 on `main`. My stops: Task 0 probes
> (task 3), the spike's Duo login, open item 4's machine steps, the MCP key move (task 17), the stale `bb-course-*`
> copies (task 19), the live proofs (task 28), the launcher PR merged before A1, then A1–A9 across at least one night.
> The Windows path keeps working until then. Nothing in `web/`, so no Vercel preview: show me `walks/walk-14/` before
> merging. Stop at "ready when you say so".

C2 — Phase 21

> `/bb2dash-pm` Start Phase 21: `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`, S2-workspace-1.
> PROVISIONAL until I answer 93 §5 (B-5; and B-42, B-48, B-51 through Phases 15 and 14) and approve 94. Gate: task
> 1's seam gate, Phases 14 and 15 merged to `main`; then put open items O-1..O-5 to me, with B-5 if unanswered, and
> wait. Worktree `bb2dash-wt-21` on `feat/workspace-21`, and `feat/workspace-21` in bb2dash-stack; W-63..W-66 (Opus);
> migrations 140–149. One PR per repo, the same exception Phase 14 takes under B-51 (its row, written at 14's freeze;
> task 24 records this phase's); until that row exists, the bb2dash-stack change is a second PR opened after this
> one, not beside it. The Realtime spike (task 5) gates the transport, in my logged-in preview. Hand me the one
> `workspace_runner` password line before task 12's health check (task 19); never put it in a file. Walk the preview
> and the desktop shell and open both PRs with the preview link; after Phase 14's acceptance I walk the acceptance
> script, read the D-1 reversal and acceptance rows and say "accepted". Stop at "ready when you say so".

**Session D — Phase 20** (the harness repo plus two bb2dash PRs; can run first of all: R-97 is a live bug)

> You are the PM for Phase 20 of bb2dash, working in `C:/Users/stack/agentic-harness` with bb2dash beside it. Read
> `C:/Users/stack/projects/bb2dash/docs/planning/sprint-2/briefs/101_PHASE20_harness_closure.md` in full: R-97, R-98,
> R-99, R-100 (the home-pc half), R-101, R-102, R-103, R-104, R-106. PROVISIONAL until I answer 93 §5 (B-52, B-53,
> B-54, B-55, B-56) and approve 94. First record my 93 §5 answers against the brief's B-table; before cutting workers,
> read its residual notes in `C:/Users/stack/projects/bb2dash/docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md`
> §3, then fix or strike each in PR-C, cut after `docs/sprint2-planning` merges. Nothing gates the start; until that
> merge, read both files in `C:/Users/stack/projects/bb2dash-wt-sprint2-plan`. First: R-97 on bb2dash
> `fix/inbox-apply-vault-20` in `bb2dash-wt-inbox-vault-20`, PR-A opened before anything else; until it merges I hold Apply
> answers and `/bb-sync`. Then
> agentic-harness `feat/v2-closure` in `C:/Users/stack/agentic-harness-wt-v2-closure` (PR-B) and bb2dash
> `docs/harness-closure-20` in `bb2dash-wt-harness-closure-20` (PR-C); W-59, W-60, W-61, W-62 (Opus). Migrations: none
> in bb2dash. Three PRs, an exception to one PR per phase that needs its own DECISIONS row at the freeze.
> Tasks 17–19, 21–26 wait for PR-B's merge and three consecutive nightly runs logging `committed -> pulled -> pushed`
> (or up-to-date) for both realms. My stops: `gitleaks` installed (task 20), then acceptance steps 1–9: Apply
> answers after PR-A merges, the hook reinstall (L20-a), "go L20-b" after the dry run, the credential test, the
> resume chain, a cloud `/checkpoint`, and my word on `101a`.
> Stop at "ready when you say so".

(brief 96 §Seams and brief 101 §Seams agree: whichever of Phases 16 and 20 lands second merges `main` into its branch and re-applies its `skills/inbox-apply/SKILL.md` lines, never rebasing a pushed branch.)

**Session E — Phase 22** (last, after every screen exists)

> `/bb2dash-pm` Start Phase 22: `docs/planning/sprint-2/briefs/103_PHASE22_styling.md`, R-53, R-46; S2-styling-1.
> PROVISIONAL until I answer 93 §5 (B-6, B-23, B-24) and approve 94. Gate: Phases 16, 17, 18, 19, 14 and 21 merged,
> so every screen exists (task 4), `web/src/app/(app)/workspace/page.tsx` included; check whether tasks 1–2 already
> rode Phase 17's PR (if not, they are this branch's first commits). Put open items 1–5 to me and wait. Worktree
> `bb2dash-wt-22` on `feat/styling-22`; W-67..W-70 (Opus); migrations: none. One PR; its one exception is tasks 1–2
> riding Phase 17's PR, whose DECISIONS row is written the day I answer B-6. W-67's task 3 and W-68's task 5 (RED on
> its first preview) first; publish the three style tiles (task 6) and wait for my pick (task 7) while W-68..W-70 do
> tasks 12–15; task 8 gates the sweeps. Run `login.mjs` against each preview before its first harness run (the
> task-list preamble); walk both specs on the phase preview with `WALK_SHOTS=1`, run the gates and open the PR with
> the preview and `WALK.md`; I walk the acceptance script: the theme control, 58 surface lines, 390 px, the Menu, the
> desktop build with Windows in light mode. Stop at "ready when you say so".

