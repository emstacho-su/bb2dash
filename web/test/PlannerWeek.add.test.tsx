/**
 * R3-9 — the planner header's "+" opens the step-by-step wizard; a click on an
 * empty slot still opens the grid form. Nothing is saved: the client is mocked.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------------------------------------------------------------------------
 * Mocks
 * ------------------------------------------------------------------------ */

const db = vi.hoisted(() => ({ rows: {} as Record<string, unknown[]> }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => chainFor(table) }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/planner',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { PlannerWeek } = await import('@/components/planner/PlannerWeek');

function chainFor(table: string) {
  const result = () => {
    const rows = db.rows[table] ?? [];
    return { data: table === 'terms' ? (rows[0] ?? null) : rows, error: null };
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
    upsert: async () => ({ error: null }),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled),
  });
  return chain;
}

function renderPlanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlannerWeek />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0)); // Wednesday 2026-09-16, 10:00
  window.localStorage.clear();
  db.rows = {
    meetings: [],
    sessions: [],
    v_work_items: [],
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
    planner_events: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('R3-9 — adding an event from the planner', () => {
  it('opens the wizard from the header "+", on today, at the next hour', async () => {
    renderPlanner();
    fireEvent.click(await screen.findByRole('button', { name: 'New event' }));
    const dialog = screen.getByRole('dialog', { name: 'New planner event' });
    expect(within(dialog).getByText('Step 1 of 5')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('2026-09-16');
    expect(within(dialog).getByLabelText('Start time')).toHaveValue('11:00');
  });

  it('still opens the grid form from an empty slot', async () => {
    renderPlanner();
    fireEvent.click(await screen.findByRole('button', { name: 'New event, Wed Sep 16, 2:00 PM' }));
    const dialog = screen.getByRole('dialog', { name: 'New planner event' });
    expect(within(dialog).queryByText(/Step 1 of 5/)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Kind')).toBeInTheDocument();
  });

  it('closes the wizard and lets the next "+" start fresh', async () => {
    renderPlanner();
    fireEvent.click(await screen.findByRole('button', { name: 'New event' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New event' }));
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument();
  });
});
