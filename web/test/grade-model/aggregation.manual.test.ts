/**
 * L1 — `manual`: `cap·mean(f)` over the graded counted items linked to it;
 * graded items only, no slots.
 *
 * Phase 12b (G-1): none graded no longer hides the course — the part simply
 * contributes nothing to either side of the figure.
 */

import { describe, expect, it } from 'vitest';
import { run } from './run';
import { manualAggregate } from '@/lib/grade-model/aggregations/manual';
import { component, counted, item, leaf, modelInput } from './builders';

describe('manual', () => {
  it.each([
    { name: 'ECN.304 Attendance 85.714/100 linked to Participation 10 %', items: [counted(100, 85.714)], r: null, earned: 8.5714, gradedCap: 10 },
    { name: 'same at best case: r never applies', items: [counted(100, 85.714)], r: 1, earned: 8.5714, gradedCap: 10 },
    { name: 'two linked columns average', items: [counted(100, 90), counted(5, 3.5)], r: 0, earned: 8, gradedCap: 10 },
    { name: 'an ungraded linked column is not remaining work', items: [counted(100, 90), counted(100, null)], r: 0, earned: 9, gradedCap: 10 },
    { name: 'nothing scored', items: [counted(100, null)], r: 1, earned: 0, gradedCap: 0 },
  ])('$name', ({ items, r, earned, gradedCap }) => {
    const outcome = manualAggregate(leaf({ aggregation: 'manual' }, items, 10), r);
    expect(outcome.earned).toBeCloseTo(earned, 12);
    expect(outcome.gradedCap).toBe(gradedCap);
    expect(outcome.remainingCount).toBe(0);
    expect(outcome.remainingCap).toBe(0);
  });

  it('computes a course once its hand-graded part is scored through a link', () => {
    const result = run(
      modelInput({
        components: [
          component({ id: 1, name: 'Participation', weightPct: 10, aggregation: 'manual' }),
          component({ id: 2, name: 'Final', weightPct: 90, aggregation: 'single' }),
        ],
        items: [
          item({ key: 'col:attendance', componentId: 1, linkSource: 'override', possible: 100, score: 80, kind: 'attendance' }),
          item({ key: 'col:final', componentId: 2, possible: 100 }),
        ],
      }),
    );
    expect(result.state).toBe('computed');
    if (result.state !== 'computed') return;
    expect(result.standing.pct).toBeCloseTo(80, 12);
    expect(result.components[0]).toMatchObject({ state: 'graded', earned: 8, gradedCap: 10, cap: 10 });
  });

  it('an ungraded extra-credit item on a hand-graded part adds nothing', () => {
    const result = run(
      modelInput({
        components: [component({ id: 1, name: 'Participation', weightPct: 100, aggregation: 'manual' })],
        items: [
          item({ key: 'col:p', componentId: 1, possible: 10, score: 9 }),
          item({ key: 'col:bonus', componentId: 1, possible: 10, isExtraCredit: true }),
        ],
      }),
    );
    expect(result.state === 'computed' && result.standing.pct).toBeCloseTo(90, 12);
  });
});
