/**
 * The announcements bell: the badge, what opening it does, and what it keeps
 * showing afterwards.
 *
 * The Supabase client is a recording stub — `v_announcements_unread` and
 * `announcements` hand back fixture rows, and `mark_announcements_seen()`
 * stamps them the way the real RPC does (the view empties, `read_at` fills in),
 * so the refetch that follows the mutation reads back a real "everything seen"
 * state rather than the fixtures it started from. Nothing touches the network.
 *
 * The behaviour worth pinning down is the one that is easy to get wrong:
 * opening the dropdown marks everything seen, but the rows that *were* unread
 * stay visibly unread until it closes. Clearing the badge must not also erase
 * what was new.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ---------------------------------------------------------------------------
 * Mocks
 * ------------------------------------------------------------------------ */

interface StubResult {
  data: unknown;
  error: { message: string } | null;
}

interface StubChain {
  select: () => StubChain;
  order: () => StubChain;
  then: <R>(onFulfilled: (value: StubResult) => R) => Promise<R>;
}

interface Announcement {
  id: number;
  course_id: string;
  title: string | null;
  author: string | null;
  body: string | null;
  posted_at: string | null;
  modified_at: string | null;
  read_at: string | null;
  is_read: boolean | null;
  courses: { id: string; title_short: string } | null;
}

const db = vi.hoisted(() => ({
  announcements: [] as unknown[],
  errors: {} as Record<string, string>,
  rpc: vi.fn<(fn: string) => Promise<{ data: number; error: null }>>(),
  from: vi.fn<(relation: string) => unknown>(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: db.from, rpc: db.rpc }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { Bell } = await import('@/components/shell/Bell');

/* ---------------------------------------------------------------------------
 * The stub
 * ------------------------------------------------------------------------ */

/** `v_announcements_unread` as 063 defines it: unseen here and unseen in Blackboard. */
function unreadRows() {
  return (db.announcements as Announcement[])
    .filter((row) => row.read_at === null && row.is_read !== true)
    .map((row) => ({
      id: row.id,
      course_id: row.course_id,
      course: row.courses?.title_short ?? null,
      title: row.title,
      author: row.author,
      posted_at: row.posted_at,
      modified_at: row.modified_at,
      read_at: row.read_at,
    }));
}

function chainFor(relation: string): StubChain {
  const message = db.errors[relation];
  const result: StubResult = message
    ? { data: null, error: { message } }
    : {
        data: relation === 'v_announcements_unread' ? unreadRows() : db.announcements,
        error: null,
      };

  const chain: StubChain = {
    select: () => chain,
    order: () => chain,
    then: <R,>(onFulfilled: (value: StubResult) => R) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    id: 1,
    course_id: 'IST.323',
    title: 'Quiz 2 moved to Friday',
    author: 'Prof. Nolan',
    body: 'The quiz has moved.',
    posted_at: '2026-09-12T15:00:00Z',
    modified_at: null,
    read_at: null,
    is_read: null,
    courses: { id: 'IST.323', title_short: 'IST 323' },
    ...overrides,
  };
}

const FIXTURES: Announcement[] = [
  announcement({ id: 3, title: 'Newest, unread', posted_at: '2026-09-14T15:00:00Z' }),
  announcement({
    id: 2,
    course_id: 'ECN.304',
    title: 'Older, unread, no author',
    author: null,
    posted_at: '2026-09-13T15:00:00Z',
    courses: { id: 'ECN.304', title_short: 'ECN 304' },
  }),
  announcement({
    id: 1,
    title: 'Already seen',
    posted_at: '2026-09-12T15:00:00Z',
    read_at: '2026-09-12T18:00:00Z',
  }),
];

function renderBell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Bell />
    </QueryClientProvider>,
  );
}

/** The badge count is inside the button, so the accessible name grows by it. */
function bellButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Announcements/ });
}

function panel(): HTMLElement {
  return screen.getByRole('menu', { name: 'Announcements' });
}

beforeEach(() => {
  db.announcements = FIXTURES.map((row) => ({ ...row }));
  db.errors = {};

  db.from.mockReset();
  db.from.mockImplementation((relation: string) => chainFor(relation));

  db.rpc.mockReset();
  db.rpc.mockImplementation(async () => {
    // What `mark_announcements_seen()` does: stamp read_at on everything unseen.
    const stamped = (db.announcements as Announcement[]).map((row) =>
      row.read_at === null ? { ...row, read_at: '2026-09-15T12:00:00Z' } : row,
    );
    const changed = stamped.filter((row, i) => row !== (db.announcements as Announcement[])[i]);
    db.announcements = stamped;
    return { data: changed.length, error: null };
  });
});

/* ---------------------------------------------------------------------------
 * The badge
 * ------------------------------------------------------------------------ */

describe('Bell — the badge', () => {
  it('counts the unread view, not every announcement', async () => {
    renderBell();
    expect(await screen.findByTestId('bell-badge')).toHaveTextContent('2');
  });

  it('shows no badge at all when nothing is unread', async () => {
    db.announcements = FIXTURES.map((row) => ({ ...row, read_at: '2026-09-12T18:00:00Z' }));
    renderBell();

    await waitFor(() => expect(db.from).toHaveBeenCalledWith('v_announcements_unread'));
    await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());
  });

  it('does not count an announcement Stack already opened in Blackboard', async () => {
    db.announcements = [
      announcement({ id: 5, read_at: null, is_read: true }),
      announcement({ id: 6, read_at: null, is_read: null }),
    ];
    renderBell();
    expect(await screen.findByTestId('bell-badge')).toHaveTextContent('1');
  });

  it('does not fetch the list until the dropdown is opened', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');
    expect(db.from).not.toHaveBeenCalledWith('announcements');
  });
});

/* ---------------------------------------------------------------------------
 * Opening it
 * ------------------------------------------------------------------------ */

describe('Bell — opening the dropdown', () => {
  it('marks everything seen exactly once and clears the badge', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');

    fireEvent.click(bellButton());

    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
    expect(db.rpc).toHaveBeenCalledWith('mark_announcements_seen');
    await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());

    // Still one call after the list and the badge have both settled.
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps the rows that were unread distinguishable after the badge clears', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');
    fireEvent.click(bellButton());

    const newest = await screen.findByText('Newest, unread');
    await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());

    const rows = within(panel()).getAllByRole('menuitem');
    const unreadFlags = rows.map(
      (row) => row.querySelector('[data-unread]')?.getAttribute('data-unread'),
    );
    expect(unreadFlags).toEqual(['true', 'true', 'false']);
    expect(newest).toBeInTheDocument();
  });

  it('lists unread first, then the newest already-seen', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');
    fireEvent.click(bellButton());

    await screen.findByText('Newest, unread');
    const titles = within(panel())
      .getAllByRole('menuitem')
      .map((row) => row.textContent);
    expect(titles[0]).toContain('Newest, unread');
    expect(titles[1]).toContain('Older, unread, no author');
    expect(titles[2]).toContain('Already seen');
  });

  it('caps the dropdown at eight rows', async () => {
    db.announcements = Array.from({ length: 12 }, (_, i) =>
      announcement({ id: 100 + i, title: `Announcement ${i}` }),
    );
    renderBell();
    await screen.findByTestId('bell-badge');
    fireEvent.click(bellButton());

    await screen.findByText('Announcement 0');
    expect(within(panel()).getAllByRole('menuitem')).toHaveLength(8);
  });

  it('forgets the snapshot when it closes, so a re-open reads the real state', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');

    fireEvent.click(bellButton());
    await screen.findByText('Newest, unread');
    await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());

    fireEvent.click(bellButton()); // close
    fireEvent.click(bellButton()); // re-open

    const rows = await within(panel()).findAllByRole('menuitem');
    const unreadFlags = rows.map(
      (row) => row.querySelector('[data-unread]')?.getAttribute('data-unread'),
    );
    expect(unreadFlags).toEqual(['false', 'false', 'false']);
  });
});

/* ---------------------------------------------------------------------------
 * The rows
 * ------------------------------------------------------------------------ */

describe('Bell — the rows', () => {
  it('prints course · author · date, and says so when the author is not recorded', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');
    fireEvent.click(bellButton());

    expect(await screen.findByText('IST 323 · Prof. Nolan · Sep 14')).toBeInTheDocument();
    expect(screen.getByText('ECN 304 · not recorded · Sep 13')).toBeInTheDocument();
  });

  it('opens that course Stream', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');
    fireEvent.click(bellButton());

    const row = (await screen.findByText('Newest, unread')).closest('a');
    expect(row).toHaveAttribute('href', '/course/IST.323/stream');
  });

  it('offers "See all"', async () => {
    renderBell();
    await screen.findByTestId('bell-badge');
    fireEvent.click(bellButton());

    expect(await screen.findByRole('link', { name: 'See all' })).toHaveAttribute(
      'href',
      '/announcements',
    );
  });

  it('says there are none rather than showing an empty panel', async () => {
    db.announcements = [];
    renderBell();
    fireEvent.click(bellButton());

    expect(
      await screen.findByText('No announcements have been posted yet.'),
    ).toBeInTheDocument();
  });

  it('says a failed fetch failed, and marks nothing seen', async () => {
    db.errors = { announcements: 'announcements are unreachable' };
    renderBell();
    fireEvent.click(bellButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load announcements: announcements are unreachable',
    );

    // Stamping `read_at` here would mark posts as read that were never shown,
    // and nothing would ever surface them again.
    expect(db.rpc).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('2'));
  });
});
