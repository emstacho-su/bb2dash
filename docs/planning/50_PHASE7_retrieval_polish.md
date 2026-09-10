# Phase 7 — Retrieval polish (matched-passage snippets + near-duplicate files)

Date: 2026-09-10. PM: the Fable session. Product manager: Stack. Branch: `feat/retrieval-polish`
(one PR for the phase). Two Opus workers on isolated worktrees / branches, PM integrates.

Closes backlog items 1 and 2 from `project-state/STATUS.md`:

1. **Matched-passage snippets.** `hybrid_search_file_text` returns `left(t.text, 300)` — the head
   of the unit — even when the hit came from part 3 of a 4,000-char syllabus. `part_range` is
   stored on every embedding row and unused. The ⌘K palette and the MCP server both show the
   wrong passage for long units.
2. **Near-duplicate files.** Four `IST466M3 Schedule …` versions (plus two rosters) crowd the top
   ranks. Migration 018 added `bb_files.superseded_by` + `v_bb_files_current` but seeded nothing
   and search ignores it.

Also: the `part_range` on text 276 is one char long (`Known issues`). Fix root cause + data.

## Contract (frozen — both workers build against this)

### `hybrid_search_file_text` (migration `021_matched_snippets.sql`)

Same argument list as today plus one trailing argument:

```
p_include_superseded boolean default false
```

Return table = today's columns **plus**, appended at the end:

| column | type | meaning |
|---|---|---|
| `part_no` | int | part_no of the unit's best (min-distance) embedding part; null when the unit has no embedding |
| `snippet_source` | text | `'fts_headline'` \| `'vector_part'` \| `'unit_head'` |

`snippet` semantics change: it is now the **matched passage**, ≤ ~400 chars, plain text, no markup.

* Unit reached by the FTS arm (with or without a vector rank): `ts_headline('english', <scope>,
  websearch_to_tsquery('english', q), 'StartSel="", StopSel="", MaxFragments=2, MaxWords=40,
  MinWords=12, FragmentDelimiter=" … "')` where `<scope>` is the best part's slice of `t.text`
  when the unit is embedded, else the whole `t.text`. → `snippet_source = 'fts_headline'`.
* Unit reached by the vector arm only: `left(<best part slice>, 400)` → `'vector_part'`.
* Neither (defensive; cannot happen after fusion): `left(t.text, 400)` → `'unit_head'`.

Best-part slice = `substring(t.text from lower(part_range) + 1 for upper(part_range) - lower(part_range))`
(part_range is a 0-based half-open char range into `bb_file_text.text`, header NOT included —
see `supabase/functions/embed-corpus/index.ts`).

Superseded filter: when `p_include_superseded = false`, rows whose `bb_files.superseded_by is not
null` are excluded **before ranking** in both arms. Apply the same filter (same new argument,
same default) to `search_file_text` and `match_file_text` so the three modes agree.

Changing a return type means `drop function … ; create function …` — the migration must drop
by full signature and recreate. `search` edge function v3 already sends `p_min_similarity` only
when set; v4 must send `p_include_superseded` only when true, for the same PGRST202 reason.

### `search` edge function v4

Request gains `include_superseded?: boolean` (default false). Response rows gain `part_no` and
`snippet_source` in hybrid mode. Everything else unchanged. Header comment bumped to v4 with
the new field documented. Repo file `supabase/functions/search/index.ts` stays byte-identical to
what is deployed.

### Data: migration `022_supersede_stale_files.sql`

Sets `superseded_by` on the stale IST.466 schedule / roster rows from the provenance already in
`bb_files.notes` (and `bb_raw` / `course_maps` if notes are ambiguous). The chain must point at
the single current file. If the ordering is not provable from data, the worker STOPS and reports
the ambiguity to the PM instead of guessing. Idempotent (`where superseded_by is null`).

### `part_range` repair

Diagnose why text 276's part_range is one char long (suspect: JS UTF-16 `.length` vs Postgres
`char_length` on astral-plane characters). Find every affected row with SQL (last part's
`upper(part_range)` ≠ `char_length(text)`, or any part with `upper - lower < 50`). Fix the data
(migration `023_part_range_repair.sql` if a SQL repair is possible; otherwise a targeted
re-embed of the affected units via `embed-corpus` with a documented runbook) AND fix the root
cause in `embed-corpus` so new rows are correct. Keep repo copy byte-identical to deployed.

## Workers

### W-10 — database + edge (branch `feat/retrieval-polish-db`, worktree `bb2dash-wt-db`)

Deliverables: migrations 021, 022, 023 (as needed); `search` v4 source + deployed; `embed-corpus`
fix + deployed; `db/README` / migration index updated if one exists; a verification note
`docs/planning/51_W10_VERIFICATION.md` with the SQL + curl evidence (before/after snippets for
≥5 queries incl. one long-unit hit, superseded rows absent by default and present with the flag,
part_range audit counts, edge smoke HTTP 200s).

Apply migrations to prod via `mcp__plugin_supabase_supabase__apply_migration` under the same
name as the file; repo file must be byte-identical to what was applied. Dry-run first inside a
`begin; … ; rollback;` block via `execute_sql`. Never touch 001–020.

### W-11 — clients (branch `feat/retrieval-polish-clients`, worktree `bb2dash-wt-clients`)

Deliverables:

* `mcp-server/`: `client.ts` types + `format.ts` render `part_no` (already partially there) and
  `snippet_source` (label the excerpt "matched passage" vs "unit head"); `search_materials`
  gains an optional `include_superseded` boolean input; tests updated/added (vitest, existing
  suite); `npm run typecheck && npm test` green.
* `web/`: `queries.search.ts` `SearchResult` gains `part_no`, `snippet_source`; `SearchParams`
  gains `includeSuperseded?` (not exposed in the UI this phase, wired through only);
  CommandPalette shows a small `part N` hint when `part_no > 1` (CSS Modules, existing tokens,
  no new deps beyond the test runner). **Add a test harness** — `web/` has none: vitest +
  `@testing-library/react` (jsdom), `npm test` script, tests for `scrubSnippet`, `isKeywordMatch`,
  the result-row rendering with `snippet_source` / `part_no`, and the request body shape
  (fetch mocked). `npm run typecheck && npm run build && npm test` green.
* Fixtures for the new contract live in the tests; live smoke happens at PM integration once
  W-10 is deployed.

## Out of scope this phase

Recurring crawl cadence, iCal sync, OCR, data-gap fixes, any new screen, exposing
`include_superseded` in the UI, regenerating `database.types.ts` (PM does it at integration).

## Integration (PM)

Merge both worker branches into `feat/retrieval-polish`; regenerate `web/src/lib/supabase/
database.types.ts`; run typecheck/build/test in `web/` and `mcp-server/`; live smoke of ⌘K + MCP
against prod; `/code-review` + `/security-review`; update STATUS + DECISIONS; open the PR; stop
at "ready when you say so" — Stack merges.

## Round 2 — code-review fixes (2026-09-10, after integration)

`/code-review` (high) against `main` confirmed these against prod. Contract additions:

### Migration `024_snippet_fixes.sql` (W-10) — `create or replace`, same signatures/return types

1. **Snippet part must contain the keyword.** For `via_fts` rows, the snippet part is the
   lowest-`part_no` embedding part whose slice satisfies
   `to_tsvector('english', slice) @@ websearch_to_tsquery('english', q)`. If no part does,
   run `ts_headline` over the whole unit text. `part_no` now means "the part the snippet was cut
   from": null for the whole-unit fallback and for unembedded units. `similarity` is unchanged
   (still from `vec_best`). `snippet_source` stays `'fts_headline'` in both cases.
   Live check on prod found 9 of 11 `fts_headline` rows for `q='attendance policy'` whose
   headline did NOT satisfy the tsquery (e.g. text_id 521, part 13). After 024: zero.
2. **No torn leading word.** When a slice does not start at offset 0 and the character before
   it is not whitespace, drop the leading partial token (`regexp_replace(slice, '^\S+\s+', '')`).
   Prod sample: 10 of 12 part≥2 slices started mid-word.
3. **Speaker notes stay labelled.** Let `P = position('[notes]' in t.text)` (1-based). For
   slice-based snippets: if `P > 0` and `P < lower(part_range) + 1`, prefix the snippet with
   `'[notes] '` so both clients' marker-based scrubbers label it. For the whole-unit headline
   fallback: if `P > 0`, run `ts_headline` over `left(t.text, P - 1)` only. Latent today
   (0 multi-part units carry `[notes]`) — fix it in the same migration family that created it.
4. **Limit before the joins.** Apply `order by sc desc, tid limit p_limit` inside `fused`
   (ordering is fully determined by `(sc, text_id)`, so results are identical), then join.
   Prod EXPLAIN: 16.3 ms / 5,599 buffers → 7.8 ms / 2,683.
5. **`search_file_text` headline is plain text** too: add `StartSel="", StopSel=""` to its
   option string. The palette's Keyword mode currently renders literal `<b>` tags.

Verification appended to `51_W10_VERIFICATION.md`: the `attendance policy` cover check
(count of `fts_headline` rows whose snippet fails the tsquery, before/after), a torn-word sample
before/after, the EXPLAIN numbers, and a synthetic `[notes]` check run inside a rolled-back
transaction (insert a long two-part unit with a marker in part 1, assert the prefix, rollback).
Edge functions: unchanged unless a comment needs the new `part_no` meaning (then redeploy,
byte-identical).

### Clients (W-11)

6. `mcp-server/src/format.ts`: the excerpt label depends on **mode**, not only
   `snippet_source`: `fts` → "keyword headline over the whole unit"; `vector` → "full unit text";
   `hybrid` → by `snippet_source` (`fts_headline`/`vector_part` → "matched passage",
   `unit_head` → "unit head", absent → "unit head (older server)"). Fix the test at
   `format.test.ts` that locks in the wrong label.
7. `web/src/lib/queries.search.ts`: `similarity: number | null`; `isKeywordMatch` returns true
   for `null` (an unembedded unit can only be a keyword hit); the palette shows the "keyword
   match" badge and no percentage. Remove the `undefined as unknown as number` cast from the test.
8. `mcp-server/src/client.ts`: correct the comment/test name ("older function rejects unknown
   keys" is false — it ignores them; the real reason is that false is the server default). The
   PGRST202 hint names `021_matched_snippets.sql` when the request carried
   `include_superseded`, otherwise 012 as today.
9. `web/vitest.config.ts` → `web/vitest.config.mts` (kills the Vite CJS-loader warning that
   becomes a hard failure on the next Vite major). Update README references.
10. `part_no` semantics per item 1: clients already null-tolerant; update any doc string that
    says "best part" to "part the snippet was cut from".

Not fixing this phase (recorded): the unreachable `unit_head` arm stays as a defensive branch.
