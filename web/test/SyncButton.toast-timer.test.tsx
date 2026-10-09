/**
 * The Sync toast's timer waits (Phase 22, task 32; D-4, entry `toast-waits`).
 *
 * A toast with nothing to act on goes after `TOAST_MS` (15 s). While the pointer rests on it or focus
 * is inside it, the timer stops; when the pointer leaves it starts again, so the toast goes `TOAST_MS`
 * after that. A toast that asks for something stays until dismissed, and Dismiss puts focus on Sync.
 * jsdom reads no exit time, so a toast that goes is gone in the same render.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: number };

const mutateAsync = vi.fn();
const openState = { data: null as Row | null, error: null as Error | null };
const requestState = { data: null as Row | null, error: null as Error | null };
const runState = { data: { status: 'ok' } as { status: string } | null, error: null as Error | null };

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync, isPending: false, isError: false, error: null }),
    useAgentRequest: (id: number | null) => ({
      data: id !== null && requestState.data?.id === id ? requestState.data : null,
      error: requestState.error,
    }),
    useOpenSyncRequest: () => openState,
  };
});
vi.mock('@/lib/queries.sync-run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync-run')>();
  return { ...actual, useSyncRun: () => runState };
});

const { SyncButton } = await import('@/components/shell/SyncButton');

const NOW = new Date('2026-10-05T18:08:00.000Z');
const TOAST_MS = 15_000;
const RUN_ID = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';

function row(overrides: Record<string, unknown> = {}): Row {
  return {
    id: 8,
    state: 'queued',
    created_at: new Date(NOW.getTime() - 10_000).toISOString(),
    claimed_by: null,
    claim_attempts: 0,
    run_id: null,
    finished_at: null,
    result: null,
    ...overrides,
  };
}

/** A press of Sync that files a request: the "sync requested" note appears. */
async function pressSync() {
  mutateAsync.mockResolvedValue(row({ id: 42 }));
  render(<SyncButton />);
  await act(async () => {
    fireEvent.click(screen.getByTestId('sync-button'));
  });
}

const toast = () => screen.queryByRole('status');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: false, now: NOW });
  openState.data = null;
  requestState.data = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a toast with nothing to act on', () => {
  it('is gone after TOAST_MS', async () => {
    await pressSync();
    expect(toast()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(toast()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toast()).toBeNull();
  });

  it('stays while the pointer is on it, and goes TOAST_MS after the pointer leaves', async () => {
    await pressSync();

    fireEvent.pointerEnter(toast() as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 3);
    });
    expect(toast()).not.toBeNull();

    fireEvent.pointerLeave(toast() as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(toast()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(toast()).toBeNull();
  });

  it('stays while focus is inside it, and goes TOAST_MS after focus leaves', async () => {
    await pressSync();

    fireEvent.focus(toast() as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 3);
    });
    expect(toast()).not.toBeNull();

    fireEvent.blur(toast() as HTMLElement);
    act(() => {
      vi.advanceTimersByTime(TOAST_MS);
    });
    expect(toast()).toBeNull();
  });
});

describe('a toast that asks for something', () => {
  /** A watched runner claim and then its close with a file that needs Stack. */
  function closeWithPrompt() {
    openState.data = row({ state: 'claimed', claimed_by: 'sync-runner', claim_attempts: 1, run_id: RUN_ID });
    const view = render(<SyncButton />);
    openState.data = null;
    requestState.data = row({
      state: 'done',
      claimed_by: 'sync-runner',
      claim_attempts: 1,
      finished_at: NOW.toISOString(),
      result: {
        error: null,
        lines: ['Files: 3 pulled, 1 not pulled', 'Not pulled: file 2489 (storage 400: InvalidKey)'],
        files: { pulled: 3, not_pulled: [{ id: '2489', reason: 'storage 400: InvalidKey' }] },
      },
    });
    view.rerender(<SyncButton />);
    return view;
  }

  it('stays until it is dismissed, and Dismiss puts focus on Sync', () => {
    closeWithPrompt();
    expect(toast()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(TOAST_MS * 4);
    });
    expect(toast()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(toast()).toBeNull();
    expect(screen.getByTestId('sync-button')).toHaveFocus();
  });
});
