/**
 * The scenario writes (round 2, R2-5): what a save sends, and that quick
 * successive saves can never overwrite each other.
 *
 * The Supabase client is a stand-in whose upserts and deletes return deferred
 * promises the test resolves by hand, so the order in which saves run, land and
 * fail is exactly the order the test chooses. Reads return the "server" row.
 */

import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradeScenarioRow } from '@/lib/grade-model-input';

interface Write {
  op: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
  resolve: () => void;
  fail: (message: string) => void;
}

const server = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  writes: [] as Write[],
  reads: 0,
}));

function writeBuilder(op: 'upsert' | 'delete', payload: Record<string, unknown> | null) {
  const promise = new Promise<{ data: null; error: Error | null }>((resolve) => {
    server.writes.push({
      op,
      payload,
      resolve: () => {
        server.row = op === 'upsert' ? payload : null;
        resolve({ data: null, error: null });
      },
      fail: (message) => resolve({ data: null, error: new Error(message) }),
    });
  });
  const chain = { eq: () => chain, then: promise.then.bind(promise) };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => {
      const read = {
        select: () => read,
        eq: () => read,
        maybeSingle: () => {
          server.reads += 1;
          return Promise.resolve({ data: server.row, error: null });
        },
      };
      return {
        ...read,
        upsert: (payload: Record<string, unknown>) => writeBuilder('upsert', payload),
        delete: () => writeBuilder('delete', null),
      };
    },
  }),
}));

const s = await import('@/lib/queries.grade-scenario');
const { gradeScenarioOptions, gradeModelKeys } = await import('@/lib/queries.grade-model');

const KEY = gradeModelKeys.scenario('IST.466');

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const hooks = renderHook(
    () => ({ save: s.useSaveScenario('IST.466'), reset: s.useResetScenario('IST.466') }),
    { wrapper },
  );
  return { client, hooks };
}

/** Keep the scenario query observed, as the course tab does, so invalidation refetches it. */
async function observe(client: QueryClient) {
  const observer = new QueryObserver(client, gradeScenarioOptions('IST.466'));
  const unsubscribe = observer.subscribe(() => undefined);
  await waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
  return unsubscribe;
}

function cached(client: QueryClient) {
  return client.getQueryData<GradeScenarioRow | null>(KEY);
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  server.row = null;
  server.writes.length = 0;
  server.reads = 0;
});

describe('applyScenarioPatch — pure', () => {
  const base: GradeScenarioRow = { course_id: 'X', item_scores: Object.freeze({ a: 1 }) as Record<string, number>, target_letter: 'B', updated_at: 't' };

  it('sets, clears and keeps the letter without touching the original', () => {
    expect(s.applyScenarioPatch('X', base, { item: { key: 'b', value: 2 } })).toEqual({ ...base, item_scores: { a: 1, b: 2 } });
    expect(s.applyScenarioPatch('X', base, { item: { key: 'a', value: null } }).item_scores).toEqual({});
    expect(s.applyScenarioPatch('X', base, { targetLetter: 'A' })).toMatchObject({ item_scores: { a: 1 }, target_letter: 'A' });
    expect(base.item_scores).toEqual({ a: 1 });
  });

  it('starts from an empty row when nothing is cached', () => {
    expect(s.applyScenarioPatch('X', null, { item: { key: 'k', value: 0 } }, 'now')).toEqual({
      course_id: 'X', item_scores: { k: 0 }, target_letter: null, updated_at: 'now',
    });
  });
});

describe('validateScenario', () => {
  it('refuses a negative or non-finite value and an over-long letter', () => {
    expect(() => s.validateScenario({ courseId: 'X', itemScores: { a: -1 }, targetLetter: null })).toThrow(/0 or more/);
    expect(() => s.validateScenario({ courseId: 'X', itemScores: { a: Number.NaN }, targetLetter: null })).toThrow();
    expect(() => s.validateScenario({ courseId: 'X', itemScores: {}, targetLetter: 'A+++' })).toThrow(/one to three/);
    expect(() => s.validateScenario({ courseId: '', itemScores: {}, targetLetter: null })).toThrow();
  });
});

describe('useSaveScenario — what one save sends', () => {
  it('upserts grade_scenarios with the whole row, keyed on course_id', async () => {
    const { client, hooks } = setup();
    client.setQueryData(KEY, { course_id: 'IST.466', item_scores: { old: 5 }, target_letter: 'B+', updated_at: 't' });

    act(() => hooks.result.current.save.mutate({ item: { key: 'k', value: 90 } }));
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0].payload).toEqual({ course_id: 'IST.466', item_scores: { old: 5, k: 90 }, target_letter: 'B+' });
    expect(cached(client)?.item_scores).toEqual({ old: 5, k: 90 });
  });
});

describe('useSaveScenario — no lost updates (R2-5)', () => {
  it('commits A, B, C with save 1 landing between B and C: the last upsert holds A, B and C', async () => {
    const { client, hooks } = setup();
    await observe(client);

    act(() => hooks.result.current.save.mutate({ item: { key: 'A', value: 1 } }));
    await waitFor(() => expect(server.writes).toHaveLength(1));
    act(() => hooks.result.current.save.mutate({ item: { key: 'B', value: 2 } }));
    await flush();
    // Serialised: save 2 waits for save 1.
    expect(server.writes).toHaveLength(1);
    expect(cached(client)?.item_scores).toEqual({ A: 1, B: 2 });

    await act(async () => server.writes[0].resolve());
    await waitFor(() => expect(server.writes).toHaveLength(2));
    // No refetch while save 2 is pending: the optimistic B is not replaced by the server's {A}.
    expect(cached(client)?.item_scores).toEqual({ A: 1, B: 2 });

    act(() => hooks.result.current.save.mutate({ item: { key: 'C', value: 3 } }));
    await act(async () => server.writes[1].resolve());
    await waitFor(() => expect(server.writes).toHaveLength(3));
    await act(async () => server.writes[2].resolve());

    expect(server.writes.map((w) => w.payload?.item_scores)).toEqual([{ A: 1 }, { A: 1, B: 2 }, { A: 1, B: 2, C: 3 }]);
    await waitFor(() => expect(cached(client)?.item_scores).toEqual({ A: 1, B: 2, C: 3 }));
    expect(server.row?.item_scores).toEqual({ A: 1, B: 2, C: 3 });
  });

  it('a failed save refetches the server row instead of restoring a stale snapshot: A is kept', async () => {
    const { client, hooks } = setup();
    await observe(client);

    act(() => hooks.result.current.save.mutate({ item: { key: 'A', value: 1 } }));
    await waitFor(() => expect(server.writes).toHaveLength(1));
    await act(async () => server.writes[0].resolve());

    act(() => hooks.result.current.save.mutate({ item: { key: 'B', value: 2 } }));
    await waitFor(() => expect(server.writes).toHaveLength(2));
    const readsBefore = server.reads;
    await act(async () => server.writes[1].fail('network down'));

    await waitFor(() => expect(hooks.result.current.save.isError).toBe(true));
    await waitFor(() => expect(server.reads).toBeGreaterThan(readsBefore));
    await waitFor(() => expect(cached(client)?.item_scores).toEqual({ A: 1 }));
  });

  it('a reset queued behind a save runs after it, and the course ends empty', async () => {
    const { client, hooks } = setup();
    await observe(client);

    act(() => hooks.result.current.save.mutate({ item: { key: 'A', value: 1 } }));
    act(() => hooks.result.current.reset.mutate());
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(cached(client)).toBeNull();

    await act(async () => server.writes[0].resolve());
    await waitFor(() => expect(server.writes).toHaveLength(2));
    expect(server.writes[1].op).toBe('delete');
    await act(async () => server.writes[1].resolve());

    expect(server.row).toBeNull();
    await waitFor(() => expect(cached(client)).toBeNull());
  });
});
