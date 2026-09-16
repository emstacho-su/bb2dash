/**
 * L1 — `manual`: `cap·mean(f)` over the graded counted items linked to it;
 * graded items only, no slots; none graded → the course is `manual_unscored`.
 */

import { describe, expect, it } from 'vitest';
import { projectCourse } from '@/lib/grade-model';
import { manualAggregate } from '@/lib/grade-model/aggregations/manual';
import { component, counted, item, leaf, modelInput, whatIf } from './builders';

describe('manual', () => {
  it.each([
    { name: 'ECN.304 Attendance 85.714/100 linked to Participation 10 %', items: [counted(100, 85.714)], r: null, earned: 8.5714, gradedCap: 10 },
    { name: 'same at best case: r never applies', items: [counted(100, 85.714)], r: 1, earned: 8.5714, gradedCap: 10 },
    { name: 'two linked columns average', items: [counted(100, 90), counted(5, 3.5)], r: 0, earned: 8, gradedCap: 10 },
    { name: 'an ungraded linked column is not remaining work', items: [counted(100, 90), counted(100, null)], r: 0, earned: 9, gradedCap: 10 },
    { name: 'nothing scored', items: [counted(100, null)], r: 1, earned: 0, gradedCap: 0 },
    { name: 'decision: a what-if value is not a hand-graded score', items: [whatIf(100, 100)], r: null, earned: 0, gradedCap: 0 },
  ])('$name', ({ items, r, earned, gradedCap }) => {
    const outcome = manualAggregate(leaf({ aggregation: 'manual' }, items, 10), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCount).toBe(0);
    expect(outcome.remainingCap).toBe(0);
    expect(outcome.usesHypothetical).toBe(false);
  });

  it('computes a course once its hand-graded part is scored through a link', () => {
    const result = projectCourse(
      modelInput({
        components: [
          component({ id: 1, name: 'Participation', weightPct: 10, aggregation: 'manual' }),
          component({ id: 2, name: 'Final', weightPct: 90, aggregation: 'single' }),
        ],
        items: [
          item({ key: 'col:attendance', componentId: 1, linkSource: 'override', possible: 100, score: 80, kind: 'attendance' }),
          item({ key: 'asg:final', componentId: 2, possible: 100, kind: 'placeholder' }),
        ],
      }),
    );
    expect(result.state).toBe('computed');
    if (result.state !== 'computed') return;
    expect(result.standings.graded_so_far.pct).toBeCloseTo(80, 12);
    expect(result.standings.zeros_on_rest.pct).toBeCloseTo(8, 12);
    expect(result.standings.best_case.pct).toBeCloseTo(98, 12);
    expect(result.components[0]).toMatchObject({ state: 'graded', earned: 8, gradedCap: 10, cap: 10 });
  });

  it('ignores a what-if value on an extra-credit item of a manual part', () => {
    const result = projectCourse(
      modelInput({
        components: [component({ id: 1, name: 'Participation', weightPct: 100, aggregation: 'manual' })],
        items: [
          item({ key: 'col:p', componentId: 1, possible: 10, score: 9 }),
          item({ key: 'col:bonus', componentId: 1, possible: 10, isExtraCredit: true }),
        ],
        scenario: { itemScores: { 'col:bonus': 10 } },
      }),
    );
    expect(result.state === 'computed' && result.standings.best_case.pct).toBeCloseTo(90, 12);
    expect(result.state === 'computed' && result.usesHypotheticals).toBe(false);
  });
});
