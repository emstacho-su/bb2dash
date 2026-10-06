# Phase 21 · W-64 (runner stream) · verification

Brief: `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md` (frozen 2026-10-05).
Branch `feat/workspace-21-runner`, worktree `bb2dash-wt-21-runner`. Tasks 7, 10, 8, 9, 11, worked in
that order. Every command below is run from `workspace/` unless a line says otherwise. Host: Windows 11,
Git Bash, Node v24.19.0, npm 11.17.0; the package's `engines` floor is Node 22 (the image's base).

One section per task: the red run (the named test committed failing, before its code) and the green
run, each with its command and last lines.

## Task 7 · package scaffold, router and tier map (P-83)

Files: `workspace/package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.test.json`,
`vitest.config.ts`, `README.md`, `src/router.ts`, `src/tiers.ts`, `test/router.test.ts`,
`test/fixtures/router-cases.json`.

`tsconfig.test.json` is one file more than the brief's Files table lists. It is the `mcp-server/`
pattern: `tsconfig.json` is the build (`src/` only, emitted to `dist/`, the one config the image
copies), and `tsconfig.test.json` extends it for `npm run typecheck` over `src/`, `test/` and
`vitest.config.ts` with no emit.

### Red

Commit: the scaffold, the fixture and the test, with no `src/router.ts` or `src/tiers.ts`.

```
$ npx vitest run test/router.test.ts
 FAIL  test/router.test.ts [ test/router.test.ts ]
Error: Cannot find module '../src/router.js' imported from C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/test/router.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

### Green

```
$ npx vitest run test/router.test.ts
 Test Files  1 passed (1)
      Tests  67 passed (67)
$ npm run typecheck
> tsc -p tsconfig.test.json
(no output, exit 0)
```

The fixture holds 56 cases: 20 `low`, 21 `high`, 15 `mid`; 10 of them are follow-ups (a prior tier
and at most 40 characters). The test asserts the floors itself (at least 30 cases, 8 per tier, 6
follow-ups), that the fixture holds acceptance steps 3 to 7 word for word, and that they route `low`,
`low`, `low`, `mid`, `high`.

How the rule's open words were read (the fixture is the executable form):

* Order: high, then low, then the follow-up rule, then mid. So "What about week 4?" after an Opus
  answer is `low` (a lookup cue), and "Draft it again" after a Haiku answer is `high`.
* A clause starts at the start of the prompt, after `. ? ! ; : ,` followed by white space, after a
  line break, and after `and` or `then`. `IST.323` is one word, not a sentence break.
* A polite lead-in is skipped before a clause's opening word is read (`LEAD_INS` in
  `src/router.ts`: please, can you, could you, would you, will you, help me, i need you to, i want
  you to, i'd like you to, let's, now, ok, okay, also, just, and, then). "Can you write a cover
  note" is `high`; without the skip it would open with "can" and fall to `mid`.
* "has no high verb" (the `low` rule) is read as: no `HIGH_VERBS` word anywhere in the prompt. So
  "What should I write for the GEO.103 reflection?" and "What is the plan for week 5?" are `mid`.
* Lengths are counted in code points after trimming, the way the database counts its 8000.
* A first question has no prior tier, so a short one ("ok thanks") is `mid`.

## Task 10 · tool gate hook (P-88)

Files: `workspace/src/hooks/tool-gate.ts` (the hook the CLI runs), `workspace/src/hooks/gate-rules.ts`
(its rules), `workspace/claude/settings.json`, `workspace/test/tool-gate.test.ts`.

`gate-rules.ts` is one file more than the Files table lists. The hook file runs on load and is never
imported: it has no "am I the main module" test that could fail and leave the gate silent, which
would read as allow. The rules live beside it so the unit test can import them, and the same test
runs the built `dist/hooks/tool-gate.js` as a process.

### Red

Commit: `test/tool-gate.test.ts` alone.

```
$ npx vitest run test/tool-gate.test.ts
 FAIL  test/tool-gate.test.ts [ test/tool-gate.test.ts ]
Error: Cannot find module '../src/hooks/gate-rules.js' imported from C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/test/tool-gate.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

### Green

```
$ npx vitest run test/tool-gate.test.ts
 Test Files  1 passed (1)
      Tests  78 passed (78)
$ npm run typecheck
> tsc -p tsconfig.test.json
(no output, exit 0)
```

The test builds `dist/` with `tsc -p tsconfig.json` in a `beforeAll` and runs
`node dist/hooks/tool-gate.js` with the payload on stdin, the way the CLI runs a command hook.

Task 12's wiring check, run here against the host build (the command string differs only in its
path; task 12 reads the real one out of the image's `settings.json`):

```
$ node -e "const r=require('child_process').spawnSync('node dist/hooks/tool-gate.js',{shell:true,input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'mcp__rag__search_context',tool_input:{query:'x',collection:'estac'}})});console.log(r.status, JSON.stringify(String(r.stderr)), JSON.stringify(String(r.stdout)))"
2 "collection must be one of: bb2dash, bb2dash-inbox-decisions\n" ""
```

What the gate does, in the test's words: allows the three materials tools and `search_context` on
`bb2dash` and `bb2dash-inbox-decisions`; denies Bash, Read, Write, Edit, WebFetch, WebSearch, Task,
ToolSearch, EndConversation, four `mcp__supabase*`-shaped names, `mcp__rag__get_document`, a name
with a trailing space, an upper-case name and two prototype names; denies `search_context` with no
collection or one off the list with the reason `collection must be one of: bb2dash,
bb2dash-inbox-decisions`; denies `Bb2dash`, ` bb2dash`, `bb2dash ` (compared exactly); as a process,
exit 0 with empty stdout and stderr for an allowed call, exit 2 with the reason on stderr for a
denial, and exit 2 (never 1) for non-JSON stdin, empty stdin, stdin that is not there, a missing
`tool_name`, and a `collection` that is an array, a number or null. `claude/settings.json` holds one
`PreToolUse` entry, matcher `*`, one command hook `node /app/workspace/dist/hooks/tool-gate.js`,
`"timeout": 600`.

## Task 8 · provider seam, the argv and the system prompt (P-84)

Files: `workspace/src/providers/types.ts`, `claude-cli.ts`, `ollama.ts`, `frontier-api.ts`,
`index.ts`, `workspace/src/errors.ts`, `workspace/src/config.ts` (its constants; the start-up guards
arrive with task 11), `workspace/prompts/system.md`, `workspace/test/providers.test.ts`,
`workspace/test/claude-argv.test.ts`.

### Red

Commit: the two test files alone (no `src/providers/`, no `src/config.ts`, no `src/errors.ts`, no
`prompts/system.md`).

```
$ npx vitest run test/providers.test.ts test/claude-argv.test.ts
 FAIL  test/claude-argv.test.ts [ test/claude-argv.test.ts ]
Error: Cannot find module '../src/config.js' imported from C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/test/claude-argv.test.ts
 FAIL  test/providers.test.ts [ test/providers.test.ts ]
Error: Cannot find module '../src/errors.js' imported from C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/test/providers.test.ts
 Test Files  2 failed (2)
      Tests  no tests
```

### Green (the argv provisional until task 9's lookup recording)

```
$ npx vitest run test/providers.test.ts test/claude-argv.test.ts
 Test Files  2 passed (2)
      Tests  54 passed (54)
$ npm run typecheck
> tsc -p tsconfig.test.json
(no output, exit 0)
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
```

One test line changed between red and green: the case "never puts the stored id `''` in argv"
asserted `argv` does not contain the stored id, and an empty string is also the `--tools` value. The
assertion is skipped for the empty id only; the same case still asserts no `--resume` and the new
uuid after `--session-id`.

What the tests hold:

* `test/claude-argv.test.ts` spells the Contract's argv out as one literal list and compares
  `buildArgv()` to it element for element, on the fresh form (`--session-id <new uuid>`) and on the
  resumed form (`--resume <claude_session_id>`).
* `planSession()` resumes a stored id only when it has the uuid shape migration 140 checks;
  anything else (`not-a-uuid`, an upper-case uuid, an id with a flag behind it, an empty string) is a
  fresh start under a new random uuid and never reaches argv. A new id is never the conversation's
  own id, even when the generator returns it.
* The prompt is the last element, after `--`, for a plain question, a prompt beginning `--model`, a
  prompt that is only a flag, one beginning `--`, and one with line breaks and quotes.
* `--append-system-prompt` carries `prompts/system.md` with trailing white space trimmed (what
  `"$(cat prompts/system.md)"` gives in a shell, so the recording and the runner pass the same text).
* `providers.test.ts`: three provider ids; the `ollama` and `frontier-api` stubs type-check as
  `Provider` and throw `ProviderNotConfiguredError`, which maps to `provider_not_configured`.
* `CliArgsInput.paths` is the one opening for task 9's two recording substitutions
  (`--mcp-config`, `--settings`); a test asserts nothing else changes when it is given.

## Task 9 · four live recordings, the scrub, the stream parser (P-84, P-85)

### Recording set-up (written before any recording ran)

Host CLI: `claude --version` reads `2.1.290 (Claude Code)`, so every recording runs the pinned CLI as
`npx -y @anthropic-ai/claude-code@2.1.289` (`--version` through it reads `2.1.289 (Claude Code)`).

Recording directory, outside every repo and outside the home folder (so no ancestor folder holds a
`CLAUDE.md` or a `.claude/`; `ls -d` on `C:/`, `C:/Users` and `C:/Users/Public` found neither):

```
C:/Users/Public/bb2dash-w64-rec/
  cwd/            empty; the CLI's working directory, as /app/turn is in the image
  mcp.json        substitution 1: the host's two user-scope registrations, bb2dash and rag
  settings.json   substitution 2: workspace/claude/settings.json with the hook command's path changed
  out/            the raw stdout, stderr and exit code of each recording (never committed)
```

* `mcp.json` was written by a script that copies `mcpServers.bb2dash` and `mcpServers.rag` out of the
  host's user-scope registrations without printing a value, and refuses if any value has the shape of
  a key, token or DSN. It printed: `bb2dash: type=stdio command=docker args=10 envNames=(none)
  secretShapedValues=0` and `rag: type=stdio command=node.exe args=1
  envNames=HARNESS_ENV_FILE,DATABASE_CA_CERT,FASTEMBED_CACHE_DIR secretShapedValues=0`. The bb2dash
  registration has the shape `docker run -i --rm --mount <arg> -e <arg> -e <arg> bb2dash-mcp:local`
  (the `mcp-server/README.md` recipe: the key is named by file path); the rag registration is
  `node.exe <harness>/mcp-server/dist/index.js`.
* `settings.json` differs from `workspace/claude/settings.json` in one string: the hook command is
  `node C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/dist/hooks/tool-gate.js` (a `diff`
  after mapping the path back shows no other difference). `dist/` was built with `npm run build`.
* The shell: no inherited `CLAUDE*` or `ANTHROPIC*` variable. Each line removes every name that
  `env | grep -E '^(CLAUDE|ANTHROPIC)' | cut -d= -f1` lists with `env -u` (this session's shell
  listed ten); `ENABLE_TOOL_SEARCH=false` is set as the service sets it.
* One thing the lines carry that the recipe does not name: `npm_config_script_shell=<bash>`. On
  Windows `npx` starts a package's program through `cmd.exe`, which cuts a multi-line argument at its
  first line break: a probe program run through `npx` received
  `["-p","--tools","","--append-system-prompt","line one"]` for a four-line prompt followed by
  `-- <question>`. With bash as npm's script shell the same probe received every element intact, the
  empty `--tools` value and the `--` included. It changes how `npx` starts the CLI, not an argv
  element.
* The sync container's guard, read before the recordings. The bb2dash MCP registration starts a
  `bb2dash-mcp:local` container for the session, as every Claude Code session on this host does (two
  were already up from other sessions); the recordings run no other docker command.
  `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` →
  `bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z`.

### The four recording lines (Git Bash, each one line, paste-ready)

Each line is the frozen argv with the two substitutions. Lines 1 and 2 each spend one small Haiku
turn on the plan; lines 3 and 4 spend none.

1. Lookup (acceptance step 3's question; the argv's gate):

```
cd /c/Users/Public/bb2dash-w64-rec/cwd && env $(env | grep -E '^(CLAUDE|ANTHROPIC)' | cut -d= -f1 | sed 's/^/-u /' | tr '\n' ' ') ENABLE_TOOL_SEARCH=false npm_config_script_shell="$(cygpath -m "$(which bash)")" npx -y @anthropic-ai/claude-code@2.1.289 -p --model haiku --session-id "$(node -e "console.log(require('crypto').randomUUID())")" --tools "" --allowedTools mcp__bb2dash__search_materials mcp__bb2dash__get_material_text mcp__bb2dash__list_courses mcp__rag__search_context --disallowedTools Bash Read Write Edit WebFetch WebSearch mcp__rag__get_document --permission-mode dontAsk --permission-prompts none --strict-mcp-config --mcp-config C:/Users/Public/bb2dash-w64-rec/mcp.json --setting-sources project --settings C:/Users/Public/bb2dash-w64-rec/settings.json --append-system-prompt "$(cat C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/prompts/system.md)" --system-prompt-snapshot off --output-format stream-json --verbose --include-partial-messages --include-hook-events --max-budget-usd 1.00 -- "What does the IST.323 syllabus say about late work?" > ../out/lookup.raw.jsonl 2> ../out/lookup.stderr.txt; echo "exit $?" | tee ../out/lookup.exit.txt
```

2. Budget stop (the same question with `--max-budget-usd 0.01`):

```
cd /c/Users/Public/bb2dash-w64-rec/cwd && env $(env | grep -E '^(CLAUDE|ANTHROPIC)' | cut -d= -f1 | sed 's/^/-u /' | tr '\n' ' ') ENABLE_TOOL_SEARCH=false npm_config_script_shell="$(cygpath -m "$(which bash)")" npx -y @anthropic-ai/claude-code@2.1.289 -p --model haiku --session-id "$(node -e "console.log(require('crypto').randomUUID())")" --tools "" --allowedTools mcp__bb2dash__search_materials mcp__bb2dash__get_material_text mcp__bb2dash__list_courses mcp__rag__search_context --disallowedTools Bash Read Write Edit WebFetch WebSearch mcp__rag__get_document --permission-mode dontAsk --permission-prompts none --strict-mcp-config --mcp-config C:/Users/Public/bb2dash-w64-rec/mcp.json --setting-sources project --settings C:/Users/Public/bb2dash-w64-rec/settings.json --append-system-prompt "$(cat C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/prompts/system.md)" --system-prompt-snapshot off --output-format stream-json --verbose --include-partial-messages --include-hook-events --max-budget-usd 0.01 -- "What does the IST.323 syllabus say about late work?" > ../out/budget-stop.raw.jsonl 2> ../out/budget-stop.stderr.txt; echo "exit $?" | tee ../out/budget-stop.exit.txt
```

3. Resume missing (a `--resume` of a random uuid; no model turn):

```
cd /c/Users/Public/bb2dash-w64-rec/cwd && env $(env | grep -E '^(CLAUDE|ANTHROPIC)' | cut -d= -f1 | sed 's/^/-u /' | tr '\n' ' ') ENABLE_TOOL_SEARCH=false npm_config_script_shell="$(cygpath -m "$(which bash)")" npx -y @anthropic-ai/claude-code@2.1.289 -p --model haiku --resume "$(node -e "console.log(require('crypto').randomUUID())")" --tools "" --allowedTools mcp__bb2dash__search_materials mcp__bb2dash__get_material_text mcp__bb2dash__list_courses mcp__rag__search_context --disallowedTools Bash Read Write Edit WebFetch WebSearch mcp__rag__get_document --permission-mode dontAsk --permission-prompts none --strict-mcp-config --mcp-config C:/Users/Public/bb2dash-w64-rec/mcp.json --setting-sources project --settings C:/Users/Public/bb2dash-w64-rec/settings.json --append-system-prompt "$(cat C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/prompts/system.md)" --system-prompt-snapshot off --output-format stream-json --verbose --include-partial-messages --include-hook-events --max-budget-usd 1.00 -- "What does the IST.323 syllabus say about late work?" > ../out/resume-missing.raw.jsonl 2> ../out/resume-missing.stderr.txt; echo "exit $?" | tee ../out/resume-missing.exit.txt
```

4. Sign-in expired (a deliberately bad `CLAUDE_CODE_OAUTH_TOKEN`; no model turn):

```
cd /c/Users/Public/bb2dash-w64-rec/cwd && env $(env | grep -E '^(CLAUDE|ANTHROPIC)' | cut -d= -f1 | sed 's/^/-u /' | tr '\n' ' ') ENABLE_TOOL_SEARCH=false CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token-recorded-for-a-fixture npm_config_script_shell="$(cygpath -m "$(which bash)")" npx -y @anthropic-ai/claude-code@2.1.289 -p --model haiku --session-id "$(node -e "console.log(require('crypto').randomUUID())")" --tools "" --allowedTools mcp__bb2dash__search_materials mcp__bb2dash__get_material_text mcp__bb2dash__list_courses mcp__rag__search_context --disallowedTools Bash Read Write Edit WebFetch WebSearch mcp__rag__get_document --permission-mode dontAsk --permission-prompts none --strict-mcp-config --mcp-config C:/Users/Public/bb2dash-w64-rec/mcp.json --setting-sources project --settings C:/Users/Public/bb2dash-w64-rec/settings.json --append-system-prompt "$(cat C:/Users/stack/projects/bb2dash-wt-21-runner/workspace/prompts/system.md)" --system-prompt-snapshot off --output-format stream-json --verbose --include-partial-messages --include-hook-events --max-budget-usd 1.00 -- "What does the IST.323 syllabus say about late work?" > ../out/sign-in-expired.raw.jsonl 2> ../out/sign-in-expired.stderr.txt; echo "exit $?" | tee ../out/sign-in-expired.exit.txt
```

### What ran (2026-10-06 UTC; 2026-10-05 evening local)

The session did not refuse a nested `claude -p`. Each line was run exactly as written above (copied
out of this file with `grep '^cd /c/Users/Public/bb2dash-w64-rec/cwd'` into one script per line).

| # | fixture | started (UTC) | exit | stdout lines | stderr | model turns |
|---|---|---|---|---|---|---|
| 1 | lookup | 03:29:34 | 0 | 95 | npm's own update notice only (not kept) | 3 API calls, one answer |
| 3 | resume missing | 03:32:54 | 1 | 1 | `No conversation found with session ID: <uuid>` | none |
| 4 | sign-in expired | 03:33:10 | 1 | 6 | empty | none (two 401 retries, cost 0) |
| 2 | budget stop | see "The budget recording" below | | | | |

The exit codes are kept in `workspace/test/fixtures/recordings.json` (one entry per recorded
fixture: exit code, what was passed beside the frozen argv, whether a stderr sibling exists). That is
the file that holds the resume-missing exit code.

### The argv's gate: what the lookup recording shows

Read from the raw stdout before the scrub (field names as the stream spells them).

| argv element | what the stream shows | as the Contract says? |
|---|---|---|
| `--model haiku` | init `model` = `claude-haiku-4-5-20251001`; the same id on every `assistant` line (`message.model`) and as the one key of the result's `modelUsage` | yes |
| `--session-id <uuid>` | every line's `session_id` is that uuid; the result line repeats it | yes |
| `--tools ""` | init `tools` holds four names and nothing else: the three `mcp__bb2dash__*` tools and `mcp__rag__search_context`. No built-in tool, no `ToolSearch`, no `EndConversation` | yes |
| `--allowedTools` (four) | both tool calls ran; the result's `permission_denials` is `[]` | yes |
| `--disallowedTools` (seven) | `mcp__rag__get_document` is not in init `tools` (recorded, not asserted) | yes |
| `--permission-mode dontAsk` | init `permissionMode` = `dontAsk` | yes |
| `--permission-prompts none` | no prompt event in the stream | yes (nothing to prompt for) |
| `--strict-mcp-config --mcp-config` | init `mcp_servers` = `[{name: bb2dash, status: connected, source: dynamic}, {name: rag, status: connected, source: dynamic}]`; none of the host's other servers | yes |
| `--setting-sources project` | init `skills` (19) and `slash_commands` (55) hold only the CLI's own; none of the host's user skills, plugins (3, all `builtin`) or agents; no hook event but the gate's; the session's transcript holds no memory-file attachment | yes, with one note below |
| `--settings` | the gate ran: one `hook_started` and one `hook_response` per tool call | yes |
| `--append-system-prompt` | the answer is plain text, names the syllabus section it read, uses `course` with the course id | yes (behaviour, not a field) |
| `--system-prompt-snapshot off` | accepted; nothing in the stream shows it either way | not observable |
| `--output-format stream-json --verbose --include-partial-messages` | `stream_event` lines with `content_block_delta` | yes |
| `--include-hook-events` | `system/hook_started` and `system/hook_response` lines | yes |
| `--max-budget-usd 1.00` | accepted; `total_cost_usd` 0.038524 | yes |
| `-- <prompt>` | the question was read as the prompt | yes |

Nothing behaved against the Contract, so the argv test of task 8 is final as committed (no element
changed). Notes for the PM, none of them a stop:

* **The credential source field is `apiKeySource`, and its value is `none`.** It read `none` in the
  lookup (the host's `/login` session) and `none` again in the sign-in-expired recording, where
  `CLAUDE_CODE_OAUTH_TOKEN` was set in the environment. So `none` is the value for both OAuth
  forms: no API key is in use. The init check accepts exactly that value
  (`OAUTH_CREDENTIAL_SOURCE` in `src/stream-json.ts`) and refuses anything else.
* **The init line lists a memory path.** `memory_paths` = `{auto: <config dir>/projects/<cwd
  slug>/memory/}`, and the CLI created that folder, empty. No memory file was loaded (the cwd and
  its ancestors hold none, and the transcript's attachments are `environment`, `model`,
  `mcp_instructions_delta`, `total_tokens_reminder`, `budget_usd`, `session_context`, `date`,
  `credential_org`), and with `--tools ""` the model has no tool that could write one. In the image
  the folder will be `/home/node/.claude/projects/-app-turn/memory/`, shared by every conversation
  because every turn runs in `/app/turn`.
* **A hook event carries no tool-use id.** Its fields are `hook_id`, `hook_name`
  (`PreToolUse:<tool name>`), `hook_event` (`PreToolUse`), `output`, `stdout`, `stderr`,
  `exit_code` (0 on both calls) and `outcome` (`success`). The parser matches a hook response to
  the oldest tool call of that name that has none yet. Order in the stream: the `assistant` line
  with the `tool_use`, `hook_started`, `hook_response`, then the `user` line with the tool result.
* **The model is told its budget.** The transcript holds `budget_usd` attachments (`used`, `total`,
  `remaining`): 0 before the first call, 0.021412 after it, 0.0271861 after the second.
* **A rate-limit event is on the wire, with the overage fields.** One `rate_limit_event` per
  recording that reached the API: `rate_limit_info` = `{status: allowed, resetsAt, rateLimitType:
  five_hour, overageStatus: rejected, overageDisabledReason: out_of_credits, isUsingOverage: false,
  unifiedWindows: {five_hour: {utilization: 0.22, …}, seven_day: {utilization: 0.73, …}}}`. All
  three overage fields (`overageStatus`, `overageDisabledReason`, `isUsingOverage`) are there, so the
  runner ends a turn whose event reads `isUsingOverage` true and stores `usage_limit` (the Contract's
  conditional). The weekly window read 73 % used at 03:29 UTC.
* **Where the stream names the full model id:** the init line (`model`), every `assistant` line
  (`message.model`) and the result's `modelUsage` key. The runner passes the id of the last real
  `assistant` message, else the init line's, to `workspace_finish()`; the CLI's own error messages
  carry `model: "<synthetic>"` and are never used.
* **An API error ends as `subtype: success` with `is_error: true`.** The sign-in-expired result line
  reads `{subtype: success, is_error: true, api_error_status: 401, terminal_reason: api_error,
  total_cost_usd: 0, num_turns: 1}`, after an `assistant` line with `error: authentication_failed`,
  `is_api_error_message: true` and `message.model: "<synthetic>"`, and two `system/api_retry` lines
  (`error_status: 401`, `error: authentication_failed`). The exit code is 1. So "finished" is
  `subtype: success` and `is_error: false` together, never the subtype alone.
* **A resume of a missing session** writes one stdout line, `{type: result, subtype:
  error_during_execution, is_error: true, num_turns: 0, total_cost_usd: 0, errors: ["No conversation
  found with session ID: …"], session_id: <the id asked for>}`, the same sentence on stderr, and
  exits 1. No init line. The `session_id` it reports is the missing one, so the runner never stores
  a session id from a failed start.

### The scrub

`workspace/test/scrub-recording.mjs` is the scrub; the raw stdout stays in
`C:/Users/Public/bb2dash-w64-rec/out/` and never enters git.

```
$ node test/scrub-recording.mjs <rec>/out/lookup.raw.jsonl test/fixtures/claude-stream-lookup.jsonl --mask-answer
95 line(s) written, answer text masked
$ node test/scrub-recording.mjs <rec>/out/sign-in-expired.raw.jsonl test/fixtures/claude-stream-sign-in-expired.jsonl
6 line(s) written, answer text kept
$ node test/scrub-recording.mjs <rec>/out/resume-missing.raw.jsonl test/fixtures/claude-stream-resume-missing.jsonl
1 line(s) written, answer text kept
```

What it rewrites: every tool-result body (each `tool_result` block's `content`, and the `user`
line's own `tool_use_result` copy) to `<scrubbed>`; the init line's `cwd`, `slash_commands`,
`terminal_slash_commands`, `skills`, `plugins`, `agents`, `memory_paths`, `messaging_socket_path`
and `powershell_path` to `<scrubbed>`; every thinking signature to `<scrubbed>` (thinking text was
empty in all recordings). It refuses to write a file that still holds a drive path, a home-folder
path, a JWT, an `sk-ant-` or `sb_secret_` shape, a DSN or an email address.

**One thing more than the brief's scrub list: the lookup's answer text is masked.** The recorded
answer quotes two sentences of the IST.323 syllabus word for word, so the answer itself was course
text, in the 33 text deltas, in the last `assistant` line and in the result line. With
`--mask-answer` every letter becomes `x` and every digit `9`; spaces, line breaks and punctuation
stay, so each delta keeps its length and place and the deltas still join to the final text (456
characters), which is what the parser test needs. The model's own tool inputs are kept as recorded
(`{"q": "late work", "course": "IST.323"}`, `{"text_id": 733}`): the question's words, not the
document's. The sign-in-expired fixture keeps the CLI's own error sentence unmasked.

After the scrub, a walk over every string in the fixtures found none over 60 characters except the
two masked answer copies, and `grep -i` for the owner's name, the school and the question's subject
found only the model's own query `late work`.
