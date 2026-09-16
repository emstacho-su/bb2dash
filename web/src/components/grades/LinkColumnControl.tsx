'use client';

/**
 * "Counts toward…" (Phase 10b, answer 2 and PM call 9; course tab only).
 *
 * A select on a gradebook column that is scored but tied to no syllabus rule,
 * or whose rule is only tentative / inferred (the current component is
 * preselected and marked "unsure"), or that Stack already chose for. Picking a
 * component or "Not graded" writes one `grade_column_links` row, which the
 * model treats as confirmed; picking "Counts toward…" itself on a row Stack
 * chose for clears that choice. An unsure link can also be confirmed exactly as
 * it stands with "Confirm link" — the select cannot fire a change for the
 * option it already shows. Whether the component belongs to this course
 * is the database trigger's call — a refusal comes back as `error`.
 */

import type { ChangeEvent } from 'react';
import { LINK_LABEL, LINK_NOT_GRADED, LINK_UNSURE } from '@/lib/grade-model/labels';
import { CONFIRM_LINK_LABEL } from '@/lib/grade-model-format';
import type { LinkState, LinkTarget } from '@/lib/grade-model-view';
import styles from './GradeModel.module.css';

const EXCLUDED_VALUE = 'not-graded';
const NONE_VALUE = '';

/** What the select shows for a link state. */
export function selectedLinkValue(state: Pick<LinkState, 'componentId' | 'excluded'>): string {
  if (state.excluded) return EXCLUDED_VALUE;
  return state.componentId === null ? NONE_VALUE : String(state.componentId);
}

/** A select value → the write it asks for, or null when it asks for nothing. */
export function linkTargetFor(value: string, state: Pick<LinkState, 'override'>): LinkTarget | null {
  if (value === EXCLUDED_VALUE) return { kind: 'excluded' };
  if (value === NONE_VALUE) return state.override ? { kind: 'clear' } : null;
  const componentId = Number(value);
  return Number.isInteger(componentId) ? { kind: 'component', componentId } : null;
}

export function LinkColumnControl({
  state,
  options,
  columnName,
  onChange,
  pending = false,
  error = null,
}: {
  state: LinkState;
  /** The scheme's components, a parent before its parts. */
  options: readonly { id: number; name: string }[];
  columnName: string;
  onChange: (state: LinkState, target: LinkTarget) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const handle = (event: ChangeEvent<HTMLSelectElement>) => {
    const target = linkTargetFor(event.target.value, state);
    if (target) onChange(state, target);
  };

  return (
    <span className={styles.link}>
      <select
        className={styles.select}
        aria-label={`${LINK_LABEL} ${columnName}`}
        value={selectedLinkValue(state)}
        disabled={pending}
        onChange={handle}
      >
        <option value={NONE_VALUE}>{LINK_LABEL}</option>
        {options.map((option) => (
          <option key={option.id} value={String(option.id)}>
            {option.name}
          </option>
        ))}
        <option value={EXCLUDED_VALUE}>{LINK_NOT_GRADED}</option>
      </select>
      {state.unsure && <span className={styles.unsure}>{LINK_UNSURE}</span>}
      {state.unsure && state.componentId !== null && (
        <button
          type="button"
          className={styles.historyToggle}
          aria-label={`${CONFIRM_LINK_LABEL}: ${columnName}`}
          disabled={pending}
          onClick={() => onChange(state, { kind: 'component', componentId: state.componentId as number })}
        >
          {CONFIRM_LINK_LABEL}
        </button>
      )}
      {error && (
        <span className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
