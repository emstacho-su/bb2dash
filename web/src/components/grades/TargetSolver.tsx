'use client';

/**
 * "What do I need on the rest?" (Phase 10b, course tab only).
 *
 * A letter picker built from the scheme's own scale (the saved letter, or A-),
 * and one sentence for whichever of the solver's five states came back. Every
 * sentence is a `labels.ts` template; the numbers are rounded here, once. It
 * renders inside the "Our model" container because every figure in it is
 * computed.
 */

import type { TargetResult } from '@/lib/grade-model/types';
import {
  notComputableText,
  solverNeededText,
  solverNoRemainingText,
  solverSecuredText,
  solverUnreachableText,
} from '@/lib/grade-model/labels';
import {
  TARGET_LETTER_LABEL,
  formatPct,
  formatShare,
  letterText,
  standingText,
} from '@/lib/grade-model-format';
import styles from './GradeModel.module.css';

/** The sentence for one solver answer. Pure, so the five states are easy to pin down. */
export function solverSentence(result: TargetResult): string {
  switch (result.state) {
    case 'needed':
      return solverNeededText({
        letter: result.letter,
        min: formatPct(result.targetPct),
        avg: formatShare(result.averageNeeded),
        n: result.remainingCount,
        share: formatShare(result.remainingShare),
      });
    case 'unreachable':
      return solverUnreachableText(result.letter, standingText({ ...result.bestCase, letter: null }), letterText(result.bestCase));
    case 'secured':
      return solverSecuredText(result.letter, standingText({ ...result.worstCase, letter: null }), letterText(result.worstCase));
    case 'no_remaining_work':
      return solverNoRemainingText(standingText({ ...result.current, letter: null }), letterText(result.current));
    case 'not_computable':
      return notComputableText(result.reason, []);
  }
}

export function TargetSolver({
  result,
  error = null,
  letters,
  selected,
  onSelect,
  disabled = false,
}: {
  /** The solver's answer for `selected`; null when it failed (see `error`). */
  result: TargetResult | null;
  error?: string | null;
  /** The scheme's letters, best first. */
  letters: readonly string[];
  selected: string;
  onSelect: (letter: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.solver}>
      <label className={styles.whatIfLabel}>
        <span>{TARGET_LETTER_LABEL}</span>
        <select
          className={styles.select}
          value={selected}
          disabled={disabled || letters.length === 0}
          onChange={(event) => onSelect(event.target.value)}
        >
          {letters.map((letter) => (
            <option key={letter} value={letter}>
              {letter}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      ) : result ? (
        <p className={styles.line} data-solver-state={result.state}>
          {solverSentence(result)}
        </p>
      ) : null}
    </div>
  );
}
