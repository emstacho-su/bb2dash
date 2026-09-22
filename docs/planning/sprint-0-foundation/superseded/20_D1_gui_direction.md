# D1 GUI direction: re-planning the product around the data that exists

Date: 2026-09-08. Agent: D1 (product and GUI direction). Inputs read in full: `docs/planning/10_R1_gui_binding_audit.md`, `11_R2_data_inventory.md`, `12_R3_pipeline_and_runtime.md`, `docs/planning/DB_VIEWS_2026-09-08.sql`, `db/migrations/001_schema.sql` and `005_file_corpus.sql` (enum definitions), `gui research context/gui/README.md`, `00-mvp-plan.dc.html`, `13-home-v2.dc.html`, `14-course-v2.dc.html`, `03-lecture.dc.html`, `04-assignment.dc.html`.

Everything below cites an R1, R2 or R3 finding or a file and column. Where I am making a judgment call rather than reporting a fact, I say so. Where I disagree with a researcher I say so and why.

---

## 0. The thesis, stated up front

The preview is a planner. The data is a library.

Count what the project actually holds: 145 sessions all with topic and `week_no`, 86 readings, 139 `bb_content` nodes, 64 files with a verified local mirror, 534 `bb_file_text` units at roughly 949,000 characters, 15 versioned `course_maps` documents carrying 44 named gaps, 35 `grade_components` rows encoding six aggregation behaviours, 11 clean `meetings` patterns, 12 staff. Against that: 66 assignments, of which 26 have no `points_possible` and 9 have no date at all, and 65 `assignment_progress` rows in which `planned_start`, `planned_finish`, `est_minutes`, `letter` and non-normal `priority` are populated on exactly zero rows (R2 section 9, verified).

So the two things the Home v2 mockup leads with, an effort tracker and a grade number, are the two things the database is least able to feed. The effort tracker is running on a type lookup table wearing a planner's clothes (R2's phrasing, section 9, and it is correct). The grade field is bound to `v_course_grade`, which does not exist and never has (R1 deep dive 3, R2 section 0, R3 stage 5). Meanwhile the three largest assets in the project, `bb_file_text`, `course_maps` and the gradebook payloads sitting in `bb_raw`, are referenced zero times anywhere in the artboards (R2 section 0).

The direction I am recommending is a reweighting, not a teardown. The layout decisions in `gui research context/gui/README.md` (top nav 1c, horizontal tracker 2a, 2-up cards 3c, bell 4a, collapsed attention row 5a, week rail 6b) are good and I keep all six. What changes is what feeds them and what sits next to them:

1. The tracker becomes a workload tracker over assignments plus readings, not an assignment tracker with a decorative R glyph. Readings outnumber assignments 86 to 66 and seven of R1's fifteen "sample" rows are readings (R1 deep dive 10). This is the single highest-leverage small change in the whole audit and nobody has it as a task item.
2. The fabricated Grade field is replaced by a snapshot of Blackboard's own computed total, clearly labelled as Blackboard's number, with our `grade_components` engine demoted to a what-if layer for v1.1 (R1 deep dive 3, R2 section 8a and handoff notes).
3. Needs attention stops being four counts scraped out of free-form jsonb and becomes a real inbox over a typed `attention_items` table, fed by the sync transform and by `course_maps.gaps` and `course_fields.stack_must_confirm` (R3 section 4.2, R2 section 4). Seventeen blocking unknowns with source citations are sitting in the maps today and no screen shows them.
4. Corpus search over `bb_file_text` moves from T-12 "Later" to a week-one feature, because the data is already there, the whole corpus fits in one model context, and an `ilike` scan over 534 rows is free (R2 section 2).
5. Freshness stops being one global "last sync today 09:14" line and becomes per data class, because grades and announcements go stale in hours while meetings and grading schemes go stale in a term (R3 section 2).
6. The agent gets a visible seam in the product, not a hidden one: a request button that writes a durable row, and two output surfaces (attention items and run reports).

Everything after this is the detail.

---

## 1. Verdicts per existing screen and feature

Vocabulary: KEEP AS IS, KEEP BUT RESHAPE, DEFER (until named data exists), CUT.

### 1.1 Home v2 (`13-home-v2.dc.html`)

Upcoming work tracker, header and day columns (sections B2 and B3 in R1). KEEP BUT RESHAPE, four changes.

First, rebind from `v_upcoming` to a new `v_workload` that unions assignments with readings, using `readings.for_date` as the date, `coalesce(reading_progress.status, 'not_started')` as the status, base effort 1, glyph R. Grounding: R1 deep dive 10 shows the tracker's R legend entry is decorative today because `v_upcoming` reads `assignments` only, and R2 section 7 shows ECN.304 alone carries 38 readings that the effort score currently ignores entirely. Without this the tracker systematically understates ECN and GEO, which are exactly the two courses that also lose the points multiplier (section 3 below). I disagree with R1's suggestion to "leave `v_upcoming` alone for compatibility": nothing consumes it yet, and keeping two definitions of what is due is precisely how the pop-down count and the card's Open count drift apart. Retire `v_upcoming` in favour of `v_workload` with a `kind` column and a `show_completed` flag.

Second, add an undated tray. Nine assignments have neither `due_at` nor `due_date` and appear in neither `v_upcoming` nor `v_overdue` (R3 stage 5, R2 punch list 6 names all nine). A calendar strip that silently omits `IST.323/sitn-group-presentation` and `IST.352/term-project` is lying by omission. The tray is a single collapsed row under the tracker reading "9 items with no date", expanding to the list with a "set a date" and an "ask the agent" action per row.

Third, the day column must render completed work rather than dropping it. `v_upcoming` excludes `submitted`, `graded`, `excused`, `not_applicable`, `waived` and `missed` (migration 009, quoted in R1 B3). That is right for a queue and wrong for a strip of days: the bar for last Wednesday shrinks retroactively as Stack marks things done, so the tracker cannot show him that he had a heavy week. Render completed segments hollow or at 30 percent opacity, controlled by `show_completed`.

Fourth, the effort bar must be honest about its own derivation. See section 3; the short version is that a segment whose height came from a base score with no points multiplier must be visually distinguishable from one that was weighted, because for both GEO shells and ECN.304 no multiplier is possible at all (R1 deep dive 1, R2 section 9).

Tracker detail panel (R1 B4). KEEP AS IS structurally. The columns (glyph, course, title, time, effort plus suggested start, status) are the right six. Two field-level notes: `it.time` can only render a `due_rule` phrase for the 35 rows with no `due_at` (R1 B5, and `due_rule` is populated on 17 of 66 per R2 section 9, so the honest fallback for the remaining 18 is a bare date with no time and no invented "11:59p"), and `it.status` needs an enum-to-label map because the stored values are `not_started`, `in_progress` and so on.

Needs attention row (R1 B5). KEEP BUT RESHAPE, and this is the biggest re-source in the document. Three of the four counts do not work today. Overdue works but has two competing definitions, one of which (`v_overdue`) excludes the three rows Stack marked `missed` (R1 B5). Conflict is unfeedable: `sync_runs.summary` is free-form jsonb whose conflict information appears under at least five different key names across twelve rows, with no structured before-and-after tuple and no way to record that something was dealt with (R1 deep dive 6, R2 section 5, R3 section 4.2). Missing is dead: the specified predicate `grading_method = 'unknown'` now matches zero rows because all six `grading_schemes` rows are confirmed (R1 B5). Deadline has no definition at all.

The reshape: bind the whole row to `attention_items` (R3 section 4.2), with the kind vocabulary widened past R3's list to include `stack_must_confirm` sourced from `course_maps.course_fields` and `gaps` where `owner = 'stack'` (R2 section 4: 17 blocking unknowns, each with a source citation, none of them displayed anywhere). Rename the row from "Needs attention" to "Inbox", because that is what it becomes: a queue Stack clears, not a status light. Each item gets a resolve action that writes `attention_items.state` and `resolution`. This one change unblocks the conflict count, the expanded conflict row, the Resolve link, most of T-04, and the entire needs-your-input feature that R2 ranks as the highest-value screen the GUI does not have.

Course cards (R1 B6). KEEP BUT RESHAPE, three changes.

The Grade slot is fabricated. `v_course_grade` does not exist, nothing in the schema computes a grade, and `assignment_progress` holds five scores (R1 deep dive 3, R2 section 6). Replace the slot with a two-line cell: line one is Blackboard's own number where a calculated column exists, labelled as Blackboard's, line two is "graded N of M items". Grounding: R2 section 8a verified that IST.323 exposes a `Total Score` column with `calc: CUSTOM`, `possible: 104`, `effectiveScore: 5`, and a `Final Letter Grade` column, and that `score` is null on all 37 gradebook column objects while the real value lives in `effectiveScore` and `displayGrade.score`. That is one transform away from a real number on every card. Two states must be explicit rather than blank: "no graded items yet" and "no scheme row" (GEO.103.recitation has no `grading_schemes` row at all). The artboard's three existing non-numeric states are stale, since IST.352 and IST.466 both have confirmed schemes now (R1 deep dive 3).

Two grade values must be suppressed from this slot outright. ECN.304 Attendance reads `effectiveScore: 100` and GEO.103.recitation Attendance reads 0 of 100 with an attempt recorded 9/4 (R2 punch list 9 and 10). The card in the mockup literally shows "attendance 100" as ECN's grade. A perfect attendance mark two weeks into term is not a grade and a Qwickly placeholder zero is not a grade. Attendance columns get flagged as non-grade signals in the gradebook transform and shown, if at all, as a separate attendance chip.

The note line takes four different sources with no precedence rule (R1 B6: `courses.group_notes`, `courses.notes`, `grade_components.notes`, or a computed status rollup). Split it into two fixed slots instead of arbitrating: a group and section badge (from the new `course_groups` table, section 2 below) and a data-state line (computed, for example "3 marked missed, 2 awaiting grade"). Course prose does not belong on a card.

The meeting and room line needs the GEO two-shell union, which the pop-down, the sub-bar and the M-F strip all need too (R1 deep dive 5). Solve it once in `v_course_display`. And surface, do not silently pick, the live conflict: `meetings.location` says Maxwell Hall 140 for GEO.103.recitation, `courses.location` and the artboard say 108, and NOTES caveat 3 flags the section as assumed (R1 B6). Render "Maxwell 108 or 140, unconfirmed" with a link to the attention item.

M-F strip. KEEP AS IS, one fix: suppress a meeting block on a day with a `sessions.kind = 'no_class'` row. There are 17 such rows across five courses (R1 deep dive 2 and 5). A holiday Monday currently shows as a meeting day.

Top nav and courses pop-down (R1 matrix A, T-16). KEEP AS IS. Everything it needs exists. One rule: the per-course "due this week" count in the pop-down and the Open number on the card must come from one view, not two queries (R1 deep dive 4).

Bell and announcements popout. KEEP BUT RESHAPE, three changes. The author field does not exist: `bb_crawler.js` line 85 drops the creator that the endpoint returns (R1 matrix A, R2 section 12). Until the crawler is fixed, fall back to the `course_staff` instructor and label it as such rather than printing a name we did not receive. The unread badge is bound to `announcements.is_read`, which is Blackboard's read state written by the crawler, so an app-side "Mark all read" gets overwritten on the next sync and the badge flaps (R1 deep dive 7, R3 section 4.1). Add an app-owned `read_at timestamptz`; the badge counts `read_at is null`. Note the badge in the mockup says 3 and the honest number today is 9. And the GEO 103 row in the mockup is fiction: GEO has zero announcements in either shell.

One addition to the bell that is worth its cost: announcements are where the ECN.304 quiz schedule actually lives, and are the only route to ECN's unannounced quizzes (R2 section 10). Each announcement row gets an "extract" action that queues an agent request whose output lands in `attention_items` for confirmation rather than straight into `assignments` (R3 section 6, item 5).

### 1.2 Course page v2 (`14-course-v2.dc.html`)

Course sub-bar. KEEP AS IS. `courses.bb_url` is set for all 7 shells (migration 004), meetings cover 6 of 7, and every shell except GEO.103.recitation has an instructor row (R1 C1).

Sticky week rail 1 to 16. KEEP BUT RESHAPE. Two changes. First, derive weeks from `terms.start_date` (2026-08-24), never from `sessions`, because IST.471 and GEO.103.recitation have zero sessions (R1 C2 and deep dive 8). Second, and this is my call rather than a repair of R1's finding: drop the "ring = graded item due that week" semantic entirely. Under the stated rule (`points_possible > 0`) GEO.103 gets zero rings for the entire semester, because both GEO shells have zero non-null `points_possible` values, and the rule also misses all three ECN.304 exams and 8 of 10 IST.323 quizzes (R1 C2). Backfilling points would repair the mechanism but the semantic is still wrong: what Stack scans a rail for is "is there anything in that week", not "is it graded". Ring means something is due; a filled centre dot means an exam or a project sits in that week (type-based, which is 66 of 66 populated). That is honest for all seven shells on day one.

Per-course tracker. KEEP AS IS, same component as Home with `where course_id = $1`, and the effort map must live in one place, not per screen. `13-home-v2.dc.html` line 106 omits `lab` from its `EFF` map while `14-course-v2.dc.html` line 102 includes it, which is exactly the drift a shared table prevents (R1 C3).

Lecture lane. KEEP BUT RESHAPE, and cut one element. The session facts are strong: 145 rows, every one with a topic and a `week_no`, with `sessions.kind` covering lecture, exam, lab, presentation, practice, guest, no_class, discussion, other (R1 C4, R2 section 10). The reading meta is usable at 76 of 86 dated. The element to cut for v1 is `l.meta` "2 files on Blackboard": `bb_files.session_id` is populated on 2 of 64 rows and `week_no` on 16 of 64, so the count is wrong or absent for five of seven courses (R1 deep dive 8, R2 section 3). Showing "0 files" where the truth is "we have not linked them" is worse than showing nothing. Restore the element after the classification pass, not before.

Two per-course adaptations the mockup does not have. IST.471 has no meetings and no sessions, so its lecture lane is empty for 16 consecutive weeks; GEO.103.recitation has a confirmed Friday meeting pattern and zero sessions (R1 deep dive 8). The course page should switch layout by course shape rather than render sixteen empty cells: a course with no sessions gets a single-lane assignment timeline, no week rail lanes, and its own panel (hours log for IST.471). That is a small amount of conditional layout that saves the worst-looking screen in the product.

Assignment lane. KEEP AS IS with two removals. Cut `a.meta` "3 attempts": `attemptsAllowed` is fetched by the crawler and thrown away by `slim()` before insert, so `bb_content.detail` holds only `file` and `url` keys (R2 section 1). Cut `a.meta` "moved to 9/9 in v1.3.1": there is no structured conflict record anywhere, only prose inside `sync_runs.summary` strings (R1 C5). Both come back once the `keep` list widens and `sync_conflicts` or `attention_items` exists.

### 1.3 Lecture popout (`03-lecture.dc.html`)

DEFER as designed, reshape into a smaller Session panel for v1.

The two sections that give this popout a reason to exist are Materials for this session and Readings for this session, and both are gated. Materials needs `bb_files.session_id`, populated on 2 of 64. Readings needs `readings.for_date`, at 76 of 86 with none of IST.466's 10 (R1 matrix D and deep dive 9). The Notes running log needs a `notes` table that does not exist. R1's judgment that the lecture popout is the weaker of the two popouts is correct and the scheduling consequence follows: do not ship these two as one unit.

The v1 Session panel keeps what is real: kicker (course, `sessions.week_no`, `session_date`, meeting window from `meetings`, room), topic, `kind` tag, previous and next session, readings for the date, and linked assignments derived by `due_at::date = session_date`. It drops Materials, the `bb_content` path line and the Notes textarea. Two provenance elements in the mockup have nowhere to live: "syllabus v1.3.1" needs a `sessions.source_ref` column that does not exist (only `assignments` has one), and "bb_content: Course Content / Week 3" needs a session-to-content link that does not exist (R1 matrix D).

The payoff for reshaping rather than cutting: once `bb_files.week_no` is filled by the classification pass, this panel is where `bb_file_text` gets rendered inline, slide by slide, with `unit_kind` and `unit_no` (R1 deep dive 9, R2 section 2). That is the difference between a link to OneDrive and reading the deck in the app.

### 1.4 Assignment popout (`04-assignment.dc.html`)

KEEP AS IS, and promote it. This is the best-fed surface in the entire product and R1's "things that surprised me" is right to flag it: `assignments.description` is populated on 66 of 66 rows with a median of 86 characters (R2 section 9), so the Instructions block never renders empty. `component_id` is null on only 6 of 66 (R2 section 9, which resolves R1's flag that the coverage was unmeasured), so the Points sub-line "Labs, 4 x 5 = 20" resolves. `series_key` gives ten real series including IST.323 quizzes 1 through 10, so the series strip works (R2 section 9). `grading_schemes.late_policy` is present on all six schemes.

Three additions and one correction. Add the instructor feedback text: `bb_raw` gradebook carries real comments and two rows already have them in `assignment_progress.feedback` (R2 section 8a), and nothing in the GUI shows feedback today. Add the Blackboard-versus-you disagreement line: `bb_submission_status` is UNOPENED on 16 rows, SUBMITTED on 2, GRADED on 3, null on 44 (R2 section 9), and a row where Blackboard says SUBMITTED and the planner says in progress is a genuine disagreement worth a chip. Critically, the UI must not render the 44 nulls as "not submitted"; null means the item has no Blackboard column. The correction: the mockup labels an external URL row ("jblearning.com, Virtual Lab") as "on disk", which is wrong. External links come from `bb_content` (2 externallink, 4 lti, 3 courselink rows) and need a third material kind with its own affordance (R1 matrix E).

One dead affordance to remove: "Open in Blackboard" in the popout footer. `assignments.bb_url` is null on all 66 rows; the crawler has `contentId` and the transform never wrote a URL (R2 punch list 7). Only `courses.bb_url` works, so the deep link goes to the course, labelled as such, until the transform fills it.

### 1.5 Planner day view (T-17) and Grades, Materials

Planner. KEEP BUT RESHAPE by absorbing T-01. Two separate week views (T-01's week grid and T-17's day schedule) is one screen too many for a product this size. Ship one Planner with a day tab and a week tab, both fed by `meetings` (11 clean patterns) plus `sessions` (145) plus workload items. Defer the "planned work windows" lane entirely: `planned_start` and `planned_finish` are null on all 65 progress rows (R2 section 9), so on day one that lane is an empty column with a hint. Ship the drag-to-plan interaction only after Stack has entered anything at all. IST.471 has neither meetings nor sessions and GEO.103.recitation has a meeting pattern but no sessions, so a Friday recitation shows a time block with no topic (R1 F, T-17); that is acceptable and should be labelled "no session recorded" rather than left blank.

Grades screens 05 and 06. RESHAPE AND SPLIT. Screen 05 (one row per course: method, current, projected, letter, confidence, graded over total) becomes a snapshot table with a "Blackboard says" column and an explicit "not computable" state for IST.471's qualitative 70/30 model, where any "your grade is X" is fiction (R2 section 6). Screen 06 becomes two panes side by side: Blackboard's number as the headline, and our `grade_components` breakdown underneath, labelled as a model and not as a grade. The rules genuinely are complete and correct in the 35 component rows, including ECN's `rank_weights` `[30,25,20]` and both drop-lowest quiz buckets (R1 deep dive 3), but the inputs are not: 5 scores, 8 `manual` components that cannot be projected from item scores at all, and three progress rows with `score_max = 0` that will divide by zero (R2 sections 6 and 9, punch list 4). I agree with R2's handoff note without reservation: do not build the engine before wiring `bb_raw` into a typed table.

Materials (T-02). KEEP AS IS and promote to a v1 core screen. R1 rates it the best-fed of the added screens: 139 content nodes all with a non-null `path`, 64 files all with `storage_path`, `local_path` shipped in migration 005 and 60 of 60 validated by sha256 in run 12. Four preconditions before it renders: fix the 11 rows titled `ultraDocumentBody` with a fallback to the parent path segment (R2 punch list 2), filter the 5 superseded IST.466 documents which currently need a `superseded_by` column rather than a `notes` convention (R2 punch list 12), re-run the content transform because `bb_content` was not refreshed by either 9/8 crawl and tops out at 9/2 (R2 handoff note), and surface `bb_files.notes` on hover since 45 of 64 rows carry hand-written provenance that nothing reads (R2 section 3).

### 1.6 Task items T-01 to T-17

| Task | Verdict | Grounding and what changes |
|---|---|---|
| T-01 Planner / week view | KEEP BUT RESHAPE, merge into T-17 | Two week views is one too many. The planned-work lane has no data: `planned_start` 0 of 65 (R2 section 9) |
| T-02 Materials library | KEEP AS IS, promote to core | Best-fed added screen (R1 F). Blocked only on the four fixes above |
| T-03 Announcements inbox | KEEP BUT RESHAPE | Author is MISSING-INGEST (R1 matrix A); `is_read` needs an app-owned `read_at` (R3 4.1); add the extract-to-attention action (R2 section 10) |
| T-04 Sync and data health | KEEP BUT RESHAPE, rename to Activity | `sync_runs.summary` has no contract across 12 rows (R2 section 5). Rebuild on `attention_items` plus the fixed summary envelope (R3 4.4) |
| T-05 Course info tab | KEEP BUT RESHAPE | Feed it from `course_maps` rather than re-deriving (R2 section 4). Show the holes: 5 staff with no office hours, 2 with no email (R2 section 10). Measure `grading_schemes.letter_scale` before promising a letter scale (R1 handoff) |
| T-06 Status quick-edit | KEEP AS IS | All columns exist; it is the write that makes every planner feature real (R2 section 9). Gated on T-14 |
| T-07 Grade forecaster | DEFER to v1.1 | Needs a grade store and the engine. Effort L in R2 section 6, and it depends on `v_course_grade` which does not exist |
| T-08 Readings tracker | PROMOTE from Should to Must, and reshape | Not a separate tracker. Readings join `v_workload` and appear as R bars (R1 deep dive 10, R2 section 7). Insert the 11 missing `reading_progress` rows first (R2 punch list 15) |
| T-09 Internship hours log | DEFER until Stack supplies inputs | `internship_hours` does not exist and IST.471 has no supervisor, no start date, no weekly hours (R2 section 4). Until then the card slot reads "not tracked", not "0 / 150 hrs" |
| T-10 Per-lecture notes | DEFER | New `notes` table. `assignment_progress.notes` already exists and has 15 rows, so assignment-level notes ship in v1 and session-level notes wait |
| T-11 Series view | KEEP AS IS | 10 real series (R2 section 9). Cheap and already supported |
| T-12 Command palette and search | PROMOTE from Later to Must | 534 `bb_file_text` units, zero GUI references, `ilike` is adequate at this size (R2 section 2). The cheapest high-value feature in the inventory |
| T-13 Local file mapping | Already done, reclassify | `local_path` shipped in migration 005, run 12 verified 60 of 60 by sha256 (R1 "things that surprised me") |
| T-14 Auth before browser | PROMOTE to task zero | Every write element in R1's matrices is gated on it. Option A, Supabase Auth with the existing permissive `authenticated` policies, needs no RLS changes (R3 section 5) |
| T-15 Effort score | KEEP BUT RESHAPE | See section 3 |
| T-16 Top navbar and pop-down | KEEP AS IS | 7 courses, 11 announcements, everything available (R1 F) |
| T-17 Daily schedule | KEEP, absorbing T-01 | 11 meeting patterns, 145 sessions. IST.471 has neither (R1 F) |

---

## 2. New features the data enables, ranked by value to Stack over effort

Effort tags follow R2: S is a day or less inside the app, M is a few days or a new view plus UI, L is a new ingest path, new table or a real engine. Value is my judgment of how much it changes what Stack can do on a Tuesday morning. The ranking is value divided by effort, most worth building first.

### Rank 1. Corpus search over `bb_file_text` (value high, effort S)

What it shows: one search box (command palette, cmd-K) that returns file name, course, bucket, unit number and a text snippet across every document a professor posted, filterable by course and by `file_bucket` (the ten-value enum from migration 005: `syllabus_policy`, `schedule`, `lecture_slides`, `readings`, `assignment_spec`, `lab_materials`, `project_materials`, `my_submissions`, `admin`, `media_links`, `unclassified`).

Tables and columns: `bb_file_text.text`, `.unit_kind`, `.unit_no`, `.char_count`, joined to `bb_files.file_name`, `.course_id`, `.bucket`, `.local_path`.

What must be true first: nothing. 534 rows across 63 of 64 files, and a sequential scan is fine (R2 section 2). Two display rules are mandatory: strip the running `Page N` headers and case-number watermarks that PDF extraction leaves on every HBR page, and either strip or explicitly label the `[notes]` marker that PPTX extraction uses for the professor's speaker notes, because a snippet can otherwise show private instructor notes as if it were slide text (R2 section 2 and open question 10). If the corpus grows, add a `tsvector` generated column with a GIN index; that is the M version.

### Rank 2. Attention inbox, including the needs-your-input queue (value very high, effort M)

What it shows: one list, grouped by kind, of everything the system knows it does not know or cannot reconcile. Kinds: `conflict`, `stack_must_confirm`, `missing`, `overdue`, `deadline`, `stale`. Each row carries the question, the source citation, a suggested answer where one exists, and a resolve action.

Tables and columns: the new `attention_items` from R3 section 4.2 (`kind`, `course_id`, `ref`, `question`, `suggested`, `state`, `resolved_at`, `resolution`), seeded from three places: the sync transform for conflicts, `course_maps` for the 17 `course_fields` entries with `stack_must_confirm: true` and a null value plus the 44 `gaps` entries where `owner = 'stack'` (R2 section 4), and a nightly or on-open scan for concrete data holes (courses without a `grading_schemes` row, assignments without a date or without `points_possible`, readings without `for_date`).

What must be true first: the `attention_items` table exists and the transform writes to it. That is one migration plus transform work. The examples R2 lists are decision-blocking rather than cosmetic: IST.471 has no supervisor name, no internship start date and no weekly hours, so the 150-hour requirement cannot be paced; IST.323 has no Security-in-the-News group number, so the presentation date cannot be resolved even though the group-to-date map is sitting in `courses.group_notes`.

I rank this above the grade snapshot because it is the feature that makes bb2dash better than Blackboard rather than a nicer view of it.

### Rank 3. Grade snapshot from Blackboard's own totals (value high, effort M)

What it shows: a real number per course on the card and on the Grades screen, labelled as Blackboard's calculation, plus a letter where the `Final Letter Grade` column has one, plus "graded N of M items".

Tables and columns: a new `course_grade_snapshot(course_id, source, score, possible, display, letter, column_name, calc, captured_at, run_id)` written by a transform over `bb_raw` `payload -> 'gradebook'`. Read `effectiveScore` and `displayGrade.score`, not `score`, which is null on all 37 column objects in the latest run (R2 section 8a and handoff note; this is the single most expensive mistake available to whoever writes the transform). The authoritative example is IST.323's `Total Score` column with `calc: CUSTOM`, `possible: 104`, `effectiveScore: 5`.

What must be true first: the transform, plus a rule that flags attendance columns as non-grade so ECN's 100 of 100 and GEO.103.recitation's 0 of 100 do not render as grades (R2 punch list 9 and 10). Also needs Stack's answer to open question 3 below.

### Rank 4. Readings as workload in the tracker (value high, effort S)

What it shows: R bars in the day columns and R rows in the detail panel, with a checkbox that writes `reading_progress.status`.

Tables and columns: `readings.for_date`, `.citation`, `.required`, `.on_blackboard`, `.url`, joined to `reading_progress.status`, unioned into `v_workload`.

What must be true first: insert the 11 missing `reading_progress` rows or make every join a LEFT JOIN with a `not_started` default (R2 punch list 15). And the Open action needs a three-way resolution: local file first (13 readings have bytes), then URL (29 have one), then an explicit "ebook, open in Blackboard" state for the 23 GEO.103 Orange Instant Access chapters that have neither and never will (R2 section 7). Do not render an Open button that does nothing on a quarter of the reading list.

### Rank 5. Sync status per data class, and an honest "sync now" (value high, effort S to M)

Covered in full in section 4.

### Rank 6. Agent request button (value high, effort S)

What it shows: one affordance in the top bar plus contextual buttons where a gap is visible. Writes a durable row and reports its state.

Tables and columns: the new `agent_requests` from R3 section 4.2 (`kind`, `scope`, `params`, `state`, `claimed_at`, `finished_at`, `sync_run_id`, `result`).

What must be true first: the table, and T-14 auth so the app can write it. Covered in section 5.

### Rank 7. Feedback inbox (value medium-high, effort S once rank 3 exists)

What it shows: every graded item with non-empty instructor feedback, cross-course, with score and attempt timestamp. Today nothing in the GUI shows feedback at all.

Tables and columns: `bb_raw` gradebook `feedback` and `lastAttempt` (`{status, created, submitted, score}`), landed into the new `assignment_grades` table (R3 section 4.1). Two rows already carry real instructor text, both IST.352 reading items (R2 section 8a).

What must be true first: the gradebook transform from rank 3, and the `assignment_progress` split so grade facts stop living in a table the app owns.

### Rank 8. Group and team panel (value medium-high, effort M)

What it shows: a badge on the course card and a panel on the Info tab naming Stack's group per course, its set, and its description, plus what that membership determines (which HBR case, which presentation slot).

Tables and columns: a new `course_groups(course_id, bb_group_set_id, bb_group_id, title, description, seen_at)` from `bb_raw` `payload -> 'groups'`. This requires a table because `courses.bb_group_id` and `bb_group_set_id` are single-valued and IST.466 has two groups from two different group sets (R2 section 8b).

What must be true first: Stack resolves the contradiction. Blackboard says Ethics Group 3 and Major Case Group 2; `courses.group_notes` and both course maps say Ethics Case Group #2 and Major Case Group #3 (R2 punch list 1). The numbers are swapped, one record is wrong, and the app will display whichever it reads with full confidence. This is the single most consequential data conflict in the project because it selects which case Stack presents and on which date. Until it is resolved the panel should show both and say they disagree.

### Rank 9. Planner fields as the effort tracker's real input (value medium-high, effort S)

What it shows: the assignment popout's Estimate field feeding the tracker directly, so that entering "120 min" changes the bar height on Home.

Tables and columns: `assignment_progress.est_minutes` (exists, null on all 65 rows), `planned_start`, `planned_finish`, plus the new `effort_override`.

What must be true first: the effort ladder in section 3, which makes `est_minutes` the second rung. This is the feature that converts the tracker from a lookup table into a planner, and it costs one write path plus a formula. It also answers R1's open question 12 without making Stack maintain two numbers.

### Rank 10. "This week's slides" digest (value medium-high, effort S for the query, M in total)

What it shows: on the course page and in the Session panel, a short digest of what is in this week's posted materials, generated by the agent from the extracted text.

Tables and columns: `bb_file_text` joined through `bb_files.week_no` or `.session_id`, output stored in a small `agent_outputs(kind, ref, body_md, source_refs, generated_at, run_id)` table so it renders with a byline rather than as course data.

What must be true first: the linkage. Only 16 of 64 files carry `week_no` and only 2 carry `session_id` (R2 section 2 coverage constraint, R1 deep dive 8), so today the feature resolves for ECN.304 and a few IST decks and nothing else. The fix is an offline classification pass over the existing corpus, setting `week_no` from filename and path, then `session_id` from (course, week, bucket in lecture_slides or readings). No Blackboard access needed; the files are already downloaded and their text already extracted. R1 ranks this the second-largest gap in the audit and I agree with the ranking.

### Rank 11. Office hours and staff panel (value medium, effort S)

What it shows: staff, role, email, office hours on the Info tab. Tables: `course_staff`. Honest holes: office hours null on 5 of 12, email null on 2 (R2 section 10), and Cohen's missing email is itself a blocker on the IST.471 Registrar form. Show the gap as a gap with an "ask" action, do not hide the row.

### Rank 12. Blackboard content progress and provenance in Materials (value medium, effort S)

`bb_content.state` (Started 44, Completed 5, None 90) is Ultra's own module progress marker and nothing in the app shows it (R2 section 1). `bb_files.notes` carries hand-written provenance on 45 of 64 rows, including why a file was renamed and that the IST.466 rubric deck says 120 points where the syllabus says 100 (R2 section 3). Both are hover-level detail in the Materials pane, cheap, and they answer "why does this file look wrong".

### Rank 13. Attendance-matters badge (value medium, effort S, narrow)

`sessions.counts_attendance` is populated only for IST.466 (8 true, 23 false) and null on all 114 rows in the other five courses (R2 section 10). IST.466 attendance is 150 of 1020 points, so the badge is genuinely useful there and impossible everywhere else. Ship it scoped to IST.466 and say so, or skip it. I would ship it: a one-course feature that is right beats a seven-course feature that is null.

### Rank 14. What-if grade projection per grading method (value high, effort L)

DEFER to v1.1. The declarative rules are all present (`aggregation` across six behaviours, `rank_weights`, `drop_lowest`, `normalize_to`, `count_expected`) and the engine is genuinely missing (R2 section 6, R1 deep dive 3). Two of the six behaviours are single instances and both are hard: ECN.304's rank-weighted exams are order-dependent and non-linear in any individual exam, and IST.323's quizzes normalize to 5 across 10 expected items. The engine must also decline gracefully on 8 `manual` components and on IST.471's qualitative model. Build it after the snapshot, as a labelled model, never as "your grade".

### Not worth building

The Blackboard calendar endpoint. R2 section 8c verified all 23 items are gradebook column echoes with null locations and several `startDate` values that are the column's creation timestamp. It adds nothing the gradebook does not already give and it adds noise. Mark it evaluated and low value rather than pending. The iCal feed is a different thing and is still worth capturing (section 4).

---

## 3. T-15, the effort score, as it should actually work

The current specification is: base by `assignment_type`, times `points_possible / course median points` clamped 0.5 to 2.0, with `assignment_progress.effort_override` winning. Four things are wrong with it against the real data.

`points_possible` is null on 26 of 66, and the holes cluster on exactly the heavy items: exam 4 of 9, final_exam 0 of 1, quiz 6 of 17 (R1 deep dive 1).

The course median, which is what the multiplier divides by, does not exist for both GEO shells (zero non-null values) and is degenerate for ECN.304 (exactly one value, so every other ECN item multiplies against that one item's own points). The multiplier is usable for 4 of 7 shells, degenerate for 1, impossible for 2 (R1 deep dive 1).

Seven of 66 rows have types with no base score at all: `other` (3), `checkpoint` (2), `meeting` (1), `evaluation` (1). And the enum has 19 values, not the 18 R1 counted: `exam, final_exam, quiz, lab, homework, reading, presentation, group_presentation, project, paper, discussion_post, form, checkpoint, meeting, evaluation, activity, attendance, participation, other` (migration 001 lines 20 to 24).

The artboards use the key `discussion` where the enum value is `discussion_post`, and `13-home-v2.dc.html` line 106 omits `lab` entirely while `14-course-v2.dc.html` line 102 includes it.

### The rule set

A table, not a constant in a component:

```sql
create table effort_base (
  type        assignment_type primary key,
  base        numeric(4,2) not null,
  in_workload boolean not null default true
);
```

Values, covering all 19 enum members. `in_workload = false` means the type is scored but excluded from day-load sums and from the tracker, because it is a continuous obligation rather than a discrete piece of work:

| type | base | in_workload |
|---|---|---|
| final_exam | 10 | true |
| exam | 8 | true |
| project, paper, group_presentation | 6 | true |
| lab, presentation | 4 | true |
| quiz | 3 | true |
| homework, activity | 2 | true |
| other | 2 | true |
| discussion_post | 1.5 | true |
| reading, form, checkpoint, evaluation | 1 | true |
| meeting, attendance, participation | 0.5 | false |

Two calls in there worth naming. `other` gets 2, the modal value, rather than 0 or undefined, so the three `other` rows never render as a zero-height bar. And `meeting`, `attendance` and `participation` are excluded from the tracker rather than given a tiny bar, because attendance is not something Stack schedules time for; if attendance ever needs surfacing it belongs on the Planner day view, not in the workload bar.

### The fallback ladder

First match wins. Every rung sets a `source` value that the UI can show:

1. `assignment_progress.effort_override` is not null. Use it. Source `override`, chip "yours". This column does not exist yet and must be added; it is unambiguously app-owned (R3 section 4.1).
2. `assignment_progress.est_minutes` is not null. Effort is `clamp(est_minutes / 45.0, 0.5, 12)`, rounded to the nearest 0.5. Source `estimate`, chip "from your estimate". Forty-five minutes per effort point ties the abstract unit to wall clock and makes the 8-point exam read as six hours, which is about right.
3. Base times multiplier, where the multiplier is `least(2.0, greatest(0.5, points_possible / course_median))` and applies only when the course qualifies (below) and `points_possible > 0`. Source `weighted`.
4. Base alone, when the course does not qualify or the item has no points. Source `base`.
5. Type not present in `effort_base`. Use 2 and write an `attention_items` row of kind `missing`. Never render `undefined`. With the table above this rung is unreachable, which is the point: it exists so that a future enum addition degrades instead of breaking.

The multiplier gate: a course qualifies when it has at least 5 non-null positive `points_possible` values. Against today's distribution that admits IST.323 (17), IST.352 (9), IST.466 (7) and IST.471 (6), and excludes ECN.304 (1) and both GEO shells (0). R1 proposed `n >= 3`; I raise it to 5 because 3 is only one value away from ECN's degenerate case and buys nothing, since no course sits between 1 and 6. State the threshold in one place so it can be changed once.

The median itself comes from a view over non-null positive values only, per course, with the GEO shells unioned into one display course so that a future GEO points backfill in either shell benefits both.

### What the UI owes the user

The multiplier is applied to four of seven courses and cannot be applied to three. That means ECN.304 and both GEO shells will systematically read lighter than IST items of equivalent weight (R1 deep dive 1 second-order problem). Three obligations follow.

Every effort figure carries its source. In the detail panel the `effLabel` becomes "3 pt" for `base`, "3 pt weighted" for `weighted`, "3 pt est" for `estimate`, "3 pt set" for `override`. In the day column, base-only segments get a dotted top edge. This is a small visual cost for a large honesty gain.

The Home header's total effort number gets a hover explaining that it mixes weighted and unweighted courses. Do not drop the number; a rough total is still the most useful single figure on the screen.

The per-course tracker on the course page should say, once, under the header, whether the multiplier applied for that course. For GEO and ECN that line reads "effort is by type only, this course has no published point values", which is both true and a nudge toward filling them in.

### Suggested start date

Keep `start = due − (ceil(effort / 2) − 1) days`, with one change: skip dates that have a `sessions.kind = 'no_class'` row for that course. Seventeen such rows exist across five courses (R1 deep dive 2), and without the skip a 10-point final gets a four-day lead that runs straight through Thanksgiving. Do not skip weekends. Stack is a senior with seven courses; weekends are working days and pretending otherwise compresses every deadline. That is a judgment call and it is question 14 below.

Undated items get no start date and no bar. They live in the undated tray with a "no date" chip.

### One deliberate omission

Reading length. Thirteen readings link to a harvested file with a `char_count` in `bb_file_text`, which would let a 24,000-character chapter score higher than a title slide. Thirteen of 86 is not enough coverage to be worth the inconsistency, so all readings score 1 in v1. Revisit if the OIA ebooks ever yield text, which they will not.

---

## 4. Freshness UX

R3 section 2 establishes the design fact: submission status, grades, announcements and new items go stale in hours, while meetings, staff, grading schemes and stored materials go stale in a term. R3 section 3.3 establishes the operational fact: any crawl needs a live Blackboard session, a live session needs Duo, and the planned scheduled Claude task will report SESSION EXPIRED on most of its firings. Both facts have to be visible in the product without turning it into a nag.

### One timestamp is a lie; use six

The mockup's "last sync today 09:14" (`13-home-v2.dc.html`, needs-attention row) is a single global number applied to everything. It is wrong in both directions: it makes a term-static meeting pattern look like it needs refreshing, and it makes a grade posted twenty minutes ago look as trustworthy as one from 09:14. Replace it with per-class freshness.

Six classes, matching R3's sensitivity table:

| Class | Backing tables | Goes stale in | Chip shown |
|---|---|---|---|
| Grades and submissions | `assignment_grades` (new), `assignments.bb_submission_status` | hours | always |
| Announcements | `announcements` | hours | always |
| Deadlines and items | `assignments.due_at`, `.due_date` | hours to a day | always |
| Files | `bb_files` | a day or two | on Materials only |
| Schedule | `sessions`, week rail | weeks | only when older than 14 days |
| Structure | `meetings`, `course_staff`, `grading_schemes`, `grade_components` | a term | never |

The rule R3 states and I am adopting verbatim: static surfaces never show a sync indicator, because doing so trains Stack to ignore it.

Implementation: a small `sync_class_status(class, last_ok_at, last_run_id, rows_changed)` table written by the transform at the end of each run, one row per class it actually touched. This is deliberately not derived from `sync_runs.summary`, because a run that crawled but did not fold `bb_raw` into typed tables has refreshed nothing, and the summary cannot express that distinction today.

Three states per chip: fresh under 12 hours, aging 12 to 36 hours, stale over 36 hours or never synced this term. Colour plus text, never colour alone. A number rendered from a stale class gets a dotted underline in place, not a banner over the screen; content is never blocked or hidden because it is old. Grades and submission status get the strongest treatment, because those are the two that will be wrong in a way Stack acts on.

One more honest signal, cheap and important: `assignments.bb_last_seen` is itself stale, with 29 rows stamped 2026-09-02, 4 stamped 9/08 and 32 null (R2 punch list 8). Until the transform stamps it on every run, do not render "last seen in Blackboard today 09:14" in the assignment popout footer. Render nothing, or render the actual stamp with its actual date. A week-old timestamp presented as today is worse than no timestamp.

### "Sync now" when the crawl needs a human

The action must not pretend the app is doing the work. It is not; it is filing a request that Stack and a Claude session then fulfil.

The control is labelled "Refresh from Blackboard" and opens a small sheet with three visible steps:

Step one, the app writes an `agent_requests` row (`kind: 'sync'`, `scope: 'all'` or a course id) immediately, before anything else. This is the durable part and it survives the app being closed, a failed terminal launch, and Stack getting distracted (R3 section 4.3, mechanism 1).

Step two, the app offers to open Blackboard in the default browser so Stack can clear NetID and Duo, and shows a plain sentence saying why: the crawl runs inside a logged-in tab and nobody can automate past Duo.

Step three, the app attempts to launch a terminal in the repo with the command prefilled (`child_process.spawn` of `wt.exe` in Electron, per R3 section 4.3, mechanism 2), and falls back to copying the command to the clipboard with a toast (mechanism 3). Stack presses enter. R3 is right that a human in the loop costs nothing here, because Duo needs him anyway.

The sheet then polls `agent_requests.state` and `sync_runs.status` and shows what is happening. This requires R3's additions to `sync_runs` (`status`, `started_at`, `finished_at`, `trigger`, `request_id`), and specifically the `running` value written before the first fetch, because today a run that dies mid-crawl leaves nothing behind at all and a partial `run_id` in `bb_raw` looks exactly like a complete one (R3 stage 1, fragility 1). The UI rule that follows: a run in `running` state for more than 15 minutes is displayed as "no result, probably interrupted", not as a spinner. Never show an indefinite spinner for work that another process may have abandoned.

Nagging policy: check the most sensitive class's age once, at app open, and prompt once if it is over threshold. No timers, no repeat prompts in a session, no badge that counts up. R3 section 3.3 proposes exactly this and it is right; it needs no daemon and it is identical in either shell.

### Distinguish automatic from manual freshness

If Stack captures the Blackboard Ultra iCal share URL, due dates can refresh nightly through a Supabase Edge Function on `pg_cron` with no browser and no Duo (R3 section 3.3, `.env.example` has `BB_ICAL_FEED_URL=` empty). That is the only genuinely unattended source available to this project and it costs one visit to the calendar settings gear.

The freshness panel should distinguish the two kinds of currency: classes marked "auto" refresh themselves, classes marked "needs you" do not. Today every class is "needs you". Making that visible is the strongest argument the product can make for Stack spending five minutes on the iCal URL, which is why the panel should be built to show the distinction before the feed exists.

---

## 5. The agent seam from the user's side

Constraint from the 00 brief, decision 2: Claude Code plus skills run beside the app, the CLI is the agent, the GUI is the read and plan surface, no in-app chat in v1. The seam must therefore be a small number of durable rows, not a conversation.

### How Stack asks

Exactly three affordances, and no more in v1.

One global "Ask" control in the top bar's right cluster. It opens a sheet with a short fixed list of request kinds, each a single click: sync everything, refresh this course, pull files for this course, re-map this course, and one freeform box. Each writes one `agent_requests` row with `kind`, `scope`, and `params` (R3 section 4.2). Freeform text goes in `params.text` and is the escape hatch for anything the fixed list does not cover. This is not a chat: there is no reply in the app, and the sheet says so.

Contextual asks, placed where the gap is. An empty Materials section on the Session panel gets "ask the agent to link this week's files". A stale grade chip gets "refresh grades". An `attention_items` row gets "have the agent try". Each writes the same kind of row with `ref` set to the thing on screen. This matters more than the global control, because the moment Stack notices a hole is the moment the request is worth making, and making him navigate to a sync screen to file it loses the context.

The badge. The Ask control shows the count of `agent_requests` rows in state `queued`. If a request has been queued more than an hour, the badge changes tone and the sheet says "no agent session has picked this up", because that is the actual failure mode of an asynchronous seam and Stack should never be left wondering.

The visible state machine is four words: queued, claimed, done, failed. Nothing else.

### How agent output surfaces

Three places, each with a different contract.

Attention items, for anything that needs a decision from Stack. This is the primary channel and it is where announcement extraction, conflict detection and the `course_maps` unknowns all land. Critical rule, and this is R3's and I endorse it without qualification: parsed announcement facts go to `attention_items` for confirmation, never straight into `assignments` (R3 section 6, item 5). The app renders the suggestion, Stack accepts or rejects, and the acceptance is recorded.

Run reports, on the Activity screen. Last run, its status, and the fixed `summary` envelope from R3 section 4.4: `counts` for the numbers, `changes` for the human-readable diffs ("Quiz 1 graded, null to 9/10", "instructor deleted and re-created; new column id"), `errors` for what failed. Three trivial queries give the GUI its three answers. This replaces the current situation where conflict information hides under five different key names across twelve rows (R2 section 5).

Generated prose, in a small `agent_outputs(kind, ref, body_md, source_refs jsonb, generated_at, run_id)` table. Session digests, "what is in this week's slides", a summary of a long assignment spec. These render inline where `ref` points, always under a byline reading "generated by the agent on <date> from <source files>". Never rendered as if it were course data, never mixed into a `description` field, and always with the source files listed so Stack can open the actual deck. If Stack edits a generated summary, the edit goes in a separate app-owned column and the agent never overwrites it.

### How Stack answers back

This is the piece both R2 and R3 leave open and it needs a decision. R2 section 4 calls writing answers back "the hard half" because every confirmed field has a different target column. R3 section 4.1 puts `courses`, `course_staff`, `meetings`, `grading_schemes` and `assignments` firmly in agent-writes-app-reads.

My proposal reconciles them: the app never writes those tables directly. When Stack answers a `stack_must_confirm` question, the app writes the answer into `attention_items.resolution` as jsonb and flips `state` to `resolved`. The agent applies resolutions on its next run, as part of the transform, and records what it applied in the run's `changes` array. This keeps R3's clean table boundary, gives Stack a place to answer that is one click from where the question was asked, and makes the application auditable. The cost is a delay: an answer given at 9am does not change the typed tables until the next agent run. That is acceptable and it should be visible, so a resolved item shows "answered, will apply on next sync" until it does.

### What v1 must not do

No in-app chat. No streaming output. No agent write path into `assignment_progress` or `reading_progress`, ever, under any circumstance, including "just this once to backfill". No generated text without a byline. No request kind that the CLI side does not actually implement, because a button that files a request nothing handles is worse than no button.

---

## 6. Information architecture for v1

### Nav

Top bar, keeping decision 1c. Primary destinations, four: Today, Planner, Grades, Materials. Right cluster, four controls: ☰ Courses (pop-down straight to a course page), bell (announcements), activity (attention inbox count plus agent queue count, combined into one indicator), user.

Search is a command palette on cmd-K rather than a nav item, so it is reachable from every screen without spending a slot in a four-item bar. Sync and data health is not a nav item either; it lives behind the activity indicator, because it is something Stack visits when something is wrong, not something he browses.

Inside a course, the second thin bar keeps Stream, Grades, Materials, Info, plus meeting time, room, instructor and the Blackboard link.

Six courses, seven shells. GEO.103 lecture and recitation merge into one course everywhere through `v_course_display`; the recitation does not get its own page. R1 deep dive 5 identifies four separate places that currently need this merge, which is four reasons to do it once in a view.

### Screens

| Screen | Reads | Writes | Notes |
|---|---|---|---|
| Today | `v_workload`, `v_course_display`, `attention_items`, `announcements` plus `read_at`, `course_grade_snapshot`, `sync_class_status` | `assignment_progress.status` (quick-edit), `announcements.read_at`, `agent_requests` | The tracker, the inbox row, the cards, the undated tray |
| Course page (Stream) | `sessions`, `readings`, `v_workload` scoped, `assignments`, `terms` for the rail | `assignment_progress`, `reading_progress`, `agent_requests` | Layout adapts by course shape; no-session courses drop the lecture lane |
| Course Grades | `course_grade_snapshot`, `assignment_grades`, `grade_components`, `grading_schemes` | none in v1 | Blackboard's number as headline, our breakdown as a labelled model |
| Course Materials | `bb_content` tree via `path`, `bb_files`, `bb_files.notes`, `v_file_layout`, `bb_file_text` | `agent_requests` | Filter superseded, fix `ultraDocumentBody` titles, open local file |
| Course Info | `v_course_map_latest`, `course_staff`, `meetings`, `grading_schemes`, `course_groups` | `attention_items.resolution` | Fed from the map, gaps shown as gaps |
| Planner (day and week) | `meetings`, `sessions`, `v_workload` | `assignment_progress` (status, planned dates, est_minutes) | Work-windows lane deferred until data exists |
| Grades (all courses) | `course_grade_snapshot`, `grading_schemes` | none in v1 | Explicit not-computable state for IST.471 |
| Materials (library) | `bb_content`, `bb_files`, `bb_file_text` | `agent_requests` | Cross-course, plus corpus search results |
| Announcements | `announcements`, `read_at`, `course_staff` for the author fallback | `announcements.read_at`, `agent_requests` | Extract action queues an agent request |
| Activity | `attention_items`, `sync_runs`, `agent_requests`, `sync_class_status` | `attention_items.state` and `.resolution`, `agent_requests` | T-04 grown up |
| Command palette | `courses`, `assignments`, `bb_files`, `bb_file_text` | none | cmd-K overlay, not a screen |
| Assignment popout | `assignments`, `assignment_grades`, `grade_components`, `bb_files`, `bb_content` links, series | `assignment_progress` (all fields including new `effort_override`) | Best-fed surface; ships first |
| Session panel | `sessions`, `readings`, `meetings`, derived linked assignments | `reading_progress` | Reshaped 03; Materials block deferred |

### Table ownership

I align with R3 section 4.1 with three modifications.

Agent writes, app reads: `bb_raw`, `bb_content`, `bb_files`, `bb_file_text`, `course_maps`, `courses`, `course_staff`, `meetings`, `sessions`, `readings`, `assignments`, `grading_schemes`, `grade_components`, `announcements`, `sync_runs`, plus the new `assignment_grades`, `course_grade_snapshot`, `course_groups`, `sync_class_status`, `agent_outputs`, `effort_base`.

App writes, agent reads and never overwrites: `assignment_progress` (now 100 percent app-owned once the grade facts move out), `reading_progress`, `agent_requests`, `announcements.read_at`.

Shared, with a strict protocol: `attention_items`. The agent inserts and sets `suggested`; the app sets `state`, `resolved_at` and `resolution`; the agent reads resolutions and applies them but never rewrites a resolution.

Modification 1, and my strongest agreement with R3: split `assignment_grades(assignment_id pk, score, score_max, letter, graded_at, submitted_at, feedback, bb_submission_status, seen_at, run_id)` out of `assignment_progress`. This turns a column-by-column convention into a table boundary, makes it impossible for a sync to clobber planner state by accident, and gives the GUI a place to render the disagreement "Blackboard says SUBMITTED, you marked in progress", which is a real thing worth showing. It also removes the awkwardness that `assignment_progress.score` currently holds five rows that were hand-written in SQL (R2 section 8a).

Modification 2, where I differ from R3 in emphasis rather than substance: R3's ownership table has no path for Stack to answer a question about an agent-owned table. Section 5 above supplies it through `attention_items.resolution`. Without that, R2's highest-value feature (the needs-your-input queue over 17 blocking unknowns) has a UI and no write path, which is exactly the half R2 called hard.

Modification 3, small: `reading_progress` is app-owned but 11 of 86 readings have no row at all (R2 punch list 15). Either the agent inserts the missing 11 as part of the next transform, or the app upserts a `not_started` row on first write. I prefer the agent inserting them now, because it keeps the app's write path to a plain update.

On the shell, I am not the runtime agent, but there is one product consequence of R3's Electron recommendation worth recording here. If the shell later hosts the Blackboard webview, "Refresh from Blackboard" stops being "go do a thing in another window" and becomes one click plus a Duo push, and the entire freshness UX in section 4 gets simpler. That difference is large enough that R3's proposed 30-minute spike on whether Entra plus Duo tolerates an embedded webview should happen before the freshness UI is finalized, not after. For the same product reason (spawn a terminal, open local files from the OneDrive mirror, possibly host that webview) I agree with Electron for v1.

### Build order

Nothing in v1 works without T-14, so it is task zero: Supabase Auth, one user, existing permissive `authenticated` policies, no RLS changes (R3 section 5, option A). Everything after it is UI plus the data-shape work R1's handoff note warns about: if the app phase is scheduled UI-first, Home ships with a working tracker, a working bell and three broken counters.

My ordering: T-14 auth; the `attention_items` and `agent_requests` migration; the `bb_raw` gradebook transform plus `assignment_grades` and `course_grade_snapshot`; `v_workload` with readings and the `effort_base` table; the assignment popout and Today; corpus search; Materials with its four fixes; Course page; Planner; Grades; Activity. The file classification pass (`week_no`, then `session_id`) can run in parallel at any point and unblocks the Session panel's Materials block and the "this week's slides" digest.

---

## Open questions for Stack

Numbered, and grouped so you can answer in one sitting. Questions 1 to 6 change what the UI displays and I cannot proceed honestly without them.

1. IST.466 groups. Blackboard says Ethics Group 3 and Major Case Group 2; `courses.group_notes` and both course maps say Ethics Case Group #2 and Major Case Group #3. Which is right? This selects which HBR case you present and which of the 10/20 or 10/22 and 11/17 or 11/19 slots is yours, and the app will show whichever it reads with full confidence.
2. GEO.103.recitation room. `meetings.location` says Maxwell Hall 140, `courses.location` and the mockup say Maxwell 108, and NOTES caveat 3 flags the section as assumed. Which is right? Until you say, the card will show both.
3. Grade display. May v1 show Blackboard's own calculated Total (IST.323 `Total Score` reads 5 of 104 today) as the number on cards and the Grades screen, with our `grade_components` engine reserved for a what-if layer later? That is one transform versus several weeks of engine work.
4. Attendance columns. ECN.304 Attendance reads 100 of 100 after two weeks and GEO.103.recitation Attendance reads 0 of 100. May the app suppress attendance columns from grade display entirely and show them as a separate signal, or do you want them in the number?
5. The two permanently overdue rows. `IST.352/team-request` due 8/30 and `IST.466/ethics-vs-activity` due 9/1 are both still `not_started`. Were they done? They will sit red in the inbox from launch day.
6. Overdue definition. `v_overdue` excludes items you marked `missed` (3 rows today), so they vanish from the count. Should missed items keep counting until you resolve them?
7. Readings in the tracker. I am planning to put all 86 readings into the workload tracker as R bars using `readings.for_date` and `reading_progress.status`, which will noticeably increase ECN.304's apparent daily load (38 readings). Confirm, because it changes what Home looks like more than any other single decision here.
8. Effort input. I am proposing that `est_minutes` you enter in the assignment popout drives the effort score directly at 45 minutes per point, with `effort_override` as a rarely-used escape hatch, rather than you maintaining two separate numbers. Does that match how you would actually use it?
9. Undated items. Nine assignments have no date. Three are yours to resolve (SitN group and date, individual presentation), three should arrive from Blackboard (IST.471 a7, IST.466 AI team assignment, IST.352 term project), three are deliberate placeholders. Do you want them in a visible "undated" tray, or hidden until dated?
10. Announcement read state. Should the bell believe Blackboard's `is_read`, or your own app-side `read_at`? My proposal is `read_at`, which means you clear an announcement twice if you read it in Blackboard first.
11. IST.471. No meetings, no sessions, qualitative 70/30 grading, no supervisor name, no start date, no weekly hours. Should its course page drop the week rail and lecture lane entirely and show assignments plus an hours panel, and is the hours log (T-09) in scope for v1 at all? If it is, will you enter the start date and weekly schedule?
12. GEO.103.recitation. Confirmed Friday meeting pattern, zero session rows, no grading scheme. Do you want synthetic Friday sessions generated so the lane is not empty for 16 weeks, or does the recitation stay folded into the GEO card with no timeline of its own?
13. Course card note line. I am proposing to split it into a group and section badge plus a computed data-state line, and to stop putting course prose on the card. Confirm, or give me the precedence you want across `courses.group_notes`, `courses.notes`, `grade_components.notes` and status rollups.
14. Suggested start dates. I am proposing they skip `no_class` days (17 rows exist, so no lead time routes through Thanksgiving) but not weekends, on the theory that weekends are working days for you. Right call?
15. Week rail rings. I want to change the ring from "a graded item is due" to "anything is due", with a filled centre for exams and projects, because the graded rule gives GEO zero rings for the entire semester. Agree?
16. Speaker notes. PPTX text extraction includes the professor's speaker notes inline with a `[notes]` marker. Corpus search will surface them. Do you want them stripped from snippets, labelled, or shown as-is?
17. iCal feed. Can you grab the Blackboard calendar share URL this week? It is the only unattended refresh path available and it is the difference between "deadlines refresh themselves nightly" and "deadlines refresh when you log in".
18. Supabase Auth. Are you willing to create an auth user for yourself and sign in inside the app? It needs no RLS changes and every alternative is worse. Nothing writable ships without it.
19. Sync cadence. How often do you actually want to refresh during a class day? The answer decides whether the app prompts once at open, prompts on a timer, or stays quiet. My default is once at open, never again in a session.
20. Superseded files. Five IST.466 documents (three schedule versions, two rosters) are marked superseded only in `bb_files.notes` prose. May I add a `superseded_by` column and hide them from Materials by default with a "show all versions" toggle?
21. The morning question. When you open bb2dash at 8am on a Tuesday, what is the first thing you want answered? I have designed Today to answer "what is due and what needs me", but if the honest answer is "what happens in class today and what should I have read", the Planner day view should be the landing screen instead and Today should be second.

---

## Handoff notes

For the planners, in the order they will trip over them.

The three counters on Home are data-shape work, not UI work. Conflict, missing and deadline all need `attention_items` to exist and the transform to write to it. If Home is scheduled before that migration, it ships with a working tracker, a working bell and three counters that render zero or nonsense. R1's handoff note says this and it is the single most likely way this project ships something embarrassing.

`v_course_grade` does not exist and no grade math exists anywhere. Any plan, estimate or mock that shows a grade before the `bb_raw` gradebook transform is showing a fabricated number. Whoever writes that transform reads `effectiveScore` and `displayGrade.score`; `score` is null on all 37 column objects and a transform reading it produces silence, not an error.

The effort map must be one table read by every surface. Two artboards already disagree about `lab` and both use `discussion` where the enum says `discussion_post`. There are 19 enum values, not 18. Any component that hardcodes the map will drift within a week.

`v_upcoming` is not a calendar and should be retired rather than supplemented. Build `v_workload` (assignments union readings, with `kind`, `show_completed`, and an undated arm) and make every count on every screen read it. Two views meaning almost the same thing is how the pop-down count and the card's Open count end up disagreeing on the same screen.

Do not schedule the two popouts as one unit. The assignment popout is nearly fully feedable today; the lecture popout's two substantive sections are both gated on linkage that does not exist. Ship 04 early and 03 reduced.

The file classification pass (set `bb_files.week_no` from path and filename, then `session_id` from course plus week plus bucket) needs no Blackboard access, no login, and no crawl. It is pure SQL and agent judgment over data already on disk, and it unblocks the Session panel's Materials block, the lane file counts, the "also linked from the session" cross-link and the "this week's slides" digest. It should be scheduled as ingest work in parallel with app work, not queued behind it.

Every write element in the product is gated on T-14. A desktop shell holding the publishable key can read nothing typed and write nothing until Supabase Auth exists. Put it first.

`bb_content` was not refreshed by either 9/8 crawl and its `modified_at` tops out at 9/2, while `bb_raw` is current. The Materials tree will render a week-old shell that is already known to have changed. Re-run the content transform before that screen is demoed.

Two elements in the current mockups will render text that is now false and should be corrected in any handoff copy: the bell badge says 3 where the honest count is 9, and the needs-attention row says "Grading schemes unknown for IST 352 and IST 466" when both are confirmed as of the 9/3 pulls.

Finally, the sequencing bet in this document is that materials and structure carry v1 while planner and grades data accumulates. If Stack answers question 8 by saying he will fill in `est_minutes` for the next four weeks, that bet changes and the tracker becomes the centrepiece it was drawn as. If he says he will not, the tracker is a type-based day-load chart and should be sized accordingly on the page.
