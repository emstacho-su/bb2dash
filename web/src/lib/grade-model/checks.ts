/**
 * The order of checks before anything is computed.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Order of checks":
 * no scheme → `no_scheme`; method `qualitative` / `unknown` → that reason; any
 * component `unknown` → `unknown_aggregation`; any unscored manual component →
 * `manual_unscored` (names listed). `nothing_graded` is decided after the
 * projection (see `project.ts`).
 */

import { countedItems, itemsByComponent } from './items';
import type { ComputableMethod } from './tree';
import type { ModelInput, NotComputableReason, NotComputedResult, Scenario, SchemeInput } from './types';

export const EMPTY_SCENARIO: Scenario = { itemScores: {} };

export interface OpenGate {
  readonly state: 'open';
  readonly scheme: SchemeInput;
  readonly method: ComputableMethod;
}

export function notComputed(reason: NotComputableReason, unscoredManual: readonly string[] = []): NotComputedResult {
  return { state: 'not_computable', reason, unscoredManual };
}

/**
 * Names of manual components with no real score on any counted item, in input
 * order. Runs before muting, so a muted unscored manual part still counts, and
 * ignores the scenario: a what-if value is not a hand-graded score (answer 1).
 */
export function unscoredManualNames(input: ModelInput): readonly string[] {
  const byComponent = itemsByComponent(input.components, countedItems(input.items, EMPTY_SCENARIO));
  return input.components
    .filter((component) => component.aggregation === 'manual')
    .filter((component) => !(byComponent.get(component.id) ?? []).some((item) => item.realScore !== null))
    .map((component) => component.name);
}

export function checkComputable(input: ModelInput): NotComputedResult | OpenGate {
  const { scheme } = input;
  if (scheme === null) return notComputed('no_scheme');
  if (scheme.method === 'qualitative') return notComputed('qualitative_method');
  if (scheme.method === 'unknown') return notComputed('unknown_method');
  if (input.components.some((component) => component.aggregation === 'unknown')) {
    return notComputed('unknown_aggregation');
  }
  const unscored = unscoredManualNames(input);
  if (unscored.length > 0) return notComputed('manual_unscored', unscored);
  return { state: 'open', scheme, method: scheme.method };
}
