# Phase 21 — W-65 (container stream) verification

Brief: `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md` (frozen 2026-10-05) · Tasks 12, 13, 14 ·
bb2dash branch `feat/workspace-21-container` (worktree `bb2dash-wt-21-container`) · bb2dash-stack branch
`feat/workspace-21` (worktree `bb2dash-stack-wt-21`) · Written 2026-10-05, wave 1.

**Wave 1 is files and read-only checks only.** No `docker build`, `up`, `run`, `exec`, `stop` or `rm`
was run by this stream, and no `just` verb. The image has not been built, so nothing below proves that
the image builds or that the firewall works in a kernel. What wave 1 does prove is listed per task;
what waits for wave 2 is written out as paste-ready lines.

| task | wave 1 | waits for wave 2 |
|---|---|---|
| 12 | every file written; compose resolves; the `sync` service is unchanged; `grep-clean` 10 of 11 | the eleventh `grep-clean` test (needs W-64's `workspace/`), the build, every container check, the token smoke (PM) |
| 13 | the scan lines written | the scan itself (needs the image) |
| 14 | done: 46 of 46, every file check | nothing |

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

### Wave 2: the paste-ready lines (Git Bash)

**Every line below is a Git Bash line**, run from `C:/Users/stack/projects/bb2dash-wt-21-container`. A
container path that is its own argument is inside `sh -c '…'` or the line carries `MSYS_NO_PATHCONV=1`
(read on this laptop: Git Bash leaves `sh -c '/app/…; echo $?'` alone and rewrites a bare `/run/secrets/x`
to `C:/Program Files/Git/run/secrets/x`). The project is `bb2dash-wt21` and the service is named in every
compose command. Never `just up`, never an `up` without the service name. `-T` may be added after
`exec` on any line; it only turns the pseudo-terminal off.

None of these lines has been run. Their quoting has: each of the 23 `exec` lines below was read back
out of this file in Git Bash with `docker` replaced by a shell function that runs nothing in any
container, and what the container would be handed was checked (every `sh -c` string parses under
`sh -n`; every `node -e` program passes `node --check`, the two long ones included). That shows a line
arrives as written. It does not show what it prints.

Read the guard before and after every step and paste it here:

```
docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
```

**0. Before any docker step** (after the PM has merged the runner branch into the phase branch, and
Stack has run task 19's snippet):

```
cd /c/Users/stack/projects/bb2dash-wt-21-container && git fetch origin && git merge --no-edit origin/feat/workspace-21
```
```
git merge-base --is-ancestor feat/workspace-21-runner HEAD; echo $?
```
→ `0`
```
git ls-files workspace/src/runner.ts docker/workspace/Dockerfile | wc -l
```
→ `2`
```
node -e "console.log(Object.keys(require('./workspace/package.json').scripts||{}).includes('build'))"
```
→ `true` (the Dockerfile runs `npm run build` in `workspace/`)
```
stat -c %s /c/Users/stack/.bb2dash-secrets/workspace_runner_db_url
```
→ above 0 (the size only; nobody prints the file)
```
node --test docker/grep-clean.test.mjs
```
→ `pass 11`, `fail 0` (check (a))
```
grep -c -E "CLAUDE_CODE_VERSION=latest|bb2dash-mcp:local" docker/workspace/Dockerfile
```
→ `0`
```
env -u HARNESS_DIR -u COMPOSE_PROFILES docker compose -f compose.yaml config --quiet; echo $?
```
→ `0`
```
env -u HARNESS_DIR -u COMPOSE_PROFILES docker compose -f compose.yaml config --services
```
→ `sync`
```
docker compose -f compose.yaml config --hash sync; docker inspect -f '{{ index .Config.Labels "com.docker.compose.config-hash" }}' bb2dash-sync-1
```
→ the same hash twice (wave 1: `448f155a…e6e7`)

**1. Build** (the harness commit is written here at build time):

```
export HARNESS_DIR=C:/Users/stack/agentic-harness
```
```
git -C "$HARNESS_DIR" rev-parse HEAD; git -C "$HARNESS_DIR" status --short -- mcp-server certs | wc -l
```
→ the commit (wave 1 read `e7997f3e3ddc402a3c8f535d3b926bbd61d6adbd`), then `0` (nothing uncommitted is baked)
```
docker compose -p bb2dash-wt21 --profile workspace build workspace; echo "exit=$?"
```
→ `exit=0`. The build downloads the base image, three `npm ci` sets, the CLI and the embedding model
(about 130 MB): run it in the background, it will outlast a short tool call.
```
docker images bb2dash-workspace:local --format '{{.ID}} {{.Size}}'
```

**2. Start**

```
docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace; echo "exit=$?"
```
→ `exit=0`
```
docker network ls --filter name=bb2dash-wt21 --format '{{.Name}}'; docker volume ls --filter name=bb2dash-wt21 --format '{{.Name}}'
```
→ `bb2dash-wt21_workspace-net` and `bb2dash-wt21_workspace-claude-home`, and nothing else
```
docker compose -p bb2dash-wt21 --profile workspace logs --no-log-prefix workspace | grep -E "host of|Allowing DNS|Allowed |IPv6|Firewall"
```
→ the firewall's lines, ending `Firewall raised: 3 name(s) allowed` (4 if the two DSNs name different
poolers). W-65's own line: it shows which IPv6 branch ran.
```
docker inspect -f '{{.State.Health.Status}}' $(docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)
```
→ `healthy` (re-read every 10 s while it says `starting`; `unhealthy` is the failing result)

**3. The brief's container checks, as the brief writes them**

```
docker compose -p bb2dash-wt21 --profile workspace config --format json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const w=JSON.parse(s).services.workspace;console.log([w.ports===undefined,w.init,w.platform,Object.keys(w.networks).join(),w.profiles.join(),w.stop_grace_period].join(' '))})"
```
→ `true true linux/amd64 workspace-net workspace 30s`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace claude --version
```
→ `2.1.289 (Claude Code)`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c "claude --help | grep -c -E -- '^  --(tools|permission-prompts|strict-mcp-config|setting-sources|system-prompt-snapshot|include-hook-events) '"
```
→ `6`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c "ps -o user=,args= -C node,claude | grep -v healthcheck.js | awk '{print \$1}' | sort -u"
```
→ `node`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace printenv ANTHROPIC_API_KEY; echo "exit=$?"
```
→ `exit=1`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace printenv DATABASE_URL; echo "exit=$?"
```
→ `exit=1`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace printenv ENABLE_TOOL_SEARCH
```
→ `false`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace printenv CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
```
→ `1`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace printenv CLAUDE_CONFIG_DIR
```
→ `/home/node/.claude`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "const c=require('/app/workspace/claude/settings.json').hooks.PreToolUse[0].hooks[0].command;const r=require('child_process').spawnSync(c,{shell:true,input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'mcp__rag__search_context',tool_input:{query:'x',collection:'estac'}})});console.log(c,r.status)"
```
→ `node /app/workspace/dist/hooks/tool-gate.js 2`

The token smoke is the PM's, run right after the health check (one Haiku turn on Stack's plan):

```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'CLAUDE_CODE_OAUTH_TOKEN="$(cat /run/secrets/claude_oauth_token)" claude -p --model haiku --tools "" --max-budget-usd 0.05 -- "Reply with the one word ok"'
```
→ exit 0 and `ok` (`^ok\.?$`, case ignored). If it fails on the network, the missing host goes into
`ALLOWED_HOSTS` in `docker/workspace/init-firewall.sh`, into 102a and into a DECISIONS row.

**4. Egress (check (e))**

```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ `blocked`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "fetch('https://storage.googleapis.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ `blocked`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "fetch('http://host.docker.internal:6080',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ `blocked` (run while `bb2dash-sync-1` is up)
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "fetch('https://api.anthropic.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"
```
→ a number (any HTTP status)
```
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' $(docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)
```
→ `bb2dash-wt21_workspace-net` and nothing else

A second run of the firewall, as root, is refused (the in-image path is
`/app/docker/workspace/init-firewall.sh`):

```
MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -u root workspace sh -c '/app/docker/workspace/init-firewall.sh; echo $?'
```
→ one `ERROR: the firewall was already raised in this container …` line, then `75`. Afterwards the
`https://example.com` line above still → `blocked` and the `https://api.anthropic.com` line still → a
number.

**5. The two lines the brief leaves to W-65** (the PM reads both before they run; neither prints a DSN)

Ten TCP connects to each DSN secret's host on port 5432. It reads the host from each secret file inside
the container and prints one count per secret, `workspace_runner_db_url` first; on a file it cannot
parse it prints `0/10` and nothing else:

```
MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'node -e "const net=require(\"net\"),fs=require(\"fs\");const once=h=>new Promise(r=>{const s=net.connect({host:h,port:5432,timeout:5000});s.on(\"connect\",()=>{s.destroy();r(1)});s.on(\"timeout\",()=>{s.destroy();r(0)});s.on(\"error\",()=>r(0))});(async()=>{for(const n of [\"workspace_runner_db_url\",\"harness_database_url\"]){let ok=0;try{const h=new URL(fs.readFileSync(\"/run/secrets/\"+n,\"utf8\").trim()).hostname;for(let i=0;i<10;i++)ok+=await once(h)}catch{ok=0}console.log(ok+\"/10\")}})()"'
```
→ `10/10` twice

One `search_context` call over stdio to the launcher, collection `bb2dash`. It starts
`bash /app/mcp-rag/mcp-rag.sh`, sends `initialize`, then `tools/call`, throws the server's stderr away
and prints one word: `ok` (a result that is not an error), `error`, `server exited` or `timeout`:

```
MSYS_NO_PATHCONV=1 docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'node -e "const cp=require(\"child_process\");const p=cp.spawn(\"bash\",[\"/app/mcp-rag/mcp-rag.sh\"],{stdio:[\"pipe\",\"pipe\",\"ignore\"]});let buf=\"\";const send=m=>p.stdin.write(JSON.stringify(m)+\"\n\");const done=v=>{console.log(v);p.kill();process.exit(v===\"ok\"?0:1)};setTimeout(()=>done(\"timeout\"),90000);p.on(\"exit\",()=>done(\"server exited\"));p.stdout.on(\"data\",d=>{buf+=d;let i;while((i=buf.indexOf(\"\n\"))>=0){const line=buf.slice(0,i);buf=buf.slice(i+1);let m;try{m=JSON.parse(line)}catch{continue}if(m.id===1){send({jsonrpc:\"2.0\",method:\"notifications/initialized\"});send({jsonrpc:\"2.0\",id:2,method:\"tools/call\",params:{name:\"search_context\",arguments:{query:\"Workspace\",collection:\"bb2dash\"}}})}if(m.id===2)done(m.result&&!m.result.isError?\"ok\":\"error\")}});send({jsonrpc:\"2.0\",id:1,method:\"initialize\",params:{protocolVersion:\"2024-11-05\",capabilities:{},clientInfo:{name:\"w65-check\",version:\"0\"}}})"'
```
→ `ok` (the search embedded its query with the model in `/opt/fastembed`: the firewall refuses the
model's host, as the `storage.googleapis.com` line shows)

**6. W-65's own extra lines** (not in the brief; each is a read)

```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'ls /app/workspace/dist/runner.js /app/workspace/dist/healthcheck.js /app/workspace/dist/hooks/tool-gate.js /app/workspace/claude/settings.json /app/workspace/prompts/system.md /app/workspace/package.json /app/mcp-materials/package.json /app/mcp-materials/dist/index.js /app/mcp-rag/package.json /app/mcp-rag/dist/index.js /app/mcp-rag/certs/prod-ca.crt /app/mcp-rag/mcp-rag.sh | wc -l; ls -d /app/workspace/node_modules /app/mcp-materials/node_modules /app/mcp-rag/node_modules /opt/fastembed | wc -l'
```
→ `12`, then `4` (the frozen in-image layout)
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'stat -c "%U %a %n" /home/node/.claude /app/turn /run/workspace'
```
→ `node` owns all three; `/run/workspace` is `700`
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'grep -E "^Cap(Inh|Prm|Eff|Bnd|Amb)" /proc/$(pgrep -o -f dist/runner.js)/status'
```
→ five lines, each `0000000000000000` (the runner holds no capability and can regain none)
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'for f in /etc/hosts /app/docker/workspace/init-firewall.sh /app/docker/workspace/entrypoint.sh /app/workspace/dist/runner.js /app/mcp-rag/mcp-rag.sh /opt/fastembed; do test -w "$f" && echo "WRITABLE $f"; done; echo done'
```
→ `done` alone (`node` can write none of them)
```
docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'grep -c "pinned by init-firewall.sh" /etc/hosts'
```
→ 3 or more
```
docker compose -p bb2dash-wt21 --profile workspace exec -u root workspace sh -c 'iptables -S; ip6tables -S; ipset list workspace-allowed | grep -c -E "^[0-9]"'
```
→ policies `DROP` on INPUT, FORWARD and OUTPUT in both families; the OUTPUT rules in the order of the
dry run above; the count equals the number of pins

**7. Stop and remove** (when the tree is done with the test container; named resources only):

```
docker compose -p bb2dash-wt21 --profile workspace stop workspace
```
```
docker compose -p bb2dash-wt21 --profile workspace rm -sf workspace
```

The network and the volume stay until the PM removes them after acceptance step 15
(`docker network rm bb2dash-wt21_workspace-net`, `docker volume rm bb2dash-wt21_workspace-claude-home`).

## Task 13 — no secret in the image (wave 2: the lines)

Nothing was scanned in wave 1: there is no image. The lines follow 82a's "Task 27 — image proofs": the
image's filesystem exported with `docker create` and `docker export`, unpacked by `alpine:3.20` into a
volume mounted at `/fs`, both `gitleaks` commands run inside `ghcr.io/gitleaks/gitleaks:v8.30.1` (on
this laptop already) with `docker/gitleaks-images.toml`. `--redact` is added to both, so a finding is
never printed with its value. Read the guard before the first line and after the last.

```
docker volume create w65-scan-fs && docker create --name w65-scan bb2dash-workspace:local
```
```
docker export w65-scan | MSYS_NO_PATHCONV=1 docker run --rm -i -v w65-scan-fs:/fs alpine:3.20 tar -x -C /fs; echo "exit=$?"; docker rm w65-scan
```
```
MSYS_NO_PATHCONV=1 docker run --rm -v w65-scan-fs:/fs:ro -v "C:/Users/stack/projects/bb2dash-wt-21-container/docker/gitleaks-images.toml:/work/docker/gitleaks-images.toml:ro" -w /work ghcr.io/gitleaks/gitleaks:v8.30.1 dir /fs --config docker/gitleaks-images.toml --redact; echo $?
```
→ `0`
```
docker history --no-trunc bb2dash-workspace:local | MSYS_NO_PATHCONV=1 docker run --rm -i -v "C:/Users/stack/projects/bb2dash-wt-21-container/docker/gitleaks-images.toml:/work/docker/gitleaks-images.toml:ro" -w /work ghcr.io/gitleaks/gitleaks:v8.30.1 stdin --config docker/gitleaks-images.toml --redact; echo $?
```
→ `0`
```
docker history --no-trunc bb2dash-workspace:local | grep -c -E "sk-ant-|sb_secret_|eyJhbGciOi|postgres(ql)?://[^ ]*:[^ @]*@"
```
→ `0`
```
docker volume rm w65-scan-fs
```

`w65-scan` is created and never started (the entrypoint does not run), carries no compose label, and is
removed in the same line that exports it. The `dir` scan reads the whole image and can take minutes: run
it in the background. A hit under the new vendor trees (`/fs/usr/local/share/npm-global/`, the three
`node_modules` under `/fs/app/`, `/fs/opt/fastembed/`) is triaged by hand here with `--verbose` added;
none of them is under the allowlist's `/fs/usr/(include|lib|share)/`, so a hit there will show. Widening
the allowlist is a DECISIONS call, not this stream's.

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

Two things beyond the row's list in the Files table, both small: the README's "What runs" table and its
volumes line name the service and `workspace-claude-home`, and the umbrella `compose.yaml`'s header
comment lists the service and the volume beside the line that said 11.

## Questions for the PM

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
