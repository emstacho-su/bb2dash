# bb2dash — Orchestrator context

> The document a PM session loads at the start of every sitting. Call it with `/bb2dash-pm`.
> Updated with each phase PR, like STATUS and DECISIONS. Last update: **2026-10-07** (Phase 21, the Workspace, was built on `feat/workspace-21` in bb2dash and bb2dash-stack, walked by the PM and merged on Stack's word on 2026-10-07, bb2dash #78 then bb2dash-stack #3, before his acceptance walk: migrations 140–143 live and byte-identical, the image built, proven and running as test project `bb2dash-wt21`, every review run with no HIGH or MEDIUM finding left open (runner fix round Z merged, ruling Z1 in 102a; bb2dash-stack's S-1 fixed), the PM's walk done in two sittings on 2026-10-07 with two layout defects found on the real screen and fixed; next Stack's 15-step acceptance after Phase 14's own, with six things put to him; §1 row 21, §2 rules 5 and 6, §3 "Learned in Phase 21", §4, §6 D2). Before that, **2026-10-04** (Phase 14 merged 2026-10-04 on Stack's word, all four PRs, before acceptance; the sync container is live with his login; A1–A9 is his, in one sitting; §1 row 14, §4). Before that, **2026-10-03, evening** (sprint 2 audit `docs/planning/sprint-2/108_SPRINT2_AUDIT_2026-10-03.md`: §1 and §4 corrected to what `main` and prod show; Phase 14 is in flight in its own session with the container runner live against prod; Phase 18's owed list re-read against the syncs since 10-01; Stack's queue consolidated in 108 §5). Before that, **2026-10-03** (Phase 19 **merged 2026-10-03** on Stack's word as PR #60, 206ee3a, production deployed; worktrees and branches removed: migrations 130–139 and 170–172 live and md5-identical (138–139 round 2; 170–171 round 3 and 172 round 4 in the overflow block 170–179, DECISIONS); the PM drove it to the end with a self-paced loop over the task ledger `verification/99_PHASE19_LEDGER.md`, on Stack's 2026-10-03 word; task 27, the first register-first sync, is his next Sync). Before that, **2026-09-30** (Phase 20: PR-A #39 and harness PR-B #36 (+ #37) merged, PR-C open; V-2 walked in `101a_V2_VERIFICATION.md`, closed closed on Stack's word 2026-09-30; Session A's status in §6). Before that, **2026-09-30** (Phase 18 merged on Stack's word "merge this phase" **before its gate sync**: migrations 120–129 live, 160 opening Phase 18's overflow block 160–169 for the review fix; tasks 16–19, 26, 28 and task 14's 48 h re-read owed to the first `/bb-sync` on `main`, which is now the gate; Phase 17 merged as PR #43). Before that, **2026-09-30** (Phase 17 built on `feat/web-polish-17`, PR open, not merged: migrations 110–119 and 150 live and md5-identical, 150 opening Phase 17's overflow block 150–159; round-3 walk 24/24 on the preview; waiting on Stack's T-24 and T-26 sittings and his look at round 3). Before that, **2026-09-29** (PRs #30 Phase 15, #31 logon build + the `estac` → `stack` path pass, and #32 sync file pull merged on Stack's word; R1 done and its gate-out green on `main`, so R3 and R4 are open; every live path reads `C:/Users/stack/...`; Task 0 started 15:25Z). Before that, **2026-09-27** (PR #28 merged as 67269b5; the briefs verified in three
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
The materials MCP server (`mcp-server/`) is registered on `stack-laptop` at user scope from `~/.claude.json` as
`C:/Users/stack/projects/bb2dash/mcp-server/dist/index.js` with the service key inline in that entry, read from the
gitignored `.env` at registration (2026-09-29: `dist` built, 88 unit tests, `npm run smoke` all checks passed,
`claude mcp list` → Connected; Phase 14 moves the key to a file). The harness
(`~/agentic-harness`) holds V-2 (built 2026-09-16) and the vault as git realms at `C:/Users/stack/vault`
(2026-09-23/24). Sprint 1's phase table is STATUS's "Sprint 1 record"; the record behind every phase is
`docs/planning/sprint-1-hub/`.

**Sprint 2** (planned 2026-09-24; `docs/planning/sprint-2/94_SPRINT2_PHASES.md` is the plan; requirements
`91_REQUIREMENTS_v3.md`; research `93_SPRINT2_RESEARCH_SYNTHESIS.md`, whose §5 is the question batch):

| Phase | Name | Brief | Requirements | Migrations | State |
|---|---|---|---|---|---|
| 15 | Database hygiene and the SQL test runner | `briefs/95_PHASE15_db_hygiene.md` | R-78..R-80, R-54 | 100–102 live | **merged 2026-09-29** ([PR #30](https://github.com/emstacho-su/bb2dash/pull/30), 6ef3933); runner green 21/21 on `main`, advisor's search_path list empty; R3 and R4 open |
| 16 | Grades: V-1 sittings and the reconciliation migration | `briefs/96_PHASE16_grades_v1.md` | R-29..R-36 | 105–109 | **merged 2026-09-30** (PR #44, 4c310ff): sittings done 2026-09-29; 105 and 106 on prod |
| 17 | Web polish: quick fixes, carried bugs, Inbox/planner leftovers, live proofs | `briefs/97_PHASE17_web_polish.md` | R-37, R-39 (interim), R-40, R-42..R-45, R-47..R-52, R-55..R-59, R-108; S2-home-1/2, S2-materials-1, S2-bugs-1 | 110–119, 150 (overflow block 150–159) | **merged** (PR #43, d9d5ee9); T-24 dropped and T-26 done on 2026-09-30 (108 §4); R-52's live clause waits on the next token expiry |
| 18 | Ingest and corpus | `briefs/98_PHASE18_ingest_corpus.md` | R-60..R-63, R-66..R-70, R-72..R-75, R-77; S2-rag-1 | 120–129 live, 160 (overflow block 160–169) | **merged 2026-09-30 before its gate sync**; re-read 2026-10-03: the syncs since 10-01 settled tasks 14, 17 and 18; `98a` §2/§5 and task 28's screenshots still owed; task 19's code half landed 2026-10-04 (the crawler PR) and task 26 (R-73) closed 2026-10-04 on Stack's word (108 §3) |
| 19 | Content identity, per-crawl history, sync honesty | `briefs/99_PHASE19_content_history.md` | R-38, R-41, R-64, R-65, R-71, R-76 | 130–139, 170–172 live (overflow block 170–179) | **merged 2026-10-03** (PR #60, 206ee3a); with 15 and 18 also on `main`, Phase 14's W-55 and W-56 now wait only on the spike PASS |
| 14 | Containers (R-28) | `briefs/100_PHASE14_containers.md` (supersedes `82_`'s Contract) | R-81..R-96; S2-containers-1 | 091, 093, 094 live; 092 struck | **merged 2026-10-04** on Stack's word before acceptance (#62, #67, harness #39, bb2dash-stack #1); the `sync` container runs live since 2026-10-03 22:52Z; Stack's acceptance sitting A1–A9 is owed (§4) |
| 20 | Harness closure: V-2 on record, note quality, checkpoint redaction | `briefs/101_PHASE20_harness_closure.md` | R-97..R-104, R-106 | none here | **PR-A (#39, 2904b20) and PR-B (harness #36, ea0e199; + harness #37, 00539be) and PR-C (#48, cb1d7e7) merged 2026-09-30**; live steps done; V-2 walked in `verification/101a_V2_VERIFICATION.md`, closed on Stack's word 2026-09-30; tasks 2 (request 458, 2026-10-01) and 29 done; two harness follow-ups still unfiled (108 §2) |
| 21 | Workspace: chat routed by complexity, on the subscription | `briefs/102_PHASE21_workspace.md` (frozen 2026-10-05) | S2-workspace-1; P-83..P-88 | 140–143 live (144–149 its slack) | **merged 2026-10-07 on Stack's word (bb2dash #78, then bb2dash-stack #3), walked by the PM, not yet accepted**: the image runs only as test project `bb2dash-wt21`, from `bb2dash-wt-21`; the reviews' fix rounds and the walk's two layout fixes are merged into the phase branch; next Stack's 15-step acceptance after Phase 14's, with six things put to him (§4, §6 D2; record `verification/102a_PHASE21_VERIFICATION.md`) |
| 22 | Styling | `briefs/103_PHASE22_styling.md` | R-53, R-46; S2-styling-1 | none | planned; last |
| 23 | Inbox auto-apply: a sync files the request, the `apply` container runs `/inbox-apply` | none (Stack's ask and three choices, 2026-10-07; STATUS "Phase 23", DECISIONS six rows) | amends B-44; builds R-96's release | 180–184 live (183 at the cut-over; block 180–189) | **merged 2026-10-07 on Stack's word (PR #79 `d454f6f`; bb2dash-stack #4 `ec0e304`) and cut over: `sync` rebuilt, `apply` running**; first live run archived 13 of 16 answers; **open:** three session-link answers the worker cannot apply, the exporter not scheduled, Stack's acceptance walk (STATUS "Phase 23") |

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
5. **21 after 14**, **22 last** (Stack's "cleaning" placement; the Workspace page is in 22's inventory). Phase 21
   started on 2026-10-05, the day after Phase 14 merged, and was built, walked by the PM and merged on Stack's word on 2026-10-07; its acceptance
   walk comes after Phase 14's own (A5, A7 and A9 are still open there). Phase 22 waited for Phase 21's merge (done 2026-10-07).
6. **Migration ranges with slack**: 091–099 (14), 100–104 (15), 105–109 (16), 110–119 (17), 120–129 (18),
   130–139 (19), 140–149 (21; 140–143 are on prod and frozen, 144–149 are its slack), 170–179 (19's overflow, taken 2026-10-03 for 170–172; DECISIONS), 150–159 (17's overflow, taken 2026-09-29 for migration 150; DECISIONS), 160–169 (18's
   overflow, taken 2026-09-30 for migration 160; DECISIONS). A phase that runs out takes the next free block of ten and records it in
   DECISIONS, never a number inside another phase's block. Every migration is additive, applied under the
   file's name, byte-identical.
7. **What each phase hands on** is the seam table in `94_SPRINT2_PHASES.md` §3.
8. ~~**Phase 19 (B3) is unblocked since 2026-09-30**~~ Built 2026-10-02/03 (PR open; STATUS row 21). Kept for the record: (17 and 18 on `main`), but the PM recommends it wait for Stack's
   first `/bb-sync` on `main`: Phase 18 merged before its gate sync, so its crawler v5, in-sync pull and author
   resolution are unproven live, and 19 re-creates `stage_content` on top of that crawl. That sync is Phase 18's gate
   (DECISIONS 2026-09-30, "Phase 18 · merge"): refresh the installed skill from `main` first, run from the main
   checkout, then the PM holds the probe sitting and records `98a`, tasks 17–19 and 26, and walk-18's 05/08.

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

Learned in Phase 21 (2026-10-07; each from `verification/102a_PHASE21_VERIFICATION.md`):
* **Look at the real screen; green suites are not a look.** The web suite was green and the walk still found two
  layout defects on the real page: W-1, a long conversation made the page grow far below its window, and W-2, a
  finished answer's "Used:" line landed below the visible column. The unit tests lay nothing out, so neither could
  show there. A new screen is opened in a real browser before the walk is called done, and a layout fact gets a
  browser test beside its unit test (`web/e2e/workspace-layout.spec.ts`).
* **A walk agent that is still running is not answered by message.** In the second sitting the PM's reply to the
  walker's question did not reach the running walker. It started a second copy of the same agent in the same
  worktree, which edited the spec and ran one test before the PM stopped it. Two agents shared the worktree for two
  minutes; nothing was doubled. The rule (ruling W-S): the agent states its default and takes it, and the PM rules
  afterwards.
* **A pinned library can still break when the host it downloads from changes.** The harness's `rag` server was on
  fastembed 2.1.0, which fetched its embedding model from a Google storage address that had begun to answer 403.
  The first image build failed there, outside the phase's code; fastembed 2.1.1 fetches from Hugging Face (harness
  PR #40). A download at build time is a dependency that no lock file pins.

## 4. Open items that are Stack's, not the PM's

* ~~**Phase 19 (PR open, 2026-10-03), in this order:**~~ Merged 2026-10-03 on your word (PR #60). ~~Still yours: dismiss Inbox item 2636 (the PM's proof run)~~ (archived 2026-10-03 22:43Z, "testing item, irrelevant"). Still yours: say if the Stream's "New and changed materials" block should move, and the one live proof left, step 5's "Sync interrupted" toast (the desktop runs the Phase 19 build since 2026-10-03 22:41Z; the next interrupted sync shows it). The original item: (1) ~~task 27, the first register-first sync~~ done with your sync 866
  (2026-10-03; task 27 true, every stream `fresh`); videos now post as links (your answer; migration 172), never downloaded. (2) Walk brief 99's acceptance script on the preview
  (`web-git-feat-content-history-19-emstacho-sus-projects.vercel.app`), step 5 included (one sync interrupted on
  purpose; the PM already proved the rule live with request 580, and Inbox item 2636 is that proof, answer or dismiss
  it). (3) Read the nine DECISIONS rows dated 2026-10-02/03. (4) Say whether the Stream's "New and changed
  materials" block (above the timeline, newest 8) is where you want material posts. Then "merge this phase" or
  changes.
* ~~Answer the sprint 2 question batch (`docs/planning/sprint-2/93_SPRINT2_RESEARCH_SYNTHESIS.md` §5, 59
  items, each with the default the PM took) and approve the phase plan (`94_`); say where Phase 14 sits
  (default: it starts with Phase 15).~~ Done by delegation 2026-09-27 (DECISIONS rows of that date; Phase 14 starts
  with Phase 15). Stack may still overturn any row by saying so; the phase's PM then rewrites the B-table row.
* ~~**Hold the Inbox "Apply answers" button and `/bb-sync` until Phase 20's PR-A (R-97) merges.**~~ Lifted 2026-09-30:
  PR-A merged (#39, 2904b20) and the installed `/inbox-apply` prints `realm=projects ok` before anything else (101a).
  The original item: `/inbox-apply` still
  writes its decision notes to the OneDrive stub, not the realm vault (inbox-541..544.md landed there on 2026-09-27);
  the PM copies those four notes into the realm when PR-A lands (brief 101 §Seams). Found by the 2026-09-27 decision panel.
  On `stack-laptop` there is no OneDrive stub: the 2026-09-29 run (request 186) wrote inbox-752..756 straight into the
  realm `C:/Users/stack/vault/projects/bb2dash/decisions/`, so PR-A's copy covers only the four notes from the old machine.
* Task 0's Blackboard session probes **started 2026-09-29 15:25Z** (baseline `200`): the record `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` holds
  the baseline row; once a login is confirmed the PM spawns idle probes periodically, self-paced, for as long as the login lives (your call 2026-09-29: not an hourly clock), each read-only through Claude in Chrome and written as a row (batch item 47; brief 100
  Task 0). Your part: keep the Chrome extension connected, the Blackboard tab open and the laptop awake while the idle series runs,
  and let the reopen probes happen on their days. "Stay signed in?" is **yes**, always (your standing rule, 2026-09-29).
* **B-9, three dates (R-29 stays PARTLY until they land):** the individual presentation slot, the Major Case 1 day (10/20, 10/21 or 10/22; before 2026-10-20) and the Major Case 2 day (11/17 or 11/19; before 2026-11-17). Name the presentation slot whenever you know it; each B-9 answer must land before the day it names (9/30, the
  earliest candidate slot, has passed with nothing recorded), a bound, not pacing (batch item 9): whether 11/4 was the SITN pick or the individual slot,
  and which individual slot is yours (9/30, 10/14, 10/26, 11/4 or 11/16); each answer goes in as an Inbox value resolution.
* The Google OAuth consent screen **stays in Testing for now** (your call, 2026-09-29; you know how to publish it):
  the calendar token died 2026-10-01 18:45Z (308 failed runs) and you re-minted it about 2026-10-02 05:00Z; **the next expiry is about 2026-10-09 05:00Z**; look at Home's push-failure line while it is red (that closes R-52's live clause). You re-mint with `scripts/google-consent.mjs` when the
  push starts failing, or publish first and then re-mint (batch item 28; DECISIONS 2026-09-29).
* ~~Phase 16's six sittings as fast as you can sit them, in the order IST.323, IST.466, IST.352, ECN.304, GEO.103,
  IST.471; migration 106 on prod before the Nov 30 – Dec 13 code freeze (the IST.323 column is graded inside it, 2026-12-03)
  is the one bound (brief 96 open item 4; batch item 11; no date-paced tasks, the freeze stands, DECISIONS 2026-09-27).~~ Done 2026-09-29: all six sat; migration 106 is written and proven, applied once PR #40 merges.
* ~~**Merge PR #40**~~ Merged 2026-09-30; 105 and 106 are on prod.
* Say whether the Nov 30 – Dec 13 code freeze still stands. Default: it stands, as a window, not pacing (DECISIONS
  2026-09-27, no-date-paced-tasks row). If you strike it, migration 106's bound becomes 2026-12-03 and B-6's window goes.
* ~~Phase 12 proofs still his: see the three toasts and click one from a banner and one from the Action
  Center; press Sync inside the shell and confirm "command copied" (batch items 57–58). This is Phase 17's **T-24
  desktop sitting** (brief 97 acceptance step 10); the R-108 DECISIONS row stays PENDING until it happens.~~ Dropped 2026-09-30 ("Forget about the toasts", DECISIONS); R-108 is closed by decision, unproven by a sitting (108 §4).
* ~~Phase 17 **T-26 production sitting** with the PM (brief 97 acceptance steps 8–9): the planner recurrence and
  popover walk, the staging proof, and shots 11, 14, 15, 19–21 plus the `staged link` spec.~~ Done 2026-09-30 before the merge (97w §T-26; the staging case narrowed to row 810, DECISIONS 2026-09-30).
* ~~Phase 17 **round 3 on the preview**: look at the nine round-3 changes (shots 22–27 in `walk-17/`) and say whether
  they are right before the PR merges.~~ Moot: PR #43 merged on your word 2026-09-30.
* Rotate the password you were asked to rotate during Phase 17's walk.
* ~~**Your first `/bb-sync` on `main` is Phase 18's gate** (you merged 18 before it on 2026-09-30). Before it the PM
  refreshes `~/.claude/skills/bb-sync/SKILL.md` from `main`; run it from the main checkout (the desktop Sync button is
  fine now), log in to Blackboard when asked and stay about 15 minutes for the probe sitting (announcement shape,
  per-item URL, meeting times, `feedbackToUser`, group-attempt files). Owed from it: tasks 16–19, 26, walk-18's shots
  05 and 08, and after 2026-10-01 17:51Z task 14's iCal re-read (task 18's author resolution is on `main`, so that one sync also serves the author read).~~ Done: sync 443 (2026-10-01) was the gate, and the syncs since settled tasks 14, 17 and 18 (108 §3). **Still yours from it, one short sitting in your logged-in Blackboard tab:** one real per-item Ultra URL (R-69), ~~whether any student view shows meeting times (R-73)~~ (closed 2026-10-04: you accepted the crawl evidence; DECISIONS row), and whether an IST.352 group attempt lists files (R-60 clause 5).
* Place ECN.304 Quiz 2 and Attendance with "Counts toward…" on the course Grades tab if the figure
  should include them.
* ~~**Request 456** (`inbox_feedback`, `queued` since 2026-10-01 18:02Z) keeps "Apply answers" reading queued: cancel it, or say so and the PM cancels it (the same state as request 183, cleared under the two-asks rule on 2026-09-30).~~ Cancelled 2026-10-04 01:21Z on your word ("cancel request 456"), superseded by request 458 (DECISIONS 2026-10-04).
* **Phase 14, its session's items, listed here so one list holds them all (2026-10-03):** ~~sign in again through noVNC (Inbox item 3074 `sync-login-required`, open since 23:00Z)~~ done: item 3074 closed itself at 23:17:38Z (`sync_login_ok`, R-83's self-close seen live) and you signed in again afterwards (while the container's login is dead the runner closes any queued sync as `login_required` in about 25 s, so a desktop Sync press fails; look for a `sync-login-required` item in the Inbox before any sync); decide whether `feat/containers-14` is rewritten or squashed before it merges (commit b2b42c4 holds the unblurred walk-14 shots on a public repo); the merge word on PR #62 after its `/security-review`, before A1; Docker Desktop AutoStart on and the vault `projects` realm clean so `just doctor` exits 0; then walk-14, A1–A9 and the three repo PRs.
* ~~**Merge words waiting:** PR #63 (`docs/inbox-decisions/2026-10-03.md`, the sync session's orphaned log) and the audit PR (108 and these state docs).~~ Merged 2026-10-03 on your word: #63 (57bf75d), #65 (8bdfe4d), #64 (9d1e8ac). Waiting now: the record PR for R-73 and request 456.
* **Say the word to remove the four merged worktrees** (`bb2dash-wt-harness-closure-20`, `-skills`, `bb2dash-wt-inbox-vault-20`, `bb2dash-wt-paths`) and the branches `docs/harness-closure-20` and `-skills`; every head is an ancestor of `main`.
* **Phase 18 defaults to confirm or overturn:** file 62 stays current with its missing note; reading 46 stays tagged; file 69 is not re-OCR'd and `.doc`/OCR automation stays out.
* The 0-byte session note `b46dd7f8` (delete or keep) and inbox-541..544, which exist in the RAG store from the old machine but not in the realm on disk (rebuild from the store, or leave).

* **Phase 14 acceptance sitting (A1–A9)** (brief 100 §Definition of done; ticks in
  `docs/planning/sprint-2/verification/82a_PHASE14_PARITY_AND_IMAGES.md`, section "Acceptance A1–A9"). Walked
  2026-10-04/05 on `main` with the existing checkouts: **A1–A4 and A6 ticked, A2 passed on Stack's word with the doctor's
  two reporting artefacts named (W-74), A8 partial** (the nightly task gone, the checkpoint task kept until the container
  collects). Still open: **A5** (the first morning after 06:00 New York proves the sync without a press, PR #73; the
  next dead login proves the page opening), **A7** `just dev`, **A9** the Windows `/bb-sync` with Docker stopped.
  Stack's remaining steps: a tray Quit so the logon-build task activates desktop build `f37723a` (PR #71), then one
  press of **Update desktop app** on a later desktop change as the end-to-end proof; removing the stale `bb-course-*`
  claude.ai skills (task 19). Done: the Duo login, secrets 11/11, the MCP key move, `.wslconfig`, Docker autostart,
  `node scripts/install-skills.mjs` (2026-10-05 22:0xZ), the sync image rebuilt from `main` 2e39199 (22:06Z).

* **Phase 21, the Workspace (built, walked by the PM and merged on your word 2026-10-07: bb2dash #78, then
  bb2dash-stack #3).** The PM's own walk is done (twelve live turns on your plan, nine screenshots, two layout
  defects found and fixed). Yours, after Phase 14's A5, A7 and A9 above:
  1. **The acceptance walk, 15 steps in two parts** (brief 102, "Stack's acceptance script"). Steps 1 to 12 on the
     branch preview, with the PM's test container running: step 1 is your look at claude.ai, Settings, Usage, to
     confirm Usage credits are still off, and step 12 is reading the D-1 reversal row and the preview-walk row in
     DECISIONS before you say "merge". Then steps 13 to 15 on `main`: step 13 is adding
     `COMPOSE_PROFILES=workspace` to bb2dash-stack's `.env` before `just up` (only when no sync is open; the PM
     reads the queue first), and you end with "accepted".

  Six things are put to you with it. None is accepted for you; item 3 needs your answer before you say "merge",
  and is best answered before the bb2dash PR opens:
  2. **The firewall question, whenever you like.** The Workspace container's firewall allows addresses, not names,
     and code running inside it could reach other Cloudflare-hosted sites through the Supabase project's shared
     addresses. The assistant itself cannot. Live with it in v1, or have a name-checking proxy built? (DECISIONS
     2026-10-07; STATUS, section "Phase 14 deferred (R-96)", bullet "Hardening noted by the security reviews, below
     the bar".)
  3. **The walk's screenshots are in a public repository, and they are already public.** The nine shots in
     `docs/planning/sprint-2/walks/walk-21/` show real answers. As they stand after the retakes: a sentence quoted
     from the IST.323 syllabus (03, 04) and that syllabus's section headings (10); three of your Inbox decisions on
     ECN.304 Quiz 2, with the score (04, 10); slide summaries of two IST.352 decks (11); and two ECN.304 study
     plans (05 to 08) with the course's dates ("Exam 2 is Thu Nov 5"), slide-by-slide content, what the Exam 1
     study guide says Exam 1 covers, two self-quiz questions with the line "Several quiz questions above are
     adapted from it", and a line from your decision notes 538 and 545. STATUS, section "Phase 21", lists them
     shot by shot. They have been on pushed branches since 2026-10-07 (`feat/workspace-21`,
     `feat/workspace-21-web` and `feat/workspace-21-docs`), with the first sitting's fuller takes of five of them
     in the history. A rewrite takes them off the branches and keeps them out of `main`'s history. It does not
     take them off GitHub: a commit that a rewrite drops stays reachable by its id, and through any pull request
     that referenced it, until GitHub Support purges it. So a rewrite is cleanest before the bb2dash PR exists,
     and the PM either asks you this before opening that PR or opens it and says so in STATUS. Keep them, or have
     them replaced with cropped ones and the branches rewritten? (DECISIONS 2026-10-07.)
  4. **One answer showed Markdown asterisks (W-3).** The page shows text as typed, and one answer in the PM's walk
     (the decision question, your step 4) came back with `**` around three lines. Strip the markers on the page,
     press the prompt harder, or leave it? (DECISIONS 2026-10-07; STATUS, Known issues.)
  5. **`/usage`.** Only you can type it. At step 1, read your plan's session and weekly percentages and tell the
     PM; the runner keeps no figure of them.
  6. **`npm ci` in `C:/Users/stack/agentic-harness/mcp-server`**, yours to run or to ask for: its installed
     `node_modules` still holds fastembed 2.1.0 under a lock that says 2.1.1.
  7. **Three SQL units fail on prod's course data** from any checkout (`grading_invariants.sql`,
     `phase18_122_supersede_rule.sql`, `phase18_golden_truth.sql`; STATUS, Known issues). They are not Phase 21's;
     say which session takes them.

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

## 6. Session prompts, one per phase in six sessions, lettered in chronological order (copy-paste; sprint 2, rewritten 2026-09-27 to the verified briefs; re-lettered 2026-09-29)

One prompt per phase, grouped into the five sessions below; a session pastes its prompts in the order shown, when
its heading says. The order to run them, concurrency, checklists and fallbacks are in
`docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` (no calendar). The bb2dash prompts (B1, B2, B3, C, D1, D2, E, F) start with `/bb2dash-pm` so the session loads
this file and runs the live-state checks before acting; Session A runs in the harness repo, so its prompt starts by
naming `C:/Users/stack/agentic-harness`. Every brief was PROVISIONAL until Stack answered `93_` §5 and approved `94_`, which he did by delegation on 2026-09-27 (DECISIONS rows of that date);
the prompts carry the PROVISIONAL line, and each phase's PM first records whatever answers he has given against its
brief's B-table. Before cutting workers, the phase's PM reads that brief's residual notes in
`docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md`
§3 and fixes or strikes each one in the phase's own PR. The used sprint 1 prompts are history in
`docs/planning/sprint-1-hub/104_SPRINT1_SESSION_PROMPTS.md`.

**Position on 2026-10-07 (Phase 21):** D2 has run since 2026-10-05, and Phase 21 is built on `feat/workspace-21` in bb2dash and in bb2dash-stack and walked by the PM; both PRs (bb2dash #78, bb2dash-stack #3) merged on Stack's word on 2026-10-07, before his acceptance walk. Done: the freeze with Stack's answers, four worker streams each with an independent check, migrations 140–143 on prod (frozen), the image built from harness `main` 57ee51f and proven as test project `bb2dash-wt21` (tasks 12 and 13), both reviews on the branch and both on the delta (the `/code-review` run on the range `d4b1b8d..ac41858` is in 102a: eleven findings, R2-1 to R2-11, none CRITICAL or HIGH), runner fix round Z for its three MEDIUM findings (ruling Z1: R2-1, R2-2 and R2-5, and a secret file holding a NUL refused; merged as `134ee64`, runner 810 tests; the eight LOW ones recorded under ruling Z2), `/code-review main high` on bb2dash-stack with its fix round (fifteen findings; S-1, the one HIGH, fixed: the Workspace is started alone, never through a whole-project `just up` while a sync is open; 70 of 70 tests at `190fa43`), and the PM's walk in two sittings on the preview and in a second desktop window (tasks 19 second half, 20, 21 and 22: twelve live turns on Stack's plan, nine shots; W-1 and W-2 found on the real screen, fixed by W-66, merged as `25979bb` and shown fixed in the second sitting; W-3 put to Stack; task 21 (d) and the plan's usage percentages not shown live). Next, the PM's: both PRs (task 25), then "ready when you say so". Then Stack's: the 15-step acceptance, after Phase 14's own, and the six things put to him (§4). F (Phase 22) waits for this merge. The worktrees, the test project and the cleanup owed are under D2 below.

**Position on 2026-10-04:** Phase 14 merged on 2026-10-04 before its acceptance sitting (#62 and #67 in bb2dash, with the harness and stack PRs; DECISIONS 2026-10-04), so Phases 14–20 are all on `main`; what is open from 14 is Stack's A1–A9 sitting and the cut-over, listed in §4 by its session. D2 (Phase 21) has its gate (14 and 15 on `main`) and starts by putting O-1..O-5 to Stack; F (Phase 22) after 21; E (Stack's open items, §4) any sitting. Phase 18's last code item, task 19, landed in the crawler PR of 2026-10-04; what Phase 18 still owes is `98a` §2/§5 (two reads in Stack's tab) and the walk-18 screenshots on prod.

**Position on 2026-10-05 (storage keys):** the acceptance sitting's syncs found file 2489 refused by Storage (`InvalidKey`, a curly apostrophe); PR #75 (`fix/storage-key-safe-chars`, outside any phase) sanitises keys to Storage's allowed set in JS and in SQL through migration 095 (applied 2026-10-05), and refuses an occupied sanitised key. The container takes the JS half at its next `just up` image rebuild, after which the next sync should pull 2489 and close item 3441. Three follow-ups went to Phase 14's deferred list (DECISIONS 2026-10-05).
**Position on 2026-10-05 (daily sync):** Phase 14's acceptance found that the container queued the day's sync only on a login transition, so a kept-alive login queued nothing on 2026-10-05; PR #73 (`fix/sync-daily-enqueue`, outside any phase) makes the first alive check at or after 06:00 New York ask for it (DECISIONS 2026-10-05). The container runs it after the next `just up` image rebuild. A5's "a sync runs without pressing Sync" half is proven by that rebuild's first morning.
**Position on 2026-10-04, late:** the desktop's two update buttons were found never to have swapped a build (the detached PowerShell never ran) and were fixed outside any phase on `fix/desktop-update-helper` (PR #71; STATUS section "Desktop update helper"; DECISIONS 2026-10-04). Stack's Phase 14 acceptance sitting began the same evening: A1–A4 walked (STATUS "Phase 14", "Where the product is"), build 4987385 activated by a tray Quit plus the logon-build task, the desktop on `queue-only` since 21:18, the first login-triggered sync (request 1854) and the first queue-only press (request 1855) both `done`; A5–A9 and the cut-over's remaining steps open (§4). The fixed build reaches the laptop through the same Quit-plus-task step once PR #71 merges; the first real press on it is the end-to-end proof.

**Position on 2026-10-03 (audit 108):** Phases 15, 16, 17, 18, 19 and 20 are on `main`; D1 (Phase 14) is running in its own session (launcher PR #62 open; the runner live against prod); open next: D2 (Phase 21) after 14 merges, F (Phase 22) last, E (Stack's open items, §4) any sitting. The PM's own next PRs, outside any phase: PR #65 (the `sync_runner` membership line ported from Phase 14's branch so `main`'s suite reads 59/59; the typecheck gap was the main checkout's stale `web/node_modules`, fixed by `npm ci`), the crawler PR that finishes Phase 18's task 19 (key lists, header, R-66/R-75 rows; slide 13 of `bb_file:8` turned out to be 119's deletion, not a gap), and the walk-18 screenshots on prod.

**Position on 2026-09-29 (after PRs #30–#37):** the letters follow the chronology since 2026-09-29 (DECISIONS of that
" . "date): A = Phase 20, B = 17 + 18 then 19, C = 16, D = 14 then 21, E = Stack's open items, F = 22; Phase 15 is done and
" . "its prompt is kept below as Done. Open now: A (first, R-97 is a live bug), B1 + B2 (parallel, then B3), C (its own
" . "session; the materials MCP server is registered on `stack-laptop`, see §1), D1 (Task 0 is running, the spike is next),
" . "E (any sitting), then D2 and F last. Every prompt's "PROVISIONAL until I answer 93 §5 and approve 94" line is satisfied since
2026-09-27; the phase's PM still strikes PROVISIONAL in the brief's B-table at its start.

**Done — Phase 15** (merged 2026-09-29 as PR #30; the prompt is kept for the record; it was Session A1)

Phase 15 (done)

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

**Session A — Phase 20** (the harness repo plus two bb2dash PRs; can run first of all: R-97 is a live bug)

*Status 2026-09-30:* run. PR-A (bb2dash #39) and PR-B (agentic-harness #36, plus #37) merged on Stack's word; PR-C
(`docs/harness-closure-20`) open. Acceptance steps done: 3 (L20-a), 4 (L20-b), 5 (credential test, run by the PM
without removing the credential), 6 (resume chain), 8 (the untagged line in `/bb2dash-pm`); step 7 struck by Stack;
step 1's first real Apply run waits for an Inbox item; step 9 (his word on `101a`) is open. After PR-C merges: task 29.
The prompt below is kept for the record.

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

**Session C — Phase 16** (its own session; paste C once and park it between sittings; runs beside Session B)

C — Phase 16

> `/bb2dash-pm` Start Phase 16 (Phase 15 merged 2026-09-29; the materials MCP server is registered on stack-laptop): `docs/planning/sprint-2/briefs/96_PHASE16_grades_v1.md`,
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

**Session D — Phase 14, then Phase 21** (three repos; paste D1 now: Phase 15 has merged and Task 0 is running, per `94_` §2 rule 4; paste D2 after Phase 14 merges: 21 reuses 14's container, token and MCP image)

D1 — Phase 14

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

D2 — Phase 21

*Status 2026-10-07:* run on 2026-10-05. Built, walked by the PM and merged on Stack's word on 2026-10-07 (bb2dash #78, then bb2dash-stack #3); Stack's
acceptance pending (STATUS, section "Phase 21"; record
`docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md`). The prompt below is kept for the record. Where the
frozen brief says something else, the brief wins: both PRs open together and bb2dash merges first; the password was
handed over as task 19 describes; the walk is 15 steps in two parts, with "merge" after step 12 and "accepted" after
step 15.

* **Worktrees and branches that exist (2026-10-07), all under `C:/Users/stack/projects/`.** In bb2dash, six beside
  the main checkout: `bb2dash-wt-21` (`feat/workspace-21`, the phase branch, the PM's), `bb2dash-wt-21-db`
  (`feat/workspace-21-db`, W-63), `bb2dash-wt-21-runner` (`feat/workspace-21-runner`, W-64),
  `bb2dash-wt-21-container` (`feat/workspace-21-container`, W-65), `bb2dash-wt-21-web` (`feat/workspace-21-web`,
  W-66) and `bb2dash-wt-21-docs` (`feat/workspace-21-docs`, task 24's docs). In bb2dash-stack, one:
  `bb2dash-stack-wt-21` (`feat/workspace-21`).
* **The test project.** Until the merge the Workspace container runs only as compose project `bb2dash-wt21`
  (container `bb2dash-wt21-workspace-1`, network `bb2dash-wt21_workspace-net`, volume
  `bb2dash-wt21_workspace-claude-home`), started from a phase worktree with the service named in every command:
  never `just up`, never an `up` without a service name, never a changed `BB2DASH_DIR` (DECISIONS 2026-10-05). One
  tree at a time runs it: it was built in `bb2dash-wt-21-container`, stopped and removed there on 2026-10-07, and
  rebuilt for the walk in `bb2dash-wt-21`. **It runs from `bb2dash-wt-21` now**: image `sha256:a2ef9b28…`, healthy,
  the $1.00 cap, connected to prod's queue, no question waiting. Before and after every docker step, read the live
  sync container's guard value (102a, "The live sync container: the guard value"); a changed id or start time made
  by this phase is a stop.
* **What the walk left in `bb2dash-wt-21`**, gitignored and untracked: `.env.testing`, `web/.env.local`,
  `web/.next/`, the saved sign-in `web/e2e/.auth/state.json`, `web/e2e/.results/`, `desktop/node_modules/` and
  `desktop/dist/`. In the database: four archived walk conversations beside 'spike', which is listed until
  acceptance step 15.
* **Cleanup owed after the merge** (the merge only on Stack's word, bb2dash first; if he asks for the walk's shots
  to be replaced, that and the branch rewrite come before the merge, §4):
  1. Before acceptance step 13: stop the test container, so only the live project answers.
  2. After acceptance step 15: remove the test project's leftovers by name: the container
     (`docker compose -p bb2dash-wt21 --profile workspace rm -sf workspace`), the network
     `bb2dash-wt21_workspace-net` and the volume `bb2dash-wt21_workspace-claude-home`. Never a project-wide `down`
     against `bb2dash`.
  3. Delete task 9's raw recordings, which hold syllabus text: `C:/Users/stack/.bb2dash-w64-rec-out`,
     `C:/Users/Public/bb2dash-w64-rec/` and the three transcripts under
     `~/.claude/projects/C--Users-Public-bb2dash-w64-rec-cwd/`.
  4. Remove the seven worktrees and their branches, local and remote, in both repos (the walk's gitignored files
     in `bb2dash-wt-21`, the saved sign-in among them, go with that worktree); pull both main checkouts; update
     memory.
  5. The acceptance record as a docs-only PR (PR #76's precedent), with its DECISIONS row.

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

**Session E — Stack's open items, one sitting, no phase** (any time; repeat whenever §4 has items; docs only, no migration; the PM records, Stack decides)

E — Open items

> `/bb2dash-pm` Session E: take ORCHESTRATOR §4's open items in one sitting, in this order, and record each outcome
> where it belongs (a DECISIONS row, a STATUS "Known issues" line, an Inbox value resolution, a struck §4 bullet) in
> one docs PR on `docs/open-items-<date>`; skip an item I say I cannot answer today and leave its bullet standing.
> (1) The calendar token: read `select id, status, left(error, 60) from calendar_push_runs order by id desc limit 1`;
> if it is red with "refresh token", put the four env lines from the header of `scripts/google-consent.mjs` and the
> command on my clipboard (client id and secret from the Cloud project on my personal Gmail, `GCAL_CALENDAR_ID` from
> `app_settings`, the service key from the dashboard); I run it as `emstacho@g.syr.edu` and say `stored 4 secrets`;
> you `select calendar_push_now()` and confirm the next run `ok`; T-27's second reading goes in DECISIONS, and if I
> say I published the screen first, that row says so and the §4 bullet is struck. (2) Task 0: run any reopen probe
> due today from `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` (Claude in Chrome, the extension's own tab
> on `https://blackboard.syracuse.edu/ultra/`, read-only, no clicks); if the idle series has ended, write its
> `Idle lifetime:` line and the closing DECISIONS row that names `KEEPALIVE_MINUTES` and B-45's hour for brief 100.
> (3) B-9: ask me the three dates once (the presentation slot: SITN pick or individual slot, and which; the Major
> Case 1 day; the Major Case 2 day); each answer goes in as an Inbox value resolution and a DECISIONS line.
> (4) Phase 12 proofs (batch items 57–58): with the shell open I watch for the three toasts, click one from a banner
> and one from the Action Center, press Sync inside the shell and read "command copied"; you record R-108 as proven
> or name what failed. (5) ECN.304 Quiz 2 and Attendance: I say whether each counts; you place it with "Counts
> toward…" on the course Grades tab or record "left out" under the figure. (6) The Nov 30 – Dec 13 code freeze: I say
> whether it stands (default: it stands). (7) The R-97 hold: if Phase 20 PR-A has merged, copy inbox-541..544 from the
> old machine's OneDrive stub into `C:/Users/stack/vault/projects/bb2dash/decisions/` and strike the hold; if not, say
> so and leave it. Stop at "ready when you say so".

(Session E never opens a phase branch or a migration; a finding that needs code goes to the phase that owns the file, named in the PR body.)
**Session F — Phase 22** (last, after every screen exists)

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


