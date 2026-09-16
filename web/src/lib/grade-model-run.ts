/**
 * bb2dash — calling the grade-model engine from a screen (Phase 10b).
 *
 * The engine is pure and should not throw on real data, but this app has no
 * error boundary (see `QueryState.tsx`): an exception inside a render would
 * blank the whole Grades screen, Blackboard's own numbers included. So each
 * call is caught here and turned into a message the "Our model" container
 * shows in place of a standing — the rest of the page keeps working.
 */

import { DEFAULT_TARGET_LETTER, projectCourse, solveTarget } from './grade-model';
import type { ModelInput, ModelResult, TargetResult } from './grade-model/types';
import type { GradeModelItemRow, GradeModelTotalRow, GradeScenarioRow, GradeSchemeBundle } from './grade-model-input';
import { toModelInput } from './grade-model-input';

/** An exception's message, without leaking the shape of whatever was thrown. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error !== '' ? error : 'no reason given';
}

/** A model the screen can render, or the reason it could not be computed. */
export interface ModelRun {
  readonly input: ModelInput | null;
  readonly result: ModelResult | null;
  readonly error: string | null;
}

/** `projectCourse`, with any exception turned into `error`. */
export function runModel(input: ModelInput): ModelRun {
  try {
    return { input, result: projectCourse(input), error: null };
  } catch (error) {
    return { input, result: null, error: `Could not compute the model: ${messageOf(error)}` };
  }
}

/** `solveTarget`, with any exception turned into `error`. */
export function runSolver(
  input: ModelInput,
  letter: string,
): { readonly result: TargetResult | null; readonly error: string | null } {
  try {
    return { result: solveTarget(input, letter), error: null };
  } catch (error) {
    return { result: null, error: `Could not solve for ${letter}: ${messageOf(error)}` };
  }
}

/** Every row the model needs for one scheme course, already fetched. */
export interface CourseModelRows {
  readonly bundle: GradeSchemeBundle;
  readonly items: readonly GradeModelItemRow[];
  readonly total: GradeModelTotalRow | null;
  readonly scenario: GradeScenarioRow | null;
}

/** Rows → input → result, in one call. */
export function runCourseModel(rows: CourseModelRows): ModelRun {
  return runModel(toModelInput(rows.bundle.scheme, rows.bundle.components, rows.items, rows.scenario, rows.total));
}

/** The letter the solver starts on: the saved one, else A-, else the scale's best. */
export function pickTargetLetter(letters: readonly string[], saved: string | null): string {
  if (saved !== null && letters.includes(saved)) return saved;
  if (letters.includes(DEFAULT_TARGET_LETTER)) return DEFAULT_TARGET_LETTER;
  return letters[0] ?? DEFAULT_TARGET_LETTER;
}

/** What the "Our model" container renders for one course. */
export interface ModelStandingState {
  readonly result: ModelResult | null;
  /** The scheme's components, for the wording (R2-12). Empty until the reads land. */
  readonly components: ModelInput['components'];
  readonly error: string | null;
  readonly loading: boolean;
}

/** The bulk reads /grades makes, keyed by scheme course where they are per course. */
export interface BulkModelRows {
  readonly schemes: Readonly<Record<string, GradeSchemeBundle>> | undefined;
  readonly items: readonly GradeModelItemRow[] | undefined;
  readonly totals: readonly GradeModelTotalRow[] | undefined;
  readonly scenarios: readonly GradeScenarioRow[] | undefined;
}

/** Items by scheme course, in one pass. */
function groupItems(items: readonly GradeModelItemRow[]): ReadonlyMap<string, readonly GradeModelItemRow[]> {
  const groups = new Map<string, GradeModelItemRow[]>();
  for (const item of items) {
    const list = groups.get(item.scheme_course_id);
    if (list) list.push(item);
    else groups.set(item.scheme_course_id, [item]);
  }
  return groups;
}

/**
 * One standing state per scheme course for `/grades`. A read that failed is an
 * error on every course (it is the same read); one still in flight is loading.
 */
export function modelStandingStates(
  schemeIds: readonly string[],
  rows: BulkModelRows,
  loadError: string | null,
): Record<string, ModelStandingState> {
  const ready = rows.schemes && rows.items && rows.totals && rows.scenarios;
  // Indexed once, not searched once per course (R2-14).
  const itemsBy = groupItems(rows.items ?? []);
  const totalsBy = new Map((rows.totals ?? []).map((total) => [total.scheme_course_id, total]));
  const scenariosBy = new Map((rows.scenarios ?? []).map((scenario) => [scenario.course_id, scenario]));
  return Object.fromEntries(
    schemeIds.map((id): [string, ModelStandingState] => {
      if (loadError) return [id, { result: null, components: [], error: loadError, loading: false }];
      if (!ready) return [id, { result: null, components: [], error: null, loading: true }];
      const run = runCourseModel({
        bundle: rows.schemes?.[id] ?? { scheme: null, components: [] },
        items: itemsBy.get(id) ?? [],
        total: totalsBy.get(id) ?? null,
        scenario: scenariosBy.get(id) ?? null,
      });
      return [id, { result: run.result, components: run.input?.components ?? [], error: run.error, loading: false }];
    }),
  );
}
