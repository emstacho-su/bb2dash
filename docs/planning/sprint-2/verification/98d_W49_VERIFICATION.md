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
