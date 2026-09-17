/**
 * The shape of one grade-method comparison fixture (Phase 12b, task G-0).
 *
 * Deliberately declared here rather than imported from `@/lib/grade-model`:
 * the suite exists to decide whether that engine survives, so its fixtures must
 * not break if it is deleted. `methods.ts` is the only file that touches the
 * engine, and its adapter type-checks this shape against `ModelInput`.
 *
 * Every fixture is DUMMY DATA — hand-built to probe one rule. No figure here
 * comes from Blackboard, and nothing in this directory reaches a screen.
 */

export type FixtureMethod = 'weighted_pct' | 'points' | 'qualitative' | 'unknown';

export type FixtureAggregation =
  | 'sum'
  | 'average'
  | 'average_drop_lowest'
  | 'rank_weighted'
  | 'normalized'
  | 'single'
  | 'manual'
  | 'unknown';

export type FixtureConfidence = 'confirmed' | 'tentative' | 'inferred';

export interface FixtureLetterStep {
  readonly min: number;
  readonly letter: string;
}

/** `grading_schemes`. */
export interface FixtureScheme {
  readonly courseId: string;
  readonly method: FixtureMethod;
  readonly totalPoints: number | null;
  readonly gradedOutOf: number | null;
  readonly letterScale: readonly FixtureLetterStep[];
}

/** `grade_components` — one syllabus part. */
export interface FixtureComponent {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly parentId: number | null;
  readonly weightPct: number | null;
  readonly points: number | null;
  readonly countExpected: number | null;
  readonly aggregation: FixtureAggregation;
  readonly dropLowest: number;
  readonly rankWeights: readonly number[] | null;
  readonly normalizeTo: number | null;
  readonly isExtraCredit: boolean;
}

/** One `v_grade_model_items` row — a gradebook column and its link to a part. */
export interface FixtureItem {
  readonly key: string;
  readonly componentId: number | null;
  readonly linkSource: 'override' | 'assignment' | null;
  readonly linkConfidence: FixtureConfidence | null;
  readonly excluded: boolean;
  readonly name: string;
  readonly possible: number | null;
  readonly score: number | null;
  readonly exempt: boolean;
  readonly kind: 'item' | 'attendance' | 'placeholder';
  readonly isExtraCredit: boolean;
  readonly dueAt: string | null;
}

/** The one input shape all three methods read. */
export interface FixtureInput {
  readonly scheme: FixtureScheme | null;
  readonly components: readonly FixtureComponent[];
  readonly items: readonly FixtureItem[];
}

/**
 * The hand-derived answer.
 *
 * `not_computed` is a real answer, not a gap: a course graded qualitatively,
 * or one where nothing that counts has been graded, has no grade so far, and a
 * method that prints a number there has invented one.
 */
export type Truth =
  | { readonly state: 'computed'; readonly pct: number }
  | { readonly state: 'not_computed'; readonly why: string };

export interface ComparisonFixture {
  /** Stable id; also the row label in the report. */
  readonly id: string;
  readonly title: string;
  /** What this fixture is here to separate. One short phrase for the report. */
  readonly probes: string;
  readonly input: FixtureInput;
  readonly truth: Truth;
  /**
   * The derivation, written out as arithmetic. It calls none of the three
   * implementations, so asserting `derivation() === truth.pct` proves the
   * declared truth is the arithmetic in the comment above it and nothing else.
   * Null when the truth is that there is no grade.
   */
  readonly derivation: () => number | null;
  /** The same derivation in words, for the report. */
  readonly derivationText: string;
}
