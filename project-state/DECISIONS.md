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
