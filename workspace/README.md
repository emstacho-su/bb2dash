# bb2dash Workspace runner

The container process behind the `/workspace` page (Phase 21, brief
`docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`).

It takes queued questions from the database through five functions (`workspace_claim`,
`workspace_begin`, `workspace_stream`, `workspace_finish`, `workspace_heartbeat`), one at a time. For
each question it picks a tier with a hand-written rule (`src/router.ts`), runs the unmodified
`claude` CLI as `claude -p` on the owner's subscription token, streams the answer text to the page
and stores the finished answer. It is read-only: the assistant gets four read tools (three on the
class materials, one on the notes store), and a hook (`src/hooks/tool-gate.ts`) refuses every other
tool call.

## Layout

| path | what it is |
|---|---|
| `src/runner.ts` | the entry: the poll loop, the heartbeat, the database watchdog, shutdown |
| `src/turn.ts` | one turn: route, begin, stream the text in flushes, finish; Stop, the 8-minute limit |
| `src/router.ts`, `src/tiers.ts` | question to tier, tier to provider and model alias |
| `src/providers/` | the provider seam: `claude-cli` (the argv, the process, the one recovery) is connected, `ollama` and `frontier-api` are typed stubs |
| `src/stream-json.ts` | reads the CLI's `stream-json` output: the init check, answer text, tool calls, failing closed on the gate |
| `src/replay.ts` | the stored history a fresh start carries in front of the question |
| `src/hooks/tool-gate.ts`, `src/hooks/gate-rules.ts` | the `PreToolUse` hook and its rules: it only denies or stays silent |
| `src/mcp-config.ts` | writes the two-server MCP config (paths only, never a key) |
| `src/config.ts` | the constants, the key guard, the DSN checks, the per-answer budget |
| `src/errors.ts`, `src/db.ts` | the eight error codes and their mapping, the five database calls |
| `src/healthcheck.ts`, `src/alive.ts` | the container healthcheck and the alive file it reads |
| `claude/settings.json` | the CLI settings the runner passes with `--settings` (the hook and the transcript retention) |
| `prompts/system.md` | the text appended to the CLI's system prompt |
| `test/fixtures/` | the router cases, and stream recordings with every tool result scrubbed |

## Run the tests

```
npm ci
npm run typecheck
npx vitest run
npx vitest run --coverage
```

`npm run build` writes `dist/` (the image runs `dist/runner.js`, `dist/healthcheck.js` and
`dist/hooks/tool-gate.js`). The test run builds `dist/` once first (`test/global-setup.ts`), because
two suites run the built gate and the built healthcheck as processes.

No test starts the `claude` CLI or opens a database connection: the provider tests replay the
recorded fixtures (node stands in where a real process is needed), and the loop runs on fakes.

## The recorded fixtures

`test/fixtures/claude-stream-*.jsonl` were recorded once with the pinned CLI and the frozen argv,
then scrubbed by `test/scrub-recording.mjs` (tool-result bodies, host paths and inventory, thinking
signatures; the lookup's answer text is masked, since it quoted the document it read).
`test/fixtures/recordings.json` holds each recording's exit code. `synthetic-rate-limit.json` is not
a recording: a plan-limit hit cannot be recorded on demand, so it is built by hand from the recorded
shapes and says so. A CLI version bump means recording again; the lines are in
`docs/planning/sprint-2/verification/102_W64_VERIFICATION.md`.
