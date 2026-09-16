/**
 * The planner-events query layer against a recording Supabase stub.
 *
 * What matters:
 *   * every read and write reaches `planner_events` and nothing else — never
 *     `assignments` or `assignment_progress` (Q4);
 *   * a draft the database would refuse is refused here first, with no request;
 *   * writes are optimistic on every cached week window and roll back on error —
 *     only the row they touched, so overlapping writes do not undo each other;
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
  /** Per-request results, taken in call order; `result` once these run out. */
  results: [] as { data: unknown; error: { message: string } | null }[],
  /** When set, the terminal await waits on this promise first. */
  gate: null as Promise<void> | null,
}));

function builder(table: string) {
  const record = (op: string) => (...args: unknown[]) => {
    stub.calls.push({ table, op, args });
    return chain;
  };
  const settle = async () => {
    // Taken when the request is made, not when it resolves.
    const result = stub.results.shift() ?? stub.result;
    if (stub.gate) await stub.gate;
    return result;
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
  stub.results = [];
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

describe('overlapping writes (R2-5)', () => {
  const A = makePlannerEvent({ id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Advising' });
  const B = makePlannerEvent({
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    title: 'Study group',
    starts_at: '2026-09-17T13:00:00.000Z',
    ends_at: '2026-09-17T14:00:00.000Z',
  });

  function titles(queryClient: QueryClient) {
    return queryClient.getQueryData<{ title: string }[]>(WEEK_KEY)?.map((row) => row.title);
  }

  it('rolls back only the failed row: a second write in flight keeps its change', async () => {
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, [A, B]);
    const open = holdWrites();
    stub.results = [
      { data: null, error: { message: 'first refused' } },
      { data: { ...B, title: 'Study group (moved)' }, error: null },
    ];
    const first = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });
    const second = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });

    first.result.current.mutate({ current: A, patch: { title: 'Advising (renamed)' } });
    await waitFor(() => expect(titles(queryClient)).toContain('Advising (renamed)'));
    second.result.current.mutate({ current: B, patch: { title: 'Study group (moved)' } });
    await waitFor(() => expect(titles(queryClient)).toContain('Study group (moved)'));

    open();
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(titles(queryClient)).toEqual(['Advising', 'Study group (moved)']);
  });

  it('a failed delete puts its row back without dropping a create made meanwhile', async () => {
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, [A]);
    const open = holdWrites();
    stub.results = [
      { data: null, error: { message: 'delete refused' } },
      { data: B, error: null },
    ];
    const remove = renderHook(() => useDeletePlannerEvent(), { wrapper: wrapper(queryClient) });
    const create = renderHook(() => useCreatePlannerEvent(), { wrapper: wrapper(queryClient) });

    remove.result.current.mutate(A);
    await waitFor(() => expect(titles(queryClient)).toEqual([]));
    create.result.current.mutate(makePlannerEventDraft({
      title: 'Study group',
      starts_at: B.starts_at,
      ends_at: B.ends_at,
    }));
    await waitFor(() => expect(titles(queryClient)).toEqual(['Study group']));

    open();
    await waitFor(() => expect(remove.result.current.isError).toBe(true));
    await waitFor(() => expect(create.result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData<{ id: string }[]>(WEEK_KEY)?.map((row) => row.id)).toEqual([
      A.id,
      B.id,
    ]);
  });

  it('leaves a row alone when a later write on the same row is still in flight', async () => {
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, [A]);
    const open = holdWrites();
    stub.results = [
      { data: null, error: { message: 'first refused' } },
      { data: { ...A, title: 'Second title' }, error: null },
    ];
    const first = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });
    const second = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });

    first.result.current.mutate({ current: A, patch: { title: 'First title' } });
    await waitFor(() => expect(titles(queryClient)).toEqual(['First title']));
    second.result.current.mutate({ current: A, patch: { title: 'Second title' } });
    await waitFor(() => expect(titles(queryClient)).toEqual(['Second title']));

    open();
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    expect(titles(queryClient)).toEqual(['Second title']);
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
  });

  it('waits for the last write to settle before marking the weeks stale', async () => {
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, [A, B]);
    let openFirst = () => {};
    let openSecond = () => {};
    const firstGate = new Promise<void>((resolve) => (openFirst = resolve));
    const secondGate = new Promise<void>((resolve) => (openSecond = resolve));
    stub.results = [
      { data: { ...A, done: null }, error: null },
      { data: { ...B }, error: null },
    ];
    const first = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });
    const second = renderHook(() => useUpdatePlannerEvent(), { wrapper: wrapper(queryClient) });

    stub.gate = firstGate;
    first.result.current.mutate({ current: A, patch: { title: 'A2' } });
    await waitFor(() => expect(opsOf('single')).toHaveLength(1));
    stub.gate = secondGate;
    second.result.current.mutate({ current: B, patch: { title: 'B2' } });
    await waitFor(() => expect(opsOf('single')).toHaveLength(2));

    openFirst();
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(WEEK_KEY)?.isInvalidated).toBe(false);

    openSecond();
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(queryClient.getQueryState(WEEK_KEY)?.isInvalidated).toBe(true));
  });
});
