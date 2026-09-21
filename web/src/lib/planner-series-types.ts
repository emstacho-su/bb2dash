/**
 * bb2dash — TEMPORARY types for 082/083, to be deleted at integration.
 *
 * ▸ REMOVE THIS FILE once `src/lib/supabase/database.types.ts` has been
 *   regenerated against migrations 082 (`planner_event_series`,
 *   `planner_events.series_id` / `.series_detached`) and 083 (the three
 *   `planner_series_*` RPCs). The PM owns that file; W-36 must not edit it, so
 *   until then the two columns and the three functions are typed here, from the
 *   frozen tail contract, and reached through one narrow adapter instead of
 *   scattering `as any` through the query layer.
 *
 * Nothing here invents behaviour: the shapes are the contract's table, and the
 * adapter only widens what the generated types refuse to describe yet.
 */

import type { PlannerEventDraft, PlannerEventRow } from './planner-events';
import type { SeriesFreq } from './planner-recurrence';

/* ---------------------------------------------------------------------------
 * The two columns 082 adds
 * ------------------------------------------------------------------------ */

export interface PlannerSeriesFields {
  /** The series this occurrence belongs to, or null for a one-off. */
  series_id: string | null;
  /** True once "this event" edited it out of the series' scope. */
  series_detached: boolean;
}

export type PlannerEventSeriesRow = PlannerEventRow & PlannerSeriesFields;

/** Appended to `PLANNER_EVENT_COLUMNS` by the reads that need them. */
export const SERIES_COLUMNS = 'series_id, series_detached';

function field(row: unknown, name: keyof PlannerSeriesFields): unknown {
  return typeof row === 'object' && row !== null ? (row as Record<string, unknown>)[name] : undefined;
}

/** The row's series, or null — including when the column was not selected. */
export function seriesIdOf(row: unknown): string | null {
  const value = field(row, 'series_id');
  return typeof value === 'string' && value !== '' ? value : null;
}

/** True when "this event" has already cut this row out of its series. */
export function isSeriesDetached(row: unknown): boolean {
  return field(row, 'series_detached') === true;
}

/**
 * True for a row the scope question applies to: in a series, and still part of
 * it. A detached row is edited and deleted like any one-off.
 */
export function isSeriesMember(row: unknown): boolean {
  return seriesIdOf(row) !== null && !isSeriesDetached(row);
}

/* ---------------------------------------------------------------------------
 * Scopes
 * ------------------------------------------------------------------------ */

/** What the scope dialog asks. `this` needs no RPC (detach, or a plain delete). */
export const SERIES_SCOPES = ['this', 'following', 'all'] as const;

export type SeriesScope = (typeof SERIES_SCOPES)[number];

/** The two scopes 083's RPCs take. */
export type SeriesWriteScope = Exclude<SeriesScope, 'this'>;

export function isSeriesWriteScope(value: unknown): value is SeriesWriteScope {
  return value === 'following' || value === 'all';
}

/* ---------------------------------------------------------------------------
 * 083's RPCs
 * ------------------------------------------------------------------------ */

/** One element of `p_rows`: the insert columns, plus `id` where rows are updated. */
export type SeriesRowPayload = PlannerEventDraft & { id?: string };

export interface PlannerSeriesRpcs {
  planner_series_create: {
    args: { p_freq: SeriesFreq; p_until: string; p_rows: readonly SeriesRowPayload[] };
    /** The new series' uuid. */
    returns: string;
  };
  planner_series_update: {
    args: {
      p_series_id: string;
      p_scope: SeriesWriteScope;
      p_from: string;
      p_rows: readonly SeriesRowPayload[];
    };
    /** Rows updated. */
    returns: number;
  };
  planner_series_delete: {
    args: { p_series_id: string; p_scope: SeriesWriteScope; p_from: string };
    /** Rows deleted. */
    returns: number;
  };
}

export type SeriesRpcName = keyof PlannerSeriesRpcs;

export interface SeriesResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** One `planner_event_series` row (082) — the rule the form shows read-only. */
export interface PlannerSeriesRuleRow {
  id: string;
  freq: string;
  until_date: string;
}

/** As much of PostgREST's builder as the series reads use. */
export type SeriesQuery<T> = PromiseLike<SeriesResult<T>> & {
  select<Row = PlannerEventSeriesRow>(columns: string): SeriesQuery<Row[]>;
  eq(column: string, value: unknown): SeriesQuery<T>;
  gte(column: string, value: unknown): SeriesQuery<T>;
  order(column: string, options: { ascending: boolean }): SeriesQuery<T>;
};

export interface SeriesClient {
  from(table: 'planner_events' | 'planner_event_series'): SeriesQuery<PlannerEventSeriesRow[]>;
  rpc<Name extends SeriesRpcName>(
    name: Name,
    args: PlannerSeriesRpcs[Name]['args'],
  ): PromiseLike<SeriesResult<PlannerSeriesRpcs[Name]['returns']>>;
}

/**
 * The browser client, widened to the columns and functions the generated types
 * do not know yet. One cast, in one place, deleted with this file.
 */
export function asSeriesClient(client: unknown): SeriesClient {
  return client as SeriesClient;
}
