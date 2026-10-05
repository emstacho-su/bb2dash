# bb2dash — Project State

> Updated upon each PR. Last update: **2026-10-05** (**Inbox undo**, `feat/inbox-undo-answer`, [PR #74](https://github.com/emstacho-su/bb2dash/pull/74), web only: every answered, unapplied Inbox row offers Undo, which puts the row back to `open` as raised; item 3426 was put back by hand the same way before the next fold could apply its wrong answer; section "Inbox undo" below). Before that, **2026-10-05** (**Phase 14 follow-up — the Sync button after cut-over**, `feat/sync-button-runner-indicator`, [PR #72](https://github.com/emstacho-su/bb2dash/pull/72), web only: a press files the row and copies nothing; the label follows the container's runner (`starting… / crawling… / pulling files…`, the arrows circling), names a Claude Code session's claim, and offers the paste command only for a row nothing claimed in 75 s; section "Phase 14 follow-up" below; file 2489's `InvalidKey` recorded under Known issues). Before that, **2026-10-04** (**Phase 14 — containers**, built on `feat/containers-14` + agentic-harness `feat/containers` + bb2dash-stack `feat/containers-14-stack`, launcher PR #62; **all four PRs merged 2026-10-04 on Stack's word, before his acceptance sitting**: migrations 091, 093, 094 live and md5-identical; the sync runs in the `sync` container since 2026-10-03 22:52Z with Stack's Blackboard login; task 28's live proofs and task 27's image proofs pass; A1–A9 owed — section "Phase 14"). Before that, **2026-10-03, evening** (**sprint 2 status and requirements audit**, `docs/planning/sprint-2/108_SPRINT2_AUDIT_2026-10-03.md`: the 81 requirements R-29..R-109 read against `main` f86c818 and prod by five Opus auditors, read-only; 48 met, 10 built but unproven live, 11 partly, 5 closed by decision, 7 open; the syncs of 2026-10-01 and 10-03 settled most of what Phase 18 owed; Phase 14 is in flight in its own session and its container runner has served prod since 22:52Z; gates on `main` this evening: SQL suite 58/59 (the one FAIL, `phase15_100_db_test_runner_role.sql`, expects `db_test_runner`'s memberships without the `sync_runner` that Phase 14's live 094 added; the branch's one-line change is ported byte-identical in [PR #65](https://github.com/emstacho-su/bb2dash/pull/65)), web vitest green, web typecheck exit 2 only because the main checkout's `web/node_modules` lacked `@playwright/test` since Phase 17, 0 errors after `npm --prefix web ci`; rows 18–21, the What's-next table, the Security paragraph and Known issues corrected below; seven DECISIONS rows). Before that, **2026-10-03** (**Phase 19 — content identity, per-crawl history, sync honesty**, **merged 2026-10-03 on Stack's word "merge this phase" ([PR #60](https://github.com/emstacho-su/bb2dash/pull/60), 206ee3a), production deployed**: migrations 130–139 and 170–172 live and md5-identical (13 of 13; 170–179 is the overflow block); `bb_content` keyed by Blackboard item, 21 rename ghosts merged; per-crawl material history and New/Changed material posts; a sync reads "running" from its claim, folds only when complete, and reads "interrupted" after 30 minutes (proven live 2026-10-03, run 592); SQL suite 56/56, web 2302, desktop 708; walk 6/6 on the preview; first register-first sync proven live by Stack's sync 866 (run 800, task 27 true) — row 21 under "What has been done"). Before that, **2026-10-02** (**lecture-number session links**, `feat/lecture-number-session-link`, migration 162: a numbered lecture takes its week's only non-exam session, or its rank among the week's lectures; a lone lecture in a two-session week still asks; **162 applied to prod 2026-10-02 on Stack's word; 163 (review fix: archived answers still count) applied the same day on his word; merged 2026-10-02, PR #56, fb8a0a6**. 2026-10-01: **pull keeps existing text**, `fix/pull-keep-existing-text`: a first pull whose unit POST answers 409/23505 keeps the units already there and still emits the bytes update (`textKept`), so a row like 163 is no longer stuck; ingest 100/100. **Sync 443 was the clean gate:** 161, 452, 966, 967 pulled and embedded, 72 and 144 re-checked, missing parts 0, db-test 45/45, gaps 547 and 549 archived; 163 written by hand by the PM after the 409. Next: Phase 19). Before that, **2026-10-01** (**sync file pull through Chrome**, `fix/sync-file-pull-chrome`, PR not opened yet: after sync 394 pulled no file, step 4b runs in Stack's logged-in Chrome only — Chrome saves each file and `ingest/collect_download.mjs` moves it for `pull_files.mjs` (no `--fetch`); outside links (738–746) leave the manifests, `files_not_pulled` and the Inbox gaps via migration 161 (**applied 2026-10-01, md5-identical** dfe6812c…; the 9 gaps closed) and read "Outside link" in the web; the crawler prefers the anchor's href so file 161 moves to the live Fall copy; the live Chrome probe passed (a PDF saved via `?xythos-download=true`, the inline fallback saved `bb2dash-161.pdf`, the collector took both, no Chrome prompt); review: no critical/high, the medium (unreported name mismatch) and two lows fixed; Phase 18's 122 and golden Q7 tests follow sync 394's 150/162 → 967 swap; ingest 98/98, web vitest 2221, db-test 44/45 (post-embed (a) lists 161, 452, 966, 967 until a sync pulls them); **after merge:** refresh `~/.claude/skills/bb-sync/SKILL.md` from `main`, Stack reruns the sync, the PM checks file 161's new `source_url` and bytes, gap 547 archived, and re-reads the gate's BLOCKED rows). Before that, **2026-09-30** (**search collapsed to an icon**, `feat/search-icon`: the top bar's wide "Search ⌘K" box is one search icon that expands in place into a "Search materials" field with results in a panel under it, ⌘K kept, the centered dialog removed; web vitest 2184, automated walk 25/25 on the preview, shot 28; T-24 dropped on Stack's word, DECISIONS). Before that, **2026-09-30** (**Phase 20 — harness closure**, PR-C #48 merged on Stack's word: PR-A bb2dash #39 (R-97, 2904b20) and PR-B agentic-harness #36 (ea0e199) merged on Stack's word, plus harness #37 (00539be); hook reinstalled (L20-a), back-fill applied (L20-b), V-2 walked on live data in `docs/planning/sprint-2/verification/101a_V2_VERIFICATION.md`, **V-2 closed on Stack's word (2026-09-30)** — row 20 under "What has been done"). Before that, **2026-09-30** (**Phase 18 — ingest and corpus**, `feat/ingest-corpus-18`, **merged on Stack's word "merge this phase" before its gate sync ran**: migrations 120–129 live and md5-identical, 160 (review fix: a replacement must be new in its crawl; overflow block 160–169) live and md5-identical; notes labelled in search (121, latency repaired by 129), replaced files superseded by rule (122/124), file week and session links (123), GEO chapters off-platform (125), per-item Blackboard links (126), iCal poll retired (127), file 68 extracted by hand; ingest 83/83, SQL suite 39/40 (post-embed (a) waits on the first sync); **tasks 16–19, 26, 28 and task 14's 48 h re-read are owed to the first `/bb-sync` on `main`, which is now the phase's gate** — row 19 under "What has been done"). Before that, **2026-09-30** (**Phase 17 — web polish**, merged as PR #43; built on `feat/web-polish-17`, PR open, not merged: the planned T-tasks plus Stack's nine round-3 notes; migrations 110–119 and 150 live and md5-identical to the repo (11 of 11); web vitest 2069, SQL suite 30/30, desktop 564; round-3 walk 24/24 on the preview at b2698bf; waiting on Stack's T-24 desktop sitting, T-26 production sitting and his look at round 3 on the preview — row 18 under "What has been done"). Before that, **2026-09-29** (**desktop logon build**, [PR #31](https://github.com/emstacho-su/bb2dash/pull/31) **merged 2026-09-29** as 6295b83 from `feat/desktop-logon-build`, after PR #30 (6ef3933) and before PR #32 (795bcf6), all three on Stack's word that day: `desktop/launch/` stands the shell up after sign-in on the new laptop (`stack-laptop`, checkout `C:/Users/stack/projects/bb2dash`) and rebuilds it in an ephemeral `docker compose run --rm` container only when `desktop/` changed on the build ref; two Task Scheduler entries, `Bb2dash-LogonBuild` (logon + 2 min, below normal) and `Bb2dash-App` (the exe, normal priority, no time limit); builds keyed by the `desktop/` tree hash under `%LOCALAPPDATA%\bb2dash-launch\builds\`, a `current` junction repointed only while the app is closed; `wt.ts` joins with `node:path/win32` so the unit suite passes on Linux; no Phase 14 container is in it — a repo-root `compose.yaml`, when Phase 14 adds one, is brought up by the same task; see "Known issues / operational notes"). The same PR carries the `estac` → `stack` path pass: every live doc (state docs, the sprint-2 plan, run sheet, briefs, research and verification, the skill and ingest docs, the desktop docs and unit fixtures) now names `C:/Users/stack/...`, sprint 0–1 records keep the old paths as history, the desktop `repoDir` default is derived from the home folder, and the Task 0 record `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` exists with its eight pending rows (DECISIONS 2026-09-29; see "Known issues" for what is not stood up on this laptop yet). Before that, **2026-09-28** (**Phase 15 — database hygiene and the SQL test runner, [PR #30](https://github.com/emstacho-su/bb2dash/pull/30) merged 2026-09-29 as 6ef3933** from `feat/db-hygiene-15`, built through the evening of 2026-09-27 and opened after midnight: migrations 100, 101 and 102 live and md5-identical to their committed blobs; `node scripts/db-test.mjs` → `passed 21, failed 0, units 21`, exit 0, the first time the suite has ever run as a set; the security advisor's mutable-`search_path` list is empty (was 7); no planner series outlives its last occurrence on any delete path; eight stale assertions across seven `db/tests` files repaired, four of them units no worker owned, absorbed on Stack's decision; seven DECISIONS rows; nothing visual, so no preview walk — row 17 under "What has been done". Earlier the same day: **sprint 2 briefs verified, batch answered by delegation**: [PR #28](https://github.com/emstacho-su/bb2dash/pull/28) merged as 67269b5 from `docs/sprint2-planning`; briefs `95_`–`103_` verified in three Opus rounds, record `105_BRIEF_VERIFICATION_2026-09-27.md`; ORCHESTRATOR §6 one prompt per phase; Stack delegated the 59 batch answers and the plan approval, written as DECISIONS rows dated 2026-09-27; the calendar push has run `ok` since 2026-09-24 17:03Z but the consent screen's publishing status is still Stack's to read before 2026-10-01; execution run sheet 106 on `docs/sprint2-execution`, [PR #29](https://github.com/emstacho-su/bb2dash/pull/29), merged as 931260b). Before that, **2026-09-27** (**sprint 2 briefs verified, batch answered by delegation**: [PR #28](https://github.com/emstacho-su/bb2dash/pull/28) merged as 67269b5 from `docs/sprint2-planning`; briefs `95_`–`103_` verified in three Opus rounds, record `105_BRIEF_VERIFICATION_2026-09-27.md`; ORCHESTRATOR §6 one prompt per phase; Stack delegated the 59 batch answers and the plan approval, written as DECISIONS rows dated 2026-09-27; the calendar push has run `ok` since 2026-09-24 17:03Z but the consent screen's publishing status is still Stack's to read before 2026-10-01; execution run sheet 106 on `docs/sprint2-execution`, the execution PR (open)). Before that, **2026-09-24** (**sprint 2 planned** on `docs/sprint2-planning`, PR open: requirements `91_`, research `92_*`/`93_`, phases `94_`, briefs `95_`–`103_`; state docs corrected to the truth the same day — see "What's next — Sprint 2"; the calendar push was down 2026-09-23 19:57Z → 2026-09-24 17:03Z, see Known issues). Before that, **2026-09-23** (operations only, no code: sync request 39 → `sync_runs` 62 `ok`, 7 courses, 3 new tentative gradebook columns, 3 new course files; `/inbox-apply` request 40 archived 537–540 and raised #544 (ECN.304 Quiz 3 date), log in `docs/inbox-decisions/2026-09-23.md`; files 155–157 pulled and embedded — the Playwright `download` event now crashes the MCP browser, so the bytes came from the signed CDN link at the end of the bbcswebdav redirects, fetched with curl; `ingest/pull_files.mjs` unchanged; ~~Inbox open: 3 data gaps awaiting Stack's dismiss, #544~~ — corrected 2026-09-24: Stack answered #544 at 20:15Z and dismissed 541–543 at 20:28Z that evening, so 0 are open and those 4 wait in `v_inbox_queue` for the next `/inbox-apply`). Before that, **2026-09-22** (**sprint 1 closed** — see "Sprint 1 — closed"; planning docs reorganised by sprint under `docs/planning/`, index in `docs/planning/README.md`; Phase 13 skipped; sprint 2 intake open). Earlier the same day: Inbox feedback loop, automation half: `/inbox-apply` skill, migration 090 archived state live, first run archived 31 rows, Inbox "Apply answers" button; **PR open**, [PR #23](https://github.com/emstacho-su/bb2dash/pull/23) on `feat/inbox-apply`; row 16 under "What has been done"). Before that, **2026-09-21** (Phase 12b **tail PR open**: recurring planner events, planner popover + assignment page, migrations 082–083, 088–089 live; row 15 under "What has been done"). Earlier the same day (post-merge reconciliation, PR #21): Phase 12b fine-tooth-comb pass MVP **merged**, [PR #20](https://github.com/emstacho-su/bb2dash/pull/20), `6f20a00`, 2026-09-17, production deployed; row 14 under "What has been done"; its post-MVP tail — recurring events, small popover — waits for Stack's go; the crawler v4 proof sync has not run yet). Earlier on 2026-09-17: Phase 12 Electron shell **merged**, PR #19. Before that, 2026-09-16 (post-merge reconciliation), Phase 10b grade model + what-if **merged** Before that, **2026-09-30** (**Phase 16 — grades V-1**, PR open from `feat/grades-v1-16`: six sittings done 2026-09-29, 105 and 106 written and proven in rolled-back runs, applied after PR #40; row 19 under "What has been done"). Before that, **2026-09-30** (**Phase 17 — web polish**, built on `feat/web-polish-17`, PR open, not merged: the planned T-tasks plus Stack's nine round-3 notes; migrations 110–119 and 150 live and md5-identical to the repo (11 of 11); web vitest 2069, SQL suite 30/30, desktop 564; round-3 walk 24/24 on the preview at b2698bf; waiting on Stack's T-24 desktop sitting, T-26 production sitting and his look at round 3 on the preview — row 18 under "What has been done"). Before that, **2026-09-29** (**desktop logon build**, [PR #31](https://github.com/emstacho-su/bb2dash/pull/31) **merged 2026-09-29** as 6295b83 from `feat/desktop-logon-build`, after PR #30 (6ef3933) and before PR #32 (795bcf6), all three on Stack's word that day: `desktop/launch/` stands the shell up after sign-in on the new laptop (`stack-laptop`, checkout `C:/Users/stack/projects/bb2dash`) and rebuilds it in an ephemeral `docker compose run --rm` container only when `desktop/` changed on the build ref; two Task Scheduler entries, `Bb2dash-LogonBuild` (logon + 2 min, below normal) and `Bb2dash-App` (the exe, normal priority, no time limit); builds keyed by the `desktop/` tree hash under `%LOCALAPPDATA%\bb2dash-launch\builds\`, a `current` junction repointed only while the app is closed; `wt.ts` joins with `node:path/win32` so the unit suite passes on Linux; no Phase 14 container is in it — a repo-root `compose.yaml`, when Phase 14 adds one, is brought up by the same task; see "Known issues / operational notes"). The same PR carries the `estac` → `stack` path pass: every live doc (state docs, the sprint-2 plan, run sheet, briefs, research and verification, the skill and ingest docs, the desktop docs and unit fixtures) now names `C:/Users/stack/...`, sprint 0–1 records keep the old paths as history, the desktop `repoDir` default is derived from the home folder, and the Task 0 record `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md` exists with its eight pending rows (DECISIONS 2026-09-29; see "Known issues" for what is not stood up on this laptop yet). Before that, **2026-09-28** (**Phase 15 — database hygiene and the SQL test runner, [PR #30](https://github.com/emstacho-su/bb2dash/pull/30) merged 2026-09-29 as 6ef3933** from `feat/db-hygiene-15`, built through the evening of 2026-09-27 and opened after midnight: migrations 100, 101 and 102 live and md5-identical to their committed blobs; `node scripts/db-test.mjs` → `passed 21, failed 0, units 21`, exit 0, the first time the suite has ever run as a set; the security advisor's mutable-`search_path` list is empty (was 7); no planner series outlives its last occurrence on any delete path; eight stale assertions across seven `db/tests` files repaired, four of them units no worker owned, absorbed on Stack's decision; seven DECISIONS rows; nothing visual, so no preview walk — row 17 under "What has been done". Earlier the same day: **sprint 2 briefs verified, batch answered by delegation**: [PR #28](https://github.com/emstacho-su/bb2dash/pull/28) merged as 67269b5 from `docs/sprint2-planning`; briefs `95_`–`103_` verified in three Opus rounds, record `105_BRIEF_VERIFICATION_2026-09-27.md`; ORCHESTRATOR §6 one prompt per phase; Stack delegated the 59 batch answers and the plan approval, written as DECISIONS rows dated 2026-09-27; the calendar push has run `ok` since 2026-09-24 17:03Z but the consent screen's publishing status is still Stack's to read before 2026-10-01; execution run sheet 106 on `docs/sprint2-execution`, [PR #29](https://github.com/emstacho-su/bb2dash/pull/29), merged as 931260b). Before that, **2026-09-27** (**sprint 2 briefs verified, batch answered by delegation**: [PR #28](https://github.com/emstacho-su/bb2dash/pull/28) merged as 67269b5 from `docs/sprint2-planning`; briefs `95_`–`103_` verified in three Opus rounds, record `105_BRIEF_VERIFICATION_2026-09-27.md`; ORCHESTRATOR §6 one prompt per phase; Stack delegated the 59 batch answers and the plan approval, written as DECISIONS rows dated 2026-09-27; the calendar push has run `ok` since 2026-09-24 17:03Z but the consent screen's publishing status is still Stack's to read before 2026-10-01; execution run sheet 106 on `docs/sprint2-execution`, the execution PR (open)). Before that, **2026-09-24** (**sprint 2 planned** on `docs/sprint2-planning`, PR open: requirements `91_`, research `92_*`/`93_`, phases `94_`, briefs `95_`–`103_`; state docs corrected to the truth the same day — see "What's next — Sprint 2"; the calendar push was down 2026-09-23 19:57Z → 2026-09-24 17:03Z, see Known issues). Before that, **2026-09-23** (operations only, no code: sync request 39 → `sync_runs` 62 `ok`, 7 courses, 3 new tentative gradebook columns, 3 new course files; `/inbox-apply` request 40 archived 537–540 and raised #544 (ECN.304 Quiz 3 date), log in `docs/inbox-decisions/2026-09-23.md`; files 155–157 pulled and embedded — the Playwright `download` event now crashes the MCP browser, so the bytes came from the signed CDN link at the end of the bbcswebdav redirects, fetched with curl; `ingest/pull_files.mjs` unchanged; ~~Inbox open: 3 data gaps awaiting Stack's dismiss, #544~~ — corrected 2026-09-24: Stack answered #544 at 20:15Z and dismissed 541–543 at 20:28Z that evening, so 0 are open and those 4 wait in `v_inbox_queue` for the next `/inbox-apply`). Before that, **2026-09-22** (**sprint 1 closed** — see "Sprint 1 — closed"; planning docs reorganised by sprint under `docs/planning/`, index in `docs/planning/README.md`; Phase 13 skipped; sprint 2 intake open). Earlier the same day: Inbox feedback loop, automation half: `/inbox-apply` skill, migration 090 archived state live, first run archived 31 rows, Inbox "Apply answers" button; **PR open**, [PR #23](https://github.com/emstacho-su/bb2dash/pull/23) on `feat/inbox-apply`; row 16 under "What has been done"). Before that, **2026-09-21** (Phase 12b **tail PR open**: recurring planner events, planner popover + assignment page, migrations 082–083, 088–089 live; row 15 under "What has been done"). Earlier the same day (post-merge reconciliation, PR #21): Phase 12b fine-tooth-comb pass MVP **merged**, [PR #20](https://github.com/emstacho-su/bb2dash/pull/20), `6f20a00`, 2026-09-17, production deployed; row 14 under "What has been done"; its post-MVP tail — recurring events, small popover — waits for Stack's go; the crawler v4 proof sync has not run yet). Earlier on 2026-09-17: Phase 12 Electron shell **merged**, PR #19. Before that, 2026-09-16 (post-merge reconciliation), Phase 10b grade model + what-if **merged**
> ([PR #15](https://github.com/emstacho-su/bb2dash/pull/15), `c1e471d`, production deployed: engine `web/src/lib/grade-model/`, "Our model" on `/grades` and the
> course Grades tab, what-if + target solver + "Counts toward…" picker + score history;
> migrations 057–058 and 080–081 live; V-1 stubbed by Stack, so the model leaves out parts with
> unsure links; PM browser walk 7/7 + round 3 done; merged after 11b; phase worktrees and every merged
> branch, local and remote, removed). Phase 11b planner events **merged** the same day ([PR #14](https://github.com/emstacho-su/bb2dash/pull/14)
> + display follow-up PR #16: `planner_events` created on `/planner` and pushed to the `bb2dash`
> calendar; migrations 067–069 live; `calendar-push` v5 live). Phase 10a grades **merged** earlier the same day (PR #13:
> gradebook mirror `bb_gradebook` + `bb_attempts`, five grade views, `/grades` and the course
> Grades tab, popout submission block, staged-upload drop zone, crawler v3 with the attempts
> probe, bb-sync step 4b; migrations 046–056 live; Stack's 9/16 sync verified the mirror side).
> Phase 11 planner + calendar + bell **merged** the same day (PR #12: `/planner` week grid,
> Google Calendar push, announcements bell and page; migrations 060–066 live; Stack signed off
> the six-step acceptance script on 2026-09-16). Phase 9 merged 2026-09-15 (PR #10), Phase 8
> 2026-09-14 (PR #8). Convention: see root `CLAUDE.md`.

## Where the product is

**Backend foundation complete and live; GUI v1 deployed; retrieval polished; course page rebuilt Classroom-style (Phase 8); sync loop live (Phase 9); gradebook mirrored and shown as Blackboard's numbers, submissions catalogued, staged uploads (Phase 10a); planner week grid, Google Calendar push and announcements bell (Phase 11); planner events created in bb2dash and pushed to Google (Phase 11b); grade model on the Grades screens (Phase 10b), since Phase 12b one deterministic "graded so far" figure per course (10b's what-if and target solver removed).**
The Blackboard → Supabase pipeline, typed warehouse, document corpus, and two-tier search API
are all in prod. The Next.js hub app (`web/`) — all four v1 screens — is merged to `main`
(PR #4) and deployed to Vercel at `https://web-xi-ten-uy9xk6c6p0.vercel.app`; the owner account
has signed in successfully. RLS is owner-scoped (W-9, migration 020). Search now returns the
passage that matched (not the unit head) and hides superseded document versions by default
(Phase 7, live in prod). Phase 6 is fully closed: Stack signed off the live screens and
disabled signups on 2026-09-10.

Live in prod (Supabase `bb2dash`, ref `goultdzqcavefcgnifdy`):

| Layer | State |
|---|---|
| Raw capture | `bb_raw` crawls via `ingest/bb_crawler.js` **v4** (**v5 on `main` since Phase 18**, 2026-09-30: probe, author resolution, `feedbackToUser`; six v5 crawls by 2026-10-03, the first on sync 394 of 2026-10-01) (anon insert, unique per run/kind/shell; versioned envelope; attempts read the way Blackboard's UI does — grade → attempts → detail, `80f`; `runAll({ runId })`); last crawl 2026-09-23 19:56Z (`sync_runs` 62; `sync_runs` 63 on 2026-09-24 is the daily iCal poll, not a crawl; sync 34 on 2026-09-22 was the v4 proof: 26 attempts, 55 gradebook columns; 52 attempt rows and 58 latest columns on 2026-09-24). Folded automatically: `transform_tick()` on pg_cron every 2 min stages only crawls registered on an owner-claimed `agent_requests` row; unregistered runs are quarantined once |
| Typed warehouse | migrations 001–058, 060–069, 073–089 (repo numbering; see note below; all on `main` and live); **`grade_scenarios`** (10b's saved what-ifs; unused since 12b removed what-if, 0 rows, kept in the DB) and **`grade_column_links`** (Stack's column → part links and "Not graded"), both owner-only, never touched by a sync; views `v_grade_model_items` (77 items: 41 item + 5 attendance + 31 placeholder on 9/16), `v_grade_model_total` (`bb_running` read from the total's formula; IST.323 true; no app reader since 12b), `v_gradebook_history` (5 changed columns); 7 courses, 80 assignments, 145 sessions, planner tables; `attention_items`, `agent_requests`, `app_settings` (+ `gcal_*`, `web_base_url`), `calendar_events` mirror (keyed `(source, ref_id)` since 068), `calendar_push_runs`, `v_calendar_push_items` (assignment + planner arms), **`planner_events`** (owner-only, own IANA zone per row, 0 rows until Stack creates some), `v_announcements_unread`; **`bb_gradebook`** (append-per-run mirror: 45 rows from the 9/14 crawl + 48 from 9/16; IST.323 total 14.8/104), **`bb_attempts`** (52 rows on 2026-09-24; filled since sync 34); every public view `security_invoker`, anon revoked |
| Gradebook mirror (10a) | `stage_gradebook` + `stage_attempts` in `run_transform` after `stage_assignments`; `v_gradebook_latest` (`column_kind` item / attendance / total / calc_other / letter, `assignment_id`, `linked_assignments`, `counts_toward_grade`), `v_assignment_grade`, `v_course_grade`, `v_attempts_latest`, `v_assignment_attempts`; registered runs only; reconciliation 45/45 columns and scores against `bb_raw` on the 9/14 crawl; every figure carries `seen_at`, nothing summed |
| Effort model | migration 015 `effort_base` (19 types) + 016 `v_work_items` (152 items, effort + source) |
| Document corpus | **2026-09-30 (Phase 18): 97 current files of 108; 785 units on current files; 1,733 gte-small parts on current files; 0 units without an embedding; `na` = 17 (twin of 15) and 810 (a staged file); file 68 extracted by hand; 161, 162, 452 catalogued, not yet pulled.** Earlier: 84 current files on 2026-09-24 (93 rows, 9 superseded), all with bytes in Storage (file 17 only through file 15's key); 82 text-extracted, 2 `text_status = na` (~~image-only, R-16's OCR pair~~ corrected 2026-09-24: 17, a duplicate of 15, and 68, a legacy GEO.103 `.doc` with no extractor; neither is image-only); 784 text units; supersession seeded by 022 and by re-uploads since (a re-upload gets its own key and supersedes the older row, 2026-09-22) |
| Search: FTS | tsvector+GIN on file text / content / announcements; `search_file_text(…, p_include_superseded)` |
| Search: vectors | 1,545 gte-small embeddings (384-dim) on 2026-09-24, 0 units without one; `part_range` = code points, audit clean (023); `match_file_text()`, `hybrid_search_file_text()` (`p_min_similarity` floor, single-source `similarity`, **matched-passage `snippet` + `part_no` + `snippet_source`**, superseded filter — migrations 012–013, 021, 024–025); keyword snippets come from the highest-`ts_rank` part that actually contains the query, ~27 ms at limit 12 |
| Edge functions | `embed-corpus` **v5** (resume-safe batch embedder; chunks by code point), `search` **v5** (retrieval API; **default mode: hybrid**; optional `min_similarity` floor; optional `include_superseded`), `calendar-push` **v5** (Google Calendar upsert/delete by deterministic event id — `bb…` for due dates, `pe…` for planner events; planner body carries the kind in the title, a per-kind colour, `✓` on a done task, `dateTime` + `timeZone` or an all-day date pair; both sides read page by page, a partial read aborts; `verify_jwt` off, `x-push-secret` from Vault; fired by pg_cron `bb2dash-calendar-push` when `app_settings.gcal_dirty`) |
| Retrieval MCP | `mcp-server/` — stdio MCP server for Claude Code: `search_materials` (+ `include_superseded`) / `get_material_text` / `list_courses`; 86 vitest tests |
| GUI (`web/`) | Next.js 16 + TS, Supabase Auth. Screens: Today (56-day fetch, 14 visible, ◂ ▸ paging; needs-attention row from `v_sync_status`), Course = Stream / Classwork (Blackboard folder tree, `?view=timeline` keeps the week rail) / Grades (Phase 10a) / Info, Materials, ⌘K search, `?item=` assignment + session popouts, **courses sidebar** (☰ toggles it; on the right, `--sidebar-side` flips; overlay drawer under 1024px), **Inbox** (`/inbox`, resolve + why-note per row), Sync button (enqueues `agent_requests`; since 2026-10-05 its label follows the container's runner, and `claude --model sonnet "/bb-sync <id>"` is copied only as the fallback for a row nothing claimed), Activity list, **Grades** (`/grades` by course: "Blackboard's number, as of <seen_at>" / "Blackboard publishes no total" / "not synced yet"; item rows with status pill, `score / possible`, seen, feedback disclosure; uncounted attendance, letter and non-total calculated columns in a collapsed group), **course Grades tab** (same table for the course's shells), **popout submission block** (status, attempt N of M, pulled-back and staged files with a sha256 match chip; no score line; feedback and score history moved in by 12b), **staged-upload drop zone** (popout + Classwork rows → Storage + `bb_files` row, "Staged in bb2dash — attach in Blackboard ↗"; no control reads "Submit"), **Planner** (`/planner?week=`, Mon–Sun week grid: class blocks with room + session topic, due items by New York wall clock or nested in their class block, Assignments band, today + now-line, quick-edit, click-to-popout; **planner events** (Phase 11b): click an empty half-hour slot or an Events-band cell → `PlannerEventForm` (six kinds, zone picker, in-person or online location, notes, course), per-kind blocks placed by New York wall clock with a zone chip for other zones, task checkbox, Events band for all-day, edit/delete from the block), **bell** (unread badge from `v_announcements_unread`; opening marks seen), **Announcements** (`/announcements`, all courses newest-first), public `/privacy` + `/terms` (for the Google consent screen), **graded so far** (Phase 12b replaced 10b's "Our model" line, projections, agreement sentence, what-if cells, placeholder rows, target solver and Reset scenario with one deterministic figure per course from mirrored scores, `grade_components` and column links, naming under it the parts it leaves out; the "Counts toward…" picker stays; score history moved to the popout); vitest 1812 tests (2026-09-21, row 15) |
| Auth | one user (`emstacho@syr.edu`, uid `fd0b7c9d…`) created; **RLS owner-scoped** (migration 020, W-9 done) — every authenticated policy is `auth.uid() = public.app_owner()`, owner resolved by email; signups disabled 2026-09-10 per Stack (a dashboard setting SQL cannot read; 1 auth user on 2026-09-24) |

## What has been done (by phase)

1. **Phase 1 — data syntax + syllabus seed** (pre-repo, 2026-09-02): schema design, 6 grading
   models as declarative rules, facts-vs-state separation, source/confidence on every row.
2. **Phase 2 — Blackboard capture** (2026-09-02/03): crawler over Ultra's internal JSON API,
   course maps, full file harvest + text extraction via bb-course-map / bb-course-pull skills.
3. **Phase 3 — audit + search schema** ([PR #1](https://github.com/emstacho-su/bb2dash/pull/1),
   merged 2026-09-09): extract audit (`AUDIT_2026-09-09.md`), backfilled drifted migrations
   005–009, migration 010 search layer.
4. **Phase 4 — embedding POC** ([PR #2](https://github.com/emstacho-su/bb2dash/pull/2),
   merged 2026-09-09): gte-small via edge functions, $0; corpus fully embedded; eval verdict
   in `EVAL_EMBEDDING_POC.md` — hybrid hit@1 9/10 vs FTS 1/10; hybrid is the hub default.
5. **Phase 5 — Retrieval MCP** ([PR #5](https://github.com/emstacho-su/bb2dash/pull/5), merged
   2026-09-09, by the concurrent session): migrations 012–013 (`hybrid_search_file_text` gains a
   `p_min_similarity` vector-arm floor and a real, single-source `similarity` column), `search`
   edge function v3 (forwards `min_similarity`, de-dups vector parts per unit), and `mcp-server/`.
6. **Phase 6 — GUI v1** (`feat/gui-v1`, [PR #4](https://github.com/emstacho-su/bb2dash/pull/4)
   open, 2026-09-09/10): stack decided Next.js on Vercel + Supabase Auth, no Docker (Docker-first
   local plan superseded — see reconciliation doc). Migrations **014–019** (planner columns,
   effort model, work items, course display, files-current, sync contract — renumbered from
   012–017 on 2026-09-10 after merging main; see
   `docs/planning/sprint-0-foundation/41_RECONCILIATION_gui_vs_retrieval-mcp.md`). Four screens built by parallel
   Opus workers in isolated worktrees: Today (14-day effort tracker), Course (week rail + lanes +
   AI policy), Materials (signed-URL Open ladder), ⌘K hybrid search (0.80 "keyword match" label +
   speaker-notes scrubbing; verified compatible with search v3 — same result columns). Full tree
   typecheck + build green after the merge. Recovered local planning round in `docs/planning/`.
   Merged 2026-09-10 (`aef5dee`); W-9 RLS hardening landed right after as migration 020.
7. **Phase 7 — Retrieval polish** (`feat/retrieval-polish`, 2026-09-10; brief and frozen
   contract in `docs/planning/sprint-0-foundation/50_PHASE7_retrieval_polish.md`, evidence in
   `51_W10_VERIFICATION.md`). Two Opus workers on their own branches/worktrees, PM-integrated.
   **021** `matched_snippets`: `hybrid_search_file_text` returns the passage that matched —
   `ts_headline` (plain text) over the best embedding part's slice for FTS-arm hits, that slice's
   head for vector-only hits — plus `part_no` / `snippet_source`; all three search RPCs gain
   `p_include_superseded boolean default false`, filtering before ranking. **022**
   `supersede_stale_files`: seeds `bb_files.superseded_by` for the four stale IST.466 documents
   (schedules 58→16→66, 40→66; roster 35→37), matched by sha256, justified from `notes`/`bb_raw`.
   **023** `part_range_repair`: clamps the one overrun (text 276, an astral-plane emoji) and
   asserts the invariant. `embed-corpus` v5 chunks over code points (root cause). `search` v4
   accepts `include_superseded`. MCP server + ⌘K palette consume the new fields; `web/` gets its
   first test harness (vitest + Testing Library). `/code-review` (high) then confirmed against
   prod that 021 cut keyword-arm snippets from the *vector-best* part, which often did not contain
   the keyword (5 of 10 rows for "attendance policy"); **024** `snippet_fixes` picks a part whose
   slice covers the tsquery (whole-unit headline otherwise; `part_no` = the part the snippet was
   cut from, null for the fallback), trims torn leading words, keeps `[notes]` labelled when the
   marker precedes the slice, limits before the joins, and makes the keyword-mode headline plain
   text; **025** `snippet_part_rank` ranks covering parts by `ts_rank` (vector-best part breaks
   ties). `/security-review`: no findings. Live-verified after 025: "final exam date" on the
   16-part IST.323 syllabus returns part 16 ("Scheduled Final Exam Day 12/15/26") instead of the
   instructor's office hours; "attendance policy" has 0 of 10 snippets missing the keyword;
   superseded schedules absent by default, present with the flag. Tests: web 40, mcp-server 88.
8. **Phase 8 — Course dimension** (PR #8, **merged 2026-09-14**): three Opus
   workers (W-12 db, W-13 tabs, W-14 shared) on worker branches, PM-integrated. Migrations
   **026–029**: `stage_content(run_id)` (idempotent fold of `bb_raw` content into `bb_content`,
   title fallback for `ultraDocumentBody`, run once → 11 junk titles down to 1), `v_course_stream`
   + `v_content_tree` (security_invoker, anon revoked), `courses.card_note` (280-char check) with
   `v_course_display` recreated as security_invoker, `stage_content` off the REST surface. Web:
   `/course/[id]/{stream,classwork,grades,info}` routes, `UpcomingTracker` extracted with 56/14
   paging, route-driven popouts (`?item=assignment:<id>` / `session:<id>`), Home card note,
   Materials → Classwork link. `database.types.ts` regenerated. Review round: 10 findings fixed
   (cache fan-out for status edits, card-note draft/280 cap, planner form no longer wiped
   mid-type, tree nests by `parent_id`, tracker loading/error states, guarded queries, midnight
   roll-over, typed client, one `FileOpenAction` ladder); security review clean. Stack's preview review: the
   content column left a gap on the right (1240px cap, uncentered) → ☰ pop-down replaced by a
   courses sidebar, main fills the width; vitest 265 tests. Findings routed to Phase 9:
   `bb_raw.bb_course_id` is `courses.bb_id` (not `bb_course_id`); every view from 001–025 runs
   as owner and bypasses RLS (fix = migration in Phase 9's range). Parked: IST.466 publishes two
   identical folder paths; the `(course_id, path)` key keeps one (5 rows counted as duplicates).
9. **Phase 9 — Sync loop** (`feat/sync-loop`, PR #10 open, 2026-09-10/14): two Opus workers (W-15 db +
   scheduler, W-16 web + ingest), PM-integrated. Migrations **030–039**: bucket private (030),
   `attention_items` + seeds (031), `agent_requests` (032), announcements `author`/`read_at`/
   `modified_at` (033), SQL transform stages `stage_courses/assignments/announcements/files/gaps`
   + `bb_resolve_course()` (034), `run_transform` / `transform_tick` / reaper / `ical_poll` /
   `app_settings` / `v_sync_status` + pg_cron (035), **11 views → security_invoker** (036),
   `stage_files` replay guard (037), advisor fixes (038), registered-run authorisation + `bb_raw`
   unique index + quarantine grace (039), freshness view ignores skipped/quarantined rows (040,
   post-security-review). Review round (041–044): open-only dedupe index, "Keep mine" answers
   stand until Blackboard's value changes, `applied_at` only when a fact was written,
   missing-file marker measured across registered crawls and reversible, `ical_collect()` on
   every tick (pg_net ttl is 6 h), `apply_resolutions()` run by transform requests, Activity
   list filters ical and quarantine rows, Inbox shows resolve errors. Live sync 2026-09-14 (run 35:
   7 courses, 17 items raised, answers applied by a transform request within one tick) found two
   follow-ups, fixed in-PR: **045** `question_date_text` (date-only due dates in conflict text
   printed a day early) and the Sync button reuses an open `sync` request instead of filing a
   second one (the tick never closes `kind = sync` rows). `bb_url` still null:
   ~~assessment items carry no `detail` in the crawl (crawler change, later)~~ (corrected 2026-09-24:
   since crawler v3 test items carry `detail` — points and due date — but still no item url). First fold of the 9/8 and 9/2 crawls: 93 attention rows
   (conflict 11, data_gap 14, missing 16, stack_must_confirm 52), zero duplicates on replay, a
   resolution applied end-to-end in all three shapes. Web: Inbox, needs-attention row, Sync
   button, Activity (vitest 117 tests); crawler announcements mapper (creator key unverified until a live crawl);
   `skills/bb-sync` (claim → crawl → register run_id → wait → close). Runbook steps 3 and 5
   automated. Stopped/deferred: `stage_courses` never writes `meetings` (~~no schedule payload
   shape seen yet~~ corrected 2026-09-24: the course payload's `schedule` key has been empty on every
   crawl and the calendar feed holds only gradebook items, so there is nothing to read; `meetings`
   are still the seed rows that Phase 2's course maps confirmed) — **closed 2026-10-04 (R-73): Stack accepted the crawl evidence (112 course payloads, 98 with a `schedule` key, 0 with an entry); the 11 confirmed `meetings` rows, 7 `blackboard` and 4 `syllabus`, are the record and no meetings migration is written (DECISIONS 2026-10-04)**; `announcements.author` null until the crawler key is confirmed live (filled by the v5 crawls since 2026-10-01: 27 of 27 on 2026-10-03).
10. **Phase 10a — Grades: mirror, screens, submissions** (`feat/grades-10a`, [PR #13](https://github.com/emstacho-su/bb2dash/pull/13), **merged 2026-09-16**;
   brief + frozen contract + Stack's ten answers in `docs/planning/sprint-1-hub/briefs/67_PHASE10A_grades.md`,
   evidence in `66_W17_VERIFICATION.md`). Two Opus workers (W-17 db + ingest, W-18 web) on
   their own branches and worktrees, PM-integrated from a phase worktree. Migrations **046–051**:
   `bb_gradebook` + `stage_gradebook` (append per run, keyed `(run_id, course_id, column_id)`,
   reads `effectiveScore`, classifies `column_kind`), the three gradebook views, `classifier`
   gains `blackboard`, `bb_files.source_url` nullable + `attempt_id` + anon insert refuses
   submissions, `bb_attempts` + `stage_attempts` + two attempt views (files catalogued into
   `bb_files` under `my_submissions`, bytes pulled by bb-sync step 4b), `run_transform` gains the
   two stages and the Activity feed three grade sentences. Live on the 9/14 crawl: 45 columns
   mirrored, 7/7 courses reconcile by count and score, replay inserts 0. Crawler v3: attempts
   endpoint with a `keys` probe, assessment-field probe (`detailSource`), versioned envelope,
   `runId` on `runAll`; the key names stay unverified until Stack's acceptance crawl (every
   login needs his Duo). Web: `queries.grades.ts` (tested helpers for every state), `/grades`,
   course Grades tab, `GradebookTable`, `CourseGradeCard`, `SubmissionBlock`, `UploadDropZone`,
   Materials shows staged rows; `database.types.ts` regenerated; typecheck/build green, vitest
   530 (after round 2), mcp-server 88. Fixtures for 3 courses + a synthetic attempts payload under
   `db/fixtures/phase10a/`; SQL tests under `db/tests/` roll back against prod. Review round
   (`/code-review main high`, ten confirmed findings; the `/security-review` skill cannot launch
   in this shell, so the PM's manual pass covered the upload path, RLS, grants, invoker views and
   the 049 check): **052–056** — `bb_file_relpath` gives pulled-back files an `attempt-<id>/`
   segment so they cannot collide with a staged file of the same name, and 049's check no longer
   passes on two nulls (052); `stage_files` never marks a `my_submissions` row missing (053);
   `stage_gaps` does not raise a gap for a pulled-back file whose bytes are still to come (054);
   `v_assignment_attempts.attempts_allowed` encodes unlimited from `attempts_left = -1` and
   `stage_attempts` parses attempt dates tolerantly (055); `stage_gradebook` counts score changes
   only when the run is the newest crawl (056). Web: the popout's grade query filters on
   `assignment_id` (the view has no `id` — a blocker caught before any preview), `attemptsAllowed`
   helper, orphaned Storage objects removed on a failed insert, `useId` for the drop zone, the
   staging code split into `queries.submissions.ts`, typed client throughout. bb-sync registers
   `run_id` after the crawl again (register-first would let the tick fold a slow crawl partially).
   **Acceptance 2026-09-16:** Stack's sync (run `c877b0cc`) folded 48 columns, posted 5 new
   grades and moved IST.323's total to 14.8/104, all shown on `/grades`; it ran the v2 crawler
   from the `main` checkout, so the attempts probe and step 4b wait for the first post-merge
   sync. Stack: "looks good for now", then "merge".
11. **Phase 11 — Planner, Google Calendar push, bell** (`feat/planner-11`, [PR #12](https://github.com/emstacho-su/bb2dash/pull/12), **merged 2026-09-16**; brief
   and frozen Contract in `docs/planning/sprint-1-hub/briefs/69_PHASE11_planner.md`, evidence in `69a_W21_VERIFICATION.md`).
   Two Opus workers (W-21 db + calendar, W-22 web) on their own branches, PM-integrated in a separate
   worktree because the main checkout was Phase 10a's. Migrations **060–066**: `calendar_events`
   mirror + `calendar_event_id()` + `v_calendar_push_items` (event instant resolved in SQL: `due_at`,
   else class start for a date-only project/exam/final_exam, else 11:59 PM New York; absence from
   the newest folded crawl computed per course) (060); `app_settings.gcal_*`, `calendar_push_runs`,
   statement trigger marking the calendar dirty on any `assignments` change (061);
   `calendar_push_tick()` on its own pg_cron job one minute off the transform tick, `calendar_push_now()`
   (062); `v_announcements_unread` + `mark_announcements_seen()` over 033's `read_at` (063); Vault
   doors `calendar_secret_set` / `calendar_secrets`, service_role only (064); 065 corrects
   `absent_from_blackboard` to compare `bb_last_seen` with the crawl row's `captured_at` (the
   Contract had said the fold's `started_at`, which flagged 22 of 64 items absent) and uses the
   schema's `0 = Sunday` weekday convention; 066 (code-review round) ties the in-flight lock to
   the run (`gcal_push_run_id`), clears `gcal_dirty` when the tick picks the work up rather than
   when the push ends (a change landing mid-push is no longer lost), and adds
   `app_settings.web_base_url` for the event links. Edge function `calendar-push` v3 (fetch
   client, no SDK; `status: confirmed` in every event body because Google keeps a deleted id in a
   cancelled state and a bare patch would leave a re-added item invisible; orphan rows whose `calendar_id` changed are deleted from the old calendar; insert / patch / delete diff against the mirror; zero
   writes when unchanged; `privateExtendedProperty app=bb2dash`; fixed `colorId` per course).
   `scripts/google-consent.mjs` (loopback OAuth, PKCE, stores four secrets through the RPC; Stack
   runs it once). Web: `/planner`, bell, `/announcements`, `/privacy`; `database.types.ts`
   regenerated. R-16 recorded the Inbox way: SITN presentation `2026-11-04 15:45` (Stack's choice,
   applied by a transform request); IST.466 Group #3 day within each presentation pair is not
   published, rows stay tentative. Tests: web 467 (from 345), function 31 (`node --test`). After Stack's walk (round 4): the band is labelled "Assignments", a due item inside its own course's class window renders as a chip inside that class block, hover or focus raises an overlapped block, and every due card is clickable as a whole and opens the assignment popout. Push set today: 62 of 64 dated workload items; the two IST.323 final-project rows that share one Blackboard item are counted absent (see Known issues) and are not pushed.
   **Live proof done 2026-09-15** (`69a` §9): Stack's Cloud project lives under his Gmail (SU's
   Workspace blocks student projects), the calendar in `emstacho@g.syr.edu`; consent stored via
   the script; run 1 inserted 62, run 2 zero writes, run 3 one patch + one delete, repair run
   after the cancelled-id fix patched 62 once, then zero writes again; Google-side count by
   extended property = 62 = mirror. `gcal_enabled` is true; the push runs on its own tick from
   here on. Announcement `author` stays
   "not recorded": the live crawl carries no creator key and the crawler is 10a's file this sprint.
12. **Phase 11b — Planner events** (`feat/planner-events-11b`, [PR #14](https://github.com/emstacho-su/bb2dash/pull/14), **merged 2026-09-16**; brief, frozen
   Contract with Stack's five answers, PM kickoff notes K-1..K-11 and the round 2 table in
   `docs/planning/sprint-1-hub/briefs/69b_PHASE11B_planner_events.md`; evidence in `69c_W23_VERIFICATION.md`). Two Opus
   workers (W-23 db + push, W-24 web), PM-integrated from a phase worktree while Phase 10b ran in
   another PM session. Migrations **067–069**: `planner_events` (six kinds, instants + own IANA
   zone checked by trigger against `pg_timezone_names`, all-day rows as local midnights with an
   exclusive end, in-person or http(s)-only online location, `done` for tasks only, optional course,
   owner-only RLS on four verbs, dirty trigger) (067); `calendar_events` renamed to `(source,
   ref_id)` and `v_calendar_push_items` v2 with a planner arm computing summary, zone, dates and the
   week link in SQL (068, applied inside a cut-over: push off → 068 → v4 → one push with zero writes
   on the 64 existing events → push on, 3 min 37 s); the zone lookup skipped on an update that keeps
   the zone (069, round 2: a task tick 47 ms → 0.1–0.5 ms). `calendar-push` v4 then **v5** (round 2:
   paged reads that abort on a partial side, mirror write errors thrown, writer split into
   `store.ts`); kind colours Event 9 / Task 1 / Out of office 4 / Focus time 8 / Working location 2 /
   Appointment slot 5, ~~pending Stack's nod (2026-09-24: no nod recorded; kept as picked, no colour item in
   the 12b intake; keep-or-change is R-59, sprint 2 question batch item 31, default keep)~~ kept (B-31, DECISIONS
   2026-09-27 and 2026-09-29; R-59 closed in Phase 17). **Live proof 2026-09-16** on the real calendar (runs
   17–24): 9 SQL-inserted test rows (one per kind + Los Angeles + all-day + online) → 9 inserts,
   zero-write re-run, time move + ✓ on a ticked task (2 patches), timed→all-day + cleared location
   (2 patches), 9 deletes, zero-write re-run; due-date events 0 writes in every run; end state Google
   64 = mirror 64, no planner rows. Web: `planner-zone.ts` (Intl-only, Temporal `compatible` fold/gap
   rule), `planner-events.ts` (validation mirroring 067), `planner-events-grid.ts` (New York
   placement, per-day segments, 08:00–22:00 clamp), `queries.plannerEvents.ts` (optimistic, per-row
   rollback), `PlannerEventForm`, blocks, Events band, roving-tabindex slots; `database.types.ts`
   regenerated after 068. Review: `/code-review main high` 15 findings → 13 fixed in round 2
   (R2-1..R2-13), the missing docs are this update, and 068's rename is recorded in DECISIONS as a
   one-off exception to "additive"; `/security-review` no findings. Tests: web 790 (from 652),
   function + consent 51 (from 31), mcp-server 88. **Browser acceptance walk 2026-09-16** (PM in
   Playwright on the preview, at Stack's request; Google side read through the push function's
   client because the browser held his personal Google account): all eight script steps pass —
   six kinds created from empty slots and the Events band, each on Google 5–118 s after saving,
   a time move and a ticked task patched, a Los Angeles event at noon New York with `timeZone`
   Los Angeles, the online link safe in both, six UI deletes gone from Google, due-date events 0
   writes in every run (runs 25–29), Google 64 = mirror 64 at the end. Two layout fixes from it:
   a zone chip no longer covers the title (block lines never shrink; chip and link share a line),
   and a half-hour block is one row led by its title (`isCompactSegment`). Three Phase 11 display
   issues the walk also found are fixed on the stacked follow-up `fix/planner-display` (merged as PR #16 right after #14): React #418 on every `/planner` load (the grid hydrates inside Suspense
   after the persisted query cache is restored, so its first client render had rows the server
   HTML lacked — confirmed on the preview by clearing the cache; `useHydrated` renders the same
   placeholder on both sides, then the grid), the "Assignments" band label clipped to "GNMENTS"
   (now vertical), and a due item nested in its class block drawn over its own title and status
   (class lines keep their height; the chip is two lines). Web tests 792.
13. **Phase 10b — Grade model, what-if, score history** (`feat/grades-10b`, [PR #15](https://github.com/emstacho-su/bb2dash/pull/15), **merged 2026-09-16**; brief,
   frozen Contract, Stack's four answers and rounds 1b/1c/2 in `docs/planning/sprint-1-hub/briefs/68_PHASE10B_grade_model.md`,
   evidence in `68a_W20_VERIFICATION.md`). Preconditions: 10a on `main` and 18 scored item columns
   held; **V-1 sign-off waived** — Stack stubbed V-1 as a data-accuracy task. Stack's answers: the
   strict rule stands (an unscored hand-graded part hides the model), a "Counts toward…" picker
   for columns no rule is attached to, parts with unsure links left out, graded-so-far headline.
   Two Opus workers: W-19 engine (`feat/grades-10b-engine`) and W-20 db + web
   (`feat/grades-10b-web`); W-19's stream stalled once and resumed from a PM checkpoint commit.
   Engine: pure TypeScript, one module per aggregation, `projectCourse` / `solveTarget` /
   `letterFor` / `itemStates`, L1 unit + L2 `fast-check` properties (seeded) + L3 fixtures for all
   six scheme courses (live 9/16 state + three synthetic states, derivations written) + L4
   agreement + L5 solver round-trip; coverage 100 % lines. It reproduces Blackboard's IST.323
   running total exactly (5.0 on 9/14, 14.8 on 9/16). Migrations **057** (`grade_scenarios`,
   `grade_column_links` + same-course trigger), **058** (the three model views), and after
   `/code-review main high` (15 findings; `/security-review` none) **080** (strict-jsonpath shape
   check — lax mode let arrays through — and `course_id` cascade) and **081** (`latest` CTE not
   materialized). Round-2 code fixes: an item linked to a parent part is unlinked and the picker
   offers leaf parts only; surplus placeholders drop earliest-due first (latest-first kept the
   seeded Lab #1 beside the real one); screens read what-if targets, muted parts and dropped
   placeholders from the engine's `itemStates()`; scenario saves serialized per course (a
   lost-update race); "Not graded" honoured in the table; top-level part counts; `database.types.ts`
   scoped to 10b's objects (a regeneration had picked up Phase 11b's live `planner_events`).
   Contract corrections recorded in DECISIONS: `normalize_to` is a part's target, not a per-item
   denominator; a pointless confirmed placeholder takes a what-if as a percentage. Tests: web
   1196 (from 652), mcp-server 88. **Browser walk (PM, 2026-09-16, logged-in Playwright on the preview):** all seven
   acceptance steps pass; prod restored to 0 scenarios / 0 links. Round 3 fixed four findings
   Stack chose (grades-table cells had `display: flex`, misaligning every Grades table since 10a —
   production included; parts counted as graded from real scores only; a left-out part names the
   unsure items to confirm via `ItemStates.unsureItemKeys`; history formatted like the score cell)
   and re-walked them on the redeployed preview; three findings carried to Phase 13 (phone-width
   overflow, per-exam rank weights, favicon). **What Stack sees today:** no course computes without an action
   of his — IST.323, ECN.304, IST.352 and GEO 103 name their unscored hand-graded parts, IST.466
   has nothing graded, IST.471 is qualitative.

14. **Phase 12b — Fine-tooth-comb pass** (`fix/page-pass-12b`, [PR #20](https://github.com/emstacho-su/bb2dash/pull/20), **MVP merged 2026-09-17**; brief, Stack's 18
   answers, MVP, DoD and the 28-row item task list in `docs/planning/sprint-1-hub/briefs/80c_PHASE12B_page_pass.md`;
   research `docs/planning/sprint-1-hub/research/80c_RESEARCH_phase12b_findings.md`; evidence `80d` walk, `80e` grade-method
   comparison, `80f` attempts endpoint, `80g`–`80k` worker notes). Input was Stack's list of 33
   bugs and changes by page plus 8 PM carry-ins (41 intake ids): five Sonnet researchers, one batch of
   questions, then five Opus workers (W-30 db + shell, W-31 grades, W-32 home / inbox / materials,
   W-33 planner, W-34 sweep), PM-integrated. **Home:** five distinct type colours, tracker scrolls the
   whole dated range and opens at today, strip + today in one card, needs-attention last, series
   placeholders and other teams' IST.466 cases out of Undated (kept in Materials), course cards link,
   sidebar closes on navigation without touching the preference, course card shows Blackboard's number
   and graded so far. **Planner:** Assignments band collapsed by default with counts, rows grow by what
   overlapping items need (`planner-rows.ts`, one `slotToPx`), no inner scrollbars, wrapped text, PR
   #16's three CSS risks fixed. **Inbox:** each button says what it does for that row ("recorded only"
   where nothing applies), rows show source, age and a link, `v_inbox_feedback` hook for a later agent (dropped by migration 116, Phase 17;
   that agent is `/inbox-apply`, row 16, which reads 090's `v_inbox_queue`; `v_inbox_feedback` retired by 116, R-57).
   **Grades:** Stack read the dummy-data comparison (`80e`) and kept the 10b engine's arithmetic with
   the what-if layer and both silencing rules removed — one deterministic "graded so far" per course
   with the parts it leaves out named under it; courses collapse; title is the link; feedback and
   history in the popout; feedback mark on the row. **Status:** six offered values everywhere
   (`progress-status.ts`); `graded` sets itself when a score is new or changed. **Materials:** buckets
   collapse, readings under date headers, off-platform label split, "How to access" opens the syllabus.
   **Ingest:** crawler **v4** reads attempts the way Blackboard's UI does (v3's endpoint answers empty
   for a student). Migrations **073–079, 084–087** live, each byte-identical to its repo file.
   `/code-review main high`: 10 findings, 8 fixed, 1 docs, 1 checked on prod; `/security-review`: none
   ≥ 8/10. Tests: web 1582 (1342 on `main`; ~360 cases left with the deleted what-if layer), desktop
   549, mcp-server 88; `npm run lint` works again (ESLint CLI). PM browser walk in `80d` (three
   passes). **Live proof owed:** Stack's next sync (v4) should fill `bb_attempts` and `my_submissions`.
   **State on 2026-09-21:** no sync since the merge (last crawl 2026-09-17 15:35 UTC, made before it;
   `bb_attempts` 0 rows); a sync request queued that day (id 33) was cancelled at Stack's word.
   Phase worktrees and branches removed; the two `chore/checkpoint-skill*` local branches were
   already contained in `main` and were deleted.

15. **Phase 12b tail — recurring events + planner popover** (`fix/page-pass-12b-tail`, PR open 2026-09-21;
   frozen contract, round 2 table and the walk in `80c` §Post-MVP tail, `80l`–`80n` worker notes, `80o` walk).
   Three Opus workers (W-35 db, W-36 recurrence web, W-37 popover), PM-integrated; W-36 as integrator.
   **T-1 recurring (P-planner-6):** the web expands a rule (daily / weekly / monthly, mandatory end date,
   ≤ 52) into ordinary `planner_events` rows with `planner-recurrence.ts`, so the calendar push is
   untouched; **082** `planner_event_series` + `series_id` / `series_detached` + a 52-row cap; **083**
   RPCs `planner_series_create` / `_update` / `_delete` (`'following'` splits the series, `'all'` rewrites
   the non-detached future rows, ids preserved so Google sees patches); **088** the split moves detached
   rows too, an emptied series is deleted, `until_date` follows the moved rows. Form gains Repeats + Ends
   on with a live count; a series row's edit or delete asks "This event / This and following / All events";
   the rule is not editable after creation (delete following, create anew); ↻ mark on series blocks.
   **T-2 popover (P-planner-5):** on `/planner` a due item opens a small anchored popover (status select,
   points, Blackboard link, "See full details →"); the full details are a page,
   `/course/[id]/assignment/[...assignmentId]`, sharing one body component with the `?item=` popout;
   every other screen keeps the popout. **089** (found by the walk, pre-existing): `v_work_items.due_on`
   took the UTC date of `due_at`, so every 11:59 PM deadline sat one day late on the planner and the Home
   tracker — 22 assignments moved to their New York day. Gates: `/code-review main high` 10 findings all
   fixed (round 2), `/security-review` none; PM browser walk 2026-09-21 (`80o`): series create → this
   event → this and following → all-events delete, all proven on prod and Google (push run 42 inserted 4;
   test rows deleted), popover and page walked. Tests: web 1812 (from 1582), mcp-server 88, desktop 549.
   ~~Known: deleting a series' last detached row plainly leaves an empty series row (`80o` W-3).~~
   Fixed by `102_planner_series_orphan_trigger` (Phase 15, R-54): a statement trigger on `planner_events`
   removes any series left with no rows, on every delete path, not only inside the RPCs. Prod orphans read 0.
16. **Inbox feedback loop, automation half — `/inbox-apply`** (`feat/inbox-apply`, [PR #23](https://github.com/emstacho-su/bb2dash/pull/23), **merged 2026-09-22**;
   plan `~/.claude/plans/inbox-apply-skill.md`; Stack's brief in the bb-sync session for request 34).
   The worker migration 077 left a queue for. **090** `attention_items.state = 'archived'` + `archived_at`,
   `archived_by`, `decision`; `archive_attention_item()` (refuses open and already-archived rows);
   `v_inbox_queue` (every resolved / dismissed row not yet archived, note or not);
   `attention_keep_stands()` honours archived rows so a kept staff name is not re-raised. A state, not
   a table, because 041's do-not-re-ask rules key off rows still being present. Live under the same
   name; `db/tests/inbox_apply_090_attention_archive.sql` PASS. (Phase 14 had pencilled in 090–099;
   it starts at 091.) **Skill** `skills/inbox-apply/SKILL.md` (+ `~/.claude/skills/` copy): Sonnet
   context agents (answer, current row, Blackboard facts, course precedent, grading rule, prior
   decisions) → one Opus change agent under rules (only assignments / assignment_progress /
   course_staff / group_notes / applied_at; new questions via `raise_attention()`; merges and code
   changes flagged, never done) → the session records one vault note per item
   (`projects/bb2dash/decisions/inbox-<id>.md`, `collection: bb2dash-inbox-decisions`, ingested into
   the rag store) + `docs/inbox-decisions/<date>.md`, then archives. **bb-sync step 0** runs it before
   the crawl. **First run** = request 35 (kind `inbox_feedback`): 31 rows archived (7 changed, 24
   recorded only), raised 528 (ECN.304 quiz-2 vs quiz-02 may be one quiz) and 535 (IST.466 Ethics /
   Major Case group numbers disagree across group_notes, the assignment rows and DECISIONS.md).
   **Web:** Inbox "Apply answers" button (files `inbox_feedback`, copies `claude "/inbox-apply <id>"`,
   one open request at a time) and an `archived (n)` group; archived rows leave the live list.
   **Later the same day**, on Stack's authority ("use context to answer or simply write outdated"), the
   worker closed every remaining open item: 101 in one run (12 tentative columns confirmed under their
   components, IST.323 lab-1 merged with its Blackboard row, 17 course-map seeds "already reflected",
   the rest outdated with the reason on the row; seven questions only Stack can answer carry a
   `FLAG for Stack` in their notes) and the 14 file-byte gaps by actually pulling the files through the
   Playwright browser (12 stored + text extracted + embedded; 117 and 118 are gone from Blackboard,
   superseded by the Week 4 schedules). Inbox: 0 open, 134 archived; 134 decision notes in the vault
   collection `bb2dash-inbox-decisions`.
17. **Phase 15 — database hygiene and the SQL test runner** (`feat/db-hygiene-15`, [PR #30](https://github.com/emstacho-su/bb2dash/pull/30) open 2026-09-28, **merged 2026-09-29** as 6ef3933; acceptance steps 1–4 walked on `stack-laptop` that day and the gate-out `node scripts/db-test.mjs` on `main` → `passed 21, failed 0`, so R3 and R4 are open;
   brief `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md`; R-78, R-79, R-80, R-54). Sprint 2's first
   phase, and the seam every later phase's SQL checks run through. **The suite runs as a set for the first
   time:** `node scripts/db-test.mjs` → `db-test: passed 21, failed 0, units 21`, exit 0, over 23 files in
   `db/tests` — a node-postgres CLI that lints each unit before connecting (must open `begin;`, close
   `rollback;`, no top-level `commit`), runs it as one simple query, keeps a frozen loader map, redacts the
   DSN from every message, and exits 0 / 1 / 2 for pass / fail / usage. **100** login role `db_test_runner`
   (`bypassrls`, `nosuperuser`, no create rights, connection limit 2, 60 s statement timeout; `anon` and
   `authenticated` held with `inherit false`; no usage on `vault`, `storage`, `auth` or `cron`; neither Vault
   RPC executable; a guard block at the foot refuses the file if any of that is false) — its own test,
   `phase15_100_db_test_runner_role.sql`, pins those limits so they cannot quietly widen, and every later
   membership extends its expected list in the same PR. **101** pins `search_path = public, pg_temp` on the
   seven functions the advisor flagged, with a 036-shaped guard against a future unpinned one; the advisor now
   lists 0. **102** the R-54 statement trigger (see 15 above). 103 and 104 were reserved for grants 100 might
   have missed and were not needed. Repaired on the way: eight assertions across seven `db/tests` files that
   had gone stale against prod — the phase10a fixture now carries `now()`-relative `captured_at` so a newer
   sync cannot age it out, and four units no worker owned were absorbed on Stack's decision (task 9b), each
   scoped, seeded or re-pointed rather than weakened. The DSN needed `?uselibpqcompat=true&sslmode=require`:
   pg 8.23 aliases `require` to `verify-full`, and the pooler chains to a private root. Six DECISIONS rows
   record every advisor warning kept, plus a seventh for the absorbed units. Nothing visual, so no preview
   walk; R-54's browser proof is Phase 17's. Tests: db suite 21/21, web 1852 (107 files), `node --test
   scripts/` 51, mcp-server build + smoke clean.
18. **Phase 17 — web polish: quick fixes, carried bugs, Inbox and planner leftovers, live proofs** (`feat/web-polish-17`,
   worktree `bb2dash-wt-17`, built 2026-09-29/30, **merged as [PR #43](https://github.com/emstacho-su/bb2dash/pull/43) (d9d5ee9)**; brief
   `docs/planning/sprint-2/briefs/97_PHASE17_web_polish.md`, frozen 2026-09-29; evidence
   `docs/planning/sprint-2/walks/walk-17/97w_PHASE17_WALK.md`). Four Opus workers on disjoint files (W-44 db, W-45 course
   pages, W-46 home / materials / inbox, W-47 shell / harness / planner CSS / desktop), PM-integrated. **Planned tasks:**
   the Upcoming strip scrolls with a plain mouse (wheel and a 5 px drag, S2-home-1); Undated folds just above Needs
   attention and Materials folds a whole course from its header, both remembered (`collapse-state.ts`, S2-home-2,
   S2-materials-1); Stream posts link per kind with a status select on assignment posts, and "unread" follows the bell
   (110, R-37); Classwork never draws rename ghosts, hides stale nodes behind a counted toggle and shows file notes (111,
   R-39, R-40), and the three Knowledge Check drop zones moved to the live rows (112); pasted `?item=` links no longer
   throw #418 (R-43); Info's false groups caption is gone (R-45); IST.466's starred sessions carry the attendance marker
   (R-49); planner time ranges wrap (R-44); favicon (R-50); Home says when the sync scheduler or the calendar push has
   stopped or keeps failing (113 + 118, schema `private`, R-52); gaps close themselves (114, R-56); Activity names
   auto-graded items, linked readings and returned files (115, P-72); `v_inbox_feedback` retired (116, R-57); the C-7
   toast outputs fixed (B-58); both React Compiler lint rules at error, 0 warnings (R-51); the logged-in walk harness
   (`web/e2e/`, `@playwright/test` 1.63.0); ledger L-1 (⌘K palette modes) fixed. **Round 3** (Stack's preview-walk notes,
   2026-09-29): the strip shows a slider, reaches back to the term start and claims the wheel only after a click or a
   1.5 s hover (R3-1); "Apply answers" is the one apply control ("Apply answers now" removed, R3-2); the Inbox is a
   review queue with tabs, cards, a sticky footer, `j`/`k`, and date-labelled session choices (R3-3); the Stream is the
   week-divided two-lane timeline and Classwork keeps the folder tree (R3-4); the AI Policy is gone from the app (R3-5)
   and from the corpus (119: 8 units in 6 courses; 150: IST.323 Appendix B) with the stored bytes untouched (R3-6, R3-6b);
   `/grades` headers fold and a report-card strip sits above the classes (R3-7); nested planner items are drawn whole
   (R3-8); the planner's "+" opens a step-by-step event wizard (R3-9); `npm run walk` signs in from `.env.testing`
   unattended. **Migrations 110–119 and 150 live**, applied under their file names and md5-identical to the repo
   (11 of 11, read 2026-09-30); 150 opens Phase 17's overflow block 150–159, because 110–119 were full and 140–149 is
   Phase 21's (DECISIONS 2026-09-29). **Tests:** web vitest 2069 passed; SQL suite `node scripts/db-test.mjs` 30/30;
   desktop 564; `npx eslint . --max-warnings 0` exit 0; round-3 walk `npm run walk` 24 passed, 0 failed on the preview at
   b2698bf. web coverage (T-22): 85 % lines (85.22 % measured at integration; the threshold floor is 83). `/code-review`
   and `/security-review` run on the planned diff and again on round 3; findings fixed (97w). Twenty-two DECISIONS
   rows (2026-09-29/30). ~~**Open:** Stack's T-24 desktop sitting (toasts, R-108, still unproven), the T-26 production
   sitting (shots 11, 14, 15, 19–21 and the `staged link` spec), his look at round 3 on the preview, and the password
   rotation he was asked for.~~ Corrected by the 2026-10-03 audit (108 §4): T-24 was dropped on 2026-09-30 ("Forget about the toasts", DECISIONS); T-26's two halves were done on 2026-09-30 before the merge (97w §T-26; the staging case is row 810 on prod); the round-3 look became moot with the merge word. Still open from this phase: the dead grade-history read (`useGradeHistory`, `historyByColumn`) kept only by tests (R-51), the password rotation (unrecorded), and R-52's live clause (the Home push-failure line was never sighted; the token died 2026-10-01 18:45Z, 308 failed runs, re-minted about 2026-10-02 05:00Z; the next expiry is about 2026-10-09 05:00Z while the consent screen stays in Testing).
19. **Phase 18 — ingest and corpus: files pulled and embedded in the sync, supersession, notes labels, links**
   (`feat/ingest-corpus-18`, worktree `bb2dash-wt-18`, built 2026-09-29/30, **merged 2026-09-30 on Stack's word
   "merge this phase", before the gate sync (task 16) ran**; brief `docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md`,
   frozen 2026-09-29; evidence `docs/planning/sprint-2/verification/98c`–`98f` and `walks/walk-18/98w_PHASE18_WALK.md`).
   Four Opus workers (W-48 db, W-49 ingest + corpus, W-50 crawler, W-51 web), PM-integrated; main (Phase 17, PR #43)
   merged in and `database.types.ts` regenerated. PR #32 had already delivered tasks 2, 3, 15 and most of 4.
   **Shipped:** `pull_files.mjs --restale` rebuilt so no document text reaches agent-run SQL (new Storage key, owner SQL
   of ids and hashes only, `--restale-post` over PostgREST); CLI scripts exit cleanly (`process.exitCode`); crawler
   **v5** (`crawler.probe`: announcement keys, id-shaped values, key-list misses; bare `creatorUserId` kept as
   `authorUserId`; authors resolved from the course's teachers, then at most one `/users/{id}` per unknown id per run;
   `feedbackToUser` read first for attempt feedback); `token_budget.py`; the golden set, truth test and committed eval
   runner; "Open in Blackboard" / "Blackboard ↗" open the item's own Ultra page (`blackboard-link.ts`); no "no files"
   line on a course with no session-linked files; search docs state each mode's shape (R-74).
   **Migrations 120–129 live**, each dry-run in `begin; … rollback;`, applied under its file name, md5 of
   `statements[1]` = the committed LF blob (10 of 10, 98c): 120 two supersession chains + IST.323 syllabus V1.4 · 121
   notes label in both search functions · 122 `supersede_replaced_files` · 123 `file_week_no` / `link_file_sessions`
   (18 weeks, 21 sessions, 10 Inbox questions) · 124 `stage_files` runs both on every fold · 125 GEO.103 chapters
   off-platform, reading 45's url · 126 `assignment_bb_url` (40 rows) · 127 iCal poll unscheduled · 128 test-role
   grants · 129 materialized search CTEs (latency back to 20.0 / 35.6 ms; not the meetings migration). **Review gate:**
   a HIGH in 122 (a pre-existing sibling could be named as a deleted file's replacement) is fixed by migration **160**
   (`160_supersede_new_candidates_only.sql`: only a candidate new in that crawl counts), which opens Phase 18's overflow
   block 160–169 (120–129 full, 150–159 Phase 17's); it was in progress at this docs commit, so its apply and md5 are
   in 98c, not here. A MEDIUM in `pull_files.mjs --restale` (a re-run lost the owner SQL for rows already uploaded) is
   fixed: resumable when the stored object's hash matches. File 68 extracted by hand with `antiword` and embedded (task 20).
   **Tests:** `node --test ingest/*.test.mjs` 79 pass, 0 fail; web vitest: see the PR (not re-run in the docs
   worktree; W-50's full run was 1898 before Phase 17's merge); `node scripts/db-test.mjs` → passed 39, failed 1:
   **`phase18_post_embed_checks.sql` FAILs `(a) no text unit: 161, 162, 452` and will until the first sync pulls those
   three files** (catalogued since the brief, never pulled); `token_budget.py` max 485 tokens, 0 over; eval hybrid MRR
   1.000 on 9 queries (`scored=27`, Q10 removed with the AI policy). Corpus (prod, 2026-09-30): 108 file rows, 97
   current; 785 text units on current files (800 in all); 1,733 gte-small parts on current files (1,776 in all); 0 units
   without an embedding; `na` files 17 (twin of 15) and 810 (Stack's staged IST.352 file).
   **Unproven live, owed to the first `/bb-sync` on `main`** (DECISIONS 2026-09-30, "Phase 18 · merge"). **Read again on 2026-10-03 (108 §3): syncs 394, 443, 457, 866 and 1277 settled tasks 14, 17 and 18, the `search` redeploy (v6, byte-equal to `main`) and the 150/162 pair (both → 967 by 160's rule); still owed are `98a` (its §2 and §5 need Stack's tab; §3 closed by his R-73 call on 2026-10-04) and task 28's screenshots; task 19's code half landed 2026-10-04 (the crawler PR: key lists cut, header rewritten, fixture and tests on the live shape; R-66 and R-75 rows) and task 26 closed 2026-10-04 (R-73 row); DECISIONS rows of 2026-10-03 and 2026-10-04.** The list as written at the merge: task 16 (gate
   sync + probe sitting; `98a_PROBE_SITTING.md` never written); task 17 (in-sync pull counts); task 18's live half
   (authors after a v5 fold; all 24 announcements had a null author at the merge; 27 of 27 carry one on 2026-10-03); task 19 (crawler key-list cut and R-66/R-75
   header, waits on the probe — done 2026-10-04, the crawler PR); task 26 (R-73 meetings: no data yet; a meetings migration would take the next free block after 169 — closed 2026-10-04 with no migration, Stack accepted the crawl evidence); task 28's
   screenshots 05 and 08 and the rest of walk-18 (only the task 20 note exists); task 14's 48 h re-read (127 applied
   2026-09-29 17:51:00Z, `ical_sync_runs_at_apply=19`; read `sync_runs where source = 'ical'` → 19 after 2026-10-01
   17:51Z). Also waiting on that fold: file 150 → 162 (the third supersession pair, 122's rule). Not confirmed in this
   docs pass: the `search` redeploy and its byte comparison (§DoD merge bullet). Note for task 17: its first count
   (`superseded_by is null and storage_path is null`) reads **13** today: 161, 162, 163, 452, nine ECN.304 readings
   738–746 (text extracted, no stored bytes) and 810 (Stack's staged file, no `source_url`, so no pull can fill it);
   the expected 0 needs re-scoping before that sync is read (re-scoped 2026-10-03 to 9, the outside links 738–746; 810 has bytes, a twin of 140). Rows 72 and 144 carried the stale marker until `--restale` re-pulled them on 2026-10-01 16:46Z.

19. **Phase 16 — grades: V-1 sittings and the reconciliation migration** (`feat/grades-v1-16`, **merged 2026-09-30 as [PR #44](https://github.com/emstacho-su/bb2dash/pull/44), 4c310ff**; PR opened
   2026-09-30; brief `docs/planning/sprint-2/briefs/96_PHASE16_grades_v1.md`, rounds 1–2). Stack sat all six
   V-1 courses on 2026-09-29 through the fixed launcher (`scripts/validate-grading.mjs`, confined to the
   `bb2dash` MCP and `docs/planning`); verdicts `docs/planning/sprint-2/verification/96b_*`, summary `96d`
   (143 rows checked: 28 corrections, 110 citation-only, 6 already applied, 0 left tentative; 18 spot
   checks, one waived mismatch). **105** (pre-sitting fixes: IST.466 major-project-1 `tentative`, component
   24's group number, GEO.103's two attendance columns "Not graded") and **106** (the reconciliation: B-12
   re-cut of IST.323's Final Project 13 / 1, IST.466 participation / attendance on syllabus points and its
   rolled-over 100-point column "Not graded", IST.471 weighted 70 / 30 with a full letter scale, placeholders
   dropped, and a P-75 citation on every checked row). Tooling: the export query `scripts/export-grading-schema.sql`
   (`96a`), the machine-block checker `scripts/v1_recheck.py` (`--check`, `--summary --compare`, `--emit-sql`
   → `db/tests/phase16_106_v1_recheck.sql`), `db/tests/grading_invariants.sql` (F ceiling 0 after 106). Web:
   ECN.304's rank rule stated under the figure (R-36). `/inbox-apply` cites `bb_file:<id>#unit:<n>`.
   Task 10a's seed fix went to `main` as its own PR (#40, Stack's call). ECN.304 Exam 1 counting is no
   gate (Stack, 2026-09-30); `node scripts/check-ecn-exam1.mjs` is an optional read-only check.

20. **Phase 20 — harness closure: V-2 on record, note quality, checkpoint redaction, vault writers**
   (brief `docs/planning/sprint-2/briefs/101_PHASE20_harness_closure.md`; three PRs plus one, DECISIONS 2026-09-30).
   **PR-A** bb2dash [#39](https://github.com/emstacho-su/bb2dash/pull/39) (`fix/inbox-apply-vault-20`, merged
   2026-09-30 as 2904b20): `/inbox-apply` Step 0 resolves the vault and stops unless the `projects` realm is there;
   the installed copy prints `vault=C:/Users/stack/vault ingest=C:/Users/stack/agentic-harness/ingest realm=projects ok`.
   **PR-B** agentic-harness #36 (`feat/v2-closure`, merged as ea0e199): phase spelling with lettered phases and the
   bb2dash alias table, a per-note 5-tag cap through `hook_tags`, `/checkpoint` redaction (fallback removed), per-machine
   redaction extras, the sweep under the realm lock, the untagged cadence, `resolve-config.mjs`, the back-fill tool,
   harness docs for the realm vault. Harness **#37** (merged as 00539be) taught the back-fill the retired home
   `C:/Users/estac`. **PR-C** (`docs/harness-closure-20`, **merged 2026-09-30 as [PR #48](https://github.com/emstacho-su/bb2dash/pull/48), cb1d7e7**): the re-installed `/checkpoint` (C-21 `equal` x3),
   `/inbox-apply` Step 0 through `resolve-config.mjs`, `/bb2dash-pm` runs the untagged review first when due, the
   verification note 101a, these state docs. Live steps on 2026-09-30: gitleaks over all three realms clean; L20-a
   hook reinstall (C-17 `same` x6); L20-b back-fill over 804 notes (C-18 re-run `changes 0`, top-level 194 = 194,
   `repo` empty 91 → 0, `hook_tags` over 5 = 0); eval 0.9194 → 0.9355 on 67 cases; the credential test exits 2 in
   2064 ms; a live resume chain and `include_superseded` proven on Stack's interactive session; the acceptance query
   and GIN `EXPLAIN` on Phase 12's family; the first untagged review (341 → 38 unclassified, two blind taggers).
   Stack waived the three-night prerequisite and struck the cloud `/checkpoint` step. **V-2 closed on Stack's
   word, 2026-09-30.** ~~Open: task 2's first real Apply run (needs an Inbox item), task 29 (refresh the installed
   `/inbox-apply` after PR-C merges),~~ two harness follow-ups (101a), and the 0-byte note `b46dd7f8` (unrecoverable). Task 2 was settled by request 458 (2026-10-01: 14 notes written to the projects realm, committed 8dd45e6) and task 29 is done (the installed copy equals `main`); the two harness follow-ups are still open on harness main and filed nowhere (108 §2, 2026-10-03).
21. **Phase 19 — content identity, per-crawl history and sync honesty** (brief
   `docs/planning/sprint-2/briefs/99_PHASE19_content_history.md`; [PR #60](https://github.com/emstacho-su/bb2dash/pull/60) merged 2026-10-03 as 206ee3a on Stack's word;
   task ledger `docs/planning/sprint-2/verification/99_PHASE19_LEDGER.md`). Stack's yes at the start (2026-10-02) to
   B-19's ghost merge and B-20's 30-minute terminal rule, then "apply 131–137"; on 2026-10-03 he asked for the phase
   to be finished without his input and reviewed at the end. Migrations **130–139 and 170–172 live, md5-identical to
   the repo (13 of 13)**: 130 merged the 21 rename ghosts (`bb_content` 239 → 218); 131 keys `bb_content` on
   `(course_id, bb_item_id)` and drops the path key (files 17 and 19 now in Classwork, 225 rows); 132
   `bb_material_history` (229 backfilled rows, one vanish convention, two GEO.103 stamps restamped); 133 Stream
   material posts from history; 134 Activity names new, changed and gone materials; 135 a sync is `running` from its
   claim (trigger on `agent_requests`) and `run_transform` records the `history` stage; 136 a registered run folds only
   on its calendar row, and the 30-minute terminal rule closes a dead sync with one Inbox item; 137 `v_sync_status`
   gains `notes`, `interrupted` and R-41's per-stream `streams`. Round 2 from the first code review: 138 (Activity
   counts materials only; a folder rename no longer marks its contents changed) and 139 (a deleted-and-re-posted item
   keeps its row and assignment link). Round 3 from the second review (block 170–179): 170 (Activity reads what the
   Stream posts; uncatalogued files resolve at read time; 10 path-only history rows removed, 229 → 219) and 171 (only
   an item deleted and re-posted between two crawls is re-keyed); the skill stops on an interrupted run. Web: "New and changed materials" block on the Stream, honest "last synced" and
   "last sync interrupted" on Home and the Inbox, never-synced streams named; desktop "Sync interrupted" toast opens
   the Inbox. The `bb-sync` skill registers its run at claim (installed copy refreshed 2026-10-03). Gates: SQL suite
   59/59, web vitest 2314/2314 (the ledger's final figures; the merge-day note said 56/56 and 2302), desktop 708/708, typecheck and build clean (a 2026-10-03 23:00Z typecheck from the main checkout exited 2 only because that checkout's `web/node_modules` lacked `@playwright/test`; `npm ci` there fixed it, 0 errors), `mcp-server/` untouched; security review no
   HIGH/MEDIUM; advisor 0 findings on Phase 19 objects. Live proof 2026-10-03: request 580 opened run 592 `running`
   at claim and the tick reaped it at 17:54Z (Inbox item 2636). Walk 6/6 on the preview (`walks/walk-19/`). **Task 27
   passed with Stack's sync 866** (2026-10-03): claimed and opened `running` at 19:28:58Z, crawl from 19:29:26Z, folded
   `ok` at 19:30:01Z with all nine stages; every stream `fresh`. It showed one gap: a new Kaltura video (an LTI item) is
   recorded in history but not posted, because the Stream counts only document, link and file items (027's rule) — put
   to Stack. Stack's answer ("only keep the link"): migration 172 posts videos as links and the Stream gives every
   content post an Open link (a video opens the course's Blackboard page); nothing is downloaded. **Merged on Stack's word before he
   reported the acceptance walk**; the Stream block's placement stays as built until he says otherwise; Inbox item 2636
   (the PM's proof run) is his to dismiss. Phase worktrees and branches removed after the merge.

**Migration numbering note.** Prod's `schema_migrations` recorded the GUI migrations under their
pre-reconciliation names (`012_planner_columns` … `017_sync_contract`) next to main's
`012_hybrid_similarity` / `013_hybrid_similarity_single_source`. Same DDL, live once; the repo
names it 014–019. This is a name-level artifact, NOT drift — a rebuild in README order reproduces
prod. **Do not re-apply 014–019.**

## GUI phase close-out (all done)

0. ~~Reconcile `feat/gui-v1` with main's Retrieval-MCP phase~~ — done 2026-09-10 (merge + renumber).
0a. ~~Merge PR #4 to `main`~~ — done 2026-09-10 (`aef5dee`); `main` is the single source of truth.
1. ~~Create the Vercel project~~ — done; deployed at `https://web-xi-ten-uy9xk6c6p0.vercel.app`
   (Root Directory `web`, the two `NEXT_PUBLIC_` env vars). Owner has logged in.
2. ~~**Stack: visual sign-off**~~ — **done 2026-09-10**: Stack confirmed the Today/Course/
   Materials/search screens render live data end-to-end.
3. ~~**Stack: disable signups**~~ — **done 2026-09-10** per Stack (a dashboard setting, not
   visible from SQL, so not independently verified here). Site URL → the Vercel origin for
   password-reset/confirmation links: set at the same time if not already.
4. ~~**W-9: RLS hardening**~~ — **done 2026-09-10** (migration 020). The 21 permissive
   `authenticated using(true)` policies (STATUS earlier estimated ~25; the real count is 21) are
   now `auth.uid() = public.app_owner()`, plus `storage.objects` `bb_files_auth_all` owner-scoped
   (bucket + owner). `app_owner()` resolves the owner **by email** (recreation-proof). The five
   anon INSERT-only paths and service_role are untouched. Verified: owner sees all rows, any other
   uid sees zero, anon insert + `search` edge function both still work. ~~**Signups still to be
   disabled** (item 3) before any public URL carries data.~~ Done: item 3, 2026-09-10.

## Sprint 1 — closed 2026-09-22

**Dates** 2026-09-10 → 2026-09-22 (13 days). **PRs** #7–#23 (17 merged). **Migrations** 026–090
(059 held for V-1; 070–072 unused). **Docs** `docs/planning/sprint-1-hub/` (index: `docs/planning/README.md`).

**Shipped:** Classroom-style course page (8) · automated sync loop + Inbox (9) · gradebook mirror,
Grades screens, submissions, staged upload (10a) · grade model → replaced by one "graded so far" figure
(10b → 12b) · planner week grid, Google Calendar push, bell + Announcements (11) · planner events pushed
to Google (11b) · Electron shell, tray, toasts, Sync button (12) · fine-tooth-comb pass over every page,
six statuses, crawler v4 attempts (12b) · recurring events, planner popover + assignment page, due-day
fix (12b tail) · `/inbox-apply` worker + Apply answers, Inbox drained to 0 (#23).

**Proven live at close:** sync request 34 (2026-09-22, crawler v4, no dry run): 26 attempts across 5
courses, 55 gradebook columns, 21 items auto-graded; calendar push mirror 68 = Google; production
`main` = PR #23; desktop app on the production URL. **UX pass on production 2026-09-22** (PM in a
logged-in Playwright session, screenshots read): planner popover → "See full details" page renders
with the New York due day; the IST.471 popout's submission block lists the pulled PDF with its
checksum and an Open button; Materials shows both pulled files under "My submissions" ("submitted
copy · In library"). Two findings: a **direct load** of the assignment page was a 404 (fixed in this
PR — `CourseAssignment` treated a pending, not-yet-fetching query as "missing" on the server render;
two RED-first tests), and ~~React #418 on `?item=` popout URLs (S2-carry-9, pre-existing)~~ (fixed in Phase 17, T-11: `ItemPopout`
waits for hydration; row 18).

**Open at close (carried into sprint 2 planning):**
* ~~Submission bytes not pulled~~ — **fixed in this close-out PR**: `bb-sync` step 4b is now the
  scripted pull (`ingest/pull_files.mjs --bucket my_submissions`, two-way bucket gate, Blackboard's
  declared mime kept, a 409 fails a submission; tests 12 → 17). The two v4-catalogued files
  (IST.352 Role of Systems Analyst, IST.471 proposal agreement) were pulled through a logged-in tab
  on 2026-09-22: stored, mirrored, 3 text units extracted and embedded.
* V-1 grading validation still stubbed (`059` held); 18 placeholders without points (21 on 2026-09-16); IST.323's
  13-point proposal column ~~counts toward two parts~~ counts toward one part, the 11-point proposal, since
  a "Counts toward…" link of 2026-09-22, so it overfills that part (see Known issues).
* V-2 session archival (R-27) is **built** in `~/agentic-harness` (its PRs #1–#4, 2026-09-16: capture 2.0 with subagent notes, tag vocabulary, one-time vault migration, ingest on capture, nightly reconcile, metadata-filtered retrieval); the vault itself moved into git realms there on 2026-09-23/24. Carried: bb2dash's acceptance walk of `66_SESSION_ARCHIVAL_RAG.md` and the doc closure (S2-carry-3). **2026-09-30: closed on Stack's word (2026-09-30)** — Phase 20 walked all 21 lines on live data (`docs/planning/sprint-2/verification/101a_V2_VERIFICATION.md`; row 20 under "What has been done").
* Phase 13 styling **skipped** by Stack; C-1..C-3 parked (`docs/planning/sprint-2/parked/81_PHASE13_styling.md`).
* Phase 14 containers brief + 6 research files ready; Stack places it in the sprint 2 list.
* Known issues below: ~~empty series row after a plain delete of a series' last row~~ (fixed by migration 102,
  Phase 15); IST.466 duplicate content paths (P-data-1); `numeric(9,3)` scores (declined);
  ~~7 mutable `search_path` functions~~ (fixed by `101_search_path_pin`, Phase 15).
* Desktop unpacked build rebuilt from `main` at close (it lacked 12b's extra navigation guard).

## Out-of-phase work delivered early (2026-09-29)

On Stack's word, two things were built ahead of their planned phases, on
`feat/sync-file-pull-and-gap-feedback` (**PR open, merges when Stack says so**).

**Files are pulled inside the sync** — Phase 18 tasks 2, 4 and 15 (R-60), delivered early.
`bb-sync` step 4b is now "Pull the files" and takes course rows as well as submission rows, so a
sync no longer catalogues a file, raises an Inbox `data_gap` saying it cannot be opened, and leaves
both for a human. `ingest/fetch_signed.mjs` (new, 17 tests) walks the `bbcswebdav` redirect chain
to its signed CDN URL, bounded at 3 hops with the final host checked at a domain boundary;
`ingest/pull_files.mjs --fetch` downloads it. That retires Playwright's `download` event, which
crashed the MCP browser on 2026-09-23 and cost that sync three files. `ingest/embed_corpus.mjs`
(new, 11 tests) is the embed loop that was run by hand; `--check` prints `missing_parts_before`.
`pull_files.mjs` also gains `--no-embed`; its 17 existing tests are unchanged and 8 are added.
`agent_requests.result` gains `files_pulled` and `files_not_pulled`. Phase 18 keeps its other
tasks and its migration block 120–129; nothing in the database changed.

**A data gap can be answered, not only dismissed.** The Inbox gives a `data_gap` the same answer
input a `stack_must_confirm` row has, beside Dismiss; an answered gap resolves with
`{value, value_type}`, which is the shape `/inbox-apply` already reads. `apply_resolutions()` is
untouched and still never applies a gap, and the sentence under Save says so and says that answering
closes the row for good (041 never re-asks a closed `data_gap` key).

Both reviews ran and their findings are fixed in `0df6ba9`. The security review's two MEDIUM
findings drove two changes: the redirect walk is now gated on every hop (https, a Blackboard or CDN
host, no bare IPs) rather than only at its endpoint, and `--restale` was dropped, which removes the
path that put professor-authored document text into a `.sql` file an agent reads and then hands to
a service-role `execute_sql`. The code review's two HIGH findings went with it: a CDN 401/403 is an
expired signature rather than a dead session and no longer aborts the run, and the stale-marker bug
left with the mode.

**Not done and still open:** **no live proof.** The new pull has never run against prod — the
current work list is empty of course files with no bytes except the four open `data_gap` rows, and
nothing has exercised `--fetch` end to end. R-60's remaining clauses (stale rows 72 and 144
re-pulled, `stage_gaps` no longer raising a gap for a file the same sync pulls) are **not** in this
branch and stay Phase 18's. The installed skill copy at `~/.claude/skills/bb-sync/SKILL.md` still
holds `main`'s version, so `/bb-sync` keeps running the old step 4b until that copy is refreshed
from this branch — deliberately untouched, because overwriting it from an unmerged branch is the
merging session's call. (2026-09-30: PR #32 merged; Phase 18 rebuilt `--restale` and merged too. The live proof is
still owed, now to the first `/bb-sync` on `main`, after the installed copy is refreshed from `main`; row 19.)

## Lecture-number session links (2026-10-02)

On Stack's Inbox note (item 906) and his scope call, `feat/lecture-number-session-link` adds
migration `162_lecture_number_session_links.sql` (**applied to prod 2026-10-02 on Stack's word, repo
file byte-identical; merged 2026-10-02, PR #56, fb8a0a6**). `link_file_sessions` gains one step after Stack's own answer: a file that
names a lecture number links to the week's only session that is not an exam, or, when the week has
as many lecture numbers as such sessions, to the session at its rank. A lone lecture in a week of
two sessions still asks, and an open question the rule clears closes itself. Test:
`db/tests/phase18_162_lecture_number_links.sql` (7 assertions), green through the runner with
`phase18_123` and `phase18_124`. Code review found two things, fixed in
`163_session_link_archived_answers.sql` (**applied to prod 2026-10-02 on Stack's word, byte-identical**): an answer
`/inbox-apply` has archived still counts, and the number-order rule reads a sibling's answer that
is not applied yet. Its test `db/tests/phase18_163_session_link_answers.sql` (5 assertions) is
green through the runner, with `phase18_162`, `phase18_123` and `phase18_124`. Sync 457
(2026-10-01, run 485, `ok`) also landed: 14 Inbox answers applied
(`docs/inbox-decisions/2026-10-01.md`), 1 file pulled, `missing_parts_before=0`.

Full suite after the merge (2026-10-02, `node scripts/db-test.mjs`): **passed 46, failed 1, units 47**. The
one failure is `phase12b_082_083_planner_series.sql`, and it is the test that went stale, not the
code: scope `all` cuts at `now()` (083/088), and the test's series holds a hard-coded row at
2026-10-01 18:00 -04:00, which is in the past since 2026-10-02 ("these rows are not in scope for all …
starting before the cut"). Unrelated to 162/163. **Fixed 2026-10-02** (`fix/planner-series-test-dates`): every fixture date but the past row moved on 53 weeks (weekdays kept, the Thursdays still on their sides of the 2027-11-07 clock change), and a guard under `begin;` fails by name when they run out again on 2027-10-07.

## Inbox undo (2026-10-05)

[PR #74](https://github.com/emstacho-su/bb2dash/pull/74), `feat/inbox-undo-answer`, web only, no migration. Stack, 2026-10-05: "I
accidentally clicked the wrong input button on an item from the inbox. we need a way to move items from answered not applied back
to the inbox (an undo)". The press was item 3426, GEO.103's "Exam 1" `due_at` conflict (Blackboard says 2024-09-30, a column from a
prior year), answered **Accept Blackboard** at 20:06Z with the note "keep mine, date listed on blackboard is from a prior session".
It was unapplied, and the next fold's `apply_resolutions()` would have moved the due date to 2024, so the PM put that one row back
to `open` by hand at about 20:10Z with the same guarded statement this PR ships (DECISIONS); Stack answers it again.

* **Undo on every card under "Answered, not applied"** whose row the transform has not stamped `applied_at` and the worker has not
  archived, with "Back under Needs you with no answer. Nothing has been applied yet, so nothing else changes." under it.
* **The write** (`web/src/lib/queries.inboxReopen.ts`) puts the four answer columns back exactly as `raise_attention` left them
  (`state = open`; `resolved_at`, `resolution`, `resolution_note` null). It is guarded in its filter, not only in the UI: `state in
  (resolved, dismissed)`, `applied_at is null`, `archived_at is null`. Zero rows (the fold or `/inbox-apply` got there first) reads
  "this answer was already applied or archived, so it cannot be taken back here"; a unique-index refusal (the next sync re-asked the
  question, so a newer open twin exists under `attention_items_open_dedupe_idx`) reads "the next sync asked this again; answer the
  newer open item instead". An applied answer has no Undo: the fact changed, and taking it back is a new answer.
* **Two more rows get no Undo** (`/code-review`, round 1): a session-link question (`ref` `session_link/<file id>`), because
  `link_file_sessions` (123, 163) writes the pick into `bb_files.session_id` without stamping `applied_at` and reads only files
  still unlinked, so a reopened one would be a question nothing reads again; and a row the database closed itself (`resolution`
  null while closed, 084's kind), because Stack's writes always carry a resolution and nothing would raise the question again.
  Both rules sit in `canReopen` and in the write's filter.
* **Undo waits while `/inbox-apply` holds the queue**: with an `inbox_feedback` request queued or claimed
  (`useOpenInboxApplyRequest`), the control is disabled and reads "Apply answers is running; undo after it finishes", since the
  worker reads the queue before it writes and an undo between the two would leave an applied answer open.
* The Inbox screen wires the mutation beside resolve and the session choice. The card that owns a write in flight, or the failure
  to show, is now the one whose write was sent last (`latestWrite` on `submittedAt`), not a fixed order among the three, which let a
  stale undo failure hide a fresh answer failure on another card. One `invalidateInboxCaches` serves the three mutations and the
  Apply button's refresh. The card's failure line reads "That change was not saved: …" for all three writes. RLS already lets the
  owner update the row.
* Gates: web vitest 137 files / 2427 tests, `tsc` 0, `eslint` clean; `/code-review main high`: 10 findings, 8 applied (the two
  exclusions, the Apply-worker block, the latest-write rule, a refusal message that names every way zero rows happens, the shared
  invalidation, the exported `untypedClient`, the card's wrapper). **Two declined, owed as follow-ups in SQL:** a
  `reopen_attention_item(p_id)` function beside 090's `archive_attention_item`, so the rule is the database's for every caller and
  has a `db/tests` unit (today it is a PostgREST filter in one browser module under owner-all RLS); and a `state = 'resolved'`
  re-check on 042's `applied_at` stamp, which closes a millisecond window in which an undo committing between the fold's write and
  its stamp leaves an open row with `applied_at` set. Neither needs a web change; both take the next free migration number.

## Phase 14 early PR — the desktop launcher (2026-10-03)

The first of Phase 14's PRs (brief 100 task 18, merged before acceptance step A1; the exception to one PR per phase is DECISIONS 2026-10-02 "Phase 14 freeze: one PR per repo" on the phase branch). It adds two desktop config keys and changes nothing by default:

* `syncLauncher` (`terminal`, the default, or `queue-only`; env `BB2DASH_SYNC_LAUNCHER`). Under `queue-only` the Sync button only queues the request for the container's runner; no terminal opens.
* `novncPasswordFile` (env `BB2DASH_NOVNC_PASSWORD_FILE`, default `<home>.bb2dash-secrets
ovnc_password`). Under `queue-only`, when an open Inbox item with ref `sync-login-required` (kind `stack_must_confirm`, entity `agent_request`) exists, the app opens `http://127.0.0.1:6080/vnc.html` once per New York day, unlocked through the URL fragment, so Stack only does NetID and Duo.

Nothing raises `sync-login-required` until the phase PR (migration 091 and the runner) and the cut-over land, so with the default `terminal` this PR changes no behaviour. Desktop: 40 files, 787 unit tests, typecheck and build clean, e2e 23 passed (one new case); `/code-review` round 2 applied; `/security-review`: no findings.

## Phase 14 — Containers (R-28), 2026-10-02 → 2026-10-04

Brief `docs/planning/sprint-2/briefs/100_PHASE14_containers.md` (frozen 2026-10-02, re-cut 2026-10-03 for a manual
Duo login every morning and no overnight waits). Three repos, one PR per repo plus the early launcher PR
(DECISIONS 2026-10-02 freeze row (5)): bb2dash `feat/containers-14`, agentic-harness `feat/containers`
(draft [harness PR #39](https://github.com/emstacho-su/agentic-harness/pull/39)), bb2dash-stack
`feat/containers-14-stack` (private repo created 2026-10-03), and [PR #62](https://github.com/emstacho-su/bb2dash/pull/62)
(`syncLauncher` + the container login prompt, merged before acceptance step A1).

**What shipped (merged 2026-10-04 on Stack's word "merge", all four PRs, before his acceptance sitting; DECISIONS 2026-10-04):**
* **The sync runs in a container.** `sync` (`docker/sync/`, `sync/`): a deterministic Node + Playwright runner, no LLM,
  Chromium headful on Xvfb as `pwuser` under Playwright's seccomp profile with its sandbox on, noVNC on
  `127.0.0.1:6080` for the Duo login. It claims queued `sync` requests, registers the run first, crawls with crawler
  v5, waits for the fold, pulls files through Phase 18's signed fetch, extracts with the locked Python set (task 14),
  embeds in-process, and closes the request with a templated report Activity shows.
* **The login, kept and watched.** A read-only Ultra page every 20 ± 3 minutes keeps the session warm; a dead
  check tries one silent re-login before raising "Blackboard login needed" in the Inbox (ref
  `sync-login-required`); the item closes itself on the next good login. The first login of each New York day
  queues that day's sync (`sync_enqueue('login')`); no clock.
* **Database:** migrations **091** (role `sync_runner`, LOGIN NOINHERIT NOBYPASSRLS, no table grants; twelve SECURITY
  DEFINER functions and a helper), **093** (review fixes: `sync_own_claims()` so the runner finishes its own
  registered claims, a failed close fails its running run), **094** (the test role may act as `sync_runner`, inherit
  false). All three on prod, md5-identical. 092 struck. The SQL suite: 64 of 64.
* **Desktop (PR #62):** `syncLauncher` (`terminal` default, `queue-only`); under `queue-only` the app opens the
  login page, unlocked through the URL fragment, once per New York day while the container's login item is open.
* **Materials MCP as an image** (`bb2dash-mcp:local`); the service key moved out of `~/.claude.json` and `bb2dash/.env`
  into `C:/Users/stack/.bb2dash-secrets/` on 2026-10-03; `claude mcp list` → Connected; a real search passes.
* **Harness jobs container** (agentic-harness): scheduler with catch-up, ingest and realm sync (dry run until
  cut-over), checkpoint collection, doctor realm rows; no transcript sweep in the container (DECISIONS 2026-10-02).
* **Umbrella `bb2dash-stack`:** `compose.yaml` includes both repos, `secrets.example/` (11 names), the eight `just`
  verbs, the umbrella doctor, and a dev container with its own clones, a hardened egress firewall and no readable
  secret file.

**Proven live (2026-10-03):** the spike (82b: login survives restart, recreate and `wsl --shutdown`; `Sandbox:
seccomp`); task 28 (82a): the skill's run A and the container's run B match on every parity check (`2 1`), the
login path raises the Inbox item and archives it on re-login; task 27: 4 of 4 images clean (filesystem and
history) under a narrow vendor allowlist; six base manifests, all with arm64. Walk screenshots `walks/walk-14/01–04`.
Gates: `/code-review` on all four branches with rounds 2 (and 3 for bb2dash-stack) applied; `/security-review`
on all four: one HIGH in the dev container's firewall cache, fixed in round 3; no other finding.

**Where the product is:** the container `bb2dash-sync-1` runs the runner's image since 2026-10-03 22:52Z with
Stack's login; the desktop app is still `syncLauncher = terminal`, so a Sync press may be taken by the container
first. The two `AgenticHarness-*` Task Scheduler jobs still run; the harness jobs container is not up.

**Next:** Stack walks the acceptance script A1–A9 on `main` in one sitting (brief 100 §Definition of done;
82a ticks); the cut-over (queue-only, the harness jobs container on with `REALM_SYNC=apply`, the two scheduled tasks
removed) happens in that sitting. After it: `node scripts/install-skills.mjs` from the main checkout, Stack removes the stale claude.ai `bb-course-*` skills, the PM moves the live `sync` container's compose project off the phase worktree and removes the Phase 14 worktrees.

**Acceptance, 2026-10-04:** A2's first `just up` found two path bugs (the seccomp profile through the umbrella; the justfile overriding `SECRETS_DIR`); both fixed by this follow-up PR and bb2dash-stack's, before the sitting goes on.

### Phase 14 deferred (R-96)

Nothing below is built in this phase:
* The terminal launcher's deletion (`desktop/src/main/sync-terminal.ts`, `wt.ts`, the terminal half of
  `desktop/src/core/sync-command.ts`, `syncDryRun`), after acceptance.
* A "Blackboard login needed" desktop toast (B-46); the app's login-page opener covers the morning case.
* The next web PR: ~~the SyncButton's copy after cut-over~~ (done 2026-10-05, [PR #72](https://github.com/emstacho-su/bb2dash/pull/72); section below); the Inbox labels the runner's login item "Raised by the
  transform"; linking the login item to the noVNC page.
* The MacBook bring-up (waits on the `@anush008/tokenizers` linux-arm64 gap); per-image arm64 builds; VPS notes.
* An optional `claude -p` sync summary.
* A release for a dead-lettered `inbox_feedback` claim (091's sweep only flags it).
* Hardening noted by the security reviews, below the bar: a websockify token or origin check for the noVNC page;
  certificate verification (`sslmode=verify-full`) on the runner's database connection; redacting submitted file
  names and sizes from the committed crawl fixture.

## Phase 14 follow-up — the Sync button after cut-over (2026-10-05)

[PR #72](https://github.com/emstacho-su/bb2dash/pull/72), `feat/sync-button-runner-indicator`, web only (no migration, no desktop
change); R-96's "the SyncButton's copy after cut-over". Stack, 2026-10-05: pressing Sync "no longer spawns the session, instead
it just queues the sync and tells me what to paste". The container had been taking every press since `syncLauncher = queue-only`
(2026-10-04 21:18 local; requests 1855 and 1856 claimed by `sync-runner` 24 s and 20 s after the press), but the button still
copied `claude --model sonnet "/bb-sync <id>"` and said to run it in Claude Code.

* A press files the `agent_requests` row and copies nothing; the toast says the sync container picks it up within about a minute.
* The label follows what the runner writes, read off `claimed_by` and the `sync_runs` row the claim opened (135's trigger):
  `sync requested` → `starting…` → `crawling…` (run `running`) → `pulling files…` (run `ok` / `partial`) → `sync done`;
  `finishing…` for a failed run under an open claim; `Claude Code: syncing…` for any other claimant (the Windows `/bb-sync` skill),
  with the claimant in the tooltip. The button's arrows circle through the four container phases (`prefers-reduced-motion` slows
  them); the tooltip names the container. Stack, 2026-10-05, second round: "animate the arrows so that they circle while the crawl
  is occuring", the label reads `crawling…` and not `container: crawling`.
* A queued row nothing has claimed after 75 s (three runner polls of 25 s) reads `waiting on the container…`; only then does a
  second press copy the paste command and show it. The Windows skill stays the fallback (CLAUDE.md), so the command stays reachable.
  A queued row the runner claimed before (`claim_attempts > 0`: `sync_requeue_orphans()` after a restart) reads `sync requeued…`
  for ten minutes from its filing (a restart takes well under that), then `waiting on the container…` like any other; a press
  offers the command in both. The unclaimed tooltip dates the request ("requested 2 min ago", `relativeTime`) rather than
  counting seconds. The web now reads `claim_attempts`; 091's column comment ("No web or
  desktop code reads it") is stale from here and the next migration touching the column refreshes it.
* The tab follows any request it sees open by id, so a close is read (and announced once) after the open lookup stops returning
  it, and a closed request of this tab's never hides a newer open one. A failed read of any of the three queries renders an alert
  line instead of a stale label.
* The close of a request the tab saw moving is announced once with the report's first line ("Sync done · Files: 3 pulled, 1 not
  pulled"); a request already closed when the page loaded says nothing, that is Activity's. A close that left a file unpulled for
  a reason the next sync will not retry (the runner's `files.not_pulled[].reason`, anything but `session_expired`; the skill's
  `files_not_pulled` count, which carries no reasons) stays up until dismissed, with "One file could not be pulled. Its Inbox item
  has the Blackboard link; open it and say what should happen.", an "Open the Inbox →" link and Dismiss. The manual steps live in
  the Inbox because the fold already raises a `data_gap` item per file without bytes (`stage_gaps`, `files_without_bytes`; item 3441
  for file 2489 today) carrying the file's Blackboard `source_url`, and the card records what should happen for `/inbox-apply`.
  Stack, 2026-10-05, second round: "if the popup indicates that there was a file that needs to be pulled we should be prompted to
  do the manual steps … (if required)".
* Code: `web/src/lib/sync-request-phase.ts` (pure: phase, labels, titles, press action, headline), `web/src/lib/queries.sync-run.ts`
  (the run row by `run_id`, polled every 10 s while the request is claimed; the id is checked as a uuid before it reaches a filter),
  `web/src/lib/use-now.ts` (the clock as state, so render stays pure under the React compiler lint); `agent_requests` reads carry
  `run_id` and `claim_attempts`. Gates: web vitest 135 files / 2402 tests, `tsc` 0, `eslint` clean; `/code-review main high`, round 1:
  12 findings, 11 applied in round 2 (two correctness: a closed request of this tab's could hide a newer open one and let a press
  file beside it; the close of a sync watched without a press was never announced), one already met (STATUS and DECISIONS landed
  in the PR's later commits). Accepted, not changed: a second queued row behind a claim the runner is resuming after a restart
  would read `waiting on the container…` after the grace; the tooltip asks whether the container is busy or down rather than
  asserting it is dead, and a fallback session's own claim is first-wins against the runner's, so no second crawl starts.
  Round 3 (on the arrows, labels and prompt commit): 13 findings, 12 applied — the e2e walk finds the button by `data-testid`
  (its title follows the request now); the clock is an external store (`use-now.ts`, `useSyncExternalStore`) re-read on
  subscribe, ticking 5 s while the request is queued and 60 s once it has closed, so the done tooltip keeps counting and a
  row found on focus is dated right; the alert and the toast stack instead of overlapping; a disabled run query's cached
  error is not shown; a requeued row escalates to unclaimed after ten minutes; `already stored by another writer` asks
  nothing; a failed press no longer wipes the prompt; reduced motion stops the arrows; one `asRecord` (`json-record.ts`)
  serves three modules; the unclaimed tooltip dates the request through `relativeTime`. Declined: splitting
  `queries.sync.ts` (1,400 lines) is its own refactor PR; this PR adds six lines to it.
  `/security-review` not run: no auth, secret or endpoint touched (one owner-scoped `sync_runs` read, the id checked as a uuid).

**Found the same day, not fixed here:** sync 1297 (request 1856, 2026-10-05 18:07Z) pulled 3 files and left file 2489 unpulled
with Storage `400 InvalidKey`; see Known issues.

## What's next — Sprint 2

Planned 2026-09-24 on `docs/sprint2-planning` ([PR #28](https://github.com/emstacho-su/bb2dash/pull/28), merged as 67269b5 on 2026-09-27): requirements `docs/planning/sprint-2/91_REQUIREMENTS_v3.md`
(R-29..R-109 carried, P-1..P-113 PM- and research-added, Stack's eight items in §3, 22 still-declined rows in §4),
research `research/92_*` and the synthesis `93_SPRINT2_RESEARCH_SYNTHESIS.md` (its §5 is the one question batch,
59 items with defaults), the phase plan `94_SPRINT2_PHASES.md`, and one brief per phase under `briefs/` with a
deterministic check on every task, drafted, critiqued and verified in three Opus rounds on 2026-09-27 (the record and
the 31 residual minor notes: `105_BRIEF_VERIFICATION_2026-09-27.md`). Stack delegated the batch answers and the plan approval to the PM on 2026-09-27; the DECISIONS rows of that
date hold all 59 answers (departures from the defaults: item 10, item 45) and approve the plan (DECISIONS 2026-09-23, 2026-09-24, 2026-09-27).

| Phase | Name | Brief | Migrations | Order |
|---|---|---|---|---|
| 15 | Database hygiene and the SQL test runner | `95_PHASE15_db_hygiene.md` | 100–102 live | **merged 2026-09-29** ([PR #30](https://github.com/emstacho-su/bb2dash/pull/30), 6ef3933; row 17 above); gate-out green on `main`, R3 and R4 open |
| 16 | Grades: V-1 sittings and the reconciliation migration | `96_PHASE16_grades_v1.md` | 105–106 live | **merged 2026-09-30** ([PR #44](https://github.com/emstacho-su/bb2dash/pull/44), 4c310ff; row 19 above); R-29 waits on Stack's three B-9 dates |
| 17 | Web polish: quick fixes, carried bugs, Inbox/planner leftovers, proofs | `97_PHASE17_web_polish.md` | 110–119 and 150 live (150–159 its overflow block) | **merged** ([PR #43](https://github.com/emstacho-su/bb2dash/pull/43), d9d5ee9; row 18 above) |
| 18 | Ingest and corpus | `98_PHASE18_ingest_corpus.md` | 120–129 live; 160 (overflow block 160–169) | **merged 2026-09-30 before its gate sync**; re-read 2026-10-03: tasks 14, 17 and 18 settled by the syncs since 10-01; `98a` §2/§5 and task 28's screenshots still owed; task 19's code half landed 2026-10-04 (the crawler PR) and task 26 (R-73) closed 2026-10-04 on Stack's word (row 19 above; 108 §3) |
| 19 | Content identity, per-crawl history, sync honesty | `99_PHASE19_content_history.md` | 130–139, 170–172 live | **merged 2026-10-03** ([PR #60](https://github.com/emstacho-su/bb2dash/pull/60), 206ee3a; row 21 above) |
| 14 | Containers (R-28) | `100_PHASE14_containers.md` | 091, 093, 094 live; 092 struck | **merged 2026-10-04** on Stack's word, before his acceptance sitting (#62, #67, harness #39, bb2dash-stack #1; section "Phase 14" above); A1–A9 owed |
| 20 | Harness closure (V-2 on record, note quality, checkpoint redaction) | `101_PHASE20_harness_closure.md` | none here | **PR-A (#39), PR-B (harness #36, + #37) and PR-C (#48) merged 2026-09-30**; V-2 closed on Stack's word (2026-09-30); tasks 2 and 29 done (row 20 above) |
| 21 | Workspace chat on the subscription | `102_PHASE21_workspace.md` | 140–149 | after 14 |
| 22 | Styling | `103_PHASE22_styling.md` | none | last |

How to run them: `106_SPRINT2_EXECUTION_PLAN.md` (dependency order, no calendar). Stack's standing items are ORCHESTRATOR §4. The sessions that run these phases are ORCHESTRATOR §6.

**Next for Phase 20 (2026-09-30):** Stack reads `101a_V2_VERIFICATION.md` and gives his word on V-2 (acceptance step 9;
the PM writes it into the last DECISIONS row of 2026-09-30); PR-C merges on his word; then task 29 (the PM writes the
merged `skills/inbox-apply/SKILL.md` over the installed copy, `cmp` 0). Task 2's first real Apply run lands with the
next answered Inbox item or sync. The two harness follow-ups in 101a (the Session facts newline, the superseded Status
row) go to the harness backlog, not this phase.

## Sprint 1 record — Requirements v2 (`docs/planning/sprint-1-hub/60_REQUIREMENTS_v2.md`)

Stack confirmed the post-Phase 7 direction on 2026-09-10 after five rounds of clarification;
`60_REQUIREMENTS_v2.md` (R-01..R-26) supersedes every earlier backlog. Phase order (§4 there):

| Phase | Name | Brief | Status |
|---|---|---|---|
| 8 | Course dimension (Classroom-style course page) | `61_PHASE8_course_dimension.md` | **merged** (PR #8, 2026-09-14) — courses sidebar on the right added after Stack's preview review |
| 9 | Sync loop (automated transform, Inbox, `bb-files` bucket → private) | `62_PHASE9_sync_loop.md` | **merged** (PR #10, 2026-09-15) after Stack's first live end-to-end sync |
| 10a | Grades: gradebook mirror, Grades screens, submission pull-back, staged upload | `67_PHASE10A_grades.md` | **merged** (PR #13, 2026-09-16; migrations 046–056 live). Mirror verified by Stack's 9/16 sync; the attempts probe and step 4b run on the first post-merge sync |
| 10b | Grades: methodology model + what-if | `68_PHASE10B_grade_model.md` | **merged** (PR #15, 2026-09-16; migrations 057–058, 080–081 live; PM browser walk 7/7 + round 3) |
| V-1 | Grading schema validation (stream, Stack + a materials-only session) | `63_GRADING_VALIDATION.md`, `64_GRADING_SCHEMA_EXPORT_2026-09-14.md` | **stubbed for later** (Stack, 2026-09-16: a data-accuracy task, no longer a gate for 10b); reconciliation migration stays 059; it should fold `grade_column_links` into `assignments` and fill placeholder points. Launch: `scripts/validate-grading.ps1` |
| V-2 | Session archival, context tagging, RAG hand-off (R-27; stream in `~/agentic-harness`) | `66_SESSION_ARCHIVAL_RAG.md` | **built in the harness** (its PRs #1–#4, 2026-09-16); the acceptance walk from bb2dash's side and the doc closure are carried into sprint 2; recorded here 2026-09-24. **Closed closed on Stack's word 2026-09-30 on 101a** (2026-09-30, Phase 20: `docs/planning/sprint-2/verification/101a_V2_VERIFICATION.md`, 21 of 21 lines met or met as restated) |
| 11 | Planner + Google Calendar push, announcements bell/page, data gaps | `69_PHASE11_planner.md` | **merged** (PR #12, 2026-09-16; migrations 060–066 live, calendar push live and proven; Stack signed off the six-step script) |
| 11b | Planner events created in bb2dash and pushed to the `bb2dash` calendar | `69b_PHASE11B_planner_events.md` | **merged** (PR #14 + display follow-up PR #16, 2026-09-16; migrations 067–069 live, `calendar-push` v5 live, live proof and browser walk done) |
| 12 | Electron shell, tray, desktop notifications, Sync button runs the command | `80_PHASE12_electron.md` | **merged** (PR #19, 2026-09-17; Stack walked the shell steps and the tray on the unpacked build and said merge — his "steps 1–5" take in the toast steps 4–5, which stay open; the three toasts are still to be seen live). His first launch found one bug, fixed before merge: the app was named `bb2dash-desktop`, so it read its config from the wrong `%APPDATA%` folder (`productName` now pins `bb2dash`). Shipped: `desktop/` package, Electron 44.4.1, unpacked build `desktop/dist/win-unpacked/bb2dash.exe`; window + single instance + tray (close hides), navigation allowlist, poller with on-disk watermark and the three toasts, Sync button runs `claude '/bb-sync <id>'` in Windows Terminal (`syncDryRun` prints it instead); `core/` has no `electron` import (R-28). 535 unit + 19 e2e tests; `/code-review main high` 10 findings fixed (brief §Round 2), `/security-review` none ≥ 8/10; zero changes under `web/`; no migrations. Notes: `80a`, `80b`, `80d`. ~~**Not yet proven, only Stack can:** real Windows toasts, a real `wt.exe` sync run, the clipboard copy inside the shell, staying signed in after hours in the tray.~~ **Proven since (2026-09-24):** a real `wt.exe` sync run (request 39 → `sync_runs` 62, 2026-09-23; `syncDryRun` false since 2026-09-22) and staying signed in hidden in the tray (19.5 h and 17 hidden-window reloads, `main.log` 1079–1359); Windows received the toasts (12 "showed toast" lines, Action Center). **Still Stack's (R-108):** seeing a toast and clicking one, and the clipboard copy inside the shell. ~~Carried to 12b: `web/src/lib/supabase/proxy-session.ts` drops refreshed auth cookies on its two redirect branches; low-priority hardening: police `will-redirect` / `will-frame-navigate`~~ Both fixed in 12b (P-shell-1 `81ac532`, P-shell-2 `493c4a0`, PR #20) |
| 13 | Styling pass | `docs/planning/sprint-2/parked/81_PHASE13_styling.md` | **skipped** (Stack, 2026-09-22: more development phases first); its carry-ins C-1..C-3 (phone-width overflow, rank weights shown per exam, favicon) stay parked in the brief |
| 12b | Fine-tooth-comb pass over every page and feature | `80c_PHASE12B_page_pass.md` | **MVP merged** (PR #20, 2026-09-17; migrations 073–079, 084–087 live; gates run; PM walk in `80d`); **tail merged** ([PR #22](https://github.com/emstacho-su/bb2dash/pull/22), 2026-09-21: T-1 recurring events + T-2 popover and assignment page; migrations 082–083, 088–089 live; walk in `80o`); v4 proof sync **done 2026-09-22** (request 34: 26 attempts, 55 gradebook columns, 21 auto-graded); P-data-1 deferred, P-db-3 declined |
| — | Inbox feedback loop, automation half (`/inbox-apply`, Apply answers button) | `skills/inbox-apply/SKILL.md` | **merged** (PR #23, 2026-09-22; migration 090 live; Inbox 0 open / 134 archived at merge; 2026-09-24: 0 open, 138 archived, 4 in `v_inbox_queue` — 541–543 dismissed, 544 answered). Counts since Phase 17 are read from `/inbox-apply`'s runs, `v_inbox_queue` (answered, not yet applied) and the decisions store (vault collection `bb2dash-inbox-decisions`, 145 notes on 2026-09-30, each with `decided_by`) |
| 14 | Containers (R-28): every local process in Docker | `docs/planning/sprint-2/82_PHASE14_containers.md` + `docs/planning/sprint-2/research/82_RESEARCH_phase14_R1…R6` | planned 2026-09-16; **sprint 2 candidate** — Stack decides its place in the sprint 2 list; migration range 091–099 |

**MVP, definition of done, task loops (2026-09-14, PR #11):** every remaining phase and stream
now has an explicit MVP in Stack's words, a DoD checklist (SOP gates + his acceptance script +
research-derived items), and a looped task table with an executable check per task — in each
brief (`62`, `63`, `66`, `67`, `68`, `69`, `80`, `81`) and indexed in
`docs/planning/sprint-1-hub/70_MVP_INDEX.md`, whose §5 lists the open questions Stack answers when each
phase's PM session freezes its Contract. Research behind them: `docs/planning/sprint-1-hub/research/`.

Migration ranges: Phase 8 = 026–029, Phase 9 = 030–045 (030–040 plus its review-fix rounds 041–045), Phase 10 = 046–059
(10a took 046–056; **10b took 057–058**; **059 held for V-1's reconciliation**), Phase 11 = 060–066,
Phase 11b = 067–072 (used 067–069; 070–072 free), Phase 12 = 073–079 if needed, Phase 10b review rounds = 080–081; **Phase 12b = 073–089** (MVP 073–079, 084–087; tail 082–083, 088–089 — the range is used up); **090 = inbox-apply**; sprint 2 starts at **091**. Both phase branches cut from `main`
(Phase 7 is merged). The professional-side stub is dropped (Stack, 2026-09-10).

Phase 7 leftovers folded into the plan: automatic `superseded_by` on re-uploaded files and the
remaining near-duplicates (bb_files 17, 18/19, IST.352 31/32/47) → Phase 9 `stage_files`;
`web/` test coverage for Today/Course/Materials → Phase 8's workers add screen tests as they
touch those screens; stored per-part `tsvector` on `bb_text_embeddings` → only when the palette
feels slow, not before.

**Security:** `bb-files` bucket private (030, anonymous GET 400); all public views
`security_invoker` with anon revoked (036); transform folds only owner-registered crawls (039);
`bb_files` anon INSERT refuses `my_submissions` rows and any `classified_by` of `stack` or
`blackboard` (049) — the Storage-side anon INSERT is deliberately unchanged (bytes with no
catalogue row are invisible; the pull step uploads with the publishable key); `bb_gradebook` /
`bb_attempts` owner-only, stage functions `service_role` only; `grade_scenarios` /
`grade_column_links` owner-only with the initplan-safe `(select auth.uid())` form, the three model
views `security_invoker` and revoked from anon (`/security-review` of Phase 10b: no findings).
Remaining advisor items: ~~7 pre-existing mutable `search_path` functions (`set_updated_at`, `classify_bb_file`, `bb_file_relpath`, `suggested_start`, `search_file_text`, `match_file_text`, `hybrid_search_file_text`)~~ — **fixed by `101_search_path_pin` (Phase 15): the advisor lists 0, and `db/tests/phase15_101_search_path_pin.sql` keeps it there, since its guard (a) raises if any non-extension `public` function loses its pin**; two SECURITY DEFINER functions callable by `authenticated` (`app_owner`, accepted 2026-09-10; `calendar_push_now`, accepted 2026-09-27 with its own DECISIONS row), and Auth's leaked-password protection off (a Pro-plan feature; the org is on Free; accepted 2026-09-27 with its own row; signups were disabled 2026-09-10 per Stack); the 21 `auth_rls_initplan` warnings were fixed by 076. **Accepted INFO (R-80): 16 unindexed foreign keys (15 in the 2026-09-27 row; the 16th, `bb_material_history_bb_file_id_fkey` from Phase 19's 132, accepted 2026-10-03 with its own row), 3 unused indexes** (`announcements_fts_idx`, `bb_content_fts_idx`, `bb_text_embeddings_hnsw`), each with its reason in the 2026-09-27 DECISIONS row; `bb_attempts_sync_run_idx` was the fourth until Phase 15's own suite runs scanned it, which is the row's evidence for keeping indexes that cover a foreign key.

## Known issues / operational notes

* **A file whose name carries a non-ASCII character is never pulled** (found 2026-10-05 on sync 1297 / request 1856: file 2489,
  GEO.103's week-7 reading "Musk’s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf", Storage
  `400 InvalidKey` for key `GEO.103.lecture/readings/week-07/Musk’s AI ….pdf`). `storageKeyFor` in `ingest/pull_files.mjs`, shared
  by the skill and the container runner (`sync/src/files.ts` imports it), is the catalogue's `relpath` with only `#` replaced
  (`safeBasename` cleans the scratch download name, not the key), and Supabase Storage validates the decoded key against an
  ASCII word-and-punctuation set, so the curly apostrophe (U+2019) is refused on every sync and the report says "1 not pulled"
  each time. Fix owed: map the key onto Storage's allowed set in `storageKeyFor` (one PR in `ingest/`,
  exercised by `sync/`'s tests), then the next sync pulls it.
* **Phase 19 (2026-10-03): a sync whose data folded but whose session died before closing its request stays
  `claimed`**, so the Sync button keeps reading "syncing…". The 30-minute terminal rule covers only crawls that never
  completed; a cut-off for this case would close a legitimate long file pull. Left for Phase 14's runner and
  `sync_close` (DECISIONS 2026-10-02, terminal-rule row). If it happens: close the request by hand after checking its
  file pull finished.
* ~~**Request 456 (`inbox_feedback`, `queued` since 2026-10-01 18:02:53Z; the earlier note said it predated 116, which was applied 2026-09-29) is the one open `inbox_feedback` row** and is what the Inbox footer's "✓ queued"
  shows. Not Phase 19's; left for Stack to cancel or for the phase that owns the Inbox.~~ Cancelled 2026-10-04 01:21Z on Stack's word ("cancel request 456"), superseded by request 458, which applied the same answers on 2026-10-01 (DECISIONS 2026-10-04); no `inbox_feedback` request is open.
* **The live "Sync interrupted" desktop toast is unproven:** the desktop runs the post-Phase-19 build since 2026-10-03 22:41:59Z (`main.log`: `origin/main is the running build cc80307`), but no sync has been interrupted since; the reducer and
  poller are unit-tested (708/708). The next interrupted sync shows it.
* ~~**`web/package-lock.json` is out of sync with `package.json` on `main`** (found 2026-09-29 by Phase 16's
  W-43): `npm ci` fails on a fresh cut (missing `@emnapi/runtime` / `@emnapi/core` 1.11.3); workers ran `npm install`
  and restored the lock. Needs its own fix PR; not Phase 16's file.~~ Fixed on `main` by 2026-09-30 (Phase 17 merge): `npm ci` passes.
* **PowerShell refuses repo `.ps1` scripts on `stack-laptop` by default** (execution policy `Restricted`). Stack set
  `CurrentUser` to `RemoteSigned` on 2026-09-29; `node scripts/validate-grading.mjs <COURSE>` works without it.
* ~~**Slide 13 of IST.323's course-intro deck (`bb_file:8`) is missing from the extracted text** (slides 12 and 14
  exist); found by Phase 16's spot check. ~~An extraction gap for Phase 18.~~ Phase 18 merged without it (2026-10-03 audit); it rides the crawler PR that finishes Phase 18's task 19.~~ Not a gap: migration 119 (Phase 17, 2026-09-29) deleted that unit on purpose, because slide 13 is the course's AI-use policy and nothing else (119's header, item 2), on Stack's call to strip the AI policy from the corpus; the V-1 sitting cited it the same day. Nothing to re-extract (DECISIONS 2026-10-04).
* **A checkout whose `web/node_modules` predates Phase 17 fails `npm run typecheck` with 124 errors, every one downstream of `Cannot find module '@playwright/test'`** (found 2026-10-03 23:00Z in the main checkout; `npm --prefix web ci` fixed it, 0 errors). Not a code defect: after any merge that changes `web/package.json`, run `npm ci` in every checkout that runs the gates. The same evening's SQL suite from the main checkout read `passed 58, failed 1, units 59`: the FAIL is `phase15_100_db_test_runner_role.sql`, whose expected membership list lacked the `sync_runner` that Phase 14's migration 094 (live 2026-10-03 21:01Z) added ahead of its PR; the branch's one-line change is ported byte-identical to `main` in [PR #65](https://github.com/emstacho-su/bb2dash/pull/65) (DECISIONS 2026-10-03), so the suite reads 59/59 once it merges and Phase 14's merge sees no diff in that file.
* **Phase 14's container runner is live against prod since 2026-10-03 22:52Z** (its own session; `docker compose up -d sync` from `feat/containers-14`, image `bb2dash-sync:local`): `sync_next()` returns every queued `sync`, so while the container's Blackboard login is dead (Inbox item 3074 `sync-login-required` was open from 23:00:37Z until 23:17:38Z, when the runner's next passing login check archived it with `closed_itself: true`, trigger `sync_login_ok`: R-83's self-close, seen live; Stack signed in again through noVNC afterwards) the runner closes a queued request as `login_required` in about 25 s and a desktop Sync press under the default `terminal` launcher fails. The Windows path works again once Stack signs in through noVNC, or when the `sync` service is stopped between proofs. Its result shape (`{files:{pulled, not_pulled[]}, lines, claim_attempts}`) differs from the skill's `files_pulled` / `files_not_pulled` until the cut-over.

* **Desktop shell at logon (2026-09-29, PR #31).** On `stack-laptop` the shell is built and started by
  `desktop/launch/` (see its README): `Bb2dash-LogonBuild` fetches `origin/main`, launches
  `%LOCALAPPDATA%\bb2dash-launch\current\bb2dash.exe` through `Bb2dash-App`, and rebuilds in
  electron-builder's wine image (`docker compose run --rm`, image pinned by digest) only when
  `origin/main:desktop`'s tree hash differs from `state.json`'s `lastBuiltSha`. PR #31 merged on 2026-09-29 (6295b83) and the
  task was re-registered with the default `-BuildRef origin/main` the same day (it had run against the
  feature branch until then). The build reads the detached worktree `C:/Users/stack/projects/bb2dash-build`; the
  main checkout is only fetched, never pulled, because `/bb-sync` runs there. `config.json`'s
  `repoDir` names the main checkout, back on `main` since the merge. Log:
  `%LOCALAPPDATA%\bb2dash-launch\logs\logon-build.log`. This reverses Phase 12's
  "launch at login: out" (DECISIONS 2026-09-29).

* **`stack-laptop` stand-up (2026-09-29).** `.env.local` with the `db_test_runner` DSN (Phase 15 acceptance step 1) was
  recreated on 2026-09-29 (the walk-15 snippet re-run with this machine's paths, password reset in the dashboard by Stack);
  walk steps 2–4 and the gate-out on `main` are green. The materials MCP server was built and registered the same
  day (`mcp-server/README.md` §Setup: `.env` written by Stack in PowerShell, smoke all checks passed, `claude mcp list`
  → Connected), so Phase 16's sittings can start. The runner password was rotated once that day after an
  `alter role` line was saved in the SQL editor by mistake (walk 95w step 1 re-run; the old password is dead). The Google consent screen stays in Testing by Stack's choice
  (2026-09-29): the token minted 2026-09-24 17:02:50Z died 2026-10-01 18:45Z (308 failed push runs until his re-mint about 2026-10-02 05:00Z; the next expiry is about 2026-10-09 05:00Z), and he re-mints with
  `scripts/google-consent.mjs` then (DECISIONS 2026-09-29). Task 0's probes run through Claude in Chrome; the record is
  `docs/planning/sprint-2/verification/82b_NOVNC_SPIKE.md`.

* **(Superseded by Phase 12b: the strict rule is gone; every course with a graded item shows "graded so far" and names what it leaves out. A scored column linked to no part — ECN.304 Quiz 2 and Attendance on 2026-09-17 — is named under the figure until Stack places it with "Counts toward…".)** Before 12b: the grade model (10b) showed on no course until Stack acted. The
  strict rule (his answer 1) hides it where a `manual` part is unscored: IST.323 Class
  Participation, ECN.304 Participation, IST.352 Attendance / Class Contribution, GEO 103's two
  attendance parts. ECN.304 computes if he links its Attendance column (85.7) to Participation.
  IST.466 needs a first score or a what-if value; its Major Cases and AI Team Assignment are left
  out while their links are unsure.
* **IST.323's 13-point proposal column** bundles the 11-point proposal and the 2-point final log
  (one column cannot count toward two parts)~~, so once graded and linked the agreement reads
  "no known reason"~~ (12b removed the agreement sentence). Since a "Counts toward…" link of 2026-09-22 16:14Z it
  counts toward the 11-point proposal part only, so a 13-point item overfills that part and the final
  log's 2 points are never graded (R-30). V-1 data; not a code fix.
* **18 placeholders carry no points** (V-1 data; 21 on 2026-09-16, 18 on 2026-09-22). ~~Confirmed ones in fraction-based parts take a
  what-if as a percentage; `sum` parts (IST.323 `fp-packet`, IST.352 `term-project`) and unsure
  series placeholders take none.~~ Since 12b removed what-if (2026-09-17), a placeholder never enters
  the figure; a Blackboard column that binds to one fills its points (084).
* **Post-merge reconciliation (2026-09-16, after PR #15):** every repo migration is recorded on prod
  (70 files = 70 bb2dash rows). 046–058, 067–069 and 080–081 are byte-identical; Phase 11's 060–066
  match once the repo file's final newline is dropped (applied without it — no content drift). Prod's
  `schema_migrations` also holds six `create_rag_*` / `rag_search_*` / `drop_rag_schema_relocated_to_harness_memory`
  rows from the harness RAG store before it moved to `harness-memory`; they are not bb2dash migrations.
  Prod migrations now run through 090 (version `20260922165710`, 2026-09-22). No open PRs; only `main`
  remains locally and on GitHub.
* **Phase 11b merged first** (PR #14 and #16, 2026-09-16). Phase 10b's branch then merged `main`,
  regenerated `database.types.ts` from prod (both phases' objects) and reconciled the three docs;
  the migrations never overlapped and no source file was shared.

* **Attempts — proven 2026-09-22 (sync 34, crawler v4: 26 attempts across 5 courses, 2 submission files pulled; 52 attempt rows by 2026-09-24).** History: v3's endpoint answered empty for a student (2026-09-17 sync, 21 of 21 columns); v4 (Phase 12b, `80f`) walks grade → attempts → detail. Older note — attempts key names were unverified until the first crawler-v3 sync — the next `/bb-sync`
  from the `main` checkout. `bb_attempts.raw->'keys'` and `bb_content`'s `detailSource` probe
  name the real keys; the candidate lists in `bb_crawler.js` are then cut to one name each
  (`66_W17_VERIFICATION.md` §10). (Superseded: `bb_attempts` is populated. Not cut, and should not be:
  both `submitted` candidate names are live, 3 of 26 attempts use the second; attempt feedback arrives as
  `feedbackToUser`, which the mapper does not read — 2026-09-24.) Crawler v5 (Phase 18 task 5) reads `feedbackToUser`
  first; proven on the live v5 crawls (12 attempts carry feedback text on 2026-10-04; column `_3610995_1`'s in six runs). **Cut on 2026-10-04 (Phase 18 task 19, the crawler PR):** feedback reads `feedbackToUser` alone (the `{rawText, displayText}` form seen live; the plain-string form accepted by R-66, not yet seen), there is no file-size list (Ultra sends none; bytes come from the pull), both `submitted` names stay, and `studentComments` keeps its one never-seen name so the envelope's shape holds; `CRAWLER_VERSION` stays 5 (DECISIONS 2026-10-04, R-66 and R-75). **Round 2 (PR #68's code review, merged the same day):** file `id` keeps `['id', 'bbFileUuid']` and `name` keeps `['name', 'file.fileName']` (both names real on every live entry, so a blank display name or a missing `id` no longer loses the file); `strip()` flattens only a string half, never an object, and `studentSubmission` is read string-only like feedback, so `[object Object]` can never reach `raw`; the header keeps the rule and points to DECISIONS for the numbers (861 lines again).
* Mirrored scores are stored `numeric(9,3)`: ECN.304 Attendance ~~83.33333 renders as 83.333 (one
  value of 45)~~ 88.88888 renders as 88.889 (2026-09-24: the only rounded value among 27 scored of the
  58 latest columns, plus 1 of 47 scored attempts in `bb_attempts.score`; third decimal of a percentage).
  Widening the column means recreating the ~~five~~ eight views that depend on it; **declined**
  2026-09-17 (P-db-3).
* ~~`IST.323/fp-proposal` / `IST.323/fp-log-final` skipped by the calendar push~~ — **fixed by 075 + 084 (Phase 12b)**: a column shared on purpose is restamped, not a conflict; both rows are in `v_calendar_push_items` and on the Google calendar since 2026-09-17. History in `69a_W21_VERIFICATION.md` §4.1.
* `calendar-push` is the one edge function with `verify_jwt` off; it authenticates the tick's
  `x-push-secret` header. Nothing else should call it.
* **Planner events are real the moment they are saved**, on the preview as on prod: the push puts
  them on Stack's Google calendar within two minutes. There is no staging calendar; tests use mocks
  and live proofs delete their rows in the same sitting.
* Planner events are never pruned by date, so the push set grows; reads are paged since v5 (R2-1).
  A creation on a DST fall-back hour takes the earlier instant (Temporal `compatible`); Postgres
  would pick the later, which is why SQL never converts a planner wall clock.
* ~~`calendar_events` grants `TRUNCATE` to `authenticated`~~ — fixed by 076 (it was 79 grants across `public`, to anon and authenticated; all revoked, default privileges too).
* ~~The kind colours are W-23's pick (DECISIONS 2026-09-16) until Stack confirms them on the walk
  (2026-09-24: no nod recorded; R-59, sprint 2 question batch item 31, default keep).~~ Kept (B-31; DECISIONS
  2026-09-27 and 2026-09-29, Phase 17).
* **Calendar push outage 2026-09-23 19:57Z → 2026-09-24 17:03Z.** Runs 51–683 (633, one every
  2 minutes) failed with "refresh token revoked or expired"; the first token (minted 2026-09-15
  21:35:55Z) died between the last ok run (50, 2026-09-22 19:07Z) and run 51, a window that brackets
  mint + 7 days. Stack re-minted it 2026-09-24 17:02:50Z; run 684 was ok and inserted the 3 missed
  events (push set 73 = mirror 73). Cause unverified: the consent screen's publishing status is not
  recorded, and a Testing-state token dies again about 2026-10-01 17:03Z. ~~Nothing on any screen showed
  the failure (R-52; DECISIONS 2026-09-24).~~ Fixed by migration 113 (+ 118, Phase 17): after 3 failed pushes Home
  says "Google Calendar push has failed N times since …" with the error (T-19, shot 08; R-52).

* IST.466 publishes two sibling content branches with identical `path`s; `bb_content`'s
  `(course_id, path)` key holds one, so Classwork shows one branch. Needs a key change
  (`bb_item_id`-based) in a later phase.
* **Merge Phase 8 before Phase 9.** Migration 036 asserts every public view is
  `security_invoker`; `v_course_display` gets that from Phase 8's 028. Prod holds both already;
  the rule keeps a fresh replay of `db/migrations` in README order working.

* ~~Migration 020's RLS policies call `auth.uid()` per row~~ — fixed by 076 (Phase 12b): 22 policies rewritten as `(select auth.uid())`; the advisor shows none.
* `bb_crawler.js` generates `run_id` inside `runAll`; the skill registers it right after the
  crawl returns and migration 039's grace window covers the gap. ~~A `runId` parameter on
  `runAll` would let the skill register first (one-line change, next time the crawler is touched).~~
  `runAll({ runId })` exists since crawler v3; the skill still registers after the crawl on purpose
  (DECISIONS 2026-09-15) until the tick checks a crawl is complete before folding it.

* Sandboxed Claude sessions cannot reach `*.supabase.co` (org egress policy) — invoke edge
  functions server-side via `pg_net` (`net.http_post`); pg_net is enabled and load-bearing.
* Edge CPU budget caps embedding at ~8–9 parts per invocation; `embed-corpus` resumes per-part.
* ~~`part_range` on text 276 is one char long~~ — fixed (023 + `embed-corpus` v5, Phase 7).
* ~~`bb_raw` run 19 still lists the IST.466 "Wk2x" root item~~ — cleared by later crawls (gone from the content tree by 2026-09-22).
* Hybrid `snippet` length is a word budget (`MaxWords=40`, two fragments), not a char budget:
  observed 81–791 chars. Clients truncate for display.
* A matched-passage snippet cut from part ≥2 of a PPTX unit would start *after* the `[notes]`
  marker; since 024 the function prefixes `[notes] ` to such a snippet (and the whole-unit
  fallback headlines only the text before the marker) so the marker-based client scrubbers
  still label it. ~~Verified on synthetic fixtures only — 51 units carry `[notes]` today and none
  is multi-part. The ingest cadence work (backlog 1) should re-run that check after every crawl.~~
  2026-09-24: 109 units carry `[notes]` and one is multi-part (text 750); a read-only live check
  passed there (part 2 snippet prefixed `[notes] `). ~~No per-crawl check exists, and a snippet cut from
  the notes region of a part that holds the marker still comes back unlabelled.~~ **Fixed by 121 (+ 129, Phase 18):**
  a snippet never spans the marker and notes text always starts `[notes] `; `phase18_121_search_contract.sql` sweeps
  every current `[notes]` unit and post-embed (d) re-checks the live leaks after each corpus change.
* Hybrid keyword snippets recompute `to_tsvector` per covering part at query time: 27 ms at
  limit 12 on the 534-unit corpus (18–22 ms on 784 units, 2026-09-24). ~~See backlog 5 for the
  stored-tsvector fix.~~ The stored per-part `tsvector` stays deferred until the palette feels slow
  (DECISIONS 2026-09-10); the old STATUS backlog is superseded by Requirements v2. Re-measured 2026-09-29 (Phase 18,
  R-77): 20.7 / 35.5 ms before 121, 36.9 / 49.5 ms after it, **20.0 / 35.6 ms after 129** ("final exam date" /
  "attendance policy", limit 12); `part_fts` still not built (both under 50 ms).
* ~~Function search-path advisor warnings (pre-existing pattern) on the search RPCs.~~ Fixed by migration 101
  (Phase 15); pinning a SQL function also stops Postgres inlining it, and the re-time after the pin put the hybrid
  search at a 36.9 ms median over five runs, against the 60 ms ceiling.
* Never ship the service key to a browser; anon key is insert-only by design.
