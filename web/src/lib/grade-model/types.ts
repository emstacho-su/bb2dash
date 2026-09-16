/**
 * bb2dash — grade model types (Phase 10b, R-12). FROZEN CONTRACT.
 *
 * Mirrors `docs/planning/68_PHASE10B_grade_model.md` §Engine exactly. The PM
 * owns this file; W-19 (engine) and W-20 (web) build against it and never edit
 * it. A change here is a Contract change and goes through the brief first.
 *
 * Every numeric field is unrounded. Display rounds once, in the component.
 */

export type Method = 'weighted_pct' | 'points' | 'qualitative' | 'unknown';

export type Aggregation =
  | 'sum'
  | 'average'
  | 'average_drop_lowest'
  | 'rank_weighted'
  | 'normalized'
  | 'single'
  | 'manual'
  | 'unknown';

export type Confidence = 'confirmed' | 'tentative' | 'inferred';

/** Headline first (Stack's answer 4, 2026-09-16). */
export type Projection = 'graded_so_far' | 'zeros_on_rest' | 'best_case';

export const PROJECTIONS: readonly Projection[] = ['graded_so_far', 'zeros_on_rest', 'best_case'];

export interface LetterStep {
  readonly min: number;
  readonly letter: string;
}

export interface SchemeInput {
  /** `grading_schemes.course_id` — the scheme course (GEO 103: the lecture shell). */
  readonly courseId: string;
  readonly method: Method;
  readonly totalPoints: number | null;
  readonly gradedOutOf: number | null;
  /** Descending by `min`. A largest `min` above 100 means the scale is in points. */
  readonly letterScale: readonly LetterStep[];
}

export interface ComponentInput {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly parentId: number | null;
  readonly weightPct: number | null;
  readonly points: number | null;
  readonly countExpected: number | null;
  readonly aggregation: Aggregation;
  readonly dropLowest: number;
  readonly rankWeights: readonly number[] | null;
  readonly normalizeTo: number | null;
  readonly isExtraCredit: boolean;
}

export interface ItemInput {
  /** `col:<shell_course_id>:<column_id>` or `asg:<assignment id>` (a placeholder). */
  readonly key: string;
  readonly componentId: number | null;
  readonly linkSource: 'override' | 'assignment' | null;
  /** `confirmed` for an override; the assignment's confidence otherwise; null when unlinked. */
  readonly linkConfidence: Confidence | null;
  /** Stack marked the column "Not graded". */
  readonly excluded: boolean;
  readonly name: string;
  readonly possible: number | null;
  /** Blackboard's `effective_score`; always null for a placeholder. */
  readonly score: number | null;
  readonly exempt: boolean;
  readonly kind: 'item' | 'attendance' | 'placeholder';
  readonly isExtraCredit: boolean;
  readonly dueAt: string | null;
}

export interface BlackboardTotal {
  readonly score: number | null;
  readonly possible: number | null;
  /** Parsed from the total column's formula; null when it could not be read. */
  readonly running: boolean | null;
  readonly seenAt: string;
}

export interface Scenario {
  /** item key → hypothetical score, `0 ≤ v ≤ possible`. */
  readonly itemScores: Readonly<Record<string, number>>;
}

export interface ModelInput {
  readonly scheme: SchemeInput | null;
  readonly components: readonly ComponentInput[];
  readonly items: readonly ItemInput[];
  readonly scenario: Scenario;
  readonly blackboardTotal: BlackboardTotal | null;
}

export type NotComputableReason =
  | 'no_scheme'
  | 'qualitative_method'
  | 'unknown_method'
  | 'unknown_aggregation'
  | 'manual_unscored'
  | 'nothing_graded';

export type DeltaReason =
  | 'bb_running_total'
  | 'ungraded_counted_as_zero'
  | 'drop_lowest_pending'
  | 'extra_credit'
  | 'muted_component'
  | 'unlinked_column'
  | 'unexplained';

export interface Standing {
  readonly pct: number;
  readonly earned: number;
  readonly denominator: number;
  readonly letter: string | null;
}

export interface ComponentResult {
  readonly componentId: number;
  readonly code: string;
  readonly name: string;
  readonly state: 'graded' | 'partly_graded' | 'ungraded' | 'muted';
  readonly earned: number;
  readonly gradedCap: number;
  readonly cap: number;
  readonly usesHypothetical: boolean;
  readonly capacityFromKnownItems: boolean;
}

export interface Agreement {
  readonly status: 'agrees' | 'differs';
  readonly modelValue: number;
  readonly blackboardValue: number;
  readonly unit: 'points' | 'pct';
  readonly delta: number;
  /** Empty when `status` is `agrees`. */
  readonly reasons: readonly DeltaReason[];
}

export interface NotComputedResult {
  readonly state: 'not_computable';
  readonly reason: NotComputableReason;
  /** Component names; empty unless `reason` is `manual_unscored`. */
  readonly unscoredManual: readonly string[];
}

export interface ComputedResult {
  readonly state: 'computed';
  readonly standings: Readonly<Record<Projection, Standing>>;
  readonly components: readonly ComponentResult[];
  readonly unlinkedScoredKeys: readonly string[];
  readonly usesHypotheticals: boolean;
  readonly agreement: Agreement | null;
}

export type ModelResult = NotComputedResult | ComputedResult;

export type TargetResult =
  | {
      readonly state: 'needed';
      readonly letter: string;
      readonly targetPct: number;
      /** Uniform fraction 0..1 of possible on every remaining slot. */
      readonly averageNeeded: number;
      readonly remainingCount: number;
      /** Remaining capacity ÷ denominator, 0..1. */
      readonly remainingShare: number;
    }
  | { readonly state: 'unreachable'; readonly letter: string; readonly bestCase: Standing }
  | { readonly state: 'secured'; readonly letter: string; readonly worstCase: Standing }
  | { readonly state: 'no_remaining_work'; readonly letter: string; readonly current: Standing }
  | { readonly state: 'not_computable'; readonly reason: NotComputableReason };
