'use client';

/**
 * What a planner event says on the week grid (Phase 11b) — the timed block's
 * body and the Events band chip.
 *
 * Kind decides the style (`data-kind`, six variants on `globals.css` tokens); a
 * course only adds its code to the text and never recolours the block (Q5). An
 * event entered in another zone carries a chip with its own local time
 * ("09:00 PDT"). An online location is a real link, http(s) only, opened in a
 * new tab without handing the page an `opener`. A task has a checkbox that
 * writes `planner_events.done` and nothing else.
 *
 * CLICKING. Anywhere on the block opens the event in the form — never the
 * create form. The title is a real `<button>`, which is the keyboard path and
 * the element focus returns to. The checkbox and the link stop the click so
 * ticking a task or joining a call never opens the editor.
 */

import type { MouseEvent as ReactMouseEvent } from 'react';
import { courseCodeFromId } from '@/lib/queries.today';
import {
  PLANNER_EVENT_KIND_LABELS,
  isHttpUrl,
  isSeriesMember,
  type PlannerEventRow,
} from '@/lib/planner-events';
import type { PlacedAllDayEvent, PlacedEventSegment } from '@/lib/planner-events-grid';
import type { PlannerEventPrefill } from './planner-event-form-state';
import { isOptimisticEvent } from '@/lib/queries.plannerEvents';
import styles from './PlannerWeek.module.css';

/** Everything a planner event on the grid (or an empty slot) can do. */
export interface EventActions {
  /** Open an existing event in the form; `opener` gets focus back on close. */
  edit: (event: PlannerEventRow, opener: HTMLElement) => void;
  /** Open the create form from an empty slot or Events cell. */
  create: (prefill: PlannerEventPrefill, opener: HTMLElement) => void;
  toggleDone: (event: PlannerEventRow, done: boolean) => void;
  /** The task whose `done` write is in flight, if any. */
  pendingDoneId: string | null;
}

function stopClick(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

/** The props that make a block or chip open its event in the form. */
export function eventCardProps(event: PlannerEventRow, actions: EventActions) {
  const saving = isOptimisticEvent(event);
  return {
    'data-kind': event.kind,
    'data-pending': saving ? 'true' : undefined,
    title: saving ? 'Saving…' : `Edit ${event.title}`,
    onClick: (click: ReactMouseEvent<HTMLElement>) => {
      click.stopPropagation();
      if (saving) return;
      const titleButton = click.currentTarget.querySelector<HTMLElement>('[data-edit-event]');
      actions.edit(event, titleButton ?? click.currentTarget);
    },
  };
}

function TaskBox({ event, actions }: { event: PlannerEventRow; actions: EventActions }) {
  if (event.kind !== 'task') return null;
  return (
    <input
      type="checkbox"
      className={styles.eventDone}
      checked={event.done === true}
      disabled={isOptimisticEvent(event) || actions.pendingDoneId === event.id}
      aria-label={`Done: ${event.title}`}
      onClick={stopClick}
      onChange={(change) => actions.toggleDone(event, change.target.checked)}
    />
  );
}

function EventTitle({ event, actions }: { event: PlannerEventRow; actions: EventActions }) {
  return (
    <button
      type="button"
      className={styles.eventTitle}
      data-edit-event="true"
      data-done={event.done === true ? 'true' : undefined}
      disabled={isOptimisticEvent(event)}
      onClick={(click) => {
        click.stopPropagation();
        actions.edit(event, click.currentTarget);
      }}
    >
      {event.title}
    </button>
  );
}

/** 'syr.zoom.us' for a link; null when the URL does not parse. */
function linkHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function EventLocation({ event }: { event: PlannerEventRow }) {
  const location = event.location?.trim();
  if (!location) return null;
  if (event.location_kind === 'online' && isHttpUrl(location)) {
    return (
      <a
        className={styles.eventLink}
        href={location}
        target="_blank"
        rel="noopener noreferrer"
        title={location}
        onClick={stopClick}
      >
        Join · {linkHost(location) ?? 'online'}
      </a>
    );
  }
  return <span className={styles.blockRoom}>{location}</span>;
}

/**
 * The repeat mark (T-1). A detached occurrence has been edited out of its
 * series, so it carries no mark: it no longer moves with the others.
 */
function RepeatMark({ event }: { event: PlannerEventRow }) {
  if (!isSeriesMember(event)) return null;
  return (
    <span className={styles.repeatMark} role="img" aria-label="Repeats">
      ↻
    </span>
  );
}

function KindLine({ event, time }: { event: PlannerEventRow; time: string | null }) {
  return (
    <>
      <span className={styles.eventKind}>{PLANNER_EVENT_KIND_LABELS[event.kind]}</span>
      <RepeatMark event={event} />
      {event.course_id && (
        <span className={styles.blockCode}>{courseCodeFromId(event.course_id)}</span>
      )}
      {time !== null && <span className={styles.blockTime}>{time}</span>}
    </>
  );
}

/**
 * The body of a timed block in a day column: the kind line, the title, then one
 * line for the zone chip and the location. The lines never shrink into each
 * other; a block too short for all of them clips at its bottom edge. A compact
 * block (half an hour or less, `data-compact` on the block) lays the same
 * elements out in one row — see `.eventBlock[data-compact]` in the stylesheet.
 */
export function EventBlockContent({
  segment,
  actions,
}: {
  segment: PlacedEventSegment;
  actions: EventActions;
}) {
  const { event } = segment;
  const hasLocation = Boolean(event.location?.trim());
  return (
    <>
      <span className={styles.blockHead}>
        <TaskBox event={event} actions={actions} />
        <KindLine event={event} time={segment.timeText} />
      </span>
      <EventTitle event={event} actions={actions} />
      {(segment.zoneChip || hasLocation) && (
        <span className={styles.eventMeta} data-event-meta="true">
          {segment.zoneChip && <span className={styles.zoneChip}>{segment.zoneChip}</span>}
          <EventLocation event={event} />
        </span>
      )}
    </>
  );
}

/** An all-day event in the Events band. */
export function EventChip({
  placed,
  actions,
}: {
  placed: PlacedAllDayEvent;
  actions: EventActions;
}) {
  const { event } = placed;
  return (
    <span className={styles.eventChip} data-block="event" {...eventCardProps(event, actions)}>
      <span className={styles.blockHead}>
        <TaskBox event={event} actions={actions} />
        <KindLine event={event} time={null} />
        {placed.zoneChip && <span className={styles.zoneChip}>{placed.zoneChip}</span>}
      </span>
      <EventTitle event={event} actions={actions} />
      <EventLocation event={event} />
    </span>
  );
}
