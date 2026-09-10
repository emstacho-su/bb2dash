import type { Metadata } from 'next';
import { MaterialsBrowser } from './MaterialsBrowser';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Materials · bb2dash',
};

/**
 * Materials (W-7). A per-course browser over every file pulled from Blackboard,
 * grouped by course then by bucket, backed by `v_bb_files_current` (excludes
 * superseded files) and the `bb-files` Storage bucket. Stored files open via a
 * signed URL minted at click time; assigned readings resolve through a
 * four-state "Open ladder" (in library · external link · off-platform e-book /
 * Blackboard · no route), each state labeled honestly.
 */
export default function MaterialsPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Library</span>
          <h1 className={styles.title}>Materials</h1>
        </div>
      </header>

      <MaterialsBrowser />
    </>
  );
}
