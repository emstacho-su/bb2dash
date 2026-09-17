/**
 * L2 — rule-level properties: drop-lowest never lowers when a score rises, and
 * `rank_weighted` is invariant under exam order and, with weights summing to
 * `cap`, earns Σ wᵢ·f₍ᵢ₎. Same parameters as `properties.test.ts`.
 *
 * Phase 12b (G-1) removed the muting property with muting itself; what a link's
 * confidence does now is covered in `graded-so-far.test.ts`.
 */

import fc from 'fast-check';
import { describe, it } from 'vitest';
import { averageDropLowestAggregate, meanAfterDrop } from '@/lib/grade-model/aggregations/average-drop-lowest';
import { rankWeightedAggregate } from '@/lib/grade-model/aggregations/rank-weighted';
import { counted, leaf } from './builders';
import { assertProperty } from './fc-params';

const EPS = 1e-9;
const fraction = fc.integer({ min: 0, max: 100 }).map((n) => n / 100);
const R_VALUES = [null, 0, 0.5, 1] as const;

describe('L2 drop-lowest', () => {
  it('never lowers when a score rises, at every fill value', () => {
    assertProperty(
      fc.property(
        fc.array(fraction, { minLength: 1, maxLength: 6 }),
        fc.nat(),
        fraction,
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 1, max: 6 }),
        (values, index, share, drop, count) => {
          const i = index % values.length;
          const raised = values.map((v, k) => (k === i ? v + (1 - v) * share : v));
          const earned = (fs: readonly number[], r: number | null) =>
            averageDropLowestAggregate(
              leaf({ aggregation: 'average_drop_lowest', dropLowest: drop, countExpected: count }, fs.map((f) => counted(100, f * 100)), 10),
              r,
            ).earned;
          return R_VALUES.every((r) => earned(raised, r) >= earned(values, r) - EPS);
        },
      ),
    );
  });

  it('never lowers the plain mean of the same values', () => {
    assertProperty(
      fc.property(fc.array(fraction, { minLength: 1, maxLength: 6 }), fc.integer({ min: 0, max: 3 }), (values, drop) => {
        const plain = values.reduce((a, b) => a + b, 0) / values.length;
        return meanAfterDrop(values, drop) >= plain - EPS;
      }),
    );
  });
});

describe('L2 rank_weighted', () => {
  const weightsArb = fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 4 }).filter((ws) => ws.some((w) => w > 0));

  it('is invariant under exam order', () => {
    assertProperty(
      fc.property(weightsArb, fc.array(fc.tuple(fraction, fc.nat()), { maxLength: 4 }), (weights, exams) => {
        const shuffled = [...exams].sort((a, b) => a[1] - b[1]);
        const earned = (list: readonly (readonly [number, number])[], r: number | null) =>
          rankWeightedAggregate(
            leaf({ aggregation: 'rank_weighted', rankWeights: weights, countExpected: weights.length }, list.map(([f]) => counted(100, f * 100)), 75),
            r,
          ).earned;
        return R_VALUES.every((r) => Math.abs(earned(exams, r) - earned(shuffled, r)) <= EPS);
      }),
    );
  });

  it('with weights summing to cap earns Σ wᵢ·f₍ᵢ₎ over the ranked slots', () => {
    assertProperty(
      fc.property(weightsArb, fc.array(fraction, { maxLength: 4 }), fraction, (weights, scores, r) => {
        const cap = weights.reduce((a, b) => a + b, 0);
        const graded = scores.slice(0, weights.length);
        const slots = [...graded, ...Array.from({ length: weights.length - graded.length }, () => r)].sort((a, b) => b - a);
        const expected = weights.reduce((total, w, i) => total + w * (slots[i] ?? 0), 0);
        const outcome = rankWeightedAggregate(
          leaf({ aggregation: 'rank_weighted', rankWeights: weights }, graded.map((f) => counted(100, f * 100)), cap),
          r,
        );
        return Math.abs(outcome.earned - expected) <= 1e-7;
      }),
    );
  });
});
