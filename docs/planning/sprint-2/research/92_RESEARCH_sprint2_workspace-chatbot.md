# 92 — Sprint 2 research: workspace-chatbot

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: §3 S2-workspace-1 (new feature; no §1
entry yet) with seams to R-91, R-92, R-84 and the harness rag store

## 0. Summary

S2-workspace-1 is a whole subsystem, not a screen: a router, a Claude-CLI provider, two MCP
tool stores, a container job and a chat UI, all new. It reverses v3 §4 D-1 ("in-app chat
assistant, declined") and needs its own DECISIONS row on adoption. The router should not be
RouteLLM's trained classifier (wrong scale for one user); it should be a cheap heuristic plus an
optional one-turn Haiku classification call, reusing only RouteLLM's threshold-decision *idea*.
The backend must be the unmodified `claude` CLI (`claude -p`), never the Agent SDK library or
`--bare` mode — both explicitly require API-key billing per Anthropic's own current pages,
breaking the "use my subscription" ask. The backend cannot be a Supabase Edge Function (2 s CPU,
150–400 s wall clock) or the browser; it has to be a container process, which means it rides
Phase 14's not-yet-built scaffolding (bb2dash-stack, secrets/, the OAuth-token pattern, the
materials-MCP image) rather than inventing a parallel one. The biggest risk isn't technical: it's
that Anthropic already drafted, then paused, a plan (announced May 14, 2026, due to take effect
June 15, paused June 16) to meter `claude -p`/Agent SDK usage out of the subscription pool into a
separate dollar credit; that plan is explicitly "being revised," so a feature whose entire value
proposition is "$0, rides the subscription" is one Anthropic announcement away from a real cost.
Conversation storage follows the existing owner-scoped RLS pattern (`auth.uid() = app_owner()`)
and the existing `agent_requests` queue shape (atomic claim, dead-letter sweep on a stuck
`claimed` row); streaming should ride Supabase Realtime **Broadcast** sent server-side by the
container process, not `postgres_changes` (row-per-token is the wrong shape) and not an edge
function relay (can't host the call). Tool access must stay read-only end to end in v1 — no RPC
that can reach `assignment_progress` / `reading_progress` / `grade_column_links` belongs on the
allowlist, full stop, not even the one sync-only exception. Total size: **L** (six research-added
sub-items below, roughly S+M+M+M+S+S). Sequencing: this phase reuses so much of Phase 14's
scaffolding (container secrets, the OAuth-token pattern, the materials-MCP image) that it reads
as a Phase-14 follow-on, not a parallel build — a Stage C ordering question, not a Stage B one.

## 1. S2-workspace-1 · workspace section: a chatbot interface that routes prompts by task complexity

### 1.1 Standard practice

A production LLM chat-with-tools surface has five separable concerns, each with a well-worn
default: (a) a **router** that picks a model tier per turn from a cheap signal, not a full
inference call, because the whole point is to avoid paying frontier cost to decide whether to pay
frontier cost; (b) a **provider abstraction** so the backend model is a config value, not
scattered branches — every multi-provider chat project in §1.2 below implements this as one file
per provider behind a shared interface; (c) a **durable conversation/message store** with a
parent-pointer tree (not just an array) so branching/regeneration and partial-turn recovery are
representable, not bolted on later; (d) a **transport** that streams tokens to the client without
requiring the backend call to live inside the request/response cycle of the web tier (the backend
call can run far longer than an HTTP timeout); (e) an explicit **tool/permission boundary**
between "the assistant can read this" and "the assistant can change this," enforced by the
transport layer, not by asking the model nicely. Source: the three open-source projects below all
converge on this shape independently, which is itself the evidence it's standard.

### 1.2 Open-source examples — fetched, what to borrow

| Project | What it is | What to borrow (fetched) |
|---|---|---|
| **[lm-sys/RouteLLM](https://github.com/lm-sys/RouteLLM)** (fetched 2026-09-24) | LMSYS's router framework: predicts a "win-rate" for the strong model on a given prompt and routes to the strong model only above a calibrated threshold, exposed as `router-[name]-[threshold]` in the model field or an OpenAI-compatible proxy. | **The threshold-decision *shape***, not the trained models. `python -m routellm.calibrate_threshold --routers mf --strong-model-pct 0.5` calibrates a numeric cutoff so N% of calls go to the strong tier — that's the right mental model for tuning bb2dash's own heuristic later (measure what fraction of turns a human would call "simple" and tune to match), without hosting RouteLLM's MF/BERT/causal-LLM checkpoints (`config.example.yaml`, fetched: `routellm/mf_gpt4_augmented` etc. — each is its own hosted model, disproportionate for one user's query volume). |
| **[danny-avila/LibreChat](https://github.com/danny-avila/LibreChat)** — schema files fetched via `gh api repos/danny-avila/LibreChat/contents/packages/data-schemas/src/schema/{convo,message}.ts` (2026-09-24) | Multi-provider ChatGPT-clone; Mongoose schemas for `Conversation` and `Message`, `api/` for provider adapters, resumable SSE streams. | **The message-row shape**, field for field: `messageId`, `conversationId`, `parentMessageId` (a tree, so a turn always points at what it replied to), `model`, `endpoint` (which provider), `text`, `isCreatedByUser`, `unfinished`, `error`, `finish_reason`, `tokenCount`. This maps almost directly onto a `workspace_messages` table (§1.4) and is a better starting shape than inventing one, because it already carries exactly the fields a partial/failed turn needs to recover from. |
| **[open-webui/open-webui](https://github.com/open-webui/open-webui)** — `backend/open_webui/routers/` directory listing fetched via `gh api` (2026-09-24) | Self-hosted chat UI over Ollama *and* OpenAI-compatible APIs, RAG, tool calling. | **The provider-per-file layout**: `routers/ollama.py` and `routers/openai.py` sit side by side behind one internal chat API — exactly the "local-or-frontier seam" Stack asked for, as a file-per-provider pattern rather than a runtime-negotiated protocol. Copy the *shape* (`providers/claude-cli.ts` today, `providers/ollama.ts` and `providers/frontier-api.ts` as unimplemented stubs behind the same TypeScript interface), not the code — open-webui is Python/FastAPI and this stack is Node. |
| **[Claude Agent SDK / `claude` CLI](https://code.claude.com/docs/en/headless)** (fetched 2026-09-24, see §1.3) | Anthropic's own headless-execution surface. | The actual backend: `claude -p`, not the SDK library (see pitfalls). Borrow the exact flag shape already proven for bb2dash's own sync-runner design in `research/82_RESEARCH_phase14_R2_claude_unattended.md` §2 — same non-`--bare`, `--permission-mode` + `--allowedTools` + `--permission-prompts none` recipe, extended with `--output-format stream-json --verbose --include-partial-messages` for token-level output and `--resume <transcript-path>` for conversation continuity (§1.4). |

A fourth, adjacent example worth naming without a link check: this very session's own environment
already encodes a Haiku/Sonnet/Opus tiering convention (`CLAUDE.md` "Model Selection Strategy" —
Haiku for lightweight/frequent calls, Sonnet for main work, Opus for deepest reasoning) and a
"every agent call carries an explicit model+effort" gate pattern surfaced in a September 2026
GitHub search result (`furkanzt/claude-agenting`, a PreToolUse gate for Claude Code's own Workflow
tool). Both are evidence the three-tier mental model Stack described is already the working
convention on this machine, not something to invent from scratch.

### 1.3 Known pitfalls, with sources

1. **The Agent SDK library requires API-key billing; only the unmodified CLI binary is covered
   by the subscription exception.** Fetched 2026-09-24 from
   [code.claude.com/docs/en/legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance),
   §"Authentication and credential use": *"Developers building products or services that interact
   with Claude's capabilities, including those using the Agent SDK, should use API key
   authentication... Nor does it prevent an end user from signing in to the unmodified Claude Code
   binary with their own Claude subscription."* This is the same finding R2 already reached for
   the sync-runner (§1 there); it applies identically here. **Build the workspace backend by
   shelling out to `claude -p`, never by importing `@anthropic-ai/claude-agent-sdk`.**
2. **A live, unresolved billing risk sits directly under "use my subscription instead of paying
   for API credits."** Anthropic announced (per Anthropic's own Help Center article,
   [support.claude.com/en/articles/15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan),
   fetched 2026-09-24) a plan to move `claude -p` and Agent SDK usage off the subscription's usage
   pool into a separate monthly dollar credit ($20 Pro / $100 Max-5x / $200 Max-20x), planned to
   take effect June 15, 2026. The same page confirms it was paused the next day: *"We're pausing
   the changes to Claude Agent SDK usage described below. For now, nothing has changed... We're
   working to update the plan to better support how users build with Claude subscriptions."* As
   of the fetch date this is still the live status — but Anthropic has stated intent to replace it
   with *something*, on notice. Size and build the feature assuming today's behavior, but do not
   promise Stack the $0 framing is permanent; note it as a standing risk in the brief.
3. **Advertised usage limits assume "ordinary, individual usage."** Same legal-and-compliance
   page: *"Advertised usage limits for Pro and Max plans assume ordinary, individual usage of
   Claude Code and the Agent SDK."* R2 already flagged this for a periodic sync poll; it is more
   pointed here, because a chat surface Stack actually uses could plausibly fire many turns in a
   sitting. Keep tiering honest (don't silently send every turn to Opus) and consider a soft daily
   turn/spend cap via `--max-budget-usd` (documented flag, confirmed 2026-09-24 against
   [cli-reference](https://code.claude.com/docs/en/cli-reference): *"Maximum dollar amount to
   spend on API calls before stopping (print mode only)... the cap-enforcement behaviors require
   Claude Code v2.1.217 or later"* — note its own wording is "API calls," so its interaction with
   subscription-token billing specifically wants a one-time smoke check before relying on it).
4. **Supabase Edge Functions cannot host this.** Fetched 2026-09-24,
   [supabase.com/docs/guides/functions/limits](https://supabase.com/docs/guides/functions/limits):
   wall-clock limit **150 s (free plan) / 400 s (paid)**, CPU time limit **2 s per request**. A
   `claude -p` turn that calls two MCP tool servers and reasons over retrieved context routinely
   exceeds 2 s of active CPU and can exceed even 400 s wall clock on a slow tier. This rules out
   the "edge function relay" half of the task's own framing outright — not a design choice, a hard
   platform ceiling. (CLAUDE.md's existing "edge CPU budget ≈ 8–9 embedding parts per invocation"
   note for `embed-corpus` is the same ceiling biting a different feature.)
5. **`--bare` mode is faster and CI-recommended, but silently breaks subscription auth.** Fetched
   2026-09-24 from [headless](https://code.claude.com/docs/en/headless): *"a `-p` session runs the
   hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`...
   [bare mode] never reads OAuth credentials or the system keychain... Set `ANTHROPIC_API_KEY`
   before running it, because bare mode doesn't use your subscription login."* And: *"`--bare` is
   the recommended mode for scripted and SDK calls, and will become the default for `-p` in a
   future release."* This is a genuine, sourced tension: the documented best-practice default for
   scripted `-p` calls is the one mode that cannot use Stack's subscription. Every workspace
   invocation must explicitly omit `--bare` and pass `--mcp-config`/`--allowedTools` by hand
   instead of relying on bare mode's directory auto-discovery — and this needs re-checking against
   whatever Claude Code version ships when `--bare` actually becomes the `-p` default.
6. **No documented way to keep one `claude -p` process warm across a chat's idle gaps.**
   `--input-format stream-json` exists (confirmed 2026-09-24, cli-reference) but the same page
   states plainly *"Print mode (`-p`) is documented as 'Print response without interactive mode'
   and exits after responding,"* and nothing in the fetched docs describes holding a `-p` process
   open across a multi-minute gap between a user's chat turns. The safe, documented pattern is one
   fresh `claude -p ... --resume <transcript-path>` invocation per turn, paying the context-reload
   cost (hooks, skills, CLAUDE.md, MCP server startup handshake) every time. This is a real latency
   cost worth measuring in a spike before committing to a per-turn UX promise (§1.5).
7. **D-21's boundary ("the two vector stores never cross") is adjacent, not violated, but must be
   named.** `91_REQUIREMENTS_v3.md` §4 D-21 declined "Hermes Agent and any change to the bb2dash
   materials store from the harness side." The workspace chatbot reads *both* stores read-only
   from the bb2dash side, through each store's own already-existing MCP server, and never merges
   them or writes cross-store — a different shape from what D-21 declined. Still, the `rag` MCP
   server's own tool description (mounted in this session) says outright: *"This is a different
   store from the harness `rag` server (session history). Do not mix their ids."* Treat that as a
   hard rule for the router's context-assembly step, not just a note.
8. **D-4's "one sanctioned holder" pattern extends cleanly, but only if followed.** D-4 declined
   "service-role key anywhere client-side, in a browser, in the repo, or in a container image...
   The materials MCP server's secret is the one sanctioned holder." The workspace container must
   reach the bb2dash materials store *through that same MCP server* (as R-91 already designs,
   `docker run -i --rm` with a read-only secret-file bind), never by holding its own service-role
   key. Its Supabase read access for course/grade context needs a **second, separate**
   least-privilege credential of its own (§1.4), following R-84's and R2 §3's precedent rather than
   copying the materials-MCP key or the browser's owner-JWT pattern (a container has no user JWT).
9. **Streaming shape: Realtime `postgres_changes` is the wrong tool.** Fetched 2026-09-24,
   [supabase.com/docs/guides/realtime/broadcast](https://supabase.com/docs/guides/realtime/broadcast):
   *"Postgres Changes require minimal setup but have some limitations as applications scale, and
   the recommendation is to use Broadcast for most use cases"* — and one row-write per streamed
   token would multiply that cost for no benefit, since tokens are ephemeral display state, not the
   durable record (the finished message row is). Broadcast supports RLS on private channels (the
   same page: private-channel delivery is checked by *"insert[ing] a message and try[ing] to read
   it, and rollback the transaction to verify that the Row Level Security (RLS) policies... are
   being respected"*), which fits this app's single-owner RLS model directly.

### 1.4 How it maps onto this stack

**Router.** A small pure function in `web/src/lib/` (new file, e.g. `workspace-router.ts`) that
takes the prompt text plus a cheap signal (message length, presence of imperative verbs like
"build/fix/refactor/write" vs. lookup verbs like "find/show/what/summarize", whether the last turn
already picked a tier) and returns `'low' | 'mid' | 'high'`. Wire an optional single-turn
`claude -p --model haiku` classification call behind a flag for a v2 upgrade if the heuristic
misroutes visibly — this reuses RouteLLM's threshold *idea* without hosting RouteLLM's trained
router (§1.2, §1.3 pitfall implicitly: a trained classifier is its own hosted model, which
contradicts "no local model infra yet"). Tier → model alias: `low → haiku`, `mid → sonnet`,
`high → opus` (confirmed aliases, `--model` flag, cli-reference fetch above).

**Provider seam.** A new small package, e.g. `workspace/src/providers/`, one file per provider
behind a shared TypeScript interface (`runTurn(conversationId, tier, messages): AsyncIterable<Token>`
or similar) — the open-webui pattern (§1.2) translated to this stack's language. Today: exactly one
implementation, `claude-cli.ts`, which shells to `claude -p`. Two stub files, `ollama.ts` and
`frontier-api.ts`, exist as unimplemented but type-checked placeholders — satisfying Stack's "build
the functionality... only actually hook up Claude" ask literally, without integrating either.

**Backend process — a new container service, not the browser, not an edge function.** Rides Phase
14's C-2 services table (`82_PHASE14_containers.md`): a fourth service alongside `sync`,
`harness-jobs` and `dev`, e.g. `workspace` in `bb2dash/docker/workspace/Dockerfile`, `node:22-slim`
base (same as R-91's proposed `bb2dash-mcp` image), non-root user. It runs two things side by side:
(1) a plain Node polling loop — the same architecture R2 §3 recommended for the sync-runner, for
the same reasons (auth fit with `CLAUDE_CODE_OAUTH_TOKEN`, lowest complexity, sub-minute latency is
invisible at this volume) — reading a new queue table (below) and shelling to `claude -p`; (2) the
two MCP servers as sibling `node` processes it registers in a `--mcp-config` JSON: `mcp-server/dist/index.js`
(bb2dash materials, R-91's own file, secret read from a mounted file) and agentic-harness's
`mcp-server/` (the `rag` server, pointed at the *separate* `harness-memory` Supabase project, its
own secret file). Both already speak stdio MCP; nothing new to build there beyond R-91's own work.

**`claude -p` invocation shape**, extending R2 §2's proven recipe with the parts unique to a chat
turn:
```bash
claude -p "<user's message>" \
  --resume "<path to this conversation's stored .jsonl transcript, or its session id>" \
  --model <haiku|sonnet|opus per router tier> \
  --allowedTools "mcp__bb2dash__search_materials,mcp__bb2dash__get_material_text,mcp__bb2dash__list_courses,mcp__rag__search_context,mcp__rag__get_document,<read-only Supabase tool(s)>" \
  --permission-mode acceptEdits \
  --permission-prompts none \
  --mcp-config /run/config/workspace-mcp.json \
  --output-format stream-json --verbose --include-partial-messages \
  --max-budget-usd 1.00
```
No `Bash`, `Write`, `Edit`, `apply_migration`, or any write-capable RPC ever appears in
`--allowedTools` (§1.3 pitfall 7's "no writes to planner state," taken literally for v1: zero write
tools, not just a narrowed set). The Node process forwards each `stream_event` text delta straight
onto a Supabase Realtime **Broadcast** private channel scoped to the conversation (server-side send
via the `@supabase/supabase-js` client, not a DB write per token — §1.3 pitfall 9), and persists the
finished message row once the `result` event arrives (or a partial/`unfinished` row on a timeout, so
a killed turn is recoverable the same way R2 §3 requires for a killed sync — the container needs its
own dead-letter sweep over any `workspace_requests` row left `claimed` past ~10 minutes, mirroring
R-84/R2's 20-minute sync sweep but tighter, since a chat turn should finish far faster than a crawl).

**Read-only Supabase access for the container.** Not the materials-MCP key (D-4), not the browser's
owner-JWT/RLS path (a container holds no user JWT), and not a broad Management-API personal access
token (§6 open question 33 already rejected that shape as too wide for a script). Follow R-84's and
R2 §3 option 2 precedent exactly: a new least-privilege role, e.g. `workspace_reader`, granted
`SELECT` only on the specific read-only views a turn needs (`v_work_items`, `v_course_display`,
`v_gradebook_latest`, `v_calendar_push_items` or similar — never a raw table, never
`assignment_progress`/`reading_progress`/`grade_column_links`), connected via a Postgres connection
string delivered as a Docker secret, same pattern as C-6's `sync_runner_db_url`.

**Conversation storage — two new tables**, following `agent_requests`' owner-scoped-RLS convention
(migration 020/032 pattern, `auth.uid() = public.app_owner()`) and LibreChat's message-row shape
(§1.2), hand-declared in a new `web/src/lib/queries.workspace.ts` until `database.types.ts`
regenerates (same "PM: replace with generated types at integration" convention `queries.sync.ts`
already documents):
- `workspace_conversations` — `id`, `created_at`, `title`, `claude_session_id` (or the transcript
  file path — whichever `--resume` form the spike settles on), `archived`.
- `workspace_messages` — `id`, `conversation_id` (fk), `parent_message_id` (fk, nullable — the
  LibreChat tree), `role` (`user`/`assistant`), `tier`, `model`, `content`, `tool_calls jsonb`,
  `finished boolean`, `error boolean`, `cost_usd numeric(10,4)` (from the `total_cost_usd`
  client-side estimate the docs above confirm `--output-format json`/`stream-json` report),
  `created_at`.
- `workspace_requests` — a dedicated queue table shaped like `agent_requests` (state
  `queued→claimed→done|failed|cancelled`, `claimed_at`, `claimed_by`, atomic claim by conditional
  `UPDATE ... RETURNING`) rather than widening `agent_requests` itself: `agent_requests.kind`'s
  existing three values (`sync`/`transform`/`inbox_feedback`) are each tied to a specific skill's
  semantics (migration 032's own comment: *"Widen it in the phase that adds the next kind"* — but a
  chat turn's lifecycle (streamed, resumable, tied to a conversation and a tier) is different enough
  from a one-shot skill run that a dedicated table is the cleaner seam, not a forced reuse).

**Web app.** A new route group `web/src/app/(app)/workspace/` (sibling to the existing
`announcements`/`course`/`grades`/`inbox`/`materials`/`planner` groups), CSS Modules only (no
Tailwind, per the standing rule), a new `use-workspace-stream.ts` hook that subscribes to the
conversation's Realtime Broadcast channel — **the first use of Supabase Realtime anywhere in this
app** (confirmed: no `.channel(` or `postgres_changes` hit anywhere under `web/src`); everything
else today is TanStack Query polling (`v_sync_status` etc.). That's a real first, not a drop-in —
budget a small spike to prove the private-channel RLS story end to end on this project before
committing to it in a frozen Contract.

**Migrations.** Phase 14 (R-28) already owns 091–099 (`ORCHESTRATOR.md` §1); P-18/P-21 require
every other sprint-2 phase to take a range *outside* that block. This item needs its own — a
`workspace_conversations` table, a `workspace_messages` table, a `workspace_requests` table plus
its `workspace_runner`/`workspace_reader` DEFINER RPCs and roles, roughly 3–4 files. Propose the
next free block after Phase 14, i.e. starting at **100**, exact numbers PM-allocated in Stage C —
not asserted here as decided.

### 1.5 Size and seams

**Size: L** overall (see the six research-added sub-items, §Research-added, for the breakdown).

**Seams:**
- **R-91** (materials MCP ships as an image, secret by file) — the workspace container reuses
  that exact image and secret-file pattern for its own bb2dash-materials tool access; no new work
  there beyond what R-91 already scopes, just a second consumer of the same image.
- **R-92** (Claude PM/worker dev container) — the closest existing precedent for
  `CLAUDE_CODE_OAUTH_TOKEN`/`claude setup-token` in a container, but R-92 is an *interactive* human
  session (`just dev` → a REPL), while this is the project's first genuinely *unattended, repeated*
  `claude -p` invocation pattern. R-92's own Notes already anticipated this exact seam: *"A
  setup-token session loads no claude.ai connectors... S2-workspace-1 would reuse the token path but
  reverses v3 D-1 and needs its own row."* Share the token secret name and provisioning step; do not
  assume R-92's container *image* (dev tooling, git, gh, uv, Playwright) is the right base for a
  lean, always-on chat backend — it likely wants its own smaller Dockerfile.
- **R-84** (sync-runner's least-privilege DB role) — the direct template for `workspace_reader` /
  `workspace_runner`: a dedicated Postgres role, DEFINER RPCs, Docker-secret connection string,
  negative-grant tests, `begin…rollback` dry run — same DoD shape, different grant list.
- **The harness `rag` store** — a second, independent Supabase project (`harness-memory`, per
  `agentic-harness/README.md`'s architecture diagram, fetched/read directly), reached through its
  own already-built stdio MCP server, never merged with the bb2dash materials store (D-21).
- **Phase 14's umbrella (`bb2dash-stack`, `secrets/`, `doctor`, C-6/C-7)** — this item's container
  piece is small enough on its own terms that building it *before* the umbrella exists means
  re-inventing the secrets folder, the non-root/network-allowlist Dockerfile pattern and the
  compose `include:` wiring from scratch, then throwing that away when Phase 14 lands. Sequencing
  this after (or landing it as a Phase-14 follow-on PR reusing the same umbrella) is the research
  finding, not an assumption — flagged as a Stage C ordering question below.
- **Stack's own sittings** — none required to *build* it (no Blackboard login, no noVNC gate like
  Phase 14's task 2), but the streaming/Realtime spike and the first live `claude -p` cost/latency
  measurement (§1.3 pitfall 6) want at least one real sitting to watch a turn end-to-end before the
  Contract freezes the transport choice.

### 1.6 What the research changes about the requirement as written

- **Sharpens** "routes prompts to different agent model levels depending on the complexity of the
  task" into a concrete three-tier map (haiku/sonnet/opus) with a named default router shape
  (heuristic + optional one-turn Haiku classifier), not RouteLLM's trained-model approach, which is
  the wrong scale for one user.
- **Sharpens** "as if I might route it to either a local model or to a frontier model" into an
  explicit, typed, unimplemented provider seam (two stub files) rather than a vaguer "keep it
  flexible" intent — makes "build the functionality" checkable.
- **Splits** the single §3 line into the six sub-items below, because it is a full subsystem
  (router, provider seam, container/transport, storage, tool wiring, safety), each independently
  sizeable and reviewable.
- **Adds** an explicit dependency/ordering relationship to Phase 14 that the original line doesn't
  state: this item reuses Phase 14's container scaffolding so heavily that building it first would
  duplicate work Phase 14 is already scoped to do.
- **Adds** the DECISIONS-row requirement the PM note already flagged (reversing D-1) as a concrete,
  checkable acceptance step, not just a note.
- **Adds** a named, sourced risk (Anthropic's paused Agent-SDK-credit plan) that the requirement as
  Stack wrote it — "instead of having to pay for api credits" — doesn't anticipate could change
  under it; this belongs in the brief's Notes, not as a blocker.

## Research-added requirements

| id | title | why | size | for |
|---|---|---|---|---|
| S2-workspace-1a | Router: heuristic + optional Haiku classifier, tier→model map | S2-workspace-1's core ask has no concrete decision procedure yet; without one, "routes prompts by complexity" can't be built or tested | S | S2-workspace-1 |
| S2-workspace-1b | Provider seam: `claude-cli.ts` implemented, `ollama.ts`/`frontier-api.ts` typed stubs | Stack explicitly asked to "build the functionality" for local/frontier routing without hooking either up; needs a concrete interface to be checkable, not just implied | S | S2-workspace-1 |
| S2-workspace-1c | Container service + `claude -p` invocation, dead-letter sweep, `workspace_reader`/`workspace_runner` roles and RPCs (migrations) | The backend cannot be the browser or an edge function (§1.3 pitfall 4); this is the load-bearing infra piece and the one most tied to Phase 14's seams | M | S2-workspace-1, R-84, R-91, R-92 |
| S2-workspace-1d | `workspace_conversations` / `workspace_messages` / `workspace_requests` schema + owner-scoped RLS + `queries.workspace.ts` | No storage contract exists yet; LibreChat's fetched schema gives a concrete starting shape instead of inventing one from nothing | M | S2-workspace-1 |
| S2-workspace-1e | Streaming: Realtime Broadcast private channel, `use-workspace-stream.ts`, spike to prove RLS on a private channel end to end | First use of Supabase Realtime in this app; not a drop-in, wants its own spike before the Contract freezes it | M | S2-workspace-1 |
| S2-workspace-1f | Tool allowlist and safety: read-only MCP tools only, zero write RPCs, egress allowlist (api.anthropic.com + Supabase host only), non-root container, `/security-review` pass | "Safety (read-only tools first, no writes to planner state)" is named in scope but not specced; needs an explicit, testable allowlist and a security review gate, same shape as Phase 14's DoD | S | S2-workspace-1, R-84 |

## Questions for Stack

None of §6's existing carried questions name workspace-chatbot or change their default under this
research (checked: none of items 1–48 reference S2-workspace-1, R-91/R-92/R-84's chat seam, or the
harness rag store). The questions below are new, from this research.

1. **Does "execution of the tasks" for the higher-tier model mean deeper read-only reasoning
   (planning, drafting, summarizing across sources), or do you eventually want the assistant to
   write changes (e.g., confirm an Inbox item, adjust a planner event)?** — default: read-only,
   full stop, for this phase; v1 ships with zero write tools on the allowlist regardless of tier,
   and a later phase adds a propose-then-you-approve write path if wanted. Why: your own scope
   line says "no writes to planner state," and D-2's near-total ban on agent writes to
   `assignment_progress`/`reading_progress` (one narrow, sync-only exception) argues for the
   strictest reading until you say otherwise.
2. **Should this phase's container piece wait until Phase 14's umbrella (`bb2dash-stack`,
   `secrets/`, `doctor`) exists, or build its own standalone Dockerfile/compose file now and fold
   it into the umbrella later?** — default: wait; land it as a fourth Phase-14 `C-2` service (or
   immediately after Phase 14 merges) rather than duplicating the secrets-folder/non-root/
   network-allowlist pattern twice. Why: nearly everything the container needs (the OAuth-token
   secret, the non-root Dockerfile shape, the materials-MCP image, the least-privilege-role
   precedent) is Phase 14 work; building it first means throwing away scaffolding when Phase 14
   lands.
3. **Router v1: a hand-written heuristic only, or heuristic-plus-a-cheap-Haiku-classification-call
   from day one?** — default: heuristic only for v1 (free, no extra `claude -p` call per turn just
   to decide the tier); add the Haiku classifier as a fast-follow only if the heuristic visibly
   misroutes on real use. Why: keeps v1 smaller and avoids paying for a classification turn on
   every message when a keyword/length heuristic likely gets most of the way there for one user's
   own phrasing habits.
4. **Per-conversation or per-message cost/turn cap, and what should happen when it's hit (refuse
   the turn, downgrade the tier automatically, or just warn)?** — default: a soft per-turn
   `--max-budget-usd` (e.g. $1) that fails the turn with a plain "this turn would have cost more
   than expected" message rather than silently downgrading the tier, so a misrouted turn never
   look like a working answer. Why: `--max-budget-usd` is real and documented, but its
   subagent-cost semantics want a one-time check against actual behavior, and a silent downgrade
   would hide a router bug behind a plausible-looking cheap answer.
5. **Harness rag store access: search everything in `harness-memory`, or scope to specific
   collections (e.g. `bb2dash-inbox-decisions`, `bb2dash*` project notes) so a course-related chat
   doesn't surface unrelated personal/engineering session notes?** — default: scope to a
   configurable allowlist of collections relevant to bb2dash (its own decisions, its own project
   notes), not the whole store, using `search_context`'s existing `collection` filter. Why: the
   store also holds class-session and harness-engineering notes unrelated to a given course
   question; the filter already exists (`R-D1`'s realm tagging), so using it costs nothing extra.

## Sources

- [github.com/lm-sys/RouteLLM](https://github.com/lm-sys/RouteLLM) — fetched 2026-09-24
- [github.com/lm-sys/RouteLLM/blob/main/README.md](https://github.com/lm-sys/RouteLLM/blob/main/README.md) — fetched 2026-09-24
- [raw.githubusercontent.com/lm-sys/RouteLLM/main/config.example.yaml](https://raw.githubusercontent.com/lm-sys/RouteLLM/main/config.example.yaml) — fetched 2026-09-24
- [github.com/danny-avila/LibreChat](https://github.com/danny-avila/LibreChat) — fetched 2026-09-24
- `repos/danny-avila/LibreChat/contents/packages/data-schemas/src/schema/convo.ts` via `gh api` — fetched 2026-09-24
- `repos/danny-avila/LibreChat/contents/packages/data-schemas/src/schema/message.ts` via `gh api` — fetched 2026-09-24
- [github.com/open-webui/open-webui](https://github.com/open-webui/open-webui) — directory listing via `gh api`, fetched 2026-09-24
- [code.claude.com/docs/en/legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance) — fetched 2026-09-24
- [code.claude.com/docs/en/headless](https://code.claude.com/docs/en/headless) — fetched 2026-09-24
- [code.claude.com/docs/en/cli-reference](https://code.claude.com/docs/en/cli-reference) — fetched 2026-09-24
- [support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) — fetched 2026-09-24
- [claude.com/pricing](https://claude.com/pricing) — fetched 2026-09-24
- [supabase.com/docs/guides/functions/limits](https://supabase.com/docs/guides/functions/limits) — fetched 2026-09-24
- [supabase.com/docs/guides/realtime/broadcast](https://supabase.com/docs/guides/realtime/broadcast) — fetched 2026-09-24
- `docs/planning/sprint-2/research/82_RESEARCH_phase14_R2_claude_unattended.md` — read directly (this repo, 2026-09-16 researcher)
- `docs/planning/sprint-2/82_PHASE14_containers.md` — read directly
- `docs/planning/sprint-2/91_REQUIREMENTS_v3.md` §§1 (R-84, R-91, R-92), 3 (S2-workspace-1), 4 (D-1, D-2, D-4, D-21), 6 — read directly
- `project-state/ORCHESTRATOR.md`, `project-state/DECISIONS.md`, `project-state/STATUS.md` — read directly
- `C:/Users/estac/agentic-harness/README.md` — read directly
- `web/src/lib/queries.sync.ts`, `db/migrations/032_agent_requests.sql`, `web/src/app/(app)/*`, `web/package.json`, `web/README.md`, `mcp-server/src/*` — read directly (this repo)
- `C:\Users\estac\.claude\CLAUDE.md` (this session's own environment) — read directly, for the existing Haiku/Sonnet/Opus tiering convention cited in §1.2
- WebSearch results (open-webui architecture, LibreChat architecture, Claude Agent SDK subagents/billing, Anthropic Agent SDK credit status) — queried 2026-09-24, used to locate the primary pages above, not cited as standalone fact sources where a primary fetch confirms the same claim
