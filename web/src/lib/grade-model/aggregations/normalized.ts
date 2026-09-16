/**
 * `normalized` — Blackboard's proportional category (IST.323 quizzes). Graded
 * so far `cap·mean(f_graded)`, graded capacity `cap` once anything is graded;
 * with `r`, slots = `countExpected` (or the known items, if more) and the mean
 * runs over every slot.
 *
 * Contract contradiction, decided: Semantics gives `f = score / (normalizeTo ??
 * possible)`, but with IST.323's `normalizeTo = 5` and 10-point quizzes a full
 * quiz would be f = 2 and the category 10, against this row's own worked
 * example (quizzes 5.0) and L4 (Blackboard's 5.0 and 14.8). The fraction is
 * `score / possible`; `normalizeTo` is the scale the category is normalized
 * to, which the capacity already carries (`points`, or `normalizeTo` when
 * `points` is null — see `../tree.ts`).
 */

import { MEAN_RULES, slotAggregate } from './shared';
import type { Aggregate } from './types';

export const normalizedAggregate: Aggregate = (context, r) =>
  slotAggregate(context, context.component.countExpected ?? 0, r, MEAN_RULES);
