/**
 * Evaluates the component tree at one `r` (null = graded so far): leaves run
 * their aggregation, parents add up their children in capacity units, muted
 * nodes are left out, and extra credit adds to earned but never to capacity.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Capacity",
 * "Muting" and the per-aggregation table.
 */

import { aggregateFor, type LeafOutcome, type UnitCap } from './aggregations';
import type { CountedItem } from './items';
import { sum } from './math';
import { isExtraWithin, type ComponentNode, type ComputableMethod } from './tree';
import type { ComponentResult } from './types';

export interface NodeOutcome {
  readonly node: ComponentNode;
  readonly earned: number;
  /** Extra-credit part of `earned` (a whole extra-credit node, or extra-credit items on a regular one). */
  readonly extraEarned: number;
  readonly gradedCap: number;
  /** Capacity counted in the model; a muted node reports its nominal capacity but adds nothing. */
  readonly cap: number;
  readonly remainingCap: number;
  readonly remainingCount: number;
  readonly gradedCount: number;
  readonly capacityFromKnownItems: boolean;
  readonly usesHypothetical: boolean;
  readonly state: ComponentResult['state'];
  readonly children: readonly NodeOutcome[];
}

function stateOf(gradedCount: number, remainingCount: number): ComponentResult['state'] {
  if (gradedCount === 0) return 'ungraded';
  return remainingCount === 0 ? 'graded' : 'partly_graded';
}

function mutedOutcome(node: ComponentNode, children: readonly NodeOutcome[]): NodeOutcome {
  return {
    node,
    earned: 0,
    extraEarned: 0,
    gradedCap: 0,
    cap: node.nominalCap,
    remainingCap: 0,
    remainingCount: 0,
    gradedCount: 0,
    capacityFromKnownItems: false,
    usesHypothetical: false,
    state: 'muted',
    children,
  };
}

/** An extra-credit item on a regular component: its fraction (or `r`) priced by the component's unit. */
function extraItemEarned(item: CountedItem, unit: UnitCap, r: number | null, manual: boolean): number {
  const score = manual ? item.realScore : item.score;
  const open = manual ? 0 : (r ?? 0);
  const level = score !== null ? score / item.possible : open;
  return unit.perPoint !== null ? level * item.possible * unit.perPoint : level * unit.perSlot;
}

function leafOutcome(node: ComponentNode, method: ComputableMethod, r: number | null): NodeOutcome {
  const slots = node.extraCredit ? node.items : node.items.filter((item) => !item.extraCredit);
  const extras = node.extraCredit ? [] : node.items.filter((item) => item.extraCredit);
  const context = { method, component: node.component, cap: node.nominalCap, items: slots };
  const outcome: LeafOutcome = aggregateFor(node.component.aggregation)(context, r);
  const manual = node.component.aggregation === 'manual';
  const extrasEarned = sum(extras.map((item) => extraItemEarned(item, outcome.unitCap, r, manual)));
  const earned = outcome.earned + extrasEarned;
  return {
    node,
    earned,
    extraEarned: node.extraCredit ? earned : extrasEarned,
    gradedCap: outcome.gradedCap,
    cap: node.nominalCap,
    remainingCap: outcome.remainingCap,
    remainingCount: outcome.remainingCount,
    gradedCount: outcome.gradedCount,
    capacityFromKnownItems: outcome.capacityFromKnownItems,
    usesHypothetical: outcome.usesHypothetical || (!manual && extras.some((item) => item.hypothetical)),
    state: stateOf(outcome.gradedCount, outcome.remainingCount),
    children: [],
  };
}

function parentState(capacityChildren: readonly NodeOutcome[]): ComponentResult['state'] {
  if (capacityChildren.length === 0 || capacityChildren.every((child) => child.state === 'ungraded')) {
    return 'ungraded';
  }
  return capacityChildren.every((child) => child.state === 'graded') ? 'graded' : 'partly_graded';
}

/**
 * A parent computes from its children only. Decision: counted items linked
 * straight to a parent that has children still mute it, but add no arithmetic.
 */
function parentOutcome(node: ComponentNode, children: readonly NodeOutcome[]): NodeOutcome {
  const active = children.filter((child) => !child.node.muted);
  const capacity = active.filter((child) => !isExtraWithin(child.node, node));
  const earned = sum(active.map((child) => child.earned));
  return {
    node,
    earned,
    extraEarned: node.extraCredit ? earned : sum(active.map((child) => child.extraEarned)),
    gradedCap: sum(capacity.map((child) => child.gradedCap)),
    cap: sum(capacity.map((child) => child.cap)),
    remainingCap: sum(capacity.map((child) => child.remainingCap)),
    remainingCount: sum(capacity.map((child) => child.remainingCount)),
    gradedCount: sum(capacity.map((child) => child.gradedCount)),
    capacityFromKnownItems: active.some((child) => child.capacityFromKnownItems),
    usesHypothetical: active.some((child) => child.usesHypothetical),
    state: parentState(capacity),
    children,
  };
}

export function evaluateNode(node: ComponentNode, method: ComputableMethod, r: number | null): NodeOutcome {
  const children = node.children.map((child) => evaluateNode(child, method, r));
  if (node.muted) return mutedOutcome(node, children);
  return children.length === 0 ? leafOutcome(node, method, r) : parentOutcome(node, children);
}

/** Every outcome, parents before their children. */
export function flattenOutcomes(outcomes: readonly NodeOutcome[]): readonly NodeOutcome[] {
  return outcomes.flatMap((outcome) => [outcome, ...flattenOutcomes(outcome.children)]);
}
