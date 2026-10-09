/**
 * Keyboard polish in the shell (Phase 22, task 32; D-4, named exception 10; defaults 14).
 *
 * The account menu acts as a menu: it opens with focus on its first row, Down and Up move between
 * rows and wrap, Home and End jump. Escape closes it, Bell and Activity and puts focus back on the
 * button that opened them; an outside press closes and leaves focus where the press put it. The five
 * icon buttons of the bar draw the app's own label (`data-tip`) in place of a `title`, and keep their
 * accessible name. The skip link is the first Tab stop and moves focus to the content pane.
 *
 * Bell's rows and the phone Menu's are links and keep Tab; Activity's rows are text with nothing to
 * focus: none of the three gets arrow keys (taste call T-11).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn(), signOut: vi.fn() }, from: vi.fn(), rpc: vi.fn() }),
}));
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourses: () => ({ data: [], isPending: false, isError: false }) };
});
vi.mock('@/lib/queries.search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.search')>();
  return {
    ...actual,
    useSearch: () => ({ data: undefined, isPending: false, isSuccess: false, isError: false, isFetching: false, error: null }),
  };
});
vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
    useAgentRequest: () => ({ data: null, error: null }),
    useOpenSyncRequest: () => ({ data: null, error: null }),
    useActivity: () => ({ data: [], isPending: false, isError: false, error: null }),
  };
});
vi.mock('@/lib/queries.sync-run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync-run')>();
  return { ...actual, useSyncRun: () => ({ data: null, error: null }) };
});
vi.mock('@/lib/queries.announcements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.announcements')>();
  return {
    ...actual,
    useUnreadAnnouncements: () => ({ data: [] }),
    useUnreadSnapshot: () => new Set<number>(),
    allAnnouncementsOptions: () => ({ queryKey: ['announcements', 'all'], queryFn: async () => [] }),
  };
});

const { SidebarProvider } = await import('@/components/shell/SidebarProvider');
const { TopNav } = await import('@/components/shell/TopNav');
const { SkipLink } = await import('@/components/shell/SkipLink');

function renderNav() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SidebarProvider>{children}</SidebarProvider>
    </QueryClientProvider>
  );
  return render(<TopNav userEmail="stack@syr.edu" />, { wrapper: wrap });
}

const accountButton = () => screen.getByRole('button', { name: 'Account' });
/** The rows of the open account menu that take focus: its menu items and its radio rows. */
const menuRows = () => [...screen.getByRole('menu').querySelectorAll<HTMLElement>('[role^="menuitem"]')];

beforeEach(() => {
  window.localStorage.clear();
});

describe('the account menu acts as a menu', () => {
  it('puts focus on its first row when it opens', () => {
    renderNav();

    fireEvent.click(accountButton());

    expect(menuRows()[0]).toHaveFocus();
  });

  it('lists Dark, Light and Auto in that order, then Sign out', () => {
    renderNav();
    fireEvent.click(accountButton());

    expect(menuRows().map((row) => row.textContent)).toEqual(['Dark', 'Light', 'Auto', 'Sign out']);
  });

  it('moves down and up between rows, and wraps at both ends', () => {
    renderNav();
    fireEvent.click(accountButton());
    const rows = menuRows();
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(rows[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(rows[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(rows[rows.length - 1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(rows[0]).toHaveFocus();
  });

  it('jumps to the first and the last row on Home and End', () => {
    renderNav();
    fireEvent.click(accountButton());
    const rows = menuRows();
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'End' });
    expect(rows[rows.length - 1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(rows[0]).toHaveFocus();
  });

  it('closes on Escape and puts focus on the Account button', () => {
    renderNav();
    fireEvent.click(accountButton());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(accountButton()).toHaveFocus();
  });

  it('closes on a press outside and does not put focus on the button', () => {
    renderNav();
    fireEvent.click(accountButton());

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(accountButton()).not.toHaveFocus();
  });
});

describe('Bell and Activity', () => {
  it('close on Escape and put focus on their own buttons', () => {
    renderNav();

    for (const name of [/^Announcements/, /^Activity/]) {
      const button = screen.getByRole('button', { name });
      // A real press focuses the button it opens from; fireEvent.click alone does not.
      button.focus();
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(button).toHaveFocus();
    }
  });
});

describe('the five icon buttons draw the app’s own label', () => {
  const NAMES = [
    ['Search', 'Search'],
    ['Courses sidebar', 'Courses sidebar'],
    ['Activity', /^Activity/],
    ['Announcements', /^Announcements/],
    ['Account', 'Account'],
  ] as const;

  it.each(NAMES)('%s: no title, its name for the drawn label, its accessible name kept', (tip, name) => {
    renderNav();

    const button = screen.getByRole('button', { name });

    expect(button).not.toHaveAttribute('title');
    expect(button).toHaveAttribute('data-tip', tip);
  });

  it('leaves Sync its title (the sentence that says what the sync is doing)', () => {
    renderNav();

    expect(screen.getByTestId('sync-button').getAttribute('title')).toMatch(/\S/);
  });
});

describe('the skip link', () => {
  it('is named "Skip to content" and moves focus to the content pane', () => {
    render(
      <>
        <SkipLink target="content">Skip to content</SkipLink>
        <main id="content" tabIndex={-1}>
          pane
        </main>
      </>,
    );

    const link = screen.getByRole('link', { name: 'Skip to content' });
    fireEvent.click(link);

    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('an Escape that belongs to another widget moves nothing (round 2, R2-8)', () => {
  /** Opens a popover with the mouse, then search with Ctrl+K, and presses Escape in the search field. */
  function escapeInSearchWhileOpen(name: string | RegExp) {
    renderNav();
    const button = screen.getByRole('button', { name });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const field = screen.getByRole('combobox', { name: 'Search materials' });
    expect(field).toHaveFocus();

    fireEvent.keyDown(field, { key: 'Escape' });
    return button;
  }

  it.each([
    ['Bell', /^Announcements/],
    ['Activity', /^Activity/],
    ['the account menu', 'Account'],
  ] as const)('%s: search folds as on main and focus is not taken to the popover’s button', (_label, name) => {
    const button = escapeInSearchWhileOpen(name);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(button).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveFocus();
  });

  it('still returns focus when focus is nowhere (the body) and the popover is open', () => {
    renderNav();
    const button = screen.getByRole('button', { name: 'Account' });
    fireEvent.click(button);
    (document.activeElement as HTMLElement | null)?.blur();

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(button).toHaveFocus();
  });
});
