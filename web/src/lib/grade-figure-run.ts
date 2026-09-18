/**
 * bb2dash — calling `gradedSoFar()` from a screen (Phase 12b, G-1 / G-2).
 *
 * Replaces Phase 10b's `grade-model-run.ts`, which carried the what-if
 * scenario, the solver and the "Our model" container's three projections.
 * What is left is what the screens still need: rows in, one figure per scheme
 * course out.
 *
 * The one thing kept from 10b's version is why it exists at all. The engine is
 * pure and should not throw on real data, but this app has no error boundary
 * (see `QueryState.tsx`): an exception inside a render would blank the whole
 * Grades screen, Blackboard's own numbers included. So each call is caught here
 * and turned into a message shown in place of the figure, and the rest of the
 * page keeps working.
 */

import { gradedSoFar, type GradedSoFarResult } from './graded-so-far';
import { toModelInput } from './grade-model-input';
import type { GradeModelItemRow, GradeSchemeBundle } from './grade-model-input';

/** An exception's message, without leaking the shape of whatever was thrown. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error !== '' ? error : 'no reason given';
}

/** What one course's header renders. `figure` is null while loading or on error. */
export interface CourseFigureState {
  readonly figure: GradedSoFarResult | null;
  readonly error: string | null;
}

/** A course whose reads have not all arrived. */
export const FIGURE_LOADING: CourseFigureState = { figure: null, error: null };

/** Every row one course's figure needs, already fetched. */
export interface CourseFigureRows {
  readonly bundle: GradeSchemeBundle;
  readonly items: readonly GradeModelItemRow[];
}

/** Rows → input → figure, with any exception turned into `error`. */
export function runCourseFigure(rows: CourseFigureRows): CourseFigureState {
  try {
    const input = toModelInput(rows.bundle.scheme, rows.bundle.components, rows.items);
    return { figure: gradedSoFar(input), error: null };
  } catch (error) {
    return { figure: null, error: `Could not work out the grade: ${messageOf(error)}` };
  }
}

/** The bulk reads `/grades` makes for every course at once. */
export interface BulkFigureRows {
  readonly schemes: Readonly<Record<string, GradeSchemeBundle>> | undefined;
  readonly items: readonly GradeModelItemRow[] | undefined;
}

/**
 * Items by scheme course, in one pass.
 *
 * Each row is pushed onto its course's array once; the arrays are built locally
 * and only then handed out as a `ReadonlyMap`. Copying the accumulated list per
 * row instead (`[...list, item]`) is quadratic in the number of items — the
 * same trap review item R2-14 caught in Phase 10b — and this now runs on Home
 * as well as `/grades`, over every course's columns at once.
 */
function groupItems(items: readonly GradeModelItemRow[]): ReadonlyMap<string, readonly GradeModelItemRow[]> {
  const groups = new Map<string, GradeModelItemRow[]>();
  for (const item of items) {
    const list = groups.get(item.scheme_course_id);
    if (list === undefined) groups.set(item.scheme_course_id, [item]);
    else list.push(item);
  }
  return groups;
}

/**
 * One figure state per scheme course. A read that failed is an error on every
 * course — it is the same read — and one still in flight is loading everywhere.
 */
export function courseFigureStates(
  schemeIds: readonly string[],
  rows: BulkFigureRows,
  loadError: string | null,
): Record<string, CourseFigureState> {
  const ready = rows.schemes !== undefined && rows.items !== undefined;
  const itemsBy = groupItems(rows.items ?? []);
  return Object.fromEntries(
    schemeIds.map((id): [string, CourseFigureState] => {
      if (loadError) return [id, { figure: null, error: loadError }];
      if (!ready) return [id, FIGURE_LOADING];
      return [
        id,
        runCourseFigure({
          bundle: rows.schemes?.[id] ?? { scheme: null, components: [] },
          items: itemsBy.get(id) ?? [],
        }),
      ];
    }),
  );
}
