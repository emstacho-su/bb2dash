/**
 * The Sync button after the Phase 14 cut-over: a press files an `agent_requests`
 * row and the `sync` container's runner takes it, so nothing is copied and no
 * terminal is named. The button's label follows what the runner writes (its
 * claim, the run it opens, the close), and the paste command comes back only as
 * the fallback for a request nothing claimed.
 *
 * The query hooks are stubbed (the real `syncCommand`, `copyToClipboard` and the
 * phase helpers are kept), so no query client and no network are involved.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsync = vi.fn();
const createState = { isPending: false, isError: false, error: null as Error | null };
const requestState = { data: null as Record<string, unknown> | null };
const openState = { data: null as Record<string, unknown> | null };
const runState = { data: null as { status: string } | null };

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));

vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync, ...createState }),
    useAgentRequest: () => requestState,
    useOpenSyncRequest: () => openState,
  };
});

vi.mock('@/lib/queries.sync-run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync-run')>();
  return { ...actual, useSyncRun: () => runState };
});

const { SyncButton } = await import('@/components/shell/SyncButton');

const NOW = new Date('2026-10-05T18:08:00.000Z');
const RUN_ID = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const writeText = vi.fn();

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 8,
    state: 'queued',
    created_at: new Date(NOW.getTime() - 10_000).toISOString(),
    claimed_by: null,
    run_id: null,
    finished_at: null,
    result: null,
    ...overrides,
  };
}

function runnerClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return row({ state: 'claimed', claimed_by: 'sync-runner', run_id: RUN_ID, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  createState.isPending = false;
  createState.isError = false;
  createState.error = null;
  requestState.data = null;
  openState.data = null;
  runState.data = null;
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sync button — a press queues for the container', () => {
  it('files the request and copies nothing', async () => {
    mutateAsync.mockResolvedValue(row({ id: 42 }));
    render(<SyncButton />);

    screen.getByRole('button', { name: 'Sync' }).click();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ kind: 'sync', scope: 'all' }));
    expect(
      await screen.findByText(
        'Sync requested — the sync container picks it up within about a minute. No terminal needed.',
      ),
    ).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText(/bb-sync/)).not.toBeInTheDocument();
  });

  it('names the container in the idle tooltip, not a Claude session', () => {
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'Sync' })).toHaveAttribute(
      'title',
      'Ask the sync container to crawl Blackboard',
    );
  });

  it('surfaces a failed insert rather than pretending a sync was requested', () => {
    createState.isError = true;
    createState.error = new Error('row-level security');
    render(<SyncButton />);
    expect(screen.getByRole('alert').textContent).toContain('row-level security');
  });
});

describe('Sync button — the label follows the runner', () => {
  it('a young queued request found on load reads as requested', () => {
    openState.data = row();
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'sync requested' })).toBeInTheDocument();
  });

  it("the runner's claim with no run yet is starting", () => {
    openState.data = runnerClaim({ run_id: null });
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'container: starting…' })).toBeInTheDocument();
  });

  it("the runner's claim with a running run is crawling, with the live mark", () => {
    openState.data = runnerClaim();
    runState.data = { status: 'running' };
    render(<SyncButton />);
    const button = screen.getByRole('button', { name: 'container: crawling…' });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('[data-live]')).not.toBeNull();
    expect(button).toHaveAttribute(
      'title',
      'The sync container is crawling Blackboard and folding the result in',
    );
  });

  it('a folded run under the open claim is pulling files', () => {
    openState.data = runnerClaim();
    runState.data = { status: 'ok' };
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'container: pulling files…' })).toBeInTheDocument();
  });

  it('a claim by a Claude Code session says so', () => {
    openState.data = row({ state: 'claimed', claimed_by: 'bb-sync session' });
    render(<SyncButton />);
    const button = screen.getByRole('button', { name: 'Claude Code: syncing…' });
    expect(button).toHaveAttribute('title', 'A Claude Code session (bb-sync session) is running this sync');
  });

  it("this tab's filed request wins over the open lookup once it is known", () => {
    openState.data = row();
    requestState.data = runnerClaim({ run_id: null });
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'container: starting…' })).toBeInTheDocument();
  });

  it('the idle button carries no live mark', () => {
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'Sync' }).querySelector('[data-live]')).toBeNull();
  });
});

describe('Sync button — one open request at a time', () => {
  it('re-shows the status instead of filing while a request is moving', async () => {
    openState.data = runnerClaim();
    runState.data = { status: 'running' };
    render(<SyncButton />);

    screen.getByRole('button', { name: 'container: crawling…' }).click();

    expect(
      await screen.findByText('The sync container is crawling Blackboard and folding the result in'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('files a new request once the last one is done', async () => {
    requestState.data = row({ id: 7, state: 'done' });
    mutateAsync.mockResolvedValue(row({ id: 11 }));
    render(<SyncButton />);

    screen.getByRole('button', { name: 'sync done' }).click();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });
});

describe('Sync button — the fallback when nothing claims the request', () => {
  const stale = () => row({ created_at: new Date(NOW.getTime() - 90_000).toISOString() });

  it('says it is waiting on the container after the grace', () => {
    openState.data = stale();
    render(<SyncButton />);
    const button = screen.getByRole('button', { name: 'waiting on the container…' });
    expect(button).toHaveAttribute(
      'title',
      'Nothing has claimed this sync in 90 s. Is the sync container up? Press again for the fallback command.',
    );
  });

  it('a press then copies the paste command and shows it', async () => {
    openState.data = stale();
    render(<SyncButton />);

    screen.getByRole('button', { name: 'waiting on the container…' }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith('claude --model sonnet "/bb-sync 8"');
    expect(await screen.findByText('claude --model sonnet "/bb-sync 8"')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing has claimed this sync. If the sync container is down, the command is copied — run it in Claude Code with a logged-in Blackboard tab.',
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('still shows the command when the clipboard is denied, and says it was not copied', async () => {
    openState.data = stale();
    writeText.mockRejectedValue(new Error('clipboard blocked'));
    render(<SyncButton />);

    screen.getByRole('button', { name: 'waiting on the container…' }).click();

    expect(await screen.findByText('claude --model sonnet "/bb-sync 8"')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing has claimed this sync. If the sync container is down, copy this and run it in Claude Code with a logged-in Blackboard tab.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Sync button — the close', () => {
  it("announces the report's first line when the watched request finishes", async () => {
    openState.data = runnerClaim();
    runState.data = { status: 'ok' };
    const view = render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'container: pulling files…' })).toBeInTheDocument();

    openState.data = null;
    requestState.data = row({
      state: 'done',
      claimed_by: 'sync-runner',
      finished_at: NOW.toISOString(),
      result: { error: null, lines: ['Files: 3 pulled, 1 not pulled'] },
    });
    view.rerender(<SyncButton />);

    expect(screen.getByRole('button', { name: 'sync done' })).toBeInTheDocument();
    expect(await screen.findByText('Sync done · Files: 3 pulled, 1 not pulled')).toBeInTheDocument();
  });

  it('announces a failure with its line', async () => {
    openState.data = row();
    const view = render(<SyncButton />);

    openState.data = null;
    requestState.data = row({
      state: 'failed',
      finished_at: NOW.toISOString(),
      result: { error: 'login_required', lines: ['Blackboard login needed: the sync did not start.'] },
    });
    view.rerender(<SyncButton />);

    expect(
      await screen.findByText('Sync failed · Blackboard login needed: the sync did not start.'),
    ).toBeInTheDocument();
  });

  it('does not announce a request that was already closed when the page loaded', () => {
    requestState.data = row({ state: 'done', result: { lines: ['Files: 1 pulled'] } });
    render(<SyncButton />);
    expect(screen.queryByText(/Sync done ·/)).not.toBeInTheDocument();
  });
});
