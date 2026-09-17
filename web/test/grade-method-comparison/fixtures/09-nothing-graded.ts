/**
 * F09 — a course where nothing that counts has been graded. DUMMY DATA,
 * shaped like IST.466 in mid-September: columns exist, none carries a score.
 *
 * HAND DERIVATION
 *   Countable graded items: none.
 *   There is no grade so far. Not zero — none. A method that prints a figure
 *   here has invented one, which is the single rule the app may not break.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F09',
  title: 'Nothing graded yet',
  probes: 'the honest empty state — no number may be printed',
  input: input(
    [
      part({ id: 1, name: 'Cases', weightPct: 60, aggregation: 'average', countExpected: 3 }),
      part({ id: 2, name: 'Final', weightPct: 40, aggregation: 'single' }),
    ],
    [
      column({ key: 'case1', componentId: 1, possible: 150, score: null }),
      column({ key: 'case2', componentId: 1, possible: 150, score: null }),
      column({ key: 'final', componentId: 2, possible: 100, score: null }),
    ],
    { courseId: 'DUMMY.900' },
  ),
  truth: { state: 'not_computed', why: 'nothing that counts has been graded' },
  derivation: () => null,
  derivationText: 'No countable item carries a score, so there is no grade so far to state.',
};
