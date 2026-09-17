# R4 — Docker Compose Architecture (Phase 14)

Scope: umbrella layout, scheduler container, secrets, multi-arch images, registry/CI at $0,
Docker Desktop on Windows 11/WSL2 gotchas, and one-person observability. Repos inspected
(read-only): `bb2dash` (Node ingest crawler `ingest/bb_crawler.js`, `.env.example` with
`SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SERVICE_KEY`/`BB_USER_ID`/`BB_BASE`/
`BB_ICAL_FEED_URL`), `agentic-harness` (`mcp-server/` = Node + `@anush008/tokenizers` +
`onnxruntime-node` fastembed cache at `.fastembed-cache/fast-bge-small-en-v1.5/`;
`ingest/` = Python 3.12 + `uv`, `pyproject.toml` depends on `fastembed>=0.7.0`,
`psycopg[binary]`, `python-frontmatter`, `PyYAML`).

---

## 1. Umbrella layout

**Options compared**

| Approach | Path resolution | Cross-repo dev loop | Verdict |
|---|---|---|---|
| Compose `include:` of per-repo files | Each included file resolves its own relative paths against *its own* file location, not the includer's directory ([docs.docker.com/reference/compose-file/include](https://docs.docker.com/reference/compose-file/include/)) | Good — edit a repo, `docker compose up` from umbrella picks it up if repo is a sibling checkout | **Recommended** |
| `-f a.yml -f b.yml` merge | All paths resolve relative to the *first* file / CWD, so merging files that live in different repos gets fragile fast | Works but path bugs are easy | Fallback only |
| Git submodules | Umbrella repo owns submodule pointers into bb2dash/agentic-harness | Adds submodule-update friction to a one-person workflow; not what the PM/worker git flow already does | Reject |
| Sibling checkouts (no submodule) + umbrella repo/folder referencing them by relative path | Same as `include:` above | Matches how the repos already sit on disk (`C:/Users/estac/projects/bb2dash`, `C:/Users/estac/agentic-harness`) | **Recommended (this is what `include:` runs against)** |

**Known caveat (verified):** `env_file:` on an `include:` entry is documented to resolve
against `project_directory` (default: the included file's own directory), but there's an
open Compose bug where in practice it's resolved against the **current working directory**
instead ([docker/compose#11577](https://github.com/docker/compose/issues/11577)). Practical
fix: always set `project_directory` explicitly on each `include:` entry, and always run
`docker compose` from the umbrella folder itself (not a subfolder), or pin `env_file` with
an absolute-ish path built from a shell variable.

Project name: the compose-spec's top-level `name:` sets the project name if you don't pass
`-p`; docs do not document special project-name behavior for `include` — treat the umbrella
file's own `name:` as authoritative and don't rely on included files setting it.

**Recommended folder shape** (new repo, e.g. `bb2dash-stack`, sibling to the other two):

```
bb2dash-stack/                     # new umbrella repo
├── compose.yaml                   # top-level: include: + scheduler + dev container
├── .env.example                   # union of every consumer's required vars, no values
├── .env                           # gitignored, real values, single source Stack edits
├── secrets/                       # gitignored; file-based Compose secrets live here
│   ├── supabase_service_key
│   ├── database_url
│   └── claude_credentials.json
├── scheduler/
│   ├── Dockerfile
│   └── jobs/                      # nightly-ingest.sh, checkpoint-collect.sh
├── browser/                       # persistent-profile Blackboard browser container (R1's topic)
│   └── Dockerfile
├── devcontainer/
│   ├── Dockerfile                 # PM/worker Claude Code dev container
│   └── compose.dev.yaml           # profile-gated, see §5 of context doc's Q6
└── justfile                       # up / down / logs / sync-now / ingest-now / doctor

bb2dash/                           # existing repo, sibling
├── compose.yaml                   # bb2dash's own services: mcp server, ingest crawler
├── mcp-server/Dockerfile
└── ingest/Dockerfile

agentic-harness/                   # existing repo, sibling
├── compose.yaml                   # mcp-server (rag), ingest (Python/uv)
├── mcp-server/Dockerfile
└── ingest/Dockerfile
```

**Top-level `compose.yaml` in the umbrella repo:**

```yaml
name: bb2dash-stack

include:
  - path: ../bb2dash/compose.yaml
    project_directory: ../bb2dash
    env_file: .env                  # umbrella .env's values win; see precedence below
  - path: ../agentic-harness/compose.yaml
    project_directory: ../agentic-harness
    env_file: .env

services:
  scheduler:
    build: ./scheduler
    env_file: .env
    secrets: [database_url]
    volumes:
      - ./scheduler/jobs:/jobs:ro
    restart: unless-stopped

  browser:
    build: ./browser
    profiles: ["bb-login"]          # only starts when explicitly requested
    volumes:
      - browser-profile:/home/pwuser/.bb-profile

volumes:
  browser-profile:

secrets:
  database_url:
    file: ./secrets/database_url
  supabase_service_key:
    file: ./secrets/supabase_service_key
```

Variable precedence when `include:`-ing: the **includer's** (umbrella) environment/`.env`
wins over anything defined in the included file's own `env_file`, so the umbrella `.env` is
the one Stack edits; per-repo `.env.example` files stay as documentation/defaults only.

---

## 2. Scheduler container

**Candidates**

| Option | Docker socket needed? | TZ / DST handling | Missed-run catch-up | Multi-arch | Notes |
|---|---|---|---|---|---|
| **Ofelia** (`mcuadros/ofelia`) | Only for `job-run` (spins new containers); `job-exec`/`job-local` don't need it | `TZ=` per-schedule and container-wide; IANA zone, DST-aware | None built in | mcuadros image ships amd64+arm64 | Base repo is slow-moving in 2025–26; **`netresearch/ofelia`** is the actively maintained fork (Renovate-driven dependency/security updates weekly) — verified via GitHub search, not primary docs, so treat as current-best-effort, re-check before relying on it long-term |
| **supercronic** | No | Reads TZ from `/etc/localtime` or `TZ` env var; crontab-compatible, DST-aware via that zone | No catch-up; if the container wasn't running at trigger time, the run is simply skipped | Static Go binary, buildable for arm64, no official multi-arch image published — you build it into your own image | Built for the "cron for containers" 12-factor case; minimal by design |
| **Cron sidecar** (plain `cron`/`crond` in its own container) | No | Same TZ handling as any Linux cron | No catch-up (vanilla cron, not anacron) | Whatever base image you pick | Reinvents supercronic with more moving parts (needs syslog/foreground shims) |
| **`docker compose run` from a tiny scheduler image + Docker socket** | **Yes**, always | Whatever the scheduler's own clock/TZ is | None | N/A | Socket-mounted container = passwordless root on the host ([netdata.cloud](https://www.netdata.cloud/guides/docker/docker-socket-security/), [owlzops.com](https://owlzops.com/guides/docker-sock-mount-risk)) — avoid per the project's own no-socket-if-avoidable preference |
| **Long-running service + internal timer** (Node `node-cron`/`croniter` loop, or Python `apscheduler`) | No | You set `TZ=America/New_York` on the container; the process computes next-fire time in that zone, so DST is handled by the OS tzdata the same way any cron would | **You write it** — trivial to add: persist `last_run_at` (a file or a `scheduler_runs` table) and on container start, if `now - last_run_at > interval`, run immediately before falling back to the schedule. This is the direct equivalent of Windows Task Scheduler's "Run task as soon as possible after a scheduled start is missed." | Trivial — same interpreted-language image as everything else, no separate binary | Most code to own, but it's the only option that gets you real catch-up semantics without bolting on anacron |

**Recommendation: long-running service with an internal timer**, not Ofelia/supercronic/cron.
Reasoning tied to the project's own stated priorities:
- No Docker socket exposure (rules out `docker compose run` + socket).
- Catch-up-after-sleep is an explicit requirement, and none of Ofelia/supercronic/cron have
  it natively — `anacron` is the standard Linux answer to "catch up after being off"
  ([Oracle Linux docs](https://docs.oracle.com/en/operating-systems/oracle-linux/8/cron/configuring_anacron_jobs.html)),
  but bolting anacron onto a container is more moving parts than writing the ~15-line
  timestamp check yourself in the same script that already runs the job.
- The two jobs in scope (nightly ingest, checkpoint collect) are already Node/Python
  scripts — a scheduler loop in the same language avoids adding Go binaries or cron syntax
  to the stack.

**Concrete pattern (Node, since agentic-harness's ingest is Python but the trigger logic
is language-agnostic — pick whichever matches the job being scheduled):**

```yaml
# scheduler/compose fragment
services:
  scheduler:
    build: ./scheduler
    environment:
      TZ: America/New_York
    volumes:
      - scheduler-state:/state       # last-run timestamps live here, survives rebuilds
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]   # checks the loop's last heartbeat
      interval: 60s
      timeout: 5s
      retries: 3
    restart: unless-stopped
volumes:
  scheduler-state:
```

```js
// scheduler/index.js (sketch)
import cron from "node-cron";
import { readLastRun, writeLastRun } from "./state.js";

const JOBS = [
  { name: "nightly-ingest", schedule: "0 3 * * *", intervalMs: 24 * 60 * 60 * 1000, run: nightlyIngest },
  { name: "checkpoint-collect", schedule: "0 12 * * *", intervalMs: 24 * 60 * 60 * 1000, run: checkpointCollect },
];

for (const job of JOBS) {
  // catch-up: if we missed the window (laptop asleep at 3AM), run once at startup
  const last = await readLastRun(job.name);
  if (!last || Date.now() - last > job.intervalMs) {
    await runJob(job); // logs start/end/exit code, see below
  }
  cron.schedule(job.schedule, () => runJob(job), { timezone: "America/New_York" });
}

async function runJob(job) {
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ event: "job_start", job: job.name, startedAt }));
  try {
    const code = await job.run();               // spawn the actual script, capture exit code
    console.log(JSON.stringify({ event: "job_end", job: job.name, exitCode: code }));
  } catch (err) {
    console.error(JSON.stringify({ event: "job_error", job: job.name, error: String(err) }));
  } finally {
    await writeLastRun(job.name, Date.now());     // persisted regardless of success/failure
  }
}
```

Structured JSON-line logs make exit codes and timing greppable via `docker compose logs
scheduler | jq`. DST: `node-cron`'s `timezone` option and `TZ=America/New_York` both defer
to the container's tzdata (must be installed — `apk add tzdata` on Alpine bases), so 3 AM
stays 3 AM local across the spring/fall transitions without extra code.

---

## 3. Secrets

**Compose `secrets:` (file-based) vs `env_file`**

- `secrets:` (file source) mounts the secret at `/run/secrets/<name>` inside the container,
  read-only, and is **not** part of `docker inspect`'s `Config.Env` — it never shows up as
  an environment variable at all unless the app explicitly reads the file
  ([docs.docker.com/compose/how-tos/use-secrets](https://docs.docker.com/compose/how-tos/use-secrets/)).
- `env_file`/`environment:` values **do** land in `docker inspect <container>`'s `Config.Env`
  in plaintext, readable by anyone who can run `docker` commands against that daemon (which
  is already root-equivalent access — see §2's socket note — so this is a modest, not
  catastrophic, additional exposure on a single-user laptop, but matters more once a VPS or
  shared machine is in the picture).
- Compose also supports `secrets: { name: { environment: VAR } }` — pulls a host env var
  into the secret file mechanism, useful for CI runners that only have env vars to give you.

**This project's consumers, file-path vs env-var:**

| Consumer | Can read a file path? | Needs an env var? |
|---|---|---|
| Node ingest/crawler scripts (`bb_crawler.js`, mcp-server) | Yes, trivially (`fs.readFileSync(process.env.X_FILE)`) | Only if written to expect one already |
| Python `uv` ingest (`psycopg` via `DATABASE_URL`) | `psycopg.connect()` takes a DSN string, not a file; needs the value **assembled into an env var** at process-start, not read as a file directly | **Yes** — `DATABASE_URL` must be an env var by the time the Python process starts |
| Claude Code (subscription login vs API key) | Subscription login stores an OAuth credential file (`~/.claude/.credentials.json` or similar) that must be mounted, not typed as env var per-run; API key mode wants `ANTHROPIC_API_KEY` as an env var | Depends on auth mode chosen (out of this doc's scope — R-whoever owns auth mode) |
| MCP servers (Node, stdio) | Yes, but most existing MCP server code (incl. this project's) reads `process.env.*` already | Env var is the path of least code change |

**Entrypoint pattern for `*_FILE` env vars** (the same convention Docker's own `postgres`/
`mysql` images use, confirmed in the docs above):

```sh
#!/bin/sh
# entrypoint.sh — resolves any FOO_FILE into FOO before exec'ing the real command
set -eu

file_env() {
  var="$1"
  file_var="${var}_FILE"
  eval "val=\${$var:-}"
  eval "file_val=\${$file_var:-}"
  if [ -n "${file_val:-}" ] && [ -z "${val:-}" ]; then
    export "$var"="$(cat "$file_val")"
  fi
}

file_env DATABASE_URL
file_env SUPABASE_SERVICE_KEY

exec "$@"
```

```yaml
services:
  ingest:
    build: ./ingest
    entrypoint: ["/entrypoint.sh"]
    command: ["uv", "run", "ingest"]
    secrets: [database_url, supabase_service_key]
    environment:
      DATABASE_URL_FILE: /run/secrets/database_url
      SUPABASE_SERVICE_KEY_FILE: /run/secrets/supabase_service_key
```

This gets the Python `uv` process a real `DATABASE_URL` env var at runtime while the actual
secret value only ever touches disk as a file under `/run/secrets` (tmpfs, not in `docker
inspect`, not baked into any image layer).

**What leaks and how to check:**
- `docker history --no-trunc <image>` shows every layer's command; an `ENV SECRET=...` or
  an `ARG` baked without `--mount=type=secret` shows up here permanently, even across
  multi-stage builds where the final stage looks clean — intermediate stage layers are still
  inspectable via `docker history` unless you `--squash` (deprecated) or use registries that
  garbage-collect untagged layers.
- `dive <image>` visualizes each layer's added/removed/modified files side-by-side, good for
  spotting a `.env` file that got `COPY`'d in and then `rm`'d in a later layer — the file
  content is still recoverable from the earlier layer.
- `trufflehog docker --image=<image>` unpacks every layer (including ones for deleted files,
  addressable by their original SHA256 digest) and regex/entropy-scans for credentials —
  the most thorough single check to run before ever pushing an image anywhere, even to a
  private registry ([trufflesecurity.com](https://trufflesecurity.com/blog/how-secrets-leak-out-of-docker-images)).
- Rule of thumb for this project: never `ENV`/`ARG` a secret in any Dockerfile; only ever
  inject via Compose `secrets:`/`environment:` at `run`/`up` time. Run `dive` once per image
  during setup as a sanity check, and `trufflehog docker` before any image is ever pushed to
  GHCR (§5).

---

## 4. Images

**Node 22 + Playwright client**

- Base: `mcr.microsoft.com/playwright:v1.<version-matching-package.json>-noble` — Microsoft
  publishes this multi-arch (amd64 + arm64; tags auto-resolve to the right arch on pull,
  confirmed via Docker Hub image search and Playwright's release pipeline docs).
- Non-root caveat: Playwright's browser sandboxes want specific kernel capabilities: the
  official image is commonly run as root in CI examples; running fully non-root often needs
  `--cap-add=SYS_ADMIN` or `--security-opt seccomp=<profile>` *or* launching Chromium with
  `--no-sandbox` (weaker isolation). For this project (single-user laptop, container not
  internet-facing), prefer non-root **without** `SYS_ADMIN` plus `--no-sandbox` on the
  launch args over running the whole container as root — flag this as a tradeoff to revisit
  if the browser container is ever exposed beyond localhost.
- `.dockerignore`: `node_modules`, `.git`, `.env*`, `course context/`, `*.md`, `npm-debug.log`.

**Python + uv + fastembed**

- Multi-stage per Astral's own example
  ([astral-sh/uv-docker-example](https://github.com/astral-sh/uv-docker-example)):

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project --no-dev

COPY . /app
RUN --mount=type=cache,target=/root/.cache/uv uv sync --locked --no-dev

FROM python:3.12-slim-bookworm
RUN groupadd --system --gid 999 ingest && \
    useradd --system --gid 999 --uid 999 --create-home ingest
COPY --from=builder --chown=ingest:ingest /app /app
ENV PATH="/app/.venv/bin:$PATH" FASTEMBED_CACHE_PATH=/data/fastembed-cache
USER ingest
WORKDIR /app
VOLUME /data/fastembed-cache
ENTRYPOINT ["/entrypoint.sh"]
```

- **ONNX model cache as a volume**: `fastembed` (Python) downloads its ONNX model to a
  cache directory on first use — mount a named volume there (`fastembed-cache:/data/
  fastembed-cache` in Compose) so a container rebuild doesn't re-download the model, and so
  the same cache can be reused by the agentic-harness Node mcp-server if you standardize the
  path (its own `.fastembed-cache/` already shows the model cached this way on the host
  today).
- **arm64 wheel availability — verified**: `onnxruntime` (CPU) has published
  `manylinux_2_17_aarch64`/`manylinux2014_aarch64` wheels on PyPI for a long time (confirmed
  via PyPI file listings), and `fastembed` itself is pure Python, so `pip`/`uv` installing
  on a Linux arm64 target resolves prebuilt wheels with **no compilation** — same as amd64.
- **Node side (mcp-server, `@anush008/tokenizers` + `onnxruntime-node`)**: less certain.
  `@anush008/tokenizers` ships per-platform optional-dependency packages including
  `@anush008/tokenizers-linux-arm64-gnu` and `tokenizers-darwin-arm64` (confirmed via its
  GitHub repo and npm listings), and `onnxruntime-node`'s tarball does contain a
  `bin/napi-v3/linux/arm64/` path (confirmed via a real error message referencing that exact
  path in an open GitHub issue), but Microsoft's own docs don't explicitly advertise
  Linux/arm64 support the way they do for darwin/arm64 and Windows arm64. **Flag: verify
  by actually building and running the mcp-server image on the arm64 Mac when it comes
  online — don't assume it "just works" the way the Python side clearly does.**
- Non-root: same `groupadd`/`useradd` pattern as above, or use the official `node` image's
  pre-created `node` user (UID 1000) and `COPY --chown=node:node`.
- `.dockerignore`: `.venv`, `__pycache__`, `.git`, `.env*`, `*.pyc`, `tests/` (if not needed
  at runtime).

**Build cache**: order Dockerfile layers so `uv.lock`/`package.json` are copied and
installed *before* the rest of the source, and use `--mount=type=cache` (BuildKit) for
`uv`'s and `npm`'s package caches so repeat local builds on the same laptop are fast without
needing a remote cache backend.

**Multi-arch via buildx — is it needed day one?**
No. QEMU-emulated builds for a non-native architecture are documented at **5–20x slower**
than native, with one concrete comparison showing native ~30s vs QEMU-emulated ~10–15
minutes for the same build
([cefboud.com](https://cefboud.com/posts/qemu-virtualzation-docker-multi-build/),
[docker.com blog on cross-compilation](https://www.docker.com/blog/faster-multi-platform-builds-dockerfile-cross-compilation-guide/)).
Given the stated rollout order (Windows laptop now, ARM Mac "later maybe," VPS "later
maybe"), the right call is: **build natively on each machine as it's added**, via plain
`docker compose build` — no `buildx --platform linux/amd64,linux/arm64` multi-arch manifest
needed until there's a reason to *distribute* one image to machines that can't build it
themselves (see §5's registry discussion). Playwright's browser download alone
(hundreds of MB per architecture) makes emulated cross-builds of that image particularly
painful — another reason to defer.

---

## 5. Registry/CI decision at $0

**Verified free-tier numbers (GitHub Free plan, private repos), from
[docs.github.com](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions):**
- **2,000 Actions minutes/month** on standard Linux runners (unused minutes do not roll
  over); Linux 2-core standard runner billed overage at $0.006/min if exceeded.
- **500 MB of storage**, and this 500 MB is **shared between Actions artifact storage and
  GitHub Packages** (which is what backs GHCR) — this contradicts some community claims that
  GHCR storage is "currently free" for private images; the official docs tie it to the same
  500 MB bucket, with $0.25/GB-month overage.
- **arm64 standard GitHub-hosted runners became available for private repositories in
  January 2026** (`ubuntu-24.04-arm`/`ubuntu-22.04-arm` labels), priced ~$0.005/min — slightly
  *cheaper* than x64's $0.006/min, and drawing from the same included-minutes pool.

**Reality check for this stack**: a single Playwright image alone is commonly 1+ GB;
Node + Python images with model caches add more. **500 MB shared storage will not hold this
stack's images** without immediately incurring (small, but nonzero) overage charges — a real
tension with the project's $0 hard rule.

**Recommendation for MVP: local `docker compose build` only, no GitHub Actions, no GHCR.**
- Matches the $0 rule exactly (zero risk of storage/minute overage).
- Matches the rollout order — one laptop today, so there's no second machine that needs a
  pre-built image handed to it yet.
- When the ARM Mac or a VPS actually shows up, the simplest $0-preserving move is still
  **not** a registry: `git clone` the umbrella + component repos onto the new machine and
  run `docker compose build` there too (native build, no QEMU, no registry, no CI). This
  works for a VPS just as well as a laptop as long as the VPS has enough RAM/disk to build
  Playwright's browser downloads.

**What flips the decision later:**
1. A machine that **can't** build the images itself (too little RAM/disk/network for
   Playwright's browser download, or a constrained free-tier VPS) — then pre-building
   elsewhere and pulling from GHCR earns its keep, accepting the small storage overage cost
   or trimming image size (e.g., a slimmer browser image without Playwright's full browser
   matrix) to stay under 500 MB.
2. Wanting a build/test gate before anything reaches a shared/production host (CI-as-a-review-step),
   independent of registry use.
3. Wanting reproducible, pinned image digests shared across more than one machine instead of
   "whatever today's Dockerfile produces" — GHCR + tags/digests solves drift that "rebuild
   everywhere" doesn't.

---

## 6. Docker Desktop on Windows 11 Home/WSL2 — operational gotchas

- **Licence**: Docker Desktop is free under the Docker Personal subscription for
  individuals, students, non-commercial open source, and small businesses (<250 employees
  AND <$10M revenue) — Stack's personal-project use qualifies cleanly
  ([docker.com/pricing](https://www.docker.com/pricing/)).
- **Memory limits**: `.wslconfig` at `C:\Users\estac\.wslconfig`, `[wsl2]` section:
  ```ini
  [wsl2]
  memory=8GB
  processors=4
  swap=2GB
  ```
  WSL2's built-in default (absent this file) is roughly half of host RAM or 8 GB, whichever
  is smaller, but exact defaults have changed across WSL releases — **set it explicitly**
  rather than relying on the default. Changes require `wsl --shutdown` + Docker Desktop
  restart to take effect.
- **Start on login**: Docker Desktop → Settings → General → "Start Docker Desktop when you
  sign in to your computer." Needed for `restart: unless-stopped` scheduler/services to come
  back after a full reboot without Stack manually opening Docker Desktop first.
- **`restart: unless-stopped` across sleep vs reboot**: Windows *sleep* pauses the whole
  WSL2 VM — containers resume as-is on wake, no restart involved. A full *reboot* tears the
  VM down; on next boot, Docker Desktop (if set to start on login) relaunches the daemon and
  `unless-stopped` containers restart automatically. A container that was manually
  `docker stop`-ped stays stopped across a reboot (the policy respects explicit intent) —
  worth remembering if Stack ever manually stops the scheduler to debug something.
- **Clock drift after sleep**: well-documented WSL2 VM clock skew on resume from
  sleep/suspend, ranging from seconds up to (in hibernate cases) multiple days
  ([docker/for-win#5131](https://github.com/docker/for-win/issues/5131),
  [docker/for-win#10347](https://github.com/docker/for-win/issues/10347)). This directly
  threatens both the scheduler's 3 AM/noon triggers and any TLS cert-expiry checks. The
  scheduler's own internal-timer design (§2) is more resilient here than crontab-based
  options because you can add an explicit wake-time resync check; as a blunt backstop,
  `wsl --shutdown` forces a clean resync (loses running containers' state, so use sparingly)
  or run `hwclock -s`/an NTP check inside WSL after resume.
- **Bind-mount performance**: files under Windows paths (`C:\...`) mounted into Linux
  containers cross a translation layer and are measurably slower than native Linux
  filesystem access; for this project (mostly small scripts, no local Postgres — Supabase is
  remote) this is a minor concern, but keep repo checkouts inside the WSL2 filesystem
  (`\\wsl$\...` or a native WSL home dir) if any I/O-heavy step (npm installs, model
  loading) turns out to be a bottleneck.
- **Localhost port binding**: by default, Compose `ports: ["8080:80"]` binds all host
  interfaces, so anything on the same LAN can reach it too. Bind explicitly:
  `ports: ["127.0.0.1:8080:80"]` for the MCP servers and dev container so they never leave
  the laptop.
- **macOS differences (for the "later maybe ARM Mac")**: OrbStack uses Apple's
  Hypervisor.framework directly instead of a full VM, giving near-native filesystem
  performance and ~2.5s cold starts (vs Docker Desktop's heavier VM boot); Colima is a free,
  CLI-only, Lima-based VM runtime with a similar ~500 MB idle footprint to OrbStack but a
  slower ~10–15s startup. Both avoid WSL2-style clock-drift-after-sleep as a known recurring
  complaint, though neither is bulletproof — worth a `doctor` check (§7) regardless of host.
- **Linux VPS differences (the eventual migration target)**: no Desktop GUI, no VM
  translation layer at all — `dockerd` runs directly on the kernel, ports bind exactly as
  specified with no proxy quirks, and process supervision is `systemctl enable docker` plus
  each service's own `restart:` policy. This is the "reference" environment; **avoid relying
  on any Docker-Desktop-only convenience** (its port-forwarding proxy, vpnkit networking
  quirks, or GUI-only settings) so that what works on the laptop keeps working unchanged on
  a VPS — this is exactly why the project's portability goal should drive you toward
  Compose-native mechanisms (`ports:`, `secrets:`, `healthcheck:`) over anything
  Desktop-specific.

---

## 7. Observability for one person

**Log rotation** (apply to every long-running service via a shared anchor):

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
    compress: "true"

services:
  scheduler:
    logging: *default-logging
  browser:
    logging: *default-logging
```

**Command surface**: recommend **`just`** over `make`/npm scripts — it's a single static
binary (no interpreter dependency), has a native Windows build, and behaves identically
under PowerShell or Git Bash, which fits the project's own note that PowerShell scripts are
being rewritten cross-platform anyway.

```just
# justfile
up:
    docker compose up -d

down:
    docker compose down

logs *args:
    docker compose logs -f {{args}}

sync-now:
    docker compose exec scheduler node run-job.js nightly-ingest --force

ingest-now:
    docker compose exec scheduler node run-job.js checkpoint-collect --force

doctor:
    node scripts/doctor.js
```

**`doctor` checklist** (what `scripts/doctor.js`/`.ps1`-equivalent should verify):
- [ ] `docker version` / `docker compose version` succeed; Docker context is the expected one
- [ ] WSL2 distro running (`wsl -l -v` shows `Running`, Windows-only check)
- [ ] Host disk space above a threshold (image builds + model cache + logs all consume it)
- [ ] `.env` file exists at the umbrella root and every required var name from
      `.env.example` is present (check *names only*, never print values)
- [ ] Supabase reachable (`curl -sf https://<project>.supabase.co/rest/v1/` returns, or a
      401/200 rather than a connection error)
- [ ] `docker compose ps --format json` shows every expected service `running`/`healthy`
      (uses the `healthcheck:` blocks from §2/§4)
- [ ] Scheduler's last-successful-run timestamp (from its persisted state, §2) is recent
      enough for both jobs — surfaces a silently-broken scheduler immediately
- [ ] Clock skew check: compare host time to `docker compose exec scheduler date` output;
      flag if drift exceeds ~60s (catches the WSL2 sleep-drift issue from §6 before it
      breaks a cron trigger or a TLS handshake)
- [ ] No port conflicts on the bound `127.0.0.1` ports
- [ ] fastembed model cache volume is non-empty (catches an accidental fresh-download loop)

---

## Sources

- https://docs.docker.com/reference/compose-file/include/
- https://github.com/docker/compose/issues/11577
- https://docs.docker.com/compose/how-tos/use-secrets/
- https://docs.docker.com/reference/compose-file/secrets/
- https://docs.docker.com/reference/compose-file/services/
- https://docs.docker.com/compose/how-tos/file-watch.md
- https://github.com/mcuadros/ofelia
- https://github.com/netresearch/ofelia
- https://github.com/aptible/supercronic
- https://docs.oracle.com/en/operating-systems/oracle-linux/8/cron/configuring_anacron_jobs.html
- https://www.netdata.cloud/guides/docker/docker-socket-security/
- https://owlzops.com/guides/docker-sock-mount-risk
- https://trufflesecurity.com/blog/how-secrets-leak-out-of-docker-images
- https://trufflesecurity.com/blog/scan-every-tag-and-architecture-of-a-docker-image-for-secrets
- https://github.com/astral-sh/uv-docker-example
- https://docs.astral.sh/uv/guides/integration/docker/
- https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
- https://github.com/Anush008/tokenizers
- https://github.com/microsoft/onnxruntime/issues/15226
- https://github.com/microsoft/onnxruntime/issues/8176
- https://pypi.org (onnxruntime file listings, manylinux aarch64 wheels)
- https://cefboud.com/posts/qemu-virtualzation-docker-multi-build/
- https://www.docker.com/blog/faster-multi-platform-builds-dockerfile-cross-compilation-guide/
- https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions
- https://github.blog/changelog/2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/
- https://docs.github.com/en/billing/reference/actions-runner-pricing
- https://www.docker.com/pricing/
- https://github.com/docker/for-win/issues/5131
- https://github.com/docker/for-win/issues/10347

## Flagged as not fully verifiable from primary docs
- Exact current default `.wslconfig` memory ceiling when unset (community sources disagree;
  treat as "set it explicitly" rather than relying on a documented default).
- `onnxruntime-node`/`@anush008/tokenizers` Linux/arm64 support: real evidence it ships
  (package paths, optional-dependency names) but no primary-doc confirmation it's supported
  the way darwin/arm64 explicitly is — verify by building/running on the arm64 Mac.
- `netresearch/ofelia`'s maintenance status was assessed from GitHub activity, not a primary
  docs statement of "this is the recommended fork" — re-verify before adopting if scheduler
  choice is ever revisited away from the recommended internal-timer approach.
- GHCR "currently free" claims from community discussions conflict with GitHub's own billing
  docs (which tie Packages storage to the same 500 MB bucket as Actions artifacts); this
  report follows the official docs page over the community claims.
