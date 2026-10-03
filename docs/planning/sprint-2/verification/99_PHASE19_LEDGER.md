# Phase 19 — task ledger and driver loop

PM-owned. The single source of truth for what is done, what is next and what blocks it, read and
updated on every tick of the Phase 19 driver loop. Brief: `../briefs/99_PHASE19_content_history.md`
(frozen 2026-10-02 at 92b3af9). Phase branch `feat/content-history-19`, worktree
`C:/Users/stack/projects/bb2dash-wt-content-history-19`.

**Stack's instruction, 2026-10-03:** "Once the worker returns, I want you to check its work. If it is
good you will move onto setting up a loop/system to generate tasks for the requirements in order to
complete this phase without the user needing to input anything throughout. I will review once the
requirements are assessed as complete."

**Standing authority already given:** B-19's ghost merge and B-20's 30-minute terminal rule (yes,
2026-10-02); "apply 131–137" (2026-10-02). **Not given:** merge to `main`, deploying `search` or any
edge function, publishing anything outside the PR. The loop ends at "ready when you say so".

## Tick procedure (what one loop iteration does)

1. **Liveness.** `ListAgents`. For each worker shown `running`, read the newest commit time on its
   branch and the newest file mtime in its worktree. No change for 20 minutes and no active query on
   prod (`pg_stat_activity`) = stalled: commit its uncommitted files as a `wip(19-T<n>): PM
   checkpoint` on its branch, `TaskStop` it, then `SendMessage` it to resume with the checkpoint SHA
   and the current prod state. A second stall of the same worker: spawn an Opus finisher instead,
   briefed with the commit list.
2. **Prod state.** Applied `^13[0-9]_` migrations, open sync requests, the newest `sync_runs` row.
3. **Pick work.** Every row below whose "blocked by" is all `done` and whose state is `todo`: a PM
   row is done in this tick; a worker row is sent to its worker (`SendMessage`; the worker's context
   survives). Independent rows run in parallel.
4. **Record.** Each finished row gets its evidence (commit SHA, the check's actual output in one
   line, or the md5 pair). Commit and push this file on the phase branch
   (`docs(19): ledger tick <n>`).
5. **Assess.** When every task row is `done` or `parked`, fill the requirement table from the
   evidence. All `met` (or `parked` with a named reason only Stack can clear) ends the loop: open
   or update the PR with its Vercel preview, write the findings and parked items into the PR body,
   stop the loop, and report to Stack.

Rules the loop never breaks: never merge or deploy; migrations only in number order, each dry-run in
`begin; … rollback;` first, applied under the file's name byte-identical, md5 checked after; never
edit an applied migration (a fix is 138/139, recorded in DECISIONS); `select count(*) from
agent_requests where kind = 'sync' and state in ('queued','claimed')` is 0 immediately before 135;
a permission denial is parked and reported, never routed around; workers never touch
`project-state/`; nothing secret in any file or report.

## Tasks

State: `done`, `doing`, `todo`, `parked` (reason named). Owner W-52 content, W-53 driver, W-54
screens, PM.

| # | Task | Owner | Blocked by | State | Evidence |
|---|---|---|---|---|---|
| 1 | Tests 130/131 first (RED) | W-52 | — | done | 089adf5; both `passed 0, failed 1` |
| 2 | Tests 135–137 first (RED) | W-53 | — | done | c664b21; both `passed 0, failed 1` |
| 3 | 130 ghost collapse | W-52 | 1 | done | 584a268; applied, md5 `3a5a3269…` equal; S₀ 26 D₀ 21 N₀ 239 → D 0, S 5, N 218 |
| 4 | 131 key swap, `stage_content`, re-fold | W-52 / PM applied | 3 | done | blob c8aba6d applied by the PM 2026-10-02 on Stack's word; md5 `24670dbb…` equal; path key 0, item key 1, files 17/19 in tree 2, N 225; checks 7b30149 |
| 5 | Real change counts, newest crawl only | W-52 | 4 | done | 7b30149 (second fold `updated 0`) |
| 6 | `bb_type` kept (P-95) | W-52 | 4 | done | 7b30149 (diff 0, no handler column) |
| 7 | 132 history table, record fn, backfill, restamp | W-52 → PM applies | 4 | done | blob 54b8c27 applied by the PM 2026-10-03; md5 `9189a345…` equal; 229 rows (appeared 153, changed 59, vanished 17); `authenticated` cannot execute, `anon` cannot select |
| 8 | One vanish convention | W-52 | 7 | done | after 132: task 8 queries 0 and 0; GEO.103 `_13177625_1`, `_13177626_1` restamped to `6b122650` |
| 9 | 133 Stream from history | W-52 → PM applies | 7 | done | blob 10ae0a5 applied 2026-10-03; md5 `3fb82588…` equal; columns unchanged; untraced material posts 0; 65 material posts; anon 0 |
| 10 | 134 Activity names materials | W-52 → PM applies | 9 | done | blob e14cf24 applied 2026-10-03; md5 `77268e7d…` equal; unit result in the full-suite row below |
| 11 | `DATA_SYNTAX.md` key + table | W-52 | 7 | done | 6b0f426; greps 4 and 6; W-52 merged into the phase branch at 0a2b478 |
| 12 | 135 open at claim; `run_transform` adopts, `history` stage | W-53 → PM applies | 10 | doing | W-53 re-dry-running with the real 132 (resumed 2026-10-03) |
| 13 | 136 fold only on calendar row | W-53 → PM applies | 12 | todo | draft ae33266 |
| 14 | 136 terminal rule | W-53 | 13 | todo | — |
| 15 | 137 `notes`, `interrupted` | W-53 → PM applies | 14 | todo | draft ae33266 |
| 16 | 137 `streams` (R-41 per-stream read) | W-53 | 15 | todo | before-fold state `never` to record before task 27 |
| 17 | Skill register-first (steps 2–4) | W-53 | 13 | todo | text prepared |
| 18 | Runbook step 5, crawler comments | W-53 | — | done | 4cd9590; greps 1/0/0; crawler vitest 114 |
| 19 | `sync-run-state.ts` | W-54 | — | done | eb14678; 23 passed |
| 20 | `freshnessLine` + three columns | W-54 | 19 | done | 87d5eb6; numstat 14 ≤ 15 |
| 21 | Stream label, date, key | W-54 | — | done | dc84958; new "New and changed materials" block (the Stream is the week timeline since 2026-09-29); placement for Stack's review |
| 22 | Classwork same-path nodes | W-54 | — | done | e091f2e; no production change |
| 23 | Raw-HTML guard | W-54 | — | done | 1cd49ba; only `layout.tsx` |
| 24 | Desktop "Sync interrupted" toast | W-54 | — | done | 21b691d; reducer + sources 94 passed |
| 25 | Integrate: merge branches, regenerate types, full suites | PM | 11, 17 | todo | — |
| 26 | Migrations recorded 8/8, md5 table, advisors | PM | 16 | todo | — |
| 27 | First register-first sync, live | PM via `/bb-sync` | 17, 25, skill installed | todo | needs the Chrome Blackboard tab signed in; parked for Stack if not |
| 27b | Live terminal-rule proof (a claimed, registered run that never crawls → interrupted after 30 min + one tick, one Inbox item, Sync freed) | PM | 16 | todo | provides walk shots 05/06 |
| 28 | Walk on the preview, `walk-19/01`–`06` | PM | 25, 27, 27b | todo | `web/e2e` harness, `WALK_VERCEL_SHARE` |
| 29 | Nine DECISIONS rows, STATUS, ORCHESTRATOR | PM | 26 | todo | — |
| G1 | `/code-review main high`; CRITICAL/HIGH back to workers as round 2 | PM | 25 | todo | — |
| G2 | `/security-review` | PM | 25 | todo | — |
| G3 | PR open with preview link; stop at "ready when you say so" | PM | 26, 28, 29, G1, G2 | todo | — |

Carried into the PR body as open points for Stack (not blocking): the Stream block's placement
(W-54's pick); the interrupted toast's body and target; Home's "last synced <time> · last sync
interrupted" wording; a request whose run folded but whose session died before closing it stays
`claimed` (outside the frozen terminal rule; a 30-minute cut-off would close a legitimate long
file pull); the live desktop toast needs a desktop build from the phase branch.

## Requirement assessment

| Req | Proved by (brief §"What proves each requirement") | State |
|---|---|---|
| R-38 | task 9's SQL, shot 03 | todo |
| R-41 (run states, per-stream read) | tasks 2, 12, 14, 15, 16, 19, 20, 24; shots 04–06 | todo |
| R-64 | tasks 3, 4; shots 01, 02 | todo |
| R-65 | tasks 12–14, 17, 27 | todo |
| R-71 | tasks 5, 7, 8, 10 | todo |
| R-76 | task 29's row; task 23 | todo |
| P-25 / P-94 / P-95 / P-98 | tasks 3 / 23 / 6 / 8 | todo |
