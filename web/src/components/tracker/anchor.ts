/**
 * Pure date arithmetic for the Upcoming-work tracker (R-03).
 *
 * No React, no data access. Every function takes 'YYYY-MM-DD' strings (or a
 * Date) and returns new values — nothing here mutates its argument — so the
 * paging maths (56-day horizon, 14 visible days, Monday rule, month label on
 * the 1st) is unit-testable without rendering anything.
 *
 * All dates are LOCAL calendar dates. `v_work_items.due_on` is a Postgres
 * `date` and supabase-js hands it back as a bare 'YYYY-MM-DD' with no zone, so
 * comparing local calendar days is the only reading that never shifts a day.
 * ISO dates also sort lexicographically, which is why the clamps below compare
 * the strings directly instead of round-tripping through Date.
 */

export const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** The tracker horizon: how many days forward the caller fetches and pages over. */
export const DEFAULT_HORIZON_DAYS = 56;
/** How many day columns are on screen at once. */
export const DEFAULT_VISIBLE_DAYS = 14;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ---------------------------------------------------------------------------
 * Date <-> ISO
 * ------------------------------------------------------------------------ */

/** Local-time 'YYYY-MM-DD' — the form Postgres `date` columns come back in. */
export function isoDate(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Parse a well-formed 'YYYY-MM-DD' into a local Date (no timezone shift). */
export function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** A new Date `n` days from `d` (n may be negative). Never mutates `d`. */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Local midnight today, as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  return isoDate(now);
}

/**
 * Is this a real calendar date in 'YYYY-MM-DD' form? Rejects both malformed
 * strings and impossible days ('2026-02-31'), which JS would otherwise roll
 * forward silently. Anchors arrive from props and eventually from the URL, so
 * they are untrusted input and get validated at this boundary.
 */
export function isValidIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false;
  const parsed = parseDateOnly(value);
  return Number.isFinite(parsed.getTime()) && isoDate(parsed) === value;
}

/** `iso` shifted by `days`, as an ISO date. */
export function shiftIso(iso: string, days: number): string {
  return isoDate(addDays(parseDateOnly(iso), days));
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseDateOnly(fromIso).getTime();
  const to = parseDateOnly(toIso).getTime();
  return Math.round((to - from) / 86_400_000);
}

/* ---------------------------------------------------------------------------
 * Anchor arithmetic
 * ------------------------------------------------------------------------ */

export interface WindowSpec {
  /** First visible day, 'YYYY-MM-DD'. Invalid or out-of-range values are clamped. */
  anchor?: string | null;
  /** Today, 'YYYY-MM-DD'. Injected rather than read from the clock so this is testable. */
  today: string;
  horizonDays: number;
  visibleDays: number;
}

/** Columns actually drawn: `visibleDays`, but never more than the horizon holds. */
export function columnCount(horizonDays: number, visibleDays: number): number {
  return Math.max(1, Math.min(Math.floor(visibleDays), Math.floor(horizonDays)));
}

/** Last day of the horizon (inclusive): today + horizonDays − 1. */
export function horizonLastDay(today: string, horizonDays: number): string {
  return shiftIso(today, Math.max(1, Math.floor(horizonDays)) - 1);
}

/**
 * The furthest anchor that still leaves a full window inside the horizon.
 * 56/14 gives four pages: today, +14, +28, +42.
 */
export function maxAnchor(today: string, horizonDays: number, visibleDays: number): string {
  const span = Math.max(0, Math.floor(horizonDays) - columnCount(horizonDays, visibleDays));
  return shiftIso(today, span);
}

/**
 * Bring an anchor into range: never before today, never past `maxAnchor`.
 * A missing or malformed anchor falls back to today rather than throwing —
 * a bad value should not take the screen down.
 */
export function clampAnchor(spec: WindowSpec): string {
  const { anchor, today, horizonDays, visibleDays } = spec;
  if (!isValidIsoDate(anchor)) return today;
  const latest = maxAnchor(today, horizonDays, visibleDays);
  if (anchor < today) return today;
  if (anchor > latest) return latest;
  return anchor;
}

/**
 * Move `pages` whole windows (−1 = ◂, +1 = ▸) and clamp. Paging off either end
 * settles on that end, so the buttons are never a no-op that looks like a bug —
 * `canPageBack` / `canPageForward` disable them instead.
 */
export function pageAnchor(spec: WindowSpec, pages: number): string {
  const from = clampAnchor(spec);
  const step = columnCount(spec.horizonDays, spec.visibleDays) * Math.trunc(pages);
  return clampAnchor({ ...spec, anchor: shiftIso(from, step) });
}

/* ---------------------------------------------------------------------------
 * The window the component renders
 * ------------------------------------------------------------------------ */

export interface TrackerDay {
  /** 0-based column position inside the visible window. */
  index: number;
  iso: string;
  date: Date;
  dayOfMonth: number;
  /** 'Today' on today's column, otherwise 'Mon' … 'Sun'. */
  dowLabel: string;
  isToday: boolean;
  /** Monday carries the week rule. */
  isMonday: boolean;
  isWeekend: boolean;
  /** 'Sep' on the 1st of a month and on the first column; '' everywhere else. */
  monthLabel: string;
}

export interface TrackerWindow {
  /** The clamped anchor actually used. */
  anchor: string;
  days: TrackerDay[];
  firstIso: string;
  lastIso: string;
  canPageBack: boolean;
  canPageForward: boolean;
  /** Last day of the whole horizon, for the "of 56 days" style hints. */
  horizonLastIso: string;
  /** True when the window starts today — the default, unpaged view. */
  isAtStart: boolean;
}

/** Build the visible window: the clamped anchor plus one descriptor per column. */
export function buildTrackerWindow(spec: WindowSpec): TrackerWindow {
  const anchor = clampAnchor(spec);
  const count = columnCount(spec.horizonDays, spec.visibleDays);
  const start = parseDateOnly(anchor);

  const days: TrackerDay[] = Array.from({ length: count }, (_, index) => {
    const date = addDays(start, index);
    const iso = isoDate(date);
    const dow = date.getDay();
    const showMonth = date.getDate() === 1 || index === 0;
    return {
      index,
      iso,
      date,
      dayOfMonth: date.getDate(),
      dowLabel: iso === spec.today ? 'Today' : DOW_LABELS[dow],
      isToday: iso === spec.today,
      isMonday: dow === 1,
      isWeekend: dow === 0 || dow === 6,
      monthLabel: showMonth ? MONTH_LABELS[date.getMonth()] : '',
    };
  });

  const latest = maxAnchor(spec.today, spec.horizonDays, spec.visibleDays);
  return {
    anchor,
    days,
    firstIso: days[0].iso,
    lastIso: days[days.length - 1].iso,
    canPageBack: anchor > spec.today,
    canPageForward: anchor < latest,
    horizonLastIso: horizonLastDay(spec.today, spec.horizonDays),
    isAtStart: anchor === spec.today,
  };
}

/** "Sep 10 – Sep 23". Both ends carry the month, as the artboard has it. */
export function formatDayRange(fromIso: string, toIso: string): string {
  const from = parseDateOnly(fromIso);
  const to = parseDateOnly(toIso);
  return `${MONTH_LABELS[from.getMonth()]} ${from.getDate()} – ${MONTH_LABELS[to.getMonth()]} ${to.getDate()}`;
}

/** "Sep 24" — the short form used in the paged sub-line. */
export function formatDay(iso: string): string {
  const d = parseDateOnly(iso);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
}
