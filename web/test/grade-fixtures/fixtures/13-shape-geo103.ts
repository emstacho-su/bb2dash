/**
 * F13 — GEO.103's scheme shape. DUMMY DATA (its real gradebook has no scored
 * item column; every figure here is invented to exercise the shape).
 *
 * One scheme across two Blackboard shells: the lecture carries exams and
 * reading quizzes, the recitation carries an attendance column that is an
 * absence count, not a score. Two hand-graded attendance parts, 20 % together,
 * carry no number until the end of term.
 *
 * HAND DERIVATION
 *   Exams: a column, no score — out of "so far".
 *   Both attendance parts: hand-graded and unscored — out of "so far". The
 *     recitation's attendance column has no points, so it is a tick, not a score.
 *   Reading quizzes: 4/5 = 0.80 and 5/5 = 1.00; each counts equally, so
 *     (0.80 + 1.00) ÷ 2                                            = 0.90
 *     earned 30 × 0.90                                             = 27
 *   Grade so far = 27 ÷ 30                                         = 0.90
 *                                                                  = 90 %
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F13',
  title: 'GEO.103 shape — two shells, two unscored attendance parts',
  probes: 'a zero-point attendance column under a hand-graded part',
  input: input(
    [
      part({ id: 1, name: 'Exams', weightPct: 50, aggregation: 'average', countExpected: 2 }),
      part({ id: 2, name: 'Lecture Attendance', weightPct: 10, aggregation: 'manual' }),
      part({
        id: 3,
        name: 'Discussion Section Attendance & Participation',
        weightPct: 10,
        aggregation: 'manual',
      }),
      part({ id: 4, name: 'Reading Quizzes', weightPct: 30, aggregation: 'average', countExpected: 10 }),
    ],
    [
      column({ key: 'lecExam1', componentId: 1, possible: 100, score: null }),
      column({ key: 'recAttendance', componentId: 2, possible: 0, score: 3, kind: 'attendance' }),
      column({ key: 'rq1', componentId: 4, possible: 5, score: 4 }),
      column({ key: 'rq2', componentId: 4, possible: 5, score: 5 }),
    ],
    { courseId: 'DUMMY.GEO' },
  ),
  truth: { state: 'computed', pct: 90 },
  derivation: () => ((30 * ((4 / 5 + 5 / 5) / 2)) / 30) * 100,
  derivationText:
    'Only the reading quizzes are graded: 0.80 and 1.00 average to 0.90 of weight 30. 27/30 = 90 %. The attendance parts and the ungraded exam are out.',
};
