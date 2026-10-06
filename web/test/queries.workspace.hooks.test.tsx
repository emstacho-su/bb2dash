/**
 * The Workspace query layer, second half (Phase 21, task 15; P-86).
 *
 * `queries.workspace.test.ts` holds the reads and the two RPCs against a
 * recording stub. This sibling holds what runs over a client or a cache:
 *
 *   * a request id is one number on both sides of every comparison;
 *   * Archive writes the one column, on the one conversation;
 *   * a question, a Stop or a finished answer marks the list, the messages and
 *     the requests of that conversation stale;
 *   * the hooks read through their options and refresh after each write.
 *
 * The Supabase browser client is the fake in `workspace-harness.tsx`: its
 * tables apply their filters and its two RPCs answer as migration 140's do.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEW_CONVERSATION, NEW_REQUEST, fake, resetFake } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);

const {
  WorkspaceRefusal,
  askWorkspace,
  invalidateWorkspaceConversation,
  normalizeRequest,
  setConversationArchived,
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
const { REFUSAL_STILL_ANSWERING } = await import('@/lib/workspace-labels');

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const OTHER_CONVERSATION = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const MESSAGE = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';

beforeEach(() => {
  resetFake();
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

  /**
   * `workspace_requests.id` is a bigint, and a number holds an integer exactly
   * only up to 2^53 - 1. Past that, two ids can read as one number, and a delta
   * would be credited to the wrong request. So such an id reads as no request:
   * its row is dropped and its deltas are never rendered.
   */
  it('reads the largest exact integer, and nothing past 2^53', () => {
    expect(toRequestId(Number.MAX_SAFE_INTEGER)).toBe(9007199254740991);
    expect(toRequestId('9007199254740991')).toBe(9007199254740991);

    expect(toRequestId(2 ** 53)).toBeNull();
    expect(toRequestId('9007199254740992')).toBeNull();
    // As digits this id is exact; as a number it would round to its neighbour, 2^53.
    expect(Number('9007199254740993')).toBe(2 ** 53);
    expect(toRequestId('9007199254740993')).toBeNull();
    expect(toRequestId('12345678901234567')).toBeNull();
  });

  it('drops a request row, and an ask result, whose id is past 2^53', async () => {
    expect(
      normalizeRequest({ id: '9007199254740993', user_message_id: MESSAGE, state: 'queued' }),
    ).toBeNull();

    fake.state.rpc.workspace_ask = () => ({
      data: { conversation_id: CONVERSATION, message_id: MESSAGE, request_id: '9007199254740993' },
      error: null,
    });
    await expect(askWorkspace({ conversationId: null, text: 'spike' })).rejects.toThrow(
      /workspace_ask/,
    );
  });
});


describe('setConversationArchived: the one column the list writes', () => {
  const ROWS = [
    { id: CONVERSATION, title: 'spike', archived: false },
    { id: OTHER_CONVERSATION, title: 'another', archived: false },
  ];

  it.each([true, false])('updates archived = %s on that conversation only', async (archived) => {
    fake.state.rows = { workspace_conversations: ROWS.map((row) => ({ ...row, archived: !archived })) };

    await setConversationArchived({ conversationId: CONVERSATION, archived });

    expect(fake.state.log).toEqual(['from:workspace_conversations', 'update:workspace_conversations']);
    expect(fake.state.rows.workspace_conversations).toEqual([
      { id: CONVERSATION, title: 'spike', archived },
      { id: OTHER_CONVERSATION, title: 'another', archived: !archived },
    ]);
  });

  it('refuses an id that is not a uuid, and a flag that is not a boolean, before any request', async () => {
    await expect(setConversationArchived({ conversationId: 'x', archived: true })).rejects.toThrow(
      /conversation id/,
    );
    await expect(
      setConversationArchived({ conversationId: CONVERSATION, archived: 'yes' as unknown as boolean }),
    ).rejects.toThrow(/archived/);
    expect(fake.state.log).toEqual([]);
  });

  it('throws the database error', async () => {
    const error = { code: '42501', message: 'permission denied' };
    fake.state.readErrors = { workspace_conversations: error };
    await expect(
      setConversationArchived({ conversationId: CONVERSATION, archived: true }),
    ).rejects.toBe(error);
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

  function seedOpenRequest() {
    fake.state.rows = {
      workspace_requests: [
        { id: 42, conversation_id: CONVERSATION, user_message_id: MESSAGE, state: 'queued' },
      ],
    };
  }

  it('read the list, the messages, the requests and the status through their options', async () => {
    const { wrapper } = harness();
    fake.state.rows = { v_workspace_status: [{ polled_at: null, runner: null, open_requests: 0 }] };

    const list = renderHook(() => useWorkspaceConversations(), { wrapper });
    const messages = renderHook(() => useWorkspaceMessages(CONVERSATION, false), { wrapper });
    const requests = renderHook(() => useWorkspaceRequests(CONVERSATION), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([]));
    await waitFor(() => expect(messages.result.current.data).toEqual([]));
    await waitFor(() => expect(requests.result.current.data).toEqual([]));

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
    expect(fake.state.log).toEqual([]);
  });

  it('refresh the new conversation after a first question', async () => {
    const { wrapper, invalidatedKeys } = harness();

    const { result } = renderHook(() => useAskWorkspace(), { wrapper });
    result.current.mutate({ conversationId: null, text: 'spike' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      conversationId: NEW_CONVERSATION,
      requestId: NEW_REQUEST,
    });
    expect(invalidatedKeys()).toEqual([
      workspaceKeys.conversationsAll(),
      workspaceKeys.messages(NEW_CONVERSATION),
      workspaceKeys.requests(NEW_CONVERSATION),
    ]);
  });

  it('refresh the conversation after a refused question too, so its open request shows', async () => {
    const { wrapper, invalidatedKeys } = harness();
    seedOpenRequest();

    const { result } = renderHook(() => useAskWorkspace(), { wrapper });
    result.current.mutate({ conversationId: CONVERSATION, text: 'again' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(WorkspaceRefusal);
    expect(result.current.error?.message).toBe(REFUSAL_STILL_ANSWERING);
    expect(invalidatedKeys()).toContainEqual(workspaceKeys.requests(CONVERSATION));
  });

  it('refresh the conversation after Stop', async () => {
    const { wrapper, invalidatedKeys } = harness();
    seedOpenRequest();

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
