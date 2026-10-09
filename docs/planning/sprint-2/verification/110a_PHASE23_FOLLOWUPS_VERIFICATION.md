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

Made by the PM on 2026-10-09, between about 00:30Z and 00:45Z, on round 2's file, on prod, through `execute_sql`, every run inside
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

## The second look at round 2 (2026-10-09), and round 3

An independent reader, given only the files, the brief and the findings, read round 2 of 187 with
its units and the worker code that calls it. It ran nothing. Verdict: one MEDIUM to fix before 187
is applied, the rest LOW. The dry runs above were made on round 2's file and are repeated on round
3's before Stack is asked.

| # | finding | ruling |
|---|---|---|
| L-1 (MEDIUM) | R3 as built: a retry follow-up is handed its own `params.skip`, the worker copies those ids into its close's `skip` with the answer's present time, and a failed close then held each of them, untried. An answer given again in the middle of a press's chain could be held without a try, and a hand-written `{trigger: followup, retry_held: true, skip: [...]}` could make things held | **fixed in 187 (round 3)**: the failed close of a retry follow-up writes no hold for an id in that request's own `params.skip`. Three new unit cases; none closed a retry follow-up as failed before. This gap came from the PM's own ruling R3, not from the worker |
| L-2 (LOW) | while the old worker runs, a `not_applied` notice would say "a sync does not try again" though every sync still does | **fixed**: the new sentence only when the close sends `skip_seen` |
| L-3 (LOW) | a press whose first six answers all fail archives nothing, so no follow-up is filed and a held answer past the sixth is not reached | **not changed**: the brief's own rule that a run which gets nowhere never loops. Named in STATUS, Known issues |
| L-4 (LOW) | 187's guard read `service_role`'s grant on `inbox_apply_writes` and not that the role passes row level security; without it every skip would be allowed silently | **fixed**: the guard reads `rolbypassrls` too |
| L-5 (LOW) | four changed places in the re-created bodies carry no `-- 187:` marker | **fixed** (comments only) |
| L-6 (LOW) | four unit assertions prove less than their comment says | **fixed** in the units |

What it found correct, by tracing: the four re-created bodies differ from 180, 185, 186 and 182
only where intended, and 186's arm in the stuck test is character for character 186's; no chain can
loop, the daily cap included; `retry_held` counts only as the JSON true; with the old worker a
failed run and the next done run behave as on prod today (no hold, the same follow-ups, the notice
held by 186's arm, nothing parked); a hold is inserted on a failed close only and a stale one is
removed by any close; `phase23_186_notices.sql` is `main`'s text and its cases pass against the new
close; the one-line change to `phase23_181` is right before and after 187.

## Round 3 landed, and the dry runs repeated on the final files (2026-10-09, 00:55Z)

W-80's round 3 is merged (921d201). 187 is 933 lines, SHA-256 `4b099693...818f4c` (57,151 bytes);
188 is unchanged (`d1ae01d7...ed308e`). The held-answers units are 605 and 721 lines; case 20 of the
second holds L-1's three cases and one more (a `retry_held` that is the text "true" is an ordinary
request, so its failed close does hold).

One rolled-back transaction on prod, the same method as above, with no request open and no answer
waiting. The four files round 3 changed were fetched again from commit 921d201 and each compared by
SHA-256 with the local file before it ran.

* **Control, before 187:** `phase23_187_held_answers_b` stops at "migration 187 is not applied".
* **187 executed whole, guards silent.** Item 3782 reads `{"skipped": true, "why": "test item of the
  Phase 23 cut-over run: no note, no day-file entry"}`; 16 decisions unfiled; `inbox_apply_holds`
  empty; `sync_runner` executes 14 functions and `inbox_apply_runner` 7, as before the file;
  `v_inbox_apply_runs` shows 18 rows.
* **13 of 13 units PASS against 187:** the four `phase23_187_*`, `phase23_180`, `_181`, `_182`,
  `_183`, `_185`, `_186` (main's text), `phase14_093_review_fixes`, `phase14_095_storage_key`, and
  `phase14_091_queue` after its loader.
* **188 on top, in the same transaction:** the backfill stamped 14; `phase23_188_archived_answers`
  PASS; both held-answers units and `phase23_185` still PASS with 188 in; `phase18_124`, `_162`,
  `_163` PASS; `phase18_122` and `phase18_123` fail with the same two lines they give on `main`.
* **After the rollback, one read (00:58Z):** no holds table, `inbox_apply_close` is 186's body and
  `link_file_sessions` is 163's by md5, item 3782 unfiled, no session answer stamped, no migration
  row for 187 or 188, no request open (the last is 2519), no answer waiting.

**187 is ready to apply and waits for Stack's word.**

## Task 16, the gates on the integrated branch (2026-10-09, at 87b22e4, before the PR review round)

Run in `bb2dash-wt-23f` after `npm ci` in `apply/`, `workspace/`, `sync/`, `web/` and `scripts/`.
Every step exited 0, and `git status --porcelain` printed nothing afterwards (no lock file moved).

| gate | result |
|---|---|
| `apply/`: `npm run typecheck`; `npx vitest run --coverage` | 0; all tests pass; lines of `src/` 94.87 % (630 of 664) |
| `scripts/`: `npm test` (the line now holds `exports-run.test.mjs` and `accept-proofs-db23.test.mjs`) | 222 pass, 0 fail |
| `sync/`: `npx vitest run` | 159 pass in 7 files; no file under `sync/` is in the diff |
| `node --test acceptance/acceptance.test.mjs` | pass (41) |
| `node --test docker/apply/image.test.mjs docker/grep-clean.test.mjs`; `node --test scripts/install-skills.test.mjs` | pass |
| `node docker/apply/fork-firewall.mjs --write`, then `git diff --exit-code docker/apply` | exits 0, nothing printed |
| `web/`: `npm run typecheck`; `npx eslint . --max-warnings 0`; `npx vitest run` | 0; 0; 2913 pass (`main`'s recorded count is 2913) |
| `cd web && npx playwright test -c e2e/accept.config.ts --list` | 18 tests in one file; the seven new titles are `1 raise questions`, `2 press sync`, `3 watch apply`, `4 archived`, `6 note and apply`, `7a offline press`, `7b taken after` |
| bb2dash-stack, `BB2DASH_DIR` set to this worktree: `node --test doctor/*.test.mjs` | 88 pass |

The types file is regenerated after 187 is on prod, and the gates are run again after the review
round; both are recorded below when done.

## Task 18: `/code-review main high` on both branches (2026-10-09)

Each run from inside its branch's worktree, against `main`. Both read code; the bb2dash one
confirmed its findings 1, 3 and 7 by bytes or by running a snippet.

**bb2dash (`fix/phase23-followups` at 2b4edd7's code): ten findings.**

| # | where | finding | ruling |
|---|---|---|---|
| P-1 (CRITICAL) | `scripts/register-exports.ps1:102` | the PowerShell path literal lost its backslashes and holds a vertical-tab byte (`System32WindowsPowerShell<VT>1.0powershell.exe`), so the script always exits 2 and the task can never be registered. The PM confirmed the byte with `cat -A` | **fix (W-82)**, with a test that reads the script's bytes. The script was parse-checked, and a parse does not see a wrong string |
| P-2 | exporter, `logRows` | a test-shaped row whose skip was refused (R5) is filed with a note by the scheduled run, and the unlogged pass then skips every test-shaped row, so its day-file entry is never written | **fix (W-82)**: every unlogged row gets its entry |
| P-3 | `web/e2e/accept23.spec.ts:394` | the regex is `/inbox-apply d+/` (backslash missing), so "nothing was pasted" can never fail in step 3's early branch | **fix (W-84)**, and the pack's files are read for other lost escapes |
| P-4 | `188`, `link_file_sessions` | the stamp is written only where step c writes the pick; a file linked to the same session by another path leaves the answer unstamped for good, and step 9's proof would fail on it at every run | **fix (W-80), R6**: the fold ends with the backfill's own statement. This also closes C-6 of the first review |
| P-5 | exporter, `skipTestQuestions` | a false from `inbox_decision_skipped` is read as "has a logged write", but it is also the answer for a row another run already took; the exporter would then write a note for a test question and exit 1 | **fix (W-82)**: on a false the unfiled list is read again |
| P-6 | `187`, the `not_applied` notice | the new sentence is used whenever `skip_seen` is sent, though a hold is not always written | **fix (W-80)**: only when a hold stands for an id of that close's skip |
| P-7 | `scripts/exports-run.mjs:125` | a timed-out exporter logs a bare "exit 1": `spawnSync` gives `''`, not null, for stderr | **fix (W-82)**, in both copies |
| P-8 | STATUS, `CLAUDE.md` | not updated | task 19 |
| P-9 | pack 23, the exporter, 187 | a test question is told by its shape in several places, and item 3782 is written into 187 and into the `decisions-filed` proof | **not changed**. The shape is the brief's design, and R5 closes what it could cost. The proofs run against prod alone, where 3782 exists; the proof says so |
| P-10 | `exports-run.mjs` | it has its own copies of `runCommand`, the line printer and the atomic write | **fix (W-82)**: one copy of each |

**bb2dash-stack (`fix/phase23-followups` at 527ecd5): ten findings.**

| # | where | finding | ruling |
|---|---|---|---|
| K-1 | `accept-actions.mjs`, `apply.stop` | it owes a start without checking that it stopped a running container, so cleanup could start a worker that was not running before the run | **fix (W-83)** |
| K-2 | doctor, the apply row | a stopped leftover container is a problem, and the only remedy named is turning the profile on | **fix**: only a running one is a problem; both remedies named |
| K-3 | `exports.runNow` | it passes on any later `ended_at`, not on the run it started | **fix**: `started_at` at or after the ask |
| K-4 | doctor, the exports row | shown as a problem on every platform, though only Windows can schedule it | **fix**: no problem off Windows |
| K-5 | doctor, the Workspace row's hint | a fixed `COMPOSE_PROFILES=workspace` line would now turn apply off | **fix where the unedited Workspace test allows**; apply's own hint is fixed either way |
| K-6 | `accept-cleanup.mjs` | the command it prints lost its leading `docker` | **fix** |
| K-7 | `accept-report.mjs`, the swept-run line | an empty clause and "started again" twice | **fix** |
| K-8 | `accept-report.mjs` | a normal run's record never says cleanup started apply again | **fix**: a `services` key of its own |
| K-9 | `accept-docker.mjs` | apply in the run's own services lets `exec`, `run`, `rm`, `build`, `restart` through, on a container that holds two secrets | **fix**: stop, start without a build, and list; nothing else |
| K-10 | `accept-exports.mjs` | `HARNESS_DIR` is resolved a second time, from `.env` alone | **fix**: carried from preflight |

Rulings that change the Contract are brief 110's "Round 3" (R6, R7, the notice, the refused skip,
the bb2dash-stack rules). W-84's own open point, step 6's fourteen minutes against the operator's
ten-minute limit, is R7.

## Task 18's fix round: what landed, and the dry runs on the final files (2026-10-09, about 01:40Z)

* **W-80, round 4** (merged 267fe5c). 187 is 940 lines, SHA-256 `e93d830d...1df622` (57,726
  bytes): the `not_applied` notice carries its new sentence only when a hold stands, after the
  close has written its holds, for an id of that close's skip (`v_stands`, read from
  `inbox_apply_held_items()`). 188 is 614 lines, `d9502013...b7a10` (31,462 bytes): R6,
  `link_file_sessions` ends with one stamping statement and is otherwise 163's body again.
* **W-82, round 3**: the path literal is right again (`grep -c -F` of it gives 1, control characters
  0, parse errors 0) and `scripts/register-exports.test.mjs` reads the script's bytes; every
  unlogged row gets its entry; a refused skip reads the unfiled list again; a timeout says so in
  the log; one copy of `runCommand`, the line printer and the atomic write. 72 tests pass.
* **W-84, round 2** (merged 04081e5): the regex is one constant used in both places; step 6 waits
  nine minutes; `applied-from-button` and `recorded-after-sync` are blocked on a request still
  queued or claimed; `request-taken-after` is blocked on one still claimed and fails on one still
  queued after the worker was started. W-84 found that the host reads a step's proofs only on the
  operator's `pass` and that `unsure` is red, so the playbook's step 6 now says `blocked` for a
  wait that ends with the request open (238705d, the PM's one-sentence edit; acceptance test 41
  pass).
* **`/security-review` on the bb2dash branch** (read at 058bd21, before this round's fixes landed):
  **no HIGH and no MEDIUM finding.** It traced the service key (read in one place, used as two
  headers, redacted on both error paths, never in a log line, the state file or a file), how note
  and day-file paths are built (from the integer item id and a formatted date; no row string
  reaches a path), every spawn (argument arrays, no shell, no `git` or `gh` in `--notes-only`),
  the registration script's quoting, the proofs' parameters (typed, bound as values in a read-only
  transaction; `since` comes from the host, not the sandbox), and 187's rules since the first
  review. Three LOW notes: the unlogged pass skipping a test-shaped row (P-2, fixed in this round);
  the notice condition (P-6, fixed in this round); and typographic single quotes in a folder path
  ending the quoted literal of the task's command (**taken**: the script refuses those four
  characters; W-82's follow-up).

**The dry runs, repeated on round 4's files.** One rolled-back transaction on prod, the method
above, no request open and no answer waiting, each fetched text compared by SHA-256 with the local
file first (commit 267fe5c).

* Control before 187: `phase23_187_held_answers` stops at "migration 187 is not applied".
* 187 executed whole, guards silent. Item 3782 skipped with its sentence; 16 unfiled; holds table
  empty; `sync_runner` 14 functions, `inbox_apply_runner` 7; the view shows 18 rows.
* **13 of 13 units PASS against 187** (the same thirteen as before).
* Control before 188: `phase23_188_archived_answers` stops at "migration 188 is not applied".
* 188 executed on top: the backfill stamped 14. `link_file_sessions` was then run once on prod's own
  data inside the transaction: it examined 10 files, linked none, raised nothing, and the stamped
  count stayed 14. `phase23_188_archived_answers` PASS; both held-answers units and `phase23_185`
  PASS with 188 in; `phase18_124`, `_162`, `_163` PASS; `phase18_122` and `_123` give the two lines
  they give on `main`.

**187 is final and waits for Stack's word.** 188 waits for the cut-over.

## Task 5: 187 on prod (2026-10-09, 01:32Z), on Stack's word

Stack's word, in the terminal, in answer to the dry run's result: "apply/merge". The PM read it as
187 now, and his merge word for both PRs once they are ready; the cut-over keeps its own word.

* **Before the apply, one read (01:29Z):** no `agent_requests` row queued or claimed (the last is
  2519), `v_inbox_queue` empty, no migration row named 187; the newest was `186_inbox_apply_notices`.
* **Applied** with `apply_migration` as `187_inbox_apply_followups`, version `20261009013207`.
* **Byte-identical.** The text the database recorded is one statement of 57,726 characters; its
  SHA-256 is `e93d830d1e1143a2a533e3ee3a8e84d5a115d9ce30c55f9159cf7403561df622` and its md5
  `33440b2a0ee8a457c3605b7ab021f048`, the same two as the file's
  (`sha256sum` and `md5sum` of `db/migrations/187_inbox_apply_followups.sql`).
* **Item 3782** reads `{"skipped": true, "why": "test item of the Phase 23 cut-over run: no note, no
  day-file entry"}`; the unfiled list holds 16 rows and not 3782; `inbox_apply_holds` is empty.
* **Runner on each (`node scripts/db-test.mjs --only <file>`, one process at a time): 13 PASS.**
  `phase23_187_held_answers`, `phase23_187_held_answers_b`, `phase23_187_decision_filing`,
  `phase23_187_accept_objects`, `phase23_180_inbox_apply_trigger`, `phase23_181_inbox_apply_runner`,
  `phase23_182_inbox_decision_filing`, `phase23_183_one_open_inbox_feedback`,
  `phase23_185_session_links`, `phase23_186_notices`, `phase14_091_queue`,
  `phase14_093_review_fixes`, `phase14_095_storage_key`. `phase23_188_archived_answers` reads
  "migration 188 is not applied", as it must until the cut-over.
* **Supabase advisors (security), read after the apply:** two lines name a new object, both as
  designed. `inbox_apply_holds` has row level security and no policy (INFO): that is the table's
  whole point, only `inbox_apply_close` writes it. `inbox_accept_question` is a SECURITY DEFINER
  function `authenticated` may call (WARN): its first statement is the owner check, and both
  reviews read it. The other lines (`app_owner`, `calendar_push_now`, leaked-password protection)
  are older than this phase.
* **Types.** `web/src/lib/supabase/database.types.ts` regenerated (508060f): 236 lines added, none
  removed. `main`'s copy had not been regenerated since 180, so the hunk holds Phase 23's objects of
  180 to 187 (`decision_filed` and `decision_filed_at`, `inbox_apply_writes`, the worker's
  functions, and 187's table, view and functions). No other phase's object is in it: prod's newest
  migration is 187. `npm run typecheck` in `web/` exits 0, and
  `git diff --name-only origin/main...HEAD -- sync/src web/src web/test workspace mcp-server desktop docker`
  prints the one line.

**187 is frozen from here.** The running `apply` worker is the old image: it ignores `held` and
sends no `skip_seen`, so no hold is written until the cut-over rebuilds it.

## The second look at task 18's fix round, bb2dash (2026-10-09)

An independent reader, on `058bd21..HEAD` of the code, with the findings and the rulings. It ran
the 79 script tests and the 41 acceptance tests (green) and no PowerShell and no SQL. Verdict:
**ready for the PR; no CRITICAL, HIGH or MEDIUM; seven LOW.**

| # | finding | ruling |
|---|---|---|
| T-1 | 188's `comment on function` and one heading still described the stamp as "an answer it applies" | **fixed before 188 is applied** (W-80, round 5: two comment hunks, the bodies untouched). One comment inside the body ("the one-time backfill's own predicate", though the fold's statement also takes dismissed answers) stays: the file's header says it right |
| T-2 | 187's `comment on function inbox_apply_close` says the `not_applied` notice "says a sync does not try the answers again"; since round 4 that holds only when a hold stands | **not changed: 187 was applied before this finding came back, and a comment is not worth 189.** The function's own body comment is right. Named in STATUS, Known issues; folded into 189 if 189 is ever spent |
| T-3 | the registration script tests the folder as typed for unsafe characters, not the resolved path | **fixed (W-82, round 4)** |
| T-4 | if `node.exe` has moved since registration, the task's command ends with 0 and nothing shows until the doctor's 36-hour limit | **fixed (W-82)**: the command sets a failing exit code before it starts node |
| T-5 | the script's byte test does not pin two more strings | **fixed (W-82)**; its tests are 76 pass |
| T-6 | step 6 watches nine minutes inside a 9.75-minute test, about 15 seconds of slack | **fix (W-84, round 3)**: 8.5 minutes |
| T-7 | a proof's "request still open" branch is not held to this run | **not changed**: it can only give blocked, never a pass |

It walked the task's command line for the two real folders and for a path with a space and an
apostrophe and found both parse in PowerShell 5.1; traced `--notes-only` and the default mode for
an ordinary row, an accepted skip, a refused skip and a row another run took; and compared 188's
`link_file_sessions` with 163's body (163's plus the one end statement).

## Task 6: 188's rolled-back dry run on its final text (2026-10-09, about 01:50Z)

After W-80's round 5 (comments only) 188 is 615 lines, SHA-256 `b4cbfaaa...4ac387`. 187 is now on
prod, so this run is 188 alone on top of it: one rolled-back transaction, the method above, no
request open, the text fetched from commit 1d7cf22 and compared by SHA-256 first.

* Before 188: `phase23_188_archived_answers` stops at "migration 188 is not applied".
* 188 executed whole, guards silent. The backfill stamped **14**. One fold of
  `link_file_sessions` on prod's own data examined 10 files, linked none, raised nothing; still 14.
  The function's comment reads as R6 has it.
* After 188: `phase23_188_archived_answers` **PASS**; `phase23_185`, both `phase23_187_held_answers`
  units, `phase18_124`, `_162`, `_163` PASS.
* `phase18_122_supersede_rule` and `phase18_123_file_sessions` give the same line before and after
  ("newest run ... wrote 4"; "ambiguous without exactly one open question: 2488:0"): both fail on
  live course data on `main` today, and 188 adds no line.
* Rolled back. Through the runner `phase23_188_archived_answers.sql` still reads "migration 188 is
  not applied", until task 20.

Also merged since: W-84's round 3 (step 6 watches eight and a half minutes, about 45 seconds of
slack; step 3's nine minutes have about 35) and W-82's round 4 (76 tests pass; the path literal
count 1, control characters 0, non-ASCII bytes 0, parse errors 0).

## Task 16 again, task 17, and bb2dash-stack's reviews (2026-10-09, about 01:45Z to 02:10Z)

**The gates, run again on the branch after the review rounds (at 1d7cf22's code): every step exits 0.**
`apply/` typecheck 0 and lines 94.87 % (630 of 664); `scripts/` `npm test` 238 pass (the line now
also holds `register-exports.test.mjs`); `sync/` 159 pass; the acceptance suite 41 pass; the docker
tests and `install-skills.test.mjs` pass; the firewall regenerated with no diff; `web/` typecheck 0,
eslint 0, 2913 tests; `playwright --list` shows the seven new titles. `git status --porcelain`
showed only the PM's own edit to the root `CLAUDE.md`: no lock file moved.

**Task 17, the test image.** Run in `bb2dash-wt-23f` at 515b456, after waiting for the Phase 22 walk
boxes that were running (rule 5 of the parallel sessions' file):

```text
SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt23f -f compose.yaml -f <scratchpad>/apply-wt23f.compose.yaml --profile apply build apply
```

The second file's whole content is `services: {apply: {image: "bb2dash-apply:wt23f"}}`, kept outside
every repository. The build exited 0. `bb2dash-apply:local` was
`sha256:3315bf7c18e2b14615a0e226f9ed8144c0a3f0ad7de0a9b50435c98d48340873` before and after;
`bb2dash-apply:wt23f` is `sha256:16a25942d0888f7271a329999c70d04a1d8d0f1eb31b06a66601597281400b47`;
`docker ps -a --filter name=bb2dash-wt23f -q` printed nothing; `bb2dash-apply-1` and `bb2dash-sync-1`
were up and healthy with their start times unchanged. `node --test docker/apply/image.test.mjs`:
9 pass. No container of the test project was started.

**bb2dash-stack.** W-83's round 2 (K-1 to K-10; `fix/phase23-followups` there at f9a6474): nine
fixed; the Workspace half of K-5 was not, because the unedited `doctor/workspace.test.mjs` pins the
old hint. `BB2DASH_DIR=<this worktree> node --test doctor/*.test.mjs scripts/*.test.mjs`, run by the
PM: **341 pass, 0 fail, 0 skipped** (the enum test ran in full: the registry's fifteen action names
equal the schema's enum).

* **`/security-review` on the bb2dash-stack branch: no HIGH and no MEDIUM.** Every command is an
  argument array spawned without a shell; the five new actions take no parameter and a pack that
  hands them one is refused when the manifest is read; the marker that records an owed service is
  outside every folder the sandbox can write and its names are held to a fixed list; the state file
  is not mounted into the sandbox and none of its strings is printed; `apply.doctorRow` reads the
  secret's status (present, empty, missing), never its content; `compose.yaml` changed in comments
  only. Three LOW notes on the door, taken in the last round.
* **The second look at W-83's fix round: ready for the PR**, one MEDIUM and five LOW:

| # | finding | ruling |
|---|---|---|
| D-1 (MEDIUM) | the door matched `apply` as a whole word only, so `compose cp apply:/run/secrets/... ./x` and a `--scale=apply=3` form passed. No registered action issues either and a pack cannot supply a command, so it is the door's second line only | **fix (W-83, round 3)**: the split `namesUntouchable` uses, and the whole command pinned for `apply` (no `-p`, `-f` or second `--profile` before the verb) |
| D-2 | a test of "state unreadable: stops nothing" recorded no call and so proved nothing | **fix** |
| D-3 | a leftover container that is `restarting` or `paused` read as stopped, no problem | **fix**: only exited, created and dead are stopped |
| D-4 | apply's hint is built from the environment's value when one is set | **fix**: from the value written in `.env` |
| D-5 | `exports.runNow`'s second ask can itself be dropped by the task; `schtasks` is started by bare name | **fix**: ask again every 30 seconds inside the limit; the full path |
| D-6 | off Windows `exports.doctorRow` fails where the doctor's row is not a problem | **fix**: one function for both |

  It traced a run cut off after the note and before the stop, after the stop, and after the start:
  `apply` is never started when it was not running before the run and never left stopped when it
  was. It found that nothing in either repository validates `verdict.json`, so the new `services`
  key cannot turn a run red.

## Task 19: the Seams once more, just before the PRs (2026-10-09, about 02:15Z)

`origin/main` has not moved since the branch was cut (a58be34), so there is nothing to merge in.
Phase 24's branch moved from e365153 to 3bcedec (46 commits) and Phase 22's from 8b92ac6 to ca52b96.
Read again by their words, with the diff of briefs 109 and 111 since the freeze:

* **One seam grew, no rule changed.** Phase 24a's W-85 now also edits
  `scripts/lib/accept-docker.mjs` and `scripts/lib/accept-constants.mjs` in bb2dash-stack, the two
  files where this phase's W-83 gave `apply` its place in the run's command door. The rule in both
  briefs already covers it: this phase's PR there merges first, and W-85 then merges that `main`
  and keeps both sets. W-85's two new host actions name two ingest services, each by name.
* Brief 111 did not change in any row this phase cites.
* On its branch so far Phase 24a touches one file this phase also touches, `DATA_SYNTAX.md` (its
  Workspace section; this phase's is "Inbox apply: holds, two-step filing, acceptance objects"): the
  second to merge keeps both. Phase 22 touches the test line of `scripts/package.json` (the seam
  found at the freeze) and its own `web/test/walk22-lib.test.ts`, which must learn
  `web/e2e/accept23.spec.ts` in Phase 22's merge of `main`.

## Task 19: both PRs open (2026-10-09, about 02:20Z)

* **W-83's round 3** (bb2dash-stack `fix/phase23-followups` at c1f1ea4): D-1 to D-6 fixed, tests
  first. For `apply` the whole command must equal one of three forms built from the same definition
  the actions use; `cp apply:...`, `--scale=apply=3`, `-p`, `-f` and a second `--profile` are
  refused. The full suite, by the worker: **346 pass, 0 fail, 0 skipped**.
* **`accept 23 --check` against the two branches** (the pack is not on `main` yet, so
  `ACCEPT_BB2DASH_DIR` named this worktree and `--ref` its head, 9f51164; run from
  `bb2dash-stack-wt-23f`, with no walk box and no acceptance run open): **exit 0**, "nothing was
  started, stopped or written". It printed the nine stages in order (`prepare`, `ready`, `walk`,
  `walk-proofs`, `stop`, `offline`, `start`, `back`, `file`), `apply-idle` before `apply.stop`, and
  the five rows a run does not do (three his, two waived). It says itself that such a run would not
  count: the commit is not `origin/main`'s. The counting check and run come after the merge and the
  cut-over (task 21).
* **PRs:** bb2dash [#85](https://github.com/emstacho-su/bb2dash/pull/85) (Vercel's preview check
  passes; `MERGEABLE`) and bb2dash-stack #6.
* **Seen and not this phase's:** the first try of the check was refused by a failed `git fetch`
  ("Repository 'stack-dev-personal/bb2dash-stack' is disabled"); a minute later the fetch worked.
  GitHub now reports both repositories under the organization `stack-dev-personal`
  (`gh api repos/emstacho-su/bb2dash` answers `stack-dev-personal/bb2dash`, public;
  `bb2dash-stack` private). The old `emstacho-su` addresses still resolve for git, for raw files and
  for the pull requests, and no remote was changed by this session. Told to Stack.

## Task 20: the cut-over (2026-10-09, 04:26Z to 04:35Z)

On Stack's word of 2026-10-09 ("Once these are complete merge 87 and cut over"). Before each step that
touches prod or a container: no request queued or claimed in `agent_requests`, the answered queue
empty, no acceptance lock, no `bb2dash-walk22-...` box in `docker ps`.

| Step | What was done | What was read back |
|---|---|---|
| The merges | bb2dash #85 `696d35e`, bb2dash-stack #6 `0fd659f`, then the units PR #87 `c19cd9a` | Both main checkouts fast-forwarded and clean. `main` had also moved by #86 (Phase 24a's test port): `git diff 696d35e c19cd9a` names nothing under `apply`, `workspace`, `mcp-server`, `docker`, `skills` or `compose.yaml` |
| Skills | `node scripts/install-skills.mjs` from the shared checkout | `bb-sync/SKILL.md`, `inbox-apply/SKILL.md`, `inbox-apply/writer.md` updated; a second run reports them in sync |
| His `.env` line | **Not done: his file.** | `docker compose config --services` from bb2dash-stack lists `harness-jobs`, `sync`, `workspace` |
| `apply` | `docker compose --profile apply up -d --build --no-deps apply` from bb2dash-stack's `main` | Image `535b7075cb79`, healthy since 04:28:44Z, log line "db: connected as inbox_apply_runner". `sync` is the same container as before (started 2026-10-08 15:15:32Z) |
| 188 | `apply_migration`, name `188_transform_archived_answers`, the file's text | Version `20261009043022`. SHA-256 of the recorded statement = the file's, `b4cbfaaabc36f4c997d6f8c4359bfa3c5838d5957082bd49ffe083607c4ac387`. 14 session answers carry `applied_at`, all 14 stamped by this apply. `phase23_188_archived_answers` PASS; the whole suite 81 of 82 (`phase18_post_embed_checks` fails on file 2851's nine units, which are not embedded) |
| The task | `scripts/register-exports.ps1`, first with `-SecretsDir` naming a folder that does not exist, then with the real folders | First: exit 2, "is not an existing folder", no task. Then: `Bb2dash-Exports` registered, 2 triggers (logon; every 6 h), action is `powershell.exe` hidden running `node scripts/exports-run.mjs` from the shared checkout |
| The first export | `Start-ScheduledTask` | `LastTaskResult` 0. `state.json`: started 04:34:34Z, ended 04:34:55Z, exit 0, `inbox-decisions` filed 16, skipped 0, not filed 0. On prod: 0 archived decisions unfiled, 16 with a note path, 16 listed by `inbox_decisions_unlogged` (no day file yet, which is `just file-decisions`), item 3782 skipped |
| `just doctor` | from bb2dash-stack's `main` | `exports` "last run 13s ago, exit 0, 16 filed". `apply` is a problem: "off, but a container of apply is running", which is the missing `.env` line. The three other problems are the vaults' uncommitted entries and the harness doctor, not this phase's |
| `just accept 23 --check` | from bb2dash-stack's `main` | Passes: bb2dash at `c19cd9a` (origin/main), "a green run would count as acceptance", nine stages listed, five rows not done by a run |
| `just accept 23` | **Not started.** | Its `ready` stage reads `apply.doctorRow`, which is a problem until the `.env` line is in |

Seen on the way: Vercel's production is still the build of `a58be34` (#83), because its GitHub App is not
installed on `stack-dev-personal`. `git diff a58be34 c19cd9a -- web` outside the tests names two files:
`queries.grade-model.ts` (four lines) and the generated types. The run's `base_url` therefore serves the
Inbox the pack expects.
