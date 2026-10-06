/**
 * bb2dash — the Workspace thread, as pure functions (Phase 21, task 16).
 *
 * A conversation is three lists the page reads separately: the stored messages,
 * the requests, and the live stream of the one request still being written.
 * `buildTurns` joins them into what the message column shows, by the Contract's
 * rules (brief 102, "States, in words"):
 *
 *   * THE STATE under a question comes from its `workspace_requests` row
 *     (`queued`, `claimed`, `done`, `failed`, `cancelled`; in words: queued,
 *     streaming, done, failed, stopped), joined to the assistant message by
 *     `request_id` when one exists. Request ids are numbers on both sides.
 *   * THE SENTENCE of a failed request is chosen by the request row's
 *     `error_code`, so a failed or cancelled request with no assistant row
 *     still says why, under the question.
 *   * THE TEXT is the stored content once the assistant row is finished, and
 *     the live stream until then. The stored row is the record: it replaces
 *     whatever the stream showed, text held back behind a gap included.
 *
 * Nothing here reads a clock, the cache or the DOM.
 */

import type {
  WorkspaceErrorCode,
  WorkspaceMessage,
  WorkspaceRequest,
  WorkspaceRequestState,
  WorkspaceToolCall,
} from '@/lib/queries.workspace';
import {
  ERROR_SENTENCES,
  LATE_STREAM_LINE,
  QUEUED_LINE,
  STOPPED_SENTENCE,
  USED_PREFIX,
} from '@/lib/workspace-labels';

/** The Contract's five states, in its words. */
export type TurnState = 'queued' | 'streaming' | 'done' | 'failed' | 'stopped';

/** The live half of the one request the page follows. */
export interface LiveStream {
  requestId: number;
  /** The contiguous run from seq 1, joined; empty when nothing arrived or the stream is late. */
  text: string;
  /** Deltas arrived and the lowest is not seq 1. */
  late: boolean;
}

/** One question with what is known of its answer. */
export interface WorkspaceTurn {
  /** Unique in the thread: the question's id, or the row that stands alone. */
  key: string;
  /** The user row; null for a request or an answer whose question row was not read. */
  question: WorkspaceMessage | null;
  request: WorkspaceRequest | null;
  /** The assistant row, finished or not; null before `workspace_begin()`. */
  answer: WorkspaceMessage | null;
  /** Null while the request row is not known. */
  state: TurnState | null;
  /** The answer's text: stored when finished, else live. */
  text: string;
  /** The line under the turn: queued, late-stream, or an error sentence; null when none applies. */
  line: string | null;
}

export interface BuildTurnsInput {
  /** Oldest first, as the messages query orders them. */
  messages: readonly WorkspaceMessage[];
  /** In id order, as the requests query orders them. */
  requests: readonly WorkspaceRequest[];
  live: LiveStream | null;
  /** Requests Stop was pressed on, before the database has answered. */
  stoppedRequestIds: ReadonlySet<number>;
}

const STATE_IN_WORDS: Readonly<Record<WorkspaceRequestState, TurnState>> = {
  queued: 'queued',
  claimed: 'streaming',
  done: 'done',
  failed: 'failed',
  cancelled: 'stopped',
};

const OPEN_STATES: readonly WorkspaceRequestState[] = ['queued', 'claimed'];

/** A failed request that carries no code reads as the runner's own catch-all. */
const UNRECOGNISED_FAILURE: WorkspaceErrorCode = 'cli_error';

/* ---------------------------------------------------------------------------
 * One turn
 * ------------------------------------------------------------------------ */

function stateOf(
  request: WorkspaceRequest | null,
  stoppedRequestIds: ReadonlySet<number>,
): TurnState | null {
  if (request === null) return null;
  // Stop shows at once, but only over an open row: a request that had already
  // finished stays finished.
  if (stoppedRequestIds.has(request.id) && OPEN_STATES.includes(request.state)) return 'stopped';
  return STATE_IN_WORDS[request.state];
}

function isStored(answer: WorkspaceMessage | null): answer is WorkspaceMessage {
  return answer !== null && answer.finished;
}

function lineOf(turn: Omit<WorkspaceTurn, 'key' | 'line'>, live: LiveStream | null): string | null {
  const { state, request, answer, text } = turn;
  switch (state) {
    case 'queued':
      if (text !== '') return null;
      return live?.late ? LATE_STREAM_LINE : QUEUED_LINE;
    case 'streaming':
      return text === '' ? LATE_STREAM_LINE : null;
    case 'done':
      // Done, and the stored row is still on its way: not blank, and not a guess.
      return isStored(answer) || text !== '' ? null : LATE_STREAM_LINE;
    case 'failed':
      return ERROR_SENTENCES[request?.error_code ?? answer?.error_code ?? UNRECOGNISED_FAILURE];
    case 'stopped':
      return STOPPED_SENTENCE;
    default:
      // No request row: an answer that stands alone still says how it ended.
      return answer?.error_code ? ERROR_SENTENCES[answer.error_code] : null;
  }
}

interface TurnParts {
  key: string;
  question: WorkspaceMessage | null;
  request: WorkspaceRequest | null;
  answer: WorkspaceMessage | null;
}

function turnOf(parts: TurnParts, input: BuildTurnsInput): WorkspaceTurn {
  const { request, answer } = parts;
  const live = request !== null && input.live?.requestId === request.id ? input.live : null;
  const body = {
    question: parts.question,
    request,
    answer,
    state: stateOf(request, input.stoppedRequestIds),
    text: isStored(answer) ? answer.content : (live?.text ?? ''),
  };
  return { key: parts.key, ...body, line: lineOf(body, live) };
}

/* ---------------------------------------------------------------------------
 * The thread
 * ------------------------------------------------------------------------ */

/** Each request's assistant row, by request id. */
function answersByRequest(messages: readonly WorkspaceMessage[]): Map<number, WorkspaceMessage> {
  const out = new Map<number, WorkspaceMessage>();
  for (const message of messages) {
    if (message.role === 'assistant' && message.request_id !== null) {
      out.set(message.request_id, message);
    }
  }
  return out;
}

/** Each question's request row, by the question's id. */
function requestsByQuestion(requests: readonly WorkspaceRequest[]): Map<string, WorkspaceRequest> {
  const out = new Map<string, WorkspaceRequest>();
  for (const request of requests) {
    if (request.user_message_id !== null) out.set(request.user_message_id, request);
  }
  return out;
}

/**
 * The message column: one turn per question, in order. A row that does not pair
 * up is kept, never dropped: an assistant row with no request row stands in
 * its place, and a request whose question row was not read comes last.
 */
export function buildTurns(input: BuildTurnsInput): WorkspaceTurn[] {
  const answers = answersByRequest(input.messages);
  const byQuestion = requestsByQuestion(input.requests);
  const paired = new Set<number>();
  const turns: WorkspaceTurn[] = [];

  for (const message of input.messages) {
    if (message.role === 'user') {
      const request = byQuestion.get(message.id) ?? null;
      const answer = request === null ? null : (answers.get(request.id) ?? null);
      if (request !== null) paired.add(request.id);
      turns.push(turnOf({ key: message.id, question: message, request, answer }, input));
    }
  }

  const placed = new Set(turns.flatMap((turn) => (turn.answer === null ? [] : [turn.answer.id])));
  const alone = input.messages.filter(
    (message) => message.role === 'assistant' && !placed.has(message.id),
  );
  const unasked = input.requests.filter((request) => !paired.has(request.id));

  return [
    ...withAnswersInPlace(turns, alone, input),
    ...unasked.map((request) => {
      const answer = answers.get(request.id) ?? null;
      return turnOf({ key: `request-${request.id}`, question: null, request, answer }, input);
    }),
  ];
}

/**
 * `turns` with each stand-alone assistant row put back where the messages list
 * has it: after the last question that comes before it.
 */
function withAnswersInPlace(
  turns: readonly WorkspaceTurn[],
  alone: readonly WorkspaceMessage[],
  input: BuildTurnsInput,
): WorkspaceTurn[] {
  if (alone.length === 0) return [...turns];
  const position = new Map(input.messages.map((message, index) => [message.id, index]));
  const standing = alone.map((answer) =>
    turnOf({ key: answer.id, question: null, request: null, answer }, input),
  );
  return [...turns, ...standing].sort(
    (left, right) => (position.get(left.key) ?? 0) - (position.get(right.key) ?? 0),
  );
}

/**
 * The request whose live text the page still needs: the newest one, until its
 * stored answer has landed. An open request is followed; so is one that has
 * just finished or been stopped, for the moment before its row arrives, so the
 * text on screen does not blink out between the two.
 */
export function liveRequestOf(
  requests: readonly WorkspaceRequest[],
  messages: readonly WorkspaceMessage[],
): WorkspaceRequest | null {
  const newest = requests.at(-1) ?? null;
  if (newest === null) return null;
  return isStored(answersByRequest(messages).get(newest.id) ?? null) ? null : newest;
}

/* ---------------------------------------------------------------------------
 * The "Used:" line
 * ------------------------------------------------------------------------ */

/** Sits between a tool and its scope. */
const SCOPE_SEPARATOR = ' · ';

/**
 * "Used: tool · scope, tool": only the `ok: true` calls, in call order, an
 * identical entry once; null when there are none. The stored `query` is not
 * shown, and a tool's result is never stored at all, so no raw `[notes]`
 * speaker-note slice can reach the screen through this line.
 */
export function usedLine(toolCalls: readonly WorkspaceToolCall[]): string | null {
  const entries: string[] = [];
  for (const call of toolCalls) {
    if (!call.ok) continue;
    const entry = call.scope ? `${call.tool}${SCOPE_SEPARATOR}${call.scope}` : call.tool;
    if (!entries.includes(entry)) entries.push(entry);
  }
  return entries.length === 0 ? null : `${USED_PREFIX} ${entries.join(', ')}`;
}
