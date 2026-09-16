/**
 * bb2dash — pure week-grid arithmetic for /planner (R-19, Phase 11).
 *
 * No React, no data access. Everything here takes plain rows and 'YYYY-MM-DD'
 * strings and returns new values, so the week maths (Monday rule, meeting
 * expansion, slot placement, the week label, the term week number) is unit
 * testable without rendering anything. It builds on
 * `components/tracker/anchor.ts` rather than restating its date helpers.
 *
 * TWO CLOCKS, on purpose.
 *
 *   * A `meetings` row carries a wall-clock `HH:MM` and a weekday, not an
 *     instant. It is expanded by *calendar* arithmetic — a new local Date from
 *     (year, month, day) components, never `+ n * 86_400_000` — so a week that
 *     contains a DST change still puts a 15:45 class at 15:45 on both sides of
 *     it. Nothing in this file converts a meeting through a Date.
 *   * `assignments.due_at` is a timestamptz: an instant. Its position on the
 *     grid is its **America/New_York** wall clock, read through `Intl` so the
 *     answer is the same whatever zone the machine running this is in. That is
 *     the term's zone, and it is what the Contract asks for.
 *
 * "Today" and the now-line are the *reader's* own clock and calendar day, the
 * same local reading the rest of the app uses (`anchor.ts`, `queries.today`).
 * For Stack, in Syracuse, the two clocks agree; when they would not, a due time
 * still reads as the course's time and "now" still reads as his.
 *
 * The grid shows what is recorded. The 11:59 PM / class-start rule for
 * date-only items belongs to the calendar push, not here: a date-only item
 * sits in the all-day band, because that is the fact.
 */

import {
  DOW_LABELS,
  MONTH_LABELS,
  addDays,
  daysBetween,
  isValidIsoDate,
  isoDate,
  parseDateOnly,
  shiftIso,
} from '@/components/tracker/anchor';
import { COURSE_TIME_ZONE } from './course-dimension';

/* ---------------------------------------------------------------------------
 * Grid constants
 * ------------------------------------------------------------------------ */

/** Monday → Sunday. Sunday deadlines are common, so the week is seven columns. */
export const PLANNER_DAY_COUNT = 7;
/** First row: 08:00. */
export const PLANNER_START_MINUTE = 8 * 60;
/** Last row ends at 22:00. */
export const PLANNER_END_MINUTE = 22 * 60;
/** One row is half an hour. */
export const PLANNER_SLOT_MINUTES = 30;
/** 28 half-hour rows between 08:00 and 22:00. */
export const PLANNER_SLOT_COUNT =
  (PLANNER_END_MINUTE - PLANNER_START_MINUTE) / PLANNER_SLOT_MINUTES;

/** What a meeting block says when `meetings.location` is null. */
export const ROOM_NOT_RECORDED = 'room not recorded';
/** What a meeting block says when `meetings.start_time` is null. */
export const TIME_NOT_RECORDED = 'time not recorded';

/* ---------------------------------------------------------------------------
 * The Monday rule and the `?week=` anchor
 * ------------------------------------------------------------------------ */

/** The Monday of the week containing `iso`. Sunday belongs to the week before. */
export function mondayOf(iso: string): string {
  const date = parseDateOnly(iso);
  const dow = date.getDay(); // 0 = Sunday
  return isoDate(addDays(date, -(dow === 0 ? 6 : dow - 1)));
}

/**
 * Resolve `?week=YYYY-MM-DD` into a Monday anchor.
 *
 * The parameter comes off the URL, so it is untrusted: anything that is not a
 * real calendar date falls back to the current week rather than throwing, and
 * a valid mid-week date is snapped to its Monday so every anchor is canonical.
 */
export function weekAnchor(raw: string | null | undefined, today: string): string {
  if (!isValidIsoDate(raw)) return mondayOf(today);
  return mondayOf(raw);
}

/** `weeks` whole weeks either side of a Monday anchor (−1 = ◂, +1 = ▸). */
export function shiftWeek(weekStart: string, weeks: number): string {
  return mondayOf(shiftIso(weekStart, Math.trunc(weeks) * PLANNER_DAY_COUNT));
}

/* ---------------------------------------------------------------------------
 * Wall clocks
 * ------------------------------------------------------------------------ */

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/** 'HH:MM[:SS]' → minutes past midnight, or null when the column is empty. */
export function minutesFromTime(time: string | null | undefined): number | null {
  if (typeof time !== 'string') return null;
  const match = TIME_PATTERN.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 945 → '3:45 PM'. */
export function formatClock(minute: number): string {
  const total = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(total / 60);
  const minutes = total % 60;
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${hours24 < 12 ? 'AM' : 'PM'}`;
}

/** A wall-clock reading: the calendar day it fell on, and the minute within it. */
export interface WallClock {
  iso: string;
  minute: number;
}

const NEW_YORK_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: COURSE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * The New York wall clock of an instant. `null` for a missing or unparseable
 * timestamp — a bad value is not a position on the grid.
 *
 * Read through `Intl` rather than by adding a fixed offset, so the answer is
 * right on both sides of a DST change and does not depend on the machine's own
 * zone.
 */
export function newYorkWallClock(instant: string | null | undefined): WallClock | null {
  if (typeof instant !== 'string' || instant.trim() === '') return null;
  const at = new Date(instant);
  if (!Number.isFinite(at.getTime())) return null;

  const parts = new Map(NEW_YORK_PARTS.formatToParts(at).map((part) => [part.type, part.value]));
  const year = parts.get('year');
  const month = parts.get('month');
  const day = parts.get('day');
  const hourText = parts.get('hour');
  const minuteText = parts.get('minute');
  if (!year || !month || !day || !hourText || !minuteText) return null;

  // Some ICU builds report midnight as '24' under hourCycle h24.
  const hour = Number(hourText) % 24;
  return { iso: `${year}-${month}-${day}`, minute: hour * 60 + Number(minuteText) };
}

/** The reader's own wall clock — what the now-line and the today column mean. */
export function localWallClock(now: Date): WallClock {
  return { iso: isoDate(now), minute: now.getHours() * 60 + now.getMinutes() };
}

/* ---------------------------------------------------------------------------
 * Slot arithmetic
 * ------------------------------------------------------------------------ */

/** Does this minute fall inside the drawn hours (08:00 ≤ m < 22:00)? */
export function isWithinGridHours(minute: number): boolean {
  return minute >= PLANNER_START_MINUTE && minute < PLANNER_END_MINUTE;
}

/**
 * Where a minute sits, measured in slots from the top of the grid. Clamped to
 * the drawn hours so a block that starts before 08:00 or runs past 22:00 is
 * still on screen; its label always carries the real time.
 */
export function slotOffset(minute: number): number {
  const clamped = Math.min(Math.max(minute, PLANNER_START_MINUTE), PLANNER_END_MINUTE);
  return (clamped - PLANNER_START_MINUTE) / PLANNER_SLOT_MINUTES;
}

/** A block's geometry in slot units: where it starts and how tall it is. */
export interface SlotBox {
  top: number;
  height: number;
}

/**
 * The box for a [start, end) minute range. A range with no end (or an end at or
 * before its start) gets one slot, so it is still a target you can click.
 */
export function slotBox(startMinute: number, endMinute: number | null): SlotBox {
  const top = slotOffset(startMinute);
  const bottom =
    endMinute !== null && endMinute > startMinute ? slotOffset(endMinute) : top + 1;
  return { top, height: Math.max(1, bottom - top) };
}

/** One hour label in the left gutter, with the slot it starts on. */
export interface PlannerHour {
  minute: number;
  slot: number;
  label: string;
}

/** 08:00 … 21:00 — fourteen labels, each two slots tall. */
export function plannerHours(): PlannerHour[] {
  const hours: PlannerHour[] = [];
  for (let minute = PLANNER_START_MINUTE; minute < PLANNER_END_MINUTE; minute += 60) {
    hours.push({ minute, slot: slotOffset(minute), label: formatClock(minute) });
  }
  return hours;
}

/* ---------------------------------------------------------------------------
 * The week model
 * ------------------------------------------------------------------------ */

export interface PlannerDay {
  /** 0 = Monday … 6 = Sunday. */
  index: number;
  iso: string;
  /** JS weekday, 0 = Sunday — the convention `meetings.day_of_week` uses. */
  dayOfWeek: number;
  dayOfMonth: number;
  dowLabel: string;
  monthLabel: string;
  isToday: boolean;
  isWeekend: boolean;
}

export interface PlannerWeekSpec {
  /** Any date in the week; snapped to its Monday. */
  weekStart: string;
  /** The reader's today, injected rather than read from the clock. */
  today: string;
}

export interface PlannerWeekModel {
  weekStart: string;
  weekEnd: string;
  days: PlannerDay[];
  previousWeek: string;
  nextWeek: string;
  /** −1 when today is not one of these seven days. */
  todayIndex: number;
  isCurrentWeek: boolean;
  /** 'Sep 14 – 20, 2026'. */
  rangeLabel: string;
}

/** Build the seven columns plus the paging anchors either side. */
export function buildPlannerWeek(spec: PlannerWeekSpec): PlannerWeekModel {
  const weekStart = mondayOf(spec.weekStart);
  const start = parseDateOnly(weekStart);

  const days: PlannerDay[] = Array.from({ length: PLANNER_DAY_COUNT }, (_, index) => {
    const date = addDays(start, index);
    const iso = isoDate(date);
    const dayOfWeek = date.getDay();
    return {
      index,
      iso,
      dayOfWeek,
      dayOfMonth: date.getDate(),
      dowLabel: DOW_LABELS[dayOfWeek],
      monthLabel: MONTH_LABELS[date.getMonth()],
      isToday: iso === spec.today,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    };
  });

  const weekEnd = days[days.length - 1].iso;
  return {
    weekStart,
    weekEnd,
    days,
    previousWeek: shiftWeek(weekStart, -1),
    nextWeek: shiftWeek(weekStart, 1),
    todayIndex: days.findIndex((day) => day.isToday),
    isCurrentWeek: weekStart === mondayOf(spec.today),
    rangeLabel: formatWeekRange(weekStart, weekEnd),
  };
}

/**
 * 'Sep 14 – 20, 2026'; 'Nov 30 – Dec 6, 2026' across a month;
 * 'Dec 28, 2026 – Jan 3, 2027' across a year.
 */
export function formatWeekRange(fromIso: string, toIso: string): string {
  const from = parseDateOnly(fromIso);
  const to = parseDateOnly(toIso);
  const fromMonth = MONTH_LABELS[from.getMonth()];
  const toMonth = MONTH_LABELS[to.getMonth()];

  if (from.getFullYear() !== to.getFullYear()) {
    return `${fromMonth} ${from.getDate()}, ${from.getFullYear()} – ${toMonth} ${to.getDate()}, ${to.getFullYear()}`;
  }
  if (from.getMonth() !== to.getMonth()) {
    return `${fromMonth} ${from.getDate()} – ${toMonth} ${to.getDate()}, ${to.getFullYear()}`;
  }
  return `${fromMonth} ${from.getDate()} – ${to.getDate()}, ${to.getFullYear()}`;
}

/** The term the week label can name. */
export interface TermBounds {
  start_date: string;
  end_date: string;
}

/**
 * 'Week 3' of the term, counted from the Monday of the term's first week.
 * `null` when there is no term row or the week falls outside it — a number that
 * is not true of this week is worse than no number.
 */
export function termWeekNumber(
  term: TermBounds | null | undefined,
  weekStart: string,
): number | null {
  if (!term || !isValidIsoDate(term.start_date) || !isValidIsoDate(term.end_date)) return null;
  const firstMonday = mondayOf(term.start_date);
  const lastMonday = mondayOf(term.end_date);
  const anchor = mondayOf(weekStart);
  if (anchor < firstMonday || anchor > lastMonday) return null;
  return Math.floor(daysBetween(firstMonday, anchor) / PLANNER_DAY_COUNT) + 1;
}

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

/** One `meetings` row, with the course code the caller resolved for it. */
export interface MeetingPattern {
  id: number;
  course_id: string;
  /** 0 = Sunday … 6 = Saturday (DATA_SYNTAX; `meetings` checks 0..6). */
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
  course_code: string;
}

/** The `sessions` rows a week's meeting blocks can borrow a topic from. */
export interface SessionRow {
  course_id: string;
  session_date: string;
  topic: string | null;
}

/** One meeting placed on one day of the anchor week. */
export interface PlacedMeeting {
  key: string;
  meetingId: number;
  courseId: string;
  courseCode: string;
  dayIso: string;
  dayIndex: number;
  /** null when `meetings.start_time` is empty — the band holds those. */
  startMinute: number | null;
  endMinute: number | null;
  timeText: string;
  room: string;
  topic: string | null;
}

/** `${course_id}|${session_date}` → the session's topic, for the block label. */
export function sessionTopicIndex(sessions: readonly SessionRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const session of sessions) {
    const topic = session.topic?.trim();
    if (!topic) continue;
    index.set(`${session.course_id}|${session.session_date}`, topic);
  }
  return index;
}

/**
 * Place every meeting pattern on the days of `week` it actually runs on.
 *
 * A row runs on a day when the weekday matches and the day falls inside
 * `starts_on` … `ends_on` (a null bound is open). Both comparisons are string
 * comparisons on ISO dates — they sort lexicographically, so no Date is
 * constructed and no DST boundary can move a class by an hour.
 */
export function expandMeetings(
  meetings: readonly MeetingPattern[],
  week: PlannerWeekModel,
  sessions: readonly SessionRow[] = [],
): PlacedMeeting[] {
  const topics = sessionTopicIndex(sessions);
  const placed: PlacedMeeting[] = [];

  for (const meeting of meetings) {
    for (const day of week.days) {
      if (meeting.day_of_week !== day.dayOfWeek) continue;
      if (meeting.starts_on !== null && day.iso < meeting.starts_on) continue;
      if (meeting.ends_on !== null && day.iso > meeting.ends_on) continue;

      const startMinute = minutesFromTime(meeting.start_time);
      const endMinute = minutesFromTime(meeting.end_time);
      placed.push({
        key: `${meeting.id}:${day.iso}`,
        meetingId: meeting.id,
        courseId: meeting.course_id,
        courseCode: meeting.course_code,
        dayIso: day.iso,
        dayIndex: day.index,
        startMinute,
        endMinute,
        timeText:
          startMinute === null
            ? TIME_NOT_RECORDED
            : endMinute !== null && endMinute > startMinute
              ? `${formatClock(startMinute)} – ${formatClock(endMinute)}`
              : formatClock(startMinute),
        room: meeting.location?.trim() || ROOM_NOT_RECORDED,
        topic: topics.get(`${meeting.course_id}|${day.iso}`) ?? null,
      });
    }
  }

  return placed.sort(
    (a, b) =>
      a.dayIndex - b.dayIndex ||
      (a.startMinute ?? -1) - (b.startMinute ?? -1) ||
      a.courseCode.localeCompare(b.courseCode),
  );
}

/* ---------------------------------------------------------------------------
 * Due items
 * ------------------------------------------------------------------------ */

/** The columns of a `v_work_items` row this module needs to place it. */
export interface DatedWorkItem {
  item_kind: string;
  item_id: string;
  due_on: string | null;
  due_at: string | null;
  due_rule: string | null;
}

/** One due item placed on the grid, or in the all-day band. */
export interface PlacedItem<T extends DatedWorkItem> {
  key: string;
  item: T;
  dayIso: string;
  dayIndex: number;
  /** null for a date-only item; a real minute for a timed one. */
  minute: number | null;
  timeText: string;
}

export interface PlacedWorkItems<T extends DatedWorkItem> {
  /** Items with a wall-clock position inside the drawn hours. */
  timed: PlacedItem<T>[];
  /** Date-only items, and timed ones outside 08:00–22:00. */
  allDay: PlacedItem<T>[];
}

/**
 * Split the week's due items into the grid and the all-day band.
 *
 * The column comes from `due_on` — the view already resolved the item's New
 * York calendar day — and the row from `due_at`'s New York wall clock. A timed
 * item outside the drawn hours (an 11:59 PM Blackboard deadline, say) goes to
 * the band carrying its real time rather than being clamped onto a row it does
 * not belong to; a fake position is still a fake number.
 */
export function placeWorkItems<T extends DatedWorkItem>(
  items: readonly T[],
  week: PlannerWeekModel,
): PlacedWorkItems<T> {
  const columnOf = new Map(week.days.map((day) => [day.iso, day.index]));
  const timed: PlacedItem<T>[] = [];
  const allDay: PlacedItem<T>[] = [];

  for (const item of items) {
    const dayIso = item.due_on;
    if (!dayIso) continue;
    const dayIndex = columnOf.get(dayIso);
    if (dayIndex === undefined) continue;

    const clock = newYorkWallClock(item.due_at);
    const minute = clock?.minute ?? null;
    const placedItem: PlacedItem<T> = {
      key: `${item.item_kind}:${item.item_id}`,
      item,
      dayIso,
      dayIndex,
      minute,
      timeText: minute !== null ? formatClock(minute) : (item.due_rule ?? ''),
    };

    if (minute !== null && isWithinGridHours(minute)) timed.push(placedItem);
    else allDay.push(placedItem);
  }

  timed.sort((a, b) => a.dayIndex - b.dayIndex || (a.minute ?? 0) - (b.minute ?? 0));
  allDay.sort((a, b) => a.dayIndex - b.dayIndex || (a.minute ?? -1) - (b.minute ?? -1));
  return { timed, allDay };
}

/* ---------------------------------------------------------------------------
 * Nesting a due item inside the class it is due in
 * ------------------------------------------------------------------------ */

/** A placed item that also knows which course it belongs to. */
export type CourseWorkItem = DatedWorkItem & { course_id: string };

export interface NestedPlacement<T extends CourseWorkItem> {
  /** Items that belong inside a meeting block, keyed by that meeting's `key`. */
  nested: Map<string, PlacedItem<T>[]>;
  /** Items with no matching class — they keep their own block in the column. */
  standalone: PlacedItem<T>[];
}

/**
 * Move a due item inside the class it is due in (Stack, 2026-09-16).
 *
 * A quiz due at 4:00 PM during the 3:45–5:05 IST 323 lecture is not a second
 * thing happening at 4:00 PM; it is part of that class. When an item's New York
 * wall clock falls within a meeting of the **same course** on the **same day**,
 * it renders inside that meeting's block instead of overlapping it.
 *
 * Deliberately narrow. A different course's class at the same hour is a real
 * clash and stays a separate, overlapping block — hiding it inside someone
 * else's lecture would be a lie. A meeting with no recorded end has no window,
 * so nothing nests in it. Where two meetings of one course overlap on a day,
 * the earlier one takes the item; `meetings` is already day-then-start ordered.
 */
export function nestItemsInMeetings<T extends CourseWorkItem>(
  meetings: readonly PlacedMeeting[],
  items: readonly PlacedItem<T>[],
): NestedPlacement<T> {
  const nested = new Map<string, PlacedItem<T>[]>();
  const standalone: PlacedItem<T>[] = [];

  for (const placed of items) {
    const host = placed.minute === null ? undefined : findHostMeeting(meetings, placed);
    if (!host) {
      standalone.push(placed);
      continue;
    }
    const existing = nested.get(host.key);
    if (existing) existing.push(placed);
    else nested.set(host.key, [placed]);
  }

  return { nested, standalone };
}

/** The same course's class, on the same day, whose window contains this time. */
function findHostMeeting<T extends CourseWorkItem>(
  meetings: readonly PlacedMeeting[],
  placed: PlacedItem<T>,
): PlacedMeeting | undefined {
  const minute = placed.minute;
  if (minute === null) return undefined;
  return meetings.find(
    (meeting) =>
      meeting.dayIso === placed.dayIso &&
      meeting.courseId === placed.item.course_id &&
      meeting.startMinute !== null &&
      meeting.endMinute !== null &&
      minute >= meeting.startMinute &&
      minute <= meeting.endMinute,
  );
}

/* ---------------------------------------------------------------------------
 * Overlap lanes
 * ------------------------------------------------------------------------ */

/** Where a block sits across the width of its day column. */
export interface LaneSpan {
  lane: number;
  lanes: number;
}

interface Spanned {
  top: number;
  height: number;
}

/**
 * Side-by-side lanes for blocks that overlap in time, so a due item at 3:45 PM
 * does not hide the class it is due in. Blocks are swept in start order; a
 * cluster of mutually overlapping blocks shares a lane count, so every block in
 * it gets the same width.
 */
export function assignLanes<T extends Spanned>(blocks: readonly T[]): (T & LaneSpan)[] {
  const ordered = [...blocks].sort((a, b) => a.top - b.top || a.height - b.height);
  const result: (T & LaneSpan)[] = [];

  let cluster: (T & { lane: number })[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = cluster.reduce((max, block) => Math.max(max, block.lane + 1), 1);
    for (const block of cluster) result.push({ ...block, lanes });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const block of ordered) {
    if (block.top >= clusterEnd) flush();

    const taken = new Set(
      cluster.filter((other) => other.top + other.height > block.top).map((other) => other.lane),
    );
    let lane = 0;
    while (taken.has(lane)) lane += 1;

    cluster.push({ ...block, lane });
    clusterEnd = Math.max(clusterEnd, block.top + block.height);
  }
  flush();

  return result;
}
