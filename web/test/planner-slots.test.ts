/** The slot grid's arrow-key moves and the header's count line (Phase 11b). */

import { describe, expect, it } from 'vitest';
import { nextSlot } from '@/components/planner/PlannerSlots';
import { countLine } from '@/components/planner/PlannerWeekHeader';

describe('nextSlot', () => {
  const at = { dayIndex: 3, slot: 10 };

  it('moves one slot or one day per arrow', () => {
    expect(nextSlot('ArrowUp', at, 7)).toEqual({ dayIndex: 3, slot: 9 });
    expect(nextSlot('ArrowDown', at, 7)).toEqual({ dayIndex: 3, slot: 11 });
    expect(nextSlot('ArrowLeft', at, 7)).toEqual({ dayIndex: 2, slot: 10 });
    expect(nextSlot('ArrowRight', at, 7)).toEqual({ dayIndex: 4, slot: 10 });
  });

  it('jumps to the ends of the day with Home and End', () => {
    expect(nextSlot('Home', at, 7)).toEqual({ dayIndex: 3, slot: 0 });
    expect(nextSlot('End', at, 7)).toEqual({ dayIndex: 3, slot: 27 });
  });

  it('stops at the edges of the grid instead of wrapping', () => {
    expect(nextSlot('ArrowUp', { dayIndex: 0, slot: 0 }, 7)).toEqual({ dayIndex: 0, slot: 0 });
    expect(nextSlot('ArrowLeft', { dayIndex: 0, slot: 0 }, 7)).toEqual({ dayIndex: 0, slot: 0 });
    expect(nextSlot('ArrowDown', { dayIndex: 6, slot: 27 }, 7)).toEqual({ dayIndex: 6, slot: 27 });
    expect(nextSlot('ArrowRight', { dayIndex: 6, slot: 27 }, 7)).toEqual({ dayIndex: 6, slot: 27 });
  });

  it('ignores every other key', () => {
    expect(nextSlot('Enter', at, 7)).toBeNull();
    expect(nextSlot('a', at, 7)).toBeNull();
  });
});

describe('countLine', () => {
  it('keeps the Phase 11 line when the week has no planner events', () => {
    expect(countLine(2, 2, 0)).toBe('2 classes · 2 due');
  });

  it('names planner events when there are some', () => {
    expect(countLine(1, 0, 1)).toBe('1 class · 0 due · 1 event');
    expect(countLine(3, 4, 5)).toBe('3 classes · 4 due · 5 events');
  });
});
