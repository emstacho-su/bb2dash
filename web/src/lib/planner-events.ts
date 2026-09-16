/**
 * bb2dash — planner events: kinds, the row shape, and boundary validation
 * (Phase 11b, Contract migration 067 + K-2/K-3/K-4).
 *
 * Pure. The query layer calls `validatePlannerEvent` before every write, and the
 * form calls it to show field-level errors; the rules are the database's own
 * checks restated, so a row the web accepts is a row Postgres accepts.
 *
 * Placement on the week grid is in `planner-events-grid.ts`; zone arithmetic is
 * in `planner-zone.ts`.
 */

import {
  DEFAULT_TIME_ZONE,
  addDaysIso,
  canonicalTimeZone,
  isValidTimeZone,
  localMidnight,
  wallClockIn,
} from './planner-zone';

/* ---------------------------------------------------------------------------
 * Kinds
 * ------------------------------------------------------------------------ */

/** `planner_event_kind`, in the Contract's order. */
export const PLANNER_EVENT_KINDS = [
  'event',
  'task',
  'out_of_office',
  'focus_time',
  'working_location',
  'appointment_slot',
] as const;

export type PlannerEventKind = (typeof PLANNER_EVENT_KINDS)[number];

/** K-6's labels, exactly — the same words the push puts in Google's title. */
export const PLANNER_EVENT_KIND_LABELS: Record<PlannerEventKind, string> = {
  event: 'Event',
  task: 'Task',
  out_of_office: 'Out of office',
  focus_time: 'Focus time',
  working_location: 'Working location',
  appointment_slot: 'Appointment slot',
};

export function isPlannerEventKind(value: unknown): value is PlannerEventKind {
  return typeof value === 'string' && (PLANNER_EVENT_KINDS as readonly string[]).includes(value);
}

export const LOCATION_KINDS = ['in_person', 'online'] as const;
export type PlannerLocationKind = (typeof LOCATION_KINDS)[number];

/* ---------------------------------------------------------------------------
 * Row shape
 * ------------------------------------------------------------------------ */

/**
 * One `planner_events` row, as the Contract's DDL (067) declares it.
 *
 * K-10: written by hand until 067 is on prod and `database.types.ts` can be
 * regenerated, then swapped for `Tables<'planner_events'>` in
 * `queries.plannerEvents.ts`. `location_kind` is a check constraint, not an
 * enum, so the generated type spells it `string | null`; this module narrows it
 * where it matters.
 */
export interface PlannerEventRow {
  id: string;
  kind: PlannerEventKind;
  title: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  all_day: boolean;
  location_kind: string | null;
  location: string | null;
  notes: string | null;
  done: boolean | null;
  course_id: string | null;
  created_at: string;
  updated_at: string;
}

/** The columns a create or a full edit writes. */
export type PlannerEventDraft = Pick<
  PlannerEventRow,
  | 'kind'
  | 'title'
  | 'starts_at'
  | 'ends_at'
  | 'time_zone'
  | 'all_day'
  | 'location_kind'
  | 'location'
  | 'notes'
  | 'done'
  | 'course_id'
>;

export type PlannerEventField = keyof PlannerEventDraft;

/* ---------------------------------------------------------------------------
 * Limits — the numbers in 067's checks
 * ------------------------------------------------------------------------ */

export const TITLE_MAX_LENGTH = 200;
export const NOTES_MAX_LENGTH = 2000;
export const LOCATION_MAX_LENGTH = 500;

/** K-4's online rule, case-insensitive like `~*`. */
const ONLINE_LOCATION = /^https?:\/\/\S+$/i;

/** Postgres counts characters (code points), not UTF-16 units. */
function charLength(text: string): number {
  return [...text].length;
}

/** Is this an http(s) URL a link may point at? */
export function isHttpUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && ONLINE_LOCATION.test(value);
}

/* ---------------------------------------------------------------------------
 * Validation
 * ------------------------------------------------------------------------ */

export type PlannerEventErrors = Partial<Record<PlannerEventField, string>>;

export type PlannerEventValidation =
  | { ok: true; value: PlannerEventDraft }
  | { ok: false; errors: PlannerEventErrors };

/** A write refused at the boundary, carrying one message per field. */
export class PlannerEventValidationError extends Error {
  readonly errors: PlannerEventErrors;

  constructor(errors: PlannerEventErrors) {
    super(Object.values(errors).join(' '));
    this.name = 'PlannerEventValidationError';
    this.errors = errors;
  }
}

/** Blank → null, otherwise trimmed. */
function optionalText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The draft as it may be written, or every reason it may not.
 *
 * Normalises only what cannot change meaning: the title, place and course are
 * trimmed, blank notes / location / course become null, and the zone takes
 * `Intl`'s letter case. Everything else is checked, not repaired.
 */
export function validatePlannerEvent(input: PlannerEventDraft): PlannerEventValidation {
  const errors: PlannerEventErrors = {};

  if (!isPlannerEventKind(input.kind)) errors.kind = 'Choose a kind.';

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (title === '') errors.title = 'Give it a title.';
  else if (charLength(title) > TITLE_MAX_LENGTH) {
    errors.title = `The title is limited to ${TITLE_MAX_LENGTH} characters.`;
  }

  const zone = canonicalTimeZone(input.time_zone);
  if (zone === null) errors.time_zone = 'Use an IANA zone such as America/New_York.';

  checkTimes(input, zone, errors);

  const location = optionalText(input.location);
  const locationKind = input.location_kind ?? null;
  checkLocation(location, locationKind, errors);

  const notes = optionalText(input.notes);
  if (notes !== null && charLength(notes) > NOTES_MAX_LENGTH) {
    errors.notes = `Notes are limited to ${NOTES_MAX_LENGTH} characters.`;
  }

  if (input.kind === 'task' && typeof input.done !== 'boolean') {
    errors.done = 'A task needs a done state.';
  } else if (input.kind !== 'task' && input.done !== null && input.done !== undefined) {
    errors.done = 'Only a task can be marked done.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      kind: input.kind,
      title,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      time_zone: zone as string,
      all_day: input.all_day,
      location_kind: location === null ? null : locationKind,
      location,
      notes,
      done: input.kind === 'task' ? input.done : null,
      course_id: optionalText(input.course_id),
    },
  };
}

function checkTimes(input: PlannerEventDraft, zone: string | null, errors: PlannerEventErrors) {
  const start = Date.parse(input.starts_at);
  const end = Date.parse(input.ends_at);
  if (!Number.isFinite(start)) {
    errors.starts_at = 'Choose a start.';
    return;
  }
  if (!Number.isFinite(end)) {
    errors.ends_at = 'Choose an end.';
    return;
  }
  if (typeof input.all_day !== 'boolean') {
    errors.all_day = 'All day must be on or off.';
    return;
  }
  if (!input.all_day) {
    if (end < start) errors.ends_at = 'The end cannot be before the start.';
    return;
  }
  // K-3: local midnights in the event's own zone, end date after start date.
  if (zone === null) return;
  if (!isLocalMidnight(input.starts_at, zone)) {
    errors.starts_at = 'An all-day event starts at midnight in its zone.';
  }
  if (!isLocalMidnight(input.ends_at, zone)) {
    errors.ends_at = 'An all-day event ends at midnight in its zone.';
  } else if (end <= start) {
    errors.ends_at = 'The last day cannot be before the first.';
  }
}

function isLocalMidnight(instant: string, zone: string): boolean {
  return wallClockIn(instant, zone)?.minute === 0;
}

function checkLocation(
  location: string | null,
  locationKind: string | null,
  errors: PlannerEventErrors,
) {
  if (locationKind !== null && !(LOCATION_KINDS as readonly string[]).includes(locationKind)) {
    errors.location_kind = 'Choose in person or online.';
    return;
  }
  if (locationKind === null && location !== null) {
    errors.location_kind = 'Say whether the location is in person or online.';
    return;
  }
  if (locationKind !== null && location === null) {
    errors.location =
      locationKind === 'online' ? 'Paste the meeting link.' : 'Name the place.';
    return;
  }
  if (location === null) return;
  if (charLength(location) > LOCATION_MAX_LENGTH) {
    errors.location = `The location is limited to ${LOCATION_MAX_LENGTH} characters.`;
  } else if (locationKind === 'online' && !isHttpUrl(location)) {
    errors.location = 'An online location is a link starting with http:// or https://.';
  }
}

/* ---------------------------------------------------------------------------
 * All-day dates (K-3)
 * ------------------------------------------------------------------------ */

export interface AllDayInstants {
  starts_at: string;
  ends_at: string;
}

/**
 * First and last day (inclusive, as the form shows them) → the stored pair:
 * 00:00 of the first day and 00:00 of the day *after* the last, in `zone`.
 *
 * Null when a date or the zone is invalid, the last day is before the first,
 * or a midnight does not exist in that zone on that date (a handful of zones
 * change their clocks at 00:00) — the database would refuse that row anyway.
 */
export function allDayInstants(
  firstDay: string,
  lastDay: string,
  zone: string,
): AllDayInstants | null {
  if (!isValidTimeZone(zone) || lastDay < firstDay) return null;
  const start = localMidnight(firstDay, zone);
  const end = localMidnight(addDaysIso(lastDay, 1), zone);
  if (!start || !end || start.resolution === 'gap' || end.resolution === 'gap') return null;
  return { starts_at: start.iso, ends_at: end.iso };
}

export interface AllDayDates {
  firstDay: string;
  /** Inclusive — the day before the stored exclusive end. */
  lastDay: string;
}

/** The stored exclusive pair → the inclusive dates the form and the band use. */
export function allDayDates(
  row: Pick<PlannerEventRow, 'starts_at' | 'ends_at' | 'time_zone'>,
): AllDayDates | null {
  const start = wallClockIn(row.starts_at, row.time_zone);
  const end = wallClockIn(row.ends_at, row.time_zone);
  if (!start || !end) return null;
  const lastDay = addDaysIso(end.date, -1);
  return { firstDay: start.date, lastDay: lastDay < start.date ? start.date : lastDay };
}

export { DEFAULT_TIME_ZONE };
