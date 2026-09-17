# R2 — Running Claude Code unattended in a container to execute `/bb-sync <id>`

Scope: auth, headless invocation, the watcher pattern, whether an LLM is even needed, and
sandboxing. All primary-doc claims below are quoted/paraphrased from `code.claude.com` pages
fetched live on 2026-09-16 (Claude Code doc versions referenced up to v2.1.271); anything from a
secondary source is labeled as such.

---

## 1. Auth options in a Linux container with no browser

### The two real options

| | Subscription (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`) | API key (`ANTHROPIC_API_KEY`) |
|---|---|---|
| Cost | $0 extra — rides Stack's existing Pro/Max plan | Pay-per-token, billed separately |
| Provisioning | Run `claude setup-token` **once, interactively, on a machine with a browser** (e.g. Stack's laptop, not the container). It opens the normal OAuth browser flow, then prints a token to the terminal. | Create a key in the [Claude Console](https://platform.claude.com) |
| Where it lives | Anthropic **does not save it anywhere** — "It does not save the token anywhere; copy it and set it as the `CLAUDE_CODE_OAUTH_TOKEN` environment variable wherever you want to authenticate." You own custody of it from the moment it's printed. | Console-managed, revocable there |
| Expiry/refresh | "a one-year OAuth token" — no auto-refresh mechanism documented for this token type; re-run `setup-token` before it lapses | No fixed expiry; revoke/rotate manually |
| Works with | The `claude` CLI (`claude -p ...`), **without** `--bare` | The CLI, the Agent SDK, `--bare` mode, GitHub Actions |
| Does NOT work with | `--bare` mode — "Bare mode does not read `CLAUDE_CODE_OAUTH_TOKEN`. If your script passes `--bare`, authenticate with `ANTHROPIC_API_KEY` or an `apiKeyHelper` instead." Also not usable for Remote Control sessions or claude.ai connectors. | — |

Source: [Authentication](https://code.claude.com/docs/en/authentication), [Headless](https://code.claude.com/docs/en/headless).

**Recommendation for bb2dash: subscription token, not API key.** The watcher needs project
skills (`/bb-sync`) and MCP servers (Playwright, Supabase) loaded, so it must run **without**
`--bare` — and without `--bare`, `CLAUDE_CODE_OAUTH_TOKEN` works exactly like an interactive
subscription login. This satisfies the $0 constraint precisely and is Anthropic's documented,
supported path for "CI pipelines, scripts, or other environments where interactive browser login
isn't available."

### How it's passed as a Docker secret

Claude Code only reads this credential from the **environment variable** `CLAUDE_CODE_OAUTH_TOKEN`
— there is no file-based or `apiKeyHelper`-style indirection documented for it (unlike
`ANTHROPIC_API_KEY`, which can go through an `apiKeyHelper` script). The correct Docker pattern is
therefore:

1. Store the raw token as a Docker secret **file** (Compose `secrets:` block, or Swarm secret),
   mounted read-only at e.g. `/run/secrets/claude_oauth_token` — never as a Compose `environment:`
   value, never baked into the image.
2. In the container's entrypoint script, promote it to the process env at container start:
   `export CLAUDE_CODE_OAUTH_TOKEN="$(cat /run/secrets/claude_oauth_token)"` immediately before
   `exec claude -p ...`. This keeps the secret out of `docker inspect`, image layers, and (mostly)
   process-list dumps, at the cost of it living in that one process's environment for its lifetime
   — normal for any exec'd credential.
3. This exactly matches Phase 14's own guardrail #8 ("Docker secrets mounted at runtime; never in
   an image").

### Credential storage inside the container (once running)

Per [Authentication](https://code.claude.com/docs/en/authentication) → Credential management: on
Linux (which a container is), Claude Code stores interactive-login credentials in
`~/.claude/.credentials.json` (mode 0600). That file is **not** used for the
`CLAUDE_CODE_OAUTH_TOKEN` env-var path — the env var is checked first in the precedence order (see
below) and no `/login` ever needs to happen in the container. Nothing sensitive needs to land on
disk inside the container beyond what already sits in the mounted `.env`.

### Authentication precedence (why this can't accidentally fall back to something else)

Documented order (highest wins): (1) cloud provider vars (Bedrock/Vertex/Foundry) → (2)
`ANTHROPIC_AUTH_TOKEN` → (3) `ANTHROPIC_API_KEY` → (4) `apiKeyHelper` output → (5)
`CLAUDE_CODE_OAUTH_TOKEN` → (6) Anthropic profile/federation → (7) subscription OAuth from
`/login`. **Practical implication: make sure `ANTHROPIC_API_KEY` is unset in the watcher
container**, or it silently wins over the subscription token and starts spending money the moment
it's approved once. `/status` inside a session shows which credential is active.

### What the Terms actually say about automated/scheduled subscription use — quoted, not inferred

This needed real digging; third-party blog posts (autonomee.ai, The Register, aihackers.net) claim
things not fully supported by primary sources, and one important primary source almost got missed.
Two primary pages matter:

**a) Consumer Terms of Service** ([anthropic.com/legal/consumer-terms](https://www.anthropic.com/legal/consumer-terms)),
§3 "Use of our Services" (per a summarized fetch, not hand-verified word-for-word — flagged below):
> "Except when you are accessing our Services via an Anthropic API Key or where we otherwise
> explicitly permit it, [you may not] access the Services through automated or non-human means,
> whether through a bot, script, or otherwise."

Read in isolation, this looks like it bans exactly what we're proposing (a script driving a
subscription-authenticated session). But it explicitly carves out "where we otherwise explicitly
permit it" — and that permission is spelled out in the next document.

**b) Claude Code's own "Legal and compliance" page** ([code.claude.com/docs/en/legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance)),
§"Authentication and credential use" — quoted in full because it is the operative, Claude-Code-
specific answer:
> "**OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max, Team,
> and Enterprise subscription plans and is designed to support ordinary use of Claude Code and
> other native Anthropic applications... **Developers** building products or services that
> interact with Claude's capabilities, including those using the Agent SDK, should use API key
> authentication... Anthropic does not permit third-party developers to offer Claude.ai login into
> their own applications, or to route requests through Free, Pro, or Max plan credentials on
> behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai
> credentials or session tokens... **Nor does it prevent an end user from signing in to the
> unmodified Claude Code binary with their own Claude subscription**, including where a platform
> hosts Claude Code..."
>
> "Advertised usage limits for Pro and Max plans assume ordinary, individual usage of Claude Code
> and the Agent SDK." — §"Acceptable use"

**Reading, stated plainly (not ambiguous on the facts that matter here):** the restriction targets
building a product/service for *other people* that resells, intermediates, or silently routes
their traffic through *your* subscription — the GitHub Actions org-wide pattern explicitly warns
about this too ("an OAuth token is tied to the subscription of the person who ran `claude
setup-token`" — use an API key instead for a shared/org secret). It does **not** restrict a single
owner running the unmodified `claude` binary, authenticated with their own subscription, on
infrastructure they themselves operate, for their own scheduled personal task. Stack's watcher —
his container, his laptop, his subscription, his own repo's skill, nobody else's traffic — sits
squarely inside the stated exception, not the restriction.

**Where it stays genuinely ambiguous, flagged rather than resolved:**
- The exception's wording is "the unmodified Claude Code binary" — i.e., the `claude` CLI. It says
  nothing about the **Agent SDK library** used the same way. The Agent SDK's own overview page adds
  a separate, blanket note (not scoped to "third-party products"): "Unless previously approved,
  Anthropic does not allow third party developers to offer claude.ai login or rate limits for their
  products, including agents built on the Claude Agent SDK. Use the API key authentication methods
  described in the Quickstart instead." ([Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview))
  This reads as an SDK-wide policy, not obviously limited to multi-tenant products. **Practical
  consequence: don't use the Agent SDK library with `CLAUDE_CODE_OAUTH_TOKEN`. Shell out to the
  `claude` CLI binary instead (`claude -p ...`), which is unambiguously inside the documented
  exception.** This is a decisive, load-bearing finding for Q3 below.
- "Advertised usage limits... assume ordinary, individual usage" is doing real work here: a watcher
  that fires a handful of syncs a day is "ordinary individual usage." A scheduler that fires the
  skill every few minutes all day, every day, is a materially different case and could plausibly
  draw rate-limit throttling or a closer look, even if not a ToS violation outright. Keep the sync
  cadence to "on button press, plus the periodic reconciliation poll noted in §11's acceptance
  criteria" — not a tight loop.
- I could not locate a standalone "Authentication and credential use" *policy page* separate from
  the Claude Code legal-and-compliance page that some 2026-02 news coverage (The Register,
  aihackers.net) referenced as a distinct enforcement announcement; those articles' summaries line
  up with what the legal-and-compliance page says today, so I'm treating that page as the current,
  authoritative statement rather than chasing a possibly-superseded standalone URL that 404'd when
  I tried it directly.

---

## 2. Headless invocation — exact command shape

### Base command

```bash
claude -p '/bb-sync 42' \
  --allowedTools "mcp__supabase__execute_sql,mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_evaluate,mcp__playwright__browser_click,mcp__playwright__browser_wait_for" \
  --permission-mode acceptEdits \
  --permission-prompts none \
  --mcp-config /run/config/mcp.json \
  --output-format json \
  --max-turns 60
```

Notes tying this to primary docs:

- **Do not pass `--bare`.** Bare mode "skip[s] auto-discovery of hooks, skills, custom commands,
  subagents, plugins, MCP servers, auto memory, and CLAUDE.md" and "never reads OAuth credentials
  or the system keychain" — both are fatal to this use case (we need the skill, the MCP servers,
  *and* subscription auth). [Headless](https://code.claude.com/docs/en/headless).
- **Slash-command skills work under `-p`**: "User-invoked skills and custom commands work in `-p`
  mode: include `/skill-name` in the prompt string and Claude Code expands it before running."
  Same page. So `claude -p '/bb-sync 42'` is exactly the documented shape; no special headless
  syntax for skills exists beyond that.
- **`--permission-prompts none`** is the flag for "nobody is available to answer permission
  prompts, for example in a scheduled job" — exactly this watcher. Without it, an unattended run
  can hang waiting on a prompt nobody will answer. With it, anything that would prompt is denied
  (not silently allowed), so the allowlist has to be complete going in.
- **`--allowedTools`** uses "permission rule syntax" (`Bash(git diff *)`-style prefix matching for
  shell, plain names for MCP tools). Keep this tight and enumerate the specific `mcp__<server>__*`
  tool names bb-sync's SKILL.md actually calls, rather than a bare `mcp__supabase` wildcard — the
  skill only needs `execute_sql` (reads and the specific writes it documents), never
  `apply_migration` or `deploy_edge_function`, so leave those off the allowlist entirely as a
  belt-and-suspenders control on top of least-privilege credentials (§3/§5).
- **`--permission-mode`**: `-p` starts in Manual mode by default on every plan, so it must be set
  explicitly. `acceptEdits` auto-approves file writes/common fs commands but still gates shell/
  network beyond the allowlist; `auto` (classifier-reviewed) is the other realistic choice. For a
  scripted skill whose exact tool calls are already known and enumerable, `acceptEdits` + a precise
  `--allowedTools` list is more predictable than `auto`'s classifier judgment call.
- **Output format / logging**: `--output-format json` gives `total_cost_usd`, `session_id`, and the
  final `result` text in one parseable object — ideal for the watcher to log per-run cost/status
  into its own table or file. `stream-json` (+ `--verbose --include-partial-messages`) is available
  if line-by-line progress logging is wanted instead; the skill's own "post a one-line status after
  every step" behavior would show up as intermediate assistant messages in that stream.
- **Turn limits / timeouts**: `--max-turns N` caps agentic turns (confirmed via the GitHub Actions
  doc's "Set `--max-turns` in `claude_args` to limit iterations" and cross-referenced in the CLI
  reference). Given bb-sync's own step 4 waits up to 10 minutes polling `v_sync_status` every 30s,
  give it real headroom — 60 turns is a rough starting budget, not a verified minimum; watch actual
  runs and adjust. There is no separate documented "session timeout" flag; wrap the whole
  invocation in `timeout 900 claude -p ...` (or the container orchestrator's own job timeout) as
  the outer bound, since the skill's own worst case (10 min wait + crawl time) is bounded but not
  tiny.
- **Exit codes**: "Claude Code exits with code 0 on success and a non-zero code when the run
  fails" — including "missing authentication" being reported as the *result* on stdout rather than
  a hard crash, so the watcher should parse the JSON result / check for an error field, not rely on
  exit code alone for "did the sync actually work." SIGTERM (e.g. a container orchestrator killing
  a stuck job) yields exit 143 and leaves the in-flight turn unfinished/unrecorded — the watcher's
  timeout should prefer SIGINT if it wants Claude Code to close out the turn cleanly before dying;
  either way, a killed run can leave the `agent_requests` row stuck in `claimed` (bb-sync's own
  documented failure mode — "Never leave a request `claimed`"), so the watcher needs its own dead-
  letter sweep (see §3).

### MCP config for `--mcp-config`

Two servers named in the task: Playwright pointed at a remote CDP endpoint, and Supabase.

**Playwright MCP** (`@playwright/mcp`, Microsoft's official server) connects to an already-running
browser over Chrome DevTools Protocol with `--cdp-endpoint`:
```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--cdp-endpoint", "http://bb-browser:9222"]
    }
  }
}
```
`--cdp-endpoint` "works with Chrome/Chromium started with `--remote-debugging-port`... and cloud
browser services" (per Playwright MCP's own docs, corroborated by its GitHub repo and Playwright
docs — this is a Playwright-MCP-specific flag, not a Claude Code doc, so verify the exact flag
spelling against `npx @playwright/mcp@latest --help` before wiring it into the compose file; I did
not find it quoted verbatim on a single canonical page). This is exactly the shape Phase 14 needs:
a long-lived "browser" container holds the logged-in Blackboard session and exposes CDP; the
watcher's `claude -p` process talks to it fresh on every invocation instead of owning the browser
itself — which also solves "the session must survive between the app's Sync button press and the
skill actually running."

**Supabase MCP** — two real choices:
- The official `@supabase/mcp-server-supabase` package, stdio, with `--project-ref` and optionally
  `--read-only`: "With `--project-ref` set, the server can only touch that one project and account-
  level tools switch off" and "`--read-only` runs every query as a read-only Postgres user. No
  inserts, updates, or deletes reach your data through the agent." (secondary-source summary of
  Supabase's own docs — I did not fetch supabase.com/docs/guides/ai-tools/mcp directly; flag this
  as needing a direct-source check before relying on the exact flag names). bb-sync needs to
  *write* (claim, register run_id, close the request), so `--read-only` can't be used for the whole
  session — but it's a strong argument for running the watcher's own polling query through a
  separate, read-only-scoped connection (see §3) even while the `claude -p` session itself needs
  write access via `execute_sql`.
- The interactively-installed `supabase@claude-plugins-official` plugin this session currently uses
  is a **user-level, globally enabled plugin** (`enabledPlugins` in `~/.claude.json`), not something
  a fresh container image will have. **Do not assume the container "just has" Supabase MCP access
  the way this interactive session does** — the container needs its own explicit `--mcp-config`
  entry (as above) with its own credential, provisioned on purpose.

```json
{
  "mcpServers": {
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--project-ref=goultdzqcavefcgnifdy"],
      "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" }
    }
  }
}
```
`${VAR}` substitution in `.mcp.json`/`--mcp-config` is documented and expands in `env`, `command`,
`args`, `url`, and `headers` — so the token itself still comes from the container's environment
(sourced from the Docker secret file at entrypoint time, same pattern as §1), never hardcoded into
the JSON. Note: Claude Code deliberately reads `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` as
*empty* inside remote-server `url`/`headers` substitution (a built-in guard against credential
leakage to a third-party MCP endpoint) — irrelevant here since Supabase's token goes through `env`
on a local stdio server, not a remote `url`, but worth knowing if this ever moves to Supabase's
hosted remote MCP endpoint instead.

### Flags I could not independently verify (flagging per instructions)

A `cli-reference` page fetch returned a broader flag table (`--max-budget-usd`, `--effort` with a
value called `"ultracode"`, `--fallback-model`, `--init`, `--no-session-persistence`, `--channels`,
`--exclude-dynamic-system-prompt-sections`, `--disable-slash-commands`) via a summarized fetch
rather than quoted primary text, and one entry (`--disable-slash-commands`, said to "disable all
skills and commands for the session") sits awkwardly next to the headless page's own, directly-
quoted statement that skills work fine under `-p` by default — i.e., that flag if real is an opt-
*out*, not something the watcher needs to touch, but I'd verify with `claude -p --help` inside the
actual container image before depending on any of this list. Treat only the flags corroborated
above by direct quotes from multiple fetched pages (`--allowedTools`, `--permission-mode`,
`--permission-prompts`, `--mcp-config`, `--output-format`, `--max-turns`, `--append-system-prompt`,
`--bare`, `--dangerously-skip-permissions`, `--json-schema`) as solid.

---

## 3. The watcher — row lifecycle, and which architecture

### Row lifecycle, from migrations 032/039 and `skills/bb-sync/SKILL.md` (read directly)

`agent_requests` (migration 032, `db/migrations/032_agent_requests.sql`):
- `state` check constraint: `queued → claimed → done|failed|cancelled` (five values total).
- Claim is a single conditional `UPDATE ... WHERE id = $1 AND state = 'queued' RETURNING ...`
  (SKILL.md step 2). This is Postgres-atomic: two concurrent claim attempts on the same row
  serialize, and the loser's `UPDATE` affects zero rows and returns nothing — SKILL.md's own text
  is explicit about this: **"No row back means someone already claimed it... say so and stop rather
  than running a second crawl."** This means double-invocation safety is already partly built into
  the skill itself at the DB layer, independent of whatever the watcher does.
- After a successful claim, `run_id` gets registered onto the same row (step 3a) — this is what
  authorizes `transform_tick()` (migration 035, extended by 039) to fold the crawl; an unregistered
  crawl is quarantined, not silently lost, and migration 039's 30-minute grace window exists
  specifically so a slow-to-register crawl in flight isn't quarantined out from under itself.
- Close is another `UPDATE` to `done` or `failed` (step 5), and SKILL.md is emphatic that a request
  must never be left `claimed`: "a stale claim holds the tick's quarantine grace window open... for
  up to 30 minutes and delays the bookkeeping of any other crawl."
- **The one gap the skill's own atomicity doesn't cover**: a `claude -p` process that dies (OOM,
  container kill, SIGTERM before the close step) leaves the row stuck in `claimed` forever — there
  is no automatic timeout/expiry on a `claimed` row in the schema I read. **The watcher, not the
  skill, has to own that dead-letter case**: e.g., a periodic sweep that flags (not auto-fails) any
  `claimed` row whose `claimed_at` is older than, say, 20 minutes, and surfaces it as an
  `attention_items` row for Stack rather than silently retrying (retrying automatically risks a
  second crawl racing a first one that's actually still alive but slow).

### Comparison: plain Node loop vs. Agent SDK vs. Supabase Realtime

| | Plain poll loop (Node/Python, `setInterval` + child_process) | Agent SDK driving the loop | Supabase Realtime subscription |
|---|---|---|---|
| Auth fit | Shells to `claude -p`, so `CLAUDE_CODE_OAUTH_TOKEN` applies cleanly (§1) | The SDK's own docs push toward API-key auth (§1) — **wrong tool for a $0 constraint** | Orthogonal to Claude auth; still needs to shell to `claude -p` to actually run the skill |
| Complexity | Lowest — a `setInterval`/cron poll, a SELECT, `child_process.spawn` | Adds a whole library dependency for something a `spawn` call does | Needs a websocket client, reconnect/backoff logic, **and still needs a polling backstop** for rows inserted while disconnected |
| Latency | Bounded by poll interval (e.g. 20–30s) — fine for a button-press UX | Same, if built the same way | Near-instant on the happy path |
| RLS/auth needed | A DB credential that can read `agent_requests` (see below) | Same | Needs an *authenticated* Postgres role (owner JWT) or `service_role` to receive `postgres_changes` events on an RLS-protected table |
| Failure mode | Simple to reason about: log request id ↔ PID, restart-safe (just re-polls) | Same complexity as plain loop, plus SDK's own session/process model | A missed/dropped socket event with no backstop poll = a sync silently never runs |

**Recommendation: plain Node (or Python) polling loop that shells out to `claude -p`.** For a
single user pressing a Sync button occasionally, sub-minute polling latency is invisible, the
architecture is auditable by reading ~50 lines of script, and it sidesteps the Agent SDK's auth
posture entirely. Supabase Realtime is real over-engineering here — it *adds* a required polling
fallback rather than removing one, for a UX improvement (instant vs. 20-30s) nobody asked for at
this volume. If Stack later wants push-based triggering, it's cheap to add a `pg_notify` from an
`agent_requests` insert trigger read by `LISTEN` from the same script — same complexity budget as
Realtime, without a websocket client dependency.

### Preventing the watcher itself from double-spawning

Since the skill's own atomic claim protects against *cross-process* double-claims, the watcher's
own job is narrower: don't spawn a second `claude -p /bb-sync <id>` for an id it already has a
child process running for, in-process. Track `Map<request_id, ChildProcess>` in the loop; skip any
`queued` row whose id is already in that map. This, plus the skill's atomic UPDATE, plus the dead-
letter sweep above, covers queued→claimed→done and the stuck-claim edge case without needing
`SELECT ... FOR UPDATE SKIP LOCKED` or any other distributed-queue machinery — this is a one-writer
(Stack), low-volume queue, not a multi-worker job system.

### Which key, and least-privilege

`agent_requests` RLS is owner-scoped: `auth.uid() = public.app_owner()` (migration 032). A plain
poll (`SELECT ... WHERE kind='sync' AND state='queued'`) run as `anon`/`authenticated` without
Stack's own JWT gets zero rows back — RLS blocks it. Two ways to make the watcher's read work:

1. **Service role key** (`SUPABASE_SERVICE_ROLE`, bypasses RLS entirely). This matches an *existing*
   precedent already in the repo: `mcp-server/.env.example` uses exactly this key, with exactly
   this justification — "Server-side only — this is a local stdio process driven by Claude Code,
   never a browser." The watcher is the same shape of thing. Pragmatic, consistent with current
   project convention, and — per CLAUDE.md's own existing rule — fine as long as it's "never in a
   browser or the repo" and delivered as a Docker secret file per §1.
2. **A dedicated least-privilege Postgres role** (e.g. `agent_watcher`) granted `SELECT` only on
   `agent_requests`, connected via a direct Postgres connection string (not a Supabase REST key at
   all) rather than `service_role`. A leaked credential here can only ever list queued rows, never
   read or write anything else in the database — no other table, no storage, no other row's data.
   More setup (a new role + grant migration), but is the actual least-privilege answer to "which
   key does the watcher need."

**Recommendation: option 2 if Stack wants to do it once and be done, option 1 if he'd rather match
the existing `mcp-server` convention and move on.** Given Phase 14's own guardrail language ("least-
privilege option") explicitly asked for, I'd lean option 2 — it is a small, one-time migration
(`create role agent_watcher; grant select on agent_requests to agent_watcher;` plus a Postgres-level
password/connection string as the Docker secret) and meaningfully shrinks blast radius versus a
service-role key that can read/write the entire schema. Either way, the **actual sync work** (the
`claude -p` process, via SKILL.md's own writes) still needs the fuller Supabase MCP access
documented in the skill itself — the least-privilege question is specifically about the watcher's
own polling credential, which needs far less than the skill run does.

---

## 4. Does the sync even need an LLM at all?

Reading `skills/bb-sync/SKILL.md` end to end (already quoted extensively above), the actual work
breaks down as:

- **Step 1 (login check)**: a single `location.href` read and a string match against known login
  hostnames. Purely mechanical.
- **Step 2 (claim)**: one conditional SQL `UPDATE`. Mechanical.
- **Step 3/3a (crawl + register)**: call `bb.runAll({termName})` in the page context, capture
  `run_id`, immediately `UPDATE agent_requests SET run_id = ...`. Mechanical — no judgment calls;
  the "do not pass runId and register before the crawl" ordering rule is a fixed sequencing
  constraint, not something that benefits from a model reasoning about it fresh each time.
- **Step 4 (wait)**: poll a view every 30s for up to 10 minutes, branch on three fixed status
  strings. A `while` loop with a `sleep`. Mechanical.
- **Step 4b (pull submission files)**: a SQL SELECT for rows needing bytes, then for each: download
  via Playwright's `waitForEvent('download')`, sha256, upload to Storage, mirror locally, UPDATE the
  row. Every step here is deterministic file I/O and HTTP calls with fixed, documented status-code
  handling (401/403 → stop; 409 → leave alone and report). No part of this needs a model to decide
  what to do — the skill text itself reads like a spec for a script, not guidance for a judgment
  call.
- **Step 5 (close)**: one `UPDATE`. Mechanical.
- **Step 6 (report)**: this is the one place natural-language judgment genuinely helps — turning
  `summary->'changes'` JSON and typed counts into "in his words rather than the schema's" prose for
  Stack, per the skill's own framing.

**Honest assessment: yes, steps 1–5 (crawl → register → wait → pull files → close) are a
deterministic Node/Playwright script, not an agentic task.** Every branch in SKILL.md is an `if`
statement on a known value (a URL string, a status enum, an HTTP status code) — nothing in there
asks for judgment, only for correct sequencing and correct error handling, which is exactly what a
plain script is better at than an LLM (a script can't "forget" to check `409` differently from
`401`, can't paraphrase a SQL update wrong, and costs nothing to run per invocation). Step 6 (the
plain-language report) is the only step that benefits from an LLM, and it's a small, bounded,
single-shot summarization task — it doesn't need the full agentic loop, tool access, or a live
browser session; it only needs the finished JSON from steps 1–5.

**This changes the recommendation materially.** If steps 1–5 become a deterministic script:
- **Auth question mostly disappears.** A plain script has no Claude auth need at all for the crawl/
  register/wait/pull/close pipeline. The only remaining Claude Code touchpoint is an optional,
  cheap, single-turn call for step 6's report — which could even use `claude -p` with a tiny prompt
  and no tools, or skip the LLM path entirely and use a template ("IST.323 Quiz 2 due date moved
  9/2 to 9/9" is already exactly the shape of `summary.changes`, per SKILL.md's own step 6 language
  — that data is apparently already close to human-readable at the source).
- **Reliability improves.** A script either does the sequence correctly every time or throws a
  stack trace pointing at the exact failed step; an LLM agent can, in principle, misread a status
  code, retry something it was told not to retry, or drift from the documented ordering rules
  (the SKILL.md text itself reads defensively, e.g. "**Do not** pass `runId` and register before the
  crawl," "**never** interrupt a run part-way," "**Never** write typed tables by hand" — repeated,
  emphatic guardrails are usually a sign the author has already been burned by an agent doing the
  wrong thing here).
- **Cost drops to ~zero** regardless of which auth path Phase 14 lands on, since the only inference
  call left is one short summarization turn.

**Why it's still an agent skill today, and what I'd actually recommend:** the skill's own header
says the reason a human-invoked Claude session exists at all is Blackboard's NetID+Duo login —
"every endpoint the crawler uses is authorized by a session cookie obtained through NetID plus a
Duo push that only Stack can approve." That's the genuinely irreducible human-in-the-loop part
(§1(4) in the shared context — the noVNC-style browser container for login), not the crawl-loop
logic. Given that, **my honest recommendation is: port steps 1–5 to a deterministic Node script now
that a persistent CDP-connected browser container exists as the login boundary, keep Claude Code
only for step 6's plain-language report (or drop the LLM there too and template it), and reserve
the full agentic skill for exception handling** — i.e., invoke `/bb-sync <id>` as an LLM-driven
fallback only when the deterministic script hits a branch it doesn't recognize (a new HTTP status,
an unexpected page state), rather than as the default path for the common case. This directly
weakens the urgency of the subscription-vs-API-key question, since the common path stops needing
Claude at all — the auth research above stays useful for the fallback path and for the separate
PM/worker dev-container use case in scope item #3, just not as the load-bearing dependency for
"does every sync consume a Claude session."

---

## 5. Security — browser with SU session cookies + a DB key, in one container

Primary source: [Sandboxing](https://code.claude.com/docs/en/sandboxing) and [Choose a sandbox
environment](https://code.claude.com/docs/en/sandbox-environments).

### The core rule, quoted directly

> "When you pass `--dangerously-skip-permissions`, Claude acts without asking you first... With no
> prompts to catch mistakes, the isolation boundary you choose is what protects your system. Always
> run `--dangerously-skip-permissions` sessions inside a container, a VM, or the sandbox runtime...
> **On Linux and macOS, Claude Code refuses to start with this flag when running as root**, so run
> the container, VM, or sandbox runtime as a non-root user."

This is a hard, documented behavior, not just advice: the watcher's `claude -p` process must run as
a non-root user inside its container if it ever uses `--dangerously-skip-permissions` — and even
with the tighter `--permission-mode acceptEdits` + `--permission-prompts none` shape recommended in
§2 instead of the fully-open flag, non-root is still the right default (least privilege inside the
container, and it avoids the startup refusal entirely if the flag choice changes later).

### Layered recommendation for this specific container

1. **Non-root user.** `USER node` (or a dedicated `bbsync` user) in the Dockerfile; never run as
   root regardless of which permission flag is chosen.
2. **Read-only mounts.** The only writes the `claude -p` process genuinely needs are: its own
   `~/.claude` config/session state, a scratch/temp dir for downloaded submission files (SKILL.md
   step 4b), and the "course context/" mirror (already flagged in the shared context as becoming a
   disposable volume). Everything else — the repo checkout itself, the skill file, any mounted
   `.mcp.json` — should be mounted `:ro`. This matches the sandbox's own default posture
   ("read/write access to the current working directory... Blocked access: cannot modify files
   outside the working directory... without explicit permission").
3. **Network egress limits.** Two independent layers are relevant and don't have to be mutually
   exclusive:
   - Claude Code's own built-in **sandboxed Bash tool** (`sandbox.network.allowedDomains`,
     `strictAllowlist: true`) restricts *shell commands Claude runs* to an explicit domain
     allowlist, enforced by a local proxy — but explicitly does **not** cover MCP servers or other
     built-in tools running as separate processes: "MCP servers and command hooks are separate
     processes that run unconstrained on the host." Since this watcher's real risk surface is the
     Playwright MCP server (holding the SU session) and the Supabase MCP server (holding the DB
     key) — both MCP servers, not Bash commands — the per-command Bash sandbox alone is
     **insufficient** here.
   - What actually covers MCP servers: put the **whole container** behind network policy, not just
     Claude's in-process sandbox. The [dev container example](https://code.claude.com/docs/en/devcontainer)
     Anthropic publishes uses "a default-deny iptables firewall as a starting point... Because the
     firewall blocks unapproved egress, a configuration like this supports running Claude Code with
     `--dangerously-skip-permissions` for unattended work." For this watcher, that means: the
     container/compose network policy (not Claude Code's own settings) should allow only
     `api.anthropic.com` (or wherever the OAuth-backed inference endpoint resolves), the Supabase
     project's REST/DB host, and the CDP endpoint of the browser container — nothing else outbound.
   - `@anthropic-ai/sandbox-runtime` is a documented alternative that "wraps an entire process" —
     Bash, file tools, MCP servers, hooks all inside one boundary — as a non-Docker option; less
     relevant here since Docker is already the chosen isolation mechanism for Phase 14 broadly, but
     worth knowing it exists if a lighter-weight per-process sandbox is ever wanted alongside a
     container.
4. **Secret handling inside the sandbox layer**: Claude Code's `sandbox.credentials` settings (mask/
   deny specific files or env vars from sandboxed *Bash* commands specifically) are a
   defense-in-depth extra, not a substitute for the container-level controls above, since — same
   caveat as network — they apply to the Bash tool, not to what the Playwright/Supabase MCP server
   processes themselves can read from their own environment. The actual credential boundary for
   those two servers is: give each MCP server process only the one credential it needs (Playwright
   gets the CDP URL, nothing about Supabase; the Supabase MCP server gets its scoped token, nothing
   about Blackboard) — process-level separation, not a single environment blob shared by everything
   in the container.
5. **The browser container is the highest-value target, and it's already partly out of Claude
   Code's hands.** The SU session cookie lives in the *browser* container (per the shared context's
   noVNC-style login design), which Claude Code's `claude -p` process reaches only via Playwright
   MCP's CDP connection — it never holds the cookie itself. That's a good architectural property to
   preserve: don't let the `claude -p` container mount the browser container's profile directory
   directly; keep it strictly behind the CDP network boundary, so a compromised/over-permissioned
   `claude -p` process at most gets "control of an already-logged-in tab for the duration of one
   sync run," not "the credential material itself."

---

## Sources consulted directly (primary)

- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/cli-reference (summarized fetch — see flagged caveats in §2)
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/sandbox-environments
- https://www.anthropic.com/legal/consumer-terms (summarized fetch)
- Repo files read directly: `skills/bb-sync/SKILL.md`, `db/migrations/032_agent_requests.sql`,
  `db/migrations/039_tick_quarantine_grace.sql`, `.env.example`, `mcp-server/.env.example`,
  `.claude/settings.json`, `~/.claude.json` (project/plugin config sections only, no secret values)

## Open items flagged for the team, not resolved here

1. **Skill discovery mechanism mismatch.** Per Claude Code's own docs, project skills load only
   from `.claude/skills/`, `~/.claude/skills/`, or a plugin's `skills/` folder — there is
   documented to be "no project-root-level skills folder outside of `.claude/skills/`." Yet
   `skills/bb-sync/SKILL.md` lives at the bb2dash **repo root** (confirmed: no `.claude-plugin`
   manifest, no symlink from `.claude/skills/`, nothing in `~/.claude.json` beyond a usage-count
   log), and it is nonetheless available in interactive sessions on this machine today. I could not
   determine the actual mechanism. **For the container, don't rely on whatever is making this work
   interactively** — either copy/symlink `skills/bb-sync/` into `.claude/skills/bb-sync/` (a
   documented, guaranteed-to-work location) in the image, or register it via `--plugin-dir`, and
   verify with a real `claude -p '/bb-sync --help'`-style smoke test before depending on it.
2. Supabase MCP server flag names (`--project-ref`, `--read-only`) came from a secondary summary of
   Supabase's own docs, not a direct fetch of supabase.com — verify against
   `npx @supabase/mcp-server-supabase@latest --help` before wiring into compose.
3. Playwright MCP's `--cdp-endpoint` flag spelling likewise wants a direct `--help` check against
   the actual installed version before it goes in a config file that's expected to just work.
