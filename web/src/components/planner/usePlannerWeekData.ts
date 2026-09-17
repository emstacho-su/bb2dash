'use client';

/**
 * Everything /planner reads for one week, and the placement that follows from
 * it — split out of `PlannerWeek.tsx` so the screen is markup and this is data.
 *
 * Four queries: the term's `meetings` patterns (not windowed — a couple of
 * dozen rows for the whole term, so paging ◂ ▸ costs no fetch), the `sessions`
 * rows inside the week, the same `v_work_items` window Today reads, and the
 * week's `planner_events` (Phase 11b). The arithmetic they feed is all in
 * `@/lib/planner-week` and `@/lib/planner-events-grid`, which have no React.
 */

import { useMemo } from 'react';
import { isQueryLoading } from '@/components/shared/QueryState';
import { useWorkItemsWindow, type WorkItem } from '@/lib/queries.today';
import {
  assignLanes,
  expandMeetings,
  nestItemsInMeetings,
  placeWorkItems,
  slotBox,
  type LaneSpan,
  type PlacedItem,
  type PlacedMeeting,
  type PlacedWorkItems,
  type PlannerWeekModel,
} from '@/lib/planner-week';
import { buildSlotHeights, weekSlotWeights } from '@/lib/planner-rows';
import { toMeetingPatterns, useMeetings, useSessionsForWeek } from '@/lib/queries.planner';
import {
  placePlannerEvents,
  type PlacedAllDayEvent,
  type PlacedEventSegment,
  type PlacedPlannerEvents,
} from '@/lib/planner-events-grid';
import { usePlannerEventsWindow } from '@/lib/queries.plannerEvents';

/**
 * One positioned block inside a day column: a meeting, a timed due item, or
 * one day's segment of a timed planner event.
 *
 * A meeting carries the due items that fall inside it — same course, same day,
 * inside its wall-clock window — so they render as chips in the class rather
 * than as blocks overlapping it.
 *
 * `weight` is how much vertical room the block asks of the rows it covers
 * (P-planner-2). One for an ordinary block; a class asks for one more per
 * nested chip, because those stack inside it rather than beside it.
 */
export type GridBlock = { key: string; top: number; height: number; weight: number } & (
  | { kind: 'meeting'; meeting: PlacedMeeting; nested: PlacedItem<WorkItem>[] }
  | { kind: 'item'; item: PlacedItem<WorkItem> }
  | { kind: 'event'; segment: PlacedEventSegment }
);

/** What the all-day band holds for one day: undated items, untimed meetings. */
export interface BandDay {
  meetings: PlacedMeeting[];
  items: PlacedItem<WorkItem>[];
}

export interface PlannerWeekData {
  placedMeetings: PlacedMeeting[];
  placedItems: PlacedWorkItems<WorkItem>;
  placedEvents: PlacedPlannerEvents;
  /**
   * How many planner events are drawn this week — distinct events with at least
   * one block or chip, not rows fetched: the window also returns an event that
   * ends exactly at Monday 00:00, which draws nothing here (R2-8).
   */
  eventCount: number;
  /** One lane-assigned block list per day column, Monday → Sunday. */
  blocksByDay: (GridBlock & LaneSpan)[][];
  /**
   * One height per half-hour row, in pixels — the week's, not a day's, because
   * the seven columns share their rows with the gutter (P-planner-2). Every
   * position on the grid goes through this table via `slotToPx`.
   */
  slotHeights: number[];
  /** One band cell per day column, Monday → Sunday. */
  bandByDay: BandDay[];
  /** The Events band: all-day planner events per day column, Monday → Sunday. */
  eventBandByDay: PlacedAllDayEvent[][];
  loading: boolean;
  error: Error | null;
}

/**
 * Meetings and the timed items that are not inside one share each column, so
 * they share its lanes. An item due during its own class is a chip in that
 * class's block, not a block of its own.
 */
function buildBlocks(
  meetings: readonly PlacedMeeting[],
  timed: readonly PlacedItem<WorkItem>[],
  nested: ReadonlyMap<string, PlacedItem<WorkItem>[]>,
  segments: readonly PlacedEventSegment[],
  dayCount: number,
): (GridBlock & LaneSpan)[][] {
  const byDay: GridBlock[][] = Array.from({ length: dayCount }, () => []);
  for (const meeting of meetings) {
    if (meeting.startMinute === null) continue;
    const box = slotBox(meeting.startMinute, meeting.endMinute);
    const chips = nested.get(meeting.key) ?? [];
    byDay[meeting.dayIndex].push({
      kind: 'meeting',
      key: meeting.key,
      ...box,
      weight: 1 + chips.length,
      meeting,
      nested: chips,
    });
  }
  for (const placed of timed) {
    if (placed.minute === null) continue;
    const box = slotBox(placed.minute, null);
    byDay[placed.dayIndex].push({
      kind: 'item',
      key: placed.key,
      ...box,
      weight: 1,
      item: placed,
    });
  }
  for (const segment of segments) {
    byDay[segment.dayIndex].push({
      kind: 'event',
      key: `event:${segment.key}`,
      top: segment.top,
      height: segment.height,
      weight: 1,
      segment,
    });
  }
  return byDay.map((blocks) => assignLanes(blocks));
}

/** Date-only items, out-of-hours deadlines and meetings with no recorded time. */
function buildBand(
  meetings: readonly PlacedMeeting[],
  items: PlacedWorkItems<WorkItem>,
  dayCount: number,
): BandDay[] {
  const byDay: BandDay[] = Array.from({ length: dayCount }, () => ({ meetings: [], items: [] }));
  for (const meeting of meetings) {
    if (meeting.startMinute === null) byDay[meeting.dayIndex].meetings.push(meeting);
  }
  for (const placed of items.allDay) byDay[placed.dayIndex].items.push(placed);
  return byDay;
}

/** Distinct planner events with something on screen. */
function renderedEventCount(placed: PlacedPlannerEvents): number {
  return new Set([...placed.timed, ...placed.allDay].map((entry) => entry.event.id)).size;
}

export function usePlannerWeekData(view: PlannerWeekModel): PlannerWeekData {
  const meetingsQuery = useMeetings();
  const sessionsQuery = useSessionsForWeek(view.weekStart, view.weekEnd);
  const itemsQuery = useWorkItemsWindow(view.weekStart, view.weekEnd);
  const eventsQuery = usePlannerEventsWindow(view.weekStart, view.weekEnd);

  const placedMeetings = useMemo(
    () =>
      expandMeetings(
        toMeetingPatterns(meetingsQuery.data ?? []),
        view,
        sessionsQuery.data ?? [],
      ),
    [meetingsQuery.data, sessionsQuery.data, view],
  );

  const placedItems = useMemo(
    () => placeWorkItems(itemsQuery.data ?? [], view),
    [itemsQuery.data, view],
  );

  const placedEvents = useMemo(
    () => placePlannerEvents(eventsQuery.data ?? [], view),
    [eventsQuery.data, view],
  );

  const blocksByDay = useMemo(() => {
    const { nested, standalone } = nestItemsInMeetings(placedMeetings, placedItems.timed);
    return buildBlocks(placedMeetings, standalone, nested, placedEvents.timed, view.days.length);
  }, [placedMeetings, placedItems, placedEvents, view.days.length]);

  const slotHeights = useMemo(
    () => buildSlotHeights(weekSlotWeights(blocksByDay)),
    [blocksByDay],
  );

  const eventBandByDay = useMemo(
    () =>
      view.days.map((day) => placedEvents.allDay.filter((placed) => placed.dayIndex === day.index)),
    [placedEvents, view.days],
  );

  const bandByDay = useMemo(
    () => buildBand(placedMeetings, placedItems, view.days.length),
    [placedMeetings, placedItems, view.days.length],
  );

  return {
    placedMeetings,
    placedItems,
    placedEvents,
    eventCount: renderedEventCount(placedEvents),
    blocksByDay,
    slotHeights,
    bandByDay,
    eventBandByDay,
    loading:
      isQueryLoading(meetingsQuery) ||
      isQueryLoading(sessionsQuery) ||
      isQueryLoading(itemsQuery) ||
      isQueryLoading(eventsQuery),
    error:
      meetingsQuery.error ?? sessionsQuery.error ?? itemsQuery.error ?? eventsQuery.error ?? null,
  };
}
