/**
 * The Workspace test scaffold (Phase 21), shared by every suite that mounts the
 * stream hook or the screen.
 *
 * It is a fake Supabase browser client that records every call in order and
 * stands in for the four things the Workspace talks to:
 *
 *   * the tables and the view: `from(table)` reads `fake.state.rows[table]`,
 *     applies `.eq()` filters, and `.update()` writes back, so a list can lose
 *     a row a test archived;
 *   * the two RPCs: `workspace_ask` and `workspace_cancel` change the seeded
 *     rows the way migration 140's functions do (a question, its queued
 *     request, the 23505 refusal; an open request turned `cancelled`). A test
 *     can replace either through `fake.state.rpc`;
 *   * Realtime: `realtime.setAuth()`, `channel()` and `removeChannel()`, with a
 *     `FakeChannel` a test drives by hand (`emit`, `status`);
 *   * the router: `?c=` is `fake.state.search`, and `replace` / `push` set it.
 *
 * `vi.mock` calls stay in each test file (vitest hoists them per file). Each
 * one imports this module inside its factory, so the file and its mocks share
 * the one `fake`:
 *
 *   vi.mock('@/lib/supabase/client', async () =>
 *     (await import('./workspace-harness')).supabaseClientMock());
 *   vi.mock('next/navigation', async () =>
 *     (await import('./workspace-harness')).navigationMock());
 */

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, vi } from 'vitest';

type Handler = (message: unknown) => void;
type StatusCallback = (status: string, error?: Error) => void;
export type Row = Record<string, unknown>;

/** What a PostgREST call resolves to. */
export interface Answer {
  data: unknown;
  error: unknown;
}

export class FakeChannel {
  readonly handlers = new Map<string, Handler>();
  statusCallback: StatusCallback | null = null;

  constructor(
    readonly topic: string,
    readonly params: unknown,
  ) {}

  on(type: string, filter: { event: string }, handler: Handler): this {
    this.handlers.set(`${type}:${filter.event}`, handler);
    return this;
  }

  subscribe(callback: StatusCallback): this {
    state.log.push(`subscribe:${this.topic}`);
    this.statusCallback = callback;
    return this;
  }

  /** Deliver one broadcast the way supabase-js hands it to a handler. */
  emit(event: string, payload: unknown): void {
    this.handlers.get(`broadcast:${event}`)?.({ type: 'broadcast', event, payload });
  }

  status(status: string, error?: Error): void {
    this.statusCallback?.(status, error);
  }
}

/** The ids `workspace_ask` hands out, in order, when a test does not replace it. */
export const NEW_CONVERSATION = '9d3b1c70-4a2e-4f6b-8c1d-5e7f90a1b2c3';
const NEW_MESSAGES = [
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
];
/** The first request id `workspace_ask` hands out. */
export const NEW_REQUEST = 900;

const OPEN_STATES = ['queued', 'claimed'];

function freshState() {
  return {
    /** Every client call, in order. */
    log: [] as string[],
    channels: [] as FakeChannel[],
    /** Channels opened and not yet left. */
    open: new Set<FakeChannel>(),
    /** The most channels ever open at once. */
    maxOpen: 0,
    authError: null as Error | null,
    /** When set, `setAuth` waits on it: the socket is still being signed in. */
    authGate: null as Promise<void> | null,
    /** When set, a leave waits on it: the old channel is still leaving. */
    leaveGate: null as Promise<void> | null,
    /** When set, a leave fails with it. */
    leaveError: null as Error | null,
    /** What a leave answers with: supabase-js resolves to 'ok', 'timed out' or 'error'. */
    leaveAnswer: 'ok',
    /** The page's query string. */
    search: '',
    rows: {} as Record<string, Row[]>,
    /** Per table: every read of it answers with this error. */
    readErrors: {} as Record<string, { code: string; message: string }>,
    /** Per table: every `.update()` of it answers with this error; its reads still work. */
    writeErrors: {} as Record<string, { code: string; message: string }>,
    /** Per function: what replaces the built-in answer. */
    rpc: {} as Record<string, (args: Row) => Answer | Promise<Answer>>,
    /** When set, every RPC waits on it before it answers. */
    rpcGate: null as Promise<void> | null,
    rpcCalls: [] as { fn: string; args: Row }[],
    asked: 0,
    router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  };
}

let state = freshState();

/** One object for the whole file: `fake.state` is replaced by `resetFake()`. */
export const fake = {
  get state() {
    return state;
  },
  FakeChannel,
};

/** The query string of a path the screen navigated to. */
function searchOf(path: string): string {
  const mark = path.indexOf('?');
  return mark === -1 ? '' : path.slice(mark + 1);
}

/** A clean fake: call it in `beforeEach`. */
export function resetFake(): void {
  state = freshState();
  state.router.replace.mockImplementation((path: string) => {
    state.search = searchOf(path);
  });
  state.router.push.mockImplementation((path: string) => {
    state.search = searchOf(path);
  });
}

resetFake();

/* ---------------------------------------------------------------------------
 * Tables
 * ------------------------------------------------------------------------ */

function tableChain(table: string): Record<string, unknown> {
  const filters: [string, unknown][] = [];
  let patch: Row | null = null;
  const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);

  const settle = (): Answer => {
    const error = state.readErrors[table];
    if (error) return { data: null, error };
    const rows = state.rows[table] ?? [];
    if (patch === null) return { data: rows.filter(matches).map((row) => ({ ...row })), error: null };
    const refused = state.writeErrors[table];
    if (refused) return { data: null, error: refused };
    const change = patch;
    state.rows = { ...state.rows, [table]: rows.map((row) => (matches(row) ? { ...row, ...change } : row)) };
    return { data: null, error: null };
  };

  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    order: self,
    update: (values: Row) => {
      state.log.push(`update:${table}`);
      patch = values;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return chain;
    },
    maybeSingle: async (): Promise<Answer> => {
      const answer = settle();
      if (answer.error) return answer;
      return { data: (answer.data as Row[])[0] ?? null, error: null };
    },
    then: (onFulfilled: (value: Answer) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(settle()).then(onFulfilled, onRejected),
  });
  return chain;
}

/* ---------------------------------------------------------------------------
 * The two RPCs, as migration 140 writes them
 * ------------------------------------------------------------------------ */

function rowsOf(table: string): Row[] {
  return state.rows[table] ?? [];
}

function askAnswer(args: Row): Answer {
  const given = args.p_conversation_id;
  const conversationId = typeof given === 'string' ? given : NEW_CONVERSATION;
  const open = rowsOf('workspace_requests').some(
    (row) => row.conversation_id === conversationId && OPEN_STATES.includes(String(row.state)),
  );
  if (open) return { data: null, error: { code: '23505', message: 'duplicate key value' } };

  const messageId = NEW_MESSAGES[state.asked % NEW_MESSAGES.length];
  const requestId = NEW_REQUEST + state.asked;
  state.asked += 1;
  const conversations =
    given === null
      ? [
          ...rowsOf('workspace_conversations'),
          { id: conversationId, title: String(args.p_text), archived: false, updated_at: null },
        ]
      : rowsOf('workspace_conversations');
  state.rows = {
    ...state.rows,
    workspace_conversations: conversations,
    workspace_messages: [
      ...rowsOf('workspace_messages'),
      { id: messageId, conversation_id: conversationId, role: 'user', content: args.p_text, finished: true },
    ],
    workspace_requests: [
      ...rowsOf('workspace_requests'),
      { id: requestId, conversation_id: conversationId, user_message_id: messageId, state: 'queued' },
    ],
  };
  return {
    data: { conversation_id: conversationId, message_id: messageId, request_id: requestId },
    error: null,
  };
}

function cancelAnswer(args: Row): Answer {
  const requests = rowsOf('workspace_requests');
  const target = requests.find(
    (row) => row.id === args.p_request_id && OPEN_STATES.includes(String(row.state)),
  );
  if (!target) return { data: false, error: null };
  state.rows = {
    ...state.rows,
    workspace_requests: requests.map((row) =>
      row === target ? { ...row, state: 'cancelled', error_code: 'cancelled' } : row,
    ),
  };
  return { data: true, error: null };
}

const BUILT_IN_RPC: Record<string, (args: Row) => Answer> = {
  workspace_ask: askAnswer,
  workspace_cancel: cancelAnswer,
};

async function callRpc(fn: string, args: Row): Promise<Answer> {
  state.log.push(`rpc:${fn}`);
  state.rpcCalls.push({ fn, args });
  if (state.rpcGate) await state.rpcGate;
  const answer = state.rpc[fn] ?? BUILT_IN_RPC[fn];
  if (!answer) return { data: null, error: { code: 'PGRST202', message: `no function ${fn}` } };
  return answer(args);
}

/* ---------------------------------------------------------------------------
 * The two module mocks
 * ------------------------------------------------------------------------ */

function fakeClient() {
  return {
    from: (table: string) => {
      state.log.push(`from:${table}`);
      return tableChain(table);
    },
    rpc: callRpc,
    realtime: {
      setAuth: async () => {
        state.log.push('setAuth');
        if (state.authGate) await state.authGate;
        if (state.authError) throw state.authError;
      },
    },
    channel: (topic: string, params: unknown) => {
      state.log.push(`channel:${topic}`);
      const channel = new FakeChannel(topic, params);
      state.channels.push(channel);
      state.open.add(channel);
      state.maxOpen = Math.max(state.maxOpen, state.open.size);
      return channel;
    },
    removeChannel: async (channel: FakeChannel) => {
      state.log.push(`remove:${channel.topic}`);
      if (state.leaveGate) await state.leaveGate;
      state.open.delete(channel);
      if (state.leaveError) throw state.leaveError;
      return state.leaveAnswer;
    },
  };
}

/** The module `@/lib/supabase/client` is replaced with. */
export function supabaseClientMock() {
  return { getSupabaseBrowserClient: fakeClient };
}

/** The module `next/navigation` is replaced with. */
export function navigationMock() {
  return {
    useSearchParams: () => new URLSearchParams(state.search),
    usePathname: () => '/workspace',
    useRouter: () => state.router,
  };
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------ */

export function openTopics(): string[] {
  return [...state.open].map((channel) => channel.topic);
}

/** The channel the page holds on `topic`, once it has been opened and subscribed. */
export async function joined(topic: string): Promise<FakeChannel> {
  await waitFor(() => expect(state.log).toContain(`subscribe:${topic}`));
  const channel = state.channels.findLast((candidate) => candidate.topic === topic);
  if (!channel) throw new Error(`no channel on ${topic}`);
  return channel;
}

export function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A promise a test settles by hand, to hold the fake client mid-call. */
export function gate(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Let every pending promise callback and zero-delay timer run. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
