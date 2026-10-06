# Phase 21 — W-65 (container stream) verification

Brief: `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md` (frozen 2026-10-05) · Tasks 12, 13, 14 ·
bb2dash branch `feat/workspace-21-container` (worktree `bb2dash-wt-21-container`) · bb2dash-stack branch
`feat/workspace-21` (worktree `bb2dash-stack-wt-21`) · Wave 1 written 2026-10-05; wave 2 (rulings T1)
added 2026-10-06, at the end.

**Wave 1 is files and read-only checks only.** No `docker build`, `up`, `run`, `exec`, `stop` or `rm`
was run by this stream, and no `just` verb. The image has not been built, so nothing below proves that
the image builds or that the firewall works in a kernel. What wave 1 does prove is listed per task;
what waits for wave 2 is written out as paste-ready lines.

| task | wave 1 | waits for wave 2 |
|---|---|---|
| 12 | every file written; compose resolves; the `sync` service is unchanged; `grep-clean` 10 of 11 | the eleventh `grep-clean` test (needs W-64's `workspace/`), the build, every container check, the token smoke (PM) |
| 13 | the scan lines written | the scan itself (needs the image) |
| 14 | done: 46 of 46, every file check | nothing |

**Wave 2a (2026-10-06)** changed files again on rulings T1 and again ran no docker step that changes
state: see "Wave 2" at the end. The numbered list there replaces the draft lines wave 1 kept in this
file, and the sections below are wave 1's record as written.

**Wave 2b (2026-10-06)** did ruling U2 (the port check, the header, the bb2dash-stack wording, the
list's four corrections) and then began the docker step. **The image did not build**: steps 1 to 9
of the list passed, and step 10 failed because the embedding model's download address now answers
403. No container was started; tasks 12 and 13 are still owed from step 10 on. See "Wave 2b" at the
end.

## The guard (read before and after everything this stream did)

```
docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
```

| when (2026-10-05) | output |
|---|---|
| before any edit | `bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z` |
| after the compose edit and the config checks | the same |
| after task 14 and the last check of wave 1 | the same |

## Task 12 — image, entrypoint, firewall, the `workspace` service

Commits on `feat/workspace-21-container`: `ebbc5ce` (the test, red), `4435aa1` (the five files under
`docker/workspace/`), `e3e93d9` (the compose block), then this file and one follow-up to the firewall
(the set type, below).

### RED: the test before the files

```
node --test docker/grep-clean.test.mjs          (at ebbc5ce: no docker/workspace/ yet)
✖ the build contexts are the ones compose.yaml builds from
✖ an image is read through <Dockerfile>.dockerignore when it has one, else its context's .dockerignore
✖ the workspace image has its own allow-list, and the root .dockerignore does not name it
  Error: ENOENT: no such file or directory, open '…\docker\workspace\Dockerfile.dockerignore'
✖ the workspace Dockerfile pins the CLI, builds the materials server in a stage and copies named paths only
  Error: ENOENT: no such file or directory, open '…\docker\workspace\Dockerfile'
✖ workspace: what docker/workspace/Dockerfile copies is clean
ℹ tests 11
ℹ pass 6
ℹ fail 5
```

At the cut the file had 6 tests, all passing. The change adds the `workspace` entry to `IMAGES`, reads
`<Dockerfile>.dockerignore` when one exists, and adds four tests (a named-context `COPY` is skipped;
which ignore file each image reads; the allow-list is the Contract's nine lines and the root
`.dockerignore` does not name `workspace`; the Dockerfile pins `2.1.289`, never names
`CLAUDE_CODE_VERSION=latest` or `bb2dash-mcp:local`, and copies exactly six named paths from
`workspace/`).

### After the files: 10 of 11 in this tree, and why not 11

```
node --test docker/grep-clean.test.mjs          (wave 1 tree, e3e93d9)
✔ … (10 tests)
✖ workspace: what docker/workspace/Dockerfile copies is clean
  AssertionError [ERR_ASSERTION]: docker/workspace/Dockerfile copies workspace/package.json, which is not in .
ℹ tests 11
ℹ pass 10
ℹ fail 1
```

**This is not green, and cannot be in wave 1.** The Dockerfile copies `workspace/package.json`,
`package-lock.json`, `tsconfig.json`, `src/`, `claude/` and `prompts/`, and `workspace/` is W-64's
package: it reaches this branch only by merge (task loop 4c). The test refuses a `COPY` source that does
not exist, which is the right refusal, so it was not loosened. The row's check (a) is owed in wave 2,
after the merge.

To show the test will pass once the files are there, and that it then really reads them, the same test
file was run in a scratch copy of this tree (`git archive HEAD docker compose.yaml .dockerignore sync
ingest desktop/src/core/sync-id.ts mcp-server`, outside every repo) with stub files at the six paths,
plus a `workspace/README.md` and a `workspace/test/fixtures/` file that each name a `C:` path:

```
node --test docker/grep-clean.test.mjs          (scratch copy with stub workspace/ files)
✔ workspace: what docker/workspace/Dockerfile copies is clean
ℹ workspace: 24 file(s) scanned of 24 copied
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

The README and the fixture were not scanned (named paths, never the folder whole). With one more stub,
`workspace/src/planted.ts` holding `const dir = 'C:/Users/someone/projects';`, the same run fails with
`workspace/src/planted.ts: a C:/ drive path`. A stub is not W-64's code: this says nothing about whether
the real package is clean.

### Check (d), the parts that need no container

```
grep -c -E "CLAUDE_CODE_VERSION=latest|bb2dash-mcp:local" docker/workspace/Dockerfile        → 0
bash -n docker/workspace/entrypoint.sh  docker/workspace/init-firewall.sh  docker/workspace/mcp-rag.sh   → each ok
```

`shellcheck` is not installed on stack-laptop, so it was not run. All five new files and the two
changed ones hold no carriage return (`grep -c $'\r'` → 0 for each).

In a shell with only the Windows user variables set (`SECRETS_DIR` and `BB2DASH_DIR` set; `HARNESS_DIR`
and `COMPOSE_PROFILES` unset, read with `env`), from `bb2dash-wt-21-container`:

```
docker compose -f compose.yaml config --quiet; echo $?                        → 0
docker compose -f compose.yaml config --services                              → sync
docker compose -f compose.yaml --profile workspace config --services          → sync, workspace
docker compose -p bb2dash-wt21 --profile workspace config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const w=JSON.parse(s).services.workspace;console.log([w.ports===undefined,w.init,w.platform,Object.keys(w.networks).join(),w.profiles.join(),w.stop_grace_period].join(' '))})"
                                                                              → true true linux/amd64 workspace-net workspace 30s
```

With no profile the rendered project holds one service (`sync`), one network (`default`), two volumes
(`bb-profile`, `course-files`) and `sync`'s four secrets: the Workspace's network, volume and three new
secret entries are not in it at all. So what the desktop's sign-in task sees
(`docker compose -f <repo>/compose.yaml up -d --wait`, `desktop/launch/logon-build.ps1` line 429) is
unchanged. The main checkout's own `.env` sets neither `COMPOSE_PROFILES` nor `HARNESS_DIR` (the two
names were counted with `grep -c`; no value was read).

Rendered under `-p bb2dash-wt21 --profile workspace`: network `bb2dash-wt21_workspace-net`, volume
`bb2dash-wt21_workspace-claude-home`, the four secrets at `/run/secrets/<name>`, environment exactly
`CLAUDE_CONFIG_DIR=/home/node/.claude`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
`ENABLE_TOOL_SEARCH=false`, `WORKSPACE_TURN_BUDGET_USD=1.00`, healthcheck
`node /app/workspace/dist/healthcheck.js` 30s / 5s / 3 / 1m0s, `cap_add` NET_ADMIN and NET_RAW,
`no-new-privileges:true`, `restart: unless-stopped`, no `ports`, no `user`, no `DATABASE_URL`.

A `--profile` flag replaces `COMPOSE_PROFILES` for that command (read here:
`COMPOSE_PROFILES=workspace docker compose -f compose.yaml --profile mcp config --services` → `bb2dash-mcp`,
`sync`). So `just dev` (`--profile dev run …`) does not start the Workspace once `.env` holds the line.

### The compose edit does not change the live `sync` service

```
docker compose -f compose.yaml config --hash sync
```

| where | output |
|---|---|
| `C:/Users/stack/projects/bb2dash` (`main`, 06e046b) | `sync 448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7` |
| `bb2dash-wt-21-container` before the edit | the same |
| `bb2dash-wt-21-container` after the edit (e3e93d9) | the same |
| the live container's own label, `docker inspect -f '{{ index .Config.Labels "com.docker.compose.config-hash" }}' bb2dash-sync-1` | `448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7` |

The hash the edited file renders for `sync` is the hash the running container was created with, so an
`up` from the merged file does not recreate it. `git diff 06e046b -- compose.yaml` is additions only: the
`workspace` service block, one line under `volumes:`, the `networks:` block and three entries under
`secrets:`.

### The firewall: what was chosen where the brief does not spell it out

`docker/workspace/init-firewall.sh` follows the Contract's keep and drop lists. It has **no running
check in wave 1**; the list below is every place a choice had to be made, for the PM and the security
review to rule on.

(Ruled on 2026-10-06, T1: choices 2, 3 and 5 are kept; choice 4 became a port rule in wave 2, and
the read behind choice 5 was fixed. The list below is wave 1's wording.)

1. **Order: resolve first, then default deny.** As in the dev firewall, the four names are resolved
   while the OUTPUT policy is still ACCEPT, because Docker's embedded resolver may forward upstream from
   inside this container's network namespace. Only the root script is running in that window.
2. **Every A record of the one answer is allowed and pinned**, not only the first. The Contract says
   "adds that address"; an answer with two addresses (the Supabase project's name has two today) gets two
   set entries and two `/etc/hosts` lines.
3. **An answer that is not a public IPv4 address is refused** (loopback, 10/8, 172.16/12, 192.168/16,
   100.64/10, 169.254/16, 0/8, 224/4 and up). Not in the brief. Without it a wrong DNS answer could put
   the Docker host or the home network on the allowlist, which is what dropping the /24 rule is for.
4. **No port rule.** The set holds addresses; any port on an allowed address is allowed, as in the dev
   firewall. Tightening to tcp/443 (the two HTTPS names) and tcp/5432 (the poolers) is possible and was
   not done, because the Contract lists hosts, not ports.
5. **IPv6 when `ip6tables` cannot set its rules.** The dev script fails only on a *global* address. This
   one fails on any IPv6 address off loopback (link-local reaches the Docker host), read from
   `/proc/net/if_inet6`, and passes when that file is absent or lists only `lo`. On stack-laptop
   `ip6tables` worked for the dev container (100_W58: "IPv6 closed (loopback only)").
6. **The DSN host is read with a URL's rules**: the authority ends at the first `/`, `?` or `#`, the
   user part at its last `@`, the port is dropped, the name is lower-cased and must match whole labels
   ending `.pooler.supabase.com`. A bracketed address, an IPv4 address, a trailing dot, an underscore
   and a password holding an unencoded `/` all stop the start. A refusal prints the secret's *name* and
   a fixed sentence, never any part of the value.
7. **A missing or empty DSN secret stops the start** (the Contract says "anything else fails closed").
   So the container cannot start until `workspace_runner_db_url` exists (task 19's first half).
8. **What is printed.** The two fixed names, each resolver address, each pooler *host name* once it has
   passed the suffix rule, and a count of addresses. No address of an allowed host, no user name, no
   password, no path or query of a DSN.
9. **Pins are lines ending `# pinned by init-firewall.sh`**; a start first removes the lines an earlier
   start left, and rewrites `/etc/hosts` in place (it is a mounted file and cannot be replaced).
10. **The script sets its own `PATH` and `HOME`** and calls `curl -q` and `dig -r`. The image's `PATH`
    ends in the npm prefix `node` owns, and curl and dig read dot-files from `HOME`: "reads nothing
    `node` can write" needed all four.
11. **Exit codes:** 75 for a refused second run (the dev script's), 1 for a failed start, the failing
    command's own code otherwise; a start that ends early is never reported as 0.
12. **The set type is `hash:net`**, the dev firewall's, although only single addresses are added:
    `hash:net` is known to work under Docker Desktop on this laptop (100_W58), `hash:ip` is not.
13. **Where the scripts live in the image:** `/app/docker/workspace/entrypoint.sh` and
    `/app/docker/workspace/init-firewall.sh`, root-owned, mode 0755 (the sync image keeps its entrypoint
    at the same kind of path).

Outside the firewall, three smaller choices:

* **`entrypoint.sh` removes `/run/workspace` before it makes it**, so a heartbeat file left by the last
  run cannot read as a live runner; and it exports `HOME`, `USER` and `LOGNAME` for `node` before
  `setpriv` (which changes ids, not the environment).
* **`mcp-rag.sh` has every path fixed** (the dev launcher takes two from the environment), and checks
  that the CA, the server and the model folder exist before it starts the server.
* **The Dockerfile assumes `workspace/package.json` has a `build` script that writes `dist/` from
  `src/`** (`npm ci`, `npm run build`, `npm prune --omit=dev`, the steps the other two packages use).
  The brief freezes the output paths, not the script's name: see "Questions for the PM".

### The firewall's logic, dry-run against fake tools (not a kernel)

The script was run under Git Bash from a scratch folder with its six path constants and its `PATH` line
rewritten by `sed` to scratch paths, against fake `iptables`, `ip6tables`, `iptables-save`, `ipset`, `dig`
and `curl` that log their arguments. This proves the script's own control flow. It proves nothing about
netfilter, Docker's DNS or the real hosts.

| case | exit (want) | left at deny-all | note |
|---|---|---|---|
| A happy path: three names, both DSNs on one pooler | 0 (0) | no | 3 lookups, 4 pins |
| B a second run in the same container | 75 (75) | no | 0 new calls to any tool |
| C a DSN host that is not a pooler | 1 (1) | yes | 0 `ipset create`; 0 lines of output holding the password, the user or the host |
| C2 an unencoded `/` in a password | 1 (1) | yes | nothing of the value printed |
| C3 a secret file missing | 1 (1) | yes | `harness_database_url: the secret file is missing or not readable` |
| C4 a secret file holding only a BOM and CRLF | 1 (1) | yes | `workspace_runner_db_url: the secret file is empty` |
| D a name that does not resolve | 1 (1) | yes | |
| E `example.com` reachable at the end check | 1 (1) | yes | |
| F `api.anthropic.com` unreachable at the end check | 1 (1) | yes | |
| G1 no `ip6tables`, a link-local address on `eth0` | 1 (1) | yes | |
| G2 no `ip6tables`, loopback only | 0 (0) | no | |
| G3 no `ip6tables`, no IPv6 in the kernel | 0 (0) | no | |
| H a private answer for an allowed name | 1 (1) | yes | 0 `ipset add` of it |
| H2 private, public and junk answers together | 0 (0) | no | only the public one added |
| I a stale pin from an earlier start | 0 (0) | no | the stale line is gone, `localhost` kept |
| J the set rule cannot be added | 4 (4) | yes | |
| K two different pooler names | 0 (0) | no | 4 lookups, 4 names |

The happy path's calls, in order (case A; the two `DOCKER_*` lines are the fake's stand-in for Docker's
DNS redirect):

```
iptables-save -t nat
iptables -F · -X · -t nat -F · -t nat -X · -t mangle -F · -t mangle -X
ipset destroy workspace-allowed
iptables -t nat -N DOCKER_OUTPUT · -N DOCKER_POSTROUTING · (the saved 127.0.0.11 rules, re-added)
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -p udp -d 127.0.0.11 --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp -d 127.0.0.11 --dport 53 -j ACCEPT
ipset create workspace-allowed hash:net
dig -r +noall +answer +time=5 +tries=2 A api.anthropic.com                    → ipset add -exist … (1)
dig -r +noall +answer +time=5 +tries=2 A goultdzqcavefcgnifdy.supabase.co     → ipset add -exist … (2)
dig -r +noall +answer +time=5 +tries=2 A <the pooler host>                     → ipset add -exist … (1)
iptables -P INPUT DROP · -P FORWARD DROP · -P OUTPUT DROP
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m set --match-set workspace-allowed dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
ip6tables -F · -X · -P INPUT DROP · -P FORWARD DROP · -P OUTPUT DROP · -A INPUT -i lo -j ACCEPT · -A OUTPUT -o lo -j ACCEPT
curl -q -s -o /dev/null --connect-timeout 5 --max-time 15 https://example.com          (must fail)
curl -q -s -o /dev/null --connect-timeout 5 --max-time 15 https://api.anthropic.com    (must succeed)
```

`dsn_host` on its own, read into a shell from the script (the script runs `main` only when executed):
23 of 23 URL shapes as wanted. Allowed: the session-pooler form with its query string, an upper-case
host (lower-cased), an upper-case scheme, `%40` in the password, a raw `@` in the password, no user
part. Refused: `evilpooler.supabase.com`, `<pooler>.evil.example`, bare `pooler.supabase.com`,
`db.<ref>.supabase.co`, `[2001:db8::1]`, an IPv4 address, a trailing dot, an underscore label, a label
starting with a hyphen, the pooler name placed after a `/`, a `?` or a `#` of another host, a
backslash-`@` form, `mysql://`, a bare host name, a space before the host. No refusal printed any part
of the value. `is_public_ipv4`: 21 of 21 (8 public, 13 internal, including 172.15/172.32 and
100.63/100.128 at the edges).

The two clauses the security review is asked to read (IPv6 closed; a DSN host that does not end
`.pooler.supabase.com` fails closed) are step 6 and step 1 of `main`, and cases G1–G3 and C, C2 above.

### The paste-ready lines, and task 13

Wave 1 kept a draft of the docker lines for tasks 12 and 13 here (in git at `09b5c4a`). Rulings T1
changed how they must be written, so they were rewritten in wave 2: see "Wave 2 — the lines for tasks
12 and 13, top to bottom" at the end of this file. Task 13 has nothing to show before the image exists.

## Task 14 — bb2dash-stack: the secret name, the profile, the doctor row, the README

Commits on bb2dash-stack `feat/workspace-21`: `5d519d2` (the tests, red), `e371752` (the code). Cut from
`origin/main` eb71e8b.

### RED

```
node --test doctor/workspace.test.mjs doctor/doctor.test.mjs          (at 5d519d2)
✖ the all-green fixture exits 0 and prints every row
✖ secrets.example/ and compose.yaml name exactly the 12 frozen secrets
SyntaxError: The requested module './lib/constants.mjs' does not provide an export named 'WORKSPACE_PROFILE'
✖ doctor\workspace.test.mjs
ℹ tests 32
ℹ pass 29
ℹ fail 3
```

### GREEN (check (a))

```
node --test doctor/workspace.test.mjs doctor/doctor.test.mjs          (at e371752)
ℹ tests 46
ℹ suites 0
ℹ pass 46
ℹ fail 0
```

`doctor/workspace.test.mjs` (15 tests): `SECRET_NAMES`, `secrets.example/` and the umbrella `compose.yaml`
name the same twelve; `ALL_PROFILES` holds `workspace` and the ports check passes `--profile workspace`;
with every row green the doctor exits 0 and the row reads `running, healthy`; it exits 1, with exactly
one problem row, when `workspace_runner_db_url` is missing, empty or only a BOM and a newline (`secrets`),
and when the service has no container, is `exited`, `restarting`, `created`, `paused` or `dead`, is
running but `unhealthy`, still `starting` or has no health status, or compose fails or prints something
that is not JSON (`workspace`); the row runs one command,
`docker compose --profile workspace ps --all --format json workspace`, and the doctor runs no command
that changes anything; `.env.example`, the README section and tables, and no file still counting 11.
The three other test files that read `compose.yaml`, `.env.example` or the README
(`scripts/dev-isolation.test.mjs`, `scripts/devcontainer.test.mjs`, `scripts/open-login.test.mjs`) →
32 of 32.

### Check (d)

| check | result | at the cut (eb71e8b) |
|---|---|---|
| `git ls-files secrets.example \| wc -l` | 12 | 11 |
| `grep -c "^COMPOSE_PROFILES=workspace" .env.example` | 1 | 0 |
| `grep -cE "11 (files\|names\|frozen names)" README.md compose.yaml` | 0 and 0 | 3 and 2 |
| `grep -c "all 11" doctor/lib/checks-host.mjs` | 0 | 1 |
| `grep -c "docker compose restart workspace" README.md` | 1 | 0 |
| `grep -c "workspace_runner_db_url" README.md` | 2 | 0 |
| `grep -c "workspace-claude-home" README.md` | 3 | 0 |
| `git diff --stat origin/main...HEAD -- doctor/doctor.mjs` | prints nothing | |

`secrets.example/workspace_runner_db_url` is 0 bytes. The secrets folder itself was listed by name and
size only: on 2026-10-05 it holds the three shared names (`claude_oauth_token`, `bb2dash_mcp_service_key`,
`harness_database_url`) and not yet `workspace_runner_db_url` (task 19's first half is Stack's).

### What the row does, in words

The row is a problem whenever the `workspace` container is not running and healthy, with or without the
profile in `.env` (the task's check asks for that). So between the merge and acceptance step 13, when
Stack adds `COMPOSE_PROFILES=workspace` and runs `just up`, `just doctor` shows
`workspace  not running: no container (set COMPOSE_PROFILES=workspace in .env, then just up)`.

(Changed in wave 2 by ruling T1: with the profile off the row now reads `off` and is not a problem.
See "Task 14, wave 2".)

Two things beyond the row's list in the Files table, both small: the README's "What runs" table and its
volumes line name the service and `workspace-claude-home`, and the umbrella `compose.yaml`'s header
comment lists the service and the volume beside the line that said 11.

## Questions for the PM (wave 1; answered by rulings T1 on 2026-10-06)

1. **`npm run build` in `workspace/`.** The Dockerfile's runner stage runs `npm ci`, `npm run build`,
   `npm prune --omit=dev` and copies `/build/dist`. The Contract freezes `dist/runner.js`,
   `dist/healthcheck.js` and `dist/hooks/tool-gate.js`, not the script that makes them. If W-64's
   package builds under another script name or to another folder, one line of the Dockerfile changes.
   Wave 2's step 0 has a line that reads it.
2. **`grep-clean` cannot be 11 of 11 before the merge** (above). The row's check (a) is owed in wave 2.
3. **The firewall's choices 2, 3, 4 and 5** go beyond or beside the Contract's words (all addresses of
   one answer; non-public answers refused; no port rule; the stricter IPv6 fallback). Each is one small
   edit to reverse.
4. **`workspace_runner_db_url` must exist before `up`**: compose refuses to start a service whose
   secret file is missing, and the firewall refuses an empty one. Task 12's order already says so.

## Wave 2 (2026-10-06) — rulings T1, files and read-only checks only

Wave 2a is every item of ruling T1 and nothing that changes docker state. **No `docker build`, `up`,
`run`, `exec`, `stop`, `rm`, `restart` or `create` was run by this stream, no `just` verb and no
`claude -p`.** The image is still unbuilt: nothing here proves that it builds, or that the firewall
works in a kernel. The build and every container check are the next step, with the PM, and are
written out below as one numbered list.

First step of the wave: `git fetch origin`, then `git merge origin/feat/workspace-21` into
`feat/workspace-21-container` (no conflict; W-64's `workspace/` arrived with it), pushed as `ec302ce`.
The phase branch gained one docs commit during the wave (`4ca39d9`); it was merged the same way
(`2fccee8`). bb2dash-stack needed no merge.

| T1 item | what changed | where | red → green |
|---|---|---|---|
| (a) every A record allowed and pinned | kept | `init-firewall.sh` | a test now holds it |
| (b) non-public answers refused | kept | `init-firewall.sh` | a test now holds it |
| (c) the port rule | two sets, each with one port: tcp/443 for the two HTTPS names, tcp/5432 for the poolers | `init-firewall.sh` | `17e2cfd` → `9a9bb85` |
| (d) IPv6 when ip6tables cannot set rules | kept; the read no longer pipes into `grep -q` under pipefail | `init-firewall.sh` | `17e2cfd` → `9a9bb85` |
| the pin cannot move by itself | `DISABLE_AUTOUPDATER=1` in the service; the CLI's folder is root's after the install | `compose.yaml`, `Dockerfile` | `6be6de3` → `c572a3a` |
| no `iproute2` | removed: no script calls `ip` | `Dockerfile` | `6be6de3` → `c572a3a` |
| the runner stage against W-64's real package | confirmed, and now asserted | `docker/grep-clean.test.mjs` | passes as written |
| grep-clean 11 of 11 after the merge | 11 of 11 | | below |
| literal-address probes, the restart line, the `pgrep` line, variables inside each line | written | the numbered list below | not run (docker) |
| the doctor's Workspace row | off is not a problem; on, the container and the secret both count | bb2dash-stack | `496220e` → `6255923` |
| the README's `secrets/` wording | corrected to `SECRETS_DIR` | bb2dash-stack | `496220e` → `6255923` |

### The guard

```text
docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
```

| when (2026-10-06) | output |
|---|---|
| before the merge, the first command of the wave | `bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z` |
| after the compose edit and the config checks | the same |
| after the last check of the wave | the same |

### grep-clean, 11 of 11 with the real `workspace/` in the tree (task 12 check (a))

Right after the merge, before any edit of wave 2 (`ec302ce`):

```text
node --test docker/grep-clean.test.mjs
✔ every pattern catches its planted line (a pattern that matches nothing guards nothing)
✔ comments are stripped, code is kept
✔ the build contexts are the ones compose.yaml builds from
✔ a COPY from a stage or a named build context is not a context source
✔ an image is read through <Dockerfile>.dockerignore when it has one, else its context's .dockerignore
✔ the workspace image has its own allow-list, and the root .dockerignore does not name it
✔ the workspace Dockerfile pins the CLI, builds the materials server in a stage and copies named paths only
✔ the .dockerignore exclusions keep host-built and secret folders out
✔ sync: what docker/sync/Dockerfile copies is clean
ℹ sync: 25 file(s) scanned of 29 copied
✔ bb2dash-mcp: what mcp-server/Dockerfile copies is clean
ℹ bb2dash-mcp: 14 file(s) scanned of 14 copied
✔ workspace: what docker/workspace/Dockerfile copies is clean
ℹ workspace: 41 file(s) scanned of 41 copied
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

The eleventh test, red in wave 1 for want of the package, reads W-64's real files now: 41 files copied,
41 scanned, no Windows drive path, `.ps1`, PowerShell, `Move-Item` or OneDrive outside a comment. The
count is still 11 at the end of the wave: wave 2's new assertions sit inside the Dockerfile test.

### The firewall: the port rule and the IPv6 read

**The dry run is now a committed test**, `docker/workspace/init-firewall.test.mjs` (wave 1 ran it from a
scratch folder). It copies the script with its five place constants and its PATH line pointed at a
scratch folder, runs it with a real bash against fake `iptables`, `ip6tables`, `iptables-save`, `ipset`,
`dig` and `curl` that log their arguments, and reads the log back. New in wave 2: a small model of the
OUTPUT chain built from that log, so a test can ask what a new connection to a literal address and
port would meet. It proves the script's own logic. It proves nothing about netfilter, Docker's resolver
or the real hosts. The image does not copy it (the Dockerfile copies named files only), and it is one
file beyond the brief's Files table: see "Questions for the PM".

RED, the test before the code (`17e2cfd`, the wave 1 script):

```text
node --test docker/workspace/init-firewall.test.mjs
✖ the port rule (T1 c): tcp/443 to the two HTTPS names, tcp/5432 to the pooler, and no rule without a port
    +   '-m set --match-set workspace-allowed dst -j ACCEPT',
    -   '-p tcp --dport 443 -m set --match-set workspace-https dst -j ACCEPT',
    -   '-p tcp --dport 5432 -m set --match-set workspace-postgres dst -j ACCEPT',
✖ by literal address: an allowed address answers on its own port only, and no other address on any
    AssertionError: 160.79.104.10 tcp/80        actual: 'open'   expected: 'blocked'
✖ IPv6: a long list of addresses off loopback still stops the start (the read is not a pipe that can break)
    actual: 0   expected: 1        (its log ends "Firewall raised: 3 name(s) allowed")
✖ no pipe in the script feeds a reader that stops early (under pipefail a broken pipe reads as a failure)
    + [ `elif awk '$NF != "lo"' "$INET6_ADDRESSES" | grep -q .; then` ]
✖ an answer that is not a public IPv4 address is never allowed (T1 b)        (the set it must land in is not made yet)
✖ a rule that cannot be added stops the start at deny-all with the failing command's own code
✖ two database secrets on two poolers: both are allowed on 5432, neither on 443
ℹ tests 18
ℹ pass 11
ℹ fail 7
```

The third line is a real fault of the wave 1 script, not only a style point: with `ip6tables`
unavailable and 20,000 IPv6 addresses off loopback, `awk … | grep -q .` under `pipefail` failed as a
pipeline (the reader stopped at the first line and broke the writer's pipe), the `elif` read that as
"none found", and the start went on with IPv6 open. A short list did not show it, which is why wave
1's cases G1 to G3 passed.

GREEN (`9a9bb85`):

```text
node --test docker/workspace/init-firewall.test.mjs
▶ docker/workspace/init-firewall.sh, dry run against fake tools
  ✔ a start that works: one lookup a name, every address pinned, nothing of a connection string printed
  ✔ the port rule (T1 c): tcp/443 to the two HTTPS names, tcp/5432 to the pooler, and no rule without a port
  ✔ by literal address: an allowed address answers on its own port only, and no other address on any
  ✔ DNS may go only to the resolvers in /etc/resolv.conf, and a resolver's address opens nothing else
  ✔ no rule opens the Docker network: the gateway and the Docker host are refused like any other address
  ✔ a second run in the same container is refused before it changes anything
  ✔ a database secret that is not a pooler URL stops the start at deny-all, and nothing of it is printed
  ✔ a name that does not resolve stops the start at deny-all
  ✔ the end check: example.com reachable, or api.anthropic.com unreachable, stops the start at deny-all
  ✔ IPv6 (T1 d): when ip6tables cannot set its rules, any IPv6 address off loopback stops the start
  ✔ IPv6: a long list of addresses off loopback still stops the start (the read is not a pipe that can break)
  ✔ no pipe in the script feeds a reader that stops early (under pipefail a broken pipe reads as a failure)
  ✔ an answer that is not a public IPv4 address is never allowed (T1 b)
  ✔ every address of the one answer is allowed and pinned (T1 a), and a pin an earlier start left is taken out
  ✔ a rule that cannot be added stops the start at deny-all with the failing command's own code
  ✔ two database secrets on two poolers: both are allowed on 5432, neither on 443
  ✔ dsn_host: a pooler URL gives its host, anything else is refused with a fixed sentence
  ✔ is_public_ipv4: loopback, private, carrier-grade NAT, link-local, multicast and reserved are not public
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

About 40 seconds on stack-laptop. Every wave 1 property has its test: one run per start (a second run
exits 75 and calls no tool), deny-all on any failure before the last check (asserted on the modelled
chain: policy DROP, one loopback rule, four addresses blocked), DNS only to resolv.conf's resolvers,
no accept for the Docker network (the gateway and the Docker host are blocked on 6080, 443, 5432 and
80), and a connection string never echoed (no password, no user and no `postgres://…` in any log,
and no part of a refused URL in a refusal).

The happy path's calls, in order (the fakes' log; the addresses are the test's):

```text
iptables-save -t nat
iptables -F · -X · -t nat -F · -t nat -X · -t mangle -F · -t mangle -X
ipset destroy workspace-https · ipset destroy workspace-postgres
iptables -t nat -N DOCKER_OUTPUT · -N DOCKER_POSTROUTING · (the saved 127.0.0.11 rules, re-added)
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -p udp -d 127.0.0.11 --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp -d 127.0.0.11 --dport 53 -j ACCEPT
ipset create workspace-https hash:net
ipset create workspace-postgres hash:net
dig -r +noall +answer +time=5 +tries=2 A api.anthropic.com                  → ipset add -exist workspace-https … (1)
dig -r +noall +answer +time=5 +tries=2 A goultdzqcavefcgnifdy.supabase.co   → ipset add -exist workspace-https … (2)
dig -r +noall +answer +time=5 +tries=2 A <the pooler host>                   → ipset add -exist workspace-postgres … (1)
iptables -P INPUT DROP · -P FORWARD DROP · -P OUTPUT DROP
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set workspace-https dst -j ACCEPT
iptables -A OUTPUT -p tcp --dport 5432 -m set --match-set workspace-postgres dst -j ACCEPT
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited
ip6tables -F · -X · -P INPUT DROP · -P FORWARD DROP · -P OUTPUT DROP · -A INPUT -i lo -j ACCEPT · -A OUTPUT -o lo -j ACCEPT
curl -q -s -o /dev/null --connect-timeout 5 --max-time 15 https://example.com          (must fail)
curl -q -s -o /dev/null --connect-timeout 5 --max-time 15 https://api.anthropic.com    (must succeed)
```

What the model reads off those rules (the test "by literal address"): the three HTTPS addresses are
open on tcp/443 and blocked on 80, 5432 and 8443; the pooler address is open on tcp/5432 and blocked
on 443 and 6543; UDP to any of them is blocked; `1.1.1.1` is blocked on 443, on 5432 and on udp/53.

Choices made in wave 2, for the PM and the security review:

1. **Two sets of the proven type, each with its own rule**, not one `hash:ip,port` set: `hash:net` is
   the type the dev firewall proved under Docker Desktop on this laptop.
2. **Which set a name goes into is fixed by where the name comes from**: the two names in the script
   go to tcp/443, the host of each database secret to tcp/5432. A DSN's own port is not read.
3. **A DSN whose port is not 5432 is not refused by the firewall.** The container starts, and that
   connection is then refused by the port rule (the runner's own config already refuses 6543 for
   `workspace_runner_db_url`; for `harness_database_url` the rag server would fail to connect). On
   2026-10-06 both secrets name port 5432 (102a, task 19). See "Questions for the PM".
4. **The script's constant `ALLOWED_HOSTS` is now `HTTPS_HOSTS`.** If the token smoke fails on the
   network, the missing host goes there (tcp/443), into 102a and into a DECISIONS row.
5. **The end check is unchanged** (`example.com` refused, `api.anthropic.com` answered). After default
   deny an unpinned name cannot be looked up from inside the container, so `example.com` fails there
   on the lookup; the literal-address probes of the list below are what prove the address rule.
6. **The log line per name now says the port**: `Allowed <name> on tcp/<port> (<n> address(es), pinned
   in /etc/hosts)`.

`bash -n` passes on `entrypoint.sh`, `init-firewall.sh` and `mcp-rag.sh`; none of the changed files
holds a carriage return.

### The image: a CLI that cannot move under its pin, and no `iproute2`

RED (`6be6de3`, the wave 1 Dockerfile and compose file):

```text
node --test docker/grep-clean.test.mjs
✖ the workspace Dockerfile pins the CLI, builds the materials server in a stage and copies named paths only
    + [
    +   'after the CLI install its folder is not handed to root (chown -R root:root /usr/local/share/npm-global)',
    +   'compose.yaml does not set DISABLE_AUTOUPDATER=1 for the workspace service'
    + ]
    - []
ℹ tests 11
ℹ pass 10
ℹ fail 1
```

The test reads three rules; the first failure stops it, so the three were also printed on their own:
`pinDrift` the two lines above, `unusedPackages` → `iproute2 is installed and no script in the image
calls ip`, `runnerStageMismatches` → `[]`.

GREEN (`c572a3a`): `tests 11`, `pass 11`, `fail 0`.

* **`DISABLE_AUTOUPDATER: "1"`** is in the service's `environment:`. The runner hands its whole
  environment to the CLI (`workspace/src/providers/claude-cli.ts`, `childEnv`), so the setting reaches
  every turn. The block still interpolates nothing outside `build:`, the secret paths and
  `WORKSPACE_TURN_BUDGET_USD`.
* **The CLI's folder is root's**: `chown -R root:root /usr/local/share/npm-global` runs after the
  install. **It runs in a stage of its own (`cli`), and the runtime stage copies the folder**
  (`COPY --from=cli`). The reason is the package itself, read from the registry and from its tarball:
  `@anthropic-ai/claude-code@2.1.289` is a 187 kB wrapper whose `postinstall` hard-links the
  platform binary (`@anthropic-ai/claude-code-linux-x64`, 246 MB unpacked) onto `bin/claude.exe`. A
  `chown -R` in a later layer of the runtime stage changes every file's owner, so that layer would
  store the binary again (this is reasoning about image layers, not a measurement: nothing was built).
  In a stage the install keeps the dev container's recipe to the letter (`USER node`,
  `NPM_CONFIG_PREFIX=/usr/local/share/npm-global`, `npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"`),
  the chown is the ruling's command, and the image carries the folder once. Not asked for in those
  words: see "Questions for the PM". Whether the CLI must write there is the token smoke's to show
  (step 27 of the list); if it must, the fix is `--chown=node:node` on the one COPY line.
* **No `iproute2`**: no script in the image calls `ip` (the firewall reads the container's IPv6
  addresses from `/proc/net/if_inet6`). The comment says so, and the test fails if a script starts
  calling `ip` without the package, or the package comes back without a caller.
* **The runner stage matches W-64's package as merged**: `workspace/package.json` has
  `"build": "tsc -p tsconfig.json"`, `workspace/tsconfig.json` builds `src` into `dist`, and
  `src/runner.ts`, `src/healthcheck.ts`, `src/hooks/tool-gate.ts`, `claude/settings.json` and
  `prompts/system.md` are in the package; the six COPY paths are the six the test pins
  (`package.json`, `package-lock.json`, `tsconfig.json`, `src`, `claude`, `prompts`); the image's
  `CMD` is `node /app/workspace/dist/runner.js`, the service's healthcheck is
  `node /app/workspace/dist/healthcheck.js`, and the hook `settings.json` wires is
  `node /app/workspace/dist/hooks/tool-gate.js`. The runner's own path constants
  (`workspace/src/config.ts`) name `/app/workspace/claude/settings.json`,
  `/app/workspace/prompts/system.md`, `/app/turn`, `/run/workspace` and the two secret paths, as the
  image lays them out. All of it is now asserted by the Dockerfile test.

### Checks run in wave 2 (read-only docker only)

From `bb2dash-wt-21-container`, at the wave's last commit:

```text
node --test docker/grep-clean.test.mjs                                        → tests 11, pass 11, fail 0
node --test docker/workspace/init-firewall.test.mjs                           → tests 18, pass 18, fail 0
grep -c -E "CLAUDE_CODE_VERSION=latest|bb2dash-mcp:local" docker/workspace/Dockerfile        → 0
bash -n docker/workspace/entrypoint.sh · init-firewall.sh · mcp-rag.sh        → each ok
git ls-files workspace/src/runner.ts docker/workspace/Dockerfile | wc -l      → 2
```

Compose, with `HARNESS_DIR` and `COMPOSE_PROFILES` unset and the two Windows user variables as they
are on stack-laptop (`SECRETS_DIR=C:/Users/stack/.bb2dash-secrets`,
`BB2DASH_DIR=C:/Users/stack/projects/bb2dash`):

```text
docker compose -f compose.yaml config --quiet; echo $?                        → 0
docker compose -f compose.yaml config --services                              → sync
docker compose -f compose.yaml --profile workspace config --services          → sync, workspace
docker compose -p bb2dash-wt21 --profile workspace config --format json | node -e "…"
                                                                              → true true linux/amd64 workspace-net workspace 30s
the same render, the service's environment                                    → CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 CLAUDE_CONFIG_DIR=/home/node/.claude
                                                                                DISABLE_AUTOUPDATER=1 ENABLE_TOOL_SEARCH=false WORKSPACE_TURN_BUDGET_USD=1.00
```

The `sync` service is unchanged by this branch:

| where | `docker compose -f compose.yaml config --hash sync` |
|---|---|
| `C:/Users/stack/projects/bb2dash` (`main`) | `sync 448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7` |
| `bb2dash-wt-21-container` at the wave's last commit | the same |
| the live container's label (`com.docker.compose.config-hash`) | `448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7` |

The rendered `sync` service itself (its whole JSON without `build`, with its four secrets and two
volumes) is byte-identical between the two checkouts: 1845 bytes each. `git diff origin/main --
compose.yaml` is 90 added lines and no removed line.

Read on the host, for the list's literal-address probes: `1.1.1.1:443`, `api.anthropic.com:80`,
`goultdzqcavefcgnifdy.supabase.co:80` and the pooler's `6543` each accept a TCP connection from this
laptop (2026-10-06). So `blocked` for them inside the container is the firewall's doing.

The four secret files the service mounts exist and are not empty (sizes only were read;
`workspace_runner_db_url` is the 169 bytes 102a records). The harness checkout is at
`e7997f3e3ddc402a3c8f535d3b926bbd61d6adbd` with nothing uncommitted under `mcp-server` or `certs`;
`alpine:3.20` and `ghcr.io/gitleaks/gitleaks:v8.30.1` are on the laptop; no `bb2dash-workspace:local`
image and no container of project `bb2dash-wt21` exists.

**Not yet true, by design:** `git merge-base --is-ancestor feat/workspace-21-runner HEAD; echo $?`
read `1` during the wave, because W-64's wave 2 commits are on the runner branch and not yet on the
phase branch. Step 2 of the list merges again and re-reads it; the build waits for `0`.

### Task 14, wave 2 — the doctor's row follows the profile; the README names `SECRETS_DIR`

RED (bb2dash-stack `496220e`):

```text
node --test doctor/workspace.test.mjs doctor/doctor.test.mjs
✖ a missing workspace_runner_db_url exits 1 and is named, by the secrets row and by the workspace row
✖ an empty workspace_runner_db_url exits 1, and one holding only a BOM and a newline counts as empty
✖ with the profile off in .env the workspace row reads off and is not a problem, whatever Docker would say
✖ off says how to turn the Workspace on, and its secret stays the secrets row's to name
✖ with the profile on, the row is a problem unless the container is running and healthy and the secret is non-empty
✖ the profile is read as compose reads it: a list, the environment over .env, and * for every profile
✖ no workspace container exits 1 and says how to start it
✖ the README has a Workspace section that says what it is, what it costs, how to restart it and where an answer is kept
✖ the README tables name the Workspace: its secret, the three it shares, the doctor row and what runs
✖ the README says the secrets live in the folder SECRETS_DIR names, outside every repo, never in a secrets/ folder here
ℹ tests 51
ℹ pass 41
ℹ fail 10
```

GREEN (bb2dash-stack `6255923`): `tests 51`, `pass 51`, `fail 0` (46 in wave 1). The three other
test files that read `compose.yaml`, `.env.example` or the README: 32 of 32. Task 14's check (d)
reads as in wave 1, with `grep -c "workspace_runner_db_url" README.md` now 3; `git diff --stat
origin/main...HEAD -- doctor/doctor.mjs` still prints nothing.

The row, in words:

* **Profile off** (`COMPOSE_PROFILES` does not name `workspace`; read from `.env` with the process
  environment on top, as compose reads it, a comma-separated list where `*` means every profile):
  the row reads `off (COMPOSE_PROFILES in .env does not name workspace; to turn it on:
  COMPOSE_PROFILES=workspace in .env, then just up)`, asks Docker nothing and is not a problem,
  whatever state a container is in.
* **Profile on**: a problem unless the container is running and healthy **and**
  `workspace_runner_db_url` is non-empty. A missing or empty secret is named in the row beside
  Docker's answer (`running, healthy; workspace_runner_db_url is missing in SECRETS_DIR (…)`), never
  its value. The `secrets` row names it too, as before, so that case now lists two problem rows.
* The `secrets` row is unchanged: it still wants all 12 files whatever the profiles say (see
  "Questions for the PM").

The README: every place that put the secrets in this repo's `secrets/` folder now says the folder
`SECRETS_DIR` names, outside every repo (the intro, the layout, "First time on a machine", "Secrets",
the note under the verbs, the dev container's mounts, "Stack's machine steps"); the Workspace section
says the container reaches the two HTTPS names on port 443 and the pooler on 5432; the doctor table's
row says what off means; and the cost sentence is whole on one line: "costs nothing extra only while
Usage credits are off on the Claude account".

## Wave 2 — the lines for tasks 12 and 13, top to bottom (Git Bash)

**Every line is a Git Bash line and stands alone.** It changes into the worktree itself, sets
`SECRETS_DIR` and `HARNESS_DIR` itself (never a separate `export`), and carries `MSYS_NO_PATHCONV=1`
wherever docker is handed a container path, so Git Bash rewrites nothing. The project is
`bb2dash-wt21` and the service is named in every compose command. Every `exec` has `-T` (no
pseudo-terminal: the line then behaves the same pasted into a terminal and run by a tool). Never
`just up`, never an `up` without the service name. To run the list in another tree (tasks 19 to 22
run in `bb2dash-wt-21`), change the one folder name after `cd`.

(Wave 2b ran steps 1 to 10 against docker on 2026-10-06; step 10 failed and steps 11 to 39 are
still unrun. The paragraph below is wave 2a's, as written then.)

**None of these lines has been run against docker.** Their quoting has: each docker line was read
back out of this file in Git Bash and run with `docker` standing for a program that starts nothing
and records what it was handed (a native Windows program, so Git Bash treats its arguments as it
would docker's), from a shell with `SECRETS_DIR`, `HARNESS_DIR` and `COMPOSE_PROFILES` unset. The
result is under the list.

Read the guard (step 1) again after every step marked **(guard)**, and paste it into 102a.

**1.** The guard.

```
docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
```
→ `bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z`

**2.** The tree holds the runner as the PM merged it (task loop 4c).

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && git fetch origin && git merge --no-edit origin/feat/workspace-21 && git merge-base --is-ancestor feat/workspace-21-runner HEAD; echo "runner merged: $?"; git ls-files workspace/src/runner.ts docker/workspace/Dockerfile | wc -l
```
→ `runner merged: 0`, then `2`. A `1` means the runner branch has commits the phase branch lacks: stop.

**3.** The two test files.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && node --test docker/grep-clean.test.mjs 2>&1 | grep -E "(tests|pass|fail) [0-9]+$"
```
→ `tests 11`, `pass 11`, `fail 0`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && node --test docker/workspace/init-firewall.test.mjs 2>&1 | grep -E "(tests|pass|fail) [0-9]+$"
```
→ `tests 20`, `pass 20`, `fail 0` (about 45 seconds; 18 before wave 2b's two tests)

**4.** The Dockerfile's and the service's literals.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && grep -c -E "CLAUDE_CODE_VERSION=latest|bb2dash-mcp:local" docker/workspace/Dockerfile; grep -c "^RUN chown -R root:root /usr/local/share/npm-global$" docker/workspace/Dockerfile; grep -c "^ *iproute2" docker/workspace/Dockerfile; grep -c 'DISABLE_AUTOUPDATER: "1"' compose.yaml
```
→ `0`, `1`, `0`, `1`

**5.** The four secret files exist (sizes only; nobody prints a file).

```
for n in workspace_runner_db_url claude_oauth_token bb2dash_mcp_service_key harness_database_url; do printf '%s %s\n' "$n" "$(stat -c %s "/c/Users/stack/.bb2dash-secrets/$n")"; done
```
→ four lines, each a size above 0

**6.** What the desktop's sign-in task sees: only the two Windows user variables, no profile.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && ( unset HARNESS_DIR COMPOSE_PROFILES; SECRETS_DIR=C:/Users/stack/.bb2dash-secrets BB2DASH_DIR=C:/Users/stack/projects/bb2dash docker compose -f compose.yaml config --quiet ); echo "exit=$?"
```
→ `exit=0`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && ( unset HARNESS_DIR COMPOSE_PROFILES; SECRETS_DIR=C:/Users/stack/.bb2dash-secrets BB2DASH_DIR=C:/Users/stack/projects/bb2dash docker compose -f compose.yaml config --services )
```
→ `sync` and nothing else

**7.** The service as compose renders it for the test project.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const w=JSON.parse(s).services.workspace;console.log([w.ports===undefined,w.init,w.platform,Object.keys(w.networks).join(),w.profiles.join(),w.stop_grace_period].join(' '))})"
```
→ `true true linux/amd64 workspace-net workspace 30s`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const e=JSON.parse(s).services.workspace.environment;console.log(Object.keys(e).sort().map(k=>k+'='+e[k]).join(' '))})"
```
→ `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 CLAUDE_CONFIG_DIR=/home/node/.claude DISABLE_AUTOUPDATER=1 ENABLE_TOOL_SEARCH=false WORKSPACE_TURN_BUDGET_USD=1.00` and no other name

**8.** The `sync` service still renders the hash the live container was made with.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && ( unset HARNESS_DIR COMPOSE_PROFILES; SECRETS_DIR=C:/Users/stack/.bb2dash-secrets BB2DASH_DIR=C:/Users/stack/projects/bb2dash docker compose -f compose.yaml config --hash sync ); docker inspect -f '{{ index .Config.Labels "com.docker.compose.config-hash" }}' bb2dash-sync-1
```
→ `sync 448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7`, then the same hash alone

**9.** The harness commit the image bakes (paste it into 102a), and nothing uncommitted beside it.

```
git -C C:/Users/stack/agentic-harness rev-parse HEAD; git -C C:/Users/stack/agentic-harness status --short -- mcp-server certs | wc -l
```
→ the commit (`e7997f3e3ddc402a3c8f535d3b926bbd61d6adbd` on 2026-10-06), then `0`

**10.** Build **(guard)**. It downloads the base image, three `npm ci` sets, the CLI (about 250 MB)
and the embedding model: run it in the background, it outlasts a short tool call.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace build workspace; echo "exit=$?"
```
→ `exit=0`

**11.** The image, and the one layer that holds the CLI.

```
docker images bb2dash-workspace:local --format '{{.ID}} {{.Size}}'; docker history --no-trunc bb2dash-workspace:local --format '{{.Size}} {{.CreatedBy}}' | grep "npm-global"
```
→ the image's id and size, then three lines: the `COPY /usr/local/share/npm-global …` layer with its
size, and two `ENV` lines of `0B`. Paste the COPY layer's size into 102a: about 250 MB when the copy
kept the package's link, about 500 MB when it did not (the image works either way). `--no-trunc`
(ruling U2): without it `docker history` cuts each line at 45 characters, and a grep can miss the
words it looks for.

**12.** Start **(guard)**.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace; echo "exit=$?"
```
→ `exit=0`

**13.** What the start made.

```
docker network ls --filter name=bb2dash-wt21 --format '{{.Name}}'; docker volume ls --filter name=bb2dash-wt21 --format '{{.Name}}'
```
→ `bb2dash-wt21_workspace-net` and `bb2dash-wt21_workspace-claude-home`, and nothing else

**14.** The firewall's own log.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace logs --no-log-prefix workspace | grep -E "host of|Allowing DNS|Allowed |IPv6|Firewall"
```
→ in this order (the address counts may differ; the IPv6 line is this one or one of the two
`No IPv6 here …` lines, and which one goes into 102a):

```text
The host of workspace_runner_db_url ends .pooler.supabase.com
The host of harness_database_url ends .pooler.supabase.com
Allowing DNS to 127.0.0.11
Allowed api.anthropic.com on tcp/443 (1 address(es), pinned in /etc/hosts)
Allowed goultdzqcavefcgnifdy.supabase.co on tcp/443 (2 address(es), pinned in /etc/hosts)
Allowed <the pooler's host name> on tcp/5432 (1 address(es), pinned in /etc/hosts)
IPv6 closed (loopback only)
Firewall configuration complete
Firewall verification passed - unable to reach https://example.com as expected
Firewall verification passed - able to reach https://api.anthropic.com as expected
Firewall raised: 3 name(s) allowed
```

**15.** Health.

```
docker inspect -f '{{.State.Health.Status}}' "$(cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)"
```
→ `healthy` (read it again every 10 seconds while it says `starting`; `unhealthy` is the failing result)

**16.** The CLI is the pinned one, and its help still lists the six flags.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace claude --version
```
→ `2.1.289 (Claude Code)`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c "claude --help | grep -c -E -- '^  --(tools|permission-prompts|strict-mcp-config|setting-sources|system-prompt-snapshot|include-hook-events) '"
```
→ `6`

**17.** Every Node and `claude` process is `node`'s (Docker's own healthcheck apart).

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c "ps -o user=,args= -C node,claude | grep -v healthcheck.js | awk '{print \$1}' | sort -u"
```
→ `node`

**18.** The runner itself, not PID 1 (`docker-init`), holds no capability and can regain none.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'echo "pid 1: $(tr "\0" " " </proc/1/cmdline)"; p=$(pgrep -f "^node /app/workspace/dist/runner[.]js$"); echo "runner pid: $p"; grep -E "^(Uid|Cap(Inh|Prm|Eff|Bnd|Amb)):" /proc/$p/status'
```
→ `pid 1:` a command line that begins `/sbin/docker-init --` and ends with the runner's (`init: true`),
then `runner pid:` one number above 1, then `Uid:` with `1000` four times and five `Cap…:` lines, each
`0000000000000000`. The pattern is anchored at both ends, so it matches the runner's own command line
and neither `docker-init`'s, which holds the same words, nor this line's shell.

**19.** No API key and no `DATABASE_URL`; the four settings.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace printenv ANTHROPIC_API_KEY; echo "exit=$?"
```
→ `exit=1`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace printenv DATABASE_URL; echo "exit=$?"
```
→ `exit=1`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace printenv ENABLE_TOOL_SEARCH CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC CLAUDE_CONFIG_DIR DISABLE_AUTOUPDATER
```
→ four lines: `false`, `1`, `/home/node/.claude`, `1`

**20.** The frozen in-image layout.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'ls /app/workspace/dist/runner.js /app/workspace/dist/healthcheck.js /app/workspace/dist/hooks/tool-gate.js /app/workspace/claude/settings.json /app/workspace/prompts/system.md /app/workspace/package.json /app/mcp-materials/package.json /app/mcp-materials/dist/index.js /app/mcp-rag/package.json /app/mcp-rag/dist/index.js /app/mcp-rag/certs/prod-ca.crt /app/mcp-rag/mcp-rag.sh | wc -l; ls -d /app/workspace/node_modules /app/mcp-materials/node_modules /app/mcp-rag/node_modules /opt/fastembed | wc -l; stat -c "%U %a %n" /home/node/.claude /app/turn /run/workspace'
```
→ `12`, then `4`, then three lines owned by `node`, `/run/workspace` with mode `700`

**21.** The CLI's folder is root's, `node` cannot write it, and there is no `ip` program.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'stat -c "%U:%G %a" /usr/local/share/npm-global; find /usr/local/share/npm-global ! -user root | wc -l; for d in /usr/local/share/npm-global /usr/local/share/npm-global/bin /usr/local/share/npm-global/lib/node_modules/@anthropic-ai/claude-code; do test -w "$d" && echo "WRITABLE $d"; done; command -v ip || echo "no ip"'
```
→ `root:root 755`, then `0`, then `no ip` (no `WRITABLE` line)

**22.** `node` can write none of root's files.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'for f in /etc/hosts /app/docker/workspace/init-firewall.sh /app/docker/workspace/entrypoint.sh /app/workspace/dist/runner.js /app/workspace/claude/settings.json /app/mcp-rag/mcp-rag.sh /opt/fastembed /dev/shm/bb2dash-workspace-firewall.up; do test -w "$f" && echo "WRITABLE $f"; done; echo done'
```
→ `done` alone

**23.** The pins: one line per allowed name, with how many addresses it has.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'grep "pinned by init-firewall.sh" /etc/hosts | cut -d" " -f2 | sort | uniq -c'
```
→ three names (four if the two database secrets name different poolers), the counts those of step 14

**24.** The rules and the sets, read as root.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u root workspace sh -c 'iptables -S OUTPUT; ip6tables -S OUTPUT; for s in workspace-https workspace-postgres; do echo "$s $(ipset list "$s" | grep -c -E "^[0-9]")"; done'
```
→ `-P OUTPUT DROP`, then the OUTPUT rules in the dry run's order as iptables prints them (loopback;
udp and tcp 53 to `127.0.0.11`; the state rule; tcp 443 with `--match-set workspace-https dst`; tcp
5432 with `--match-set workspace-postgres dst`; the reject), then `-P OUTPUT DROP` and the one
loopback rule for IPv6, then `workspace-https 3` and `workspace-postgres 1` (the counts of step 23)

**25.** The tool gate is wired, not only written.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "const c=require('/app/workspace/claude/settings.json').hooks.PreToolUse[0].hooks[0].command;const r=require('child_process').spawnSync(c,{shell:true,input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'mcp__rag__search_context',tool_input:{query:'x',collection:'estac'}})});console.log(c,r.status)"
```
→ `node /app/workspace/dist/hooks/tool-gate.js 2`

**26.** Egress by name (check (e) as the brief writes it).

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ `blocked`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "fetch('https://storage.googleapis.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ `blocked`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "fetch('http://host.docker.internal:6080',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ `blocked` (run while `bb2dash-sync-1` is up)

The same port by literal address (ruling U2), so the answer does not rest on whether
`host.docker.internal` can be looked up from behind the firewall: Docker Desktop's address for the
host (`192.168.65.254`), this container's own gateway (read from `/proc/net/route`), and whatever
`host.docker.internal` resolves to, if it resolves at all.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "const net=require('net'),fs=require('fs'),dns=require('dns').promises;const once=(a,p)=>new Promise(r=>{const s=net.connect({host:a,port:p,timeout:5000});s.on('connect',()=>{s.destroy();r('open')});s.on('timeout',()=>{s.destroy();r('blocked')});s.on('error',()=>r('blocked'))});(async()=>{const gw=fs.readFileSync('/proc/net/route','utf8').split('\n').map(l=>l.split('\t')).filter(f=>f[1]==='00000000').map(f=>f[2].match(/../g).reverse().map(h=>parseInt(h,16)).join('.'));const named=await dns.lookup('host.docker.internal').then(r=>[r.address],()=>[]);for(const a of [...new Set(['192.168.65.254',...gw,...named])])console.log(a+':6080',await once(a,6080))})()"
```
→ `192.168.65.254:6080 blocked`, then `<the gateway>:6080 blocked` (a third line only if
`host.docker.internal` resolved to another address): every line `blocked`. That the port is
published while this runs is read, not dialled (nothing connects to the sync container):

```
docker inspect -f '{{json .NetworkSettings.Ports}} {{.State.Status}}' bb2dash-sync-1
```
→ `{"6080/tcp":[{"HostIp":"127.0.0.1","HostPort":"6080"}]} running`
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "fetch('https://api.anthropic.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ a number (any HTTP status)
```
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$(cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)"
```
→ `bb2dash-wt21_workspace-net` and nothing else

**27.** The token smoke (the PM's; one Haiku turn on Stack's plan; R19's line with this list's
prefix, `-T`, and stdin closed so the CLI does not wait on it).

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'CLAUDE_CODE_OAUTH_TOKEN="$(cat /run/secrets/claude_oauth_token)" claude -p --model haiku --tools "" --max-budget-usd 0.05 -- "Reply with the one word ok"' </dev/null; echo "exit=$?"
```
→ `ok` (`^ok\.?$`, case ignored), then `exit=0`. If it fails on the network, the missing host goes
into `HTTPS_HOSTS` in `docker/workspace/init-firewall.sh`, into 102a and into a DECISIONS row. If it
fails because the CLI cannot write under `/usr/local/share/npm-global`, say so in 102a and the one
COPY line gets `--chown=node:node` (ruling T1's exception).

**28.** Egress by literal address (ruling T1): these prove the address and port rule, not a failed
lookup. First, on the host and not in the container, that the four targets answer from this laptop.
The fourth is the pooler on 6543 (ruling U2: the claim is probed, not only stated); the program reads
the pooler's host from the secret file and prints neither it nor anything else of the file:

```
node -e "const net=require('net'),fs=require('fs');const once=(h,p)=>new Promise(r=>{const s=net.connect({host:h,port:p,timeout:6000});s.on('connect',()=>{s.destroy();r('open')});s.on('timeout',()=>{s.destroy();r('no answer')});s.on('error',()=>r('no answer'))});(async()=>{for(const [h,p] of [['1.1.1.1',443],['api.anthropic.com',80],['goultdzqcavefcgnifdy.supabase.co',80]])console.log(h+':'+p,await once(h,p));let v='not read';try{v=await once(new URL(fs.readFileSync('C:/Users/stack/.bb2dash-secrets/workspace_runner_db_url','utf8').trim()).hostname,6543)}catch{}console.log('the pooler:6543',v)})()"
```
→ four lines ending `open` (the first three as read on 2026-10-06), the last `the pooler:6543 open`

One public address that is not allowed, on 443:

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "const s=require('net').connect({host:'1.1.1.1',port:443,timeout:5000});s.on('connect',()=>{console.log('1.1.1.1:443 open');s.destroy()});s.on('timeout',()=>{console.log('1.1.1.1:443 blocked');s.destroy()});s.on('error',()=>console.log('1.1.1.1:443 blocked'))"
```
→ `1.1.1.1:443 blocked`

Every allowed address, read from the container's own pins and dialled as an address, on its own port
and on three that are not allowed:

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "const net=require('net'),fs=require('fs');const once=(a,p)=>new Promise(r=>{const s=net.connect({host:a,port:p,timeout:5000});s.on('connect',()=>{s.destroy();r('open')});s.on('timeout',()=>{s.destroy();r('blocked')});s.on('error',()=>r('blocked'))});(async()=>{for(const l of fs.readFileSync('/etc/hosts','utf8').split('\n').filter(l=>l.endsWith('# pinned by init-firewall.sh'))){const [a,n]=l.split(' ');for(const p of [443,80,5432,6543])console.log(n,a+':'+p,await once(a,p))}})()"
```
→ four lines per pin, `<name> <address>:<port> open|blocked`. `open` on exactly these: each
`api.anthropic.com` and `goultdzqcavefcgnifdy.supabase.co` address on `:443`, each pooler address on
`:5432`. Every other line `blocked`: with step 14's counts, 4 `open` and 12 `blocked`. (Port 80 on
the two HTTPS names and 6543 on the pooler answer from the host, as the host line above shows on the
day, so those `blocked` lines are the port rule at work.) The lines hold allowed addresses: in 102a
each is written as `<address>`, never as the number.

**29.** A second run of the firewall, as root, is refused, and changes nothing.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u root workspace sh -c '/app/docker/workspace/init-firewall.sh; echo $?'
```
→ one `ERROR: the firewall was already raised in this container …` line, then `75`. Then run step
26's first and fourth lines and step 28's second line again: still `blocked`, a number, and
`1.1.1.1:443 blocked`.

**30.** Ten TCP connects to each database secret's host on port 5432. It reads the host from each
secret file inside the container and prints one count per secret, never the URL.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "const net=require('net'),fs=require('fs');const once=h=>new Promise(r=>{const s=net.connect({host:h,port:5432,timeout:5000});s.on('connect',()=>{s.destroy();r(1)});s.on('timeout',()=>{s.destroy();r(0)});s.on('error',()=>r(0))});(async()=>{for(const n of ['workspace_runner_db_url','harness_database_url']){let ok=0;try{const h=new URL(fs.readFileSync('/run/secrets/'+n,'utf8').trim()).hostname;for(let i=0;i<10;i++)ok+=await once(h)}catch{ok=0}console.log(ok+'/10')}})()"
```
→ `10/10` twice (`0/10` for a file it cannot parse, and nothing else)

**31.** One `search_context` call over stdio to the rag launcher, collection `bb2dash`. It prints one
word: `ok` (a result that is not an error), `error`, `server exited` or `timeout`.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace node -e "const cp=require('child_process');const p=cp.spawn('bash',['/app/mcp-rag/mcp-rag.sh'],{stdio:['pipe','pipe','ignore']});let buf='';const send=m=>p.stdin.write(JSON.stringify(m)+'\n');const done=v=>{console.log(v);p.kill();process.exit(v==='ok'?0:1)};setTimeout(()=>done('timeout'),90000);p.on('exit',()=>done('server exited'));p.stdout.on('data',d=>{buf+=d;let i;while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line)}catch{continue}if(m.id===1){send({jsonrpc:'2.0',method:'notifications/initialized'});send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'search_context',arguments:{query:'Workspace',collection:'bb2dash'}}})}if(m.id===2)done(m.result&&(m.result.isError||false)===false?'ok':'error')}});send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'w65-check',version:'0'}}})"
```
→ `ok` (the search embedded its query with the model in `/opt/fastembed`: step 26 shows the model's
host is blocked)

**32.** Before the restart: when the firewall's marker was made, how many pins there are, and the
container's id and start time.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'stat -c "marker made at %Y" /dev/shm/bb2dash-workspace-firewall.up; grep -c "pinned by init-firewall.sh" /etc/hosts'
```
→ `marker made at <seconds>`, then the pin count (4 with step 14's counts)
```
docker inspect -f '{{.Id}} {{.State.StartedAt}}' "$(cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)"
```
→ the Workspace container's id and start time

**33.** Restart **(guard)** (ruling T1: a restart must re-raise the firewall).

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace restart workspace; echo "exit=$?"
```
→ `exit=0`. Then step 15's line → `healthy` again (re-read while `starting`).

**34.** After the restart: the marker went with it and was made anew, and the pins were rewritten.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -T -u node workspace sh -c 'stat -c "marker made at %Y" /dev/shm/bb2dash-workspace-firewall.up; grep -c "pinned by init-firewall.sh" /etc/hosts'
```
→ a later `marker made at` than step 32's, and the same pin count as step 32 (not twice it). Had
`/dev/shm` kept the marker, the second start would have been refused with 75 and the container would
not be healthy.
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace logs --no-log-prefix workspace | awk '/Firewall raised: /{raised++} /a second run is refused/{refused++} END{print raised+0, refused+0}'
```
→ `2 0` (one `Firewall raised` line per start, and no refusal in the container's own log)
```
docker inspect -f '{{.Id}} {{.State.StartedAt}}' "$(cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)"
```
→ the same id as step 32 (a restart, not a new container) and a later start time. Then step 26's
first and fourth lines and step 28's second line once more: `blocked`, a number, `1.1.1.1:443 blocked`.

**35.** Task 13: the image's filesystem into a scratch volume **(guard before)**. `w65-scan` is
created and never started, and is removed in the line that exports it. It carries the compose
labels of the image it is made from (compose stamps `com.docker.compose.project` and
`com.docker.compose.service` on an image it builds, and a container inherits its image's labels),
so for the seconds it exists a label filter on project `bb2dash-wt21` can list it; it has none of
the labels compose gives a container it starts itself (no number, no config hash), and no compose
command is run while it exists (ruling U2).

```
docker volume create w65-scan-fs && docker create --name w65-scan bb2dash-workspace:local
```
→ `w65-scan-fs`, then a container id
```
docker export w65-scan | MSYS_NO_PATHCONV=1 docker run --rm -i -v w65-scan-fs:/fs alpine:3.20 tar -x -C /fs; echo "exit=$?"; docker rm w65-scan
```
→ `exit=0`, then `w65-scan`

**36.** Task 13: no secret in the image's files. The scan reads the whole image and can take minutes:
run it in the background. `--redact` keeps a finding's value out of the output.

```
MSYS_NO_PATHCONV=1 docker run --rm -v w65-scan-fs:/fs:ro -v "C:/Users/stack/projects/bb2dash-wt-21-container/docker/gitleaks-images.toml:/work/docker/gitleaks-images.toml:ro" -w /work ghcr.io/gitleaks/gitleaks:v8.30.1 dir /fs --config docker/gitleaks-images.toml --redact; echo $?
```
→ `0`

**37.** Task 13: no secret in the image's history.

```
docker history --no-trunc bb2dash-workspace:local | MSYS_NO_PATHCONV=1 docker run --rm -i -v "C:/Users/stack/projects/bb2dash-wt-21-container/docker/gitleaks-images.toml:/work/docker/gitleaks-images.toml:ro" -w /work ghcr.io/gitleaks/gitleaks:v8.30.1 stdin --config docker/gitleaks-images.toml --redact; echo $?
```
→ `0`
```
docker history --no-trunc bb2dash-workspace:local | grep -c -E "sk-ant-|sb_secret_|eyJhbGciOi|postgres(ql)?://[^ ]*:[^ @]*@"
```
→ `0`

**38.** Task 13: the scratch volume goes **(guard after)**.

```
docker volume rm w65-scan-fs
```
→ `w65-scan-fs`

A hit under the new vendor trees (`/fs/usr/local/share/npm-global/`, the three `node_modules` under
`/fs/app/`, `/fs/opt/fastembed/`) is triaged by hand in 102a with `--verbose` added. None of them is
under the allowlist's three paths (`/fs/usr/(include|lib|share)/`, `/fs/usr/local/include/`,
`/fs/ms-playwright/`), so a hit there shows. Widening the allowlist is a DECISIONS call, not this
stream's.

**39.** When this tree is done with the test container (only one tree at a time runs it) **(guard)**.

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace stop workspace
```
```
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace rm -sf workspace
```
→ the container stopped, then removed. The network and the volume stay until the PM removes them
after acceptance step 15 (`docker network rm bb2dash-wt21_workspace-net`,
`docker volume rm bb2dash-wt21_workspace-claude-home`).

## Wave 2 — the lines' quoting, checked without docker

Run on 2026-10-06 over the 50 docker lines of the list above, read back out of this file from a shell
with `SECRETS_DIR`, `HARNESS_DIR`, `COMPOSE_PROFILES` and `MSYS_NO_PATHCONV` unset, with `docker`
standing for a native program that starts nothing and records its arguments, its folder and those
variables:

```text
calls: 61 (compose 41, of them exec 25; other docker 20); sh -c strings parsed: 12; node -e programs compiled: 9
lines with a docker call: 50 of 50
problems: 0
```

For every compose call of the test project it checked: `SECRETS_DIR` and `HARNESS_DIR` hold the two
folders and were set by the line itself; `MSYS_NO_PATHCONV=1`; `-p bb2dash-wt21 --profile workspace`;
the service is named after `build`, `up`, `exec`, `logs`, `ps`, `restart`, `stop` and `rm`; `up` has
`-d --no-deps`; every `exec` has `-T`; the call ran from the worktree. For every call: no argument
shows Git Bash's path conversion (a bare `/run/secrets/x` otherwise arrives as
`C:/Program Files/Git/run/secrets/x`, read on this laptop). Every `sh -c` string parses (`bash -n`),
every `node -e` program compiles (`node --check`) and holds no `!`, which an interactive bash expands
inside double quotes. The two lines that render the file as the desktop's sign-in task does were
checked the other way round: `HARNESS_DIR` and `COMPOSE_PROFILES` unset, `SECRETS_DIR` set.

The check can fail: three deliberately wrong lines (no prefix and a bare container path; a `!` in a
program; an `up` without the service) gave 8 problems. The two piped lines of step 7 printed their
expected text from a stand-in render. What this shows is that each line arrives as written. It does
not show what a line prints from a real container: that is the next step.

The lines of the list that do not call docker were run as they stand, from another folder, and gave
what the list says: the two test runs (11 of 11, 18 of 18), step 4's four counts (`0`, `1`, `0`,
`1`), step 5's four sizes (each above 0), step 9's commit and `0`, and step 28's host probe (three
`open`). Step 2's line was not run whole: its fetch and merge were run on their own, and its
ancestor check read `1` for the reason given above.

## Wave 2 — for the `/security-review` request (ruling T1's last bullet)

Facts from this stream the PM's request can quote:

* **The allowlist is by address, and both kinds of host serve other tenants.** The bb2dash project's
  name resolves to a CDN's edge addresses and the pooler is shared by many projects; `api.anthropic.com`
  is one address for every customer. After wave 2 an allowed address can be reached on one TCP port
  only (443 or 5432), which narrows what can be asked of it, not who answers. TLS names the peer on
  443; the rag server checks the pooler's certificate against the pinned CA; the runner's own
  connection follows its DSN's `sslmode`.
* **Docker's healthcheck runs `node /app/workspace/dist/healthcheck.js` as root every 30 s.** The
  service sets no `user:` (the entrypoint must start as root for the firewall), so a healthcheck
  process is root's, with the container's added capabilities. It reads one file's age
  (`/run/workspace/alive`, in a folder `node` owns) and runs code from a root-owned folder. The
  entrypoint's drop does not cover it.
* **Two write-capable credentials are mounted** (`bb2dash_mcp_service_key`, `harness_database_url`),
  each read by one MCP server process; and `workspace_runner_db_url` and `claude_oauth_token` by the
  runner. `node` can read all four files: the fence is the tool gate and the read-only tools, not
  file permissions.
* **Two clauses no container check exercises**, both held by the dry-run test only: IPv6 when
  `ip6tables` cannot set its rules (the test "IPv6 (T1 d)" and the long-list test), and a DSN host
  that does not end `.pooler.supabase.com` (the test "a database secret that is not a pooler URL").
* **DNS after the firewall is up.** Rules allow DNS only to the resolvers in `/etc/resolv.conf`
  (Docker's `127.0.0.11`). A name that is not pinned cannot be resolved from inside the container if
  Docker forwards the query from the container's own network namespace, which is what the by-name
  probes of step 26 would then show as `blocked`; the literal probes of step 28 do not depend on it.
* The pg_net reach is W-63's and the PM's to word; nothing in this stream touches it.

## Wave 2 — questions for the PM

1. **A new file beyond the Files table: `docker/workspace/init-firewall.test.mjs`.** The ruling asks
   for the dry-run harness to be extended and its run quoted, and the wave's rule asks for a test
   committed failing before the fix; a scratch script cannot be committed failing. It sits in W-65's
   folder, the image does not copy it, and `grep-clean` does not scan it. The Files table wants one
   row for it, or it goes back to scratch.
2. **The CLI is installed in a stage of its own and copied** (above, "The image"). The recipe and the
   ruling's `chown -R root:root /usr/local/share/npm-global` are both in the Dockerfile to the
   letter; the stage is the one thing not asked for. It keeps a 246 MB binary from being stored a
   second time by the chown. Step 11 records the layer's size. If the PM wants the plain form (the
   chown as one more `RUN` of the runtime stage), it is a six-line change and an image about that
   much larger.
3. **A DSN on a port other than 5432 is not refused at the start** (choice 3 above). The ruling
   names the ports, not a check of the DSN's own. One word and `dsn_host` refuses it with a fixed
   sentence.
4. **bb2dash-stack still says "this repo's secrets/ folder" in three places the ruling did not
   name**, so they were left: `.env.example` (its header line "Secrets are files in secrets/" and the
   comment and placeholder over `SECRETS_DIR=/path/to/bb2dash-stack/secrets`), the doctor's message
   for an unset `SECRETS_DIR` (`doctor/lib/checks-host.mjs`, `secretsDirOf`: "set it in .env to this
   repo's secrets/ folder, absolute"; that file is W-65's for one comment only), and the justfile's
   fallback to `justfile_directory() / "secrets"` with its comment. The README now says the fallback
   exists and is not for real secrets.
5. **The `secrets` row still wants `workspace_runner_db_url` when the profile is off** (all 12, as
   the brief's check (a) reads and as it does for the dev container's tokens). Only the Workspace row
   follows the profile, which is what the ruling says. With the profile off and that file missing,
   `just doctor` shows one problem row, `secrets`.
6. **With the profile off the Workspace row asks Docker nothing**, so a container left running after
   the line is taken out of `.env` still reads `off`. The README tells Stack to stop it
   (`docker compose stop workspace`) when he takes the line out.
7. **`grep-clean` stays at 11 tests.** Wave 2's three rules are assertions inside the existing
   Dockerfile test, so the count the ruling names did not move.

(Answered by rulings U2 on 2026-10-06: 1 and 2 accepted, 3 a refusal at the start, 4 corrected where
it is a comment or a message, 5 and 6 accepted for v1. See "Wave 2b".)

## Wave 2b (2026-10-06) — ruling U2, then the docker step (ruling U4)

First step of the wave: `git fetch origin`, `git merge --no-edit origin/feat/workspace-21` into
`feat/workspace-21-container` (no conflict; the phase branch was at `37f46cf`), pushed as `c7832ec`.
bb2dash-stack needed no merge.

### A. Ruling U2 (files only)

| U2 item | what changed | where | red → green |
|---|---|---|---|
| a DSN whose port is not 5432 is refused at the start | `dsn_host` refuses it with the fixed sentence `its port is not 5432`; nothing of the value is printed | `docker/workspace/init-firewall.sh` | `af314fe`, `757b649` → `4dd15e3` |
| the header says exactly what the script prints | a "What it prints" paragraph, held by a test that also reads a start's log | `docker/workspace/init-firewall.sh` | the same three commits |
| bb2dash-stack wording, `secrets/` → `SECRETS_DIR` | comments and one message; no behaviour | bb2dash-stack `compose.yaml`, `.env.example`, `doctor/lib/checks-host.mjs` | `f858c0e` → `80f6796` |
| the paste-ready list, four corrections | below | this file | `b4c33a2` (docs) |

**The port check.** RED, the tests before the code (`af314fe`):

```text
node --test docker/workspace/init-firewall.test.mjs
✖ a database secret on a port other than 5432 stops the start at deny-all, and nothing of it is printed (U2)
    AssertionError: The host of workspace_runner_db_url ends .pooler.supabase.com … Firewall raised …
    actual: 0,   expected: 1
✖ the header says what a start prints, and a start prints no more: names and the resolver, never an address of an allowed host (U2)
    AssertionError: the header has its "What it prints" paragraph
✖ dsn_host: a pooler URL gives its host, anything else is refused with a fixed sentence
    AssertionError: <the test's fake pooler URL, on port 6543>
    actual: '0',   expected: '1'
ℹ tests 20
ℹ pass 17
ℹ fail 3
```

The first failure is the wave 2a script doing what choice 3 said: a secret on 6543 started, and the
firewall was raised. One more test commit (`757b649`, still red) changed one expected sentence of the
header test before any code: the first wording said the script never prints "any part" of a
connection string, and a pooler's host name is a part of one.

GREEN (`4dd15e3`):

```text
node --test docker/workspace/init-firewall.test.mjs
ℹ tests 20
ℹ pass 20
ℹ fail 0
node --test docker/grep-clean.test.mjs
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

What the rule is, in words:

* A URL that names a port other than 5432 stops the start, before any rule is touched, at deny-all,
  with `<secret name>: its port is not 5432`. The text after the first colon of the host part is
  compared as text, so `6543`, `54329`, `05432`, a colon with nothing after it and `5432:6543` are
  all refused. The test reads that neither the port nor the host of a refused secret is printed.
* **A URL that names no port is accepted**: it means 5432, Postgres's default, which both clients
  use and which is the one port the pooler's addresses are allowed on. Wave 2a's test already held
  three such URLs as allowed, and the runner's own config (`workspace/src/config.ts`) accepts them
  too. If the PM wants an explicit `:5432` required, it is one condition in `dsn_host`.
* **The header's paragraph is what the script prints, which is one thing more than the ruling's
  short form** ("the fixed host names and each validated pooler host name, never a user, password,
  URL or address"): the line `Allowing DNS to <resolver>` prints the address of each resolver in
  `/etc/resolv.conf` (Docker's own, `127.0.0.11`), and the end check prints its two fixed URLs
  (`https://example.com`, `https://api.anthropic.com`). The header says so, and says what never
  shows: a user, a password, a database name, a query string, a whole connection string, anything of
  a refused secret but its name, and the address of an allowed host. The test holds it: in a
  working start's log the only IPv4 address is the resolver's. The script's output was not changed.

**bb2dash-stack.** RED (`f858c0e`):

```text
node --test doctor/workspace.test.mjs doctor/doctor.test.mjs
✖ compose.yaml, .env.example and the doctor say the secrets live in the folder SECRETS_DIR names, outside every repo (bb2dash rulings U2)
    AssertionError: compose.yaml, the header
ℹ tests 52
ℹ pass 51
ℹ fail 1
```

GREEN (`80f6796`): `tests 52`, `pass 52`, `fail 0`; the three other test files that read
`compose.yaml`, `.env.example` or the README: 32 of 32.

* `compose.yaml`: the header (where `just` gets `SECRETS_DIR`, where the secrets live, what the
  `./secrets` fallback is for), the `secrets` line of the header's list, one comment over the
  secrets block, and the dev container's comment ("Any secrets/ folder in it"). No line of YAML
  changed: the twelve `file: ${SECRETS_DIR:-./secrets}/<name>` lines are as they were, and the test
  reads one of them.
* `.env.example`: the header line and the comment over `SECRETS_DIR`; the placeholder is
  `/path/to/a-folder-outside-every-repo` (it was `/path/to/bb2dash-stack/secrets`). It is still an
  absolute placeholder, which `doctor.test.mjs` asserts.
* `doctor/lib/checks-host.mjs`: the message for an unset `SECRETS_DIR` reads `SECRETS_DIR is not
  set: set it in .env to the folder that holds the secret files, outside every repo, absolute`
  (its first words are unchanged: `doctor.test.mjs` reads them), and the function's comment.
* The `justfile` is untouched. Its comment already says the secrets live outside every repo
  (DECISIONS 2026-10-03) and that the repo folder is what an unset `SECRETS_DIR` falls back to.

**The list's four corrections** (`b4c33a2`): step 11 reads `docker history --no-trunc`; step 35's
note says the scan container carries the image's compose labels and is never started; step 26 gains
a literal-address probe of port 6080 (Docker Desktop's host address, the container's own gateway,
and whatever `host.docker.internal` resolves to) and a read, not a dial, of the sync container's
published port; step 28's host line probes the pooler on 6543 (it reads the host from the secret
file and prints nothing of it). Step 3's expected count is 20. The two new programs compile
(`node --check`) and hold no `!`, `$`, backtick or double quote.

### B. The docker step (tasks 12 and 13): stopped at step 10, the build

**The image did not build, so no container was started and no check of task 12 or 13 that needs
the image was run.** Steps 1 to 9 of the list passed. Step 10 failed in the `rag` stage: the
embedding model's download address answers 403 to an anonymous caller (read from this laptop on
2026-10-06, outside docker too), so the bake the Contract describes cannot work today. It is not the
firewall, not Docker, not memory, and not this branch's code. Nothing was retried, no other way round was
tried in docker, and the choice is the PM's ("Questions for the PM, wave 2b", below).

**The guard**, `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1`:

| when (2026-10-06, UTC) | output |
|---|---|
| 20:18:54, before anything of the wave touched docker | `bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z` |
| 20:24:29, step 1, before the first docker step | the same |
| 20:27:07, after step 10 (the failed build) | the same |
| 20:29:39, after reading what the failed build left | the same |
| 20:40:49, the last read of the wave | the same |

At that last read `docker compose -p bb2dash-wt21 --profile workspace ps --all workspace` printed its
header and no row, and `docker ps -a` listed the same five containers as before the build.

No refusal: the session ran every docker line it was given.

**Before the build** (read-only): `docker ps -a` listed five containers, none of project
`bb2dash-wt21` (`bb2dash-sync-1` up 22 hours and healthy, `bb2dash-harness-jobs-1`,
`harness-postgres` and two `bb2dash-mcp:local` containers with Docker's own names). The daemon has
12.5 GB; the laptop had 7.8 GB of 31.9 GB free. Docker 29.8.1, Compose v5.5.1.

**Steps 1 to 9, as run** (each line is the list's, unchanged):

| step | what | output | |
|---|---|---|---|
| 1 | the guard | above | pass |
| 2 | fetch, merge, the runner is in the tree | `Already up to date.` · `runner merged: 0` · `2` (also `0` against `origin/feat/workspace-21-runner`, `95b04b6`; HEAD `b4c33a2`) | pass |
| 3 | `grep-clean` | `tests 11` · `pass 11` · `fail 0` | pass |
| 3 | the firewall's dry run | `tests 20` · `pass 20` · `fail 0` | pass |
| 4 | the Dockerfile's and the service's literals | `0` · `1` · `0` · `1` | pass |
| 5 | the four secret files, sizes only | `169` · `108` · `41` · `109` bytes, each above 0 | pass |
| 6 | compose with only the Windows user variables | `exit=0`; services: `sync` and nothing else | pass |
| 7 | the service as rendered for the test project | `true true linux/amd64 workspace-net workspace 30s` | pass |
| 7 | its environment | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 CLAUDE_CONFIG_DIR=/home/node/.claude DISABLE_AUTOUPDATER=1 ENABLE_TOOL_SEARCH=false WORKSPACE_TURN_BUDGET_USD=1.00` | pass |
| 8 | the `sync` service's hash, rendered and on the live container | `sync 448f155ac0209cc0a233a9d09653fd02ebb3eda51fc84ec02ff9a5341ac7e6e7` · the same hash | pass |
| 9 | the harness commit, and nothing uncommitted under `mcp-server` or `certs` | `e7997f3e3ddc402a3c8f535d3b926bbd61d6adbd` (branch `main`) · `0` | pass |

Task 12's compose config check (its check (d), the part that needs no container) is steps 6 to 8:
pass.

**Step 10, the build** (one build, in the background, 20:26:01 to 20:26:38 UTC):

```text
cd /c/Users/stack/projects/bb2dash-wt-21-container && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace build workspace; echo "exit=$?"
exit=1
```

What finished before it stopped (BuildKit's own step numbers and times):

```text
#20 [runner 4/7] RUN npm ci --no-audit --no-fund                                       DONE 5.7s
#25 [runner 7/7] RUN npm run build && npm prune --omit=dev --no-audit --no-fund         DONE 4.9s
#18 [materials 4/7] RUN npm ci --no-audit --no-fund                                    DONE 10.7s
#28 [materials 7/7] RUN npm run build && npm prune --omit=dev --no-audit --no-fund      DONE 4.1s
#24 [cli 3/4] RUN npm install -g "@anthropic-ai/claude-code@2.1.289"                   DONE 14.7s
#29 [cli 4/4] RUN chown -R root:root /usr/local/share/npm-global                       DONE 1.4s
#23 [rag 4/7] RUN npm ci --no-audit --no-fund                                          DONE 16.6s
#13 [stage-4 2/21] RUN apt-get update && apt-get install …                             CANCELED
```

So the runner, the materials server and the pinned CLI build as written, from W-64's package as
merged. The step that failed:

```text
#32 [rag 7/7] RUN npm run build && FASTEMBED_CACHE_DIR=/opt/fastembed node scripts/verify-embedder.mjs && npm prune … && chmod -R u=rwX,go=rX /opt/fastembed
#32 0.333 > @agentic-harness/rag-mcp-server@0.1.0 build
#32 0.333 > tsc -p tsconfig.json
#32 1.611 model:      BAAI/bge-small-en-v1.5
#32 1.611 expected:   384 dimensions
#32 1.611 cache dir:  /opt/fastembed
#32 1.611 First run downloads ~130 MB from Hugging Face.
#32 1.755 FAILED
#32 1.756 EmbeddingError: Failed to load embedding model BAAI/bge-small-en-v1.5.
#32 1.756   [cause]: Error: TAR_BAD_ARCHIVE: Unrecognized archive format
#32 1.756     file: '/opt/fastembed/fast-bge-small-en-v1.5.tar.gz',
#32 ERROR: process "/bin/sh -c npm run build && FASTEMBED_CACHE_DIR=/opt/fastembed node scripts/verify-embedder.mjs && …" did not complete successfully: exit code: 1
```

The harness's `tsc` passed; the model step failed 0.14 s after it began, which is not a download of
130 MB.

**The cause, read outside docker** (20:27 to 20:40 UTC; reads only, and one scratch install):

* The harness rag server is on `fastembed` 2.1.0 (its `package-lock.json`; `npm ci` installs exactly
  that). 2.1.0 fetches a dense model from one fixed address and does not look at the answer's
  status (`node_modules/fastembed/lib/cjs/fastembed.js`, `downloadFileFromGCS`: the body is piped
  into the `.tar.gz` file whatever it is, then unpacked):
  `https://storage.googleapis.com/qdrant-fastembed/fast-bge-small-en-v1.5.tar.gz`.
* That address answers 403 from this laptop, with no docker in the way:

  ```text
  curl -s -o /dev/null -w "%{http_code}\n" https://storage.googleapis.com/qdrant-fastembed/fast-bge-small-en-v1.5.tar.gz
  403
  <Error><Code>AccessDenied</Code><Message>Access denied.</Message><Details>Anonymous caller does not have
  storage.objects.get access to the Google Cloud Storage object. … (or it may not exist).</Details></Error>
  ```

  The same with a browser's user agent, with and without a range; the bucket's own listing is 403
  too. The 399-byte XML is what was written to `fast-bge-small-en-v1.5.tar.gz`: hence
  `TAR_BAD_ARCHIVE`.
* The library's author moved the download: `fastembed` 2.1.1 (published 2026-09-30; 3.0.0 on
  2026-09-24) fetches dense models from Hugging Face, this one from `Qdrant/bge-small-en-v1.5-onnx-Q`
  (read in the two packages' `lib/cjs/fastembed.js`, unpacked in scratch; neither holds the
  `storage.googleapis.com` address any more).
* Stack's host still answers searches because it has the model on disk already
  (`agentic-harness/mcp-server/.fastembed-cache/fast-bge-small-en-v1.5/`, 2026-09-28), and the live
  `harness-jobs` container has a `fastembed-cache` volume (not read here). **Any first download with the harness
  as it is fails the same way**: a new machine, the dev container's `npm run verify:embedder`, or
  `harness-jobs` if its volume is ever lost. That is the harness's, not this phase's, and it is in
  the report for Stack.

**What a fix would bake, measured in scratch** (no docker, no file of either repo changed; the
harness checkout's `git status` read the same two untracked files before and after):

| | the file | bytes | sha256 |
|---|---|---|---|
| what the host's rag server reads today (2.1.0, from the closed address) | `fast-bge-small-en-v1.5/model_optimized.onnx` | 132,883,455 | `20e3bd67…6b2e` |
| what 2.1.1 downloads from Hugging Face | `Qdrant_bge-small-en-v1.5-onnx-Q/model_optimized.onnx` | 66,465,124 | `51f1bd0a…2431` (the scratch download, and Hugging Face's own `X-Linked-ETag`) |

They are two different files. The second is, byte for byte, the file in the harness's Python
ingestion cache (`~/.cache/fastembed/models--qdrant--bge-small-en-v1.5-onnx-q/…/model_optimized.onnx`:
the same sha256), and the harness's own docs record the two routes as measured equal on 2026-09-09
(`CONTEXT.md`, `docs/embeddings.md`: cosine 0.99999975 to 0.99999985). Measured again here: the five
build inputs the Dockerfile's `rag` stage copies (`package.json`, `package-lock.json`,
`tsconfig.json`, `src/`, `scripts/`) were copied to scratch, `npm ci`, then
`npm install fastembed@2.1.1`, `npm run build`, and the stage's own bake line:

```text
FASTEMBED_CACHE_DIR=<scratch>/cache node scripts/verify-embedder.mjs
model:      BAAI/bge-small-en-v1.5
expected:   384 dimensions
"What did we decide about the ledger cash invariant?"   dims 384   L2 1.000000
"pgvector HNSW index configuration"                      dims 384   L2 1.000000
OK — embedder matches the ingestion contract.
exit 0
```

and three sentences embedded twice, once by the harness's installed 2.1.0 reading its own cache,
once by 2.1.1 reading the Hugging Face files:

```text
sentence 1 cosine 0.99999977 maxAbsDiff 1.83e-4
sentence 2 cosine 0.99999964 maxAbsDiff 3.55e-4
sentence 3 cosine 0.99999981 maxAbsDiff 1.74e-4
```

So with 2.1.1 the harness's source builds unchanged, its embedder check passes, and its vectors
agree with today's to six decimal places. 2.1.1 keeps its files under
`<cache>/Qdrant_bge-small-en-v1.5-onnx-Q/` and skips a file that is already there
(`retrieveModel`: "Files already present are skipped"), so a baked model should need no network at
run time; step 31 of the list is what proves that behind the firewall. No file of the Workspace
names the model's folder (`docker/workspace/mcp-rag.sh` and the Dockerfile name `/opt/fastembed`
only), so **after such a bump in the harness this branch needs no change**: the same step 10 line
would bake the Hugging Face model. This is evidence for a ruling, not a change: W-65 edits nothing
in the harness.

**What the failed build left** (read at 20:29 UTC):

```text
docker images | grep workspace                                                   → nothing: no bb2dash-workspace:local
docker ps -a --filter label=com.docker.compose.project=bb2dash-wt21              → nothing
docker network ls --filter name=bb2dash-wt21 · docker volume ls --filter name=bb2dash-wt21   → nothing, nothing
```

Build cache only (the finished stages; a second build reuses them). No container, network or volume
of the test project exists, no scan container or scan volume was made, and nothing was pruned.

**Steps 11 to 39: not run.** Each needs the image.

| task 12 check | list steps | result |
|---|---|---|
| `grep-clean`, the firewall's dry run (a) | 3 | pass |
| the Dockerfile's literals; compose resolves; `sync` only without the profile; the rendered service; the `sync` hash (d) | 4, 6, 7, 8 | pass |
| the build, with the harness commit and the image's id and size | 9, 10, 11 | **fail**: step 10, the model's download address answers 403. Harness commit at build time `e7997f3e3ddc402a3c8f535d3b926bbd61d6adbd`. No image, so no id and no size |
| `up`, what it made, the firewall's log, healthy | 12 to 15 | not run |
| `claude --version` equals the pin; the help grep | 16 | not run (the `cli` stage did install `@anthropic-ai/claude-code@2.1.289`, and the chown ran) |
| processes run as `node`; the runner's capabilities | 17, 18 | not run |
| `printenv ANTHROPIC_API_KEY` exits 1; `DATABASE_URL`; the four settings | 19 | not run (the rendered environment of step 7 holds neither name) |
| no published ports | 7, and 26's network read | rendered: pass (`ports` undefined); on a running container: not run |
| the in-image layout; root's files; the CLI's folder | 20 to 22 | not run |
| the pins, the rules and the sets | 23, 24 | not run |
| the gate wiring: the hook command from the image's `settings.json`, exit 2 | 25 | not run |
| the firewall probes by name; `api.anthropic.com` answers | 26 | not run |
| the firewall probes by literal address | 26 (6080), 28 | not run |
| a second run of the firewall is refused | 29 | not run |
| ten connects to each database host; one `search_context` over stdio | 30, 31 | not run |
| the restart: healthy again, the marker gone, the pins rewritten | 32 to 34 | not run |
| the token smoke (one Haiku turn) | 27 | not run: no turn was spent |

| task 13 check | list steps | result |
|---|---|---|
| the exported filesystem scanned with gitleaks and the repo's config | 35, 36 | not run |
| the history scanned with gitleaks; the brief's grep | 37 | not run |
| triage of hits | | nothing to triage |

**The firewall has still not met a kernel.** Everything this file says about it rests on the dry
run against fake tools (20 of 20).

### Questions for the PM, wave 2b

1. **The image cannot be built until the model has a source that answers.** Three ways, the first
   recommended:
   * **(a) The harness moves to `fastembed` 2.1.1** (one dependency, its lock file; a harness PR,
     not W-65's). Evidence above: it builds unchanged, its embedder check passes, the vectors agree
     with today's to six decimal places, and the file is the one Python ingestion already uses. This
     branch then needs no change; the build bakes whatever the harness checkout holds, and the new
     harness commit goes into 102a at build time. It also repairs every first download of the
     harness itself. The Contract's sentence stays true as written (the model is baked by loading
     the built server's embedder once).
   * **(b) Bake the host's copy**: a third named build context on
     `${HARNESS_DIR}/mcp-server/.fastembed-cache` and one `COPY`. It is byte for byte what the host
     reads today, and it needs no harness change, but the Contract says the stage never copies the
     host's `.fastembed-cache`, the image then builds only on a machine that already has the model,
     and `compose.yaml`, the Dockerfile and `grep-clean` all change.
   * **(c) Wait** for the address to come back. Nothing suggests it will: the library's author
     moved off it a week ago.
2. **A URL with no port is accepted by the new port check** (it means 5432). One condition makes an
   explicit `:5432` required, if the PM reads "refused" that way.
3. **The header's paragraph lists one address and two URLs** the ruling's short form leaves out: the
   resolver's own address (`Allowing DNS to 127.0.0.11`) and the end check's two fixed URLs. The
   script's output was not changed to fit the sentence; the sentence was written to fit the output.
   If the resolver's address should not be printed, it is one `echo`.
4. **`.env.example`'s placeholder changed** (`/path/to/a-folder-outside-every-repo`): a value in an
   example file, not a comment. It is the line a new machine copies, and it pointed inside the repo.
5. **When the build passes, the list runs from step 10 as written.** The finished stages are in
   Docker's build cache, so the second build is short. Nothing in steps 11 to 39 was changed by what
   was found here.
