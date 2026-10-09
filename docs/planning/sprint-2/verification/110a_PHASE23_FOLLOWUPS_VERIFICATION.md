# 110a: Phase 23 follow-ups, the verification record

The record for brief `docs/planning/sprint-2/briefs/110_PHASE23_followups.md`. The PM writes it; each
worker hands in its own section. Newest section last.

## The freeze

Brief 110 was frozen on 2026-10-08 as commit 5d78ddc on `fix/phase23-followups`, pushed before any
worker worktree was cut. The Seams were read again, each row by its words, against
`feat/workspace-24` at e365153 and `feat/styling-22` at 8b92ac6 (the brief's table under "Seams"
gives the lines). The worktree `bb2dash-wt-23f` was clean at `origin/fix/phase23-followups`
(ba818bc) when the session started. The untagged-session check was not due.

## Reads at the cut

Task 1. Made 2026-10-08, about 23:40Z, read-only: one SELECT on prod through the Supabase MCP
(counts and ids, no text), four greps and file reads in this worktree, and one `--dry-run` of the
exporter. At the read: no `agent_requests` row was queued or claimed, `v_inbox_queue` held 0 rows,
and the last sync (request 2519, 22:58Z) had closed done.

1. **`supersede/` items on prod: 0**, in any state. So the supersede half of Item 2 has nothing to
   act on live, as STATUS said, and step 9's supersede count will be zero ("not exercised"; row
   `9-supersede` is waived for that reason).
2. **Session answers the backfill would stamp: 14**, not two: items 905 to 914, 1915, 3436, 3437 and
   3453. All 15 session answers on prod are `archived`, none carries `applied_at`, and 14 of them
   name a pick that their file carries today. The fifteenth is 3435 ("none"), which gets no stamp.
   188's backfill prints its count; expect 14 unless a fold links or unlinks a file first.
3. **The last five container syncs took 125, 43, 105, 118 and 99 seconds** from claim to close
   (requests 2519, 2516, 2514, 2381, 2208; 68 to 149 s from the press). Step 3's nine-minute watch
   has more than three times the longest of them.
4. **The Inbox card for a `stack_must_confirm` on `agent_request` has no Dismiss and no Confirm
   button** (`web/src/components/inbox/InboxCard.tsx:154-160`, `:267-296`, `:377-406`). It shows an
   Answer box ("your answer"), a "why (optional)" field, and Save, which is enabled only once an
   answer is typed. Dismiss is offered for the kinds `deadline` and `data_gap` alone (`:159`,
   `:391-405`). A saved answer writes `state = 'resolved'` and
   `resolution = {value, value_type}` (`web/src/lib/queries.sync.ts:405-410`); with no "why" the
   worker records it as `recorded_elsewhere` because the entity is `agent_request`
   (`apply/src/batch.ts:162`, `:170`), and with a "why" it goes to Claude. **So the pack's "dismiss"
   steps (1 and 7a) cannot be done on a `stack_must_confirm` card.** This is the PM's ruling R1
   (brief 110, "Round 1"): the labels `dismiss` and `offline` are raised as kind `data_gap`, whose
   card offers Dismiss. Nothing closes such a row by itself: `close_cleared_gaps` acts on a
   `data_gap` only for the entities `reading` and `bb_file` (`db/migrations/161_outside_links.sql:87-96`).
5. **No standing unit pins the source of either transform function.** Of the five `phase18_*`
   units, one reads a function's source at all: `db/tests/phase18_124_stage_files_replay.sql:66-67`
   holds the md5 of `stage_content`'s body. No unit under `db/tests` names
   `supersede_replaced_files` or `link_file_sessions` beside `prosrc` or `pg_get_functiondef`. 188
   re-creates neither `stage_content` nor anything that unit pins.
6. **The exporter's dry run: exit code 0, and it would file 17 rows.** Run as
   `SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness node scripts/inbox-decisions-export.mjs --dry-run`
   from this worktree. The vault resolved to the `projects` realm, the service key was read from its
   file and not printed, and `inbox_decisions_unfiled` answered. It listed 3782, 3426, 3425, 3427,
   3441, 3434, 3433, 3453, 3667, 3666, 3669, 3668, 3563, 3562, 3437, 3436 and 3435, each dated
   2026-10-07, and ended "filed 0, not filed 0". `git status --porcelain` printed nothing afterwards.
   Item 3's build goes ahead.

Also read, for the pack's worker: 6 rows on prod have entity `agent_request`, all
`stack_must_confirm` and archived (the notices), and no row's ref starts `accept/`.

## Rulings at the spawn (2026-10-08)

W-80 to W-83 were spawned together after the freeze and task 1, each in its own worktree
(`bb2dash-wt-23f-db`, `-apply`, `-exports`, and `bb2dash-stack-wt-23f` cut from bb2dash-stack's
`origin/main` at c4a54f8). They are Sonnet 5.5 (brief 110, "The freeze"). W-84 waits for 187.

**R1** is brief 110's "Round 1": a test question the run dismisses is a `data_gap`.

**R2, the shapes two workers share.** The brief names these values and leaves their form open. W-80
writes the SQL side and W-81 the worker's, at the same time, so the PM fixed the form in both
prompts:

* `inbox_apply_prepare` returns `held` at the top level of its answer, beside `params`, `queue` and
  `runs_today`: a JSON array of item ids (numbers), empty for a request with no `trigger`.
* The worker's close hands back `skip_seen` inside the result: a JSON array of
  `{"id": <number>, "resolved_at": <string or null>}`. The string is the queue row's `resolved_at`
  exactly as `prepare` handed it (`185:81` already sends it). The worker never passes it through a
  JavaScript date, which would drop the microseconds; the close casts it to `timestamptz` and
  compares with `is not distinct from`. A malformed `skip_seen` is refused (22023), as a malformed
  `skip` is.
* `v_inbox_apply_runs` has these columns in this order: `id`, `state`, `filed_by` (the params'
  `trigger`, and `button` when there is none), `after_request`, `claimed_by`, `created_at`,
  `claimed_at`, `finished_at`, `claude_started`, `error_code`, `archived_count`, `skip_ids`. W-80
  says in its own record where the code made it take a nearer form; W-84 builds on what W-80 hands in.
* The exporter's four filing functions keep 182's argument naming; W-82 writes down the names it
  sends and the PM holds W-80's file to them at integration.

**What each worker may not do** was written into every prompt: no Supabase tool and no change to
prod, no migration run on prod even rolled back, no `docker` command, no scheduled task, no `.env`,
no secrets folder, no `git add -A`, no file outside its list, and no answer expected mid-run. W-80's
only path to the database is the read-only runner, one process at a time.

## The workers' hand-ins (2026-10-08)

Each bb2dash worker's own record is beside this file: `110_W80_VERIFICATION.md` (database),
`110_W81_VERIFICATION.md` (worker and skills), `110_W82_VERIFICATION.md` (exporter and schedule), and
`110_W84_VERIFICATION.md` (the pack) when it lands. What the PM checked on each as it came in:

* **W-81** (`fix/phase23-followups-apply`, 96e7050): `apply/` 136 tests, typecheck 0, lines 94.87 %
  (94.78 % before). Only `batch.ts`, `report.ts`, `loop.ts`, two test files, three skill files and
  its record changed; no lock file moved. Its bb-sync step reads
  `id not in (select inbox_apply_held_items())`, which fits W-80's `setof bigint`.
* **W-82** (`fix/phase23-followups-exports`, 533fb37): exporter, pr and render tests 41 pass; runner
  tests 14 pass. It sends `p_id` and `p_filed`, `p_limit`, `p_id` and `p_log_path`, `p_id` and
  `p_why`, and expects a boolean back from the three marks; W-80's 187 has exactly those names and
  return types (read by the PM on the branch). The registration script was parsed, never run.
  **Open for the review round:** the task starts `node.exe` directly, so a console window may show
  every six hours; the existing logon task wraps its command in `powershell -WindowStyle Hidden`
  (`desktop/launch/register-logon-task.ps1:145-146`).
* **W-80** (`fix/phase23-followups-db`, 7330ee0): the runner reads "migration 187 is not applied" on
  the three 187 units and "migration 188 is not applied" on 188's; units 180 to 186 pass today. One
  standing unit was edited and named: `phase23_186_notices.sql`, case 3a, now also sends
  `skip_seen` (186's close ignores the key, so it passes before and after). **Open for the review
  round:** 187 is 854 lines and the held-answers unit 823, over the 800-line limit.
* The three were merged into `fix/phase23-followups` (ecb796d, 7f51388, 480e4e2) and
  `bb2dash-wt-23f-accept` was cut from that for W-84.

### W-83, bb2dash-stack (`fix/phase23-followups` there, 527ecd5), as handed in

That repository has no planning folder, so its record is here, from the worker's report.

* **Tests.** `node --test <folder>` reads a folder as one failing test on this machine (Node 24), so
  files are passed by name. `doctor/*.test.mjs`: 71 before, 88 after, 0 failures.
  `scripts/*.test.mjs`: 225 before, 242 after, 241 pass, 1 skipped (the enum test, below).
  `git diff --stat origin/main...HEAD -- doctor/workspace.test.mjs` prints nothing.
* **Task 12.** One service-row function in `doctor/lib/checks-docker.mjs` makes both the Workspace's
  and apply's rows. Apply with the profile off and a container still there is a problem whose text
  holds `COMPOSE_PROFILES=workspace,apply`. New `doctor/lib/checks-exports.mjs` reads the state
  file only. `doctor/apply.test.mjs` has four cases, `doctor/exports.test.mjs` nine.
* **Task 13.** `just --list` holds `file-decisions`
  (`node "{{bb2dash_dir}}/scripts/inbox-decisions-pr.mjs"`). `grep -c "Not in the doctor yet" README.md`
  gives 0.
* **Task 14.** Five actions with the brief's names. `apply.stop` is
  `docker compose --profile apply stop apply`; `apply.startNoBuild` is
  `--profile apply up -d --no-build --no-deps apply`, then a wait for healthy; `apply.doctorRow`
  runs `config --services` and one `ps` of the service; `exports.doctorRow` starts nothing;
  `exports.runNow` on Windows queries the task, starts it and waits up to five minutes for
  `ended_at` to move, and fails with no fallback when the task is not registered. The run's
  bookkeeping now carries the services it stopped and still owes a start, and the cleanup and the
  sweep start them again.
* **The test that compares action names with bb2dash's schema** did not exist in either repository.
  W-83 added it (`scripts/accept-services.test.mjs`); it finds the schema through `BB2DASH_DIR`,
  then `../bb2dash`, and skips full equality until the schema lists one of the five new names.
* **Three places where the brief was not built to the letter**, each because an unedited test pins
  the old form: the README section is still titled "The nine verbs" (the text says ten and names
  the tenth); `.env.example` keeps its one `COMPOSE_PROFILES=workspace` line and gives
  `workspace,apply` in a comment; when compose itself cannot answer, apply's row repeats the words
  and does not count a second problem.

## Task 4: the review of the database branch, before anything is applied (2026-10-08)

Both commands were run by the PM from inside `bb2dash-wt-23f-db`. The code review ran at effort
"high" on the range `tmp/23f-pre-merge..480e4e2`, so it read W-80's branch and, with it, W-81's and
W-82's merged work. Both read code only; neither ran a test or touched a database.

**Before the reviews, the bodies.** The six functions 187 and 188 re-create were compared with prod
by the md5 of their source (one SELECT on `pg_proc`; the repo side computed from the newest
migration that creates each): `inbox_apply_close` (186), `inbox_apply_prepare` (185),
`inbox_decision_filed` (182), `sync_request_inbox_apply` (180), `supersede_replaced_files` (160) and
`link_file_sessions` (163) are each the same on prod as in the repository. So each new body starts
from the live one.

**`/security-review`: no HIGH and no MEDIUM finding.** It read every new and re-created object's
grants and mode, the owner check of `inbox_accept_question` (first statement, both nulls handled),
both argument patterns (anchored; a trailing newline does not pass), the clean-up's reach, every
jsonb path of `inbox_apply_close`, the view (security invoker; a reader still needs
`agent_requests`, which is owner-only), and 188's stamp and backfill. One LOW note, taken:

| # | finding | ruling |
|---|---|---|
| S-1 (LOW) | a `done` close can write new holds, and only a `failed` close raises a notice. Somebody holding the role's login itself could hold every answered row with no notice. The same role can already archive rows outright, so nothing new is reachable | **fixed in 187**: a new hold is written by a failed close only (Round 2) |

Left by its own exclusions and noted: `inbox_accept_question`'s used-once check includes the entity
and the open-row index of 041 does not, so an open row with the same kind and ref under another
entity makes the insert fail on the index. It fails closed.

**`/code-review` (high): ten findings.**

| # | where | finding | ruling |
|---|---|---|---|
| C-1 | `187`, `prepare` and `close` | a press retries only the held answers that fit its first batch of six: its follow-up carries `trigger: followup`, gets the held list back and skips them, and held rows alone file no follow-up | **fixed, R3**: a press's whole chain is a retry chain |
| C-2 | `187`, `close` | the "still stuck" test read the holds alone; the old worker sends no `skip_seen`, so between 187's apply and the rebuild the failure notice would close with the answer still waiting. The 186 unit only stayed green because it was edited | **fixed, R4**: 186's second arm is kept for the notice; the 186 unit goes back to `main`'s text |
| C-3 | `scripts/register-exports.ps1` | the task starts `node.exe` directly under an Interactive logon, so a console window opens on his desktop at logon and every six hours | **fixed**: the action is `powershell -WindowStyle Hidden`, as the logon task's |
| C-4 | `188` and the exporter | 188 lets `applied_at` change after a row is archived; the note embeds it and the exporter refuses a note that differs from a fresh render, so a row whose note was written, whose mark failed and which was then stamped could never be filed | **fixed in the exporter**: for an unfiled row a difference in `applied_at` alone is written again; any other difference is refused as today. No note is filed today (0 of 17), and the cut-over runs the first export after 188, so no filed note goes stale at the backfill |
| C-5 | exporter, `isTestQuestion` | ref, entity and the missing course can all be set by the worker's role through `raise_attention`, so a real decision with a write could be skipped and miss the day's log | **fixed, R5**: `inbox_decision_skipped` refuses an item with a logged write, and the exporter then files the row |
| C-6 | `187`, `inbox_apply_held_items` | a held session answer that a later fold links by the lecture-number rule (which does not stamp) stays held, though the worker could record it at no cost | **not changed**. It needs a held session answer and a later lecture-number link to the same session. A press records it without a run. Mirroring the worker's whole free-record rule in SQL would put the rule in two places. Named in STATUS, Known issues |
| C-7 | `188` | the fold stops asking again but still does not apply a superseded-file pick | **not changed**: open item O-2, on its default |
| C-8 | `187` (854 lines), held-answers unit (823) | over the 800-line limit | **unit split in two; 187 stays one file.** A migration is applied under one name, byte-identical, and a split would spend 189, the one number held for a fix after 187 is on prod. Stack's to overrule |
| C-9 | exporter helpers | three helpers push into a result object handed in (the immutability rule) | **fixed**: each returns its own result |
| C-10 | STATUS, root `CLAUDE.md` | not updated yet | task 19, with the PRs |

The fixes are W-80's and W-82's round 2, each test first. The second look at the fix round is
recorded below when it is done.

## Round 2 landed (2026-10-08)

W-80's and W-82's fix rounds are merged into `fix/phase23-followups` (7c94cdd, 49802ce). Their own
records carry the red and green runs ("Round 2" in `110_W80_VERIFICATION.md` and
`110_W82_VERIFICATION.md`).

* 187 is 917 lines after the round (854 before): R3, R4, the failed-close rule and R5 added lines.
  The held-answers unit is two files, 593 and 610 lines (`phase23_187_held_answers.sql`, cases 0 to
  9 and 18; `phase23_187_held_answers_b.sql`, cases 0, 10 to 17 and 19).
* `db/tests/phase23_186_notices.sql` is byte-identical to `main`'s again.
* **One standing unit is edited, one line:** `db/tests/phase23_181_inbox_apply_runner.sql:383`. Its
  hand-made request has no `trigger`, so under R3 it is a press's request and its follow-up carries
  `retry_held: true`. The comparison leaves that key out, so the unit reads the same before and
  after 187.
* W-82: the task's action is a hidden PowerShell that ends with `exit $LASTEXITCODE`; the three
  helpers return their own results; a note that differs in `applied_at` alone is written again for
  an unfiled row; a refused skip files the row. Exporter, runner, pr and render tests: 60 pass.

## The rolled-back dry runs of 187 and 188 (tasks 5 and 6, the part before Stack's word)

Made by the PM on 2026-10-09, about 01:10Z, on prod, through `execute_sql`, every run inside
`begin; ... rollback;`. No `agent_requests` row was queued or claimed and `v_inbox_queue` held no
row; each run checks that first and stops if one is. Nothing was applied.

**How the text got there without being retyped.** The files are on a public repository at a pushed
commit. `net.http_get` (pg_net, the project's own way to reach out from the database) fetched each
file from `raw.githubusercontent.com/emstacho-su/bb2dash/49802cefde3fd58d19c0188ce442c6fbb4dd1a3e/`,
and each run reads the text from `net._http_response`, compares its SHA-256 with the local file's
and executes it only when they are equal. 187 is `e8190ef0...3f0559` (55,554 bytes) and 188 is
`d1ae01d7...ed308e` (30,430 bytes), on both sides. A unit runs as the test login, as the runner
does: inside the transaction `postgres` is granted the three runner roles with the set option
(brief 102, B-42), the file's own `begin;` and `rollback;` lines are taken out, and each
`reset role` goes back to `db_test_runner`. Each unit runs in a sub-transaction that is rolled back
whether it passes or fails, so no unit sees another's rows.

**187 alone.** The whole file executed and its guard blocks raised nothing. Read inside the same
transaction, before the rollback:

* item 3782: `decision_filed = {"skipped": true, "why": "test item of the Phase 23 cut-over run: no
  note, no day-file entry"}`, filed time set, and it is no longer on the unfiled list, which holds
  16 rows; the unlogged list holds 0;
* `inbox_apply_holds`: 0 rows; `anon`, `authenticated`, `service_role`, `inbox_apply_runner` and
  `sync_runner` hold neither select nor insert; `db_test_runner` holds select and no insert;
* who may execute: `inbox_apply_prepare` and `inbox_apply_close`, `inbox_apply_runner` alone;
  `sync_request_inbox_apply`, `sync_runner` alone, which still executes fourteen functions;
  `inbox_apply_held_items` and the four filing functions, `service_role` and `db_test_runner`;
  `inbox_accept_question`, `authenticated` alone;
* `v_inbox_apply_runs`: 18 rows, the twelve columns of R2 in order and typed
  (`skip_ids` is `bigint[]`, `archived_count` is `integer`, `claude_started` is `boolean`).

**The units against 187, all in one rolled-back transaction: 13 of 13 PASS.**
`phase23_187_held_answers`, `phase23_187_held_answers_b`, `phase23_187_decision_filing`,
`phase23_187_accept_objects`, `phase23_180_inbox_apply_trigger`, `phase23_181_inbox_apply_runner`,
`phase23_182_inbox_decision_filing`, `phase23_183_one_open_inbox_feedback`,
`phase23_185_session_links`, `phase23_186_notices` (main's text), `phase14_093_review_fixes`,
`phase14_095_storage_key`, and `phase14_091_queue` after its loader.

**Two controls, so that a pass means something.** The held-answers unit and the decision-filing
unit, run the same way with 187 not executed, each stopped at
"migration 187 is not applied".

**188, after 187, in one rolled-back transaction (task 6).** Both files executed.
`phase23_188_archived_answers`: **PASS** (and "migration 188 is not applied" before the two files).
The backfill stamped **14** session answers, the ids task 1 named (905 to 914, 1915, 3436, 3437,
3453), each with the transaction's own time. The five `phase18_*` units and `phase23_185` read the
same before and after the two files:

| unit | before 187 and 188 | after |
|---|---|---|
| `phase18_122_supersede_rule` | FAIL (1), the newest run's four links (live course data; known since 2026-10-07) | the same line |
| `phase18_123_file_sessions` | FAIL (4), "ambiguous without exactly one open question: 2488:0" (live data: file 2488's question was answered "none" and archived) | the same line |
| `phase18_124_stage_files_replay` | PASS | PASS |
| `phase18_162_lecture_number_links` | PASS | PASS |
| `phase18_163_session_link_answers` | PASS | PASS |
| `phase23_185_session_links` | PASS | PASS |

`phase18_123` failing on `main` is new to the record: STATUS named three units that fail on live
course data, and this is a fourth. It is not this phase's: it fails the same way with neither file
executed.

**After the last rollback, one read:** no `inbox_apply_holds` table and no `v_inbox_apply_runs`
view exist, `inbox_apply_close` is 186's body by md5, item 3782 is unfiled, no migration row is
named 187, and `postgres` holds no set option on a runner role. The only thing left behind is the
fetched text in `net._http_response`, which pg_net clears by itself.
