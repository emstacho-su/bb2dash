# Phase 14 — Containers: every local process moves into Docker

Date: 2026-09-16 (brief + research synthesis). Product manager: Stack. Requirement: **R-28**
(`60_REQUIREMENTS_v2.md` §3.5). **After Phase 13.** Three repos are touched, so this phase is the
one exception to "one PR per phase": **one PR per repo**, opened together, merged on Stack's word.
Migration range **090–099** (one expected: the sync runner's database role).

Research behind every choice: `research/82_RESEARCH_phase14_R1…R6_*.md` (six Sonnet researchers,
2026-09-16). Where this brief and a research file disagree, this brief is the synthesis and wins.

## Why

* Everything that runs on Stack's laptop today is tied to it: two Windows Task Scheduler jobs,
  PowerShell scripts, a vault under OneDrive, a Blackboard login held in one browser profile,
  global installs, `C:/` paths.
* R-28: when development is done, the local pieces move into containers so the whole thing can
  be moved — first rebuilt cleanly on this laptop, later perhaps an always-on ARM MacBook at
  home, later perhaps a VPS.
* Supabase and Vercel already follow him to any machine. They stay managed.

## Stack's decisions (2026-09-16, this session's question rounds)

| # | Decision |
|---|---|
| 1 | Goal = portability: clone + `.env` + `docker compose up` on a new machine. First host: this laptop (Docker Desktop, WSL2). MacBook / VPS later, so the stack must stay migratable |
| 2 | Supabase cloud and Vercel stay managed. No local Supabase |
| 3 | In scope: bb2dash sync + scripts, the materials MCP server, agentic-harness jobs, and Claude Code itself (unattended runs **and** a dev container for PM / worker sessions) |
| 4 | Blackboard login: a browser in a container, Stack logs in through a web view — *if research confirms* (it did, R1) |
| 5 | Claude auth in containers: research decides → subscription token (R2, R3) |
| 6 | Sync trigger: the app's button queues a request, a watcher runs it; plus a scheduled sync. SU's "stay signed in" never works for him — a session survives only on a machine that stays on |
| 7 | The Obsidian vault leaves OneDrive for a private git repo |
| 8 | Secrets: one gitignored `.env` / secrets folder + Docker secrets at runtime. Never in an image |
| 9 | A scheduler in a container replaces the two Task Scheduler jobs |
| 10 | Each repo owns its Dockerfile + compose piece; one umbrella includes both and holds the dev container and the `.env` template |
| 11 | Acceptance = fresh rebuild on this laptop (script below). The MacBook is not a gate |
| 12 | After acceptance the Electron Sync button only queues; the terminal launch retires |
| 13 | `course context/` becomes a disposable volume (Storage is the source of truth) |
| 14 | PowerShell scripts are rewritten cross-platform |
| 15 | Image build / registry: research decides → build locally, no registry, no CI (R4) |
| 16 | Guardrails: **$0**; today's non-Docker Windows path keeps working until acceptance; service key never in an image; "build it so that it is migratable later" |

## What the research changed (read this before the Contract)

1. **The sync does not need an LLM (R2 §4).** Steps 1–5 of `skills/bb-sync` (login check,
   claim, crawl, register, wait, pull files, close) are `if` statements on known values. They
   become a plain Node + Playwright program, `sync-runner`. The plain-language report is built
   from `summary.changes` by a template. Result: a sync costs nothing, cannot drift from the
   ordering rules, and the Claude-auth question stops being load-bearing. The `/bb-sync` skill
   stays in the repo as the Windows fallback and the exception path.
2. **Browser and driver live in one container (R1).** Chromium ≥ M113 binds its debugging port
   to `127.0.0.1` whatever it is told, so a second container cannot attach. `sync-runner` owns
   the browser itself (`launchPersistentContext`, headful on Xvfb); noVNC shows Stack that same
   display for the Duo login. No CDP crosses a container boundary, and no Claude process ever
   sits next to the SU session cookie (R2 §5's concern, met by construction).
3. **No off-the-shelf cron container (R4 §2).** Ofelia and friends need the Docker socket, and
   none of them catch up a run missed while the laptop slept. The scheduler is a small
   long-running process with an internal timer, a persisted `last_run_at`, America/New_York
   schedules and run-on-start-if-missed — Task Scheduler's behaviour, kept.
4. **The scheduled sync is a queued row, not a second code path.** pg_cron (already the
   project's clock) inserts a `sync` request each morning when none is open; the watcher treats
   it like a button press. One path, visible in Activity.
5. **The dev container's code lives inside WSL's filesystem (R3 §2),** not on `C:\`: a mounted
   NTFS folder is 5–10× slower and breaks hot reload. It is a second clone, so the Windows
   checkout keeps working untouched — guardrail 16 for free.
6. **Build locally (R4 §5).** GitHub's free tier gives 500 MB shared between Actions artefacts
   and GHCR; one Playwright image exceeds it. Base images are multi-arch already, so a native
   `docker compose build` on the MacBook is the migration path. A VPS flips this decision.
7. **The harness needs almost no code change (R6).** One variable, `HARNESS_VAULT`, points every
   writer at the vault. The vault is 2.6 MB, 318 notes, no attachments.

## MVP (in Stack's words — confirmed by Stack 2026-09-16: "matches")

On a clean copy of three repos I fill in one secrets folder and run one command. A page on my
laptop shows a browser where I log in to Blackboard with Duo. After that the app's Sync button
just works — no terminal — and a sync also runs by itself each morning while that login is
alive; when it dies the Inbox tells me to log in again. The nightly vault ingest and the
checkpoint collection run on their own, and catch up if the laptop was asleep. My vault is a
private git repo. I can open a dev container and run a Claude PM session with both MCP servers,
my skills and my memory in it. The Windows Task Scheduler jobs are gone. Nothing costs money.

## Contract — proposed; the phase PM session freezes it after Stack's answers (§Open questions)

### C-1 Repos and layout

```
~/dev/                              (inside WSL Ubuntu; also works at any path on macOS/Linux)
  bb2dash/                          compose.yaml, docker/sync/Dockerfile, docker/mcp/Dockerfile
  agentic-harness/                  compose.yaml, docker/jobs/Dockerfile
  bb2dash-stack/        (new repo)  compose.yaml  → include: ../bb2dash, ../agentic-harness
                                    .devcontainer/ (Dockerfile, devcontainer.json, init-firewall.sh)
                                    secrets.example/   justfile (or package.json scripts)   doctor/
  vault/                (new private repo)  the Obsidian vault
```

* `include:` entries set `project_directory` explicitly (compose bug #11577: `env_file` under
  `include` resolves against the CWD).
* Every published port binds `127.0.0.1:` explicitly. Docker Desktop on Windows otherwise
  publishes to the LAN.
* Log rotation on every service (`json-file`, `max-size: 10m`, `max-file: 3`);
  `restart: unless-stopped`; every service runs as a non-root user and has a healthcheck.

### C-2 Services

| service | repo | image base | runs | ports / volumes |
|---|---|---|---|---|
| `sync` | bb2dash | `mcr.microsoft.com/playwright` (multi-arch) + Xvfb + noVNC + Python, poppler | `sync-runner`: watcher loop + browser owner + file pull + `extract_text.py` | `127.0.0.1:6080` noVNC (password from a secret); volumes `bb-profile` (treat as a credential), `course-files` (disposable) |
| `harness-jobs` | agentic-harness | `ghcr.io/astral-sh/uv` multi-stage + Node | the scheduler process; runs nightly ingest 03:00, checkpoint collect 12:00 and 18:00 (America/New_York), catch-up on start | volumes `fastembed-cache` (~130 MB), `vault` (a clone; pull before ingest), `job-state` |
| `dev` (profile `dev`) | bb2dash-stack | Anthropic's reference devcontainer → `node:22-bookworm` + `uv` + Playwright + `gh` + `git-delta` | interactive Claude Code sessions; both stdio MCP servers run here as plain `node` | parent folder `~/dev` mounted (sibling worktrees visible); fixed-name volume `claude-home` for `~/.claude` |
| `bb2dash-mcp` (image only) | bb2dash | `node:22-slim` | for a **host** Claude Code: `docker run -i --rm` with a secret file | stdio, no ports |

Not containerized: Supabase edge functions, Vercel's web build, the Electron shell (a Windows
desktop app; only its watcher pattern moves), `google-consent.mjs` (one-time, runs in `dev`).

### C-3 `sync-runner` (the heart of the phase)

* Plain Node + Playwright, TypeScript, in `bb2dash/sync/`. Reuses `desktop/src/core/`'s
  `sync-command` id validation and `rest.ts` where they fit (Phase 12's C-13 split exists for
  this); no `electron` import.
* Loop, every 20–30 s: read `agent_requests` where `kind = 'sync' and state = 'queued'`. For a
  row: (1) session check — the skill's exact rule, `location.href` against the known login
  hosts; (2) atomic claim (`update … where state = 'queued' returning`); (3) inject
  `ingest/bb_crawler.js` with `addScriptTag`, `bb.runAll`, register `run_id` **after** the crawl;
  (4) wait on the status view, 30 s × 10 min; (4b) pull submission files — Playwright download,
  sha256, Storage upload, row update; 401/403 stop, 409 leave and report; (5) close `done` /
  `failed`; (6) write the templated report to the request row.
* **Login expired:** the request closes `failed` with reason `login_required`, one open
  `attention_items` row says "Blackboard login needed — open http://localhost:6080", and the
  runner keeps the login page on the display. No retry loop.
* **Dead-letter sweep (R2 §3):** a `claimed` row older than 20 min raises an attention item; it
  is never auto-retried (a slow crawl may still be alive).
* **Keep-alive:** one Blackboard tab stays open and is touched on an interval. Whether that
  extends the session is measured, not assumed (task 2).
* **Database access, least privilege (migration 090):** a role `sync_runner` that can execute
  three `security definer` RPCs — `sync_claim(id)`, `sync_register_run(id, run_id)`,
  `sync_close(id, state, report)` — read `v_sync_status` and the step-4b work list, and update
  those `bb_files` rows. Its connection string is a Docker secret. The service key is **not**
  given to this container. Storage uploads keep using the publishable key, as the skill does.
* **Scheduled sync (migration 091):** pg_cron job `bb2dash-scheduled-sync` inserts a `sync`
  request at the hour in `app_settings.sync_schedule_hour` (New York) when no open one exists.
* File moves use Node `fs`, never PowerShell `Move-Item` (R5 risk 1).

### C-4 Harness jobs and the vault

* `nightly-ingest.ps1` and the two `register-*.ps1` become one cross-platform job script run by
  the scheduler: same steps, same order, and only the final ingest's exit code counts (R6).
* Scheduler state (`last_run_at` per job) lives on the `job-state` volume. On start, a job whose
  window was missed runs at once. Each run logs start, end, exit code.
* `DATABASE_URL` reaches the ingest as an env var set by a `*_FILE` entrypoint shim from
  `/run/secrets/` (psycopg wants a DSN string). The `certs/` CA bundle is copied into the image.
* **Vault move:** copy (not move) the OneDrive vault to `~/dev/vault`; run `gitleaks` over it;
  one history-free first commit; push to a private repo; re-point Obsidian and `HARNESS_VAULT`;
  Obsidian Git plugin for Stack's own edits. Every automated writer makes a uniquely named file,
  so each writer does `git pull --rebase --autostash` then `push` — no sync container. The
  OneDrive copy stays read-only until a two-week burn-in ends; rollback is one env var.
* A `gitleaks` pre-commit hook in the vault repo. R-27's frozen frontmatter names do not change.
* Attachments stay out of git as policy.

### C-5 Dev container

* Start from `anthropics/claude-code/.devcontainer` (non-root user, firewall init script,
  config volume). Widen the allowlist: Supabase, Vercel, GitHub, npm, PyPI, astral.sh.
* Works without VS Code: `just dev` = `docker compose --profile dev run --rm dev`; the
  `devcontainer` CLI is optional. The Claude desktop app does not attach to containers.
* Logins: Claude by `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` from a secret (Anthropic's
  policy explicitly covers a user signing in to the unmodified binary with their own
  subscription — R2 §1 quotes it); `gh` by device code; Supabase and Vercel MCP by
  `SUPABASE_ACCESS_TOKEN` / `VERCEL_TOKEN` (their browser-loopback logins fail in containers).
* `claude-in-chrome` cannot work in a container; Playwright MCP replaces it.
* **Memory migration:** project memory is keyed by a slug of the cwd, so `/workspaces/…` starts
  empty. One scripted copy from `C--Users-estac-projects-bb2dash` to the new slug, checked by
  opening a session and seeing `MEMORY.md` load.
* `~/.claude` content (CLAUDE.md, `rules/`, `skills/`, `hooks/`, `settings.json`) is seeded into
  `claude-home` once; hooks are checked for Windows paths (`session-capture.mjs` reads
  `HARNESS_VAULT`, so it follows the vault move).
* `.gitattributes` with `* text=auto eol=lf` in bb2dash (the harness already has one) so the WSL
  clone and the Windows checkout agree.
* `bb-sync` and the other repo skills are copied or linked into `.claude/skills/` — Claude Code
  discovers only that path (R2 flag); smoke-tested headless.
* Electron: `desktop/` builds and unit-tests in the container; the GUI and its e2e stay on Windows.

### C-6 Secrets

```
bb2dash-stack/secrets/          (gitignored; secrets.example/ lists the names, never values)
  sync_runner_db_url   supabase_publishable_key   novnc_password
  harness_database_url   bb2dash_mcp_service_key   claude_oauth_token
  gh_token   supabase_access_token   vercel_token   vault_deploy_key
```

* Compose `secrets:` → `/run/secrets/*`; an entrypoint shim exports `X` from `X_FILE` for
  consumers that need an env var. Nothing secret in `environment:`, build args or layers.
* DoD check: `docker history --no-trunc` and a `trufflehog` / `gitleaks` scan of every built image.
* The service key exists in exactly one place: the materials MCP server's secret, as today.

### C-7 Command surface and `doctor`

`just up · down · logs <svc> · dev · sync-now · ingest-now · login (opens noVNC) · doctor`.
`doctor` checks: Docker running and start-on-login on; WSL clock skew against an HTTP `Date`
header under 30 s (WSL2 drifts after sleep — it breaks TLS and schedules; fix is
`wsl --shutdown`); every secret file present and non-empty; every port bound to 127.0.0.1;
Supabase reachable; Blackboard session state; `last_run_at` of each job; vault clean and pushed;
`.wslconfig` memory set.

### C-8 Fallback and cut-over (guardrail 16)

* Until Stack's acceptance: Task Scheduler jobs stay registered, `claude "/bb-sync <id>"` stays
  the documented path, the Electron button keeps launching the terminal.
* Cut-over happens inside the acceptance sitting, in this order: containers proven → Task
  Scheduler jobs unregistered → Electron `syncLauncher` set to `queue-only` (a config value; the
  terminal code path is deleted in the following desktop PR, not before).
* Both paths are never live at once for the same job: the watcher's atomic claim already
  protects syncs; the nightly ingest is idempotent.

## Definition of done

- [ ] **Stack's acceptance script (fresh rebuild, this laptop):** (1) in a clean WSL folder,
      clone the three repos and the vault, copy `secrets.example/` to `secrets/` and fill it;
      (2) `just up` — every service healthy, `just doctor` all green; (3) `just login` — log in
      to Blackboard with Duo in the web view; (4) press Sync in the app: no terminal opens, the
      sync lands, Activity shows the report, new submission files are in Storage; (5) the next
      morning a scheduled sync has run by itself; (6) `just ingest-now` then a `rag` search
      finds a note written that day; after a night asleep, the 03:00 job ran on wake;
      (7) `just dev` → `claude` → `/bb2dash-pm` loads, both MCP servers answer, memory is
      there, a worktree is created and a test suite runs; (8) Task Scheduler shows no
      `AgenticHarness-*` job; (9) stop Docker: `claude "/bb-sync <id>"` on Windows still works.
- [ ] Spike gate passed first: Duo login through noVNC works and the profile survives a container
      restart — otherwise stop and re-plan on the fallback (R1 design c, `storageState` hand-off).
- [ ] `sync-runner`: unit tests for every branch of the skill's text (login hosts, claim lost,
      401/403/409, timeout, dead-letter); an integration test against a recorded crawl fixture;
      ≥ 80 % coverage; a replayed crawl inserts 0 rows.
- [ ] Parity proof: one live sync by the container and one by the skill on the same day produce
      the same typed-table counts (verification note `82a`).
- [ ] Migration 090 (+091): dry-run in `begin … rollback`, applied under the file's name,
      byte-identical; `sync_runner` can do nothing but its three RPCs and reads (negative tests).
- [ ] Scheduler: unit tests for DST (both changes), missed-run catch-up, no double run across a
      restart; harness tests not below their current count.
- [ ] Vault: gitleaks clean before first push; hook and collector write + push from Windows
      **and** from the dev container without conflict; R-27 frontmatter unchanged; ingest reads
      the clone.
- [ ] No secret in any image (history + scan output in the verification note); no port on
      `0.0.0.0`; every container non-root.
- [ ] Images build natively on amd64; every base image has an arm64 manifest
      (`docker manifest inspect` output recorded). The MacBook run itself is post-MVP.
- [ ] Grep-clean: no `C:/`, `.ps1`, `powershell`, `OneDrive` in anything a container executes.
- [ ] READMEs: `bb2dash-stack/README.md` is the only document a new machine needs.
- [ ] SOP gates on every PR: `/code-review main high`, `/security-review` (noVNC exposure, the
      profile volume, the new role, secrets handling, firewall allowlist); STATUS + DECISIONS +
      ORCHESTRATOR + root `CLAUDE.md` ("There is no Docker in this project" is no longer true).

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 0 | **Stack, any time before the build:** measure the Blackboard session (tab open, probe at +1/2/3/4 h) and Duo "remember me" (reopen the same profile at +1/3/7/14 days) — R1 §3 | numbers written into this brief | — | Stack |
| 1 | Freeze the Contract; put §Open questions to Stack | answers recorded | — | PM session |
| 2 | **Spike (gate):** Playwright image + Xvfb + noVNC, persistent profile; Stack logs in with Duo; restart; still logged in; keep-alive measured overnight | screenshot + session-age log | "I logged in to Blackboard inside a container" | W-27 |
| 3 | Migration 090 `sync_runner` role + three RPCs; 091 scheduled-sync job | SQL tests incl. negative grants, rolled back on prod | — | W-27 |
| 4 | `sync-runner` steps 1–3 and 5 (session check, claim, crawl, register, wait, close) | unit + fixture tests; one live sync | "I pressed Sync and no terminal opened" | W-27 |
| 5 | Step 4b file pull in Node `fs` + `extract_text.py` in the image (pin Python deps — none are pinned today) | sha256 match on a pulled file; text unit appears | "my submission file came back" | W-27 |
| 6 | Login-expired path, dead-letter sweep, templated report | tests; attention item appears once | "the Inbox told me to log in again" | W-27 |
| 7 | `sync` Dockerfile + bb2dash `compose.yaml` + `bb2dash-mcp` image | healthcheck green; port on 127.0.0.1 only | — | W-27 |
| 8 | Harness: cross-platform job script replacing the three `.ps1`; scheduler with catch-up | DST + missed-run + restart tests | "the 3 AM job ran when I opened the lid" | W-28 |
| 9 | Harness `jobs` image (uv multi-stage, fastembed cache volume, CA bundle, `*_FILE` shim) | `just ingest-now` exits 0; second run uses the cache | — | W-28 |
| 10 | Vault move: copy, gitleaks, first commit, private repo, `HARNESS_VAULT`, Obsidian Git, pre-commit hook, pull-rebase-push in every writer | two writers push the same minute, no conflict | "my vault is a git repo and Obsidian still works" | W-28 + Stack (Obsidian, repo creation) |
| 11 | `bb2dash-stack` repo: umbrella compose, `secrets.example/`, `justfile`, `doctor` | `just doctor` green; fails correctly on a missing secret and a skewed clock | "one command brings it all up" | W-29 |
| 12 | Dev container: reference base + toolchain + firewall allowlist + `claude-home` seed + memory migration + MCP registrations + `.gitattributes` | scripted smoke: `claude -p` answers, both MCP servers list tools, memory loads, vitest runs | "I ran a PM session inside the container" | W-29 |
| 13 | `validate-grading` Node twin (V-1's launcher) | same prompt text as the `.ps1` for IST.323 | — | W-29 |
| 14 | Integrate; parity proof; image secret scan; arm64 manifest check | `82a` written | — | PM session |
| 15 | Gates + docs on all three PRs | SOP list | — | PM session |
| 16 | **Stack's acceptance script + cut-over** (C-8 order) | nine steps ticked | the nine steps | Stack |
| 17 | Post-MVP, in order: Electron toast "Blackboard login needed" (new poller source) and delete the terminal launcher · bring-up on the ARM MacBook · optional one-turn `claude -p` summary of a sync · VPS notes (registry, secrets manager, noVNC behind a tunnel) | — | — | later |

## Workers (proposed)

* **W-27 sync** (`feat/containers-14-sync`, bb2dash): tasks 2–7. Owns `sync/`, `docker/`,
  migrations 090–091.
* **W-28 harness** (`feat/containers`, agentic-harness + the vault repo): tasks 8–10.
* **W-29 stack + dev** (`bb2dash-stack`, new repo; `.gitattributes` and task 13 in bb2dash on
  `feat/containers-14-dev`): tasks 11–13.
* Seams frozen before branches are cut: secret names (C-6), volume names (C-2), the `just`
  verbs (C-7), the three RPC signatures (C-3).

## Open questions for Stack (the phase PM session asks these first)

1. **Sync without an LLM** (research change 1): agreed? You lose nothing you see today except
   that the report is templated rather than written; the skill stays as fallback.
2. Scheduled sync hour (default 07:00 New York), and weekdays only or daily?
3. A failed scheduled sync because the login died: Inbox only, or also a desktop toast (post-MVP
   task 17)?
4. New repo names: `bb2dash-stack` and `vault`, both private under `emstacho-su`?
5. Does the vault hold anything that must never reach GitHub, even private (the gitleaks pass
   finds keys, not personal notes)?
6. `just` as the command runner (one small binary), or npm scripts only?
7. Your task-0 measurements — how long did the session and the Duo cookie last?

## Out of scope

Local or self-hosted Supabase; self-hosting the web app; a registry or CI; a secrets manager;
Kubernetes; the MacBook and VPS bring-ups (post-MVP); containerizing the Electron GUI; any
renderer change; mobile Obsidian sync.

## Carried out of this phase (found by the research, not Phase 14 work)

* **`/checkpoint` writes notes into a repo's git history with no secret redaction** — the
  SessionEnd hook and the collector both redact, `skills/checkpoint/build-note.mjs` does not
  (R6; verified by the PM: no `redact` reference under `skills/checkpoint/`). A harness fix,
  worth doing before Phase 14.
* `skills/bb-sync` sits at the repo root, which Claude Code does not document as a discovery
  path; it works today through the user-level install. Task 12 settles it for the container.
* `extract_text.py` has no pinned dependencies anywhere in the repo (task 5 pins them).

## Session prompt (copy-paste, after Phase 13 merges)

> `/bb2dash-pm` Start Phase 14 (R-28 containers). Read `docs/planning/82_PHASE14_containers.md`
> and the six `research/82_RESEARCH_phase14_*` files. Re-check R5's Electron seam against the
> merged `desktop/src/main/` code. Put the brief's open questions to me and wait. Then freeze
> the Contract, create the `bb2dash-stack` and `vault` repos with me, run task 2 (the noVNC login
> spike) as a gate before anything else, and only if it passes cut worktrees in bb2dash and
> agentic-harness, spawn W-27 / W-28 / W-29, integrate, run the gates on all three PRs, and stop
> at "ready when you say so". Keep the Windows path working until my acceptance sitting.
