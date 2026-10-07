/**
 * The Inbox's "Apply answers" button — the second app-to-agent request, after
 * Phase 23 (Inbox auto-apply).
 *
 * The app cannot apply an answer itself: deciding what "yes, that one" means
 * for a given row takes reading the syllabus, the gradebook and what the course
 * already does. So this button is a request, exactly like Sync: it files an
 * `agent_requests` row of kind `inbox_feedback` and the `apply` container's
 * worker takes it. Nothing is copied on a press. The same request is filed by
 * the sync container after a sync, so the button also follows a request it did
 * not file. The paste command comes back only as the fallback for a request
 * nothing has claimed.
 *
 * The query hooks are stubbed (the real `inboxApplyCommand` and
 * `copyToClipboard` are kept), so no query client and no network are involved —
 * the same arrangement as `SyncButton.test.tsx`.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: number;
  state: string;
  created_at: string;
  claimed_by: string | null;
  finished_at: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
}

const WORKER = 'inbox-apply-runner';
const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function row(over: Partial<Row> = {}): Row {
  return {
    id: 8,
    state: 'queued',
    created_at: secondsAgo(5),
    claimed_by: null,
    finished_at: null,
    params: {},
    result: null,
    ...over,
  };
}

const mutateAsync = vi.fn();
const createState = { isPending: false, isError: false, error: null as unknown };
const requestState = { data: null as Row | null };
const openState = { data: null as Row | null, isPending: false };
const queueState = { data: undefined as number | undefined };
const refreshOnSettled = vi.fn();
const refreshOnQueueChange = vi.fn();
const openLookup = vi.fn();
const followedIds: (number | null)[] = [];

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));

vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync, ...createState }),
    useAgentRequest: (id: number | null) => {
      followedIds.push(id);
      return requestState;
    },
    useOpenInboxApplyRequest: (options?: { watch?: boolean }) => {
      openLookup(options);
      return openState;
    },
    useInboxQueueCount: () => queueState,
    useRefreshInboxOnSettled: refreshOnSettled,
    useRefreshInboxOnQueueChange: refreshOnQueueChange,
  };
});

const { InboxApplyButton } = await import('@/components/inbox/InboxApplyButton');

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  followedIds.length = 0;
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

describe('Apply answers — the label (R3-2)', () => {
  it('reads "Apply answers" at rest, whatever the count', () => {
    queueState.data = 3;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeInTheDocument();
  });

  it('reads "Apply answers" before the count has arrived', () => {
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeInTheDocument();
  });

  it('says what it asks for, in the title', () => {
    queueState.data = 2;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: /Apply/ })).toHaveAttribute(
      'title',
      'Ask the apply worker to apply your Inbox answers',
    );
  });

  it('renders nothing but the button while at rest', () => {
    queueState.data = 2;
    const { container } = render(<InboxApplyButton />);
    expect(container.textContent).toBe('Apply answers');
  });
});

describe('Apply answers — a press files the request and copies nothing', () => {
  it('files an inbox_feedback request, says the worker takes it, and leaves the clipboard alone', async () => {
    queueState.data = 3;
    mutateAsync.mockResolvedValue(row({ id: 42 }));
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'Apply answers' }).click();

    expect(
      await screen.findByText('Requested. The apply worker takes it within about a minute.'),
    ).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledWith({ kind: 'inbox_feedback', scope: 'all' });
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText(/claude "\/inbox-apply/)).toBeNull();
  });

  it('follows the request it filed by id', async () => {
    queueState.data = 3;
    mutateAsync.mockResolvedValue(row({ id: 42 }));
    render(<InboxApplyButton />);
    screen.getByRole('button', { name: 'Apply answers' }).click();
    await waitFor(() => expect(followedIds).toContain(42));
  });

  it('surfaces a failed insert rather than pretending an apply was requested', () => {
    queueState.data = 2;
    createState.isError = true;
    createState.error = new Error('row-level security');
    render(<InboxApplyButton />);
    expect(screen.getByRole('alert').textContent).toContain('row-level security');
  });

  it('a request the database refused because one is already open is not an error: it follows that one', async () => {
    queueState.data = 2;
    const refused = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    mutateAsync.mockRejectedValue(refused);
    createState.isError = true;
    createState.error = refused;
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'Apply answers' }).click();

    expect(await screen.findByText('A request is already open. Following that one.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Apply answers — the request state', () => {
  it('reads each state in plain words (R3-2)', () => {
    for (const [state, label] of [
      ['queued', 'queued'],
      ['claimed', 'running'],
      ['done', 'done'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
    ] as const) {
      requestState.data = row({ state, claimed_by: state === 'queued' ? null : WORKER });
      const view = render(<InboxApplyButton />);
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      view.unmount();
    }
  });

  it('says who queued it: the last sync, or this button', () => {
    queueState.data = 3;
    openState.data = row({ params: { trigger: 'sync', after: 1900 } });
    const view = render(<InboxApplyButton />);
    expect(screen.getByRole('status').textContent).toBe('Queued after the last sync');
    view.unmount();

    openState.data = row({ params: {} });
    render(<InboxApplyButton />);
    expect(screen.getByRole('status').textContent).toBe('Queued from Apply answers');
  });

  it("says the worker is applying while it holds the claim, and shows its first report line once it closes", () => {
    queueState.data = 3;
    openState.data = row({ state: 'claimed', claimed_by: WORKER });
    const view = render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'running' })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe('Applying your answers now');
    view.unmount();

    openState.data = null;
    requestState.data = row({
      state: 'done',
      claimed_by: WORKER,
      finished_at: secondsAgo(1),
      result: { lines: ['3 answers applied, 1 recorded only'], archived: 4 },
    });
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'done' })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe('3 answers applied, 1 recorded only');
  });

  it('a closed request with no report shows no line: nothing is invented', () => {
    requestState.data = row({ state: 'done', claimed_by: WORKER, result: null });
    render(<InboxApplyButton />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Apply answers — one open request at a time', () => {
  it('a press while one is queued re-shows its status: nothing filed, nothing copied', async () => {
    queueState.data = 3;
    openState.data = row({ id: 8 });
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'queued' }).click();

    expect(
      await screen.findByText('Requested; the apply worker takes queued requests within about a minute'),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('follows a request it finds open (one a sync filed), so its close is still read', () => {
    queueState.data = 3;
    openState.data = row({ id: 77, params: { trigger: 'sync', after: 1900 } });
    render(<InboxApplyButton />);
    expect(followedIds).toContain(77);
  });

  it('shows a claimed request found on load as running, before this tab filed anything', () => {
    queueState.data = 3;
    openState.data = row({ state: 'claimed', claimed_by: WORKER });
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'running' })).toBeInTheDocument();
  });

  it('a newer open request replaces a closed one this tab was following', () => {
    queueState.data = 3;
    requestState.data = row({ id: 8, state: 'done', claimed_by: WORKER });
    openState.data = row({ id: 9, state: 'claimed', claimed_by: WORKER });
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'running' })).toBeInTheDocument();
  });
});

describe('Apply answers — the fallback when nothing claims the request', () => {
  it('past the grace the button says it is waiting on the worker', () => {
    queueState.data = 3;
    openState.data = row({ created_at: secondsAgo(120) });
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'waiting on the worker…' })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe('Nothing has taken the request yet');
  });

  it('a press then copies claude "/inbox-apply <id>" and shows it', async () => {
    queueState.data = 3;
    openState.data = row({ id: 8, created_at: secondsAgo(120) });
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'waiting on the worker…' }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('claude "/inbox-apply 8"'));
    expect(await screen.findByText('claude "/inbox-apply 8"')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing has claimed this request. If the apply worker is down, the command is copied; run it in Claude Code.',
      ),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('still shows the command when the clipboard is denied, and says it was not copied', async () => {
    queueState.data = 3;
    openState.data = row({ id: 9, created_at: secondsAgo(120) });
    writeText.mockRejectedValue(new Error('clipboard blocked'));
    render(<InboxApplyButton />);

    screen.getByRole('button', { name: 'waiting on the worker…' }).click();

    expect(await screen.findByText('claude "/inbox-apply 9"')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nothing has claimed this request. If the apply worker is down, copy this and run it in Claude Code.',
      ),
    ).toBeInTheDocument();
  });
});

describe('Apply answers — nothing to apply', () => {
  it('is disabled when the queue is known to be empty and nothing is open', () => {
    queueState.data = 0;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeDisabled();
  });

  it('is live while the count is still unknown', () => {
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeEnabled();
  });

  it('stays live on an empty queue while a request is still open', () => {
    queueState.data = 0;
    openState.data = row({ state: 'claimed', claimed_by: WORKER });
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'running' })).toBeEnabled();
  });

  it('waits for the open-request lookup before it can be pressed, so no second request is filed', () => {
    queueState.data = 5;
    openState.isPending = true;
    render(<InboxApplyButton />);
    expect(screen.getByRole('button', { name: 'Apply answers' })).toBeDisabled();
  });
});

describe('Apply answers — noticing a request a sync filed', () => {
  it('keeps looking for an open request while answers wait', () => {
    queueState.data = 3;
    render(<InboxApplyButton />);
    expect(openLookup).toHaveBeenLastCalledWith({ watch: true });
  });

  it('does not keep looking when nothing is answered, or before the count is known', () => {
    queueState.data = 0;
    const view = render(<InboxApplyButton />);
    expect(openLookup).toHaveBeenLastCalledWith({ watch: false });
    view.unmount();

    queueState.data = undefined;
    render(<InboxApplyButton />);
    expect(openLookup).toHaveBeenLastCalledWith({ watch: false });
  });
});

describe('Apply answers — when the worker closes the request', () => {
  it('asks the Inbox to refresh on the followed request state', () => {
    requestState.data = row({ state: 'done', claimed_by: WORKER });
    render(<InboxApplyButton />);
    expect(refreshOnSettled).toHaveBeenLastCalledWith('done');
  });

  it('passes null while no request is followed', () => {
    render(<InboxApplyButton />);
    expect(refreshOnSettled).toHaveBeenLastCalledWith(null);
  });

  it('also refreshes on the answered count, for a run it never saw a request for', () => {
    queueState.data = 3;
    const view = render(<InboxApplyButton />);
    expect(refreshOnQueueChange).toHaveBeenLastCalledWith(3);
    view.unmount();

    queueState.data = undefined;
    render(<InboxApplyButton />);
    expect(refreshOnQueueChange).toHaveBeenLastCalledWith(null);
  });
});
