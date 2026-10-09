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

## Round 2: `grading_invariants.sql`, check D

Before: `FAIL D point-bearing assignments with no component, not excluded, not excepted: GEO.103.lecture/exam-1`. After: `PASS grading_invariants.sql`.

D now passes an assignment with `points_possible > 0` and no `component_id` of its own when a `grade_column_links` row for its `(course_id, bb_column_id)` is excluded (as before) OR carries a `component_id` (a non-excluded link that places the column). The `D_EXCEPTIONS` ratchet is unchanged and still empty. The header sentence says why: `v_grade_model_items` (081) takes the component from a non-excluded link first, and migration 106 folded links into `assignments.component_id` only once, so a later link never reaches the assignment. The failure message was reworded to name the new condition.

Check E (read, unchanged) joins both `assignments` and `grade_column_links` to `grade_components` and fails when the component's course is not `coalesce(parent_course_id, id)` of the row's course, so a link to a wrong course's component still fails there.

Same rule elsewhere: `grep` over `scripts/`, `db/tests/` and `web/src` for `points_possible > 0`, `D_EXCEPTIONS`, `grading_invariants` and "no component" finds only this unit; `scripts/validate-grading.mjs` and `scripts/v1_recheck.py` hold no D-like check. No script touched, so no script tests re-run. `v_gradebook_latest.counts_toward_grade` has the same blind spot and was left alone (a migration, the PM's).

## Round 3 (after `/code-review main high`)

Round 3 supersedes the golden-truth paragraph of section 4 (the chain-following unit, the NOTE and `truth_note` are gone).

1. **Golden truth back to strict** (58ad955). The unit is `main`'s logic again: every truth file exists and is current, and the phrase checks run on current files. Q7 names `2509, 2773` in the SQL row and in `golden_set.json`; `truth_note`, the NOTE, the notice and the second column are removed; `eval_search.mjs` is byte-identical to `main`; the test that pinned Q7's ids is removed (the drift guard still ties the JSON to the SQL rows). A superseded truth file now fails with the replacing id: `Q7 file not current: 149 -> 2509, 967 -> 2773 (refresh the ids in this row and in ingest/eval/golden_set.json)`, found by a walk limited by one constant `CHAIN_LIMIT` = 1000 (a cycle or a longer chain prints "no end within 1000 steps"). The header says Q7 is a re-posted schedule, so the unit fails at each re-post until the ids are refreshed, and that the lasting fix is a question whose answer does not move (the eval owner's call). Proof, throwaway copy with Q7 = `149, 967`, deleted, never committed: `FAIL Q7 file not current: 149 -> 2509, 967 -> 2773 (refresh the ids in this row and in ingest/eval/golden_set.json); Q7 current file carries the phrase but is not in the truth: 2509,2773` (the second clause is `main`'s own check). Real unit: PASS. `node --test ingest/eval_search.test.mjs`: 10 pass, 0 fail.
2. **122** (d0d5d3d). `CHAIN_LIMIT` = 1000 replaces the literal 20; the precondition failure says "a file not superseded, a cycle or a chain longer than 1000". Case (6) now takes the current same-named file from the computed chain end of file 2 (`v_end_of_2`) instead of the literal 151. The case (7) header no longer names 151, 149 and 967. The header states the assumption case (1) rests on (each re-post replaced the previous file alone in its item). PASS.
3. **grading_invariants D** (9a46490). The link exemption is replaced by the model's own: excluded link (as before), OR `v_grade_model_items` has a row with `assignment_id = a.id`, `component_id is not null` and `not excluded`. View columns used: `assignment_id`, `component_id`, `excluded` (081). Header rewritten; a line under F says a column placed by the picker is Stack's override and carries no citation. F unchanged. PASS.
4. **123 case 4** (fc9f81f). A file is exempt only when its latest settled answer (same predicate and order as 163 step c, plus `entity = 'bb_file'` and `field = 'session_id'`) has a `to_value` equal to `to_jsonb(array_agg(session id order by id))` of the week's non-`no_class` sessions, built as the function builds `v_ids`. File 2488's answer matched, so nothing stopped. Comment corrected. PASS.

Final runs: 123, 122, golden truth, 106, grading_invariants PASS; 101 fails only on the four `workspace_*` names.

## Round 4 (Stack: "Fix phase 18 as well")

Q7 replaced, so the golden-truth unit no longer depends on a re-posted schedule. New Q7: IST.466, paraphrase, "how many points is the practice presentation worth in IST 466", truth text_ids `[88, 101]`, file_ids `[21, 39]`, phrase "50 points", in `ingest/eval/golden_set.json` and in the SQL row (one row per line, same shape). The unit stays strict and still names the replacing file when any truth file is superseded; its Q7 header paragraph now tells the history and no longer says the unit fails at each re-post. `eval_search.mjs` and `eval_search.test.mjs` named neither the old query nor its ids, so they are untouched. `grep -rn "Deloitte" ingest/ db/tests/phase18_golden_truth.sql` now finds only the old report `ingest/eval/reports/2026-09-29.json` (history, not edited); the header avoids the word. Results: golden truth unit PASS; `node --test ingest/eval_search.test.mjs` 10 pass, 0 fail (the drift guard holds). `ingest/eval_search.mjs` was not run.
