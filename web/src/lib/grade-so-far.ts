/**
 * bb2dash — two candidate "grade so far" calculations (Phase 12b, task G-0).
 *
 * Stack's answer 1 (`docs/planning/80c_PHASE12B_page_pass.md`) asks for a
 * measured comparison before any grade code is removed: the raw points ratio,
 * a slim weighted calculation, and the Phase 10b engine, all run over the same
 * input and scored against hand-derived truths. This module holds the first
 * two. The third is the engine in `grade-model/`, reached through an adapter in
 * `web/test/grade-method-comparison/`.
 *
 * Pure: no I/O, no clock, no React, no mutation of its input. Every number is
 * unrounded — display rounds once, in a component.
 *
 * THE INPUT SHAPE is the one the brief names: the latest gradebook rows, the
 * syllabus's `grade_components`, and the column → part links that join them.
 * The field names mirror `grade_components` / `v_grade_model_items` so the same
 * rows feed all three methods without a second adapter. Nothing here reads a
 * field the database does not hold.
 *
 * WHAT COUNTS is Stack's answer 2: an item enters a ratio only when it has a
 * positive `possible`, is not exempt and is not excluded. A zero-point
 * completion column is a tick, never a fraction. An ungraded item is absent
 * from both sides of every ratio — "so far" means so far.
 */

/* ---------------------------------------------------------------------------
 * The shared input
 * ------------------------------------------------------------------------ */

/** `grading_schemes.method`. */
export type GradeSoFarMethod = 'weighted_pct' | 'points' | 'qualitative' | 'unknown';

/** The scheme fields these two calculations read. */
export interface GradeSoFarScheme {
  readonly courseId: string;
  readonly method: GradeSoFarMethod;
  readonly totalPoints: number | null;
  readonly gradedOutOf: number | null;
}

/** One `grade_components` row: a syllabus part. */
export interface GradeSoFarComponent {
  readonly id: number;
  readonly name: string;
  /** A sub-part rolls its items up into its top-level ancestor. */
  readonly parentId: number | null;
  readonly weightPct: number | null;
  readonly points: number | null;
  readonly isExtraCredit: boolean;
}

/** One gradebook column (or placeholder) with its link to a part. */
export interface GradeSoFarItem {
  readonly key: string;
  /** The part this column counts toward; null when nothing links it. */
  readonly componentId: number | null;
  /** Stack marked the column "Not graded". */
  readonly excluded: boolean;
  readonly possible: number | null;
  /** Blackboard's effective score. Null means ungraded, never zero. */
  readonly score: number | null;
  readonly exempt: boolean;
}

export interface GradeSoFarInput {
  readonly scheme: GradeSoFarScheme | null;
  readonly components: readonly GradeSoFarComponent[];
  readonly items: readonly GradeSoFarItem[];
}

/* ---------------------------------------------------------------------------
 * The result
 * ------------------------------------------------------------------------ */

export type GradeSoFarReason =
  | 'no_scheme'
  | 'qualitative_method'
  | 'unknown_method'
  /** A weighted scheme whose syllabus parts carry no weights at all. */
  | 'no_weights'
  | 'nothing_graded';

export type GradeSoFar =
  | {
      readonly state: 'computed';
      /** 0..100, unrounded. Extra credit can carry it above 100. */
      readonly pct: number;
      /**
       * `earned` and `denominator` are the two sides `pct` came from, and their
       * UNIT DEPENDS ON THE METHOD: points for the two ratios, weight units for
       * the weighted calculation (a course standing at 84.5 % of a graded
       * weight of 60 reports `earned: 50.7`, not a mark out of 60). `unit` says
       * which, so nothing downstream can print one as the other — a points
       * figure the gradebook does not contain would be a fabricated number.
       */
      readonly earned: number;
      readonly denominator: number;
      readonly unit: GradeSoFarUnit;
    }
  | { readonly state: 'not_computed'; readonly reason: GradeSoFarReason };

export type GradeSoFarUnit = 'points' | 'weight';

function notComputed(reason: GradeSoFarReason): GradeSoFar {
  return { state: 'not_computed', reason };
}

function computed(earned: number, denominator: number, unit: GradeSoFarUnit): GradeSoFar {
  return { state: 'computed', pct: (earned / denominator) * 100, earned, denominator, unit };
}

function total(values: readonly number[]): number {
  return values.reduce((running, value) => running + value, 0);
}

/* ---------------------------------------------------------------------------
 * What counts
 * ------------------------------------------------------------------------ */

/** Positive `possible`, not exempt, not excluded (Stack's answer 2). */
export function isCounted(item: GradeSoFarItem): boolean {
  return (
    item.possible !== null
    && Number.isFinite(item.possible)
    && item.possible > 0
    && !item.exempt
    && !item.excluded
  );
}

/** A counted item Blackboard has actually scored. */
export function isGraded(item: GradeSoFarItem): boolean {
  return isCounted(item) && item.score !== null && Number.isFinite(item.score);
}

/** Narrowed accessors: only ever called on an item `isGraded` accepted. */
function scoreOf(item: GradeSoFarItem): number {
  return item.score as number;
}
function possibleOf(item: GradeSoFarItem): number {
  return item.possible as number;
}

/* ---------------------------------------------------------------------------
 * Method 1 — the raw points ratio
 * ------------------------------------------------------------------------ */

/**
 * Σscore ÷ Σpossible over every graded, counted column, whatever it is linked
 * to and whatever the syllabus says about weights. This is what `/grades`
 * showed before Phase 10b, and the floor the other two have to beat.
 *
 * It ignores the scheme on purpose — that is the point of the baseline — so it
 * will happily produce a number for a course that is not graded numerically at
 * all. The comparison report says where that bites.
 */
export function pointsRatio(input: GradeSoFarInput): GradeSoFar {
  const graded = input.items.filter(isGraded);
  const denominator = total(graded.map(possibleOf));
  if (graded.length === 0 || denominator <= 0) return notComputed('nothing_graded');
  return computed(total(graded.map(scoreOf)), denominator, 'points');
}

/* ---------------------------------------------------------------------------
 * Method 2 — the slim weighted calculation
 * ------------------------------------------------------------------------ */

/** A component with no parent inside this scheme. A self-parent is a root too. */
function isRoot(component: GradeSoFarComponent, byId: ReadonlyMap<number, GradeSoFarComponent>): boolean {
  return (
    component.parentId === null
    || component.parentId === component.id
    || !byId.has(component.parentId)
  );
}

/**
 * The part a component's items count toward: the OUTERMOST ancestor-or-self
 * that carries a weight. Null when nothing up the chain carries one.
 *
 * Rolling up to the top-level row instead would lose a whole subtree whenever a
 * syllabus hangs weighted sub-parts under an unweighted heading — "Final
 * project" with a 10 % proposal and a 30 % report under it. The heading has no
 * weight of its own, so every graded item beneath it would contribute 0 to both
 * sides and vanish from the figure without a word. Picking the outermost
 * weighted row keeps nested weights behaving as before (A 30 % over B 10 % is
 * still one 30 % part) and rescues that shape.
 */
function partIdOf(
  id: number,
  byId: ReadonlyMap<number, GradeSoFarComponent>,
  seen: ReadonlySet<number> = new Set<number>(),
  outermost: number | null = null,
): number | null {
  const component = byId.get(id);
  if (component === undefined || seen.has(id)) return outermost;
  const found = component.weightPct !== null ? id : outermost;
  if (isRoot(component, byId)) return found;
  return partIdOf(component.parentId as number, byId, new Set([...seen, id]), found);
}

/** A weighted component that no weighted ancestor already speaks for. */
function isPart(component: GradeSoFarComponent, byId: ReadonlyMap<number, GradeSoFarComponent>): boolean {
  return component.weightPct !== null && partIdOf(component.id, byId) === component.id;
}

interface PartRatio {
  readonly part: GradeSoFarComponent;
  /** Σscore ÷ Σpossible over the part's graded items. */
  readonly ratio: number;
}

/** Every part with at least one graded item, and that part's ratio. */
function partRatios(
  input: GradeSoFarInput,
  byId: ReadonlyMap<number, GradeSoFarComponent>,
): readonly PartRatio[] {
  const partOfItem = (item: GradeSoFarItem): number | null =>
    item.componentId === null ? null : partIdOf(item.componentId, byId);

  return input.components
    .filter((component) => isPart(component, byId))
    .flatMap((part) => {
      const graded = input.items.filter((item) => isGraded(item) && partOfItem(item) === part.id);
      const possible = total(graded.map(possibleOf));
      if (graded.length === 0 || possible <= 0) return [];
      return [{ part, ratio: total(graded.map(scoreOf)) / possible }];
    });
}

/**
 * The weighted calculation from the frozen brief:
 *
 *   part ratio = Σscore ÷ Σpossible over that part's graded, non-zero-point items
 *   course     = Σ(weight × part ratio) ÷ Σ(weights of parts with ≥ 1 graded item)
 *
 * A part nobody has graded yet is out of both sums, so the figure is always
 * "of the work that has been graded", never a projection.
 *
 * Three readings the brief leaves open, decided here and reported in
 * `80e_GRADE_METHOD_COMPARISON.md`:
 *   - an **extra-credit part** adds its weight × ratio to the numerator but not
 *     to the denominator, which is what extra credit means;
 *   - a "part" is the outermost row that carries a weight, not simply a
 *     top-level row, so weighted sub-parts under an unweighted heading still
 *     count (see `partIdOf`);
 *   - a syllabus whose rows carry no weights at all is `no_weights`, not
 *     `nothing_graded`: the gap is in the rules, not in the gradebook.
 *
 * A points-based scheme has no weights to apply, so it reduces to the ratio
 * over the columns that are linked to a part at all.
 */
export function weightedSoFar(input: GradeSoFarInput): GradeSoFar {
  const { scheme } = input;
  if (scheme === null) return notComputed('no_scheme');
  if (scheme.method === 'qualitative') return notComputed('qualitative_method');
  if (scheme.method === 'unknown') return notComputed('unknown_method');
  return scheme.method === 'points' ? linkedPointsRatio(input) : weightedParts(input);
}

function weightedParts(input: GradeSoFarInput): GradeSoFar {
  const byId = new Map(input.components.map((component) => [component.id, component]));
  // A weighted syllabus whose rows carry no weights cannot be weighted at all.
  // Saying "nothing graded" there would blame the gradebook for a gap in the
  // rules, so the two are kept apart.
  if (!input.components.some((component) => isPart(component, byId))) {
    return notComputed('no_weights');
  }

  const ratios = partRatios(input, byId);
  const weightOf = (part: GradeSoFarComponent): number => part.weightPct ?? 0;
  const denominator = total(ratios.filter((entry) => !entry.part.isExtraCredit).map((entry) => weightOf(entry.part)));
  if (denominator <= 0) return notComputed('nothing_graded');
  return computed(total(ratios.map((entry) => weightOf(entry.part) * entry.ratio)), denominator, 'weight');
}

/** Points scheme: Σscore ÷ Σpossible over graded columns that a part claims. */
function linkedPointsRatio(input: GradeSoFarInput): GradeSoFar {
  const byId = new Map(input.components.map((component) => [component.id, component]));
  const linked = input.items.filter(
    (item) => isGraded(item) && item.componentId !== null && byId.has(item.componentId),
  );
  const denominator = total(linked.map(possibleOf));
  if (linked.length === 0 || denominator <= 0) return notComputed('nothing_graded');
  return computed(total(linked.map(scoreOf)), denominator, 'points');
}
