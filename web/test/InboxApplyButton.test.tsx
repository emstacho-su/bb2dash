/**
 * The Inbox's "Apply answers" button — the second app-to-agent request.
 *
 * The app cannot apply an answer itself: deciding what "yes, that one" means
 * for a given row takes reading the syllabus, the gradebook and what the course
 * already does, which is a Claude session's job, not a mutation's. So this
 * button is a request, exactly like Sync: it files an `agent_requests` row of
 * kind `inbox_feedback`, copies `claude "/inbox-apply <id>"`, and then shows
 * that request's state until the worker closes it.
 *
 * The query hooks are stubbed (the real `inboxApplyCommand` and
 * `copyToClipboard` are kept), so no query client and no network are involved —
 * the same arrangement as `SyncButton.test.tsx`.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsync = vi.fn();
const createState = { isPending: false, isError: false, error: null as Error | null };
const requestState = { data: null as { state: string } | null };
const openState = { data: null as { id: number; state: string } | null, isPending: false };
const queueState = { data: undefined as number | undefined };
const refreshOnSettled = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));

vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync, ...createState }),
    useAgentRequest: () => requestState,
    useOpenInboxApplyRequest: () => openState,
    useInboxQueueCount: () => queueState,
    useRefreshInboxOnSettled: refreshOnSettled,
  };
});

const { InboxApplyButton } = await import('@/components/inbox/InboxApplyButton');

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  createState.isPending = false;
  createState.isError = false;
  createState.error = null;
  requestState.data = null;
  openState.data = null;
  openState.isPending = false;
  queueState.data = undefined;
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
});

describe('Apply answers — the label', () => {
  it('counts the rows waiting in v_inbox_queue', () => {
    queueState.data = 3;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply 3 answers' })).toBeInTheDocument();
  });

  it('says one answer in the singular', () => {
    queueState.data = 1;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply 1 answer' })).toBeInTheDocument();
  });

  it('claims no count it does not have yet', () => {
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeInTheDocument();
  });

  it('says what it asks for, in the title', () => {
    queueState.data = 2;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: /Apply/ })).toHaveAttribute(
      'title',
      'Ask a Claude session to apply your Inbox answers',
    );
  });
});

describe('Apply answers — the clipboard command', () => {
  it('files an inbox_feedback request and copies claude "/inbox-apply <id>"', async () => {
    queueState.data = 3;
    mutateAsync.mockResolvedValue({ id: 42, state: 'queued' });
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'Apply 3 answers' }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith('claude "/inbox-apply 42"');
    expect(mutateAsync).toHaveBeenCalledWith({ kind: 'inbox_feedback', scope: 'all' });
  });

  it('shows the command and the "run it in Claude Code" toast after copying', async () => {
    queueState.data = 2;
    mutateAsync.mockResolvedValue({ id: 7, state: 'queued' });
    render(<InboxApplyButton />);
    screen.getByRole('button', { name: 'Apply 2 answers' }).click();

    expect(await screen.findByText('claude "/inbox-apply 7"')).toBeInTheDocument();
    expect(
      screen.getByText('command copied — run it in Claude Code'),
    ).toBeInTheDocument();
  });

  it('still shows the command when the clipboard is denied, and says it was not copied', async () => {
    queueState.data = 2;
    mutateAsync.mockResolvedValue({ id: 9, state: 'queued' });
    writeText.mockRejectedValue(new Error('clipboard blocked'));
    render(<InboxApplyButton />);
    screen.getByRole('button', { name: 'Apply 2 answers' }).click();

    expect(await screen.findByText('claude "/inbox-apply 9"')).toBeInTheDocument();
    expect(screen.getByText('copy this and run it in Claude Code')).toBeInTheDocument();
  });
});

describe('Apply answers — the request state', () => {
  it('reads each state in the Inbox vocabulary, not the sync one', () => {
    for (const [state, label] of [
      ['queued', 'apply requested'],
      ['claimed', 'applying…'],
      ['done', 'answers applied'],
      ['failed', 'apply failed'],
      ['cancelled', 'apply cancelled'],
    ] as const) {
      requestState.data = { state };
      const view = render(<InboxApplyButton />);
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      view.unmount();
    }
  });

  it('surfaces a failed insert rather than pretending an apply was requested', () => {
    queueState.data = 2;
    createState.isError = true;
    createState.error = new Error('row-level security');
    render(<InboxApplyButton />);
    expect(screen.getByRole('alert').textContent).toContain('row-level security');
  });
});

describe('Apply answers — one open request at a time', () => {
  it('re-copies the open request instead of filing a second one', async () => {
    queueState.data = 3;
    openState.data = { id: 8, state: 'queued' };
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'apply requested' }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith('claude "/inbox-apply 8"');
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText('claude "/inbox-apply 8"')).toBeInTheDocument();
  });

  it('shows a claimed request found on load as applying, before this tab filed anything', () => {
    queueState.data = 3;
    openState.data = { id: 8, state: 'claimed' };
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'applying…' })).toBeInTheDocument();
  });
});

describe('Apply answers — nothing to apply', () => {
  it('is disabled when the queue is known to be empty and nothing is open', () => {
    queueState.data = 0;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply 0 answers' })).toBeDisabled();
  });

  it('is live while the count is still unknown', () => {
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeEnabled();
  });

  it('stays live on an empty queue while a request is still open', () => {
    queueState.data = 0;
    openState.data = { id: 8, state: 'claimed' };
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'applying…' })).toBeEnabled();
  });

  it('waits for the open-request lookup before it can be pressed, so no second request is filed', () => {
    queueState.data = 5;
    openState.isPending = true;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply 5 answers' })).toBeDisabled();
  });
});

describe('Apply answers — when the worker closes the request', () => {
  it('asks the Inbox to refresh on the polled request state', () => {
    requestState.data = { state: 'done' };
    render(<InboxApplyButton />);
    expect(refreshOnSettled).toHaveBeenLastCalledWith('done');
  });

  it('passes null while nothing has been filed from this tab', () => {
    render(<InboxApplyButton />);
    expect(refreshOnSettled).toHaveBeenLastCalledWith(null);
  });
});
