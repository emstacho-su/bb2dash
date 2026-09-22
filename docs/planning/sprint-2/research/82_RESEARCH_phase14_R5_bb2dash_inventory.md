# R5 — bb2dash repo process inventory for containerization (Phase 14)

Scope: `C:/Users/estac/projects/bb2dash` (main) + `C:/Users/estac/projects/bb2dash-wt-electron-12`
(Phase 12 branch worktree, `desktop/`). Read-only, code-grounded. No Dockerfile/compose exists
anywhere in the repo today — this is greenfield.

---

## 1. Process inventory

### bb-sync (skill) — the Blackboard crawl + sync loop

| | |
|---|---|
| **Name** | `bb-sync` (skill) |
| **How started today** | Stack pastes `claude "/bb-sync <id>"` in a terminal on his laptop, triggered by the app's Sync button (which just inserts an `agent_requests` row and copies the command). Loads `skills/bb-sync/SKILL.md`. |
| **Runtime** | Claude Code CLI itself, driving a **logged-in browser tab** (built-in Claude browser or Claude-in-Chrome fallback) that runs `ingest/bb_crawler.js` pasted/loaded as `window.__bb`. Plus Supabase MCP for all reads/writes. |
| **OS-bound assumptions** | The whole step depends on an interactive Blackboard session behind NetID + Duo MFA that **only Stack can approve** (`skills/bb-sync/SKILL.md:8-10`). Step 4b downloads submission bytes via Playwright's `waitForEvent('download')` + `saveAs` into a "scratch directory" (`skills/bb-sync/SKILL.md:143-146`) — a real, human-driven browser download, not headless-friendly. Step 4b also does a PowerShell-style local mirror (`skills/bb-sync/SKILL.md:160`, "PowerShell `Move-Item`, creating directories"). |
| **Secrets/config read** | Supabase `bb2dash` project accessed via the Supabase MCP (owner-level, no key needed in this process); the crawler posts with the **anon/publishable key**, inlined as a literal in `ingest/bb_crawler.js` usage docstring and `.env`/`.env.example` (`SUPABASE_PUBLISHABLE_KEY`) — safe by design (insert-only RLS). No service key touched here. |
| **Network endpoints** | `https://blackboard.syracuse.edu/learn/api/v1/...` and `/learn/api/public/...` (session-cookie authorized); `https://goultdzqcavefcgnifdy.supabase.co/rest/v1/bb_raw` (POST), Storage `POST /storage/v1/object/bb-files/<relpath>`. |
| **Disk I/O** | Reads/writes nothing itself (browser-tab JS); the *skill* (Claude Code process) writes to a local scratch dir for downloaded submission files and to `course context/<relpath>` (OneDrive-backed, gitignored) via PowerShell `Move-Item`. |
| **Container verdict** | **Stays on host / dev-container only for the orchestration half.** The crawl absolutely requires a real, human-authenticated browser session (NetID+Duo) — this is Phase 14's item 4/5 open research question (noVNC-style browser-in-container with persistent profile), not something this inventory can containerize outright. The *watcher* that claims `agent_requests`, waits on `v_sync_status`, and reports (steps 1–2, 5–6) is plain Claude Code + SQL and **can** run unattended in a container once auth is solved — that's the "watcher container" in Stack's answer 6. |
| **Concrete changes needed** | (a) Decide the noVNC/persistent-profile browser pattern for Blackboard login (open research question); (b) replace the "PowerShell `Move-Item`" local-mirror step with a cross-platform copy (Node `fs.rename`/`fs.cp`) since a Linux container has no PowerShell; (c) point the scratch/mirror directories at a container volume instead of `$HOME`/OneDrive paths. |

### bb_crawler.js — pure browser-tab payload builder

| | |
|---|---|
| **Name** | `ingest/bb_crawler.js` (`installCrawler`) |
| **How started today** | Pasted into / loaded inside a logged-in Blackboard browser tab's JS console; also required as CommonJS by `web/test` (vitest) for its pure helper functions (module.exports guard at the bottom, `ingest/bb_crawler.js:457-461`). |
| **Runtime** | Runs as page-context JS inside whatever browser holds the Blackboard session (V8 in Chrome/Chromium). Not a Node process in production use. |
| **OS-bound assumptions** | None directly — it's browser JS using `fetch`/`crypto.randomUUID()`. Its only environment coupling is the browser session itself. |
| **Secrets/config** | `installCrawler({ userId, supabaseUrl, anonKey })` — anon/publishable key passed in by the caller (bb-sync skill), never a service key. |
| **Network** | `blackboard.syracuse.edu` (session cookie), `<supabaseUrl>/rest/v1/bb_raw` (POST). |
| **Disk I/O** | None (browser tab). `downloadAll()` triggers browser file downloads to `~/Downloads`. |
| **Container verdict** | **Not a containerizable unit on its own** — it's a payload for whatever browser holds the Blackboard session. Its pure-function half is already covered by the `web/test` vitest suite (containerizable as part of the `web` dev/test image). |

### File pull ("step 4b" / bb-course-pull) — submission and course file downloads

| | |
|---|---|
| **Name** | bb-sync Step 4b (submission bytes) and the separate `skills/bb-course-pull` skill (course files, manual, "until Electron") |
| **How started today** | Step 4b runs inside `/bb-sync`; `bb-course-pull` is invoked by Stack ("pull a course"/"harvest a course") after `bb-course-map`. |
| **Runtime** | Claude Code + logged-in browser tab; `bb.downloadAll(urls)` fires hidden anchor clicks; files land in the OS `~/Downloads` folder. |
| **OS-bound assumptions** | `skills/bb-course-pull/SKILL.md:60-62`: *"Local mirror: PowerShell `Move-Item` from Downloads to `course context/<relpath>`... The Linux device shell cannot delete from mounted folders, so use PowerShell for moves."* — this is an explicit, already-documented Windows/Linux split: a Linux shell mounting the Windows Downloads folder cannot rename/delete on it, so PowerShell is required today. `ingest/CADENCE_RUNBOOK.md:26`: inputs list `Device: $HOME/mnt/Downloads` (a WSL-style mount) alongside `PowerShell for moves` and `C:\Users\estac\projects\bb2dash` for git — i.e., the current workflow is **already split across a Linux shell and PowerShell on the same machine**, which is direct evidence for Stack's WSL2 host. |
| **Secrets/config** | Publishable key (browser-safe) for uploads; Supabase MCP for catalog writes. |
| **Network** | `blackboard.syracuse.edu` (downloads), Supabase Storage `POST /storage/v1/object/bb-files/<relpath>`. |
| **Disk I/O** | `~/Downloads` (or `$HOME/mnt/Downloads`) → `course context/<relpath>` (OneDrive, gitignored) → cloud workspace staging for extraction. |
| **Container verdict** | **Stays manual / host-bound until Electron's `will-download` handler lands** (`ingest/CADENCE_RUNBOOK.md:66-68` calls this "the single largest simplification left in this project"). The move-to-mirror step should be rewritten with Node `fs` (cross-platform) rather than PowerShell so it can eventually run in a container once the browser-auth problem is solved. |

### extract_text.py — text extraction for the materials corpus

| | |
|---|---|
| **Name** | `ingest/extract_text.py` |
| **How started today** | `python3 ingest/extract_text.py <file> [...]`, invoked by hand / by an agent ("Extraction runs in the cloud workspace" per `ingest/FILE_HARVEST_SPEC.md:91-92`, i.e. inside a Claude Code cloud sandbox, not necessarily Stack's laptop). |
| **Runtime + version** | Python 3 (no pinned version found; no `.python-version`/`pyproject.toml` in repo). Depends on **`pdftotext`** (Poppler, external binary, via `subprocess.run(["pdftotext", ...])`, `ingest/extract_text.py:8`), and Python packages `python-docx`, `python-pptx`, `openpyxl` (imported inline, no `requirements.txt`/`pyproject.toml` committed — dependency versions are undocumented in-repo). |
| **OS-bound assumptions** | None Windows-specific in the code itself, but it silently depends on `pdftotext` being on `PATH` — on Windows that means a manual Poppler install; in a Linux container it's a one-line `apt-get install poppler-utils`, which is actually an argument *for* containerizing this step. |
| **Secrets/config** | None — pure file-in, JSON-out. |
| **Network** | None. |
| **Disk I/O** | Reads the file paths given as argv; no other I/O. |
| **Container verdict** | **Containerize as a one-shot job** (cleanest win in the whole inventory): a small Python image with poppler-utils + python-docx/pptx/openpyxl, invoked per file or per batch, feeding stdout JSON back to whatever orchestrates the harvest. No secrets, no OS coupling, already used in "the cloud workspace" today. |
| **Concrete changes needed** | Add a `requirements.txt`/`pyproject.toml` pinning `python-docx`, `python-pptx`, `openpyxl`; Dockerfile installs `poppler-utils` (Debian/Ubuntu base) for `pdftotext`. |

### mcp-server (bb2dash materials MCP)

| | |
|---|---|
| **Name** | `mcp-server/` (`@bb2dash/materials-mcp-server`, bin `bb2dash-materials-mcp`) |
| **How started today** | Registered as a **user-scoped** stdio MCP server via `claude mcp add-json bb2dash ... -s user`, which writes into `~/.claude.json` (NOT `~/.claude/settings.json`) — command `C:/Program Files/nodejs/node.exe`, args `["C:/Users/estac/projects/bb2dash/mcp-server/dist/index.js"]` (`mcp-server/README.md:88-97`). Claude Code spawns it as a child process over stdio whenever a session needs its tools. |
| **Runtime + version** | Node ≥ 20.11 (`mcp-server/package.json:8-10`; "developed on 24.13.0" per README). TypeScript compiled to `dist/` via `tsc`. |
| **OS-bound assumptions** | The registration example is a **hard-coded Windows path with a native `node.exe`**, and the README explicitly calls out the MSYS/native-binary path gotcha: *"Pass `C:/...` paths to Node, never MSYS `/c/...`"* (`mcp-server/README.md:63`, `README.md:88-97`). This is the exact CLAUDE.md "Windows path gotcha" pattern. No other Windows-isms in the source (`src/*.ts` is plain fetch/HTTP logic). |
| **Secrets/config** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` (alias `SUPABASE_SERVICE_KEY`) — read from the MCP server's env block **inside `~/.claude.json`**, never from the repo (`mcp-server/.env.example` is reference-only). Also `BB2DASH_MIN_SIMILARITY`, `BB2DASH_DEFAULT_LIMIT`, `BB2DASH_MAX_LIMIT`, `BB2DASH_TIMEOUT_MS` (all non-secret tuning). |
| **Network** | `https://goultdzqcavefcgnifdy.supabase.co` — Edge Function `POST /functions/v1/search` and PostgREST `GET /rest/v1/bb_file_text?id=eq.N`. |
| **Disk I/O** | None beyond reading its own `dist/` at startup. |
| **Container verdict** | **Containerize as a long-running stdio service is awkward — better as "dev-container only" or run via a thin host wrapper.** MCP stdio servers are spawned per Claude Code session and talk over stdin/stdout; the cleanest container pattern is to build a small Node image and have Claude Code's MCP registration invoke `docker run -i --rm <image>` instead of `node dist/index.js` (stdio still works through `docker run -i`). This keeps secrets in the container's env instead of `~/.claude.json`, or continues to inject them per-invocation. |
| **Concrete changes needed** | Multi-stage Dockerfile (`node:20-slim` build stage running `npm ci && npm run build`, then a slim runtime stage with only `dist/` + `node_modules --production`); registration changes from `command: node.exe, args: [...]` to `command: docker, args: ["run","-i","--rm","--env-file",...,"bb2dash-mcp"]`. |

### google-consent.mjs

| | |
|---|---|
| **Name** | `scripts/google-consent.mjs` |
| **How started today** | Stack runs it **once, by hand**, on his own machine (`scripts/google-consent.mjs:2-9`; Phase 11 one-time setup). `$env:GOOGLE_CLIENT_ID=...; node scripts/google-consent.mjs` in PowerShell. |
| **Runtime** | Node 22+ (comment at `scripts/google-consent.mjs:34`), zero npm dependencies — uses `node:http`, `node:crypto`, `node:child_process`. |
| **OS-bound assumptions** | `openBrowser()` (`scripts/google-consent.mjs:150-161`) explicitly branches on `process.platform`: `win32` → `explorer.exe <url>` (chosen deliberately over `cmd /c start` because cmd mis-parses `&` in the query string — a real bug hit live 2026-09-15, per the comment at line 148), `darwin` → `open`, else → `xdg-open`. This is a **loopback OAuth flow that opens a real local browser and waits for a human to click through Google consent** — fundamentally interactive. |
| **Secrets/config** | Reads `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GCAL_CALENDAR_ID`, `BB2DASH_SERVICE_KEY` from the **process environment** (`scripts/google-consent.mjs:117-123`, set inline via PowerShell before running) — never the repo. Writes the resulting secrets into **Supabase Vault** via the `calendar_secret_set` RPC — never to a local file. |
| **Network** | `https://accounts.google.com/o/oauth2/v2/auth`, `https://oauth2.googleapis.com/token`, `<supabaseUrl>/rest/v1/rpc/calendar_secret_set`, `<supabaseUrl>/rest/v1/app_settings`. |
| **Disk I/O** | None persistent — everything lives in-process for ~2 seconds. |
| **Container verdict** | **Stays on host** — it is designed as a one-time, human-interactive, loopback-browser OAuth flow, and Phase 14's context file already flags this ("browser in a container with persistent profile... IF research confirms it is workable" is about Blackboard, not this). This script *can* run inside a **dev container with a browser available on the host** (loopback port forwarding + `xdg-open` on Linux) since it already branches on `process.platform` — it would just need `!process.env.DISPLAY` handling or the printed URL fallback (already exists: it prints the URL to stderr regardless, `scripts/google-consent.mjs:202`) so a headless container still works by pasting the URL into the host browser. |
| **Concrete changes needed** | None required for correctness; if run in a container, rely on the existing "if the browser did not open, visit: `<url>`" fallback rather than trying to make `xdg-open` reach a GUI browser inside the container. |

### validate-grading.ps1

| | |
|---|---|
| **Name** | `scripts/validate-grading.ps1` |
| **How started today** | Stack runs `.\scripts\validate-grading.ps1 [Course]` from the repo root **in PowerShell**. |
| **Runtime** | Windows PowerShell (`$ErrorActionPreference`, `Split-Path -Parent $PSScriptRoot`, `Get-Content ... ConvertFrom-Json`, `Join-Path $env:USERPROFILE`, `$env:TEMP` — every one of these is PowerShell-only syntax; no bash equivalent in-repo). |
| **What it does** | Reads the `bb2dash` MCP server entry (command/args/env, **including the service key**) out of `~/.claude.json` (`$env:USERPROFILE\.claude.json`), writes it to a **temp file** (`$env:TEMP\bb2dash-validate-mcp-<guid>.json`) so `claude --mcp-config` can use it without the secret touching the repo, then launches `claude --strict-mcp-config --mcp-config <tmp> --restricted ... --allowedTools ... --disallowedTools ...` with a locked-down prompt confined to `docs/planning/**` and the three `mcp__bb2dash__*` tools. Deletes the temp file in a `finally` block. |
| **OS-bound assumptions** | Entirely PowerShell: `$PSScriptRoot`, `$env:USERPROFILE`, `$env:TEMP`, `ConvertTo-Json -Depth 6`, `Push-Location`/`Pop-Location`. No `.exe`/`explorer.exe`/`wt.exe` calls, but 100% non-portable syntax. |
| **Secrets/config** | Reads the bb2dash MCP server's env block (service key) from `~/.claude.json` — **never prints it**, only re-serializes it into a throwaway temp JSON file for `--mcp-config`, deleted after the run. |
| **Network** | None directly — delegates entirely to `claude` CLI + the already-registered MCP server. |
| **Disk I/O** | `%TEMP%\bb2dash-validate-mcp-*.json` (transient), reads `docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md` / `64_...md`, writes `docs/planning/sprint-1-hub/verification/65_GRADING_VALIDATION_<course>.md`. |
| **Container verdict** | **Rewrite as a cross-platform Node script** (matches Stack's frozen answer 13: "PowerShell scripts get rewritten cross-platform"). This one is the simplest of the two PowerShell scripts to port: no Windows-only APIs are load-bearing, just PowerShell syntax for reading `~/.claude.json`, building a temp MCP config, and shelling out to `claude`. A ~40-line Node script (`fs.readFileSync`, `os.tmpdir()`, `child_process.spawn('claude', [...])`) reproduces it exactly and runs identically in the dev container. |
| **Concrete changes needed** | Port to `scripts/validate-grading.mjs` (Node), same flag set; keep the PowerShell version only if Stack wants a native-Windows fallback outside the container. |

### web/ — Next.js app (dev/test only; production stays on Vercel)

| | |
|---|---|
| **Name** | `web/` (bb2dash-web) |
| **How started today (local)** | `npm run dev` (Next 16.3.4, Turbopack) on Stack's laptop for local iteration; `npm run build` for production builds (deployed to Vercel, out of Phase 14 scope per Stack's answer 2). |
| **Runtime + version** | Node (no `engines` pinned in `web/package.json` — Next 16.3.4 requires Node ≥ 20.9 per Next's own docs), React 19.3.0, `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.116.0. |
| **Tests** | `npm test` → `vitest run` (jsdom environment, `web/vitest.config.mts`, `web/test/setup.ts`), ~85 test files under `web/test/`. **No Playwright/e2e suite exists in `web/` today** — confirmed by grep: zero Playwright references under `web/` (only `web/package-lock.json` transitively, and the Phase 12 Electron worktree's separate `desktop/` package). Playwright appears only in prose (bb-sync's manual browser downloads, and planning docs for a *future* Electron e2e suite) and as the ad-hoc MCP browser tool (`.gitignore` ignores `.playwright-mcp/` — screenshot/snapshot output from the Playwright **MCP tool**, not an in-repo test suite). |
| **Type regeneration** | `web/src/lib/supabase/database.types.ts` is **regenerated manually by the PM** at integration time via the Supabase MCP's `generate_typescript_types` tool (confirmed: `docs/planning/sprint-0-foundation/superseded/21_D2_architecture_direction.md:1129`, `project-state/ORCHESTRATOR.md:153` — "returns ~140 KB, more than a tool result can carry; the harness saves..."). **No `supabase` CLI config exists in the repo** (`supabase/config.toml` absent) — type generation and edge function deploys both go through the Supabase MCP or ad-hoc `supabase functions deploy` (see next section), never a local `supabase start`. |
| **OS-bound assumptions** | None found in `web/src` proper (`web/src/proxy.ts` is portable Next.js middleware). |
| **Secrets/config** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`web/.env.example`) — both browser-safe by design, RLS is the boundary. |
| **Network** | `goultdzqcavefcgnifdy.supabase.co` (REST, Storage, Auth) at runtime; Vercel for deploys (out of scope). |
| **Disk I/O** | `.next/` build output (local only). |
| **Container verdict** | **Dev-container only.** `npm run dev`/`npm test`/`npm run typecheck` all containerize trivially (standard Node dev-container pattern); production stays on Vercel per Stack's answer 2. If Playwright e2e is ever added to `web/`, it would need the Playwright browser-download step in the Dockerfile (`npx playwright install --with-deps chromium`), but that doesn't exist today. |
| **Concrete changes needed** | None to the app itself; add a `web`-scoped dev Dockerfile/devcontainer with the pinned Node version, and document that `database.types.ts` regeneration still goes through the Supabase MCP (no local Supabase needed for it). |

### supabase/functions/* — Edge Functions (deploy path only; runtime is fully managed)

| | |
|---|---|
| **Name** | `supabase/functions/{calendar-push,embed-corpus,search}` |
| **How started today** | **Not run locally at all.** Deployed to Supabase's managed Edge Runtime via either `supabase functions deploy <name> --project-ref goultdzqcavefcgnifdy` (Supabase CLI, per `mcp-server/README.md:224`) **or** the Supabase MCP's `deploy_edge_function` tool (used interchangeably per docs, e.g. `mcp-server/README.md:227`, `docs/planning/sprint-1-hub/briefs/62_PHASE9_sync_loop.md`). No `supabase/config.toml` exists, so there is no local Supabase stack (`supabase start`) in this project — confirmed absent from the repo. |
| **Runtime** | Deno, inside Supabase's managed Edge Runtime (cloud-only — Stack's answer 2 keeps Supabase fully managed, no local Supabase). |
| **OS-bound assumptions** | None — these are cloud-only TypeScript/Deno files. |
| **Secrets/config** | `calendar-push` reads Vault secrets (`google_client_id`, `google_client_secret`, `google_refresh_token`, `calendar_push_secret`) server-side in Supabase, and authenticates via an `x-push-secret` header (per repo `CLAUDE.md`); `verify_jwt` is off only for this function. `search`/`embed-corpus` run behind `verify_jwt` normally. |
| **Network** | Google Calendar API (`calendar-push`), internal Supabase Postgres (`embed-corpus`, `search`), `Supabase.ai.Session('gte-small')` in-runtime embedding. |
| **Disk I/O** | None locally. |
| **Container verdict** | **Stays on host / not containerized by this project at all** — genuinely out of scope (managed by Supabase). The only local-machine question is: **does the dev container need the Supabase CLI** to deploy these? Answer: **optional, not required** — deploys already happen via the Supabase MCP tool (`mcp__plugin_supabase_supabase__deploy_edge_function`) from inside a Claude Code session, with no local CLI. Installing the Supabase CLI in the dev container is a nice-to-have for `supabase functions deploy` parity but not a hard dependency. |
| **Concrete changes needed** | None required; optionally add the Supabase CLI binary to the dev-container image for parity with the documented `supabase functions deploy` path. |

### db/ — migrations, seed, fixtures, SQL tests

| | |
|---|---|
| **Name** | `db/migrations/*.sql` (81 files), `db/seed/*.sql`, `db/fixtures/phase10a/*`, `db/tests/*.sql` |
| **How started today** | **Migrations**: dry-run inside `begin; ...; rollback;` via the Supabase MCP's `execute_sql`, then applied for real with `apply_migration` under the file's exact basename (confirmed pattern repeated across every phase's verification doc, e.g. `docs/planning/sprint-0-foundation/50_PHASE7_retrieval_polish.md:89-91`, `docs/planning/sprint-1-hub/briefs/67_PHASE10A_grades.md:64-65`). Never applied by a local `psql` against prod. **SQL tests** (`db/tests/*.sql`): concatenated and piped to `psql "$DATABASE_URL"`, **or** — the actual method used in practice, per `db/fixtures/phase10a/README.md:48-49` and `docs/planning/sprint-1-hub/verification/66_W17_VERIFICATION.md:639-640` ("No `psql` connection is available to this session") — pasted into one `execute_sql` MCP call. **Fixture loader regeneration**: `node db/fixtures/phase10a/build_load_sql.js` regenerates `db/tests/phase10a_load_fixtures.sql` from the JSON fixtures; `web/test/fixtures.phase10a.test.ts` re-runs the generator in-memory and fails if the committed `.sql` drifted. |
| **Runtime** | Plain SQL (Postgres 17 dialect) + one Node build script (no extra deps). |
| **OS-bound assumptions** | None. |
| **Secrets/config** | The `psql "$DATABASE_URL"` path implies a Postgres connection string with credentials, which is **not present anywhere in the repo today** (no `DATABASE_URL` in `.env.example`) — meaning `psql` against prod is documented as an option but has **never actually been available/used** in a session per the verification notes; `execute_sql` (project-owner auth via the MCP, no key needed client-side) is the real, load-bearing path. |
| **Network** | Supabase Postgres, via MCP (owner auth) or (theoretically) direct `psql`. |
| **Disk I/O** | Reads/writes only files under `db/`. |
| **Container verdict** | **Dev-container only**, and mostly redundant with what the MCP already does. If Stack wants a genuine local `psql` path (e.g. to test migrations against a scratch DB instead of pasting into `execute_sql`), the dev container should ship `postgresql-client` (for `psql`) plus `DATABASE_URL` wired to the *pooler* connection string (a secret, mounted via `.env`/Docker secrets per Stack's answer 8) — but note Stack's answer 2: **no local Supabase**, so this would still point at the same managed cloud Postgres, just via a direct connection instead of the MCP. |
| **Concrete changes needed** | None strictly required (MCP `execute_sql` already works from any environment that can reach Claude Code); optionally add `postgresql-client` to the dev-container image and document the `DATABASE_URL` secret if Stack wants `psql` parity. |

### checkpoint skill (`.claude/skills/checkpoint/`)

| | |
|---|---|
| **Name** | `.claude/skills/checkpoint/SKILL.md` + `build-note.mjs` |
| **How started today** | `/checkpoint [collection]` inside a **cloud** Claude Code session (explicitly for sessions "where the user's session-capture hook cannot" reach the vault) — it is not a laptop-resident background process; it's a slash command run inside whatever session invokes it. |
| **Runtime** | Node (`build-note.mjs`, uses `node:child_process.execFileSync('git', ...)`, `node:crypto`, `node:fs`), with a documented pure-bash/python3 fallback if Node is unavailable. |
| **OS-bound assumptions** | None — pure git + fs + string building, explicitly designed to run in an ephemeral cloud sandbox. |
| **Secrets/config** | None touched directly; reads `CLAUDE_CODE_REMOTE_SESSION_ID` / `CLAUDE_CODE_SESSION_ACCESS_TOKEN` env vars (session identity only, not a project secret) at `build-note.mjs:44-45,175-184`. |
| **Network** | `git push` to the bb2dash repo's own remote (writes `.harness/sessions/<id>.md`). |
| **Disk I/O** | Writes `.harness/checkpoint-body.md` (gitignored, transient) and commits `.harness/sessions/<id>.md`. |
| **Container verdict** | **Out of scope for a bb2dash container** — this produces a git commit from *within* a cloud session; the nightly collection job that folds these notes into the Obsidian vault + RAG store lives in `agentic-harness` (a different repo, likely another researcher's territory per the Phase 14 context file's repo list) and runs on Stack's laptop via Windows Task Scheduler (`AgenticHarness-CheckpointCollect noon`, per user's auto-memory) — that scheduler job is explicitly Stack's answer 9's target for replacement by a scheduler container, but its implementation is outside this repo. |

---

## 2. Electron desktop shell (`bb2dash-wt-electron-12` worktree, `desktop/`)

Phase 12 is **mid-build** (per user memory: "W-25/W-26 on their worktrees" as of 2026-09-16). Only
`desktop/src/core/*` and a handful of `desktop/src/main/*` files exist on this worktree; the actual
`src/main/index.ts` (window bootstrap), `sync-terminal.ts` (the wt.exe spawn), `window.ts`, and
`navigation.ts` are **not yet written** on this branch — they are W-25's deliverables per the
Contract (`docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md:52-72`). So the "Sync button code path" cannot be
read as committed code yet; it is fully specified in the frozen Contract instead (C-8, amended by
Stack's Q9 answer).

### The Sync button seam (from the frozen Contract, `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md`)

- **Detection** (C-8, lines 189-198): the shell watches `session.webRequest.onCompleted` for the web
  app's own `POST /rest/v1/agent_requests` (the button already does this — "zero renderer changes").
  On a 2xx it reads `agent_requests?kind=eq.sync&state=eq.queued&order=id.desc&limit=1` (query **R4**,
  frozen at line 147) and, if that row's id isn't already in the notification watermark's `firedKeys`
  under key `syncterm:<id>`, spawns a terminal.
- **Spawn** (C-8 amended by Q9, lines 286-297): `<wt> -d <repoDir> --title "bb-sync <id>" powershell.exe
  -NoExit -NoLogo -ExecutionPolicy Bypass -Command "claude '/bb-sync <id>'"` — **this runs the sync
  immediately** (Stack's Q9 answer changed it from "typed, not run" to "run"), via `child_process.spawn`
  with an argv array (never a shell string), `detached: true`, `stdio: 'ignore'`, `.unref()`.
- **`<id>` validation**: must match `^\d{1,12}$` **before any argv is built** — this is the exact seam
  Phase 14 needs for "button only queues the request" (Stack's answer 12): the id-validate-then-spawn
  step is already isolated in one pure function.
- **The seam for "button only queues the request" already exists by construction**: per C-8, the web
  app (`web/`, untouched by Phase 12) already does 100% of the queuing (`INSERT INTO agent_requests`).
  The *only* thing Phase 12 adds is a **local watcher** that notices the insert and launches the sync.
  For Phase 14, this watcher is exactly what a **watcher container** should replace: instead of
  `wt.exe` + PowerShell + `claude` spawned by an Electron main process, a container polls
  `agent_requests` (or a Postgres `LISTEN/NOTIFY`/webhook) for `kind=sync AND state=queued` and runs
  `claude -p "/bb-sync <id>"` itself — this is explicitly anticipated in code: `desktop/src/core/types.ts`
  documents the `Launcher` interface as *"Electron supplies `child_process.spawn`; a container later
  runs `claude -p` (C-13)"* (line 113-116).

### C-13 Portability split — what's already plain Node and reusable

`docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md:309-320` (C-13, driven by Stack's Q7 answer, recorded as **R-28**)
freezes an explicit Electron/container split:

- **`desktop/src/core/`** — plain Node, **zero `electron` imports**, enforced by a dedicated unit test
  (`desktop/test/unit/core-portability.test.ts`, confirmed present and reading exactly as described:
  it greps every `.ts` file under `core/` for `from 'electron'`, `require("electron")`,
  `import("electron")`, and Electron-only globals `app.getPath`, `BrowserWindow`, `powerMonitor`,
  `safeStorage`, `ipcMain`, `ipcRenderer`; only `poller/watermark.ts` may touch `node:fs`). Contains:
  `config` schema, `rest.ts` (PostgREST GET), `session-decode` (cookie string → token, no I/O),
  `poller/{sources,reducer,watermark}` behind a `WatermarkStore` interface, `sync-command` (the argv
  builder, `BuildSyncCommand` type at `desktop/src/core/types.ts:118-123`), and two swap points:
  `Notifier { show(toast) }` and `Launcher { spawn(argv, cwd) }` (`types.ts:82-116`).
- **`desktop/src/main/`** — the Electron-only adapter layer: cookies from the BrowserWindow partition,
  `Notification`, `child_process.spawn`, `Tray`, `BrowserWindow`.
- Per the Contract text verbatim: *"A container later supplies a token from the environment, a webhook
  or ntfy `Notifier`, and a `Launcher` that runs `claude -p`; that is the whole port. The Blackboard
  crawl inside `/bb-sync` needs a logged-in browser (NetID + Duo), which is the open problem of that
  migration and not this phase's."* — i.e., the Phase 12 designers already scoped the exact same
  auth problem this Phase 14 research context calls out as an open question.
- The worktree's own `CLAUDE.md` (read directly) confirms the intent in its own words: *"There is no
  Docker during development; containers are the post-development target (R-28), so keep OS-bound code
  behind thin adapters."*

### Electron process facts

| | |
|---|---|
| **Runtime** | Electron 44.4.1 (pinned in `desktop/package.json`), TypeScript, vitest for unit tests, `@playwright/test` 1.63.0 for e2e (Playwright-for-Electron pattern, `_electron.launch()`). |
| **OS-bound assumptions found in committed code** | `desktop/test/unit/test-hook.test.ts:95,108` records a fixture spawn call `['wt.exe', '-d', 'C:/repo']` — confirms the wt.exe convention is already baked into the test harness even before `sync-terminal.ts` exists. `desktop/src/core/types.ts:113-116` documents the Launcher/spawn split. The Contract text (not yet code) specifies `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` resolution, PowerShell 5.1 (not pwsh — "checked 2026-09-16" per line 207), `AppUserModelId`, `safeStorage`, tray icon — all Windows-only APIs, entirely in `desktop/src/main/` by design. |
| **Container verdict for `desktop/` as a whole** | **Stays on host** — this is a Windows desktop shell (taskbar icon, tray, toast notifications, `wt.exe`) with no Linux/macOS target (Contract's "Out of scope" section explicitly excludes macOS/Linux). Only the **watcher pattern it pioneers** (poll `agent_requests`, validate id, launch sync) is what Phase 14 should extract into a real container, replacing Electron's role in that one seam. `desktop/test/e2e` (Playwright-for-Electron) needs a real Electron binary + display server (or Xvfb) to run at all — containerizable as a **dev/CI job with Xvfb**, but never as a production service. |

---

## 3. Grep sweep — every hard-coded absolute path / Windows-ism found

Searched the whole `bb2dash` main checkout (excluding `node_modules`, `.next`) for
`C:/`, `C:\\`, `Users/estac`, `.ps1`, `powershell`, `explorer.exe`, `wt.exe`, `OneDrive`, `win32`.

### Code files (not just docs/prose) — these are the ones that actually execute

| Pattern | File:line | What it is |
|---|---|---|
| `C:/Users/estac` | `mcp-server/README.md:56,90,93` | Setup instructions and a literal Node command-build snippet for `claude mcp add-json` — hard-codes the repo path and `node.exe` path. |
| `C:/Users/estac` | `mcp-server/scripts/smoke.mjs:33` | Default `--env-file` fallback: `'C:/Users/estac/projects/bb2dash/.env'`. |
| `Users/estac` (via `$env:USERPROFILE`) | `scripts/validate-grading.ps1:20` | `Join-Path $env:USERPROFILE ".claude.json"` — not literally hard-coded but 100% PowerShell/Windows-profile-shaped. |
| `.ps1` | `scripts/validate-grading.ps1` (whole file) | Entire script is PowerShell; see process table above. |
| `.ps1` | referenced (not present in electron worktree yet) `scripts/make-shortcut.ps1` per `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md:68,239-242` | Planned Desktop/Start-Menu shortcut creator — Windows-only by nature (shortcuts). |
| `explorer.exe` | `scripts/google-consent.mjs:151-152` | `process.platform === "win32" → ["explorer.exe", [url]]` — already branches correctly per-OS (see process table). |
| `wt.exe` | `desktop/test/unit/test-hook.test.ts:95,108` (electron worktree) | Fixture spawn recording `['wt.exe', '-d', 'C:/repo']`. |
| `wt.exe` | `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md` multiple (C-8, DoD) | Sync button's terminal spawn target, not yet in committed `desktop/src/main` code on this worktree. |
| `win32` | `scripts/google-consent.mjs:151` | The one legitimate cross-platform branch (`win32`/`darwin`/else) — a **model** for how the rest of the OS-bound code should be written. |
| `powershell.exe` | `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md:202,207,292` | Sync-terminal spawn command target (Contract text; not yet committed code). |
| `OneDrive` | `ingest/CADENCE_RUNBOOK.md:25` | `Device:` inputs list `OneDrive bb2dash/course context/` as where the local mirror lives. |
| `OneDrive` | `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md:219` | Withdrawn C-9 file-mirror's default root, `C:\Users\estac\OneDrive - Syracuse University\...` — explicitly dropped from Phase 12 scope in favor of the container direction (Stack's Q7 answer), consistent with Phase 14's answer 7 (vault moves out of OneDrive). |

### Prose-only occurrences (planning docs, `project-state/*`, `NOTES.md`, `AUDIT_2026-09-09.md`, `gui research context/`, `maps/*.json`, lock files) were found but are **not executable code** — they describe the same facts already captured above (repo path, OneDrive location, PowerShell moves) and are not separately actionable. Full file list from the sweep, for completeness:

```
project-state/ORCHESTRATOR.md, project-state/STATUS.md, project-state/DECISIONS.md,
docs/planning/sprint-0-foundation/{00_AGENT_BRIEF,40_RECONCILIATION_2026-09-09}.md,
docs/planning/sprint-0-foundation/superseded/{10_R1_gui_binding_audit,11_R2_data_inventory,
12_R3_pipeline_and_runtime,20_D1_gui_direction,21_D2_architecture_direction,
22_D3_risk_and_scope_review,30_PHASED_PLAN,31_PLAN_REVIEW}.md,
docs/planning/sprint-1-hub/{60_REQUIREMENTS_v2,70_MVP_INDEX}.md,
docs/planning/sprint-1-hub/briefs/{63_GRADING_VALIDATION,66_SESSION_ARCHIVAL_RAG,
69_PHASE11_planner,80_PHASE12_electron}.md,
docs/planning/sprint-1-hub/verification/69a_W21_VERIFICATION.md,
docs/planning/sprint-1-hub/research/77_RESEARCH_phase12_electron.md,
CLAUDE.md, NOTES.md, AUDIT_2026-09-09.md, PLAN_EMBEDDING_POC.md,
skills/{bb-course-map,bb-course-pull}/SKILL.md, skills/bb-sync/SKILL.md,
ingest/{AGENT_BRIEF,CADENCE_RUNBOOK,FILE_HARVEST_SPEC,PILOT_IST352}.md,
gui research context/gui/{00-mvp-plan,03-lecture}.dc.html, maps/GEO.103.lecture.course_map.v2.json,
"fall2026 courses + context.txt", web/package-lock.json, mcp-server/package-lock.json
```

### A note on the task brief's assumption re: bb-course-map / bb-course-pull

The task brief describes these as "anthropic-skills referenced... note they live outside the repo."
**That is only half true.** There *are* globally-installed `anthropic-skills:bb-course-map` /
`anthropic-skills:bb-course-pull` skills available to this session (visible in the system skill
listing), but the bb2dash repo **also** commits its own copies at `skills/bb-course-map/SKILL.md`
and `skills/bb-course-pull/SKILL.md` (confirmed by direct read — both are full, repo-specific
skill definitions referencing `bb2dash` tables and the `ingest/bb_crawler.js` helper). `ingest/AGENT_BRIEF.md:5`
even references them by an absolute **Linux** path, `/home/claude/bb2dash/skills/...`, confirming
these skills are already run inside Claude Code cloud sandboxes (Linux) today for the harvest/mapping
half of the pipeline — only the live Blackboard *login* is laptop-bound. This is good evidence that
the mapping/pulling *logic* (once a session cookie exists) is already container-portable; only the
credential acquisition is not.

---

## 4. Proposed minimal container services for bb2dash

Given Stack's frozen answers (managed Supabase/Vercel stay as-is; $0 spend; portability first;
multi-arch later) and everything found above, a minimal set:

1. **`bb2dash-mcp`** (long-lived-per-invocation stdio service) — `mcp-server/` built into a small
   Node image (`node:20-slim` or `node:22-slim`). Entrypoint: `node dist/index.js`. Claude Code's MCP
   registration in `~/.claude.json` changes from a native `node.exe` command to `docker run -i --rm
   --env-file <path> bb2dash-mcp`. No ports exposed (stdio only).

2. **`bb2dash-sync-watcher`** (one-shot job, triggered on demand or by a scheduler tick) — polls
   `agent_requests` for `kind='sync' AND state='queued'`, and when a Blackboard session is valid,
   runs `claude -p "/bb-sync <id>"` non-interactively. This is the direct container analogue of the
   Electron shell's C-8 spawn seam (`Launcher.spawn` in `desktop/src/core/types.ts`) and of
   Stack's answer 6. Depends entirely on solving the noVNC/browser-auth question (answer 4) — until
   then this container can run the **non-browser half** (steps 1-2 claim/login-check, 4-6
   wait/report) and hand off the crawl to whatever holds the authenticated browser.

3. **`bb2dash-blackboard-browser`** (persistent service, research-gated) — a container running a
   real browser (e.g. Playwright/Chromium or a full desktop-in-container) with a persistent profile
   directory mounted as a volume, exposed to Stack via noVNC/VNC-over-web so he can complete the
   NetID+Duo login by hand when the session dies; `ingest/bb_crawler.js` gets loaded into that
   browser's console/page context by the watcher once the session is confirmed alive. This is squarely
   the open research question in Phase 14's context (answer 4) — flagging it here as the missing
   piece the sync-watcher depends on, not asserting it is solved.

4. **`bb2dash-extract`** (one-shot job) — `ingest/extract_text.py` + Poppler (`poppler-utils`) +
   python-docx/pptx/openpyxl in a slim Python image (`python:3.12-slim`). Invoked per batch of
   downloaded files; no secrets, no network.

5. **`bb2dash-web-dev`** (dev-container only, never a production service) — `web/` on the pinned
   Node version, for `npm run dev`/`test`/`typecheck`; Vercel remains the deploy target.

6. **`bb2dash-devcontainer`** (Claude Code PM/worker sessions) — the umbrella dev container Stack's
   answer 3 asks for: Claude Code CLI + Node + Python + `postgresql-client` (optional, for `psql`
   parity) + the Supabase CLI (optional, for `supabase functions deploy` parity) + git, mounting the
   repo and `.env`. This is where `validate-grading` (once ported to Node), the SQL test
   concatenation-and-paste workflow, and ordinary development happen.

Explicitly **not** containerized: `supabase/functions/*` (managed Edge Runtime only), Vercel's
production `web` build, the Electron `desktop/` shell itself (stays a native Windows app; only its
*pattern* is mined for the watcher), and `scripts/google-consent.mjs` (one-time, human-run — can be
run inside the dev container but gains nothing from a dedicated service).

---

## 5. Things I could not fully verify

- Whether `ingest/AGENT_BRIEF.md`'s `/home/claude/bb2dash/...` paths reflect the **current** cloud
  sandbox layout or an older one — the file has no date; treat the Linux-path evidence as directional
  ("this class of work has run on Linux before"), not as a guarantee of today's exact sandbox layout.
- Exact pinned Python version/toolchain for `ingest/extract_text.py` — no `requirements.txt`,
  `pyproject.toml`, or `.python-version` exists anywhere in the repo; version constraints for
  `python-docx`/`python-pptx`/`openpyxl` are undocumented in-repo and would need to be chosen fresh
  for the extraction container.
- The Electron worktree's `src/main/index.ts`, `sync-terminal.ts`, `window.ts`, `navigation.ts` are
  **not yet committed** on `bb2dash-wt-electron-12` — everything reported about the actual spawn code
  is from the frozen Contract document (`docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md`) plus the one test
  fixture that already references `wt.exe`, not from a committed implementation. If Phase 12 merges
  with changes from the Contract, this section should be re-checked against the real
  `sync-terminal.ts`.
