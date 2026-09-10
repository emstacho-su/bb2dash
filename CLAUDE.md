# bb2dash — session guide

Blackboard Ultra → Supabase → personal academic hub. Syracuse, Fall 2026. Owner: Stack.
Supabase project: `goultdzqcavefcgnifdy` (us-east-1, Postgres 17). Full access via Supabase MCP.

## Read first

1. `project-state/STATUS.md` — where the product is, what's done, what's next. **Start here.**
2. `project-state/DECISIONS.md` — why things are the way they are. Don't relitigate silently.
3. `DATA_SYNTAX.md` — data dictionary, ID conventions, enums, search layer.
4. `docs/planning/40_RECONCILIATION_2026-09-09.md` — how the local planning round and the
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
  `reading_progress` and is **never overwritten by syncs**.
* Blackboard ingest runs inside a logged-in Blackboard Ultra tab (`ingest/bb_crawler.js`)
  → `bb_raw` → SQL transforms populate typed tables. See `PHASE2_FINDINGS.md` and the
  ingest cadence runbook.
* `course context/` holds professors' materials and is gitignored on purpose.
* Retrieval: hybrid mode of the `search` edge function is the default (see EVAL doc).
  Search UIs must scrub/label PPTX `[notes]` speaker-note markers and `Page N` headers.
* GUI: layout spec = the Nocturne artboards; CSS Modules + custom properties, no Tailwind.
  No fabricated numbers anywhere — no grade display until real gradebook data exists.

## Environment gotchas (cloud sessions)

* Sandboxed sessions **cannot reach `*.supabase.co`** (org egress policy 403s CONNECT).
  Invoke edge functions server-side instead: `select net.http_post(...)` via
  `mcp__Supabase__execute_sql`, then read `net._http_response`. pg_net is enabled for this.
* Edge functions: `verify_jwt` is on — use the legacy anon JWT, not the `sb_publishable_` key.
* Edge CPU budget ≈ 8–9 embedding parts per invocation; `embed-corpus` is resume-safe per part.
* Secrets: service key never in a browser or the repo; publishable/anon key is fine
  client-side (RLS is the boundary). There is no Docker in this project.
