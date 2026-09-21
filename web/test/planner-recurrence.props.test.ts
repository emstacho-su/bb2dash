/**
 * `planner-recurrence.ts` as properties, over random rules, dates and zones.
 *
 * Examples pin the cases we thought of; these pin the ones we did not. Five
 * things have to hold for every series the form can build:
 *
 *   1. count bounds  — an expansion is 1..52 rows, or a refusal on the end
 *                      date. Never 0 rows, never 53, never a silent truncation.
 *   2. monotonic     — occurrences go forwards, strictly, with no repeats.
 *   3. wall clock    — every occurrence reads the same local time as the first,
 *                      whatever the zone did with its clocks in between. This
 *                      is the one that makes a 09:00 class stay a 09:00 class.
 *   4. DST weeks     — and where a week does cross a clock change, its instant
 *                      is *not* the previous one plus 7×24h. Adding a fixed
 *                      number of milliseconds is exactly the bug this module
 *                      exists to avoid.
 *   5. day-of-month  — monthly never moves the day: a 31st never becomes a
 *                      30th, a 29th of February never becomes the 28th.
 *
 * Times are drawn from 04:00–22:00 so no draw lands in a DST gap or fold hour
 * (the zones below all change their clocks between 01:00 and 03:00 local); the
 * fold and gap rules themselves are covered by example in the unit suite and
 * in `planner-zone.test.ts`.
 *
 * `FC_SEED=<integer>` replays a failing run exactly.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { assertProperty } from './grade-model/fc-params';
import {
  MAX_SERIES_OCCURRENCES,
  SERIES_FREQS,
  expandSeries,
  hasExplicitOffset,
  seriesOccurrenceDates,
  type SeriesFreq,
} from '@/lib/planner-recurrence';
import type { PlannerEventDraft } from '@/lib/planner-events';
import { allDayInstants } from '@/lib/planner-events';
import { localMidnightDateOf, wallClockIn, wallClockToInstant } from '@/lib/planner-zone';
import { isValidIsoDate, shiftIso } from '@/components/tracker/anchor';
import { makePlannerEventDraft } from './factories.plannerEvents';

const pad = (value: number) => String(value).padStart(2, '0');

/** Zones with and without a clock change, including one at a half-hour offset. */
const ZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Australia/Sydney',
  'Asia/Kolkata',
  'Pacific/Honolulu',
  'UTC',
] as const;

/** The subset that moves its clocks, for the DST property. */
const DST_ZONES = ['America/New_York', 'Europe/London', 'Australia/Sydney'] as const;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const zoneArb = fc.constantFrom(...ZONES);
const freqArb = fc.constantFrom(...SERIES_FREQS);

/** A real 'YYYY-MM-DD' in a range the grid can actually show. */
const dateArb = fc
  .tuple(fc.integer({ min: 2024, max: 2030 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
  .map(([year, month, day]) => `${year}-${pad(month)}-${pad(day)}`)
  .filter(isValidIsoDate);

/** 04:00–22:00 on the quarter hour: never a gap or fold hour in these zones. */
const timeArb = fc
  .tuple(fc.integer({ min: 4, max: 22 }), fc.constantFrom(0, 15, 30, 45))
  .map(([hour, minute]) => `${pad(hour)}:${pad(minute)}`);

interface TimedDraw {
  date: string;
  time: string;
  minutes: number;
  zone: string;
}

const timedArb: fc.Arbitrary<TimedDraw> = fc.record({
  date: dateArb,
  time: timeArb,
  minutes: fc.constantFrom(15, 30, 45, 60, 90, 120, 180),
  zone: zoneArb,
});

/** A timed draft whose start is exactly `draw.time` on `draw.date` in its zone. */
function timedDraft(draw: TimedDraw): PlannerEventDraft | null {
  const start = wallClockToInstant(draw.date, draw.time, draw.zone);
  if (!start) return null;
  const end = new Date(Date.parse(start.iso) + draw.minutes * 60_000).toISOString();
  return makePlannerEventDraft({
    all_day: false,
    time_zone: draw.zone,
    starts_at: start.iso,
    ends_at: end,
  });
}

function localDates(rows: readonly PlannerEventDraft[], zone: string): string[] {
  return rows.map((row) => wallClockIn(row.starts_at, zone)?.date ?? '?');
}

function localTimes(rows: readonly PlannerEventDraft[], zone: string): string[] {
  return rows.map((row) => wallClockIn(row.starts_at, zone)?.time ?? '?');
}

/** The zone's UTC offset at a row's start, in minutes. */
function offsetMinutes(row: PlannerEventDraft, zone: string): number {
  const wall = wallClockIn(row.starts_at, zone);
  if (!wall) return Number.NaN;
  const asUtc = Date.parse(`${wall.date}T${wall.time}:00.000Z`);
  return Math.round((asUtc - Date.parse(row.starts_at)) / 60_000);
}

describe('every expansion', () => {
  it('is 1..52 rows or a refusal on the end date', () => {
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 0, max: 800 }), (draw, freq, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return result.error.field === 'until';
        return result.rows.length >= 1 && result.rows.length <= MAX_SERIES_OCCURRENCES;
      }),
    );
  });

  it('starts with the draft itself, on its own date', () => {
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 0, max: 60 }), (draw, freq, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return true;
        return result.rows[0].starts_at === draft.starts_at && result.rows[0].ends_at === draft.ends_at;
      }),
    );
  });

  it('goes strictly forwards, with no date repeated', () => {
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 0, max: 800 }), (draw, freq, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return true;
        const starts = result.rows.map((row) => Date.parse(row.starts_at));
        const dates = localDates(result.rows, draw.zone);
        return (
          starts.every((value, index) => index === 0 || value > starts[index - 1]) &&
          new Set(dates).size === dates.length
        );
      }),
    );
  });

  it('reads the same local time on every occurrence', () => {
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 0, max: 800 }), (draw, freq, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return true;
        return localTimes(result.rows, draw.zone).every((time) => time === draw.time);
      }),
    );
  });

  it('emits instants that carry their own offset, whatever the rule', () => {
    // 083 casts `starts_at` / `ends_at` straight from these strings and
    // refuses any without an offset. Nothing may slip through.
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 0, max: 400 }), (draw, freq, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return true;
        return result.rows.every(
          (row) => hasExplicitOffset(row.starts_at) && hasExplicitOffset(row.ends_at),
        );
      }),
    );
  });

  it('holds the duration steady', () => {
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 0, max: 400 }), (draw, freq, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return true;
        return result.rows.every(
          (row) => Date.parse(row.ends_at) - Date.parse(row.starts_at) === draw.minutes * 60_000,
        );
      }),
    );
  });
});

describe('DST weeks', () => {
  it('keeps the local time and does not simply add seven days of milliseconds', () => {
    assertProperty(
      fc.property(
        fc.record({
          date: dateArb,
          time: timeArb,
          minutes: fc.constantFrom(30, 60, 90),
          zone: fc.constantFrom(...DST_ZONES),
        }),
        // Long enough that most draws cross at least one clock change.
        fc.integer({ min: 24, max: 51 }),
        (draw, weeks) => {
          const draft = timedDraft(draw);
          if (!draft) return true;
          const result = expandSeries(draft, 'weekly', shiftIso(draw.date, weeks * 7), draw.zone);
          if (!result.ok) return true;
          const { rows } = result;
          if (!localTimes(rows, draw.zone).every((time) => time === draw.time)) return false;

          const offsets = new Set(rows.map((row) => offsetMinutes(row, draw.zone)));
          const naive = rows.every(
            (row, index) => Date.parse(row.starts_at) === Date.parse(rows[0].starts_at) + index * WEEK_MS,
          );
          // A span with one offset throughout *is* a fixed +7d; more than one
          // offset means at least one week is not.
          return offsets.size > 1 ? !naive : naive;
        },
      ),
    );
  });
});

describe('monthly', () => {
  const monthlyArb = fc.record({
    date: dateArb,
    time: timeArb,
    minutes: fc.constantFrom(30, 60),
    zone: zoneArb,
  });

  it('never moves the day of the month — no 31st becomes a 30th, no 29 February becomes the 28th', () => {
    assertProperty(
      fc.property(monthlyArb, fc.integer({ min: 0, max: 1200 }), (draw, span) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, 'monthly', shiftIso(draw.date, span), draw.zone);
        if (!result.ok) return true;
        const day = draw.date.slice(8);
        return localDates(result.rows, draw.zone).every((date) => date.slice(8) === day);
      }),
    );
  });

  it('skips the months without that day rather than stopping at the first one', () => {
    assertProperty(
      fc.property(
        fc
          .tuple(fc.integer({ min: 2024, max: 2029 }), fc.integer({ min: 29, max: 31 }))
          .map(([year, day]) => `${year}-01-${pad(day)}`)
          .filter(isValidIsoDate),
        (first) => {
          const dates = seriesOccurrenceDates(first, 'monthly', `${first.slice(0, 4)}-12-31`);
          if (!dates.ok) return false;
          // January is always there; February never is for a 29th–31st of a
          // common year, yet later months still are.
          return dates.dates[0] === first && dates.dates.length > 1;
        },
      ),
    );
  });
});

describe('all-day occurrences', () => {
  it('start and end on local midnight, keeping the span in whole local days', () => {
    assertProperty(
      fc.property(
        dateArb,
        fc.integer({ min: 0, max: 5 }),
        zoneArb,
        freqArb,
        fc.integer({ min: 0, max: 300 }),
        (date, spanDays, zone, freq, untilSpan) => {
          const range = allDayInstants(date, shiftIso(date, spanDays), zone);
          if (!range) return true;
          const draft = makePlannerEventDraft({ all_day: true, time_zone: zone, ...range });
          const result = expandSeries(draft, freq, shiftIso(date, untilSpan), zone);
          if (!result.ok) return true;
          return result.rows.every((row) => {
            const first = localMidnightDateOf(row.starts_at, zone);
            const past = localMidnightDateOf(row.ends_at, zone);
            return first !== null && past !== null && past === shiftIso(first, spanDays + 1);
          });
        },
      ),
    );
  });
});

describe('the cap is exact', () => {
  it('takes the 52nd occurrence and refuses the 53rd', () => {
    assertProperty(
      fc.property(dateArb, fc.constantFrom<SeriesFreq>('daily', 'weekly'), (first, freq) => {
        const step = freq === 'daily' ? 1 : 7;
        const last = shiftIso(first, step * (MAX_SERIES_OCCURRENCES - 1));
        const full = seriesOccurrenceDates(first, freq, last);
        const over = seriesOccurrenceDates(first, freq, shiftIso(last, step));
        return (
          full.ok &&
          full.dates.length === MAX_SERIES_OCCURRENCES &&
          !over.ok &&
          over.error.field === 'until'
        );
      }),
    );
  });
});

describe('the shape of a refusal', () => {
  it('always names a field the form has', () => {
    assertProperty(
      fc.property(timedArb, freqArb, dateArb, (draw, freq, until) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, until, draw.zone);
        if (result.ok) return true;
        return (
          ['freq', 'until', 'start'].includes(result.error.field) && result.error.message.length > 0
        );
      }),
    );
  });

  it('refuses every end date before the first occurrence', () => {
    assertProperty(
      fc.property(timedArb, freqArb, fc.integer({ min: 1, max: 400 }), (draw, freq, back) => {
        const draft = timedDraft(draw);
        if (!draft) return true;
        const result = expandSeries(draft, freq, shiftIso(draw.date, -back), draw.zone);
        return !result.ok && result.error.field === 'until';
      }),
    );
  });
});

/** A guard on the fixtures themselves: the draws really are gap-free. */
describe('the draws', () => {
  it('never land on a wall clock that does not exist', () => {
    assertProperty(
      fc.property(dateArb, timeArb, zoneArb, (date, time, zone) => {
        const resolved = wallClockToInstant(date, time, zone);
        return resolved !== null && resolved.resolution === 'exact';
      }),
    );
  });
});

/** Catches an accidental widening of the frozen vocabulary. */
it('offers exactly three frequencies', () => {
  expect(SERIES_FREQS).toHaveLength(3);
});
