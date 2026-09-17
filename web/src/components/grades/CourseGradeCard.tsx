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

/**
 * The header plus whatever the caller puts under it (the gradebook table).
 * `title` is the course's own code/title; this component never invents one.
 *
 * `titleHref` (Phase 12b, P-grades-2) makes that title the way into the course,
 * in place of a separate button beside it. The link sits *inside* the heading,
 * so the card keeps announcing itself as a level-2 heading with the course's
 * name. Without it the title is plain text — the course's own Grades tab passes
 * nothing, because a link from a page to itself is noise.
 */
export function CourseGradeCard({
  title,
  titleHref,
  subtitle,
  row,
  headerRight,
  children,
}: {
  title: string;
  titleHref?: string;
  subtitle?: string | null;
  row: CourseGradeRow | null | undefined;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className={`${tokens.cardLg} ${styles.card}`} aria-label={title}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>
            {titleHref ? (
              <Link className={styles.titleLink} href={titleHref}>
                {title}
              </Link>
            ) : (
              title
            )}
          </h2>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
        {headerRight}
      </div>

      <CourseGradeHeader row={row} />

      {children}
    </section>
  );
}
