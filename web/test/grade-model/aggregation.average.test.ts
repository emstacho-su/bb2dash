/**
 * L1 — `average`: graded so far `cap·mean(f_graded)`, graded capacity `cap`
 * once anything is graded; with `r`, slots = max(`countExpected`, known items).
 */

import { describe, expect, it } from 'vitest';
import { averageAggregate } from '@/lib/grade-model/aggregations/average';
import { counted, leaf } from './builders';

const CAP = 10;

describe('average', () => {
  it.each([
    { name: '2 of 4 graded, graded so far', count: 4, items: [counted(10, 8), counted(10, 6)], r: null, earned: 7, gradedCap: 10, remainingCap: 5, remainingCount: 2 },
    { name: '2 of 4 graded, zeros on the rest', count: 4, items: [counted(10, 8), counted(10, 6)], r: 0, earned: 3.5, gradedCap: 10, remainingCap: 5, remainingCount: 2 },
    { name: '2 of 4 graded, best case', count: 4, items: [counted(10, 8), counted(10, 6)], r: 1, earned: 8.5, gradedCap: 10, remainingCap: 5, remainingCount: 2 },
    { name: 'fractions, not points: 4/5 and 30/50 average to 0.7', count: 2, items: [counted(5, 4), counted(50, 30)], r: null, earned: 7, gradedCap: 10, remainingCap: 0, remainingCount: 0 },
    { name: 'no count: slots are the known items', count: null, items: [counted(10, 8), counted(10, 6), counted(10, null)], r: 1, earned: 8, gradedCap: 10, remainingCap: 10 / 3, remainingCount: 1 },
    { name: 'more known items than the count: slots follow the items', count: 2, items: [counted(10, 8), counted(10, 6), counted(10, 10)], r: 0, earned: 8, gradedCap: 10, remainingCap: 0, remainingCount: 0 },
    { name: 'nothing graded: left out of graded so far', count: 4, items: [counted(10, null)], r: null, earned: 0, gradedCap: 0, remainingCap: 10, remainingCount: 4 },
    { name: 'nothing known, no count: the capacity is one slot', count: null, items: [], r: 1, earned: 10, gradedCap: 0, remainingCap: 10, remainingCount: 1 },
  ])('$name', ({ count, items, r, earned, gradedCap, remainingCap, remainingCount }) => {
    const outcome = averageAggregate(leaf({ aggregation: 'average', countExpected: count }, items, CAP), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCap).toBeCloseTo(remainingCap, 12);
    expect(outcome.remainingCount).toBe(remainingCount);
  });

  it('prices one slot at cap / slots', () => {
    const outcome = averageAggregate(leaf({ countExpected: 4 }, [], CAP), null);
    expect(outcome.unitCap).toEqual({ perSlot: 2.5, perPoint: null });
    expect(outcome.slotCount).toBe(4);
  });
});
