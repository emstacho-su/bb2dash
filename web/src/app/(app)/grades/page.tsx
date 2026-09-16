import type { Metadata } from 'next';
import { GradesScreen } from './GradesScreen';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Grades · bb2dash',
};

/**
 * `/grades` (Phase 10a) — Blackboard's gradebook, mirrored honestly.
 *
 * The screen that used to stand here said the project rule out loud: no grade
 * display until real gradebook data exists. That data exists now, so the rule
 * moves into the rendering instead — every figure below is Blackboard's own,
 * shown with the time we saw it, and bb2dash computes none of them.
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

      <GradesScreen />
    </>
  );
}
