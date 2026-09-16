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

---

## Round 1b (Contract amendments A1, A2 — brief commit `2e71521`)

Merged `origin/feat/grades-10b` into this branch first (`2e1c45e`). No migration, no SQL change.

| # | Commit | What changed | Tests |
|---|---|---|---|
| A1 | `88a6c6e` | `whatIfTargets` gives a placeholder with `possible` null, a `confirmed` link and a `single` / `average` / `average_drop_lowest` / `rank_weighted` / `normalized` component a **percent** target (`unit: 'percent'`, bound 100). `WhatIfCell` reads "what if __ %", validates 0–100, stores the number under the item key. `sum` / `manual` parts, unsure placeholders and pointless *columns* get no cell. A pointless placeholder is still not a counted item, so it never mutes a part. The container fake mirrors `f = v / 100`. | `WhatIfCell` (percent label, 0 and 100 accepted, 100.5 / −1 / 150 refused), `grade-model-view` (all five aggregations; none on sum, manual, inferred, column, zero), `CourseGrades.model` (101 refused and not saved; 80 saved; "includes what-if values") |
| A2 | `3b81a73` | `linkStates` offers the picker on a column with `possible > 0` that is unlinked (scored or not) or has a tentative / inferred link. A column Stack already overrode keeps its picker whatever its possible (the accepted "never a one-way door" choice). | `grade-model-view` (unscored unlinked `_3569973_1` offered; zero-point and pointless columns not; override on a zero-point column kept), `LinkColumnControl` (IST.352 Project #2A shows the picker, a 0-point knowledge check does not) |

**What prod offers after round 1b** (from `v_grade_model_items`, 2026-09-16; a cell also needs its
component not muted, which the screen checks at render):

| Surface | Course | Columns / items |
|---|---|---|
| percent what-if candidates | ECN.304 | Exam 1, Exam 2, Exam 3, Quiz 2 (in class) |
| | GEO 103 | First Exam, Second Exam, Final Exam |
| | IST.323 | Quiz #4 – #10 |
| picker | ECN.304 | Attendance |
| | GEO 103 | Absences, Attendance |
| | IST.323 | Final Project - Proposal and Appendices, Individual Presentation Selection, Individual Security Presentation, Lab #1, Participation |
| | IST.352 | Project Assignment #2A, Project Assignment #3 |
| | IST.466 | Attendance ×2, Class Participation, SU IT - Major Case #2, Synchrony Major Case #1 |

Gates from `web/`: `npm run typecheck` clean, `npm run build` compiled, `npm test` **810 passed /
52 files** (807 after A1). `vitest.config.mts` coverage left to W-19.

---

## Round 2 — review fixes (brief commit `106844b`; W-19 round 2 merged `a2f6b58`)

Merged `origin/feat/grades-10b` twice: first for the brief, the scoped `database.types.ts` and
`fast-check` (`npm ci`), then for W-19's `itemStates()`. `database.types.ts` was not regenerated
(080/081 change no types).

### Migrations

| File | Applied as | Prod version | md5 (git blob = prod `statements`) | Bytes |
|---|---|---|---|---|
| `db/migrations/080_grade_scenarios_checks_and_cascade.sql` | `080_grade_scenarios_checks_and_cascade` | `20260916214318` | `10c5588603b289b2357845d4f16b6349` | 2,738 |
| `db/migrations/081_grade_model_items_not_materialized.sql` | `081_grade_model_items_not_materialized` | `20260916214532` | `5e7edcec10df10aa6847b9c0bed5f98e` | 6,913 |

Both were dry-run verbatim in `begin; … rollback;` first. What the dry runs showed:

- **080:** all six malformed shapes were refused. `{}` and `{"a": 0, "b": 9.5}` were accepted. Both constraint definitions read back as written.
- **081:** `v_grade_model_items` had **77 rows before and 77 after, with 0 differing** (`except all` both ways). The column list was unchanged, `security_invoker=true` was kept, anon still has no select, and 036's guard passed.

Plan for `select * from v_grade_model_items where scheme_course_id = 'IST.323'`:

| | 058 | 081 |
|---|---|---|
| `CTE latest` / `CTE Scan on latest` | present (whole mirror computed once, scanned twice) | **gone** — both references inlined as subquery scans |
| `Filter: (COALESCE(parent_course_id, id) = 'IST.323'::text)` | on the courses scans | on the courses scans, below the joins to the inlined gradebook rows |

The gradebook subquery still sorts every registered row for its `DISTINCT ON`. A course filter
can't be pushed through `DISTINCT ON`, and the table is small (93 rows), so that is left as is.

### SQL tests — `db/tests/phase10b_round2.sql` (rolled back, run whole against prod)

```
result          | phase10b_round2: PASS
shape_check     | CHECK (jsonb_typeof(item_scores) = 'object' AND NOT jsonb_path_exists(item_scores, 'strict $.*?(@.type() != "number")') AND NOT jsonb_path_exists(item_scores, 'strict $.*?(@.type() == "number" && @ < 0)'))
links_course_fk | FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
model_items     | 77
```

| Section | Assertion | Result |
|---|---|---|
| 1 (080, R2-6) | refuses `{"k": [1]}`, `{"k": []}`, `{"k": null}`, `{"k": {"b": 1}}`, `{"k": "9"}`, `{"k": -1}`, `[9]`, `null` | 8 of 8 refused; `{}` then `{"a":0,"b":9.5,"c":100}` stored |
| 2 (080, R2-11) | a throwaway course with one link and one scenario is deleted | both rows gone; FK reads `ON DELETE CASCADE` |
| 3 (081, R2-13) | row count = latest item + attendance columns + placeholders; same 17 columns in order; `security_invoker`; no anon select; plan has no `CTE latest` / `CTE Scan`; the scheme filter is on the courses scan | pass |

Security advisors after 080/081: unchanged from §5 (no new finding).

### Web findings

| # | Commit | What changed | Check |
|---|---|---|---|
| R2-1w | `660eff3` | `linkOptions` offers leaf components only; parts sit where their parent was | RTL: IST.323 picker has no "Final Project: Security Program Proposal", has its three parts |
| R2-5 | `b7c5003` | scenario writes move to `queries.grade-scenario.ts`; saves and resets share mutation scope `grade-scenario:<course>`; a save carries a patch and builds its row from the cache when it runs; refetch only when no other scenario mutation for the course is pending; a failure refetches instead of restoring a snapshot | deferred-promise vitest: A, B, C with save 1 landing between B and C → upserts `{A}`, `{A,B}`, `{A,B,C}`; save 2 fails → server row refetched, A kept; a reset queued behind a save runs after it |
| R2-8 | `5c409ad` | an excluded override beats 10a's rule and V-1's `counts_toward_grade`: no tag, bookkeeping group; `/grades` passes the same link states read-only (`overrides`) | RTL: excluded attendance column → bookkeeping group, no tag, picker shows "Not graded"; read-only overrides place it the same way |
| R2-9 | `fd2827d` | "Not in Blackboard yet" open state derived from saved values until the owner toggles | RTL: values after first render → open; the owner's toggle then wins |
| R2-10 | `3c9c578` | starting a save clears a failed reset's error and vice versa | RTL both orders (confirmed failing without the fix) |
| R2-12 | `dc3eccc` | `explanationText` counts top-level, non-extra-credit components; `mutedPartNames` names a muted component only when its parent is not muted; `ModelStanding` takes the scheme's components | unit: IST.323 shape reads "2 of 7 parts graded"; a muted parent is named once |
| R2-14 | `36fdf9b` | scheme + components reads in `Promise.all`; `groupByCourse`, `/grades` standing states and `historyByColumn` group in one pass; a history list is sorted only when it arrives out of order (the query already orders it) | existing tests unchanged |
| R2-16 | `95c41bf` | `web/test/fake-grade-model.ts` and `engineOrFake` deleted; container tests run the real engine | `grep -r fake-grade-model web/` → nothing |
| R2-3w / R2-4 / R2-15 | `64cf63e` | `FRACTION_AGGREGATIONS`, `isCountedItem`, `isPercentPlaceholder`, `mutedComponentIds` (and the local `whatIfTargets`) deleted from `grade-model-view.ts`; `runModel` returns `itemStates(input)` beside the result; cells come from `whatIfTargets` (`whatIfCellTargets` only adds names); `PlaceholderRows` skips `droppedPlaceholderKeys` | RTL on the IST.323 lab shape: linking Lab #1 removes the seeded "Lab #1" placeholder (6 → 5 rows) and "Lab #4" keeps its cell; a muted Final Project piece (Running Log) has no cell while its unmuted sibling (Proposal) has one |

Gates from `web/` after the last commit: `npm run typecheck` clean, `npm run build` compiled,
`npm test` **1172 passed / 76 files**. The count after merging W-19's round 2, before this switch,
was 1163 on the phase branch.
