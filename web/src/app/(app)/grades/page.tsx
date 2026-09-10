import type { Metadata } from 'next';
import { ScreenStub } from '@/components/shell/ScreenStub';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Grades · bb2dash',
};

export default function GradesPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Standing</span>
          <h1 className={styles.title}>Grades</h1>
        </div>
      </header>

      <ScreenStub title="Grades" owner="unassigned · blocked on data">
        Project rule: no grade display until real gradebook data exists. Two courses still have an
        unknown grading scheme, so this screen stays empty rather than showing a computed number
        that is not real.
      </ScreenStub>
    </>
  );
}
