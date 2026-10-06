/**
 * The Workspace screen (Phase 21, task 16; S2-workspace-1, P-86, P-87).
 *
 * What brief 102's "Routes and screens" says the page shows, read off the
 * mounted screen over the fake client in `workspace-harness.tsx`:
 *
 *   * the message column: one tier badge per assistant row; a "Used:" line
 *     built from the `ok: true` tool calls; content as plain text; never a
 *     tool's result, the stored query or the cost estimate;
 *   * the composer: "Ask", and "Stop" only while a request is open; Enter asks
 *     and Shift+Enter is a new line; each refusal has its one sentence;
 *   * the state under a question, from its `workspace_requests` row, with one
 *     sentence per `error_code`, and the stopped sentence at once after Stop;
 *   * the conversation list: archived rows left out, "Archive" on each row,
 *     and a "Show archived" toggle, off by default, whose rows read "Unarchive";
 *   * exactly one private channel: `workspace:<uuid>` or `workspace:lobby`;
 *   * the service line: offline once the clock passes `polled_at` + 120 s.
 *
 * The stream's own cases (the end of a stream, a gap, hydration) are in
 * `use-workspace-stream.screen.test.tsx`; the pure thread rules in
 * `Workspace.thread.test.ts`.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import {
  NEW_CONVERSATION,
  fake,
  gate,
  joined,
  openTopics,
  resetFake,
  type Row,
} from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const labels = await import('@/lib/workspace-labels');
const { WORKSPACE_ERROR_CODES } = await import('@/lib/queries.workspace');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const B = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const TOPIC_A = `workspace:${A}`;

/** A message id: one uuid per small number. */
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function question(n: number, content: string): Row {
  return { id: uuid(n), conversation_id: A, role: 'user', content, finished: true };
}

function answer(n: number, requestId: number, fields: Row = {}): Row {
  return {
    id: uuid(n),
    conversation_id: A,
    role: 'assistant',
    request_id: requestId,
    tier: 'low',
    content: '',
    tool_calls: [],
    finished: true,
    error_code: null,
    ...fields,
  };
}

function request(id: number, questionN: number, state: string, fields: Row = {}): Row {
  return { id, conversation_id: A, user_message_id: uuid(questionN), state, error_code: null, ...fields };
}

/** One finished exchange: question 1, request 41, answer 2. */
function seedAnswered(fields: Row = {}): void {
  fake.state.rows = {
    workspace_messages: [question(1, 'What is due?'), answer(2, 41, { content: 'Quiz 2.', ...fields })],
    workspace_requests: [request(41, 1, 'done')],
  };
}

/** The screen on `?c=A` unless told otherwise. */
function open(search = `c=${A}`) {
  fake.state.search = search;
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
}

function turnOf(container: HTMLElement, requestId: number): HTMLElement {
  const turn = container.querySelector(`li[data-turn][data-request-id="${requestId}"]`);
  if (!(turn instanceof HTMLElement)) throw new Error(`no turn for request ${requestId}`);
  return turn;
}

function composer() {
  return {
    box: screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL }),
    ask: screen.queryByRole('button', { name: labels.ASK_LABEL }),
    stop: screen.queryByRole('button', { name: labels.STOP_LABEL }),
  };
}

function type(text: string): HTMLElement {
  const { box } = composer();
  fireEvent.change(box, { target: { value: text } });
  return box;
}

beforeEach(() => {
  resetFake();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the message column', () => {
  it('shows one tier badge per assistant row, and none on a question', async () => {
    fake.state.rows = {
      workspace_messages: [
        question(1, 'one'),
        answer(2, 41, { tier: 'low', content: 'first' }),
        question(3, 'two'),
        answer(4, 42, { tier: 'mid', content: 'second' }),
        question(5, 'three'),
        answer(6, 43, { tier: 'high', content: 'third' }),
      ],
      workspace_requests: [request(41, 1, 'done'), request(42, 3, 'done'), request(43, 5, 'done')],
    };
    const { container } = open();
    await screen.findByText('third');

    const badges = [...container.querySelectorAll('[data-tier]')];
    expect(badges.map((badge) => badge.textContent)).toEqual([
      'Haiku · lookup',
      'Sonnet · standard',
      'Opus · deep work',
    ]);
    expect(badges.map((badge) => badge.getAttribute('data-tier'))).toEqual(['low', 'mid', 'high']);
  });

  it('builds the "Used:" line from the ok calls only, in call order, each entry once', async () => {
    seedAnswered({
      tool_calls: [
        { tool: 'search_context', query: 'quiz 2', scope: 'bb2dash-inbox-decisions', ok: true },
        { tool: 'get_document', query: null, scope: null, ok: false },
        { tool: 'list_courses', query: null, scope: null, ok: true },
        { tool: 'search_context', query: 'quiz two', scope: 'bb2dash-inbox-decisions', ok: true },
        { tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true },
        { tool: 'search_materials', query: 'late work', scope: null, ok: true },
      ],
    });
    const { container } = open();
    await screen.findByText('Quiz 2.');

    expect(container.querySelector('[data-used]')?.textContent).toBe(
      'Used: search_context · bb2dash-inbox-decisions, list_courses, search_materials · IST.323, search_materials',
    );
  });

  it('shows no "Used:" line when no call was ok, or none was made', async () => {
    fake.state.rows = {
      workspace_messages: [
        question(1, 'one'),
        answer(2, 41, { content: 'first', tool_calls: [{ tool: 'search_context', scope: 'stack', ok: false }] }),
        question(3, 'two'),
        answer(4, 42, { content: 'second', tool_calls: [] }),
      ],
      workspace_requests: [request(41, 1, 'done'), request(42, 3, 'done')],
    };
    const { container } = open();
    await screen.findByText('second');

    expect(container.querySelector('[data-used]')).toBeNull();
    expect(container.textContent).not.toContain('Used:');
  });

  it('renders <script> in content as literal text', async () => {
    seedAnswered({ content: '<script>alert(1)</script> and <b>bold</b>' });
    const { container } = open();

    const text = await screen.findByText('<script>alert(1)</script> and <b>bold</b>');
    expect(text.children).toHaveLength(0);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('never renders a tool`s result text, the stored query or the cost estimate', async () => {
    seedAnswered({
      cost_usd: 0.0213,
      tool_calls: [
        {
          tool: 'search_materials',
          query: 'the-stored-query',
          scope: 'IST.323',
          ok: true,
          result: '[notes] a raw speaker-note slice',
        },
      ],
    });
    const { container } = open();
    await screen.findByText('Quiz 2.');

    expect(container.querySelector('[data-used]')?.textContent).toBe('Used: search_materials · IST.323');
    expect(container.textContent).not.toContain('the-stored-query');
    expect(container.textContent).not.toContain('speaker-note');
    expect(container.textContent).not.toContain('0.0213');
    expect(container.textContent).not.toContain('$');
  });
});

describe('the composer', () => {
  it('reads "Ask", and "Stop" only while a request is open', async () => {
    seedAnswered();
    const view = open();
    await screen.findByText('Quiz 2.');
    expect(composer().ask).toBeInTheDocument();
    expect(composer().stop).toBeNull();
    view.unmount();

    fake.state.rows = {
      workspace_messages: [question(1, 'What is due?')],
      workspace_requests: [request(42, 1, 'claimed')],
    };
    open();
    await waitFor(() => expect(composer().stop).toBeInTheDocument());
    expect(composer().ask).toBeNull();
  });

  it('asks on Enter, and leaves Shift+Enter to make a new line', async () => {
    open();
    await joined(TOPIC_A);
    const box = type('  What is due this week?  ');

    // A key the page does not handle is not cancelled, so the browser adds the line.
    expect(fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(fake.state.rpcCalls).toEqual([]);

    expect(fireEvent.keyDown(box, { key: 'Enter' })).toBe(false);
    await waitFor(() =>
      expect(fake.state.rpcCalls).toEqual([
        { fn: 'workspace_ask', args: { p_conversation_id: A, p_text: 'What is due this week?' } },
      ]),
    );
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('refuses an empty question with its sentence, before any request is sent', async () => {
    open();
    await joined(TOPIC_A);
    type('   ');

    fireEvent.click(screen.getByRole('button', { name: labels.ASK_LABEL }));

    expect(await screen.findByText('Write a question of 1 to 8000 characters.')).toBeInTheDocument();
    expect(fake.state.rpcCalls).toEqual([]);
  });

  it('says the conversation is still answering when the database refuses a second question', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'What is due?')],
      workspace_requests: [request(42, 1, 'queued')],
    };
    open();
    await waitFor(() => expect(composer().stop).toBeInTheDocument());

    // The button reads Stop; a question sent past it is refused by the database (23505).
    fireEvent.keyDown(type('and next week?'), { key: 'Enter' });

    expect(await screen.findByText('This conversation is still answering.')).toBeInTheDocument();
    expect(fake.state.rpcCalls.map((call) => call.fn)).toEqual(['workspace_ask']);
    expect(composer().box).toHaveValue('and next week?');
  });

  it('opens the new conversation after a first question', async () => {
    open('');
    await joined('workspace:lobby');
    type('spike');

    fireEvent.click(screen.getByRole('button', { name: labels.ASK_LABEL }));

    await waitFor(() =>
      expect(fake.state.router.replace).toHaveBeenCalledWith(`/workspace?c=${NEW_CONVERSATION}`),
    );
    expect(fake.state.rpcCalls[0].args).toEqual({ p_conversation_id: null, p_text: 'spike' });
  });

  it('says it could not load the conversation when its id does not exist (23503)', async () => {
    fake.state.rpc.workspace_ask = () => ({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint' },
    });
    open(`c=${B}`);
    await joined(`workspace:${B}`);
    type('hello?');

    fireEvent.click(screen.getByRole('button', { name: labels.ASK_LABEL }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load this conversation: violates foreign key constraint');
    expect(screen.queryByText(labels.REFUSAL_QUESTION_LENGTH)).toBeNull();
    expect(composer().box).toHaveValue('hello?');
  });
});

describe('the state under a question', () => {
  it('comes from its workspace_requests row: a queued question is waiting', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'What is due?')],
      workspace_requests: [request(42, 1, 'queued')],
    };
    const { container } = open();

    expect(await screen.findByText('Waiting for the Workspace service')).toBeInTheDocument();
    expect(turnOf(container, 42)).toHaveAttribute('data-turn', 'queued');
    expect(turnOf(container, 42)).toHaveTextContent('What is due?');
  });

  it.each(WORKSPACE_ERROR_CODES.filter((code) => code !== 'cancelled'))(
    'says the one sentence for a request that failed with %s',
    async (code) => {
      fake.state.rows = {
        workspace_messages: [
          question(1, 'What is due?'),
          answer(2, 42, { content: 'partial', error_code: code }),
        ],
        workspace_requests: [request(42, 1, 'failed', { error_code: code })],
      };
      const { container } = open();
      await screen.findByText('partial');

      const turn = turnOf(container, 42);
      expect(turn.querySelector('[data-turn-line]')?.textContent).toBe(labels.ERROR_SENTENCES[code]);
      expect(turn).toHaveAttribute('data-turn', 'failed');
    },
  );

  it('chooses the sentence by the request row`s code, not the message`s', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'What is due?'), answer(2, 42, { error_code: 'cli_error' })],
      workspace_requests: [request(42, 1, 'failed', { error_code: 'timeout' })],
    };
    const { container } = open();

    expect(await screen.findByText('This took too long and was stopped.')).toBeInTheDocument();
    expect(container.textContent).not.toContain(labels.ERROR_SENTENCES.cli_error);
  });

  it('takes the sentence from the request row when a failed request has no assistant row', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'What is due?')],
      workspace_requests: [request(42, 1, 'failed', { error_code: 'stale_claim' })],
    };
    const { container } = open();

    expect(
      await screen.findByText('The Workspace service stopped part-way. Ask again.'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-tier]')).toBeNull();
  });

  it('shows the stopped sentence under the question for a cancelled request with no assistant row', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'spike')],
      workspace_requests: [request(24, 1, 'cancelled', { error_code: 'cancelled' })],
    };
    const { container } = open();

    expect(await screen.findByText('You stopped this answer.')).toBeInTheDocument();
    expect(turnOf(container, 24)).toHaveAttribute('data-turn', 'stopped');
    expect(composer().ask).toBeInTheDocument();
  });

  it('shows the stopped sentence at once after Stop, before the database has answered', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'Draft a plan'), answer(2, 42, { tier: 'high', finished: false })],
      workspace_requests: [request(42, 1, 'claimed')],
    };
    const { container } = open();
    await waitFor(() => expect(composer().stop).toBeInTheDocument());
    const held = gate();
    fake.state.rpcGate = held.promise;

    fireEvent.click(screen.getByRole('button', { name: labels.STOP_LABEL }));

    // The cancel is still on its way: the sentence and the Ask button are there already.
    expect(screen.getByText('You stopped this answer.')).toBeInTheDocument();
    expect(turnOf(container, 42)).toHaveAttribute('data-turn', 'stopped');
    expect(composer().ask).toBeInTheDocument();
    expect(composer().stop).toBeNull();
    expect(fake.state.rpcCalls).toEqual([{ fn: 'workspace_cancel', args: { p_request_id: 42 } }]);

    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() =>
      expect(fake.state.rows.workspace_requests[0]).toMatchObject({ state: 'cancelled' }),
    );
    expect(screen.getByText('You stopped this answer.')).toBeInTheDocument();
  });

  it('shows only "Answering…" when the lowest seq received is not 1', async () => {
    fake.state.rows = {
      workspace_messages: [question(1, 'Draft a plan')],
      workspace_requests: [request(42, 1, 'claimed')],
    };
    const { container } = open();
    const channel = await joined(TOPIC_A);
    await waitFor(() => expect(composer().stop).toBeInTheDocument());

    act(() => {
      channel.emit('delta', { request_id: 42, seq: 5, delta: 'half an ' });
      channel.emit('delta', { request_id: 42, seq: 6, delta: 'answer' });
    });

    const turn = turnOf(container, 42);
    expect(turn.querySelector('[data-turn-line]')?.textContent).toBe('Answering…');
    expect(turn.querySelector('[data-answer-text]')).toBeNull();
    expect(container.textContent).not.toContain('half an');
  });
});

describe('the conversation list', () => {
  const NOW = '2026-10-06T15:00:00+00:00';

  function seedList(): void {
    fake.state.rows = {
      workspace_conversations: [
        { id: A, title: 'spike', archived: false, updated_at: NOW },
        { id: B, title: 'an old plan', archived: true, updated_at: NOW },
      ],
    };
  }

  function list(): HTMLElement {
    return screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
  }

  it('leaves an archived conversation out, and gives each row an "Archive" button', async () => {
    seedList();
    open('');

    const link = await within(list()).findByRole('link', { name: /spike/ });
    expect(link).toHaveAttribute('href', `/workspace?c=${A}`);
    expect(within(list()).queryByText('an old plan')).toBeNull();
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list()).getAllByRole('button', { name: 'Archive' })).toHaveLength(1);
  });

  it('lists archived conversations, each with "Unarchive", only when "Show archived" is on', async () => {
    seedList();
    open('');
    await within(list()).findByRole('link', { name: /spike/ });
    const toggle = within(list()).getByRole('checkbox', { name: 'Show archived' });

    // Off by default, and the archived rows have not been asked for.
    expect(toggle).not.toBeChecked();
    expect(fake.state.log.filter((entry) => entry === 'from:workspace_conversations')).toHaveLength(1);

    fireEvent.click(toggle);

    expect(await within(list()).findByRole('link', { name: /an old plan/ })).toBeInTheDocument();
    expect(within(list()).getAllByRole('button', { name: 'Unarchive' })).toHaveLength(1);
    expect(within(list()).getAllByRole('button', { name: 'Archive' })).toHaveLength(1);

    fireEvent.click(toggle);
    expect(within(list()).queryByText('an old plan')).toBeNull();
  });

  it('archives a conversation: it leaves the list, and Unarchive brings it back', async () => {
    seedList();
    open('');
    await within(list()).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list()).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(within(list()).queryByRole('link', { name: /spike/ })).toBeNull());
    expect(fake.state.rows.workspace_conversations[0]).toMatchObject({ id: A, archived: true });

    fireEvent.click(within(list()).getByRole('checkbox', { name: 'Show archived' }));
    await within(list()).findByRole('link', { name: /spike/ });
    const row = within(list()).getByRole('link', { name: /spike/ }).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Unarchive' }));

    await waitFor(() =>
      expect(fake.state.rows.workspace_conversations[0]).toMatchObject({ id: A, archived: false }),
    );
    await waitFor(() => expect(within(list()).getAllByRole('button', { name: 'Archive' })).toHaveLength(1));
  });

  it('marks the selected conversation, and shows when each was last active', async () => {
    seedList();
    open();

    const link = await within(list()).findByRole('link', { name: /spike/ });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.querySelector('[data-last-activity]')?.textContent).not.toBe('');
  });
});

describe('the one private channel', () => {
  it.each([
    ['workspace:<uuid> when ?c= is a uuid', `c=${A}`, TOPIC_A],
    ['workspace:lobby with no ?c=', '', 'workspace:lobby'],
    ['workspace:lobby when ?c= is not a uuid', 'c=lobby', 'workspace:lobby'],
  ])('holds exactly one: %s', async (_label, search, topic) => {
    seedAnswered();
    const { container } = open(search);
    const channel = await joined(topic);

    expect(openTopics()).toEqual([topic]);
    expect(fake.state.maxOpen).toBe(1);
    expect(channel.params).toEqual({ config: { private: true } });
    expect(container.querySelector('[data-workspace-stream]')).toHaveAttribute('data-topic', topic);
  });
});

describe('the service line', () => {
  const START = Date.parse('2026-10-06T15:00:00Z');

  function heartbeat(atMs: number): Row[] {
    return [{ polled_at: new Date(atMs).toISOString(), runner: 'workspace-1', open_requests: 0 }];
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it('turns offline once the clock passes polled_at + 120 s with no new data, and back when a newer one arrives', async () => {
    vi.useFakeTimers({ now: START });
    fake.state.rows = { v_workspace_status: heartbeat(START - 10_000) };
    open('');
    await advance(100);
    expect(screen.queryByText('The Workspace service is offline.')).toBeNull();

    // 100 s after the heartbeat: the status was re-read three times and is unchanged.
    await advance(90_000);
    expect(screen.queryByText('The Workspace service is offline.')).toBeNull();

    // Past 120 s, with no reload.
    await advance(30_000);
    expect(screen.getByText('The Workspace service is offline.')).toBeInTheDocument();

    fake.state.rows = { v_workspace_status: heartbeat(Date.now()) };
    await advance(30_000);
    expect(screen.queryByText('The Workspace service is offline.')).toBeNull();
  });

  it('reads a service that never polled as offline', async () => {
    fake.state.rows = { v_workspace_status: [{ polled_at: null, runner: null, open_requests: 0 }] };
    open('');

    expect(await screen.findByText('The Workspace service is offline.')).toBeInTheDocument();
  });

  it('says nothing about the service before the status has been read', async () => {
    fake.state.readErrors = { v_workspace_status: { code: '42501', message: 'permission denied' } };
    open('');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('permission denied');
    expect(screen.queryByText('The Workspace service is offline.')).toBeNull();
  });
});
