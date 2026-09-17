/**
 * Where planner events land on the week grid (Phase 11b, K-9). Pure — no DOM.
 *
 * The grid is New York whatever zone an event was entered in: a Los Angeles
 * 09:00 sits at noon, an event across New York midnight is two segments, one
 * outside 08:00–22:00 is clamped to the edge but keeps its real times, and an
 * all-day event sits on its own dates in its own zone.
 */

import { describe, expect, it } from 'vitest';
import {
  DUE_CARD_MIN_SLOTS,
  eventWindowBounds,
  isCompactSegment,
  overlapsWindow,
  placePlannerEvents,
  segmentBox,
} from '@/lib/planner-events-grid';
import { PLANNER_SLOT_COUNT, buildPlannerWeek, slotOffset } from '@/lib/planner-week';
import { allDayInstants } from '@/lib/planner-events';
import { makePlannerEvent } from './factories.plannerEvents';

const WEEK = buildPlannerWeek({ weekStart: '2026-09-14', today: '2026-09-16' });

describe('eventWindowBounds', () => {
  it('is New York midnight Monday to New York midnight the next Monday', () => {
    expect(eventWindowBounds('2026-09-14', '2026-09-20')).toEqual({
      start: '2026-09-14T04:00:00.000Z',
      end: '2026-09-21T04:00:00.000Z',
    });
  });

  it('follows the fall-back into standard time for the end bound', () => {
    expect(eventWindowBounds('2026-10-26', '2026-11-01')).toEqual({
      start: '2026-10-26T04:00:00.000Z',
      end: '2026-11-02T05:00:00.000Z',
    });
  });

  it('keeps a zero-length task on the first midnight and drops one on the last', () => {
    const bounds = eventWindowBounds('2026-09-14', '2026-09-20')!;
    const at = (iso: string) => ({ starts_at: iso, ends_at: iso });
    expect(overlapsWindow(at('2026-09-14T04:00:00Z'), bounds)).toBe(true);
    expect(overlapsWindow(at('2026-09-21T04:00:00Z'), bounds)).toBe(false);
  });
});

describe('placePlannerEvents — timed', () => {
  it('places a New York event at its wall clock, with no zone chip', () => {
    const { timed, allDay } = placePlannerEvents([makePlannerEvent()], WEEK);
    expect(allDay).toEqual([]);
    expect(timed).toHaveLength(1);
    expect(timed[0]).toMatchObject({
      dayIso: '2026-09-16',
      dayIndex: 2,
      top: slotOffset(9 * 60),
      height: 2,
      timeText: '9:00 AM – 10:00 AM',
      zoneChip: null,
      clamped: false,
    });
  });

  it('places a Los Angeles 09:00 at noon New York and chips it "09:00 PDT"', () => {
    const la = makePlannerEvent({
      time_zone: 'America/Los_Angeles',
      starts_at: '2026-09-16T16:00:00.000Z',
      ends_at: '2026-09-16T17:00:00.000Z',
    });
    const [segment] = placePlannerEvents([la], WEEK).timed;
    expect(segment.top).toBe(slotOffset(12 * 60));
    expect(segment.timeText).toBe('12:00 PM – 1:00 PM');
    expect(segment.zoneChip).toBe('09:00 PDT');
  });

  it('splits an event crossing New York midnight into one clamped segment per day', () => {
    const late = makePlannerEvent({
      starts_at: '2026-09-17T03:00:00.000Z', // Wed 23:00 NY
      ends_at: '2026-09-17T05:00:00.000Z', // Thu 01:00 NY
    });
    const { timed } = placePlannerEvents([late], WEEK);
    expect(timed.map((s) => s.dayIso)).toEqual(['2026-09-16', '2026-09-17']);
    // Both segments lie outside the drawn hours: pinned to the edges, real times kept.
    expect(timed[0]).toMatchObject({ top: PLANNER_SLOT_COUNT - 1, height: 1, clamped: true });
    expect(timed[1]).toMatchObject({ top: 0, height: 1, clamped: true });
    expect(timed.every((s) => s.timeText === '11:00 PM – 1:00 AM')).toBe(true);
    expect(new Set(timed.map((s) => s.key)).size).toBe(2);
  });

  it('draws nothing on the next day for an event ending exactly at midnight', () => {
    const evening = makePlannerEvent({
      starts_at: '2026-09-17T02:00:00.000Z', // Wed 22:00
      ends_at: '2026-09-17T04:00:00.000Z', // Thu 00:00
    });
    expect(placePlannerEvents([evening], WEEK).timed.map((s) => s.dayIso)).toEqual(['2026-09-16']);
  });

  it('clamps a morning run that starts before 08:00 but keeps its real start', () => {
    const run = makePlannerEvent({
      starts_at: '2026-09-15T10:30:00.000Z', // 06:30
      ends_at: '2026-09-15T13:00:00.000Z', // 09:00
    });
    const [segment] = placePlannerEvents([run], WEEK).timed;
    expect(segment).toMatchObject({ top: 0, height: 2, clamped: true });
    expect(segment.timeText).toBe('6:30 AM – 9:00 AM');
  });

  it('gives a zero-length task the due-card minimum height', () => {
    const at = '2026-09-18T19:00:00.000Z'; // Fri 15:00
    const task = makePlannerEvent({ kind: 'task', done: false, starts_at: at, ends_at: at });
    const [segment] = placePlannerEvents([task], WEEK).timed;
    expect(segment).toMatchObject({
      dayIso: '2026-09-18',
      height: DUE_CARD_MIN_SLOTS,
      zeroLength: true,
      timeText: '3:00 PM',
    });
  });

  it('leaves events outside the week off the grid', () => {
    const next = makePlannerEvent({
      starts_at: '2026-09-22T13:00:00.000Z',
      ends_at: '2026-09-22T14:00:00.000Z',
    });
    expect(placePlannerEvents([next], WEEK).timed).toEqual([]);
  });
});

describe('segmentBox', () => {
  it('keeps a late zero-length block inside the grid', () => {
    expect(segmentBox(23 * 60, 23 * 60, true)).toEqual({
      top: PLANNER_SLOT_COUNT - DUE_CARD_MIN_SLOTS,
      height: DUE_CARD_MIN_SLOTS,
    });
  });

  it('gives a short event at least one slot', () => {
    expect(segmentBox(9 * 60, 9 * 60 + 10, false)).toEqual({ top: 2, height: 1 });
  });
});

describe('isCompactSegment', () => {
  const at = (starts: string, ends: string) =>
    placePlannerEvents([makePlannerEvent({ starts_at: starts, ends_at: ends })], WEEK).timed[0];

  it('is compact for a half-hour event: one slot holds one line', () => {
    expect(isCompactSegment(at('2026-09-16T18:00:00Z', '2026-09-16T18:30:00Z'))).toBe(true);
  });

  it('is compact for a 15-minute event drawn at the one-slot minimum', () => {
    expect(isCompactSegment(at('2026-09-16T18:00:00Z', '2026-09-16T18:15:00Z'))).toBe(true);
  });

  it('is not compact for an hour-long event', () => {
    expect(isCompactSegment(at('2026-09-16T18:00:00Z', '2026-09-16T19:00:00Z'))).toBe(false);
  });

  it('is not compact for a zero-length event, which is drawn at due-card height', () => {
    expect(isCompactSegment(at('2026-09-16T18:00:00Z', '2026-09-16T18:00:00Z'))).toBe(false);
  });
});

describe('placePlannerEvents — all day', () => {
  it('puts a multi-day New York event on each of its days, and only those', () => {
    const trip = makePlannerEvent({
      all_day: true,
      kind: 'out_of_office',
      ...allDayInstants('2026-09-17', '2026-09-18', 'America/New_York')!,
    });
    const { timed, allDay } = placePlannerEvents([trip], WEEK);
    expect(timed).toEqual([]);
    expect(allDay.map((c) => c.dayIso)).toEqual(['2026-09-17', '2026-09-18']);
    expect(allDay[0].zoneChip).toBeNull();
  });

  it('uses the event zone for its dates: a Tokyo 17th is the 17th column', () => {
    const tokyo = makePlannerEvent({
      all_day: true,
      time_zone: 'Asia/Tokyo',
      ...allDayInstants('2026-09-17', '2026-09-17', 'Asia/Tokyo')!,
    });
    const { allDay } = placePlannerEvents([tokyo], WEEK);
    expect(allDay.map((c) => c.dayIso)).toEqual(['2026-09-17']);
    expect(allDay[0].zoneChip).toBe('GMT+9');
  });

  it('clips an all-day event that runs past the end of the week', () => {
    const long = makePlannerEvent({
      all_day: true,
      time_zone: 'Pacific/Honolulu',
      ...allDayInstants('2026-09-20', '2026-09-22', 'Pacific/Honolulu')!,
    });
    expect(placePlannerEvents([long], WEEK).allDay.map((c) => c.dayIso)).toEqual(['2026-09-20']);
    // …and the fetch window still reaches it.
    expect(overlapsWindow(long, eventWindowBounds('2026-09-14', '2026-09-20')!)).toBe(true);
  });
});
