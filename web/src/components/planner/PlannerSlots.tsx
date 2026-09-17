'use client';

/**
 * The empty half-hour slots behind a day column, and the Events band row
 * (Phase 11b, K-9).
 *
 * Each slot is a real `<button>` under the blocks (blocks sit on higher layers
 * and are siblings, not ancestors, so a click on a class, a due card or a
 * planner event can never reach a slot). Clicking one opens the create form at
 * that date and start, +60 minutes, New York.
 *
 * KEYBOARD. 196 buttons would be 196 tab stops, so the slots use a roving tab
 * index: one slot is in the tab order, and the arrow keys move between slots
 * (↑ ↓ within a day, ← → across days, Home / End to the ends of a day).
 */

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  PLANNER_SLOT_COUNT,
  PLANNER_SLOT_MINUTES,
  PLANNER_START_MINUTE,
  formatClock,
  type PlannerDay,
  type PlannerWeekModel,
} from '@/lib/planner-week';
import { slotToPx } from '@/lib/planner-rows';
import type { PlacedAllDayEvent } from '@/lib/planner-events-grid';
import { EventChip, type EventActions } from './PlannerEventBlock';
import styles from './PlannerWeek.module.css';

/** Which slot holds the grid's one tab stop. */
export interface SlotPosition {
  dayIndex: number;
  slot: number;
}

/** Where an arrow key moves the slot focus, or null for any other key. */
export function nextSlot(
  key: string,
  from: SlotPosition,
  dayCount: number,
  slotCount: number = PLANNER_SLOT_COUNT,
): SlotPosition | null {
  const clampDay = (day: number) => Math.min(Math.max(day, 0), dayCount - 1);
  const clampSlot = (slot: number) => Math.min(Math.max(slot, 0), slotCount - 1);
  switch (key) {
    case 'ArrowUp':
      return { ...from, slot: clampSlot(from.slot - 1) };
    case 'ArrowDown':
      return { ...from, slot: clampSlot(from.slot + 1) };
    case 'ArrowLeft':
      return { ...from, dayIndex: clampDay(from.dayIndex - 1) };
    case 'ArrowRight':
      return { ...from, dayIndex: clampDay(from.dayIndex + 1) };
    case 'Home':
      return { ...from, slot: 0 };
    case 'End':
      return { ...from, slot: slotCount - 1 };
    default:
      return null;
  }
}

function dayLabel(day: PlannerDay): string {
  return `${day.dowLabel} ${day.monthLabel} ${day.dayOfMonth}`;
}

export function DaySlots({
  day,
  dayCount,
  heights,
  active,
  onActivate,
  actions,
}: {
  day: PlannerDay;
  dayCount: number;
  /** The week's per-row heights — a slot button is as tall as its own row. */
  heights: readonly number[];
  active: SlotPosition;
  onActivate: (position: SlotPosition) => void;
  actions: EventActions;
}) {
  function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, slot: number) {
    const next = nextSlot(event.key, { dayIndex: day.index, slot }, dayCount);
    if (!next) return;
    event.preventDefault();
    onActivate(next);
    const board = event.currentTarget.closest('[data-planner-board]');
    board
      ?.querySelector<HTMLElement>(`[data-slot-day="${next.dayIndex}"][data-slot="${next.slot}"]`)
      ?.focus();
  }

  return (
    <>
      {Array.from({ length: PLANNER_SLOT_COUNT }, (_, slot) => {
        const startMinute = PLANNER_START_MINUTE + slot * PLANNER_SLOT_MINUTES;
        const isActive = active.dayIndex === day.index && active.slot === slot;
        // A row is no longer a fixed 24px (P-planner-2), so a slot is placed
        // and sized off the same map the blocks use. That is what keeps a
        // click below a grown hour creating an event at the hour it looks like.
        const topPx = slotToPx(slot, heights);
        return (
          <button
            key={slot}
            type="button"
            className={styles.slot}
            data-slot={slot}
            data-slot-day={day.index}
            tabIndex={isActive ? 0 : -1}
            aria-label={`New event, ${dayLabel(day)}, ${formatClock(startMinute)}`}
            style={{
              ['--top-px' as string]: `${topPx}px`,
              ['--height-px' as string]: `${slotToPx(slot + 1, heights) - topPx}px`,
            }}
            onFocus={() => {
              if (!isActive) onActivate({ dayIndex: day.index, slot });
            }}
            onKeyDown={(event) => onKeyDown(event, slot)}
            onClick={(event) =>
              actions.create({ allDay: false, date: day.iso, startMinute }, event.currentTarget)
            }
          />
        );
      })}
    </>
  );
}

/** The Events band: all-day planner events, directly beneath Assignments. */
export function EventsBand({
  view,
  band,
  actions,
}: {
  view: PlannerWeekModel;
  band: PlacedAllDayEvent[][];
  actions: EventActions;
}) {
  return (
    <>
      <div className={styles.bandLabel}>Events</div>
      {view.days.map((day, index) => (
        <div
          key={`events-${day.iso}`}
          className={styles.eventBandCell}
          data-today={String(day.isToday)}
          data-events-day={day.iso}
          aria-label={`Events · ${day.dowLabel}`}
        >
          {band[index].map((placed) => (
            <EventChip key={placed.key} placed={placed} actions={actions} />
          ))}
          <button
            type="button"
            className={styles.bandAdd}
            aria-label={`New all-day event, ${dayLabel(day)}`}
            onClick={(event) => actions.create({ allDay: true, date: day.iso }, event.currentTarget)}
          />
        </div>
      ))}
    </>
  );
}
