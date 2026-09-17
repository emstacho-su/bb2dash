/**
 * F11 — a rank-weighted exam part. DUMMY DATA, shaped like ECN.304's rule:
 * the best exam counts 30, the next 25, the last 20, out of 75.
 *
 * All three exams are graded, so the ranks are known.
 *
 * HAND DERIVATION
 *   Exam fractions: 70/100 = 0.70, 90/100 = 0.90, 80/100 = 0.80
 *   Sorted best first: 0.90, 0.80, 0.70
 *   Exam standing = (30 × 0.90 + 25 × 0.80 + 20 × 0.70) ÷ (30 + 25 + 20)
 *                 = (27 + 20 + 14) ÷ 75 = 61 / 75                  = 0.813333…
 *   Exams earned  = 75 × 0.813333…                                 = 61
 *   Homework: one of two graded, 45 ÷ 50                           = 0.90
 *   Homework earned = 25 × 0.90                                    = 22.5
 *   Grade so far  = (61 + 22.5) ÷ (75 + 25) = 83.5 / 100           = 0.835
 *                                                                  = 83.5 %
 *
 * Treating the three exams as one pool of points reads 240/300 = 0.80 and the
 * rank weights vanish.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F11',
  title: 'Rank-weighted exams',
  probes: 'a rule that weighs the same items differently by how well they went',
  input: input(
    [
      part({
        id: 1,
        name: 'Exams',
        weightPct: 75,
        aggregation: 'rank_weighted',
        rankWeights: [30, 25, 20],
        countExpected: 3,
      }),
      part({ id: 2, name: 'Homework', weightPct: 25, aggregation: 'average', countExpected: 2 }),
    ],
    [
      column({ key: 'exam1', componentId: 1, possible: 100, score: 70 }),
      column({ key: 'exam2', componentId: 1, possible: 100, score: 90 }),
      column({ key: 'exam3', componentId: 1, possible: 100, score: 80 }),
      column({ key: 'hw1', componentId: 2, possible: 50, score: 45 }),
      column({ key: 'hw2', componentId: 2, possible: 50, score: null }),
    ],
    { courseId: 'DUMMY.1100' },
  ),
  truth: { state: 'computed', pct: 83.5 },
  derivation: () =>
    ((75 * ((30 * 0.9 + 25 * 0.8 + 20 * 0.7) / (30 + 25 + 20)) + 25 * (45 / 50)) / (75 + 25)) * 100,
  derivationText:
    'Exams ranked 0.90/0.80/0.70 against weights 30/25/20 give 61/75 = 0.8133, so 61 of 75; Homework 0.90 of 25 gives 22.5. (61 + 22.5) / 100 = 83.5 %.',
};
