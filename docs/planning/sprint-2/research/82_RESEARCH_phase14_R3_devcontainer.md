# R3 — Dev container for interactive PM + worker sessions (Phase 14)

Scope: the container Stack works IN — PM sessions, Opus workers on git worktrees, `gh` PRs,
Node/Python/Playwright toolchain. Not the unattended sync/scheduler containers (other
researchers' topics) and not the Blackboard-login browser container, except where they intersect
with this one (auth, browser MCP).

## 0. Inventory: what lives in `~/.claude` and `~/.claude.json` that a container needs

Read directly off `C:/Users/estac/.claude` and `C:/Users/estac/.claude.json` (names only, no
values printed anywhere in this research).

### `~/.claude` — essential to port

| Path | Why the container needs it |
|---|---|
| `CLAUDE.md` | Global instructions (this file's own source) |
| `rules/common/`, `rules/typescript/`, `rules/python/` | The coding-style/testing/security/workflow rules |
| `commands/` | Slash commands |
| `agents/` | Personal subagent defs |
| `settings.json` | `hooks` (SessionEnd, SubagentStop → session-capture.mjs), `permissions`, `model`, `effortLevel`, `enabledPlugins`, `autoMode` |
| `settings.local.json` | Local permission overrides |
| `hooks/` + `hooks/lib/` | `session-capture.mjs` and its library (see §3) |
| `plans/` | Active plan docs (e.g. the harness-reset plan referenced in CLAUDE.md) |
| `plugins/`, `plugin.json`, `marketplace.json` | Installed plugin marketplaces backing the `enabledPlugins` list (vercel, supabase, figma, linear, playwright, context7, etc.) |
| `.credentials.json` | `claudeAiOauth` (subscription session), `mcpOAuth`, `organizationUuid` — see §4 |
| `projects/<slug>/memory/` | Auto-memory per project — **path-keyed, needs migration**, see §3 |

CLAUDE.md also names `skills/` and `skill-vault/` under `~/.claude`; neither exists as a top-level
directory on this machine today (only `.skill-pack-cache/`, `get-shit-done/`, and `plugins/` do).
**Flag: could not verify where "skills" content actually lives now** — likely superseded by the
plugin-delivered skills visible in this session's skill list, or the CLAUDE.md line is stale from
before the harness reset. Worth confirming with Stack before deciding what a container needs here.

### `~/.claude` — host-only / transient / do not port

`.agents/`, `.codex/`, `.cursor/`, `.opencode/` (other tools' configs), `chrome/` (claude-in-chrome
extension pairing — moot in-container, see §4), `daemon*`, `debug/`, `downloads/`, `ecc/`,
`file-history/`, `get-shit-done/` + `gsd-file-manifest.json` (CLAUDE.md says this stack was
replaced), `ide/`, `jobs/`, `mcp-configs/`, `mcp-needs-auth-cache.json`, `metrics/`, `cache/`,
`backups/`, `paste-cache/`, `security_warnings_state_*.json`, `session-env/`, `sessions/`,
`shell-snapshots/`, `history.jsonl` (nice-to-have, not essential), `context-mode/`, `contexts/`.
All regenerate on first run or are Windows-daemon-specific.

### `~/.claude.json` — top-level keys relevant to a container

Confirmed by parsing the file's top-level keys only (~100 keys total; most are UI/cache state that
regenerates and is omitted below):

- **`mcpServers`** — two entries, `rag` and `bb2dash`, each `{type, command, args, env}`.
  - `rag`: `command` = a Windows node.exe path, `args` = a Windows path into
    `agentic-harness/mcp-server/dist/index.js`, `env` keys = `DATABASE_URL`, `DATABASE_CA_CERT`,
    `FASTEMBED_CACHE_DIR`.
  - `bb2dash`: same shape, `args` into `bb2dash/mcp-server/dist/index.js`, `env` keys =
    `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`. **This is the Supabase service-role key CLAUDE.md
    warns about — never printed here, and it currently lives in this JSON file, not the repo.**
    Both entries' `command`/`args` are Windows paths and must be rewritten to Linux paths
    (`node`, `/workspaces/.../mcp-server/dist/index.js`) for the container to spawn them at all.
- **`projects`** — a map keyed by absolute path (one entry per project/worktree ever opened,
  including several stale worktree paths from other projects). Path-keyed the same way memory is;
  a container path creates a new entry, it does not reuse an old one.
- **`oauthAccount`** — the Claude subscription identity tied to `.credentials.json`.
- Everything else (`cachedGrowthBookFeatures`, `tipsHistory`, `announcementImpressions`,
  `passesUpsellSeenCount`, `machineID`, …) is telemetry/UI state a fresh container regenerates for
  free.

## 1. Anthropic's reference devcontainer

Source: `anthropics/claude-code` `.devcontainer/` (fetched directly,
[Dockerfile](https://github.com/anthropics/claude-code/blob/main/.devcontainer/Dockerfile),
[devcontainer.json](https://github.com/anthropics/claude-code/blob/main/.devcontainer/devcontainer.json),
[init-firewall.sh](https://github.com/anthropics/claude-code/blob/main/.devcontainer/init-firewall.sh))
and [code.claude.com/docs/en/devcontainer](https://code.claude.com/docs/en/devcontainer).

**Contents:**
- **Dockerfile**: `FROM node:20`, installs `git gh iptables ipset iproute2 dnsutils aggregate jq
  zsh fzf sudo` etc., creates a non-root `node` user, persists bash history to a
  `/commandhistory` volume, installs `git-delta`, sets zsh + powerline10k, installs
  `@anthropic-ai/claude-code` globally via npm, copies `init-firewall.sh` and grants `node`
  passwordless `sudo` for *only that one script*.
- **devcontainer.json**: builds the Dockerfile with `TZ`/`CLAUDE_CODE_VERSION` build args,
  `runArgs: ["--cap-add=NET_ADMIN","--cap-add=NET_RAW"]` (required for the firewall), two named
  volumes (`claude-code-bashhistory-${devcontainerId}`, `claude-code-config-${devcontainerId}` →
  `/home/node/.claude`), `containerEnv.CLAUDE_CONFIG_DIR=/home/node/.claude`, binds the workspace
  folder to `/workspace`, and runs `postStartCommand: sudo /usr/local/bin/init-firewall.sh`.
- **init-firewall.sh**: default-DROP iptables policy; allows DNS, SSH, loopback, the Docker host's
  /24, all of GitHub's published IP ranges (`api.github.com/meta`), and a short DNS-resolved
  allowlist (`registry.npmjs.org`, `api.anthropic.com`, `sentry.io`, `statsig.com`, VS Code's
  marketplace/update/blob domains). Self-verifies by confirming `example.com` is unreachable and
  `api.github.com` is reachable, then exits nonzero on either check failing.

The docs explicitly call this a **worked example, not a maintained base image** — "copy the
`.devcontainer/` directory into your repository and adjust the Dockerfile for your toolchain."
They also document the minimal path (a `ghcr.io/anthropics/devcontainer-features/claude-code:1.0`
feature added to any base image) for teams that don't want the firewall/volumes/zsh machinery.

**Keep for bb2dash:** the non-root `node` user + `--dangerously-skip-permissions`-is-legal-because-non-root
property (relevant for unattended workers later), the two named-volume pattern for config +
bash history, `CLAUDE_CONFIG_DIR`, git-delta, and the firewall skeleton (cheap insurance for a
project that already treats "no secrets in images" and isolation as hard requirements).

**Change for bb2dash:**
1. Base image: `node:20` → `node:22-bookworm` (Node 20 is at/near EOL by late 2026; 22 is current
   LTS and still satisfies `mcp-server/package.json`'s `"engines": {"node": ">=20.11"}`). Stay on
   Debian (`-bookworm`), not Alpine — Playwright's official guidance is Ubuntu/Debian-only
   (musl/Alpine unsupported), and `sharp`/Next.js native binaries are friendlier on glibc.
2. Add Python + `uv` (project standard per CLAUDE.md): `apt-get install python3 python3-venv` +
   the `astral.sh/uv/install.sh` installer, matching how `ingest/` and `scripts/validate-grading`-adjacent
   Python is meant to run.
3. Add Playwright OS deps (`npx playwright install --with-deps chromium`) — bb2dash's `web/` and
   the Electron worktree's `desktop/` both carry Playwright test suites.
4. Widen the firewall allowlist (see §4) for Supabase, Vercel, PyPI/astral.sh, and the harness's
   own Postgres endpoint — the reference list is scoped to Anthropic's own npm/telemetry needs and
   would silently break `supabase`/`vercel`/`uv` the moment DROP-by-default kicks in.
5. `WORKDIR`/`workspaceFolder`: reference uses `/workspace` (singular); match the phrasing already
   used in this task's own framing — `/workspaces/bb2dash` — since that's also VS Code's own
   convention for `workspaceFolder` when a repo is opened as a dev container.
6. Volume naming: drop the `${devcontainerId}` suffix on the config volume. That variable isolates
   config *per opened folder*, but Stack's setup wants ONE shared `~/.claude` (rules, skills,
   plugins, global `CLAUDE.md`) across every devcontainer he opens — bb2dash, its worktrees, and
   `agentic-harness` — exactly like the single real `~/.claude` does today on Windows. A fixed
   volume name (`claude-code-config`) mounted at `/home/node/.claude` in every one of this
   project's devcontainer definitions reproduces that. Per-project memory still separates
   correctly underneath it, because each repo's absolute path (hence its `projects/<slug>/`
   folder) differs.

## 2. Where the source lives

**Bind-mount from NTFS (`C:/Users/estac/projects/bb2dash` straight in) vs a WSL2-native clone vs
a named volume:**

- Docker Desktop's own WSL2 best-practices guidance: store code being bind-mounted into Linux
  containers *in the Linux filesystem*, not on the Windows-mounted drive — file operations on
  `/mnt/c` (or Docker Desktop's cross-OS bind mount, which uses the same translation layer) run
  5–10x slower than native ext4 for exactly the metadata-heavy patterns `node_modules`,
  `next build`, and `git status` produce. Real-world numbers found in research: `npm ci` 65–100s
  on `/mnt/c` vs 12–20s on native WSL2 ext4; Next.js dev-server cold start reported as high as
  44s → 1.6s after moving off the Windows-mounted path.
  [Docker Docs: WSL2 best practices](https://docs.docker.com/desktop/features/wsl/best-practices/)
- **inotify** (the mechanism Next.js/Turbopack's dev-server file-watcher and HMR depend on) only
  fires for files that live in the Linux filesystem. Files bind-mounted in from NTFS/`/mnt/c` are
  watched via polling emulation at best — this is a functional gap, not just a speed one, for
  `web/`'s `next dev`.
- A **named volume** (Docker-managed, not bind-mounted) gets full native performance but is opaque
  to the host — Stack can't `ls`/edit the repo from Windows Explorer or a non-container editor,
  which conflicts with "the non-Docker Windows path keeps working as fallback" (frozen answer 14).

**Recommendation:** clone bb2dash (and cut worktrees) inside the WSL2 Ubuntu distro's own
filesystem — e.g. `~/dev/bb2dash` as seen from *inside* Ubuntu, reachable from Windows at
`\\wsl.localhost\Ubuntu\home\<user>\dev\bb2dash` if Stack ever wants to peek from Explorer or VS
Code's native Windows mode — and bind-mount that into the devcontainer. This is a **second, independent
clone** of the same GitHub remote, not the same files as `C:/Users/estac/projects/bb2dash`. The two
stay in sync the ordinary way: push/pull through `origin`, never by sharing a mount. That satisfies
the "Windows path keeps working" guardrail literally — the existing Windows checkout is untouched
and still works standalone — while giving the container native ext4 speed and working inotify.

**CRLF:** `git config --get core.autocrlf` is `true` globally on this machine, and bb2dash has
**no `.gitattributes`** today — Windows checkouts are CRLF by default, silently. The WSL2 clone,
if untouched, would get whatever `core.autocrlf` resolves to inside the container's Linux git
(default `input`, i.e. LF on checkout, CRLF→LF on commit) — a *different* rule than the Windows
side, which round-trips through `git status` showing every file as modified the first time either
side touches a file the other normalized differently. Fix: add a `.gitattributes` to bb2dash
matching the pattern `agentic-harness` already uses (confirmed by reading it):
```
* text=auto eol=lf
*.crt text eol=lf
*.onnx binary
```
`eol=lf` on `text=auto` files forces LF at checkout **regardless of `core.autocrlf`**, on both
Windows and Linux, once every existing file is renormalized (`git add --renormalize .` in one
commit). After that, `core.autocrlf` becomes close to irrelevant for tracked text files; leave it
`true` on Windows (harmless — `.gitattributes` wins for matched files) and it defaults sanely
(`input` or unset) inside the container.

**Sibling git worktrees when the parent folder is the mount:** Stack's workflow cuts worker
worktrees as siblings — `bb2dash-wt-<name>` next to `bb2dash` itself
(`ORCHESTRATOR.md` §0, §3). Two things fall out of that for a container:
1. **Mount the parent, not the single repo.** If only `~/dev/bb2dash` is bind-mounted into the
   container, sibling worktree folders (`~/dev/bb2dash-wt-cd`, etc.) are invisible inside it. Mount
   `~/dev` (the parent) and set `workspaceFolder` to `~/dev/bb2dash`, so `git worktree add
   ../bb2dash-wt-<name> ...` keeps working exactly as documented.
2. **Worktree admin files pin absolute paths, and Git has no automatic cross-mount reconciliation.**
   Each worktree's `.git` file and the main repo's `.git/worktrees/<name>/gitdir` record the
   absolute path used at `git worktree add` time. If a worktree is ever created from *one* side
   (say, Windows-native `C:\Users\estac\projects\bb2dash-wt-foo`) and then the *same clone* is
   later opened from the container at a different absolute path, those pointers go stale and git
   commands fail to find the common `.git` dir. Because the container uses a **separate clone**
   (per the recommendation above), this collision doesn't arise by construction — but if Stack ever
   does mix the two (e.g., copies a worktree instead of re-creating it), `git worktree repair` from
   the main checkout is the documented fix. Practical rule: pick one side (the container) as the
   sole place worktrees for a given clone are created/removed, for that clone's lifetime.

## 3. Persisting and porting Claude state

**Volume vs bind mount for `~/.claude`:** use the named-volume pattern from §1 — Docker-managed,
survives container rebuilds, invisible to the host by design (this also happens to keep the
Supabase service-role key inside `~/.claude.json` off any Windows-visible bind mount). A bind
mount would work too but has no advantage here since nothing needs to inspect `~/.claude` from
Windows.

**The memory-slug problem, confirmed against
[code.claude.com/docs/en/claude-directory](https://code.claude.com/docs/en/claude-directory):**
the project slug is the absolute working-directory path with separators replaced by `-`
(`/home/user/work/my-repo` → `-home-user-work-my-repo`), and the docs say explicitly: *"Moving a
project to a new path creates a new slug and separate memory... previous sessions/memory at the
old path are still in `~/.claude/projects/` but won't be accessed."* This machine's own directory
names confirm the same convention for Windows paths (`C:/Users/estac/projects/bb2dash` →
`C--Users-estac-projects-bb2dash`, observed directly).

So the first time a PM session runs with `cwd=/workspaces/bb2dash` (or `~/dev/bb2dash`, wherever
`workspaceFolder` ends up), Claude Code slugifies *that* path and starts a brand-new, empty
`memory/` — the six-entry `MEMORY.md` (PM/worker arrangement, Phase 7–12 history, session-capture
gap fix, clipboard convention, Electron build status) does not carry over automatically.

**Migration, one-time, per the docs' own recommended procedure:** with the config volume mounted
but empty, seed it before first real use:
```
mkdir -p /home/node/.claude/projects/<new-slug>/memory
cp <old Windows memory dir>/*.md  → /home/node/.claude/projects/<new-slug>/memory/
```
where `<new-slug>` is the slugified container path (compute once and hardcode, or `echo
"$PWD" | sed 's/[\/:]/-/g'` mirrors the observed pattern closely enough to verify by comparing
against a freshly-created slug after the first real session). Do the same for the
`agentic-harness` clone's memory if that repo also gets a devcontainer. This is a one-time copy,
not an ongoing sync — subsequent sessions in the container accumulate their own memory at the new,
now-stable slug.

**Hooks written for Windows paths — read `session-capture.mjs` and its `lib/` directly:**
- The hook itself (`~/.claude/hooks/session-capture.mjs`) is plain Node using `node:os`/`node:path`
  — no Windows-specific logic, and it already treats "never throw, always exit 0" as its top design
  rule. It runs fine unmodified inside the container **once `~/.claude/hooks` is present there**
  (it's part of the config volume, §1).
- `lib/enqueue-ingest.mjs` branches explicitly on `process.platform === 'win32'`: it spawns
  `pythonw -c "from ingest.cli import main; ..."` on Windows (to avoid a visible console window on
  a detached process) and plain `ingest` (the uv-installed console script) everywhere else. **This
  already degrades correctly on Linux** — `platform !== 'win32'` takes the POSIX branch — so this
  is not a bug to fix, just confirm `uv` and the `ingest` project are actually present at
  `~/agentic-harness/ingest` inside the container (path is computed from `os.homedir()`, not
  hardcoded, so it resolves correctly once the harness repo is cloned at the container's home).
- **The real break is the vault location, not the hook logic.** `lib/constants.mjs` defines
  `DEFAULT_VAULT_SEGMENTS = ['OneDrive - Syracuse University', 'vault']` — i.e. the note-writing
  target is `~/OneDrive - Syracuse University/vault` by default. OneDrive is a Windows sync client;
  it is not present, and won't sync into, a Linux container. This is exactly why Stack's frozen
  answer #7 moves the vault "out of OneDrive into a private git repo" — once that move happens,
  set `HARNESS_VAULT` (the documented override env var) to the new git-repo path inside the
  container's `containerEnv`, and this hook needs no code change at all.
- `lib/spawn.mjs`'s hardening (`NoDefaultCurrentDirectoryInExePath`, `cwd: os.homedir()`) is a
  Windows-only mitigation (`libuv`'s pre-`PATH` cwd search is a Windows behavior); it's a documented
  no-op on Linux, not a break — the env var is simply ignored there.
- `lib/enqueue-ingest.mjs`'s `resolveUv()` looks for `uv`/`uv.exe` at `~/.local/bin/<name>` first,
  then searches `PATH` — this works unmodified in the container as long as `uv` is installed the
  same way (the standalone installer script, which the Dockerfile should run for the `node` user
  specifically, not root, so `~/.local/bin` resolves to `/home/node/.local/bin`).

## 4. Auth inside the dev container

- **Claude Code login, given the $0 hard rule:** use the subscription (Pro/Max), not an API key —
  API-key usage bills per token against the Console/metered plan, while `claude setup-token`
  generates a long-lived OAuth token (`sk-ant-oat01-...`) tied to the existing subscription's
  included usage and is explicitly built for exactly this case ("CI pipelines and scripts where
  browser login isn't available"). Generate it once (interactively, from any machine — including
  inside the container the first time), store it as a Docker secret / `.env`-sourced value, and set
  `CLAUDE_CODE_OAUTH_TOKEN` in the container's environment; Claude Code reads that ahead of the
  keychain/credentials file. This also sidesteps needing `~/.credentials.json` copied in at all,
  though persisting it via the config volume (§3) works too and is what lets an *interactive*
  `claude` login inside the container survive a rebuild.
  [Authentication docs](https://code.claude.com/docs/en/authentication);
  [devcontainer docs, "Persist authentication"](https://code.claude.com/docs/en/devcontainer#persist-authentication-and-settings-across-rebuilds).
- **`gh auth login`:** GitHub CLI defaults to the **device-code flow** in exactly this situation —
  known headless/remote environments (SSH, Codespaces, dev containers, CI) default to device code
  rather than the browser-loopback flow; it prints a URL + one-time code, no listening port needed
  inside the container at all. Today's host `gh auth status` shows a token cached in the Windows
  keyring — that keyring is not reachable from Linux, so this is a fresh `gh auth login
  --with-token < token-file` (best for scripting a rebuild) or an interactive device-code login
  once per container lifetime, backed by the same named config volume if `gh`'s own config dir
  is added to it (or, simpler: store a fine-scoped PAT as `GH_TOKEN` env/secret — `gh` honors that
  env var non-interactively without any login step, and it matches the project's own secrets
  pattern of "one gitignored `.env` + Docker secrets").
- **Git identity/signing:** `user.name`/`user.email` are plain global git config (`emstacho-su` /
  `emstacho@syr.edu` on this host) — copy those two lines into the container's git config (bake
  into the image or a `postCreateCommand`, not a secret). No GPG/SSH commit signing is configured
  on this host (`commit.gpgsign`/`gpg.format` both unset), so there's nothing to port there; if
  Stack turns signing on later, an SSH-agent-forwarded key beats copying a private key into the
  image.
- **Supabase / Vercel CLI auth from inside a container — loopback redirect problem, confirmed:**
  both `supabase login` and interactive `vercel login` open a browser to complete an OAuth flow
  against a `localhost:<ephemeral-port>` callback server the CLI itself binds. Inside a container
  that port is not forwarded to the host by default, so the browser (running on Windows) can
  complete the provider's redirect but the container-side listener never sees it — a documented
  failure mode (`anthropics/claude-code` issue #20793 describes exactly this for Claude Code's own
  MCP OAuth, same underlying mechanism). **Avoid the flow entirely** rather than fighting port
  forwarding: both CLIs support a non-interactive token path built for CI —
  `SUPABASE_ACCESS_TOKEN` (a personal access token) and `VERCEL_TOKEN` (a token from `vercel
  tokens create`), both read automatically as env vars with no login step. This is also strictly
  better for the "$0, no secrets in images" rule: generate once, store as Docker secrets alongside
  the Supabase service key and `GH_TOKEN`.
- **The Chrome extension MCP (`claude-in-chrome`) — will not work, confirmed by architecture:** it
  is a Chrome-extension-based MCP whose whole value proposition is driving "the browser you already
  have open" — the extension holds a WebSocket connection to a small local relay server that the
  MCP client process talks to, both normally on the same host, using the browser's live cookies/
  session. If Claude Code (and therefore the MCP server it spawns) runs inside the container while
  Chrome + the extension run on Windows, that relay is on the *host's* loopback interface — the
  same class of unreachable-127.0.0.1 problem as the OAuth callbacks above, except here even
  forwarding the port wouldn't restore the real value (there's no "already-logged-in Blackboard
  Chrome tab" running inside a fresh container to drive). This is orthogonal to, and should not be
  confused with, the separate browser-in-a-container-with-persistent-profile approach the frozen
  context describes for Blackboard/Duo login (§1.4 of the shared context) — that's a
  purpose-built noVNC-style container running its own browser, not this extension.
  **Playwright MCP is the correct substitute** for anything this devcontainer needs browser
  automation for (bb2dash's and the Electron package's own Playwright test suites, plus any
  ad-hoc page inspection): it launches and owns its own browser process *inside* the container,
  needs no host bridge, and Playwright's official Docker images are published for Ubuntu/Debian
  base images including arm64 (see §7) — install via `npx playwright install --with-deps
  chromium` in the Dockerfile or a `postCreateCommand`.

## 5. Usable without VS Code

Stack drives Claude Code from the CLI/desktop app, not primarily VS Code, so the container must
not depend on the editor. Two supported paths, per
[code.claude.com/docs/en/devcontainer](https://code.claude.com/docs/en/devcontainer) and the
[Dev Containers CLI](https://code.visualstudio.com/docs/devcontainers/devcontainer-cli):

1. **`devcontainer` CLI directly** (`npm install -g @devcontainers/cli`, the same open-source CLI
   VS Code's extension wraps): `devcontainer up --workspace-folder ~/dev/bb2dash` builds/starts the
   container from `.devcontainer/devcontainer.json`, then `devcontainer exec --workspace-folder
   ~/dev/bb2dash claude` runs Claude Code inside it — `exec` sets the working directory to the
   configured mount path and the configured `remoteUser` automatically, exactly like `docker exec`
   but devcontainer-spec-aware. This is scriptable from a plain PowerShell or Windows Terminal
   shortcut with no editor involved at all.
2. **Plain `docker compose run`/`exec`**, bypassing the devcontainer spec entirely, if the
   Dockerfile + compose service are hand-written (which they will be for the umbrella repo anyway,
   per frozen answer #10): `docker compose run --rm dev claude` or, for a long-lived container,
   `docker compose up -d dev && docker compose exec dev claude`. This sacrifices the
   devcontainer-spec niceties (VS Code auto-attach, `${devcontainerId}` volume naming,
   `postStartCommand`/`waitFor` semantics) but needs nothing beyond Docker itself, and gives an
   identical day-to-day command whether or not `.devcontainer/devcontainer.json` is also kept
   around for anyone who *does* want VS Code.
3. **The Claude Desktop app does not attach to devcontainers or any remote environment** — it's a
   local, host-only client. There's no finding to cite for an absence; if Stack wants a GUI-adjacent
   experience against the container, that's the VS Code Dev Containers path (editor UI + terminal
   both proxied into the container), not the desktop app. His actual daily driver — the CLI via
   `devcontainer exec` or `docker compose exec` — needs neither.

**Recommendation:** keep `.devcontainer/devcontainer.json` (for optional VS Code use and as the
spec-compliant source of truth for build args/mounts/env) but make `docker compose` the primary,
documented entry point for Stack's actual workflow, since that's what generalizes to the other
Phase 14 containers (sync watcher, scheduler) sharing the same Dockerfile/base image.

## 6. Electron (`desktop/`) — what stays on the host

Confirmed by reading the Phase 12 worktree (`bb2dash-wt-electron-12/desktop/package.json`):
Electron 44.4.1, a `build`/`typecheck`/`test` (Vitest) / `test:e2e` (Playwright) split. Electron's
renderer is a real GUI process (Chromium + a native window) — it fundamentally cannot display on a
headless Linux container without an X server/Wayland compositor forwarded out, which is not worth
building for a single-user desktop shell.

**Split:**
- **Runs in the container:** everything that doesn't need a window — `npm run build` (tsc),
  `npm run typecheck`, `npm run test` (Vitest, unit-level, no Electron runtime needed for most of
  it), and even `test:e2e` *if* Playwright's Electron support is driven headless (Playwright can
  launch Electron apps headlessly for its own test runner in many configurations — worth
  confirming against this specific suite rather than assumed, since Electron's main process still
  needs a display server for some window operations even "headless"; flagging this as untested
  rather than guaranteed).
- **Stays on the host (Windows):** actually running/clicking through the built app, packaging an
  installer/unpacked build for Stack to double-click, and desktop-notification testing (Windows
  notification center is not reachable from a Linux container). The container produces
  `desktop/dist/` (or wherever `build` outputs); Stack runs `npm start`/the packaged binary
  natively on Windows against that build output, either by keeping a plain Windows Node install
  for just this package or by copying the built artifact out of the container (`docker cp` or the
  bind-mounted workspace already makes it visible on the WSL2 side reachable from Explorer at
  `\\wsl.localhost\...`).
- This is the same "Windows path keeps working" guardrail as §2, applied to one package: `desktop/`
  is the one place in this repo where *building* can be containerized but *running* cannot, ever,
  by the nature of Electron.

## 7. Multi-arch (ARM MacBook)

- `node:22-bookworm` is an official multi-arch image (amd64 + arm64/v8); `docker buildx build
  --platform linux/amd64,linux/arm64` builds both from the one Dockerfile with no changes needed
  for the apt packages used here (all present in Debian's arm64 archive: `git gh iptables ipset
  iproute2 dnsutils aggregate jq zsh fzf sudo python3 python3-venv`).
- `git-delta`'s GitHub releases publish an `aarch64`/arm64 `.deb` alongside amd64 — the Dockerfile's
  `$(dpkg --print-architecture)` substitution already makes this arch-agnostic as written.
- **Playwright**: officially Ubuntu/Debian only (no Alpine/musl) — matches the base image choice
  already made for other reasons — and current Playwright images/binaries support arm64 for
  Chromium and Firefox with full support; WebKit has historically lagged on arm64 Linux but current
  releases cover it. bb2dash's suites only need Chromium, so this is a non-issue in practice.
- **uv** (astral.sh installer) ships prebuilt arm64 Linux binaries; no source build needed.
- Net: one Dockerfile, `docker buildx build --platform linux/amd64,linux/arm64 --push` to GHCR (per
  frozen answer #13's "research decides" on registry — GHCR fits the $0 + already-authenticated-`gh`
  constraints, free for public or reasonably-sized private repos), and `docker compose` on the ARM
  Mac pulls the matching manifest automatically. No per-arch Dockerfile branches needed for
  anything this container installs.

## Recommended `devcontainer.json` + `Dockerfile` sketch

`.devcontainer/Dockerfile` (extends the Anthropic reference; comments mark the deltas):

```dockerfile
FROM node:22-bookworm

ARG TZ
ENV TZ="$TZ"
ARG CLAUDE_CODE_VERSION=latest

RUN apt-get update && apt-get install -y --no-install-recommends \
  less git procps sudo fzf zsh man-db unzip gnupg2 gh \
  iptables ipset iproute2 dnsutils aggregate jq nano vim \
  python3 python3-venv ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/share/npm-global && chown -R node:node /usr/local/share
ARG USERNAME=node
RUN mkdir /commandhistory && touch /commandhistory/.bash_history && chown -R $USERNAME /commandhistory
ENV DEVCONTAINER=true
RUN mkdir -p /workspaces /home/node/.claude && chown -R node:node /workspaces /home/node/.claude
WORKDIR /workspaces/bb2dash

ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

USER node
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin:/home/node/.local/bin
ENV SHELL=/bin/zsh EDITOR=nano VISUAL=nano

# --- delta: uv, project standard for Python (ingest/, validate-grading successor) ---
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

ARG ZSH_IN_DOCKER_VERSION=1.2.0
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -p git -p fzf \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" -x

RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# --- delta: Playwright browser + OS deps for web/ and desktop/ test suites ---
RUN npx --yes playwright@1.63.0 install --with-deps chromium

COPY init-firewall.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/init-firewall.sh && \
  echo "node ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/node-firewall && \
  chmod 0440 /etc/sudoers.d/node-firewall
USER node
```

`.devcontainer/devcontainer.json`:

```jsonc
{
  "name": "bb2dash dev",
  "build": {
    "dockerfile": "Dockerfile",
    "args": { "TZ": "${localEnv:TZ:America/New_York}", "CLAUDE_CODE_VERSION": "latest" }
  },
  "runArgs": ["--cap-add=NET_ADMIN", "--cap-add=NET_RAW"],
  "remoteUser": "node",
  // Mount the PARENT of the repo (see §2) so sibling worktrees (bb2dash-wt-<name>)
  // are visible; workspaceFolder points at the repo itself inside that mount.
  "workspaceMount": "source=${localEnv:HOME}/dev,target=/workspaces,type=bind,consistency=cached",
  "workspaceFolder": "/workspaces/bb2dash",
  "mounts": [
    // Fixed names, not ${devcontainerId} — one shared config across every devcontainer
    // Stack opens (bb2dash, its worktrees, agentic-harness), matching one real ~/.claude today.
    "source=claude-code-config,target=/home/node/.claude,type=volume",
    "source=claude-code-bashhistory,target=/commandhistory,type=volume"
  ],
  "containerEnv": {
    "NODE_OPTIONS": "--max-old-space-size=4096",
    "CLAUDE_CONFIG_DIR": "/home/node/.claude",
    // Secrets (Supabase service key, GH_TOKEN, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN,
    // CLAUDE_CODE_OAUTH_TOKEN, HARNESS_VAULT once the vault repo exists) are NOT baked in
    // here — sourced from a docker-compose env_file / Docker secret per frozen answer 8.
    "POWERLEVEL9K_DISABLE_GITSTATUS": "true"
  },
  "forwardPorts": [3000],
  "postCreateCommand": "npm ci --prefix web && npm ci --prefix mcp-server && (cd ingest && uv sync || true)",
  "postStartCommand": "sudo /usr/local/bin/init-firewall.sh",
  "waitFor": "postStartCommand"
}
```

`init-firewall.sh` deltas from the reference: add to the DNS-resolved allowlist loop —
`*.supabase.co` (resolve the specific project ref, e.g. `goultdzqcavefcgnifdy.supabase.co` and
`goultdzqcavefcgnifdy.pooler.supabase.com`, since wildcard DNS can't be pre-resolved into an
ipset), `api.vercel.com`, `vercel.com`, `pypi.org`, `files.pythonhosted.org`, `astral.sh` (uv
installer, only needed at build time — could instead be allowed only during `docker build`, not
runtime), and the harness's own Postgres host from its `DATABASE_URL`. Everything GitHub-shaped
(`gh`, `git push`, Playwright's browser download CDN redirects through GitHub-hosted CDNs in some
cases) is already covered by the `api.github.com/meta` CIDR block the reference script pulls in.

## Migration checklist

- [ ] Create `.gitattributes` in `bb2dash` (`* text=auto eol=lf`, `*.crt text eol=lf`), then
      `git add --renormalize .` in one commit.
- [ ] Clone bb2dash inside the WSL2 Ubuntu distro's filesystem (e.g. `~/dev/bb2dash`), separate
      from the existing `C:/Users/estac/projects/bb2dash` checkout; same for `agentic-harness`.
- [ ] Write `.devcontainer/Dockerfile` + `devcontainer.json` per the sketch above; widen
      `init-firewall.sh`'s allowlist.
- [ ] Generate a `claude setup-token`; store as `CLAUDE_CODE_OAUTH_TOKEN` in the umbrella repo's
      `.env`/Docker secret (never in the image).
- [ ] Generate a scoped `GH_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`; same secret handling.
- [ ] Build the container once; `docker compose exec dev claude` to confirm auth, then set global
      `git config user.name`/`user.email` inside it (or bake into the Dockerfile — not secret).
- [ ] Seed `~/.claude/projects/<container-slug>/memory/` from the current Windows
      `C--Users-estac-projects-bb2dash/memory/` (one-time copy; see §3 for how to compute the slug).
- [ ] Confirm (don't assume) the harness vault has moved out of OneDrive into its own git repo
      (frozen answer 7) before relying on `HARNESS_VAULT` inside the container — until then,
      `session-capture.mjs`'s ingest-enqueue step will silently no-op there (by design, never
      throws) rather than write notes anywhere useful.
- [ ] Run a full worker cycle once (PM session + one Opus worker on a worktree cut from inside the
      container) before calling the container the default environment; confirm
      `git worktree list` from both the container and, separately, the untouched Windows checkout,
      show no cross-contamination.
- [ ] Multi-arch: add a GHCR `buildx build --platform linux/amd64,linux/arm64 --push` step
      (GitHub Actions or manual) once there's a second host to actually pull it on.
