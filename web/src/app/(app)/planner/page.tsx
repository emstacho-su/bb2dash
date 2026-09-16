import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlannerWeek } from '@/components/planner/PlannerWeek';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Planner · bb2dash',
};

/**
 * /planner — the week grid (R-19, Phase 11).
 *
 * The grid reads `?week=` for its Monday anchor, so it sits behind a Suspense
 * boundary: without one, `useSearchParams` would opt this route out of
 * prerendering altogether (the same reason the popout host has one in the
 * (app) layout).
 */
export default function PlannerPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Schedule</span>
          <h1 className={styles.title}>Planner</h1>
        </div>
      </header>

      <Suspense fallback={<p className={styles.stubBody}>Loading the week…</p>}>
        <PlannerWeek />
      </Suspense>
    </>
  );
}
