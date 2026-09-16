/**
 * Agreement with Blackboard's published total, from real scores only.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Agreement".
 */

import { dropCount } from './aggregations/average-drop-lowest';
import { EMPTY_SCENARIO } from './checks';
import { flattenOutcomes } from './evaluate';
import { unlinkedScoredKeys } from './items';
import { evaluateCourse, standingsOf, type CourseEvaluation } from './project';
import { flattenForest } from './tree';
import type { Agreement, BlackboardTotal, DeltaReason, ModelInput } from './types';

/** Floating-point slack so a delta of exactly 0.5 is not lost to binary rounding. */
const FLOAT_SLACK = 1e-9;
const AGREE_WITHIN_PER_100 = 0.5;

function blackboardValueOf(total: BlackboardTotal, unit: Agreement['unit']): number | null {
  if (total.score === null || !Number.isFinite(total.score)) return null;
  if (unit === 'points') return total.score;
  const possible = total.possible;
  return possible !== null && Number.isFinite(possible) && possible > 0 ? (total.score / possible) * 100 : null;
}

function dropLowestPending(evaluation: CourseEvaluation): boolean {
  return flattenOutcomes(evaluation.gradedSoFar.outcomes).some((outcome) => {
    const { component } = outcome.node;
    const drop = dropCount(component.dropLowest);
    return (
      outcome.state !== 'muted' &&
      component.aggregation === 'average_drop_lowest' &&
      drop > 0 &&
      outcome.gradedCount <= drop
    );
  });
}

/** Every reason whose condition holds, in the enum's order; `unexplained` only when none does. */
function reasonsFor(input: ModelInput, evaluation: CourseEvaluation, running: boolean | null): readonly DeltaReason[] {
  const conditions: readonly (readonly [DeltaReason, boolean])[] = [
    ['bb_running_total', running === null],
    ['ungraded_counted_as_zero', running === false && evaluation.zeros.remainingCap > 0],
    ['drop_lowest_pending', dropLowestPending(evaluation)],
    ['extra_credit', evaluation.gradedSoFar.extraEarned > 0],
    ['muted_component', flattenForest(evaluation.model.roots).some((node) => node.muted)],
    ['unlinked_column', unlinkedScoredKeys(input.components, input.items).length > 0],
  ];
  const holding = conditions.filter(([, holds]) => holds).map(([reason]) => reason);
  return holding.length > 0 ? holding : ['unexplained'];
}

/**
 * Decisions: the scenario is dropped before anything is computed, so a course
 * computable only through what-if values has no agreement (null). "0.5 on a
 * 100-unit denominator" scales to `0.5 · wholeCourse / 100` points under the
 * points method (IST.466: 5.1 of 1020); weighted_pct compares percentages
 * within 0.5.
 */
export function agreementFor(input: ModelInput): Agreement | null {
  const total = input.blackboardTotal;
  if (total === null || total.score === null) return null;
  const evaluation = evaluateCourse({ ...input, scenario: EMPTY_SCENARIO });
  if (evaluation.state === 'not_computable') return null;

  const unit: Agreement['unit'] = evaluation.model.method === 'points' ? 'points' : 'pct';
  const blackboardValue = blackboardValueOf(total, unit);
  if (blackboardValue === null) return null;
  const standings = standingsOf(evaluation);
  const compared = total.running === true ? standings.graded_so_far : standings.zeros_on_rest;
  const modelValue = unit === 'points' ? compared.earned : compared.pct;
  const delta = modelValue - blackboardValue;
  const per100 = unit === 'points' ? evaluation.model.wholeCourse / 100 : 1;
  const agrees = Math.abs(delta) <= AGREE_WITHIN_PER_100 * per100 + FLOAT_SLACK;
  return {
    status: agrees ? 'agrees' : 'differs',
    modelValue,
    blackboardValue,
    unit,
    delta,
    reasons: agrees ? [] : reasonsFor(input, evaluation, total.running),
  };
}
