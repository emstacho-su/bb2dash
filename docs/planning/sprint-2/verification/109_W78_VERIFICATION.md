# 109 W-78 verification: search and embed (Phase 24a, tasks 23 to 26)

Branch `feat/workspace-24-search`, worktree `bb2dash-wt-24-search`. Sonnet 5.5. Nothing deployed, no
live call, no database, no docker. All test text is synthetic. Deno is not on this machine, so the
function code is tested under Node (v24.19.0, type stripping) with the pure logic in files Node can
import.

## Task 23: `_shared/chunk.ts`, the unit picker, the write step, `workspace-embed`

Files: `supabase/functions/_shared/chunk.ts` (`findCut` and `chunk` copied from `embed-corpus`),
`_shared/embed-plan.ts` (body parser, unit picker, planner, write step, answer builder),
`_shared/chunk_test.ts` (21 tests), `workspace-embed/index.ts` (the I/O).

Red (test written first, nothing of `embed-plan.ts` yet):

```
$ node --test supabase/functions/_shared/chunk_test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\supabase\functions\_shared\embed-plan.ts'
 imported from ...\supabase\functions\_shared\chunk_test.ts
```

Green (commit 8071a44):

```
ℹ tests 21   ℹ pass 21   ℹ fail 0
```

What the 21 cover: `findCut` and `chunk` textually equal to `embed-corpus/index.ts`'s (two tests that
extract each function's text and compare); the constants equal; an astral character does not shift a
part range; a body with no `document_id` is refused (nine bad bodies); the picker returns no unit of
another document and none for `failed`, `deleting`, a missing document or a different row; the plan
respects `limit` and `max_parts` and skips stored parts; the write step counts a 23505 as stored, fails
the unit on any other error, marks a unit that has no part missing even when this call stored none,
never marks a unit with no part (reported failed with its id), and names `gte-small` on every row it
builds; the answer's keys equal `embed.json`'s and the whole answer equals it.

## Task 24: `workspace-search`

Files: `workspace-search/search.ts` (the handler, free of Deno), `index.ts` (Deno wiring),
`search_test.ts` (11 tests).

Red:

```
$ node --test supabase/functions/workspace-search/search_test.ts
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\workspace-search\search.ts'
```

Then, with the module in, one test failed on its own over-broad check (it matched the word
`service_role` in a comment); the test was narrowed to the real claim (no `SERVICE_ROLE_KEY`,
`SERVICE_KEY` or `SB_SECRET` text, and every `env.get` names `SUPABASE_URL` only):

```
✖ no service key is read from the environment, by the code or by the handler
ℹ pass 10   ℹ fail 1
```

Green (commit 0c1637b):

```
ℹ pass 11   ℹ fail 0
```

Covers: the query is cut to 2,000 characters before it is embedded and sent; the caller's bearer is
forwarded to `/rest/v1/rpc/workspace_search` (with the caller's `apikey`, else the bearer's token);
no service key is read; each row of the answer carries the `kind` the SQL function gave it and the
answer equals `search-function.json`'s; a bad body is 400 with `{error}` (11 cases) and sends nothing;
42501/401/403 from the database is 403 `{error, code}`; any other database error is 500 and leaks no
message; a throwing embedder is 500.

## Task 25: the batch entry

Files: `mcp-server/src/batch.ts`, `src/workspace-shapes.ts`, `src/client.ts` (two new methods, a timeout
argument, the 404 hint names the function from the path), `test/batch.test.ts` (17 tests).

Red:

```
$ npx vitest run test/batch.test.ts
 import { BATCH_CALL_TIMEOUT_MS, runBatchCli } from '../src/batch.js';
 Failed to resolve import "../src/batch.js"
 Test Files  1 failed (1)   Tests  no tests
```

Green (commit aaa6381): `Test Files 1 passed, Tests 17 passed`. The answer equals `batch-answer.json`
exactly; the search body equals `search-function.json`'s body; a hostile passage (a `[M9999]` line, an
id-shaped JSON line) adds no hit and is kept whole; a 4xx is `refused` with exit 0; 5xx, network error
and abort are `failed`; stdout holds one object only (process.stdout and console.log spied); the vault
URL exits non-zero with no request; bad stdin exits non-zero with no request; stderr never holds the
query text.

Run on the built file (`npm run build`, a dummy key file in the scratchpad, outside the repo):

```
vault URL         -> "[bb2dash-batch] Config error: SUPABASE_URL points at harness-memory ..."  exit=1
stdin "nope"      -> "[bb2dash-batch] stdin is not JSON"                                        exit=1
empty request     -> {"version":1,"queries":[],"attachments":[]}  (stderr: counts only)         exit=0
```

## Task 26: limits and scope

Files: `mcp-server/src/limits.ts`, `src/config.ts` (`Config.limits`), `src/tools/search-materials.ts`,
`src/tools/get-material-text.ts`, `test/helpers.ts` (`makeConfig` gains `limits`), `test/limits.test.ts`
(18 tests). `src/server.ts` is unchanged and still registers three tools.

Red:

```
$ npx vitest run test/limits.test.ts
 import { NO_LIMITS, type Limits, readLimits } from '../src/limits.js';
 Failed to resolve import "../src/limits.js"      Test Files 1 failed, no tests
```

Two real failures on the way to green, both mine: a circular import (config -> limits ->
tools/schemas -> config left `MODES` undefined at load; fixed by a local `errorResult` in `limits.ts`)
and a plural bug ("3 searchs"; the test caught it; fixed with explicit singular/plural words).

Green (commit 538b0c3): `Test Files 8 passed, Tests 141 passed`.

Covers: with no environment value nothing changes (twenty searches run); a fourth search is an error
result and sends no request; the eleventh read likewise; zero allows none; searches and reads are
counted apart; an invalid call or a refused (out-of-scope) call uses nothing up; with a scope a search
for another course, or for none, is an error result; a read by id is not scoped; bad env values are a
`ConfigError` naming the variable; over the in-memory protocol a call past its limit is `isError`, not a
rejection, and `listTools` still shows three names.

## Final figures

```
mcp-server: npm run typecheck  clean
            npx vitest run     8 files, 141 tests, all pass
            npm run build      clean
            coverage           statements 94.57, branches 87.85, functions 94.56, lines 94.97
node --test _shared/chunk_test.ts workspace-search/search_test.ts   32 tests, 32 pass
smoke:      SUPABASE_SERVICE_ROLE_FILE=<dummy file in scratchpad> node scripts/smoke.mjs --tools-only
            PASS  three tools advertised  -- get_material_text, list_courses, search_materials
```

The smoke script has the `--tools-only` mode on this branch. No test file was renamed.

## Defaults I took

1. **Tests for `workspace-embed`'s pure steps live in `_shared/chunk_test.ts`** (so the DoD's one
   `node --test` line covers them), the new pure module is `_shared/embed-plan.ts`, and
   `workspace-search`'s handler is `workspace-search/search.ts` with its test beside it
   (`search_test.ts`, run with `node --test` too). Not on the brief's list by name, inside my folders.
2. **`workspace-embed` on a missing document is 404; on a document in `failed`/`deleting` it is 200 with
   the empty answer** (zero units, `remaining_parts` 0). The picker returns no unit either way.
3. **`remaining_parts` = missing before minus (inserted + duplicates)**, so a 23505 counts as stored in
   the remaining figure; `inserted_rows` counts real inserts only. (`embed-corpus` subtracts inserts
   only, which would report a part a concurrent run stored as still remaining for one more call.)
4. **A unit whose parts are all stored but which has no `embedded_at` is marked in the next call**
   (a mark-only step), and a unit stops its parts at the first non-23505 error.
5. **The part's context header** is `{course_id} {kind} — {title}: ` (kind is `upload` or `memory`),
   the counterpart of `embed-corpus`'s `{course} {bucket} — {file_name}: `. `skip_parts` is not offered
   (not in `embed.json`).
6. **`workspace-search` calls the rpc with `fetch`**, not supabase-js: the caller's `Authorization` and
   `apikey` headers go through as sent (the bearer's token stands in when `apikey` is absent); no
   bearer is 401. `limit` is clamped to 1..50, as `search` clamps; a non-number is 400. `kinds` default
   to all three; an empty or unknown `kinds`, a non-list `courses` or a floor outside 0..1 is 400.
7. **The batch entry accepts at most 12 queries, 5 attachments and `max_chars` up to 1,000,000**; a
   request without `min_similarity` uses the configured floor (0.78), `null` sends none. Queries and
   attachment reads run in parallel, each with the 8 s limit; the answer keeps request order.
8. **A failed attachment read** (any error, shape drift included) comes back as state `failed` with the
   full key set, null title and course, zero counts and empty lists. The fixture README defines
   `failed` for an upload in `failed`; the runner cannot tell the two apart from this object and should
   treat both as "could not read".
9. **A query row of an unexpected shape fails the whole query** (`failed`), as `client.ts` does for the
   course search, rather than dropping the row.
10. **Limits are counted per `deps` object** (a WeakMap in `limits.ts`) so `server.ts` stays unchanged
    and the handlers need no extra argument; a count of zero is allowed and means none. The budget is
    spent after the arguments validate and after the scope check, so a bad or out-of-scope call costs
    nothing. `BB2DASH_COURSES` entries are matched exactly and case-sensitively.
11. **`README.md`'s test-count line** no longer states a figure; the figures are in this file.

## What the PM needs to know before deploying the two functions

* Neither function has run on Deno or against a database. The pure logic is tested; the Deno wiring
  (`Deno.serve`, `Supabase.ai.Session`, supabase-js reads and inserts) is modelled on `embed-corpus` and
  `search` line for line but untested here. Probe 8 and 9 are the first real runs.
* `workspace-search` needs migration 192 (`workspace_search`, granted to `service_role` only) on prod
  first; `workspace-embed` needs 190 (`workspace_documents`, `workspace_document_text`,
  `workspace_text_embeddings`). Both are deployed with `verify_jwt` on.
* `workspace-search` answers an anon or signed-in caller with 403, by design (the SQL grant refuses it).
  The batch child calls it with the service key as both `Authorization` and `apikey`, the way the
  materials client calls `search`; if the gateway will not take an `sb_secret_` key as a bearer on this
  function, that shows at probe 8 and would be a deployment matter, not a code one.
* The fixture folder README says `workspace-embed`'s `failed` entries are `{text_id, error}`; they are.
* Nothing outside my folders was edited. `project-state/`, `db/`, `web/`, `workspace/`, `sync/`,
  `apply/`, `ingest/`, `docker/`, `compose.yaml`, `search/`, `embed-corpus/` and `calendar-push/` are
  untouched; no lock file or dependency changed.
