/**
 * L1 — muting (Stack's answer 3, PM call 10): a component with a counted item
 * whose link is not `confirmed` is left out of every projection and named;
 * an override confirms; bookkeeping, exempt and excluded items never mute; the
 * manual check runs first.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, type ComputedResult, type ItemInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';

const components = [
  component({ id: 1, code: 'quizzes', name: 'Quizzes', weightPct: 40, aggregation: 'average', countExpected: 2 }),
  component({ id: 2, code: 'project', name: 'Project', weightPct: 60, aggregation: 'single', countExpected: 1 }),
];
const quizItems: readonly ItemInput[] = [
  item({ key: 'col:q1', componentId: 1, possible: 10, score: 8 }),
  item({ key: 'col:q2', componentId: 1, possible: 10, score: 10 }),
];
const project = (overrides: Partial<ItemInput>) =>
  item({ key: 'col:project', componentId: 2, possible: 100, score: 50, ...overrides });

function computed(items: readonly ItemInput[], extra: Partial<Parameters<typeof modelInput>[0]> = {}) {
  const result = projectCourse(modelInput({ components, items, ...extra }));
  expect(result.state).toBe('computed');
  return result as ComputedResult;
}

describe('muting', () => {
  it.each([
    { name: 'tentative assignment link mutes', overrides: { linkConfidence: 'tentative' as const }, muted: true },
    { name: 'inferred assignment link mutes', overrides: { linkConfidence: 'inferred' as const }, muted: true },
    { name: 'a linked item with no confidence at all mutes', overrides: { linkConfidence: null }, muted: true },
    { name: 'confirmed assignment link counts', overrides: { linkConfidence: 'confirmed' as const }, muted: false },
    { name: 'an override confirms, whatever the assignment said', overrides: { linkSource: 'override' as const, linkConfidence: 'tentative' as const }, muted: false },
    { name: 'a zero-point item never mutes (IST.352 knowledge checks)', overrides: { key: 'col:kc', possible: 0, score: 2, linkConfidence: 'tentative' as const }, muted: false },
    { name: 'an exempt item never mutes', overrides: { exempt: true, linkConfidence: 'tentative' as const }, muted: false },
    { name: 'an excluded ("Not graded") item never mutes', overrides: { excluded: true, linkConfidence: 'tentative' as const }, muted: false },
  ])('$name', ({ overrides, muted }) => {
    const result = computed([...quizItems, project(overrides)]);
    expect(result.components[1]?.state === 'muted').toBe(muted);
  });

  it('a muted part is left out of earned, graded capacity, capacity and denominator, and reports its nominal cap', () => {
    const result = computed([...quizItems, project({ linkConfidence: 'tentative' })]);
    // Quizzes only: mean(0.8, 1.0) = 0.9 of 40 = 36 over 40.
    expect(result.standings.graded_so_far).toMatchObject({ earned: 36, denominator: 40 });
    expect(result.standings.graded_so_far.pct).toBeCloseTo(90, 12);
    expect(result.standings.zeros_on_rest).toMatchObject({ earned: 36, denominator: 40 });
    expect(result.standings.best_case).toMatchObject({ earned: 36, denominator: 40 });
    expect(result.components[1]).toMatchObject({ state: 'muted', earned: 0, gradedCap: 0, cap: 60, usesHypothetical: false });
  });

  it('muting one part leaves the other part’s result untouched', () => {
    const counted = computed([...quizItems, project({})]);
    const muted = computed([...quizItems, project({ linkConfidence: 'tentative' })]);
    expect(muted.components[0]).toEqual(counted.components[0]);
  });

  it('points method: the muted cap comes off gradedOutOf (IST.466 Major Cases 300 + AI Team 100)', () => {
    const ist466 = scheme({ method: 'points', totalPoints: 1020, gradedOutOf: 1020 });
    const parts = [
      component({ id: 24, name: 'Two Major Case Studies', points: 300, countExpected: 2, aggregation: 'sum' }),
      component({ id: 36, name: 'AI Team Assignment', points: 100, countExpected: 1, aggregation: 'single' }),
      component({ id: 28, name: 'Ethics Case Practice', points: 620, countExpected: 1, aggregation: 'single' }),
    ];
    const items = [
      item({ key: 'col:major-1', componentId: 24, possible: 150, linkConfidence: 'tentative' }),
      item({ key: 'asg:ai-team', componentId: 36, possible: 100, kind: 'placeholder', linkConfidence: 'tentative' }),
      item({ key: 'col:practice', componentId: 28, possible: 50, score: 45 }),
    ];
    const result = projectCourse(modelInput({ scheme: ist466, components: parts, items })) as ComputedResult;
    expect(result.standings.zeros_on_rest.denominator).toBe(620);
    expect(result.components.map((c) => c.state)).toEqual(['muted', 'muted', 'graded']);
  });

  it('the manual check runs first: a muted, unscored manual part still hides the model', () => {
    const result = projectCourse(
      modelInput({
        components: [...components, component({ id: 3, name: 'Participation', weightPct: 10, aggregation: 'manual' })],
        items: [...quizItems, project({}), item({ key: 'col:part', componentId: 3, possible: 5, linkConfidence: 'tentative' })],
      }),
    );
    expect(result).toEqual({ state: 'not_computable', reason: 'manual_unscored', unscoredManual: ['Participation'] });
  });

  it('a muted manual part that is scored is simply left out', () => {
    const result = projectCourse(
      modelInput({
        components: [...components, component({ id: 3, name: 'Participation', weightPct: 10, aggregation: 'manual' })],
        items: [...quizItems, project({}), item({ key: 'col:part', componentId: 3, possible: 5, score: 5, linkConfidence: 'tentative' })],
      }),
    ) as ComputedResult;
    expect(result.components[2]?.state).toBe('muted');
    expect(result.standings.zeros_on_rest.denominator).toBe(100);
  });

  it('a muted parent mutes its children with it', () => {
    const tree = [
      component({ id: 10, name: 'Final Project', points: 20, aggregation: 'sum' }),
      component({ id: 11, name: 'Proposal', parentId: 10, points: 20, countExpected: 1, aggregation: 'single' }),
      component({ id: 12, name: 'Exams', points: 80, countExpected: 1, aggregation: 'single' }),
    ];
    const items = [
      item({ key: 'col:direct', componentId: 10, possible: 5, linkConfidence: 'tentative' }),
      item({ key: 'col:proposal', componentId: 11, possible: 20, score: 20 }),
      item({ key: 'col:exam', componentId: 12, possible: 100, score: 70 }),
    ];
    const result = projectCourse(
      modelInput({ scheme: scheme({ method: 'points', totalPoints: 100, gradedOutOf: 100 }), components: tree, items }),
    ) as ComputedResult;
    expect(result.components.map((c) => c.state)).toEqual(['muted', 'muted', 'graded']);
    expect(result.standings.zeros_on_rest).toMatchObject({ earned: 56, denominator: 80 });
  });

  it('a what-if value on a muted part is not used', () => {
    const result = computed([...quizItems, project({ score: null, linkConfidence: 'tentative' })], {
      scenario: { itemScores: { 'col:project': 100 } },
    });
    expect(result.usesHypotheticals).toBe(false);
    expect(result.standings.best_case.earned).toBe(36);
  });
});
