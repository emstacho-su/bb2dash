/**
 * Helpers shared by the slot-based aggregations (`single`, `average`,
 * `normalized`, `average_drop_lowest`, `rank_weighted`).
 */

import type { CountedItem } from '../items';
import { fillSlots, mean } from '../math';
import type { LeafContext, LeafOutcome } from './types';

/** Fractions `score / possible` of the graded items, in input order. */
export function gradedFractions(items: readonly CountedItem[]): readonly number[] {
  return items.flatMap((item) => (item.score === null ? [] : [item.score / item.possible]));
}

export function anyHypothetical(items: readonly CountedItem[]): boolean {
  return items.some((item) => item.hypothetical);
}

export interface SlotRules {
  /** Level 0..1 from the graded fractions alone; `allGraded` when no slot is left. */
  readonly gradedSoFar: (graded: readonly number[], allGraded: boolean) => number;
  /** Level 0..1 from every slot, ungraded ones filled with `r`. */
  readonly withR: (values: readonly number[]) => number;
}

export const MEAN_RULES: SlotRules = {
  gradedSoFar: (graded) => mean(graded),
  withR: (values) => mean(values),
};

function levelOf(graded: readonly number[], slotCount: number, r: number | null, rules: SlotRules): number {
  if (r !== null) return rules.withR(fillSlots(graded, slotCount, r));
  if (graded.length === 0) return 0;
  return rules.gradedSoFar(graded, graded.length === slotCount);
}

/**
 * A slot-based leaf over `max(slots, known items)` slots. Decision: with no
 * slot and no known item the whole capacity is one slot earning `cap·r`, as
 * `single` does, so best case and the solver still see that capacity.
 */
export function slotAggregate(
  context: LeafContext,
  slots: number,
  r: number | null,
  rules: SlotRules,
): LeafOutcome {
  const graded = gradedFractions(context.items);
  const slotCount = Math.max(slots, context.items.length, 1);
  const remainingCount = slotCount - graded.length;
  return {
    earned: context.cap * levelOf(graded, slotCount, r, rules),
    gradedCap: graded.length > 0 ? context.cap : 0,
    remainingCap: (context.cap * remainingCount) / slotCount,
    slotCount,
    gradedCount: graded.length,
    remainingCount,
    capacityFromKnownItems: false,
    usesHypothetical: anyHypothetical(context.items),
    unitCap: { perSlot: context.cap / slotCount, perPoint: null },
  };
}
