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
  forward-only, never from excused or DNF. A second, narrower path: `/inbox-apply` (which runs as
  `bb-sync` step 0) has written `assignment_progress` from Stack's answered Inbox items (scores,
  notes, one inserted row; `docs/inbox-decisions/2026-09-22.md`, `2026-09-23.md`); sanctioned
  narrowly on 2026-09-27 (DECISIONS, batch item 59): only rows named in an Inbox item Stack answered
  himself, status only when his words say so, scores as Blackboard shows them, every write in that
  day's log. `reading_progress` has no such path. Status values and labels live in `web/src/lib/progress-status.ts`.
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
* Workspace (Phase 21): a chat page at `/workspace`. A container runner answers each question with one
  `claude -p` turn of the pinned CLI (2.1.289) on Stack's Claude subscription: no API key, never `--bare`,
  never the Agent SDK. A heuristic router picks Haiku, Sonnet or Opus. **v1 is read-only**: the assistant's
  tools are off, four read tools over the materials and the two bb2dash notes collections pass a gate, and
  the runner's database login cannot reach planner state (`assignment_progress`, `reading_progress`) or a
  fact table. Migrations 140–143 are frozen; a fix is a new migration in 144–149.

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
* Workspace service (Phase 21): `workspace` in `compose.yaml` sits behind `profiles: [workspace]`, so a plain
  `up` never starts it; bb2dash-stack's `.env` turns it on (`COMPOSE_PROFILES=workspace`, acceptance step 13).
  From bb2dash-stack it is started, restarted and rebuilt alone (`docker compose up -d --build workspace`,
  `docker compose restart workspace`); `just up` rebuilds every service and is never run while a sync is open
  (DECISIONS 2026-10-07). On the phase branch, before the merge, it runs only as compose project `bb2dash-wt21`
  from a phase worktree, the service named in every command. Its runner reaches the database only as the login
  role `workspace_runner`, through five
  SECURITY DEFINER functions (`workspace_claim`, `workspace_begin`, `workspace_stream`, `workspace_finish`,
  `workspace_heartbeat`; 142, 143), and the service mounts four secrets from `SECRETS_DIR` as files:
  `workspace_runner_db_url`, `claude_oauth_token`, `bb2dash_mcp_service_key`, `harness_database_url` (the
  last two could write; each is read only by its own MCP server, accepted for v1, DECISIONS 2026-10-05).
