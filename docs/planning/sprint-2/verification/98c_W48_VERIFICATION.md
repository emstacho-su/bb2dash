# 98c — W-48 verification (Phase 18, db stream)

Worker W-48 · branch `feat/ingest-corpus-18-db` · worktree `bb2dash-wt-18-db` · brief
`docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md` (frozen 2026-09-29).
Runner: `node scripts/db-test.mjs --only <file>` as `db_test_runner` (Phase 15).
Each migration: dry run inside `begin; … rollback;` via `execute_sql`, then `apply_migration`
under the file's name, then md5 of `supabase_migrations.schema_migrations.statements[1]` compared
with `git show HEAD:<file> | md5sum` (the LF blob).

## Drift read at the start (prod, 2026-09-29)

* Current files 89 (brief: 84), current units 775 (brief: 784), parts 1,545.
* Four current files catalogued since the brief and not yet pulled: 161, 162, 163, 452
  (`text_status = 'pending'`, no bytes). File 160's four units (785–788) have no embedding.
  Both are the gate sync's job (tasks 16, 17); task 1's (a) and (c) name them until then.
* Files 2, 74, 151 and IST.323's `syllabus_path` read as the brief says (2 and 74 current, 151
  `unclassified` / `rule` / 0.6, `IST.323/323Fall26V1.3.1.docx`).

## Task 1 — `db/tests/phase18_post_embed_checks.sql`

RED (2026-09-29, before task 7):

```
FAIL  phase18_post_embed_checks.sql  FAIL (a) no text unit: 161, 162, 163, 452; (b) na without twin: 68; (c) parts: 785 no parts, 786 no parts, 787 no parts, 788 no parts; (d) unlabelled notes: hybrid subrequirements/482, hybrid supplicant/738, hybrid supplicant/750, keyword supplicant/738, keyword supplicant/750, vector part 1/750
db-test: passed 0, failed 1, units 1
exit=1
```

File 68 is named under (b) and `supplicant` under (d), as the brief's RED line requires. GREEN
needs task 7 (121) for (d), task 20 (file 68, PM) for (b), and the gate sync's pull and embed for
(a) and (c).
