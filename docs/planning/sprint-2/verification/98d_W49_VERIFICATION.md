# 98d — W-49 verification (Phase 18, ingest + corpus)

Worker W-49 · branch `feat/ingest-corpus-18-ingest` · worktree `bb2dash-wt-18-ingest` · brief 98 (frozen 2026-09-29).

## PR #32's tasks (2, 3, 15, most of 4): GREEN lines, no RED

Per brief 98's "Recorded at the phase start" paragraph, tasks 2, 3 and 15 were delivered by PR #32 (795bcf6) and
their RED lines are that PR's history. The PM's GREEN lines at L1 on `origin/main` de7c644:

* `node --test ingest/fetch_signed.test.mjs ingest/embed_corpus.test.mjs ingest/pull_files.test.mjs` → 56 pass, 0 fail
* `grep -cF "waitForEvent('download'"` → 0 in `skills/bb-sync/SKILL.md`, `ingest/CADENCE_RUNBOOK.md`,
  `skills/bb-course-pull/SKILL.md`, `ingest/pull_files.mjs`
* `grep -cF "bb.downloadAll" skills/bb-course-pull/SKILL.md` → 0
* `grep -cF "file bytes are not downloaded here" skills/bb-sync/SKILL.md` → 0
* `grep -cF "pull_files.mjs --fetch" skills/bb-sync/SKILL.md` → 1; `grep -cF "embed_corpus.mjs --check" skills/bb-sync/SKILL.md` → 3

Re-run by W-49 in this worktree on 2026-09-29 after task 4: the same greps read 0, 0, 0, 0, 0, 0, 1 and 3.

## Task 4 — `--restale` (redesigned)

Prod read first (execute_sql, read-only): rows 72 and 144 are the only current rows with the marker. Their notes end
`| source_url changed 2026-09-16; stored bytes may be stale` and `| source_url changed 2026-09-23; stored bytes may be
stale`; the wording comes from `stage_files` (074:250, and 034/037/043/053 before it): `'; stored bytes may be stale'`.
`bb_file_text` is unique on `(file_id, unit_kind, unit_no)`, anon holds INSERT only through RLS (no select, no delete),
and `bb_text_embeddings.text_id` cascades on delete. So the new units cannot be posted while the old ones stand, and
only the owner can remove the old ones: the mode is two script runs around one owner step.

Design: `--restale` fetches, hashes; unchanged bytes → owner SQL that only rewrites the marker; changed bytes → a new
Storage key with a `restale-<sha12>/` segment (occupied key refused, never overwritten), mirror at the new path, units
staged on disk at `<downloads>/restale_units/<id>.json`, and one `begin; delete old units; update bb_files …; commit;`
per row guarded on the old sha. Every value in that SQL is shape-checked (id, sha, size, mime, date, one-line key).
`--restale-post` posts the staged units over PostgREST (a 409 = owner SQL not run yet) and runs the embed step.

RED (before `pull_files.mjs` changed; the 11 new cases appended, 21 existing kept):

```
node --test ingest/pull_files.test.mjs
ℹ tests 31
ℹ pass 21
ℹ fail 10
```

GREEN:

```
node --test ingest/pull_files.test.mjs
ℹ tests 31
ℹ pass 31
ℹ fail 0
node --test ingest/*.test.mjs
ℹ tests 66
ℹ pass 66
ℹ fail 0
```

Smoke (scratch manifest, no network): `--restale --dry-run` → `{"id":72,"restale":"changed","key":"IST.352/readings/restale-e94074f40f4d/M.pptx",…}`,
`dry run (restale): 1 of 1 would be pulled`, exit 0; `--restale --bucket my_submissions` → exit 2.

`skills/bb-sync/SKILL.md` step 4b gains the "Stale bytes (`--restale`)" paragraph (manifest query, the three commands).
`ingest/CADENCE_RUNBOOK.md` does not list the script's modes (step 4 points at the skill), so it is unchanged.

## Task 21 — `ingest/token_budget.py`

RED (test file first, no module):

```
uv run --with tokenizers --with "psycopg[binary]" --with pytest python -m pytest ingest/test_token_budget.py -q
E   ModuleNotFoundError: No module named 'token_budget'
1 error in 0.73s
```

GREEN (first cut): `8 passed`. The first live run then failed with `invalid URI query parameter: "uselibpqcompat"`
(the runner's DSN carries node-pg's `uselibpqcompat`, which libpq refuses). A case for `libpq_dsn` went RED
(`1 failed, 8 passed`), then GREEN:

```
uv run --with tokenizers --with "psycopg[binary]" --with pytest python -m pytest ingest/test_token_budget.py -q
9 passed
```

Live (DSN from the worktree's `.env.local`, `db_test_runner`):

```
uv run --with tokenizers --with "psycopg[binary]" python ingest/token_budget.py
parts=1502 max_tokens=485 over_budget=0
exit=0
```

Open item 4 (parts over 512 tokens): none. 1,502 current gte-small parts, the longest 485 tokens.

## Task 22 — golden set, truth test, eval runner

Truth re-read on prod 2026-09-29 (execute_sql, read-only; migration 120 is applied: 2→151, 74→149). Every §2 answer
phrase was located by `position()` in its unit: Q1/Q2 text 270, Q3 276, Q4 213, Q5 218, Q9 348 (text-id truths);
Q6 file 21, Q7 file **149** (text 731, "Deloitte to Visit"), Q8 file 27, Q10 file **151** (text 733, "You may use AI
tools") (file truths). File 13 has no unit with Q10's phrase, so it left the truth. Two §2 phrases did not match
verbatim (a line break in 270, "site supervisor" hit four IST.471 pages), so the recorded phrases are
`miss three lectures, no questions asked` and `evaluation form will result in no credit`.

RED (test first, no module):

```
node --test ingest/eval_search.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\ingest\eval_search.mjs'
ℹ tests 1  ℹ pass 0  ℹ fail 1
```

RED for the truth test (the file with the 2026-09-09 truth for Q7 = 16/40/58/66 and Q10 = 2/13, as §2 records it):

```
node scripts/db-test.mjs --only phase18_golden_truth.sql
FAIL  phase18_golden_truth.sql  FAIL Q7 file not current: 16,40,58,66; Q10 file not current: 2
db-test: passed 0, failed 1, units 1   (exit 1)
```

GREEN:

```
node --test ingest/eval_search.test.mjs
ℹ tests 11  ℹ pass 11  ℹ fail 0
node scripts/db-test.mjs --only phase18_golden_truth.sql
PASS  phase18_golden_truth.sql
db-test: passed 1, failed 0, units 1   (exit 0)
node --test ingest/*.test.mjs
ℹ tests 77  ℹ pass 77  ℹ fail 0
```

Live eval: **not run by W-49.** `SB_ANON_JWT` is in no gitignored env file on this machine (the worktree's and the main
checkout's `.env.local` hold only `BB2DASH_TEST_DB_URL`; `bb2dash/.env` holds the service role, which this script must
not use). `node ingest/eval_search.mjs --out ingest/eval/reports/2026-09-29.json` → `SB_ANON_JWT (the legacy anon JWT)
is not set`, exit 2. The PM runs it with the key in the process environment; expected `scored=30`, hybrid MRR ≥ 0.900.

## Task 25 — the one `EVAL_EMBEDDING_POC.md` line (R-74)

One line appended to §1's "Known issue accounted for" paragraph, stating each mode's shape today (vector: whole unit
text, one row per unit, nearest `part_no` + `similarity`, per `search`'s `bestPartPerUnit`; hybrid: matched passage,
`snippet_source`, `part_no`; fts: `rank` + whole-unit headline) and naming the committed re-run.

* RED: `grep -cF "Shapes today (Phase 18, 2026-09-29)" EVAL_EMBEDDING_POC.md` → 0
* GREEN: the same grep → 1

## Round 2 (PM, 2026-09-29, after the merge into `feat/ingest-corpus-18` at 5cada4d)

The anon JWT was loaded into the process environment only, from the desktop config; it was never printed or written.

### fix(18-3): clean exit (`c057f23`)

The PM's `embed_corpus.mjs --check` printed `missing_parts_before=5` and then node aborted with
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 94`: a hard exit while undici was
still closing a fetch handle. `embed_corpus.mjs`, `eval_search.mjs` and `pull_files.mjs` now set `process.exitCode` and
let the loop drain, and a rejected `main()` sets exit code 1.

* RED: `node --test ingest/embed_corpus.test.mjs` → `tests 13, pass 12, fail 1` (the guard test: `embed_corpus.mjs calls process.exit()`)
* GREEN: `node --test ingest/*.test.mjs` → `tests 79, pass 79, fail 0` (the guard test plus a CLI spawn test: no key → exit 2, no assertion)
* Live: `node ingest/embed_corpus.mjs --check` → `missing_parts_before=5`, exit 1, clean.

### The five missing parts

File 160 (`Performing a Ransomware Attack - Evan Stachowiak.pdf`, IST.323, Stack's submission), units 785, 786, 787 (1
part each) and 788 (1,669 chars, 2 parts) = 5 parts. Its notes read `bytes pulled 2026-09-27 by bb-sync step 4b`: the
2026-09-27 sync ran the old step 4b, which posted text and had no embed step (PR #32 added it on 2026-09-29). They are
not `--restale` rows and not eval truth units. The embed step fixed it:

```
node ingest/embed_corpus.mjs
embed-corpus: 3 row(s) in, 2 part(s) left
embed-corpus: 2 row(s) in, 0 part(s) left      (exit 0)
node ingest/embed_corpus.mjs --check
missing_parts_before=0                          (exit 0)
```

### fix(18-22): eval diagnosis and the Q7 truth

First live run: `hybrid mrr=0.870`, exit 1. All queries were rank 1 except Q7 (vector 2, hybrid 2) and Q10 (vector 5, hybrid 5).

* **Q7: the truth definition was wrong.** Rank 1 was file 150 `IST466_2Schedule_wK4.docx` (text 732, sim 0.901). It is
  current and carries "Deloitte to Visit", posted in a second place under a different `content_id`. The truth 149 was
  rank 2. EVAL_EMBEDDING_POC.md §1 defines a file truth as "a file_id set … when several near-duplicate files carry the
  same answer", and §2 scored Q7 over all four schedule copies at that time. So Q7's truth is now {149, 150}. The truth
  test gained a completeness check: a file truth must name every current file of that course whose text carries the
  phrase. RED: `FAIL Q7 current file carries the phrase but is not in the truth: 150`. GREEN: `PASS`. The eval test's
  Q7 expectation also went RED (`pass 10, fail 1`) and then GREEN.
* **Q10: a real ranking regression, left as it is.** Ranks 1–4 are file 4 `IST323-Initial-Logon-v2.docx` (text 360,
  0.857), file 72 `Managing the Information Systems Project.pptx` (589, 0.856) and file 144 `Identifying & Selecting…pptx`
  (717 0.856, 718 0.853). The last three are IST.352 "Closing / Questions / Next Class" slides. Then 151 at rank 5
  (733, 0.852). With superseded files included, the old truth file 2 would be rank 7 (0.849), and file 13 is rank 9. In
  the POC, file 2 was rank 2 behind the same file 4. The drop is corpus growth: decks 72 and 144 were stored on
  09-14 and 09-22, after the 09-09 POC corpus. The similarity band is tight (0.847–0.857). This is not a truth defect,
  and none of the 5 missing parts are truth units.
* **Hybrid = vector is expected, not broken fusion.** FTS (`websearch_to_tsquery`, AND of every term) returns nothing on
  9 of 10 natural-language queries, as in the POC (fts MRR 0.100 then and now). So RRF reduces to the vector order,
  exactly as POC §5 describes ("hybrid *is* the vector ordering"). The POC's hybrid hit@1 was 9/10. Today it is again
  9/10 (fts hits Q2 only).

Final live run: `node ingest/eval_search.mjs --out ingest/eval/reports/2026-09-29.json`

```
fts: hit@1=1/10 hit@3=1/10 hit@10=1/10 mrr=0.100
vector: hit@1=9/10 hit@3=9/10 hit@10=10/10 mrr=0.920
hybrid: hit@1=9/10 hit@3=9/10 hit@10=10/10 mrr=0.920
scored=30   (exit 0)
```

The bar was not changed. Hybrid MRR 0.920 is below the POC's 0.950 only because Q10 fell from rank 2 to rank 5.

## Round 3 (PM, 2026-09-29): Q10 removed on Stack's AI-policy call

Stack decided on 2026-09-29 to take the AI policy out of the app and the search corpus. Phase 17 migration 119 strips
each course's AI-use policy section from `bb_file_text` and re-embeds (brief 97 "## Round 3", R-6). Golden Q10 ("do I
need to admit using ChatGPT on the IST 323 final project", truth 151, phrase "You may use AI tools") has no answer after
that. So Q10 is removed from `ingest/eval/golden_set.json` and `db/tests/phase18_golden_truth.sql` because of that
product call. **It was not removed for its ranking** (it was rank 5 in round 2). **The bar stays hybrid MRR ≥ 0.900.**
The eval is now 9 queries × 3 modes, so the brief's line reads `scored=27` in place of `scored=30`.

* RED: `node --test ingest/eval_search.test.mjs` → `tests 11, pass 9, fail 2` (golden qids 1–9, full run 27 calls / `scored=27`)
* GREEN: `node --test ingest/*.test.mjs` → `tests 79, pass 79, fail 0` (the drift guard is green: the same qids 1–9 on both sides)
* `node scripts/db-test.mjs --only phase18_golden_truth.sql` → `PASS  phase18_golden_truth.sql`, exit 0
* Live eval: not run now (119 is not applied yet). The PM re-runs `node ingest/eval_search.mjs --out ingest/eval/reports/<date>.json` after the re-embed.
  Expected: `scored=27`. Round 2's committed report (`2026-09-29.json`) still holds the 10-query run.
