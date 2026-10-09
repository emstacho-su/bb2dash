# 109 W-95 verification: the acceptance pack of Phase 24a (task 45)

Branch `feat/workspace-24-pack`, cut from `feat/workspace-24`. Worker W-95. Nothing was run live:
no `just accept`, no docker command, no Playwright test against the site, no database call, no
Supabase MCP tool. The pack is checked on paper by the static suite, by the proofs' own statements
run against an in-process Postgres (PGlite) with synthetic rows, and by the router run over each
question.

## Red and green runs

Red, with the tests added first (`node --test acceptance/acceptance.test.mjs`, pack 24 absent):

    ℹ tests 53   ℹ pass 41   ℹ fail 12
    ✖ Phase 24: the stages are the brief's, in order, and the go-live stage stops nothing it does not own
      Error: pack 24: acceptance/24/manifest.json is missing
    (and the eleven other Phase 24 cases, each on the same missing file)

Green, after the pack and `accept24.spec.ts` / `accept24.lib.ts` were written (and one more case
added, below):

    node --test acceptance/acceptance.test.mjs          ℹ tests 55   ℹ pass 55   ℹ fail 0
    cd scripts && npm test                              ℹ tests 260  ℹ pass 260  ℹ fail 0
    cd web && npm ci && npm run typecheck               clean
    cd web && npx eslint . --max-warnings 0             clean
    npx playwright test -c e2e/accept.config.ts --list  Total: 30 tests (11 of pack 21, 7 of 23, 12 of 24);
                                                        the 12 titles of pack 24 are listed, skipped, and
                                                        none appears under e2e/playwright.config.ts

The generic case `pack 24: the manifest, the browser tests, the proofs and the playbook agree`
(`packProblems`) is run for the pack by the existing loop over `acceptance/<NN>/`. There is no
command line for it: `node acceptance/pack-check.mjs 24` prints nothing (the file is a module; the
README names `node --test acceptance/acceptance.test.mjs` as the check).

The proofs file of the scripts (`scripts/accept-proofs-db24.test.mjs`) was written after the pack,
against it, so it has no red run of the usual kind. Its first run failed 22 of 22 on a column my
stand-in table lacked (`signed_url_expires_at`); the second failed 1 of 22 on a wrong expectation
of mine in `store-counts` (twice: a bigint comes back as a number in PGlite, and the column that
differs when a course vector is missing is `course_vectors_ok`). Then 22 of 22. Each proof is shown
to pass on a right row and to fail on each wrong one.

## The steps

Stages: `prepare`, `go-live` (host), `walk` (sandbox), `walk-proofs` (host), `upload` (sandbox),
`indexed` (host), `find` (sandbox), `delete` (sandbox), `store-proofs` (host).

| step | who | what | proofs it carries (all read-only, ids/states/counts/timings, no text) |
|---|---|---|---|
| 0 | host | `runner.record`, planner read (saved as `planner_before`), `workspace.ensureProfile`, `workspace.start`, `workspace.doctorRow`, `ingest.start`. No `workspace.stopTestRunner`: nothing is stopped that the pack does not own | `planner-fingerprint` (pack 21's, verbatim; blocked while a sync or Inbox apply is open) |
| 1 | human | Usage credits are off | |
| 2 `2 open workspace` | auto | the page opens from the top bar | none (as pack 21's step 2) |
| 3 `3 course question` | auto | a course question | `turn-found`: done, this run, md5, turn row stored, `retrieval_state` found, `found_n` and `passages_n` >= 1, a source of kind material and origin auto |
| 4 `4 lookup one turn` | auto | a lookup | `turn-lookup`: `plan_state` skipped, tier low (turn row and answer) |
| 5 `5 standard plan` | auto | a Standard question, wording sends it to mid | `turn-planned`: tier mid or high, `plan_state` in (planned, fallback), `plan_ms` not null |
| 6 `6 planner feed` | auto | a planner question | `turn-feed`: `feed_rows` >= 1 and exactly one source of kind feed |
| 7 `7 follow-up` | auto | a follow-up into step 3's conversation; archives it | `turn-followup`: step 3's request is done, in the same conversation, earlier; `workspace_conversations.claude_session_id` is null |
| 8 `8 nothing matches` | auto | invented words; first line of the answer is the fixed sentence (`lines.txt`, key `empty`) | `turn-empty`: `retrieval_state` empty, `found_n`, `passages_n`, `memory_n` 0, no source of kind material/upload/memory |
| 9 `9 stop then answer` | auto | Stop on a long mid-tier answer, then a short question in the same conversation | `turn-stopped` (pack 21's, plus the turn row), `turn-done-after-stop` (the next request is done, later, same conversation, the stopped one ended cancelled) |
| 10 | host | planner as it was | `planner-unchanged` (pack 21's, verbatim) |
| 11 `11 upload file` | auto | draws a nonce; object under `u/<sha256>` in `workspace-uploads`, signed link of 7 days, `workspace_upload_register`; notes `nonce_id`, `sha256`, `document_id` | none |
| 12 | host | wait for the ingest worker | `upload-indexed` by `db.proofUntil` (10 reads, 10 s apart): one upload row holds the hash, it is the noted document, `indexed`, made in this run (`since`) |
| 13 `13 find upload` | auto | a question made of words of the file; archives its conversation | `turn-upload-found`: this step's question, done, a source of kind upload and origin auto naming the document, which is `indexed` |
| 14 `14 send twice` | auto | the same file is sent again: nothing uploaded, `existing` true | `upload-one-row`: exactly one upload row holds the hash, the noted document, made in this run |
| 15 `15 delete upload` | auto | `workspace_document_delete(id, false)`, remove the object, `workspace_document_delete(id, true)` | `upload-gone`: no row holds the hash, none has the id (`uploads_deleting_now` is reported, not a condition); `conversations-unarchived`: at least 7 conversations made in this run (steps 3+7 share one; 4, 5, 6, 8, 9, 13 one each) and none listed |
| 16 | host | the store's five reads | `store-extension`, `store-vector-columns`, `store-vector-indexes` (task 49's proofs 1, 2, 3 in reduced form, see Deviations), `store-counts` (proof 6, whole), `store-no-links` (proof 7, reduced) |

Proofs: 20 in `proofs.json`. Every question proof takes `since` (`carry:run.started_at`) and the md5
of the question the step types; a test of the pack holds each md5 to the constant in the spec, and
holds each question to the router (`workspace/src/router.ts` is imported by the test, Node strips
the types): lookups go to low, the two Standard questions to mid, the follow-up keeps low.
Steps 4, 5, 6 and 8 also take `after` (the request of the step before), as pack 21's do.

No proof compares `uploads_indexed` (or any counter) between two moments. `store-counts` reads the
status view only against a direct count in the same statement.

## Why the Standard question is worded as it is

The page can only send Auto in 24a. `routeTier` returns `mid` when the prompt opens with neither a
lookup cue nor an execution verb and is not a short follow-up, so the Standard questions open with
`Explain`, name no execution verb in any clause, and are under 600 characters. The playbook's
preamble says so; so does a test (`Phase 24: the questions route the way the playbook says`). The
nonsense question of step 8 opens with `What` (low, no planning turn) and is made of invented
words; the preamble says it must stay nonsense.

## Shared files touched

* `acceptance/pack-check.mjs`: a `PROOF_ACTIONS` list (`db.proof`, `db.proofUntil`) used in the three
  places that matched `db.proof`. Without it a `db.proofUntil` action was never checked against
  `proofs.json` (name, parameters, carried values) and a host step's proof run that way was not
  seen as run. Three lines of use, two of definition. No rule was loosened.
* `acceptance/acceptance.test.mjs`: Phase 24's cases appended at the end (13 cases), after the
  existing ones; nothing of pack 21's changed.
* `scripts/accept-proofs-kit.mjs`: `PACK_24` beside `PACK_21` and `PACK_23`; the header comment.
* `scripts/package.json`: `accept-proofs-db24.test.mjs` added to the `test` script (it lists files).

Not touched: `acceptance/21/`, `acceptance/23/`, `accept21.spec.ts`, `accept23.spec.ts`,
`accept.lib.ts`, `accept.config.ts`, `accept.env.ts`, `walk21*`, `manifest.schema.json` (already
holds the three actions), `OPERATOR.md`, `README.md`, anything under `web/src/`, `db/`, `workspace/`,
`project-state/`, `compose.yaml`.

New files: `acceptance/24/{manifest.json,playbook.md,proofs.json}`, `web/e2e/accept24.spec.ts`,
`web/e2e/accept24.lib.ts` (the shared parts of the spec, so the spec stays short),
`scripts/accept-proofs-db24.test.mjs`.

## Deviations from the brief, and why (the PM decides)

1. **The hash is not what is carried; a nonce is.** The brief says the three reads are keyed on the
   hash "as a carried value". The host's carry-over (bb2dash-stack `scripts/lib/accept-carry.mjs`,
   `crosses()`) lets a field cross only when its name ends `_id`, `_ids` or `_at` and its value is a
   whole number, a uuid, a short list of those or a time. A 64-character hash never crosses. So the
   test draws a uuid (`crypto.randomUUID()`), writes the file as the fixed words plus that uuid,
   notes it as `nonce_id`, and the proofs make the hash themselves:
   `encode(sha256(convert_to('<the fixed words>' || $1::text, 'UTF8')), 'hex')`. A test of the pack
   holds the words in the proofs to the words in `accept24.lib.ts`, and the db test holds the SQL
   hash to Node's. This is stronger than a carried hash: the host derives the hash from the nonce
   and does not take the sandbox's word for it. `sha256`, `document_id` and `nonce_id` are all in
   step 11's facts, as the brief asks.
2. **Proofs 1, 2, 3 and 7 of task 49 are reduced.** The proofs script (`lintProofSql`) refuses any
   name starting `pg_`, the schemas `extensions`, `pg_catalog` and `information_schema`, and the
   words `set`, `into`, `share` and others; the README says "schema `public` only". Proofs 1, 2, 3
   and 7 read `pg_extension`, `pg_attribute`, `pg_index`/`pg_am`/`pg_opclass`, `pg_foreign_server`,
   `pg_foreign_table` and `pg_proc`. They cannot be carried as written. The pack carries what the
   script can read, and each `expect` says which half is left to the unit `db/tests/phase24_store_proof.sql`:
   * `store-extension`: `to_regtype('extensions.vector') is not null` (the type exists; no version);
   * `store-vector-columns`: both tables exist and neither holds a row with no vector (not that
     exactly two columns are of the type, nor `vector(384)`);
   * `store-vector-indexes`: `to_regclass` of both index names (not method, class or validity);
   * `store-no-links`: no `dblink_connect(text)`, `postgres_fdw_handler()` or `http_get(character
     varying)` function, in the search path or under `extensions` (not the catalog counts).
   Proof 6 is carried whole. **Two ways to make 1, 2, 3 and 7 whole**, both outside this worker's
   files: (a) a read-only view in `public` over the catalog (a security-invoker view, in migration
   199, which is slack) that the proofs then select from; (b) a narrow lint exception. I took neither.
3. **Step numbers.** 0 (go-live) and 10, 12 and 16 are host steps; the automated ones are 2 to 9, 11,
   13, 14, 15. A title of the first stage is `2 open workspace`, not `2 open`: pack 21 has a test
   titled `2 open`, `ACCEPT_ONLY` is an exact title, and `accept.config.ts` loads every
   `accept*.spec.ts`, so a duplicate would start two tests. A case of the suite now refuses a title
   that another pack holds.
4. **Where the "unarchived" proof is read.** `conversations-unarchived` is a proof of step 15 (the
   last sandbox stage), taking `min_conversations` 7 and `since`. It counts conversations created
   from 60 seconds before the run started, so a conversation of Stack's own started during the run
   would be counted and, listed, would fail it. The run is meant to be alone on the page.

## Defaults taken (nobody answers a worker mid-run)

* No `workspace.stopTestRunner`: "stop nothing you do not own". If an old test runner is up, that is the PM's.
* `ingest.start` comes after `workspace.start` and `workspace.doctorRow`; the services are left running (W-85's default).
* The Standard questions are mid, not high: no Opus is spent. The page cannot send Deep.
* Step 9's Stop uses a long mid-tier question; if the answer finishes before Stop, the test fails `inconclusive:` and the playbook allows one rerun, as pack 21's step 8.
* The follow-up (step 7) reuses step 3's conversation, so step 3 does not archive and step 7 does (the last step that uses it). A step that fails still archives what it opened (`archiveAfter`).
* The second send (step 14) calls the register function after finding the row, so that `existing` is witnessed; the brief's order says a found row uploads nothing, which holds (`uploaded` false).
* The test takes the owner's session from a read the page itself makes (pack 23's way) and calls the bucket and the four functions with `fetch` from the page; it uses no module of the app.
* `existing` and `document_id` are asserted by the test; the host's proofs read the table.
* The empty line is checked on the page: the first non-empty line of the answer element's `innerText` equals the sentence of `lines.txt`. If the page renders the first line inside a list or a heading that `innerText` splits differently, step 8 fails on the page and not in the proof.
* The `indexed` wait is `db.proofUntil`: 10 reads, 10 s apart. If the ingest worker needs longer, the constants are the host's (`accept-constants.mjs`).

## What the PM must check before the first live run

1. The text of `workspace.start` and `ingest.start` on `main` of bb2dash-stack (the pack names them).
2. That the extract and ingest services are healthy and the worker's login can reach the bucket's signed links.
3. That the page's own CORS and CSP let the page `fetch` the project's storage path (pack 23 does it for REST).
4. Deviation 2: whether to leave proofs 1, 2, 3 and 7 reduced.
5. That nothing else uses the Workspace during the run (deviation 4).

## Round 2: the four reduced store proofs are whole

Merged `origin/feat/workspace-24` (a merge). Migration 199 adds `public.v_workspace_store_proof`
(one row, security invoker; columns in the order `extension_version`, `extension_schema`,
`extension_ok`, `vector_columns`, `vector_columns_ok`, `vector_indexes`, `vector_indexes_ok`,
`foreign_servers`, `foreign_tables`, `link_extensions`, `store_functions_that_call_out`,
`no_links_ok`). The PM applies 199 before the first live run; until then these four proofs find no
relation and give no verdict.

The four statements now read, each one `select` from the view with `ok` the matching `_ok` column:

* `store-extension`: `select v.extension_ok as ok, v.extension_version, v.extension_schema from public.v_workspace_store_proof v`
* `store-vector-columns`: `ok` is `vector_columns_ok`; detail `vector_columns_list` (the text split at `, `, one element a column) and `vector_columns_n`.
* `store-vector-indexes`: `ok` is `vector_indexes_ok`; detail `vector_indexes_list` and `vector_indexes_n`. An element is longer than 64 characters, so the host's detail filter shows it as `withheld`; the count stands. (The raw lists hold blanks and are longer still, so they would be withheld whole; splitting them is what keeps the short ones visible.)
* `store-no-links`: `ok` is `no_links_ok`; detail the four counts.

The earlier reduced checks (`to_regtype`, `to_regclass`, null-vector scan, `to_regprocedure`) are
removed: the view says all of it and more. `store-counts` is unchanged. Manifest step 16's text is
updated; the playbook has no section for host step 16, so it needed no change.

**How the kit gets the view:** a stand-in. The view reads `pg_*` and the type `extensions.vector`,
which the in-process Postgres (no pgvector) cannot run. `accept-proofs-db24.test.mjs` creates a table
named `v_workspace_store_proof` with the view's twelve columns, sets its one row to the unit's
expected row (section 5 of `phase24_199_review_round.sql`) with the changes a case makes, and a case
holds the stand-in's column list to the migration's own view definition (via `columnsOf`). So the
tests hold the statements to the columns and to what each `_ok` says; the catalog answers are the unit's.

Gates: `node --test acceptance/acceptance.test.mjs` 55/55; `npm test` in `scripts/` green (db24: 23/23).
