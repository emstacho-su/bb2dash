# Phase 15 — Database hygiene and the SQL test runner

Date 2026-09-24 · PM: the Fable session · Product manager: Stack
Requirements: R-78, R-79, R-80, R-54 (no S2 item of its own; R-54 and R-78 are filed under Stack's S2-bugs-1, which Phase 17 owns)
PM-added steps: P-2, P-8, P-18, P-30, P-31, P-99, P-100, P-101
Branch `feat/db-hygiene-15` · Worktree `bb2dash-wt-15` · Migration range **100–104** · One PR per phase (no exception taken)
Size S/M · Depends on nothing; runs first (94 §2 rule 1) · Nothing visual: no route, no screen, no Vercel preview walk
Status: **PROVISIONAL until Stack answers 93 §5** (B-41, B-42, and B-16 for the migration numbering) and approves `94_SPRINT2_PHASES.md`.
DECISIONS 2026-09-24 governs every default in this brief: "a brief may not cite a default as decided before then". Each
default is marked **PROVISIONAL** where it is used, including the PM's own calls below.

B-numbers are the item numbers of `93_SPRINT2_RESEARCH_SYNTHESIS.md` §5. Prod facts below were re-read on 2026-09-24
(SELECT only): latest migration `090_attention_archive`; 7 public functions without a pinned `search_path`, none
extension-owned; 15 foreign keys without a covering index; 4 unused non-unique indexes; `planner_event_series` 0 rows,
0 orphans; `postgres` holds `bypassrls`, `createrole` and admin option on `anon`, `authenticated`, `service_role`.

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-16, B-41, B-42), every one resolved to its default. The phase's PM strikes PROVISIONAL where a row says default and rewrites the B-table row where it says changed, at the session's start (ORCHESTRATOR §6).

## Why

Sprint 1 left the database's own checks half done. `db/tests/` holds 17 test files and 2 generated loaders. Fourteen
of the tests say "RUN IT: paste the whole file into one `execute_sql` call" and the other three say "RUN IT" after their
loader; the suite has never run as a set, and two files are red on today's prod. `phase10a_stage_gradebook.sql` fails because its fixture crawl is dated 2026-09-14 and four newer
registered crawls now trip 087's newest-run guard (P-30). `phase10b_grade_model.sql` fails because it inserts a link
that already exists and expects `_3569973_1` unlinked (P-2). No script runs the files. No credential is held for one,
and no `pg` module or `psql` is on this machine (R-79, P-31). The security advisor still shows three kinds of warning,
the oldest seen since 2026-09-10: 7 functions with a mutable `search_path`, 2 SECURITY DEFINER functions callable by
`authenticated`, and leaked-password protection off. The performance advisor shows 15 unindexed foreign keys and 4 unused indexes. None
of these is recorded as fixed or accepted (R-78, R-80). The 12b tail walk found that a planner series row outlives its
last occurrence when that occurrence is deleted outside the series RPCs (finding W-3, R-54).

This phase goes first because it is small and the other phases need it. The runner and its role are the seam that
Phase 16's V-1 invariants, Phase 14's negative-grant tests, Phase 18's post-embed checks and Phase 19's `stage_content`
tests all land on (94 §3). Each of those arrives as a `db/tests` file that has to run from disk in one command and fail
loudly. The `search_path` pin is one migration in 038's shape. The trigger is one migration with its own test.

The research recommends the method (92 db-hygiene-tests; 93 §1.5). pgTAP is not adopted (B-42's default,
**PROVISIONAL**): it would put about fifty functions on the PostgREST surface. `supabase test db` wants the local
stack D-20 declines. The runner is a small node-postgres CLI that keeps the repo's own convention (`raise exception 'FAIL …'`, `begin … rollback`). It must
connect directly or through the **session** pooler, never the transaction pooler on 6543, because four files
(`phase10b_grade_model`, `phase12b_076_…`, `phase12b_082_083_…`, `phase12b_089_…`) `set local role` mid-transaction,
eight switches in all, into `anon` or `authenticated` only. (91 and 93 count nine switches in five files; the fifth,
`phase10a_stage_attempts.sql:323`, is a comment. Grep of `main` a5042fa, 2026-09-24.) The research also corrected
two figures: unused indexes are **4**, not 5, and the org is on the **Free** plan.

## Stack's calls this brief rests on

| B | Question (93 §5) | Default taken (93 §5, verbatim) | Tasks that change if Stack answers otherwise |
|---|---|---|---|
| B-41 | Leaked-password protection (Q32) | "the org is on the Free plan; record it as accepted, stay on Free." **PROVISIONAL** | If he moves to Pro: task 19 expects `auth_leaked_password_protection` = 0 after his dashboard toggle; task 23's leaked-password row records the toggle, not an acceptance. Task 20 stays. Acceptance step 5 then expects no leaked-password line, and the MVP's leaked-password clause is struck. |
| B-42 | A database credential for the test runner (Q33) | "yes; a direct or session-pooler connection string (never the transaction pooler) in a gitignored `.env.local` as `BB2DASH_TEST_DB_URL`, for a dedicated `db_test_runner` role; pgTAP is not adopted." **PROVISIONAL** | **No credential:** tasks 4, 5 and 7 drop and migration 100 stays free. The live runner checks of tasks 6 (`passes.sql`, `fails.sql`), 9–15, 17 and 25, the DoD's `node scripts/db-test.mjs` gate and acceptance steps 2–4 change: each live run becomes one `execute_sql` paste per unit (a loader and its test file together), each expecting its `: PASS` row (its `FAIL …` exception where the row expects RED or runs `fails.sql`); step 2's `--ping` and task 25's `db-test: passed 21` grep have no paste form and drop. R-79 then closes as the runner and its offline checks (tasks 1–3, plus task 6's `commits.sql` case), with the suite pasted through MCP, and the one-command live run moves to Phase 14's dev container (B-48, **PROVISIONAL**). **An owner-level DSN instead of the role** (also open item 1's fallback if the platform refuses `bypassrls`): migration 100 (task 4) and task 7 drop, 103 and 104 cannot arise, row 5 records P-100 as not built, task 5 and step 2 expect `db-test: connected as postgres`, and step 1 writes the owner DSN into `.env.local` instead of setting a role password. **In both branches** task 7's file is never written, so wherever a check survives: every "21" becomes "20" (task 17, the DoD's runner gate, step 3, task 25, the MVP, R-79's proof line), task 17's `ls` count becomes 22, task 3 stays at 17, and task 21 and the DoD's migration line expect the two files 101 and 102 (counts 2, order `101_search_path_pin,102_planner_series_orphan_trigger`). **pgTAP:** this brief is re-cut. |
| B-16 (numbers only) | V-1's migration number | "a sprint-2 number in the grades phase's range; 059 stays unused (a 059 applied after 090 would replay out of order)." **PROVISIONAL** | Phase 15 only records the sprint-2 allocation (task 21, P-18). A different allocation changes that row and 94 §1, not any file here. |

PM calls taken without a question (DECISIONS 2026-09-23, "proceeds on stated defaults"), recorded in the rows under
§Contract. They are 91's stated defaults, not 93 §5 items, and they are **PROVISIONAL** all the same (DECISIONS
2026-09-24) until Stack reads the rows in the PR:

* `calendar_push_now()`'s WARN is recorded as accepted (Phase 11's R2-3). No revoke: it is owner-guarded inside, and
  nothing in the app calls it.
* The two FTS indexes are kept, not dropped. Dropping them would need an explicit exception to the additive rule.
* The two 057 policies that call `app_owner()` without a subquery wrap are left alone. They are not an advisor finding
  (91 R-80 notes). The R-80 row names them as a known leftover.

## Contract (frozen when Stack approves the phase plan)

### Routes and screens

None. No web, desktop or MCP source file changes. The only file under `web/` that changes is the drift-guard test
`web/test/fixtures.phase10a.test.ts`. R-54's browser proof is walked in Phase 17, not here.

### RPC signatures, functions, the role, and the runner's command contract

**No new RPC.** No `database.types.ts` change.

| Object | Full signature | Security | Grants | Migration |
|---|---|---|---|---|
| `public.planner_events_delete_empty_series()` **new** | `create function public.planner_events_delete_empty_series() returns trigger language plpgsql set search_path = public, pg_temp` | SECURITY INVOKER (runs as the deleting session, so 082 §5's owner-only RLS on `planner_event_series` applies) | `revoke all on function public.planner_events_delete_empty_series() from public, anon, authenticated` (082:215's pattern) | 102 |
| trigger `planner_events_delete_empty_series` **new** | `create trigger planner_events_delete_empty_series after delete on public.planner_events referencing old table as old_rows for each statement execute function public.planner_events_delete_empty_series()` | — | — | 102 |
| seven existing functions **changed (config only)** | `alter function … set search_path = public, pg_temp` on `public.set_updated_at()`, `public.classify_bb_file(text, text, text)`, `public.bb_file_relpath(bigint)`, `public.suggested_start(text, date, numeric)`, `public.search_file_text(text, text, integer, boolean)`, `public.match_file_text(extensions.vector, text, text, integer, boolean)`, `public.hybrid_search_file_text(text, extensions.vector, text, text, integer, integer, double precision, boolean)` | unchanged (all SECURITY INVOKER) | unchanged | 101 |

**The trigger body** does one statement and returns `null`:
`delete from public.planner_event_series s where s.id in (select distinct o.series_id from old_rows o where o.series_id is not null) and not exists (select 1 from public.planner_events e where e.series_id = s.id)`.
It ignores nulls, never raises, and matches zero rows without complaint. In `planner_series_delete`, the trigger
fires at the end of the inner delete. If that delete empties the series, the RPC's own series delete then matches 0
rows. If rows remain ("all" with past occurrences), the trigger leaves the series and the RPC deletes it as before.
`planner_series_update` empties a series by UPDATE, which the trigger does not see, so its TR-4 delete is unchanged
(088:161-164). It never cascades, and a series with rows left is never touched.

**The role `db_test_runner` (migration 100).** (B-42, **PROVISIONAL**.) The file carries no password, ever.
`create role db_test_runner with login bypassrls nosuperuser nocreatedb nocreaterole noreplication connection limit 2`;
`alter role db_test_runner set statement_timeout = '60s'` and `set idle_in_transaction_session_timeout = '30s'`;
`grant anon, authenticated to db_test_runner with inherit false`, so it can `set local role` into either but inherits
neither. It gets `usage` on schemas `public` and `extensions` (the two vector search functions, `match_file_text` and
`hybrid_search_file_text`, resolve `operator(extensions.<=>)` as the caller; the `extensions.cosine_distance(vector,
vector)` behind that operator keeps `PUBLIC` execute, prod 2026-09-27, so no execute grant in `extensions` is needed),
`select` on all tables and views in `public`, and `alter default privileges
for role postgres in schema public grant select on tables to db_test_runner`. It gets `insert, update, delete` on
exactly the tables the suite writes as the session role, `usage` on their sequences, and `execute` on exactly the
functions the suite calls as the session role. Those lists are enumerated in the file by identity signature and
derived from the 21 test units: today's 17, plus `run_transform(uuid, text)` and `transform_tick()` for P-8's file,
and `bb_file_relpath(bigint)` and the three search functions for 101's test. `BYPASSRLS` is needed because the files
write setup rows as the session role, the way they did as `postgres` through MCP. Role attributes are not inherited,
so membership in `service_role` would not give it `BYPASSRLS`. Four units (three files) create temp tables: the two
phase10a tests through `phase10a_load_fixtures.sql`, `phase12b_078_status_fold_and_auto_graded.sql`, and
`phase12b_085_stage_attempts_v4.sql` through `phase12b_load_fixture.sql`. `temporary` on the database comes from
`PUBLIC` (prod 2026-09-24: `has_database_privilege('anon', current_database(), 'TEMP')` = true), so 100 grants nothing
for it. The role is granted nothing directly on `vault`, `storage`, `auth`, `cron` or `net`. `PUBLIC` holds no usage on
the first four (prod 2026-09-27), so the role itself has none; after `set local role` it has only what `anon` or
`authenticated` has. `net` is reachable through `PUBLIC`, as task 7
records: its ACL grants `PUBLIC` usage and its 12 functions, `net.http_post` among them, keep the default `PUBLIC`
execute (prod 2026-09-27). Closing that would mean revoking `PUBLIC`'s usage on `net`, a wider change this phase does
not take. It is not a member of `service_role`, `postgres`, `authenticator`, `pg_read_all_data` or
`supabase_privileged_role`, and it cannot execute `calendar_secrets()` or `calendar_secret_set(text, text)`. A guard
block at the foot of 100 raises if any of these is false. The guard checks that no `aclexplode(nspacl)` entry on the five
schemas names `db_test_runner`, that `has_schema_privilege('db_test_runner', s, 'USAGE')` is false for `vault`,
`storage`, `auth` and `cron` (for `net` it is true through `PUBLIC`, and the guard does not test it), that none of the
five memberships exists, and that neither Vault RPC is executable. It is a separate and broader credential than Phase
14's `sync_runner`.
`sync_runner` never holds `db_test_runner`'s grants; `db_test_runner` reaches `sync_runner` only by `set local role`
inside a rolled-back unit (brief 100's 094, **PROVISIONAL**).

**The runner `scripts/db-test.mjs`** (Node 22+, one dependency `pg`, pinned exact in `scripts/package.json` with a
committed lockfile; install with `npm --prefix scripts ci`).

| Command | Does | Output (frozen) | Exit |
|---|---|---|---|
| `node scripts/db-test.mjs` | runs every unit in `db/tests/` in name order | one line per unit: `PASS  <file>` or `FAIL  <file>  <first line of the server error>`; last line `db-test: passed <p>, failed <f>, units <n>` | 0 iff `f = 0`; 1 if any FAIL; 2 on usage, config, lint or connection error |
| `node scripts/db-test.mjs --only <file.sql>` | runs one `db/tests` file (with its loader, if it has one) | same | same |
| `node scripts/db-test.mjs --file <path.sql>` | runs one file from anywhere (the fixtures under `scripts/fixtures/db-test/`) | same | same |
| `node scripts/db-test.mjs <path.sql>` | the positional form of `--file`, the runner's own convenience: no sibling brief uses it (briefs 96, 97, 98, 100 and 102 call `--only <basename>` or the full suite); a path under `db/tests/` that the loader map names also gets its loader | same | same |
| `node scripts/db-test.mjs --list` | prints the plan without connecting | one line per unit: `unit <NN>  <file>` or `unit <NN>  <loader> + <file>` | 0 |
| any of the above, on a unit that fails lint | refuses before connecting | `db-test: lint <file>: <rule broken>` | 2 |
| `node scripts/db-test.mjs --ping` | connects, prints the role | `db-test: connected as <current_user>` | 0 or 2 |

* **Units.** A unit is a test file, or a loader followed by its test file sent as one text. The loader map is frozen
  as a constant: `phase10a_load_fixtures.sql` before `phase10a_stage_gradebook.sql` and before
  `phase10a_stage_attempts.sql`; `phase12b_load_fixture.sql` before `phase12b_085_stage_attempts_v4.sql`. Loader files
  never run alone. `<file>` in every output line is the file's basename, whichever form named it.
* **Pass rule.** A unit passes only if the server raises nothing **and** one result row's first column ends in `: PASS`.
  Today all 17 files end that way; every new file must too.
* **Lint, before connecting (exit 2).** Comments and dollar-quoted bodies are stripped first. The unit must then begin
  a transaction with `begin;` as its first statement, end with `rollback;` as its last, and contain no top-level
  `commit` or `end` statement. A file that fails lint never reaches prod.
* **One connection.** One `pg.Client` (never `Pool.query`, per node-postgres's transaction docs) runs each unit as one
  simple-protocol query. On an error the runner sends `rollback` and goes on to the next unit. One broken file never
  hides the rest.
* **Credential** (B-42, **PROVISIONAL**). `BB2DASH_TEST_DB_URL` is read from the process environment, or else from `.env.local` at the root of
  the checkout the script lives in (`process.loadEnvFile`; this laptop runs Node v24.13.0). The canonical copy is
  `C:/Users/stack/projects/bb2dash/.env.local` in the main checkout (acceptance step 1); worktrees hold copies. A DSN on port 6543 is
  refused with exit 2. No output ever contains the DSN or its password; every error message is redacted.
* **Exports.** Importing the module has no side effects. `loadDsn()` and `openClient()` are exported so a later Node
  script reuses this credential rather than adding a second one. None is planned: Phase 16's P-67 checker is
  `scripts/v1_recheck.py` (brief 96, Python), which emits `db/tests/phase16_106_v1_recheck.sql` for this runner to run.

### Tables and migrations

Additive only: no drop, no rename, no function body change. Each file gets a `begin; … rollback;` dry run first. It is
then applied with `apply_migration` under the file's name, and the repo file stays byte-identical to what was applied.
Apply order is 100, then 101 and 102, then 103 if it is needed, then 104 if a grant gap is found after 103 is on prod,
so that prod order equals name order.

| No. | File | Creates / changes | Owner |
|---|---|---|---|
| 100 | `db/migrations/100_db_test_runner_role.sql` | login role `db_test_runner` as above (no password): `usage` on `public` and `extensions` only, its table, sequence and function grants, memberships `anon` and `authenticated` (inherit false), and the guard block | W-38 |
| 101 | `db/migrations/101_search_path_pin.sql` | a 038-shaped `do $$ … foreach … execute format('alter function public.%s set search_path = public, pg_temp', f) … $$` over the seven signatures, plus a guard that raises if any non-extension function in `public` has no `search_path=` entry in `proconfig` (036's guard shape) | W-40 |
| 102 | `db/migrations/102_planner_series_orphan_trigger.sql` | function + statement trigger as above | W-40 |
| 103 | `db/migrations/103_db_test_runner_grants.sql` | **only if** a live check finds a grant 100 missed (a worker's, tasks 7–15, or integration's, task 17). W-38 writes and applies it as soon as one is reported, never before 102 is on prod, and 100 stays byte-frozen. A worker blocked on a grant records its FAIL line in its note, moves to its next row, and reruns the blocked row once 103 is on prod. A gap first reported after 103 is on prod goes in 104, never into 103, which is then byte-frozen too | W-38 |
| 104 | `db/migrations/104_db_test_runner_grants_2.sql` | **only if** a live check finds a grant gap after 103 is on prod (a later worker row, or integration's task 17). Same rules as 103: W-38 writes and applies it as soon as one is reported, 100 and 103 stay byte-frozen, and a blocked worker reruns its row once 104 is on prod. It is the range's last number: a gap found after 104 is on prod stops the PM, who brings its FAIL line to Stack | W-38 |

No table is created or altered. `grade_scenarios` stays in the DB unused (D-11). Pinning a SQL function stops Postgres
from inlining it. The re-time in task 16 covers `hybrid_search_file_text`. `suggested_start` (read by `v_work_items`)
and `classify_bb_file` (called in `stage_files`) run on tables under 300 rows, and that cost is accepted in the R-78
row.

### Files

New:

| Path | Owner |
|---|---|
| `scripts/db-test.mjs`, `scripts/db-test.test.mjs`, `scripts/package.json`, `scripts/package-lock.json` | W-38 |
| `scripts/fixtures/db-test/passes.sql`, `scripts/fixtures/db-test/fails.sql`, `scripts/fixtures/db-test/commits.sql` | W-38 |
| `db/tests/README.md` (how to run, the loader map, the pass and lint rules; naming `phaseNN_NNN_name.sql`, or `phaseNN_name.sql` for a file with no migration of its own, as a convention, not a lint rule) | W-38 |
| `db/migrations/100_db_test_runner_role.sql`, `db/tests/phase15_100_db_test_runner_role.sql` (and 103, then 104, if needed) | W-38 |
| `db/tests/phase9_transform_states.sql` | W-39 |
| `db/migrations/101_search_path_pin.sql`, `db/migrations/102_planner_series_orphan_trigger.sql` | W-40 |
| `db/tests/phase15_101_search_path_pin.sql`, `db/tests/phase15_102_planner_series_orphan.sql` | W-40 |
| `docs/planning/sprint-2/verification/95a_W38_VERIFICATION.md`, `95b_W39_VERIFICATION.md`, `95c_W40_VERIFICATION.md` (the `verification/` folder is new; absent on the planning branch 2026-09-24) | each worker its own |
| `docs/planning/sprint-2/walks/walk-15/95w_PHASE15_WALK.md`, `docs/planning/sprint-2/walks/walk-15/01-auth-signups-off.png` (the `walks/` folder is new) | PM (the PNG from Stack's screen) |

Changed:

| Path | What | Owner |
|---|---|---|
| `.env.example` | one line `BB2DASH_TEST_DB_URL=` (empty) | W-38 |
| `db/fixtures/phase10a/build_load_sql.js` | `captured_at` emitted as a `now()`-relative SQL expression that keeps the three shells' order and spacing | W-39 |
| `db/tests/phase10a_load_fixtures.sql` | regenerated by `node db/fixtures/phase10a/build_load_sql.js`, never hand-edited | W-39 |
| `db/fixtures/phase10a/README.md` | one paragraph: dates float with `now()` | W-39 |
| `web/test/fixtures.phase10a.test.ts` | drift guard stays byte-for-byte on the generated text; new case: no quoted timestamp literal feeds `captured_at` (P-101) | W-39 |
| `db/tests/phase10b_grade_model.sql` | lines 171–172: its own `test10b:`-prefixed or conflict-safe seed; §4f: reads `_3569973_1`'s current link state into a variable and asserts relative to it. Lines 167–168 (the GEO recitation seed) are not W-39's: brief 96's task 10a (W-42) makes them conflict-safe on top of this edit, and the PM cherry-picks that one-file commit onto `feat/db-hygiene-15` (§Seams, Phase 16) | W-39 (lines 167–168: brief 96's W-42, carried by the PM) |
| `DATA_SYNTAX.md` | the **Recurrence** paragraph (line 132) gains one sentence on the trigger | W-40 |
| `project-state/STATUS.md`, `project-state/DECISIONS.md`, `project-state/ORCHESTRATOR.md` | PM only, in the PR | PM |

The worker sets are disjoint. The one sequenced exception is `db/tests/phase10b_grade_model.sql`: W-39's P-2 edit
lands first, then brief 96's task 10a commit (lines 167–168 only), which the PM carries onto this branch. No worker
touches `project-state/`. The 17 existing files keep their "RUN IT" headers,
and the README supersedes them.

### Seams

| With | The seam |
|---|---|
| Phase 16 | V-1's invariants (B-14, **PROVISIONAL**: "the invariants filed in `db/tests` (rerun by the suite, not wired into the sync)") and P-67's generated `db/tests/phase16_106_v1_recheck.sql` run through `scripts/db-test.mjs` as `db_test_runner`, in the `--only <file.sql>` form brief 96 writes. Brief 96's files are `grading_invariants.sql`, `phase16_105_pre_sitting_fixes.sql`, `phase16_106_grading_reconciliation.sql` and `phase16_106_v1_recheck.sql`; each must end in a `: PASS` row and pass lint. Any grant they need beyond 100's goes in 96's reserved `db/migrations/107_db_test_runner_grants_phase16.sql`, never through `service_role` membership. **The conflict-safe seed** (brief 96 §Seams, its Phase 15 row, and §Task list task 10a): 105's GEO recitation link shares its primary key with `phase10b_grade_model.sql`'s seed at lines 167–168, which P-2 leaves alone, so a plain insert there raises `unique_violation` once 105 is on prod. W-42 edits those two lines on top of W-39's P-2 commit, and the PM cherry-picks that commit onto `feat/db-hygiene-15`, pushes it and names it in this phase's PR body, before brief 96's task 10 applies 105; brief 96's task 10a check (a) then reruns `--only phase10b_grade_model.sql` on `feat/db-hygiene-15` → pass. The new text holds with and without 105, so this brief's task 10 check is unchanged. If this phase merges without it, brief 96's PM asks Stack before its task 10. |
| Phase 17 | Walks R-54's browser proof (brief 97, T-26): a detached last row's plain delete, then "This event" on the last attached row, then the orphan `SELECT` returns 0. The rows are labelled and deleted in the same sitting (DECISIONS 2026-09-16). R-41's run states on Home are the states P-8's file proves. |
| Phase 18 | P-24's post-embed checks are one `db/tests` file run by the runner. Grants beyond 100 go in its 120–129 range (brief 98 reserves 128). 121 copies 101's `search_path` value onto the search functions it replaces. |
| Phase 19 | Its `stage_content` and register-first tests run through the runner. `phase9_transform_states.sql` must stay PASS after its driver change, and the `interrupted (reaped)` note text is what the file asserts. |
| Phase 14 | Its negative-grant tests for `sync_runner` run through the runner and read `has_function_privilege('sync_runner', …)` / `has_table_privilege('sync_runner', …)`. Its privilege reads need no membership. Its behaviour tests use `set local role sync_runner`, which brief 100's `094_sync_runner_test_membership.sql` (**PROVISIONAL**, its open item 6) grants to `db_test_runner` with inherit false. W-55 adds one loader-map entry (`phase14_load_crawl_v4.sql` before `phase14_091_sync_runner.sql`). Brief 100 runs them with `--only phase14_091_sync_runner.sql`. **Replay order:** 091–099 are likely applied after 100–104 (Phase 14 starts beside 15, but its spike gates its first migration; B-4, **PROVISIONAL**) and replay before them by name, so no 091–093 file may reference `db_test_runner` or the 102 trigger; 094 is the one exception and replays after 100. The runner is a plain CLI that runs unchanged in the dev container (B-48's default, **PROVISIONAL**) with `BB2DASH_TEST_DB_URL` from `secrets/`. |
| Phases 14 and 21 (memberships) | `db/tests/phase15_100_db_test_runner_role.sql` asserts `db_test_runner`'s memberships as exactly the roles granted so far (`anon`, `authenticated`, inherit false), and every later migration that grants it a further membership (094 in brief 100 / Phase 14, `sync_runner`, an edit its §Workers gives W-55 as task 7a; 142 in brief 102 / Phase 21, `workspace_runner`, an edit its §Workers gives W-63 with task 6) extends that expected list in the same PR. |
| Sprint 1 objects | 036's view guard and 038's revoke loop are the shapes 101 reuses. 082's function conventions carry over. 083/088's RPCs keep their TR-4 delete (0 rows after a delete that emptied the series; unchanged in `planner_series_update`). 087's newest-run guard is unchanged: the fixture moves, not the guard. `queries.plannerSeries.ts:411-415` `deleteOpenedRow` runs after `series_id` is already null, and the trigger ignores nulls. Every unit rolls back, so the calendar push cron (`1-59/2`) and `transform_tick` never see a test row. |

### Must respect (verbatim)

* [2026-09-10] "Parallel phases get **non-overlapping migration ranges** (Phase 8 = 026–029, Phase 9 = 030–039) allocated in the briefs"
* [2026-09-22] "**Sprint 2 planning follows the Phase 12b method** (list → ids → triage → researchers → one question batch → briefs); migration numbering continues from 091"
* [2026-09-23] "**Sprint 2 planning proceeds stage to stage without a stop**; the PM stops only where Stack's input is required (his §3 fields, the question batch, the phase-plan approval) and otherwise proceeds on stated defaults, each recorded here when adopted"
* [2026-09-14] "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* [2026-09-10] "`public.app_owner()` resolves the owner **by email** (`emstacho@syr.edu`) via a SECURITY DEFINER lookup on `auth.users`, NOT a hardcoded uid" — Why cell: "Trade-off: a new advisor WARN (authenticated can call the SECURITY DEFINER `app_owner` via RPC) — accepted; the grant is required for policy evaluation and the function only returns the owner's own uid"
* [2026-09-10] "RLS hardened to owner-scoped (migration 020): 21 `using(true)` authenticated policies → `auth.uid() = public.app_owner()`; storage `bb_files_auth_all` ANDed with the owner check; anon INSERT paths + service_role bypass preserved"
* [2026-09-10] "**All 15 public views are `security_invoker`** with anon revoked (migration 036, guard block refuses a future non-invoker view)"
* [2026-09-11] "SECURITY DEFINER transform functions are not callable by `authenticated` (038); the app's only path to a transform is an `agent_requests` row"
* [2026-09-15] "Google OAuth secrets live in **Supabase Vault** behind two service_role-only RPCs (`calendar_secret_set`, `calendar_secrets`)" (opening of the row)
* [2026-09-09] "Hub retrieval default: **hybrid** (RRF)"
* [2026-09-10] "Accepted +25% query time (≈22 → 27 ms, limit 12) for the ranked cover rule; the stored per-part `tsvector` that would remove it is backlog, not this phase" — Why cell: "well under the ~60 ms ceiling set for the palette"
* [2026-09-10] "Superseded files are dropped **before ranking** in all three search RPCs (`p_include_superseded boolean default false`); `search` v4 / MCP / web expose `include_superseded`, sent only when true"
* [2026-09-10] "The transform folds **only crawls registered on an owner-claimed `agent_requests` row** (`agent_requests.run_id`, migration 039); unregistered `bb_raw` runs are quarantined once, never folded; `bb_raw` unique on `(run_id, kind, bb_course_id)`"
* [2026-09-15] "Score-change counts (`scores_new`, `scores_changed`) are computed **only when the folded run is the newest registered crawl** (056, reusing 043's predicate); older runs report 0 with `older_run: true`"
* [2026-09-16] "The planner-event live proof ran on Stack's real `bb2dash` calendar with SQL-inserted `bb2dash test · …` rows, all deleted and pushed away in the same sitting (Google 64 = mirror 64 at the end); web workers never write `planner_events` on prod" — Why cell: "the push has no staging calendar; any row a dev server or script creates is on Stack's phone within two minutes"
* [2026-09-21] "**Recurring planner events are expanded in the web layer into ordinary `planner_events` rows** (082 `planner_event_series` holds only the rule; 083/088 RPCs write the rows the client sends). `calendar-push` and `v_calendar_push_items` are untouched; edits keep row ids so Google sees patches"
* [2026-09-21] "**A series rule (frequency, end date) is not editable after creation; Repeats is offered on create only.** To change it: delete "this and following", create a new series. Weekly = same weekday; monthly = same day-of-month, a month without that day is skipped; 52 occurrences is a refusal, never a trim"
* [2026-09-21] "**"All events" means every occurrence from now on, plus the one Stack opened.** The client cuts the RPC scope 60 s ahead (`SERIES_SCOPE_SAFETY_MS`) and writes the opened occurrence itself when it falls outside; a series edit never changes any row's `done`; a save with no changed column writes nothing and does not detach"
* [2026-09-09] "Docker: skipped" · [2026-09-16] Why cell of the containers-direction row: "Narrows the 2026-09-09 no-Docker decision to development time only" · [2026-09-16] "**Phase 14 = R-28 containers, planned** (`82_PHASE14_containers.md`): portability first on this laptop; Supabase and Vercel stay managed, no local Supabase; …"
* [2026-09-16] Why cell of the 068 row: "A one-off exception to "migrations are additive", taken with a pre-flight that proved 64/64 hashes and event ids unchanged before and after — not a precedent"
* [2026-09-24] "STATUS's known-issue rows that sprint 1 fixed are struck through with the fixing migration named, not deleted"
* [2026-09-24] "No product call in them is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a default as decided before then"
* [2026-09-15] "workers build and test on fixtures cut from the 9/14 payloads plus a synthetic attempts payload in the frozen shape" (P-30 moves only `captured_at`; the payloads stay as cut)
* [2026-09-15] "The calendar push has **its own pg_cron job** (`bb2dash-calendar-push`, `1-59/2`) and its own `calendar_push_runs` table; a statement trigger on `assignments` marks `app_settings.gcal_dirty`; Phase 9's `run_transform` / `transform_tick` are not redefined"
* [2026-09-17] "Removed: what-if, target solver, saved scenarios (`grade_scenarios` stays in the DB, unused), placeholder rows, the two projections and the agrees-with-Blackboard sentence"
* CLAUDE.md (project SOP, not a DECISIONS row): "Migrations are additive and numbered (`db/migrations/NNN_name.sql`); apply to prod via `mcp__Supabase__apply_migration` with the same name, and keep the repo file byte-identical to what was applied."

### Decision rows this phase owes (PM, in the PR, dated the day Stack answers — 93 §6)

Each row carries one marker so task 23 can count it. Every row is **PROVISIONAL** until Stack answers: rows 2, 4 and 5
rest on B-41, B-16 and B-42; rows 1, 3 and 6 on 91's stated defaults (DECISIONS 2026-09-24).

1. `calendar_push_now` — R2-3 on record. The lint-0029 WARN is accepted: it is owner-guarded inside, it follows
   `app_owner()`'s pattern, and nothing in the app calls it (grep of `main` a5042fa). `phase15_101` proves a stranger
   uid is refused.
2. `leaked-password` — accepted on the Free plan (`get_organization` 2026-09-24: `free`). There is one owner account,
   and signups are off (task 20's screenshot). Revisit on Pro.
3. `bb_text_embeddings_hnsw` — R-80's INFO findings, accepted with their true reasons. The 15 foreign keys without a
   covering index wait until a slow query names one: each sits on a table under 300 rows (largest `bb_content`, 218;
   prod 2026-09-24), and 15 new indexes would come back as `unused_index` findings. Of the 4 unused indexes: `announcements_fts_idx` and `bb_content_fts_idx` back no current
   query and are kept for a future content or announcement search. `bb_text_embeddings_hnsw` serves only vector-mode
   `match_file_text` (hybrid computes distance per row) and growth. `bb_attempts_sync_run_idx` covers a foreign key,
   so dropping it adds a finding. The row also names the 057 policies as a leftover. W-34's "they back the search edge
   function" is not copied.
4. `100–104` — the sprint-2 migration ranges (P-18, B-16): 091–099 Phase 14; 100–104 Phase 15; 105–109 Phase 16
   (V-1's reconciliation takes a number here); 110–119 Phase 17; 120–129 Phase 18; 130–139 Phase 19; 140–149 Phase 21.
   059 and 070–072 stay unused. A phase that runs out takes the next free block of ten and records it. If 103 or 104
   was needed (a grant 100 missed), the row names it.
5. `BB2DASH_TEST_DB_URL` — the SQL test transport (B-42, 93 §6): the runner `scripts/db-test.mjs` over node-postgres,
   on a direct or session-pooler connection, never 6543, as `db_test_runner` (100). The password is set by hand and
   the DSN lives in the gitignored `.env.local`. pgTAP is not adopted.
6. `planner_events_delete_empty_series` — R-54's statement trigger (102): the rule that no series outlives its last
   occurrence now holds on every delete path, not only inside the RPCs.

## MVP (in Stack's words)

Stack's own words touching this phase are his S2-bugs-1 heading, "bug fixing" (91 §3.3, under "cleaning"). R-54 and
R-78 are filed under it. For R-54 there is also his recurring-events answer, as 80c records it (§Stack's answers,
2026-09-17, answer 15): "Recurring: daily / weekly / monthly, mandatory end date, ≤ 52 occurrences, deleting a series
leaves past occurrences — **and single-occurrence edit/delete ships with it, not later.**" A single-occurrence delete
that leaves an empty rule behind is the gap in that answer this phase closes (PM reading). His acceptance field for
S2-bugs-1 is still "_to confirm_", so everything below is **PM wording for Stack to confirm**, built from the B-41 and
B-42 defaults (**PROVISIONAL**): *One command on my laptop runs every database test against prod and ends "passed 21, failed 0"; a failing test makes it say FAIL and exit non-zero; nothing it runs stays in the
database. The security advisor no longer lists mutable search paths; what it still lists (two owner-guarded functions,
leaked-password protection on the Free plan) and the performance INFO list (15 foreign keys, 4 unused indexes) each
have a dated DECISIONS row that gives the true reason. Deleting the last occurrence of a repeating event leaves no
empty series behind.* (PM's wording, not a quote.)

## Definition of done

SOP gates:

- [ ] `node --test scripts/db-test.test.mjs scripts/google-consent.test.mjs` → 0 failures.
- [ ] `web/`: `npm run typecheck` exit 0; `npm test` → 0 failures, with a `Test Files` count ≥ 107 (main a5042fa: 107
      files match vitest's `test/**/*.test.{ts,tsx}`; task 18); `npm run build` exit 0 (only a test file
      changed, but the Vercel PR build runs anyway).
- [ ] `mcp-server/`: `npm run build` exit 0 and `node scripts/smoke.mjs` exit 0 (task 16). `desktop/` is untouched
      and not rerun.
- [ ] `node scripts/db-test.mjs` → `db-test: passed 21, failed 0, units 21`, exit 0 (task 17).
- [ ] `/code-review main high`: 0 CRITICAL and 0 HIGH findings left without outcome `fixed`.
- [ ] `/security-review`: **required** (a new login role, a stored database credential, grants, a security-lint fix).
      0 HIGH findings open.
- [ ] STATUS, DECISIONS (the six rows) and ORCHESTRATOR updated in the PR; the PR is open from `feat/db-hygiene-15`.
- [ ] No Vercel preview walk: nothing visual changes (R-54's browser proof is Phase 17's).
- [ ] Every row of §Task list passed its own check, with RED shown first where the row says so, and the evidence
      (command output, SQL result, screenshot path) is in the owner's note (95a, 95b, 95c) or in 95w.
- [ ] Migrations 100–102 (and 103, 104 if used) are byte-identical to what was applied (task 21's md5 pairs) and
      committed once (task 21's `git log` count).
- [ ] Workers committed and pushed per task on their own branches; nothing was committed to `main`.
- [ ] **Merge to `main` only on Stack's word** in that conversation; until then the PM stops at "ready when you say
      so" (CLAUDE.md Workflow SOP).

Stack's acceptance script (he walks it after the PR is open; the PM puts every command on his clipboard):

1. Once: run the PM's PowerShell snippet. It generates a random password locally, copies an `alter role
   db_test_runner password '…'` line for the dashboard SQL editor, and writes `C:/Users/stack/projects/bb2dash/.env.local`
   (the main checkout keeps the canonical copy) with the session-pooler DSN (user
   `db_test_runner.goultdzqcavefcgnifdy`, port 5432). Paste the line into an unsaved editor tab, run it, and close the
   tab. The password never passes through a chat. The PM then copies that file into `bb2dash-wt-15` and each worker
   worktree.
2. Steps 2–4 run from `bb2dash-wt-15`, where the PM has run `npm --prefix scripts ci`.
   `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner`.
3. `node scripts/db-test.mjs` → 21 `PASS` lines and `db-test: passed 21, failed 0, units 21`.
4. `node scripts/db-test.mjs --file scripts/fixtures/db-test/fails.sql` → one `FAIL` line, and the exit code is 1.
5. Supabase → Advisors → Security: no "Function Search Path Mutable"; the two SECURITY DEFINER lines and the
   leaked-password line remain (B-41, **PROVISIONAL**). Performance: 15 unindexed foreign keys and 4 unused indexes.
6. Supabase → Authentication settings: new-user signups are off. The PM saves the screenshot as `01-auth-signups-off.png`.
7. Read the six DECISIONS rows. Say "merge" (or name what is wrong).

What proves each item in scope:

* **R-78** — task 15: 0 unpinned public functions (7 today). Task 16: three search modes answer 200 and the hybrid median
  is ≤ 60 ms. Task 19: advisor 0 / 2 / 1 (the 1 rests on B-41, **PROVISIONAL**). Task 23: rows 1 and 2.
* **R-79** — task 17: `db-test: passed 21, failed 0, units 21`, exit 0.
* **R-80** — task 19: advisor INFO 15 + 4 by today's names. Task 23: row 3.
* **R-54** — task 13: `phase15_102` PASS after RED, TR-4 still PASS, prod orphan count 0.
* **P-2** — task 10. **P-8** — task 11. **P-18** — tasks 21 and 23. **P-30** — tasks 8 and 9. **P-31** — tasks 2 and 5.
  **P-99** — tasks 1 and 6. **P-100** — tasks 4 and 7. **P-101** — task 8.

## Task loops (the phase cycle; §Task list's rows are step 4)

In both tables below, `\|` is the markdown escape for `|`, whether a shell pipe or a literal pipe in a grep pattern.

| # | step | executable check | owner |
|---|---|---|---|
| 1 | Freeze: Stack's answers to B-41, B-42 and B-16 recorded; §Stack's calls rewritten to them; any task whose check changed shown to him | `grep -c "^\| B-[0-9]* .*Stack answered 2026-" docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md` → 3 (one per B row, each rewritten with the date he answered; 0 today) | PM + Stack |
| 2 | Worktrees: `bb2dash-wt-15` on `feat/db-hygiene-15` from `origin/main`, then the three worker worktrees in §Workers cut from it | `git worktree list \| grep -c "bb2dash-wt-15"` → 4 | PM |
| 3 | Spawn W-38, W-39, W-40 (Opus) with their disjoint file sets and task rows | `git ls-remote --heads origin "feat/db-hygiene-15-*" \| wc -l` → 3 after each worker's first push | PM |
| 4 | Per row of §Task list: check fails (RED, recorded in the owner's note) → build → the same check passes; a row that fails goes back to its owner, except a missing grant, which goes to W-38's 103, or to 104 once 103 is on prod (§Tables and migrations), while the blocked worker records its FAIL line and moves to its next row | every row's check passes as written | workers |
| 5 | Integrate and run every suite (tasks 17, 18) | task 17's and task 18's checks | PM |
| 6 | Gates, docs, PR (tasks 19–24) | tasks 19–24's checks | PM |
| 7 | Stack's acceptance run (task 25); merge only on his word | task 25's check; `gh pr view --json state --jq .state` → `OPEN` until he says merge | PM + Stack |

## Task list

Tasks 8–16 are written in parallel with 1–7. Their checks run once task 5 has put a DSN on the machine; the PM copies
the canonical `C:/Users/stack/projects/bb2dash/.env.local` (gitignored) into `bb2dash-wt-15` and each worker worktree. Commands run from the checkout root in Git Bash (`$?`), or in
PowerShell with `$LASTEXITCODE`. "runner → X" means that command's last line equals X (the `\|` escape is explained under §Task
loops). W-39 and W-40 merge `feat/db-hygiene-15` into their branches once the PM has
integrated W-38's tasks 1–4 there, so the runner is on disk before their first live check; until then they write files
and run only offline checks. Each worktree's `.env.local` copy is deleted with the worktree; the main checkout's copy
stays, since later phases run the suite on `main` (brief 98 §Task loops, row L2).

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | Runner core, RED first: plan builder (name order, frozen loader map, loaders never alone), lint (commit / top-level end / missing `rollback;` refused, dollar quotes stripped), DSN check (6543 refused), redaction, exit mapping (0/1/2), pass rule (`: PASS` row), the positional path as `--file` — pure functions with a fake client | R-79, P-99 | W-38 | `node --test scripts/db-test.test.mjs` → 0 failures (RED run with the stubs recorded in 95a first) | "The runner refuses a file that commits, and a transaction-pooler string, before it connects." |
| 2 | `scripts/package.json` + lockfile (`pg` pinned exact); `.env.example` line; `db/tests/README.md` | P-31, R-79 | W-38 | `npm --prefix scripts ci` exit 0; `grep -c "^BB2DASH_TEST_DB_URL=" .env.example` → 1; `git check-ignore -q .env.local; echo $?` → 0 | "The credential has one name and can never be committed." |
| 3 | `--list` over today's suite | R-79 | W-38 | `node scripts/db-test.mjs --list \| grep -c "^unit "` → 17 on W-38's branch before task 7 (18 after it); `… \| grep -c "phase10a_load_fixtures.sql + "` → 2; `… \| grep -c "phase12b_load_fixture.sql + "` → 1 | "Seventeen tests, three with their loaders in front." |
| 4 | Migration 100: dry run in `begin … rollback`, apply as `100_db_test_runner_role` | P-100, P-31 | W-38 | `select rolcanlogin, rolbypassrls, rolsuper, rolcreaterole, rolcreatedb, rolconnlimit from pg_roles where rolname = 'db_test_runner'` → `t, t, f, f, f, 2`; `select count(*) from supabase_migrations.schema_migrations where name = '100_db_test_runner_role'` → 1 | "The tests get their own login that can't create anything or read your Google secrets." |
| 5 | **Stack:** password + `.env.local` (acceptance step 1) | P-31 | Stack | `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner`, exit 0 | "The laptop can reach the test database as the test role." |
| 6 | Live exit contract on the three fixtures | P-99 | W-38 | `node scripts/db-test.mjs --file scripts/fixtures/db-test/passes.sql; echo $?` → `db-test: passed 1, failed 0, units 1` then 0; `fails.sql` → `db-test: passed 0, failed 1, units 1` then 1; `commits.sql` → one line starting `db-test: lint commits.sql:`, then 2 (task 1's unit test asserts no client was opened) | "A failing test is loud and non-zero; a committing file never runs." |
| 7 | `phase15_100_db_test_runner_role.sql`: attributes, memberships exactly the roles granted so far, `anon` and `authenticated`, each inherit false (a later membership migration extends this list in its own PR, §Seams), no `service_role`/`postgres`/`authenticator`/`pg_read_all_data` membership, 0 owned objects, no `CREATE` on `public`, the only schemas whose ACL grants it `USAGE` are `public` and `extensions` (`extensions` the only one besides `public`; `pg_catalog`, `information_schema` and `net` reach it through `PUBLIC`, prod 2026-09-27), `has_schema_privilege` false on `vault`, `storage`, `auth` and `cron`, no execute on `calendar_secrets()` / `calendar_secret_set(text, text)` | P-100 | W-38 | runner `--only phase15_100_db_test_runner_role.sql` → `db-test: passed 1, failed 0, units 1` | "The role's limits are a test, so they can't quietly widen." |
| 8 | P-30 + P-101: generator emits `now()`-relative `captured_at`; loader regenerated; guard case added | P-30, P-101 | W-39 | `cd web && npx vitest run test/fixtures.phase10a.test.ts` → 0 failures; `grep -c "'::timestamptz);" db/tests/phase10a_load_fixtures.sql` → 0 (3 today) | "The fixture no longer ages out when a newer sync lands." |
| 9 | The phase10a pair green on today's prod | P-30, R-79 | W-39 | runner `--only phase10a_stage_gradebook.sql` → `db-test: passed 1, failed 0, units 1`; same for `--only phase10a_stage_attempts.sql` | "The gradebook test that went red when newer syncs landed is green again." |
| 10 | P-2: rewrite `phase10b_grade_model.sql` lines 171–172 and §4f; lines 167–168 stay as they are (brief 96's task 10a, §Seams, Phase 16) | P-2 | W-39 | runner `--only phase10b_grade_model.sql` → `db-test: passed 1, failed 0, units 1` (RED before the edit recorded in 95b) | "The grade-model test reads today's links instead of September's." |
| 11 | P-8: `phase9_transform_states.sql`. A crafted payload makes one stage raise, so `run_transform` leaves `sync_runs.status = 'partial'` with exactly one `sync_stage_runs` row `failed`. A `running` row with `started_at = now() - interval '31 minutes'` reads `failed`, with notes ending `interrupted (reaped)`, after `transform_tick()`, whose result has `reaped` ≥ 1 | P-8 | W-39 | runner `--only phase9_transform_states.sql` → `db-test: passed 1, failed 0, units 1` | "A half-failed sync and a dead one are both proven to say so." |
| 12 | R-54 test first: `phase15_102_planner_series_orphan.sql` covers a detached last row's plain delete → 0 series; "This event" on the last attached row → 0; a series with rows left untouched; a stranger uid deletes nothing; `planner_series_delete` 'following' from the first occurrence and 'all' still return their counts | R-54 | W-40 | before 102: runner `--only phase15_102_planner_series_orphan.sql` → `db-test: passed 0, failed 1, units 1`, exit 1 (the detached-last-row case) | "The bug is reproduced as a failing test before it's fixed." |
| 13 | Migration 102 applied as `102_planner_series_orphan_trigger`, only after task 15 has applied 101 (§Tables and migrations) | R-54 | W-40 | runner `--only phase15_102_planner_series_orphan.sql` → `db-test: passed 1, failed 0, units 1`; runner `--only phase12b_082_083_planner_series.sql` → same (TR-4 under the trigger); `select count(*) from planner_event_series s where not exists (select 1 from planner_events e where e.series_id = s.id)` → 0; `select count(*) from pg_trigger where tgrelid = 'public.planner_events'::regclass and tgname = 'planner_events_delete_empty_series'` → 1 | "Deleting the last occurrence now takes its series with it." |
| 14 | Standing guards, RED: `phase15_101_search_path_pin.sql`. (a) 0 non-extension public functions lack `search_path`; (b) 0 public views lack `security_invoker`; (c) SECURITY DEFINER public functions executable by `authenticated` = exactly `app_owner()`, `calendar_push_now()`, and by `anon` = none; (d) under `set local search_path = ''`, `public.search_file_text`, `public.match_file_text` and `public.hybrid_search_file_text` each return ≥ 1 row for 'final exam date' and 'attendance policy' (vector from a stored `gte-small` embedding); (e) `public.bb_file_relpath(id)` equals its value under the default path; (f) `calendar_push_now()` as a stranger uid raises "only the owner" | R-78, R-79 | W-40 | before 101: runner `--only phase15_101_search_path_pin.sql` → `db-test: passed 0, failed 1, units 1`, and `node scripts/db-test.mjs --only phase15_101_search_path_pin.sql \| grep -c "FAIL 7 functions without search_path:"` → 1 (guard (a) raises `format('FAIL %s functions without search_path: %s', n, list)`) | "The advisor's warning is now a failing test in our own suite." |
| 15 | Migration 101 applied as `101_search_path_pin` | R-78 | W-40 | runner `--only phase15_101_search_path_pin.sql` → `db-test: passed 1, failed 0, units 1`; `select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')` → 0 (7 today) | "No function can be tricked into reading someone else's table." |
| 16 | Search after the pin: re-time and all three modes over HTTP | R-78 | W-40 | `explain (analyze, format json) select * from public.hybrid_search_file_text('final exam date', (select embedding from public.bb_text_embeddings where model = 'gte-small' order by id limit 1), 'gte-small', null, 12)` run 5 times through `execute_sql` → median `Execution Time` ≤ 60.0 ms (the 5 figures in 95c); `curl -s -o /dev/null -w "%{http_code}" -X POST https://goultdzqcavefcgnifdy.supabase.co/functions/v1/search -H "Authorization: Bearer $ANON_JWT" -H "Content-Type: application/json" -d '{"q":"attendance policy","mode":"fts"}'` → 200, and the same → 200 for `"vector"` and `"hybrid"` (`$ANON_JWT` = the legacy anon JWT from `get_publishable_keys`, public by design; `verify_jwt` refuses the `sb_publishable_` key); `npm --prefix mcp-server run build && node mcp-server/scripts/smoke.mjs` → exit 0 | "⌘K still answers in all three modes, well under its 60 ms ceiling." |
| 17 | Integrate W-38/39/40 into `feat/db-hygiene-15`; any missing grant a worker reported is already in 103 or 104 (W-38, §Tables and migrations); one first found here goes in 103 if 103 is not yet on prod, else in 104, before this check; one found after 104 is on prod stops the PM (§Tables and migrations, 104) | R-79 | PM | `node scripts/db-test.mjs; echo $?` → `db-test: passed 21, failed 0, units 21` then 0; `ls db/tests/*.sql \| wc -l` → 23 (19 today). A red unit other than the three repaired here stops the PM, who brings its FAIL line to Stack; no unit is skipped or excluded to reach 21 | "One command, every database test, all green." |
| 18 | Other suites after integration | R-79, P-101 | PM | `cd web && npm run typecheck && npm test` → 0 failures, and the `Test Files` count ≥ 107 (main a5042fa: 107 files match vitest's `test/**/*.test.{ts,tsx}`, from `find web/test -name '*.test.ts' -o -name '*.test.tsx' \| wc -l` → 107); `node --test scripts/db-test.test.mjs scripts/google-consent.test.mjs` → 0 failures | "Nothing else broke." |
| 19 | Advisor and plan re-read | R-78, R-80 | PM | `get_advisors` security → `function_search_path_mutable` 0, `authenticated_security_definer_function_executable` 2, `auth_leaked_password_protection` 1 (B-41, **PROVISIONAL**; 0 if Stack moves to Pro); performance → `unindexed_foreign_keys` 15, `unused_index` 4 (the four names above); `get_organization` → `"plan":"free"` | "The advisor list is exactly what we decided to accept." |
| 20 | **Stack:** signups-off screenshot | R-78 | Stack + PM | `docs/planning/sprint-2/walks/walk-15/01-auth-signups-off.png` shows project `goultdzqcavefcgnifdy`'s Authentication settings with the allow-new-user-signups toggle **off** | "Only your account can ever sign in, which is why leaked-password checks can wait." |
| 21 | Migration hygiene | P-18 | PM | `ls db/migrations \| grep -c "^10[0-4]_"` → 3 (4 if 103 was needed, 5 if 104 was too; row 4 then names each); `select count(*) from supabase_migrations.schema_migrations where name in ('100_db_test_runner_role', '101_search_path_pin', '102_planner_series_orphan_trigger')` → 3; `select string_agg(name, ',' order by version) from supabase_migrations.schema_migrations where name ~ '^10[0-4]_'` → `100_db_test_runner_role,101_search_path_pin,102_planner_series_orphan_trigger` (with `,103_db_test_runner_grants` appended if 103 was needed, then `,104_db_test_runner_grants_2` if 104 was); `git log --format=%H -- db/migrations/<file> \| wc -l` → 1 for each of 100–102 (and 103, 104; committed once, never edited after apply); for each of 100–102 (and 103, 104), `select md5(array_to_string(statements, '')) from supabase_migrations.schema_migrations where name = '<name>'` equals the hash from `git show HEAD:db/migrations/<file> \| md5sum` (the committed blob, not the CRLF working copy that `core.autocrlf=true` leaves on this laptop; the pair matched for 088, 089 and 090 on 2026-09-27), both printed in 95w | "Repo and prod hold the same three migrations, in order." |
| 22 | Review gates | R-78, R-79 | PM | `/code-review main high` → 0 CRITICAL, 0 HIGH without outcome `fixed`; `/security-review` → 0 HIGH open | "Two reviews, nothing serious left." |
| 23 | DECISIONS: the six rows | R-78, R-80, R-54, P-18, P-31 | PM | each of `grep -c "calendar_push_now" project-state/DECISIONS.md`, `grep -c "leaked-password" …`, `grep -c "bb_text_embeddings_hnsw" …`, `grep -c "100–104" …`, `grep -c "BB2DASH_TEST_DB_URL" …`, `grep -c "planner_events_delete_empty_series" …` → 1 (all 0 today) | "Every warning we keep has a dated reason." |
| 24 | STATUS §Security (the accepted INFO line added) and known issues struck (named migrations), ORCHESTRATOR row 15, PR open | R-78, R-80, R-54 | PM | `grep -c "101_search_path_pin" project-state/STATUS.md` → 2 (Security line + struck known issue); `grep -c "102_planner_series_orphan_trigger" project-state/STATUS.md` → 1; `grep -c "Accepted INFO (R-80): 15 unindexed foreign keys, 4 unused indexes" project-state/STATUS.md` → 1 (0 today); `grep "^\| 15 \|" project-state/ORCHESTRATOR.md \| grep -c "planned"` → 0 (the row reads `planned; first` today) and `… \| grep -c "PR #"` → 1; `gh pr list --head feat/db-hygiene-15 --json number --jq length` → 1 | "The status page says what's true." |
| 25 | Stack's acceptance run, recorded | R-79, R-78, R-80, R-54 | PM + Stack | `grep -c "^- \[x\] Step 3 .*db-test: passed 21, failed 0, units 21" docs/planning/sprint-2/walks/walk-15/95w_PHASE15_WALK.md` → 1 (Stack's own step-3 line, with his output pasted on it; task 17's copy of the same output does not match); `grep -c "^- \[x\] Step [1-7] " docs/planning/sprint-2/walks/walk-15/95w_PHASE15_WALK.md` → 7 | "You ran it yourself and it passed." |

## Workers

Opus workers in their own worktrees, one commit per task id (`feat(15-07): …`), pushed per task. They never touch
`project-state/`. W-38 applies 100, 103 when a live check reports a missing grant (never before 102 is on prod), and
104 when one is reported after 103 is on prod, and W-40 applies 101 and 102, each after a `begin … rollback` dry run. 101 and 102 are applied only once 100 is on
prod.

| Worker | Stream | Branch | Worktree | Owns (disjoint) | Tasks |
|---|---|---|---|---|---|
| W-38 | runner + role | `feat/db-hygiene-15-runner` | `bb2dash-wt-15-runner` | `scripts/db-test.mjs`, `scripts/db-test.test.mjs`, `scripts/package.json`, `scripts/package-lock.json`, `scripts/fixtures/db-test/*`, `db/tests/README.md`, `.env.example`, `db/migrations/100_db_test_runner_role.sql`, `db/migrations/103_db_test_runner_grants.sql` (conditional), `db/migrations/104_db_test_runner_grants_2.sql` (conditional), `db/tests/phase15_100_db_test_runner_role.sql`, `95a_W38_VERIFICATION.md` | 1–4, 6, 7 (and 103, then 104, when a grant is reported) |
| W-39 | suite repair | `feat/db-hygiene-15-suite` | `bb2dash-wt-15-suite` | `db/fixtures/phase10a/build_load_sql.js`, `db/fixtures/phase10a/README.md`, `db/tests/phase10a_load_fixtures.sql`, `web/test/fixtures.phase10a.test.ts`, `db/tests/phase10b_grade_model.sql` (lines 171–172 and §4f; lines 167–168 are brief 96's task 10a), `db/tests/phase9_transform_states.sql`, `95b_W39_VERIFICATION.md` | 8–11 |
| W-40 | migrations | `feat/db-hygiene-15-migrations` | `bb2dash-wt-15-migrations` | `db/migrations/101_search_path_pin.sql`, `db/migrations/102_planner_series_orphan_trigger.sql`, `db/tests/phase15_101_search_path_pin.sql`, `db/tests/phase15_102_planner_series_orphan.sql`, `DATA_SYNTAX.md` (Recurrence paragraph only), `95c_W40_VERIFICATION.md` | 12, 14, 15, 13, 16, in that order |
| PM | integration + docs | `feat/db-hygiene-15` | `bb2dash-wt-15` | `project-state/*`, `docs/planning/sprint-2/walks/walk-15/*`; carries brief 96's task 10a commit onto this branch (§Seams, Phase 16) | 17–25 (with Stack on 5, 20, 25) |

## Out of scope

* R-54's browser walk and the P-71 heartbeat: **Phase 17**. R-41's run states, UI included (brief 99 §Task list,
  tasks 19–20), the run-state semantics and the transform driver: **Phase 19**.
* V-1's invariants, the reconciliation migration, P-67's recheck script and V-1's migration number: **Phase 16**.
* P-24's post-embed checks, `stage_files` and the search RPC bodies: **Phase 18**. `stage_content`: **Phase 19**.
* `sync_runner`, `secrets/`, the dev container, psql in a container, any scheduled job: **Phase 14**.
* Creating the 15 foreign-key indexes, dropping the FTS or HNSW indexes, dropping `grade_scenarios`, and the 057
  policies' subquery wrap: not this sprint's defaults; each needs its own row from Stack.
* pgTAP: not adopted (B-42, **PROVISIONAL**). `supabase test db` (it needs a local Supabase), a local Supabase, CI:
  declined (D-20). A Supabase branch or a pre-commit hook for the runner: not this sprint's default.
* The Pro plan and the leaked-password toggle (B-41), and any Auth or dashboard setting beyond reading the signup toggle.
* The state-doc refresh steps (P-5, P-13, P-20, P-29, P-32, P-41, P-62): Stage D on the planning branch.
* Rewriting the 17 existing files' "RUN IT" headers: the README supersedes them.

## Open items for Stack

Only what B-41, B-42 and B-16 leave open, each with the default the PM takes; every default here is **PROVISIONAL**:

1. **B-42, the role's `BYPASSRLS`.** Task 4's dry run is the first time this project creates a login role with
   `bypassrls`. If the platform refuses it, the default fallback is research 92's own: an owner-level DSN in
   `.env.local`, with the refusal and the fallback recorded in row 5. Migration 100 then shrinks to nothing (100 stays
   free) and task 7 drops. The B-42 row's owner-DSN branch then applies in full: task 4's check becomes the recorded
   refusal, task 5 and step 2 expect `connected as postgres`, step 1 writes the owner DSN, and the counts fall to 20
   units, 22 `db/tests` files and two migrations, as that row lists.
2. **B-42, which connection string.** Default: the **session pooler** on 5432 (it works over IPv4). The direct host is
   allowed by B-42 too, but on this plan it may resolve over IPv6 only. The transaction pooler (6543) is refused by the
   runner either way.
3. **B-42, how the password is set.** Default: acceptance step 1, a snippet run on Stack's machine and one statement
   in an unsaved SQL-editor tab. If `/security-review` asks for it, the snippet sends a pre-computed SCRAM verifier
   instead of the plain password, and nothing else changes.
4. **B-41, after a future upgrade.** If Stack ever moves to Pro, row 2 is superseded by his dashboard toggle and the
   advisor's leaked-password count goes to 0. There is no other change.
5. **B-16.** Nothing is left open here: Phase 15 records the ranges, and V-1's number inside 105–109 is Phase 16's call.
6. **Not a question, a risk the PM carries.** Some existing units build rows on literal future dates:
   `phase12b_082_083_planner_series.sql` creates series from 2026-10-15 onward, and 088's "all" scope counts from
   `now()`. A unit that turns red once its dates pass gets a P-30-shaped fix (dates relative to `now()`) in the phase
   that finds it, with a DECISIONS line; the runner never skips it.

## Session prompt (copy-paste; Stage D keeps the canonical copy in ORCHESTRATOR §6, Session A)

> `/bb2dash-pm` Start Phase 15 (database hygiene and the SQL test runner). Read
> `docs/planning/sprint-2/briefs/95_PHASE15_db_hygiene.md`. First confirm that my answers to
> `93_SPRINT2_RESEARCH_SYNTHESIS.md` §5 B-41, B-42 and B-16 are recorded, rewrite §Stack's calls to them, and show me
> any task whose check changed. Then create the worktree `bb2dash-wt-15` on `feat/db-hygiene-15` from `origin/main`,
> cut the three worker branches in §Workers, and spawn one Opus worker per stream with its disjoint file set and its
> task rows. Every task starts with its check failing. Stop when migration 100 is on prod and put acceptance step 1's
> snippet on my clipboard (task 5). After my `--ping` passes, finish tasks 6–24, open the PR and stop at "ready when
> you say so". Do not merge, apply anything outside 100–104, or change any Auth setting until I say so.
