/**
 * `single`: one slot. Graded so far `cap·f` when graded, else left out;
 * with `r`, `cap·r`.
 *
 * Decision: if more than one counted item is still linked after the
 * placeholder drop, they share the component as an average (with one item this
 * is exactly the Contract row).
 */

import { MEAN_RULES, slotAggregate } from './shared';
import type { Aggregate } from './types';

export const singleAggregate: Aggregate = (context, r) => slotAggregate(context, 1, r, MEAN_RULES);
