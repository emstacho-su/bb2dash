/**
 * `PlannerEventForm`'s state, as plain values and pure functions (Phase 11b).
 *
 * The form edits wall clocks in the event's own zone; the row stores instants.
 * `draftFromForm` is the one place the form converts, through the `Intl` helper
 * with Temporal's `compatible` rule, and it reports a fold or a gap so the form
 * can say so under the field. An all-day event shows an inclusive last day and
 * is stored with an exclusive end (K-3).
 */

import {
  allDayDates,
  allDayInstants,
  validatePlannerEvent,
  type PlannerEventDraft,
  type PlannerEventKind,
  type PlannerEventRow,
} from '@/lib/planner-events';
import { shiftIso } from '@/components/tracker/anchor';
import { newYorkWallClock } from '@/lib/planner-week';
import {
  COMMON_TIME_ZONES,
  DEFAULT_TIME_ZONE,
  isValidTimeZone,
  wallClockIn,
  wallClockToInstant,
  type ResolvedInstant,
} from '@/lib/planner-zone';

/** The zone picker's value for "type a zone". */
export const OTHER_ZONE = 'other';
/** A new timed event lasts an hour (K-9). */
export const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_START = '09:00';
const DEFAULT_END = '10:00';

export interface PlannerEventFormState {
  kind: PlannerEventKind;
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  /** Timed: the end's date. All-day: the last day, inclusive. */
  endDate: string;
  endTime: string;
  /** One of `COMMON_TIME_ZONES`, or `OTHER_ZONE`. */
  zoneChoice: string;
  customZone: string;
  locationKind: '' | 'in_person' | 'online';
  location: string;
  notes: string;
  done: boolean;
  courseId: string;
}

/** The form's own fields, which errors and notes are keyed on. */
export type FormField =
  | 'kind'
  | 'title'
  | 'start'
  | 'end'
  | 'zone'
  | 'locationKind'
  | 'location'
  | 'notes'
  | 'done'
  | 'courseId';

export type FormErrors = Partial<Record<FormField, string>>;

/* ---------------------------------------------------------------------------
 * Initial state
 * ------------------------------------------------------------------------ */

/** Where a create starts: a half-hour slot, or an Events band cell. */
export type PlannerEventPrefill =
  | { allDay: false; date: string; startMinute: number }
  | { allDay: true; date: string };

const pad = (value: number) => String(value).padStart(2, '0');

function clockText(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

function zoneFields(zone: string): Pick<PlannerEventFormState, 'zoneChoice' | 'customZone'> {
  return COMMON_TIME_ZONES.includes(zone)
    ? { zoneChoice: zone, customZone: '' }
    : { zoneChoice: OTHER_ZONE, customZone: zone };
}

const BLANK: Omit<PlannerEventFormState, 'startDate' | 'endDate' | 'allDay'> = {
  kind: 'event',
  title: '',
  startTime: DEFAULT_START,
  endTime: DEFAULT_END,
  zoneChoice: DEFAULT_TIME_ZONE,
  customZone: '',
  locationKind: '',
  location: '',
  notes: '',
  done: false,
  courseId: '',
};

/** A new event from a slot: that date, that start, +60 minutes, New York. */
export function formStateFromPrefill(prefill: PlannerEventPrefill): PlannerEventFormState {
  if (prefill.allDay) {
    return { ...BLANK, allDay: true, startDate: prefill.date, endDate: prefill.date };
  }
  const endMinute = prefill.startMinute + DEFAULT_DURATION_MINUTES;
  const dayCarry = Math.floor(endMinute / (24 * 60));
  return {
    ...BLANK,
    allDay: false,
    startDate: prefill.date,
    startTime: clockText(prefill.startMinute),
    endDate: shiftIso(prefill.date, dayCarry),
    endTime: clockText(endMinute % (24 * 60)),
  };
}

/** An existing row, read back as wall clocks in its own zone. */
export function formStateFromRow(row: PlannerEventRow): PlannerEventFormState {
  const base = {
    ...BLANK,
    ...zoneFields(row.time_zone),
    kind: row.kind,
    title: row.title,
    allDay: row.all_day,
    locationKind:
      row.location_kind === 'in_person' || row.location_kind === 'online' ? row.location_kind : '',
    location: row.location ?? '',
    notes: row.notes ?? '',
    done: row.done === true,
    courseId: row.course_id ?? '',
  } as const;

  if (row.all_day) {
    const dates = allDayDates(row);
    const fallback = newYorkWallClock(row.starts_at)?.iso ?? '';
    return {
      ...base,
      startDate: dates?.firstDay ?? fallback,
      endDate: dates?.lastDay ?? fallback,
    };
  }
  const start = wallClockIn(row.starts_at, row.time_zone);
  const end = wallClockIn(row.ends_at, row.time_zone);
  return {
    ...base,
    startDate: start?.date ?? '',
    startTime: start?.time ?? DEFAULT_START,
    endDate: end?.date ?? start?.date ?? '',
    endTime: end?.time ?? DEFAULT_END,
  };
}

/**
 * A field change, with the one convenience the form owes: moving the start
 * date carries an end date that was on the same day along with it.
 */
export function updateForm<K extends keyof PlannerEventFormState>(
  state: PlannerEventFormState,
  field: K,
  value: PlannerEventFormState[K],
): PlannerEventFormState {
  if (field === 'startDate' && state.endDate === state.startDate) {
    return { ...state, startDate: value as string, endDate: value as string };
  }
  return { ...state, [field]: value };
}

/* ---------------------------------------------------------------------------
 * Form → draft
 * ------------------------------------------------------------------------ */

export function selectedZone(state: PlannerEventFormState): string {
  return state.zoneChoice === OTHER_ZONE ? state.customZone.trim() : state.zoneChoice;
}

export type DraftResult =
  | { ok: true; draft: PlannerEventDraft; notes: FormErrors }
  | { ok: false; errors: FormErrors; notes: FormErrors };

const FIELD_OF: Partial<Record<keyof PlannerEventDraft, FormField>> = {
  kind: 'kind',
  title: 'title',
  starts_at: 'start',
  ends_at: 'end',
  all_day: 'start',
  time_zone: 'zone',
  location_kind: 'locationKind',
  location: 'location',
  notes: 'notes',
  done: 'done',
  course_id: 'courseId',
};

const TIME_COLUMNS = new Set(['starts_at', 'ends_at', 'all_day']);

/** What the form says under a time that was a fold or a gap. */
export function resolutionNote(
  date: string,
  time: string,
  zone: string,
  resolved: ResolvedInstant,
): string | undefined {
  if (resolved.resolution === 'fold') {
    return `${time} happens twice on ${date} in ${zone} (clocks go back); the earlier one is used.`;
  }
  if (resolved.resolution === 'gap') {
    return `${time} does not exist on ${date} in ${zone} (clocks skip ahead); it will be saved as ${resolved.wall.time}.`;
  }
  return undefined;
}

function instants(state: PlannerEventFormState, zone: string, errors: FormErrors, notes: FormErrors) {
  // With no usable zone there is no instant to name; the zone error says why.
  if (!isValidTimeZone(zone)) return null;
  if (state.allDay) {
    if (!state.startDate) errors.start = 'Choose the first day.';
    if (!state.endDate) errors.end = 'Choose the last day.';
    if (errors.start || errors.end) return null;
    if (state.endDate < state.startDate) {
      errors.end = 'The last day cannot be before the first.';
      return null;
    }
    const range = allDayInstants(state.startDate, state.endDate, zone);
    if (!range) errors.start = 'Choose real dates.';
    return range;
  }

  const start = wallClockToInstant(state.startDate, state.startTime, zone);
  const end = wallClockToInstant(state.endDate, state.endTime, zone);
  if (!start) errors.start = 'Choose a start date and time.';
  if (!end) errors.end = 'Choose an end date and time.';
  if (!start || !end) return null;
  notes.start = resolutionNote(state.startDate, state.startTime, zone, start);
  notes.end = resolutionNote(state.endDate, state.endTime, zone, end);
  return { starts_at: start.iso, ends_at: end.iso };
}

/** Convert once, validate once; errors come back keyed on the form's fields. */
export function draftFromForm(state: PlannerEventFormState): DraftResult {
  const errors: FormErrors = {};
  const notes: FormErrors = {};
  const zone = selectedZone(state);

  const times = instants(state, zone, errors, notes);
  const draft: PlannerEventDraft = {
    kind: state.kind,
    title: state.title,
    // A missing instant is left blank so the validator names every other
    // problem too; the time errors above already say what is wrong.
    starts_at: times?.starts_at ?? '',
    ends_at: times?.ends_at ?? '',
    time_zone: zone,
    all_day: state.allDay,
    location_kind: state.locationKind === '' ? null : state.locationKind,
    location: state.locationKind === '' ? null : state.location,
    notes: state.notes,
    done: state.kind === 'task' ? state.done : null,
    course_id: state.courseId === '' ? null : state.courseId,
  };

  const result = validatePlannerEvent(draft);
  if (!result.ok) {
    for (const [column, message] of Object.entries(result.errors)) {
      // Blank instants were left blank on purpose; their cause is already named.
      if (times === null && TIME_COLUMNS.has(column)) continue;
      const field = FIELD_OF[column as keyof PlannerEventDraft];
      if (field && !errors[field]) errors[field] = message;
    }
  }
  if (Object.keys(errors).length > 0 || !result.ok) return { ok: false, errors, notes: clean(notes) };
  return { ok: true, draft: result.value, notes: clean(notes) };
}

function clean(notes: FormErrors): FormErrors {
  return Object.fromEntries(Object.entries(notes).filter(([, text]) => text !== undefined));
}
