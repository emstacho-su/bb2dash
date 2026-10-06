/**
 * The top bar's Workspace link (Phase 21, task 16; S2-workspace-1).
 *
 * `NAV_LINKS` gains one entry, `{ href: '/workspace', label: 'Workspace' }`,
 * after Materials: the sixth link. Nothing else in the bar changes, and no
 * shrink rule is added to `TopNav.module.css` (brief 102, "Top bar").
 */

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
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
vi.mock('@/components/shell/NavSearch', () => ({
  NavSearch: () => <button type="button">Search</button>,
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn(), signOut: vi.fn() } }),
}));

const { SidebarProvider } = await import('@/components/shell/SidebarProvider');
const { TopNav } = await import('@/components/shell/TopNav');

/** The brand link comes first in the bar and is not one of the section links. */
const BRAND = 'bb2dash';

function sectionLinks(): HTMLElement[] {
  const nav = screen.getByRole('navigation', { name: 'Primary' });
  return within(nav)
    .getAllByRole('link')
    .filter((link) => link.textContent !== BRAND);
}

function renderNav(pathname: string) {
  route.pathname = pathname;
  return render(
    <SidebarProvider>
      <TopNav userEmail="stack@syr.edu" />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  route.pathname = '/';
});

describe('TopNav — the Workspace link', () => {
  it('sits after Materials, the sixth link', () => {
    renderNav('/');

    expect(sectionLinks().map((link) => link.textContent)).toEqual([
      'Home',
      'Planner',
      'Inbox',
      'Grades',
      'Materials',
      'Workspace',
    ]);
  });

  it('goes to /workspace', () => {
    renderNav('/');

    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('href', '/workspace');
  });

  it('is the current page on /workspace, and only there', () => {
    const { unmount } = renderNav('/workspace');
    expect(screen.getByRole('link', { name: 'Workspace' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Materials' })).not.toHaveAttribute('aria-current');
    unmount();

    renderNav('/materials');
    expect(screen.getByRole('link', { name: 'Workspace' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Materials' })).toHaveAttribute('aria-current', 'page');
  });
});
