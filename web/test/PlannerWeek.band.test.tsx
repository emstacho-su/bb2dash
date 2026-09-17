/**
 * The Assignments band collapses (P-planner-1).
 *
 * Stack's words: "assignments sections should be collapsible, hidden on
 * default." Two things have to be true at once — the band starts closed, and a
 * closed band still says how much is in it, per day, so nothing due becomes
 * invisible. Both are asserted here against the real screen; the storage rules
 * themselves are pinned in `planner-band-preference.test.ts`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { PLANNER_BAND_STORAGE_KEY } from '@/components/planner/band-preference';

/* ---------------------------------------------------------------------------
 * Mocks — the same read-only stub the other planner suites use.
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

/* ---------------------------------------------------------------------------
 * Fixtures — Wednesday 2026-09-16, week of Monday 2026-09-14.
 *
 * Three band items: two on Thursday the 17th, one on Friday the 18th. All of
 * them are date-only or out-of-hours, so none lands on the hour grid.
 * ------------------------------------------------------------------------ */

const BAND_ITEMS = [
  makeWorkItem({
    item_kind: 'reading',
    item_id: '4',
    title: 'Chapter 4',
    course_id: 'ECN.304',
    due_on: '2026-09-17',
    due_at: null,
    category: 'reading',
    glyph: 'R',
  }),
  makeWorkItem({
    item_id: 'IST.323/quiz-3',
    title: 'Quiz 3',
    course_id: 'IST.323',
    due_on: '2026-09-17',
    due_at: '2026-09-18T03:59:00Z', // 23:59 New York on the 17th — out of hours
  }),
  makeWorkItem({
    item_kind: 'reading',
    item_id: '9',
    title: 'Chapter 9',
    course_id: 'ECN.304',
    due_on: '2026-09-18',
    due_at: null,
    category: 'reading',
    glyph: 'R',
  }),
];

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

/** The band's one toggle, whatever it happens to look like. */
function bandToggle(): HTMLElement {
  return screen.getByRole('button', { name: /assignments/i });
}

/**
 * Waits for the four queries to have answered, so the band holds the week.
 *
 * The generous timeout is not decoration: 90-odd jsdom environments running at
 * once can push a first paint past the one-second default, and a planner test
 * that fails only when the machine is busy is worse than no test.
 */
async function weekLoaded(due = '0 classes · 3 due'): Promise<void> {
  await screen.findByText(due, undefined, { timeout: 5000 });
}

/** Waits for the band's control to exist, whatever state it is in. */
async function bandReady(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /assignments/i }, { timeout: 5000 });
}

function bandCell(iso: string): HTMLElement {
  const cell = document.querySelector(`[data-band-day="${iso}"]`);
  if (!(cell instanceof HTMLElement)) throw new Error(`no band cell for ${iso}`);
  return cell;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0));
  window.localStorage.clear();
  db.rows = {
    meetings: [],
    sessions: [],
    v_work_items: BAND_ITEMS,
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
    planner_events: [],
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('the Assignments band — closed on arrival', () => {
  it('hides the band contents with nothing stored', async () => {
    renderPlanner();
    // Wait for the three items to have arrived, or "not on screen" would be
    // true of a screen that simply has not loaded yet.
    await weekLoaded();
    expect(await bandReady()).toHaveAttribute('aria-expanded', 'false');

    expect(screen.queryByText('Chapter 4')).toBeNull();
    expect(screen.queryByText('Quiz 3')).toBeNull();
    expect(screen.queryByText('Chapter 9')).toBeNull();
  });

  it('still counts what it is hiding, per day', async () => {
    renderPlanner();
    await weekLoaded('0 classes · 3 due');

    expect(within(bandCell('2026-09-17')).getByText('2')).toBeInTheDocument();
    expect(within(bandCell('2026-09-18')).getByText('1')).toBeInTheDocument();
    // A day with nothing due shows no number rather than a zero.
    expect(within(bandCell('2026-09-16')).queryByText('0')).toBeNull();
  });

  it('names the count for a screen reader on the day it belongs to', async () => {
    renderPlanner();
    await weekLoaded('0 classes · 3 due');

    expect(bandCell('2026-09-17')).toHaveAccessibleName('Assignments · Thu · 2 due');
    expect(bandCell('2026-09-16')).toHaveAccessibleName('Assignments · Wed · nothing due');
  });
});

describe('the Assignments band — the toggle', () => {
  it('opens on click and shows every chip', async () => {
    renderPlanner();
    expect(await bandReady()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(bandToggle());

    expect(await screen.findByText('Chapter 4', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Quiz 3')).toBeInTheDocument();
    expect(screen.getByText('Chapter 9')).toBeInTheDocument();
    expect(bandToggle()).toHaveAttribute('aria-expanded', 'true');
    // Counts give way to the chips they were standing in for.
    expect(within(bandCell('2026-09-17')).queryByText('2')).toBeNull();
  });

  it('writes the choice so it survives a reload', async () => {
    const first = renderPlanner();
    expect(await bandReady()).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(bandToggle());
    await waitFor(() =>
      expect(window.localStorage.getItem(PLANNER_BAND_STORAGE_KEY)).toBe('open'),
    );
    first.unmount();

    renderPlanner();
    expect(await screen.findByText('Chapter 4', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(bandToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes again, and remembers that too', async () => {
    window.localStorage.setItem(PLANNER_BAND_STORAGE_KEY, 'open');
    renderPlanner();
    await screen.findByText('Chapter 4', undefined, { timeout: 5000 });

    fireEvent.click(bandToggle());

    await waitFor(() => expect(screen.queryByText('Chapter 4')).toBeNull());
    expect(window.localStorage.getItem(PLANNER_BAND_STORAGE_KEY)).toBe('closed');
  });

  it('renders closed rather than throwing when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });

    renderPlanner();
    expect(await bandReady()).toHaveAttribute('aria-expanded', 'false');
    expect(() => fireEvent.click(bandToggle())).not.toThrow();
    expect(await screen.findByText('Chapter 4', undefined, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe('the Assignments band — an empty week', () => {
  it('says so whether the band is open or closed', async () => {
    db.rows.v_work_items = [];
    renderPlanner();

    // Closed by default, and the week's own state is not the band's contents.
    expect(
      await screen.findByText('Nothing scheduled this week.', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    fireEvent.click(bandToggle());
    expect(screen.getByText('Nothing scheduled this week.')).toBeInTheDocument();
  });
});
