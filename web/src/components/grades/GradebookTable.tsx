'use client';

/**
 * The gradebook table (Phase 10a, R-10/R-11).
 *
 * One row per gradebook column, showing exactly what Blackboard recorded and
 * when we saw it. Nothing here is computed: no sum, no average, no projection,
 * no comparison against a syllabus rule. A column Blackboard has not graded
 * shows `—`, never `0`.
 *
 * Which rows sit where is decided by the data, not by a list in this file
 * (Stack's answer 8): a real gradebook item is an item row, and so is an
 * attendance column whose linked assignment has a grade component — V-1's links
 * move a row up without a redeploy. Everything else (uncounted attendance,
 * letter-grade override columns, non-total calculated columns) sits in the
 * collapsed bookkeeping group underneath, with the same cells and the same
 * honesty.
 *
 * Feedback is the instructor's own words: rendered as text, escaped by React,
 * `white-space: pre-wrap` so their line breaks survive, clamped to two lines
 * until it is expanded.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { itemQuery } from '@/lib/queries.popout';
import {
  NO_VALUE,
  formatSeenAt,
  isBookkeepingRow,
  isItemRow,
  scoreText,
  submissionLabel,
  type GradebookLatestRow,
} from '@/lib/queries.grades';
import tokens from '@/styles/tokens.module.css';
import styles from './GradebookTable.module.css';

/* -- feedback -------------------------------------------------------------- */

/**
 * The instructor's feedback, two lines until it is opened.
 *
 * The whole text is always in the DOM — the clamp is CSS — so nothing is
 * hidden from find-in-page or a screen reader; the toggle only changes how much
 * of it is drawn.
 */
export function FeedbackDisclosure({ feedback, label }: { feedback: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.feedback}>
      <button
        type="button"
        className={styles.feedbackToggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide feedback' : 'Feedback'}
        <span className={styles.srOnly}> from {label}</span>
      </button>
      <p
        className={open ? styles.feedbackTextOpen : styles.feedbackText}
        data-expanded={open ? 'true' : 'false'}
      >
        {feedback}
      </p>
    </div>
  );
}

/* -- one row --------------------------------------------------------------- */

export function GradebookRow({ row }: { row: GradebookLatestRow }) {
  const submission = submissionLabel(row.submission_status, row.last_attempt_status);
  const counted = row.column_kind === 'attendance' && row.counts_toward_grade === true;
  const ambiguous = (row.linked_assignments ?? 0) > 1;

  return (
    <>
      <tr className={styles.row} data-column-kind={row.column_kind}>
        <th scope="row" className={styles.nameCell}>
          {row.assignment_id ? (
            <Link className={styles.itemLink} href={itemQuery({ kind: 'assignment', id: row.assignment_id })}>
              {row.name}
            </Link>
          ) : (
            <span className={styles.itemName}>{row.name}</span>
          )}
          {counted && (
            <span className={tokens.tagOutline} title="Its linked assignment has a grade component.">
              counts toward grade
            </span>
          )}
          {ambiguous && (
            <span className={styles.note}>
              linked to {row.linked_assignments} assignments — no single item to open
            </span>
          )}
        </th>

        <td className={styles.submissionCell}>
          <span className={tokens.tagNeutral} title={submission.status ?? 'Blackboard recorded no submission status.'}>
            {submission.text}
          </span>
          {submission.attemptStatus && (
            <span className={styles.note}>last attempt: {submission.attemptStatus}</span>
          )}
        </td>

        <td className={styles.scoreCell}>
          <span className={styles.score}>{scoreText(row.effective_score, row.possible)}</span>
          {row.display_grade && <span className={styles.note}>{row.display_grade}</span>}
        </td>

        <td className={styles.seenCell}>
          <span className={tokens.mono} title="When a Blackboard sync last saw this figure.">
            {formatSeenAt(row.seen_at)}
          </span>
        </td>
      </tr>

      {row.feedback && (
        <tr className={styles.feedbackRow}>
          <td colSpan={4}>
            <FeedbackDisclosure feedback={row.feedback} label={row.name} />
          </td>
        </tr>
      )}
    </>
  );
}

/* -- the table ------------------------------------------------------------- */

function Table({ rows, caption }: { rows: GradebookLatestRow[]; caption: string }) {
  return (
    <table className={styles.table}>
      <caption className={styles.srOnly}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Submission</th>
          <th scope="col">Score</th>
          <th scope="col">Seen</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <GradebookRow key={`${row.course_id}:${row.column_id}`} row={row} />
        ))}
      </tbody>
    </table>
  );
}

export function GradebookTable({
  rows,
  caption = 'Gradebook columns, as Blackboard recorded them',
}: {
  rows: GradebookLatestRow[];
  /** Named for the screen reader; the visible heading lives in the card. */
  caption?: string;
}) {
  const [showBookkeeping, setShowBookkeeping] = useState(false);

  const { items, bookkeeping } = useMemo(
    () => ({
      items: rows.filter(isItemRow),
      bookkeeping: rows.filter(isBookkeepingRow),
    }),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        No gradebook columns have been pulled for this course yet.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      {items.length > 0 ? (
        <Table rows={items} caption={caption} />
      ) : (
        <p className={styles.empty}>
          Blackboard has published no graded items for this course — only the bookkeeping
          columns below.
        </p>
      )}

      {bookkeeping.length > 0 && (
        <div className={styles.group}>
          <button
            type="button"
            className={styles.groupToggle}
            aria-expanded={showBookkeeping}
            onClick={() => setShowBookkeeping((value) => !value)}
          >
            Attendance and bookkeeping columns ({bookkeeping.length})
          </button>
          {showBookkeeping && (
            <Table rows={bookkeeping} caption="Attendance and bookkeeping columns" />
          )}
        </div>
      )}
    </div>
  );
}

/** Re-exported so a caller can render the same dash this table uses. */
export { NO_VALUE };
