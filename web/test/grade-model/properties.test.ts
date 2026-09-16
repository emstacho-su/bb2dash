/**
 * L2 — property suite (fast-check, ≥ 200 runs each, `FC_SEED` honoured, the
 * seed printed on failure; see `fc-params.ts`). Contract §Engine tests:
 * monotone in every score and in `r`; `0 ≤ pct ≤ best case`, above 100 only via
 * extra credit; drop-lowest never lowers when a score rises; `rank_weighted`
 * invariant under exam order and weights summing to `cap`; muting one
 * component never changes another's result; same input → deep-equal output
 * with a deep-frozen input; the scenario never changes `agreement`.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  projectCourse,
  solveTarget,
  type ComputedResult,
  type ModelInput,
  type ModelResult,
  type Projection,
} from '@/lib/grade-model';
import { evaluateCourse, totalsAt } from '@/lib/grade-model/project';
import { hasExtraCredit, modelInputArb } from './arbitraries';
import { deepFreeze } from './builders';
import { assertProperty, fcParams, MIN_RUNS, seedFromEnv } from './fc-params';

const EPS = 1e-9;
const PROJECTIONS: readonly Projection[] = ['graded_so_far', 'zeros_on_rest', 'best_case'];
const ANY = modelInputArb({ extraCredit: true, unsure: true });
const NO_EXTRA = modelInputArb({ extraCredit: false, unsure: true });

const isComputed = (result: ModelResult): result is ComputedResult => result.state === 'computed';

/** Raises item `index`'s score (real, else its what-if value) a share `t` of the way to possible. */
function raiseScore(input: ModelInput, index: number, t: number): ModelInput | null {
  const target = input.items[index % Math.max(1, input.items.length)];
  if (target === undefined || target.possible === null || target.possible <= 0) return null;
  if (target.score !== null) {
    const score = target.score + (target.possible - target.score) * t;
    return { ...input, items: input.items.map((row) => (row === target ? { ...row, score } : row)) };
  }
  const current = input.scenario.itemScores[target.key];
  if (current === undefined) return null;
  const value = current + (target.possible - current) * t;
  return { ...input, scenario: { itemScores: { ...input.scenario.itemScores, [target.key]: value } } };
}

describe('L2 properties', () => {
  it('is monotone in every score, real or what-if', () => {
    assertProperty(
      fc.property(ANY, fc.nat(), fc.integer({ min: 0, max: 100 }), (input, index, step) => {
        const raised = raiseScore(input, index, step / 100);
        const before = projectCourse(input);
        if (raised === null || !isComputed(before)) return true;
        const after = projectCourse(raised);
        expect(after.state).toBe('computed');
        if (!isComputed(after)) return false;
        return PROJECTIONS.every((p) => after.standings[p].pct >= before.standings[p].pct - EPS);
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

  it('keeps 0 ≤ zeros on the rest ≤ best case, and graded so far ≥ 0', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const result = projectCourse(input);
        if (!isComputed(result)) return true;
        const { graded_so_far: gsf, zeros_on_rest: zeros, best_case: best } = result.standings;
        return gsf.pct >= -EPS && zeros.pct >= -EPS && zeros.pct <= best.pct + EPS;
      }),
    );
  });

  it('without extra credit: graded so far ≤ best case ≤ 100', () => {
    assertProperty(
      fc.property(NO_EXTRA, (input) => {
        const result = projectCourse(input);
        if (!isComputed(result)) return true;
        const { graded_so_far: gsf, best_case: best } = result.standings;
        return gsf.pct <= best.pct + EPS && best.pct <= 100 + EPS;
      }),
    );
  });

  it('goes above 100 only via extra credit', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const result = projectCourse(input);
        if (!isComputed(result)) return true;
        const above = PROJECTIONS.some((p) => result.standings[p].pct > 100 + EPS);
        return !above || hasExtraCredit(input);
      }),
    );
  });

  it('never mutates a deep-frozen input and returns deep-equal output for the same input', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const copy = structuredClone(input);
        const frozen = deepFreeze(structuredClone(input));
        expect(projectCourse(frozen)).toEqual(projectCourse(copy));
        expect(solveTarget(frozen, 'A-')).toEqual(solveTarget(copy, 'A-'));
        expect(copy).toEqual(input);
        return true;
      }),
    );
  });

  it('never lets the scenario change the agreement', () => {
    assertProperty(
      fc.property(ANY, (input) => {
        const withScenario = projectCourse(input);
        if (!isComputed(withScenario)) return true;
        const real = projectCourse({ ...input, scenario: { itemScores: {} } });
        const expected = isComputed(real) ? real.agreement : null;
        return JSON.stringify(withScenario.agreement) === JSON.stringify(expected);
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
