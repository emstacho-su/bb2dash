/**
 * bb2dash — grade model query layer (Phase 10b, R-11 (c), R-12).
 *
 * Conventions follow `queries.grades.ts`: a greppable key namespace
 * (`gradeModelKeys`), `*Options()` returning `queryOptions`, throw on error, and
 * no fabricated fallbacks. The pure row types and the engine adapter
 * (`toModelInput`, `schemeCourseIdFor`) live in `grade-model-input.ts` and are
 * re-exported here, so screens import one module.
 *
 * READS — V-1's `grading_schemes` / `grade_components`, and migration 058's
 * three views. The views' generated row types are all-nullable, so each view
 * read carries one documented cast to the hand-narrowed Contract shape.
 *
 * WRITES — exactly two tables, both Stack's own state from migration 057:
 * `grade_scenarios` (what-if values and the target letter) and
 * `grade_column_links` ("Counts toward…" / "Not graded"). Nothing here writes
 * `assignments`, `assignment_progress`, `bb_gradebook`, `grading_schemes` or
 * `grade_components`; `web/test/grade-model.audits.test.ts` greps for it.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { shellCacheKey } from './course-dimension';
import {
  parseItemScores,
  type GradeComponentRow,
  type GradeModelItemRow,
  type GradeModelTotalRow,
  type GradeScenarioRow,
  type GradeSchemeBundle,
  type GradebookHistoryRow,
  type GradingSchemeRow,
} from './grade-model-input';
import type { LinkTarget } from './grade-model-view';

export * from './grade-model-input';

/* ---------------------------------------------------------------------------
 * Column lists — one literal each, so the typed client can check them
 * ------------------------------------------------------------------------ */

const SCHEME_COLUMNS = 'course_id, method, total_points, graded_out_of, letter_scale';
const COMPONENT_COLUMNS =
  'id, course_id, code, name, parent_id, weight_pct, points, count_expected, aggregation, drop_lowest, rank_weights, normalize_to, is_extra_credit';
const SCENARIO_COLUMNS = 'course_id, item_scores, target_letter, updated_at';

/** Scheme rows and gradebook-derived rows only move on a sync or a V-1 edit. */
const MODEL_STALE_MS = 5 * 60 * 1000;

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const gradeModelKeys = {
  all: () => ['grade-model'] as const,
  scheme: (schemeCourseId: string) => ['grade-model', 'scheme', schemeCourseId] as const,
  schemesFor: (ids: readonly string[]) => ['grade-model', 'schemes-for', shellCacheKey(ids)] as const,
  items: (schemeCourseId: string) => ['grade-model', 'items', schemeCourseId] as const,
  itemsFor: (ids: readonly string[]) => ['grade-model', 'items-for', shellCacheKey(ids)] as const,
  total: (schemeCourseId: string) => ['grade-model', 'total', schemeCourseId] as const,
  totalsFor: (ids: readonly string[]) => ['grade-model', 'totals-for', shellCacheKey(ids)] as const,
  scenario: (schemeCourseId: string) => ['grade-model', 'scenario', schemeCourseId] as const,
  scenariosFor: (ids: readonly string[]) => ['grade-model', 'scenarios-for', shellCacheKey(ids)] as const,
  history: (shellIds: readonly string[]) => ['grade-model', 'history', shellCacheKey(shellIds)] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Row mapping
 * ------------------------------------------------------------------------ */

function toScenarioRow(row: {
  course_id: string;
  item_scores: unknown;
  target_letter: string | null;
  updated_at: string;
}): GradeScenarioRow {
  return {
    course_id: row.course_id,
    item_scores: parseItemScores(row.item_scores),
    target_letter: row.target_letter,
    updated_at: row.updated_at,
  };
}

/** Group the bulk reads by scheme course, preserving each list's order. */
export function groupByCourse<T>(rows: readonly T[], courseOf: (row: T) => string): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>(
    (acc, row) => ({ ...acc, [courseOf(row)]: [...(acc[courseOf(row)] ?? []), row] }),
    {},
  );
}

/* ---------------------------------------------------------------------------
 * Reads — one course
 * ------------------------------------------------------------------------ */

/** The scheme row (null when V-1 recorded none) and its components. */
export function gradingSchemeOptions(schemeCourseId: string | null) {
  return queryOptions({
    queryKey: gradeModelKeys.scheme(schemeCourseId ?? 'none'),
    queryFn: async (): Promise<GradeSchemeBundle> => {
      const supabase = getSupabaseBrowserClient();
      const id = schemeCourseId as string;
      const schemeRes = await supabase.from('grading_schemes').select(SCHEME_COLUMNS).eq('course_id', id).maybeSingle();
      if (schemeRes.error) throw schemeRes.error;
      const compRes = await supabase
        .from('grade_components')
        .select(COMPONENT_COLUMNS)
        .eq('course_id', id)
        .order('id', { ascending: true });
      if (compRes.error) throw compRes.error;
      return { scheme: schemeRes.data ?? null, components: compRes.data ?? [] };
    },
    enabled: Boolean(schemeCourseId),
    staleTime: MODEL_STALE_MS,
  });
}

/** Every model item of one scheme course, from every one of its shells. */
export function gradeModelItemsOptions(schemeCourseId: string | null) {
  return queryOptions({
    queryKey: gradeModelKeys.items(schemeCourseId ?? 'none'),
    queryFn: async (): Promise<GradeModelItemRow[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('v_grade_model_items')
        .select('*')
        .eq('scheme_course_id', schemeCourseId as string)
        .order('item_key', { ascending: true });
      if (error) throw error;
      // Narrowed to the frozen Contract shape — see the header.
      return (data ?? []) as unknown as GradeModelItemRow[];
    },
    enabled: Boolean(schemeCourseId),
    staleTime: MODEL_STALE_MS,
  });
}

/** Blackboard's published total for the scheme course, or null. */
export function gradeModelTotalOptions(schemeCourseId: string | null) {
  return queryOptions({
    queryKey: gradeModelKeys.total(schemeCourseId ?? 'none'),
    queryFn: async (): Promise<GradeModelTotalRow | null> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('v_grade_model_total')
        .select('*')
        .eq('scheme_course_id', schemeCourseId as string)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as GradeModelTotalRow | null;
    },
    enabled: Boolean(schemeCourseId),
    staleTime: MODEL_STALE_MS,
  });
}

/** The saved scenario. No row is an empty scenario, not an error. */
export function gradeScenarioOptions(schemeCourseId: string | null) {
  return queryOptions({
    queryKey: gradeModelKeys.scenario(schemeCourseId ?? 'none'),
    queryFn: async (): Promise<GradeScenarioRow | null> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('grade_scenarios')
        .select(SCENARIO_COLUMNS)
        .eq('course_id', schemeCourseId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? toScenarioRow(data) : null;
    },
    enabled: Boolean(schemeCourseId),
    staleTime: 60 * 1000,
  });
}

/** Score history for a display course's shells. */
export function gradeHistoryOptions(shellIds: readonly string[]) {
  return queryOptions({
    queryKey: gradeModelKeys.history(shellIds),
    queryFn: async (): Promise<GradebookHistoryRow[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('v_gradebook_history')
        .select('*')
        .in('shell_course_id', shellIds as string[])
        .order('shell_course_id', { ascending: true })
        .order('column_id', { ascending: true })
        .order('seen_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as GradebookHistoryRow[];
    },
    enabled: shellIds.length > 0,
    staleTime: MODEL_STALE_MS,
  });
}

/* ---------------------------------------------------------------------------
 * Reads — every course at once, so /grades fires one request per relation
 * ------------------------------------------------------------------------ */

export function gradingSchemesForCoursesOptions(ids: readonly string[]) {
  return queryOptions({
    queryKey: gradeModelKeys.schemesFor(ids),
    queryFn: async (): Promise<Record<string, GradeSchemeBundle>> => {
      const supabase = getSupabaseBrowserClient();
      const schemeRes = await supabase.from('grading_schemes').select(SCHEME_COLUMNS).in('course_id', ids as string[]);
      if (schemeRes.error) throw schemeRes.error;
      const compRes = await supabase
        .from('grade_components')
        .select(COMPONENT_COLUMNS)
        .in('course_id', ids as string[])
        .order('id', { ascending: true });
      if (compRes.error) throw compRes.error;
      const schemes: GradingSchemeRow[] = schemeRes.data ?? [];
      const components = groupByCourse<GradeComponentRow>(compRes.data ?? [], (c) => c.course_id);
      return Object.fromEntries(
        ids.map((id) => [id, {
          scheme: schemes.find((s) => s.course_id === id) ?? null,
          components: components[id] ?? [],
        }]),
      );
    },
    enabled: ids.length > 0,
    staleTime: MODEL_STALE_MS,
  });
}

export function gradeModelItemsForCoursesOptions(ids: readonly string[]) {
  return queryOptions({
    queryKey: gradeModelKeys.itemsFor(ids),
    queryFn: async (): Promise<GradeModelItemRow[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('v_grade_model_items')
        .select('*')
        .in('scheme_course_id', ids as string[])
        .order('item_key', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as GradeModelItemRow[];
    },
    enabled: ids.length > 0,
    staleTime: MODEL_STALE_MS,
  });
}

export function gradeModelTotalsForCoursesOptions(ids: readonly string[]) {
  return queryOptions({
    queryKey: gradeModelKeys.totalsFor(ids),
    queryFn: async (): Promise<GradeModelTotalRow[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('v_grade_model_total')
        .select('*')
        .in('scheme_course_id', ids as string[]);
      if (error) throw error;
      return (data ?? []) as unknown as GradeModelTotalRow[];
    },
    enabled: ids.length > 0,
    staleTime: MODEL_STALE_MS,
  });
}

export function gradeScenariosForCoursesOptions(ids: readonly string[]) {
  return queryOptions({
    queryKey: gradeModelKeys.scenariosFor(ids),
    queryFn: async (): Promise<GradeScenarioRow[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('grade_scenarios')
        .select(SCENARIO_COLUMNS)
        .in('course_id', ids as string[]);
      if (error) throw error;
      return (data ?? []).map(toScenarioRow);
    },
    enabled: ids.length > 0,
    staleTime: 60 * 1000,
  });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export const useGradingScheme = (id: string | null) => useQuery(gradingSchemeOptions(id));
export const useGradeModelItems = (id: string | null) => useQuery(gradeModelItemsOptions(id));
export const useGradeModelTotal = (id: string | null) => useQuery(gradeModelTotalOptions(id));
export const useGradeScenario = (id: string | null) => useQuery(gradeScenarioOptions(id));
export const useGradeHistory = (shellIds: readonly string[]) => useQuery(gradeHistoryOptions(shellIds));
export const useGradingSchemesForCourses = (ids: readonly string[]) =>
  useQuery(gradingSchemesForCoursesOptions(ids));
export const useGradeModelItemsForCourses = (ids: readonly string[]) =>
  useQuery(gradeModelItemsForCoursesOptions(ids));
export const useGradeModelTotalsForCourses = (ids: readonly string[]) =>
  useQuery(gradeModelTotalsForCoursesOptions(ids));
export const useGradeScenariosForCourses = (ids: readonly string[]) =>
  useQuery(gradeScenariosForCoursesOptions(ids));

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------ */

export interface SaveScenarioVars {
  /** The scheme course (GEO 103: the lecture shell). */
  courseId: string;
  itemScores: Readonly<Record<string, number>>;
  targetLetter: string | null;
}

/**
 * Boundary check before a scenario write. The database refuses a non-number or
 * a negative score too (057's check); refusing here means the owner sees why
 * instead of a constraint name. The upper bound needs the item's possible, so
 * the what-if cell enforces it before it ever calls a save.
 */
export function validateScenario(vars: SaveScenarioVars): SaveScenarioVars {
  if (!vars.courseId) throw new Error('No course to save the scenario against.');
  for (const [key, value] of Object.entries(vars.itemScores)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`The what-if value for ${key} must be a number of 0 or more.`);
    }
  }
  const letter = vars.targetLetter?.trim() ?? null;
  if (letter !== null && (letter.length < 1 || letter.length > 3)) {
    throw new Error('A target letter is one to three characters.');
  }
  return { courseId: vars.courseId, itemScores: { ...vars.itemScores }, targetLetter: letter };
}

type ScenarioSnapshot = { key: readonly unknown[]; previous: GradeScenarioRow | null | undefined };

/** Invalidate both scenario caches: this course's and /grades' bulk read. */
function invalidateScenarios(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['grade-model', 'scenario'] });
  void queryClient.invalidateQueries({ queryKey: ['grade-model', 'scenarios-for'] });
}

/**
 * Upsert the course's one scenario row. Optimistic: the cache takes the new
 * row at once, so the standing moves as soon as a value is committed (on blur
 * or Enter — the cell never calls this per keystroke), and a failed write puts
 * the previous row back.
 */
export function useSaveScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: SaveScenarioVars): Promise<void> => {
      const clean = validateScenario(vars);
      const { error } = await getSupabaseBrowserClient()
        .from('grade_scenarios')
        .upsert(
          { course_id: clean.courseId, item_scores: clean.itemScores, target_letter: clean.targetLetter },
          { onConflict: 'course_id' },
        );
      if (error) throw error;
    },
    onMutate: async (vars: SaveScenarioVars): Promise<ScenarioSnapshot> => {
      const key = gradeModelKeys.scenario(vars.courseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GradeScenarioRow | null>(key);
      const next: GradeScenarioRow = {
        course_id: vars.courseId,
        item_scores: { ...vars.itemScores },
        target_letter: vars.targetLetter,
        updated_at: previous?.updated_at ?? new Date().toISOString(),
      };
      queryClient.setQueryData<GradeScenarioRow | null>(key, next);
      return { key, previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => invalidateScenarios(queryClient),
  });
}

/** Delete the course's scenario row: every what-if value and the target letter. */
export function useResetScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId }: { courseId: string }): Promise<void> => {
      if (!courseId) throw new Error('No course to reset.');
      const { error } = await getSupabaseBrowserClient().from('grade_scenarios').delete().eq('course_id', courseId);
      if (error) throw error;
    },
    onMutate: async ({ courseId }: { courseId: string }): Promise<ScenarioSnapshot> => {
      const key = gradeModelKeys.scenario(courseId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GradeScenarioRow | null>(key);
      queryClient.setQueryData<GradeScenarioRow | null>(key, null);
      return { key, previous };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => invalidateScenarios(queryClient),
  });
}

export interface LinkColumnVars {
  /** The shell the column lives in — not the scheme course. */
  shellCourseId: string;
  columnId: string;
  target: LinkTarget;
}

/**
 * Write or clear Stack's link for one column.
 *
 * The payload is only the key and the target. Both target columns are sent
 * explicitly (`component_id` + `excluded: false`, or `component_id: null` +
 * `excluded: true`): PostgREST's upsert only updates the columns it is given,
 * so switching a "Not graded" row to a component without `excluded: false`
 * would trip 057's one-target check. Whether the component belongs to this
 * shell's scheme is the database trigger's call, and its refusal reaches the
 * picker as the mutation's error.
 */
export function useLinkColumn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shellCourseId, columnId, target }: LinkColumnVars): Promise<void> => {
      if (!shellCourseId || !columnId) throw new Error('No column to link.');
      const table = getSupabaseBrowserClient().from('grade_column_links');
      if (target.kind === 'clear') {
        const { error } = await table.delete().eq('course_id', shellCourseId).eq('column_id', columnId);
        if (error) throw error;
        return;
      }
      if (target.kind === 'component' && !Number.isInteger(target.componentId)) {
        throw new Error('Pick a grade component.');
      }
      const row: { course_id: string; column_id: string; component_id: number | null; excluded: boolean } =
        target.kind === 'component'
          ? { course_id: shellCourseId, column_id: columnId, component_id: target.componentId, excluded: false }
          : { course_id: shellCourseId, column_id: columnId, component_id: null, excluded: true };
      const { error } = await table.upsert(row, { onConflict: 'course_id,column_id' });
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grade-model', 'items'] });
      void queryClient.invalidateQueries({ queryKey: ['grade-model', 'items-for'] });
    },
  });
}
