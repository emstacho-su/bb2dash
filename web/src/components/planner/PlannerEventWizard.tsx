'use client';

/**
 * `PlannerEventWizard` — the planner header's "+" (R3-9): a new event one step
 * at a time, the way Google Calendar walks through one.
 *
 *   1 Kind · 2 When (title, dates, times, all day, zone) · 3 Repeats ·
 *   4 Details (location, notes, course) · 5 Review and save
 *
 * It is the grid form in another shape, not a second form. The state is
 * `PlannerEventFormState`, the fields are `PlannerEventFormFields`, validation
 * is `draftFromForm` / `seriesFromForm`, and the save is the `onSave` that
 * `usePlannerEventEditor` hands the grid form, called with the same draft and
 * series — so one input saves one way whichever door it came in by.
 *
 * Next is disabled until the current step's fields are valid; Back and Next
 * keep everything entered. Escape (and ✕, and the backdrop) close at once when
 * nothing was entered, and ask first when something was.
 */

import { useState, type FormEvent } from 'react';
import tokens from '@/styles/tokens.module.css';
import { PopoutShell } from '@/components/popout/PopoutShell';
import {
  PLANNER_EVENT_KINDS,
  PLANNER_EVENT_KIND_LABELS,
} from '@/lib/planner-events';
import { SERIES_FREQ_LABELS } from '@/lib/planner-recurrence';
import {
  NO_REPEAT,
  draftFromForm,
  formStateFromPrefill,
  occurrenceCountText,
  selectedZone,
  seriesFromForm,
  updateForm,
  type FormErrors,
  type FormField,
  type PlannerEventFormState,
} from './planner-event-form-state';
import {
  CourseField,
  Field,
  LocationFields,
  RepeatFields,
  WhenFields,
  ZoneField,
} from './PlannerEventFormFields';
import type { PlannerEventFormMode, PlannerEventFormProps } from './PlannerEventForm';
import formStyles from './PlannerEventForm.module.css';
import styles from './PlannerEventWizard.module.css';

export type PlannerEventWizardProps = Omit<PlannerEventFormProps, 'target' | 'existingRepeat'> & {
  /** The wizard only creates; an existing event opens the grid form. */
  target: Extract<PlannerEventFormMode, { mode: 'create' }>;
};

const STEPS = ['Kind', 'When', 'Repeats', 'Details', 'Review'] as const;
const LAST_STEP = STEPS.length - 1;

/** The fields each step owns, whose errors hold its Next. */
const STEP_FIELDS: readonly (readonly FormField[])[] = [
  ['kind'],
  ['title', 'start', 'end', 'zone'],
  ['repeat', 'repeatUntil'],
  ['locationKind', 'location', 'notes', 'courseId', 'done'],
  [],
];

const LOCATION_LABELS: Record<Exclude<PlannerEventFormState['locationKind'], ''>, string> = {
  in_person: 'In person',
  online: 'Online link',
};

function pick(errors: FormErrors, fields: readonly FormField[]): FormErrors {
  return Object.fromEntries(fields.filter((field) => errors[field]).map((field) => [field, errors[field]]));
}

export function PlannerEventWizard({ target, onClose, onSave, pending, error }: PlannerEventWizardProps) {
  const [initial] = useState<PlannerEventFormState>(() => formStateFromPrefill(target.prefill));
  const [state, setState] = useState<PlannerEventFormState>(initial);
  const [step, setStep] = useState(0);
  /** Steps the reader has typed on: their errors show from then on. */
  const [touched, setTouched] = useState<ReadonlySet<number>>(() => new Set());
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const result = draftFromForm(state);
  const repeat = seriesFromForm(state, result.ok ? result.draft : null);
  const draftErrors = result.ok ? {} : result.errors;
  const repeatErrors = repeat.ok ? {} : repeat.errors;
  const allErrors: FormErrors = { ...draftErrors, ...repeatErrors };

  const stepErrors = pick(allErrors, STEP_FIELDS[step] ?? []);
  const stepValid = step === LAST_STEP ? result.ok && repeat.ok : Object.keys(stepErrors).length === 0;
  // A repeat's errors are shown live, as the grid form shows them; the rest
  // wait until the reader has typed on the step.
  const shownErrors: FormErrors = touched.has(step) ? stepErrors : pick(repeatErrors, STEP_FIELDS[step] ?? []);
  const count = repeat.ok && repeat.count !== null ? occurrenceCountText(repeat.count) : undefined;

  const set = <K extends keyof PlannerEventFormState>(field: K, value: PlannerEventFormState[K]) => {
    setState((current) => updateForm(current, field, value));
    setTouched((current) => (current.has(step) ? current : new Set([...current, step])));
  };

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);
  const requestClose = () => {
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  };

  function advance(event: FormEvent) {
    event.preventDefault();
    if (!stepValid) return;
    if (step < LAST_STEP) {
      setStep(step + 1);
      return;
    }
    if (pending || !result.ok || !repeat.ok) return;
    onSave(result.draft, repeat.series);
  }

  return (
    <PopoutShell label="New planner event" onClose={requestClose}>
      <form className={formStyles.form} onSubmit={advance} noValidate>
        <h2 className={formStyles.heading}>New planner event</h2>
        <ol className={styles.steps} aria-label="Steps">
          {STEPS.map((name, index) => (
            <li
              key={name}
              className={index === step ? styles.stepCurrent : styles.step}
              aria-current={index === step ? 'step' : undefined}
            >
              {name}
            </li>
          ))}
        </ol>
        <p className={styles.progress}>
          Step {step + 1} of {STEPS.length}
        </p>

        {step === 0 && <KindStep state={state} set={set} />}
        {step === 1 && (
          <>
            <Field label="Title" error={shownErrors.title} grow>
              {(props) => (
                <input
                  {...props}
                  className={tokens.input}
                  value={state.title}
                  onChange={(e) => set('title', e.target.value)}
                />
              )}
            </Field>
            <label className={formStyles.check}>
              <input type="checkbox" checked={state.allDay} onChange={(e) => set('allDay', e.target.checked)} />
              All day
            </label>
            <WhenFields state={state} set={set} errors={shownErrors} notes={result.notes} />
            <ZoneField state={state} set={set} error={shownErrors.zone} />
          </>
        )}
        {step === 2 && <RepeatFields state={state} set={set} errors={shownErrors} count={count} />}
        {step === 3 && (
          <>
            {state.kind === 'task' && (
              <label className={formStyles.check}>
                <input type="checkbox" checked={state.done} onChange={(e) => set('done', e.target.checked)} />
                Done
              </label>
            )}
            <LocationFields state={state} set={set} errors={shownErrors} />
            <Field label="Notes" error={shownErrors.notes}>
              {(props) => (
                <textarea
                  {...props}
                  className={`${tokens.input} ${formStyles.notes}`}
                  value={state.notes}
                  onChange={(e) => set('notes', e.target.value)}
                />
              )}
            </Field>
            <CourseField value={state.courseId} onChange={(v) => set('courseId', v)} error={shownErrors.courseId} />
          </>
        )}
        {step === LAST_STEP && <Review state={state} count={count} />}

        {step === LAST_STEP && error !== null && (
          <p className={formStyles.serverError} role="alert">
            Could not save: {error.message}
          </p>
        )}

        {confirmingDiscard ? (
          <div className={styles.discard} role="group" aria-label="Discard this event">
            <span>Discard this event?</span>
            <button type="button" className={tokens.btnSecondary} onClick={() => setConfirmingDiscard(false)}>
              Keep editing
            </button>
            <button type="button" className={formStyles.delete} onClick={onClose}>
              Discard
            </button>
          </div>
        ) : (
          <div className={formStyles.actions}>
            {step > 0 && (
              <button type="button" className={`${tokens.btnSecondary} ${styles.back}`} onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button type="button" className={tokens.btnSecondary} onClick={requestClose}>
              Cancel
            </button>
            {step < LAST_STEP ? (
              <button type="submit" className={tokens.btnPrimary} disabled={!stepValid}>
                Next
              </button>
            ) : (
              <button type="submit" className={tokens.btnPrimary} disabled={!stepValid || pending}>
                {pending ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        )}
      </form>
    </PopoutShell>
  );
}

function KindStep({
  state,
  set,
}: {
  state: PlannerEventFormState;
  set: <K extends keyof PlannerEventFormState>(field: K, value: PlannerEventFormState[K]) => void;
}) {
  return (
    <fieldset className={styles.kinds}>
      <legend className={styles.legend}>What is it?</legend>
      {PLANNER_EVENT_KINDS.map((kind) => (
        <label key={kind} className={state.kind === kind ? styles.kindChosen : styles.kind}>
          <input
            type="radio"
            name="planner-event-kind"
            value={kind}
            checked={state.kind === kind}
            onChange={() => set('kind', kind)}
          />
          {PLANNER_EVENT_KIND_LABELS[kind]}
        </label>
      ))}
    </fieldset>
  );
}

/** Every line of the review is a value the reader entered, as entered. */
function Review({ state, count }: { state: PlannerEventFormState; count: string | undefined }) {
  const zone = selectedZone(state);
  const when = state.allDay
    ? `${state.startDate} – ${state.endDate} · all day`
    : `${state.startDate} ${state.startTime} – ${state.endDate === state.startDate ? '' : `${state.endDate} `}${state.endTime}`;
  const repeats =
    state.repeat === NO_REPEAT
      ? 'Does not repeat'
      : `${SERIES_FREQ_LABELS[state.repeat]} until ${state.repeatUntil}${count ? ` · ${count}` : ''}`;
  const location =
    state.locationKind === '' ? 'None' : `${LOCATION_LABELS[state.locationKind]} · ${state.location}`;
  const rows: [string, string][] = [
    ['Kind', PLANNER_EVENT_KIND_LABELS[state.kind]],
    ['Title', state.title],
    ['When', when],
    ['Time zone', zone],
    ['Repeats', repeats],
    ['Location', location],
    ['Course', state.courseId === '' ? 'No course' : state.courseId],
    ['Notes', state.notes.trim() === '' ? 'None' : state.notes],
  ];
  if (state.kind === 'task') rows.push(['Done', state.done ? 'Yes' : 'No']);
  return (
    <ul className={styles.review} aria-label="Review">
      {rows.map(([label, value]) => (
        <li key={label} className={styles.reviewRow}>
          <span className={styles.reviewLabel}>{label}</span>
          <span>{value}</span>
        </li>
      ))}
    </ul>
  );
}
