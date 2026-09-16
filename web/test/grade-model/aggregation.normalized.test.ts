/**
 * L1 — `normalized`, Blackboard's proportional category (IST.323 quizzes:
 * 5 points, 10 quizzes of 10 points each, `normalizeTo` 5).
 */

import { describe, expect, it } from 'vitest';
import { normalizedAggregate } from '@/lib/grade-model/aggregations/normalized';
import { counted, leaf } from './builders';

const QUIZZES = { aggregation: 'normalized' as const, points: 5, countExpected: 10, normalizeTo: 5 };
const quizzes = (items: ReturnType<typeof counted>[]) => leaf(QUIZZES, items, 5, 'points');

describe('normalized', () => {
  it.each([
    { name: 'IST.323 9/14: quizzes 1–2 at 10/10', items: [counted(10, 10), counted(10, 10)], r: null, earned: 5, gradedCap: 5, remainingCap: 4, remainingCount: 8 },
    { name: 'IST.323 9/16: quizzes 1–3 at 10/10', items: [counted(10, 10), counted(10, 10), counted(10, 10)], r: null, earned: 5, gradedCap: 5, remainingCap: 3.5, remainingCount: 7 },
    { name: '9/16, zeros on the rest: 3 of 10 slots full', items: [counted(10, 10), counted(10, 10), counted(10, 10)], r: 0, earned: 1.5, gradedCap: 5, remainingCap: 3.5, remainingCount: 7 },
    { name: '9/16, best case', items: [counted(10, 10), counted(10, 10), counted(10, 10)], r: 1, earned: 5, gradedCap: 5, remainingCap: 3.5, remainingCount: 7 },
    { name: 'a 7/10 quiz alone is 3.5 of 5', items: [counted(10, 7)], r: null, earned: 3.5, gradedCap: 5, remainingCap: 4.5, remainingCount: 9 },
    { name: 'nothing graded', items: [counted(10, null)], r: null, earned: 0, gradedCap: 0, remainingCap: 5, remainingCount: 10 },
  ])('$name', ({ items, r, earned, gradedCap, remainingCap, remainingCount }) => {
    const outcome = normalizedAggregate(quizzes(items), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCap).toBeCloseTo(remainingCap, 12);
    expect(outcome.remainingCount).toBe(remainingCount);
  });

  it('Contract contradiction, decided: normalizeTo does not rescale the fraction (a full quiz is 5.0, not 10)', () => {
    const outcome = normalizedAggregate(quizzes([counted(10, 10), counted(10, 10), counted(10, 10)]), null);
    expect(outcome.earned).toBe(5);
  });
});
