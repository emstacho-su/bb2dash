/**
 * bb2dash — planner-state cache fan-out.
 *
 * Status and the rest of `assignment_progress` are read back through four
 * different caches, and every one of them holds the same fact:
 *
 *   ['work-items', …]                        Home's tracker + undated tray
 *   ['course-work-items', …]                 the course Stream's tracker
 *   ['popout', 'series', …]                  the assignment popout's series strip
 *   ['popout', 'assignment-progress', <id>]  the assignment popout's planner block
 *
 * Before this module each mutation patched whichever of them it happened to
 * know about, so a status changed on the course Stream snapped back (its cache
 * has a 5-minute staleTime and nothing invalidated it) and a status changed on
 * Home left the popout showing the old value for a minute. One helper now
 * patches, rolls back and invalidates all four, and both mutations use it.
 *
 * This is a leaf module on purpose: it owns the key prefixes (the key factories
 * in `queries.today.ts` / `queries.course.ts` / `queries.popout.ts` build on
 * these constants) and imports nothing at runtime, so there is no cycle.
 */

import type { QueryClient } from '@tanstack/react-query';
import type { ProgressStatus } from './queries';

/* ---------------------------------------------------------------------------
 * Key prefixes — the single source of truth for every cache holding an item
 * ------------------------------------------------------------------------ */

/** Home's `v_work_items` windows and the undated tray. */
export const WORK_ITEMS_KEY = ['work-items'] as const;
/** The course Stream's per-shell `v_work_items` fetch. */
export const COURSE_WORK_ITEMS_KEY = ['course-work-items'] as const;
/** The assignment popout's series strip — `v_work_items` rows as well. */
export const SERIES_KEY = ['popout', 'series'] as const;

/** The exact key of one assignment's `assignment_progress` row. */
export function assignmentProgressKey(assignmentId: string) {
  return ['popout', 'assignment-progress', assignmentId] as const;
}

/** Every cache whose entries are lists of `v_work_items`-shaped rows. */
const WORK_ITEM_LIST_KEYS: readonly (readonly unknown[])[] = [
  WORK_ITEMS_KEY,
  COURSE_WORK_ITEMS_KEY,
  SERIES_KEY,
];

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------ */

/** Which row the write is about. `item_id` is the assignment id / reading id. */
export interface ProgressTarget {
  item_kind: 'assignment' | 'reading';
  item_id: string;
}

/**
 * The fields a work-item list row shares across the caches. Declared
 * structurally rather than as one of the row types: the Today screen's
 * hand-written `WorkItem` and the generated (all-nullable) `Views<'v_work_items'>`
 * both satisfy it, and this module only ever touches these three fields.
 */
interface WorkItemLike {
  item_kind: string | null;
  item_id: string | null;
  status: string | null;
}

/** The columns a mutation is writing. `status` is the only one the lists carry. */
export interface ProgressRowPatch {
  status?: ProgressStatus;
  [column: string]: unknown;
}

/** What was in the caches before the optimistic patch, for a clean rollback. */
export interface ProgressCacheSnapshot {
  lists: [readonly unknown[], WorkItemLike[] | undefined][];
  progress: { key: readonly unknown[]; value: unknown } | null;
}

/* ---------------------------------------------------------------------------
 * Operations
 * ------------------------------------------------------------------------ */

/** Stop in-flight refetches that would land on top of the optimistic patch. */
export async function cancelProgressQueries(
  queryClient: QueryClient,
  target: ProgressTarget,
): Promise<void> {
  const cancels = WORK_ITEM_LIST_KEYS.map((queryKey) => queryClient.cancelQueries({ queryKey }));
  if (target.item_kind === 'assignment') {
    cancels.push(queryClient.cancelQueries({ queryKey: assignmentProgressKey(target.item_id) }));
  }
  await Promise.all(cancels);
}

/**
 * Apply the patch to every cache that holds this item, and return what was
 * there before.
 *
 * Two deliberate limits. A patch with no `status` leaves the work-item lists
 * alone — they carry no other planner column. And an `assignment_progress`
 * cache entry that has never been fetched (or that holds `null`, meaning "no
 * planner row yet") is not written: composing a whole row out of a partial
 * patch would put fabricated values on screen, which the project forbids.
 */
export function patchProgressCaches(
  queryClient: QueryClient,
  target: ProgressTarget,
  patch: ProgressRowPatch,
): ProgressCacheSnapshot {
  const lists: ProgressCacheSnapshot['lists'] = [];

  if (patch.status !== undefined) {
    const status = patch.status;
    for (const queryKey of WORK_ITEM_LIST_KEYS) {
      for (const [key, list] of queryClient.getQueriesData<WorkItemLike[]>({ queryKey })) {
        lists.push([key, list]);
        if (!list) continue;
        queryClient.setQueryData<WorkItemLike[]>(
          key,
          list.map((row) =>
            row.item_kind === target.item_kind && row.item_id === target.item_id
              ? { ...row, status }
              : row,
          ),
        );
      }
    }
  }

  let progress: ProgressCacheSnapshot['progress'] = null;
  if (target.item_kind === 'assignment') {
    const key = assignmentProgressKey(target.item_id);
    const current = queryClient.getQueryData<Record<string, unknown> | null>(key);
    progress = { key, value: current };
    if (current) queryClient.setQueryData(key, { ...current, ...patch });
  }

  return { lists, progress };
}

/** Put every cache back the way `patchProgressCaches` found it. */
export function restoreProgressCaches(
  queryClient: QueryClient,
  snapshot: ProgressCacheSnapshot | undefined,
): void {
  if (!snapshot) return;
  for (const [key, list] of snapshot.lists) {
    queryClient.setQueryData(key, list);
  }
  if (snapshot.progress && snapshot.progress.value !== undefined) {
    queryClient.setQueryData(snapshot.progress.key, snapshot.progress.value);
  }
}

/** Refetch every cache that holds this item, once the write has settled. */
export function invalidateProgressCaches(
  queryClient: QueryClient,
  target: ProgressTarget,
): void {
  for (const queryKey of WORK_ITEM_LIST_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
  if (target.item_kind === 'assignment') {
    void queryClient.invalidateQueries({ queryKey: assignmentProgressKey(target.item_id) });
  }
}
