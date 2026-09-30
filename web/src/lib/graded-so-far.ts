/**
 * bb2dash — the one grade figure the app shows (Phase 12b, G-1 / G-2).
 *
 * Stack read `docs/planning/sprint-1-hub/evidence/80e_GRADE_METHOD_COMPARISON.md` and picked the
 * Phase 10b engine's arithmetic with its two silencing rules taken off — the
 * "gates off" row of that table, which reproduced every hand-derived grade in
 * the fixture set exactly. This module is that configuration, and it is the
 * only way a grade reaches a screen.
 *
 * WHAT CHANGED FROM 10b, and why:
 *
 *   * **The strict rule is gone.** A hand-graded part nobody has scored used to
 *     hide the whole course. It now behaves like any other ungraded work: out
 *     of both sides of the figure, and **named underneath it** so the reader
 *     can see what the number does not cover. On the fixture set that alone
 *     turned three silent courses of six into real figures.
 *   * **Muting is gone** — removed from `grade-model/tree.ts` itself, not
 *     worked around here. A part whose syllabus link was unsure used to be
 *     dropped from the headline, taking its graded scores with it (1.5 points
 *     and a graded 135/150 on fixture F16). Unsure links now count, and a
 *     **scored column that counts toward nothing at all** is named underneath
 *     instead, where the "Counts toward…" picker can fix it.
 *   * **One projection.** Graded so far is the figure. "Zeros on the rest",
 *     "best case", what-if scores, the target solver and saved scenarios are
 *     all removed (P-grades-3).
 *
 * WHAT DID NOT CHANGE: the arithmetic. Every per-part rule — sum, average,
 * drop-lowest, rank-weighted, normalised, single, hand-graded — is the engine's
 * own, unaltered, and so are the order of checks and the `nothing_graded`
 * decision: this module composes `evaluateCourse` rather than re-stating any of
 * it. `web/test/graded-so-far.test.ts` runs this function against the
 * hand-derived truth of every fixture as a permanent regression.
 *
 * Pure and deterministic: no I/O, no clock, no mutation. Same input, same
 * output — asserted by a property test.
 */

import { evaluateCourse, standingFor } from './grade-model';
import { slotWeights, usableWeights } from './grade-model/aggregations/rank-weighted';
import { flattenOutcomes, type NodeOutcome } from './grade-model/evaluate';
import { isCounted, realScoreOf, unlinkedScoredKeys } from './grade-model/items';
import type { ItemInput, ModelInput } from './grade-model/types';
// A pure date formatter that happens to live in the 10a query module, the same
// one Home's card uses — so both sides print an "as of" identically. The
// Supabase client it sits beside is only reached inside a queryFn, never at
// import, so this stays free of I/O.
import { formatSeenAt } from './queries.grades';

/** Why no figure can be stated at all. `nothing_graded` is its own state. */
export type FigureReason =
  | 'no_scheme'
  | 'qualitative_method'
  | 'unknown_method'
  | 'unknown_aggregation';

/**
 * A rank-weighted part's rule, as stored (R-36): the weights are the
 * component's own, read through the engine's `usableWeights`, so the sentence
 * the screen prints cannot disagree with the arithmetic behind the figure.
 */
export interface RankRule {
  /** The component's name, as the figure's part lists print it. */
  readonly part: string;
  /** Highest rank first: the stored weights, padded with 0 to `slots` (the engine's `slotWeights`). */
  readonly weights: readonly number[];
  /** The engine's slot count for this part: max(stored weights, counted columns, 1). */
  readonly slots: number;
  /** Every slot is graded, so the weights apply now; until then graded ones are averaged. */
  readonly allGraded: boolean;
}

export type GradedSoFarResult =
  | {
      readonly state: 'figure';
      /** 0..100, unrounded. Display rounds once. Extra credit can exceed 100. */
      readonly percent: number;
      readonly letter: string | null;
      /**
       * The two sides of the figure in **points**, and only under a points
       * scheme — under a weighted scheme they would be weight units, and a
       * reader shown "50.7 / 60" would be reading a mark the gradebook does not
       * contain. Null means "do not print a fraction".
       */
      readonly pointsEarned: number | null;
      readonly pointsPossible: number | null;
      /** Syllabus parts with at least one graded item, in syllabus order. */
      readonly countedParts: readonly string[];
      /** Parts the figure does not cover yet, in syllabus order. */
      readonly leftOutParts: readonly string[];
      /** Scored columns no syllabus rule claims — what the picker is for. */
      readonly unlinkedColumns: readonly string[];
      /** Newest `seenAt` among the rows that went into the figure. */
      readonly asOf: string | null;
      /**
       * Rank-weighted parts with usable weights, nested ones included, in
       * syllabus order. `gradedSoFar()` always fills it; it is optional only so
       * a figure written by hand (a test stub) without it still type-checks,
       * and a missing list renders as no rules.
       */
      readonly rankRules?: readonly RankRule[];
    }
  | { readonly state: 'nothing_graded' }
  | { readonly state: 'not_computable'; readonly reason: FigureReason };

/** The newest instant among the graded rows the figure actually used. */
export function asOfFor(items: readonly ItemInput[]): string | null {
  const stamps = items
    .filter((item) => isCounted(item) && realScoreOf(item) !== null)
    .flatMap((item) => (typeof item.seenAt === 'string' && item.seenAt !== '' ? [item.seenAt] : []));
  if (stamps.length === 0) return null;
  return stamps.reduce((newest, stamp) => (Date.parse(stamp) > Date.parse(newest) ? stamp : newest));
}

/**
 * Every rank-weighted part the engine actually ranks, in syllabus order: a leaf
 * (a parent sums its children, whatever its own aggregation says), not extra
 * credit (the same filter the part lists use), with usable weights. The slot
 * count is the engine's own (a leaf's graded + remaining slots), so a part with
 * more columns than weights reads "once all 4" with its extra slot at 0.
 */
export function rankRulesFor(outcomes: readonly NodeOutcome[]): readonly RankRule[] {
  return flattenOutcomes(outcomes).flatMap((outcome) => {
    const { component, children, extraCredit } = outcome.node;
    if (children.length > 0 || extraCredit || component.aggregation !== 'rank_weighted') return [];
    const weights = usableWeights(component.rankWeights);
    if (weights === null) return [];
    const slots = outcome.gradedCount + outcome.remainingCount;
    return [
      {
        part: component.name,
        weights: slotWeights(weights, slots),
        slots,
        allGraded: outcome.state === 'graded',
      },
    ];
  });
}

/** Names of the scored columns the picker could still place, in input order. */
function unlinkedColumnNames(input: ModelInput): readonly string[] {
  const keys = new Set(unlinkedScoredKeys(input.components, input.items));
  return input.items.filter((item) => keys.has(item.key)).map((item) => item.name);
}

/* ---------------------------------------------------------------------------
 * The Home course card's slot (G-2 / P-home-10, Stack's answer 12)
 * ------------------------------------------------------------------------ */

/** One decimal, rounded once, at the edge — never anywhere upstream. */
export function percentText(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

/** The label the card prints beside the figure. */
export const CARD_FIGURE_LABEL = 'Graded so far';

/**
 * Why there is no figure, in the few words a course card has room for. The
 * long-form sentences live in `GradedSoFarFigure.tsx`, which has the space.
 */
export const CARD_ABSENCE_TEXT: Readonly<Record<FigureReason | 'nothing_graded', string>> = {
  nothing_graded: 'nothing graded yet',
  qualitative_method: 'graded qualitatively',
  no_scheme: 'no grading rules yet',
  unknown_method: 'grading rules not readable',
  unknown_aggregation: 'grading rules not readable',
};

/**
 * One already-formatted figure for Home's course card.
 *
 * The card's prop contract (`web/src/app/(app)/CourseGradeFigure.tsx`, W-32)
 * carries no numerator, denominator or method: the card must not be in a
 * position to do arithmetic, so everything arrives as text. Exactly one of
 * `value` and `absence` is filled, never both and never neither — which is what
 * keeps a course with no grade from rendering a zero.
 */
export interface GradedSoFarCardFigure {
  readonly label: string;
  readonly value: string | null;
  readonly absence: string | null;
  readonly asOf: string | null;
  readonly display: string | null;
}

export function gradedSoFarCardFigure(result: GradedSoFarResult): GradedSoFarCardFigure {
  if (result.state === 'figure') {
    return {
      label: CARD_FIGURE_LABEL,
      value: percentText(result.percent),
      absence: null,
      asOf: result.asOf === null ? null : formatSeenAt(result.asOf),
      display: result.letter,
    };
  }
  const reason = result.state === 'nothing_graded' ? 'nothing_graded' : result.reason;
  return {
    label: CARD_FIGURE_LABEL,
    value: null,
    absence: CARD_ABSENCE_TEXT[reason],
    asOf: null,
    display: null,
  };
}

/* ---------------------------------------------------------------------------
 * The figure itself
 * ------------------------------------------------------------------------ */

/**
 * The figure, and what it does not cover.
 *
 * The order of checks and the `nothing_graded` decision are the engine's own
 * (`evaluateCourse`), so there is exactly one gate and the two cannot drift.
 * All this adds is the reading: the percentage, and the parts and columns the
 * percentage leaves out.
 */
export function gradedSoFar(input: ModelInput): GradedSoFarResult {
  const evaluation = evaluateCourse(input);
  if (evaluation.state === 'not_computable') {
    // `nothing_graded` is a state of its own here: a course whose rules are
    // fine and whose work simply has not been marked yet is a different thing
    // to say than one that can never carry a percentage.
    return evaluation.reason === 'nothing_graded'
      ? { state: 'nothing_graded' }
      : { state: 'not_computable', reason: evaluation.reason };
  }

  const totals = evaluation.gradedSoFar;
  const standing = standingFor(evaluation);
  // Extra credit has no capacity by design, so it is neither counted nor left
  // out — listing it either way would misdescribe it.
  const parts = totals.outcomes.filter((outcome) => !outcome.node.extraCredit);
  const points = evaluation.model.method === 'points';

  return {
    state: 'figure',
    percent: standing.pct,
    letter: standing.letter,
    pointsEarned: points ? totals.earned : null,
    pointsPossible: points ? totals.gradedCap : null,
    countedParts: parts.filter((o) => o.gradedCap > 0).map((o) => o.node.component.name),
    leftOutParts: parts.filter((o) => o.gradedCap <= 0).map((o) => o.node.component.name),
    unlinkedColumns: unlinkedColumnNames(input),
    asOf: asOfFor(input.items),
    rankRules: rankRulesFor(totals.outcomes),
  };
}
