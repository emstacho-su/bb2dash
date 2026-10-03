# 100 · W-58 verification — bb2dash-stack (tasks 24, 25, 26)

Worker W-58, Phase 14 (brief `docs/planning/sprint-2/briefs/100_PHASE14_containers.md`).
Repo `emstacho-su/bb2dash-stack`, branch `feat/containers-14-stack`, worktree
`C:/Users/stack/projects/bb2dash-stack-wt-containers`, cut from `main` 781d0ce (one README commit).
Machine: stack-laptop, Windows 11, Docker Desktop 29.8.1 (Compose v5.5.1), just 1.58.0, Node v24.19.0,
no user WSL distro (only `docker-desktop`).

Every command below ran from the bb2dash-stack worktree root unless a `cd` is shown. Local `.env` and
`machine.env` (gitignored, no secret) were copied from the templates with
`BB2DASH_DIR=../bb2dash-wt-containers-14` and `HARNESS_DIR=../../agentic-harness-wt-containers`.
No secret value was created, read or printed; `secrets/` was only ever a copy of the empty template.

## Task 24 — umbrella: include, secrets.example/, machine.env.example, .env.example, justfile

### RED (before any file existed)

```
ls secrets.example | wc -l                     -> 1   (the "No such file or directory" line; 0 files)
just --summary                                 -> error: no justfile found
grep -c "^set windows-shell" justfile          -> grep: justfile: No such file or directory
git check-ignore secrets/novnc_password machine.env .env | wc -l          -> 0
docker compose --profile mcp --profile dev config --services | wc -l     -> no configuration file provided: not found
node --test scripts/open-login.test.mjs        -> Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\scripts\open-login.mjs'
```

### GREEN

```
ls secrets.example | wc -l                     -> 11   (find secrets.example -type f -size +0 | wc -l -> 0: all empty)
just --summary                                 -> dev doctor down ingest-now login logs sync-now up
grep -c "^set windows-shell" justfile          -> 1
git check-ignore secrets/novnc_password machine.env .env | wc -l          -> 3
docker compose --profile mcp --profile dev config --services | wc -l     -> 3   (harness-jobs, sync, dev)
node --test scripts/open-login.test.mjs        -> ℹ tests 4 · ℹ pass 4 · ℹ fail 0
```

**The service count is 3, not 4, until W-56's task 17 lands.** bb2dash's `compose.yaml` on
`feat/containers-14` (89bdc6e) defines only `sync` (the spike); `bb2dash-mcp` (profile `mcp`) is W-56's.
The umbrella does not define it: it is bb2dash's service, and defining it here would shadow W-56's.
With a scratch copy of bb2dash's `compose.yaml` plus a stub `bb2dash-mcp` service (`profiles: [mcp]`,
`build: ./mcp-server`, `image: bb2dash-mcp:local`) as `BB2DASH_DIR`:

```
BB2DASH_DIR=<scratch> docker compose --profile mcp --profile dev config --services | wc -l   -> 4
  (bb2dash-mcp, dev, harness-jobs, sync)
BB2DASH_DIR=<scratch> docker compose config --services                                      -> harness-jobs sync
```

Re-run the check against the real repo after W-56's compose is merged into `feat/containers-14`.

### What the merged config resolves to (with `SECRETS_DIR` absolute, as `just` exports it)

```
secrets: every one resolves to C:/Users/stack/projects/bb2dash-stack-wt-containers/secrets/<name>
  (compose prints only the 8 a service uses today; sync_runner_db_url, supabase_publishable_key and
   supabase_anon_jwt are declared and wait for W-56's sync service)
volumes: bb-profile claude-home fastembed-cache job-state   (course-files comes with W-56's sync)
sync ports: [{"host_ip":"127.0.0.1","target":6080,"published":"6080"}]
```

Compose behaviour this rests on, each tested in a scratch project before use (Compose v5.5.1):
* `include:` paths interpolate from the umbrella's `.env`, and so do the included files.
* Without `env_file` on an include, compose falls back to the included repo's own `.env` for
  variables the umbrella does not set; with `env_file: [./.env, ./machine.env]` it reads only the
  umbrella's files. bb2dash's `.env` holds keys, so every include sets `env_file`.
* A missing `.env` (or `machine.env`) named there fails every command (`The system cannot find the
  file specified.`, exit 1): fail-closed until A1's copy step.
* The process environment beats `.env`, so `just`'s exported `SECRETS_DIR` wins.
* A secret declared both here and in an included file merges without error.
* A `${VAR:?}` in the profiled `dev` service fails `config` for every profile, so `dev` uses `:-`
  defaults and fails at `run` time instead (its memory bind has `create_host_path: false`).

`machine.env.example` lists `HARNESS_REALMS=projects:push,classes:push,harness:push`: the stack-laptop
machine file (`grep '^HARNESS_REALMS=' ~/.harness/machine.env`, the only line read) lists the
`harness` realm too, and `C:/Users/stack/vault` holds all three. Brief 100 says "both realms".

## Task 25 — umbrella doctor (C-7's nine rows plus the Claude token age, on the harness `--strict`)

Rows: docker · docker autostart · clock skew (Docker's clock and the host's against the HTTP `Date`
of `<SUPABASE_URL>/auth/v1/health`, limit 30 s) · secrets (11) · ports (composed config of every
profile, and the running containers) · supabase · blackboard (`docker compose exec -T sync node
sync/dist/probe.js`) · job nightly, job collect (`/state/scheduler.json` via `exec -T harness-jobs
cat`) · harness doctor (`node $HARNESS_DIR/hooks/doctor.mjs --strict`) and its `vault <realm> clean`
/ `pushed` rows · wslconfig · claude token.

### RED

```
node --test doctor/doctor.test.mjs
  -> Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\doctor\doctor.mjs' imported from …\doctor\doctor.test.mjs
```

### GREEN

```
node --test doctor/doctor.test.mjs                          -> ℹ tests 26 · ℹ pass 26 · ℹ fail 0
node --test --test-reporter=tap doctor/doctor.test.mjs      -> # tests 26 · # pass 26 · # fail 0
```

(Node 24's default reporter prints `ℹ fail 0`; the brief's `# fail 0` is the TAP reporter's line.)
The brief's named cases, each its own test: a missing secret → 1; an empty secret (and one holding
only a BOM and CRLF) → 1; 45 s of skew in Docker's clock → 1, and in the host's → 1 (20 s → 0);
a port on 0.0.0.0, a port with no host address, and a running container on 0.0.0.0 → 1 each;
a failing harness row → 1 (the realm row carries it); the all-green fixture → 0. Also: no secret
value is ever printed; the publishable key goes only into the Supabase `apikey` header; Docker down;
autostart off; Supabase 401 and unreachable; probe exit 3; a nightly older than 36 h and a job that
exited 2; a running job is not a problem; `.wslconfig` missing or without `memory=` under `[wsl2]`;
plain Linux (no `.wslconfig` needed, autostart from the docker unit); the token at 10 d and 366 d;
no `--strict` exits 0; an unknown argument exits 2; `secrets.example/` and `compose.yaml` name
exactly the 11; the two env templates hold no secret.

### `just doctor; echo $?` on the laptop: waits on Stack (fails closed today)

Run with `secrets/` copied from the empty template and `COMPOSE_PROJECT_NAME=bb2dash-stack-test`, so
its read-only `exec` calls could never reach the PM's `bb2dash-sync-1`:

```
docker                 running, server 29.8.1
docker autostart       off (Docker Desktop → Settings → General → "Start Docker Desktop when you sign in")
clock skew             docker +11s, host +11s against goultdzqcavefcgnifdy.supabase.co's Date
secrets                empty: bb2dash_mcp_service_key, claude_oauth_token, gh_token, harness_database_url, novnc_password, supabase_access_token, supabase_anon_jwt, supabase_publishable_key, sync_runner_db_url, vault_realm_pat, vercel_token (in C:\Users\stack\projects\bb2dash-stack-wt-containers\secrets; copy secrets.example/ and fill each file)
ports                  sync 127.0.0.1:6080; running containers agree
supabase               goultdzqcavefcgnifdy.supabase.co/auth/v1/health answered 401; supabase_publishable_key is empty, so no apikey was sent
blackboard             unknown: exit 1: service "sync" is not running
job nightly            unknown: exit 1: service "harness-jobs" is not running
job collect            unknown: exit 1: service "harness-jobs" is not running
harness doctor         exit 1: 3 problems (realm projects clean, mcp-server build, DATABASE_URL)
vault classes clean    yes
vault classes pushed   yes
vault harness clean    yes
vault harness pushed   yes
vault projects clean   no: 2 uncommitted entries
vault projects pushed  yes
wslconfig              missing: C:\Users\stack\.wslconfig (create it with [wsl2] and a memory= line, then wsl --shutdown)
claude token           absent or empty: C:\Users\stack\projects\bb2dash-stack-wt-containers\secrets\claude_oauth_token (claude setup-token)
doctor --strict: 10 problems
  problem: docker autostart / secrets / supabase / blackboard / job nightly / job collect /
           harness doctor / vault projects clean / wslconfig / claude token
error: recipe `doctor` failed on line 43 with exit code 1
exit=1
```

With `secrets/` absent the row reads `missing: <all 11 names>`. No value appears in either run.

Notes from that run:
* **The clock row is true.** The laptop's own clock is about 10 s ahead of every reference tried
  (Supabase 10 s, google.com 9 s, cloudflare.com 10 s; api.github.com 17 s, cached): under the limit.
* **The harness rows are W-57's worktree's** (`HARNESS_DIR=../../agentic-harness-wt-containers`):
  `mcp-server build` and `DATABASE_URL` are that worktree's (no `dist/`, no `.env`), and
  `realm projects clean` is the live vault (2 uncommitted entries). Pointed at harness `main`
  (429d25f, `HARNESS_DIR=C:/Users/stack/agentic-harness`), `--strict` passes but prints no
  `realm <name> clean|pushed` rows (main's doctor has only `realm <name>`), so the umbrella row
  `vault` reads `no realm checkout in the harness report` and is a problem: the per-realm rows
  need W-57's task 23 in the harness checkout `HARNESS_DIR` names.

What `just doctor` → 0 needs, row by row: docker autostart (Stack: Docker Desktop AutoStart on);
secrets (Stack: all 11 filled); supabase (`supabase_publishable_key` filled); blackboard (W-55/W-56's
`sync/dist/probe.js` in the image, `just up`, Stack's Duo login); job nightly/collect (`just up` and
one nightly finished, which `harness-jobs` runs at once on its first start); harness doctor and
vault rows (W-57's doctor in `HARNESS_DIR`, a built `mcp-server`, `DATABASE_URL` in its `.env`, the
projects realm committed); wslconfig (Stack: `.wslconfig` with `memory=`); claude token (Stack:
`claude setup-token` into `claude_oauth_token`).

## Task 26 — dev container (reference fork on node:22-bookworm, widened firewall, claude-home seed, memory read-only, both MCP servers by secret file)

Files: `.devcontainer/Dockerfile`, `.devcontainer/devcontainer.json`, `.devcontainer/init-firewall.sh`,
`.devcontainer/dev-entrypoint.sh`, `.devcontainer/secret-env.sh`, `scripts/seed-claude-home.sh`,
`scripts/dev-smoke.sh`, `scripts/mcp-rag.sh`, `scripts/lib/seed-tools.mjs`, `scripts/devcontainer.test.mjs`;
the `dev` service in `compose.yaml` (task 24's commit). Reference: `anthropics/claude-code/.devcontainer/`
(`Dockerfile`, `devcontainer.json`, `init-firewall.sh`) fetched from `main` on 2026-10-03. That copy no
longer lists Anthropic's statsig subdomain itself (it lists `statsig.com`); P-108's drop holds either way.

Allowlist DNS check from the host before writing it (`dns.resolve4`): every listed name resolves;
`statsig.anthropic.com` → `ENOTFOUND` (P-108's reason).

### RED

```
node --test scripts/devcontainer.test.mjs
  -> Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\scripts\lib\rewrite-paths.mjs'
(after adding the settings and key-scan cases)
  -> SyntaxError: The requested module './lib/rewrite-paths.mjs' does not provide an export named 'looksLikeKey'
(first GREEN attempt) 11 pass, 1 fail: "the firewall drops statsig.anthropic.com" — the header comment
  named the host; reworded, so the brief's grep counts 0 in the whole file, comments included.
```

### GREEN (no Docker needed)

```
node --test --test-reporter=tap scripts/devcontainer.test.mjs doctor/doctor.test.mjs scripts/open-login.test.mjs
  -> # tests 42 · # pass 42 · # fail 0 · # skipped 0   (shell cases ran under Git Bash)
grep -c "statsig.anthropic.com" .devcontainer/init-firewall.sh     -> 0
grep -c "^FROM node:22-bookworm" .devcontainer/Dockerfile          -> 1
```

### The image builds

```
COMPOSE_PROJECT_NAME=bb2dash-stack-test docker compose --profile dev build dev      -> Image bb2dash-dev:local Built · build exit=0
docker images bb2dash-dev:local                    -> 32d3b7b39e13, 3.83GB
in the image: whoami node · node v22.23.3 · claude 2.1.288 (Claude Code) · uv 0.9.30 · gh 2.23.0 ·
              delta 0.18.2 · Python 3.11.2 · /ms-playwright: chromium-1243, chromium_headless_shell-1243
```

The build took ~25 minutes on this connection (about 0.2 MB/s: the node:22-bookworm layers, then
Playwright's 187 MiB Chromium); nothing was stalled. The base images it pulls are `node:22-bookworm`
and `ghcr.io/astral-sh/uv:python3.12-bookworm-slim` (uv's binary only), both already on task 27's
list of five, so the dev image adds no sixth base manifest.

### The firewall, the shim and the smoke's fail-closed start, through `just dev`

Run in a throwaway project with the empty template as `secrets/`, a scratch `DEV_ROOT` and a scratch
memory folder (no real checkout or memory mounted):

```
COMPOSE_PROJECT_NAME=bb2dash-stack-test DEV_ROOT=<scratch> CLAUDE_MEMORY_DIR=<scratch> \
  just dev bash scripts/dev-smoke.sh | tail -1
-> SMOKE FAIL 0/7: CLAUDE_CODE_OAUTH_TOKEN is not set (fill secrets/claude_oauth_token with the output of claude setup-token, then just dev again)
exit 1   (error: recipe `dev` failed on line 27 with exit code 1)
stderr:
  Restoring Docker DNS rules... · Allowing DNS to 127.0.0.11 · Fetching GitHub IP ranges...
  Host network detected as: 172.20.0.0/24 · IPv6 closed (loopback only) · Firewall configuration complete
  Firewall verification passed - unable to reach https://example.com as expected
  Firewall verification passed - able to reach https://api.github.com/zen as expected
  Firewall verification passed - able to reach https://api.anthropic.com as expected
  secret-env: CLAUDE_CODE_OAUTH_TOKEN: /run/secrets/claude_oauth_token is empty; CLAUDE_CODE_OAUTH_TOKEN stays unset
  (the same line for GH_TOKEN, SUPABASE_ACCESS_TOKEN, VERCEL_TOKEN, DATABASE_URL)
```

### The seed, in the image, against a fake `~/.claude`

Fake source (scratch): CLAUDE.md, rules/, skills/demo, skills/leaky (a fake `ghp_` + 36 `Z`s),
hooks/session-capture.mjs and session-start.log, plugins/installed_plugins.json (Windows installPath),
settings.json (Windows node.exe and hook paths, a Windows `Read(...)` permission, `env`, `apiKeyHelper`),
.claude.json, .credentials.json, projects/x/t.jsonl. Stub `mcp-server/dist/index.js` in the scratch
DEV_ROOT for both repos.

```
docker compose --profile dev run --rm -T -v "<fake>:/seed/claude:ro" dev bash scripts/seed-claude-home.sh   (exit 0)
  seed-claude-home: left out (its text looks like a key): skills/leaky/SKILL.md
  seed-tools: …/settings.json: kept hooks, permissions, model; dropped apiKeyHelper, env
  seed-tools: …/settings.json: rewritten, 1 value(s) still name a Windows drive
  seed-tools:   Read(C:/Users/stack/projects/**)
  seed-tools: …/plugins/installed_plugins.json: rewritten, 0 value(s) still name a Windows drive
  Added stdio MCP server bb2dash with command: node /workspaces/bb2dash/mcp-server/dist/index.js to user config
  Added stdio MCP server rag with command: bash /workspaces/bb2dash-stack/scripts/mcp-rag.sh to user config
In the claude-home volume afterwards:
  hook command  -> "/usr/local/bin/node" "/home/node/.claude/hooks/session-capture.mjs"
  installPath   -> /home/node/.claude/plugins/cache/m/demo/1.0
  FAKE_TOKEN / apiKeyHelper in settings.json -> 0 matches; no .credentials.json; no *.log; no projects/x;
  no skills/leaky (folder dropped too, 5d36b7a); grep -rl ghp_ over the volume -> nothing
  .claude.json mcpServers: bb2dash env {SUPABASE_URL, SUPABASE_SERVICE_ROLE_FILE=/run/secrets/bb2dash_mcp_service_key};
                           rag env {FASTEMBED_CACHE_DIR=/cache/fastembed}  (paths only)
second run without --force -> "…was seeded already (…); pass --force to seed it again", exit 78
```

(A first attempt stopped at `settings.json: not rewritten (Bad escaped character in JSON …)`, exit 1:
the fixture, written through Git Bash into node.exe, had lost its backslashes. The seed refused it, as
it should; the fixture was rewritten byte-exact and the run above is the second.) Claude Code itself
rewrote `model: opus` to `opus[1m]` in settings.json when `claude mcp add` first ran.

Clean-up: `bb2dash-stack-test_claude-home`, `bb2dash-stack-test_fastembed-cache` and
`bb2dash-stack-test_default` removed; no container of that project remains; `secrets/` (the empty
template copy) deleted. `bb2dash-dev:local` is kept for task 27.

### Waiting on Stack (secrets) for `SMOKE PASS 7/7`

`just dev bash scripts/dev-smoke.sh | tail -1` → `SMOKE PASS 7/7` needs: `claude_oauth_token`
(claude_p, mcp_servers); `bb2dash_mcp_service_key` with W-56's `SUPABASE_SERVICE_ROLE_FILE` reader
in bb2dash's materials server, and `harness_database_url` (mcp_servers); `DEV_ROOT` holding the
container's own clones of bb2dash and agentic-harness with both `mcp-server`s built inside the
container (README, "Once, after the first just dev"); the seed run against the real `~/.claude`;
`CLAUDE_MEMORY_DIR` (memory); network for `npm ci` in web/ (vitest) and the model download
(embedder). Not run with real secrets here.

## Not touched

* The PM's `bb2dash-sync-1`: never exec'd, restarted or recreated by this worker. Every compose run
  here used project `bb2dash-stack-test` (doctor runs via `COMPOSE_PROJECT_NAME`). For the record,
  `docker inspect` shows it was recreated at 2026-10-03T17:28:07Z by a compose run whose working dir
  is `C:\Users\stack\projects\bb2dash-wt-containers-14` (bb2dash, not the umbrella).
* No `docker compose up` of `harness-jobs`; no scheduled task; nothing written in the bb2dash or
  agentic-harness worktrees (read-only `git show main:` in `C:/Users/stack/agentic-harness` once).
* No real secret created, read or printed. The only line read from `~/.harness/machine.env` was
  `HARNESS_REALMS=`/`HARNESS_MACHINE=`.

## Commits on `feat/containers-14-stack` (all pushed)

a6e7c46 feat(14-T24) · b513155 feat(14-T24) .gitattributes · 1fb2129 feat(14-T25) · 27aa84a feat(14-T26) ·
7cc913a chore(14-T26) · 266974c fix(14-T26) · 5d36b7a fix(14-T26)

## Round 2 (code review of 5d36b7a), 2026-10-03

Every item test-first; unit suite at the end: `node --test --test-reporter=tap doctor/doctor.test.mjs scripts/*.test.mjs`
→ `# pass 70 · # fail 0` (shell cases under Git Bash, with fake dig/ipset/curl/jq/git in
`scripts/test-fixtures/fake-bin`, since this host has none of those). Container checks: one rebuild of
`bb2dash-dev:local` (the Playwright, apt and base layers all CACHED), throwaway project
`bb2dash-stack-test`, dummy secret values created and deleted, scratch memory folder.

| # | RED | GREEN / check line | SHA |
|---|---|---|---|
| 1 | test: `overrideCommand` true | devcontainer.json `overrideCommand: false`; test passes | c1cff17 |
| 2 | 5/5 tests fail (DEV_ROOT bind, no dev-src, no clone) | container: `ls /opt/bb2dash-stack/secrets` → `[] (0 entries)`; `ls /workspaces/bb2dash-stack/secrets` → No such file; `secret paths readable under the workspace: 0`; `.env bytes: 0, machine.env bytes: 0`; mounts under /workspaces: `/workspaces ext4` only (the dev-src volume); /opt/bb2dash-stack `9p ro`, its secrets `tmpfs ro` | 08eddb8, 97b0426 |
| 3 | test: no mkdir in the image | container: `touch ok, owner node, memory: MEMORY.md` | a8a00bb |
| 4 | HEAD's scanner: `sbp_/gho_/ghu_/ghs_/ghr_ caught by HEAD: false` (5×) | fixture cases pass | 6b27386 |
| 5 | `does not provide an export named 'prepareStage'` | fixture: too large, binary, symlink (junction), key in UTF-8, UTF-16LE with and without BOM all left out and named; clean UTF-16 kept; source-empty folder kept | d931cc4 |
| 6 | (same RED) | fixture: `env` holding a token → seeded settings.json `{ model }`, report says `dropped apiKeyHelper, env`, settings.json not left out | d931cc4 |
| 7 | 2 tests fail (no profile script) | `docker compose exec dev bash -lc 'test -n "$CLAUDE_CODE_OAUTH_TOKEN"'` → exit 0; `claude` on PATH in a login shell | 1c73750 |
| 8 | 2 tests fail | container: `env \| grep -c '^DATABASE_URL='` → 0; processes with DATABASE_URL: 0 (the root firewall loop's environ is unreadable to node, and sudo resets env) | 814365e |
| 9 | test: unset/relative/missing pass silently | doctor test: all three → exit 1 with the reason; `.env.example` has `SECRETS_DIR=/path/to/bb2dash-stack/secrets` | 92553f3 |
| 10 | 3/3 fail (no firewall-lib.sh) | fakes: refresh adds, never removes (`no del/flush/destroy`), logs per pass; container: `refresh every 600s`, `refresh loops running: 1`, a pass `22 domains re-resolved, 0 new` (an earlier pass: 1 new), set 130 → 130 | ac99241 |
| 11 | 4/4 fail | fakes: fetched (token on stdin, absent from args), cached, both-missing fails closed; container: phase 1 `fetched (unauthenticated)`, cache `github-meta.json` 194038 bytes; phase 2 (dummy token, GitHub refuses) `the fetch failed; using the cached copy from …`; fresh volume + dummy token → `ERROR: … no cached copy`, container exited (fail closed) | 29a5eb5 |
| 12 | both scripts through a junction exited 0 silently | through a junction: doctor exit 2 (`unknown argument`), seed-tools exit 2 (`usage:`); same-named file elsewhere → exit 70 | d1f7d4d |
| 13 | hanging fake ran 30 s (no timeout passed) | `SYSTEMCTL_TIMEOUT_MS` 5 s; row `unknown: systemctl did not answer (… ETIMEDOUT)`, problem | 22cf0c0 |
| 14 | test: "two realms" in README | grep: 0 "two realm"; PAT row names vault-projects, vault-classes, vault-harness | 5ad26c9 |

Items 5 and 6 share one commit (d931cc4): both change `prepareStage` in seed-tools.mjs, and splitting them
would leave a commit whose seed script calls a mode that does not exist.

Item 2 placement: this repo's bind is at `/opt/bb2dash-stack`, not `/workspaces/bb2dash-stack`: the item's
third check ("no path under /workspaces is a Windows checkout") rules out any host bind under
/workspaces, and the scripts must still run from the folder `just` was run beside. `/workspaces/bb2dash-stack`
is the dev-src clone (no secrets/ in it). Found in the throwaway run and fixed (97b0426): a refused token
could leave `git clone` prompting on the container's TTY; the clone now runs with `GIT_TERMINAL_PROMPT=0`.
With a dummy token, bb2dash and agentic-harness cloned anyway (public repos), bb2dash-stack failed at once,
and the container stayed up.

Clean-up after every run: `left: containers 0, volumes 0, networks 0, secrets/ 0`; one image tag,
`bb2dash-dev:local` (abc0e2398ca3), nothing dangling. A first run of the check script left one container
up because `docker compose down` without `--profile dev` skips the profiled service; it was removed with
`--profile dev down -v` before the rerun. `bb2dash-sync-1`, `bb2dash_bb-profile` and `harness-postgres`
were not touched.

Unverified: the devcontainer CLI / VS Code route (no CLI here; item 1 rests on the file test); an
authenticated clone with a real gh_token; the 10-minute timer firing on its own (a pass was run by hand
as root in the container; the loop's sleep was not waited out).
