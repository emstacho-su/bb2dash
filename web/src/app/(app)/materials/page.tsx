import type { Metadata } from 'next';
import { ScreenStub } from '@/components/shell/ScreenStub';
import styles from '../Shell.module.css';

export const metadata: Metadata = {
  title: 'Materials · bb2dash',
};

export default function MaterialsPage() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Library</span>
          <h1 className={styles.title}>Materials</h1>
        </div>
      </header>

      <ScreenStub title="Course materials" owner="W-7 · Materials">
        Every file pulled from Blackboard, browsable by course and bucket, backed by `bb_files` and
        the private `bb-files` storage bucket. Search over their extracted text runs through the
        hybrid `search` edge function (also reachable from ⌘K).
      </ScreenStub>
    </>
  );
}
