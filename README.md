# bb2dash

Blackboard Ultra → Supabase → a personal academic hub. Syracuse University, Fall 2026.

## Layout
- `db/migrations/` — schema, numbered. `001` typed warehouse, `002` raw landing table, `003` file catalog + storage bucket, `004` Blackboard identifiers.
- `db/seed/` — syllabus-derived seed (courses, grading rules, assignments, sessions, readings).
- `ingest/bb_crawler.js` — runs inside a logged-in Blackboard tab; posts raw JSON to `bb_raw`.
- `DATA_SYNTAX.md` — data dictionary and conventions. `PHASE2_FINDINGS.md` — what the first Blackboard pass found. `NOTES.md` — phases and open caveats.

## Rebuild from scratch
```
psql "$DATABASE_URL" -f db/migrations/001_schema.sql -f db/migrations/002_raw_landing.sql \
  -f db/migrations/003_bb_files_bucket.sql -f db/seed/002_seed_fall2026_core.sql \
  -f db/seed/003_seed_fall2026_assignments.sql -f db/seed/004_seed_fall2026_sessions_readings.sql \
  -f db/migrations/004_bb_identifiers.sql
```

## Ingest
Open Blackboard in Claude's built-in browser, log in, then in page context:
```js
const bb = installCrawler({ userId: '_21025199_1', supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_PUBLISHABLE_KEY });
await bb.runAll({ termName: 'Fall 2026' });
```
Then run the transform SQL (see `PHASE2_FINDINGS.md`) to reconcile `bb_raw` into the typed tables.

## Workflow
Branches for development, local port for visual testing, push to prod only on explicit request.
