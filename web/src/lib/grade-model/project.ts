/**
 * Course projection: the prepared model, the graded-so-far total, its standing
 * and the per-component results.
 *
 * Phase 12b (G-1): one projection. "Zeros on the rest" and "best case" are gone
 * with the what-if layer, and with them the whole-course `denominator` they
 * were divided by — graded so far divides by the capacity that is actually
 * graded. `totalsAt` keeps its `r` because that is how the per-aggregation
 * table expresses the arithmetic; production only ever asks for `r = null`.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Standings", as
 * amended by `80c_PHASE12B_page_pass.md`.
 */

import { checkComputable, notComputed } from './checks';
import { evaluateNode, flattenOutcomes, type NodeOutcome } from './evaluate';
import { letterForPct } from './letter';
import { sum } from './math';
import { prepareItems } from './prepare';
import type { ComponentNode, ComputableMethod } from './tree';
import type {
  ComponentInput,
  ComponentResult,
  ModelInput,
  NotComputedResult,
  SchemeInput,
  Standing,
} from './types';

export interface PreparedModel {
  readonly scheme: SchemeInput;
  readonly method: ComputableMethod;
  readonly roots: readonly ComponentNode[];
  /** Whole-course capacity: 100-ish under weighted_pct, `gradedOutOf ?? totalPoints ?? Σcap` under points. */
  readonly wholeCourse: number;
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
}

export function prepareModel(
  input: ModelInput,
  scheme: SchemeInput,
  method: ComputableMethod,
): PreparedModel {
  const { roots } = prepareItems(input, method);
  const regular = roots.filter((root) => !root.extraCredit);
  const nominal = sum(regular.map((root) => root.nominalCap));
  const wholeCourse =
    method === 'weighted_pct' ? nominal : (scheme.gradedOutOf ?? scheme.totalPoints ?? nominal);
  return { scheme, method, roots, wholeCourse };
}

/**
 * Course totals with `r` on every ungraded slot (`null` = graded so far).
 * `extraR` fills ungraded extra credit and defaults to `r`.
 */
export function totalsAt(
  model: PreparedModel,
  r: number | null,
  extraR: number | null = r,
): CourseTotals {
  const outcomes = model.roots.map((root) => evaluateNode(root, model.method, { r, extraR }));
  const capacity = outcomes.filter((outcome) => !outcome.node.extraCredit);
  return {
    earned: sum(outcomes.map((outcome) => outcome.earned)),
    extraEarned: sum(outcomes.map((outcome) => outcome.extraEarned)),
    gradedCap: sum(capacity.map((outcome) => outcome.gradedCap)),
    remainingCap: sum(capacity.map((outcome) => outcome.remainingCap)),
    remainingCount: sum(capacity.map((outcome) => outcome.remainingCount)),
    outcomes,
  };
}

/** `outOf` is the capacity the earned value is a share of — graded capacity, here. */
export function standingOf(earned: number, outOf: number, scheme: SchemeInput): Standing {
  const pct = (earned / outOf) * 100;
  return { pct, earned, denominator: outOf, letter: letterForPct(pct, scheme) };
}

/** The ungated evaluation, for a caller that runs its own order of checks. */
export function evaluateModel(
  input: ModelInput,
  scheme: SchemeInput,
  method: ComputableMethod,
): CourseEvaluation {
  const model = prepareModel(input, scheme, method);
  return { state: 'computed', model, gradedSoFar: totalsAt(model, null) };
}

/** The gated evaluation. `nothing_graded` means no graded capacity counts. */
export function evaluateCourse(input: ModelInput): NotComputedResult | CourseEvaluation {
  const gate = checkComputable(input);
  if (gate.state === 'not_computable') return gate;
  const evaluation = evaluateModel(input, gate.scheme, gate.method);
  return evaluation.gradedSoFar.gradedCap <= 0 ? notComputed('nothing_graded') : evaluation;
}

export function standingFor(evaluation: CourseEvaluation): Standing {
  const { earned, gradedCap } = evaluation.gradedSoFar;
  return standingOf(earned, gradedCap, evaluation.model.scheme);
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
    capacityFromKnownItems: outcome.capacityFromKnownItems,
  };
}

/** Graded-so-far results for every component, children included, in input order. */
export function componentResults(
  components: readonly ComponentInput[],
  evaluation: CourseEvaluation,
): readonly ComponentResult[] {
  const byId = new Map(
    flattenOutcomes(evaluation.gradedSoFar.outcomes).map((outcome) => [
      outcome.node.component.id,
      outcome,
    ]),
  );
  return components.flatMap((component) => {
    const outcome = byId.get(component.id);
    return outcome === undefined ? [] : [toComponentResult(outcome)];
  });
}
