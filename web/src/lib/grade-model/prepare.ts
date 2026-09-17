/**
 * The one item preparation the engine shares: counted items with their scores,
 * items per leaf component, and the component tree.
 *
 * Phase 12b (G-1): no scenario parameter — a what-if value no longer exists —
 * and no placeholder drop, because placeholders no longer count.
 */

import { countedItems, itemsByComponent, type CountedItem } from './items';
import { buildForest, type ComponentNode, type ComputableMethod } from './tree';
import type { ModelInput } from './types';

export interface PreparedItems {
  /** Every counted item in input order, linked or not. */
  readonly counted: readonly CountedItem[];
  /** Counted items per component id; empty for a component with children. */
  readonly byComponent: ReadonlyMap<number, readonly CountedItem[]>;
  readonly roots: readonly ComponentNode[];
}

export function prepareItems(input: ModelInput, method: ComputableMethod): PreparedItems {
  const counted = countedItems(input.items);
  const byComponent = itemsByComponent(input.components, counted);
  return { counted, byComponent, roots: buildForest(method, input.components, byComponent) };
}
