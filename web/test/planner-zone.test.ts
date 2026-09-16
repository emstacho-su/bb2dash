/**
 * Wall clock ↔ instant in an IANA zone (Phase 11b, K-2 / K-9).
 *
 * Every expectation is a fixed UTC instant, so the suite holds whatever zone
 * the machine running it is in. The two DST days of 2026 in New York are the
 * point: 2026-11-01 01:00–02:00 happens twice (Temporal `compatible` takes the
 * earlier instant), and 2026-03-08 02:00–03:00 never happens (it moves forward
 * by the gap). Postgres resolves the fold the other way, which is why the web
 * converts once and SQL never re-derives an instant.
 */

import { describe, expect, it } from 'vitest';
import {
  COMMON_TIME_ZONES,
  DEFAULT_TIME_ZONE,
  canonicalTimeZone,
  isValidTimeZone,
  localMidnight,
  localMidnightDateOf,
  nextLocalMidnight,
  shortZoneName,
  wallClockIn,
  wallClockToInstant,
  zoneChipLabel,
} from '@/lib/planner-zone';

const NY = 'America/New_York';
const LA = 'America/Los_Angeles';

describe('isValidTimeZone — K-2 mirrored', () => {
  it('accepts Area/Location names and UTC', () => {
    for (const zone of [NY, LA, 'UTC', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5']) {
      expect(isValidTimeZone(zone)).toBe(true);
    }
  });

  it('refuses POSIX strings Postgres would read with the opposite sign', () => {
    expect(isValidTimeZone('UTC+3')).toBe(false);
    expect(isValidTimeZone('EST5EDT')).toBe(false);
    expect(isValidTimeZone('+03:00')).toBe(false);
  });

  it('refuses names Intl does not know, blanks and non-strings', () => {
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });

  it('offers only zones that pass its own rule, starting with New York', () => {
    expect(COMMON_TIME_ZONES[0]).toBe(DEFAULT_TIME_ZONE);
    expect(COMMON_TIME_ZONES.every((zone) => isValidTimeZone(zone))).toBe(true);
  });

  it('fixes the letter case of a typed zone and trims it', () => {
    expect(canonicalTimeZone(' america/new_york ')).toBe(NY);
    expect(canonicalTimeZone('utc')).toBe('UTC');
    expect(canonicalTimeZone('UTC+3')).toBeNull();
  });

  it("sends Intl's resolved name for an alias 067 would reject as typed (R2-7)", () => {
    expect(canonicalTimeZone('us/eastern')).toBe(NY);
    expect(canonicalTimeZone('US/Pacific')).toBe(LA);
  });

  it('refuses a typed value outside the K-2 shape even when Intl maps it to a zone', () => {
    // Intl resolves both of these to real zones; the rule is about what was typed.
    expect(canonicalTimeZone('EST5EDT')).toBeNull();
    expect(canonicalTimeZone('est')).toBeNull();
    expect(canonicalTimeZone('GMT')).toBeNull();
    expect(canonicalTimeZone('Nowhere/Land')).toBeNull();
    expect(canonicalTimeZone(null)).toBeNull();
  });
});

describe('wallClockToInstant — ordinary days', () => {
  it('converts a New York wall clock in daylight time', () => {
    expect(wallClockToInstant('2026-09-16', '09:00', NY)).toEqual({
      iso: '2026-09-16T13:00:00.000Z',
      resolution: 'exact',
      wall: { date: '2026-09-16', time: '09:00', minute: 540 },
    });
  });

  it('converts an event entered in America/Los_Angeles', () => {
    const resolved = wallClockToInstant('2026-09-16', '09:00', LA);
    expect(resolved?.iso).toBe('2026-09-16T16:00:00.000Z');
    // …which the grid places at noon New York.
    expect(wallClockIn(resolved!.iso, NY)).toEqual({ date: '2026-09-16', time: '12:00', minute: 720 });
  });

  it('crosses a date line when the zone is far enough away', () => {
    expect(wallClockToInstant('2026-09-17', '00:00', 'Asia/Tokyo')?.iso).toBe(
      '2026-09-16T15:00:00.000Z',
    );
  });

  it('refuses impossible dates, times and zones', () => {
    expect(wallClockToInstant('2026-02-31', '09:00', NY)).toBeNull();
    expect(wallClockToInstant('2026-09-16', '24:00', NY)).toBeNull();
    expect(wallClockToInstant('2026-09-16', '9:00', NY)).toBeNull();
    expect(wallClockToInstant('2026-09-16', '09:00', 'UTC+3')).toBeNull();
  });
});

describe('wallClockToInstant — the 2026-11-01 fall-back', () => {
  it('before the fold: 00:30 is EDT', () => {
    const r = wallClockToInstant('2026-11-01', '00:30', NY);
    expect(r).toMatchObject({ iso: '2026-11-01T04:30:00.000Z', resolution: 'exact' });
  });

  it('in the fold: 01:30 happens twice and takes the earlier instant', () => {
    const r = wallClockToInstant('2026-11-01', '01:30', NY);
    expect(r).toMatchObject({ iso: '2026-11-01T05:30:00.000Z', resolution: 'fold' });
    expect(r?.wall.time).toBe('01:30');
    expect(shortZoneName(r!.iso, NY)).toBe('EDT');
  });

  it('after the fold: 02:30 is EST', () => {
    const r = wallClockToInstant('2026-11-01', '02:30', NY);
    expect(r).toMatchObject({ iso: '2026-11-01T07:30:00.000Z', resolution: 'exact' });
    expect(shortZoneName(r!.iso, NY)).toBe('EST');
  });

  it('reads both instants of the fold back as 01:30', () => {
    expect(wallClockIn('2026-11-01T05:30:00Z', NY)?.time).toBe('01:30');
    expect(wallClockIn('2026-11-01T06:30:00Z', NY)?.time).toBe('01:30');
  });

  it('applies the same rule in Los Angeles, three hours later', () => {
    const r = wallClockToInstant('2026-11-01', '01:30', LA);
    expect(r).toMatchObject({ iso: '2026-11-01T08:30:00.000Z', resolution: 'fold' });
    expect(wallClockIn(r!.iso, NY)?.time).toBe('03:30');
  });
});

describe('wallClockToInstant — the 2026-03-08 spring-forward gap', () => {
  it('moves a skipped 02:30 forward by the gap, to 03:30 EDT, and says so', () => {
    const r = wallClockToInstant('2026-03-08', '02:30', NY);
    expect(r).toEqual({
      iso: '2026-03-08T07:30:00.000Z',
      resolution: 'gap',
      wall: { date: '2026-03-08', time: '03:30', minute: 210 },
    });
  });

  it('leaves the minutes either side of the gap alone', () => {
    expect(wallClockToInstant('2026-03-08', '01:59', NY)).toMatchObject({
      iso: '2026-03-08T06:59:00.000Z',
      resolution: 'exact',
    });
    expect(wallClockToInstant('2026-03-08', '03:00', NY)).toMatchObject({
      iso: '2026-03-08T07:00:00.000Z',
      resolution: 'exact',
    });
  });
});

describe('dates and labels', () => {
  it('finds the next local midnight across a month, a year and the fall-back', () => {
    expect(nextLocalMidnight('2026-12-31', NY)?.iso).toBe('2027-01-01T05:00:00.000Z');
    expect(nextLocalMidnight('2026-11-01', NY)?.iso).toBe('2026-11-02T05:00:00.000Z');
    expect(nextLocalMidnight('not a date', NY)).toBeNull();
  });

  it('finds local midnight in the zone', () => {
    expect(localMidnight('2026-11-01', NY)?.iso).toBe('2026-11-01T04:00:00.000Z');
    expect(localMidnight('2026-11-02', NY)?.iso).toBe('2026-11-02T05:00:00.000Z');
  });

  it('recognises an exact local midnight, and nothing a second off it (R2-9)', () => {
    expect(localMidnightDateOf('2026-09-16T04:00:00.000Z', NY)).toBe('2026-09-16');
    expect(localMidnightDateOf('2026-09-16T04:00:30.000Z', NY)).toBeNull();
    expect(localMidnightDateOf('2026-09-16T04:00:00.001Z', NY)).toBeNull();
    expect(localMidnightDateOf('2026-09-16T04:01:00.000Z', NY)).toBeNull();
    expect(localMidnightDateOf('2026-09-16T15:00:00.000Z', 'Asia/Tokyo')).toBe('2026-09-17');
    expect(localMidnightDateOf('garbage', NY)).toBeNull();
    expect(localMidnightDateOf('2026-09-16T04:00:00.000Z', 'UTC+3')).toBeNull();
  });

  it('counts a midnight moved forward by a DST gap, as the 067 trigger does', () => {
    // America/Havana springs forward at 00:00 on 2026-03-08: 00:00 never happens.
    const moved = localMidnight('2026-03-08', 'America/Havana');
    expect(moved?.resolution).toBe('gap');
    expect(localMidnightDateOf(moved!.iso, 'America/Havana')).toBe('2026-03-08');
  });

  it('labels an instant with its own local time and Intl short zone name', () => {
    expect(zoneChipLabel('2026-09-16T16:00:00Z', LA)).toBe('09:00 PDT');
    expect(zoneChipLabel('2026-12-16T17:00:00Z', LA)).toBe('09:00 PST');
    expect(zoneChipLabel('not an instant', LA)).toBeNull();
    expect(zoneChipLabel('2026-09-16T16:00:00Z', 'UTC+3')).toBeNull();
  });

  it('returns null for a wall clock it cannot read', () => {
    expect(wallClockIn(null, NY)).toBeNull();
    expect(wallClockIn('garbage', NY)).toBeNull();
    expect(wallClockIn('2026-09-16T16:00:00Z', 'Nowhere/Land')).toBeNull();
  });
});
