/**
 * Planner-state writes have to reach every cache that shows the same fact.
 *
 * The two mutations are driven for real here against a real QueryClient with
 * the four caches seeded; only Supabase is a spy. Before the shared fan-out,
 * `useSetItemStatus` patched the `['work-items']` prefix and nothing else — so
 * a status changed on the course Stream (`['course-work-items', …]`,
 * staleTime 5 min) snapped straight back, and one changed on Home left the
 * popout's planner row (`['popout', 'assignment-progress', …]`) stale for a
 * minute. These tests fail on that behaviour.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';

const spies = vi.hoisted(() => {
  const upsert = vi.fn(async () => ({ error: null as { message: string } | null }));
  const from = vi.fn(() => ({ upsert }));
  return { upsert, from };
});

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: spies.from }),
}));

const { useSetItemStatus } = await import('@/lib/queries.today');
const { useSavePlanner } = await import('@/lib/queries.popout');
const {
  WORK_ITEMS_KEY,
  COURSE_WORK_ITEMS_KEY,
  SERIES_KEY,
  assignmentProgressKey,
} = await import('@/lib/progress-cache');

const ITEM_ID = 'IST.323/lab-1';

const HOME_KEY = [...WORK_ITEMS_KEY, 'window', '2026-09-07', '2026-11-01'];
const COURSE_KEY = [...COURSE_WORK_ITEMS_KEY, 'IST.323'];
const SERIES_CACHE_KEY = [...SERIES_KEY, 'IST.323', 'labs'];
const PROGRESS_KEY = assignmentProgressKey(ITEM_ID);

function seededClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(HOME_KEY, [makeWorkItem({ item_id: ITEM_ID, status: 'not_started' })]);
  client.setQueryData(COURSE_KEY, [makeWorkItem({ item_id: ITEM_ID, status: 'not_started' })]);
  client.setQueryData(SERIES_CACHE_KEY, [makeWorkItem({ item_id: ITEM_ID, status: 'not_started' })]);
  client.setQueryData(PROGRESS_KEY, {
    assignment_id: ITEM_ID,
    status: 'not_started',
    priority: 'normal',
    notes: null,
  });
  return client;
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function statusIn(client: QueryClient, key: readonly unknown[]): string | undefined {
  return client.getQueryData<{ status: string }[]>(key)?.[0]?.status;
}

beforeEach(() => {
  spies.from.mockClear();
  spies.upsert.mockClear();
  spies.upsert.mockImplementation(async () => ({ error: null }));
});

describe('useSetItemStatus — the caches it patches', () => {
  it('patches Home, the course Stream, the series strip and the planner row', async () => {
    const client = seededClient();
    const { result } = renderHook(() => useSetItemStatus(), { wrapper: wrapper(client) });

    result.current.mutate({
      item: { item_kind: 'assignment', item_id: ITEM_ID },
      status: 'in_progress',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(statusIn(client, HOME_KEY)).toBe('in_progress');
    expect(statusIn(client, COURSE_KEY)).toBe('in_progress');
    expect(statusIn(client, SERIES_CACHE_KEY)).toBe('in_progress');
    expect(
      client.getQueryData<{ status: string }>(PROGRESS_KEY)?.status,
    ).toBe('in_progress');
  });

  it('marks every one of those caches stale so the 5-minute ones refetch', async () => {
    const client = seededClient();
    const { result } = renderHook(() => useSetItemStatus(), { wrapper: wrapper(client) });

    result.current.mutate({
      item: { item_kind: 'assignment', item_id: ITEM_ID },
      status: 'submitted',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    for (const key of [HOME_KEY, COURSE_KEY, SERIES_CACHE_KEY, PROGRESS_KEY]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it('rolls every cache back when the write fails', async () => {
    spies.upsert.mockImplementation(async () => ({ error: { message: 'permission denied' } }));
    const client = seededClient();
    const { result } = renderHook(() => useSetItemStatus(), { wrapper: wrapper(client) });

    result.current.mutate({
      item: { item_kind: 'assignment', item_id: ITEM_ID },
      status: 'graded',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(statusIn(client, HOME_KEY)).toBe('not_started');
    expect(statusIn(client, COURSE_KEY)).toBe('not_started');
    expect(client.getQueryData<{ status: string }>(PROGRESS_KEY)?.status).toBe('not_started');
  });

  it('leaves a reading alone in the assignment-progress cache', async () => {
    const client = seededClient();
    client.setQueryData(COURSE_KEY, [
      makeWorkItem({ item_kind: 'reading', item_id: '42', status: 'not_started' }),
    ]);
    const { result } = renderHook(() => useSetItemStatus(), { wrapper: wrapper(client) });

    result.current.mutate({ item: { item_kind: 'reading', item_id: '42' }, status: 'planned' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(statusIn(client, COURSE_KEY)).toBe('planned');
    // The assignment's planner row is a different item and must not move.
    expect(client.getQueryData<{ status: string }>(PROGRESS_KEY)?.status).toBe('not_started');
  });
});

describe('useSavePlanner — the caches it patches', () => {
  it('carries a status change out to the course Stream, not just the popout', async () => {
    const client = seededClient();
    const { result } = renderHook(() => useSavePlanner(), { wrapper: wrapper(client) });

    result.current.mutate({ assignmentId: ITEM_ID, patch: { status: 'in_progress' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(statusIn(client, COURSE_KEY)).toBe('in_progress');
    expect(statusIn(client, HOME_KEY)).toBe('in_progress');
    expect(client.getQueryState(COURSE_KEY)?.isInvalidated).toBe(true);
  });

  it('writes a non-status field to the planner row and leaves the lists untouched', async () => {
    const client = seededClient();
    const { result } = renderHook(() => useSavePlanner(), { wrapper: wrapper(client) });

    result.current.mutate({ assignmentId: ITEM_ID, patch: { notes: 'draft in Docs' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData<{ notes: string }>(PROGRESS_KEY)?.notes).toBe('draft in Docs');
    expect(statusIn(client, HOME_KEY)).toBe('not_started');
  });

  it('never invents a planner row that has not been fetched', async () => {
    const client = seededClient();
    client.removeQueries({ queryKey: PROGRESS_KEY });
    const { result } = renderHook(() => useSavePlanner(), { wrapper: wrapper(client) });

    result.current.mutate({ assignmentId: ITEM_ID, patch: { notes: 'typed anyway' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(PROGRESS_KEY)).toBeUndefined();
  });
});
