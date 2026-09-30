/**
 * The top bar's search affordance (2026-09-30): a single icon button that
 * expands in place into the "Search materials" field. The wide "Search ⌘K"
 * button and the centered dialog are gone.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/shell/SyncButton', () => ({
  SyncButton: () => <button type="button">Sync</button>,
}));
vi.mock('@/components/shell/ActivityMenu', () => ({ ActivityMenu: () => null }));
vi.mock('@/components/shell/Bell', () => ({ Bell: () => null }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn(), signOut: vi.fn() } }),
}));
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourses: () => ({ data: [], isPending: false, isError: false }) };
});
vi.mock('@/lib/queries.search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.search')>();
  return {
    ...actual,
    useSearch: () => ({
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: false,
      isFetching: false,
      error: null,
    }),
  };
});

const { SidebarProvider } = await import('@/components/shell/SidebarProvider');
const { TopNav } = await import('@/components/shell/TopNav');

function renderNav() {
  return render(
    <SidebarProvider>
      <TopNav userEmail="stack@syr.edu" />
    </SidebarProvider>,
  );
}

describe('TopNav — search is an icon', () => {
  it('shows a collapsed "Search" icon button and no wide "Search ⌘K" button', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const icon = screen.getByRole('button', { name: 'Search' });
    expect(icon).toHaveAttribute('aria-expanded', 'false');
    expect(icon.textContent?.trim()).toBe('');
    expect(nav.textContent).not.toMatch(/⌘K/);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('expands in the bar into the focused field and keeps Home and Sync', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const input = screen.getByRole('combobox', { name: 'Search materials' });
    expect(nav).toContainElement(input);
    expect(input).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
  });

  it('expands on ⌘K and collapses on Escape', () => {
    renderNav();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByRole('combobox', { name: 'Search materials' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-expanded', 'false');
  });
});
