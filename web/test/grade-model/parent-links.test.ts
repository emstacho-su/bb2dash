/**
 * L1 — Round 2 R2-1: an item linked straight to a component that has children
 * (IST.323 Final Project, id 14) is treated as unlinked — never counted, and
 * listed in `unlinkedScoredKeys` when scored, so the screen can offer the
 * "Counts toward…" picker on it.
 *
 * Phase 12b (G-1) removed the what-if and agreement halves of this rule; what
 * is left is the placement itself, which still decides what the figure counts.
 */

import { describe, expect, it } from 'vitest';
import type { ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';
import { run, type RunResult } from './run';

const components = [
  component({ id: 14, code: 'final_project', name: 'Final Project', points: 20, aggregation: 'sum' }),
  component({ id: 18, code: 'fp_proposal', name: 'Proposal', parentId: 14, points: 11, countExpected: 1 }),
  component({ id: 19, code: 'fp_log', name: 'Running Log', parentId: 14, points: 9, countExpected: 1 }),
  component({ id: 15, code: 'exams', name: 'Exams', points: 80, countExpected: 1 }),
];
const exam = item({ key: 'col:exam', componentId: 15, possible: 80, score: 60 });
const points = scheme({ method: 'points', totalPoints: 100, gradedOutOf: 100 });

function computed(input: ModelInput): Extract<RunResult, { state: 'computed' }> {
  const result = run(input);
  expect(result.state).toBe('computed');
  return result as Extract<RunResult, { state: 'computed' }>;
}

describe('R2-1 items linked straight to a parent', () => {
  const direct = item({ key: 'col:IST.323:_3569973_1', componentId: 14, possible: 13, score: 12 });

  it('are listed as unlinked when scored and contribute nothing', () => {
    const withDirect = computed(modelInput({ scheme: points, components, items: [exam, direct] }));
    const without = computed(modelInput({ scheme: points, components, items: [exam] }));
    expect(withDirect.unlinkedScoredKeys).toEqual(['col:IST.323:_3569973_1']);
    expect(withDirect.standing).toEqual(without.standing);
    expect(withDirect.components).toEqual(without.components);
  });

  it('are not listed while unscored', () => {
    const unscored = { ...direct, score: null };
    const plain = computed(modelInput({ scheme: points, components, items: [exam, unscored] }));
    expect(plain.unlinkedScoredKeys).toEqual([]);
  });

  it('a hand-graded component with children is computed from its children', () => {
    const tree = [
      component({ id: 1, name: 'Participation', points: 10, aggregation: 'manual' }),
      component({ id: 2, name: 'Discussion', parentId: 1, points: 10, countExpected: 1 }),
    ];
    const result = computed(
      modelInput({
        scheme: scheme({ method: 'points', totalPoints: 10, gradedOutOf: 10 }),
        components: tree,
        items: [item({ key: 'col:d', componentId: 2, possible: 10, score: 9 })],
      }),
    );
    expect(result.standing.pct).toBeCloseTo(90, 9);
  });
});
