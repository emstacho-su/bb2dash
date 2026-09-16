/**
 * Item bookkeeping for the grade model: which rows enter arithmetic, what
 * score each one carries (Blackboard's, else a what-if value), the
 * placeholder-drop rule, and the unlinked-column list.
 *
 * Contract: `docs/planning/68_PHASE10B_grade_model.md` §Engine, Semantics
 * "Item fraction", "Placeholders" and PM calls 7 and 10.
 */

import type { ComponentInput, ItemInput, Scenario } from './types';

/** An item that enters arithmetic: possible > 0, not exempt, not excluded. */
export interface CountedItem {
  readonly key: string;
  readonly componentId: number | null;
  readonly possible: number;
  /** Blackboard's score; null while ungraded. */
  readonly realScore: number | null;
  /** The score the model uses: Blackboard's, else a valid what-if value, else null. */
  readonly score: number | null;
  /** `score` came from the scenario. */
  readonly hypothetical: boolean;
  readonly extraCredit: boolean;
  /** An override, or an assignment link whose confidence is `confirmed`. */
  readonly confirmed: boolean;
  readonly placeholder: boolean;
  readonly dueAt: string | null;
}

/** Possible null or not above 0: never in arithmetic and never muting. */
export function isBookkeeping(item: ItemInput): boolean {
  return item.possible === null || !Number.isFinite(item.possible) || item.possible <= 0;
}

export function isCounted(item: ItemInput): boolean {
  return !isBookkeeping(item) && !item.exempt && !item.excluded;
}

function realScoreOf(item: ItemInput): number | null {
  return item.score !== null && Number.isFinite(item.score) ? item.score : null;
}

/**
 * The what-if value for an ungraded item, or null. A real score always wins.
 * Decision: a value outside the Contract's documented range (finite,
 * 0 ≤ v ≤ possible) is treated as absent, like a key that matches no item.
 */
function scenarioValueFor(item: ItemInput, possible: number, scenario: Scenario): number | null {
  if (realScoreOf(item) !== null) return null;
  if (!Object.prototype.hasOwnProperty.call(scenario.itemScores, item.key)) return null;
  const value = scenario.itemScores[item.key];
  const inRange = typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= possible;
  return inRange ? value : null;
}

function toCounted(item: ItemInput, possible: number, scenario: Scenario): CountedItem {
  const realScore = realScoreOf(item);
  const whatIf = scenarioValueFor(item, possible, scenario);
  return {
    key: item.key,
    componentId: item.componentId,
    possible,
    realScore,
    score: realScore ?? whatIf,
    hypothetical: whatIf !== null,
    extraCredit: item.isExtraCredit,
    confirmed: item.linkSource === 'override' || item.linkConfidence === 'confirmed',
    placeholder: item.kind === 'placeholder',
    dueAt: item.dueAt,
  };
}

/** Every counted item, in input order, with its effective score. */
export function countedItems(items: readonly ItemInput[], scenario: Scenario): readonly CountedItem[] {
  return items.flatMap((item) =>
    isCounted(item) && item.possible !== null ? [toCounted(item, item.possible, scenario)] : [],
  );
}

function dueRank(item: CountedItem): number {
  const parsed = item.dueAt === null ? Number.NaN : Date.parse(item.dueAt);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * Order in which placeholders are dropped: latest `dueAt` first.
 * Decision: an unknown due date counts as the latest; ties fall back to the
 * key, descending, so the result never depends on input order.
 */
function dropOrder(a: CountedItem, b: CountedItem): number {
  const ra = dueRank(a);
  const rb = dueRank(b);
  if (ra !== rb) return ra < rb ? 1 : -1;
  if (a.key === b.key) return 0;
  return a.key < b.key ? 1 : -1;
}

/**
 * When a component has more counted items than `countExpected`, drop
 * placeholders first, latest due first. Real columns are never dropped.
 */
export function withoutSurplusPlaceholders(
  items: readonly CountedItem[],
  countExpected: number | null,
): readonly CountedItem[] {
  if (countExpected === null || items.length <= countExpected) return items;
  const surplus = items.length - countExpected;
  const droppable = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.placeholder)
    .sort((a, b) => dropOrder(a.item, b.item))
    .slice(0, surplus);
  const dropped = new Set(droppable.map(({ index }) => index));
  return items.filter((_, index) => !dropped.has(index));
}

/** Counted items per component id, placeholders already dropped. Unlinked items are left out. */
export function itemsByComponent(
  components: readonly ComponentInput[],
  items: readonly CountedItem[],
): ReadonlyMap<number, readonly CountedItem[]> {
  return new Map(
    components.map((component) => {
      const linked = items.filter((item) => item.componentId === component.id);
      return [component.id, withoutSurplusPlaceholders(linked, component.countExpected)] as const;
    }),
  );
}

/** Keys of scored, counted, non-excluded items tied to no known component, in input order. */
export function unlinkedScoredKeys(
  components: readonly ComponentInput[],
  items: readonly ItemInput[],
): readonly string[] {
  const ids = new Set(components.map((component) => component.id));
  return items
    .filter((item) => isCounted(item) && realScoreOf(item) !== null)
    .filter((item) => item.componentId === null || !ids.has(item.componentId))
    .map((item) => item.key);
}
