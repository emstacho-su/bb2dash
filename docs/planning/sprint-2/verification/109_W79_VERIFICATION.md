# 109 W-79 verification: ingest, sync and containers (tasks 36 and 39)

Branch `feat/workspace-24-ingest`, worktree `bb2dash-wt-24-ingest`. This run covers tasks 36 and 39.
Tasks 37 and 38 (the images, the compose blocks, the firewall forks, the apply gate test) are not
started: they wait for the runner's task 32 and the search worker's task 25. No file under `docker/`,
no `compose.yaml`, no other worker's folder was touched. No docker command, no database call, no
secret file was opened. All bytes and text in the tests are synthetic.

## Task 39: the sync's embed loop on every files pass, and the report rule

Commit `99fbf1f`.

Red run (`cd sync && npx vitest run test/files.test.ts test/report.test.ts test/loop.test.ts`, after the
new cases were written and before the source changed):

```
 Test Files  3 failed (3)
      Tests  5 failed | 79 passed (84)
 FAIL  test/files.test.ts > ... an embed that exits non-zero on a pass with no new unit is still reported, with unitsPosted 0
       expected undefined to be 0
 FAIL  test/loop.test.ts > ... Phase 24a: a pass with no new unit and an embed exit of 1 closes done, keeps the line and files the request
       expected 'failed' to be 'done'
 FAIL  test/report.test.ts > ... an embed failure on a pass that posted no unit is a line and never the error (Phase 24a)
       expected 'failed' to be 'done'
```

Green run (whole sync suite, `cd sync && npx vitest run`; typecheck `npx tsc -p tsconfig.json --noEmit`
prints nothing):

```
 Test Files  7 passed (7)
      Tests  166 passed (166)
```

What changed:

* `sync/src/files.ts`: `runFilesStep` calls `p.embed()` on every pass and returns `unitsPosted`.
* `sync/src/loop.ts`: `FilesStepResult` gains `unitsPosted`; `finishRun` passes it to `buildReport`.
  `requestInboxApply` is untouched: a null from the call is still "nothing to apply" (tested).
* `sync/src/report.ts`: `ReportInput.unitsPosted`. With exactly 0, an embed failure is the line
  `Embedding did not finish: <message>; it is tried again at the next sync` and never the error. With
  units posted, or `unitsPosted` left out, it is `Sync runner: embedding failed: ...` and fails the sync, as today.
* No model enters the sync.

Tests changed in the files the brief names, and why:

* `sync/test/files.test.ts`: the case "spawns embed_corpus.mjs once after at least one unit, and never
  on none" is replaced by "runs the embed loop once on every pass" (renamed, rule reversed); the
  embedError case now expects the key `unitsPosted`; two more cases expect one embed call where they expected none
  (a text POST that answers 409/23505; a text POST error).
* `sync/test/loop.test.ts`: the fake files results carry `unitsPosted: 0`; three new cases (pass with
  no unit and exit 1 closes done, report holds the line, request filed; units posted and an error
  still fails and files nothing; a null from the apply call reads as nothing to apply).
* `sync/test/report.test.ts`: three new cases.
* `sync/test/integration.test.ts` (not named in the brief's list, but it is the test of `loop.ts` and
  `files.ts` on fakes): the second pass of the replay now shows `embed` in its call order, since the
  embed runs on a pass with no new unit. One literal changed. Flagged here as the one file I touched
  beyond the named test files.

## Task 36: the ingest worker and the parser's loop (`workspace-ingest/`)

Commit `e1374b4`.

Red run (`cd workspace-ingest && npx vitest run`, tests written, no source yet):

```
 FAIL  test/process-document.test.ts [ test/process-document.test.ts ]
Error: Cannot find module '../src/process-document.js' imported from .../test/process-document.test.ts
 FAIL  test/worker-loop.test.ts [ test/worker-loop.test.ts ]
Error: Cannot find module '../src/config.js' imported from .../test/worker-loop.test.ts
 ... (the other four test files fail the same way on their own module)
 Test Files  6 failed (6)
      Tests  no tests
```

Green run (`npx vitest run --coverage`; `npm run typecheck` prints nothing; `npm run build` bundles
the three entries; `parser-main.js` imports only node built-ins and `../../ingest/pull_files.mjs`):

```
 Test Files  6 passed (6)
      Tests  97 passed (97)
 Statements   : 95.91% ( 352/367 )
 Branches     : 90.23% ( 231/256 )
 Functions    : 98.14% ( 53/54 )
 Lines        : 98.36% ( 301/306 )
```

Coverage is of `src/`, `main.ts`, `parser-main.ts` and `healthcheck.ts` excluded (they only run on
load, as apply's do). Thresholds: lines 80.

The check's cases and where they are (`test/process-document.test.ts` unless named):

| case | test |
|---|---|
| hand-over through the exchange folder, units read back | "goes to the parser through the exchange folder..." |
| no answer in 330 s gives `extract_timeout` | "no answer inside 330 s...", "waits the whole 330 s" |
| answer over 64 MB gives `extract_failed` | "an answer over 64 MB..." (a sparse file of 64 MiB + 1 byte) |
| folder empty after each document, whatever its end | the same cases assert `listDir(dir)`; `exchange.test.ts` |
| bad first bytes give `bad_bytes` | "bad first bytes...", "a file under 1,000 bytes..." |
| 12-byte plain text gives one unit `doc` | "a 12-byte plain text file..." |
| NUL byte gives `bad_bytes` | "a NUL byte gives bad_bytes" |
| docx written as `.docx` whatever its title | "writes a docx under .docx..." (the request names `doc-17.docx`) |
| other host / not ending in the key refused before any request | "the link" block: 10 refusals, `fetch` never called |
| redirect not followed | "a redirect is not followed" (`redirect: 'manual'`, one call) |
| 1,001 units give `too_many_units` | "1,001 units..." |
| expired link gives `link_expired` | "an expired link..." and "a missing link..." |
| three failed tries give `failed` | "three failed tries give failed" (a fake that counts as the SQL does) |
| embed call carries the document's id | `db-embed.test.ts`, "posts to workspace-embed...", "keeps the document id across the loop's repeats" |
| log lines hold ids/states/timings only, never stderr | "a log line holds ids, states..."; sentinel strings in errors never reach a log (several cases) |
| hash mismatch gives `bad_bytes`, no unit put | "bytes that do not hash to the row sha256..." |
| docx with one empty unit gives `no_text`; no unit gives `no_text`; empty unit among others left out | three cases |
| claimed memory document starts at the embed call, no download | "a claimed memory document starts at the embed call..." |

Also tested: the parser's loop (`parser-loop.test.ts`): one request at a time; `extractUnits` called
with the 300 s limit in its `run` argument and a child environment of only what uv needs; a file name
that is not exactly `doc-<id>.<ext>` refused (7 forms, among them `../etc/passwd`); the answer written
atomically; `ETIMEDOUT` is `extract_timeout`, anything else `extract_failed`, with no message kept;
a static test that none of the parser-side sources names a secret path or imports a network, database
or `fetch` call. The alive file is touched from a worker thread (`alive-beat.test.ts` blocks the main
thread the way `execFileSync` does and shows the file stays fresh). The four database calls match
the fixtures' argument names and order, and every statement is a `select` of one of the four
functions (`db-embed.test.ts`). Config: role, port, sslmode and publishable-key refusals, no secret
in a message (`worker-loop.test.ts`).

## Defaults I took

1. **Exchange files** (documented in `workspace-ingest/README.md`): `doc-<document id>.<ext>`,
   `request.json` `{document_id, file}`, `answer.json` `{document_id, ok, units}` or
   `{document_id, ok:false, error}`, `alive`. JSON files are written as `.tmp` and renamed. The worker
   clears the folder before and after each document; "empty" means empty but for `alive`. Answers carry
   the document id so a late answer cannot be taken for the next document.
2. **The parser's alive beat runs in a worker thread** (`alive-beat.ts`), not a timer on the main
   thread: `extractUnits` uses `execFileSync`, which blocks the main thread for up to 300 s, and a
   main-thread timer would stop. Healthcheck thresholds: parser 35 s, worker 90 s.
3. **Retry versus failed.** `failed` (no retry): `too_large`, `bad_type`, `bad_bytes`, `no_text`,
   `too_many_units`, `link_expired`, and a refused link (`download_failed`, no request made). `retry`:
   a download that failed or answered non-200 (a redirect included), `extract_timeout`,
   `extract_failed`, `embed_failed`. The database counts the three tries; the worker never counts.
4. **A failed `put_text` call** is a retry of `extract_failed`; a refused `indexed` is a retry of
   `embed_failed`. These two have no code of their own among the ten.
5. **The link's key** is derived as `u/<sha256>` (the claim carries no `storage_key`; the register
   function makes the key from the hash). The link must match the path exactly, query aside; no port,
   credentials or fragment. A missing link or one past `signed_url_expires_at` is `link_expired`.
6. **A claim of kind `upload` with step `embed`** (units already put) skips the download, as a
   memory item does.
7. **The parser's extractor** copies `uvEnv` and `makeExtractor`'s approach from `sync/src/files.ts`
   rather than importing that file (it pulls the sync's types and ports in). `INGEST_DIR` is
   `/app/ingest`.
8. **The worker's own paths**: runner id `workspace-ingest@<12 hex>`, run directory `/run/ingest`,
   alive file `/run/ingest/alive`, poll 5 s, heartbeat 30 s.
9. **The embed call** is `runEmbedLoop` with a `post` of my own to `.../functions/v1/workspace-embed`
   (the unedited `makePost` is hard-wired to `embed-corpus`); it adds `document_id` to each body and
   keeps `makePost`'s never-throws contract. `limit` 40 and `max_parts` 3, as `embed.json` shows.
10. **Package dependencies** are those of `apply/` (`pg`; dev: types, vitest, coverage, esbuild,
    typescript), the lock file copied from `apply/` and re-resolved for the new name. No existing lock file changed.
11. Fixtures and brief agree everywhere I looked; no difference to report. The claim fixture carries no
    `storage_key` (see 5).

## Not done / for the PM

* Tasks 37 and 38, as instructed. Nothing in `docker/`, `compose.yaml`, `apply/`, `workspace/`.
* No end-to-end run against the real parser, `uv` or `pdftotext` (no parser binary in the suite by
  design); P-7 and P-11 are the PM's, on the pushed work.
* `sync/test/integration.test.ts` was edited (one literal), see task 39.

## What tasks 37 and 38 will need from the image

* Layout: `/app/workspace-ingest/dist/{main,parser-main,healthcheck}.js` (built with `npm run build`,
  `npm ci` first), `/app/ingest/` beside it (the bundles import `../../ingest/*.mjs`), `node_modules/pg`
  next to `dist`'s parent for the worker, the pinned CA at `/app/certs/prod-ca.crt`.
* Worker: user `node`; command `node /app/workspace-ingest/dist/main.js`; secrets
  `workspace_ingest_db_url` and `supabase_anon_jwt` at `/run/secrets/`; `/run/ingest` created and owned by `node`;
  `/exchange` mounted; network `ingest-net`; healthcheck `node /app/workspace-ingest/dist/healthcheck.js worker`.
* Parser: user `extract` (set in compose); command `node /app/workspace-ingest/dist/parser-main.js`;
  `uv`, the locked Python set (`/app/ingest/pyproject.toml`, `uv.lock`) pre-synced into a place the user
  can read, `pdftotext` (poppler-utils), a writable `UV_CACHE_DIR` and `UV_*` settings for a read-only root,
  `network_mode: none`, healthcheck `node /app/workspace-ingest/dist/healthcheck.js parser`.
  Note `uv run --locked` must work offline there.
* The exchange volume must let the worker (`node`) remove what the parser (`extract`) writes in it.
