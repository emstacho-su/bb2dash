/**
 * bb2dash — gradebook query layer (Phase 10a, R-10/R-11/R-17/R-18).
 *
 * Conventions follow `queries.popout.ts` and `queries.materials.ts`: a greppable
 * key namespace, `*Options()` returning `queryOptions`, throw on error, and no
 * fabricated fallbacks. Two things are specific to this module.
 *
 * ROW TYPES — `src/lib/supabase/database.types.ts` predates migrations 046-051,
 * so the typed client does not know `v_gradebook_latest`, `v_assignment_grade`,
 * `v_course_grade` or `v_assignment_attempts`, and still types
 * `bb_files.source_url` as NOT NULL (049 drops that). The four view row types
 * below are the frozen column lists from
 * `docs/planning/67_PHASE10A_grades.md` §047/§050 — hand-narrowed on purpose,
 * because Postgres reports no not-null constraint on a view and the generated
 * types would make every column nullable (the Phase 8 precedent, see
 * `queries.course.ts`). Each read goes through the same one documented cast to
 * an untyped client that `queries.materials.ts` uses for `v_bb_files_current`.
 * Regenerate the types after 046-051 land and the casts can be dropped.
 *
 * HONESTY — every figure here is a Blackboard value with the `seen_at` of the
 * run that saw it. Nothing in this module sums, averages or projects anything:
 * `v_course_grade` carries Blackboard's own total row or nulls, and a null
 * renders `—`, never `0`. The three course states (`total`, `no_total`,
 * `never_synced`) are distinct and none of them is inferred from a score.
 *
 * WRITES — the only write in this file is the staged-submission upload: one
 * Storage object plus one `bb_files` row. `assignments`, `assignment_progress`,
 * `bb_gradebook` and `bb_attempts` are never written from the browser.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables } from './queries';
import { BB_FILES_BUCKET, materialsKeys } from './queries.materials';

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
  /** `assignments.id`. */
  id: string;
  course_id: string;
  title: string | null;
  type: string | null;
  points_possible: number | null;
} & {
  /** Every gradebook column, nullable: the column may never have been crawled. */
  [K in keyof Omit<GradebookLatestRow, 'course_id'>]: GradebookLatestRow[K] | null;
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

/** Stable, order-independent key for a set of shells (as `queries.course.ts`). */
function shellKey(shellIds: readonly string[]): string {
  return [...shellIds].sort().join('+');
}

export const gradesKeys = {
  courseGrades: () => ['grades', 'course-grades'] as const,
  gradebook: (shellIds: readonly string[]) =>
    ['grades', 'gradebook', shellKey(shellIds)] as const,
  assignmentGrade: (assignmentId: string) =>
    ['grades', 'assignment-grade', assignmentId] as const,
  assignmentAttempts: (assignmentId: string) =>
    ['grades', 'assignment-attempts', assignmentId] as const,
  submissionFiles: (assignmentId: string) =>
    ['grades', 'submission-files', assignmentId] as const,
} as const;

/**
 * The untyped client used for the four Phase 10a views and the `bb_files`
 * insert. See the module header: `database.types.ts` does not know the views
 * yet, and still types `source_url` NOT NULL. One place, one comment, so the
 * cast can be deleted in one edit once the types are regenerated.
 */
function untypedClient(): SupabaseClient {
  return getSupabaseBrowserClient() as unknown as SupabaseClient;
}

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** Blackboard's published total (or the absence of one) for every course. */
export function courseGradesOptions() {
  return queryOptions({
    queryKey: gradesKeys.courseGrades(),
    queryFn: async (): Promise<CourseGradeRow[]> => {
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_course_grade')
        .select('*')
        .order('course_id', { ascending: true });
      if (error) throw error;
      return (data as CourseGradeRow[] | null) ?? [];
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
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_gradebook_latest')
        .select('*')
        .in('course_id', shellIds as string[])
        .order('course_id', { ascending: true })
        .order('position', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data as GradebookLatestRow[] | null) ?? [];
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
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_assignment_grade')
        .select('*')
        .eq('id', assignmentId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as AssignmentGradeRow | null) ?? null;
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
      const supabase = untypedClient();
      const { data, error } = await supabase
        .from('v_assignment_attempts')
        .select('*')
        .eq('assignment_id', assignmentId as string)
        .order('attempt_no', { ascending: true });
      if (error) throw error;
      return (data as AssignmentAttemptRow[] | null) ?? [];
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

/* ---------------------------------------------------------------------------
 * Pure display helpers — no React, no network, all unit-tested
 * ------------------------------------------------------------------------ */

/** What a missing figure looks like. Never `0`, never a blank cell. */
export const NO_VALUE = '—';

/** Trim a numeric's trailing zeros without rounding it: 83.333 → "83.333". */
function numberText(value: number | string): string {
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
  const score = numberText(effective);
  if (possible === null || possible === undefined || possible === '') return score;
  return `${score} / ${numberText(possible)}`;
}

/** The course time zone every date on these screens is read in. */
export const COURSE_TIME_ZONE = 'America/New_York';

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
 * Blackboard's submission status with a human gloss.
 *
 * The status is Blackboard's, verbatim — a row with feedback but no score
 * reads as whatever Blackboard says it is (usually "submitted"), with no
 * special case (Stack's answer 3). An unrecognised code is shown as itself
 * rather than guessed at. `lastAttempt` is carried alongside, never merged in:
 * a SUBMITTED column whose last attempt is NEEDS_GRADING is still "submitted".
 */
export function submissionLabel(
  status: string | null | undefined,
  lastAttempt?: string | null,
): SubmissionLabel {
  const raw = typeof status === 'string' && status.trim() !== '' ? status.trim() : null;
  const attempt =
    typeof lastAttempt === 'string' && lastAttempt.trim() !== '' ? lastAttempt.trim() : null;
  return {
    status: raw,
    text: raw === null ? NO_VALUE : (SUBMISSION_GLOSS[raw] ?? raw),
    attemptStatus: attempt !== null && attempt !== raw ? attempt : null,
  };
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
 * "Attempt 2 of 3" / "Attempt 1 (unlimited)" / "Attempt 1 of 1".
 *
 * `allowed` is `v_gradebook_latest.multiple_attempts`: 0 or 1 means a single
 * attempt, a negative value means unlimited, and null means Blackboard did not
 * say — in which case the count stands alone rather than inventing a ceiling.
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

/* ---------------------------------------------------------------------------
 * Staging a file — validation at the boundary
 * ------------------------------------------------------------------------ */

/** One file at a time, and no bigger than this. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** `bb_files.file_name` is the Storage key's last segment; keep it sane. */
export const MAX_FILE_NAME_LENGTH = 180;

/** Split a name into stem + extension, where the extension is short and real. */
function splitExtension(fileName: string): { stem: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return { stem: fileName, ext: '' };
  const ext = fileName.slice(dot);
  if (ext.length > 12) return { stem: fileName, ext: '' };
  return { stem: fileName.slice(0, dot), ext };
}

/** Cap a name at MAX_FILE_NAME_LENGTH, keeping the extension. */
function capFileName(fileName: string): string {
  if (fileName.length <= MAX_FILE_NAME_LENGTH) return fileName;
  const { stem, ext } = splitExtension(fileName);
  return `${stem.slice(0, Math.max(1, MAX_FILE_NAME_LENGTH - ext.length))}${ext}`;
}

/**
 * The name a staged file is filed under: the original, with path separators and
 * control characters replaced by `_`, capped at 180 characters.
 *
 * The name becomes the last segment of a Storage key, so a '/' or a '\' in it
 * would silently move the object into another folder. Throws rather than
 * inventing a name when nothing usable is left.
 */
export function sanitizeFileName(raw: string | null | undefined): string {
  if (typeof raw !== 'string') throw new Error('That file has no name, so it was not staged.');
  // Written as a code-point scan rather than a regex: a character class of
  // control characters puts literal control bytes in this source file.
  const cleaned = Array.from(raw)
    .map((ch) => {
      if (ch === '/' || ch === '\\') return '_';
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f ? '_' : ch;
    })
    .join('')
    .trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    throw new Error('That file name cannot be used, so it was not staged.');
  }
  return capFileName(cleaned);
}

/**
 * ` (2)`, ` (3)` … before the extension when the same assignment already has a
 * file by that name. Nothing is ever overwritten (the upload is `upsert: false`
 * as well, so a race loses the upload rather than the earlier file).
 */
export function withCollisionSuffix(fileName: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  if (!used.has(fileName.toLowerCase())) return fileName;
  const { stem, ext } = splitExtension(fileName);
  for (let n = 2; n <= 99; n += 1) {
    const candidate = capFileName(`${stem} (${n})${ext}`);
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error(`There are already 99 files called "${fileName}" on this assignment.`);
}

/** Postgres `split_part(assignment_id, '/', 2)` — 'IST.323/lab-1' → 'lab-1'. */
export function assignmentSlug(assignmentId: string | null | undefined): string {
  if (typeof assignmentId !== 'string') return '';
  return assignmentId.split('/')[1] ?? '';
}

/**
 * The Storage key inside the `bb-files` bucket, identical to what
 * `bb_file_relpath(id)` (migration 008) builds for the same row:
 * `<course>/my_submissions/<assignment-slug>/<file_name>`, or without the slug
 * segment when the column has no linked assignment.
 */
export function submissionRelPath(
  courseId: string,
  assignmentId: string | null | undefined,
  fileName: string,
): string {
  const slug = assignmentSlug(assignmentId);
  return `${courseId}/my_submissions/${slug ? `${slug}/` : ''}${fileName}`;
}

/** Validate one dropped file at the boundary. Throws with a shovable message. */
export function validateUpload(files: readonly File[] | FileList | null | undefined): File {
  const list = files ? Array.from(files as ArrayLike<File>) : [];
  if (list.length === 0) throw new Error('No file was dropped.');
  if (list.length > 1) throw new Error('One file at a time, please — nothing was staged.');
  const file = list[0];
  if (file.size === 0) throw new Error('That file is empty, so it was not staged.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${Math.round(file.size / (1024 * 1024))} MB; the limit is ${
        MAX_UPLOAD_BYTES / (1024 * 1024)
      } MB. Nothing was staged.`,
    );
  }
  // Throws on an unusable name before anything is uploaded.
  sanitizeFileName(file.name);
  return file;
}

/** sha256 of the file's bytes, lowercase hex — the same digest Postgres stores. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('This browser cannot hash the file (crypto.subtle unavailable).');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export interface StageUploadInput {
  /** The shell the file is filed under (`courses.id`). */
  courseId: string;
  /** The assignment it belongs to; null files it at the course's bucket root. */
  assignmentId: string | null;
  /** Exactly one file — a FileList or array is validated down to one. */
  files: readonly File[] | FileList | null;
}

export interface StageUploadResult {
  fileName: string;
  storagePath: string;
  sha256: string;
  bytes: number;
}

/**
 * Stage a file against an assignment: one Storage object under
 * `my_submissions`, one `bb_files` row pointing at it.
 *
 * This does NOT submit anything to Blackboard and never claims to — the row it
 * writes is labelled "staged" everywhere it is shown, and Blackboard remains
 * the only place a submission actually happens. Nothing here touches
 * `assignments` or `assignment_progress`.
 *
 * Exported as a plain async function as well as a hook, so the exact row it
 * writes can be asserted directly in a test.
 */
export async function stageUpload(input: StageUploadInput): Promise<StageUploadResult> {
  const { courseId, assignmentId } = input;
  if (!courseId) throw new Error('No course to stage this file against.');

  const file = validateUpload(input.files);
  const supabase = getSupabaseBrowserClient();

  // `bb_files.bb_course_id` is the Blackboard shell id (`courses.bb_id`), and
  // it is NOT NULL — a course without one cannot carry a file row, and saying
  // so is better than writing a row under a guessed id.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, bb_id')
    .eq('id', courseId)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new Error(`No course with id ${courseId}.`);
  if (!course.bb_id) {
    throw new Error(
      `${courseId} has no Blackboard id recorded, so a submission cannot be filed against it.`,
    );
  }

  // Existing names for this assignment decide the ` (2)` suffix.
  const takenQuery = supabase
    .from('bb_files')
    .select('file_name')
    .eq('course_id', courseId)
    .eq('bucket', 'my_submissions')
    .is('superseded_by', null);
  const { data: existing, error: existingError } = await (assignmentId
    ? takenQuery.eq('assignment_id', assignmentId)
    : takenQuery.is('assignment_id', null));
  if (existingError) throw existingError;

  const fileName = withCollisionSuffix(
    sanitizeFileName(file.name),
    (existing ?? []).map((row) => row.file_name),
  );
  const relPath = submissionRelPath(courseId, assignmentId, fileName);
  const storagePath = `${BB_FILES_BUCKET}/${relPath}`;

  const bytes = await file.arrayBuffer();
  const sha256 = await sha256Hex(bytes);

  const { error: uploadError } = await supabase.storage
    .from(BB_FILES_BUCKET)
    .upload(relPath, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
  if (uploadError) throw uploadError;

  // See the module header: `source_url` is still typed NOT NULL by the
  // generated types until 049 is applied and they are regenerated.
  const stagedAt = new Date().toISOString();
  const row = {
    bb_course_id: course.bb_id,
    course_id: courseId,
    file_name: fileName,
    mime_type: file.type || null,
    bytes: file.size,
    sha256,
    storage_path: storagePath,
    local_path: null,
    bucket: 'my_submissions',
    classified_by: 'stack',
    classification_confidence: 1,
    assignment_id: assignmentId,
    text_status: 'na',
    downloaded_at: stagedAt,
    source_url: null,
    notes: `staged in bb2dash ${stagedAt}`,
  };
  const { error: insertError } = await untypedClient().from('bb_files').insert(row);
  if (insertError) throw insertError;

  return { fileName, storagePath, sha256, bytes: file.size };
}

/** The mutation the drop zones use; invalidates every cache the row shows in. */
export function useStageUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stageUpload,

    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: materialsKeys.files() });
      if (variables.assignmentId) {
        void queryClient.invalidateQueries({
          queryKey: gradesKeys.submissionFiles(variables.assignmentId),
        });
      }
    },
  });
}
