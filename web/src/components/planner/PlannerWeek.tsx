'use client';

/**
 * /planner — the week grid (R-19, Phase 11).
 *
 * Monday → Sunday columns, 08:00–22:00 in half-hour rows, an Assignments band
 * above them (the all-day band, so named because that is what Stack puts in it)
 * and, beneath it, the Events band for all-day planner events (Phase 11b). Class meetings come from `meetings` (expanded by wall clock, with the
 * room and, when a `sessions` row covers that course and day, its topic); due
 * items come from the same `v_work_items` window Today reads, so a status
 * changed here and a status changed there are the same fact in the same caches.
 *
 * No drag, no day view, no work-window lane (Stack, 2026-09-14). Two kinds of
 * write: the status quick-edit on a due item (`StatusSelect` plus
 * `useSetItemStatus`, the Today mutation, so it can only reach
 * `assignment_progress` / `reading_progress`), and planner events (Phase 11b):
 * an empty slot or Events cell opens `PlannerEventForm`, a planner-event block
 * opens it in edit mode, and a task's checkbox writes `planner_events.done`.
 * Those reach `planner_events` only.
 *
 * `?week=YYYY-MM-DD` is the Monday anchor, so a week is linkable and ◂ ▸ are
 * plain links rather than state. The parameter is untrusted: `weekAnchor`
 * validates it and falls back to the current week rather than throwing.
 *
 * This file is the markup. The queries and the placement are in
 * `usePlannerWeekData`; the arithmetic is in `@/lib/planner-week`, which has no
 * React in it; one block's content is in `PlannerItem`. Nothing here invents a
 * position: a date-only item sits in the band because that is what is recorded,
 * and so does a timed one whose clock falls outside the drawn hours.
 */

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { todayIso } from '@/components/tracker/anchor';
import { itemHref } from '@/lib/queries.popout';
import { useSetItemStatus, type WorkItem } from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import {
  PLANNER_SLOT_COUNT,
  buildPlannerWeek,
  isWithinGridHours,
  localWallClock,
  plannerHours,
  slotOffset,
  weekAnchor,
  type LaneSpan,
  type PlannerDay,
  type PlannerWeekModel,
} from '@/lib/planner-week';
import { EventBlockContent, eventCardProps, type EventActions } from './PlannerEventBlock';
import { PlannerEventForm } from './PlannerEventForm';
import { DaySlots, EventsBand, type SlotPosition } from './PlannerSlots';
import { DayHead, WeekHeader } from './PlannerWeekHeader';
import { usePlannerEventEditor } from './usePlannerEventEditor';
import {
  ItemChip,
  ItemContent,
  MeetingChip,
  MeetingContent,
  itemCardProps,
  type ItemActions,
} from './PlannerItem';
import {
  usePlannerWeekData,
  type BandDay,
  type GridBlock,
  type PlannerWeekData,
} from './usePlannerWeekData';
import styles from './PlannerWeek.module.css';

/** What the band says when the whole week holds nothing. */
const EMPTY_WEEK = 'Nothing scheduled this week.';

/* ---------------------------------------------------------------------------
 * The screen
 * ------------------------------------------------------------------------ */

export function PlannerWeek() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // `?week=` is untrusted input; `weekAnchor` validates it and falls back to
  // the current week rather than throwing.
  const today = todayIso();
  const view = useMemo(
    () => buildPlannerWeek({ weekStart: weekAnchor(searchParams.get('week'), today), today }),
    [searchParams, today],
  );

  const data = usePlannerWeekData(view);
  const setStatus = useSetItemStatus();
  const editor = usePlannerEventEditor();
  const [activeSlot, setActiveSlot] = useState<SlotPosition>({ dayIndex: 0, slot: 0 });

  const actions = itemActions(pathname, view, setStatus, router);

  const itemCount = data.placedItems.timed.length + data.placedItems.allDay.length;
  const isEmpty =
    !data.loading &&
    data.error === null &&
    data.placedMeetings.length === 0 &&
    itemCount === 0 &&
    data.eventCount === 0;

  return (
    <section className={styles.section} aria-label="Week grid">
      <WeekHeader
        view={view}
        pathname={pathname}
        loading={data.loading}
        error={data.error}
        meetingCount={data.placedMeetings.length}
        itemCount={itemCount}
        eventCount={data.eventCount}
      />

      {data.error !== null && (
        <p className={styles.state} role="alert">
          Could not load this week: {data.error.message}
        </p>
      )}

      {editor.alert !== null && (
        <p className={styles.alert} role="alert">
          <span>{editor.alert}</span>
          <button type="button" className={styles.alertDismiss} onClick={editor.dismissAlert}>
            Dismiss
          </button>
        </p>
      )}

      <WeekBoard
        view={view}
        data={data}
        actions={actions}
        eventActions={editor.actions}
        activeSlot={activeSlot}
        onActivateSlot={setActiveSlot}
        isEmpty={isEmpty}
        now={nowSlot(view)}
      />

      <div className={styles.legend}>
        <span>Times are as recorded · a date-only item sits in the Assignments band</span>
        <span>Click an empty slot to add an event · the grid shows New York time</span>
      </div>

      {editor.form !== null && <PlannerEventForm key={editor.form.sessionId} {...editor.form} />}
    </section>
  );
}

/**
 * The three things a due item on the grid can do.
 *
 * Opening the popout must not silently page the grid back to this week, so a
 * paged week rides along on the href. `itemHref` still builds the `?item=`
 * part; `ItemPopout` drops only that parameter when it closes.
 */
function itemActions(
  pathname: string,
  view: PlannerWeekModel,
  setStatus: ReturnType<typeof useSetItemStatus>,
  router: ReturnType<typeof useRouter>,
): ItemActions {
  const weekSuffix = view.isCurrentWeek ? '' : `&week=${view.weekStart}`;
  const href = (id: string) => `${itemHref(pathname, { kind: 'assignment', id })}${weekSuffix}`;
  return {
    href,
    open: (id) => router.push(href(id), { scroll: false }),
    onStatusChange: (item: WorkItem, status: ProgressStatus) =>
      setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status }),
    pendingItemId: setStatus.isPending ? (setStatus.variables?.item.item_id ?? null) : null,
  };
}

/**
 * Where the now-line goes, or null when it means nothing here. This is the
 * reader's own clock and their own calendar day, not the term's zone.
 */
function nowSlot(view: PlannerWeekModel): number | null {
  const now = localWallClock(new Date());
  if (view.todayIndex < 0 || !isWithinGridHours(now.minute)) return null;
  return slotOffset(now.minute);
}

/* ---------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------ */

/** The grid itself: day heads, the all-day band, the gutter, seven columns. */
function WeekBoard({
  view,
  data,
  actions,
  eventActions,
  activeSlot,
  onActivateSlot,
  isEmpty,
  now,
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
}) {
  return (
    <div
      className={styles.board}
      data-planner-board="true"
      style={{ ['--planner-slots' as string]: String(PLANNER_SLOT_COUNT) }}
    >
      <div className={styles.corner} />
      {view.days.map((day) => (
        <DayHead key={`head-${day.iso}`} day={day} />
      ))}

      <AllDayBand view={view} band={data.bandByDay} isEmpty={isEmpty} actions={actions} />
      <EventsBand view={view} band={data.eventBandByDay} actions={eventActions} />

      <HourGutter />
      {view.days.map((day, index) => (
        <DayColumn
          key={`col-${day.iso}`}
          day={day}
          dayCount={view.days.length}
          blocks={data.blocksByDay[index]}
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

function AllDayBand({
  view,
  band,
  isEmpty,
  actions,
}: {
  view: PlannerWeekModel;
  band: BandDay[];
  isEmpty: boolean;
  actions: ItemActions;
}) {
  return (
    <>
      <div className={styles.bandLabel}>Assignments</div>
      {isEmpty ? (
        <div className={styles.bandEmpty}>{EMPTY_WEEK}</div>
      ) : (
        view.days.map((day, index) => (
          <div
            key={`band-${day.iso}`}
            className={styles.bandCell}
            data-today={String(day.isToday)}
            aria-label={`Assignments · ${day.dowLabel}`}
          >
            {band[index].meetings.map((meeting) => (
              <MeetingChip key={meeting.key} meeting={meeting} />
            ))}
            {band[index].items.map((placed) => (
              <ItemChip key={placed.key} placed={placed} actions={actions} />
            ))}
          </div>
        ))
      )}
    </>
  );
}

function HourGutter() {
  return (
    <div className={styles.gutter}>
      {plannerHours().map((hour) => (
        <span
          key={hour.minute}
          className={styles.hourLabel}
          style={{ ['--slot' as string]: String(hour.slot) }}
        >
          {hour.label}
        </span>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  dayCount,
  blocks,
  actions,
  eventActions,
  activeSlot,
  onActivateSlot,
  nowSlot,
}: {
  day: PlannerDay;
  dayCount: number;
  blocks: (GridBlock & LaneSpan)[];
  actions: ItemActions;
  eventActions: EventActions;
  activeSlot: SlotPosition;
  onActivateSlot: (position: SlotPosition) => void;
  nowSlot: number | null;
}) {
  return (
    <div className={styles.dayColumn} data-today={String(day.isToday)} data-day={day.iso}>
      <DaySlots
        day={day}
        dayCount={dayCount}
        active={activeSlot}
        onActivate={onActivateSlot}
        actions={eventActions}
      />
      {nowSlot !== null && (
        <span
          className={styles.nowLine}
          data-testid="now-line"
          style={{ ['--slot' as string]: String(nowSlot) }}
        />
      )}
      {blocks.map((block) => {
        const style = {
          ['--top' as string]: String(block.top),
          ['--height' as string]: String(block.height),
          ['--lane-left' as string]: `${(block.lane / block.lanes) * 100}%`,
          ['--lane-width' as string]: `${100 / block.lanes}%`,
        };
        if (block.kind === 'event') {
          return (
            <div
              key={block.key}
              className={styles.eventBlock}
              data-block="event"
              data-clamped={block.segment.clamped ? 'true' : undefined}
              {...eventCardProps(block.segment.event, eventActions)}
              style={style}
            >
              <EventBlockContent segment={block.segment} actions={eventActions} />
            </div>
          );
        }
        return (
          <div
            key={block.key}
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
      })}
    </div>
  );
}
