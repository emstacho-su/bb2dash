/**
 * bb2dash — grade model query layer (Phase 10b, R-11 (c), R-12).
 *
 * Conventions follow `queries.grades.ts`: a greppable key namespace
 * (`gradeModelKeys`), `*Options()` returning `queryOptions`, throw on error, and
 * no fabricated fallbacks. The pure row types and the engine adapter
 * (`toModelInput`, `schemeCourseIdFor`) live in `grade-model-input.ts` and are
 * re-exported here, so screens import one module.
 *
 * READS — V-1's `grading_schemes` / `grade_components`, and two of migration
 * 058's three views. The views' generated row types are all-nullable, so each
 * view read carries one documented cast to the hand-narrowed Contract shape.
 * Phase 12b (G-1) dropped the `v_grade_model_total` reads with the
 * agrees-with-Blackboard sentence; Blackboard's own total still reaches the
 * screen through `v_course_grade` in `queries.grades.ts`, where 10a read it.
 *
 * WRITES — exactly one table, Stack's own state from migration 057:
 * `grade_column_links` ("Counts toward…" / "Not graded"). The
 * `grade_scenarios` reads and writes went with the what-if layer; the table
 * itself stays in the database, unused. Nothing here writes
 * `assignments`, `assignment_progress`, `bb_gradebook`, `grading_schemes` or
 * `grade_components`; `web/test/grade-model.audits.test.ts` greps for it.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { shellCacheKey } from './course-dimension';
import {
  type GradeComponentRow,
  type GradeModelItemRow,
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
  history: (shellIds: readonly string[]) => ['grade-model', 'history', shellCacheKey(shellIds)] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Row mapping
 * ------------------------------------------------------------------------ */

/**
 * Group the bulk reads by scheme course, preserving each list's order. One
 * pass over a local map (R2-14: the spread-per-row reduce was quadratic), and a
 * new object out — the input is never touched.
 */
export function groupByCourse<T>(rows: readonly T[], courseOf: (row: T) => string): Record<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const course = courseOf(row);
    const list = groups.get(course);
    if (list) list.push(row);
    else groups.set(course, [row]);
  }
  return Object.fromEntries(groups);
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
      // The two reads are independent: in parallel (R2-14).
      const [schemeRes, compRes] = await Promise.all([
        supabase.from('grading_schemes').select(SCHEME_COLUMNS).eq('course_id', id).maybeSingle(),
        supabase.from('grade_components').select(COMPONENT_COLUMNS).eq('course_id', id).order('id', { ascending: true }),
      ]);
      if (schemeRes.error) throw schemeRes.error;
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
      const [schemeRes, compRes] = await Promise.all([
        supabase.from('grading_schemes').select(SCHEME_COLUMNS).in('course_id', ids as string[]),
        supabase
          .from('grade_components')
          .select(COMPONENT_COLUMNS)
          .in('course_id', ids as string[])
          .order('id', { ascending: true }),
      ]);
      if (schemeRes.error) throw schemeRes.error;
      if (compRes.error) throw compRes.error;
      const schemes = new Map<string, GradingSchemeRow>((schemeRes.data ?? []).map((s) => [s.course_id, s]));
      const components = groupByCourse<GradeComponentRow>(compRes.data ?? [], (c) => c.course_id);
      return Object.fromEntries(
        ids.map((id) => [id, { scheme: schemes.get(id) ?? null, components: components[id] ?? [] }]),
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

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export const useGradingScheme = (id: string | null) => useQuery(gradingSchemeOptions(id));
export const useGradeModelItems = (id: string | null) => useQuery(gradeModelItemsOptions(id));
export const useGradeHistory = (shellIds: readonly string[]) => useQuery(gradeHistoryOptions(shellIds));
export const useGradingSchemesForCourses = (ids: readonly string[]) =>
  useQuery(gradingSchemesForCoursesOptions(ids));
export const useGradeModelItemsForCourses = (ids: readonly string[]) =>
  useQuery(gradeModelItemsForCoursesOptions(ids));

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------ */

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
