/**
 * The course sidebar: the list, the ☰ toggle, the remembered choice, and the
 * drawer's escape hatch.
 *
 * The bar and the rail are rendered together inside the real provider, because
 * the interesting behaviour is exactly the handoff between them — one button in
 * the top bar controlling an <aside> two levels down. Nothing here touches the
 * network: the course query and the Supabase client are stubbed.
 *
 * "Open" is asserted on `html[data-sidebar]` rather than on a class name. That
 * attribute is the real contract — the boot script writes it before first paint
 * and the CSS collapses the rail from it — so testing it is testing what a
 * reader actually sees.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_STORAGE_KEY } from '@/lib/sidebar-preference';

type CoursesQuery = {
  data?: unknown[];
  isPending: boolean;
  isError: boolean;
};

const stub = vi.hoisted(() => ({
  pathname: '/',
  courses: { isPending: false, isError: false, data: [] } as CoursesQuery,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => stub.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
// Phase 9 put the Sync button and the Activity menu in the top bar, and Phase 11 put
// the announcements bell there; each needs a query client and a Supabase client this
// test does not set up. The sidebar is what is under test, so stub them out.
vi.mock('@/components/shell/SyncButton', () => ({ SyncButton: () => null }));
vi.mock('@/components/shell/ActivityMenu', () => ({ ActivityMenu: () => null }));
vi.mock('@/components/shell/Bell', () => ({ Bell: () => null }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn(), signOut: vi.fn() } }),
}));
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourses: () => stub.courses };
});

const { CourseSidebar } = await import('@/components/shell/CourseSidebar');
const { SidebarProvider } = await import('@/components/shell/SidebarProvider');
const { TopNav } = await import('@/components/shell/TopNav');

const COURSES = [
  {
    id: 'IST.323',
    subject: 'IST',
    number: '323',
    section: 'M002',
    title_short: 'Intro to Cybersecurity',
    title_bb: 'Intro to Cybersecurity',
    kind: 'lecture',
    location: 'Hinds Hall 010',
    bb_url: null,
    term_id: 'FALL26',
  },
  {
    id: 'GEO.103',
    subject: 'GEO',
    number: '103',
    section: 'M001',
    title_short: 'Environment and Society',
    title_bb: 'Environment and Society',
    kind: 'lecture',
    location: null,
    bb_url: null,
    term_id: 'FALL26',
  },
];

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
}

/** The shell as the layout assembles it: the bar's ☰ over the rail it controls. */
function renderShell() {
  return render(
    <SidebarProvider>
      <TopNav userEmail="stack@syr.edu" />
      <CourseSidebar />
    </SidebarProvider>,
  );
}

const toggle = () => screen.getByRole('button', { name: 'Courses sidebar' });
const rail = () => screen.getByRole('complementary', { name: 'Courses' });
const sidebarState = () => document.documentElement.getAttribute('data-sidebar');

beforeEach(() => {
  stub.pathname = '/';
  stub.courses = { isPending: false, isError: false, data: COURSES };
  setWidth(1440);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-sidebar');
});

describe('CourseSidebar — the course list', () => {
  it('lists every course with its code and short title, linked to the course page', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    expect(rail()).toBeInTheDocument();
    expect(screen.getByText('IST 323')).toBeInTheDocument();
    expect(screen.getByText('Intro to Cybersecurity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /IST 323/ })).toHaveAttribute('href', '/course/IST.323');
    expect(screen.getByRole('link', { name: /GEO 103/ })).toHaveAttribute('href', '/course/GEO.103');
  });

  it('marks the open course as the current page and no other', async () => {
    stub.pathname = '/course/IST.323';
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    expect(screen.getByRole('link', { name: /IST 323/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /GEO 103/ })).not.toHaveAttribute('aria-current');
  });

  it('keeps the course current on its sub-routes', async () => {
    stub.pathname = '/course/IST.323/classwork';
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    expect(screen.getByRole('link', { name: /IST 323/ })).toHaveAttribute('aria-current', 'page');
  });

  it('says so while the courses are loading', async () => {
    stub.courses = { isPending: true, isError: false, data: undefined };
    renderShell();
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
  });

  it('says so when the courses cannot be loaded', async () => {
    stub.courses = { isPending: false, isError: true, data: undefined };
    renderShell();
    expect(
      await screen.findByText('Could not load courses. Check the connection and retry.'),
    ).toBeInTheDocument();
  });

  it('points at the sync when there are no courses yet', async () => {
    stub.courses = { isPending: false, isError: false, data: [] };
    renderShell();
    expect(await screen.findByText('No courses yet — run a Blackboard sync.')).toBeInTheDocument();
  });
});

describe('CourseSidebar — the ☰ toggle', () => {
  it('toggles aria-expanded and the sidebar open state', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sidebarState()).toBe('closed');

    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(sidebarState()).toBe('open');
  });

  it('points at the sidebar it controls', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    const controls = toggle().getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(rail().getAttribute('id')).toBe(controls);
  });

  it('writes the choice down so the next visit keeps it', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    fireEvent.click(toggle());
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('closed');
  });
});

describe('CourseSidebar — remembering the choice', () => {
  it('respects a stored "closed" on a viewport that would default to open', async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'closed');
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('respects a stored "open" on a narrow viewport that would default to closed', async () => {
    setWidth(800);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'open');
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));
  });

  it('falls back to the viewport default with nothing stored', async () => {
    setWidth(800);
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('closed'));
  });

  it('falls back to the viewport default when localStorage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('The operation is insecure.');
    });
    setWidth(800);
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('still toggles when localStorage refuses to remember anything', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    fireEvent.click(toggle());
    expect(sidebarState()).toBe('closed');
  });
});

/* ---------------------------------------------------------------------------
 * H-6 / P-home-9 — opening a course gets the rail out of the way, for that
 * navigation only (Stack's answer 10: the saved preference is untouched).
 * ------------------------------------------------------------------------ */

describe('CourseSidebar — navigating away', () => {
  /** Render, then navigate, the way the router does: a new pathname, same tree. */
  async function navigateTo(pathname: string) {
    const { rerender } = renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));
    stub.pathname = pathname;
    rerender(
      <SidebarProvider>
        <TopNav userEmail="stack@syr.edu" />
        <CourseSidebar />
      </SidebarProvider>,
    );
    return { rerender };
  }

  it('closes the in-flow rail when a course is opened from it', async () => {
    await navigateTo('/course/IST.323');
    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('does NOT write that close down — the preference is Stack’s, not the router’s', async () => {
    await navigateTo('/course/IST.323');
    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
  });

  it('leaves a stored "open" alone, so the next visit still opens', async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'open');
    await navigateTo('/course/IST.323');
    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('open');

    // A fresh mount reads the preference back and opens, as it should.
    document.documentElement.removeAttribute('data-sidebar');
    stub.pathname = '/course/IST.323';
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));
  });

  it('does not close on the first render — landing on a page is not navigating', async () => {
    stub.pathname = '/course/IST.323';
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));
    expect(sidebarState()).toBe('open');
  });

  it('closes in overlay mode too, and writes nothing there either', async () => {
    setWidth(800);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'open');
    await navigateTo('/course/IST.323');
    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('open');
  });

  it('still persists a close Stack asked for with the toggle', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));
    fireEvent.click(toggle());
    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('closed');
  });
});

describe('CourseSidebar — the overlay drawer', () => {
  beforeEach(() => {
    setWidth(800);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, 'open');
  });

  it('moves focus into the panel when it opens', async () => {
    renderShell();
    await waitFor(() => expect(rail()).toHaveFocus());
  });

  it('closes on Escape and hands focus back to ☰', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveFocus();
  });

  it('closes when the scrim is used', async () => {
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    fireEvent.click(screen.getByRole('button', { name: 'Close courses sidebar' }));

    await waitFor(() => expect(sidebarState()).toBe('closed'));
    expect(toggle()).toHaveFocus();
  });

  it('leaves an in-flow sidebar open when Escape is pressed', async () => {
    setWidth(1440);
    renderShell();
    await waitFor(() => expect(sidebarState()).toBe('open'));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(sidebarState()).toBe('open');
  });
});
