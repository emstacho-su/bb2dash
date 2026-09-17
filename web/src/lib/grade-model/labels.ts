/**
 * bb2dash — grade model wording (Phase 10b). FROZEN CONTRACT.
 *
 * Every sentence a grade-model surface renders comes from here, so the tests
 * can assert exact text and no screen invents its own. Mirrors the Labels
 * table in `docs/planning/68_PHASE10B_grade_model.md`. The PM owns this file.
 *
 * Template functions take already-formatted strings: rounding for display
 * happens in the component, once, never here.
 */

import type { DeltaReason, NotComputableReason, Projection } from './types';

export const MODEL_LABEL = 'Our model';

export const PROJECTION_LABEL: Readonly<Record<Projection, string>> = {
  graded_so_far: 'graded so far',
  zeros_on_rest: 'zeros on the rest',
  best_case: 'best case',
};

export const WHAT_IF_NOTE = 'includes what-if values';
export const AGREES_TEXT = "Agrees with Blackboard's number";
export const WHAT_IF_LABEL = 'what if';
export const PLACEHOLDER_GROUP = 'Not in Blackboard yet';
export const LINK_LABEL = 'Counts toward…';
export const LINK_NOT_GRADED = 'Not graded';
export const LINK_UNSURE = 'unsure';
export const RESET_LABEL = 'Reset scenario';

export function differsText(delta: string, unit: string): string {
  return `Differs from Blackboard's number by ${delta} ${unit}:`;
}

export function notComputableText(reason: NotComputableReason, names: readonly string[]): string {
  switch (reason) {
    case 'qualitative_method':
      return 'Model not computed — this course is graded qualitatively';
    case 'manual_unscored':
      return `Model not computed — ${joinNames(names)} not scored yet`;
    case 'no_scheme':
      return 'Model not computed — no grading rules recorded';
    case 'unknown_method':
    case 'unknown_aggregation':
      return 'Model not computed — a grading rule is unknown';
    case 'nothing_graded':
      return 'Model not computed yet — nothing that counts has been graded';
  }
}

/** One part left out because a link is unsure (Round 3, R3-3, PM-authorised). */
export interface MutedPartArgs {
  readonly part: string;
  /** The part's unsure items that have a Blackboard column, by name: their link can be confirmed. */
  readonly confirmable: readonly string[];
  /** How many of the part's unsure items are placeholders: not in Blackboard yet. */
  readonly notInBlackboard: number;
}

/**
 * One sentence per muted part. A part with no unsure item listed cannot come
 * from the engine's own states; it keeps the round-2 sentence rather than
 * printing an empty list.
 */
export function mutedText({ part, confirmable, notInBlackboard }: MutedPartArgs): string {
  const links = confirmable.length > 1 ? 'links' : 'link';
  if (confirmable.length > 0 && notInBlackboard > 0) {
    return `Left out: ${part} — confirm the unsure ${links} on ${joinNames(confirmable)}; ${notInBlackboard} more not in Blackboard yet`;
  }
  if (confirmable.length > 0) return `Left out: ${part} — confirm the unsure ${links} on ${joinNames(confirmable)}`;
  if (notInBlackboard > 0) return `Left out: ${part} — its link is unsure and it isn't in Blackboard yet`;
  return `Left out: ${part} — the link to the syllabus is unsure`;
}

export const DELTA_REASON_TEXT: Readonly<Record<DeltaReason, string>> = {
  bb_running_total: "Blackboard's running-total setting could not be read",
  ungraded_counted_as_zero: 'Blackboard counts ungraded work as zero',
  drop_lowest_pending: 'a drop-lowest rule is not applied yet',
  extra_credit: 'extra credit is counted',
  muted_component: 'a part with an unsure link is left out',
  unlinked_column: 'a Blackboard column is not linked to a syllabus rule',
  unexplained: 'no known reason',
};

export interface NeededTextArgs {
  readonly letter: string;
  readonly min: string;
  readonly avg: string;
  readonly n: number;
  readonly share: string;
}

export function solverNeededText({ letter, min, avg, n, share }: NeededTextArgs): string {
  return `For ${letter} (≥ ${min}) you need ${avg} average on the ${n} remaining items (${share} of the grade left).`;
}

export function solverUnreachableText(letter: string, best: string, bestLetter: string): string {
  return `${letter} is out of reach — the most you can finish with is ${best} (${bestLetter}).`;
}

export function solverSecuredText(letter: string, worst: string, worstLetter: string): string {
  return `${letter} is secured — even zeros on the rest leave ${worst} (${worstLetter}).`;
}

export function solverNoRemainingText(current: string, letter: string): string {
  return `Nothing is left to grade — the course stands at ${current} (${letter}).`;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
