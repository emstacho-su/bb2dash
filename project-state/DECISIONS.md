# bb2dash — Decision Log

Running log of design decisions and their reasoning. Append-only; newest last.

| Date | Decision | Why |
|---|---|---|
| 2026-09-02 | Grading stored as declarative rules, not weight columns | 6 courses use 4 structurally different grading models |
| 2026-09-02 | Facts (`assignments`) separated from state (`assignment_progress`) | re-sync can rewrite facts without touching Stack's planner |
| 2026-09-02 | Every fact row carries `source` + `confidence` | reconciliation only overwrites `tentative`/`inferred`; conflicts with `confirmed` get surfaced |
| 2026-09-03 | Crawler holds only the publishable key; insert-only RLS | browser-side code must never see the service key |
| 2026-09-09 | Embeddings in their own table keyed `(text_id, model, part_no)`, not a column on `bb_file_text` | re-embedding with a new model never touches extraction data; long units split without re-chunking |
| 2026-09-09 | Embedding model: **gte-small via Supabase Edge Functions** (384-dim, OSS, $0) | solves query-time embedding with the same free code path; no Docker, no API cost; upgrade = re-embed ~1.2k rows |
| 2026-09-09 | Corpus chunks embedded with `"{course} {bucket} — {file_name}: "` header; queries embedded raw | header carries context for thin slides; prefixing the query would push it away from passages |
| 2026-09-09 | `embed-corpus` persists per-part, not per-unit | edge CPU budget kills long units mid-request; per-part insert makes kills lossless and re-runs idempotent |
| 2026-09-09 | Hub retrieval default: **hybrid** (RRF) | ties vector on ranking (hit@1 9/10) but returns 10 distinct units per 10 results vs ~6; degrades to vector when FTS finds nothing |
| 2026-09-09 | `pg_net` enabled and kept | only route from sandboxed sessions to edge functions (org egress blocks supabase.co); pairs with pg_cron later |
| 2026-09-09 | Docker: skipped | Postgres+pgvector managed by Supabase; model lives in edge runtime; nothing to containerize |
| 2026-09-09 | Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word | Stack's instruction |
| 2026-09-09 | GUI stack: **Next.js on Vercel + Supabase Auth**, no Docker | supersedes the recovered local "Docker-first hub" plan; pg_cron+pg_net cover the scheduler jobs; see `docs/planning/40_RECONCILIATION_2026-09-09.md` |
| 2026-09-09 | Electron endgame parked to a later phase, not dropped | its only unique value (open local OneDrive files, spawn `claude`) doesn't survive on Vercel; browser fallbacks (signed URLs, copy-path) ship first |
| 2026-09-09 | Renderer: CSS Modules + custom properties, **no Tailwind** | the `.dc.html` Nocturne artboards are the layout spec and port 1:1 |
| 2026-09-09 | GUI v1 scope cuts: no bell/announcements, no planner day view, **no grade display** this term, 14-day tracker window | honesty rule (no gradebook data yet) + reconciliation scope |
| 2026-09-09 | Effort model from `20_D1` §3 (19-type base, ≥5-points multiplier gate, source label per figure) | authoritative over the `21_D2` variant where they disagreed |
| 2026-09-09 | Screen workers run in **isolated git worktrees**, PM integrates by copying deliverable files | prevents 4 parallel Opus workers (and a concurrent external session) from clobbering one tree |
| 2026-09-09 | Adopted the out-of-band `hybrid_search_file_text` upgrade (relevance floor + similarity), captured as migration 018 | backward compatible (null-default param); a concurrent session applied it under a colliding `012` name; reverting good work made no sense |
| 2026-09-09 | RLS hardening (W-9) sequenced AFTER the first live preview | a policy bug during hardening must not be confused with a screen bug; also safer to tighten once, late, while a second session writes prod |
| 2026-09-09 | A second Claude session also edits bb2dash (prod + repo) | fetch-before-act, never force-push, flag anything not originated here — treat prod and branch as shared |
| 2026-09-10 | `main`'s `012_hybrid_similarity` + `013_hybrid_similarity_single_source` are the **canonical** hybrid-similarity migrations; gui-v1's `018_hybrid_similarity.sql` deleted | 018 was a stale copy of main's 012 (main's 013 further refined the function; prod holds 013); one source of truth per migration |
| 2026-09-10 | GUI v1 migrations renumbered 012–017 → **014–019** (`planner_columns`, `effort_base`, `work_items`, `course_display`, `files_current`, `sync_contract`) after merging main into `feat/gui-v1` | two sessions took 012+ concurrently; the GUI set is independent of `hybrid_search_file_text`, so slotting it after 013 yields the same final schema; `git mv` keeps history |
| 2026-09-10 | The renumber is **repo-only**; prod `schema_migrations` keeps the old names (012–017) for the same DDL — accepted name-level artifact, not drift. Never re-apply 014–019 | the objects are live once; a re-apply would fail or double-record; a rebuild in README order reproduces prod. See `docs/planning/41_RECONCILIATION_gui_vs_retrieval-mcp.md` |
| 2026-09-10 | W-8 palette does NOT send `min_similarity` to search v3; it keeps labelling sub-0.80 hits "keyword match" | the overlay prefers "always show something" (v3 header says as much); the floor is for agent callers (mcp-server default 0.78) |
