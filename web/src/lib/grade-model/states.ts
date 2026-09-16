/**
 * `itemStates()` (Round 2, R2-3): the engine's own view of each item — which
 * ungraded items take a what-if value, which components are muted, which
 * placeholders were dropped as surplus — so screens never re-implement the
 * rules. Built from `prepareItems`, the preparation `projectCourse` uses.
 */

import { checkComputable } from './checks';
import { leafComponentIds, PERCENT_POSSIBLE, realScoreOf, takesPercentValue } from './items';
import { prepareItems, type PreparedItems } from './prepare';
import { flattenForest, type ComputableMethod } from './tree';
import type { Aggregation, ItemInput, ItemStates, ModelInput, WhatIfTarget } from './types';

/** Muting and the surplus drop never depend on the method; it only sets capacities. */
const METHOD_FOR_STATES: ComputableMethod = 'weighted_pct';
/** Any in-range value does: whether a placeholder counts or is dropped never depends on its score. */
const PROBE_VALUE = 0;

type Candidate = Omit<WhatIfTarget, 'key'>;

/** The unit an item's what-if value would have, before muting and the surplus drop are checked. */
function candidateFor(item: ItemInput, aggregation: Aggregation | undefined): Candidate | null {
  if (realScoreOf(item) !== null || item.exempt || item.excluded) return null;
  if (aggregation === undefined || aggregation === 'manual' || aggregation === 'unknown') return null;
  if (item.possible !== null && Number.isFinite(item.possible) && item.possible > 0) {
    return { unit: 'points', max: item.possible };
  }
  return takesPercentValue(item, aggregation) ? { unit: 'percent', max: PERCENT_POSSIBLE } : null;
}

/** The item survives the surplus drop and its component (with its ancestors) is not muted. */
function isUsed(item: ItemInput, componentId: number, prepared: PreparedItems): boolean {
  const kept = (prepared.byComponent.get(componentId) ?? []).some((counted) => counted.key === item.key);
  const node = flattenForest(prepared.roots).find((candidate) => candidate.component.id === componentId);
  return kept && node !== undefined && !node.muted;
}

/**
 * A percent placeholder only counts once it has a value, and counting it can
 * change the surplus drop, so one without a value is checked with a probe value.
 */
function preparedFor(item: ItemInput, candidate: Candidate, input: ModelInput, method: ComputableMethod, prepared: PreparedItems): PreparedItems {
  const alreadyCounted = prepared.counted.some((counted) => counted.key === item.key);
  if (candidate.unit === 'points' || alreadyCounted) return prepared;
  const scenario = { itemScores: { ...input.scenario.itemScores, [item.key]: PROBE_VALUE } };
  return prepareItems(input, scenario, method);
}

function whatIfTargets(input: ModelInput, method: ComputableMethod, prepared: PreparedItems): readonly WhatIfTarget[] {
  const leaves = leafComponentIds(input.components);
  const aggregationOf = new Map(input.components.map((component) => [component.id, component.aggregation] as const));
  return input.items.flatMap((item) => {
    const componentId = item.componentId;
    if (componentId === null || !leaves.has(componentId)) return [];
    const candidate = candidateFor(item, aggregationOf.get(componentId));
    if (candidate === null) return [];
    return isUsed(item, componentId, preparedFor(item, candidate, input, method, prepared)) ? [{ key: item.key, ...candidate }] : [];
  });
}

function mutedComponentIds(input: ModelInput, prepared: PreparedItems): readonly number[] {
  const muted = new Set(flattenForest(prepared.roots).filter((node) => node.muted).map((node) => node.component.id));
  return [...new Set(input.components.map((component) => component.id))].filter((id) => muted.has(id));
}

function droppedPlaceholderKeys(input: ModelInput, prepared: PreparedItems): readonly string[] {
  const leaves = leafComponentIds(input.components);
  const kept = new Set([...prepared.byComponent.values()].flat());
  return prepared.counted
    .filter((item) => item.placeholder && item.componentId !== null && leaves.has(item.componentId))
    .filter((item) => !kept.has(item))
    .map((item) => item.key);
}

/**
 * Decision: `mutedComponentIds` and `droppedPlaceholderKeys` are reported for
 * every input (a not-computed course still has unsure links to name);
 * `whatIfTargets` is empty unless the order of checks lets the course compute
 * (`nothing_graded` still gets targets, since a value is what computes it).
 * All three read the input's current scenario.
 */
export function itemStatesOf(input: ModelInput): ItemStates {
  const gate = checkComputable(input);
  const method = gate.state === 'open' ? gate.method : METHOD_FOR_STATES;
  const prepared = prepareItems(input, input.scenario, method);
  return {
    whatIfTargets: gate.state === 'open' ? whatIfTargets(input, method, prepared) : [],
    mutedComponentIds: mutedComponentIds(input, prepared),
    droppedPlaceholderKeys: droppedPlaceholderKeys(input, prepared),
  };
}
