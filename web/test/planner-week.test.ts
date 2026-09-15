/**
 * The planner week's arithmetic, with nothing rendered.
 *
 * Five fixture weeks, as the Phase 11 Contract asks for: an ordinary week
 * (2026-09-14), the fall-back week (2026-11-01, DST ends that Sunday), the
 * spring-forward week (2026-03-08), an empty week, and a week that straddles a
 * meeting's `ends_on` (2026-12-07).
 *
 * The DST cases are the point of the module. A `meetings` row carries a
 * wall-clock time, so a 15:45 class stays at 15:45 on both sides of a change;
 * a `due_at` is an instant, so the same UTC offset reads as a different New
 * York clock either side of it. Both assertions are made against fixed UTC
 * timestamps, so they hold whatever zone this test runs in.
 *
 * Only the `?week=` fallback needs a clock at all, and it gets a frozen one.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLANNER_END_MINUTE,
  PLANNER_SLOT_COUNT,
  PLANNER_START_MINUTE,
  ROOM_NOT_RECORDED,
  TIME_NOT_RECORDED,
  assignLanes,
  buildPlannerWeek,
  expandMeetings,
  formatClock,
  formatWeekRange,
  isWithinGridHours,
  minutesFromTime,
  mondayOf,
  newYorkWallClock,
  placeWorkItems,
  plannerHours,
  sessionTopicIndex,
  shiftWeek,
  slotBox,
  slotOffset,
  termWeekNumber,
  weekAnchor,
  type DatedWorkItem,
  type MeetingPattern,
} from '@/lib/planner-week';
import { todayIso } from '@/components/tracker/anchor';

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

const ORDINARY_WEEK = '2026-09-14'; // Monday
const FALL_BACK_SUNDAY = '2026-11-01'; // DST ends; the week it closes is Oct 26
const SPRING_FORWARD_SUNDAY = '2026-03-08'; // DST starts; the week it closes is Mar 2
const ENDS_ON_WEEK = '2026-12-07'; // Monday; IST.323 stops mid-week

function week(weekStart: string, today = ORDINARY_WEEK) {
  return buildPlannerWeek({ weekStart, today });
}

function meeting(overrides: Partial<MeetingPattern> = {}): MeetingPattern {
  return {
    id: 1,
    course_id: 'IST.323',
    day_of_week: 3, // Wednesday
    start_time: '15:45:00',
    end_time: '17:05:00',
    location: 'Hinds Hall 010',
    starts_on: null,
    ends_on: null,
    course_code: 'IST 323',
    ...overrides,
  };
}

function workItem(overrides: Partial<DatedWorkItem> = {}): DatedWorkItem {
  return {
    item_kind: 'assignment',
    item_id: 'IST.323/lab-1',
    due_on: '2026-09-16',
    due_at: null,
    due_rule: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

/* ---------------------------------------------------------------------------
 * The Monday rule and the `?week=` anchor
 * ------------------------------------------------------------------------ */

describe('mondayOf — Sunday belongs to the week that is ending', () => {
  it('leaves a Monday alone', () => {
    expect(mondayOf(ORDINARY_WEEK)).toBe('2026-09-14');
  });

  it('pulls a mid-week day back to its Monday', () => {
    expect(mondayOf('2026-09-16')).toBe('2026-09-14');
    expect(mondayOf('2026-09-19')).toBe('2026-09-14');
  });

  it('pulls Sunday back six days, not forward one', () => {
    expect(mondayOf('2026-09-20')).toBe('2026-09-14');
    expect(mondayOf(FALL_BACK_SUNDAY)).toBe('2026-10-26');
    expect(mondayOf(SPRING_FORWARD_SUNDAY)).toBe('2026-03-02');
  });

  it('crosses a month and a year boundary', () => {
    expect(mondayOf('2026-01-01')).toBe('2025-12-29');
  });
});

describe('weekAnchor — `?week=` is untrusted input', () => {
  it('falls back to the current week when the parameter is absent', () => {
    expect(weekAnchor(null, '2026-09-17')).toBe('2026-09-14');
    expect(weekAnchor(undefined, '2026-09-17')).toBe('2026-09-14');
    expect(weekAnchor('', '2026-09-17')).toBe('2026-09-14');
  });

  it('falls back on a malformed or impossible date rather than throwing', () => {
    expect(weekAnchor('not-a-date', '2026-09-17')).toBe('2026-09-14');
    expect(weekAnchor('2026-02-31', '2026-09-17')).toBe('2026-09-14');
    expect(weekAnchor('2026-9-14', '2026-09-17')).toBe('2026-09-14');
    expect(weekAnchor('<script>', '2026-09-17')).toBe('2026-09-14');
  });

  it('snaps a valid mid-week anchor to its Monday, so every anchor is canonical', () => {
    expect(weekAnchor('2026-11-01', '2026-09-17')).toBe('2026-10-26');
  });

  it('reads "the current week" off a frozen clock the same way', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 1, 9, 0, 0)); // local Sunday 2026-11-01
    expect(weekAnchor(null, todayIso())).toBe('2026-10-26');
  });
});

describe('shiftWeek — what ◂ and ▸ actually write', () => {
  it('moves whole weeks either way', () => {
    expect(shiftWeek(ORDINARY_WEEK, -1)).toBe('2026-09-07');
    expect(shiftWeek(ORDINARY_WEEK, 1)).toBe('2026-09-21');
    expect(shiftWeek(ORDINARY_WEEK, 0)).toBe('2026-09-14');
  });

  it('crosses the fall-back and spring-forward weeks without losing a day', () => {
    expect(shiftWeek('2026-10-26', 1)).toBe('2026-11-02');
    expect(shiftWeek('2026-11-02', -1)).toBe('2026-10-26');
    expect(shiftWeek('2026-03-02', 1)).toBe('2026-03-09');
  });

  it('crosses a year boundary', () => {
    expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04');
  });

  it('is exactly reversible, which is what makes paging linkable', () => {
    const forward = shiftWeek(shiftWeek(ORDINARY_WEEK, 1), 1);
    expect(shiftWeek(shiftWeek(forward, -1), -1)).toBe(ORDINARY_WEEK);
  });
});

/* ---------------------------------------------------------------------------
 * The week model
 * ------------------------------------------------------------------------ */

describe('buildPlannerWeek', () => {
  it('lays out Monday → Sunday with the paging anchors either side', () => {
    const view = week(ORDINARY_WEEK);
    expect(view.days).toHaveLength(7);
    expect(view.days.map((d) => d.iso)).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(view.days.map((d) => d.dowLabel)).toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
    expect(view.weekEnd).toBe('2026-09-20');
    expect(view.previousWeek).toBe('2026-09-07');
    expect(view.nextWeek).toBe('2026-09-21');
  });

  it('snaps a mid-week weekStart to its Monday', () => {
    expect(week('2026-09-17').weekStart).toBe('2026-09-14');
  });

  it('marks today only when today is in this week', () => {
    const current = buildPlannerWeek({ weekStart: ORDINARY_WEEK, today: '2026-09-17' });
    expect(current.todayIndex).toBe(3);
    expect(current.isCurrentWeek).toBe(true);
    expect(current.days[3].isToday).toBe(true);

    const other = buildPlannerWeek({ weekStart: '2026-09-21', today: '2026-09-17' });
    expect(other.todayIndex).toBe(-1);
    expect(other.isCurrentWeek).toBe(false);
    expect(other.days.some((d) => d.isToday)).toBe(false);
  });

  it('flags the weekend columns', () => {
    expect(week(ORDINARY_WEEK).days.map((d) => d.isWeekend)).toEqual([
      false, false, false, false, false, true, true,
    ]);
  });
});

describe('formatWeekRange — the header line', () => {
  it('names one month once', () => {
    expect(formatWeekRange('2026-09-14', '2026-09-20')).toBe('Sep 14 – 20, 2026');
  });

  it('names both months when the week straddles one', () => {
    expect(formatWeekRange('2026-10-26', '2026-11-01')).toBe('Oct 26 – Nov 1, 2026');
  });

  it('names both years when the week straddles one', () => {
    expect(formatWeekRange('2026-12-28', '2027-01-03')).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
});

describe('termWeekNumber — a number only when it is true of this week', () => {
  const term = { start_date: '2026-08-24', end_date: '2026-12-11' };

  it('counts from the Monday of the term first week', () => {
    expect(termWeekNumber(term, '2026-08-24')).toBe(1);
    expect(termWeekNumber(term, '2026-09-14')).toBe(4);
    expect(termWeekNumber(term, ENDS_ON_WEEK)).toBe(16);
  });

  it('counts a mid-week anchor as its own week', () => {
    expect(termWeekNumber(term, '2026-09-17')).toBe(4);
  });

  it('returns null outside the term, and with no term at all', () => {
    expect(termWeekNumber(term, '2026-08-17')).toBeNull();
    expect(termWeekNumber(term, '2027-01-04')).toBeNull();
    expect(termWeekNumber(null, ORDINARY_WEEK)).toBeNull();
    expect(termWeekNumber({ start_date: 'nope', end_date: 'nope' }, ORDINARY_WEEK)).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Clocks and slots
 * ------------------------------------------------------------------------ */

describe('wall-clock helpers', () => {
  it('parses a Postgres time, and refuses anything else', () => {
    expect(minutesFromTime('15:45:00')).toBe(945);
    expect(minutesFromTime('08:00')).toBe(480);
    expect(minutesFromTime(null)).toBeNull();
    expect(minutesFromTime('25:00:00')).toBeNull();
    expect(minutesFromTime('half past three')).toBeNull();
  });

  it('formats a minute as a 12-hour clock', () => {
    expect(formatClock(480)).toBe('8:00 AM');
    expect(formatClock(945)).toBe('3:45 PM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(23 * 60 + 59)).toBe('11:59 PM');
  });

  it('draws fourteen hour labels over twenty-eight slots', () => {
    const hours = plannerHours();
    expect(PLANNER_SLOT_COUNT).toBe(28);
    expect(hours).toHaveLength(14);
    expect(hours[0]).toEqual({ minute: PLANNER_START_MINUTE, slot: 0, label: '8:00 AM' });
    expect(hours[13].label).toBe('9:00 PM');
    expect(slotOffset(PLANNER_END_MINUTE)).toBe(PLANNER_SLOT_COUNT);
  });

  it('knows which minutes the grid actually draws', () => {
    expect(isWithinGridHours(480)).toBe(true);
    expect(isWithinGridHours(945)).toBe(true);
    expect(isWithinGridHours(479)).toBe(false);
    expect(isWithinGridHours(23 * 60 + 59)).toBe(false);
  });

  it('boxes a meeting by its wall clock, and clamps one that runs off the grid', () => {
    const block = slotBox(945, 1025);
    expect(block.top).toBe(15.5);
    expect(block.height).toBeCloseTo(8 / 3, 10);
    expect(slotBox(480, null)).toEqual({ top: 0, height: 1 });
    expect(slotBox(7 * 60, 9 * 60)).toEqual({ top: 0, height: 2 });
    expect(slotBox(21 * 60, 23 * 60)).toEqual({ top: 26, height: 2 });
  });
});

describe('newYorkWallClock — an instant read in the term zone', () => {
  it('reads a summer instant as EDT', () => {
    expect(newYorkWallClock('2026-09-16T19:45:00Z')).toEqual({
      iso: '2026-09-16',
      minute: 945,
    });
  });

  it('reads the same UTC offset differently either side of the fall back', () => {
    // 2026-11-01 02:00 EDT → 01:00 EST. 19:45Z is 15:45 before, 14:45 after.
    expect(newYorkWallClock('2026-10-28T19:45:00Z')?.minute).toBe(945);
    expect(newYorkWallClock('2026-11-04T19:45:00Z')?.minute).toBe(885);
  });

  it('reads the same UTC offset differently either side of the spring forward', () => {
    // 2026-03-08 02:00 EST → 03:00 EDT. 18:00Z is 13:00 before, 14:00 after.
    expect(newYorkWallClock('2026-03-06T18:00:00Z')?.minute).toBe(13 * 60);
    expect(newYorkWallClock('2026-03-11T18:00:00Z')?.minute).toBe(14 * 60);
  });

  it('crosses midnight into the previous New York day', () => {
    expect(newYorkWallClock('2026-09-17T03:00:00Z')).toEqual({
      iso: '2026-09-16',
      minute: 23 * 60,
    });
  });

  it('refuses a missing or unparseable timestamp rather than guessing', () => {
    expect(newYorkWallClock(null)).toBeNull();
    expect(newYorkWallClock('')).toBeNull();
    expect(newYorkWallClock('not a timestamp')).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

describe('expandMeetings — ordinary week', () => {
  const view = week(ORDINARY_WEEK);

  it('places a pattern on its weekday, at its wall clock', () => {
    const [placed] = expandMeetings([meeting()], view);
    expect(placed.dayIso).toBe('2026-09-16');
    expect(placed.dayIndex).toBe(2);
    expect(placed.startMinute).toBe(945);
    expect(placed.endMinute).toBe(1025);
    expect(placed.timeText).toBe('3:45 PM – 5:05 PM');
    expect(placed.room).toBe('Hinds Hall 010');
  });

  it('places a Sunday pattern in the last column, not the first', () => {
    const [placed] = expandMeetings([meeting({ day_of_week: 0 })], view);
    expect(placed.dayIso).toBe('2026-09-20');
    expect(placed.dayIndex).toBe(6);
  });

  it('says so when the room is not recorded', () => {
    expect(expandMeetings([meeting({ location: null })], view)[0].room).toBe(ROOM_NOT_RECORDED);
    expect(expandMeetings([meeting({ location: '   ' })], view)[0].room).toBe(ROOM_NOT_RECORDED);
  });

  it('says so when the time is not recorded, and keeps the row', () => {
    const [placed] = expandMeetings([meeting({ start_time: null, end_time: null })], view);
    expect(placed.startMinute).toBeNull();
    expect(placed.timeText).toBe(TIME_NOT_RECORDED);
  });

  it('borrows the topic of a session on that course and day, and only that one', () => {
    const sessions = [
      { course_id: 'IST.323', session_date: '2026-09-16', topic: 'Risk assessment' },
      { course_id: 'IST.323', session_date: '2026-09-23', topic: 'Next week' },
      { course_id: 'ECN.304', session_date: '2026-09-16', topic: 'Another course' },
    ];
    expect(expandMeetings([meeting()], view, sessions)[0].topic).toBe('Risk assessment');
    expect(expandMeetings([meeting()], view, [])[0].topic).toBeNull();
  });

  it('ignores a session whose topic is blank', () => {
    const sessions = [{ course_id: 'IST.323', session_date: '2026-09-16', topic: '  ' }];
    expect(sessionTopicIndex(sessions).size).toBe(0);
    expect(expandMeetings([meeting()], view, sessions)[0].topic).toBeNull();
  });

  it('orders blocks by day, then by start time', () => {
    const placed = expandMeetings(
      [
        meeting({ id: 1, day_of_week: 5, start_time: '09:00:00' }),
        meeting({ id: 2, day_of_week: 1, start_time: '14:00:00' }),
        meeting({ id: 3, day_of_week: 1, start_time: '09:30:00' }),
      ],
      view,
    );
    expect(placed.map((p) => p.meetingId)).toEqual([3, 2, 1]);
  });
});

describe('expandMeetings — the term bounds', () => {
  it('keeps a pattern whose bounds are open', () => {
    expect(expandMeetings([meeting()], week(ORDINARY_WEEK))).toHaveLength(1);
  });

  it('drops a day before starts_on and after ends_on', () => {
    const view = week(ORDINARY_WEEK);
    expect(expandMeetings([meeting({ starts_on: '2026-09-17' })], view)).toHaveLength(0);
    expect(expandMeetings([meeting({ ends_on: '2026-09-15' })], view)).toHaveLength(0);
    expect(expandMeetings([meeting({ starts_on: '2026-09-16' })], view)).toHaveLength(1);
    expect(expandMeetings([meeting({ ends_on: '2026-09-16' })], view)).toHaveLength(1);
  });

  it('keeps the days before ends_on and drops the ones after, inside one week', () => {
    // 2026-12-07 week: the course meets Mon/Wed/Fri but stops after Wednesday.
    const view = week(ENDS_ON_WEEK, ENDS_ON_WEEK);
    const pattern = [
      meeting({ id: 1, day_of_week: 1, ends_on: '2026-12-09' }),
      meeting({ id: 2, day_of_week: 3, ends_on: '2026-12-09' }),
      meeting({ id: 3, day_of_week: 5, ends_on: '2026-12-09' }),
    ];
    expect(expandMeetings(pattern, view).map((p) => p.dayIso)).toEqual([
      '2026-12-07',
      '2026-12-09',
    ]);
  });
});

describe('expandMeetings — DST is not allowed to move a class', () => {
  it('keeps a 15:45 class at 15:45 either side of the fall back', () => {
    const before = expandMeetings([meeting()], week('2026-10-26', ENDS_ON_WEEK))[0];
    const after = expandMeetings([meeting()], week('2026-11-02', ENDS_ON_WEEK))[0];
    expect(before.dayIso).toBe('2026-10-28');
    expect(after.dayIso).toBe('2026-11-04');
    expect(before.startMinute).toBe(945);
    expect(after.startMinute).toBe(945);
    expect(after.timeText).toBe('3:45 PM – 5:05 PM');
  });

  it('keeps a 15:45 class at 15:45 either side of the spring forward', () => {
    const before = expandMeetings([meeting()], week('2026-03-02', ORDINARY_WEEK))[0];
    const after = expandMeetings([meeting()], week('2026-03-09', ORDINARY_WEEK))[0];
    expect(before.dayIso).toBe('2026-03-04');
    expect(after.dayIso).toBe('2026-03-11');
    expect(before.startMinute).toBe(945);
    expect(after.startMinute).toBe(945);
  });
});

describe('an empty week', () => {
  const view = week('2026-11-23', ORDINARY_WEEK); // Thanksgiving week

  it('still has its seven columns', () => {
    expect(view.days).toHaveLength(7);
    expect(view.rangeLabel).toBe('Nov 23 – 29, 2026');
  });

  it('places nothing when there is nothing to place', () => {
    expect(expandMeetings([], view)).toEqual([]);
    expect(placeWorkItems([], view)).toEqual({ timed: [], allDay: [] });
  });

  it('places nothing when every pattern has run out', () => {
    expect(expandMeetings([meeting({ ends_on: '2026-11-20' })], view)).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Due items
 * ------------------------------------------------------------------------ */

describe('placeWorkItems', () => {
  const view = week(ORDINARY_WEEK);

  it('puts a date-only item in the all-day band, with no invented time', () => {
    const { timed, allDay } = placeWorkItems([workItem()], view);
    expect(timed).toHaveLength(0);
    expect(allDay).toHaveLength(1);
    expect(allDay[0].dayIndex).toBe(2);
    expect(allDay[0].minute).toBeNull();
    expect(allDay[0].timeText).toBe('');
  });

  it('shows a date-only item due_rule rather than a clock', () => {
    const [placed] = placeWorkItems([workItem({ due_rule: 'before class' })], view).allDay;
    expect(placed.timeText).toBe('before class');
  });

  it('puts a timed item at its New York wall clock', () => {
    const { timed } = placeWorkItems(
      [workItem({ due_at: '2026-09-16T19:45:00Z' })],
      view,
    );
    expect(timed).toHaveLength(1);
    expect(timed[0].minute).toBe(945);
    expect(timed[0].timeText).toBe('3:45 PM');
    expect(timed[0].dayIndex).toBe(2);
  });

  it('sends an 11:59 PM deadline to the band rather than clamping it onto 10 PM', () => {
    const { timed, allDay } = placeWorkItems(
      [workItem({ due_at: '2026-09-17T03:59:00Z' })], // 23:59 EDT on 2026-09-16
      view,
    );
    expect(timed).toHaveLength(0);
    expect(allDay[0].timeText).toBe('11:59 PM');
  });

  it('drops an item with no due_on, or one outside the week', () => {
    const { timed, allDay } = placeWorkItems(
      [workItem({ due_on: null }), workItem({ due_on: '2026-09-28' })],
      view,
    );
    expect(timed).toHaveLength(0);
    expect(allDay).toHaveLength(0);
  });

  it('orders by day, then by time', () => {
    const { timed } = placeWorkItems(
      [
        workItem({ item_id: 'c', due_on: '2026-09-17', due_at: '2026-09-17T14:00:00Z' }),
        workItem({ item_id: 'a', due_on: '2026-09-16', due_at: '2026-09-16T18:00:00Z' }),
        workItem({ item_id: 'b', due_on: '2026-09-16', due_at: '2026-09-16T20:00:00Z' }),
      ],
      view,
    );
    expect(timed.map((p) => p.item.item_id)).toEqual(['a', 'b', 'c']);
  });

  it('reads the same UTC deadline as a different row in the fall-back week', () => {
    const fallBack = week('2026-10-26', ENDS_ON_WEEK);
    const after = week('2026-11-02', ENDS_ON_WEEK);
    const before = placeWorkItems(
      [workItem({ due_on: '2026-10-28', due_at: '2026-10-28T19:45:00Z' })],
      fallBack,
    ).timed[0];
    const later = placeWorkItems(
      [workItem({ due_on: '2026-11-04', due_at: '2026-11-04T19:45:00Z' })],
      after,
    ).timed[0];
    expect(before.timeText).toBe('3:45 PM');
    expect(later.timeText).toBe('2:45 PM');
  });

  it('reads the same UTC deadline as a different row across the spring forward', () => {
    const before = placeWorkItems(
      [workItem({ due_on: '2026-03-06', due_at: '2026-03-06T18:00:00Z' })],
      week('2026-03-02', ORDINARY_WEEK),
    ).timed[0];
    const later = placeWorkItems(
      [workItem({ due_on: '2026-03-11', due_at: '2026-03-11T18:00:00Z' })],
      week('2026-03-09', ORDINARY_WEEK),
    ).timed[0];
    expect(before.timeText).toBe('1:00 PM');
    expect(later.timeText).toBe('2:00 PM');
  });
});

/* ---------------------------------------------------------------------------
 * Overlap lanes
 * ------------------------------------------------------------------------ */

describe('assignLanes', () => {
  it('gives a lone block the whole column', () => {
    expect(assignLanes([{ top: 0, height: 2 }])).toEqual([
      { top: 0, height: 2, lane: 0, lanes: 1 },
    ]);
  });

  it('splits two blocks that overlap', () => {
    const lanes = assignLanes([
      { top: 0, height: 4 },
      { top: 2, height: 4 },
    ]);
    expect(lanes.map((b) => b.lane)).toEqual([0, 1]);
    expect(lanes.every((b) => b.lanes === 2)).toBe(true);
  });

  it('leaves two blocks that merely touch at full width', () => {
    const lanes = assignLanes([
      { top: 0, height: 2 },
      { top: 2, height: 2 },
    ]);
    expect(lanes.map((b) => b.lanes)).toEqual([1, 1]);
    expect(lanes.map((b) => b.lane)).toEqual([0, 0]);
  });

  it('reuses a lane once the block holding it has finished', () => {
    const lanes = assignLanes([
      { top: 0, height: 10 },
      { top: 1, height: 2 },
      { top: 4, height: 2 },
    ]);
    expect(lanes.map((b) => b.lane)).toEqual([0, 1, 1]);
    expect(lanes.every((b) => b.lanes === 2)).toBe(true);
  });

  it('does not mutate what it was handed', () => {
    const blocks = [{ top: 0, height: 4 }];
    const frozen = JSON.stringify(blocks);
    assignLanes(blocks);
    expect(JSON.stringify(blocks)).toBe(frozen);
  });
});
