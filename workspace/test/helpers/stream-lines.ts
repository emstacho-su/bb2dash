/**
 * Hand-built stream lines for the cases no recording holds, in the shapes the recordings show, and
 * the replay that runs lines through the parser. Shared by stream-json.test.ts and its suites.
 */

import { CLAUDE_CODE_VERSION } from '../../src/config.js';
import { ALLOWED_TOOLS } from '../../src/hooks/gate-rules.js';
import { createTurnStream, type StreamSignal, type TurnSummary } from '../../src/stream-json.js';

/** What every tool-result body in a recording was rewritten to. */
export const SCRUBBED = '<scrubbed>';

export type Line = Record<string, unknown>;

export interface Replay {
  signals: StreamSignal[];
  summary: TurnSummary;
}

/** Push every line through a new turn stream: the signals it gave, and its summary at the end. */
export function replay(lines: readonly unknown[]): Replay {
  const stream = createTurnStream();
  const signals = lines.flatMap((line) => stream.push(line));
  return { signals, summary: stream.summary() };
}

export const deltasOf = (signals: readonly StreamSignal[]): string =>
  signals.flatMap((signal) => (signal.kind === 'delta' ? [signal.text] : [])).join('');

export const stopsOf = (signals: readonly StreamSignal[]) =>
  signals.flatMap((signal) => (signal.kind === 'stop' ? [signal] : []));

export const SESSION = '0a0a0a0a-1111-4222-8333-444444444444';
const base = { session_id: SESSION, parent_tool_use_id: null };

export const initLine = (overrides: Line = {}): Line => ({
  type: 'system',
  subtype: 'init',
  session_id: SESSION,
  tools: [...ALLOWED_TOOLS],
  mcp_servers: [
    { name: 'bb2dash', status: 'connected', source: 'dynamic' },
    { name: 'rag', status: 'connected', source: 'dynamic' },
  ],
  model: 'claude-haiku-4-5-20251001',
  permissionMode: 'dontAsk',
  apiKeySource: 'none',
  claude_code_version: CLAUDE_CODE_VERSION,
  ...overrides,
});

export const toolUse = (id: string, name: string, input: Line = {}): Line => ({
  type: 'assistant',
  message: { model: 'claude-haiku-4-5-20251001', role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  ...base,
});

export interface ToolUseBlock {
  readonly id: string;
  readonly name: string;
  readonly input?: Line;
}

const MESSAGE_ID = 'msg_two_calls_in_one_message';

/**
 * One assistant message that makes several tool calls, in the recorded shape: the CLI writes one
 * `assistant` line per content block, and the lines of one message share its id.
 */
export const toolUsesInOneMessage = (calls: readonly ToolUseBlock[]): Line[] =>
  calls.map(({ id, name, input }) => ({
    type: 'assistant',
    message: {
      id: MESSAGE_ID,
      model: 'claude-haiku-4-5-20251001',
      role: 'assistant',
      content: [{ type: 'tool_use', id, name, input: input ?? {} }],
    },
    ...base,
  }));

/** The same message with every call in one `assistant` line, which the parser reads the same way. */
export const toolUsesInOneLine = (calls: readonly ToolUseBlock[]): Line => ({
  type: 'assistant',
  message: {
    id: MESSAGE_ID,
    model: 'claude-haiku-4-5-20251001',
    role: 'assistant',
    content: calls.map(({ id, name, input }) => ({ type: 'tool_use', id, name, input: input ?? {} })),
  },
  ...base,
});

export const hookResponse = (toolName: string, exitCode: number): Line => ({
  type: 'system',
  subtype: 'hook_response',
  hook_id: `hook-${toolName}`,
  hook_name: `PreToolUse:${toolName}`,
  hook_event: 'PreToolUse',
  output: '',
  stdout: '',
  stderr: exitCode === 0 ? '' : 'denied',
  exit_code: exitCode,
  outcome: exitCode === 0 ? 'success' : 'error',
  session_id: SESSION,
});

export const toolResult = (id: string, isError = false): Line => ({
  type: 'user',
  message: {
    role: 'user',
    content: [{ tool_use_id: id, type: 'tool_result', content: SCRUBBED, ...(isError ? { is_error: true } : {}) }],
  },
  ...base,
});

export const blockStart = (type: string, parent: string | null = null): Line => ({
  type: 'stream_event',
  event: { type: 'content_block_start', index: 0, content_block: { type } },
  session_id: SESSION,
  parent_tool_use_id: parent,
});

export const delta = (deltaBody: Line, parent: string | null = null): Line => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: deltaBody },
  session_id: SESSION,
  parent_tool_use_id: parent,
});

export const textDelta = (text: string, parent: string | null = null): Line => delta({ type: 'text_delta', text }, parent);

export const resultLine = (overrides: Line = {}): Line => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  api_error_status: null,
  num_turns: 1,
  session_id: SESSION,
  total_cost_usd: 0.01,
  result: 'ignored',
  ...overrides,
});

export const SEARCH = 'mcp__bb2dash__search_materials';
export const SEARCH_CONTEXT = 'mcp__rag__search_context';
