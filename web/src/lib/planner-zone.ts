/**
 * bb2dash — wall clocks in an IANA time zone, through `Intl` only (Phase 11b).
 *
 * A planner event is typed in as a wall clock ("09:00 on Nov 1 in
 * America/Los_Angeles") and stored as an instant (`timestamptz`). This module is
 * the one place that conversion happens, in both directions, and it never adds
 * a fixed offset: every offset it uses is *read back* from `Intl` for the
 * instant in question, so the answer is right on both sides of a DST change and
 * does not depend on the zone of the machine running it.
 *
 * AMBIGUOUS AND MISSING TIMES (K-9). Twice a year a wall clock is not one
 * instant. We follow Temporal's `compatible` disambiguation:
 *
 *   * fold — 01:30 on 2026-11-01 in New York happens twice (EDT, then EST).
 *     We take the EARLIER instant, 05:30Z.
 *   * gap  — 02:30 on 2026-03-08 in New York never happens. We move FORWARD by
 *     the length of the gap, to 03:30 EDT.
 *
 * Both cases come back flagged so the form can say so under the field.
 * Postgres resolves a fold the other way (standard time), which is why SQL
 * never re-derives an instant from a wall clock: the web converts once.
 *
 * No React, no data access, no new dependency.
 */

import { COURSE_TIME_ZONE } from './course-dimension';

/** The grid's zone and every new event's default zone. */
export const DEFAULT_TIME_ZONE = COURSE_TIME_ZONE;

/**
 * K-2: `UTC`, or an Area/Location name. POSIX strings such as `UTC+3` are
 * refused on purpose — Postgres reads their sign the opposite way from ISO.
 */
export const TIME_ZONE_PATTERN = /^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/;

/** The short list the form offers before free entry. */
export const COMMON_TIME_ZONES: readonly string[] = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM = /^(\d{2}):(\d{2})$/;

/* ---------------------------------------------------------------------------
 * Zone validation
 * ------------------------------------------------------------------------ */

/** True when `Intl` accepts the zone. Never throws. */
function intlAcceptsZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** K-2's rule, mirrored: the pattern (or `UTC`) and `Intl` not throwing. */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (typeof zone !== 'string') return false;
  if (zone !== 'UTC' && !TIME_ZONE_PATTERN.test(zone)) return false;
  return intlAcceptsZone(zone);
}

/**
 * The zone as `Intl` spells it, when the only difference is letter case
 * ('america/new_york' → 'America/New_York'). Aliases are left as typed:
 * `pg_timezone_names` is matched exactly and carries both spellings of a link,
 * but not a lower-case one. Returns null for an invalid zone.
 */
export function canonicalTimeZone(zone: string | null | undefined): string | null {
  if (typeof zone !== 'string') return null;
  const trimmed = zone.trim();
  if (!isValidTimeZone(trimmed)) return null;
  const resolved = new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).resolvedOptions()
    .timeZone;
  return resolved.toLowerCase() === trimmed.toLowerCase() ? resolved : trimmed;
}

/* ---------------------------------------------------------------------------
 * Instant → wall clock
 * ------------------------------------------------------------------------ */

/** A wall-clock reading in some zone. */
export interface ZonedWallClock {
  /** 'YYYY-MM-DD'. */
  date: string;
  /** 'HH:MM', 24-hour. */
  time: string;
  /** Minutes past local midnight. */
  minute: number;
}

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  const cached = partsFormatters.get(zone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  partsFormatters.set(zone, formatter);
  return formatter;
}

interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedFields(epochMs: number, zone: string): Fields {
  const parts = new Map(
    partsFormatter(zone)
      .formatToParts(new Date(epochMs))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
    // Some ICU builds still print midnight as '24'.
    hour: Number(parts.get('hour')) % 24,
    minute: Number(parts.get('minute')),
    second: Number(parts.get('second')),
  };
}

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

/** The wall clock of an instant in `zone`, or null for a bad instant or zone. */
export function wallClockIn(
  instant: string | Date | null | undefined,
  zone: string,
): ZonedWallClock | null {
  if (instant === null || instant === undefined || !isValidTimeZone(zone)) return null;
  const epochMs = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (!Number.isFinite(epochMs)) return null;
  const f = zonedFields(epochMs, zone);
  return {
    date: `${pad(f.year, 4)}-${pad(f.month)}-${pad(f.day)}`,
    time: `${pad(f.hour)}:${pad(f.minute)}`,
    minute: f.hour * 60 + f.minute,
  };
}

/** The zone's UTC offset at an instant, in minutes, as `Intl` reports it. */
function offsetMinutesAt(epochMs: number, zone: string): number {
  const f = zonedFields(epochMs, zone);
  const wallAsUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  const wholeSecondMs = Math.floor(epochMs / 1000) * 1000;
  return Math.round((wallAsUtc - wholeSecondMs) / MINUTE_MS);
}

/* ---------------------------------------------------------------------------
 * Wall clock → instant
 * ------------------------------------------------------------------------ */

/** How a wall clock became an instant. */
export type WallClockResolution = 'exact' | 'fold' | 'gap';

export interface ResolvedInstant {
  /** RFC 3339 in UTC, ready for a timestamptz column. */
  iso: string;
  resolution: WallClockResolution;
  /** The wall clock the instant actually reads as — differs from input on a gap. */
  wall: ZonedWallClock;
}

/**
 * The instant a wall clock names in `zone`, by Temporal's `compatible` rule.
 * Null when the date, time or zone is not valid.
 */
export function wallClockToInstant(
  date: string,
  time: string,
  zone: string,
): ResolvedInstant | null {
  const dateMatch = ISO_DATE.exec(date);
  const timeMatch = HH_MM.exec(time);
  if (!dateMatch || !timeMatch || !isValidTimeZone(zone)) return null;

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  if (hour > 23 || minute > 59) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  if (!sameUtcDate(target, year, month, day)) return null;

  // No zone changes its offset twice within two days, so the offsets a day
  // either side bound every candidate.
  const before = offsetMinutesAt(target - DAY_MS, zone);
  const after = offsetMinutesAt(target + DAY_MS, zone);
  const candidates = [...new Set([target - before * MINUTE_MS, target - after * MINUTE_MS])]
    .filter((epochMs) => wallMatches(epochMs, zone, target))
    .sort((a, b) => a - b);

  if (candidates.length > 0) {
    const epochMs = candidates[0];
    return resolved(epochMs, zone, candidates.length > 1 ? 'fold' : 'exact');
  }
  // A gap: read the wall clock with the offset in force before the change,
  // which lands `after - before` minutes later on the far side of it.
  return resolved(target - before * MINUTE_MS, zone, 'gap');
}

function sameUtcDate(epochMs: number, year: number, month: number, day: number): boolean {
  const d = new Date(epochMs);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function wallMatches(epochMs: number, zone: string, target: number): boolean {
  const f = zonedFields(epochMs, zone);
  return Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute) === target;
}

function resolved(epochMs: number, zone: string, resolution: WallClockResolution): ResolvedInstant {
  const iso = new Date(epochMs).toISOString();
  // `wallClockIn` cannot return null here: the zone and instant are both valid.
  return { iso, resolution, wall: wallClockIn(iso, zone) as ZonedWallClock };
}

/* ---------------------------------------------------------------------------
 * Dates and labels
 * ------------------------------------------------------------------------ */

/** 'YYYY-MM-DD' shifted by whole days, by calendar arithmetic in UTC. */
export function addDaysIso(date: string, days: number): string {
  const match = ISO_DATE.exec(date);
  if (!match) return date;
  const [year, month, day] = match.slice(1).map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + Math.trunc(days)));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 00:00 of `date` in `zone`, as a resolved instant (a gap moves it forward). */
export function localMidnight(date: string, zone: string): ResolvedInstant | null {
  return wallClockToInstant(date, '00:00', zone);
}

const shortNameFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * `Intl`'s short zone name at an instant: 'PDT', 'EST', 'GMT+1'. Null for a bad
 * instant or zone.
 */
export function shortZoneName(instant: string, zone: string): string | null {
  if (!isValidTimeZone(zone)) return null;
  const epochMs = Date.parse(instant);
  if (!Number.isFinite(epochMs)) return null;
  let formatter = shortNameFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' });
    shortNameFormatters.set(zone, formatter);
  }
  return (
    formatter.formatToParts(new Date(epochMs)).find((part) => part.type === 'timeZoneName')
      ?.value ?? null
  );
}

/** '09:00 PDT' — an instant's own local time and short zone name. */
export function zoneChipLabel(instant: string, zone: string): string | null {
  const wall = wallClockIn(instant, zone);
  const name = shortZoneName(instant, zone);
  if (!wall || !name) return null;
  return `${wall.time} ${name}`;
}
