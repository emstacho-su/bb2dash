'use client';

/**
 * The report card along the top of `/grades` (Phase 17 round 3, R3-7).
 *
 * One card per class: its code and name, and what the page's own "Graded so
 * far" figure says for it. It computes nothing and reads nothing — the figures
 * arrive from `GradesModelScreen`, the same ones each class's section renders,
 * so the strip and the sections cannot disagree.
 *
 *   figure with points    the letter and "earned / possible"
 *   figure without points the letter and the percentage (a weighted scheme,
 *                         whose two sides are weight units, not marks)
 *   no figure             the page's own short wording ("graded qualitatively",
 *                         "nothing graded yet", …) and no number at all
 *   loading / failed      "loading…" / "could not be worked out"; the section
 *                         below carries the alert with the reason
 */

import { scoreText } from '@/lib/queries.grades';
import { gradedSoFarCardFigure, percentText } from '@/lib/graded-so-far';
import type { CourseFigureState } from '@/lib/grade-figure-run';
import tokens from '@/styles/tokens.module.css';
import styles from './ReportCardStrip.module.css';

export interface ReportCardCourse {
  readonly displayId: string;
  readonly code: string;
  readonly title: string;
}

export const REPORT_CARD_LABEL = 'Report card';
export const LOADING_TEXT = 'loading…';
export const FAILED_TEXT = 'could not be worked out';

function CardFigure({ state }: { state: CourseFigureState | undefined }) {
  if (state?.error) return <span className={styles.absence}>{FAILED_TEXT}</span>;
  const figure = state?.figure ?? null;
  if (figure === null) return <span className={styles.absence}>{LOADING_TEXT}</span>;

  if (figure.state !== 'figure') {
    return <span className={styles.absence}>{gradedSoFarCardFigure(figure).absence}</span>;
  }

  const points =
    figure.pointsEarned !== null && figure.pointsPossible !== null
      ? scoreText(figure.pointsEarned, figure.pointsPossible)
      : null;
  return (
    <span className={styles.figure}>
      {figure.letter && <span className={styles.letter}>{figure.letter}</span>}
      <span className={tokens.mono}>{points ?? percentText(figure.percent)}</span>
    </span>
  );
}

export function ReportCardStrip({
  courses,
  figures,
}: {
  courses: readonly ReportCardCourse[];
  figures: Readonly<Record<string, CourseFigureState>>;
}) {
  return (
    <section className={styles.strip} aria-label={REPORT_CARD_LABEL}>
      <ul className={styles.cards}>
        {courses.map((course) => (
          <li key={course.displayId} className={styles.card}>
            <span className={styles.code} data-code="">
              {course.code}
            </span>
            <span className={styles.title}>{course.title}</span>
            <CardFigure state={figures[course.displayId]} />
          </li>
        ))}
      </ul>
    </section>
  );
}
