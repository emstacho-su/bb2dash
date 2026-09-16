import type { Metadata } from 'next';
import { GradesModelScreen } from './GradesModelScreen';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Grades · bb2dash',
};

/**
 * `/grades` (Phase 10a) — Blackboard's gradebook, mirrored honestly.
 *
 * The screen that used to stand here said the project rule out loud: no grade
 * display until real gradebook data exists. That data exists now, so the rule
 * moves into the rendering instead — every Blackboard figure is shown with the
 * time we saw it, and the only numbers bb2dash computes (Phase 10b) sit inside
 * each course's "Our model" container.
 */
export default function GradesPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Standing</span>
          <h1 className={styles.title}>Grades</h1>
        </div>
      </header>

      <GradesModelScreen />
    </>
  );
}
