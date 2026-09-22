# Phase 12b — research findings (2026-09-17)

Five Sonnet researchers, one per page, code + read-only SQL against prod (no browser: five agents
cannot share one logged-in session; the PM checks the true bugs in a browser before the freeze).
Ids match the intake table in `../briefs/80c_PHASE12B_page_pass.md`.

## Home
* **P-home-1** one-hue ramp: `--type-*` vars in `web/src/app/globals.css:112-121`, mapped in `UpcomingTracker.tsx:103-116`, `Today.tsx:65-71`. Token swap only.
* **P-home-2** tracker renders exactly 14 columns sized to the container (`UpcomingTracker.module.css:56-65`, `anchor.ts:22-24`); only ◂ ▸ move the 56-day horizon. `UpcomingTrackerProps` is reused by course Stream.
* **P-home-3** bar strip `UpcomingTracker.tsx:315-331` has no card; the detail panel `:338-395` does. Wrap both.
* **P-home-4 / P-inbox-1** see Inbox.
* **P-home-5** `<NeedsAttentionRow/>` at `Today.tsx:182`; move to the end.
* **P-home-6** two placeholders: `ECN.304/quiz-series`, `GEO.103/reading-quiz-series` (`inferred`, syllabus). `GEO.103/discussion-questions` is a real weekly task. Surfaced by `v_work_items` (016) → `queries.today.ts:160-177`.
* **P-home-7** `readings` 87–96 (IST.466, `for_date` null, `required=false`); id 89 = "Apple vs. The FBI". `IST.466/ethics-team-2-presentation` due 2026-09-24; session "Ethics Team 2 & 3 Presentation" same day. No column links a reading to a team. `v_work_items` hardcodes `true as in_workload` for readings (`016_work_items.sql:95`) and ignores `required`. No sync writes `readings`.
* **P-home-8** `CourseCard` (`Today.tsx:295-343`) is a bare `<div>`. Link to `/course/<display_id>`.
* **P-home-9** `CourseSidebar.tsx:52-57` closes only in overlay mode, by design; `close()` persists to localStorage (`SidebarProvider.tsx:86-92`).
* **P-home-10** card shows no grade by rule (`Today.tsx:13`). Available: Blackboard's total via `v_course_grade` / `pickCourseGrade` (`queries.grades.ts:309-311, 433-453`) — only IST.323 publishes one.

## Planner
* **P-planner-1** `AllDayBand` `PlannerWeek.tsx:262-297`; persisted-UI pattern in `web/src/lib/sidebar-preference.ts`.
* **P-planner-2** fixed 24px per half-hour slot (`PlannerWeek.module.css:57-58,158-177`); `slotOffset`/`slotBox` (`planner-week.ts:160-180`), `segmentBox` (`planner-events-grid.ts:192-203`); overlaps → side-by-side lanes (`assignLanes`, `planner-week.ts:578-607`). Needs a per-slot height table + cumulative offsets behind every consumer (now-line, clamp, `PlannerSlots.tsx`, event segments).
* **P-planner-3** `.nested{overflow-y:auto}` `PlannerWeek.module.css:330-337`. Delete after P-planner-2. `.board{overflow-x:auto}` stays.
* **P-planner-4** nowrap + ellipsis at `PlannerWeek.module.css:292-296,307-319,571-580,610-617`; `.block{overflow:hidden}` `:225` clips wrapped text unless rows grow.
* **P-planner-5** one modal (`ItemPopout` → `PopoutShell` → `AssignmentPopout`), mounted in `(app)/layout.tsx`, opened from Today, Classwork, Grades, Planner (`PlannerWeek.tsx:184`). No per-assignment route exists.
* **P-planner-6** `planner_events` is one row = one range (067); `event_id = 'pe' || sha256(id)` per row (068); `push.ts:296-355` diffs by `(source, ref_id)`. Recommendation: `planner_event_series` + `planner_events.series_id`, materialised occurrences (bounded, mandatory `until`), series-level edit/delete for MVP; push untouched.
* **P-planner-7** by inspection: vertical band label has no min-height on an empty week (`:125-130`); `.blockCode` absolute inside a `display:contents` parent with no positioned chip (`:339-380`); `PlannerWeek.tsx:88-92` swaps the whole section pre-hydration → layout jump.

## Inbox
* Lifecycle: `raise_attention()` (041:127-159) from the stage functions; the web writes `state, resolved_at, resolution, resolution_note` (`queries.sync.ts:773-778`); `apply_resolutions()` (042:67-173) runs in every `stage_assignments` fold and from `transform_tick()`'s transform-request drain (≤ 2 min). It writes only `assignments.{due_at,due_date,points_possible,bb_url}`; "Keep mine" sets `confidence='confirmed'`. Course-level confirms, staff conflicts, ambiguous columns, grading_scheme, data_gap / deadline dismissals never apply (042:30-40).
* `resolution_note` is read by nothing. Prod: 15 closed rows, all with notes, mostly written by PM sessions in SQL; 100 open (conflict 10, data_gap 16, missing 15, stack_must_confirm 59).
* Hook: view `v_inbox_feedback` + one more `agent_requests.kind`. Additive.
* **P-inbox-2** static button labels `Inbox.tsx:330/338`; row has `field, from_value, to_value, suggested` → `outcomeText(item)` in `queries.sync.ts`, New York formatting.
* **P-inbox-3** `InboxRow` `Inbox.tsx:234-389` dumps raw JSON, hides `raised_at`, no link; `suggested` keys are ad hoc per call site.

## Grades
* **P-grades-1** `GradebookTable.tsx:231-341` splits items / bookkeeping only. Sections = `assignments.component_id` → `grade_components`.
* **P-grades-2** `GradesScreen.tsx:86-98`, `CourseGradeCard.tsx:96-103`.
* **P-grades-3** inventory: `web/src/lib/grade-model/` (18 files), `grade-model-{input,run,view,format}.ts`, `queries.grade-model.ts`, `queries.grade-scenario.ts`, `ModelStanding`, `WhatIfCell`, `TargetSolver`, `PlaceholderRows`, `LinkColumnControl`, two hooks, `GradesModelScreen.tsx`; ~268 tests in 32 files; tables `grade_scenarios`, `grade_column_links` (0 rows), views `v_grade_model_items`, `v_grade_model_total`. **`v_gradebook_history` is independent** and the desktop poller reads it (`desktop/src/core/poller/sources.ts:47`). Nothing outside the grades feature imports the engine.
* Points-only "graded so far" on prod 9/16: ECN.304 9/10, IST.323 39.8/140, IST.352 18.5/15, IST.471 10/10, GEO.103 and IST.466 nothing. IST.352: readings and knowledge checks are columns with `possible = 0` scored 0/1/2 (PM query). Blackboard's IST.323 total 14.8/104 is a running total, not graded-so-far. ECN.304, GEO.103, IST.352, IST.471 are weighted: a points ratio is not the course grade.
* **P-grades-4/5** built (`SubmissionBlock.tsx:205-223`; `my_submissions` in `BUCKET_ORDER`, `queries.materials.ts:147-159`); prod has 0 `bb_attempts`, 0 `my_submissions` files — no v3 crawl has run.
* **P-grades-6** `GradebookTable.tsx:191-193`, `SubmissionBlock.tsx:159-160`, gloss `queries.grades.ts:382-420`; 16 rows GRADED + COMPLETED.
* **P-grades-7** two vocabularies. Planner enum `progress_status` (001:30): not_started 50, submitted 8, graded 5, missed 3, not_applicable 2, in_progress 1; planned / excused / waived 0. Set in `StatusSelect.tsx`, `AssignmentPopout.tsx:364-375`. Blackboard pill: free text, read-only.
* **P-grades-8/9** `ScoreHistory` at `GradebookTable.tsx:208`, `FeedbackDisclosure` at `:218-224`; `useAssignmentGrade` (`queries.grades.ts:315`) already carries `column_id` and `feedback`.
* **P-grades-10** no indicator anywhere; Classwork rows carry no grade data (`CourseScreen.tsx:471`).

## Materials
* **P-materials-1** `MaterialsBrowser.tsx:182-192, 212-279`; copy the toggle in `GradebookTable.tsx:324-330`.
* **P-materials-2** `resolveReadingRoute()` `queries.materials.ts:370-424`: 41 "Off-platform" rows = 21 real textbook chapters + 20 GEO.103.lecture rows that are on Blackboard but unlinked. Two have files already (`readings` 47 ↔ `bb_files` 67, 48 ↔ 69). Root cause: nothing sets `bb_files.reading_id` after the seed migrations. 18 have no file.
* **P-materials-3** `readings.for_date`; all dated except IST.466's ten.
* **P-materials-4** `courses.syllabus_path` unreliable; use `bb_files.bucket = 'syllabus_policy'` per course, matched to the path's basename; opens through `FileOpenAction`.

## Carry-ins (all confirmed live)
* **P-shell-1** `proxy-session.ts:55-67` builds fresh redirects, dropping refreshed cookies. S.
* **P-shell-2** `desktop/src/main/navigation.ts:33-57` guards `will-navigate` only. S.
* **P-data-1** `bb_content_course_id_path_key`; `bb_item_id` exists. L.
* **P-data-2** both rows `bb_last_seen = 2026-09-02`. M.
* **P-db-1** TRUNCATE still granted. S.
* **P-db-2** 22 policies (the 22nd is `storage.objects bb_files_auth_all`). M.
* **P-db-3** 8 dependent views incl. the two model views. L.
