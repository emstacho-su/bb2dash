/**
 * bb2dash — recurring planner events, expanded in the web (T-1, Phase 12b tail).
 *
 * Pure: no React, no Supabase, no new dependency. The web owns the expansion
 * because SQL must never convert a planner wall clock — Postgres resolves a
 * DST fall-back the opposite way from Temporal's `compatible` rule, which
 * `planner-zone.ts` follows. Every occurrence therefore arrives at the database
 * as a finished `planner_events` row, and `v_calendar_push_items` and
 * `calendar-push` carry on untouched.
 *
 * THE WALL CLOCK IS WHAT REPEATS. A 09:00 class stays 09:00 on both sides of a
 * clock change; its instant moves by the hour instead. Each occurrence is
 * resolved on its own date through `wallClockToInstant`, never by adding a
 * fixed number of milliseconds to the one before it.
 *
 * THE RULES (frozen by the tail contract):
 *   * `daily`   — every day;
 *   * `weekly`  — the same weekday;
 *   * `monthly` — the same day of the month; a month without that day (a 31st
 *     in April, a 29th in a common February) is **skipped**, never clamped
 *     back to the month's last day;
 *   * the end date is mandatory, and it is the last local date an occurrence
 *     may start on;
 *   * more than `MAX_SERIES_OCCURRENCES` occurrences is a refusal, not a
 *     truncation. A truncated series would silently drop dates off Stack's
 *     real Google calendar, which is worse than making him pick a nearer date.
 *
 * SCOPED EDITS. `restateSeriesRows` recomputes the in-scope rows' instants
 * **by row id**: the ids survive the edit, so the push sends Google a patch per
 * event rather than a delete and an insert.
 */

import { daysBetween, isValidIsoDate, shiftIso } from '@/components/tracker/anchor';
import {
  allDayDates,
  allDayInstants,
  type PlannerEventDraft,
  type PlannerEventRow,
} from './planner-events';
import { isValidTimeZone, wallClockIn, wallClockToInstant } from './planner-zone';

/* ---------------------------------------------------------------------------
 * Vocabulary
 * ------------------------------------------------------------------------ */

/** The trigger on `planner_event_series` (082) refuses a 53rd row. */
export const MAX_SERIES_OCCURRENCES = 52;

/** `planner_event_series.freq`, in the order the form offers them. */
export const SERIES_FREQS = ['daily', 'weekly', 'monthly'] as const;

export type SeriesFreq = (typeof SERIES_FREQS)[number];

export const SERIES_FREQ_LABELS: Record<SeriesFreq, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export function isSeriesFreq(value: unknown): value is SeriesFreq {
  return typeof value === 'string' && (SERIES_FREQS as readonly string[]).includes(value);
}

/** What the scope question asks. `this` needs no RPC: it detaches, or deletes. */
export const SERIES_SCOPES = ['this', 'following', 'all'] as const;

export type SeriesScope = (typeof SERIES_SCOPES)[number];

/** The two scopes 083's RPCs take. */
export type SeriesWriteScope = Exclude<SeriesScope, 'this'>;

/**
 * 083 casts `starts_at` and `ends_at` straight from the strings the client
 * sent and refuses any that do not carry their own offset, because that is
 * exactly the string Postgres would otherwise have to read in a zone. Every
 * instant this module produces comes from `Date.prototype.toISOString`, so it
 * ends in `Z`; the query layer checks the rule anyway at the boundary.
 */
const ISO_INSTANT_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

export function hasExplicitOffset(instant: unknown): instant is string {
  return typeof instant === 'string' && ISO_INSTANT_WITH_OFFSET.test(instant);
}

/* ---------------------------------------------------------------------------
 * Results
 * ------------------------------------------------------------------------ */

/** Which form field a refusal belongs under. */
export type SeriesErrorField = 'freq' | 'until' | 'start';

export interface SeriesError {
  field: SeriesErrorField;
  message: string;
}

interface Failure {
  ok: false;
  error: SeriesError;
}

export type SeriesExpansion = { ok: true; rows: readonly PlannerEventDraft[] } | Failure;

export type SeriesDates = { ok: true; dates: readonly string[] } | Failure;

/** One in-scope row, restated: the same id, new instants and columns. */
export interface SeriesRowPatch extends PlannerEventDraft {
  id: string;
}

export type SeriesRestatement = { ok: true; rows: readonly SeriesRowPatch[] } | Failure;

const MESSAGES = {
  freq: 'Choose how often it repeats.',
  until: 'Choose the date the repeat ends on.',
  untilBeforeStart: 'The repeat has to end on or after the first occurrence.',
  overCap: `A repeating event is limited to ${MAX_SERIES_OCCURRENCES} occurrences — choose an earlier end date.`,
  start: 'Check the start date, time and time zone before repeating it.',
} as const;

function fail(field: SeriesErrorField, message: string): Failure {
  return { ok: false, error: { field, message } };
}

/* ---------------------------------------------------------------------------
 * The shape one occurrence repeats
 * ------------------------------------------------------------------------ */

/** What a planner event needs to be readable as a wall clock. */
type TimeShaped = Pick<PlannerEventRow, 'starts_at' | 'ends_at' | 'all_day'>;

/**
 * The wall clocks an occurrence repeats: its local start date, the start and
 * end times, and how many whole local days sit between the start date and the
 * end date (0 for an event inside one day, ≥ 1 for one that runs over).
 */
interface SeriesShape {
  allDay: boolean;
  firstDate: string;
  startTime: string;
  endTime: string;
  spanDays: number;
}

const MIDNIGHT = '00:00';

function shapeOf(source: TimeShaped, zone: string): SeriesShape | null {
  if (!isValidTimeZone(zone)) return null;
  if (source.all_day) {
    const dates = allDayDates({ ...source, time_zone: zone });
    if (!dates) return null;
    return {
      allDay: true,
      firstDate: dates.firstDay,
      startTime: MIDNIGHT,
      endTime: MIDNIGHT,
      spanDays: daysBetween(dates.firstDay, dates.lastDay),
    };
  }
  const start = wallClockIn(source.starts_at, zone);
  const end = wallClockIn(source.ends_at, zone);
  if (!start || !end) return null;
  return {
    allDay: false,
    firstDate: start.date,
    startTime: start.time,
    endTime: end.time,
    spanDays: daysBetween(start.date, end.date),
  };
}

interface Instants {
  starts_at: string;
  ends_at: string;
}

/** `shape`'s wall clocks, moved onto `date` and resolved in `zone`. */
function instantsOn(shape: SeriesShape, date: string, zone: string): Instants | null {
  const lastDate = shiftIso(date, shape.spanDays);
  if (shape.allDay) return allDayInstants(date, lastDate, zone);
  const start = wallClockToInstant(date, shape.startTime, zone);
  const end = wallClockToInstant(lastDate, shape.endTime, zone);
  return start && end ? { starts_at: start.iso, ends_at: end.iso } : null;
}

/* ---------------------------------------------------------------------------
 * The dates a rule names
 * ------------------------------------------------------------------------ */

const DAYS_PER_STEP: Record<'daily' | 'weekly', number> = { daily: 1, weekly: 7 };

/** The last year `isValidIsoDate` and the `YYYY-MM-DD` form can represent. */
const LAST_YEAR = 9999;

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(year, month, 0).getDate();
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/**
 * Every date the rule names, in order, lazily — the caller stops pulling once
 * it is over the cap, so a far-off end date costs nothing.
 */
function* occurrenceDates(firstDate: string, freq: SeriesFreq, until: string): Generator<string> {
  if (freq === 'monthly') {
    yield* monthlyDates(firstDate, until);
    return;
  }
  const step = DAYS_PER_STEP[freq];
  for (let date = firstDate; date <= until; date = shiftIso(date, step)) yield date;
}

/** The same day of the month, month after month; a month without it is skipped. */
function* monthlyDates(firstDate: string, until: string): Generator<string> {
  const [year, month, day] = firstDate.split('-').map(Number);
  for (let step = 0; ; step += 1) {
    const months = month - 1 + step;
    const candidateYear = year + Math.floor(months / 12);
    const candidateMonth = (months % 12) + 1;
    if (candidateYear > LAST_YEAR) return;
    // Day 1 is the earliest date this month can produce; past the end, stop.
    if (`${pad(candidateYear, 4)}-${pad(candidateMonth)}-01` > until) return;
    if (day > daysInMonth(candidateYear, candidateMonth)) continue;
    const date = `${pad(candidateYear, 4)}-${pad(candidateMonth)}-${pad(day)}`;
    if (date > until) return;
    yield date;
  }
}

/**
 * The local dates a rule names, or why it names none. The form's live
 * "N occurrences" line is this, counted — it needs no draft and no zone.
 */
export function seriesOccurrenceDates(
  firstDate: string,
  freq: SeriesFreq,
  until: string,
): SeriesDates {
  if (!isSeriesFreq(freq)) return fail('freq', MESSAGES.freq);
  if (!isValidIsoDate(firstDate)) return fail('start', MESSAGES.start);
  if (!isValidIsoDate(until)) return fail('until', MESSAGES.until);
  if (until < firstDate) return fail('until', MESSAGES.untilBeforeStart);

  const dates: string[] = [];
  for (const date of occurrenceDates(firstDate, freq, until)) {
    dates.push(date);
    if (dates.length > MAX_SERIES_OCCURRENCES) return fail('until', MESSAGES.overCap);
  }
  return { ok: true, dates };
}

/* ---------------------------------------------------------------------------
 * Expansion
 * ------------------------------------------------------------------------ */

/**
 * One validated draft + a rule → the finished rows of a whole series, the
 * first of them the draft itself. `zone` is the zone the wall clocks are read
 * and written in; every row carries it.
 */
export function expandSeries(
  draft: PlannerEventDraft,
  freq: SeriesFreq,
  until: string,
  zone: string,
): SeriesExpansion {
  const shape = shapeOf(draft, zone);
  if (!shape) return fail('start', MESSAGES.start);

  const dates = seriesOccurrenceDates(shape.firstDate, freq, until);
  if (!dates.ok) return dates;

  const rows: PlannerEventDraft[] = [];
  for (const date of dates.dates) {
    const instants = instantsOn(shape, date, zone);
    if (!instants) return fail('start', MESSAGES.start);
    rows.push({ ...draft, time_zone: zone, ...instants });
  }
  return { ok: true, rows };
}

/* ---------------------------------------------------------------------------
 * Scoped edits
 * ------------------------------------------------------------------------ */

/** What a scoped edit needs of a stored row. */
type ScopedRow = Pick<
  PlannerEventRow,
  'id' | 'starts_at' | 'ends_at' | 'all_day' | 'time_zone' | 'done'
>;

/**
 * `done` is Stack's state, one occurrence at a time, so a scoped edit never
 * carries the opened occurrence's tick onto the rest of the series: each row
 * keeps its own. The kind still decides the shape 067 will accept — a task
 * needs a done state and nothing else may have one — so a row that has just
 * become a task starts not done, and a row that has stopped being one loses
 * the flag.
 */
function doneFor(draft: PlannerEventDraft, row: Pick<ScopedRow, 'done'>): boolean | null {
  return draft.kind === 'task' ? (row.done ?? false) : null;
}

/**
 * The in-scope rows restated from `draft`, **by id**.
 *
 * Every non-time column comes from the draft. Each row keeps its own place in
 * the series: its local start date moves by the same number of days the edited
 * occurrence moved, and then takes the draft's wall-clock time, duration and
 * zone. Editing 09:00 → 11:00 on one Wednesday therefore moves every Wednesday
 * to 11:00 *local*, on both sides of a clock change.
 */
export function restateSeriesRows(
  rows: readonly ScopedRow[],
  edited: Pick<PlannerEventRow, 'starts_at' | 'ends_at' | 'all_day' | 'time_zone'>,
  draft: PlannerEventDraft,
  zone: string,
): SeriesRestatement {
  const shape = shapeOf(draft, zone);
  const editedShape = shapeOf(edited, edited.time_zone);
  if (!shape || !editedShape) return fail('start', MESSAGES.start);

  const dayDelta = daysBetween(editedShape.firstDate, shape.firstDate);
  const patched: SeriesRowPatch[] = [];
  for (const row of rows) {
    const rowShape = shapeOf(row, row.time_zone);
    if (!rowShape) return fail('start', MESSAGES.start);
    const instants = instantsOn(shape, shiftIso(rowShape.firstDate, dayDelta), zone);
    if (!instants) return fail('start', MESSAGES.start);
    patched.push({ ...draft, id: row.id, time_zone: zone, done: doneFor(draft, row), ...instants });
  }
  return { ok: true, rows: patched };
}
