# Phase 21 — Workspace: a chat surface routed by task complexity over the two stores, on the subscription

Date 2026-09-24 · PM: the Fable session · Product manager: Stack · Requirements: S2-workspace-1 ·
PM-added steps: P-83, P-84, P-85, P-86, P-87, P-88 · Branch `feat/workspace-21` · Worktree
`bb2dash-wt-21` · Migration range **140–149** · One PR per repo (bb2dash on `feat/workspace-21`,
bb2dash-stack on `feat/workspace-21`): the same exception Phase 14 takes under B-51, whose DECISIONS
row Phase 14 writes at its Contract freeze; until that row exists, the bb2dash-stack change is a
second PR opened after this one, not beside it · Status: **PROVISIONAL until Stack answers 93 §5
(B-5; and B-42, B-48, B-51 through Phases 15 and 14)**. DECISIONS 2026-09-24: "a brief may not cite a default as decided before then".

Inputs: `91_REQUIREMENTS_v3.md` §2.1 (P-83..P-88), §3 (S2-workspace-1), §4 (D-1, D-2, D-4, D-5,
D-19, D-21); `93_SPRINT2_RESEARCH_SYNTHESIS.md` §1.8, §2, §3, §4, §5 item 5; `94_SPRINT2_PHASES.md`
§1–§3; `research/92_RESEARCH_sprint2_workspace-chatbot.md`; `research/82_RESEARCH_phase14_R2_claude_unattended.md`;
`82_PHASE14_containers.md` (C-1, C-2, C-5, C-6; its 16 decisions stand, brief 100 supersedes its
Contract); `briefs/100_PHASE14_containers.md` (the names Phase 14 freezes: `mcp-server/Dockerfile`,
`mcp-server/src/env-file.ts`, the 11 secret files, `doctor/doctor.mjs`, the `just` verbs);
`briefs/95_PHASE15_db_hygiene.md` (`scripts/db-test.mjs` and the `db_test_runner` role). Facts checked
on 2026-09-24 against `main` a5042fa, prod (`goultdzqcavefcgnifdy`, SELECT only), the harness rag store
and the installed Claude Code CLI (2.1.282); re-checked by the Stage C critic the same day.

## Why

Stack's S2-workspace-1 asks for a Workspace section that "functions as a chatbot interface that
works by routing prompts to different agent model levels depending on the complexity of the task",
built so it could route to a local or a frontier model, with Claude the only one hooked up, and run
on his subscription "instead of having to pay for api credits" (91 §3, his words). Sprint 1 built
none of it on purpose: Requirements v2 §5 declined an in-app chat assistant, carried as v3 §4 D-1,
and the Stage A check found no chat code in `web/src` or `desktop/src` (91 §5 row 53) and no
Supabase Realtime use anywhere in `web/src` (research §1.4: no `.channel(` hit). This phase adopts
that reversal; the DECISIONS row that says so is an acceptance step (task 24), not a note.

The backend cannot live in the browser or in an Edge Function (2 s CPU, 150–400 s wall clock; 93 §3),
and "use my subscription" rules out the Agent SDK library and `--bare` mode, both of which require
API-key billing (93 §1.8). What remains is the unmodified `claude` CLI, run as `claude -p` by a
container process on Stack's `claude setup-token` token. That is the scaffolding Phase 14 builds for
R-28: the `bb2dash-stack` umbrella and secrets folder (R-88, R-89), the materials MCP image with its
key by file (R-91), the subscription-token path of the dev container (R-92), and the least-privilege
database role pattern of `sync_runner` (R-84). Building the Workspace first would duplicate all of it
and throw it away when Phase 14 lands (research §1.5), so it follows Phase 14 (94 §2 rule 5; PROVISIONAL,
B-5 (b)) as a fourth C-2 service. v1 is read-only (PROVISIONAL, B-5 (c)): zero write tools on every
tier, and nothing it runs can reach `assignment_progress`, `reading_progress` or any fact table
(v3 §4 D-2).

Three risks ride with it and are accepted, not solved. Anthropic announced (2026-05-14) and paused
(2026-06-16) a plan to meter `claude -p` usage out of the subscription pool; it is "being revised"
(93 §4), so the $0 framing is today's behaviour, not a promise. Advertised plan limits assume
"ordinary, individual usage", and the Workspace shares them with Stack's own sessions, so turns run
one at a time and Opus only when routed there. The CLI documents that `--bare` "will become the
default for `-p` in a future release"; the image pins an exact CLI version and a test pins the argv,
so a bump is a deliberate, re-checked change. And this is the app's first Realtime use, so the
transport is frozen only after a live spike (task 5).

## Stack's calls this brief rests on

All PROVISIONAL: B-5 is one item of the 93 §5 batch, split here into its parts. The default is what
this brief builds until he answers.

| B | question | default taken (PROVISIONAL) | tasks that change if he answers otherwise |
|---|---|---|---|
| B-5 (a) | must or should | **should** | none; only the phase's place in the queue |
| B-5 (b) | when, relative to Phase 14 | after Phase 14 merges; the container, token and MCP image are reused | if earlier: task 1's gate fails by design; tasks 12–14 would build a standalone compose and secrets (+M) and be redone when Phase 14 lands |
| B-5 (c) | read-only or writes | read-only, zero write tools on every tier | if writes wanted: not this phase; a later phase adds a propose-then-approve path; tasks 6, 10 and 20 stay as the v1 boundary |
| B-5 (d) | backend and billing | the `claude` CLI on his setup-token; never the Agent SDK, never `--bare`, never an API key | if an API key is acceptable: tasks 8 and 11 (argv and the key guard) change; D-4 is unaffected |
| B-5 (e) | router | hand-written heuristic; a one-turn Haiku classifier only as a fast-follow if it misroutes | if a classifier from day one: task 7 adds a classify call through the provider seam (one extra Haiku turn per question) |
| B-5 (f) | cost cap | a soft **$1.00 per answer** (`--max-budget-usd`) that fails the turn with a plain sentence; no silent downgrade | if downgrade or warn instead: tasks 9, 11, 16 and 21 (error mapping, labels, live check) |
| B-5 (g) | harness store scope | an allowlist of bb2dash collections, enforced by the tool gate | if the whole store: task 10's gate drops the collection rule; if narrower: its fixture changes |
| B-5 (h) | the paused metering plan | accepted as a risk | if not accepted: the phase stops at task 1 |
| B-5 (i) | acceptance line | the PM's wording under §MVP | the acceptance script and task 22's shots follow his wording |
| B-51 (inherited) | `bb2dash-stack`, `just`, one PR per repo | Phase 14's default, its row written at Phase 14's freeze | if no PR per repo: the bb2dash-stack change (task 14) becomes a follow-up PR after this phase merges; if npm scripts instead of `just`: acceptance steps 1, 2 and 9 and task 1 use brief 100's `package.json` verbs |
| B-42 (inherited) | a database credential for the test runner | Phase 15's default: `db_test_runner` (migration 100) through `node scripts/db-test.mjs` | if no: the three `phase21_*` units run as the PM's `execute_sql` inside `begin … rollback`, and 140's and 142's `db_test_runner` grants are dropped |
| B-48 (inherited) | the dev container | Phase 14's default: kept, in `bb2dash-stack` | if no: task 12's Dockerfile installs the pinned CLI itself instead of following the dev container's recipe; if Phase 14 then drops `claude_oauth_token` (its only consumer under B-43/B-44's defaults is `dev`, brief 100), task 14 adds it back as a Workspace secret |

## Contract (PROVISIONAL until B-5 is answered; frozen when Stack approves the phase plan)

### Routes and screens

* **`/workspace`** (new): `web/src/app/(app)/workspace/page.tsx` (metadata "Workspace · bb2dash", the
  form `materials/page.tsx` and `inbox/page.tsx` use), client screen
  `web/src/app/(app)/workspace/Workspace.tsx`, CSS Module
  `web/src/app/(app)/workspace/Workspace.module.css` (all new). The selected conversation is in
  the query string, `?c=<conversation uuid>` (route-driven, like the popouts). Layout: conversation
  list (title, last activity, archive toggle), the message column, the composer, a service line.
* **Top bar:** `NAV_LINKS` in `web/src/components/shell/TopNav.tsx` gains
  `{ href: '/workspace', label: 'Workspace' }` after Materials. Nothing else in the file changes.
* **A question:** textarea, 1–8000 characters after trimming (`WORKSPACE_PROMPT_MAX`, new, exported
  from `web/src/lib/queries.workspace.ts`; the same number `workspace_prompt_max()` returns); Enter
  asks, Shift+Enter is a new line. The button reads
  **"Ask"** (the standing "no control reads Submit" audit in `web/test/audits.test.ts` stays green).
  While a request is open the button is **"Stop"**, and a second question in the same conversation
  is refused by the database, not only by the button.
* **An answer:** streamed text, then the stored row. Each assistant message shows a tier badge
  (PM wording: "Haiku · lookup", "Sonnet · standard", "Opus · deep work") and a "Used: …" line
  built from `tool_calls` (tool name and its query or collection; never the tool's result text, so
  no raw `[notes]` speaker-note slice reaches the screen). Content renders as **plain text**
  (`white-space: pre-wrap`), never as HTML (PROVISIONAL, O-5: no Markdown in v1).
* **States, in words:** queued ("Waiting for the Workspace service"), streaming, done, stopped,
  failed with one sentence per `error_code` (PM wording; `budget_exceeded`: "Stopped at the $1.00
  per-answer limit.", PROVISIONAL, B-5 (f); `timeout`, `stale_claim`, `provider_not_configured`,
  `cli_error`, `cancelled`), and an offline line when the runner's heartbeat is older than 120 s. The stored cost estimate is not shown.
* **Electron:** no change; the shell loads the route like any other.

### Service and invocation (the container side of the route)

* **Service `workspace`** (new, the fourth C-2 service; PROVISIONAL, B-5 (b)): Dockerfile
  `docker/workspace/Dockerfile` (new), declared in bb2dash's `compose.yaml` (new in Phase 14) and
  reached through the umbrella's `include:`. Base `node:22-bookworm-slim`, plus `procps` (task 12's
  process check); the `claude` CLI at one exact pinned version (2.1.282 on the host on 2026-09-24; the
  PM confirms at the cut), installed the way brief 100 installs it in the dev container (B-48); the
  materials MCP server copied from Phase 14's `bb2dash-mcp` image (built from `mcp-server/Dockerfile`,
  new in Phase 14) as a build stage (not rebuilt); the harness `rag` MCP server built from
  `../agentic-harness/mcp-server` (exists at harness `main` b7f3df8) through
  `build.additional_contexts`, its embedding model cached into the image at build time so nothing
  is downloaded at runtime. No published ports. `restart: unless-stopped`, log rotation as 82 C-1,
  healthcheck `node /app/workspace/dist/healthcheck.js` (last poll under 30 s old).
* **Secrets by file** (R-89's `*_FILE` rule): `workspace_runner_db_url` (new),
  `claude_oauth_token`, `bb2dash_mcp_service_key`, `harness_database_url` (82 C-6 names, all three
  on brief 100's list of 11). `CLAUDE_CODE_OAUTH_TOKEN` is exported from its file immediately
  before the CLI starts. The process refuses to start if `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or any
  `CLAUDE_CODE_USE_*` variable is set, since each outranks the OAuth token (R2 §1's documented order:
  cloud-provider switches, then the auth token, then the API key, then `apiKeyHelper`), and
  `workspace/claude/settings.json` carries no `apiKeyHelper`. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.
* **Non-root and egress:** the entrypoint (`docker/workspace/entrypoint.sh`) runs
  `docker/workspace/init-firewall.sh` as root (default-deny egress; allow `api.anthropic.com`, the
  project host `goultdzqcavefcgnifdy.supabase.co` and the database hosts parsed from the two DSN
  secrets; the reference devcontainer's ipset pattern), then drops to user `node` before any Node or
  `claude` process starts. `cap_add: [NET_ADMIN, NET_RAW]` exists only for that script.
* **The runner** (`workspace/src/runner.ts`): polls `workspace_claim()` every 2 s
  (`POLL_INTERVAL_MS`), one turn at a time (`TURN_CONCURRENCY = 1`), routes, calls
  `workspace_begin()`, runs the provider, sends text deltas through `workspace_stream()` coalesced
  every 250 ms (`STREAM_FLUSH_MS`), and closes with `workspace_finish()`. A `false` from
  `workspace_stream()` (Stack pressed Stop) kills the CLI within 2 s. A turn is killed at 8 minutes
  (`TURN_TIMEOUT_MS`), under the database's 10-minute stale-claim sweep, so a live runner always
  finishes its own turn first. These constants and `HISTORY_REPLAY` live in `workspace/src/config.ts`,
  which also reads `WORKSPACE_TURN_BUDGET_USD` (new; default `1.00`, refused outside 0.01–1.00;
  PROVISIONAL, B-5 (f)), the value `--max-budget-usd` receives.
* **Router** (`workspace/src/router.ts`, pure; PROVISIONAL, B-5 (e): the heuristic only, no classifier
  call): `routeTier(prompt, priorTier) → 'low' | 'mid' | 'high'`.
  `high` when a clause opens with an execution verb (`HIGH_VERBS`: draft, write, plan, build,
  outline, prepare, revise, critique, solve, create, analyze, compare) or the prompt exceeds 600
  characters; `low` when it opens with a lookup cue (`LOW_CUES`: what, when, where, which, who, find,
  show, list, pull, open, get, is there, does), is at most 200 characters and has no high verb; a
  follow-up of at most 40 characters keeps `priorTier`; `mid` otherwise. The fixture file
  `workspace/test/fixtures/router-cases.json` is the executable form of this rule.
* **Tiers** (`workspace/src/tiers.ts`, `TIER_ROUTES`): `low → claude-cli / haiku`,
  `mid → claude-cli / sonnet`, `high → claude-cli / opus`; the alias is what `--model` receives and
  what `workspace_messages.model` stores.
* **Provider seam** (`workspace/src/providers/`): `types.ts` declares
  `Provider { readonly id: ProviderId; runTurn(input: TurnInput, signal: AbortSignal): AsyncIterable<TurnEvent> }`
  with `ProviderId = 'claude-cli' | 'ollama' | 'frontier-api'` and `TurnEvent` = delta | tool | result.
  `claude-cli.ts` is implemented; `ollama.ts` and `frontier-api.ts` type-check and throw
  `ProviderNotConfiguredError`, which the runner stores as `provider_not_configured`.
* **Argv, frozen** (pinned by `workspace/test/claude-argv.test.ts`; cwd is an empty `/app/turn`;
  spawned as an argv array, never through a shell):
  `claude -p --model <alias> (--session-id <conversation uuid> | --resume <claude_session_id>)
  --tools "" --allowedTools mcp__bb2dash__search_materials mcp__bb2dash__get_material_text
  mcp__bb2dash__list_courses mcp__rag__search_context --disallowedTools Bash Read Write Edit
  WebFetch WebSearch --permission-mode dontAsk --permission-prompts none --strict-mcp-config
  --mcp-config /run/workspace/mcp.json --settings /app/workspace/claude/settings.json
  --append-system-prompt <contents of workspace/prompts/system.md> --output-format stream-json
  --verbose --include-partial-messages --max-budget-usd <WORKSPACE_TURN_BUDGET_USD> -- <prompt>`.
  The prompt is always the last element, after `--`, so a question that begins with `--` is never
  read as a flag (task 9's live recording proves the form). Every flag was listed by `claude --help`
  on 2.1.282 on 2026-09-24 (`dontAsk` among `--permission-mode`'s choices, `none` among
  `--permission-prompts`'); 93 §3 records `--tools` as undocumented, so task 12 re-reads
  `claude --help` inside the image. Never `--bare`; never `@anthropic-ai/claude-agent-sdk`
  (PROVISIONAL, B-5 (d)).
* **Continuity:** the first turn passes `--session-id <conversation uuid>`; later turns pass
  `--resume <claude_session_id>` (the CLI keeps the id unless `--fork-session` is given). Transcripts
  live on the named volume `workspace-claude-home` (the `node` user's `~/.claude`). If the CLI cannot
  resume, the runner starts a fresh session and replays the last 20 stored messages
  (`HISTORY_REPLAY = 20`) as context.
* **Tool gate** (`workspace/src/hooks/tool-gate.ts`, wired as a `PreToolUse` hook in
  `workspace/claude/settings.json`; read-only v1, PROVISIONAL, B-5 (c)): denies every tool not in the
  four-name allowlist; denies `mcp__rag__search_context` unless `collection` is on `RAG_COLLECTIONS`
  = `bb2dash`, `bb2dash-inbox-decisions` (PROVISIONAL, B-5 (g) and O-1; both answered a
  `search_context({collection})` call on 2026-09-24); denies `mcp__rag__get_document` in v1
  (PROVISIONAL, O-3). `--allowedTools` is the first fence, the hook the second, the database role the
  third.
* **MCP config** (`workspace/src/mcp-config.ts`, written at start to `/run/workspace/mcp.json`,
  mode 0600): exactly two servers, `bb2dash` (materials, tools `search_materials`,
  `get_material_text`, `list_courses` as `mcp-server/src/tools/` names them; its key through
  `SUPABASE_SERVICE_ROLE_FILE`, which Phase 14's new `mcp-server/src/env-file.ts` reads (brief 100),
  never a literal) and `rag` (harness store, `../agentic-harness/mcp-server`, tools `search_context`
  with its `collection` filter and `get_document`; its DSN from `harness_database_url`, exported as
  `DATABASE_URL`, the only connection variable that server's `src/config.ts` reads). The two stores
  are never merged and their ids never mixed (D-21; the `rag` server's own rule).
* **System prompt** (`workspace/prompts/system.md`): read-only; cite the file or note used; never
  invent a number (CLAUDE.md: "No fabricated numbers anywhere"); label speaker-note text as speaker
  notes; grades live on the Grades screen.

### RPC signatures

All pin `set search_path = public, pg_temp`. Browser-side RPCs are `security invoker` (RLS decides,
as 083's do); runner RPCs are `security definer`, revoked from `public`, `anon` and `authenticated`,
and executable by `workspace_runner` only (the 038 rule: nothing DEFINER is callable by `authenticated`).

| signature | mode | grant | does |
|---|---|---|---|
| `public.workspace_prompt_max() returns integer` (immutable) | invoker | `authenticated`, `service_role` | returns 8000 |
| `public.workspace_ask(p_conversation_id uuid, p_text text) returns jsonb` | invoker | `authenticated` | one transaction: creates the conversation when `p_conversation_id` is null (title = first line of the text, cut at 120), inserts the user message (`finished = true`) and a `queued` request; refuses empty or over-long text and a second open request in the conversation; returns `{conversation_id, message_id, request_id}` |
| `public.workspace_cancel(p_request_id bigint) returns boolean` | invoker | `authenticated` | `queued` or `claimed` → `cancelled`; true when a row changed |
| `public.workspace_claim(p_runner text) returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text, claude_session_id text, prior_tier text, history jsonb)` | definer | `workspace_runner` | sweeps claims older than 10 minutes to `failed` / `stale_claim` (their assistant rows get the same code); stamps the heartbeat (at most once per 30 s); claims the oldest `queued` row with `for update skip locked`, `attempts + 1`; `history` = the last 20 messages as `[{role, content}]` |
| `public.workspace_begin(p_request_id bigint, p_tier text, p_provider text, p_model text) returns uuid` | definer | `workspace_runner` | inserts the assistant message (`finished = false`, parent = the user message); refuses unless the request is `claimed` |
| `public.workspace_stream(p_request_id bigint, p_seq integer, p_delta text) returns boolean` | definer | `workspace_runner` | false, sending nothing, unless the request is still `claimed`; else `realtime.send(jsonb_build_object('request_id', p_request_id, 'seq', p_seq, 'delta', p_delta), 'delta', 'workspace:' \|\| conversation_id, true)`; `p_delta` at most 16000 characters |
| `public.workspace_finish(p_request_id bigint, p_state text, p_content text, p_tool_calls jsonb, p_error_code text, p_cost_usd numeric, p_duration_ms integer, p_claude_session_id text) returns void` | definer | `workspace_runner` | `p_state` in `done` / `failed`; a request already `cancelled` stays cancelled and its message gets `cancelled`; writes the message, sets `finished`, stamps the conversation's `claude_session_id` and `updated_at`, sends a `done` broadcast |

P-85 also names a `workspace_reader` role (91 §2.1). v1 builds none (PROVISIONAL, O-4): no Workspace
tool reads planner, grades or Inbox data, so there is nothing for a reader role to hold.

Realtime (the transport, frozen after task 5): private Broadcast topic `workspace:<conversation uuid>`,
events `delta` `{request_id, seq, delta}` and `done` `{request_id, message_id, state}`. Clients only
receive; no policy lets a client send. A missed broadcast is harmless: while a request is open the
messages query refetches every 5 s, and the stored row is the record. Prod on 2026-09-24:
`realtime.messages` is range-partitioned on `inserted_at` and has **0 partitions**; `realtime.send` is
`security invoker`, executable by `public`, and catches its own insert error as a warning. So a send
with no partition is silent, a client's own send dies on the missing insert policy, and a DEFINER send
owned by `postgres` (which bypasses RLS) lands only once a partition exists; task 5 checks that first.

### Tables and migrations

Additive only; each dry-run in `begin … rollback`, applied with `apply_migration` under the file's
name and kept byte-identical; 140–142 are frozen once applied. Every `db/tests/phase21_*.sql` unit
follows brief 95's lint and pass rules: `begin;` first, `rollback;` last, no top-level `commit`, and a
last result row whose first column ends in `: PASS`.

| # | file | creates |
|---|---|---|
| 140 | `db/migrations/140_workspace_tables.sql` | `workspace_conversations` (`id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` via `set_updated_at()`, `title text not null` 1–120 chars, `claude_session_id text`, `archived boolean not null default false`); `workspace_messages` (`id uuid pk`, `conversation_id uuid not null` → conversations on delete cascade, indexed; `parent_message_id uuid` → messages on delete set null, indexed; `role text` check `user`/`assistant`; `request_id bigint` → requests on delete set null, indexed; `tier text` check `low`/`mid`/`high`; `provider text` check `claude-cli`/`ollama`/`frontier-api`; `model text`; `content text not null default ''` at most 100000 chars; `tool_calls jsonb not null default '[]'`, an array; `finished boolean not null default false`; `error_code text` check the six codes; `cost_usd numeric(10,4)`; `duration_ms integer`; `created_at`); `workspace_requests` (`id bigint identity pk`, `created_at`, `conversation_id uuid not null`, `user_message_id uuid not null`, `state text` check `queued`/`claimed`/`done`/`failed`/`cancelled` default `queued`, `claimed_at`, `claimed_by text`, `finished_at`, `attempts integer not null default 0`, `error_code text`; unique partial index `workspace_requests_one_open` on `conversation_id` where state is `queued` or `claimed`; index `(state, created_at)`); `workspace_runner_heartbeat` (`id smallint pk check (id = 1)`, `polled_at timestamptz not null`, `runner text not null`); view `v_workspace_status` (`security_invoker`: `polled_at`, `runner`, `open_requests`, `oldest_open_at`); `workspace_prompt_max()`, `workspace_ask()`, `workspace_cancel()`. Owner policies in the `(select auth.uid()) = (select public.app_owner())` form: conversations select/insert/update; messages select, insert only `role = 'user' and finished`; requests select, insert only `state = 'queued'`, update only to `cancelled` from `queued`/`claimed`; heartbeat select. `anon` revoked everywhere; `authenticated` gets exactly the verbs its policies govern; no TRUNCATE. For Phase 15's runner (brief 95, "The role `db_test_runner`"): `insert, update, delete` on the four tables to `db_test_runner`, which writes the units' setup rows; nothing else. Guard block: the view is `security_invoker`, no `anon` grant, no TRUNCATE |
| 141 | `db/migrations/141_workspace_realtime_policy.sql` | policy `workspace_owner_receive` on `realtime.messages` for select to `authenticated` using `(select auth.uid()) = (select public.app_owner()) and extension = 'broadcast' and (select realtime.topic()) like 'workspace:%'`; no insert, update or delete policy. Prod on 2026-09-24: `realtime.messages` has RLS on and 0 policies; `realtime.send(jsonb, text, text, boolean)` exists and `postgres` may execute it |
| 142 | `db/migrations/142_workspace_runner_role.sql` | `create role workspace_runner login noinherit nobypassrls` with **no password in the file** (Stack sets it out of band, R-89's rule, so the file stays byte-identical); `alter role workspace_runner set statement_timeout = '15s'`; `grant usage on schema public`; the four DEFINER RPCs; no table privilege of any kind; `grant workspace_runner to db_test_runner with inherit false`, so the 141 and 142 units can `set local role workspace_runner` (brief 95's pattern for `anon` / `authenticated`); a guard block that raises if the role holds any table privilege, if any runner RPC is executable by `anon` / `authenticated`, or if the role is granted to any role but `db_test_runner` (the implicit admin grant PostgreSQL 16+ gives its creator, `postgres`, excepted); and W-63 widens phase15_100's membership assertion (`db/tests/phase15_100_db_test_runner_role.sql`) to exactly `anon`, `authenticated`, `workspace_runner` (plus `sync_runner` if Phase 14's 094 is on prod), all inherit false |
| 143–149 | slack | review rounds only: `create or replace` of 140–142's functions; a phase that runs out takes the next free block of ten and records it in DECISIONS (94 §2 rule 6) |

### Files

| path | new / changed | owner |
|---|---|---|
| `db/migrations/140_workspace_tables.sql`, `db/migrations/141_workspace_realtime_policy.sql`, `db/migrations/142_workspace_runner_role.sql` | new | W-63 |
| `db/tests/phase21_140_workspace_tables.sql`, `db/tests/phase21_141_workspace_realtime.sql`, `db/tests/phase21_142_workspace_runner.sql` | new | W-63 |
| `db/tests/phase15_100_db_test_runner_role.sql` | changed: its membership assertion only | W-63 |
| `DATA_SYNTAX.md` | changed: one new "Workspace" section | W-63 |
| `workspace/package.json`, `workspace/package-lock.json`, `workspace/tsconfig.json`, `workspace/vitest.config.ts`, `workspace/README.md` | new package (deps: `pg`; dev: `typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`, `@types/pg`) | W-64 |
| `workspace/src/runner.ts`, `workspace/src/router.ts`, `workspace/src/tiers.ts`, `workspace/src/db.ts`, `workspace/src/config.ts`, `workspace/src/mcp-config.ts`, `workspace/src/stream-json.ts`, `workspace/src/healthcheck.ts`, `workspace/src/errors.ts` | new | W-64 |
| `workspace/src/providers/types.ts`, `workspace/src/providers/claude-cli.ts`, `workspace/src/providers/ollama.ts`, `workspace/src/providers/frontier-api.ts`, `workspace/src/providers/index.ts` | new | W-64 |
| `workspace/src/hooks/tool-gate.ts`, `workspace/claude/settings.json`, `workspace/prompts/system.md` | new | W-64 |
| `workspace/test/router.test.ts`, `workspace/test/providers.test.ts`, `workspace/test/claude-argv.test.ts`, `workspace/test/stream-json.test.ts`, `workspace/test/tool-gate.test.ts`, `workspace/test/runner.test.ts`, `workspace/test/mcp-config.test.ts`, `workspace/test/config.test.ts` | new | W-64 |
| `workspace/test/fixtures/router-cases.json`, `workspace/test/fixtures/claude-stream-lookup.jsonl`, `workspace/test/fixtures/claude-stream-budget-stop.jsonl`, `workspace/test/fixtures/claude-stream-resume-missing.jsonl` (tool-result bodies scrubbed to `<scrubbed>`) | new | W-64 |
| `docker/workspace/Dockerfile`, `docker/workspace/entrypoint.sh`, `docker/workspace/init-firewall.sh` | new | W-65 |
| `compose.yaml` (bb2dash root, new in Phase 14) | changed: the `workspace` service block, its secrets and the `workspace-claude-home` volume only | W-65 |
| bb2dash-stack: `secrets.example/workspace_runner_db_url`, `doctor/workspace.test.mjs` | new | W-65 |
| bb2dash-stack: `README.md` (a Workspace section), `doctor/doctor.mjs` (one workspace row), `doctor/doctor.test.mjs` (only if it pins brief 100's eleven secret names) | changed | W-65 |
| `web/src/app/(app)/workspace/page.tsx`, `web/src/app/(app)/workspace/Workspace.tsx`, `web/src/app/(app)/workspace/Workspace.module.css` | new | W-66 |
| `web/src/components/workspace/ConversationList.tsx`, `web/src/components/workspace/MessageList.tsx`, `web/src/components/workspace/Composer.tsx`, `web/src/components/workspace/TierBadge.tsx`, `web/src/components/workspace/ServiceStatus.tsx`, each with its `.module.css` beside it | new | W-66 |
| `web/src/lib/queries.workspace.ts` (hand-declared row types until the PM regenerates, as `web/src/lib/queries.sync.ts` does), `web/src/lib/use-workspace-stream.ts`, `web/src/lib/workspace-labels.ts` | new | W-66 |
| `web/src/components/shell/TopNav.tsx` | changed: one `NAV_LINKS` entry | W-66 |
| `web/test/queries.workspace.test.ts`, `web/test/use-workspace-stream.test.tsx`, `web/test/Workspace.test.tsx`, `web/test/TopNav.workspace.test.tsx`, `web/test/workspace-labels.test.ts` | new | W-66 |
| `web/src/lib/supabase/database.types.ts` | regenerated at integration, this phase's objects only | PM |
| `project-state/STATUS.md`, `project-state/DECISIONS.md`, `project-state/ORCHESTRATOR.md`, root `CLAUDE.md` | changed | PM |
| `docs/planning/sprint-2/walks/walk-21/*.png`, `docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` | new | PM |

The four worker sets are disjoint. Nobody but W-66 touches `web/`; nobody but W-63 touches `db/` or
`DATA_SYNTAX.md`; nobody but W-64 touches `workspace/`; `compose.yaml` is W-65's for the one service
block; `project-state/` is the PM's. Worker ids W-63..W-66 are the next free after Phase 20's W-59..W-62
(Phase 14 holds W-55..W-58; Phase 22 follows at W-67..W-70).

### Seams

| with | seam | rule here |
|---|---|---|
| Phase 14 (R-88, R-89) | `bb2dash-stack` umbrella, `secrets/`, the `*_FILE` shim, `just`, `doctor/doctor.mjs` (all new in Phase 14, brief 100) | the service joins through bb2dash's `compose.yaml`; one new secret name, so `secrets.example/` goes from brief 100's 11 files to 12; one doctor row; no second secrets mechanism |
| Phase 14 (R-91) | the `bb2dash-mcp` image (`mcp-server/Dockerfile`), `bb2dash_mcp_service_key` and `SUPABASE_SERVICE_ROLE_FILE` | copied in as a build stage; the key stays one file, mounted read-only at runtime, never in a layer (D-4) |
| Phase 14 (R-92) | `claude_oauth_token`, the setup-token path, the API-key guard | same secret and the same guard; the token's usage is shared with his interactive sessions |
| Phase 14 (R-84, `db/migrations/091_sync_runner_role.sql`) | `sync_runner`'s shape | `workspace_runner` copies its pattern (login role, DEFINER RPCs, no table grants, negative tests, password out of band); no RPC is shared; `agent_requests` gains no kind |
| Phase 15 | `node scripts/db-test.mjs --only <file>` and the `db_test_runner` role (both new in Phase 15, migration 100, brief 95) | the three `phase21_*` units run through it; 140 and 142 add the grants brief 95 asks for every table a unit writes; 142 adds the one membership brief 95 does not grant, and W-63 widens phase15_100's assertion to match |
| Phase 17 (P-71) | `v_scheduler_heartbeat` (new in Phase 17, brief 97), the transform and calendar ticks' heartbeat | not touched; the Workspace has its own heartbeat row and view |
| Phase 20 and the harness | the `rag` MCP server and its collections | read-only consumer; no harness change; the realm vault is not written |
| Phase 22 | the Workspace page is in its inventory (94 §3) | existing tokens only, both themes readable, no new colours; Phase 22 restyles |
| Sprint 1 objects | `agent_requests`, `transform_tick`, the Inbox, `v_sync_status`, the Electron poller | none touched |

### Must respect

* [2026-09-24] "**Sprint 2 is planned on stated defaults, all provisional:** … No product call in them
  is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a
  default as decided before then"
* [2026-09-03] "Crawler holds only the publishable key; insert-only RLS" — why: "browser-side code
  must never see the service key"
* [2026-09-09] "Renderer: CSS Modules + custom properties, **no Tailwind**"
* [2026-09-09] "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge
  only on Stack's word"
* [2026-09-10] "RLS hardened to owner-scoped (migration 020): 21 `using(true)` authenticated
  policies → `auth.uid() = public.app_owner()`"
* [2026-09-10] "**All 15 public views are `security_invoker`** with anon revoked (migration 036,
  guard block refuses a future non-invoker view)"
* [2026-09-10] "`courses.card_note` stored verbatim, capped at 280 by check constraint, rendered as
  text only" (the precedent for rendering answers as text)
* [2026-09-10] "Parallel phases get **non-overlapping migration ranges** (Phase 8 = 026–029,
  Phase 9 = 030–039) allocated in the briefs"
* [2026-09-10] "Phase 7 workers run on their own branches (`feat/<phase>-db`, `feat/<phase>-clients`)
  in separate worktrees, cut from the phase branch; the PM merges them back"
* [2026-09-11] "SECURITY DEFINER transform functions are not callable by `authenticated` (038); the
  app's only path to a transform is an `agent_requests` row"
* [2026-09-14] "notifications come from a main-process **poller** with a watermark, not Realtime" —
  why: "background events belong to polling (sockets die across sleep)". The Workspace uses
  Realtime only for a foreground stream and falls back to polling.
* [2026-09-14] "**Every task carries an executable check** (test, SQL assertion, curl, screenshot
  diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check
  is not a task"
* [2026-09-15] "Parallel PM sessions never branch or commit in the shared checkout
  `C:/Users/estac/projects/bb2dash`; each phase branch is its **own worktree** (`bb2dash-wt-<phase>`)
  and the brief is edited there"
* [2026-09-16] "Phase 14 research calls, proposed (frozen when its PM session runs): … Claude in
  containers uses the subscription token from `claude setup-token`"
* [2026-09-16] "A phase PR's `database.types.ts` carries **only its own schema objects** while
  another phase's migrations are live on prod but unmerged"
* [2026-09-17] "Everything else in `assignment_progress` / `reading_progress` is still never written
  by a sync"
* [2026-09-23] "Fan-out subagents run on **Opus** (verifiers, reviewers, mergers, builders) or
  **Sonnet** (researchers); Fable is the PM session only"
* [2026-09-22] "**Decisions are stored twice, on purpose:** one vault note per item under
  `projects/bb2dash/decisions/` with `collection: bb2dash-inbox-decisions` (its own section of the rag
  store, queried with `search_context({collection})`)"
* [2026-09-16, brief 82 Stack's decision #16; not a DECISIONS row] "Guardrails: **$0**; today's
  non-Docker Windows path keeps working until acceptance; service key never in an image"
* v3 §4, still declined until a row says otherwise: D-1 "In-app chat assistant" (reversed by this
  phase's row); D-2 "Agent write path into `assignment_progress` / `reading_progress`"; D-4
  "Service-role key anywhere client-side, in a browser, in the repo, or in a container image", with
  "The materials MCP server's secret is the one sanctioned holder."; D-5 "Exposing the stack beyond
  the single owner"; D-19 "Tailwind or any UI framework; new dependencies for styling"; D-21 "The
  two vector stores never cross."

## MVP (in Stack's words)

Stack wrote (91 §3): "workspace section: functions as a chatbot interface that works by routing
prompts to different agent model levels depending on the complexity of the task. Low effort for
simple rag db queries or pulling of documents, higher models for the actual execution of the tasks.
Currently I want to build it as if I might route it to either a local model or to a frontier model.
Claude is the only one we will actually hook up but I wish to build the functionality. Ideally use my
subscription to run it instead of having to pay for api credits." His acceptance field is still
"_to confirm_"; until he answers B-5, the acceptance is the **PM's wording** from 93 §5 item 5: on a
Workspace page I ask a question; simple lookups answer from the two stores, harder ones go to a
stronger model; every answer names the tier; nothing costs API credits. The PM adds, also PM wording:
nothing I ask can change my planner, my progress or any fact, and the local and frontier providers
exist as typed stubs that say they are not connected.

## Definition of done

**SOP gates**

- [ ] `web/`: `npm run typecheck`, `npm run build`, `npx vitest run` green; test count not below
      `main`'s at the cut (both numbers in 102a).
- [ ] `workspace/`: `npm run typecheck`, `npx vitest run` green; line coverage of `src/` ≥ 80 %.
- [ ] `mcp-server/`: `npx vitest run` green (its code is unchanged; the copied build stage still
      builds). `desktop/` is untouched: `git diff --stat origin/main -- desktop` prints nothing.
- [ ] SQL: `node scripts/db-test.mjs --only <file>` prints `PASS` and exits 0 for each of the three
      `phase21_*` units, and the whole suite (`node scripts/db-test.mjs`) ends `failed 0`; 140–142
      dry-run in `begin … rollback`, applied under the file's name, byte-identical.
- [ ] RED first: every task's named test file was committed failing before its code, and the red run
      is quoted in the worker's section of 102a (tasks 1, 5, 12, 13 and 17–26 are checks, not code).
- [ ] `/code-review main high` on both PRs: CRITICAL and HIGH cleared.
- [ ] `/security-review` (required: a new database role, RLS on `realtime.messages`, secrets, the
      firewall, the tool gate, a new queue path).
- [ ] STATUS, DECISIONS, ORCHESTRATOR and root `CLAUDE.md` (a project fact: the Workspace exists and
      is read-only) updated in the bb2dash PR; `DATA_SYNTAX.md` has the Workspace section.
- [ ] Both PRs open; the bb2dash branch has a Vercel preview, walked logged in; merge only on
      Stack's word.
- [ ] Every row of §Task list passes its check; evidence in `102a_PHASE21_VERIFICATION.md`.

**Stack's acceptance script** (after Phase 14's acceptance; his laptop)

1. Confirm the one `alter role workspace_runner password …` line the PM handed him at task 12 is
   applied (he pasted it into the Supabase SQL editor then; it is never in a file), that
   `secrets/workspace_runner_db_url` holds the matching DSN, and run `just up`.
2. `just doctor`: the Workspace row is green.
3. Open **Workspace** from the top bar, in the browser and then in the desktop shell.
4. Ask "What does the IST.323 syllabus say about late work?": the answer streams in, the badge reads
   Haiku, the "Used:" line names search_materials, and the answer names the file it read.
5. Ask "What did I decide about ECN.304 Quiz 2?": Haiku, and the "Used:" line names
   search_context · bb2dash-inbox-decisions (the store held decisions 434 and 528 on it on 2026-09-24).
6. Ask "Draft a two-week study plan for ECN.304 from the lecture slides": the badge reads Opus.
7. Ask it again and press **Stop** part-way: the answer ends and says it was stopped.
8. Ask a third time and reload the page mid-answer: after the reload the finished answer is there.
9. `docker compose stop workspace`: within two minutes the page says the Workspace service is
   offline; `just up`: it is back.
10. The PM shows task 20's before and after numbers: nothing on his planner or progress changed.
11. He reads the D-1 reversal row and the acceptance row and says "accepted".

**What proves each requirement**

- S2-workspace-1: acceptance steps 3–11, task 22's screenshots, task 24's D-1 reversal row.
- P-83: task 7 green, task 19's stored tier `low` for the lookup, screenshot 05 (Opus).
- P-84: task 8 green; the two stubs type-check and refuse with `provider_not_configured`.
- P-85: tasks 6, 9, 11, 12, 14, 19 and 21 green; one live turn stored with its tier, model and
  session id. Its `workspace_reader` half is not built in v1 (PROVISIONAL, O-4).
- P-86: tasks 2 and 15 green; a stranger uid reads 0 rows from all four tables.
- P-87: tasks 3 and 4 green, and task 5's partition count, stored message and spike screenshot
  before the transport is frozen; task 16's stream rendering.
- P-88: task 6's negative grants, task 10's gate, task 12's egress and non-root checks, tasks 13,
  18 and 23 at zero findings.

## Task loops

| # | loop | executable check | owner |
|---|---|---|---|
| 1 | Seam gate (task 1), then O-1..O-5 and B-5 to Stack in one message; the Contract frozen with his answers, each in a DECISIONS row dated the day he gives it | task 1's counts; `grep -c "B-5" project-state/DECISIONS.md` greater than at the cut | PM + Stack |
| 2 | Cut `feat/workspace-21` as `bb2dash-wt-21`, then one Opus worker per stream in its own worktree (§Workers) | in bb2dash `git worktree list \| grep -c "feat/workspace-21"` → 5 (the PM's and W-63..W-66's branches); in bb2dash-stack the same command → 1 (W-65's) | PM |
| 3 | Per task: the named test committed failing (RED) → code → green → the worker's 102a section → the PM re-runs the row's check; a row that fails goes back to its worker | the row's own check, run by the PM | workers + PM |
| 4 | Realtime spike (task 5) before W-66 builds the screen on the transport (task 16) | task 5's three checks | PM, in Stack's preview |
| 5 | Integrate, regenerate types, full suites, advisors | tasks 17 and 18 | PM |
| 6 | PM walk, live checks, reviews, docs, both PRs with the preview | tasks 19–25 | PM |
| 7 | Stack's acceptance walk | task 26 | Stack |

## Task list

Paths are from the bb2dash repo root unless a row says bb2dash-stack. "Runner on `<file>`" in a check
means Phase 15's `node scripts/db-test.mjs --only <file>`, and "→ PASS" means it prints `PASS  <file>`,
its last line reads `db-test: passed 1, failed 0, units 1`, and it exits 0 (brief 95's frozen output).
Order: 1 → (2, 3's policy count, 6 ∥ 7–11 ∥ 4, 15) → 5 → 3's runner check → 12 (after Stack's
password paste, task 19's first half) → 13, 14 → 16 → 17, 18 → 22 with 19–21 → 23–25 → 26. Tasks 7–11
run in parallel with 2–6 (disjoint files).

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | Seam gate: Phase 14's and Phase 15's objects are on `main` (names as briefs 100 and 95 freeze them) | S2-workspace-1 | PM | (d) in bb2dash `git ls-files compose.yaml mcp-server/Dockerfile mcp-server/src/env-file.ts \| wc -l` → 3; in bb2dash-stack `git ls-files secrets.example/claude_oauth_token secrets.example/bb2dash_mcp_service_key secrets.example/harness_database_url doctor/doctor.mjs justfile \| wc -l` → 5 (`package.json` for `justfile` if B-51 chose npm scripts); (b) `select count(*) from pg_roles where rolname in ('sync_runner', 'db_test_runner')` → 2 (0 on 2026-09-24); (d) `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner` | "Phase 14's container, secrets and MCP image were in place before any Workspace code" |
| 2 | Migration 140: tables, owner RLS, `workspace_ask` / `workspace_cancel`, the status view, the `db_test_runner` grants; the `DATA_SYNTAX.md` section | P-86 | W-63 | (a) Runner on `phase21_140_workspace_tables.sql` → PASS (ask creates 3 rows; a 2nd open request is refused; an owner insert of `role = 'assistant'` is refused; an owner update to `done` is refused; cancel queued → true, cancel done → false; 8001 characters refused; a stranger uid reads 0 rows from each table; `anon` holds no grant; no TRUNCATE); (b) after apply `select count(*) from pg_class where relname in ('workspace_conversations','workspace_messages','workspace_requests','workspace_runner_heartbeat') and relrowsecurity` → 4; `select count(*) from pg_indexes where tablename = 'workspace_messages' and indexdef ~ '\((parent_message_id\|request_id)'` → 2; (d) `grep -c "workspace_messages" DATA_SYNTAX.md` at least 1 (0 on `main` a5042fa) | "My conversations are stored where only I can read them" |
| 3 | Migration 141: the receive-only Realtime policy | P-87 | W-63 | (b) right after apply: `select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'` → 1 (0 on 2026-09-24); (a) once 142 is applied and task 5 has shown a partition: Runner on `phase21_141_workspace_realtime.sql` → PASS (a `workspace_stream()` call under `set local role workspace_runner` to `workspace:<uuid>` is readable as the owner with `realtime.topic` set to that topic; 0 rows for a stranger uid, 0 for topic `other:x`, 0 for `anon`; a `realtime.send` made as `authenticated` stores 0 rows) | "Only I can receive a Workspace stream" |
| 4 | Stream hook and the route skeleton (`/workspace?c=` shows streamed text) | P-87 | W-66 | (a) `cd web; npx vitest run test/use-workspace-stream.test.tsx` → 0 failed (channel opened with `private: true` after `setAuth`; seq 3,1,2 renders in order; a repeated seq is dropped; another `request_id` is ignored; `done` invalidates the messages key; unsubscribe on unmount) | "The page shows an answer while it is being written" |
| 5 | **Realtime spike (gate)**: 140–141 applied, the branch preview up, Stack logged in to it; then the PM creates one conversation and one queued request as the owner (`select public.workspace_ask(null, 'spike')` under `set local role authenticated` with Stack's JWT claims, committed; no runner is up, so it stays `queued`), opens `/workspace?c=<its conversation_id>` in Stack's logged-in preview, and sends `select realtime.send(jsonb_build_object('request_id', <its request_id>, 'seq', 1, 'delta', 'spike-ok 1'), 'delta', 'workspace:<its conversation_id>', true)`, then cancels it with `workspace_cancel(<request_id>)` | P-87 | PM, in Stack's logged-in preview | (b) immediately before the send: `select count(*) from pg_inherits where inhparent = 'realtime.messages'::regclass` at least 1 (0 on 2026-09-24); (b) after it: `select count(*) from realtime.messages where topic = 'workspace:<its conversation_id>'` → 1; (c) `docs/planning/sprint-2/walks/walk-21/01-realtime-spike.png`: `/workspace?c=<its conversation_id>` on the preview, logged in, the stream area reading `spike-ok 1` and the page's Network panel shows no document request after the send. If any of the three fails: stop, re-plan the transport as polling only, and write the DECISIONS row that says so | "Text appeared on the Workspace page without a reload" |
| 6 | Migration 142: `workspace_runner`, its one member `db_test_runner`, and the four DEFINER RPCs | P-85, P-88 | W-63 | (a) Runner on `phase21_142_workspace_runner.sql` → PASS (claim takes the oldest queued; a second claim with nothing queued returns 0 rows; a claim older than 10 min is swept to `stale_claim`; begin refuses an unclaimed request; stream is false after cancel, true while claimed; finish stores content, tool calls and session id; finish keeps a cancelled request cancelled; under `set local role workspace_runner`, `select` on `assignment_progress`, `reading_progress`, `workspace_messages`, `agent_requests` each raises 42501, 4 of 4); Runner on `phase15_100_db_test_runner_role.sql` → PASS; (b) `select count(*) from information_schema.role_table_grants where grantee = 'workspace_runner'` → 0; `select count(*) from information_schema.routine_privileges where grantee = 'workspace_runner'` → 4; `select has_function_privilege('authenticated', 'public.workspace_claim(text)', 'execute')` → false | "The Workspace's database login cannot read my planner or my progress" |
| 7 | Router and tier map | P-83 | W-64 | (a) `cd workspace; npx vitest run test/router.test.ts` → 0 failed over `test/fixtures/router-cases.json` (the test itself asserts at least 30 cases, at least 8 per tier, at least 6 follow-ups, and that acceptance steps 4–6's three questions route `low`, `low`, `high`) | "A lookup got Haiku; a drafting request got Opus" |
| 8 | Provider seam and the frozen argv | P-84 | W-64 | (a) `cd workspace; npx vitest run test/providers.test.ts test/claude-argv.test.ts` → 0 failed (argv equals the Contract list; first turn `--session-id`, later `--resume`; the prompt is the last element, after `--`, including a prompt that begins `--model`; the two stubs throw `ProviderNotConfiguredError`); (d) `grep -rn -- "--bare" workspace/src \| wc -l` → 0; `grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json \| wc -l` → 0 | "The local and frontier providers exist and say they are not connected" |
| 9 | Record three live fixtures on the host (Stack's subscription), scrub them, then the stream parser | P-84, P-85 | W-64 | (a) `cd workspace; npx vitest run test/stream-json.test.ts` → 0 failed over `claude-stream-lookup.jsonl` (deltas join to the recorded final text; tool events carry name and input), `claude-stream-budget-stop.jsonl` (recorded with `--max-budget-usd 0.01`; maps to `budget_exceeded`) and `claude-stream-resume-missing.jsonl` (maps to the replay fallback); the same test asserts every tool-result body in the three files is the literal `<scrubbed>`, so no course material enters git. Recorded with the frozen argv except `--strict-mcp-config`, `--mcp-config` and `--settings`: the host's own `bb2dash` and `rag` registrations serve the tools, so no key is copied anywhere. If the budget fixture shows no stop, the row fails and goes to Stack as open item O-2 | "A real answer was recorded once and replays in the tests" |
| 10 | Tool gate hook | P-88 | W-64 | (a) `cd workspace; npx vitest run test/tool-gate.test.ts` → 0 failed (allows the four MCP tools; denies Bash, Read, Write, Edit, WebFetch, WebSearch, Task, any `mcp__supabase*`, `mcp__rag__get_document`; denies `search_context` with no collection or one off `RAG_COLLECTIONS`; allows `bb2dash` and `bb2dash-inbox-decisions`) | "The assistant can use only the four read tools" |
| 11 | Runner loop, MCP config, key guard, system prompt, healthcheck | P-85, P-88 | W-64 | (a) `cd workspace; npx vitest run test/runner.test.ts test/mcp-config.test.ts test/config.test.ts` → 0 failed (claim → route → begin → deltas flushed every 250 ms → finish; Stop kills the child within 2 s and stores `cancelled`; 8 min stores `timeout`; a resume failure replays 20 messages; start refused with `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or a `CLAUDE_CODE_USE_*` variable set; `workspace/claude/settings.json` has no `apiKeyHelper`; `WORKSPACE_TURN_BUDGET_USD` of 0 or 1.01 refused; the config holds exactly `bb2dash` and `rag`, the materials entry carries a file path and no key); (d) `cd workspace; npx vitest run --coverage` → `src/` lines at least 80 % | "Stop, a time-out and a lost session each end cleanly" |
| 12 | Image, entrypoint, firewall, the `workspace` service | P-85, P-88 | W-65 | run from `bb2dash-stack`, after Stack has pasted the `workspace_runner` password line (task 19's first half): (d) `docker compose build workspace` exits 0; `docker compose exec workspace claude --version` prints `<pin> (Claude Code)`, `<pin>` being the Dockerfile's pinned version (2.1.282 unless the PM re-pins at the cut; the value in 102a); `docker compose exec workspace sh -c "claude --help \| grep -c -E -- '^  --(tools\|permission-prompts\|strict-mcp-config) '"` → 3 (3 on the host's 2.1.282, re-run 2026-09-24); `docker compose exec workspace sh -c "ps -o user= -C node,claude \| sort -u"` → `node`; `docker compose exec workspace printenv ANTHROPIC_API_KEY` exits 1; `docker compose config --format json \| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).services.workspace.ports===undefined))"` → `true`; `docker inspect -f '{{.State.Health.Status}}' $(docker compose ps -q workspace)` → `healthy`; (e) `docker compose exec workspace node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"` → `blocked`, and the same line for `https://api.anthropic.com` → a number (any HTTP status) | "The Workspace service starts healthy, runs as an ordinary user and reaches only Anthropic and Supabase" |
| 13 | No secret in the image | P-88 | W-65 | (d) brief 100's image proof (its task 27) on the workspace image: `gitleaks dir <exported fs>; echo $?` → 0; `docker history --no-trunc <workspace image> \| grep -c -E "sk-ant-\|sb_secret_\|eyJhbGciOi\|postgres(ql)?://[^ ]*:[^ @]*@"` → 0 (token, secret-key, JWT and password-bearing DSN shapes; variable names such as `SUPABASE_SERVICE_ROLE_FILE` do not match); both outputs pasted into 102a | "No secret is baked into the Workspace image" |
| 14 | bb2dash-stack: the secret name, the doctor row, the README section | P-85 | W-65 | (a) in bb2dash-stack `node --test doctor/workspace.test.mjs doctor/doctor.test.mjs` → 0 failures (the doctor exits non-zero when `secrets/workspace_runner_db_url` is empty or the service is unhealthy); (d) `git ls-files secrets.example \| wc -l` → the count at the cut + 1 (12 against brief 100's 11) | "`just doctor` shows the Workspace row" |
| 15 | Query layer | P-86 | W-66 | (a) `cd web; npx vitest run test/queries.workspace.test.ts` → 0 failed (ask trims and refuses empty or 8001 characters before any request; `?c=` must be a uuid; rows normalised by pure functions; cancel; offline when `polled_at` is over 120 s old; the messages query refetches every 5 s only while a request is open) | "The page refuses an empty or oversized question before sending it" |
| 16 | The Workspace screen and the nav link | S2-workspace-1, P-86, P-87 | W-66 | (a) `cd web; npx vitest run test/Workspace.test.tsx test/TopNav.workspace.test.tsx test/workspace-labels.test.ts test/audits.test.ts` → 0 failed (one tier badge per assistant row; the "Used:" line from `tool_calls`; `<script>` in content renders as literal text; tool result text never renders; the button reads "Ask"; Stop only while a request is open; one sentence per `error_code`; the offline line; Workspace sits after Materials; the audits' "no Submit" and "no service-role credential under src/" cases stay green) | "Every answer names its tier" |
| 17 | Integrate: 140–142 confirmed applied, types regenerated, full suites | all | PM | (b) `select count(*) from supabase_migrations.schema_migrations where name in ('140_workspace_tables', '141_workspace_realtime_policy', '142_workspace_runner_role')` → 3; (a) `cd web; npm run typecheck; npm run build; npx vitest run` → 0 failed, test count not below `main`'s at the cut; `cd workspace; npm run typecheck; npx vitest run` → 0 failed; `cd mcp-server; npx vitest run` → 0 failed; `node scripts/db-test.mjs` → last line ends `failed 0, units <n>` | "Every suite is green after integration" |
| 18 | Advisors | P-88 | PM | (d) `get_advisors` security: 0 lints naming a `workspace_*` object or `realtime.messages`; performance: 0 `auth_rls_initplan` and 0 `unindexed_foreign_keys` on the four workspace tables | "Supabase's advisors flag nothing on the Workspace" |
| 19 | The `workspace_runner` password out of band (Stack, before task 12's health check), then the first live turn in the container | P-85, P-83 | Stack (the password), PM | (b) after the PM asks acceptance step 4's question in task 22's walk: `select tier, provider, model, finished, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1` → `low`, `claude-cli`, `haiku`, true, null; `select state from workspace_requests order by id desc limit 1` → `done`; `select count(*) from workspace_conversations where claude_session_id is not null` at least 1 | "My first question was answered from the syllabus" |
| 20 | Planner state and facts untouched by the walks | S2-workspace-1 | PM | (b) `select max(updated_at) from assignment_progress`, `select max(updated_at) from reading_progress` and `select count(*) from assignments`, read immediately before and after task 22's walk and again before Stack's step 3 and after his step 9, are equal pair by pair (all values in 102a); and `select count(*) from agent_requests where created_at >= <the first read's time>` → 0, so no sync ran in between (if one did, that walk is repeated) | "Nothing I asked changed my planner" |
| 21 | The cap and Stop, live | P-85 | PM | (b) one turn with `WORKSPACE_TURN_BUDGET_USD=0.01` (reset to 1.00 after) → `select error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1` → `budget_exceeded`; after a Stop → `select state from workspace_requests order by id desc limit 1` → `cancelled` | "Stop stopped it" |
| 22 | PM walk on the preview and the desktop shell | S2-workspace-1 | PM | (c) in `docs/planning/sprint-2/walks/walk-21/`: `02-empty.png` (Workspace link active in the top bar, an empty conversation list, the "Ask" button); `03-lookup-haiku.png` (badge "Haiku · lookup", a "Used:" line naming `search_materials`); `04-decision-haiku.png` (a "Used:" line naming `search_context · bb2dash-inbox-decisions`); `05-deep-opus.png` (badge "Opus · deep work"); `06-stopped.png` (the stopped sentence under a partial answer); `07-offline.png` (the offline line); `08-desktop.png` (the same conversation inside the Electron window) | "Screenshots of every state are in the walk folder" |
| 23 | Code review and security review | P-88 | PM | (d) `/code-review main high` and `/security-review` on both PRs; 102a's findings table shows 0 open CRITICAL and 0 open HIGH | "Both reviews end with no open critical or high finding" |
| 24 | Docs: DECISIONS rows, STATUS, ORCHESTRATOR, CLAUDE.md | S2-workspace-1 | PM | (d) `grep -c "Reversal adopted (Requirements v3 §4 D-1)" project-state/DECISIONS.md` → 1; `grep -c "workspace_runner" project-state/DECISIONS.md`, `grep -c "Phase 21" project-state/STATUS.md`, `grep -c "Phase 21" project-state/ORCHESTRATOR.md` and `grep -c "Workspace" CLAUDE.md` each greater than on `main` at the cut (the cut's values in 102a; `CLAUDE.md` and `DECISIONS.md` read 0 on a5042fa) | "The decision log says the chat assistant is in, read-only" |
| 25 | Both PRs open, preview live | all | PM | (d) `gh pr view <n> --json state -q .state` → `OPEN` for the bb2dash and the bb2dash-stack PR; (e) the preview's `/login` → HTTP 200 (through `vercel curl` when deployment protection is on) | "Both PRs are open with a preview link" |
| 26 | **Stack's acceptance walk** | S2-workspace-1 | Stack | (d) `grep -c "Phase 21 accepted" project-state/DECISIONS.md` → 1, a row dated the day he walks steps 1–11 | the eleven steps |

DECISIONS rows owed in this phase (task 24): the D-1 reversal ("Reversal adopted (Requirements v3
§4 D-1)", naming the tier map, read-only v1 and the subscription path); Realtime Broadcast as the
Workspace transport with the polling fallback (after task 5); `workspace_runner` as a second
database principal that cannot reach planner state or facts; rendering answers as text; the
two-PR exception under B-51; and Stack's answers to B-5, dated the day he gives them.

## Workers

Workers are Opus (DECISIONS 2026-09-23), commit and push per task (`feat(P-85): …`), never touch
`project-state/`, apply their migrations to prod only after a `begin; … rollback;` dry run (W-63
applies 140–142; the PM confirms them at task 17), and hand the PM a verification section for 102a
that quotes each task's red run and green run. `database.types.ts` is the PM's at integration; W-66
types the RPCs locally from this Contract until then.

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-63 | db | `feat/workspace-21-db` | `bb2dash-wt-21-db` | `db/migrations/140_workspace_tables.sql`, `db/migrations/141_workspace_realtime_policy.sql`, `db/migrations/142_workspace_runner_role.sql` (and 143–149 if a review round needs one), `db/tests/phase21_*.sql`, the membership assertion of `db/tests/phase15_100_db_test_runner_role.sql`, the Workspace section of `DATA_SYNTAX.md` | 2, 3, 6 |
| W-64 | runner | `feat/workspace-21-runner` | `bb2dash-wt-21-runner` | everything under `workspace/` | 7, 8, 9, 10, 11 |
| W-65 | container | `feat/workspace-21-container` (bb2dash) and `feat/workspace-21` (bb2dash-stack) | `bb2dash-wt-21-container`, plus a bb2dash-stack worktree | `docker/workspace/`, the `workspace` block of `compose.yaml`; in bb2dash-stack `secrets.example/workspace_runner_db_url`, `doctor/workspace.test.mjs`, the workspace row of `doctor/doctor.mjs`, `doctor/doctor.test.mjs` if it pins the secret list, the README section | 12, 13, 14 |
| W-66 | web | `feat/workspace-21-web` | `bb2dash-wt-21-web` | `web/src/app/(app)/workspace/`, `web/src/components/workspace/`, `web/src/lib/queries.workspace.ts`, `web/src/lib/use-workspace-stream.ts`, `web/src/lib/workspace-labels.ts`, the one `NAV_LINKS` line in `web/src/components/shell/TopNav.tsx`, the five new `web/test/` files | 4, 15, 16 |
| PM | integration | `feat/workspace-21` | `bb2dash-wt-21` | `web/src/lib/supabase/database.types.ts`, `project-state/`, root `CLAUDE.md`, `docs/planning/sprint-2/walks/walk-21/`, `docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` | 1, 5, 17–25 (19 with Stack) |

## Out of scope

* Any write tool, on any tier, and any propose-then-approve path (a later phase, only if Stack
  answers B-5 (c) otherwise; PROVISIONAL).
* The Haiku classifier (a fast-follow only if the heuristic misroutes, per B-5 (e); PROVISIONAL).
* Wiring Ollama or a frontier API; the stubs only type-check (a later phase).
* Planner, grades or Inbox data as a Workspace tool, and with it P-85's `workspace_reader` role (the
  research's view-backed reader; open item O-4, PROVISIONAL).
* Phase 14's own objects: the umbrella, the shim, the images, the secrets folder, the dev container,
  the scheduler, `sync_runner` (Phase 14).
* The optional one-turn `claude -p` summary of a sync (R-96's deferred list, Phase 14).
* Harness code, a read-only role on `harness-memory`, and any change to the realm vault (the harness
  repo; Phase 20).
* Styling beyond the existing tokens, and the phone-width nav fold (Phase 22).
* `agent_requests` kinds, `transform_tick`, the Inbox, the Electron poller, toasts for finished
  answers (untouched; no phase owns a change).
* Sharing a conversation or any second user (v3 §4 D-5).

## Open items for Stack

All PROVISIONAL: PM defaults, not Stack's calls. Only what B-5 leaves open; each carries the default
this brief builds, and each gets a DECISIONS row dated the day he answers.

* **O-1 · Which harness collections.** Default: `bb2dash` and `bb2dash-inbox-decisions`, the two
  bb2dash collections the store held on 2026-09-24. Adding a class collection is one entry in
  `RAG_COLLECTIONS` and one fixture row.
* **O-2 · If the $1 cap does not stop a subscription-billed turn** (task 9's budget fixture shows
  it). Default: keep the flag, rely on the 8-minute turn limit and one-turn-at-a-time as the hard
  stops, and say under the answer that no per-answer cap applies.
* **O-3 · Whole notes from the harness store** (`get_document`). Default: off in v1; search chunks
  carry the text. Turning it on needs an id rule the gate can check, since note ids do not carry
  their collection (`bb2dash-inbox-decision-528`, `session-<uuid>--…`).
* **O-4 · Planner and grades as a Workspace tool.** Default: not in v1 (his words scope the cheap
  tier to "simple rag db queries or pulling of documents"); a later phase adds a read-only,
  view-backed tool under its own role.
* **O-5 · A tier override and Markdown rendering.** Default: neither in v1; the badge names the
  tier, and answers render as plain text.

## Session prompt (copy-paste, after Phase 14 merges)

> `/bb2dash-pm` Start Phase 21 (S2-workspace-1, P-83..P-88). Read
> `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md` in full and run task 1's seam gate against
> `main` before anything else (Phase 14 and Phase 15 merged). Put the brief's open items O-1..O-5
> to me, with B-5 if I have not answered it, and wait. Then cut `feat/workspace-21` as worktree `bb2dash-wt-21`, spawn W-63..W-66
> (Opus) in their own worktrees, run the Realtime spike (task 5) as a gate before the transport is
> frozen, integrate, run every deterministic check, walk the preview and the desktop shell, run the
> gates, open the bb2dash and bb2dash-stack PRs with the preview link, and stop at "ready when you
> say so". Hand me the one password line for `workspace_runner` before the container's health check
> (task 12); never put it in a file.
