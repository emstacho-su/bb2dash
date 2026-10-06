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

### What ran (2026-10-06 UTC: three in the evening of 2026-10-05 local, the fourth the next morning)

The session did not refuse a nested `claude -p`. Each line was run exactly as written above (copied
out of this file with `grep '^cd /c/Users/Public/bb2dash-w64-rec/cwd'` into one script per line).

| # | fixture | started (UTC) | exit | stdout lines | stderr | model turns |
|---|---|---|---|---|---|---|
| 1 | lookup | 03:29:34 | 0 | 95 | npm's own update notice only (not kept) | 3 API calls, one answer |
| 3 | resume missing | 03:32:54 | 1 | 1 | `No conversation found with session ID: <uuid>` | none |
| 4 | sign-in expired | 03:33:10 | 1 | 6 | empty | none (two 401 retries, cost 0) |
| 2 | budget stop | 14:23:01 | 1 | 24 | empty | 1 API call, stopped at its tool call |

Lines 1, 3 and 4 ran in one sitting; line 2 ran eleven hours later, for the reason given under
"The budget recording" below. Each recording that reached the API was run once: two turns on the
plan in all (the lookup and the budget stop), as the recipe allows.

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
$ node test/scrub-recording.mjs <rec>/out/budget-stop.raw.jsonl test/fixtures/claude-stream-budget-stop.jsonl
24 line(s) written, answer text kept
```

The budget-stop recording holds no answer text and no tool result (it was stopped before either),
so nothing in it needed the mask; its thinking text was empty, like the others'.

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

### The budget recording (line 2)

Run on 2026-10-06 at 14:23:01 UTC, exactly as line 2 is written above (the script made from this
file by the same `grep`; a `diff` of the script against the line read from this file showed no
difference before the run). The guard was read before and after:
`docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` →
`bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z`
both times, the value read before the first recording.

Why it ran eleven hours after the other three. The lookup's first model call wrote the prompt
cache: its `budget_usd` attachments read 0.021412 after the first call, 0.0271861 after the second
and 0.038524 at the end. The first call's usage names a one-hour cache
(`cache_creation.ephemeral_1h_input_tokens`). A budget run made inside that hour would have read the
cache instead of writing it, and a first call that reads it costs about $0.0019 by the list prices
that reproduce the recorded figure to the last digit (10,255 cache tokens, 10 input tokens and 167
output tokens on Haiku 4.5: written, $0.021355; read, about $0.0019). The run could then have
passed one cent only on its last response and ended as a finished answer: a recording that says
nothing about the cap. So the budget line waited for a cold cache, and its usage shows one:
`cache_creation_input_tokens` 10255, `cache_read_input_tokens` 0.

What the stream shows (24 stdout lines, stderr empty, exit code 1):

| | |
|---|---|
| init line | passes the check: `claude_code_version` 2.1.289, `apiKeySource` `none`, `permissionMode` `dontAsk`, `bb2dash` and `rag` connected, the four tools |
| the one model call | an empty thinking block, then a `tool_use` of `mcp__bb2dash__search_materials` with `{"q": "late work policy", "course": "IST.323"}` |
| the gate | `system/hook_started` for that call, before the result line; `system/hook_response` (`exit_code` 0, `outcome` `success`) is the recording's last line, after the result line |
| tool result | none: there is no `user` line. The CLI stopped before the tool answered |
| result line | `subtype` `error_max_budget_usd`, `is_error` true, `num_turns` 1, `total_cost_usd` 0.021355, `stop_reason` `tool_use`, `terminal_reason` `budget_exhausted`, `errors` `["Reached maximum budget ($0.01)"]`, `permission_denials` `[]`; no `result` key and no `api_error_status` key |
| rate-limit event | none in this recording (the lookup carried one) |

**The form recorded: a stop.** The CLI ended the turn at `--max-budget-usd`, so O-2's conditional
branch does not apply: `BUDGET_CAP_HOLDS` stays `true` (`workspace/src/config.ts`), the no-cap
sentence is never appended, and the fixture is asserted in the row's default form, a failed turn
that maps to `budget_exceeded`. Nothing for the PM to tell Stack under O-2. `stream-json.test.ts`
ties the two together: it computes O-2's own condition from the fixture (`success`, two or more
turns, a cost above the cap) and asserts `BUDGET_CAP_HOLDS` is its opposite.

What the runner stores for this turn (asserted on the fixture in `test/runner/cli-turn.suite.ts`):
state `failed`, `error_code` `budget_exceeded`, empty content, `tool_calls`
`[{"tool": "search_materials", "query": "late work policy", "scope": "IST.323", "ok": false}]`
(the call is kept, `ok` false because its result never arrived), `cost_usd` 0.021355 as reported,
the session id the init line gave and the model id `claude-haiku-4-5-20251001`.

Notes for the PM, none of them a stop:

* **One response overshoots the cap.** The first call alone cost $0.0214 against a cap of $0.01;
  the CLI stopped before the next call. The Contract says so ("one response can overshoot it").
* **The gate's answer can follow the result line.** The parser reads the output to its end and
  applies the fail-closed rule when a tool result arrives, that is, for a tool that ran. A call the
  CLI cut off before running it is not read as ungated; a test replays the fixture cut at its
  result line and gets `budget_exceeded` with no violation either way.
* **Task 21's cap turn needs a cold prompt cache.** It asks the same question with
  `WORKSPACE_TURN_BUDGET_USD=0.01` and expects `budget_exceeded`. That is what this recording shows
  when the first call writes the cache. Within an hour of another Haiku turn in the same container
  the first call reads the cache (about $0.0019, the figure above), and the turn can finish with an
  answer and no error code. This is worked out from the two recordings' cost figures, not observed.
* **A budget-stopped turn leaves a session that ends on an unanswered tool call**, and the next
  question in that conversation resumes it. That resume was not recorded (it would spend a turn). If
  the CLI refuses it before any assistant message, the one recovery covers it; a follow-up question
  after task 21's cap turn would show which.

### Red

Two red commits, because the fourth recording came later than the first three.

`35819ab`: the three fixtures recorded that night, `recordings.json`, the synthetic file, the scrub
and `test/stream-json.test.ts`, with no `src/stream-json.ts` (run again from that commit's tree on
2026-10-06):

```
$ npx vitest run test/stream-json.test.ts
 FAIL  test/stream-json.test.ts [ test/stream-json.test.ts ]
Error: Cannot find module '../src/stream-json.js' imported from <35819ab>/workspace/test/stream-json.test.ts
 Test Files  1 failed (1)
      Tests  no tests
```

Between that commit and the budget recording one test stayed red on purpose (`73b10bf`: 88 of 89):
"are the four recordings" lists four fixture names and three existed.

`099ff8f`: the budget-stop fixture's own assertions, committed before the fixture and its
`recordings.json` entry:

```
$ npx vitest run test/stream-json.test.ts test/runner.test.ts
 FAIL  test/stream-json.test.ts [ test/stream-json.test.ts ]
Error: ENOENT: no such file or directory, open '<worktree>\workspace\test\fixtures\claude-stream-budget-stop.jsonl'
 FAIL  test/runner.test.ts > how a CLI turn ends > maps the budget-stop recording as recorded
Error: ENOENT: no such file or directory, open '<worktree>\workspace\test\fixtures\claude-stream-budget-stop.jsonl'
 Test Files  2 failed (2)
      Tests  1 failed | 150 passed (151)
```

One test line was wrong and was changed with `099ff8f`: the runner's budget-stop case, written
before the recording existed, took the result line to be the recording's last line. The recording's
last line is the gate's answer, so the case now finds the result line by its type.

### Green

```
$ npx vitest run test/stream-json.test.ts
 Test Files  1 passed (1)
      Tests  103 passed (103)
$ npm run typecheck
> tsc -p tsconfig.test.json
(no output, exit 0)
```

Commits: `a575554` (the four lines, before any recording), `35819ab` (red), `73b10bf` (the parser,
the error mapping, the recovery rule), `099ff8f` (red), `ee64b14` (the fourth fixture).

What the test holds, in the row's order:

* The lookup: the deltas of the last assistant message join to the recorded final text (456
  characters, masked); `tool_calls` is `[{search_materials, "late work", "IST.323", ok: true},
  {get_material_text, null, "733", ok: true}]`, each element with exactly the four keys; the init
  line shows the pin, `apiKeySource` `none`, `dontAsk`, exactly `bb2dash` and `rag`, both connected,
  the four tools and no `ToolSearch`; each of the two `tool_use` blocks has a `PreToolUse` hook
  response with exit code 0; the rate-limit event carries the three overage fields.
* The budget stop: as the section above.
* Resume missing: one error result, no init line, no assistant message, exit code 1 from
  `recordings.json`, the stderr sibling's sentence; `shouldRetryAsFresh()` says retry once, and not
  twice, not for a fresh start, not after an assistant message.
* Sign-in expired: `assistantError` `authentication_failed`, `api_error_status` 401, maps to
  `sign_in_expired`; the same lines with other words in the text map the same way; none of the CLI's
  own error text is streamed; the model named is the init line's, never `<synthetic>`.
* Every recorded file: each tool-result body is the literal `<scrubbed>`; no drive path, home-folder
  path, JWT, `sk-ant-`, `sb_secret_`, DSN or email shape; the init line's `cwd`, `slash_commands`,
  `skills`, `plugins`, `agents`, `memory_paths` and `powershell_path` are `<scrubbed>`; every
  thinking signature is `<scrubbed>`; every init line read shows the pin.
* `synthetic-rate-limit.json` is named synthetic, is not in `recordings.json`, and carries three
  hand-built cases: a turn that ends in error after a plan rate-limit rejection (`usage_limit`), a
  turn reported as paid from usage credits (`isUsingOverage` true: stopped, `usage_limit`), and an
  `api_retry` followed by a finished answer (not a plan-limit hit).
* Hand-built lines, in the recorded shapes, for what no recording holds: a tool result that is an
  error and one that never arrives (`ok` false); a denied call (gate exit 2: `ok` false, the turn
  goes on); a tool result with no gate response, and a gate exit of 1 or 127 (each a stop,
  `cli_error`); `EndConversation` (accepted, not stored, no gate response needed); subagent text
  and thinking and tool-input deltas (never streamed); each way the init check fails.

## Task 11 · runner loop, MCP config, key guard, system prompt test, healthcheck (P-85, P-88)

Files: `workspace/src/runner.ts` (the loop and the entry), `turn.ts` (one turn), `replay.ts`,
`db.ts`, `mcp-config.ts`, `healthcheck.ts`, `alive.ts`, `config.ts` (the start-up guards join its
constants), `providers/claude-cli.ts` (the process joins the argv) and `providers/index.ts`;
`workspace/test/runner.test.ts` with its four parts under `test/runner/` (`cli-turn.suite.ts`,
`replay.suite.ts`, `db.suite.ts`, `health.suite.ts`), `test/helpers/fakes.ts`,
`test/global-setup.ts`, `test/config.test.ts`, `test/mcp-config.test.ts`,
`test/system-prompt.test.ts`.

More files than the brief's table lists, all under `workspace/`: `src/turn.ts`, `src/replay.ts`
and `src/alive.ts` (the turn, the replay and the alive file, each split out so no file passes 450
lines and each can be tested alone); `test/runner/*.suite.ts` and `test/helpers/fakes.ts` (parts of
`runner.test.ts`, which imports them, so the row's command runs them all);
`test/global-setup.ts` (builds `dist/` once per run, because the gate and the healthcheck are
tested as processes). The image copies `src/` whole, so the three new source files reach it with no
change to W-65's Dockerfile.

### Red

`c82a995`: the four test files and their parts, before `runner.ts`, `turn.ts`, `replay.ts`,
`alive.ts`, `db.ts`, `mcp-config.ts`, `healthcheck.ts` and the guards in `config.ts` existed (run
again from that commit's tree on 2026-10-06):

```
$ npx vitest run test/runner.test.ts test/mcp-config.test.ts test/config.test.ts test/system-prompt.test.ts
 ❯ test/config.test.ts (60 tests | 37 failed)
 FAIL  test/mcp-config.test.ts [ test/mcp-config.test.ts ]
Error: Cannot find module '../src/mcp-config.js' imported from <c82a995>/workspace/test/mcp-config.test.ts
 FAIL  test/runner.test.ts [ test/runner.test.ts ]
Error: Cannot find module '../src/runner.js' imported from <c82a995>/workspace/test/runner.test.ts
 Test Files  3 failed | 1 passed (4)
      Tests  37 failed | 40 passed (77)
```

The one file that passed at its first commit is `test/system-prompt.test.ts`: the brief has
`prompts/system.md` written with task 8, before the recordings, so its test could not be red at
task 11. The 23 `config.test.ts` cases that passed read constants task 8 had already written.

### Green

```
$ npx vitest run test/runner.test.ts test/mcp-config.test.ts test/config.test.ts test/system-prompt.test.ts
 Test Files  4 passed (4)
      Tests  240 passed (240)
$ npx vitest run --coverage
 Test Files  9 passed (9)
      Tests  542 passed (542)
All files         |   92.43 |    86.84 |   91.19 |   94.55 |
Statements   : 92.43% ( 867/938 )
Branches     : 86.84% ( 482/555 )
Functions    : 91.19% ( 176/193 )
Lines        : 94.55% ( 747/790 )
$ npm run typecheck
> tsc -p tsconfig.test.json
(no output, exit 0)
```

Line coverage of `src/` is 94.55 %, over the row's 80 % (`vitest.config.ts` holds the 80 as a
threshold, so the command fails under it). The two files v8 counts at 0 are
`src/healthcheck.ts` and `src/hooks/tool-gate.ts`: both are tested as built processes
(`node dist/healthcheck.js`, `node dist/hooks/tool-gate.js`), which the coverage tool does not see.

Commits: `c82a995` (red), `6816cf8` (the loop, the turn, the process, the MCP config, the key guard,
the healthcheck), `6989194` (the turn in smaller parts; tests of the real spawn and of the entry),
then three fixes from a read of the finished code, each with its test:

* `04b8fa2`: after SIGTERM and SIGKILL the turn closes its read of stdout 400 ms later, so a child
  of the CLI that still holds the pipe cannot keep a turn open; a turn whose provider reported no
  session hands `workspace_finish()` the stored session id back instead of clearing it.
* `c12f0e9`: the database client has a 10 s connect time-out, a 20 s query time-out and keep-alive,
  so an unreachable database fails a call and the watchdog can act; once a stop is asked for, what
  is in flight has 20 s, inside the service's 30 s stop grace, and the process then exits.
* `ac87bef`: a question that opens with `/` goes under the line "The new question:" on a fresh
  start and on a resumed turn alike, so the CLI does not read it as one of its own commands. It is
  still the last argv element, after `--`. This is one thing more than the Contract's argv says (the
  prompt element is the question, or the replay and the question); no recording tested how the CLI
  reads a `-p` prompt that opens with a slash.

What the tests hold, in the row's order:

* **System prompt.** One case per rule of the Contract's bullet: read-only; the file or note behind
  each fact; no invented number; speaker notes labelled; grades on the Grades screen; `collection`
  on every `search_context` call with the two names and no other; `q`, and `course` when the
  question names one; whole notes not available; other collections not listed; a quoted score
  carries its date; plain text without Markdown symbols; a cut document said to be cut. Also: it
  names the four tools and no other, carries no course AI-use rule, holds nothing bound to one
  machine, and is itself plain text.
* **One turn.** Claim, route, begin, deltas flushed every 250 ms with `seq` from 1 rising by 1, a
  delta over 16000 characters split first (counted in characters, never cutting one in half),
  finish; the content cut to 100000 characters first and the cut logged; 21 tool calls stored as
  the first 20 in call order, the cut logged, the turn still `done`; a call keeps its place when
  its result arrives later; failed and denied calls stored; `p_model` is the id the stream named,
  or null; `cost_usd` is the stream's `total_cost_usd`, never a sum; no failed turn is retried on
  another model.
* **Stops.** Stop while text streams: the child is killed within 2 s and `cancelled` is stored;
  with no text flushed for 2 s the runner calls `workspace_stream` with an empty delta, which uses
  no `seq`; Stop during a tool call is seen and the child killed within 4 s; 8 minutes stores
  `timeout`; a shutdown stores `stale_claim`; the first of two stops wins.
* **The loop.** `workspace_claim` every 2 s; oldest first, one turn at a time;
  `workspace_heartbeat` every 30 s on its own timer, during a turn too, the alive file touched
  after each success and not after a failure; no heartbeat success for 180 s ends the turn in
  flight and exits non-zero; SIGTERM and SIGINT each stop polling, kill the child, finish the turn
  as `failed` / `stale_claim` and exit 0.
* **The healthcheck**, as the built `dist/healthcheck.js`: exit 0 while the alive file's mtime is
  under 90 s old, non-zero when it is older or missing.
* **Sessions and the replay.** A fresh start passes `--session-id` with a new random uuid, never
  the conversation's id, with the stored history in front of the question; a later turn passes
  `--resume <claude_session_id>` and the question alone; the resume-missing fixture is retried
  once as a fresh start with replay, and a second failure is `cli_error` with no session id; a
  stored id that is not uuid-shaped (`not-a-uuid`, one with a flag behind it, `--fork-session`)
  never reaches argv. The replay is built newest first, at most 20 messages, within 96 KiB with its
  framing, emitted oldest first, and never repeats the request's own user message; 20 messages of
  100000 characters stay within the limit; a full replay with an 8000-character question of 4-byte
  characters keeps the prompt element under 131072 bytes.
* **The init check and the gate.** Each failing init line (another version, an API key as the
  credential, another permission mode, a third MCP server, a server not connected, a missing tool,
  `ToolSearch`) kills the turn, stores `cli_error` and logs why; one log line per init line read
  carries the request id, the version, the credential source, `permissionMode` and the model, and
  no line holds the token; a tool that ran with no `PreToolUse` response, or a gate exit of 1 or
  127, kills the turn as `cli_error`; `EndConversation` is accepted, not stored, and the turn
  finishes.
* **Error mapping**, on structured fields only: the budget-stop recording → `budget_exceeded`; the
  sign-in-expired recording → `sign_in_expired`; the synthetic plan-limit rejection →
  `usage_limit`; a turn reported as paid from usage credits is killed and stored `usage_limit`; a
  stream with no result line, a CLI that cannot start → `cli_error`; a token file that cannot be
  read → `sign_in_expired` with nothing started.
* **Start-up guards.** Refused with `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
  `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_SIMPLE` or any `CLAUDE_CODE_USE_*` set (an empty value counts
  as set); a DSN on port 6543, with no `sslmode`, or with `disable`, `allow` or `prefer`;
  `WORKSPACE_TURN_BUDGET_USD` of 0 or 1.01. No refusal prints a value. `claude/settings.json` has
  no `apiKeyHelper`, no `env` key, and `"cleanupPeriodDays": 30`.
* **O-2.** With `budgetCapHolds` false the stored content's last line is `NO_CAP_SENTENCE`, also on
  an answer cut at 100000 characters; with it true the sentence is absent.
* **MCP config.** Exactly `bb2dash` and `rag`: `bb2dash` is `node`
  `["/app/mcp-materials/dist/index.js"]` with `SUPABASE_URL=https://goultdzqcavefcgnifdy.supabase.co`
  and `SUPABASE_SERVICE_ROLE_FILE=/run/secrets/bb2dash_mcp_service_key`; `rag` is `bash`
  `["/app/mcp-rag/mcp-rag.sh"]` with no env; no string matches `postgres(ql)?://`, `sb_secret_` or
  `eyJ`; written with mode 0600. The same file pins the seam with the image: `/app/workspace/`,
  its three built entries, the hook command.
* **The database side** (`db.suite.ts`): every statement is one of the five functions; the nine
  `workspace_finish` arguments go in the function's order; no error message can carry the DSN, its
  password or its host.

What the image has to give the runner (for W-65; all of it is in the Contract): `claude` on `PATH`
(the runner starts it by that name, as an argv array), `bash` for the `rag` launcher, the empty
`/app/turn`, `/run/workspace` owned by `node`, the two secret files at their fixed paths, and
`CLAUDE_CONFIG_DIR`. The runner sets `CLAUDE_CODE_OAUTH_TOKEN`, `ENABLE_TOOL_SEARCH=false` and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` on the CLI child itself, from the token file, on every
start; the rest of the child's environment is the runner's own.

## Where the stream stands at the end of wave 1

```
$ npx vitest run            (from workspace/)
 Test Files  9 passed (9)
      Tests  542 passed (542)
$ npm run typecheck
(no output, exit 0)
$ npx vitest run --coverage
Lines        : 94.55% ( 747/790 )
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
```

By task: router 67, tool gate 78, providers and argv 54, stream parser 103, runner, MCP config,
config and system prompt 240.

Nothing under the paths the image copies (`workspace/package.json`, `package-lock.json`,
`tsconfig.json`, `src/`, `claude/`, `prompts/`) matches a pattern of `docker/grep-clean.test.mjs`
(a drive path, a `.ps1`, PowerShell, `Move-Item`, OneDrive), comments included.

Left on the host by the recordings, in no repo:

* `C:/Users/Public/bb2dash-w64-rec/`: the four line scripts, `mcp.json` (paths only),
  `settings.json` and `out/`, the raw output. `out/lookup.raw.jsonl` holds the two tool results,
  which are syllabus text. It is kept so the scrub can be run again without recording again;
  `rm -rf /c/Users/Public/bb2dash-w64-rec` removes it once the phase is merged.
* `~/.claude/projects/C--Users-Public-bb2dash-w64-rec-cwd/`: the three session transcripts the CLI
  wrote (the lookup, the budget stop, the sign-in-expired start) and an empty `memory` folder.

Each recording that started its MCP servers (the lookup, the budget stop and the sign-in-expired
start) also started one short-lived `bb2dash-mcp:local` container: the host's own registration of
the materials server is `docker run -i --rm … bb2dash-mcp:local`, and the recipe names that
registration. Each went away with its CLI: `docker ps` after the last recording lists only the two
`bb2dash-mcp:local` containers other sessions started 18 and 19 hours earlier, with
`bb2dash-sync-1`, `bb2dash-harness-jobs-1` and `harness-postgres` as they were. No docker command
was run by hand except the read-only guard and `docker ps`.

## Round 1

Fixes after the PM's independent check of wave 1 (2026-10-06). The check listed five items: one
must-fix and four minor. Three are code fixes, each read against the brief first, each with its
test committed and pushed failing before the code was written (the commit times below are minutes
apart because each fix is a few lines; no red commit in this round was split out of finished work).
Two need no code. No `claude -p` ran in this round and no fixture was recorded again; the only
docker command was the read-only guard.

### Fix 1 (must-fix) · a resumed start the runner killed is not started a second time

Where: `workspace/src/providers/claude-cli.ts`, `shouldRetryAsFresh` and the place the turn builds
its `StartOutcome`.

Confirmed against the Contract. Continuity: "a `--resume` start that exits non-zero before any
`assistant` message is retried as a fresh start with replay". Init-line check: the runner "kills
the turn before any model call, storing `cli_error`". A start the runner kills on its own stream
ends with exit code null, the rule read null as non-zero, and only the runner's abort signal was
excluded, so the turn was started again.

Red, `468e75a` (three cases in `test/runner/cli-turn.suite.ts`; each scripts a second start, so a
retry shows as what it does and not as a start that fails anyway):

```
$ npx vitest run test/runner.test.ts
     × starts the CLI once and stores cli_error, never a finished answer, when the resumed start has a refused init line
     × hands workspace_finish the stored session id unchanged for that turn
     × starts no second call when a resumed turn is reported as paid from usage credits before any assistant line: one start, usage_limit
AssertionError: expected { type: 'result', ok: true, …(4) } to match object { ok: false, errorCode: 'cli_error' }
-   "claudeSessionId": "5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a11",
+   "claudeSessionId": "7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5",
AssertionError: expected [ { …(2) }, { …(2) } ] to have a length of 1 but got 2
 Test Files  1 failed (1)
      Tests  3 failed | 152 passed (155)
```

The three failures are the check's three probes: (a) a finished answer where the Contract says
`cli_error`; (b) the killed second start's session id handed to `workspace_finish` in place of the
stored one (that case runs the real CLI turn through `startTurn` and reads the fake database's
finish call); (c) two starts, so a second call after a turn was reported as paid from usage
credits. A fourth case in the same commit is green before and after: a resumed start that a signal
from outside ended, with no output, is still retried once.

Green, `ac8a124`: `StartOutcome` gains `stoppedByStream` (the stream's `violation` is set, or its
`overage` flag), and `shouldRetryAsFresh` refuses it. The rule's six existing unit calls in
`test/stream-json.test.ts` pass the new field as false, and one more case holds the refusal.

```
$ npx vitest run test/runner.test.ts test/stream-json.test.ts
 Test Files  2 passed (2)
      Tests  259 passed (259)
$ npm run typecheck
(no output, exit 0)
```

The same three scenarios on the built `dist/`, with a fake process (a script kept outside the repo):

```
(a) resumed, init refused (rag pending), a second start would answer: starts=1 ok=false errorCode=cli_error session=stored retried=false
(b) resumed, init refused on any start: starts=1 ok=false errorCode=cli_error session=stored retried=false
(c) resumed, isUsingOverage true before any assistant line: starts=1 ok=false errorCode=usage_limit session=stored retried=false
```

The log line "the resumed session did not start; retrying once as a fresh start with replay" is
now written only for a start that ended by itself.

### Fix 2 (minor) · `usage_limit` is also read from the terminal error

Where: `workspace/src/errors.ts`, `mapTurnEnd`.

Confirmed against the Contract's Error codes bullet: "`usage_limit` when a turn ends in error after
a plan rate-limit rejection (read the terminal error, not an `api_retry` event, and read the
overage fields". The code read only a `rate_limit_event` with status `rejected`; the terminal
error's own fields were not read.

Red, `d2f749b`: a fourth scenario in `test/fixtures/synthetic-rate-limit.json`,
`planLimitTerminalErrorOnly` (the plan-limit end with no rate-limit event at all; synthetic, like
the other three, and outside the "recorded live" assertion).

```
$ npx vitest run test/stream-json.test.ts test/runner.test.ts
     × reads the terminal error itself: a rate-limit error end with no rejected event before it is usage_limit
     × maps a rate-limit error end with no rejected event before it to usage_limit (synthetic)
AssertionError: expected 'cli_error' to be 'usage_limit' // Object.is equality
 Test Files  2 failed (2)
      Tests  2 failed | 263 passed (265)
```

Green, `9bd7605`: with no rejected event, the turn is `usage_limit` when the last assistant line's
`error` is `rate_limit` and the result's `api_error_status` is 429 (`RATE_LIMIT_ERROR`,
`HTTP_TOO_MANY_REQUESTS`). Both fields are needed: four cases hold that another assistant error, no
assistant error, another status or no status each stay `cli_error`. An `api_retry` event is still
never read.

```
$ npx vitest run test/stream-json.test.ts test/runner.test.ts
 Test Files  2 passed (2)
      Tests  265 passed (265)
```

Neither form of a plan-limit end can be recorded on demand, so which fields the CLI sends is still
unproven; the mapping now takes either.

### Fix 3 (minor) · a budget with a third decimal is refused at start

Where: `workspace/src/config.ts`, `BUDGET_SHAPE` and `parseTurnBudget`.

Confirmed against the Contract ("reads `WORKSPACE_TURN_BUDGET_USD` … the value `--max-budget-usd`
receives"): the flag is written with two decimals, so `0.015` reached the CLI as `0.01` and `0.999`
as `1.00`.

Red, `eed6ac0`:

```
$ npx vitest run test/config.test.ts
     × refuses a third decimal: WORKSPACE_TURN_BUDGET_USD=0.015
     × refuses a third decimal: WORKSPACE_TURN_BUDGET_USD=0.999
     × refuses a third decimal: WORKSPACE_TURN_BUDGET_USD=0.125
     × refuses a third decimal: WORKSPACE_TURN_BUDGET_USD=1.000
     × refuses a third decimal: WORKSPACE_TURN_BUDGET_USD=0.010
AssertionError: expected function to throw an error, but it didn't
 Test Files  1 failed (1)
      Tests  5 failed | 61 passed (66)
```

Green, `b0c2216`: the accepted shape is dollars with at most two decimals, and the refusal says so.
A sixth case, green before and after, holds that every value from 0.01 to 1.00 reaches the flag as
the amount that was written.

```
$ npx vitest run test/config.test.ts
 Test Files  1 passed (1)
      Tests  66 passed (66)
$ WORKSPACE_TURN_BUDGET_USD=0.015 node dist/runner.js; echo "exit=$?"
workspace: cannot start: WORKSPACE_TURN_BUDGET_USD must be an amount from 0.01 to 1.00 with at most two decimals
exit=2
```

`1.000` and `0.010` are refused too: the rule is the written shape, not the amount.

### No code change

* **`ac87bef`, the framing of a question that opens with `/`** (`workspace/src/replay.ts`,
  `asQuestion`). The check's read is to keep it, and it is kept: the code is as it was. What it
  does, for the Contract's Argv bullet: when the question's first character after leading white
  space is `/`, the prompt element is `The new question:`, an empty line, then the question; on a
  fresh start with a replay the question already sits under that header. The argv elements and
  their order are unchanged and the prompt is still last, after `--`. No recording shows how the
  CLI reads a `-p` prompt that opens with a slash. The Contract sentence and the DECISIONS row are
  the PM's files.
* **Thirteen files outside the brief's Files table**, all under `workspace/`, for 102a to record as
  an accepted deviation: `workspace/tsconfig.test.json`, `workspace/src/alive.ts`,
  `workspace/src/replay.ts`, `workspace/src/turn.ts`, `workspace/src/hooks/gate-rules.ts`,
  `workspace/test/global-setup.ts`, `workspace/test/helpers/fakes.ts`,
  `workspace/test/scrub-recording.mjs`, `workspace/test/fixtures/recordings.json`,
  `workspace/test/runner/cli-turn.suite.ts`, `workspace/test/runner/db.suite.ts`,
  `workspace/test/runner/health.suite.ts`, `workspace/test/runner/replay.suite.ts`. Round 1 adds no
  file. The image copies `src/` whole and builds with `tsconfig.json`, so W-65's Dockerfile needs
  no change.

### Where the stream stands after round 1

```
$ npx vitest run --coverage            (from workspace/)
 Test Files  9 passed (9)
      Tests  559 passed (559)
All files         |   92.46 |    87.01 |   91.23 |   94.58 |
Lines        : 94.58% ( 751/794 )
$ npm run typecheck
(no output, exit 0)
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
$ docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z
(the value recorded before and after the recordings; unchanged)
```

By task: router 67, tool gate 78, providers and argv 54, stream parser 109, runner, MCP config,
config and system prompt 251.

Two things this round leaves for the container checks (tasks 12 and 19), neither testable without
the image:

* If the `rag` server reads `pending` on the init line inside the container (it loads its model at
  start), every turn ends `cli_error`, fresh and resumed alike. Before fix 1 a resumed turn in that
  state was started a second time and could pass by accident; it no longer is. One turn in the test
  container shows the init line's `mcp_servers`.
* The host leftovers listed above are as they were. `C:/Users/Public/bb2dash-w64-rec/out/` still
  holds the raw lookup output with syllabus text, in a folder every Windows user can read.
