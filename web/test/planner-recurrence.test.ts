/**
 * Recurring planner events, expanded in the web (T-1, tail contract).
 *
 * SQL never converts a planner wall clock, so the rows a series writes are
 * finished here: one ordinary `planner_events` row per occurrence, each
 * resolved through `planner-zone.ts` with Temporal's `compatible` rule.
 *
 * What these examples pin down:
 *   * the wall clock is what repeats — an occurrence on the far side of a DST
 *     change is still 09:00 locally, and its instant moves by the hour;
 *   * weekly means the same weekday, monthly the same day-of-month, and a
 *     month without that day is skipped rather than clamped;
 *   * an all-day occurrence keeps K-3's local-midnight exclusive end;
 *   * the end date is mandatory and more than 52 occurrences is a refusal, not
 *     a truncation — a truncated series would silently drop dates off Stack's
 *     real Google calendar;
 *   * a scoped edit restates the rows it owns **by id**, so the push patches
 *     the Google events instead of deleting and re-inserting them.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_SERIES_OCCURRENCES,
  SERIES_FREQS,
  expandSeries,
  hasExplicitOffset,
  isSeriesFreq,
  restateSeriesRows,
  seriesOccurrenceDates,
} from '@/lib/planner-recurrence';
import { allDayInstants, type PlannerEventDraft } from '@/lib/planner-events';
import { localMidnightDateOf, wallClockIn } from '@/lib/planner-zone';
import { shiftIso } from '@/components/tracker/anchor';
import { makePlannerEvent, makePlannerEventDraft } from './factories.plannerEvents';

const NY = 'America/New_York';

/** The draft the factory makes: 09:00–10:00 New York on Wednesday 2026-09-16. */
function draft(overrides: Partial<PlannerEventDraft> = {}): PlannerEventDraft {
  return makePlannerEventDraft(overrides);
}

function rowsOf(result: ReturnType<typeof expandSeries>): readonly PlannerEventDraft[] {
  if (!result.ok) throw new Error(`expected an expansion, got: ${result.error.message}`);
  return result.rows;
}

function startDates(result: ReturnType<typeof expandSeries>): string[] {
  return rowsOf(result).map((row) => wallClockIn(row.starts_at, row.time_zone)?.date ?? '?');
}

function startTimes(result: ReturnType<typeof expandSeries>): string[] {
  return rowsOf(result).map((row) => wallClockIn(row.starts_at, row.time_zone)?.time ?? '?');
}

describe('the vocabulary', () => {
  it('caps a series at 52 occurrences, the same number 082 does', () => {
    expect(MAX_SERIES_OCCURRENCES).toBe(52);
  });

  it('offers daily, weekly and monthly and nothing else', () => {
    expect(SERIES_FREQS).toEqual(['daily', 'weekly', 'monthly']);
    expect(isSeriesFreq('weekly')).toBe(true);
    expect(isSeriesFreq('yearly')).toBe(false);
    expect(isSeriesFreq(null)).toBe(false);
  });
});

describe('expandSeries — daily', () => {
  it('writes one row per day from the first occurrence to the end date', () => {
    const result = expandSeries(draft(), 'daily', '2026-09-20', NY);
    expect(startDates(result)).toEqual([
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('keeps every column of the draft but the instants', () => {
    const source = draft({ title: 'Studio', notes: 'bring the laptop', course_id: 'IST.323' });
    const rows = rowsOf(expandSeries(source, 'daily', '2026-09-18', NY));
    for (const row of rows) {
      expect(row.title).toBe('Studio');
      expect(row.notes).toBe('bring the laptop');
      expect(row.course_id).toBe('IST.323');
      expect(row.kind).toBe(source.kind);
      expect(row.time_zone).toBe(NY);
    }
  });

  it('holds the duration steady', () => {
    const rows = rowsOf(expandSeries(draft(), 'daily', '2026-09-19', NY));
    for (const row of rows) {
      expect(Date.parse(row.ends_at) - Date.parse(row.starts_at)).toBe(60 * 60 * 1000);
    }
  });
});

describe('expandSeries — weekly', () => {
  it('repeats on the same weekday', () => {
    const result = expandSeries(draft(), 'weekly', '2026-10-07', NY);
    expect(startDates(result)).toEqual(['2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07']);
  });

  it('keeps the wall clock across the November fall-back, moving the instant', () => {
    // 2026-10-28 09:00 is EDT (13:00Z); 2026-11-04 09:00 is EST (14:00Z).
    const start = draft({
      starts_at: '2026-10-28T13:00:00.000Z',
      ends_at: '2026-10-28T14:00:00.000Z',
    });
    const result = expandSeries(start, 'weekly', '2026-11-11', NY);
    expect(startTimes(result)).toEqual(['09:00', '09:00', '09:00']);
    expect(rowsOf(result).map((row) => row.starts_at)).toEqual([
      '2026-10-28T13:00:00.000Z',
      '2026-11-04T14:00:00.000Z',
      '2026-11-11T14:00:00.000Z',
    ]);
  });

  it('keeps the wall clock across the March spring-forward', () => {
    // 2026-03-04 09:00 is EST (14:00Z); 2026-03-11 09:00 is EDT (13:00Z).
    const start = draft({
      starts_at: '2026-03-04T14:00:00.000Z',
      ends_at: '2026-03-04T15:00:00.000Z',
    });
    const result = expandSeries(start, 'weekly', '2026-03-18', NY);
    expect(startTimes(result)).toEqual(['09:00', '09:00', '09:00']);
    expect(rowsOf(result).map((row) => row.starts_at)).toEqual([
      '2026-03-04T14:00:00.000Z',
      '2026-03-11T13:00:00.000Z',
      '2026-03-18T13:00:00.000Z',
    ]);
  });
});

describe('expandSeries — monthly', () => {
  it('repeats on the same day of the month', () => {
    const start = draft({
      starts_at: '2026-09-16T13:00:00.000Z',
      ends_at: '2026-09-16T14:00:00.000Z',
    });
    const result = expandSeries(start, 'monthly', '2026-12-16', NY);
    expect(startDates(result)).toEqual([
      '2026-09-16',
      '2026-10-16',
      '2026-11-16',
      '2026-12-16',
    ]);
  });

  it('skips a month that has no 31st rather than clamping it to the 30th', () => {
    const start = draft({
      starts_at: '2026-01-31T14:00:00.000Z',
      ends_at: '2026-01-31T15:00:00.000Z',
    });
    const result = expandSeries(start, 'monthly', '2026-12-31', NY);
    expect(startDates(result)).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ]);
  });

  it('skips a month that has no 30th', () => {
    const start = draft({
      starts_at: '2026-01-30T14:00:00.000Z',
      ends_at: '2026-01-30T15:00:00.000Z',
    });
    expect(startDates(expandSeries(start, 'monthly', '2026-04-30', NY))).toEqual([
      '2026-01-30',
      '2026-03-30',
      '2026-04-30',
    ]);
  });

  it('skips a non-leap February for a 29th', () => {
    // 2028 is a leap year; 2029 is not, so February 2029 has no 29th.
    const start = draft({
      starts_at: '2028-02-29T14:00:00.000Z',
      ends_at: '2028-02-29T15:00:00.000Z',
    });
    const dates = startDates(expandSeries(start, 'monthly', '2029-03-29', NY));
    expect(dates).toContain('2028-02-29');
    expect(dates).toContain('2029-01-29');
    expect(dates).toContain('2029-03-29');
    expect(dates.some((date) => date.startsWith('2029-02'))).toBe(false);
  });
});

describe('expandSeries — all-day occurrences', () => {
  const allDay = (firstDay: string, lastDay: string): PlannerEventDraft => {
    const range = allDayInstants(firstDay, lastDay, NY);
    if (!range) throw new Error('bad all-day fixture');
    return draft({ all_day: true, starts_at: range.starts_at, ends_at: range.ends_at });
  };

  it('keeps local midnight and the exclusive end on every occurrence', () => {
    const rows = rowsOf(expandSeries(allDay('2026-09-16', '2026-09-16'), 'weekly', '2026-09-30', NY));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => localMidnightDateOf(row.starts_at, NY))).toEqual([
      '2026-09-16',
      '2026-09-23',
      '2026-09-30',
    ]);
    expect(rows.map((row) => localMidnightDateOf(row.ends_at, NY))).toEqual([
      '2026-09-17',
      '2026-09-24',
      '2026-10-01',
    ]);
  });

  it('keeps a multi-day span the same length in days', () => {
    const rows = rowsOf(expandSeries(allDay('2026-09-16', '2026-09-18'), 'weekly', '2026-09-23', NY));
    expect(rows.map((row) => localMidnightDateOf(row.ends_at, NY))).toEqual([
      '2026-09-19',
      '2026-09-26',
    ]);
  });
});

describe('expandSeries — refusals', () => {
  it('needs an end date', () => {
    const result = expandSeries(draft(), 'weekly', '', NY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('until');
  });

  it('refuses an end date before the first occurrence', () => {
    const result = expandSeries(draft(), 'weekly', '2026-09-15', NY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('until');
  });

  it('accepts exactly 52 occurrences', () => {
    const until = shiftIso('2026-09-16', MAX_SERIES_OCCURRENCES - 1);
    expect(rowsOf(expandSeries(draft(), 'daily', until, NY))).toHaveLength(MAX_SERIES_OCCURRENCES);
  });

  it('refuses the 53rd rather than truncating to 52', () => {
    const until = shiftIso('2026-09-16', MAX_SERIES_OCCURRENCES);
    const result = expandSeries(draft(), 'daily', until, NY);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.field).toBe('until');
      expect(result.error.message).toContain(String(MAX_SERIES_OCCURRENCES));
    }
  });

  it('refuses an unknown frequency', () => {
    const result = expandSeries(draft(), 'yearly' as never, '2026-09-20', NY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('freq');
  });

  it('refuses a draft whose start cannot be read in the zone', () => {
    const result = expandSeries(draft({ starts_at: 'not a time' }), 'daily', '2026-09-20', NY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('start');
  });
});

describe('the instants a series emits', () => {
  it('always carry an explicit offset, which is what 083 casts from', () => {
    // 083 refuses an offsetless string: it is the one Postgres would have to
    // read in a zone, and the whole point is that it never does.
    const timed = rowsOf(expandSeries(draft(), 'daily', '2026-11-05', NY));
    const range = allDayInstants('2026-09-16', '2026-09-17', NY);
    if (!range) throw new Error('bad all-day fixture');
    const allDay = rowsOf(
      expandSeries(draft({ all_day: true, ...range }), 'monthly', '2027-03-16', NY),
    );

    for (const row of [...timed, ...allDay]) {
      expect(hasExplicitOffset(row.starts_at)).toBe(true);
      expect(hasExplicitOffset(row.ends_at)).toBe(true);
    }
  });

  it('carry one on a restated scope too', () => {
    const rows = [
      makePlannerEvent({ id: 'a', starts_at: '2026-09-16T13:00:00.000Z', ends_at: '2026-09-16T14:00:00.000Z' }),
      makePlannerEvent({ id: 'b', starts_at: '2026-09-23T13:00:00.000Z', ends_at: '2026-09-23T14:00:00.000Z' }),
    ];
    const result = restateSeriesRows(rows, rows[0], draft(), NY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const row of result.rows) {
      expect(hasExplicitOffset(row.starts_at)).toBe(true);
      expect(hasExplicitOffset(row.ends_at)).toBe(true);
    }
  });

  it('refuses a wall clock with no offset as an instant', () => {
    expect(hasExplicitOffset('2026-09-16T09:00:00')).toBe(false);
    expect(hasExplicitOffset('2026-09-16 09:00:00+00:00')).toBe(true);
    expect(hasExplicitOffset('2026-09-16T09:00:00-0400')).toBe(true);
    expect(hasExplicitOffset(null)).toBe(false);
  });
});

describe('seriesOccurrenceDates', () => {
  it('counts without building rows, for the form’s live line', () => {
    const result = seriesOccurrenceDates('2026-09-16', 'weekly', '2026-10-07');
    expect(result.ok && result.dates).toEqual([
      '2026-09-16',
      '2026-09-23',
      '2026-09-30',
      '2026-10-07',
    ]);
  });

  it('refuses over the cap with the same error the expansion gives', () => {
    const until = shiftIso('2026-09-16', MAX_SERIES_OCCURRENCES);
    expect(seriesOccurrenceDates('2026-09-16', 'daily', until).ok).toBe(false);
  });
});

describe('restateSeriesRows — a scoped edit keeps the row ids', () => {
  const wednesdays = [
    makePlannerEvent({ id: 'a', starts_at: '2026-09-16T13:00:00.000Z', ends_at: '2026-09-16T14:00:00.000Z' }),
    makePlannerEvent({ id: 'b', starts_at: '2026-09-23T13:00:00.000Z', ends_at: '2026-09-23T14:00:00.000Z' }),
    makePlannerEvent({ id: 'c', starts_at: '2026-09-30T13:00:00.000Z', ends_at: '2026-09-30T14:00:00.000Z' }),
  ];

  it('moves the time on every row and never a row id', () => {
    const edited = wednesdays[0];
    const moved = draft({
      title: 'Studio (moved)',
      starts_at: '2026-09-16T15:00:00.000Z', // 11:00 New York
      ends_at: '2026-09-16T16:30:00.000Z',
    });
    const result = restateSeriesRows(wednesdays, edited, moved, NY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(result.rows.map((row) => wallClockIn(row.starts_at, NY)?.time)).toEqual([
      '11:00',
      '11:00',
      '11:00',
    ]);
    expect(result.rows.map((row) => wallClockIn(row.starts_at, NY)?.date)).toEqual([
      '2026-09-16',
      '2026-09-23',
      '2026-09-30',
    ]);
    for (const row of result.rows) {
      expect(row.title).toBe('Studio (moved)');
      expect(Date.parse(row.ends_at) - Date.parse(row.starts_at)).toBe(90 * 60 * 1000);
    }
  });

  it('carries the whole scope by the same number of days when the edited day moves', () => {
    const edited = wednesdays[1];
    const moved = draft({
      starts_at: '2026-09-24T13:00:00.000Z', // Thursday, same clock
      ends_at: '2026-09-24T14:00:00.000Z',
    });
    const result = restateSeriesRows(wednesdays, edited, moved, NY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => wallClockIn(row.starts_at, NY)?.date)).toEqual([
      '2026-09-17',
      '2026-09-24',
      '2026-10-01',
    ]);
  });

  it('re-resolves every row when the zone changes, keeping the wall clock', () => {
    const LA = 'America/Los_Angeles';
    const edited = wednesdays[0];
    const rezoned = draft({
      time_zone: LA,
      starts_at: '2026-09-16T16:00:00.000Z', // 09:00 Los Angeles
      ends_at: '2026-09-16T17:00:00.000Z',
    });
    const result = restateSeriesRows(wednesdays, edited, rezoned, LA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((row) => row.time_zone)).toEqual([LA, LA, LA]);
    expect(result.rows.map((row) => wallClockIn(row.starts_at, LA)?.time)).toEqual([
      '09:00',
      '09:00',
      '09:00',
    ]);
  });

  it('restates nothing when the scope is empty', () => {
    const result = restateSeriesRows([], wednesdays[0], draft(), NY);
    expect(result.ok && result.rows).toEqual([]);
  });
});
