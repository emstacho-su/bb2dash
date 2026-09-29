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
