/**
 * The New York wall clock and the daily-check trigger (C-7 rule 3).
 *
 * The cases that matter are the ones a UTC-only implementation gets wrong: the evening
 * hours when New York is already on the previous or next calendar day in UTC, and the two
 * DST switch-overs.
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidReminderTimeError,
  addDays,
  nyDate,
  nyTomorrow,
  nyWallClock,
  reminderMinutes,
  shouldRunDueCheck,
} from '../../src/core/poller/ny-time';

describe('nyWallClock', () => {
  it('reads the wall clock in EDT (UTC-4)', () => {
    expect(nyWallClock(new Date('2026-09-16T22:30:00.000Z'))).toEqual({
      date: '2026-09-16',
      hour: 18,
      minute: 30,
    });
  });

  it('reads the wall clock in EST (UTC-5)', () => {
    expect(nyWallClock(new Date('2026-12-16T23:30:00.000Z'))).toEqual({
      date: '2026-12-16',
      hour: 18,
      minute: 30,
    });
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(nyWallClock(new Date('2026-09-17T04:00:00.000Z')).hour).toBe(0);
  });

  it('is still on the previous New York day late in UTC', () => {
    expect(nyDate(new Date('2026-09-17T03:59:00.000Z'))).toBe('2026-09-16');
    expect(nyDate(new Date('2026-09-17T04:00:00.000Z'))).toBe('2026-09-17');
  });

  it('rejects an invalid Date rather than inventing a day', () => {
    expect(() => nyWallClock(new Date('nope'))).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('rolls over a month end', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('rolls over a year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('goes backwards too', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('is unaffected by DST, because the arithmetic is date-only', () => {
    // The US spring-forward Sunday in 2027 is 14 March.
    expect(addDays('2027-03-13', 1)).toBe('2027-03-14');
    expect(addDays('2027-03-14', 1)).toBe('2027-03-15');
    // And the autumn fall-back Sunday, 7 November 2027.
    expect(addDays('2027-11-06', 1)).toBe('2027-11-07');
    expect(addDays('2027-11-07', 1)).toBe('2027-11-08');
  });

  it('rejects a malformed date', () => {
    expect(() => addDays('16-09-2026', 1)).toThrow(RangeError);
    expect(() => addDays('2026-09-16T00:00:00Z', 1)).toThrow(RangeError);
  });

  it('rejects a fractional day count', () => {
    expect(() => addDays('2026-09-16', 1.5)).toThrow(RangeError);
  });
});

describe('nyTomorrow', () => {
  it('is the New York calendar date plus one', () => {
    expect(nyTomorrow(new Date('2026-09-16T22:30:00.000Z'))).toBe('2026-09-17');
  });

  it('does not jump a day when UTC has already rolled over but New York has not', () => {
    expect(nyTomorrow(new Date('2026-09-17T02:00:00.000Z'))).toBe('2026-09-17');
  });
});

describe('reminderMinutes', () => {
  it('parses HH:MM', () => {
    expect(reminderMinutes('18:00')).toBe(18 * 60);
    expect(reminderMinutes('00:00')).toBe(0);
    expect(reminderMinutes('23:59')).toBe(23 * 60 + 59);
  });

  it.each(['24:00', '18:60', '6:00', '1800', '', 'eighteen'])('rejects %j', (value) => {
    expect(() => reminderMinutes(value)).toThrow(InvalidReminderTimeError);
  });
});

describe('shouldRunDueCheck', () => {
  const dueReminderTime = '18:00';

  it('is false before the reminder time', () => {
    // 17:59 New York.
    const now = new Date('2026-09-16T21:59:00.000Z');
    expect(shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn: null })).toBe(false);
  });

  it('is true at the reminder time exactly', () => {
    const now = new Date('2026-09-16T22:00:00.000Z');
    expect(shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn: null })).toBe(true);
  });

  it('is true after the reminder time', () => {
    const now = new Date('2026-09-17T01:00:00.000Z'); // 21:00 New York on the 16th
    expect(shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn: null })).toBe(true);
  });

  it('is false once the same New York day has been checked', () => {
    const now = new Date('2026-09-16T23:00:00.000Z');
    expect(shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn: '2026-09-16' })).toBe(false);
  });

  it('is true again the next New York day', () => {
    const now = new Date('2026-09-17T22:30:00.000Z');
    expect(shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn: '2026-09-16' })).toBe(true);
  });

  it('is false in the small hours even when the day is unchecked', () => {
    const now = new Date('2026-09-17T06:00:00.000Z'); // 02:00 New York on the 17th
    expect(shouldRunDueCheck({ now, dueReminderTime, dueCheckedOn: '2026-09-16' })).toBe(false);
  });

  it('propagates a malformed reminder time rather than guessing', () => {
    const now = new Date('2026-09-16T23:00:00.000Z');
    expect(() => shouldRunDueCheck({ now, dueReminderTime: '6pm', dueCheckedOn: null })).toThrow(
      InvalidReminderTimeError,
    );
  });
});
