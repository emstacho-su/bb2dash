import type { Metadata } from 'next';
import { ScreenStub } from '@/components/shell/ScreenStub';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Planner · bb2dash',
};

export default function PlannerPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Schedule</span>
          <h1 className={styles.title}>Planner</h1>
        </div>
      </header>

      <ScreenStub title="Planner day view" owner="unassigned · spec T-17">
        Today&rsquo;s meetings moved off Home and become a Planner day view (GUI decision, T-17).
        The route exists so the top bar is complete; the screen is not in the current worker split.
      </ScreenStub>
    </>
  );
}
