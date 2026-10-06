/**
 * The stream on the screen (Phase 21, tasks 4 and 16; P-87).
 *
 * `use-workspace-stream.test.tsx` holds the hook; this sibling mounts the
 * route's screen over the same fake client and reads what the page shows:
 *
 *   * one delta with seq 1, sent for a queued request, renders in the stream
 *     area (task 5's spike read exactly that off a deployed page);
 *   * a stream joined late shows only "Answering…";
 *   * a delta is text, never markup;
 *   * a delta for a request that is not the conversation's open one is ignored;
 *   * with no `?c=`, or one that is not a uuid, the page holds the lobby
 *     channel and reads no conversation;
 *   * a conversation that cannot be read says so and keeps its channel;
 *   * nothing from the cache renders on the server, and server HTML hydrates
 *     under a restored cache without a hydration error.
 */

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateOverServerHtml, newQueryClient, warmQueryCache } from './hydration-harness';
import { fake, joined, openTopics, resetFake } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const { LOBBY_TOPIC } = await import('@/lib/use-workspace-stream');
const { LATE_STREAM_LINE } = await import('@/lib/workspace-labels');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const USER_MESSAGE = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const TOPIC_A = `workspace:${A}`;
const REQUEST = 42;

beforeEach(() => {
  resetFake();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the route skeleton: /workspace?c= shows streamed text', () => {
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

  function seedQueuedRequest() {
    fake.state.search = `c=${A}`;
    fake.state.rows = {
      workspace_requests: [
        { id: REQUEST, conversation_id: A, user_message_id: USER_MESSAGE, state: 'queued' },
      ],
    };
  }

  it('shows one delta with seq 1, sent for the queued request, in the stream area', async () => {
    seedQueuedRequest();
    const { container } = render(tree(newQueryClient()));
    const channel = await joined(TOPIC_A);
    await waitFor(() =>
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST)),
    );
    expect(streamArea(container)).toHaveAttribute('data-topic', TOPIC_A);
    expect(streamArea(container).textContent).toBe('');

    act(() => channel.status('SUBSCRIBED'));
    expect(streamArea(container)).toHaveAttribute('data-channel', 'joined');

    // The spike's one send: realtime.send(jsonb_build_object('request_id', …, 'seq', 1, 'delta', 'spike-ok 1'), …).
    act(() =>
      channel.emit('delta', { id: 'added-by-realtime', request_id: REQUEST, seq: 1, delta: 'spike-ok 1' }),
    );

    expect(streamArea(container)).toHaveTextContent('spike-ok 1');
    expect(openTopics()).toEqual([TOPIC_A]);
    expect(channel.params).toEqual({ config: { private: true } });
  });

  it('shows only "Answering…" for a stream joined late', async () => {
    seedQueuedRequest();
    const { container } = render(tree(newQueryClient()));
    const channel = await joined(TOPIC_A);
    await waitFor(() =>
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST)),
    );

    act(() => {
      channel.emit('delta', { request_id: REQUEST, seq: 5, delta: 'half an ' });
      channel.emit('delta', { request_id: REQUEST, seq: 6, delta: 'answer' });
    });

    expect(LATE_STREAM_LINE).toBe('Answering…');
    expect(streamArea(container).textContent).toBe('Answering…');
  });

  it('renders a delta as text, never as markup', async () => {
    seedQueuedRequest();
    const { container } = render(tree(newQueryClient()));
    const channel = await joined(TOPIC_A);
    await waitFor(() =>
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST)),
    );

    act(() =>
      channel.emit('delta', { request_id: REQUEST, seq: 1, delta: '<script>alert(1)</script>' }),
    );

    expect(streamArea(container).textContent).toBe('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });

  it('ignores a delta for a request that is not the conversation`s open one', async () => {
    seedQueuedRequest();
    const { container } = render(tree(newQueryClient()));
    const channel = await joined(TOPIC_A);
    await waitFor(() =>
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST)),
    );

    act(() => channel.emit('delta', { request_id: 43, seq: 1, delta: 'not this one' }));

    expect(streamArea(container).textContent).toBe('');
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
    expect(fake.state.log.filter((entry) => entry.startsWith('from:'))).toEqual([]);
  });

  it('follows no request when the conversation has none open', async () => {
    fake.state.search = `c=${A}`;
    fake.state.rows = {
      workspace_requests: [
        { id: 41, conversation_id: A, user_message_id: USER_MESSAGE, state: 'done' },
      ],
    };
    const { container } = render(tree(newQueryClient()));
    const channel = await joined(TOPIC_A);
    await waitFor(() => expect(fake.state.log).toContain('from:workspace_requests'));

    act(() => channel.emit('delta', { request_id: 41, seq: 1, delta: 'stale' }));

    expect(streamArea(container)).not.toHaveAttribute('data-request-id');
    expect(streamArea(container).textContent).toBe('');
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
    seedQueuedRequest();
    const { container, queryByRole } = render(tree(newQueryClient()));
    await joined(TOPIC_A);
    await waitFor(() =>
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST)),
    );

    expect(queryByRole('alert')).toBeNull();
  });

  it('renders nothing from the cache on the server', () => {
    seedQueuedRequest();
    const html = renderToString(tree(newQueryClient()));

    expect(html).toContain('data-workspace-stream');
    expect(html).not.toContain('data-request-id');
  });

  it('hydrates server HTML under a restored cache without a hydration error', async () => {
    seedQueuedRequest();
    // What the persisted cache holds when the screen's Suspense boundary hydrates.
    const warm = await warmQueryCache(tree, (container) =>
      expect(streamArea(container)).toHaveAttribute('data-request-id', String(REQUEST)),
    );

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
