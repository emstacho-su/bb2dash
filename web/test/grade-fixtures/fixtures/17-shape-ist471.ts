/**
 * F17 — IST.471's scheme shape. DUMMY DATA (invented scores on the real shape).
 *
 * The course is graded qualitatively: the portfolio is assessed, not scored.
 * Its Blackboard shell still carries checkpoint columns marked complete.
 *
 * HAND DERIVATION
 *   There is no percentage to state. Two complete checkpoints are not 100 % of
 *   a grade — they are two completed checkpoints. Printing a figure here
 *   fabricates a grade the course does not have.
 */

import { column, input, part } from '../builders';
import type { ComparisonFixture } from '../types';

export const fixture: ComparisonFixture = {
  id: 'F17',
  title: 'IST.471 shape — a qualitatively graded course',
  probes: 'a course with no numeric grade at all',
  input: input(
    [part({ id: 1, name: 'Portfolio', weightPct: null, aggregation: 'manual' })],
    [
      column({ key: 'checkpoint1', componentId: 1, possible: 10, score: 10 }),
      column({ key: 'checkpoint2', componentId: 1, possible: 10, score: 10 }),
    ],
    { courseId: 'DUMMY.471', method: 'qualitative' },
  ),
  truth: { state: 'not_computed', why: 'the course is graded qualitatively — there is no percentage' },
  derivation: () => null,
  derivationText: 'A qualitative scheme states no number, so no method may state one either.',
};
