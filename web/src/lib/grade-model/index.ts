/**
 * bb2dash — grade model engine entry point (Phase 10b, R-12).
 *
 * Pure and deterministic: no I/O, no clock, no mutation of its input. The
 * signatures are the frozen Contract (`docs/planning/68_PHASE10B_grade_model.md`
 * §Engine); the implementation lives in the modules beside this file:
 * `items.ts` (counted items, what-if values, placeholders), `prepare.ts` (the
 * shared item preparation), `states.ts` (`itemStates`), `tree.ts`
 * (children, muting, capacity), `aggregations/` (one module per rule),
 * `evaluate.ts` + `project.ts` (projections and standings), `checks.ts`
 * (order of checks), `letter.ts`, `agreement.ts`, `solve.ts`.
 */

import { agreementFor } from './agreement';
import { unlinkedScoredKeys } from './items';
import { letterForPct } from './letter';
import { componentResults, evaluateCourse, standingsOf, usesHypotheticals } from './project';
import { solve } from './solve';
import { itemStatesOf } from './states';
import type { ItemStates, ModelInput, ModelResult, SchemeInput, TargetResult } from './types';

export * from './types';

export const DEFAULT_TARGET_LETTER = 'A-';

export function projectCourse(input: ModelInput): ModelResult {
  const evaluation = evaluateCourse(input);
  if (evaluation.state === 'not_computable') return evaluation;
  return {
    state: 'computed',
    standings: standingsOf(evaluation),
    components: componentResults(input.components, evaluation),
    unlinkedScoredKeys: unlinkedScoredKeys(input.components, input.items),
    usesHypotheticals: usesHypotheticals(evaluation),
    agreement: agreementFor(input),
  };
}

export function solveTarget(input: ModelInput, letter: string): TargetResult {
  return solve(input, letter);
}

export function letterFor(pct: number, scheme: SchemeInput): string | null {
  return letterForPct(pct, scheme);
}

/** Round 2 (R2-3/R2-4): what-if targets, muted components, dropped placeholders and (R3-3) unsure items, from the engine's own preparation. */
export function itemStates(input: ModelInput): ItemStates {
  return itemStatesOf(input);
}
