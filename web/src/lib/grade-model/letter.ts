/**
 * Letters from the scheme's own scale, compared unrounded.
 *
 * Contract: `68_PHASE10B_grade_model.md` §Engine, Semantics "Letter": the
 * highest step with `min ≤ value`; a scale whose largest `min` exceeds 100 is
 * in points and is compared against `pct · denominator / 100` (IST.466).
 *
 * Decision: `letterFor` receives only the scheme, so the points denominator is
 * the scheme's whole-course figure, `gradedOutOf ?? totalPoints`. A percentage
 * is a share of the whole course whether or not a part is muted, so this is
 * also the right figure. With neither set, a points scale yields no letter.
 */

import type { LetterStep, SchemeInput } from './types';

export function isPointsScale(scale: readonly LetterStep[]): boolean {
  return scale.some((step) => step.min > 100);
}

function pointsBase(scheme: SchemeInput): number | null {
  const base = scheme.gradedOutOf ?? scheme.totalPoints;
  return base !== null && Number.isFinite(base) && base > 0 ? base : null;
}

/** `pct` in the scale's own unit (percent, or points for a points scale); null when it cannot be converted. */
export function scaleValue(pct: number, scheme: SchemeInput): number | null {
  if (!Number.isFinite(pct)) return null;
  if (!isPointsScale(scheme.letterScale)) return pct;
  const base = pointsBase(scheme);
  return base === null ? null : (pct * base) / 100;
}

/** A step's `min` as a percentage of the course; null when a points scale has no base. */
export function stepPct(step: LetterStep, scheme: SchemeInput): number | null {
  if (!isPointsScale(scheme.letterScale)) return step.min;
  const base = pointsBase(scheme);
  return base === null ? null : (step.min / base) * 100;
}

export function letterForPct(pct: number, scheme: SchemeInput): string | null {
  const value = scaleValue(pct, scheme);
  if (value === null) return null;
  const reached = scheme.letterScale.filter((step) => step.min <= value);
  if (reached.length === 0) return null;
  const highest = reached.reduce((best, step) => (step.min > best.min ? step : best));
  return highest.letter;
}

/** The scale step named `letter`, or null. */
export function stepFor(letter: string, scheme: SchemeInput): LetterStep | null {
  return scheme.letterScale.find((step) => step.letter === letter) ?? null;
}
