/**
 * Planner-event boundary validation and all-day dates (Phase 11b, 067 + K-3/K-4).
 *
 * The validator restates the database's checks, so each case below is a row
 * Postgres would refuse (or accept) — the web says so first, per field.
 */

import { describe, expect, it } from 'vitest';
import {
  PLANNER_EVENT_KINDS,
  PLANNER_EVENT_KIND_LABELS,
  PlannerEventValidationError,
  allDayDates,
  allDayInstants,
  isHttpUrl,
  isPlannerEventKind,
  validatePlannerEvent,
  type PlannerEventDraft,
} from '@/lib/planner-events';
import { makePlannerEventDraft } from './factories.plannerEvents';

function errorsFor(overrides: Partial<PlannerEventDraft>) {
  const result = validatePlannerEvent(makePlannerEventDraft(overrides));
  return result.ok ? {} : result.errors;
}

describe('kinds', () => {
  it('has the six Contract kinds with K-6 labels, in order', () => {
    expect(PLANNER_EVENT_KINDS).toEqual([
      'event', 'task', 'out_of_office', 'focus_time', 'working_location', 'appointment_slot',
    ]);
    expect(Object.values(PLANNER_EVENT_KIND_LABELS)).toEqual([
      'Event', 'Task', 'Out of office', 'Focus time', 'Working location', 'Appointment slot',
    ]);
    expect(isPlannerEventKind('reminder')).toBe(false);
  });
});

describe('validatePlannerEvent — accepted rows', () => {
  it('accepts the plain fixture and normalises blanks to null', () => {
    const result = validatePlannerEvent(
      makePlannerEventDraft({ title: '  Advising  ', notes: '   ', course_id: '' }),
    );
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ title: 'Advising', notes: null, course_id: null }),
    });
  });

  it('accepts a zero-length task (end = start) with a done state', () => {
    const at = '2026-09-16T15:00:00.000Z';
    expect(errorsFor({ kind: 'task', done: false, starts_at: at, ends_at: at })).toEqual({});
  });

  it('counts characters the way Postgres does, not UTF-16 units', () => {
    expect(errorsFor({ title: '📚'.repeat(200) })).toEqual({});
    expect(errorsFor({ title: '📚'.repeat(201) }).title).toMatch(/200/);
  });

  it('fixes the zone letter case', () => {
    const result = validatePlannerEvent(makePlannerEventDraft({ time_zone: 'america/los_angeles' }));
    expect(result.ok && result.value.time_zone).toBe('America/Los_Angeles');
  });

  it('accepts an online location that is an http(s) link', () => {
    expect(
      errorsFor({ location_kind: 'online', location: 'https://syr.zoom.us/j/123' }),
    ).toEqual({});
  });
});

describe('validatePlannerEvent — refused rows', () => {
  it('title: blank, whitespace or over 200 characters', () => {
    expect(errorsFor({ title: '' }).title).toBeDefined();
    expect(errorsFor({ title: '   ' }).title).toBeDefined();
    expect(errorsFor({ title: 'x'.repeat(201) }).title).toBeDefined();
  });

  it('kind: not one of the six', () => {
    expect(errorsFor({ kind: 'reminder' as PlannerEventDraft['kind'] }).kind).toBeDefined();
  });

  it('times: unparseable, or an end before the start', () => {
    expect(errorsFor({ starts_at: 'soon' }).starts_at).toBeDefined();
    expect(errorsFor({ ends_at: '' }).ends_at).toBeDefined();
    expect(
      errorsFor({ starts_at: '2026-09-16T14:00:00Z', ends_at: '2026-09-16T13:59:00Z' }).ends_at,
    ).toMatch(/before the start/);
  });

  it('notes over 2000 and location over 500 characters', () => {
    expect(errorsFor({ notes: 'n'.repeat(2001) }).notes).toBeDefined();
    expect(errorsFor({ notes: 'n'.repeat(2000) }).notes).toBeUndefined();
    expect(
      errorsFor({ location_kind: 'in_person', location: 'p'.repeat(501) }).location,
    ).toBeDefined();
  });

  it('location_kind iff location', () => {
    expect(errorsFor({ location_kind: null, location: 'Hinds Hall' }).location_kind).toBeDefined();
    expect(errorsFor({ location_kind: 'in_person', location: '  ' }).location).toBeDefined();
    expect(errorsFor({ location_kind: 'hybrid', location: 'x' }).location_kind).toBeDefined();
  });

  it('online ⇒ http(s): no javascript:, mailto: or bare hosts', () => {
    for (const location of ['javascript:alert(1)', 'mailto:a@b.c', 'zoom.us/j/1', 'https://a b']) {
      expect(errorsFor({ location_kind: 'online', location }).location).toBeDefined();
    }
  });

  it('done only, and always, for a task', () => {
    expect(errorsFor({ kind: 'task', done: null }).done).toBeDefined();
    expect(errorsFor({ kind: 'event', done: false }).done).toBeDefined();
  });

  it('time zone: POSIX strings and unknown names', () => {
    expect(errorsFor({ time_zone: 'UTC+3' }).time_zone).toBeDefined();
    expect(errorsFor({ time_zone: 'Nowhere/Land' }).time_zone).toBeDefined();
  });

  it('all-day: instants that are not local midnights, or no whole day', () => {
    expect(
      errorsFor({ all_day: true, starts_at: '2026-09-16T13:00:00Z', ends_at: '2026-09-17T04:00:00Z' })
        .starts_at,
    ).toBeDefined();
    expect(
      errorsFor({ all_day: true, starts_at: '2026-09-16T04:00:00Z', ends_at: '2026-09-16T04:00:00Z' })
        .ends_at,
    ).toBeDefined();
  });

  it('carries every message on the error class', () => {
    const result = validatePlannerEvent(makePlannerEventDraft({ title: '', time_zone: 'UTC+3' }));
    expect(result.ok).toBe(false);
    const error = new PlannerEventValidationError(result.ok ? {} : result.errors);
    expect(Object.keys(error.errors).sort()).toEqual(['time_zone', 'title']);
    expect(error.message).toContain('Give it a title.');
  });
});

describe('isHttpUrl', () => {
  it('accepts http and https only', () => {
    expect(isHttpUrl('http://example.com')).toBe(true);
    expect(isHttpUrl('HTTPS://EXAMPLE.COM/x')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe('all-day dates (K-3: exclusive end)', () => {
  it('stores one New York day as local midnight to the next local midnight', () => {
    expect(allDayInstants('2026-09-16', '2026-09-16', 'America/New_York')).toEqual({
      starts_at: '2026-09-16T04:00:00.000Z',
      ends_at: '2026-09-17T04:00:00.000Z',
    });
  });

  it('spans the fall-back night: 25 hours, still one local day', () => {
    expect(allDayInstants('2026-11-01', '2026-11-01', 'America/New_York')).toEqual({
      starts_at: '2026-11-01T04:00:00.000Z',
      ends_at: '2026-11-02T05:00:00.000Z',
    });
  });

  it('uses the event zone, not New York', () => {
    const tokyo = allDayInstants('2026-09-17', '2026-09-18', 'Asia/Tokyo');
    expect(tokyo).toEqual({
      starts_at: '2026-09-16T15:00:00.000Z',
      ends_at: '2026-09-18T15:00:00.000Z',
    });
    expect(allDayDates({ ...tokyo!, time_zone: 'Asia/Tokyo' })).toEqual({
      firstDay: '2026-09-17',
      lastDay: '2026-09-18',
    });
  });

  it('refuses a last day before the first, or a bad zone', () => {
    expect(allDayInstants('2026-09-17', '2026-09-16', 'America/New_York')).toBeNull();
    expect(allDayInstants('2026-09-17', '2026-09-17', 'UTC+3')).toBeNull();
  });

  it('round-trips a stored row back to inclusive dates', () => {
    expect(
      allDayDates({
        starts_at: '2026-09-16T04:00:00Z',
        ends_at: '2026-09-17T04:00:00Z',
        time_zone: 'America/New_York',
      }),
    ).toEqual({ firstDay: '2026-09-16', lastDay: '2026-09-16' });
  });
});
