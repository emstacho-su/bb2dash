/**
 * /planner and React's hydration check (error #418, found on the Phase 11b
 * browser walk).
 *
 * The grid sits in a Suspense boundary, so its server HTML hydrates after the
 * app shell — by which time `PersistQueryClientProvider` has restored the week
 * from localStorage. The client's first render then had rows the server never
 * saw ("11 classes · 6 due" against "0 classes · 0 due"), and React threw the
 * server tree away. The server also reads "today" and "now" in UTC.
 *
 * This replays that order: warm a query cache, render the server HTML from an
 * empty one, hydrate it with the warm cache, and require that React reports no
 * recoverable error and the week still appears.
 */

import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { makePlannerEvent } from './factories.plannerEvents';

const rows = vi.hoisted(() => ({ byTable: {} as Record<string, unknown[]> }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => readChain(table) }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/planner',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { PlannerWeek } = await import('@/components/planner/PlannerWeek');

/** A read-only query builder: every chain resolves to the table's rows. */
function readChain(table: string) {
  const result = () => {
    const data = rows.byTable[table] ?? [];
    return { data: table === 'terms' ? (data[0] ?? null) : data, error: null };
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    gte: self,
    lt: self,
    lte: self,
    order: self,
    limit: self,
    maybeSingle: async () => result(),
    single: async () => result(),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled),
  });
  return chain;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <PlannerWeek />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0));
  rows.byTable = {
    meetings: [],
    sessions: [],
    v_work_items: [
      makeWorkItem({ item_id: 'IST.323/lab-1', title: 'Lab #1', course_id: 'IST.323', due_on: '2026-09-17', due_at: '2026-09-17T18:00:00Z' }),
    ],
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
    courses: [],
    planner_events: [makePlannerEvent({ title: 'Advising' })],
  };
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('PlannerWeek hydration', () => {
  it('renders only the placeholder on the server: no rows, no clock', () => {
    const html = renderToString(tree(newClient()));
    expect(html).toContain('Loading the week…');
    expect(html).not.toContain('classes ·');
    expect(html).not.toContain('Nothing scheduled this week.');
  });

  it('hydrates server HTML under a restored cache without a hydration error', async () => {
    // What the persisted cache holds when the grid's Suspense boundary hydrates.
    const warm = newClient();
    const first = render(tree(warm));
    await waitFor(() => expect(first.container.textContent).toContain('Advising'));
    first.unmount();

    const container = document.createElement('div');
    container.innerHTML = renderToString(tree(newClient()));
    document.body.appendChild(container);

    const recoverable = vi.fn();
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree(warm), { onRecoverableError: recoverable });
    });

    await waitFor(() => expect(container.textContent).toContain('Advising'));
    expect(recoverable).not.toHaveBeenCalled();
    act(() => root?.unmount());
  });
});
