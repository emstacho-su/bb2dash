/**
 * "Update desktop app" in the account menu (Stack, 2026-09-30). Shown only inside the
 * desktop shell (feature-detected on `window.bb2dashDesktop.requestUpdate`); a normal
 * browser never sees it. The item reports its state inline.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('@/components/shell/NavSearch', () => ({
  NavSearch: () => <button type="button">Search</button>,
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn(), signOut: vi.fn() } }),
}));
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourses: () => ({ data: [], isPending: false, isError: false }) };
});

const { SidebarProvider } = await import('@/components/shell/SidebarProvider');
const { TopNav } = await import('@/components/shell/TopNav');

type BridgeWindow = Window & { bb2dashDesktop?: unknown };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function openAccountMenu() {
  render(
    <SidebarProvider>
      <TopNav userEmail="stack@syr.edu" />
    </SidebarProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Account' }));
}

afterEach(() => {
  delete (window as BridgeWindow).bb2dashDesktop;
});

describe('TopNav — Update desktop app', () => {
  it('is absent in a normal browser', () => {
    openAccountMenu();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /update/i })).toBeNull();
  });

  it('is absent with an older shell whose bridge has only a version', () => {
    (window as BridgeWindow).bb2dashDesktop = { version: '0.1.0' };
    openAccountMenu();
    expect(screen.queryByRole('menuitem', { name: /update/i })).toBeNull();
  });

  it('is shown inside the desktop app, above Sign out', () => {
    (window as BridgeWindow).bb2dashDesktop = { version: '0.1.0', requestUpdate: vi.fn() };
    openAccountMenu();
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['Update desktop app', 'Sign out']);
  });

  it('shows "Checking for updates…" disabled while pending, then "Up to date"', async () => {
    const pending = deferred<unknown>();
    const requestUpdate = vi.fn(() => pending.promise);
    (window as BridgeWindow).bb2dashDesktop = { version: '0.1.0', requestUpdate };
    openAccountMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Update desktop app' }));
    const checking = screen.getByRole('menuitem', { name: 'Checking for updates…' });
    expect(checking).toBeDisabled();
    expect(checking).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(checking);
    expect(requestUpdate).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve({ status: 'up-to-date', build: 'abc1234' }));
    expect(screen.getByRole('menuitem', { name: 'Up to date' })).toBeEnabled();
  });

  it('shows the restart message for a newer build', async () => {
    (window as BridgeWindow).bb2dashDesktop = {
      version: '0.1.0',
      requestUpdate: async () => ({ status: 'restarting', build: '31215cf' }),
    };
    openAccountMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Update desktop app' }));
    });
    expect(screen.getByRole('menuitem', { name: 'Updating — bb2dash will restart' })).toBeDisabled();
  });

  it('shows the failure reason', async () => {
    (window as BridgeWindow).bb2dashDesktop = {
      version: '0.1.0',
      requestUpdate: async () => ({ status: 'failed', reason: 'the build failed' }),
    };
    openAccountMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Update desktop app' }));
    });
    expect(screen.getByRole('menuitem', { name: 'Update failed: the build failed' })).toBeEnabled();
  });

  it('handles a malformed answer as a failure', async () => {
    (window as BridgeWindow).bb2dashDesktop = {
      version: '0.1.0',
      requestUpdate: async () => ({ status: '<b>owned</b>' }),
    };
    openAccountMenu();
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Update desktop app' }));
    });
    expect(
      screen.getByRole('menuitem', { name: 'Update failed: unexpected answer from the desktop app' }),
    ).toBeInTheDocument();
  });

  it('keeps the state when the menu is closed and reopened mid-check', async () => {
    const pending = deferred<unknown>();
    (window as BridgeWindow).bb2dashDesktop = { version: '0.1.0', requestUpdate: () => pending.promise };
    openAccountMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Update desktop app' }));
    const account = screen.getByRole('button', { name: 'Account' });
    fireEvent.click(account);
    fireEvent.click(account);
    expect(screen.getByRole('menuitem', { name: 'Checking for updates…' })).toBeDisabled();
    await act(async () => pending.resolve({ status: 'up-to-date', build: null }));
  });
});
