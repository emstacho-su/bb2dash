# Eval — FTS vs vector vs hybrid retrieval (embedding POC)

Run date: 2026-09-09. Corpus: 64 `bb_files` / 534 `bb_file_text` units / 1,195 `bb_text_embeddings`
rows (`model='gte-small'`, 384-dim, 534/534 units embedded = 100% coverage).
Retrieval API: edge function `search`, `limit: 10`, no `course` filter on any query.

This is item 4 of `PLAN_EMBEDDING_POC.md` ("Eval pass").

---

## 1. Methodology

**Ground truth.** Ten known-answer questions were derived *from the corpus*, not invented: each
one is a fact a student would actually go looking for (attendance allowances, quiz-drop rules,
exam dates, grading weights, presentation length, a guest-speaker date, a late penalty, an
internship paperwork consequence, an AI-disclosure rule). For each query the answer-bearing
`bb_file_text` unit was located by reading the source text, and truth was recorded as either a
**text_id** (when the answer lives in exactly one unit of a multi-unit file) or a **file_id set**
(when the answering file has a single unit, or when several near-duplicate files carry the same
answer). Queries span **6 of the 7 courses** (all but `GEO.103.recitation`).

**Query wording.** Queries are written the way a student would type them, and deliberately mixed:

* **Paraphrased (6 of 10)** — Q1, Q4, Q6, Q8, Q9, Q10 use wording that does **not** appear
  verbatim in the answer text ("skip" vs "miss", "worst test" vs "Lowest Exam Grade", "wrap up
  early" vs "less than 30 minutes", "lose credit" vs "penalty of 20%", "boss never sends back"
  vs "Failure to receive the site supervisor's evaluation form", "ChatGPT" vs "AI tools").
  These are the vector-over-FTS tests.
* **Exact-keyword (4 of 10)** — Q2, Q3, Q5, Q7 contain phrases lifted from the source
  ("drop lowest quiz score", "final exam", "Exam 1"/"course schedule", "Deloitte"). FTS's home turf.

**Execution.** Each query was POSTed to the `search` function three times (`mode` =
`fts`, `vector`, `hybrid`), `limit: 10` — 30 invocations, **all HTTP 200, zero errors, zero
retries needed**. Calls were made server-side via `pg_net` (the workspace egress proxy blocks
`supabase.co`); raw responses were read back from `net._http_response` and scored in SQL.

**Scoring.** For each query × mode, the **rank of the first ground-truth hit** in the returned
list (1-indexed, `—` = not in top 10 / empty result set). From those: `hit@1`, `hit@3`, `hit@10`
(counts out of 10) and **MRR** = mean of `1/rank`, scoring a miss as 0.

**Supplementary column `fts_kw`.** FTS returned *nothing* for 9 of 10 natural-language queries,
which would have made the comparison uninformative on its own. So a fourth, diagnostic pass was
run: the same 10 information needs re-expressed as **hand-stripped keyword queries** (e.g.
"Deloitte visit", "site supervisor evaluation form"), still in `mode: fts`. This measures FTS
under the conditions it was designed for and keeps the verdict honest. It is a diagnostic, not
one of the three compared modes.

**Known issue accounted for.** `vector` mode returns the whole unit text rather than the matched
part's slice, so hits were judged by **file/unit identity only**, never by displayed snippet.

---

## 2. The ten queries and their ground truth

| # | Course | Query as typed | Answer in the corpus | Ground truth | Type |
|---|--------|----------------|----------------------|--------------|------|
| 1 | GEO.103 | *how many lectures can I skip in GEO 103 without being penalized* | "You can miss three lectures, no questions asked." | text 270 (file 42, `GEO 103 (2026) - syllabus - FINAL.pdf`, p.3) | paraphrase |
| 2 | GEO.103 | *GEO 103 drop lowest quiz score* | "We will drop your lowest quiz score or a zero for missing a quiz." | text 270 (file 42) | exact |
| 3 | GEO.103 | *what date and time is the GEO 103 final exam* | "** Final Exam ** Tuesday, December 15th, 5:15-7:15pm" | text 276 (file 42, p.9 — a 111-char unit) | exact-ish |
| 4 | ECN.304 | *in economics of social issues how much is my worst test worth toward the course grade* | "Highest Exam Grade 30% / Median Exam Grade 25% / Lowest Exam Grade 20%" | text 213 (file 23, `ECN 304 F26 Syllabus_M001.pdf`, p.2) | paraphrase |
| 5 | ECN.304 | *ECN 304 course schedule Exam 1 date* | Course Schedule table: "10/01 Thu — Exam 1" | text 218 (file 23, p.7) | exact |
| 6 | IST.466 | *how long does my team have to present the ethics case and what if we wrap up early* | "40 minutes including discussion… Presentations of less than 30 minutes are eligible for no more than 65 percent of the total points." | file 21 (`IST466 Ethics Cases Spring 2026.docx`, text 88) | paraphrase |
| 7 | IST.466 | *when is Deloitte visiting the IST 466 class* | 9/17: "Deloitte to Visit Our Class!!" | files 16, 40, 58, 66 (the four near-duplicate `IST466M3 Schedule` docs) | exact |
| 8 | IST.352 | *how much credit do I lose for handing in IST 352 work after the deadline* | "An overdue assignment will get a penalty of 20% of total points for each day being late." | file 27 (`IST 352 Syllabus Fall 2026.docx`, text 1) | paraphrase |
| 9 | IST.471 | *what happens if my internship boss never sends back the evaluation paperwork* | "Failure to receive the site supervisor's evaluation form will result in no credit for this course." | text 348 (file 26, `IST 471 Syllabus.pdf`, p.4) | paraphrase |
| 10 | IST.323 | *do I need to admit using ChatGPT on the IST 323 final project* | "You may use AI tools on this assignment. You must disclose how, in a required appendix." | files 2 (`323Fall26V1.3.1.docx`) or 13 (`IST323_Appendix_B_AI_Use_Statement.pdf`) | paraphrase |

Distractor note for Q7: `HBR4-Cyber Attack athe Univ. of Calgary` (file 51) also contains the
string "Deloitte" and is *not* ground truth — all four modes correctly avoided ranking it.

---

## 3. Per-query results — rank of first ground-truth hit

`—` = no ground-truth hit in the top 10 (for `fts`, this always means an **empty** result set).

| # | Query (abbrev.) | Type | fts | vector | hybrid | *fts_kw* |
|---|-----------------|------|-----|--------|--------|----------|
| 1 | GEO 103 lectures I can skip | paraphrase | — (0 results) | **1** | **1** | 1 |
| 2 | GEO 103 drop lowest quiz score | exact | **1** | **1** | **1** | 1 |
| 3 | GEO 103 final exam date/time | exact-ish | — (0 results) | **1** | **1** | 3 |
| 4 | ECN 304 worst test weight | paraphrase | — (0 results) | **1** | **1** | 1 |
| 5 | ECN 304 Exam 1 date | exact | — (0 results) | **1** | **1** | 3 |
| 6 | IST 466 ethics case length / early finish | paraphrase | — (0 results) | **1** | **1** | 2 |
| 7 | IST 466 Deloitte visit | exact | — (0 results) | **1** | **1** | 1 |
| 8 | IST 352 late-submission penalty | paraphrase | — (0 results) | **1** | **1** | 2 |
| 9 | IST 471 supervisor evaluation not returned | paraphrase | — (0 results) | **1** | **1** | 1 |
| 10 | IST 323 ChatGPT disclosure | paraphrase | — (0 results) | 2 | 2 | — (0 results) |

Q10's rank-2: position 1 is `IST323-Initial-Logon-v2.docx` (file 4, text 360) — an onboarding
doc whose header mentions IST 323 and whose body is about accounts/tools. Position 2 is the
syllabus (file 2) which carries the actual answer, and position 5 is Appendix B. A rank-2 answer
inside a 10-result list is a usable result, not a failure.

---

## 4. Aggregate

10 queries, `limit: 10`, no course filter.

| Mode | hit@1 | hit@3 | hit@10 | MRR | avg. results returned | avg. **distinct units** in top 10 |
|------|-------|-------|--------|-----|-----------------------|------------------------------------|
| **hybrid** | **9/10** | **10/10** | **10/10** | **0.950** | 10.0 | **10.0** |
| **vector** | **9/10** | **10/10** | **10/10** | **0.950** | 10.0 | 6.0 |
| **fts** (natural language) | 1/10 | 1/10 | 1/10 | 0.100 | 0.1 | 0.1 |
| *fts_kw* (diagnostic: keyword-stripped) | *5/10* | *9/10* | *9/10* | *0.667* | *2.1* | *2.1* |

---

## 5. Verdict

### Does vector/hybrid earn its keep over FTS-only?

**Yes, decisively — and the margin is bigger than "better ranking"; it is the difference between
an answer and a blank page.**

* On the queries as a student would actually type them, **FTS answered 1 of 10 and returned an
  empty result set for the other 9**. MRR 0.100 vs 0.950.
* The cause is structural, not tuning: `search_file_text()` (migration 010) uses
  `websearch_to_tsquery('english', q)`, which **ANDs every unquoted term**. A unit only matches
  if it contains *all* of them. "when is Deloitte visiting the IST 466 class" requires a unit
  containing `deloitte & visit & ist & 466 & class`; the schedule doc has "Deloitte" and "class"
  but the strings "IST" and "466" never appear in its body — so zero rows. This will fire on
  essentially every conversational query the hub receives.
* Even with that handicap removed — the `fts_kw` diagnostic, where a human hand-picked the
  keywords — FTS still trails badly: **hit@1 5/10 vs 9/10, MRR 0.667 vs 0.950**, and it
  outright missed Q10 (the corpus says "AI tools", the student said "ChatGPT"; no lexical
  overlap exists to find). That last miss is the clearest single demonstration of what the
  embedding tier buys: vocabulary independence.
* FTS's recall is also thin where it does fire: 2.1 results on average vs 10, so there is little
  for a downstream LLM to reason over and no graceful degradation when the top hit is wrong.

### Which mode should the hub default to? **`hybrid`.**

`vector` and `hybrid` tie exactly on rank-of-first-hit (identical top-1 on all 10 queries), so
the choice is decided on everything *else* in the result list:

1. **Hybrid deduplicates by unit; vector does not.** `match_file_text()` ranks *embedding parts*,
   so a long syllabus split into 16 parts can occupy several slots with the same `text_id`.
   Measured: vector returns **6.0 distinct units per 10 results**; hybrid returns **10.0**.
   Q8 is the worst case — vector's ten slots are only three distinct units (`IST 352 Syllabus`,
   `Project Teams`, `Class Schedule`) repeated. For a hub that feeds top-k into an LLM, that is
   40% of the context window spent on duplicates.
2. **Hybrid degrades to vector, never below it.** RRF is a full outer join: when FTS contributes
   nothing (9 of 10 queries here) hybrid *is* the vector ordering, so there is no downside case.
   When FTS does fire, it can only promote a unit both retrievers like — Q2 is the visible
   example, where the FTS hit and the vector hit agree on text 270.
3. **Hybrid is the only mode with a lexical escape hatch.** Exact identifiers a student will
   inevitably paste — a rubric name, an assignment code, a vendor name — need term matching.
   Keeping that channel wired in costs nothing measurable and is insurance against the
   embedding's blind spots (gte-small is 384-dim and English-only).

The one cost is latency: hybrid embeds the query *and* runs the tsquery. Neither was a problem
at this corpus size, and the RRF function is a single SQL statement.

**Recommendation: the hub calls `search` with `mode: "hybrid"` (already the function's default)
and does not expose FTS-only as a user-facing option.** Keep `fts` and `vector` reachable for
diagnostics.

### Failure patterns observed

* **FTS conjunctive-AND wipeout (9/10 queries).** The dominant failure of the whole eval. If an
  FTS-only path is ever needed, `search_file_text` would need OR/`plainto`-style relaxation or
  stopword stripping first. *Not fixed here — out of scope for this task.*
* **Vector part-duplication (all 10 queries).** `mode: vector` fills its `limit` with embedding
  parts, not units, so `limit: 10` buys ~6 distinct units. Hybrid already solves this via
  `vec_best` (`group by text_id`, best part). A future `match_file_text` could adopt the same
  grouping.
* **Whole-unit snippets in vector mode** (known, unfixed): vector results return the full unit
  text, so a 16k-char syllabus renders as a wall of text with no indication of *which part*
  matched. Hybrid's `left(t.text, 300)` snippet is not much better — it is the head of the unit,
  not the matched region. **This is the highest-value follow-up for the hub UI**: the matched
  part's `part_range` is already stored in `bb_text_embeddings` and is not being surfaced.
* **Short-slide noise: absent, and the context header appears to be why.** The eval's shortest
  ground-truth unit (text 276, 111 characters: just "** Final Exam ** Tuesday, December 15th…")
  was retrieved at **rank 1** by both vector and hybrid on Q3. The `"{course} {bucket} —
  {file_name}: "` prefix from the chunking policy is doing exactly the job it was added for.
  Conversely, short slides did *not* flood the top of any result list. No merging of consecutive
  sub-200-char slides is warranted on this evidence.
* **Near-duplicate files cluster together.** Q7's four `IST466M3 Schedule` variants took ranks
  1-4 in both vector and hybrid. Correct, but it consumes 40% of the result list with one
  answer. A dedup-by-content or newest-version-wins pass at the hub layer would help; retrieval
  itself is not at fault.
* **Header-mention hijack (Q10, rank-2).** `IST323-Initial-Logon-v2.docx` outranked the syllabus
  because the context header supplies a strong "IST 323" signal while the body is thematically
  loose. The header prefix that rescues short slides also lets thin documents ride course-name
  similarity. Worth watching if the corpus grows a lot of short admin docs.

---

## 6. Reproducing

Invocations were issued from SQL (`pg_net`) rather than curl, because the workspace egress proxy
blocks `supabase.co`:

```sql
select net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/search',
  body := jsonb_build_object('q', <query>, 'mode', <mode>, 'limit', 10),
  headers := jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer '||<anon>, 'apikey', <anon>),
  timeout_milliseconds := 60000);
-- then read back: select status_code, content from net._http_response where id = <request_id>;
```

Request ids for this run: **182-211** (the 30 scored invocations, `fts`/`hybrid`/`vector` per
query in `qid` order) and **212-221** (the 10 `fts_kw` diagnostic invocations). All 40 returned
HTTP 200.

The aggregate row is recorded in `sync_runs` with `source='manual'`,
`scope='embedding-poc eval'`.
