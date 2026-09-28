# 92 — Sprint 2 research: db-hygiene-tests

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-78..R-80, R-54 and §2 P-2, P-8, P-30, P-31, §6 questions 32–33

## 0. Summary

Nothing in this cluster needs new scope; it needs precision. Live advisor reads today
(2026-09-24T18:04Z) match `91_REQUIREMENTS_v3.md`'s numbers for R-78 exactly (7 search-path, 2
SECURITY DEFINER, 1 leaked-password) but **not** for R-80: unused indexes are 4 today, not 5 —
`grade_column_links_component_idx` has scan activity now. The biggest risk is R-79: the "obvious"
fix (adopt pgTAP + `supabase test db`) is a dead end here — it wants a local Supabase stack this
project has declined, and installing the pgTAP extension on a project with a public PostgREST
surface adds ~50 more functions that need the same grant-narrowing R-78 is already doing for
seven. The safer path is the plain `do $$ ... raise exception 'FAIL ...' $$` convention this repo
already uses everywhere in `db/tests/`, driven by a small `pg` (node-postgres) script using a
**direct** connection — not a transaction-pooled one, because five files `set role` mid-transaction
and pooled connections don't preserve that. R-78's fix reuses migration 038's own bulk `do $$ ...
execute format(...) $$` shape, already proven in this repo, and should pin `public, pg_temp` (082's
convention), not the empty-string style some other projects use, because the seven flagged
functions reference unqualified tables. R-54's fix is a textbook PG10+ `AFTER DELETE ... REFERENCING
OLD TABLE FOR EACH STATEMENT` trigger; the one real risk is that 083/088's own RPCs already delete
an emptied series before the statement trigger fires, so the trigger's delete must be a no-op match
of zero rows, not an assertion. Total new size across R-78/R-79/R-80/R-54 plus the four P-steps: five
S items and one M item (R-79) — nothing here is L. Question 33's own stated default ("a pooler
connection string") is the one thing this research corrects: the credential must be a **direct** or
session-pooler DSN, not the transaction pooler, or the role-switching tests break silently.

## 1. R-78 · Every Supabase security advisor warning is fixed or recorded as accepted

**Standard practice.** Postgres's search_path is per-session and caller-settable; a SECURITY
DEFINER function (or any function called by a role that can `CREATE` in a schema earlier in that
path) can have its unqualified references silently redirected to attacker-created objects — the
general "search_path hijacking" class Supabase's linter 0011 exists to catch. Supabase's own
remediation is `set search_path = ''` with every reference fully qualified, or `set search_path =
<specific schemas>` when unqualified references are intentional. Lint 0029 (SECURITY DEFINER
callable by `authenticated`) is closed by revoking EXECUTE, switching to SECURITY INVOKER, or
moving the function out of the exposed `public` schema — Supabase's own guidance offers no fourth
option, which matches this repo's existing `app_owner()` precedent of accepting the warning with a
recorded reason instead. Leaked-password protection (HaveIBeenPwned k-anonymity check) is
Pro-plan-and-above only, confirmed live: this org (`cjebftahtvayvquxwepx`) reads `"plan":"free"`
today (`get_organization`, 2026-09-24).

**Open-source examples.**
1. [haexhub/playerboard PR #27](https://github.com/haexhub/playerboard/pull/27/files) — one
   migration, ten `alter function ... set search_path = ''` statements, each with a one-line
   comment ("all bodies already fully-qualify … so an empty search_path is safe"). Borrow: the
   habit of stating *why* the chosen search_path value is safe for that function, not just setting
   it.
2. This repo's own `db/migrations/038_advisor_fixes.sql` — a `do $$ ... foreach f in array [...]
   loop execute format(...) end loop; $$` block that revokes and re-grants EXECUTE across eight
   function signatures in one migration, with the same "why" comment convention. This is the
   pattern to extend for the seven-function search_path pin, not the per-statement `alter function`
   style above — it's already this team's convention and needs no new idiom.
3. [supabase/supabase#33131](https://github.com/supabase/supabase/issues/33131) — reports that
   pinning search_path stops Postgres from inlining SQL-language functions, which is exactly the
   latency risk `91_REQUIREMENTS_v3.md` already flags for `hybrid_search_file_text` (the 22→27 ms
   accepted cost from a different change). Confirms the re-time check the requirement already asks
   for is the right one, not a new one.

**Pitfalls.** `search_path = ''` forces every table/function reference to be schema-qualified; the
seven flagged functions here (`set_updated_at`, `classify_bb_file`, `bb_file_relpath`,
`suggested_start`, and the three search RPCs) reference unqualified tables per the requirement's own
reading of `052:41-44`, so an empty-string pin means auditing and re-qualifying every reference —
a bigger, riskier diff than the advisor is actually asking for. Migration 082 already established
this repo's answer: `set search_path = public, pg_temp` on both a `language sql` and a `language
plpgsql` function (`082:65`, `082:143`), leaving unqualified references working exactly as before.
The toggle for leaked-password protection lives in Auth → Providers → Email, not "Auth → Passwords"
as one 2026-09-17 verification note guessed — Supabase's own password-security doc doesn't use that
path name.

**Mapping onto this stack.** One additive migration, numbered outside Phase 14's reserved 091–099
(the PM allocates from whichever range this cluster's phase gets), containing a `038`-shaped
`do $$ ... $$` loop over the seven function signatures, each `alter function ... set search_path =
public, pg_temp`, plus a guard `raise`ing if any public function still lacks one (mirroring 036's
security_invoker guard). A DECISIONS row records `calendar_push_now()`'s WARN as accepted, the same
shape as the existing `app_owner()` row — the requirement's contract cites Phase 11's own Round-2
note (`R2-3`) as the reasoning, so the row is a restatement, not a new judgment call. Checks: advisor
security-lint count 7→0 for search-path; the three search smoke queries; hybrid mode re-timed
against the 27 ms baseline; `phase10a_stage_attempts.sql` re-run for `bb_file_relpath`. Leaked
password: a DECISIONS row accepting the WARN on the confirmed free plan, plus Stack confirming in
the dashboard that signups are off (SQL cannot see that setting).

**Size:** S, confirmed — nothing found here grows the scope.

**Seams:** migration-number allocation from the owning phase; `supabase/functions/search/index.ts`
(service-role client, not anon, so the pin must keep working for `service_role`); `calendar_push_now`
/ `calendar_push_tick` (062); the Auth dashboard Email-provider panel (no SQL path).

**What the research changes:** sharpens "pin the search_path" to a specific value
(`public, pg_temp`, not empty-string) and a specific migration shape (038's `do $$` loop, not
per-statement `alter function`) — both were open in the requirement's own text. Confirms every
other claim (function list, grant list, plan tier) unchanged against a fresh 2026-09-24 advisor
read.

## 2. R-79 · The whole db/tests suite runs from disk in one command and passes

**Standard practice.** Supabase's own documented path is pgTAP tests under `supabase/tests/database/`
run by `supabase test db`, which drives the CLI's own local Postgres stack. That's the "designed
for" answer, and it doesn't fit here: it needs `supabase start`, and this project's own DECISIONS
row (2026-09-16, "no local Supabase") already closed that door for a different reason (containers,
not testing) but the closure still applies. The workable alternative — common outside Supabase's own
docs — is a thin script over a direct Postgres connection: walk a directory of `.sql` files, run
each inside one transaction, always roll back. That is *already* this repo's convention by hand:
every file in `db/tests/` opens with `begin;` and ends with `rollback;` and a `RUN IT:` header
(pasted into `execute_sql` or `psql -f`); the only missing piece is a script that does the pasting.

**Open-source examples.**
1. [bitovi/github-actions-apply-sql-files-to-postgres](https://github.com/bitovi/github-actions-apply-sql-files-to-postgres)
   — a directory-of-`.sql`-files-against-one-Postgres driver. It applies rather than tests-and-rolls-
   back, but the file-walking skeleton (sorted directory read, one connection, fail loud, stop) is
   directly adaptable to a runner that wraps each file in its own transaction instead of committing.
2. [theory/pgtap](https://github.com/theory/pgtap/) + [`pg_prove`](https://pgtap.org/pg_prove.html)
   — the reference implementation, confirmed **available but not installed** on this project
   (`list_extensions`, 2026-09-24: `pgtap` default_version `1.3.3`, `installed_version` null). If
   ever adopted, `pg_prove`'s TAP-formatted pass/fail summary and parallel file execution are the
   parts worth borrowing; see the pitfall below on why this research does not recommend installing
   it here.
3. [mjhalwa/postgres-unitTesting-pgTaP](https://github.com/mjhalwa/postgres-unitTesting-pgTaP) — a
   minimal demo of the `plan()` / assertions / `finish()` bracket. This repo's own `do $$ ... raise
   exception 'FAIL ...' $$` convention is functionally the same idea without the dependency: a
   failing assertion aborts the transaction and surfaces a message starting `FAIL`, which a runner
   can treat exactly like a failed TAP line.

**Pitfalls.** Installing pgTAP adds roughly fifty functions into a schema (`public` by default)
on a project whose `public` schema is the PostgREST API surface — every one of them becomes
reachable at `/rest/v1/rpc/<name>` unless EXECUTE is revoked from `anon`/`authenticated` for each,
repeating R-78's own grant-narrowing exercise fifty times over instead of seven. That is a larger,
riskier migration than the plain-SQL runner this repo already half-has. Recommend: do not install
pgTAP; keep the existing convention and just script the loop. Separately, several `db/tests/*.sql`
files `set role` mid-file (nine switches across five files, per the requirement's own count) —
`set role` is session state, and Supabase's **transaction pooler** (port 6543) hands out a fresh
server connection per transaction, so a role switch on one statement is not guaranteed to hold for
the next. The runner must use the **direct** connection (5432) or the **session** pooler, never the
transaction pooler; this correction also applies to §6 question 33 below. Finally, node-postgres's
own docs are explicit that transactional work needs one dedicated `Client`, never `pool.query()` —
"if you initialize or use transactions with the pool.query method you will have problems" — so the
runner should hold a single `pg.Client`, issue `BEGIN` / the file text / `ROLLBACK` on it directly,
not lean on a `Pool`.

**Mapping onto this stack.** A new `scripts/db-test.mjs` (Node-first, matching `ingest/pull_files.mjs`
and `scripts/google-consent.mjs`'s own convention over adding a Python or shell dependency), with
`pg` added as a devDependency — confirmed absent today (no `pg` in any `package.json`, no `psql`, no
`supabase` CLI on this machine's PATH, checked 2026-09-24). It walks `db/tests/*.sql` in name order,
inserting `phase10a_load_fixtures.sql` before the two dependent phase10a files and
`phase12b_load_fixture.sql` before `phase12b_085_stage_attempts_v4.sql` (the three-file map R-79's
own text already found; hard-code it as a small config array rather than inferring it from
filenames, since the other fourteen files are self-contained). Each file runs on one `pg.Client`
inside `BEGIN` / file text / `ROLLBACK`; a rejected query is caught, its message (already prefixed
`FAIL` by the file's own `raise exception`) is printed, and the runner moves to the next file rather
than aborting the whole run — one broken fixture (see P-30) must not hide the other sixteen results.
Credential: `process.env.BB2DASH_TEST_DB_URL` (see P-31). This does not touch 087's newest-run guard;
it's the fixture that has to stay newest (P-30), not the runner.

**Size:** M, confirmed (the verifier's own resize from S to M in the source document holds): the
runner itself is S, the fixture fix (P-30) is S, and the credential decision (P-31, gated on
question 33) is S, but all three gate the "whole suite passes" acceptance together.

**Seams:** `db/fixtures/phase10a` and `phase12b` generators and their vitest drift guards; 087's
newest-run guard (unchanged, just satisfied); service-role-only `stage_*` functions; Phase 14's
planned `sync_runner` role and DSN are a separate, narrower credential for a different job and
cannot double as this one (that role can run three RPCs and reads; this one needs `set role` and
service-role-only functions).

**What the research changes:** confirms size M; adds a concrete, negative recommendation (skip
pgTAP, for the schema-exposure reason above) that the source text left open; adds the direct-
connection-not-transaction-pooler requirement, which the source text didn't specify and which
question 33's own default gets wrong (see §Questions below); adds the single-`pg.Client`
requirement.

## 3. R-80 · Performance advisor INFO findings each recorded as accepted, with true reasons

**Standard practice.** Supabase's own linter page for unindexed foreign keys states indexing them
is "a standard practice," full stop, while also showing that Postgres genuinely prefers a sequential
scan over an index on a small table because the scan is faster there — the tradeoff only tips
toward the index as row counts grow. There's no official exemption for small tables; the
[splinter page](https://supabase.github.io/splinter/0001_unindexed_foreign_keys/) simply recommends
indexing proactively rather than waiting for the crossover. For INFO-level findings a team isn't
acting on yet, the common open-source pattern (seen across every repo cited under R-78) is a tracked,
reasoned note — an issue, in most of these examples; a DECISIONS row is this repo's existing
equivalent and is the more durable of the two, since it lives next to the code instead of in an
issue tracker a future reader might not open.

**Open-source examples.** The same repos cited under R-78
([garrytan/gbrain#5190](https://github.com/garrytan/gbrain/issues/5190),
[HaulinLogs/LawnBudAI#76](https://github.com/HaulinLogs/LawnBudAI/issues/76)) show the "log it as an
issue and defer" pattern for advisor findings generally, which is the same shape this requirement
already proposes for R-80's two INFO categories — nothing here suggests a different mechanism.

**Pitfalls.** A live advisor read today (2026-09-24T18:04Z) shows **4** unused indexes, not the 5
the requirement's own "State today" section records from earlier readings:
`grade_column_links_component_idx` is no longer in the unused list (it now has scan activity —
consistent with R-56's note that ECN.304's `rank_weighted` rule "waits for ECN.304 Exam 1," which
would be the first real read against that index). The other four (the two FTS indexes,
`bb_attempts_sync_run_idx`, `bb_text_embeddings_hnsw`) are unchanged. The foreign-key count is
unchanged at 15. This is exactly the kind of drift R-80 exists to catch, so the DECISIONS row this
requirement asks for should be written from today's count, not the stale one, or it will itself be
wrong on arrival.

**Mapping onto this stack.** Docs-only by default, as the requirement already frames it: one
DECISIONS row (15 FK-covering indexes deferred until a slow query names one; the two FK-covering
indexes on `grade_column_links`/`bb_attempts` never dropped, since dropping them just relocates the
finding to `unindexed_foreign_keys`; HNSW kept for vector-mode `match_file_text` and future growth;
the two FTS indexes kept pending a real content/announcement search or dropped in a later migration
that takes an explicit, named exception to the additive-migrations rule) plus a STATUS §Security
line naming the accepted counts, checked against a fresh advisor re-read.

**Size:** S, confirmed.

**Seams:** none beyond the DECISIONS/STATUS pair; if the PM later chooses indexes instead of
acceptance, they'd ride in the same migration as R-78's fix (D-1 in the source numbering).

**What the research changes:** corrects the unused-index count from 5 to 4 as of 2026-09-24 —
the DECISIONS row's wording should say "four" with today's four names, not the source document's
inherited "five." Everything else (FK count, the reasoning per index) holds.

## 4. R-54 · A planner series row never outlives its last occurrence

**Standard practice.** For a "delete the children, then clean up the now-possibly-empty parent"
invariant fired by a bulk `DELETE`, the idiomatic PostgreSQL 10+ tool is a **statement-level**
`AFTER DELETE` trigger using a `REFERENCING OLD TABLE` transition table, doing one set-based cleanup
query over every row the statement deleted — not a row-level trigger, which would repeat the same
"is this series now empty" check once per deleted row for no benefit and would race under a
multi-row delete. This is exactly the shape the requirement's own "Still missing" text already
proposes; the standard-practice check here confirms it's the right tool rather than proposing a
different one.

**Open-source examples.**
1. [PostgreSQL's own `CREATE TRIGGER` reference](https://www.postgresql.org/docs/current/sql-createtrigger.html)
   — the canonical `emp_audit` example: `after delete on emp referencing old table as old_table for
   each statement execute function process_emp_audit()`, with the function body doing one
   `insert ... select ... from old_table`. Borrow the syntax skeleton directly; swap the insert for
   a `delete from planner_event_series where id in (select distinct series_id from old_table where
   series_id is not null) and not exists (select 1 from planner_events e where e.series_id =
   planner_event_series.id)`.
2. This repo's own `db/migrations/082_planner_event_series.sql` — the trigger function this fix
   adds should follow `082`'s own convention exactly: `set search_path = public, pg_temp`, plain
   (not SECURITY DEFINER) so it runs as the deleting session and inherits that session's RLS, and
   `revoke`d from `public`/`anon`/`authenticated` the way 082 already does for its own functions
   (`082:143`-area pattern).
3. [EDB's tutorial on statement-level transition tables](https://www.enterprisedb.com/postgres-tutorials/can-modified-tuples-be-accessed-using-statement-level-trigger-postgres)
   — confirms `FOR EACH STATEMENT` with `REFERENCING OLD TABLE` is the PG10+ answer for "batch
   cleanup after a bulk delete," the general case R-54 is an instance of.

**Pitfalls.** 083/088's own RPCs (`planner_series_update` / `planner_series_delete`) already delete
an emptied series themselves, inside their own function body, *before* their inner `delete from
planner_events` runs — so by the time the new statement trigger fires, the series row it would have
deleted is often already gone. The trigger's cleanup query must match zero rows silently (a plain
`delete ... where ... and not exists (...)`, not an assertion expecting exactly one row), exactly as
the requirement's own "Seams" note already flags ("re-run TR-4 rather than assume"). Running the
trigger as SECURITY INVOKER (not DEFINER) is correct and not just a style choice: `planner_event_series`
already carries owner-only RLS from 082 §5, so a plain trigger firing in the deleting user's own
session naturally respects it — a DEFINER trigger would need its own owner check re-implemented by
hand. A stranger-uid test doesn't need a second database connection to prove: this repo's other
`db/tests` files already use `set local role`/`set session authorization` inside one transaction for
exactly this, and the new test should do the same rather than opening a second client.

**Mapping onto this stack.** One migration (number TBD, outside 091–099) adding the trigger function
and its `create trigger ... after delete on planner_events ...` statement. A new test file —
recommend `db/tests/phase12b_series_orphan_trigger.sql` rather than appending to the existing
`phase12b_082_083_planner_series.sql`, to keep that suite's own runtime and diff small — covering:
a detached last row's plain delete leaves 0 series; "This event" on the last attached row leaves 0
series; a series with rows remaining is untouched; TR-4 (the existing RPC-path test) re-run
unchanged under the new trigger; a stranger uid (via `set local role`) deletes nothing. This new
file needs no special-casing in the R-79 runner — it's not one of the three files that need a
loader in front of it.

**Size:** S, confirmed. **Seams:** as already documented in the source (`planner_events`,
`planner_event_series`, 083/088 RPCs, `queries.plannerSeries.ts:411-415`).

**What the research changes:** nothing to scope — the existing "Still missing" text was already
correct. Adds two concrete implementation notes (idempotent zero-match delete; new file over an
appended one) and confirms the trigger-based approach against outside practice rather than a
client-side follow-up delete, which the source document's own Notes had already rejected as
non-atomic.

## 5. P-2 · Rewrite db/tests/phase10b_grade_model.sql for today's prod

**Standard practice.** This is the same family of problem as P-30 (a fixture that hard-codes a past
state of the system under test) but with a different cause: not a timing/recency guard, but a real,
intentional data change since the file was written — `_3569973_1`'s link state moved from unlinked
to shared (migrations 075/084, closed item #17 in §5 of the source document), so the test's
hard-coded expectation of "unlinked" is now simply false, not stale-by-clock. The general fix for a
fixture that must read real, mutable rows rather than synthetic ones is either to stop depending on
that row's specific state (seed a private, test-only column-link row instead) or, where the real row
must be read, to capture its *current* state into a variable at the top of the test and assert
relative to that rather than a hard-coded literal.

**Open-source examples.** No external example is needed here beyond the general "golden-file test
drifted from the system" pattern already visible in this repo's own `web/test/fixtures.phase10a.test.ts`
— a drift guard that re-runs the generator and fails if committed output doesn't match. The same
instinct (make drift a loud test failure, not a silent one) is why this fix belongs in a rewrite of
the assertion, not a one-off literal edit that will drift again the next time a column link changes.

**Pitfalls.** Two separate bugs live in this one file: lines 171-172 insert a link that now already
exists on prod (a duplicate-insert failure, unrelated to the stale-expectation bug at 251-255).
Fixing only one leaves the file still red. This repo's own `inbox_apply_090_attention_archive.sql`
prefixes every synthetic row it inserts with `test090:` specifically so a re-run can never collide
with real data or a previous run's leftovers — the same prefix convention (e.g. `test10b:`) should
be used for any row this file can seed itself, rather than re-using `_3569973_1` where the test's
own logic doesn't require reading that exact column.

**Mapping onto this stack.** Edit `db/tests/phase10b_grade_model.sql` lines 171-172 (idempotent
insert, or a pre-delete of the file's own prior synthetic rows) and 251-255 (read `_3569973_1`'s
current link state into a variable at test start, assert relative to it, not a literal "unlinked").

**Size:** S, confirmed; for R-30, R-32. **What the research changes:** confirms size and supplies
the concrete two-bug fix technique; no scope change.

## 6. P-8 · db/tests/phase9_transform_states.sql: forced stage failure and reaper, rolled back

**Standard practice.** Testing a "partial pipeline failure, then a watchdog reclaims the stuck job"
flow needs two things proven separately: that one stage failing mid-`run_transform` (034/035/051's
`stage_courses → stage_assignments → … → stage_gaps` sequence) is recorded as a partial/error state
rather than silently swallowed, and that a row stuck in `claimed` past 039's grace window is reclaimed
by the reaper. The standard way to force a deterministic mid-pipeline failure without touching
production code is either to redefine the target stage function for the duration of one test
transaction (a well-known "monkey-patch inside a transaction, it all rolls back" technique), or to
feed a payload engineered to make a *real* code path raise — e.g. a shape one of the stage functions
already validates and rejects. This repo's existing `db/tests` files (phase10a, phase12b) all use
the second style — crafted payload fixtures, never a redefined function — so P-8 should match that
convention rather than introduce a new one.

**Open-source examples.** None needed beyond the general technique above; this is standard SQL-test
practice (force via input, not via code substitution) already established inside this repo's own
test suite.

**Pitfalls.** Migration 038 revoked EXECUTE on every transform function from `authenticated` — this
new test must run as `postgres`/`service_role` (matching the "nine role switches in five files"
convention R-79 already found across the existing suite), not assume an ordinary authenticated
session can call `transform_tick()` directly. For the reaper half, the stuck-row's age must be
computed from `now()` (e.g. `claimed_at = now() - interval '31 minutes'` against 039's 30-minute
grace) rather than a fixed past timestamp — the same "date fixtures relative to now()" principle
flagged for P-30, applied here from the start so this new file never needs its own P-30-style
re-dating later.

**Mapping onto this stack.** New file `db/tests/phase9_transform_states.sql`; no migration needed —
it exercises existing 034/035/039/051 code with crafted `bb_raw` payloads and a manually backdated
`agent_requests` row, both inside `begin ... rollback`.

**Size:** S, confirmed; for R-41. **What the research changes:** recommends the crafted-payload
technique over function-redefinition (the source text was silent on which); otherwise confirms
scope.

## 7. P-30 · Re-date the phase10a fixture so its gradebook test passes on today's prod

**Standard practice.** The general fixture-hygiene rule this repo's own P-30 entry is an instance
of: any fixture whose test asserts something relative to "now" (here, 087's newest-registered-crawl
guard) must anchor its timestamps to the test run's own clock, not a fixed calendar date baked in at
authoring time — otherwise the fixture silently ages out the first time the real system accumulates
newer real rows, exactly what happened here (four newer registered prod crawls now outrank the
fixture's 2026-09-14-era `captured_at`, per the requirement's own prod read).

**Open-source examples.** No external citation adds anything beyond the general principle above and
this repo's own `db/fixtures/phase10a/build_load_sql.js`, read directly: `shell.captured_at` is
today a fixed string carried from the JSON source files, and the second synthetic crawl already
derives from the first (`b.captured_at + interval '1 day'`, confirmed at `phase10a_stage_gradebook.sql:243`)
— only the *anchor* needs to move to `now()`-relative, not the offset logic between the two crawls.

**Pitfalls.** The generator is also `require`d directly by `web/test/fixtures.phase10a.test.ts`'s
drift guard, which expects the generator's output to be byte-identical between runs. Switching
`captured_at` to a `now()`-relative expression breaks that determinism in a new way the fixed-date
version never had — the drift guard has to be taught to compare everything *except* the timestamp
literals (template or strip the date fields before diffing) or it will fail every run once P-30
lands, trading one red test for another. The source document's own "Still missing" text names
regenerating the loader and updating the drift guard, but doesn't call out that the guard's
comparison logic itself needs to change, not just its expected output — that's the piece this
research adds.

**Mapping onto this stack.** `db/fixtures/phase10a/build_load_sql.js` (the `captured_at` source,
switched to an emitted `(now() - interval '...')::timestamptz` expression rather than a quoted past
literal), `web/test/fixtures.phase10a.test.ts` (drift-guard comparison made timestamp-agnostic),
`db/tests/phase10a_load_fixtures.sql` (regenerated), `db/tests/phase10a_stage_gradebook.sql` lines
266/272 (pass once the anchor floats).

**Size:** S, confirmed; for R-79. **What the research changes:** adds the drift-guard-must-also-
change pitfall as a research-added sharpening (also listed under §Research-added below); otherwise
confirms scope.

## 8. P-31 · A database credential for the SQL runner, held outside the repo

**Standard practice.** Two separable questions: where the secret's *value* lives, and how *powerful*
the role behind it is. For value storage, the standard Node convention — confirmed by the same
search that surfaced node-postgres's transaction docs — is an environment variable read via
`process.env`, sourced from a gitignored `.env`-style file for local development; no dedicated
secrets-manager library is warranted for one local credential on one machine (this also matches this
project's own declined-Kubernetes/declined-secrets-manager stance). For role scope, this repo's own
instinct throughout — 038's grant-narrowing, the owner-scoped RLS story, Phase 14's own planned
`sync_runner` role — is least privilege; the tension P-31 and question 33 both surface is that the
*tests themselves* need to `set role` and call `service_role`-only stage functions across five
files, so a maximally narrow role would fail the very tests it's meant to run.

**Open-source examples.** No external repo is needed for the storage half — `.env` +
`process.env.*` is uncontested convention, confirmed by the node-postgres search results above. The
concrete, already-working example is inside this repo: `scripts/google-consent.mjs` already loads
the Supabase **service** key from `~/.claude.json` via node (DECISIONS 2026-09-15) — a real,
production precedent for "a credential lives outside the repo, read by a small Node script," one
step more locked-down than a repo-local `.env` file.

**Pitfalls.** This repo's own `.gitignore` already exempts `.env` and `.env.*` (confirmed by
reading it) while allowing `.env.example` through — so a repo-local `.env.local` is not a new
convention to invent, just an unused one to use. The Management API personal-access-token
alternative the source document's own Notes already raised is broader than a scoped database
credential (it reaches every project on the account, not just bb2dash), so the connection-string
route is the narrower secret — this research reconfirms that conclusion rather than reversing it.
The one real correction: the connection string must be a **direct** (5432) or **session-pooler**
DSN, never the **transaction-pooler** (6543) one — see R-79's pitfalls above — because several test
files `set role` mid-transaction and the transaction pooler does not guarantee that state survives
between statements.

**Mapping onto this stack.** A new gitignored `.env.local` (or `.env.test`) key, e.g.
`BB2DASH_TEST_DB_URL`, read by the R-79 runner; a corresponding empty-valued entry added to
`.env.example`. The value itself — a direct or session-pooler connection string for a role able to
`set role` and reach service-role-only stage functions — is Stack's to create by hand from the
Supabase dashboard, since no session here holds a login capable of minting one. When Phase 14's
planned `bb2dash-stack/secrets/` folder exists, the same env var name can be re-pointed there with
no code change, matching Phase 14's own "build it so it's migratable later" guardrail.

**Size:** S, confirmed; for R-79. **What the research changes:** names the concrete file/variable
and corrects "a pooler connection string" to "direct or session-pooler, never transaction-pooler" —
this also updates question 33's own default, carried below.

## Research-added requirements

1. **Timestamp-agnostic drift guard for `fixtures.phase10a.test.ts`** — for P-30/R-79. Once P-30
   makes the generator's `captured_at` output `now()`-relative, the existing byte-for-byte drift
   guard will fail on every run unless its comparison ignores the timestamp fields. Size S; without
   it, P-30 trades one red test for another the same day it lands.
2. **Runner exit code contract** — for R-79. `scripts/db-test.mjs` should exit non-zero if any file
   fails and zero only if every file passes, printing a one-line pass/fail count per file (matching
   `pg_prove`'s summary line without the dependency), so the "one command" in R-79's own title is
   also scriptable by anything that checks an exit code later (a pre-commit hook, a future CI step).
   Size S; the source text describes the loop but not its exit contract.
3. **A dedicated least-privilege role for the test credential** — for R-79/P-31 (see question below,
   this is its corresponding implementation item once Stack answers). Size S; sits in the same
   migration family as R-78's search-path pin if adopted, or stands alone.

## Questions for Stack

Only the items where this research changed a recorded default are repeated here; every other §6
question in this area (there were none besides 32-33) is unaffected.

1. **Question 33, sharpened default.** *May a script on this laptop hold a database credential so
   that db/tests can run against prod in one command?* — **Default: Yes, but as a direct or
   session-pooler connection string (port 5432, or the session pooler), never the transaction
   pooler (port 6543), stored in a gitignored `BB2DASH_TEST_DB_URL` entry in a repo-local `.env.local`
   for now** (Phase 14's planned `bb2dash-stack/secrets/` folder can hold the same variable later
   with no code change). **Why:** the source document's own default said only "a pooler connection
   string," which this research found would break silently — five test files `set role` mid-
   transaction, and Supabase's transaction pooler does not guarantee that session state survives
   between statements on a pooled connection. The rest of the original reasoning (narrower than a
   Management API token; more powerful than the anon key and must be treated with equivalent care)
   is unchanged.
2. **New — should the credential be a dedicated, least-privileged Postgres role, or the project's
   own owner-level login?** Question 33 as written only asks whether a credential may exist at all;
   it doesn't ask how powerful it should be. **Default: create a dedicated role (e.g.
   `db_test_runner`) in the same migration family as R-78's search-path pin, granted exactly what
   the eighteen `db/tests` files need — membership or `SET ROLE` rights into whatever roles the
   individual files switch into, and EXECUTE on the specific service-role-only stage functions they
   call — rather than handing the script the project's own postgres/owner connection string.** Until
   that role exists, fall back to an owner-level connection string Stack creates by hand, scoped to
   `.env.local` only. **Why:** this cluster's whole purpose is closing least-privilege gaps
   elsewhere in the project (R-78's SECURITY DEFINER review, R-80's index hygiene); handing a script
   on a personal laptop the same login power as the project owner would be an odd exception to that
   same instinct, and Phase 14 is already planning exactly this pattern (a purpose-built
   `sync_runner` role) for a different script, so building the narrower role now is not wasted
   effort.

## Sources

Live checks against the project (`goultdzqcavefcgnifdy`), 2026-09-24T18:04Z, via Supabase MCP:
`get_advisors` (security, performance), `get_organization` (plan: free), `get_project`, `list_extensions`
(pgtap 1.3.3 available, not installed). Local checks, 2026-09-24: `psql`/`supabase` CLI absent from
PATH, no `pg` package in any `package.json`, `.gitignore` exempts `.env`/`.env.*`.

- [Supabase splinter — 0011 function_search_path_mutable](https://supabase.github.io/splinter/0011_function_search_path_mutable/) — fetched 2026-09-24 (via search result)
- [Supabase splinter — 0001 unindexed_foreign_keys](https://supabase.github.io/splinter/0001_unindexed_foreign_keys/) — fetched 2026-09-24
- [haexhub/playerboard PR #27](https://github.com/haexhub/playerboard/pull/27/files) — fetched 2026-09-24
- [garrytan/gbrain issue #5190](https://github.com/garrytan/gbrain/issues/5190) — 2026-09-24
- [supabase/supabase#33131 — search_path pin stops inlining](https://github.com/supabase/supabase/issues/33131) — 2026-09-24
- [supabase/supabase#28507 — search_path mutable with pgvector](https://github.com/supabase/supabase/issues/28507) — 2026-09-24
- [Supabase Password security docs](https://supabase.com/docs/guides/auth/password-security) — 2026-09-24
- [Supabase Auth blog — leaked-password / HaveIBeenPwned](https://supabase.com/blog/supabase-auth-identity-linking-hooks) — 2026-09-24
- [Supabase database testing docs (pgTAP, `supabase test db`)](https://supabase.com/docs/guides/database/testing) — fetched 2026-09-24
- [pgtap.org — pg_prove](https://pgtap.org/pg_prove.html) — 2026-09-24
- [theory/pgtap](https://github.com/theory/pgtap/) — 2026-09-24
- [mjhalwa/postgres-unitTesting-pgTaP](https://github.com/mjhalwa/postgres-unitTesting-pgTaP) — 2026-09-24
- [bitovi/github-actions-apply-sql-files-to-postgres](https://github.com/bitovi/github-actions-apply-sql-files-to-postgres) — 2026-09-24
- [Supabase — Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres) — 2026-09-24
- [Supabase — Connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits) — 2026-09-24
- [Supabase troubleshooting — Supavisor and connection terminology](https://supabase.com/docs/guides/troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO) — 2026-09-24
- [Flavio Copes — direct vs pooled Supabase connections](https://flaviocopes.com/courses/supabase/choose-direct-or-pooled-connections/) — 2026-09-24
- [node-postgres — transactions](https://node-postgres.com/features/transactions) — 2026-09-24
- [brianc/node-postgres transactions doc source](https://github.com/brianc/node-postgres/blob/master/docs/pages/features/transactions.mdx) — 2026-09-24
- [drizzle-orm issue #6341 — pool.query transaction leak](https://github.com/drizzle-team/drizzle-orm/issues/6341) — 2026-09-24
- [PostgreSQL docs — CREATE TRIGGER (REFERENCING OLD TABLE)](https://www.postgresql.org/docs/current/sql-createtrigger.html) — 2026-09-24
- [PostgreSQL docs — PL/pgSQL trigger functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html) — 2026-09-24
- [EDB — statement-level triggers and transition tables](https://www.enterprisedb.com/postgres-tutorials/can-modified-tuples-be-accessed-using-statement-level-trigger-postgres) — 2026-09-24
- This repo: `db/migrations/038_advisor_fixes.sql`, `db/migrations/082_planner_event_series.sql`, `db/fixtures/phase10a/build_load_sql.js`, `db/tests/phase10a_stage_gradebook.sql`, `db/tests/inbox_apply_090_attention_archive.sql`, `.gitignore` — read directly, 2026-09-24
