/**
 * F14 — IST.352's scheme shape. DUMMY DATA (invented scores on the real shape).
 *
 * Its readings and knowledge checks are Blackboard columns with `possible = 0`
 * scored 0, 1 or 2, and the 15 % contribution part is hand-graded against those
 * same tick columns. The graded points base is therefore tiny — this is the
 * course whose points-only figure ran above 100 % on prod.
 *
 * HAND DERIVATION
 *   Knowledge checks and readings have no points: ticks, out of every ratio.
 *   Attendance & Class Contribution is hand-graded with no numeric score — out.
 *   Projects: one graded, 14 ÷ 15                                  = 0.933333…
 *     earned 55 × 0.933333…                                        = 51.333…
 *   Grade so far = 51.333… ÷ 55                                    = 0.933333…
 *                                                                  = 93.3333… %
 *
 * Ignoring Stack's answer 2 pools the ticks into the numerator and none into
 * the denominator: (14 + 2 + 1 + 2 + 2) ÷ 15 = 21/15 = 140 % — a grade that
 * cannot exist.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F14',
  title: 'IST.352 shape — a tiny graded base under tick columns',
  probes: 'a course whose points base is small enough for a stray tick to distort it',
  input: input(
    [
      part({ id: 1, name: 'Projects', weightPct: 55, aggregation: 'average', countExpected: 3 }),
      part({
        id: 2,
        name: 'Attendance & Class Contribution',
        weightPct: 15,
        aggregation: 'manual',
      }),
      part({ id: 3, name: 'Readings', weightPct: 30, aggregation: 'average', countExpected: 6 }),
    ],
    [
      column({ key: 'proj1', componentId: 1, possible: 15, score: 14 }),
      column({ key: 'kc1', componentId: 2, possible: 0, score: 2 }),
      column({ key: 'kc2', componentId: 2, possible: 0, score: 1 }),
      column({ key: 'read1', componentId: 3, possible: 0, score: 2 }),
      column({ key: 'read2', componentId: 3, possible: 0, score: 2 }),
    ],
    { courseId: 'DUMMY.352' },
  ),
  truth: { state: 'computed', pct: (14 / 15) * 100 },
  derivation: () => ((55 * (14 / 15)) / 55) * 100,
  derivationText:
    'Every tick column is out, so only the project counts: 14/15 = 0.9333 of weight 55, over a graded weight of 55 = 93.33 %.',
};
