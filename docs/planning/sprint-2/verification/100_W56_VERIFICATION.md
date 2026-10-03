# 100 · W-56 verification — images, MCP (tasks 17 and 14)

Worker W-56, Phase 14 (brief `docs/planning/sprint-2/briefs/100_PHASE14_containers.md`), cut early for
tasks 14 and 17 only. Branch `feat/containers-14-images` in bb2dash, worktree
`C:/Users/stack/projects/bb2dash-wt-containers-14-images`, cut from `feat/containers-14` at ae23663.
Machine: stack-laptop, Windows 11, Docker Desktop (Docker 29.8.1), Node v24.19.0, npm 11.17.0.

No real secret was created, read, copied or printed. Every key file below is a dummy written into the
session scratchpad (`sb_secret_DUMMY_not_a_real_key`, with a BOM and CRLF). `C:/Users/stack/.claude.json`,
`C:/Users/stack/projects/bb2dash/.env` and `C:/Users/stack/.bb2dash-secrets/` were not touched (the last
was only listed by name, to read `set-secret.ps1`'s usage).

## Task 17 — the materials MCP image, the key from a file, the registration recipe, smoke `--docker`

### RED (tests written first, before `src/env-file.ts` existed or `config.ts` read a file)

```
cd mcp-server && npx vitest run test/env-file.test.ts
  FAIL  test/env-file.test.ts [ test/env-file.test.ts ]
  Error: Cannot find module '../src/env-file.js' imported from …/mcp-server/test/env-file.test.ts
  Test Files  1 failed (1)      Tests  no tests

cd mcp-server && npx vitest run test/config.test.ts
  × reads the key from the file the variable names, BOM and CRLF stripped
  × the file wins over SUPABASE_SERVICE_ROLE and the legacy SUPABASE_SERVICE_KEY
  × a named file that is missing fails, never falling back to the plain variable
  × a named file that is empty fails, never falling back to the plain variable
  × with neither set, the error names the file variable as the way in
  Test Files  1 failed (1)      Tests  5 failed | 16 passed (21)
```

Baseline before any change: `npx vitest run` → `Test Files 5 passed (5)`, `Tests 88 passed (88)`.

### GREEN

```
cd mcp-server && npx vitest run test/env-file.test.ts test/config.test.ts
  Test Files  2 passed (2)      Tests  33 passed (33)                       -> 0 failures
grep -rn "console.log" mcp-server/src | wc -l                               -> 0
cd mcp-server && npm test            -> Test Files 6 passed (6), Tests 106 passed (106)
cd mcp-server && npm run typecheck   -> exit 0
cd mcp-server && npm run build       -> exit 0
cd mcp-server && npm run test:coverage -> Statements 95.25%, Branches 85.3%, Functions 100%, Lines 95.77%
grep -rn 'C:/\|C:\\' mcp-server/src | wc -l                                 -> 0   (for task 16's grep-clean)
```

The rule as built (`src/env-file.ts`, `src/config.ts` `resolveKey`): a non-blank
`SUPABASE_SERVICE_ROLE_FILE` is the only source of the key. It wins over `SUPABASE_SERVICE_ROLE` and the
legacy `SUPABASE_SERVICE_KEY`, and a missing, unreadable (a folder: `EISDIR`), empty or multi-line file
stops the server with a `ConfigError` naming the variable and the path, never falling back to the plain
variable and never printing the file's content. A leading UTF-8 BOM and surrounding CR, LF and spaces are
stripped. A blank `SUPABASE_SERVICE_ROLE_FILE` counts as unset, so today's host registration (key in the
env block) keeps working until the cut-over. Only this one `*_FILE` variable is read; no other variable
gains a file form.

### The image (`mcp-server/Dockerfile`, `mcp-server/.dockerignore`)

```
docker pull node:22-slim        -> Digest: sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
docker build -t bb2dash-mcp:local mcp-server           -> exit 0 (build context 144 kB: the allow-list)
docker run --rm --entrypoint id bb2dash-mcp:local      -> uid=1000(node) gid=1000(node) groups=1000(node)
docker inspect bb2dash-mcp:local --format "{{.Config.User}} {{json .Config.Env}} {{json .Config.ExposedPorts}}"
  -> node ["PATH=…","NODE_VERSION=22.23.3","YARN_VERSION=1.22.22","NODE_ENV=production"] null
docker run --rm --entrypoint sh bb2dash-mcp:local -c 'ls /app; test -d /app/src && echo HAS_SRC || echo no-src'
  -> dist node_modules package.json / no-src
docker history --no-trunc bb2dash-mcp:local --format "{{.CreatedBy}}" | grep -c "sb_secret_"   -> 0
docker images bb2dash-mcp:local --format "{{.Size}}"   -> 359MB
```

Multi-stage on `node:22-slim`: `npm ci` and `npm run build` in the build stage, `npm prune --omit=dev`,
then only `package.json`, the production `node_modules` and `dist/` copied into the runtime stage, run as
`node`. No `EXPOSE`, no port: stdio only. The `.dockerignore` is an allow-list (`package.json`,
`package-lock.json`, `tsconfig.json`, `src/`), so no `.env`, key, test or script reaches the context.

### Smoke of the image over stdio, dummy key (startup and tool listing)

```
node mcp-server/scripts/smoke.mjs --docker --key-file <scratchpad>/dummy-secrets/bb2dash_mcp_service_key --tools-only
  smoke: docker bb2dash-mcp:local (tools only)
    [server] [bb2dash-materials] v0.1.0 ready — bb2dash search Edge Function + PostgREST at https://goultdzqcavefcgnifdy.supabase.co; floor 0.78
  PASS  three tools advertised  — get_material_text, list_courses, search_materials
  smoke: all checks passed                                         -> exit 0
node mcp-server/scripts/smoke.mjs --docker        (no --key-file, no SECRETS_DIR)
  smoke: --docker needs --key-file <path>, or SECRETS_DIR set.     -> exit 2
docker ps -a --filter ancestor=bb2dash-mcp:local | wc -l (after)   -> 0 containers left (--rm)
```

The dummy key file was written with a BOM and CRLF, so the start also proves the strip inside the image.
A real search needs the real key: that is Stack's step below.

Failure paths in the image (Git Bash, `MSYS_NO_PATHCONV=1`):

```
missing file   -> [bb2dash-materials] fatal startup error
                  Config error: SUPABASE_SERVICE_ROLE_FILE names /run/secrets/bb2dash_mcp_service_key, which does not exist.   exit 1
empty file     -> Config error: SUPABASE_SERVICE_ROLE_FILE names /run/secrets/bb2dash_mcp_service_key, which is empty.         exit 1
stdin at EOF   -> "… ready …" then exit 0 in 0.75 s (the container ends when its client closes stdin)
```

The registration's arguments, run from PowerShell 5.1 exactly as the README writes them (the `--mount`
value quoted for its commas), with the dummy key: `ready`, exit 0.

**Found on the way: Docker Desktop on Windows creates a missing bind source as an empty folder, even with
`--mount`** (on Linux `--mount` refuses instead). A run with `source=<scratchpad>/absent_key` left a folder
`absent_key` behind (removed). So the key file must be written before the registration first runs; the
README says so, the smoke refuses a missing `--key-file`, and the server's `EISDIR` message says to delete
the folder. If this happens in `SECRETS_DIR`, `set-secret.ps1` cannot write the file until the folder is
removed.

### compose.yaml: `bb2dash-mcp`, profile `mcp`, image only

```
SECRETS_DIR=<scratchpad>/dummy-secrets docker compose -p bb2dash-images-test --profile mcp config --services
  -> bb2dash-mcp, sync
SECRETS_DIR=<scratchpad>/dummy-secrets docker compose -p bb2dash-images-test --profile mcp run --rm -T bb2dash-mcp < /dev/null
  -> [bb2dash-materials] v0.1.0 ready — … floor 0.78        exit 0
docker compose -p bb2dash-images-test --profile mcp down -> network bb2dash-images-test_default removed;
  no container, volume or network of that project remains
```

The umbrella's include still resolves with this file (bb2dash-stack worktree, read-only `config`):

```
BB2DASH_DIR=C:/Users/stack/projects/bb2dash-wt-containers-14-images SECRETS_DIR=<dummy> \
  docker compose --profile mcp --profile dev config --services   -> bb2dash-mcp, dev, harness-jobs, sync (4)
```

Both files declare the secret `bb2dash_mcp_service_key` with the same `${SECRETS_DIR:-./secrets}/…` file,
as they already do `novnc_password`; compose accepts the identical definitions. The `sync` service is
byte-for-byte unchanged; the file's header comment now names the new service.

One call against the Local surfaces table: its rule "`restart: unless-stopped` (not `dev`)" is not applied
to `bb2dash-mcp`. A stdio server exits when its client closes stdin, so a restart policy would only loop
it; the service has no restart policy and no healthcheck, and the profile keeps `up` from starting it.

### Owed to Stack (task 17's Stack step), in this order, PowerShell

The brief's `bb2dash-stack/secrets/bb2dash_mcp_service_key` reads `C:/Users/stack/.bb2dash-secrets/` since
the 2026-10-03 DECISIONS row (`SECRETS_DIR`).

```powershell
# 0. Only if `docker images bb2dash-mcp:local` shows nothing (it was built from this branch on 2026-10-03):
docker build -t bb2dash-mcp:local C:/Users/stack/projects/bb2dash-wt-containers-14-images/mcp-server

# 1. The key into SECRETS_DIR, at the hidden prompt (the sb_secret_ value bb2dash/.env holds today).
#    Do this before step 3: Docker Desktop makes a folder of a missing bind source.
& C:/Users/stack/.bb2dash-secrets/set-secret.ps1 bb2dash_mcp_service_key
#    -> stored bb2dash_mcp_service_key (<n> bytes)

# 2. A live smoke of the image with the real key (all three tools against the corpus).
node C:/Users/stack/projects/bb2dash-wt-containers-14-images/mcp-server/scripts/smoke.mjs --docker --key-file C:/Users/stack/.bb2dash-secrets/bb2dash_mcp_service_key
#    -> last line: smoke: all checks passed   (exit 0)

# 3. Re-register the server on the image; the old entry (key inline) goes with the remove.
claude mcp remove bb2dash -s user
claude mcp add --scope user bb2dash -- docker run -i --rm --mount "type=bind,source=C:/Users/stack/.bb2dash-secrets/bb2dash_mcp_service_key,target=/run/secrets/bb2dash_mcp_service_key,readonly" -e SUPABASE_URL=https://goultdzqcavefcgnifdy.supabase.co -e SUPABASE_SERVICE_ROLE_FILE=/run/secrets/bb2dash_mcp_service_key bb2dash-mcp:local

# 4. Take the key out of bb2dash/.env: delete every line this lists (names only, never the value).
Select-String -Path C:/Users/stack/projects/bb2dash/.env -Pattern '^([A-Z_]+)=.*sb_secret_' | ForEach-Object { "line $($_.LineNumber): $($_.Matches[0].Groups[1].Value)" }
#    then edit C:/Users/stack/projects/bb2dash/.env and remove those lines.

# 5. The checks (Git Bash), then restart Claude Code so sessions pick up the docker registration.
grep -c "sb_secret_" C:/Users/stack/.claude.json                 # -> 0
grep -c "sb_secret_" C:/Users/stack/projects/bb2dash/.env        # -> 0
claude mcp list | grep -c "^bb2dash: .*Connected"                # -> 1
```

If the `.claude.json` count is not 0 after step 3, a local-scope copy of the old entry remains: run
`claude mcp remove bb2dash -s local` from `C:/Users/stack/projects/bb2dash` and count again.
`scripts/google-consent.mjs` stays a host run; for its one command it takes the key from the file:
`$env:BB2DASH_SERVICE_KEY = [IO.File]::ReadAllText('C:/Users/stack/.bb2dash-secrets/bb2dash_mcp_service_key'); node scripts/google-consent.mjs; Remove-Item Env:BB2DASH_SERVICE_KEY`
(plus its three Google variables, as its header says).

### Not verified here (task 17)

* A real search through the image (needs the real key: step 2 above).
* `claude mcp add` itself, and `claude mcp list` against the docker registration (writes
  `~/.claude.json`: Stack's step 3). The arguments were proven by `docker run` from PowerShell and by
  the smoke, which spawns the same argument list.
* Reading a key file from `C:/Users/stack/.bb2dash-secrets/` itself, whose access list holds only Stack's
  account: the dummy lived in the scratchpad. Docker Desktop reads bind sources as the signed-in user, so
  it should read it; step 2 proves it.

## Task 14, host half — the locked Python set; `extractUnits` runs it; Xpdf vs poppler on the fixtures

Not on the integrated branch of task 13a: W-55's `feat/containers-14-sync` is not merged into this
branch yet, and the task 14 files do not touch W-55's. The check below is re-run after the 13a merge.

### RED (test first; fixtures made, `extractUnits` not yet changed)

```
node --test --test-reporter=tap ingest/extract_text.test.mjs     (before ingest/pyproject.toml existed)
  # SyntaxError: The requested module './pull_files.mjs' does not provide an export named 'extractUnits'
  not ok 1 - ingest\extract_text.test.mjs
  # tests 1   # pass 0   # fail 1
```

The same RED after `pyproject.toml`, `uv.lock`, the four fixtures and `expected.json` were written: the
file still failed on the missing export, i.e. `extractUnits` still ran `uv run --python 3.12 --with …`.

### GREEN

```
node --test --test-reporter=tap ingest/extract_text.test.mjs
  ok 1 - pyproject.toml pins the three libraries exactly, and uv.lock locks the same versions
  ok 2 - extractUnits runs the locked project, never `--with`
  ok 3 - sample.pdf: the locked extractor's units equal expected.json
  ok 4 - sample.docx: the locked extractor's units equal expected.json
  ok 5 - sample.pptx: the locked extractor's units equal expected.json
  ok 6 - sample.xlsx: the locked extractor's units equal expected.json
  # tests 6   # pass 6   # fail 0

node --test --test-reporter=tap ingest/extract_text.test.mjs ingest/pull_files.test.mjs   (the task's check, host)
  # tests 43
  # pass 43
  # fail 0
```

Node 24's default reporter prints `ℹ fail 0` for the same run; `--test-reporter=tap` gives the brief's
`# fail 0` line.

* `ingest/pyproject.toml`: `requires-python = ">=3.12,<3.13"` (the `--python 3.12` the old call passed),
  `python-docx==1.2.0`, `python-pptx==1.0.2`, `openpyxl==3.1.5` (what `extract_text.py` imports beyond
  the standard library), `[tool.uv] package = false`.
* `ingest/uv.lock` (uv 0.12.19, `uv lock --check` clean): 9 packages — the project, the three above, and
  `lxml` 6.1.3, `pillow` 12.3.0, `xlsxwriter` 3.2.9, `et-xmlfile` 2.0.0, `typing-extensions` 4.16.0, with
  manylinux wheels for the image as well as Windows ones.
* `extractUnits` (`ingest/pull_files.mjs`, now exported, :427 on this branch; the brief's ":187" predates
  Phase 18) runs `uv run --locked --project <ingest> python <ingest>/extract_text.py <file>`; `--locked`
  stops on a stale lock instead of re-resolving. Its `run` argument defaults to `execFileSync` and is
  injected only by the test. Nothing else in the file changed, so the constant `EXTRACT_DEPS` (:93) is now
  unused; it is left for the PM to delete at integration, under the "that function only" rule.
* `uv run` creates `ingest/.venv` on first use; uv writes a `.gitignore` of `*` inside it, so
  `git status` stays clean.
* The fixtures (`ingest/fixtures/extract/`) are made by `make_samples.py` there, every word written in
  that script, no course material: `sample.pdf` (3 pages, page 2 blank, a hand-written PDF 1.4 with a
  Helvetica font), `sample.docx` (heading, paragraphs, an empty one, a 2×2 table), `sample.pptx` (title
  slide, a table slide with a speaker note, a blank slide, a text-box slide), `sample.xlsx` (a sheet with
  an empty row and a blank cell, an empty sheet, a notes sheet). `expected.json` was written by hand from
  `extract_text.py`'s rules (skipped blank units keep the numbering of what follows, ` | ` joins,
  `[notes] `) before the GREEN run, not copied from its output.
* `sample.pdf`'s binary-marker comment carries a NUL byte, so git classes it binary
  (`git ls-files --eol` → `i/-text w/-text`). The first cut had none; `git add` warned "LF will be
  replaced by CRLF", and under this laptop's `core.autocrlf=true` a later checkout would have rewritten its
  line ends and broken the xref offsets. The fixtures were regenerated and the check re-run (same
  `# fail 0`). The text files (`expected.json`, `pyproject.toml`, `uv.lock`) survive CRLF:
  `uv lock --check` on a CRLF copy of the lock → resolved, exit 0.

### pdftotext: the host is Xpdf **4.06**, not the brief's 4.00

```
which -a pdftotext            -> /ucrt64/bin/pdftotext   (C:\Program Files\Git\ucrt64\bin\pdftotext.exe)
pdftotext -v                  -> pdftotext version 4.06 [www.xpdfreader.com]
PowerShell: Get-Command pdftotext -All -> nothing (exit 1)
```

It is on Git Bash's PATH only, so `pull_files.mjs` extracts PDFs when run from Git Bash (as the bb-sync
skill does) and would report `failed: …` for every PDF from a plain PowerShell. Xpdf writes CRLF line ends
on Windows; Python's text mode turns them into LF before the JSON.

**Preview, not the owed check:** poppler in a throwaway `node:22-slim` container (Debian 12,
`pdftotext version 22.12.0`, apt-installed in a `--rm` run, the fixtures mounted read-only) gave the same
bytes for `sample.pdf` as Xpdf except LF for CRLF: the same words, the blank page's `\f\f`, the final `\f`.
The sync image's poppler (Ubuntu noble) is a different build, so the in-image run below still decides.

### Owed to task 15 (the sync image is not built here)

* The in-image half of the check: `docker compose run --rm sync node --test --test-reporter=tap
  ingest/extract_text.test.mjs` → `# fail 0`, against the same `expected.json`, recorded here with the
  image's `pdftotext -v`.
* What that run needs from the image: `uv` and `poppler-utils` installed; `ingest/pyproject.toml` and
  `ingest/uv.lock` copied and the set synced at build (`uv sync --locked --project /app/ingest`, owned by
  `pwuser`), so `extractUnits`'s `uv run --locked` needs no network at run time (`UV_PYTHON_DOWNLOADS=never`
  with noble's Python 3.12 satisfies `requires-python`); the root `.dockerignore` must exclude
  `ingest/.venv` (a Windows venv copied into a Linux image breaks `uv run`) and `__pycache__`; and the
  fixtures plus `extract_text.test.mjs`, `pull_files.mjs`, `fetch_signed.mjs` and `embed_corpus.mjs`
  present at `/app/ingest` for the test to import.
* The re-run of the host check on the integrated branch after task 13a.

## Task 17 — Stack's key move, 2026-10-03 (recorded by the PM)

Stack stored the key with `set-secret.ps1 bb2dash_mcp_service_key`, re-registered the server with the
`docker run` recipe and deleted the key's line from `bb2dash/.env`. The PM then checked, printing no value:

* `grep -c "sb_secret_" C:/Users/stack/.claude.json` → `0`
* `grep -c "sb_secret_" C:/Users/stack/projects/bb2dash/.env` → `0`
* the secret file: 41 bytes, `sb_secret_` shape, no newline, no BOM
* `claude mcp list` → `bb2dash: docker run -i --rm --mount type=bind,source=<the secrets folder file>,… bb2dash-mcp:local - ✔ Connected`
  (so Docker Desktop reads a file in the ACL-locked folder)
* `node mcp-server/scripts/smoke.mjs --docker --key-file C:/Users/stack/.bb2dash-secrets/bb2dash_mcp_service_key`
  → a real `search_materials` and `get_material_text` against prod, last line `smoke: all checks passed`

The service key now lives only in `C:/Users/stack/.bb2dash-secrets/bb2dash_mcp_service_key`. One host
consumer remains: `scripts/google-consent.mjs` reads `BB2DASH_SERVICE_KEY` for its one command and needs the
**legacy service-role JWT** (its line 229: the gateway rejects an `sb_secret_` Bearer), not this file's key;
it is fed from the Supabase dashboard when the calendar token is re-minted.
