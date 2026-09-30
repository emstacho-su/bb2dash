# Phase 18 walk and evidence (98w)

Branch `feat/ingest-corpus-18`. Brief `docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md` (frozen 2026-09-29).

## Task 20 — file 68 by hand (PM, 2026-09-30, on Stack's permission grant)

`GEO 103 (2026) - Reducing Environmental Impact- Individual v. Collective Action.doc` (GEO.103.lecture reading
questions). This laptop has no local mirror of it, so the bytes came from Storage (`bb-files`, 26,624 bytes) into the
session scratchpad; `antiword -w 0` gave 1,127 characters. The unit was posted over PostgREST with the anon key the
pull uses (`POST /rest/v1/bb_file_text` → 201; `file_id 68, unit_kind doc, unit_no 1`), so the document text never
went into SQL; then `update bb_files set text_status = 'extracted' where id = 68` (owner SQL, ids only), then
`node ingest/embed_corpus.mjs` → `1 row(s) in, 0 part(s) left`; `--check` → `missing_parts_before=0`.

- `select text_status from bb_files where id = 68` → `extracted`; `select count(*) from bb_file_text where file_id = 68` → 1.
- `node scripts/db-test.mjs --only phase18_post_embed_checks.sql` → `FAIL (a) no text unit: 161, 162, 452`: (b)
  no longer names 68, and (c)/(d) pass. The three remaining files wait for the gate sync's in-sync pull (task 16/17).
