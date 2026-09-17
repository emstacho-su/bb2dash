/**
 * L1 — order of checks: no scheme → qualitative / unknown method → unknown
 * aggregation → compute, `nothing_graded` when nothing that counts is graded.
 *
 * Phase 12b (G-1) removed the `manual_unscored` gate that used to sit between
 * the unknown-aggregation check and the arithmetic. A hand-graded part nobody
 * has scored is now ordinary ungraded work: the course computes without it, and
 * the screen names it under the figure. The cases below that used to expect
 * `manual_unscored` expect a figure instead — that reversal is the point of the
 * row, so it is asserted here rather than only in `graded-so-far.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { ComponentInput, ModelInput } from '@/lib/grade-model';
import { component, item, modelInput, scheme } from './builders';
import { run } from './run';

const manualA = component({ id: 1, name: 'Lecture Attendance', weightPct: 5, aggregation: 'manual' });
const manualB = component({ id: 2, name: 'Discussion Section Attendance & Participation', weightPct: 15, aggregation: 'manual' });
const exam = component({ id: 3, name: 'Exam', weightPct: 80, aggregation: 'single', countExpected: 1 });
const unknownChild = component({ id: 4, name: 'Mystery', parentId: 3, weightPct: 10, aggregation: 'unknown' });

const scoredExam = item({ key: 'col:exam', componentId: 3, possible: 100, score: 90 });
const scoredManual = [
  item({ key: 'col:a', componentId: 1, possible: 100, score: 100 }),
  item({ key: 'col:b', componentId: 2, possible: 100, score: 90 }),
];

function reasonOf(input: ModelInput): string {
  const result = run(input);
  return result.state === 'not_computable' ? result.reason : 'computed';
}

describe('order of checks', () => {
  it.each<{ name: string; input: ModelInput; reason: string }>([
    {
      name: 'no scheme wins over everything',
      input: modelInput({ scheme: null, components: [manualA, unknownChild] }),
      reason: 'no_scheme',
    },
    {
      name: 'qualitative method (IST.471) wins over unknown rules',
      input: modelInput({ scheme: scheme({ method: 'qualitative' }), components: [manualA, unknownChild], items: [scoredExam] }),
      reason: 'qualitative_method',
    },
    {
      name: 'unknown method',
      input: modelInput({ scheme: scheme({ method: 'unknown' }), components: [manualA] }),
      reason: 'unknown_method',
    },
    {
      name: 'any unknown aggregation, a child included',
      input: modelInput({ components: [manualA, exam, unknownChild] }),
      reason: 'unknown_aggregation',
    },
    {
      name: 'G-1: unscored hand-graded parts no longer hide the course (GEO 103)',
      input: modelInput({ components: [manualA, manualB, exam], items: [scoredExam] }),
      reason: 'computed',
    },
    {
      name: 'G-1: nor does a hand-graded part linked only to zero-point columns (IST.352)',
      input: modelInput({
        components: [manualB, exam],
        items: [scoredExam, item({ key: 'col:kc', componentId: 2, possible: 0, score: 2 })],
      }),
      reason: 'computed',
    },
    {
      name: 'scored hand-graded parts compute, as they always did',
      input: modelInput({ components: [manualA, manualB, exam], items: [...scoredManual, scoredExam] }),
      reason: 'computed',
    },
    {
      name: 'nothing graded at all (IST.466 live)',
      input: modelInput({ components: [exam], items: [item({ key: 'col:exam', componentId: 3, possible: 100 })] }),
      reason: 'nothing_graded',
    },
    {
      name: 'decision: an extra-credit score alone is nothing that counts',
      input: modelInput({
        components: [exam, component({ id: 9, name: 'Bonus', weightPct: 4, isExtraCredit: true })],
        items: [item({ key: 'col:bonus', componentId: 9, possible: 4, score: 4, isExtraCredit: true })],
      }),
      reason: 'nothing_graded',
    },
    {
      name: 'G-1: an unsure link no longer empties the course — it counts',
      input: modelInput({
        components: [exam],
        items: [item({ key: 'col:exam', componentId: 3, possible: 100, score: 90, linkConfidence: 'tentative' })],
      }),
      reason: 'computed',
    },
    {
      name: 'no components at all',
      input: modelInput({ components: [] as ComponentInput[] }),
      reason: 'nothing_graded',
    },
  ])('$name', ({ input, reason }) => {
    expect(reasonOf(input)).toBe(reason);
  });

  it('a course carried only by hand-graded parts nobody scored still says nothing is graded', () => {
    const input = modelInput({ components: [manualA, manualB] });
    expect(reasonOf(input)).toBe('nothing_graded');
  });

  it('the unscored hand-graded part is simply absent from the figure', () => {
    const result = run(modelInput({ components: [manualA, manualB, exam], items: [scoredExam] }));
    expect(result.state).toBe('computed');
    if (result.state !== 'computed') return;
    // 80 × 0.9 = 72 earned over the 80 that is graded; the 20 of unscored
    // attendance is on neither side.
    expect(result.standing).toMatchObject({ earned: 72, denominator: 80, pct: 90 });
  });
});
