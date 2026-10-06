/**
 * The stream on the screen (Phase 21, tasks 4 and 16; P-87).
 *
 * `use-workspace-stream.test.tsx` holds the hook; this sibling mounts the
 * route's screen over the same fake client and reads what the page shows:
 *
 *   * one delta with seq 1, sent for a queued request, renders under its
 *     question (task 5's spike read exactly that off a deployed page);
 *   * a stream joined late shows only "Answering…";
 *   * a delta is text, never markup;
 *   * a delta for a request the page does not follow is ignored;
 *   * with no `?c=`, or one that is not a uuid, the page holds the lobby
 *     channel and reads no conversation;
 *   * a conversation that cannot be read says so and keeps its channel;
 *   * THE END OF A STREAM comes from the `done` broadcast and from a refetch
 *     when the tab regains focus, never from the 5 s interval alone: the spike
 *     showed the interval does not run in a hidden tab;
 *   * a gap: text past a missing seq is never shown, and at `done` the stored
 *     row takes over;
 *   * nothing from the cache renders on the server, and server HTML hydrates
 *     under a restored cache without a hydration error.
 *
 * The stream area is `[data-workspace-stream]`; it carries `data-topic`,
 * `data-channel` and, while a request is open, `data-request-id`.
 */

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateOverServerHtml, newQueryClient, warmQueryCache } from './hydration-harness';
import { fake, joined, openTopics, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const { LOBBY_TOPIC } = await import('@/lib/use-workspace-stream');
const labels = await import('@/lib/workspace-labels');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';
const TOPIC_A = `workspace:${A}`;
const REQUEST = 42;

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <Workspace />
    </QueryClientProvider>
  );
}

function streamArea(container: HTMLElement): HTMLElement {
  const area = container.querySelector('[data-workspace-stream]');
  if (!(area instanceof HTMLElement)) throw new Error('no stream area on the page');
  return area;
}

/** The live or stored text of the one answer on the page, or null when there is none. */
function answerText(container: HTMLElement): string | null {
  return streamArea(container).querySelector('[data-answer-text]')?.textContent ?? null;
}

function lineUnderQuestion(container: HTMLElement): string | null {
  return streamArea(container).querySelector('[data-turn-line]')?.textContent ?? null;
}

const QUESTION_ROW: Row = {
  id: QUESTION,
  conversation_id: A,
  role: 'user',
  content: 'spike',
  finished: true,
};

function requestRow(state: string, fields: Row = {}): Row {
  return { id: REQUEST, conversation_id: A, user_message_id: QUESTION, state, ...fields };
}

function storedAnswer(content: string, fields: Row = {}): Row {
  return {
    id: ANSWER,
    conversation_id: A,
    role: 'assistant',
    request_id: REQUEST,
    tier: 'low',
    content,
    finished: true,
    ...fields,
  };
}

/** A conversation with one question and its request in `state`. */
function seed(state: string): void {
  fake.state.search = `c=${A}`;
  fake.state.rows = {
    workspace_messages: [QUESTION_ROW],
    workspace_requests: [requestRow(state)],
  };
}

/** The screen once it follows the open request and has joined its channel. */
async function following(client: QueryClient = newQueryClient()) {
  const view = render(tree(client));
  const channel = await joined(TOPIC_A);
  await waitFor(() =>
    expect(streamArea(view.container)).toHaveAttribute('data-request-id', String(REQUEST)),
  );
  return { ...view, channel };
}

beforeEach(() => {
  resetFake();
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  document.body.innerHTML = '';
});

describe('the route: /workspace?c= shows streamed text', () => {
  it('shows one delta with seq 1, sent for the queued request, under its question', async () => {
    seed('queued');
    const { container, channel } = await following();
    expect(streamArea(container)).toHaveAttribute('data-topic', TOPIC_A);
    expect(answerText(container)).toBeNull();
    expect(lineUnderQuestion(container)).toBe('Waiting for the Workspace service');

    act(() => channel.status('SUBSCRIBED'));
    expect(streamArea(container)).toHaveAttribute('data-channel', 'joined');

    // The spike's one send: realtime.send(jsonb_build_object('request_id', …, 'seq', 1, 'delta', 'spike-ok 1'), …).
    act(() =>
      channel.emit('delta', { id: 'added-by-realtime', request_id: REQUEST, seq: 1, delta: 'spike-ok 1' }),
    );

    expect(answerText(container)).toBe('spike-ok 1');
    expect(lineUnderQuestion(container)).toBeNull();
    expect(openTopics()).toEqual([TOPIC_A]);
    expect(channel.params).toEqual({ config: { private: true } });
  });

  it('shows the delta of a request whose question row has not been read', async () => {
    fake.state.search = `c=${A}`;
    fake.state.rows = { workspace_requests: [requestRow('queued')] };
    const { container, channel } = await following();

    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'spike-ok 1' }));

    expect(answerText(container)).toBe('spike-ok 1');
  });

  it('shows only "Answering…" for a stream joined late', async () => {
    seed('claimed');
    const { container, channel } = await following();

    act(() => {
      channel.emit('delta', { request_id: REQUEST, seq: 5, delta: 'half an ' });
      channel.emit('delta', { request_id: REQUEST, seq: 6, delta: 'answer' });
    });

    expect(labels.LATE_STREAM_LINE).toBe('Answering…');
    expect(lineUnderQuestion(container)).toBe('Answering…');
    expect(answerText(container)).toBeNull();
  });

  it('renders a delta as text, never as markup', async () => {
    seed('claimed');
    const { container, channel } = await following();

    act(() =>
      channel.emit('delta', { request_id: REQUEST, seq: 1, delta: '<script>alert(1)</script>' }),
    );

    expect(answerText(container)).toBe('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  it('ignores a delta for a request that is not the conversation`s open one', async () => {
    seed('queued');
    const { container, channel } = await following();

    act(() => channel.emit('delta', { request_id: 43, seq: 1, delta: 'not this one' }));

    expect(answerText(container)).toBeNull();
    expect(container.textContent).not.toContain('not this one');
  });

  it.each([
    ['no ?c=', ''],
    ['a ?c= that is not a uuid', 'c=lobby'],
    ['an empty ?c=', 'c='],
  ])('holds the lobby channel with %s, and reads no conversation', async (_label, search) => {
    fake.state.search = search;
    const { container } = render(tree(newQueryClient()));
    await joined(LOBBY_TOPIC);

    expect(openTopics()).toEqual(['workspace:lobby']);
    expect(streamArea(container)).toHaveAttribute('data-topic', 'workspace:lobby');
    expect(streamArea(container)).not.toHaveAttribute('data-request-id');
    expect(fake.state.log).not.toContain('from:workspace_messages');
    expect(fake.state.log).not.toContain('from:workspace_requests');
  });

  it('follows no request once the newest answer is stored: a late delta changes nothing', async () => {
    fake.state.search = `c=${A}`;
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW, storedAnswer('The stored answer.')],
      workspace_requests: [requestRow('done')],
    };
    const { container } = render(tree(newQueryClient()));
    const channel = await joined(TOPIC_A);
    await screen.findByText('The stored answer.');

    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'stale' }));

    expect(streamArea(container)).not.toHaveAttribute('data-request-id');
    expect(answerText(container)).toBe('The stored answer.');
  });

  it('says so when the conversation cannot be read, and still holds its channel', async () => {
    fake.state.search = `c=${A}`;
    fake.state.readErrors = { workspace_requests: { code: 'PGRST205', message: 'no such table' } };
    const { container, findByRole } = render(tree(newQueryClient()));
    await joined(TOPIC_A);

    const alert = await findByRole('alert');

    expect(alert).toHaveTextContent('Could not load this conversation: no such table');
    expect(streamArea(container)).not.toHaveAttribute('data-request-id');
    expect(openTopics()).toEqual([TOPIC_A]);
  });

  it('shows no problem line while the read is fine', async () => {
    seed('queued');
    const { queryByRole } = await following();

    expect(queryByRole('alert')).toBeNull();
  });
});

describe('the end of a stream: the done broadcast and a refetch on focus, never the interval alone', () => {
  /** A client that does not refetch on focus unless a query asks to: the screen must ask. */
  function quietClient(): QueryClient {
    return new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
  }

  it('takes the stored row at the done broadcast, in a hidden tab', async () => {
    focusManager.setFocused(false);
    seed('claimed');
    const { container, channel } = await following(quietClient());
    act(() => {
      channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'The syllabus ' });
      channel.emit('delta', { request_id: REQUEST, seq: 2, delta: 'says' });
    });
    expect(answerText(container)).toBe('The syllabus says');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    // workspace_finish(): the row is written, then the done broadcast is sent.
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW, storedAnswer('The syllabus says late work loses 10%.')],
      workspace_requests: [requestRow('done')],
    };
    act(() => channel.emit('done', { request_id: REQUEST, message_id: ANSWER, state: 'done' }));

    await waitFor(() => expect(answerText(container)).toBe('The syllabus says late work loses 10%.'));
    expect(streamArea(container)).not.toHaveAttribute('data-request-id');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(container.querySelector('[data-tier]')).toHaveTextContent('Haiku · lookup');
  });

  /** Move the fake clock, letting every timer and promise in between run. */
  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('shows a queued request that turned cancelled with no broadcast, when the tab regains focus', async () => {
    vi.useFakeTimers();
    focusManager.setFocused(false);
    seed('queued');
    const { container } = render(tree(quietClient()));
    await advance(100);
    expect(lineUnderQuestion(container)).toBe('Waiting for the Workspace service');

    // Cancelled in the database, as task 5's cancel was. No runner had claimed it, so
    // workspace_finish() never runs and no done broadcast is ever sent.
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW],
      workspace_requests: [requestRow('cancelled', { error_code: 'cancelled' })],
    };

    // Three intervals pass in the background and the page has not moved (what the spike saw).
    await advance(15_000);
    expect(lineUnderQuestion(container)).toBe('Waiting for the Workspace service');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    // The tab regains focus: well inside one interval, the page reads the row.
    act(() => focusManager.setFocused(true));
    await advance(100);

    expect(lineUnderQuestion(container)).toBe('You stopped this answer.');
    expect(streamArea(container)).not.toHaveAttribute('data-request-id');
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('does not re-read an open request on the interval while the tab is hidden, and does on focus', async () => {
    vi.useFakeTimers();
    const reads = () => fake.state.log.filter((entry) => entry === 'from:workspace_requests').length;
    focusManager.setFocused(false);
    seed('queued');
    const { container } = render(tree(quietClient()));
    await advance(100);
    expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST));
    const before = reads();

    // Three intervals pass in the background: nothing is read (what the spike saw).
    await advance(15_000);
    expect(reads()).toBe(before);

    act(() => focusManager.setFocused(true));
    await advance(100);
    expect(reads()).toBe(before + 1);

    // In the foreground the interval is the fallback for a missed broadcast.
    await advance(5_000);
    expect(reads()).toBe(before + 2);
  });

  it('never shows text past a missing seq, and lets the stored row take over at done', async () => {
    seed('claimed');
    const { container, channel } = await following();
    act(() => {
      channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'a' });
      channel.emit('delta', { request_id: REQUEST, seq: 2, delta: 'b' });
      channel.emit('delta', { request_id: REQUEST, seq: 4, delta: 'd' });
    });
    expect(answerText(container)).toBe('ab');

    fake.state.rows = {
      workspace_messages: [QUESTION_ROW, storedAnswer('abcd')],
      workspace_requests: [requestRow('done')],
    };
    act(() => channel.emit('done', { request_id: REQUEST, message_id: ANSWER, state: 'done' }));

    // Between done and the stored row the page still holds "ab", never "abd".
    expect(answerText(container)).toBe('ab');
    await waitFor(() => expect(answerText(container)).toBe('abcd'));
  });
});

describe('the route on the server, and hydrating', () => {
  it('renders nothing from the cache on the server', () => {
    seed('queued');
    const html = renderToString(tree(newQueryClient()));

    expect(html).toContain('data-workspace-stream');
    expect(html).not.toContain('data-request-id');
    expect(html).not.toContain('spike');
    expect(html).toContain(labels.ASK_LABEL);
  });

  it('hydrates server HTML under a restored cache without a hydration error', async () => {
    seed('queued');
    fake.state.rows = {
      ...fake.state.rows,
      workspace_conversations: [{ id: A, title: 'spike', archived: false, updated_at: null }],
      v_workspace_status: [{ polled_at: null, runner: null, open_requests: 1 }],
    };
    // What the persisted cache holds when the screen's Suspense boundary hydrates.
    const warm = await warmQueryCache(tree, (container) => {
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST));
      expect(container.textContent).toContain(labels.OFFLINE_LINE);
    });

    const hydrated = await hydrateOverServerHtml(tree(newQueryClient()), tree(warm));
    try {
      await waitFor(() =>
        expect(streamArea(hydrated.container)).toHaveAttribute('data-request-id', String(REQUEST)),
      );
      expect(hydrated.recoverable).not.toHaveBeenCalled();
    } finally {
      hydrated.unmount();
    }
  });
});
