/**
 * Reads the CLI's `--output-format stream-json` output, one parsed line at a time (brief 102, task
 * 9). Field names follow the recordings in `test/fixtures/` (CLI 2.1.289).
 *
 * What it gives back, as signals:
 *   init    the `system/init` line's facts, once;
 *   delta   answer text: main-thread `text_delta` events only, never thinking or tool input;
 *   tool    a tool call, when it is made and again when its result is known;
 *   stop    the turn must be killed: the init line failed its check, a tool answered with no allow
 *           from the gate, the gate exited with a code that is neither 0 nor 2, or the turn is
 *           being paid from usage credits;
 *   result  the `result` line's facts.
 * After a stop it says nothing more, but still reads the result line.
 *
 * The gate rule (rulings V1, CR-1 and CR-6). The gate's answer names a tool and no call, so answers
 * are never paired to calls: they are counted. A tool result that is not an error needs an allow (a
 * PreToolUse hook response with exit 0) for its tool name: the results that are not errors for a
 * name never outnumber the allows seen for it, and the one that would stops the turn. An error
 * result needs none: the CLI writes those itself for a call it refused before the gate ran (a tool
 * it does not have) and for a call the gate denied; the call is stored with ok false and the turn
 * goes on.
 */

import { CLAUDE_CODE_VERSION, TOOL_QUERY_MAX_CHARS } from './config.js';
import type { ErrorCode } from './errors.js';
import { ALLOWED_TOOLS } from './hooks/gate-rules.js';
import type { StoredToolCall } from './providers/types.js';

/** `apiKeySource` on the init line when no API key is in use: a `/login` session or an OAuth token in the environment. */
export const OAUTH_CREDENTIAL_SOURCE = 'none';
export const REQUIRED_PERMISSION_MODE = 'dontAsk';
export const REQUIRED_MCP_SERVERS = ['bb2dash', 'rag'] as const;

const MCP_CONNECTED = 'connected';
const FORBIDDEN_TOOL = 'ToolSearch';
/** The CLI's own tool for ending a conversation: outside the gate by design, never stored. */
const END_CONVERSATION_TOOL = 'EndConversation';
/** The model name on a message the CLI wrote itself (an API error), never a real model id. */
const SYNTHETIC_MODEL = '<synthetic>';
const PRE_TOOL_USE = 'PreToolUse';
const HOOK_NAME_PREFIX = `${PRE_TOOL_USE}:`;
const HOOK_ALLOW_EXIT = 0;
const HOOK_DENY_EXIT = 2;
const TEXT_BLOCK_SEPARATOR = '\n\n';
const MATERIALS_SEARCH = 'mcp__bb2dash__search_materials';
const MATERIALS_TEXT = 'mcp__bb2dash__get_material_text';
const NOTES_SEARCH = 'mcp__rag__search_context';

type Json = Record<string, unknown>;

export interface InitFacts {
  readonly claudeCodeVersion: string | null;
  /** The init line's `apiKeySource`. */
  readonly credentialSource: string | null;
  readonly permissionMode: string | null;
  readonly model: string | null;
  readonly sessionId: string | null;
  readonly mcpServers: ReadonlyArray<{ readonly name: string; readonly status: string }>;
  readonly tools: readonly string[];
}

export interface RateLimitFacts {
  readonly status: string | null;
  readonly overageStatus: string | null;
  readonly overageDisabledReason: string | null;
  readonly isUsingOverage: boolean | null;
}

export interface ResultFacts {
  readonly subtype: string | null;
  readonly isError: boolean;
  /** `total_cost_usd` as reported: the CLI's own list-price estimate, never summed here. */
  readonly totalCostUsd: number | null;
  readonly sessionId: string | null;
  readonly apiErrorStatus: number | null;
  readonly numTurns: number | null;
}

export type StreamSignal =
  | { readonly kind: 'init'; readonly init: InitFacts }
  | { readonly kind: 'delta'; readonly text: string }
  | { readonly kind: 'tool'; readonly id: string; readonly call: StoredToolCall }
  | { readonly kind: 'stop'; readonly errorCode: ErrorCode; readonly reason: string }
  | { readonly kind: 'result'; readonly result: ResultFacts };

export interface TurnSummary {
  readonly init: InitFacts | null;
  /** The joined answer text, exactly what the delta signals carried. */
  readonly text: string;
  /** Every tool call in call order, failed and denied ones included; the runner keeps the first 20. */
  readonly toolCalls: readonly StoredToolCall[];
  /** The full model id of the last real assistant message, else the init line's, else null. */
  readonly model: string | null;
  readonly sawAssistant: boolean;
  /** The `error` field of the last assistant line that carried one. */
  readonly assistantError: string | null;
  readonly rateLimit: RateLimitFacts | null;
  readonly result: ResultFacts | null;
  /** Why the stream asked for the turn to be killed as `cli_error`, or null. */
  readonly violation: string | null;
  /** True once a rate-limit event reported the turn as paid from usage credits. */
  readonly overage: boolean;
}

export interface TurnStream {
  push(line: unknown): StreamSignal[];
  summary(): TurnSummary;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const records = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isRecord) : []);

/** One stdout line as a JSON object, or null for anything else (a blank line, noise, a bare value). */
export function parseLine(lineText: string): Json | null {
  try {
    const parsed: unknown = JSON.parse(lineText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readInit(line: unknown): InitFacts | null {
  if (!isRecord(line) || line.type !== 'system' || line.subtype !== 'init') return null;
  return {
    claudeCodeVersion: text(line.claude_code_version),
    credentialSource: text(line.apiKeySource),
    permissionMode: text(line.permissionMode),
    model: text(line.model),
    sessionId: text(line.session_id),
    mcpServers: records(line.mcp_servers).map((server) => ({ name: String(server.name ?? ''), status: String(server.status ?? '') })),
    tools: Array.isArray(line.tools) ? line.tools.filter((tool): tool is string => typeof tool === 'string') : [],
  };
}

/** Why the init line does not pass, one sentence per reason; empty when it passes. */
export function checkInit(init: InitFacts, pinnedVersion: string = CLAUDE_CODE_VERSION): string[] {
  const problems: string[] = [];
  if (init.claudeCodeVersion !== pinnedVersion) {
    problems.push(`claude_code_version is ${init.claudeCodeVersion ?? 'missing'}, not the pinned ${pinnedVersion}`);
  }
  if (init.credentialSource !== OAUTH_CREDENTIAL_SOURCE) {
    problems.push(`the credential source is ${init.credentialSource ?? 'missing'}, not the OAuth token`);
  }
  if (init.permissionMode !== REQUIRED_PERMISSION_MODE) {
    problems.push(`permissionMode is ${init.permissionMode ?? 'missing'}, not ${REQUIRED_PERMISSION_MODE}`);
  }
  const names = init.mcpServers.map((server) => server.name).sort();
  if (names.join(',') !== [...REQUIRED_MCP_SERVERS].sort().join(',')) {
    problems.push(`mcp_servers are [${names.join(', ')}], not exactly ${REQUIRED_MCP_SERVERS.join(' and ')}`);
  }
  for (const server of init.mcpServers) {
    if (server.status !== MCP_CONNECTED) problems.push(`the MCP server ${server.name} is ${server.status}, not connected`);
  }
  for (const tool of ALLOWED_TOOLS) {
    if (!init.tools.includes(tool)) problems.push(`tools does not hold ${tool}`);
  }
  if (init.tools.includes(FORBIDDEN_TOOL)) problems.push(`tools holds ${FORBIDDEN_TOOL}`);
  return problems;
}

function shortToolName(name: string): string {
  const at = name.lastIndexOf('__');
  return at === -1 ? name : name.slice(at + 2);
}

function cutQuery(value: unknown): string | null {
  return typeof value === 'string' ? [...value].slice(0, TOOL_QUERY_MAX_CHARS).join('') : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** One tool call in the stored shape: the tool, its query and scope, and whether it answered. */
export function toStoredToolCall(name: string, input: unknown, ok: boolean): StoredToolCall {
  const args = isRecord(input) ? input : {};
  const tool = shortToolName(name);
  if (name === MATERIALS_SEARCH) return { tool, query: cutQuery(args.q), scope: nonEmpty(args.course), ok };
  if (name === MATERIALS_TEXT) {
    const id = args.text_id;
    return { tool, query: null, scope: typeof id === 'number' ? String(id) : nonEmpty(id), ok };
  }
  if (name === NOTES_SEARCH) return { tool, query: cutQuery(args.query), scope: nonEmpty(args.collection), ok };
  return { tool, query: null, scope: null, ok };
}

interface ToolState {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  /** False for `EndConversation`: accepted, never stored, outside the gate rule. */
  readonly counted: boolean;
  resultSeen: boolean;
  isError: boolean;
  /** True for the call whose result arrived with no allow left for its tool name: the turn was stopped on it. */
  ungated: boolean;
}

/** A call is ok when its result arrived and is not an error; the gate's exit code is no part of it. */
const toolOk = (tool: ToolState): boolean => tool.resultSeen && !tool.isError && !tool.ungated;
const stored = (tool: ToolState): StoredToolCall => toStoredToolCall(tool.name, tool.input, toolOk(tool));

function readRateLimit(info: Json): RateLimitFacts {
  return {
    status: text(info.status),
    overageStatus: text(info.overageStatus),
    overageDisabledReason: text(info.overageDisabledReason),
    isUsingOverage: typeof info.isUsingOverage === 'boolean' ? info.isUsingOverage : null,
  };
}

function readResult(line: Json): ResultFacts {
  const subtype = text(line.subtype);
  return {
    subtype,
    isError: line.is_error === true || subtype !== 'success',
    totalCostUsd: finite(line.total_cost_usd),
    sessionId: text(line.session_id),
    apiErrorStatus: finite(line.api_error_status),
    numTurns: finite(line.num_turns),
  };
}

export function createTurnStream(pinnedVersion: string = CLAUDE_CODE_VERSION): TurnStream {
  const tools = new Map<string, ToolState>();
  /** By tool name: the gate's allows seen so far, and the results that were not errors. */
  const allows = new Map<string, number>();
  const answered = new Map<string, number>();
  const countOf = (counts: ReadonlyMap<string, number>, name: string): number => counts.get(name) ?? 0;
  let init: InitFacts | null = null;
  let joined = '';
  let separatorPending = false;
  let model: string | null = null;
  let sawAssistant = false;
  let assistantError: string | null = null;
  let rateLimit: RateLimitFacts | null = null;
  let result: ResultFacts | null = null;
  let violation: string | null = null;
  let overage = false;
  let stopped = false;

  const stop = (errorCode: ErrorCode, reason: string): StreamSignal => {
    stopped = true;
    if (errorCode === 'cli_error') violation = violation ?? reason;
    return { kind: 'stop', errorCode, reason };
  };

  const onInit = (line: Json): StreamSignal[] => {
    const facts = readInit(line);
    if (facts === null || init !== null) return [];
    init = facts;
    const problems = checkInit(facts, pinnedVersion);
    return problems.length === 0
      ? [{ kind: 'init', init: facts }]
      : [{ kind: 'init', init: facts }, stop('cli_error', `init line refused: ${problems.join('; ')}`)];
  };

  const onStreamEvent = (line: Json): StreamSignal[] => {
    if (line.parent_tool_use_id !== null && line.parent_tool_use_id !== undefined) return [];
    const event = isRecord(line.event) ? line.event : {};
    if (event.type === 'content_block_start') {
      const block = isRecord(event.content_block) ? event.content_block : {};
      if (block.type === 'text') separatorPending = joined !== '';
      return [];
    }
    if (event.type !== 'content_block_delta') return [];
    const delta = isRecord(event.delta) ? event.delta : {};
    if (delta.type !== 'text_delta' || typeof delta.text !== 'string' || delta.text === '') return [];
    const separator = separatorPending && !joined.endsWith(TEXT_BLOCK_SEPARATOR) ? TEXT_BLOCK_SEPARATOR : '';
    separatorPending = false;
    const piece = `${separator}${delta.text}`;
    joined += piece;
    return [{ kind: 'delta', text: piece }];
  };

  const registerTool = (block: Json): StreamSignal[] => {
    const id = text(block.id);
    const name = text(block.name);
    if (id === null || name === null || tools.has(id)) return [];
    const tool: ToolState = {
      id,
      name,
      input: block.input,
      counted: name !== END_CONVERSATION_TOOL,
      resultSeen: false,
      isError: false,
      ungated: false,
    };
    tools.set(id, tool);
    return tool.counted ? [{ kind: 'tool', id, call: stored(tool) }] : [];
  };

  const onAssistant = (line: Json): StreamSignal[] => {
    sawAssistant = true;
    if (typeof line.error === 'string') assistantError = line.error;
    const message = isRecord(line.message) ? line.message : {};
    const named = text(message.model);
    if (named !== null && named !== SYNTHETIC_MODEL && line.is_api_error_message !== true) model = named;
    return records(message.content)
      .filter((block) => block.type === 'tool_use')
      .flatMap(registerTool);
  };

  const onHookResponse = (line: Json): StreamSignal[] => {
    const hookName = text(line.hook_name) ?? '';
    if (line.hook_event !== PRE_TOOL_USE || !hookName.startsWith(HOOK_NAME_PREFIX)) return [];
    const toolName = hookName.slice(HOOK_NAME_PREFIX.length);
    const exit = typeof line.exit_code === 'number' && Number.isInteger(line.exit_code) ? line.exit_code : Number.NaN;
    if (exit === HOOK_ALLOW_EXIT) allows.set(toolName, countOf(allows, toolName) + 1);
    if (exit === HOOK_ALLOW_EXIT || exit === HOOK_DENY_EXIT) return [];
    return [stop('cli_error', `the tool gate exited ${Number.isNaN(exit) ? 'with no code' : exit} for ${shortToolName(toolName)}`)];
  };

  const onUser = (line: Json): StreamSignal[] => {
    const message = isRecord(line.message) ? line.message : {};
    const signals: StreamSignal[] = [];
    for (const block of records(message.content)) {
      if (block.type !== 'tool_result' || stopped) continue;
      const tool = tools.get(text(block.tool_use_id) ?? '');
      // A call has one result: a line that repeats it is not a second answer to count.
      if (!tool || tool.resultSeen) continue;
      tool.resultSeen = true;
      tool.isError = block.is_error === true;
      if (!tool.counted) continue;
      if (!tool.isError) {
        answered.set(tool.name, countOf(answered, tool.name) + 1);
        if (countOf(answered, tool.name) > countOf(allows, tool.name)) {
          tool.ungated = true;
          signals.push(stop('cli_error', `the tool call ${shortToolName(tool.name)} answered with no allow from the tool gate`));
          continue;
        }
      }
      signals.push({ kind: 'tool', id: tool.id, call: stored(tool) });
    }
    return signals;
  };

  const onRateLimit = (line: Json): StreamSignal[] => {
    if (!isRecord(line.rate_limit_info)) return [];
    rateLimit = readRateLimit(line.rate_limit_info);
    if (rateLimit.isUsingOverage !== true) return [];
    overage = true;
    return [stop('usage_limit', 'the turn is reported as paid from usage credits')];
  };

  const needsInit = (handler: (line: Json) => StreamSignal[]) => (line: Json): StreamSignal[] =>
    init === null ? [stop('cli_error', 'model output arrived before any init line')] : handler(line);

  const handlers: Record<string, (line: Json) => StreamSignal[]> = {
    stream_event: needsInit(onStreamEvent),
    assistant: needsInit(onAssistant),
    user: needsInit(onUser),
    rate_limit_event: onRateLimit,
  };

  return {
    push(line: unknown): StreamSignal[] {
      if (!isRecord(line)) return [];
      if (line.type === 'result') {
        result = readResult(line);
        return [{ kind: 'result', result }];
      }
      if (stopped) return [];
      if (line.type === 'system') {
        if (line.subtype === 'init') return onInit(line);
        return line.subtype === 'hook_response' ? onHookResponse(line) : [];
      }
      const handler = typeof line.type === 'string' ? handlers[line.type] : undefined;
      return handler ? handler(line) : [];
    },
    summary(): TurnSummary {
      return {
        init,
        text: joined,
        toolCalls: [...tools.values()].filter((tool) => tool.counted).map(stored),
        model: model ?? init?.model ?? null,
        sawAssistant,
        assistantError,
        rateLimit,
        result,
        violation,
        overage,
      };
    },
  };
}
