/**
 * The provider seam (brief 102, Contract, Provider seam). A provider runs one turn and reports it
 * as a stream of events; the runner knows nothing else about where an answer comes from.
 */

import type { ErrorCode } from '../errors.js';

export type ProviderId = 'claude-cli' | 'ollama' | 'frontier-api';

/** One stored message of the conversation, as `workspace_claim()` returns it in `history`. */
export interface HistoryMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface TurnInput {
  /** The request's id, for log lines only. */
  readonly requestId: string;
  readonly conversationId: string;
  /** The model alias the tier names. */
  readonly model: string;
  /** The request's own user message. */
  readonly prompt: string;
  /** The messages before it, oldest first; never the request's own user message. */
  readonly history: readonly HistoryMessage[];
  /** The session id stored for the conversation, or null before its first answer. */
  readonly claudeSessionId: string | null;
  /** The per-answer cost cap, in US dollars. */
  readonly budgetUsd: number;
}

/** One element of `workspace_messages.tool_calls`: the stored shape, and nothing more. */
export interface StoredToolCall {
  readonly tool: string;
  readonly query: string | null;
  readonly scope: string | null;
  readonly ok: boolean;
}

/** A piece of answer text from the main thread, in order. */
export interface DeltaEvent {
  readonly type: 'delta';
  readonly text: string;
}

/**
 * A tool call. Sent once when the call is made (`ok` false: no result yet) and again, under the
 * same `id`, when its result is known; the first event fixes the call's place in call order.
 */
export interface ToolEvent {
  readonly type: 'tool';
  readonly id: string;
  readonly call: StoredToolCall;
}

/** The end of the turn: exactly one, last. */
export interface ResultEvent {
  readonly type: 'result';
  readonly ok: boolean;
  readonly errorCode: ErrorCode | null;
  /** The provider's own cost estimate for the turn as it reports it, or null. */
  readonly costUsd: number | null;
  /** The session id to resume the conversation with, or null. */
  readonly claudeSessionId: string | null;
  /** The full model id the provider named for the turn, or null when it named none. */
  readonly model: string | null;
}

export type TurnEvent = DeltaEvent | ToolEvent | ResultEvent;

export interface Provider {
  readonly id: ProviderId;
  runTurn(input: TurnInput, signal: AbortSignal): AsyncIterable<TurnEvent>;
}
