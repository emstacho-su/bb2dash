/**
 * L2 — rule-level properties: drop-lowest never lowers when a score rises;
 * `rank_weighted` is invariant under exam order and, with weights summing to
 * `cap`, earns Σ wᵢ·f₍ᵢ₎; muting one component never changes another
 * component's result. Same parameters as `properties.test.ts`.
 */

import fc from 'fast-check';
import { describe, it } from 'vitest';
import { projectCourse, type ComputedResult, type ModelInput } from '@/lib/grade-model';
import { averageDropLowestAggregate, meanAfterDrop } from '@/lib/grade-model/aggregations/average-drop-lowest';
import { rankWeightedAggregate } from '@/lib/grade-model/aggregations/rank-weighted';
import { modelInputArb } from './arbitraries';
import { counted, leaf } from './builders';
import { assertProperty } from './fc-params';

const EPS = 1e-9;
const fraction = fc.integer({ min: 0, max: 100 }).map((n) => n / 100);
const R_VALUES = [null, 0, 0.5, 1] as const;

describe('L2 drop-lowest', () => {
  it('never lowers when a score rises, in every projection', () => {
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

/** Mutes top-level component `id` by marking one of its counted items unsure (adding one if needed). */
function muteComponent(input: ModelInput, id: number): ModelInput {
  const key = `col:mute:${id}`;
  const unsure = {
    key, componentId: id, linkSource: 'assignment' as const, linkConfidence: 'tentative' as const, excluded: false,
    name: key, possible: 10, score: 5, exempt: false, kind: 'item' as const, isExtraCredit: false, dueAt: null,
  };
  return { ...input, items: [...input.items, unsure] };
}

describe('L2 muting', () => {
  it('muting one component never changes another component’s result', () => {
    const arb = modelInputArb({ extraCredit: true, unsure: true });
    assertProperty(
      fc.property(arb, fc.nat(), (input, pick) => {
        const topLeaves = input.components.filter(
          (c) => c.parentId === null && !input.components.some((k) => k.parentId === c.id),
        );
        const target = topLeaves[pick % Math.max(1, topLeaves.length)];
        const before = projectCourse(input);
        if (target === undefined || before.state !== 'computed') return true;
        const after = projectCourse(muteComponent(input, target.id));
        if (after.state !== 'computed') return true;
        const others = (result: ComputedResult) => result.components.filter((c) => c.componentId !== target.id);
        const muted = after.components.find((c) => c.componentId === target.id);
        return muted?.state === 'muted' && JSON.stringify(others(after)) === JSON.stringify(others(before));
      }),
    );
  });
});
