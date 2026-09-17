'use client';

/**
 * The headline grade figure (Phase 12b, G-2 — P-grades-1 and P-home-10).
 *
 * One presentational component for the one number the app states. It computes
 * nothing: `gradedSoFar()` in `@/lib/graded-so-far` produces the figure and
 * this renders it, so `/grades`, a course's Grades tab and Home's course card
 * cannot drift apart by rendering the same data three ways.
 *
 * What it will not do:
 *   * invent a number. Nothing graded says so; a qualitatively graded course
 *     states no percentage at all; a read that failed is an alert, not a blank.
 *   * print a fraction that is not points. Under a weighted scheme the two
 *     sides of the figure are weight units, and "50.7 / 60" would read as a
 *     mark the gradebook does not contain — so `pointsEarned` is null there and
 *     only the percentage shows.
 *   * merge our figure with Blackboard's. Blackboard's total renders beside
 *     ours, in its own labelled box, exactly as 10a's header did.
 *   * hide what it does not cover. A part nobody has graded is named under the
 *     number, and a scored column that counts toward nothing is named with a
 *     pointer to the "Counts toward…" picker that can place it.
 *
 * `compact` is Home's course card: the number and its as-of, without the
 * explanations there is no room for. The honest empty states survive it.
 */

import { formatSeenAt, scoreText } from '@/lib/queries.grades';
import type { GradedSoFarResult as Figure, FigureReason } from '@/lib/graded-so-far';
import tokens from '@/styles/tokens.module.css';
import styles from './GradedSoFarFigure.module.css';

/* -- the strings, in one place so the tests and the docs agree -------------- */

export const FIGURE_LABEL = 'Graded so far';
export const NOTHING_GRADED_TEXT = 'Nothing that counts toward the grade has been graded yet.';
export const LEFT_OUT_LABEL = 'Not counted yet:';
export const UNLINKED_LABEL = 'Counts toward nothing:';
export const UNLINKED_HINT = 'use “Counts toward…” on the row to place it';
export const BLACKBOARD_LABEL = 'Blackboard’s own total';

export const NOT_COMPUTABLE_TEXT: Readonly<Record<FigureReason, string>> = {
  qualitative_method: 'This course is graded qualitatively — there is no percentage to show.',
  no_scheme: 'No grading rules are recorded for this course yet.',
  unknown_method: 'A grading rule here is one bb2dash cannot read.',
  unknown_aggregation: 'A grading rule here is one bb2dash cannot read.',
};

/** One decimal, rounded once, here — never anywhere upstream. */
export function percentText(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/* -- Blackboard's number, beside ours and never merged with it ------------- */

export interface BlackboardTotal {
  readonly score: number | string | null;
  readonly possible: number | string | null;
  readonly seenAt: string | null;
  readonly name?: string | null;
}

function BlackboardBox({ total }: { total: BlackboardTotal }) {
  return (
    <span className={styles.blackboard} data-testid="blackboard-total">
      <span className={tokens.tagNeutral} title={total.name ?? undefined}>
        {BLACKBOARD_LABEL}
      </span>
      <span className={styles.blackboardScore}>{scoreText(total.score, total.possible)}</span>
      <span className={styles.note}>as of {formatSeenAt(total.seenAt)}</span>
    </span>
  );
}

/* -- the component --------------------------------------------------------- */

export interface GradedSoFarFigureProps {
  /** The figure, or null while the reads behind it are still in flight. */
  readonly figure: Figure | null;
  /** Blackboard's own total, where it publishes one. Never merged with ours. */
  readonly blackboardTotal?: BlackboardTotal | null;
  /** Why the figure could not be read. Shown as an alert instead of a number. */
  readonly error?: string | null;
  /** Home's course card: the number and its as-of, nothing else. */
  readonly compact?: boolean;
}

export function GradedSoFarFigure({
  figure,
  blackboardTotal = null,
  error = null,
  compact = false,
}: GradedSoFarFigureProps) {
  const theirs = blackboardTotal ? <BlackboardBox total={blackboardTotal} /> : null;

  if (error) {
    return (
      <div className={styles.figure} data-figure="" data-compact={compact ? "true" : "false"}>
        <p className={styles.alert} role="alert">
          {error}
        </p>
        {theirs}
      </div>
    );
  }

  if (figure === null) {
    return (
      <div className={styles.figure} data-figure="" data-compact={compact ? "true" : "false"}>
        <span className={styles.note}>loading…</span>
        {theirs}
      </div>
    );
  }

  if (figure.state !== 'figure') {
    return (
      <div className={styles.figure} data-figure="" data-compact={compact ? "true" : "false"}>
        <span className={tokens.kicker}>{FIGURE_LABEL}</span>
        <p className={styles.sentence}>
          {figure.state === 'nothing_graded'
            ? NOTHING_GRADED_TEXT
            : NOT_COMPUTABLE_TEXT[figure.reason]}
        </p>
        {theirs}
      </div>
    );
  }

  const fraction =
    figure.pointsEarned !== null && figure.pointsPossible !== null
      ? scoreText(figure.pointsEarned, figure.pointsPossible)
      : null;

  return (
    <div className={styles.figure} data-figure="" data-compact={compact ? "true" : "false"}>
      <span className={tokens.kicker}>{FIGURE_LABEL}</span>

      <span className={styles.headline}>
        <span className={styles.percent}>{percentText(figure.percent)}</span>
        {figure.letter && <span className={tokens.tagOutline}>{figure.letter}</span>}
        {fraction && <span className={tokens.mono}>{fraction}</span>}
        <span className={styles.note}>as of {formatSeenAt(figure.asOf)}</span>
      </span>

      {!compact && figure.leftOutParts.length > 0 && (
        <p className={styles.sentence}>
          {LEFT_OUT_LABEL} {figure.leftOutParts.join(', ')}
        </p>
      )}

      {!compact && figure.unlinkedColumns.length > 0 && (
        <p className={styles.sentence}>
          {UNLINKED_LABEL} {figure.unlinkedColumns.join(', ')} — {UNLINKED_HINT}
        </p>
      )}

      {theirs}
    </div>
  );
}
