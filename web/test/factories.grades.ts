/**
 * Fixtures for Phase 10a.
 *
 * `v_gradebook_latest`, `v_assignment_grade`, `v_course_grade` and
 * `v_assignment_attempts` are created by migrations 047/050 in the same phase,
 * so no test may reach the database for their shape: these builders are the
 * frozen column lists from `docs/planning/67_PHASE10A_grades.md`, and the
 * values are the ones that Contract quotes out of the live crawl (run
 * `bf2f81e5-…`, 2026-09-14) — IST.323's one `isCalc` total at 5/104, a GRADED
 * quiz at 10/10, an IST.352 row SUBMITTED with no score and a NEEDS_GRADING
 * last attempt, and an attendance column at 83.333/100 that counts toward
 * nothing.
 */

import type {
  AssignmentAttemptRow,
  AssignmentGradeRow,
  CourseGradeRow,
  GradebookLatestRow,
  SubmissionFile,
} from '@/lib/queries.grades';

/** The capture time of the run every fixture below came from. */
export const SEEN_AT = '2026-09-14T18:31:00.000Z';

export function makeGradebookRow(
  overrides: Partial<GradebookLatestRow> = {},
): GradebookLatestRow {
  return {
    course_id: 'IST.323',
    column_id: '_3560530_1',
    name: 'Lab #1',
    position: 1,
    content_id: null,
    category_id: null,
    possible: 25,
    due_at: null,
    calc_type: 'NON_CALCULATED',
    is_calc: false,
    is_total: false,
    column_kind: 'item',
    aggregation: 'LAST',
    visible: true,
    grades_released: true,
    multiple_attempts: 0,
    attempts_left: null,
    effective_score: null,
    manual_score: null,
    display_score: null,
    display_grade: null,
    is_override: false,
    is_exempt: false,
    feedback: null,
    submission_status: 'UNOPENED',
    last_attempt_status: null,
    last_attempt_created: null,
    last_attempt_submitted: null,
    last_attempt_score: null,
    seen_at: SEEN_AT,
    assignment_id: 'IST.323/lab-1',
    linked_assignments: 1,
    counts_toward_grade: true,
    ...overrides,
  };
}

/** IST.323 `Total Score` — the one `isTotalCalculation` column in the crawl. */
export const IST323_TOTAL = makeGradebookRow({
  column_id: '_3569973_1',
  name: 'Total Score',
  position: 99,
  calc_type: 'CUSTOM',
  is_calc: true,
  is_total: true,
  column_kind: 'total',
  possible: 104,
  effective_score: 5,
  submission_status: null,
  assignment_id: null,
  linked_assignments: 0,
  counts_toward_grade: null,
});

/** A quiz Blackboard has graded, 10 out of 10, with the instructor's note. */
export const IST323_QUIZ = makeGradebookRow({
  column_id: '_3560612_1',
  name: 'Quiz 2',
  position: 4,
  possible: 10,
  effective_score: 10,
  submission_status: 'GRADED',
  last_attempt_status: 'COMPLETED',
  last_attempt_submitted: '2026-09-09T13:02:00.000Z',
  last_attempt_score: 10,
  feedback: 'Nice work.\nSee the rubric for the last question.',
  assignment_id: 'IST.323/quiz-2',
});

/** IST.352: handed in, not marked. `effective_score` is null, never 0. */
export const IST352_SUBMITTED = makeGradebookRow({
  course_id: 'IST.352',
  column_id: '_3561004_1',
  name: 'Assignment 1',
  position: 2,
  possible: 50,
  effective_score: null,
  submission_status: 'SUBMITTED',
  last_attempt_status: 'NEEDS_GRADING',
  last_attempt_submitted: '2026-09-12T03:41:00.000Z',
  assignment_id: 'IST.352/a1',
});

/** ECN.304 attendance: a real percentage that counts toward nothing (yet). */
export const ECN304_ATTENDANCE = makeGradebookRow({
  course_id: 'ECN.304',
  column_id: '_3559911_1',
  name: 'Attendance',
  position: 7,
  column_kind: 'attendance',
  possible: 100,
  effective_score: 83.333,
  submission_status: 'NO_STATUS',
  assignment_id: 'ECN.304/attendance',
  counts_toward_grade: false,
});

/** IST.323 `Final Letter Grade` — an override column with no score at all. */
export const IST323_LETTER = makeGradebookRow({
  column_id: '_3569980_1',
  name: 'Final Letter Grade',
  position: 100,
  column_kind: 'letter',
  possible: null,
  effective_score: null,
  submission_status: null,
  assignment_id: null,
  linked_assignments: 0,
  counts_toward_grade: null,
});

export function makeCourseGrade(overrides: Partial<CourseGradeRow> = {}): CourseGradeRow {
  return {
    course_id: 'IST.323',
    has_gradebook: true,
    gradebook_seen_at: SEEN_AT,
    has_total: true,
    total_column_id: '_3569973_1',
    total_name: 'Total Score',
    total_effective_score: 5,
    total_possible: 104,
    total_display_grade: null,
    total_seen_at: SEEN_AT,
    item_count: 12,
    graded_item_count: 3,
    ...overrides,
  };
}

/** A course whose gradebook we have, but which publishes no calculated total. */
export const NO_TOTAL_COURSE = makeCourseGrade({
  course_id: 'GEO.103.lecture',
  has_total: false,
  total_column_id: null,
  total_name: null,
  total_effective_score: null,
  total_possible: null,
  total_seen_at: null,
});

/** A course no sync has read a gradebook for. */
export const NEVER_SYNCED_COURSE = makeCourseGrade({
  course_id: 'IST.471',
  has_gradebook: false,
  gradebook_seen_at: null,
  has_total: false,
  total_column_id: null,
  total_name: null,
  total_effective_score: null,
  total_possible: null,
  total_seen_at: null,
  item_count: 0,
  graded_item_count: 0,
});

export function makeAssignmentGrade(
  overrides: Partial<AssignmentGradeRow> = {},
): AssignmentGradeRow {
  const column = makeGradebookRow();
  return {
    ...column,
    // The view exposes `assignments.id` under this name and has no `id`
    // column at all — 047 deviation 4.
    assignment_id: 'IST.323/lab-1',
    course_id: 'IST.323',
    title: 'Lab #1',
    type: 'lab',
    points_possible: 25,
    ...overrides,
  };
}

export function makeAttempt(
  overrides: Partial<AssignmentAttemptRow> = {},
): AssignmentAttemptRow {
  return {
    assignment_id: 'IST.323/lab-1',
    course_id: 'IST.323',
    column_id: '_3560530_1',
    attempt_id: '_9001_1',
    attempt_no: 1,
    attempts_allowed: 3,
    status: 'NEEDS_GRADING',
    created_bb: '2026-09-12T02:00:00.000Z',
    submitted_bb: '2026-09-12T03:41:00.000Z',
    modified_bb: '2026-09-12T03:41:00.000Z',
    score: null,
    feedback: null,
    student_comments: null,
    student_submission: null,
    exempt: false,
    // Captured because Blackboard hands it over; no screen renders it.
    receipt: 'CONF-4471829',
    files: [{ id: '_f1_1', name: 'lab1.pdf', size: 12_345 }],
    seen_at: SEEN_AT,
    ...overrides,
  };
}

export function makeSubmissionFile(overrides: Partial<SubmissionFile> = {}): SubmissionFile {
  return {
    id: 501,
    file_name: 'lab1.pdf',
    bucket: 'my_submissions',
    mime_type: 'application/pdf',
    bytes: 12_345,
    sha256: 'a'.repeat(64),
    storage_path: 'bb-files/IST.323/my_submissions/lab-1/lab1.pdf',
    source_url: 'https://blackboard.syracuse.edu/learn/api/v1/attempts/_9001_1/files/_f1_1/download',
    local_path: null,
    classified_by: 'blackboard',
    assignment_id: 'IST.323/lab-1',
    downloaded_at: SEEN_AT,
    notes: 'attempt file; bytes pulled by bb-sync step 4b',
    ...overrides,
  };
}

/** The same assignment's staged copy — Stack's own, not Blackboard's. */
export function makeStagedFile(overrides: Partial<SubmissionFile> = {}): SubmissionFile {
  return makeSubmissionFile({
    id: 502,
    file_name: 'lab1-final.pdf',
    sha256: 'b'.repeat(64),
    storage_path: 'bb-files/IST.323/my_submissions/lab-1/lab1-final.pdf',
    source_url: null,
    classified_by: 'stack',
    notes: 'staged in bb2dash 2026-09-15T12:00:00.000Z',
    ...overrides,
  });
}
