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

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import {
  PlannerEventValidationError,
  validatePlannerEvent,
  type PlannerEventDraft,
  type PlannerEventRow,
} from './planner-events';
import {
  MAX_SERIES_OCCURRENCES,
  hasExplicitOffset,
  isSeriesFreq,
  restateSeriesRows,
  type SeriesFreq,
  type SeriesWriteScope,
} from './planner-recurrence';
import { isSeriesDetached, seriesIdOf } from './planner-events';
import type { Json } from './supabase/database.types';
import {
  NOT_IN_A_SERIES,
  OPTIMISTIC_ID_PREFIX,
  PLANNER_EVENT_COLUMNS,
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

/** One element of `p_rows`: the insert columns, plus `id` where rows update. */
export type SeriesRowPayload = PlannerEventDraft & { id?: string };

const MESSAGES = {
  empty: 'A repeating event needs at least one occurrence.',
  overCap: `A repeating event is limited to ${MAX_SERIES_OCCURRENCES} occurrences.`,
  noScope: 'None of this series’ occurrences are still ahead, so there is nothing to change.',
  offset: 'A repeating event needs real start and end times.',
  notCreated: 'The repeating event was not created.',
  notUpdated: 'The repeating event was not changed.',
  notDeleted: 'The repeating event was not deleted.',
  outOfScope:
    'Some of these occurrences have just started or already passed, so nothing was changed. Close this and open the event again.',
} as const;

/**
 * The rows as they may be written, or the first reason they may not. The cap
 * is checked before the columns so a runaway rule is named as a rule problem.
 *
 * 083 casts `starts_at` and `ends_at` straight from these strings and refuses
 * any without an explicit offset, because that is the one string Postgres
 * would have to read in a zone. Everything the web builds ends in `Z`; this
 * says so at the boundary rather than finding out from a 400.
 */
function validatedRows<Row extends SeriesRowPayload>(rows: readonly Row[]): Row[] {
  if (rows.length === 0) throw new Error(MESSAGES.empty);
  if (rows.length > MAX_SERIES_OCCURRENCES) throw new Error(MESSAGES.overCap);
  return rows.map((row) => {
    const result = validatePlannerEvent(row);
    if (!result.ok) throw new PlannerEventValidationError(result.errors);
    if (!hasExplicitOffset(result.value.starts_at) || !hasExplicitOffset(result.value.ends_at)) {
      throw new PlannerEventValidationError({
        starts_at: MESSAGES.offset,
        ends_at: MESSAGES.offset,
      });
    }
    return { ...row, ...result.value };
  });
}

/** `p_rows` as jsonb. The columns are all JSON scalars; the cast is the shape. */
function asRows(rows: readonly SeriesRowPayload[]): Json {
  return rows as unknown as Json;
}

function client() {
  return getSupabaseBrowserClient();
}

/**
 * 083 refuses a `p_rows` element whose `starts_at` is before the server's own
 * `now()`, and refusing one element fails the whole transaction. So an
 * "all events" edit cuts its scope a minute into the future: an occurrence
 * starting within the next minute counts as already past and is left out.
 * Without the margin a browser clock a few seconds behind the server turns an
 * ordinary edit into a refusal.
 *
 * It is one-sided on purpose. Leaving a row out is harmless — 083 updates what
 * it is given and does not require the whole scope — while sending one row too
 * many changes nothing at all.
 */
export const SERIES_SCOPE_SAFETY_MS = 60_000;

/** `following` starts at the occurrence that was opened; `all` starts now. */
function scopeStart(scope: SeriesWriteScope, occurrence: string, marginMs = 0): string {
  return scope === 'following'
    ? occurrence
    : new Date(Date.now() + marginMs).toISOString();
}

/**
 * True when 083's own cut will not reach the occurrence Stack had open (TR-2).
 *
 * `all` is the only scope this can happen in: it runs from `now()`, so an
 * occurrence that has already started, is in progress, or falls inside the
 * safety margin is left behind. The block Stack just edited must not silently
 * keep its old values, so the caller writes that one row itself.
 */
function outsideScope(
  scope: SeriesWriteScope,
  occurrence: Pick<PlannerEventRow, 'starts_at'>,
  cut: string,
): boolean {
  return scope === 'all' && !notBefore(occurrence.starts_at, cut);
}

/** 083's out-of-scope refusal, in words Stack can act on. */
function refusalMessage(message: string): string {
  return /not in scope/i.test(message) ? MESSAGES.outOfScope : message;
}

function unwrapCount(
  result: { data: number | null; error: { message: string } | null },
  refusal: string,
): number {
  if (result.error) throw new Error(refusalMessage(result.error.message));
  if (typeof result.data !== 'number') throw new Error(refusal);
  return result.data;
}

/** Instants compare as numbers: PostgREST and the browser spell them differently. */
function notBefore(instant: string, from: string): boolean {
  return Date.parse(instant) >= Date.parse(from);
}

/* ---------------------------------------------------------------------------
 * Read — the rule, for the form's read-only line
 * ------------------------------------------------------------------------ */

export const plannerSeriesKeys = {
  all: () => ['planner-series'] as const,
  rule: (id: string) => ['planner-series', id] as const,
} as const;

/** What the form shows about a series it cannot edit. */
export interface PlannerSeriesRule {
  freq: SeriesFreq;
  until: string;
}

/**
 * The rule behind an occurrence. Read rather than guessed: the row carries
 * only `series_id`, and the form must not invent a frequency it has not read.
 * A missing or unreadable rule comes back as null, and the form says only that
 * the event repeats.
 */
export function plannerSeriesRuleOptions(seriesId: string | null) {
  return queryOptions({
    queryKey: plannerSeriesKeys.rule(seriesId ?? ''),
    enabled: seriesId !== null,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PlannerSeriesRule | null> => {
      const { data, error } = await client()
        .from('planner_event_series')
        .select('id, freq, until_date')
        .eq('id', seriesId ?? '');
      if (error) throw new Error(error.message);
      const row = data?.[0];
      if (!row || !isSeriesFreq(row.freq)) return null;
      return { freq: row.freq, until: row.until_date };
    },
  });
}

export function usePlannerSeriesRule(seriesId: string | null) {
  return useQuery(plannerSeriesRuleOptions(seriesId));
}

/**
 * What every series write does when it settles (TR-6).
 *
 * The weeks, as always — and the rules too. A create adds one, a `following`
 * split makes a second and shortens the first's `until_date`, and an
 * `all` delete removes the row outright, so the read-only line the form shows
 * is stale after all three. The whole `['planner-series', …]` prefix goes: the
 * split's new id never comes back to the browser, so there is nothing more
 * precise to name, and there are only ever a handful of these keys.
 */
function settleSeriesWrite(queryClient: QueryClient) {
  invalidateWhenIdle(queryClient);
  void queryClient.invalidateQueries({ queryKey: plannerSeriesKeys.all() });
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
      const { data, error } = await client().rpc('planner_series_create', {
        p_freq: freq,
        p_until: until,
        p_rows: asRows(values),
      });
      if (error) throw new Error(refusalMessage(error.message));
      if (typeof data !== 'string' || data === '') throw new Error(MESSAGES.notCreated);
      return data;
    },

    onMutate: async ({ rows }) => {
      const now = new Date().toISOString();
      const entries = rows.flatMap((row, index): RowEntry[] => {
        const result = validatePlannerEvent(row);
        if (!result.ok) return [];
        const id = `${OPTIMISTIC_ID_PREFIX}${now}:${index}:${Math.random().toString(36).slice(2)}`;
        return [
          { id, next: { ...result.value, ...NOT_IN_A_SERIES, id, created_at: now, updated_at: now } },
        ];
      });
      return patchPlannerRows(queryClient, entries);
    },

    // The stand-ins carry no real ids, so the refetch on settle is what swaps
    // them for the saved rows — it replaces each week's list outright.
    onError: (_error, _input, context) => rollbackPlannerRows(queryClient, context),
    onSettled: () => settleSeriesWrite(queryClient),
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
async function rowsInScope(seriesId: string, from: string): Promise<PlannerEventRow[]> {
  const { data, error } = await client()
    .from('planner_events')
    .select(PLANNER_EVENT_COLUMNS)
    .eq('series_id', seriesId)
    .eq('series_detached', false)
    .gte('starts_at', from)
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * The opened occurrence, written on its own: the whole draft, by id, and no
 * `series_detached` — Stack asked to change the series, not to leave it.
 */
async function writeOpenedRow(
  edited: PlannerEventRow,
  draft: PlannerEventDraft,
): Promise<number> {
  const [validated] = validatedRows([{ ...draft, id: edited.id }]);
  const { id, ...columns } = validated;
  const { error } = await client().from('planner_events').update(columns).eq('id', id ?? edited.id);
  if (error) throw new Error(refusalMessage(error.message));
  return 1;
}

export function useUpdatePlannerSeries() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, PlannerSeriesUpdate, RowPatch[]>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async ({ seriesId, scope, edited, draft }) => {
      // The margin belongs to the update alone: it is the only RPC that
      // refuses a row for starting too early.
      const from = scopeStart(scope, edited.starts_at, SERIES_SCOPE_SAFETY_MS);
      const scoped = await rowsInScope(seriesId, from);
      const opened = outsideScope(scope, edited, from);
      if (scoped.length === 0 && !opened) throw new Error(MESSAGES.noScope);

      let updated = 0;
      if (scoped.length > 0) {
        const restated = restateSeriesRows(scoped, edited, draft, draft.time_zone);
        if (!restated.ok) throw new Error(restated.error.message);

        const result = await client().rpc('planner_series_update', {
          p_series_id: seriesId,
          p_scope: scope,
          p_from: from,
          p_rows: asRows(validatedRows(restated.rows)),
        });
        updated = unwrapCount(result, MESSAGES.notUpdated);
      }
      // The one row 083's `now()` could not reach, written plainly — and
      // without detaching it, because it is still part of its series (TR-2).
      if (opened) updated += await writeOpenedRow(edited, draft);
      return updated;
    },

    onMutate: async ({ seriesId, scope, edited, draft }) => {
      const from = scopeStart(scope, edited.starts_at, SERIES_SCOPE_SAFETY_MS);
      const cached = cachedPlannerEvents(
        queryClient,
        (row) =>
          row.id === edited.id ||
          (seriesIdOf(row) === seriesId && !isSeriesDetached(row) && notBefore(row.starts_at, from)),
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
    onSettled: () => settleSeriesWrite(queryClient),
  });
}

/* ---------------------------------------------------------------------------
 * Delete
 * ------------------------------------------------------------------------ */

export interface PlannerSeriesDelete {
  seriesId: string;
  scope: SeriesWriteScope;
  /** The occurrence the dialog was opened on; `following` starts here. */
  occurrence: PlannerEventRow;
}

/** Everything the grid is showing that this delete will take away. */
function doomedRows(
  queryClient: QueryClient,
  seriesId: string,
  from: string,
  opened: PlannerEventRow,
): PlannerEventRow[] {
  // A detached row still carries `series_id`, and 083 deletes it too. The
  // opened occurrence goes whether or not 083's cut reaches it (TR-2).
  return cachedPlannerEvents(
    queryClient,
    (row) =>
      row.id === opened.id || (seriesIdOf(row) === seriesId && notBefore(row.starts_at, from)),
  );
}

/** The opened occurrence, deleted on its own. Zero rows is not an error: the
 * RPC's own `now()` may have taken it a moment earlier. */
async function deleteOpenedRow(id: string): Promise<number> {
  const { data, error } = await client().from('planner_events').delete().eq('id', id).select('id');
  if (error) throw new Error(refusalMessage(error.message));
  return data?.length ?? 0;
}

export function useDeletePlannerSeries() {
  const queryClient = useQueryClient();

  return useMutation<number, Error, PlannerSeriesDelete, RowPatch[]>({
    mutationKey: plannerEventKeys.writes(),
    mutationFn: async ({ seriesId, scope, occurrence }) => {
      // No margin here: 083's delete takes `starts_at >= now()` itself and
      // refuses nothing, so a boundary row is deleted or not, never an error.
      const cut = scopeStart(scope, occurrence.starts_at);
      const result = await client().rpc('planner_series_delete', {
        p_series_id: seriesId,
        p_scope: scope,
        p_from: cut,
      });
      let deleted = unwrapCount(result, MESSAGES.notDeleted);
      // "All events" from an occurrence already under way: 083 leaves the past
      // alone, but the one Stack opened was asked for by name (TR-2).
      if (outsideScope(scope, occurrence, cut)) deleted += await deleteOpenedRow(occurrence.id);
      return deleted;
    },

    onMutate: ({ seriesId, scope, occurrence }) =>
      patchPlannerRows(
        queryClient,
        doomedRows(
          queryClient,
          seriesId,
          scopeStart(scope, occurrence.starts_at),
          occurrence,
        ).map((row) => ({ id: row.id, next: null })),
      ),

    onError: (_error, _input, context) => rollbackPlannerRows(queryClient, context),
    onSettled: () => settleSeriesWrite(queryClient),
  });
}
