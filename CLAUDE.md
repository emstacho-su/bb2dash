# bb2dash — session guide

Blackboard Ultra → Supabase → personal academic hub. Syracuse, Fall 2026. Owner: Stack.
Supabase project: `goultdzqcavefcgnifdy` (us-east-1, Postgres 17). Full access via Supabase MCP.

## Read first

1. `project-state/STATUS.md` — where the product is, what's done, what's next. **Start here.**
2. `project-state/DECISIONS.md` — why things are the way they are. Don't relitigate silently.
3. `DATA_SYNTAX.md` — data dictionary, ID conventions, enums, search layer.

## Workflow SOP (Stack's rules — follow them)

* Develop on branches; never commit directly to `main`.
* Commit + push to the working branch as each task completes, not batched at the end.
* **One PR per phase.** Merge only when Stack says so.
* **Upon each PR: update `project-state/STATUS.md`** (what shipped, where the product is,
  what's slotted next) **and append any new decisions to `project-state/DECISIONS.md`.**
  These updates go in the same PR.
* Migrations are additive and numbered (`db/migrations/NNN_name.sql`); apply to prod via
  `mcp__Supabase__apply_migration` with the same name, and keep the repo file byte-identical
  to what was applied. Never let repo and prod drift (that happened once; see AUDIT doc).
* Substantial new scope: put open questions to Stack before building; he verifies before
  development begins.

## Environment gotchas

* Sandboxed sessions **cannot reach `*.supabase.co`** (org egress policy 403s CONNECT).
  Invoke edge functions server-side instead: `select net.http_post(...)` via
  `mcp__Supabase__execute_sql`, then read `net._http_response`. pg_net is enabled for this.
* Edge functions: `verify_jwt` is on — use the legacy anon JWT, not the `sb_publishable_` key.
* Edge CPU budget ≈ 8–9 embedding parts per invocation; `embed-corpus` is resume-safe per part.
* Secrets: service key never in a browser or the repo; anon key is insert-only by RLS design.
