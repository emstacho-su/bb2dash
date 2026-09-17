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

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { todayIso } from '@/components/tracker/anchor';
import { useHydrated } from '@/lib/use-hydrated';
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
import { isCompactSegment } from '@/lib/planner-events-grid';
import {
  readStoredBand,
  resolveBand,
  toggleBand,
  writeStoredBand,
  type BandState,
} from './band-preference';
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
/** What the server and the hydrating client both render (see `useHydrated`). */
const LOADING_WEEK = 'Loading the week…';

/* ---------------------------------------------------------------------------
 * The screen
 * ------------------------------------------------------------------------ */

/**
 * The server renders a placeholder, never the grid: it has none of the week's
 * rows, and its clock is UTC. The browser renders the same placeholder while it
 * hydrates and the grid immediately after, from whatever the restored query
 * cache already holds.
 */
export function PlannerWeek() {
  const hydrated = useHydrated();
  if (!hydrated) return <p className={styles.state}>{LOADING_WEEK}</p>;
  return <PlannerWeekScreen />;
}

function PlannerWeekScreen() {
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
  const band = useBandState();

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
        band={band}
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

/** The Assignments band's open/closed state, and the one way to change it. */
export interface BandToggle {
  expanded: boolean;
  toggle: () => void;
}

/**
 * The band's memory (P-planner-1). Read once, on the first render of the
 * screen — which only ever happens in the browser, after `useHydrated`, so
 * there is no server render to disagree with. Every change is written straight
 * back, best-effort; `writeStoredBand` cannot throw.
 */
function useBandState(): BandToggle {
  const [state, setState] = useState<BandState>(() => resolveBand(readStoredBand()));
  // The write stays out of the updater: React may call an updater twice, and a
  // side effect belongs to the event, not to the reducer.
  const toggle = useCallback(() => {
    const next = toggleBand(state);
    setState(next);
    writeStoredBand(next);
  }, [state]);
  return { expanded: state === 'open', toggle };
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

      <AllDayBand
        view={view}
        days={data.bandByDay}
        isEmpty={isEmpty}
        actions={actions}
        band={band}
      />
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

/** How many things one day's band cell is holding — chips, or the count. */
function bandDayCount(day: BandDay): number {
  return day.meetings.length + day.items.length;
}

/**
 * The Assignments band, and the control that opens it (P-planner-1).
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
        title={band.expanded ? 'Hide assignments' : 'Show assignments'}
        onClick={band.toggle}
      >
        <span className={styles.bandChevron} aria-hidden="true">
          {band.expanded ? '▾' : '▸'}
        </span>
        <span className={styles.bandLabelVertical}>Assignments</span>
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
