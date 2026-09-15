'use client';

/**
 * Everything /planner reads for one week, and the placement that follows from
 * it — split out of `PlannerWeek.tsx` so the screen is markup and this is data.
 *
 * Three queries: the term's `meetings` patterns (not windowed — a couple of
 * dozen rows for the whole term, so paging ◂ ▸ costs no fetch), the `sessions`
 * rows inside the week, and the same `v_work_items` window Today reads. The
 * arithmetic they feed is all in `@/lib/planner-week`, which has no React in it.
 */

import { useMemo } from 'react';
import { isQueryLoading } from '@/components/shared/QueryState';
import { useWorkItemsWindow, type WorkItem } from '@/lib/queries.today';
import {
  assignLanes,
  expandMeetings,
  placeWorkItems,
  slotBox,
  type LaneSpan,
  type PlacedItem,
  type PlacedMeeting,
  type PlacedWorkItems,
  type PlannerWeekModel,
} from '@/lib/planner-week';
import { toMeetingPatterns, useMeetings, useSessionsForWeek } from '@/lib/queries.planner';

/** One positioned block inside a day column: a meeting, or a timed due item. */
export type GridBlock =
  | { kind: 'meeting'; key: string; top: number; height: number; meeting: PlacedMeeting }
  | { kind: 'item'; key: string; top: number; height: number; item: PlacedItem<WorkItem> };

/** What the all-day band holds for one day: undated items, untimed meetings. */
export interface BandDay {
  meetings: PlacedMeeting[];
  items: PlacedItem<WorkItem>[];
}

export interface PlannerWeekData {
  placedMeetings: PlacedMeeting[];
  placedItems: PlacedWorkItems<WorkItem>;
  /** One lane-assigned block list per day column, Monday → Sunday. */
  blocksByDay: (GridBlock & LaneSpan)[][];
  /** One band cell per day column, Monday → Sunday. */
  bandByDay: BandDay[];
  loading: boolean;
  error: Error | null;
}

/** Meetings and timed items share each column, so they share its lanes. */
function buildBlocks(
  meetings: readonly PlacedMeeting[],
  items: PlacedWorkItems<WorkItem>,
  dayCount: number,
): (GridBlock & LaneSpan)[][] {
  const byDay: GridBlock[][] = Array.from({ length: dayCount }, () => []);
  for (const meeting of meetings) {
    if (meeting.startMinute === null) continue;
    const box = slotBox(meeting.startMinute, meeting.endMinute);
    byDay[meeting.dayIndex].push({ kind: 'meeting', key: meeting.key, ...box, meeting });
  }
  for (const placed of items.timed) {
    if (placed.minute === null) continue;
    const box = slotBox(placed.minute, null);
    byDay[placed.dayIndex].push({ kind: 'item', key: placed.key, ...box, item: placed });
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

export function usePlannerWeekData(view: PlannerWeekModel): PlannerWeekData {
  const meetingsQuery = useMeetings();
  const sessionsQuery = useSessionsForWeek(view.weekStart, view.weekEnd);
  const itemsQuery = useWorkItemsWindow(view.weekStart, view.weekEnd);

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

  const blocksByDay = useMemo(
    () => buildBlocks(placedMeetings, placedItems, view.days.length),
    [placedMeetings, placedItems, view.days.length],
  );

  const bandByDay = useMemo(
    () => buildBand(placedMeetings, placedItems, view.days.length),
    [placedMeetings, placedItems, view.days.length],
  );

  return {
    placedMeetings,
    placedItems,
    blocksByDay,
    bandByDay,
    loading:
      isQueryLoading(meetingsQuery) || isQueryLoading(sessionsQuery) || isQueryLoading(itemsQuery),
    error: meetingsQuery.error ?? sessionsQuery.error ?? itemsQuery.error ?? null,
  };
}
