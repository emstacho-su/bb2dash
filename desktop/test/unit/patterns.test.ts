/**
 * R2-10 — the shared string shapes.
 *
 * `HH_MM` was declared twice and `ISO_DATE` three times, across four files that all have to
 * agree. The point of these tests is not that a regex works; it is that the four call sites
 * are now looking at the *same* regex, so one of them cannot drift.
 */

import { describe, expect, it } from 'vitest';

import { HH_MM, ISO_DATE, ISO_INSTANT, isIsoDate, isIsoInstant, normaliseInstant } from '../../src/core/patterns';
import { configSchema } from '../../src/core/config';
import { InvalidReminderTimeError, reminderMinutes } from '../../src/core/poller/ny-time';
import { QueryValueError, dueQuery, gradesQuery } from '../../src/core/poller/sources';
import { isWatermark } from '../../src/core/poller/watermark';
import { watermark } from '../fixtures/rows';

const ANON = { supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature' };

describe('the shapes themselves', () => {
  it.each(['00:00', '09:05', '18:00', '23:59'])('HH_MM accepts %s', (value) => {
    expect(HH_MM.test(value)).toBe(true);
  });

  it.each(['24:00', '6pm', '1:00', '18:60', '18:00:00', ''])('HH_MM rejects %s', (value) => {
    expect(HH_MM.test(value)).toBe(false);
  });

  it.each(['2026-09-16', '2026-01-01'])('ISO_DATE accepts %s', (value) => {
    expect(isIsoDate(value)).toBe(true);
  });

  it.each(['16/09/2026', '2026-9-16', '2026-09-16T00:00:00Z', 42, null])(
    'ISO_DATE rejects %s',
    (value) => {
      expect(isIsoDate(value)).toBe(false);
    },
  );

  it.each([
    '2026-09-16T18:04:02Z',
    '2026-09-16T18:04:02.000Z',
    '2026-09-16T18:04:02.123456Z',
  ])('ISO_INSTANT accepts %s', (value) => {
    expect(isIsoInstant(value)).toBe(true);
  });

  it.each([
    '2026-09-16T18:04:02+00:00',
    '2026-09-16 18:04:02Z',
    '2026-09-16T18:04:02',
    '2026-09-16',
  ])('ISO_INSTANT rejects %s', (value) => {
    expect(isIsoInstant(value)).toBe(false);
  });

  it('matches whatever toISOString produces, for a range of instants', () => {
    for (const ms of [0, 1, 1_000, Date.UTC(2026, 8, 16, 18, 4, 2, 123), Date.now()]) {
      expect(ISO_INSTANT.test(new Date(ms).toISOString())).toBe(true);
    }
  });
});

describe('normaliseInstant', () => {
  it('passes a strict instant through untouched', () => {
    expect(normaliseInstant('2026-09-16T18:04:02.000Z')).toBe('2026-09-16T18:04:02.000Z');
  });

  it.each([
    ['2026-09-16T18:04:02+00:00', '2026-09-16T18:04:02.000Z'],
    ['2026-09-16T14:04:02-04:00', '2026-09-16T18:04:02.000Z'],
    ['2026-09-16', '2026-09-16T00:00:00.000Z'],
  ])('repairs %s', (input, expected) => {
    expect(normaliseInstant(input)).toBe(expected);
  });

  it.each(['', 'soon', 'yesterday', null, undefined, 42, {}])('is null for %s', (value) => {
    expect(normaliseInstant(value)).toBeNull();
  });

  it('always returns something ISO_INSTANT accepts, or null', () => {
    for (const value of ['2026-09-16T18:04:02+00:00', '2026-09-16', 'nope']) {
      const result = normaliseInstant(value);
      if (result !== null) expect(isIsoInstant(result)).toBe(true);
    }
  });
});

describe('the four former copies now agree', () => {
  // Each pair is a value that one call site accepts and another would then have to parse.
  // Before R2-10 nothing stopped these four regexes from drifting apart.
  it.each(['24:00', '6pm', '18:60'])(
    'the config schema and the NY clock both reject dueReminderTime %s',
    (value) => {
      expect(configSchema.safeParse({ ...ANON, dueReminderTime: value }).success).toBe(false);
      expect(() => reminderMinutes(value)).toThrow(InvalidReminderTimeError);
    },
  );

  it.each(['00:00', '18:00', '23:59'])(
    'the config schema and the NY clock both accept dueReminderTime %s',
    (value) => {
      expect(configSchema.safeParse({ ...ANON, dueReminderTime: value }).success).toBe(true);
      expect(() => reminderMinutes(value)).not.toThrow();
    },
  );

  it('a dueCheckedOn the watermark accepts is a dueOn the query builder accepts', () => {
    expect(isWatermark(watermark({ dueCheckedOn: '2026-09-16' }))).toBe(true);
    expect(() => dueQuery('2026-09-16')).not.toThrow();

    expect(isWatermark(watermark({ dueCheckedOn: '2026-9-16' }))).toBe(false);
    expect(() => dueQuery('2026-9-16')).toThrow(QueryValueError);
  });

  it('a lastSeenAt the watermark store hands back is one the query builder accepts', () => {
    // This is R2-9's invariant, stated as the shared-shape property it really is.
    const value = normaliseInstant('2026-09-16T14:04:02+00:00');
    expect(value).not.toBeNull();
    expect(() => gradesQuery(value ?? '')).not.toThrow();
  });
});
