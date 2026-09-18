/**
 * What the engine's surviving public API says about one course, in the shape
 * the arithmetic suites want.
 *
 * Phase 10b's `projectCourse` returned three projections, an agreement sentence
 * and a what-if flag in one object; Phase 12b (G-1) removed all three, so the
 * engine now exposes `evaluateCourse` (the gate) plus `standingFor` and
 * `componentResults`. This composes them once, here, rather than in every test.
 *
 * It is test scaffolding, not a second entry point: the app reads
 * `gradedSoFar()` in `@/lib/graded-so-far`, which runs the same arithmetic with
 * both 10b gates off.
 */

import { componentResults, evaluateCourse, standingFor } from '@/lib/grade-model';
import { unlinkedScoredKeys } from '@/lib/grade-model/items';
import type {
  ComponentResult,
  ModelInput,
  NotComputableReason,
  Standing,
} from '@/lib/grade-model';

export type RunResult =
  | { readonly state: 'not_computable'; readonly reason: NotComputableReason }
  | {
      readonly state: 'computed';
      readonly standing: Standing;
      readonly components: readonly ComponentResult[];
      readonly unlinkedScoredKeys: readonly string[];
    };

export function run(input: ModelInput): RunResult {
  const evaluation = evaluateCourse(input);
  if (evaluation.state === 'not_computable') {
    return { state: 'not_computable', reason: evaluation.reason };
  }
  return {
    state: 'computed',
    standing: standingFor(evaluation),
    components: componentResults(input.components, evaluation),
    unlinkedScoredKeys: unlinkedScoredKeys(input.components, input.items),
  };
}

/** The percentage, or a clear failure — most arithmetic assertions want only this. */
export function pctOf(input: ModelInput): number {
  const result = run(input);
  if (result.state !== 'computed') throw new Error(`not computable: ${result.reason}`);
  return result.standing.pct;
}
