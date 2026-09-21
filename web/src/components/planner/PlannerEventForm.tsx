'use client';

/**
 * `PlannerEventForm` — create or edit one planner event (Phase 11b).
 *
 * A dialog on the shared `PopoutShell`, so Esc, the backdrop, the focus trap and
 * the ✕ behave as every other popout does. The planner hands it an `onClose`
 * that also puts focus back on the slot or block that opened it.
 *
 * The form does not own its writes: `usePlannerEventEditor` does, and it
 * outlives the dialog. Closing while a save is in flight is allowed, and a
 * rejection that lands after the dialog has gone is reported in the grid's
 * alert instead of vanishing with the form (R2-6).
 *
 * Wall clocks are typed in the event's own zone and converted once, in
 * `draftFromForm`; a time that falls in the fall-back fold or the spring-forward
 * gap is explained under its field. Errors are shown per field after the first
 * save attempt. Saving is what puts the event on the `bb2dash` Google calendar,
 * so Delete asks once before it removes anything.
 */

import { useState, type FormEvent } from 'react';
import tokens from '@/styles/tokens.module.css';
import { PopoutShell } from '@/components/popout/PopoutShell';
import {
  PLANNER_EVENT_KINDS,
  PLANNER_EVENT_KIND_LABELS,
  type PlannerEventDraft,
  type PlannerEventKind,
  type PlannerEventRow,
} from '@/lib/planner-events';
import {
  draftFromForm,
  formStateFromPrefill,
  formStateFromRow,
  occurrenceCountText,
  seriesFromForm,
  updateForm,
  type FormErrors,
  type FormSeries,
  type PlannerEventFormState,
  type PlannerEventPrefill,
} from './planner-event-form-state';
import {
  CourseField,
  DeleteControl,
  Field,
  LocationFields,
  RepeatFields,
  WhenFields,
  ZoneField,
  type ExistingRepeat,
} from './PlannerEventFormFields';
import styles from './PlannerEventForm.module.css';

export type PlannerEventFormMode =
  | { mode: 'create'; prefill: PlannerEventPrefill }
  | { mode: 'edit'; event: PlannerEventRow };

/**
 * The 067 trigger's zone refusal ('planner_events: time_zone … is not an IANA
 * zone name'). The web applies the same rule first, so this only fires for a
 * zone `Intl` knows and the server's zone database does not.
 */
const SERVER_ZONE_REFUSAL = /\btime_zone\b/;

export interface PlannerEventFormProps {
  target: PlannerEventFormMode;
  onClose: () => void;
  /**
   * Create or update, depending on `target`. `series` is the whole expansion
   * when a new event repeats, and null otherwise; the editor decides which
   * write that becomes.
   */
  onSave: (draft: PlannerEventDraft, series: FormSeries | null) => void;
  onDelete: (event: PlannerEventRow) => void;
  /** Edit mode: the saved rule when this event is in a series (T-1). */
  existingRepeat?: ExistingRepeat | null;
  /** A write from this dialog is in flight. */
  pending: boolean;
  /** Why this dialog's last write was refused, if it was. */
  error: Error | null;
}

export function PlannerEventForm({
  target,
  onClose,
  onSave,
  onDelete,
  pending,
  error,
  existingRepeat = null,
}: PlannerEventFormProps) {
  const [state, setState] = useState<PlannerEventFormState>(() =>
    target.mode === 'create' ? formStateFromPrefill(target.prefill) : formStateFromRow(target.event),
  );
  const [attempted, setAttempted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const result = draftFromForm(state);
  // The repeat is expanded on every keystroke: it is what the count line says,
  // and it is bounded at 53 dates, so it costs nothing to keep live.
  const repeat = seriesFromForm(state, result.ok ? result.draft : null);
  const zoneRefused = error !== null && SERVER_ZONE_REFUSAL.test(error.message);
  const errors: FormErrors = {
    ...(attempted && !result.ok ? result.errors : {}),
    ...(repeat.ok ? {} : repeat.errors),
    ...(zoneRefused ? { zone: 'The calendar database does not know this zone; choose another.' } : {}),
  };
  const count = repeat.ok && repeat.count !== null ? occurrenceCountText(repeat.count) : undefined;

  const set = <K extends keyof PlannerEventFormState>(field: K, value: PlannerEventFormState[K]) =>
    setState((current) => updateForm(current, field, value));

  function save(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (!result.ok || pending) return;
    // A repeat that will not expand is never sent: 52 occurrences reach Stack's
    // real Google calendar, so a half-built rule must not be saved as one event.
    if (!repeat.ok) return;
    onSave(result.draft, repeat.series);
  }

  const heading = target.mode === 'create' ? 'New planner event' : 'Edit planner event';

  return (
    <PopoutShell label={heading} onClose={onClose}>
      <form className={styles.form} onSubmit={save} noValidate>
        <h2 className={styles.heading}>{heading}</h2>

        <div className={styles.row}>
          <Field label="Kind" error={errors.kind}>
            {(props) => (
              <select
                {...props}
                className={tokens.input}
                value={state.kind}
                onChange={(e) => set('kind', e.target.value as PlannerEventKind)}
              >
                {PLANNER_EVENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {PLANNER_EVENT_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Title" error={errors.title} grow>
            {(props) => (
              <input
                {...props}
                className={tokens.input}
                value={state.title}
                onChange={(e) => set('title', e.target.value)}
              />
            )}
          </Field>
        </div>

        {state.kind === 'task' && (
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={state.done}
              onChange={(e) => set('done', e.target.checked)}
            />
            Done
          </label>
        )}

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={state.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
          />
          All day
        </label>

        <WhenFields state={state} set={set} errors={errors} notes={result.notes} />
        <ZoneField state={state} set={set} error={errors.zone} />
        {/* A rule is set once, on a new event; an existing series shows it read-only. */}
        {target.mode === 'create' ? (
          <RepeatFields state={state} set={set} errors={errors} count={count} />
        ) : (
          existingRepeat !== null && (
            <RepeatFields state={state} set={set} errors={errors} existing={existingRepeat} />
          )
        )}
        <LocationFields state={state} set={set} errors={errors} />
        <CourseField value={state.courseId} onChange={(v) => set('courseId', v)} error={errors.courseId} />

        <Field label="Notes" error={errors.notes}>
          {(props) => (
            <textarea
              {...props}
              className={`${tokens.input} ${styles.notes}`}
              value={state.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          )}
        </Field>

        {error !== null && !zoneRefused && (
          <p className={styles.serverError} role="alert">
            Could not save: {error.message}
          </p>
        )}

        <div className={styles.actions}>
          {target.mode === 'edit' && (
            <DeleteControl
              confirming={confirmingDelete}
              pending={pending}
              onAsk={() => setConfirmingDelete(true)}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={() => onDelete(target.event)}
            />
          )}
          <button type="button" className={tokens.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={tokens.btnPrimary} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </PopoutShell>
  );
}
