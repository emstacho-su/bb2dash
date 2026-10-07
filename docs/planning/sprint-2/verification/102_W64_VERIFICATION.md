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

## Wave 2

The small fixes of ruling T3 ("Wave 2 small fixes", PM, 2026-10-06), worked the same day. First
step: `git fetch origin`, then `git merge origin/feat/workspace-21` (a fast-forward to `bbb2d28`,
since wave 1's commits were already in the phase branch; no conflict), pushed. Three fixes, each
with its test committed and pushed failing before the change, then the rename of this file, then
five readings that needed no code. No `claude -p` ran, no fixture was recorded again, and the only
docker command was the read-only guard. This file was `102_W-64_VERIFICATION.md` until this wave.

### Fix 1 · a failed call drops only the connection it ran on (`workspace/src/db.ts`)

The fault, as the check reproduced it: `createPgQuery`'s `drop()` closed whichever connection was
current. Two calls in flight on connection 1; the first fails and drops it; the next call opens
connection 2; the second call fails late and `drop()` closes the healthy connection 2.

Red, commit `317e86e` (`workspace/test/runner/db.suite.ts`, the block "with two calls in flight":
clients whose statements stay open until the test answers or fails each one):

```
$ npx vitest run test/runner.test.ts
       × a call that fails late drops the connection it ran on, never the one opened since
       × a late 57P01 from a dropped connection leaves the new one alone
AssertionError: expected 1 to be +0 // Object.is equality
 ❯ test/runner/db.suite.ts:300:30
    299|       await expect(second).rejects.toThrow(/terminated/);
    300|       expect(made[1]?.ended).toBe(0);
AssertionError: expected 1 to be +0 // Object.is equality
 ❯ test/runner/db.suite.ts:343:30
 Test Files  1 failed (1)
      Tests  2 failed | 157 passed (159)
```

`made[1]` is connection 2 and `ended` counts its `end()` calls: the late failure closed it. The
block's third case ("closes a connection once when both calls on it fail") passed on the old code
and is kept as a guard on the fix.

Green, commit `54fd3c6`:

```
$ npx vitest run test/runner.test.ts
 Test Files  1 passed (1)
      Tests  159 passed (159)
```

What changed: `drop(target)` takes the connection the failed call ran on. It clears the current
connection only when that is the same one, and closes a connection at most once. A connect that
fails drops nothing, because `connect()` already closes its own half-open client. `query.end()`
still closes the current connection. The first case also asserts that the call after the late
failure runs on connection 2 and no third connection is opened.

### Fix 2 · the byte-order mark is written as an escape (`workspace/src/config.ts` and its test)

`cleanSecret`'s regex held the invisible character itself, and `config.test.ts` built its inputs
with the same character in two template strings.

Red, commit `8ee5faf` (`workspace/test/config.test.ts`, the block "the byte-order mark in source":
it reads every `.ts` and `.mjs` file under `src/` and `test/`):

```
$ npx vitest run test/config.test.ts
     × is in no source file as a literal character
     × is written as an escape where config.ts strips it
AssertionError: expected [ 'src/config.ts', …(1) ] to deeply equal []
+   "src/config.ts",
+   "test/config.test.ts",
AssertionError: expected '/**\n * The runner\'s constants (brie…' to contain '/^\uFEFF/'
 Test Files  1 failed (1)
      Tests  2 failed | 67 passed (69)
```

Green, commit `855e9fc`:

```
$ npx vitest run test/config.test.ts
 Test Files  1 passed (1)
      Tests  69 passed (69)
$ grep -c $'\xEF\xBB\xBF' workspace/src/config.ts workspace/test/config.test.ts     (from the repo root)
workspace/src/config.ts:0
workspace/test/config.test.ts:0
$ git grep -c -I $'\xEF\xBB\xBF' -- workspace
(no output: no tracked file under workspace/ holds the three bytes)
$ grep -n 'uFEFF' workspace/src/config.ts workspace/dist/config.js
workspace/src/config.ts:135:  return raw.replace(/^\uFEFF/, '').replace(/[\r\n]/g, '').trim();
workspace/dist/config.js:115:    return raw.replace(/^\uFEFF/, '').replace(/[\r\n]/g, '').trim();
```

Two things found on the way, both worth knowing for the next edit of these lines:

* The test transformer cooks an escape inside a tagged template: `String.raw` with the escape in
  it gives the one character, not six. A first draft of the third case built its expected text
  that way and passed on the old code, so it proved nothing. The committed case builds the six
  characters from a plain string and asserts their length is 6.
* The edit that added the test's `MARK` line wrote the character where the escape was meant: the
  red commit's line holds the character, read back with `cat -A`, so the scan named the test file
  for three marks, not two. A later edit of this file kept the same escape as written, so it does
  not happen every time, and nothing on screen shows which one happened. The four marks were
  therefore rewritten by a one-off node script that builds both forms from character codes, and
  the bytes were read back with the `grep` lines above. That is the one edit of this wave not made
  with the edit tool; any later edit of these lines needs the same read-back.

### Fix 3 · `workspace/test/stream-json.test.ts` is under 800 lines

Red, commit `5a5d076` (`workspace/test/config.test.ts`, "the size of a source file", over the same
list of files as the mark scan):

```
$ npx vitest run test/config.test.ts
     × is at most 800 lines, tests and suites included
+     "file": "test/stream-json.test.ts",
+     "lines": 824,
 Test Files  1 failed (1)
      Tests  1 failed | 69 passed (70)
```

Green, commit `0eb33b3`:

```
$ npx vitest run test/config.test.ts
 Test Files  1 passed (1)
      Tests  70 passed (70)
$ npx vitest run test/stream-json.test.ts          (task 9's command)
 Test Files  1 passed (1)
      Tests  109 passed (109)
$ npx vitest run test/stream-json.test.ts --reporter=verbose | grep -c "failing closed on the gate"
12
$ wc -l test/stream-json.test.ts test/stream-json/gate.suite.ts test/helpers/stream-lines.ts
  648 test/stream-json.test.ts
  110 test/stream-json/gate.suite.ts
  110 test/helpers/stream-lines.ts
```

The describe block "failing closed on the gate" (12 cases) is now
`workspace/test/stream-json/gate.suite.ts`, which `stream-json.test.ts` imports the way
`runner.test.ts` imports its suites, so task 9's command still runs it: 109 cases before and after.
The hand-built stream lines and the `replay` helper that both files need moved to
`workspace/test/helpers/stream-lines.ts`. Nothing was rewritten on the way: a `diff` of the moved
block against lines 584 to 671 of the old file, and of the builders against lines 65 to 142 with
`export` added, prints nothing. The largest files the stream owns are now `test/runner.test.ts`
(746) and `test/runner/cli-turn.suite.ts` (718).

Two files beyond the Files table, for the PM to list with the thirteen above:
`workspace/test/stream-json/gate.suite.ts` and `workspace/test/helpers/stream-lines.ts`. Neither is
under a path the image copies.

### The rename

`git mv docs/planning/sprint-2/verification/102_W-64_VERIFICATION.md
docs/planning/sprint-2/verification/102_W64_VERIFICATION.md` (ruling T2: no hyphen). Two lines
named the old file and now name the new one: the last line of `workspace/README.md` and the `note`
of `workspace/test/fixtures/recordings.json`.

### Read, no code change

Each of the five is true as built. Line numbers are the source's at this wave's last commit.

1. **`workspace_begin` is called once per request, before the provider.** `startTurn` is called
   once per claim (`src/runner.ts:126`). Its `run()` calls `deps.rpc.begin` once
   (`src/turn.ts:229`) and returns `skipped` if that call is refused; only after it does `collect`
   run the provider (`src/turn.ts:248`). The resume retry is the loop inside the provider
   (`src/providers/claude-cli.ts:418` to `444`), which holds no database call. Tests: "routes,
   begins, flushes every 250 ms…" (one `begin` recorded), "does not run the provider when the
   request is no longer claimed at begin", and "retries a --resume that exits non-zero…" (two CLI
   starts inside one `runTurn`).
2. **A turn whose stream reported no session id hands the claimed id back to `workspace_finish`.**
   `claudeSessionId: collected.result?.claudeSessionId ?? claim.claudeSessionId`
   (`src/turn.ts:267`). The provider reports an id only from an init line, and only when it is
   uuid-shaped (`resultOf`, `src/providers/claude-cli.ts:343` to `350`); a start that never ran
   reports null. Tests: "hands back the stored session id when the provider reported none…" and
   "hands workspace_finish the stored session id unchanged for that turn".
3. **A missing or empty `claude_oauth_token` file at turn time is stored as `sign_in_expired`, and
   no CLI is started.** The token is read before the session is planned
   (`src/providers/claude-cli.ts:409` to `416`): `readOauthToken` throws for a file that is
   missing, empty or only white space (`requireSecret`, `src/config.ts:172` to `181`), the provider
   logs it and yields its one result, `sign_in_expired`, before any `spawn`. Tests: "stores
   sign_in_expired, and starts nothing, when the token file cannot be read" (no spawn call), "is
   refused when the file is missing / empty / only white space", and "stores sign_in_expired as the
   provider reported it".
4. **The fail-closed hook rule is applied when a tool result arrives.** In `onUser`
   (`src/stream-json.ts:311` to `328`) a `tool_result` for a counted tool whose `hookExit` is still
   null stops the turn as `cli_error`; a hook response whose exit code is neither 0 nor 2 stops it
   when that response arrives (`onHookResponse`, `:299` to `309`). A `tool_use` with no result is
   not a violation, and `EndConversation` is not counted (`:279`). Tests: the moved suite's first
   case and its "does not fail a turn that ended before a tool ran…" case.
5. **A question whose first character after white space is `/` is framed under the line
   `The new question:`.** `asQuestion` (`src/replay.ts:53` to `55`) tests
   `question.trimStart().startsWith('/')` and returns the header, an empty line, then the question
   as written. It is used for a resumed start and for a fresh start with no replay
   (`src/providers/claude-cli.ts:369`, `src/replay.ts:60`); with a replay the question is always
   under that header. Tests: "puts a question that opens with a slash under the question header…"
   and "never hands the CLI a prompt that opens with a slash (fresh start / resume start)".

### Where the stream stands after wave 2

```
$ npm run typecheck                    (from workspace/)
(no output, exit 0)
$ npx vitest run
 Test Files  9 passed (9)
      Tests  566 passed (566)
$ npx vitest run --coverage
 Test Files  9 passed (9)
      Tests  566 passed (566)
All files         |    92.5 |    86.97 |   91.37 |   94.59 |
  db.ts           |   94.89 |    81.08 |   95.83 |   96.34 | 73,229-230
Lines        : 94.59% ( 753/796 )
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
$ docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z
(the same value as after round 1; unchanged)
```

566 against round 1's 559: three cases for the connection, three for the mark, one for file size.
By task: router 67, tool gate 78, providers and argv 54, stream parser 109, runner, MCP config,
config and system prompt 258.

## Review round

Ruling V1 (PM, 2026-10-06; `rulings-5.md`, written into `102a_PHASE21_VERIFICATION.md` under "PM
rulings for the review round"), from `/code-review main high` (CR-1, CR-2, CR-3, CR-5, CR-6, CR-12;
CR-11 is a no-change) and `/security-review` (SR-1). First step: `git fetch origin`, then
`git merge origin/feat/workspace-21` into this branch (to `e9f0852`, no conflict), pushed; the phase
branch's one later commit (`fc4cf2f`, docs) was merged the same way before this section was written.
Each fix has its test committed and pushed failing before the code. No `claude -p` ran, no fixture
was recorded again, nothing was sent to prod, and the only docker command was the read-only guard.

### CR-1 and CR-6 · the gate rule counts allows per tool name (`workspace/src/stream-json.ts`)

The gate's answer (`hook_response`) names a tool and no call: the recordings show `hook_id`,
`hook_name`, `exit_code` and no tool-use id (`claude-stream-lookup.jsonl` line 24). So answers are
counted, never paired. `allows` holds, per tool name, the PreToolUse responses with exit 0;
`answered` holds the results that were not errors. In `onUser` a result that is not an error raises
`answered` for its name, and when that passes `allows` the turn is stopped as `cli_error`. An error
result needs no answer: its call is stored `ok: false` and the turn goes on. `EndConversation` stays
outside the rule (`counted: false`); a gate exit that is neither 0 nor 2 still stops the turn in
`onHookResponse`. `ok` is "the result arrived and is not an error" (`toolOk`); the exit code is no
part of it. `earlyHooks` and `hookExit` are gone.

The two recordings that carry tool calls and hook events were read again for their order:

| recording | order as recorded |
|---|---|
| `claude-stream-lookup.jsonl` | `tool_use` (search_materials) line 18, `hook_started` 19, `hook_response` exit 0 line 24, `tool_result` 25; `tool_use` (get_material_text) 40, `hook_started` 41, `hook_response` exit 0 line 45, `tool_result` 46; `result` 95 |
| `claude-stream-budget-stop.jsonl` | `tool_use` 19, `hook_started` 20, `result` (`error_max_budget_usd`) 23, `hook_response` exit 0 line 24, no `tool_result` at all |

(1-based line numbers.) Each allow is in the stream before the result of its call; in the budget
stop the allow comes after the `result` line and nothing is ever counted against it.

Red, `946164d` (`test/stream-json/gate-count.suite.ts`, registered by `stream-json.test.ts`):

```
$ npx vitest run test/stream-json.test.ts
 × does not end the turn on an error result for a tool the CLI does not have: the call is stored ok false and the answer goes on
 × does not end the turn on an error result for an allowed tool the CLI refused before the gate ran: the call is stored ok false and the answer goes on
 × sends the tool signal again for the error result, so the stored call is the one with its result
 × lets a later, allowed call of the same turn answer after an error result with no gate answer
 × ends the turn when the only gate answer was a deny (exit 2) and the result is not an error
 × gives each call its own result and kills nothing: the deny first, the first call answered
 × gives each call its own result and kills nothing: the allow first, the second call answered
 × ends the turn when both come back answered: two results that are not errors against one allow
 × lookup with the gate answers taken out and the first result an error: the first call is ok false and the turn goes on to the second
 Test Files  1 failed (1)
      Tests  9 failed | 124 passed (133)
```

Green, `e77f10b`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  590 passed (590)
```

A second pair, found while reading the fix: with a count, a tool-result line carried twice would be
two answers against one allow and end a good turn. A call's first result stands and only it is
counted. Red `19070e1` (`2 failed | 133 passed (135)`: "counts the result of a call once, however
many user lines repeat it", "keeps the first result of a call: a repeated line cannot turn an error
into an answer"); green `a7dd38b` (`688 passed (688)`).

The cases the round asked for by name: an error result with no hook answer (two cases: a tool the
CLI does not have, an allowed tool refused before the gate ran; the text after it still streams and
the turn maps to a finished answer); a result that is not an error with no allow (no answer at all;
a deny only; two answers against one allow; an allow for another tool); two calls of one tool in
one message where one is denied (four orders of the two gate answers and the two results, each
call keeps its own result, no stop; once more with both calls in one `assistant` line and both
results in one `user` line). The recordings are replayed as recorded, with the gate answers taken
out, with only the second taken out, and with the first result turned into an error.

Three things to know:

1. **The one call that trips the count keeps `ok: false`.** Its result is not an error, so by
   CR-6's sentence alone it would read `ok: true`. Two assertions that were already there hold it
   false (`gate.suite.ts`, first case; `stream-json.test.ts`, "never gives ok true to a call the
   gate denied, even if a result without an error flag follows"), and the turn is `cli_error`
   either way. Kept as it was (`ToolState.ungated`); a question for the PM below.
2. **An allow that an error result left unused stays in the count.** After an allowed call whose
   result is an error, a later result of the same tool with no gate answer of its own passes
   (1 answered against 1 allow). That is the count as ruled; no test asserts it as wanted.
3. One existing title changed and no assertion: "keeps call order when results arrive out of
   order" lost its second half, "and matches hooks to same-named calls in turn".

### CR-3 and CR-2 · begin and finish on one retry schedule (`workspace/src/db-retry.ts`, `turn.ts`, `runner.ts`)

`retryDbCall` (`src/db-retry.ts`, new) makes a call, and after a failure makes it again after 1 s,
2 s, 4 s, 8 s and then every 15 s, for 170 s from the first try; the last try is made as the 170 s
end. With a database that fails every try that is 16 tries, at 0, 1, 3, 7, 15, 30, 45 … 165 and
170 s. `FINISH_RETRY_MS = 170_000`, `FINISH_BACKOFF_FIRST_MS = 1000` and
`FINISH_BACKOFF_MAX_MS = 15_000` are in `src/config.ts`. A refusal the function raises itself
(SQLSTATE 22023; `REFUSAL_SQLSTATE` and `isRefusal` in `src/db.ts`) ends the tries at once.

* **Finish** (`finishWithRetry`, `turn.ts`): stored → `finished state=…`; 22023 → `finish refused,
  the request is already closed: …`, not tried again; 170 s over → `finish given up after 170 s,
  the answer is not stored and the stale-claim sweep closes the request: …`, once.
* **Begin** (`run`, `turn.ts`): 22023 → `begin refused, nothing ran`, outcome `skipped`, no finish.
  Any other failure is tried again on the same schedule. A begin that still cannot be made closes
  the request with `workspace_finish(failed, cli_error)` (empty content, no tool calls, the stored
  session id handed back), itself on the finish schedule (`closeUnbegun`).
* **The runner's own stop during begin's tries**: a shutdown ends the tries between two of them and
  the request is closed as `failed` / `stale_claim`, the code the Contract gives a turn in flight at
  shutdown. Without that a SIGTERM would wait out the 170 s.
* **The 8-minute limit counts from the start of the turn**, the time begin's tries took included
  (`Math.max(0, TURN_TIMEOUT_MS - (Date.now() - startedAt))`), so a turn whose begin was retried
  still ends under the database's 10-minute sweep. Its own red and green pair below.
* **The watchdog** (`beat`, `runner.ts`): when no heartbeat has succeeded for 180 s and the turn in
  flight is making its finish and is less than 170 s into it (`TurnHandle.finishingSince()`,
  `finishInWindow`), the runner logs once `watchdog: … held while the finish of the turn in flight
  is being retried` and does not end. The next heartbeat tick looks again; a finish call that
  never returns stops holding it when the 170 s are over. A turn that is not finishing is ended as
  before. The hold is for the finish alone, as ruled: begin's tries do not hold the watchdog.

Red, `d4a1007` (`test/runner/closing.suite.ts`, registered by `runner.test.ts`):

```
$ npx vitest run test/runner.test.ts
 × is 1 s doubling to a 15 s cap, for 170 s, which ends before the watchdog would
 × is tried again after 1 s, 2 s, 4 s and 8 s, then every 15 s, for 170 s
 × gives the answer up after 170 s, says so once, and tries no more
 × stores the whole answer when the database comes back after 4 failed tries
 × stores the whole answer when the database comes back after 8 failed tries
 × stores the whole answer when the database comes back after 15 failed tries
 × reads a 22023 as a request that is already closed: logged, not tried again
 × stops trying on a 22023 that comes after failures of another kind
 × says it is finishing only while the finish is being made
 × tries again after any other failure, on the same schedule, and then answers the request
 × does not read a failure with another SQLSTATE as "no longer claimed"
 × reads a 22023 on a later try as nothing to close too
 × closes the request as failed / cli_error when begin still cannot be made after 170 s
 × keeps trying to close a request it could not begin, on the finish schedule
 × stops trying when the runner stops the turn, and closes the request under the runner's own reason
 × does not end the process while the finish is inside its 170 s, and the answer is stored when the database comes back
 × ends the process once the 170 s are over and the database is still gone
 × is not held past the window by a finish call that never returns
 Test Files  1 failed (1)
      Tests  18 failed | 160 passed (178)
```

Green, `a5da6b6`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  609 passed (609)
```

The time limit: red `30ffaa4` (`npx vitest run test/runner.test.ts -t "counts the 8-minute limit"`:
`1 failed`, "counts the 8-minute limit from the start of the turn, the time spent on begin
included"); green `04a4b3a` (`680 passed (680)`).

Existing tests, and what happened to each:

* "gives up on workspace_finish after three tries and says so" (`runner.test.ts`) is gone: the
  ruling makes it wrong. "gives the answer up after 170 s, says so once, and tries no more" stands
  in its place.
* "does not run the provider when the request is no longer claimed at begin" is unchanged. The fake
  database's `failBegin()` now raises what migration 142 raises (`workspace_begin: request 41 is
  not claimed (it is cancelled)`, SQLSTATE 22023); it used to throw an error with no SQLSTATE.
* "tries workspace_finish again after a failure" is unchanged and passes (1 s, then 2 s).
* The turn and loop harness moved to `test/helpers/turn-harness.ts`, so the new suites share it;
  `runner.test.ts` went from 746 to 685 lines.

### CR-5 · the CLI gets 10 s to exit after its result line (`workspace/src/providers/claude-cli.ts`, `turn.ts`)

`RESULT_EXIT_GRACE_MS = 10_000` (`src/config.ts`). When the stream gives its `result` signal the
provider arms a timer (`createLingerGuard`); a CLI still there when it runs out is logged (`the CLI
did not exit within 10 s of its result line: killing it, the result is kept`) and killed by the
existing sequence (SIGTERM, SIGKILL after 1.5 s, the output closed 0.4 s later). The result event
carries `reported` (`providers/types.ts`): true when a result line was read. The runner's abort
decides the code only when it cut the turn before a result line (`resultOf`); and in `endingOf`
(`turn.ts`) the 8-minute limit does not overrule a reported result, so a turn that produced a
result is never stored as `timeout`, also when the limit falls inside the 10 s. The owner's Stop
and a shutdown still decide the code (`cancelled`, `stale_claim`).

The one recovery is unchanged by this: a `--resume` that found no session (one error result, no
assistant message) and then stayed is killed, ends with no exit code, and is started again as
fresh, as a resume that exits 1 by itself is.

Red, `e099c21` (`test/runner/result-grace.suite.ts`):

```
$ npx vitest run test/runner.test.ts
 × is 10 s, and with the kill sequence still far inside the 8-minute limit
 × kills a CLI that is still there after that time, and keeps the result
 × kills nothing when the CLI exits by itself inside that time
 × goes on to SIGKILL and closes the output when the CLI ignores SIGTERM and its pipe stays open
 × keeps the whole lookup recording when the CLI stays after it
 × keeps an error result as it was reported: a budget stop that stays is budget_exceeded, not cli_error
 × still makes the one recovery: a resume that found no session and then stayed is started again as fresh
 × keeps the result when the runner's abort arrives while the CLI is being given its time
 × says a result was not reported when the turn was cut before its result line
 × says a result was not reported when the process ends with no result line
 × is never stored as timeout: the limit falling on a reported result keeps the answer
 × keeps a reported error result under its own code, not timeout
 Test Files  1 failed (1)
      Tests  12 failed | 181 passed (193)
```

Green, `1f704b5`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  624 passed (624)
```

Two assertions that compare the whole result event gained the new field (`cli-turn.suite.ts`:
`reported: true` on the lookup recording's result, `reported: false` on a start that printed
nothing). `failure()` (no CLI was started) carries no `reported`.

### CR-12 · one `messageOf`, one uuid shape (`workspace/src/errors.ts`)

`messageOf` is declared in `src/errors.ts` and imported by `turn.ts`, `runner.ts`, `db.ts`,
`db-retry.ts` and `providers/claude-cli.ts`; the copies in `turn.ts`, `runner.ts` and
`claude-cli.ts` are gone, and `db.ts` no longer spells it out inline. The uuid shape was already
written in one file under `workspace/src` (`UUID_SHAPE`, `providers/claude-cli.ts`, behind
`isUuidShaped`); the two other copies CR-12 counted are in `web/src` (W-66's). An audit in
`config.test.ts` pins both.

The same commit closes a gap found on the way: `tsconfig.test.json` extends `tsconfig.json`, whose
`exclude` holds `test`, and an `exclude` that is not written again is inherited. So `npm run
typecheck` read `src/` and `vitest.config.ts` and none of the tests (`npx tsc -p tsconfig.test.json
--listFilesOnly` listed 20 files, none under `test/`). `tsconfig.test.json` now names its own
`exclude` (`node_modules`, `dist`); the listing then held the 21 files that were under `test/` at
that commit, and they passed as they were.

Red, `c027401`:

```
$ npx vitest run test/config.test.ts
 × declares messageOf in errors.ts and nowhere else under src/
 × imports messageOf from errors.ts in every other source file that calls it
 × reads the tests: tsconfig.test.json names its own exclude, without the test folder the build leaves out
 Test Files  1 failed (1)
      Tests  3 failed | 72 passed (75)
```

Green, `0440514`:

```
$ npm run typecheck
(no output, exit 0)
$ npx vitest run
 Test Files  9 passed (9)
      Tests  629 passed (629)
```

### SR-1 · the connection is verified against the pinned CA whatever the DSN says (`workspace/src/config.ts`, `db.ts`)

* **The CA is read at start.** `readDbCa` (`config.ts`) reads the file `WORKSPACE_DB_CA_FILE` names
  (`DB_CA_FILE_ENV`), or `/app/certs/prod-ca.crt` (`PATHS.dbCaFile`) when it is unset or blank. A
  file that is missing, empty, only white space, or holds no `-----BEGIN CERTIFICATE-----` block is
  a `ConfigError` (exit 2, `cannot start: …`): the message names the file and the variable, never
  what the file holds. The text reaches `RunnerConfig.dbCa` as it is in the file, without a
  byte-order mark. The environment and the DSN are still checked before it is read.
* **The client is built from parts.** `dsnParts` (`db.ts`) takes host, port, user, password and
  database out of the DSN (percent-decoded; port 5432 when none is named) and nothing of its query
  string. `newPgClient(dsn, ca)` hands the driver those five with
  `ssl: { ca, rejectUnauthorized: true, servername: host }` and no `connectionString`.
  `createPgQuery` takes `ca` and passes it on every connect.
* **Every part must be there.** The driver fills an empty host, user, password or database from
  the `PG*` environment or its defaults, so `dsnParts` refuses a DSN without one, and
  `assertRunnerDsn` refuses it at start (`workspace_runner_db_url names no password`). Its own red
  and green pair below.
* **The DSN check.** Port 6543 is still refused. `no-verify` is no longer accepted: the modes are
  `require`, `verify-ca`, `verify-full`. The refusals name `sslmode=verify-full` and no unverified
  form; the README gained "The database connection" and recommends none either. The stored
  secret's form (`?uselibpqcompat=true&sslmode=require`) is accepted unchanged, and its flags
  decide nothing.

What the driver does with the same DSN as a string, which is why the string is never passed
(`pg` 8.23.0; the first two and the last line are cases in the suite, the third is what the red
run showed):

```
"?uselibpqcompat=true&sslmode=require"  →  ssl {"rejectUnauthorized":false}
"?sslmode=no-verify"                    →  ssl {"rejectUnauthorized":false}
"?sslmode=verify-full&sslrootcert=…"    →  the driver opens the file the DSN names
from parts, any of the above            →  ssl {"ca":"<the pinned CA>","rejectUnauthorized":true,"servername":"<host>"}
```

The handshake is tried for real, against a stand-in pooler on the loopback interface
(`test/helpers/fake-pooler.ts`: it accepts the SSLRequest, does the TLS handshake with the
certificate it was given, and greets a client that got through; it speaks no SQL). The CA and the
server certificates are made for the run by `test/helpers/throwaway-ca.ts` with node:crypto (a P-256
key pair and a few lines of DER); nothing is read from a file or written to one, and no key
outlives the process, so no real key is involved. What the handshake gives:

```
signed by the pinned CA, for the host dialled        connected (user, database and application_name as the DSN and db.ts give them)
signed by another CA, its own certificate sent too   SELF_SIGNED_CERT_IN_CHAIN: self-signed certificate in certificate chain
signed by another CA, sent alone                     UNABLE_TO_VERIFY_LEAF_SIGNATURE: unable to verify the first certificate
signed by the pinned CA, for another host name       ERR_TLS_CERT_ALTNAME_INVALID: Hostname/IP does not match certificate's altnames
```

(The codes were read once with a throwaway probe that was not committed; the third line is from
that probe only, the committed impostor sends its CA's certificate as the real pooler does.) The
second line is the code the PM saw on the host against the system store. The impostor is refused
the same way under six forms of the DSN (the stored form, `sslmode=no-verify`, `sslmode=disable`,
`ssl=false`, another `sslrootcert`, no flag at all) and, under the stored form, with
`NODE_TLS_REJECT_UNAUTHORIZED=0` set; each time the pooler receives no startup message. Pinning the
other CA turns both answers round. A separate case sets `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
`PGDATABASE`, `PGSSLMODE=disable` and `PGSSLROOTCERT` and reads the built client: every part and
the `ssl` object are still the DSN's and the pinned CA's.

Red, `0fa1a4c` (`test/runner/db-tls.suite.ts`, `test/config.test.ts`; the commit message says
forty-one cases, the run says 40):

```
$ npx vitest run
 × refuses sslmode=no-verify
 × refuses sslmode=NO-VERIFY
 × recommends no unverified form in any refusal, and names the verified one
 × is read at /app/certs/prod-ca.crt when WORKSPACE_DB_CA_FILE is not set
 × is read at the file WORKSPACE_DB_CA_FILE names, and only there
 × reads WORKSPACE_DB_CA_FILE="" as not set
 × reads WORKSPACE_DB_CA_FILE="   " as not set
 × keeps the certificate text as the file holds it, line ends included, without a byte-order mark
 × refuses to start when the CA file is missing | empty | only white space | not a certificate | a private key and no certificate   (5)
 × refuses to start when the file WORKSPACE_DB_CA_FILE names is missing, even with the default file in place
 × is named in the README, which recommends no unverified form of the DSN
 × reads the host, the port, the user, the password and the database, and nothing else
 × decodes a user and a password that are percent-encoded
 × reads port 5432 when the DSN names none
 × refuses a DSN with no host | no user | no password | no database | text that is not a URL, so no part is ever filled in from somewhere else   (5)
 × builds a client that verifies against the given CA and the host name: (the six forms)   (6)
 × takes nothing from the PG* environment: not the host, the user, the password, the database, the port or the ssl mode
 × hands the DSN and the CA to the client it opens, on every connect
 × refuses a pooler whose certificate another CA signed, whatever the DSN says: (the six forms)   (6)
 × refuses the same pooler when only the other CA is pinned: the pin, not the system store, decides
 × refuses a certificate the pinned CA signed for another host name
 × fails the call, with nothing of the DSN in the message, when the runner meets the impostor
 Test Files  2 failed | 7 passed (9)
      Tests  40 failed | 639 passed (679)
```

On the code as built the client connected to the impostor under the stored form (`expected null
not to be null`), and with `sslrootcert` in the DSN the driver went to open the named file
(`ENOENT … another-ca.crt`, from `pg-connection-string`).

Green, `d591423`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  679 passed (679)
```

The parts at start: red `d4c0464` (`npx vitest run test/config.test.ts`: `4 failed | 97 passed
(101)`, "refuses a DSN that names no host | user | password | database, and says which part without
printing any"); green `b75d210` (`686 passed (686)`). The host case was reworded in the green
commit: a DSN with a user and no host is not a URL at all, and is refused as that.

Existing tests: `goodFiles` and the byte-order-mark case in `config.test.ts` gained the CA file;
`db.suite.ts` passes a stand-in CA to `createPgQuery` and `newPgClient` (their signatures grew);
"refuses sslmode=%s" gained `no-verify`. No assertion was loosened.

For W-65: the runner now needs a readable PEM file at `/app/certs/prod-ca.crt`, or at the path
`WORKSPACE_DB_CA_FILE` names, before it will start; without it the container exits 2 with
`cannot start: the CA file … is missing or empty`.

### CR-11 · no change

`BUDGET_CAP_HOLDS`, `NO_CAP_SENTENCE` and `TURN_CONCURRENCY` are as they were (`src/config.ts`);
their tests pass unchanged.

### Files of the round

New under `workspace/` (W-64 owns the folder): `src/db-retry.ts`; `test/helpers/turn-harness.ts`,
`test/helpers/fake-pooler.ts`, `test/helpers/throwaway-ca.ts`; `test/runner/closing.suite.ts`,
`test/runner/result-grace.suite.ts`, `test/runner/db-tls.suite.ts`;
`test/stream-json/gate-count.suite.ts`. Changed: `src/config.ts`, `src/db.ts`, `src/errors.ts`,
`src/runner.ts`, `src/stream-json.ts`, `src/turn.ts`, `src/providers/claude-cli.ts`,
`src/providers/types.ts`, `README.md`, `tsconfig.test.json`, and the tests named above. Nothing
outside `workspace/` but this file. Migrations 140, 141 and 142 were read, not touched.

One tool note: the change to `src/stream-json.ts` in `e77f10b` was applied with a short node script
(exact-string replaces, written back as LF; `git diff` showed no carriage return) and not with the
editor tool. Every other change was made with the editor tool.

### Where the stream stands after the review round

```
$ npm run typecheck                    (from workspace/; it now reads test/ as well)
(no output, exit 0)
$ npx vitest run
 Test Files  9 passed (9)
      Tests  688 passed (688)
$ npx vitest run --coverage
 Test Files  9 passed (9)
      Tests  688 passed (688)
All files         |   92.89 |    88.28 |   91.98 |   94.84 |
  config.ts       |   98.95 |    93.47 |     100 |   98.88 | 142
  db-retry.ts     |   90.32 |       80 |     100 |    92.3 | 39-40
  db.ts           |   94.69 |    82.89 |   96.15 |   95.83 | 74,231,294-295
  runner.ts       |   77.96 |       75 |   64.28 |   82.17 | ...213,223,228-232
  stream-json.ts  |   98.47 |    90.27 |     100 |     100 | ...321-325,345,374
  turn.ts         |   97.65 |    94.11 |     100 |     100 | 113,129,137,192
  claude-cli.ts   |   96.72 |     91.5 |   97.56 |   99.35 | 257
Lines        : 94.84% ( 847/893 )
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
$ docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z
(the same value as after wave 2; unchanged)
```

688 against wave 2's 566. By file: `config.test.ts` 101, `runner.test.ts` 224,
`stream-json.test.ts` 135, `tool-gate.test.ts` 78, `router.test.ts` 67, `claude-argv.test.ts` 43,
`system-prompt.test.ts` 17, `mcp-config.test.ts` 12, `providers.test.ts` 11. The size audit passes:
the longest file is `test/runner/cli-turn.suite.ts` at 719 lines, the longest under `src/` is
`providers/claude-cli.ts` at 490.

### Questions for the PM

1. **A begin whose answer was lost.** Migration 142 raises 22023 from `workspace_begin` for two
   things: "request … is not claimed" and "request … already has its assistant message" (the two
   `raise exception` of section 3). If a begin commits and its reply is lost, the next try gets the
   second, which by the ruling reads as "nothing to close": the request stays claimed with an
   unfinished assistant row until the 10-minute sweep. Built to the letter (the case "reads a 22023
   on a later try as nothing to close too"). One way out that is safe on 142 and on 143: a 22023
   that follows a failure of another kind closes the request with `workspace_finish(failed,
   cli_error)`.
2. **A request closed with no begin has no assistant row.** `workspace_finish` then updates no
   message and its `done` broadcast carries `message_id` null; the request reads `failed` /
   `cli_error`. Does the page show a line for it (W-66)?
3. **`ok` on the call that trips the count** (above, CR-1 and CR-6, point 1): false as built, true
   by CR-6's sentence alone. Which?
4. **The start-up check also refuses a CA file that holds no PEM certificate**, beyond "missing or
   empty": otherwise the fault shows only at the first connect. Say if it should go.
5. **A tool result for a call the stream never showed** (no `assistant` line with that tool-use
   id) is still passed over, as before the round: with no call there is no tool name to count
   under. Recorded, not changed.
6. Contract sentences the round makes owed in the brief (the PM's file): the config bullet ("refuses
   … on port 6543 or without an `sslmode`") now also refuses `no-verify`, a DSN without one of the
   five parts, and a missing CA; the watchdog sentence gains the hold; the runner's constants list
   gains `FINISH_RETRY_MS` and `RESULT_EXIT_GRACE_MS`.

### Second pass · after the PM's independent check

The check read the round as built and found ruling V1 met on every item, with one must-fix (a
missing test) and six minors. This pass did the must-fix and the one minor whose fix needs no
ruling. First step: `git fetch origin`, `git merge origin/feat/workspace-21` (`Already up to date`:
the branch was 19 commits ahead of the phase branch and none behind). No `claude -p` ran, no
fixture was recorded again, nothing was sent to prod and no SQL ran, and the only docker command
was the read-only guard.

#### CR-5 · the 10 s is tied to the provider (must-fix, test only)

Every case in `test/runner/result-grace.suite.ts` handed the turn a 60 ms stand-in
(`resultExitGraceMs: GRACE_MS`), so the literal was pinned and the kill was tested, and nothing
tied the two: with `deps.resultExitGraceMs ?? 60_000` at `claude-cli.ts:403` the suite passed. One
case was added to "the time a CLI gets to exit after its result line". It builds the turn with no
time of its own (`harness(scripts, { resultExitGraceMs: undefined })`) on a fake clock: after the
result line nothing is killed at `RESULT_EXIT_GRACE_MS - 1`, the signals are `['SIGTERM']` one
millisecond later, the result is `{ ok: true, errorCode: null, reported: true }` with the whole
text, and the log says `did not exit within 10 s of its result line` once.

There is no source change, so there is no commit on which the test fails. The red runs were made
against two mutants of line 403 in the working tree, neither committed, and the line was put back
before the commit (`git status` showed the suite file alone):

```
$ npx vitest run test/runner.test.ts          (claude-cli.ts:403 as `deps.resultExitGraceMs ?? 60_000`)
 × is the 10 s itself when the turn is built with no time of its own: nothing at 9.999 s, SIGTERM at 10 s
AssertionError: expected [] to deeply equal [ 'SIGTERM' ]
 Test Files  1 failed (1)
      Tests  1 failed | 224 passed (225)

$ npx vitest run test/runner.test.ts          (claude-cli.ts:403 as `deps.resultExitGraceMs ?? 9_999`)
 × is the 10 s itself when the turn is built with no time of its own: nothing at 9.999 s, SIGTERM at 10 s
AssertionError: expected [ { signal: 'SIGTERM', …(1) } ] to deeply equal []
 Test Files  1 failed (1)
      Tests  1 failed | 224 passed (225)
```

Green on the code as built, `bf846d4` (the test alone):

```
$ npx vitest run test/runner.test.ts
 Test Files  1 passed (1)
      Tests  225 passed (225)
```

#### SR-1 · the start check refuses what the connection cannot read (minor)

`assertRunnerDsn` (`config.ts`) and `dsnParts` (`db.ts`) disagreed on one input. A DSN whose user,
password or database holds a malformed percent escape passed the start check and was then refused
by `dsnParts` on every connect, so the container would loop through the 180 s watchdog instead of
exiting 2 with the reason. Port 0 has the same shape: it passed, and the driver reads 0 as no port
and takes `PGPORT` or its own default. `assertRunnerDsn` now decodes the three parts as `dsnParts`
does and refuses with `workspace_runner_db_url holds a part that is not percent-encoded text`, and
refuses port 0 beside 6543 (`workspace_runner_db_url points at port 0, which is no port; use the
session pooler on 5432`; `NO_PORT`, written `:0/` or `:00/`). Neither message prints a part of the
DSN. The README's "The database connection" names the refusals.

Red, `203a154` (`test/config.test.ts`):

```
$ npx vitest run test/config.test.ts
 × refuses at start a DSN whose user holds a malformed percent escape, which the connection could never read
 × refuses at start a DSN whose password holds a malformed percent escape, which the connection could never read
 × refuses at start a DSN whose database holds a malformed percent escape, which the connection could never read
 × refuses port 0 (written :0/), and says so without printing any part
 × refuses port 0 (written :00/), and says so without printing any part
AssertionError: expected function to throw an error, but it didn't
 Test Files  1 failed (1)
      Tests  5 failed | 102 passed (107)
```

The sixth new case ("still accepts a user, a password and a database that are percent-encoded as
they should be") passes before and after: it holds the fix to what is malformed.

Green, `b8774ed`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  695 passed (695)
```

`dsnParts` itself still reads port 0 as 0. No start reaches it with one: `main()` builds the
connection from `loadConfig`'s DSN, which `assertRunnerDsn` has passed.

#### Not changed: the PM's to rule

Four of the check's minors say "PM rules" or "none needed for V1", and no ruling on them is in
`rulings-5.md`. Nothing was built for them.

1. **`ok` on the call that trips the count** (`stream-json.ts:206`, `:334`). False as built; the
   check recommends keeping it and patching CR-6's sentence to "the result is not an error and the
   call did not trip the count". No code change either way until the PM says.
2. **Begin's lost reply** (`turn.ts:274-277`, `db-retry.ts:59`). Still built to CR-2's letter: a
   22023 on any try is "nothing to close". The check reproduced the remainder (a network failure,
   then 22023 "already has its assistant message": `skipped`, no finish, the request claimed until
   the 10-minute sweep) and recommends closing it. What it would take: `retryDbCall` says on its
   `refused` end whether an earlier try failed; `run()` sends that case to `closeUnbegun`; the case
   at `closing.suite.ts:159` ("reads a 22023 on a later try as nothing to close too") is replaced.
3. **A result for a tool-use id the stream never showed** (`stream-json.ts:325-327`). The check
   asks for one resumed-session recording that uses a tool before a ruling. There is none: of the
   four fixtures two carry tool calls and both were started with `--session-id`; the only `--resume`
   recording is the one-line `claude-stream-resume-missing.jsonl`. In both tool recordings every
   `tool_result` follows its own `tool_use` (0 results for an id not shown before). Whether the CLI
   replays old results on `--resume` cannot be read from what is recorded, and a new recording
   needs `claude -p`, which no worker runs.
4. **The watchdog hold's two edges** (`runner.ts:106-109`, `:79-88`). As ruled; the check says none
   is needed for V1.

The seventh item (no test reads `main()`'s wiring of the CA) is no change in this stream: V2's
container check proves it.

#### Where the stream stands after the second pass

```
$ npm run typecheck                    (from workspace/)
(no output, exit 0)
$ npx vitest run
 Test Files  9 passed (9)
      Tests  695 passed (695)
$ npx vitest run --coverage
 Test Files  9 passed (9)
      Tests  695 passed (695)
All files         |   93.03 |    88.32 |   91.98 |   94.99 |
  config.ts       |   99.02 |    93.75 |     100 |   98.95 | 144
  db-retry.ts     |   90.32 |       80 |     100 |    92.3 | 39-40
  db.ts           |   95.57 |    82.89 |   96.15 |   96.87 | 74,294-295
  runner.ts       |   77.96 |       75 |   64.28 |   82.17 | ...213,223,228-232
  stream-json.ts  |   98.47 |    90.27 |     100 |     100 | ...321-325,345,374
  turn.ts         |   97.65 |    94.11 |     100 |     100 | 113,129,137,192
  claude-cli.ts   |   96.72 |     91.5 |   97.56 |   99.35 | 257
Lines        : 94.99% ( 854/899 )
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
$ docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z
(the same value as after the review round; unchanged)
```

695 against the review round's 688: `config.test.ts` 107 (was 101), `runner.test.ts` 225 (was
224), the other seven files as they were. The size audit passes: the longest file is still
`test/runner/cli-turn.suite.ts` at 719 lines; `test/config.test.ts` is 576, `src/config.ts` 273.
Changed in this pass: `src/config.ts`, `README.md`, `test/config.test.ts`,
`test/runner/result-grace.suite.ts` and this file. Every change was made with the editor tool.

## Review round, second pass

Ruling X1 of `rulings-6.md` (the PM, 2026-10-06), item by item. The "Second pass" above this
heading answered `rulings-5.md`; this one answers what the review round's workers and checks
raised. First step: `git fetch origin`, `git merge origin/feat/workspace-21` (one commit, the PM's
`8680abc` in 102a; no conflict), pushed as `8df9647`.

The code and its tests are eleven commits of 2026-10-06, `d2f6325` to `fa84d36`, all on origin.
Every run quoted below was made again on 2026-10-07 in a copy of `workspace/` outside the worktree
(the session's scratch folder; `git archive <commit> workspace/src workspace/test` laid over a copy
with its own `node_modules`), so each red run is the named commit's own tree and each mutant is one
edit to that copy, never to the worktree. The copy at `8df9647` with no edit: 9 files, 714 passed.
No `claude -p` ran, no fixture was recorded again, nothing was sent to prod and no SQL ran, and the
only docker command was the read-only guard.

### 1 · Begin's lost reply (`workspace/src/db-retry.ts`, `turn.ts`)

`retryDbCall`'s `refused` end says whether a failed try came before the refusal (`afterFailure`:
only a try that failed in another way is followed by another try, so a refusal on any try but the
first has one). `run()` reads a refusal as "nothing to close" (`skipped`, no finish) only on the
first try. A refusal after a failed try goes to `closeUnbegun`, which calls
`workspace_finish(failed, cli_error)` with no content, no tool calls and the stored session id, on
the finish schedule; when that finish is itself refused (the request was closed after all) it is
logged once and not tried again. The log line: `begin refused after a failed try, its reply may
have been lost, nothing ran; closing the request as cli_error: …`. The case "reads a 22023 on a
later try as nothing to close too" (CR-2's letter) is replaced by four.

Red, `d2f6325` (`test/runner/closing.suite.ts`):

```
$ npx vitest run
 × closes the request as failed / cli_error when a 22023 follows a database that could not be reached in the same turn
 × closes the request as failed / cli_error when a 22023 follows a statement the database cut in the same turn
 × keeps trying to close a request whose begin was refused after a failure, on the finish schedule
 × asks for the close once when the request turns out to be closed already: the finish is refused and not tried again
AssertionError: expected { state: 'skipped', errorCode: null } to deeply equal { state: 'failed', …(1) }
 Test Files  1 failed | 8 passed (9)
      Tests  4 failed | 694 passed (698)
```

Green, `a145cd8`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  698 passed (698)
```

"A 22023 on the first try still skips" is held from both sides. Two mutants of the one condition in
`run()`, on the copy at `8df9647`:

```
$ npx vitest run          (`if (begun.outcome === 'refused') {`: every refusal skips, the code before X1)
 the same four cases as the red run fail
      Tests  4 failed | 710 passed (714)

$ npx vitest run          (no refusal skips)
 × reads a 22023 on the first try as nothing to close: nothing runs and nothing is finished
 × does not run the provider when the request is no longer claimed at begin
AssertionError: expected { state: 'failed', …(1) } to deeply equal { state: 'skipped', errorCode: null }
      Tests  2 failed | 712 passed (714)
```

### 2 · A finish never arrives after the stale sweep (`workspace/src/config.ts`)

`FINISH_RETRY_MS = 110_000`. Nothing else holds the number: the backoff counts its window from it
(`retryDbCall`, 1 s doubling to the 15 s cap, the last try made as the window ends), the watchdog
hold reads it (`finishInWindow`, `runner.ts`), and the give-up line prints it (`finish given up
after 110 s, …`). The tries are made 0, 1, 3, 7, 15, 30, 45, 60, 75, 90, 105 and 110 s after the
first: twelve, where 170 s gave sixteen. The sentences that named 170 now name 110: the comment on
the constant, the headers of `db-retry.ts`, `runner.ts` and `turn.ts`, and in
`test/runner/closing.suite.ts` the header, `SCHEDULE` and its comment, six case names and the
comment on where the window ends (270 s, now 210 s). The case
"stores the whole answer when the database comes back after %s failed tries" has its last row at
11 failures and 110 s (was 15 and 170 s), and the watchdog case lets the database back at 186 s so
that the try at 190 s is the one that stores the answer (the window now ends at 210 s).

```
$ grep -rn -E '170 s|170_000|170000' workspace/src workspace/test workspace/README.md | wc -l
0
```

The review round's CR-3 section above still says 170: it is the record of what was built then.

Two cases are new. "fits behind the 8-minute limit inside the 10 minutes the database leaves a
request claimed" is the arithmetic (`TURN_TIMEOUT_MS + FINISH_RETRY_MS` under 600 000). "makes its
last try inside the 10-minute claim when the turn was killed at the 8-minute limit" runs a turn
with no result against a database that fails every finish: the first try is 480 s after the turn's
start, the last 590 s, none at 600 s or later.

Red, `83a2c08`:

```
$ npx vitest run
 × is 1 s doubling to a 15 s cap, for 110 s, which ends before the watchdog would
 × fits behind the 8-minute limit inside the 10 minutes the database leaves a request claimed
 × is tried again after 1 s, 2 s, 4 s and 8 s, then every 15 s, for 110 s
 × gives the answer up after 110 s, says so once, and tries no more
 × stores the whole answer when the database comes back after 11 failed tries
 × makes its last try inside the 10-minute claim when the turn was killed at the 8-minute limit
 × closes the request as failed / cli_error when begin still cannot be made after 110 s
AssertionError: expected 170000 to be 110000 // Object.is equality
AssertionError: expected 650000 to be less than 600000
AssertionError: expected [ +0, 1000, 3000, 7000, 15000, …(11) ] to deeply equal [ +0, 1000, 3000, 7000, 15000, …(7) ]
AssertionError: expected 'turn request=41 finish given up after…' to match /110 s/
AssertionError: expected 120000 to be 110000 // Object.is equality
 Test Files  1 failed | 8 passed (9)
      Tests  7 failed | 693 passed (700)
```

Green, `2ee9eb0`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  700 passed (700)
```

The hold follows the window and a test fails when it does not. A mutant of `finishInWindow` on the
copy at `8df9647`:

```
$ npx vitest run          (`Date.now() - since < 170_000` in place of `< FINISH_RETRY_MS`)
 × is not held past the window by a finish call that never returns
AssertionError: expected null to be 1 // Object.is equality
      Tests  1 failed | 713 passed (714)
```

### 3 · The three bounds are read from the client as built (`test/runner/db-tls.suite.ts`)

Test only, `eced0d7`. The case it replaces read `PG_CLIENT_OPTIONS.connectionTimeoutMillis`, the
constant, so a `newPgClient` that dropped a bound passed. "carries the three bounds on the client
as built: the time a connect gets, the time a query gets, the keep-alive" reads them from the
client `newPgClient` returns, each from the field the driver acts on (pg 8.23.0, the pin):
`_connectionTimeoutMillis` (`client.js:116`, the timer armed at `:167`),
`connectionParameters.query_timeout` (`connection-parameters.js:124`, read at `client.js:702`) and
`connection._keepAlive` (`connection.js:24`, used at `:48`). It asserts they equal the three of
`PG_CLIENT_OPTIONS` and that each is switched on (over 0, over 0, `true`): left out of the options
the driver reads 0, `false` and `false`. The client's name has its own case.

There is no source change, so no commit on which the test fails. The proof is three mutants of
`newPgClient` in the copy at `8df9647`, one bound dropped in each
(`const { <name>: _dropped, ...bounds } = PG_CLIENT_OPTIONS;` and `...bounds` in the options):

```
$ npx vitest run test/runner.test.ts          (connectionTimeoutMillis dropped)
 × carries the three bounds on the client as built: the time a connect gets, the time a query gets, the keep-alive
AssertionError: expected { connectionTimeoutMillis: +0, …(2) } to deeply equal { Object (connectionTimeoutMillis, query_timeout, ...) }
-   "connectionTimeoutMillis": 10000,
+   "connectionTimeoutMillis": 0,
 Test Files  1 failed (1)
      Tests  1 failed | 238 passed (239)

$ npx vitest run test/runner.test.ts          (query_timeout dropped)
 × carries the three bounds on the client as built: the time a connect gets, the time a query gets, the keep-alive
AssertionError: expected { Object (connectionTimeoutMillis, query_timeout, ...) } to deeply equal { Object (connectionTimeoutMillis, query_timeout, ...) }
-   "query_timeout": 20000,
+   "query_timeout": false,
 Test Files  1 failed (1)
      Tests  1 failed | 238 passed (239)

$ npx vitest run test/runner.test.ts          (keepAlive dropped)
 × carries the three bounds on the client as built: the time a connect gets, the time a query gets, the keep-alive
AssertionError: expected { Object (connectionTimeoutMillis, query_timeout, ...) } to deeply equal { Object (connectionTimeoutMillis, query_timeout, ...) }
-   "keepAlive": true,
+   "keepAlive": false,
 Test Files  1 failed (1)
      Tests  1 failed | 238 passed (239)
```

The same three mutants on the commit before the test, `2ee9eb0`, each pass
(`Tests  230 passed (230)`): that was the check's must-fix. Green on the code as built, `eced0d7`:

```
$ npx vitest run
 Test Files  9 passed (9)
      Tests  701 passed (701)
```

### 4 · Four small ones, each with a test that can fail

**The redaction on the connection-error listener** (`test/runner/db.suite.ts`, test only,
`98c4c32`). Three cases under "a connection error between calls" fire the `error` listener
`createPgQuery` puts on its client, as the driver does when a socket fails with no call in flight:
the line is logged once with the DSN, its password and its host taken out; the next call connects
afresh; an error on a connection already replaced leaves the one in use alone. On the copy at
`8df9647`, the listener logging `error.message` as it came:

```
$ npx vitest run
 × is logged once, with the DSN, its password and its host taken out
AssertionError: expected 'db: connection error: read ECONNRESET…' to contain '<redacted>'
      Tests  1 failed | 713 passed (714)
```

**The `!linger.fired()` guard** (`test/runner/result-grace.suite.ts`, test only, `98c4c32`). A CLI
that stays after its result line is killed and the line `did not exit within … of its result line`
is written once; the exit on SIGTERM that the kill causes is not a second line. A second case
holds the other side: a CLI that exits 1 by itself after its result line is still logged (`the CLI
exited 1: the budget is used up`). With the guard taken out of the condition:

```
$ npx vitest run
 × does not also log a CLI it killed after the result line as an exit on a signal
AssertionError: expected [ Array(1) ] to deeply equal []
+   "turn request=41 the CLI exited on SIGTERM: Terminated",
      Tests  1 failed | 713 passed (714)
```

Both mutants pass on the commit before these cases, `eced0d7` (`Tests  231 passed (231)` of
`test/runner.test.ts`). Green, `98c4c32`: `Tests  706 passed (706)`.

**`messageOf` falls back to the error's code** (`workspace/src/errors.ts`). An `Error` with an
empty message says its `code` when that is text; with a message it says the message whatever the
code; with neither it stays empty; anything that is not an `Error` is its text, as before. Node
reports a refused connect to a host with two addresses as an `AggregateError` with no message and
`code: 'ECONNREFUSED'`, and a line such as `heartbeat failed: ` ended in nothing. Red, `f2f6ce7`
(`test/providers.test.ts`, `test/runner/db.suite.ts`):

```
$ npx vitest run
 × is the Error's code when its message is empty
 × names a failed connect by its code when the error carries no message
AssertionError: expected '' to be 'ECONNREFUSED' // Object.is equality
 Test Files  2 failed | 7 passed (9)
      Tests  2 failed | 710 passed (712)
```

Green, `82fff88`: `Tests  712 passed (712)`.

**`dsnParts` refuses port 0** (`workspace/src/db.ts`), as `assertRunnerDsn` has since the pass
before: `db: the DSN points at port 0, which is no port`, written `:0/` or `:00/`, with `PGPORT`
set to 6543 in the test so that a port filled in from the environment would show. The message
holds no part of the DSN. Red, `9268a7b` (`test/runner/db-tls.suite.ts`):

```
$ npx vitest run
 × refuses port 0 (written :0/) as the start check does, so the port is never filled in from somewhere else
 × refuses port 0 (written :00/) as the start check does, so the port is never filled in from somewhere else
AssertionError: expected [Function] to throw an error
 Test Files  1 failed | 8 passed (9)
      Tests  2 failed | 712 passed (714)
```

Green, `0a20c0e`: `Tests  714 passed (714)`.

### Kept as recorded

`ok` on the call that trips the count stays false: no code changed, and the comment on `toolOk`
(`stream-json.ts`) now reads as CR-6's sentence does (`fa84d36`). A tool result for a tool-use id
the stream never showed is still passed over. The start check still refuses a CA file with no
certificate block. The watchdog hold is not widened.

### Recorded, not changed

1. **Where the 110 s count from.** The window opens at the finish's own first try, and that try
   waits for the CLI's exit after the kill (SIGTERM, SIGKILL 1.5 s later, the output closed 0.4 s
   after that) and for `drain()`, which waits for a `workspace_stream()` call in flight. On a
   connection that has gone dead that call ends when the client's `query_timeout` does, 20 s. A
   probe in the scratch copy (never committed) let the connection die 2.5 s before the limit, so
   the 2 s cancel poll was in flight when the limit fell:

   ```
   PROBE first finish try at 498250 ms, last at 608250 ms, the claim is stale at 600000 ms
   PROBE last try minus first: 110000 ms (FINISH_RETRY_MS 110000)
   AssertionError: expected 608250 to be less than 600000
   ```

   So "the last finish try is at most 110 s after the kill" holds when nothing is in flight at the
   kill (the committed case: 480 s, 590 s) and can be up to about 22 s later when a stream call
   is; a try also takes up to 20 s to fail or land. What it costs with one runner: nothing. The
   sweep runs only inside `workspace_claim()`, and the runner calls that only between turns
   (`run()` waits for the turn's `done`, the finish included), so no sweep falls between a live
   turn's kill and its finish; and once 143 is applied a finish that did come after a sweep is
   refused with 22023 and logged. Not changed: X1 gives the number and says nothing else changes.
   What would close it: the finish's deadline counted from the turn's start (480 s + 110 s) and
   not from its own first try.
2. **A refusal after a failed try while the runner is stopping.** When the runner's own stop
   (a shutdown, the watchdog) lands while the refused try is in flight, the close carries the
   stop's code, `stale_claim`, as every close of an unbegun request does (`closeUnbegun`:
   `stopped.code ?? 'cli_error'`). X1's sentence says `cli_error`. No case of its own.
3. **The listener's line reads `error.message` itself** (`db.ts:298`), not `messageOf`: a
   connection error with an empty message would be logged with nothing after the colon. X1 names
   `messageOf` and the listener's redaction, not this.

### Files of the pass

`workspace/src/`: `config.ts`, `db-retry.ts`, `db.ts`, `errors.ts`, `turn.ts`, and a comment each
in `runner.ts` and `stream-json.ts`. `workspace/test/`: `providers.test.ts`,
`runner/closing.suite.ts`, `runner/db-tls.suite.ts`, `runner/db.suite.ts`,
`runner/result-grace.suite.ts`. And this file. Nothing outside `workspace/` but this file;
migrations 140 to 143 and `project-state/` were not touched.

One tool note: the 170-to-110 change to `test/runner/closing.suite.ts` in `83a2c08` was applied
with a short node script (exact-string replaces, each required to match once, written back as LF;
`git diff a22e661..8df9647 -- workspace` shows no carriage return) and not with the editor tool.

### Where the stream stands after this pass

On `8df9647`, from `workspace/`:

```
$ npm run typecheck
(no output, exit 0)
$ npx vitest run
 Test Files  9 passed (9)
      Tests  714 passed (714)
$ npx vitest run --coverage
 Test Files  9 passed (9)
      Tests  714 passed (714)
All files         |   93.36 |    88.81 |   92.45 |   95.24 |
  config.ts       |   99.02 |    93.75 |     100 |   98.95 | 146
  db-retry.ts     |   90.32 |       80 |     100 |    92.3 | 44-45
  db.ts           |   98.27 |    85.89 |     100 |   98.97 | 74
  errors.ts       |   97.22 |    93.75 |   83.33 |   96.29 | 23
  runner.ts       |   77.96 |    71.42 |   64.28 |   82.17 | ...213,223,228-232
  stream-json.ts  |   98.47 |    90.27 |     100 |     100 | ...324-328,348,377
  turn.ts         |   97.67 |    94.44 |     100 |     100 | 115,131,139,197
  claude-cli.ts   |   96.72 |     91.5 |   97.56 |   99.35 | 257
Lines        : 95.24% ( 862/905 )
$ grep -rn -- "--bare" workspace/src | wc -l          (from the repo root)
0
$ grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json | wc -l
0
$ docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1
bd4d4ae8bb716c53141fcae699d3872dd72c44622674209ed496d04d28305f02 2026-10-05T22:06:22.891074981Z
(the same value as after the pass before; unchanged)
```

714 against the pass before's 695: `runner.test.ts` 239 (was 225), `providers.test.ts` 16 (was
11), the other seven files as they were. The size audit passes: no file under `workspace/src` or
`workspace/test` is over 800 lines; the longest is still `test/runner/cli-turn.suite.ts` at 719,
`test/runner/db.suite.ts` is 497 and `test/runner/closing.suite.ts` 403; the longest under `src/`
is `providers/claude-cli.ts` at 490, with `db.ts` at 340.
