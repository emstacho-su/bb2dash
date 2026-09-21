/**
 * The planner-series query layer against a recording Supabase stub (T-1).
 *
 * What matters:
 *   * the three writes go through 083's RPCs, with exactly the arguments the
 *     frozen contract names — a wrong `p_scope` or `p_from` would delete or
 *     rewrite occurrences on Stack's real Google calendar;
 *   * `p_rows` carries the insert columns, and carries **ids** on an update, so
 *     the push patches Google events rather than replacing them;
 *   * a series the database would refuse (over the cap, or a draft that fails
 *     067's checks) is refused here first, with no request at all;
 *   * every write is optimistic across the cached weeks and rolls back on
 *     error, one row at a time;
 *   * nothing here reads or writes `assignments` or `assignment_progress` (Q4).
 *
 * Nothing touches the network, so nothing can reach Stack's Google calendar.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makePlannerEvent, makePlannerEventDraft } from './factories.plannerEvents';
import type { PlannerEventRow } from '@/lib/planner-events';

interface Call {
  table: string;
  op: string;
  args: unknown[];
}

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  /** Rows the in-scope read resolves with. */
  rows: [] as unknown[],
  /** What the next rpc resolves with. */
  rpc: { data: null as unknown, error: null as { message: string } | null },
  readError: null as { message: string } | null,
  /** What a plain update or delete on the opened row resolves to (TR-2). */
  write: { data: [{ id: 'written' }] as unknown, error: null as { message: string } | null },
}));

function builder(table: string) {
  let writing = false;
  const record = (op: string) => (...args: unknown[]) => {
    stub.calls.push({ table, op, args });
    return chain;
  };
  const write = (op: string) => (...args: unknown[]) => {
    writing = true;
    stub.calls.push({ table, op, args });
    return chain;
  };
  const settle = async () =>
    writing ? stub.write : { data: stub.rows, error: stub.readError };
  const chain: Record<string, unknown> = {
    select: record('select'),
    eq: record('eq'),
    gte: record('gte'),
    lt: record('lt'),
    order: record('order'),
    update: write('update'),
    delete: write('delete'),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => builder(table),
    rpc: async (name: string, args: unknown) => {
      stub.calls.push({ table: 'rpc', op: name, args: [args] });
      return stub.rpc;
    },
  }),
}));

const { plannerEventKeys, OPTIMISTIC_ID_PREFIX } = await import('@/lib/queries.plannerEvents');
const {
  SERIES_SCOPE_SAFETY_MS,
  useCreatePlannerSeries,
  useDeletePlannerSeries,
  useUpdatePlannerSeries,
} = await import('@/lib/queries.plannerSeries');
const { PlannerEventValidationError } = await import('@/lib/planner-events');
const { expandSeries, hasExplicitOffset, MAX_SERIES_OCCURRENCES } = await import(
  '@/lib/planner-recurrence'
);

const NY = 'America/New_York';
const SERIES_ID = '99999999-9999-4999-8999-999999999999';
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

function rpcCall(name: string): Record<string, unknown> | undefined {
  const call = stub.calls.find((entry) => entry.table === 'rpc' && entry.op === name);
  return call?.args[0] as Record<string, unknown> | undefined;
}

function tablesTouched(): string[] {
  return [...new Set(stub.calls.map((call) => call.table))];
}

/** Three weekly Wednesdays, all in one series, as the server would return them. */
function seriesRows(): (PlannerEventRow & { series_id: string; series_detached: boolean })[] {
  return [
    { starts_at: '2026-09-16T13:00:00.000Z', ends_at: '2026-09-16T14:00:00.000Z', id: 'w1' },
    { starts_at: '2026-09-23T13:00:00.000Z', ends_at: '2026-09-23T14:00:00.000Z', id: 'w2' },
    { starts_at: '2026-09-30T13:00:00.000Z', ends_at: '2026-09-30T14:00:00.000Z', id: 'w3' },
  ].map((row) => ({
    ...makePlannerEvent(row),
    series_id: SERIES_ID,
    series_detached: false,
  }));
}

beforeEach(() => {
  stub.calls = [];
  stub.rows = [];
  stub.rpc = { data: null, error: null };
  stub.readError = null;
  stub.write = { data: [{ id: 'written' }], error: null };
});

describe('useCreatePlannerSeries', () => {
  const weekly = () => {
    const result = expandSeries(makePlannerEventDraft(), 'weekly', '2026-09-30', NY);
    if (!result.ok) throw new Error('fixture');
    return result.rows;
  };

  it('calls planner_series_create with the rule and the finished rows', async () => {
    stub.rpc = { data: SERIES_ID, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useCreatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    const id = await result.current.mutateAsync({ freq: 'weekly', until: '2026-09-30', rows: weekly() });

    expect(id).toBe(SERIES_ID);
    const args = rpcCall('planner_series_create');
    expect(args?.p_freq).toBe('weekly');
    expect(args?.p_until).toBe('2026-09-30');
    expect(args?.p_rows).toHaveLength(3);
    // The insert columns only — no id, no created_at.
    expect(Object.keys((args?.p_rows as unknown[])[0] as object).sort()).toEqual(
      [
        'all_day',
        'course_id',
        'done',
        'ends_at',
        'kind',
        'location',
        'location_kind',
        'notes',
        'starts_at',
        'time_zone',
        'title',
      ].sort(),
    );
    expect(tablesTouched()).toEqual(['rpc']);
  });

  it('shows every occurrence in the weeks it belongs to before the write lands', async () => {
    stub.rpc = { data: SERIES_ID, error: null };
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, []);
    queryClient.setQueryData(NEXT_WEEK_KEY, []);
    const { result } = renderHook(() => useCreatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync({ freq: 'weekly', until: '2026-09-30', rows: weekly() });

    // Two of the three Wednesdays fall in the two cached weeks, one each.
    const thisWeek = queryClient.getQueryData<PlannerEventRow[]>(WEEK_KEY) ?? [];
    const nextWeek = queryClient.getQueryData<PlannerEventRow[]>(NEXT_WEEK_KEY) ?? [];
    expect(thisWeek).toHaveLength(1);
    expect(nextWeek).toHaveLength(1);
    expect(thisWeek[0].id.startsWith(OPTIMISTIC_ID_PREFIX)).toBe(true);
  });

  it('writes each cached week once, however many rows it patches (TR-9)', async () => {
    stub.rpc = { data: null, error: { message: 'insert refused' } };
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, []);
    queryClient.setQueryData(NEXT_WEEK_KEY, []);
    const setQueryData = vi.spyOn(queryClient, 'setQueryData');
    const { result } = renderHook(() => useCreatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ freq: 'weekly', until: '2026-09-30', rows: weekly() }),
    ).rejects.toThrow();

    // Three rows across two cached weeks: two writes going out, two coming
    // back — not six and six. Every write notifies every observer of that week.
    const windowWrites = setQueryData.mock.calls.filter(
      ([key]) => Array.isArray(key) && key[1] === 'window',
    );
    expect(windowWrites).toHaveLength(4);
    setQueryData.mockRestore();
  });

  it('puts the weeks back when the RPC refuses the series', async () => {
    stub.rpc = { data: null, error: { message: 'series would exceed 52 rows' } };
    const queryClient = client();
    queryClient.setQueryData(WEEK_KEY, []);
    const { result } = renderHook(() => useCreatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ freq: 'weekly', until: '2026-09-30', rows: weekly() }),
    ).rejects.toThrow(/52/);

    await waitFor(() => expect(queryClient.getQueryData(WEEK_KEY)).toEqual([]));
  });

  it('refuses more than the cap without making a request', async () => {
    const queryClient = client();
    const { result } = renderHook(() => useCreatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });
    const rows = Array.from({ length: MAX_SERIES_OCCURRENCES + 1 }, (_, index) =>
      makePlannerEventDraft({
        starts_at: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T13:00:00.000Z`,
        ends_at: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T14:00:00.000Z`,
      }),
    );

    await expect(
      result.current.mutateAsync({ freq: 'daily', until: '2027-09-30', rows }),
    ).rejects.toThrow(new RegExp(String(MAX_SERIES_OCCURRENCES)));
    expect(stub.calls).toEqual([]);
  });

  it('refuses a draft 067 would refuse, without making a request', async () => {
    const queryClient = client();
    const { result } = renderHook(() => useCreatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        freq: 'weekly',
        until: '2026-09-30',
        rows: [makePlannerEventDraft({ title: '   ' })],
      }),
    ).rejects.toBeInstanceOf(PlannerEventValidationError);
    expect(stub.calls).toEqual([]);
  });
});

describe('useUpdatePlannerSeries', () => {
  const draft = () =>
    makePlannerEventDraft({
      title: 'Studio (moved)',
      starts_at: '2026-09-16T15:00:00.000Z',
      ends_at: '2026-09-16T16:00:00.000Z',
    });

  it('reads the rows in scope and updates them by id', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    const updated = await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'following',
      edited: seriesRows()[0],
      draft: draft(),
    });

    expect(updated).toBe(3);
    // The read: this series, still attached, from the edited occurrence on.
    const filters = stub.calls.filter((call) => call.table === 'planner_events');
    expect(filters.map((call) => call.op)).toContain('select');
    expect(filters.filter((call) => call.op === 'eq').map((call) => call.args)).toEqual([
      ['series_id', SERIES_ID],
      ['series_detached', false],
    ]);
    expect(filters.find((call) => call.op === 'gte')?.args).toEqual([
      'starts_at',
      '2026-09-16T13:00:00.000Z',
    ]);

    const args = rpcCall('planner_series_update');
    expect(args?.p_series_id).toBe(SERIES_ID);
    expect(args?.p_scope).toBe('following');
    expect(args?.p_from).toBe('2026-09-16T13:00:00.000Z');
    const rows = args?.p_rows as { id: string; starts_at: string; title: string }[];
    expect(rows.map((row) => row.id)).toEqual(['w1', 'w2', 'w3']);
    expect(rows.every((row) => row.title === 'Studio (moved)')).toBe(true);
    // 11:00 New York on each of the three Wednesdays.
    expect(rows.map((row) => row.starts_at)).toEqual([
      '2026-09-16T15:00:00.000Z',
      '2026-09-23T15:00:00.000Z',
      '2026-09-30T15:00:00.000Z',
    ]);
  });

  it('runs "all events" from now, not from the occurrence that was opened', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const before = new Date().toISOString();
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      edited: seriesRows()[1],
      draft: draft(),
    });

    const args = rpcCall('planner_series_update');
    expect(args?.p_scope).toBe('all');
    expect(String(args?.p_from) >= before).toBe(true);
  });

  it('patches the cached weeks first and puts them back on error', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: null, error: { message: 'row out of scope' } };
    const queryClient = client();
    const cached = seriesRows();
    queryClient.setQueryData(WEEK_KEY, [cached[0]]);
    const { result } = renderHook(() => useUpdatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'following',
        edited: cached[0],
        draft: draft(),
      }),
    ).rejects.toThrow(/out of scope/);

    await waitFor(() =>
      expect(queryClient.getQueryData<PlannerEventRow[]>(WEEK_KEY)?.[0].title).toBe(
        cached[0].title,
      ),
    );
  });

  it('refuses when the in-scope read fails, without calling the RPC', async () => {
    stub.readError = { message: 'permission denied' };
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'all',
        edited: seriesRows()[0],
        draft: draft(),
      }),
    ).rejects.toThrow(/permission denied/);
    expect(rpcCall('planner_series_update')).toBeUndefined();
  });

  it('refuses when a "following" scope came back empty', async () => {
    stub.rows = [];
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'following',
        edited: seriesRows()[0],
        draft: draft(),
      }),
    ).rejects.toThrow();
    expect(rpcCall('planner_series_update')).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
 * TR-2 — the occurrence Stack opened, when the RPC's scope cannot reach it
 * ------------------------------------------------------------------------ */

describe('the opened occurrence, outside an "all events" scope', () => {
  const draft = () =>
    makePlannerEventDraft({
      title: 'Studio B',
      starts_at: '2026-09-16T15:00:00.000Z',
      ends_at: '2026-09-16T16:00:00.000Z',
    });

  /** A row that has already started, so 083's `now()` will not reach it. */
  const past = () => makePlannerEvent({ id: 'past', series_id: SERIES_ID });

  /** A row well beyond the safety margin. */
  const future = () =>
    makePlannerEvent({
      id: 'future',
      series_id: SERIES_ID,
      starts_at: new Date(Date.now() + 3_600_000).toISOString(),
      ends_at: new Date(Date.now() + 7_200_000).toISOString(),
    });

  it('writes it as a plain update after the RPC', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      edited: past(),
      draft: draft(),
    });

    // The RPC first, then the one row it could not take.
    expect(rpcCall('planner_series_update')).toBeDefined();
    const update = stub.calls.find((call) => call.op === 'update');
    expect(update).toBeDefined();
    expect(update?.args[0]).toMatchObject({ title: 'Studio B' });
    // No detach: this row is still part of its series.
    expect(update?.args[0]).not.toHaveProperty('series_detached');
    expect(stub.calls.filter((call) => call.op === 'eq').map((call) => call.args)).toContainEqual([
      'id',
      'past',
    ]);
  });

  it('leaves it to the RPC when the scope does reach it', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      edited: future(),
      draft: draft(),
    });

    expect(stub.calls.some((call) => call.op === 'update')).toBe(false);
  });

  it('writes it even when the RPC has nothing to do', async () => {
    stub.rows = [];
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      edited: past(),
      draft: draft(),
    });

    expect(rpcCall('planner_series_update')).toBeUndefined();
    expect(stub.calls.some((call) => call.op === 'update')).toBe(true);
  });

  it('surfaces an error from that second write', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    stub.write = { data: null, error: { message: 'row-level security' } };
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'all',
        edited: past(),
        draft: draft(),
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it('deletes it too, after the delete RPC', async () => {
    stub.rpc = { data: 2, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useDeletePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({ seriesId: SERIES_ID, scope: 'all', occurrence: past() });

    expect(rpcCall('planner_series_delete')?.p_scope).toBe('all');
    expect(stub.calls.some((call) => call.op === 'delete')).toBe(true);
    expect(stub.calls.filter((call) => call.op === 'eq').map((call) => call.args)).toContainEqual([
      'id',
      'past',
    ]);
  });

  it('leaves a future occurrence to the delete RPC', async () => {
    stub.rpc = { data: 2, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useDeletePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({ seriesId: SERIES_ID, scope: 'all', occurrence: future() });

    expect(stub.calls.some((call) => call.op === 'delete')).toBe(false);
  });

  it('surfaces an error from that second delete', async () => {
    stub.rpc = { data: 2, error: null };
    stub.write = { data: null, error: { message: 'delete refused' } };
    const queryClient = client();
    const { result } = renderHook(() => useDeletePlannerSeries(), { wrapper: wrapper(queryClient) });

    await expect(
      result.current.mutateAsync({ seriesId: SERIES_ID, scope: 'all', occurrence: past() }),
    ).rejects.toThrow(/delete refused/);
  });
});

/* ---------------------------------------------------------------------------
 * TR-6 — the rule the form reads back
 * ------------------------------------------------------------------------ */

describe('every series write', () => {
  const invalidations = (queryClient: QueryClient) =>
    vi.spyOn(queryClient, 'invalidateQueries');

  const ruleInvalidated = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.some((call) => {
      const key = (call[0] as { queryKey?: unknown } | undefined)?.queryKey;
      return Array.isArray(key) && key[0] === 'planner-series';
    });

  it('invalidates the rule after a create', async () => {
    stub.rpc = { data: SERIES_ID, error: null };
    const queryClient = client();
    const spy = invalidations(queryClient);
    const { result } = renderHook(() => useCreatePlannerSeries(), { wrapper: wrapper(queryClient) });
    const expanded = expandSeries(makePlannerEventDraft(), 'weekly', '2026-09-30', NY);
    if (!expanded.ok) throw new Error('fixture');

    await result.current.mutateAsync({ freq: 'weekly', until: '2026-09-30', rows: expanded.rows });

    await waitFor(() => expect(ruleInvalidated(spy)).toBe(true));
    spy.mockRestore();
  });

  it('invalidates the rule after an update — the split makes a new one', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const queryClient = client();
    const spy = invalidations(queryClient);
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'following',
      edited: seriesRows()[0],
      draft: makePlannerEventDraft({ title: 'B' }),
    });

    await waitFor(() => expect(ruleInvalidated(spy)).toBe(true));
    spy.mockRestore();
  });

  it('invalidates the rule after a delete — the series may be gone', async () => {
    stub.rpc = { data: 3, error: null };
    const queryClient = client();
    const spy = invalidations(queryClient);
    const { result } = renderHook(() => useDeletePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'following',
      occurrence: seriesRows()[1],
    });

    await waitFor(() => expect(ruleInvalidated(spy)).toBe(true));
    spy.mockRestore();
  });
});

/* ---------------------------------------------------------------------------
 * The "all events" boundary, and 083's shape check
 * ------------------------------------------------------------------------ */

describe('the "all events" cut', () => {
  const draft = () =>
    makePlannerEventDraft({ starts_at: '2026-09-16T15:00:00.000Z', ends_at: '2026-09-16T16:00:00.000Z' });

  it('sits a safety margin into the future, on the read and on p_from alike', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const before = Date.now();
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      edited: seriesRows()[0],
      draft: draft(),
    });

    // 083 refuses a row starting before the server's own now(), and refusing
    // one row fails the whole transaction — so the client cuts early.
    const cut = stub.calls.find((call) => call.op === 'gte')?.args[1];
    expect(Date.parse(String(cut))).toBeGreaterThanOrEqual(before + SERIES_SCOPE_SAFETY_MS);
    expect(rpcCall('planner_series_update')?.p_from).toBe(cut);
  });

  it('leaves an occurrence starting inside the margin out of the optimistic patch', async () => {
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    const soon = makePlannerEvent({
      id: 'soon',
      title: 'Soon',
      starts_at: at(SERIES_SCOPE_SAFETY_MS / 2),
      ends_at: at(SERIES_SCOPE_SAFETY_MS),
      series_id: SERIES_ID,
    });
    const later = makePlannerEvent({
      id: 'later',
      title: 'Later',
      starts_at: at(10 * 60_000),
      ends_at: at(11 * 60_000),
      series_id: SERIES_ID,
    });

    // A window wide enough to hold both, whatever today is.
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const key = plannerEventKeys.window(day(-2), day(2));

    stub.rows = [later];
    stub.rpc = { data: 1, error: null };
    const queryClient = client();
    queryClient.setQueryData(key, [soon, later]);
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      edited: later,
      draft: makePlannerEventDraft({
        title: 'Later B',
        starts_at: later.starts_at,
        ends_at: later.ends_at,
      }),
    });

    const rows = queryClient.getQueryData<PlannerEventRow[]>(key) ?? [];
    expect(rows.find((row) => row.id === 'soon')?.title).toBe('Soon');
    expect(rows.find((row) => row.id === 'later')?.title).toBe('Later B');
  });

  it('says plainly when 083 still refuses a row, and puts the week back', async () => {
    stub.rows = seriesRows();
    stub.rpc = {
      data: null,
      error: {
        message:
          'planner_series_update: these rows are not in scope for all on series x (detached, in another series, or starting before the cut): y',
      },
    };
    const queryClient = client();
    const cached = seriesRows();
    queryClient.setQueryData(WEEK_KEY, [cached[0]]);
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'following',
        edited: cached[0],
        draft: draft(),
      }),
    ).rejects.toThrow(/just started or already passed/);
    // The raw Postgres sentence never reaches the reader.
    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'following',
        edited: cached[0],
        draft: draft(),
      }),
    ).rejects.not.toThrow(/detached, in another series/);

    await waitFor(() =>
      expect(queryClient.getQueryData<PlannerEventRow[]>(WEEK_KEY)?.[0].title).toBe(cached[0].title),
    );
  });
});

describe('083’s shape check', () => {
  it('sends only instants with an explicit offset', async () => {
    stub.rpc = { data: SERIES_ID, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useCreatePlannerSeries(), { wrapper: wrapper(queryClient) });
    const expanded = expandSeries(makePlannerEventDraft(), 'weekly', '2026-10-21', NY);
    if (!expanded.ok) throw new Error('fixture');

    await result.current.mutateAsync({ freq: 'weekly', until: '2026-10-21', rows: expanded.rows });

    const rows = rpcCall('planner_series_create')?.p_rows as { starts_at: string; ends_at: string }[];
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(hasExplicitOffset(row.starts_at)).toBe(true);
      expect(hasExplicitOffset(row.ends_at)).toBe(true);
    }
  });

  it('refuses an offsetless instant at the boundary, with no request', async () => {
    const queryClient = client();
    const { result } = renderHook(() => useCreatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await expect(
      result.current.mutateAsync({
        freq: 'weekly',
        until: '2026-09-30',
        // A wall clock with no offset is exactly what 083 refuses: it is the
        // one string Postgres would have to read in a zone.
        rows: [makePlannerEventDraft({ starts_at: '2026-09-16T09:00:00', ends_at: '2026-09-16T10:00:00' })],
      }),
    ).rejects.toBeInstanceOf(PlannerEventValidationError);
    expect(stub.calls).toEqual([]);
  });

  it('sends ids and offsets together on an update', async () => {
    stub.rows = seriesRows();
    stub.rpc = { data: 3, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useUpdatePlannerSeries(), { wrapper: wrapper(queryClient) });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'following',
      edited: seriesRows()[0],
      draft: makePlannerEventDraft({
        starts_at: '2026-09-16T15:00:00.000Z',
        ends_at: '2026-09-16T16:00:00.000Z',
      }),
    });

    const rows = rpcCall('planner_series_update')?.p_rows as {
      id: string;
      starts_at: string;
      ends_at: string;
    }[];
    for (const row of rows) {
      expect(row.id).toMatch(/^w\d$/);
      expect(hasExplicitOffset(row.starts_at)).toBe(true);
      expect(hasExplicitOffset(row.ends_at)).toBe(true);
    }
  });
});

describe('useDeletePlannerSeries', () => {
  it('deletes from the opened occurrence for "this and following"', async () => {
    stub.rpc = { data: 2, error: null };
    const queryClient = client();
    const { result } = renderHook(() => useDeletePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    const deleted = await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'following',
      occurrence: makePlannerEvent({ id: 'studio-2', starts_at: '2026-09-23T13:00:00.000Z' }),
    });

    expect(deleted).toBe(2);
    expect(rpcCall('planner_series_delete')).toEqual({
      p_series_id: SERIES_ID,
      p_scope: 'following',
      p_from: '2026-09-23T13:00:00.000Z',
    });
    expect(tablesTouched()).toEqual(['rpc']);
  });

  it('takes the in-scope rows off the grid and puts them back on error', async () => {
    stub.rpc = { data: null, error: { message: 'no such series' } };
    const queryClient = client();
    const rows = seriesRows();
    queryClient.setQueryData(WEEK_KEY, [rows[0]]);
    queryClient.setQueryData(NEXT_WEEK_KEY, [rows[1]]);
    const { result } = renderHook(() => useDeletePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({
        seriesId: SERIES_ID,
        scope: 'following',
        occurrence: makePlannerEvent({ id: 'studio-1', starts_at: '2026-09-16T13:00:00.000Z' }),
      }),
    ).rejects.toThrow(/no such series/);

    await waitFor(() => {
      expect(queryClient.getQueryData<PlannerEventRow[]>(WEEK_KEY)).toHaveLength(1);
      expect(queryClient.getQueryData<PlannerEventRow[]>(NEXT_WEEK_KEY)).toHaveLength(1);
    });
  });

  it('runs "all events" from now', async () => {
    stub.rpc = { data: 1, error: null };
    const before = new Date().toISOString();
    const queryClient = client();
    const { result } = renderHook(() => useDeletePlannerSeries(), {
      wrapper: wrapper(queryClient),
    });

    await result.current.mutateAsync({
      seriesId: SERIES_ID,
      scope: 'all',
      occurrence: makePlannerEvent({ id: 'old', starts_at: '2020-01-01T00:00:00.000Z' }),
    });

    const args = rpcCall('planner_series_delete');
    expect(args?.p_scope).toBe('all');
    expect(String(args?.p_from) >= before).toBe(true);
  });
});
