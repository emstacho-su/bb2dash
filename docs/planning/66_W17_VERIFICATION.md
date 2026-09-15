# 66 — W-17 verification (Phase 10a grades, database + ingest)

Worker: W-17. Branch `feat/grades-10a-db`, worktree `bb2dash-wt-g-db`.
Contract: `docs/planning/67_PHASE10A_grades.md` § "Contract (frozen 2026-09-15)".
Date: 2026-09-15. Project `goultdzqcavefcgnifdy` (prod — there is no staging).

Everything below was run against prod. Numbers are what the database returned, not what the
Contract expected; where the two differ the difference is called out.

---

## 1. What shipped

| File | Applied as | Prod version | md5 (git blob = prod `statements`) |
|---|---|---|---|
| `db/migrations/046_bb_gradebook.sql` | `046_bb_gradebook` | `20260915143831` | `cb16cb486572fa1db37473e1cfa3168a` |
| `db/migrations/047_gradebook_views.sql` | `047_gradebook_views` | `20260915144023` | `7fe6306052c46f78a68e2611dec4ff55` |
| `db/migrations/048_classifier_blackboard.sql` | `048_classifier_blackboard` | `20260915144133` | `351b5f321642f5c845ffee2e73a8b045` |
| `db/migrations/049_bb_files_submissions.sql` | `049_bb_files_submissions` | `20260915144229` | `8a7b6b70a94d2a0d18d644a42a794cb5` |
| `db/migrations/050_bb_attempts.sql` | `050_bb_attempts` | `20260915144743` | `2c381d4d1c442253a9c97182f8719d29` |
| `db/migrations/051_run_transform_grades.sql` | `051_run_transform_grades` | `20260915145101` | `538e62574dfa2fe7863e091283b39e55` |

Migrations 001–045 were not touched. Nothing in the 052–059 range was taken.

**The md5 column is one number, not two.** Supabase stores the applied SQL in
`supabase_migrations.schema_migrations.statements`; each migration arrived as a single statement, so

```sql
select version, name, md5(array_to_string(statements, '')) as stmt_md5
  from supabase_migrations.schema_migrations where name ~ '^0(4[6-9]|5[01])';
```

returns exactly the md5 of the repo file's git blob (`git show :db/migrations/<file> | md5sum`).
That is the byte-identity check the SOP asks for, done by comparison rather than by assertion. The
working tree carries CRLF from `core.autocrlf = true`; the blob and the applied text are both LF.

Also shipped, outside the migration range:

| File | What |
|---|---|
| `ingest/bb_crawler.js` | crawler **version 3**: `attempts()` probe, `crawler: {version: 3}` envelope, `runAll({ runId })`, the assessment-field probe, pure mappers exported |
| `skills/bb-sync/SKILL.md` | step 3 registers the run id **before** the crawl; new step 4b pulls submission bytes |
| `ingest/CADENCE_RUNBOOK.md` | step 4 now says "course files"; submission files are step 4b's |
| `db/fixtures/phase10a/` | three real gradebook payloads + one synthetic attempts payload + the loader generator + README |
| `db/tests/phase10a_*.sql` | the two stage tests and their generated fixture loader |
| `web/test/crawler.attempts.test.ts`, `web/test/fixtures.phase10a.test.ts` | 30 + 18 vitest cases |

---

## 2. Dry-run evidence

Every migration was run inside `begin; … rollback;` through `execute_sql` before `apply_migration`.
The dry runs did more than check that the SQL parses — each one exercised the thing it adds:

| Migration | Dry run did | Result |
|---|---|---|
| 046 | created the table + stage, then called `stage_gradebook('bf2f81e5-…', 35)` inside the aborted transaction | `{columns_seen: 45, inserted: 45, items: 38, attendance: 5, totals: 1, scores_new: 13, scores_changed: 0, courses_unresolved: 0, duplicates_skipped: 0}`, status `ok` |
| 047 | created the three views, ran 036's guard, counted each | `v_gradebook_latest` 0, `v_assignment_grade` 44, `v_course_grade` 7, `has_gradebook` 0, `has_total` 0 — correct for an empty mirror |
| 048 | added the enum value and read the labels back inside the transaction | `rule \| agent \| stack \| blackboard` |
| 049 | dropped NOT NULL, added `attempt_id` and the check, replaced the anon policy, re-read both definitions | 74 existing rows validated, 0 with a null `source_url`; policy and check read back as written |
| 050 | created the table/stage/views, **grafted a synthetic `attempts` array onto the live IST.323 payload**, ran `stage_attempts` twice | first call `{columns_probed: 2, attempts_seen: 2, inserted: 2, files_catalogued: 2, errors: 1}`, second `{inserted: 0, files_catalogued: 0}`; files landed at `IST.323/my_submissions/quiz-01/quiz1-attempt1.pdf` with `assignment_id = IST.323/quiz-01`; `v_assignment_attempts` numbered them 1 and 2 of 3 allowed |
| 051 | re-created both functions, then read the stage order out of `pg_get_functiondef` and called `run_transform` on an already-folded run | order `courses, assignments, gradebook, attempts, announcements, files, gaps` (content is called through `to_regprocedure`, so it does not match the regex); new lines `3 new grade(s) posted / 2 score(s) changed / 4 submission file(s) catalogued`; existing lines unchanged; `run_transform('bf2f81e5-…')` returned **35** and created no row |

### 051 was built from the live definition, not from the repo

```sql
select pg_get_functiondef('public.run_transform(uuid,text)'::regprocedure);
select pg_get_functiondef('public.sync_change_lines(jsonb)'::regprocedure);
```

Both came back byte-for-byte as migration 035 wrote them — 037, 039, 042, 043, 044 and 045 all
*call* them but none re-creates them — so the only differences in 051 are this phase's two stage
calls, the eight-stage comment, and the three new sentences.

---

## 3. Before / after counts per course

The two stages were called **directly** against the latest registered crawl
(`run_id = bf2f81e5-ea4c-4b64-bc43-129fd53d4616`, `sync_runs.id = 35`, crawled 2026-09-14 17:19
UTC) rather than through `run_transform`, which is idempotent and would have returned run 35
untouched. Calling the stages directly is what makes the mirror's history start now, with the
`sync_stage_runs` rows attached to the run the data actually came from.

**Before** (2026-09-15 14:50 UTC): `bb_gradebook` 0, `bb_attempts` 0, `v_gradebook_latest` 0,
`bb_files` with `bucket = 'my_submissions'` 0, `sync_stage_runs` with stage in
(`gradebook`,`attempts`) 0. All seven courses read `has_gradebook = false`, `has_total = false`.

**After:**

| course | columns mirrored | with a score | `seen_at` | `has_total` | `item_count` | `graded_item_count` |
|---|---|---|---|---|---|---|
| ECN.304 | 2 | 2 | 2026-09-14 17:19:21Z | false | 1 | 1 |
| GEO.103.lecture | 1 | 1 | 2026-09-14 17:19:31Z | false | 0 | 0 |
| GEO.103.recitation | 1 | 1 | 2026-09-14 17:19:29Z | false | 0 | 0 |
| IST.323 | 12 | 4 | 2026-09-14 17:19:23Z | **true** (`Total Score`, 5.000 / 104.000) | 10 | 3 |
| IST.352 | 15 | 7 | 2026-09-14 17:19:29Z | false | 15 | 7 |
| IST.466 | 8 | 0 | 2026-09-14 17:19:25Z | false | 6 | 0 |
| IST.471 | 6 | 2 | 2026-09-14 17:19:20Z | false | 6 | 2 |
| **total** | **45** | **17** | — | 1 of 7 | 38 | 13 |

`column_kind` across `v_gradebook_latest`: `item` 38, `attendance` 5, `total` 1, `letter` 1,
`calc_other` 0 — exactly the split the Contract predicted from the payloads.

`bb_attempts` is still **0 rows**, and that is the honest result, not a failure: no crawl on record
carries an `attempts` key, because the probe ships with crawler version 3 and has never run. The
stage recorded `{columns_probed: 0, attempts_seen: 0, inserted: 0, files_catalogued: 0, errors: 0}`
and wrote its `sync_stage_runs` row anyway, which is how the Activity feed will show it.

`sync_stage_runs` rows created (all `status = ok`):

| id | sync_run_id | stage | counts | took |
|---|---|---|---|---|
| 55 | 35 | gradebook | `inserted 45, duplicates_skipped 0, scores_new 13` | 30 ms |
| 56 | 35 | attempts | all zero | 5 ms |
| 57 | 35 | gradebook | `inserted 0, duplicates_skipped 45` | 13 ms |
| 58 | 35 | attempts | all zero | 5 ms |

Rows 57/58 are the idempotency proof in section 5.

The five attendance columns (ECN.304 `Attendance`, GEO.103 lecture `Absences`, GEO.103 recitation
`Attendance`, IST.466 `Attendance` ×2) all have `counts_toward_grade = false` today, because none
of their assignments has a `component_id` yet. They therefore all start in the Grades screen's
bookkeeping group and move up on their own as V-1 links them — no client list, no re-deploy, exactly
as Stack's answer 8 asks.

---

## 4. Reconciliation

### 4a. Per course, the gradebook column count in `bb_raw` equals the count in `v_gradebook_latest`

```sql
with raw_counts as (
  select bb_resolve_course(b.bb_course_id) as course_id, count(*) as raw_cols
    from bb_raw b, lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
   where b.run_id = 'bf2f81e5-ea4c-4b64-bc43-129fd53d4616' and b.kind = 'course'
     and coalesce(g->>'columnId','') <> ''
   group by 1),
view_counts as (
  select course_id, count(*) as view_cols from v_gradebook_latest group by 1)
select coalesce(r.course_id, v.course_id) as course_id,
       coalesce(r.raw_cols,0) as raw_cols, coalesce(v.view_cols,0) as view_cols,
       (coalesce(r.raw_cols,0) = coalesce(v.view_cols,0)) as match
  from raw_counts r full join view_counts v on v.course_id = r.course_id
 order by 1;
```

```
     course_id      | raw_cols | view_cols | match
--------------------+----------+-----------+-------
 ECN.304            |        2 |         2 | t
 GEO.103.lecture    |        1 |         1 | t
 GEO.103.recitation |        1 |         1 | t
 IST.323            |       12 |        12 | t
 IST.352            |       15 |        15 | t
 IST.466            |        8 |         8 | t
 IST.471            |        6 |         6 | t
```

Seven of seven. No course appears on only one side of the full join.

### 4b. Every `effective_score` equals the payload's `effectiveScore`

```sql
with src as (
  select bb_resolve_course(b.bb_course_id) as course_id, g->>'columnId' as column_id,
         nullif(g->>'effectiveScore','')::numeric as raw_score
    from bb_raw b, lateral jsonb_array_elements(bb_jarray(b.payload->'gradebook')) g
   where b.run_id = 'bf2f81e5-ea4c-4b64-bc43-129fd53d4616' and b.kind = 'course'
     and coalesce(g->>'columnId','') <> '')
select count(*) as compared,
       count(*) filter (where v.effective_score is not distinct from round(s.raw_score, 3)) as equal_at_scale,
       count(*) filter (where v.effective_score is distinct from round(s.raw_score, 3)) as mismatches,
       count(*) filter (where v.effective_score is distinct from s.raw_score) as differ_before_rounding,
       coalesce(jsonb_agg(jsonb_build_object('col', s.column_id, 'raw', s.raw_score, 'stored', v.effective_score))
                filter (where v.effective_score is distinct from s.raw_score), '[]'::jsonb) as rounded_rows
  from src s join v_gradebook_latest v on v.course_id = s.course_id and v.column_id = s.column_id;
```

```
 compared | equal_at_scale | mismatches | differ_before_rounding | rounded_rows
----------+----------------+------------+------------------------+----------------------------------------------------------
       45 |             45 |          0 |                      1 | [{"col": "_3598937_1", "raw": 83.33333, "stored": 83.333}]
```

45 of 45 match at the column's own scale, including the nulls (`is not distinct from`). **One row
is rounded**: ECN.304 `Attendance` is `83.33333` in the payload and `83.333` in the mirror, because
`effective_score numeric(9,3)` is the frozen DDL. That is a lossy store of a Blackboard value and
it is recorded here rather than hidden — see deviation 6. Nothing else in the run has more than
three decimals.

---

## 5. Idempotency

Both stages were called a second time on the same run, with no other change:

```
stage_gradebook(bf2f81e5-…, 35)  #1  → inserted 45, duplicates_skipped  0
stage_gradebook(bf2f81e5-…, 35)  #2  → inserted  0, duplicates_skipped 45
stage_attempts (bf2f81e5-…, 35)  #1  → inserted  0, files_catalogued 0
stage_attempts (bf2f81e5-…, 35)  #2  → inserted  0, files_catalogued 0
```

`bb_gradebook` held 45 rows before the second call and 45 after. Both second calls still wrote
their own `sync_stage_runs` row (57 and 58), which is correct: the stage ran, and it found nothing
to do.

`scores_new` stays 13 on the second call. That is deliberate and worth knowing: the count describes
the **crawl** (13 item columns carry a score that no earlier run had), not the insert. Only
`inserted` is allowed to go to zero. `sync_change_lines` reads `scores_new`, so a re-fold of the
same crawl would repeat the sentence — but `run_transform` is itself idempotent and never folds a
run twice, so that path does not exist in the loop.

The SQL tests prove the harder case, on fixtures: a **second, later crawl** of the same columns with
four deliberate score changes reports `scores_new: 1` and `scores_changed: 1`, because the total
and the attendance column that also moved are excluded by kind.

---

## 6. SQL tests

`db/tests/phase10a_load_fixtures.sql` (generated from `db/fixtures/phase10a/*.json` by
`build_load_sql.js`) opens a transaction and loads three real gradebook payloads plus the synthetic
attempts payload under the fixture run id; each test file asserts and rolls back. Run as

```bash
cat db/tests/phase10a_load_fixtures.sql db/tests/phase10a_stage_gradebook.sql | psql "$DATABASE_URL"
```

or by pasting the concatenation into one `execute_sql` call, which is how these were run.

```
phase10a_stage_gradebook: PASS
  gradebook_rows 85 · latest_rows 45 · courses_with_gradebook 7 · courses_with_total 1
  kinds {"item": 38, "total": 1, "letter": 1, "attendance": 5}

phase10a_stage_attempts: PASS
  attempt_rows 4 · pulled_back_files 3 · view_rows 5
```

Between them the two files assert: the column counts and the `column_kind` split; that
`Final Letter Grade` is caught by name and not by `isCalc`; that `Participation` is an item and not
attendance; `is_total = (column_kind = 'total')` on every row; that no fixture column carries
`g.score`; idempotency on both stages; the two reconciliation queries above; `v_course_grade`'s
total and the two "no total" courses; `item_count` / `graded_item_count`; that the column linked to
two assignments resolves to `assignment_id` null with `linked_assignments = 2`; that feedback is
stored verbatim; score movement across two crawls; the attempt fields, the `keys` probe reaching
`raw`, the file catalogue with its Storage relpaths, the ambiguous column's file landing with no
assignment, an attempt with no files still being mirrored; `v_assignment_attempts` numbering and
`attempts_allowed`; that `v_attempts_latest` does not expose `raw`; 049's check constraint refusing
a `blackboard` row with no `source_url` and accepting a staged one; and the anon policy's text.

After both runs, prod was re-read: `bb_gradebook` 45, `bb_attempts` 0, `my_submissions` files 0,
fixture rows in `bb_raw` / `agent_requests` / `sync_runs` all 0, and neither test file left behind.
Nothing was committed.

**Vitest** (`web/`, `npm test`): **393 tests in 31 files, all passing**; `npm run typecheck` clean.
Of those, `crawler.attempts.test.ts` is 30 cases on the pure mappers and
`fixtures.phase10a.test.ts` is 18 on the fixtures (including a drift guard that regenerates
`phase10a_load_fixtures.sql` in memory and fails if the committed copy differs).

---

## 7. RLS

`anon`, in a rolled-back transaction (`set local role anon`):

| what | result |
|---|---|
| `select count(*) from bb_gradebook` | **0** (the table holds 45) |
| `select count(*) from bb_attempts` | 0 |
| `select from v_gradebook_latest` / `v_course_grade` / `v_assignment_attempts` | `42501` permission denied — revoked outright (036's rule) |
| `select stage_gradebook(…)` | `42501` permission denied |
| `insert into bb_gradebook (…)` | `42501` |
| `insert into bb_attempts (…)` | `42501` |
| `update bb_gradebook set effective_score = 100` | 0 rows touched |
| `insert into bb_files (… bucket 'my_submissions', classified_by 'blackboard' …)` | `42501` — 049's narrowed policy |

The owner (`postgres`, and `authenticated` under the owner policy) sees all 45 rows and all seven
`v_course_grade` rows.

Both tables carry Supabase's default table grants, including `anon`, exactly as every other table in
this schema does; RLS with an owner-only policy is the boundary, and the reads above are the proof
that it holds. Function grants after the fact:

```
run_transform      postgres=X | service_role=X
stage_gradebook    postgres=X | service_role=X
stage_attempts     postgres=X | service_role=X
sync_change_lines  postgres=X | authenticated=X | service_role=X
```

All five new views: `security_invoker=true`, `anon` revoked, `authenticated` and `service_role`
granted. 036's guard block was re-run at the end of 047 and 050 and passed both times — no public
view in this schema runs as its owner.

---

## 8. Advisor diff

`get_advisors` before the first migration and after the last.

**Security — identical, zero new findings.**

| lint | before | after |
|---|---|---|
| `function_search_path_mutable` (WARN) | 7 | 7 — same seven pre-existing functions |
| `authenticated_security_definer_function_executable` (WARN) | 1 (`public.app_owner`) | 1 (`public.app_owner`) |
| `auth_leaked_password_protection` (WARN) | 1 | 1 |

`app_owner` is the pre-existing, deliberate exception recorded in `project-state/DECISIONS.md`
(2026-09-10): `authenticated` must be able to call it for RLS evaluation. The two new stage
functions do **not** appear, because they follow 038's grant rule rather than 034's — see deviation
1.

**Performance — one INFO line moved, by construction.**

| lint | before | after |
|---|---|---|
| `unindexed_foreign_keys` (INFO) | 14 | **14** — the two new FKs to `sync_runs` are indexed on purpose |
| `auth_rls_initplan` (WARN) | 21 | **21** — the two new policies use the `(select auth.uid())` form |
| `unused_index` (INFO) | 4 | **7** — `bb_gradebook_sync_run_idx`, `bb_attempts_latest_idx`, `bb_attempts_sync_run_idx` |

The three new "unused" indexes are a day old on tables nothing queries yet; they exist to keep the
FK and latest-row lookups off a sequential scan once `bb_gradebook` grows one row per column per
sync. Leaving the FKs unindexed to keep the INFO count at 4 would have traded a real cost for a
cosmetic one.

---

## 9. Deviations from the frozen Contract

Each one is also written in the header of the migration it applies to.

1. **Stage function grants follow 038, not 034.** The Contract says "grants as in 034 §Privileges"
   (revoke from `public, anon`; grant to `authenticated, service_role`). Migration 038 then took
   every stage function off the PostgREST surface — revoking from `authenticated` too — because a
   SECURITY DEFINER function reachable at `/rest/v1/rpc/<name>` hands a browser caller postgres's
   reach over the warehouse. Granting `authenticated` here would have re-opened advisor lint 0029,
   the exact finding 038 closed. `stage_gradebook` and `stage_attempts` are therefore
   `service_role` only. Nothing loses access: both are only ever called from inside
   `run_transform`, whose body runs as its owner.

2. **RLS predicate uses 038's scalar-subquery form.** The Contract says "owner-scoped exactly like
   031/032 (`auth.uid() = public.app_owner()`)". 038 rewrote those same policies to
   `(select auth.uid()) = (select public.app_owner())` to close performance lint 0003. The
   predicate is identical; the subquery is evaluated once per statement instead of once per row.
   Copying 031 verbatim would have added a 22nd `auth_rls_initplan` finding on day one.

3. **`scores_new` / `scores_changed` count `column_kind = 'item'` rows only.** The Contract says
   "items". Taken literally as the `item` kind, which is also the only reading that produces a
   useful Activity feed: a running total recalculates every time anything is graded and an
   attendance column moves after every class, so including them would print
   "N score(s) changed" on every single sync forever. A column with no earlier row is treated as
   "previously null", so the first gradebook run reports the grades it found rather than reporting
   silence. The SQL test pins both halves.

4. **`v_assignment_grade` exposes `assignments.id` as `assignment_id`.** The view also carries the
   gradebook row's own key (as `gradebook_id`) and two columns called `id` cannot coexist.
   `assignment_id` is also what W-18's `assignmentGradeOptions(assignmentId)` filters on. For the
   same reason `course_id` appears once (the assignment's) and `bb_column_id` is exposed as
   `column_id` to match `v_gradebook_latest`.

5. **`counts_toward_grade` is `bool_or(component_id is not null)` over every linked assignment**,
   not only over a single link. IST.323 column `_3569973_1` is linked to two assignments today
   (`fp-proposal`, `fp-log-final`), both with a `component_id`; calling it "not counting" because
   the link is ambiguous would be the wrong answer to a question the data answers clearly.
   `assignment_id` still goes null when the link is ambiguous, exactly as the Contract says, and
   `linked_assignments` says how many there are.

6. **`effective_score numeric(9,3)` rounds one live value.** ECN.304 `Attendance` is `83.33333` in
   Blackboard and `83.333` in the mirror. The DDL is frozen, so the column was built as specified
   and the reconciliation compares at the column's scale rather than pretending the two numbers are
   the same. **For the PM:** if a mirrored score has to be bit-exact, `numeric` unconstrained (or
   `numeric(12,6)`) in a fix-round migration is the change; it affects one row out of 45 today and
   only the third decimal of a percentage.

7. **`v_attempts_latest` partitions by `(course_id, column_id, attempt_id)`**, not by bare
   `attempt_id`. Blackboard attempt ids look globally unique, but "looks unique" is not a key, and
   the wider partition cannot collapse two genuinely different attempts.

8. **`v_assignment_attempts.attempt_no` partitions by `(assignment_id, course_id, column_id)`**,
   not by `column_id` alone. One column can be linked to two assignments; partitioning by the
   column alone numbers that column's attempts 1..2N across the join and would tell Stack he is on
   "attempt 4 of 1". The SQL test asserts both rows come back as attempt 1.

9. **`stage_attempts`'s `bb_files` insert also sets `run_id` and `captured_at`**, which the
   Contract's field list does not name. `stage_files` sets both on every row it catalogues, and a
   submission file with no provenance would be the only row in the table that cannot say which
   crawl found it.

10. **048 uses `add value if not exists`.** The Contract writes `alter type classifier add value
    'blackboard'`. The effect on a database without the value is identical; the guard only makes
    the migration re-runnable.

11. **036's guard block is repeated at the foot of 047 and 050.** The Contract points at 036's
    guard as the thing that refuses a non-invoker view, but that guard lives in 036 and 001–045 are
    not to be re-applied. Copying it into the two migrations that add views is the only way to have
    it actually run against them.

### Open item for a fix round (not a deviation — the Contract's own text)

049's check is frozen as `check (source_url is not null or classified_by = 'stack')`.
`classified_by` is nullable, so a row with **both** null evaluates to `NULL` and a NULL check
passes. No writer in the codebase produces that combination and anon cannot (the narrowed policy
refuses a `my_submissions` insert outright), so it is not exploitable today — but it is a hole in a
constraint whose whole job is to close one. Tightening it to
`(source_url is not null) or (classified_by = 'stack')` with `classified_by` made `not null` for
that bucket, or simply `coalesce(classified_by::text,'') = 'stack'`, is a one-line 05x migration
whenever the PM wants it.

---

## 10. Unverified, and why

### 10a. The attempts payload has never been produced by a live crawl

Zero of the seven course payloads in run `bf2f81e5` carry an `attempts` key — the probe ships with
crawler version 3 and every crawl needs Stack's MFA (Contract, Stack's answer 7). So:

* `stage_attempts` is proven against the **frozen shape** by the fixtures and by the grafted dry run
  on migration 050. It is **not** proven against Blackboard's real key names.
* The crawler's mapper reads a candidate list per field and yields `null` when none is present —
  never a guess — and puts `Object.keys()` of the **first raw attempt per column** into `keys`, the
  same trick `authorSource` played for announcements in Phase 9.
* The live proof is **acceptance step (0)**: Stack presses Sync on the preview and runs
  `/bb-sync <id>` in a logged-in tab with the new crawler, before merge.

**The keys the probe has to settle.** After that crawl, one query names them:

```sql
select a.course_id, a.column_id, a.attempt_id, a.raw->'keys' as blackboard_keys
  from bb_attempts a
 where a.raw ? 'keys'
 order by a.course_id, a.column_id;
```

and the candidate lists in `ingest/bb_crawler.js` (`ATTEMPT_FIELD_KEYS`, `ATTEMPT_FILE_KEYS`) can
then be cut to the one true name each. What is outstanding:

| field in the frozen payload | candidates tried, in order | what it feeds |
|---|---|---|
| `status` | `status`, `attemptStatus` | `bb_attempts.status`, the popout pill |
| `created` | `createdDate`, `created` | `created_bb`, and `attempt_no` ordering |
| `submitted` | `submittedDate`, `attemptDate`, `submitted` | `submitted_bb` — **the timestamp the popout shows** |
| `modified` | `modifiedDate`, `modified` | `modified_bb` |
| `score` | `score` | `bb_attempts.score` (not rendered in 10a) |
| `feedback` | `feedback`, `instructorFeedback`, `instructorComments` | `bb_attempts.feedback` |
| `studentComments` | `studentComments`, `studentComment` | `student_comments` |
| `studentSubmission` | `studentSubmission`, `submissionText`, `text` | `student_submission` |
| `exempt` | `exempt`, `isExempt` | `bb_attempts.exempt` |
| `receipt` | `receipt`, `confirmationNumber`, `receiptNumber`, `submissionReceiptId` | `bb_attempts.receipt` — stored, deliberately not rendered (answer 1) |
| file `id` / `name` / `size` | `id`/`fileId`, `name`/`fileName`/`displayName`/`originalFileName`, `size`/`fileSize`/`bytes` | the `bb_files` row and its Storage key |

Two more things that only the live crawl can answer:

* **Which endpoint actually answers.** `attempts()` tries `/learn/api/v1/courses/{C}/gradebook/
  columns/{col}/attempts?userId=…&limit=100` and falls back to the public v2 form; the per-column
  `endpoint` and `status` in the payload record which one won, so
  `select distinct e->>'endpoint', e->>'status' from bb_raw, lateral jsonb_array_elements(payload->'attempts') e`
  settles it in one query.
* **Whether the attempt-files call is `/gradebook/attempts/{id}/files`.** Same two-call pattern,
  same fallback, and `files_catalogued` versus `attempts_seen` in the stage counts says whether it
  returned anything.

### 10b. Where Ultra keeps the assessment fields

The Contract asks the worker to find where `dueDate`, `points`, `gradebookColumnId` and
`attemptsAllowed` really live. **It is not findable without a live session**, and this note says so
rather than inventing a path: `slim()` runs on the `@view=Summary` response, whose `contentDetail`
only ever holds `file` and `url` (migration 034's header, checked against all 24 stored payloads),
and no stored payload contains a full assessment item.

What shipped instead is a probe, which is the most a fixture-bound worker can honestly do.
`walk()` already fetches the full item for every assessment (it has to, for `embedsDeep`), so
`assessmentFields(full)` now scans that full item for the four names at any depth, merges what it
finds into `detail`, and records **the dotted path each value came from** in a new `detailSource`
key. After the acceptance crawl:

```sql
select distinct ci->'detailSource' as paths
  from bb_raw, lateral jsonb_array_elements(payload->'content') ci
 where ci ? 'detailSource';
```

names Ultra's real path, and the scan can be replaced by reading it directly. A field Ultra does
not expose stays **absent** — the gradebook column remains the source of truth for due dates and
points (migration 034), and synthesising one here would put a made-up date on the tracker.

### 10c. Not checked by this worker

* **bb-sync step 4b end to end.** The download → sha256 → Storage POST → mirror → row update
  sequence is written into the skill against the same conventions the course-file pull uses
  (`ingest/AGENT_BRIEF.md`, `skills/bb-course-pull/SKILL.md`), but it needs a logged-in tab and a
  real submission file, so it runs for the first time in acceptance step (0)/(3). The database side
  is ready: the rows it fills are exactly the `bb_files` rows `stage_attempts` creates, and
  `stage_gaps` already raises "in the catalog but its bytes were never stored" for each of them.
* **The Storage-side anon policy** on `storage.objects` is left as it is, per the Contract. Step 4b
  uploads submission bytes with the publishable key; an anonymous object with no `bb_files` row is
  invisible to every screen, because every screen reads the catalog and not the bucket. The PM
  records it as a DECISIONS row.
* **W-18's screens.** Nothing in this branch renders anything.

---

## 11. Notes for the PM at integration

* `database.types.ts` needs regenerating: five new views and two new tables.
* The Activity feed's new sentences come from stage counts, so they appear on the first sync that
  posts grades — no further change needed.
* Migrations 057–058 are still free for fix rounds; 059 is V-1's. (052–056 were taken by round 2; see §12.)
* The two SQL test files are safe to re-run against prod at any time: they load under a fixture run
  id, assert, and roll back. They were each run once for this note and left nothing behind.

---

## 12. Round 2 — review fixes (2026-09-15)

`/code-review main high` on the integrated phase branch plus the PM's manual security pass returned
seven findings for W-17. All seven are fixed. Migrations 046–051 were not touched: every SQL change
is a new migration that `create or replace`s from the **live** definition, read out of prod
immediately before writing the file.

### 12.1 What shipped

| File | Applied as | Prod version | md5 (git blob = prod `statements`) |
|---|---|---|---|
| `db/migrations/052_submission_relpath_and_check.sql` | `052_submission_relpath_and_check` | `20260915182152` | `2b629bef3afbf4ef24a5195bfac6f768` |
| `db/migrations/053_stage_files_skip_submissions.sql` | `053_stage_files_skip_submissions` | `20260915182555` | `6678b974fc351811343edfe1ad321ea0` |
| `db/migrations/054_stage_gaps_skip_submissions.sql` | `054_stage_gaps_skip_submissions` | `20260915182749` | `e3756678ce0950b5e0ec6c096778dffa` |
| `db/migrations/055_attempts_allowed_and_dates.sql` | `055_attempts_allowed_and_dates` | `20260915183147` | `4721e575e1e2dd68df2404aeb1b21bc2` |
| `db/migrations/056_stage_gradebook_newest_guard.sql` | `056_stage_gradebook_newest_guard` | `20260915183443` | `cbc98a1b95a9c6d67bc8c44aae446c07` |

Plus, with no migration: `ingest/bb_crawler.js` (R2-1), `skills/bb-sync/SKILL.md` (R2-1 and the
non-SQL halves of R2-2 and R2-4), and both `db/tests/phase10a_*.sql` files.

057–058 are still free; 059 is V-1's.

### 12.2 Each finding, and the check that proves it

**R2-1 — register-before-crawl reopened a hole in the tick.** `transform_tick` (044) folds a
*registered* run as soon as one of its `bb_raw` rows is more than three minutes old, with no
completeness check — the calendar row is one of two triggers, not a requirement. A slow version-3
crawl (attempts probe plus a full-item GET per assessment) registered up front could be folded with
one course landed, and `run_transform`'s idempotence would then drop the other six permanently.
`skills/bb-sync/SKILL.md` is back to registering immediately **after** `bb.runAll` returns, under
039's grace window; both the skill and the crawler header state that register-first becomes correct
only when the tick requires the `calendar` row for a registered run — a Phase 9 driver change.
`runAll` keeps `runId` for that change and for tests, and now validates it.

> **Check.** `assertRunId` accepts a uuid (either case), treats null/undefined as "generate one",
> and throws on `''`, `'not-a-uuid'`, an unhyphenated uuid, a number, an object, an array and a
> boolean. `runAll({ runId: 'not-a-uuid' })` rejects with `fetch` stubbed to throw — and `fetch` is
> never called, so the failure lands before seven courses have been crawled.
> `web/test/crawler.attempts.test.ts`: **35 tests, green** (30 before, 5 new).

**R2-2 — Storage key collision, and 049's NULL hole.** A staged file and a pulled-back attempt file
of the same name computed the same key; step 4b treated the resulting 409 as "done" and pointed the
Blackboard row at Stack's draft. `bb_file_relpath` (from the live 008 definition) now inserts
`attempt-<digits of attempt_id>/` before the file name when `bucket = 'my_submissions'` and
`attempt_id` is not null. Staged rows keep their key exactly, so W-18's client-side
`submissionRelPath` needs no change. The same migration tightens the check to
`source_url is not null or coalesce(classified_by::text,'') = 'stack'`. Step 4b now refuses a 409
and reports the row instead of claiming success.

> **Checks, all in one rolled-back transaction.** `v_file_layout.needs_move` = **0** across all 74
> existing rows, before and after. Four synthetic submission rows — two attempts of `Report.docx`,
> one staged `Report.docx`, one unlinked — produce **four distinct keys**:
> `IST.323/my_submissions/quiz-01/attempt-81000011/Report.docx`,
> `…/attempt-81000021/Report.docx`, `IST.323/my_submissions/quiz-01/Report.docx` (staged,
> unchanged) and `IST.323/my_submissions/attempt-81000031/loose.pdf`. An insert with both
> `source_url` and `classified_by` null is **refused with `check_violation`** (049's version
> accepted it).

**R2-3 — `stage_files` marked every submission file missing.** Its `_bb_refs` comes from
`payload->'content'`; an attempt's download URL lives in `payload->'attempts'`, which it never
reads, and its mark-missing step only protected `classified_by = 'stack'`. So the same fold that
catalogued a submission stamped it `missing_since_run`, and the Activity feed said "N file(s) are
no longer in Blackboard". `bucket <> 'my_submissions'` added to the mark-missing predicate and to
the "seen again" clear.

> **Check — before and after in one transaction**, against the real run `bf2f81e5` with two
> injected rows (a pulled-back submission, a vanished lecture deck). Live 043: `marked_missing`
> **2**, both stamped. 053: `marked_missing` **1**, only the lecture deck — the submission
> untouched.

**R2-4 — `stage_gaps` raised an Inbox item for a file step 4b was about to pull.** It runs last in
the same `run_transform` transaction where `stage_attempts` has just created those rows with a null
`storage_path` by design, and Phase 9's rule is that a gap is never auto-dismissed. Excluded
`bucket = 'my_submissions' and attempt_id is not null`; a file Stack *staged* keeps the gap, since
its bytes going missing is a real problem.

> **Check.** Three byte-less rows (pulled-back, staged, course file). Live 041 raised **3**; 054
> raised **2** — the pulled-back one excluded, the other two unchanged, stage `ok`.

**R2-5 — "Attempt 2 of 0".** `attempts_allowed` was `multiple_attempts`, which is 0 for a single
attempt, while unlimited lives in `attempts_left = -1`. 17 of the 45 live columns carry
`attemptsLeft = -1` with `multipleAttempts = 0`, so this was going to be wrong on most rows Stack
looked at.

> **Check.** ECN.304 `Attendance` (0, −1) → **−1**; IST.323 Quiz #1 (3, 2) → **3**; IST.471
> Assignment 2 (1, 0) → **1**. The SQL suite also asserts that no row anywhere reports
> `attempts_allowed = 0`. A column with no gradebook row at all reports **null** rather than "of 1"
> — the branch the bare rule needed, and the same answer W-18's `attemptsAllowed(null, null)` gives.

**R2-6 — one bad date could cost the whole run's attempts.** `created` / `submitted` / `modified`
were bare `::timestamptz` inside the stage's single exception block. Now 026's pattern; `score` is
hardened the same way for the same reason.

> **Check.** `created: 1757900000000` → `2025-09-15T01:33:20Z`; `submitted: "not a date"` → null;
> `score: "8"` → `8.000`; `score: "eight"` → null. All three grafted attempts inserted, stage `ok`.

**R2-7 — `scores_changed` narrated an out-of-order fold.** No newest-run guard, while 039 folds
oldest-first and crawls can be registered late. Now 043's predicate: the two counts are computed
only when this run is the newest *registered* crawl, else 0 / 0 with `older_run: true`. The rows are
still inserted — an older crawl is good history, it just does not get to narrate.

> **Check — before and after on the real 2026-09-02 crawl**, replayed after the 9/14 one. Live 046:
> `scores_changed` **7**, and `sync_change_lines` produced **"7 score(s) changed"**. 056:
> `scores_changed` **0**, `older_run` **true**, `sync_change_lines` → **"Nothing changed"**. The
> newest crawl still reports normally (`older_run: false`).

### 12.3 Test runs

```
phase10a_stage_gradebook: PASS   gradebook_rows 85 · latest_rows 45
                                 kinds {"item": 38, "total": 1, "letter": 1, "attendance": 5}
phase10a_stage_attempts:  PASS   attempt_rows 4 · pulled_back_files 3 · view_rows 5
```

Both suites now carry the round-2 assertions: the `attempt-<digits>/` keys, "no two
`my_submissions` rows share a key", the both-null refusal, `attempts_allowed = -1` for an unlimited
column and never 0, `older_run` false on the newest crawl, and a new gradebook section 5b that
replays the older fixture crawl and proves it reports 0 / 0 with `older_run: true` and that the
Activity feed says "Nothing changed".

**How they were run, precisely.** No `psql` connection is available to this session, so both were
executed by pasting the committed loader and test bodies into one `execute_sql` call each, inside
the transaction the loader opens, ending in `rollback`. The gradebook run used the committed loader
verbatim with the assertion bodies transcribed (comments and failure-message wording condensed to
fit one call); the attempts run used the committed assertion bodies verbatim against an abridged
copy of the same fixture JSON (only fields no assertion reads were trimmed). Every line of both
committed files has been executed verbatim across the two rounds, but **neither file has been run
end-to-end from disk in a single invocation** — `cat db/tests/phase10a_load_fixtures.sql
db/tests/phase10a_stage_gradebook.sql | psql "$DATABASE_URL"` (and the same for the attempts file)
is a two-minute integration check worth doing wherever a psql connection is to hand.

`npm test` in `web/`: **513 tests in 37 files, all passing** — the whole integrated phase branch,
W-18's suites included.

Prod was re-read after both runs: no fixture row survived in `bb_raw`, `agent_requests`,
`sync_runs`, `bb_gradebook`, `bb_attempts` or `bb_files`, and nothing was committed.

### 12.4 Advisor diff (round 1 end → round 2 end)

| lint | before | after | note |
|---|---|---|---|
| `function_search_path_mutable` (WARN) | 7 | **7** | unchanged; `bb_file_relpath` is one of the seven and 052 deliberately left it alone — see below |
| `authenticated_security_definer_function_executable` (WARN) | 1 | **2** | **not this phase's** — see below |
| `auth_leaked_password_protection` (WARN) | 1 | 1 | unchanged |
| `unindexed_foreign_keys` (INFO) | 14 | 14 | unchanged |
| `auth_rls_initplan` (WARN) | 21 | 21 | unchanged |
| `unused_index` (INFO) | 7 | **5** | two of the three indexes 046/050 added are now used and have dropped off; `bb_attempts_sync_run_idx` remains, on a table with no rows yet |

**The second `authenticated_security_definer_function_executable` finding is not from 10a.** It is
`public.calendar_push_now()`, created by **`062_calendar_push_tick`** (`20260915145422`) — Phase
11's range, applied to the same prod database while this round was in flight. It is flagged here
because it is the only new security finding on the project and someone should own it: `app_owner`
is the long-standing deliberate exception (DECISIONS, 2026-09-10); this one has not been assessed.
Every function migrations 046–056 touch is `service_role` only and none of them appears.

**Why 052 did not add `set search_path` to `bb_file_relpath`.** It is one of the seven pre-existing
lint-0011 findings, it predates this phase, and changing it inside a fix for a Storage-key collision
would move an advisor count for an unrelated reason. All seven belong in one migration of their own.

### 12.5 Left open after round 2

* **bb-sync step 4b still has not run.** It needs a logged-in tab and a real submission file, so it
  runs for the first time in Stack's acceptance script. Round 2 changed two of its rules (a 409 is
  never "done"; it is now the only place a stuck submission file is reported, since 054 stops the
  transform raising an Inbox gap), which makes that first run the check for both.
* **The attempts key names are still unverified**, exactly as §10a describes. Nothing in round 2
  changed that; 055 only made an unreadable value cheaper — it drops one field instead of the run.
* **A `numeric(9,3)` overflow can still fail `stage_attempts`** (a score ≥ 10^6). Clamping would
  mean inventing a number; the stage records it honestly as a failed stage with its message. If a
  real payload ever does it, the column type is the fix.
* **Neither SQL suite has been run end-to-end from disk in one invocation** — see §12.3.
