'use client';

/**
 * One course's grade header (Phase 10a, R-11).
 *
 * Three states, kept distinct on purpose:
 *
 *   total         Blackboard publishes a calculated total. It is shown with the
 *                 `seen_at` of the run that read it, prefixed "Blackboard's
 *                 number, as of …" so it can never be mistaken for ours.
 *   no_total      There is a gradebook, but Blackboard publishes no total for
 *                 this shell. The card says exactly "Blackboard publishes no
 *                 total" and computes nothing in its place (what to do instead
 *                 is V-1's question, not this phase's).
 *   never_synced  No gradebook has been pulled for the course at all. "Not
 *                 synced yet" is a statement about us, not about the course.
 *
 * A total column that exists but is ungraded is still the `total` state; the
 * figure itself renders `—`.
 */

import { MARK_CHAR, Mark } from '@/components/shell/icons';
import { useId } from 'react';
import Link from 'next/link';
import {
  courseGradeState,
  formatSeenAt,
  scoreText,
  type CourseGradeRow,
} from '@/lib/queries.grades';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseGradeCard.module.css';

/** The exact sentence for the two empty states. Asserted by the tests. */
export const NO_TOTAL_TEXT = 'Blackboard publishes no total';
export const NEVER_SYNCED_TEXT = 'not synced yet';

export function CourseGradeHeader({ row }: { row: CourseGradeRow | null | undefined }) {
  const state = courseGradeState(row);

  if (state === 'never_synced') {
    return (
      <div className={styles.pillRow}>
        <span className={tokens.tagNeutral}>{NEVER_SYNCED_TEXT}</span>
        <span className={styles.explain}>
          No gradebook has been pulled from Blackboard for this course.
        </span>
      </div>
    );
  }

  if (state === 'no_total') {
    return (
      <div className={styles.pillRow}>
        <span className={tokens.tagNeutral}>{NO_TOTAL_TEXT}</span>
        <span className={styles.explain}>
          Its gradebook was read {formatSeenAt(row?.gradebook_seen_at)} — it carries no calculated
          total column.
        </span>
      </div>
    );
  }

  const total = row as CourseGradeRow;
  return (
    <div className={styles.pillRow}>
      <span className={tokens.tagAccent} title={total.total_name ?? undefined}>
        Blackboard&rsquo;s number, as of {formatSeenAt(total.total_seen_at ?? total.gradebook_seen_at)}
      </span>
      <span className={styles.total}>
        {scoreText(total.total_effective_score, total.total_possible)}
      </span>
      {total.total_display_grade && (
        <span className={tokens.tagOutline}>{total.total_display_grade}</span>
      )}
      {total.total_name && <span className={styles.explain}>{total.total_name}</span>}
    </div>
  );
}

/** How a card folds, when its caller lets it (R3-7). */
export interface CourseGradeFold {
  /** True when the class is folded to its header. */
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}

/**
 * The header plus whatever the caller puts under it (the gradebook table).
 * `title` is the course's own code/title; this component never invents one.
 *
 * `fold` (Phase 17 round 3, R3-7; replaces 12b's P-grades-1 "Hide" button)
 * turns the whole class header — code and name — into one
 * `<button aria-expanded>`, outlined on hover and focus as Materials' course
 * headers are. Folding keeps the heading and Blackboard's header, the summary
 * being the reason to fold the rest, and takes only `children` with it. The
 * caller owns where the choice is remembered. Without `fold` the card does not
 * fold at all: the course's own Grades tab has one card and nothing to hide.
 *
 * `href` (P-grades-2) is the way into the course. A link cannot sit inside the
 * fold button, so it sits beside the header as "Open <code> →", the way
 * Materials puts "Open in Classwork →" beside its course headers.
 */
export function CourseGradeCard({
  title,
  href,
  subtitle,
  row,
  fold,
  headerRight,
  children,
}: {
  title: string;
  href?: string;
  subtitle?: string | null;
  row: CourseGradeRow | null | undefined;
  fold?: CourseGradeFold;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const bodyId = useId();
  const showsBody = !fold || !fold.collapsed;

  return (
    <section className={`${tokens.cardLg} ${styles.card}`} aria-label={title}>
      <div className={styles.head}>
        {fold ? (
          <h2 className={styles.title}>
            <button
              type="button"
              className={styles.foldToggle}
              aria-expanded={!fold.collapsed}
              aria-controls={bodyId}
              onClick={fold.onToggle}
            >
              <span className={styles.caret} aria-hidden="true">
                {fold.collapsed ? <Mark name="caretRight" /> : <Mark name="caretDown" />}
              </span>
              <span>{title}</span>
              {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
            </button>
          </h2>
        ) : (
          <div className={styles.headText}>
            <h2 className={styles.title}>{title}</h2>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          </div>
        )}
        {href && (
          <Link className={styles.openLink} href={href}>
            Open {title} <Mark name="caretRight" char={MARK_CHAR.arrowRight} />
          </Link>
        )}
        {headerRight}
      </div>

      <CourseGradeHeader row={row} />

      <div id={bodyId} className={styles.body} hidden={!showsBody}>
        {showsBody && children}
      </div>
    </section>
  );
}
