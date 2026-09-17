/**
 * Item bookkeeping for the grade model: which rows enter arithmetic, what score
 * each one carries, and the unlinked-column list.
 *
 * Phase 12b (G-1) removed the what-if scenario and the placeholder rows, so an
 * item's score is Blackboard's score or nothing, and a row with no Blackboard
 * column (`kind === 'placeholder'`) never enters the arithmetic at all.
 *
 * Contract: `docs/planning/68_PHASE10B_grade_model.md` §Engine, Semantics
 * "Item fraction", as amended by `docs/planning/80c_PHASE12B_page_pass.md`.
 */

import type { ComponentInput, ItemInput } from './types';

/** An item that enters arithmetic: a real column, possible > 0, not exempt, not excluded. */
export interface CountedItem {
  readonly key: string;
  readonly componentId: number | null;
  readonly possible: number;
  /** Blackboard's score; null while ungraded. */
  readonly realScore: number | null;
  /** The score the model uses. Since G-1 there is no other source: it is `realScore`. */
  readonly score: number | null;
  readonly extraCredit: boolean;
  /** An override, or an assignment link whose confidence is `confirmed`. */
  readonly confirmed: boolean;
  readonly dueAt: string | null;
}

/** Possible null or not above 0: never in arithmetic. A completion tick, not a fraction. */
export function isBookkeeping(item: ItemInput): boolean {
  return item.possible === null || !Number.isFinite(item.possible) || item.possible <= 0;
}

/**
 * A row with no Blackboard column. Phase 10b let one carry a what-if value;
 * with what-if gone there is nothing to put in it, so it never counts.
 */
export function isPlaceholder(item: ItemInput): boolean {
  return item.kind === 'placeholder';
}

export function isCounted(item: ItemInput): boolean {
  return !isBookkeeping(item) && !isPlaceholder(item) && !item.exempt && !item.excluded;
}

export function realScoreOf(item: ItemInput): number | null {
  return item.score !== null && Number.isFinite(item.score) ? item.score : null;
}

function isConfirmedLink(item: ItemInput): boolean {
  return item.linkSource === 'override' || item.linkConfidence === 'confirmed';
}

function toCounted(item: ItemInput, possible: number): CountedItem {
  const realScore = realScoreOf(item);
  return {
    key: item.key,
    componentId: item.componentId,
    possible,
    realScore,
    score: realScore,
    extraCredit: item.isExtraCredit,
    confirmed: isConfirmedLink(item),
    dueAt: item.dueAt,
  };
}

/**
 * Components that have no children. Round 2 (R2-1): an item linked straight to
 * a component with children is treated as unlinked — never counted, and listed
 * as unlinked when it is scored.
 */
export function leafComponentIds(components: readonly ComponentInput[]): ReadonlySet<number> {
  const parents = new Set(
    components.filter((c) => c.parentId !== null && c.parentId !== c.id).map((c) => c.parentId as number),
  );
  return new Set(components.map((c) => c.id).filter((id) => !parents.has(id)));
}

/** Every counted item, in input order, with its score. */
export function countedItems(items: readonly ItemInput[]): readonly CountedItem[] {
  return items.flatMap((item) =>
    isCounted(item) && item.possible !== null ? [toCounted(item, item.possible)] : [],
  );
}

/**
 * Counted items per component id. Unlinked items, and items linked straight to
 * a component with children (R2-1), are left out: such a component gets an
 * empty list.
 */
export function itemsByComponent(
  components: readonly ComponentInput[],
  items: readonly CountedItem[],
): ReadonlyMap<number, readonly CountedItem[]> {
  const leaves = leafComponentIds(components);
  return new Map(
    components.map((component) => [
      component.id,
      leaves.has(component.id) ? items.filter((item) => item.componentId === component.id) : [],
    ] as const),
  );
}

/** Keys of scored, counted items tied to no known leaf component (R2-1), in input order. */
export function unlinkedScoredKeys(
  components: readonly ComponentInput[],
  items: readonly ItemInput[],
): readonly string[] {
  const ids = leafComponentIds(components);
  return items
    .filter((item) => isCounted(item) && realScoreOf(item) !== null)
    .filter((item) => item.componentId === null || !ids.has(item.componentId))
    .map((item) => item.key);
}
