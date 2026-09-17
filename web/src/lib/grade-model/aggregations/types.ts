/**
 * The shape every leaf aggregation shares. A leaf is a component with no
 * children; a parent sums its children (see `../evaluate.ts`).
 */

import type { CountedItem } from '../items';
import type { ComputableMethod } from '../tree';
import type { ComponentInput } from '../types';

export interface LeafContext {
  readonly method: ComputableMethod;
  readonly component: ComponentInput;
  /** Capacity in the scheme's units (`weightPct` or `points`). */
  readonly cap: number;
  /** The component's slots: counted items, placeholders dropped, extra-credit items priced apart. */
  readonly items: readonly CountedItem[];
}

/** What one extra-credit item on top of this component is worth, per unit of fraction. */
export interface UnitCap {
  /** Capacity per slot (the averaging aggregations). */
  readonly perSlot: number;
  /** Capacity per point of `possible` (`sum`); null when the aggregation prices by slot. */
  readonly perPoint: number | null;
}

export interface LeafOutcome {
  readonly earned: number;
  readonly gradedCap: number;
  /** Capacity of slots that are neither graded nor given a what-if value. */
  readonly remainingCap: number;
  readonly slotCount: number;
  readonly gradedCount: number;
  readonly remainingCount: number;
  readonly capacityFromKnownItems: boolean;
  readonly usesHypothetical: boolean;
  readonly unitCap: UnitCap;
}

/** `r` is the fraction applied to ungraded slots; `null` means graded so far. */
export type Aggregate = (context: LeafContext, r: number | null) => LeafOutcome;
