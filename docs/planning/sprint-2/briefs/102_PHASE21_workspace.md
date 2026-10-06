# Phase 21 — Workspace: a chat surface routed by task complexity over the two stores, on the subscription

Date 2026-09-24 · PM: the Fable session · Product manager: Stack · Requirements: S2-workspace-1 ·
PM-added steps: P-83, P-84, P-85, P-86, P-87, P-88 · Branch `feat/workspace-21` · Worktree
`bb2dash-wt-21` · Migration range **140–149** · One PR per repo (bb2dash on `feat/workspace-21`,
bb2dash-stack on `feat/workspace-21`), opened together at task 25 and merged bb2dash first: this
phase's own exception to one PR per phase, recorded in a DECISIONS row at the freeze (2026-10-05),
which amends the two 2026-09-27 rows (batch item 51 and the plan approval had the bb2dash-stack PR
opened after the first merged); Phase 14's own freeze row (DECISIONS 2026-10-02) covers Phase 14
only. Beside the two: the one-line test port PR to `main` (task 6a) and the docs-only acceptance
record after acceptance step 15 · Status: **frozen 2026-10-05 with Stack's answers** ("defaults,
usage credits is off"). PROVISIONAL survives on three gates only, open by design: the Realtime
transport (frozen after task 5), the argv (frozen after task 9's first recording) and O-2's
conditional branch. DECISIONS 2026-09-24: "a brief may not cite a default as decided before then";
the defaults were decided on 2026-09-27 (delegated) and the open items answered on 2026-10-05.

Inputs: `91_REQUIREMENTS_v3.md` §2.1 (P-83..P-88), §3 (S2-workspace-1), §4 (D-1, D-2, D-4, D-5,
D-19, D-21); `93_SPRINT2_RESEARCH_SYNTHESIS.md` §1.8, §2, §3, §4, §5 item 5; `94_SPRINT2_PHASES.md`
§1–§3; `research/92_RESEARCH_sprint2_workspace-chatbot.md`; `research/82_RESEARCH_phase14_R2_claude_unattended.md`;
`82_PHASE14_containers.md` (C-1, C-2, C-5, C-6; its 16 decisions stand, brief 100 supersedes its
Contract); `briefs/100_PHASE14_containers.md` (the names Phase 14 freezes: `mcp-server/Dockerfile`,
`mcp-server/src/env-file.ts`, the 11 secret files, `doctor/doctor.mjs`, the `just` verbs);
`briefs/95_PHASE15_db_hygiene.md` (`scripts/db-test.mjs` and the `db_test_runner` role). Facts checked
on 2026-09-24 against `main` a5042fa, prod (`goultdzqcavefcgnifdy`, SELECT only), the harness rag store
and the installed Claude Code CLI (2.1.282); re-checked by the Stage C critic the same day.
Re-checked on 2026-10-05, before the freeze, by a read-only audit (seven lenses, each with a
verifier, plus a critic) against `main` at the cut (06e046b), prod (SELECT only), Phase 14 as built
(bb2dash-stack eb71e8b, harness `main` e7997f3) and the installed Claude Code CLI, 2.1.289. That is
the one version the image pins (`ARG CLAUDE_CODE_VERSION=2.1.289`; floor 2.1.288; never `latest`,
never the `stable` tag) and the version task 9's fixtures are recorded on. The host's `claude`
updated itself to 2.1.290 the same evening, after the audit, so task 9's recordings go through
`npx -y @anthropic-ai/claude-code@2.1.289`. The PM's rulings on the
audit's findings are written into this brief; every "on `main` at the cut" value is read in the
worktree at the cut's commit and written into 102a: a grep count is read as
`git show 06e046b:<path> | grep -c …`, because the worktree's own state docs are one docs commit
past the cut (the freeze rows).

**Answered by delegation 2026-09-27.** Stack delegated the 93 §5 answers and the plan approval to the PM; the DECISIONS rows of 2026-09-27 hold them. Of this brief's B-numbers (B-5, B-42, B-48, B-51), every one resolved to its default. The phase's PM strikes PROVISIONAL where a row says default and rewrites the B-table row where it says changed, at the session's start (ORCHESTRATOR §6).

**Frozen 2026-10-05.** The phase's PM did that at the session's start: task 1's seam gate passed (Phases 14 and 15 are on `main`), no row said changed, and the alternative branches that can no longer happen are struck from the B-table. The same day Stack answered the open items O-1..O-5, the B-5 (h) re-read and the acceptance order in one message ("defaults, usage credits is off"), so every default stands; §Open items for Stack records each answer, and each has its DECISIONS row dated 2026-10-05.

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
and "use my subscription" rules out `--bare` mode, which never reads the subscription login, and the
Agent SDK library, which Anthropic's legal page steers to API-key authentication; the unmodified CLI
is the one path its terms name for a user's own subscription (93 §1.8; the legal page re-read
2026-10-05). The paused metering plan covers `claude -p` and the SDK alike. What remains is the
unmodified `claude` CLI, run as `claude -p` by a
container process on Stack's `claude setup-token` token. That is the scaffolding Phase 14 builds for
R-28: the `bb2dash-stack` umbrella and secrets folder (R-88, R-89; as built the folder is
`SECRETS_DIR`, outside every repo), the materials MCP image with its
key by file (R-91), the subscription-token path of the dev container (R-92; built, and not yet run
with the real token, so task 12's token smoke is its first proof), and the least-privilege
database role pattern of `sync_runner` (R-84). Building the Workspace first would duplicate all of it
and throw it away when Phase 14 lands (research §1.5), so it follows Phase 14 (94 §2 rule 5;
B-5 (b)), which merged on 2026-10-04, as a fourth C-2 service. v1 is read-only (B-5 (c)): zero write
tools on every tier; nothing the model can call can write, and the runner's own database login
cannot reach `assignment_progress`, `reading_progress` or any fact table
(v3 §4 D-2). The container also holds two write-capable credentials, each read only by its MCP
server: the bb2dash service key (the materials server, D-4's sanctioned holder) and the harness
store's DSN (the `rag` server). For those two, read-only rests on the two tool fences and on each
server exposing read tools only; Stack accepted that for v1 on 2026-10-05.

Three risks ride with it and are accepted, not solved (the metering one re-accepted by Stack on
2026-10-05, B-5 (h)). Anthropic announced (2026-05-14) and paused
(2026-06-16) a plan to meter `claude -p` usage out of the subscription pool; it is "being revised"
(93 §4), so the $0 framing is today's behaviour, not a promise. Re-read on 2026-10-05: still paused,
no date, and Anthropic's notice promises an update "before anything takes effect". Advertised plan limits assume
"ordinary, individual usage", and the Workspace shares them with Stack's own sessions, so turns run
one at a time and Opus only when routed there; v1 has no daily cap and no Off switch. The CLI
documents that `--bare` "will become the
default for `-p` in a future release"; the image pins an exact CLI version (2.1.289) and a test pins
the argv,
so a bump is a deliberate, re-checked change. And this is the app's first Realtime use, so the
transport is frozen only after a live spike (task 5); the argv, in the same way, is frozen only
after task 9's first live recording.

One more route to a bill is not accepted but kept closed: Usage credits on his Claude account
(claude.ai, Settings, Usage). Credits are prepaid, so a bill needs the switch on and a balance or
auto-reload; a turn that arrives after his plan limit is used up would then be paid from them at
API prices. He answered on 2026-10-05 that Usage credits are off, so such a turn fails with
`usage_limit` and a plain sentence instead; he confirms it again at acceptance step 1, and if task
9's recording shows the CLI's overage fields on the wire, the runner also ends any turn reported as
paid from usage credits.

## Stack's calls this brief rests on

All decided: B-5 is one item of the 93 §5 batch, split here into its parts. Every row came back
default on 2026-09-27 (delegated; the DECISIONS rows of that date), and Stack confirmed the defaults
on 2026-10-05 ("defaults, usage credits is off"). The default is what this brief builds. The
alternative branches that can no longer happen are struck (B-5 (b) "if earlier", B-51 "no PR per
repo" and "npm scripts", B-42 "no", B-48 "dropped"); the other rows keep their last column as the
record of what a different answer would change.

| B | question | default taken (decided) | tasks that change if he answers otherwise |
|---|---|---|---|
| B-5 (a) | must or should | default, decided 2026-09-27 (delegated): **should** | none; only the phase's place in the queue |
| B-5 (b) | when, relative to Phase 14 | default, decided 2026-09-27 (delegated): after Phase 14 merges (it merged on 2026-10-04); the container stack, the token and the materials MCP server are reused (the server is built from `mcp-server/` in a stage of the Workspace image, not copied from the `bb2dash-mcp:local` image) | struck: "if earlier" can no longer happen; task 1's seam gate passed on 2026-10-05 |
| B-5 (c) | read-only or writes | default, decided 2026-09-27 (delegated): read-only, zero write tools on every tier; tasks with side effects (his "actual execution of the tasks") are outside v1 and come as a later proposal once the metering plan is known | if writes wanted: not this phase; a later phase adds a propose-then-approve path; tasks 6, 10 and 20 stay as the v1 boundary |
| B-5 (d) | backend and billing | default, decided 2026-09-27 (delegated): the `claude` CLI on his setup-token; never the Agent SDK, never `--bare`, never an API key | if an API key is acceptable: tasks 8 and 11 (argv and the key guard) change; D-4 is unaffected |
| B-5 (e) | router | default, decided 2026-09-27 (delegated): hand-written heuristic; a one-turn Haiku classifier only as a fast-follow if it misroutes | if a classifier from day one: task 7 adds a classify call through the provider seam (one extra Haiku turn per question) |
| B-5 (f) | cost cap | default, decided 2026-09-27 (delegated): a soft **$1.00 per answer** (`--max-budget-usd`) that fails the turn with a plain sentence; no silent downgrade. The cap counts Claude Code's own list-price estimate of the call's own spend, not a charge, and one response can overshoot it (O-2 covers a recording that shows no stop) | if downgrade or warn instead: tasks 9, 11, 16 and 21 (error mapping, labels, live check) |
| B-5 (g) | harness store scope | default, decided 2026-09-27 (delegated): an allowlist of bb2dash collections, enforced by the tool gate (`RAG_COLLECTIONS` = `bb2dash`, `bb2dash-inbox-decisions`; O-1, answered 2026-10-05) | if the whole store: task 10's gate drops the collection rule; if narrower: its fixture changes |
| B-5 (h) | the paused metering plan | default, decided 2026-09-27 (delegated): accepted as a risk and re-read when the phase starts. Re-read 2026-10-05: still paused, no date, notice promised; Stack re-accepts the risk. Usage credits on his Claude account: off | if not accepted: the phase stops at task 1 |
| B-5 (i) | acceptance line | default, decided 2026-09-27 (delegated): the PM's wording under §MVP; the script is 15 steps in two parts, three of them added on 2026-10-05 (PM calls he did not object to) | the acceptance script and task 22's shots follow his wording |
| B-51 (inherited) | `bb2dash-stack`, `just`, one PR per repo | default, decided 2026-09-27 (delegated): `bb2dash-stack` and `just` as Phase 14 built them (its freeze row, DECISIONS 2026-10-02, covers Phase 14 only). One PR per repo is this phase's own exception, its DECISIONS row written at the freeze (2026-10-05): both PRs opened together at task 25, bb2dash merged first; the row amends the two 2026-09-27 rows, which had the bb2dash-stack PR opened after the first merged | struck: "no PR per repo" and "npm scripts" can no longer happen; task 23, task 25 and the DoD check both PRs, and the `just` verbs are as built |
| B-42 (inherited) | a database credential for the test runner | default, decided 2026-09-27 (delegated): `db_test_runner` (migration 100) through `node scripts/db-test.mjs`, on prod and on `main` since Phase 15 | struck: "no" can no longer happen, and its pasted-unit form goes with it. One fact from it stays in use (§Workers, the rules for W-63): prod's `postgres` cannot `set role` into a runner role, because the automatic creator grant carries neither option (`postgres` is not a superuser and `createrole_self_grant` is empty, read 2026-09-27); so an `execute_sql` dry run of a unit that needs `set local role workspace_runner` adds `grant workspace_runner to postgres with inherit false, set true` inside its own transaction, rolled back with it |
| B-48 (inherited) | the dev container | default, decided 2026-09-27 (delegated): kept, in `bb2dash-stack` (Phase 14's freeze row, DECISIONS 2026-10-02). Task 12 follows its install recipe with the version written out: the dev container's own `CLAUDE_CODE_VERSION` defaults to `latest`, and the Workspace image pins 2.1.289 | struck: "dropped" can no longer happen; `claude_oauth_token` stays among brief 100's 11 secret names, so task 14's count is 12 |

## Contract (frozen 2026-10-05 with Stack's answers; the transport after task 5, the argv after task 9's first recording)

### Routes and screens

* **`/workspace`** (new): `web/src/app/(app)/workspace/page.tsx` (metadata "Workspace · bb2dash", the
  form `materials/page.tsx` and `inbox/page.tsx` use), client screen
  `web/src/app/(app)/workspace/Workspace.tsx`, CSS Module
  `web/src/app/(app)/workspace/Workspace.module.css` (all new). The selected conversation is in
  the query string, `?c=<conversation uuid>` (route-driven, like the popouts). Layout: conversation
  list (title, last activity, an "Archive" button on each row), the message column, the composer,
  a service line. A conversation can be archived, not deleted: v1 has no Delete. The list shows
  only conversations that are not archived, so archiving one takes it out of the list. A
  "Show archived" toggle (off by default) lists archived conversations, each with "Unarchive".
  The three labels are PM wording: "Archive", "Unarchive", "Show archived".
* **Top bar:** `NAV_LINKS` in `web/src/components/shell/TopNav.tsx` gains
  `{ href: '/workspace', label: 'Workspace' }` after Materials. Nothing else in the file changes.
  `NAV_LINKS` has five entries today; Workspace is the sixth.
  `web/src/components/shell/TopNav.module.css` is not changed: no CSS shrink rule is added. The
  bar's natural width goes from 752 to 851 px idle and up to 974 px with the longest Sync label
  (measured 2026-10-05 on a static rebuild of the bar; allow a few pixels either way). The band
  between 721 px and those widths is brief 103's open item 3, "Widths just above the fold"
  (Phase 22), and the measured numbers go into STATUS "Known issues" in this PR.
* **A question:** textarea, 1–8000 characters after trimming (`WORKSPACE_PROMPT_MAX`, new, exported
  from `web/src/lib/queries.workspace.ts`; the same number `workspace_prompt_max()` returns); Enter
  asks, Shift+Enter is a new line. The button reads
  **"Ask"** (the standing "no control reads Submit" audit in `web/test/audits.test.ts` stays green).
  While a request is open the button is **"Stop"**, and a second question in the same conversation
  is refused by the database, not only by the button. Each refusal has one sentence (PM wording):
  a second question while one is open (SQLSTATE 23505) "This conversation is still answering.";
  empty or over-long text (SQLSTATE 22023 from the database; the page refuses the same text before
  any request is sent, task 15) "Write a question of 1 to 8000 characters.".
* **An answer:** streamed text, then the stored row. Each assistant message shows a tier badge
  (PM wording: "Haiku · lookup", "Sonnet · standard", "Opus · deep work") and a "Used: …" line
  built from `tool_calls`, a JSON array of at most 20 elements in call order, each
  `{ "tool": text, "query": text | null, "scope": text | null, "ok": boolean }`: `tool` is the name
  after the last `__` (`search_materials`, `get_material_text`, `list_courses`, `search_context`);
  `query` is the call's `q` (materials) or `query` (rag), cut at 200 characters, null otherwise;
  `scope` is `collection` (rag), `course` (materials search, when given) or `text_id` cast to text
  (`get_material_text`), else null; `ok` is false when the matching tool result is an error (a
  gate denial, a server error) or never arrived. Failed and denied calls are stored too. Only the
  first 20 calls of a turn are kept, in call order: the runner drops any later call before
  `workspace_finish()` and logs how many; `workspace_finish()` also cuts `p_tool_calls` to its
  first 20 itself and never raises on a longer array (as it does for content). The "Used:" line
  lists only `ok: true` elements, each as `tool · scope` (or `tool` alone when `scope` is null;
  acceptance step 4's `search_context · bb2dash-inbox-decisions`), and is absent when there are
  none. Its entries are joined with `, ` in call order, and an identical entry is shown once. It
  does not show the stored `query` (the PM's choice) and never the tool's result text, so
  no raw `[notes]` speaker-note slice reaches the screen. Content renders as **plain text**
  (`white-space: pre-wrap`), never as HTML (O-5, answered 2026-10-05: no Markdown in v1).
* **The stream on the page** (`web/src/lib/use-workspace-stream.ts`): `seq` starts at 1 and rises
  by 1 per flush (the runner's rule). The page renders deltas only as a contiguous run from seq 1.
  If the lowest seq received is not 1 (a reload, a page opened mid-answer, a cold Realtime start),
  it renders no partial text, only the line "Answering…" (PM wording), until `done` or the next
  refetch brings the stored row. A gap inside a stream holds later text back until the missing seq
  arrives or `done`. A repeated seq is dropped; another `request_id` is ignored; the payload's
  extra `id` key (added by `realtime.send`) and any other unknown key are ignored. Broadcast replay
  is not used in v1. To keep Realtime warm, the page always holds exactly one private channel:
  `workspace:<conversation uuid>` when `?c=` is a uuid, else `workspace:lobby` (the 141 policy's
  `workspace:%` already covers it). The messages, open-request and status queries set
  `staleTime: 0`, so a reload refetches on mount instead of trusting the restored query cache
  (the app's default is 60 s).
* **States, in words:** queued ("Waiting for the Workspace service"), streaming, done, stopped,
  failed with one sentence per `error_code`, and an offline line when the runner's heartbeat is
  null or older than 120 s (the next bullet). The eight codes and their sentences (PM wording):
  `cancelled` "You stopped this answer." (the stopped sentence);
  `budget_exceeded` "Stopped at the per-answer cost limit.";
  `timeout` "This took too long and was stopped.";
  `stale_claim` "The Workspace service stopped part-way. Ask again.";
  `provider_not_configured` "That model is not connected.";
  `cli_error` "The assistant could not finish this answer. Ask again.";
  `usage_limit` "Your Claude plan's limit is used up. Try again after it resets.";
  `sign_in_expired` "The Workspace's Claude sign-in has expired. Run claude setup-token again and store the new token."
  (the stored string has no backticks).
  The state shown under a question comes from its `workspace_requests` row (`queued`, `claimed`,
  `done`, `failed`, `cancelled`; in the words above: queued, streaming, done, failed, stopped),
  joined to the assistant message by `request_id` when one exists; the sentence for a `failed`
  request is chosen by the request row's `error_code` (`workspace_finish()` writes the same code on
  the request and on the message). When a failed or cancelled request has no assistant row, the
  sentence comes from the request row's `error_code` (`workspace_requests.error_code` is written
  by the stale sweep, by `workspace_finish` and by `workspace_cancel`, which sets `cancelled`), so
  a `cancelled` request with no assistant row shows the stopped sentence under the question; after
  Stop the page shows the stopped sentence at once. The stored cost estimate is not shown.
* **The offline line and a queued question:** the offline line reads
  "The Workspace service is offline." (PM wording). `v_workspace_status` always returns exactly
  one row; `polled_at` and `runner` are null before the first heartbeat, and a null `polled_at`
  reads as offline; offline = null or older than 120 s. The page refetches the status every 30 s
  (`WORKSPACE_STATUS_REFETCH_MS`, new, 30000, exported from `web/src/lib/queries.workspace.ts`)
  and reads the clock through `useNow(30_000)`
  (`web/src/lib/use-now.ts`, on `main`, unchanged), so an idle page turns offline, and back,
  without a reload, inside acceptance step 14's three minutes. The runner calls
  `workspace_heartbeat()` every 30 s on its own timer, during turns too, so a long answer does not
  read as offline. A `queued` request does not expire: while the service is offline the page shows
  the offline line and Stop works on a queued request; when the service returns it answers what is
  still queued, oldest first (the service runs only while Stack's laptop is awake with Docker
  running, so a question asked from another device waits until then).
* **Frozen strings:** the queued line, the late-stream line, the eight `error_code` sentences, the
  offline line and the two refusal sentences above are PM wording, frozen, and held in
  `web/src/lib/workspace-labels.ts`; none carries a cost figure (the cap is a runner setting the
  page cannot read). The tier badges stay as written above. The no-cap sentence (O-2) stays
  "No per-answer cost limit applies to this answer."; it is `NO_CAP_SENTENCE` in
  `workspace/src/config.ts`, which the runner appends as the stored answer's last line only when
  `BUDGET_CAP_HOLDS` is false (O-2's conditional branch, decided by task 9's budget recording), so
  the screen shows it as stored content.
* **Electron:** no change; the shell loads the route like any other once the bb2dash PR is on
  `main`. Before the merge Stack's installed app loads the live site, which has no `/workspace`
  yet, so the shell is checked in a temporary second instance the PM starts, never by editing
  `%APPDATA%\bb2dash\config.json` or quitting his running app. That second desktop window is
  started with `BB2DASH_APP_URL` (a local `next start` of the branch), `BB2DASH_SUPABASE_URL` and
  `BB2DASH_SUPABASE_ANON_KEY` (public values, set in that shell and never printed) and
  `BB2DASH_SYNC_DRY_RUN=1`, with its own `--user-data-dir`. Stack signs in once in that window
  (acceptance step 2 says so); task 22's `08-desktop.png` is taken in a window started the same
  way.

### Service and invocation (the container side of the route)

* **Service `workspace`** (new, the fourth C-2 service; B-5 (b)): Dockerfile
  `docker/workspace/Dockerfile` (new), declared in bb2dash's `compose.yaml` (new in Phase 14) and
  reached through the umbrella's `include:`, behind `profiles: [workspace]` (see Compose profile).
  `image: bb2dash-workspace:local`; `platform: linux/amd64` (Intel-only, which Stack accepted on
  2026-10-05: the `rag` server's tokenizer has no linux-arm64 build). Base `node:22-bookworm-slim`,
  plus `procps` (task 12's process check); the `claude` CLI at one exact pinned version (see CLI
  pin); the materials MCP server and the harness `rag` MCP server, each built in a stage of this
  Dockerfile (see Image build and layout), the `rag` server's embedding model cached into the image
  at build time so nothing is downloaded at runtime. No published ports. Its own network
  `workspace-net`, never `default`, so it shares no network with `sync`. `init: true`,
  `stop_grace_period: 30s`, `security_opt: [no-new-privileges:true]`, `restart: unless-stopped`,
  log rotation as 82 C-1, healthcheck `node /app/workspace/dist/healthcheck.js` with
  `interval: 30s`, `timeout: 5s`, `retries: 3`, `start_period: 60s` (it passes while
  `/run/workspace/alive` is under 90 s old; see Heartbeat, health and shutdown). The service sets
  `CLAUDE_CONFIG_DIR=/home/node/.claude`.
* **Image build and layout** (the seam between W-64 and W-65; W-64's
  `workspace/test/mcp-config.test.ts` pins these literals): the build context is the bb2dash repo
  root. A per-Dockerfile ignore file `docker/workspace/Dockerfile.dockerignore` (new, W-65) is the
  allow-list: `*`, then `!docker/workspace/`, `!workspace/`, `!mcp-server/`, then
  `**/node_modules`, `**/dist`, `**/coverage`, `**/.env`, `**/.env.*` excluded. The root
  `.dockerignore` is not touched, so the sync image's context cannot change.
  `docker/grep-clean.test.mjs` (W-65) gains the workspace image in `IMAGES` and learns to read
  `<Dockerfile>.dockerignore` when one exists; `COPY --from=<named context>` lines stay skipped,
  so the harness `rag` source is not scanned. In the image, `/app/workspace/` is the runner
  package, built in a stage from `workspace/`: `dist/runner.js` (the entry), `dist/healthcheck.js`,
  `dist/hooks/tool-gate.js`, `claude/settings.json`, `prompts/system.md`. `/app/mcp-materials/`
  holds `package.json`, `node_modules` and `dist/index.js`: the materials MCP server, built in a
  stage from `mcp-server/` in the root context by the same steps as the `build` stage of
  `mcp-server/Dockerfile` (`npm ci`, `npm run build`, `npm prune --omit=dev`). No
  `COPY --from=bb2dash-mcp:local` and no `service:` build context; `mcp-server/Dockerfile` and
  `mcp-server/src` are unchanged. `/app/mcp-rag/` holds `package.json`, `node_modules`, `dist/`,
  `certs/prod-ca.crt` and the launcher `mcp-rag.sh` (source `docker/workspace/mcp-rag.sh`, new,
  W-65, shaped on bb2dash-stack `scripts/mcp-rag.sh`): the harness `rag` MCP server, built through
  `build.additional_contexts` `harness-mcp: ${HARNESS_DIR:-../agentic-harness}/mcp-server` and
  `harness-certs: ${HARNESS_DIR:-../agentic-harness}/certs`. That stage copies only
  `package.json`, `package-lock.json`, `tsconfig.json`, `src/` and `scripts/` (never the host's
  `node_modules`, `dist` or `.fastembed-cache`), runs `npm ci` with onnxruntime's CUDA download
  skipped (`ONNXRUNTIME_NODE_INSTALL_CUDA=skip`), `npm run build`, bakes the embedding model into
  `/opt/fastembed` by loading the built server's embedder once
  (`FASTEMBED_CACHE_DIR=/opt/fastembed node scripts/verify-embedder.mjs`, which needs no
  database), then `npm prune --omit=dev`. The build bakes whatever is checked out in the harness
  folder (`main` was e7997f3 on 2026-10-05), so W-65 records `git -C <harness> rev-parse HEAD` in
  102a at build time. Task 12 proves no model is downloaded at runtime (the firewall refuses
  `storage.googleapis.com` and a search still answers). The image creates `/home/node/.claude` and
  `/app/turn` owned by `node`, so a new `workspace-claude-home` volume takes that owner.
* **CLI pin:** one exact version, `ARG CLAUDE_CODE_VERSION=2.1.289` in
  `docker/workspace/Dockerfile`, installed by the dev container's recipe (B-48: `USER node`,
  `NPM_CONFIG_PREFIX=/usr/local/share/npm-global`,
  `npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"`). Never `latest` (the dev
  container's own default), never the `stable` tag (2.1.285). Floor 2.1.288 (its PreToolUse
  hook-skip fix, which the tool gate rests on, and its headless SIGTERM fix, which Stop rests on).
  The pin equals the version task 9's fixtures are recorded on: if the host's `claude --version`
  no longer reads the pin, W-64 records through `npx -y @anthropic-ai/claude-code@2.1.289`. That
  is already the case: on the evening of 2026-10-05, after the audit, the host's
  `claude --version` read 2.1.290, so every recording line in 102a runs the CLI as
  `npx -y @anthropic-ai/claude-code@2.1.289`. Every
  test that reads a recorded `system/init` line asserts `claude_code_version` equals the pin. A
  bump is a deliberate change: re-read `claude --help`, re-record the fixtures, re-read what the
  aliases resolve to.
* **Compose profile:** the service has `profiles: [workspace]`. bb2dash-stack `.env.example` gains
  `COMPOSE_PROFILES=workspace` (W-65); Stack adds the same line to his real `.env` at acceptance
  step 13 (the file is gitignored, so it is a named step, also in 106 R8 "Stack acts"). With it
  `just up` builds and starts the service. A walk, and any `just up`, starts only when today's
  `sync` request is `done`. Immediately before it the PM reads the last 24 hours of
  `agent_requests` and waits out any `sync` row that is `queued` or `claimed` and any row of
  another kind that is `claimed`. A `queued` `inbox_feedback` row is not waited on (only
  `/inbox-apply` on the host closes one): its id goes into 102a, and a walk during which it is
  applied is repeated. The desktop's logon task (`desktop/launch/logon-build.ps1`) runs bb2dash's
  `compose.yaml` alone with no profile, so it never builds, starts, waits on or restarts
  `workspace`. `HARNESS_DIR` is not set as a user variable. The `workspace` block interpolates
  nothing outside `build:`, the secret paths and `WORKSPACE_TURN_BUDGET_USD`. bb2dash-stack
  `doctor/lib/constants.mjs` `ALL_PROFILES` gains `workspace`. Task 12 checks that
  `docker compose -f <bb2dash>/compose.yaml config` resolves with only the user variables set.
  Consequence: nothing restarts a stopped Workspace behind Stack's back, which is one reason no
  Off switch is built.
* **Before the merge:** until the bb2dash PR is on `main`, the Workspace container exists only as
  compose project `bb2dash-wt21`, run from a phase worktree with `SECRETS_DIR` and `HARNESS_DIR`
  set in that shell and the service named in every command:
  `docker compose -p bb2dash-wt21 --profile workspace build workspace`,
  `... up -d --no-deps workspace`, `... exec -u node workspace ...`, `... stop workspace`,
  `... rm -sf workspace`. Never `just up`, never an `up` without a service name, never a changed
  `BB2DASH_DIR` for the umbrella, before the merge. The live project `bb2dash` (owned by
  bb2dash-stack's main checkout) is not touched. Guard, read before and after every docker step
  and pasted into 102a: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is
  unchanged. Only one tree at a time runs the test container, and it is stopped before the first
  `just up` that carries the service on `main` (two runners would both claim). After acceptance
  step 15 the PM removes the test project's leftovers: the `bb2dash-wt21` container, its network
  and `bb2dash-wt21_workspace-claude-home` (named resources only; never a project-wide `down`
  against `bb2dash`). Every docker line the PM or W-65 needs is kept in 102a as one paste-ready
  line (the session's docker commands can be refused, and Stack then runs the line himself). Every paste-ready line is a Git Bash line,
  and 102a says so at the top of its docker section; a container path that is its own argument is
  wrapped in `sh -c '…'`, or the line is run with `MSYS_NO_PATHCONV=1`. The pre-merge container has its own
  `bb2dash-wt21_workspace-claude-home` volume: chats from the pre-merge walk continue after the
  merge from their last 20 stored messages. Branch flow for the image: after task 11 the PM merges
  `feat/workspace-21-runner` into `feat/workspace-21`; W-65 merges the phase branch into
  `feat/workspace-21-container` before any docker check; task 12 runs in
  `bb2dash-wt-21-container`, the walks (tasks 19–22) in `bb2dash-wt-21` after integration.
* **Secrets by file** (R-89's `*_FILE` rule): `workspace_runner_db_url` (new),
  `claude_oauth_token`, `bb2dash_mcp_service_key`, `harness_database_url` (82 C-6 names, all three
  on brief 100's list of 11). The files live in `SECRETS_DIR` (`C:/Users/stack/.bb2dash-secrets/`,
  outside every repo; never a `secrets/` folder inside bb2dash-stack) and reach the container
  read-only at `/run/secrets/<name>`; `workspace_runner_db_url` is stored at task 19 (the
  session-pooler DSN, port 5432). The runner reads its own two secrets at the fixed paths
  `/run/secrets/workspace_runner_db_url` and `/run/secrets/claude_oauth_token`; the service sets no
  `*_FILE` variable for them. `workspace/src/config.ts` refuses a `workspace_runner_db_url` on port
  6543 or without an `sslmode`, the checks `sync/src/secrets.ts` makes for `sync_runner`.
  `CLAUDE_CODE_OAUTH_TOKEN` is exported from its file immediately
  before the CLI starts. The process refuses to start if `ANTHROPIC_API_KEY`,
  `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_SIMPLE` or any `CLAUDE_CODE_USE_*`
  variable is set: the API key, the auth token and the provider switches of that prefix outrank
  the OAuth token (R2 §1's documented order: cloud-provider switches, then the auth token, then
  the API key, then `apiKeyHelper`); the rest of that prefix is refused for simplicity;
  `ANTHROPIC_BASE_URL` would send the token to another host; `CLAUDE_CODE_SIMPLE` is bare mode,
  which never reads the token. `workspace/claude/settings.json` carries no `apiKeyHelper` and no
  `env` key. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `ENABLE_TOOL_SEARCH=false` (with
  `--tools ""` there is no ToolSearch tool to load deferred MCP tools, so the four MCP tools load
  upfront). `DATABASE_URL` is never in the service's own environment (in bb2dash that name means
  another database).
* **Non-root and egress:** the entrypoint (`docker/workspace/entrypoint.sh`) runs
  `docker/workspace/init-firewall.sh` as root (default-deny egress), creates `/run/workspace`
  (0700, `node`), then drops to user `node` before any Node or `claude` process starts
  (`setpriv --reuid node --regid node --init-groups --inh-caps=-all --bounding-set=-all`).
  `cap_add: [NET_ADMIN, NET_RAW]` exists only for that script. The script is a fork, not an
  import, of bb2dash-stack's `.devcontainer/init-firewall.sh`. It keeps: one run per container
  start (a `mkdir` claim in `/dev/shm`; a second run is refused); any exit before the last check
  leaves deny-all except loopback; DNS only to the resolvers in `/etc/resolv.conf`; IPv6 closed;
  the end check (`example.com` refused, `api.anthropic.com` answered). It drops: GitHub's ranges
  and their cache, sudo, and the accept rule for the container's own Docker /24. It reads nothing
  from `workspace-claude-home` or any other path `node` can write. The service sits on its own
  network `workspace-net`, so it cannot reach `bb2dash-sync-1` or its noVNC port. Allowed hosts:
  `api.anthropic.com`, `goultdzqcavefcgnifdy.supabase.co`, and the host of each DSN secret
  (`workspace_runner_db_url`, `harness_database_url`), accepted only if it ends
  `.pooler.supabase.com` (anything else fails closed; a DSN is never echoed; task 19's snippet
  prints only true or false for the existing DSNs' hosts and port, which this rule rests on). The
  script resolves each name once, adds that address to the set and pins `<address> <name>` in the
  container's `/etc/hosts`, so every later connection uses the allowed address (each pooler name
  answers one of several rotating addresses per lookup). No root process stays running: there is
  no refresh loop. A stale pin is healed by the runner's database watchdog (see Heartbeat, health
  and shutdown), whose exit restarts the container and re-runs the firewall; bb2dash-stack's README
  says `docker compose restart workspace` does the same by hand. If task 12's token smoke fails on
  the network, the missing host is added to this list and recorded in 102a and in a DECISIONS row.
  The sync container has no firewall; `dev` is the only precedent.
* **The runner** (`workspace/src/runner.ts`): polls `workspace_claim()` every 2 s
  (`POLL_INTERVAL_MS`), one turn at a time (`TURN_CONCURRENCY = 1`), routes, calls
  `workspace_begin()`, runs the provider, sends text deltas through `workspace_stream()` coalesced
  every 250 ms (`STREAM_FLUSH_MS`), and closes with `workspace_finish()`. `seq` starts at 1 and
  rises by 1 per flush. Only main-thread `text_delta` events are streamed (never `thinking_delta`
  or `input_json_delta`), and the stored `content` is that same joined text, so the screen does
  not change when the stored row replaces the stream. The runner splits a flush over 16000
  characters before it sends (`workspace_stream()` raises 22023 above that), and cuts `content` at
  100000 characters, logging the cut, before `workspace_finish()` (which stores
  `left(p_content, 100000)`). A `false` from `workspace_stream()` (Stack pressed Stop) kills the
  CLI within 2 s. `workspace_stream()` called with an empty `p_delta` sends nothing and consumes
  no `seq`; it only answers whether the request is still `claimed`. While a turn runs and no text
  was flushed in the last 2 s (`CANCEL_POLL_MS = 2000`, `workspace/src/config.ts`), the runner
  makes that call, so a Stop pressed during a tool call is seen within about 2 s and the CLI is
  killed within 2 s more. A turn is killed at 8 minutes (`TURN_TIMEOUT_MS`), under the database's
  10-minute stale-claim sweep, so a live runner always finishes its own turn first. A `queued`
  request does not expire: when the service returns it answers what is still queued, oldest
  first. These constants and `HISTORY_REPLAY` live in `workspace/src/config.ts`, which also holds
  `HEARTBEAT_MS`, `DB_WATCHDOG_MS`, `CANCEL_POLL_MS`, `REPLAY_MAX_BYTES` and the pinned CLI
  version the init-line check compares against, reads `WORKSPACE_TURN_BUDGET_USD` (new; default
  `1.00`, refused outside
  0.01–1.00; B-5 (f)), the value `--max-budget-usd` receives, and holds `BUDGET_CAP_HOLDS` and
  `NO_CAP_SENTENCE` (both new; the O-2 switch and its sentence). The cap counts only the call's
  own spend, so it is per answer on a resumed turn too; one response can overshoot it; it is
  Claude Code's estimate at list prices, not a charge. O-2 was answered on 2026-10-05: the flag
  stays. One branch of it stays PROVISIONAL until task 9: only if the budget recording shows no
  stop (it ends `success` with two or more turns and a cost above the cap) does W-64 set
  `BUDGET_CAP_HOLDS` false; the runner then appends `NO_CAP_SENTENCE` as the stored answer's last
  line, and the PM tells Stack the same day. `cost_usd`: the runner passes the CLI's
  `total_cost_usd` to `workspace_finish()` as reported. It is Claude Code's own list-price
  estimate, on a resumed turn the session's running total, restarting after an abnormal exit; it
  is never summed, never shown, and not comparable across turns.
* **Heartbeat, health and shutdown:** the runner calls `workspace_heartbeat()` (the fifth runner
  RPC) every 30 s on its own timer (`HEARTBEAT_MS = 30000`), during turns too, and after each
  success touches `/run/workspace/alive`; `workspace_claim()` no longer stamps the heartbeat.
  `healthcheck.js` passes when that file's mtime is under 90 s old, so healthy means the runner
  loop is alive and reached the database within 90 s, and the container stays healthy through an
  8-minute turn. The service's healthcheck runs it with `interval: 30s`, `timeout: 5s`,
  `retries: 3`, `start_period: 60s`. `DB_WATCHDOG_MS = 180000`: if no heartbeat has succeeded for
  that long the runner ends any turn in flight and exits non-zero, so the restart policy brings the container back and
  the firewall resolves its hosts again. `init: true` passes signals to the runner and reaps MCP
  server children a killed CLI leaves behind. On SIGTERM or SIGINT the runner stops polling, kills
  the CLI child, finishes a turn in flight as `failed` / `stale_claim`, and exits 0, inside the
  service's `stop_grace_period: 30s`.
* **Router** (`workspace/src/router.ts`, pure; B-5 (e): the heuristic only, no classifier
  call): `routeTier(prompt, priorTier) → 'low' | 'mid' | 'high'`.
  `high` when a clause opens with an execution verb (`HIGH_VERBS`: draft, write, plan, build,
  outline, prepare, revise, critique, solve, create, analyze, compare) or the prompt exceeds 600
  characters; `low` when it opens with a lookup cue (`LOW_CUES`: what, when, where, which, who, find,
  show, list, pull, open, get, is there, does), is at most 200 characters and has no high verb; a
  follow-up of at most 40 characters keeps `priorTier`; `mid` otherwise. The fixture file
  `workspace/test/fixtures/router-cases.json` is the executable form of this rule; it holds the
  acceptance script's five questions, and task 7 asserts steps 3, 4 and 5 route `low`, step 6
  `mid` and step 7 `high`.
* **Tiers** (`workspace/src/tiers.ts`, `TIER_ROUTES`): `low → claude-cli / haiku`,
  `mid → claude-cli / sonnet`, `high → claude-cli / opus`; the alias is what `--model` receives.
  `workspace_messages.model` stores the full model id the CLI reports for the turn when the
  stream names one, else the alias: `workspace_begin()` stores the alias, and the runner passes
  the id the stream names to `workspace_finish()` as `p_model`, or null when the stream names none
  (task 9 records where the stream names it). On CLI 2.1.289 the aliases resolve to Haiku 4.5, Sonnet 5.5
  and Opus 5.5; a pin bump re-reads this line. v1 keeps three tiers with Opus on top; the CLI's
  `fable` alias is not routed. `TIER_ROUTES` stays a code constant: there is no
  `WORKSPACE_TIER_ROUTES` setting.
* **Provider seam** (`workspace/src/providers/`): `types.ts` declares
  `Provider { readonly id: ProviderId; runTurn(input: TurnInput, signal: AbortSignal): AsyncIterable<TurnEvent> }`
  with `ProviderId = 'claude-cli' | 'ollama' | 'frontier-api'` and `TurnEvent` = delta | tool | result.
  `claude-cli.ts` is implemented; `ollama.ts` and `frontier-api.ts` type-check and throw
  `ProviderNotConfiguredError`, which the runner stores as `provider_not_configured`; task 8's
  test is the seam's proof. The provider's in-memory tool events are W-64's own; only the stored
  shape is frozen. At finish the runner passes `p_tool_calls` as a JSON array of at most 20
  elements in call order, each
  `{ "tool": text, "query": text | null, "scope": text | null, "ok": boolean }`: `tool` is the
  name after the last `__` (`search_materials`, `get_material_text`, `list_courses`,
  `search_context`); `query` is the call's `q` (materials) or `query` (rag), cut at 200
  characters, null otherwise; `scope` is `collection` (rag), `course` (materials search, when
  given) or `text_id` cast to text (`get_material_text`), else null; `ok` is false when the
  matching tool result is an error (a gate denial, a server error) or never arrived. Failed and
  denied calls are stored too, with `ok: false`. Only the first 20 calls of a turn are kept, in
  call order: the runner drops any later call before `workspace_finish()` and logs how many;
  `workspace_finish()` also cuts `p_tool_calls` to its first 20 itself and never raises on a
  longer array (as it does for content). No other input key and no result text is stored.
* **Argv, frozen** after task 9's first recording (PROVISIONAL until then; pinned by
  `workspace/test/claude-argv.test.ts`; cwd is an empty `/app/turn`; spawned as an argv array,
  never through a shell):
  `claude -p --model <alias> (--session-id <new random uuid> | --resume <claude_session_id>)
  --tools "" --allowedTools mcp__bb2dash__search_materials mcp__bb2dash__get_material_text
  mcp__bb2dash__list_courses mcp__rag__search_context --disallowedTools Bash Read Write Edit
  WebFetch WebSearch mcp__rag__get_document --permission-mode dontAsk --permission-prompts none
  --strict-mcp-config --mcp-config /run/workspace/mcp.json --setting-sources project
  --settings /app/workspace/claude/settings.json --append-system-prompt <contents of
  workspace/prompts/system.md> --system-prompt-snapshot off --output-format stream-json --verbose
  --include-partial-messages --include-hook-events --max-budget-usd <WORKSPACE_TURN_BUDGET_USD>
  -- <prompt>`.
  The prompt is always the last element, after `--`, so a question that begins with `--` is never
  read as a flag (task 9's live recording proves the form). Four elements are new since the
  2026-09-24 draft: `--setting-sources project` (cwd `/app/turn` is empty, so no user or local
  settings, hooks or memory files load; only `--settings` and the flags apply);
  `--system-prompt-snapshot off` (an edit to `system.md` reaches every conversation on its next
  turn); `--include-hook-events` (each hook run appears in the stream, so the runner fails closed:
  a `tool_use` other than `EndConversation` with no PreToolUse hook response, or one whose exit
  code is neither 0 nor 2, kills the turn as `cli_error`; see Tool gate for `EndConversation`);
  and `mcp__rag__get_document` in `--disallowedTools` (the tool leaves
  the model's view). `--permission-mode dontAsk` is passed on every turn, first and resumed, and
  the argv test asserts it on both forms. Every flag was listed by `claude --help` on 2.1.289 on
  2026-10-05 (`dontAsk` among `--permission-mode`'s choices, `none` among
  `--permission-prompts`'), and task 12 re-reads `claude --help` inside the image. No `claude -p`
  has run with this argv yet: task 9's lookup recording is the argv's gate. If any element does
  not behave as described there, W-64 stops and reports, and the PM rules again before task 8's
  argv test is finalised. Never `--bare`; never `@anthropic-ai/claude-agent-sdk` (B-5 (d)).
* **Init-line check:** on every turn the runner reads the stream's first (`system/init`) line and
  kills the turn before any model call, storing `cli_error` and logging why, unless:
  `claude_code_version` equals the pin; the credential source is the OAuth token (the value task
  9 records for a setup-token or `/login` session, never `ANTHROPIC_API_KEY`, `apiKeyHelper` or a
  managed key); `permissionMode` is `dontAsk`; `mcp_servers` are exactly `bb2dash` and `rag`,
  both connected; `tools` holds the four allowed MCP names and no `ToolSearch` (whether
  `mcp__rag__get_document` is listed is recorded, not asserted). Field names follow the
  recording. For every turn whose init line it reads, whether the check passes or not, the runner
  writes one log line to stdout holding the request id and the init line's `claude_code_version`,
  credential source, `permissionMode` and model (never a token, a DSN or prompt text); task 19 and
  acceptance step 10 read it from the container's log.
* **Error codes** (`workspace/src/errors.ts`): eight codes, the list 140 checks on
  `workspace_messages.error_code` and on `workspace_requests.error_code`: `budget_exceeded`,
  `timeout`, `stale_claim`, `provider_not_configured`, `cli_error`, `cancelled`, `usage_limit`,
  `sign_in_expired`. The mapping keys on structured fields of the CLI's stream as recorded, never
  on result text: `budget_exceeded` on the result subtype `error_max_budget_usd`;
  `sign_in_expired` on the CLI's authentication failure (recordable with a deliberately bad
  token, which spends no model turn); `usage_limit` when a turn ends in error after a plan
  rate-limit rejection (read the terminal error, not an `api_retry` event, and read the overage
  fields; a turn reported as paid from usage credits, `isUsingOverage` true, is killed and stored
  as `usage_limit`, if task 9's recording shows those fields on the wire). A plan-limit hit
  cannot be recorded on demand, so its unit test uses a synthetic event built from the CLI's own
  type, kept as `workspace/test/fixtures/synthetic-rate-limit.json` and named synthetic, outside
  task 9's "recorded live" assertion. Anything unrecognised is `cli_error`. The runner's own
  stops: Stop is `cancelled`, the 8-minute kill is `timeout`, a turn cut short by SIGTERM or
  SIGINT is `stale_claim`, a stub provider is `provider_not_configured`. No code is retried on
  another model (B-5 (f): no silent downgrade).
* **Continuity:** every fresh start passes `--session-id <a new random uuid>` (never the
  conversation's id), with the stored history replayed as context when there is any; every later
  turn passes `--resume <claude_session_id>`, the id the stream reported and `workspace_finish()`
  stamped (the CLI keeps the id unless `--fork-session` is given). One recovery, tried once per
  turn: a `--resume` start that exits non-zero before any `assistant` message is retried as a
  fresh start with replay. `workspace_finish()` stores null for a session id that is not
  uuid-shaped (it never raises on it); the column has a uuid-shape check; the runner tests the
  shape again before it builds argv, and a stored id that fails it is never put in argv (a fresh
  start instead). The stored history is `workspace_claim()`'s `history`: up to 20 messages of the
  conversation that come before this request's user message, oldest first, as `[{role, content}]`.
  The request's own user message is not in it (it is `prompt`), and a first question gets `[]`.
  The runner builds the replay from it newest-first within `REPLAY_MAX_BYTES` (96 KiB of UTF-8),
  at most 20 messages (`HISTORY_REPLAY = 20`), and emits it oldest-first, so the prompt argument
  can never exceed the kernel's per-argument limit (131072 bytes); a runner test covers 20
  messages of 100000 characters. `REPLAY_MAX_BYTES` bounds the replay with its framing, because
  the question itself
  can add 32000 bytes (8000 characters of 4 bytes each); a second runner test covers a full replay
  followed by an 8000-character question of 4-byte characters and asserts the prompt element is
  under 131072 bytes. Transcripts live on the named volume `workspace-claude-home` (the `node` user's
  `~/.claude`). `"cleanupPeriodDays": 30` is written on purpose in
  `workspace/claude/settings.json` and asserted in `config.test.ts`: a chat idle for 30 days
  continues from its last 20 stored messages. A conversation the model ended with
  `EndConversation` continues through the same fresh-start recovery.
* **Tool gate** (`workspace/src/hooks/tool-gate.ts`, wired as a `PreToolUse` hook in
  `workspace/claude/settings.json`; read-only v1, B-5 (c)): denies every tool not in the
  four-name allowlist; denies `mcp__rag__search_context` unless `collection` is on `RAG_COLLECTIONS`
  = `bb2dash`, `bb2dash-inbox-decisions` (B-5 (g); O-1, answered 2026-10-05: `stack` is not
  added; both answered a `search_context({collection})` call on 2026-09-24); denies
  `mcp__rag__get_document` in v1 (O-3, answered 2026-10-05: whole notes stay off), and
  `--disallowedTools` also removes that tool from the model's view. `settings.json` wires one
  `PreToolUse` command hook, matcher all tools, command
  `node /app/workspace/dist/hooks/tool-gate.js`, `"timeout": 600` (a hook that times out does not
  block, so it must never fire before the turn's own 8-minute kill), no `apiKeyHelper`, no `env`
  key. The gate only denies or stays silent: a deny is exit code 2 with the reason on stderr; an
  allowed call exits 0 with empty stdout and never prints `permissionDecision: "allow"`; any
  internal error (unreadable or non-JSON stdin, a missing `tool_name`, a `collection` that is not
  a string, an exception) exits 2. `collection` is compared exactly. The deny reason for the
  collection rule reads `collection must be one of: bb2dash, bb2dash-inbox-decisions`.
  `--allowedTools` is the first fence and the hook the second. There is no database fence under
  the two MCP servers (`bb2dash` holds the service key, D-4's sanctioned holder; `rag` holds the
  harness store's DSN); they stay read-only because each server exposes read tools only.
  `workspace_runner` fences only the runner's own queue connection. Stack accepted this for v1 on
  2026-10-05. Checks beyond the unit test: task 12 runs, as `node` inside the container, the
  exact command string read out of the image's `settings.json` with a `search_context` payload
  naming a collection off the list, and expects exit 2; and the runner fails closed at runtime
  (see Argv, frozen). `EndConversation` is outside the gate by the CLI's design; it reads and
  writes nothing. The stream parser accepts it as a tool event: the fail-closed rule skips it, it
  is not stored in `tool_calls`, and the turn finishes as the CLI ends it.
* **MCP config** (`workspace/src/mcp-config.ts`, written at start to `/run/workspace/mcp.json`,
  mode 0600; paths only, never a key, token or DSN): exactly two servers. `bb2dash` (materials,
  tools `search_materials`, `get_material_text`, `list_courses` as `mcp-server/src/tools/` names
  them): command `node`, args `["/app/mcp-materials/dist/index.js"]`, env
  `SUPABASE_URL=https://goultdzqcavefcgnifdy.supabase.co` and
  `SUPABASE_SERVICE_ROLE_FILE=/run/secrets/bb2dash_mcp_service_key`; its key comes through that
  file, which Phase 14's `mcp-server/src/env-file.ts` reads (brief 100), never a literal. `rag`
  (harness store, tools `search_context` with its `collection` filter and `get_document`):
  command `bash`, args `["/app/mcp-rag/mcp-rag.sh"]`, no env that holds a DSN. The launcher reads
  `/run/secrets/harness_database_url` and exports `DATABASE_URL` to the server process only, with
  `DATABASE_SSL` and `DATABASE_CA_CERT=/app/mcp-rag/certs/prod-ca.crt` set the way the live
  `harness-jobs` service sets them (`DATABASE_SSL` empty, so the certificate is checked against
  the pinned CA), and `FASTEMBED_CACHE_DIR=/opt/fastembed`. `DATABASE_URL` is the only place that
  server's `src/config.ts` takes its connection string from; the same file also reads
  `DATABASE_SSL`, `DATABASE_CA_CERT` and `FASTEMBED_CACHE_DIR`. `DATABASE_URL` is never in the
  service's own environment (in bb2dash that name means another database, and the `rag` server
  refuses a URL naming `goultdzqcavefcgnifdy`). `harness_database_url` names the hosted store
  (TLS, pinned CA); the local `harness-postgres` container is a stale copy no service reads. The
  two stores are never merged and their ids never mixed (D-21; the `rag` server's own rule).
* **System prompt** (`workspace/prompts/system.md`): read-only; cite the file or note used; never
  invent a number (CLAUDE.md: "No fabricated numbers anywhere"); label speaker-note text as speaker
  notes; grades live on the Grades screen. It also says: every `search_context` call passes
  `collection` (`bb2dash-inbox-decisions` for what Stack decided on an Inbox item, `bb2dash` for
  project history; no other value works); `search_materials` takes `q`, and `course` when the
  question names one; whole notes are not available, answer from the search results; do not list
  other collections; a score quoted from a decision note is what it was on that date, and the
  Grades screen has the current figure; answer in plain text without Markdown symbols; when a
  document was cut, say that only its first part was read (`get_material_text` returns only the
  first 20,000 characters of a unit: `MAX_TEXT_CHARS` in `mcp-server/src/format.ts`, and
  `mcp-server/` is unchanged in this phase). It carries no course AI-use rule (a PM call of
  2026-10-05 that Stack did not object to). The file is written before task 9's recordings (W-64
  writes it with task 8), since the argv carries it; task 11 still owns its test.

### RPC signatures

All pin `set search_path = public, pg_temp`. Browser-side RPCs are `security invoker` (RLS decides,
as 083's do); runner RPCs are `security definer`, revoked from `public`, `anon`, `authenticated` and
`service_role` (091's four-role list), and executable by `workspace_runner` only. For every function
of 140 and 142 the grant column is the whole list: `revoke all` from those four roles first, then
grant the row's roles (on prod a new function in `public` is born executable by all four). The
standing rule this must not break is phase15_101's guard (c): among SECURITY DEFINER functions in
`public`, `authenticated` executes exactly `app_owner()` and `calendar_push_now()`, and `anon` none.
A refusal a function raises itself carries SQLSTATE 22023 (083's and 091's form) and a message that
starts with the function's name; a second open request raises 23505 from the unique index
`workspace_requests_one_open`. The page keys its two refusal sentences
(`web/src/lib/workspace-labels.ts`) on those two codes.

| signature | mode | grant | does |
|---|---|---|---|
| `public.workspace_prompt_max() returns integer` (immutable) | invoker | `authenticated`, `service_role` | returns 8000 |
| `public.workspace_ask(p_conversation_id uuid, p_text text) returns jsonb` | invoker | `authenticated` | one transaction: creates the conversation when `p_conversation_id` is null (title = first line of the text, cut at 120), inserts the user message (`finished = true`) and a `queued` request; refuses empty or over-long text (22023) and a second open request in the conversation (23505); returns `{conversation_id, message_id, request_id}` |
| `public.workspace_cancel(p_request_id bigint) returns boolean` | invoker | `authenticated` | `queued` or `claimed` → `cancelled`, and the request row's `error_code` is set to `cancelled`; true when a row changed |
| `public.workspace_claim(p_runner text) returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text, claude_session_id text, prior_tier text, history jsonb)` | definer | `workspace_runner` | sweeps claims older than 10 minutes to `failed` / `stale_claim` (the code is written on the request row's `error_code`, and their assistant rows get the same code); does not stamp the heartbeat (`workspace_heartbeat` does); claims the oldest `queued` row with `for update skip locked`, `attempts + 1`; a `queued` row does not expire (the sweep touches `claimed` rows only), so what was asked while the service was offline is answered, oldest first, when it returns; `history` = up to 20 messages of the conversation that come before this request's user message, oldest first, as `[{role, content}]`; the request's own user message is not in it (it is `prompt`), and a first question gets `[]`; in the body every `returns table` column is aliased (its names equal column names, so 42702 fires at call time otherwise, which no dry run shows) |
| `public.workspace_begin(p_request_id bigint, p_tier text, p_provider text, p_model text) returns uuid` | definer | `workspace_runner` | inserts the assistant message (`finished = false`, parent = the user message, `request_id` = the request, `model` = `p_model`, which is the alias `--model` receives); refuses unless the request is `claimed` |
| `public.workspace_stream(p_request_id bigint, p_seq integer, p_delta text) returns boolean` | definer | `workspace_runner` | false, sending nothing, unless the request is still `claimed`; else `realtime.send(jsonb_build_object('request_id', p_request_id, 'seq', p_seq, 'delta', p_delta), 'delta', 'workspace:' \|\| conversation_id, true)`; raises 22023 for a `p_delta` over 16000 characters (the runner splits first); `p_seq` starts at 1 and rises by 1 per flush (the runner counts); called with an empty `p_delta` it sends nothing and consumes no `seq`: it only answers whether the request is still `claimed` (the runner makes that call while a turn runs and no text was flushed in the last 2 s, `CANCEL_POLL_MS = 2000`, so a Stop pressed during a tool call is seen within about 2 s) |
| `public.workspace_finish(p_request_id bigint, p_state text, p_content text, p_tool_calls jsonb, p_error_code text, p_cost_usd numeric, p_duration_ms integer, p_claude_session_id text, p_model text) returns void` | definer | `workspace_runner` | `p_state` in `done` / `failed`; `p_error_code` is null or one of 140's eight codes; a request already `cancelled` stays cancelled and its message gets `cancelled`; any other request is set to `p_state`, with its `finished_at` stamped and `p_error_code` written on the request row as well as on the message; writes the message (content stored as `left(p_content, 100000)`; the runner cuts first and logs), with `p_tool_calls` (140's array of at most 20 elements; the runner keeps the first 20 calls and logs the rest before the call, and the function also cuts `p_tool_calls` to its first 20 itself and never raises on a longer array, as it does for content) and `p_cost_usd` (the CLI's `total_cost_usd` as reported, 140's definition), and with `p_model` when it is not null (the full model id the stream reported: it replaces the alias `workspace_begin()` stored, and null keeps the alias), sets `finished`, stamps the conversation's `claude_session_id` (null when `p_claude_session_id` is not uuid-shaped; it never raises on it) and `updated_at`, sends a `done` broadcast |
| `public.workspace_heartbeat(p_runner text) returns void` | definer | `workspace_runner` | upserts the one heartbeat row (`id = 1`: `polled_at = now()`, `runner = p_runner`); the runner calls it every 30 s on its own timer (`HEARTBEAT_MS = 30000`), during turns too |

P-85 also names a `workspace_reader` role (91 §2.1). v1 builds none (O-4, answered 2026-10-05: no
planner or grades tool and no `workspace_reader` role in v1): no Workspace tool reads planner, grades
or Inbox data, so there is nothing for a reader role to hold.

Realtime (the transport, frozen after task 5): private Broadcast topic `workspace:<conversation uuid>`,
events `delta` `{request_id, seq, delta}` and `done` `{request_id, message_id, state}`. `realtime.send`
adds an `id` key to every payload that has none, so each event arrives with that one key more; the
page reads the named keys and ignores `id` and any other unknown key. `seq` starts at 1 and rises by
1 per flush (the runner counts). Clients only receive; no policy lets a client send. To keep Realtime
warm, the page always holds exactly one private channel: `workspace:<uuid>` when `?c=` is a uuid,
else `workspace:lobby` (141's `workspace:%` already covers it). Broadcast replay is not used in v1.
The page renders deltas only as a contiguous run from seq 1: if the lowest seq received is not 1 (a
reload, a page opened mid-answer, a cold Realtime start), it renders no partial text, only the line
"Answering…", until `done` or the next refetch brings the stored row; a gap inside a stream holds
later text back until the missing seq arrives or `done`; a repeated seq is dropped; another
`request_id` is ignored. A missed broadcast costs live text, never the answer: while a request is
open the messages query refetches every 5 s, and the stored row is the record. The refetch cannot
fill a hole mid-stream, because the assistant row's content is written once, by `workspace_finish`.
Prod on 2026-09-24, re-read 2026-10-05: `realtime.messages` is range-partitioned on `inserted_at` and
has **0 partitions**; `realtime.send` is `security invoker`, executable by `public`, catches its own
insert error as a warning, and leaves `realtime.topic` set to the send's topic for the rest of the
transaction. Nothing in the database makes a partition, and `postgres` cannot: by the
supabase/realtime source and Supabase's Broadcast guide (not yet seen on prod; task 5 is the live
proof) the Realtime server makes one table per UTC day, from yesterday to three days ahead, when a
client joins a channel, and drops tables older than 72 hours. Prod also has no publication holding
`realtime.messages` and no replication slot: Realtime creates both when a client first joins, the
slot asynchronously, and a send made before the slot is active is stored but never broadcast. So a
send with no partition is silent, a client's own send dies on the missing insert policy, and a
DEFINER send owned by `postgres` (which bypasses RLS) lands only once a partition exists; task 5
checks that first, and reads a cold start (join, then seconds until a send is delivered) into 102a.

### Tables and migrations

Additive only; each dry-run in `begin … rollback`, applied with `apply_migration` under the file's
name and kept byte-identical; 140–142 are frozen once applied. After each apply W-63 runs
`node scripts/db-test.mjs --only <file>` on `phase12b_076_rls_initplan_and_truncate.sql`,
`phase15_100_db_test_runner_role.sql` and `phase15_101_search_path_pin.sql`; all three read the new
objects (phase15_100 passes with three names until 142 is applied and with row 142's four after).
`DATA_SYNTAX.md` gains `## Workspace (migrations 140-142)` before `## Seed state (2026-09-02)` (W-63, task 2); it
gives `cost_usd` the definition row 140 gives it. Every `db/tests/phase21_*.sql` unit follows brief
95's lint and pass rules: `begin;` first, `rollback;` last, no top-level `commit`, and a last result
row whose first column ends in `: PASS`.

W-63's rules for these units and their dry runs. A unit reads `realtime.messages` only under
`set local role authenticated` or `anon`, and finds its partitions from the catalogs by name
(`pg_inherits`, `pg_class`, `pg_namespace`), never through `::regclass`, since `db_test_runner` has
no USAGE on schema `realtime` and gets none. It sets `realtime.topic` explicitly before each read (a
send leaves it set), and asserts only `topic`, `extension` and `payload` of a stored row, never the
table's column list (Realtime's own schema is moving). Privilege assertions use
`has_table_privilege`, `has_column_privilege`, `has_any_column_privilege`, `has_function_privilege`
and `pg_auth_members`, never `information_schema`, whose privilege views list enabled roles only and
so prove nothing under an inherit-false membership. `workspace_prompt_max()` is called only under
`set local role authenticated`. An `execute_sql` dry run of a unit that needs `set local role` into a
runner role adds, inside the transaction,
`grant workspace_runner to postgres with inherit false, set true` (the automatic creator grant
carries neither option).

Unit 141 (`db/tests/phase21_141_workspace_realtime.sql`) has two labelled forms, because a partition
of `realtime.messages` exists only for a few days after a client last joined a channel. The unit
reads from the catalogs by name whether a partition covers `now()`. Its policy half always runs:
exactly one policy, `workspace_owner_receive`, for SELECT to `authenticated`, naming `app_owner`,
`extension = 'broadcast'` and `realtime.topic()`; no INSERT, UPDATE, DELETE or ALL policy. With a
partition it also runs the send-and-receive half and its last row reads
`phase21_141 send and receive: PASS`; with none its last row reads
`phase21_141 policy only (no partition today): PASS`. Task 3 (a) and task 17 require the full form
once, run by the PM inside the window after the spike (task 5). The Runner prints only
`PASS  <file>`, never a unit's last row, so what shows which form ran is the unit's own partition
test. W-63 writes the unit's partition test as one standalone `select` that returns true or false,
the same expression its branch uses, and puts that `select` in a comment at the top of the unit.
Inside the window after the spike the PM runs exactly that `select` through `execute_sql`
immediately before the Runner, expects true, and pastes both (the `select`'s result and the
Runner's PASS line) into 102a beside task 5's (b0) partition count. The suite
on `main` stays green on any day, and a run that ends on the policy-only row has not proven the
send-and-receive half.

| # | file | creates |
|---|---|---|
| 140 | `db/migrations/140_workspace_tables.sql` | `workspace_conversations` (`id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` via `set_updated_at()`, `title text not null` 1–120 chars, `claude_session_id text check (claude_session_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`, `archived boolean not null default false`); `workspace_messages` (`id uuid pk`, `conversation_id uuid not null` → conversations on delete cascade, indexed; `parent_message_id uuid` → messages on delete set null, indexed; `role text` check `user`/`assistant`; `request_id bigint` → requests on delete set null, indexed; `tier text` check `low`/`mid`/`high`; `provider text` check `claude-cli`/`ollama`/`frontier-api`; `model text`, the full model id the CLI reports for the turn when the stream names one, else the alias (`workspace_begin()` writes the alias, and `workspace_finish()` replaces it when its `p_model` is not null); `content text not null default ''` at most 100000 chars, and `check (role <> 'user' or char_length(content) <= 8000)`; `tool_calls jsonb not null default '[]'`, checked `jsonb_typeof = 'array'` and `jsonb_array_length <= 20`, each element `{ "tool": text, "query": text \| null, "scope": text \| null, "ok": boolean }` in call order (the database checks the array and its length, not the elements); `finished boolean not null default false`; `error_code text` check the eight codes `budget_exceeded`, `timeout`, `stale_claim`, `provider_not_configured`, `cli_error`, `cancelled`, `usage_limit`, `sign_in_expired`; `cost_usd numeric(10,4)`, the CLI's `total_cost_usd` as reported (Claude Code's own list-price estimate; on a resumed turn the session's running total, restarting after an abnormal exit; never summed, never shown, not comparable across turns); `duration_ms integer`; `created_at`); `workspace_requests` (`id bigint identity pk`, `created_at`, `conversation_id uuid not null` → conversations on delete cascade, `user_message_id uuid not null` → messages on delete cascade, each with its own plain index (the key that closes the cycle with `workspace_messages.request_id` is added by `alter table` after both tables exist); `state text` check `queued`/`claimed`/`done`/`failed`/`cancelled` default `queued`, `claimed_at`, `claimed_by text`, `finished_at`, `attempts integer not null default 0`, `error_code text` check the same eight codes; unique partial index `workspace_requests_one_open` on `conversation_id` where state is `queued` or `claimed`; index `(state, created_at)`); `workspace_runner_heartbeat` (`id smallint pk check (id = 1)`, `polled_at timestamptz not null`, `runner text not null`; 142's `workspace_heartbeat()` upserts its one row); view `v_workspace_status` (`security_invoker`: `polled_at`, `runner`, `open_requests`, `oldest_open_at`; always exactly one row, with `polled_at` and `runner` null before the first heartbeat, and a null `polled_at` reads as offline); `workspace_prompt_max()`, `workspace_ask()`, `workspace_cancel()`. Every `created_at` and `updated_at` is `timestamptz not null default now()`. Owner policies in the `(select auth.uid()) = (select public.app_owner())` form: conversations select/insert/update; messages select, insert only `role = 'user' and finished`; requests select, insert only `state = 'queued'`, update only to `cancelled` from `queued`/`claimed`; heartbeat select; no delete policy on any of the four (v1 archives, it has no Delete). `anon` revoked everywhere; `authenticated` gets `select` on the four tables and column-level writes only: exactly the columns `workspace_ask` and `workspace_cancel` write, plus `update (title, archived)` on `workspace_conversations`; never `claude_session_id`, `tier`, `provider`, `model`, `tool_calls`, `cost_usd`, `claimed_by` or `attempts`. These are the first column-level grants in this repo, and they narrow the browser's path only (`db_test_runner` and `service_role` can still write any column): what holds for `claude_session_id` is its check and the runner's own shape test before it builds argv. No TRUNCATE. For Phase 15's runner (brief 95, "The role `db_test_runner`"): `insert, update, delete` on the four tables to `db_test_runner`, which writes the units' setup rows; nothing else. Guard block: the view is `security_invoker`, no `anon` grant on a table or a column, no TRUNCATE |
| 141 | `db/migrations/141_workspace_realtime_policy.sql` | policy `workspace_owner_receive` on `realtime.messages` for select to `authenticated` using `(select auth.uid()) = (select public.app_owner()) and extension = 'broadcast' and (select realtime.topic()) like 'workspace:%'`; no insert, update or delete policy. `workspace:%` also covers `workspace:lobby`, the topic the page holds when no conversation is selected. Its unit (`db/tests/phase21_141_workspace_realtime.sql`) has two labelled forms, and the full form is proven once: W-63 writes the unit's partition test as one standalone `select` that returns true or false, the same expression its branch uses, and puts that `select` in a comment at the top of the unit; inside the window after the spike the PM runs exactly that `select` through `execute_sql` immediately before the Runner, expects true, and pastes both (the `select`'s result and the Runner's PASS line) into 102a beside task 5's (b0) partition count. Prod on 2026-09-24, re-read 2026-10-05: `realtime.messages` has RLS on and 0 policies; `realtime.send(jsonb, text, text, boolean)` exists and `postgres` may execute it; `postgres` does not own `realtime.messages`, and `create policy` on it works all the same (`supautils.policy_grants` names the table) |
| 142 | `db/migrations/142_workspace_runner_role.sql` | `create role workspace_runner login noinherit nobypassrls` with **no password in the file** (Stack sets it out of band, R-89's rule, so the file stays byte-identical); `alter role workspace_runner set statement_timeout = '15s'`; `grant usage on schema public`; the five DEFINER RPCs (`workspace_claim`, `workspace_begin`, `workspace_stream`, `workspace_finish`, `workspace_heartbeat`); no table privilege in schema `public`; `grant workspace_runner to db_test_runner with inherit false`, so the 141 and 142 units can `set local role workspace_runner` (brief 95's pattern for `anon` / `authenticated`); a guard block scoped to schema `public` (091's guard (b) form) that raises if the role holds any table privilege there, if the SECURITY DEFINER functions it can execute there are not exactly the five, if any of the five is executable by `anon`, `authenticated` or `service_role`, or if the role is granted to any role but `db_test_runner` (the one row PostgreSQL 16+ gives its creator excepted: `member = postgres`, `admin_option`, not `inherit_option`, not `set_option`). The guard stops at `public` because what PUBLIC holds on pg_net's schema (`net.http_post` and its two tables) is the same for every login, `sync_runner` included, and `postgres` cannot revoke it; that reach is named in the `workspace_runner` DECISIONS row and in the `/security-review` request, and goes on the deferred hardening list (STATUS, section "Phase 14 deferred (R-96)", its bullet "Hardening noted by the security reviews, below the bar"). In the same PR W-63 changes phase15_100's expected membership literal (`db/tests/phase15_100_db_test_runner_role.sql`) to exactly `'anon(inherit=f,set=t), authenticated(inherit=f,set=t), sync_runner(inherit=f,set=t), workspace_runner(inherit=f,set=t)'` (094 is on prod, so no condition); task 6a carries that one line to `main` in its own test-only PR the day 142 is applied, and W-63 applies 142 only when the PM says that PR is ready. Nobody edits `scripts/db-test.mjs` or `scripts/db-test.test.mjs` (no `phase21_*` unit needs a loader) |
| 143–149 | slack | review rounds only: `create or replace` of 140–142's functions; a phase that runs out takes the next free block of ten and records it in DECISIONS (94 §2 rule 6) |

### Files

| path | new / changed | owner |
|---|---|---|
| `db/migrations/140_workspace_tables.sql`, `db/migrations/141_workspace_realtime_policy.sql`, `db/migrations/142_workspace_runner_role.sql` | new | W-63 |
| `db/tests/phase21_140_workspace_tables.sql`, `db/tests/phase21_141_workspace_realtime.sql`, `db/tests/phase21_142_workspace_runner.sql` | new | W-63 |
| `db/tests/phase15_100_db_test_runner_role.sql` | changed: its membership assertion only | W-63 |
| `DATA_SYNTAX.md` | changed: one new section, `## Workspace (migrations 140-142)`, before `## Seed state (2026-09-02)` | W-63 |
| `workspace/package.json`, `workspace/package-lock.json`, `workspace/tsconfig.json`, `workspace/vitest.config.ts`, `workspace/README.md` | new package (deps: `pg`; dev: `typescript`, `vitest`, `@vitest/coverage-v8`, `@types/node`, `@types/pg`) | W-64 |
| `workspace/src/runner.ts`, `workspace/src/router.ts`, `workspace/src/tiers.ts`, `workspace/src/db.ts`, `workspace/src/config.ts` (it also holds `HEARTBEAT_MS`, `DB_WATCHDOG_MS`, `CANCEL_POLL_MS`, `REPLAY_MAX_BYTES` and the pinned CLI version the init-line check compares against), `workspace/src/mcp-config.ts`, `workspace/src/stream-json.ts`, `workspace/src/healthcheck.ts`, `workspace/src/errors.ts` | new | W-64 |
| `workspace/src/providers/types.ts`, `workspace/src/providers/claude-cli.ts`, `workspace/src/providers/ollama.ts`, `workspace/src/providers/frontier-api.ts`, `workspace/src/providers/index.ts` | new | W-64 |
| `workspace/src/hooks/tool-gate.ts`, `workspace/claude/settings.json`, `workspace/prompts/system.md` | new | W-64 |
| `workspace/test/router.test.ts`, `workspace/test/providers.test.ts`, `workspace/test/claude-argv.test.ts`, `workspace/test/stream-json.test.ts`, `workspace/test/tool-gate.test.ts`, `workspace/test/runner.test.ts`, `workspace/test/mcp-config.test.ts`, `workspace/test/config.test.ts` | new | W-64 |
| `workspace/test/fixtures/router-cases.json`, `workspace/test/fixtures/claude-stream-lookup.jsonl`, `workspace/test/fixtures/claude-stream-budget-stop.jsonl`, `workspace/test/fixtures/claude-stream-resume-missing.jsonl` with its sibling `workspace/test/fixtures/claude-stream-resume-missing.stderr.txt` (where that recording's exit code is kept is W-64's choice; it names the file in its verification section), `workspace/test/fixtures/claude-stream-sign-in-expired.jsonl` (with a `.stderr.txt` sibling if the CLI writes its message there); tool-result bodies in the recordings are scrubbed to `<scrubbed>`; `workspace/test/fixtures/synthetic-rate-limit.json` (not a recording: a synthetic event built from the CLI's own type, named synthetic, outside task 9's "recorded live" assertion) | new | W-64 |
| `docker/workspace/Dockerfile`, `docker/workspace/entrypoint.sh`, `docker/workspace/init-firewall.sh`, `docker/workspace/mcp-rag.sh` (the `rag` server's launcher, shaped on bb2dash-stack `scripts/mcp-rag.sh`) | new | W-65 |
| `docker/workspace/Dockerfile.dockerignore` | new: the allow-list for the image's build context, which is the bb2dash repo root (`*`, then `!docker/workspace/`, `!workspace/`, `!mcp-server/`, then `**/node_modules`, `**/dist`, `**/coverage`, `**/.env`, `**/.env.*` excluded); the root `.dockerignore` is not touched, so the sync image's context cannot change | W-65 |
| `compose.yaml` (bb2dash root, new in Phase 14) | changed: the `workspace` service block, its secrets, the `workspace-claude-home` volume and the `workspace-net` network only; both declared with no `name:` key, as the `bb-profile` and `course-files` volumes are, so the test project's are `bb2dash-wt21_workspace-claude-home` and `bb2dash-wt21_workspace-net` | W-65 |
| `docker/grep-clean.test.mjs` | changed: `IMAGES` gains the workspace image (`{ name: 'workspace', dockerfile: 'docker/workspace/Dockerfile', context: '.' }`) and the test learns to read `<Dockerfile>.dockerignore` when one exists; `COPY --from=<named context>` lines stay skipped, so the harness rag source is not scanned | W-65 |
| bb2dash-stack: `secrets.example/workspace_runner_db_url` (0 bytes), `doctor/workspace.test.mjs` | new | W-65 |
| bb2dash-stack: `compose.yaml` (the top-level `secrets:` entry and the comments that say 11), `.env.example` (`COMPOSE_PROFILES=workspace`), `doctor/lib/constants.mjs` (`SECRET_NAMES` 12, `ALL_PROFILES` gains `workspace`), `doctor/lib/checks-docker.mjs` (a `workspaceRow`), `doctor/lib/checks-host.mjs` (only the comment over `secretsRow` that says 11), `doctor/lib/diagnose.mjs` (the row), `doctor/doctor.test.mjs` (the 12-name test, the green fixtures, the fake `run`), `README.md` (a Workspace section: what it is, where copies of an answer live and how to wipe them, `docker compose restart workspace`, and that the Workspace costs nothing extra only while Usage credits are off on the Claude account; the three "11"s; a `workspace_runner_db_url` row in the secrets table, and `workspace` added to the "Used by" cell of `claude_oauth_token`, `bb2dash_mcp_service_key` and `harness_database_url`; a `workspace` row in the doctor table. The copies it names: the `workspace_*` rows in the database (archived, never deleted in v1), the CLI's transcripts on the `workspace-claude-home` volume (kept 30 days) and the browser's saved query cache (cleared on sign-out)); not `doctor/doctor.mjs`, which is unchanged | changed | W-65 |
| `web/src/app/(app)/workspace/page.tsx`, `web/src/app/(app)/workspace/Workspace.tsx`, `web/src/app/(app)/workspace/Workspace.module.css` | new | W-66 |
| `web/src/components/workspace/ConversationList.tsx`, `web/src/components/workspace/MessageList.tsx`, `web/src/components/workspace/Composer.tsx`, `web/src/components/workspace/TierBadge.tsx`, `web/src/components/workspace/ServiceStatus.tsx`, each with its `.module.css` beside it | new | W-66 |
| `web/src/lib/queries.workspace.ts` (hand-declared row types, the `web/src/lib/queries.sync.ts` pattern; nobody moves it onto the generated types in this phase), `web/src/lib/use-workspace-stream.ts`, `web/src/lib/workspace-labels.ts` | new | W-66 |
| `web/src/components/shell/TopNav.tsx` | changed: one `NAV_LINKS` entry, the sixth (`web/src/components/shell/TopNav.module.css` is not changed) | W-66 |
| `web/test/queries.workspace.test.ts`, `web/test/use-workspace-stream.test.tsx`, `web/test/Workspace.test.tsx`, `web/test/TopNav.workspace.test.tsx`, `web/test/workspace-labels.test.ts` | new | W-66 |
| `web/src/lib/supabase/database.types.ts` | regenerated from prod at integration; besides this phase's objects the diff carries what `main`'s file still lacks from merged migrations (091, 093, 094, 095); no carve-out | PM |
| `web/e2e/walk21.spec.ts` | new: the PM's walk spec, in the walk17 / walk19 pattern (`web/e2e/walk17.spec.ts`, `web/e2e/walk19.spec.ts`); the one hand-written file under `web/` that is not W-66's | PM |
| `project-state/STATUS.md`, `project-state/DECISIONS.md`, `project-state/ORCHESTRATOR.md`, root `CLAUDE.md` | changed | PM |
| `docs/planning/sprint-2/walks/walk-21/*.png`, `docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` | new | PM |
| `docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md`, `docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md` | changed, in the same PR: the stale lines of 106's section R8 (these at least: the two `bb2dash-stack/secrets/` paths, which become `SECRETS_DIR/…`; the walk's step count, now two parts and 15 steps; the password hand-over, now task 19's snippet; the `database.types.ts` line, now regenerated from prod with no carve-out; the 141 fallback, now the unit's two labelled forms; and its "Stack acts" list gains the `COMPOSE_PROFILES=workspace` line of acceptance step 13 and the merge word for task 6a's PR), and the three brief-102 notes in 105 §3 (struck as fixed) | PM |

The four worker sets are disjoint. Nobody but W-66 touches `web/`, except the PM's two files there,
`web/src/lib/supabase/database.types.ts` (generated) and `web/e2e/walk21.spec.ts`; nobody but W-63
touches `db/` or `DATA_SYNTAX.md` (the PM's port PR, task 6a, carries W-63's one membership line to
`main`, byte-identical to the phase branch's file); nobody but W-64 touches `workspace/`;
`docker/workspace/` and `docker/grep-clean.test.mjs` are W-65's, and `compose.yaml` is W-65's for the
one service block, its secrets, its volume and its network; `project-state/` is the PM's. W-65's image
copies `workspace/` and `mcp-server/`, and W-65 edits neither: W-64's package reaches W-65's branch by
merge (after task 11 the PM merges `feat/workspace-21-runner` into `feat/workspace-21`, and W-65 merges
the phase branch into `feat/workspace-21-container` before any docker check). Nobody edits the root
`.dockerignore`, `mcp-server/Dockerfile`, `mcp-server/src`, `scripts/db-test.mjs`,
`scripts/db-test.test.mjs`, `web/src/lib/use-now.ts` (on `main`; W-66 reads it),
`web/src/components/shell/TopNav.module.css`, anything under `desktop/`, or bb2dash-stack's
`doctor/doctor.mjs`. Worker ids W-63..W-66 are the next free after Phase 20's W-59..W-62
(Phase 14 holds W-55..W-58; Phase 22 follows at W-67..W-70).

### Seams

| with | seam | rule here |
|---|---|---|
| Phase 14 (R-88, R-89) | `bb2dash-stack` umbrella, `SECRETS_DIR` (the secrets folder, `C:/Users/stack/.bb2dash-secrets/`, outside every repo since DECISIONS 2026-10-03; brief 100 wrote `secrets/`), the `*_FILE` shim, `just`, the doctor (`doctor/doctor.mjs`, its rows built under `doctor/lib/`); all new in Phase 14, brief 100 | the service joins through bb2dash's `compose.yaml`, behind `profiles: [workspace]`: bb2dash-stack's `.env.example` gains `COMPOSE_PROFILES=workspace` (W-65), Stack adds the same line to his own `.env` at acceptance step 13 (that file is gitignored, so no PR carries it), and with it `just up` builds and starts the service; one new secret name, `workspace_runner_db_url`, so `secrets.example/` goes from brief 100's 11 files to 12, and `SECRET_NAMES` (`doctor/lib/constants.mjs`) and the top-level `secrets:` block of the umbrella's `compose.yaml` name the same 12; the secret itself is the file `SECRETS_DIR/workspace_runner_db_url`, and the PM adds that name to `$allowed` in `SECRETS_DIR/set-secret.ps1` (task 19; a name, not a secret; the file is in no repo, so the edit is recorded in 102a and told to Stack in the hand-over); one doctor row (a `workspaceRow` in `doctor/lib/checks-docker.mjs`, listed in `doctor/lib/diagnose.mjs`; `doctor/doctor.mjs` is unchanged), and `ALL_PROFILES` gains `workspace`; no second secrets mechanism |
| Phase 14 (R-28, the live `sync` container) | the compose project `bb2dash`, owned by bb2dash-stack's main checkout: the container `bb2dash-sync-1` and its `bb-profile` volume (the Blackboard login) | not touched. Until the bb2dash PR is on `main` the Workspace container exists only as its own compose project `bb2dash-wt21`, run from a phase worktree with `SECRETS_DIR` and `HARNESS_DIR` set in that shell and the service named in every command: `docker compose -p bb2dash-wt21 --profile workspace build workspace`, then on the same prefix `up -d --no-deps workspace`, `exec -u node workspace ...`, `stop workspace` and `rm -sf workspace`. Before the merge: never `just up`, never an `up` without a service name, never a changed `BB2DASH_DIR` for the umbrella. Guard, read before and after every docker step and pasted into 102a: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is unchanged. Only one tree at a time runs the test container, and W-65 edits no line of the `sync` block. The pre-merge container has its own `bb2dash-wt21_workspace-claude-home` volume, so chats from the pre-merge walk continue after the merge from their last 20 stored messages |
| Phase 12 and Phase 14 (the desktop's sign-in task) | `desktop/launch/logon-build.ps1` (Task Scheduler entry `Bb2dash-LogonBuild`): at every logon, every app launch and every 6 hours it runs bb2dash's `compose.yaml` alone (`up -d --wait`, no profile, no service name), with only the user variables `SECRETS_DIR` and `BB2DASH_DIR` set | not touched, and nothing under `desktop/` is edited. The service has `profiles: [workspace]` and that task runs with no profile, so it never builds, starts, waits on or restarts `workspace`. `HARNESS_DIR` is not set as a user variable. The `workspace` block interpolates nothing outside `build:`, the secret paths and `WORKSPACE_TURN_BUDGET_USD`. Task 12 checks that `docker compose -f <bb2dash>/compose.yaml config` resolves with only the user variables set. Consequence: nothing restarts a stopped Workspace behind Stack's back, which is one reason no Off switch is built |
| Phase 14 (R-91) | the `bb2dash-mcp` image (`bb2dash-mcp:local`, built from `mcp-server/Dockerfile`, behind profile `mcp`), `bb2dash_mcp_service_key` and `SUPABASE_SERVICE_ROLE_FILE` | not copied from that image: the materials server is built in a stage of `docker/workspace/Dockerfile` from `mcp-server/` in the root context, by the same steps as the `build` stage of `mcp-server/Dockerfile` (`npm ci`, `npm run build`, `npm prune --omit=dev`); no `COPY --from=bb2dash-mcp:local` and no `service:` build context; `mcp-server/Dockerfile` and `mcp-server/src` are unchanged; the key stays one file, mounted read-only at runtime, never in a layer (D-4). It is a write-capable key inside the container and there is no database fence under the server: it stays read-only because it exposes read tools only (Stack accepted this for v1 on 2026-10-05) |
| Phase 14 (R-92) | `claude_oauth_token`, the setup-token path | same secret (`SECRETS_DIR/claude_oauth_token`); the path has not yet run on the real token inside a container (Phase 14's A7 is unwalked), so task 12's token smoke, one Haiku turn run by the PM, is its first proof; the API-key guard is this phase's own (`workspace/src/config.ts`, task 11), matching R-92's ask; the token's usage is shared with his interactive sessions |
| Phase 14 (R-84, `db/migrations/091_sync_runner_role.sql`, new in Phase 14, brief 100) | `sync_runner`'s shape | `workspace_runner` copies its pattern (login role, DEFINER RPCs, no table grants, negative tests, password out of band), its four-role revoke list (`revoke all` from `public`, `anon`, `authenticated` and `service_role` before each grant) and its guard (b) form, scoped to schema `public`; no RPC is shared; `agent_requests` gains no kind |
| Phase 15 | `node scripts/db-test.mjs --only <file>` and the `db_test_runner` role (both new in Phase 15, migration 100, brief 95) | the three `phase21_*` units run through it; 140 carries the table grants brief 95 asks for every table a unit writes (`insert, update, delete` on the four tables to `db_test_runner`); 142 grants no table privilege and carries only the role membership brief 95 does not grant (`grant workspace_runner to db_test_runner with inherit false`), and W-63 widens the expected membership literal in `db/tests/phase15_100_db_test_runner_role.sql` to the four names `anon`, `authenticated`, `sync_runner`, `workspace_runner` (each `inherit=f, set=t`; 094 is on prod, so no condition). That literal is an exact string every checkout runs against prod, so the day 142 is applied the PM opens a one-line, test-only PR to `main` carrying the line byte-identical to the phase branch's file (task 6a; PR #65's precedent for 094): W-63 applies 142 only when the PM says that PR is ready, and it merges on Stack's word that day. `scripts/db-test.mjs` and `scripts/db-test.test.mjs` are not edited by anyone. After each apply W-63 runs `--only` on the phase12b_076, phase15_100 and phase15_101 units |
| Phase 17 (P-71) | `v_scheduler_heartbeat` (new in Phase 17, brief 97), the transform and calendar ticks' heartbeat | not touched; the Workspace has its own heartbeat row and view |
| Phase 20 and the harness | the `rag` MCP server (the harness repo's `mcp-server/`), its pinned CA (`certs/prod-ca.crt` there), its collections and `harness_database_url` | read-only consumer; no harness change; the realm vault is not written. The image builds the server from the harness checkout through `build.additional_contexts`, `harness-mcp: ${HARNESS_DIR:-../agentic-harness}/mcp-server` and `harness-certs: ${HARNESS_DIR:-../agentic-harness}/certs`; the stage copies only `package.json`, `package-lock.json`, `tsconfig.json`, `src/` and `scripts/` (never the host's `node_modules`, `dist` or `.fastembed-cache`), and W-65 records `git -C <harness> rev-parse HEAD` in 102a at build time. `harness_database_url` names the hosted store (TLS, pinned CA); the local `harness-postgres` container is a stale copy no service reads. That DSN is write-capable and there is no database fence under the server: it stays read-only because it exposes read tools only (Stack accepted this for v1 on 2026-10-05) |
| Phase 22 | the Workspace page is in its inventory (94 §3); the top bar's widths just above the 720 px fold (brief 103, "Open items for Stack", item 3) | existing tokens only, both themes readable, no new colours; Phase 22 restyles. No shrink rule is added to `web/src/components/shell/TopNav.module.css`: `NAV_LINKS` has five entries today and Workspace is the sixth, so the bar's natural width goes from 752 to 851 px idle and up to 974 px with the longest Sync label; the band between 721 px and those widths is brief 103's open item 3, and the measured numbers go into STATUS "Known issues" in this PR |
| Sprint 1 objects | `agent_requests`, `transform_tick`, the Inbox, `v_sync_status`, the Electron poller | none touched |
| W-64 and W-65 (inside this phase) | the in-image layout: what `docker/workspace/Dockerfile` puts where, and what `workspace/src/mcp-config.ts` and `workspace/claude/settings.json` name | frozen literals, pinned by `workspace/test/mcp-config.test.ts`. `/app/workspace/`: the runner package, with `dist/runner.js` (the entry), `dist/healthcheck.js`, `dist/hooks/tool-gate.js`, `claude/settings.json`, `prompts/system.md`. `/app/mcp-materials/`: `package.json`, `node_modules`, `dist/index.js`; MCP entry `bb2dash`: command `node`, args `["/app/mcp-materials/dist/index.js"]`, env `SUPABASE_URL=https://goultdzqcavefcgnifdy.supabase.co` and `SUPABASE_SERVICE_ROLE_FILE=/run/secrets/bb2dash_mcp_service_key`. `/app/mcp-rag/`: `package.json`, `node_modules`, `dist/`, `certs/prod-ca.crt` and the launcher `mcp-rag.sh` (source `docker/workspace/mcp-rag.sh`); MCP entry `rag`: command `bash`, args `["/app/mcp-rag/mcp-rag.sh"]`, no env that holds a DSN. The launcher reads `/run/secrets/harness_database_url` and exports `DATABASE_URL` to the server process only, with `DATABASE_SSL` and `DATABASE_CA_CERT=/app/mcp-rag/certs/prod-ca.crt` set the way the live `harness-jobs` service sets them, and `FASTEMBED_CACHE_DIR=/opt/fastembed`; `DATABASE_URL` is never in the service's own environment (in bb2dash that name means another database, and the rag server refuses a URL naming `goultdzqcavefcgnifdy`). The image creates `/home/node/.claude` and `/app/turn` owned by `node`; the service sets `CLAUDE_CONFIG_DIR=/home/node/.claude`; the root entrypoint creates `/run/workspace` (0700, `node`) before it drops to `node`. The runner reads its own two secrets at the fixed paths `/run/secrets/workspace_runner_db_url` and `/run/secrets/claude_oauth_token`, and the service sets no `*_FILE` variable for them. The hook command wired in `workspace/claude/settings.json` is `node /app/workspace/dist/hooks/tool-gate.js` |

### Must respect

* [2026-09-24] "**Sprint 2 is planned on stated defaults, all provisional:** … No product call in them
  is adopted here: each gets its own row, dated the day Stack answers, and a brief may not cite a
  default as decided before then" (met: the defaults have their rows of 2026-09-27, by delegation, and
  the open items their rows of 2026-10-05)
* [2026-09-03] "Crawler holds only the publishable key; insert-only RLS" — why: "browser-side code
  must never see the service key"
* [2026-09-09] "Renderer: CSS Modules + custom properties, **no Tailwind**"
* [2026-09-09] "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge
  only on Stack's word" (this phase's exception, one PR per repo, has its own row: 2026-10-05 below)
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
  `C:/Users/stack/projects/bb2dash`; each phase branch is its **own worktree** (`bb2dash-wt-<phase>`)
  and the brief is edited there"
* [2026-09-16] "Phase 14 research calls, proposed (frozen when its PM session runs): … Claude in
  containers uses the subscription token from `claude setup-token`"
* [2026-09-16] "A phase PR's `database.types.ts` carries **only its own schema objects** while
  another phase's migrations are live on prod but unmerged" (at integration the file is regenerated
  from prod: besides this phase's objects the diff carries what `main`'s file still lacks from merged
  migrations 091, 093, 094 and 095, which this rule allows because they are merged; no carve-out)
* [2026-09-17] "Everything else in `assignment_progress` / `reading_progress` is still never written
  by a sync"
* [2026-09-23] "Fan-out subagents run on **Opus** (verifiers, reviewers, mergers, builders) or
  **Sonnet** (researchers); Fable is the PM session only"
* [2026-09-22] "**Decisions are stored twice, on purpose:** one vault note per item under
  `projects/bb2dash/decisions/` with `collection: bb2dash-inbox-decisions` (its own section of the rag
  store, queried with `search_context({collection})`)"
* [2026-10-02] "**Phase 14 freeze: one PR per repo, plus the early `syncLauncher` PR; `bb2dash-stack`
  and `just` (B-51).** An exception to the 2026-09-09 SOP row ("one PR per phase") for this phase
  only" (so it is not this phase's row; this phase's is 2026-10-05 below)
* [2026-10-03] "**Phase 14's 094 membership line is ported to `main` ahead of its PR (PR #65).** … The
  seam rule (106 §2: "its membership list is extended by R5's 094 … each in its own PR") stands for
  the next role, `workspace_runner` (142)." — why: "A red suite on `main` fails every other PR's gate
  for as long as Phase 14 stays open; the port is one line and byte-identical." Task 6a is the same
  port for 142: a second exception to "each in its own PR", with its own DECISIONS row.
* [2026-10-03] "**The secrets folder lives outside every repo: `C:/Users/stack/.bb2dash-secrets/`,
  and the umbrella's `SECRETS_DIR` names it.** … Each file is written by `set-secret.ps1` from a
  hidden prompt, UTF-8 with no byte-order mark and no newline." — why: "A `secrets/` folder inside a
  checkout can be committed by accident, and bb2dash and agentic-harness are public repos." Every
  secret path in this brief is `SECRETS_DIR/…`; `bb2dash-stack/secrets/` is not used.
* [2026-10-04] "**Image secret scans use `docker/gitleaks-images.toml`: the default rules plus two
  narrow allowlists.**" (task 13 scans the Workspace image with it; widening an allowlist is a
  DECISIONS call)
* [2026-10-04] "**The dev container's firewall runs once per container start and trusts only a
  root-owned cache of GitHub's own ranges.** A second `init-firewall.sh` run is refused (a `mkdir`
  claim in `/dev/shm`, emptied by a restart) … any failed check leaves deny-all except loopback." (the
  precedent `docker/workspace/init-firewall.sh` forks: it keeps the one-run and deny-all rules and
  drops GitHub's ranges and their cache)
* [2026-10-04] "The umbrella's `.env` points `BB2DASH_DIR` and `HARNESS_DIR` at the main checkouts, so
  one folder owns compose project `bb2dash`." — why: "a second bb2dash checkout would make two folders
  own one compose project and recreate each other's containers."
* [2026-10-05] "**The container's daily sync fires on the first alive login check at or after 06:00
  New York, not only on entering alive**" (so the walks run after the morning sync, and the PM reads
  the last 24 hours of `agent_requests` before each walk and before any `just up`)
* [2026-10-05] "**Phase 21 freeze: one PR per repo (bb2dash and bb2dash-stack, both on
  `feat/workspace-21`), opened together and merged bb2dash first.** An exception to the 2026-09-09 SOP
  row for this phase only; it amends the 2026-09-27 rows for batch item 51 and the plan approval,
  which had the bb2dash-stack PR opened after the first merged."
* [2026-10-05] "**Phase 21 · the `workspace` service sits behind a compose profile, and before the
  merge it runs only as its own compose project.** … Until the bb2dash PR is on `main` the container
  exists only as project `bb2dash-wt21`, run from a phase worktree with the service named in every
  command; never `just up`, never an `up` without a service name, never a changed `BB2DASH_DIR`."
* [2026-10-05] "**Phase 21 · the `workspace_runner` password never passes through a chat: a snippet on
  Stack's laptop makes it, copies the one `alter role` line for the SQL editor and stores the DSN in
  `SECRETS_DIR`.** The secret file `workspace_runner_db_url` is the only file that holds it"
* [2026-10-05] "**Phase 21 · the CLI pin is 2.1.289, and the argv is frozen only after task 9's first
  live recording.** The dev container installs `latest`, so the Workspace image names its version;
  2.1.288 is the floor"
* [root `CLAUDE.md`, "Environment gotchas"; not a DECISIONS row] "Never `docker compose up` or
  recreate `sync` while a sync is open, and never touch the `bb-profile` volume (it is the login)."
* [2026-09-16, brief 82 Stack's decision #16; not a DECISIONS row] "Guardrails: **$0**; today's
  non-Docker Windows path keeps working until acceptance; service key never in an image"
* v3 §4, still declined until a row says otherwise: D-1 "In-app chat assistant" (reversed by this
  phase's row); D-2 "Agent write path into `assignment_progress` / `reading_progress`"; D-4
  "Service-role key anywhere client-side, in a browser, in the repo, or in a container image", with
  "The materials MCP server's secret is the one sanctioned holder." (here the key file is mounted
  read-only into the Workspace container for that server and is never in a layer; the container also
  holds the harness store's DSN for the `rag` server, and Stack accepted both for v1 on 2026-10-05,
  its own row); D-5 "Exposing the stack beyond
  the single owner"; D-19 "Tailwind or any UI framework; new dependencies for styling"; D-21 "The
  two vector stores never cross."

## MVP (in Stack's words)

Stack wrote (91 §3): "workspace section: functions as a chatbot interface that works by routing
prompts to different agent model levels depending on the complexity of the task. Low effort for
simple rag db queries or pulling of documents, higher models for the actual execution of the tasks.
Currently I want to build it as if I might route it to either a local model or to a frontier model.
Claude is the only one we will actually hook up but I wish to build the functionality. Ideally use my
subscription to run it instead of having to pay for api credits." His acceptance field is still
"_to confirm_"; B-5 (i) came back default (2026-09-27, delegated; confirmed 2026-10-05), so the
acceptance is the **PM's wording** from 93 §5 item 5: on a
Workspace page I ask a question; simple lookups answer from the two stores, harder ones go to a
stronger model; every answer names the tier; nothing costs API credits. The PM adds, also PM wording:
nothing I ask can change my planner, my progress or any fact, and the local and frontier providers
exist as typed stubs that say they are not connected.

On 2026-10-05 the PM added three steps to the acceptance script so that his walk shows more of his
own words (PM wording; calls he did not object to): a document pull, for "pulling of documents" (the
"Used:" line names `get_material_text`); a middle-tier question, for "different agent model levels"
(the badge reads "Sonnet · standard"); and the PM showing that no API key is present in the
container, for "instead of having to pay for api credits". "Nothing costs API credits" also rests on
Usage credits being off on his Claude account: he answered "usage credits is off" on 2026-10-05 and
confirms it again at acceptance step 1. The walk is 15 steps in two parts: steps 1 to 12 before the
merge, on the branch preview with the PM's test container running, and steps 13 to 15 on `main`
right after his merge word. The two typed stubs are proven by task 8's test, not by a step of his
walk; the tier map stays a code constant (`TIER_ROUTES`), three tiers with Opus on top.

Also PM wording, so he knows what to expect: the Workspace answers only while his laptop is awake
with Docker running. A question asked while it is not waits (the page says the Workspace service is
offline, and Stop works on a waiting question) and is answered when the service is back.

## Definition of done

**SOP gates**

- [ ] `web/`: `npm run typecheck`, `npx eslint . --max-warnings 0`, `npm run build`, `npx vitest run`
      and `npm run test:coverage` (the 83 % line floor of `web/vitest.config.mts`) all exit 0; test
      count not below `main`'s at the cut (both numbers, read in the worktree, in 102a).
- [ ] `workspace/`: `npm run typecheck`, `npx vitest run` green; line coverage of `src/` ≥ 80 %.
- [ ] `mcp-server/`: `npx vitest run` green (its code is unchanged: `mcp-server/Dockerfile` and
      `mcp-server/src` stay as they are; the workspace image's materials stage builds from
      `mcp-server/`). `desktop/` is untouched: `git diff --stat origin/main...HEAD -- desktop` prints
      nothing.
- [ ] SQL: `node scripts/db-test.mjs --only <file>` prints `PASS` and exits 0 for each of the three
      `phase21_*` units, and the whole suite (`node scripts/db-test.mjs`) ends `failed 0`; 140–142
      dry-run in `begin … rollback`, applied under the file's name, byte-identical. Unit 141 has two
      labelled forms, so the suite on `main` stays green on any day: with a partition of
      `realtime.messages` covering `now()` it runs the send-and-receive half and its last row reads
      `phase21_141 send and receive: PASS`; with none it runs only the policy half and its last row
      reads `phase21_141 policy only (no partition today): PASS`. This gate needs the full form once
      (task 3 (a) and task 17), run by the PM inside the window after the spike. The Runner prints
      only `PASS  <file>`, never a unit's last row, so what shows which form ran is the unit's own
      partition test. W-63 writes the unit's partition test as one standalone `select` that returns
      true or false, the same expression its branch uses, and puts that `select` in a comment at the
      top of the unit. Inside the window after the spike the PM runs exactly that `select` through
      `execute_sql` immediately before the Runner, expects true, and pastes both (the `select`'s
      result and the Runner's PASS line) into 102a beside task 5's (b0) partition count.
- [ ] RED first: every task's named test file was committed failing before its code, and the red run
      is quoted in the worker's section of 102a (tasks 1, 5, 6a, 13 and 17–26 are checks, not code;
      task 12's image has one test, `docker/grep-clean.test.mjs`, whose new `workspace` entry is
      committed failing before the Dockerfile exists; the rest is proven by its docker checks).
- [ ] `/code-review main high` on both PRs: CRITICAL and HIGH cleared.
- [ ] `/security-review` (required: a new database role, RLS on `realtime.messages`, secrets, the
      firewall, the tool gate, a new queue path). The request names two things outright: the two
      write-capable credentials inside the container (the bb2dash service key, read by the materials
      MCP server, and the harness store's DSN, read by the rag MCP server; Stack accepted both for v1
      on 2026-10-05), and what PUBLIC holds on pg_net's schema (`net.http_post` and its two tables),
      which `workspace_runner` reaches like every other login. It also asks the reviewer to read two
      clauses of `docker/workspace/init-firewall.sh` that no check exercises: IPv6 closed, and a DSN
      host that does not end `.pooler.supabase.com` fails closed.
- [ ] Both reviews recorded in 102a under the headings `## /code-review main high` and
      `## /security-review`, each covering both PRs with one findings table whose columns are
      `| id | severity | status |` (status `open`, `fixed` or `declined by Stack`); task 23 greps them.
- [ ] STATUS (its "Known issues" gains the measured top-bar widths), DECISIONS, ORCHESTRATOR and root
      `CLAUDE.md` (a project fact: the Workspace exists and is read-only) updated in the bb2dash PR;
      `DATA_SYNTAX.md` has the `## Workspace (migrations 140-142)` section.
- [ ] Both PRs open, bb2dash and bb2dash-stack, opened together at task 25; the bb2dash branch has a
      Vercel preview, walked logged in; merge only on Stack's word, bb2dash first. Beside the two:
      task 6a's one-line, test-only PR to `main` (merged on his word the day 142 is applied) and the
      docs-only acceptance record after acceptance step 15.
- [ ] Every row of §Task list passes its check; evidence in `102a_PHASE21_VERIFICATION.md`. A live
      check stopped by `usage_limit` is logged there as blocked by the plan limit and re-run after the
      reset; it is not a failed row.

**Stack's acceptance script** (15 steps in two parts; after Phase 14's acceptance; his laptop)

The order is Stack's answer of 2026-10-05 (DECISIONS, "Phase 21 · acceptance is walked in two parts,
15 steps"): part A before the merge, part B on `main` right after it. Steps 5, 6 and 10 are the PM's
additions of the same day (PM wording; Stack did not object): a document pull, a middle-tier question
and the proof that no API key is present.

**Part A, before the merge**, on the branch preview, with the PM's test container running as its own
compose project (`bb2dash-wt21`). Before it the PM archives its own walk conversations as the owner,
so `select count(*) from workspace_conversations where not archived` → 1 (task 5's 'spike') and the
list Stack opens is the one this script describes; and reads `/usage` and writes the session and
weekly percentages into 102a. A walk, and any `just up`, starts only when today's `sync` request is
`done`. Immediately before it the PM reads the last 24 hours of `agent_requests` and waits out any
`sync` row that is `queued` or `claimed` and any row of another kind that is `claimed`. A `queued`
`inbox_feedback` row is not waited on (only `/inbox-apply` on the host closes one): its id goes into
102a, and a walk during which it is applied is repeated.

1. He confirms Usage credits are still off (claude.ai, Settings, Usage; his answer goes into 102a),
   and that he ran task 19's snippet: the one `alter role workspace_runner with password '…';` line
   pasted into the Supabase SQL editor, and the secret `workspace_runner_db_url` stored in
   `SECRETS_DIR` (`C:/Users/stack/.bb2dash-secrets/`). The password is never in a chat, a repo or a
   tracked file.
2. Open **Workspace** from the top bar on the preview in the browser, then in the temporary second
   desktop window the PM starts for him, never by editing `%APPDATA%\bb2dash\config.json` or
   quitting his running app. That window is started with `BB2DASH_APP_URL` (a local `next start` of
   the branch), `BB2DASH_SUPABASE_URL` and `BB2DASH_SUPABASE_ANON_KEY` (public values, set in that
   shell and never printed) and `BB2DASH_SYNC_DRY_RUN=1`, with its own `--user-data-dir`. He signs
   in once in that window.
3. Ask "What does the IST.323 syllabus say about late work?": the answer streams in, the badge reads
   Haiku, the "Used:" line names `search_materials`, and the answer names the file it read.
4. Ask "What did I decide about ECN.304 Quiz 2?": Haiku, and the "Used:" line names
   `search_context · bb2dash-inbox-decisions` (the store held decisions 434 and 528 on it on
   2026-09-24 and again on 2026-10-05).
5. Ask "Open the IST.323 syllabus and list its section headings": Haiku, and the "Used:" line names
   `get_material_text`.
6. Ask "Explain how a systems analyst's role differs from a project manager's, using the IST.352
   slides": the badge reads "Sonnet · standard".
7. Ask "Draft a two-week study plan for ECN.304 from the lecture slides": the badge reads Opus.
8. Ask it again and press **Stop** part-way: the answer ends and says it was stopped.
9. Ask a third time and reload the page mid-answer: after the reload the finished answer is there
   (until it is finished, the reloaded page shows the line "Answering…", PM wording, in place of the
   half-written text).
10. The PM shows that no API key is present: `printenv ANTHROPIC_API_KEY` exits 1 inside the test
    container, and 102a holds the credential source the CLI reported for the last turn of his walk
    (step 9), read from the test container's log.
11. The PM shows task 20's before and after numbers: nothing on his planner or progress changed.
12. He reads the D-1 reversal row and the preview-walk row and says "merge" (or names changes).

**Part B, on `main`, right after the merge**: both PRs merged, bb2dash first, and both main checkouts
pulled. Before step 13 the PM stops the test container (project `bb2dash-wt21`), so only one runner
answers on `main`; it is removed after step 15. Chats from part A stay in his list and continue
from their last 20 stored messages, because the test container kept its transcripts in its own
volume.

13. He adds `COMPOSE_PROFILES=workspace` to bb2dash-stack's `.env` (the file is gitignored, so no PR
    carries the line). `just up` starts only when today's `sync` request is `done`: immediately
    before it the PM reads the last 24 hours of `agent_requests` and waits out any `sync` row that
    is `queued` or `claimed` and any row of another kind that is `claimed`. A `queued`
    `inbox_feedback` row is not waited on (only `/inbox-apply` on the host closes one): its id goes
    into 102a. Then `just up`; `just doctor`: the Workspace row is green (the row, not the exit
    code: `just doctor` exits 1 today for two reasons that are not container faults, DECISIONS
    2026-10-05, "Phase 14 acceptance: A2 passed").
14. `docker compose stop workspace` (from bb2dash-stack): within three minutes the page says the
    Workspace service is offline; `just up` (after the same read and wait as step 13: today's
    `sync` request is `done`, no `sync` row is `queued` or `claimed`, no row of another kind is
    `claimed`, and a `queued` `inbox_feedback` row is not waited on): it is back, and one question
    asked on the live site is answered.
15. The PM archives task 5's 'spike' conversation and its own walk conversations as the owner, the
    way task 5 created the first (`update public.workspace_conversations set archived = true where
    title = 'spike'` under `set local role authenticated` with his JWT claims, committed; the same
    statement by `id` for any walk conversation of its own still listed), then
    `select count(*) from workspace_conversations where title = 'spike' and archived` → 1 and
    `select count(*) from workspace_conversations where title = 'spike' and not archived` → 0. He
    says "accepted".

After step 15 the PM removes the test project's leftovers: the `bb2dash-wt21` container, its
network and `bb2dash-wt21_workspace-claude-home` (named resources only; never a project-wide `down`
against `bb2dash`).

The bb2dash PR carries a "Phase 21: preview walk" DECISIONS row before the merge. The "Phase 21
accepted" row is written after step 15 in a docs-only PR (PR #76's precedent for Phase 14), and
task 26's grep is run on that branch. Every docker line of the script is kept in 102a as one
paste-ready line; if the PM session's docker commands are refused, Stack runs the line himself, in
Git Bash.

**What proves each requirement**

- S2-workspace-1: acceptance steps 2–12 and 14, his "accepted" at step 15, task 22's screenshots,
  task 24's D-1 reversal row. The "nothing costs API credits" half of the MVP line rests on steps 1
  and 10: Usage credits off (his answer in 102a), no API key in the container, and the credential
  source the CLI reported for the last turn.
- P-83: task 7 green (its fixture asserts that acceptance steps 3, 4 and 5 route `low`, step 6 `mid`
  and step 7 `high`), task 19's stored tier `low` for the lookup, screenshot 05 (Opus), and
  acceptance step 6's "Sonnet · standard" badge for the middle tier.
- P-84: tasks 8 and 9 green; the two stubs type-check and refuse with `provider_not_configured`. The
  seam is proven by task 8's test: `TIER_ROUTES` stays a code constant, and no acceptance step shows
  the not-connected sentence.
- P-85: tasks 6, 9, 11, 12, 14, 19 and 21 green: `workspace_runner` executes exactly the five
  `workspace_*` DEFINER RPCs (task 6), a failed turn is stored under one of the eight error codes
  (tasks 9 and 11), and task 12's token smoke answers on the setup-token inside the container; one
  live turn stored with its tier, model and session id. Its `workspace_reader` half is not built in
  v1 (O-4, answered 2026-10-05).
- P-86: tasks 2, 15 and 16 green; a stranger uid reads 0 rows from all four tables.
- P-87: tasks 3 and 4 green, task 3's unit once in its full form (W-63 writes the unit's partition
  test as one standalone `select` that returns true or false, the same expression its branch uses,
  and puts that `select` in a comment at the top of the unit; inside the window after the spike the
  PM runs exactly that `select` through `execute_sql` immediately before the Runner, expects true,
  and pastes both, the `select`'s result and the Runner's PASS line, into 102a beside task 5's (b0)
  partition count), and task 5's partition and
  delivery checks, stored message, cold-start reading and spike
  screenshot before the transport is frozen; task 16's stream rendering.
- P-88: task 6's negative grants (in schema `public` the role holds no table privilege and executes
  only its five functions), task 10's gate with its two checks beyond the unit test (task 12 runs the
  hook's own command inside the container and gets exit 2 for a collection off the list; the runner
  ends a turn as `cli_error` when a tool call other than `EndConversation` carries no gate response,
  task 11), task 12's checks of
  the container's own egress and of the non-root user, tasks 13, 18 and 23 at zero findings.

## Task loops

| # | loop | executable check | owner |
|---|---|---|---|
| 1 | Seam gate (task 1), then O-1..O-5 and the B-5 (h) re-read (Usage credits) to Stack in one message; the Contract frozen with his answers on 2026-10-05 (the transport after task 5, the argv after task 9's first recording), each answer in a DECISIONS row dated the day he gives it | task 1's counts; distinct O ids in DECISIONS: `grep -oE "(^\|[^A-Za-z0-9-])O-[1-5]([^0-9]\|$)" project-state/DECISIONS.md \| grep -oE "O-[1-5]" \| sort -u \| wc -l` → 5 (0 at the cut; B-5 was answered 2026-09-27 and gets no new row beyond the 2026-10-05 re-read row) | PM + Stack |
| 2 | Cut `feat/workspace-21` as `bb2dash-wt-21` (cut 2026-10-05 from `origin/main` 06e046b; every "at the cut" value is read in that worktree at the cut's commit, a grep count as `git show 06e046b:<path> \| grep -c …`, and written into 102a), then one Opus worker per stream in its own worktree (§Workers); the PM copies `.env.local` from the main checkout into `bb2dash-wt-21` and `bb2dash-wt-21-db` and runs `npm --prefix scripts ci` in each (the Runner's connection string and its `pg`), and workers never copy it. For the walks the PM also copies `.env.testing` from the main checkout into `bb2dash-wt-21` (the test login `web/e2e/login.mjs` reads), and writes `web/.env.local` there with the two public values `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, the same values the Vercel project uses; the file is gitignored), for the local `next start` of acceptance step 2 and `08-desktop.png` | in bb2dash `git worktree list \| grep -c "feat/workspace-21"` → 5 (the PM's and W-63..W-66's branches); in bb2dash-stack the same command → 1 (W-65's); in `bb2dash-wt-21` and in `bb2dash-wt-21-db` `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner` | PM |
| 3 | Per task: the named test committed failing (RED) → code → green → the worker's 102a section → the PM re-runs the row's check; a row that fails goes back to its worker | the row's own check, run by the PM | workers + PM |
| 4 | Realtime spike (task 5) before W-66 builds the screen on the transport (task 16) | task 5's checks: (b0), then (b) and (c) | PM, in Stack's preview |
| 4a | Argv gate: task 9's first recording (the lookup) before the argv is frozen. W-64 finalises task 8's argv test only after it; if any element does not behave there as the Contract's argv describes, W-64 stops and reports, and the PM corrects the Contract first | task 9's assertions on the lookup fixture (the init-line facts; a hook response for each tool call) | W-64 + PM |
| 4b | The port PR (task 6a) the day 142 is applied: W-63 applies 142 only when the PM says that PR is ready, and it merges on Stack's word that day | task 6a's checks | PM + W-63; Stack's merge word |
| 4c | Branch flow for the image: after task 11 the PM merges `feat/workspace-21-runner` into `feat/workspace-21`; W-65 merges the phase branch into `feat/workspace-21-container` before any docker check; task 12 runs in `bb2dash-wt-21-container`, the walks (tasks 19–22) in `bb2dash-wt-21` after integration; only one tree at a time runs the test container | in `bb2dash-wt-21-container`, before the first docker check: `git merge-base --is-ancestor feat/workspace-21-runner HEAD; echo $?` → 0 | PM + W-65 |
| 5 | Integrate, regenerate types, full suites, advisors | tasks 17 and 18 | PM |
| 6 | PM walk, live checks, reviews, docs, both PRs with the preview | tasks 19–25 | PM |
| 7 | Stack's acceptance walk in two parts: part A (steps 1–12) before the merge, on the branch preview with the PM's test container; his merge word; part B (steps 13–15) on `main` right after it; the "Phase 21 accepted" row follows step 15 in a docs-only PR | task 26 | Stack |

## Task list

Paths are from the bb2dash repo root unless a row says bb2dash-stack. "Runner on `<file>`" in a check
means Phase 15's `node scripts/db-test.mjs --only <file>`, and "→ PASS" means it prints `PASS  <file>`,
its last line reads `db-test: passed 1, failed 0, units 1`, and it exits 0 (brief 95's frozen output).
"The three standing units" in a check means the Runner on `phase12b_076_rls_initplan_and_truncate.sql`,
`phase15_100_db_test_runner_role.sql` and `phase15_101_search_path_pin.sql`, each → PASS: W-63 runs them
after every apply of 140, 141 or 142, because all three read the new objects.
Order: 1 → (2, 3's policy count, 6a's PR ready, 6 ∥ 7, 10, 8, 9, 11 ∥ 4, 15) → 5 (once 140–141 are
applied and W-66's task 4 skeleton is on the phase branch's preview) → (16 ∥ 3's full form (142
applied; run by the PM inside the window after the spike), then the runner branch merged into the
phase branch after task 11, and the phase branch into W-65's (task loop 4c) → 12 (after Stack has run
the password snippet, task 19's first half) → 13, 14) → 17, 18 → task 22's `02-empty.png` (the walk's
first shot, before any live turn of tasks 19–21) → the rest of 22 with 19–21 → 23–25 → 26 (part A,
the merge, part B). Task 6a's PR is ready before W-63 applies 142 (task 6) and merges on Stack's word
that day. W-64's own order is 7, 10, 8, 9, 11: the gate must exist before the recordings, and the
recordings freeze the argv. Tasks 7–11 run in parallel with 2–6 (disjoint files). Task 16 waits only
on the spike (task loop 4), not on the image.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | Seam gate: Phase 14's and Phase 15's objects are on `main` (names as briefs 100 and 95 freeze them) | S2-workspace-1 | PM | (d) in bb2dash `git ls-files compose.yaml mcp-server/Dockerfile mcp-server/src/env-file.ts \| wc -l` → 3; in bb2dash-stack `git ls-files secrets.example/claude_oauth_token secrets.example/bb2dash_mcp_service_key secrets.example/harness_database_url doctor/doctor.mjs justfile \| wc -l` → 5; (b) `select count(*) from pg_roles where rolname in ('sync_runner', 'db_test_runner')` → 2; (d) `node scripts/db-test.mjs --ping` → `db-test: connected as db_test_runner` (run where `.env.local` and the Runner's `pg` are in place: the main checkout, or `bb2dash-wt-21` after task loop 2's copy). The bb2dash half is read in `bb2dash-wt-21` at the cut (2026-10-05, `origin/main` 06e046b); the first three read 3, 5 and 2 that day, and the values are in 102a | "Phase 14's container, secrets and MCP image were in place before any Workspace code" |
| 2 | Migration 140: tables, owner RLS, `workspace_ask` / `workspace_cancel`, the status view, the `db_test_runner` grants; the `DATA_SYNTAX.md` section | P-86 | W-63 | (a) Runner on `phase21_140_workspace_tables.sql` → PASS (ask creates 3 rows; a 2nd open request is refused with SQLSTATE 23505; an owner insert of `role = 'assistant'` is refused; an owner update to `done` is refused; an owner update of `claude_session_id` raises 42501, while an owner update of `title` or `archived` succeeds; cancel queued → true, cancel done → false; empty text and 8001 characters are each refused with 22023; each new check constraint refuses its bad value: a `claude_session_id` that is not uuid-shaped, an `error_code` off the eight on `workspace_messages` or on `workspace_requests`, a `tool_calls` value that is not an array or holds 21 elements, a direct insert of an 8001-character user message; `v_workspace_status` returns exactly one row, with `polled_at` and `runner` null, once the unit has deleted the heartbeat row inside its transaction (on prod the row always exists from task 12 on); a stranger uid reads 0 rows from each table; `anon` holds no grant, read with `has_table_privilege` and `has_any_column_privilege`; `authenticated` holds `select` and only its column-level writes (the first column-level grants in this repo), read with `has_column_privilege`; `anon` executes none of the three functions and `service_role` only `workspace_prompt_max()`, read with `has_function_privilege`; no TRUNCATE); after the apply the three standing units → PASS; (b) after apply `select count(*) from pg_class where relname in ('workspace_conversations','workspace_messages','workspace_requests','workspace_runner_heartbeat') and relrowsecurity` → 4; `select count(*) from pg_indexes where tablename = 'workspace_messages' and indexdef ~ '\((parent_message_id\|request_id)'` → 2; `select count(*) from pg_indexes where tablename = 'workspace_requests' and indexdef ~ '\((conversation_id\|user_message_id)\)$'` → 2 (the two plain indexes; the partial `workspace_requests_one_open` ends in its `WHERE` clause and is not counted); `select count(*) from pg_constraint where contype = 'f' and conrelid in ('public.workspace_messages'::regclass, 'public.workspace_requests'::regclass)` → 5 (three on messages, two on requests); (d) `grep -c "workspace_messages" DATA_SYNTAX.md` at least 1 (0 at the cut) and `grep -c "^## Workspace (migrations 140-142)$" DATA_SYNTAX.md` → 1, the section sitting before `## Seed state (2026-09-02)`: `grep -n -E "^## (Workspace \(migrations 140-142\)\|Seed state)" DATA_SYNTAX.md` → two lines, the Workspace line first | "My conversations are stored where only I can read them" |
| 3 | Migration 141: the receive-only Realtime policy | P-87 | W-63 | (b) right after apply: `select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'` → 1 (0 on 2026-09-24), and the three standing units → PASS; (a) Runner on `phase21_141_workspace_realtime.sql` → PASS, in one of two labelled forms. The unit reads from the catalogs by name (`pg_inherits`, `pg_class`, `pg_namespace`; never `::regclass`, since `db_test_runner` has no USAGE on schema `realtime`) whether a partition of `realtime.messages` covers `now()`. In both forms it runs the policy half (exactly one policy, `workspace_owner_receive`, for SELECT to `authenticated`, naming `app_owner`, `extension = 'broadcast'` and `realtime.topic()`; no INSERT, UPDATE, DELETE or ALL policy). With a partition it also runs the send-and-receive half (a `workspace_stream()` call under `set local role workspace_runner` to `workspace:<uuid>` is readable as the owner with `realtime.topic` set to that topic; 0 rows for a stranger uid, 0 for topic `other:x`, 0 for `anon`; a `realtime.send` made as `authenticated` stores 0 rows; every read of `realtime.messages` runs under `set local role authenticated` or `anon`, with `realtime.topic` set explicitly before it, since a send leaves it set) and its last row reads `phase21_141 send and receive: PASS`; with none it runs only the policy half and its last row reads `phase21_141 policy only (no partition today): PASS`. This row requires the full form once: once 142 is applied, the PM runs it inside the window after the spike (task 5). The Runner prints only `PASS`, never a unit's last row, so what shows which form ran is the unit's own partition test: W-63 writes the unit's partition test as one standalone `select` that returns true or false, the same expression its branch uses, and puts that `select` in a comment at the top of the unit; inside the window after the spike the PM runs exactly that `select` through `execute_sql` immediately before the Runner, expects true, and pastes both (the `select`'s result and the Runner's PASS line) into 102a beside task 5's (b0) partition count. Until 142 is applied the unit can pass only in its policy-only form (the send-and-receive half needs 142's function and role), so W-63's first run is made before anyone opens the preview's `/workspace`; a run between the first join and 142's apply fails and is not a verdict. The suite on `main` stays green on any day | "Only I can receive a Workspace stream" |
| 4 | Stream hook and the route skeleton (`/workspace?c=` shows streamed text) | P-87 | W-66 | (a) `cd web; npx vitest run test/use-workspace-stream.test.tsx` → 0 failed (channel opened with `private: true` after `setAuth`; the page always holds exactly one private channel, `workspace:<uuid>` when `?c=` is a uuid, else `workspace:lobby`; deltas render only as a contiguous run from seq 1: seq 3,1,2 renders in order, and a gap inside a stream holds later text back until the missing seq arrives or `done`; a stream whose lowest received seq is not 1 renders no partial text, only the line "Answering…", until `done` or the next refetch brings the stored row; a repeated seq is dropped; another `request_id` is ignored; the payload's extra `id` key, which `realtime.send` adds, and any other unknown key are ignored; `done` invalidates the messages key; unsubscribe on unmount); (d) `cd web; npx eslint . --max-warnings 0` → exit 0 | "The page shows an answer while it is being written" |
| 5 | **Realtime spike (gate)**: 140–141 applied, the branch preview up with W-66's task 4 skeleton on it, Stack logged in to it on the branch alias (not a per-deployment address, so a push does not sign him out); then the PM creates one conversation and one queued request as the owner with one `execute_sql` call (`begin; select set_config('request.jwt.claims', json_build_object('sub', public.app_owner(), 'role', 'authenticated')::text, true); set local role authenticated; select public.workspace_ask(null, 'spike'); commit;`; no runner is up, so it stays `queued`) and reads the ids with a second call (`select r.id, r.conversation_id from public.workspace_requests r order by r.id desc limit 1`; `execute_sql` returns only its last statement), opens `/workspace?c=<its conversation_id>` in Stack's own logged-in preview tab (with two Chrome browsers connected, the PM first confirms which one is his), waits until this row's (b0) passes, and only then sends `select realtime.send(jsonb_build_object('request_id', <its request_id>, 'seq', 1, 'delta', 'spike-ok 1'), 'delta', 'workspace:<its conversation_id>', true)`; only after the screenshot of `spike-ok 1` and the `realtime.messages` count in this row's check are taken does the PM cancel the request, with `select public.workspace_cancel(<its request_id>)` in the same `begin … commit` wrapper, under the same role and claims (cancelling first can move the page to the stopped state and clear the streamed text). The PM writes into 102a a cold-start reading (the join, then the seconds until a send is delivered) and the partition's name and bound, so W-63 can fix the 141 unit's predicate. At the same sitting Stack may switch off Realtime "Allow public access" in the dashboard (optional; its own DECISIONS row if he does). The 'spike' conversation stays until acceptance step 15 archives it | P-87 | PM, in Stack's logged-in preview | (b0) after the page is open and before the send, read as `postgres`: `select count(*) from pg_inherits i join pg_class c on c.oid = i.inhrelid where i.inhparent = 'realtime.messages'::regclass and c.relname = 'messages_' \|\| to_char((now() at time zone 'utc')::date, 'YYYY_MM_DD')` → 1 (today's partition; 0 partitions of any day on 2026-10-05) and `select count(*) from pg_replication_slots where slot_name like 'supabase_realtime_messages_replication_slot%' and active` → 1 (0 slots on 2026-10-05); a failed (b0) is retried, since Realtime starts its replication up to about 30 s after the join, and is not a verdict on the transport; (b) after the send: `select count(*) from realtime.messages where topic = 'workspace:<its conversation_id>'` → 1; (c) `docs/planning/sprint-2/walks/walk-21/01-realtime-spike.png`: `/workspace?c=<its conversation_id>` on the preview, logged in, the stream area reading `spike-ok 1` and the page's Network panel shows no document request after the send. If (b) or (c) fails after (b0) has passed: stop, re-plan the transport as polling only, and write the DECISIONS row that says so | "Text appeared on the Workspace page without a reload" |
| 6 | Migration 142: `workspace_runner`, its one member `db_test_runner`, and the five DEFINER RPCs; W-63 applies it only when the PM says task 6a's PR is ready | P-85, P-88 | W-63 | (a) Runner on `phase21_142_workspace_runner.sql` → PASS (claim takes the oldest queued, whatever its age: a `queued` request does not expire; a second claim with nothing queued returns 0 rows; both asserted after the unit has removed every other `queued` or `claimed` request inside its transaction, since on prod a real question can sit `queued`; the claim's `history` holds up to 20 messages of the conversation that come before the request's user message, oldest first, as `[{role, content}]`, never the request's own user message (it is `prompt`), and is `[]` for a first question; a claim older than 10 min is swept to `stale_claim`; claim does not stamp the heartbeat; `workspace_heartbeat` upserts the one heartbeat row: called twice it leaves exactly one row, and `v_workspace_status` then shows a `polled_at` that is not null and the runner's name; begin refuses an unclaimed request; stream is false after cancel, true while claimed, and raises 22023 for a delta over 16000 characters; a stream call with an empty delta stores no row in `realtime.messages` and returns the state (true while claimed, false after cancel); finish stores content (cut with `left(p_content, 100000)`), tool calls (a `p_tool_calls` value of the Contract's shape: `tool`, `query`, `scope`, `ok`; a `p_tool_calls` array of 21 elements is stored cut to its first 20, never raising) and session id, and stores null for a session id that is not uuid-shaped, never raising on it; finish with a non-null `p_model` stores it over the alias `workspace_begin` wrote, and with null keeps the alias; after finish with `failed` and `timeout`, the request row and the message both hold `timeout` and the request's `finished_at` is set; finish keeps a cancelled request cancelled; under `set local role workspace_runner`, `select` on `assignment_progress`, `reading_progress`, `workspace_messages`, `agent_requests` each raises 42501, 4 of 4; every `returns table` column of `workspace_claim` is aliased, or the unit's claim call raises 42702; the unit's privilege assertions use `has_table_privilege`, `has_function_privilege` and `pg_auth_members`, never `information_schema`, which lists enabled roles only; an `execute_sql` dry run of this unit or of the 141 unit adds, inside its transaction, `grant workspace_runner to postgres with inherit false, set true`, since `postgres` cannot `set role` into a runner role otherwise); Runner on `phase15_100_db_test_runner_role.sql` → PASS, its membership literal now the four names `anon`, `authenticated`, `sync_runner`, `workspace_runner` (each `inherit=f, set=t`), and the other two standing units → PASS; (b) read as `postgres` through `execute_sql`, in the `has_*` forms (they also see a grant made by another grantor, which `information_schema` hides): `select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m','f') and has_table_privilege('workspace_runner', c.oid, 'select, insert, update, delete, truncate, references, trigger')` → 0; `select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('workspace_runner', p.oid, 'execute')` → 5; `select has_function_privilege('authenticated', 'public.workspace_claim(text)', 'execute')` → false; `select has_function_privilege('service_role', 'public.workspace_claim(text)', 'execute')` → false. These read schema `public`; what PUBLIC holds on pg_net's schema (`net.http_post` and its two tables) is the same for every login, `sync_runner` included, and is named in the `workspace_runner` DECISIONS row | "The Workspace runner's own database login cannot read my planner or my progress" |
| 6a | The port PR: the day 142 is applied, the PM opens a one-line, test-only PR to `main` that carries the membership line of `db/tests/phase15_100_db_test_runner_role.sql`, byte-identical to the phase branch's file (PR #65's precedent for 094). W-63 applies 142 only when the PM says that PR is ready, and it merges on Stack's word that day. Its own DECISIONS row (a second exception to "each in its own PR") | P-85 | PM; merged on Stack's word | (d) `gh pr diff <n> --name-only` → `db/tests/phase15_100_db_test_runner_role.sql` and nothing else; (a) once 142 is applied and the PR is merged and pulled, from the main checkout: `node scripts/db-test.mjs --only phase15_100_db_test_runner_role.sql` → PASS (the PR's own run is red until 142 is live, since it expects four names while prod has three, so the check is run after the apply) | "The Workspace's new database login did not leave the tests on `main` failing" |
| 7 | Package scaffold (`package.json`, lockfile, `tsconfig.json`, `vitest.config.ts`, a short `README.md` saying what the runner is and how to run its tests), router and tier map | P-83 | W-64 | (a) `cd workspace; npx vitest run test/router.test.ts` → 0 failed over `test/fixtures/router-cases.json` (the test itself asserts at least 30 cases, at least 8 per tier, at least 6 follow-ups, and that acceptance steps 3–7's five questions route `low`, `low`, `low`, `mid`, `high`) | "A lookup got Haiku; a drafting request got Opus" |
| 8 | Provider seam and the argv (frozen after task 9's first recording); `workspace/prompts/system.md` is written here, before task 9's recordings, since the argv carries it (task 11 still owns its test) | P-84 | W-64 | (a) `cd workspace; npx vitest run test/providers.test.ts test/claude-argv.test.ts` → 0 failed (argv equals the Contract list, element for element, on both forms; a fresh start passes `--session-id` with a new random uuid, never the conversation's id, and every later turn passes `--resume <claude_session_id>`; a stored session id that is not uuid-shaped is never put in argv: a fresh start with replay instead; `--permission-mode dontAsk` is passed on both forms; `--disallowedTools` carries seven names, `mcp__rag__get_document` among them; `--setting-sources project`, `--system-prompt-snapshot off` and `--include-hook-events` are present; the prompt is the last element, after `--`, including a prompt that begins `--model`; the two stubs throw `ProviderNotConfiguredError`). The test is finalised only after task 9's first recording, the argv's gate (task loop 4a); (d) `grep -rn -- "--bare" workspace/src \| wc -l` → 0; `grep -rn "claude-agent-sdk" workspace/src workspace/package.json web/src web/package.json \| wc -l` → 0 | "The local and frontier providers exist and say they are not connected" |
| 9 | Record four live fixtures on the host (Stack's subscription, allowed since his 2026-10-05 answer), scrub them, then the stream parser | P-84, P-85 | W-64 | (a) `cd workspace; npx vitest run test/stream-json.test.ts` → 0 failed over `claude-stream-lookup.jsonl` (acceptance step 3's question; deltas of the last assistant message join to the recorded final text; the `tool_calls` value built from it has the Contract's shape, with `ok: true` on its `search_materials` call; its `system/init` line shows `claude_code_version` equal to the pin, the OAuth token as the credential source (the value this recording shows for a `/login` or setup-token session, never `ANTHROPIC_API_KEY`, `apiKeyHelper` or a managed key), `permissionMode` `dontAsk`, `mcp_servers` exactly `bb2dash` and `rag`, both connected, and `tools` holding the four allowed MCP names and no `ToolSearch` (whether `mcp__rag__get_document` is listed is recorded, not asserted), the field names following the recording; each `tool_use` has a PreToolUse hook response with exit code 0), `claude-stream-budget-stop.jsonl` (the same question recorded with `--max-budget-usd 0.01`, so its tool call forces a second model call; the result subtype `error_max_budget_usd` maps to `budget_exceeded`), `claude-stream-resume-missing.jsonl` (a `--resume` of a random uuid, recorded as stdout, stderr and exit code, with the sibling `claude-stream-resume-missing.stderr.txt`; where the exit code is kept is W-64's choice, and it names the file in its verification section; it spends no model turn; the rule tested on it: a `--resume` start that exits non-zero before any `assistant` message is retried once as a fresh start with replay) and `claude-stream-sign-in-expired.jsonl` (recorded with a deliberately bad `CLAUDE_CODE_OAUTH_TOKEN`, with a `.stderr.txt` sibling if the CLI writes its message there; it spends no model turn; maps to `sign_in_expired`); a tool result that is an error, or that never arrives, gives `ok: false`; the same test asserts every tool-result body in the recorded files is the literal `<scrubbed>`, so no course material enters git, and that no host path remains (the scrub also rewrites the init line's `cwd` and any host inventory it lists, `slash_commands`, `skills`, `plugins`, `agents`, to `<scrubbed>`); every test that reads a recorded `system/init` line asserts `claude_code_version` equals the pin. `workspace/test/fixtures/synthetic-rate-limit.json` is named synthetic and stands outside this "recorded live" assertion (task 11). Recorded from an empty directory outside every repo, on the pinned CLI version (2.1.289, through `npx -y @anthropic-ai/claude-code@2.1.289`: the host's `claude --version` has read 2.1.290 since the evening of 2026-10-05, after the audit), with no inherited `CLAUDE*` or `ANTHROPIC*` variable in the shell and `ENABLE_TOOL_SEARCH=false` set as the service sets it, with the full frozen argv and two substitutions only: `--mcp-config <a temp JSON outside the repo holding the host's two user-scope registrations, which carry paths and no key>` and `--settings <a temp copy of workspace/claude/settings.json whose hook command names the worktree's built tool-gate.js>`; `workspace/prompts/system.md` is an argv element, so it is written before the first recording (W-64 writes it with task 8; task 11 still owns its test). One paste-ready line per fixture in 102a, so Stack can run it from a plain terminal if the worker's session refuses a nested `claude -p`; 102a also records the credential-source value the init line reports, where the stream names the full model id, and whether the lookup recording carries a rate-limit event and which overage fields (`overageStatus`, `overageDisabledReason`, `isUsingOverage`). The lookup is the first recording and the argv's gate (task loop 4a). `BUDGET_CAP_HOLDS` is set false only if the budget run ends `success` with two or more turns and a cost above the cap; the row then still passes under O-2's default, with the fixture asserted as a finished answer with no error code, 102a says which form was recorded, and the PM tells Stack the same day | "A real answer was recorded once and replays in the tests" |
| 10 | Tool gate hook | P-88 | W-64 | (a) `cd workspace; npx vitest run test/tool-gate.test.ts` → 0 failed (allows the four MCP tools; denies Bash, Read, Write, Edit, WebFetch, WebSearch, Task, any `mcp__supabase*`, `mcp__rag__get_document`; denies `search_context` with no collection or one off `RAG_COLLECTIONS`, the reason reading `collection must be one of: bb2dash, bb2dash-inbox-decisions`; `collection` is compared exactly, so `Bb2dash`, ` bb2dash` and `bb2dash ` are denied; allows `bb2dash` and `bb2dash-inbox-decisions`; run as a process, the built gate only denies or stays silent: a deny is exit code 2 with the reason on stderr; an allowed call exits 0 with empty stdout and never prints `permissionDecision: "allow"`; unreadable or non-JSON stdin, a missing `tool_name`, a `collection` that is not a string (an array, a number, null) and any thrown error each exit 2, never 1; `workspace/claude/settings.json` wires exactly one `PreToolUse` command hook, matcher all tools, command `node /app/workspace/dist/hooks/tool-gate.js`, `"timeout": 600`) | "The assistant can use only the four read tools" |
| 11 | Runner loop, MCP config, key guard, system prompt (its test; W-64 writes `workspace/prompts/system.md` with task 8, before task 9's recordings), healthcheck | P-85, P-88 | W-64 | (a) `cd workspace; npx vitest run test/runner.test.ts test/mcp-config.test.ts test/config.test.ts` → 0 failed (claim → route → begin → deltas flushed every 250 ms, `seq` starting at 1 and rising by 1 per flush, a delta over 16000 characters split first → finish, the content cut to 100000 characters first and the cut logged; the stored `tool_calls` has the Contract's shape: at most 20 elements (the first 20 calls, in call order), failed and denied calls included, `query` cut at 200 characters, `ok` false for a denied, failed or unanswered call; a turn with 21 tool calls stores 20, logs the cut and still finishes `done`; the runner passes the model id the stream names to `workspace_finish` as `p_model`, and null when the stream names none; `cost_usd` is the stream's `total_cost_usd` as reported, never summed; Stop kills the child within 2 s and stores `cancelled`; Stop during a tool call (no deltas) kills the child within 4 s: while a turn runs and no text was flushed in the last 2 s (`CANCEL_POLL_MS = 2000`) the runner calls `workspace_stream` with an empty delta, which sends nothing and consumes no `seq`; 8 min stores `timeout`; `workspace_heartbeat` is called every 30 s (`HEARTBEAT_MS = 30000`) on its own timer, during a turn too, and each success touches `/run/workspace/alive`; the healthcheck passes while that file's mtime is under 90 s old and fails when it is older or missing; with no heartbeat success for `DB_WATCHDOG_MS` (180000) the runner ends any turn in flight and exits non-zero; on SIGTERM or SIGINT it stops polling, kills the child, finishes a turn in flight as `failed` / `stale_claim` and exits 0; a fresh start passes `--session-id` with a new random uuid, never the conversation's id, and replays the stored history when there is any; a `--resume` start that exits non-zero before any `assistant` message is retried once as a fresh start with replay (the resume-missing fixture); a stored session id that is not uuid-shaped never reaches argv; the replay is built from the claim's `history` newest-first, at most 20 messages, within `REPLAY_MAX_BYTES` (96 KiB of UTF-8, the replay's framing included), and emitted oldest-first, with a case for the order and for the request's own user message not being repeated in it (it is `prompt`, never part of `history`); tested with 20 messages of 100000 characters, and with a full replay followed by an 8000-character question of 4-byte characters, where the prompt element stays under 131072 bytes; the init-line check kills the turn before any model call, stores `cli_error` and logs why, unless `claude_code_version` equals the pin, the credential source is the OAuth token, `permissionMode` is `dontAsk`, `mcp_servers` are exactly `bb2dash` and `rag`, both connected, and `tools` holds the four allowed MCP names and no `ToolSearch`; for every turn whose init line is read, one log line carries the request id and the init line's version, credential source, `permissionMode` and model, and no token; a `tool_use` other than `EndConversation` with no PreToolUse hook response, or one whose exit code is neither 0 nor 2, kills the turn as `cli_error`; an `EndConversation` tool event is accepted, is not stored in `tool_calls` and lets the turn finish; the error mapping (`workspace/src/errors.ts`) keys on structured fields of the stream, never on result text: `budget_exceeded` on the result subtype `error_max_budget_usd`, `sign_in_expired` on the CLI's authentication failure, `usage_limit` when a turn ends in error after a plan rate-limit rejection (read from the terminal error and the overage fields, never from an `api_retry` event; tested on the synthetic `workspace/test/fixtures/synthetic-rate-limit.json`; if task 9's recording shows the overage fields on the wire, a turn reported as paid from usage credits, `isUsingOverage` true, is killed and stored as `usage_limit`), anything unrecognised `cli_error`; start refused with `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_SIMPLE` or a `CLAUDE_CODE_USE_*` variable set, and with a runner DSN on port 6543 or with no `sslmode` (the checks `sync/src/secrets.ts` makes for `sync_runner`); `workspace/claude/settings.json` has no `apiKeyHelper` and no `env` key, and holds `"cleanupPeriodDays": 30`; `WORKSPACE_TURN_BUDGET_USD` of 0 or 1.01 refused; with `BUDGET_CAP_HOLDS` false the stored content's last line is `NO_CAP_SENTENCE`, with it true the sentence is absent (O-2); the MCP config holds exactly `bb2dash` and `rag`, pinned literally: `bb2dash` is command `node`, args `["/app/mcp-materials/dist/index.js"]`, env `SUPABASE_URL=https://goultdzqcavefcgnifdy.supabase.co` and `SUPABASE_SERVICE_ROLE_FILE=/run/secrets/bb2dash_mcp_service_key`; `rag` is command `bash`, args `["/app/mcp-rag/mcp-rag.sh"]`, with no env that holds a DSN; no string in the file matches `postgres(ql)?://`, `sb_secret_` or `eyJ`); (d) `cd workspace; npx vitest run --coverage` → `src/` lines at least 80 % | "Stop, a time-out and a lost session each end cleanly" |
| 12 | Image (with its `Dockerfile.dockerignore` and the rag launcher), entrypoint, firewall, the `workspace` service behind its profile; then the token smoke | P-85, P-88 | W-65; PM (the token smoke) | run in `bb2dash-wt-21-container`, after the PM has merged `feat/workspace-21-runner` into `feat/workspace-21` (task 11 done) and W-65 has merged the phase branch into `feat/workspace-21-container` (`git ls-files workspace/src/runner.ts docker/workspace/Dockerfile \| wc -l` → 2), and after task 19's first half (Stack has run the snippet; its file-length check passes). Until the bb2dash PR is on `main` the container exists only as compose project `bb2dash-wt21`, run from a phase worktree with `SECRETS_DIR` and `HARNESS_DIR` set in that shell (on stack-laptop `SECRETS_DIR` is a user variable already and `HARNESS_DIR` is `C:/Users/stack/agentic-harness`) and the service named in every command; never `just up`, never an `up` without a service name, never a changed `BB2DASH_DIR`; only one tree at a time runs it, and the live project `bb2dash` is not touched. Guard, read before and after every docker step of tasks 12, 13 and 19–22 and pasted into 102a: `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is unchanged. Every docker line W-65 or the PM needs is kept in 102a as one paste-ready Git Bash line (a line the session is refused is run by Stack). (a) `node --test docker/grep-clean.test.mjs` → 0 failed (the `workspace` image is in `IMAGES` and is read through `docker/workspace/Dockerfile.dockerignore`; the harness rag source arrives by `COPY --from=<named context>` and is not scanned); (d) `grep -c -E "CLAUDE_CODE_VERSION=latest\|bb2dash-mcp:local" docker/workspace/Dockerfile` → 0 (never `latest`; the materials server is built in a stage, not copied from that image); in a shell with only the Windows user variables set (`SECRETS_DIR`, `BB2DASH_DIR`; no `HARNESS_DIR`, no `COMPOSE_PROFILES`), `docker compose -f compose.yaml config --quiet` exits 0 and `docker compose -f compose.yaml config --services` prints `sync` only (what the desktop's sign-in task sees: it never builds, starts, waits on or restarts `workspace`); `docker compose -p bb2dash-wt21 --profile workspace build workspace` exits 0, with `git -C <HARNESS_DIR> rev-parse HEAD` written into 102a at build time; `docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace` exits 0; `docker compose -p bb2dash-wt21 --profile workspace config --format json \| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const w=JSON.parse(s).services.workspace;console.log([w.ports===undefined,w.init,w.platform,Object.keys(w.networks).join(),w.profiles.join(),w.stop_grace_period].join(' '))})"` → `true true linux/amd64 workspace-net workspace 30s`; `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace claude --version` prints `2.1.289 (Claude Code)` (the Dockerfile's `ARG CLAUDE_CODE_VERSION=2.1.289`); `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c "claude --help \| grep -c -E -- '^  --(tools\|permission-prompts\|strict-mcp-config\|setting-sources\|system-prompt-snapshot\|include-hook-events) '"` → 6 (6 on 2.1.289's saved help text and on the host's 2.1.290, 2026-10-05); `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c "ps -o user=,args= -C node,claude \| grep -v healthcheck.js \| awk '{print \$1}' \| sort -u"` → `node` (Docker's healthcheck runs as root, so its `node …/healthcheck.js` process is filtered out); `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace printenv ANTHROPIC_API_KEY` exits 1, and the same line for `DATABASE_URL` exits 1; the same line for `ENABLE_TOOL_SEARCH` → `false`, for `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` → `1` and for `CLAUDE_CONFIG_DIR` → `/home/node/.claude`; `docker inspect -f '{{.State.Health.Status}}' $(docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)` → `healthy`, read once the status is no longer `starting` (`up -d` returns before the first heartbeat, so it is re-read every 10 s; `unhealthy` is the failing result); then the token smoke, run by the PM right after the health check, from Git Bash as one line (one Haiku turn on Stack's plan): `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c 'CLAUDE_CODE_OAUTH_TOKEN="$(cat /run/secrets/claude_oauth_token)" claude -p --model haiku --tools "" --max-budget-usd 0.05 -- "Reply with the one word ok"'` exits 0 and prints `ok` (compared after trimming and without regard to case, a closing full stop allowed: `^ok\.?$`, so `Ok.` passes), the first proof that the setup-token works inside a default-deny container (Phase 14's A7 is unwalked); if it fails on the network, the missing host is added to the firewall's allowlist and recorded in 102a and in a DECISIONS row; the tool gate is wired, not only written: `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "const c=require('/app/workspace/claude/settings.json').hooks.PreToolUse[0].hooks[0].command;const r=require('child_process').spawnSync(c,{shell:true,input:JSON.stringify({hook_event_name:'PreToolUse',tool_name:'mcp__rag__search_context',tool_input:{query:'x',collection:'estac'}})});console.log(c,r.status)"` → `node /app/workspace/dist/hooks/tool-gate.js 2` (the exact command string read out of the image's `settings.json`, run as `node` with a `search_context` payload naming a collection off the list); (e) `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace node -e "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"` → `blocked`; the same line for `https://storage.googleapis.com` → `blocked` (no model download is possible at runtime); the service's networks, read on the running container: `docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' $(docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)` → `bb2dash-wt21_workspace-net` and nothing else (it shares no network with `sync`); the same fetch line for `http://host.docker.internal:6080` → `blocked`, run while `bb2dash-sync-1` is up (the live sync's noVNC port as the host publishes it, `127.0.0.1:6080:6080` in `compose.yaml`; a fetch of `http://sync:6080` proves nothing before the merge, because project `bb2dash-wt21` has no `sync` service, so task 26 part B runs it where `sync` shares the project); the same fetch line for `https://api.anthropic.com` → a number (any HTTP status); as root, a second run of the firewall script is refused: W-65 writes the full `docker compose -p bb2dash-wt21 --profile workspace exec -u root workspace sh -c '<in-image path of the firewall script>; echo $?'` line into 102a → a non-zero code, and afterwards the `https://example.com` line still → `blocked` and the `https://api.anthropic.com` line still → a number; ten consecutive TCP connects to each DSN secret's host on port 5432 from inside the container → `10/10` twice (the one-liner reads the host from each secret file and prints only the count; a DSN is never echoed); one `search_context` call made over stdio to the launcher (`bash /app/mcp-rag/mcp-rag.sh`, collection `bb2dash`) returns a result that is not an error, so a search answers with the model read from `/opt/fastembed` (the line prints only that verdict). These last two checks have no line written here: W-65 writes both into 102a before running them, each as a full `docker compose -p bb2dash-wt21 --profile workspace exec -u node workspace sh -c '…'` line (inside the `sh -c` quotes a container path reaches the container unchanged from Git Bash); the PM reads both before they run, and neither may print a DSN | "The Workspace service starts healthy, runs as an ordinary user, and from inside the container only Anthropic and Supabase can be reached" |
| 13 | No secret in the image | P-88 | W-65 | (d) the image proof as Phase 14 ran it (82a, section "Task 27 — image proofs"), on the workspace image task 12 built, with task 12's guard read before and after: the image's filesystem exported (`docker create`, `docker export`) and unpacked into a volume mounted at `/fs`; both `gitleaks` commands run inside the `ghcr.io/gitleaks/gitleaks:v8.30.1` container, as 82a ran them, and these are Git Bash lines: the `docker run` line is prefixed `MSYS_NO_PATHCONV=1`, so `/fs` and the config's path inside the container reach docker unchanged, and 102a's copy is that full line; `gitleaks dir /fs --config docker/gitleaks-images.toml; echo $?` → 0; `docker history --no-trunc <workspace image> \| gitleaks stdin --config docker/gitleaks-images.toml; echo $?` → 0; `docker history --no-trunc <workspace image> \| grep -c -E "sk-ant-\|sb_secret_\|eyJhbGciOi\|postgres(ql)?://[^ ]*:[^ @]*@"` → 0 (token, secret-key, JWT and password-bearing DSN shapes; variable names such as `SUPABASE_SERVICE_ROLE_FILE` do not match); all three outputs pasted into 102a. A hit under the new vendor trees (the CLI's npm folder, the two servers' `node_modules`, `/opt/fastembed`) is triaged by hand in 102a; widening the allowlist is a DECISIONS call | "No secret is baked into the Workspace image" |
| 14 | bb2dash-stack: the secret name, the `workspace` profile, the doctor row, the README section | P-85 | W-65 | (a) in bb2dash-stack `node --test doctor/workspace.test.mjs doctor/doctor.test.mjs` → 0 failures (`SECRET_NAMES`, `secrets.example/` and the umbrella `compose.yaml` name the same twelve secrets; `ALL_PROFILES` holds `workspace`; the doctor exits non-zero when `workspace_runner_db_url` in `SECRETS_DIR` is missing or empty, or the `workspace` service is not running and healthy); (d) `git ls-files secrets.example \| wc -l` → the count at the cut + 1 (12 against brief 100's 11); `grep -c "^COMPOSE_PROFILES=workspace" .env.example` → 1; `grep -cE "11 (files\|names\|frozen names)" README.md compose.yaml` → 0 for both files (3 and 2 at the cut); `grep -c "all 11" doctor/lib/checks-host.mjs` → 0 (1 at the cut, the comment over `secretsRow`); `grep -c "docker compose restart workspace" README.md` at least 1; `grep -c "workspace_runner_db_url" README.md` at least 1 (the secrets table's new row) and `grep -c "workspace-claude-home" README.md` at least 1 (the volume the transcripts live on); `git diff --stat origin/main...HEAD -- doctor/doctor.mjs` prints nothing | "`just doctor` shows the Workspace row" |
| 15 | Query layer | P-86 | W-66 | (a) `cd web; npx vitest run test/queries.workspace.test.ts` → 0 failed (ask trims and refuses empty or 8001 characters before any request; a 23505 from `workspace_ask` maps to the still-answering sentence and a 22023 to the question-length sentence; `?c=` must be a uuid; rows normalised by pure functions; the conversations query returns only rows with `archived = false`, and the archived ones only when they are asked for (the "Show archived" toggle); cancel; offline when `polled_at` is null or over 120 s old; the status query refetches every 30 s (`WORKSPACE_STATUS_REFETCH_MS`); the messages query refetches every 5 s only while a request is open; the messages, open-request and status queries set `staleTime: 0`); (d) `npx eslint src/lib/queries.workspace.ts test/queries.workspace.test.ts --max-warnings 0` exits 0 | "The page refuses an empty or oversized question before sending it" |
| 16 | The Workspace screen and the nav link | S2-workspace-1, P-86, P-87 | W-66 | (a) `cd web; npx vitest run test/Workspace.test.tsx test/TopNav.workspace.test.tsx test/workspace-labels.test.ts test/audits.test.ts` → 0 failed (one tier badge per assistant row; the "Used:" line lists only the `ok: true` elements of `tool_calls`, as `tool · scope` or `tool` alone, and is absent when there are none; its entries are joined with `, ` in call order, and an identical entry is shown once; `<script>` in content renders as literal text; tool result text never renders; the button reads "Ask"; Stop only while a request is open; the state under a question comes from its `workspace_requests` row; when a failed or cancelled request has no assistant row, the sentence comes from the request row's `error_code`, so a `cancelled` request with no assistant row shows the stopped sentence under the question; after Stop the stopped sentence shows at once; one sentence for each of the eight `error_code`s (`budget_exceeded`, `timeout`, `stale_claim`, `provider_not_configured`, `cli_error`, `cancelled`, `usage_limit`, `sign_in_expired`); `workspace-labels.ts` holds the Contract's frozen strings word for word and none of them holds a cost figure (no `$` and no amount of money; the question-length sentence keeps its "1 to 8000"); an archived conversation is not in the list; each row of the list has an "Archive" button, and a "Show archived" toggle (off by default) lists archived conversations, each with "Unarchive" (the three labels word for word: "Archive", "Unarchive", "Show archived"); when the lowest seq received is not 1 the screen shows only "Answering…"; the page holds exactly one private channel, `workspace:<uuid>` when `?c=` is a uuid, else `workspace:lobby`; with fake timers the offline line appears once the clock passes `polled_at` + 120 s with no new data and goes when a newer `polled_at` arrives; Workspace sits after Materials, the sixth link; the audits' "no Submit" and "no service-role credential under src/" cases stay green); (d) `npx eslint . --max-warnings 0` exits 0; `git diff --stat origin/main...HEAD -- src/components/shell/TopNav.module.css` (still in `web/`) prints nothing | "Every answer names its tier" |
| 17 | Integrate: 140–142 confirmed applied, types regenerated, full suites | all | PM | (b) `select count(*) from supabase_migrations.schema_migrations where name in ('140_workspace_tables', '141_workspace_realtime_policy', '142_workspace_runner_role')` → 3; (d) `web/src/lib/supabase/database.types.ts` regenerated from prod, after the PM has confirmed that no unmerged phase has objects live on prod (DECISIONS 2026-09-16): `grep -c "workspace_requests" web/src/lib/supabase/database.types.ts` at least 1 (0 at the cut); besides this phase's objects its diff carries what `main`'s file still lacks from merged migrations (091, 093, 094, 095), with no carve-out; (a) `cd web; npm run typecheck; npx eslint . --max-warnings 0; npm run build; npx vitest run; npm run test:coverage` → each exits 0, 0 failed, test count not below `main`'s at the cut (both numbers in 102a); `cd workspace; npm run typecheck; npx vitest run` → 0 failed; `cd mcp-server; npx vitest run` → 0 failed; `node scripts/db-test.mjs` → last line ends `failed 0, units <n>`; and once, run by the PM inside the window after the spike (task 5) while a partition of `realtime.messages` covers `now()`: Runner on `phase21_141_workspace_realtime.sql` → PASS. The Runner prints only `PASS  <file>`, never a unit's last row, so what shows the send-and-receive form ran is the unit's own partition test: W-63 writes the unit's partition test as one standalone `select` that returns true or false, the same expression its branch uses, and puts that `select` in a comment at the top of the unit; inside the window after the spike the PM runs exactly that `select` through `execute_sql` immediately before the Runner, expects true, and pastes both (the `select`'s result and the Runner's PASS line) into 102a beside task 5's (b0) partition count (the one run serves this row and task 3); on a day with no partition the same unit runs its policy-only form and the suite still ends `failed 0` | "Every suite is green after integration" |
| 18 | Advisors | P-88 | PM | (d) `get_advisors` security: 0 lints naming a `workspace_*` object or `realtime.messages`; performance: 0 `auth_rls_initplan` and 0 `unindexed_foreign_keys` on the four workspace tables; (b) `select count(*) from pg_indexes where schemaname = 'public' and tablename = 'workspace_requests' and indexdef ~ '\((conversation_id\|user_message_id)\)$'` → 2 (each of the two request keys has its own plain index; the partial `workspace_requests_one_open` index does not end at its column list and is not counted) | "Supabase's advisors flag nothing on the Workspace" |
| 19 | The `workspace_runner` password and DSN out of band (Stack, before task 12's health check), then the first live turn in the test container. The hand-over is Phase 15's (`db_test_runner`): the PM first adds the name `workspace_runner_db_url` to `$allowed` in `SECRETS_DIR/set-secret.ps1` (a name, not a secret; the file is in no repo, so the edit is recorded in 102a and told to Stack at the hand-over), then puts a PowerShell snippet on Stack's clipboard. The snippet makes a random password locally (letters and digits), copies the one line `alter role workspace_runner with password '…';` for an unsaved Supabase SQL editor tab, stores the session-pooler DSN (`postgresql://workspace_runner.goultdzqcavefcgnifdy:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require`, the form DECISIONS 2026-09-27 records for `db_test_runner`) as `workspace_runner_db_url` in `SECRETS_DIR` (`C:/Users/stack/.bb2dash-secrets/`), and prints only `true` or `false` for whether `sync_runner_db_url`'s and `harness_database_url`'s hosts end `.pooler.supabase.com` on port 5432 (the firewall rule rests on that). The snippet writes the file itself, the way `set-secret.ps1` does (`[System.IO.File]::WriteAllText` with `UTF8Encoding($false)`: UTF-8, no byte-order mark, no newline), because that script takes its value only from a hidden prompt; it prints one more `true` or `false`, for whether the file's length equals the DSN's. The `$allowed` entry is for a later rotation by hand. The password never appears in a chat, a repo, a tracked file or the notes store; the secret file is the only file that holds it | P-85, P-83 | Stack (the snippet and the pasted line), PM | (d) the first half: `(Get-Item C:/Users/stack/.bb2dash-secrets/workspace_runner_db_url).Length` above 0 (the length only; nobody prints the file); the snippet's three lines all read `true` (the two host checks and the file-length check); after the hand-over, and again before task 25 (a session reaches the notes store after the fact), `search_context({query: "alter role workspace_runner with password", collection: "bb2dash"})` returns no line holding a password value. (b) the second half, in `bb2dash-wt-21` after integration (task 17), where the walks of tasks 19–22 run: the PM rebuilds and starts the test container there with task 12's `build` and `up` lines (only one tree at a time runs it; task 12's `healthy` check is read again), and before the first turn reads `/usage` and writes the session and weekly percentages into 102a (a live check that fails with `usage_limit` is logged as blocked by the plan limit and re-run after the reset, not as a failed row). After the PM asks acceptance step 3's question in task 22's walk: `select tier, provider, model ~ 'haiku', finished, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1` → `low`, `claude-cli`, true, true, null; `select tool_calls @> '[{"tool":"search_materials","ok":true}]' from workspace_messages where role = 'assistant' order by created_at desc limit 1` → true; `select state from workspace_requests order by id desc limit 1` → `done`; `select count(*) from workspace_conversations where claude_session_id is not null` at least 1; if task 9's recording showed the stream naming a full model id, `select model <> 'haiku' from workspace_messages where role = 'assistant' order by created_at desc limit 1` → true (the full id was stored, not the alias); and 102a records the credential source the CLI reported for that turn, read with `docker compose -p bb2dash-wt21 --profile workspace logs --tail 20 workspace` and that request's log line pasted in (acceptance step 10 shows the same read for the last turn of his walk). After step 4's question: `select tool_calls @> '[{"tool":"search_context","scope":"bb2dash-inbox-decisions","ok":true}]' from workspace_messages where role = 'assistant' order by created_at desc limit 1` → true. After steps 3–7's five questions, asked in that order and read before step 8's Stop: `select tier, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 5` → `high`, `mid`, `low`, `low`, `low`, each with `error_code` null. After the walk: `select count(*) from workspace_messages m, jsonb_array_elements(m.tool_calls) e where e->>'tool' = 'search_context' and (e->>'ok')::boolean and coalesce(e->>'scope', '') not in ('bb2dash', 'bb2dash-inbox-decisions')` → 0 | "My first question was answered from my course files, and the answer names the file it read" |
| 20 | Planner state and facts untouched by the walks | S2-workspace-1 | PM | (b) `select max(updated_at) from assignment_progress`, `select max(updated_at) from reading_progress` and `select count(*) from assignments`, read immediately before and after task 22's walk and again before Stack's step 2 and after his step 9, are equal pair by pair (all values in 102a); and `select count(*) from agent_requests where created_at between <that pair's first read> and <that pair's second read> or claimed_at between <that pair's first read> and <that pair's second read> or finished_at between <that pair's first read> and <that pair's second read>` → 0 for each pair: the pairs fail only on a row that was created or changed state inside the pair (if one was, that walk is repeated). A walk, and any `just up`, starts only when today's `sync` request is `done`. Immediately before it the PM reads the last 24 hours of `agent_requests` (`select id, kind, state, to_char(created_at at time zone 'America/New_York', 'MM-DD HH24:MI') from agent_requests where created_at > now() - interval '24 hours' order by id`) and waits out any `sync` row that is `queued` or `claimed` and any row of another kind that is `claimed`. A `queued` `inbox_feedback` row is not waited on (only `/inbox-apply` on the host closes one): its id goes into 102a, and a walk during which it is applied is repeated | "Nothing I asked changed my planner" |
| 21 | The cap, Stop and a queued question, live on the test container | P-85 | PM | (b) one turn asking acceptance step 3's question with `WORKSPACE_TURN_BUDGET_USD=0.01`, set by recreating the test container (`WORKSPACE_TURN_BUDGET_USD=0.01 docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace`, from Git Bash) and reset by a second recreate with the same line without the variable; no request is open at either recreate (`select count(*) from workspace_requests where state in ('queued', 'claimed')` → 0), task 12's guard is read around both and its `healthy` check passes after each → `select error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1` → `budget_exceeded`, and `select state, error_code from workspace_requests order by id desc limit 1` → `failed`, `budget_exceeded` (the request row carries the code too); Stop is pressed while text is streaming, and within 10 s `select finished, error_code from workspace_messages where role = 'assistant' order by created_at desc limit 1` → true, `cancelled` (the runner's own `workspace_finish()`; the request row alone is set by the browser), and `select state from workspace_requests order by id desc limit 1` → `cancelled`; if O-2's conditional branch applies (task 9's budget recording showed no stop, so `BUDGET_CAP_HOLDS` is false, task 11), the cap half is replaced by: the answer's last line reads the no-cap sentence (O-2, PM wording), shown in `docs/planning/sprint-2/walks/walk-21/09-no-cap.png`, and the same `select error_code … limit 1` → null; a queued question does not expire: with the test container stopped for task 22's `07-offline.png`, one question is asked and left 11 minutes → `select state, error_code from workspace_requests order by id desc limit 1` → `queued`, null; after `docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace` the same select → `done`, null; (d) `docker inspect -f '{{.State.Health.Status}}' $(docker compose -p bb2dash-wt21 --profile workspace ps -q workspace)` read 60 s and 120 s into the walk's Opus turn (acceptance step 7's question) → `healthy` both times; a reading counts only if `select state from workspace_requests order by id desc limit 1` → `claimed` at that moment, and if the turn ends before the 120 s reading the check is repeated on a longer request | "Stop stopped it" |
| 22 | PM walk on the preview, with the test container running, and in a second desktop shell instance | S2-workspace-1 | PM | (b) immediately before `02-empty.png`: `select count(*) from workspace_conversations where not archived` → 1 (task 5's 'spike'); (a) the walk is the PM's spec `web/e2e/walk21.spec.ts` (the walk17 / walk19 pattern: each test asserts what its shot must show before it shoots; `workspace_ask` and `workspace_cancel` pass the harness's write guard as RPC calls), run from `web/` against the branch preview, with `WALK_BASE_URL=https://<branch alias>` set for both commands (the config's default host is `http://localhost:3000`) and `WALK_VERCEL_SHARE` set for the protected preview: `node e2e/login.mjs` (it signs in from `.env.testing` at the worktree's root, task loop 2), then `npx playwright test -c e2e/playwright.config.ts walk21` → 0 failed; shots go to `walk-21/` by explicit path, as walk19's do (a shot that needs a live state, such as `07-offline.png`, is run with `-g` while that state holds, as walk19 does); (d) after the walk: `ls docs/planning/sprint-2/walks/walk-21/0[2-8]-*.png \| wc -l` → 7 and `ls docs/planning/sprint-2/walks/walk-21/1[01]-*.png \| wc -l` → 2; (c) in `docs/planning/sprint-2/walks/walk-21/`: `02-empty.png` (taken first in the walk, before any live turn of tasks 19–21; Workspace link active in the top bar, a conversation list holding only task 5's 'spike' conversation, which stays until acceptance step 15 archives it, an empty message column, the "Ask" button); `03-lookup-haiku.png` (acceptance step 3's question: badge "Haiku · lookup", a "Used:" line naming `search_materials`); `04-decision-haiku.png` (step 4's: a "Used:" line naming `search_context · bb2dash-inbox-decisions`); `10-document-haiku.png` (step 5's: badge "Haiku · lookup", a "Used:" line naming `get_material_text`); `11-standard-sonnet.png` (step 6's: badge "Sonnet · standard"); `05-deep-opus.png` (step 7's: badge "Opus · deep work"); `06-stopped.png` (the stopped sentence under a partial answer); `07-offline.png` (the offline line, within three minutes of `docker compose -p bb2dash-wt21 --profile workspace stop workspace`; `docker compose -p bb2dash-wt21 --profile workspace up -d --no-deps workspace` brings the service back); `08-desktop.png` (the same conversation inside a second desktop shell instance, started from the worktree's `desktop/` build with `BB2DASH_APP_URL` (a local `next start` of the branch), `BB2DASH_SUPABASE_URL` and `BB2DASH_SUPABASE_ANON_KEY` (public values, set in that shell and never printed) and `BB2DASH_SYNC_DRY_RUN=1`, with its own `--user-data-dir`, signed in with the test login typed by the driver and never printed; never by editing `%APPDATA%\bb2dash\config.json` or quitting Stack's running app; at acceptance step 2 Stack signs in once in a window started the same way); (b) after the walk and before Stack's part A the PM archives its own walk conversations as the owner (the way acceptance step 15 archives 'spike'): `select count(*) from workspace_conversations where not archived` → 1 again, so the list Stack opens at step 2 holds only 'spike' | "Screenshots of every state are in the walk folder" |
| 23 | Code review and security review | P-88 | PM | (d) `/code-review main high` and `/security-review` on both PRs, recorded in 102a as the DoD's review gates say; the `/security-review` request, quoted in 102a under its heading, names the two write-capable credentials inside the container (the bb2dash service key for the materials server, the harness store's DSN for the rag server; accepted for v1, DECISIONS 2026-10-05) and what `PUBLIC` holds on pg_net's schema for every database login, `workspace_runner` included (`net.http_post` and its two tables); it also asks the reviewer to read two clauses of `docker/workspace/init-firewall.sh` that no check exercises (IPv6 closed; a DSN host that does not end `.pooler.supabase.com` fails closed): `grep -c "net.http_post" docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` at least 1; `grep -cE "^## /(code-review main high\|security-review)$" docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` → 2; `grep -c "\| CRITICAL \| open \|" docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` → 0; `grep -c "\| HIGH \| open \|" docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md` → 0 | "Both reviews end with no open critical or high finding" |
| 24 | Docs: DECISIONS rows, STATUS, ORCHESTRATOR, CLAUDE.md, and the stale Phase 21 lines of 105 §3 and 106 section R8 | S2-workspace-1 | PM | (d) `grep -c "Reversal adopted (Requirements v3 §4 D-1)" project-state/DECISIONS.md` → 1; `grep -c "Phase 21 freeze: one PR per repo" project-state/DECISIONS.md` → 1 (written at the freeze, 2026-10-05); every other row owed at task 24 (the paragraph under this table) is found by the title the PM gives it, the titles listed in 102a: `grep -c "<that title>" project-state/DECISIONS.md` → 1 for each; `grep -c "workspace_runner" project-state/DECISIONS.md`, `grep -c "Phase 21" project-state/STATUS.md`, `grep -c "Phase 21" project-state/ORCHESTRATOR.md` and `grep -c "Workspace" CLAUDE.md` each greater than on `main` at the cut (the cut's values, read as `git show 06e046b:<path> \| grep -c …`, in 102a: 1, 1, 5 and 0; the `workspace_runner` count already rose to 3 with the freeze rows, so that row is proven by its title grep above, not by this count); STATUS "Known issues / operational notes" carries the measured top-bar widths (752 px before, 851 px idle, up to 974 px with the longest Sync label; brief 103's open item 3 owns the band above 721 px): `grep -c "974" project-state/STATUS.md` at least 1 (0 at the cut); STATUS lists the pg_net reach among the deferred hardening items, under "Phase 14 deferred (R-96)" in its bullet "Hardening noted by the security reviews, below the bar": `grep -c "pg_net" project-state/STATUS.md` greater than at the cut (2 at the cut); `grep -c "bb2dash-stack/secrets" docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md` → 0 for both files (2 and 1 at the cut), the three brief-102 notes of 105 §3 struck as fixed; in 106's section R8, `grep -c "COMPOSE_PROFILES=workspace" docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` at least 1 (0 at the cut; the "Stack acts" line for acceptance step 13) and `grep -c "this phase's objects only" docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` → 0 (1 at the cut) | "The decision log says the chat assistant is in, read-only" |
| 25 | Both PRs open, preview live | all | PM | (d) `gh pr view <n> --json state -q .state` → `OPEN` and `gh pr view <n> --json headRefName -q .headRefName` → `feat/workspace-21` for the bb2dash and the bb2dash-stack PR, opened together (bb2dash merges first); (e) the Vercel connector's `web_fetch_vercel_url` on `<branch alias>/login` returns the sign-in page with HTTP 200 (the `vercel` CLI is not installed here) | "Both PRs are open with a preview link" |
| 26 | **Stack's acceptance walk**, in two parts | S2-workspace-1 | Stack | part A (steps 1–12, before the merge, on the branch preview with the PM's test container, project `bb2dash-wt21`, running): (d) before step 12, on `feat/workspace-21`, `grep -c "\*\*Phase 21: preview walk" project-state/DECISIONS.md` → 1 (the row he reads beside the D-1 reversal row before he says "merge"). Part B (steps 13–15, on `main`, right after the merge): (d) `gh pr view <n> --json state -q .state` → `MERGED` for both PRs, bb2dash first, and both main checkouts pulled; before step 13's `just up` the PM stops the test container (`docker compose -p bb2dash-wt21 --profile workspace stop workspace`), so only the live project answers and step 14's offline line can show: `docker ps -q --filter label=com.docker.compose.project=bb2dash-wt21 \| wc -l` → 0 (no container of the test project is running; 102a says that chats from the pre-merge walks continue from their last 20 stored messages); after step 13's `just up`, from bb2dash-stack: `docker compose exec -u node workspace node -e "fetch('http://sync:6080',{signal:AbortSignal.timeout(5000)}).then(r=>console.log(r.status),()=>console.log('blocked'))"` → `blocked` (here `sync` shares the compose project, so the line can fail: the Workspace cannot reach the sync container's login page); (b) step 15's two counts → 1 and 0 (in 102a); (d) after step 15 the PM removes the test project's leftovers: the `bb2dash-wt21` container (`docker compose -p bb2dash-wt21 --profile workspace rm -sf workspace`), its network (`docker network rm bb2dash-wt21_workspace-net`) and `bb2dash-wt21_workspace-claude-home` (`docker volume rm bb2dash-wt21_workspace-claude-home`); named resources only, never a project-wide `down` against `bb2dash`: `docker ps -aq --filter label=com.docker.compose.project=bb2dash-wt21 \| wc -l` → 0, `docker volume ls -q --filter name=bb2dash-wt21_ \| wc -l` → 0 and `docker network ls -q --filter name=bb2dash-wt21_ \| wc -l` → 0; (d) `grep -c "\*\*Phase 21 accepted" project-state/DECISIONS.md` → 1, a row dated the day he walks steps 13–15, written after step 15 in a docs-only PR (PR #76's precedent for Phase 14) and grepped on that PR's branch (the row's bold title is matched, because the acceptance-order row of 2026-10-05 already quotes the phrase) | the fifteen steps, in two parts |

DECISIONS rows written by the PM at the freeze (2026-10-05): one row each for O-1, O-2, O-3, O-4
and O-5; the B-5 (h) re-read and Usage credits (off); the acceptance order (two parts, 15 steps);
the two write-capable credentials in the container, accepted for v1; the one-PR-per-repo exception
("Phase 21 freeze: one PR per repo", both PRs opened together at task 25 and bb2dash merged first,
amending the two 2026-09-27 rows); and the PM calls (the password hand-over; scope: three tiers,
archive only, no daily cap and no Off switch, no course AI-use rule; the Intel-only image; the pin
and the argv gate). DECISIONS rows owed later, at task 24 or when they happen: the D-1 reversal
("Reversal adopted (Requirements v3 §4 D-1)", naming the tier map, read-only v1, the subscription
path, the two credentials and that no course AI-use rule is applied; its reason for the CLI:
`--bare` never reads the subscription login, Anthropic's legal page steers the Agent SDK library
to API-key authentication, the unmodified CLI is the one path its terms name for a user's own
subscription, and the paused metering plan covers `claude -p` and the SDK alike); Realtime
Broadcast as the Workspace transport with the polling fallback (after task 5); `workspace_runner`
as a third least-privilege database login, after `sync_runner` and `db_test_runner`, naming what
`PUBLIC` holds on pg_net's schema; rendering answers as text; the port PR (task 6a); the
"Phase 21: preview walk" row (before the merge, task 26 part A); and the "Phase 21 accepted" row
(after step 15, in a docs-only PR). Only if they happen: a row for Realtime's
"Allow public access" switched off at task 5's sitting, a row for a widened
`docker/gitleaks-images.toml` allowlist (task 13), and a row for a host added to the firewall's
allowlist (task 12).

## Workers

Workers are Opus (DECISIONS 2026-09-23), commit and push per task (`feat(P-85): …`), never touch
`project-state/`, apply their migrations to prod only after a `begin; … rollback;` dry run (W-63
applies 140–142, and 142 only when the PM says the port PR of task 6a is ready; the PM confirms them
at task 17), and hand the PM a verification section for 102a
that quotes each task's red run and green run. `database.types.ts` is the PM's at integration; W-66
types the RPCs locally from this Contract until then, and `web/src/lib/queries.workspace.ts` keeps
its hand-declared row types after the regenerate (the `web/src/lib/queries.sync.ts` pattern; nobody
moves it onto the generated types in this phase).

| worker | stream | branch | worktree | owns (disjoint) | tasks |
|---|---|---|---|---|---|
| W-63 | db | `feat/workspace-21-db` | `bb2dash-wt-21-db` | `db/migrations/140_workspace_tables.sql`, `db/migrations/141_workspace_realtime_policy.sql`, `db/migrations/142_workspace_runner_role.sql` (and 143–149 if a review round needs one), `db/tests/phase21_*.sql`, the membership assertion of `db/tests/phase15_100_db_test_runner_role.sql`, the Workspace section of `DATA_SYNTAX.md` | 2, 3, 6 |
| W-64 | runner | `feat/workspace-21-runner` | `bb2dash-wt-21-runner` | everything under `workspace/`, the fixtures `workspace/test/fixtures/claude-stream-resume-missing.stderr.txt`, `workspace/test/fixtures/claude-stream-sign-in-expired.jsonl` (with a `.stderr.txt` sibling if the CLI writes its message there) and `workspace/test/fixtures/synthetic-rate-limit.json` among them; `workspace/src/config.ts` also holds `HEARTBEAT_MS`, `DB_WATCHDOG_MS`, `CANCEL_POLL_MS`, `REPLAY_MAX_BYTES` and the pinned CLI version the init-line check compares against | 7, 8, 9, 10, 11 (worked in the order 7, 10, 8, 9, 11) |
| W-65 | container | `feat/workspace-21-container` (bb2dash) and `feat/workspace-21` (bb2dash-stack) | `bb2dash-wt-21-container`, plus a bb2dash-stack worktree | bb2dash, new: `docker/workspace/Dockerfile`, `docker/workspace/Dockerfile.dockerignore`, `docker/workspace/entrypoint.sh`, `docker/workspace/init-firewall.sh`, `docker/workspace/mcp-rag.sh`; bb2dash, changed: `compose.yaml` (the `workspace` service block, its secrets, the `workspace-claude-home` volume and the `workspace-net` network only) and `docker/grep-clean.test.mjs`. bb2dash-stack, new: `secrets.example/workspace_runner_db_url` (0 bytes) and `doctor/workspace.test.mjs`; bb2dash-stack, changed: `compose.yaml` (the top-level `secrets:` entry and the comments that say 11), `.env.example` (`COMPOSE_PROFILES=workspace`), `doctor/lib/constants.mjs` (`SECRET_NAMES` 12, `ALL_PROFILES` gains `workspace`), `doctor/lib/checks-docker.mjs` (a `workspaceRow`), `doctor/lib/checks-host.mjs` (only the comment over `secretsRow` that says 11), `doctor/lib/diagnose.mjs` (the row), `doctor/doctor.test.mjs`, `README.md` (a Workspace section: what it is, where copies of an answer live and how to wipe them, `docker compose restart workspace`, and that the Workspace costs nothing extra only while Usage credits are off on the Claude account; the three "11"s; a `workspace_runner_db_url` row in the secrets table, and `workspace` added to the "Used by" cell of `claude_oauth_token`, `bb2dash_mcp_service_key` and `harness_database_url`; a `workspace` row in the doctor table. The copies it names: the `workspace_*` rows in the database (archived, never deleted in v1), the CLI's transcripts on the `workspace-claude-home` volume (kept 30 days) and the browser's saved query cache (cleared on sign-out)). `doctor/doctor.mjs` is unchanged | 12, 13, 14 |
| W-66 | web | `feat/workspace-21-web` | `bb2dash-wt-21-web` | `web/src/app/(app)/workspace/`, `web/src/components/workspace/`, `web/src/lib/queries.workspace.ts`, `web/src/lib/use-workspace-stream.ts`, `web/src/lib/workspace-labels.ts`, the one `NAV_LINKS` line in `web/src/components/shell/TopNav.tsx`, the five new `web/test/` files. It reads `web/src/lib/use-now.ts` (on `main`, unchanged) and makes no change to `web/src/components/shell/TopNav.module.css` | 4, 15, 16 |
| PM | integration | `feat/workspace-21` | `bb2dash-wt-21` | `web/src/lib/supabase/database.types.ts`, `web/e2e/walk21.spec.ts` (the PM's walk spec in the walk17 / walk19 pattern; beside `database.types.ts`, the one file under `web/` that is not W-66's), `project-state/`, root `CLAUDE.md`, `docs/planning/sprint-2/walks/walk-21/`, `docs/planning/sprint-2/verification/102a_PHASE21_VERIFICATION.md`, and in the same PR the stale lines of `docs/planning/sprint-2/106_SPRINT2_EXECUTION_PLAN.md` section R8 and the three brief-102 notes in `docs/planning/sprint-2/105_BRIEF_VERIFICATION_2026-09-27.md` §3 (struck as fixed) | 1, 5, 6a, 17–25 (19 with Stack) |

Task numbers 1–26 keep their numbers; the only new task row is 6a. Worker ids stay W-63..W-66.

**Branch flow for the image.** The image copies and runs W-64's `workspace/` package, so the order of
merges is fixed. After task 11 the PM merges `feat/workspace-21-runner` into `feat/workspace-21`; W-65
merges the phase branch into `feat/workspace-21-container` before any docker check; task 12 runs in
`bb2dash-wt-21-container`, and the walks (tasks 19–22) in `bb2dash-wt-21` after integration. The
in-image layout is the seam between W-64 and W-65: W-64's `workspace/test/mcp-config.test.ts` pins the
Contract's literals (`/app/workspace/`, `/app/mcp-materials/`, `/app/mcp-rag/`) and W-65's image
matches them.

**Rules for W-63.** Each is a trap the 2026-10-05 audit found on prod.

* 142 is applied only when the PM says the port PR (task 6a) is ready.
* A unit reads `realtime.messages` only under `set local role authenticated` or `anon`, and sets
  `realtime.topic` explicitly before each read (a send leaves it set).
* A unit finds a partition of `realtime.messages` from the catalogs by name (`pg_inherits`,
  `pg_class`, `pg_namespace`), never through `::regclass`: `db_test_runner` has no USAGE on schema
  `realtime`, and none is added.
* Unit 141 has two labelled forms. With a partition that covers `now()` it runs the send-and-receive
  half and its last row reads `phase21_141 send and receive: PASS`; with none it runs only the policy
  half and its last row reads `phase21_141 policy only (no partition today): PASS`. W-63 writes the
  unit's partition test as one standalone `select` that returns true or false, the same expression
  its branch uses, and puts that `select` in a comment at the top of the unit. Inside the window
  after the spike the PM runs exactly that `select` through `execute_sql` immediately before the
  Runner, expects true, and pastes both (the `select`'s result and the Runner's PASS line) into 102a
  beside task 5's (b0) partition count.
* Privilege assertions use `has_table_privilege`, `has_column_privilege`, `has_function_privilege`
  and `pg_auth_members`, never `information_schema` (its views list enabled roles only, so under
  inherit-false memberships a count of 0 proves nothing). 140's grants to `authenticated` are
  column-level, the first in this repo, so task 2's assertions also use `has_any_column_privilege`.
* An `execute_sql` dry run of a unit that needs `set role` into a runner role adds the in-transaction
  grant the B-42 row describes (`grant workspace_runner to postgres with inherit false, set true`).
* Every `returns table` column of `workspace_claim` is aliased (SQLSTATE 42702 at call time
  otherwise, which no dry run shows).
* Every function of 140 and 142 starts with `revoke all` from `public`, `anon`, `authenticated` and
  `service_role` (091's four-role list), then grants the row's roles.
* 142's guard is scoped to schema `public` (091's guard (b) form). What PUBLIC holds on pg_net's
  schema is the same for every login, so a guard written across all schemas would abort the
  migration.
* After each apply W-63 runs `node scripts/db-test.mjs --only <file>` on
  `phase12b_076_rls_initplan_and_truncate.sql`, `phase15_100_db_test_runner_role.sql` and
  `phase15_101_search_path_pin.sql`: all three read the new objects.
* `scripts/db-test.mjs` and `scripts/db-test.test.mjs` are not edited by anyone.
* The test runner needs `.env.local` at the worktree's root and `scripts/` installed. The PM copies
  `.env.local` into `bb2dash-wt-21` and `bb2dash-wt-21-db` and runs `npm --prefix scripts ci` in each;
  a worker never copies it.
* The units run against prod, where from task 12 on the heartbeat table always holds its row and a
  real question can sit `queued`. Inside its transaction unit 140 deletes the heartbeat row before it
  asserts the null `polled_at`; units 141 (in its full form) and 142 delete or cancel every other
  `queued` or `claimed` request before they call `workspace_claim()`. `db_test_runner` holds `delete`
  on the four tables (140's grant), and the unit rolls back.

**Rules for W-64.**

* Order: 7, 10, 8, 9, 11. The gate (task 10) must exist before the recordings (task 9), and the
  recordings freeze the argv (task 8).
* `workspace/prompts/system.md` is written before task 9's recordings (W-64 writes it with task 8),
  since the argv carries it; task 11 still owns its test.
* Where the resume-missing exit code is kept is W-64's choice; it names the file in its
  verification section.
* The recordings follow the recording recipe in task 9's row: on the host, on Stack's subscription
  (allowed since his 2026-10-05 answer), from an empty directory outside every repo, on the pinned
  version, with no inherited `CLAUDE*` or `ANTHROPIC*` variable in the shell (a worker's own shell is
  a child of a Claude Code session and carries several). One paste-ready line per fixture goes in
  102a.
* The pin equals the version the fixtures are recorded on: if the host's `claude --version` no longer
  reads the pin, W-64 records through `npx -y @anthropic-ai/claude-code@2.1.289`. That is already the
  case: on the evening of 2026-10-05, after the audit, the host's `claude --version` read 2.1.290, so
  the recordings go through `npx` from the first one.
* The image copies named paths from `workspace/` (`package.json`, `package-lock.json`,
  `tsconfig.json`, `src/`, `claude/`, `prompts/`), and W-65's `docker/grep-clean.test.mjs` scans what
  it copies. Nothing under those paths names a Windows drive path, a `.ps1`, PowerShell, `Move-Item`
  or OneDrive outside a code comment (Markdown and JSON have no comments to strip).
  `workspace/README.md` and `workspace/test/` are not copied.
* No `claude -p` has run with the frozen argv, so task 9's lookup recording is the argv's gate. If
  any element does not behave as the Contract describes, W-64 stops and reports, and the PM re-rules
  before task 8's argv test is finalised.

**Rules for W-65 (docker).** The live compose project `bb2dash` holds Stack's Blackboard login in
`bb2dash-sync-1` and is owned by bb2dash-stack's main checkout; it is not touched.

* Until the bb2dash PR is on `main`, the Workspace container exists only as compose project
  `bb2dash-wt21`, run from a phase worktree with `SECRETS_DIR` and `HARNESS_DIR` set in that shell and
  the service named in every command: `docker compose -p bb2dash-wt21 --profile workspace build workspace`,
  `... up -d --no-deps workspace`, `... exec -u node workspace ...`, `... stop workspace`,
  `... rm -sf workspace`.
* Never `just up`, never an `up` without a service name, never a changed `BB2DASH_DIR` for the
  umbrella, before the merge. `HARNESS_DIR` is not set as a user variable.
* Guard, read before and after every docker step and pasted into 102a:
  `docker inspect -f '{{.Id}} {{.State.StartedAt}}' bb2dash-sync-1` is unchanged.
* Only one tree at a time runs the test container.
* Every docker line the PM or W-65 needs is kept in 102a as one paste-ready line (the session's docker
  commands can be refused, and Stack then runs the line himself). Every paste-ready line is a Git
  Bash line, and 102a says so at the top of its docker section; a container path that is its own
  argument is wrapped in `sh -c '…'`, or the line is run with `MSYS_NO_PATHCONV=1`.
* The Dockerfile copies named paths from `workspace/` (`package.json`, `package-lock.json`,
  `tsconfig.json`, `src/`, `claude/`, `prompts/`), never the folder whole, so
  `docker/grep-clean.test.mjs` does not scan W-64's README or test fixtures.
* The pre-merge container has its own `bb2dash-wt21_workspace-claude-home` volume: chats from the
  pre-merge walk continue after the merge from their last 20 stored messages.
* In bb2dash's `compose.yaml` W-65 adds only what its row lists; no line of the `sync` block or of
  the `bb-profile` and `course-files` volumes changes. The root `.dockerignore`,
  `mcp-server/Dockerfile` and `mcp-server/src` are not touched.
* The bb2dash-stack worktree is for file edits and `node --test` only; no compose command runs there.
* W-65 records `git -C <harness> rev-parse HEAD` in 102a at build time.

**Notes for W-66 (prompt traps from the 2026-10-05 audit).** Standing source scans run on every
`npx vitest run`, and two traps appear only in the built app.

* Never write the word `service_role` anywhere under `web/src`, not even in a comment
  (`web/test/audits.test.ts` matches the plain substring in every file).
* Read no env var.
* Add no raw-HTML sink (`web/test/raw-html.audit.test.ts` allows one file).
* Do not format a `…status…` value with `.replace(/_/g` (`web/test/status-vocabulary.test.ts`).
* Never `composes` a local class that itself composes from `tokens.module.css`: the built app loses
  it.
* Wrap `<Workspace />` in `<Suspense>` in `page.tsx` and gate cache-dependent markup on
  `useHydrated()` (`web/src/lib/use-hydrated.ts`).
* Compare `request_id` as a number on both sides (the `assertRowId` precedent in
  `web/src/lib/queries.sync.ts`): a string against a number makes every delta look like another
  request's, and it is dropped with no error.

## Out of scope

* Any write tool, on any tier, and any propose-then-approve path (a later phase, proposed separately;
  B-5 (c) was decided read-only on 2026-09-27).
* The Haiku classifier (a fast-follow only if the heuristic misroutes, per B-5 (e)).
* Wiring Ollama or a frontier API; the stubs only type-check (a later phase).
* A tier setting: `TIER_ROUTES` stays a code constant, and there is no `WORKSPACE_TIER_ROUTES`. The
  provider seam is proven by task 8's test.
* A fourth tier: three tiers with Opus on top, no `fable` (a later phase if Stack asks).
* A tier picker and Markdown rendering (O-5, answered 2026-10-05).
* Planner, grades or Inbox data as a Workspace tool, and with it P-85's `workspace_reader` role (the
  research's view-backed reader; open item O-4, answered 2026-10-05).
* Whole notes from the harness store (`get_document`; O-3, answered 2026-10-05).
* Reading a document past its first 20,000 characters: `get_material_text` returns only the first
  20,000 characters of a unit (`MAX_TEXT_CHARS` in `mcp-server/src/format.ts`; `mcp-server/` is
  unchanged in this phase).
* Deleting a conversation: archive only, no Delete (no delete policy on any Workspace table and no
  Delete control; a later phase if Stack asks).
* A daily cap and an Off switch. Behind its compose profile nothing restarts a stopped Workspace
  behind Stack's back, which is one reason no Off switch is built.
* Any course AI-use rule in the assistant (his 2026-09-10 call, display only with no enforcement, and
  the 2026-09-29 removal of the AI Policy feature stand).
* An expiry for a waiting question: a `queued` request does not expire. Stop works on it, and the
  service answers what is still queued when it returns.
* Phase 14's own objects: the umbrella, the shim, the images, the secrets folder, the dev container,
  the scheduler, `sync_runner` (Phase 14). What this phase adds beside them is in §Workers (W-65's
  row) and task 19 (one name in the allow-list of `set-secret.ps1`); the root `.dockerignore`,
  `mcp-server/Dockerfile`, `mcp-server/src`, bb2dash-stack's `doctor/doctor.mjs` and everything under
  `desktop/` stay as they are.
* The optional one-turn `claude -p` summary of a sync (R-96's deferred list, Phase 14).
* Harness code, a read-only role on `harness-memory`, and any change to the realm vault (the harness
  repo; Phase 20).
* Read-only store roles under the two MCP servers (the one on `harness-memory` above, and one on
  bb2dash for the materials server), and closing what PUBLIC holds on pg_net's schema
  (`net.http_post` and its two tables, the same for every login, `sync_runner` included): a later
  phase, on the deferred hardening list. Stack accepted the two write-capable credentials in the
  container for v1 on 2026-10-05.
* A linux/arm64 image: the image is linux/amd64 only (the `rag` server's tokenizer has no linux-arm64
  build; accepted 2026-10-05).
* Styling beyond the existing tokens, and the phone-width nav fold (Phase 22). No shrink rule is
  added to `TopNav.module.css`: with the sixth link the bar's natural width goes from 752 to 851 px
  idle and up to 974 px with the longest Sync label, and the band between 721 px and those widths is
  brief 103's (§Open items for Stack, item 3 "Widths just above the fold"); the measured numbers go
  into STATUS "Known issues" in this PR.
* `agent_requests` kinds, `transform_tick`, the Inbox, the Electron poller, toasts for finished
  answers (untouched; no phase owns a change).
* Sharing a conversation or any second user (v3 §4 D-5).

## Open items for Stack

All answered on 2026-10-05. The PM put O-1..O-5 to Stack at the session's start, with the calls it
would make unless he objected, and he answered in one message: "defaults, usage credits is off".
Each item below keeps its default and says what was decided; each has its DECISIONS row dated
2026-10-05. Nothing in this list waits on him. One branch stays PROVISIONAL by design: O-2's, which
depends on what task 9's recording shows.

* **O-1 · Which harness collections.** Answered 2026-10-05: the default stands. Default: `bb2dash` and
  `bb2dash-inbox-decisions`, the two
  bb2dash collections the store held on 2026-09-24. They are his Inbox answers and the notes of the
  sessions that built this app, and still the only two bb2dash collections on 2026-10-05. So
  `RAG_COLLECTIONS` = `bb2dash`, `bb2dash-inbox-decisions`. `stack` is not added: it holds unrelated
  home-folder sessions, and the one sync note filed there is a harness routing matter. The class
  collections stay out: they hold one index note each (only `ist466` has work sessions). An empty
  search of an allowed collection returns the names and sizes of the other collections, never their
  content; that is accepted for a single-owner tool (D-5), and the system prompt tells the assistant
  not to list them. Adding a class collection is one entry in
  `RAG_COLLECTIONS` and one fixture row (and its name in the gate's deny reason and the system
  prompt).
* **O-2 · If the $1 cap does not stop a subscription-billed turn** (task 9's budget fixture shows
  it). Answered 2026-10-05: the default stands, so the flag (`--max-budget-usd`) is kept either way.
  The cap counts Claude Code's own list-price estimate of the call's own spend, not a charge, and one
  response can overshoot it, so a stop is the expected result. PROVISIONAL, the one conditional
  branch: the rest of this item applies only if task 9's budget recording shows no stop (the run ends
  `success` with two or more turns and a cost above the cap); the PM then tells Stack the same day.
  Default: keep the flag, rely on the 8-minute turn limit and one-turn-at-a-time as the hard
  stops, and say under the answer that no per-answer cap applies (the no-cap sentence, PM wording:
  "No per-answer cost limit applies to this answer."). Who builds it: W-64, in task 11. The runner
  appends `NO_CAP_SENTENCE` as the stored answer's last line whenever `BUDGET_CAP_HOLDS` (both new,
  `workspace/src/config.ts`) is false; W-64 sets it false only when task 9's budget fixture showed no
  stop, and a `workspace/test/runner.test.ts` case covers both values. W-66's screen needs nothing,
  since the sentence is stored content rendered as text; task 21 checks it live. In that branch task
  9's row still passes, with the budget fixture asserted as a finished answer with no error code. The
  other answer, dropping the flag, was not taken, so its list of changed tasks is struck.
* **O-3 · Whole notes from the harness store** (`get_document`). Answered 2026-10-05: the default
  stands. Default: off in v1; search chunks
  carry the text. `mcp__rag__get_document` is denied by the tool gate and also removed from the
  assistant's view (`--disallowedTools`), and the system prompt says whole notes are not available.
  Turning it on needs an id rule the gate can check, since note ids do not carry
  their collection (`bb2dash-inbox-decision-528`, `session-<uuid>--…`), and it removes that
  `--disallowedTools` element from the argv.
* **O-4 · Planner and grades as a Workspace tool.** Answered 2026-10-05: the default stands, and no
  `workspace_reader` role is built in v1. Default: not in v1 (his words scope the cheap
  tier to "simple rag db queries or pulling of documents"); a later phase adds a read-only,
  view-backed tool under its own role. One thing for him to know: his Inbox-decision notes hold some
  scores as text, so an answer about a decision can repeat a score as it stood on the day he
  answered. The system prompt has the assistant say so and point to the Grades screen for the current
  figure.
* **O-5 · A tier override and Markdown rendering.** Answered 2026-10-05: the default stands. Default:
  neither in v1; the badge names the
  tier, and answers render as plain text. The system prompt asks for plain text without Markdown
  symbols. With no override, a misrouted question can only be asked again.

Settled in the same message, each with its DECISIONS row of 2026-10-05:

* **B-5 (h), re-read.** The `claude -p` / Agent SDK metering change is still paused, with no date and
  notice promised. Stack re-accepts the risk. Usage credits on his Claude account: off, so an answer
  that arrives after his plan limit is used up fails with a plain sentence (PM wording: "Your Claude
  plan's limit is used up. Try again after it resets.") and is not paid at API prices.
* **Acceptance order.** Option (a): 15 steps in two parts. He walks steps 1 to 12 before the merge,
  on the branch preview with the PM's test container running, and says "merge"; steps 13 to 15 run on
  `main` right after, and he says "accepted".
* **Two credentials inside the container.** The bb2dash service key (for the materials server) and
  the harness store's DSN (for the `rag` server) could both write. Accepted for v1: the assistant has
  no shell or file tool, only four read tools are allowed, and the gate checks every call.
* **PM calls he did not object to.** The password hand-over (task 19: a snippet on his clipboard
  makes the password, and it is never typed in a chat); three added acceptance steps (a document
  pull, a Sonnet question, the PM showing that no API key is present); three tiers with Opus on top,
  no `fable`; archive only, no Delete; no daily cap and no Off switch; no course AI-use rule in the
  assistant; a plain `usage_limit` message; a one-line test-only PR to `main` the day 142 is applied
  (his merge word that day); the image is linux/amd64 only.

What still needs his hands (none of it a decision):

* Before his walk: Phase 14's own acceptance sitting is finished (this phase's script comes after
  it).
* Task 5: he is signed in to the branch preview in his own browser tab for the Realtime spike. At the
  same sitting he may switch off Realtime "Allow public access" in the Supabase dashboard (optional;
  its own DECISIONS row if he does).
* Task 19: he runs the PM's snippet and pastes its one `alter role` line into an unsaved Supabase SQL
  editor tab.
* Task 6a: his merge word for the one-line test port PR, the day 142 is applied.
* Task 9: only if the worker's session refuses to start `claude -p`, he runs the four paste-ready
  recording lines from 102a in a plain terminal (two of them each spend one small Haiku turn on his
  plan; the other two spend none).
* Acceptance step 1: he looks at claude.ai, Settings, Usage and confirms Usage credits are still
  off.
* Acceptance step 13: he adds `COMPOSE_PROFILES=workspace` to bb2dash-stack's `.env` (the file is
  gitignored, so no PR carries the line).
* His two words: "merge" after step 12 and "accepted" after step 15.
* If the session's docker commands are refused, he runs the paste-ready line from 102a himself, in
  Git Bash.

Open by design, and the PM's gates, not questions for him: the transport (frozen after task 5), the
argv (frozen after task 9's first recording) and O-2's conditional branch above.

## Session prompt (copy-paste, after Phase 14 merges)

Run on 2026-10-05 (Stack's kickoff of that day, after Phase 14 merged on 2026-10-04). The prompt
below is kept as the record. Where the frozen Contract says something else, the Contract wins: B-5
was answered on 2026-09-27; the password is handed over as task 19 describes (the secret file in
`SECRETS_DIR` is the one file that holds it, and it is never typed in a chat); and the acceptance
walk has two parts, with his "merge" after step 12 and his "accepted" after step 15.

> `/bb2dash-pm` Start Phase 21 (S2-workspace-1, P-83..P-88). Read
> `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md` in full and run task 1's seam gate against
> `main` before anything else (Phase 14 and Phase 15 merged). Put the brief's open items O-1..O-5
> to me, with B-5 if I have not answered it, and wait. Then cut `feat/workspace-21` as worktree `bb2dash-wt-21`, spawn W-63..W-66
> (Opus) in their own worktrees, run the Realtime spike (task 5) as a gate before the transport is
> frozen, integrate, run every deterministic check, walk the preview and the desktop shell, run the
> gates, open the bb2dash and bb2dash-stack PRs with the preview link, and stop at "ready when you
> say so". Hand me the one password line for `workspace_runner` before the container's health check
> (task 12); never put it in a file.
