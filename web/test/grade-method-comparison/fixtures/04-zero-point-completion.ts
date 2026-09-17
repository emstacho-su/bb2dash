/**
 * F04 — zero-point completion columns. DUMMY DATA, shaped like IST.352's
 * knowledge checks: columns with `possible = 0` that Blackboard scores 0, 1 or
 * 2 as a completion tick.
 *
 * Stack's answer 2: those columns are out of every ratio and show as ticks.
 *
 * HAND DERIVATION
 *   Knowledge checks have no points, so the part has nothing countable and is
 *   out of "so far" — it is attendance-style bookkeeping, not a grade.
 *   Projects: one graded, 45 ÷ 50                                  = 0.90
 *   Grade so far = 70 × 0.90 ÷ 70                                  = 0.90
 *                                                                  = 90 %
 *
 * A ratio that forgot answer 2 would read (45 + 2 + 1 + 0) ÷ 50 = 96 % —
 * three completion ticks silently added to a grade.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F04',
  title: 'Zero-point completion columns',
  probes: "Stack's answer 2 — a tick must never enter a ratio",
  input: input(
    [
      part({ id: 1, name: 'Projects', weightPct: 70, aggregation: 'average', countExpected: 2 }),
      part({
        id: 2,
        name: 'Knowledge checks',
        weightPct: 30,
        aggregation: 'average',
        countExpected: 5,
      }),
    ],
    [
      column({ key: 'proj1', componentId: 1, possible: 50, score: 45 }),
      column({ key: 'proj2', componentId: 1, possible: 50, score: null }),
      column({ key: 'kc1', componentId: 2, possible: 0, score: 2 }),
      column({ key: 'kc2', componentId: 2, possible: 0, score: 1 }),
      column({ key: 'kc3', componentId: 2, possible: 0, score: 0 }),
    ],
    { courseId: 'DUMMY.400' },
  ),
  truth: { state: 'computed', pct: 90 },
  derivation: () => ((70 * (45 / 50)) / 70) * 100,
  derivationText:
    'The three zero-point ticks leave their part with nothing countable, so only Projects counts: 45/50 = 0.90, and 70 × 0.90 / 70 = 90 %.',
};
