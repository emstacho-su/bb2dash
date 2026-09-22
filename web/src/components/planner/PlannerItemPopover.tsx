'use client';

/**
 * The planner's small assignment popover (Phase 12b, T-2 / P-planner-5).
 *
 * Stack's words: "the popout should be much smaller. I had envisioned a much
 * smaller, almost localized popout when clicking assignments. This popout can
 * have the further option to see the full details." So: on `/planner` only,
 * clicking a due item opens this next to the item rather than the full `?item=`
 * panel over the screen. Every other screen is untouched.
 *
 * What it holds is the short answer — title, course, when it is due, the status
 * quick-edit, the points or the mirrored score, the Blackboard link, and the
 * way through to the full details. Anything longer belongs on the page it links
 * to.
 *
 * NO FABRICATED NUMBERS. The figures come from `assignments.points_possible`
 * and from the gradebook mirror; nothing here divides, totals or projects. When
 * Blackboard has recorded no score the line simply says what the item is worth,
 * and when it has recorded neither there is no line.
 *
 * Geometry lives in `@/lib/popover-position` — this measures and listens, that
 * decides.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import { StatusOptions } from '@/components/tracker/StatusSelect';
import { assignmentPagePath } from '@/lib/assignment-page';
import { placePopover, type PopoverPlacementResult, type Rect } from '@/lib/popover-position';
import { useCourse, type ProgressStatus } from '@/lib/queries';
import { NO_VALUE, scoreText, useAssignmentGrade } from '@/lib/queries.grades';
import { courseCodeFromId } from '@/lib/queries.today';
import {
  useAssignment,
  useAssignmentProgress,
  useSavePlanner,
  type AssignmentProgress,
} from '@/lib/queries.popout';
import { isQueryUnresolved, queryStateText } from '@/components/shared/QueryState';
import { formatDue } from '@/components/popout/assignment-detail-format';
import styles from './PlannerItemPopover.module.css';

/** The board the popover must stay inside — `PlannerBoard` stamps this. */
const BOARD_SELECTOR = '[data-planner-board="true"]';

/**
 * The grid's one tab stop (`PlannerSlots`). Where focus goes when the card the
 * popover was opened from is no longer on the page to take it back (TR-7).
 */
const BOARD_FOCUS_SELECTOR = `${BOARD_SELECTOR} [data-slot][tabindex="0"]`;

/** What the popover is called while it has no title to be called after. */
const LOADING_TITLE = 'Loading assignment…';

/**
 * The one line about points and score, or `null` when nothing is recorded.
 *
 * `score` and `scorePossible` are Blackboard's own figures as the mirror holds
 * them; `pointsPossible` is what the assignment says it is worth. Nothing is
 * computed from them — the line is one mirrored figure, or two, or the points
 * on their own.
 */
export function pointsLine(
  pointsPossible: number | null | undefined,
  score: number | string | null | undefined,
  scorePossible: number | string | null | undefined,
): string | null {
  const hasScore = score !== null && score !== undefined && score !== '';
  if (hasScore) {
    const text = scoreText(score, scorePossible ?? pointsPossible);
    return text === NO_VALUE ? null : text;
  }
  if (pointsPossible === null || pointsPossible === undefined) return null;
  return `${pointsPossible} points possible`;
}

/** A DOM rect as the placement helper wants it — a plain, owned object. */
function rectOf(box: DOMRect): Rect {
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

/**
 * The element focus goes back to when the popover closes: whatever inside the
 * card had focus, else the card's own link or button, else the card.
 */
function openerOf(anchor: HTMLElement): HTMLElement {
  const active = document.activeElement;
  if (active instanceof HTMLElement && anchor.contains(active)) return active;
  return anchor.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? anchor;
}

export function PlannerItemPopover({
  assignmentId,
  anchor,
  onClose,
}: {
  assignmentId: string;
  /** The card that opened it; the popover is placed against this. */
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [at, setAt] = useState<PopoverPlacementResult | null>(null);

  const assignmentQ = useAssignment(assignmentId);
  const progressQ = useAssignmentProgress(assignmentId);
  const assignment = assignmentQ.data ?? null;
  const courseQ = useCourse(assignment?.course_id ?? '');
  const gradeQ = useAssignmentGrade(assignmentId);
  const save = useSavePlanner();

  const grade = gradeQ.data ?? null;
  const course = courseQ.data ?? null;
  const progress = progressQ.data ?? null;
  const status = progress?.status ?? 'not_started';
  const title = assignment?.title ?? LOADING_TITLE;

  const measure = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // TR-7: a card that has left the document measures as a zero rect, which
    // would park the popover in the board's top-left corner. There is nothing
    // left to be anchored to, so it closes instead.
    if (!anchor.isConnected) {
      onClose();
      return;
    }
    const board = document.querySelector(BOARD_SELECTOR);
    setAt(
      placePopover({
        anchor: rectOf(anchor.getBoundingClientRect()),
        popover: { width: panel.offsetWidth, height: panel.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        bounds: board instanceof HTMLElement ? rectOf(board.getBoundingClientRect()) : null,
      }),
    );
  }, [anchor, onClose]);

  /*
   * TR-7, the other half. A re-render is the usual way the card disappears —
   * a refetch re-places the due item, the Assignments band collapses from the
   * keyboard — and neither fires a scroll or a resize, so nothing would have
   * called `measure`. No dependency array on purpose: this asks after every
   * render, which is the only moment the answer can have changed.
   */
  useEffect(() => {
    if (!anchor.isConnected) onClose();
  });

  /*
   * Measure, then place. The panel is rendered hidden until this has run once,
   * so it is never painted in the window's top-left corner on its way to the
   * item. It re-measures when the content that sets its height arrives, and
   * whenever the window or the board moves under it.
   *
   * eslint-disable-next-line react-hooks/set-state-in-effect -- measuring the
   * laid-out DOM is exactly what a layout effect is for; the size cannot be
   * known during render.
   */
  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure, assignment, grade, progress]);

  /*
   * Remember what opened it, and hand focus back on the way out.
   *
   * TR-7: the card may be gone by then — a refetch replaced it, or the band it
   * sat in collapsed. Focus falls back to the grid's own tab stop rather than
   * to `<body>`, which would strand a keyboard reader at the top of the page.
   */
  useEffect(() => {
    openerRef.current = openerOf(anchor);
    panelRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      if (opener && opener.isConnected) {
        opener.focus();
        return;
      }
      document.querySelector<HTMLElement>(BOARD_FOCUS_SELECTOR)?.focus();
    };
  }, [anchor]);

  // Escape, and a press anywhere that is neither the popover nor the card that
  // opened it. A press on the card belongs to the card: it toggles.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target)) return;
      if (anchor.contains(target)) return;
      onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [anchor, onClose]);

  const points = pointsLine(
    assignment?.points_possible,
    grade?.effective_score,
    grade?.possible ?? grade?.points_possible,
  );
  const plannerUnavailable = isQueryUnresolved(progressQ);
  const plannerState = queryStateText(progressQ, 'your plan');
  const detailsPath = assignment ? assignmentPagePath(assignment.course_id, assignmentId) : null;
  const titleId = `planner-popover-title-${encodeURIComponent(assignmentId)}`;

  return (
    <div
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-planner-popover="true"
      data-placement={at?.placement ?? 'below'}
      data-placed={at === null ? 'false' : 'true'}
      style={{
        ['--popover-top' as string]: `${at?.top ?? 0}px`,
        ['--popover-left' as string]: `${at?.left ?? 0}px`,
      }}
    >
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        ✕
      </button>

      <div className={styles.head}>
        {assignment && (
          <span className={tokens.tagAccent}>{courseCodeFromId(assignment.course_id)}</span>
        )}
        <h2 className={styles.title} id={titleId}>
          {title}
        </h2>
      </div>

      {assignmentQ.isError ? (
        <p className={styles.problem} role="alert">
          Could not load this assignment: {(assignmentQ.error as Error).message}
        </p>
      ) : (
        assignment && (
          <>
            <p className={styles.line}>
              Due {formatDue(assignment.due_date, assignment.due_at, assignment.due_rule)}
            </p>

            {points !== null && (
              <p className={styles.line} title="Blackboard's own figures — nothing is computed here.">
                {points}
              </p>
            )}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <select
                className={styles.control}
                value={status}
                disabled={save.isPending || plannerUnavailable}
                onChange={(e) =>
                  save.mutate({
                    assignmentId,
                    patch: { status: e.target.value as AssignmentProgress['status'] },
                  })
                }
              >
                <StatusOptions value={status as ProgressStatus} />
              </select>
            </label>

            {plannerState !== null && <p className={styles.line}>{plannerState}</p>}

            <div className={styles.links}>
              {detailsPath && (
                <Link className={tokens.btnGhost} href={detailsPath}>
                  See full details →
                </Link>
              )}
              {course?.bb_url && (
                <a
                  className={tokens.btnSecondary}
                  href={course.bb_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Course-level link — Blackboard has no stable per-item URL here."
                >
                  Blackboard ↗
                </a>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
