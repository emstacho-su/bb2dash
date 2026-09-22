'use client';

/**
 * The fields of `PlannerEventForm` (Phase 11b), split out so the form itself is
 * the save / delete flow and this file is the markup of each control.
 *
 * Every control is labelled, marks itself `aria-invalid` when its field has an
 * error, and points `aria-describedby` at the error and at any fold / gap note.
 */

import { useId, type ReactNode } from 'react';
import tokens from '@/styles/tokens.module.css';
import { courseCode, useCourses } from '@/lib/queries';
import { COMMON_TIME_ZONES } from '@/lib/planner-zone';
import { SERIES_FREQS, SERIES_FREQ_LABELS, type SeriesFreq } from '@/lib/planner-recurrence';
import {
  NO_REPEAT,
  OTHER_ZONE,
  type FormErrors,
  type PlannerEventFormState,
  type RepeatChoice,
} from './planner-event-form-state';
import styles from './PlannerEventForm.module.css';
interface ControlProps {
  id: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function Field({
  label,
  error,
  note,
  grow,
  children,
}: {
  label: string;
  error?: string;
  note?: string;
  grow?: boolean;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const describedBy = [error ? `${id}-error` : null, note ? `${id}-note` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={grow ? styles.fieldGrow : styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {note && (
        <span id={`${id}-note`} className={styles.note}>
          {note}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.error}>
          {error}
        </span>
      )}
    </div>
  );
}

export type Setter = <K extends keyof PlannerEventFormState>(
  field: K,
  value: PlannerEventFormState[K],
) => void;

export function WhenFields({
  state,
  set,
  errors,
  notes,
}: {
  state: PlannerEventFormState;
  set: Setter;
  errors: FormErrors;
  notes: FormErrors;
}) {
  return (
    <div className={styles.row}>
      <Field label={state.allDay ? 'First day' : 'Start date'} error={errors.start}>
        {(props) => (
          <input
            {...props}
            type="date"
            className={tokens.input}
            value={state.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        )}
      </Field>
      {!state.allDay && (
        <Field label="Start time" note={notes.start}>
          {(props) => (
            <input
              {...props}
              type="time"
              className={tokens.input}
              value={state.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          )}
        </Field>
      )}
      <Field label={state.allDay ? 'Last day' : 'End date'} error={errors.end}>
        {(props) => (
          <input
            {...props}
            type="date"
            className={tokens.input}
            value={state.endDate}
            onChange={(e) => set('endDate', e.target.value)}
          />
        )}
      </Field>
      {!state.allDay && (
        <Field label="End time" note={notes.end}>
          {(props) => (
            <input
              {...props}
              type="time"
              className={tokens.input}
              value={state.endTime}
              onChange={(e) => set('endTime', e.target.value)}
            />
          )}
        </Field>
      )}
    </div>
  );
}

export function ZoneField({
  state,
  set,
  error,
}: {
  state: PlannerEventFormState;
  set: Setter;
  error?: string;
}) {
  return (
    <div className={styles.row}>
      <Field label="Time zone" error={state.zoneChoice === OTHER_ZONE ? undefined : error}>
        {(props) => (
          <select
            {...props}
            className={tokens.input}
            value={state.zoneChoice}
            onChange={(e) => set('zoneChoice', e.target.value)}
          >
            {COMMON_TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll('_', ' ')}
              </option>
            ))}
            <option value={OTHER_ZONE}>Other zone…</option>
          </select>
        )}
      </Field>
      {state.zoneChoice === OTHER_ZONE && (
        <Field label="IANA zone name" error={error} grow>
          {(props) => (
            <input
              {...props}
              className={tokens.input}
              placeholder="Europe/Berlin"
              value={state.customZone}
              onChange={(e) => set('customZone', e.target.value)}
            />
          )}
        </Field>
      )}
    </div>
  );
}

/** The rule of a series already saved, as far as the planner knows it. */
export interface ExistingRepeat {
  freq: SeriesFreq | null;
  /** The last local date an occurrence may start on. */
  until: string | null;
}

/**
 * How to change a rule that is already saved. The tail ships no rule editor on
 * purpose (PM's call), so the form says what to do instead of hiding it.
 */
const LOCKED_NOTE =
  'How often it repeats cannot be changed here. Delete this and the following events, then create the new pattern.';

const UNKNOWN_RULE = 'This event is part of a repeating event.';

/**
 * "Repeats" and its end date (T-1).
 *
 * On a new event both are editable and the end date is required, with the
 * occurrence count live underneath. On an event already in a series they are
 * read-only: the rule is frozen for this tail.
 */
export function RepeatFields({
  state,
  set,
  errors,
  count,
  existing,
}: {
  state: PlannerEventFormState;
  set: Setter;
  errors: FormErrors;
  /** '12 occurrences', or undefined while the rule is incomplete. */
  count?: string;
  /** Edit mode: the saved rule, or null when this event does not repeat. */
  existing?: ExistingRepeat | null;
}) {
  if (existing) {
    // Read into consts: the callbacks below are closures, and a narrowed
    // parameter property does not stay narrowed inside one.
    const { freq, until } = existing;
    if (freq === null) {
      return (
        <p className={styles.note}>
          {UNKNOWN_RULE} {LOCKED_NOTE}
        </p>
      );
    }
    return (
      <div className={styles.row}>
        <Field label="Repeats" note={LOCKED_NOTE}>
          {(props) => (
            <select {...props} className={tokens.input} value={freq} disabled>
              <option value={freq}>{SERIES_FREQ_LABELS[freq]}</option>
            </select>
          )}
        </Field>
        {until !== null && (
          <Field label="Ends on">
            {(props) => (
              <input {...props} type="date" className={tokens.input} value={until} readOnly disabled />
            )}
          </Field>
        )}
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <Field label="Repeats" error={errors.repeat}>
        {(props) => (
          <select
            {...props}
            className={tokens.input}
            value={state.repeat}
            onChange={(e) => set('repeat', e.target.value as RepeatChoice)}
          >
            <option value={NO_REPEAT}>Does not repeat</option>
            {SERIES_FREQS.map((freq) => (
              <option key={freq} value={freq}>
                {SERIES_FREQ_LABELS[freq]}
              </option>
            ))}
          </select>
        )}
      </Field>
      {state.repeat !== NO_REPEAT && (
        <Field label="Ends on" error={errors.repeatUntil} note={count}>
          {(props) => (
            <input
              {...props}
              type="date"
              className={tokens.input}
              value={state.repeatUntil}
              onChange={(e) => set('repeatUntil', e.target.value)}
            />
          )}
        </Field>
      )}
    </div>
  );
}

export function LocationFields({
  state,
  set,
  errors,
}: {
  state: PlannerEventFormState;
  set: Setter;
  errors: FormErrors;
}) {
  return (
    <div className={styles.row}>
      <Field label="Location" error={errors.locationKind}>
        {(props) => (
          <select
            {...props}
            className={tokens.input}
            value={state.locationKind}
            onChange={(e) =>
              set('locationKind', e.target.value as PlannerEventFormState['locationKind'])
            }
          >
            <option value="">None</option>
            <option value="in_person">In person</option>
            <option value="online">Online link</option>
          </select>
        )}
      </Field>
      {state.locationKind !== '' && (
        <Field
          label={state.locationKind === 'online' ? 'Meeting link' : 'Place'}
          error={errors.location}
          grow
        >
          {(props) => (
            <input
              {...props}
              type={state.locationKind === 'online' ? 'url' : 'text'}
              className={tokens.input}
              placeholder={state.locationKind === 'online' ? 'https://…' : 'Hinds Hall 010'}
              value={state.location}
              onChange={(e) => set('location', e.target.value)}
            />
          )}
        </Field>
      )}
    </div>
  );
}

export function CourseField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const courses = useCourses();
  const list = courses.data ?? [];
  const known = value === '' || list.some((course) => course.id === value);
  return (
    <Field label="Course (optional)" error={error ?? (courses.error ? 'Courses could not be loaded.' : undefined)}>
      {(props) => (
        <select {...props} className={tokens.input} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No course</option>
          {!known && <option value={value}>{value}</option>}
          {list.map((course) => (
            <option key={course.id} value={course.id}>
              {courseCode(course)}
              {course.title_short ? ` · ${course.title_short}` : ''}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DeleteControl({
  confirming,
  pending,
  onAsk,
  onCancel,
  onConfirm,
}: {
  confirming: boolean;
  pending: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!confirming) {
    return (
      <button type="button" className={styles.delete} onClick={onAsk} disabled={pending}>
        Delete
      </button>
    );
  }
  return (
    <span className={styles.confirm} role="group" aria-label="Confirm delete">
      <span>Delete it here and from Google Calendar?</span>
      <button type="button" className={styles.delete} onClick={onConfirm} disabled={pending}>
        Yes, delete
      </button>
      <button type="button" className={tokens.btnGhost} onClick={onCancel}>
        Keep it
      </button>
    </span>
  );
}
