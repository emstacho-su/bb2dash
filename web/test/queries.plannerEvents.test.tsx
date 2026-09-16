/**
 * The planner-events query layer against a recording Supabase stub.
 *
 * What matters:
 *   * every read and write reaches `planner_events` and nothing else — never
 *     `assignments` or `assignment_progress` (Q4);
 *   * a draft the database would refuse is refused here first, with no request;
 *   * writes are optimistic on every cached week window and roll back on error;
 *   * the task checkbox's update sends `done` alone.
 *
 * Nothing touches the network, so nothing can reach Stack's Google calendar.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePlannerEvent, makePlannerEventDraft } from './factories.plannerEvents';

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  /** What the terminal await resolves to, per operation. */
  result: { data: null as unknown, error: null as { message: string } | null },
  /** When set, the terminal await waits on this promise first. */
  gate: null as Promise<void> | null,
}));

function builder(table: string) {
  const record = (op: string) => (...args: unknown[]) => {
    stub.calls.push({ table, op, args });
    return chain;
  };
  const settle = async () => {
    if (stub.gate) await stub.gate;
    return stub.result;
  };
  const chain: Record<string, unknown> = {
    select: record('select'),
    insert: record('insert'),
    update: record('update'),
    delete: record('delete'),
    eq: record('eq'),
    lt: record('lt'),
    gte: record('gte'),
    order: record('order'),
    single: (...args: unknown[]) => {
      stub.calls.push({ table, op: 'single', args });
      return settle();
    },
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => builder(table) }),
}));

const {
  plannerEventKeys,
  plannerEventsWindowOptions,
  useCreatePlannerEvent,
  useDeletePlannerEvent,
  useUpdatePlannerEvent,
  isOptimisticEvent,
} = await import('@/lib/queries.plannerEvents');
const { PlannerEventValidationError } = await import('@/lib/planner-events');

const WEEK_KEY = plannerEventKeys.window('2026-09-14', '2026-09-20');
const NEXT_WEEK_KEY = plannerEventKeys.window('2026-09-21', '2026-09-27');

function client(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function tablesTouched(): string[] {
  return [...new Set(stub.calls.map((call) => call.table))];
}

function opsOf(op: string): Call[] {
  return stub.calls.filter((call) => call.op === op);
}

/** A gate the test opens by hand, so the optimistic state can be inspected. */
function holdWrites(): () => void {
  let open = () => {};
  stub.gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return open;
}

beforeEach(() => {
  stub.calls = [];
  stub.result = { data: null, error: null };
  stub.gate = null;
});

describe('plannerEventsWindowOptions', () => {
  it("reads planner_events with K-9's overlap predicate on New York midnights", async () => {
    stub.result = { data: [makePlannerEvent()], error: null };
    const rows = await client().fetchQuery(plannerEventsWindowOptions('2026-09-14', '2026-09-20'));

    expect(rows).toHaveLength(1);
    expect(tablesTouched()).toEqual(['planner_events']);
    expect(opsOf('lt')[0].args).toEqual(['starts_at', '2026-09-21T04:00:00.000Z']);
    expect(opsOf('gte')[0].args).toEqual(['ends_at', '2026-09-14T04:00:00.000Z']);
  });

  it('keys each week separately under one prefix', () => {
    expect(plannerEventsWindowOptions('2026-09-14', '2026-09-20').queryKey).toEqual(WEEK_KEY);
    expect(WEEK_KEY.slice(0, 2)).toEqual(plannerEventKeys.windows());
  });

  it('throws the database error rather than returning an empty week', async () => {
    stub.result = { data: null, error: { message: 'permission denied' } };
    await expect(
      client().fetchQuery(plannerEventsWindowOptions('2026-09-14', '2026-09-20')),
    ).rejects.toMatchObject({ message: 'permission denied' });
  });

  it('refuses a window that is not made of dates', async () => {
    await expect(client().fetchQuery(plannerEventsWindowOptions('soon', 'later'))).rejects.toThrow(
      /Not a date window/,
    );
    expect(stub.calls).toEqual([]);
  });
});

describe('useCreatePlannerEvent', () => {
  it('inserts the validated draft into planner_events only', async () => {
    const saved = makePlannerEvent({ title: 'Advising' });
    stub.result = { data: saved, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useCreatePlannerEvent(), { wrapper: wrapper(queryClient) });

    result.current.mutate(makePlannerEventDraft({ title: '  Advising ' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tablesTouched()).toEqual(['planner_events']);
    expect(tablesTouched()).not.toContain('assignments');
    expect(tablesTouched()).not.toContain('assignment_progress');
    expect(opsOf('insert')[0].args[0]).toMatchObject({ title: 'Advising', kind: 'event' });
  });

  it('refuses an invalid draft with field errors and sends nothing', async () => {
    const { result } = renderHook(() => useCreatePlannerEvent(), { wrapper: wrapper(client()) });

    result.current.mutate(
      makePlannerEventDraft({ title: ' ', location_kind: 'online', location: 'javascript:alert(1)' }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(PlannerEventValidationError);
    expect(Object.keys((result.current.error as InstanceType<typeof PlannerEventValidationError>).errors).sort()).toEqual([
      'location',
      'title',
    ]);
    expect(stub.calls).toEqual([]);
  });

  it('shows the event in the matching week at once, and rolls back when the insert fails', async () => {
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, []);
    queryClient.setQueryData(NEXT_WEEK_KEY, []);
    const open = holdWrites();
    stub.result = { data: null, error: { message: 'insert refused' } };
    const { result } = renderHook(() => useCreatePlannerEvent(), { wrapper: wrapper(queryClient) });

    result.current.mutate(makePlannerEventDraft());
    await waitFor(() =>
      expect(queryClient.getQueryData<{ id: string }[]>(WEEK_KEY)).toHaveLength(1),
    );
    const optimistic = queryClient.getQueryData<{ id: string }[]>(WEEK_KEY)![0];
    expect(isOptimisticEvent(optimistic)).toBe(true);
    expect(queryClient.getQueryData(NEXT_WEEK_KEY)).toEqual([]);

    open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(WEEK_KEY)).toEqual([]);
  });

  it('swaps the stand-in for the saved row on success', async () => {
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, []);
    const saved = makePlannerEvent();
    stub.result = { data: saved, error: null };
    const { result } = renderHook(() => useCreatePlannerEvent(), { wrapper: wrapper(queryClient) });

    result.current.mutate(makePlannerEventDraft());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(WEEK_KEY)).toEqual([saved]);
    expect(queryClient.getQueryState(WEEK_KEY)?.isInvalidated).toBe(true);
  });
});

describe('useUpdatePlannerEvent', () => {
  it('sends only the patched column — the task checkbox writes done alone', async () => {
    const task = makePlannerEvent({ kind: 'task', done: false });
    stub.result = { data: { ...task, done: true }, error: null };
    const { result } = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(client()) });

    result.current.mutate({ current: task, patch: { done: true } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tablesTouched()).toEqual(['planner_events']);
    expect(opsOf('update')[0].args[0]).toEqual({ done: true });
    expect(opsOf('eq')[0].args).toEqual(['id', task.id]);
  });

  it('validates the merged row: a later start than the stored end is refused', async () => {
    const event = makePlannerEvent();
    const { result } = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(client()) });

    result.current.mutate({ current: event, patch: { starts_at: '2026-09-16T15:00:00.000Z' } });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBeInstanceOf(PlannerEventValidationError);
    expect(stub.calls).toEqual([]);
  });

  it('moves an event between cached weeks at once, and back when the update fails', async () => {
    const event = makePlannerEvent();
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, [event]);
    queryClient.setQueryData(NEXT_WEEK_KEY, []);
    const open = holdWrites();
    stub.result = { data: null, error: { message: 'update refused' } };
    const { result } = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });

    result.current.mutate({
      current: event,
      patch: { starts_at: '2026-09-23T13:00:00.000Z', ends_at: '2026-09-23T14:00:00.000Z' },
    });
    await waitFor(() => expect(queryClient.getQueryData(WEEK_KEY)).toEqual([]));
    expect(queryClient.getQueryData<{ id: string }[]>(NEXT_WEEK_KEY)?.map((r) => r.id)).toEqual([
      event.id,
    ]);

    open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(WEEK_KEY)).toEqual([event]);
    expect(queryClient.getQueryData(NEXT_WEEK_KEY)).toEqual([]);
  });

  it('refuses to edit a row that is still being created', async () => {
    const { result } = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(client()) });
    result.current.mutate({
      current: makePlannerEvent({ id: 'optimistic:1' }),
      patch: { title: 'x' },
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(stub.calls).toEqual([]);
  });
});

describe('useDeletePlannerEvent', () => {
  it('deletes from planner_events by id only', async () => {
    const event = makePlannerEvent();
    stub.result = { data: [{ id: event.id }], error: null };
    const { result } = renderHook(() => useDeletePlannerEvent(), { wrapper: wrapper(client()) });

    result.current.mutate(event);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(tablesTouched()).toEqual(['planner_events']);
    expect(opsOf('delete')).toHaveLength(1);
    expect(opsOf('eq')[0].args).toEqual(['id', event.id]);
  });

  it('removes the block at once and restores it when the delete fails', async () => {
    const event = makePlannerEvent();
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, [event]);
    const open = holdWrites();
    stub.result = { data: null, error: { message: 'delete refused' } };
    const { result } = renderHook(() => useDeletePlannerEvent(), { wrapper: wrapper(queryClient) });

    result.current.mutate(event);
    await waitFor(() => expect(queryClient.getQueryData(WEEK_KEY)).toEqual([]));

    open();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(WEEK_KEY)).toEqual([event]);
  });

  it('treats a delete that matched no row as a failure', async () => {
    stub.result = { data: [], error: null };
    const { result } = renderHook(() => useDeletePlannerEvent(), { wrapper: wrapper(client()) });

    result.current.mutate(makePlannerEvent());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toMatch(/not found/);
  });
});
