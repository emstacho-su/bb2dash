/**
 * R-42 / B-21 — "Apply answers now": an Inbox answer applied without a crawl
 * or a Claude session.
 *
 * `apply_resolutions()` (042) already runs whenever `transform_tick` drains a
 * queued `agent_requests` row of kind `transform`. This button files one, and
 * only one: while a transform request is queued or claimed (this tab's or
 * another's) a press files nothing and shows that request's state. When the
 * request settles the Inbox refreshes.
 *
 * The real query layer runs (queries.sync.ts, queries.applyNow.ts) over a fake
 * Supabase client that keeps `agent_requests` rows in memory, so the insert
 * count is the thing asserted, not a mocked hook.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: number;
  created_at: string;
  kind: string;
  scope: string | null;
  params: Record<string, unknown>;
  note: string | null;
  state: string;
  claimed_at: string | null;
  claimed_by: string | null;
  finished_at: string | null;
  sync_run_id: number | null;
  result: Record<string, unknown> | null;
}

const db = vi.hoisted(() => ({
  rows: [] as Row[],
  inserts: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
  nextId: 100,
}));

/** Just enough of PostgREST's builder for the agent_requests reads and the insert. */
function builder() {
  const filters: ((row: Row) => boolean)[] = [];
  let inserted: Row | null = null;
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: (column: keyof Row, value: unknown) => {
      filters.push((row) => row[column] === value);
      return chain;
    },
    in: (column: keyof Row, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return chain;
    },
    insert: (values: Record<string, unknown>) => {
      db.inserts.push(values);
      if (!db.insertError) {
        inserted = makeRow({ ...(values as Partial<Row>), id: db.nextId++, state: 'queued' });
        db.rows.push(inserted);
      }
      return chain;
    },
    maybeSingle: async () => ({
      data: db.rows.filter((row) => filters.every((keep) => keep(row))).at(-1) ?? null,
      error: null,
    }),
    single: async () =>
      db.insertError ? { data: null, error: db.insertError } : { data: inserted, error: null },
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: () => builder() }),
}));

function makeRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    created_at: '2026-09-29T14:00:00.000Z',
    kind: 'transform',
    scope: 'all',
    params: {},
    note: null,
    state: 'queued',
    claimed_at: null,
    claimed_by: null,
    finished_at: null,
    sync_run_id: null,
    result: null,
    ...overrides,
  };
}

const { ApplyNowButton } = await import('@/components/inbox/ApplyNowButton');
const { APPLY_NOW_HELP, APPLY_NOW_LABEL } = await import('@/lib/queries.applyNow');
const { APPLIED_FIELDS, syncKeys } = await import('@/lib/queries.sync');

let client: QueryClient;

function renderButton() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<ApplyNowButton />, { wrapper });
}

/** The button, once the open-request lookup has answered and enabled it. */
async function readyButton(name: string | RegExp = APPLY_NOW_LABEL) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

beforeEach(() => {
  db.rows = [];
  db.inserts = [];
  db.insertError = null;
  db.nextId = 100;
});

describe('Apply answers now — label and help (B-21)', () => {
  it('reads "Apply answers now", apart from "Apply answers"', async () => {
    renderButton();
    expect(await readyButton()).toBeInTheDocument();
    expect(APPLY_NOW_LABEL).toBe('Apply answers now');
  });

  it('names the four fields apply_resolutions() writes', async () => {
    renderButton();
    const button = await readyButton();
    for (const field of ['due_at', 'due_date', 'points_possible', 'bb_url']) {
      expect(APPLY_NOW_HELP).toContain(field);
    }
    expect([...APPLIED_FIELDS].sort()).toEqual(['bb_url', 'due_at', 'due_date', 'points_possible']);
    expect(button).toHaveAccessibleDescription(APPLY_NOW_HELP);
    expect(screen.getByText(APPLY_NOW_HELP)).toBeInTheDocument();
  });
});

describe('Apply answers now — one open transform request at a time', () => {
  it('files exactly one request of kind transform', async () => {
    renderButton();
    fireEvent.click(await readyButton());
    await screen.findByRole('button', { name: /apply queued/ });
    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toMatchObject({ kind: 'transform', scope: 'all' });
  });

  it('files nothing on a second press while the first is queued', async () => {
    renderButton();
    fireEvent.click(await readyButton());
    const queued = await screen.findByRole('button', { name: /apply queued/ });
    fireEvent.click(queued);
    fireEvent.click(queued);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(db.inserts).toHaveLength(1);
  });

  it('shows a transform request another tab filed, and files nothing', async () => {
    db.rows = [makeRow({ id: 7, state: 'claimed' })];
    renderButton();
    const button = await screen.findByRole('button', { name: /applying…/ });
    fireEvent.click(button);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(db.inserts).toHaveLength(0);
  });

  it('files a new request once the last one is done', async () => {
    db.rows = [makeRow({ id: 7, state: 'done' })];
    renderButton();
    fireEvent.click(await readyButton());
    await screen.findByRole('button', { name: /apply queued/ });
    expect(db.inserts).toHaveLength(1);
  });

  it('says so when the insert is refused', async () => {
    db.insertError = { message: 'new row violates row-level security policy' };
    renderButton();
    fireEvent.click(await readyButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not file the request: new row violates row-level security policy',
    );
  });
});

describe('Apply answers now — the Inbox refreshes when the request settles', () => {
  async function settle(state: string, result: Row['result'] = null) {
    const row = db.rows.find((r) => r.id === 100)!;
    row.state = state;
    row.result = result;
    await act(async () => {
      await client.invalidateQueries({ queryKey: syncKeys.agentRequest(100) });
    });
  }

  it('invalidates the attention items when the request is done', async () => {
    renderButton();
    fireEvent.click(await readyButton());
    await screen.findByRole('button', { name: /apply queued/ });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await settle('done');

    await screen.findByRole('button', { name: /answers applied/ });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: syncKeys.attentionAll() });
  });

  it('names the reason a request failed', async () => {
    renderButton();
    fireEvent.click(await readyButton());
    await screen.findByRole('button', { name: /apply queued/ });

    await settle('failed', { error: 'no registered crawl in bb_raw to transform' });

    expect(await screen.findByText(/no registered crawl in bb_raw to transform/)).toBeInTheDocument();
  });
});
