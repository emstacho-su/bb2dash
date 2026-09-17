/**
 * The poller's reads — C-6's R1, R2, R3 and the course-label read — over the frozen
 * `RestGet` signature. No `fetch` here: W-25's `core/rest.ts` supplies the transport, this
 * module supplies the query strings and the row validation.
 *
 * The query strings are frozen byte for byte by C-6. They are built by the exported
 * `*Query` functions so the unit suite can assert them against the Contract's table without
 * going near a network. Every interpolated value is validated first, so a value can never
 * smuggle a `&` or a `%` into someone else's parameter.
 *
 * Validation is hand-written rather than schema-library work: `core/` carries no runtime
 * dependency, and a row set that fails validation is a typed error the scheduler turns into
 * "this tick changes nothing" (C-7).
 */

import type { CourseLabel, DueRow, GradeRow, RestGet, SyncStatusRow } from '../types';

/** A relation whose rows did not match the shape C-6 promises. */
export class RowShapeError extends Error {
  constructor(
    readonly relation: string,
    detail: string,
  ) {
    super(`${relation}: ${detail}`);
    this.name = 'RowShapeError';
  }
}

/** A value that would have been interpolated into a frozen query string but is malformed. */
export class QueryValueError extends Error {
  constructor(parameter: string, value: string) {
    super(`${parameter} is not in the expected form: ${JSON.stringify(value)}`);
    this.name = 'QueryValueError';
  }
}

/** `2026-09-16T18:04:02.000Z` — what `Date.prototype.toISOString` produces, and only that. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------------------
// Query strings — frozen by C-6
// ---------------------------------------------------------------------------------------

export const SYNC_RELATION = 'v_sync_status';
export const GRADES_RELATION = 'v_gradebook_history';
export const DUE_RELATION = 'v_work_items';
export const COURSES_RELATION = 'courses';

/** R1. One row. */
export function syncQuery(): string {
  return 'select=id,run_id,status,started_at,finished_at,trigger,summary';
}

/**
 * R2. `lastSeenAt` must be a plain `...Z` ISO instant: it goes in unencoded, exactly as C-6
 * writes it, and the regex is what makes that safe.
 */
export function gradesQuery(lastSeenAt: string): string {
  if (!ISO_INSTANT.test(lastSeenAt)) throw new QueryValueError('lastSeenAt', lastSeenAt);
  return (
    `seen_at=gt.${lastSeenAt}` +
    '&score=not.is.null' +
    '&select=shell_course_id,column_id,name,run_id,seen_at,score,possible,previous_score' +
    '&order=seen_at.asc' +
    '&limit=200'
  );
}

/** R3. `dueOn` is the New York calendar date plus one, as `YYYY-MM-DD`. */
export function dueQuery(dueOn: string): string {
  if (!ISO_DATE.test(dueOn)) throw new QueryValueError('dueOn', dueOn);
  return (
    `due_on=eq.${dueOn}` +
    '&in_workload=is.true' +
    '&status=not.in.(submitted,graded,missed,excused,not_applicable,waived)' +
    '&select=item_kind,item_id,course_id,title,due_at,due_on,status'
  );
}

/** The labels read, once per launch. */
export function coursesQuery(): string {
  return 'select=id,title_short';
}

// ---------------------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------------------

type Row = Record<string, unknown>;

function asRows(relation: string, rows: unknown): readonly Row[] {
  if (!Array.isArray(rows)) throw new RowShapeError(relation, 'PostgREST did not return an array');
  return rows.map((row, index) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new RowShapeError(relation, `row ${index} is not an object`);
    }
    return row as Row;
  });
}

function str(relation: string, row: Row, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new RowShapeError(relation, `${field} is not a string`);
  return value;
}

function nullableStr(relation: string, row: Row, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new RowShapeError(relation, `${field} is not a string or null`);
  return value;
}

function num(relation: string, row: Row, field: string): number {
  const value = row[field];
  // PostgREST renders `numeric` as a JSON number; a string here means the shape moved.
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RowShapeError(relation, `${field} is not a finite number`);
  }
  return value;
}

function nullableNum(relation: string, row: Row, field: string): number | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  return num(relation, row, field);
}

/** R1's row. `summary` is `{stages, changes, attention_raised, errors}` (migration 035). */
export function validateSyncRows(rows: unknown): SyncStatusRow | null {
  const parsed = asRows(SYNC_RELATION, rows);
  const row = parsed[0];
  if (!row) return null; // v_sync_status is `limit 1`; an empty result is "no sync yet".

  const id = row['id'];
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    throw new RowShapeError(SYNC_RELATION, 'id is not an integer');
  }

  const rawSummary = row['summary'];
  let summary: SyncStatusRow['summary'] = null;
  if (rawSummary !== null && rawSummary !== undefined) {
    if (typeof rawSummary !== 'object' || Array.isArray(rawSummary)) {
      throw new RowShapeError(SYNC_RELATION, 'summary is not an object or null');
    }
    const record = rawSummary as Row;
    const changes = record['changes'];
    const errors = record['errors'];
    const attention = record['attention_raised'];
    const strings = (value: unknown, field: string): readonly string[] => {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value) || value.some((line) => typeof line !== 'string')) {
        throw new RowShapeError(SYNC_RELATION, `summary.${field} is not a string array`);
      }
      return value as readonly string[];
    };
    summary = {
      changes: strings(changes, 'changes'),
      errors: strings(errors, 'errors'),
      attention_raised: typeof attention === 'number' && Number.isFinite(attention) ? attention : 0,
    };
  }

  return {
    id,
    run_id: nullableStr(SYNC_RELATION, row, 'run_id'),
    status: str(SYNC_RELATION, row, 'status'),
    started_at: nullableStr(SYNC_RELATION, row, 'started_at'),
    finished_at: nullableStr(SYNC_RELATION, row, 'finished_at'),
    trigger: nullableStr(SYNC_RELATION, row, 'trigger'),
    summary,
  };
}

/** R2's rows. The query already filters `score` non-null, so `score` is required here. */
export function validateGradeRows(rows: unknown): readonly GradeRow[] {
  return asRows(GRADES_RELATION, rows).map((row) => ({
    shell_course_id: str(GRADES_RELATION, row, 'shell_course_id'),
    column_id: str(GRADES_RELATION, row, 'column_id'),
    name: str(GRADES_RELATION, row, 'name'),
    run_id: str(GRADES_RELATION, row, 'run_id'),
    seen_at: str(GRADES_RELATION, row, 'seen_at'),
    score: num(GRADES_RELATION, row, 'score'),
    possible: nullableNum(GRADES_RELATION, row, 'possible'),
    previous_score: nullableNum(GRADES_RELATION, row, 'previous_score'),
  }));
}

/** R3's rows. `item_kind` is `assignment` or `reading` (migration 016's union). */
export function validateDueRows(rows: unknown): readonly DueRow[] {
  return asRows(DUE_RELATION, rows).map((row) => {
    const kind = str(DUE_RELATION, row, 'item_kind');
    if (kind !== 'assignment' && kind !== 'reading') {
      throw new RowShapeError(DUE_RELATION, `item_kind ${JSON.stringify(kind)} is neither assignment nor reading`);
    }
    return {
      item_kind: kind,
      item_id: str(DUE_RELATION, row, 'item_id'),
      course_id: str(DUE_RELATION, row, 'course_id'),
      title: str(DUE_RELATION, row, 'title'),
      due_at: nullableStr(DUE_RELATION, row, 'due_at'),
      due_on: str(DUE_RELATION, row, 'due_on'),
      status: str(DUE_RELATION, row, 'status'),
    };
  });
}

export function validateCourseLabels(rows: unknown): readonly CourseLabel[] {
  return asRows(COURSES_RELATION, rows).map((row) => ({
    id: str(COURSES_RELATION, row, 'id'),
    title_short: nullableStr(COURSES_RELATION, row, 'title_short') ?? str(COURSES_RELATION, row, 'id'),
  }));
}

// ---------------------------------------------------------------------------------------
// The reads
// ---------------------------------------------------------------------------------------

/** R1 — the one `v_sync_status` row, or `null` when there has never been a sync. */
export function readSyncStatus(get: RestGet): Promise<SyncStatusRow | null> {
  return get(SYNC_RELATION, syncQuery(), validateSyncRows);
}

/** R2 — every gradebook observation newer than the watermark. */
export function readNewGrades(get: RestGet, lastSeenAt: string): Promise<readonly GradeRow[]> {
  return get(GRADES_RELATION, gradesQuery(lastSeenAt), validateGradeRows);
}

/** R3 — the work items due on `dueOn`, still open and inside the workload. */
export function readDueItems(get: RestGet, dueOn: string): Promise<readonly DueRow[]> {
  return get(DUE_RELATION, dueQuery(dueOn), validateDueRows);
}

/** The labels, read once per launch and cached by the scheduler. */
export function readCourseLabels(get: RestGet): Promise<readonly CourseLabel[]> {
  return get(COURSES_RELATION, coursesQuery(), validateCourseLabels);
}
