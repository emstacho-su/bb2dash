/**
 * The /inbox-apply half of the sync loop — the second agent request kind.
 *
 * `agent_requests.kind` gained `'inbox_feedback'` in migration 077, and the
 * Inbox now has its own request button beside Sync. What is asserted here is
 * the contract that button stands on:
 *
 *   * the command string, character for character, and the id validation that
 *     stops a filter being built around a non-id;
 *   * which kinds the write boundary lets through, and that an unknown one is
 *     refused before anything reaches Postgres;
 *   * that the open-request lookup is now per kind — the Sync button's lookup
 *     is unchanged, and the Inbox's asks for `inbox_feedback` rows only. Two
 *     buttons sharing one "is anything open?" query would each show the other's
 *     request as its own;
 *   * how many rows `v_inbox_queue` holds, asked as a head count;
 *   * that filing a request refreshes BOTH buttons' lookups;
 *   * and that the app itself never writes `archived` — only the worker does.
 *
 * The Supabase browser client is a recording stub, the same shape
 * `queries.plannerEvents.test.tsx` uses, so every request is asserted rather
 * than guessed. Nothing touches the network.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  /** What the terminal await resolves to. `count` is set for head counts. */
  result: {
    data: null as unknown,
    error: null as { message: string } | null,
    count: null as number | null,
  },
}));

function builder(table: string) {
  const record = (op: string) => (...args: unknown[]) => {
    stub.calls.push({ table, op, args });
    return chain;
  };
  const settle = async () => stub.result;
  const terminal = (op: string) => (...args: unknown[]) => {
    stub.calls.push({ table, op, args });
    return settle();
  };
  const chain: Record<string, unknown> = {
    select: record('select'),
    insert: record('insert'),
    update: record('update'),
    eq: record('eq'),
    in: record('in'),
    order: record('order'),
    limit: record('limit'),
    maybeSingle: terminal('maybeSingle'),
    single: terminal('single'),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => builder(table) }),
}));

const {
  buildResolutionPatch,
  createAgentRequest,
  inboxApplyCommand,
  inboxQueueCountOptions,
  openInboxApplyRequestOptions,
  openSyncRequestOptions,
  syncKeys,
  useCreateAgentRequest,
  useResolveAttentionItem,
} = await import('@/lib/queries.sync');

beforeEach(() => {
  stub.calls = [];
  stub.result = { data: null, error: null, count: null };
});

/** Run a `queryOptions` object's `queryFn` the way react-query would. */
function run<T>(options: { queryFn?: unknown }): Promise<T> {
  const queryFn = options.queryFn as (context: { signal?: AbortSignal }) => Promise<T>;
  return queryFn({});
}

/** The arguments of the one call to `op`, or undefined if it was never made. */
function argsOf(op: string): unknown[] | undefined {
  return stub.calls.find((call) => call.op === op)?.args;
}

describe('inboxApplyCommand — the exact command Stack pastes', () => {
  it('is claude "/inbox-apply <request id>"', () => {
    expect(inboxApplyCommand(42)).toBe('claude "/inbox-apply 42"');
  });

  it('refuses to build a command around a non-id, like syncCommand does', () => {
    expect(() => inboxApplyCommand(0)).toThrow(/positive integer/);
    expect(() => inboxApplyCommand(-1)).toThrow(/positive integer/);
    expect(() => inboxApplyCommand(1.5)).toThrow(/positive integer/);
  });
});

describe('createAgentRequest — which kinds the boundary allows', () => {
  it('files an inbox_feedback request', async () => {
    stub.result.data = { id: 5, kind: 'inbox_feedback', state: 'queued' };
    const row = await createAgentRequest({ kind: 'inbox_feedback', scope: 'all' });

    expect(row.id).toBe(5);
    expect(stub.calls[0].table).toBe('agent_requests');
    expect(argsOf('insert')?.[0]).toEqual({
      kind: 'inbox_feedback',
      scope: 'all',
      params: {},
      note: null,
    });
  });

  it('still files a sync request', async () => {
    stub.result.data = { id: 6, kind: 'sync', state: 'queued' };
    await createAgentRequest({ kind: 'sync', scope: 'all' });
    expect((argsOf('insert')?.[0] as { kind: string }).kind).toBe('sync');
  });

  it('refuses a kind the check constraint does not list, and sends nothing', async () => {
    await expect(
      createAgentRequest({ kind: 'archive' as never, scope: 'all' }),
    ).rejects.toThrow(/not allowed/);
    expect(stub.calls).toEqual([]);
  });
});

describe('the open-request lookup is per kind', () => {
  it('leaves the Sync button asking for sync rows, under its own key', async () => {
    await run(openSyncRequestOptions());
    expect(argsOf('eq')).toEqual(['kind', 'sync']);
    expect(argsOf('in')).toEqual(['state', ['queued', 'claimed']]);
    expect(openSyncRequestOptions().queryKey).toEqual(syncKeys.openSyncRequest());
  });

  it('asks for the newest open inbox_feedback row for the Inbox button', async () => {
    stub.result.data = { id: 8, kind: 'inbox_feedback', state: 'claimed' };
    const open = await run<{ id: number } | null>(openInboxApplyRequestOptions());

    expect(open?.id).toBe(8);
    expect(stub.calls[0].table).toBe('agent_requests');
    expect(argsOf('eq')).toEqual(['kind', 'inbox_feedback']);
    expect(argsOf('in')).toEqual(['state', ['queued', 'claimed']]);
    expect(argsOf('order')).toEqual(['created_at', { ascending: false }]);
    expect(argsOf('limit')).toEqual([1]);
  });

  it('keys the two lookups apart, so neither shows the other request as its own', () => {
    expect(openInboxApplyRequestOptions().queryKey).toEqual(syncKeys.openRequest('inbox_feedback'));
    expect(syncKeys.openRequest('inbox_feedback')).not.toEqual(syncKeys.openRequest('sync'));
    expect(openInboxApplyRequestOptions().queryKey).not.toEqual(syncKeys.openSyncRequest());
  });
});

describe('inboxQueueCountOptions — how many answers are waiting', () => {
  it('asks v_inbox_queue for a head count and nothing else', async () => {
    stub.result.count = 3;
    const count = await run<number>(inboxQueueCountOptions());

    expect(count).toBe(3);
    expect(stub.calls[0].table).toBe('v_inbox_queue');
    expect(argsOf('select')).toEqual(['id', { count: 'exact', head: true }]);
  });

  it('reads a missing count as zero rather than inventing one', async () => {
    stub.result.count = null;
    expect(await run<number>(inboxQueueCountOptions())).toBe(0);
  });

  it('throws the Postgres error rather than showing a count of nothing', async () => {
    stub.result.error = { message: 'permission denied for view v_inbox_queue' };
    await expect(run(inboxQueueCountOptions())).rejects.toThrow(/permission denied/);
  });
});

describe('useCreateAgentRequest — what a filed request refreshes', () => {
  function wrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  it('invalidates both open-request lookups and the queue count', async () => {
    stub.result.data = { id: 9, kind: 'inbox_feedback', state: 'queued' };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateAgentRequest(), {
      wrapper: wrapper(queryClient),
    });
    await result.current.mutateAsync({ kind: 'inbox_feedback', scope: 'all' });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(syncKeys.openSyncRequest());
    expect(keys).toContainEqual(syncKeys.openRequest('inbox_feedback'));
    expect(keys).toContainEqual(syncKeys.inboxQueueCount());
  });
});

describe('useResolveAttentionItem — answering a row moves the queue count', () => {
  function wrapper(queryClient: QueryClient) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
  }

  it('invalidates the queue count as well as the list and the status', async () => {
    stub.result.data = null;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useResolveAttentionItem(), {
      wrapper: wrapper(queryClient),
    });
    await result.current.mutateAsync({ id: 7, kind: 'conflict', accept: 'keep' });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).toContainEqual(syncKeys.attentionAll());
    expect(keys).toContainEqual(syncKeys.status());
    expect(keys).toContainEqual(syncKeys.inboxQueueCount());
  });
});

describe('the app never archives a row — only the worker does', () => {
  it('builds no resolution patch whose state is archived', () => {
    const patches = [
      buildResolutionPatch({ id: 1, kind: 'conflict', accept: 'blackboard' }),
      buildResolutionPatch({ id: 1, kind: 'conflict', accept: 'keep' }),
      buildResolutionPatch({ id: 1, kind: 'missing', answer: 'Group 4', answerType: 'text' }),
      buildResolutionPatch({
        id: 1,
        kind: 'stack_must_confirm',
        answer: '2026-10-01',
        answerType: 'date',
      }),
      buildResolutionPatch({ id: 1, kind: 'deadline' }),
      buildResolutionPatch({ id: 1, kind: 'data_gap' }),
    ];
    expect(patches.map((patch) => patch.state)).toEqual([
      'resolved',
      'resolved',
      'resolved',
      'resolved',
      'dismissed',
      'dismissed',
    ]);
    for (const patch of patches) {
      expect(Object.keys(patch)).not.toContain('archived_at');
      expect(Object.keys(patch)).not.toContain('decision');
    }
  });
});
