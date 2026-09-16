/**
 * bb2dash — the saved what-if scenario: its writes (Phase 10b, round 2 R2-5).
 *
 * One `grade_scenarios` row per scheme course holds every what-if value and the
 * target letter, and each save upserts the whole row. The first version built
 * that row from the values a screen rendered, so three quick commits could
 * overwrite each other: save B carried a map from before A landed, a refetch
 * during a pending save put an old row back under the cell, and a failed save
 * rolled the cache back past saves that had succeeded since. This module fixes
 * all three:
 *
 *   1. Serialised per course. Saves and resets share one TanStack mutation
 *      scope (`grade-scenario:<course>`), so they reach the database in the
 *      order they were made and never overlap.
 *   2. A save carries a *patch* (one item's value, or the letter), not a map.
 *      Its row is built when the save actually runs, from the current cache —
 *      which already holds every earlier patch — with its own patch applied on
 *      top, so nothing committed before it can be lost.
 *   3. The cache is refetched only once no other save or reset for the course
 *      is pending, and a failure refetches the server's row instead of
 *      restoring a snapshot that may predate other, successful saves.
 *
 * WRITES `grade_scenarios` only (057). Nothing here touches V-1's tables.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import { gradeModelKeys, type GradeScenarioRow } from './queries.grade-model';

/* ---------------------------------------------------------------------------
 * Pure: patches, and the boundary check
 * ------------------------------------------------------------------------ */

/** One change to a course's scenario. */
export interface ScenarioPatch {
  /** Set an item's value, or clear it with `null`. */
  readonly item?: { readonly key: string; readonly value: number | null };
  /** Replace the target letter (`null` = the default, A-). */
  readonly targetLetter?: string | null;
}

/** The row a patch produces, from whatever the cache holds now. Never mutates `current`. */
export function applyScenarioPatch(
  courseId: string,
  current: GradeScenarioRow | null | undefined,
  patch: ScenarioPatch,
  now: string = new Date().toISOString(),
): GradeScenarioRow {
  const scores = { ...(current?.item_scores ?? {}) };
  const item = patch.item;
  const itemScores = item
    ? item.value === null
      ? Object.fromEntries(Object.entries(scores).filter(([key]) => key !== item.key))
      : { ...scores, [item.key]: item.value }
    : scores;
  return {
    course_id: courseId,
    item_scores: itemScores,
    target_letter: 'targetLetter' in patch ? (patch.targetLetter ?? null) : (current?.target_letter ?? null),
    updated_at: current?.updated_at ?? now,
  };
}

/** What a scenario upsert sends. */
export interface ScenarioWrite {
  readonly courseId: string;
  readonly itemScores: Readonly<Record<string, number>>;
  readonly targetLetter: string | null;
}

/**
 * Boundary check before a scenario write. The database refuses a non-number or
 * a negative score too (057, strict since 080); refusing here means the owner
 * sees why instead of a constraint name. The upper bound needs the item's
 * possible, so the what-if cell enforces it before it ever calls a save.
 */
export function validateScenario(vars: ScenarioWrite): ScenarioWrite {
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

/* ---------------------------------------------------------------------------
 * Keys and cache plumbing
 * ------------------------------------------------------------------------ */

/** The mutation key both scenario hooks use, so "is anything pending?" sees both. */
export const scenarioMutationKey = (courseId: string) => ['grade-scenario', courseId] as const;

/** The TanStack scope that serialises a course's saves and resets. */
export const scenarioScopeId = (courseId: string) => `grade-scenario:${courseId}`;

/** Refetch the course's row and /grades' bulk read — only when nothing else for it is pending. */
function settleScenario(queryClient: QueryClient, courseId: string): void {
  // `onSettled` runs while this mutation is still pending, so 1 means "only me".
  if (queryClient.isMutating({ mutationKey: scenarioMutationKey(courseId) }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: gradeModelKeys.scenario(courseId) });
  void queryClient.invalidateQueries({ queryKey: ['grade-model', 'scenarios-for'] });
}

/** After a failure, show the server's row rather than a snapshot that may be older. */
function refetchScenario(queryClient: QueryClient, courseId: string): void {
  void queryClient.invalidateQueries({ queryKey: gradeModelKeys.scenario(courseId) });
}

function requireCourse(courseId: string | null): string {
  if (!courseId) throw new Error('No course to save the scenario against.');
  return courseId;
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

/**
 * Save one change to the course's scenario. Optimistic: the patch lands in the
 * cache at once, so the standing moves as soon as a value is committed (on blur
 * or Enter — the cell never calls this per keystroke).
 */
export function useSaveScenario(courseId: string | null) {
  const queryClient = useQueryClient();
  const id = courseId ?? 'none';
  return useMutation({
    mutationKey: scenarioMutationKey(id),
    scope: { id: scenarioScopeId(id) },
    onMutate: async (patch: ScenarioPatch): Promise<void> => {
      const key = gradeModelKeys.scenario(requireCourse(courseId));
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<GradeScenarioRow | null>(key, (current) =>
        applyScenarioPatch(requireCourse(courseId), current, patch),
      );
    },
    mutationFn: async (patch: ScenarioPatch): Promise<void> => {
      const course = requireCourse(courseId);
      const key = gradeModelKeys.scenario(course);
      // Built now, when this save runs — not when it was made — from the cache,
      // which holds every patch made so far (a reset made since included), with
      // this save's own patch re-applied in case a refetch replaced it. The
      // cache itself is left alone: a later reset may have cleared it on purpose.
      const row = applyScenarioPatch(course, queryClient.getQueryData<GradeScenarioRow | null>(key), patch);
      const clean = validateScenario({ courseId: course, itemScores: row.item_scores, targetLetter: row.target_letter });
      const { error } = await getSupabaseBrowserClient()
        .from('grade_scenarios')
        .upsert(
          { course_id: clean.courseId, item_scores: clean.itemScores, target_letter: clean.targetLetter },
          { onConflict: 'course_id' },
        );
      if (error) throw error;
    },
    onError: () => {
      if (courseId) refetchScenario(queryClient, courseId);
    },
    onSettled: () => {
      if (courseId) settleScenario(queryClient, courseId);
    },
  });
}

/** Delete the course's scenario row: every what-if value and the target letter. */
export function useResetScenario(courseId: string | null) {
  const queryClient = useQueryClient();
  const id = courseId ?? 'none';
  return useMutation({
    mutationKey: scenarioMutationKey(id),
    scope: { id: scenarioScopeId(id) },
    onMutate: async (): Promise<void> => {
      const key = gradeModelKeys.scenario(requireCourse(courseId));
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<GradeScenarioRow | null>(key, null);
    },
    mutationFn: async (): Promise<void> => {
      const course = requireCourse(courseId);
      const { error } = await getSupabaseBrowserClient().from('grade_scenarios').delete().eq('course_id', course);
      if (error) throw error;
    },
    onError: () => {
      if (courseId) refetchScenario(queryClient, courseId);
    },
    onSettled: () => {
      if (courseId) settleScenario(queryClient, courseId);
    },
  });
}
