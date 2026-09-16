# 68a — W-20 verification (Phase 10b grade model, database + web)

Worker: W-20. Branch `feat/grades-10b-web`, worktree `bb2dash-wt-gm-web`.
Contract: `docs/planning/68_PHASE10B_grade_model.md` § "Contract (frozen 2026-09-16)".
Date: 2026-09-16. Project `goultdzqcavefcgnifdy` (prod — there is no staging).

Everything below was run against prod. Numbers are what the database returned.

---

## 1. What shipped

| File | Applied as | Prod version | md5 (git blob = prod `statements`) |
|---|---|---|---|
| `db/migrations/057_grade_scenarios_and_links.sql` | `057_grade_scenarios_and_links` | `20260916202757` | `2de24e9fa5967b7879d54f6370f65c7e` |
| `db/migrations/058_grade_model_views.sql` | `058_grade_model_views` | `20260916202956` | `8bc6a05857e5d149bc1ba10157d491a8` |

Byte identity, checked by comparison:

```sql
select version, name, md5(array_to_string(statements, '')) as stmt_md5
  from supabase_migrations.schema_migrations where name ~ '^05[78]_';
```

returns the two md5s above, which equal `git show HEAD:db/migrations/<file> | md5sum`. Each
migration arrived as one statement (9,773 and 12,868 bytes). The working tree carries CRLF from
`core.autocrlf`; the blob and the applied text are both LF. No other migration was touched; the
versions sort after Phase 11b's `067_planner_events` (applied earlier the same day), which is
expected and harmless.

Also shipped:

| Area | Files |
|---|---|
| SQL tests | `db/tests/phase10b_grade_model.sql` |
| Types | `web/src/lib/supabase/database.types.ts` regenerated after 058 (it also carries Phase 11b's live objects; regenerate again at integration) |
| Query layer | `web/src/lib/queries.grade-model.ts` (+ pure `grade-model-input.ts`, `grade-model-view.ts`, `grade-model-format.ts`, `grade-model-run.ts`) |
| Components | `ModelStanding`, `WhatIfCell`, `PlaceholderRows`, `TargetSolver`, `ScoreHistory`, `LinkColumnControl`, `GradeModel.module.css`, hooks `useCourseGradeModel`, `useCourseModelActions`; `GradebookTable` gains optional `whatIf` / `history` / `links` / `footer` |
| Screens | `CourseGrades.tsx`, `GradesScreen.tsx` (optional `model` prop), new `GradesModelScreen.tsx`, `grades/page.tsx` renders it |
| Tests | `queries.grade-model.test.ts`, `grade-model-view.test.ts`, `ModelStanding`, `WhatIfCell`, `TargetSolver`, `ScoreHistory`, `LinkColumnControl`, `CourseGrades.model`, `GradesScreen.model`, `grade-model.audits.test.ts`, fixtures `factories.grade-model.ts`, `fake-grade-model.ts` |

`web/src/lib/grade-model/{types,labels,index}.ts` were not edited.

---

## 2. Dry runs

Both files were run verbatim inside `begin; … rollback;` through `execute_sql` before
`apply_migration`.

| Migration | The dry run also did | Result |
|---|---|---|
| 057 | read back RLS, policy count and grants for anon / authenticated / public | both tables `relrowsecurity = true`, 1 policy each, grants `authenticated: SELECT, INSERT, UPDATE, DELETE` only, nothing for anon or public |
| 057 (probe, same body) | as the owner's JWT: inserted a GEO recitation → lecture link, a scenario, updated its letter; tried a cross-course link, a string score, a negative score | owner writes landed through RLS; the three bad writes raised `check_violation` |
| 058 | counted every view and grouped the items | `v_grade_model_items` 77 rows (item 41, attendance 5, placeholder 31); 9 unsure links; `v_grade_model_total` 1 row, IST.323, `score 14.8`, `possible 104`, `bb_running true`; `v_gradebook_history` 53 rows, 5 columns with a change; GEO placeholders dated 23:59 New York (EDT `03:59Z`, EST `04:59Z`) |

---

## 3. SQL tests

`db/tests/phase10b_grade_model.sql`, pasted whole into one `execute_sql` call (opens its own
transaction, ends in `rollback`). A failing assertion raises; this is the pass row:

```
result                      | phase10b_grade_model: PASS
model_items                 | 77
kinds                       | {"item": 41, "attendance": 5, "placeholder": 31}
unsure_links                | 8          (9 live, minus the one the test overrides)
ist323_bb_running           | true
history_changed_columns     | 5
```

Afterwards `select count(*) from grade_scenarios` and `… grade_column_links` both return 0.

| Brief item | Section | Result |
|---|---|---|
| anon sees 0 rows of both tables and three views | 1 | every read refused (`insufficient_privilege`), counted as 0 visible |
| a non-owner uid sees 0 | 1 | 0 on all five; its inserts refused (RLS `42501`, or the trigger's `23514` for a component link) |
| checks refuse a string score and a negative score | 2 | both `23514`; also a non-object `item_scores`, a four-character letter, and a link with both a component and `excluded`; `{"a": 0, "b": 9.5}` accepted |
| trigger refuses a component from another course | 3 | IST.323 column → ECN.304 component 1 refused, on insert and on update, as the owner |
| trigger accepts a GEO recitation column linked to a lecture component | 3 | `GEO.103.recitation/_3602445_1` → component 5 accepted as the owner |
| items = item + attendance latest columns + placeholders | 4a | 77 = 46 + 31, computed independently of the view; no total/letter/calc_other row; `item_key` unique |
| an override flips `link_source` / `link_confidence` | 4b | `IST.466/_3562496_1`: `assignment`/`tentative` → `override`/`confirmed`, component 24; its sibling stays `assignment`/`tentative` |
| (extra) GEO link lands under the lecture scheme; "Not graded" is an excluded override; placeholders carry no score; IST.323 extra credit flagged; the doubly-linked column is unlinked | 4c–4f | pass |
| `v_grade_model_total.bb_running = true` for IST.323 | 5 | true; one row per scheme course |
| `v_gradebook_history` = 5 changed columns | 5 | 5, equal to an independent self-join count; asserted as `≥ 5` so the next sync cannot break it (the mirror is append-only) |
| no `pg_proc.prosrc` outside 057/058 references either table | 6 | none (057's own trigger function excluded by name) |

---

## 4. RLS

A rolled-back probe with one scenario row and one link row written first. Owner = the
`app_owner()` uid in `request.jwt.claims`; non-owner = `00000000-0000-4000-8000-000000000001`.

| relation | owner | non-owner uid | anon |
|---|---|---|---|
| `grade_scenarios` | 1 | **0** | permission denied |
| `grade_column_links` | 1 | **0** | permission denied |
| `v_grade_model_items` | 77 | **0** | permission denied |
| `v_grade_model_total` | 1 | **0** | permission denied |
| `v_gradebook_history` | 53 | **0** | permission denied |

Policies are `(select auth.uid()) = public.app_owner()` for `all to authenticated`, as the brief
specifies. The views are `security_invoker = true` (036's guard block in 058 passed on apply).

---

## 5. Advisors (limited to this worker's objects)

| Advisor | Before (20:22 UTC) | After (20:32 UTC) | Diff |
|---|---|---|---|
| security | `function_search_path_mutable` ×7, `authenticated_security_definer_function_executable` ×2 (`app_owner`, `calendar_push_now`), `auth_leaked_password_protection` ×1 | identical | **none** — `grade_column_links_same_course` sets `search_path`, is SECURITY INVOKER; no new view is owner-run |
| performance | `unindexed_foreign_keys` ×15, `auth_rls_initplan` ×21, `unused_index` ×5 | `unindexed_foreign_keys` ×15, `auth_rls_initplan` ×21, `unused_index` ×6 | **+1 INFO** `unused_index grade_column_links_component_idx` — expected on an empty table; it is the index that keeps `unindexed_foreign_keys` from gaining an entry |

---

## 6. Web gates

From `web/`: `npm run typecheck` clean; `npm run build` compiled (15 routes); `npm test`
**792 passed / 52 files** (baseline before this branch: **652 / 42**). The 10a suites
(`GradebookTable`, `GradesScreen`, `queries.grades`) pass unchanged.

---

## 7. Decisions the Contract left open

1. **`/grades` model wiring.** `GradesScreen`'s 10a test renders it with no `QueryClientProvider`,
   so new query hooks inside it would fail that test. The model reads live in
   `GradesModelScreen.tsx`, which passes results into `GradesScreen`'s new optional `model` prop.
   `grades/page.tsx` renders the wrapper.
2. **Excluded link row.** `link_source = 'override'` and `link_confidence = 'confirmed'`
   whenever a `grade_column_links` row exists, "Not graded" included. `component_id` follows
   the Contract word for word.
3. **Picker also on override rows.** It shows there too, with the current choice selected.
   Otherwise "Not graded" could never be undone. Picking "Counts toward…" clears the override
   (deletes the row).
4. **"Confirm link" button** on unsure rows. A `<select>` cannot fire a change for the option
   it already shows, so confirming the preselected component needs its own control. The label
   is in `grade-model-format.ts` (not `labels.ts`, which is frozen).
5. **Link payload** sends both target columns (`component_id` + `excluded: false`, or
   `null` + `true`). PostgREST's upsert only updates the columns it is given, so switching a
   "Not graded" row to a component would otherwise trip the one-target check.
6. **What-if gate.** A cell appears only on an ungraded, counted item whose component exists,
   is not muted and is not `manual` (answer 1: no assumed score for a hand-graded part).
7. **Strings not in `labels.ts`** live in `grade-model-format.ts`:
   - the explanation line ("N of M parts graded: …")
   - the unlinked count
   - the history line and the "history" label
   - the revert label, "Target letter" and "Confirm link"
   - the unit words for `differsText` ("points" / "percentage points")
8. **Placeholder `due_at`.** Falls back to 23:59 New York on `due_date` (060's rule). 17 of 31
   placeholders carry only a date.
9. **057 additions.**
   - an index on `grade_column_links.component_id`
   - `set_updated_at` triggers on both tables (the house pattern)
   - the trigger raises `check_violation` with a message naming the ids.
   Each is documented in the migration header.

---

## 8. Handover and open items

* **W-19 pending.** The container tests (`CourseGrades.model`) route `projectCourse` /
  `solveTarget` through `engineOrFake`, which uses the real engine as soon as it stops throwing
  "not implemented" and only falls back to `fake-grade-model.ts` until then. They assert only
  Contract-level text (muted part named, what-if note, persistence), so no edit should be
  needed at integration — but they are the first place a semantic mismatch would show.
  Component tests use typed `ModelResult` / `TargetResult` fixtures and do not touch the engine.
* **Acceptance step 5 cannot pass on today's data.** ECN.304's exam placeholders
  (`ECN.304/exam-1..3`) have `points_possible = null`. The Contract makes a null-possible item
  bookkeeping, so they get no what-if cell. V-1 data fix: give them a possible (e.g. 100).
* **Acceptance step 6 needs both major-case links confirmed.** The frozen muting rule mutes a
  component while *any* counted item is unsure. Major Cases has two tentative columns (Synchrony,
  SU IT), so confirming one leaves the part muted until the second is confirmed too.
* **IST.323 `_3569973_1`** (Final Project proposal, linked to two assignments) reads as
  unlinked. It is unscored today, so it gets no picker under the Contract rule ("scored and
  unlinked"). The picker will appear once it has a score.
* `vitest.config.mts` coverage `include` was not widened, to avoid a merge conflict with W-19's
  engine entry. The PM may add the new modules at integration.
