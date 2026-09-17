/**
 * bb2dash — the one grade figure the app shows (Phase 12b, G-1 / G-2).
 *
 * Stack read `docs/planning/80e_GRADE_METHOD_COMPARISON.md` and picked the
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
 *   * **Muting is gone.** A part whose syllabus link was unsure used to be
 *     dropped from the headline, taking its graded scores with it — 1.5 points
 *     and a graded 135/150 on fixture F16. Unsure links now count, and a
 *     **scored column that counts toward nothing at all** is named underneath
 *     instead, where the "Counts toward…" picker can fix it.
 *   * **One projection.** Graded so far is the figure. "Zeros on the rest",
 *     "best case", what-if scores, the target solver and saved scenarios are
 *     all removed (P-grades-3).
 *
 * WHAT DID NOT CHANGE: the arithmetic. Every per-part rule — sum, average,
 * drop-lowest, rank-weighted, normalised, single, hand-graded — is the engine's
 * own, unaltered, and `web/test/grade-method-comparison/` runs this function
 * against the hand-derived truths on every fixture as a permanent regression.
 *
 * Pure and deterministic: no I/O, no clock, no mutation. Same input, same
 * output — asserted by a property test.
 */

import { evaluateModel, standingOf } from './grade-model/project';
import { isCounted, realScoreOf, unlinkedScoredKeys } from './grade-model/items';
import type { ItemInput, ModelInput, SchemeInput } from './grade-model/types';
import type { ComputableMethod } from './grade-model/tree';

/** Why no figure can be stated at all. `nothing_graded` is its own state. */
export type FigureReason =
  | 'no_scheme'
  | 'qualitative_method'
  | 'unknown_method'
  | 'unknown_aggregation';

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
    }
  | { readonly state: 'nothing_graded' }
  | { readonly state: 'not_computable'; readonly reason: FigureReason };

interface OpenGate {
  readonly state: 'open';
  readonly scheme: SchemeInput;
  readonly method: ComputableMethod;
}

function notComputable(reason: FigureReason): GradedSoFarResult {
  return { state: 'not_computable', reason };
}

/**
 * The checks that remain. A course with no rules, or graded qualitatively, or
 * carrying a rule we cannot read, has no percentage — and saying so is the
 * point. IST.471 is the live case: it never shows a number.
 */
function gate(input: ModelInput): GradedSoFarResult | OpenGate {
  const { scheme } = input;
  if (scheme === null) return notComputable('no_scheme');
  if (scheme.method === 'qualitative') return notComputable('qualitative_method');
  if (scheme.method === 'unknown') return notComputable('unknown_method');
  if (input.components.some((component) => component.aggregation === 'unknown')) {
    return notComputable('unknown_aggregation');
  }
  return { state: 'open', scheme, method: scheme.method };
}

/** The newest instant among the graded rows the figure actually used. */
export function asOfFor(items: readonly ItemInput[]): string | null {
  const stamps = items
    .filter((item) => isCounted(item) && realScoreOf(item) !== null)
    .flatMap((item) => (typeof item.seenAt === 'string' && item.seenAt !== '' ? [item.seenAt] : []));
  if (stamps.length === 0) return null;
  return stamps.reduce((newest, stamp) => (Date.parse(stamp) > Date.parse(newest) ? stamp : newest));
}

/** Names of the scored columns the picker could still place, in input order. */
function unlinkedColumnNames(input: ModelInput): readonly string[] {
  const keys = new Set(unlinkedScoredKeys(input.components, input.items));
  return input.items.filter((item) => keys.has(item.key)).map((item) => item.name);
}

/**
 * Muting off, expressed in the input: a link's confidence no longer decides
 * whether a graded score counts, only whether the reader is told the link is
 * unsure. Every linked item therefore enters the arithmetic as confirmed.
 *
 * This is how the "gates off" row of `80e` was measured, and it is how the
 * production path behaves. It reads as a shim only because the muting code is
 * still inside `grade-model/tree.ts`; when that goes, this function goes with
 * it and the fixtures prove the figure did not move.
 */
function linksConfirmed(input: ModelInput): ModelInput {
  return {
    ...input,
    items: input.items.map((item) =>
      item.componentId === null ? item : { ...item, linkConfidence: 'confirmed' as const },
    ),
  };
}

export function gradedSoFar(input: ModelInput): GradedSoFarResult {
  const open = gate(input);
  if (open.state !== 'open') return open;

  const evaluation = evaluateModel(linksConfirmed(input), open.scheme, open.method);
  const totals = evaluation.gradedSoFar;
  if (totals.gradedCap <= 0) return { state: 'nothing_graded' };

  const standing = standingOf(totals.earned, totals.gradedCap, open.scheme);
  // Extra credit has no capacity by design, so it is neither counted nor left
  // out — listing it either way would misdescribe it.
  const parts = totals.outcomes.filter((outcome) => !outcome.node.extraCredit);
  const points = open.method === 'points';

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
  };
}
