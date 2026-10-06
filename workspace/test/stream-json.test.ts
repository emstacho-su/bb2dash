import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CLAUDE_CODE_VERSION } from '../src/config.js';
import { mapTurnEnd } from '../src/errors.js';
import { ALLOWED_TOOLS } from '../src/hooks/gate-rules.js';
import { isUuidShaped, shouldRetryAsFresh } from '../src/providers/claude-cli.js';
import {
  OAUTH_CREDENTIAL_SOURCE,
  checkInit,
  createTurnStream,
  parseLine,
  readInit,
  type StreamSignal,
  type TurnSummary,
} from '../src/stream-json.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const SCRUBBED = '<scrubbed>';

type Line = Record<string, unknown>;

function readJsonl(name: string): Line[] {
  return fs
    .readFileSync(path.join(FIXTURES, name), 'utf8')
    .split('\n')
    .filter((text) => text.trim() !== '')
    .map((text) => JSON.parse(text) as Line);
}

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
}

interface Replay {
  signals: StreamSignal[];
  summary: TurnSummary;
}

function replay(lines: readonly unknown[]): Replay {
  const stream = createTurnStream();
  const signals = lines.flatMap((line) => stream.push(line));
  return { signals, summary: stream.summary() };
}

const deltasOf = (signals: readonly StreamSignal[]): string =>
  signals.flatMap((signal) => (signal.kind === 'delta' ? [signal.text] : [])).join('');

const stopsOf = (signals: readonly StreamSignal[]) =>
  signals.flatMap((signal) => (signal.kind === 'stop' ? [signal] : []));

interface Recordings {
  claude_code_version: string;
  fixtures: Record<string, { exitCode: number; stderr: string | null; maxBudgetUsd: string }>;
}

const recordings = readJson<Recordings>('recordings.json');
const RECORDED = Object.keys(recordings.fixtures);

// Hand-built lines for the cases no recording holds, in the shapes the recordings show.
const SESSION = '0a0a0a0a-1111-4222-8333-444444444444';
const base = { session_id: SESSION, parent_tool_use_id: null };

const initLine = (overrides: Line = {}): Line => ({
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

const toolUse = (id: string, name: string, input: Line = {}): Line => ({
  type: 'assistant',
  message: { model: 'claude-haiku-4-5-20251001', role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  ...base,
});

const hookResponse = (toolName: string, exitCode: number): Line => ({
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

const toolResult = (id: string, isError = false): Line => ({
  type: 'user',
  message: {
    role: 'user',
    content: [{ tool_use_id: id, type: 'tool_result', content: SCRUBBED, ...(isError ? { is_error: true } : {}) }],
  },
  ...base,
});

const blockStart = (type: string, parent: string | null = null): Line => ({
  type: 'stream_event',
  event: { type: 'content_block_start', index: 0, content_block: { type } },
  session_id: SESSION,
  parent_tool_use_id: parent,
});

const delta = (deltaBody: Line, parent: string | null = null): Line => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: deltaBody },
  session_id: SESSION,
  parent_tool_use_id: parent,
});

const textDelta = (text: string, parent: string | null = null): Line => delta({ type: 'text_delta', text }, parent);

const resultLine = (overrides: Line = {}): Line => ({
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

const SEARCH = 'mcp__bb2dash__search_materials';
const SEARCH_CONTEXT = 'mcp__rag__search_context';

describe('the recorded fixtures as files', () => {
  it('are the four recordings', () => {
    expect(RECORDED.sort()).toEqual([
      'claude-stream-budget-stop.jsonl',
      'claude-stream-lookup.jsonl',
      'claude-stream-resume-missing.jsonl',
      'claude-stream-sign-in-expired.jsonl',
    ]);
    expect(recordings.claude_code_version).toBe(CLAUDE_CODE_VERSION);
  });

  it.each(RECORDED)('%s: every line is JSON and every tool-result body is the literal <scrubbed>', (name) => {
    const lines = readJsonl(name);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      if (line.type !== 'user') continue;
      if ('tool_use_result' in line) expect(line.tool_use_result).toBe(SCRUBBED);
      const content = (line.message as { content: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content as Line[]) {
        if (block.type === 'tool_result') expect(block.content).toBe(SCRUBBED);
      }
    }
  });

  it.each(RECORDED)('%s: no host path, inventory, key, token or DSN remains', (name) => {
    const text = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
    expect(text).not.toMatch(/\b[A-Za-z]:[\\/]/);
    expect(text).not.toMatch(/[\\/](Users|home)[\\/]/i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(text).not.toMatch(/sk-ant-/);
    expect(text).not.toMatch(/sb_secret_/);
    expect(text).not.toMatch(/postgres(ql)?:\/\//i);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    for (const line of readJsonl(name)) {
      if (line.type !== 'system' || line.subtype !== 'init') continue;
      for (const key of ['cwd', 'slash_commands', 'skills', 'plugins', 'agents', 'memory_paths', 'powershell_path']) {
        if (key in line) expect(line[key], key).toBe(SCRUBBED);
      }
    }
  });

  it.each(RECORDED)('%s: every thinking signature is scrubbed', (name) => {
    const text = fs.readFileSync(path.join(FIXTURES, name), 'utf8');
    for (const match of text.matchAll(/"signature":"([^"]*)"/g)) expect(match[1]).toBe(SCRUBBED);
  });

  it.each(RECORDED)('%s: an init line, when there is one, shows the pinned CLI version', (name) => {
    for (const line of readJsonl(name)) {
      const init = readInit(line);
      if (init !== null) expect(init.claudeCodeVersion).toBe(CLAUDE_CODE_VERSION);
    }
  });
});

describe('claude-stream-lookup.jsonl', () => {
  const lines = readJsonl('claude-stream-lookup.jsonl');
  const { signals, summary } = replay(lines);

  it('opens with a system/init line that passes the init check', () => {
    const init = readInit(lines[0]);
    expect(init).not.toBeNull();
    expect(init?.claudeCodeVersion).toBe(CLAUDE_CODE_VERSION);
    expect(init?.credentialSource).toBe(OAUTH_CREDENTIAL_SOURCE);
    expect(init?.credentialSource).toBe('none');
    expect(init?.permissionMode).toBe('dontAsk');
    expect(init?.mcpServers.map((server) => server.name).sort()).toEqual(['bb2dash', 'rag']);
    expect(init?.mcpServers.every((server) => server.status === 'connected')).toBe(true);
    for (const tool of ALLOWED_TOOLS) expect(init?.tools).toContain(tool);
    expect(init?.tools).not.toContain('ToolSearch');
    expect(init?.model).toBe('claude-haiku-4-5-20251001');
    expect(isUuidShaped(init?.sessionId)).toBe(true);
    expect(checkInit(init!)).toEqual([]);
    expect(summary.init).toEqual(init);
  });

  it('joins the deltas of the last assistant message to the recorded final text', () => {
    const result = lines[lines.length - 1] as { type: string; result: string };
    expect(result.type).toBe('result');
    const assistants = lines.filter((line) => line.type === 'assistant') as Array<{ message: { content: Line[] } }>;
    const lastText = assistants[assistants.length - 1]?.message.content.find((block) => block.type === 'text');
    expect(deltasOf(signals)).toBe(result.result);
    expect(deltasOf(signals)).toBe(lastText?.text);
    expect(summary.text).toBe(result.result);
    expect(summary.text.length).toBeGreaterThan(100);
  });

  it('streams only main-thread text: no thinking and no tool input', () => {
    const textDeltas = lines.filter(
      (line) => line.type === 'stream_event' && (line.event as { delta?: { type?: string } }).delta?.type === 'text_delta',
    );
    expect(signals.filter((signal) => signal.kind === 'delta')).toHaveLength(textDeltas.length);
    expect(deltasOf(signals)).not.toContain('"q"');
  });

  it('builds tool_calls in the Contract shape, ok true on its search_materials call', () => {
    expect(summary.toolCalls).toEqual([
      { tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true },
      { tool: 'get_material_text', query: null, scope: '733', ok: true },
    ]);
    for (const call of summary.toolCalls) expect(Object.keys(call)).toEqual(['tool', 'query', 'scope', 'ok']);
  });

  it('has a PreToolUse hook response with exit code 0 for each tool_use', () => {
    const toolUses = (lines.filter((line) => line.type === 'assistant') as Array<{ message: { content: Line[] } }>)
      .flatMap((line) => line.message.content)
      .filter((block) => block.type === 'tool_use');
    const responses = lines.filter((line) => line.type === 'system' && line.subtype === 'hook_response');
    expect(toolUses).toHaveLength(2);
    expect(responses).toHaveLength(toolUses.length);
    for (const [index, block] of toolUses.entries()) {
      expect(responses[index]?.hook_event).toBe('PreToolUse');
      expect(responses[index]?.hook_name).toBe(`PreToolUse:${String(block.name)}`);
      expect(responses[index]?.exit_code).toBe(0);
      expect(responses[index]?.stdout).toBe('');
    }
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.violation).toBeNull();
  });

  it('ends as a finished answer: the cost as reported, the session id, the full model id', () => {
    expect(summary.result).toMatchObject({ subtype: 'success', isError: false, totalCostUsd: 0.038524, apiErrorStatus: null });
    expect(summary.result?.sessionId).toBe(summary.init?.sessionId);
    expect(summary.model).toBe('claude-haiku-4-5-20251001');
    expect(summary.sawAssistant).toBe(true);
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('carries a rate-limit event with the overage fields', () => {
    expect(summary.rateLimit).toEqual({
      status: 'allowed',
      overageStatus: 'rejected',
      overageDisabledReason: 'out_of_credits',
      isUsingOverage: false,
    });
  });
});

describe('claude-stream-sign-in-expired.jsonl', () => {
  const lines = readJsonl('claude-stream-sign-in-expired.jsonl');
  const { signals, summary } = replay(lines);

  it('was recorded with exit code 1 and wrote nothing to stderr', () => {
    expect(recordings.fixtures['claude-stream-sign-in-expired.jsonl']).toMatchObject({ exitCode: 1, stderr: null });
  });

  it('passes the init check: an OAuth token in the environment reads as the same credential source', () => {
    expect(summary.init?.credentialSource).toBe(OAUTH_CREDENTIAL_SOURCE);
    expect(checkInit(summary.init!)).toEqual([]);
  });

  it('maps to sign_in_expired from the structured fields', () => {
    expect(summary.assistantError).toBe('authentication_failed');
    expect(summary.result).toMatchObject({ isError: true, apiErrorStatus: 401, totalCostUsd: 0 });
    expect(mapTurnEnd(summary)).toBe('sign_in_expired');
    expect(stopsOf(signals)).toEqual([]);
  });

  it('does not read the result text: the same lines with other words map the same way', () => {
    const reworded = lines.map((line) => {
      if (line.type === 'result') return { ...line, result: 'all good' };
      if (line.type !== 'assistant') return line;
      const message = line.message as { content: Line[] };
      return { ...line, message: { ...message, content: [{ type: 'text', text: 'all good' }] } };
    });
    expect(mapTurnEnd(replay(reworded).summary)).toBe('sign_in_expired');
  });

  it("streams nothing: the CLI's own error message is not answer text", () => {
    expect(deltasOf(signals)).toBe('');
    expect(summary.text).toBe('');
  });

  it('names the model from the init line, never the synthetic error message', () => {
    expect(summary.model).toBe('claude-haiku-4-5-20251001');
  });

  it('is not retried as a fresh start: an assistant message arrived', () => {
    expect(summary.sawAssistant).toBe(true);
    expect(shouldRetryAsFresh({ mode: 'resume', exitCode: 1, sawAssistant: summary.sawAssistant, alreadyRetried: false })).toBe(false);
  });
});

describe('claude-stream-resume-missing.jsonl', () => {
  const lines = readJsonl('claude-stream-resume-missing.jsonl');
  const { signals, summary } = replay(lines);
  const meta = recordings.fixtures['claude-stream-resume-missing.jsonl'];

  it('was recorded as stdout, stderr and exit code 1', () => {
    expect(meta?.exitCode).toBe(1);
    expect(meta?.stderr).toBe('claude-stream-resume-missing.stderr.txt');
    const stderr = fs.readFileSync(path.join(FIXTURES, 'claude-stream-resume-missing.stderr.txt'), 'utf8');
    expect(stderr).toMatch(/^No conversation found with session ID: [0-9a-f-]{36}\s*$/);
  });

  it('is one error result with no init line, no assistant message and no cost', () => {
    expect(lines).toHaveLength(1);
    expect(summary.init).toBeNull();
    expect(summary.sawAssistant).toBe(false);
    expect(summary.result).toMatchObject({ subtype: 'error_during_execution', isError: true, totalCostUsd: 0, numTurns: 0 });
    expect(deltasOf(signals)).toBe('');
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('is retried once as a fresh start with replay', () => {
    const exitCode = meta?.exitCode ?? 0;
    expect(shouldRetryAsFresh({ mode: 'resume', exitCode, sawAssistant: summary.sawAssistant, alreadyRetried: false })).toBe(true);
    expect(shouldRetryAsFresh({ mode: 'resume', exitCode, sawAssistant: summary.sawAssistant, alreadyRetried: true })).toBe(false);
    expect(shouldRetryAsFresh({ mode: 'fresh', exitCode, sawAssistant: summary.sawAssistant, alreadyRetried: false })).toBe(false);
    expect(shouldRetryAsFresh({ mode: 'resume', exitCode: 0, sawAssistant: summary.sawAssistant, alreadyRetried: false })).toBe(false);
    expect(shouldRetryAsFresh({ mode: 'resume', exitCode: null, sawAssistant: false, alreadyRetried: false })).toBe(true);
  });
});

describe('synthetic-rate-limit.json (not a recording)', () => {
  const synthetic = readJson<{ synthetic: boolean; note: string } & Record<string, { lines: Line[] }>>('synthetic-rate-limit.json');

  it('is named synthetic and stands outside the recorded fixtures', () => {
    expect(synthetic.synthetic).toBe(true);
    expect(synthetic.note).toMatch(/Not a recording/);
    expect(RECORDED).not.toContain('synthetic-rate-limit.json');
  });

  it('maps a turn that ends in error after a plan rate-limit rejection to usage_limit', () => {
    const { signals, summary } = replay(synthetic.planLimitRejected!.lines);
    expect(summary.rateLimit?.status).toBe('rejected');
    expect(summary.result?.isError).toBe(true);
    expect(mapTurnEnd(summary)).toBe('usage_limit');
    expect(stopsOf(signals)).toEqual([]);
  });

  it('stops a turn reported as paid from usage credits and stores usage_limit', () => {
    const { signals, summary } = replay(synthetic.paidFromUsageCredits!.lines);
    expect(summary.rateLimit?.isUsingOverage).toBe(true);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.errorCode).toBe('usage_limit');
    expect(mapTurnEnd(summary)).toBe('usage_limit');
  });

  it('does not read an api_retry event as a plan-limit hit', () => {
    const { signals, summary } = replay(synthetic.retriedThenAnswered!.lines);
    expect(mapTurnEnd(summary)).toBeNull();
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.text).toBe('synthetic answer');
  });

  it('needs the turn to end in error: a rejection followed by a finished answer is not usage_limit', () => {
    const lines = [...synthetic.planLimitRejected!.lines.slice(0, 4), resultLine()];
    expect(mapTurnEnd(replay(lines).summary)).toBeNull();
  });
});

describe('tool calls', () => {
  it('gives ok false for a tool result that is an error', () => {
    const { summary, signals } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'late work' }),
      hookResponse(SEARCH, 0),
      toolResult('t1', true),
      resultLine(),
    ]);
    expect(summary.toolCalls).toEqual([{ tool: 'search_materials', query: 'late work', scope: null, ok: false }]);
    expect(stopsOf(signals)).toEqual([]);
  });

  it('gives ok false for a tool result that never arrives', () => {
    const { summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x', course: 'IST.323' }), hookResponse(SEARCH, 0)]);
    expect(summary.toolCalls).toEqual([{ tool: 'search_materials', query: 'x', scope: 'IST.323', ok: false }]);
  });

  it('stores a call the gate denied, with ok false, and lets the turn go on', () => {
    const { summary, signals } = replay([
      initLine(),
      toolUse('t1', SEARCH_CONTEXT, { query: 'quiz 2', collection: 'stack' }),
      hookResponse(SEARCH_CONTEXT, 2),
      toolResult('t1', true),
      resultLine(),
    ]);
    expect(summary.toolCalls).toEqual([{ tool: 'search_context', query: 'quiz 2', scope: 'stack', ok: false }]);
    expect(stopsOf(signals)).toEqual([]);
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('never gives ok true to a call the gate denied, even if a result without an error flag follows', () => {
    const { summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), hookResponse(SEARCH, 2), toolResult('t1'), resultLine()]);
    expect(summary.toolCalls[0]?.ok).toBe(false);
  });

  it('sends a tool signal when a call is made and again when its result is known', () => {
    const { signals } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), hookResponse(SEARCH, 0), toolResult('t1')]);
    const tools = signals.flatMap((signal) => (signal.kind === 'tool' ? [signal] : []));
    expect(tools.map((signal) => [signal.id, signal.call.ok])).toEqual([
      ['t1', false],
      ['t1', true],
    ]);
  });

  it('keeps call order when results arrive out of order, and matches hooks to same-named calls in turn', () => {
    const { summary, signals } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'first' }),
      toolUse('t2', SEARCH, { q: 'second' }),
      hookResponse(SEARCH, 0),
      hookResponse(SEARCH, 2),
      toolResult('t2', true),
      toolResult('t1'),
      resultLine(),
    ]);
    expect(summary.toolCalls).toEqual([
      { tool: 'search_materials', query: 'first', scope: null, ok: true },
      { tool: 'search_materials', query: 'second', scope: null, ok: false },
    ]);
    expect(stopsOf(signals)).toEqual([]);
  });

  it('reads the stored shape from each tool input', () => {
    const long = 'q'.repeat(450);
    const { summary } = replay([
      initLine(),
      toolUse('a', SEARCH, { q: long, course: '' }),
      toolUse('b', 'mcp__bb2dash__get_material_text', { text_id: 733 }),
      toolUse('c', 'mcp__bb2dash__get_material_text', { text_id: '812' }),
      toolUse('d', 'mcp__bb2dash__list_courses', {}),
      toolUse('e', SEARCH_CONTEXT, { query: 'quiz 2', collection: 'bb2dash-inbox-decisions' }),
      toolUse('f', SEARCH_CONTEXT, { query: 7, collection: ['bb2dash'] }),
      toolUse('g', 'Bash', { command: 'ls', q: 'not a materials call', query: 'not a notes call' }),
    ]);
    expect(summary.toolCalls).toEqual([
      { tool: 'search_materials', query: 'q'.repeat(200), scope: null, ok: false },
      { tool: 'get_material_text', query: null, scope: '733', ok: false },
      { tool: 'get_material_text', query: null, scope: '812', ok: false },
      { tool: 'list_courses', query: null, scope: null, ok: false },
      { tool: 'search_context', query: 'quiz 2', scope: 'bb2dash-inbox-decisions', ok: false },
      { tool: 'search_context', query: null, scope: null, ok: false },
      { tool: 'Bash', query: null, scope: null, ok: false },
    ]);
  });

  it('counts a tool_use once, however many assistant lines repeat it', () => {
    const { summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), toolUse('t1', SEARCH, { q: 'x' })]);
    expect(summary.toolCalls).toHaveLength(1);
  });
});

describe('failing closed on the gate', () => {
  it('stops the turn as cli_error when a tool result arrives with no PreToolUse hook response', () => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), toolResult('t1'), resultLine()]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(summary.violation).not.toBeNull();
    expect(mapTurnEnd(summary)).toBe('cli_error');
    expect(summary.toolCalls[0]?.ok).toBe(false);
  });

  it.each([[1], [3], [127], [-1]])('stops the turn as cli_error when the hook exits %s', (exitCode) => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), hookResponse(SEARCH, exitCode)]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(mapTurnEnd({ ...summary, result: null })).toBe('cli_error');
  });

  it('stops the turn when the hook response carries no exit code at all', () => {
    const response = { ...hookResponse(SEARCH, 0), exit_code: undefined };
    const { signals } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), response]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
  });

  it('does not fail a turn that ended before a tool ran: no gate response and no result is a call that never happened', () => {
    const ended = resultLine({ subtype: 'error_max_budget_usd', is_error: true });
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), ended]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(summary.toolCalls).toEqual([{ tool: 'search_materials', query: 'x', scope: null, ok: false }]);
    expect(mapTurnEnd(summary)).toBe('budget_exceeded');
  });

  it('says nothing more once it has stopped a turn, but still reads the result line', () => {
    const { signals, summary } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'x' }),
      toolResult('t1'),
      blockStart('text'),
      textDelta('text after an ungated call'),
      toolUse('t2', SEARCH, { q: 'y' }),
      resultLine({ total_cost_usd: 0.5 }),
    ]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(deltasOf(signals)).toBe('');
    expect(summary.text).toBe('');
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.result?.totalCostUsd).toBe(0.5);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('does not count a hook response for another tool', () => {
    const { signals } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'x' }),
      hookResponse('mcp__bb2dash__list_courses', 0),
      toolResult('t1'),
    ]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
  });

  it('ignores hook events that are not PreToolUse', () => {
    const other = { ...hookResponse(SEARCH, 0), hook_event: 'PostToolUse', hook_name: `PostToolUse:${SEARCH}` };
    const { signals } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), other, toolResult('t1')]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
  });

  it('accepts EndConversation with no hook response, stores nothing for it and lets the turn finish', () => {
    const { signals, summary } = replay([
      initLine(),
      blockStart('text'),
      textDelta('Goodbye.'),
      toolUse('end1', 'EndConversation', {}),
      toolResult('end1'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(mapTurnEnd(summary)).toBeNull();
    expect(summary.text).toBe('Goodbye.');
  });

  it('stops the turn when model output arrives before any init line', () => {
    const { signals, summary } = replay([blockStart('text'), textDelta('hello')]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(deltasOf(signals)).toBe('');
    expect(summary.violation).not.toBeNull();
  });
});

describe('the init check', () => {
  const good = readInit(initLine())!;

  it('passes the recorded shape', () => {
    expect(checkInit(good)).toEqual([]);
  });

  it.each([
    ['another CLI version', { claude_code_version: '2.1.290' }],
    ['an API key as the credential', { apiKeySource: 'ANTHROPIC_API_KEY' }],
    ['a key helper as the credential', { apiKeySource: 'apiKeyHelper' }],
    ['a managed key as the credential', { apiKeySource: 'managed' }],
    ['no credential field', { apiKeySource: undefined }],
    ['another permission mode', { permissionMode: 'bypassPermissions' }],
    ['the default permission mode', { permissionMode: 'default' }],
    ['a third MCP server', { mcp_servers: [{ name: 'bb2dash', status: 'connected' }, { name: 'rag', status: 'connected' }, { name: 'supabase', status: 'connected' }] }],
    ['a missing MCP server', { mcp_servers: [{ name: 'bb2dash', status: 'connected' }] }],
    ['an MCP server that failed', { mcp_servers: [{ name: 'bb2dash', status: 'connected' }, { name: 'rag', status: 'failed' }] }],
    ['an MCP server still pending', { mcp_servers: [{ name: 'bb2dash', status: 'pending' }, { name: 'rag', status: 'connected' }] }],
    ['a missing allowed tool', { tools: ALLOWED_TOOLS.slice(0, 3) }],
    ['ToolSearch among the tools', { tools: [...ALLOWED_TOOLS, 'ToolSearch'] }],
    ['no tools field', { tools: undefined }],
  ])('refuses %s', (_what, overrides) => {
    const init = readInit(initLine(overrides as Line))!;
    expect(checkInit(init).length).toBeGreaterThan(0);
  });

  it('records, but does not judge, whether mcp__rag__get_document is listed', () => {
    const init = readInit(initLine({ tools: [...ALLOWED_TOOLS, 'mcp__rag__get_document'] }))!;
    expect(checkInit(init)).toEqual([]);
  });

  it('stops the turn from inside the stream when the init line fails', () => {
    const { signals, summary } = replay([initLine({ claude_code_version: '2.1.290' }), blockStart('text'), textDelta('hi')]);
    expect(signals[0]?.kind).toBe('init');
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(stopsOf(signals)[0]?.reason).toMatch(/claude_code_version/);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('is null for a line that is not system/init', () => {
    expect(readInit(resultLine())).toBeNull();
    expect(readInit(null)).toBeNull();
    expect(readInit('text')).toBeNull();
  });
});

describe('answer text', () => {
  it('joins the text of two assistant messages with a blank line, in the stream and in the summary alike', () => {
    const { signals, summary } = replay([
      initLine(),
      blockStart('text'),
      textDelta('Let me look.'),
      toolUse('t1', SEARCH, { q: 'x' }),
      hookResponse(SEARCH, 0),
      toolResult('t1'),
      blockStart('text'),
      textDelta('It says '),
      textDelta('ten percent.'),
      resultLine(),
    ]);
    expect(deltasOf(signals)).toBe('Let me look.\n\nIt says ten percent.');
    expect(summary.text).toBe(deltasOf(signals));
  });

  it('adds no blank line before the first text or after text that already ends a paragraph', () => {
    const { signals } = replay([initLine(), blockStart('text'), textDelta('One.\n\n'), blockStart('text'), textDelta('Two.')]);
    expect(deltasOf(signals)).toBe('One.\n\nTwo.');
  });

  it('never streams thinking, tool input or text from another thread', () => {
    const { signals, summary } = replay([
      initLine(),
      blockStart('thinking'),
      delta({ type: 'thinking_delta', thinking: 'private reasoning' }),
      delta({ type: 'signature_delta', signature: 'sig' }),
      blockStart('tool_use'),
      delta({ type: 'input_json_delta', partial_json: '{"q":"late' }),
      blockStart('text', 'toolu_parent'),
      textDelta('from a sub-thread', 'toolu_parent'),
      blockStart('text'),
      textDelta('main thread'),
    ]);
    expect(deltasOf(signals)).toBe('main thread');
    expect(summary.text).toBe('main thread');
  });

  it('skips an empty text delta', () => {
    const { signals } = replay([initLine(), blockStart('text'), textDelta(''), textDelta('a')]);
    expect(signals.filter((signal) => signal.kind === 'delta')).toHaveLength(1);
  });
});

describe('the end of a turn', () => {
  it('maps the result subtype error_max_budget_usd to budget_exceeded', () => {
    const { summary } = replay([initLine(), resultLine({ subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 0.0214 })]);
    expect(mapTurnEnd(summary)).toBe('budget_exceeded');
    expect(summary.result?.totalCostUsd).toBe(0.0214);
  });

  it.each([
    ['an error subtype the runner does not know', { subtype: 'error_during_execution', is_error: true }],
    ['a success line flagged as an error', { subtype: 'success', is_error: true }],
    ['a result with no subtype', { subtype: undefined }],
    ['an API error that is not a sign-in failure', { subtype: 'success', is_error: true, api_error_status: 500 }],
  ])('maps %s to cli_error', (_what, overrides) => {
    expect(mapTurnEnd(replay([initLine(), resultLine(overrides as Line)]).summary)).toBe('cli_error');
  });

  it('maps a stream that ends with no result line to cli_error', () => {
    expect(mapTurnEnd(replay([initLine(), blockStart('text'), textDelta('half an ans')]).summary)).toBe('cli_error');
  });

  it('maps a 401 result to sign_in_expired even with no assistant line', () => {
    const { summary } = replay([initLine(), resultLine({ is_error: true, api_error_status: 401 })]);
    expect(mapTurnEnd(summary)).toBe('sign_in_expired');
  });

  it('reads the session id and the cost from the result line as reported', () => {
    const { summary } = replay([initLine(), resultLine({ total_cost_usd: 1.23456789, session_id: SESSION })]);
    expect(summary.result?.totalCostUsd).toBe(1.23456789);
    expect(summary.result?.sessionId).toBe(SESSION);
  });

  it('names no model when the stream names none', () => {
    const { summary } = replay([initLine({ model: undefined }), resultLine()]);
    expect(summary.model).toBeNull();
  });

  it('prefers the model an assistant message names over the init line', () => {
    const line = toolUse('t1', SEARCH, { q: 'x' });
    const named = { ...line, message: { ...(line.message as Line), model: 'claude-haiku-4-5-20260101' } };
    expect(replay([initLine(), named]).summary.model).toBe('claude-haiku-4-5-20260101');
  });
});

describe('parseLine', () => {
  it('parses a JSON object and nothing else', () => {
    expect(parseLine('{"type":"result"}')).toEqual({ type: 'result' });
    expect(parseLine('npm notice something')).toBeNull();
    expect(parseLine('')).toBeNull();
    expect(parseLine('[1,2]')).toBeNull();
    expect(parseLine('"text"')).toBeNull();
    expect(parseLine('null')).toBeNull();
  });

  it('lets the stream ignore what it does not know', () => {
    const { signals, summary } = replay([initLine(), null, 'noise', { type: 'system', subtype: 'status' }, { type: 'brand_new' }, 7]);
    expect(signals.map((signal) => signal.kind)).toEqual(['init']);
    expect(summary.violation).toBeNull();
  });
});
