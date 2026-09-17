/**
 * F12 — ECN.304's scheme shape. DUMMY DATA (its real gradebook holds one
 * score; every figure here is invented to exercise the shape).
 *
 * Weighted: exams 60 % rank-weighted, quizzes 30 % drop-lowest, participation
 * 10 % hand-graded and not posted until the end of term. That last part is why
 * prod shows no model for this course today.
 *
 * HAND DERIVATION
 *   Participation is hand-graded and unscored. There is no honest way to guess
 *   it, so it is out of "so far" — exactly as an ungraded exam would be.
 *   Exams: one of three graded, so no ranking is possible yet; the standing is
 *   the fraction that exists, 80 ÷ 100                             = 0.80
 *     earned 60 × 0.80                                             = 48
 *   Quizzes: fractions 1.0, 0.8, 0.6; the lowest of what is graded drops;
 *     (1.0 + 0.8) ÷ 2                                              = 0.90
 *     earned 30 × 0.90                                             = 27
 *   Grade so far = (48 + 27) ÷ (60 + 30) = 75 / 90                 = 0.83333…
 *                                                                  = 83.3333… %
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F12',
  title: 'ECN.304 shape — a hand-graded part nobody has scored',
  probes: 'a syllabus part that will not carry a number until December',
  input: input(
    [
      part({
        id: 1,
        name: 'Exams',
        weightPct: 60,
        aggregation: 'rank_weighted',
        rankWeights: [30, 20, 10],
        countExpected: 3,
      }),
      part({
        id: 2,
        name: 'Quizzes',
        weightPct: 30,
        aggregation: 'average_drop_lowest',
        dropLowest: 1,
        countExpected: 4,
      }),
      part({ id: 3, name: 'Participation', weightPct: 10, aggregation: 'manual' }),
    ],
    [
      column({ key: 'exam1', componentId: 1, possible: 100, score: 80 }),
      column({ key: 'exam2', componentId: 1, possible: 100, score: null }),
      column({ key: 'exam3', componentId: 1, possible: 100, score: null }),
      column({ key: 'quiz1', componentId: 2, possible: 10, score: 10 }),
      column({ key: 'quiz2', componentId: 2, possible: 10, score: 8 }),
      column({ key: 'quiz3', componentId: 2, possible: 10, score: 6 }),
      column({ key: 'quiz4', componentId: 2, possible: 10, score: null }),
    ],
    { courseId: 'DUMMY.ECN' },
  ),
  truth: { state: 'computed', pct: (75 / 90) * 100 },
  derivation: () => ((60 * (80 / 100) + 30 * ((1.0 + 0.8) / 2)) / (60 + 30)) * 100,
  derivationText:
    'Exams 0.80 of 60 = 48; quizzes drop the 0.6 and average 0.90 of 30 = 27; participation is hand-graded and unscored, so it is out. 75/90 = 83.33 %.',
};
