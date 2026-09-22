# Phase 10a — Grades: gradebook mirror, Grades screens, submissions

Date: 2026-09-14 (brief); Contract frozen by the PM session 2026-09-15. Product manager: Stack. Requirements: R-10, R-11 (a)+(d),
R-17, R-18 from `60_REQUIREMENTS_v2.md`. Phase branch `feat/grades-10a`, one PR. Runs **in
parallel with Phase 11, V-1 and V-2**. **Migration range 046–059** (Phase 9 and its fix rounds took 030–045; Phase 11 owns 060–069).

**Base.** Cut from `main` after Phase 9 (PR #10) merges: 10a needs Phase 8's assignment popout
and Phase 9's automated transform (`stage_*` driver, `sync_stage_runs`, `agent_requests`).

## Why

Blackboard holds Stack's scores, feedback and submission records; bb2dash shows none of them.
Grades are the one thing he checks in Blackboard that the hub cannot yet answer. 10a mirrors the
gradebook honestly (Blackboard's numbers, labelled as Blackboard's), shows every item's score and
feedback, proves what was submitted, and lets him stage a file on an assignment before he submits
it in Blackboard. The computed standing and what-if wait for 10b.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.3)

* Surfaces: **global Grades page + per-course Grades tab**, latest score per item (score,
  possible, date seen, feedback, submission status); Blackboard's total where it publishes one.
  No score-change history in the UI (the mirror still appends per run; 10b surfaces history).
* Submissions: **status + timestamp + the submitted files** pulled back via the attempts
  endpoint into Storage under `my_submissions`, visible in the popout and Materials.
* Upload: **web-only drop zone** on the popout and the Classwork row → Storage + `bb_files` row
  (`classified_by = 'stack'`, `bucket = 'my_submissions'`, `assignment_id` set) → Materials.
  Local mirroring follows Phase 12's post-MVP task.
* A course with no Blackboard calculated total shows **"Blackboard publishes no total"**; what
  to do instead is decided in V-1's questions step, not here.
* Definition of done = SOP gates **+ Stack's acceptance script** on the Vercel preview.
* Every task carries an **executable check**; no task without one.

## MVP (in Stack's words)

Open `/grades` and see, per course, Blackboard's total as of the last sync (or the explicit
"no total" state) and every gradebook item with its score, possible points, when we saw it,
the instructor's feedback, and whether it was submitted and when. Open an assignment popout and
see the same for that item plus the file(s) actually submitted, downloadable. Drop a file on an
assignment and find it in Materials under that course's `my_submissions`, ready to attach in
Blackboard.

## Contract (frozen 2026-09-15 — all workers build against this)

Grounded in prod as of 2026-09-15: the last registered crawl is run `bf2f81e5-…` (2026-09-14,
`sync_runs` 35/36), 45 gradebook columns across 7 shells, one `isCalc` total (IST.323 `Total
Score`, `formula.isTotalCalculation = true`, 5/104), 44 columns already linked to `assignments`
by `bb_column_id`, submission statuses seen `NO_STATUS | UNOPENED | DRAFT_SAVED_STUDENT |
SUBMITTED | GRADED`, `lastAttempt` present on 17 columns, no `attempts` key in any payload yet,
zero `my_submissions` rows in `bb_files`. Every rule below was checked against those payloads.

### Migration allocation (046–059)

| # | File | Owner | Contents |
|---|---|---|---|
| 046 | `046_bb_gradebook.sql` | W-17 | `bb_gradebook` table + `stage_gradebook()` |
| 047 | `047_gradebook_views.sql` | W-17 | `v_gradebook_latest`, `v_assignment_grade`, `v_course_grade` |
| 048 | `048_classifier_blackboard.sql` | W-17 | `alter type classifier add value 'blackboard'` — **alone in its migration** (an added enum value cannot be used in the transaction that adds it) |
| 049 | `049_bb_files_submissions.sql` | W-17 | `bb_files` changes for submissions + anon-insert tightening (below) |
| 050 | `050_bb_attempts.sql` | W-17 | `bb_attempts` table + `stage_attempts()` + `v_attempts_latest`, `v_assignment_attempts` |
| 051 | `051_run_transform_grades.sql` | W-17 | `run_transform` re-created with the two new stages; `sync_change_lines` gains grade lines |
| 052–058 | — | PM | reserved for the review-fix rounds (Phase 9 needed five) |
| 059 | `059_grading_reconciliation.sql` | V-1 (PM) | V-1's data migration. **10a never takes 059.** |

Every migration: dry-run in `begin; … rollback;` via `execute_sql`, applied with
`apply_migration` under the file's name, repo file byte-identical, `security definer` functions
with `set search_path = public, pg_temp`, grants as in 034 §Privileges (revoke from `public,
anon`; grant to `authenticated, service_role`), new views `with (security_invoker = true)` and
`revoke all … from anon` (036's guard block refuses anything else). Never touch 001–045.

### 046 — `bb_gradebook` (R-10): append-per-run mirror

```sql
create table bb_gradebook (
  id                    bigint generated always as identity primary key,
  run_id                uuid        not null,            -- bb_raw.run_id
  sync_run_id           bigint      references sync_runs(id),
  course_id             text        not null references courses(id),
  column_id             text        not null,            -- g.columnId  ('_3560530_1')
  name                  text        not null,            -- g.name
  position              integer,                         -- g.position
  content_id            text,                            -- g.contentId
  category_id           text,                            -- g.categoryId
  possible              numeric(9,3),                    -- g.possible
  due_at                timestamptz,                     -- g.due
  calc_type             text,                            -- g.calc  ('NON_CALCULATED' | 'CUSTOM' | …)
  is_calc               boolean     not null default false,   -- g.isCalc
  is_total              boolean     not null default false,   -- see column_kind
  column_kind           text        not null check (column_kind in ('item','attendance','total','calc_other','letter')),
  aggregation           text,                            -- g.aggregation ('LAST' | 'HIGHEST' | …)
  visible               boolean, grades_released boolean,
  multiple_attempts     integer,                         -- g.multipleAttempts (0 = single attempt)
  attempts_left         integer,                         -- g.attemptsLeft (-1 = unlimited, null = n/a)
  effective_score       numeric(9,3),                    -- g.effectiveScore   ← THE score
  manual_score          numeric(9,3),                    -- g.manualScore
  display_score         numeric(9,3),                    -- g.displayGrade.score
  display_grade         text,                            -- g.displayGrade.grade ('Complete')
  is_override           boolean,                         -- g.displayGrade.isOverride
  is_exempt             boolean,
  feedback              text,                            -- g.feedback (already stripped to text, ≤ 1000)
  submission_status     text,                            -- g.submissionStatus, verbatim
  last_attempt_status   text, last_attempt_created timestamptz,
  last_attempt_submitted timestamptz, last_attempt_score numeric(9,3),
  seen_at               timestamptz not null,            -- bb_raw.captured_at of the run
  raw                   jsonb       not null,            -- the column object verbatim
  unique (run_id, course_id, column_id)
);
create index bb_gradebook_latest_idx on bb_gradebook (course_id, column_id, seen_at desc);
```

RLS owner-scoped exactly like 031/032 (`auth.uid() = public.app_owner()` for `authenticated`,
nothing for `anon`). `g.score` is **never read** (null on every column; R-10).

`column_kind` rules, in order: `total` when `is_calc` and (`raw->'formula'->>'isTotalCalculation'
= 'true'` or `name` matches 034's total-name regex); `calc_other` when `is_calc` otherwise;
`letter` when not calc and `name ~* 'letter grade'` (IST.323 `Final Letter Grade`, an override
column with no score); `attendance` when not calc and `bb_assignment_type(name) = 'attendance'`
(ECN.304 `Attendance`, GEO `Absences`/`Attendance`, IST.466 `Attendance` ×2); else `item`.
`is_total = (column_kind = 'total')`.

`stage_gradebook(p_run_id uuid, p_sync_run_id bigint) returns jsonb` — same envelope as every
034 stage (one `sync_stage_runs` row `stage = 'gradebook'`, never raises, counts in `counts`).
Reads `bb_raw` rows `kind = 'course'` for the run, resolves the shell with `bb_resolve_course`,
inserts one row per column `on conflict (run_id, course_id, column_id) do nothing`. Counts:
`{columns_seen, inserted, duplicates_skipped, courses_unresolved, totals, attendance, items,
scores_new, scores_changed}` where `scores_new` = items whose `effective_score` is not null and
whose previous latest row (any earlier run) had null, `scores_changed` = items whose
`effective_score` differs from the previous latest. Writes **nothing** to `assignments`,
`assignment_progress` or `attention_items`. Idempotent: a second call on the same run inserts 0.

### 047 — views (R-10, R-11)

```
v_gradebook_latest   -- one row per (course_id, column_id): the newest bb_gradebook row whose
                     -- run_id has a real sync_runs row (scope is distinct from 'unregistered');
                     -- all bb_gradebook columns except raw, plus
  assignment_id      text,     -- the ONE assignments row with bb_column_id = column_id, else null
  linked_assignments int,      -- 0, 1, or more (IST.323 _3569973_1 is linked to two rows today)
  counts_toward_grade boolean  -- true when the linked assignment has a non-null component_id
                               -- (V-1's data; 10a reads it, never sets it). Decides where an
                               -- attendance column renders (Stack's answer 8): attendance that
                               -- counts sits among the item rows, the rest in the collapsed group

v_assignment_grade   -- one row per assignments row that has bb_column_id: assignments.id,
                     -- course_id, title, type, points_possible, plus the v_gradebook_latest
                     -- columns for that column (null when the column has not been crawled)

v_course_grade       -- one row per courses row:
  course_id, has_gradebook boolean (any latest row), gradebook_seen_at timestamptz (max seen_at),
  has_total boolean, total_column_id, total_name, total_effective_score, total_possible,
  total_display_grade, total_seen_at, item_count int (column_kind = 'item'),
  graded_item_count int (item and effective_score not null)
```

The client never sums: `v_course_grade` carries Blackboard's total row or nulls. GEO 103 is two
shells; the web layer groups shells by `v_course_display.shell_ids` the way the Course screen
does, and each shell keeps its own `v_course_grade` row (the lecture has no total; neither does
the recitation — both read "Blackboard publishes no total").

### 048 + 049 — `bb_files` for submissions (R-17, R-18)

048: `alter type classifier add value 'blackboard';` — nothing else in the file.

049:
```sql
alter table bb_files alter column source_url drop not null;   -- a staged upload has no Blackboard URL
alter table bb_files add column attempt_id text;              -- the bb_attempts.attempt_id a pulled-back file came from
alter table bb_files add constraint bb_files_source_or_staged
  check (source_url is not null or classified_by = 'stack');
-- anon may still catalogue crawl files, but never a submission and never on Stack's behalf
drop policy bb_files_anon_insert on bb_files;
create policy bb_files_anon_insert on bb_files for insert to anon
  with check (bucket <> 'my_submissions' and classified_by is distinct from 'stack'
              and classified_by is distinct from 'blackboard');
```
`stage_files` (034/037/043) matches on `source_url`; null never matches and `classified_by =
'stack'` rows are already protected, so no stage change. The Storage `bb_files_anon_insert`
policy (`storage.objects`, bytes only) is **left as is**: the bb-sync pull step uploads with the
publishable key, and an anonymous object with no `bb_files` row is invisible to every screen.
Recorded as a DECISIONS row.

Storage key for every submission file, pulled or staged: `bb_file_relpath(id)` unchanged →
`<course>/my_submissions/<assignment-slug>/<file_name>`, or `<course>/my_submissions/<file_name>`
when the column has no assignment. `storage_path = 'bb-files/' || relpath`, `local_path =
'course context/' || relpath` (mirror written by the pull step; Electron's post-MVP job later).

### 050 — `bb_attempts` (R-17)

```sql
create table bb_attempts (
  id                 bigint generated always as identity primary key,
  run_id             uuid not null, sync_run_id bigint references sync_runs(id),
  course_id          text not null references courses(id),
  column_id          text not null,
  attempt_id         text not null,
  status             text,                 -- NEEDS_GRADING | COMPLETED | IN_PROGRESS | …, verbatim
  created_bb         timestamptz, submitted_bb timestamptz, modified_bb timestamptz,
  score              numeric(9,3), feedback text, student_comments text, student_submission text,
  exempt             boolean,
  receipt            text,                 -- Blackboard's confirmation number when the payload carries one
  files              jsonb not null default '[]',   -- [{id, name, size}] as captured
  seen_at            timestamptz not null, raw jsonb not null,
  unique (run_id, course_id, attempt_id)
);
```
RLS as 046. `stage_attempts(p_run_id, p_sync_run_id)`: reads `payload->'attempts'` (shape below),
inserts attempts `on conflict do nothing`, then **catalogues every attempt file** into `bb_files`
(`bb_course_id`, `course_id`, `file_name`, `mime_type` null, `source_url` = the file's download
URL, `bucket = 'my_submissions'`, `classified_by = 'blackboard'`, `classification_confidence =
1`, `assignment_id` = the single linked assignment or null, `attempt_id`, `text_status = 'na'`,
`notes = 'attempt file; bytes pulled by bb-sync step 4b'`) `on conflict (bb_course_id, source_url)
do nothing`. Counts `{columns_probed, attempts_seen, inserted, files_catalogued, errors}`.
Never writes `assignment_progress`.

Views: `v_attempts_latest` (newest row per `attempt_id`, registered runs only);
`v_assignment_attempts` (per `assignments.id` via `bb_column_id`: every attempt with `attempt_no`
= `row_number() over (partition by column_id order by created_bb)`, `attempts_allowed` from
`v_gradebook_latest.multiple_attempts`, `files`, `receipt`).

### 051 — driver

`run_transform` is re-created from its live definition (`pg_get_functiondef`, 035) with two calls
added after `stage_assignments` and before `stage_announcements`: `stage_gradebook` then
`stage_attempts` (gradebook after assignments so `bb_column_id` links exist for the file
catalogue). The comment on the function names eight stages. `sync_change_lines` gains:
`'%s new grade(s) posted'` (`gradebook.scores_new`), `'%s score(s) changed'`
(`gradebook.scores_changed`), `'%s submission file(s) catalogued'` (`attempts.files_catalogued`).
`transform_tick` is not touched.

### Crawler (`ingest/bb_crawler.js`, W-17)

* **Envelope version.** Every `kind = 'course'` payload gains `crawler: { version: 3 }` (the
  first versioned envelope; nothing today carries one). Stages read a missing key as version 2.
* **`attempts(C, gradebook)`**: for every non-calc column with `lastAttempt` not null or
  `submissionStatus` not in (`null`, `'NO_STATUS'`, `'UNOPENED'`): GET
  `/learn/api/v1/courses/${C}/gradebook/columns/${columnId}/attempts?userId=${userId}&limit=100`
  (fall back to `/learn/api/public/v2/courses/${C}/gradebook/columns/${columnId}/attempts?userId=…`
  on a non-2xx); for each attempt GET `…/gradebook/attempts/${attemptId}/files` (public v1 form
  as the fallback). Payload shape, frozen:
  ```
  attempts: [{ columnId, contentId, endpoint, status,          // HTTP status of the attempts call
               results: [{ id, status, created, modified, submitted, score, feedback,
                           studentComments, studentSubmission, exempt, receipt,
                           files: [{ id, name, size, downloadUrl }], keys: [...] }] }]
  ```
  `keys` = `Object.keys` of the raw attempt (first attempt per column only) so one query over
  `bb_raw` settles the real key names after the first live crawl — the same trick as
  `authorSource` in Phase 9. Unknown keys yield `null`, never a guess; `strip()` on prose fields,
  sliced (feedback 1000, comments 2000, submission text 4000). `downloadUrl` is the absolute
  `…/gradebook/attempts/${attemptId}/files/${fileId}/download`. Errors are recorded per column
  (`status`, empty `results`), never thrown; the crawl continues.
* **Assessment fields.** The `slim()` keep-list already names `dueDate`, `points`,
  `gradebookColumnId`, `attemptsAllowed`, but live `detail` objects carry only `file`/`url`
  (034 header). The worker finds where Ultra actually puts them on a live assessment item
  (full-item GET or another `contentDetail` branch), captures them under `detail`, and documents
  the path in the header. Unverifiable until a live crawl → see Stack's item 7.
* **`runAll({ termName, runId })`** accepts an optional `runId` so the bb-sync skill can register
  before crawling (STATUS's one-line change; 039's grace window remains the fallback).
* Pure mappers (`mapAttempt`, `mapAttemptFile`) exported under the CommonJS guard for vitest.

### bb-sync skill (`skills/bb-sync/SKILL.md`, W-17)

New **step 4b — pull submissions**, after the transform closes: for every `bb_files` row with
`bucket = 'my_submissions' and classified_by = 'blackboard' and storage_path is null`, download
`source_url` in the logged-in tab (Playwright `waitForEvent('download')` + `saveAs`, as the file
pull does), sha256 it, POST to Storage at `bb_file_relpath`, mirror to `course context/<relpath>`,
update the row (`storage_path`, `local_path`, `bytes`, `sha256`, `downloaded_at`, `mime_type`).
Step 3 passes `runId` and registers it **before** `bb.runAll`.

### Web (W-18)

**`web/src/lib/queries.grades.ts`** — conventions of `queries.popout.ts` (generated row types,
`gradesKeys`, `*Options()` → `queryOptions`, throw on error, no fabricated fallbacks):

| Export | Reads | Notes |
|---|---|---|
| `courseGradesOptions()` | `v_course_grade` (all rows) | `/grades` header per course |
| `gradebookLatestOptions(shellIds)` | `v_gradebook_latest` where `course_id in shellIds`, ordered by `course_id, position` | item rows; the client splits `column_kind` |
| `assignmentGradeOptions(assignmentId)` | `v_assignment_grade` | popout status line |
| `assignmentAttemptsOptions(assignmentId)` | `v_assignment_attempts` | popout attempts list |
| `submissionFilesOptions(assignmentId)` | `bb_files` where `assignment_id = …`, `bucket = 'my_submissions'`, `superseded_by is null` | pulled + staged, `classified_by` tells which |
| `useStageUpload()` | mutation | validate → sha256 (`crypto.subtle`) → Storage upload → `bb_files` insert → invalidate `materials.files` + submission files |

Pure, tested helpers in the same module: `scoreText(effective, possible)` (`—` for null, never
`0`), `formatSeenAt(iso)`, `submissionLabel(status, lastAttempt)` (Blackboard's status verbatim
with a human gloss: `UNOPENED` → not opened, `DRAFT_SAVED_STUDENT` → draft saved, `SUBMITTED` →
submitted, `GRADED` → graded, `NO_STATUS` → instructor-entered, unknown → the raw value; a row
with feedback but no score is whatever Blackboard's status says, usually "submitted" — answer 3,
no special case),
`courseGradeState(row)` → `'total' | 'no_total' | 'never_synced'`, `compareSha(staged,
submitted)` → `'matches' | 'differs' | 'no_submitted_copy'`, `attemptsText(n, allowed)` →
"Attempt 2 of 3" / "Attempt 1 (unlimited)" / "Attempt 1 of 1".

Upload validation at the boundary: one file at a time; ≤ 50 MB; `file_name` = the original name
with path separators and control characters replaced by `_`, ≤ 180 chars; a second file with the
same name for the same assignment gets ` (2)`, ` (3)` before the extension (no overwrite,
`upsert: false`). Row written: `{bb_course_id: course.bb_id, course_id, file_name, mime_type,
bytes, sha256, storage_path, local_path: null, bucket: 'my_submissions', classified_by: 'stack',
classification_confidence: 1, assignment_id, text_status: 'na', downloaded_at: now, source_url:
null, notes: 'staged in bb2dash <iso>'}`.

**Routes and components**

| Where | What |
|---|---|
| `app/(app)/grades/page.tsx` + `GradesScreen.tsx` | replaces `ScreenStub`. One `CourseGradeCard` per `v_course_display` row (Home order), each: header pill **"Blackboard's number, as of <seen_at>"** with `total_effective_score / total_possible` (+ `display_grade` when present), or exactly **"Blackboard publishes no total"**, or **"not synced yet"** (`never_synced`); below it the `GradebookTable` for its shells |
| `app/(app)/course/[id]/grades/page.tsx` + `CourseGrades.tsx` | replaces the placeholder pane: the same header + `GradebookTable` for that course's shells |
| `components/grades/GradebookTable.tsx` | one row per column where `column_kind = 'item'` **or** (`column_kind = 'attendance'` and `counts_toward_grade`): name (a `?item=assignment:<id>` link when `assignment_id`) · submission pill · `score / possible` · seen · feedback disclosure (two lines collapsed, full on expand, plain text, `white-space: pre-wrap`); a counted attendance row carries a small "counts toward grade" tag. Every other `attendance` / `letter` / `calc_other` row sits in a collapsed **"Attendance and bookkeeping columns (n)"** group beneath, same cells — still Blackboard's numbers with `seen_at`, never summed. Today every attendance assignment has a null `component_id` (export §3), so all attendance rows start in the group and move up as V-1 links them; no client rule, no re-deploy |
| `components/popout/SubmissionBlock.tsx` | in `AssignmentPopout` above the footer: pill + timestamp from `v_assignment_grade`, `attemptsText`, attempt list from `v_assignment_attempts` (status, submitted; `receipt` is stored but **not rendered** — Stack's answer 1), files: pulled-back rows via `FileOpenAction` with a short sha chip, staged rows labelled **"Staged in bb2dash — attach in Blackboard ↗"** (course `bb_url`) plus the `compareSha` chip; a staged file whose sha matches a pulled-back copy **stays listed** with the "matches" chip (answer 4). **No score in the popout** (Requirements §6.2 #4; answer 6). The footer note "Scores and submission status arrive with the gradebook (Phase 10)" goes |
| `components/grades/UploadDropZone.tsx` | drag-drop + `<input type="file">`, owner only (the session is the owner by RLS), progress + error text, mounted in `SubmissionBlock` and as a compact "Stage a file" control on Classwork rows whose node has `assignment_id` |
| `queries.materials.ts` | `BUCKET_ORDER` gains `my_submissions` after `project_materials`; Materials shows staged rows with the same label |

CSS Modules + existing tokens only. `database.types.ts` regenerated by the PM at integration;
until then W-18 declares narrow row interfaces for the four new views (Phase 8 precedent) and
asserts them at the call site.

**Tests** (`web/test/`): `queries.grades.test.ts` (request shapes, helpers on all branches),
`GradebookTable.test.tsx` (item rows, `—` for null, feedback expand + markup escaped, bookkeeping
group), `GradesScreen.test.tsx` (three course states), `SubmissionBlock.test.tsx` (pill,
attempts text, sha three branches, staged label), `UploadDropZone.test.tsx` (validation, row
shape, no control reads "Submit"), `crawler.attempts.test.ts` (pure mappers). Two grep
assertions as tests: no `/\bSubmit\b/` in a rendered control under `web/src`, no `service_role`
or `sb_secret` string in `web/src`.

### Honesty rules

Every figure on a 10a screen is a Blackboard value read from `v_*` with its `seen_at` beside it.
Nothing is summed, averaged, projected or compared to a syllabus rule. `null` renders `—`, never
`0`; "no total" and "not synced yet" are distinct states. Feedback is plain text, escaped by React.

### Stack's answers (2026-09-15)

Filled in by the PM session from Stack's reply before the workers were spawned.

| # | Question | Answer |
|---|---|---|
| 1 | Show the confirmation/receipt number on the attempt row when the payload carries it | **No.** It tells him nothing he acts on. Captured in `bb_attempts.receipt`, not rendered |
| 2 | `/grades` grouped by course, or one flat newest-graded-first list | **By course** |
| 3 | Feedback with no score reads "returned, ungraded" or stays "submitted" | **Stays "submitted"** — Blackboard's status verbatim; an edge case, feedback is not what this project is for |
| 4 | Staged file after a matching pulled-back copy exists: stays / superseded / removed | **Stays**, with the "matches" chip |
| 5 | Attempt bytes pulled by a new bb-sync step 4b in the logged-in Playwright tab | **Yes** |
| 6 | Popout shows submission status + files only, no score line | **Yes** |
| 7 | When Stack can provide a logged-in Blackboard session for W-17's verification crawl | **Every crawl needs his MFA** (one-user app; he may teach a few others the sync). Workers build on fixtures; **the real crawl is step 0 of his acceptance script**, run with the new crawler before merge. The attempts key names stay "unverified until that crawl", exactly as the announcement author did in Phase 9 |
| 8 | Attendance / bookkeeping columns: collapsed group under the items, or hidden entirely | **Collapsed group, but attendance may be a grade** and must show where it counts. Rule: `counts_toward_grade` (linked assignment has a `component_id`) puts the row among the items; V-1's links drive it, not a client list |
| 9 | Remove the four merged Phase 9 worktrees (`bb2dash-wt-sl*`) when the 10a worktrees are created | **Yes** — removed 2026-09-15, local branches deleted, remotes left |
| 10 | Migration range is 046–059 (041–045 are live from Phase 9's fix rounds), 059 reserved for V-1 | **Yes** — "go with what works"; the 041 figure predated Phase 9's fix rounds |

## Seams (frozen)

* **V-1** owns `grading_schemes` / `grade_components` data; 10a reads, never writes them.
* **Phase 11** owns `announcements` read state, the planner and calendar tables (060–069); 10a
  does not touch them. Both phases edit `web/src/app/(app)/` in different routes; the popout
  component is 10a's to extend (11 only links to it).
* **Phase 9** owns the transform driver; 10a adds stages to it under the driver's contract.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.3) + research `../research/72_RESEARCH_phase10a_grades.md` §5.

- [ ] **Stack's acceptance script (on the preview):** (0) press Sync on the preview and run
      `/bb-sync <id>` with the new crawler in a logged-in tab (his MFA); the transform lands
      `bb_gradebook` and `bb_attempts` rows and step 4b pulls the submission files — this is the
      phase's only real crawl (answer 7); (1) open `/grades` and see every course,
      each with Blackboard's total "as of <seen_at>" or exactly "Blackboard publishes no total";
      (2) open one course tab and compare one real item row (score, possible, seen_at, feedback,
      submission status) side by side with the same row in Blackboard; (3) open that item's
      popout, see submitted/not-submitted with the timestamp and attempt N of M, and download
      the pulled-back file; (4) drop a file on an assignment, find it in Materials under
      `my_submissions` labelled "Staged — attach in Blackboard ↗"; (5) confirm no number
      anywhere on these screens was computed by bb2dash. All five ticked.
- [ ] Fixture `bb_raw` gradebook + attempts payloads committed for ≥ 3 courses;
      `stage_gradebook` and `stage_attempts` tests green against them.
- [ ] Idempotency: re-running each stage on the same `run_id` adds zero rows (SQL assertion).
- [ ] Reconciliation SQL in the verification note: per course, gradebook column count in
      `bb_raw` == count in `v_gradebook_latest`, and every `effectiveScore` matches its source.
- [ ] Three distinct empty states, each with a renderer test: no published total / item
      ungraded (`—`, never 0) / never synced.
- [ ] Non-total `isCalc`, letter and non-counting attendance columns excluded from item rows;
      an attendance column whose assignment has a `component_id` is an item row; SQL count
      assertion on `v_gradebook_latest` + RTL test on both attendance branches.
- [ ] Feedback renders in full when expanded and is HTML-escaped; fixture test with markup.
- [ ] Attempt files use the two-call pattern (attempt files metadata → per-file download);
      pulled-back files land under `my_submissions` with a `bb_files` row carrying
      `assignment_id` and `classified_by = 'blackboard'`; SQL + screenshot.
- [ ] Drop zone produces a Storage object + `bb_files` row (`classified_by = 'stack'`,
      `bucket = 'my_submissions'`) visible in Materials within one refresh.
- [ ] No control anywhere reads "Submit" (grep assertion over `web/src`); the staged-file label
      is the only call to action.
- [ ] sha256 comparison renders one of matches / differs / no submitted copy yet; unit test on
      all three branches.
- [ ] RLS: owner-only insert on `my_submissions` paths; anon sees 0 rows of `bb_gradebook` /
      `bb_attempts`; no service key in the client bundle (grep assertion).
- [ ] Crawler: attempts endpoint added with the frozen payload shape, assessment fields
      captured, envelope `crawler.version = 3`, `runAll` accepts `runId`; pure mappers unit-tested
      on fixtures. The live proof is acceptance step (0), not a worker gate; the verification
      note says so and lists the keys the `keys` probe must settle.
- [ ] SOP gates: typecheck/build/test green in `web/` and `mcp-server/`; `/code-review main
      high` HIGH cleared; `/security-review`; STATUS + DECISIONS + ORCHESTRATOR updated; Vercel
      preview posted.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Freeze the Contract section; put open questions to Stack | Stack's answers recorded in the brief | — | PM session |
| 2 | Crawler: attempts endpoint + assessment fields + envelope version + `runId` | vitest on the pure mappers against the fixture; live proof is acceptance step (0) | "I run one sync and the grades appear" | W-17 |
| 3 | Fixtures: ≥ 3 courses' gradebook + attempts payloads | files committed; loader test parses them | — | W-17 |
| 4 | `bb_gradebook` (046) + `stage_gradebook` | stage test green on fixtures; idempotency SQL = 0 new rows | — | W-17 |
| 5 | Views `v_gradebook_latest`, `v_assignment_grade`, `v_course_grade` (047) | reconciliation SQL: counts and `effectiveScore` match `bb_raw` | — | W-17 |
| 6 | `bb_attempts` (048) + `stage_attempts` + file pull-back into Storage | stage test; SQL: `bb_files` rows with `assignment_id`; a signed URL downloads | — | W-17 |
| 7 | Register both stages with the Phase 9 driver | `sync_stage_runs` rows appear after a run | — | W-17 |
| 8 | `queries.grades.ts` + regenerated types | typecheck; query tests with fixtures | — | W-18 |
| 9 | `/grades` global page | RTL tests: total-with-date, no-total, never-synced states | "every course, Blackboard's number or the honest empty state" | W-18 |
| 10 | `/course/[id]/grades` tab (replaces the placeholder) | RTL tests: item rows, `—` for null, feedback expand + escaping | "one row matches Blackboard side by side" | W-18 |
| 11 | Popout submission block | RTL tests: status/timestamp/attempt N of M, file list, sha256 three branches | "I download what I actually submitted" | W-18 |
| 12 | Upload drop zone + RLS | RTL test; SQL: owner-only insert; Materials shows the row | "I stage a file and see it in Materials" | W-18 |
| 13 | "No Submit control" + "no computed numbers" audits | grep assertions in tests | — | PM session |
| 14 | Live smoke on prod | curl/SQL: a real gradebook row visible on `/grades` with its `seen_at` | — | PM session |
| 15 | Gates + docs + preview | SOP list | — | PM session |
| 16 | **Stack's acceptance script** | — | the five steps above | Stack |

Open questions from the research (also in `70_MVP_INDEX.md` §5) are rows 1–4 of "Stack's
answers" in the Contract; the PM session added rows 5–10 from the live-state review.

## Out of scope

Computed standing, what-if, score history UI (10b); the local file mirror (Phase 12); any
change to grading rules (V-1); Home course cards showing grades (never, per Stack).

## Workers (confirmed 2026-09-15)

Both branches are cut from `feat/grades-10a` after this brief is committed; worktrees under
`C:/Users/estac/projects/`. Workers commit and push to their own branch, never to the phase
branch or `main`, and never touch `project-state/`.

* **W-17 database + ingest** (`feat/grades-10a-db`, worktree `bb2dash-wt-g-db`): migrations
  046–051, `ingest/bb_crawler.js` (attempts, envelope, `runId`, assessment fields),
  `skills/bb-sync/SKILL.md` step 4b, fixtures under `db/fixtures/phase10a/` (gradebook payloads
  from run `bf2f81e5-…` for ≥ 3 courses, a synthetic attempts payload in the frozen shape),
  SQL tests under `db/tests/phase10a_*.sql`, verification note
  `docs/planning/sprint-1-hub/verification/66_W17_VERIFICATION.md` (shape of `51_W10_VERIFICATION.md`: what shipped with
  prod migration versions and md5s, before/after counts, the reconciliation SQL and its output,
  idempotency proof, RLS check, advisor diff).
* **W-18 web** (`feat/grades-10a-web`, worktree `bb2dash-wt-g-web`): `queries.grades.ts`,
  `/grades`, `/course/[id]/grades`, `GradebookTable`, `SubmissionBlock`, `UploadDropZone`,
  Materials bucket order, tests; `npm run typecheck && npm run build && npm test` green. Builds
  against fixtures until W-17's views are live, then live-checks against prod.

## Round 2 — review fixes (2026-09-15)

`/code-review main high` on the integrated phase branch (commit `214430a`) returned ten
confirmed findings plus two cleanups; the PM's manual security pass (the `/security-review`
skill cannot launch in this shell) added one. Migration numbers **052–056 are reserved for this
round**; 057–058 stay free; 059 is V-1's. Each fix carries its executable check. Workers first
`git merge origin/feat/grades-10a` into their own branch (it holds both merges and the
regenerated `database.types.ts`), fix, prove, commit, push. 046–051 stay byte-frozen: every SQL
change is a new migration that `create or replace`s from the **live** definition
(`pg_get_functiondef`), dry-run in `begin; … rollback;`, applied under the file's name.

### W-17 (database + ingest + skill)

| # | Finding | Fix | Check |
|---|---|---|---|
| R2-1 | **Register-before-crawl makes the tick's 3-minute idle branch reachable mid-crawl** (`transform_tick`, 044, folds a registered run once one course row is older than 3 min, no completeness check); a slow v3 crawl gets folded with 1 of N courses and `run_transform`'s idempotence then drops the rest forever | `skills/bb-sync/SKILL.md`: go back to **register `run_id` immediately after `bb.runAll` returns** (039's grace window covers that gap, as before). Keep `runAll({ runId })` in the crawler but say in the skill and the crawler header why register-first must wait until the tick requires the `calendar` row for registered runs (a Phase 9-driver change, not this phase's). Also validate `runId` in `runAll` (uuid regex; a bad value → throw, never a fabricated id) | skill text; vitest on the uuid guard |
| R2-2 | **Storage key collision**: a pulled-back attempt file and a staged file with the same name share `<course>/my_submissions/<slug>/<file>`; step 4b treats a 409 as done and points the Blackboard row at Stack's staged object | **052** `052_submission_relpath_and_check.sql`: `create or replace function bb_file_relpath` (from the live 008 definition) so a row with `bucket = 'my_submissions' and attempt_id is not null` gets an extra segment `attempt-<digits of attempt_id>/` before the file name; staged rows (`attempt_id` null) keep the current path so W-18's `submissionRelPath` stays correct. Same migration tightens 049's check to `source_url is not null or coalesce(classified_by::text,'') = 'stack'` (the PM's security finding: both-null passed a NULL check). Step 4b: a 409 is **never** "done" — refuse it and report the row | SQL: `bb_file_relpath` on a synthetic attempt row shows the segment; `v_file_layout.needs_move` is 0 for every existing row; insert with both null is refused |
| R2-3 | **`stage_files` marks every pulled-back submission file `missing_since_run`** on the same fold (its mark-missing step only protects `classified_by = 'stack'`; attempt download URLs never appear in `_bb_refs`), and the Activity feed then says "N file(s) are no longer in Blackboard" | **053** `053_stage_files_skip_submissions.sql`: `create or replace stage_files` from the live (043) definition with `bucket <> 'my_submissions'` added to the mark-missing predicate and to `missing_cleared` | SQL test: fold a fixture run with attempts after a `my_submissions` row exists → `marked_missing` 0 for it, unchanged for a genuinely missing crawl file |
| R2-4 | **`stage_gaps` raises a `data_gap` for every pulled-back file** in the very transaction that catalogued it (bytes arrive later from step 4b; nothing resolves the item) | **054** `054_stage_gaps_skip_submissions.sql`: from the live (041) definition, exclude `bucket = 'my_submissions' and attempt_id is not null` from the `storage_path` gap. Step 4b reports any file it could not pull in its summary line instead | SQL test: attempts fixture → 0 new `data_gap` rows for `bb_file` refs under `my_submissions` |
| R2-5 | **`attempts_allowed` mis-encodes unlimited**: `v_assignment_attempts.attempts_allowed = multiple_attempts` (0 = single) while unlimited lives in `attempts_left = -1`; the popout shows "Attempt 2 of 1" on real data | **055** `055_attempts_allowed_and_dates.sql`: recreate `v_assignment_attempts` with `attempts_allowed = case when g.attempts_left = -1 then -1 when g.multiple_attempts > 1 then g.multiple_attempts else 1 end`; same file re-creates `stage_attempts` with **tolerant date parsing** (R2-6) | SQL: ECN.304 Attendance fixture (multipleAttempts 0, attemptsLeft -1) → `attempts_allowed = -1`; IST.323 Quiz (3, 2) → 3 |
| R2-6 | **Bare `::timestamptz` on unverified attempt dates** inside one stage-wide exception block: one epoch-ms value fails the whole stage for the run | In 055: parse `created`/`submitted`/`modified` with 026's tolerant pattern (`jsonb_typeof = 'number'` → `to_timestamp(n/1000.0)`; strings only when they match `^\d{4}-\d{2}-\d{2}[T ]`; else null) so a bad value drops one field, not the stage | SQL test: a fixture attempt with `created: 1757900000000` and one with `"not a date"` → both rows inserted, fields null/converted, stage `ok` |
| R2-7 | **`scores_changed` counts stale values on an out-of-order fold** (previous = newest row by `seen_at` from any other run, no newest-run guard; 043 already guards the same hazard for files) | **056** `056_stage_gradebook_newest_guard.sql`: re-create `stage_gradebook` from the live definition; compute `scores_new`/`scores_changed` only when this run is the newest registered crawl (043's predicate), else report both as 0 and add `older_run: true` to counts | SQL test: fold the 9/2 fixture after the 9/14 run → `scores_changed 0`, `older_run true` |
| R2-8 | Verification note | Append `66_W17_VERIFICATION.md` §12 "Round 2" with each migration's prod version + md5, the test outputs above, and an advisor diff | note committed |

### W-18 (web)

| # | Finding | Fix | Check |
|---|---|---|---|
| R2-9 | **Blocker:** `assignmentGradeOptions` filters `v_assignment_grade` with `.eq('id', …)`; the view exposes `assignment_id` and has no `id` (047 deviation 4), so every popout's status line errors on prod | Filter on `assignment_id`; `AssignmentGradeRow` gets `assignment_id` instead of `id`; the request-shape test asserts `assignment_id=` | vitest; live smoke by the PM |
| R2-10 | `attemptsText` gets `grade.multiple_attempts` as the fallback ceiling (0 = single) | Add `attemptsAllowed(multipleAttempts, attemptsLeft)` with the same rule as R2-5's view and use it for the fallback; the view's `attempts_allowed` is passed through untouched | unit test on (0,-1)→-1, (3,2)→3, (0,null)→1, (null,null)→null |
| R2-11 | **Orphan Storage object on insert failure**: upload succeeds, `bb_files` insert throws, and the collision check (rows only) makes every retry 409 | On insert failure `storage.remove([relPath])` (best effort), then rethrow with the insert error; on a 409 from `upload`, include the Storage listing of `<course>/my_submissions/<slug>/` in the collision set and retry the suffix once | vitest: insert rejects → `remove` called with the key → error surfaced; 409 → suffix retried |
| R2-12 | **Duplicate DOM id** ``stage-file-${assignmentId}`` when a Classwork row and the popout show the same assignment | `const inputId = useId()` | RTL: two zones for one assignment → distinct `htmlFor`/`id`, each label opens its own input |
| R2-13 | `queries.grades.ts` is 808 lines (cap 800) and re-declares `COURSE_TIME_ZONE` / `shellKey` | Move the staging section (validation, sha256, `stageUpload`, `useStageUpload`) to `web/src/lib/queries.submissions.ts`; import the time zone and shell-key helpers from `course-dimension.ts` / `queries.course.ts` | typecheck; both files < 800 lines |
| R2-14 | Types are regenerated on the phase branch | Drop `untypedClient()` and the fixture casts: read the five views and insert into `bb_files` through the typed client (`source_url: null`, `classified_by: 'blackboard'` are now in the generated types); rewrite the module header | typecheck with no `as unknown as SupabaseClient` left in `queries.grades.ts` / `queries.submissions.ts` (grep assertion) |

Refuted by the reviewer and left alone: `assessmentFields` overwriting `slim()` keys (it only
merges the four keys `slim()` never sets). Not taken: the duplicated linked-assignment rule in
050 vs 047 (two views, one rule, both tested).

## Integration (PM)

Merge worker branches; regenerate types; `npm ci` if deps changed; typecheck + build + tests in
`web/` and `mcp-server/`; live smoke on prod (a real gradebook row appears on `/grades` with its
`seen_at`); `/code-review main high` + `/security-review`; STATUS, DECISIONS, ORCHESTRATOR
updated; Vercel preview; Stack's acceptance script; stop at the PR.
