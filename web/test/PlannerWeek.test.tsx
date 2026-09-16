/**
 * The /planner week grid, rendered for real against a recording Supabase stub.
 *
 * Nothing here touches the network: `@/lib/supabase/client` is mocked with a
 * chainable builder that hands back fixture rows, and the router hooks are
 * stubbed so `?week=` can be set per test. The clock is pinned to Wednesday
 * 2026-09-16 at 10:00 local, so "today" is a fixed column and the now-line is
 * inside the drawn hours.
 *
 * The write that matters is the status quick-edit: the test asserts it reaches
 * `assignment_progress` and no fact table, which is the project's hard rule
 * about planner state.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';

/* ---------------------------------------------------------------------------
 * Mocks
 * ------------------------------------------------------------------------ */

interface StubResult {
  data: unknown;
  error: { message: string } | null;
}

interface StubChain {
  select: () => StubChain;
  eq: () => StubChain;
  gte: () => StubChain;
  lt: () => StubChain;
  lte: () => StubChain;
  order: () => StubChain;
  limit: () => StubChain;
  maybeSingle: () => Promise<StubResult>;
  upsert: (payload: unknown) => Promise<{ error: null }>;
  then: <R>(onFulfilled: (value: StubResult) => R) => Promise<R>;
}

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  errors: {} as Record<string, string>,
  writes: [] as { table: string; payload: unknown }[],
  from: vi.fn<(table: string) => unknown>(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: db.from }),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  usePathname: () => '/planner',
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
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

/* ---------------------------------------------------------------------------
 * The chainable stub
 * ------------------------------------------------------------------------ */

function chainFor(table: string): StubChain {
  const message = db.errors[table];
  const rows = db.rows[table] ?? [];
  const result: StubResult = message
    ? { data: null, error: { message } }
    : { data: table === 'terms' ? (rows[0] ?? null) : rows, error: null };

  const chain: StubChain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lt: () => chain, // planner_events window (Phase 11b)
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => result,
    upsert: async (payload: unknown) => {
      db.writes.push({ table, payload });
      applyProgressWrite(table, payload);
      return { error: null };
    },
    then: <R,>(onFulfilled: (value: StubResult) => R) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

/**
 * Planner-state writes land in the fixture rows too, so the refetch that
 * follows a mutation reads back what was written rather than snapping the row
 * to its old status. Rows are replaced, never mutated in place.
 */
function applyProgressWrite(table: string, payload: unknown) {
  if (table !== 'assignment_progress' && table !== 'reading_progress') return;
  const patch = payload as { assignment_id?: string; reading_id?: number; status: string };
  const id = table === 'assignment_progress' ? patch.assignment_id : String(patch.reading_id);
  const kind = table === 'assignment_progress' ? 'assignment' : 'reading';
  db.rows.v_work_items = (db.rows.v_work_items ?? []).map((row) => {
    const item = row as { item_kind: string; item_id: string };
    return item.item_kind === kind && item.item_id === id
      ? { ...item, status: patch.status }
      : row;
  });
}

/* ---------------------------------------------------------------------------
 * Fixtures — Wednesday 2026-09-16, inside the week of Monday 2026-09-14.
 * ------------------------------------------------------------------------ */

const MEETINGS = [
  {
    id: 1,
    course_id: 'IST.323',
    day_of_week: 3,
    start_time: '15:45:00',
    end_time: '17:05:00',
    location: 'Hinds Hall 010',
    starts_on: '2026-08-24',
    ends_on: '2026-12-11',
    courses: { id: 'IST.323', title_short: 'Cybersecurity', subject: 'IST', number: '323' },
  },
  {
    id: 2,
    course_id: 'ECN.304',
    day_of_week: 1,
    start_time: '09:30:00',
    end_time: '10:50:00',
    location: null,
    starts_on: null,
    ends_on: null,
    courses: { id: 'ECN.304', title_short: 'Macro', subject: 'ECN', number: '304' },
  },
];

const SESSIONS = [
  { course_id: 'IST.323', session_date: '2026-09-16', topic: 'Risk assessment' },
];

const WORK_ITEMS = [
  makeWorkItem({
    item_id: 'IST.323/lab-1',
    title: 'Lab #1',
    course_id: 'IST.323',
    due_on: '2026-09-17',
    due_at: '2026-09-17T18:00:00Z', // 2:00 PM America/New_York
    category: 'project',
    glyph: 'P',
  }),
  makeWorkItem({
    item_kind: 'reading',
    item_id: '4',
    title: 'Chapter 4',
    course_id: 'ECN.304',
    due_on: '2026-09-18',
    due_at: null,
    category: 'reading',
    glyph: 'R',
  }),
];

const TERM = [
  { id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' },
];

function seedDefaults() {
  db.rows = {
    meetings: MEETINGS,
    sessions: SESSIONS,
    v_work_items: WORK_ITEMS,
    terms: TERM,
  };
  db.errors = {};
  db.writes = [];
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

/** The seven day columns, Monday → Sunday. */
function dayColumn(iso: string): HTMLElement {
  const column = document.querySelector(`[data-day="${iso}"]`);
  if (!(column instanceof HTMLElement)) throw new Error(`no column for ${iso}`);
  return column;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0)); // Wednesday 2026-09-16, 10:00
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  seedDefaults();
  db.from.mockReset();
  db.from.mockImplementation((table: string) => chainFor(table));
});

afterEach(() => {
  vi.useRealTimers();
});

/* ---------------------------------------------------------------------------
 * The week on screen
 * ------------------------------------------------------------------------ */

describe('PlannerWeek — the anchor week', () => {
  it('names the range and the term week, and draws Monday → Sunday', async () => {
    renderPlanner();

    expect(await screen.findByRole('heading', { name: 'Sep 14 – 20, 2026' })).toBeInTheDocument();
    expect(await screen.findByText('Week 4 · Fall 2026')).toBeInTheDocument();

    // The pager's "Today" is a link; the seven day heads are spans.
    const names = screen
      .getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today)$/)
      .filter((node) => node.tagName === 'SPAN');
    expect(names.map((n) => n.textContent)).toEqual([
      'Mon', 'Tue', 'Today', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
  });

  it('honours a `?week=` anchor and snaps it to its Monday', async () => {
    nav.params = new URLSearchParams('week=2026-09-24');
    renderPlanner();
    expect(await screen.findByRole('heading', { name: 'Sep 21 – 27, 2026' })).toBeInTheDocument();
  });

  it('falls back to the current week when `?week=` is not a real date', async () => {
    nav.params = new URLSearchParams('week=2026-02-31');
    renderPlanner();
    expect(await screen.findByRole('heading', { name: 'Sep 14 – 20, 2026' })).toBeInTheDocument();
  });

  it('pages a week either way with plain links, and Today clears the parameter', async () => {
    nav.params = new URLSearchParams('week=2026-09-14');
    renderPlanner();

    expect(await screen.findByLabelText('Previous week')).toHaveAttribute(
      'href',
      '?week=2026-09-07',
    );
    expect(screen.getByLabelText('Next week')).toHaveAttribute('href', '?week=2026-09-21');
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/planner');
  });

  it('marks today column and draws a now-line inside the visible hours', async () => {
    renderPlanner();
    await screen.findByRole('heading', { name: 'Sep 14 – 20, 2026' });

    expect(dayColumn('2026-09-16')).toHaveAttribute('data-today', 'true');
    expect(dayColumn('2026-09-15')).toHaveAttribute('data-today', 'false');
    expect(screen.getByTestId('now-line')).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------------
 * Meetings
 * ------------------------------------------------------------------------ */

describe('PlannerWeek — meeting blocks', () => {
  it('puts a class on its day with its code, room and the session topic', async () => {
    renderPlanner();
    const wednesday = dayColumn('2026-09-16');

    expect(await within(wednesday).findByText('IST 323')).toBeInTheDocument();
    expect(within(wednesday).getByText('3:45 PM – 5:05 PM')).toBeInTheDocument();
    expect(within(wednesday).getByText('Hinds Hall 010')).toBeInTheDocument();
    expect(within(wednesday).getByText('Risk assessment')).toBeInTheDocument();
  });

  it('says "room not recorded" rather than leaving the line blank', async () => {
    renderPlanner();
    const monday = dayColumn('2026-09-14');
    expect(await within(monday).findByText('ECN 304')).toBeInTheDocument();
    expect(within(monday).getByText('room not recorded')).toBeInTheDocument();
  });

  it('does not repeat a class on a day it does not meet', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Hinds Hall 010');
    for (const iso of ['2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18']) {
      expect(within(dayColumn(iso)).queryByText('Hinds Hall 010')).toBeNull();
    }
  });
});

/* ---------------------------------------------------------------------------
 * Due items
 * ------------------------------------------------------------------------ */

describe('PlannerWeek — due items', () => {
  it('places a timed item at its New York wall clock, and links it to the popout', async () => {
    renderPlanner();
    const thursday = dayColumn('2026-09-17');

    expect(await within(thursday).findByText('Lab #1')).toBeInTheDocument();
    expect(within(thursday).getByText('2:00 PM')).toBeInTheDocument();
    expect(within(thursday).getByRole('link', { name: 'Lab #1' })).toHaveAttribute(
      'href',
      '/planner?item=assignment%3AIST.323%2Flab-1',
    );
  });

  it('carries the paged week on the popout link so closing it does not lose the week', async () => {
    nav.params = new URLSearchParams('week=2026-09-21');
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'IST.323/lab-2',
        title: 'Lab #2',
        due_on: '2026-09-23',
        due_at: '2026-09-23T18:00:00Z',
      }),
    ];
    renderPlanner();

    expect(await screen.findByRole('link', { name: 'Lab #2' })).toHaveAttribute(
      'href',
      '/planner?item=assignment%3AIST.323%2Flab-2&week=2026-09-21',
    );
  });

  it('puts a date-only item in the Assignments band, not on a row it does not sit on', async () => {
    renderPlanner();
    expect(await screen.findByText('Chapter 4')).toBeInTheDocument();
    expect(within(dayColumn('2026-09-18')).queryByText('Chapter 4')).toBeNull();
    expect(screen.getByText('Assignments')).toBeInTheDocument();
    expect(screen.queryByText('All day')).toBeNull();
  });

  it('sends an 11:59 PM deadline to the band rather than clamping it onto 10 PM', async () => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'IST.323/quiz-3',
        title: 'Quiz 3',
        due_on: '2026-09-17',
        due_at: '2026-09-18T03:59:00Z', // 23:59 America/New_York on the 17th
      }),
    ];
    renderPlanner();

    expect(await screen.findByText('Quiz 3')).toBeInTheDocument();
    expect(screen.getByText('11:59 PM')).toBeInTheDocument();
    expect(within(dayColumn('2026-09-17')).queryByText('Quiz 3')).toBeNull();
  });

  it('leaves a reading as plain text — only assignments have a popout', async () => {
    renderPlanner();
    expect(await screen.findByText('Chapter 4')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chapter 4' })).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * A due item inside the class it is due in
 * ------------------------------------------------------------------------ */

/** The positioned blocks of one day column, in DOM order. */
function blocksIn(iso: string): HTMLElement[] {
  return Array.from(dayColumn(iso).querySelectorAll<HTMLElement>('[data-block]'));
}

describe('PlannerWeek — a due item inside its own class', () => {
  it('renders it in the class block instead of overlapping it', async () => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'IST.323/quiz-3',
        title: 'Quiz 3',
        course_id: 'IST.323',
        due_on: '2026-09-16',
        due_at: '2026-09-16T20:00:00Z', // 4:00 PM, inside the 3:45-5:05 lecture
        category: 'quiz',
        glyph: 'Q',
      }),
    ];
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const blocks = blocksIn('2026-09-16');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveAttribute('data-block', 'meeting');
    expect(within(blocks[0]).getByText('Quiz 3')).toBeInTheDocument();
    expect(within(blocks[0]).getByText('Hinds Hall 010')).toBeInTheDocument();
  });

  it('leaves another course item as its own block at the same minute', async () => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'ECN.304/pset-2',
        title: 'Problem set 2',
        course_id: 'ECN.304',
        due_on: '2026-09-16',
        due_at: '2026-09-16T20:00:00Z',
      }),
    ];
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Problem set 2');

    const blocks = blocksIn('2026-09-16');
    expect(blocks.map((b) => b.getAttribute('data-block'))).toEqual(['meeting', 'item']);
    expect(within(blocks[0]).queryByText('Problem set 2')).toBeNull();
  });

  it('keeps the status quick-edit on a nested item', async () => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'IST.323/quiz-3',
        title: 'Quiz 3',
        course_id: 'IST.323',
        due_on: '2026-09-16',
        due_at: '2026-09-16T20:00:00Z',
      }),
    ];
    renderPlanner();

    const select = await screen.findByLabelText('Status for Quiz 3');
    fireEvent.change(select, { target: { value: 'submitted' } });

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0].table).toBe('assignment_progress');
  });
});

/* ---------------------------------------------------------------------------
 * The whole card opens the popout
 * ------------------------------------------------------------------------ */

const LAB_HREF = '/planner?item=assignment%3AIST.323%2Flab-1';

describe('PlannerWeek — clicking a due item', () => {
  it('opens the popout from anywhere on a grid block, not just the title', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-17')).findByText('Lab #1');

    const block = blocksIn('2026-09-17')[0];
    expect(block).toHaveAttribute('data-block', 'item');
    fireEvent.click(block);

    expect(nav.push).toHaveBeenCalledWith(LAB_HREF, { scroll: false });
  });

  it('opens the popout from a band chip', async () => {
    db.rows.v_work_items = [
      makeWorkItem({ item_id: 'IST.323/lab-1', title: 'Lab #1', due_on: '2026-09-18', due_at: null }),
    ];
    renderPlanner();

    const chip = (await screen.findByText('Lab #1')).closest('[data-open="true"]');
    fireEvent.click(chip as HTMLElement);
    expect(nav.push).toHaveBeenCalledWith(LAB_HREF, { scroll: false });
  });

  it('opens the assignment popout from a chip nested in a class, never a session', async () => {
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'IST.323/quiz-3',
        title: 'Quiz 3',
        course_id: 'IST.323',
        due_on: '2026-09-16',
        due_at: '2026-09-16T20:00:00Z',
      }),
    ];
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('Quiz 3');

    const meetingBlock = blocksIn('2026-09-16')[0];
    expect(meetingBlock).toHaveAttribute('data-block', 'meeting');
    // The class block itself opens nothing — there is no session popout here.
    expect(meetingBlock).not.toHaveAttribute('data-open');

    const chip = within(meetingBlock).getByText('Quiz 3').closest('[data-open="true"]');
    fireEvent.click(chip as HTMLElement);

    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith('/planner?item=assignment%3AIST.323%2Fquiz-3', {
      scroll: false,
    });
  });

  it('keeps the paged week on the href it opens', async () => {
    nav.params = new URLSearchParams('week=2026-09-21');
    db.rows.v_work_items = [
      makeWorkItem({
        item_id: 'IST.323/lab-2',
        title: 'Lab #2',
        due_on: '2026-09-23',
        due_at: '2026-09-23T18:00:00Z',
      }),
    ];
    renderPlanner();
    await within(dayColumn('2026-09-23')).findByText('Lab #2');

    fireEvent.click(blocksIn('2026-09-23')[0]);
    expect(nav.push).toHaveBeenCalledWith(
      '/planner?item=assignment%3AIST.323%2Flab-2&week=2026-09-21',
      { scroll: false },
    );
  });

  it('does not navigate when the status quick-edit is used', async () => {
    renderPlanner();
    const select = await screen.findByLabelText('Status for Lab #1');

    fireEvent.mouseDown(select);
    fireEvent.click(select);
    fireEvent.change(select, { target: { value: 'in_progress' } });

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('leaves a reading card unclickable — a reading has no popout', async () => {
    renderPlanner();
    const chip = (await screen.findByText('Chapter 4')).closest('span[data-category]');
    expect(chip).not.toHaveAttribute('data-open');

    fireEvent.click(chip as HTMLElement);
    expect(nav.push).not.toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------------------
 * States
 * ------------------------------------------------------------------------ */

describe('PlannerWeek — states', () => {
  it('renders the grid with an empty-week line when nothing is scheduled', async () => {
    db.rows = { meetings: [], sessions: [], v_work_items: [], terms: TERM };
    renderPlanner();

    expect(await screen.findByText('Nothing scheduled this week.')).toBeInTheDocument();
    // The grid is still there — seven columns, not a blank screen.
    expect(document.querySelectorAll('[data-day]')).toHaveLength(7);
  });

  it('counts what is on screen once the queries have answered', async () => {
    renderPlanner();
    expect(await screen.findByText('2 classes · 2 due')).toBeInTheDocument();
  });

  it('says a query failed rather than showing an empty week', async () => {
    db.errors = { meetings: 'meetings are unreachable' };
    renderPlanner();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load this week: meetings are unreachable',
    );
    expect(screen.queryByText('Nothing scheduled this week.')).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * The one write
 * ------------------------------------------------------------------------ */

describe('PlannerWeek — status quick-edit', () => {
  it('writes assignment_progress and never a fact table', async () => {
    renderPlanner();

    const select = await screen.findByLabelText('Status for Lab #1');
    fireEvent.change(select, { target: { value: 'in_progress' } });

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0].table).toBe('assignment_progress');
    expect(db.writes[0].payload).toMatchObject({
      assignment_id: 'IST.323/lab-1',
      status: 'in_progress',
    });

    const written = db.writes.map((w) => w.table);
    expect(written).not.toContain('assignments');
    expect(written).not.toContain('v_work_items');
    expect(written).not.toContain('meetings');
  });

  it('writes reading_progress for a reading row', async () => {
    renderPlanner();

    const select = await screen.findByLabelText('Status for Chapter 4');
    fireEvent.change(select, { target: { value: 'submitted' } });

    await waitFor(() => expect(db.writes).toHaveLength(1));
    expect(db.writes[0].table).toBe('reading_progress');
    expect(db.writes[0].payload).toMatchObject({ reading_id: 4, status: 'submitted' });
  });

  it('shows the new status without a reload', async () => {
    renderPlanner();

    const select = await screen.findByLabelText('Status for Lab #1');
    expect(select).toHaveValue('not_started');

    fireEvent.change(select, { target: { value: 'in_progress' } });
    await waitFor(() => expect(screen.getByLabelText('Status for Lab #1')).toHaveValue('in_progress'));
  });
});

/* ---------------------------------------------------------------------------
 * What the Contract says is NOT here
 * ------------------------------------------------------------------------ */

describe('PlannerWeek — read-only by design', () => {
  it('has no drag affordance anywhere on the grid', async () => {
    renderPlanner();
    await within(dayColumn('2026-09-16')).findByText('IST 323');
    expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
  });
});
