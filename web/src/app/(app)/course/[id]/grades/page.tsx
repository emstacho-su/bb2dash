import type { Metadata } from 'next';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import styles from './CourseGrades.module.css';

export const metadata: Metadata = {
  title: 'Grades · bb2dash',
};

/**
 * `/course/[id]/grades` — a placeholder pane, on purpose.
 *
 * There is no gradebook data in the database yet, and the project's honesty
 * rule forbids showing a grade figure that is not a real one. So this tab says
 * what it is waiting for and points at the Grades screen; it renders no number,
 * no percentage, no letter, and no empty scaffolding that could be mistaken for
 * one. Phase 10 replaces it.
 */
export default function CourseGradesPage() {
  return (
    <div className={styles.screen}>
      <h1 className="sr-only">Grades</h1>
      <section className={`${tokens.cardLg} ${styles.pane}`} aria-label="Grades">
        <span className={tokens.kicker}>Grades</span>
        <p className={styles.headline}>Grades arrive with Phase 10.</p>
        <p className={styles.body}>
          No gradebook data has been pulled from Blackboard yet. Rather than show a placeholder
          figure, this tab shows nothing until there is a real score behind it.
        </p>
        <Link className={tokens.btnSecondary} href="/grades">
          Open the Grades screen →
        </Link>
      </section>
    </div>
  );
}
