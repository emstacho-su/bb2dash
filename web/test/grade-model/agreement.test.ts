/**
 * L4 — agreement with Blackboard's published total (real scores only).
 * IST.323's live 9/14 and 9/16 rows reproduce Blackboard's 5.0 and 14.8 with
 * participation set aside; every computed fixture with a total agrees or names
 * a reason, never `unexplained`; each DeltaReason fires on its own condition.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, type ComputedResult, type ModelInput } from '@/lib/grade-model';
import { evaluateModel } from '@/lib/grade-model/project';
import { component, item, modelInput, scheme, total } from './builders';
import { fixtureFor, inputOf, loadFixtures, stateOf } from './fixture-loader';

function computed(input: ModelInput): ComputedResult {
  const result = projectCourse(input);
  expect(result.state).toBe('computed');
  return result as ComputedResult;
}

describe('L4 IST.323 reproduces Blackboard', () => {
  const ist323 = fixtureFor('IST.323');
  const PARTICIPATION_ID = 10;

  /** Participation set aside: the manual component and anything linked to it leave the input. */
  const withoutParticipation = (input: ModelInput): ModelInput => ({
    ...input,
    components: input.components.filter((c) => c.id !== PARTICIPATION_ID),
    items: input.items.filter((row) => row.componentId !== PARTICIPATION_ID),
  });

  it.each([
    { state: 'live_2026_09_14', blackboard: 5 },
    { state: 'live_2026_09_16', blackboard: 14.8 },
  ])('$state: internal graded so far = Blackboard $blackboard exactly', ({ state, blackboard }) => {
    const input = inputOf(ist323, stateOf(ist323, state));
    expect(input.blackboardTotal?.score).toBe(blackboard);
    expect(input.blackboardTotal?.running).toBe(true);
    if (input.scheme === null || input.scheme.method !== 'points') throw new Error('IST.323 is a points scheme');
    const evaluation = evaluateModel(input, input.scheme, input.scheme.method);
    expect(evaluation.gradedSoFar.earned).toBe(blackboard);
  });

  it.each([
    { state: 'live_2026_09_14', blackboard: 5 },
    { state: 'live_2026_09_16', blackboard: 14.8 },
  ])('$state: with participation set aside the public agreement agrees at $blackboard', ({ state, blackboard }) => {
    const result = computed(withoutParticipation(inputOf(ist323, stateOf(ist323, state))));
    expect(result.agreement).toEqual({ status: 'agrees', modelValue: blackboard, blackboardValue: blackboard, unit: 'points', delta: 0, reasons: [] });
  });

  it('with participation scored, the whole course agrees end to end', () => {
    const result = computed(inputOf(ist323, stateOf(ist323, 'participation_scored')));
    expect(result.agreement).toMatchObject({ status: 'agrees', modelValue: 19.8, blackboardValue: 19.8, reasons: [] });
  });
});

describe('L4 every computed fixture with a Blackboard total', () => {
  const cases = loadFixtures().flatMap((fixture) =>
    fixture.states
      .filter((state) => state.blackboardTotal?.score != null)
      .map((state) => ({ label: `${fixture.course}/${state.name}`, input: inputOf(fixture, state) })),
  );

  it('there are some', () => {
    expect(cases.map((c) => c.label)).toEqual(expect.arrayContaining(['IST.323/participation_scored', 'IST.323/mid']));
  });

  it.each(cases)('$label agrees or names a reason, never unexplained', ({ input }) => {
    const result = projectCourse(input);
    if (result.state !== 'computed') return;
    expect(result.agreement).not.toBeNull();
    const agreement = result.agreement!;
    if (agreement.status === 'agrees') expect(agreement.reasons).toEqual([]);
    else expect(agreement.reasons.length).toBeGreaterThan(0);
    expect(agreement.reasons).not.toContain('unexplained');
  });
});

describe('L4 delta reasons', () => {
  const weighted = [
    component({ id: 1, code: 'hw', name: 'Homework', weightPct: 40, aggregation: 'average', countExpected: 2 }),
    component({ id: 2, code: 'final', name: 'Final', weightPct: 60, aggregation: 'single', countExpected: 1 }),
  ];
  const baseItems = [
    item({ key: 'col:hw1', componentId: 1, possible: 10, score: 8 }),
    item({ key: 'asg:final', componentId: 2, possible: 100, kind: 'placeholder' }),
  ];
  // Graded so far 80 %; zeros on the rest 16 %; best case 76 %.
  const run = (overrides: Partial<ModelInput>) => computed(modelInput({ components: weighted, items: baseItems, ...overrides })).agreement;

  it('running = true compares graded so far in percent (score / possible · 100)', () => {
    expect(run({ blackboardTotal: total({ score: 160, possible: 200, running: true }) })).toEqual({
      status: 'agrees', modelValue: 80, blackboardValue: 80, unit: 'pct', delta: 0, reasons: [],
    });
  });

  it('agrees at exactly 0.5 and differs just past it', () => {
    expect(run({ blackboardTotal: total({ score: 80.5, running: true }) })?.status).toBe('agrees');
    expect(run({ blackboardTotal: total({ score: 80.5001, running: true }) })?.status).toBe('differs');
  });

  it('running = false compares zeros on the rest and names ungraded_counted_as_zero', () => {
    expect(run({ blackboardTotal: total({ score: 16, running: false }) })).toMatchObject({ status: 'agrees', modelValue: 16 });
    expect(run({ blackboardTotal: total({ score: 20, running: false }) })).toMatchObject({
      status: 'differs', delta: -4, reasons: ['ungraded_counted_as_zero'],
    });
  });

  it('running = null compares zeros on the rest and names bb_running_total', () => {
    expect(run({ blackboardTotal: total({ score: 80, running: null }) })).toMatchObject({
      status: 'differs', modelValue: 16, reasons: ['bb_running_total'],
    });
  });

  it('names unexplained only when no condition holds', () => {
    expect(run({ blackboardTotal: total({ score: 70, running: true }) })?.reasons).toEqual(['unexplained']);
  });

  it('names muted_component, unlinked_column, extra_credit and drop_lowest_pending together, in enum order', () => {
    const components = [
      ...weighted,
      component({ id: 3, code: 'quiz', name: 'Quizzes', weightPct: 10, aggregation: 'average_drop_lowest', dropLowest: 1, countExpected: 3 }),
      component({ id: 4, code: 'bonus', name: 'Bonus', weightPct: 5, isExtraCredit: true }),
    ];
    const items = [
      ...baseItems,
      item({ key: 'col:q1', componentId: 3, possible: 10, score: 5 }),
      item({ key: 'col:bonus', componentId: 4, possible: 5, score: 5, isExtraCredit: true }),
      item({ key: 'col:unsure', componentId: 2, possible: 100, score: 90, linkConfidence: 'inferred' }),
      item({ key: 'col:loose', componentId: null, linkSource: null, linkConfidence: null, possible: 10, score: 10 }),
    ];
    const agreement = computed(modelInput({ components, items, blackboardTotal: total({ score: 10, running: true }) })).agreement;
    expect(agreement?.reasons).toEqual(['drop_lowest_pending', 'extra_credit', 'muted_component', 'unlinked_column']);
  });

  it('points method compares points and scales the 0.5 band by the course (IST.466: 5.1 of 1020)', () => {
    const points = scheme({ method: 'points', totalPoints: 1020, gradedOutOf: 1020 });
    const components = [component({ id: 1, name: 'Paper', points: 1020, countExpected: 1 })];
    const items = [item({ key: 'col:paper', componentId: 1, possible: 1020, score: 900 })];
    const at = (score: number) => computed(modelInput({ scheme: points, components, items, blackboardTotal: total({ score, possible: 1020, running: true }) })).agreement;
    expect(at(905.1)).toMatchObject({ status: 'agrees', unit: 'points', modelValue: 900 });
    expect(at(905.2)).toMatchObject({ status: 'differs', reasons: ['unexplained'] });
  });

  it('is null without a total, without a score, or with no usable possible for a percent comparison', () => {
    expect(run({ blackboardTotal: null })).toBeNull();
    expect(run({ blackboardTotal: total({ score: null }) })).toBeNull();
    expect(run({ blackboardTotal: total({ score: 80, possible: 0 }) })).toBeNull();
    expect(run({ blackboardTotal: total({ score: 80, possible: null }) })).toBeNull();
    expect(run({ blackboardTotal: total({ score: Number.NaN }) })).toBeNull();
  });

  it('uses real scores only: a what-if value never moves it', () => {
    const blackboardTotal = total({ score: 80, running: true });
    const real = run({ blackboardTotal });
    const withWhatIf = run({ blackboardTotal, scenario: { itemScores: { 'asg:final': 100 } } });
    expect(withWhatIf).toEqual(real);
  });

  it('decision: a course computable only through what-if values has no agreement', () => {
    const items = [item({ key: 'asg:final', componentId: 2, possible: 100, kind: 'placeholder' })];
    const result = computed(
      modelInput({ components: weighted, items, scenario: { itemScores: { 'asg:final': 90 } }, blackboardTotal: total({ score: 50 }) }),
    );
    expect(result.agreement).toBeNull();
  });
});
