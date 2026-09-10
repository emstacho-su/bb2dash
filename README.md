# bb2dash

Blackboard Ultra → Supabase → a personal academic hub. Syracuse University, Fall 2026.

## Layout
- `db/migrations/` — schema, numbered. `001` typed warehouse, `002` raw landing table, `003` file catalog + storage bucket, `004` Blackboard identifiers, `005` file corpus (buckets, extracted text), `006` course maps, `007` text anon insert, `008` canonical file layout, `009` v_upcoming fix, `010` search layer (FTS + pgvector).
- `db/seed/` — syllabus-derived seed (courses, grading rules, assignments, sessions, readings).
- `ingest/bb_crawler.js` — runs inside a logged-in Blackboard tab; posts raw JSON to `bb_raw`.
- `supabase/functions/` — edge functions: `embed-corpus` (gte-small batch embedder), `search` (retrieval API: fts/vector/hybrid; default hybrid).
- `mcp-server/` — stdio MCP server that gives Claude Code `search_materials` / `get_material_text` / `list_courses` over the corpus. See `mcp-server/README.md`.
- `DATA_SYNTAX.md` — data dictionary and conventions. `PHASE2_FINDINGS.md` — what the first Blackboard pass found. `NOTES.md` — phases and open caveats.

## Rebuild from scratch
```
psql "$DATABASE_URL" -f db/migrations/001_schema.sql -f db/migrations/002_raw_landing.sql \
  -f db/migrations/003_bb_files_bucket.sql -f db/seed/002_seed_fall2026_core.sql \
  -f db/seed/003_seed_fall2026_assignments.sql -f db/seed/004_seed_fall2026_sessions_readings.sql \
  -f db/migrations/004_bb_identifiers.sql -f db/migrations/005_file_corpus.sql \
  -f db/migrations/006_course_maps.sql -f db/migrations/007_text_anon_insert.sql \
  -f db/migrations/008_file_layout.sql -f db/migrations/009_upcoming_excludes_missed.sql \
  -f db/migrations/010_search_layer.sql -f db/migrations/011_gte_small.sql \
  -f db/migrations/012_hybrid_similarity.sql -f db/migrations/013_hybrid_similarity_single_source.sql \
  -f db/migrations/014_planner_columns.sql -f db/migrations/015_effort_base.sql \
  -f db/migrations/016_work_items.sql -f db/migrations/017_course_display.sql \
  -f db/migrations/018_files_current.sql -f db/migrations/019_sync_contract.sql
```
Migrations are additive and numbered; the repo file is byte-identical to what was applied to prod.
Prod's `schema_migrations` records 014–019 under their pre-reconciliation names (012–017) — a
name-level artifact, not drift; see `docs/planning/41_RECONCILIATION_gui_vs_retrieval-mcp.md`.

## Ingest
Open Blackboard in Claude's built-in browser, log in, then in page context:
```js
const bb = installCrawler({ userId: '_21025199_1', supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_PUBLISHABLE_KEY });
await bb.runAll({ termName: 'Fall 2026' });
```
Then run the transform SQL (see `PHASE2_FINDINGS.md`) to reconcile `bb_raw` into the typed tables.

## Workflow
Branches for development, local port for visual testing, push to prod only on explicit request.
