/**
 * L1 — placeholders (PM call 7) and the placeholder-drop rule: when a
 * component has more counted items than `countExpected`, placeholders are
 * dropped first, latest `dueAt` first (IST.323's seeded `lab-1` beside the real
 * Lab #1 column).
 */

import { describe, expect, it } from 'vitest';
import { projectCourse, type ComputedResult } from '@/lib/grade-model';
import { countedItems, withoutSurplusPlaceholders } from '@/lib/grade-model/items';
import { component, item, modelInput, scheme } from './builders';

const EMPTY = { itemScores: {} };
const keys = (rows: readonly { key: string }[]) => rows.map((row) => row.key);

describe('withoutSurplusPlaceholders', () => {
  const lab = (n: number, dueAt: string | null = null) =>
    item({ key: `asg:IST.323/lab-${n}`, componentId: 16, possible: 5, kind: 'placeholder', dueAt });
  const realLab1 = item({ key: 'col:IST.323:_3560541_1', componentId: 16, linkSource: 'override', possible: 5, dueAt: '2026-09-24T03:59:00Z' });

  it.each([
    {
      name: 'IST.323 labs: real Lab #1 linked beside four seeded placeholders drops one placeholder',
      rows: [realLab1, lab(1), lab(2), lab(3), lab(4)],
      count: 4,
      kept: ['col:IST.323:_3560541_1', 'asg:IST.323/lab-1', 'asg:IST.323/lab-2', 'asg:IST.323/lab-3'],
    },
    {
      name: 'latest due date is dropped first',
      rows: [lab(1, '2026-10-01T00:00:00Z'), lab(2, '2026-12-01T00:00:00Z'), lab(3, '2026-11-01T00:00:00Z')],
      count: 2,
      kept: ['asg:IST.323/lab-1', 'asg:IST.323/lab-3'],
    },
    {
      name: 'decision: an unknown due date counts as the latest',
      rows: [lab(1, null), lab(2, '2026-12-01T00:00:00Z')],
      count: 1,
      kept: ['asg:IST.323/lab-2'],
    },
    {
      name: 'decision: an unparseable due date counts as unknown',
      rows: [lab(1, 'not a date'), lab(2, '2026-12-01T00:00:00Z')],
      count: 1,
      kept: ['asg:IST.323/lab-2'],
    },
    {
      name: 'real columns are never dropped, even beyond the count',
      rows: [realLab1, { ...realLab1, key: 'col:b' }, { ...realLab1, key: 'col:c' }],
      count: 1,
      kept: ['col:IST.323:_3560541_1', 'col:b', 'col:c'],
    },
    {
      name: 'no count: nothing dropped',
      rows: [lab(1), lab(2)],
      count: null,
      kept: ['asg:IST.323/lab-1', 'asg:IST.323/lab-2'],
    },
    {
      name: 'at the count: nothing dropped',
      rows: [lab(1), lab(2)],
      count: 2,
      kept: ['asg:IST.323/lab-1', 'asg:IST.323/lab-2'],
    },
  ])('$name', ({ rows, count, kept }) => {
    expect(keys(withoutSurplusPlaceholders(countedItems(rows, EMPTY), count))).toEqual(kept);
  });
});

describe('placeholders in the model', () => {
  it('a what-if value on a placeholder counts; the placeholder keeps its possible', () => {
    const result = projectCourse(
      modelInput({
        scheme: scheme({ method: 'points', totalPoints: 30, gradedOutOf: 30 }),
        components: [component({ id: 15, name: 'Exams', points: 30, countExpected: 3, aggregation: 'sum' })],
        items: [
          item({ key: 'col:exam-1', componentId: 15, possible: 10, score: 9.8 }),
          item({ key: 'asg:IST.323/exam-2', componentId: 15, possible: 10, kind: 'placeholder' }),
          item({ key: 'asg:IST.323/exam-3', componentId: 15, possible: 10, kind: 'placeholder' }),
        ],
        scenario: { itemScores: { 'asg:IST.323/exam-2': 7 } },
      }),
    ) as ComputedResult;
    expect(result.usesHypotheticals).toBe(true);
    expect(result.standings.graded_so_far.earned).toBeCloseTo(16.8, 12);
    expect(result.standings.graded_so_far.denominator).toBe(20);
    expect(result.standings.best_case.earned).toBeCloseTo(26.8, 12);
  });

  it('a series placeholder with no points is bookkeeping and never counts toward the surplus', () => {
    const rows = [
      item({ key: 'col:quiz-1', componentId: 2, possible: 10, score: 9 }),
      item({ key: 'asg:ECN.304/quiz-series', componentId: 2, possible: null, kind: 'placeholder', linkConfidence: 'inferred' }),
      item({ key: 'asg:ECN.304/quiz-02', componentId: 2, possible: null, kind: 'placeholder' }),
    ];
    expect(keys(countedItems(rows, EMPTY))).toEqual(['col:quiz-1']);
  });

  it('a dropped placeholder takes its what-if value and its unsure link with it', () => {
    const result = projectCourse(
      modelInput({
        scheme: scheme({ method: 'points', totalPoints: 10, gradedOutOf: 10 }),
        components: [component({ id: 16, name: 'Labs', points: 10, countExpected: 2, aggregation: 'sum' })],
        items: [
          item({ key: 'col:lab-1', componentId: 16, linkSource: 'override', possible: 5, score: 4 }),
          item({ key: 'col:lab-2', componentId: 16, possible: 5, score: 5 }),
          item({ key: 'asg:lab-9', componentId: 16, possible: 5, kind: 'placeholder', linkConfidence: 'tentative' }),
        ],
        scenario: { itemScores: { 'asg:lab-9': 5 } },
      }),
    ) as ComputedResult;
    expect(result.components[0]?.state).toBe('graded');
    expect(result.usesHypotheticals).toBe(false);
    expect(result.standings.zeros_on_rest.pct).toBeCloseTo(90, 12);
  });
});
