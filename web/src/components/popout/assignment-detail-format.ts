/**
 * How the assignment detail writes down a date, a clock and a missing value.
 *
 * Pure, React-free and shared by every surface that shows an assignment: the
 * `?item=` popout, the full-details page under the course, and the planner's
 * small popover. Keeping them here is what stops three surfaces inventing
 * three spellings of the same fact.
 *
 * Unknowns read `NOT_RECORDED` rather than being hidden or filled in — the
 * project's rule that nothing on screen may be a claim the data does not make.
 *
 * WHICH ZONE (PM walk, 2026-09-21). Every reading here is the **term's** zone,
 * never the reader's machine. Blackboard records a deadline as an instant, and
 * an 11:59 PM New York deadline is the *next* UTC day — so a date and a clock
 * read in different zones would name different days for the same fact. One
 * `Intl` reading, one zone, both halves.
 */

import { DOW_LABELS, MONTH_LABELS, parseDateOnly } from '@/components/tracker/anchor';
import { COURSE_TIME_ZONE } from '@/lib/course-dimension';
import { wallClockIn } from '@/lib/planner-zone';

/** What a field says when the sync recorded nothing for it. */
export const NOT_RECORDED = 'not recorded';

/** The clock, in the term's zone. Built once; `Intl` formatters are not cheap. */
const CLOCK_FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: COURSE_TIME_ZONE,
});

/** 'YYYY-MM-DD' → "Wed · Sep 23". The stacked spelling: a fact cell, a series row. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_RECORDED;
  const d = parseDateOnly(iso);
  return `${DOW_LABELS[d.getDay()]} · ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * 'YYYY-MM-DD' → "Wed, Sep 23". The inline spelling, for a one-line due that
 * already separates its date from its time with an interpunct — three of them
 * in a row read as a list rather than as a sentence.
 */
function formatDayInline(iso: string): string {
  const d = parseDateOnly(iso);
  return `${DOW_LABELS[d.getDay()]}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

/** The New York calendar day of an instant, or null when there is no instant. */
function courseDayOf(dueAt: string | null | undefined): string | null {
  if (typeof dueAt !== 'string' || dueAt.trim() === '') return null;
  return wallClockIn(dueAt, COURSE_TIME_ZONE)?.date ?? null;
}

/**
 * The date half of a due line.
 *
 * `due_date` when the sync recorded one; otherwise the New York calendar day of
 * `due_at`. Blackboard hands most deadlines over as an instant alone — 38 of
 * the 44 timed assignments have a null `due_date` — and reading the date off
 * `due_date` by itself printed "not recorded" beside a perfectly good
 * "11:59 PM". `NOT_RECORDED` now means what it says: the row records neither.
 */
export function dueDateText(
  dueDate: string | null | undefined,
  dueAt: string | null | undefined,
): string {
  if (dueDate) return formatDate(dueDate);
  const day = courseDayOf(dueAt);
  return day === null ? NOT_RECORDED : formatDate(day);
}

/** A timestamp's clock part in the term's zone, or '' when there is none. */
export function formatClock(dueAt: string | null | undefined): string {
  if (!dueAt) return '';
  const at = new Date(dueAt);
  if (!Number.isFinite(at.getTime())) return '';
  return CLOCK_FORMAT.format(at);
}

/**
 * The due line as one string: the date, then the clock or the recorded rule.
 * Used where there is room for one line rather than the popout's fact grid.
 */
export function formatDue(
  dueDate: string | null | undefined,
  dueAt: string | null | undefined,
  dueRule: string | null | undefined,
): string {
  const day = dueDate || courseDayOf(dueAt);
  const date = day === null || day === undefined ? NOT_RECORDED : formatDayInline(day);
  const clock = formatClock(dueAt) || (dueRule ?? '');
  return clock === '' ? date : `${date} · ${clock}`;
}
