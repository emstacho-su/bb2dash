/**
 * Offline, by the database's own count (Phase 21, the review round of
 * 2026-10-06; ruling V4, finding CR-8).
 *
 * THE FAULT. The page compared the browser's clock with the database's
 * `polled_at`. A laptop whose clock is minutes out then called a running
 * service offline, or a stopped one running.
 *
 * THE RULE. Migration 143 adds `polled_age_seconds` to `v_workspace_status`:
 * the whole seconds between the database's `now()` and `polled_at`, null before
 * the first heartbeat. Offline is that count plus the time this page's own
 * monotonic clock has counted since it read the row. The browser's wall clock
 * is not read.
 *
 * BOTH SIDES OF THE APPLY. The column is optional in the hand-declared row.
 * While it is absent (143 not applied) the page makes the comparison it made
 * before, and the read does not fail: the view is read whole, never by a list
 * that names a column that may not exist.
 */

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Answer {
  data: unknown;
  error: unknown;
}

const stub = {
  result: { data: null, error: null } as Answer,
  /** Every `select()`, as [table, columns]. */
  selects: [] as [string, unknown][],
};

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => ({
      select: (columns: unknown) => {
        stub.selects.push([table, columns]);
        return { maybeSingle: async () => stub.result };
      },
    }),
  }),
}));

const { WORKSPACE_OFFLINE_AFTER_MS, isWorkspaceOffline, normalizeStatus, statusOptions, workspaceKeys } =
  await import('@/lib/queries.workspace');
const { monotonicNowMs, readAtMs } = await import('@/lib/workspace-clock');

/** The database's clock at the read. */
const DB_NOW = Date.parse('2026-10-06T15:00:00Z');
const TEN_MINUTES_MS = 10 * 60_000;

/** The row as the view returns it once 143 is applied, with a heartbeat `ageSeconds` old. */
function rowWithCount(ageSeconds: number | null): Record<string, unknown> {
  return {
    polled_at: ageSeconds === null ? null : new Date(DB_NOW - ageSeconds * 1_000).toISOString(),
    runner: ageSeconds === null ? null : 'workspace-1',
    open_requests: 0,
    oldest_open_at: null,
    polled_age_seconds: ageSeconds,
  };
}

/** The row as the view returns it today: 140's four columns. */
function rowWithoutCount(polledAt: string | null): Record<string, unknown> {
  return { polled_at: polledAt, runner: 'workspace-1', open_requests: 0, oldest_open_at: null };
}

/** Run a queryFn the way TanStack would, without a client. */
async function run<T>(options: { queryFn?: unknown }): Promise<T> {
  const queryFn = options.queryFn as (context: never) => Promise<T>;
  return queryFn({} as never);
}

beforeEach(() => {
  stub.result = { data: null, error: null };
  stub.selects.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('normalizeStatus: polled_age_seconds is an optional column', () => {
  it('keeps the database`s count, zero included', () => {
    expect(normalizeStatus(rowWithCount(45)).polled_age_seconds).toBe(45);
    expect(normalizeStatus(rowWithCount(0)).polled_age_seconds).toBe(0);
  });

  it('keeps null: the column is there and no heartbeat has been written', () => {
    const never = normalizeStatus(rowWithCount(null));
    expect(never.polled_age_seconds).toBeNull();
    expect(never.polled_at).toBeNull();
  });

  it('leaves the key out while the column is absent (143 not applied), and for a missing row', () => {
    expect('polled_age_seconds' in normalizeStatus(rowWithoutCount('2026-10-06T14:59:50+00:00'))).toBe(false);
    expect('polled_age_seconds' in normalizeStatus(null)).toBe(false);
  });

  it.each([['a string', '45'], ['a negative number', -1], ['not a number', Number.NaN], ['no end', Infinity], ['a flag', true]])(
    'leaves the key out for a count it cannot read (%s), so the page falls back',
    (_label, value) => {
      const status = normalizeStatus({ ...rowWithCount(45), polled_age_seconds: value });
      expect('polled_age_seconds' in status).toBe(false);
      expect(status.polled_at).not.toBeNull();
    },
  );
});

describe('isWorkspaceOffline: the database`s count plus the time since this page read it', () => {
  const counted = (ageSeconds: number | null) => normalizeStatus(rowWithCount(ageSeconds));

  it('is offline past 120 s, counted as the database`s seconds plus the page`s own', () => {
    expect(WORKSPACE_OFFLINE_AFTER_MS).toBe(120_000);

    // As read: the count alone.
    expect(isWorkspaceOffline(counted(10), DB_NOW, 0)).toBe(false);
    expect(isWorkspaceOffline(counted(120), DB_NOW, 0)).toBe(false);
    expect(isWorkspaceOffline(counted(121), DB_NOW, 0)).toBe(true);

    // And as it ages on the page with no newer read.
    expect(isWorkspaceOffline(counted(90), DB_NOW, 30_000)).toBe(false);
    expect(isWorkspaceOffline(counted(90), DB_NOW, 30_001)).toBe(true);
    expect(isWorkspaceOffline(counted(120), DB_NOW, 1)).toBe(true);
  });

  it('takes the row as just read when no time since is given', () => {
    expect(isWorkspaceOffline(counted(120), DB_NOW)).toBe(false);
    expect(isWorkspaceOffline(counted(121), DB_NOW)).toBe(true);
  });

  it.each([
    ['ten minutes ahead of the database', DB_NOW + TEN_MINUTES_MS],
    ['ten minutes behind it', DB_NOW - TEN_MINUTES_MS],
    ['a day ahead', DB_NOW + 24 * 60 * 60_000],
    ['at zero', 0],
  ])('gives the same answer with the browser`s clock %s', (_label, browserNow) => {
    // A heartbeat ten seconds old is a running service; one five minutes old is not.
    expect(isWorkspaceOffline(counted(10), browserNow, 0)).toBe(false);
    expect(isWorkspaceOffline(counted(300), browserNow, 0)).toBe(true);
  });

  it('reads a null count as no heartbeat yet', () => {
    expect(isWorkspaceOffline(counted(null), DB_NOW, 0)).toBe(true);
  });
});

describe('isWorkspaceOffline: while the column is absent, the comparison the page made before', () => {
  const uncounted = (agoMs: number) =>
    normalizeStatus(rowWithoutCount(new Date(DB_NOW - agoMs).toISOString()));

  it('sets polled_at beside the clock it is given, and ignores the time since the read', () => {
    expect(isWorkspaceOffline(uncounted(10_000), DB_NOW, TEN_MINUTES_MS)).toBe(false);
    expect(isWorkspaceOffline(uncounted(120_000), DB_NOW, TEN_MINUTES_MS)).toBe(false);
    expect(isWorkspaceOffline(uncounted(120_001), DB_NOW, 0)).toBe(true);
    expect(isWorkspaceOffline(normalizeStatus(rowWithoutCount(null)), DB_NOW, 0)).toBe(true);
  });
});

describe('statusOptions: the view is read whole, and each read has its own moment', () => {
  it('names no column, so a column that is not there yet is not an error', async () => {
    stub.result = { data: rowWithoutCount('2026-10-06T14:59:50+00:00'), error: null };

    const before = await run<Record<string, unknown>>(statusOptions());

    expect(stub.selects).toEqual([['v_workspace_status', '*']]);
    expect('polled_age_seconds' in before).toBe(false);

    stub.result = { data: rowWithCount(45), error: null };
    const after = await run<Record<string, unknown>>(statusOptions());
    expect(after.polled_age_seconds).toBe(45);
  });

  it('keeps only the columns the row declares, whatever else the view returns', async () => {
    stub.result = { data: { ...rowWithCount(45), something_new: 'x' }, error: null };

    const status = await run<Record<string, unknown>>(statusOptions());

    expect(Object.keys(status).sort()).toEqual([
      'oldest_open_at',
      'open_requests',
      'polled_age_seconds',
      'polled_at',
      'runner',
    ]);
  });

  it('stamps the row with the page`s own count at the read', async () => {
    vi.useFakeTimers({ now: DB_NOW });
    vi.advanceTimersByTime(7_000);
    stub.result = { data: rowWithCount(45), error: null };

    const status = await run<object>(statusOptions());

    expect(readAtMs(status)).toBe(monotonicNowMs());
    // A row with the same fields that this page did not read has no moment.
    expect(readAtMs(normalizeStatus(rowWithCount(45)))).toBeNull();
  });

  it('gives a second read its own moment even when the row has not changed', async () => {
    vi.useFakeTimers({ now: DB_NOW });
    const client = new QueryClient();
    // The runner beats every 30 s and the page reads every 30 s: the same count twice.
    stub.result = { data: rowWithCount(10), error: null };

    await client.fetchQuery(statusOptions());
    const first = client.getQueryData(workspaceKeys.status());
    vi.advanceTimersByTime(30_000);
    await client.fetchQuery(statusOptions());
    const second = client.getQueryData(workspaceKeys.status());

    expect(statusOptions().structuralSharing).toBe(false);
    expect(second).toEqual(first);
    expect(readAtMs(second as object)).toBe(monotonicNowMs());
    expect(readAtMs(second as object)).toBe((readAtMs(first as object) ?? 0) + 30_000);
  });
});
