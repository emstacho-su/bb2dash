/**
 * The component tree: parents and children, muting (answer 3), extra credit,
 * and capacity in the scheme's units.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Muting" and
 * "Capacity".
 */

import type { CountedItem } from './items';
import { sum } from './math';
import type { ComponentInput, Method } from './types';

export type ComputableMethod = Extract<Method, 'weighted_pct' | 'points'>;

export interface ComponentNode {
  readonly component: ComponentInput;
  readonly children: readonly ComponentNode[];
  /** Counted items linked directly to this component, placeholders dropped. */
  readonly items: readonly CountedItem[];
  /**
   * An own counted item's link is unsure, or an ancestor is muted. Since R2-1
   * only leaves carry items, so only leaves mute through their own items; the
   * inheritance is kept so a muted parent can never leave a child counted.
   */
  readonly muted: boolean;
  /** Own flag or an ancestor's. */
  readonly extraCredit: boolean;
  /** Capacity before muting: `weightPct` / `points`, or the children's sum for a parent. */
  readonly nominalCap: number;
}

interface Inherited {
  readonly muted: boolean;
  readonly extraCredit: boolean;
}

interface BuildContext {
  readonly method: ComputableMethod;
  readonly components: readonly ComponentInput[];
  readonly itemsByComponent: ReadonlyMap<number, readonly CountedItem[]>;
}

/**
 * A leaf's own capacity. Decision: under the points method a `normalized`
 * component with no `points` falls back to `normalizeTo` ("normalized to 5 pts").
 */
function ownCap(method: ComputableMethod, component: ComponentInput): number {
  if (method === 'weighted_pct') return component.weightPct ?? 0;
  const fallback = component.aggregation === 'normalized' ? component.normalizeTo : null;
  return component.points ?? fallback ?? 0;
}

/** A child counts toward its parent's capacity unless it is extra credit under a regular parent. */
export function isExtraWithin(child: ComponentNode, parent: ComponentNode): boolean {
  return child.extraCredit && !parent.extraCredit;
}

function buildNode(
  component: ComponentInput,
  inherited: Inherited,
  context: BuildContext,
  visited: ReadonlySet<number>,
): ComponentNode {
  const path = new Set([...visited, component.id]);
  const items = context.itemsByComponent.get(component.id) ?? [];
  const muted = inherited.muted || items.some((item) => !item.confirmed);
  const extraCredit = inherited.extraCredit || component.isExtraCredit;
  const children = context.components
    .filter((candidate) => candidate.parentId === component.id && !path.has(candidate.id))
    .map((child) => buildNode(child, { muted, extraCredit }, context, path));
  const nominalCap =
    children.length === 0
      ? ownCap(context.method, component)
      : sum(children.filter((child) => !(child.extraCredit && !extraCredit)).map((child) => child.nominalCap));
  return { component, children, items, muted, extraCredit, nominalCap };
}

function isRoot(component: ComponentInput, ids: ReadonlySet<number>): boolean {
  return component.parentId === null || component.parentId === component.id || !ids.has(component.parentId);
}

function collectIds(nodes: readonly ComponentNode[]): readonly number[] {
  return nodes.flatMap((node) => [node.component.id, ...collectIds(node.children)]);
}

/**
 * Top-level nodes in input order. Components caught in a parent cycle (never
 * reachable from a root) are promoted to roots so none silently vanish.
 */
export function buildForest(
  method: ComputableMethod,
  components: readonly ComponentInput[],
  itemsByComponent: ReadonlyMap<number, readonly CountedItem[]>,
): readonly ComponentNode[] {
  const context: BuildContext = { method, components, itemsByComponent };
  const ids = new Set(components.map((component) => component.id));
  const topLevel = { muted: false, extraCredit: false };
  const build = (component: ComponentInput) => buildNode(component, topLevel, context, new Set());
  return promoteOrphans(components.filter((component) => isRoot(component, ids)).map(build), components, build);
}

function promoteOrphans(
  roots: readonly ComponentNode[],
  components: readonly ComponentInput[],
  build: (component: ComponentInput) => ComponentNode,
): readonly ComponentNode[] {
  const reached = new Set(collectIds(roots));
  const orphan = components.find((component) => !reached.has(component.id));
  return orphan === undefined ? roots : promoteOrphans([...roots, build(orphan)], components, build);
}

/** Every node, parents before their children. */
export function flattenForest(roots: readonly ComponentNode[]): readonly ComponentNode[] {
  return roots.flatMap((node) => [node, ...flattenForest(node.children)]);
}

/** Capacity removed by muting: a muted node's whole nominal capacity, else its muted children's. */
export function mutedCap(node: ComponentNode): number {
  if (node.muted) return node.nominalCap;
  return sum(node.children.filter((child) => !isExtraWithin(child, node)).map(mutedCap));
}
