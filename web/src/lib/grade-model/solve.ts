/**
 * Target solver: the uniform fraction needed on every remaining slot to reach
 * a letter.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Solver".
 *
 * Decisions:
 * - The solver's projection at `r` fills only the remaining slots with `r`:
 *   ungraded extra credit is not remaining work, so it stays at 0. Feeding
 *   `averageNeeded` back onto the remaining items then reaches the target, and
 *   `unreachable.bestCase` never counts on extra credit not yet earned (it can
 *   sit below the standings' best case). `secured.worstCase` is zeros on the rest.
 * - `no_remaining_work.current` is zeros on the rest: with nothing left it is
 *   the course's final figure over its own denominator.
 * - The target is compared in the scale's unit (points for IST.466), the same
 *   comparison `letterFor` makes, so the solved standing always earns the letter.
 * - A letter that is not on the scheme's scale, or a points scale with no point
 *   total to convert against, is a caller error: it throws a RangeError.
 */

import { stepFor, stepPct, scaleValue } from './letter';
import { evaluateCourse, standingOf, totalsAt, type CourseEvaluation } from './project';
import type { LetterStep, ModelInput, Standing, TargetResult } from './types';

const BISECT_WIDTH = 1e-6;

export function standingAtR(evaluation: CourseEvaluation, r: number): Standing {
  const { model } = evaluation;
  return standingOf(totalsAt(model, r, 0).earned, model.denominator, model.scheme);
}

function reaches(evaluation: CourseEvaluation, step: LetterStep, r: number): boolean {
  const value = scaleValue(standingAtR(evaluation, r).pct, evaluation.model.scheme);
  return value !== null && value >= step.min;
}

/** Smallest `r` (within BISECT_WIDTH, from above) that reaches the step; `reaches(1)` must hold and `reaches(0)` must not. */
function bisect(evaluation: CourseEvaluation, step: LetterStep): number {
  let lo = 0;
  let hi = 1;
  while (hi - lo >= BISECT_WIDTH) {
    const mid = (lo + hi) / 2;
    if (reaches(evaluation, step, mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function targetStep(evaluation: CourseEvaluation, letter: string): { step: LetterStep; targetPct: number } {
  const { scheme } = evaluation.model;
  const step = stepFor(letter, scheme);
  if (step === null) {
    throw new RangeError(`grade-model: letter "${letter}" is not on ${scheme.courseId}'s scale`);
  }
  const targetPct = stepPct(step, scheme);
  if (targetPct === null) {
    throw new RangeError(`grade-model: ${scheme.courseId}'s scale is in points but the scheme has no point total`);
  }
  return { step, targetPct };
}

export function solve(input: ModelInput, letter: string): TargetResult {
  const evaluation = evaluateCourse(input);
  if (evaluation.state === 'not_computable') return { state: 'not_computable', reason: evaluation.reason };
  const { step, targetPct } = targetStep(evaluation, letter);
  const { model, zeros } = evaluation;

  if (zeros.remainingCount === 0) {
    return { state: 'no_remaining_work', letter, current: standingAtR(evaluation, 0) };
  }
  if (!reaches(evaluation, step, 1)) {
    return { state: 'unreachable', letter, bestCase: standingAtR(evaluation, 1) };
  }
  if (reaches(evaluation, step, 0)) {
    return { state: 'secured', letter, worstCase: standingAtR(evaluation, 0) };
  }
  return {
    state: 'needed',
    letter,
    targetPct,
    averageNeeded: bisect(evaluation, step),
    remainingCount: zeros.remainingCount,
    remainingShare: zeros.remainingCap / model.denominator,
  };
}
