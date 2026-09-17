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
 * Feedback is the instructor's own words. Phase 12b (G-5) moved the text into
 * the assignment popout, where there is room for all of it — the row shows only
 * that there is some. The disclosure below survives for a column with **no
 * linked assignment**: there is no popout to send the reader to, and the words
 * must not become unreachable. It renders as text, escaped by React,
 * `white-space: pre-wrap` so their line breaks survive, clamped to two lines
 * until it is expanded.
 *
 * The score-history disclosure left with it (G-5, P-grades-8) and now lives in
 * `popout/SubmissionBlock.tsx`.
 *
 * Phase 10b adds optional props, all absent on 10a's call sites:
 *   whatIf   course tab only — a "what if" cell beside the dash on an ungraded,
 *            counted, non-muted item row.
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
import { useSectionState } from '@/lib/grades-sections';
import { itemQuery } from '@/lib/queries.popout';
import {
  NO_VALUE,
  formatSeenAt,
  isItemRow,
  scoreText,
  submissionLabel,
  type GradebookLatestRow,
} from '@/lib/queries.grades';
import { columnItemKey, type LinkState, type LinkTarget } from '@/lib/grade-model-view';
import tokens from '@/styles/tokens.module.css';
import { LinkColumnControl } from './LinkColumnControl';
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

/** Blackboard stores an untouched feedback box as `''` as readily as `null`. */
function hasFeedback(feedback: string | null | undefined): feedback is string {
  return typeof feedback === 'string' && feedback.trim() !== '';
}

/**
 * The mark that says an item carries the instructor's words (P-grades-10,
 * Stack's answer 6).
 *
 * It sits on the item cell because that cell is the link to the details, and it
 * is a superscript `*` — the smallest thing that reads as "there is a note
 * here". `role="note"` gives it a role, so `aria-label` is announced; without
 * one the asterisk would reach a screen reader as bare punctuation or not at
 * all. Present exactly when the feedback is non-empty.
 */
export function FeedbackMark({ itemName }: { itemName: string }) {
  return (
    <sup
      className={styles.feedbackMark}
      role="note"
      aria-label={`${itemName} has feedback`}
      title="The instructor left feedback — open the item to read it."
    >
      *
    </sup>
  );
}

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
        // Spelled out rather than left to an adjacent screen-reader span: the
        // name is computed by joining the nodes' text, which drops the space
        // between them and reads "Feedbackfrom Essay".
        aria-label={`${open ? 'Hide feedback' : 'Feedback'} from ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide feedback' : 'Feedback'}
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
  const feedback = hasFeedback(row.feedback);
  // G-5: with an assignment behind the row, its feedback is in that popout.
  const showsFeedbackInline = feedback && row.assignment_id === null;

  return (
    <>
      <tr className={styles.row} data-column-kind={row.column_kind}>
        {/* Every th/td stays a table cell (round 3, R3-1): the flex layout lives
            on the wrapper inside, so the columns line up with their headers. */}
        <th scope="row" className={styles.nameCell}>
          <div className={styles.nameStack}>
            <span className={styles.nameLine}>
              {row.assignment_id ? (
                <Link className={styles.itemLink} href={itemQuery({ kind: 'assignment', id: row.assignment_id })}>
                  {row.name}
                </Link>
              ) : (
                <span className={styles.itemName}>{row.name}</span>
              )}
              {feedback && <FeedbackMark itemName={row.name} />}
            </span>
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
          </div>
        </th>

        <td>
          <div className={styles.submissionStack}>
            <span className={tokens.tagNeutral} title={submission.status ?? 'Blackboard recorded no submission status.'}>
              {submission.text}
            </span>
            {submission.attemptStatus && (
              <span className={styles.note}>last attempt: {submission.attemptStatus}</span>
            )}
          </div>
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
        </td>

        <td className={styles.seenCell}>
          <span className={tokens.mono} title="When a Blackboard sync last saw this figure.">
            {formatSeenAt(row.seen_at)}
          </span>
        </td>
      </tr>

      {showsFeedbackInline && (
        <tr className={styles.feedbackRow}>
          <td colSpan={4}>
            <FeedbackDisclosure feedback={row.feedback as string} label={row.name} />
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
  links,
  overrides,
  footer,
  sectionKey,
}: {
  rows: GradebookLatestRow[];
  /** Named for the screen reader; the visible heading lives in the card. */
  caption?: string;
  /** Course tab only (Phase 10b). */
  whatIf?: WhatIfProps;
  /** Course tab only (Phase 10b). */
  links?: GradebookLinksProps;
  /** Both screens (Phase 10b): Stack's link choices, for placement only; defaults to `links.states`. */
  overrides?: ReadonlyMap<string, LinkState>;
  /** Course tab only (Phase 10b): rendered under the table groups. */
  footer?: ReactNode;
  /**
   * Phase 12b (P-grades-1): where the bookkeeping group's open/closed choice is
   * remembered. Without it the toggle still works and simply forgets.
   */
  sectionKey?: string;
}) {
  // Collapsed by default — it is the group of columns that count toward
  // nothing, and it was collapsed before it was remembered.
  const [showBookkeeping, toggleBookkeeping] = useSectionState(sectionKey, 'closed');

  const placement = overrides ?? links?.states;
  const { items, bookkeeping } = useMemo(
    () => ({
      items: rows.filter((row) => isPlacedAsItem(row, placement)),
      bookkeeping: rows.filter((row) => row.column_kind !== 'total' && !isPlacedAsItem(row, placement)),
    }),
    [rows, placement],
  );
  const extras = useMemo<RowExtras>(
    () => ({ whatIf, links, overrides: placement }),
    [whatIf, links, placement],
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
            onClick={toggleBookkeeping}
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
