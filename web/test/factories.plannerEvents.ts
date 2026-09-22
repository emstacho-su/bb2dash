/** Planner-event fixtures (Phase 11b). Plain rows; nothing here reaches a network. */

import type { PlannerEventDraft, PlannerEventRow } from '@/lib/planner-events';

/** A one-hour Event, 09:00–10:00 New York on Wednesday 2026-09-16. */
export function makePlannerEvent(overrides: Partial<PlannerEventRow> = {}): PlannerEventRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'event',
    title: 'Advising meeting',
    starts_at: '2026-09-16T13:00:00.000Z',
    ends_at: '2026-09-16T14:00:00.000Z',
    time_zone: 'America/New_York',
    all_day: false,
    location_kind: null,
    location: null,
    notes: null,
    done: null,
    course_id: null,
    series_id: null,
    series_detached: false,
    created_at: '2026-09-15T12:00:00.000Z',
    updated_at: '2026-09-15T12:00:00.000Z',
    ...overrides,
  };
}

/** The writable columns of `makePlannerEvent`. */
export function makePlannerEventDraft(
  overrides: Partial<PlannerEventDraft> = {},
): PlannerEventDraft {
  const { kind, title, starts_at, ends_at, time_zone, all_day, location_kind, location, notes, done, course_id } =
    makePlannerEvent();
  return {
    kind,
    title,
    starts_at,
    ends_at,
    time_zone,
    all_day,
    location_kind,
    location,
    notes,
    done,
    course_id,
    ...overrides,
  };
}
