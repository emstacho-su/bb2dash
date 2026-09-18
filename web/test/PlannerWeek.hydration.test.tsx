/**
 * /planner and React's hydration check (error #418, found on the Phase 11b
 * browser walk), and what the reader looks at until then (P-planner-7).
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
 *
 * P-planner-7 adds the other half. The placeholder used to be one line of text
 * that the whole 700px section replaced a moment later, so the page jumped.
 * It is now a skeleton of the same shape and height: the header and pager are
 * drawn, and the board's space is held open. What it must *not* do is render
 * anything the server cannot know — a week label, a count, a now-line — since
 * that is the mismatch the first two tests exist to catch.
 */

import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { makePlannerEvent } from './factories.plannerEvents';
import { reservedBoardHeightPx } from '@/lib/planner-rows';

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

  it('draws the header and the pager before hydration, so the top does not swap', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree(newClient()));

    const section = container.querySelector('[aria-label="Week grid"]');
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute('aria-busy', 'true');
    // The pager's chrome is drawn but inert — it is not a control yet, and a
    // screen reader is not told about one that does nothing.
    const pager = container.querySelector('[data-planner-pager]');
    expect(pager).not.toBeNull();
    expect(pager).toHaveAttribute('aria-hidden', 'true');
    expect(pager?.textContent).toContain('Today');
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('holds the board height open, so the grid arriving does not move the page', () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree(newClient()));

    const reserve = container.querySelector('[data-planner-reserve]');
    expect(reserve).toBeInstanceOf(HTMLElement);
    expect((reserve as HTMLElement).style.height).toBe(`${reservedBoardHeightPx()}px`);
    expect(reserve).toHaveAttribute('aria-hidden', 'true');
  });

  it('still invents nothing the server cannot know', () => {
    const html = renderToString(tree(newClient()));
    expect(html).not.toContain('Week 4');
    expect(html).not.toContain('Sep 14');
    expect(html).not.toContain('now-line');
    expect(html).not.toContain('Assignments');
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
