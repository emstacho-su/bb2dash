/**
 * F16 — IST.466's scheme shape. DUMMY DATA (invented scores on the real shape).
 *
 * A 1020-point course whose letter scale is stated in points, and whose two
 * major-case columns are linked to their syllabus part only `tentative` —
 * V-1 has not signed the link off.
 *
 * HAND DERIVATION
 *   The link's confidence is our bookkeeping, not a fact about the course. The
 *   grade so far is over the work that has been graded:
 *   Major Cases (300 pts, the two cases count equally): one graded,
 *     135 ÷ 150 = 0.90, earned 300 × 0.90                          = 270
 *   AI Team Assignment: 88 ÷ 100 = 0.88, earned                    = 88
 *   Ethics presentation: ungraded — out of "so far".
 *   Reading responses (500 pts): 45/50 = 0.90 and 40/50 = 0.80,
 *     mean 0.85, earned 500 × 0.85                                 = 425
 *   Earned = 270 + 88 + 425                                        = 783
 *   Graded = 300 + 100 + 500                                       = 900
 *   Grade so far = 783 ÷ 900                                       = 0.87
 *                                                                  = 87 %
 *
 * Dropping the tentative part instead reads 513/600 = 85.5 % and quietly loses
 * a graded 135/150 from the headline.
 */

import { column, input, part, pointsScale } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F16',
  title: 'IST.466 shape — a graded part whose syllabus link is unsure',
  probes: 'what an unconfirmed column → part link should do to the headline',
  input: input(
    [
      part({ id: 1, name: 'Major Cases', points: 300, aggregation: 'average', countExpected: 2 }),
      part({ id: 2, name: 'AI Team Assignment', points: 100, aggregation: 'single' }),
      part({ id: 3, name: 'Ethics Presentation', points: 120, aggregation: 'single' }),
      part({ id: 4, name: 'Reading Responses', points: 500, aggregation: 'average', countExpected: 10 }),
    ],
    [
      column({
        key: 'majorCase1',
        componentId: 1,
        possible: 150,
        score: 135,
        linkConfidence: 'tentative',
      }),
      column({
        key: 'majorCase2',
        componentId: 1,
        possible: 150,
        score: null,
        linkConfidence: 'tentative',
      }),
      column({ key: 'aiTeam', componentId: 2, possible: 100, score: 88 }),
      column({ key: 'ethics', componentId: 3, possible: 120, score: null }),
      column({ key: 'rr1', componentId: 4, possible: 50, score: 45 }),
      column({ key: 'rr2', componentId: 4, possible: 50, score: 40 }),
    ],
    {
      courseId: 'DUMMY.466',
      method: 'points',
      totalPoints: 1020,
      gradedOutOf: 1020,
      letterScale: pointsScale(1020),
    },
  ),
  truth: { state: 'computed', pct: 87 },
  derivation: () =>
    ((300 * (135 / 150) + 100 * (88 / 100) + 500 * ((45 / 50 + 40 / 50) / 2)) / (300 + 100 + 500)) * 100,
  derivationText:
    'Major cases 0.90 of 300 = 270, AI team 0.88 of 100 = 88, reading responses 0.85 of 500 = 425, ethics ungraded. 783/900 = 87 %.',
};
