/**
 * bb2dash — planner events query layer (Phase 11b).
 *
 * One read (the week window) and three writes (create, update, delete), all on
 * `planner_events` and nothing else. A planner event is not an assignment:
 * nothing here reads or writes `assignments` or `assignment_progress` (Q4).
 *
 * Every write is validated at the boundary with `validatePlannerEvent` — the
 * 067 checks restated — before a request is built, and is optimistic: the one
 * row it touches is patched in every cached week at once, and put back if the
 * write fails. Rollback is per row, never a whole-cache snapshot, so two writes
 * in flight together cannot undo each other; the windows are refetched once the
 * last planner-event write settles. Saving here is what puts an event on Stack's real
 * Google calendar (the push follows within two minutes), so a refused write
 * must never look like it landed.
 *
 * Conventions follow `queries.planner.ts`: keys in one factory, an
 * `xOptions()` returning queryOptions, `useX()` hooks, throw on error.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import {
  PlannerEventValidationError,
  validatePlannerEvent,
  type PlannerEventDraft,
  type PlannerEventRow,
} from './planner-events';
import { eventWindowBounds, overlapsWindow } from './planner-events-grid';
import { SERIES_COLUMNS } from './planner-series-types';

/* ---------------------------------------------------------------------------
 * Keys and columns
 * ------------------------------------------------------------------------ */

export const plannerEventKeys = {
  all: () => ['planner-events'] as const,
  /** Every planner-event mutation carries this key, so settling can count them. */
  writes: () => ['planner-events', 'write'] as const,
  /** Every week window — the prefix every write patches and invalidates. */
  windows: () => ['planner-events', 'window'] as const,
  window: (from: string, to: string) => ['planner-events', 'window', from, to] as const,
} as const;

// One literal, not a concatenation: supabase-js types the rows from this string.
export const PLANNER_EVENT_COLUMNS =
  'id, kind, title, starts_at, ends_at, time_zone, all_day, location_kind, location, notes, done, course_id, created_at, updated_at';

/**
 * The same columns plus 082's two (T-1). Sent as the select string; the cast
 * keeps the *typed* result at `PlannerEventRow` because the generated types do
 * not know the new columns yet — they are read back through
 * `planner-series-types.ts`, which goes away with it at integration.
 */
export const PLANNER_EVENT_COLUMNS_WITH_SERIES = `${PLANNER_EVENT_COLUMNS}, ${SERIES_COLUMNS}` as typeof PLANNER_EVENT_COLUMNS;

/** Rows shown before the insert returns carry this id prefix. */
export const OPTIMISTIC_ID_PREFIX = 'optimistic:';

export function isOptimisticEvent(row: Pick<PlannerEventRow, 'id'>): boolean {
  return row.id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/* ---------------------------------------------------------------------------
 * Read
 * ------------------------------------------------------------------------ */

/**
 * The events overlapping a week: `from`/`to` are the first and last dates
 * (inclusive, New York), matching `sessionsForWeekOptions`. K-9's predicate is
 * `starts_at < <week end> and ends_at >= <week start>`, which keeps a
 * zero-length task sitting on the first midnight.
 */
export function plannerEventsWindowOptions(from: string, to: string) {
  return queryOptions({
    queryKey: plannerEventKeys.window(from, to),
    queryFn: async (): Promise<PlannerEventRow[]> => {
      const bounds = eventWindowBounds(from, to);
      if (!bounds) throw new Error(`Not a date window: ${from} – ${to}`);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('planner_events')
        .select(PLANNER_EVENT_COLUMNS_WITH_SERIES)
        .lt('starts_at', bounds.end)
        .gte('ends_at', bounds.start)
        .order('starts_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });
}

export function usePlannerEventsWindow(from: string, to: string) {
  return useQuery(plannerEventsWindowOptions(from, to));
}

/* ---------------------------------------------------------------------------
 * Cache fan-out
 * ------------------------------------------------------------------------ */

/** One row's state in one cached week, before and after an optimistic patch. */
interface RowChange {
  key: QueryKey;
  before: PlannerEventRow | undefined;
  after: PlannerEventRow | undefined;
}

/** What a write patched, so a failure can put back exactly that row. */
export interface RowPatch {
  id: string;
  changes: RowChange[];
}

const NO_PATCH: RowPatch = { id: '', changes: [] };

/**
 * Put `next` in every cached week it belongs in (and out of the ones it does
 * not), or remove row `id` everywhere when `next` is null. Only that row moves.
 */
async function patchRow(
  queryClient: QueryClient,
  id: string,
  next: PlannerEventRow | null,
): Promise<RowPatch> {
  await queryClient.cancelQueries({ queryKey: plannerEventKeys.windows() });
  return patchRowNow(queryClient, id, next);
}

/** `patchRow` without the cancel, so a many-row write cancels once. */
function patchRowNow(
  queryClient: QueryClient,
  id: string,
  next: PlannerEventRow | null,
): RowPatch {
  const changes: RowChange[] = [];
  for (const [key, rows] of queryClient.getQueriesData<PlannerEventRow[]>({
    queryKey: plannerEventKeys.windows(),
  })) {
    if (!rows) continue;
    const updated = next ? upsertInWindow(rows, next, key) : rows.filter((row) => row.id !== id);
    // Read `after` back from the cache: structural sharing stores a copy, and
    // the rollback compares against what is actually there.
    const stored = queryClient.setQueryData<PlannerEventRow[]>(key, updated);
    changes.push({
      key,
      before: rows.find((row) => row.id === id),
      after: stored?.find((row) => row.id === id),
    });
  }
  return { id, changes };
}

/**
 * Undo one write's patch, row by row. Where the row has moved on since (another
 * write patched it after this one), it is left alone: that write owns it now,
 * and the refetch on settle has the last word.
 */
function rollbackRow(queryClient: QueryClient, patch: RowPatch | undefined) {
  if (!patch) return;
  for (const { key, before, after } of patch.changes) {
    const rows = queryClient.getQueryData<PlannerEventRow[]>(key);
    if (!rows) continue;
    if (rows.find((row) => row.id === patch.id) !== after) continue;
    const without = rows.filter((row) => row.id !== patch.id);
    queryClient.setQueryData<PlannerEventRow[]>(
      key,
      before ? upsertInWindow(without, before, key) : without,
    );
  }
}

/* ---------------------------------------------------------------------------
 * Shared with the series writes (`queries.plannerSeries.ts`)
 * ------------------------------------------------------------------------ */

/** One row's optimistic destination: the new row, or null to take it out. */
export interface RowEntry {
  id: string;
  next: PlannerEventRow | null;
}

/**
 * Patch several rows across every cached week in one pass. A series write
 * touches up to 52 rows, so the cancel happens once rather than per row; the
 * patches come back per row, which is what keeps rollback per row.
 */
export async function patchPlannerRows(
  queryClient: QueryClient,
  entries: readonly RowEntry[],
): Promise<RowPatch[]> {
  await queryClient.cancelQueries({ queryKey: plannerEventKeys.windows() });
  return entries.map((entry) => patchRowNow(queryClient, entry.id, entry.next));
}

/** Undo a many-row patch, row by row, with `patchRow`'s own rules. */
export function rollbackPlannerRows(
  queryClient: QueryClient,
  patches: readonly RowPatch[] | undefined,
) {
  for (const patch of patches ?? []) rollbackRow(queryClient, patch);
}

/** The cached rows matching `predicate`, once each, whichever weeks they sit in. */
export function cachedPlannerEvents(
  queryClient: QueryClient,
  predicate: (row: PlannerEventRow) => boolean,
): PlannerEventRow[] {
  const found = new Map<string, PlannerEventRow>();
  for (const [, rows] of queryClient.getQueriesData<PlannerEventRow[]>({
    queryKey: plannerEventKeys.windows(),
  })) {
    for (const row of rows ?? []) {
      if (!found.has(row.id) && predicate(row)) found.set(row.id, row);
    }
  }
  return [...found.values()];
}

/**
 * Refetch the weeks once no other planner-event write is still in flight — a
 * refetch landing mid-write would wipe that write's optimistic row. During
 * `onSettled` the settling mutation still counts as pending, hence `<= 1`.
 */
export function invalidateWhenIdle(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: plannerEventKeys.writes() }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: plannerEventKeys.all() });
}

/** Does this row belong in the window a cache key names? */
function belongsIn(row: PlannerEventRow, windowKey: QueryKey): boolean {
  const [, , from, to] = windowKey;
  if (typeof from !== 'string' || typeof to !== 'string') return false;
  const bounds = eventWindowBounds(from, to);
  return bounds !== null && overlapsWindow(row, bounds);
}

/** Put `row` in (or take it out of) a window list, replacing `replaceId`. */
function upsertInWindow(
  rows: readonly PlannerEventRow[],
  row: PlannerEventRow,
  windowKey: QueryKey,
  replaceId: string = row.id,
): PlannerEventRow[] {
  const others = rows.filter((existing) => existing.id !== replaceId && existing.id !== row.id);
  if (!belongsIn(row, windowKey)) return others;
  return [...others, row].sort(
    (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id),
  );
}

function validated(draft: PlannerEventDraft): PlannerEventDraft {
  const result = validatePlannerEvent(draft);
  if (!result.ok) throw new PlannerEventValidationError(result.errors);
  return result.value;
}

function writableColumns(row: PlannerEventRow): PlannerEventDraft {
  const { kind, title, starts_at, ends_at, time_zone, all_day, location_kind, location, notes, done, course_id } =
    row;
  return { kind, title, starts_at, ends_at, time_zone, all_day, location_kind, location, notes, done, course_id };
}

/* ---------------------------------------------------------------------------
 * Create
 * ------------------------------------------------------------------------ */


export function useCreatePlannerEvent() {
  const queryClient = useQueryClient();

  return useMutation<PlannerEventRow, Error, PlannerEventDraft, RowPatch>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async (draft) => {
      const value = validated(draft);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('planner_events')
        .insert(value)
        .select(PLANNER_EVENT_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },

    onMutate: async (draft) => {
      const result = validatePlannerEvent(draft);
      if (!result.ok) return NO_PATCH;
      const now = new Date().toISOString();
      const optimistic: PlannerEventRow = {
        ...result.value,
        id: `${OPTIMISTIC_ID_PREFIX}${now}:${Math.random().toString(36).slice(2)}`,
        created_at: now,
        updated_at: now,
      };
      return patchRow(queryClient, optimistic.id, optimistic);
    },

    onSuccess: (row, _draft, context) => {
      // Swap the stand-in for the saved row so it is editable at once.
      for (const [key, rows] of queryClient.getQueriesData<PlannerEventRow[]>({
        queryKey: plannerEventKeys.windows(),
      })) {
        if (!rows) continue;
        queryClient.setQueryData(key, upsertInWindow(rows, row, key, context?.id || row.id));
      }
    },

    onError: (_error, _draft, context) => rollbackRow(queryClient, context),
    onSettled: () => invalidateWhenIdle(queryClient),
  });
}

/* ---------------------------------------------------------------------------
 * Update
 * ------------------------------------------------------------------------ */

export interface PlannerEventUpdate {
  /** The row as the planner last read it; the patch is validated merged onto it. */
  current: PlannerEventRow;
  /** Only these columns are sent — the task checkbox sends `done` alone. */
  patch: Partial<PlannerEventDraft>;
  /**
   * T-1 "This event": also set `series_detached`, cutting this occurrence out
   * of its series so no later scoped write moves it again. Forward only —
   * nothing here ever re-attaches a row.
   */
  detach?: boolean;
}

/** 082's column, which the generated types do not know yet. */
const DETACHED = { series_detached: true } as const;

function mergedUpdate({ current, patch }: PlannerEventUpdate) {
  if (isOptimisticEvent(current)) {
    throw new Error('This event is still being saved — try again in a moment.');
  }
  const value = validated({ ...writableColumns(current), ...patch });
  const columns = Object.fromEntries(
    (Object.keys(patch) as (keyof PlannerEventDraft)[]).map((column) => [column, value[column]]),
  ) as Partial<PlannerEventDraft>;
  return { value, columns };
}

export function useUpdatePlannerEvent() {
  const queryClient = useQueryClient();

  return useMutation<PlannerEventRow, Error, PlannerEventUpdate, RowPatch>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async (update) => {
      // TEMPORARY with `planner-series-types.ts`: the generated types do not
      // know `series_detached`, and supabase-js refuses a column it has not
      // heard of, so the extra key travels under the declared type.
      const columns = {
        ...mergedUpdate(update).columns,
        ...(update.detach ? DETACHED : {}),
      } as Partial<PlannerEventDraft>;
      if (Object.keys(columns).length === 0) return update.current;
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('planner_events')
        .update(columns)
        .eq('id', update.current.id)
        .select(PLANNER_EVENT_COLUMNS_WITH_SERIES)
        .single();
      if (error) throw error;
      return data;
    },

    onMutate: async (update) => {
      let next: PlannerEventRow;
      try {
        next = {
          ...update.current,
          ...mergedUpdate(update).value,
          ...(update.detach ? DETACHED : {}),
        };
      } catch {
        // mutationFn re-validates and throws; there is nothing to patch.
        return NO_PATCH;
      }
      return patchRow(queryClient, next.id, next);
    },

    onError: (_error, _update, context) => rollbackRow(queryClient, context),
    onSettled: () => invalidateWhenIdle(queryClient),
  });
}

/* ---------------------------------------------------------------------------
 * Delete
 * ------------------------------------------------------------------------ */

export function useDeletePlannerEvent() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, Pick<PlannerEventRow, 'id'>, RowPatch>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async (row) => {
      if (typeof row.id !== 'string' || row.id === '' || isOptimisticEvent(row)) {
        throw new Error('This event has not been saved yet, so there is nothing to delete.');
      }
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('planner_events')
        .delete()
        .eq('id', row.id)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('That event was not found — it may already have been deleted.');
      }
    },

    onMutate: (row) => patchRow(queryClient, row.id, null),

    onError: (_error, _row, context) => rollbackRow(queryClient, context),
    onSettled: () => invalidateWhenIdle(queryClient),
  });
}
