/**
 * bb2dash — where a planner event sits on the week grid (Phase 11b, K-9).
 *
 * Pure. The grid stays on New York (`COURSE_TIME_ZONE`) whatever zone an event
 * was entered in:
 *
 *   * a timed event is placed at its **New York wall clock**, read through
 *     `Intl`. One crossing New York midnight is cut into one segment per day;
 *   * a segment outside 08:00–22:00 is clamped to the grid edge and still
 *     prints its real times;
 *   * a zero-length event (a task with no duration) is as tall as a due card;
 *   * an all-day event sits in the Events band on each of its own dates, in its
 *     own zone — "the 3rd" in Tokyo is the 3rd column, not the 2nd.
 *
 * An event whose zone is not New York also carries a chip with its own local
 * time and `Intl`'s short zone name ("09:00 PDT").
 */

import {
  PLANNER_END_MINUTE,
  PLANNER_SLOT_COUNT,
  PLANNER_START_MINUTE,
  formatClock,
  newYorkWallClock,
  slotOffset,
  type PlannerWeekModel,
} from './planner-week';
import { allDayDates, type PlannerEventRow } from './planner-events';
import {
  DEFAULT_TIME_ZONE,
  localMidnight,
  nextLocalMidnight,
  shortZoneName,
  zoneChipLabel,
} from './planner-zone';

/** A due card's minimum height, in slots — `.itemBlock`'s `min-height`. */
export const DUE_CARD_MIN_SLOTS = 2;
/** The shortest a timed event block is drawn, in slots. */
export const EVENT_MIN_SLOTS = 1;
const MINUTES_PER_DAY = 24 * 60;

/* ---------------------------------------------------------------------------
 * The fetch window
 * ------------------------------------------------------------------------ */

export interface EventWindowBounds {
  /** 00:00 New York on the first day. */
  start: string;
  /** 00:00 New York on the day after the last. */
  end: string;
}

/**
 * The instants bounding a date window, for K-9's predicate
 * `starts_at < end and ends_at >= start`. `>=` keeps a zero-length task that
 * sits exactly on the first midnight. An all-day event in any real zone
 * (UTC−12 … UTC+14) on a date inside the window overlaps these bounds, so the
 * band never misses one.
 */
export function eventWindowBounds(from: string, to: string): EventWindowBounds | null {
  const start = localMidnight(from, DEFAULT_TIME_ZONE);
  const end = nextLocalMidnight(to, DEFAULT_TIME_ZONE);
  if (!start || !end) return null;
  return { start: start.iso, end: end.iso };
}

/** Does a row belong in a window? The same predicate the query sends. */
export function overlapsWindow(
  row: Pick<PlannerEventRow, 'starts_at' | 'ends_at'>,
  bounds: EventWindowBounds,
): boolean {
  return (
    Date.parse(row.starts_at) < Date.parse(bounds.end) &&
    Date.parse(row.ends_at) >= Date.parse(bounds.start)
  );
}

/* ---------------------------------------------------------------------------
 * Placement
 * ------------------------------------------------------------------------ */

/** One day's piece of a timed event. */
export interface PlacedEventSegment {
  key: string;
  event: PlannerEventRow;
  dayIso: string;
  dayIndex: number;
  /** Slot geometry, already clamped into the drawn hours. */
  top: number;
  height: number;
  /** The real New York times, whatever was clamped: '11:00 PM – 1:00 AM'. */
  timeText: string;
  /** '09:00 PDT' when the event's zone is not New York. */
  zoneChip: string | null;
  /** True when some of this segment lies outside 08:00–22:00. */
  clamped: boolean;
  zeroLength: boolean;
}

/** One day's chip for an all-day event. */
export interface PlacedAllDayEvent {
  key: string;
  event: PlannerEventRow;
  dayIso: string;
  dayIndex: number;
  zoneChip: string | null;
}

export interface PlacedPlannerEvents {
  timed: PlacedEventSegment[];
  allDay: PlacedAllDayEvent[];
}

export function placePlannerEvents(
  rows: readonly PlannerEventRow[],
  week: PlannerWeekModel,
): PlacedPlannerEvents {
  const timed: PlacedEventSegment[] = [];
  const allDay: PlacedAllDayEvent[] = [];

  for (const row of rows) {
    if (row.all_day) allDay.push(...allDayChips(row, week));
    else timed.push(...timedSegments(row, week));
  }

  timed.sort((a, b) => a.dayIndex - b.dayIndex || a.top - b.top);
  allDay.sort((a, b) => a.dayIndex - b.dayIndex || a.event.title.localeCompare(b.event.title));
  return { timed, allDay };
}

function chipFor(row: PlannerEventRow): string | null {
  return row.time_zone === DEFAULT_TIME_ZONE ? null : zoneChipLabel(row.starts_at, row.time_zone);
}

function allDayChips(row: PlannerEventRow, week: PlannerWeekModel): PlacedAllDayEvent[] {
  const dates = allDayDates(row);
  if (!dates) return [];
  // No clock on an all-day chip: the zone's short name says whose dates they are.
  const zoneChip =
    row.time_zone === DEFAULT_TIME_ZONE ? null : shortZoneName(row.starts_at, row.time_zone);
  return week.days
    .filter((day) => day.iso >= dates.firstDay && day.iso <= dates.lastDay)
    .map((day) => ({
      key: `${row.id}:${day.iso}`,
      event: row,
      dayIso: day.iso,
      dayIndex: day.index,
      zoneChip,
    }));
}

function timedSegments(row: PlannerEventRow, week: PlannerWeekModel): PlacedEventSegment[] {
  const start = newYorkWallClock(row.starts_at);
  const end = newYorkWallClock(row.ends_at);
  if (!start || !end) return [];

  const zeroLength = Date.parse(row.starts_at) === Date.parse(row.ends_at);
  const timeText = zeroLength
    ? formatClock(start.minute)
    : `${formatClock(start.minute)} – ${formatClock(end.minute)}`;
  const zoneChip = chipFor(row);
  const segments: PlacedEventSegment[] = [];

  for (const day of week.days) {
    if (day.iso < start.iso || day.iso > end.iso) continue;
    // Ending exactly at midnight leaves nothing on the next day.
    if (!zeroLength && day.iso === end.iso && day.iso !== start.iso && end.minute === 0) continue;

    const segStart = day.iso === start.iso ? start.minute : 0;
    const segEnd = day.iso === end.iso ? end.minute : MINUTES_PER_DAY;
    segments.push({
      key: `${row.id}:${day.iso}`,
      event: row,
      dayIso: day.iso,
      dayIndex: day.index,
      ...segmentBox(segStart, segEnd, zeroLength),
      timeText,
      zoneChip,
      clamped:
        segStart < PLANNER_START_MINUTE ||
        segStart >= PLANNER_END_MINUTE ||
        segEnd > PLANNER_END_MINUTE,
      zeroLength,
    });
  }
  return segments;
}

/** Slot geometry for [start, end) minutes, clamped so the block stays on the grid. */
export function segmentBox(
  startMinute: number,
  endMinute: number,
  zeroLength: boolean,
): { top: number; height: number } {
  const rawTop = slotOffset(startMinute);
  const height = zeroLength
    ? DUE_CARD_MIN_SLOTS
    : Math.max(slotOffset(endMinute) - rawTop, EVENT_MIN_SLOTS);
  return { top: Math.max(0, Math.min(rawTop, PLANNER_SLOT_COUNT - height)), height };
}
