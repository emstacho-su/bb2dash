/**
 * L1 — `projectCourse` standings: graded so far = Σearned / ΣgradedCap; zeros
 * on the rest and best case over the course denominator; extra credit raises
 * earned only; what-if values; unlinked scored columns; nothing rounded.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, type ComputedResult, type ItemInput, type ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';

function computed(input: ModelInput): ComputedResult {
  const result = projectCourse(input);
  expect(result.state).toBe('computed');
  return result as ComputedResult;
}

describe('weighted_pct standings', () => {
  const components = [
    component({ id: 1, code: 'hw', name: 'Homework', weightPct: 30, aggregation: 'average', countExpected: 3 }),
    component({ id: 2, code: 'final', name: 'Final', weightPct: 70, aggregation: 'single', countExpected: 1 }),
  ];
  const items: readonly ItemInput[] = [
    item({ key: 'col:hw1', componentId: 1, possible: 10, score: 9 }),
    item({ key: 'col:hw2', componentId: 1, possible: 10, score: 6 }),
    item({ key: 'asg:final', componentId: 2, possible: 100, kind: 'placeholder' }),
  ];

  it('computes all three projections over the right denominators, unrounded', () => {
    const result = computed(modelInput({ components, items }));
    // graded so far: 30·mean(0.9, 0.6) = 22.5 over graded capacity 30 → 75 %
    expect(result.standings.graded_so_far).toEqual({ pct: 75, earned: 22.5, denominator: 30, letter: 'C' });
    // zeros: 30·mean(0.9, 0.6, 0) = 15 over 100
    expect(result.standings.zeros_on_rest.earned).toBeCloseTo(15, 12);
    expect(result.standings.zeros_on_rest.denominator).toBe(100);
    expect(result.standings.zeros_on_rest.letter).toBe('F');
    // best: 30·mean(0.9, 0.6, 1) + 70 = 25 + 70 = 95 over 100
    expect(result.standings.best_case.pct).toBeCloseTo(95, 12);
    expect(result.standings.best_case.letter).toBe('A');
    expect(result.usesHypotheticals).toBe(false);
    expect(result.agreement).toBeNull();
  });

  it('lists every component with its graded-so-far result', () => {
    const result = computed(modelInput({ components, items }));
    expect(result.components).toEqual([
      { componentId: 1, code: 'hw', name: 'Homework', state: 'partly_graded', earned: 22.5, gradedCap: 30, cap: 30, usesHypothetical: false, capacityFromKnownItems: false },
      { componentId: 2, code: 'final', name: 'Final', state: 'ungraded', earned: 0, gradedCap: 0, cap: 70, usesHypothetical: false, capacityFromKnownItems: false },
    ]);
  });

  it('a what-if value moves every projection and is flagged', () => {
    const result = computed(modelInput({ components, items, scenario: { itemScores: { 'asg:final': 80 } } }));
    // graded so far: (22.5 + 56) / 100
    expect(result.standings.graded_so_far.pct).toBeCloseTo(78.5, 12);
    expect(result.standings.zeros_on_rest.pct).toBeCloseTo(71, 12);
    expect(result.standings.best_case.pct).toBeCloseTo(81, 12);
    expect(result.usesHypotheticals).toBe(true);
    expect(result.components[1]).toMatchObject({ state: 'graded', usesHypothetical: true });
  });

  it.each<{ name: string; scores: Readonly<Record<string, number>> }>([
    { name: 'a key that matches no item', scores: { 'asg:nope': 50 } },
    { name: 'a key on an already graded item (Blackboard wins)', scores: { 'col:hw1': 0 } },
    { name: 'a key on a zero-point item', scores: { 'col:kc': 1 } },
    { name: 'a negative value', scores: { 'asg:final': -1 } },
    { name: 'a value above possible', scores: { 'asg:final': 101 } },
    { name: 'a non-finite value', scores: { 'asg:final': Number.NaN } },
  ])('ignores $name', ({ scores }) => {
    const withKc = [...items, item({ key: 'col:kc', componentId: 1, possible: 0 })];
    const plain = computed(modelInput({ components, items: withKc }));
    const withScenario = computed(modelInput({ components, items: withKc, scenario: { itemScores: scores } }));
    expect(withScenario).toEqual(plain);
  });

  it('never reads an inherited property as a what-if value', () => {
    const ungraded = [item({ key: 'toString', componentId: 2, possible: 100, kind: 'placeholder' })];
    expect(projectCourse(modelInput({ components, items: ungraded })).state).toBe('not_computable');
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

  it('denominator is gradedOutOf, and extra credit raises earned to 104 % without clamping', () => {
    const lab = item({ key: 'asg:lab-extra-credit', componentId: 17, possible: 4, score: 4, isExtraCredit: true, kind: 'placeholder' });
    const result = computed(modelInput({ scheme: ist323, components, items: [...exams, lab] }));
    expect(result.standings.graded_so_far).toMatchObject({ earned: 104, denominator: 100, pct: 104 });
    expect(result.standings.zeros_on_rest).toMatchObject({ earned: 104, denominator: 100, pct: 104 });
    expect(result.components[1]).toMatchObject({ state: 'graded', earned: 4, gradedCap: 4, cap: 4 });
  });

  it('decision: best case counts an ungraded extra-credit lab at full marks', () => {
    const lab = item({ key: 'asg:lab-extra-credit', componentId: 17, possible: 4, isExtraCredit: true, kind: 'placeholder' });
    const result = computed(modelInput({ scheme: ist323, components, items: [...exams, lab] }));
    expect(result.standings.zeros_on_rest.pct).toBe(100);
    expect(result.standings.best_case.pct).toBe(104);
  });

  it('an extra-credit item on a regular component adds to earned only', () => {
    const bonus = item({ key: 'col:bonus', componentId: 15, possible: 5, score: 5, isExtraCredit: true });
    const result = computed(modelInput({ scheme: ist323, components: [components[0]!], items: [...exams, bonus] }));
    expect(result.standings.graded_so_far).toMatchObject({ earned: 105, denominator: 100 });
  });

  it('falls back to totalPoints, then Σcap, for the denominator', () => {
    const noOutOf = computed(modelInput({ scheme: scheme({ method: 'points', totalPoints: 200 }), components, items: exams }));
    expect(noOutOf.standings.zeros_on_rest.denominator).toBe(200);
    const neither = computed(modelInput({ scheme: scheme({ method: 'points' }), components, items: exams }));
    expect(neither.standings.zeros_on_rest.denominator).toBe(100);
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
    expect(result.standings.best_case).toMatchObject({ earned: 5, denominator: 5 });
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
    expect(result.standings.graded_so_far.pct).toBe(50);
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
});
