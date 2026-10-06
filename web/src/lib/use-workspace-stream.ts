'use client';

/**
 * bb2dash — the Workspace's live stream (Phase 21, task 4; P-87).
 *
 * An answer arrives twice: live, as Realtime Broadcast events on the private
 * topic `workspace:<conversation uuid>`, and once more as the stored row that
 * `workspace_finish()` writes. The stored row is the record; this hook is only
 * the live half, and losing any part of it costs live text, never the answer.
 *
 * THE WIRE (brief 102, "Realtime"). Two events, which the page only receives:
 *   `delta`  `{request_id, seq, delta}`   `seq` starts at 1 and rises by 1 per flush
 *   `done`   `{request_id, message_id, state}`
 * `realtime.send` adds an `id` key to every payload. The named keys are read
 * and every other key is ignored.
 *
 * THE RULE ON THE PAGE.
 *   * Deltas render only as a contiguous run from seq 1.
 *   * If the lowest seq received is not 1 (a reload, a page opened mid-answer,
 *     a cold Realtime start) no partial text renders: `late` is true and the
 *     screen shows the one late-stream line until the stored row replaces it.
 *   * A gap holds later text back until the missing seq arrives. Text past a
 *     gap is never shown, `done` or not.
 *   * A repeated seq is dropped. Another request's deltas are never rendered.
 *   * `done` invalidates the conversation's messages (and its requests).
 *
 * ONE CHANNEL. To keep Realtime warm the page always holds exactly one private
 * channel: the conversation's when `?c=` is a uuid, else `workspace:lobby`. The
 * old channel is left before the next one is joined.
 *
 * NO STATE IS SET IN AN EFFECT BODY. Every event carries the topic it arrived
 * on, and the view is derived against the topic the page is on now, so moving
 * to another conversation shows nothing of the last one without a reset effect.
 */

import { useEffect, useReducer, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { asRecord } from './json-record';
import {
  invalidateWorkspaceConversation,
  parseConversationId,
  toRequestId,
} from './queries.workspace';
import { getSupabaseBrowserClient, type SupabaseBrowserClient } from './supabase/client';

/* ---------------------------------------------------------------------------
 * Topics
 * ------------------------------------------------------------------------ */

/** Every Workspace topic starts with this; migration 141's policy matches `workspace:%`. */
const TOPIC_PREFIX = 'workspace:';

/** The topic the page holds when no conversation is selected. */
export const LOBBY_TOPIC = `${TOPIC_PREFIX}lobby`;

/** The one topic for a conversation, or the lobby when the id is not a uuid. */
export function workspaceTopic(conversationId: string | null): string {
  const id = parseConversationId(conversationId);
  return id === null ? LOBBY_TOPIC : `${TOPIC_PREFIX}${id}`;
}

/* ---------------------------------------------------------------------------
 * The wire (pure)
 * ------------------------------------------------------------------------ */

/** The runner's first flush. A stream that does not start here is joined late. */
const FIRST_SEQ = 1;

const EVENT_DELTA = 'delta';
const EVENT_DONE = 'done';

/** The status supabase-js reports once a channel is joined. */
const CHANNEL_SUBSCRIBED = 'SUBSCRIBED';

export interface StreamDelta {
  requestId: number;
  seq: number;
  delta: string;
}

export interface StreamDone {
  requestId: number;
}

/**
 * One `delta` payload, or null when it cannot be read. `request_id` goes
 * through `toRequestId`, the same reading the request rows get, so the two are
 * compared as numbers. Unknown keys, the added `id` among them, are ignored.
 */
export function parseDelta(payload: unknown): StreamDelta | null {
  const raw = asRecord(payload);
  const requestId = toRequestId(raw?.request_id);
  const seq = raw?.seq;
  const delta = raw?.delta;
  if (requestId === null) return null;
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < FIRST_SEQ) return null;
  if (typeof delta !== 'string') return null;
  return { requestId, seq, delta };
}

/** One `done` payload, read by its request id alone; null when it has none. */
export function parseDone(payload: unknown): StreamDone | null {
  const requestId = toRequestId(asRecord(payload)?.request_id);
  return requestId === null ? null : { requestId };
}

/* ---------------------------------------------------------------------------
 * State (pure)
 * ------------------------------------------------------------------------ */

/** Where the page's one channel stands. `error` covers a refused, timed-out or closed join. */
export type ChannelStatus = 'joining' | 'joined' | 'error';

/** What has arrived for one request: its deltas by seq, and whether `done` came. */
interface RequestStream {
  readonly deltas: ReadonlyMap<number, string>;
  readonly done: boolean;
}

export interface StreamState {
  /** The topic these events arrived on. Events from another topic start again. */
  readonly topic: string;
  readonly channel: ChannelStatus;
  /** Why the channel is in `error`, in the client's own words; null otherwise. */
  readonly channelDetail: string | null;
  /** Per request id, so a delta that beats the page's own read of the request is kept. */
  readonly streams: ReadonlyMap<number, RequestStream>;
}

export type StreamEvent =
  | { type: 'channel'; topic: string; status: ChannelStatus; detail: string | null }
  | { type: 'delta'; topic: string; requestId: number; seq: number; delta: string }
  | { type: 'done'; topic: string; requestId: number };

/**
 * How many requests' deltas are kept per topic. A conversation has one open
 * request at a time, so the newest is the one that matters; the bound only
 * keeps a long sitting in one conversation from holding every answer twice.
 */
const STREAM_BUFFERED_REQUESTS = 3;

const NO_STREAM: RequestStream = { deltas: new Map(), done: false };

export function initialStreamState(topic: string): StreamState {
  return { topic, channel: 'joining', channelDetail: null, streams: new Map() };
}

/** `state` with one request's stream replaced, the oldest requests dropped past the bound. */
function withStream(state: StreamState, requestId: number, stream: RequestStream): StreamState {
  const streams = new Map(state.streams);
  streams.set(requestId, stream);
  while (streams.size > STREAM_BUFFERED_REQUESTS) {
    streams.delete(Math.min(...streams.keys()));
  }
  return { ...state, streams };
}

export function streamReducer(state: StreamState, event: StreamEvent): StreamState {
  const current = state.topic === event.topic ? state : initialStreamState(event.topic);

  switch (event.type) {
    case 'channel': {
      if (current.channel === event.status && current.channelDetail === event.detail) {
        return current;
      }
      return { ...current, channel: event.status, channelDetail: event.detail };
    }
    case 'delta': {
      const stream = current.streams.get(event.requestId) ?? NO_STREAM;
      // A repeated seq is dropped: the first text stays.
      if (stream.deltas.has(event.seq)) return current;
      const deltas = new Map(stream.deltas);
      deltas.set(event.seq, event.delta);
      return withStream(current, event.requestId, { ...stream, deltas });
    }
    case 'done': {
      const stream = current.streams.get(event.requestId) ?? NO_STREAM;
      if (stream.done) return current;
      return withStream(current, event.requestId, { ...stream, done: true });
    }
    default: {
      const never: never = event;
      throw new Error(`unknown stream event ${JSON.stringify(never)}`);
    }
  }
}

/** What the screen reads: the channel, and the followed request's live text. */
export interface WorkspaceStreamView {
  topic: string;
  channel: ChannelStatus;
  channelDetail: string | null;
  /** The contiguous run from seq 1, joined. Empty when nothing arrived, or when `late`. */
  text: string;
  /** Deltas arrived and the lowest is not seq 1: show the late-stream line, never the text. */
  late: boolean;
  /** `done` arrived for the followed request; the stored row is on its way. */
  done: boolean;
}

/**
 * The view for the topic the page is on and the request it follows. State from
 * another topic reads as nothing, and so does a request nobody follows.
 */
export function streamView(
  state: StreamState,
  topic: string,
  requestId: number | null,
): WorkspaceStreamView {
  const current = state.topic === topic ? state : initialStreamState(topic);
  const channel = { topic, channel: current.channel, channelDetail: current.channelDetail };
  const stream = requestId === null ? undefined : current.streams.get(requestId);

  if (stream === undefined) return { ...channel, text: '', late: false, done: false };
  if (stream.deltas.size === 0) return { ...channel, text: '', late: false, done: stream.done };
  if (!stream.deltas.has(FIRST_SEQ)) return { ...channel, text: '', late: true, done: stream.done };

  let text = '';
  for (let seq = FIRST_SEQ; stream.deltas.has(seq); seq += 1) {
    text += stream.deltas.get(seq) ?? '';
  }
  return { ...channel, text, late: false, done: stream.done };
}

/* ---------------------------------------------------------------------------
 * The hook
 * ------------------------------------------------------------------------ */

const NOTHING_LEAVING: Promise<void> = Promise.resolve();

/** What supabase-js answers a leave with when the server confirmed it. */
const LEAVE_OK = 'ok';

/** A failed join in words: the status, and the client's reason when it gave one. */
function describeFailure(status: string, error: Error | undefined): string {
  return error?.message ? `${status}: ${error.message}` : status;
}

/** One stay on a topic: where its events go, what `done` moves, and whether the page has left. */
interface Stay {
  readonly topic: string;
  readonly dispatch: (event: StreamEvent) => void;
  readonly onDone: () => void;
  readonly left: () => boolean;
}

/** The channel event for a status supabase-js reports: joined, or an error with its reason. */
function channelEvent(topic: string, status: string, error: Error | undefined): StreamEvent {
  if (status === CHANNEL_SUBSCRIBED) {
    return { type: 'channel', topic, status: 'joined', detail: null };
  }
  return { type: 'channel', topic, status: 'error', detail: describeFailure(status, error) };
}

/**
 * Open the topic's private channel and wire its two events and its status to
 * the reducer. Nothing is acted on once the page has left the topic: a
 * broadcast can still be on its way to a channel that is being closed.
 */
function openChannel(supabase: SupabaseBrowserClient, stay: Stay): RealtimeChannel {
  const { topic, dispatch } = stay;
  return supabase
    .channel(topic, { config: { private: true } })
    .on('broadcast', { event: EVENT_DELTA }, (message) => {
      if (stay.left()) return;
      const delta = parseDelta(message.payload);
      if (delta !== null) dispatch({ type: 'delta', topic, ...delta });
    })
    .on('broadcast', { event: EVENT_DONE }, (message) => {
      if (stay.left()) return;
      const done = parseDone(message.payload);
      if (done === null) return;
      dispatch({ type: 'done', topic, requestId: done.requestId });
      stay.onDone();
    })
    .subscribe((status, error) => {
      if (stay.left()) return;
      dispatch(channelEvent(topic, String(status), error));
    });
}

/**
 * Join the stay's topic once the last channel has left, so the page never
 * holds two. `opened` is called in the same tick the channel is opened: the
 * caller's cleanup must be able to leave it from that moment on.
 */
async function joinAfter(
  leaving: Promise<void>,
  supabase: SupabaseBrowserClient,
  stay: Stay,
  opened: (channel: RealtimeChannel) => void,
): Promise<void> {
  await leaving;
  if (stay.left()) return;
  // The last channel is gone and this one has not answered. Said here, after the wait,
  // so a return to the topic just left does not keep reading "joined".
  stay.dispatch({ type: 'channel', topic: stay.topic, status: 'joining', detail: null });
  // A private channel is authorised by the owner's token (141's policy), and the join
  // payload carries the token only once the socket has it.
  await supabase.realtime.setAuth();
  if (stay.left()) return;
  opened(openChannel(supabase, stay));
}

/**
 * Leave a channel. It is finished with whatever the leave answers, so the next
 * join never waits on a failure; but a failure is logged, never swallowed.
 * supabase-js resolves a leave to `ok`, `timed out` or `error`, and can reject.
 */
function leaveChannel(
  supabase: SupabaseBrowserClient,
  topic: string,
  channel: RealtimeChannel,
): Promise<void> {
  return supabase.removeChannel(channel).then(
    (answer) => {
      if (answer !== LEAVE_OK) console.error(`workspace: leaving ${topic} answered "${answer}"`);
    },
    (error: unknown) => {
      console.error(`workspace: could not leave ${topic}`, error);
    },
  );
}

/**
 * Hold the page's one private channel and read the followed request's stream.
 *
 * `conversationId` is `?c=` once parsed (null for the lobby); `requestId` is
 * the conversation's open request, or null when there is none. Changing only
 * `requestId` never reopens the channel.
 */
export function useWorkspaceStream(
  conversationId: string | null,
  requestId: number | null,
): WorkspaceStreamView {
  const id = parseConversationId(conversationId);
  const topic = workspaceTopic(id);
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(streamReducer, topic, initialStreamState);
  /** The last channel's leave. The next join waits on it, so the page never holds two. */
  const leaving = useRef<Promise<void>>(NOTHING_LEAVING);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let left = false;
    let channel: RealtimeChannel | null = null;
    const stay: Stay = {
      topic,
      dispatch,
      onDone: () => invalidateWorkspaceConversation(queryClient, id),
      left: () => left,
    };

    // A join that fails is not fatal: the stored rows are polled while a request is open.
    // It is recorded, so the screen can tell a quiet channel from a missing one.
    joinAfter(leaving.current, supabase, stay, (opened) => {
      channel = opened;
    }).catch((error: unknown) => {
      if (left) return;
      const detail = error instanceof Error ? error.message : String(error);
      dispatch({ type: 'channel', topic, status: 'error', detail });
    });

    return () => {
      left = true;
      if (channel === null) return;
      leaving.current = leaveChannel(supabase, topic, channel);
    };
  }, [topic, id, queryClient]);

  return streamView(state, topic, toRequestId(requestId));
}
