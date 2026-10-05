/**
 * Pure helpers for one Inbox row (R3-3 split them out of `Inbox.tsx`, which
 * re-exports them so its importers and tests are unchanged).
 *
 * Nothing here renders; every function answers from the row alone.
 */

import {
  fieldPhrase,
  isAssignmentRef,
  keyPhrase,
  type AttentionItem,
} from '@/lib/queries.sync';
import { courseCodeFromId } from '@/lib/queries.today';
import { itemQuery } from '@/lib/queries.popout';

/**
 * Which input a `stack_must_confirm` / `missing` row gets. Date-shaped fields
 * (`due_at`, `for_date`, `start_date`, …) get a real date picker so the answer
 * is already 'YYYY-MM-DD' by the time it reaches the boundary parser.
 */
export function answerTypeFor(item: Pick<AttentionItem, 'field'>): 'text' | 'date' {
  const field = item.field ?? '';
  return /(^|_)(date|due|start|end|deadline)($|_)|_at$|_date$/i.test(field) ? 'date' : 'text';
}

/** R-56 (B-29): the Inbox line for a gap that closed itself and came back within 24 h. */
export const REOPENED_LINE = 'Closed itself earlier today and came back';

/** The key `close_cleared_gaps()` (114) sets on a row it left open because it reopened. */
const REOPENED_KEY = 'reopened_within_24h';

function suggestedRecord(item: Pick<AttentionItem, 'suggested'>): Record<string, unknown> | null {
  const value: unknown = item.suggested;
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** One Inbox write's bookkeeping: when it was sent, and the row it was about. */
export interface InboxWrite<T> {
  at: number;
  id: number | null;
  detail: T;
}

/**
 * The Inbox runs three mutations over the same four columns (an answer, a
 * session choice, an undo), and a mutation's error or pending state persists
 * until that same hook runs again. The card that owns the state in flight, or
 * the failure to show, is whichever write was sent last — not a fixed order
 * among the three, which let a stale undo failure hide a fresh answer failure
 * on another card. `null` entries are writes with nothing to report.
 */
export function latestWrite<T>(writes: readonly (InboxWrite<T> | null)[]): InboxWrite<T> | null {
  let latest: InboxWrite<T> | null = null;
  for (const write of writes) {
    if (write !== null && (latest === null || write.at > latest.at)) latest = write;
  }
  return latest;
}

/** True when 114 flagged the row: `suggested->>'reopened_within_24h'` is `true`. */
export function reopenedWithin24h(item: Pick<AttentionItem, 'suggested'>): boolean {
  const flag = suggestedRecord(item)?.[REOPENED_KEY];
  return flag === true || flag === 'true';
}

/** `suggested` without the reopened flag, which the row says in words instead. */
export function suggestedDetails(item: Pick<AttentionItem, 'suggested'>): unknown {
  const record = suggestedRecord(item);
  if (!record || !(REOPENED_KEY in record)) return item.suggested;
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== REOPENED_KEY));
}

/**
 * What to show Stack when a resolve fails. Supabase hands back a PostgrestError
 * — a plain object with `message`, not an `Error` — so this never assumes an
 * instance, and never renders "undefined" at him.
 */
export function failureText(err: unknown): string {
  if (typeof err === 'string' && err.trim().length > 0) return err;
  if (err !== null && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }
  return 'the database rejected the change';
}

/**
 * I-3 / P-inbox-3 — where the question came from, in words.
 *
 * The prefixed pseudo-refs each get their own phrase, because "column:_3569973_1"
 * and "course_field:academic_advisor" are different KINDS of question and the
 * difference is the first thing worth knowing about the row.
 */
export function sourceText(item: AttentionItem): string {
  const course = item.course_id ? courseCodeFromId(item.course_id) : null;
  const inCourse = course ? ` in ${course}` : '';
  let where: string;

  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    const slug = (item.ref as string).split('/').pop();
    where = `the assignment “${slug}”${inCourse}`;
  } else if (item.ref?.startsWith('column:')) {
    where = `the gradebook column ${item.ref.slice('column:'.length)}${inCourse}`;
  } else if (item.ref?.startsWith('course_field:')) {
    where = `the course record${inCourse}, field “${keyPhrase(
      item.ref.slice('course_field:'.length),
    )}”`;
  } else if (item.ref?.startsWith('map_gap:')) {
    where = `a gap in the course map${inCourse}`;
  } else if (item.ref?.startsWith('staff:')) {
    where = `the staff list${inCourse}`;
  } else if (item.entity === 'bb_file') {
    where = `a Blackboard file${inCourse}`;
  } else if (item.entity === 'reading') {
    where = `reading ${item.ref ?? '—'}${inCourse}`;
  } else if (item.entity === 'course') {
    where = `the course record${inCourse}`;
  } else if (item.entity) {
    where = `${item.entity} ${item.ref ?? ''}`.trim() + inCourse;
  } else {
    where = `the sync${inCourse}`;
  }

  const about = item.field ? `, about its ${fieldPhrase(item.field)}` : '';
  const run = item.raised_by !== null ? `sync run #${item.raised_by}` : 'the transform';
  return `From ${where}${about}. Raised by ${run}.`;
}

/**
 * R3-3: the source as a chip — what the row is about, in two or three words.
 * The full sentence (`sourceText`) stays on the card below.
 */
export function sourceChip(item: AttentionItem): string {
  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    return `assignment ${(item.ref as string).split('/').pop()}`;
  }
  if (item.ref?.startsWith('column:')) return 'gradebook column';
  if (item.ref?.startsWith('course_field:')) return 'course record';
  if (item.ref?.startsWith('map_gap:')) return 'course map';
  if (item.ref?.startsWith('staff:')) return 'staff list';
  if (item.entity === 'bb_file') return 'Blackboard file';
  if (item.entity === 'reading') return 'reading';
  if (item.entity === 'course') return 'course record';
  return item.entity ?? 'sync';
}

/**
 * The thing the question is about, if this app has a page for it. An
 * assignment opens its own popout (`?item=`); anything else that names a
 * course falls back to that course; a pseudo-ref with no course gets no link.
 */
export function sourceHref(item: AttentionItem): string | null {
  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    return itemQuery({ kind: 'assignment', id: item.ref as string });
  }
  if (item.course_id) return `/course/${encodeURIComponent(item.course_id)}`;
  return null;
}

/** What that link should say it opens. */
export function sourceLinkLabel(item: AttentionItem): string {
  if (item.entity === 'assignment' && isAssignmentRef(item.ref)) {
    return 'Open the assignment →';
  }
  return `Open ${item.course_id ? courseCodeFromId(item.course_id) : 'the course'} →`;
}
