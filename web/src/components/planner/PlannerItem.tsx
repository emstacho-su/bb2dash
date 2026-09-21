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
 * What a due item can do travels as one `ItemActions`, so adding another does
 * not thread a prop through every caller.
 *
 * CLICKING. The whole card opens the assignment detail, not only its title
 * (Stack, 2026-09-16) — a chip is a small target and the title is smaller
 * still. `itemCardProps` is that behaviour, shared by the grid block, the
 * Assignments band chip and the chip nested in a class, so the three cannot
 * drift. The status select stops the click before it reaches the card, so
 * changing a status never opens anything.
 *
 * WHAT IT OPENS (Phase 12b, T-2 / P-planner-5). On `/planner` the card opens
 * the small anchored popover, not the full `?item=` panel — Stack asked for
 * "almost localized", with the full thing one click further on. Every file in
 * this folder is the planner's alone, so no other screen changes.
 *
 * The title stays a real `<a href>`, now pointing at the full-details page: it
 * is what tells a screen reader the card leads somewhere, and a middle- or
 * modified click still opens that page. A plain click (or Enter, which fires
 * one) is cancelled and left to bubble to the card, which opens the popover —
 * so the mouse and the keyboard do the same thing.
 */

import type { MouseEvent as ReactMouseEvent } from 'react';
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
  /** The full-details page for this item — where the title link points. */
  href: (item: WorkItem) => string;
  /** Open the small popover against the card — what clicking anywhere does. */
  open: (assignmentId: string, anchor: HTMLElement) => void;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId: string | null;
  /** The assignment whose popover is open, if one is. */
  openItemId: string | null;
}

/** The props that make a card open the popout. Empty for a reading: it has none. */
export interface ItemCardProps {
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
  title?: string;
  'data-open'?: string;
}

/** Keep a click on something interactive from also opening the popover. */
function stopCardClick(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

/**
 * A click the reader meant for the browser rather than for the app: a new tab,
 * a new window, a download. The card must not swallow one.
 */
function isModifiedClick(event: ReactMouseEvent<HTMLElement>): boolean {
  return (
    event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  );
}

export function itemCardProps(
  placed: PlacedItem<WorkItem>,
  actions: ItemActions,
): ItemCardProps {
  const item = placed.item;
  // Only assignments have a detail; a reading card is text, as it is on Today.
  if (item.item_kind !== 'assignment') return {};
  return {
    onClick: (event) => {
      if (isModifiedClick(event)) return;
      event.stopPropagation();
      actions.open(item.item_id, event.currentTarget);
    },
    title: `Open ${item.title}`,
    'data-open': 'true',
  };
}

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

/**
 * What a class block says on hover.
 *
 * Since F-2 a block draws a whole number of lines and clips the rest, so a
 * 55-minute class has room for its code, its time and its room, and its topic
 * is simply not drawn. Half a line was worse, but a topic that exists and is
 * nowhere on screen would be worse still — the tooltip is where it goes, and it
 * carries every line whether or not the block had room for it.
 */
export function meetingTooltip(meeting: PlacedMeeting): string {
  return [meeting.courseCode, meeting.timeText, meeting.room, meeting.topic]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
}

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
            <span
              key={placed.key}
              className={styles.nestedChip}
              data-category={placed.item.category}
              {...itemCardProps(placed, actions)}
            >
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

function ItemTitle({
  item,
  href,
  expanded,
}: {
  item: WorkItem;
  href: string;
  /** Whether this item's popover is the one that is open. */
  expanded: boolean;
}) {
  // Only assignments have a detail; a reading row is text, as it is on Today.
  if (item.item_kind !== 'assignment') {
    return <span className={styles.blockTitle}>{item.title}</span>;
  }
  return (
    <Link
      className={`${styles.blockTitle} ${styles.blockLink}`}
      href={href}
      scroll={false}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={(event) => {
        // A modified click is the reader asking for the page itself; a plain
        // one belongs to the card, which opens the popover — so it is cancelled
        // here and deliberately left to bubble.
        if (isModifiedClick(event)) return;
        event.preventDefault();
      }}
    >
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
      <ItemTitle
        item={item}
        href={actions.href(item)}
        expanded={actions.openItemId === item.item_id}
      />
      <span className={styles.blockStatus} onClick={stopCardClick} onMouseDown={stopCardClick}>
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
    <span
      className={styles.chip}
      data-category={placed.item.category}
      {...itemCardProps(placed, actions)}
    >
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
