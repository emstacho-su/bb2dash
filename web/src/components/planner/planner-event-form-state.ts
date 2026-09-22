/**
 * `PlannerEventForm`'s state, as plain values and pure functions (Phase 11b).
 *
 * The form edits wall clocks in the event's own zone; the row stores instants.
 * `draftFromForm` is the one place the form converts, through the `Intl` helper
 * with Temporal's `compatible` rule, and it reports a fold or a gap so the form
 * can say so under the field. An all-day event shows an inclusive last day and
 * is stored with an exclusive end (K-3).
 *
 * EDITING KEEPS WHAT WAS SAVED (R2-4). A stored instant is only re-derived from
 * its wall clock when that wall clock (or the zone, or all-day) was changed. An
 * event saved at the *second* 01:30 of the 2026-11-01 fold reads back as 01:30,
 * and re-converting 01:30 would pick the first one and move the event an hour
 * although only its title was edited.
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
import {
  expandSeries,
  seriesOccurrenceDates,
  type SeriesErrorField,
  type SeriesFreq,
} from '@/lib/planner-recurrence';
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

/** A saved row's instants and the wall clocks the form showed them as. */
export interface StoredTimes {
  allDay: boolean;
  zone: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  starts_at: string;
  ends_at: string;
}

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
  /** T-1: the rule a new event repeats on. Offered on create only. */
  repeat: RepeatChoice;
  /** T-1: the last local date an occurrence may start on. Required when it repeats. */
  repeatUntil: string;
  /** Edit mode: what was saved, so unchanged times keep their exact instants. */
  stored: StoredTimes | null;
}

/** The "Repeats" picker's values: the frequencies, plus not repeating at all. */
export type RepeatChoice = 'none' | SeriesFreq;

export const NO_REPEAT = 'none';

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
  | 'courseId'
  | 'repeat'
  | 'repeatUntil';

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

const BLANK: Omit<PlannerEventFormState, 'startDate' | 'endDate' | 'allDay' | 'stored'> = {
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
  repeat: NO_REPEAT,
  repeatUntil: '',
};

/** A new event from a slot: that date, that start, +60 minutes, New York. */
export function formStateFromPrefill(prefill: PlannerEventPrefill): PlannerEventFormState {
  if (prefill.allDay) {
    return { ...BLANK, allDay: true, startDate: prefill.date, endDate: prefill.date, stored: null };
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
    stored: null,
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

  const shown = row.all_day ? allDayFields(row) : timedFields(row);
  return {
    ...base,
    ...shown,
    stored: {
      ...shown,
      allDay: row.all_day,
      zone: row.time_zone,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
    },
  };
}

type ShownTimes = Pick<PlannerEventFormState, 'startDate' | 'startTime' | 'endDate' | 'endTime'>;

function allDayFields(row: PlannerEventRow): ShownTimes {
  const dates = allDayDates(row);
  const fallback = newYorkWallClock(row.starts_at)?.iso ?? '';
  return {
    startDate: dates?.firstDay ?? fallback,
    startTime: DEFAULT_START,
    endDate: dates?.lastDay ?? fallback,
    endTime: DEFAULT_END,
  };
}

function timedFields(row: PlannerEventRow): ShownTimes {
  const start = wallClockIn(row.starts_at, row.time_zone);
  const end = wallClockIn(row.ends_at, row.time_zone);
  return {
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

/** Which form field shows a validation message about a column. */
export const FIELD_OF: Partial<Record<keyof PlannerEventDraft, FormField>> = {
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
    const stored = unchangedStored(state, zone, true);
    if (stored && state.startDate === stored.startDate && state.endDate === stored.endDate) {
      return { starts_at: stored.starts_at, ends_at: stored.ends_at };
    }
    const range = allDayInstants(state.startDate, state.endDate, zone);
    if (!range) errors.start = 'Choose real dates.';
    return range;
  }

  const stored = unchangedStored(state, zone, false);
  const keepStart =
    stored !== null && state.startDate === stored.startDate && state.startTime === stored.startTime;
  const keepEnd =
    stored !== null && state.endDate === stored.endDate && state.endTime === stored.endTime;

  const start = keepStart ? null : wallClockToInstant(state.startDate, state.startTime, zone);
  const end = keepEnd ? null : wallClockToInstant(state.endDate, state.endTime, zone);
  if (!keepStart && !start) errors.start = 'Choose a start date and time.';
  if (!keepEnd && !end) errors.end = 'Choose an end date and time.';
  if (errors.start || errors.end) return null;
  if (start) notes.start = resolutionNote(state.startDate, state.startTime, zone, start);
  if (end) notes.end = resolutionNote(state.endDate, state.endTime, zone, end);
  return {
    starts_at: start?.iso ?? (stored as StoredTimes).starts_at,
    ends_at: end?.iso ?? (stored as StoredTimes).ends_at,
  };
}

/** The saved times, when the zone and the all-day switch are as they were saved. */
function unchangedStored(
  state: PlannerEventFormState,
  zone: string,
  allDay: boolean,
): StoredTimes | null {
  const stored = state.stored;
  return stored !== null && stored.allDay === allDay && stored.zone === zone ? stored : null;
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

/* ---------------------------------------------------------------------------
 * Repeats (T-1)
 * ------------------------------------------------------------------------ */

/** A whole series, ready for `planner_series_create`. */
export interface FormSeries {
  freq: SeriesFreq;
  until: string;
  rows: readonly PlannerEventDraft[];
}

export type SeriesFormResult =
  | {
      ok: true;
      /** How many occurrences the rule names, or null when it does not repeat. */
      count: number | null;
      /** The finished rows — only once the event itself is valid. */
      series: FormSeries | null;
    }
  | { ok: false; errors: FormErrors };

/** Which form field a recurrence refusal belongs under. */
const REPEAT_FIELD_OF: Record<SeriesErrorField, FormField> = {
  freq: 'repeat',
  until: 'repeatUntil',
  start: 'start',
};

function repeatError(field: SeriesErrorField, message: string): SeriesFormResult {
  return { ok: false, errors: { [REPEAT_FIELD_OF[field]]: message } };
}

/**
 * The repeat the form describes, expanded into finished rows — or the one
 * message that says why it cannot be. A draft that does not repeat is not an
 * error: it comes back as `series: null`.
 *
 * `draft` is null while the event itself is still invalid (no title yet, say).
 * The rule is still checked and still counted then, from the dates alone, so
 * the end date and the 52 cap are answered as they are typed rather than
 * waiting for the rest of the form to be finished.
 *
 * This runs on every keystroke; it is bounded at 53 dates, so that costs
 * nothing.
 */
export function seriesFromForm(
  state: PlannerEventFormState,
  draft: PlannerEventDraft | null,
): SeriesFormResult {
  if (state.repeat === NO_REPEAT) return { ok: true, count: null, series: null };

  if (draft === null) {
    const dates = seriesOccurrenceDates(state.startDate, state.repeat, state.repeatUntil);
    return dates.ok
      ? { ok: true, count: dates.dates.length, series: null }
      : repeatError(dates.error.field, dates.error.message);
  }

  const expanded = expandSeries(draft, state.repeat, state.repeatUntil, draft.time_zone);
  if (!expanded.ok) return repeatError(expanded.error.field, expanded.error.message);
  return {
    ok: true,
    count: expanded.rows.length,
    series: { freq: state.repeat, until: state.repeatUntil, rows: expanded.rows },
  };
}

/** 'Repeats 12 times' — what the form says live under the end date. */
export function occurrenceCountText(count: number): string {
  return count === 1 ? '1 occurrence' : `${count} occurrences`;
}
