'use client';

/**
 * `PlannerEventForm` — create or edit one planner event (Phase 11b).
 *
 * A dialog on the shared `PopoutShell`, so Esc, the backdrop, the focus trap and
 * the ✕ behave as every other popout does. The planner hands it an `onClose`
 * that also puts focus back on the slot or block that opened it.
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
  PlannerEventValidationError,
  type PlannerEventKind,
  type PlannerEventRow,
} from '@/lib/planner-events';
import {
  useCreatePlannerEvent,
  useDeletePlannerEvent,
  useUpdatePlannerEvent,
} from '@/lib/queries.plannerEvents';
import {
  draftFromForm,
  formStateFromPrefill,
  formStateFromRow,
  updateForm,
  type FormErrors,
  type FormField,
  type PlannerEventFormState,
  type PlannerEventPrefill,
} from './planner-event-form-state';
import {
  CourseField,
  DeleteControl,
  Field,
  LocationFields,
  WhenFields,
  ZoneField,
} from './PlannerEventFormFields';
import styles from './PlannerEventForm.module.css';

export type PlannerEventFormMode =
  | { mode: 'create'; prefill: PlannerEventPrefill }
  | { mode: 'edit'; event: PlannerEventRow };

const COLUMN_FIELD: Record<string, FormField> = {
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

export function PlannerEventForm({
  target,
  onClose,
}: {
  target: PlannerEventFormMode;
  onClose: () => void;
}) {
  const [state, setState] = useState<PlannerEventFormState>(() =>
    target.mode === 'create' ? formStateFromPrefill(target.prefill) : formStateFromRow(target.event),
  );
  const [attempted, setAttempted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const create = useCreatePlannerEvent();
  const update = useUpdatePlannerEvent();
  const remove = useDeletePlannerEvent();
  const pending = create.isPending || update.isPending || remove.isPending;

  const result = draftFromForm(state);
  const serverError = create.error ?? update.error ?? remove.error ?? null;
  const errors: FormErrors = attempted
    ? { ...(result.ok ? {} : result.errors), ...fieldErrorsOf(serverError) }
    : {};

  const set = <K extends keyof PlannerEventFormState>(field: K, value: PlannerEventFormState[K]) =>
    setState((current) => updateForm(current, field, value));

  function save(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (!result.ok || pending) return;
    if (target.mode === 'create') {
      create.mutate(result.draft, { onSuccess: onClose });
    } else {
      update.mutate({ current: target.event, patch: result.draft }, { onSuccess: onClose });
    }
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

        {serverError && !(serverError instanceof PlannerEventValidationError) && (
          <p className={styles.serverError} role="alert">
            Could not save: {serverError.message}
          </p>
        )}

        <div className={styles.actions}>
          {target.mode === 'edit' && (
            <DeleteControl
              confirming={confirmingDelete}
              pending={pending}
              onAsk={() => setConfirmingDelete(true)}
              onCancel={() => setConfirmingDelete(false)}
              onConfirm={() => remove.mutate(target.event, { onSuccess: onClose })}
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

/** Field errors the mutation itself refused with (the same rules, re-checked). */
function fieldErrorsOf(error: Error | null): FormErrors {
  if (!(error instanceof PlannerEventValidationError)) return {};
  return Object.fromEntries(
    Object.entries(error.errors).map(([column, message]) => [COLUMN_FIELD[column], message]),
  );
}
