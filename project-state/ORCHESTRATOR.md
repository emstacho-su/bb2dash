# bb2dash — Orchestrator context

> The document a PM session loads at the start of every sitting. Call it with `/bb2dash-pm`.
> Updated with each phase PR, like STATUS and DECISIONS. Last update: **2026-09-16** (post-merge reconciliation: Phase 10b PR #15 merged after Phase 11b's PR #14 and its display follow-up #16; Phase 10a PR #13 merged after Phase 11's PR #12).
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

Backend foundation live; GUI v1 merged and deployed to Vercel; retrieval polished (Phase 7);
Classroom-style course page (Phase 8); automated sync loop with Inbox (Phase 9); gradebook
mirrored and shown as Blackboard's numbers, submissions catalogued, staged uploads (Phase 10a);
planner week grid, Google Calendar push, announcements bell (Phase 11); planner events pushed to
Google (Phase 11b); grade model + what-if (Phase 10b). Prod is Supabase
`goultdzqcavefcgnifdy`; migrations 001–058, 060–069 and 080–081 on `main` and live (059 held for V-1).
No open PRs; only `main` remains locally and on GitHub. The materials MCP
server (`mcp-server/`) is registered at user scope and points at
`C:/Users/estac/projects/bb2dash/mcp-server/dist/index.js`. The 10a / 11 / V-1 / V-2 sprint
started 2026-09-15 from `main` at `570a869`; 10a and 11 merged 2026-09-16.

| Phase | Name | State | PR | Migrations |
|---|---|---|---|---|
| 1 | Data syntax + syllabus seed | merged (pre-repo, Sep 2) | — | 001 |
| 2 | Blackboard capture | merged (pre-repo, Sep 2–3) | — | 002–004 |
| 3 | Audit + search schema (FTS) | merged Sep 9 | #1 | 005–010 |
| 4 | Embedding POC (gte-small, hybrid) | merged Sep 9 | #2 | 011 |
| 5 | Retrieval MCP | merged Sep 9 | #5 | 012–013 |
| 6 | GUI v1 (Next.js on Vercel, 4 screens, RLS) | merged Sep 10; signed off Sep 10 | #4 | 014–020 |
| 7 | Retrieval polish (matched snippets, superseded filter, web tests) | merged Sep 10 | #6 | 021–025 |
| — | Requirements v2 + Phase 8/9 briefs; Phase 6 close-out | merged Sep 14 | #7 | — |
| 8 | Course dimension (Stream / Classwork / Info, popouts, tracker paging) | merged Sep 14 | #8 | 026–029 |
| 9 | Sync loop (automated transform, Inbox, bucket private) | merged Sep 15 | #10 | 030–045 |
| — | V-1 + R-27 briefs, Phase 10 split, ORCHESTRATOR + `/bb2dash-pm` | merged Sep 14 | #9 | — |
| — | MVP / DoD / task loops for every remaining phase (`70_MVP_INDEX.md`) | merged Sep 15 | #11 | — |
| 10a | Grades: gradebook mirror, Grades screens, submission pull-back, upload | merged Sep 16 (contract frozen Sep 15, Stack's ten answers in the brief; round 2 = 052–056; mirror verified by his 9/16 sync, attempts probe settles on the first v3 crawl) | #13 | 046–056 (057–058 slack) |
| 10b | Grades: methodology model + what-if | merged Sep 16 (V-1 gate waived by Stack; his four answers + rounds 1b/1c/2 in the brief; `/code-review` 15 findings fixed, `/security-review` none); PM browser walk 7/7 and round 3 (four UX fixes) | #15 | 057–058, review rounds 080–089 (080–081 used) |
| 11 | Planner week grid, Google Calendar push, bell + Announcements page, data gaps | merged Sep 16; calendar push live and proven | #12 | 060–066 |
| 11b | Planner events created in bb2dash and pushed to the `bb2dash` calendar (Stack's ask after the Phase 11 walk) | merged Sep 16 (brief + answers + K-notes + round 2 in `69b`, evidence `69c`; `calendar-push` v5 live, live proof and browser walk done; display follow-up #16 merged the same minute) | #14, #16 | 067–069 (070–072 free) |
| V-1 | Grading schema validation (stream, COLLABORATE) | **stubbed for later** (Stack, Sep 16); when it runs it also folds `grade_column_links` into `assignments` and fills placeholder points | — | **059** (held; nothing else takes it) |
| V-2 | Session archival, context tags, RAG hand-off (R-27; stream in `~/agentic-harness`) | planned; parallel with 10a | — | none here |
| 12 | Electron shell + tray + desktop notifications | **in progress** since 2026-09-16 on `feat/electron-12` (worktree `bb2dash-wt-electron-12`); Contract C-1..C-13 + Stack's Q1–Q9 in `80_PHASE12_electron.md`; W-25 shell, W-26 notifications; mirror dropped (R-28) | — | 073–079 reserved, none expected |
| 13 | Styling pass | planned; last; carries C-1..C-3 from Phase 10b's browser walk (brief §Carried in) | — | — |
| 12b | Fine-tooth-comb pass: Stack's list of bugs and changes by page → triage → research → MVP (`80c_PHASE12B_page_pass.md`) | planned; **after 12, before 13**; starts from Stack's list, not from requirements | — | 073–079 if Phase 12 leaves it free, else 082–089 |
| 14 | Containers (R-28): deterministic `sync-runner` + noVNC Blackboard login, harness jobs with a catch-up scheduler, vault → private git repo, dev container, umbrella repo `bb2dash-stack` (`82_PHASE14_containers.md`, research `research/82_*`) | planned; **after 13**; brief + Stack's 16 answers + six-researcher synthesis written 2026-09-16; one PR per repo (three repos) | — | 090–099 (090–091 expected) |

## 2. Execution order and what each phase hands to the next

```
 1 → 2 → 3 → 4 ─┬─ 5 (search v3, mcp-server) ─┐
                └─ 6 (web/, RLS)  ─────────────┴─ 7 (search v5, web tests)
                                                    │
                                    ┌───────────────┴───────────────┐
                                    8 (popout, tabs)         9 (transform, announcements)
                                    │                              │
                       ┌────────────┴──────────────┬───────────────┘
                     10a (mirror, screens, subs)   11 (planner, calendar, bell)
                       │  (V-1 stubbed)                 │
                     10b (model, what-if)               │
                       └────────────┬───────────────────┘
                                   12 (Electron)  →  13 (Styling)
   side streams beside 10a / 11:  V-1 grading validation · V-2 session archival (harness)
```

Rules that fall out of the graph:

1. **Merge 8 before 9.** Phase 9's transform driver calls Phase 8's `stage_content`; 9 rebases on
   `main` after 8 lands, re-runs its suites, opens its PR. Its migrations are already live, so
   the rebase is repo-only.
2. **10 is two PRs.** 10a ships as soon as 8 and 9 are on `main`. 10b waited for real scores
   and V-1's sign-off; Stack stubbed V-1 on 2026-09-16 and 10b shipped that day.
3. **11, V-1 and V-2 run beside 10a** the way 8 ran beside 9: frozen seams, disjoint migration
   ranges, separate worktrees. V-1 is Stack's time, one course per sitting. V-2 touches only the
   harness repo.
4. **12 and 13 are sequential, small, and after week 11's exams.** Neither pays off inside the
   term. (Stack pulled 12 forward to 2026-09-16.)
5. **R-28 shapes every brief from 12 on:** OS-bound code behind thin adapters over a plain-Node
   core, credentials from the environment, no local mirrors. See `60_REQUIREMENTS_v2.md` §3.5.
6. **Reserve migration ranges with slack.** Phase 9 was given 030–039 and used 030–045 (its review-fix rounds took 041–045), so Phase 10 starts at **046**.

Term calendar: week 1 = Aug 24. Weeks 9 (Oct 19–25) and 11 (Nov 2–8) are exam-heavy; week 14
is Thanksgiving; Nov 30 – Dec 13 is a code freeze. Phases 8–10 are the ones that pay off in
the term.

## 3. The per-phase cycle (what a PM session actually does)

1. **Read state.** STATUS, DECISIONS, the open PRs (`gh pr list`), `git worktree list`,
   `git fetch` — and compare `origin/main` with the local checkout. Assume another session may
   have moved things.
2. **Define the phase.** Pick from §1 in order unless Stack says otherwise. Write
   `docs/planning/NN_PHASE<n>_<name>.md`: why, a **frozen contract** (routes, views, RPC
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

## 4. Open items that are Stack's, not the PM's

* Run the next `/bb-sync` from the `main` checkout (now crawler v3): it settles Blackboard's
  attempt key names and pulls the first submission files (step 4b). Then tick acceptance step
  (3) of Phase 10a on the live app.
* Phase 10b is live: no course shows "Our model" until he links a column on a course Grades tab
  (e.g. ECN.304 Attendance → Participation, if the syllabus means that) or a hand-graded score posts.
* Phase 12 is running: try the unpacked build when the PM hands it over (six-step acceptance
  script in the brief's DoD, plus the tray).
* Decide when R-28 (container migration after development) gets its own brief; after Phase 13.
* Say when to un-stub V-1 (`scripts/validate-grading.ps1`, first sitting IST.323) and start V-2.
  V-1's reconciliation migration is `059_grading_reconciliation.sql`.
* Answer V-1's *ask the professor* items as they come up.

## 5. Context the orchestrator reviews at session start

Read in this order. Each line says what the file is for and what to look for.

| # | File | Why it matters now |
|---|---|---|
| 1 | `project-state/STATUS.md` | Where the product is, what shipped last, the "What's next" table with live PR numbers. Diff its header date against `git log -1 origin/main` to see if another session moved `main`. |
| 2 | `project-state/DECISIONS.md` (tail ~15 rows) | The newest decisions: worker branches per stream, matched-passage rules, the accepted query-time trade-off, `[notes]` handling, Phase 10 split. Do not relitigate silently. |
| 3 | `docs/planning/60_REQUIREMENTS_v2.md` §3–§4 | The R-numbers every brief cites, the confirmed phase order, the reversals that each need a DECISIONS row when adopted, and §6.2's residual assumptions (PM's calls Stack has not contradicted). |
| 4 | `docs/planning/61_PHASE8_course_dimension.md`, `62_PHASE9_sync_loop.md` | The two in-flight contracts and their frozen seam (`stage_content`). Needed to judge the 8-then-9 merge order and any conflict at rebase time. |
| 5 | `docs/planning/63_GRADING_VALIDATION.md` + `64_GRADING_SCHEMA_EXPORT_2026-09-14.md` | V-1's method and the claim under test; §4 of the export is the seed question list. The export is a snapshot — regenerate it if `grading_schemes` changed. |
| 6 | `docs/planning/66_SESSION_ARCHIVAL_RAG.md` | R-27 contract for the harness work: frozen frontmatter fields, two-PR split, acceptance. Implementation lives in `~/agentic-harness`. |
| 6a | `docs/planning/70_MVP_INDEX.md` + `research/7N_*.md` | Stack's MVP/DoD answers per phase and the comparables research behind each brief's DoD checklist and task loops. |
| 7 | `docs/planning/50_PHASE7_retrieval_polish.md` + `51_W10_VERIFICATION.md` | The template for a brief with a round-2 fix section, and what a worker verification note should contain (before/after evidence, md5 of applied migrations, advisor diff). Copy the shape. |
| 8 | `CLAUDE.md` (repo root) | The SOP: branches, one PR per phase, migrations byte-identical, visual sign-off, no service key client-side. Overrides habits. |
| 9 | `DATA_SYNTAX.md` §search layer | Current meaning of `part_range`, `snippet_source`, supersession chains — the retrieval contract clients depend on. |
| 10 | `web/README.md` | Scripts (`typecheck`, `build`, `test`), the type-regeneration step, the `queries.*.ts` convention. |
| 11 | `mcp-server/README.md` | How the materials server is registered and run; the `include_superseded` and excerpt-label semantics. |
| 12 | `gh pr list --state open` · `git worktree list` · `git branch -r` | Live state that no document captures: which phases are in a PR, which worktrees exist (foreign ones stay untouched), which branches other sessions pushed. |
| 13 | Auto-memory `MEMORY.md` for this project | Session-scoped facts: the PM/worker arrangement, the session-capture collection gap, the MCP path fix. Verify any path or flag it names still exists before relying on it. |
| 14 | `~/.claude/plans/abundant-gathering-wirth.md` | The harness plan; V-2 is its Phase 6b in effect. Read only when V-2 is the phase at hand. |

Not to read at start: `docs/planning/10_–31_*` (superseded by Requirements v2), `30_PHASED_PLAN.md`
(Docker-era plan; only its term calendar survives, copied above), the eval/POC docs
(`EVAL_EMBEDDING_POC.md`, `PLAN_EMBEDDING_POC.md`) unless retrieval quality is the topic.

## 6. Session prompts, one per phase (copy-paste; added 2026-09-14)

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
> pull-back, R-18 upload drop zone). Complete the **Contract** section of `docs/planning/67_PHASE10A_grades.md` (MVP, DoD and task loops are already frozen there; migration range 041–059), and the seams with Phase 11 and V-1 (V-1 owns
> `grading_schemes`/`grade_components` data; 10a reads them, never writes). Put your open
> questions to me and wait for my answers. Then branch `feat/grades-10a` off `main`, create the
> worker worktrees, and spawn Opus workers. Stop at the PR.

**Phase 10b — grades: methodology model + what-if** (ran 2026-09-16; Stack waived the V-1 precondition — kept for the record)

> `/bb2dash-pm` Start Phase 10b (R-12 methodology model and what-if). Preconditions: 10a is on
> `main`, `bb_gradebook` holds more than ten non-attendance scores, and
> `65_GRADING_VALIDATION_SUMMARY.md` shows every course signed off with its reconciliation
> migration applied. Verify all three and stop if any fails. Then complete the Contract section of
> `docs/planning/68_PHASE10B_grade_model.md`, ask your open questions, wait, and build the way
> 10a was built. Every computed figure is labelled as a model; IST.471 shows not-computable.

**Phase 11 — planner and calendar** (in parallel with 10a)

> `/bb2dash-pm` Start Phase 11 (R-19 planner week grid, R-25 push-only Google Calendar sync,
> R-20 bell + Announcements page, R-16 data gaps). Complete the Contract section of `docs/planning/69_PHASE11_planner.md`
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
> `C:/Users/estac/projects/bb2dash/docs/planning/66_SESSION_ARCHIVAL_RAG.md` in full — it is the
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
> calendar). The brief `docs/planning/69b_PHASE11B_planner_events.md` is frozen with my answers of
> 2026-09-16 (own time zone per event, optional physical or online location, working location as
> an ordinary kind, appointment slot kept, no task→assignment link, kind colour wins). Migration
> range 067–072; Phase 12 moves to 073–079. Cut `feat/planner-events-11b` from `main` in its own
> worktree, confirm the seams with whatever 10a has merged (its `run_transform` is untouched by
> this phase), spawn W-23 (db + push: 067–068, `calendar-push` v4, live proof) and W-24 (web:
> query layer, form, blocks, zone handling), integrate, run the gates, update STATUS, DECISIONS
> and ORCHESTRATOR, open the PR with a preview, and stop at "ready when you say so".

**Phase 12 — Electron shell** (ran 2026-09-16; Contract and answers in `80_`; the brief file is `80_`, not `70_`)

> `/bb2dash-pm` Start Phase 12 (R-23 Electron shell, R-26 desktop notifications). Complete the Contract section of
> `docs/planning/80_PHASE12_electron.md`: a new `desktop/` package that loads the deployed web
> app, zero renderer changes, jobs = mirror files to `course context/<course>/<bucket>/`,
> desktop notifications, Sync button that opens Windows Terminal with the sync command ready;
> no crawl, no `shell.openPath` from the mirror, no installer. Ask your open questions
> (launch-at-login default, notification sources), wait, then branch `feat/electron-12`, spawn
> workers, stop at the PR with an unpacked build I can run.

**Phase 13 — styling pass** (last, after every screen exists)

> `/bb2dash-pm` Start Phase 13 (R-21 styling). First list every screen and component in `web/`
> and confirm none is a stub. Propose three visual directions as a design canvas for me to pick
> from; wait. Then complete `docs/planning/81_PHASE13_styling.md`, branch `feat/styling-13`, and
> spawn workers: CSS custom properties only, no Tailwind, no layout changes, no new
> dependencies. Vercel preview before the PR; stop there.

**Phase 12b — fine-tooth-comb pass** (after 12 merges, before 13)

> `/bb2dash-pm` Start Phase 12b. Read `docs/planning/80c_PHASE12B_page_pass.md` and follow its
> Method exactly. My list of bugs and changes by page follows below. Give every item an id,
> triage it, spawn Sonnet researchers (one per page) to reproduce, locate and size, then bring me
> your questions in one batch. After my answers, write the MVP, DoD and task loops into the brief
> and stop for my approval before spawning any worker.
>
> <the list, grouped by page>

**Phase 14 — containers (R-28)** (after 13 merges)

> `/bb2dash-pm` Start Phase 14. Read `docs/planning/82_PHASE14_containers.md` and the six
> `research/82_RESEARCH_phase14_*` files. Re-check R5's Electron seam against the merged
> `desktop/src/main/` code. Put the brief's open questions to me and wait. Then freeze the
> Contract, create the `bb2dash-stack` and `vault` repos with me, run task 2 (the noVNC login
> spike) as a gate before anything else, and only if it passes cut worktrees in bb2dash and
> agentic-harness, spawn W-27 / W-28 / W-29, integrate, run the gates on all three PRs, and stop
> at "ready when you say so". Keep the Windows path working until my acceptance sitting.
