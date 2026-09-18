/**
 * L2 — property suite (fast-check, ≥ 200 runs each, `FC_SEED` honoured, the
 * seed printed on failure; see `fc-params.ts`).
 *
 * The properties that survive Phase 12b (G-1): the standing is monotone in
 * every score, the totals are monotone in `r`, the percentage is non-negative
 * and goes above 100 only through extra credit, and the engine never mutates
 * its input. Gone with the layer they described: the three-projection ordering,
 * what-if monotonicity, the percent-placeholder generator and the agreement's
 * independence from the scenario.
 *
 * `gradedSoFar()`'s own determinism property lives in
 * `test/graded-so-far.test.ts`, beside the function the app actually calls.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { ModelInput } from '@/lib/grade-model';
import { evaluateCourse, totalsAt } from '@/lib/grade-model/project';
import { hasExtraCredit, modelInputArb } from './arbitraries';
import { deepFreeze } from './builders';
import { run } from './run';
import { assertProperty, fcParams, MIN_RUNS, seedFromEnv } from './fc-params';

const EPS = 1e-9;
const ANY = modelInputArb({ extraCredit: true, unsure: true });
const NO_EXTRA = modelInputArb({ extraCredit: false, unsure: true });

/** Raises item `index`'s score a share `t` of the way to its `possible`. */
function raiseScore(input: ModelInput, index: number, t: number): ModelInput | null {
  const target = input.items[index % Math.max(1, input.items.length)];
  if (target === undefined) return null;
  if (target.score === null || target.possible === null || target.possible <= 0) return null;
  const score = target.score + (target.possible - target.score) * t;
  return { ...input, items: input.items.map((row) => (row === target ? { ...row, score } : row)) };
}

describe('L2 properties', () => {
  it('is monotone in every score', () => {
    assertProperty(
      fc.property(ANY, fc.nat(), fc.integer({ min: 0, max: 100 }), (input, index, step) => {
        const raised = raiseScore(input, index, step / 100);
        const before = run(input);
        if (raised === null || before.state !== 'computed') return true;
        const after = run(raised);
        if (after.state !== 'computed') return true;
        return after.standing.pct >= before.standing.pct - EPS;
      }),
    );
  });

  it('is monotone in r', () => {
    assertProperty(
      fc.property(ANY, fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (input, a, b) => {
        const evaluation = evaluateCourse(input);
        if (evaluation.state !== 'computed') return true;
        const [lo, hi] = a <= b ? [a / 1000, b / 1000] : [b / 1000, a / 1000];
        return totalsAt(evaluation.model, hi).earned >= totalsAt(evaluation.model, lo).earned - EPS;
      }),
    );
  });

  it('never states a negative percentage', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const result = run(input);
        return result.state !== 'computed' || result.standing.pct >= -EPS;
      }),
    );
  });

  it('without extra credit, graded so far never exceeds 100', () => {
    assertProperty(
      fc.property(NO_EXTRA, (input) => {
        const result = run(input);
        return result.state !== 'computed' || result.standing.pct <= 100 + EPS;
      }),
    );
  });

  it('goes above 100 only via extra credit', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const result = run(input);
        if (result.state !== 'computed') return true;
        return result.standing.pct <= 100 + EPS || hasExtraCredit(input);
      }),
    );
  });

  it('never mutates a deep-frozen input and returns deep-equal output for the same input', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const copy = structuredClone(input);
        const frozen = deepFreeze(structuredClone(input));
        expect(run(frozen)).toEqual(run(copy));
        expect(copy).toEqual(input);
        return true;
      }),
    );
  });
});

describe('L2 parameters', () => {
  it('runs at least 200 times and reads FC_SEED as an integer', () => {
    expect(fcParams().numRuns).toBeGreaterThanOrEqual(200);
    expect(MIN_RUNS).toBe(200);
    expect(seedFromEnv(undefined)).toBeUndefined();
    expect(seedFromEnv(' ')).toBeUndefined();
    expect(seedFromEnv('-42')).toBe(-42);
    expect(() => seedFromEnv('abc')).toThrow('FC_SEED must be an integer');
  });
});
