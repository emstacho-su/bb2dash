/**
 * New York wall-clock helpers for the daily "due tomorrow" check (C-7 rule 3).
 *
 * Two deliberate rules:
 *  - The *zone* comes from `Intl.DateTimeFormat` with `timeZone: 'America/New_York'`, which
 *    is the only DST-correct source available without a dependency.
 *  - The *arithmetic* is plain integer work on `YYYY-MM-DD` strings through `Date.UTC`, so
 *    "tomorrow" never depends on the host's zone and is testable with an injected `now`.
 *
 * Nothing here reads a clock of its own: every function takes the `Date` it works from.
 */

/** `YYYY-MM-DD` in New York, plus the wall-clock hour and minute at the same instant. */
export interface NyWallClock {
  readonly date: string;
  readonly hour: number;
  readonly minute: number;
}

const NY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // h23 rather than hour12:false: some ICU builds render midnight as "24" under the latter.
  hourCycle: 'h23',
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Thrown for a `dueReminderTime` that is not `HH:MM` — a config fault, named explicitly. */
export class InvalidReminderTimeError extends Error {
  constructor(value: string) {
    super(`dueReminderTime must be HH:MM (00:00-23:59), got ${JSON.stringify(value)}`);
    this.name = 'InvalidReminderTimeError';
  }
}

/** The New York wall clock at the instant `at`. Throws on an invalid `Date`. */
export function nyWallClock(at: Date): NyWallClock {
  if (Number.isNaN(at.getTime())) throw new RangeError('nyWallClock: invalid Date');
  const parts = NY_FORMAT.formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const found = parts.find((part) => part.type === type);
    if (!found) throw new RangeError(`nyWallClock: Intl gave no ${type} part`);
    return found.value;
  };
  return {
    date: `${read('year')}-${read('month')}-${read('day')}`,
    hour: Number(read('hour')),
    minute: Number(read('minute')),
  };
}

/** `YYYY-MM-DD` in New York at the instant `at`. */
export function nyDate(at: Date): string {
  return nyWallClock(at).date;
}

/**
 * `date` shifted by `days`, as `YYYY-MM-DD`. UTC arithmetic on a date-only value: no zone,
 * no DST, no host clock. Throws on a malformed input rather than silently returning `NaN`.
 */
export function addDays(date: string, days: number): string {
  if (!ISO_DATE.test(date)) throw new RangeError(`addDays: expected YYYY-MM-DD, got ${JSON.stringify(date)}`);
  if (!Number.isInteger(days)) throw new RangeError('addDays: days must be an integer');
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  if (Number.isNaN(shifted.getTime())) throw new RangeError(`addDays: ${date} is not a real date`);
  return shifted.toISOString().slice(0, 10);
}

/** The New York calendar date after the one at `at` — C-7 rule 3's "tomorrow". */
export function nyTomorrow(at: Date): string {
  return addDays(nyDate(at), 1);
}

/** `HH:MM` as minutes past New York midnight. */
export function reminderMinutes(dueReminderTime: string): number {
  const match = HH_MM.exec(dueReminderTime);
  if (!match) throw new InvalidReminderTimeError(dueReminderTime);
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface DueCheckClock {
  readonly now: Date;
  readonly dueReminderTime: string;
  readonly dueCheckedOn: string | null;
}

/**
 * C-7 rule 3's trigger: the first tick at or after `dueReminderTime` New York on a date that
 * is not `dueCheckedOn`. The scheduler calls this to decide whether to issue R3 at all; the
 * reducer never re-decides, it is told through `ReduceInput.due`.
 */
export function shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn }: DueCheckClock): boolean {
  const wall = nyWallClock(now);
  if (wall.date === dueCheckedOn) return false;
  return wall.hour * 60 + wall.minute >= reminderMinutes(dueReminderTime);
}
