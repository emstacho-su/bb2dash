/**
 * F05 — extra credit as a score above `possible`. DUMMY DATA.
 *
 * A points course of 100. The instructor gave 22 on a 20-point lab: two bonus
 * points, recorded the way Blackboard records them — in the score, not in a
 * separate column.
 *
 * HAND DERIVATION
 *   Graded points earned    = 22 + 16                              = 38
 *   Graded points available = 20 + 20                              = 40
 *   (the bonus lifts the numerator; it never lifts the denominator)
 *   Exams: nothing graded, out of "so far".
 *   Grade so far = 38 ÷ 40                                          = 0.95
 *                                                                  = 95 %
 *
 * Clamping the lab at 20/20 would read 36/40 = 90 % and throw the bonus away.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F05',
  title: 'Extra credit — a score above its possible',
  probes: 'a bonus point must raise earned and never raise the denominator',
  input: input(
    [
      part({ id: 1, name: 'Labs', points: 40, aggregation: 'sum' }),
      part({ id: 2, name: 'Exams', points: 60, aggregation: 'sum' }),
    ],
    [
      column({ key: 'lab1', componentId: 1, possible: 20, score: 22 }),
      column({ key: 'lab2', componentId: 1, possible: 20, score: 16 }),
      column({ key: 'exam1', componentId: 2, possible: 60, score: null }),
    ],
    { courseId: 'DUMMY.500', method: 'points', totalPoints: 100, gradedOutOf: 100 },
  ),
  truth: { state: 'computed', pct: 95 },
  derivation: () => ((22 + 16) / (20 + 20)) * 100,
  derivationText: '(22 + 16) / (20 + 20) = 38/40 = 95 %. The two bonus points sit in the numerator only.',
};
