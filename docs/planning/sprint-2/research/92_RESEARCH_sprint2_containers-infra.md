# 92 — Sprint 2 research: containers-infra

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-88..R-96 (§1.7) and §2 P-38, P-39,
P-44..P-51, §6 questions 39–42

## 0. Summary

Phase 14's own six research files (2026-09-16) already got the architecture right — Compose
`include:`, file-based secrets with a `*_FILE` shim, a long-running-service scheduler instead of
Ofelia/cron, `just`, build-locally-no-registry — so this pass verifies each choice against primary
docs and today's upstream state rather than re-deriving it, and sharpens five things the brief
states as settled but isn't: the `env_file`-under-`include:` bug R4 cited is long closed
(docker/compose#11577, fixed 2024), but a current, maintainer-confirmed limitation (#13945) means
that field is interpolation-only and must never carry a secret or runtime var; `just` still
defaults to `sh` on Windows and needs an explicit `[windows]` shell override; Anthropic's own
reference devcontainer still pins Node 20 against this stack's Node 22; node-cron's
`missedExecutionTolerance` (new since R4 was written) is a few-second drift tolerance, not the
multi-hour catch-up R-90 needs, and must not be conflated with it; and two P-items the scope names
(P-49 skills, P-51 the harness doc) have no coverage yet in either brief. The biggest risk is
R-90: a scheduler that must persist `last_run_at`, catch up at container start, never overlap the
harness's own realm lock, and prove itself across a real sleep/wake cycle — no library does this
out of the box, so it is hand-written and needs its own tests. Second risk: R-92's dev container
is genuinely useful (devcontainer CLI runs headless, no VS Code required) but drifts from
Windows-native memory/skills/secrets the moment both environments are live at once, which
guardrail #16 requires until acceptance. Total size across R-88..R-96: two L (R-90, R-92), four M
(R-88, R-89, R-95, R-96), three S (R-91, R-93, R-94) — unchanged from the brief's own tags; nothing
here grows or shrinks a size, only sharpens scope. P-38/P-39 (VNC stack, Chromium sandbox) are
both S and resolve to a concrete pick each, not an open question.

## 1. R-88 · Umbrella repo, one command and a doctor bring the stack up

1. **Standard practice.** A multi-repo Compose stack that stays clonable is built from each
   component's own compose file plus one umbrella that aggregates them with `include:`, not a
   copy-pasted merged file — `include:` was purpose-built for "modularize an otherwise huge
   Compose file" (docs.docker.com/reference/compose-file/include). A single documented command
   surface (a Makefile-alike) plus a **read-only** preflight/doctor script that fails loud is the
   accepted shape for a one-person stack: the doctor "must not become a place to embed new
   feature behavior" (stephane-klein/development-kit-doctor-scripts's own framing, matches this
   repo's existing `hooks/doctor.mjs` design).
2. **Examples.**
   - docs.docker.com/reference/compose-file/include (fetched 2026-09-24) — the frozen syntax:
     `include: [{path, project_directory, env_file}]`; confirms R4's sketch is exactly the
     documented long form, nothing invented.
   - docker/compose#11577 (fetched via GitHub API, 2026-09-24) — the path-resolution bug R4 built
     `project_directory` around is **closed since 2024-03-05**, fixed by compose-go#593; not a live
     risk. The current, still-relevant issue is #13945 (2026; maintainer-confirmed): include-level
     `env_file:` "is used to process the yaml stream, but not preserved for later use, and can't
     apply to [a] build definition" — it only feeds `${VAR}` interpolation while parsing, never a
     service's runtime env or a Dockerfile `ARG`, and its own thread's fix is to never list `.env`
     itself there (later files can't override it). Borrow that fix; see point 3 and 6 below for
     what it means here. #13719 (open) wants it made optional — not a blocker, the umbrella always
     ships a root `.env`.
   - This repo's own `agentic-harness/hooks/doctor.mjs` (read directly, 178 lines) — the pattern
     to copy is the split between a pure `diagnose(env, home, {runGit})` that returns frozen rows
     and a `main` that only formats and prints; that split is what makes P-48's strict-exit test
     possible without a live filesystem in CI.
3. **Pitfalls.** The include-level `env_file:` interpolation-only limitation above (#13945) — the
   likeliest real mistake is a worker expecting an `include:` entry's `env_file:` to set a
   service's runtime environment or a build `ARG`, when it only interpolates `${VAR}` references
   while Compose reads the YAML. `just` on Windows: "just uses `sh` on Windows by
   default... `sh` must be available in the `PATH` of the shell you want to invoke `just` from"
   (raw `README.md`, casey/just, fetched 2026-09-24) — Stack's environment is "PowerShell
   (primary); Bash tool also available (Git Bash)"; if `just` is ever run from a plain PowerShell
   prompt without Git's `bin` on `PATH`, every recipe fails before it starts. Clock skew after a
   Windows sleep (docker/for-win#5131, #10347, already in R4) breaks both `docker compose ps`
   health and the doctor's own clock check unless the doctor re-checks it fresh each run, not
   once at container start.
4. **Maps onto this stack.** New repo `emstacho-su/bb2dash-stack`, private, sibling to
   `C:/Users/estac/projects/bb2dash` and `C:/Users/estac/agentic-harness` (matches how `include:`
   resolves paths against each included file's own location). `compose.yaml` `include:`s both
   repos' pieces with `project_directory` pinned on each entry; `secrets/` (gitignored) +
   `secrets.example/` (names only); `justfile` with the frozen verbs `up · down · logs · dev ·
   sync-now · ingest-now · login · doctor`. The doctor imports or shells out to
   `agentic-harness/hooks/doctor.mjs` for the realm/vault half and adds bb2dash's own rows:
   Docker/WSL2 up, `secrets/` file presence (names only), `docker compose ps` health, clock skew,
   fastembed cache non-empty, Supabase reachability. `sync-now` inserts a `kind='sync'`
   `agent_requests` row (never a second open one, per the existing one-open-sync rule);
   `ingest-now` execs the harness jobs container.
5. **Size M**, matches the brief. Seams: F-2 (`secrets/`), F-3 (harness jobs compose piece,
   `last_run_at` the doctor reads), F-5 (`dev` verb, `.devcontainer/`), cluster E (bb2dash's own
   compose piece, the sync service healthcheck, `login`'s noVNC port).
6. **What this changes.** Corrects the brief's implicit worry: the 2024 path-resolution bug this
   researcher first found while gathering context (#11577) is long fixed, so `project_directory`
   is best-practice hygiene, not a bug workaround — but the Contract should still state plainly
   that `include:`-level `env_file:` never carries a secret or a runtime variable (only YAML
   interpolation), per the still-current #13945 limitation, so a worker does not reach for it as
   the umbrella's `.env` mechanism. Research-added: pin `[windows] set shell := ["powershell.exe",
   "-NoLogo", "-Command"]` on at least the umbrella's own recipes (S) rather than assume Git's
   `sh` is reachable from wherever Stack types `just`.

## 2. R-89 · Every container gets credentials at runtime; no image holds a secret

1. **Standard practice.** Compose file-based `secrets:` mounts each secret at
   `/run/secrets/<name>`, read-only, and is not part of `docker inspect`'s `Config.Env` —
   `environment:`/`env_file:` values are, in plaintext (docs.docker.com/compose/how-tos/use-secrets,
   already cited in R4). The accepted bridge for a process that only reads an env var (Python's
   `psycopg.connect(DATABASE_URL)`, this project's own scripts) is the `*_FILE` convention the
   official `postgres`/`mysql`/`redis` images popularized: read `FOO_FILE`, `cat` it into `FOO`,
   `export`, then `exec` the real command from a tiny entrypoint shim.
2. **Examples.**
   - Docker's own secrets how-to (docs.docker.com/compose/how-tos/use-secrets, re-checked
     2026-09-24) — the canonical `secrets:` + `environment: FOO_FILE: /run/secrets/foo` shape;
     borrow the shape verbatim, not the specific image.
   - This repo's own `agentic-harness/mcp-server/src/env-file.ts` (read directly, 85 lines) — a
     working, already-tested version of the same idea one level up the stack: the MCP
     **registration** carries only `HARNESS_ENV_FILE` (a path), the server reads that file itself
     at start with `loadEnvFiles(env, {repoRoot, home})`, and the process environment always wins
     over the file. `docs/portable.md:213-217` (read directly) states the reason plainly:
     "`claude mcp get` prints a server's env block in clear text, so a connection string placed
     there is a connection string on every screen that shows it." Borrow the file whole — it is
     the exact shape R-91's materials server needs, already unit-tested in this account's other
     repo.
   - trufflesecurity.com/blog/how-secrets-leak-out-of-docker-images (in R4, re-confirmed live) —
     the layer-history attack this stack must not reproduce: an `ENV SECRET=...` or a `COPY`'d
     `.env` later `rm`'d is still recoverable from an earlier layer via `docker history --no-trunc`
     or `dive`; P-46 (below) is what makes that check runnable at all today.
3. **Pitfalls.** `env_file:`/`environment:` land in `docker inspect` in plaintext even though they
   "work" — a modest but real exposure once anything but a single-user laptop is in the picture
   (R4 §3, unchanged). `--env-file` on `docker run` has the same property and is explicitly what
   R5's node:20-slim + `docker run --env-file` recommendation for the materials MCP image gets
   wrong (the brief overrides it; confirmed still the right call).
4. **Maps onto this stack.** `bb2dash-stack/secrets/{database_url, supabase_service_key,
   sync_runner_db_url, novnc_password, bb2dash_mcp_service_key, claude_oauth_token, gh_token,
   supabase_access_token, vercel_token}` (names from R-89's own must-respect list) each a
   gitignored file; `secrets.example/` holds the same names, empty. Every service's compose entry
   gets `secrets: [name]` + `NAME_FILE: /run/secrets/name`, and an entrypoint shim (one script,
   shared via a small base image or copied per Dockerfile) does the `FOO_FILE → FOO` expansion
   before `exec`. The materials MCP server (`mcp-server/src/config.ts`) and any Python `uv`
   process both go through this; `mcp-server/README.md:88-97`'s `docker run -i --rm` registration
   recipe gets a `-v <path>:/run/secrets/bb2dash_mcp_service_key:ro` bind instead of `-e`.
5. **Size M**, matches the brief (adds no scope, only a shared shim). Seams: F-1 (secret file
   layout lives in the umbrella), F-3/F-4/F-5 (each consumer's specific names), cluster E
   (`sync_runner_db_url`, `novnc_password`; the `sync_runner` role's password is set out of band
   so migration 091 stays byte-identical to prod).
6. **What this changes.** Confirms the brief's design is right; corrects its "the key exists in
   exactly one place... as today" claim (it does not — two places today, per R-89's own §State
   today) and ties P-45/P-46 in explicitly: P-45 (materials server reads a file path, not an
   inline env block) is the concrete first instance of this pattern, portable from
   `agentic-harness/mcp-server/src/env-file.ts` almost unchanged; P-46 (install gitleaks) is the
   missing tool that turns "scan images before ever pushing" from an aspiration into a runnable
   DoD line — `scoop install gitleaks` or the official image, since neither gitleaks nor
   trufflehog is on `PATH` today (checked 2026-09-24).

## 3. R-90 · Harness nightly and collector jobs run in a container and catch up

1. **Standard practice.** "Missed-run catch-up" is not a feature any of the usual container
   schedulers ship: Ofelia and supercronic both fire only while the container is running and skip
   a trigger that occurred while it wasn't (R4 §2, re-verified below); the standard Linux answer to
   "catch up after being off" is `anacron`, which is its own daemon with its own state files
   (docs.oracle.com/en/operating-systems/oracle-linux/8/cron/configuring_anacron_jobs.html) — more
   moving parts than the job needs. The accepted pattern for a single long-running job process is
   a **persisted last-run timestamp** checked at process start before the first scheduled fire:
   "if we missed the window..., run once at startup" (R4's own sketch, still the right shape).
2. **Examples.**
   - `netresearch/ofelia` (github.com/netresearch/ofelia, checked 2026-09-24) — the actively
     maintained fork R4 flagged is still active today: PR #833, a dependency bump, merged
     2026-09-10 (two weeks before this research), so "current-best-effort" from R4 still holds.
     Borrow nothing from it directly — it confirms by its own absence of a catch-up flag or issue
     that this feature has to be hand-written, not adopted.
   - `node-cron` (npmjs.com/package/node-cron, checked 2026-09-24) — its newer
     `missedExecutionTolerance` option ("a run that wakes within tolerance... still executes;
     later than that, it is reported as missed"; default 1000 ms, raisable to e.g. 5 minutes) is
     **not** the feature this requirement needs: it smooths OS-timer jitter (GC pauses, CPU
     throttling) on the order of seconds to a few minutes, not "the laptop was asleep from 03:00
     to 08:00." Do not cite this option in the brief as solving catch-up — it solves a different,
     smaller problem, and conflating the two would leave the real gap unguarded. This project's
     own `agentic-harness/scripts/nightly-ingest.sh` (read directly, 80 lines) proves the point:
     it has no catch-up logic at all today — it is a pure `set -u` script that runs once when
     invoked and relies entirely on the external scheduler (Task Scheduler today) to invoke it at
     the right time, exactly the gap R-90 exists to close.
   - This repo's own `agentic-harness/db/docker-compose.yml` (read directly, 57 lines) — not a
     scheduler, but the closest in-repo precedent for the jobs container's compose shape: pinned
     exact tag (never a floating tag, "an upgrade should be a reviewed edit to this line"), a
     `healthcheck:` using the service's own readiness probe, a named volume (never a Windows-drive
     bind mount — Postgres "refuses a data directory it does not own with 0700 permissions," and
     NTFS bind mounts cannot give it that, citing `docker/for-win#445`). Borrow the tag-pinning and
     named-volume rules verbatim for the jobs image's model cache.
3. **Pitfalls.** Conflating `missedExecutionTolerance`-style drift tolerance with real catch-up
   (above) — this is the single most likely way a worker "solves" R-90 with a library flag that
   does not actually do the job. Both `nightly-ingest.sh` and `-CheckpointCollect` currently run
   only while the user is logged on (Interactive trigger, `WakeToRun` false per the existing
   Task-Scheduler registration) — the container scheduler must not silently inherit that same
   limitation by only running while Docker Desktop happens to be started; `restart:
   unless-stopped` plus "start Docker Desktop at login" (R4 §6) is what actually closes it, not
   the scheduler's own code.
4. **Maps onto this stack.** `docker/jobs/Dockerfile` (uv multi-stage per
   `astral-sh/uv-docker-example`, already in R4; non-root; `tini` or similar as PID 1 to reap the
   collector's detached `uv run ingest --only` children) plus a jobs compose piece with a
   `scheduler-state` named volume holding `last_run_at` per job, a `healthcheck:` on the loop's own
   heartbeat file, and `logging: *default-logging` (the `x-logging` anchor from R4 §7: `json-file`,
   `max-size: 10m`, `max-file: 3`, `compress: true` — the log-rotation half of this requirement).
   The scheduler wraps exactly the two existing entry points, unchanged: `nightly-ingest.sh`
   (mirrors `nightly-ingest.ps1` step for step already) and the collector's own command; it never
   overlaps the harness's own per-realm lock (`hooks/lib/realm-lock.mjs`, read by `doctor.mjs`
   above) with the twice-daily checkpoint collector, per harness decision R-B3.
5. **Size L**, matches the brief — the largest item in scope. Seams: F-2 (`DATABASE_URL` shim,
   realm-push credential), F-1 (`ingest-now`, doctor's `last_run_at` row), F-7 (base-image arm64
   manifests), F-5 (the Node fastembed cache and `~/.claude/projects` transcripts the collector
   sweeps need to be reachable from wherever the job actually runs — see question 41).
6. **What this changes.** Sharpens, does not resize: the brief's "internal-timer process with
   missed-run catch-up, not Ofelia/cron" phrasing needs one added sentence distinguishing it from
   `node-cron`'s drift-tolerance option so a worker does not reach for the wrong tool. Ties in
   P-47 (`FASTEMBED_CACHE_DIR` on home-pc, `local_cache/` gitignored — real today: `git status`
   shows `?? local_cache/` on `main`, confirmed in this session's own git-status snapshot) and P-50
   (the harness's local pgvector store, `db/docker-compose.yml` above, is not what D-20 declines —
   D-20 declines *this project* self-hosting Supabase, not the harness's own already-built local
   store used on the work VM).

## 4. R-91 · Materials MCP server ships as an image; its key arrives by file

1. **Standard practice.** An MCP stdio server in a container is invoked per-session with `docker
   run -i --rm`, not left running as a daemon — the client (Claude Code) owns the process
   lifecycle over stdin/stdout exactly as it would a bare `node` command. The one rule every real
   stdio server has to respect: **stdout is the protocol channel**, so any logging must go to
   stderr, never `console.log`.
2. **Examples.**
   - `docs.docker.com` / Docker's own MCP blog posts (docker.com/blog, "Simplify AI Development
     with the Model Context Protocol and Docker", checked 2026-09-24) — confirms the
     `docker run -i --rm` per-invocation pattern this repo's own `README.md:88-97` already uses;
     nothing to change there, only the secret-passing half (P-45).
   - `HaithamOumerzoug/keycloak-mcp` issue #6, "console.log in logger.ts and keycloak.ts corrupts
     stdio MCP transport" (found via search, matches the same failure reported independently in
     `dirmacs/daedra` #4, `yamadashy/repomix` #1866, `espressif/esp-idf` #19087) — a well-documented,
     repeatedly-independently-rediscovered pitfall: "a single `console.log` corrupts the frame and
     causes host parsing failures." Borrow the fix, not any one repo's code: grep the server for
     bare `console.log`/`console.info` and route them to `console.error` before it ever ships in a
     container, where a stray dependency's own startup banner is just as fatal as first-party code.
   - This repo's own `agentic-harness/mcp-server/src/env-file.ts` (already read in full for R-89)
     — the exact secret-by-path pattern to port: the registration carries `HARNESS_ENV_FILE`
     only, the server reads it itself. `SUPABASE_SERVICE_ROLE_FILE` for bb2dash's materials server
     is the same idea with a different key name.
3. **Pitfalls.** `docker run --env-file` (R5's original recommendation) puts the key in `docker
   inspect` in plaintext — the brief already overrides this; confirmed correct. A `node:22-slim`
   multi-stage build with `npm ci`/`npm run build` in the builder stage and only `dist/` +
   production `node_modules` copied into the runtime stage keeps the image from also shipping
   TypeScript source and dev dependencies, which is not this project's stated secret-leak concern
   but is a real, separate image-hygiene miss if skipped.
4. **Maps onto this stack.** New `mcp-server/Dockerfile` (node:22-slim per R-89's Node-version
   correction — see R-92 §6 — not node:20-slim as R5 first suggested) + `.dockerignore`
   (`node_modules`, `.git`, `*.md`, test fixtures). `mcp-server/src/config.ts:120-129` gains a
   `SUPABASE_SERVICE_ROLE_FILE` reader (new `mcp-server/src/env-file.ts`, ported from the
   harness's) with tests in `mcp-server/test/config.test.ts` (a sibling to the harness's own
   `mcp-server/test/env-file.test.ts`, already present there as precedent). `mcp-server/README.md`
   gains a `docker run -i --rm -v ...:/run/secrets/bb2dash_mcp_service_key:ro ...` registration
   recipe replacing the inline-env block at `README.md:88-97`.
5. **Size S**, matches the brief. Seams: F-2 (the secret file lives in
   `bb2dash-stack/secrets/`), F-5 (inside the dev container the same server runs as plain
   `node` with a Linux path and the same file indirection — the `claude-home` seed must exclude
   `~/.claude.json` or the key lands in a second place, per R-91's own note), F-7 (records
   `node:22-slim`'s arm64 manifest).
6. **What this changes.** Adds a concrete pitfall (`console.log` on stdout) the brief's DoD does
   not currently name; worth a one-line grep check in the DoD alongside the non-root and
   `.dockerignore` bullets. Everything else in the brief's plan for this item is confirmed as-is.

## 5. R-92 · Claude PM sessions run in a dev container with skills and memory

1. **Standard practice.** The dev container CLI is the reference implementation of
   `devcontainer.json` and runs it with no editor attached at all: `devcontainer up
   --workspace-folder <path>` builds and starts the container, `devcontainer exec --workspace-folder
   <path> <cmd>` runs a command inside it (code.visualstudio.com/docs/devcontainers/devcontainer-cli
   and github.com/devcontainers/cli, both checked 2026-09-24) — the spec was written so
   `devcontainer.json` metadata drives *any* tool, VS Code included but not required, which is
   exactly what R-92's "no VS Code" framing needs and gets for free from the spec rather than a
   custom loader. A firewalled outbound allowlist for an unattended coding agent is Anthropic's own
   published default, not a third-party pattern this project has to invent.
2. **Examples.**
   - `anthropics/claude-code/.devcontainer/` — Dockerfile, `devcontainer.json`, `init-firewall.sh`
     (all three fetched directly from `raw.githubusercontent.com/anthropics/claude-code/main/...`,
     2026-09-24; this is the "Anthropic reference devcontainer and firewall" the scope names).
     Concretely:
     - `Dockerfile`: `FROM node:20`, installs `git gh iptables ipset iproute2 dnsutils aggregate
       jq` plus `git-delta` and a zsh/powerlevel10k profile, runs as `USER node` after setup.
       **Still `node:20` today** (fetched fresh, not from memory) — this repo's own stack already
       targets Node 22 elsewhere (mcp-server, the jobs image per R4/R-90), so bump the base image
       to `node:22-bookworm` when adapting it, matching R3's own already-recorded finding
       (`82_RESEARCH_phase14_R3_devcontainer.md:103`) that Node 20 is at/near EOL by late 2026.
     - `devcontainer.json`: `runArgs: ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"]` (needed only
       for the firewall's own `iptables`/`ipset` calls, not for anything the agent itself needs),
       `postStartCommand: "sudo /usr/local/bin/init-firewall.sh"` with `waitFor:
       postStartCommand` so the container is unusable until the firewall is up, and two named
       volumes (`claude-code-bashhistory-${devcontainerId}`, `claude-code-config-${devcontainerId}`)
       instead of bind-mounting `~/.claude` — worth copying: it keeps container-side Claude state
       out of the host's `~/.claude` entirely, which is the opposite of what R-92's "reach
       memory" goal wants, so this repo's version must deliberately diverge here (see §4 below)
       rather than copy this file verbatim.
     - `init-firewall.sh`: default-deny `iptables`/`ipset` with an explicit allow-list
       (`registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, GitHub's published
       IP ranges via `api.github.com/meta`) — borrow the ipset-plus-allowlist structure directly;
       widen the allow-list with `*.supabase.co` and the Vercel API host this stack's PM sessions
       actually call, per R-92's must-respect line ("widened firewall keeping api.anthropic.com").
       Known issue to route around, not copy: `statsig.anthropic.com` has no public DNS record and
       the script treats any unresolvable domain as fatal (anthropics/claude-code#55623, found via
       search) — drop that one hostname from the allow-list rather than inherit the startup
       failure.
   - `centminmod/claude-code-devcontainers` (`README.md` fetched, 2026-09-24) — a maintained
     community devcontainer that already combines `uv` (Python) and a JS package manager with
     Claude Code, MCP servers, and a three-layer firewall in one image; useful as a second,
     independently-built data point that the Node+`uv`+MCP combination this repo needs is a
     well-trodden shape, not a one-off. Do not adopt its VS-Code-first framing or its bundled
     Codex/Gemini CLIs — out of scope here — only the "uv + Node + MCP servers in one non-root
     image" structure.
3. **Pitfalls.** `core.symlinks=false` on this checkout means a committed symlink for memory or
   skills breaks the Windows fallback the moment the dev container also exists (R-92's own note,
   confirmed by the environment: this session's own working directory is a Windows path with no
   symlink support assumed) — a copy-with-drift-test installer (the harness's own
   `install-checkpoint.mjs` is cited as the shape to copy) is the safer choice over `ln -s`. A
   `setup-token` session "loads no connectors" (R-92's own note) — confirmed as the trade-off
   Anthropic's subscription-token auth makes versus interactive login; nothing here changes that,
   only flags it as a real, not hypothetical, capability loss inside the container.
4. **Maps onto this stack.** `bb2dash-stack/.devcontainer/{Dockerfile, devcontainer.json,
   init-firewall.sh}` forked from `anthropics/claude-code/.devcontainer/` with: base bumped to
   `node:22-bookworm`; `uv` and `gh` added (both already used by this stack's own scripts);
   firewall allow-list widened per above; **no** `claude-code-config-${devcontainerId}` volume —
   instead `~/.claude/projects/<repo>/memory/` (this project's actual live memory layer per
   `CLAUDE.md`'s own "Current state" section) reaches the container read-only until acceptance,
   read-write after, per R-92's own "verifier's default: copy once at acceptance, read-only
   before." `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, R2/R3's settled choice) lands via
   the `*_FILE` shim from R-89, never baked in. Both MCP servers (`bb2dash` materials, `rag`)
   register inside the container with Linux paths and their own secret-file indirection (R-91,
   P-45).
5. **Size L**, matches the brief. Seams: F-2 (token secret names), F-4 (materials server as plain
   `node` inside), F-3 (Node fastembed cache, `npm run verify:embedder`), F-1 (`just dev`); the
   container becomes a third harness machine and needs its own `HARNESS_MACHINE` identity (see
   question 41).
6. **What this changes.** Confirms decision #3/#5 and the MVP line ("I can open a dev container
   and run a Claude PM session") stand; the harness's own `portable.md:699-700` line about a
   dev-container image being superseded by its VM is about a different machine and correctly
   stays out of `must_respect`, per R-92's own note — my reading agrees, nothing to add there.
   Research-added: bump the forked Dockerfile's base image to `node:22-bookworm` (S) and drop
   `statsig.anthropic.com` from the inherited firewall allow-list (S) — both small, both concrete
   deviations from copying Anthropic's files verbatim that a worker would otherwise not know to
   make.

## 6. R-93 · Stack accepts Phase 14 on a fresh laptop rebuild, then cuts over

1. **Standard practice.** A cutover from a fallback path to a new one is proven with a **parity
   check before the switch**, not after: freeze what "the same" means (a fixed query/count set),
   run both paths, compare, and only then flip the default — "the cleanest retirement plans treat
   shutdown as a controlled production change by freezing the source, proving target parity,
   defining the last rollback window" (industry cutover-runbook guidance, general pattern, checked
   2026-09-24). A dry run of the full script once, before the real sitting, is what surfaces gaps
   "at the worst possible time" if skipped.
2. **Examples.** No external repo is a close enough analogue to this specific nine-step,
   single-operator acceptance script to be worth citing as a pattern to copy; the applicable
   standard-practice point (parity before cutover, a named rollback trigger) is general and
   already reflected in P-40's frozen parity query set and R-93's own DoD.
3. **Pitfalls.** Both `AgenticHarness-NightlyIngest` and `-CheckpointCollect` are `Interactive`
   trigger with `WakeToRun: false` (confirmed against the harness's own registration, already
   known) — so "the 03:00 job ran on wake" (DoD step 6) cannot be tested against the *old* path at
   all; it can only be proven for the *new* container scheduler, which is one more reason R-90's
   `restart: unless-stopped` + "Docker Desktop starts at login" combination (R4 §6) has to be
   proven, not assumed, before this step is walked.
4. **Maps onto this stack.** `docs/planning/sprint-2/82_PHASE14_containers.md` §C-8's acceptance
   steps, rewritten per R-93's own "Still missing" list: step 1 clones `bb2dash`,
   `agentic-harness`, `bb2dash-stack`, and the two vault realms (`vault-projects`,
   `vault-classes`); a doctor line confirms both realms listed, clean and pushed; step 5 only
   runs if question 36 (scheduled-sync reversal) is answered yes.
5. **Size S**, matches the brief — it is a gate, not new engineering. Seams: everything in F-1
   through F-5 and cluster E must exist first; `desktop/src/core/config.ts`'s `syncLauncher` key
   (P-43) is what step 12 flips.
6. **What this changes.** Nothing to the requirement's shape; confirms the brief's own correction
   that the acceptance script, not a separate build task, *is* the phase's definition of done.

## 7. R-94 · Images build locally, no registry; arm64 manifests recorded for later hosts

1. **Standard practice.** `docker buildx build --load` fundamentally cannot produce a local
   multi-platform image: "the Docker image store can't hold a multi-arch manifest... if the build
   definition's outputs are docker/image/registry/oci, `--load` will add a `type=docker` export...
   drop the multi-platform list and use `--load`" for a single arch at a time
   (docs.docker.com/reference/cli/docker/buildx/bake, oneuptime.com's buildx guide, both checked
   2026-09-24) — so "build locally, no registry" and "arm64-ready" are two separate claims, not one
   step. The only way to actually prove an image runs on arm64 without a registry is to build it
   *on* arm64 hardware (or under slow QEMU emulation) and run it there — which is exactly why
   R-94 correctly defers real per-image arm64 builds to when the MacBook exists, and settles for
   checking the **base** images' published manifests today.
2. **Examples.**
   - `docs.docker.com/reference/cli/docker/buildx/bake` (fetched 2026-09-24) — confirms the
     `--load` single-platform limit above; nothing to build from it, only a constraint to design
     around.
   - `docker manifest inspect <image>` / `docker buildx imagetools inspect
     --format '{{json (index .Image "linux/arm64")}}' <image>` (learn.arm.com's Docker
     cross-platform learning path, oneuptime's manifest-inspection guide, both checked
     2026-09-24) — an anonymous, read-only registry query that needs no local pull; this is
     exactly the check R-94's "State today" section already ran against every candidate base
     image (`playwright:v1.63.0-noble`, `node:22-bookworm`, `node:22-slim`,
     `python:3.12-slim`, `ghcr.io/astral-sh/uv:python3.12-bookworm-slim`,
     `pgvector/pgvector:0.8.6-pg17`) and recorded as all-arm64-present — confirmed as the right
     tool for exactly that job.
3. **Pitfalls.** A manifest check on a *base* image proves nothing about native `npm`/`pip`
   bindings compiled into a derived image (R-94's own note, confirmed correct) — the harness Node
   `rag` server's `@anush008/tokenizers` dependency (via `fastembed`) has no published
   `linux-arm64` binding as of this check, while `onnxruntime-node` does; that gap is real and
   already correctly kept out of MVP.
4. **Maps onto this stack.** Every Dockerfile in `bb2dash-stack`, `bb2dash`, and
   `agentic-harness` builds with plain `docker compose build` on amd64 today; a base-image
   manifest table (one row per base, with the digest and platforms list from `docker manifest
   inspect`) is recorded in a new verification note (`82a` per R-93's own numbering) rather than
   repeated per-Dockerfile.
5. **Size S**, matches the brief. Seams: depends on every Dockerfile from F-3, F-4, F-5 and
   cluster E existing first so there is something to record a manifest for.
6. **What this changes.** Nothing about scope; adds the specific `--load` single-platform
   citation as the technical reason "build locally" and "arm64-ready" cannot be conflated into
   one build step, which the brief currently implies without stating outright.

## 8. R-95 · Phase 14 brief matches today and its Contract is frozen before build

1. **Standard practice.** A planning document that will gate real spend (Stack's sittings, nine
   worker-days across three repos) is corrected against ground truth immediately before the
   Contract freezes, not patched piecemeal during build — the same "freeze the source, prove
   parity" framing from R-93 applies one level up: freeze *this document* against what the repos
   actually contain today, then build from the frozen copy.
2. **Examples.** Not applicable — this is a documentation-currency task internal to this planning
   round, not a technical pattern with external analogues.
3. **Pitfalls.** Two live drifts already caught in this pass, both worth carrying into the
   refresh: brief 82 still says "After Phase 13" (13 was skipped 2026-09-22) and "migration
   090/091" for the sync-runner role (090 is now `attention_archive`; the role is 091). Both are
   already named in R-95's own "Still missing" list — confirmed, not new.
4. **Maps onto this stack.** `docs/planning/sprint-2/82_PHASE14_containers.md` gets a refresh
   pass: migration numbers from 091, the vault section (C-4) replaced by a pointer to the
   2026-09-24 realm-move DECISIONS row, Q4/Q5 and `vault_deploy_key` marked superseded, and a
   fresh "State today" pass on every claim this research file and its four sibling researchers
   flagged as stale.
5. **Size M**, matches the brief. Seams: precedes every build item (F-1 through F-7 and cluster
   E); shares migration numbers with cluster E's `db-p14-sync-runner-role` and
   `db-p14-scheduled-sync`.
6. **What this changes.** Nothing to the requirement's shape; this section exists mainly to
   confirm no *new* staleness turned up beyond what R-95 itself already catalogued.

## 9. R-96 · Deferred after acceptance: login toast, launcher removal, MacBook bring-up, VPS notes

1. **Standard practice.** A deliberately-not-now backlog item is recorded with an explicit trigger
   for re-evaluation, not silently dropped — R-96's own framing ("a deferred backlog, not a
   requirement... record it as 'deferred (post-MVP)'... give it no R-number") already matches
   this; nothing to add from outside literature beyond confirming that framing is the accepted
   shape for exactly this kind of item.
2. **Examples.** Not applicable — four unrelated small deferrals bundled under one umbrella
   entry, not a technical pattern.
3. **Pitfalls.** The MacBook bring-up specifically inherits R-94's tokenizers/arm64 gap (§7 above)
   — it cannot be de-deferred until that dependency either ships an arm64 build or the harness
   swaps it out, so its trigger condition is more concrete than "later": it is "F-7 confirms
   `@anush008/tokenizers` linux-arm64, or the harness replaces it."
4. **Maps onto this stack.** No code changes now. When de-deferred: `desktop/src/main/notify.ts`
   (toast plumbing already exists) gains a login-distinct signal over `attention_items`;
   `sync-terminal.ts`, `wt.ts`, `sync-command.ts`, `syncDryRun` are deleted together in one PR,
   after `syncLauncher` (P-43) has already shipped.
5. **Size M**, matches the brief (it bundles four small items, none individually large).
6. **What this changes.** Nothing to scope; sharpens the MacBook bring-up's re-evaluation trigger
   to name R-94/F-7 explicitly rather than leave it open-ended.

## 10. P-38 / P-39 · Spike prep and the Chromium sandbox choice (both tied to R-82)

Both are explicitly in this researcher's scope though their parent (R-82, the Blackboard-login
container) sits in §1.6, outside R-88..R-96 — noted here since both are general container-hardening
calls, not sync-specific ones.

1. **P-38 — VNC stack.** `noVNC` is a browser-based client plus WebSocket proxy, not a server
   itself, and pairs with a real VNC server (commonly TigerVNC or `x11vnc` sharing an existing X
   display); `KasmVNC` bundles its own server and is reported as "easier to setup, better
   documented" at the cost of not being a strict VNC-protocol server the way `x11vnc`+`noVNC` is
   (pistack.xyz comparison and cendio.com/blog/kasm-vnc-alternatives, both checked 2026-09-24;
   neither VNC flavor supports audio, irrelevant here). **Recommendation:** `x11vnc`+`noVNC` over
   an Xvfb display — it is the combination R1's own sketch (already cited in R-82's must-respect)
   was built around, needs no new base image family, and a Duo login needs nothing audio ever
   would. This is an engineering pick a PM session can make directly, not a product call for
   Stack. Size S, for R-82.
2. **P-39 — Chromium sandbox.** Running Chromium non-root in a container without
   `--cap-add=SYS_ADMIN` needs either a seccomp profile that allows the sandbox's own syscalls, or
   `--no-sandbox` on the launch args, which is "the common [fix], only acceptable when you fully
   trust every page you load" (dev.to/pdfik "Chromium in Docker without --no-sandbox," Playwright's
   own `docker.playwright.dev` guidance, checked 2026-09-24). R4 already recommends non-root +
   `--no-sandbox` over running the whole container as root, on the grounds that this container is
   single-user and never internet-facing beyond Blackboard's own login page — confirmed correct
   for this specific case; the alternative (a maintained seccomp profile) is more correct in
   general but is extra surface with no payoff here. Add the sandbox flag explicitly to the
   `/security-review` scope list at `82:246-247`, since the brief currently omits it entirely (the
   gap P-39 exists to close). Size S, for R-82.

## 11. P-44 · Refresh the R5 OS-bound inventory (tied to R-86)

Also outside R-88..R-96 but explicitly in scope. R5 (`82_RESEARCH_phase14_R5_bb2dash_inventory.md`)
is dated 2026-09-16; this pass's own reading of the current requirements doc (R-86, read in full
while gathering context for this file) already lists what changed since: `pull_files.mjs` moved to
Node `fs` (2026-09-22), `inbox-apply`'s `SKILL.md:31` OneDrive path is now wrong on Windows too
(the vault moved 2026-09-23/24), and `sync-command.ts:59`'s `powershell.exe` literal is still
there. No new offender turned up beyond R-86's own "Still missing" list in this pass; the refresh
is bookkeeping (update R5's line numbers and the Move-Item resolution note), not new research.
Size S, for R-86.

## 12. P-49 · One source for the four repo skills; retire stale synced copies (tied to R-92)

1. **Standard practice.** A skill (or any small unit of reusable instructions) that must be
   identical everywhere it runs is kept in exactly one place in version control and copied out
   with an integrity check, not hand-maintained in parallel locations — the same rule this
   research file already applies to secrets (R-89) and memory (R-92 §4) applies to skills.
2. **Examples.**
   - This repo's own `~/.claude/skills/synced/*/manifest.json` (read directly, 2026-09-24) — live
     proof of the failure: `bb-course-map` and `bb-course-pull` both show `"source": "plugin"`,
     `"updatedAt": "2026-09-03T20:34:2[89]"`, three weeks stale against this worktree's own
     `skills/bb-course-map/` and `skills/bb-course-pull/`. A session loading the synced copy
     silently runs pre-7a6148e instructions with no version signal anywhere in the UI.
   - `agentic-harness/hooks/install-checkpoint.mjs` (already read in full for other sections) —
     the pattern to port: one `SOURCE_DIR` is the frozen source of truth, an `install*({repo,
     dryRun})` function copies a named payload out and verifies every file by SHA-256 — "drift" is
     a failed hash, not a guess — and never commits on its own. Its own header states why a symlink
     can't substitute ("cloud sessions load skills from the repository they run in, not from
     `~/.claude`"), the same reason `core.symlinks=false` rules one out here (R-92's own note).
   - `claude.ai`'s plugin sync (the `synced/` manifest above) is not a pattern to borrow but a
     mechanism to route around: it is a one-way pull with no push path back to this repo's
     `skills/`, so a fix committed here never reaches that copy on its own.
3. **Pitfalls.** A project can present one skill under two names at once — this session's own
   available-skills list carries both this worktree's `bb-course-map`/`bb-course-pull` and a
   separately-namespaced `anthropic-skills:bb-course-map`/`bb-course-pull` plugin pair — so "one
   source" has to mean the plugin/sync registration is retired for these two names, not merely
   that the repo copy is kept current, or a session can still pick the stale one.
4. **Maps onto this stack.** Port `install-checkpoint.mjs`'s shape (or the `install-skill` skill
   already in this session's own available list, if it can target a local `skills/` source rather
   than only a remote clone) into a small `hooks/install-skill.mjs --skill <name> --repo <path>`
   run once per skill against this worktree and `C:/Users/estac/projects/bb2dash`, verified by
   hash; then remove the two stale entries from `~/.claude/skills/synced/` so the bare name
   resolves to one copy. Proven headless on Windows first, then inside the dev container.
5. **Size S**, matches the brief. Seams: R-92 (the dev container needs the same one-source skills
   before its own smoke test can trust `/bb2dash-pm` runs the current `bb-sync`/`inbox-apply`);
   no migration, no prod change.
6. **What this changes.** Sharpens only: "one source" needs a stated retirement step for the
   plugin-synced copies, not just a repo refresh, since the two can coexist under the same bare
   name with no version signal to a session choosing between them.

## 13. P-51 · Harness portable.md documents the container scheduler beside the host ones (tied to R-90)

1. **Standard practice.** A cross-machine setup doc listing "how to run the recurring job on each
   kind of host" is kept exhaustive at the point a new host kind is added, not patched later from
   memory — the same discipline R-95 already applies to the Phase 14 brief itself.
2. **Examples.** `agentic-harness/docs/portable.md:225-237` (read directly, 2026-09-24) — step 7
   today: "Register the nightly job: `powershell -File scripts/register-nightly-ingest.ps1` ... On
   Linux/macOS: cron or launchd running `scripts/nightly-ingest.sh`," same shape for the
   `backup-store` task. Confirms P-51's framing exactly: only Task Scheduler, cron and launchd are
   named today; step 6's own "On Linux/macOS: ..." phrasing is the sentence shape to reuse for the
   container case rather than inventing new prose style.
3. **Pitfalls.** If question 40's default lands ("yes, on home-pc only"), the fallback host
   schedulers stay real and current (the work VM uses this same step 7 path), so the doc must add
   the container option as a third entry, not replace the existing two.
4. **Maps onto this stack.** A one-line addition to `portable.md` step 7 once the scheduler exists
   and question 40 is answered: "On home-pc (containers): the jobs container's own scheduler runs
   `nightly-ingest.sh` and the collector; Task Scheduler stays the fallback and the work-VM path."
   Documentation only, in the same PR that lands R-90 on home-pc.
5. **Size S**, matches the brief. Seams: depends on R-90 landing first; ties to question 40.
6. **What this changes.** Nothing to scope; confirms the gap is real and names the exact insertion
   point and sentence shape to reuse.

## Research-added requirements

| For | Add | Why | Size |
|---|---|---|---|
| R-88 | Pin `[windows] set shell := ["powershell.exe", "-NoLogo", "-Command"]` on the umbrella justfile's Windows-run recipes, rather than rely on Git-for-Windows' `sh` being on `PATH` from wherever Stack types `just`. | `just`'s own README (fetched) confirms it defaults to `sh` on Windows and simply fails if that binary isn't reachable from the invoking shell — an easy, silent first-run failure otherwise. | S |
| R-90 | State explicitly, in the brief and any worker-facing task text, that `node-cron`'s `missedExecutionTolerance` is a seconds-to-minutes drift tolerance, not the catch-up feature this requirement needs, so a worker does not substitute the wrong mechanism. | Found only by checking `node-cron`'s current docs directly; the option is new since R4 and easy to mistake for "the" catch-up feature because the name reads like one. | S |
| R-91 | Add a grep-for-`console.log` check (stdout must carry only JSON-RPC frames) to the materials-server DoD, alongside the existing non-root and `.dockerignore` bullets. | A single stray `console.log` silently breaks every MCP tool call over stdio; independently rediscovered in at least four unrelated open-source MCP servers, so it is a near-certain miss if not checked for explicitly. | S |
| R-92 | Bump the forked Anthropic devcontainer's base image from `node:20` to `node:22-bookworm`, and drop `statsig.anthropic.com` from its inherited firewall allow-list. | Fetched directly from `anthropics/claude-code` today: still `node:20`, still lists a hostname with no public DNS record that the script treats as a fatal resolve failure (anthropics/claude-code#55623). Both are silent-failure risks if the reference file is copied verbatim. | S |
| R-90 / R-94 | Record, in the jobs-image verification note, that a `docker manifest inspect` pass on a *base* image says nothing about native npm/pip bindings (the `@anush008/tokenizers` gap) — keep the two checks (base-manifest today, real-image-on-arm64 later) explicitly separate in the note's own headings. | `docker buildx build --load` cannot produce a local multi-platform image at all (confirmed from Docker's own bake docs), so "images build locally" and "arm64-ready" are two different claims that are easy to blur into one line item. | S |

## Questions for Stack

None of §6 questions 39–42's defaults change from this research. All four technical grounds
they rest on are confirmed as stated (dev-container CLI genuinely needs no VS Code; the
container-scheduler-replaces-Task-Scheduler default is the only one with real catch-up semantics;
`just` and the repo name/one-PR-per-repo choice are sound) — the sharpenings above (Node version,
`[windows]` shell, the `node-cron` distinction) attach to the *how*, not the *yes/no*, so they are
carried as research-added items rather than restated as new questions.

## Sources

Fetched or returned verbatim by a search this session (2026-09-24), in the order first used:

- https://docs.docker.com/reference/compose-file/include/ — `include:`/`project_directory` syntax
- https://github.com/docker/compose/issues/11577 — closed 2024-03-05 (fixed by compose-go#593);
  path-resolution bug, not a live risk
- https://github.com/compose-spec/compose-go/pull/593 — the fix, merged 2024-03-01
- https://github.com/docker/compose/issues/13945 — current (2026), maintainer-confirmed limitation:
  include-level `env_file:` is interpolation-only, never reaches a build arg or service env
- https://github.com/docker/compose/issues/13719 — open, requests optional include-level
  `env_file:`; not a blocker since the umbrella always ships a root `.env`
- https://code.visualstudio.com/docs/devcontainers/devcontainer-cli — `devcontainer up`/`exec`
- https://github.com/devcontainers/cli — reference implementation, no-editor-required framing
- https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer/init-firewall.sh
- https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer/devcontainer.json
- https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer/Dockerfile
- https://github.com/anthropics/claude-code/issues/55623 — `statsig.anthropic.com` DNS failure
- https://github.com/anthropics/claude-code/issues/32113 — devcontainer feature overwrite note
- https://github.com/centminmod/claude-code-devcontainers (`README.md`) — community devcontainer
- https://docs.docker.com/compose/how-tos/use-secrets/ — file-based `secrets:` mechanics
- https://trufflesecurity.com/blog/how-secrets-leak-out-of-docker-images — layer-history leaks
- https://www.npmjs.com/package/node-cron — `missedExecutionTolerance`, checked against current docs
- https://github.com/netresearch/ofelia — active-fork status, PR #833 merged 2026-09-10
- https://github.com/mcuadros/ofelia — original project, no catch-up feature
- https://raw.githubusercontent.com/casey/just/master/README.md — Windows shell defaults, `[windows]` attribute
- https://www.pistack.xyz/posts/2026-04-27-novnc-vs-tigervnc-vs-x11vnc-self-hosted-vnc-guide/
- https://www.cendio.com/blog/kasm-vnc-alternatives/
- https://dev.to/pdfik/chromium-in-docker-without-no-sandbox-what-actually-breaks-437l
- https://playwright.dev/docs/docker
- https://github.com/HaithamOumerzoug/keycloak-mcp/issues/6 — stdout-corrupts-stdio pitfall
- https://github.com/dirmacs/daedra/issues/4 — same pitfall, independent project
- https://github.com/yamadashy/repomix/issues/1866 — same pitfall, independent project
- https://github.com/espressif/esp-idf/issues/19087 — same pitfall, independent project
- https://www.docker.com/blog/simplify-ai-development-with-the-model-context-protocol-and-docker/
- https://docs.docker.com/reference/cli/docker/buildx/bake/ — `--load` single-platform limit
- https://learn.arm.com/learning-paths/cross-platform/docker/check-images/ — anonymous manifest checks
- blog.eduonix.com WSL2 dev-container performance article (npm ci 65–100 s on `/mnt/c` vs 12–20 s
  on native WSL2 ext4; `git status` 25–50× faster) — fetched, quoted directly
- https://github.com/docker/for-win/issues/5131 and #10347 — WSL2 clock skew after sleep (from R4,
  re-confirmed live)
- Internal, read directly this session (not web sources, cited for the exact file/line):
  `C:/Users/estac/agentic-harness/mcp-server/src/env-file.ts`,
  `C:/Users/estac/agentic-harness/hooks/doctor.mjs`,
  `C:/Users/estac/agentic-harness/scripts/nightly-ingest.sh`,
  `C:/Users/estac/agentic-harness/db/docker-compose.yml`,
  `C:/Users/estac/agentic-harness/docs/portable.md:190-237`,
  `C:/Users/estac/agentic-harness/hooks/install-checkpoint.mjs`,
  `C:/Users/estac/.claude/skills/synced/*/manifest.json`,
  `C:/Users/estac/projects/bb2dash-wt-sprint2-plan/skills/` (directory listing)
