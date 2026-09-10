# bb2dash — Project State

> Updated upon each PR. Last update: **2026-09-10**, GUI v1 phase (`feat/gui-v1`, PR #4 open,
> reconciled with the merged Retrieval-MCP phase on `main`).
> Convention: see root `CLAUDE.md`. History of merged phases at the bottom.

## Where the product is

**Backend foundation complete and live; GUI v1 built and build-green, pending live preview.**
The Blackboard → Supabase pipeline, typed warehouse, document corpus, and two-tier search API
are all in prod. The Next.js hub app (`web/`) is written — all four v1 screens — and the full
integrated tree passes `typecheck` + `build`, but has NOT yet been verified against live data
(needs the Vercel preview, blocked on a Vercel project-create permission).

Live in prod (Supabase `bb2dash`, ref `goultdzqcavefcgnifdy`):

| Layer | State |
|---|---|
| Raw capture | `bb_raw` crawls via `ingest/bb_crawler.js`; per-course maps at v2+; last pull 2026-09-08 |
| Typed warehouse | migrations 001–019 (repo numbering; see note below); 7 courses, 66 assignments, 145 sessions, planner tables |
| Effort model | migration 015 `effort_base` (19 types) + 016 `v_work_items` (152 items, effort + source) |
| Document corpus | 64 files (100% in Storage + local mirror + sha256), 534 text units extracted |
| Search: FTS | tsvector+GIN on file text / content / announcements; `search_file_text()` |
| Search: vectors | 1,195 gte-small embeddings (384-dim), 100% coverage; `match_file_text()`, `hybrid_search_file_text()` (`p_min_similarity` floor + single-source `similarity`, migrations 012–013) |
| Edge functions | `embed-corpus` (resume-safe batch embedder), `search` **v3** (retrieval API; **default mode: hybrid**; optional `min_similarity` floor) |
| Retrieval MCP | `mcp-server/` — stdio MCP server for Claude Code: `search_materials` / `get_material_text` / `list_courses` (merged, PR #5) |
| GUI (`web/`) | Next.js 16 + TS, Supabase Auth, 4 screens (Today, Course, Materials, ⌘K search); build-green, not yet previewed |
| Auth | one user (`emstacho@syr.edu`) created; signups NOT yet disabled; RLS still permissive (W-9 pending) |

## What has been done (by phase)

1. **Phase 1 — data syntax + syllabus seed** (pre-repo, 2026-09-02): schema design, 6 grading
   models as declarative rules, facts-vs-state separation, source/confidence on every row.
2. **Phase 2 — Blackboard capture** (2026-09-02/03): crawler over Ultra's internal JSON API,
   course maps, full file harvest + text extraction via bb-course-map / bb-course-pull skills.
3. **Phase 3 — audit + search schema** ([PR #1](https://github.com/emstacho-su/bb2dash/pull/1),
   merged 2026-09-09): extract audit (`AUDIT_2026-09-09.md`), backfilled drifted migrations
   005–009, migration 010 search layer.
4. **Phase 4 — embedding POC** ([PR #2](https://github.com/emstacho-su/bb2dash/pull/2),
   merged 2026-09-09): gte-small via edge functions, $0; corpus fully embedded; eval verdict
   in `EVAL_EMBEDDING_POC.md` — hybrid hit@1 9/10 vs FTS 1/10; hybrid is the hub default.
5. **Phase 5 — Retrieval MCP** ([PR #5](https://github.com/emstacho-su/bb2dash/pull/5), merged
   2026-09-09, by the concurrent session): migrations 012–013 (`hybrid_search_file_text` gains a
   `p_min_similarity` vector-arm floor and a real, single-source `similarity` column), `search`
   edge function v3 (forwards `min_similarity`, de-dups vector parts per unit), and `mcp-server/`.
6. **Phase 6 — GUI v1** (`feat/gui-v1`, [PR #4](https://github.com/emstacho-su/bb2dash/pull/4)
   open, 2026-09-09/10): stack decided Next.js on Vercel + Supabase Auth, no Docker (Docker-first
   local plan superseded — see reconciliation doc). Migrations **014–019** (planner columns,
   effort model, work items, course display, files-current, sync contract — renumbered from
   012–017 on 2026-09-10 after merging main; see
   `docs/planning/41_RECONCILIATION_gui_vs_retrieval-mcp.md`). Four screens built by parallel
   Opus workers in isolated worktrees: Today (14-day effort tracker), Course (week rail + lanes +
   AI policy), Materials (signed-URL Open ladder), ⌘K hybrid search (0.80 "keyword match" label +
   speaker-notes scrubbing; verified compatible with search v3 — same result columns). Full tree
   typecheck + build green after the merge. Recovered local planning round in `docs/planning/`.

**Migration numbering note.** Prod's `schema_migrations` recorded the GUI migrations under their
pre-reconciliation names (`012_planner_columns` … `017_sync_contract`) next to main's
`012_hybrid_similarity` / `013_hybrid_similarity_single_source`. Same DDL, live once; the repo
names it 014–019. This is a name-level artifact, NOT drift — a rebuild in README order reproduces
prod. **Do not re-apply 014–019.**

## Remaining before the GUI phase merges

0. ~~Reconcile `feat/gui-v1` with main's Retrieval-MCP phase~~ — done 2026-09-10 (merge +
   migration renumber; branch is up to date with `main`).
1. **Stack: create the Vercel project** (connector 403s on project-create — permission/SAML on
   Stack's side). Settings in `web/README.md`; preview only.
2. **Deploy the preview** (I do this once the project exists) → **Stack visual sign-off** against
   live data — the first real test, since the sandbox can't reach `*.supabase.co`.
3. **Stack: disable signups** (Supabase Auth → Sign In / Providers).
4. **W-9: RLS hardening** — rewrite the 25 permissive `authenticated using(true)` policies to
   `auth.uid() = app_owner()`. Deliberately sequenced AFTER the permissive-RLS preview so a
   policy bug can't be mistaken for a screen bug. Required before any public URL carries data.

## Slotted for the future (backlog, rough priority order)
1. Matched-passage snippets — `search` returns the unit head, not the matched part;
   `part_range` is stored and unused. Highest-value retrieval polish.
2. Near-duplicate file handling — four `IST466M3 Schedule` versions crowd top ranks;
   needs a supersede rule in `bb_files`.
3. Recurring crawl cadence (weekly + before class days) + `bb_raw` diffing into typed tables;
   capture the Blackboard iCal feed URL for cheap due-date sync.
4. Remaining data gaps: IST.323 Security-in-the-News group/date, IST.466 Group #3 slots,
   OCR for the two image-only files.
5. Professional-side data (deferred by design).

## Known issues / operational notes

* Sandboxed Claude sessions cannot reach `*.supabase.co` (org egress policy) — invoke edge
  functions server-side via `pg_net` (`net.http_post`); pg_net is enabled and load-bearing.
* Edge CPU budget caps embedding at ~8–9 parts per invocation; `embed-corpus` resumes per-part.
* `part_range` on text 276 is one char long (UTF-16 vs Postgres char counting) — cosmetic
  unless slicing text by `part_range`; fix alongside backlog item 1.
* Function search-path advisor warnings (pre-existing pattern) on the search RPCs.
* Never ship the service key to a browser; anon key is insert-only by design.
