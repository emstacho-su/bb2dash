/**
 * F08 — an exempt column carrying a zero. DUMMY DATA.
 *
 * Blackboard marks a quiz exempt (Stack was excused) but leaves 0 in the cell.
 * An exempt item leaves the numerator and the denominator together.
 *
 * HAND DERIVATION
 *   Countable quizzes: 18/20 = 0.90 and 14/20 = 0.70. The exempt 0/20 is out.
 *   Each quiz counts equally, so the part is the mean of the fractions:
 *   (0.90 + 0.70) ÷ 2                                              = 0.80
 *   Grade so far = 100 × 0.80 ÷ 100                                = 0.80
 *                                                                  = 80 %
 *
 * Counting the exempt zero would read (18 + 0 + 14) ÷ 60 = 53.3 %.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F08',
  title: 'An exempt column holding a zero',
  probes: 'exempt work must leave both sides of the ratio',
  input: input(
    [part({ id: 1, name: 'Quizzes', weightPct: 100, aggregation: 'average', countExpected: 3 })],
    [
      column({ key: 'q1', componentId: 1, possible: 20, score: 18 }),
      column({ key: 'q2', componentId: 1, possible: 20, score: 0, exempt: true }),
      column({ key: 'q3', componentId: 1, possible: 20, score: 14 }),
    ],
    { courseId: 'DUMMY.800' },
  ),
  truth: { state: 'computed', pct: 80 },
  derivation: () => ((100 * ((18 / 20 + 14 / 20) / 2)) / 100) * 100,
  derivationText:
    'Fractions 0.90 and 0.70 over the two countable quizzes; the exempt zero is out. Mean 0.80, and 100 × 0.80 / 100 = 80 %.',
};
