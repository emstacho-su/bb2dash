# Phase 12b — W-34 (sweep) verification

Worker W-34, branch `fix/page-pass-12b-sweep`, worktree `bb2dash-wt-12b-sweep`. 2026-09-17.
Rows owned: **F-5** (P-data-2 follow-up), the **flaky web test** hunt, the broken **`npm run lint`**,
and a read-only **sanity sweep** of the 076 leftovers. All four are done; none is blocked.

The branch was cut from the integrated phase branch and, part-way through, `origin/fix/page-pass-12b`
was merged in (W-31's grades work, the Home card, browser walk pass 2). The merge was clean.

| commit | task |
|---|---|
| `785215c` | `fix(P-data-2)`: migration 084 + its SQL test |
| `e8d11f9` | `test(web)`: seed the planner-row properties |
| `9324793` | merge `origin/fix/page-pass-12b` |
| `eb096ec` | `chore(web)`: `npm run lint` on the ESLint CLI |

---

## 1. F-5 — the Inbox's last open conflict · migration 084

**What was wrong.** `attention_items` 137, open since 2026-09-11:
"IST.323: gradebook column *Final Project - Proposal and Appendices* is attached to more than one
assignment, so the transform cannot tell which one Blackboard means. Which is it?"

It is unanswerable. That column is shared **on purpose** — Blackboard collects the whole
final-project packet under one column, and `IST.323/fp-proposal` and `IST.323/fp-log-final` are both
bound to it (`confidence = confirmed`, same `bb_item_id _12983388_1`). Migration 075 already handles
exactly that: restamp the liveness of every row bound to the column, apply none of the column's
values. Nothing is left for Stack to decide.

Worse, it could not be closed by hand. `raise_attention` (041) dedupes against **open** rows only,
and for `kind = 'conflict'` the only do-not-re-ask rule is `attention_keep_stands`, which needs a
`resolved` row whose `resolution->>'accept' = 'keep'`. A dismissal does not qualify.

**RED, measured on prod inside `begin; … rollback;` before anything was written:**

| probe | result |
|---|---|
| any open `column:%` conflict? | `FAIL 1 shared/ambiguous gradebook-column conflicts are still open` |
| dismiss row 137, re-fold the newest crawl | `FAIL the replay re-opened the IST.323 shared-column question` |
| synthetic column whose NAME fits two unbound assignments, fold | `FAIL the genuinely ambiguous column raised no conflict` — today's code binds the first candidate by `limit 1`, silently |

**The fix.** `db/migrations/084_shared_column_conflict.sql`. The function body is 075's, **verbatim**,
with two hunks — assembled from the frozen file by script and `diff`ed against it, so the diff is
only those two hunks and four one-line edits (the `v_shared` declaration, the `shared_columns`
count, one stale sentence in 075's comment, and the function comment).

1. **The shared-column branch stops asking.** It is reached only because every matching row already
   carries the column's id. It still counts the column (`ambiguous_columns`, unchanged), now also
   reports `shared_columns`, still restamps, and still applies none of the column's values.
2. **The conflict moves to the case it was written for**: a column that matches nothing by id whose
   NAME fits more than one assignment, none of which carries its id. That path used to bind the
   first candidate by `order by … limit 1`. It now raises the same question, binds nothing and
   applies nothing.
3. **The data.** Every open row of that conflict whose column is a deliberate shared binding is
   closed as `dismissed`, `resolved_at` stamped, `resolution_note` =
   `Closed by 084: a shared gradebook column is handled by 075; nothing to decide.`
   A `n <> 1` guard makes the count explicit.

**Measured before writing hunk 2, so it changes nothing today:** of the 49 gradebook columns in the
newest crawl, **0** have more than one title candidate. It closes a guess for the future.

**Dry run** (`begin; … rollback;`): all three in-migration guards passed, 0 open `column:%`
conflicts, row 137 read back `dismissed | Closed by 084: …`.

**Applied** via `apply_migration` under the name `084_shared_column_conflict`.

| | value |
|---|---|
| repo file, LF form | `f0f2f2826a85090555db4e157b6e2e5b`, 27 920 bytes |
| `supabase_migrations.schema_migrations.statements[1]` | `f0f2f2826a85090555db4e157b6e2e5b`, 27 920 bytes |
| version | `20260917191019` |

Byte-identical. (The repo file is CRLF in the working tree; git stores it LF, and that is the form
prod holds — the same convention W-30 recorded for 073–078.)

**GREEN.** `db/tests/phase12b_084_shared_column_conflict.sql: PASS`, four sections:

1. 0 open `column:%` conflicts; row 137 is `dismissed`, `resolved_at` set, note exact.
2. Wind `bb_last_seen` back to the stale `2026-09-02 20:32:02` value, confirm the bug reproduces
   (2 of 2 rows absent from Blackboard), re-fold the newest crawl: **0 new `attention_items` rows**,
   nothing re-opened, `ambiguous_columns ≥ 1` still reported, both rows restamped, 0 absent, and
   `bb_item_id` unchanged at `_12983388_1`.
3. A synthetic column appended to a `bb_raw` payload of that crawl, with two unbound assignments
   carrying its exact name: **exactly one** open conflict raised, carrying the same question, and
   **neither** probe row bound or valued.
4. No `assignment_progress` row written.

**075's own test still passes** against the new body (its two textual assertions and its
wind-back/replay section were re-run under 084).

**Prod after:**

| count | before | after |
|---|---|---|
| open `attention_items` rows | 92 | **91** |
| open `bb_column_id` conflicts | 1 | **0** |
| IST.323 final-project rows in `v_calendar_push_items`, not absent | 2 | 2 |

**One thing for the PM.** 077's `v_inbox_feedback` is "every closed Inbox row that carries a note",
so row 137 now appears there — with a note written by a migration, not by Stack. It is honest
(a dismissal with its reason) but it is the first machine-written row in that queue. If the agent
that eventually reads the queue should only see Stack's own words, that filter belongs in the view,
not here.

---

## 2. The flaky web test

**Not reproduced as a test failure.** W-32 saw one unidentified single-test failure in 6 full runs
and could not reproduce it in 5 more. Four more full runs here, plus targeted fuzzing:

| run | result | duration |
|---|---|---|
| 1 | 5 files failed / 94 collected, 6 tests failed / 1496 | **3 239 s** |
| 2 | 103 files / **1689 tests** passed | 78 s |
| 3 | 103 files / **1689 tests** passed | 97 s |
| 4 | 103 files / **1689 tests** passed | 92 s |
| after the merge | 91 files / **1510 tests** passed | 87 s |

**Run 1 was infrastructure, not a test.** Its errors are
`[vitest-pool]: Failed to start forks worker for test files …` /
`[vitest-pool-runner]: Timeout waiting for worker to respond`, on nine files. It ran immediately
after `npm ci`, while Windows was still indexing a fresh `node_modules`: vitest reported
`~13.75 s startup each` per worker against the sub-second a warm run takes, and the whole run took
54 minutes against 78 seconds. Nine files never got a worker, so nine were "failed" without a test
having run. **Nothing is changed for it** — raising the pool timeout would paper over a machine
state, and the failure is self-identifying. It is written up here so the next sighting is recognised
rather than re-hunted. It does not match W-32's report (one *test* failing), so it is not the flake.

**The one real source of randomness in the suite was fast-check.** Both `fcParams()` helpers passed
**no seed** unless `FC_SEED` was set, so every run drew a new seed from the clock. A property that is
wrong for one generated input in a few hundred fails once and passes the next eleven times — exactly
the shape W-32 reported.

**Hardened (non-grades):** `web/test/planner-rows.test.ts` now seeds by default
(`DEFAULT_SEED = 20260917`), keeps `FC_SEED=<int>` to replay a reported failure, and adds
`FC_SEED=random` to fuzz on purpose.

Checked before pinning, so the fixed seed cannot be hiding a live failure — the 36 properties pass
under seeds `1`, `7`, `12345`, `-999`, `20260101` and three separate random draws.

**Left for W-31, listed not fixed** (grades files, and the PM's later relaxation covers lint fixes
only): `web/test/grade-model/fc-params.ts` — the shared `fcParams()` for
`properties.test.ts` and `properties.rules.test.ts` is still unseeded. Fuzzed read-only here: the
142 tests under `test/grade-model/` passed six consecutive unseeded runs, so nothing is failing
today; the randomness is the risk, not a known defect. One line closes it:
`return seed === undefined ? { numRuns: MIN_RUNS, seed: DEFAULT_SEED } : …`.

**Checked and clean, no change needed:**

* **Real clocks.** No `new Date()` / `Date.now()` in any non-grades test's assertions. Every
  clock-reading module already injects it (`now: Date = new Date()` in `queries.sync.ts` ×5,
  `course-dimension.ts`, `anchor.ts`), and the components that read it directly
  (`PlannerWeek.tsx`, `Today.tsx`, `CourseScreen.tsx`) are driven by the 9 suites that call
  `vi.useFakeTimers({ toFake: ['Date'] })` + `setSystemTime`. The two unguarded calls in
  `queries.sync.test.ts` (`freshnessLine(status)` with no sync recorded, `relativeTime(null)`)
  return constants.
* **Shared `localStorage`.** All 8 suites that write it clear it in `beforeEach`/`afterEach`.
  `PlannerWeek.hydration.test.tsx` mentions it in a comment only.
* **Cross-file module state.** vitest runs with the default `isolate: true`, one worker per file.

---

## 3. `npm run lint`

**RED.** `next lint` was removed in Next 16, so the script linted nothing:
`Invalid project directory provided, no such directory: web\lint`. Nothing in this repo has been
linted since the Next 16 upgrade. There was no ESLint in the tree either — no `eslint`, no
`eslint-config-next`, no config file.

**GREEN.** `"lint": "eslint"` over a new `web/eslint.config.mjs` built from
`eslint-config-next/core-web-vitals`, which is what `eslint-config-next` documents for 16.
`npm run lint` **exits 0**: 26 problems, **0 errors**, 26 warnings.

**Dependencies added — two, both strictly required**, since the CLI needs ESLint and the rules need
the preset: `eslint` and `eslint-config-next@16.3.4`.

**ESLint is pinned to 9.39.5, not 10.** `eslint-config-next@16.3.4` declares `eslint >= 9.0.0` but
bundles an `eslint-plugin-react` that throws
`TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function`
on ESLint 10 before it lints a single file. Tried 10.10.0, reverted, recorded in the config so
nobody repeats it. npm warns that 9.x is out of its support window; revisit when the preset ships a
plugin set that runs on 10.

**Two genuine findings fixed:**

* `react/display-name` — `test/queries.grade-model.test.ts:238`, the `QueryClientProvider` wrapper
  is a named function now. A grades test, but a lint-only edit: no behaviour change.
* an **unused** `eslint-disable no-eval` directive — `test/sidebar-preference.test.ts:98`. `no-eval`
  is not in the preset, so the directive was itself a finding. Replaced with a plain comment saying
  why the indirect eval is there.

**The other 24 are two React Compiler rules new in eslint-config-next 16, and every one is a
deliberate, commented pattern.** They are set to `'warn'` in the config, with the full inventory and
the reasoning written beside them, so the run passes without hiding anything. A phase that takes
them on flips them back to `'error'`.

| rule | n | where | why it fires |
|---|---|---|---|
| `react-hooks/refs` | 18 | `Bell.tsx` (6), `TopNav.tsx` (7), `ActivityMenu.tsx` (5) | all three call `usePopover()`, which returns `{ open, setOpen, toggle, close, ref }`. The rule treats every read of that object in render as reading a ref. **Not one flagged line touches `.current`** — they read `open`, pass `toggle`/`close` to handlers, or hand `ref` to JSX. Clearing it honestly means changing the hook's shape, i.e. refactoring three live menus. |
| `react-hooks/set-state-in-effect` | 6 | `SidebarProvider.tsx:75`, `CourseInfo.tsx:122`, `MaterialsBrowser.tsx:411`, `ActivityMenu.tsx:38`, `CommandPalette.tsx:114`, `queries.announcements.ts:183` | each is a mount effect adopting browser-only state (stored preference, viewport width, open-time snapshot) after hydration — the pattern that keeps server and client renders identical. Removing the setState reintroduces the hydration mismatch the surrounding comments say it exists to avoid. |

**The 2 remaining warnings** are `react-hooks/exhaustive-deps` at
`CourseScreen.tsx:88` and `:89`. Left alone: changing an effect's dependency list changes when it
runs, which is a behaviour change, not a lint repair.

**Findings inside W-31's grades files**: one, the `react/display-name` above, and it is fixed as a
lint-only edit under the PM's later relaxation. Nothing else in `grade-model*`, `graded-so-far.ts`,
`queries.grade*.ts`, `components/grades/` or `SubmissionBlock.tsx` is reported.

---

## 4. Sanity sweep of the 076 leftovers (read-only — reported, not fixed)

**Both 076 claims hold.**

* `select count(*) from information_schema.role_table_grants where table_schema = 'public' and
  privilege_type = 'TRUNCATE' and grantee in ('anon','authenticated')` → **0**. No table or view in
  `public` hands TRUNCATE to a browser role.
* The performance advisor **no longer reports `auth_rls_initplan`** at any level (it was 21 WARNs
  before 076).

**Everything the advisor still reports, with the one-line fix each.** None touched.

| level | lint | n | one-line fix |
|---|---|---|---|
| WARN · security | `function_search_path_mutable` | 7 | `alter function public.<f>(…) set search_path = public, pg_temp;` for `set_updated_at`, `classify_bb_file`, `bb_file_relpath`, `suggested_start`, `search_file_text`, `match_file_text`, `hybrid_search_file_text` — one additive migration, no body change. |
| WARN · security | `authenticated_security_definer_function_executable` | 2 | `app_owner()` and `calendar_push_now()` are callable by `authenticated` over `/rest/v1/rpc/…`. `app_owner()` is deliberate — every RLS policy calls it and it returns one uuid; document it. `calendar_push_now()` is the Sync-button arm: decide whether the browser may fire a push, and if not, `revoke execute … from authenticated`. |
| WARN · security | `auth_leaked_password_protection` | 1 | Stack turns it on in the Supabase dashboard (Auth → Passwords → check against HaveIBeenPwned). Not a migration. |
| INFO · performance | `unindexed_foreign_keys` | 15 | one `create index` per FK (`assignments.component_id`, `bb_content.assignment_id`/`parent_id`, `bb_files.assignment_id`/`reading_id`/`session_id`/`superseded_by`, `course_staff.course_id`, `courses.parent_course_id`/`term_id`, `grade_components.parent_id`, `meetings.course_id`, `planner_events.course_id`, `sync_stage_runs.course_id`/`sync_run_id`). At this row count it buys nothing measurable; worth doing only alongside a real slow query. |
| INFO · performance | `unused_index` | 5 | `bb_attempts_sync_run_idx`, `bb_text_embeddings_hnsw`, `bb_content_fts_idx`, `announcements_fts_idx`, `grade_column_links_component_idx` have never been used. **Do not drop them** — the two FTS indexes and the HNSW index back the `search` edge function, which is not exercised by the app's own page loads; the counter says "not used by these queries", not "not needed". |

Unchanged from W-30's post-076 reading: the same 7 / 2 / 1 / 15 / 5. 084 introduced nothing new.

---

## Suites

| suite | result |
|---|---|
| `web` vitest | 91 files, **1510 tests** passed |
| `web` typecheck | clean |
| `web` `next build` | clean |
| `web` `npm run lint` | **exit 0**, 0 errors, 26 warnings |
| SQL test `phase12b_084_shared_column_conflict` | PASS, rolled back clean |
| SQL test `phase12b_075_shared_column_restamp` | PASS under the 084 body |

**On the test count.** The brief's floor was "not below 1672". Before merging the phase branch this
branch ran **1689**. After the merge it runs **1510**, and the whole difference is W-31's G-1
deletions on the phase branch — 12 test files removed (`agreement`, `fixtures`, `item-states`,
`labels`, `muting`, `percent-placeholders`, `placeholders`, `properties.states`, `solver`,
`queries.grade-scenario`, …) against 2 added (`graded-so-far`, `grades-sections`). Nothing here
removed a test. **The 1672 floor no longer describes this branch and should be restated against the
merged phase branch.**

## Open risks

1. **Row 137's note is the first machine-written row in `v_inbox_feedback`** (see §1).
2. **`test/grade-model/fc-params.ts` is still unseeded** (see §2). Six unseeded runs were green, so
   it is a latent flake, not a live one.
3. **24 React Compiler warnings stay warnings.** They are real design signals about the shell's
   popover hook and its hydration effects, and a later phase should clear them with Stack watching
   the screens. Nothing regressed: they have been true since the Next 16 upgrade and were invisible
   only because `next lint` had stopped running.
4. **ESLint is pinned below its supported version** (9.39.5) because the preset cannot run on 10.
