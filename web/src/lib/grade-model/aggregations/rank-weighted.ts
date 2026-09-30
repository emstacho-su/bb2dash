/**
 * `rank_weighted` (ECN.304 exams, weights [30, 25, 20]). Graded so far
 * `cap·mean(f_graded)`; with `r`, slots = `rankWeights.length`, fractions
 * sorted descending, `cap·Σ wᵢ·f₍ᵢ₎ / Σw`.
 *
 * Decisions: once every slot is graded the ranks are known, so graded so far
 * applies the weights too (the Contract's reason for the plain mean — "ranks
 * are unknowable while exams are ungraded" — no longer holds). Weights are used
 * in the order given, highest rank first. Slots beyond the weights weigh 0.
 * Missing, empty or negative weights fall back to a plain `average`.
 */

import { descending, mean, sum } from '../math';
import { MEAN_RULES, slotAggregate } from './shared';
import type { Aggregate } from './types';

export function usableWeights(weights: readonly number[] | null): readonly number[] | null {
  if (weights === null || weights.length === 0) return null;
  const valid = weights.every((weight) => Number.isFinite(weight) && weight >= 0);
  return valid && sum(weights) > 0 ? weights : null;
}

/**
 * The weight each slot carries, highest rank first: the stored weights, then 0
 * for every slot beyond them. The rule line (R-36) states exactly this list.
 */
export function slotWeights(weights: readonly number[], slotCount: number): readonly number[] {
  const padding = Math.max(0, slotCount - weights.length);
  return [...weights, ...Array.from({ length: padding }, () => 0)];
}

export function rankWeightedLevel(values: readonly number[], weights: readonly number[]): number {
  const ranked = descending(values);
  const perSlot = slotWeights(weights, ranked.length);
  return sum(perSlot.map((weight, index) => weight * (ranked[index] ?? 0))) / sum(weights);
}

export const rankWeightedAggregate: Aggregate = (context, r) => {
  const weights = usableWeights(context.component.rankWeights);
  if (weights === null) {
    return slotAggregate(context, context.component.countExpected ?? 0, r, MEAN_RULES);
  }
  const weighted = (values: readonly number[]) => rankWeightedLevel(values, weights);
  return slotAggregate(context, weights.length, r, {
    gradedSoFar: (graded, allGraded) => (allGraded ? weighted(graded) : mean(graded)),
    withR: weighted,
  });
};
