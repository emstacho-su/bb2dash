/**
 * L1 — Round 2 R2-1: an item linked straight to a component that has children
 * (IST.323 Final Project, id 14) is treated as unlinked: never counted, listed
 * in `unlinkedScoredKeys` when scored, and the agreement names `unlinked_column`.
 * (The no-what-if-target half is in `item-states.test.ts`.)
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, type ComputedResult, type ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme, total } from './builders';

const components = [
  component({ id: 14, code: 'final_project', name: 'Final Project', points: 20, aggregation: 'sum' }),
  component({ id: 18, code: 'fp_proposal', name: 'Proposal', parentId: 14, points: 11, countExpected: 1 }),
  component({ id: 19, code: 'fp_log', name: 'Running Log', parentId: 14, points: 9, countExpected: 1 }),
  component({ id: 15, code: 'exams', name: 'Exams', points: 80, countExpected: 1 }),
];
const exam = item({ key: 'col:exam', componentId: 15, possible: 80, score: 60 });
const points = scheme({ method: 'points', totalPoints: 100, gradedOutOf: 100 });

function computed(input: ModelInput): ComputedResult {
  const result = projectCourse(input);
  expect(result.state).toBe('computed');
  return result as ComputedResult;
}

describe('R2-1 items linked straight to a parent', () => {
  const direct = item({ key: 'col:IST.323:_3569973_1', componentId: 14, possible: 13, score: 12 });

  it('are listed as unlinked when scored and contribute nothing', () => {
    const withDirect = computed(modelInput({ scheme: points, components, items: [exam, direct] }));
    const without = computed(modelInput({ scheme: points, components, items: [exam] }));
    expect(withDirect.unlinkedScoredKeys).toEqual(['col:IST.323:_3569973_1']);
    expect(withDirect.standings).toEqual(without.standings);
    expect(withDirect.components).toEqual(without.components);
  });

  it('are not listed while unscored, and a what-if value on one is ignored', () => {
    const unscored = { ...direct, score: null };
    const plain = computed(modelInput({ scheme: points, components, items: [exam, unscored] }));
    const typed = computed(modelInput({ scheme: points, components, items: [exam, unscored], scenario: { itemScores: { [direct.key]: 13 } } }));
    expect(plain.unlinkedScoredKeys).toEqual([]);
    expect(typed).toEqual(plain);
  });

  it('a pointless placeholder on a parent takes no percent value (IST.323 fp-packet)', () => {
    const packet = item({ key: 'asg:IST.323/fp-packet', componentId: 14, possible: null, kind: 'placeholder' });
    const single = [{ ...components[0]!, aggregation: 'single' as const }, ...components.slice(1)];
    const plain = computed(modelInput({ scheme: points, components: single, items: [exam, packet] }));
    const typed = computed(modelInput({ scheme: points, components: single, items: [exam, packet], scenario: { itemScores: { [packet.key]: 90 } } }));
    expect(typed).toEqual(plain);
    expect(typed.usesHypotheticals).toBe(false);
  });

  it('make the agreement name unlinked_column instead of unexplained', () => {
    // Blackboard counts the 12 on the proposal column; the model cannot: 60 vs 72.
    const result = computed(
      modelInput({ scheme: points, components, items: [exam, direct], blackboardTotal: total({ score: 72, possible: 100, running: true }) }),
    );
    expect(result.agreement).toMatchObject({ status: 'differs', modelValue: 60, blackboardValue: 72, reasons: ['unlinked_column'] });
  });

  it('a manual component with children is not checked for scores (only leaves are)', () => {
    const tree = [
      component({ id: 1, name: 'Participation', points: 10, aggregation: 'manual' }),
      component({ id: 2, name: 'Discussion', parentId: 1, points: 10, countExpected: 1 }),
    ];
    const result = computed(
      modelInput({ scheme: scheme({ method: 'points', totalPoints: 10, gradedOutOf: 10 }), components: tree, items: [item({ key: 'col:d', componentId: 2, possible: 10, score: 9 })] }),
    );
    expect(result.standings.graded_so_far.pct).toBeCloseTo(90, 9);
  });
});
