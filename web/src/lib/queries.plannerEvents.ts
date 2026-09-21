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

// One literal, not a concatenation: supabase-js types the rows from this
// string. 082's `series_id` and `series_detached` are in it, so every read
// knows whether a row is an occurrence of a series (T-1).
export const PLANNER_EVENT_COLUMNS =
  'id, kind, title, starts_at, ends_at, time_zone, all_day, location_kind, location, notes, done, course_id, series_id, series_detached, created_at, updated_at';

/** The two 082 columns a fresh one-off row has. */
export const NOT_IN_A_SERIES = { series_id: null, series_detached: false } as const;

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
        .select(PLANNER_EVENT_COLUMNS)
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
        ...NOT_IN_A_SERIES,
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

/** T-1 "This event": the one column that cuts a row out of its series. */
const DETACHED = { series_detached: true } as const;

/**
 * The patched columns whose validated value is not already the row's (TR-8).
 *
 * The form hands over the whole draft every time, so without this a Save with
 * nothing typed would still be a write — and, with "This event", would detach
 * an occurrence from its series for no reason. Every column here is a string,
 * a boolean or null, so `Object.is` is the whole comparison.
 */
function changedColumns(
  current: PlannerEventRow,
  value: PlannerEventDraft,
  patch: Partial<PlannerEventDraft>,
): Partial<PlannerEventDraft> {
  const columns: Partial<PlannerEventDraft> = {};
  for (const column of Object.keys(patch) as (keyof PlannerEventDraft)[]) {
    if (!Object.is(value[column], current[column])) {
      Object.assign(columns, { [column]: value[column] });
    }
  }
  return columns;
}

function mergedUpdate({ current, patch }: PlannerEventUpdate) {
  if (isOptimisticEvent(current)) {
    throw new Error('This event is still being saved — try again in a moment.');
  }
  const value = validated({ ...writableColumns(current), ...patch });
  return { value, columns: changedColumns(current, value, patch) };
}

/**
 * Would this patch change anything? The editor asks before putting the scope
 * question up: a Save that changes nothing is not worth a decision, and must
 * not detach the occurrence (TR-8). An unusable patch counts as a change, so
 * the ordinary path still reports why it was refused.
 */
export function plannerEventChanges(
  current: PlannerEventRow,
  patch: Partial<PlannerEventDraft>,
): boolean {
  try {
    return Object.keys(mergedUpdate({ current, patch }).columns).length > 0;
  } catch {
    return true;
  }
}

export function useUpdatePlannerEvent() {
  const queryClient = useQueryClient();

  return useMutation<PlannerEventRow, Error, PlannerEventUpdate, RowPatch>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async (update) => {
      const changed = mergedUpdate(update).columns;
      // Nothing changed: no write, and therefore no detach either (TR-8).
      if (Object.keys(changed).length === 0) return update.current;
      const columns = { ...changed, ...(update.detach ? DETACHED : {}) };
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('planner_events')
        .update(columns)
        .eq('id', update.current.id)
        .select(PLANNER_EVENT_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },

    onMutate: async (update) => {
      let next: PlannerEventRow;
      try {
        const { value, columns } = mergedUpdate(update);
        // Nothing to show either: the write will not happen (TR-8).
        if (Object.keys(columns).length === 0) return NO_PATCH;
        next = { ...update.current, ...value, ...(update.detach ? DETACHED : {}) };
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
