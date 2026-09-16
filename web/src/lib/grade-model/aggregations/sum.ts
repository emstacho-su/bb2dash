/**
 * `sum`: earned `cap·Σs / Σp_exp`, graded capacity `cap·Σp_graded / Σp_exp`.
 * `Σp_exp` is `points` under the points method; under weighted_pct it is Σ
 * `possible` over the known counted items (`capacityFromKnownItems`). With
 * `r`, ungraded known items and the missing capacity (`points` − known) are
 * at `r`.
 *
 * Decision: with no known item and no fixed point total there is nothing to
 * divide by, so the whole capacity is one slot earning `cap·r`.
 */

import { sum } from '../math';
import { anyHypothetical } from './shared';
import type { Aggregate, LeafContext, LeafOutcome } from './types';

function emptyOutcome(context: LeafContext, r: number | null): LeafOutcome {
  const slotCount = Math.max(1, context.component.countExpected ?? 0);
  return {
    earned: r === null ? 0 : context.cap * r,
    gradedCap: 0,
    remainingCap: context.cap,
    slotCount,
    gradedCount: 0,
    remainingCount: slotCount,
    capacityFromKnownItems: true,
    usesHypothetical: false,
    unitCap: { perSlot: context.cap / slotCount, perPoint: null },
  };
}

/** Slots standing in for capacity no known item covers (30 attendance days, none posted yet). */
function missingSlots(context: LeafContext, missingCap: number): number {
  if (missingCap <= 0) return 0;
  return Math.max(1, (context.component.countExpected ?? 0) - context.items.length);
}

export const sumAggregate: Aggregate = (context, r) => {
  const knownPossible = sum(context.items.map((item) => item.possible));
  const fixedTotal = context.method === 'points' && context.cap > 0;
  const expected = fixedTotal ? context.cap : knownPossible;
  if (expected <= 0) return emptyOutcome(context, r);

  const graded = context.items.filter((item) => item.score !== null);
  const ungraded = context.items.filter((item) => item.score === null);
  const scored = sum(graded.map((item) => item.score ?? 0));
  const gradedPossible = sum(graded.map((item) => item.possible));
  const missingCap = Math.max(0, expected - knownPossible);
  const openPossible = sum(ungraded.map((item) => item.possible)) + missingCap;
  const extraSlots = missingSlots(context, missingCap);
  const earnedPoints = r === null ? scored : scored + r * openPossible;
  const slotCount = context.items.length + extraSlots;

  return {
    earned: (context.cap * earnedPoints) / expected,
    gradedCap: (context.cap * gradedPossible) / expected,
    remainingCap: (context.cap * openPossible) / expected,
    slotCount,
    gradedCount: graded.length,
    remainingCount: ungraded.length + extraSlots,
    capacityFromKnownItems: !fixedTotal,
    usesHypothetical: anyHypothetical(context.items),
    unitCap: { perSlot: context.cap / Math.max(1, slotCount), perPoint: context.cap / expected },
  };
};
