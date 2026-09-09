# bb2dash — Project State

> Updated upon each PR. Last update: **2026-09-09**, after PR #2 (embedding POC) merged.
> Convention: see root `CLAUDE.md`. History of merged phases at the bottom.

## Where the product is

**The backend retrieval foundation is complete and live.** Blackboard → Supabase pipeline,
typed academic warehouse, full document corpus with text extraction, and a validated
two-tier search API. No user-facing app exists yet — the hub GUI is the next major phase.

Live in prod (Supabase `bb2dash`, ref `goultdzqcavefcgnifdy`):

| Layer | State |
|---|---|
| Raw capture | `bb_raw` crawls via `ingest/bb_crawler.js`; per-course maps at v2+; last pull 2026-09-08 |
| Typed warehouse | migrations 001–009; 7 courses, 66 assignments, 145 sessions, planner tables |
| Document corpus | 64 files (100% in Storage + local mirror + sha256), 534 text units extracted |
| Search: FTS | tsvector+GIN on file text / content / announcements; `search_file_text()` |
| Search: vectors | 1,195 gte-small embeddings (384-dim), 100% coverage; `match_file_text()`, `hybrid_search_file_text()` |
| Edge functions | `embed-corpus` (resume-safe batch embedder), `search` (retrieval API; **default mode: hybrid**) |

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

## Slotted for the future

**Next (GUI phase, pending scope decisions):** the hub app — dashboard (upcoming/overdue,
grades), planner (assignment_progress editing), and corpus search UI over the `search` API.
Gating decision: browser read access — RLS currently allows the anon key insert-only, so the
GUI needs Supabase Auth (or a deliberate read policy) before anything ships to a browser.

**Backlog, rough priority order:**
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
