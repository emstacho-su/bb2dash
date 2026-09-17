/**
 * The order of checks before anything is computed.
 *
 * Phase 12b (G-1) removed the `manual_unscored` gate: a hand-graded part nobody
 * has scored no longer hides the whole course. It is ungraded work like any
 * other — out of both sides of the figure, and named under it by the screen.
 * That one rule silenced three of Stack's six courses
 * (`docs/planning/80e_GRADE_METHOD_COMPARISON.md`, fixtures F12–F14).
 *
 * What is left are the three facts that genuinely mean there is no percentage:
 * no rules recorded, a qualitative scheme, or a rule we cannot read.
 * `nothing_graded` is decided after the projection (see `project.ts`).
 */

import type { ComputableMethod } from './tree';
import type { ModelInput, NotComputableReason, NotComputedResult, SchemeInput } from './types';

export interface OpenGate {
  readonly state: 'open';
  readonly scheme: SchemeInput;
  readonly method: ComputableMethod;
}

export function notComputed(reason: NotComputableReason): NotComputedResult {
  return { state: 'not_computable', reason };
}

export function checkComputable(input: ModelInput): NotComputedResult | OpenGate {
  const { scheme } = input;
  if (scheme === null) return notComputed('no_scheme');
  if (scheme.method === 'qualitative') return notComputed('qualitative_method');
  if (scheme.method === 'unknown') return notComputed('unknown_method');
  if (input.components.some((component) => component.aggregation === 'unknown')) {
    return notComputed('unknown_aggregation');
  }
  return { state: 'open', scheme, method: scheme.method };
}
