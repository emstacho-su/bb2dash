'use client';

/**
 * The /planner board itself: day heads, the Assignments band, the Events band,
 * the hour gutter and the seven day columns. Split out of `PlannerWeek.tsx` in
 * Phase 12b, which is a screen again; this file is the grid.
 *
 * EVERY POSITION GOES THROUGH ONE MAP (P-planner-2). Rows are no longer a fixed
 * 24px — a row grows with what is drawn on it — so nothing here multiplies a
 * slot by anything. Blocks, the now-line, the hour labels, the hour rules and
 * the half-hour click targets all ask `slotToPx` (planner-rows.ts) where their
 * slot lands, and hand the answer to the stylesheet in pixels. That is what
 * keeps a click below a grown hour creating an event at the hour it looks like.
 *
 * The hour rules used to be a repeating gradient on the column background, one
 * line every 48px. With rows of different heights an even repeat stops lining
 * up with the gutter's labels, so they are drawn as positioned rules off the
 * same map instead.
 */

import {
  PLANNER_SLOT_COUNT,
  plannerHours,
  type PlannerDay,
  type PlannerWeekModel,
} from '@/lib/planner-week';
import { gridHeightPx, slotToPx, spanPx, titleLines } from '@/lib/planner-rows';
import { isCompactSegment } from '@/lib/planner-events-grid';
import { EventBlockContent, eventCardProps, type EventActions } from './PlannerEventBlock';
import { DaySlots, EventsBand, type SlotPosition } from './PlannerSlots';
import { DayHead } from './PlannerWeekHeader';
import {
  ItemChip,
  ItemContent,
  MeetingChip,
  MeetingContent,
  itemCardProps,
  type ItemActions,
} from './PlannerItem';
import type { BandDay, GridBlock, PlannerWeekData } from './usePlannerWeekData';
import type { LaneSpan } from '@/lib/planner-week';
import styles from './PlannerWeek.module.css';

/** What the band says when the whole week holds nothing. */
export const EMPTY_WEEK = 'Nothing scheduled this week.';

/** The Assignments band's open/closed state, and the one way to change it. */
export interface BandToggle {
  expanded: boolean;
  toggle: () => void;
}

/* ---------------------------------------------------------------------------
 * The board
 * ------------------------------------------------------------------------ */

export function WeekBoard({
  view,
  data,
  actions,
  eventActions,
  activeSlot,
  onActivateSlot,
  isEmpty,
  now,
  band,
}: {
  view: PlannerWeekModel;
  data: PlannerWeekData;
  actions: ItemActions;
  eventActions: EventActions;
  /** The slot holding the grid's one tab stop. */
  activeSlot: SlotPosition;
  onActivateSlot: (position: SlotPosition) => void;
  isEmpty: boolean;
  /** Slot offset of the now-line, or null when it does not belong on screen. */
  now: number | null;
  /** Whether the Assignments band is open, and how to change that. */
  band: BandToggle;
}) {
  const heights = data.slotHeights;
  return (
    <div
      className={styles.board}
      data-planner-board="true"
      style={{
        ['--planner-slots' as string]: String(PLANNER_SLOT_COUNT),
        ['--planner-grid-height' as string]: `${gridHeightPx(heights)}px`,
      }}
    >
      <div className={styles.corner} />
      {view.days.map((day) => (
        <DayHead key={`head-${day.iso}`} day={day} />
      ))}

      <AllDayBand
        view={view}
        days={data.bandByDay}
        isEmpty={isEmpty}
        actions={actions}
        band={band}
      />
      <EventsBand view={view} band={data.eventBandByDay} actions={eventActions} />

      <HourGutter heights={heights} />
      {view.days.map((day, index) => (
        <DayColumn
          key={`col-${day.iso}`}
          day={day}
          dayCount={view.days.length}
          blocks={data.blocksByDay[index]}
          heights={heights}
          actions={actions}
          eventActions={eventActions}
          activeSlot={activeSlot}
          onActivateSlot={onActivateSlot}
          nowSlot={day.isToday ? now : null}
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The Assignments band (P-planner-1)
 * ------------------------------------------------------------------------ */

/** How many things one day's band cell is holding — chips, or the count. */
function bandDayCount(day: BandDay): number {
  return day.meetings.length + day.items.length;
}

/**
 * The Assignments band, and the control that opens it.
 *
 * Closed is the default. A closed band is not a hidden one: each day cell keeps
 * its place and says how many things it is holding, so a deadline can never go
 * missing behind the toggle. The empty-week line is the *week's* state rather
 * than the band's contents, so it shows either way — a blank row would read as
 * a broken screen.
 */
function AllDayBand({
  view,
  days,
  isEmpty,
  actions,
  band,
}: {
  view: PlannerWeekModel;
  days: BandDay[];
  isEmpty: boolean;
  actions: ItemActions;
  band: BandToggle;
}) {
  return (
    <>
      <button
        type="button"
        className={styles.bandToggle}
        aria-expanded={band.expanded}
        title={band.expanded ? 'Hide the Assignments band' : 'Show the Assignments band'}
        onClick={band.toggle}
      >
        <span className={styles.bandChevron} aria-hidden="true">
          {band.expanded ? '▾' : '▸'}
        </span>
        {/* The word is the cell's name, not its contents: it does not fit the
            gutter horizontally and rotating it made the band's height the thing
            that clipped it (P-planner-7). */}
        <span className={styles.bandToggleLabel}>Assignments</span>
      </button>

      {isEmpty ? (
        <div className={styles.bandEmpty}>{EMPTY_WEEK}</div>
      ) : (
        view.days.map((day, index) => (
          <BandCell
            key={`band-${day.iso}`}
            day={day}
            content={days[index]}
            actions={actions}
            expanded={band.expanded}
          />
        ))
      )}
    </>
  );
}

function BandCell({
  day,
  content,
  actions,
  expanded,
}: {
  day: PlannerDay;
  content: BandDay;
  actions: ItemActions;
  expanded: boolean;
}) {
  const count = bandDayCount(content);
  const summary = count === 0 ? 'nothing due' : `${count} due`;
  return (
    <div
      className={styles.bandCell}
      data-today={String(day.isToday)}
      data-band-day={day.iso}
      data-collapsed={expanded ? undefined : 'true'}
      aria-label={`Assignments · ${day.dowLabel} · ${summary}`}
    >
      {expanded ? (
        <>
          {content.meetings.map((meeting) => (
            <MeetingChip key={meeting.key} meeting={meeting} />
          ))}
          {content.items.map((placed) => (
            <ItemChip key={placed.key} placed={placed} actions={actions} />
          ))}
        </>
      ) : (
        count > 0 && (
          <span className={styles.bandCount} aria-hidden="true">
            {count}
          </span>
        )
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * The hour rows
 * ------------------------------------------------------------------------ */

function HourGutter({ heights }: { heights: readonly number[] }) {
  return (
    <div className={styles.gutter}>
      {plannerHours().map((hour) => (
        <span
          key={hour.minute}
          className={styles.hourLabel}
          style={{ ['--top-px' as string]: `${slotToPx(hour.slot, heights)}px` }}
        >
          {hour.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The hour lines inside a day column. The first one is the column's own top
 * edge, which the board's grid gap already draws, so it is skipped.
 */
function HourRules({ heights }: { heights: readonly number[] }) {
  return (
    <>
      {plannerHours()
        .filter((hour) => hour.slot > 0)
        .map((hour) => (
          <span
            key={hour.minute}
            className={styles.hourRule}
            aria-hidden="true"
            style={{ ['--top-px' as string]: `${slotToPx(hour.slot, heights)}px` }}
          />
        ))}
    </>
  );
}

function DayColumn({
  day,
  dayCount,
  blocks,
  heights,
  actions,
  eventActions,
  activeSlot,
  onActivateSlot,
  nowSlot,
}: {
  day: PlannerDay;
  dayCount: number;
  blocks: (GridBlock & LaneSpan)[];
  heights: readonly number[];
  actions: ItemActions;
  eventActions: EventActions;
  activeSlot: SlotPosition;
  onActivateSlot: (position: SlotPosition) => void;
  nowSlot: number | null;
}) {
  return (
    <div className={styles.dayColumn} data-today={String(day.isToday)} data-day={day.iso}>
      <HourRules heights={heights} />
      <DaySlots
        day={day}
        dayCount={dayCount}
        heights={heights}
        active={activeSlot}
        onActivate={onActivateSlot}
        actions={eventActions}
      />
      {nowSlot !== null && (
        <span
          className={styles.nowLine}
          data-testid="now-line"
          style={{ ['--top-px' as string]: `${slotToPx(nowSlot, heights)}px` }}
        />
      )}
      {blocks.map((block) => (
        <Block key={block.key} block={block} heights={heights} actions={actions} eventActions={eventActions} />
      ))}
    </div>
  );
}

/**
 * How many lines a block draws besides its title, so `titleLines` knows what is
 * left over. A meeting always draws its head and its room, and one more line
 * per nested chip; a due card draws its head and its status row; an event draws
 * its kind line, and a meta line when it has a zone chip or a location.
 */
function otherLineCount(block: GridBlock): number {
  if (block.kind === 'meeting') {
    return 2 + (block.meeting.topic === null ? 0 : 1) + block.nested.length * 2;
  }
  if (block.kind === 'item') return 2;
  const { segment } = block;
  return 1 + (segment.zoneChip || segment.event.location?.trim() ? 1 : 0);
}

function Block({
  block,
  heights,
  actions,
  eventActions,
}: {
  block: GridBlock & LaneSpan;
  heights: readonly number[];
  actions: ItemActions;
  eventActions: EventActions;
}) {
  const { topPx, heightPx } = spanPx(block.top, block.height, heights);
  const style = {
    ['--top-px' as string]: `${topPx}px`,
    ['--height-px' as string]: `${heightPx}px`,
    ['--title-lines' as string]: String(titleLines(heightPx, otherLineCount(block))),
    ['--lane-left' as string]: `${(block.lane / block.lanes) * 100}%`,
    ['--lane-width' as string]: `${100 / block.lanes}%`,
  };

  if (block.kind === 'event') {
    return (
      <div
        className={styles.eventBlock}
        data-block="event"
        data-clamped={block.segment.clamped ? 'true' : undefined}
        data-compact={isCompactSegment(block.segment) ? 'true' : undefined}
        {...eventCardProps(block.segment.event, eventActions)}
        style={style}
      >
        <EventBlockContent segment={block.segment} actions={eventActions} />
      </div>
    );
  }

  return (
    <div
      className={block.kind === 'meeting' ? styles.meetingBlock : styles.itemBlock}
      data-block={block.kind}
      data-category={block.kind === 'item' ? block.item.item.category : undefined}
      {...(block.kind === 'item' ? itemCardProps(block.item, actions) : {})}
      style={style}
    >
      {block.kind === 'meeting' ? (
        <MeetingContent meeting={block.meeting} nested={block.nested} actions={actions} />
      ) : (
        <ItemContent placed={block.item} actions={actions} />
      )}
    </div>
  );
}
