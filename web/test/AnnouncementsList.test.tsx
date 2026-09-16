/**
 * /announcements: the order, the read/unread distinction, and the fact that
 * visiting the page is what clears the badge.
 *
 * The Supabase client is a recording stub — the list query hands back fixture
 * rows in the order Postgres would (the stub does not re-sort, so the ordering
 * assertion is about what the screen renders, and a separate assertion pins the
 * `order()` the query asks for). `mark_announcements_seen()` stamps `read_at`,
 * so the refetch after the mutation reads back a real "everything seen" state.
 *
 * Bodies go through the Stream's `scrubSnippet`: a professor's PPTX speaker
 * notes must not surface here as if they were the announcement, and nothing is
 * ever rendered as HTML.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
  order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => StubChain;
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
  error: null as string | null,
  orders: [] as { column: string; ascending: boolean }[],
  rpc: vi.fn<(fn: string) => Promise<{ data: number; error: null }>>(),
  from: vi.fn<(relation: string) => unknown>(),
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: db.from, rpc: db.rpc }),
}));

const { AnnouncementsList } = await import('@/components/announcements/AnnouncementsList');

function chainFor(): StubChain {
  const result: StubResult = db.error
    ? { data: null, error: { message: db.error } }
    : { data: db.announcements, error: null };

  const chain: StubChain = {
    select: () => chain,
    order: (column, options) => {
      db.orders.push({ column, ascending: options.ascending });
      return chain;
    },
    then: <R,>(onFulfilled: (value: StubResult) => R) => Promise.resolve(result).then(onFulfilled),
  };
  return chain;
}

/* ---------------------------------------------------------------------------
 * Fixtures — already in `posted_at desc`, as the query asks Postgres for.
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
  announcement({ id: 3, title: 'Newest post', posted_at: '2026-09-14T15:00:00Z' }),
  announcement({
    id: 2,
    course_id: 'ECN.304',
    title: 'Middle post',
    author: null,
    posted_at: '2026-09-13T15:00:00Z',
    courses: { id: 'ECN.304', title_short: 'ECN 304' },
  }),
  announcement({
    id: 1,
    title: 'Oldest post',
    posted_at: '2026-09-12T15:00:00Z',
    read_at: '2026-09-12T18:00:00Z',
  }),
];

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementsList />
    </QueryClientProvider>,
  );
}

function articles(): HTMLElement[] {
  return screen.getAllByRole('article');
}

beforeEach(() => {
  db.announcements = FIXTURES.map((row) => ({ ...row }));
  db.error = null;
  db.orders = [];

  db.from.mockReset();
  db.from.mockImplementation(() => chainFor());

  db.rpc.mockReset();
  db.rpc.mockImplementation(async () => {
    const stamped = (db.announcements as Announcement[]).map((row) =>
      row.read_at === null ? { ...row, read_at: '2026-09-15T12:00:00Z' } : row,
    );
    const changed = stamped.length - (db.announcements as Announcement[]).filter((r) => r.read_at).length;
    db.announcements = stamped;
    return { data: changed, error: null };
  });
});

/* ---------------------------------------------------------------------------
 * Ordering
 * ------------------------------------------------------------------------ */

describe('AnnouncementsList — the list', () => {
  it('asks Postgres for every course newest-first', async () => {
    renderList();
    await screen.findByText('Newest post');

    expect(db.from).toHaveBeenCalledWith('announcements');
    expect(db.orders[0]).toEqual({ column: 'posted_at', ascending: false });
  });

  it('renders them in that order, one row each', async () => {
    renderList();
    await screen.findByText('Newest post');

    const titles = articles().map((row) => row.querySelector('h2')?.textContent);
    expect(titles).toEqual(['Newest post', 'Middle post', 'Oldest post']);
  });

  it('prints course · author · date, and says so when the author is not recorded', async () => {
    renderList();
    expect(await screen.findByText('IST 323 · Prof. Nolan · Sep 14')).toBeInTheDocument();
    expect(screen.getByText('ECN 304 · not recorded · Sep 13')).toBeInTheDocument();
  });

  it('shows the body as plain text, never as HTML', async () => {
    db.announcements = [
      announcement({ id: 9, title: 'With markup', body: '<b>Read the syllabus</b>' }),
    ];
    renderList();

    const row = (await screen.findByText('With markup')).closest('article');
    expect(row?.textContent).toContain('<b>Read the syllabus</b>');
    expect(row?.querySelector('b')).toBeNull();
  });

  it('runs the body through the Stream scrub, so speaker notes never surface', async () => {
    db.announcements = [
      announcement({
        id: 9,
        title: 'From a deck',
        body: 'Slides are posted.\n[notes] remind them about the quiz',
      }),
    ];
    renderList();

    await screen.findByText('From a deck');
    expect(screen.getByText('Slides are posted.')).toBeInTheDocument();
    expect(screen.queryByText(/remind them about the quiz/)).toBeNull();
    expect(screen.getByText('speaker notes hidden')).toBeInTheDocument();
  });

  it('says there are none rather than showing a blank screen', async () => {
    db.announcements = [];
    renderList();
    expect(
      await screen.findByText('No course has posted an announcement yet.'),
    ).toBeInTheDocument();
  });

  it('says a failed fetch failed', async () => {
    db.error = 'announcements are unreachable';
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load announcements: announcements are unreachable',
    );
  });
});

/* ---------------------------------------------------------------------------
 * Read / unread, and what visiting the page does
 * ------------------------------------------------------------------------ */

describe('AnnouncementsList — seen', () => {
  it('marks everything seen on arrival, exactly once', async () => {
    renderList();
    await screen.findByText('Newest post');

    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
    expect(db.rpc).toHaveBeenCalledWith('mark_announcements_seen');

    // The refetch that follows must not fire it again.
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
  });

  it('keeps the rows that arrived unread distinguishable afterwards', async () => {
    renderList();
    await screen.findByText('Newest post');
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));

    expect(articles().map((row) => row.getAttribute('data-unread'))).toEqual([
      'true',
      'true',
      'false',
    ]);
    expect(screen.getAllByText('new')).toHaveLength(2);
  });

  it('does not mark a Blackboard-read announcement as new', async () => {
    db.announcements = [
      announcement({ id: 5, title: 'Opened in Blackboard', read_at: null, is_read: true }),
      announcement({ id: 6, title: 'Not opened anywhere', read_at: null, is_read: null }),
    ];
    renderList();
    await screen.findByText('Opened in Blackboard');

    const flags = articles().map((row) => row.getAttribute('data-unread'));
    expect(flags).toEqual(['false', 'true']);
  });

  it('shows nothing as new on a reload, because everything is already stamped', async () => {
    db.announcements = FIXTURES.map((row) => ({ ...row, read_at: '2026-09-12T18:00:00Z' }));
    renderList();
    await screen.findByText('Newest post');

    expect(articles().every((row) => row.getAttribute('data-unread') === 'false')).toBe(true);
    expect(screen.queryByText('new')).toBeNull();
  });
});
