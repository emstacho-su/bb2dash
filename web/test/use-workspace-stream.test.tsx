/**
 * The Workspace's live stream (Phase 21, task 4; P-87).
 *
 * The transport is a private Realtime Broadcast topic, `workspace:<conversation
 * uuid>`, with two events the page only receives: `delta` `{request_id, seq,
 * delta}` and `done` `{request_id, message_id, state}`. What is asserted here is
 * brief 102's rule for the stream on the page:
 *
 *   * the channel is opened with `private: true`, and only after `setAuth`;
 *   * the page always holds exactly one private channel, `workspace:<uuid>`
 *     when `?c=` is a uuid, else `workspace:lobby`;
 *   * deltas render only as a contiguous run from seq 1: 3, 1, 2 renders in
 *     order, and a gap holds later text back until the missing seq arrives;
 *   * a stream whose lowest received seq is not 1 renders no partial text, only
 *     the line "Answering…";
 *   * a repeated seq is dropped, another `request_id` is ignored, and the extra
 *     `id` key `realtime.send` adds, like any other unknown key, is ignored;
 *   * `done` invalidates the messages key;
 *   * the channel is left on unmount.
 *
 * Its siblings: `use-workspace-stream.screen.test.tsx` mounts the screen over
 * the same fake, and `use-workspace-stream.realtime.test.tsx` runs the hook
 * over the real supabase-js Realtime client.
 *
 * The Supabase browser client is the fake in `workspace-harness.tsx`, which
 * records every call in order.
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, gate, joined, openTopics, resetFake, settle, wrapperFor } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);

const {
  LOBBY_TOPIC,
  initialStreamState,
  parseDelta,
  parseDone,
  streamReducer,
  streamView,
  useWorkspaceStream,
  workspaceTopic,
} = await import('@/lib/use-workspace-stream');
const { workspaceKeys } = await import('@/lib/queries.workspace');

type StreamEvent = Parameters<typeof streamReducer>[1];
/** `Omit` applied to each member of the union, so every event keeps its own keys. */
type WithoutTopic<T> = T extends unknown ? Omit<T, 'topic'> : never;

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const B = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const USER_MESSAGE = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const TOPIC_A = `workspace:${A}`;
const TOPIC_B = `workspace:${B}`;
const REQUEST = 42;

/** Fold wire events into a state the way the hook's reducer does. */
function fold(topic: string, events: readonly WithoutTopic<StreamEvent>[]) {
  return events.reduce(
    (state, event) => streamReducer(state, { ...event, topic }),
    initialStreamState(topic),
  );
}

function delta(seq: number, text: string, requestId = REQUEST) {
  return { type: 'delta' as const, requestId, seq, delta: text };
}

beforeEach(() => {
  resetFake();
});

describe('workspaceTopic: one private topic per conversation, the lobby otherwise', () => {
  it('names the conversation`s topic, and the lobby when there is none', () => {
    expect(workspaceTopic(A)).toBe(TOPIC_A);
    expect(workspaceTopic(null)).toBe('workspace:lobby');
    expect(LOBBY_TOPIC).toBe('workspace:lobby');
  });
});

describe('parseDelta and parseDone: the named keys, and nothing else', () => {
  it('reads request_id, seq and delta', () => {
    expect(parseDelta({ request_id: 42, seq: 1, delta: 'spike-ok 1' })).toEqual({
      requestId: 42,
      seq: 1,
      delta: 'spike-ok 1',
    });
  });

  it('ignores the id key realtime.send adds, and any other unknown key', () => {
    expect(
      parseDelta({
        id: '5f0c7b1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b',
        request_id: 42,
        seq: 2,
        delta: 'b',
        replayed: false,
        meta: { anything: true },
      }),
    ).toEqual({ requestId: 42, seq: 2, delta: 'b' });
  });

  it('reads a request id sent as digits as the same number', () => {
    expect(parseDelta({ request_id: '42', seq: 1, delta: 'a' })?.requestId).toBe(42);
    expect(parseDone({ request_id: '42' })?.requestId).toBe(42);
  });

  it.each([
    ['no payload', undefined],
    ['a string', 'delta'],
    ['an array', [42, 1, 'a']],
    ['no request id', { seq: 1, delta: 'a' }],
    ['a request id that is not a number', { request_id: 'abc', seq: 1, delta: 'a' }],
    ['seq 0', { request_id: 42, seq: 0, delta: 'a' }],
    ['a fractional seq', { request_id: 42, seq: 1.5, delta: 'a' }],
    ['a seq sent as text', { request_id: 42, seq: '1', delta: 'a' }],
    ['no delta', { request_id: 42, seq: 1 }],
    ['a delta that is not text', { request_id: 42, seq: 1, delta: { html: '<b>x</b>' } }],
  ])('drops a delta with %s', (_label, payload) => {
    expect(parseDelta(payload)).toBeNull();
  });

  it('reads done by its request id, whatever else it carries', () => {
    expect(
      parseDone({ request_id: 42, message_id: USER_MESSAGE, state: 'done', id: 'x', more: 1 }),
    ).toEqual({ requestId: 42 });
    expect(parseDone({ message_id: USER_MESSAGE, state: 'done' })).toBeNull();
    expect(parseDone(null)).toBeNull();
  });
});

describe('the stream rule: a contiguous run from seq 1', () => {
  it('renders seq 3, 1, 2 in order', () => {
    const first = fold(TOPIC_A, [delta(3, 'c')]);
    expect(streamView(first, TOPIC_A, REQUEST)).toMatchObject({ text: '', late: true });

    const second = streamReducer(first, { ...delta(1, 'a'), topic: TOPIC_A });
    expect(streamView(second, TOPIC_A, REQUEST)).toMatchObject({ text: 'a', late: false });

    const third = streamReducer(second, { ...delta(2, 'b'), topic: TOPIC_A });
    expect(streamView(third, TOPIC_A, REQUEST)).toMatchObject({ text: 'abc', late: false });
  });

  it('holds later text back behind a gap until the missing seq arrives', () => {
    const gapped = fold(TOPIC_A, [delta(1, 'a'), delta(2, 'b'), delta(4, 'd'), delta(5, 'e')]);
    expect(streamView(gapped, TOPIC_A, REQUEST).text).toBe('ab');

    const filled = streamReducer(gapped, { ...delta(3, 'c'), topic: TOPIC_A });
    expect(streamView(filled, TOPIC_A, REQUEST).text).toBe('abcde');
  });

  it('never shows text past a gap, done or not: the stored row replaces the stream', () => {
    const ended = fold(TOPIC_A, [
      delta(1, 'a'),
      delta(2, 'b'),
      delta(4, 'd'),
      { type: 'done', requestId: REQUEST },
    ]);
    expect(streamView(ended, TOPIC_A, REQUEST)).toMatchObject({ text: 'ab', late: false, done: true });
  });

  it('shows no partial text when the lowest seq received is not 1', () => {
    const late = fold(TOPIC_A, [delta(7, 'g'), delta(8, 'h'), delta(9, 'i')]);
    expect(streamView(late, TOPIC_A, REQUEST)).toMatchObject({ text: '', late: true, done: false });

    const ended = streamReducer(late, { type: 'done', topic: TOPIC_A, requestId: REQUEST });
    expect(streamView(ended, TOPIC_A, REQUEST)).toMatchObject({ text: '', late: true, done: true });
  });

  it('drops a repeated seq: the first text stays', () => {
    const repeated = fold(TOPIC_A, [delta(1, 'a'), delta(1, 'X'), delta(2, 'b'), delta(2, 'Y')]);
    expect(streamView(repeated, TOPIC_A, REQUEST).text).toBe('ab');
  });

  it('returns the same state for a repeat, so nothing re-renders', () => {
    const once = fold(TOPIC_A, [delta(1, 'a')]);
    expect(streamReducer(once, { ...delta(1, 'a'), topic: TOPIC_A })).toBe(once);
  });

  it('ignores another request id', () => {
    const mixed = fold(TOPIC_A, [delta(1, 'a'), delta(1, 'zzz', 43), delta(2, 'b'), delta(2, 'yyy', 43)]);
    expect(streamView(mixed, TOPIC_A, REQUEST).text).toBe('ab');
    expect(streamView(mixed, TOPIC_A, 41)).toMatchObject({ text: '', late: false, done: false });
  });

  it('renders nothing while no request is followed', () => {
    const state = fold(TOPIC_A, [delta(1, 'a')]);
    expect(streamView(state, TOPIC_A, null)).toMatchObject({ text: '', late: false, done: false });
  });

  it('is not late, and not done, before anything arrived', () => {
    expect(streamView(initialStreamState(TOPIC_A), TOPIC_A, REQUEST)).toEqual({
      topic: TOPIC_A,
      channel: 'joining',
      channelDetail: null,
      text: '',
      late: false,
      done: false,
    });
  });

  it('marks only its own request done', () => {
    const state = fold(TOPIC_A, [delta(1, 'a'), { type: 'done', requestId: 43 }]);
    expect(streamView(state, TOPIC_A, REQUEST).done).toBe(false);
    expect(streamView(state, TOPIC_A, 43).done).toBe(true);
  });

  it('starts again on another topic: one conversation`s text never shows in the next', () => {
    const onA = fold(TOPIC_A, [{ type: 'channel', status: 'joined', detail: null }, delta(1, 'a')]);
    // The page moved to B before B's first event: A's state reads as nothing for B.
    expect(streamView(onA, TOPIC_B, REQUEST)).toMatchObject({ channel: 'joining', text: '' });

    const onB = streamReducer(onA, { ...delta(1, 'b'), topic: TOPIC_B });
    expect(streamView(onB, TOPIC_B, REQUEST).text).toBe('b');
    expect(streamView(onB, TOPIC_A, REQUEST).text).toBe('');
  });

  it('keeps the newest few requests only, so one long conversation stays bounded', () => {
    const many = fold(
      TOPIC_A,
      [1, 2, 3, 4, 5, 6].map((requestId) => delta(1, `r${requestId}`, requestId)),
    );
    expect(streamView(many, TOPIC_A, 6).text).toBe('r6');
    expect(streamView(many, TOPIC_A, 1).text).toBe('');
  });

  it('carries the channel status and its detail', () => {
    const state = fold(TOPIC_A, [
      { type: 'channel', status: 'error', detail: 'CHANNEL_ERROR: Unauthorized' },
    ]);
    expect(streamView(state, TOPIC_A, null)).toMatchObject({
      channel: 'error',
      channelDetail: 'CHANNEL_ERROR: Unauthorized',
    });
  });
});

describe('useWorkspaceStream: the one private channel', () => {
  function mount(conversationId: string | null, requestId: number | null = REQUEST) {
    const client = newQueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const hook = renderHook(
      (props: { conversationId: string | null; requestId: number | null }) =>
        useWorkspaceStream(props.conversationId, props.requestId),
      { wrapper: wrapperFor(client), initialProps: { conversationId, requestId } },
    );
    return { ...hook, invalidate };
  }

  it('signs the socket in, then opens the conversation`s channel as private', async () => {
    mount(A);
    const channel = await joined(TOPIC_A);

    expect(fake.state.log).toEqual(['setAuth', `channel:${TOPIC_A}`, `subscribe:${TOPIC_A}`]);
    expect(channel.params).toEqual({ config: { private: true } });
    expect([...channel.handlers.keys()].sort()).toEqual(['broadcast:delta', 'broadcast:done']);
  });

  it('holds the lobby when no conversation is selected', async () => {
    mount(null, null);
    const channel = await joined(LOBBY_TOPIC);

    expect(channel.params).toEqual({ config: { private: true } });
    expect(openTopics()).toEqual(['workspace:lobby']);
  });

  it('opens no channel when the socket cannot be signed in, and says so', async () => {
    fake.state.authError = new Error('no session');
    const { result } = mount(A);

    await waitFor(() => expect(result.current.channel).toBe('error'));
    expect(result.current.channelDetail).toBe('no session');
    expect(fake.state.channels).toEqual([]);
  });

  it('reports joining, then joined, then an error with its reason', async () => {
    const { result } = mount(A);
    const channel = await joined(TOPIC_A);
    expect(result.current).toMatchObject({ topic: TOPIC_A, channel: 'joining' });

    act(() => channel.status('SUBSCRIBED'));
    expect(result.current.channel).toBe('joined');

    act(() => channel.status('CHANNEL_ERROR', new Error('Unauthorized')));
    expect(result.current).toMatchObject({
      channel: 'error',
      channelDetail: 'CHANNEL_ERROR: Unauthorized',
    });

    act(() => channel.status('TIMED_OUT'));
    expect(result.current).toMatchObject({ channel: 'error', channelDetail: 'TIMED_OUT' });

    act(() => channel.status('SUBSCRIBED'));
    expect(result.current).toMatchObject({ channel: 'joined', channelDetail: null });
  });

  it('renders seq 3, 1, 2 in order as they arrive', async () => {
    const { result } = mount(A);
    const channel = await joined(TOPIC_A);

    act(() => channel.emit('delta', { request_id: REQUEST, seq: 3, delta: ' three' }));
    expect(result.current).toMatchObject({ text: '', late: true });

    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'one' }));
    expect(result.current).toMatchObject({ text: 'one', late: false });

    act(() => channel.emit('delta', { request_id: REQUEST, seq: 2, delta: ' two' }));
    expect(result.current.text).toBe('one two three');
  });

  it('ignores the extra id key, a repeated seq and another request`s deltas', async () => {
    const { result } = mount(A);
    const channel = await joined(TOPIC_A);

    act(() => {
      channel.emit('delta', { id: 'added-by-realtime', request_id: REQUEST, seq: 1, delta: 'a' });
      channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'AGAIN' });
      channel.emit('delta', { request_id: 43, seq: 1, delta: 'other' });
      channel.emit('delta', { request_id: String(REQUEST), seq: 2, delta: 'b', unknown: [1] });
      channel.emit('delta', { request_id: REQUEST, seq: 'three', delta: 'bad' });
    });

    expect(result.current.text).toBe('ab');
  });

  it('follows the request it is given: none, then the open one', async () => {
    const { result, rerender } = mount(A, null);
    const channel = await joined(TOPIC_A);

    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'early' }));
    expect(result.current.text).toBe('');

    // The page learns the open request a moment after the first delta: nothing is lost.
    rerender({ conversationId: A, requestId: REQUEST });
    expect(result.current.text).toBe('early');
    expect(fake.state.channels).toHaveLength(1);
  });

  it('invalidates the messages key on done, and the requests with it', async () => {
    const { result, invalidate } = mount(A);
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'a' }));
    expect(invalidate).not.toHaveBeenCalled();

    act(() =>
      channel.emit('done', { request_id: REQUEST, message_id: USER_MESSAGE, state: 'done', id: 'x' }),
    );

    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(workspaceKeys.messages(A));
    expect(keys).toContainEqual(workspaceKeys.requests(A));
    expect(result.current).toMatchObject({ text: 'a', done: true });
  });

  it('does nothing on a done it cannot read', async () => {
    const { invalidate } = mount(A);
    const channel = await joined(TOPIC_A);

    act(() => channel.emit('done', { state: 'done' }));

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('leaves the channel on unmount, and hears nothing afterwards', async () => {
    const { result, unmount, invalidate } = mount(A);
    const channel = await joined(TOPIC_A);
    act(() => channel.emit('delta', { request_id: REQUEST, seq: 1, delta: 'a' }));
    const before = result.current;

    unmount();
    await waitFor(() => expect(openTopics()).toEqual([]));
    expect(fake.state.log.at(-1)).toBe(`remove:${TOPIC_A}`);

    // A broadcast already on its way to a channel the page has left is not acted on.
    channel.emit('delta', { request_id: REQUEST, seq: 2, delta: 'b' });
    channel.emit('done', { request_id: REQUEST });
    channel.status('CLOSED');
    expect(result.current).toBe(before);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('opens no channel when it is unmounted at once', async () => {
    const { unmount } = mount(A);
    unmount();

    await settle();
    expect(fake.state.channels).toEqual([]);
  });

  it('opens no channel when it is unmounted while the socket is being signed in', async () => {
    const signingIn = gate();
    fake.state.authGate = signingIn.promise;
    const { unmount } = mount(A);
    await waitFor(() => expect(fake.state.log).toContain('setAuth'));

    unmount();
    signingIn.release();

    await settle();
    expect(fake.state.channels).toEqual([]);
    expect(fake.state.log).toEqual(['setAuth']);
  });

  it('holds exactly one channel: the old one is left before the next is joined', async () => {
    const { result, rerender } = mount(A);
    const first = await joined(TOPIC_A);
    act(() => first.emit('delta', { request_id: REQUEST, seq: 1, delta: 'from A' }));
    expect(result.current.text).toBe('from A');

    const { promise, release } = gate();
    fake.state.leaveGate = promise;
    rerender({ conversationId: B, requestId: REQUEST });

    // A is still leaving: B is not joined yet, and A's text is already gone.
    await waitFor(() => expect(fake.state.log).toContain(`remove:${TOPIC_A}`));
    expect(fake.state.log).not.toContain(`channel:${TOPIC_B}`);
    expect(result.current).toMatchObject({ topic: TOPIC_B, channel: 'joining', text: '' });

    release();
    const second = await joined(TOPIC_B);
    expect(openTopics()).toEqual([TOPIC_B]);
    expect(fake.state.maxOpen).toBe(1);
    expect(fake.state.log.indexOf(`remove:${TOPIC_A}`)).toBeLessThan(
      fake.state.log.indexOf(`channel:${TOPIC_B}`),
    );

    act(() => second.emit('delta', { request_id: REQUEST, seq: 1, delta: 'from B' }));
    expect(result.current.text).toBe('from B');
  });

  it('logs a leave that fails, and still joins the next channel', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { rerender } = mount(A);
      await joined(TOPIC_A);
      const failure = new Error('socket closed');
      fake.state.leaveError = failure;

      rerender({ conversationId: B, requestId: REQUEST });
      await joined(TOPIC_B);

      // The old channel is finished with either way, but the failure is said, never swallowed.
      expect(logged).toHaveBeenCalledTimes(1);
      expect(String(logged.mock.calls[0][0])).toContain(TOPIC_A);
      expect(logged.mock.calls[0][1]).toBe(failure);
      expect(openTopics()).toEqual([TOPIC_B]);
    } finally {
      logged.mockRestore();
    }
  });

  it('moves between a conversation and the lobby, one channel at a time', async () => {
    const { rerender } = mount(A);
    await joined(TOPIC_A);

    rerender({ conversationId: null, requestId: null });
    await joined(LOBBY_TOPIC);
    expect(openTopics()).toEqual([LOBBY_TOPIC]);

    rerender({ conversationId: A, requestId: REQUEST });
    await waitFor(() => expect(openTopics()).toEqual([TOPIC_A]));
    expect(fake.state.maxOpen).toBe(1);
    expect(fake.state.channels.map((channel) => channel.topic)).toEqual([
      TOPIC_A,
      LOBBY_TOPIC,
      TOPIC_A,
    ]);
  });

  it('says joining again while it rejoins the topic it just left', async () => {
    const { result, rerender } = mount(A);
    const first = await joined(TOPIC_A);
    act(() => first.status('SUBSCRIBED'));
    expect(result.current.channel).toBe('joined');

    // Away and back before the lobby's join even starts: the state never saw another topic.
    rerender({ conversationId: null, requestId: null });
    rerender({ conversationId: A, requestId: REQUEST });
    await waitFor(() => expect(fake.state.channels).toHaveLength(2));
    await settle();

    // The first channel is gone and the second has not answered: this is not "joined".
    expect(fake.state.channels.map((channel) => channel.topic)).toEqual([TOPIC_A, TOPIC_A]);
    expect(result.current).toMatchObject({ topic: TOPIC_A, channel: 'joining' });

    act(() => fake.state.channels[1].status('SUBSCRIBED'));
    expect(result.current.channel).toBe('joined');
  });

  it('does not reopen the channel when only the followed request changes', async () => {
    const { rerender } = mount(A, 41);
    await joined(TOPIC_A);

    rerender({ conversationId: A, requestId: REQUEST });
    rerender({ conversationId: A, requestId: null });
    await settle();

    expect(fake.state.channels).toHaveLength(1);
    expect(fake.state.log.filter((entry) => entry.startsWith('remove:'))).toEqual([]);
  });
});
