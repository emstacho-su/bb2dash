/**
 * L1 — `average_drop_lowest` (ECN.304 quizzes 15 %, GEO 103 reading quizzes
 * 10 % over 5): drop the `dropLowest` lowest only while there are more values
 * than `dropLowest`; with `r`, slots are filled first so a missed quiz drops.
 */

import { describe, expect, it } from 'vitest';
import {
  averageDropLowestAggregate,
  dropCount,
  meanAfterDrop,
} from '@/lib/grade-model/aggregations/average-drop-lowest';
import { counted, leaf } from './builders';

describe('average_drop_lowest', () => {
  it.each([
    { name: 'ECN.304 live: Quiz 1 9/10, no count, one graded ≤ drop 1: nothing dropped', cap: 15, count: null, drop: 1, items: [counted(10, 9)], r: null, earned: 13.5, gradedCap: 15, remainingCount: 0 },
    { name: 'ECN.304 live at best case: one slot, still nothing dropped', cap: 15, count: null, drop: 1, items: [counted(10, 9)], r: 1, earned: 13.5, gradedCap: 15, remainingCount: 0 },
    { name: 'GEO 2 of 5 graded (0.8, 0.6): graded so far drops 0.6', cap: 10, count: 5, drop: 1, items: [counted(10, 8), counted(10, 6)], r: null, earned: 8, gradedCap: 10, remainingCount: 3 },
    { name: 'GEO 2 of 5, zeros on the rest: a zero is the one dropped', cap: 10, count: 5, drop: 1, items: [counted(10, 8), counted(10, 6)], r: 0, earned: 3.5, gradedCap: 10, remainingCount: 3 },
    { name: 'GEO 2 of 5, best case: 0.6 dropped among 1s', cap: 10, count: 5, drop: 1, items: [counted(10, 8), counted(10, 6)], r: 1, earned: 9.5, gradedCap: 10, remainingCount: 3 },
    { name: 'GEO all 5 graded: lowest 0.2 dropped', cap: 10, count: 5, drop: 1, items: [counted(10, 10), counted(10, 9), counted(10, 8), counted(10, 7), counted(10, 2)], r: null, earned: 8.5, gradedCap: 10, remainingCount: 0 },
    { name: 'no quiz posted: best case fills 5 slots with 1', cap: 10, count: 5, drop: 1, items: [], r: 1, earned: 10, gradedCap: 0, remainingCount: 5 },
    { name: 'drop 2 of 3 graded keeps the best', cap: 10, count: 3, drop: 2, items: [counted(10, 5), counted(10, 9), counted(10, 1)], r: null, earned: 9, gradedCap: 10, remainingCount: 0 },
    { name: 'drop 0 is a plain average', cap: 10, count: 2, drop: 0, items: [counted(10, 5), counted(10, 9)], r: null, earned: 7, gradedCap: 10, remainingCount: 0 },
  ])('$name', ({ cap, count, drop, items, r, earned, gradedCap, remainingCount }) => {
    const outcome = averageDropLowestAggregate(
      leaf({ aggregation: 'average_drop_lowest', countExpected: count, dropLowest: drop }, items, cap),
      r,
    );
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCount).toBe(remainingCount);
  });

  it.each([
    { values: [0.2, 0.9], drop: 1, level: 0.9 },
    { values: [0.2], drop: 1, level: 0.2 },
    { values: [], drop: 1, level: 0 },
    { values: [0.4, 0.2, 0.9], drop: 5, level: 0.5 },
  ])('meanAfterDrop($values, $drop) = $level', ({ values, drop, level }) => {
    expect(meanAfterDrop(values, drop)).toBeCloseTo(level, 12);
  });

  it.each([
    { input: 1, expected: 1 },
    { input: 1.9, expected: 1 },
    { input: -2, expected: 0 },
    { input: Number.NaN, expected: 0 },
  ])('dropCount($input) = $expected', ({ input, expected }) => {
    expect(dropCount(input)).toBe(expected);
  });

  it('never sorts its input in place', () => {
    const values = Object.freeze([0.9, 0.1, 0.5]);
    expect(meanAfterDrop(values, 1)).toBeCloseTo(0.7, 12);
    expect(values).toEqual([0.9, 0.1, 0.5]);
  });
});
