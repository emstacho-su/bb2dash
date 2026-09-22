# Reconciliation — `feat/gui-v1` (PR #4) vs the Retrieval-MCP phase on `main` (PR #5)

Produced 2026-09-10 on `feat/gui-v1`. Repo-side only: **no migration was applied, no DB row was
written, no edge function was deployed** by this reconciliation.

## What happened

Two Claude sessions worked bb2dash concurrently on 2026-09-09 and both took migration number 012+:

* **Retrieval-MCP phase** (merged to `main` as PR #5): `mcp-server/`, `supabase/functions/search`
  v3, and migrations `012_hybrid_similarity.sql` + `013_hybrid_similarity_single_source.sql`
  (the `hybrid_search_file_text` upgrade — `p_min_similarity` floor on the vector arm, real
  `similarity` column, then the "single source of truth for a unit's similarity" refinement).
  Both are applied to prod; prod's function body is the 013 version.
* **GUI v1 phase** (`feat/gui-v1`, open as PR #4): migrations `012_planner_columns` …
  `017_sync_contract`, plus `018_hybrid_similarity.sql` — a copy of main's 012 captured "under the
  next free number so the repo reproduces prod". That copy was stale by the time main's 013
  landed, and once main was merged into the branch both numbering schemes coexisted.

## Renumber map (`db/migrations/`, on `feat/gui-v1`)

| Was (gui-v1)                        | Now                                        | Content                                              |
|-------------------------------------|--------------------------------------------|------------------------------------------------------|
| —                                   | `012_hybrid_similarity.sql`                | from `main` — canonical, kept byte-identical         |
| —                                   | `013_hybrid_similarity_single_source.sql`  | from `main` — canonical, kept byte-identical         |
| `012_planner_columns.sql`           | `014_planner_columns.sql`                  | planner-owned columns                                |
| `013_effort_base.sql`               | `015_effort_base.sql`                      | `effort_base` + 19 seed rows                         |
| `014_work_items.sql`                | `016_work_items.sql`                       | `v_work_items`                                       |
| `015_course_display.sql`            | `017_course_display.sql`                   | `v_course_display`, GEO merge, `room_disputed`       |
| `016_files_current.sql`             | `018_files_current.sql`                    | `bb_files.superseded_by`, `link_confidence`, view    |
| `017_sync_contract.sql`             | `019_sync_contract.sql`                    | `sync_runs` status cols, `sync_stage_runs`, freshness|
| `018_hybrid_similarity.sql`         | **deleted**                                | superseded by main's 012 + 013 (already in prod)     |

Renames were done with `git mv` (history follows); the only in-file change is the leading
`-- bb2dash :: NNN_name.sql` header line. The six GUI migrations never touch
`hybrid_search_file_text` and 012/013 never touch planner/effort/display/sync objects, so applying
them after 013 instead of before it produces the same final schema.

Final sequence: `001`–`011` (shared) → `012`, `013` (retrieval) → `014`–`019` (GUI v1).

## Prod `schema_migrations` — an accepted name-level artifact, NOT drift

Prod recorded the GUI migrations under their **old** names at apply time
(`012_planner_columns`, `013_effort_base`, `014_work_items`, `015_course_display`,
`016_files_current`, `017_sync_contract`), alongside main's `012_hybrid_similarity` and
`013_hybrid_similarity_single_source`. The repo now names the same DDL `014`–`019`.

This is a bookkeeping difference in the version-name column only. The DDL bodies are identical,
every object exists in prod exactly once, and a fresh `psql` rebuild in the README order
(`001`→`019`) reproduces prod's schema. **Do not "fix" this by re-applying 014–019 with
`apply_migration`** — that would attempt to re-create existing objects or, at best, insert duplicate
version rows for DDL that is already live. If a future session wants the names to line up, the
correct move is a one-off `update supabase_migrations.schema_migrations set version/name …`
rename, agreed with Stack, never a re-apply.

Byte-identity rule (CLAUDE.md) still holds for the DDL body: what is in the repo file is what
prod ran. The header comment line is the only delta versus what was applied under the old name.

## Other merge outcomes

* `supabase/functions/search/index.ts` — took main's v3 outright (gui-v1 never modified it).
* `mcp-server/` — came in cleanly from main.
* `NOTES.md` — only textual conflict (both sides appended one bullet to "Files"); resolved by
  keeping both bullets and adding a third pointing at the renumbered 014–019.
* `README.md` — main's `mcp-server/` bullet merged cleanly; the rebuild command was extended from
  010 to the full 001–019 sequence.
* W-8 cmd-K UI vs search v3 — **no functional fix needed.** v3's `results` rows carry the same
  ten columns (`file_id, text_id, course_id, bucket, file_name, unit_kind, unit_no, score,
  similarity, snippet`) the palette reads; the additions are an optional `min_similarity` request
  field (not sent — the palette deliberately labels "keyword match" rather than filtering) and an
  echoed `min_similarity` response field, which was added to the `SearchResponse` type as
  optional. The 500 body no longer includes `details`/`hint`; the UI only ever read `error`.
* Planning docs `30_PHASED_PLAN.md` / `31_PLAN_REVIEW.md` keep their pre-build numbering — they
  are historical and `40_RECONCILIATION_2026-09-09.md` already maps plan numbers → repo numbers.
