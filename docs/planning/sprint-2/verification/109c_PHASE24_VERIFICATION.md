# 109c: Phase 24a verification

The PM's record for brief `109_PHASE24_workspace_assistant.md`. Each probe has its one pass or fail
line at the place the task list gives it. Worker records are beside this file
(`109_W76_VERIFICATION.md` to `109_W79_VERIFICATION.md`, `109_W85_VERIFICATION.md`).

## The session's start, 2026-10-08

* Worktree `bb2dash-wt-24` clean at `origin/feat/workspace-24`, e365153, 10 commits ahead of `main`
  (a58be34). `origin/main` had not moved. bb2dash-stack `origin/main` c4a54f8.
* Open PRs: #84 (Phase 21's step 1, waits for Stack's word) and #59. No acceptance run open
  (`C:/Users/stack/.bb2dash-accept/` holds no `accept.lock`, no `bb2dash-accept-` container).
* The untagged-session check was not due (`untagged-sessions.mjs --due`: last review 3.0 days ago).
* Stack's line with the start prompt: workers run on Sonnet 5.5, not on Opus as the brief says.
* 109a's item 23 had no answer line. It was put to Stack in the first report with the planning
  session's timings, and the probes started without it. The freeze waits for it.

## The live images and containers, before the first probe and after the last

Read 2026-10-08 23:27Z and 2026-10-09 00:09Z. The two readings agree, line for line.

| tag | id |
|---|---|
| `bb2dash-sync:local` | `sha256:084b9ede6aadb40a0c1389f10e8f841802355beafd21558da215a0bce975f10f` |
| `bb2dash-mcp:local` | `sha256:bf212746abf172b8d8f1a9f880afda84540b27c919fa057937f4fd50ee845d05` |
| `bb2dash-apply:local` | `sha256:3315bf7c18e2b14615a0e226f9ed8144c0a3f0ad7de0a9b50435c98d48340873` |
| `bb2dash-workspace:local` | `sha256:42c552c05ad6caf7565095b6c882643e022352d0357364024cdfc4cab7e5f2f4` |

| container | id | started |
|---|---|---|
| `bb2dash-sync-1` | `6d007fa6448e…ff64ded3` | 2026-10-08T15:15:32Z |
| `bb2dash-apply-1` | `cf35fbd0e3d5…0d68df97` | 2026-10-08T04:02:55Z |
| `bb2dash-workspace-1` | `9a02c3ccd37b…c9b8c845` | 2026-10-08T16:34:35Z |
| `bb2dash-harness-jobs-1` | `222ae50dbaae…f9060843` | 2026-10-08T04:02:55Z |

The `bb2dash-mcp` containers that Claude sessions start and stop are left out (rules file, Session 3).

## How a probe was run

No image was built, nothing was started with `up`, and nothing ran by `exec` in a live container.
Each probe ran one command in a throwaway compose project on the image as it stands:

```text
cd C:/Users/stack/projects/bb2dash-wt-24 && SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness MSYS_NO_PATHCONV=1 docker compose -p bb2dash-p24 -f compose.yaml -f <scratch>/probe.compose.yaml --profile workspace run --rm --no-deps --pull never -T workspace <command>
```

The second compose file, in the session's scratch folder, adds two bind mounts: the probe scripts
(read-only) and a folder for raw output. The form check, with no model call: the entrypoint raised
the firewall (three names allowed), dropped to `node` (uid 1000) and ran the command; no runner loop
started; `claude --version` gave `2.1.289 (Claude Code)`; `/run/workspace` was `700 node`.

Each turn was started as the runner starts one (`claude-cli.ts`, `childEnv` and `spawnClaude`): the
argv of the brief's table, working directory `/app/turn`, the token read from its secret file. Raw
output stayed in the scratch folder. Prompts and questions were synthetic. P-10 used a compose file
of its own (project `bb2dash-p24x`) with dummy secret files and no real secret.

Afterwards the two projects' volumes and networks were removed by name
(`bb2dash-p24_workspace-claude-home`, `bb2dash-p24_workspace-net`, `bb2dash-p24x_ingest-exchange`,
`bb2dash-p24x_p10-net`); `docker volume ls` and `docker network ls` show nothing of either.

**Walk boxes beside the probes.** Phase 22 started walk boxes from 23:34Z on. A timed probe waited
for a moment with none running and was repeated if one started meanwhile; the untimed ones ran
beside them. The first P-4 run overlapped one and is not the run that counts.

## The probes before the freeze

| probe | line |
|---|---|
| P-1 | **PASS.** A Haiku turn with `--mcp-config /run/workspace/mcp-none.json` (`{"mcpServers": {}}`) and no `--allowedTools`: the init line holds 0 servers and 0 tools, `apiKeySource` is `none`, the result is `success`. Recording `probes/p1-no-mcp-server.jsonl`; `cd workspace && npx vitest run test/probe24-fixtures.test.ts` passes (25 tests) |
| P-2 | **PASS.** `claude --help` in the image lists `--no-session-persistence` (count 1). With the config folder on tmpfs (`/home/node/.claude`, mount type `tmpfs`) and the flag in the argv, a turn started and ended `success`, and the file count under `/home/node/.claude/projects` after it is 0 (5 files elsewhere in the folder, none a transcript). The same turn without the flag, on the volume, left one more file under `projects` (21 before, 22 after). So the flag goes into the argv and the service takes a tmpfs in place of the volume |
| P-3 | **PASS.** Ten fresh Opus turns, each its own session with a prompt of 128,000 bytes rebuilt from the earlier turns, at `--max-budget-usd 0.95` (the answering turn's share of the 1.00 cap): 10 `success`, 0 `error_max_budget_usd`. Costs 0.3686, 0.3521, 0.3522, 0.3523, 0.3525, 0.3526, 0.3527, 0.3528, 0.3530, 0.3531: each its own turn's, none a running total, all under 0.95 and so under 1.00. Turn 10 answered with the code word given only in turn 1 |
| P-4 | **FAIL as written; PASS under two PM rulings (below).** As the brief's table has the turn: 20 of 20 answers were the right object inside a Markdown code fence, so 0 pass a check for the object alone and 20 pass once the fence is taken off; median 8.99 s against the bar of 8 s (a walk box ran beside the second half); every cost under 0.05 (largest 0.0101). The time is thinking: P-1's turn spent 846 of its 897 output tokens on it. `--json-schema`, tried next as the task says: 0 of 10, because the CLI then calls a tool of its own, `StructuredOutput`, and the image's gate denies it. With `MAX_THINKING_TOKENS=0` in the child's environment, the committed draft of `plan.md`, and one code fence accepted (clean run 2026-10-09 00:06:32Z to 00:07:09Z, no walk box beside it): **20 of 20 valid, median 1.47 s, slowest 2.19 s, largest cost 0.0140** |
| P-5 | **PASS.** One prompt argument of 128,000 bytes (argv 128,508 bytes in all): the CLI started and a result line was read (`success`) |
| P-6 | **PASS.** A per-request config `/run/workspace/mcp-<uuid>.json` (mode 0600, removed after the turn) named one server with three values in its `env`. The throwaway server's first result held `BB2DASH_MAX_SEARCHES=3` and `BB2DASH_COURSES=BIO.110,CSE.130`; its fourth call answered with an error result; the turn's result is `success`. The gate allowed all four calls (4 hook answers, exit 0). The answering turn keeps its own tools |
| P-10 | **(a) FAIL, (b) PASS, (c) PASS. By the task's rule the parser moves to the service `workspace-extract` (ruling below).** (a) Compose says "secrets `uid`, `gid` and `mode` are not supported, they will be ignored": the dummy secret was mode 777, owner 0, on a `v9fs` mount, and a second user (uid 1001) read it. (b) The image's firewall rose, `iptables -I OUTPUT 1 -m owner --uid-owner 1001 -j DROP` loaded, the worker's user reached `https://api.anthropic.com` (HTTP 404) and the second user did not (curl exit 28; the rule counted 18 packets). (c) The root script started one `sleep` as each user; after 15 s both were up, uid 1000 and uid 1001, each with `CapEff` and `CapBnd` 0; the worker's user could not start a process as the second; a file went through a shared tmpfs folder and back |

## What the probes showed beside their lines

* **P-10, three more readings**, taken because nobody answers a worker after the freeze.
  1. With a read-only root the image's firewall script fails: "/etc/hosts cannot be written, so no
     name can be pinned". A service that raises this firewall cannot have a read-only root.
  2. The fallback's own form works on this Docker: two services of today's image shared one named
     volume backed by tmpfs (`driver_opts: type tmpfs, device tmpfs, o size=96m,mode=1777`). The
     reader ran as uid 1001 with `network_mode: none` (only `lo`), no secret, a read-only root and
     `cap_drop: ALL`; it read the writer's file and the writer read its answer.
  3. In a folder of mode 1777 the writer could not remove the file the reader made (the sticky
     bit). The exchange folder needs a mode that lets the worker clear it.
  4. Seen and not taken: with the secrets folder itself given to the worker's user at mode 0500 by
     the root script, the second user was refused. It would keep one service, and it rests on a
     `chmod` at every start.
* **P-3, a floor to know.** A full-size prompt costs about 0.35 on Opus by the CLI's own estimate
  before a word is answered. Three searches, ten opened units and a long answer come on top, inside
  0.95. The walk watches a Deep question's stored cost.
* **P-4, what the plans look like.** With thinking off the model narrows `kinds` more than the
  prompt asks: "what did we talk about last time" was planned as course material alone in one of two
  runs. The check is on a plan's shape, so this is not a fail. W-77 owns `plan.md`'s wording; the
  walk asks one question that only a remembered item can answer once memory is on (24b).
* **The plan's usage figures.** Each recording carried one `rate_limit_event` line with the plan's
  five-hour and seven-day figures (0.15 and 0.50 at 23:32Z). The line is taken out of the committed
  recordings.

## PM rulings before the freeze, from the probes

* **F-1. The planning, summary and rolling turns run with thinking off.** `MAX_THINKING_TOKENS=0`
  is added to the child's environment for those three kinds of turn, on top of what `childEnv`
  returns; the argv table is unchanged and `childEnv` keeps its signature (apply imports it). The
  answering turn is not touched.
* **F-2. A plan is the object alone, or the object inside one Markdown code fence.** Anything else
  is the fallback plan, as before. `--json-schema` is not used.
* **F-3. The parser moves to its own service, `workspace-extract`**, as the brief's task 10 rules
  for a fail of any part. One image, two services. `workspace-extract`: no network
  (`network_mode: none`), no secret, a read-only root, every capability dropped, its own user, the
  memory and process limits, and one mount, the exchange volume. `workspace-ingest`: the worker
  alone, on `ingest-net` behind its firewall, the two secrets, the same limits, the same one mount,
  and a root that is not read-only, because its firewall pins names in `/etc/hosts` as the
  Workspace's does. The exchange volume is `ingest-exchange`, backed by tmpfs, 96 MB, mounted by
  those two services and no other; it holds the one file being read and its units, and the worker
  clears it after each document. The firewall's owner rule and the secret's mode are no longer
  part of the design. Written into the brief as "Freeze amendments".
* **F-4. `--no-session-persistence` is in the argv and the Workspace service takes a tmpfs** at
  `/home/node/.claude` in place of the named volume (P-2 passed). `cleanupPeriodDays` is not
  changed.

## Task 12, the freeze

Prepared: the nineteen JSON files, the three text files, the routine wording
(`workspace/test/fixtures/contract24/`, its `README.md` with every SQL signature) and the PM's test.
**Not frozen yet:** `grep -c "^    \*\*His answer to item 23" docs/planning/sprint-2/briefs/109a_PHASE24_open_questions.md`
gives 0, so no worker branch is cut.
