# Sprint 2 — execution run sheet (dependency order, no calendar)

Date 2026-09-27 · PM: the Fable session · Product manager: Stack · Source of truth for prompts: ORCHESTRATOR §6 · Briefs 95–103 · Decisions: DECISIONS rows 2026-09-27.

Stack's instruction for this sheet: "dont add any date/time dependent tasks. I want to be able to iterate the phases in quick sucession." The nine runs below are ordered by their gates and nothing else. There is no calendar, no week and no pace. A run starts when its gate is open and Stack's steps happen when he can do them. Five limits come from outside the plan. Each is a latest-by bound or a closed window, not a target:

* **The Nov 30 – Dec 13 code freeze: no merge and no prod apply from 2026-11-30 to 2026-12-13, for every run** — a window, not pacing. It is Stack's standing term rule, kept by the 2026-09-27 no-date-paced-tasks row until he strikes it (ORCHESTRATOR §2, 94 §2, DECISIONS B-6). It also holds R9's tile pick and per-screen ticks outside it (B-6).
* **Migration 106 on prod before the IST.323 13-point column is graded (2026-12-03), which is inside the freeze, so in effect before 2026-11-30** — bound, not pacing (brief 96 §Why, open item 4). The 106/109 split is asked for as soon as sitting 6 cannot finish in time for this, never when the bound arrives (R2 step 8).
* **The Google OAuth consent screen published before the calendar token expires (about 2026-10-01 17:03Z if the screen is still in Testing)** — bound, not pacing (brief 97 T-27, ORCHESTRATOR §4).
* **The Duo remember-me window, a 14-day duration measured from the moment Task 0 starts** — bound, not pacing; it has no date of its own (brief 100 task 3, DECISIONS B-47 row).
* **Each B-9 answer before the day it names: the presentation slot (9/30 is the earliest candidate), the Major Case 1 day (10/20, 10/21 or 10/22) and the Major Case 2 day (11/17 or 11/19)** — bound, not pacing; Stack answers whenever he knows (DECISIONS B-9 row, R2 step 2, ORCHESTRATOR §4).

Stack's steps carry minutes as a rough size of his time, never as a slot. Effort is given only as 94 §1's size.

## 0. How to use this sheet

Pick the next run whose gate is open. §1 writes each gate as facts you can check, such as a merged PR, a runner exiting 0 on `main`, or a spike PASS, never as a date. Paste the prompt named under that run's heading in ORCHESTRATOR §6; this sheet names the heading and never restates the text. ORCHESTRATOR §6 groups the nine prompts into Sessions A–E, so paste it into its group's session if that session is parked, or into a fresh one. The bb2dash prompts start with `/bb2dash-pm`; Session D's starts in the harness repo. The PM runs the run's pre-flight (§1 for that run, §6 for every run) before it cuts workers. It stops where the run's "Stack acts" and "Stop points" say, and Stack does his step when he can. The PR merges only on his word in that conversation. The PM then does the post-merge steps, which open the next gates, and moves to the next run. Runs listed as concurrent may be started in parallel PM sessions; §2 says how many and which pairs are safe. A run whose gate is closed waits, and nothing else waits for it unless §1 names it as a gate. When an earlier PR merges under a later branch, §3 says what the later run does. When a gate fails, §5 does.

## 1. The runs in dependency order

R1 goes first. R2 to R6 open as soon as Phase 15's runner is on its branch (R2) or on `main` (R3, R4), or they have no gate at all (R5 is pasted as soon as R1 starts; R6 may start before anything). R7 waits for R3 and R4 to merge, R8 waits for R5, and R9 waits for every screen. **Every phase is laptop-led**, because its SQL checks run against prod through the laptop's gitignored `.env.local` and its sittings need Stack's machine. Cloud sessions cannot reach `*.supabase.co` (CLAUDE.md). The cloud-capable pieces named below could be split off, but no brief splits them.

### R1 — A1: Phase 15, database hygiene and the SQL test runner (brief 95, size S/M)

* **Prompt:** ORCHESTRATOR §6, Session A, heading `A1 — Phase 15`.
* **Gate in:** none. The brief header says "Depends on nothing; runs first" (94 §2 rule 1), and the brief is on `main` (PR #28 merged).
* **Runs concurrently with:** R5 (C1 is pasted as soon as Phase 15 starts) and R6. R2 joins once this run's PR is open.
* **Machine:** laptop. Every live check runs the runner against prod through `.env.local`, task 16 curls the `search` function, and Stack's steps 1, 5 and 6 use the Supabase dashboard. Only tasks 1–3 and 8 are offline and cloud-capable, which is too little to split off.
* **Pre-flight:** 105 §3 has two open notes on brief 95. Fix or strike both in the PR: the B-41 Pro branch also flips task 19's `get_organization` check to `pro`, and the no-credential branch leaves task 25 expecting 5 steps. B-41, B-42 and B-16 all came back as default, so strike PROVISIONAL and the task loop 1 grep then reads 3. Cut worktree `bb2dash-wt-15` on `feat/db-hygiene-15` from `origin/main`, then `bb2dash-wt-15-runner` (W-38), `-suite` (W-39) and `-migrations` (W-40). There is no `.env.local` yet: Stack writes it at task 5. Inside the phase, 100 goes on before 101, 101 before 102, and 103/104 go on only after 102 (brief 95 §Tables and migrations).
* **Stack acts:**
  1. Paste A1 and read the freeze note (laptop, ~5).
  2. Task 5 = acceptance step 1: run the PM's snippet, which sets the `db_test_runner` password in the dashboard SQL editor and writes `.env.local` with the session-pooler DSN (laptop + Supabase dashboard, ~10).
  3. Steps 2–4: `--ping`, then the full run (`passed 21, failed 0`), then the fixture file (laptop, ~10).
  4. Step 5: the advisors (dashboard, ~5).
  5. Step 6 = task 20: open the signups setting for the screenshot and change nothing (dashboard, ~5).
  6. Step 7: read the six DECISIONS rows and say merge (~15).
* **Stop points:** when 100 is on prod, with step 1's snippet on his clipboard (every live runner check waits on it); then "ready when you say so".
* **Merge:** one PR, on Stack's word, no exception. Before it merges, the PM carries R2's task 10a commit onto `feat/db-hygiene-15` and names it in the PR body (brief 95 §Seams, brief 96 §Seams).
* **Post-merge:** remove `bb2dash-wt-15` and its three worker worktrees and branches. The canonical `C:/Users/estac/projects/bb2dash/.env.local` keeps `BB2DASH_TEST_DB_URL`; the worktree copies go with their worktrees. `database.types.ts` does not change (brief 95: no new RPC). Update memory. **Gate out:** `node scripts/db-test.mjs` exits 0 on `main`, which opens R3 and R4. R2's checks move from 15's branch to `main`. R1 is also one of the three merges that R5's W-55/W-56 wait for.
* **Fallback:** If the platform refuses BYPASSRLS on a login role, use an owner-level DSN; 100 shrinks to nothing and the counts fall (brief 95 open item 1). A grant gap goes in 103, then 104; one found after that stops the PM, who brings the FAIL line to Stack. A red unit outside the three repaired here also stops the PM, who brings its FAIL line; no unit is ever skipped. A unit that turns red on a literal date gets a now()-relative fix and a DECISIONS line (open item 6). If `/security-review` objects to the plain password, the snippet sends a SCRAM verifier instead (open item 3).

### R2 — A2: Phase 16, grades: V-1 sittings and the reconciliation migration (brief 96, size L)

* **Prompt:** ORCHESTRATOR §6, Session A, heading `A2 — Phase 16` (the same session as A1).
* **Gate in:** R1's PR is open; the A2 heading says not to wait for the merge. Before task 8's baseline: the runner and role are on prod, `--ping` prints `connected as db_test_runner`, and 15's P-2 rewrite and P-30 fixture are green. Before task 10 applies 105: the count of prod migrations named `10[0-4]_` equals the count of those files on `feat/db-hygiene-15` (or `main`), and task 10a's commit is on `feat/db-hygiene-15` (brief 96 task 10, §Seams).
* **Runs concurrently with:** R1's tail, R3, R4, R5, R6 and R7. The files are disjoint (94 §2 rule 2) except for `skills/inbox-apply/SKILL.md`, which is shared with R6, and `phase10b_grade_model.sql`, which R2 edits after R1's W-39.
* **Machine:** laptop. The first launch and all six sittings run a confined `claude` session through the local `bb2dash` MCP server in `~/.claude.json`, and every runner check and the 105/106 applies go to prod. Stack also needs Blackboard+Duo for the sync that brings in ECN.304 Exam 1's score, and his Google account for step 8. Cloud-capable: docs tasks 1, 2, 7 and 28; tasks 5 and 6; web tasks 11–14 and 25; task 3's code.
* **Pre-flight:** 105 §3 has four notes on brief 96. Fix or strike each: the B-9 row should also name task 10's major-project-1 confidence SELECT; B-10's alternative changes counts the row does not name; the confined `claude` should be spawned with cwd = repo root, with a matching task 3 case; the reason the brief gives for keeping `Edit` in `--tools` is wrong. Rewrite the B-10 row, which came back changed ("Not graded" links in 105, no engine rule), and strike PROVISIONAL on the rest. Cut worktree `bb2dash-wt-16` on `feat/grades-v1-16`, with `-scripts` (W-41), `-db` (W-42) and `-web` (W-43). Copy `.env.local` into every worktree that runs the runner. Rebuild `mcp-server/dist` in the shared checkout before the dry run (task 4). Record `origin/main`'s vitest count at the cut (DoD).
* **Stack acts:**
  1. Paste A2 once R1's PR is open (laptop, ~2).
  2. B-9 answers, each whenever he knows it and before the day it names, entered as an Inbox value resolution: the presentation slot (SITN pick or individual slot, and which one), the Major Case 1 day and the Major Case 2 day. The slot should ideally come before task 10, so that a refused re-ask can ride 105 (laptop, ~9 in all).
  3. Only if R1 merged before task 10a: tell the PM how to proceed before task 10 (~2).
  4. First launch = step 2 / task 16: `.\scripts\validate-grading.ps1 IST.323`, `/mcp`, `/permissions`, the refused `.env` read and the write prompt (laptop, ~15).
  5. Sitting 1, IST.323: the 13-point column (B-12's 13/1 re-cut, `bb_file:151`), where the fp-log-final points go, and presentation-choice (laptop, ~75).
  6. Sittings 2–6, in this order, each as soon as he can after the last: IST.466 (B-13) ~60, IST.352 ~60, ECN.304 (Exam 1's column if posted) ~60, GEO.103 lecture + recitation (B-10) ~75, IST.471 ~60 (laptop). The one bound is 106 on prod before the Nov 30 – Dec 13 code freeze, inside which the IST.323 column is graded (2026-12-03), bound, not pacing.
  7. Once ECN.304 Exam 1's score has posted and R6's PR-A has merged: run a sync so the score reaches prod. If R4 or R7 holds the installed `bb-sync` copy at that point (§2), the sync waits for the holder's merge or runs from the holder's worktree with its copy, never from the main checkout or the desktop Sync button. Link the column with the picker only if it lands unlinked. The brief implies this step without naming it (Blackboard+Duo, ~10).
  8. Only if sitting 6 will not be done in time for 106 to be written, reviewed and applied before the freeze (the IST.323 bound): approve the split, IST.323's rows in 106 and the rest in 109 once the other sittings are done, never inside the freeze. The PM asks as soon as that is plain, not when the bound arrives (~5).
  9. After the PR opens:
     * step 1: read B-9..B-16 (~10);
     * step 5: read 96d (~20);
     * step 6: screenshot 05 (~2);
     * step 7: the rule line on the preview (laptop, ~10);
     * step 8: SITN on `/planner` and on Google (Google account, ~5);
     * step 9: Exam 1 counted (~5);
     * step 10: the invariant output, then "merge" (~10).
* **Stop points:** after tasks 1–15, with the `validate-grading` command on his clipboard; before task 10, only if R1 merged without 10a; after each sitting (the PM commits the verdict file and spot-checks three citations, task 18); after sitting 6, once 106 is written, reviewed and applied, the invariants have been rerun and the PR is open with a preview: "ready when you say so".
* **Merge:** one PR, on his word, no exception. 109 is the one contingency (§5).
* **Post-merge:** remove the four worktrees and branches. Copy the committed `skills/inbox-apply/SKILL.md` over `C:/Users/estac/.claude/skills/inbox-apply/SKILL.md` so that `cmp` returns 0. `database.types.ts` does not change (no RPC is new or changed, brief 96 §Contract). Update memory. **Gate out:** R2 is one of R9's gates, and `grading_invariants.sql` joins every later full suite. The conflict-safe 10a insert on `main` keeps R3's and R4's suites green. The ECN.304 rule line passes to R9's W-70.
* **Fallback:** With no credential, each runner check becomes one `execute_sql` paste and 107 is never written. A missing grant goes in 107, never through service_role. A refused B-9 re-ask puts the date in 105, or in 108 widened to hold it. A review finding after 106 is applied is fixed in 108; 106 stays byte-frozen. A spot-check mismatch goes back to that course's verdict file before task 21. If prod moved since a sitting, rerun that row's recheck; the row counts as already applied. A sitting that cannot happen: §5.

### R3 — B1: Phase 17, web polish (brief 97, size L)

* **Prompt:** ORCHESTRATOR §6, Session B, heading `B1 — Phase 17` (B2 follows in the same session).
* **Gate in:** R1 merged and `node scripts/db-test.mjs` exits 0 on `main` (B1's gate; 94 §1 "15 (tests); nothing else"). Migrations 100–102 are on prod (103 too, if R1 used it), and the canonical `.env.local` holds `BB2DASH_TEST_DB_URL`. T-26 also needs R1's R-54 series trigger on prod and T-01's harness.
* **Runs concurrently with:** R4 (disjoint files, named hunks, §2), R2, R5 and R6.
* **Machine:** laptop for the following: T-24 (the desktop shell's unpacked build and its log); T-26 (the production sitting, with a headed `login.mjs` sign-in); T-27 (his Google account); every harness run; W-44's runner checks; the prod SQL (T-10's applies, the type regeneration and the advisors). Cloud-capable: W-45, W-46 and W-47's code with vitest, eslint and typecheck; T-20's checks against the preview; T-29's docs.
* **Pre-flight:** 105 §3 has two notes. Acceptance step 2's "two submission files" should name only Role_of_Systems_Analyst.docx for IST.352, and T-29's count of 13 holds only under all defaults. All 21 B-rows came back default, so strike PROVISIONAL. Reconcile two wording gaps with the DECISIONS rows: B-27 states the "5 points every class" rule beside the marker, and B-21 names the control "Apply answers now". Ask B-7's "anything else?" once, before the Contract freeze and T-03. Cut worktree `bb2dash-wt-17` on `feat/web-polish-17`, with `-db` (W-44), `-course` (W-45), `-home` (W-46) and `-shell` (W-47). In `bb2dash-wt-17-db`, copy `.env.local`, run `npm --prefix scripts ci` and pass `--ping`. Brief 97 is silent on this; it applies B2's L3 steps, per the extracts. `login.mjs`: once W-47 has landed T-01 and the preview exists, a headed sign-in saves `web/e2e/.auth/state.json`. The session is host-only, so every new host needs a new sign-in.
* **Stack acts:**
  1. Paste B1 (~2).
  2. B-7's "anything else?" (default: nothing) (~5).
  3. T-27 = step 11: read the consent screen's publishing status. If it says Testing, publish it and rerun `scripts/google-consent.mjs` (laptop + Google, ~20). This can happen any time and is not gated on the phase. The bound is the token expiry above. Do it before T-26 if T-26 falls after that instant.
  4. T-01: sign in on the headed window at the preview's `/login` (~3).
  5. T-24 = step 10, the desktop sitting: name the toasts he has seen, click one banner and one Action Center entry, then press Sync but do not run it until PR-A merges (desktop shell, ~15).
  6. T-26 = steps 8–9, the production sitting with the PM: the planner recurrence walk and the staging walk (laptop, ~75).
  7. Steps 1–7 and 12 on the preview (~30).
  8. Read the PR and `97w_PHASE17_WALK.md`, then say merge (~10).
* **Stop points:** the B-7 question, T-24, T-26, T-01's sign-in, the preview walk after the PM's T-28 walk, and "ready when you say so".
* **Merge:** one PR, on his word. Phase 22's test-only tasks 1–2 may ride it as its last commits after the workers merge (brief 103's B-6 exception; its DECISIONS row is written with it).
* **Post-merge:** remove the five worktrees and branches. Types were regenerated from prod in the PR, and whichever of R3/R4 merges second regenerates again once both phases' migrations are applied. `web/e2e/.auth/state.json` is deleted (T-28), and `git log --all -- web/e2e/.auth` prints nothing. Update memory. **Gate out:** together with R4, R3 opens R7. R9 inherits the walk harness, `usePopover`, the favicon and, if tasks 1–2 rode here, the token-audit ratchet.
* **Fallback:** With no credential, 117 is not written and the checks become pastes. If the consent screen is still in Testing, publish it and rerun `google-consent.mjs` before the bound. If the Action Center click logs no navigation, T-25 changes `notify.ts` (B-57). Migrations past 119 take the next free block of ten (94 §2 rule 6). If Stack voices a B alternative at the walk, that row's change applies, and each such change moves T-29's count by one. If the preview answers 401, use `vercel curl`.

### R4 — B2: Phase 18, ingest and corpus (brief 98, size L)

* **Prompt:** ORCHESTRATOR §6, Session B, heading `B2 — Phase 18`.
* **Gate in:** R1 merged and `node scripts/db-test.mjs` exits 0 on `main` (L2), with `BB2DASH_TEST_DB_URL` in the canonical `.env.local`. Task 16, the sync gate, has three more conditions: tasks 2–5 and 15 are merged into `feat/ingest-corpus-18`; the installed `~/.claude/skills/bb-sync/SKILL.md` matches the branch (`git diff --no-index --ignore-cr-at-eol --quiet` exits 0); and R6's PR-A has merged, which lifts the /bb-sync hold. L7 needs task 18 merged into the phase branch.
* **Runs concurrently with:** R3, R2, R5 and R6.
* **Machine:** laptop, for the runner, the live `embed-corpus` and `search` calls, Stack's Blackboard+Duo login in the laptop's Playwright tab, the installed skill, `robocopy` into the main checkout, `antiword` and the walk harness. Cloud-capable in principle: W-51's tasks 23–25, W-50's task 5 and the unit-test halves of W-49's tasks. Their closing checks still need the laptop.
* **Pre-flight:** 105 §3 has five notes. Fix or strike each: the §Seams wording against brief 97; `eval_search.mjs --out`, which the Contract does not define; the robocopy check when `course context/` is missing (record `mirror_files=0` and `mirror_copy=skipped`); the full path of the ingest research file; migration 120 also setting `classified_by` and a confidence on `bb_files` 151. Every B-row came back default. At L1, strike PROVISIONAL, rewrite §Stack's calls and record task 27's already-green greps (3, 3, 0). L3 is `bb2dash-wt-18` plus `-db` (W-48), `-ingest` (W-49), `-crawler` (W-50) and `-web` (W-51); in each, copy `.env.local`, run `npm --prefix scripts ci` and get `--ping` to print `connected as db_test_runner`. Take task 8's before medians before 121 is applied. Apply 127 early, because task 14 re-reads the iCal count a fixed 48 h after it (brief 98 task 14).
* **Stack acts:**
  1. Optional: read the eight open items and say if a default should change (~10).
  2. Optional, independent of the phase and not a /bb-sync run: hand-pull files 161–163 in his logged-in tab. One of them is the ECN.304 Exam 1 study guide, so this is worth doing before that exam (laptop + Blackboard+Duo, ~15, DECISIONS B-37 row).
  3. Task 16 = steps 0–1, the sync gate: file the request with the web Sync button, then run `claude "/bb-sync <id>"` in `wt -d C:/Users/estac/projects/bb2dash-wt-18` (never the desktop Sync button), and stay for the probe sitting (laptop + Blackboard+Duo, ~30).
  4. Answer, or delegate, the Inbox questions for files that fit more than one class session, about 16 of them (browser, ~15).
  5. L7, the second sync, the same way (laptop + Blackboard+Duo, ~15). It is skipped on B-36's fallback.
  6. Steps 2–8 on the preview (~25).
  7. The merge word (~2).
  8. Only if task 21 finds parts over 512 tokens: decide the follow-up (~5).
* **Stop points:** task 16's gate, L7, the open PR for the acceptance walk, and the merge plus the `search` redeploy.
* **Merge:** one PR, on his word, no exception. The PM then redeploys the `search` edge function.
* **Post-merge:** the `search` source matches `main`, ignoring CRs. The installed `bb-sync` SKILL.md carries step 4b; if the PR does not merge, restore `main`'s copy. After each sync, the mirrored files were copied into the main checkout's `course context/` with `robocopy /E` (never `/MIR` or `/PURGE`). The second of R3/R4 to merge regenerates `database.types.ts`. The desktop Sync route is proven only after the merge. Remove the worktrees and branches and update memory. **Gate out:** together with R3, R4 opens R7, and it is one of R5's three merges for W-55/W-56. R3's T-26 reads whether `web/src/lib/blackboard-link.ts` is on `origin/main`.
* **Fallback:** If the probe shows no creator id (B-36), W-51 drops the author segment and L7 is skipped. If there is no meeting data (R-73), 129 is not written and a DECISIONS row records why. If parts come out over 512 tokens, the task stops and the count goes to Stack (open item 4). If a before-median is at or above 50 ms, 121 also builds `part_fts`. If PR-A has not merged, task 16 and everything after it waits (§5).

### R5 — C1: Phase 14, containers (brief 100, size L, the long pole)

* **Prompt:** ORCHESTRATOR §6, Session C, heading `C1 — Phase 14`.
* **Gate in:** paste it as soon as R1 starts (the Session C heading; 94 §2 rule 4). Nothing else gates task 1 or Task 0. The internal gates are these: open items 1–6 answered before task 1's freeze; `emstacho-su/bb2dash-stack` exists before W-58 is cut; `desktop/src/core/sync-id.ts` committed and task 2's parity set frozen before any worker branch; the spike's `Verdict: PASS` in 82b before any sync-side task; W-55 and W-56 cut only with R1, R4 and R7 merged; task 7 needs 100, 135, 136 and 137 on prod and 0 PUBLIC-executable SECURITY DEFINER functions; any /bb-sync (task 28's skill path, A9) needs R6's PR-A and obeys §2's installed-copy holds; the first realm write (task 22, A6) needs R6's gitleaks scan (its task 20), the harness realm nights and the R-B4 PAT test; the launcher PR merged before A1.
* **Runs concurrently with:** every run except R8, which follows it. W-57 and W-58 may be cut after task 1.
* **Machine:** laptop only: Docker Desktop/WSL2, Blackboard+Duo, the desktop shell, Task Scheduler (A8), the Supabase dashboard and local files. Cloud-capable: tasks 1, 5, 9, 10, 12, 16, 20, 23 and 30, plus parts of 11, 18 and 25. W-55 and W-56 each mix cloud and laptop checks, so the phase stays on the laptop.
* **Pre-flight:** 105 §3 has three notes. They cover B-48's "Dropped" branch and the `dev` verb, B-49 "No" and the DoD's harness test count, and the sibling defaults the brief rests on (B-37, Phase 19's B-20 terminal rule, B-29). Rewrite the B-45 row, which came back changed: 092 is built, A5 is walked, the R-87 reversal row is written and task 29 counts 9. Fix the brief's cut-over order to follow DECISIONS B-45, because as written it stalls (A5 needs a scheduled sync, but cut-over step 6 sets `sync_schedule_hour` only after A8/A9; the extracts flag it). In the acceptance sitting, right after A4, Stack confirms the hour (07:00 New York or the one Task 0's numbers point to) and the PM sets `sync_schedule_hour`; A5 is walked the next morning; cut-over step 6 records the hour and no longer sets it. Strike PROVISIONAL on the rest. DECISIONS B-50 names three realms for `vault_realm_pat` where open item 4 says two; follow DECISIONS. Put open items 1–6 to Stack and wait. Branches and worktrees: `feat/containers-14` in `bb2dash-wt-containers-14`; `feat/containers` in `C:/Users/estac/agentic-harness-wt-containers`, cut from the harness SHA task 1 records; `feat/containers-14-stack` in `C:/Users/estac/projects/bb2dash-stack-wt-containers`; workers W-55 (`-sync`), W-56 (`-images`, `-launcher`), W-57 and W-58.
* **Stack acts:**
  1. Open items 1–6, and whether he answered Yes to "Stay signed in?" (~15).
  2. Task 0 idle probes at +1/+2/+3/+4 h with the Blackboard tab open. These need nothing built, so they can start now (laptop + Blackboard+Duo + phone, ~15).
  3. Task 0 reopen probes: the same profile at +1/+3/+7/+14 days, inside the 14-day Duo window counted from the start (~20).
  4. Create `emstacho-su/bb2dash-stack` with one README commit (GitHub web, ~5).
  5. The spike (task 4): the Duo login inside noVNC. Stay for `docker compose restart sync`, then leave the laptop on while `session-age.mjs` logs through a night (~20).
  6. Open item 4's machine steps: the `.wslconfig` memory value, `claude setup-token` into `claude_oauth_token`, and Docker Desktop AutoStart (~12).
  7. `vault_realm_pat`, fine-grained and with an expiry (GitHub web, ~10).
  8. Task 7: set the `sync_runner` password in the SQL editor, then `--ping` should print `connected as sync_runner` (dashboard + laptop, ~10).
  9. Task 17: the MCP key move (~15).
  10. Task 19: remove the stale `bb-course-*` copies (~5).
  11. Task 18: the merge word on the launcher PR (~5).
  12. Task 28: the live proofs (laptop + Blackboard+Duo + desktop shell + phone, ~45).
  13. Look at `walks/walk-14/` (~10).
  14. Acceptance: A1–A4 (~75).
  15. Right after A4, in the same sitting: confirm the scheduled hour, 07:00 New York or the one Task 0's numbers point to (B-45). The PM then sets `sync_schedule_hour` (~5).
  16. A5 the next morning, once that scheduled sync has run by itself, then A6–A7 (~40). Then A8, where he types the two unregister commands himself, and A9, which proves the Windows /bb-sync still works with Docker stopped (~25).
  17. Read the freeze rows and the R-87 reversal row, then give the merge word on each PR (~15).
* **Stop points:** open items 1–6; the repo creation; the spike login; the machine steps; task 7's password; tasks 17 and 19; the launcher PR; task 28; walk-14 before any merge; A1–A4; the scheduled-hour confirmation after A4 (B-45), before `sync_schedule_hour` is set; A5–A9 across at least one night.
* **Merge:** the B-51 exception, one PR per repo (bb2dash, agentic-harness, bb2dash-stack) plus the early `syncLauncher` PR (`feat/containers-14-launcher`). The launcher PR merges on his word before A1. The three repo PRs merge after walk-14 and A1–A9, each on his word. Nothing is in `web/`, so there is no preview.
* **Post-merge:** remove the worktrees in all three repos. The PR corrects CLAUDE.md's "There is no Docker during development" and adds 82's superseded-by line. The two AgenticHarness Task Scheduler jobs were unregistered at A8. `sync_schedule_hour` was set in the acceptance sitting right after A4, on the hour Stack confirmed (B-45), and the cut-over's DECISIONS row records it. Update memory. **Gate out:** R8 (C2) opens, R5 counts as one of R9's gates, and R6's container-writer line is proven at A6.
* **Fallback:** If the spike fails, see §5. If Chromium fails under the seccomp profile, set `chromiumSandbox: false` and name it in 82b and in `/security-review`. If the B-50 bind-mount test fails, clone the realms into a volume instead. If `log_connections` is refused, the runner's own connect log line stands. If Task 0 never ran, `KEEPALIVE_MINUTES` stays 0 and the spike still gates. A gitleaks hit means Stack rotates the credential before any work continues. The Windows path keeps working until acceptance, and A9 proves it with Docker stopped.

### R6 — D: Phase 20, harness closure (brief 101, size M; may start first of all)

* **Prompt:** ORCHESTRATOR §6, heading `Session D — Phase 20` (the prompt under it; it starts in `C:/Users/estac/agentic-harness`).
* **Gate in:** none. It runs beside everything, and R-97 is a live bug (94 §2). PR-A goes first, together with C-H. The internal gates are these: task 20 needs gitleaks installed and the realm checkouts; task 2 needs PR-A merged; tasks 17–19 and 21–26 need PR-B merged, `C:/Users/estac/agentic-harness` pulled `--ff-only` to merged main, and three consecutive nightly runs each logging `committed -> pulled -> pushed` (or up-to-date) for both realms, which is the PM's reading of the live-lane prerequisite; task 22 needs three more such nights after L20-a; task 26 needs a bb2dash PM session that starts after task 17; task 29 needs PR-C merged.
* **Runs concurrently with:** all runs.
* **Machine:** laptop, for the real vault, transcripts and hooks, the nightly log, Credential Manager and the harness-memory SQL. `uv run ingest` runs from the main checkout, the only one with a `.env`. Acceptance step 7 must run in a claude.ai/code cloud session. Cloud-capable in principle: worker tasks 4–15, task 1's skill edit and task 28's docs.
* **Pre-flight:** 105 §3 has eight notes. Fix or strike each: run task 3's eval and task 18 from the main checkout; `pull --ff-only` the main checkout after PR-B and paste the SHA into 101a; take C-18's report and its SQL back to back; label the rolling three-night rule as the PM's reading; make the B-53 seam row "Phases 15–19, 21, 22"; task 23's two result lists; define "the narrowed Temp exclusion"; "three consecutive nightly runs after L20-a" in place of "apply nights". B-52..B-56 all came back default, so strike PROVISIONAL. From the extracts: scan all three realms (projects, classes, harness), as DECISIONS B-55 says, although task 20 names two. Expect C-2's copy branch, because inbox-541..544 already sit in the OneDrive stub. Worktrees: `bb2dash-wt-inbox-vault-20` on `fix/inbox-apply-vault-20` (PR-A); `C:/Users/estac/agentic-harness-wt-v2-closure` on `feat/v2-closure` (PR-B), with W-59..W-62 in `-v2-phase`, `-v2-cap`, `-v2-config` and `-v2-docs`; `bb2dash-wt-harness-closure-20` on `docs/harness-closure-20` (PR-C, cut from `main`).
* **Stack acts:**
  1. Hold Apply answers and `/bb-sync` until PR-A merges (0).
  2. Install gitleaks on home-pc, before task 20. It is the same install as Phase 14's P-46 (~10).
  3. Only on a gitleaks hit: rotate that credential before any work continues (~20).
  4. The merge word on PR-A (~10).
  5. Step 1 (task 2): press Apply answers in the Inbox, or run the next sync, and read `vault=… realm=projects ok` (desktop shell, ~10). If R4 or R7 holds the installed `bb-sync` copy (§2), use Apply answers, or run the sync from the holder's worktree with its copy, never from the main checkout or the desktop Sync button.
  6. Step 2, after the next nightly push: `git -C C:/Users/estac/vault/projects log -1 --stat` (~3).
  7. The merge word on PR-B (~10).
  8. Step 3 (L20-a): run `! node C:/Users/estac/agentic-harness/hooks/install.mjs` himself (~5).
  9. Step 4 (L20-b): read `backfill-dry-run.txt` and say "go L20-b" (~30).
  10. Step 5: the credential test (~10).
  11. Step 6: the resume chain (~10).
  12. Step 7: `/checkpoint` from a claude.ai/code session (phone or browser, ~10).
  13. Step 8: `/bb2dash-pm` shows the untagged list first (~5).
  14. Step 9: read 101a and say whether V-2 is closed (~20).
  15. The merge word on PR-C (~5).
* **Stop points:** every step above. Live steps never run while the nightly job runs, and each one runs on his "go".
* **Merge:** three PRs, the exception with its own DECISIONS row. PR-A merges first because it lifts the hold, then PR-B, then PR-C last, each on his word.
* **Post-merge:** After PR-A: the PM writes the merged blob over `C:/Users/estac/.claude/skills/inbox-apply/SKILL.md` and copies inbox-541..544 into the realm, and the hold lifts. After PR-B: `git -C C:/Users/estac/agentic-harness pull --ff-only`, the SHA goes into 101a, and R5's `feat/containers` merges `main`. After PR-C: task 29 refreshes the installed `/inbox-apply` (`cmp` returns 0). Remove the worktrees and branches in both repos and update memory. **Gate out:** the hold lifts for R2, R3, R4, R5 and R7. The H-1 phase spelling applies to every later session, and hook_tags reach R8's store.
* **Fallback:** An `/inbox-apply` run before PR-A merges: copy its notes into the realm and never delete from the stub. Nights that are not clean: the live tasks simply wait, and the laptop must be awake and online for the nightly run. A stale main checkout: C-17 catches it, printing fewer than six `same`. A gitleaks hit stops the phase. Rotate first; rewriting realm history is Stack's call. Task 26 waits for the next bb2dash PM session that starts after task 17. That may be R8's or R9's if R1–R5 and R7 have all started (105 §3).

### R7 — B3: Phase 19, content identity, per-crawl history, sync honesty (brief 99, size L)

* **Prompt:** ORCHESTRATOR §6, Session B, heading `B3 — Phase 19`.
* **Gate in:** R3 and R4 merged to `main` (94 §2 rule 3; brief 99 header). R1's runner is on `main`, and `phase9_transform_states.sql` and `phase10a_stage_gradebook.sql` pass before and after. Right before 130 and right before 135, `select count(*) from agent_requests where kind = 'sync' and state in ('queued','claimed')` returns 0. Task 27 needs R6's PR-A merged and the phase preview up.
* **Runs concurrently with:** R2, R5 and R6 (and R8, if R5 merges first).
* **Machine:** laptop, for W-52's and W-53's migrations and runner checks, the PM's type regeneration, md5 checks and advisors, and task 27 plus steps 4–5, which need Blackboard+Duo and the desktop shell. Cloud-capable: W-54 (tasks 19–24), W-53's text tasks 17–18 and task 29's docs.
* **Pre-flight:** 105 §3 has one note, c9: mark task 4's count of 2 and acceptance step 1 as resting on Phase 18's B-34, and the 127 seam as resting on B-32. B-18, B-39 and B-42 came back default, so strike PROVISIONAL. Put B-19's ghost merge and B-20's terminal rule to Stack for an explicit yes: the header says every B-number is default, but neither PM pick is adopted by its row. Re-measure S₀, D₀ and N₀, and whether files 17 and 19 are current, on prod. The extracts raise two points to settle. Which checkout does task 27's `/bb-sync` run from? The register-first skill lives only on the branch until merge, and `/bb-sync` loads the installed copy, as in R4. And a desktop build from the phase branch is needed for step 5's toast. Cut worktree `bb2dash-wt-content-history-19` on `feat/content-history-19`, with `-content` (W-52), `-driver` (W-53) and `-screens` (W-54), and put `.env.local` in the db worktrees.
* **Stack acts:**
  1. B-19 ghost merge and B-20 terminal rule: yes or no (~15).
  2. No Sync and no `/bb-sync` while 130→131 and then 135→136 go on (0).
  3. Task 27 = step 4, the first register-first sync (laptop + Blackboard+Duo + desktop shell, ~15).
  4. Steps 1–3 on the preview (~10).
  5. Step 5: press Sync and close the Blackboard tab at the first course line. Within 32 minutes Home should read "last sync interrupted", with one Inbox item and the toast (~40).
  6. Step 6: read the nine DECISIONS rows (phone, ~15).
  7. The visual OK and the merge word (~5).
* **Stop points:** the session start (B-19, B-20), both migration windows, task 27, the preview walk, step 5, the rows, and "ready when you say so".
* **Merge:** one PR, on his word, no exception.
* **Post-merge:** types were regenerated from prod (task 25), and the installed `bb-sync` copy should equal `main`'s register-first skill. Remove the worktrees and branches and update memory. **Gate out:** together with R1, R4 and the spike PASS, R7 lets R5 cut W-55 and W-56. R7 is one of R9's gates. R-41 counts as met only with R3's half also on `main`.
* **Fallback:** B-19 answered no: a partial unique index, and the toggle shows 21. B-20 answered otherwise: one constant in 136 changes, and Phase 14's DEAD_LETTER_MINUTES stays below it. A sync in flight at a migration window: wait until the count reads 0. Step 5's window is only seconds (a whole crawl took about 26 s): repeat it once the first sync closes, one open sync at a time. Avoid syncs from `main`'s old skill between 135/136 reaching prod and the merge.

### R8 — C2: Phase 21, workspace (brief 102, size L)

* **Prompt:** ORCHESTRATOR §6, Session C, heading `C2 — Phase 21`.
* **Gate in:** R5 merged in bb2dash and bb2dash-stack. Task 1 (d) checks it: `git ls-files compose.yaml mcp-server/Dockerfile mcp-server/src/env-file.ts | wc -l` returns 3 in bb2dash, and the five secrets/doctor/justfile files return 5 in bb2dash-stack. R1 merged: `select count(*) from pg_roles where rolname in ('sync_runner','db_test_runner')` returns 2 and `--ping` passes. Stack's `claude setup-token` is in `bb2dash-stack/secrets/claude_oauth_token`, Phase 14's B-51 row is written, and the harness `rag` MCP server builds and answers `search_context`. Stack's acceptance (task 26) comes only after R5's acceptance.
* **Runs concurrently with:** R2 (if still sitting), R6 and R7.
* **Machine:** laptop-led, for the runner DSN, Docker and the stack secrets, the host `claude` on his subscription for task 9's recordings, and the desktop shell. Cloud-capable: W-64's tasks 7, 8, 10 and 11; W-66's tasks 4, 15 and 16; tasks 23–25.
* **Pre-flight:** 105 §3 has three notes: task 9's pass form under O-2's default, Stack writing `secrets/workspace_runner_db_url` before task 12, and the phase21_141 unit's realtime-partition precondition. B-5, B-42, B-48 and B-51 came back default, so strike PROVISIONAL. Re-read the paused `claude -p` metering plan (B-5 row); if the risk is not accepted, the phase stops at task 1. Settle one conflict at the start: DECISIONS (the B-51 and plan-approval rows) open the bb2dash-stack PR second, after the bb2dash PR merges, while the brief's default opens both. Put O-1..O-5 to Stack. Cut worktree `bb2dash-wt-21` on `feat/workspace-21`, with `-db` (W-63), `-runner` (W-64), `-container` (W-65, plus a bb2dash-stack worktree on `feat/workspace-21`) and `-web` (W-66).
* **Stack acts:**
  1. O-1..O-5 in one message (~15).
  2. Task 5: log in to the phase preview so the PM can run the Realtime spike (~5).
  3. Task 19: paste the one `workspace_runner` password line in the SQL editor, never in a file, and write the matching DSN into `bb2dash-stack/secrets/workspace_runner_db_url` (dashboard + laptop, ~10).
  4. Only if task 9's budget fixture shows no stop: O-2 again (~5).
  5. The acceptance walk, steps 1–11 (laptop + desktop shell, Docker running, ~40).
  6. The merge words, bb2dash PR first (~5).
* **Stop points:** O-1..O-5; task 5; task 19's password line; the conditional O-2; the acceptance walk after R5's acceptance; the merge words.
* **Merge:** one PR per repo, under B-51's exception, whose row Phase 14 writes at its freeze (task 24 records this phase's). The bb2dash PR merges on his word, then the bb2dash-stack PR merges after it.
* **Post-merge:** `database.types.ts` is regenerated with this phase's objects only, and the phase15_100 membership list now includes `workspace_runner`. Remove the worktrees in both repos and update memory. **Gate out:** R8 is R9's last gate (the Workspace page and its nav link).
* **Fallback:** If the Realtime spike fails, the transport becomes polling only, with its DECISIONS row. If the 141 unit finds no partition, open the preview's `/workspace` once and rerun. If the $1 cap does not stop a subscription turn, keep the flag, set `BUDGET_CAP_HOLDS` false and add the no-cap sentence. If a sync runs during a walk, repeat that walk. If the metering risk is not accepted, stop at task 1.

### R9 — E: Phase 22, styling (brief 103, size L, last)

* **Prompt:** ORCHESTRATOR §6, heading `Session E — Phase 22`.
* **Gate in:** R2, R3, R4, R7, R5 and R8 merged (brief 103 header; 94 §2 rule 5). Task 4 checks it: `grep -rl "ScreenStub" web/src/app | wc -l` returns 0, `find web/src/app -name page.tsx | wc -l` returns 16, and `web/src/app/(app)/workspace/page.tsx` is on `main`. Tasks 1–2 are either on `main` (they rode R3's PR) or become this branch's first commits.
* **Runs concurrently with:** none of the runs it depends on. R6 may still be open beside it.
* **Machine:** laptop-hosted: `login.mjs` against each preview, the Playwright walks, the no-writes SQL, DevTools at 390 px and the unpacked desktop build. Cloud-capable in principle: tasks 1–4, 8–12 and 16–20, and the tiles (task 6). Stack's tile pick works in any browser signed into claude.ai, phone included.
* **Pre-flight:** 105 §3 has two notes: every count that moves under B-24's "wrap", and "the no-writes SQL of tasks 21 and 22". B-6, B-23 and B-24 came back default, so strike PROVISIONAL. Put open items 1–5 to Stack. Cut worktree `bb2dash-wt-22` on `feat/styling-22`, with `-foundation` (W-67), `-shell` (W-68), `-screens-a` (W-69) and `-screens-b` (W-70). Run `login.mjs` before each preview's first harness run; the cookie-domain check must print true for that host. Before step 6, decide which app URL the unpacked build loads (production unless `BB2DASH_APP_URL` is set), a reader note in the extracts.
* **Stack acts:**
  1. Open items 1–5 (~15).
  2. Only when needed: sign in on `login.mjs`'s window for each preview (~8).
  3. Task 7: open the three tiles, flip Auto/Light/Dark and pick one, outside the Nov 30 – Dec 13 freeze (B-6) (phone or laptop, ~20).
  4. Only when needed: decline any CRITICAL or HIGH finding the PM does not fix (~10).
  5. Steps 1–2: the theme control (~10).
  6. Step 3 (task 25): the 58 surface lines in light and dark, outside the Nov 30 – Dec 13 freeze (B-6) (~75).
  7. Steps 4–5: 390 px and the Menu by keyboard (~15).
  8. Step 6: the desktop build with Windows in light mode (desktop shell, ~10).
  9. Step 7: yes, or the surface to redo, and the merge word (~5).
* **Stop points:** open items 1–5; the tile pick, which gates task 8 and the sweeps; any declined finding; the open PR with its preview and `WALK.md`.
* **Merge:** one PR, on his word. Its one exception is tasks 1–2 riding R3's PR (B-6).
* **Post-merge:** `web/e2e/.auth/state.json` is deleted in all five worktrees (task 24). Remove the worktrees and branches and update memory. **Gate out:** nothing further in sprint 2 (94 §3 has no row from 22).
* **Fallback:** If B-6, B-23 or B-24 is overturned, the brief's fallback rows apply. If a task needs a migration, it stops and takes the next free block of ten. If the cookie-domain check prints false, sign in again. If the preview answers 401, use `vercel curl`. If Stack names a surface to redo, its sweep owner reworks it, and the line is re-shot and re-ticked.

## 2. Concurrency

**Default: two PM sessions working at once**, the arrangement ORCHESTRATOR §3 records as working. A session parked at a stop point does not count. Parked means waiting for Stack, a sitting or the nightly runs, with no worker running, and it resumes when its gate opens. A worker dies with its PM session (ORCHESTRATOR §3), so a session parks only after its workers are done. Stack is the shared resource: every run's stop points need him. More sessions let more work wait at his door at once; they do not make a sitting shorter.

| Lane | Two sessions (default) | Three sessions |
|---|---|---|
| 1, bb2dash product | R1 → R2's tasks 1–15, then R2 parked between sittings → R3 + R4 (Session B, both phases) → R7 → R9, with R2 resumed for each sitting's spot-check and after sitting 6 | R1 → R3 + R4 → R7 → R9 |
| 2, infrastructure | R6's PR-A → R5 (task 1, Task 0 rows, W-57/W-58, the spike) → R6's PR-B → R5's W-55/W-56 once R1, R4 and R7 are on `main` → R8; R6's live steps resume whenever the nights allow | R6 → R5 → R8, with C1 pasted beside A1 as §6 Session C says, not when R6 parks |
| 3, V-1 | (in lane 1) | R2 from R1's open PR to its merge, so the sittings never wait behind another run's stop |

Which runs are safe together:

| Runs | Together? | Why |
|---|---|---|
| R2, R3, R4 | yes | 94 §2 rule 2: disjoint files; the named exceptions are below |
| R5 with R1–R4, R6, R7 | yes | brief 100's files are `docker/`, `sync/`, the stack repo and harness `feat/containers`; W-55/W-56 wait for R1, R4 and R7 |
| R6 with any run | yes | harness repo plus PR-A/PR-C; shares `skills/inbox-apply/SKILL.md` with R2 |
| R7 after R3 and R4 | serial | 94 §2 rule 3: R7 re-creates `stage_content` on 17's views and 18's `stage_files` |
| R8 after R5 | serial | 94 §2 rule 5: R8 reuses 14's container, token and MCP image |
| R9 after R2, R3, R4, R7, R5, R8 | serial | every screen must exist (94 §3) |
| R2's task 10 after R1's 100–104 | serial | 105 goes on only when 100–104 are on prod and 10a is on 15's branch |
| R7's migration windows vs any sync | serial | 0 syncs queued or claimed right before 130 and right before 135 |

Shared-file and shared-state rules:

* **`CourseScreen.tsx` (R3/R4):** named hunks only. The second to merge merges `main` in and reruns `cd web && npx eslint . --max-warnings 0`. `DATA_SYNTAX.md` gets entries from both, in separate sections. W-47's Bell and announcements files are shared if R4 takes B-36's fallback. Where briefs 97 and 98 disagree on `AssignmentDetailBody.tsx` and `PlannerItemPopover.tsx`, 98's wider named-hunk rule holds. Both briefs' §Seams say the second to merge "rebases". Read that as merging `main` in, since a pushed branch is never rebased or force-pushed (ORCHESTRATOR §0), and fix the wording in the phase PR.
* **`skills/inbox-apply/SKILL.md` (R2/R6):** whichever lands second merges `main` in and re-applies its lines, never with a rebase (brief 96 §Seams, brief 101 §Seams). After each merge, the installed copy is refreshed until `cmp` returns 0. The note after ORCHESTRATOR §6 Session D still says "rebases"; the briefs govern.
* **`web/src/lib/supabase/database.types.ts`:** each run regenerates it for its own PR, scoped to its own objects, and the second to merge regenerates it again (ORCHESTRATOR §3).
* **`db/tests/phase10b_grade_model.sql`:** R1's W-39 rewrites it first (P-2), then R2's W-42 edits lines 167–168 (10a), and that commit is carried onto R1's branch.
* **`db/tests/phase15_100_db_test_runner_role.sql`:** its membership list is extended by R5's 094 and R8's 142, each in its own PR.
* **Token-audit baselines:** once tasks 1–2 land with R3, every later integration commit (R2, R4, R7, R8) keeps the four baseline JSONs current. The allowlist never moves (brief 103 §Seams).
* **Installed skill copies** (`~/.claude/skills/bb-sync`, `inbox-apply`) are machine state that every run's syncs read, whichever run starts them. Only one run at a time holds a branch copy installed, and each hold is a gate for every other run's syncs:
  * **R4 holds** its v5 `bb-sync` copy from task 16 until R4 merges. In that window every other run's sync (R2's Exam 1 sync, R6 step 5, R5's task 28 and A9) waits, or runs from `bb2dash-wt-18` with R4's copy. None runs from the main checkout or the desktop Sync button, which would run step 4b against `main`'s v4 scripts (brief 98).
  * **R7 holds** its register-first copy from the moment 136 is on prod, through task 27 and step 5, until R7 merges. In that window every sync uses R7's copy, from the checkout R7's pre-flight settles, and none runs from `main`'s old skill, which would close the request and raise no Inbox item.
  * R7's gate needs R4 merged, so the two holds never overlap. After a holder merges, the installed copy equals `main`'s. A holder restores `main`'s copy only if its PR is abandoned.
* **Syncs:** one open sync at a time (brief 99 step 5). R4's gate-sync Duo login and R5's Task 0 reopen probes use the same Blackboard session, so coordinate them so a fresh login does not skew a probe row. This is the extracts' PM reading, not a brief rule.
* **Harness repo:** R5's `feat/containers` merges `main` after R6's PR-B.

## 3. Merge order and re-cut rules

If every PR were ready at once, they would merge in this order:

1. **R6 PR-A**: skill markdown only, and it lifts the hold that every sync waits on.
2. **R1**: every later SQL check runs through its runner. It merges after R2's task 10a commit is on its branch.
3. **R2**: its 105 is already on prod. Merging it brings `grading_invariants.sql` into every later suite.
4. **R3**: it carries 22's tasks 1–2 and the ratchet that later integration commits keep current.
5. **R4**: the second of the 17/18 pair. It merges `main` in, runs eslint and regenerates types, then the `search` redeploy follows.
6. **R7**: after R3 and R4.
7. **R6 PR-B**, then **R5**'s launcher PR (before A1) and its three repo PRs (harness `feat/containers` after PR-B), then **R6 PR-C**.
8. **R8**: the bb2dash PR, then the bb2dash-stack PR.
9. **R9**, last.

When an earlier PR merges under a later branch:

1. `git fetch --prune`. In the phase worktree run `git merge origin/main` and push, then merge the phase branch into each live worker branch the same way. Never rebase a pushed branch and never force-push (ORCHESTRATOR §0; briefs 96, 101 and 103 §Workers/§Seams).
2. Resolve shared files by their rule in §2.
3. Regenerate `database.types.ts` if the merged PR changed an RPC signature or a view the web reads.
4. Rerun the full suite: `node scripts/db-test.mjs` (the unit count grows with each merge, so re-read it rather than assert the old one), `web/` typecheck, build, vitest and eslint `--max-warnings 0` (after R3), and the `mcp-server/` build. Re-record in the PR any baseline the brief compares against, such as brief 96's vitest count at the cut.
5. Check that prod's apply order still matches name order for the phase's own migrations (brief 96 task 10's count; brief 99's 133/134 before 135).

| Merges | Under | The later run then |
|---|---|---|
| R1 | R2 | moves its runner checks from 15's branch to `main`; task 10's count reads `origin/main`; if 10a was not carried over, asks Stack before task 10 |
| R6 PR-A | R2 | merges `main` in, re-applies its Step 3/4 lines, and refreshes the installed copy after its own merge |
| R3 or R4 | the other | merges `main` in, resolves the `CourseScreen.tsx` hunks, runs eslint, regenerates types once both phases' migrations are on prod |
| R3 | R2, R4, R7, R8 | keeps the four token-audit baseline JSONs current in its integration commit |
| R2 | R3, R4, R7 | runs `grading_invariants.sql` and the phase16 tests in its full suite |
| R4 | R3 | T-26 re-reads whether `blackboard-link.ts` is on `origin/main` to pick the staged link's href |
| R6 PR-B | R5 | harness `feat/containers` merges `main` |
| R7 | R5 | cuts W-55 and W-56 (with R1, R4 and the spike PASS); `sync_register_run` adopts register-first |
| R5 | R8 | C2 is pasted; 142 extends phase15_100's membership list |

## 4. Stack's touchpoints, consolidated

In order within each run. "Needs" says what the step needs besides Stack himself. Minutes are rough sizes.

| Run | Touchpoint | Needs | ~min |
|---|---|---|---|
| R1 | Paste A1, read the freeze note | laptop | 5 |
| R1 | Step 1 / task 5: runner password, `.env.local` | laptop + Supabase dashboard | 10 |
| R1 | Steps 2–4: `--ping`, full run, fixture | laptop | 10 |
| R1 | Step 5: advisors | Supabase dashboard | 5 |
| R1 | Step 6 / task 20: signups setting screenshot | Supabase dashboard | 5 |
| R1 | Step 7: six DECISIONS rows, merge word | laptop | 15 |
| R2 | Paste A2 once R1's PR is open | laptop | 2 |
| R2 | B-9 dates as Inbox value resolutions, each before the day it names | laptop | 9 |
| R2 | Only if R1 merged without 10a: how to proceed | laptop | 2 |
| R2 | First launch (step 2, task 16) | laptop | 15 |
| R2 | Sitting 1, IST.323 | laptop | 75 |
| R2 | Sittings 2–6: IST.466, IST.352, ECN.304, GEO.103, IST.471 | laptop | 315 |
| R2 | Sync after ECN.304 Exam 1 posts (after PR-A; under §2's installed-copy holds) | Blackboard+Duo | 10 |
| R2 | Only if sitting 6 cannot finish in time for 106 before the IST.323 bound (the freeze): approve the 106/109 split, asked as soon as that is plain | laptop | 5 |
| R2 | Acceptance steps 1, 5, 6, 7, 8, 9, 10 | laptop, Google (step 8) | 62 |
| R3 | Paste B1; B-7 "anything else?" | laptop | 7 |
| R3 | T-27: consent screen status, publish, rerun consent (bound, not pacing) | laptop + Google | 20 |
| R3 | T-01: `login.mjs` sign-in on the preview | laptop | 3 |
| R3 | T-24: desktop toasts and clicks, Sync pressed only | desktop shell | 15 |
| R3 | T-26: production sitting with the PM | laptop | 75 |
| R3 | Steps 1–7 and 12 on the preview; PR and walk file, merge word | laptop | 40 |
| R4 | Optional: the eight open items | none | 10 |
| R4 | Optional: hand-pull files 161–163 | laptop + Blackboard+Duo | 15 |
| R4 | Task 16: gate sync by hand from `bb2dash-wt-18`, probe sitting | laptop + Blackboard+Duo | 30 |
| R4 | Inbox questions for multi-session files | browser | 15 |
| R4 | L7: second sync by hand | laptop + Blackboard+Duo | 15 |
| R4 | Steps 2–8 on the preview; merge word | laptop | 27 |
| R4 | Only if parts exceed 512 tokens: the follow-up | none | 5 |
| R5 | Open items 1–6, "Stay signed in?" | none | 15 |
| R5 | Task 0 idle probes | laptop + Blackboard+Duo + phone | 15 |
| R5 | Task 0 reopen probes (+1/+3/+7/+14 days from the start) | laptop + Blackboard+Duo + phone | 20 |
| R5 | Create `bb2dash-stack`; `vault_realm_pat` | GitHub web | 15 |
| R5 | Spike Duo login in noVNC, restart, a night of logging | laptop (Docker) + Blackboard+Duo + phone | 20 |
| R5 | Machine steps: `.wslconfig`, `setup-token`, AutoStart | laptop | 12 |
| R5 | Task 7: `sync_runner` password, `--ping` | Supabase dashboard + laptop | 10 |
| R5 | Tasks 17 and 19: MCP key move, stale skill copies | laptop | 20 |
| R5 | Task 18: launcher PR merge word | none | 5 |
| R5 | Task 28: live proofs | laptop + Blackboard+Duo + desktop shell + phone | 45 |
| R5 | walk-14 review | none | 10 |
| R5 | A1–A4 | laptop + Blackboard+Duo + desktop shell + phone | 75 |
| R5 | Confirm the scheduled hour after A4, before `sync_schedule_hour` is set (B-45) | laptop | 5 |
| R5 | A5 the next morning, A6–A7; A8, A9 | laptop + Blackboard+Duo + desktop shell + phone | 65 |
| R5 | Freeze rows, R-87 reversal, three merge words | none | 15 |
| R6 | Hold Apply answers and `/bb-sync` until PR-A merges | none | 0 |
| R6 | Install gitleaks | laptop | 10 |
| R6 | Only on a gitleaks hit: rotate the credential | laptop | 20 |
| R6 | PR-A merge word; step 1 Apply answers; step 2 realm log | laptop + desktop shell | 23 |
| R6 | PR-B merge word; L20-a install; L20-b go | laptop | 45 |
| R6 | Credential test; resume chain | laptop | 20 |
| R6 | Cloud `/checkpoint`; step 8; 101a; PR-C merge word | phone or laptop | 40 |
| R7 | B-19 ghost merge and B-20 terminal rule: yes or no | none | 15 |
| R7 | No Sync during 130→131 and 135→136 | none | 0 |
| R7 | Task 27: first register-first sync | laptop + Blackboard+Duo + desktop shell | 15 |
| R7 | Steps 1–3 on the preview | laptop | 10 |
| R7 | Step 5: the interrupted sync | laptop + Blackboard+Duo + desktop shell | 40 |
| R7 | Step 6: nine DECISIONS rows; visual OK, merge word | phone | 20 |
| R8 | O-1..O-5 | none | 15 |
| R8 | Task 5: log in to the preview for the Realtime spike | laptop | 5 |
| R8 | Task 19: `workspace_runner` password line and DSN file | Supabase dashboard + laptop | 10 |
| R8 | Only if the cap does not stop: O-2 again | none | 5 |
| R8 | Acceptance walk after R5's acceptance; merge words | laptop + desktop shell | 45 |
| R9 | Open items 1–5 | none | 15 |
| R9 | Only when needed: `login.mjs` sign-ins per preview | laptop | 8 |
| R9 | Task 7: pick a style tile, outside the freeze (B-6) | phone or laptop | 20 |
| R9 | Only when needed: decline a review finding | none | 10 |
| R9 | Steps 1–5: theme control, 58 surface lines (outside the freeze, B-6), 390 px, Menu | laptop | 100 |
| R9 | Step 6: desktop build in light mode; step 7: yes, merge word | desktop shell | 15 |

Stack's total per run, as sizes and not a calendar: R1 50 · R2 495 (of it 390 in the six sittings) · R3 160 · R4 117 (87 without the optional and conditional steps) · R5 347 · R6 138 (plus 20 on a gitleaks hit) · R7 100 · R8 75 (plus 5 if O-2 comes back) · R9 168. In all, about 1,650 minutes of his time across the sprint, spread over whatever stretch the gates allow.

## 5. Fallbacks per gate

* **The spike fails (R5 task 4).** Stop the sync half and re-plan it on the `storageState` hand-off (design c) in a revised brief (brief 100 open item 5). The infrastructure half continues: tasks 20–26, and task 27 over harness-jobs and dev. W-56 is not cut, and its tasks 17–19 are re-cut in the revised brief. R8's task 1 counts files from W-56's stream (`compose.yaml`, `mcp-server/Dockerfile`, `mcp-server/src/env-file.ts`), so R8 and then R9 wait for the revised brief. Every other run continues.
* **A sitting cannot happen.** That run stays parked at its stop point and every other run continues. For R2 the V-1 sittings keep their order, and the one exposure is the IST.323 bound (106 on prod before the Nov 30 – Dec 13 freeze). As soon as the remaining sittings cannot finish with enough time left to write, review and apply 106 before that bound, the PM asks Stack to split: IST.323's rows in 106, the rest in 109 once the remaining sittings are done and never inside the freeze, with a DECISIONS row (brief 96 open item 4). Waiting for the bound itself to arrive is too late. R9 cannot start until R2 merges. For other runs' sittings (R3's T-24 and T-26, R4's and R7's syncs, R5's spike and acceptance, R8's and R9's walks, R6's live steps), the same rule holds: the run waits and nothing else does, unless §1 names it as a gate.
* **A review round.** When `/code-review main high` or `/security-review` confirms a CRITICAL or HIGH finding, the PM appends a numbered round-2 section to the brief and sends it back to the same workers, resumed while their context is warm. The PM then re-integrates and reruns the gates (ORCHESTRATOR §3 step 6). Run the review before the last workers land. A fix to an applied migration takes the phase's reserved slot (brief 95: 103/104; brief 96: 108; brief 100: 093; the others their block's slack) and never edits the applied file. A block that runs out takes the next free block of ten (94 §2 rule 6).
* **A freeze: the standing Nov 30 – Dec 13 code freeze, or any other Stack calls.** Each session stops at its next stop point and parks. PRs stay open, nothing merges and nothing is applied to prod, while branches stay pushed and worktrees stay in place. Stack's own steps that change no code on `main` may go on if he wants: the Task 0 readings, the consent screen, and the V-1 sittings, whose verdict files commit to R2's branch. R9's tile pick and per-screen ticks do not: B-6 keeps them outside the Nov 30 – Dec 13 window. The other bounds keep running. 106 must be on prod before the standing freeze begins; for a freeze Stack calls, the 106 bound is the one to raise with him before it begins. When the freeze ends, each run re-cuts by §3.
* **The R-97 hold.** Until PR-A merges, there are no Apply answers and no `/bb-sync` (ORCHESTRATOR §4). It blocks: R2's Exam 1 sync (task 27, step 9); R4's task 16 and L7, and everything after them; R5's task 28 skill path and A9; R7's task 27 and steps 4–5. R3 keeps moving. T-24 presses Sync only; T-18 presses "Apply answers now", not the held "Apply answers"; and T-27's check after the expiry takes its `gcal_dirty` change from a planner edit. If a run happens anyway, the notes land in the OneDrive stub, and the PM copies them into the realm without deleting from the stub (brief 101). The cure is to merge PR-A first; it is skill markdown only, which is why R6 may start before everything else. Once PR-A has merged, §2's installed-copy holds still gate every sync: from R4's task 16 to R4's merge, and from 136 on prod to R7's merge, R2's Exam 1 sync, R6's step 5 and R5's task 28 and A9 wait or run from the holder's worktree with its copy, never from the main checkout or the desktop Sync button.

## 6. Pre-flight and post-merge checklists (every run)

Pre-flight, before cutting workers:

- [ ] `git fetch --prune`; compare `origin/main` with the shared checkout (ORCHESTRATOR §3 step 1).
- [ ] `gh pr list --state open`: which runs have PRs open, and which merged since the last look.
- [ ] `git worktree list` and `git branch -r`: foreign worktrees and branches stay untouched (ORCHESTRATOR §0).
- [ ] STATUS's "Last update" against `git log -1 origin/main`: if `main` moved, read what landed.
- [ ] Memory (`MEMORY.md`): verify every path or flag it names still exists.
- [ ] This run's gate in (§1) checked as facts: PRs merged, runner green on `main`, spike PASS, sync count 0.
- [ ] 105 §3's notes for this brief fixed or struck in the phase PR, with a reason.
- [ ] B-table: PROVISIONAL struck where DECISIONS says default, and the row rewritten where it says changed.
- [ ] Worker ids exactly as the brief's §Workers names them (sprint-wide W-38..W-70, each owned by one brief; never reused).
- [ ] Phase worktree cut from `origin/main`, worker worktrees from the phase branch; nothing in `C:/Users/estac/projects/bb2dash`.
- [ ] `.env.local` copied into every worktree that runs the runner, `npm --prefix scripts ci` run there, and `--ping` passing.
- [ ] Installed skill copies: which run, if any, holds a branch copy (§2).

Post-merge, only on Stack's word in that conversation:

- [ ] The brief's own post-merge steps done (for example the `search` redeploy, or the installed skill copy with `cmp` returning 0).
- [ ] Shared checkout brought to merged `main` (ORCHESTRATOR §3 step 8).
- [ ] The phase's worktrees and worker worktrees removed, local and remote branches deleted, worktree `.env.local` copies gone with them.
- [ ] `database.types.ts` regenerated where §3 says; every other open phase branch merges `main` in (§3).
- [ ] STATUS, DECISIONS and ORCHESTRATOR were in the PR; the next run's gate re-checked against `main`.
- [ ] Memory updated (the phase's memory file plus its `MEMORY.md` line).
- [ ] Stack told which gate opened and which run is next on this sheet.
