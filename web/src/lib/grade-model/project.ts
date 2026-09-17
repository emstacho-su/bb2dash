/**
 * Course projection: the prepared model, totals at graded so far / zeros on
 * the rest / best case, the standings and the per-component results.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Denominator",
 * "Standings" and "Order of checks" (`nothing_graded`).
 */

import { checkComputable, notComputed } from './checks';
import { evaluateNode, flattenOutcomes, type NodeOutcome } from './evaluate';
import { letterForPct } from './letter';
import { sum } from './math';
import { prepareItems } from './prepare';
import { mutedCap, type ComponentNode, type ComputableMethod } from './tree';
import type {
  ComponentInput,
  ComponentResult,
  ModelInput,
  NotComputedResult,
  Projection,
  SchemeInput,
  Standing,
} from './types';

export interface PreparedModel {
  readonly scheme: SchemeInput;
  readonly method: ComputableMethod;
  readonly roots: readonly ComponentNode[];
  /** Whole-course capacity before muting: 100-ish under weighted_pct, `gradedOutOf ?? totalPoints ?? Σcap` under points. */
  readonly wholeCourse: number;
  /** The denominator of zeros on the rest and best case, muted capacity removed. */
  readonly denominator: number;
}

export interface CourseTotals {
  readonly earned: number;
  readonly extraEarned: number;
  readonly gradedCap: number;
  readonly remainingCap: number;
  readonly remainingCount: number;
  readonly outcomes: readonly NodeOutcome[];
}

export interface CourseEvaluation {
  readonly state: 'computed';
  readonly model: PreparedModel;
  readonly gradedSoFar: CourseTotals;
  readonly zeros: CourseTotals;
  readonly best: CourseTotals;
}

export function prepareModel(input: ModelInput, scheme: SchemeInput, method: ComputableMethod): PreparedModel {
  const { roots } = prepareItems(input, input.scenario, method);
  const regular = roots.filter((root) => !root.extraCredit);
  const nominal = sum(regular.map((root) => root.nominalCap));
  const wholeCourse = method === 'weighted_pct' ? nominal : (scheme.gradedOutOf ?? scheme.totalPoints ?? nominal);
  const denominator = wholeCourse - sum(regular.map(mutedCap));
  return { scheme, method, roots, wholeCourse, denominator };
}

/**
 * Course totals with `r` on every ungraded slot (`null` = graded so far).
 * `extraR` fills ungraded extra credit and defaults to `r` (the standings).
 */
export function totalsAt(model: PreparedModel, r: number | null, extraR: number | null = r): CourseTotals {
  const outcomes = model.roots.map((root) => evaluateNode(root, model.method, { r, extraR }));
  const active = outcomes.filter((outcome) => !outcome.node.muted);
  const capacity = active.filter((outcome) => !outcome.node.extraCredit);
  return {
    earned: sum(active.map((outcome) => outcome.earned)),
    extraEarned: sum(active.map((outcome) => outcome.extraEarned)),
    gradedCap: sum(capacity.map((outcome) => outcome.gradedCap)),
    remainingCap: sum(capacity.map((outcome) => outcome.remainingCap)),
    remainingCount: sum(capacity.map((outcome) => outcome.remainingCount)),
    outcomes,
  };
}

export function standingOf(earned: number, denominator: number, scheme: SchemeInput): Standing {
  const pct = (earned / denominator) * 100;
  return { pct, earned, denominator, letter: letterForPct(pct, scheme) };
}

/** Internal: all three projections with no order-of-checks gate (L4 sets participation aside this way). */
export function evaluateModel(input: ModelInput, scheme: SchemeInput, method: ComputableMethod): CourseEvaluation {
  const model = prepareModel(input, scheme, method);
  return {
    state: 'computed',
    model,
    gradedSoFar: totalsAt(model, null),
    zeros: totalsAt(model, 0),
    best: totalsAt(model, 1),
  };
}

/**
 * The gated evaluation. Decision: `nothing_graded` means no graded capacity
 * counts — nothing regular is graded or given a what-if value (an extra-credit
 * score alone has no denominator to sit on) — or muting left no capacity.
 */
export function evaluateCourse(input: ModelInput): NotComputedResult | CourseEvaluation {
  const gate = checkComputable(input);
  if (gate.state === 'not_computable') return gate;
  const evaluation = evaluateModel(input, gate.scheme, gate.method);
  const nothingCounts = evaluation.gradedSoFar.gradedCap <= 0 || evaluation.model.denominator <= 0;
  return nothingCounts ? notComputed('nothing_graded') : evaluation;
}

export function standingsOf(evaluation: CourseEvaluation): Readonly<Record<Projection, Standing>> {
  const { model, gradedSoFar, zeros, best } = evaluation;
  return {
    graded_so_far: standingOf(gradedSoFar.earned, gradedSoFar.gradedCap, model.scheme),
    zeros_on_rest: standingOf(zeros.earned, model.denominator, model.scheme),
    best_case: standingOf(best.earned, model.denominator, model.scheme),
  };
}

function toComponentResult(outcome: NodeOutcome): ComponentResult {
  const { component } = outcome.node;
  return {
    componentId: component.id,
    code: component.code,
    name: component.name,
    state: outcome.state,
    earned: outcome.earned,
    gradedCap: outcome.gradedCap,
    cap: outcome.cap,
    usesHypothetical: outcome.usesHypothetical,
    capacityFromKnownItems: outcome.capacityFromKnownItems,
  };
}

/**
 * Graded-so-far results for every component, children included, in input
 * order. A muted component reports its nominal `cap` with nothing earned.
 */
export function componentResults(
  components: readonly ComponentInput[],
  evaluation: CourseEvaluation,
): readonly ComponentResult[] {
  const byId = new Map(
    flattenOutcomes(evaluation.gradedSoFar.outcomes).map((outcome) => [outcome.node.component.id, outcome]),
  );
  return components.flatMap((component) => {
    const outcome = byId.get(component.id);
    return outcome === undefined ? [] : [toComponentResult(outcome)];
  });
}

export function usesHypotheticals(evaluation: CourseEvaluation): boolean {
  return evaluation.gradedSoFar.outcomes.some((outcome) => !outcome.node.muted && outcome.usesHypothetical);
}
