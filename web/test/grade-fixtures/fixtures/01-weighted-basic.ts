/**
 * F01 — a plain weighted syllabus. DUMMY DATA.
 *
 * Homework 30 % (points summed inside the part), Midterm 30 %, Final 40 %.
 * Two homeworks and the midterm are graded; the final is not.
 *
 * HAND DERIVATION (independent of all three implementations)
 *   Homework is summed: (18 + 16) ÷ (20 + 20) = 34 / 40          = 0.85
 *   Midterm, one item:  84 ÷ 100                                  = 0.84
 *   Final: nothing graded, so it is out of "so far" entirely.
 *   Graded weight  = 30 + 30                                      = 60
 *   Earned weight  = 30 × 0.85 + 30 × 0.84 = 25.5 + 25.2          = 50.7
 *   Grade so far   = 50.7 ÷ 60                                    = 0.845
 *                                                                 = 84.5 %
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F01',
  title: 'Weighted syllabus, one part still ungraded',
  probes: 'the base case — do the three agree when nothing unusual happens?',
  input: input(
    [
      part({ id: 1, name: 'Homework', weightPct: 30, aggregation: 'sum' }),
      part({ id: 2, name: 'Midterm', weightPct: 30, aggregation: 'single' }),
      part({ id: 3, name: 'Final', weightPct: 40, aggregation: 'single' }),
    ],
    [
      column({ key: 'hw1', componentId: 1, possible: 20, score: 18 }),
      column({ key: 'hw2', componentId: 1, possible: 20, score: 16 }),
      column({ key: 'midterm', componentId: 2, possible: 100, score: 84 }),
      column({ key: 'final', componentId: 3, possible: 100, score: null }),
    ],
    { courseId: 'DUMMY.100' },
  ),
  truth: { state: 'computed', pct: 84.5 },
  derivation: () => ((30 * (34 / 40) + 30 * (84 / 100)) / (30 + 30)) * 100,
  derivationText:
    'Homework 34/40 = 0.85 at weight 30; Midterm 84/100 = 0.84 at weight 30; Final ungraded and out. (25.5 + 25.2) / 60 = 84.5 %.',
};
