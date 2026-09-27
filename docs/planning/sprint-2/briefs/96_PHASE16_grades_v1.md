# Phase 16 — Grades: V-1 validation sittings and the reconciliation migration

Date 2026-09-24 · PM: the Fable session · Product manager: Stack
Requirements: R-29, R-30, R-31, R-32, R-33, R-34, R-35, R-36 · PM-added steps: P-1, P-3, P-4, P-6,
P-66, P-67, P-68, P-74, P-75
Branch `feat/grades-v1-16` · Worktree `bb2dash-wt-16` · Migration range **105–109** · One PR per phase
(no exception taken; Open items 4 names the one contingency)
Status: **PROVISIONAL until Stack answers 93 §5 (B-9, B-10, B-11, B-12, B-13, B-14, B-15, B-16, plus
B-23, the early Phase 13 carry-ins, and B-42, the test runner's credential, which this brief relies on)**
and approves `94_SPRINT2_PHASES.md` (DECISIONS 2026-09-23: the PM proceeds on stated defaults).
Session prompt: `project-state/ORCHESTRATOR.md` §6, Session A (Phase 15 first, then this phase); quoted
in §Session prompt at the end of this brief.
Inputs: `91_REQUIREMENTS_v3.md` §1.1 and §2, `93_SPRINT2_RESEARCH_SYNTHESIS.md` §1.1, §2, §5 B, §6,
`research/92_RESEARCH_sprint2_grades-validation.md`, `../sprint-1-hub/briefs/63_GRADING_VALIDATION.md`,
`../sprint-1-hub/research/75_RESEARCH_v1_grading_validation.md`, `briefs/95_PHASE15_db_hygiene.md` (the
runner's frozen CLI). Prod facts below were read with SELECTs on 2026-09-24 and re-read by the Stage C
critic the same day (counts, column names, function signatures, link rows, attention rows 2–163).

## Why

Sprint 1 built the one "graded so far" figure on grading rows nobody has checked. V-1 was stubbed on
2026-09-16 (Stack: "not a product feature as much as a data accuracy problem"), so on prod today 35 of
35 components and 6 of 6 schemes are `confirmed` and none cites a document (R-33); IST.323's 13-point
"Proposal and Appendices" column is linked to the 11-point proposal part, so once it is graded the
figure computes 11 × s / 13 and the log's 2 points can never count (R-30); two IST.466 columns worth
points belong to no part (R-30); the launcher cannot start, and would not stay confined if it did
(R-34); the only export is ten days stale, 73 assignments against 88 on prod (R-35); there is no
reconciliation migration and no invariant guarding the arithmetic (R-32); ECN.304's 30 / 25 / 20 rank
rule is written nowhere on screen (R-36); and Stack's own presentation dates sit on archived Inbox rows
flagged for him, where he cannot see them (R-29).

Why now: the calendar is Stack's, not the PM's. Six sittings (IST.323, IST.466, IST.352, ECN.304,
GEO.103 lecture + recitation, IST.471), IST.323 first because its 13-point column is graded on
2026-12-03, inside the Nov 30 – Dec 13 code freeze, so the correction has to be on prod before Nov 30.
ECN.304 Exam 1 (2026-10-01) posts the first rank-weighted score of the term. Weeks 9 (Oct 19–25) and
11 (Nov 2–8) are exam-heavy and hold no sitting.

Everything else in this phase (the launcher fix, the export from a committed query, the invariants,
the machine-block checker, the migration, the rule line) exists to make each sitting cheap and its
result durable: a call Stack makes once is written to a row with its citation, re-checked by the test
suite from then on, and never asked again.

## Stack's calls this brief rests on

Every default below is **PROVISIONAL** (93 §5 B; B-42 is 93 §5 E, Phase 15's call, which every SQL check
here inherits). "Changes" names the tasks of §Task list that move if he answers otherwise.

| B | Question (93 §5) | Default this brief builds | Changes if he answers otherwise |
|---|---|---|---|
| B-9 | Presentation dates (Q1) | SITN stays 2026-11-04 15:45 as recorded; IST.323 individual presentation stays undated and `tentative`; IST.466 major-project-1 goes back to `tentative` to match major-project-2 (105) | A date he gives is applied as an Inbox value resolution (DECISIONS 2026-09-15), not by 105; task 9 drops its confidence assertion; if `raise_attention()` refuses a re-ask on row 163's key, the date lands in 105 if 105 is not yet applied (task 10); otherwise in `db/migrations/108_grading_reconciliation_fixes.sql`, widened to hold it, under its own DECISIONS row (Open items 2) |
| B-10 | GEO.103 "Absences" / "Attendance" 0/100 read as graded (Q2) | "Not graded" on both columns until the GEO sitting, written by 105 as the two `grade_column_links` rows the picker writes (the picker is not offered on a confirmed link: `linkStates` in `web/src/lib/grade-model-view.ts`). **PROVISIONAL and a departure from 93 §5 item 10**, whose default also carries an engine fix: the engine already treats a null score as ungraded and both columns carry a posted 0.000, so P-66 ships as pinning tests only (task 11) until Stack answers Open items 1 | If the columns count, 105 carries no link rows (task 9 drops that assertion, task 10 its excluded-links SELECT, task 15's links figure stays 4, task 11 its third case, and task 10a is not needed), task 10b drops screenshot 05, and the GEO sitting decides how an absence count is scored |
| B-11 | Un-stub V-1 (Q3) | Yes, inside this phase; sitting 1 after the launcher is fixed and the export regenerated | If no: tasks 15–25 leave the phase (task 25 renames test cases for 106's IST.323 re-cut, which no sitting then decides); it ships R-29, the R-34 / R-35 tooling and the rule line, and a DECISIONS row keeps V-1 stubbed |
| B-12 | IST.323 13-point column (Q4) | Re-cut components 18 / 19 to 13 / 1 in 106, decided in sitting 1 | "Keep 11 / 3 / 6 and name the 2-point gap": 106 carries no component update and task 25 is dropped. An engine split (size L) leaves this phase for a later one |
| B-13 | IST.466 attendance / participation columns (Q5) | Leave today's links; the two unscored columns are named under the figure until linked | 106 carries the links he gives; invariant D's exception list (task 23) loses those ids |
| B-14 | How V-1 marks a checked row (Q6) | `notes` for schemes and components, `source_ref` for assignments, one syntax `bb_file:<id>#unit:<n>` everywhere (P-75); a from-memory answer is `STACK_OVERRIDE` + `confirmed` with his why; the invariants filed in `db/tests` and rerun by the suite, not wired into the sync | A new column for the citation or date makes 106 a schema migration (size L, 036's guard); `tentative` for from-memory answers changes the checker's rules (task 6) and the F ceiling (task 23) |
| B-15 | C-2 rank weights (Q7) | The rule line only, in ranked order, shipped here now (with B-23, which Phase 17 carries); per-exam weights stay parked | If it waits for Phase 22: tasks 12, 13, 27 and screenshot 06 move to brief 103 |
| B-16 | V-1's migration number | A number in this phase's range: `106_grading_reconciliation.sql`; 059 stays unused | Any other number in 105–109 is a rename only |
| B-42 (Phase 15's call, inherited) | A database credential for the test runner (Q33; 93 §5 E) | Phase 15's default (brief 95, §Stack's calls, B-42 row): `BB2DASH_TEST_DB_URL` in a gitignored `.env.local` for the `db_test_runner` role of `db/migrations/100_db_test_runner_role.sql`, so every SQL check here is "runner `--only <file>` → pass" and 107 is reserved for a grant that role lacks. Prod on 2026-09-27: no `db_test_runner` in `pg_roles`, no migration 100–109 recorded | **No credential** (no role; migration 100 stays free): 107 is never written; the runner checks of tasks 8, 9, 10a (its after-task-10 check, on both branches), 22, 23 and 24 each become one MCP `execute_sql` paste of that file, expecting its one row whose first column ends in `: PASS`; the DoD's `node scripts/db-test.mjs` gate becomes one such paste per `db/tests` file, this phase's four included (brief 95's B-42 row); the generated `phase16_106_v1_recheck.sql` is pasted the same way, so the checker still needs no credential. Task 10's first check is unchanged, since its expected number is counted from `git ls-tree` over whatever 100–104 files Phase 15 ships. No other expected value changes. **An owner-level DSN instead of the role:** 107 is never written and every runner line stands |

None of these defaults is written to DECISIONS as Stack's answer until he gives it; where the phase
must move before he answers (task 1), the row is recorded as an adopted default under DECISIONS
2026-09-23 and says PROVISIONAL (93 §6: "written to DECISIONS with the date he answers").

## Contract (frozen when Stack approves the phase plan)

### Routes and screens

No new route. One screen change, in the two places that render the full-size figure: `/grades`
(`web/src/app/(app)/grades/GradesScreen.tsx:89`) and a course's Grades tab (`/course/[id]/grades`,
`web/src/app/(app)/course/[id]/grades/CourseGrades.tsx:80`), both through `GradedSoFarFigure`
(`web/src/components/grades/GradedSoFarFigure.tsx`). A course whose scheme has a `rank_weighted` part
with usable weights gets one sentence under the headline (R-36). Home's course card and its text-only
contract (`gradedSoFarCardFigure`, called from `web/src/app/(app)/Today.tsx:182`) are unchanged; the
`compact` prop keeps rendering no rule line. Nothing is added to `GradebookTable` rows
(`web/src/components/grades/GradebookTable.tsx`, non-computing by design).

Frozen strings (PM's wording; Stack approves them on the preview; built from the stored weights, never
a literal), with `n = weights.length`:

* not every slot graded: `<part>: weighted <w1> / <w2> / … from highest score to lowest once all <n> are graded; until then the graded ones are averaged.`
* every slot graded: `<part>: weighted <w1> / <w2> / … from highest score to lowest.`

ECN.304 today reads: "Exams (rank-weighted): weighted 30 / 25 / 20 from highest score to lowest once
all 3 are graded; until then the graded ones are averaged." That is `rankWeightedLevel`'s rule
(`descending(values)`, weights in order) and `rankWeightedAggregate`'s plain mean until `allGraded`.

### RPC signatures

None new, none changed. Called, not redefined: `stage_assignments(p_run_id uuid, p_sync_run_id bigint)`
(SECURITY DEFINER; replayed inside `begin … rollback` by task 9's test, the pattern of
`db/tests/phase12b_084_shared_column_conflict.sql`); `raise_attention(p_sync_run_id bigint, p_kind text,
p_course_id text, p_entity text, p_ref text, p_field text, p_from jsonb, p_to jsonb, p_question text,
p_suggested jsonb)` and `apply_resolutions()` (both SECURITY DEFINER), only if B-9 brings dates.
`v_grade_model_items` (081) and `v_gradebook_latest` are read, never re-created, so 036's
`security_invoker` guard is not triggered and no grant changes.

### Web engine seam (R-36)

* `web/src/lib/grade-model/aggregations/rank-weighted.ts`: `usableWeights` gains `export`; no
  behaviour change. The screen reads weights through it, so it cannot disagree with the engine (the
  principle of DECISIONS 2026-09-16 line 135, restated by P-4's row without `itemStates()`).
* `web/src/lib/graded-so-far.ts`: new `export interface RankRule { readonly part: string; readonly
  weights: readonly number[]; readonly allGraded: boolean }`; the `figure` state of `GradedSoFarResult`
  gains `readonly rankRules: readonly RankRule[]`, built from
  `flattenOutcomes(evaluation.gradedSoFar.outcomes)` (`evaluate.ts:115`, so a nested part is found too)
  whose `node.component.aggregation === 'rank_weighted'` and whose `usableWeights(node.component.rankWeights)`
  is not null, with `allGraded = outcome.state === 'graded'`, in syllabus order. The other two states
  are unchanged.
* `web/src/components/grades/GradedSoFarFigure.tsx`: `export function rankRuleText(rule: RankRule):
  string` (the two strings above) and one `<p className={styles.sentence} data-testid="rank-rule">` per
  rule, after the headline, only when `!compact`.

### V-1 tooling (R-31, R-33, R-34, R-35, P-67, P-68, P-74, P-75)

* **Launcher** `scripts/validate-grading.mjs` (new): `node scripts/validate-grading.mjs [COURSE]
  [--export <path>] [--dry-run]`. Reads `~/.claude.json` with `JSON.parse` (the case-duplicate project
  keys parse; the PowerShell 5.1 `DuplicateKeysInJsonString` crash is gone) and takes
  `mcpServers.bb2dash`; checks that `args[0]` exists only when `command` is Node, meaning its
  basename, lower-cased with any `.exe` dropped, is `node` (on this machine the entry's `command` is
  `C:/Program Files/nodejs/node.exe` and `args[0]` is
  `C:/Users/estac/projects/bb2dash/mcp-server/dist/index.js`, read 2026-09-24; a bare `=== 'node'`
  test would skip the check); any other command (Phase 14's `docker run …`) is accepted as is. Writes
  the entry to `<os.tmpdir()>/bb2dash-validate-mcp-<random>.json` with mode `0o600` (NTFS ignores the
  mode; the file sits in Stack's own `%TEMP%`) and deletes it in `finally` (success, error, Ctrl-C).
  Spawns `claude --strict-mcp-config --mcp-config <tmp> --restricted --tools Read,Edit,Write,Glob,Grep
  --allowedTools <A> --disallowedTools <D> --append-system-prompt <S> <prompt>` (the tool list is one
  argv element). **`--restricted` and `--tools` stay** (today's script passes both,
  `scripts/validate-grading.ps1:61`): `claude --help` on 2.1.283 (read 2026-09-27) documents
  `--restricted` as removing the built-in tools that run commands or code, and WebFetch, unless `--tools`
  names them, ignoring user, project and local settings files, and confining the file tools to the
  working directories, and `--tools` as the list of available built-in tools. Without them the
  user-level allow rules apply and, once a prompt is approved, the file tools reach past the worktree,
  `~/.claude.json` (which holds the service key) included. `Write` is in the list because the session
  creates each verdict file (Claude Code creates a file with `Write`; `Edit` replaces text in an
  existing one), `Edit` because the `Edit(...)` rule below is the write scope. PM call (Stage C round
  3), **PROVISIONAL with B-11** and a departure from 93 §5 item 11's "dead flags dropped": research 92
  §6 (a docs page fetched 2026-09-24) was stale on this point, and so were 91 P-68's title ("drop
  `--restricted` / `--tools`") and 93 R-34 and P-68, which rested on it (all three struck and corrected
  2026-09-27, the same day, with `claude --help` on 2.1.283 as the source); P-68 is delivered as its
  `Edit(...)` half. `A` = the three `mcp__bb2dash__*` tools,
  `Read(docs/planning/**)` (Claude Code applies `Read` rules to `Glob` and `Grep` too, so today's
  `Glob(...)` / `Grep(...)` entries go), `Edit(docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*)` (an
  `Edit` rule governs `Write`; a `Write(...)` rule is accepted and never consulted). `D` = today's list
  (`scripts/validate-grading.ps1:52-55`) minus `Edit` and `MultiEdit` (their path rule now carries the
  write scope) plus `Read(./.env*)`, `Read(./**/.env*)`, `Read(./course context/**)`. The prompt names brief 63 (method),
  `docs/planning/sprint-2/evidence/96c_V1_VERDICT_TEMPLATE.md` (shape; supersedes 63's table and
  five-field questions row), the newest `docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_*.md`
  unless `--export` is given, and the verdict path.
  `--dry-run` prints the argv with the temp path shown as `<tmp>` and the line
  `server: bb2dash (build found)`, launches nothing, exits 0. Confinement on this machine is Claude
  Code's own (restricted mode and the permission rules); the OS sandbox does not run on native Windows and arrives with Phase 14's
  Linux dev container.
* `scripts/validate-grading.ps1` (changed) becomes a wrapper, `node "$PSScriptRoot/validate-grading.mjs" @args`,
  so the documented command keeps working (82 decision #16).
* **Export** `scripts/export-grading-schema.sql` (new, P-74): one statement returning one text value,
  the export body: `## 0. Counts` (schemes, components, assignments, links, gradebook columns),
  `## 1. Schemes` (`grading_schemes.method`, `total_points`, `graded_out_of`, `letter_scale`,
  `ai_policy`, `notes`, `confidence`, and the syllabus file: the end of the `superseded_by` chain from
  the `bb_files` row whose `course_id = courses.id` and `file_name` equals the last path segment of
  `courses.syllabus_path`), `## 2. Components` (`grade_components.weight_pct`, `points`,
  `count_expected`, `aggregation`, `drop_lowest`, `rank_weights`, `normalize_to`, `is_extra_credit`,
  `parent_id`, `notes`, `confidence`; column names read from prod 2026-09-24),
  `## 3. Assignments` (`component_id`, `points_possible`, `bb_column_id`, `confidence`, `source_ref`,
  due day = the New York day of `due_at`, else `due_date`: 089's rule), `## 4. Gradebook columns`
  (from `v_gradebook_latest`: `possible`, `column_kind`, `linked_assignments`, `counts_toward_grade`),
  `## 5. grade_column_links` (`course_id`, `column_id`, `component_id`, `excluded`). The PM runs it
  with `execute_sql` (a read) and appends `## 6. Open questions` by hand (64 §4 re-seeded: open ones
  carried, worker-answered ones marked "needs citation or STACK_OVERRIDE", new ones added) and a header
  naming the SQL file's git blob hash and the generation time.
* **Verdict files** `docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_<course_id>.md`, one
  per sitting (GEO.103 lecture + recitation share `96b_GRADING_VALIDATION_GEO.103.md`), written by the
  confined session, committed by the PM. Shape = `96c`: brief 63's reconciliation table; the questions
  block in research 75's ten fields (id · question · what it blocks · evidence found · options ·
  recommendation · default if unanswered · Stack's answer · date · DECISIONS row?), grading only (P-6);
  a `## Machine block` holding one fenced `yaml` list, one entry per table row: `id` (`<COURSE>-NN`,
  unique), `target {table, key, field}` (keys: `assignments.id`; `grade_components` course_id + code;
  `grading_schemes` course_id; `grade_column_links` course_id + column_id), `stored`, `materials`,
  `citation` (`bb_file:<id>#unit:<n>`, P-75) and `quote`, `verdict` (matches · differs ·
  not_in_materials · materials_say_more), `call` (keep · change_to · ask_professor · mark_ungraded),
  `value`, `reason_code` (research 75's ten), `why`, `decided_by`, `decided_on`, `confidence_after`,
  `recheck` (one SELECT returning one value).
* **Checker** `scripts/v1_recheck.py` (new, P-67), run as
  `uv run --with pyyaml python scripts/v1_recheck.py`: `--check <files>` (the block parses; ids unique;
  enums closed; `citation` matches `^bb_file:\d+#unit:\d+$` unless `not_in_materials` or
  `STACK_OVERRIDE`; every non-`matches` row has call, reason_code, why, decided_on; `differs` without a
  call is an error; `recheck` is one SELECT containing none of insert, update, delete, drop, alter,
  create, grant, revoke, truncate, copy, call, do) prints `rows: N, errors: E, differs without call: D`
  and exits non-zero on E > 0; `--summary <files> [--compare <96d>]` prints the counts table 96d carries
  verbatim, among them the correction count and the citation-only count 106's guard uses. Both count
  distinct target rows, `(table, key)`, never machine-block entries, and a row is counted once: a
  **correction** if any entry on it has call `change_to` or `mark_ungraded` whose `value` differs from
  what is on prod when 106 is written (the entry's `stored`, brought up to date from prod by task 20);
  otherwise **left tentative** if any entry has `confidence_after: tentative` (printed too, in neither
  of the two counts); otherwise, for a `grading_schemes`, `grade_components` or `assignments` row,
  **citation-only** (a `grade_column_links` row has no citation column and is never citation-only). A
  row whose `change_to` / `mark_ungraded` entries all hold a value already on prod is printed on its own
  line as **already applied** and is not a correction; the left-tentative and citation-only rules then
  place it, so an already-applied link row lands in neither count (106 changes nothing on it). 106 appends exactly one
  citation string to each correction and citation-only row that has a citation column (a correction's
  from its first correcting entry, a citation-only row's from its first entry, in file order) and none to
  a left-tentative row; `--emit-sql <out>` writes one `do $$ … $$` block per machine-block entry (not per target row)
  whose call is keep, change_to or mark_ungraded; each block runs that entry's own `recheck`, compares
  the result with the entry's `value` (change_to, mark_ungraded) or `stored` (keep) and raises
  `FAIL <id>` with the entry's id. The
  emitted file obeys brief 95's lint and pass rule: `begin;` first, `rollback;` last, no top-level
  `commit` / `end`, and a final `select 'phase16_106_v1_recheck: PASS'`. It is written to
  `db/tests/phase16_106_v1_recheck.sql` and run by the runner, so the checker needs no database
  credential and does not import brief 95's `loadDsn()` / `openClient()` (one credential either way).
* **Citation strings in the database** (B-14, P-75), appended, never replacing:
  `bb_file:<id>#unit:<n> "<quote>" verified_on:YYYY-MM-DD` or
  `STACK_OVERRIDE "<Stack's why>" verified_on:YYYY-MM-DD`, in `grading_schemes.notes`,
  `grade_components.notes` and `assignments.source_ref`. `skills/inbox-apply/SKILL.md` Step 4 gains the
  rule to write the same string when an answer confirms or links an assignment, and Step 3's heading 5
  ("Grading rule", which today quotes syllabus lines "with the file name") asks for the
  `bb_file:<id>#unit:<n>` form, so the Step 4 agent has the id to write.

### Tables and migrations

Additive only; each dry-run inside `begin; … rollback;`, then applied with
`mcp__plugin_supabase_supabase__apply_migration` under the file's name (prod records names without the
`.sql`, e.g. `090_attention_archive`), repo file byte-identical. No schema change is planned; a new
column would be a B-14 reversal with its own DECISIONS row. **Replay order:** 106 (and 108 / 109, unless 108
carries an early B-9 date) will be applied after Phases 17–19's 110–139 have landed, so no file in 105–109 may reference an object created
by 110 or later (the rule 91 R-32 states for a late 059); snapshots are `create temp table … ; drop
table …` inside the file (078's shape), so nothing is left behind.

| # | File | What it does |
|---|---|---|
| 105 | `db/migrations/105_v1_pre_sitting_fixes.sql` | Data only, each UPDATE / INSERT guarded by a row-count check (079's pattern). `IST.466/major-project-1-synchrony.confidence` → `tentative` (B-9; its 2026-10-20 date is protected by 084's out-of-term guard, which fires before the tentative overwrite, and the standing keep on item 145; task 9 replays it); `grade_components` 24 `notes`: "Major Case Group #3" → "Major Case Group #2" (DECISIONS 2026-09-22, Group 2); two `grade_column_links` rows, `(GEO.103.lecture, _3602583_1, null, true)` and `(GEO.103.recitation, _3602445_1, null, true)` (B-10, P-1; 057's one-target check holds). A `_105_before` snapshot proves `assignment_progress` and `reading_progress` unchanged |
| 106 | `db/migrations/106_grading_reconciliation.sql` | Writes the accepted corrections of `96d`, course by course in sitting order, each carrying its citation string, and appends each checked row's citation string (P-75 form, from its machine-block row, `matches` / `keep` rows included) to `notes` / `source_ref` (91 R-33's backfill; a `grade_column_links` target has no citation column and is never citation-only); B-12's re-cut as UPDATEs of components 18 and 19 (never delete / recreate: `grade_column_links.component_id` cascades); the fold writes `assignments.component_id` from a non-excluded link only where the column binds exactly one assignment and the value differs, never `confidence`, and deletes no link row (P-3); rows left "not in materials" or `ask_professor` become `tentative` and are listed in 96d with 084's overwrite consequence. `_106_before` snapshot (078's pattern); guards: planner-state tables unchanged; no `points_possible` written on a row with `bb_column_id is null` (no invented values); `grade_components` row count unchanged; no `grade_column_links` row deleted, and rows added equal the link inserts 96d lists; changed rows, counted per distinct row against `_106_before` across the four tables (an inserted `grade_column_links` row counts as changed), equal 96d's correction count plus its citation-only count (both printed by `v1_recheck.py --summary` and defined in §V-1 tooling) plus two terms the file counts from `_106_before` itself: left-tentative rows that were not already `tentative`, and rows only the fold changes |
| 107 | `db/migrations/107_db_test_runner_grants_phase16.sql` | Reserved: only if Phase 15's `db_test_runner` role (`100_db_test_runner_role.sql`) lacks a grant this phase's tests need (EXECUTE on `stage_assignments` for the replay, reads of the grading tables); never through `service_role` membership (brief 95 seams); otherwise unused |
| 108 | `db/migrations/108_grading_reconciliation_fixes.sql` | Reserved for whichever of two needs it first (applied once, then frozen): `/code-review` fixes found after 106 is applied (106 stays byte-frozen), or a B-9 date Stack gives after 105 is applied, when `raise_attention()` refuses the re-ask (Open items 2), under that date's own DECISIONS row. If a date takes it, a later fix to 106 needs a number the PM asks Stack for; otherwise unused |
| 109 | `db/migrations/109_grading_reconciliation_after_freeze.sql` | Reserved for Open items 4's contingency only (the non-IST.323 corrections if sitting 6 slips past 2026-11-20, applied after the freeze under their own DECISIONS row); otherwise unused |

Every `db/tests` file this phase adds obeys brief 95's lint and pass rule (`begin;` first, `rollback;`
last, no top-level `commit` / `end`, one result row whose first column ends in `: PASS`) and brief 95's
naming, `phase16_1NN_*.sql`, with one named exception: `db/tests/grading_invariants.sql` keeps the name
91 R-32 and brief 63's DoD give it, because it is a standing check of every later phase, not a test of
one migration.

### Files

New: `scripts/validate-grading.mjs`, `scripts/validate-grading.test.mjs`,
`scripts/export-grading-schema.sql`, `scripts/export-grading-schema.test.mjs`, `scripts/v1_recheck.py`,
`scripts/test_v1_recheck.py`, `scripts/fixtures/v1_verdict_fixture.md`,
`db/migrations/105_v1_pre_sitting_fixes.sql`, `db/migrations/106_grading_reconciliation.sql` (107 and
108 / 109 only if used), `db/tests/grading_invariants.sql`, `db/tests/phase16_105_pre_sitting_fixes.sql`,
`db/tests/phase16_106_grading_reconciliation.sql`, `db/tests/phase16_106_v1_recheck.sql` (generated),
`docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_<YYYY-MM-DD>.md` (named with its generation
date: one before the stop, then one on each sitting day if prod moved, task 15; the
`evidence/`, `verification/` and `walks/` folders under `docs/planning/sprint-2/` do not exist yet and
are created by this phase, per DECISIONS 2026-09-22's folder row),
`docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_<course>.md` (six),
`docs/planning/sprint-2/evidence/96c_V1_VERDICT_TEMPLATE.md`,
`docs/planning/sprint-2/verification/96d_GRADING_VALIDATION_SUMMARY.md`,
`docs/planning/sprint-2/walks/96e_PHASE16_WALK.md`, `docs/planning/sprint-2/walks/walk-16/*.png`.

Changed: `scripts/validate-grading.ps1`, `db/tests/phase10b_grade_model.sql` (lines 167–168 only, task 10a;
Phase 15's P-2 owns the rest of its rewrite), `web/src/lib/graded-so-far.ts`,
`web/src/components/grades/GradedSoFarFigure.tsx`,
`web/src/lib/grade-model/aggregations/rank-weighted.ts` (export only), `web/test/graded-so-far.test.ts`,
`web/test/GradedSoFarFigure.test.tsx`, `web/test/grade-model/aggregation.rank-weighted.test.ts`,
`web/test/grade-model/aggregation.manual.test.ts`, `web/test/grade-model/aggregation.sum.test.ts` (case
names only, under B-12), `skills/inbox-apply/SKILL.md` (Step 3 heading 5 and one Step 4 rule),
`docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md` (pointer lines to 96a / 96b / 96c / 96d where
it names the old export, the old verdict files, the old summary file `65_GRADING_VALIDATION_SUMMARY.md`
or "ten §4 questions": lines 16, 30, 33, 64, 78, 100, 120,
133 on `docs/sprint2-planning` 6a085e2, found by content, not by number, when the edit is made),
`docs/planning/sprint-2/90_SPRINT2_INTAKE.md` (S2-carry-2), `docs/planning/sprint-2/parked/81_PHASE13_styling.md`
(C-2 row: rule line shipped, per-exam weights still parked), `project-state/STATUS.md`,
`project-state/DECISIONS.md`, `project-state/ORCHESTRATOR.md`.
`web/src/lib/grade-model/aggregations/manual.ts` changes only if Stack answers Open items 1 with a rule;
if it does, it joins W-43's set as a new task beside task 11, with the rule's pinning case in
`aggregation.manual.test.ts`.

Who may touch what (disjoint): **W-41** the eight `scripts/` files named in §Workers only, not
`scripts/**` (Phase 15's W-38 owns `scripts/db-test.mjs`, `scripts/db-test.test.mjs`,
`scripts/package.json`, `scripts/package-lock.json` and `scripts/fixtures/db-test/**`), plus the
gitignored `mcp-server/dist/` build output in `C:/Users/estac/projects/bb2dash`, the checkout the
registration points at (a build only: no source change, no branch, no commit there, per DECISIONS
2026-09-15); **W-42** `db/migrations/105–109`, `db/tests/grading_invariants.sql`,
`db/tests/phase16_*.sql`, and `db/tests/phase10b_grade_model.sql` lines 167–168 only, after Phase 15's P-2
(task 10a); **W-43** the `web/` files above; **PM** every doc, `project-state/`,
`skills/inbox-apply/SKILL.md`, committing the verdict files the confined session writes, and carrying
task 10a's commit onto Phase 15's branch (§Seams). Workers
never touch `project-state/`.

### Seams

| With | The seam |
|---|---|
| Phase 15 | Every SQL check runs through its runner with brief 95's frozen CLI: `node scripts/db-test.mjs --only <file.sql>` (a `db/tests` basename), last line `db-test: passed <p>, failed <f>, units <n>`, exit 0 iff `f = 0` (P-99), as the `db_test_runner` role (P-100) over `BB2DASH_TEST_DB_URL` (B-42, **PROVISIONAL**, Phase 15's default; what each check becomes otherwise is §Stack's calls, B-42 row). Its rewritten `db/tests/phase10b_grade_model.sql` (P-2) and re-dated 10a fixture (P-30) are green before task 8's baseline. PM seam call (Stage C round 2): 105 is applied to prod in Session A only after Phase 15's 100–104 are on prod; the runner and test role come from Phase 15's branch until it merges (ORCHESTRATOR §6 Session A). **The conflict-safe seed.** 105's GEO recitation link shares a primary key with that file's seed at lines 167–168, which P-2 leaves alone (brief 95's P-2 rewrites that test file's lines 171–172 and its §4f), so once 105 is on prod every copy of the file that keeps the plain insert raises `unique_violation`: Phase 15's branch, `main` after 15 merges, and every branch cut from it until this phase merges (Phase 17's DoD and Phase 18's L2 gate run the full suite). Where it lands: task 10a's commit (W-42, on top of P-2, touching only that file) on this phase's branch, and the same commit cherry-picked by the PM onto `feat/db-hygiene-15` and pushed, so Phase 15's open PR carries it to `main` (named in that PR's body). When: after P-2 and before task 10, which waits for it; if Phase 15 has merged without it, the PM asks Stack before task 10. The text is a plain insert while 105 is absent, so it is correct on both sides of 105, and no migration changes, so the byte-identical rule is untouched. The seed is test data inside the runner's `rollback` and never exists on prod, so there is nothing for 105 to carry; nor can 105 make the old text safe, since any row on that key fails a plain insert. The generated recheck file is `db/tests/phase16_106_v1_recheck.sql` (PM seam call; brief 95 names the same file). Brief 95 exports `loadDsn()` / `openClient()` for a later Node script; this brief's checker is Python and emits a runner unit instead, so it imports nothing and needs no second credential |
| Phase 17 | Walks nothing here and touches no grades file (brief 97's Phase 16 seam). R-36's rule line is one of the two Phase 13 carry-ins shipped early (B-23, **PROVISIONAL**; brief 97 ships the favicon). Phase 17 owns the Inbox screens and does not edit `skills/inbox-apply/SKILL.md`. Surfacing the archived `FLAG for Stack` rows in the open Inbox (research 92 §1 item 6) is **scheduled nowhere in sprint 2** (R-57 in Phase 17 is why-notes only); here those asks reach Stack through 93 §5 B-9 and B-13 |
| Phase 18 | Its P-26 (`db/migrations/120_supersede_file_chains.sql`) closes the `bb_file` 2 → 151 chain; until it lands, the export's IST.323 syllabus cell resolves to 2 and §6 carries the fallback line naming `bb_file:151`. `courses.syllabus_path` for IST.323 still names `323Fall26V1.3.1.docx` (prod 2026-09-24); this phase writes neither `bb_files` nor `courses`. File week / session classification is R-67 (P-6) |
| Phase 14 | The launcher accepts a `docker` registration and an entry with no inline key (P-45; brief 100 task 17 builds that registration); 82's old task 13 (W-29, the Node twin) is this phase's task 3, and Phase 14 later only repoints the MCP lookup (R-34 seams; brief 100's Phase 16 seam). Its dev container is where confinement becomes OS-enforced |
| Phase 20 | Brief 101's W-62 edits the same `skills/inbox-apply/SKILL.md` (R-97, the vault path; a live bug, so it may land first) and checks that the installed copy `C:/Users/estac/.claude/skills/inbox-apply/SKILL.md` stays byte-identical to the committed file (`cmp`, brief 101). Whichever PR lands second merges `main` into its branch and re-applies its lines (never a rebase of a pushed branch; brief 101 §Seams says the same). The skill runs from the installed copy, so after this PR merges the PM copies the committed file over it (otherwise the new rule is not live) and `cmp` returns 0 whatever the order. The two edits touch different steps (Step 3 / Step 4 here, the vault path there) |
| Phase 22 | C-2's per-exam weights stay parked; any styling of the rule line is 22's: brief 103's W-70 restyles `web/src/components/grades/` (`GradedSoFarFigure.tsx` included) after this phase merges, since Phase 22 runs last |
| Stage D | P-5's comment and doc fixes (`web/src/lib/grade-model/aggregations/manual.ts:4`, `web/src/components/grades/CourseGradeCard.tsx:11-14`, STATUS's 13-point-column rows, found by content) land on the planning branch, which merges before this PR (R-32 seams) |
| Sprint 1 objects | `grade_column_links` (057: `grade_column_links_one_target` check, the `grade_column_links_same_course` trigger, cascade from components); `stage_assignments` (084: `confidence` is the overwrite switch, the out-of-term guard fires first); `apply_resolutions()` (042's shapes); the attention archive (090); `v_calendar_push_items` (060, last re-created in 068: a date change re-patches Google, a confidence change does not); `v_gradebook_latest` (047); the picker (`web/src/components/grades/LinkColumnControl.tsx`, `linkStates` in `web/src/lib/grade-model-view.ts`) |

### Must respect

* 2026-09-02 "Grading stored as declarative rules, not weight columns"
* 2026-09-02 "Facts (`assignments`) separated from state (`assignment_progress`)"
* 2026-09-02 "Every fact row carries `source` + `confidence`"
* 2026-09-09 "Workflow SOP: dev on branches, push per completed task, **one PR per phase**, merge only on Stack's word"
* 2026-09-10 "Parallel phases get **non-overlapping migration ranges** (Phase 8 = 026–029, Phase 9 = 030–039) allocated in the briefs"
* 2026-09-10 "Inbox resolutions carry a free-text `resolution_note` ("why") and are applied by the next transform, never directly; shapes: `conflict` `{accept}`, `stack_must_confirm`/`missing` `{value, value_type}`, `deadline`/`data_gap` `{dismissed}`"
* 2026-09-14 "**Every task carries an executable check** (test, SQL assertion, curl, screenshot diff) the worker runs itself, plus one demo line for the acceptance script; a task without a check is not a task"
* 2026-09-14 "a "Keep mine" answer stands until Blackboard's value changes (042)"
* 2026-09-14 "V-1 gains a **per-course questions block** (no-total courses, OCR-only files, week/session classification, ambiguous aggregations) answered by Stack inline; rows are decided from the materials, Stack may ask the professor and override; done = all seven courses signed off; verdict files carry a YAML machine block so a later automated pass can re-check" (to be narrowed to grading by P-6's row, task 1; the seven course ids sit in six verdict files, GEO.103's two in one)
* 2026-09-15 "Phase 10 migration range is **046–059**: 10a used 046–051 plus 052–056 for its review round, 057–058 are slack, **059 is held for V-1's reconciliation** and 10a never takes it" (to be superseded for 059 by the P-3 row, task 1, on Stack's B-16 answer or the adopted default)
* 2026-09-15 "An attendance column renders **among the item rows only when its linked assignment has a `component_id`** (`v_gradebook_latest.counts_toward_grade`); otherwise it sits in a collapsed "Attendance and bookkeeping columns" group with the letter and non-total calculated columns."
* 2026-09-15 "Parallel PM sessions never branch or commit in the shared checkout `C:/Users/estac/projects/bb2dash`; each phase branch is its **own worktree** (`bb2dash-wt-<phase>`) and the brief is edited there"
* 2026-09-15 "Calendar events are **timed at the due instant** (zero-length, `America/New_York`); a date-only due date becomes 11:59 PM that day, or the start of that day's class meeting for `project` / `exam` / `final_exam`"
* 2026-09-15 "R-16 dates are Inbox resolutions, not a migration: SITN presentation = **2026-11-04 15:45** (Stack's own choice; the syllabus group→date table has no 11/4 slot); IST.466 Major Project #1/#2 keep 10/20 and 11/17 `tentative` because the schedule lists both days of each pair without naming groups"
* 2026-09-15 "The consent script loads the service key from `~/.claude.json` via node, opens the browser through `explorer.exe`, and sends an `sb_secret_` key as `apikey` only"
* 2026-09-16 "**V-1 grading validation is stubbed for later; it no longer gates Phase 10b.**"
* 2026-09-16 "Stack's column→part links live in **`grade_column_links`** (057), an owner table no sync touches; the model reads it before `assignments.component_id`; "Not graded" is a link too; the picker offers **leaf parts only**; V-1 folds the links into `assignments` later"
* 2026-09-16 "a picker link counts as confirmed; zero-point items never mute; a placeholder (no Blackboard column) cannot be confirmed from the app"
* 2026-09-16 "`grade_components.normalize_to` is the **component's** point target, not a per-item denominator"
* 2026-09-16 "Screens take what-if targets, muted parts and dropped placeholders from the engine's **`itemStates()`**, never from their own copy of the rules" (`itemStates()` was deleted in 319a532; the principle binds the rule line, which reads its weights through the engine's `usableWeights`)
* 2026-09-16 "$0 and the Windows path stays as fallback until acceptance"
* 2026-09-16 "IST.323 extra credit raises earned points, never possible: the course can read above 100 %"
* 2026-09-16 "**three carried to Phase 13** as named exceptions to its no-layout-change rule (phone-width overflow, per-exam rank weights, favicon)"
* 2026-09-17 "An unscored hand-graded part no longer hides a course's figure and an unsure link no longer drops graded scores; both are stated instead: parts a figure does not cover are named under it, and a scored column linked to nothing is named with a pointer to the "Counts toward…" picker. Removed: what-if, target solver, saved scenarios (`grade_scenarios` stays in the DB, unused), placeholder rows, the two projections and the agrees-with-Blackboard sentence. Kept: every per-part aggregation rule, the picker, `ScoreHistory`, `v_gradebook_history`"
* 2026-09-17 "Everything else in `assignment_progress` / `reading_progress` is still never written by a sync"
* 2026-09-17 "**A gradebook column shared on purpose is not a conflict** (084): when every assignment matched to a column already carries that `bb_column_id`, `stage_assignments` restamps them all (075) and raises nothing"
* 2026-09-22 "**Free-text confirmations are applied by the worker, following the course's already-confirmed rows** (component, submission channel, type), never by inventing a series or merging rows. A 0-point column that Blackboard says does not count toward the grade is confirmed with no component."
* 2026-09-22 "It flags feature changes and merges, raises new questions through `raise_attention()`, and never resolves an open row"
* 2026-09-22 "Seven questions only Stack can answer are archived with a `FLAG for Stack` in the note and listed in the run's `result.flagged` (SITN group, individual-presentation slot, Ethics teammates, the two Major Case days, the three IST.466 attendance columns)"
* 2026-09-22 "**IST.466: Stack is Ethics Team 3 and Major Case Group 2** (Synchrony 10/20, SU IT 11/17). `courses.group_notes` and the two major-project rows (`group_key`, descriptions) corrected to match"
* 2026-09-22 "**Stack authorized the worker to answer every open Inbox item on his behalf, from context, or mark it outdated.**"
* 2026-09-22 "**IST.466's 2021 due dates are stale column metadata, not dates:** the professor copied the course shell and never updated the gradebook columns' due dates."
* 2026-09-22 "**Sprint 1 closed; Phase 13 (styling, R-21) skipped, not cancelled.** More development phases come first; C-1..C-3 stay parked in `docs/planning/sprint-2/parked/81_PHASE13_styling.md`"
* 2026-09-22 "**Planning documents live in one folder per sprint** (`docs/planning/sprint-N-<name>/` with `briefs / research / verification / evidence / walks / parked`); file names and numbers never change, only their folder"
* 2026-09-22 "**Sprint 2 planning follows the Phase 12b method** (list → ids → triage → researchers → one question batch → briefs); migration numbering continues from 091"
* 2026-09-23 "**Sprint 2 planning proceeds stage to stage without a stop**; the PM stops only where Stack's input is required (his §3 fields, the question batch, the phase-plan approval) and otherwise proceeds on stated defaults, each recorded here when adopted"
* 2026-09-24 "STATUS's known-issue rows that sprint 1 fixed are struck through with the fixing migration named, not deleted"
* Frozen answers that are not DECISIONS rows: 70_MVP §1.5 "**Grading only** (schemes, components, assignment links). Dates stay with Phase 9's transform." and "**Decide from materials**; Stack may ask the professor himself and override; unresolved rows stay tentative."; brief 63 §Method step 3 "If the materials are silent, say **not in materials** — never fill the gap from general knowledge."; 82's decisions #14 "PowerShell scripts are rewritten cross-platform" and #16 "Guardrails: **$0**; today's non-Docker Windows path keeps working until acceptance; service key never in an image; "build it so that it is migratable later""; CLAUDE.md "No fabricated numbers anywhere", "No what-if, no projections.", "service key never in a browser or the repo".

## MVP (in Stack's words)

Stack's own words on this work are few and are quoted with their sources. Typed by him: V-1 is "not a
product feature as much as a data accuracy problem" (DECISIONS 2026-09-16, line 124); "graded so far
should be the standard for what grade is showing" (80c intake, P-grades-1); "We will be calculating
blackboard grades from the data scraped from blackboard on syncs only. determinism emphasized here."
(80c intake, P-grades-3). Recorded by the PM from his answers, not typed by him (70_MVP §1.5, which 91
labels "Stack's frozen answers; not a DECISIONS row"): "**Grading only** (schemes, components,
assignment links)" and "**Decide from materials**; Stack may ask the professor himself and override;
unresolved rows stay tentative." 91 §3 holds no grades item of his. *PM's wording, built from those and
the 93 §5 B defaults, for Stack to confirm or rewrite:* "I sit each of my six courses once, with a session that can see only the
materials we collected, and make every call it cannot settle from them. Afterwards every grading row
the figure uses says where it came from, IST.323's proposal column counts toward the right part before
it is graded on December 3, GEO.103 no longer shows me a 0.0 % I never earned, ECN.304 tells me how its
exams are weighted, and the checks that prove all of this rerun whenever the tests run."

## Definition of done

SOP gates (CLAUDE.md Workflow SOP and DECISIONS 2026-09-09 / 2026-09-15):

- [ ] Work on `feat/grades-v1-16` in its own worktree `bb2dash-wt-16` (workers in theirs), never on
      `main` and never in `C:/Users/estac/projects/bb2dash`; every task committed and pushed as it
      completes; one PR for the phase; merge and prod deploy only on Stack's word in that conversation.
- [ ] Tests pass: `web/`: `npm run typecheck`, `npm run build` and `npx vitest run` green; the vitest count not below
      `origin/main`'s at the phase cut (recorded in the PR). `mcp-server/`: `npm test` green after the
      rebuild (no source change). `scripts/`: `node --test scripts/validate-grading.test.mjs
      scripts/export-grading-schema.test.mjs` → 0 failures and
      `uv run --with pyyaml --with pytest pytest scripts/test_v1_recheck.py` → 0 failed. `desktop/` untouched.
- [ ] Every `db/tests/*.sql` through Phase 15's runner: `node scripts/db-test.mjs` → exit 0 and a last
      line `db-test: passed <n>, failed 0, units <n>`, this phase's four files included.
- [ ] Invariants run **before** 105 and **after** 106; both outputs pasted in the PR.
- [ ] 105 and 106 applied under their file names, repo files byte-identical, dry-run output in the PR.
- [ ] `/code-review main high`: CRITICAL and HIGH cleared (106 is reviewed before it is applied).
- [ ] `/security-review` (required: the launcher copies an entry holding the service key into a temp
      file; the checker turns document text into executed SQL; 105 writes an owner table).
- [ ] STATUS, DECISIONS and ORCHESTRATOR updated in the PR; intake S2-carry-2 and 81's C-2 row closed.
- [ ] PR open with a Vercel preview (the rule line is visual; Stack sees it before merge).
- [ ] 106 applied and the PR open by 2026-11-20; merged before the 2026-11-30 freeze, on Stack's word.

Stack's acceptance script:

1. He reads his B-9..B-16 answers in DECISIONS, dated the day he gave them.
2. In `C:/Users/estac/projects/bb2dash-wt-16` he runs `.\scripts\validate-grading.ps1 IST.323`, types
   `/mcp` (only `bb2dash`) and `/permissions` (the `.env` and `course context` denies), asks it to read
   `.env` (refused) and to write a file under `briefs/` (a prompt; he answers No).
3. Sitting 1, IST.323: he walks every open row and the questions block, the 13-point column included
   (B-12); the session writes `96b_GRADING_VALIDATION_IST.323.md`; he stops.
4. Sittings 2–6 the same, one a week, none in weeks 9 and 11: IST.466, IST.352, ECN.304, GEO.103, IST.471.
5. He reads `96d_GRADING_VALIDATION_SUMMARY.md`: counts, corrections as plain statements, professor
   questions with status, the rows left `tentative` and what a sync may overwrite on them.
6. In 96e, screenshot 05 (taken after 105) shows GEO.103 reading "Nothing that counts toward the grade
   has been graded yet." where the engine worked out 0.0 % before 105 (by hand; P-1 notes no browser ever showed it).
7. On the PR's preview, `/grades` and ECN.304's Grades tab show the rule line under the figure; Home's
   ECN.304 card shows none.
8. On `/planner`, week of 2026-11-02, the SITN presentation sits on Wed 11/4 at 3:45 PM, and the same
   event is on his Google calendar.
9. After ECN.304 Exam 1 posts and its column is linked, Exams is counted and the rule line still says
   the exams are averaged until all 3 are graded.
10. He reads the before / after invariant output in the PR and says "merge".

What proves each item:

* **R-29**: 105's test green (confidence, notes, the replay keeps 2026-10-20); screenshot 07; his B-9 row.
* **R-30**: every named defect (the IST.323 shared column, the three component-less rows, the eight
  unsure links, nine once 105 returns major-project-1 to `tentative`, the 18 null-point placeholders;
  counts read from prod 2026-09-24) has a machine-block row, and `phase16_106_v1_recheck.sql` passes.
* **R-31**: six `96b` files pass `--check`; `--summary --compare 96d` exits 0; 18 spot-check rows in 96d.
* **R-32**: 106 applied; `grading_invariants.sql` 0 FAIL before and after; `phase16_106` test green.
* **R-33**: P-75's DECISIONS row; the SKILL.md rule; invariant F at ceiling 0.
* **R-34**: `validate-grading.test.mjs` green; screenshots 01–04.
* **R-35**: the export's five §0 counts equal prod's on the day it is generated (task 15); `scripts/export-grading-schema.sql` committed.
* **R-36**: the three vitest files green; screenshots 06 and 08.
* **P-1**: 105's two excluded links; screenshot 05. **P-3, P-4, P-6, P-75**: the four tagged DECISIONS rows.
* **P-66**: the three named pinning cases green. **P-67**: pytest green and `phase16_106_v1_recheck.sql` green.
* **P-68**: the launcher test asserts `--restricted` and `--tools Read,Edit,Write,Glob,Grep` present and
  no `Write(` rule. **P-74**: the
  export's static test green.

## Task list

Runner commands are Phase 15's frozen CLI (brief 95): `node scripts/db-test.mjs --only <file.sql>` with a
`db/tests` basename, which passes when it exits 0 and its last line reads `db-test: passed 1, failed 0,
units 1` (written below as "runner `--only <file>` → pass"; if Stack answers B-42 otherwise, §Stack's
calls, B-42 row, says what each becomes). Web commands run in `web/`. Screenshots go to
`docs/planning/sprint-2/walks/walk-16/` and are listed in `docs/planning/sprint-2/walks/96e_PHASE16_WALK.md`.
Check kinds: (a) a named test file and its exact command; (b) SQL with its expected value; (c) a
screenshot path and what must be visible in it; (d) a count with its command. Inside the table, `\|` is
the markdown escape for `|` (a shell pipe, a `grep -E` alternation or a literal pipe in a row shape);
type `|` when running a command.

| # | task | covers | owner | deterministic check | demo line for Stack |
|---|---|---|---|---|---|
| 1 | Four DECISIONS rows before sitting 1, each tagged `(Phase 16, <id>)`: P-3 (106 is V-1's migration, 059 unused, "Not graded" stays a `grade_column_links` row, the fold writes `component_id` only and deletes no link); P-75 (the citation string and where it lives); P-6 (the questions block is grading only; OCR moot: file 62 OCR'd 2026-09-03, file 17 duplicates 15; classification goes to R-67); P-4 (the 12b catch-up for DECISIONS lines 22, 77, 81, 89, 125, 128, 133, 134, 135, 136). P-3 and P-75 rest on B-16 and B-14: written with Stack's answers, or, if he has not answered by sitting 1, as adopted defaults that say PROVISIONAL (DECISIONS 2026-09-23) | P-3, P-4, P-6, P-75, R-33 | PM | (d) `grep -cE "\(Phase 16, (P-3\|P-4\|P-6\|P-75)\)" project-state/DECISIONS.md` → 4 | "The rules my sittings write against are in the log before I sit." |
| 2 | `skills/inbox-apply/SKILL.md`: Step 3 heading 5 asks for the `bb_file:<id>#unit:<n>` form; Step 4 gains the rule that an answer which confirms or links an assignment appends the citation string to `source_ref` | R-33, P-75 | PM | (d) `grep -c "bb_file:<id>#unit:<n>" skills/inbox-apply/SKILL.md` → 2, and `sed -n '/^## Step 4/,/^## Step 5/p' skills/inbox-apply/SKILL.md \| grep -c "bb_file:<id>#unit:<n>"` → 1 (both 0 on `main` a5042fa) | "An Inbox answer now records where it came from." |
| 3 | Launcher Node twin and the `.ps1` wrapper, to the Contract; the prompt names 96a / 96b / 96c | R-34, P-68 | W-41 | (a) `node --test --test-reporter=tap scripts/validate-grading.test.mjs` → exit 0 and a line `# fail 0` (cases: duplicate-key JSON parses; no `bb2dash` entry → named error; missing node build → named error, both for `command` = `node` and for `command` = `C:/Program Files/nodejs/node.exe`; `docker` entry accepted with no file check; argv has `--restricted`, and `--tools` followed by the one element `Read,Edit,Write,Glob,Grep`, and no `Write(`; argv has the `Edit(...96b_GRADING_VALIDATION_*)` rule and the three `Read(...)` denies; the prompt contains `96a_GRADING_SCHEMA_EXPORT_`, `96b_GRADING_VALIDATION_` and `96c_V1_VERDICT_TEMPLATE.md`; temp file gone after success and after a thrown spawn); (d) `grep -c "validate-grading.mjs" scripts/validate-grading.ps1` → 1 | "The command from sprint 1 starts again." |
| 4 | Rebuild `mcp-server/dist` in the checkout the registration points at; dry run | R-34 | W-41 | (d) `npm --prefix C:/Users/estac/projects/bb2dash/mcp-server run build` → exit 0, then `node scripts/validate-grading.mjs --dry-run IST.323` → exit 0 with the line `server: bb2dash (build found)` | — |
| 5 | `scripts/export-grading-schema.sql` and its static test | R-35, P-74 | W-41 | (a) `node --test --test-reporter=tap scripts/export-grading-schema.test.mjs` → exit 0 and a line `# fail 0` (asserts the six section headings and the names `ai_policy`, `count_expected`, `drop_lowest`, `parent_id`, `bb_column_id`, `grade_column_links`, `counts_toward_grade`, `America/New_York`, `superseded_by`) | — |
| 6 | `scripts/v1_recheck.py` (`--check`, `--summary --compare`, `--emit-sql`) with `scripts/fixtures/v1_verdict_fixture.md` | R-31, R-33, P-67, P-75 | W-41 | (a) `uv run --with pyyaml --with pytest pytest scripts/test_v1_recheck.py` → exit 0, no `failed` in the summary line (includes: a second citation dialect rejected; `differs` without a call rejected; a `recheck` holding `update` rejected; the emitted SQL has one block per rechecked entry, so two rechecked entries on one target row give two blocks, starts with `begin;`, ends with `rollback;`, and its last select ends in `: PASS`; the counts are per distinct row: two `matches` entries on one `grade_components` row give citation-only 1, a `matches` and a `change_to` entry on one row give correction 1 and citation-only 0, and a `grade_column_links` row with only `matches` entries is in neither; a `mark_ungraded` entry on a `grade_column_links` row whose `value` equals its `stored` gives already applied 1, correction 0 and citation-only 0, with already applied on its own line of `--summary`) | — |
| 7 | `docs/planning/sprint-2/evidence/96c_V1_VERDICT_TEMPLATE.md` with one worked row; brief 63's pointer lines, found by content (the launcher prompt is W-41's, task 3) | R-31, R-35, P-6 | PM | (d) `uv run --with pyyaml python scripts/v1_recheck.py --check docs/planning/sprint-2/evidence/96c_V1_VERDICT_TEMPLATE.md` → exit 0 and `errors: 0`; `grep -cE "96a_GRADING_SCHEMA_EXPORT\|96b_GRADING_VALIDATION\|96c_V1_VERDICT_TEMPLATE\|96d_GRADING_VALIDATION_SUMMARY" docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md` → ≥ 8 (0 at 6a085e2) | — |
| 8 | `db/tests/grading_invariants.sql`: A top-level non-extra-credit `sum(weight_pct) = 100` for `weighted_pct`; B top-level `sum(points) = total_points` and the non-extra-credit sum `= graded_out_of` for `points`; C children sum to their parent; E every `component_id` in the same scheme course via `coalesce(parent_course_id, id)`; D (ratchet) `points_possible > 0` with no component only under an excluded link or an id in `D_EXCEPTIONS`; F (ratchet) = confirmed `grading_schemes` and confirmed `grade_components` whose `notes`, plus confirmed `assignments` with `component_id is not null and points_possible > 0` whose `source_ref`, match neither `bb_file:[0-9]+#unit:[0-9]+` nor `STACK_OVERRIDE`; F ≤ `F_CEILING`, declared in the file as `F_CEILING constant int := <n>;`. Exact equality, no tolerance; qualitative schemes out of scope; expected sides read from `grading_schemes` / `grade_components`, never re-summed from the view under test | R-32, R-33 | W-42 | (a) runner `--only grading_invariants.sql` → pass, with `D_EXCEPTIONS` = `IST.466/class-participation`, `IST.466/attendance-35625001` and `F_CEILING` = F on the baseline day; (b) `select (select count(*) from grading_schemes where confidence = 'confirmed' and coalesce(notes,'') !~ 'bb_file:[0-9]+#unit:[0-9]+' and coalesce(notes,'') !~ 'STACK_OVERRIDE'), (select count(*) from grade_components where confidence = 'confirmed' and coalesce(notes,'') !~ 'bb_file:[0-9]+#unit:[0-9]+' and coalesce(notes,'') !~ 'STACK_OVERRIDE'), (select count(*) from assignments where confidence = 'confirmed' and component_id is not null and points_possible > 0 and coalesce(source_ref,'') !~ 'bb_file:[0-9]+#unit:[0-9]+' and coalesce(source_ref,'') !~ 'STACK_OVERRIDE')` on the baseline day → three integers whose sum equals the `F_CEILING` written in the file (6, 35, 43, sum 84, on 2026-09-24 and again on 2026-09-27) | — |
| 9 | 105 and `db/tests/phase16_105_pre_sitting_fixes.sql` (asserts: major-project-1 `tentative`; a `stage_assignments` replay of the newest registered crawl keeps its `due_date` at 2026-10-20 and raises 0 rows on its ref; component 24's notes hold "Major Case Group #2" and not "Major Case Group #3"; 2 excluded links on the GEO columns) | R-29, R-30, P-1 | W-42 | (a) runner `--only phase16_105_pre_sitting_fixes.sql` → pass (run after task 10) | — |
| 10 | The PM dry-runs, then applies 105 under its name, only once Phase 15's 100–104 are on prod and task 10a's commit is on Phase 15's branch (§Seams, Phase 15) | R-29, P-1 | PM | (b) before the dry run: `select count(*) from supabase_migrations.schema_migrations where name ~ '^10[0-4]_'` → the number printed by `git ls-tree --name-only origin/feat/db-hygiene-15 db/migrations/ \| grep -cE "/10[0-4]_"` (`origin/main` once 15 has merged); after: `select count(*) from supabase_migrations.schema_migrations where name = '105_v1_pre_sitting_fixes'` → 1; `select count(*) from grade_column_links where column_id in ('_3602583_1','_3602445_1') and excluded and component_id is null` → 2; `select confidence from assignments where id = 'IST.466/major-project-1-synchrony'` → `tentative` | "GEO stops showing me a zero." |
| 10a | `db/tests/phase10b_grade_model.sql` lines 167–168 made conflict-safe: 105 puts a row on the same primary key (057: `primary key (course_id, column_id)`), so today's plain insert of `('GEO.103.recitation', '_3602445_1', 5)` raises `unique_violation` once 105 is applied. New text: `insert into grade_column_links (course_id, column_id, component_id, excluded) values ('GEO.103.recitation', '_3602445_1', 5, false) on conflict (course_id, column_id) do update set component_id = excluded.component_id, excluded = false;`, with `values (…) on conflict …;` kept on one line, so §4c's component-5 override assertion (lines 228–233) holds on both sides of 105. Edited on top of Phase 15's P-2 version of the file (merge `feat/db-hygiene-15` into `feat/grades-v1-16-db` first while 15 is unmerged) as one commit touching only this file; P-2 rewrites lines 171–172 and §4f only, so the two edits do not overlap. The PM cherry-picks that commit onto `feat/db-hygiene-15` and pushes it before task 10 (§Seams, Phase 15) | P-1, R-30 | W-42 writes; PM carries it to Phase 15's branch | (d) before task 10: `git show origin/feat/db-hygiene-15:db/tests/phase10b_grade_model.sql \| grep -cF "'_3602445_1', 5, false) on conflict"` → 1 (0 on `main` a5042fa); (a) after task 10: runner `--only phase10b_grade_model.sql` → pass, on this phase's branch and on `feat/db-hygiene-15` | — |
| 10b | Walk, pre-sitting shots, written into 96e: 05 once task 10 has applied 105, 06 once task 12's rule line is on a preview | P-1, R-36 | PM | (b) precondition for 05: `select count(*) from v_grade_model_items where scheme_course_id = 'GEO.103.lecture' and score is not null and not excluded` → 0; (c) `05-grades-geo-nothing-graded.png`: production `/grades`, GEO.103 block, "Graded so far" and "Nothing that counts toward the grade has been graded yet.", no "0.0%"; `06-grades-ecn-rank-rule.png`: preview `/grades`, ECN.304 block, the rule line verbatim | "I saw GEO without a zero and ECN's rule line." |
| 11 | P-66 pinning cases: "null score is not graded", "posted zero is graded zero", "GEO absences excluded → nothing_graded" (the two prod rows as a fixture) | P-66, P-1, R-30 | W-43 | (a) `npx vitest run --reporter=verbose test/grade-model/aggregation.manual.test.ts test/graded-so-far.test.ts` → exit 0, and the same command piped to `grep -cE "null score is not graded\|posted zero is graded zero\|GEO absences excluded"` → 3 (the default reporter does not print passing test names) | — |
| 12 | R-36 rule line: `usableWeights` exported, `RankRule` and `rankRules` in `graded-so-far.ts`, `rankRuleText` and the sentence in `GradedSoFarFigure.tsx` | R-36 | W-43 | (a) `npx vitest run test/graded-so-far.test.ts test/GradedSoFarFigure.test.tsx test/grade-model/aggregation.rank-weighted.test.ts` → 0 failures (cases: both strings; `compact` renders none; a malformed weight list renders none; weights come from the component) | "ECN.304 tells me how its exams are weighted." |
| 13 | Rule-line guards: no literal weights, nothing in the table rows | R-36 | W-43 | (d) `grep -rl "30 / 25 / 20" web/src \| wc -l` → 0, and `grep -c "rankRuleText" web/src/components/grades/GradebookTable.tsx` → 0 | — |
| 14 | Web suites on the worker branch | R-36, P-66 | W-43 | (a) `npm run typecheck && npm run build && npx vitest run` → exit 0; the `Tests  <N> passed` line's N ≥ the N recorded from `origin/main` at the cut | — |
| 15 | The export generated from prod before the stop, named with its generation date, and again on each sitting day if prod moved | R-35 | PM | (b) `select (select count(*) from grading_schemes), (select count(*) from grade_components), (select count(*) from assignments), (select count(*) from grade_column_links), (select count(*) from v_gradebook_latest)` equals §0's five counts on the day it is generated (6 / 35 / 88 / 4 / 58 read on 2026-09-27; the links figure is 6 once 105 is applied); (d) `grep -c "bb_file:151" docs/planning/sprint-2/evidence/96a_GRADING_SCHEMA_EXPORT_<generation date>.md` → ≥ 1 | — |
| 16 | First launch recorded | R-34, P-68 | PM + Stack | (c) `01-launcher-mcp.png`: `/mcp` lists one server, `bb2dash`, connected; `02-launcher-permissions.png`: the denies `Read(./.env*)` and `Read(./course context/**)` and the `Edit(...96b_GRADING_VALIDATION_*)` allow; `03-launcher-env-refused.png`: the read of `.env` refused; `04-launcher-write-outside.png`: a permission prompt for `docs/planning/sprint-2/briefs/x.md` | "The session sees only my materials." |
| 17 | Sitting 1, IST.323 (the 13-point column; `presentation-choice` as `mark_ungraded`, `BOOKKEEPING_COLUMN`) | R-30, R-31, R-33 | Stack + confined session | (d) `uv run --with pyyaml python scripts/v1_recheck.py --check docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_IST.323.md` → exit 0, `differs without call: 0` | "I sat IST.323 and made every call." |
| 18 | Three citations per sitting re-found with `search_materials`, one row each in 96d, shaped `\| spot-<COURSE>-<n> \| <row id> \| <quote> \| <cited bb_file> \| <returned bb_file> \| match \|` (or `mismatch`); a mismatch goes back to that course's verdict file before task 21 | R-31, R-33 | PM | (d) `grep -c "^\| spot-" docs/planning/sprint-2/verification/96d_GRADING_VALIDATION_SUMMARY.md` → 18 after sitting 6, and `grep "^\| spot-" docs/planning/sprint-2/verification/96d_GRADING_VALIDATION_SUMMARY.md \| grep -c "\| mismatch \|"` → 0 before task 21 | — |
| 19 | Sittings 2–6: IST.466 (B-13; ai-team-assignment), IST.352, ECN.304 (Exam 1's column if posted), GEO.103 lecture + recitation (B-10; carbon-footprint), IST.471 (a7) | R-30, R-31, R-33 | Stack + confined session | (d) `ls docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*.md \| wc -l` → 6; `for f in docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*.md; do uv run --with pyyaml python scripts/v1_recheck.py --check "$f" \|\| echo BAD; done \| grep -c BAD` → 0; `grep -c "GEO.103.recitation" docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_GEO.103.md` → ≥ 1 (seven course ids, six files) | "All six courses are signed off." |
| 20 | Summary 96d: counts (already applied among them), corrections as plain statements (each `grade_column_links` insert named as an insert), professor questions with status, corrections already made by `/inbox-apply` and the picker (found before `--summary` runs by re-running each `change_to` / `mark_ungraded` entry's `recheck` on prod with `execute_sql`, a read; where prod moved since the sitting, the PM sets that entry's `stored` to prod's value), rows left `tentative` with the overwrite consequence | R-31, R-32 | PM | (d) `uv run --with pyyaml python scripts/v1_recheck.py --summary docs/planning/sprint-2/verification/96b_GRADING_VALIDATION_*.md --compare docs/planning/sprint-2/verification/96d_GRADING_VALIDATION_SUMMARY.md` → exit 0 | "The summary reads back what I decided." |
| 21 | 106 and `db/tests/phase16_106_grading_reconciliation.sql` (one assertion per 96d correction; under B-12, components 18 / 19 = 13 / 1) | R-30, R-32, R-33, P-3 | W-42 writes; PM dry-runs | W-42's: (d) `grep -cE "^(begin\|rollback\|commit);" db/migrations/106_grading_reconciliation.sql` → 0 (no file in `db/migrations` has a top-level transaction statement; the PM's dry run supplies the wrapper). The PM's: (b) dry run: the file inside `begin; … rollback;` in one `execute_sql` call → no exception (its guards include the per-row changed-row count of §Tables and migrations' 106 row, which raises otherwise), output pasted in the PR | — |
| 22 | `/code-review` on 106, then the PM applies it | R-32 | PM | (b) `select count(*) from supabase_migrations.schema_migrations where name = '106_grading_reconciliation'` → 1; then (a) runner `--only phase16_106_grading_reconciliation.sql` → pass | — |
| 23 | Invariants after: `F_CEILING` = 0; `D_EXCEPTIONS` = only the ids Stack left unlinked, each with its B-13 reason | R-32, R-33 | W-42 | (a) runner `--only grading_invariants.sql` → pass; (d) `grep -c "F_CEILING constant int := 0;" db/tests/grading_invariants.sql` → 1 | "Every checked row cites its source." |
| 24 | Generate `db/tests/phase16_106_v1_recheck.sql` from the six verdict files with `--emit-sql` | P-67, R-31 | W-42 | (a) runner `--only phase16_106_v1_recheck.sql` → pass | — |
| 25 | IST.323 case names in `aggregation.sum.test.ts` match the re-cut (B-12); `web/test/grade-model/parent-links.test.ts` is left alone (its 11 / 9 tree is synthetic and its names claim no real split) | R-30 | W-43 | (d) `grep -cE "completed log \(2\) missing\|proposal 11 \+ log 3" web/test/grade-model/aggregation.sum.test.ts` → 0 (2 on `main` a5042fa), and `npx vitest run test/grade-model/aggregation.sum.test.ts` → 0 failures | — |
| 26 | Walk, part 1, written into 96e | R-29 | PM | (c) `07-planner-sitn-2026-11-04.png`: `/planner` week of 2026-11-02, the IST 323 SITN group presentation in Wed 11/4 at 3:45 PM | "I saw my SITN date." |
| 27 | Walk, part 2, once ECN.304 Exam 1 posts and is linked | R-36 | PM | (b) `select count(*) from v_grade_model_items where scheme_course_id = 'ECN.304' and component_id = 3 and score is not null` → 1; (c) `08-grades-ecn-exam1.png`: the ECN.304 block with the rule line, and "Exams (rank-weighted)" absent from "Not counted yet:"; (d) `ls docs/planning/sprint-2/walks/walk-16/*.png \| wc -l` → 8 | "Exam 1 counts; the rule still says averaged." |
| 28 | Docs: STATUS (rows this phase fixes struck through with the migration named, per 2026-09-24), DECISIONS (Stack's B answers, if not yet recorded), ORCHESTRATOR; intake S2-carry-2; 81's C-2 row (brief 63 is task 7's) | all | PM | (d) `git diff --name-only origin/main...feat/grades-v1-16 -- project-state/ \| wc -l` → 3, and `git diff --name-only origin/main...feat/grades-v1-16 -- docs/planning/sprint-2/90_SPRINT2_INTAKE.md docs/planning/sprint-2/parked/81_PHASE13_styling.md \| wc -l` → 2 | — |
| 29 | Gates and PR: `/code-review main high`, `/security-review`, PR with preview | all | PM | (d) `gh pr view <n> --json state -q .state` → `OPEN`; `gh pr checks <n> \| grep -cE "^Vercel[[:space:]]+pass"` → 1; `gh pr checks <n> \| grep -c fail` → 0 (the repo has no CI; Vercel's check is the one PR #22 carried) | "Ready when you say so." |

Order: 1–15 run before the stop (Session A stops with the exact `validate-grading` command on Stack's
clipboard); 16 is recorded at his first launch, before sitting 1; 17–20 follow Stack's calendar; 21–29
follow sitting 6, except 27, which follows ECN.304 Exam 1. Task 10 waits for Phase 15's 100–104 on prod
and for task 10a's commit on Phase 15's branch (§Seams). Tasks 11–14 and screenshots 05 and 06 (task
10b) need nothing from the sittings: 11–14 run beside 3–10; 05 is taken once task 10 has applied 105,
06 once task 12's rule line is on a preview. Task 1's P-3 and P-75 rows wait for Stack's B-16 / B-14 answers or
their recorded adoption; nothing else in 1–15 waits on him.

## Workers

| id | stream | branch | worktree | owns | tasks |
|---|---|---|---|---|---|
| W-41 | V-1 tooling | `feat/grades-v1-16-scripts` | `bb2dash-wt-16-scripts` | `scripts/validate-grading.mjs`, `scripts/validate-grading.test.mjs`, `scripts/validate-grading.ps1`, `scripts/export-grading-schema.sql`, `scripts/export-grading-schema.test.mjs`, `scripts/v1_recheck.py`, `scripts/test_v1_recheck.py`, `scripts/fixtures/v1_verdict_fixture.md`; the gitignored `mcp-server/dist/` in `C:/Users/estac/projects/bb2dash` (build only, no source, no commit) | 3, 4, 5, 6 |
| W-42 | db | `feat/grades-v1-16-db` | `bb2dash-wt-16-db` | `db/migrations/105_v1_pre_sitting_fixes.sql`, `db/migrations/106_grading_reconciliation.sql`, `db/migrations/107_db_test_runner_grants_phase16.sql`, `db/migrations/108_grading_reconciliation_fixes.sql` and `db/migrations/109_grading_reconciliation_after_freeze.sql` if used; `db/tests/grading_invariants.sql`, `db/tests/phase16_105_pre_sitting_fixes.sql`, `db/tests/phase16_106_grading_reconciliation.sql`, `db/tests/phase16_106_v1_recheck.sql`; `db/tests/phase10b_grade_model.sql` lines 167–168 only (task 10a, after Phase 15's P-2) | 8, 9, 10a, 21, 23, 24 |
| W-43 | web rule line and pins | `feat/grades-v1-16-web` | `bb2dash-wt-16-web` | `web/src/lib/graded-so-far.ts`, `web/src/components/grades/GradedSoFarFigure.tsx`, `web/src/lib/grade-model/aggregations/rank-weighted.ts` (export only), `web/test/graded-so-far.test.ts`, `web/test/GradedSoFarFigure.test.tsx`, `web/test/grade-model/aggregation.rank-weighted.test.ts`, `web/test/grade-model/aggregation.manual.test.ts`, `web/test/grade-model/aggregation.sum.test.ts`; `web/src/lib/grade-model/aggregations/manual.ts` only if Open items 1 brings a rule | 11, 12, 13, 14, 25 |

The three file sets are disjoint from each other, from the PM's (docs, `project-state/`,
`skills/inbox-apply/SKILL.md`) and from every other sprint-2 phase's (brief 95's `scripts/db-test*` and
`scripts/package*.json`; brief 97 touches no grades file; brief 101's W-62 shares only the PM-owned
SKILL.md, per §Seams; brief 103's W-70 restyles `web/src/components/grades/`, `GradedSoFarFigure.tsx`
included, after this phase merges, since Phase 22 runs last), with one sequenced exception:
`db/tests/phase10b_grade_model.sql`, which brief 95's W-39 rewrites first (P-2: lines 171–172 and §4f)
and W-42 edits after it at lines 167–168 only (task 10a), a commit the PM also carries onto Phase 15's
branch before task 10. Workers are Opus, cut from the phase branch; they commit and push per task (`feat(R-36): …`,
`test(P-66): …`), never touch `project-state/`, and never apply a migration: the PM dry-runs and
applies. W-42's tasks 21, 23 and 24 wait for sitting 6 and task 20; the worker is spawned again then,
with 96d in hand. The confined session is not a worker: it writes only the verdict files, in the phase
worktree, and the PM commits them after each sitting.

## Out of scope

* Date facts beyond R-29's rows: Phase 9's transform (70_MVP §1.5 "Grading only"); calendar push logic.
* Per-exam rank weights (C-2's M half) and any styling of the rule line: parked, Phase 22.
* An engine split for the shared IST.323 column (B-12's L option): a later phase, if Stack picks it.
* `bb_files` supersession (2 → 151, P-26), `courses.syllabus_path`, file week / session classification
  (R-67), OCR of image-only files (R-61): Phase 18.
* Inbox screens and the "Apply answers now" control (R-42): Phase 17.
* Showing the archived `FLAG for Stack` rows in the open Inbox: no sprint-2 requirement schedules it
  (research 92 §1 item 6 is a note, not a requirement); the asks reach Stack through 93 §5 B-9 / B-13.
* `/inbox-apply` writing `assignment_progress` (B-59) and P-5's comment fixes: Stage D.
* The Linux dev container and an OS-enforced sandbox for the confined session: Phase 14 (R-92).
* Dropping `grade_scenarios` (91 §5 row 7), widening `numeric(9,3)` (D-14), what-if and projections (D-11).
* Home's course card and `v_grade_model_items`: unchanged.

## Open items for Stack

Every "Default" below is **PROVISIONAL**: the PM builds on it under DECISIONS 2026-09-23 and records it
there when adopted; Stack's answer replaces it and is dated the day he gives it.

1. **B-10's engine half has nothing to key on.** Research 92 read `manual.ts` as unable to tell
   "posted a zero" from "nothing posted". Prod on 2026-09-24 shows both GEO columns carry a **posted**
   0.000 (`_3602583_1`: `is_override` true, `manual_score` 0.000; `_3602445_1`: attempt `COMPLETED`,
   score 0.000; both `NO_STATUS`, as ECN.304's real 88.889 is), and the engine already treats a null
   score as ungraded (`realScoreOf`, `items.ts:47-49`). Default: P-66 ships as task 11's pinning cases
   plus 105's "Not graded" links; no engine rule treats a posted zero as unposted (that would be a
   projection). Say so if you want a rule, and name the field it keys on.
2. **Dates, if you give them (B-9).** Default path: one Inbox value resolution per date, `due_at` at
   the start of that day's class for a presentation; if `raise_attention()` refuses a re-ask on row
   163's key (`IST.323/individual-presentation`, `due_at`), the date goes into 105 if 105 is not yet
   applied (task 10), otherwise into `db/migrations/108_grading_reconciliation_fixes.sql`, widened to
   hold it; either way under its own DECISIONS row naming the exception to 2026-09-15's "dates are Inbox
   resolutions".
3. **Does a date answer confirm a component link (R-33)?** `apply_resolutions()` sets `confirmed` on any
   applied date, and `confidence` is one flag per row. Default: no code change; the citation string in
   `source_ref` is what marks a checked link, and invariant F counts only that.
4. **Sitting calendar.** Default: one sitting a week in weeks 6, 7, 8, 10, 12 and 13 (none in 9 and
   11), sitting 6 by 2026-11-18, 106 applied by 2026-11-20. If sitting 6 slips past 2026-11-20, the PM
   asks you to split: IST.323's rows in 106 first, the rest in
   `db/migrations/109_grading_reconciliation_after_freeze.sql` after the freeze, with a DECISIONS row
   (the only exception to "one reviewed migration" this brief foresees; 107 stays the grants slot).
5. **Link rows after the fold (R-32 "may delete").** Default: keep every `grade_column_links` row; the
   model's result is identical and your picker choices stay reversible.
6. **GEO.103 lecture + recitation.** Default: one verdict file, one sitting (brief 63 allows either).
7. **The rule line's wording** is the PM's (§Contract); you approve or reword it on the preview.

## Session prompt (Stage D finalises it in ORCHESTRATOR)

ORCHESTRATOR §6 Session A, as written on `docs/sprint2-planning` 6a085e2 (Phase 15 runs first in the
same session; this is its Phase 16 half):

> `/bb2dash-pm` … Then, without merging, start Phase 16 in a second worktree cut from `origin/main`
> (R-29..R-36; `96_PHASE16_grades_v1.md`, migrations 105–109): fix the launcher, regenerate the export
> from a committed query, run the invariants baseline through Phase 15's runner (on its branch until it
> merges), and stop before sitting 1 with the exact `validate-grading` command for me. I run the
> sittings (IST.323 first); after each one you spot-check three citations, and after the sixth you
> write the reconciliation migration, run the invariants again, and open the PR.

What the PM does with it, in this brief's terms: tasks 1–15 (the worktree is `bb2dash-wt-16` on
`feat/grades-v1-16`; W-41, W-42 and W-43 spawned as Opus in their own worktrees), then stop with
`.\scripts\validate-grading.ps1 IST.323` copied to Stack's clipboard; task 16 at his first launch;
tasks 17–20 per sitting; tasks
21–29 after sitting 6 (27 after ECN.304 Exam 1); stop at "ready when you say so".
