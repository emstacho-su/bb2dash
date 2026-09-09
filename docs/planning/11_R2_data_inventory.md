# R2: Data asset inventory and quality assessment

Date: 2026-09-08. Agent: R2 (research). Scope: what the project actually holds, what a school-hub GUI could do with it that the current preview does not, and where the data will embarrass the app on day one.

Sources read: `docs/planning/DB_PROFILE_2026-09-08.json`, `docs/planning/DB_VIEWS_2026-09-08.sql`, `db/migrations/001..009`, `db/seed/002..004`, `DATA_SYNTAX.md`, `NOTES.md`, `PHASE2_FINDINGS.md`, `ingest/AGENT_BRIEF.md`, `ingest/FILE_HARVEST_SPEC.md`, `ingest/HARVEST_RUN_2026-09-03.md`, `ingest/VALIDATION_RUN_2026-09-08.md`, `ingest/bb_crawler.js`, `maps/*.v2.json`, `gui research context/gui/README.md` and `00-mvp-plan.dc.html`. Live read-only SQL against `goultdzqcavefcgnifdy` where the profile was not enough; every number below tagged "verified" came from that SQL on 2026-09-08. Inferences are marked.

Effort tags: S = a day or less inside the app, M = a few days or a new view plus UI, L = a new ingest path, new table, or a real engine.

---

## 0. What the GUI already binds, and therefore what "under-used" means

Grepping the current artboards (`00-mvp-plan.dc.html`, `13-home-v2.dc.html`, `14-course-v2.dc.html`, `03-lecture.dc.html`, `04-assignment.dc.html`) for table names gives the whole binding surface: `sessions`, `meetings`, `readings`, `assignment_progress`, `bb_files` (`source_url`, `local_path`), `announcements` (`is_read`), `bb_content`, `sync_runs.summary`, `grading_schemes`, `grade_components`, `course_staff`, `v_upcoming`.

Three substantial assets are referenced zero times anywhere in the GUI: `bb_file_text` (534 units, roughly 949,000 characters of extracted course text), `course_maps` (15 versioned per-course JSONB documents), and `bb_raw` (24 payloads, three crawl runs, carrying gradebook feedback, group memberships and calendar items that never reached a typed table). Those three are the headline of this report.

One binding the GUI expects does not exist: `v_course_grade` is named in `gui research context/gui/README.md` under "Course cards" and there is no such view and no grade computation anywhere in the database (confirmed in `DB_VIEWS_2026-09-08.sql`, which says so explicitly).

---

## 1. `bb_content`: the Blackboard content tree

What it is: 139 rows, one per node the student sees in a course shell, with `bb_type`, `item_kind`, `path` (breadcrumb, ` / ` separated), `url`, `state`, `modified_at`, `body`, `detail` jsonb, and an optional `assignment_id` link. Written by the phase-2 crawl.

Coverage, verified:

| Field | Populated | Note |
|---|---|---|
| rows | 139 | 7 shells; IST.323 30, IST.352 32, IST.466 30, GEO.103.lecture 21, ECN.304 13, IST.471 10, GEO.103.recitation 2 |
| `assignment_id` | 21 | only `item_kind in (test, survey)`; no folder, file or document links to an assignment |
| `url` | 27 | 112 nulls |
| `detail` | 27 objects | the other 112 hold JSON `null`, not SQL NULL, so `detail is not null` is true for all 139 and the profile's `with_detail` column overstates coverage |
| `detail` keys | `file` (23), `url` (4) | nothing else survived `slim()`; `dueDate`, `points`, `gradebookColumnId`, `attemptsAllowed` are all dropped before insert |
| `body` | 8 | one truncated at exactly 4000 chars (the crawler's `slice`) |
| `state` | Started 44, Completed 5, None 90 | Ultra's own per-item progress marker |
| `modified_at` | 139, max 2026-09-02T19:41Z | never refreshed by either 2026-09-08 crawl |

Quality issues. The tree is six days stale relative to `bb_raw`: two crawls landed on 9/8 (`87440f01`, `6b122650`) and neither reloaded `bb_content`, so `modified_at` still tops out at 9/2. Eleven rows are titled `ultraDocumentBody` (verified: IST.323 Final Project START HERE, GEO.103 Qwickly help, GEO.103 syllabus module, GEO.103 song/lyrics item, two GEO.103 week-2 items, IST.352 Project Team Assignments, IST.352 WK01 Welcome, IST.352 WK01 SDLC, IST.466 Student Policy, IST.466 Major Case 1). That is the crawler taking the JSON key as the title when an Ultra document has no display title; any Materials tree renders eleven identical meaningless rows. `path` is unique per course (0 duplicates) so it is a safe key. `bb_content` also carries no link to `bb_files`, so "the folder I am looking at contains these three PDFs" requires joining on `bb_files.content_id` to `bb_content.bb_item_id`, which works but is not modeled.

Features it enables:

1. Materials browser that mirrors Blackboard's own hierarchy (T-02 in the plan sheet) rather than a flat bucket list. `path` split on ` / ` gives the tree for free. Effort S.
2. "Where does this live in Blackboard" deep link on any assignment or file, using `bb_content.url` where present and `courses.bb_url` plus the path as a fallback. Effort S, but see the `assignments.bb_url` gap in section 11.
3. Progress-aware content list using `state` (Started/Completed): Blackboard already tracks which learning modules Stack opened, and nothing in the app shows it. Effort S. Inference: `state` semantics are Ultra's module-progress marker; I did not confirm against the UI.

---

## 2. `bb_file_text`: the extracted text corpus

What it is: 534 rows, one per file per unit, `unit_kind` in page/slide/sheet/doc, with `text` and generated `char_count`. Covers 63 of the 64 `bb_files` rows (the one exception is a byte-identical duplicate marked `text_status = 'na'`).

Coverage, verified: slide 295 units, median 261 chars, 15 units under 30 chars (title-only slides); page 219 units, median 3013 chars; doc 17 units, median 3725; sheet 3 units, median 4907. Longest single unit 24,865 chars. Total roughly 949,000 characters, call it 240k tokens, which fits in a single model context.

Quality issues. PDF page text carries running headers and case-number watermarks (verified on the HBR cases: every page begins `Page N` then the case id `9B21E001`), which pollutes snippet display and would pollute embeddings. PPTX extraction includes speaker notes inline with a `[notes]` marker (verified on `Introduction to SA&D - Part 1.1.pptx` slide 6), which is a feature for summarization and a liability for quoting: a snippet may show the professor's private notes as if it were slide text. There is no full-text index and no `pgvector` (verified: installed extensions are plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault). At 534 rows a sequential `ilike` scan is fine; at ten times the size it is not. One systemic gap: the corpus is course materials only. Nothing Stack writes and nothing from `assignment_progress.notes` is in it.

Features it enables:

1. Cross-course search over everything a professor posted, scoped by course, bucket and week, returning file plus unit number plus a snippet. This is T-12 in the plan sheet, listed as "Later", and it is the single cheapest high-value feature in the inventory because the data is already there. Effort S with `ilike`, M with a `tsvector` generated column and a GIN index.
2. Reading view: open a file inside the app as scrollable text units instead of shelling out to OneDrive. Pairs with `bb_files.local_path` for the "open the real PDF" affordance. Effort M.
3. "What is in this week's slides" and per-session prep summaries: join `bb_file_text` to `bb_files.week_no` or `bb_files.session_id`, hand the units to the CLI agent. Note the coverage constraint below. Effort S for the query, and the summarization is the agent's job, not the app's.
4. Embeddings for semantic search and for grounding agent answers about course content. Requires enabling `pgvector` and a migration on this table, which `ingest/FILE_HARVEST_SPEC.md` section 6 already anticipates. Effort L.

Coverage constraint that limits 3: only 16 of 64 files carry a `week_no` and only 2 carry a `session_id` (verified). So "this week's slides" resolves for ECN.304 and IST.323 and IST.352 lecture decks and not much else. Fixable by SQL for the decks whose filenames carry a week token, and by a Stack pass for the rest.

---

## 3. `bb_files`: the file catalog, bucket and linkage

What it is: 64 rows, all stored (`storage_path` 64/64), all hashed, all with a local mirror path, 0 unclassified, 1 `text_status = 'na'`. Buckets are the ten-value `file_bucket` enum from migration 005.

Linkage coverage, verified: `assignment_id` 29, `week_no` 16, `reading_id` 13, `session_id` 2. Per-course volume: IST.466 27 files / 5.1 MB, IST.323 15 / 19.2 MB, IST.352 8 / 1.0 MB, GEO.103.lecture 6 / 13.0 MB, IST.471 4 / 0.9 MB, ECN.304 3 / 1.5 MB, GEO.103.recitation 1.

Quality issues. Superseded versions are still live rows: `bb_files` 16, 40 and 58 are three older IST.466 schedule docs marked superseded in `notes` but with no column a query can filter on, plus two roster versions (35 Wk2_New with 28 names, 37 Wk2xy with 29 names) where only 37 is current. A naive Materials list therefore shows five stale IST.466 documents next to their replacements. One sha256 duplicate pair (15 and 17, both `Ethics Criteria.pptx`) is handled correctly by pointing both rows at one object. Six orphaned Storage objects remain (verified: 69 objects in `bb-files`, 6 with no matching `bb_files.storage_path`), left over from the pre-layout IST.352 keys and a probe file; they need an authenticated delete, which the publishable key cannot do.

The `notes` column is an under-used asset in itself. It holds hand-written provenance on 45 of 64 rows: which embed a file came from, why it was renamed, that the Synchrony packet is the September 2025 kickoff deck re-posted in 2026, that the IST.466 rubric deck says 120 points where the syllabus says 100. That is exactly the "why does this file look wrong" text a Materials pane should surface on hover, and nothing reads it.

Features it enables:

1. Materials pane per assignment and per session: `bb_files` filtered by `assignment_id` or `session_id`, with local-vs-remote state and the `notes` provenance line. Effort S.
2. A "current version" filter, once superseded rows carry a real column instead of a notes convention. Effort S plus one migration.
3. Storage health panel driven by `v_file_layout.needs_move` (currently 0 everywhere) plus the orphan count. Fits T-04's data-health screen. Effort S.

---

## 4. `course_maps`: 15 versioned per-course JSONB documents

What it is: `course_maps` (migration 006) with `v_course_map_latest`. Fifteen rows, versions 1 and 2 per course. The v2 documents mirror `maps/*.v2.json` in the repo, and their shape is consistent enough to query: `meeting`, `grading` (with `components`, `rules`, `letter_scale`), `tree_shape` (with `bucket_paths`, `week_regex`, `topic_folder_week_map`), `sources`, `course_fields`, `file_manifest`, `gaps`, and a `pull` or `pull_result` block.

The two arrays that matter are `course_fields` and `gaps`. `course_fields` is a per-course list of resolved and unresolved facts with `value`, `confidence`, `stack_must_confirm` and a `source` citation; `gaps` is a list of `{what, owner, closes_with}` where `owner` is one of `stack`, `wait`, `blackboard_pull`. Verified totals across the six v2 maps: 44 gaps and 46 course_fields, of which 17 course_fields carry `stack_must_confirm: true` and a null value.

This is a complete, machine-readable to-do list of everything the project knows it does not know, and no screen shows it. Examples that are decision-blocking, not cosmetic: IST.471 has no site supervisor name, no internship start date, no weekly hours, so the 150-hour requirement cannot be paced and the 30-hour Learning Agreement trigger cannot be dated; IST.323 has no Security-in-the-News group number, so the presentation date cannot be resolved from the group-to-date map that is sitting right there in `courses.group_notes`; IST.466 has two unresolved presentation slots and a rubric conflict.

Features it enables:

1. A "Needs your input" queue: every `course_fields` entry with `stack_must_confirm: true` and null value, plus every `gaps` entry with `owner: stack`, as a checklist with the source citation. This is the highest-value screen in the whole inventory that the GUI does not have, because it turns 17 blocking unknowns into a list Stack can clear in one sitting. Effort M (one view plus a UI list; writing answers back needs a target column per field, which is the hard half).
2. Course Info tab (T-05) fed from `course_maps` rather than re-deriving: the map already holds letter scale, grading rules in prose, meeting confidence, and the tree shape. Effort S.
3. Sync-health context: `gaps` with `owner: wait` are the things the next crawl should close, which is the natural content of a "what will the next sync look for" panel. Effort S.

Caveat: the maps are not schema-validated. Key names drift between courses (`pull` vs `pull_result`, `letter_scale` is an array in five maps and a string in IST.466). Anything reading them needs defensive access or a normalizing view. Inference: normalizing is a half-day of SQL, not a redesign.

---

## 5. `sync_runs.summary`: provenance and conflicts

What it is: 12 rows, `summary` jsonb, `notes` text. Written by the seed, the six harvest agents, and the two orchestrated runs.

Quality issue: the shape is completely heterogeneous. Run 1 has `{courses, readings, sessions, assignments, grade_components}`; run 8 has `{bb_id, buckets, uploaded, gaps_open, gaps_closed, manifest_rows, map_version_after, ...}`; run 12 has a nested `{files, typed, lessons, validation, observations, totals_after}`. Only two keys appear across most runs (`uploaded`, `downloaded`). The GUI README binds "Needs attention" to `sync_runs.summary` conflicts, but the conflict list exists in exactly one row (id 2, key `conflicts_with_confirmed_seed`, three entries) and nowhere else. Run 12's equivalent information lives under `summary -> 'observations'` as five prose strings.

Two of those run-12 observations are live data problems that no table records: the GEO.103.recitation Attendance column reading 0/100, and the IST.352 Project 1A item having been deleted and re-created by the instructor with new ids.

Features it enables:

1. Sync-health screen (T-04) showing last run, counts, and the prose observations. Effort S, but only if a normalizing view or a fixed summary contract is agreed first.
2. A real conflicts feed, which needs a `sync_conflicts` table rather than a jsonb key, because a conflict has a lifecycle (open, accepted, rejected) and a jsonb blob has none. Effort M and one migration.

Recommendation for the planning stage: freeze a `sync_runs.summary` contract (a required top-level shape with optional extras) before the app reads it, otherwise every crawler change breaks a screen.

---

## 6. Grading model: `grading_schemes` and `grade_components`

What it is: 6 `grading_schemes` rows (all `confidence = confirmed`, all with `late_policy` and `ai_policy` text) and 35 `grade_components`. GEO.103.recitation has no scheme by design; its grading rolls into the lecture shell.

The aggregation rules present, verified: `manual` 8 components, `single` 14, `sum` 8, `average_drop_lowest` 2, `rank_weighted` 1, `normalized` 1. So a projection engine has to implement six behaviours, not one, and the two hardest are single instances: ECN.304 exams with `rank_weights: [30, 25, 20]` (the highest score gets 30 percent, the next 25, the lowest 20, which means the projection is order-dependent and non-linear in any individual exam), and IST.323 quizzes with `normalize_to: 5` across `count_expected: 10`.

What a what-if engine needs that does not exist:

- A grade store. `assignment_progress.score` holds 5 rows (verified). Blackboard has more, and the raw payloads have more still (section 8).
- A component-to-assignment mapping. `assignments.component_id` is null on 6 of 66 rows, which is good, but there is no reverse check that every component with `count_expected` has that many assignments. IST.466's `attendance` component expects 30 items and there are zero attendance assignment rows.
- Handling for `manual` components (8 of 35): participation and attendance cannot be projected from item scores at all, so the engine must either ask Stack for an assumption or exclude them and say so.
- Handling for `qualitative` (IST.471): 70 percent supervisor evaluation, 30 percent assignment compliance, no numbers ever. Any "your grade is X" for IST.471 is fiction.
- A guard against `score_max = 0` (three rows, section 9).

Features:

1. `v_course_grade` computing an earned-so-far and a maximum-possible per course from graded items plus component rules, with an explicit "not computable" state for `manual` and `qualitative` components. Effort M for the view, L if it has to be right for `rank_weighted` and `average_drop_lowest` under partial data.
2. What-if projection (T-07): sliders per remaining item, engine re-runs the same rules. Effort L, and it depends on 1.
3. A cheaper interim: read Blackboard's own computed total instead of building the engine (section 8). Effort S.

---

## 7. `readings` and `reading_progress`

Verified: 86 readings (60 required, 26 recommended), 33 flagged `on_blackboard`, 29 with a URL, 10 with no `for_date`, 13 linked to a harvested file. `reading_progress` has 75 rows, all `not_started`, which means 11 readings have no progress row at all and any join must be a LEFT JOIN with a default.

Quality issues. The 10 dateless readings are the IST.466 HBR case pool, which is correct behaviour (a case is assigned to a team, not a date) but breaks any date-ordered reading lane. Twenty-three GEO.103 readings are flagged `on_blackboard` with no URL and no bytes: they are Orange Instant Access ebook chapters behind an LTI, so the app can never open them and should not pretend it can. ECN.304's 38 readings are all external URLs with nothing downloadable. So of 86 readings, 13 have local bytes, 29 have a link, and 44 have neither.

Features:

1. Readings tracker (T-08, listed "Should"): a lane on the course timeline keyed on `for_date` with a `reading_progress` checkbox. Effort S. The 11 missing progress rows are a one-line insert.
2. Reading-load forecast: count required readings per week per course and fold it into the effort tracker, which today counts only assignments. Effort S, and it materially changes the tracker because ECN.304 alone carries 38 readings that the effort score currently ignores entirely.
3. "Open this reading" resolving in priority order local file, then URL, then a clearly-labeled "ebook, open Blackboard" state. Effort S.

---

## 8. `bb_raw`: the richest and least-used asset

What it is: 24 rows across three runs (`3e12fd89` 9/2, `87440f01` and `6b122650` both 9/8), kinds `course` (21) and `calendar` (3). Payload top-level keys per course, verified: `course`, `teachers`, `schedule`, `announcements`, `gradeCategories`, `gradebook`, `content`, `groups`.

### 8a. Gradebook

The latest run holds 37 gradebook column objects with these keys, verified: `columnId`, `name`, `description`, `contentId`, `categoryId`, `possible`, `due`, `calc`, `formula`, `aggregation`, `isCalc`, `effectiveScore`, `manualScore`, `score`, `displayGrade`, `isExempt`, `feedback`, `submissionStatus`, `attemptsLeft`, `lastAttempt`, `visible`, `gradesReleased`, `multipleAttempts`, `position`.

Two findings that matter more than anything else in this document.

First, `score` is null on all 37 rows. The actual value lives in `effectiveScore` and in `displayGrade` as `{"score": N, "isOverride": bool}`. Any transform reading `g->>'score'` silently gets nothing. Verified examples: IST.323 Quiz #1 `effectiveScore` 10, ECN.304 Quiz 1 `effectiveScore` 9 with `isOverride: true`, ECN.304 Attendance 100, GEO.103.lecture Absences 0, IST.352 three items at 0.

Second, IST.323 exposes a `Total Score` column with `calc: CUSTOM`, `possible: 104`, `effectiveScore: 5`. That is Blackboard computing the course grade under the professor's own rules. Reading it is a hundred times cheaper than building a rank-weighted, drop-lowest, normalize-to-5 engine, and it is authoritative in a way our engine can never be. IST.323 also carries a `Final Letter Grade` column (currently empty, due 2026-12-30).

`lastAttempt` carries `{status, created, submitted, score}` and `feedback` carries the instructor's actual comment text. Two rows currently hold real feedback (both IST.352 reading items, "** Late submission. Completing the assigned reading will prepare you to participate fully..."). Exactly that text is in `assignment_progress.feedback` for 2 rows, so the bridge works, but only for rows someone hand-wrote SQL for.

Features:

1. A `bb_gradebook` typed table plus a transform reading `effectiveScore` and `lastAttempt`, replacing the hand-written per-item SQL. Effort M. This is the prerequisite for every grade feature.
2. Show Blackboard's own `Total Score` and `Final Letter Grade` per course wherever they exist, labelled as Blackboard's number, alongside our projection when we have one. Effort S once 1 exists.
3. Feedback inbox: every graded item with non-empty `feedback`, cross-course, with the score and the attempt timestamp. Effort S once 1 exists. Nothing in the GUI shows feedback today.

Quality note on the categories: `gradeCategories` in the 9/2 run returns untranslated i18n keys as titles (`Assignment.name`, `Survey.name`, `Test.name`, `Discussion.name`, `Journal.name`) with `weight: null` on every row, so it cannot drive weighting. In both 9/8 runs `gradeCategories` is null entirely, which is a regression worth one line of investigation before anyone builds on it.

### 8b. Groups

`payload -> 'groups'` is populated and contradicts our own records. Verified:

| Course | Blackboard says | `courses.group_notes` says |
|---|---|---|
| IST.352 | Group 7, `_306028_1`, set `_306017_1`, desc "Otto's Custom T-Shirt E-Commerce Website" | Project Group 7, Otto's, Option 2 (agrees) |
| IST.466 | "Ethics Groups 3" `_299090_1` set `_299088_1`, and "Major Case Group 2" `_299093_1` set `_299087_1` | "Ethics Case Group #2; Major Case (Synchrony / SU IT) Group #3" |
| IST.323 | `[]` | groups endpoint empty as of 9/3 (agrees) |

The IST.466 numbers are swapped between our record and Blackboard's. This is not cosmetic: the ethics group number selects which HBR case Stack presents and on which date (the map's `ethics_case_assigned` field infers Team 2 equals HBR2 Ethics Across Cultures from the group number), and the major-case group number selects the 10/20-vs-10/22 and 11/17-vs-11/19 presentation slots. One of the two records is wrong and the app will confidently display whichever it reads.

Schema gap: `courses.bb_group_id` and `bb_group_set_id` (migration 009) are single-valued and populated only for IST.352. IST.466 has two groups from two different group sets and there is nowhere to put them.

Features: a real `course_groups` table (course, set id, group id, title, description), a group badge on the course card, and group membership driving which presentation date applies to Stack. Effort M including the migration.

### 8c. Calendar

Verified: the latest calendar payload holds 23 items, all with `itemSourceType = blackboard.platform.gradebook2.GradableItem`. Every item is a gradebook column echo. There are no class-meeting events, `location` is null on all of them, and several `startDate` values are the column's creation timestamp rather than a due date (ECN.304 "Quiz 1" shows `2026-09-03T21:16:59.532Z`, which is the second the column was made).

Honest conclusion: the calendar endpoint adds nothing the gradebook does not already give, and it adds noise. `DATA_SYNTAX.md` proposes the iCal feed as "the low-cost recurring source for `assignments.due_at`", and that may still be true for the feed, but it is not true for `calendarItems`. Class meetings must come from `meetings` plus `sessions`, which is where they already are. Mark this asset as evaluated and low value rather than pending.

---

## 9. `assignments`, `assignment_progress`, and the recurrence model

Verified coverage on 66 assignment rows: 9 with no `due_at` and no `due_date`; 26 with no `points_possible`; 29 with a `bb_column_id`; 0 with a `bb_url`; 0 with `available_from`; 7 with `event_start`; 66 with a `description` (median 86 characters); 17 with a `due_rule`; 6 still `submission = 'unknown'`; 6 with a null `component_id`. Confidence: 54 confirmed, 8 tentative, 4 inferred. Source: 41 syllabus, 25 blackboard.

`bb_last_seen` is the staleness signal and it is itself stale: 29 rows stamped 2026-09-02, 1 stamped 9/03, only 4 stamped 9/08, and 32 null. So "last seen in Blackboard" cannot be trusted to mean anything, and any UI that renders it will show a week-old timestamp on items that were verified today. Fixable by SQL as part of the transform, but the transform has to actually set it.

`bb_submission_status` distribution, verified: UNOPENED 16, null 44, SUBMITTED 2, GRADED 3, DRAFT_SAVED_STUDENT 1. The 44 nulls are items with no Blackboard column, which is correct, but a UI must not render null as "not submitted".

Series: 10 `series_key` groups exist (`IST.323/quiz` with 10 members, `IST.323/lab` 4, `IST.323/exam` 3, `ECN.304/quiz` 3, `ECN.304/exam` 3, `IST.352/knowledge-check` 3, `GEO.103/exam` 2, and three singletons). T-11 (series strip) is directly supported. Effort S.

`assignment_progress`: 65 rows against 66 assignments (one orphan assignment with no progress row). Every planner column is empty, verified: `planned_start` 0, `planned_finish` 0, `est_minutes` 0, `letter` 0, non-normal `priority` 0. `submitted_at` 5, `graded_at` 5, `score` 5, `score_max` 5, `feedback` 2, `notes` 15.

This is the most important finding for the effort tracker. The GUI's horizontal effort tracker and its "suggested start date" (T-15) assume `est_minutes` or an `effort_override` exists. Neither does, and `effort_override` is not even a column: `00-mvp-plan.dc.html` names `assignment_progress.effort_override` and marks it "(new)". So on day one the tracker is running entirely on the type-based default score with the optional points multiplier, and 26 of 66 assignments have no `points_possible` for the multiplier. The tracker will work; it will just be a type lookup table wearing a planner's clothes until Stack fills anything in.

Features beyond what the GUI has:

1. Status quick-edit (T-06) writing `status`, `priority`, `planned_start`, `planned_finish`, `est_minutes`. Effort S, and it is what makes every other planner feature real.
2. Feedback and score display on the assignment popout (`04-assignment.dc.html` binds `assignment_progress` but not `feedback`). Effort S.
3. Series strip (T-11). Effort S.

---

## 10. `sessions`, `meetings`, `course_staff`, `announcements`

`sessions`: 145 rows, all with a topic and a `week_no` (verified, 0 nulls on both), 20 with notes, 8 non-confirmed. `counts_attendance` is populated only for IST.466 (8 true, 23 false) and null for all 114 rows in the other five courses. So an "attendance matters today" badge works for exactly one course. The eight IST.466 attendance dates are 8/27, 9/15, 9/24, 9/29, 10/1, 10/29, 11/3, 12/5, and the map notes only 8 of an expected 15 starred cells were readable, so even that course is incomplete.

Eight sessions are tentative and all eight are known date problems: four IST.466 rows (9/29 which the schedule doc printed as Sunday 9/27, the 10/20 and 10/22 pair labeled MON/WEDS, and 12/5 which is a Saturday) and four IST.352 rows.

`meetings`: 11 rows, all confirmed, all with day, time and room, covering all seven shells except IST.471 (online, no pattern). This is clean and the course cards can rely on it.

`course_staff`: 12 rows. Office hours present on 7, null on 5 (both GEO.103.lecture TAs, IST.466 Corsello, IST.466 Strudler, IST.471 Cohen). Two staff have no email (Strudler, Cohen), and Cohen's email is a blocker on the IST.471 Registrar form per the map. A Course Info tab (T-05) will show five blank office-hours cells.

`announcements`: 11 rows, 9 unread, no null bodies, longest 1959 characters. Clean. The bell popout works today. Under-used detail: announcements are where the ECN.304 quiz schedule actually lives, which is why `ECN.304/quiz-02` exists at all. An "announcement mentions a date or a deliverable" extraction pass is a genuine agent job, effort M, and it is the only route to ECN.304's unannounced quizzes.

---

## 11. Data quality punch list

Ordered by how visible the damage is on day one. "Fix" column: SQL means a query or a migration can fix it without leaving the desk; re-crawl means the next Blackboard pass fixes it; Stack means only Stack knows the answer.

| # | Problem | Where, verified | Day-one symptom | Fix |
|---|---|---|---|---|
| 1 | IST.466 group numbers contradict Blackboard: BB says Ethics Group 3 and Major Case Group 2, we say Ethics 2 and Major Case 3 | `bb_raw` run `6b122650` `payload->'groups'` vs `courses.group_notes` | Wrong HBR case, wrong presentation date, shown with full confidence | Stack (confirm in class), then SQL |
| 2 | 11 content rows titled `ultraDocumentBody` | `bb_content.title` | Materials tree shows 11 identical nonsense rows | SQL (fall back to the parent path segment), plus a crawler fix |
| 3 | Gradebook `score` is null everywhere; real value is `effectiveScore` / `displayGrade.score` | all 37 columns, run `6b122650` | Any grade transform silently produces nothing | SQL (fix the transform) |
| 4 | Three progress rows have `score_max = 0` | `IST.352/knowledge-check-2026-08-26`, `IST.352/reading-ch1`, `IST.352/reading-ch1-all` | Division by zero, or "0%" on items that are completion-only | SQL (treat 0-point items as ungraded) |
| 5 | Two permanently overdue rows | `v_overdue`: `IST.352/team-request` due 8/30, `IST.466/ethics-vs-activity` due 9/1, both `not_started` | Needs-attention badge is red forever from launch | Stack (set the real status) |
| 6 | 9 assignments with no date at all | `ECN.304/quiz-series`, `GEO.103/reading-quiz-series`, `GEO.103/discussion-questions`, `IST.323/individual-presentation`, `IST.323/sitn-group-presentation`, `IST.323/assignment-1`, `IST.471/a7-final-reflection`, `IST.352/term-project`, `IST.466/ai-team-assignment` | Invisible in every date-ordered view including the tracker and the week rail | Mixed: 3 are Stack (SitN group, individual presentation), 3 are re-crawl (a7, ai-team, term-project), 3 are placeholders that should render in an "undated" lane |
| 7 | `assignments.bb_url` is null on all 66 rows | verified | No "Open in Blackboard" from any assignment | re-crawl (the crawler has `contentId`; the transform never wrote a URL) |
| 8 | `bb_last_seen` stale: 29 rows at 9/2, 4 at 9/8, 32 null | verified | "Last verified" timestamps lie | SQL (stamp it in the transform) |
| 9 | GEO.103.recitation Attendance column reads 0/100 | `bb_raw`, and `sync_runs` id 12 `observations` | Course card shows a 0 percent attendance grade for a course where attendance is 15 percent of the grade | Stack (probably a Qwickly placeholder; confirm before displaying) |
| 10 | ECN.304 Attendance reads 100/100 after two weeks | `bb_raw`, `effectiveScore: 100` | Course card shows a perfect grade that means "present so far", not "A" | SQL (label attendance columns as non-grade signals) |
| 11 | 8 tentative sessions, all IST.466 and IST.352 date anomalies | `sessions.confidence <> 'confirmed'` | Week rail shows a class on a Saturday (12/5) and two ambiguous presentation slots | Stack for IST.466 (ask Corsello), SQL to render tentative dates differently |
| 12 | 5 superseded IST.466 files still listed as current | `bb_files` 16, 40, 58 (schedules), 35 (roster) | Materials shows four schedule versions and two rosters | SQL plus a `superseded_by` column |
| 13 | 6 orphaned Storage objects | `storage.objects` 69 vs `bb_files` 64 | Storage size never reconciles; a health panel shows a permanent discrepancy | SQL with the service key (the publishable key cannot delete) |
| 14 | 23 GEO.103 readings flagged `on_blackboard` with no URL and no bytes | `readings` | "Open" does nothing on a quarter of the reading list | Neither: they are OIA ebooks. Needs an explicit "ebook, open Blackboard" state in the UI |
| 15 | 11 readings with no `reading_progress` row | 86 readings vs 75 progress rows | Checkbox missing on 11 rows, or a null-status crash | SQL |
| 16 | `counts_attendance` null on 114 of 145 sessions | verified | Attendance-risk feature works for IST.466 only | Stack, or accept the limitation |
| 17 | 26 assignments with no `points_possible` | verified | Effort-score multiplier silently falls back to 1.0 on 40 percent of items | Mixed: some never publish points (ECN exams by design), some are re-crawl |
| 18 | 5 staff rows with null office hours, 2 with null email | `course_staff` | Course Info tab has visible holes | Stack |
| 19 | Synchrony packet is the September 2025 deck | `bb_files` 34 `notes` | An agent summarizing "the Synchrony case" summarizes last year's | re-crawl (2026 brief expected after 9/10) |
| 20 | `IST.323/presentation-choice` points conflict: BB column says 100, syllabus says ungraded | `sync_runs` id 2 `conflicts_with_confirmed_seed`, still true in run `6b122650` | A 100-point item appears in the grade denominator | SQL (already decided: exclude; needs a column to record the decision) |

---

## 12. What Blackboard exposes that we have not captured

From `PHASE2_FINDINGS.md`, `ingest/bb_crawler.js`, and the live payload shapes. Endpoints are relative to `https://blackboard.syracuse.edu`.

| Asset | Endpoint | Why a hub wants it | Effort |
|---|---|---|---|
| Gradebook attempts with per-attempt feedback and submitted files | `/learn/api/v1/courses/{C}/gradebook/columns/{colId}/attempts?userId={U}` | The crawl captures only `lastAttempt` as a summary. Attempts carry the rubric result, the attempt file, and per-attempt instructor comments. Also the only route to `my_submissions`, a `file_bucket` value with zero rows today | M |
| Group members | `/learn/api/v1/courses/{C}/groups/{G}/users` (groups themselves are already captured) | Who is on Stack's IST.352 Group 7 and IST.466 teams; names and emails for coordination. The 9/3 pull probed `/groups` and got an empty list for IST.323, but IST.352 and IST.466 return real groups now | M |
| Rubrics | `/learn/api/public/v1/courses/{C}/rubrics` and `/rubrics/{id}/rows` | IST.466 already has a rubric conflict (deck says 120 points, syllabus says 100). Rubric rows are the honest breakdown for a project or presentation, and the only way to answer "what am I actually being graded on" | M |
| Discussions | board and forum ids are readable, thread content is not: IST.471 map records "board detail 403, forum threads 404" on the v1 API | IST.471 Assignment 2 is a discussion post, GEO.103.recitation links to an "Introductions!" discussion. Without threads the app cannot show whether the post was made | L (needs the public REST API with a token, or scraping the Ultra UI) |
| Course messages | `/learn/api/v1/courses/{C}/messages` (not probed) | Instructor-to-student messages are a second announcement channel we do not read at all | M, and unverified that the endpoint exists |
| iCal feed | Calendar page share/settings UI, URL not exposed via the API | The only session-free recurring source. Worth capturing for `due_at` refresh even though `calendarItems` proved thin | S to capture the URL, M to build the poller |
| Ultra document bodies in full | `/learn/api/v1/courses/{C}/contents/{id}` | Already fetched by the crawler but truncated to 4000 characters and stored on only 8 rows. GEO.103 puts its per-week discussion questions inside these bodies, which means our copy of them is partial | S |
| Content item due dates and points | present in `contentDetail` and dropped by `slim()` in `bb_crawler.js` | `detail` keeps only `file` and `url`. `dueDate`, `points`, `gradebookColumnId`, `attemptsAllowed` are fetched and thrown away every run | S (widen the `keep` list) |
| Attendance records | Qwickly LTI, no known JSON endpoint | GEO.103 and ECN.304 attendance are graded, and we only see the rolled-up column | L, possibly impossible |
| Announcement authors | `/learn/api/v1/courses/{C}/announcements` returns them; the crawler drops the field | The GUI README's bell popout binds "course, author, date" and there is no author column in `announcements` | S |

---

## 13. Ranked summary of under-used assets

1. `bb_raw` gradebook (`effectiveScore`, `feedback`, `lastAttempt`, and Blackboard's own `Total Score`). Currently five hand-written score rows in `assignment_progress` stand in for 37 live columns. Transform effort M, unlocks grades, feedback and status without a grade engine.
2. `bb_file_text` (534 units, 949k characters). Zero GUI references. Search is effort S; reading view M; embeddings L.
3. `course_maps.gaps` and `course_fields` (44 gaps, 17 blocking unknowns). A ready-made "needs your input" queue that nothing displays. Effort M.
4. `bb_raw.groups`. Three real group memberships, one of which contradicts our own notes. Effort M with a migration.
5. `bb_content.state` and the full path tree. A Blackboard-shaped Materials browser with Started/Completed markers. Effort S.
6. `bb_files.notes` (45 of 64 rows of hand-written provenance). Effort S.
7. `assignments.series_key` (10 series, IST.323 quizzes 1 through 10). Effort S.
8. `readings` as workload rather than as a list. Folding reading load into the effort tracker changes what the tracker says, especially for ECN.304. Effort S.
9. `sessions.counts_attendance`, `notes`, and the tentative flag. Partial coverage, but IST.466 attendance is 150 of 1020 points and the app should say when a class counts. Effort S.
10. `grade_components.rank_weights` / `normalize_to` / `drop_lowest`. The declarative rules are all there; only the engine is missing. Effort L.

---

## Open questions for Stack

1. IST.466 groups: Blackboard says you are in Ethics Group 3 and Major Case Group 2. `courses.group_notes` and both course maps say Ethics Case Group #2 and Major Case Group #3. Which is right? Everything downstream (which HBR case, which presentation date) hangs on this.
2. GEO.103.recitation shows an Attendance gradebook column at 0 out of 100 (attempt recorded 9/4). Is that a Qwickly placeholder, or a real zero? If it is a placeholder, may the app suppress attendance columns from grade display entirely?
3. ECN.304 Attendance reads 100/100 and IST.323 Total Score reads 5 of 104. Do you want the app to show Blackboard's computed totals as the grade, our own projection, or both side by side?
4. The two permanently overdue rows (`IST.352/team-request` due 8/30, `IST.466/ethics-vs-activity` due 9/1) are still `not_started`. Were they done? They will sit red in Needs Attention from launch day.
5. `assignment_progress` planner fields are entirely empty (no `planned_start`, no `est_minutes`, no priority). Are you willing to fill est_minutes for the next four weeks so the effort tracker has real data, or should v1 ship on the type-based default score alone?
6. The nine dateless assignments: three are yours to resolve (SitN group and date, individual presentation date), three should arrive from Blackboard (IST.471 a7, IST.466 AI team assignment, IST.352 term project), and three are deliberate placeholders (the ECN and GEO quiz series, GEO discussion questions). Do you want the undated placeholders rendered in an "undated" lane, or hidden?
7. IST.471 has no site supervisor, no internship start date and no weekly hours, so the 150-hour requirement cannot be paced and the Learning Agreement 30-hour trigger cannot be dated. Is the hours log (T-09) in scope for v1, and if so will you enter the start date and schedule?
8. `sync_runs.summary` has a different shape in almost every row. May we freeze a required top-level contract for future runs, and backfill a normalizing view over the twelve existing rows?
9. Five staff rows have no office hours and two have no email. Is filling those a Stack task, or should the Course Info tab just show the gaps?
10. Should the app read `bb_file_text` for agent grounding (search, "what is in this week's slides"), given that PPTX extraction includes the professor's speaker notes? That is instructor material appearing in a UI it was not written for.

---

## Handoff notes

- Do not build a grade engine before wiring `bb_raw` gradebook into a typed table. The engine is effort L and only covers what our rules model; the Blackboard `Total Score` column is effort S and is authoritative. Build the cheap one first and treat the engine as a what-if layer on top.
- Whoever writes the gradebook transform: read `effectiveScore`, not `score`. `score` is null on all 37 columns in the latest run. `displayGrade` is a JSON object with a nested `score`, not a scalar.
- `v_course_grade` is referenced by `gui research context/gui/README.md` and does not exist. Any GUI mock that shows a letter grade is currently showing a fabricated number.
- `assignment_progress.effort_override` is named in `00-mvp-plan.dc.html` as new. It is still new. So is `est_minutes` in practice, since it is null on all 65 rows.
- `bb_content.detail` is JSON `null` on 112 of 139 rows, so `detail is not null` is a useless predicate. Use `jsonb_typeof(detail) = 'object'`. The DB profile's `with_detail` column is misleading for the same reason.
- `bb_content` was not refreshed by either 9/8 crawl even though `bb_raw` was. Before anyone builds a Materials tree, re-run the content transform, or the tree will render a week-old shell that is already known to have changed (the GEO.103 "Dolly Parton" item was removed, the IST.352 Project 1A item was re-created with new ids).
- The calendar endpoint is a dead end: 23 items, all gradebook echoes, no locations, some `startDate` values that are column creation timestamps. Do not plan a calendar view around it. Class meetings come from `meetings` plus `sessions`.
- `courses.bb_group_id` is single-valued and IST.466 has two groups from two group sets. That column cannot hold the truth as it stands.
- The RLS story is still unresolved (`NOTES.md` caveat 7, T-14). Every read described in this document currently requires either the service key or an authenticated session, and the desktop shell needs a decision on which before any of it ships.
