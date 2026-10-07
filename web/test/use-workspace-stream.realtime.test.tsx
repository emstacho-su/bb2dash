/**
 * The stream hook over the real supabase-js Realtime client (Phase 21, task 4;
 * P-87; ruling T2).
 *
 * `use-workspace-stream.test.tsx` drives the hook through a fake client, which
 * cannot show a wrong reading of supabase-js itself. Here the client is the
 * real `@supabase/supabase-js`, and only its transport is replaced: a fake
 * WebSocket that records every frame the client sends and answers the joins
 * and leaves the way the Realtime server does. What it shows:
 *
 *   * the join frame carries `private: true` and a token, which is what
 *     `setAuth` before `channel` is for;
 *   * a pushed `broadcast` frame reaches the page as text;
 *   * moving between conversations sends join, leave, join, in that order;
 *   * three moves with no wait leave one channel and join one;
 *   * a leave reads as ok at once, whether or not the server answers it.
 *
 * It does not prove the server side (141's policy, the partition, the
 * replication slot): task 5's spike did.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { wrapperFor } from './workspace-harness';

const wire = vi.hoisted(() => {
  /** One frame of protocol 2.0.0: `[join_ref, ref, topic, event, payload]`. */
  type Frame = [string | null, string | null, string, string, Record<string, unknown>];

  const SOCKET_OPEN = 1;
  const SOCKET_CLOSED = 3;

  const state = {
    sockets: [] as FakeSocket[],
    /** Every frame the client sent, in order, heartbeats left out. */
    sent: [] as Frame[],
    /** When false, a `phx_leave` gets no reply: the leave times out. */
    answerLeaves: true,
  };

  class FakeSocket {
    readyState = 0;
    binaryType = '';
    onopen: (() => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;

    constructor(readonly url: string) {
      state.sockets.push(this);
      setTimeout(() => {
        this.readyState = SOCKET_OPEN;
        this.onopen?.();
      }, 0);
    }

    /** What the client sends: recorded, and a join, a leave or a heartbeat is answered. */
    send(data: string): void {
      const frame = JSON.parse(data) as Frame;
      const [joinRef, ref, topic, event] = frame;
      if (event !== 'heartbeat') state.sent.push(frame);
      if (event === 'phx_leave' && !state.answerLeaves) return;
      if (event === 'phx_join' || event === 'phx_leave' || event === 'heartbeat') {
        this.receive([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]);
      }
    }

    /** A frame from the server. */
    receive(frame: Frame): void {
      setTimeout(() => this.onmessage?.({ data: JSON.stringify(frame) }), 0);
    }

    close(): void {
      this.readyState = SOCKET_CLOSED;
      this.onclose?.({ code: 1000, reason: '', wasClean: true });
    }
  }

  return { state, FakeSocket };
});

/** How long the client waits on a join or a leave before it gives up, in this file. */
const CLIENT_TIMEOUT_MS = 2_000;

vi.mock('@/lib/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient('http://127.0.0.1:54321', 'placeholder-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: wire.FakeSocket as unknown as typeof WebSocket,
      timeout: CLIENT_TIMEOUT_MS,
    },
  });
  return { getSupabaseBrowserClient: () => client };
});

const { useWorkspaceStream } = await import('@/lib/use-workspace-stream');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const B = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const REQUEST = 42;

/** The topic as the client names it on the wire. */
function wireTopic(conversationId: string | null): string {
  return `realtime:workspace:${conversationId ?? 'lobby'}`;
}

/** The frames the client sent, as `event topic`. */
function sentEvents(): string[] {
  return wire.state.sent.map(([, , topic, event]) => `${event} ${topic}`);
}

function mount(conversationId: string | null) {
  return renderHook(
    (props: { conversationId: string | null }) =>
      useWorkspaceStream(props.conversationId, REQUEST),
    { wrapper: wrapperFor(newQueryClient()), initialProps: { conversationId } },
  );
}

beforeEach(() => {
  wire.state.sent = [];
  wire.state.answerLeaves = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWorkspaceStream over the real supabase-js Realtime client', () => {
  it('joins the conversation`s topic as private, with a token in the join', async () => {
    const { result, unmount } = mount(A);
    await waitFor(() => expect(result.current.channel).toBe('joined'));

    const [join] = wire.state.sent;
    expect(join[2]).toBe(wireTopic(A));
    expect(join[3]).toBe('phx_join');
    expect(join[4]).toMatchObject({ config: { private: true }, access_token: 'placeholder-key' });

    unmount();
    await waitFor(() => expect(sentEvents()).toContain(`phx_leave ${wireTopic(A)}`));
  });

  it('renders a pushed broadcast frame as text, and ignores the id key the server adds', async () => {
    const { result, unmount } = mount(A);
    await waitFor(() => expect(result.current.channel).toBe('joined'));

    act(() => {
      wire.state.sockets.at(-1)?.receive([
        null,
        null,
        wireTopic(A),
        'broadcast',
        {
          type: 'broadcast',
          event: 'delta',
          payload: { id: 'added-by-realtime', request_id: REQUEST, seq: 1, delta: 'spike-ok 1' },
        },
      ]);
    });

    await waitFor(() => expect(result.current.text).toBe('spike-ok 1'));
    unmount();
    await waitFor(() => expect(sentEvents()).toContain(`phx_leave ${wireTopic(A)}`));
  });

  it('moves between conversations as join, leave, join', async () => {
    const { result, rerender, unmount } = mount(A);
    await waitFor(() => expect(result.current.channel).toBe('joined'));

    rerender({ conversationId: B });
    await waitFor(() => expect(result.current).toMatchObject({ channel: 'joined' }));
    await waitFor(() => expect(sentEvents()).toContain(`phx_join ${wireTopic(B)}`));

    expect(sentEvents()).toEqual([
      `phx_join ${wireTopic(A)}`,
      `phx_leave ${wireTopic(A)}`,
      `phx_join ${wireTopic(B)}`,
    ]);
    unmount();
    await waitFor(() => expect(sentEvents()).toContain(`phx_leave ${wireTopic(B)}`));
  });

  it('leaves one channel and joins one across three moves made with no wait', async () => {
    const { result, rerender, unmount } = mount(A);
    await waitFor(() => expect(result.current.channel).toBe('joined'));
    wire.state.sent = [];

    rerender({ conversationId: null });
    rerender({ conversationId: B });
    rerender({ conversationId: A });
    await waitFor(() => expect(sentEvents()).toContain(`phx_join ${wireTopic(A)}`));
    await waitFor(() => expect(result.current.channel).toBe('joined'));

    // Nothing was sent for the two topics passed through.
    expect(sentEvents()).toEqual([`phx_leave ${wireTopic(A)}`, `phx_join ${wireTopic(A)}`]);
    unmount();
    await waitFor(() => expect(sentEvents().at(-1)).toBe(`phx_leave ${wireTopic(A)}`));
  });

  /**
   * What this client does with a leave, read here so the hook's logging is not
   * built on a guess. `removeChannel` is typed to answer 'ok', 'timed out' or
   * 'error', but on supabase-js 2.116.0 the channel is already `leaving` when
   * the leave is pushed, so the client confirms it to itself at once: the
   * answer is 'ok' whether or not the server replies. The hook still logs any
   * other answer and a rejection (`use-workspace-stream.test.tsx`), which a
   * later client can give.
   */
  it('reads a leave as ok at once, even when the server never answers it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result, rerender, unmount } = mount(A);
    await waitFor(() => expect(result.current.channel).toBe('joined'));
    wire.state.answerLeaves = false;
    const moved = Date.now();

    rerender({ conversationId: B });
    await waitFor(() => expect(sentEvents()).toContain(`phx_join ${wireTopic(B)}`));

    // The next join did not wait out the client's timeout, and nothing was logged.
    expect(Date.now() - moved).toBeLessThan(CLIENT_TIMEOUT_MS);
    expect(logged).not.toHaveBeenCalled();
    expect(sentEvents()).toEqual([
      `phx_join ${wireTopic(A)}`,
      `phx_leave ${wireTopic(A)}`,
      `phx_join ${wireTopic(B)}`,
    ]);

    wire.state.answerLeaves = true;
    unmount();
    await waitFor(() => expect(sentEvents().at(-1)).toBe(`phx_leave ${wireTopic(B)}`));
  });
});
