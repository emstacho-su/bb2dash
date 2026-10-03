/**
 * The Stream's material history (Phase 19, task 21; R-38).
 *
 * Migration 133 makes `v_course_stream`'s material posts come only from
 * `bb_material_history`: one post per file or content item that appeared or
 * changed in a registered crawl, dated by that crawl, with `meta.change` and
 * `meta.run_id`. This file pins what the Stream does with them:
 *
 *   - every post says New or Changed and carries its crawl date;
 *   - one file can post once per crawl it changed in, so the React key
 *     carries the run id;
 *   - a row that does not say what changed (the view before 133) is not
 *     posted at all, so the page is what `main` renders until 133 lands;
 *   - a title is text, never markup.
 *
 * Fixtures only. The harness is `course-stream.test.tsx`'s.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseStreamRow } from '@/lib/course-dimension';
import { makeCourseDisplay } from './factories';
import { newQueryClient, readChain } from './hydration-harness';

const state = vi.hoisted(() => ({
  byTable: {} as Record<string, unknown[]>,
  /** Tables whose read answers with a Postgres error (R3-7). */
  failing: [] as string[],
  /** Tables whose read never answers. */
  hanging: [] as string[],
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => {
      const chain = readChain(state.byTable, table, { singleTables: ['v_course_display', 'terms'] });
      if (state.failing.includes(table)) {
        chain.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: null, error: new Error('permission denied for view') }).then(
            onFulfilled,
            onRejected,
          );
      }
      if (state.hanging.includes(table)) chain.then = () => new Promise(() => {});
      return chain;
    },
    auth: { getSession: vi.fn() },
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/course/IST.466/stream',
}));
vi.mock('@/components/tracker/UpcomingTracker', () => ({
  UpcomingTracker: (props: Record<string, unknown>) => <h2>{props.title as string}</h2>,
}));

const {
  CourseStream,
  MATERIAL_POSTS_SHOWN,
  contentPostLink,
  materialChangeLabel,
  materialHistoryPosts,
  materialPostKey,
} = await import('@/app/(app)/course/[id]/stream/CourseStream');

const RUN_A = '3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc';
const RUN_B = '6b122650-49f3-4a70-a801-c177fbf27f1a';

/** A file post as 133's history arm writes it. `posted_at` is the crawl's `seen_at`. */
function filePost(overrides: Partial<CourseStreamRow> = {}, meta: Record<string, unknown> = {}): CourseStreamRow {
  return {
    course_id: 'IST.466',
    post_kind: 'material',
    posted_at: '2026-10-01T18:30:00Z',
    ref_kind: 'bb_file',
    ref_id: '17',
    title: 'Ethics Criteria.pptx',
    body: null,
    meta: {
      bucket: 'slides',
      file_name: 'Ethics Criteria.pptx',
      mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      storage_path: 'IST.466/slides/Ethics Criteria.pptx',
      source_url: null,
      change: 'appeared',
      run_id: RUN_A,
      ...meta,
    },
    ...overrides,
  } as CourseStreamRow;
}

/** A content-item post (a node, not a file). */
function nodePost(overrides: Partial<CourseStreamRow> = {}, meta: Record<string, unknown> = {}): CourseStreamRow {
  return {
    course_id: 'IST.466',
    post_kind: 'material',
    posted_at: '2026-10-01T18:30:00Z',
    ref_kind: 'bb_content',
    ref_id: '4021',
    title: 'Information',
    body: null,
    meta: { bucket: null, item_kind: 'document', url: null, change: 'changed', run_id: RUN_A, ...meta },
    ...overrides,
  } as CourseStreamRow;
}

function renderStream() {
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <CourseStream courseId="IST.466" />
    </QueryClientProvider>,
  );
}

const SECTION = 'New and changed materials';

async function materialSection() {
  return waitFor(() => screen.getByRole('region', { name: SECTION }));
}

let consoleError: ReturnType<typeof vi.spyOn>;

function duplicateKeyWarnings(): unknown[][] {
  return consoleError.mock.calls.filter((args: unknown[]) =>
    args.some((arg) => typeof arg === 'string' && arg.includes('same key')),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T14:00:00Z'));
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  state.byTable = {
    v_course_display: [makeCourseDisplay({ display_id: 'IST.466', code: 'IST 466', shell_ids: ['IST.466'] })],
    courses: [{ id: 'IST.466', term_id: 'fall-2026' }],
    terms: [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }],
  };
  state.failing = [];
  state.hanging = [];
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

describe('materialChangeLabel — what a history row is called', () => {
  it('calls an appeared item New and a changed one Changed', () => {
    expect(materialChangeLabel('appeared')).toBe('New');
    expect(materialChangeLabel('changed')).toBe('Changed');
  });

  it('has no label for a vanished item, an unknown word or a row that does not say', () => {
    for (const value of ['vanished', 'Appeared', '', null, undefined, 3, {}]) {
      expect(materialChangeLabel(value)).toBeNull();
    }
  });
});

describe('materialPostKey — one key per item per crawl', () => {
  it('carries the run id, so the same file in two crawls has two keys', () => {
    const first = filePost();
    const second = filePost({}, { change: 'changed', run_id: RUN_B });
    expect(materialPostKey(first)).toContain(RUN_A);
    expect(materialPostKey(second)).toContain(RUN_B);
    expect(materialPostKey(first)).not.toBe(materialPostKey(second));
  });

  it('keeps a file and a content item with the same id apart', () => {
    expect(materialPostKey(filePost({ ref_id: '17' }))).not.toBe(
      materialPostKey(nodePost({ ref_id: '17' }, { change: 'appeared' })),
    );
  });
});

describe('materialHistoryPosts — which stream rows are posted', () => {
  it('keeps appeared and changed material rows, in the order the view gave them', () => {
    const rows = [nodePost(), filePost()];
    expect(materialHistoryPosts(rows)).toEqual(rows);
  });

  it('drops every other kind of post', () => {
    const announcement = { ...filePost(), post_kind: 'announcement', ref_kind: 'announcement' } as CourseStreamRow;
    const due = { ...filePost(), post_kind: 'assignment_due', ref_kind: 'assignment' } as CourseStreamRow;
    expect(materialHistoryPosts([announcement, due])).toEqual([]);
  });

  it('drops a material row that does not say what changed (the view before 133)', () => {
    const before133 = filePost({}, { change: undefined, run_id: undefined });
    const noMeta = filePost({ meta: null });
    expect(materialHistoryPosts([before133, noMeta])).toEqual([]);
  });

  it('drops a vanished row, a row with no run id and a row it cannot date', () => {
    expect(
      materialHistoryPosts([
        filePost({}, { change: 'vanished' }),
        filePost({}, { run_id: null }),
        filePost({}, { run_id: '' }),
        filePost({ posted_at: 'not a date' }),
      ]),
    ).toEqual([]);
  });

  it('posts a file once per crawl even when two items carried it in that crawl', () => {
    const rows = [filePost(), filePost()];
    expect(materialHistoryPosts(rows)).toHaveLength(1);
  });

  it('returns a new list and leaves the rows it was handed alone', () => {
    const rows = [filePost(), filePost({}, { change: 'vanished' })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    const out = materialHistoryPosts(rows);
    expect(out).not.toBe(rows);
    expect(rows).toEqual(snapshot);
  });
});

describe('CourseStream — material posts say New or Changed, dated by crawl', () => {
  it('labels each post and carries the crawl date', async () => {
    state.byTable.v_course_stream = [
      // 02:30Z on Oct 2 is the evening of Thursday Oct 1 in New York.
      filePost({ posted_at: '2026-10-02T02:30:00Z' }),
      nodePost({ posted_at: '2026-09-28T15:00:00Z' }),
    ];
    renderStream();

    const section = await materialSection();
    const posts = within(section).getAllByRole('listitem');
    expect(posts).toHaveLength(2);

    expect(within(posts[0]).getByText('New')).toBeInTheDocument();
    expect(within(posts[0]).getByText('Ethics Criteria.pptx')).toBeInTheDocument();
    const firstDate = posts[0].querySelector('time');
    expect(firstDate).toHaveAttribute('datetime', '2026-10-02T02:30:00Z');
    expect(firstDate?.textContent).toContain('Thu · Oct 1');

    expect(within(posts[1]).getByText('Changed')).toBeInTheDocument();
    expect(within(posts[1]).getByText('Information')).toBeInTheDocument();
    expect(posts[1].querySelector('time')?.textContent).toContain('Mon · Sep 28');
  });

  it('offers the shared Open ladder on a file post and no download on a content item', async () => {
    state.byTable.v_course_stream = [
      filePost(),
      filePost({ ref_id: '19', title: 'Not stored.pptx' }, { storage_path: undefined, source_url: undefined }),
      nodePost(),
    ];
    renderStream();

    const posts = within(await materialSection()).getAllByRole('listitem');
    expect(within(posts[0]).getByRole('button', { name: 'Open' })).toBeEnabled();
    // The view did not carry the routes: unknown, so "Not stored", never "No route".
    expect(within(posts[1]).getByRole('button', { name: 'Not stored' })).toBeDisabled();
    // R4: a document item opens the course in Blackboard, and that is its only control.
    expect(within(posts[2]).queryByRole('button')).toBeNull();
    expect(within(posts[2]).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Open in Blackboard ↗',
    ]);
  });

  it('renders one file twice when two crawls posted it, with no duplicate-key warning', async () => {
    state.byTable.v_course_stream = [
      filePost({ posted_at: '2026-10-01T18:30:00Z' }, { change: 'changed', run_id: RUN_B }),
      filePost({ posted_at: '2026-09-24T18:30:00Z' }, { change: 'appeared', run_id: RUN_A }),
    ];
    renderStream();

    const section = await materialSection();
    const posts = within(section).getAllByRole('listitem');
    expect(posts).toHaveLength(2);
    expect(within(posts[0]).getByText('Changed')).toBeInTheDocument();
    expect(within(posts[1]).getByText('New')).toBeInTheDocument();
    expect(within(section).getAllByText('Ethics Criteria.pptx')).toHaveLength(2);
    expect(duplicateKeyWarnings()).toEqual([]);
  });

  it('posts nothing from a view that does not say what changed, and adds no section', async () => {
    state.byTable.v_course_stream = [
      filePost({}, { change: undefined, run_id: undefined }),
      nodePost({}, { change: undefined, run_id: undefined }),
    ];
    renderStream();

    await waitFor(() => screen.getByRole('region', { name: 'Course timeline' }));
    expect(screen.queryByRole('region', { name: SECTION })).toBeNull();
    expect(screen.queryByText('Ethics Criteria.pptx')).toBeNull();
  });

  it('adds no section to a course with nothing new or changed', async () => {
    renderStream();
    await waitFor(() => screen.getByRole('region', { name: 'Course timeline' }));
    expect(screen.queryByRole('region', { name: SECTION })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Course stream' })).toBeNull();
  });

  it('renders a title as text, never as markup', async () => {
    state.byTable.v_course_stream = [
      nodePost({ title: '<b>Week 5</b> <img src=x onerror=alert(1)>' }, { change: 'appeared' }),
    ];
    renderStream();

    const section = await materialSection();
    expect(within(section).getByText('<b>Week 5</b> <img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(section.querySelector('b')).toBeNull();
    expect(section.querySelector('img')).toBeNull();
  });

  it(`shows the newest ${MATERIAL_POSTS_SHOWN} and folds the rest away, losing none`, async () => {
    const total = MATERIAL_POSTS_SHOWN + 3;
    state.byTable.v_course_stream = Array.from({ length: total }, (_, index) =>
      filePost({ ref_id: String(100 + index), title: `Lecture ${index + 1}.pptx` }),
    );
    renderStream();

    const section = await materialSection();
    expect(within(section).getAllByRole('listitem')).toHaveLength(total);
    const earlier = section.querySelector('details');
    expect(earlier).not.toBeNull();
    expect(earlier?.querySelector('summary')?.textContent).toBe('3 earlier');
    expect(earlier?.querySelectorAll('li')).toHaveLength(3);
    expect(duplicateKeyWarnings()).toEqual([]);
  });

  it('draws no fold when everything fits', async () => {
    state.byTable.v_course_stream = [filePost()];
    renderStream();
    const section = await materialSection();
    expect(section.querySelector('details')).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Round 3, R3-7: a failed read says so; a read in flight adds nothing
 * ------------------------------------------------------------------------ */

describe('CourseStream — the materials block when the stream read does not answer', () => {
  it('shows one error line when the stream query fails, instead of vanishing', async () => {
    state.failing = ['v_course_stream'];
    renderStream();

    const section = await materialSection();
    const alert = within(section).getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load new and changed materials.");
    expect(within(section).queryByRole('listitem')).toBeNull();
  });

  it('shows nothing new while the stream query is still loading', async () => {
    state.hanging = ['v_course_stream'];
    renderStream();

    await waitFor(() => screen.getByText('Upcoming work · IST 466'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('region', { name: SECTION })).toBeNull();
    expect(screen.queryByText("Couldn't load new and changed materials.")).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Round 4 (Stack, 2026-10-03): a content item can be reached from its post.
 * "Videos don't need to be downloaded and stored... Only keep the link to it."
 * ------------------------------------------------------------------------ */

/** The course header's "Blackboard ↗" target: `v_course_display.bb_url` (the factory's). */
const COURSE_BB_URL = 'https://blackboard.syracuse.edu/course/IST323';
const KALTURA_LAUNCH = 'https://blackboard.syracuse.edu/webapps/blackboard/execute/blti/launchPlacement?id=kaltura_9';

describe('contentPostLink — where a content post opens', () => {
  const course = { bb_url: COURSE_BB_URL };

  it('opens a link item at its own https or http url', () => {
    expect(contentPostLink(nodePost({}, { item_kind: 'link', url: 'https://www.nist.gov/cyberframework' }), course)).toEqual({
      href: 'https://www.nist.gov/cyberframework',
      label: 'Open ↗',
    });
    expect(contentPostLink(nodePost({}, { item_kind: 'link', url: 'http://example.edu/reading' }), course)).toEqual({
      href: 'http://example.edu/reading',
      label: 'Open ↗',
    });
  });

  it('gives a link item with any other scheme, a malformed url or none, no link', () => {
    for (const url of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<b>x</b>',
      'ftp://example.edu/file',
      'file:///C:/x',
      '//example.edu/no-scheme',
      'not a url',
      '   ',
      null,
      undefined,
    ]) {
      expect(contentPostLink(nodePost({}, { item_kind: 'link', url }), course), String(url)).toBeNull();
    }
  });

  it('opens an lti item (a video) in the course’s Blackboard page, never at its launch url', () => {
    expect(contentPostLink(nodePost({}, { item_kind: 'lti', url: KALTURA_LAUNCH }), course)).toEqual({
      href: COURSE_BB_URL,
      label: 'Open in Blackboard ↗',
    });
  });

  it('opens a document item in the course’s Blackboard page', () => {
    expect(contentPostLink(nodePost({}, { item_kind: 'document', url: null }), course)).toEqual({
      href: COURSE_BB_URL,
      label: 'Open in Blackboard ↗',
    });
  });

  it('gives an lti or document item no link when the course has no safe Blackboard url', () => {
    for (const bad of [{ bb_url: null }, { bb_url: 'javascript:alert(1)' }, { bb_url: 'http://bb.example' }, null]) {
      expect(contentPostLink(nodePost({}, { item_kind: 'lti', url: KALTURA_LAUNCH }), bad)).toBeNull();
      expect(contentPostLink(nodePost({}, { item_kind: 'document' }), bad)).toBeNull();
    }
  });

  it('gives any other item kind, and a file post, no content link', () => {
    for (const kind of ['folder', 'learning_module', 'file', null, undefined]) {
      expect(contentPostLink(nodePost({}, { item_kind: kind, url: 'https://example.edu' }), course)).toBeNull();
    }
    expect(contentPostLink(filePost(), course)).toBeNull();
  });
});

describe('CourseStream — content posts open, files keep their ladder', () => {
  it('renders a link item’s external link with a safe target', async () => {
    state.byTable.v_course_stream = [
      nodePost({ title: 'NIST CSF' }, { item_kind: 'link', url: 'https://www.nist.gov/cyberframework', change: 'appeared' }),
    ];
    renderStream();

    const [post] = within(await materialSection()).getAllByRole('listitem');
    const link = within(post).getByRole('link', { name: 'Open ↗' });
    expect(link).toHaveAttribute('href', 'https://www.nist.gov/cyberframework');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The title is text beside the link, not inside it.
    expect(within(post).getByText('NIST CSF').closest('a')).toBeNull();
  });

  it('renders a video as "Open in Blackboard ↗" to the course page, and never its launch url', async () => {
    state.byTable.v_course_stream = [
      nodePost({ title: 'Week 5 lecture recording' }, { item_kind: 'lti', url: KALTURA_LAUNCH, change: 'appeared' }),
    ];
    renderStream();

    const [post] = within(await materialSection()).getAllByRole('listitem');
    const link = within(post).getByRole('link', { name: 'Open in Blackboard ↗' });
    expect(link).toHaveAttribute('href', COURSE_BB_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(post.innerHTML).not.toContain('launchPlacement');
    expect(within(post).queryByRole('button')).toBeNull();
  });

  it('draws no link for a link item whose url is not http or https', async () => {
    state.byTable.v_course_stream = [
      nodePost({ title: 'Bad link' }, { item_kind: 'link', url: 'javascript:alert(1)', change: 'appeared' }),
    ];
    renderStream();

    const [post] = within(await materialSection()).getAllByRole('listitem');
    expect(within(post).queryByRole('link')).toBeNull();
    expect(post.innerHTML).not.toContain('javascript:');
  });

  it('keeps a file post’s Open ladder and gives it no Blackboard link', async () => {
    state.byTable.v_course_stream = [filePost()];
    renderStream();

    const [post] = within(await materialSection()).getAllByRole('listitem');
    expect(within(post).getByRole('button', { name: 'Open' })).toBeEnabled();
    expect(within(post).queryByRole('link', { name: 'Open in Blackboard ↗' })).toBeNull();
  });
});
