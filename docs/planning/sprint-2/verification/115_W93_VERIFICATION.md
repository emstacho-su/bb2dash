# 115 W-93: migration 107, `v_gradebook_latest.counts_toward_grade` follows the picker

Worker W-93, 2026-10-09. Branch `fix/sql-units-live-data`. Audit: `115_SQL_UNITS_AUDIT_2026-10-09.md`, section C.

## Files

* `db/tests/phase16_107_counts_toward_links.sql` (new, committed first, red)
* `db/migrations/107_gradebook_counts_toward_links.sql` (new)
* `DATA_SYNTAX.md` (one paragraph under the Views list)
* this record

## The red run (before the migration existed)

```
node scripts/db-test.mjs --only phase16_107_counts_toward_links.sql
FAIL  phase16_107_counts_toward_links.sql  FAIL phase16_107_counts_toward_links: migration 107 is not applied
db-test: passed 0, failed 1, units 1
```

`node scripts/db-test.mjs --only grading_invariants.sql`: `PASS`. The SQL of 107 and of the unit's later
sections was **not run anywhere** (no dry run is mine to make); it is proofread only. The unit passes the
runner's lint (begin first, one rollback last) because the runner got as far as running it.

## Where the live view text came from

`grep -n v_gradebook_latest db/migrations/*.sql`: 046 (a comment), 047 (the only `create view`), and 050,
055, 058, 081, 085, 181 which only read it or grant on it. No migration re-creates or alters the view
(no `alter view` names it; 036's security_invoker guard only checks). So the live text is 047's, lines
43-94, and 107 starts from it with one expression replaced (marked `-- 107:`). Options kept:
`security_invoker = true` (the only option 047 sets). 047 revokes from anon and grants select to
`authenticated, service_role`; 181 adds `inbox_apply_runner`; `create or replace` keeps all of them.

Expected column list (36, in order, hard-coded in 107's guard): id, run_id, sync_run_id, course_id,
column_id, name, position, content_id, category_id, possible, due_at, calc_type, is_calc, is_total,
column_kind, aggregation, visible, grades_released, multiple_attempts, attempts_left, effective_score,
manual_score, display_score, display_grade, is_override, is_exempt, feedback, submission_status,
last_attempt_status, last_attempt_created, last_attempt_submitted, last_attempt_score, seen_at,
assignment_id, linked_assignments, counts_toward_grade. The list is read from 047's select, not from prod:
if prod's view differs from 047 (it should not), the guard raises in the PM's dry run, which is the check.

## Defaults I took

1. **Case 4 is skipped, and the unit proves why.** 057's `grade_column_links_one_target` is
   `(component_id is not null) <> excluded`, so a non-excluded link with a null component cannot exist.
   Section 4 inserts one and expects `check_violation`.
2. **Fixture row**: the first row by (course_id, column_id) of kind item or attendance with
   `linked_assignments = 1`, no link, and a component in its scheme course; the component used is that
   scheme course's lowest id (the same-course trigger of 057 is satisfied). Seven cases run on it in a
   loop (no link with/without the assignment component, excluded with/without, placed with/without, the
   link removed again); each compares the whole row minus the flag with its baseline snapshot.
3. **Model view comparison (case 7)** is restricted to columns that have a link or link at most one
   assignment. Reading 081: with a non-excluded link the model's component is the link's (never null,
   per 057); with an excluded link the model's `excluded` is true; with no link the component comes from
   the single linked assignment (`assignment_id` is null when several are linked, so the component is
   null), where the flag's `bool_or` over all of them can differ. Placeholders (`column_id` null) are out.
4. **Guard in 107** raises on: not `security_invoker=true` in `reloptions`; anon can select;
   authenticated cannot; column names (ordered by `ordinal_position`, `information_schema.columns`) differ
   from the list; the view definition does not mention `grade_column_links`. No type check (types come
   from the same select; `create or replace` itself refuses a type change).
5. `comment on view` is re-stated with the `counts_toward_grade` sentence corrected.
6. `DATA_SYNTAX.md` had no mention of the view, so the sentence is a new paragraph after the Views list.

## A finding for the PM, not fixed here (grants are outside this brief)

`v_gradebook_latest` is `security_invoker`, so its reader needs `select` on every table it reads. Since 107
that includes `grade_column_links`. `inbox_apply_runner` (181) has `select` on `v_gradebook_latest`
(181 line ~99) and **no** select on `grade_column_links`, and no read policy there (181 creates policies
only for eight other tables). After 107 a `select` from the view as that role raises `permission denied
for table grade_column_links`; even with a bare grant the owner-only policy would hide every link from it
and the flag would silently fall back to the assignments rule. The apply container reads the view for the
gradebook facts of `/inbox-apply`. The other readers (`authenticated` = the owner through RLS,
`service_role`, `db_test_runner` with BYPASSRLS and select everywhere) are fine.

I did not touch grants. `phase16_107_counts_toward_links.sql` section 6 runs `select count(*)` on the view
under `set local role inbox_apply_runner` and fails with a message naming this if it is denied, so the
PM's dry run will show it. If the PM agrees it is a real regression, the fix is in 107 or in a number of
its own: `grant select on public.grade_column_links to inbox_apply_runner`, plus a
`grade_column_links_inbox_apply_read` select policy `to inbox_apply_runner using (true)` in 181's pattern,
and `phase23_181_inbox_apply_runner.sql` (its pinned select-grant list near line 104) updated to match.
That also widens a role the Phase 23 security review covered, so it is Stack's to see. I could not run
any of this.

## Not checked

* Nothing of 107 or of sections 2-6 of the unit has run (no database path for it). Likeliest places for a
  first-run failure: the aggregate-plus-`exists` CASE in the lateral (valid SQL as I read it: the
  sub-selects reference only outer columns), the `for c in select * from (values ...)` loop, and
  section 6's `set local role` inside a DO block (phase23_181 does the same).
* Whether prod's live view text equals 047's (read from the repo, not pg_get_viewdef).

## Round 2 (the PM's ruling on the finding above)

The PM confirmed the finding on prod and ruled: the role keeps its read of the view, so 107 gives it the
one read the view now needs.

* **Unit first** (commit 933a773, red: `FAIL ... migration 107 is not applied`). Section 6 now expects
  that, under `set local role inbox_apply_runner`, `select count(*)` on `v_gradebook_latest` succeeds and
  equals the test login's count, `select count(*)` on `grade_column_links` succeeds and equals the login's
  (so a missing policy shows), and an insert, an update (`where false`) and a delete are each refused with
  `insufficient_privilege` (42501). `reset role` follows, before any assertion raises.
* **Migration 107**: a section before the guard grants `select on public.grade_column_links` to
  `inbox_apply_runner` and creates `grade_column_links_inbox_apply_read` (`for select ... using (true)`).
  Copied from 185: policy name `<table>_inbox_apply_read`, created behind an `if not exists` on
  `pg_policies`, so a second run is a no-op (the grant is idempotent anyway). 185 grants `bb_files` by
  column and `sessions` whole; `grade_column_links` has five harmless columns, so whole-table select.
  Unlike 185 the block first checks the role exists. Consequence for a replay of the migrations in numeric
  order: 107 runs before 181 creates the role, so 107 only raises a notice and 181 then leaves the role
  without the table read; a replay from scratch needs the grant and policy re-run after 181. Prod is
  unaffected (the role exists). I cannot edit 181.
* **Guard** extended: the role holds select; it holds none of insert, update, delete, truncate, references,
  trigger (table level) and no insert or update column privilege; the select policy exists for the role
  alone; no non-select policy names the role; and `anon`, `sync_runner`, `workspace_runner`,
  `workspace_ingest_runner` (each only if it exists) hold no privilege on the table. No `set role` in the
  migration.
* **`phase23_181_inbox_apply_runner.sql` does pin the read list** (the sorted `relname:privilege` string,
  exact equality). One added statement: before the comparison, `v_got := replace(v_got,
  'grade_column_links:select,', '')`, with a comment naming 107. It therefore passes both before 107 (the
  entry is absent) and after (the entry is removed), and any other privilege on the table still fails it.
  The first draft built the expected string with a `case` on the view's definition inside the literal
  concatenation; the server answered "syntax error at end of input", so it was replaced by the `replace`.
  Today: `PASS  phase23_181_inbox_apply_runner.sql`.
* `DATA_SYNTAX.md`: two lines in the 107 paragraph (no other place describes the role's reads except one
  mention of `v_inbox_queue` in the 187/188 section).
* Not checked: everything that needs 107 applied. The two checks that the policy blocks every other role
  (`using (true)` applies to `inbox_apply_runner` only, `to inbox_apply_runner`) rest on reading 185.
