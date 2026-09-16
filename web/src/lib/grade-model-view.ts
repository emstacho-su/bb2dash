/**
 * bb2dash — what the grade-model screens may offer on each row (Phase 10b).
 *
 * Pure. These are the gates, not the arithmetic: which items take a what-if
 * value, which columns get the "Counts toward…" picker, and whether a typed
 * value is acceptable. The rules are the frozen Contract's
 * (`68_PHASE10B_grade_model.md` §Engine semantics and §Web), restated here only
 * so a screen can decide what to render before, or without, a computed result:
 * a course that is `nothing_graded` must still offer the what-if cell that will
 * make it compute.
 */

import type { Aggregation, ComponentInput, ItemInput, ModelInput } from './grade-model/types';
import type { GradeModelItemRow } from './grade-model-input';

/* ---------------------------------------------------------------------------
 * Counted and muted (frozen semantics)
 * ------------------------------------------------------------------------ */

/** An item that takes part in arithmetic: possible > 0, not exempt, not "Not graded". */
export function isCountedItem(item: Pick<ItemInput, 'possible' | 'exempt' | 'excluded'>): boolean {
  return item.possible !== null && item.possible > 0 && !item.exempt && !item.excluded;
}

/**
 * Components left out because a counted item's link is unsure (answer 3,
 * PM call 10). An override is confirmed, so a picker save un-mutes the part.
 */
export function mutedComponentIds(input: Pick<ModelInput, 'items'>): ReadonlySet<number> {
  const muted = new Set<number>();
  for (const item of input.items) {
    if (item.componentId === null || !isCountedItem(item)) continue;
    if (item.linkConfidence !== 'confirmed') muted.add(item.componentId);
  }
  return muted;
}

/** The names of the muted components, in the scheme's own order. */
export function mutedComponentNames(input: Pick<ModelInput, 'items' | 'components'>): string[] {
  const muted = mutedComponentIds(input);
  return input.components.filter((c) => muted.has(c.id)).map((c) => c.name);
}

/** Round 1b A1: the aggregations that read an item only as a fraction of its possible. */
export const FRACTION_AGGREGATIONS: readonly Aggregation[] = [
  'single',
  'average',
  'average_drop_lowest',
  'rank_weighted',
  'normalized',
];

/** The largest value a percentage what-if accepts. */
export const PERCENT_MAX = 100;

/** What a what-if cell needs to know about its item. */
export interface WhatIfTarget {
  readonly key: string;
  readonly name: string;
  /**
   * `points`: typed against the item's own possible (an extra-credit item's
   * included). `percent` (Round 1b A1): a placeholder with no possible, typed
   * as 0–100 and stored as that number; the engine reads `f = v / 100`.
   */
  readonly unit: 'points' | 'percent';
  /** The upper bound the typed value is checked against: possible, or 100. */
  readonly possible: number;
}

/**
 * Round 1b A1: a placeholder with no possible that may still take a value —
 * its link is confirmed and its component only ever reads fractions. A `sum`
 * placeholder with no points, or an unconfirmed series row, stays bookkeeping.
 */
export function isPercentPlaceholder(
  item: Pick<ItemInput, 'kind' | 'possible' | 'linkConfidence' | 'exempt' | 'excluded'>,
  component: Pick<ComponentInput, 'aggregation'>,
): boolean {
  return (
    item.kind === 'placeholder'
    && item.possible === null
    && item.linkConfidence === 'confirmed'
    && !item.exempt
    && !item.excluded
    && FRACTION_AGGREGATIONS.includes(component.aggregation)
  );
}

/** The cell an item gets, if any, given its (existing, live) component. */
function targetFor(item: ItemInput, component: ComponentInput): WhatIfTarget | null {
  if (isCountedItem(item)) {
    return { key: item.key, name: item.name, unit: 'points', possible: item.possible as number };
  }
  if (isPercentPlaceholder(item, component)) {
    return { key: item.key, name: item.name, unit: 'percent', possible: PERCENT_MAX };
  }
  return null;
}

/**
 * The items that may take a hypothetical score: ungraded, linked to a
 * component that exists, is not muted and is not hand-graded (answer 1: no
 * assumed score for a `manual` part) — and either counted (typed in points) or
 * a pointless confirmed placeholder of a fraction-only part (typed as a
 * percentage, Round 1b A1).
 */
export function whatIfTargets(input: Pick<ModelInput, 'items' | 'components'>): ReadonlyMap<string, WhatIfTarget> {
  const muted = mutedComponentIds(input);
  const byId = new Map<number, ComponentInput>(input.components.map((c) => [c.id, c]));
  const targets = new Map<string, WhatIfTarget>();
  for (const item of input.items) {
    if (item.score !== null || item.componentId === null) continue;
    const component = byId.get(item.componentId);
    if (!component || component.aggregation === 'manual' || muted.has(component.id)) continue;
    const target = targetFor(item, component);
    if (target) targets.set(item.key, target);
  }
  return targets;
}

/* ---------------------------------------------------------------------------
 * The "Counts toward…" picker
 * ------------------------------------------------------------------------ */

/** What the picker shows as selected on a column, and why it is offered. */
export interface LinkState {
  readonly shellCourseId: string;
  readonly columnId: string;
  readonly componentId: number | null;
  readonly excluded: boolean;
  /** The current link is tentative / inferred: preselected and marked "unsure". */
  readonly unsure: boolean;
  /** Stack already chose here; offered so the choice can be changed or cleared. */
  readonly override: boolean;
}

/** The column item key the table and the scenario share. */
export function columnItemKey(shellCourseId: string, columnId: string): string {
  return `col:${shellCourseId}:${columnId}`;
}

/**
 * The columns that get the picker (Round 1b A2): every gradebook column worth
 * points (`possible > 0`) that no rule is attached to — scored or not, so a
 * column can be linked before Blackboard grades it — or whose link is
 * tentative / inferred (PM call 9). A column Stack already overrode keeps its
 * picker whatever its possible, so a choice is never a one-way door. A zero-
 * point column (IST.352's knowledge checks) is bookkeeping and gets none; a
 * placeholder has no column and cannot be confirmed this way.
 */
export function linkStates(rows: readonly GradeModelItemRow[]): ReadonlyMap<string, LinkState> {
  const states = new Map<string, LinkState>();
  for (const row of rows) {
    if (row.column_kind === 'placeholder' || row.column_id === null) continue;
    const override = row.link_source === 'override';
    const worthPoints = row.possible !== null && Number(row.possible) > 0;
    const unsure = row.link_source === 'assignment'
      && (row.link_confidence === 'tentative' || row.link_confidence === 'inferred');
    const unlinked = row.link_source === null && row.component_id === null;
    if (!override && !(worthPoints && (unsure || unlinked))) continue;
    states.set(row.item_key, {
      shellCourseId: row.shell_course_id,
      columnId: row.column_id,
      componentId: row.excluded ? null : row.component_id,
      excluded: row.excluded,
      unsure,
      override,
    });
  }
  return states;
}

/** What a picker change asks for. */
export type LinkTarget =
  | { readonly kind: 'component'; readonly componentId: number }
  | { readonly kind: 'excluded' }
  | { readonly kind: 'clear' };

/** The picker's options: every component of the scheme, a parent before its parts. */
export function linkOptions(
  components: readonly Pick<ComponentInput, 'id' | 'name' | 'parentId'>[],
): { id: number; name: string }[] {
  const order = (c: Pick<ComponentInput, 'id' | 'parentId'>) => [c.parentId ?? c.id, c.parentId === null ? 0 : 1, c.id];
  return [...components]
    .sort((a, b) => {
      const [a1, a2, a3] = order(a);
      const [b1, b2, b3] = order(b);
      return a1 - b1 || a2 - b2 || a3 - b3;
    })
    .map((c) => ({ id: c.id, name: c.name }));
}

/* ---------------------------------------------------------------------------
 * What-if values: validation and immutable updates
 * ------------------------------------------------------------------------ */

export type WhatIfParse =
  | { readonly ok: true; readonly value: number | null }
  | { readonly ok: false; readonly error: string };

/**
 * A typed what-if value, checked at the boundary: empty clears the value;
 * otherwise a finite number with `0 ≤ v ≤ possible`. Anything else is an error
 * that is shown on the field and never saved.
 */
export function parseWhatIf(raw: string, possible: number): WhatIfParse {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  // Number('') and Number(' ') are 0 and Number('0x10') is 16: only plain decimals pass.
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(text)) {
    return { ok: false, error: `Enter a number from 0 to ${possible}.` };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > possible) {
    return { ok: false, error: `Enter a number from 0 to ${possible}.` };
  }
  return { ok: true, value };
}

/** A new scores object with one key set, or removed when `value` is null. */
export function withItemScore(
  scores: Readonly<Record<string, number>>,
  key: string,
  value: number | null,
): Record<string, number> {
  const next = Object.fromEntries(Object.entries(scores).filter(([k]) => k !== key));
  return value === null ? next : { ...next, [key]: value };
}

/* ---------------------------------------------------------------------------
 * Score history
 * ------------------------------------------------------------------------ */

/** `v_gradebook_history` rows grouped by column item key, oldest first. */
export function historyByColumn<T extends { shell_course_id: string; column_id: string; seen_at: string }>(
  rows: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = columnItemKey(row.shell_course_id, row.column_id);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return new Map(
    [...grouped.entries()].map(([key, list]) => [key, [...list].sort((a, b) => a.seen_at.localeCompare(b.seen_at))]),
  );
}
