'use client';

/**
 * A grade figure on the Home course card (G-2 / P-home-10, Stack's answer 12).
 *
 * Answer 12 asks for two numbers on the card: "the same figure as Grades"
 * (whichever method wins the G-0 comparison) plus Blackboard's own total where
 * one exists. Only the second of those is decidable today — the method is
 * Stack's to pick after he reads `80e_GRADE_METHOD_COMPARISON.md` — so this
 * module is deliberately a SLOT, not a calculator.
 *
 *   * `blackboardGradeFigure()` is wired now. It reads `v_course_grade` through
 *     the Phase 10a helpers (`pickCourseGrade`, `courseGradeState`) and states
 *     what Blackboard published, or which of the two absences applies.
 *   * The graded-so-far figure is a `CourseGradeFigure` the CARD IS HANDED.
 *     Nothing here computes one, and nothing here should: W-31 owns the grade
 *     model, the PM plugs the winner in at integration, and a second
 *     implementation on this side is exactly how two screens end up disagreeing
 *     about the same course.
 *
 * The honesty rule applies unchanged. A figure with no value renders the reason
 * there is none; it never renders a zero, a dash standing in for a number, or a
 * number this app worked out for itself.
 */

import {
  courseGradeState,
  formatSeenAt,
  scoreText,
  type CourseGradeRow,
} from '@/lib/queries.grades';
import tokens from '@/styles/tokens.module.css';
import styles from './Today.module.css';

/**
 * One figure a course card can show.
 *
 * THE PROP CONTRACT. Everything is already formatted — this type carries no
 * numerator, denominator or method, because the card must not be in a position
 * to do arithmetic. A producer either fills `value` or fills `absence`, never
 * both and never neither.
 */
export interface CourseGradeFigure {
  /** Whose number it is: "Blackboard", "Graded so far". Two or three words. */
  label: string;
  /** The formatted figure, e.g. "39.8 / 140". Null when there is none. */
  value: string | null;
  /** Why there is none. Rendered in place of `value`; required when it is null. */
  absence: string | null;
  /** When the figure was read, already formatted. Null when not applicable. */
  asOf: string | null;
  /**
   * CR-7 — WHY there is no value:
   *
   *   'absent' the data honestly has none (no gradebook, no total, nothing
   *            graded). A fact about the course.
   *   'error'  we could not find out. A fact about us.
   *
   * They must not look alike. "not synced yet" beside a read that threw would
   * be the app reporting a state it never managed to observe. Defaults to
   * 'absent', so every existing producer keeps its meaning.
   */
  tone?: 'absent' | 'error';
  /**
   * The full reason, for the hover title. The card shows a short line; the
   * database's own words go behind it rather than across the layout.
   */
  detail?: string | null;
  /** A letter or display grade published alongside it, if any. */
  display?: string | null;
}

/** The two sentences for the two absences, asserted by the tests. */
export const NO_TOTAL_TEXT = 'publishes no total';
export const NEVER_SYNCED_TEXT = 'not synced yet';

/** The two short failure lines (CR-7). Short: they sit in a card stat. */
export const BLACKBOARD_ERROR_TEXT = 'could not be loaded';
export const GRADED_SO_FAR_ERROR_TEXT = 'could not be worked out';

/**
 * A figure whose read failed. Distinct from an absence on purpose: the card
 * says that it does not know, rather than that there is nothing to know.
 */
export function errorFigure(
  label: string,
  absence: string,
  detail?: string | null,
): CourseGradeFigure {
  return { label, value: null, absence, asOf: null, tone: 'error', detail: detail ?? null };
}

/** Blackboard's total, when `v_course_grade` could not be read. */
export function blackboardErrorFigure(detail?: string | null): CourseGradeFigure {
  return errorFigure('Blackboard', BLACKBOARD_ERROR_TEXT, detail);
}

/** The graded-so-far figure, when its own reads failed or the maths threw. */
export function gradedSoFarErrorFigure(detail?: string | null): CourseGradeFigure {
  return errorFigure('Graded so far', GRADED_SO_FAR_ERROR_TEXT, detail);
}

/**
 * Blackboard's own published total for one display course, or the absence of
 * one. `row` comes from `pickCourseGrade(rows, course.shell_ids)`.
 *
 * The two absences are different facts and stay apart: `never_synced` is a
 * statement about us (no gradebook has been pulled), `no_total` is a statement
 * about the course (there is a gradebook, and it carries no calculated total).
 * A total column that exists but is ungraded is still a total — `scoreText`
 * renders the figure itself as a dash.
 */
export function blackboardGradeFigure(
  row: CourseGradeRow | null | undefined,
): CourseGradeFigure {
  const state = courseGradeState(row);

  if (state === 'never_synced') {
    return { label: 'Blackboard', value: null, absence: NEVER_SYNCED_TEXT, asOf: null };
  }
  if (state === 'no_total') {
    return {
      label: 'Blackboard',
      value: null,
      absence: NO_TOTAL_TEXT,
      asOf: formatSeenAt(row?.gradebook_seen_at),
    };
  }

  const total = row as CourseGradeRow;
  return {
    label: 'Blackboard',
    value: scoreText(total.total_effective_score, total.total_possible),
    absence: null,
    asOf: formatSeenAt(total.total_seen_at ?? total.gradebook_seen_at),
    display: total.total_display_grade,
  };
}

/**
 * Render one figure in a card's stat row. Presentation only — it shows what it
 * is handed and never reaches for data of its own.
 */
export function CourseGradeFigureView({ figure }: { figure: CourseGradeFigure }) {
  const title =
    figure.detail ?? (figure.asOf ? `${figure.label} · as of ${figure.asOf}` : figure.label);
  return (
    <div className={styles.stat} title={title}>
      <span className={tokens.kicker}>{figure.label}</span>
      {figure.value === null ? (
        <span
          className={figure.tone === 'error' ? styles.statError : styles.statAbsence}
          role={figure.tone === 'error' ? 'status' : undefined}
        >
          {figure.absence}
        </span>
      ) : (
        <span className={styles.statValue}>
          {figure.value}
          {figure.display && <span className={styles.statGrade}> {figure.display}</span>}
        </span>
      )}
    </div>
  );
}
