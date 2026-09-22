/**
 * bb2dash — grade model types.
 *
 * Phase 10b froze this as a contract mirroring
 * `docs/planning/sprint-1-hub/briefs/68_PHASE10B_grade_model.md` §Engine. Phase 12b (G-1,
 * P-grades-3) reverses part of that brief on Stack's instruction — "keep the
 * engine's math, remove the layer around it" — so what is left here is the
 * arithmetic's own vocabulary and nothing else.
 *
 * Gone with the layer: `Scenario` and what-if values, `Projection` (only graded
 * so far survives), `TargetResult` and the solver, `BlackboardTotal` /
 * `Agreement` / `DeltaReason` and the agrees-with-Blackboard sentence,
 * `ItemStates`, the `manual_unscored` reason and the `muted` component state.
 * The reasons why are in `docs/planning/sprint-1-hub/evidence/80e_GRADE_METHOD_COMPARISON.md`.
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
  /**
   * When a sync last saw this row (`bb_raw.captured_at`). Phase 12b: the
   * headline figure is shown "as of" the newest `seenAt` among the rows that
   * went into it, so the reader knows how old the number is.
   */
  readonly seenAt: string | null;
}

export interface ModelInput {
  readonly scheme: SchemeInput | null;
  readonly components: readonly ComponentInput[];
  readonly items: readonly ItemInput[];
}

export type NotComputableReason =
  | 'no_scheme'
  | 'qualitative_method'
  | 'unknown_method'
  | 'unknown_aggregation'
  | 'nothing_graded';

export interface NotComputedResult {
  readonly state: 'not_computable';
  readonly reason: NotComputableReason;
}

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
  readonly state: 'graded' | 'partly_graded' | 'ungraded';
  readonly earned: number;
  readonly gradedCap: number;
  readonly cap: number;
  readonly capacityFromKnownItems: boolean;
}
