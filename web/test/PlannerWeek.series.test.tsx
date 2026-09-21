/**
 * The three recurring-event flows on /planner, end to end (T-1).
 *
 * Create a repeating event; edit one occurrence and the whole series; delete
 * from one occurrence onwards. Each answer reaches a different write, and each
 * write reaches Stack's real Google calendar within two minutes, so what is
 * asserted here is which request goes out and with which arguments:
 *
 *   * a repeating create is `planner_series_create`, never 52 inserts;
 *   * "This event" is the ordinary update with `series_detached`, so one
 *     occurrence can move without dragging the rest;
 *   * "This and following" and "All events" are the RPCs, with `p_from` at the
 *     occurrence that was opened and at now respectively;
 *   * an event that is not in a series is never asked the question at all.
 *
 * Nothing reaches the network. The clock is pinned to Wednesday 2026-09-16
 * 10:00 local, inside the week of Monday 2026-09-14.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makePlannerEvent } from './factories.plannerEvents';

/* ---------------------------------------------------------------------------
 * Mocks
 * ------------------------------------------------------------------------ */

interface Write {
  table: string;
  op: string;
  payload: unknown;
  id?: unknown;
}

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  writes: [] as Write[],
  rpc: [] as { name: string; args: Record<string, unknown> }[],
  rpcResult: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => chainFor(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.rpc.push({ name, args });
      return db.rpcResult;
    },
  }),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  usePathname: () => '/planner',
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { PlannerWeek } = await import('@/components/planner/PlannerWeek');

function chainFor(table: string) {
  let pending: Write | null = null;
  const settle = () => {
    if (!pending) {
      const rows = db.rows[table] ?? [];
      return { data: table === 'terms' ? (rows[0] ?? null) : rows, error: null };
    }
    db.writes.push(pending);
    if (pending.op === 'delete') return { data: [{ id: pending.id }], error: null };
    const base = (db.rows[table] ?? []).find((row) => (row as { id: string }).id === pending?.id);
    return { data: { ...((base as object) ?? { id: 'new-id' }), ...(pending.payload as object) }, error: null };
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: (column: string, value: unknown) => {
      if (pending && column === 'id') pending = { ...pending, id: value };
      return chain;
    },
    gte: self,
    lt: self,
    lte: self,
    order: self,
    limit: self,
    insert: (payload: unknown) => ((pending = { table, op: 'insert', payload }), chain),
    update: (payload: unknown) => ((pending = { table, op: 'update', payload }), chain),
    delete: () => ((pending = { table, op: 'delete', payload: null }), chain),
    upsert: async () => ({ error: null }),
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(settle()).then(onFulfilled),
  });
  return chain;
}

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

const SERIES_ID = 'series-1';
const TERM = [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }];

/** Three weekly Wednesdays at 09:00 New York, all in one series. */
function weeklyStudio(overrides: Record<string, unknown> = {}) {
  return ['2026-09-16', '2026-09-23', '2026-09-30'].map((date, index) => ({
    ...makePlannerEvent({
      id: `studio-${index + 1}`,
      title: 'Studio',
      starts_at: `${date}T13:00:00.000Z`,
      ends_at: `${date}T14:00:00.000Z`,
    }),
    series_id: SERIES_ID,
    series_detached: false,
    ...overrides,
  }));
}

function seed(events: unknown[] = []) {
  db.rows = {
    meetings: [],
    sessions: [],
    v_work_items: [],
    terms: TERM,
    courses: [],
    planner_events: events,
    planner_event_series: [{ id: SERIES_ID, freq: 'weekly', until_date: '2026-09-30' }],
  };
  db.writes = [];
  db.rpc = [];
  db.rpcResult = { data: null, error: null };
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

/* ---------------------------------------------------------------------------
 * DOM helpers — the grid renders ~230 buttons, so look elements up by the
 * attributes the markup already carries rather than by role.
 * ------------------------------------------------------------------------ */

function titleButtons(title: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-edit-event]')).filter(
    (button) => button.textContent === title,
  );
}

async function findTitle(title: string): Promise<HTMLElement> {
  return waitFor(() => {
    const [button] = titleButtons(title);
    if (!button) throw new Error(`no planner event titled ${title}`);
    return button;
  });
}

async function findLabelled(label: string): Promise<HTMLElement> {
  return waitFor(() => {
    const element = document.querySelector(`[aria-label="${label}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`nothing labelled ${label}`);
    return element;
  });
}

function formDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label]');
  if (!dialog) throw new Error('the planner-event form is not open');
  return dialog;
}

/** The scope question, which is named by its heading rather than a label. */
function scopeDialog(): HTMLElement {
  const dialog = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find(
    (candidate) => candidate.hasAttribute('aria-labelledby'),
  );
  if (!dialog) throw new Error('the scope question is not open');
  return dialog;
}

function scopeDialogOrNull(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).find((candidate) =>
      candidate.hasAttribute('aria-labelledby'),
    ) ?? null
  );
}

function buttonIn(root: HTMLElement, text: string): HTMLElement {
  const button = Array.from(root.querySelectorAll<HTMLElement>('button')).find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`no ${text} button`);
  return button;
}

/** Answer the scope question. */
async function choose(scope: string, confirm: string) {
  const dialog = await waitFor(scopeDialog);
  fireEvent.click(within(dialog).getByLabelText(scope));
  fireEvent.click(buttonIn(dialog, confirm));
}

const rpcCall = (name: string) => db.rpc.find((call) => call.name === name);
const writesTo = (table: string) => db.writes.filter((write) => write.table === table);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0));
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ---------------------------------------------------------------------------
 * Create
 * ------------------------------------------------------------------------ */

describe('creating a repeating event', () => {
  it('sends one planner_series_create, not one insert per occurrence', async () => {
    db.rpcResult = { data: SERIES_ID, error: null };
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));

    const dialog = formDialog();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Studio' } });
    fireEvent.change(within(dialog).getByLabelText('Repeats'), { target: { value: 'weekly' } });
    fireEvent.change(within(dialog).getByLabelText('Ends on'), { target: { value: '2026-09-30' } });
    expect(within(dialog).getByText('3 occurrences')).toBeInTheDocument();
    fireEvent.click(buttonIn(dialog, 'Save'));

    await waitFor(() => expect(rpcCall('planner_series_create')).toBeDefined());
    const args = rpcCall('planner_series_create')?.args;
    expect(args?.p_freq).toBe('weekly');
    expect(args?.p_until).toBe('2026-09-30');
    expect(args?.p_rows).toHaveLength(3);
    expect(writesTo('planner_events')).toEqual([]);
  });

  it('still inserts a one-off when it does not repeat', async () => {
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));

    const dialog = formDialog();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'One off' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    expect(writesTo('planner_events')[0].op).toBe('insert');
    expect(db.rpc).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * The mark, and the question
 * ------------------------------------------------------------------------ */

describe('an occurrence on the grid', () => {
  it('carries a repeat mark, labelled for assistive tech', async () => {
    seed(weeklyStudio());
    renderPlanner();
    await findTitle('Studio');
    expect(document.querySelectorAll('[aria-label="Repeats"]').length).toBeGreaterThan(0);
  });

  it('loses the mark once it has been detached', async () => {
    seed(weeklyStudio({ series_detached: true }));
    renderPlanner();
    await findTitle('Studio');
    expect(document.querySelector('[aria-label="Repeats"]')).toBeNull();
  });

  it('asks the scope question before saving an edit', async () => {
    seed(weeklyStudio());
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));

    const dialog = formDialog();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Studio B' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    const scope = await waitFor(scopeDialog);
    expect(within(scope).getByRole('heading')).toHaveTextContent('Change repeating event');
    // Nothing is written until the question is answered.
    expect(db.writes).toEqual([]);
    expect(db.rpc).toEqual([]);
  });

  it('writes nothing when the question is cancelled', async () => {
    seed(weeklyStudio());
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));
    fireEvent.click(buttonIn(formDialog(), 'Save'));

    const scope = await waitFor(scopeDialog);
    fireEvent.click(buttonIn(scope, 'Cancel'));

    await waitFor(() => expect(scopeDialogOrNull()).toBeNull());
    expect(db.writes).toEqual([]);
    expect(db.rpc).toEqual([]);
    // The form is still open, with the edit intact.
    expect(formDialog()).toBeInTheDocument();
  });

  it('shows the saved rule read-only, and how to change it', async () => {
    seed(weeklyStudio());
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));

    const dialog = formDialog();
    await waitFor(() => expect(within(dialog).getByLabelText('Repeats')).toHaveValue('weekly'));
    expect(within(dialog).getByLabelText('Repeats')).toBeDisabled();
    expect(within(dialog).getByLabelText('Ends on')).toHaveValue('2026-09-30');
    expect(within(dialog).getByText(/cannot be changed here/)).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------------
 * Editing
 * ------------------------------------------------------------------------ */

describe('editing an occurrence', () => {
  it('"This event" updates that row alone and detaches it', async () => {
    seed(weeklyStudio());
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));

    const dialog = formDialog();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Studio B' } });
    fireEvent.click(buttonIn(dialog, 'Save'));
    await choose('This event', 'Save');

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    const write = writesTo('planner_events')[0];
    expect(write.op).toBe('update');
    expect(write.id).toBe('studio-1');
    expect(write.payload).toMatchObject({ title: 'Studio B', series_detached: true });
    expect(db.rpc).toEqual([]);
  });

  it('"All events" restates the whole series by id', async () => {
    seed(weeklyStudio());
    db.rpcResult = { data: 3, error: null };
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));

    const dialog = formDialog();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Studio B' } });
    fireEvent.click(buttonIn(dialog, 'Save'));
    await choose('All events', 'Save');

    await waitFor(() => expect(rpcCall('planner_series_update')).toBeDefined());
    const args = rpcCall('planner_series_update')?.args;
    expect(args?.p_series_id).toBe(SERIES_ID);
    expect(args?.p_scope).toBe('all');
    const rows = args?.p_rows as { id: string; title: string }[];
    expect(rows.map((row) => row.id)).toEqual(['studio-1', 'studio-2', 'studio-3']);
    expect(rows.every((row) => row.title === 'Studio B')).toBe(true);
    expect(writesTo('planner_events')).toEqual([]);
  });

  it('"This and following" runs from the occurrence that was opened', async () => {
    seed(weeklyStudio());
    db.rpcResult = { data: 3, error: null };
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));
    fireEvent.change(within(formDialog()).getByLabelText('Title'), { target: { value: 'Studio B' } });
    fireEvent.click(buttonIn(formDialog(), 'Save'));
    await choose('This and following events', 'Save');

    await waitFor(() => expect(rpcCall('planner_series_update')).toBeDefined());
    const args = rpcCall('planner_series_update')?.args;
    expect(args?.p_scope).toBe('following');
    expect(args?.p_from).toBe('2026-09-16T13:00:00.000Z');
  });
});

/* ---------------------------------------------------------------------------
 * Deleting
 * ------------------------------------------------------------------------ */

describe('deleting an occurrence', () => {
  async function askToDelete() {
    fireEvent.click(await findTitle('Studio'));
    const dialog = formDialog();
    fireEvent.click(buttonIn(dialog, 'Delete'));
    fireEvent.click(buttonIn(dialog, 'Yes, delete'));
  }

  it('asks the scope question, naming the delete', async () => {
    seed(weeklyStudio());
    renderPlanner();
    await askToDelete();

    const scope = await waitFor(scopeDialog);
    expect(within(scope).getByRole('heading')).toHaveTextContent('Delete repeating event');
    expect(db.writes).toEqual([]);
  });

  it('"This event" deletes that row only', async () => {
    seed(weeklyStudio());
    renderPlanner();
    await askToDelete();
    await choose('This event', 'Delete');

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    expect(writesTo('planner_events')[0]).toMatchObject({ op: 'delete', id: 'studio-1' });
    expect(db.rpc).toEqual([]);
  });

  it('"This and following events" calls planner_series_delete from that occurrence', async () => {
    seed(weeklyStudio());
    db.rpcResult = { data: 3, error: null };
    renderPlanner();
    await askToDelete();
    await choose('This and following events', 'Delete');

    await waitFor(() => expect(rpcCall('planner_series_delete')).toBeDefined());
    expect(rpcCall('planner_series_delete')?.args).toEqual({
      p_series_id: SERIES_ID,
      p_scope: 'following',
      p_from: '2026-09-16T13:00:00.000Z',
    });
    expect(writesTo('planner_events')).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * Events that do not repeat
 * ------------------------------------------------------------------------ */

describe('an event that is not in a series', () => {
  it('is deleted without being asked anything', async () => {
    seed([makePlannerEvent({ id: 'solo', title: 'Advising' })]);
    renderPlanner();
    fireEvent.click(await findTitle('Advising'));
    const dialog = formDialog();
    fireEvent.click(buttonIn(dialog, 'Delete'));
    fireEvent.click(buttonIn(dialog, 'Yes, delete'));

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    expect(scopeDialogOrNull()).toBeNull();
    expect(db.rpc).toEqual([]);
  });

  it('is edited without being asked anything', async () => {
    seed([{ ...makePlannerEvent({ id: 'solo', title: 'Advising' }), series_id: null, series_detached: false }]);
    renderPlanner();
    fireEvent.click(await findTitle('Advising'));
    const dialog = formDialog();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Advising B' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    expect(writesTo('planner_events')[0].payload).not.toHaveProperty('series_detached');
    expect(scopeDialogOrNull()).toBeNull();
  });

  it('is asked nothing once it has been detached', async () => {
    seed(weeklyStudio({ series_detached: true }));
    renderPlanner();
    fireEvent.click(await findTitle('Studio'));
    fireEvent.change(within(formDialog()).getByLabelText('Title'), { target: { value: 'Studio B' } });
    fireEvent.click(buttonIn(formDialog(), 'Save'));

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    expect(scopeDialogOrNull()).toBeNull();
    expect(db.rpc).toEqual([]);
  });
});
