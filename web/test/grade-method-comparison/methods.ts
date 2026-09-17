/**
 * The three methods under comparison, behind one signature (Phase 12b, G-0).
 *
 * This is the ONLY file in the suite that imports the Phase 10b engine. If
 * Stack's pick retires it, `engineGradedSoFar` and its row in `METHODS` go and
 * nothing else in this directory has to change.
 *
 * Every method is handed the same `FixtureInput` and returns the same shape, so
 * the report compares like with like.
 */

import { projectCourse } from '@/lib/grade-model';
import { evaluateModel, standingsOf } from '@/lib/grade-model/project';
import type { ModelInput } from '@/lib/grade-model/types';
import { pointsRatio, weightedSoFar } from '@/lib/grade-so-far';
import type { FixtureInput } from './types';

export type MethodOutcome =
  | { readonly state: 'computed'; readonly pct: number }
  | { readonly state: 'not_computed'; readonly reason: string };

export interface ComparisonMethod {
  readonly id: string;
  readonly label: string;
  /** One line for the report's legend. */
  readonly note: string;
  readonly run: (input: FixtureInput) => MethodOutcome;
}

/**
 * The fixture shape into the engine's. The assignment type-checks
 * `FixtureInput` against the frozen Contract: if the two ever drift, this line
 * stops compiling rather than the suite quietly comparing something else.
 */
function toModelInput(input: FixtureInput): ModelInput {
  const model: ModelInput = {
    scheme: input.scheme,
    components: input.components,
    items: input.items,
    scenario: { itemScores: {} },
    blackboardTotal: null,
  };
  return model;
}

export function engineGradedSoFar(input: FixtureInput): MethodOutcome {
  const result = projectCourse(toModelInput(input));
  if (result.state === 'not_computable') return { state: 'not_computed', reason: result.reason };
  return { state: 'computed', pct: result.standings.graded_so_far.pct };
}

/**
 * The same engine with its two silencing gates turned off — NOT a fourth
 * candidate, a variant of the third. The table shows those two gates are the
 * only places the engine's arithmetic parts company with a hand-derived grade,
 * so measuring the engine without them says what fixing it would be worth.
 *
 * Nothing in `grade-model/` is edited to do this. The unsure-link gate is
 * side-stepped by confirming the links in the *input*; the unscored-hand-graded
 * gate by calling `evaluateModel`, the engine's own ungated entry point (the
 * Phase 10b L4 test uses it the same way).
 */
export function engineGatesOff(input: FixtureInput): MethodOutcome {
  const confirmed: FixtureInput = {
    ...input,
    items: input.items.map((item) =>
      item.componentId === null ? item : { ...item, linkConfidence: 'confirmed' },
    ),
  };
  const model = toModelInput(confirmed);
  const { scheme } = model;
  if (scheme === null) return { state: 'not_computed', reason: 'no_scheme' };
  if (scheme.method === 'qualitative') return { state: 'not_computed', reason: 'qualitative_method' };
  if (scheme.method === 'unknown') return { state: 'not_computed', reason: 'unknown_method' };
  if (model.components.some((component) => component.aggregation === 'unknown')) {
    return { state: 'not_computed', reason: 'unknown_aggregation' };
  }
  const evaluation = evaluateModel(model, scheme, scheme.method);
  if (evaluation.gradedSoFar.gradedCap <= 0) return { state: 'not_computed', reason: 'nothing_graded' };
  return { state: 'computed', pct: standingsOf(evaluation).graded_so_far.pct };
}

export const METHODS: readonly ComparisonMethod[] = [
  {
    id: 'points_ratio',
    label: 'Points ratio',
    note: 'Σscore ÷ Σpossible over every graded, counted column. Ignores the syllabus.',
    run: (input) => pointsRatio(input),
  },
  {
    id: 'weighted_so_far',
    label: 'Weighted so far',
    note: 'Σ(weight × part ratio) ÷ Σ(weights of parts with ≥ 1 graded item); a part ratio is Σscore ÷ Σpossible.',
    run: (input) => weightedSoFar(input),
  },
  {
    id: 'engine_10b',
    label: '10b engine',
    note: "The Phase 10b model's `graded_so_far` standing: the syllabus aggregation rule per part.",
    run: engineGradedSoFar,
  },
  {
    id: 'engine_gates_off',
    label: '10b engine, gates off',
    note:
      'The same engine, with the unscored-hand-graded gate and the unsure-link muting removed. '
      + 'A variant of the row above, not a fourth candidate.',
    run: engineGatesOff,
  },
];
