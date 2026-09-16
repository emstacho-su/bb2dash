/**
 * `manual` (hand-graded parts): `cap·mean(f)` over its graded counted items —
 * a column linked to it by override or assignment. No slots, no remaining
 * work. With none graded the course is `manual_unscored` before this runs.
 *
 * Decision: Blackboard's real scores only. A what-if value on a hand-graded
 * column is not a score (answer 1: no assumed score for a manual component;
 * "an assumed score for a hand-graded part" is out of scope), so it is ignored.
 */

import { mean } from '../math';
import type { Aggregate } from './types';

export const manualAggregate: Aggregate = (context) => {
  const real = context.items.flatMap((item) =>
    item.realScore === null ? [] : [item.realScore / item.possible],
  );
  const graded = real.length > 0;
  return {
    earned: graded ? context.cap * mean(real) : 0,
    gradedCap: graded ? context.cap : 0,
    remainingCap: 0,
    slotCount: real.length,
    gradedCount: real.length,
    remainingCount: 0,
    capacityFromKnownItems: false,
    usesHypothetical: false,
    unitCap: { perSlot: context.cap / Math.max(1, real.length), perPoint: null },
  };
};
