/**
 * F15 — IST.323's scheme shape. DUMMY DATA (invented scores on the real shape).
 *
 * A points course: 104 points available, graded out of 100. It carries the
 * awkward lot in one place — a normalised quiz category whose columns are worth
 * more raw points than the category, a final project built from sub-parts, a
 * hand-graded participation part that IS posted here, an extra-credit lab, and
 * one scored column no syllabus rule claims.
 *
 * HAND DERIVATION
 *   Labs (40 pts, points summed): 18 earned of the 20 points graded.
 *   Quizzes: the category is worth 20 points however the four quizzes are
 *     marked. Fractions 0.9, 0.7, 1.0, 0.8 → mean                  = 0.85
 *     earned 20 × 0.85 = 17, of 20 graded.
 *   Final project: proposal 9 of 10 graded; the log is ungraded, so 9 of 10.
 *   Participation: 5 of 5.
 *   Extra-credit lab: 4 earned, and no capacity — that is what extra credit is.
 *   The unlinked lab column counts toward nothing.
 *   Earned    = 18 + 17 + 9 + 5 + 4                                = 53
 *   Graded    = 20 + 20 + 10 + 5                                   = 55
 *   Grade so far = 53 ÷ 55                                         = 0.963636…
 *                                                                  = 96.3636… %
 *
 * The four 10-point quizzes total 40 raw points for a 20-point category, so any
 * method that pools raw points gives them double their share of the grade.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F15',
  title: 'IST.323 shape — normalised category, sub-parts, extra credit, an unlinked column',
  probes: 'raw column points against the points the syllabus gives a category',
  input: input(
    [
      part({ id: 1, name: 'Labs', points: 40, aggregation: 'sum' }),
      part({
        id: 2,
        name: 'Quizzes',
        points: 20,
        aggregation: 'normalized',
        normalizeTo: 20,
        countExpected: 4,
      }),
      part({ id: 3, name: 'Final project', points: null, aggregation: 'sum' }),
      part({ id: 4, name: 'Proposal', parentId: 3, points: 10, aggregation: 'single' }),
      part({ id: 5, name: 'Final log', parentId: 3, points: 25, aggregation: 'single' }),
      part({ id: 6, name: 'Class participation', points: 5, aggregation: 'manual' }),
      part({ id: 7, name: 'Extra credit lab', points: 4, aggregation: 'single', isExtraCredit: true }),
    ],
    [
      column({ key: 'lab1', componentId: 1, possible: 20, score: 18 }),
      column({ key: 'lab2', componentId: 1, possible: 20, score: null }),
      column({ key: 'quiz1', componentId: 2, possible: 10, score: 9 }),
      column({ key: 'quiz2', componentId: 2, possible: 10, score: 7 }),
      column({ key: 'quiz3', componentId: 2, possible: 10, score: 10 }),
      column({ key: 'quiz4', componentId: 2, possible: 10, score: 8 }),
      column({ key: 'proposal', componentId: 4, possible: 10, score: 9 }),
      column({ key: 'finalLog', componentId: 5, possible: 25, score: null }),
      column({ key: 'participation', componentId: 6, possible: 5, score: 5 }),
      column({ key: 'ecLab', componentId: 7, possible: 4, score: 4, isExtraCredit: true }),
      column({
        key: 'labUnlinked',
        componentId: null,
        linkSource: null,
        linkConfidence: null,
        possible: 20,
        score: 12,
      }),
    ],
    { courseId: 'DUMMY.323', method: 'points', totalPoints: 104, gradedOutOf: 100 },
  ),
  truth: { state: 'computed', pct: (53 / 55) * 100 },
  derivation: () =>
    ((40 * (18 / 40)
      + 20 * ((9 / 10 + 7 / 10 + 10 / 10 + 8 / 10) / 4)
      + 10 * (9 / 10)
      + 5 * (5 / 5)
      + 4 * (4 / 4))
      / (40 * (20 / 40) + 20 + 10 + 5))
    * 100,
  derivationText:
    'Labs 18 of 20 graded points, quizzes 17 of the category’s 20, proposal 9 of 10, participation 5 of 5, extra credit +4 on no capacity, unlinked column ignored: 53/55 = 96.36 %.',
};
