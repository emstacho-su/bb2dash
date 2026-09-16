/**
 * The one item preparation every engine entry point shares (`projectCourse`,
 * `solveTarget`, `itemStates`): counted items with their effective scores,
 * items per leaf component with surplus placeholders dropped, and the component
 * tree with muting and capacity.
 */

import { countedItems, itemsByComponent, type CountedItem } from './items';
import { buildForest, type ComponentNode, type ComputableMethod } from './tree';
import type { ModelInput, Scenario } from './types';

export interface PreparedItems {
  /** Every counted item in input order, linked or not, before the surplus drop. */
  readonly counted: readonly CountedItem[];
  /** Counted items per component id after the surplus drop; empty for a component with children. */
  readonly byComponent: ReadonlyMap<number, readonly CountedItem[]>;
  readonly roots: readonly ComponentNode[];
}

/** `scenario` is passed apart from `input` so a caller can probe a what-if value without rebuilding the input. */
export function prepareItems(input: ModelInput, scenario: Scenario, method: ComputableMethod): PreparedItems {
  const counted = countedItems(input.items, scenario, input.components);
  const byComponent = itemsByComponent(input.components, counted);
  return { counted, byComponent, roots: buildForest(method, input.components, byComponent) };
}
