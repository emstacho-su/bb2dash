/**
 * bb2dash — the run behind a claimed sync request (Phase 14 follow-up, 2026-10-05).
 *
 * While the `sync` container's runner holds a request, the only trace of where
 * it is comes from the `sync_runs` row its claim opened (migration 135): `running`
 * through the crawl and the fold, then `ok` / `partial` / `failed` while the files
 * are pulled and the request is closed. The Sync button reads that one row by
 * `run_id` to name the phase. Own file because `queries.sync.ts` is past the
 * project's size rule; the cache key, the client and the quarantine filter stay
 * in that file and are imported here.
 */

import { queryOptions, useQuery } from '@tanstack/react-query';

import { NOT_QUARANTINED_FILTER, syncKeys, untypedClient } from './queries.sync';

/** The columns the button reads off `sync_runs`. */
export interface SyncRunRow {
  id: number;
  run_id: string;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
}

const SYNC_RUN_COLUMNS = 'id, run_id, status, started_at, finished_at';

/** The same cadence as the request's own poll (`agentRequestOptions`). */
export const SYNC_RUN_POLL_MS = 10_000;

/** A run id is the lowercase uuid the runner minted; nothing else goes into the filter. */
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && RUN_ID_PATTERN.test(value);
}

/**
 * The request's run row, polled while the request is `claimed`. Off when there
 * is no run id yet (the claim has not registered), when the id is not a uuid (a
 * shape the button refuses rather than queries), or when the caller says the
 * request is not the runner's. A quarantined row (`scope = 'unregistered'`) is a
 * crawl nobody owned, never this run, so it is filtered the way Activity filters it.
 */
export function syncRunOptions(runId: string | null, claimed: boolean) {
  return queryOptions({
    queryKey: syncKeys.syncRun(runId ?? ''),
    enabled: isRunId(runId) && claimed,
    queryFn: async (): Promise<SyncRunRow | null> => {
      if (!isRunId(runId)) {
        throw new Error(`sync run id ${JSON.stringify(runId)} is not a uuid`);
      }
      const { data, error } = await untypedClient()
        .from('sync_runs')
        .select(SYNC_RUN_COLUMNS)
        .eq('run_id', runId)
        .or(NOT_QUARANTINED_FILTER)
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as SyncRunRow | null;
    },
    refetchInterval: SYNC_RUN_POLL_MS,
    staleTime: 0,
  });
}

export function useSyncRun(runId: string | null, claimed: boolean) {
  return useQuery(syncRunOptions(runId, claimed));
}
