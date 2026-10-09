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
