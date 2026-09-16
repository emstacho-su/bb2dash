'use client';

/**
 * A hypothetical score on one ungraded item (Phase 10b, course tab only).
 *
 * The cell sits beside Blackboard's own dash, never in place of it: Blackboard
 * has not graded the item, and the typed value is Stack's guess. It is drawn in
 * the accent colour, italic and dashed so it cannot read as a Blackboard score.
 *
 * Validation happens at the boundary, here: a value commits on blur or Enter
 * only when it parses as a plain number with `0 ≤ v ≤ possible` (an
 * extra-credit item's own possible included). Anything else stays in the field
 * with an error beside it and is never saved. An empty field clears the value;
 * so does the × revert.
 *
 * Round 1b A1: a placeholder with no possible (ECN.304's exams) reads "what if
 * __ %" instead of "/ possible", accepts 0–100, and stores that number.
 */

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { WHAT_IF_LABEL } from '@/lib/grade-model/labels';
import { PERCENT_SUFFIX, REVERT_WHAT_IF_LABEL, formatPoints } from '@/lib/grade-model-format';
import { parseWhatIf, type WhatIfCellTarget } from '@/lib/grade-model-view';
import styles from './GradeModel.module.css';

/** What a table needs to offer what-if cells. */
export interface WhatIfProps {
  /** The items that may take a value: the engine's `itemStates().whatIfTargets`. */
  readonly targets: ReadonlyMap<string, WhatIfCellTarget>;
  /** The saved scenario's values, by item key. */
  readonly values: Readonly<Record<string, number>>;
  /** Commit one value, or clear it with null. Called on blur / Enter, never per keystroke. */
  readonly onCommit: (key: string, value: number | null) => void;
  readonly disabled?: boolean;
}

function draftFor(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export function WhatIfCell({
  target,
  value,
  onCommit,
  disabled = false,
}: {
  target: WhatIfCellTarget;
  value: number | undefined;
  onCommit: (key: string, value: number | null) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(() => draftFor(value));
  const [error, setError] = useState<string | null>(null);
  const errorId = useId();

  // Adopt the saved value whenever it changes underneath: a save landed, a
  // failed save rolled back, the row was reverted or the scenario was reset.
  useEffect(() => {
    setDraft(draftFor(value));
    setError(null);
  }, [value]);

  const commit = () => {
    const parsed = parseWhatIf(draft, target.possible);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.value === (value ?? null)) return;
    onCommit(target.key, parsed.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
  };

  const inputClass = error ? styles.whatIfInvalid : value !== undefined ? styles.whatIfInputSet : styles.whatIfInput;

  return (
    <span
      className={styles.whatIf}
      data-what-if={value !== undefined ? 'set' : 'empty'}
      data-what-if-unit={target.unit}
    >
      <label className={styles.whatIfLabel}>
        <span>{WHAT_IF_LABEL}</span>
        <span className={styles.srOnly}> — {target.name}</span>
        <input
          className={inputClass}
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </label>
      <span className={styles.note}>
        {target.unit === 'percent' ? PERCENT_SUFFIX : `/ ${formatPoints(target.possible)}`}
      </span>
      {value !== undefined && (
        <button
          type="button"
          className={styles.revert}
          aria-label={`${REVERT_WHAT_IF_LABEL}: ${target.name}`}
          disabled={disabled}
          onClick={() => onCommit(target.key, null)}
        >
          ×
        </button>
      )}
      {error && (
        <span id={errorId} className={styles.fieldError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
