/**
 * The Workspace screen when something fails (Phase 21, task 16).
 *
 * `Workspace.test.tsx` holds what the Contract says the page shows. This
 * sibling holds the other half of every read and write: a failure is said, in
 * the app's "Could not …: <reason>" form, and the page is left in the state the
 * database is really in. Nothing is swallowed, and nothing typed is lost.
 * A line that has lost its reason goes: "still answering" once nothing is
 * answering, "could not stop" once the request it was pressed on has finished.
 *
 * It also holds the composer's waiting state and the message column's scroll,
 * which no Contract sentence names.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, gate, joined, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const labels = await import('@/lib/workspace-labels');
const { normalizeMessage, normalizeRequest } = await import('@/lib/queries.workspace');
const { MessageList } = await import('@/components/workspace/MessageList');
const { buildTurns } = await import('@/components/workspace/thread');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const TOPIC_A = `workspace:${A}`;
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';
const DENIED = { code: '42501', message: 'permission denied' };

const QUESTION_ROW: Row = { id: QUESTION, conversation_id: A, role: 'user', content: 'What is due?', finished: true };

function requestRow(state: string, fields: Row = {}): Row {
  return { id: 42, conversation_id: A, user_message_id: QUESTION, state, ...fields };
}

/** The conversation once request 42 is answered: the stored row and the closed request. */
const ANSWERED_ROWS: Record<string, Row[]> = {
  workspace_messages: [
    QUESTION_ROW,
    {
      id: ANSWER,
      conversation_id: A,
      role: 'assistant',
      request_id: 42,
      tier: 'low',
      content: 'Quiz 2.',
      finished: true,
    },
  ],
  workspace_requests: [requestRow('done')],
};

/** The broadcast `workspace_finish()` sends for it. */
const DONE_EVENT = { request_id: 42, message_id: ANSWER, state: 'done' };

/** The same conversation after a second question was asked from another tab: request 43 is open. */
const SECOND_QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-000000000043';
const SECOND_ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-000000000043';
const OTHER_TAB_ASKED_ROWS: Record<string, Row[]> = {
  workspace_messages: [
    ...ANSWERED_ROWS.workspace_messages,
    { id: SECOND_QUESTION, conversation_id: A, role: 'user', content: 'And the reading?', finished: true },
  ],
  workspace_requests: [
    ...ANSWERED_ROWS.workspace_requests,
    { id: 43, conversation_id: A, user_message_id: SECOND_QUESTION, state: 'queued' },
  ],
};

function open(search = `c=${A}`) {
  fake.state.search = search;
  return render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
}

function box(): HTMLElement {
  return screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL });
}

function type(text: string): HTMLElement {
  fireEvent.change(box(), { target: { value: text } });
  return box();
}

function alerts(): string[] {
  return screen.queryAllByRole('alert').map((alert) => alert.textContent ?? '');
}

beforeEach(() => {
  resetFake();
});

describe('a read that fails is said', () => {
  it('says the conversations could not be loaded, in the list', async () => {
    fake.state.readErrors = { workspace_conversations: DENIED };
    open('');

    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    expect(await within(list).findByRole('alert')).toHaveTextContent(
      'Could not load the conversations: permission denied',
    );
    expect(within(list).queryByText(labels.NO_CONVERSATIONS_LINE)).toBeNull();
  });

  it('says the conversation could not be loaded when its messages cannot be read', async () => {
    fake.state.rows = { workspace_requests: [requestRow('done')] };
    fake.state.readErrors = { workspace_messages: DENIED };
    open();

    await waitFor(() =>
      expect(alerts()).toEqual(['Could not load this conversation: permission denied']),
    );
  });

  it('says an empty list is empty only once the list has answered', async () => {
    open('');

    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    expect(await within(list).findByText('No conversations yet.')).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('checkbox', { name: 'Show archived' }));
    expect(await within(list).findByText('No archived conversations.')).toBeInTheDocument();
  });
});

describe('a question that fails', () => {
  it('says it could not be sent, keeps the text, and shows neither refusal', async () => {
    fake.state.rows = ANSWERED_ROWS;
    fake.state.rpc.workspace_ask = () => ({ data: null, error: DENIED });
    open();
    await screen.findByText('Quiz 2.');
    type('What is due?');

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(alerts()).toEqual(['Could not send this question: permission denied']));
    expect(box()).toHaveValue('What is due?');
    expect(screen.queryByText(labels.REFUSAL_QUESTION_LENGTH)).toBeNull();
    expect(screen.queryByText(labels.REFUSAL_STILL_ANSWERING)).toBeNull();
  });

  it('says a failed read in its own words and a missing id in the not-found line, never the foreign-key sentence', async () => {
    fake.state.readErrors = { workspace_requests: DENIED };
    fake.state.rpc.workspace_ask = () => ({
      data: null,
      error: { code: '23503', message: 'violates foreign key constraint' },
    });
    const { container } = open();
    // A read that failed is not "not found": the page does not know, so the question may be sent.
    await waitFor(() => expect(alerts()).toEqual(['Could not load this conversation: permission denied']));
    type('hello?');

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() => expect(fake.state.rpcCalls).toHaveLength(1));
    await waitFor(() =>
      expect(alerts()).toEqual([
        'Could not load this conversation: permission denied',
        'This conversation was not found.',
      ]),
    );
    expect(container.textContent).not.toContain('violates foreign key constraint');
  });

  it('takes a refusal away once the text is edited', async () => {
    fake.state.rows = ANSWERED_ROWS;
    open();
    await screen.findByText('Quiz 2.');
    type('   ');
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText(labels.REFUSAL_QUESTION_LENGTH);

    type('What is due?');

    await waitFor(() => expect(screen.queryByText(labels.REFUSAL_QUESTION_LENGTH)).toBeNull());
    expect(box()).toHaveValue('What is due?');
  });

  it('makes the button wait while a question is on its way, and does not send it twice', async () => {
    fake.state.rows = ANSWERED_ROWS;
    open();
    await screen.findByText('Quiz 2.');
    const held = gate();
    fake.state.rpcGate = held.promise;
    const field = type('What is due?');

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled());
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.keyDown(field, { key: 'Enter' });

    await act(async () => {
      held.release();
      await held.promise;
    });
    await waitFor(() => expect(field).toHaveValue(''));
    expect(fake.state.rpcCalls.map((call) => call.fn)).toEqual(['workspace_ask']);
  });

  it('sends one question for two Enters in the same tick: a held key does not ask twice', async () => {
    fake.state.rows = ANSWERED_ROWS;
    open();
    await screen.findByText('Quiz 2.');
    const field = type('What is due?');

    // Both land before the page has re-rendered as busy.
    act(() => {
      fireEvent.keyDown(field, { key: 'Enter' });
      fireEvent.keyDown(field, { key: 'Enter' });
    });

    await waitFor(() => expect(field).toHaveValue(''));
    expect(fake.state.rpcCalls.map((call) => call.fn)).toEqual(['workspace_ask']);
    expect(screen.queryByText(labels.REFUSAL_STILL_ANSWERING)).toBeNull();
  });
});

describe('a Stop that does not stop', () => {
  function seedClaimed(): void {
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW],
      workspace_requests: [requestRow('claimed')],
    };
  }

  it('says it could not stop, and reads as open again: the request is still running', async () => {
    seedClaimed();
    fake.state.rpc.workspace_cancel = () => ({ data: null, error: DENIED });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    await waitFor(() => expect(alerts()).toEqual(['Could not stop this answer: permission denied']));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByText(labels.STOPPED_SENTENCE)).toBeNull();
  });

  it('shows the finished answer when Stop came too late: the row wins', async () => {
    seedClaimed();
    // The runner finished between the page's last read and the press.
    fake.state.rpc.workspace_cancel = () => {
      fake.state.rows = ANSWERED_ROWS;
      return { data: false, error: null };
    };
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));

    expect(await screen.findByText('Quiz 2.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(labels.STOPPED_SENTENCE)).toBeNull());
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();
    expect(alerts()).toEqual([]);
  });

  it('takes the could-not-stop line away once that request has finished, and does not put it on the next', async () => {
    seedClaimed();
    fake.state.rpc.workspace_cancel = () => ({ data: null, error: DENIED });
    open();
    const channel = await joined(TOPIC_A);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(alerts()).toEqual(['Could not stop this answer: permission denied']));

    // The answer finishes by itself: there is nothing left to stop.
    fake.state.rows = ANSWERED_ROWS;
    act(() => channel.emit('done', DONE_EVENT));
    expect(await screen.findByText('Quiz 2.')).toBeInTheDocument();
    await waitFor(() => expect(alerts()).toEqual([]));

    // The next question opens another request. Stop was never pressed on it.
    fireEvent.keyDown(type('and next week?'), { key: 'Enter' });
    expect(await screen.findByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(alerts()).toEqual([]);
  });
});

describe('a refusal that has lost its reason', () => {
  it('takes "still answering" away once the answer is stored, and keeps what was typed', async () => {
    fake.state.rows = ANSWERED_ROWS;
    open();
    const channel = await joined(TOPIC_A);
    await screen.findByText('Quiz 2.');
    // Enter sends only while this page sees nothing open, so the refusal comes by the
    // backstop: a second question asked from another tab, not yet read here.
    fake.state.rows = OTHER_TAB_ASKED_ROWS;
    fireEvent.keyDown(type('and next week?'), { key: 'Enter' });
    await screen.findByText(labels.REFUSAL_STILL_ANSWERING);
    await screen.findByRole('button', { name: 'Stop' });

    // Request 43 is answered.
    fake.state.rows = {
      workspace_messages: [
        ...OTHER_TAB_ASKED_ROWS.workspace_messages,
        {
          id: SECOND_ANSWER,
          conversation_id: A,
          role: 'assistant',
          request_id: 43,
          tier: 'low',
          content: 'Chapter 4.',
          finished: true,
        },
      ],
      workspace_requests: OTHER_TAB_ASKED_ROWS.workspace_requests.map((row) => ({ ...row, state: 'done' })),
    };
    act(() => channel.emit('done', { request_id: 43, message_id: SECOND_ANSWER, state: 'done' }));
    expect(await screen.findByText('Chapter 4.')).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Ask' });

    expect(screen.queryByText(labels.REFUSAL_STILL_ANSWERING)).toBeNull();
    expect(box()).toHaveValue('and next week?');
  });

  it('still says "still answering" for an open request this page had not read', async () => {
    fake.state.rows = ANSWERED_ROWS;
    open();
    await screen.findByText('Quiz 2.');
    await screen.findByRole('button', { name: 'Ask' });
    // Asked from another tab: open in the database, and not yet on this page.
    fake.state.rows = OTHER_TAB_ASKED_ROWS;

    fireEvent.keyDown(type('and next week?'), { key: 'Enter' });

    expect(await screen.findByText(labels.REFUSAL_STILL_ANSWERING)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('keeps the question-length refusal with no request open: its reason is the text', async () => {
    fake.state.rows = ANSWERED_ROWS;
    open();
    await screen.findByText('Quiz 2.');
    type('   ');

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText(labels.REFUSAL_QUESTION_LENGTH)).toBeInTheDocument();
  });
});

describe('archiving', () => {
  const ROWS = [{ id: A, title: 'spike', archived: false, updated_at: null }];

  it('says it could not change the conversation, and leaves the row where it is', async () => {
    fake.state.rows = { workspace_conversations: ROWS };
    fake.state.writeErrors = { workspace_conversations: DENIED };
    open('');
    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    await within(list).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list).getByRole('button', { name: 'Archive' }));

    expect(await within(list).findByRole('alert')).toHaveTextContent(
      'Could not change this conversation: permission denied',
    );
    expect(within(list).getByRole('link', { name: /spike/ })).toBeInTheDocument();
    expect(fake.state.rows.workspace_conversations[0]).toMatchObject({ archived: false });
  });

  it('lets go of the selected conversation once it is archived: it left the list', async () => {
    fake.state.rows = { workspace_conversations: ROWS };
    open();
    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    await within(list).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(fake.state.router.replace).toHaveBeenCalledWith('/workspace'));
  });

  it('stays on another conversation when one that is not selected is archived', async () => {
    fake.state.rows = { workspace_conversations: ROWS };
    open('');
    const list = screen.getByRole('navigation', { name: labels.CONVERSATIONS_HEADING });
    await within(list).findByRole('link', { name: /spike/ });

    fireEvent.click(within(list).getByRole('button', { name: 'Archive' }));

    await waitFor(() => expect(within(list).queryByRole('link', { name: /spike/ })).toBeNull());
    expect(fake.state.router.replace).not.toHaveBeenCalled();
  });
});

describe('the message column follows an answer as it is written', () => {
  function turnsWith(text: string) {
    const question = normalizeMessage(QUESTION_ROW);
    if (question === null) throw new Error('bad fixture');
    return buildTurns({
      messages: [question],
      requests: [],
      live: null,
      stoppedRequestIds: new Set(),
    }).map((turn) => ({ ...turn, text }));
  }

  /** jsdom lays nothing out: give the column the sizes a browser would. */
  function size(column: HTMLElement, scrollHeight: number): void {
    Object.defineProperty(column, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: 400 });
  }

  function mount() {
    const view = render(<MessageList turns={turnsWith('a')} empty={null} />);
    const column = view.container.firstElementChild as HTMLElement;
    return { ...view, column };
  }

  it('keeps the end in view while the reader is at the end', () => {
    const { column, rerender } = mount();
    size(column, 900);

    rerender(<MessageList turns={turnsWith('a longer answer')} empty={null} />);

    expect(column.scrollTop).toBe(900);
  });

  it('lets go once the reader scrolls up, and follows again from the end', () => {
    const { column, rerender } = mount();
    size(column, 900);
    column.scrollTop = 100;
    fireEvent.scroll(column);

    size(column, 1200);
    rerender(<MessageList turns={turnsWith('a longer answer')} empty={null} />);
    expect(column.scrollTop).toBe(100);

    column.scrollTop = 780;
    fireEvent.scroll(column);
    size(column, 1500);
    rerender(<MessageList turns={turnsWith('a much longer answer')} empty={null} />);
    expect(column.scrollTop).toBe(1500);
  });
});

/**
 * The PM's walk of 2026-10-07, W-2: after a long answer finished, its "Used:"
 * line was under the visible part of the column. The stored row stores the text
 * already on screen, and adds lines no character of that text accounts for.
 */
describe('the message column follows what arrives with the stored row', () => {
  const LIVE_TEXT = 'Quiz 2 is due on Friday.';
  const MORE_TEXT = `${LIVE_TEXT} The reading is chapter 4.`;
  const USED = [{ tool: 'search_materials', scope: 'IST.323', ok: true }];

  /** Request 42's assistant row: as `workspace_begin()` writes it, unless `fields` say it is stored. */
  function answerRow(fields: Row = {}): Row {
    return {
      id: ANSWER,
      conversation_id: A,
      role: 'assistant',
      request_id: 42,
      tier: 'mid',
      content: '',
      tool_calls: [],
      finished: false,
      error_code: null,
      ...fields,
    };
  }

  /** Request 42 as the page builds it: from its rows, and the text of its stream. */
  function turnsOfRequest(rows: { request: Row; answer?: Row; text: string }) {
    const messages = [QUESTION_ROW, ...(rows.answer ? [rows.answer] : [])].flatMap(
      (row) => normalizeMessage(row) ?? [],
    );
    const requests = [rows.request].flatMap((row) => normalizeRequest(row) ?? []);
    return buildTurns({
      messages,
      requests,
      live: { requestId: 42, text: rows.text, late: false },
      stoppedRequestIds: new Set(),
    });
  }

  type Turns = ReturnType<typeof turnsOfRequest>;

  /** jsdom lays nothing out: give the column the sizes a browser would. */
  function size(column: HTMLElement, scrollHeight: number): void {
    Object.defineProperty(column, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(column, 'clientHeight', { configurable: true, value: 400 });
  }

  /** The column while `written` grows to `grown`, with the reader at its end: 900 px of content, scrolled to 900. */
  function mountAtTheEnd(written: Turns, grown: Turns) {
    const view = render(<MessageList turns={written} empty={null} />);
    const column = view.container.firstElementChild as HTMLElement;
    size(column, 900);
    view.rerender(<MessageList turns={grown} empty={null} />);
    expect(column.scrollTop).toBe(900);
    return { ...view, column };
  }

  /** An answer being written, its begun row already read. */
  const writing = (text: string) =>
    turnsOfRequest({ request: requestRow('claimed'), answer: answerRow(), text });

  /** The same answer stored: the text that was on screen, and the tools it used. */
  const stored = () =>
    turnsOfRequest({
      request: requestRow('done'),
      answer: answerRow({ content: MORE_TEXT, tool_calls: USED, finished: true }),
      text: MORE_TEXT,
    });

  it('keeps the "Used:" line in view when it arrives under text that does not change', () => {
    const { column, container, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));
    expect(container.querySelector('[data-used]')).toBeNull();

    size(column, 930);
    rerender(<MessageList turns={stored()} empty={null} />);

    expect(container.querySelector('[data-answer-text]')).toHaveTextContent(MORE_TEXT);
    expect(container.querySelector('[data-used]')).toHaveTextContent('Used: search_materials · IST.323');
    expect(column.scrollTop).toBe(930);
  });

  it('keeps the end in view when the tier badge arrives over text that is already there', () => {
    // The first deltas can reach the page before it has read the row `workspace_begin()` wrote.
    const unread = (text: string) => turnsOfRequest({ request: requestRow('claimed'), text });
    const { column, container, rerender } = mountAtTheEnd(unread(LIVE_TEXT), unread(MORE_TEXT));
    expect(container.querySelector('[data-tier]')).toBeNull();

    size(column, 930);
    rerender(<MessageList turns={writing(MORE_TEXT)} empty={null} />);

    expect(container.querySelector('[data-tier]')).toHaveTextContent('Sonnet · standard');
    expect(column.scrollTop).toBe(930);
  });

  it.each([
    ['the stopped sentence', 'cancelled', 'cancelled'],
    ['an error sentence', 'failed', 'timeout'],
  ] as const)('keeps %s in view when it arrives under a partial answer', (_name, state, code) => {
    const { column, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));

    size(column, 940);
    rerender(
      <MessageList
        turns={turnsOfRequest({
          request: requestRow(state, { error_code: code }),
          answer: answerRow({ content: MORE_TEXT, finished: true, error_code: code }),
          text: MORE_TEXT,
        })}
        empty={null}
      />,
    );

    expect(screen.getByText(labels.ERROR_SENTENCES[code])).toBeInTheDocument();
    expect(column.scrollTop).toBe(940);
  });

  it('does not pull the column down for the stored row once the reader has scrolled up', () => {
    const { column, container, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));
    column.scrollTop = 100;
    fireEvent.scroll(column);

    size(column, 930);
    rerender(<MessageList turns={stored()} empty={null} />);

    expect(container.querySelector('[data-used]')).not.toBeNull();
    expect(column.scrollTop).toBe(100);
  });

  it('leaves a reader a few lines above the end where they are when nothing has grown', () => {
    const { column, rerender } = mountAtTheEnd(writing(LIVE_TEXT), writing(MORE_TEXT));
    // 20 px from the end: still following, and not to be moved by a render that adds nothing.
    column.scrollTop = 480;
    fireEvent.scroll(column);

    rerender(<MessageList turns={writing(MORE_TEXT)} empty={null} />);

    expect(column.scrollTop).toBe(480);
  });
});
