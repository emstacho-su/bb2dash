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

---

# Second run: tasks 37 and 38, and the exchange-test fix

Commits: `test(24)` exchange fix, `4e74b89` (images, compose, firewalls, tests). The branch was merged with
`origin/feat/workspace-24` first (a merge).

## The fix: `exchange.test.ts` timed out under load

Cause: the fake clock ticked every 500 ms, so a 330 s wait was 660 rounds of real file work (a `stat`, a
`readFile`, a `readdir` and, in the parser stand-in, a `writeFile` each), which a busy machine could push past
the 5 s test limit. Fix: `ProcessDeps` gained an optional `exchangePollMs`; the harness and `exchange.test.ts`
use a coarse 30 s tick, so the same 330 s is 11 ticks. The timeout is not raised and no test uses wall-clock
time for the wait. The one real-time test left is `alive-beat.test.ts`, which waits for a real thread and
returns the moment the file exists. Three runs in a row: 97 passed each; typecheck clean.

## Task 37 (the ingest image, firewall fork, compose services)

Red: the image test was written after the files, so no honest red run exists for it. What I can show is that it
fails on a mutation: with the compose volume option changed to `mode=1777` and `network_mode: none` commented
out, `fail 2` (the parser test and the exchange-mode test); restored: `pass 14, fail 0`.
Green: `node --test docker/workspace-ingest/image.test.mjs`: pass 14, fail 0.

Files: `docker/workspace-ingest/{Dockerfile, Dockerfile.dockerignore, entrypoint.sh, fork-firewall.mjs,
init-firewall.sh (generated), image.test.mjs}`, and `compose.yaml` (two services, the volume `ingest-exchange`,
the network `ingest-net`, the secret `workspace_ingest_db_url`).

The exchange mode, proved. A sticky 1777 does not let the worker remove the parser's file. The volume is tmpfs
with `o: size=96m,uid=0,gid=1100,mode=0770` (owner root, group `exchange` 1100, no sticky bit). The image creates
group `exchange` (1100) and user `extract` (uid 1100, primary group `exchange`), adds `node` to the group, and
makes `/exchange` the same way. The worker's `setpriv --init-groups` keeps `node`'s groups. Proved in a
no-network container of the Workspace test image, with the same kernel option through `--tmpfs`: `extract`
wrote `answer.json`, `node` (groups `node,exchange`) removed it, then `node` wrote a file and `extract` removed
it. The image test pins the same options.

**The ingest image was not built.** Both attempts failed in `apt-get update` on the base layer with
`Certificate verification failed: The certificate is NOT trusted. The certificate issuer is unknown` for
`deb.debian.org` (a TLS-intercepting network today). That is outside my files, so I stopped there as
instructed. Unproved because of it: `apt-get install` of the firewall tools and `poppler-utils`; `uv python
install 3.12` and `uv sync --locked` at build; the in-image checks (`id extract`, `pdftotext -v`, `uv --version`,
and a no-network `extract_text.py` run on a generated docx under `--read-only --user extract`). The PM should
rebuild `workspace-ingest` on a network that trusts Debian's mirror before P-7 and P-11.

## Task 38 (the Workspace image and compose block; the apply side)

Green: `docker/workspace/init-firewall.test.mjs` (21 pass), `docker/grep-clean.test.mjs` (15 pass),
`docker/apply/image.test.mjs` (9 pass; no literal had to move), new `docker/apply/gate-built.test.mjs`.
Gate test red: before `cd apply && npm run build`, `fail 4` ("apply/dist/hooks/tool-gate.js is not built");
green after `npm ci && npm run typecheck && npm run build`: `tests 4, pass 4` (an unknown tool exits 2, the two
listed materials tools exit 0 and print nothing, input that is not JSON exits 2). Whole set: `node --test
docker/workspace/init-firewall.test.mjs docker/grep-clean.test.mjs docker/apply/image.test.mjs
docker/apply/gate-built.test.mjs docker/workspace-ingest/image.test.mjs`: tests 63, pass 63.
`node docker/apply/fork-firewall.mjs --check` exit 0; `node docker/workspace-ingest/fork-firewall.mjs --check`
exit 0; `grep -c harness_database_url compose.yaml` gives 0; `docker compose -f compose.yaml --profile workspace
--profile apply config -q` resolves.

What changed: the Workspace Dockerfile lost the `rag` stage, `/opt/fastembed` and `mcp-rag.sh` (deleted); the
firewall lost `harness_database_url` (three names: model API, project, pooler); the `workspace` block lost that
secret and the `harness-mcp` build context (the pinned CA from `harness-certs` stays), mounts a tmpfs at
`/home/node/.claude` (`uid=1000,gid=1000,mode=0700,size=64m`), names no `hostname`, and sets
`WORKSPACE_MEMORY_JOBS: "off"`. `/run/workspace` is still the entrypoint's 0700 `node` folder, writable by the
runner for `mcp-none.json` and `mcp-<id>.json`. The runner's `prompts/*.md` were already copied as a whole
folder. The apply fork's secret literal followed the Workspace script and its header sentence was reworded; the
apply firewall is regenerated and `--check` passes. In `docker/grep-clean.test.mjs` the rag launcher checks went,
the `workspace-ingest` Dockerfile joined the scanned images, and `workspaceService()` now stops at the next
service (two follow the Workspace now). The top-level volume `workspace-claude-home` is KEPT in `compose.yaml`
(unused, commented) so that this file removes nothing from anyone's machine.

## Images (test tags only, through the second compose file)

Live tags before the first build and after the last: identical.

| tag | id before and after |
|---|---|
| bb2dash-sync:local | sha256:084b9ede6aadb40a0c1389f10e8f841802355beafd21558da215a0bce975f10f |
| bb2dash-mcp:local | sha256:bf212746abf172b8d8f1a9f880afda84540b27c919fa057937f4fd50ee845d05 |
| bb2dash-apply:local | sha256:3315bf7c18e2b14615a0e226f9ed8144c0a3f0ad7de0a9b50435c98d48340873 |
| bb2dash-workspace:local | sha256:42c552c05ad6caf7565095b6c882643e022352d0357364024cdfc4cab7e5f2f4 |

Test images: `bb2dash-workspace:wt24` id `93c654c69d62`, 1.17 GB (the live one is 1.66 GB, with the rag server),
built in 12 s from cached layers; `bb2dash-apply:wt24` id `0fd2a1a825df`, 1.17 GB, 9 s;
`bb2dash-workspace-ingest:wt24` not built (above; two failed attempts, 15 s and 20 s). Inside the Workspace test
image (no network): no `/app/mcp-rag`, no `/opt/fastembed`, `mcp-materials/dist/batch.js` present,
`/home/node/.claude` owned by `node`.

One slip to report: the first `workspace` build started while a `bb2dash-walk22-...` container had just appeared
(my check ran a few seconds before the command, not as a gate on it). The build was cached and finished in 12 s;
every later build waited on a gate that polls `docker ps` every minute.

## Defaults I took

1. The ingest image's Python is a uv-managed 3.12 in `/opt/uv-python` (bookworm's own is 3.11 and the lock wants
   3.12), installed at build; at run `UV_PYTHON_DOWNLOADS=never UV_OFFLINE=1 PYTHONDONTWRITEBYTECODE=1`.
2. `extract`'s scratch is a `/tmp` tmpfs (256 MB, `HOME=/tmp`, `UV_CACHE_DIR=/tmp/uv-cache`).
3. uid and gid 1100 for `extract` and the group `exchange`; the volume owner is root, group 1100, mode 0770.
4. The ingest firewall allows the project host on 443 and the pooler on 5432 only; its end check reaches the
   project host (the Workspace's reaches api.anthropic.com).
5. `command: []` plus an `entrypoint:` override on `workspace-extract`, so the image's root entrypoint and CMD
   never run there.
6. The `workspace-claude-home` top-level volume entry is kept, unused.
7. The ingest image copies only `extract_text.py`, `pull_files.mjs`, `fetch_signed.mjs` and `embed_corpus.mjs`
   from `ingest/`, plus the lock files, and builds `workspace-ingest` with `workspace/src` for the bundle.

## How the PM starts each service in a walk window

Never a bare `up`; one service named each time. Common flags: `SECRETS_DIR=C:/Users/stack/.bb2dash-secrets
HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt24 -f compose.yaml -f
C:/Users/stack/.bb2dash-wt24/test-tags.compose.yaml --profile workspace`, with the live runner stopped first.

* `... up -d --no-deps workspace`
* `... up -d --no-deps workspace-extract` (start it before the worker, so the volume and the alive file exist)
* `... up -d --no-deps workspace-ingest` (needs a `workspace_ingest_db_url` file in `SECRETS_DIR`)

## What P-7 and P-11 need

* P-7 (a signed URL through the ingest firewall): `workspace-ingest` running with its two secrets, after the
  image is rebuilt. Check that a signed link downloads, a 302 is not followed, another host and another port
  are refused (the firewall rejects), and `api.anthropic.com` is unreachable.
* P-11 (a 20 MB file of each parsed type in `workspace-extract`): the parser container with `mem_limit 1g` and
  `pids_limit 128`; put `doc-<id>.<ext>` and `request.json` in `/exchange` (or let the worker do it) and watch
  `answer.json`, memory and the 300 s limit. The volume holds 96 MB: the 20 MB file plus its units.

---

# Round 3: code-review and security-review findings

Branch merged with `origin/feat/workspace-24` first. No docker command, no database call. Commits:
`b3a182f` (comment), `0247a8c` (finding 1), `4bcc34e` (finding 2), `2935933` (finding 3).

Final gates: `workspace-ingest` typecheck clean; suite 118 passed, three runs in a row; line coverage 98.1 %
(363/370). `node --test docker/workspace-ingest/image.test.mjs docker/workspace/init-firewall.test.mjs
docker/grep-clean.test.mjs docker/apply/image.test.mjs docker/apply/gate-built.test.mjs`: tests 63, pass 63.

## Finding 1: a large upload could never be indexed

Red (`npx vitest run test/db-embed.test.ts`, six new cases before `embed.ts` changed): `6 failed` (400 parts,
1,500 parts, no progress, remaining not going down, the time bound, a non-200). Green: `Tests 21 passed (21)`;
whole suite 104 after the process-document case.

What changed: `embedDocument` still calls `runEmbedLoop` unedited, but with a call budget of 5,000 (a backstop,
15,000 parts at 3 a call) and a `post` that watches each 200 answer. It stops the try, and says why, when:
`no_progress` (an answer stored nothing, or its `remaining_parts` did not go down, while parts are left),
`timed_out` (the document's deadline passed), or `error` (a non-200 or a failed unit, the loop's own stop). It
returns `{exitCode, calls, stop, progressed, remainingParts}`. 400 parts take 134 calls and 1,500 take 500, both
ending embedded; the old loop stopped at 60 calls (180 parts).

The time bound, my default: `DOCUMENT_TIME_BUDGET_MS = 540,000` (the claim's 10-minute lease less a 60 s margin
for the finish call), measured from the start of `processDocument`, so the download and the parser count against
it and the embed gets what is left (`ProcessDeps.embed(documentId, deadlineMs)`). At about 3 parts a call this
is not reached by any upload the bucket allows unless a call takes several seconds.

A document larger than that bound can embed: the stored parts stay (the units are not put again), and the
document is `text_ready`, so the next claim has step `embed` and continues from them. The outcome is `retry`
(`embed_failed`), because `workspace_ingest_finish` has no other way to free the lease and keep `text_ready`.
That counts as one of the three tries: so with the frozen function a document that needs more than three
bounds (about 27 minutes of embedding) still ends `failed`. What I would need in a migration: a fourth outcome
of `workspace_ingest_finish`, e.g. `'continue'`, that frees the lease, leaves the row `text_ready`, does NOT
increase `attempts`, and is refused (22023) unless the document's count of embedded units went up since the
claim (or `embedded_at` moved), so it cannot loop on a document that is stuck. Then the worker would send
`continue` for `stop = 'timed_out'` with `progressed`, and `retry` for everything else. Also to confirm: whether
`workspace_ingest_heartbeat` extends the 10-minute lease (if it does, the bound could be longer; I assumed not).

## Finding 2: NUL in parsed text failed the file for ever

Red: two new cases in `process-document.test.ts` failed (a NUL inside a unit reached the put; a unit of NUL
only was kept). Green: suite 107 passed. `prepareUnits` now strips U+0000 from every unit's text before the
empty-unit check, so a unit that was only NUL is left out, and a file left with none is `no_text`. A text file
with a NUL byte stays `bad_bytes` (tested; it is checked before, on the bytes, and never stripped).

## Finding 3: the exchange folder was followed through links

Red (`test/exchange-links.test.ts` before `exchange.ts` changed): `7 failed`. Green: suite 118 passed. This
machine allows `fs.symlinkSync`, so the real-symlink cases ran and none was skipped (they skip with a stated
reason where the platform refuses a link); the decision tests run everywhere.

What changed in `exchange.ts` and `parser-loop.ts`:
* `readRegularFile(file, maxBytes)`: `lstat` on the name, then open with `O_NOFOLLOW | O_NONBLOCK` (no block on a
  FIFO), then `fstat` on the descriptor; it must be a regular file within the limit, else `'refused'`.
* `writeNewFile`: create with `O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW`, so a link or anything at the name fails.
  The document file and the `.tmp` of every JSON file are made this way; a stale or planted `.tmp` is removed
  first (removing a link removes the link), and the rename replaces whatever stands at the final name.
* `readAnswer` reads through `readRegularFile`: a link, directory, FIFO or device at `answer.json` is
  `extract_failed`. `handOver` turns EEXIST, ELOOP, EISDIR, ENXIO, EPERM and EACCES on the create into
  `extract_failed` and clears the folder in `finally` (clearing removes a link, never its target). Other errors
  (a missing folder) still throw.
* Parser side: `request.json` goes through `readRegularFile` (4 KB limit; a link or non-regular entry is removed
  and dropped), and the named document must be a regular file by `lstat` or the answer is `extract_failed`
  without calling the extractor. The extractor (Python) still opens the path itself, so the `lstat` narrows the
  window and does not close it; the parser holds no secret and is the container the claim already treats as
  hostile.

## Finding 4: the compose comment

`compose.yaml` comment only: `WORKSPACE_MEMORY_JOBS: "off"` turns off the memory jobs (the remembered items)
and not the rolling summary, which is on from 24a. Nothing else in the file changed.

## Declined

Nothing declined. The migration in finding 1 is the PM's; I did not touch `db/`.
