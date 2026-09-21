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
 */

import { DOW_LABELS, MONTH_LABELS, parseDateOnly } from '@/components/tracker/anchor';

/** What a field says when the sync recorded nothing for it. */
export const NOT_RECORDED = 'not recorded';

/** 'YYYY-MM-DD' → "Wed · Sep 23". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return NOT_RECORDED;
  const d = parseDateOnly(iso);
  return `${DOW_LABELS[d.getDay()]} · ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}

/** A timestamp's clock part, or '' when there is none. */
export function formatClock(dueAt: string | null | undefined): string {
  if (!dueAt) return '';
  const at = new Date(dueAt);
  if (!Number.isFinite(at.getTime())) return '';
  return at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
  const date = formatDate(dueDate);
  const clock = formatClock(dueAt) || (dueRule ?? '');
  return clock === '' ? date : `${date} · ${clock}`;
}
