# workspace-ingest (Phase 24a)

One image, `bb2dash-workspace-ingest:local`, two services that meet only in the exchange folder
`/exchange` (brief 109, freeze amendment F-3).

| service | command | holds | does not hold |
|---|---|---|---|
| `workspace-ingest`, the worker | `node /app/workspace-ingest/dist/main.js` | two secret files, the network `ingest-net`, the exchange mount | a model, a Claude token, a service key, a parser |
| `workspace-extract`, the parser | `node /app/workspace-ingest/dist/parser-main.js` | the exchange mount, `uv` and the locked Python set, `pdftotext` | any secret, any network, any other mount |

Healthcheck for both: `node /app/workspace-ingest/dist/healthcheck.js parser` (the parser's alive file
in the exchange folder, 35 s) or `... worker` (`/run/ingest/alive`, 90 s).

Build: `npm run build` bundles the three entries to `dist/`. Imports of `../../ingest/*.mjs` stay
external, so the image keeps `ingest/` at `/app/ingest` beside `/app/workspace-ingest`, as the sync
image does. Imports of `../../workspace/src/*` (`config`, `db`, `alive`) are bundled in.

## The worker

It claims one document at a time through the four `workspace_ingest_runner` functions (`db.ts`; no
table is touched), as runner `workspace-ingest@<12 hex>`:

1. A remembered item (kind `memory`), or an upload already in `text_ready` (step `embed`), goes
   straight to the embed call. No download is tried.
2. Otherwise (`process-document.ts`): the type must be one of the six (`bad_type`); the declared size
   at most 20 MiB (`too_large`); the link present and not past `signed_url_expires_at`
   (`link_expired`); the link `https`, on the project host, no port, credentials or fragment, path
   exactly `/storage/v1/object/sign/workspace-uploads/u/<sha256>` (`download_failed`, no request made).
3. One GET, `redirect: 'manual'`, only a 200 accepted, the body capped at 20 MiB. The bytes are hashed
   with `sha256Hex`; a difference is `bad_bytes` and nothing is put.
4. A text type (`text/plain`, `text/markdown`) is read here: valid UTF-8, no NUL byte, one character
   that is not white space (`bad_bytes`, `no_text`); the file is one unit, kind `doc`, number 1.
   A parsed type must pass `bytesLookValid` (`bad_bytes`), then goes to the parser (below).
5. Units with no character that is not white space are left out; none left is `no_text`; more than
   1,000 units or 1.5 million characters is `too_many_units`. The rest go in through
   `workspace_ingest_put_text`.
6. `runEmbedLoop` (unedited, `ingest/embed_corpus.mjs`) runs against `workspace-embed` with the
   document's id added to every body (`embed.ts`), then `workspace_ingest_finish` is called.

Outcomes: `failed` for what trying again cannot change (`too_large`, `bad_type`, `bad_bytes`,
`no_text`, `too_many_units`, `link_expired`, a refused link); `retry` for what it might (a download
that did not answer 200 or did not arrive, `extract_timeout`, `extract_failed`, `embed_failed`). The
database counts the three tries: the third `retry` ends `failed` with the code. A refused `indexed`
becomes a retry of `embed_failed`.

Logs hold ids, states, codes and timings (`ingest: document 17 indexed in 4210 ms (try 1)`). An error
is logged by SQLSTATE or class name only. No file name, text, error message, DSN or extractor stderr
is ever in one.

Timers: poll 5 s when nothing is handed out; heartbeat 30 s (touches `/run/ingest/alive`).

## The exchange folder (both sides are this package)

Names are fixed and never come from an upload's own name.

| file | written by | shape |
|---|---|---|
| `doc-<document id>.<ext>` | worker | the downloaded bytes; `<ext>` is `pdf`, `docx`, `pptx` or `xlsx` from the registered type |
| `request.json` | worker, after the file | `{"document_id": 17, "file": "doc-17.pdf"}` |
| `answer.json` | parser | `{"document_id": 17, "ok": true, "units": [{"unit_kind", "unit_no", "text"}]}` or `{"document_id": 17, "ok": false, "error": "extract_failed" \| "extract_timeout"}` |
| `alive` | parser, every 10 s, from a thread of its own | empty; its mtime is the health |

Rules:

* Every JSON file is written as `<name>.tmp` and renamed, so a reader never sees half a file.
* The worker clears the folder (the alive file apart) before writing a document and again after it,
  whatever its end: an answer, a timeout, an oversize answer, a throw. An answer whose `document_id`
  is not the current document's is ignored, so a parser that answers late cannot be taken for the next one.
* The worker waits 330 s (the parser's 300 s and 30 s for the hand-over), polling every 500 ms. No
  answer is `extract_timeout`.
* The worker reads `answer.json` as data: over 64 MB (checked with `stat` before any read), not JSON,
  not the agreed shape, or any unit with a wrong field is `extract_failed`.
* The parser takes one request at a time, deletes `request.json` when it takes it, and opens only a
  file named exactly `doc-<id>.<ext>` with the id the request carries. It runs `extractUnits` (unedited,
  `ingest/pull_files.mjs`) with a `run` argument that adds the 300 s limit and a child environment of
  only what `uv` needs. A timed-out child is `extract_timeout`; any other failure is `extract_failed`.
  The extractor's stderr and messages are never written to the answer or the log.
* The parser reads no secret and opens no connection; a test pins that none of its sources names a
  secret path or imports a network, database or `fetch` call.

## Environment of the image (for `docker/workspace-ingest`, task 37)

* Worker: files `/run/secrets/workspace_ingest_db_url`, `/run/secrets/supabase_anon_jwt`; the pinned
  CA at `/app/certs/prod-ca.crt` (or `WORKSPACE_DB_CA_FILE`); the directory `/run/ingest`, owned by
  `node`, created by the entrypoint; `/exchange` writable by the worker and removable by it whatever
  the parser wrote.
* Parser: `/app/ingest` (with `pyproject.toml`, `uv.lock`, `extract_text.py`), `uv`, `pdftotext`, a
  writable `UV_CACHE_DIR` (the root is read-only), and `/exchange`.

## Tests

`npx vitest run --coverage` (line coverage of `src/` at least 80 %, `main.ts`, `parser-main.ts` and
`healthcheck.ts` apart: they only run on load). Everything external is injected: fake fetch, fake
database calls, a fake clock whose sleep plays the parser, a temp folder as the exchange folder. The
frozen shapes are read from `workspace/test/fixtures/contract24/`.
