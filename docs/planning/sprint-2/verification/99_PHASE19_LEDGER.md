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
| 12 | 135 open at claim; `run_transform` adopts, `history` stage | W-53 → PM applied | 10 | done | md5 `adc27d3b…` equal; runner PASS; live: request 580 opened run 592 `running` at claim (17:22:26Z) |
| 13 | 136 fold only on calendar row | W-53 → PM applied | 12 | done | md5 `9feca071…` equal; runner PASS (`phase19_135_136`, `phase9_transform_states`); cron `*/2 * * * *` |
| 14 | 136 terminal rule | W-53 | 13 | done | runner PASS; live 2026-10-03 17:54:00Z: run 592 `failed`, `interrupted_at` set, notes `interrupted (reaped)`; request 580 `failed` `{error: interrupted, sync_run_id: 592}`; one open Inbox item 2636 |
| 15 | 137 `notes`, `interrupted` | W-53 → PM applied | 14 | done | md5 `30ff4742…` equal; 12 columns; anon 0; runner PASS |
| 16 | 137 `streams` (R-41 per-stream read) | W-53 | 15 | done | runner PASS; 9 streams, 0 disagree with `v_data_freshness`, owner reads 9; pre-fold `history` `never`, 0 rows (the `fresh` half after task 27 rides task 27) |
| 17 | Skill register-first (steps 2–4) | W-53 | 13 | done | 51a0e47; greps 0/0/1/1; installed to `~/.claude/skills/bb-sync/SKILL.md` by the PM 2026-10-03 (previous copy backed up in the session scratchpad) |
| 18 | Runbook step 5, crawler comments | W-53 | — | done | 4cd9590; greps 1/0/0; crawler vitest 114 |
| 19 | `sync-run-state.ts` | W-54 | — | done | eb14678; 23 passed |
| 20 | `freshnessLine` + three columns | W-54 | 19 | done | 87d5eb6; numstat 14 ≤ 15 |
| 21 | Stream label, date, key | W-54 | — | done | dc84958; new "New and changed materials" block (the Stream is the week timeline since 2026-09-29); placement for Stack's review |
| 22 | Classwork same-path nodes | W-54 | — | done | e091f2e; no production change |
| 23 | Raw-HTML guard | W-54 | — | done | 1cd49ba; only `layout.tsx` |
| 24 | Desktop "Sync interrupted" toast | W-54 | — | done | 21b691d; reducer + sources 94 passed |
| 25 | Integrate: merge branches, regenerate types, full suites | PM | 11, 17 | done | final head 0fb0b10: SQL 59/59 (exit 0), web typecheck 0, build 0, vitest 2314/2314 (main 2221), desktop typecheck 0, vitest 708/708; types fbae093; `mcp-server/` untouched; 13/13 migrations md5-equal repo vs prod |
| 26 | Migrations recorded, md5 table, advisors | PM | 16 | done | 13/13 recorded (130–139, 170–172), each md5 equal to its blob at HEAD; advisor 0 findings naming a Phase 19 object |
| 27 | First register-first sync, live | Stack (`/bb-sync` 866) | 17, 25, skill installed | done | 2026-10-03: request 866 claimed 19:28:58Z opened run 800 `running` at claim; first `bb_raw` 19:29:26Z; folded 19:30:01Z `ok`, 9 stages `ok` incl. `history`; task 27's check → true; all 9 streams `fresh` (task 16's second half). Observed: a new Kaltura video (LTI item "IST-323 Lab #2 Tips") was recorded in history but not posted, because the Stream's material kinds are 027's document, link and file — put to Stack |
| 27b | Live terminal-rule proof | PM | 16 | done | request 580 → run 592 `running` at claim, reaped at the 17:54Z tick, request `failed`, Inbox item 2636 open; Sync freed (0 open) |
| 28 | Walk on the preview, `walk-19/01`–`06` | PM (walk helper) | 25, 27, 27b | done | 6 of 6 (01–03 afd529d; 04 ff029d5 during 27b; 05–06 10b7bb1 after the reap); cold loads, no console errors on 01–06; 04 is from the 27b run, not a crawl (task 27 can retake it) |
| 29 | DECISIONS rows, STATUS, ORCHESTRATOR | PM | 26 | done | DECISIONS 339 → 349: the nine task-29 rows (amended for rounds 2–3) plus the block 170–179 row; STATUS row 21, header, known issues; ORCHESTRATOR header, §1, §2 rules 6 and 8, §4 |
| R2-1 | 139 re-key a re-created item (keeps its link) | W-52 → PM applied | 137 | done | md5 `54ea43dc…` equal; `stage_content` prosrc `ba31b9cb…`; runner PASS (`phase19_139`, `phase19_131`, `phase18_124` re-pinned fd39dea) |
| R2-2..5 | 138 materials-only counts, path rule, session urls, older-run predicate | W-52 → PM applied | 137 | done | md5 `eded5cb4…` equal; runner PASS (`phase19_138`, `phase19_132`, `phase19_133`, `phase17_110`); 10 backfilled path-only rows kept |
| R2-6, R2-7 | Honest "last synced"; interrupted toast opens the Inbox | W-54 | — | done | d98ac0f, d2d9391; web 2302, desktop 708; numstat `16 7`; merged b949d63 |
| R2-8 | `DATA_SYNTAX.md` heading | W-52 | — | done | 38ddc53 |
| R3-1..5, 9 | 170 history fn + data step + Stream view; 171 `stage_content` re-key only onto fresh gaps | W-52 → PM applied | 139 | done | 170 (11e40bc) md5 `ae78cfc7…` equal: history 229 → 219, path-only rows 0, material posts 65 → 69 (4 uncatalogued files now resolve), untraced 0; 171 (6de6f62) md5 `5eed0b5f…` equal, `stage_content` prosrc `1cdcd890…`; R3-9's predecessor scan left as is (no single-statement narrowing keeps results identical) |
| R3-6 | Skill: interrupted run stops at step 4; step 5 guarded on `claimed` | W-53 | — | done | 543fade, merged e338bd7; greps 0/0/1/1; installed skill re-copied from the phase branch (`cmp` 0) |
| R3-7, R3-8 | Stream block error line; one import | W-54 | — | done | 6c10b0e, 20e4ca3, merged c9d9b15; web typecheck 0, build 0, vitest 2304/2304; `queries.sync.ts` numstat `22 7` (the 15-line cap was lifted for R2-6) |
| R4 | Videos (LTI) post as links, never downloaded (Stack, after sync 866) | W-52 → PM applied; W-54 | 27 | done | 172 (edc0f08) md5 `cc483bff…` equal; material posts 69 → 71 incl. "IST-323 Lab #2 Tips"; 0 `bb_files` rows for lti items; Open link on content posts (24a480b; a video opens the course's Blackboard page); web 2314 |
| G1 | `/code-review main high`; CRITICAL/HIGH back to workers | PM | 25 | done | pass 1 → round 2 (R2-1..R2-8), pass 2 → round 3 (R3-1..R3-9, block 170–179); every HIGH fixed; 5 findings not changed, each with its reason in brief 99's round sections |
| G2 | `/security-review` | PM | 25 | done | 2026-10-03 over 130–139, web, desktop, skill: no HIGH or MEDIUM; two low notes (the test role's widening grants; walk shots show course content) |
| G3 | PR open with preview link; stop at "ready when you say so" | PM | 26, 28, 29, G1, G2 | done | PR opened 2026-10-03 against `main` with the preview link; the loop stops here |

Carried into the PR body as open points for Stack (not blocking): the Stream block's placement
(W-54's pick); the interrupted toast's body and target; Home's "last synced <time> · last sync
interrupted" wording; a request whose run folded but whose session died before closing it stays
`claimed` (outside the frozen terminal rule; a 30-minute cut-off would close a legitimate long
file pull); the live desktop toast needs a desktop build from the phase branch.

## Requirement assessment

| Req | Proved by (brief §"What proves each requirement") | State |
|---|---|---|
| R-38 | task 9's SQL, shot 03 | met: untraced material posts 0 (task 9); shot 03 shows New/Changed posts dated by crawl. The block's placement is open for Stack's walk |
| R-41 (run states, per-stream read) | tasks 2, 12, 14, 15, 16, 19, 20, 24; shots 04–06 | met: run states live and proven (27b, sync 866); per-stream read live, `history` went `never` → `fresh` with sync 866; Phase 17's half on `main`; the live desktop toast needs a desktop build after merge |
| R-64 | tasks 3, 4; shots 01, 02 | met: 0 duplicate pairs, path key gone, files 17/19 in the tree, shots 01 and 02 |
| R-65 | tasks 12–14, 17, 27 | met: open at claim, fold only when complete and the terminal rule are live; register-first proven with a real crawl (sync 866, task 27 true) and the terminal rule proven by 27b |
| R-71 | tasks 5, 7, 8, 10 | met: real change counts, history (229 rows backfilled), one vanish convention, named Activity lines; rounds 2–3 made Activity count what the Stream shows |
| R-76 | task 29's row; task 23 | met: closed by the DECISIONS row; the raw-HTML guard passes |
| P-25 / P-94 / P-95 / P-98 | tasks 3 / 23 / 6 / 8 | met / met / met / met |
