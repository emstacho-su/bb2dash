# 51 — W-10 verification (Phase 7 retrieval polish, database + edge)

Worker: W-10. Branch `feat/retrieval-polish-db`, worktree `bb2dash-wt-db`.
Contract: `docs/planning/50_PHASE7_retrieval_polish.md` § "Contract (frozen)".
Date: 2026-09-10. Project `goultdzqcavefcgnifdy` (prod — there is no staging).

Everything below was captured against prod. "Before" rows come from `search` v3 with
migrations 010–020 applied; "after" rows from `search` v4 with 021–023 applied.

## 1. What shipped

| Artefact | Applied / deployed as | Prod version |
|---|---|---|
| `db/migrations/021_matched_snippets.sql` | `021_matched_snippets` | `20260910201319` |
| `db/migrations/022_supersede_stale_files.sql` | `022_supersede_stale_files` | `20260910201513` |
| `db/migrations/023_part_range_repair.sql` | `023_part_range_repair` | `20260910201610` |
| `supabase/functions/search/index.ts` | edge function `search` | v4 |
| `supabase/functions/embed-corpus/index.ts` | edge function `embed-corpus` | v5 |

Each migration was dry-run inside `begin; … rollback;` via `execute_sql` before being applied
under the same name as the file. Repo files are byte-identical to what was applied/deployed
(the working tree carries CRLF from `core.autocrlf`; the git blob and the deployed source are
both LF, as they were for v3).

### New `hybrid_search_file_text` signature

```
hybrid_search_file_text(
  q                    text,
  query_embedding      extensions.vector(384),
  p_model              text             default 'gte-small',
  p_course             text             default null,
  p_limit              int              default 10,
  rrf_k                int              default 50,
  p_min_similarity     double precision default null,
  p_include_superseded boolean          default false        -- NEW
)
returns table (
  file_id bigint, text_id bigint, course_id text, bucket file_bucket,
  file_name text, unit_kind text, unit_no int, score double precision,
  similarity double precision, snippet text,
  part_no int,           -- NEW: best (min-distance) part; null when the unit is unembedded
  snippet_source text    -- NEW: 'fts_headline' | 'vector_part' | 'unit_head'
)
```

`search_file_text(q, p_course, p_limit, p_include_superseded)` and
`match_file_text(query_embedding, p_model, p_course, p_limit, p_include_superseded)` gained the
same trailing argument and the same default. Return types unchanged on those two.

## 2. Snippets: before / after, five queries

Requests are `POST /functions/v1/search` with the legacy anon JWT as both `Authorization:
Bearer` and `apikey`. All returned **HTTP 200**. `part` = `part_no`, `src` = `snippet_source`.

### 2.1 `{"q":"final exam date","limit":5}`

Before (v3) — every snippet is `left(text, 300)`:

| text | file | snippet head |
|---|---|---|
| 378 | CourseIntro-Fall2026-BA.pptx | `Exams\n3 exams, given online during class.…` |
| 521 | 323Fall26V1.3.1.docx (16 parts) | `Instructor: Christopher Croad\nOffice: Currently, none.\nOffice Hours: By Appointment…` |
| 270 | GEO 103 syllabus | `…3\n\n\nLecture Attendance\nI will take attendance every day in lecture using Qwickly…` |

After (v4):

| text | part | src | snippet head |
|---|---|---|---|
| 378 | 1 | fts_headline | `short essay questions\nDates\nExam #1 — Monday, September 14\nExam #2 — Wednesday, October 21\nExam #3 — Monday, December 7` |
| 521 | **16** | fts_headline | `Exam #3 + Final Project Defense \| -Lab #4 Due\nScheduled Final Exam Day 12/15/26 \| No final exam for this course, but -` |
| 270 | 3 | fts_headline | `course and a final exam. These exams will cover material\npresented in lecture, in the course readings, and in discussion` |
| 101 | 3 | fts_headline | `m version of each deliverable.\nCourse Schedule:\tSEE SCHEDULE DOCUMENT\nBe flexible` |
| 276 | 1 | vector_part | `9\n\n\n\n\n          ** Final Exam **\nTuesday, December 15th, 5:15-7:15pm 😞` |

**This is the headline result.** Text 521 is the 16-part, 16,375-char IST.323 syllabus: before,
the answer to "final exam date" was the instructor's office hours; after, it is part 16, the row
of the course calendar that says `Scheduled Final Exam Day 12/15/26`. Text 276 is the repaired
`part_range` row, now returning its whole 111-character page.

### 2.2 `{"q":"Deloitte","limit":5}` — the long multi-part unit, and the near-duplicates

Before: 4 of 5 hits were the four IST.466 schedule versions, each showing the same
`Schedule: M003 … version: …` header; the 5th (text 138, HBR4 page 7) showed `Page 7` and
whitespace.

After:

| text | file | part | src | snippet head |
|---|---|---|---|---|
| 138 | HBR4 Cyber Attack (10-part unit) | **3** | fts_headline | `Catherine Heggerud, Duty Director …` |
| 534 | IST466M3 Schedule Fall2026W3.docx (current) | 1 | fts_headline | `Work on Synchrony.\n4 \| 9/15 \| Ethics Team 1 Presentation*\nSynchrony Lab \| 9/17 \| Lab- Teams to work on Synchrony Case\nDe…` |
| 523 | ist352 instructor bio.pdf | 1 | vector_part | `Professional Bio\n\nMichael Larche …` |
| 203 | HBR10 Volkswagen | 1 | vector_part | `Page 4 …` |
| 168 | HBR7 IT and the Board (10-part unit) | **3** | vector_part | `Business Review on Measuring …` |

Three of the four schedule versions are gone; the one that remains (534 / file 66) is the
current document. Two long multi-part units (138, 168) now report the part that matched.

### 2.3 `{"q":"academic integrity plagiarism policy","limit":5}`

Before, text 1 (IST 352 syllabus, 16 parts, 17,419 chars) returned
`IST 352 - Information Analysis of Organizations: Concepts and Practice\nCLASS INFORMATION…`.

After, text 1 returns **part 10**, `src = vector_part`:
`to cheat (such as sharing answers to assignments with others in or out of class). In this class,
we will follow the University's…` — the actual academic-integrity paragraph.

The other four rows (350, 89, 522, 214) are single-part or part-1 hits whose head already was
the matched passage; their snippets are unchanged in substance and now capped at 400 chars.

### 2.4 `{"q":"IST466 class schedule","limit":5}`

Before: 4 of 5 hits were schedule versions (files 16, 58, 66, 40).
After: one schedule (534 / file 66, current), plus the syllabus, the IST.352 schedule and two
lecture decks. No duplicate versions.

### 2.5 `{"q":"class roster names","limit":5}`

Before: 3 of the top 5 were schedule versions; the roster itself (text 99) was 5th.
After: the roster is 3rd and the only roster row is file 37, the current one. File 35
(28 names, superseded) is absent.

### 2.6 Snippet length

`snippet` is plain text — `StartSel=""`, `StopSel=""`, so no `<b>` markup anywhere.
`vector_part` and `unit_head` snippets are hard-capped at 400 chars. `fts_headline` snippets are
governed by the option string the contract froze (`MaxFragments=2, MaxWords=40, MinWords=12`),
which is a word budget, not a character budget: observed lengths ran 81 → 791 chars, the 791
coming from a whitespace-heavy PDF page (text 138). See "Deviations and open questions".

## 3. Superseded rows: absent by default, present with the flag

`{"q":"IST466 class schedule","limit":6}` vs the same body plus `"include_superseded":true`:

| default (HTTP 200) | with `include_superseded: true` (HTTP 200) |
|---|---|
| t101 file39 syllabus | t101 file39 syllabus |
| t534 **file66** schedule W3 | t70 **file16** schedule Wk2x |
| t2 file28 IST.352 schedule | t210 **file58** schedule Wk2 |
| t72 file18 lecture deck | t534 **file66** schedule W3 |
| t80 file19 lecture deck | t102 **file40** schedule Wk2xy |
| t99 file37 roster | t2 file28 IST.352 schedule |

`{"q":"class roster names","limit":6,"include_superseded":true}` additionally returns t97 /
**file35**, the 28-name roster, which the default query does not.

All three modes agree:

| request | HTTP | superseded files in the result |
|---|---|---|
| `{"mode":"fts", …}` | 200 | none |
| `{"mode":"fts", …,"include_superseded":true}` | 200 | none — `websearch_to_tsquery` ANDs the terms and no superseded unit satisfies this one |
| `{"mode":"vector", …}` | 200 | none |
| `{"mode":"vector", …,"include_superseded":true}` | 200 | files 16, 58, 40 |

`fts` mode gets its own positive case with a query the schedules do satisfy —
`"Indicates Class completed scheduled dates subject to change"`, `mode: "fts"`, `limit: 6`:

| request | HTTP | `count` | files |
|---|---|---|---|
| default | 200 | **1** | 66 (current) |
| `include_superseded: true` | 200 | **4** | 16, 40, 58, 66 |

Input validation at the boundary:

```
POST {"q":"anything","include_superseded":"yes"}
-> HTTP 400  {"error":"include_superseded must be a boolean"}
```

The floor still works end to end: `{"q":"banana bread recipe","limit":3,"min_similarity":0.78}`
→ HTTP 200, `count: 0`.

### SQL assertions

```sql
select count(*) from bb_files;                                  -- 64
select count(*) from bb_files where superseded_by is not null;  -- 4
select count(*) from v_bb_files_current;                        -- 60
```

Chains (all terminate at a row whose `superseded_by` is null):

| stale | file | → | head |
|---|---|---|---|
| 58 | `IST466M3 Schedule Fall2026-Wk2.docx` (Aug 31) | → | 16 |
| 16 | `IST466M3 Schedule Fall2026-Wk2x.docx` (Sep 3) | → | 66 |
| 40 | `IST466M3 Schedule Fall2026Wk2xy.docx` (Sep 3) | → | 66 |
| 35 | `IST466_M3Class_Fall2026Roster_Wk2_New.xlsx` (28 names) | → | 37 |

022 asserts this end state itself (`n_expected = 4`, `n_superseded = 4`, no chain longer than
four hops) and raises rather than committing a partial seed. Because it asserts the *state*
rather than a row count, re-running it is a no-op that still passes.

## 4. `part_range` audit — before and after

Root cause, confirmed before changing anything: `bb_file_text` 276 is the GEO 103 syllabus page
that ends `Tuesday, December 15th, 5:15-7:15pm 😞`. U+1F61E is an astral-plane character:
one code point, **two** UTF-16 code units, four UTF-8 bytes.

```sql
select octet_length(text), char_length(text) from bb_file_text where id = 276;
-->  114 bytes, 111 chars          -- and the stored part_range was [0,112)
```

`embed-corpus` chunked with `raw.length` / `raw.slice()` (UTF-16 units); Postgres reads the range
back with `char_length` / `substring` (code points). 276 is the corpus's only astral character,
and its unit is single-part, so the range was one character too long and nothing else was wrong —
but in a multi-part unit every part after the emoji would have been shifted.

| audit query | before | after |
|---|---|---|
| `count(*) from bb_text_embeddings` | 1195 | 1195 |
| `count(distinct text_id)` | 534 | 534 |
| rows with `part_range is null` | 0 | 0 |
| rows where `upper(part_range) > char_length(text)` | **1** (text 276) | **0** |
| units where `max(upper(part_range)) <> char_length(text)` | **1** (text 276) | **0** |
| parts shorter than 50 chars that are not a whole short unit | 0 | 0 |

The 25 rows with `upper - lower < 50` were all investigated and are legitimate: each is a
single-part unit whose entire text is that short (e.g. text 525, a 5-character slide). The
`< 50` heuristic from the contract needs the `<> char_length(text)` qualifier to be meaningful.

### Root-cause fix and why no re-embed was needed

`embed-corpus` now chunks over `Array.from(text)` — an array of code points — so the offsets it
stores are the offsets Postgres reads. `codePoints()`, `findCut()` and `chunk()` were ported
index-for-index; the five cut branches (paragraph, sentence, newline, whitespace, hard cut) are
unchanged in behaviour.

Two proofs that the port does not re-chunk the existing corpus:

1. **Local parity harness** (`old` vs `new` implementations, run under node): 49 BMP-only cases
   covering every cut branch, boundary sizes 0 / 1600 / 1601, and 40 seeded fuzz cases →
   **49/49 byte-identical part lists**. On the real text-276 string: old `[0,112)`, new `[0,111)`.
   On a synthetic 6,006-unit / 5,993-code-point text with 13 emoji: old overruns by 13, new lands
   exactly on 5,993.
2. **Prod dry run** of the deployed v5:
   ```
   POST /functions/v1/embed-corpus {"dry_run":true}   -> HTTP 200
   {"total_units":534,"total_parts":1195,
    "missing_units_before":0,"missing_parts_before":0,"remaining_parts":0, …}
   ```
   The new chunker reproduces all 1,195 stored parts exactly. Nothing to re-embed.

Migration 023 therefore only clamps: it refuses (raises) if any *multi-part* unit is affected,
since that would need re-chunking rather than a clamp, then asserts the invariant afterwards.

### Re-embed runbook (not needed now; keep for the day it is)

If a future audit finds a multi-part unit whose `part_range` overruns, 023's guard will refuse.
Delete and re-embed those units instead:

```sql
delete from bb_text_embeddings where text_id in (<ids>) and model = 'gte-small';
```

then drive `embed-corpus` until it drains, respecting the ~8–9 parts-per-invocation CPU budget:

```
POST /functions/v1/embed-corpus {"limit":40,"max_parts":6}   -- repeat while remaining_parts > 0
```

It is resume-safe per part and idempotent (duplicate inserts hit the unique constraint and are
counted, not failed). Confirm with the audit queries in §4.

## 5. Edge smoke summary

| request | HTTP |
|---|---|
| `{"q":"final exam date","limit":5}` | 200 |
| `{"q":"Deloitte","limit":5}` | 200 |
| `{"q":"academic integrity plagiarism policy","limit":5}` | 200 |
| `{"q":"IST466 class schedule","limit":5}` | 200 |
| `{"q":"class roster names","limit":5}` | 200 |
| `{"q":"IST466 class schedule","limit":6,"include_superseded":true}` | 200 |
| `{"q":"class roster names","limit":6,"include_superseded":true}` | 200 |
| `{"q":"IST466 class schedule","mode":"fts","limit":4}` (± flag) | 200 |
| `{"q":"IST466 class schedule","mode":"vector","limit":4}` (± flag) | 200 |
| `{"q":"banana bread recipe","limit":3,"min_similarity":0.78}` | 200, `count: 0` |
| `{"q":"anything","include_superseded":"yes"}` | 400, `include_superseded must be a boolean` |
| `POST /embed-corpus {"dry_run":true}` | 200 |

`p_include_superseded` is sent to PostgREST **only when true**, for the PGRST202 reason v3
already documented for `p_min_similarity`: postgrest-js serialises an explicit `null`, and a
named argument the deployed function does not declare makes overload resolution fail. The
reason is written into `search/index.ts` next to the code.

## 6. `get_advisors(type: "security")` — before / after

Identical counts. No new findings, no new criticals.

| lint | level | before | after |
|---|---|---|---|
| `security_definer_view` | ERROR | 12 | 12 |
| `function_search_path_mutable` | WARN | 7 | 7 |
| `authenticated_security_definer_function_executable` | WARN | 1 | 1 |
| `auth_leaked_password_protection` | WARN | 1 | 1 |

The only difference is ordering inside `function_search_path_mutable`: `search_file_text`,
`match_file_text` and `hybrid_search_file_text` moved down the list because they were dropped
and recreated. They lacked `set search_path` before 021 and still lack it — 021 keeps the style
of 010–013 deliberately rather than smuggling a security change into a retrieval migration.
Setting `search_path` on the three search functions is a clean, separate one-line migration if
Stack wants the warning gone. No RLS policy was touched.

## 7. Deviations and open questions for the PM

1. **`fts_headline` snippets can exceed ~400 chars.** The contract froze both "≤ ~400 chars" and
   the exact `ts_headline` option string; those two disagree, because `MaxFragments=2,
   MaxWords=40` is a word budget. Observed range 81–791 chars. The frozen option string was
   followed literally and nothing truncates it. If the clients want a hard cap, either wrap the
   headline in `left(…, 400)` (risking a mid-word cut) or lower `MaxWords`. Flagging, not
   deciding.
2. **An FTS-arm hit shows the best *vector* part, even when the query terms are elsewhere.**
   The contract specifies `ts_headline` over the best part's slice; when that slice contains no
   query term, `ts_headline` falls back to the head of the slice. This is the contract working
   as written, and in practice the two agree (the vector arm usually picks the part that
   contains the terms — text 521 part 16 and text 1 part 10 above). The alternative — headline
   over the whole unit, then locate the part — was not built because it is not what was frozen.
3. **16 vs 40 ordering is not asserted.** They are two *locations* of the same Sep 3 schedule
   (identical wording bar capitalisation, both 3,854 chars), not two versions in one lineage, so
   022 points each straight at 66 rather than inventing an order. `58 → 16` **is** asserted:
   same Blackboard content item `_12939631_1`, and both rows' notes record the same rid refresh
   (165342909 → 165607165).
4. **`bb_raw` id 19 (the 9/8 crawl) still lists the root item `_12939631_1` carrying Wk2x**,
   even though bb_files 16's note says the Wk2 root item was removed from Blackboard on 9/8.
   The crawl ran 17:28 on 9/8; the removal is presumably later. This does not change the
   supersession (16's own note names 66 as its replacement), but the note and the crawl are one
   ingest apart, worth a glance at the next pull.
5. **Out of scope, left alone:** other near-duplicates that are *not* IST.466 schedule/roster —
   bb_file 17 (byte-identical duplicate of 15, same sha256), 18/19 (intro decks differing by
   3 bytes), and IST.352 31/32/47 (three variants of "Introduction to SA&D - Part 1"). None is
   in the contract; each needs its own provenance call before `superseded_by` is set.
6. **`fts` mode still returns `<b>`-marked-up snippets** over the whole unit — 021 changed only
   the superseded filter there, per the contract ("apply the same filter … so the three modes
   agree"), which says nothing about harmonising fts-mode snippets. Hybrid is the hub default,
   so this is cosmetic today, but a client that switches to `mode: "fts"` gets a differently
   shaped `snippet` and no `part_no` / `snippet_source`. Worth a line in the client docs.

## 8. Not done here (by contract)

`web/` and `mcp-server/` are W-11's. `database.types.ts` regeneration is the PM's at
integration. RLS policies were not touched. No new migration edits 001–020.

---

# Appendix A — Round 2 (migration `024_snippet_fixes`)

Contract: `50_PHASE7_retrieval_polish.md` § "Round 2 — code-review fixes", items 1–5.
Applied to prod as `024_snippet_fixes` (version `20260910220004`); `search` redeployed as
function version 5 (header comment only — the new `part_no` meaning). Repo files byte-identical.
Argument lists and return types are unchanged from 021, so `create or replace` was sufficient:
no drop, no PostgREST churn, no client-visible signature change.

## A1. Item 1 — the snippet part must contain the keyword

Measured through the deployed edge function (driven by `net.http_post`, read back from
`net._http_response`, so the snippets never leave the database), request
`{"q":"attendance policy","limit":20}`, then in SQL:

```sql
count(*) filter (where src = 'fts_headline'
  and not (to_tsvector('english', snippet) @@ websearch_to_tsquery('english','attendance policy')))
```

| | before (021) | after (024) |
|---|---|---|
| `fts_headline` rows | 10 | 10 |
| …whose snippet fails the tsquery | **5** | **0** |
| …falling back to the whole-unit headline (`part_no is null`) | 0 | 4 |
| `vector_part` rows | 10 | 10 |

The five failures were text 3 p5, 211 p2, 305 p4, 521 p11, 522 p7. After 024: text 3, 211, 305
and 521 have **no** part whose slice satisfies `attend & polici`, so they headline the whole unit
and report `part_no = null`; 522 moved from p7 to **p6**, a part that does cover the query. Text 1
moved p7 → p4. Confirmed directly for text 521 — an ordered index scan over its 16 parts returns
zero covering parts (`Rows Removed by Join Filter: 16`).

The contract quotes "9 of 11" from the reviewer's run; the reproducible figure on the state 024
was applied to is 5 of 10 at `limit: 20`. The number that matters is the same either way:
**after 024 it is 0**, and the check above is the one to re-run.

## A2. Item 2 — no torn leading word

Corpus-wide, over all 661 `part_no >= 2` slices:

| | count |
|---|---|
| slices whose preceding character is not whitespace (flagged torn) | 462 |
| …where 024 actually drops a leading partial token | **374** |
| …flagged but already starting with whitespace (regex is a no-op) | 88 |
| slices starting after whitespace (untouched) | 199 |

Samples, with the guard applied exactly as the function applies it:

| text | part | char before | torn? | 021 head | 024 head |
|---|---|---|---|---|---|
| 1 | 4 | `e` | yes | `ms Analysis and Design, 10th Edition, Pearso` | `Analysis and Design, 10th Edition, Pearson +` |
| 101 | 4 | `t` | yes | `s to teams that finish in sixth place in eac` | `to teams that finish in sixth place in each` |
| 211 | 2 | *(space)* | no | `step to earning these points. If you must mi` | *unchanged* |
| 3 | 5 | `r` | yes | `\| Group 10 \| Student-Faculty Learning Align` | *unchanged (slice already opens on whitespace)* |
| 522 | 6 | `s` | yes | `only:\nCourse tags highlight the connection` | *unchanged (same reason)* |

Text 211 is the control: its slice starts after a space, the guard is false, nothing is trimmed.
The 88 "flagged but unchanged" slices are the same shape as texts 3 and 522 — the previous word
ended exactly on the boundary and the slice opens with whitespace, so there is no partial token
for the regex to remove. Harmless.

## A3. Item 3 — speaker notes stay labelled (synthetic, inside a rolled-back transaction)

No multi-part unit in the corpus carries a `[notes]` marker today, so the fixture is synthetic:
two `bb_file_text` rows inserted, queried, and rolled back.

**A — slice-based snippet from a part that starts after the marker.** Unit: 50 chars of body,
then `[notes] `, then filler, with the search term only past offset 1500. Embeddings `[0,1500)`
and `[1300, len)`. Query `zzqqxx`, `p_min_similarity = 1.1` (empties the vector arm so only the
FTS path runs).

```
part_no = 2   snippet_source = fts_headline
snippet = "[notes] text note filler text note filler text … zzqqxx tail fil…"
```

The `[notes] ` prefix is present, the part chosen is the one carrying the term, and the slice's
torn leading token was dropped (part 2 starts at offset 1300, mid-word).

**B — whole-unit fallback must not headline across the marker.** Unit: `lead zzwwvv
beforemarker` padded to 50 chars, then `[notes] `, then 40 repetitions of
`postmarkerword zzwwvv `. No embeddings. Query `zzwwvv`:

```
part_no = null   snippet_source = fts_headline
snippet = "lead zzwwvv beforemarker"
```

The headline is drawn only from `left(text, notes_at - 1)`; `postmarkerword` never appears.

## A4. Item 4 — limit before the joins

`explain (analyze, buffers)` on
`hybrid_search_file_text('attendance policy', <probe>, 'gte-small', null, 10)`, where `<probe>`
is the stored embedding of text 277 part 1 — a real in-distribution vector, identical before and
after, since the query embedding itself is not reachable from SQL. Warm runs:

| | 021 | 024 |
|---|---|---|
| shared buffer hits | 5,210 | **4,284** (−18%) |
| execution time | 22.1 ms | **35.4 ms** (+60%) |

Buffers fell as predicted — the joins, slicing and headline work now run 10 times rather than
once per fused candidate. **Wall time went up, not down.** The contract's 16.3 → 7.8 ms was item
4 measured on its own; item 1 adds work that did not exist in 021: for every `via_fts` row, an
ordered scan over the unit's parts computing `to_tsvector` on each slice until one matches. The
worst case is a unit where nothing matches — text 521 costs ~5.5 ms alone for its 16 parts. The
plan is already the cheap shape (`Limit` over a `Nested Loop` driven by the
`(text_id, model, part_no)` unique index, so it stops at the first covering part); what remains
is the cost of the `to_tsvector` calls themselves. Making those cheaper means storing a per-part
tsvector, which is a schema change nobody asked for. Flagging the trade, not making it: 35 ms of
database time still sits well inside the edge function's own embedding latency.

## A5. Item 5 — `search_file_text` returns plain text

```sql
select text_id, snippet ~ '<b>|</b>' as has_markup from search_file_text('attendance policy', null, 5);
```

All five rows `has_markup = false`; e.g. text 277 → `Attendance Policy\nAttendance in classes is
expected in all courses`. Through the edge function,
`{"q":"attendance policy","mode":"fts","limit":3}` → HTTP 200, no `<b>` in any snippet. Hybrid
mode likewise: no markup in any of the smokes below.

## A6. Round-2 edge smoke

| request | HTTP | note |
|---|---|---|
| `{"q":"final exam date","limit":5}` | 200 | t521 → part 8; t101 → `part_no: null` (whole-unit) |
| `{"q":"attendance policy","limit":5}` | 200 | 0 rows fail the cover check |
| `{"q":"IST466 class schedule","limit":5,"include_superseded":true}` | 200 | files 16, 58, 40, 66 all present — 021's filter still works |
| `{"q":"attendance policy","mode":"fts","limit":3}` | 200 | plain text, no markup |

## A7. Open questions from round 2

1. **"Lowest covering part" is deterministic, not most-relevant.** For `final exam date`, text
   521 now answers with part **8** (`exams throughout the semester…`) where 021 answered with
   part **16** (`Scheduled Final Exam Day 12/15/26`) — the better passage, arrived at by luck
   rather than by rule. Both parts satisfy the tsquery; the contract picks the lowest part
   number. If the palette wants the *best* covering part, the rule needs a tiebreak (ts_rank
   over the slice, or the covering part closest to the query vector). Worth a round-3 decision.
2. **Wall time regressed** — see A4. Recorded, not fixed.
3. `similarity` is deliberately still `vec_best`-derived, so it no longer necessarily describes
   the part the snippet came from. That is what the contract asked for and it keeps the number
   comparable across rows, but the two fields now answer different questions; the clients should
   not imply the percentage describes the excerpt.
4. §7 item 1 of the main document still stands: `fts_headline` snippets are governed by a word
   budget, not a character budget, and can exceed ~400 chars.

---

# Appendix B — Round 3 (migration `025_snippet_part_rank`)

Applied to prod as `025_snippet_part_rank`, version `20260910220804`; repo file byte-identical
(11,525 B, md5 `554dfdcc9a277ca2230463888d65952f`). `create or replace` — argument list and
return type unchanged from 021/024, so no drop, no PostgREST churn, no client change. Only
`hybrid_search_file_text` moved; `search_file_text` and `match_file_text` were not touched, and
no edge function was redeployed (nothing in either header changed).

## B1. The rule

024 broke ties among covering parts by `part_no`, which is arbitrary. 025 orders them by
relevance instead:

1. highest `ts_rank(to_tsvector('english', slice), websearch_to_tsquery('english', q))`
2. tie → the vector-best part, when that part is itself covering
3. still tied → lowest `part_no` (keeps the choice deterministic)

`coalesce(e.part_no = vb.part_no, false) desc` implements rule 2: the raw comparison is NULL for
an unembedded unit and `DESC` sorts NULLs first in Postgres, which would have handed the tie to
the wrong row. The whole-unit fallback is unchanged — no covering part still means a headline
over the unit (before a `[notes]` marker if present) and `part_no = null`.

## B2. Acceptance

Text 521 (IST.323 syllabus, 16 parts), `q = 'final exam date'`. Its three covering parts:

| part | `ts_rank` of slice | slice head |
|---|---|---|
| **16** | **0.6146** | `… Scheduled Final Exam Day 12/15/26 …` |
| 12 | 0.1724 | `…llabus. This document can be found on Blackboard…` |
| 8 | 0.0088 | `…t. You must disclose how, in a required appendix…` |

| | 021 | 024 | 025 |
|---|---|---|---|
| part returned | 16 (by luck — best *vector* part) | 8 (lowest covering) | **16 (highest-ranking covering)** |

Through the deployed edge function, `{"q":"final exam date","limit":12}` → HTTP 200:

```
t521  part=16  fts_headline
"Exam #3 + Final Project Defense | -Lab #4 Due\nScheduled Final Exam Day 12/15/26 | No fin…"
```

The cover check is unaffected — `{"q":"attendance policy","limit":20}`, same SQL as A1:

| | 024 | 025 |
|---|---|---|
| `fts_headline` rows | 10 | 10 |
| …whose snippet fails the tsquery | **0** | **0** |
| …whole-unit fallback (`part_no null`) | 4 | 4 |

Parts chosen moved only where a better-ranking covering part existed: text 1 went p4 → **p6**,
everything else is unchanged (`3:whole, 101:p4, 211:whole, 213:p1, 277:p1, 305:whole, 372:p1,
521:whole, 522:p6`).

## B3. Timing

`explain (analyze, buffers)` on
`hybrid_search_file_text('final exam date', <probe>, 'gte-small', null, 12)`, same probe vector
as A4 (stored embedding of text 277 part 1), warm runs:

| | 024 | 025 |
|---|---|---|
| execution time | 21.9 ms | **27.4 ms** (+25%) |
| shared buffer hits | 4,189 | 4,259 |

**Under the ~60 ms ceiling**, so no escalation. The increase is structural and expected: rule 1
needs a rank for every covering part, so the lateral can no longer stop at the first match the
way 024's `Limit`-over-ordered-index-scan did — it scans the unit's parts and sorts. Buffers
barely moved (+70) because the same pages were already being read; the extra cost is CPU in
`to_tsvector` and `ts_rank`.

Per the PM's instruction, a stored per-part `tsvector` — the real fix, which would collapse both
the cover test and the rank to an indexed lookup — is **not** in this phase and is recorded as
backlog.
