/**
 * What the Workspace screen reads again, and when (Phase 21, wave 2b; the PM's
 * ruling U1 of 2026-10-06).
 *
 * THE STATUS, AT ONCE, WHEN THE SERVICE IS SEEN ANSWERING. The offline line is
 * said from a status row that is re-read every 30 s. A service that has just
 * come back claims a waiting question and streams its answer inside those
 * 30 s, so "The Workspace service is offline." could sit beside text that is
 * arriving. The status is therefore re-read at the two moments the page learns
 * the service is answering: a request in view becomes `claimed`, and its first
 * delta arrives.
 *
 * THE MESSAGES, EVERY 5 S FOR UP TO 60 S AFTER A REQUEST CLOSES WITH ITS ANSWER
 * UNSTORED (the review round's ruling V4, CR-9, which replaces U1's two timers
 * at about 3 s and about 10 s). The runner sees the cancel within seconds and
 * stores what it had written. That row reaches the page at its `done`
 * broadcast; if the broadcast is missed, the poll brings it. The poll is
 * decided from the rows (the newest request closed, its assistant row
 * unfinished), not from what the page held when Stop was pressed, and it ends
 * by itself: when the stored row lands, or 60 s after the page first saw the
 * request so. A stopped request with no assistant row has no runner and no
 * partial answer, so nothing is polled for it.
 *
 * Every case runs on a fake clock with the tab in front, so the only reads are
 * the ones the page asks for: nothing here waits on a real timer.
 */

import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newQueryClient } from './hydration-harness';
import { fake, resetFake, type FakeChannel, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const { Workspace } = await import('@/app/(app)/workspace/Workspace');

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const TOPIC_A = `workspace:${A}`;
const QUESTION = 'c9a7d3e2-55aa-4f10-b1d2-7e8f9a0b1c2d';
const REQUEST = 42;
const START = Date.parse('2026-10-06T15:00:00Z');
const FIVE_MINUTES_MS = 5 * 60_000;
const OFFLINE = 'The Workspace service is offline.';

const QUESTION_ROW: Row = {
  id: QUESTION,
  conversation_id: A,
  role: 'user',
  content: 'Draft a two-week study plan.',
  finished: true,
};

function requestRow(state: string, fields: Row = {}): Row {
  return { id: REQUEST, conversation_id: A, user_message_id: QUESTION, state, ...fields };
}

/** The one row of `v_workspace_status`, with a heartbeat at `atMs`. */
function heartbeat(atMs: number): Row[] {
  return [{ polled_at: new Date(atMs).toISOString(), runner: 'workspace-1', open_requests: 1 }];
}

/** Move the fake clock, letting every timer and promise in between run. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function reads(table: string): number {
  return fake.state.log.filter((entry) => entry === `from:${table}`).length;
}

const statusReads = () => reads('v_workspace_status');

/** The screen on conversation A, once its first reads have answered and its channel is open. */
async function open() {
  fake.state.search = `c=${A}`;
  const view = render(
    <QueryClientProvider client={newQueryClient()}>
      <Workspace />
    </QueryClientProvider>,
  );
  await advance(100);
  const channel = fake.state.channels.findLast((candidate) => candidate.topic === TOPIC_A);
  if (!channel) throw new Error(`no channel on ${TOPIC_A}`);
  return { ...view, channel };
}

function turn(container: HTMLElement): HTMLElement {
  const found = container.querySelector(`li[data-turn][data-request-id="${REQUEST}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no turn for request ${REQUEST}`);
  return found;
}

function emitDelta(channel: FakeChannel, seq: number, delta: string): void {
  act(() => channel.emit('delta', { request_id: REQUEST, seq, delta }));
}

beforeEach(() => {
  resetFake();
  vi.useFakeTimers({ now: START });
  focusManager.setFocused(true);
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe('the status is read again at once when the service is seen answering', () => {
  /** One question waits, and the service's last heartbeat is five minutes old. */
  function seedWaitingOffline(): void {
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW],
      workspace_requests: [requestRow('queued')],
      v_workspace_status: heartbeat(START - FIVE_MINUTES_MS),
    };
  }

  /** The service returns: it beats, and it claims the question. */
  function serviceReturns(): void {
    fake.state.rows = {
      ...fake.state.rows,
      workspace_requests: [requestRow('claimed')],
      v_workspace_status: heartbeat(Date.now()),
    };
  }

  it('re-reads it when a request in view becomes claimed: the offline line goes without waiting 30 s', async () => {
    seedWaitingOffline();
    const { container } = await open();
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
    expect(turn(container)).toHaveAttribute('data-turn', 'queued');
    const before = statusReads();

    await advance(1_000);
    serviceReturns();

    // 5.2 s in: the requests poll (every 5 s) has shown the claim. The status poll is not
    // due until 30 s, and no broadcast has arrived.
    await advance(4_100);

    expect(turn(container)).toHaveAttribute('data-turn', 'streaming');
    expect(statusReads()).toBe(before + 1);
    expect(screen.queryByText(OFFLINE)).toBeNull();
  });

  it.each([
    ['its first delta, seq 1', 1, 'Week one: '],
    ['the first delta of a stream joined late, seq 5', 5, 'Tuesday'],
  ])('re-reads it when %s arrives, and not again for the next one', async (_label, seq, delta) => {
    seedWaitingOffline();
    const { container, channel } = await open();
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
    const before = statusReads();

    // The service is back and answering; this page's own poll of the request is seconds away.
    serviceReturns();
    emitDelta(channel, seq, delta);
    await advance(100);

    // The row on the page still reads queued: it is the delta that told it.
    expect(turn(container)).toHaveAttribute('data-turn', 'queued');
    expect(statusReads()).toBe(before + 1);
    expect(screen.queryByText(OFFLINE)).toBeNull();

    emitDelta(channel, seq + 1, ' and more');
    await advance(100);
    expect(statusReads()).toBe(before + 1);

    // The poll then shows the claim, which is the other moment: one more read, and no more.
    await advance(5_000);
    expect(turn(container)).toHaveAttribute('data-turn', 'streaming');
    expect(statusReads()).toBe(before + 2);
    await advance(10_000);
    expect(statusReads()).toBe(before + 2);
  });

  it('does not re-read it for a request that only waits', async () => {
    seedWaitingOffline();
    await open();
    const before = statusReads();

    // Four polls of the request, all queued. The status keeps its own 30 s.
    await advance(20_000);

    expect(statusReads()).toBe(before);
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
  });
});

describe('after a request closes with its answer unstored the messages are polled every 5 s, for up to 60 s', () => {
  const ANSWER = 'a7c1d2e3-55aa-4f10-b1d2-7e8f9a0b1c2d';
  const STOPPED = 'You stopped this answer.';
  const messageReads = () => reads('workspace_messages');

  function answerRow(fields: Row): Row {
    return { id: ANSWER, conversation_id: A, role: 'assistant', request_id: REQUEST, tier: 'high', ...fields };
  }

  /** An answer being written: the runner has claimed the request and begun its row. */
  function seedAnswering(): void {
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW, answerRow({ content: '', finished: false })],
      workspace_requests: [requestRow('claimed')],
      v_workspace_status: heartbeat(START),
    };
  }

  /**
   * The runner sees the cancel and stores what it had written: more than this page
   * received. Its `done` broadcast is never delivered in these cases.
   */
  function runnerStoresPartial(): void {
    fake.state.rows = {
      ...fake.state.rows,
      workspace_messages: [
        QUESTION_ROW,
        answerRow({ content: 'Week one: Monday', finished: true, error_code: 'cancelled' }),
      ],
    };
  }

  function answerText(container: HTMLElement): string | null {
    return turn(container).querySelector('[data-answer-text]')?.textContent ?? null;
  }

  function lineOf(container: HTMLElement): string | null {
    return turn(container).querySelector('[data-turn-line]')?.textContent ?? null;
  }

  /** The screen with one delta on it, Stop pressed, and the cancel answered. */
  async function stopMidAnswer() {
    seedAnswering();
    const view = await open();
    emitDelta(view.channel, 1, 'Week one: ');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await advance(100);
    expect(fake.state.rows.workspace_requests[0]).toMatchObject({ state: 'cancelled' });
    expect(lineOf(view.container)).toBe(STOPPED);
    expect(answerText(view.container)).toBe('Week one: ');
    return view;
  }

  it('shows the stored partial answer at the next poll when its done broadcast is missed, and then stops polling', async () => {
    const { container } = await stopMidAnswer();
    const before = messageReads();

    await advance(1_900); // 2.0 s after the press
    runnerStoresPartial();
    await advance(2_000); // 4.0 s: no poll yet
    expect(messageReads()).toBe(before);
    expect(answerText(container)).toBe('Week one: ');

    await advance(1_300); // 5.3 s: the first poll
    expect(messageReads()).toBe(before + 1);
    expect(answerText(container)).toBe('Week one: Monday');
    expect(lineOf(container)).toBe(STOPPED);
    expect(screen.getByRole('button', { name: 'Ask' })).toBeInTheDocument();

    // The stored row has landed: nothing is owed, and a minute on nothing more was read.
    await advance(60_000);
    expect(messageReads()).toBe(before + 1);
  });

  it('keeps polling for a runner that stores it later than 10 s', async () => {
    const { container } = await stopMidAnswer();

    await advance(11_900); // 12.0 s after the press: the polls at 5 s and 10 s brought the unfinished row
    expect(answerText(container)).toBe('Week one: ');
    expect(lineOf(container)).toBe(STOPPED);
    runnerStoresPartial();

    await advance(3_400); // 15.4 s: the third poll
    expect(answerText(container)).toBe('Week one: Monday');
    expect(lineOf(container)).toBe(STOPPED);
  });

  it('polls when Stop was pressed on a row the page still read as queued, and the runner had begun', async () => {
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW],
      workspace_requests: [requestRow('queued')],
      v_workspace_status: heartbeat(START),
    };
    const { container } = await open();
    expect(turn(container)).toHaveAttribute('data-turn', 'queued');

    // Between two polls the runner claims the request and begins its row. This page has not read either.
    fake.state.rows = {
      ...fake.state.rows,
      workspace_messages: [QUESTION_ROW, answerRow({ content: '', finished: false })],
      workspace_requests: [requestRow('claimed')],
    };
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await advance(100);
    expect(fake.state.rows.workspace_requests[0]).toMatchObject({ state: 'cancelled' });
    expect(lineOf(container)).toBe(STOPPED);

    await advance(1_900); // 2.0 s after the press
    runnerStoresPartial();
    await advance(3_400); // 5.4 s: the first poll

    expect(answerText(container)).toBe('Week one: Monday');
    expect(lineOf(container)).toBe(STOPPED);
  });

  it('stops by itself 60 s after the close when the stored row never comes', async () => {
    await stopMidAnswer();
    const before = messageReads();

    await advance(30_000);
    const atHalf = messageReads();
    // About one read every 5 s, not two reads and silence.
    expect(atHalf - before).toBeGreaterThanOrEqual(5);
    expect(atHalf - before).toBeLessThanOrEqual(6);

    await advance(40_000); // 70 s after the press: the 60 s have passed
    const atEnd = messageReads();
    expect(atEnd - before).toBeGreaterThanOrEqual(11);
    expect(atEnd - before).toBeLessThanOrEqual(13);

    await advance(5 * 60_000);
    expect(messageReads()).toBe(atEnd);
  });

  it('reads nothing again after Stop on a queued request: no runner holds a partial answer', async () => {
    fake.state.rows = {
      workspace_messages: [QUESTION_ROW],
      workspace_requests: [requestRow('queued')],
      v_workspace_status: heartbeat(START),
    };
    const { container } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await advance(100);
    expect(lineOf(container)).toBe(STOPPED);
    const before = messageReads();

    await advance(15_000);

    expect(messageReads()).toBe(before);
  });

  it('stops polling when the page leaves the conversation', async () => {
    const view = await stopMidAnswer();
    const before = messageReads();

    view.unmount();
    await advance(15_000);

    expect(messageReads()).toBe(before);
  });
});
