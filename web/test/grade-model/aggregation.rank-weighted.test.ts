/**
 * L1 — `rank_weighted` (ECN.304: highest exam 30 %, median 25 %, lowest 20 %).
 * Graded so far `cap·mean(f_graded)`; with `r`, slots = weights, fractions
 * sorted descending, `cap·Σ wᵢ·f₍ᵢ₎ / Σw`.
 */

import { describe, expect, it } from 'vitest';
import { rankWeightedAggregate, rankWeightedLevel } from '@/lib/grade-model/aggregations/rank-weighted';
import { counted, leaf } from './builders';

const EXAMS = { aggregation: 'rank_weighted' as const, countExpected: 3, rankWeights: [30, 25, 20] };
const CAP = 75;

describe('rank_weighted', () => {
  it.each([
    { name: 'no exam yet, graded so far', items: [], r: null, earned: 0, gradedCap: 0, remainingCount: 3 },
    { name: 'no exam yet, best case', items: [], r: 1, earned: 75, gradedCap: 0, remainingCount: 3 },
    { name: 'no exam yet at r = 0.8', items: [], r: 0.8, earned: 60, gradedCap: 0, remainingCount: 3 },
    { name: 'Exam 1 at 0.8, graded so far: plain mean', items: [counted(100, 80)], r: null, earned: 60, gradedCap: 75, remainingCount: 2 },
    { name: 'Exam 1 at 0.8, zeros on the rest: it takes the 30 % rank', items: [counted(100, 80)], r: 0, earned: 24, gradedCap: 75, remainingCount: 2 },
    { name: 'Exam 1 at 0.8, best case: it drops to the 20 % rank', items: [counted(100, 80)], r: 1, earned: 71, gradedCap: 75, remainingCount: 2 },
    { name: 'two exams (0.7, 0.9) at r = 0.5: [0.9, 0.7, 0.5]', items: [counted(100, 70), counted(100, 90)], r: 0.5, earned: 54.5, gradedCap: 75, remainingCount: 1 },
    { name: 'decision: all three graded, graded so far applies the ranks', items: [counted(100, 60), counted(100, 90), counted(100, 80)], r: null, earned: 59, gradedCap: 75, remainingCount: 0 },
    { name: 'all three graded, zeros on the rest agrees', items: [counted(100, 60), counted(100, 90), counted(100, 80)], r: 0, earned: 59, gradedCap: 75, remainingCount: 0 },
  ])('$name', ({ items, r, earned, gradedCap, remainingCount }) => {
    const outcome = rankWeightedAggregate(leaf(EXAMS, items, CAP), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCount).toBe(remainingCount);
  });

  it('is invariant under exam order', () => {
    const orders = [
      [60, 90, 80],
      [90, 80, 60],
      [80, 60, 90],
    ];
    const earned = orders.map((scores) =>
      rankWeightedAggregate(leaf(EXAMS, scores.map((s) => counted(100, s)), CAP), 0).earned,
    );
    expect(new Set(earned).size).toBe(1);
  });

  it('with weights summing to cap, earned is Σ wᵢ·f₍ᵢ₎', () => {
    expect(rankWeightedLevel([0.6, 0.9, 0.8], [30, 25, 20]) * 75).toBeCloseTo(30 * 0.9 + 25 * 0.8 + 20 * 0.6, 12);
  });

  it('weights not summing to cap are proportions: [3, 2, 1] over 60', () => {
    const outcome = rankWeightedAggregate(
      leaf({ ...EXAMS, rankWeights: [3, 2, 1] }, [counted(10, 10), counted(10, 5), counted(10, 0)], 60),
      0,
    );
    expect(outcome.earned).toBeCloseTo(40, 12);
  });

  it('slots beyond the weights weigh 0', () => {
    const outcome = rankWeightedAggregate(
      leaf({ ...EXAMS, rankWeights: [1] }, [counted(10, 2), counted(10, 8)], 10),
      0,
    );
    expect(outcome.earned).toBeCloseTo(8, 12);
  });

  it.each([
    { name: 'null', weights: null },
    { name: 'empty', weights: [] },
    { name: 'negative', weights: [30, -5] },
    { name: 'all zero', weights: [0, 0] },
  ])('decision: $name weights fall back to a plain average over countExpected', ({ weights }) => {
    const outcome = rankWeightedAggregate(leaf({ ...EXAMS, rankWeights: weights }, [counted(10, 8)], 30), 0);
    expect(outcome.earned).toBeCloseTo(8, 12);
    expect(outcome.slotCount).toBe(3);
  });
});
