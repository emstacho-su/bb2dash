/**
 * The worker's database side: the five `inbox_apply_runner` functions of migration 181 the loop
 * calls, as typed calls over one query function. (The sixth, inbox_apply_begin_item, is the
 * writer's, inside its own transaction.) The connection itself is Phase 21's
 * (`workspace/src/db.ts`): built from the DSN's parts, verified against the pinned CA.
 */

import type { QueryFn } from '../../workspace/src/db.js';
import { parsePrepared, type Prepared } from './batch.js';
import { parseRunFacts, type RunFacts } from './report.js';

export interface ClaimedRequest {
  readonly id: number;
}

export interface ApplyRpc {
  /** The oldest queued request, now claimed, or null. Releases dead claims first (181). */
  claim(): Promise<ClaimedRequest | null>;
  /** Runs apply_resolutions(), then returns the queue, the day's run count and the request's params. */
  prepare(requestId: number): Promise<Prepared>;
  /** Archives one item with its record; false when it is no longer answered. */
  archive(requestId: number, itemId: number, decision: Record<string, unknown>): Promise<boolean>;
  runFacts(requestId: number): Promise<RunFacts>;
  /** Closes the request; the id of the follow-up it filed, or null. */
  close(requestId: number, state: 'done' | 'failed', result: Record<string, unknown>): Promise<number | null>;
  /** One round trip, for the heartbeat. */
  ping(): Promise<void>;
}

function rowId(value: unknown, what: string): number {
  const id = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${what}: expected a request id, got ${JSON.stringify(value)}`);
  }
  return id;
}

export function createRpc(query: QueryFn): ApplyRpc {
  const first = async (sql: string, params: readonly unknown[] = []): Promise<Record<string, unknown> | undefined> =>
    (await query(sql, params)).rows[0];

  return {
    async claim() {
      const row = await first('select id::text as id from public.inbox_apply_claim()');
      return row ? { id: rowId(row.id, 'inbox_apply_claim') } : null;
    },
    async prepare(requestId) {
      const row = await first('select public.inbox_apply_prepare($1::bigint) as prepared', [requestId]);
      return parsePrepared(row?.prepared);
    },
    async archive(requestId, itemId, decision) {
      const row = await first('select public.inbox_apply_archive($1::bigint, $2::bigint, $3::jsonb) as ok', [
        requestId,
        itemId,
        JSON.stringify(decision),
      ]);
      return row?.ok === true;
    },
    async runFacts(requestId) {
      const row = await first('select public.inbox_apply_run_facts($1::bigint) as facts', [requestId]);
      return parseRunFacts(row?.facts);
    },
    async close(requestId, state, result) {
      const row = await first('select public.inbox_apply_close($1::bigint, $2, $3::jsonb)::text as follow_up', [
        requestId,
        state,
        JSON.stringify(result),
      ]);
      return row?.follow_up === null || row?.follow_up === undefined ? null : rowId(row.follow_up, 'inbox_apply_close');
    },
    async ping() {
      await query('select 1');
    },
  };
}
