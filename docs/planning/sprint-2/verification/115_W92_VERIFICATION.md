# 115 W-92 verification: five test-side corrections

Worker W-92, branch `fix/sql-units-live-data`, 2026-10-09. Contract: `115_SQL_UNITS_AUDIT_2026-10-09.md` (kinds A and B).
Every unit run with `node scripts/db-test.mjs --only <unit>` (read-only login, rolled back). No migration, no MCP call, no write to prod.

## Results

| # | unit | before | after | commit |
|---|---|---|---|---|
| 1 | `phase15_101_search_path_pin.sql` | FAIL, `[app_owner(), calendar_push_now(), inbox_accept_question(), workspace_ask_with(), workspace_document_delete(), workspace_upload_register(), workspace_upload_retry()], expected [app_owner(), calendar_push_now()]` | FAIL (expected), same actual list, `expected [app_owner(), calendar_push_now(), inbox_accept_question()]`; the only unexpected names are Phase 24a's four `workspace_*` | 8d8a863 |
| 2 | `phase18_123_file_sessions.sql` | FAIL `(4) ambiguous without exactly one open question: 2488:0` (the audit's line; not re-run before the edit) | PASS | 51881e1 |
| 3 | `phase18_122_supersede_rule.sql` | FAIL `(1) newest run c601bdf9-... wrote 4: 2->151, 74->2509, 150->2773, 162->2773` | PASS | b020b5f |
| 4 | `phase18_golden_truth.sql` | FAIL `Q7 file not current: 149,967; Q7 current file carries the phrase but is not in the truth: 2509,2773` | PASS | ae09025 |
| 5 | `phase16_106_v1_recheck.sql` | FAIL `IST.323-11 (got 7, want 5)` | PASS | a14a85c |

Other checks: `node --test ingest/eval_search.test.mjs` 11 pass, 0 fail. `uv run --with pyyaml python scripts/v1_recheck.py --check docs/planning/sprint-2/verification/96b_*.md` reads `rows: 211, errors: 0, differs without call: 0` (same as before the edit); `--summary ... --compare 96d` still reports the counts table carried. `scripts/test_v1_recheck.py`: 125 passed. `scripts/validate-grading.test.mjs` (reads the 96b files): 30 pass, 0 fail. `ingest/eval_search.mjs` itself was not run (live key).

## 1. 101: the definer list

`inbox_accept_question()` joins the expected string (`app_owner(), calendar_push_now(), inbox_accept_question()`), in the comparison and in the message. Four lines of change plus a four-line comment inserted in the section (c) comment block (not on the string lines) saying why it is allowed (187 section 3, owner check first, proved by `phase23_187_accept_objects.sql`). The unit's header line (c) still says "app_owner() and calendar_push_now()": left alone to keep the diff to the lines #86 does not touch; the comment below it supersedes it. Phase 24a's four names were not added. Merge note: whoever merges second keeps both sets in the string at line ~143 and in the message.

## 2. 123: case 4

The exemption now reads `state in ('resolved','dismissed') or (state = 'archived' and decision->>'closed_itself' is distinct from 'true')`, which is migration 163's predicate verbatim. The header's case (4) line says so.

## 3. 122: case 1

Before the unit clears `superseded_by` on 2, 74, 150 and 162 it reads each one's chain end with a recursive CTE (depth limit 20) and builds `v_expect` as `'2->151, 74->2509, 150->2773, 162->2773'` in the same `id->target` format as `v_got`. Case 1 requires `superseded = 4` and `v_got = v_expect` (so exactly four links written, nothing else linked). The function writes each link straight to the chain end, which is what was observed before the change. A precondition fails with its own message if fewer than four of the files have a chain with an end (a file not superseded at all, or a cycle). Cases 2 to 7 are unchanged: none repeated the pinned string. Header paragraph for case (1) rewritten. The pre-existing case (7) comment ("151, 149 and 967 never sat beside...") names historical ids and was left as is.

## 4. Golden truth

The rule: a truth file is the file named or the current end of its supersession chain.
* SQL unit: each named id is resolved to its chain end (depth 20). A missing id fails ("file does not exist"); a chain with no end fails; the "text_id belongs to a truth file", "some unit carries the phrase" and "names every current file of the course" checks run on the union of the named ids and the chain ends. A named id that is itself superseded does not fail: it raises a notice `NOTE Q7 names superseded file(s) ...; chain end(s) ...` and fills a second `note` column of the PASS row (the PASS text stays in the first column because the runner reads the first column for `: PASS`; the runner prints neither).
* Checked on prod, then discarded: a temporary copy of the unit with Q7 = `149, 967` (the stale ids) PASSES; with `149, 99999999` it FAILS naming the nonexistent id. The copy was deleted, never committed.
* `golden_set.json` (Q7 only) and the SQL truth row now name `2509, 2773`, one row per line in the original shape (the drift test passes). JSON cannot carry a comment, so Q7 got a `truth_note` key (ignored by `validateGolden` and the drift test) saying why and when to refresh. The comment explaining it is in the headers of the SQL unit and of `eval_search.mjs`. `eval_search.test.mjs`'s Q7 test now pins `[2509, 2773]`.
* Default taken: the instruction read as "keep the original-id mechanism with a chain-following unit AND set Q7 to the chain ends"; I did exactly that. No cleaner form needs no new access, so none was taken. Costs a manual refresh of two files per re-post, signalled by the NOTE.

## 5. 106: IST.323-11

Only that entry's `recheck` changed, to `... and points_possible = 10 and id in ('IST.323/quiz-01', ..., 'IST.323/quiz-05')`. The guard accepts it unchanged (no guard edit). Regeneration with the glob order `96b_*.md` (ECN.304, GEO.103, IST.323, IST.352, IST.466, IST.471) first reproduced the committed unit byte for byte, then after the edit changed exactly one line. `git diff --stat`: unit 1 line, verdict file 1 line.

## Final diff

`git diff --stat origin/main...HEAD`: the five units, the verdict file, `golden_set.json`, `eval_search.mjs`, `eval_search.test.mjs`, this file, and `115_SQL_UNITS_AUDIT_2026-10-09.md` (already on the branch before W-92 began).

Nothing stopped on; nothing built differently from the brief.
