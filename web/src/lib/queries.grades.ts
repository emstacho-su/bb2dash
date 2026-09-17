/**
 * bb2dash — gradebook query layer (Phase 10a, R-10/R-11/R-17/R-18).
 *
 * Conventions follow `queries.popout.ts` and `queries.materials.ts`: a greppable
 * key namespace, `*Options()` returning `queryOptions`, throw on error, and no
 * fabricated fallbacks. Two things are specific to this module.
 *
 * ROW TYPES — migrations 046-051 are applied and `database.types.ts` was
 * regenerated, so every read here goes through the ordinary typed client. The
 * four view row types below stay hand-narrowed to the frozen column lists in
 * `docs/planning/67_PHASE10A_grades.md` §047/§050: Postgres reports no not-null
 * constraint on a view, so the generated row types make every column nullable,
 * and the Contract is stricter than that. Each of those reads therefore carries
 * one documented cast at the call site — the Phase 8 precedent, see the header
 * of `queries.course.ts`. No field is reshaped.
 *
 * HONESTY — every figure here is a Blackboard value with the `seen_at` of the
 * run that saw it. Nothing in this module sums, averages or projects anything:
 * `v_course_grade` carries Blackboard's own total row or nulls, and a null
 * renders `—`, never `0`. The three course states (`total`, `no_total`,
 * `never_synced`) are distinct and none of them is inferred from a score.
 *
 * READS ONLY — this module writes nothing. Staging a file (the one write in the
 * Grades feature) lives in `queries.submissions.ts`; `assignments`,
 * `assignment_progress`, `bb_gradebook` and `bb_attempts` are never written
 * from the browser at all.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables } from './queries';
// Type-only, so it is erased at build: no runtime dependency from 10a's query
// layer on the grade model. The row shape is migration 058's and the popout's
// score history reads it (Phase 12b, G-5).
import type { GradebookHistoryRow } from './grade-model-input';
import { COURSE_TIME_ZONE, shellCacheKey } from './course-dimension';

/* ---------------------------------------------------------------------------
 * Row types — the frozen Contract column lists (see the module header)
 * ------------------------------------------------------------------------ */

/** `bb_gradebook.column_kind` (046): what kind of gradebook column this is. */
export type GradebookColumnKind = 'item' | 'attendance' | 'total' | 'calc_other' | 'letter';

/**
 * One row of `v_gradebook_latest` — the newest `bb_gradebook` row per
 * (course_id, column_id) from a registered run, minus `raw`, plus the three
 * link columns the view adds.
 */
export interface GradebookLatestRow {
  course_id: string;
  column_id: string;
  name: string;
  position: number | null;
  content_id: string | null;
  category_id: string | null;
  possible: number | null;
  due_at: string | null;
  calc_type: string | null;
  is_calc: boolean;
  is_total: boolean;
  column_kind: GradebookColumnKind;
  aggregation: string | null;
  visible: boolean | null;
  grades_released: boolean | null;
  multiple_attempts: number | null;
  attempts_left: number | null;
  /** Blackboard's `effectiveScore` — THE score. Null means ungraded, not zero. */
  effective_score: number | null;
  manual_score: number | null;
  display_score: number | null;
  display_grade: string | null;
  is_override: boolean | null;
  is_exempt: boolean | null;
  feedback: string | null;
  /** Blackboard's `submissionStatus`, verbatim. */
  submission_status: string | null;
  last_attempt_status: string | null;
  last_attempt_created: string | null;
  last_attempt_submitted: string | null;
  last_attempt_score: number | null;
  /** `bb_raw.captured_at` of the run this row came from. */
  seen_at: string;
  /** The ONE `assignments` row with this `bb_column_id`, else null. */
  assignment_id: string | null;
  /** 0, 1 or more — a column linked twice is ambiguous and says so. */
  linked_assignments: number | null;
  /** True when the linked assignment has a `component_id` (V-1's data). */
  counts_toward_grade: boolean | null;
}

/**
 * One row of `v_assignment_grade` — an `assignments` row with a `bb_column_id`,
 * carrying the assignment's own identity plus its latest gradebook columns
 * (all null when the column has not been crawled).
 */
export type AssignmentGradeRow = {
  /**
   * `assignments.id`, exposed by the view under this name — 047 deviation 4.
   * There is no `id` column on `v_assignment_grade`; filtering on one is a
   * 42703 on every popout, which is how this was found.
   */
  assignment_id: string;
  course_id: string;
  title: string | null;
  type: string | null;
  points_possible: number | null;
} & {
  /** Every gradebook column, nullable: the column may never have been crawled. */
  [K in keyof Omit<GradebookLatestRow, 'course_id' | 'assignment_id'>]:
    | GradebookLatestRow[K]
    | null;
};

/** One row of `v_course_grade` — one per `courses` row. Never a computed total. */
export interface CourseGradeRow {
  course_id: string;
  has_gradebook: boolean;
  gradebook_seen_at: string | null;
  has_total: boolean;
  total_column_id: string | null;
  total_name: string | null;
  total_effective_score: number | null;
  total_possible: number | null;
  total_display_grade: string | null;
  total_seen_at: string | null;
  item_count: number | null;
  graded_item_count: number | null;
}

/** One file recorded on a `bb_attempts` row (`files` jsonb). */
export interface AttemptFile {
  id: string | null;
  name: string | null;
  size: number | null;
}

/** One row of `v_assignment_attempts` — one attempt on an assignment's column. */
export interface AssignmentAttemptRow {
  assignment_id: string;
  course_id: string;
  column_id: string;
  attempt_id: string;
  /** 1-based, by `created_bb`. */
  attempt_no: number;
  /** `v_gradebook_latest.multiple_attempts`; negative means unlimited. */
  attempts_allowed: number | null;
  /** NEEDS_GRADING | COMPLETED | IN_PROGRESS | …, verbatim. */
  status: string | null;
  created_bb: string | null;
  submitted_bb: string | null;
  modified_bb: string | null;
  score: number | null;
  feedback: string | null;
  student_comments: string | null;
  student_submission: string | null;
  exempt: boolean | null;
  /** Stored, never rendered — Stack's answer 1. */
  receipt: string | null;
  files: AttemptFile[] | null;
  seen_at: string | null;
}

/** A `bb_files` row under `my_submissions` — pulled back, or staged by Stack. */
export type SubmissionFile = Pick<
  Tables<'bb_files'>,
  | 'id'
  | 'file_name'
  | 'bucket'
  | 'mime_type'
  | 'bytes'
  | 'sha256'
  | 'storage_path'
  | 'source_url'
  | 'local_path'
  | 'classified_by'
  | 'assignment_id'
  | 'downloaded_at'
  | 'notes'
>;

/**
 * One string literal, not a concatenation: the typed client only validates the
 * column list when TypeScript can see it as a literal type.
 */
const SUBMISSION_FILE_COLUMNS =
  'id, file_name, bucket, mime_type, bytes, sha256, storage_path, source_url, local_path, classified_by, assignment_id, downloaded_at, notes';

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const gradesKeys = {
  courseGrades: () => ['grades', 'course-grades'] as const,
  gradebook: (shellIds: readonly string[]) =>
    ['grades', 'gradebook', shellCacheKey(shellIds)] as const,
  assignmentGrade: (assignmentId: string) =>
    ['grades', 'assignment-grade', assignmentId] as const,
  assignmentAttempts: (assignmentId: string) =>
    ['grades', 'assignment-attempts', assignmentId] as const,
  submissionFiles: (assignmentId: string) =>
    ['grades', 'submission-files', assignmentId] as const,
  assignmentHistory: (courseId: string, columnId: string) =>
    ['grades', 'assignment-history', courseId, columnId] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** Blackboard's published total (or the absence of one) for every course. */
export function courseGradesOptions() {
  return queryOptions({
    queryKey: gradesKeys.courseGrades(),
    queryFn: async (): Promise<CourseGradeRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_course_grade')
        .select('*')
        .order('course_id', { ascending: true });
      if (error) throw error;
      // Narrowed to the frozen Contract shape — see the module header.
      return (data ?? []) as unknown as CourseGradeRow[];
    },
    // Gradebook rows only move when a Blackboard sync runs.
    staleTime: 5 * 60 * 1000,
  });
}

/** Every latest gradebook column across a display course's shells. */
export function gradebookLatestOptions(shellIds: readonly string[]) {
  return queryOptions({
    queryKey: gradesKeys.gradebook(shellIds),
    queryFn: async (): Promise<GradebookLatestRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_gradebook_latest')
        .select('*')
        .in('course_id', shellIds as string[])
        .order('course_id', { ascending: true })
        .order('position', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as GradebookLatestRow[];
    },
    enabled: shellIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** The gradebook column behind one assignment, for the popout's status line. */
export function assignmentGradeOptions(assignmentId: string | undefined) {
  return queryOptions({
    queryKey: gradesKeys.assignmentGrade(assignmentId ?? 'none'),
    queryFn: async (): Promise<AssignmentGradeRow | null> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_assignment_grade')
        .select('*')
        // `assignment_id`, not `id`: the view has no `id` column (047
        // deviation 4), and filtering on one is a 42703 on every popout.
        .eq('assignment_id', assignmentId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as AssignmentGradeRow | null;
    },
    enabled: Boolean(assignmentId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Every attempt Blackboard recorded against this assignment's column. */
export function assignmentAttemptsOptions(assignmentId: string | undefined) {
  return queryOptions({
    queryKey: gradesKeys.assignmentAttempts(assignmentId ?? 'none'),
    queryFn: async (): Promise<AssignmentAttemptRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_assignment_attempts')
        .select('*')
        .eq('assignment_id', assignmentId as string)
        .order('attempt_no', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AssignmentAttemptRow[];
    },
    enabled: Boolean(assignmentId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * The submission files for one assignment: the copies pulled back out of
 * Blackboard (`classified_by = 'blackboard'`) and the ones Stack staged here
 * (`classified_by = 'stack'`). Both live in the `my_submissions` bucket.
 */
export function submissionFilesOptions(assignmentId: string | undefined) {
  return queryOptions({
    queryKey: gradesKeys.submissionFiles(assignmentId ?? 'none'),
    queryFn: async (): Promise<SubmissionFile[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('bb_files')
        .select(SUBMISSION_FILE_COLUMNS)
        .eq('assignment_id', assignmentId as string)
        .eq('bucket', 'my_submissions')
        .is('superseded_by', null)
        .order('file_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubmissionFile[];
    },
    enabled: Boolean(assignmentId),
    staleTime: 60 * 1000,
  });
}

/**
 * How one gradebook column's score moved across syncs (Phase 12b, G-5).
 *
 * `v_gradebook_history` (058) holds the first registered observation of every
 * column and every later run whose score differed. The popout wants one
 * column's rows, so it asks for one column's rows — the model screens' read of
 * a whole course's history is a different question with a different key.
 *
 * The view survives whatever G-1 decides: the desktop poller reads it too.
 */
export function assignmentHistoryOptions(
  courseId: string | undefined,
  columnId: string | null | undefined,
) {
  return queryOptions({
    queryKey: gradesKeys.assignmentHistory(courseId ?? 'none', columnId ?? 'none'),
    queryFn: async (): Promise<GradebookHistoryRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('v_gradebook_history')
        .select('*')
        .eq('shell_course_id', courseId as string)
        .eq('column_id', columnId as string)
        .order('seen_at', { ascending: true });
      if (error) throw error;
      // Narrowed to 058's frozen column list — see the module header.
      return (data ?? []) as unknown as GradebookHistoryRow[];
    },
    enabled: Boolean(courseId) && Boolean(columnId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCourseGrades() {
  return useQuery(courseGradesOptions());
}
export function useGradebookLatest(shellIds: readonly string[]) {
  return useQuery(gradebookLatestOptions(shellIds));
}
export function useAssignmentGrade(assignmentId: string | undefined) {
  return useQuery(assignmentGradeOptions(assignmentId));
}
export function useAssignmentAttempts(assignmentId: string | undefined) {
  return useQuery(assignmentAttemptsOptions(assignmentId));
}
export function useSubmissionFiles(assignmentId: string | undefined) {
  return useQuery(submissionFilesOptions(assignmentId));
}
export function useAssignmentHistory(
  courseId: string | undefined,
  columnId: string | null | undefined,
) {
  return useQuery(assignmentHistoryOptions(courseId, columnId));
}

/* ---------------------------------------------------------------------------
 * Pure display helpers — no React, no network, all unit-tested
 * ------------------------------------------------------------------------ */

/** What a missing figure looks like. Never `0`, never a blank cell. */
export const NO_VALUE = '—';

/**
 * Trim a numeric's trailing zeros without rounding it: 83.333 → "83.333".
 * The score cell and the score history both print with this (round 3, R3-4).
 */
export function scoreNumberText(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  // `numeric(9,3)` can arrive as 5 or as "5.000" depending on the driver.
  return String(Number(n.toFixed(3)));
}

/**
 * "5 / 104", "10 / 10", or `—` when Blackboard has recorded no score.
 *
 * A null `effective_score` means ungraded; rendering it as 0 would invent a
 * grade. A score with no recorded `possible` shows the score alone rather than
 * "5 / —", which reads as a denominator of nothing.
 */
export function scoreText(
  effective: number | string | null | undefined,
  possible: number | string | null | undefined,
): string {
  if (effective === null || effective === undefined || effective === '') return NO_VALUE;
  const score = scoreNumberText(effective);
  if (possible === null || possible === undefined || possible === '') return score;
  return `${score} / ${scoreNumberText(possible)}`;
}

/**
 * When we saw this figure — "Sep 14, 9:12 AM". Not when Blackboard produced it:
 * the mirror only knows the crawl that captured it.
 */
export function formatSeenAt(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return NO_VALUE;
  const date = at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: COURSE_TIME_ZONE,
  });
  const time = at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: COURSE_TIME_ZONE,
  });
  return `${date}, ${time}`;
}

/** The submission statuses Blackboard has actually produced, glossed. */
const SUBMISSION_GLOSS: Record<string, string> = {
  UNOPENED: 'not opened',
  DRAFT_SAVED_STUDENT: 'draft saved',
  SUBMITTED: 'submitted',
  GRADED: 'graded',
  NO_STATUS: 'instructor-entered',
};

export interface SubmissionLabel {
  /** Blackboard's own value, verbatim. Null when the column carries none. */
  status: string | null;
  /** The gloss, or the raw value itself when the code is one we do not know. */
  text: string;
  /** The last attempt's status, verbatim, when it says something else. */
  attemptStatus: string | null;
}

/**
 * Column statuses that already mean "the work is in" (P-grades-6, G-4).
 * Beside one of these, Blackboard's `COMPLETED` attempt status states the same
 * fact twice — "graded" next to "last attempt: COMPLETED" — so it is dropped.
 *
 * Only `COMPLETED` is dropped, and only beside these two. `NEEDS_GRADING` next
 * to GRADED means a further attempt is waiting, `COMPLETED` next to UNOPENED
 * contradicts the column, and both of those are worth reading.
 */
const SETTLED_COLUMN_STATUS: ReadonlySet<string> = new Set(['GRADED', 'SUBMITTED']);
const REDUNDANT_ATTEMPT_STATUS: ReadonlySet<string> = new Set(['COMPLETED']);

function saysNothingNew(status: string | null, attempt: string): boolean {
  return status !== null && SETTLED_COLUMN_STATUS.has(status) && REDUNDANT_ATTEMPT_STATUS.has(attempt);
}

/**
 * Blackboard's submission status with a human gloss.
 *
 * The status is Blackboard's, verbatim — a row with feedback but no score
 * reads as whatever Blackboard says it is (usually "submitted"), with no
 * special case (Stack's answer 3). An unrecognised code is shown as itself
 * rather than guessed at. `lastAttempt` is carried alongside, never merged in:
 * a SUBMITTED column whose last attempt is NEEDS_GRADING is still "submitted".
 *
 * `attemptStatus` is null when the attempt repeats the column — literally
 * (GRADED beside GRADED) or in substance (COMPLETED beside GRADED or
 * SUBMITTED, P-grades-6). Both call sites, the gradebook table and the
 * popout's submission block, read it from here, so the rule lives once.
 */
export function submissionLabel(
  status: string | null | undefined,
  lastAttempt?: string | null,
): SubmissionLabel {
  const raw = typeof status === 'string' && status.trim() !== '' ? status.trim() : null;
  const attempt =
    typeof lastAttempt === 'string' && lastAttempt.trim() !== '' ? lastAttempt.trim() : null;
  const repeats = attempt === null || attempt === raw || saysNothingNew(raw, attempt);
  return {
    status: raw,
    text: raw === null ? NO_VALUE : (SUBMISSION_GLOSS[raw] ?? raw),
    attemptStatus: repeats ? null : attempt,
  };
}

/**
 * Whether Blackboard actually recorded any feedback (Phase 12b, G-5/G-6).
 *
 * An untouched feedback box arrives as `''` as readily as `null`, and a box
 * someone typed a space into arrives as `'   '`. None of the three is feedback.
 * The rule lives here for the same reason `submissionLabel` does: the gradebook
 * row draws a mark from it and the popout draws the text from it, and the two
 * disagreeing would put a "has feedback" mark beside an empty panel.
 */
export function hasFeedback(feedback: string | null | undefined): feedback is string {
  return typeof feedback === 'string' && feedback.trim() !== '';
}

/** The three distinct things a course's header can honestly say. */
export type CourseGradeState = 'total' | 'no_total' | 'never_synced';

/**
 * Which of the three states a course is in.
 *
 * `never_synced` (no gradebook row at all) and `no_total` (a gradebook, but
 * Blackboard publishes no calculated total) are different facts and must not
 * collapse into one empty state. A total column that exists but is ungraded is
 * still `total` — the figure itself then renders `—`.
 */
export function courseGradeState(row: CourseGradeRow | null | undefined): CourseGradeState {
  if (!row || !row.has_gradebook) return 'never_synced';
  return row.has_total ? 'total' : 'no_total';
}

/**
 * The one `v_course_grade` row a display course's header speaks for.
 *
 * GEO 103 is two Blackboard shells and each keeps its own row; this picks
 * between them, it never merges them. A shell that publishes a total wins (its
 * `total_name` is shown beside the figure, so which shell it came from is
 * visible); failing that, a shell that has a gradebook at all; failing that,
 * nothing — which renders as "not synced yet".
 */
export function pickCourseGrade(
  rows: readonly CourseGradeRow[] | null | undefined,
  shellIds: readonly string[],
): CourseGradeRow | null {
  const mine = (rows ?? []).filter((row) => shellIds.includes(row.course_id));
  return mine.find((row) => row.has_total) ?? mine.find((row) => row.has_gradebook) ?? null;
}

/** Whether a staged file is the same bytes as something actually submitted. */
export type ShaComparison = 'matches' | 'differs' | 'no_submitted_copy';

function normalizeSha(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? null : trimmed;
}

/**
 * Compare a staged file's sha256 against the copy (or copies) pulled back out
 * of Blackboard.
 *
 * `no_submitted_copy` means there is nothing to compare against yet — either no
 * pulled-back row, or none whose bytes have been hashed. It never claims the
 * two differ on the strength of a missing hash.
 */
export function compareSha(
  staged: string | null | undefined,
  submitted: string | null | undefined | ReadonlyArray<string | null | undefined>,
): ShaComparison {
  const candidates = (Array.isArray(submitted) ? submitted : [submitted as string | null | undefined])
    .map(normalizeSha)
    .filter((value): value is string => value !== null);
  const mine = normalizeSha(staged);
  if (mine === null || candidates.length === 0) return 'no_submitted_copy';
  return candidates.includes(mine) ? 'matches' : 'differs';
}

/** The chip text for each comparison branch. */
export const SHA_LABEL: Record<ShaComparison, string> = {
  matches: 'matches the submitted copy',
  differs: 'differs from the submitted copy',
  no_submitted_copy: 'no submitted copy yet',
};

/**
 * How many attempts an item allows, from the two columns Blackboard splits the
 * answer across.
 *
 * `multiple_attempts` is 0 for a single-attempt item — NOT "no ceiling" — and
 * unlimited is recorded separately as `attempts_left = -1`. Passing
 * `multiple_attempts` straight to `attemptsText` therefore read "Attempt 2 of
 * 1" on real rows. This is the same rule `v_assignment_attempts.attempts_allowed`
 * encodes (migration 055), so a row that carries the view's value needs no
 * second opinion; this function is only the fallback for a gradebook row read
 * on its own.
 *
 * Null from both columns means Blackboard said nothing, and so do we.
 */
export function attemptsAllowed(
  multipleAttempts: number | null | undefined,
  attemptsLeft: number | null | undefined,
): number | null {
  if (multipleAttempts == null && attemptsLeft == null) return null;
  if (attemptsLeft === -1) return -1;
  if (multipleAttempts != null && multipleAttempts > 1) return multipleAttempts;
  return 1;
}

/**
 * "Attempt 2 of 3" / "Attempt 1 (unlimited)" / "Attempt 1 of 1".
 *
 * `allowed` is an `attemptsAllowed` value: a negative number means unlimited,
 * 0 or 1 a single attempt, and null that Blackboard did not say — in which case
 * the count stands alone rather than inventing a ceiling.
 */
export function attemptsText(n: number, allowed: number | null | undefined): string {
  const attempt = `Attempt ${n}`;
  if (allowed === null || allowed === undefined) return attempt;
  if (allowed < 0) return `${attempt} (unlimited)`;
  if (allowed <= 1) return `${attempt} of 1`;
  return `${attempt} of ${allowed}`;
}

/**
 * The gradebook rows that belong among the items: real gradebook items, plus
 * an attendance column that actually counts toward the grade (Stack's answer
 * 8 — V-1's `component_id` links drive this, not a client list).
 */
export function isItemRow(row: Pick<GradebookLatestRow, 'column_kind' | 'counts_toward_grade'>): boolean {
  if (row.column_kind === 'item') return true;
  return row.column_kind === 'attendance' && row.counts_toward_grade === true;
}

/**
 * The one call to action a staged file carries, on every screen that lists it.
 *
 * bb2dash cannot submit anything — Blackboard is where a submission happens —
 * so the label says what the file is and where to take it. The word "Submit"
 * appears on no control anywhere in this app; a test asserts that.
 */
export const STAGED_LABEL = 'Staged in bb2dash — attach in Blackboard ↗';

/** How a `my_submissions` row got here: Stack staged it, or a sync pulled it. */
export type SubmissionOrigin = 'staged' | 'pulled_back' | 'other';

/**
 * `classified_by` is typed loosely here on purpose: `'blackboard'` joins the
 * `classifier` enum in migration 048, so the generated enum does not carry it
 * until the types are regenerated.
 */
export function submissionOrigin(row: {
  bucket?: string | null;
  classified_by?: string | null;
}): SubmissionOrigin {
  if (row.bucket !== 'my_submissions') return 'other';
  if (row.classified_by === 'stack') return 'staged';
  if (row.classified_by === 'blackboard') return 'pulled_back';
  return 'other';
}

/** Everything else: uncounted attendance, letter columns, non-total calcs. */
export function isBookkeepingRow(
  row: Pick<GradebookLatestRow, 'column_kind' | 'counts_toward_grade'>,
): boolean {
  if (row.column_kind === 'total') return false;
  return !isItemRow(row);
}
