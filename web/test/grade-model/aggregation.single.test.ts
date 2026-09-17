/**
 * L1 — `single`: `cap·f` if graded, else left out; with `r`, `cap·r`.
 * (Contract §Engine, per-aggregation table.)
 */

import { describe, expect, it } from 'vitest';
import { singleAggregate } from '@/lib/grade-model/aggregations/single';
import { counted, leaf, whatIf } from './builders';

const CAP = 20;

describe('single', () => {
  it.each([
    { name: 'graded 8/10, graded so far', items: [counted(10, 8)], r: null, earned: 16, gradedCap: 20, remainingCap: 0, remainingCount: 0 },
    { name: 'graded 8/10, zeros on the rest (r does not touch a graded slot)', items: [counted(10, 8)], r: 0, earned: 16, gradedCap: 20, remainingCap: 0, remainingCount: 0 },
    { name: 'graded 8/10, best case', items: [counted(10, 8)], r: 1, earned: 16, gradedCap: 20, remainingCap: 0, remainingCount: 0 },
    { name: 'ungraded, graded so far: left out', items: [counted(10, null)], r: null, earned: 0, gradedCap: 0, remainingCap: 20, remainingCount: 1 },
    { name: 'ungraded, zeros on the rest', items: [counted(10, null)], r: 0, earned: 0, gradedCap: 0, remainingCap: 20, remainingCount: 1 },
    { name: 'ungraded, best case', items: [counted(10, null)], r: 1, earned: 20, gradedCap: 0, remainingCap: 20, remainingCount: 1 },
    { name: 'ungraded at r = 0.45 (solver)', items: [counted(10, null)], r: 0.45, earned: 9, gradedCap: 0, remainingCap: 20, remainingCount: 1 },
    { name: 'no counted item at all (GEO exam placeholder with no points): one slot', items: [], r: 1, earned: 20, gradedCap: 0, remainingCap: 20, remainingCount: 1 },
    { name: 'no counted item, graded so far', items: [], r: null, earned: 0, gradedCap: 0, remainingCap: 20, remainingCount: 1 },
    { name: 'what-if 7/10 counts as the score', items: [whatIf(10, 7)], r: null, earned: 14, gradedCap: 20, remainingCap: 0, remainingCount: 0 },
    { name: 'score above possible is Blackboard’s and kept (no clamping)', items: [counted(10, 11)], r: null, earned: 22, gradedCap: 20, remainingCap: 0, remainingCount: 0 },
    { name: 'decision: two linked items share the slot as an average', items: [counted(10, 8), counted(10, 6)], r: null, earned: 14, gradedCap: 20, remainingCap: 0, remainingCount: 0 },
  ])('$name', ({ items, r, earned, gradedCap, remainingCap, remainingCount }) => {
    const outcome = singleAggregate(leaf({ aggregation: 'single', countExpected: 1 }, items, CAP), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCap).toBeCloseTo(remainingCap, 12);
    expect(outcome.remainingCount).toBe(remainingCount);
    expect(outcome.capacityFromKnownItems).toBe(false);
  });

  it('marks a what-if value and prices an extra-credit item by the slot', () => {
    const outcome = singleAggregate(leaf({ aggregation: 'single' }, [whatIf(10, 5)], CAP), null);
    expect(outcome.usesHypothetical).toBe(true);
    expect(outcome.unitCap).toEqual({ perSlot: 20, perPoint: null });
    expect(singleAggregate(leaf({}, [counted(10, 5)], CAP), null).usesHypothetical).toBe(false);
  });
});
