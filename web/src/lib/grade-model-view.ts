/**
 * bb2dash — what the grade-model screens may offer on each row (Phase 10b).
 *
 * Pure. Which columns get the "Counts toward…" picker, and how the score
 * history groups by column.
 *
 * Phase 12b (G-1) took the what-if cells with the rest of that layer, so what
 * is left is the picker — which survives, because the figure still needs
 * columns linked to the syllabus — and the history grouping.
 */

import type { ComponentInput, ItemInput } from './grade-model/types';
import type { GradeModelItemRow } from './grade-model-input';

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

/**
 * The picker's options: the scheme's **leaf** components only (Round 2, R2-1w).
 * An item linked straight to a component that has children is treated as
 * unlinked by the engine, so offering the parent (IST.323's "Final Project")
 * would save a link that counts for nothing. A part is listed where its parent
 * would have been, so the three Final Project pieces stay together.
 */
export function linkOptions(
  components: readonly Pick<ComponentInput, 'id' | 'name' | 'parentId'>[],
): { id: number; name: string }[] {
  const parents = new Set(components.map((c) => c.parentId).filter((id): id is number => id !== null));
  const order = (c: Pick<ComponentInput, 'id' | 'parentId'>) => [c.parentId ?? c.id, c.parentId === null ? 0 : 1, c.id];
  return components
    .filter((c) => !parents.has(c.id))
    .sort((a, b) => {
      const [a1, a2, a3] = order(a);
      const [b1, b2, b3] = order(b);
      return a1 - b1 || a2 - b2 || a3 - b3;
    })
    .map((c) => ({ id: c.id, name: c.name }));
}

/* ---------------------------------------------------------------------------
 * Score history
 * ------------------------------------------------------------------------ */

/**
 * `v_gradebook_history` rows grouped by column item key, oldest first. One pass
 * (R2-14). The query already orders by `seen_at`, so a list is only sorted when
 * it arrives out of order — a linear check, not a sort of every list.
 */
export function historyByColumn<T extends { shell_course_id: string; column_id: string; seen_at: string }>(
  rows: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = columnItemKey(row.shell_course_id, row.column_id);
    const list = grouped.get(key);
    if (list) list.push(row);
    else grouped.set(key, [row]);
  }
  for (const [key, list] of grouped) {
    const ordered = list.every((row, i) => i === 0 || list[i - 1].seen_at <= row.seen_at);
    if (!ordered) grouped.set(key, [...list].sort((a, b) => a.seen_at.localeCompare(b.seen_at)));
  }
  return grouped;
}
