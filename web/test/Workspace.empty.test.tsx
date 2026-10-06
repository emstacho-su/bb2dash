/**
 * The message column with no turn to show, and an unknown `?c=` (Phase 21,
 * wave 2b; the PM's ruling U1 of 2026-10-06).
 *
 * The column used to be an empty box in three different states. Each now has
 * its own line (PM wording, held word for word in `workspace-labels.test.ts`):
 *
 *   * no conversation selected: "Ask a question to start a conversation.";
 *   * rows still being read: "Loading the conversation…";
 *   * a `?c=` uuid that has no rows: "This conversation was not found.", with
 *     the "New conversation" link beside it.
 *
 * A conversation that was not found is not asked into: the composer sends
 * nothing. And the database's own sentence about the foreign key is never
 * shown: SQLSTATE 23503 from `workspace_ask` says the same not-found line.
 *
 * The text box has a visible placeholder in every state.
 *
 * The pure rule is `emptyColumnOf()` (`Workspace.thread.test.ts`); this file
 * reads the mounted screen over the fake client in `workspace-harness.tsx`.
 */

import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import {
  NEW_CONVERSATION,
  fake,
  gate,
  joined,
  resetFake,
  settle,
  type Row,
} from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const labels = await import('@/lib/workspace-labels');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

/** A conversation that exists. */
const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
/** A uuid no row carries: typed by hand, a stale link, or another owner's. */
const UNKNOWN = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';

const START = 'Ask a question to start a conversation.';
const LOADING = 'Loading the conversation…';
const NOT_FOUND = 'This conversation was not found.';
const PLACEHOLDER = 'Ask about your courses or your decisions';
const DENIED = { code: '42501', message: 'permission denied' };

/** What Postgres says when `workspace_ask` is given an id that does not exist. Never shown. */
const FOREIGN_KEY = {
  code: '23503',
  message:
    'insert or update on table "workspace_messages" violates foreign key constraint ' +
    '"workspace_messages_conversation_id_fkey"',
};

/** Conversation A with one answered question. */
const ANSWERED_ROWS: Record<string, Row[]> = {
  workspace_messages: [
    { id: QUESTION, conversation_id: A, role: 'user', content: 'What is due?', finished: true },
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
  workspace_requests: [{ id: 42, conversation_id: A, user_message_id: QUESTION, state: 'done' }],
};

function tree() {
  return (
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>
  );
}

function open(search: string) {
  fake.state.search = search;
  return render(tree());
}

/** The message column's wrapper. */
function column(container: HTMLElement): HTMLElement {
  const area = container.querySelector('[data-workspace-stream]');
  if (!(area instanceof HTMLElement)) throw new Error('no message column on the page');
  return area;
}

/** Which of the three empty states the column is in, or null when it is in none. */
function emptyState(container: HTMLElement): string | null {
  return column(container).querySelector('[data-column-empty]')?.getAttribute('data-column-empty') ?? null;
}

function box(): HTMLElement {
  return screen.getByRole('textbox', { name: labels.QUESTION_FIELD_LABEL });
}

function type(text: string): HTMLElement {
  fireEvent.change(box(), { target: { value: text } });
  return box();
}

function askButton(): HTMLElement {
  return screen.getByRole('button', { name: labels.ASK_LABEL });
}

/** Let the held reads answer. */
async function release(held: { promise: Promise<void>; release: () => void }): Promise<void> {
  await act(async () => {
    held.release();
    await held.promise;
  });
}

/** No sentence of Postgres's about the foreign key is anywhere on the page. */
function expectNoDatabaseSentence(container: HTMLElement): void {
  expect(container.textContent).not.toContain('foreign key');
  expect(container.textContent).not.toContain('violates');
  expect(container.textContent).not.toContain('workspace_messages');
  expect(container.textContent).not.toContain('Could not load this conversation');
  expect(container.textContent).not.toContain('Could not send this question');
}

beforeEach(() => {
  resetFake();
});

describe('the empty message column says which of its three states it is in', () => {
  it.each([
    ['no ?c=', ''],
    ['a ?c= that is not a uuid', 'c=lobby'],
  ])('says to ask a question to start a conversation, with %s', async (_label, search) => {
    const { container } = open(search);
    await joined('workspace:lobby');

    expect(within(column(container)).getByText(START)).toBeInTheDocument();
    expect(emptyState(container)).toBe('start');
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(askButton()).toBeEnabled();
    expect(box()).toBeEnabled();
  });

  it('says it is loading the conversation while the rows are still being read, then shows them', async () => {
    fake.state.rows = ANSWERED_ROWS;
    const held = gate();
    fake.state.readGate = held.promise;
    const { container } = open(`c=${A}`);
    await joined(`workspace:${A}`);

    expect(within(column(container)).getByText(LOADING)).toBeInTheDocument();
    expect(emptyState(container)).toBe('loading');
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(screen.queryByText(START)).toBeNull();

    await release(held);

    expect(await screen.findByText('Quiz 2.')).toBeInTheDocument();
    expect(emptyState(container)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it('says the conversation was not found for a uuid that has no rows, with the "New conversation" link', async () => {
    const { container } = open(`c=${UNKNOWN}`);

    expect(await within(column(container)).findByText(NOT_FOUND)).toBeInTheDocument();
    expect(emptyState(container)).toBe('missing');
    const link = within(column(container)).getByRole('link', { name: 'New conversation' });
    expect(link).toHaveAttribute('href', '/workspace');
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.queryByText(START)).toBeNull();
    // Said to a screen reader as it appears; the link is not part of the sentence.
    expect(screen.getByRole('alert').textContent).toBe(NOT_FOUND);
  });

  it('does not say "not found" before both reads have answered', async () => {
    const held = gate();
    fake.state.readGate = held.promise;
    const { container } = open(`c=${UNKNOWN}`);
    await joined(`workspace:${UNKNOWN}`);
    await settle();

    expect(emptyState(container)).toBe('loading');
    expect(screen.queryByText(NOT_FOUND)).toBeNull();

    await release(held);

    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it('does not say "not found" when the conversation could not be read: the problem line says why', async () => {
    fake.state.readErrors = { workspace_messages: DENIED, workspace_requests: DENIED };
    const { container } = open(`c=${A}`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load this conversation: permission denied',
    );
    expect(emptyState(container)).toBeNull();
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it('says none of the three over a conversation that has rows', async () => {
    fake.state.rows = ANSWERED_ROWS;
    const { container } = open(`c=${A}`);
    await screen.findByText('Quiz 2.');

    expect(emptyState(container)).toBeNull();
    expect(screen.queryByText(START)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
    expect(within(column(container)).queryByRole('link', { name: 'New conversation' })).toBeNull();
  });

  it('reads a conversation a first question has just made: loading, then the question, never "not found"', async () => {
    const view = open('');
    await joined('workspace:lobby');
    type('spike');
    fireEvent.click(askButton());
    await waitFor(() =>
      expect(fake.state.router.replace).toHaveBeenCalledWith(`/workspace?c=${NEW_CONVERSATION}`),
    );

    // The router moved the page to the new conversation.
    view.rerender(tree());

    expect(emptyState(view.container)).toBe('loading');
    expect(await screen.findByText('Waiting for the Workspace service')).toBeInTheDocument();
    expect(emptyState(view.container)).toBeNull();
    expect(screen.queryByText(NOT_FOUND)).toBeNull();
  });
});

describe('the composer does not ask into a conversation that was not found', () => {
  it('sends nothing on Enter or on the button, and keeps what was typed', async () => {
    const held = gate();
    fake.state.readGate = held.promise;
    open(`c=${UNKNOWN}`);
    await joined(`workspace:${UNKNOWN}`);
    // Typed while the rows were still being read.
    type('hello?');

    await release(held);
    await screen.findByText(NOT_FOUND);

    expect(askButton()).toBeDisabled();
    expect(box()).toBeDisabled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.click(askButton());
    await settle();

    expect(fake.state.rpcCalls).toEqual([]);
    expect(box()).toHaveValue('hello?');
    expect(screen.queryByText(labels.REFUSAL_QUESTION_LENGTH)).toBeNull();
  });
});

describe('a 23503 from workspace_ask says the same line, never the database`s sentence', () => {
  it('says the conversation was not found once its id no longer exists, and asks no more into it', async () => {
    fake.state.rows = ANSWERED_ROWS;
    // Gone from the database since the page read it; its rows went with it.
    fake.state.rpc.workspace_ask = () => {
      fake.state.rows = {};
      return { data: null, error: FOREIGN_KEY };
    };
    const { container } = open(`c=${A}`);
    await screen.findByText('Quiz 2.');

    fireEvent.keyDown(type('and next week?'), { key: 'Enter' });

    expect(await within(column(container)).findByText(NOT_FOUND)).toBeInTheDocument();
    expect(within(column(container)).getByRole('link', { name: 'New conversation' })).toHaveAttribute(
      'href',
      '/workspace',
    );
    expectNoDatabaseSentence(container);
    expect(screen.queryByText('Quiz 2.')).toBeNull();
    expect(box()).toHaveValue('and next week?');

    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.click(askButton());
    await settle();
    expect(fake.state.rpcCalls.map((call) => call.fn)).toEqual(['workspace_ask']);
  });

  it('says it from the 23503 alone, while the rows are still being read', async () => {
    const held = gate();
    fake.state.readGate = held.promise;
    fake.state.rpc.workspace_ask = () => ({ data: null, error: FOREIGN_KEY });
    const { container } = open(`c=${UNKNOWN}`);
    await joined(`workspace:${UNKNOWN}`);
    expect(emptyState(container)).toBe('loading');

    fireEvent.keyDown(type('hello?'), { key: 'Enter' });

    expect(await within(column(container)).findByText(NOT_FOUND)).toBeInTheDocument();
    expect(fake.state.rpcCalls).toEqual([
      { fn: 'workspace_ask', args: { p_conversation_id: UNKNOWN, p_text: 'hello?' } },
    ]);
    expect(screen.queryByText(LOADING)).toBeNull();
    expectNoDatabaseSentence(container);
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([NOT_FOUND]);
  });
});

describe('the text box has a visible placeholder', () => {
  it.each([
    ['with no conversation selected', '', {}],
    ['in a conversation', `c=${A}`, ANSWERED_ROWS],
    ['on an id that was not found', `c=${UNKNOWN}`, {}],
  ])('reads "Ask about your courses or your decisions" %s', async (_label, search, rows) => {
    fake.state.rows = rows;
    open(search);
    await settle();

    expect(box()).toHaveAttribute('placeholder', PLACEHOLDER);
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBe(box());
  });
});

describe('on the server', () => {
  it('renders the loading line for a uuid and the start line with none, and never claims "not found"', () => {
    fake.state.search = `c=${UNKNOWN}`;
    const withId = renderToString(tree());
    expect(withId).toContain(LOADING);
    expect(withId).not.toContain(NOT_FOUND);
    expect(withId).not.toContain(START);

    fake.state.search = '';
    const without = renderToString(tree());
    expect(without).toContain(START);
    expect(without).not.toContain(LOADING);
    expect(without).not.toContain(NOT_FOUND);
  });
});
