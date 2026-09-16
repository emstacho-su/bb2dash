'use client';

/**
 * When a score changed (Phase 10b, R-11 (c)).
 *
 * A small "history" disclosure on a gradebook row whose score moved across
 * syncs — `v_gradebook_history` gives the first registered observation and
 * every later one that differed. One observation is not a history, so a row
 * with fewer than two renders nothing. Every figure is Blackboard's, shown with
 * the day we saw it; null is the dash, never zero. Not a sparkline (PM call 5).
 */

import { useState } from 'react';
import { HISTORY_LABEL, historyText } from '@/lib/grade-model-format';
import type { GradebookHistoryRow } from '@/lib/grade-model-input';
import styles from './GradeModel.module.css';

export function ScoreHistory({
  rows,
  label,
}: {
  /** This column's history rows, oldest first. */
  rows: readonly GradebookHistoryRow[];
  /** The column's name, for the screen reader. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (rows.length < 2) return null;

  return (
    <div className={styles.history}>
      <button
        type="button"
        className={styles.historyToggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {HISTORY_LABEL}
        <span className={styles.srOnly}> of {label}</span>
      </button>
      {open && (
        <span className={styles.historyLine}>
          {historyText(rows.map((row) => ({ score: row.score, seenAt: row.seen_at })))}
        </span>
      )}
    </div>
  );
}
