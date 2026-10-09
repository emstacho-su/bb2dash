# bb2dash — session guide

Blackboard Ultra → Supabase → personal academic hub. Syracuse, Fall 2026. Owner: Stack.
Supabase project: `goultdzqcavefcgnifdy` (us-east-1, Postgres 17). Full access via Supabase MCP.

## Read first

0. **PM sessions:** run `/bb2dash-pm` — it loads `project-state/ORCHESTRATOR.md` (phase map,
   execution order, the per-phase cycle, and the ordered review list) before anything else.
1. `project-state/STATUS.md` — where the product is, what's done, what's next. **Start here.**
2. `project-state/DECISIONS.md` — why things are the way they are. Don't relitigate silently.
3. `DATA_SYNTAX.md` — data dictionary, ID conventions, enums, search layer.
4. `docs/planning/sprint-0-foundation/40_RECONCILIATION_2026-09-09.md` — how the local planning round and the
   cloud work were reconciled; `gui research context/gui/README.md` — the GUI layout spec.

## Workflow SOP (Stack's rules — follow them)

* Develop on branches (`feat/`, `fix/`, `chore/`, `docs/`); never commit directly to `main`.
* Commit + push to the working branch as each task completes, not batched at the end.
* **One PR per phase.** Merge to `main` / deploy to prod ONLY when Stack explicitly asks in
  that conversation — otherwise stop at "ready when you say so."
* **Anything visual:** get it in front of Stack before merging — a dev server URL locally, or
  a Vercel preview deployment from a cloud session — and wait for his OK.
* **Upon each PR: update `project-state/STATUS.md`** (what shipped, where the product is,
  what's slotted next) **and append new decisions to `project-state/DECISIONS.md`**, in the
  same PR.
* Migrations are additive and numbered (`db/migrations/NNN_name.sql`); apply to prod via
  `mcp__Supabase__apply_migration` with the same name, and keep the repo file byte-identical
  to what was applied. Never let repo and prod drift (it happened once; see AUDIT doc).
* Substantial new scope: put open questions to Stack before building; he verifies before
  development begins.

## Project facts

* Facts live in `assignments`; Stack's planner state lives in `assignment_progress` /
  `reading_progress` and is **never overwritten by syncs** — one sanctioned exception (Phase 12b):
  a newly posted or changed Blackboard score advances `assignment_progress.status` to `graded`,
  forward-only, never from excused or DNF. A second, narrower path: `/inbox-apply` (since Phase 23
  run by the `apply` container after a sync and from the Inbox's "Apply answers" button; before
  that as `bb-sync` step 0) has written `assignment_progress` from Stack's answered Inbox items (scores,
  notes, one inserted row; `docs/inbox-decisions/2026-09-22.md`, `2026-09-23.md`); sanctioned
  narrowly on 2026-09-27 (DECISIONS, batch item 59): only rows named in an Inbox item Stack answered
  himself, status only when his words say so, scores as Blackboard shows them, every write in that
  day's log (since Phase 23: in `inbox_apply_writes` when it is made, and in the day file once the
  exporter has run). `reading_progress` has no such path. Status values and labels live in `web/src/lib/progress-status.ts`.
* Grades show one deterministic figure, "graded so far" (`web/src/lib/graded-so-far.ts`), computed
  only from mirrored Blackboard scores, `grade_components` and column links; what it leaves out is
  named under it. No what-if, no projections.
* Blackboard ingest runs inside a logged-in Blackboard Ultra tab (`ingest/bb_crawler.js`)
  → `bb_raw` → SQL transforms populate typed tables. See `PHASE2_FINDINGS.md` and the
  ingest cadence runbook.
* `course context/` holds professors' materials and is gitignored on purpose. The skill-side copy
  into it (`bb-sync` step 4b, `ingest/pull_files.mjs`) is sanctioned; the declined OneDrive mirror
  (v3 §4 D-7) is Phase 12's dropped desktop mirror, not this copy.
* Desktop shell (Phase 12): the Sync button **runs** `claude "/bb-sync <id>"` in Windows Terminal,
  and the shell's session is the web app's cookie in the `persist:bb2dash` partition. Requirements
  v2's R-13 "opens the terminal with the command ready" and R-23 "session in `safeStorage`" were
  superseded on 2026-09-16 (DECISIONS).
* Retrieval: hybrid mode of the `search` edge function is the default (see EVAL doc).
  Search UIs must scrub/label PPTX `[notes]` speaker-note markers and `Page N` headers.
* GUI: layout spec = the Nocturne artboards; CSS Modules + custom properties, no Tailwind.
  No fabricated numbers anywhere — no grade display until real gradebook data exists.
* Workspace (Phase 21, rebuilt behind the page in Phase 24a): a chat page at `/workspace`. A container runner
  answers each question with one or two `claude -p` turns of the pinned CLI (2.1.289) on Stack's Claude
  subscription: no API key, never `--bare`, never the Agent SDK. A heuristic router picks Haiku, Sonnet or
  Opus. On a middle or heavy question a cheap planning turn (Haiku, no tool, no MCP server, thinking off)
  first writes a search plan; the runner carries it out and the routed model answers. A lookup is one turn:
  the runner searches with his words. No turn resumes a CLI session: every turn's context is rebuilt from
  the database (the recent turns, a rolling summary, the passages found, attached files, the planner and
  grades feed), each block fenced as data, and no transcript is kept. **Still read-only for the planner**:
  the assistant's tools are off, two read tools over the course materials pass a gate
  (`search_materials`, `get_material_text`, with a per-turn limit and the request's course scope), and no
  notes store is read. The runner's login executes eleven SECURITY DEFINER functions and holds no table
  grant; through them, for a request or a job it holds, it reads the conversation, the course list, attached
  files' names and the feed's fixed columns (assignments, readings, the status of `assignment_progress` and
  `reading_progress`, posted scores). It can write neither planner state, a grade nor a fact table, and the
  assistant never works out a grade. **One retrieval store, pgvector, inside the bb2dash project**: course
  files (`bb_file_text`, `bb_text_embeddings`), his uploads and the assistant's memory
  (`workspace_documents`, `workspace_document_text`, `workspace_text_embeddings`), all on gte-small at 384
  dimensions, each vector table with its HNSW index, behind one search (`workspace_search`) that names the
  kind on every hit; `v_workspace_index_status` is the one status row. Memory summaries are built and stay
  off until Phase 24b (`WORKSPACE_MEMORY_JOBS=off`); the page's new controls are 24b's. Migrations 140–143
  and 190–199 are frozen; nothing is left in the block, so a fix needs a ruling and a new block.
* Inbox auto-apply (Phase 23): after a sync that closed done, the `sync` container files an
  `inbox_feedback` request when the Inbox's answered queue holds an answer that is not held (187: an
  answer a run could not apply is a row of `inbox_apply_holds`, which only `inbox_apply_close` writes; a
  sync does not try it again, a new answer or a press of Apply answers does); the `apply` container's worker
  (`apply/`) claims it, records the rows that need no reading itself, and runs `/inbox-apply` with one
  `claude -p` run for the rest. It writes as the role `inbox_apply_runner`, which can write only
  `assignments`, `assignment_progress`, `course_staff` and `courses.group_notes`, each write logged against
  an answered Inbox item (181). The decision is stored on the archived row first; the vault note is
  rendered from it by the scheduled export (`scripts/exports-run.mjs --notes-only` under the Windows task
  `Bb2dash-Exports`, registered at the follow-ups' cut-over by `scripts/register-exports.ps1`; a failed
  export shows on `just doctor` only), and `docs/inbox-decisions/<date>.md` with its pull request by
  `scripts/inbox-decisions-pr.mjs` on the host, by hand (`just file-decisions`). A decision whose item has
  a logged write is never skipped.
  The sync still holds no LLM (B-43). Claude's SQL there is two tools: `query` (one select, in a read-only
  transaction) and `apply_item` (one item; the server runs the transaction and checks each statement against
  an allow-list). Migrations 180–187 are frozen (183 went on at the cut-over, 2026-10-07; 187, the follow-ups'
  apply side, on 2026-10-09); 188 (the transform reads an archived superseded-file answer, and the fold
  stamps `applied_at` on a session answer whose pick its file carries) is applied at the follow-ups'
  cut-over and frozen from then; a fix is migration 189, the one number left. Since 185 the role also reads `bb_files` (21 columns, never `source_url`,
  `local_path` or `sha256`) and `sessions`, and writes neither: a session answer (`session_link/<file id>`)
  is `link_file_sessions`'s to apply, and the worker records it only when the file already shows it.

## Environment gotchas (cloud sessions)

* Sandboxed sessions **cannot reach `*.supabase.co`** (org egress policy 403s CONNECT).
  Invoke edge functions server-side instead: `select net.http_post(...)` via
  `mcp__Supabase__execute_sql`, then read `net._http_response`. pg_net is enabled for this.
* Edge functions: `verify_jwt` is on — use the legacy anon JWT, not the `sb_publishable_` key.
  Exception: `calendar-push` runs with `verify_jwt` off and authenticates the tick's
  `x-push-secret` header from Vault (Phase 11); nothing else calls it.
* Edge CPU budget ≈ 8–9 embedding parts per invocation; `embed-corpus` is resume-safe per part.
* Secrets: service key never in a browser or the repo; publishable/anon key is fine
  client-side (RLS is the boundary). Since Phase 14 (R-28) the sync runs in Docker: the `sync`
  container (`compose.yaml`, `docker/sync/`, `sync/`) holds Blackboard's login, logs in through
  `http://127.0.0.1:6080/vnc.html`, and reaches the database only as the `sync_runner` role through its
  SECURITY DEFINER functions (091, 093). Secrets live in `SECRETS_DIR` (`C:/Users/stack/.bb2dash-secrets/`),
  outside every repo; the service key's only home is `bb2dash_mcp_service_key` there. Never
  `docker compose up` or recreate `sync` while a sync is open, and never touch the `bb-profile` volume (it is
  the login). The Windows `/bb-sync` skill stays the fallback. Keep OS-bound code behind thin adapters.
* Apply service (Phase 23): `apply` in `compose.yaml` sits behind `profiles: [apply]`, on its own network
  `apply-net`, and mounts neither `bb-profile` nor `course-files`: a Claude process never shares a network
  or a volume with the Blackboard login (`docker/apply/image.test.mjs`). Its secrets are files:
  `inbox_apply_db_url` (the role's session-pooler DSN), `claude_oauth_token` and `bb2dash_mcp_service_key`
  (read by the materials server only). Its firewall is generated from the Workspace's
  (`node docker/apply/fork-firewall.mjs --write` after that script changes). Start, restart and rebuild it
  alone (`docker compose up -d --build apply`), never through a bare `up` while a sync is open.
  bb2dash-stack's `.env` names the profile from the follow-ups' cut-over on (`COMPOSE_PROFILES=workspace,apply`,
  Stack's line), and its doctor has an `apply` row and an `exports` row. A test build never takes the live
  tag `bb2dash-apply:local`: it is built under a tag of its own through a second compose file. Phase 23 is
  accepted by `just accept 23` (pack `acceptance/23/`), which stops and starts `apply` alone.
* Workspace services (Phase 21; Phase 24a): `workspace`, `workspace-ingest` and `workspace-extract` in
  `compose.yaml` sit behind `profiles: [workspace]`, so a plain `up` never starts them; bb2dash-stack's
  `.env` turns the profile on. From bb2dash-stack each is started, restarted and rebuilt alone, by name
  (`docker compose up -d --build workspace`; `workspace-extract` before `workspace-ingest`); `just up`
  rebuilds every service and is never run while a sync is open (DECISIONS 2026-10-07). On a phase branch,
  before the merge, they run only as a test compose project from a phase worktree (`bb2dash-wt24` in Phase
  24a), built under test tags through a second compose file so that no live tag moves, the service named in
  every command, and only inside a window Stack has agreed to: one runner answers the queue at a time.
  `workspace`: the runner reaches the database only as the login role `workspace_runner`, through eleven
  SECURITY DEFINER functions (142, 143, 196, 199), and mounts three secrets from `SECRETS_DIR` as files:
  `workspace_runner_db_url`, `claude_oauth_token`, `bb2dash_mcp_service_key` (the one credential there that
  could write; read only by the materials package, DECISIONS 2026-10-05). Its CLI config folder is a tmpfs.
  `workspace-ingest` reads his uploads: no model, no Claude token, no service key; its own network
  `ingest-net` behind its own firewall (generated: `node docker/workspace-ingest/fork-firewall.mjs --write`
  after the Workspace's script changes); two secrets, `workspace_ingest_db_url` (role
  `workspace_ingest_runner`: four functions, no table grant) and `supabase_anon_jwt`. `workspace-extract`
  runs the file parser alone: no network, no secret, a read-only root, every capability dropped. The two
  meet only in the tmpfs volume `ingest-exchange`. No Claude process and no upload parser shares a network
  or a volume with the Blackboard login.
