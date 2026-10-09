/**
 * The provider seam (brief 102, Contract, Provider seam). A provider runs one turn and reports it
 * as a stream of events; the runner knows nothing else about where an answer comes from.
 */

import type { ErrorCode } from '../errors.js';

export type ProviderId = 'claude-cli' | 'ollama' | 'frontier-api';

/**
 * The four kinds of model turn (brief 109): the answer, the planning turn before it, and the two
 * background turns that write a summary. Only an answer may call a tool or stream its text.
 */
export const TURN_KINDS = ['answer', 'plan', 'summary', 'rolling'] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

export interface TurnInput {
  /** The request's id (or the job's), for log lines only. */
  readonly requestId: string;
  readonly kind: TurnKind;
  /** The model alias the tier names. */
  readonly model: string;
  /** The whole prompt argument: the assembled context with the question last. */
  readonly prompt: string;
  /** The system prompt of this turn, assembled by the runner. */
  readonly systemPrompt: string;
  /** The cost cap of this one turn, in US dollars. */
  readonly budgetUsd: number;
  /** An answering turn's own MCP config file; the other kinds use the config with no server. */
  readonly mcpConfig?: string;
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
  /**
   * True when the provider's own end-of-turn report (the CLI's `result` line) was read before any
   * abort by the runner: the turn produced a result, whatever ended the process afterwards, and the
   * runner's time limit does not overrule it. False or absent for an end the provider made up for a
   * turn that was cut short, a report read only after the runner's abort included (ruling Z1, R2-1).
   */
  readonly reported?: boolean;
}

export type TurnEvent = DeltaEvent | ToolEvent | ResultEvent;

export interface Provider {
  readonly id: ProviderId;
  runTurn(input: TurnInput, signal: AbortSignal): AsyncIterable<TurnEvent>;
}
