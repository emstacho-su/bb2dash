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
vi.mock('@/components/shell/ActivityMenu', () => ({
  ActivityMenu: () => <button type="button">Activity</button>,
}));
vi.mock('@/components/shell/Bell', () => ({
  Bell: () => <button type="button">Announcements</button>,
}));
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

  it('puts the field before the icon in the page, so Tab reads left to right', () => {
    renderNav();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const input = screen.getByRole('combobox', { name: 'Search materials' });
    const icon = screen.getByRole('button', { name: 'Search' });
    expect(input.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('TopNav — the right-hand group (Stack, 2026-09-30)', () => {
  const RIGHT_ORDER = ['Sync', 'Search', 'Courses sidebar', 'Activity', 'Announcements', 'Account'];

  it('reads Sync → search → ☰ → Activity → bell → account, in one group', () => {
    renderNav();
    const buttons = RIGHT_ORDER.map((name) => screen.getByRole('button', { name }));
    // The group is the ☰ button's own container, the bar's right-hand cluster.
    const group = screen.getByRole('button', { name: 'Courses sidebar' }).parentElement;
    expect(group?.tagName).not.toBe('NAV');
    for (const button of buttons) expect(group).toContainElement(button);
    for (let i = 1; i < buttons.length; i += 1) {
      const follows = buttons[i - 1].compareDocumentPosition(buttons[i]);
      expect(follows & Node.DOCUMENT_POSITION_FOLLOWING, `${RIGHT_ORDER[i]} after ${RIGHT_ORDER[i - 1]}`).toBeTruthy();
    }
  });

  it('keeps the nav links on the left, before the group', () => {
    renderNav();
    const materials = screen.getByRole('link', { name: 'Materials' });
    const sync = screen.getByRole('button', { name: 'Sync' });
    expect(materials.compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(materials.closest('span')).not.toContainElement(sync);
  });
});

describe('TopNav — the search icon glyph in both states', () => {
  it('draws the magnifier, with the same button class, collapsed and expanded', () => {
    renderNav();
    const icon = screen.getByRole('button', { name: 'Search' });
    const collapsedClass = icon.className;
    expect(icon.querySelector('svg[viewBox] path')).not.toBeNull();

    fireEvent.click(icon);
    expect(icon).toHaveAttribute('aria-expanded', 'true');
    expect(icon.querySelector('svg[viewBox] path')).not.toBeNull();
    // One class for both states: the open look hangs off aria-expanded, so no
    // composes chain can drop the shared icon-button styles (walk 17 shot 28).
    expect(icon.className).toBe(collapsedClass);
  });
});
