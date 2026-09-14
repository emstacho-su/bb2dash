/**
 * The Activity list — what it asks Postgres for, and what it refuses to render.
 *
 * Two kinds of `sync_runs` row are not activity: the daily `source = 'ical'`
 * calendar poll, which writes a row every day whether or not a feed URL is even
 * set, and a `scope = 'unregistered'` quarantine row, which anyone holding the
 * publishable key can cause by POSTing to `bb_raw`. Left in, they fill the
 * eight-row pop-down and light the unseen badge with nothing Stack did.
 *
 * Both are filtered in the request (so they cannot eat the limit) and again in
 * the pure flattener (so a row that arrives another way still never renders);
 * both halves are asserted here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntry } from '@/lib/queries.sync';

const limit = vi.fn();
const order = vi.fn();
const or = vi.fn();
const neq = vi.fn();
const select = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from }),
}));

const { activityEntries, activityOptions, isActivityNoise, unseenCount } = await import(
  '@/lib/queries.sync'
);

beforeEach(() => {
  vi.clearAllMocks();
  limit.mockResolvedValue({ data: [], error: null });
  order.mockReturnValue({ limit });
  or.mockReturnValue({ order });
  neq.mockReturnValue({ or });
  select.mockReturnValue({ neq });
  from.mockReturnValue({ select });
});

/** Run the options' queryFn the way react-query would. */
function runQuery(size = 8): Promise<ActivityEntry[]> {
  const queryFn = activityOptions(size).queryFn as (context: {
    signal?: AbortSignal;
  }) => Promise<ActivityEntry[]>;
  return queryFn({});
}

/** A `sync_runs` row as supabase-js hands it back. */
function runRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 20,
    ran_at: '2026-09-14T11:00:00.000Z',
    started_at: '2026-09-14T11:00:00.000Z',
    finished_at: '2026-09-14T11:02:00.000Z',
    status: 'ok',
    source: 'blackboard',
    scope: 'all',
    summary: { changes: ['3 new file(s) catalogued'] },
    ...overrides,
  };
}

describe('activityOptions — the request', () => {
  it('asks sync_runs for the newest runs, excluding ical polls and quarantined crawls', async () => {
    await runQuery(8);

    expect(from).toHaveBeenCalledWith('sync_runs');
    expect(select.mock.calls[0][0]).toContain('source');
    expect(select.mock.calls[0][0]).toContain('scope');
    expect(neq).toHaveBeenCalledWith('source', 'ical');
    // scope is nullable, so `scope <> 'unregistered'` alone would drop null rows.
    expect(or).toHaveBeenCalledWith('scope.is.null,scope.neq.unregistered');
    expect(order).toHaveBeenCalledWith('id', { ascending: false });
    expect(limit).toHaveBeenCalledWith(8);
  });

  it('throws the Postgres error rather than showing an empty list', async () => {
    limit.mockResolvedValue({ data: null, error: new Error('permission denied') });
    await expect(runQuery()).rejects.toThrow(/permission denied/);
  });
});

describe('activityEntries — the noise never renders', () => {
  const rows = [
    runRow({ id: 27, source: 'ical', scope: 'calendar', summary: { changes: ['Calendar feed not set; nothing polled'] } }),
    runRow({
      id: 18,
      source: 'blackboard',
      scope: 'unregistered',
      status: 'failed',
      summary: { changes: ['Nothing changed'] },
    }),
    runRow({ id: 16, summary: { changes: ['2 new announcement(s)', '3 new file(s) catalogued'] } }),
    runRow({ id: 12, scope: null, summary: { changes: ['1 disagreement(s) with Blackboard left for you to settle'] } }),
  ];

  it('drops the daily calendar poll and the quarantined crawl, keeps the real runs', () => {
    const entries = activityEntries(rows);

    expect(entries.map((entry) => entry.runId)).toEqual([16, 16, 12]);
    expect(entries.map((entry) => entry.line)).toEqual([
      '2 new announcement(s)',
      '3 new file(s) catalogued',
      '1 disagreement(s) with Blackboard left for you to settle',
    ]);
    expect(entries.some((entry) => entry.line.includes('Calendar feed'))).toBe(false);
  });

  it('does not light the badge for rows Stack had nothing to do with', () => {
    // Seen marker at run 12: only the two lines from run 16 are unseen, and
    // neither the ical row (27) nor the quarantine row (18) counts at all.
    expect(unseenCount(activityEntries(rows), 12)).toBe(2);
    expect(unseenCount(activityEntries(rows), 16)).toBe(0);
  });

  it('names the two noise kinds in one place', () => {
    expect(isActivityNoise({ source: 'ical', scope: 'calendar' })).toBe(true);
    expect(isActivityNoise({ source: 'blackboard', scope: 'unregistered' })).toBe(true);
    expect(isActivityNoise({ source: 'blackboard', scope: 'all' })).toBe(false);
    expect(isActivityNoise({ source: 'blackboard', scope: null })).toBe(false);
  });
});
