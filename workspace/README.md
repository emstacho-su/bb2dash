# bb2dash Workspace runner

The container process behind the `/workspace` page (Phase 21, brief
`docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`; Phase 24a, brief `109_PHASE24_workspace_assistant.md`).

It takes queued questions from the database one at a time (`workspace_claim_v2`, `workspace_begin`,
`workspace_stream`, `workspace_finish`, `workspace_heartbeat`, and the runner functions of migration 196:
`workspace_turn_context`, `workspace_turn_put`, `workspace_planner_feed`, `workspace_job_claim`,
`workspace_job_finish`). Every context is rebuilt from the database: nothing a turn needs is on the
container, no turn resumes a session, and the transcript volume is not read.

For each question it picks a tier from the chosen depth (`src/depth.ts`, `src/router.ts`), then:

1. on `mid` or `high` with a budget of at least 0.10, a **planning turn** (`src/plan.ts`): `haiku`, no tool,
   no MCP server, thinking off, 0.05 and 20 s. Its output is the JSON object alone or inside one code fence
   (F-2); anything else is the fallback plan. Quick, and Auto on `low`, plan nothing;
2. the **search** (`src/retrieve.ts`): one child of the materials package (`batch.js`) with the service key's
   file, 10 s in all, paused for 5 minutes after three failures in a row; and the planner and grades **feed**;
3. the **prompt** (`src/context/`): framing, feed, rolling summary, remembered items, passages, attached
   documents, recent turns, then the question, every block fenced and titled as data, within 128,000 bytes;
4. the facts and sources stored before the answer (`workspace_turn_put`), then the **answering turn**: the routed
   model, `claude -p` on the owner's subscription token, two read tools (`search_materials`, `get_material_text`),
   its own MCP config file for the turn. The text is streamed to the page and the answer stored.

It is read-only: a hook (`src/hooks/tool-gate.ts`) refuses every tool but those two. When the queue is empty it
may run one background job (`src/jobs.ts`): a rolling summary, and, with `WORKSPACE_MEMORY_JOBS=on`, a memory item.

## Layout

| path | what it is |
|---|---|
| `src/runner.ts` | the entry: the poll loop, idle jobs, the heartbeat, the database watchdog, shutdown |
| `src/turn.ts` | one turn: context, begin, prepare, the answering provider, sources, finish; Stop, the 8-minute limit |
| `src/prepare.ts` | the stages before the answer: plan, retrieve and feed, assemble, store the facts and sources |
| `src/depth.ts`, `src/router.ts`, `src/tiers.ts` | depth to tier (Auto routes on the last auto tier), question to tier, tier to model alias |
| `src/plan.ts`, `prompts/plan.md` | the planning turn's input, the check on its output and the fallback plan |
| `src/retrieve.ts`, `src/store-types.ts` | the batch child, the merge of its hits, the pause; the shapes it hands back |
| `src/context/` | `fence.ts` (the marker and the block lines), `budget.ts`, `feed.ts`, `turns.ts`, `attachments.ts`, `assemble.ts` |
| `src/turn-context.ts`, `src/sources.ts`, `src/lines.ts` | `workspace_turn_context` read by type; the source rows; the fixed sentences |
| `src/jobs.ts`, `prompts/summary.md`, `prompts/rolling.md` | background summaries |
| `src/providers/` | the provider seam: `claude-cli` (the argv per turn kind, the process) is connected, `ollama` and `frontier-api` are typed stubs |
| `src/stream-json.ts` | reads the CLI's `stream-json` output: the init check per turn kind, answer text, tool calls, failing closed on the gate |
| `src/hooks/tool-gate.ts`, `src/hooks/gate-rules.ts` | the `PreToolUse` hook and its rules: it only denies or stays silent |
| `src/mcp-config.ts` | the per-request MCP config (one server, the turn's limits in its `env`) and the config with no server |
| `src/prompts.ts` | the prompt files and the answering turn's system prompt |
| `src/config.ts` | the constants, the key guard, the DSN checks, the pinned CA, the per-answer budget |
| `src/errors.ts`, `src/db.ts` | the eight error codes and their mapping, the database calls and the verified connection |
| `src/db-retry.ts` | the one retry schedule for the context, begin and finish when the database fails them |
| `src/healthcheck.ts`, `src/alive.ts` | the container healthcheck and the alive file it reads |
| `claude/settings.json` | the CLI settings the runner passes with `--settings` (the hook and the retention) |
| `prompts/` | `system.md`, `format-plain.md`, `format-rich.md`, `plan.md`, `summary.md`, `rolling.md` |
| `test/fixtures/` | the router cases, and stream recordings with every tool result scrubbed; `contract24/` is the PM's, frozen |

## Logs

A log line holds ids, counts, states, timings and a class from a short fixed list. It never holds stderr
text, a prompt, a passage, an answer, a summary or a plan's text: a CLI exit is logged as its code, the length
of its stderr and a class (`budget`, `sign_in`, `usage_limit`, `other`); a rejected plan as its length and a
reason's class; the batch child's stderr as its length.

## The database connection

The runner reaches the database as `workspace_runner` through the session pooler (port 5432; a DSN
on 6543, the transaction pooler, is refused at start). The DSN is read from
`/run/secrets/workspace_runner_db_url`. A DSN the connection could not be made from is refused at
start as well, with the reason and no value: one that names no host, user, password or database,
one whose user, password or database is not percent-encoded text, one on port 0.

The pooler's certificate is verified against one pinned CA, whatever the DSN says. The CA is read at
start from the file `WORKSPACE_DB_CA_FILE` names (`/app/certs/prod-ca.crt` when it is not set); a
file that is missing, empty or holds no certificate stops the start. The connection is built from
the DSN's host, port, user, password and database and never from the DSN string, so no flag in its
query string decides how the connection is made, and the host name it gives is the name the
certificate must carry. The DSN must still name an `sslmode` of `require`, `verify-ca` or
`verify-full`; write `sslmode=verify-full` in a new one.

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

`apply/` bundles `src/hooks/gate-rules`, `src/config`, `src/errors`, `src/db`, `src/alive`, `src/stream-json` and `src/providers/claude-cli`: after a change here, `cd apply && npm run typecheck && npx vitest run`.

No test starts the `claude` CLI or reaches a database: the provider tests replay the recorded
fixtures (node stands in where a real process is needed), and the loop runs on fakes. The one
network connection a test makes is to itself: `test/runner/db-tls.suite.ts` tries the TLS handshake
against a stand-in pooler on the loopback interface, with a CA and certificates made for the run by
`test/helpers/throwaway-ca.ts` (node:crypto; no key is read from a file or written to one).

## The recorded fixtures

`test/fixtures/claude-stream-*.jsonl` were recorded once with the pinned CLI and the frozen argv,
then scrubbed by `test/scrub-recording.mjs` (tool-result bodies, host paths and inventory, thinking
signatures; the lookup's answer text is masked, since it quoted the document it read).
`test/fixtures/recordings.json` holds each recording's exit code. `synthetic-rate-limit.json` is not
a recording: a plan-limit hit cannot be recorded on demand, so it is built by hand from the recorded
shapes and says so. A CLI version bump means recording again; the lines are in
`docs/planning/sprint-2/verification/102_W64_VERIFICATION.md`.
