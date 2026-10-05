/**
 * The Sync button after the Phase 14 cut-over: a press files an `agent_requests`
 * row and the `sync` container's runner takes it, so nothing is copied and no
 * terminal is named. The button's label follows what the runner writes (its
 * claim, the run it opens, the close), the arrows circle while the container
 * works, and the paste command comes back only as the fallback for a request
 * nothing claimed. A close that left a file unpulled stays up with the way to
 * the Inbox.
 *
 * The query hooks are stubbed (the real `syncCommand`, `copyToClipboard`,
 * `relativeTime` and the phase helpers are kept), so no query client and no
 * network are involved. The stubbed `useAgentRequest` honours the id it is asked
 * for, the way the real hook does, so the tests that follow a request by id mean
 * what they say.
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown> & { id: number };

const mutateAsync = vi.fn();
const createState = { isPending: false, isError: false, error: null as Error | null };
const requestState = { data: null as Row | null, error: null as Error | null };
const openState = { data: null as Row | null, error: null as Error | null };
const runState = { data: null as { status: string } | null, error: null as Error | null };
const runCalls: Array<[string | null, boolean]> = [];

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
    useCreateAgentRequest: () => ({ mutateAsync, ...createState }),
    useAgentRequest: (id: number | null) => ({
      data: id !== null && requestState.data?.id === id ? requestState.data : null,
      error: requestState.error,
    }),
    useOpenSyncRequest: () => openState,
  };
});

vi.mock('@/lib/queries.sync-run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync-run')>();
  return {
    ...actual,
    useSyncRun: (runId: string | null, claimed: boolean) => {
      runCalls.push([runId, claimed]);
      return runState;
    },
  };
});

const { SyncButton } = await import('@/components/shell/SyncButton');

const NOW = new Date('2026-10-05T18:08:00.000Z');
const RUN_ID = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const writeText = vi.fn();

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

function runnerClaim(overrides: Record<string, unknown> = {}): Row {
  return row({ state: 'claimed', claimed_by: 'sync-runner', claim_attempts: 1, run_id: RUN_ID, ...overrides });
}

/** A watched runner claim, then its close with the given report. */
function closeAfterWatching(result: Record<string, unknown>, state = 'done') {
  openState.data = runnerClaim();
  runState.data = { status: 'ok' };
  const view = render(<SyncButton />);
  openState.data = null;
  requestState.data = row({
    state,
    claimed_by: 'sync-runner',
    claim_attempts: 1,
    finished_at: NOW.toISOString(),
    result,
  });
  view.rerender(<SyncButton />);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  createState.isPending = false;
  createState.isError = false;
  createState.error = null;
  requestState.data = null;
  requestState.error = null;
  openState.data = null;
  openState.error = null;
  runState.data = null;
  runState.error = null;
  runCalls.length = 0;
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
        'Sync requested — the sync container takes queued requests within about a minute.',
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

  it("surfaces a failed read of the sync's state instead of sitting on a stale label", () => {
    openState.error = new Error('permission denied for table agent_requests');
    render(<SyncButton />);
    expect(screen.getByRole('alert').textContent).toBe(
      "Could not read the sync's state: permission denied for table agent_requests",
    );
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
    expect(screen.getByRole('button', { name: 'starting…' })).toBeInTheDocument();
  });

  it("the runner's claim with a running run reads crawling, with the container in the tooltip", () => {
    openState.data = runnerClaim();
    runState.data = { status: 'running' };
    render(<SyncButton />);
    const button = screen.getByRole('button', { name: 'crawling…' });
    expect(button).toHaveAttribute(
      'title',
      'The sync container is crawling Blackboard and folding the result in',
    );
  });

  it('a folded run under the open claim is pulling files', () => {
    openState.data = runnerClaim();
    runState.data = { status: 'ok' };
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'pulling files…' })).toBeInTheDocument();
  });

  it("reads the run row only for the runner's claim", () => {
    openState.data = runnerClaim();
    render(<SyncButton />);
    expect(runCalls.at(-1)).toEqual([RUN_ID, true]);
  });

  it('a claim by a Claude Code session says so and never reads the run row', () => {
    openState.data = row({ state: 'claimed', claimed_by: 'bb-sync session', run_id: RUN_ID });
    render(<SyncButton />);
    const button = screen.getByRole('button', { name: 'Claude Code: syncing…' });
    expect(button).toHaveAttribute('title', 'A Claude Code session (bb-sync session) is running this sync');
    expect(runCalls.every(([, claimed]) => claimed === false)).toBe(true);
  });

  it('a requeued request says so', () => {
    openState.data = row({ claim_attempts: 1 });
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'sync requeued…' })).toBeInTheDocument();
  });
});

describe('Sync button — the arrows circle while the container works', () => {
  it('turn through starting, crawling, pulling files and finishing', () => {
    for (const status of [null, 'running', 'ok', 'failed']) {
      openState.data = runnerClaim();
      runState.data = status === null ? null : { status };
      const view = render(<SyncButton />);
      expect(screen.getByRole('button')).toHaveAttribute('data-live');
      view.unmount();
    }
  });

  it('stand still when idle, queued, waiting, in a Claude Code session, or done', () => {
    const rows: Array<Row | null> = [
      null,
      row(),
      row({ created_at: new Date(NOW.getTime() - 90_000).toISOString() }),
      row({ state: 'claimed', claimed_by: 'bb-sync session', run_id: RUN_ID }),
    ];
    for (const open of rows) {
      openState.data = open;
      const view = render(<SyncButton />);
      expect(screen.getByRole('button')).not.toHaveAttribute('data-live');
      view.unmount();
    }
    closeAfterWatching({ lines: ['Files: 1 pulled'] });
    expect(screen.getByRole('button', { name: 'sync done' })).not.toHaveAttribute('data-live');
  });
});

describe('Sync button — following a request by id', () => {
  it('follows the open request it sees, so its own fresher read wins once it is known', () => {
    openState.data = row();
    requestState.data = runnerClaim({ run_id: null });
    render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'starting…' })).toBeInTheDocument();
  });

  it("a closed request of this tab's never hides a newer open one, and a press files nothing", async () => {
    openState.data = row({ id: 10 });
    const view = render(<SyncButton />);
    expect(screen.getByRole('button', { name: 'sync requested' })).toBeInTheDocument();

    openState.data = row({ id: 11 });
    requestState.data = row({ id: 10, state: 'done', finished_at: NOW.toISOString() });
    view.rerender(<SyncButton />);

    const button = screen.getByRole('button', { name: 'sync requested' });
    button.click();
    expect(
      await screen.findByText('Requested; the sync container takes queued requests within about a minute'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('re-shows the status instead of filing while a request is moving', async () => {
    openState.data = runnerClaim();
    runState.data = { status: 'running' };
    render(<SyncButton />);

    screen.getByRole('button', { name: 'crawling…' }).click();

    expect(
      await screen.findByText('The sync container is crawling Blackboard and folding the result in'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('files a new request once the one it followed is done', async () => {
    openState.data = row({ id: 7 });
    const view = render(<SyncButton />);

    openState.data = null;
    requestState.data = row({ id: 7, state: 'done', finished_at: NOW.toISOString() });
    view.rerender(<SyncButton />);
    mutateAsync.mockResolvedValue(row({ id: 11 }));

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
      'Nothing has claimed this sync in 90 s. The sync container may be busy or down; press again for the fallback command.',
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

  it('a requeued request offers the command on a press too', async () => {
    openState.data = row({ claim_attempts: 1 });
    render(<SyncButton />);

    screen.getByRole('button', { name: 'sync requeued…' }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('claude --model sonnet "/bb-sync 8"'));
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
  it("announces the report's first line when a request it watched, but never pressed, finishes", async () => {
    closeAfterWatching({ error: null, lines: ['Files: 3 pulled'], files: { pulled: 3, not_pulled: [] } });

    expect(screen.getByRole('button', { name: 'sync done' })).toBeInTheDocument();
    expect(await screen.findByText('Sync done · Files: 3 pulled')).toBeInTheDocument();
    expect(screen.queryByText(/could not be pulled/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('a close with nothing to act on goes away on its own', async () => {
    closeAfterWatching({ lines: ['Files: 3 pulled'] });
    expect(await screen.findByText('Sync done · Files: 3 pulled')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(16_000);
    });

    expect(screen.queryByText('Sync done · Files: 3 pulled')).not.toBeInTheDocument();
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

  it('announces a cancellation', async () => {
    openState.data = row();
    const view = render(<SyncButton />);

    openState.data = null;
    requestState.data = row({ state: 'cancelled', finished_at: NOW.toISOString() });
    view.rerender(<SyncButton />);

    expect(screen.getByRole('button', { name: 'sync cancelled' })).toBeInTheDocument();
    expect(await screen.findByText('Sync cancelled')).toBeInTheDocument();
  });

  it('dates the closed request in the tooltip', () => {
    openState.data = row({ id: 7 });
    const view = render(<SyncButton />);

    openState.data = null;
    requestState.data = row({
      id: 7,
      state: 'done',
      finished_at: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    view.rerender(<SyncButton />);

    expect(screen.getByRole('button', { name: 'sync done' })).toHaveAttribute('title', 'Sync done 2 min ago');
  });

  it('does not announce a request that was already closed when the page loaded', () => {
    requestState.data = row({ state: 'done', result: { lines: ['Files: 1 pulled'] } });
    render(<SyncButton />);
    expect(screen.queryByText(/Sync done/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument();
  });
});

describe('Sync button — a file that needs Stack after the close', () => {
  const STORAGE_REFUSED = {
    error: null,
    lines: ['Files: 3 pulled, 1 not pulled', 'Not pulled: file 2489 (storage 400: InvalidKey)'],
    files: { pulled: 3, not_pulled: [{ id: '2489', reason: 'storage 400: InvalidKey' }] },
  };

  it('prompts with the way to the Inbox and stays up past the usual toast time', async () => {
    closeAfterWatching(STORAGE_REFUSED);

    expect(await screen.findByText('Sync done · Files: 3 pulled, 1 not pulled')).toBeInTheDocument();
    expect(
      screen.getByText(
        'One file could not be pulled. Its Inbox item has the Blackboard link; open it and say what should happen.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the Inbox →' })).toHaveAttribute('href', '/inbox');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText(/One file could not be pulled/)).toBeInTheDocument();
  });

  it('goes away when dismissed', async () => {
    closeAfterWatching(STORAGE_REFUSED);
    expect(await screen.findByText(/One file could not be pulled/)).toBeInTheDocument();

    screen.getByRole('button', { name: 'Dismiss' }).click();

    await waitFor(() => expect(screen.queryByText(/One file could not be pulled/)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'sync done' })).toBeInTheDocument();
  });

  it('does not prompt for a file the next sync retries on its own', async () => {
    closeAfterWatching({
      error: null,
      lines: ['Files: 2 pulled, 1 not pulled', 'Files stopped: the Blackboard session expired; the rest are tried on the next sync'],
      files: { pulled: 2, not_pulled: [{ id: '2489', reason: 'session_expired: login page' }] },
    });

    expect(await screen.findByText('Sync done · Files: 2 pulled, 1 not pulled')).toBeInTheDocument();
    expect(screen.queryByText(/could not be pulled/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it("counts the skill's figure, which carries no reasons", async () => {
    closeAfterWatching({ run_id: RUN_ID, status: 'ok', files_pulled: 1, files_not_pulled: 2 });

    expect(await screen.findByText('Sync done · Files: 1 pulled, 2 not pulled')).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 files could not be pulled. Their Inbox items have the Blackboard links; open them and say what should happen.',
      ),
    ).toBeInTheDocument();
  });
});
