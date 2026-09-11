/**
 * The Sync button: it files an `agent_requests` row and then puts the exact
 * command Stack has to run on his clipboard. The command string is the whole
 * contract with the `bb-sync` skill, so it is asserted character for character.
 *
 * The two query hooks are stubbed (the real `syncCommand` and `copyToClipboard`
 * are kept), so no query client and no network are involved.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsync = vi.fn();
const createState = { isPending: false, isError: false, error: null as Error | null };
const requestState = { data: null as { state: string } | null };

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));

vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync, ...createState }),
    useAgentRequest: () => requestState,
  };
});

const { SyncButton } = await import('@/components/shell/SyncButton');

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  createState.isPending = false;
  createState.isError = false;
  createState.error = null;
  requestState.data = null;
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

describe('Sync button — the clipboard command', () => {
  it('copies claude "/bb-sync <request id>" for the row it just filed', async () => {
    mutateAsync.mockResolvedValue({ id: 42, state: 'queued' });
    render(<SyncButton />);

    screen.getByRole('button', { name: /Sync/ }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith('claude "/bb-sync 42"');
    expect(mutateAsync).toHaveBeenCalledWith({ kind: 'sync', scope: 'all' });
  });

  it('shows the command and the "run it in Claude Code" toast after copying', async () => {
    mutateAsync.mockResolvedValue({ id: 7, state: 'queued' });
    render(<SyncButton />);
    screen.getByRole('button', { name: /Sync/ }).click();

    expect(await screen.findByText('claude "/bb-sync 7"')).toBeInTheDocument();
    expect(
      screen.getByText('command copied — run it in Claude Code with a logged-in Blackboard tab'),
    ).toBeInTheDocument();
  });

  it('still shows the command when the clipboard is denied, and says it was not copied', async () => {
    mutateAsync.mockResolvedValue({ id: 9, state: 'queued' });
    writeText.mockRejectedValue(new Error('clipboard blocked'));
    render(<SyncButton />);
    screen.getByRole('button', { name: /Sync/ }).click();

    expect(await screen.findByText('claude "/bb-sync 9"')).toBeInTheDocument();
    expect(
      screen.getByText('copy this and run it in Claude Code with a logged-in Blackboard tab'),
    ).toBeInTheDocument();
  });
});

describe('Sync button — the request state', () => {
  it('shows the filed request state once it is known', async () => {
    mutateAsync.mockResolvedValue({ id: 42, state: 'queued' });
    requestState.data = { state: 'claimed' };
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: /syncing…/ })).toBeInTheDocument();
  });

  it('surfaces a failed insert rather than pretending a sync was requested', () => {
    createState.isError = true;
    createState.error = new Error('row-level security');
    render(<SyncButton />);
    expect(screen.getByRole('alert').textContent).toContain('row-level security');
  });
});
