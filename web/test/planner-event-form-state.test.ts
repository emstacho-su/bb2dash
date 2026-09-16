/**
 * `PlannerEventForm`'s pure state: prefill, reading a row back, and the one
 * conversion from wall clocks to a validated draft (Phase 11b, K-3 / K-9).
 */

import { describe, expect, it } from 'vitest';
import {
  OTHER_ZONE,
  draftFromForm,
  formStateFromPrefill,
  formStateFromRow,
  updateForm,
} from '@/components/planner/planner-event-form-state';
import { allDayInstants } from '@/lib/planner-events';
import { makePlannerEvent } from './factories.plannerEvents';

describe('formStateFromPrefill', () => {
  it('a slot: that date, that start, +60 minutes, New York', () => {
    expect(formStateFromPrefill({ allDay: false, date: '2026-09-16', startMinute: 14 * 60 + 30 })).toMatchObject({
      allDay: false,
      startDate: '2026-09-16',
      startTime: '14:30',
      endDate: '2026-09-16',
      endTime: '15:30',
      zoneChoice: 'America/New_York',
      kind: 'event',
    });
  });

  it('carries an end past midnight onto the next day', () => {
    expect(formStateFromPrefill({ allDay: false, date: '2026-09-16', startMinute: 23 * 60 + 30 })).toMatchObject({
      endDate: '2026-09-17',
      endTime: '00:30',
    });
  });

  it('an Events cell: an all-day event on that date', () => {
    expect(formStateFromPrefill({ allDay: true, date: '2026-09-18' })).toMatchObject({
      allDay: true,
      startDate: '2026-09-18',
      endDate: '2026-09-18',
    });
  });
});

describe('formStateFromRow', () => {
  it('reads a timed row back as wall clocks in its own zone', () => {
    const la = makePlannerEvent({
      time_zone: 'America/Los_Angeles',
      starts_at: '2026-09-16T16:00:00.000Z',
      ends_at: '2026-09-16T17:30:00.000Z',
      location_kind: 'online',
      location: 'https://syr.zoom.us/j/1',
    });
    expect(formStateFromRow(la)).toMatchObject({
      startDate: '2026-09-16',
      startTime: '09:00',
      endTime: '10:30',
      zoneChoice: 'America/Los_Angeles',
      locationKind: 'online',
      location: 'https://syr.zoom.us/j/1',
    });
  });

  it('shows an all-day row with its inclusive last day', () => {
    const trip = makePlannerEvent({
      all_day: true,
      ...allDayInstants('2026-09-17', '2026-09-19', 'America/New_York')!,
    });
    expect(formStateFromRow(trip)).toMatchObject({ startDate: '2026-09-17', endDate: '2026-09-19' });
  });

  it('puts a zone outside the short list in free entry', () => {
    const berlin = makePlannerEvent({ time_zone: 'Europe/Berlin' });
    expect(formStateFromRow(berlin)).toMatchObject({ zoneChoice: OTHER_ZONE, customZone: 'Europe/Berlin' });
  });
});

describe('updateForm', () => {
  it('moves a same-day end date along with the start date, immutably', () => {
    const before = formStateFromPrefill({ allDay: false, date: '2026-09-16', startMinute: 600 });
    const after = updateForm(before, 'startDate', '2026-09-18');
    expect(after).toMatchObject({ startDate: '2026-09-18', endDate: '2026-09-18' });
    expect(before.startDate).toBe('2026-09-16');
  });
});

describe('draftFromForm', () => {
  const base = () => ({
    ...formStateFromPrefill({ allDay: false, date: '2026-09-16', startMinute: 540 }),
    title: 'Advising',
  });

  it('converts a Los Angeles wall clock once, to the instant', () => {
    const result = draftFromForm({ ...base(), zoneChoice: 'America/Los_Angeles' });
    expect(result).toMatchObject({
      ok: true,
      draft: { starts_at: '2026-09-16T16:00:00.000Z', ends_at: '2026-09-16T17:00:00.000Z', time_zone: 'America/Los_Angeles' },
    });
  });

  it('stores an all-day event with an exclusive end', () => {
    const result = draftFromForm({ ...base(), allDay: true, endDate: '2026-09-17' });
    expect(result).toMatchObject({
      ok: true,
      draft: { all_day: true, starts_at: '2026-09-16T04:00:00.000Z', ends_at: '2026-09-18T04:00:00.000Z' },
    });
  });

  it('says so under the field when a time is in the fall-back fold', () => {
    const result = draftFromForm({
      ...base(),
      startDate: '2026-11-01',
      startTime: '01:30',
      endDate: '2026-11-01',
      endTime: '03:00',
    });
    expect(result.ok).toBe(true);
    expect(result.notes.start).toMatch(/happens twice/);
    expect(result.notes.end).toBeUndefined();
  });

  it('says so when a time is in the spring-forward gap', () => {
    const result = draftFromForm({
      ...base(),
      startDate: '2026-03-08',
      startTime: '02:30',
      endDate: '2026-03-08',
      endTime: '04:00',
    });
    expect(result.notes.start).toMatch(/saved as 03:30/);
  });

  it('maps validation errors onto the form fields', () => {
    const result = draftFromForm({
      ...base(),
      title: '',
      endTime: '08:00',
      locationKind: 'online',
      location: 'zoom.us/j/1',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['end', 'location', 'title']);
  });

  it('names only the zone when a typed zone is not IANA', () => {
    const result = draftFromForm({ ...base(), zoneChoice: OTHER_ZONE, customZone: 'UTC+3' });
    expect(!result.ok && result.errors).toEqual({
      zone: 'Use an IANA zone such as America/New_York.',
    });
  });

  it('refuses an all-day last day before the first', () => {
    const result = draftFromForm({ ...base(), allDay: true, endDate: '2026-09-15' });
    expect(!result.ok && result.errors.end).toMatch(/before the first/);
  });

  it('writes done only for a task', () => {
    const task = draftFromForm({ ...base(), kind: 'task', done: true });
    const event = draftFromForm({ ...base(), kind: 'event', done: true });
    expect(task.ok && task.draft.done).toBe(true);
    expect(event.ok && event.draft.done).toBeNull();
  });
});
