/**
 * `average`: graded so far `cap·mean(f_graded)`, graded capacity `cap` once
 * anything is graded; with `r`, slots = max(`countExpected`, known items) and
 * the mean runs over every slot.
 */

import { MEAN_RULES, slotAggregate } from './shared';
import type { Aggregate } from './types';

export const averageAggregate: Aggregate = (context, r) =>
  slotAggregate(context, context.component.countExpected ?? 0, r, MEAN_RULES);
