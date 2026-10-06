/**
 * The Workspace query layer (Phase 21, task 15; P-86).
 *
 * What is asserted is the contract the screen stands on, read from brief 102:
 *
 *   * a question is trimmed and refused, empty or over 8000 characters, before
 *     any request leaves the page, and the two refusals the database can still
 *     raise (SQLSTATE 23505 and 22023) each map to their one frozen sentence;
 *   * `?c=` is a uuid or it is nothing;
 *   * every row that comes back is normalised by a pure function, so a column
 *     that is missing or misshapen degrades to a null, never to a crash;
 *   * the conversation list asks for `archived = false`, and for the archived
 *     ones only when they are asked for;
 *   * Stop is `workspace_cancel` with a number;
 *   * offline means a null heartbeat or one more than 120 s old;
 *   * the status query refetches every 30 s, the messages query every 5 s only
 *     while a request is open, and the three queries a reload must not trust
 *     from the restored cache set `staleTime: 0`.
 *
 * The Supabase browser client is a recording stub (the shape
 * `queries.sync.inboxApply.test.tsx` uses), so each request is asserted, and
 * nothing touches the network. The database objects are typed by hand from the
 * Contract: they are not on prod's generated types yet.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Call {
  target: string;
  op: string;
  args: unknown[];
}

const stub = vi.hoisted(() => ({
  calls: [] as Call[],
  /** What every terminal await resolves to. */
  result: { data: null as unknown, error: null as unknown },
}));

function builder(table: string) {
  const settle = async () => stub.result;
  const record =
    (op: string) =>
    (...args: unknown[]) => {
      stub.calls.push({ target: table, op, args });
      return chain;
    };
  const chain: Record<string, unknown> = {
    select: record('select'),
    update: record('update'),
    eq: record('eq'),
    order: record('order'),
    maybeSingle: (...args: unknown[]) => {
      stub.calls.push({ target: table, op: 'maybeSingle', args });
      return settle();
    },
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      settle().then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (table: string) => builder(table),
    rpc: (fn: string, args: unknown) => {
      stub.calls.push({ target: fn, op: 'rpc', args: [args] });
      return Promise.resolve(stub.result);
    },
  }),
}));

const {
  WORKSPACE_MESSAGES_REFETCH_MS,
  WORKSPACE_OFFLINE_AFTER_MS,
  WORKSPACE_PROMPT_MAX,
  WORKSPACE_STATUS_REFETCH_MS,
  WorkspaceRefusal,
  askWorkspace,
  cancelWorkspaceRequest,
  conversationsOptions,
  invalidateWorkspaceConversation,
  isWorkspaceOffline,
  messagesOptions,
  normalizeConversation,
  normalizeMessage,
  normalizeRequest,
  normalizeStatus,
  normalizeToolCalls,
  openRequestOf,
  parseConversationId,
  parseQuestion,
  requestsOptions,
  setConversationArchived,
  statusOptions,
  toRequestId,
  useAskWorkspace,
  useCancelWorkspaceRequest,
  useSetConversationArchived,
  useWorkspaceConversations,
  useWorkspaceMessages,
  useWorkspaceRequests,
  useWorkspaceStatus,
  workspaceKeys,
} = await import('@/lib/queries.workspace');
const { REFUSAL_QUESTION_LENGTH, REFUSAL_STILL_ANSWERING } = await import(
  '@/lib/workspace-labels'
);

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const MESSAGE = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const OTHER_MESSAGE = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const NOW = Date.parse('2026-10-05T16:00:00Z');

function callsOn(target: string): Call[] {
  return stub.calls.filter((call) => call.target === target);
}

function ops(target: string): string[] {
  return callsOn(target).map((call) => call.op);
}

/** Run a queryFn the way TanStack would, without a client. */
async function run<T>(options: { queryFn?: unknown }): Promise<T> {
  const queryFn = options.queryFn as (context: never) => Promise<T>;
  return queryFn({} as never);
}

/** A `refetchInterval` given as a function of the query, read for one cached value. */
function intervalFor(options: { refetchInterval?: unknown }, data: unknown): unknown {
  const interval = options.refetchInterval;
  return typeof interval === 'function' ? interval({ state: { data } }) : interval;
}

beforeEach(() => {
  stub.calls.length = 0;
  stub.result = { data: null, error: null };
});

describe('the two numbers the Contract freezes', () => {
  it('caps a question at 8000 characters and refetches the status every 30 s', () => {
    expect(WORKSPACE_PROMPT_MAX).toBe(8000);
    expect(WORKSPACE_STATUS_REFETCH_MS).toBe(30_000);
  });

  it('says the same cap in the question-length sentence', () => {
    expect(REFUSAL_QUESTION_LENGTH).toBe('Write a question of 1 to 8000 characters.');
    expect(REFUSAL_QUESTION_LENGTH).toContain(String(WORKSPACE_PROMPT_MAX));
    expect(REFUSAL_STILL_ANSWERING).toBe('This conversation is still answering.');
  });
});

describe('parseConversationId: ?c= must be a uuid', () => {
  it('accepts a uuid and hands it back in lower case, the form the topic is built from', () => {
    expect(parseConversationId(CONVERSATION)).toBe(CONVERSATION);
    expect(parseConversationId(CONVERSATION.toUpperCase())).toBe(CONVERSATION);
  });

  it.each([
    ['nothing', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['the lobby word', 'lobby'],
    ['a request id', '42'],
    ['a uuid with a tail', `${CONVERSATION}x`],
    ['a uuid with a space', ` ${CONVERSATION}`],
    ['a uuid in braces', `{${CONVERSATION}}`],
    ['a uuid without hyphens', CONVERSATION.replace(/-/g, '')],
    ['a number', 7],
    ['a filter fragment', `${CONVERSATION},archived.eq.true`],
  ])('reads %s as no conversation', (_label, value) => {
    expect(parseConversationId(value)).toBeNull();
  });
});

describe('toRequestId: one number on both sides of every comparison', () => {
  it('reads a positive integer, as a number or as digits', () => {
    expect(toRequestId(42)).toBe(42);
    expect(toRequestId('42')).toBe(42);
  });

  it.each([0, -1, 1.5, Number.NaN, '', '4 2', '1e3', '0x10', null, undefined, {}, true])(
    'reads %s as no request',
    (value) => {
      expect(toRequestId(value)).toBeNull();
    },
  );
});

describe('parseQuestion: 1 to 8000 characters after trimming', () => {
  it('trims the text', () => {
    expect(parseQuestion('  What is due this week?\n')).toBe('What is due this week?');
  });

  it.each([
    ['empty text', ''],
    ['only white space', ' \n\t '],
    ['8001 characters', 'a'.repeat(WORKSPACE_PROMPT_MAX + 1)],
    ['a value that is not text', 12],
  ])('refuses %s with the question-length sentence', (_label, value) => {
    let thrown: unknown;
    try {
      parseQuestion(value);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(WorkspaceRefusal);
    expect((thrown as Error).message).toBe(REFUSAL_QUESTION_LENGTH);
  });

  it('accepts exactly 8000 characters', () => {
    expect(parseQuestion('a'.repeat(WORKSPACE_PROMPT_MAX))).toHaveLength(WORKSPACE_PROMPT_MAX);
  });

  it('counts characters the way the database does, not UTF-16 units', () => {
    // One emoji is one character to char_length() and two units to `.length`.
    const emoji = '\u{1F4DA}';
    expect(() => parseQuestion(emoji.repeat(WORKSPACE_PROMPT_MAX))).not.toThrow();
    expect(() => parseQuestion(emoji.repeat(WORKSPACE_PROMPT_MAX + 1))).toThrow(WorkspaceRefusal);
  });
});

describe('askWorkspace: workspace_ask(p_conversation_id, p_text)', () => {
  it.each([
    ['an empty question', '   '],
    ['8001 characters', 'a'.repeat(WORKSPACE_PROMPT_MAX + 1)],
  ])('refuses %s before any request is sent', async (_label, text) => {
    await expect(askWorkspace({ conversationId: null, text })).rejects.toThrow(
      REFUSAL_QUESTION_LENGTH,
    );
    expect(stub.calls).toEqual([]);
  });

  it('refuses a conversation id that is not a uuid before any request is sent', async () => {
    await expect(askWorkspace({ conversationId: 'lobby', text: 'hello' })).rejects.toThrow(
      /conversation id/,
    );
    expect(stub.calls).toEqual([]);
  });

  it('sends the trimmed text, with null for a first question', async () => {
    stub.result = {
      data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: 42 },
      error: null,
    };

    const result = await askWorkspace({ conversationId: null, text: '  spike \n' });

    expect(stub.calls).toEqual([
      { target: 'workspace_ask', op: 'rpc', args: [{ p_conversation_id: null, p_text: 'spike' }] },
    ]);
    expect(result).toEqual({ conversationId: CONVERSATION, messageId: MESSAGE, requestId: 42 });
  });

  it('names the conversation for a follow-up, and reads a request id sent as digits', async () => {
    stub.result = {
      data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: '43' },
      error: null,
    };

    const result = await askWorkspace({ conversationId: CONVERSATION.toUpperCase(), text: 'and?' });

    expect(stub.calls[0].args).toEqual([{ p_conversation_id: CONVERSATION, p_text: 'and?' }]);
    expect(result.requestId).toBe(43);
  });

  it('maps SQLSTATE 23505 to the still-answering sentence', async () => {
    stub.result = {
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    };

    const failure = await askWorkspace({ conversationId: CONVERSATION, text: 'again' }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(WorkspaceRefusal);
    expect((failure as Error).message).toBe(REFUSAL_STILL_ANSWERING);
    expect((failure as InstanceType<typeof WorkspaceRefusal>).reason).toBe('still_answering');
  });

  it('maps SQLSTATE 22023 to the question-length sentence', async () => {
    stub.result = { data: null, error: { code: '22023', message: 'workspace_ask: text length' } };

    const failure = await askWorkspace({ conversationId: null, text: 'x' }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(WorkspaceRefusal);
    expect((failure as Error).message).toBe(REFUSAL_QUESTION_LENGTH);
    expect((failure as InstanceType<typeof WorkspaceRefusal>).reason).toBe('question_length');
  });

  it('throws any other database error as it came, never as a refusal', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stub.result = { data: null, error };

    const failure = await askWorkspace({ conversationId: null, text: 'x' }).catch(
      (thrown: unknown) => thrown,
    );

    expect(failure).toBe(error);
    expect(failure).not.toBeInstanceOf(WorkspaceRefusal);
  });

  it.each([
    ['nothing', null],
    ['no request id', { conversation_id: CONVERSATION, message_id: MESSAGE }],
    ['a conversation id that is not a uuid', { conversation_id: 'x', message_id: MESSAGE, request_id: 1 }],
    ['a message id that is not a uuid', { conversation_id: CONVERSATION, message_id: 5, request_id: 1 }],
  ])('throws when the function answers with %s', async (_label, data) => {
    stub.result = { data, error: null };
    await expect(askWorkspace({ conversationId: null, text: 'x' })).rejects.toThrow(
      /workspace_ask/,
    );
  });
});

describe('cancelWorkspaceRequest: workspace_cancel(p_request_id)', () => {
  it('sends the id as a number and reports whether a row changed', async () => {
    stub.result = { data: true, error: null };
    expect(await cancelWorkspaceRequest(42)).toBe(true);
    expect(stub.calls).toEqual([
      { target: 'workspace_cancel', op: 'rpc', args: [{ p_request_id: 42 }] },
    ]);

    stub.result = { data: false, error: null };
    expect(await cancelWorkspaceRequest(42)).toBe(false);
  });

  it.each([0, -3, 1.5, '42', null])('refuses %s before any request is sent', async (id) => {
    await expect(cancelWorkspaceRequest(id as number)).rejects.toThrow(/request id/);
    expect(stub.calls).toEqual([]);
  });

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stub.result = { data: null, error };
    await expect(cancelWorkspaceRequest(42)).rejects.toBe(error);
  });
});

describe('setConversationArchived: the one column the list writes', () => {
  it.each([true, false])('updates archived = %s on that conversation only', async (archived) => {
    await setConversationArchived({ conversationId: CONVERSATION, archived });

    expect(callsOn('workspace_conversations')).toEqual([
      { target: 'workspace_conversations', op: 'update', args: [{ archived }] },
      { target: 'workspace_conversations', op: 'eq', args: ['id', CONVERSATION] },
    ]);
  });

  it('refuses an id that is not a uuid, and a flag that is not a boolean, before any request', async () => {
    await expect(setConversationArchived({ conversationId: 'x', archived: true })).rejects.toThrow(
      /conversation id/,
    );
    await expect(
      setConversationArchived({ conversationId: CONVERSATION, archived: 'yes' as unknown as boolean }),
    ).rejects.toThrow(/archived/);
    expect(stub.calls).toEqual([]);
  });

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stub.result = { data: null, error };
    await expect(
      setConversationArchived({ conversationId: CONVERSATION, archived: true }),
    ).rejects.toBe(error);
  });
});

describe('rows are normalised by pure functions', () => {
  it('reads a conversation row', () => {
    expect(
      normalizeConversation({
        id: CONVERSATION,
        created_at: '2026-10-05T15:00:00+00:00',
        updated_at: '2026-10-05T15:05:00+00:00',
        title: 'spike',
        archived: false,
        claude_session_id: 'never-read',
      }),
    ).toEqual({
      id: CONVERSATION,
      created_at: '2026-10-05T15:00:00+00:00',
      updated_at: '2026-10-05T15:05:00+00:00',
      title: 'spike',
      archived: false,
    });
  });

  it('drops a conversation row with no uuid id, and reads a missing flag as not archived', () => {
    expect(normalizeConversation({ id: 'x', title: 't' })).toBeNull();
    expect(normalizeConversation(null)).toBeNull();
    expect(normalizeConversation([CONVERSATION])).toBeNull();
    expect(normalizeConversation({ id: CONVERSATION })).toEqual({
      id: CONVERSATION,
      created_at: null,
      updated_at: null,
      title: '',
      archived: false,
    });
  });

  it('reads an assistant message row', () => {
    expect(
      normalizeMessage({
        id: MESSAGE,
        conversation_id: CONVERSATION,
        role: 'assistant',
        request_id: 42,
        tier: 'low',
        content: 'The syllabus says…',
        tool_calls: [{ tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true }],
        finished: true,
        error_code: null,
        created_at: '2026-10-05T15:05:00+00:00',
        cost_usd: 0.0123,
      }),
    ).toEqual({
      id: MESSAGE,
      conversation_id: CONVERSATION,
      role: 'assistant',
      request_id: 42,
      tier: 'low',
      content: 'The syllabus says…',
      tool_calls: [{ tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true }],
      finished: true,
      error_code: null,
      created_at: '2026-10-05T15:05:00+00:00',
    });
  });

  it('degrades what it does not recognise on a message to null, and drops a row with no id or role', () => {
    expect(
      normalizeMessage({
        id: MESSAGE,
        conversation_id: CONVERSATION,
        role: 'user',
        request_id: 'abc',
        tier: 'ultra',
        content: 7,
        tool_calls: 'none',
        finished: 'yes',
        error_code: 'made_up',
      }),
    ).toEqual({
      id: MESSAGE,
      conversation_id: CONVERSATION,
      role: 'user',
      request_id: null,
      tier: null,
      content: '',
      tool_calls: [],
      finished: false,
      error_code: null,
      created_at: null,
    });
    expect(normalizeMessage({ id: MESSAGE, role: 'system' })).toBeNull();
    expect(normalizeMessage({ id: 'x', role: 'user' })).toBeNull();
    expect(normalizeMessage(undefined)).toBeNull();
  });

  it.each([
    'budget_exceeded',
    'timeout',
    'stale_claim',
    'provider_not_configured',
    'cli_error',
    'cancelled',
    'usage_limit',
    'sign_in_expired',
  ])('keeps the error code %s on a message and on a request', (code) => {
    expect(normalizeMessage({ id: MESSAGE, role: 'assistant', error_code: code })?.error_code).toBe(
      code,
    );
    expect(
      normalizeRequest({ id: 1, user_message_id: MESSAGE, state: 'failed', error_code: code })
        ?.error_code,
    ).toBe(code);
  });

  it('keeps only well-formed tool calls, in call order, and at most 20 of them', () => {
    expect(
      normalizeToolCalls([
        { tool: 'search_context', query: 'quiz 2', scope: 'bb2dash-inbox-decisions', ok: true },
        { tool: 'get_material_text', query: null, scope: '2489', ok: false, result: 'never kept' },
        { tool: 'list_courses' },
        { query: 'no tool name' },
        'search_materials',
        null,
        { tool: '', ok: true },
        { tool: 'search_materials', query: 5, scope: {}, ok: 'true' },
      ]),
    ).toEqual([
      { tool: 'search_context', query: 'quiz 2', scope: 'bb2dash-inbox-decisions', ok: true },
      { tool: 'get_material_text', query: null, scope: '2489', ok: false },
      { tool: 'list_courses', query: null, scope: null, ok: false },
      { tool: 'search_materials', query: null, scope: null, ok: false },
    ]);

    const many = Array.from({ length: 25 }, (_unused, index) => ({ tool: `t${index}`, ok: true }));
    const kept = normalizeToolCalls(many);
    expect(kept).toHaveLength(20);
    expect(kept[19].tool).toBe('t19');

    expect(normalizeToolCalls(null)).toEqual([]);
    expect(normalizeToolCalls({ tool: 'x' })).toEqual([]);
  });

  it('reads a request row, with its id as a number', () => {
    expect(
      normalizeRequest({
        id: '42',
        created_at: '2026-10-05T15:04:00+00:00',
        conversation_id: CONVERSATION,
        user_message_id: MESSAGE,
        state: 'claimed',
        claimed_at: '2026-10-05T15:04:02+00:00',
        finished_at: null,
        error_code: null,
        claimed_by: 'never-read',
      }),
    ).toEqual({
      id: 42,
      created_at: '2026-10-05T15:04:00+00:00',
      conversation_id: CONVERSATION,
      user_message_id: MESSAGE,
      state: 'claimed',
      claimed_at: '2026-10-05T15:04:02+00:00',
      finished_at: null,
      error_code: null,
    });
  });

  it('drops a request row with no id or a state it does not know', () => {
    expect(normalizeRequest({ id: 0, state: 'queued' })).toBeNull();
    expect(normalizeRequest({ id: 3, state: 'paused' })).toBeNull();
    expect(normalizeRequest('3')).toBeNull();
  });

  it('reads the one status row, and a missing row as never polled', () => {
    expect(
      normalizeStatus({
        polled_at: '2026-10-05T15:59:30+00:00',
        runner: 'workspace-1',
        open_requests: 2,
        oldest_open_at: '2026-10-05T15:58:00+00:00',
      }),
    ).toEqual({
      polled_at: '2026-10-05T15:59:30+00:00',
      runner: 'workspace-1',
      open_requests: 2,
      oldest_open_at: '2026-10-05T15:58:00+00:00',
    });

    const never = { polled_at: null, runner: null, open_requests: 0, oldest_open_at: null };
    expect(normalizeStatus({ polled_at: null, runner: null, open_requests: 0 })).toEqual(never);
    expect(normalizeStatus(null)).toEqual(never);
    expect(normalizeStatus({ polled_at: 5, runner: '', open_requests: '3' })).toEqual({
      ...never,
      open_requests: 3,
    });
  });

  it('picks the one open request: queued or claimed, never a finished one', () => {
    const request = (id: number, state: string) =>
      normalizeRequest({ id, user_message_id: MESSAGE, conversation_id: CONVERSATION, state });
    const done = request(1, 'done')!;
    const cancelled = request(2, 'cancelled')!;
    const failed = request(3, 'failed')!;
    const queued = request(4, 'queued')!;
    const claimed = request(5, 'claimed')!;

    expect(openRequestOf([done, cancelled, failed])).toBeNull();
    expect(openRequestOf([done, queued])).toBe(queued);
    expect(openRequestOf([done, claimed])).toBe(claimed);
    expect(openRequestOf([])).toBeNull();
    expect(openRequestOf(undefined)).toBeNull();
  });
});

describe('isWorkspaceOffline: a null heartbeat, or one more than 120 s old', () => {
  const status = (polled_at: string | null) => normalizeStatus({ polled_at, runner: 'r' });
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it('uses 120 s', () => {
    expect(WORKSPACE_OFFLINE_AFTER_MS).toBe(120_000);
  });

  it('reads a null polled_at as offline', () => {
    expect(isWorkspaceOffline(status(null), NOW)).toBe(true);
  });

  it('reads a heartbeat up to 120 s old as online, and an older one as offline', () => {
    expect(isWorkspaceOffline(status(ago(1_000)), NOW)).toBe(false);
    expect(isWorkspaceOffline(status(ago(WORKSPACE_OFFLINE_AFTER_MS)), NOW)).toBe(false);
    expect(isWorkspaceOffline(status(ago(WORKSPACE_OFFLINE_AFTER_MS + 1)), NOW)).toBe(true);
    expect(isWorkspaceOffline(status(ago(10 * 60 * 1000)), NOW)).toBe(true);
  });

  it('reads a time it cannot parse as offline', () => {
    expect(isWorkspaceOffline(status('yesterday-ish'), NOW)).toBe(true);
  });
});

describe('conversationsOptions: archived rows only when they are asked for', () => {
  const ROWS = [
    { id: CONVERSATION, title: 'spike', archived: false, updated_at: '2026-10-05T15:05:00+00:00' },
    { id: 'not-a-uuid', title: 'dropped' },
  ];

  it('asks for archived = false by default, newest activity first', async () => {
    stub.result = { data: ROWS, error: null };

    const rows = await run<unknown[]>(conversationsOptions());

    expect(callsOn('workspace_conversations')).toEqual([
      {
        target: 'workspace_conversations',
        op: 'select',
        args: ['id, created_at, updated_at, title, archived'],
      },
      { target: 'workspace_conversations', op: 'eq', args: ['archived', false] },
      { target: 'workspace_conversations', op: 'order', args: ['updated_at', { ascending: false }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: CONVERSATION, title: 'spike', archived: false });
  });

  it('asks for archived = true only for the "Show archived" list, under its own key', async () => {
    stub.result = { data: [], error: null };

    await run(conversationsOptions(true));

    expect(callsOn('workspace_conversations')[1]).toEqual({
      target: 'workspace_conversations',
      op: 'eq',
      args: ['archived', true],
    });
    expect(conversationsOptions(true).queryKey).not.toEqual(conversationsOptions(false).queryKey);
    expect(conversationsOptions().queryKey).toEqual(workspaceKeys.conversations(false));
  });

  it('never asks for the session id', () => {
    void run(conversationsOptions()).catch(() => undefined);
    const select = callsOn('workspace_conversations').find((call) => call.op === 'select');
    expect(String(select?.args[0])).not.toContain('claude_session_id');
  });

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stub.result = { data: null, error };
    await expect(run(conversationsOptions())).rejects.toBe(error);
  });
});

describe('messagesOptions: the stored rows, refetched every 5 s only while a request is open', () => {
  it('reads one conversation, oldest first, and never the cost or the session', async () => {
    stub.result = {
      data: [
        { id: MESSAGE, conversation_id: CONVERSATION, role: 'user', content: 'spike', finished: true },
        { id: 'bad', role: 'user' },
      ],
      error: null,
    };

    const rows = await run<unknown[]>(messagesOptions(CONVERSATION, false));

    expect(callsOn('workspace_messages')).toEqual([
      {
        target: 'workspace_messages',
        op: 'select',
        args: [
          'id, conversation_id, role, request_id, tier, content, tool_calls, finished, error_code, created_at',
        ],
      },
      { target: 'workspace_messages', op: 'eq', args: ['conversation_id', CONVERSATION] },
      { target: 'workspace_messages', op: 'order', args: ['created_at', { ascending: true }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: MESSAGE, role: 'user', content: 'spike', finished: true });
  });

  it('refetches every 5 s while a request is open, and not at all otherwise', () => {
    expect(WORKSPACE_MESSAGES_REFETCH_MS).toBe(5_000);
    expect(messagesOptions(CONVERSATION, true).refetchInterval).toBe(5_000);
    expect(messagesOptions(CONVERSATION, false).refetchInterval).toBe(false);
  });

  it('keeps one cache entry per conversation, whether or not a request is open', () => {
    expect(messagesOptions(CONVERSATION, true).queryKey).toEqual(
      messagesOptions(CONVERSATION, false).queryKey,
    );
    expect(messagesOptions(CONVERSATION, false).queryKey).toEqual(
      workspaceKeys.messages(CONVERSATION),
    );
  });

  it('is off with no conversation, and refuses to run without a uuid', async () => {
    expect(messagesOptions(null, false).enabled).toBe(false);
    expect(messagesOptions(CONVERSATION, false).enabled).toBe(true);
    await expect(run(messagesOptions(null, false))).rejects.toThrow(/conversation id/);
    expect(stub.calls).toEqual([]);
  });

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stub.result = { data: null, error };
    await expect(run(messagesOptions(CONVERSATION, false))).rejects.toBe(error);
  });
});

describe('requestsOptions: the open-request query', () => {
  it('reads the conversation`s requests in id order', async () => {
    stub.result = {
      data: [
        { id: 41, conversation_id: CONVERSATION, user_message_id: MESSAGE, state: 'done' },
        { id: 42, conversation_id: CONVERSATION, user_message_id: OTHER_MESSAGE, state: 'queued' },
        { id: 43, state: 'paused' },
      ],
      error: null,
    };

    const rows = await run<{ id: number; state: string }[]>(requestsOptions(CONVERSATION));

    expect(callsOn('workspace_requests')).toEqual([
      {
        target: 'workspace_requests',
        op: 'select',
        args: [
          'id, created_at, conversation_id, user_message_id, state, claimed_at, finished_at, error_code',
        ],
      },
      { target: 'workspace_requests', op: 'eq', args: ['conversation_id', CONVERSATION] },
      { target: 'workspace_requests', op: 'order', args: ['id', { ascending: true }] },
    ]);
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      [41, 'done'],
      [42, 'queued'],
    ]);
  });

  it('refetches every 5 s only while one of them is open', () => {
    const options = requestsOptions(CONVERSATION);
    const request = (id: number, state: string) =>
      normalizeRequest({ id, user_message_id: MESSAGE, conversation_id: CONVERSATION, state });

    expect(intervalFor(options, [request(1, 'done'), request(2, 'queued')])).toBe(5_000);
    expect(intervalFor(options, [request(1, 'done'), request(2, 'claimed')])).toBe(5_000);
    expect(intervalFor(options, [request(1, 'done'), request(2, 'cancelled')])).toBe(false);
    expect(intervalFor(options, [])).toBe(false);
    expect(intervalFor(options, undefined)).toBe(false);
  });

  it('is off with no conversation, and refuses to run without a uuid', async () => {
    expect(requestsOptions(null).enabled).toBe(false);
    expect(requestsOptions(CONVERSATION).enabled).toBe(true);
    expect(requestsOptions(CONVERSATION).queryKey).toEqual(workspaceKeys.requests(CONVERSATION));
    await expect(run(requestsOptions(null))).rejects.toThrow(/conversation id/);
    expect(stub.calls).toEqual([]);
  });
});

describe('statusOptions: v_workspace_status, the one row', () => {
  it('reads the four columns of the one row', async () => {
    stub.result = {
      data: { polled_at: '2026-10-05T15:59:30+00:00', runner: 'workspace-1', open_requests: 0 },
      error: null,
    };

    const status = await run(statusOptions());

    expect(ops('v_workspace_status')).toEqual(['select', 'maybeSingle']);
    expect(callsOn('v_workspace_status')[0].args).toEqual([
      'polled_at, runner, open_requests, oldest_open_at',
    ]);
    expect(status).toEqual({
      polled_at: '2026-10-05T15:59:30+00:00',
      runner: 'workspace-1',
      open_requests: 0,
      oldest_open_at: null,
    });
  });

  it('refetches every 30 s', () => {
    expect(statusOptions().refetchInterval).toBe(WORKSPACE_STATUS_REFETCH_MS);
    expect(statusOptions().queryKey).toEqual(workspaceKeys.status());
  });

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    stub.result = { data: null, error };
    await expect(run(statusOptions())).rejects.toBe(error);
  });
});

describe('the messages, open-request and status queries set staleTime: 0', () => {
  it('so a reload refetches on mount instead of trusting the restored cache', () => {
    expect(messagesOptions(CONVERSATION, false).staleTime).toBe(0);
    expect(messagesOptions(CONVERSATION, true).staleTime).toBe(0);
    expect(requestsOptions(CONVERSATION).staleTime).toBe(0);
    expect(statusOptions().staleTime).toBe(0);
  });
});

describe('invalidateWorkspaceConversation: what a question, a Stop or a finished answer moves', () => {
  it('marks the list, the messages and the requests of that conversation stale', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    invalidateWorkspaceConversation(queryClient, CONVERSATION);

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      workspaceKeys.conversationsAll(),
      workspaceKeys.messages(CONVERSATION),
      workspaceKeys.requests(CONVERSATION),
    ]);
  });

  it('marks only the list stale when there is no conversation yet', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);

    invalidateWorkspaceConversation(queryClient, null);

    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      workspaceKeys.conversationsAll(),
    ]);
  });

  it('keys both lists under the one prefix the invalidation names', () => {
    const prefix = workspaceKeys.conversationsAll();
    expect(workspaceKeys.conversations(false).slice(0, prefix.length)).toEqual([...prefix]);
    expect(workspaceKeys.conversations(true).slice(0, prefix.length)).toEqual([...prefix]);
  });
});

describe('the hooks', () => {
  /** A client per test, with retries off so a refusal settles at once. */
  function harness() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const invalidatedKeys = () => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    return { wrapper, invalidatedKeys };
  }

  it('read the list, the messages, the requests and the status through their options', async () => {
    const { wrapper } = harness();
    stub.result = { data: [], error: null };

    const list = renderHook(() => useWorkspaceConversations(), { wrapper });
    const messages = renderHook(() => useWorkspaceMessages(CONVERSATION, false), { wrapper });
    const requests = renderHook(() => useWorkspaceRequests(CONVERSATION), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([]));
    await waitFor(() => expect(messages.result.current.data).toEqual([]));
    await waitFor(() => expect(requests.result.current.data).toEqual([]));

    stub.result = { data: { polled_at: null, runner: null, open_requests: 0 }, error: null };
    const status = renderHook(() => useWorkspaceStatus(), { wrapper });
    await waitFor(() => expect(status.result.current.data?.polled_at).toBeNull());
    expect(status.result.current.data?.open_requests).toBe(0);
  });

  it('send nothing for the lobby: no conversation, no messages or requests read', async () => {
    const { wrapper } = harness();

    const messages = renderHook(() => useWorkspaceMessages(null, false), { wrapper });
    const requests = renderHook(() => useWorkspaceRequests(null), { wrapper });

    expect(messages.result.current.fetchStatus).toBe('idle');
    expect(requests.result.current.fetchStatus).toBe('idle');
    expect(stub.calls).toEqual([]);
  });

  it('refresh the new conversation after a first question', async () => {
    const { wrapper, invalidatedKeys } = harness();
    stub.result = {
      data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: 42 },
      error: null,
    };

    const { result } = renderHook(() => useAskWorkspace(), { wrapper });
    result.current.mutate({ conversationId: null, text: 'spike' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      conversationId: CONVERSATION,
      messageId: MESSAGE,
      requestId: 42,
    });
    expect(invalidatedKeys()).toEqual([
      workspaceKeys.conversationsAll(),
      workspaceKeys.messages(CONVERSATION),
      workspaceKeys.requests(CONVERSATION),
    ]);
  });

  it('refresh the conversation after a refused question too, so its open request shows', async () => {
    const { wrapper, invalidatedKeys } = harness();
    stub.result = { data: null, error: { code: '23505', message: 'duplicate key' } };

    const { result } = renderHook(() => useAskWorkspace(), { wrapper });
    result.current.mutate({ conversationId: CONVERSATION, text: 'again' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(WorkspaceRefusal);
    expect(result.current.error?.message).toBe(REFUSAL_STILL_ANSWERING);
    expect(invalidatedKeys()).toContainEqual(workspaceKeys.requests(CONVERSATION));
  });

  it('refresh the conversation after Stop', async () => {
    const { wrapper, invalidatedKeys } = harness();
    stub.result = { data: true, error: null };

    const { result } = renderHook(() => useCancelWorkspaceRequest(CONVERSATION), { wrapper });
    result.current.mutate(42);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(invalidatedKeys()).toEqual([
      workspaceKeys.conversationsAll(),
      workspaceKeys.messages(CONVERSATION),
      workspaceKeys.requests(CONVERSATION),
    ]);
  });

  it('refresh both lists after Archive or Unarchive', async () => {
    const { wrapper, invalidatedKeys } = harness();

    const { result } = renderHook(() => useSetConversationArchived(), { wrapper });
    result.current.mutate({ conversationId: CONVERSATION, archived: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidatedKeys()).toEqual([workspaceKeys.conversationsAll()]);
  });
});
