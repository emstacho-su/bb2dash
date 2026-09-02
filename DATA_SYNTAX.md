# bb2dash — Data Syntax (Phase 1)

Canonical store: Supabase project **bb2dash** (`goultdzqcavefcgnifdy`, us-east-1, Postgres 17).
Schema source of truth: `db/migrations/001_schema.sql`. Seeds: `db/seed/00[2-4]_*.sql`.
Everything below is reproducible from those files against an empty Postgres 16+.

## Why it is shaped this way

The six courses use four structurally different grading models, so grading is stored as
declarative rules, not a single "weight" column:

| Course | Method | The rule the forecaster has to understand |
|---|---|---|
| ECN.304 | weighted_pct | 3 exams **rank-weighted** 30/25/20; quizzes averaged with lowest dropped |
| GEO.103 | weighted_pct | Six flat buckets; ~5 unannounced quizzes, lowest dropped |
| IST.323 | points | 104 pts graded out of 100; quizzes **normalized** to 5; extra-credit lab; final project is a 3-part sum |
| IST.471 | qualitative | 70% supervisor evaluation, 30% assignment compliance |
| IST.352 | unknown | No syllabus in folder |
| IST.466 | unknown | Buckets known, weights not |

Second rule: **facts vs. state are separate tables.** `assignments` holds what the syllabus /
Blackboard says. `assignment_progress` holds what *you* say (status, planned dates, scores).
A phase-2 sync can rewrite `assignments` freely without touching your planner.

Third rule: **every fact row carries `source` and `confidence`**, so reconciliation knows what it
may overwrite. `confirmed` = explicit in the source. `tentative` = item explicit, date or detail
inferred. `inferred` = existence inferred (placeholders like "quiz series").

## Identifier conventions

* `courses.id` = the short names you defined: `ECN.304`, `GEO.103.lecture`, `GEO.103.recitation`,
  `IST.323`, `IST.352`, `IST.466`, `IST.471`.
* `courses.bb_course_id` = Blackboard shell id: `ECN.304.M001.FALL26`.
* `assignments.id` = `<course>/<kebab-slug>`; recurring instances get a zero-padded sequence:
  `IST.323/quiz-03`, `IST.323/lab-1`, `GEO.103/exam-2`. GEO items use the `GEO.103/` prefix
  regardless of whether they live in the lecture or recitation shell.
* `series_key` groups recurring instances (`IST.323/quiz`) so "recurring vs one-off" is a query,
  not a guess. `recurrence` is the enum; `sequence_no` orders within the series.
* `grade_components.code` is stable snake_case per course (`exams`, `quizzes`, `fp_proposal`).
  Sub-components point at a parent via `parent_id` (IST 323 final project).

## Tables

| Table | One row per | Owned by |
|---|---|---|
| `terms` | semester | seed |
| `courses` | Blackboard course shell | seed → Blackboard |
| `course_staff` | instructor/TA/sponsor per course | seed → Blackboard |
| `meetings` | weekly meeting pattern (day_of_week 0=Sun) | seed → Blackboard |
| `sessions` | dated class meeting with topic | seed → Blackboard |
| `grading_schemes` | course grading method, letter scale, late/AI policy | seed → Blackboard |
| `grade_components` | gradebook bucket with weight/points + aggregation rule | seed → Blackboard |
| `assignments` | deliverable or graded event | seed → Blackboard / iCal |
| `assignment_progress` | your planner state for an assignment | **you** (sync may fill score) |
| `readings` | assigned reading | seed → Blackboard |
| `reading_progress` | your reading state | **you** |
| `announcements` | Blackboard announcement | Blackboard |
| `bb_content` | Blackboard content tree node (as you see it) | Blackboard |
| `sync_runs` | provenance log per capture | sync jobs |

Views: `v_upcoming` (not-yet-due, not finished), `v_overdue` (past due, still open).

## Enums

* `assignment_type`: exam, final_exam, quiz, lab, homework, reading, presentation,
  group_presentation, project, paper, discussion_post, form, checkpoint, meeting, evaluation,
  activity, attendance, participation, other
* `progress_status` (the planner selector): not_started, planned, in_progress, submitted,
  graded, missed, excused, not_applicable, waived
* `aggregation_rule`: sum, average, average_drop_lowest, rank_weighted, normalized, single,
  manual, unknown
* `submission_channel`: blackboard, in_class, email, external_site, discussion_board, none, unknown
* `data_source`: syllabus, course_deck, blackboard, ical, manual, inferred
* `confidence_level`: confirmed, tentative, inferred

## Time handling

`due_at` / `event_start` are `timestamptz`, entered with explicit offsets: `-04` (EDT) through
2026-11-01 02:00, `-05` (EST) after. `due_date` is used when only the day is known. Query
`due_at at time zone 'America/New_York'` for local display.

## Seed state (2026-09-02)

7 courses, 12 staff, 11 meeting patterns, 127 sessions, 25 grade components, 57 assignments,
75 readings. Weighted schemes sum to 100; IST 323 sums to 100 + 4 EC.

## What Phase 2 (Blackboard pass) must capture

Priority order, because these are the gaps the syllabi could not fill:

1. **IST.352 and IST.466 grading**: method, components, weights → `grading_schemes`,
   `grade_components`. IST.352 assignment list and due dates.
2. **Meeting times** for ECN.304, IST.352, IST.466 → `meetings` (set confidence=confirmed).
3. **GEO.103 recitation**: confirm M003 = Fri 11:40 Maxwell 108.
4. **IST.323**: your Security-in-the-News group + date; your Individual Presentation date once
   chosen; what "Assignment #1" is; your assigned Final Project organization (store in
   `assignments.description` of `IST.323/fp-packet`).
5. **IST.466**: which slot Group #3 has on 10/20–10/22 and 11/17–11/19; the 9/27 and 12/5
   date typos in the schedule doc.
6. **IST.471**: due dates for Assignments 1–7.
7. **Per assignment**: `bb_item_id`, `bb_url`, exact `due_at` (Blackboard gives clock times the
   syllabi don't), points_possible where missing.
8. **Grades already posted** → `assignment_progress.score/score_max/graded_at`, status=graded.
9. **Current status** of the three overdue rows and anything already submitted.
10. **Content tree** per course → `bb_content`; **announcements** → `announcements`.

Reconciliation rule: a Blackboard value overwrites a `syllabus`/`course_deck` value only when the
seed row is `tentative` or `inferred`, or when the field was null. Conflicts with a `confirmed`
seed row get logged in `sync_runs.summary` and surfaced to you rather than silently overwritten,
because syllabus versions change (IST 323 is already on v1.3.1).

## Recurring export path (for "export data regularly")

Blackboard Ultra publishes an **iCal feed** of the calendar (Calendar → settings gear → share /
"Get calendar link"). It carries every due date across all courses and needs no browser session.
That is the low-cost recurring source for `assignments.due_at`; the browser session is for
grades, content, announcements and anything the feed does not carry. Capture the feed URL during
phase 2 and store it in `sync_runs.notes` or a `.env`, never in the repo.

## Access

Supabase MCP (Claude) has full access. RLS is enabled with a permissive policy for the
`authenticated` role; the service-role key bypasses RLS. If a dashboard client uses the anon
key, add Supabase Auth or an anon policy deliberately; do not ship the service key to a browser.
