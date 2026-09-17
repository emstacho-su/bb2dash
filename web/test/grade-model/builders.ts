/**
 * Builders for grade-model tests: Contract-shaped inputs with sensible
 * defaults, so each table row states only what it is about.
 */

import type { LeafContext } from '@/lib/grade-model/aggregations';
import type { CountedItem } from '@/lib/grade-model/items';
import type {
  ComponentInput,
  ItemInput,
  LetterStep,
  ModelInput,
  SchemeInput,
} from '@/lib/grade-model';

export const PCT_SCALE: readonly LetterStep[] = [
  { min: 93, letter: 'A' },
  { min: 90, letter: 'A-' },
  { min: 87, letter: 'B+' },
  { min: 83, letter: 'B' },
  { min: 80, letter: 'B-' },
  { min: 77, letter: 'C+' },
  { min: 73, letter: 'C' },
  { min: 70, letter: 'C-' },
  { min: 60, letter: 'D' },
  { min: 0, letter: 'F' },
];

export function scheme(overrides: Partial<SchemeInput> = {}): SchemeInput {
  return {
    courseId: 'TEST.100',
    method: 'weighted_pct',
    totalPoints: null,
    gradedOutOf: null,
    letterScale: PCT_SCALE,
    ...overrides,
  };
}

export function component(overrides: Partial<ComponentInput> & Pick<ComponentInput, 'id'>): ComponentInput {
  return {
    code: `c${overrides.id}`,
    name: `Component ${overrides.id}`,
    parentId: null,
    weightPct: null,
    points: null,
    countExpected: null,
    aggregation: 'single',
    dropLowest: 0,
    rankWeights: null,
    normalizeTo: null,
    isExtraCredit: false,
    ...overrides,
  };
}

export function item(overrides: Partial<ItemInput> & Pick<ItemInput, 'key'>): ItemInput {
  return {
    componentId: null,
    linkSource: 'assignment',
    linkConfidence: 'confirmed',
    excluded: false,
    name: overrides.key,
    possible: 10,
    score: null,
    exempt: false,
    kind: 'item',
    isExtraCredit: false,
    dueAt: null,
    seenAt: null,
    ...overrides,
  };
}

export function modelInput(overrides: Partial<ModelInput> = {}): ModelInput {
  return { scheme: scheme(), components: [], items: [], ...overrides };
}

let counter = 0;

/** A counted item for leaf tests: `[possible, score]`. */
export function counted(possible: number, score: number | null, extras: Partial<CountedItem> = {}): CountedItem {
  counter += 1;
  return {
    key: `k${counter}`,
    componentId: 1,
    possible,
    realScore: score,
    score,
    extraCredit: false,
    confirmed: true,
    dueAt: null,
    ...extras,
  };
}

export function leaf(
  overrides: Partial<ComponentInput>,
  items: readonly CountedItem[],
  cap: number,
  method: LeafContext['method'] = 'weighted_pct',
): LeafContext {
  return { method, component: component({ id: 1, ...overrides }), cap, items };
}

/** Recursively freezes a value so a mutating engine throws. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}
