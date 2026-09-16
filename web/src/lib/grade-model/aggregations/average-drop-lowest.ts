/**
 * `average_drop_lowest`: as `average` after dropping the `dropLowest` lowest
 * fractions, only while there are more values than `dropLowest`. With `r`,
 * every slot is filled first, so a missed quiz is the one dropped.
 */

import { ascending, mean } from '../math';
import { slotAggregate } from './shared';
import type { Aggregate } from './types';

export function dropCount(dropLowest: number): number {
  return Number.isFinite(dropLowest) ? Math.max(0, Math.floor(dropLowest)) : 0;
}

export function meanAfterDrop(values: readonly number[], dropLowest: number): number {
  const drop = dropCount(dropLowest);
  return values.length > drop ? mean(ascending(values).slice(drop)) : mean(values);
}

export const averageDropLowestAggregate: Aggregate = (context, r) => {
  const keepTop = (values: readonly number[]) => meanAfterDrop(values, context.component.dropLowest);
  return slotAggregate(context, context.component.countExpected ?? 0, r, {
    gradedSoFar: keepTop,
    withR: keepTop,
  });
};
