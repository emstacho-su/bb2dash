# 109 W-76 verification: the database stream of Phase 24a

Worker W-76, branch `feat/workspace-24-db`, tasks 13 to 20, 22 (the branch half), 49 and 50. Nothing was
applied to prod and no Supabase tool was called. The only database contact was `node scripts/db-test.mjs`
(the test login, read-only units that roll back).

## How this was proved, and what that is not

* **Red runs** are real: each unit was run against prod through the runner before its migration is applied
  and fails because the objects are not there. They are quoted per task below.
* **Green runs are NOT from prod.** A migration cannot be applied by this worker. To avoid sending nine
  migrations and eleven units untested, every migration and every unit was also run, in order, in a local
  stand-in: PGlite 0.2.17 (PostgreSQL 16) with pgvector, a boot script that stubs the Supabase parts
  (`auth.uid()`, `realtime.send`, `storage.buckets`/`objects`, the default ACL, the roles, and plain tables
  for `courses`, `bb_files`, `bb_file_text`, `bb_text_embeddings`, `v_work_items`, `v_gradebook_latest`),
  with the real `140`, `142`, `143` and `129` applied first. In it all of these print PASS with all nine
  migrations applied: `phase21_140`, `phase21_140b`, `phase21_143`, `phase24_190`, `191`, `192`, `193`,
  `194`, `195`, `196`, `196b`, `197`, `198` (seeded with one course unit) and `phase24_store_proof`. The
  stand-in found a dozen mistakes in my first drafts (listed under "What the stand-in caught"). It is a
  scratch harness in the session's scratch folder, not committed. It is a PG16 stand-in with stubs; it
  proves syntax, logic and the units' own consistency, not prod's grants, ACLs, advisors or PG17.
* The PM's `begin; <migration>; <unit>; rollback;` dry run on prod is therefore still the first real green.

## Tasks, red runs, and what each unit asserts

Every unit opens `begin;`, ends `rollback;`, ends with a `... : PASS` row, and works both as its own file
through the runner and pasted after its migration in one transaction. A dry run through `execute_sql` needs
`grant workspace_runner to postgres with inherit false, set true;` (193's unit needs the same for
`workspace_ingest_runner`), as 142's note says.

| task | commit | red run against prod (quoted) |
|---|---|---|
| 50 (198) | bd67bac | `FAIL 198 (a): an anon insert into bb_text_embeddings ended with [no error], expected 42501 (the policy bb_text_embeddings_anon_insert is still there)` |
| 13 (190) | c75f818 | `FAIL phase24_190: migration 190 is not applied (public.workspace_documents is missing)` |
| 14 (191) | 757751b | `FAIL phase24_191: migration 191 is not applied (no policy on storage.objects names the bucket)` |
| 15 (192) | c848b14 | `FAIL phase24_192: migration 192 is not applied (public.hybrid_search_workspace_text(text, extensions.vector, text, text[], text[], integer, integer, double precision) is missing)` |
| 16 (193) | 6ff74b7 | `FAIL phase24_193: migration 193 is not applied (no role workspace_ingest_runner)` |
| 17 (194) | c4c87f4 | `FAIL phase24_194: migration 194 is not applied (public.workspace_routines is missing)` (and `phase21_140_workspace_tables.sql` PASS today, and PASS in the stand-in with 190 and 194 applied, unedited) |
| 18 (195) | 38c6828 | `FAIL phase24_195: migration 195 is not applied (public.workspace_profile is missing)` |
| 19 (196) | a8b74fc | `FAIL phase24_196: migration 196 is not applied (public.workspace_claim_v2(text) is missing)` and `FAIL phase24_196b: migration 196 is not applied (workspace_job_claim is missing)` |
| 20 (197) | 5192ce2 | `FAIL phase24_197: migration 197 is not applied (public.v_workspace_index_status is missing)` |
| 49 | 5185c21, 0a9d2a8 | see "Task 49" |
| 22 | 0ff4aa2 | see "Task 22" |

* **198 / `phase24_198_anon_insert_drop.sql`**: anon's insert of a synthetic vector row raises 42501;
  `pg_policies` holds exactly the three rows for the two course tables; `service_role` bypasses row security;
  the row count is the same before and after. `git grep -c bb_text_embeddings_anon_insert -- db/tests
  ":!db/tests/phase24_*"` prints nothing (checked; only the new unit and migration name it).
* **190 / `phase24_190_store.sql`**: the vector column is `vector(384)` not null, `model` not null, the two
  unique keys, the HNSW index (`hnsw`, `vector_cosine_ops`, valid); rights of every role on the three tables
  (table and column): anon, `workspace_runner`, `sync_runner`, `inbox_apply_runner` (and the ingest role once
  it exists) hold nothing; `authenticated` select on the first two, update of exactly `title` and `course_id`,
  nothing on the vector table; every policy names `app_owner()`; the three functions are definer, pinned,
  commented and executable by `authenticated` alone. Behaviour: register (row facts), the same hash again
  (existing true, nothing written, also from `failed` and `deleting`), sixteen refusals (23514/23503) that
  leave no row, retry, the two-step delete (0 units and 0 vectors after step one, same key on repeat,
  22023 for step two out of order, the row dropped), a stranger / no uid / anon (42501, nothing written), the
  owner's direct writes (insert, `signed_url`, `state`, `sha256`, delete, unit and vector writes: 42501;
  title and course: ok), the three CHECKs and every key (23514/23505/23502/22000/23503), `v_workspace_memory`.
  The memory branch of `workspace_document_delete` writes `workspace_conversation_state` (195) and is
  therefore tested in the 195 unit.
* **191 / `phase24_191_bucket.sql`**: four policies name the bucket, one per command, `authenticated` only,
  initplan form, owner-scoped, insert/update hold the key shape `u/<64 hex>`. **The bucket row itself (private,
  20971520, six types) cannot be read by the test login** (no usage on schema `storage`; `phase15_100` pins
  that): the unit asserts it only for a login that can and otherwise prints a notice; migration 191's own
  guard asserts it on every apply and the PM's dry run as postgres runs the unit's branch.
* **192 / `phase24_192_search.sql`**: shape and fences (invoker, stable, pinned path, `service_role` and the
  test login only, anon and authenticated 42501, `operator(extensions.<=>)` in the twin, the signature of
  `workspace_search`); three kinds from synthetic rows (a basis vector and a similarity floor of 0.999 keep
  the real corpus out, so the counts are exact on prod), no null kind, `deleting`/`failed` never returned,
  exactly 3 rows (2 upload, 1 memory) for a token only those hold, scope [c1]/[c2]/both, a kind list, a
  kind's limit, a passage under 2,000 characters, the `[notes]` marker, the model (no similarity under the
  default `p_model` for a unit whose only vector is under another name, one when `p_model` names it, and
  the vector alone ranks under its own model only), and `workspace_attachment_read` (read, cut between
  units, first unit cut to the limit, the 40-id cap, no_text, not_ready, failed, missing, the eleven keys).
* **193 / `phase24_193_ingest_role.sql`**: role attributes, setting, the four signatures, exactly four definer
  functions, none for anyone else, no table/view/sequence/column grant, membership; claim (oldest first, nine
  keys, sha256 handed over, a remembered item with no link and no hash, one document at a time, the lease and
  its sweep with the third dead hold ending `extract_failed`); `put_text` (a second put leaves one set and
  no vector of a replaced unit; seventeen bad inputs 22023 writing nothing; 1000 units and 1.5 million
  characters accepted); `finish` (indexed needs units, `embedded_at` and a vector; failed and indexed clear
  the link; the three tries); heartbeat; 42501 for anon, authenticated and the role's own direct reads.
  The two greps hold: `grep -ciE "password +'"` gives 0, `grep -c "CARRIES NO PASSWORD"` gives 1.
* **194 / `phase24_194_ask_options.sql`**: shape and rights, every policy names `app_owner()`, the six
  routines pinned by md5 of their text against `seed/routines.json` (the migration's VALUES block was
  generated from the fixture by script, quotes doubled); options and five attachments stored, numbered
  files first; null means absent; eighteen refusals each storing nothing; stranger / no uid / anon; direct
  inserts 42501; `workspace_ask(uuid, text)` still returns its three ids.
* **195 / `phase24_195_turn_state.sql`**: the four tables' rights (the browser's only column write is
  `workspace_profile.about_me`), About me 2,000 passes and 2,001 is 23514, `memory_since` has no default and
  42501 for the owner, the trace tables' constraints, no column named text/passage/content/snippet, the
  memory branch of `workspace_document_delete`.
* **196 / `phase24_196_runner_v2.sql` and `phase24_196b_feed_jobs.sql`** (split because one file would pass
  800 lines): the eleven; no grant; the six not executable by anyone else; claim_v2 (one at a time, own dead
  turn closed with its assistant row, the 10-minute sweep, a fresh claim of another runner blocks);
  turn_context (the eleven keys exactly, defaults, routine, attachment states, messages, left-out count,
  last auto tier, 60-message and 200,000-byte caps); turn_put (sources in order, ids not found dropped, the
  unit's own row filling the tool source, 40-row cut, append, replace, 22023/23514); planner_feed (eight
  keys, 400 days clamped to 180, scope, counts equal the views, order, no direct read of the progress tables
  or the views); jobs (first memory call stamps, no later call moves it, who is eligible, lease, release,
  three failures park until a newer message, the memory upsert from a first write / same summary / new
  summary from `indexed` and `failed`, opted-out writes nothing, rolling with through-point and previous
  summary). The feed on prod is read over the real rows, so it checks shape, order, counts and filters, not
  values; with synthetic rows in the stand-in's stub views (120 work, 150 gradebook rows) it also passed.
* **197 / `phase24_197_index_status.sql`**: one row, thirteen columns and types, invoker, no `storage`
  dependency; course half equals direct counts; one synthetic document per state moves exactly its own
  column (a memory item in `failed` is `memory_failed` alone, in `text_ready` `memory_waiting` alone); the
  heartbeat age; owner / stranger (zeros) / anon.

## Task 49

* `db/tests/phase24_store_proof.sql` holds proofs 1 to 7 and 7b as one read-only unit, collected into one
  raise. **The red run on prod today** (9 of its statements fail, as expected before the applies):
  `proof 2: the vector columns read [public.bb_text_embeddings|embedding|384|t] ; proof 3: the vector indexes
  read [public.bb_text_embeddings|bb_text_embeddings_hnsw|hnsw|vector_cosine_ops|t] ; proof 4 (new table)
  raised 42P01 ... ; proof 5 raised 42P01 ... ; proof 6 raised 42P01 ... ; proof 7b (row security) ...;
  proof 7b (rights) raised 42704: role "workspace_ingest_runner" does not exist ; proof 7b (policies) ...
  bb_text_embeddings_anon_insert ... ; proof 7b (columns) raised 42P01`.
* **The statements that could run on prod today did, and gave the expected result with no change:**
  proof 1 (extension in `extensions`), proof 2 and 3 (one column and one index today), **proof 4's course half**
  (the plan of `match_file_text`'s own statement names `bb_text_embeddings_hnsw` with no Sort, under the two
  settings), proof 7 (`0|0|0|0`), and the course-table half of 7b's grid: `anon | bb_file_text | INSERT`,
  `anon | bb_text_embeddings | INSERT` (the row 198 removes), `authenticated` all four commands on both tables,
  and nothing for `workspace_runner`, `sync_runner` or `inbox_apply_runner`. In the stand-in all proofs pass
  with all nine applied, and with 198 withheld proof 7b shows exactly the one extra row.
* **No proof statement was changed.** Changes of form only: each proof is wrapped in its own
  `begin ... exception` so a missing object is collected as a failure; the rows are compared as ordered
  strings in `collate "C"` (the brief's tables list `workspace_document_text` before `workspace_documents`,
  which is C order; a locale that ignores `_` would sort them the other way); proof 5's key is compared
  without the table name (`regclass` prints the schema or not by search path); proof 4 runs each statement
  through `execute ... format json` and checks `"Index Name"` and the absence of a Sort node, as the brief says;
  a local variable is not called `r` (it hid the SQL alias `r` in 7b).
* **Not run (not SQL):** proof 8's four greps and proof 9's five places. The repo-side greps depend on the
  other workers' code; the host and pack proofs are the PM's.
* `DATA_SYNTAX.md`: `### The pgvector store, scoped to bb2dash` (1), `grep -c workspace_text_embeddings_hnsw`
  gives 2, `grep -c hybrid_search_workspace_text` gives 4; the pointer line is at the end of the Search layer
  section; the Workspace heading now reads migrations 140-143, 190-198; a block lists every new object.

## Task 22 (the branch half)

The three expected lists now hold after 193 and 196: the runner's eleven in `phase21_142_workspace_runner.sql`
and `phase21_143_review_round.sql` (sorted in `collate "C"`), and `workspace_ingest_runner(inherit=f,set=t)` in
`phase15_100_db_test_runner_role.sql`. **They read RED against prod until 193 and 196 are applied; that is
expected, not a fault.** Red runs today: `phase21_142 (shape): workspace_runner executes the SECURITY DEFINER
functions [workspace_begin,workspace_claim,workspace_finish,workspace_heartbeat,workspace_stream]`; the same
for 143; `phase15_100: db_test_runner memberships are ..., workspace_runner(inherit=f,set=t), expected ...`.
With all nine applied in the stand-in, 143 passes and 142 passes through its shape section and fails only
later on the stub's missing `agent_requests` table (a stand-in gap). The main-branch version of these lists
stays as it is until the port PR.

## Standing units that pin a count or a list (the brief's Risks asked)

* **`db/tests/phase15_101_search_path_pin.sql`, section (c), pins that `authenticated` may execute exactly
  these SECURITY DEFINER functions in `public`: `app_owner(), calendar_push_now()`** (and that anon executes
  none). **The brief's two-apply list (193, 196) misses this: 190 adds three definer functions executable by
  `authenticated` and 194 adds a fourth, so this unit goes red on the day of the first of those applies.** The
  list after 190 and 194 is `app_owner(), calendar_push_now(), workspace_ask_with, workspace_document_delete,
  workspace_upload_register, workspace_upload_retry`. The file is not mine to edit (it is not on my list); the
  PM needs a one-line test-only change to it in the same port PR, or earlier for 190. The brief itself
  anticipated this (the four functions "are recorded in 109c" if the advisor lists them) but not the unit.
* `phase15_100` pass row and `phase15_101` pass row print counts (functions callable by the test login, public
  functions, table write grants): informational, not asserted. 192 grants the test login execute on its three
  functions and 190/193/194/195 grant it insert/update/delete on the new tables, so those figures grow.
* `phase12b_076`: counts owner-scoped policies with a floor of 35 (more is fine) and rejects a bare
  `auth.uid()`; every policy added here, the four on `storage.objects` included, uses the initplan form.
* `phase15_101` (a) every function in `public` pins `search_path` and (b) every public view is
  `security_invoker`: both hold for the new objects.
* `phase14_091_files`: `sync_runner` holds no privilege on any public table or view: unaffected.
* `phase18_121` pins the ACL of `hybrid_search_file_text`/`search_file_text`: untouched.
* `phase21_140_workspace_tables.sql` passes unedited with 190 and 194 and again with all nine in the stand-in.

## Defaults taken (nobody could answer; each is mine, the PM can overrule)

1. `v_workspace_memory` names its first column `document_id` (the brief says "document id").
2. `workspace_upload_register` checks the hash first, then returns the row that holds it (in any state)
   before it checks the other arguments; so a repeat with a bad title or link still returns `existing` true.
3. `workspace_ingest_finish('indexed')` also refuses a document with a unit that has **no stored vector**,
   not only one with no `embedded_at` (so the store's "indexed without a vector is zero" holds even if an
   embedder marks a unit and fails to store). A claim whose lease ran out counts as a try; the third ends the
   row `failed` (`extract_failed` for a read, `embed_failed` for an embed) and clears the link. `put_text`
   renews the lease. The ingest role has `statement_timeout = 30s` and connection limit 4.
4. All three 192 functions (the twin included) are `service_role` only, plus execute for `db_test_runner`;
   the twin is called once for each document kind so `p_limit` is a kind's limit; `p_limit` is clamped 1 to 50;
   a material row's passage is the course search's own snippet, an upload/memory passage is the matched part
   cut to 2,000 characters; `has_notes` is `position('[notes]' in passage) > 0`.
5. 191: the insert and update policies also pin the object name to `u/` + 64 hex characters; an existing
   bucket row is brought to the settings (`on conflict do update`). The 190 explicit grants to `service_role`
   (select on `workspace_documents`, select/update on the units, select/insert/delete on the vectors) are so
   the search and the embedders do not rest on a default ACL I could not read.
6. `workspace_ask_with` always writes an options row (defaults when none given); an unknown course display id
   is 23514, a disabled routine counts as unknown (23503); the options are validated before the frozen
   `workspace_ask` is called.
7. `workspace_turn_context`: the messages are taken newest first while the bytes before a message are under
   200,000 and the count is at most 60 (the message that crosses the limit is kept, so the newest is never
   lost); `messages_left_out` is the eligible count minus the kept; the course list reads `courses` directly
   (`title_short`, `coalesce(parent_course_id, id)`), which is `v_course_display`'s display id.
8. `workspace_turn_put`: a bad kind or origin is 22023 (not dropped), a missing id is dropped, a row past the
   40th is cut but the shape of every row is still checked; a unit's own row overrides the ids, course, unit
   and title the runner sent; a call with facts replaces the sources and sends the event only on the first
   insert of the turn row; an append call adds after the highest `ord`.
9. `workspace_planner_feed`: undated rows are included after the dated ones and count in `work_more`;
   `stable`; a window turned round is made empty at its start.
10. Jobs: lease 5 minutes; "parked" means three failures and no finished message newer than the last claim
    (`job_claimed_at` is kept when the lease is freed for that reason); failures are shared by both job
    kinds; a rolling job is not held to `archived` (the brief says only memory is); memory eligibility is a
    finished assistant message with no error code; `memory_written_at` is the job's `p_through`; a memory
    document's title is the conversation's title cut to 200; a new summary deletes and re-inserts the unit
    (so a late embed of the old text meets no unit).
11. `workspace_job_claim` with `rolling` first, then `memory`; `workspace_claim_v2` takes advisory lock key
    1400910024.
12. Unit file names: the brief's proposals, plus `phase24_196b_feed_jobs.sql` for the second half of 196.

## What the stand-in caught (all fixed before commit)

A `$'` in a JS replacement string that duplicated half of 193 (my edit tooling, found because the file would
not parse); `end then` inside a PL/pgSQL `if` (196); a JSON null read as an array (194); a `->>` binding
inside a `||` chain (196b); the twin's `limit` shared across kinds so `p_limit 1` lost the memory kind (192);
the sources' cap checked before the shape (196, so a full list took a malformed row silently); `E'...'`
continuation strings (194); a record named `r` hiding a SQL alias (store proof); the vector of a long upload
polluting another query (192); an own-runner name already holding a document (193); a parked conversation
re-entering through a released one (196b); the test's own conversations being eligible for memory (196b);
a missing grant of the stub (stand-in only); and `format_type` for a vector in 190's guard, replaced by
`atttypid`/`atttypmod`.

## What can only be proved after the applies

* **A green run of every unit against prod** (all of the above are red today by construction; the stand-in
  is not prod). In particular: prod's default ACLs (my explicit grants and revokes assume anon and
  authenticated start with everything), the `service_role` grants, `has_function_privilege('public', ...)`,
  PG17, and the real `v_work_items` and `v_gradebook_latest` rows through `workspace_planner_feed`.
* The bucket row (private, 20971520, six types) and the policies' behaviour on real storage requests: the
  test login cannot read `storage`; probes P-7 and the acceptance run prove it.
* `phase24_store_proof.sql` PASS: needs all nine applied. The course half of proof 4 and proofs 1, 2, 3, 7
  already agree with prod today.
* The Realtime event `sources` that `workspace_turn_put` sends (the stand-in stubs `realtime.send`; unit 142
  has the partition caveat for stored sends).
* Whether Supabase's advisor lists the four browser functions (SECURITY DEFINER, open to `authenticated`).
* The `xmax = 0` test that tells a first insert of a turn row from a replacement (PostgreSQL behaviour known
  and passing on PG16; recheck on prod's 17 in the dry run).

## Order for the PM's dry runs (each is `begin; <migration>; <unit body>; rollback;`)

`190`, `191`, `192`, `193`, `194`, `195`, `196`, `197`, `198`: numeric order, because each file needs only
lower numbers. Dependencies the brief's "apply as they pass" list should know: **197 needs 193** (it reads
the heartbeat table), 196 needs 194 and 195, 192/193/194/195 need 190, 190's memory-delete branch needs 195
(its unit is 195's). So 193 cannot wait for 196's day if 197 is to apply before it; either apply 193 with
197, or move 197 to 193's day. 198 stands alone and may go first. The dry-run units: 190 pairs with
`phase24_190_store.sql`, 195 with `phase24_195_turn_state.sql` (it also covers 190's memory branch), 196 with
both `phase24_196_runner_v2.sql` and `phase24_196b_feed_jobs.sql`, and after the ninth apply
`phase24_store_proof.sql`, `phase21_140_workspace_tables.sql`, `phase21_142`, `phase21_143` and
`phase15_100`, with the `phase15_101` change above.

## Round 3: migration 199, the review round

Files: `db/migrations/199_workspace_review_round.sql` (`create or replace` and `comment on` only, no table or
column; grants re-stated; a guard) and `db/tests/phase24_199_review_round.sql`. The unit is red against prod
until 199 is applied: `FAIL phase24_199: migration 199 is not applied (workspace_job_claim is still 196's)`.
Green only in the stand-in (190 to 199 applied, every phase24 unit, 140, 143 pass; 197 passes too unless the
stand-in's non-invoker stub view is fed a seeded course unit, a stand-in artefact). A dry run adds
`grant workspace_runner to postgres with inherit false, set true;` and the same for `workspace_ingest_runner`.

1. **Rolling job.** A message is old when the bytes of the messages NEWER than it pass 14,000, and the newest
   finished message (after the through-point) is never old. A last answer of 20,000 bytes with only the
   question behind it gives no job; with three 5,000-byte messages behind it the job is the question and the
   three, `through` is the third's time, and the next request's context holds the answer verbatim.
2. **Ingest wait.** The time is `claimed_at`: `retry` now sets it to the time of the try (it cleared it); the
   claim skips a row with attempts > 0 and a `claimed_at` younger than 60 s times attempts. Counted by state, so
   `v_workspace_index_status` is unchanged. The unit moves the clock by setting `claimed_at` back (the
   `updated_at` trigger would overwrite that column).
3. **Job finish.** The claim records the kind in the holder, `rolling:<runner>` or `memory:<runner>` (no new
   column); finish needs that exact holder and a lease under 5 minutes old, for every outcome.
4. **Turn put.** Attachments cut to `{kind, id, state}`, malformed elements dropped, five kept; titles come
   from the database row (cut to 200) and the feed's is fixed. The prior code already took material, upload
   and memory titles from the row; it did not cut them or fix the feed's.

**Embed time bound (answer).** Yes: today `retry` always counts a try, and the third ends the row `failed`, so a
document that makes progress and runs out of time would burn its tries. 199 adds the outcome `release` to
`workspace_ingest_finish` (only for a document in `text_ready`, held by the caller: lease freed, attempts
unchanged, state stays, claimable at once). The fixture README gains the outcome (the PM writes it).

**Units of applied migrations that 199 moves (edited, and why).** `phase24_193_ingest_role.sql` section 3d: the
retry loop claimed the same row at once; it now asserts the wait (not at once, not 1 s early) and moves
`claimed_at` back. `phase24_196b_feed_jobs.sql`: the simulated holds are now `'memory:' || runner`; the first
rolling job is the question and A to D through D (196 included E, the fourth newest message), and the second job
starts at E. `phase24_196_runner_v2.sql` unchanged.

**Defaults.** The wait uses `claimed_at` rather than `updated_at` (any edit bumps the latter); a row with a null
`claimed_at` (never tried, or swept) waits for nothing. Release is refused outside `text_ready`.
