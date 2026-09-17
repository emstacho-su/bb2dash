/**
 * L1 — order of checks: no scheme → qualitative / unknown method → unknown
 * aggregation → unscored manual (names listed) → compute, `nothing_graded`
 * when nothing counts and the scenario gives no value.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, solveTarget, type ComponentInput, type ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';

const manualA = component({ id: 1, name: 'Lecture Attendance', weightPct: 5, aggregation: 'manual' });
const manualB = component({ id: 2, name: 'Discussion Section Attendance & Participation', weightPct: 15, aggregation: 'manual' });
const exam = component({ id: 3, name: 'Exam', weightPct: 80, aggregation: 'single', countExpected: 1 });
const unknownChild = component({ id: 4, name: 'Mystery', parentId: 3, weightPct: 10, aggregation: 'unknown' });

const scoredExam = item({ key: 'col:exam', componentId: 3, possible: 100, score: 90 });
const scoredManual = [
  item({ key: 'col:a', componentId: 1, possible: 100, score: 100 }),
  item({ key: 'col:b', componentId: 2, possible: 100, score: 90 }),
];

function reasonOf(input: ModelInput) {
  const result = projectCourse(input);
  return result.state === 'not_computable' ? [result.reason, result.unscoredManual] : ['computed', []];
}

describe('order of checks', () => {
  it.each<{ name: string; input: ModelInput; reason: string; names: readonly string[] }>([
    {
      name: 'no scheme wins over everything',
      input: modelInput({ scheme: null, components: [manualA, unknownChild] }),
      reason: 'no_scheme',
      names: [],
    },
    {
      name: 'qualitative method (IST.471) wins over manual parts and unknown rules',
      input: modelInput({ scheme: scheme({ method: 'qualitative' }), components: [manualA, unknownChild], items: [scoredExam] }),
      reason: 'qualitative_method',
      names: [],
    },
    {
      name: 'unknown method',
      input: modelInput({ scheme: scheme({ method: 'unknown' }), components: [manualA] }),
      reason: 'unknown_method',
      names: [],
    },
    {
      name: 'any unknown aggregation, a child included, wins over unscored manual parts',
      input: modelInput({ components: [manualA, exam, unknownChild] }),
      reason: 'unknown_aggregation',
      names: [],
    },
    {
      name: 'unscored manual parts are named in input order (GEO 103)',
      input: modelInput({ components: [manualA, manualB, exam], items: [scoredExam] }),
      reason: 'manual_unscored',
      names: ['Lecture Attendance', 'Discussion Section Attendance & Participation'],
    },
    {
      name: 'a manual part linked only to zero-point columns is unscored (IST.352)',
      input: modelInput({
        components: [manualB, exam],
        items: [scoredExam, item({ key: 'col:kc', componentId: 2, possible: 0, score: 2 })],
      }),
      reason: 'manual_unscored',
      names: ['Discussion Section Attendance & Participation'],
    },
    {
      name: 'a what-if value does not score a manual part',
      input: modelInput({
        components: [manualA, exam],
        items: [scoredExam, item({ key: 'col:a', componentId: 1, possible: 100 })],
        scenario: { itemScores: { 'col:a': 100 } },
      }),
      reason: 'manual_unscored',
      names: ['Lecture Attendance'],
    },
    {
      name: 'scored manual parts pass the check and count as graded',
      input: modelInput({
        components: [manualA, manualB, exam],
        items: [...scoredManual, item({ key: 'asg:exam', componentId: 3, possible: 100, kind: 'placeholder' })],
      }),
      reason: 'computed',
      names: [],
    },
    {
      name: 'nothing graded at all (IST.466 live)',
      input: modelInput({ components: [exam], items: [item({ key: 'asg:exam', componentId: 3, possible: 100, kind: 'placeholder' })] }),
      reason: 'nothing_graded',
      names: [],
    },
    {
      name: 'nothing graded, but a what-if value computes',
      input: modelInput({
        components: [exam],
        items: [item({ key: 'asg:exam', componentId: 3, possible: 100, kind: 'placeholder' })],
        scenario: { itemScores: { 'asg:exam': 75 } },
      }),
      reason: 'computed',
      names: [],
    },
    {
      name: 'decision: an extra-credit score alone is nothing that counts',
      input: modelInput({
        components: [exam, component({ id: 9, name: 'Bonus', weightPct: 4, isExtraCredit: true })],
        items: [item({ key: 'col:bonus', componentId: 9, possible: 4, score: 4, isExtraCredit: true })],
      }),
      reason: 'nothing_graded',
      names: [],
    },
    {
      name: 'decision: muting that leaves no capacity is nothing that counts',
      input: modelInput({
        components: [exam],
        items: [item({ key: 'col:exam', componentId: 3, possible: 100, score: 90, linkConfidence: 'tentative' })],
      }),
      reason: 'nothing_graded',
      names: [],
    },
    {
      name: 'no components at all',
      input: modelInput({ components: [] as ComponentInput[] }),
      reason: 'nothing_graded',
      names: [],
    },
  ])('$name', ({ input, reason, names }) => {
    expect(reasonOf(input)).toEqual([reason, names]);
  });

  it('the solver returns the same not-computable reason', () => {
    const input = modelInput({ components: [manualA, exam], items: [scoredExam] });
    expect(solveTarget(input, 'A-')).toEqual({ state: 'not_computable', reason: 'manual_unscored' });
    expect(solveTarget(modelInput({ scheme: null }), 'A-')).toEqual({ state: 'not_computable', reason: 'no_scheme' });
  });
});
