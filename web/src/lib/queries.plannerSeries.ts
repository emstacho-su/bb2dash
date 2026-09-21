/**
 * bb2dash — recurring planner events, the write side (T-1, Phase 12b tail).
 *
 * Split out of `queries.plannerEvents.ts` to keep both files small; it borrows
 * that module's keys, its cache fan-out and its invalidation rule, so a series
 * write and a single-event write cannot undo each other's optimistic rows.
 *
 * THREE RPCs, ONE TRANSACTION EACH (083). The rows themselves are built in the
 * browser by `planner-recurrence.ts` — SQL never converts a planner wall clock
 * — and arrive as `p_rows`, a jsonb array of the `planner_events` insert
 * columns, carrying `id` where rows are updated. Keeping the ids is the point:
 * the calendar push then sends Google a patch per event instead of deleting and
 * re-inserting, so a moved class keeps its invitations and its history.
 *
 * "THIS EVENT" IS NOT HERE. One occurrence is edited with the ordinary update
 * (setting `series_detached`) and deleted with the ordinary delete.
 *
 * SCOPE. `following` runs from the occurrence that was opened; `all` runs from
 * now, and 083 applies its own `now()` — the client's instant is sent so the
 * rows it offers match the rows the function will accept.
 *
 * Saving here is what puts events on Stack's real Google calendar (the push
 * follows within two minutes), so a refused write must never look like it
 * landed: every write is validated at the boundary first and rolls back on
 * error, one row at a time.
 */

import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import {
  PlannerEventValidationError,
  validatePlannerEvent,
  type PlannerEventDraft,
  type PlannerEventRow,
} from './planner-events';
import {
  MAX_SERIES_OCCURRENCES,
  restateSeriesRows,
  type SeriesFreq,
} from './planner-recurrence';
import {
  asSeriesClient,
  isSeriesDetached,
  seriesIdOf,
  type PlannerEventSeriesRow,
  type SeriesRowPayload,
  type SeriesWriteScope,
} from './planner-series-types';
import {
  OPTIMISTIC_ID_PREFIX,
  PLANNER_EVENT_COLUMNS_WITH_SERIES,
  cachedPlannerEvents,
  invalidateWhenIdle,
  patchPlannerRows,
  plannerEventKeys,
  rollbackPlannerRows,
  type RowEntry,
  type RowPatch,
} from './queries.plannerEvents';

/* ---------------------------------------------------------------------------
 * Shared checks
 * ------------------------------------------------------------------------ */

const MESSAGES = {
  empty: 'A repeating event needs at least one occurrence.',
  overCap: `A repeating event is limited to ${MAX_SERIES_OCCURRENCES} occurrences.`,
  noScope: 'None of this series’ occurrences are still ahead, so there is nothing to change.',
  notCreated: 'The repeating event was not created.',
  notUpdated: 'The repeating event was not changed.',
  notDeleted: 'The repeating event was not deleted.',
} as const;

/**
 * The rows as they may be written, or the first reason they may not. The cap
 * is checked before the columns so a runaway rule is named as a rule problem.
 */
function validatedRows<Row extends SeriesRowPayload>(rows: readonly Row[]): Row[] {
  if (rows.length === 0) throw new Error(MESSAGES.empty);
  if (rows.length > MAX_SERIES_OCCURRENCES) throw new Error(MESSAGES.overCap);
  return rows.map((row) => {
    const result = validatePlannerEvent(row);
    if (!result.ok) throw new PlannerEventValidationError(result.errors);
    return { ...row, ...result.value };
  });
}

function client() {
  return asSeriesClient(getSupabaseBrowserClient());
}

/** PostgREST's `{ data, error }`, as a value or a throw. */
function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  is: (value: unknown) => value is T,
  refusal: string,
): T {
  if (result.error) throw new Error(result.error.message);
  if (!is(result.data)) throw new Error(refusal);
  return result.data;
}

const isUuid = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isCount = (value: unknown): value is number => typeof value === 'number';

/** `following` starts at the occupied occurrence; `all` starts now (083 re-checks). */
function scopeStart(scope: SeriesWriteScope, occurrence: string): string {
  return scope === 'following' ? occurrence : new Date().toISOString();
}

/** Instants compare as numbers: PostgREST and the browser spell them differently. */
function notBefore(instant: string, from: string): boolean {
  return Date.parse(instant) >= Date.parse(from);
}

/* ---------------------------------------------------------------------------
 * Create
 * ------------------------------------------------------------------------ */

export interface PlannerSeriesCreate {
  freq: SeriesFreq;
  /** The last local date an occurrence may start on. */
  until: string;
  /** Every occurrence, already expanded by `planner-recurrence.ts`. */
  rows: readonly PlannerEventDraft[];
}

export function useCreatePlannerSeries() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, PlannerSeriesCreate, RowPatch[]>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async ({ freq, until, rows }) => {
      const values = validatedRows(rows);
      const result = await client().rpc('planner_series_create', {
        p_freq: freq,
        p_until: until,
        p_rows: values,
      });
      return unwrap(result, isUuid, MESSAGES.notCreated);
    },

    onMutate: async ({ rows }) => {
      const now = new Date().toISOString();
      const entries = rows.flatMap((row, index): RowEntry[] => {
        const result = validatePlannerEvent(row);
        if (!result.ok) return [];
        const id = `${OPTIMISTIC_ID_PREFIX}${now}:${index}:${Math.random().toString(36).slice(2)}`;
        return [{ id, next: { ...result.value, id, created_at: now, updated_at: now } }];
      });
      return patchPlannerRows(queryClient, entries);
    },

    // The stand-ins carry no real ids, so the refetch on settle is what swaps
    // them for the saved rows — it replaces each week's list outright.
    onError: (_error, _input, context) => rollbackPlannerRows(queryClient, context),
    onSettled: () => invalidateWhenIdle(queryClient),
  });
}

/* ---------------------------------------------------------------------------
 * Update
 * ------------------------------------------------------------------------ */

export interface PlannerSeriesUpdate {
  seriesId: string;
  scope: SeriesWriteScope;
  /** The occurrence the form was opened on. */
  edited: PlannerEventRow;
  /** That occurrence as the form now has it; the scope follows it. */
  draft: PlannerEventDraft;
}

/**
 * The series' own rows from `p_from` on — the grid only holds the weeks it has
 * shown, and a scope can reach a year out, so this is read rather than guessed.
 * Detached rows are left alone: 083 refuses them.
 */
async function rowsInScope(seriesId: string, from: string): Promise<PlannerEventSeriesRow[]> {
  const { data, error } = await client()
    .from('planner_events')
    .select(PLANNER_EVENT_COLUMNS_WITH_SERIES)
    .eq('series_id', seriesId)
    .eq('series_detached', false)
    .gte('starts_at', from)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export function useUpdatePlannerSeries() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, PlannerSeriesUpdate, RowPatch[]>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async ({ seriesId, scope, edited, draft }) => {
      const from = scopeStart(scope, edited.starts_at);
      const scoped = await rowsInScope(seriesId, from);
      if (scoped.length === 0) throw new Error(MESSAGES.noScope);

      const restated = restateSeriesRows(scoped, edited, draft, draft.time_zone);
      if (!restated.ok) throw new Error(restated.error.message);

      const result = await client().rpc('planner_series_update', {
        p_series_id: seriesId,
        p_scope: scope,
        p_from: from,
        p_rows: validatedRows(restated.rows),
      });
      return unwrap(result, isCount, MESSAGES.notUpdated);
    },

    onMutate: async ({ seriesId, scope, edited, draft }) => {
      const from = scopeStart(scope, edited.starts_at);
      const cached = cachedPlannerEvents(
        queryClient,
        (row) =>
          seriesIdOf(row) === seriesId && !isSeriesDetached(row) && notBefore(row.starts_at, from),
      );
      const restated = restateSeriesRows(cached, edited, draft, draft.time_zone);
      if (!restated.ok) return [];

      const current = new Map(cached.map((row) => [row.id, row]));
      const entries = restated.rows.flatMap(({ id, ...columns }): RowEntry[] => {
        const row = current.get(id);
        return row ? [{ id, next: { ...row, ...columns } }] : [];
      });
      return patchPlannerRows(queryClient, entries);
    },

    onError: (_error, _input, context) => rollbackPlannerRows(queryClient, context),
    onSettled: () => invalidateWhenIdle(queryClient),
  });
}

/* ---------------------------------------------------------------------------
 * Delete
 * ------------------------------------------------------------------------ */

export interface PlannerSeriesDelete {
  seriesId: string;
  scope: SeriesWriteScope;
  /** The occurrence the dialog was opened on; `following` starts here. */
  from: string;
}

/** Everything the grid is showing that this delete will take away. */
function doomedRows(
  queryClient: QueryClient,
  seriesId: string,
  from: string,
): PlannerEventRow[] {
  // A detached row still carries `series_id`, and 083 deletes it too.
  return cachedPlannerEvents(
    queryClient,
    (row) => seriesIdOf(row) === seriesId && notBefore(row.starts_at, from),
  );
}

export function useDeletePlannerSeries() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, PlannerSeriesDelete, RowPatch[]>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async ({ seriesId, scope, from }) => {
      const result = await client().rpc('planner_series_delete', {
        p_series_id: seriesId,
        p_scope: scope,
        p_from: scopeStart(scope, from),
      });
      return unwrap(result, isCount, MESSAGES.notDeleted);
    },

    onMutate: ({ seriesId, scope, from }) =>
      patchPlannerRows(
        queryClient,
        doomedRows(queryClient, seriesId, scopeStart(scope, from)).map((row) => ({
          id: row.id,
          next: null,
        })),
      ),

    onError: (_error, _input, context) => rollbackPlannerRows(queryClient, context),
    onSettled: () => invalidateWhenIdle(queryClient),
  });
}
