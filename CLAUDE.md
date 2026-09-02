# bb2dash — instructions for Claude Code

## Workflow (Stack's rule)
- Develop on branches (`feat/`, `fix/`, `chore/`), never directly on `main`.
- Anything visual: run the dev server on a local port, give Stack the URL, wait for his OK.
- Push to prod (merge/push to `main`, Vercel deploy) ONLY when Stack explicitly asks in that conversation. Otherwise stop at "ready to push when you say so."

## Project facts
- Supabase project `bb2dash` (ref `goultdzqcavefcgnifdy`). Publishable key is fine client-side; the service key never touches a browser or this repo.
- Blackboard ingest runs inside a logged-in Blackboard Ultra tab (`ingest/bb_crawler.js`) and posts raw JSON to `bb_raw`; SQL transforms populate typed tables. Facts live in `assignments`; Stack's planner state lives in `assignment_progress` and is never overwritten by syncs.
- `course context/` holds professors' materials and is gitignored on purpose.
- Read `NOTES.md` for phases and caveats, `DATA_SYNTAX.md` for the schema, `PHASE2_FINDINGS.md` for what Blackboard exposes.
