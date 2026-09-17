/**
 * The pure notification reducer — C-7's four rules and nothing else.
 *
 * `reduce({ sync, grades, due, now, watermark, courses }) -> { toasts, watermark }`.
 * Same input, same output: no clock, no I/O, no mutation. `now` is the tick's start time,
 * supplied by the scheduler; `due` is `null` on a tick where the daily check did not run.
 *
 * Everything it returns is new: the input watermark is never written to.
 */

import type {
  CourseLabel,
  GradeRow,
  ReduceInput,
  ReduceOutput,
  SyncStatusRow,
  Toast,
  Watermark,
} from '../types';
import { HOME_ROUTE, courseGradesRoute } from '../route';
import { nyDate } from './ny-time';

/** C-7: "newest 500 keys kept". */
export const FIRED_KEYS_LIMIT = 500;

/** C-7 rule 2: "four or more rows in one tick coalesce per shell course". */
export const GRADE_COALESCE_THRESHOLD = 4;

/** C-7 rules 1 and 3: "the first three ... lines". */
const MAX_BODY_LINES = 3;

/** C-7 rule 1: the statuses that count as landed. `running` never toasts. */
const LANDED_STATUSES: ReadonlySet<string> = new Set(['ok', 'partial', 'failed']);

/** " · " — the separator the Contract writes in every title. */
const SEPARATOR = ' · ';

// ---------------------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------------------

/** Milliseconds for an ISO timestamp, or `null` when it is absent or unparseable. */
function millis(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string' || iso.length === 0) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/** `title_short` for a course id, falling back to the id itself when there is no label. */
function labelFor(courses: readonly CourseLabel[], courseId: string): string {
  const match = courses.find((course) => course.id === courseId);
  return match && match.title_short.length > 0 ? match.title_short : courseId;
}

/** The first `MAX_BODY_LINES` of `lines`, joined for a notification body. */
function bodyLines(lines: readonly string[]): string {
  return lines.slice(0, MAX_BODY_LINES).join('\n');
}

/** A number as the Contract prints it: no trailing zeroes, no locale grouping. */
function numeric(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

// ---------------------------------------------------------------------------------------
// Rule 1 — sync landed
// ---------------------------------------------------------------------------------------

function syncToast(sync: SyncStatusRow | null, lastSeenAt: string): Toast | null {
  if (!sync) return null;
  if (!LANDED_STATUSES.has(sync.status)) return null;

  const finished = millis(sync.finished_at);
  const seen = millis(lastSeenAt);
  if (finished === null || seen === null || finished <= seen) return null;

  const summary = sync.summary ?? null;
  const changes = summary?.changes ?? [];
  const errors = summary?.errors ?? [];
  const attention = summary?.attention_raised ?? 0;
  const route = attention > 0 ? '/inbox' : HOME_ROUTE;
  const firstError = errors.length > 0 ? errors[0] : undefined;

  if (sync.status === 'failed') {
    return {
      key: `sync:${sync.id}`,
      title: 'Sync failed',
      body: firstError ?? 'No error detail was recorded.',
      route,
    };
  }

  const title =
    changes.length === 0
      ? `Sync landed${SEPARATOR}no changes`
      : `Sync landed${SEPARATOR}${changes.length} change(s)`;

  // A `partial` run toasts like a landed one "with its error line" (Contract, Residual
  // assumptions), so the error is appended below the change lines rather than replacing them.
  const lines = [...changes.slice(0, MAX_BODY_LINES)];
  if (sync.status === 'partial' && firstError) lines.push(firstError);

  return { key: `sync:${sync.id}`, title, body: lines.join('\n'), route };
}

// ---------------------------------------------------------------------------------------
// Rule 2 — grade posted
// ---------------------------------------------------------------------------------------

/** C-7 rule 2's frozen key. */
export function gradeKey(row: GradeRow): string {
  return `grade:${row.shell_course_id}:${row.column_id}:${row.run_id}`;
}

function gradeDetailToast(row: GradeRow, courses: readonly CourseLabel[]): Toast {
  const score = numeric(row.score);
  const scoreLine = row.possible === null ? score : `${score} / ${numeric(row.possible)}`;
  const body =
    row.previous_score === null
      ? scoreLine
      : `${scoreLine}${SEPARATOR}was ${numeric(row.previous_score)}`;
  return {
    key: gradeKey(row),
    title: `${labelFor(courses, row.shell_course_id)}${SEPARATOR}${row.name}`,
    body,
    route: courseGradesRoute(row.shell_course_id),
  };
}

/** Group preserving first-seen order, so the output is a deterministic function of the input. */
function groupByCourse(rows: readonly GradeRow[]): ReadonlyMap<string, readonly GradeRow[]> {
  const groups = new Map<string, GradeRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.shell_course_id);
    if (bucket) bucket.push(row);
    else groups.set(row.shell_course_id, [row]);
  }
  return groups;
}

function gradeToasts(rows: readonly GradeRow[], courses: readonly CourseLabel[]): readonly Toast[] {
  if (rows.length === 0) return [];
  if (rows.length < GRADE_COALESCE_THRESHOLD) {
    return rows.map((row) => gradeDetailToast(row, courses));
  }
  const toasts: Toast[] = [];
  for (const [courseId, group] of groupByCourse(rows)) {
    const newest = group[group.length - 1];
    if (!newest) continue; // unreachable: a group is never empty.
    toasts.push({
      // The Contract freezes the per-row key only. A coalesced toast needs one of its own:
      // it is namespaced under the same prefix and carries the newest member's run, so it is
      // stable for the tick. Every member row key is recorded in `firedKeys` regardless.
      key: `grade:${courseId}:coalesced:${newest.run_id}`,
      title: `${labelFor(courses, courseId)}${SEPARATOR}${group.length} grades posted`,
      body: bodyLines(group.map((row) => row.name)),
      route: courseGradesRoute(courseId),
    });
  }
  return toasts;
}

// ---------------------------------------------------------------------------------------
// Rule 3 — due tomorrow
// ---------------------------------------------------------------------------------------

function dueToast(input: ReduceInput, checkedOn: string): Toast | null {
  const rows = input.due;
  if (!rows || rows.length === 0) return null;
  return {
    // One per day, keyed on the New York date the check ran — the same value written to
    // `dueCheckedOn`, so the key and the recorded date can never disagree.
    key: `due:${checkedOn}`,
    title: `Due tomorrow${SEPARATOR}${rows.length} item(s)`,
    body: bodyLines(
      rows.map((row) => `${labelFor(input.courses, row.course_id)}${SEPARATOR}${row.title}`),
    ),
    route: HOME_ROUTE,
  };
}

// ---------------------------------------------------------------------------------------
// Rule 4 — dedupe, cap, advance
// ---------------------------------------------------------------------------------------

/** `existing` then the new `added`, de-duplicated, oldest first, newest 500 kept. */
export function mergeFiredKeys(
  existing: readonly string[],
  added: readonly string[],
): readonly string[] {
  const merged = [...existing];
  const seen = new Set(existing);
  for (const key of added) {
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(key);
  }
  return merged.length > FIRED_KEYS_LIMIT ? merged.slice(merged.length - FIRED_KEYS_LIMIT) : merged;
}

// ---------------------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------------------

export function reduce(input: ReduceInput): ReduceOutput {
  const { watermark, now } = input;
  const alreadyFired = new Set(watermark.firedKeys);

  // Rule 3: the date recorded is the New York date the check ran on. On a tick where the
  // check did not run (`due === null`) the recorded date is left exactly as it was.
  const checkedOn = input.due === null ? watermark.dueCheckedOn : nyDate(now);

  const candidates: Toast[] = [];
  const keysToRecord: string[] = [];

  const sync = syncToast(input.sync, watermark.lastSeenAt);
  if (sync) candidates.push(sync);

  // Rule 4 is applied to grade rows *before* rule 2 counts them, so an already-fired row can
  // never push a tick over the coalescing threshold.
  const newGrades = input.grades.filter((row) => !alreadyFired.has(gradeKey(row)));
  for (const row of newGrades) keysToRecord.push(gradeKey(row));
  candidates.push(...gradeToasts(newGrades, input.courses));

  if (input.due !== null && checkedOn !== null) {
    const due = dueToast(input, checkedOn);
    if (due) candidates.push(due);
  }

  const toasts = candidates.filter((toast) => !alreadyFired.has(toast.key));
  for (const toast of toasts) keysToRecord.push(toast.key);

  return {
    toasts,
    watermark: {
      version: 1,
      // C-7 rule 4: `lastSeenAt` advances to the tick's start time.
      lastSeenAt: now.toISOString(),
      dueCheckedOn: checkedOn,
      firedKeys: mergeFiredKeys(watermark.firedKeys, keysToRecord),
    },
  };
}

/** The watermark a first launch writes: nothing historical can fire behind it. */
export function initialWatermark(now: Date): Watermark {
  return { version: 1, lastSeenAt: now.toISOString(), dueCheckedOn: null, firedKeys: [] };
}
