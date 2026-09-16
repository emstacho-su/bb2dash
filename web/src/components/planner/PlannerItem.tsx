'use client';

/**
 * What one block on the planner grid says — the meeting body, and the due-item
 * body the grid and the all-day band both render.
 *
 * `ItemContent` is the single description of a due item: glyph and course code
 * from the same ramp Today uses, the recorded time when there is one, the
 * title (a link to the popout for an assignment, plain text for a reading, as
 * on Today) and the status quick-edit. The grid block and the band chip differ
 * only in the wrapper around it.
 *
 * The three things a due item can do travel together as one `ItemActions`, so
 * adding a fourth does not thread another prop through every caller.
 */

import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import { StatusSelect } from '@/components/tracker/StatusSelect';
import { courseCodeFromId, type WorkCategory, type WorkItem } from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import type { PlacedItem, PlacedMeeting } from '@/lib/planner-week';
import styles from './PlannerWeek.module.css';

/** The same glyph ramp Today uses, so a category reads identically everywhere. */
const GLYPH_CLASS: Record<WorkCategory, string> = {
  reading: tokens.glyphReading,
  assignment: tokens.glyphAssignment,
  quiz: tokens.glyphQuiz,
  project: tokens.glyphProject,
  exam: tokens.glyphExam,
};

/** Everything a due item on the grid can do, as one prop. */
export interface ItemActions {
  /** The popout href for an assignment id, week parameter included. */
  href: (assignmentId: string) => string;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId: string | null;
}

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

export function MeetingContent({
  meeting,
  nested,
  actions,
}: {
  meeting: PlacedMeeting;
  /** Due items of this course that fall inside this class's window. */
  nested: readonly PlacedItem<WorkItem>[];
  actions: ItemActions;
}) {
  return (
    <>
      <span className={styles.blockHead}>
        <span className={styles.blockCode}>{meeting.courseCode}</span>
        <span className={styles.blockTime}>{meeting.timeText}</span>
      </span>
      <span className={styles.blockRoom}>{meeting.room}</span>
      {meeting.topic !== null && <span className={styles.blockTopic}>{meeting.topic}</span>}
      {nested.length > 0 && (
        <span className={styles.nested}>
          {nested.map((placed) => (
            <span key={placed.key} className={styles.nestedChip} data-category={placed.item.category}>
              <ItemContent placed={placed} actions={actions} />
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
 * Due items
 * ------------------------------------------------------------------------ */

function ItemTitle({ item, href }: { item: WorkItem; href: string }) {
  // Only assignments have a popout; a reading row is text, as it is on Today.
  if (item.item_kind !== 'assignment') {
    return <span className={styles.blockTitle}>{item.title}</span>;
  }
  return (
    <Link className={`${styles.blockTitle} ${styles.blockLink}`} href={href} scroll={false}>
      {item.title}
    </Link>
  );
}

export function ItemContent({
  placed,
  actions,
}: {
  placed: PlacedItem<WorkItem>;
  actions: ItemActions;
}) {
  const item = placed.item;
  return (
    <>
      <span className={styles.blockHead}>
        <span className={GLYPH_CLASS[item.category]} aria-hidden="true">
          {item.glyph}
        </span>
        <span className={styles.blockCode}>{courseCodeFromId(item.course_id)}</span>
        {placed.timeText !== '' && <span className={styles.blockTime}>{placed.timeText}</span>}
      </span>
      <ItemTitle item={item} href={actions.href(item.item_id)} />
      <span className={styles.blockStatus}>
        <StatusSelect
          item={item}
          onChange={actions.onStatusChange}
          pending={actions.pendingItemId === item.item_id}
        />
      </span>
    </>
  );
}

/** The all-day band's compact form of the same content. */
export function ItemChip({
  placed,
  actions,
}: {
  placed: PlacedItem<WorkItem>;
  actions: ItemActions;
}) {
  return (
    <span className={styles.chip} data-category={placed.item.category}>
      <ItemContent placed={placed} actions={actions} />
    </span>
  );
}

/** An untimed meeting in the band: the course, and why it has no row. */
export function MeetingChip({ meeting }: { meeting: PlacedMeeting }) {
  return (
    <span className={styles.chipMeeting}>
      <span className={styles.blockCode}>{meeting.courseCode}</span>
      <span className={styles.blockTitle}>{meeting.timeText}</span>
    </span>
  );
}
