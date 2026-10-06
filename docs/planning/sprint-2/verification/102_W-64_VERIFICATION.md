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
