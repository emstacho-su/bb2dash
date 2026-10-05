/**
 * The Sync button's read of the run its request opened: the request shape sent
 * to Postgres, the cache key, when the query is on, and what it refuses.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.fn();
const chain = {
  select: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from }),
}));

const { isRunId, syncRunOptions } = await import('@/lib/queries.sync-run');

const RUN_ID = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.or.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue({ data: { id: 1297, status: 'running' }, error: null });
});

describe('isRunId — the uuid the runner minted', () => {
  it('accepts a lowercase uuid and nothing else', () => {
    expect(isRunId(RUN_ID)).toBe(true);
    expect(isRunId(RUN_ID.toUpperCase())).toBe(false);
    expect(isRunId('1297')).toBe(false);
    expect(isRunId('')).toBe(false);
    expect(isRunId(null)).toBe(false);
  });
});

describe('syncRunOptions — the run row behind a claimed request', () => {
  it('reads sync_runs by run_id, skipping a quarantined row', async () => {
    const options = syncRunOptions(RUN_ID, true);
    const row = await options.queryFn!({} as never);

    expect(from).toHaveBeenCalledWith('sync_runs');
    expect(chain.select).toHaveBeenCalledWith('id, run_id, status, started_at, finished_at');
    expect(chain.eq).toHaveBeenCalledWith('run_id', RUN_ID);
    expect(chain.or).toHaveBeenCalledWith('scope.is.null,scope.neq.unregistered');
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(1);
    expect(row).toEqual({ id: 1297, status: 'running' });
  });

  it('is keyed by the run id and on only while the request is claimed', () => {
    expect(syncRunOptions(RUN_ID, true).queryKey).toEqual(['sync-run', RUN_ID]);
    expect(syncRunOptions(RUN_ID, true).enabled).toBe(true);
    expect(syncRunOptions(RUN_ID, false).enabled).toBe(false);
    expect(syncRunOptions(null, true).enabled).toBe(false);
  });

  it('polls every ten seconds while on, like the request itself', () => {
    expect(syncRunOptions(RUN_ID, true).refetchInterval).toBe(10_000);
  });

  it('refuses to query a run id that is not a uuid', async () => {
    await expect(syncRunOptions('1297', true).queryFn!({} as never)).rejects.toThrow(/run id/);
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces a database error instead of swallowing it', async () => {
    chain.maybeSingle.mockResolvedValue({ data: null, error: new Error('permission denied') });
    await expect(syncRunOptions(RUN_ID, true).queryFn!({} as never)).rejects.toThrow('permission denied');
  });
});
