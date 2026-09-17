/**
 * F06 — a part with no graded work at all, and one with no columns at all.
 * DUMMY DATA.
 *
 * Participation 20 % has no Blackboard column yet; the final exam has a column
 * but no score; only one of the two essays is back.
 *
 * HAND DERIVATION
 *   Participation: no column, nothing graded — out of "so far".
 *   Final exam:    a column, no score       — out of "so far".
 *   Essays:        one graded, 88 ÷ 100                            = 0.88
 *   Graded weight  = 50
 *   Earned weight  = 50 × 0.88                                     = 44
 *   Grade so far   = 44 ÷ 50                                       = 0.88
 *                                                                  = 88 %
 *
 * The trap is to count Participation's 20 % as zero, which would read
 * 44 ÷ 100 = 44 % — a projection, not a grade so far.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F06',
  title: 'A whole part still ungraded',
  probes: 'ungraded work must leave the denominator, not sit in it as a zero',
  input: input(
    [
      part({ id: 1, name: 'Participation', weightPct: 20, aggregation: 'average', countExpected: 10 }),
      part({ id: 2, name: 'Essays', weightPct: 50, aggregation: 'average', countExpected: 2 }),
      part({ id: 3, name: 'Final exam', weightPct: 30, aggregation: 'single' }),
    ],
    [
      column({ key: 'essay1', componentId: 2, possible: 100, score: 88 }),
      column({ key: 'essay2', componentId: 2, possible: 100, score: null }),
      column({ key: 'finalExam', componentId: 3, possible: 200, score: null }),
    ],
    { courseId: 'DUMMY.600' },
  ),
  truth: { state: 'computed', pct: 88 },
  derivation: () => ((50 * (88 / 100)) / 50) * 100,
  derivationText:
    'Only Essays has a graded item: 88/100 = 0.88 at weight 50. 50 × 0.88 / 50 = 88 %. Participation and the final exam are out of both sides.',
};
