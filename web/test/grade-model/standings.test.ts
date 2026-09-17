/**
 * L1 — the standing: graded so far = Σearned / ΣgradedCap, extra credit raises
 * earned only, unlinked scored columns are listed, nothing is rounded.
 *
 * Phase 12b (G-1) left one projection, so the cases about "zeros on the rest",
 * "best case" and what-if values went with them; what survives here is the
 * arithmetic Stack picked. `run()` composes the engine's surviving entry points
 * the way the app's `gradedSoFar()` does.
 */

import { describe, expect, it } from 'vitest';
import type { ItemInput, ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';
import { run, type RunResult } from './run';

function computed(input: ModelInput): Extract<RunResult, { state: 'computed' }> {
  const result = run(input);
  expect(result.state).toBe('computed');
  return result as Extract<RunResult, { state: 'computed' }>;
}

describe('weighted_pct standings', () => {
  const components = [
    component({ id: 1, code: 'hw', name: 'Homework', weightPct: 30, aggregation: 'average', countExpected: 3 }),
    component({ id: 2, code: 'final', name: 'Final', weightPct: 70, aggregation: 'single', countExpected: 1 }),
  ];
  const items: readonly ItemInput[] = [
    item({ key: 'col:hw1', componentId: 1, possible: 10, score: 9 }),
    item({ key: 'col:hw2', componentId: 1, possible: 10, score: 6 }),
    item({ key: 'col:final', componentId: 2, possible: 100 }),
  ];

  it('divides by the capacity that is graded, unrounded', () => {
    const result = computed(modelInput({ components, items }));
    // 30 · mean(0.9, 0.6) = 22.5 earned, over the 30 of graded capacity → 75 %.
    // The final is ungraded, so its 70 is on neither side.
    expect(result.standing).toEqual({ pct: 75, earned: 22.5, denominator: 30, letter: 'C' });
  });

  it('lists every component with its graded-so-far result', () => {
    const result = computed(modelInput({ components, items }));
    expect(result.components).toEqual([
      { componentId: 1, code: 'hw', name: 'Homework', state: 'partly_graded', earned: 22.5, gradedCap: 30, cap: 30, capacityFromKnownItems: false },
      { componentId: 2, code: 'final', name: 'Final', state: 'ungraded', earned: 0, gradedCap: 0, cap: 70, capacityFromKnownItems: false },
    ]);
  });

  it('says nothing is graded when nothing that counts is', () => {
    const ungraded = [item({ key: 'col:final', componentId: 2, possible: 100 })];
    expect(run(modelInput({ components, items: ungraded }))).toEqual({
      state: 'not_computable',
      reason: 'nothing_graded',
    });
  });
});

describe('points standings (IST.323-shaped: 104 possible, graded out of 100)', () => {
  const ist323 = scheme({ method: 'points', totalPoints: 104, gradedOutOf: 100 });
  const components = [
    component({ id: 15, code: 'exams', name: 'Exams', points: 100, aggregation: 'sum', countExpected: 3 }),
    component({ id: 17, code: 'extra_credit_lab', name: 'Extra Credit Lab', points: 4, aggregation: 'single', countExpected: 1, isExtraCredit: true }),
  ];
  const exams = [
    item({ key: 'col:e1', componentId: 15, possible: 50, score: 50 }),
    item({ key: 'col:e2', componentId: 15, possible: 50, score: 50 }),
  ];

  it('extra credit raises earned above the graded capacity, without clamping', () => {
    const lab = item({ key: 'col:lab-extra-credit', componentId: 17, possible: 4, score: 4, isExtraCredit: true });
    const result = computed(modelInput({ scheme: ist323, components, items: [...exams, lab] }));
    expect(result.standing).toMatchObject({ earned: 104, denominator: 100, pct: 104 });
    expect(result.components[1]).toMatchObject({ state: 'graded', earned: 4, gradedCap: 4, cap: 4 });
  });

  it('an extra-credit item on a regular component adds to earned only', () => {
    const bonus = item({ key: 'col:bonus', componentId: 15, possible: 5, score: 5, isExtraCredit: true });
    const result = computed(modelInput({ scheme: ist323, components: [components[0]!], items: [...exams, bonus] }));
    expect(result.standing).toMatchObject({ earned: 105, denominator: 100 });
  });

  it('decision: a normalized component with no points takes normalizeTo as its capacity', () => {
    const quizzes = component({ id: 11, name: 'Quizzes', points: null, normalizeTo: 5, aggregation: 'normalized', countExpected: 2 });
    const result = computed(
      modelInput({
        scheme: scheme({ method: 'points' }),
        components: [quizzes],
        items: [item({ key: 'col:q1', componentId: 11, possible: 10, score: 10 })],
      }),
    );
    expect(result.standing).toMatchObject({ earned: 5, denominator: 5, pct: 100 });
  });
});

describe('unlinked scored columns', () => {
  it('lists scored, counted, non-excluded items with no known component, in input order', () => {
    const components = [component({ id: 1, weightPct: 100, aggregation: 'single' })];
    const items = [
      item({ key: 'col:linked', componentId: 1, possible: 10, score: 5 }),
      item({ key: 'col:selection', componentId: null, linkSource: null, linkConfidence: null, possible: 100, score: 0 }),
      item({ key: 'col:attendance', componentId: null, possible: 100, score: 85.714, kind: 'attendance' }),
      item({ key: 'col:unscored', componentId: null, possible: 10 }),
      item({ key: 'col:zero-point', componentId: null, possible: 0, score: 2 }),
      item({ key: 'col:excluded', componentId: null, possible: 10, score: 3, excluded: true }),
      item({ key: 'col:exempt', componentId: null, possible: 10, score: 3, exempt: true }),
      item({ key: 'col:stale-link', componentId: 99, possible: 10, score: 3 }),
    ];
    const result = computed(modelInput({ components, items }));
    expect(result.unlinkedScoredKeys).toEqual(['col:selection', 'col:attendance', 'col:stale-link']);
    expect(result.standing.pct).toBe(50);
  });
});

describe('engine hygiene', () => {
  it('handles a parent cycle without looping and keeps every component', () => {
    const components = [
      component({ id: 1, name: 'A', parentId: 2, weightPct: 50 }),
      component({ id: 2, name: 'B', parentId: 1, weightPct: 50 }),
      component({ id: 3, name: 'C', weightPct: 50 }),
    ];
    const items = [item({ key: 'col:c', componentId: 3, possible: 10, score: 10 })];
    const result = computed(modelInput({ components, items }));
    expect(result.components.map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });

  it('never reads an inherited property name as an item key', () => {
    const components = [component({ id: 1, weightPct: 100, aggregation: 'single' })];
    const items = [item({ key: 'toString', componentId: 1, possible: 100, score: 50 })];
    expect(computed(modelInput({ components, items })).standing.pct).toBe(50);
  });
});
