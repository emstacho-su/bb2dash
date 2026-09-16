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
 *
 * Phase 10b adds optional props, all absent on 10a's call sites:
 *   whatIf   course tab only — a "what if" cell beside the dash on an ungraded,
 *            counted, non-muted item row.
 *   history  both screens — a "history" disclosure on a row whose score moved.
 *   links    course tab only — the "Counts toward…" picker. A column Stack
 *            linked to a component by override also moves up among the item
 *            rows and carries 10a's "counts toward grade" tag; one he marked
 *            "Not graded" loses the tag and sits in the bookkeeping group,
 *            whatever V-1's link says (round 2, R2-8).
 *   overrides both screens — Stack's link choices without the picker, so
 *            `/grades` places a row the same way the course tab does.
 *            Defaults to `links.states`.
 *   footer   course tab only — the placeholder rows under the table.
 * None of them computes anything in this file; the standing lives in
 * `ModelStanding`.
 */

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { itemQuery } from '@/lib/queries.popout';
import {
  NO_VALUE,
  formatSeenAt,
  isItemRow,
  scoreText,
  submissionLabel,
  type GradebookLatestRow,
} from '@/lib/queries.grades';
import type { GradebookHistoryRow } from '@/lib/grade-model-input';
import { columnItemKey, type LinkState, type LinkTarget } from '@/lib/grade-model-view';
import tokens from '@/styles/tokens.module.css';
import { LinkColumnControl } from './LinkColumnControl';
import { ScoreHistory } from './ScoreHistory';
import { WhatIfCell, type WhatIfProps } from './WhatIfCell';
import styles from './GradebookTable.module.css';

/** The picker wiring a table needs (course tab only). */
export interface GradebookLinksProps {
  readonly states: ReadonlyMap<string, LinkState>;
  readonly options: readonly { id: number; name: string }[];
  readonly onChange: (state: LinkState, target: LinkTarget) => void;
  /** The item key whose write is in flight, if any. */
  readonly pendingKey?: string | null;
  /** The item key whose last write failed, and why. */
  readonly errorKey?: string | null;
  readonly error?: string | null;
}

/** Everything 10b adds to one row. All optional. */
interface RowExtras {
  readonly whatIf?: WhatIfProps;
  readonly history?: ReadonlyMap<string, readonly GradebookHistoryRow[]>;
  readonly links?: GradebookLinksProps;
  readonly overrides?: ReadonlyMap<string, LinkState>;
}

type Overrides = ReadonlyMap<string, LinkState> | undefined;

function overrideFor(row: GradebookLatestRow, overrides: Overrides): LinkState | undefined {
  const state = overrides?.get(columnItemKey(row.course_id, row.column_id));
  return state?.override ? state : undefined;
}

/** A column Stack linked to a component: it counts, whatever V-1 says. */
function isOverrideCounted(row: GradebookLatestRow, overrides: Overrides): boolean {
  const state = overrideFor(row, overrides);
  return Boolean(state && state.componentId !== null && !state.excluded);
}

/** A column Stack marked "Not graded": it counts toward nothing, whatever V-1 says (R2-8). */
function isOverrideExcluded(row: GradebookLatestRow, overrides: Overrides): boolean {
  return Boolean(overrideFor(row, overrides)?.excluded);
}

/** Among the items: 10a's rule or Stack's link, never when he said "Not graded". */
function isPlacedAsItem(row: GradebookLatestRow, overrides: Overrides): boolean {
  if (isOverrideExcluded(row, overrides)) return false;
  return isItemRow(row) || isOverrideCounted(row, overrides);
}

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

export function GradebookRow({ row, extras = {} }: { row: GradebookLatestRow; extras?: RowExtras }) {
  const submission = submissionLabel(row.submission_status, row.last_attempt_status);
  const overrides = extras.overrides ?? extras.links?.states;
  const counted =
    !isOverrideExcluded(row, overrides)
    && ((row.column_kind === 'attendance' && row.counts_toward_grade === true) || isOverrideCounted(row, overrides));
  const ambiguous = (row.linked_assignments ?? 0) > 1;
  const key = columnItemKey(row.course_id, row.column_id);
  const whatIfTarget = extras.whatIf?.targets.get(key);
  const linkState = extras.links?.states.get(key);
  const historyRows = extras.history?.get(key);

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
          {linkState && extras.links && (
            <LinkColumnControl
              state={linkState}
              options={extras.links.options}
              columnName={row.name}
              onChange={extras.links.onChange}
              pending={extras.links.pendingKey === key}
              error={extras.links.errorKey === key ? extras.links.error : null}
            />
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
          {whatIfTarget && extras.whatIf && (
            <WhatIfCell
              target={whatIfTarget}
              value={extras.whatIf.values[key]}
              onCommit={extras.whatIf.onCommit}
              disabled={extras.whatIf.disabled}
            />
          )}
          {historyRows && <ScoreHistory rows={historyRows} label={row.name} />}
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

function Table({
  rows,
  caption,
  extras,
}: {
  rows: GradebookLatestRow[];
  caption: string;
  extras: RowExtras;
}) {
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
          <GradebookRow key={`${row.course_id}:${row.column_id}`} row={row} extras={extras} />
        ))}
      </tbody>
    </table>
  );
}

export function GradebookTable({
  rows,
  caption = 'Gradebook columns, as Blackboard recorded them',
  whatIf,
  history,
  links,
  overrides,
  footer,
}: {
  rows: GradebookLatestRow[];
  /** Named for the screen reader; the visible heading lives in the card. */
  caption?: string;
  /** Course tab only (Phase 10b). */
  whatIf?: WhatIfProps;
  /** Both screens (Phase 10b): history rows by column item key. */
  history?: ReadonlyMap<string, readonly GradebookHistoryRow[]>;
  /** Course tab only (Phase 10b). */
  links?: GradebookLinksProps;
  /** Both screens (Phase 10b): Stack's link choices, for placement only; defaults to `links.states`. */
  overrides?: ReadonlyMap<string, LinkState>;
  /** Course tab only (Phase 10b): rendered under the table groups. */
  footer?: ReactNode;
}) {
  const [showBookkeeping, setShowBookkeeping] = useState(false);

  const placement = overrides ?? links?.states;
  const { items, bookkeeping } = useMemo(
    () => ({
      items: rows.filter((row) => isPlacedAsItem(row, placement)),
      bookkeeping: rows.filter((row) => row.column_kind !== 'total' && !isPlacedAsItem(row, placement)),
    }),
    [rows, placement],
  );
  const extras = useMemo<RowExtras>(
    () => ({ whatIf, history, links, overrides: placement }),
    [whatIf, history, links, placement],
  );

  if (rows.length === 0) {
    return footer ? (
      <div className={styles.wrap}>
        <p className={styles.empty}>No gradebook columns have been pulled for this course yet.</p>
        {footer}
      </div>
    ) : (
      <p className={styles.empty}>
        No gradebook columns have been pulled for this course yet.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      {items.length > 0 ? (
        <Table rows={items} caption={caption} extras={extras} />
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
            <Table rows={bookkeeping} caption="Attendance and bookkeeping columns" extras={extras} />
          )}
        </div>
      )}

      {footer}
    </div>
  );
}

/** Re-exported so a caller can render the same dash this table uses. */
export { NO_VALUE };
