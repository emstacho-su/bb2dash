/**
 * F10 — two quizzes of very different sizes inside one part. DUMMY DATA.
 *
 * The syllabus says the quiz grade is the average of the quizzes: each quiz
 * counts equally, whatever it is marked out of. One is a 10-point pop quiz,
 * the other a 100-point unit quiz.
 *
 * HAND DERIVATION
 *   Pop quiz    10 ÷ 10                                            = 1.00
 *   Unit quiz   50 ÷ 100                                           = 0.50
 *   Each counts equally: (1.00 + 0.50) ÷ 2                         = 0.75
 *   Grade so far = 100 × 0.75 ÷ 100                                = 0.75
 *                                                                  = 75 %
 *
 * Pooling the points instead reads (10 + 50) ÷ (10 + 100) = 54.5 %: the pop
 * quiz is worth a tenth of the unit quiz in the pool and the syllabus says it
 * is worth the same. Twenty points of difference on one rule.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F10',
  title: 'Mixed point scales inside one part',
  probes: 'an average of fractions against a pool of points — the sharpest split',
  input: input(
    [part({ id: 1, name: 'Quizzes', weightPct: 100, aggregation: 'average', countExpected: 2 })],
    [
      column({ key: 'quizShort', componentId: 1, possible: 10, score: 10 }),
      column({ key: 'quizLong', componentId: 1, possible: 100, score: 50 }),
    ],
    { courseId: 'DUMMY.1000' },
  ),
  truth: { state: 'computed', pct: 75 },
  derivation: () => ((100 * ((10 / 10 + 50 / 100) / 2)) / 100) * 100,
  derivationText:
    'The syllabus averages the quizzes, so 1.00 and 0.50 average to 0.75 = 75 %. Pooling the points would read 60/110 = 54.5 %.',
};
