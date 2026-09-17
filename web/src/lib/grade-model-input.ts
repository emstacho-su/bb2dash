/**
 * bb2dash — grade model row types and the adapter into the engine (Phase 10b, R-12).
 *
 * Pure: no React, no TanStack Query, no Supabase. `queries.grade-model.ts`
 * re-exports every symbol here, so screens import from there; this split only
 * keeps both files inside the project's size rule and makes the adapter
 * directly unit-testable (the `course-dimension.ts` precedent).
 *
 * ROW TYPES — `v_grade_model_items` and `v_gradebook_history` are created by
 * migration 058. The generated view types make every column nullable (Postgres
 * reports no not-null on a view), so the interfaces below are hand-narrowed to
 * the frozen column lists in `docs/planning/68_PHASE10B_grade_model.md` §058 —
 * the 10a precedent.
 *
 * Phase 12b (G-1): `GradeScenarioRow`, `GradeModelTotalRow` and their parsers
 * went with the what-if layer and the agrees-with-Blackboard sentence.
 * Blackboard's own total still reaches the screen — through `v_course_grade`
 * in `queries.grades.ts`, which is where 10a always read it.
 *
 * HONESTY — nothing here computes a grade. `toModelInput` only reshapes rows
 * into the engine's `ModelInput`; every sum is the engine's. Numbers are never
 * rounded here: display rounds once, in the component.
 */

import type {
  Aggregation,
  ComponentInput,
  Confidence,
  ItemInput,
  LetterStep,
  Method,
  ModelInput,
  SchemeInput,
} from './grade-model/types';
import type { Tables } from './queries';

/* ---------------------------------------------------------------------------
 * Row types
 * ------------------------------------------------------------------------ */

/** The `grading_schemes` columns the model reads. V-1's table: read, never written. */
export type GradingSchemeRow = Pick<
  Tables<'grading_schemes'>,
  'course_id' | 'method' | 'total_points' | 'graded_out_of' | 'letter_scale'
>;

/** The `grade_components` columns the model reads. V-1's table: read, never written. */
export type GradeComponentRow = Pick<
  Tables<'grade_components'>,
  | 'id'
  | 'course_id'
  | 'code'
  | 'name'
  | 'parent_id'
  | 'weight_pct'
  | 'points'
  | 'count_expected'
  | 'aggregation'
  | 'drop_lowest'
  | 'rank_weights'
  | 'normalize_to'
  | 'is_extra_credit'
>;

export type ItemColumnKind = 'item' | 'attendance' | 'placeholder';
export type LinkSource = 'override' | 'assignment';

/** One row of `v_grade_model_items` (058). */
export interface GradeModelItemRow {
  scheme_course_id: string;
  /** `col:<shell_course_id>:<column_id>` or `asg:<assignment id>`. */
  item_key: string;
  assignment_id: string | null;
  shell_course_id: string;
  /** Null for a placeholder. */
  column_id: string | null;
  component_id: number | null;
  link_source: LinkSource | null;
  link_confidence: Confidence | null;
  excluded: boolean;
  name: string;
  possible: number | null;
  /** Blackboard's effective_score. Null means ungraded, never zero. */
  score: number | null;
  is_exempt: boolean;
  column_kind: ItemColumnKind;
  is_extra_credit: boolean;
  due_at: string | null;
  seen_at: string | null;
}

/** One row of `v_gradebook_history` (058). */
export interface GradebookHistoryRow {
  shell_course_id: string;
  column_id: string;
  name: string;
  run_id: string;
  seen_at: string;
  score: number | null;
  possible: number | null;
  previous_score: number | null;
}

/** The scheme row and its components, fetched together. */
export interface GradeSchemeBundle {
  scheme: GradingSchemeRow | null;
  components: readonly GradeComponentRow[];
}

/* ---------------------------------------------------------------------------
 * Small parsers — every value from the database is checked, never trusted
 * ------------------------------------------------------------------------ */

const METHODS: readonly Method[] = ['weighted_pct', 'points', 'qualitative', 'unknown'];
const AGGREGATIONS: readonly Aggregation[] = [
  'sum',
  'average',
  'average_drop_lowest',
  'rank_weighted',
  'normalized',
  'single',
  'manual',
  'unknown',
];
const CONFIDENCES: readonly Confidence[] = ['confirmed', 'tentative', 'inferred'];

/** A Postgres numeric may arrive as a number or as a string; anything else is null. */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asMethod(value: unknown): Method {
  return METHODS.includes(value as Method) ? (value as Method) : 'unknown';
}

function asAggregation(value: unknown): Aggregation {
  return AGGREGATIONS.includes(value as Aggregation) ? (value as Aggregation) : 'unknown';
}

export function asConfidence(value: unknown): Confidence | null {
  return CONFIDENCES.includes(value as Confidence) ? (value as Confidence) : null;
}

/** `letter_scale` jsonb → steps, descending by `min`. Malformed entries are dropped. */
export function parseLetterScale(value: unknown): LetterStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): LetterStep | null => {
      if (typeof entry !== 'object' || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const min = toNumberOrNull(record.min);
      const letter = typeof record.letter === 'string' ? record.letter.trim() : '';
      return min === null || letter === '' ? null : { min, letter };
    })
    .filter((step): step is LetterStep => step !== null)
    .sort((a, b) => b.min - a.min);
}

/** `rank_weights` jsonb → numbers, or null when absent or malformed. */
export function parseRankWeights(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const weights = value.map(toNumberOrNull);
  return weights.every((w): w is number => w !== null) ? weights : null;
}

/* ---------------------------------------------------------------------------
 * The adapter
 * ------------------------------------------------------------------------ */

function toSchemeInput(row: GradingSchemeRow): SchemeInput {
  return {
    courseId: row.course_id,
    method: asMethod(row.method),
    totalPoints: toNumberOrNull(row.total_points),
    gradedOutOf: toNumberOrNull(row.graded_out_of),
    letterScale: parseLetterScale(row.letter_scale),
  };
}

function toComponentInput(row: GradeComponentRow): ComponentInput {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    parentId: row.parent_id,
    weightPct: toNumberOrNull(row.weight_pct),
    points: toNumberOrNull(row.points),
    countExpected: toNumberOrNull(row.count_expected),
    aggregation: asAggregation(row.aggregation),
    dropLowest: toNumberOrNull(row.drop_lowest) ?? 0,
    rankWeights: parseRankWeights(row.rank_weights),
    normalizeTo: toNumberOrNull(row.normalize_to),
    isExtraCredit: row.is_extra_credit === true,
  };
}

function toItemInput(row: GradeModelItemRow): ItemInput {
  const linkSource = row.link_source === 'override' || row.link_source === 'assignment'
    ? row.link_source
    : null;
  return {
    key: row.item_key,
    componentId: row.component_id,
    linkSource,
    linkConfidence: asConfidence(row.link_confidence),
    excluded: row.excluded === true,
    name: row.name,
    possible: toNumberOrNull(row.possible),
    score: toNumberOrNull(row.score),
    exempt: row.is_exempt === true,
    kind: row.column_kind,
    isExtraCredit: row.is_extra_credit === true,
    dueAt: row.due_at,
    seenAt: row.seen_at,
  };
}

/**
 * Rows → the engine's `ModelInput`. Items from every shell of the scheme course
 * arrive in one list (GEO 103's recitation columns sit beside the lecture's),
 * because `v_grade_model_items` already keys them by `scheme_course_id`.
 */
export function toModelInput(
  scheme: GradingSchemeRow | null,
  components: readonly GradeComponentRow[],
  items: readonly GradeModelItemRow[],
): ModelInput {
  return {
    scheme: scheme ? toSchemeInput(scheme) : null,
    components: components.map(toComponentInput),
    items: items.map(toItemInput),
  };
}

/**
 * The scheme course a display course's model is keyed on: the shell with no
 * `parent_course_id`.
 *
 * `v_course_display.display_id` is `coalesce(parent_course_id, id)` (migration
 * 028), so it already *is* that shell — GEO 103's lecture, never its
 * recitation. The generated view type makes it nullable; with no display id, a
 * single-shell course is its own scheme course and anything else is unknown.
 */
export function schemeCourseIdFor(
  display: { display_id: string | null; shell_ids: readonly string[] | null } | null | undefined,
): string | null {
  if (!display) return null;
  if (display.display_id) return display.display_id;
  const shells = display.shell_ids ?? [];
  return shells.length === 1 ? shells[0] : null;
}
