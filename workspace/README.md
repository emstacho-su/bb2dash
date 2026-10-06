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
| `src/runner.ts` | the entry: the poll loop, the heartbeat, shutdown |
| `src/router.ts`, `src/tiers.ts` | question to tier, tier to provider and model alias |
| `src/providers/` | the provider seam: `claude-cli` is connected, `ollama` and `frontier-api` are typed stubs |
| `src/stream-json.ts` | reads the CLI's `stream-json` output |
| `src/hooks/tool-gate.ts` | the `PreToolUse` hook: only denies or stays silent |
| `src/mcp-config.ts` | writes the two-server MCP config (paths only, never a key) |
| `src/config.ts`, `src/errors.ts`, `src/db.ts`, `src/healthcheck.ts` | settings and the start-up guards, the eight error codes, the five database calls, the container healthcheck |
| `claude/settings.json` | the CLI settings the runner passes with `--settings` (the hook, nothing else) |
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
`dist/hooks/tool-gate.js`). `test/tool-gate.test.ts` builds before it runs the gate as a process.

No test starts the `claude` CLI or opens a database connection: the provider tests replay the
recorded fixtures, and the loop runs on fakes.
