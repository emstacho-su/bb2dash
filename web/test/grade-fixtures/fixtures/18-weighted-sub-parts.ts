/**
 * F18 — weighted sub-parts under an unweighted heading. DUMMY DATA.
 *
 * "Final project (40 %)" written out as its pieces: the heading carries no
 * weight of its own, the proposal carries 10 % and the report 30 %. Exams carry
 * the other 60 %. The proposal is back; the report is not.
 *
 * HAND DERIVATION
 *   Proposal: 18 ÷ 20                                              = 0.90
 *     earned 10 × 0.90                                             = 9
 *   Final report: a column, no score — out of "so far".
 *   Exams: one of two graded, 75 ÷ 100                             = 0.75
 *     earned 60 × 0.75                                             = 45
 *   Graded weight = 10 + 60                                        = 70
 *   Grade so far  = (9 + 45) ÷ 70 = 54 / 70                        = 0.771428…
 *                                                                  = 77.1428… %
 *
 * This is the shape a review found `weightedSoFar` losing: rolling items up to
 * the top-level row put the proposal under a heading with no weight, so it
 * counted for 0 on both sides and the figure quietly became the exams alone
 * (75 %, 2.14 points out). The method now rolls up to the outermost row that
 * carries a weight, and this fixture is the guard.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F18',
  title: 'Weighted sub-parts under an unweighted heading',
  probes: 'a syllabus that puts its weights one level down',
  input: input(
    [
      part({ id: 1, name: 'Final project', weightPct: null, aggregation: 'sum' }),
      part({ id: 2, name: 'Proposal', parentId: 1, weightPct: 10, aggregation: 'single' }),
      part({ id: 3, name: 'Final report', parentId: 1, weightPct: 30, aggregation: 'single' }),
      part({ id: 4, name: 'Exams', weightPct: 60, aggregation: 'average', countExpected: 2 }),
    ],
    [
      column({ key: 'proposal', componentId: 2, possible: 20, score: 18 }),
      column({ key: 'finalReport', componentId: 3, possible: 100, score: null }),
      column({ key: 'exam1', componentId: 4, possible: 100, score: 75 }),
      column({ key: 'exam2', componentId: 4, possible: 100, score: null }),
    ],
    { courseId: 'DUMMY.1200' },
  ),
  truth: { state: 'computed', pct: (54 / 70) * 100 },
  derivation: () => ((10 * (18 / 20) + 60 * (75 / 100)) / (10 + 60)) * 100,
  derivationText:
    'Proposal 0.90 of weight 10 = 9; exams 0.75 of weight 60 = 45; the report is ungraded and the heading carries no weight of its own. 54/70 = 77.14 %.',
};
