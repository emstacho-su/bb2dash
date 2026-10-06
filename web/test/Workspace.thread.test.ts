/**
 * The Workspace thread, as pure functions (Phase 21, task 16).
 *
 * `Workspace.test.tsx` reads the mounted screen; this sibling holds the rules
 * the screen is built from, in `web/src/components/workspace/thread.ts`:
 *
 *   * the state under a question comes from its `workspace_requests` row,
 *     joined to the assistant message by `request_id` when one exists;
 *   * the sentence of a failed or cancelled request comes from the request
 *     row's `error_code`, with or without an assistant row;
 *   * a stored answer replaces the stream; text past a gap never shows;
 *   * the "Used:" line lists only the `ok: true` calls, each entry once.
 */

import { describe, expect, it } from 'vitest';
import { buildTurns, liveRequestOf, usedLine } from '@/components/workspace/thread';
import {
  WORKSPACE_ERROR_CODES,
  normalizeMessage,
  normalizeRequest,
  type WorkspaceMessage,
  type WorkspaceRequest,
} from '@/lib/queries.workspace';
import {
  ERROR_SENTENCES,
  LATE_STREAM_LINE,
  QUEUED_LINE,
  STOPPED_SENTENCE,
} from '@/lib/workspace-labels';

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const NONE: ReadonlySet<number> = new Set();

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function question(n: number, content = 'a question'): WorkspaceMessage {
  const row = normalizeMessage({ id: uuid(n), conversation_id: A, role: 'user', content, finished: true });
  if (row === null) throw new Error('bad question fixture');
  return row;
}

function answer(n: number, requestId: number, fields: Record<string, unknown> = {}): WorkspaceMessage {
  const row = normalizeMessage({
    id: uuid(n),
    conversation_id: A,
    role: 'assistant',
    request_id: requestId,
    tier: 'low',
    content: '',
    finished: true,
    ...fields,
  });
  if (row === null) throw new Error('bad answer fixture');
  return row;
}

function request(id: number, questionN: number, state: string, errorCode: string | null = null): WorkspaceRequest {
  const row = normalizeRequest({
    id,
    conversation_id: A,
    user_message_id: uuid(questionN),
    state,
    error_code: errorCode,
  });
  if (row === null) throw new Error('bad request fixture');
  return row;
}

/** The one turn of a one-question conversation. */
function turn(
  messages: WorkspaceMessage[],
  requests: WorkspaceRequest[],
  live: { requestId: number; text: string; late: boolean } | null = null,
  stopped: ReadonlySet<number> = NONE,
) {
  const turns = buildTurns({ messages, requests, live, stoppedRequestIds: stopped });
  expect(turns).toHaveLength(1);
  return turns[0];
}

describe('buildTurns: the state under a question comes from its request row', () => {
  it.each([
    ['queued', 'queued', QUEUED_LINE],
    ['claimed', 'streaming', LATE_STREAM_LINE],
    ['cancelled', 'stopped', STOPPED_SENTENCE],
  ])('reads %s as %s', (rowState, state, line) => {
    expect(turn([question(1)], [request(42, 1, rowState)])).toMatchObject({ state, line, text: '' });
  });

  it('reads done with its stored answer as done, with no line', () => {
    const stored = answer(2, 42, { content: 'Quiz 2.' });
    expect(turn([question(1), stored], [request(42, 1, 'done')])).toMatchObject({
      state: 'done',
      line: null,
      text: 'Quiz 2.',
      answer: stored,
    });
  });

  it('joins the assistant message by request id, as numbers on both sides', () => {
    const turns = buildTurns({
      messages: [question(1), answer(2, 41, { content: 'first' }), question(3), answer(4, 42, { content: 'second' })],
      requests: [request(41, 1, 'done'), request(42, 3, 'done')],
      live: null,
      stoppedRequestIds: NONE,
    });

    expect(turns.map((each) => [each.request?.id, each.text])).toEqual([
      [41, 'first'],
      [42, 'second'],
    ]);
  });

  it('shows nothing under a question whose request row has not been read yet', () => {
    expect(turn([question(1)], [])).toMatchObject({ request: null, state: null, line: null, text: '' });
  });
});

describe('buildTurns: one sentence per error code, chosen by the request row', () => {
  it.each(WORKSPACE_ERROR_CODES.filter((code) => code !== 'cancelled'))(
    'says the sentence for %s, with an assistant row and without one',
    (code) => {
      const withRow = turn([question(1), answer(2, 42, { error_code: code })], [request(42, 1, 'failed', code)]);
      const without = turn([question(1)], [request(42, 1, 'failed', code)]);

      expect(withRow).toMatchObject({ state: 'failed', line: ERROR_SENTENCES[code] });
      expect(without).toMatchObject({ state: 'failed', line: ERROR_SENTENCES[code], answer: null });
    },
  );

  it('prefers the request row`s code to the message`s', () => {
    expect(
      turn([question(1), answer(2, 42, { error_code: 'cli_error' })], [request(42, 1, 'failed', 'timeout')]).line,
    ).toBe(ERROR_SENTENCES.timeout);
  });

  it('falls back to the message`s code, then to the sentence for an unrecognised failure', () => {
    expect(
      turn([question(1), answer(2, 42, { error_code: 'usage_limit' })], [request(42, 1, 'failed')]).line,
    ).toBe(ERROR_SENTENCES.usage_limit);
    expect(turn([question(1)], [request(42, 1, 'failed')]).line).toBe(ERROR_SENTENCES.cli_error);
  });

  it('says the stopped sentence for a cancelled request, with a partial answer or with no row', () => {
    const partial = answer(2, 42, { content: 'Week 1: ', error_code: 'cancelled' });
    expect(turn([question(1), partial], [request(42, 1, 'cancelled', 'cancelled')])).toMatchObject({
      state: 'stopped',
      line: STOPPED_SENTENCE,
      text: 'Week 1: ',
    });
    expect(turn([question(1)], [request(42, 1, 'cancelled', 'cancelled')])).toMatchObject({
      state: 'stopped',
      line: STOPPED_SENTENCE,
      text: '',
    });
  });

  it('says the stopped sentence at once for a request Stop was pressed on', () => {
    const pressed = new Set([42]);
    expect(turn([question(1)], [request(42, 1, 'queued')], null, pressed)).toMatchObject({
      state: 'stopped',
      line: STOPPED_SENTENCE,
    });
    expect(turn([question(1)], [request(42, 1, 'claimed')], null, pressed).state).toBe('stopped');
  });

  it('lets the row win when Stop came too late: a finished request stays finished', () => {
    const stored = answer(2, 42, { content: 'Quiz 2.' });
    expect(turn([question(1), stored], [request(42, 1, 'done')], null, new Set([42]))).toMatchObject({
      state: 'done',
      line: null,
      text: 'Quiz 2.',
    });
  });
});

describe('buildTurns: the stream, then the stored row', () => {
  const live = (text: string, late = false) => ({ requestId: 42, text, late });

  it('shows the live text of the followed request, and no line beside it', () => {
    expect(turn([question(1)], [request(42, 1, 'claimed')], live('The syllabus'))).toMatchObject({
      state: 'streaming',
      text: 'The syllabus',
      line: null,
    });
  });

  it('shows text that arrives while the row still reads queued', () => {
    expect(turn([question(1)], [request(42, 1, 'queued')], live('spike-ok 1'))).toMatchObject({
      state: 'queued',
      text: 'spike-ok 1',
      line: null,
    });
  });

  it('shows only the late-stream line for a stream joined late, queued or claimed', () => {
    expect(turn([question(1)], [request(42, 1, 'claimed')], live('', true))).toMatchObject({
      text: '',
      line: LATE_STREAM_LINE,
    });
    expect(turn([question(1)], [request(42, 1, 'queued')], live('', true)).line).toBe(LATE_STREAM_LINE);
  });

  it('ignores the live text of another request', () => {
    const other = { requestId: 41, text: 'not this one', late: false };
    expect(turn([question(1)], [request(42, 1, 'claimed')], other)).toMatchObject({
      text: '',
      line: LATE_STREAM_LINE,
    });
  });

  it('lets the stored row take over: a finished answer is shown, never the stream', () => {
    const stored = answer(2, 42, { content: 'abcd' });
    // The stream held "ab" behind a gap; the stored row is the whole answer.
    expect(turn([question(1), stored], [request(42, 1, 'claimed')], live('ab')).text).toBe('abcd');
    expect(turn([question(1), stored], [request(42, 1, 'done')], live('ab')).text).toBe('abcd');
  });

  it('keeps the live text while the row is done and the stored answer has not landed', () => {
    const unfinished = answer(2, 42, { finished: false });
    expect(turn([question(1), unfinished], [request(42, 1, 'done')], live('The syllabus'))).toMatchObject({
      state: 'done',
      text: 'The syllabus',
      line: null,
    });
    expect(turn([question(1), unfinished], [request(42, 1, 'done')]).line).toBe(LATE_STREAM_LINE);
  });

  it('keeps the partial text under the stopped sentence until the stored row lands', () => {
    const unfinished = answer(2, 42, { finished: false, tier: 'high' });
    expect(
      turn([question(1), unfinished], [request(42, 1, 'cancelled', 'cancelled')], live('Week 1: ')),
    ).toMatchObject({ state: 'stopped', text: 'Week 1: ', line: STOPPED_SENTENCE });
  });
});

describe('buildTurns: rows that do not pair up', () => {
  it('gives a request with no question row its own turn, after the others', () => {
    const turns = buildTurns({
      messages: [question(1), answer(2, 41, { content: 'first' })],
      requests: [request(41, 1, 'done'), request(42, 9, 'queued')],
      live: { requestId: 42, text: 'spike-ok 1', late: false },
      stoppedRequestIds: NONE,
    });

    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({ question: null, state: 'queued', text: 'spike-ok 1' });
  });

  it('gives an assistant row with no request row its own turn, in place', () => {
    const orphan = answer(2, 77, { content: 'kept', error_code: 'timeout' });
    const turns = buildTurns({
      messages: [question(1), orphan, question(3)],
      requests: [],
      live: null,
      stoppedRequestIds: NONE,
    });

    expect(turns.map((each) => each.key)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(turns[1]).toMatchObject({ question: null, answer: orphan, text: 'kept', line: ERROR_SENTENCES.timeout });
  });

  it('gives every turn its own key', () => {
    const turns = buildTurns({
      messages: [question(1), question(3)],
      requests: [request(41, 1, 'done'), request(42, 3, 'queued'), request(43, 9, 'failed')],
      live: null,
      stoppedRequestIds: NONE,
    });

    expect(new Set(turns.map((each) => each.key)).size).toBe(turns.length);
  });
});

describe('liveRequestOf: the request whose stream the page still needs', () => {
  it('is the open request', () => {
    const open = request(42, 3, 'claimed');
    expect(liveRequestOf([request(41, 1, 'done'), open], [question(1), question(3)])).toBe(open);
  });

  it('is the newest request until its stored answer has landed', () => {
    const newest = request(42, 1, 'done');
    expect(liveRequestOf([newest], [question(1), answer(2, 42, { finished: false })])).toBe(newest);
    expect(liveRequestOf([newest], [question(1), answer(2, 42, { content: 'stored' })])).toBeNull();
  });

  it('is nothing for a conversation with no request', () => {
    expect(liveRequestOf([], [])).toBeNull();
  });
});

describe('usedLine: the tools an answer used', () => {
  const call = (tool: string, scope: string | null, ok = true) => ({ tool, query: 'never shown', scope, ok });

  it('lists the ok calls as "tool · scope", or "tool" alone, joined with ", " in call order', () => {
    expect(
      usedLine([
        call('search_context', 'bb2dash-inbox-decisions'),
        call('list_courses', null),
        call('get_material_text', '2489'),
      ]),
    ).toBe('Used: search_context · bb2dash-inbox-decisions, list_courses, get_material_text · 2489');
  });

  it('shows an identical entry once, and keeps the same tool under another scope', () => {
    expect(
      usedLine([
        call('search_materials', 'IST.323'),
        call('search_materials', 'IST.323'),
        call('search_materials', 'ECN.304'),
        call('search_materials', null),
      ]),
    ).toBe('Used: search_materials · IST.323, search_materials · ECN.304, search_materials');
  });

  it('leaves out failed and denied calls', () => {
    expect(usedLine([call('search_context', 'stack', false), call('list_courses', null)])).toBe(
      'Used: list_courses',
    );
  });

  it('is absent when there are none', () => {
    expect(usedLine([])).toBeNull();
    expect(usedLine([call('get_document', null, false)])).toBeNull();
  });

  it('never shows the stored query', () => {
    expect(usedLine([call('search_materials', 'IST.323')])).not.toContain('never shown');
  });
});
