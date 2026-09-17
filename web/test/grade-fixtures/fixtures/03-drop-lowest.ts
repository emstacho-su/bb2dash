/**
 * F03 — a quiz part that drops its lowest score. DUMMY DATA.
 *
 * Quizzes 40 % (five expected, lowest dropped), Final 60 % (ungraded).
 * Four quizzes are back: 10/10, 9/10, 8/10 and a bad 3/10.
 *
 * HAND DERIVATION
 *   Quiz fractions graded so far: 1.0, 0.9, 0.8, 0.3
 *   The syllabus drops the lowest, so 0.3 goes.
 *   Quiz standing = (1.0 + 0.9 + 0.8) ÷ 3 = 2.7 / 3                = 0.90
 *   Final: nothing graded, out of "so far".
 *   Grade so far  = 40 × 0.90 ÷ 40                                 = 0.90
 *                                                                  = 90 %
 *
 * A method that cannot see the drop rule reads 30/40 = 75 % — fifteen points
 * of difference on one rule.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F03',
  title: 'Drop-lowest quiz part',
  probes: 'a syllabus rule that removes a score from the arithmetic',
  input: input(
    [
      part({
        id: 1,
        name: 'Quizzes',
        weightPct: 40,
        aggregation: 'average_drop_lowest',
        dropLowest: 1,
        countExpected: 5,
      }),
      part({ id: 2, name: 'Final', weightPct: 60, aggregation: 'single' }),
    ],
    [
      column({ key: 'q1', componentId: 1, possible: 10, score: 10 }),
      column({ key: 'q2', componentId: 1, possible: 10, score: 9 }),
      column({ key: 'q3', componentId: 1, possible: 10, score: 8 }),
      column({ key: 'q4', componentId: 1, possible: 10, score: 3 }),
      column({ key: 'final', componentId: 2, possible: 100, score: null }),
    ],
    { courseId: 'DUMMY.300' },
  ),
  truth: { state: 'computed', pct: 90 },
  derivation: () => ((40 * ((1.0 + 0.9 + 0.8) / 3)) / 40) * 100,
  derivationText:
    'Quiz fractions 1.0, 0.9, 0.8, 0.3; the lowest is dropped; mean of the rest = 0.90. Only the quiz part is graded, so 40 × 0.90 / 40 = 90 %.',
};
