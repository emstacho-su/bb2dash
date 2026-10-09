/**
 * The claude CLI turn: the argv it starts, what it reads from the recorded streams, the init check,
 * failing closed on the gate, and how it kills. Part of runner.test.ts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLAUDE_CODE_VERSION, PATHS } from '../../src/config.js';
import { ALLOWED_TOOLS } from '../../src/hooks/gate-rules.js';
import { createCliTurn, isUuidShaped, spawnClaude, type CliTurnDeps } from '../../src/providers/claude-cli.js';
import type { TurnInput } from '../../src/providers/types.js';
import { startTurn } from '../../src/turn.js';
import {
  QUESTION,
  STORED_SESSION_ID,
  asAnsweringInit,
  claimOf,
  collect,
  fakeSpawn,
  readFixtureJson,
  readFixtureLines,
  resultOf,
  textOf,
  valueAfter,
  type FakeProcessOptions,
} from '../helpers/fakes.js';
import { CONTRACT } from '../helpers/context24.js';
import { turnHarness } from '../helpers/turn-harness.js';

type Line = Record<string, unknown>;

const TOKEN = 'not-a-real-token-used-by-the-tests';
const SYSTEM_PROMPT = 'You are read-only.';
const REQUEST_CONFIG = '/run/workspace/mcp-41.json';
const KILL_GRACE_MS = 30;
const OK = { code: 0, signal: null } as const;
const FAILED = { code: 1, signal: null } as const;

/**
 * Phase 21's recordings were made with two servers. An answering turn now starts one, so the notes
 * server is taken out of a recording's init line; every other line is as recorded.
 */
function recorded(name: string): Line[] {
  return readFixtureLines(name);
}

const lookup = recorded('claude-stream-lookup.jsonl');
const signInExpired = recorded('claude-stream-sign-in-expired.jsonl');
const synthetic = Object.fromEntries(
  Object.entries(readFixtureJson<Record<string, { lines: Line[] }>>('synthetic-rate-limit.json')).map(([name, entry]) => [name, entry !== null && typeof entry === 'object' && 'lines' in entry ? { lines: entry.lines.map(asAnsweringInit) } : entry]),
) as Record<string, { lines: Line[] }>;
const recordings = readFixtureJson<{ fixtures: Record<string, { exitCode: number }> }>('recordings.json');

function input(overrides: Partial<TurnInput> = {}): TurnInput {
  return {
    requestId: '41',
    kind: 'answer',
    model: 'haiku',
    prompt: QUESTION,
    systemPrompt: SYSTEM_PROMPT,
    budgetUsd: 1,
    mcpConfig: REQUEST_CONFIG,
    ...overrides,
  };
}

function harness(scripts: FakeProcessOptions[], overrides: Partial<CliTurnDeps> = {}) {
  const logs: string[] = [];
  const spawn = fakeSpawn(...scripts);
  const turn = createCliTurn({
    spawn: spawn.spawn,
    readOauthToken: () => TOKEN,
    baseEnv: { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/node/.claude', UNSET: undefined },
    log: (line) => logs.push(line),
    killGraceMs: KILL_GRACE_MS,
    ...overrides,
  });
  return { turn, spawn, logs };
}

const run = (h: ReturnType<typeof harness>, turnInput: TurnInput = input(), signal: AbortSignal = new AbortController().signal) =>
  collect(h.turn(turnInput, signal));

const initLine = (overrides: Line = {}): Line => ({
  type: 'system',
  subtype: 'init',
  session_id: STORED_SESSION_ID,
  tools: [...ALLOWED_TOOLS],
  mcp_servers: [{ name: 'bb2dash', status: 'connected' }],
  model: 'claude-haiku-4-5-20251001',
  permissionMode: 'dontAsk',
  apiKeySource: 'none',
  claude_code_version: CLAUDE_CODE_VERSION,
  ...overrides,
});

const textDelta = (text: string): Line => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  session_id: STORED_SESSION_ID,
  parent_tool_use_id: null,
});

const toolUse = (id: string, name: string, toolInput: Line = {}): Line => ({
  type: 'assistant',
  message: { model: 'claude-haiku-4-5-20251001', role: 'assistant', content: [{ type: 'tool_use', id, name, input: toolInput }] },
  session_id: STORED_SESSION_ID,
  parent_tool_use_id: null,
});

const toolResult = (id: string): Line => ({
  type: 'user',
  message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: '<scrubbed>' }] },
  session_id: STORED_SESSION_ID,
  parent_tool_use_id: null,
});

const hookResponse = (toolName: string, exitCode: number): Line => ({
  type: 'system',
  subtype: 'hook_response',
  hook_name: `PreToolUse:${toolName}`,
  hook_event: 'PreToolUse',
  exit_code: exitCode,
  session_id: STORED_SESSION_ID,
});

const success: Line = { type: 'result', subtype: 'success', is_error: false, session_id: STORED_SESSION_ID, total_cost_usd: 0.01 };

describe('the CLI turn on the lookup recording', () => {
  it('starts the CLI once, in the empty turn directory, with the frozen argv', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    await run(h);
    expect(h.spawn.calls).toHaveLength(1);
    const { argv, options } = h.spawn.calls[0]!;
    expect(argv[0]).toBe('claude');
    expect(options.cwd).toBe(PATHS.turnCwd);
    expect(argv.slice(1, 4)).toEqual(['-p', '--model', 'haiku']);
    expect(valueAfter(argv, '--append-system-prompt')).toBe(SYSTEM_PROMPT);
    expect(valueAfter(argv, '--max-budget-usd')).toBe('1.00');
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk');
    expect(valueAfter(argv, '--mcp-config')).toBe(REQUEST_CONFIG);
    expect(valueAfter(argv, '--settings')).toBe(PATHS.settings);
    expect(argv).toContain('--no-session-persistence');
    expect(argv[argv.length - 2]).toBe('--');
    expect(argv[argv.length - 1]).toBe(QUESTION);
  });

  it('passes --session-id with a new random uuid on every turn, and never --resume', async () => {
    const first = harness([{ lines: lookup, exit: OK }]);
    const second = harness([{ lines: lookup, exit: OK }]);
    await run(first);
    await run(second);
    const a = valueAfter(first.spawn.calls[0]!.argv, '--session-id');
    const b = valueAfter(second.spawn.calls[0]!.argv, '--session-id');
    expect(isUuidShaped(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(first.spawn.calls[0]!.argv).not.toContain('--resume');
  });

  it('hands the CLI the prompt it was given, word for word, whatever it opens with', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    await run(h, input({ prompt: '/model opus' }));
    const argv = h.spawn.calls[0]!.argv;
    expect(argv[argv.length - 2]).toBe('--');
    expect(argv[argv.length - 1]).toBe('/model opus');
  });

  it('gives the child the token from its file and the two switches, and nothing of the runner DSN', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    await run(h);
    const env = h.spawn.calls[0]!.options.env;
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(env.ENABLE_TOOL_SEARCH).toBe('false');
    expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/node/.claude');
    expect('UNSET' in env).toBe(false);
    expect('MAX_THINKING_TOKENS' in env).toBe(false);
    expect(Object.keys(env).filter((name) => /DATABASE_URL|ANTHROPIC/.test(name))).toEqual([]);
  });

  it('reads the recorded turn: the answer text, both tool calls, the cost, the session id and the model id', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    const events = await run(h);
    const last = lookup[lookup.length - 1] as { result: string; session_id: string };
    expect(textOf(events)).toBe(last.result);
    const tools = events.flatMap((event) => (event.type === 'tool' ? [event] : []));
    expect(tools.map((event) => [event.call.tool, event.call.ok])).toEqual([
      ['search_materials', false],
      ['search_materials', true],
      ['get_material_text', false],
      ['get_material_text', true],
    ]);
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    expect(events[events.length - 1]).toEqual({
      type: 'result',
      ok: true,
      errorCode: null,
      costUsd: 0.038524,
      claudeSessionId: last.session_id,
      model: 'claude-haiku-4-5-20251001',
      reported: true,
    });
  });

  it('reads the same turn when the output arrives in small pieces', async () => {
    const whole = await run(harness([{ lines: lookup, exit: OK }]));
    const pieces = await run(harness([{ lines: lookup, exit: OK, chunkChars: 113 }]));
    expect(pieces).toEqual(whole);
  });

  it('writes one log line for the init line it read, with no token in any line', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    await run(h);
    const initLogs = h.logs.filter((line) => / init /.test(line));
    expect(initLogs).toHaveLength(1);
    expect(initLogs[0]).toContain('request=41');
    expect(initLogs[0]).toContain(`claude_code_version=${CLAUDE_CODE_VERSION}`);
    expect(initLogs[0]).toContain('credential_source=none');
    expect(initLogs[0]).toContain('permissionMode=dontAsk');
    expect(initLogs[0]).toContain('model=claude-haiku-4-5-20251001');
    expect(initLogs[0]).toContain('check=pass');
    for (const line of h.logs) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain(QUESTION);
    }
  });

  it('carries the system prompt the turn was given, one element, on every turn', async () => {
    const h = harness([
      { lines: lookup, exit: OK },
      { lines: lookup, exit: OK },
    ]);
    await run(h, input({ systemPrompt: 'first system prompt' }));
    await run(h, input({ systemPrompt: 'second system prompt' }));
    expect(valueAfter(h.spawn.calls[0]!.argv, '--append-system-prompt')).toBe('first system prompt');
    expect(valueAfter(h.spawn.calls[1]!.argv, '--append-system-prompt')).toBe('second system prompt');
  });
});

describe('a planning turn on the recording of probe P-1', () => {
  const p1 = fs
    .readFileSync(path.join(CONTRACT, 'probes', 'p1-no-mcp-server.jsonl'), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Line);
  const planInput = (): TurnInput => input({ kind: 'plan', mcpConfig: undefined, budgetUsd: 0.05 });

  it('starts with no allowed tool, the no-server config and thinking off', async () => {
    const h = harness([{ lines: p1, exit: OK }]);
    await run(h, planInput());
    const { argv, options } = h.spawn.calls[0]!;
    expect(argv).not.toContain('--allowedTools');
    expect(argv).not.toContain('--include-partial-messages');
    expect(valueAfter(argv, '--mcp-config')).toBe(PATHS.mcpNone);
    expect(valueAfter(argv, '--max-budget-usd')).toBe('0.05');
    expect(options.env.MAX_THINKING_TOKENS).toBe('0');
    expect(options.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
  });

  it('passes the init check with no server and no tool, and hands on the assistant text as one delta', async () => {
    const h = harness([{ lines: p1, exit: OK }]);
    const events = await run(h, planInput());
    expect(h.logs.some((line) => line.includes('check=pass'))).toBe(true);
    const text = textOf(events);
    expect(text.startsWith('```json')).toBe(true);
    expect(text).toContain('"queries"');
    expect(events.filter((event) => event.type === 'delta')).toHaveLength(1);
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null });
  });

  it('kills a planning turn whose init line shows a server or an MCP tool', async () => {
    for (const bad of [
      { mcp_servers: [{ name: 'bb2dash', status: 'connected' }] },
      { tools: ['mcp__bb2dash__search_materials'] },
    ]) {
      const h = harness([{ lines: [initLine({ mcp_servers: [], tools: [], ...bad }), textDelta('x'), success], exit: OK, hang: true }]);
      const events = await run(h, planInput());
      expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
      expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error' });
      expect(h.logs.some((line) => line.includes('check=refused'))).toBe(true);
    }
  });
});

describe('a start the runner itself killed is started once and no more', () => {
  const FRESH_SESSION_ID = '7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';
  const PENDING = { mcp_servers: [{ name: 'bb2dash', status: 'pending' }] };
  /** A second start that would answer, so a retry cannot hide behind a start that fails anyway. */
  const wouldAnswer: FakeProcessOptions = {
    lines: [initLine({ session_id: FRESH_SESSION_ID }), textDelta('an answer from a second start'), { ...success, session_id: FRESH_SESSION_ID }],
    exit: OK,
  };

  it('starts the CLI once and stores cli_error, never a finished answer, when the init line is refused', async () => {
    const h = harness([{ lines: [initLine(PENDING)], exit: OK, hang: true }, wouldAnswer]);
    const events = await run(h);
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error' });
    expect(h.spawn.calls).toHaveLength(1);
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(textOf(events)).toBe('');
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    expect(h.logs.some((line) => /request=41/.test(line) && /bb2dash is pending/.test(line))).toBe(true);
  });

  it('hands workspace_finish a null session id for that turn: no session is stored any more', async () => {
    const h = harness([{ lines: [initLine(PENDING)], exit: OK, hang: true }, wouldAnswer]);
    const { fake, deps } = turnHarness(h.turn);
    const outcome = await startTurn(deps, claimOf()).done;
    expect(outcome).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cli_error', claudeSessionId: null });
    expect(h.spawn.calls).toHaveLength(1);
  });

  it('starts no second call when the turn is reported as paid from usage credits before any assistant line: one start, usage_limit', async () => {
    const h = harness([{ lines: synthetic.paidFromUsageCredits!.lines, exit: OK, hang: true }, wouldAnswer]);
    const events = await run(h);
    expect(h.spawn.calls).toHaveLength(1);
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'usage_limit' });
    expect(textOf(events)).toBe('');
  });

  it('does not start again after a start that exited non-zero by itself: the result is cli_error', async () => {
    const h = harness([{ lines: [], exit: FAILED }, wouldAnswer]);
    const events = await run(h);
    expect(h.spawn.calls).toHaveLength(1);
    expect(resultOf(events)?.errorCode).toBe('cli_error');
  });

  it('logs the exit with the length of stderr and a class, never a character of it', async () => {
    const echoed = `the prompt said: ${QUESTION}`;
    const h = harness([{ lines: [], exit: FAILED, stderr: echoed }]);
    await run(h);
    const line = h.logs.find((text) => text.includes('the CLI exited 1'));
    expect(line).toContain(`stderr_chars=${echoed.length}`);
    expect(line).toContain('class=other');
    expect(h.logs.join('\n')).not.toContain('the prompt said');
    expect(h.logs.join('\n')).not.toContain('IST.323');
  });

  it('leaves a log line without 100 characters of the prompt that stderr echoed, the prompt being full of passages', async () => {
    const prompt = `Context for one question.\n\n${'Synthetic passage text about membrane transport, kept out of every log line. '.repeat(40)}`;
    const echoed = prompt.slice(0, 100);
    const h = harness([{ lines: [], exit: FAILED, stderr: `error: ${echoed}` }]);
    await run(h, input({ prompt }));
    const line = h.logs.find((text) => text.includes('the CLI exited 1'));
    expect(line).toContain(`stderr_chars=${`error: ${echoed}`.length}`);
    expect(line).toContain('class=other');
    for (const piece of [echoed.slice(0, 30), echoed.slice(60, 100), 'membrane', 'Synthetic passage']) expect(h.logs.join('\n')).not.toContain(piece);
  });

  it('logs the class of a known budget message and of a sign-in one', async () => {
    const budget = harness([{ lines: [], exit: FAILED, stderr: 'Error: Exceeded USD budget (0.05)' }]);
    await run(budget);
    expect(budget.logs.find((text) => text.includes('the CLI exited'))).toContain('class=budget');
    const signIn = harness([{ lines: [], exit: FAILED, stderr: 'Not logged in. Please run /login' }]);
    await run(signIn);
    expect(signIn.logs.find((text) => text.includes('the CLI exited'))).toContain('class=sign_in');
  });
});

describe('how a CLI turn ends', () => {
  it('maps the sign-in-expired recording to sign_in_expired and streams none of its text', async () => {
    const h = harness([{ lines: signInExpired, exit: FAILED }]);
    const events = await run(h);
    expect(textOf(events)).toBe('');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'sign_in_expired', costUsd: 0, model: 'claude-haiku-4-5-20251001' });
    expect(isUuidShaped(resultOf(events)?.claudeSessionId)).toBe(true);
  });

  it('maps the budget-stop recording as recorded', async () => {
    const budgetStop = recorded('claude-stream-budget-stop.jsonl');
    const exit = { code: recordings.fixtures['claude-stream-budget-stop.jsonl']!.exitCode, signal: null };
    const h = harness([{ lines: budgetStop, exit }]);
    const events = await run(h, input({ budgetUsd: 0.01 }));
    expect(valueAfter(h.spawn.calls[0]!.argv, '--max-budget-usd')).toBe('0.01');
    // The result line is not the recording's last: the gate's answer for the cut-off tool call follows it.
    const stopLine = budgetStop.find((line) => line.type === 'result') as { subtype: string; total_cost_usd: number };
    expect(stopLine.subtype).toBe('error_max_budget_usd');
    expect(budgetStop[budgetStop.length - 1]).toMatchObject({ type: 'system', subtype: 'hook_response', exit_code: 0 });
    expect(resultOf(events)).toMatchObject({
      ok: false,
      errorCode: 'budget_exceeded',
      costUsd: stopLine.total_cost_usd,
      model: 'claude-haiku-4-5-20251001',
    });
    expect(isUuidShaped(resultOf(events)?.claudeSessionId)).toBe(true);
    expect(textOf(events)).toBe('');
    // The tool call it cut off is reported once, unanswered; nothing stopped the turn but the cap.
    expect(events.filter((event) => event.type === 'tool')).toEqual([
      { type: 'tool', id: expect.any(String), call: { tool: 'search_materials', query: 'late work policy', scope: 'IST.323', ok: false } },
    ]);
    expect(h.logs.filter((line) => line.includes('stopped:'))).toEqual([]);
  });

  it('maps a plan rate-limit rejection to usage_limit (synthetic)', async () => {
    const h = harness([{ lines: synthetic.planLimitRejected!.lines, exit: FAILED }]);
    const events = await run(h);
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'usage_limit' });
    expect(h.spawn.processes[0]!.kills).toEqual([]);
  });

  it('maps a rate-limit error end with no rejected event before it to usage_limit (synthetic)', async () => {
    const h = harness([{ lines: synthetic.planLimitTerminalErrorOnly!.lines, exit: FAILED }]);
    const events = await run(h);
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'usage_limit' });
    expect(h.spawn.processes[0]!.kills).toEqual([]);
    expect(textOf(events)).toBe('');
  });

  it('kills a turn reported as paid from usage credits and stores usage_limit (synthetic)', async () => {
    const h = harness([{ lines: synthetic.paidFromUsageCredits!.lines, exit: OK, hang: true }]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'usage_limit' });
    expect(h.logs.some((line) => /request=41/.test(line) && /usage credits/.test(line))).toBe(true);
  });

  it('finishes an answered turn after a passing retry (synthetic)', async () => {
    const h = harness([{ lines: synthetic.retriedThenAnswered!.lines, exit: OK }]);
    const events = await run(h);
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null });
    expect(textOf(events)).toBe('synthetic answer');
  });

  it('stores cli_error when the process ends with no result line', async () => {
    const h = harness([{ lines: [initLine(), textDelta('half an ans')], exit: OK }]);
    const events = await run(h);
    expect(textOf(events)).toBe('half an ans');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error', claudeSessionId: STORED_SESSION_ID });
  });

  it('ignores output lines that are not JSON', async () => {
    const h = harness([{ lines: ['npm notice', initLine(), textDelta('ok'), success], exit: OK }]);
    const events = await run(h);
    expect(textOf(events)).toBe('ok');
    expect(resultOf(events)?.ok).toBe(true);
  });

  it('stores cli_error when the CLI cannot be started', async () => {
    const h = harness([], {
      spawn: () => {
        throw new Error('spawn claude ENOENT');
      },
    });
    const events = await run(h);
    expect(events).toEqual([{ type: 'result', ok: false, errorCode: 'cli_error', costUsd: null, claudeSessionId: null, model: null }]);
    expect(h.logs.some((line) => /request=41/.test(line) && /ENOENT/.test(line))).toBe(true);
  });

  it('stores cli_error when the process reports a start error', async () => {
    const h = harness([{ lines: [], exit: { code: null, signal: null, error: 'spawn claude EACCES' } }]);
    const events = await run(h);
    expect(resultOf(events)?.errorCode).toBe('cli_error');
    expect(h.logs.some((line) => /EACCES/.test(line))).toBe(true);
  });

  it('stores sign_in_expired, and starts nothing, when the token file cannot be read', async () => {
    const h = harness([{ lines: lookup, exit: OK }], {
      readOauthToken: () => {
        throw new Error('claude_oauth_token is missing or empty');
      },
    });
    const events = await run(h);
    expect(h.spawn.calls).toHaveLength(0);
    expect(events).toEqual([{ type: 'result', ok: false, errorCode: 'sign_in_expired', costUsd: null, claudeSessionId: null, model: null }]);
    expect(h.logs.some((line) => /request=41/.test(line) && /claude_oauth_token/.test(line))).toBe(true);
  });
});

describe('the init check and the gate, failing closed', () => {
  it.each([
    ['another CLI version', { claude_code_version: '2.1.290' }, /claude_code_version/],
    ['an API key as the credential', { apiKeySource: 'ANTHROPIC_API_KEY' }, /credential/],
    ['another permission mode', { permissionMode: 'default' }, /permissionMode/],
    ['a second MCP server', { mcp_servers: [{ name: 'bb2dash', status: 'connected' }, { name: 'x', status: 'connected' }] }, /mcp_servers/],
    ['the notes server back again', { mcp_servers: [{ name: 'bb2dash', status: 'connected' }, { name: 'rag', status: 'connected' }] }, /mcp_servers/],
    ['an MCP server that is not connected', { mcp_servers: [{ name: 'bb2dash', status: 'failed' }] }, /bb2dash/],
    ['a missing allowed tool', { tools: ALLOWED_TOOLS.slice(1) }, /tools/],
    ['ToolSearch among the tools', { tools: [...ALLOWED_TOOLS, 'ToolSearch'] }, /ToolSearch/],
  ])('kills the turn on %s, stores cli_error and logs why', async (_what, overrides, why) => {
    const h = harness([{ lines: [initLine(overrides as Line), textDelta('must not be streamed'), success], exit: OK, hang: true }]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(textOf(events)).toBe('');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error' });
    const initLog = h.logs.find((line) => / init /.test(line));
    expect(initLog).toContain('request=41');
    expect(initLog).toContain('check=refused');
    expect(h.logs.some((line) => why.test(line))).toBe(true);
  });

  it('kills the turn as cli_error when a tool ran with no PreToolUse hook response', async () => {
    const search = 'mcp__bb2dash__search_materials';
    const h = harness([{ lines: [initLine(), toolUse('t1', search, { q: 'x' }), toolResult('t1'), textDelta('after'), success], exit: OK, hang: true }]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error' });
    expect(textOf(events)).toBe('');
    expect(h.logs.some((line) => /request=41/.test(line) && /tool gate/.test(line))).toBe(true);
  });

  it.each([[1], [127]])('kills the turn as cli_error when the gate exits %s', async (exitCode) => {
    const search = 'mcp__bb2dash__search_materials';
    const h = harness([{ lines: [initLine(), toolUse('t1', search, { q: 'x' }), hookResponse(search, exitCode), toolResult('t1'), success], exit: OK, hang: true }]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills.length).toBeGreaterThan(0);
    expect(resultOf(events)?.errorCode).toBe('cli_error');
  });

  it('lets a denied call (gate exit 2) pass: stored with ok false, the turn goes on', async () => {
    const notes = 'mcp__other__search_context';
    const denied = { ...toolResult('t1') };
    (denied.message as { content: Line[] }).content[0]!.is_error = true;
    const h = harness([
      { lines: [initLine(), toolUse('t1', notes, { query: 'q' }), hookResponse(notes, 2), denied, textDelta('I cannot search that.'), success], exit: OK },
    ]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills).toEqual([]);
    expect(resultOf(events)?.ok).toBe(true);
    const last = events.flatMap((event) => (event.type === 'tool' ? [event.call] : [])).pop();
    expect(last).toEqual({ tool: 'search_context', query: null, scope: null, ok: false });
  });

  it('accepts EndConversation: no gate response needed, nothing stored, the turn finishes', async () => {
    const h = harness([{ lines: [initLine(), textDelta('Goodbye.'), toolUse('e1', 'EndConversation'), toolResult('e1'), success], exit: OK }]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills).toEqual([]);
    expect(events.filter((event) => event.type === 'tool')).toEqual([]);
    expect(resultOf(events)?.ok).toBe(true);
    expect(textOf(events)).toBe('Goodbye.');
  });
});

describe('the real process (node standing in for the CLI)', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const options = { cwd: os.tmpdir(), env };

  async function read(child: ReturnType<typeof spawnClaude>): Promise<string> {
    let text = '';
    for await (const chunk of child.stdout) text += chunk.toString();
    return text;
  }

  it('reads stdout, the end of stderr and the exit code', async () => {
    const script = "process.stdout.write('{\"type\":\"result\"}\\n'); process.stderr.write('a warning'); process.exitCode = 3;";
    const child = spawnClaude([process.execPath, '-e', script], options);
    expect(await read(child)).toBe('{"type":"result"}\n');
    expect(await child.exited).toEqual({ code: 3, signal: null });
    expect(child.stderrText()).toBe('a warning');
  });

  it('passes every argv element as it is, with no shell: an empty one, line breaks, quotes, a leading --', async () => {
    const elements = ['--tools', '', 'line one\nline "two" with $HOME and `ticks`', '--', '--model opus'];
    const child = spawnClaude([process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '--', ...elements], options);
    expect(JSON.parse(await read(child))).toEqual(elements);
    expect((await child.exited).code).toBe(0);
  });

  it('reports a program that cannot be started instead of throwing', async () => {
    const child = spawnClaude(['w64-there-is-no-such-program'], options);
    expect(await read(child)).toBe('');
    const exit = await child.exited;
    expect(exit.code).toBeNull();
    expect(exit.error).toMatch(/ENOENT/);
  });

  it('kills a running process', async () => {
    const child = spawnClaude([process.execPath, '-e', 'setInterval(() => undefined, 1000)'], options);
    child.kill('SIGTERM');
    const exit = await child.exited;
    expect(exit.code === 0).toBe(false);
    expect(exit.error).toBeUndefined();
  });

  it('refuses an empty argv', () => {
    expect(() => spawnClaude([], options)).toThrow(/empty argv/);
  });

  it('runs a whole turn through a real process', async () => {
    const lines = lookup.map((line) => JSON.stringify(line)).join('\n');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'w64-cli-')), 'stream.jsonl');
    fs.writeFileSync(file, `${lines}\n`);
    const logs: string[] = [];
    const turn = createCliTurn({
      // The argv is the frozen one; node prints the recorded stream in place of the CLI.
      spawn: (_argv, spawnOptions) =>
        spawnClaude([process.execPath, '-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(file)}))`], {
          cwd: os.tmpdir(),
          env: spawnOptions.env,
        }),
      readOauthToken: () => TOKEN,
      baseEnv: process.env,
      log: (line) => logs.push(line),
    });
    const events = await collect(turn(input(), new AbortController().signal));
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, costUsd: 0.038524 });
    expect(textOf(events)).toBe((lookup[lookup.length - 1] as { result: string }).result);
    expect(logs.some((line) => line.includes('check=pass'))).toBe(true);
  });
});

describe('killing the CLI', () => {
  it('sends SIGTERM as soon as the runner aborts, and ends with one result', async () => {
    const h = harness([{ lines: [initLine(), textDelta('part')], exit: OK, hang: true }]);
    const controller = new AbortController();
    const events: Awaited<ReturnType<typeof collect>> = [];
    const started = Date.now();
    for await (const event of h.turn(input(), controller.signal)) {
      events.push(event);
      if (event.type === 'delta') controller.abort();
    }
    const kills = h.spawn.processes[0]!.kills;
    expect(kills.map((kill) => kill.signal)).toEqual(['SIGTERM']);
    expect(kills[0]!.at - started).toBeLessThan(2000);
    expect(textOf(events)).toBe('part');
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    expect(resultOf(events)).toMatchObject({ ok: false, claudeSessionId: STORED_SESSION_ID, model: 'claude-haiku-4-5-20251001' });
  });

  it('sends SIGKILL when SIGTERM has not ended the process within the grace period', async () => {
    const h = harness([{ lines: [initLine(), textDelta('part')], exit: OK, hang: true, ignoreSigterm: true }]);
    const controller = new AbortController();
    for await (const event of h.turn(input(), controller.signal)) {
      if (event.type === 'delta') controller.abort();
    }
    const kills = h.spawn.processes[0]!.kills;
    expect(kills.map((kill) => kill.signal)).toEqual(['SIGTERM', 'SIGKILL']);
    expect(kills[1]!.at - kills[0]!.at).toBeGreaterThanOrEqual(KILL_GRACE_MS - 5);
    expect(kills[1]!.at - kills[0]!.at).toBeLessThan(2000);
  });

  it('stops reading when the output stays open after SIGKILL, so a turn can never hang on a held pipe', async () => {
    const h = harness([{ lines: [initLine(), textDelta('part')], exit: OK, hang: true, ignoreSigterm: true, holdsOutput: true }]);
    const controller = new AbortController();
    const events: Awaited<ReturnType<typeof collect>> = [];
    for await (const event of h.turn(input(), controller.signal)) {
      events.push(event);
      if (event.type === 'delta') controller.abort();
    }
    const kills = h.spawn.processes[0]!.kills;
    expect(kills.map((kill) => kill.signal)).toEqual(['SIGTERM', 'SIGKILL', 'closeOutput']);
    expect(kills[2]!.at - kills[0]!.at).toBeLessThan(2000);
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
  });

  it('keeps the whole kill sequence under the 2 s the Contract allows', async () => {
    const { KILL_GRACE_MS: grace, OUTPUT_CLOSE_MS: close } = await import('../../src/providers/claude-cli.js');
    expect(grace + close).toBeLessThan(2000);
  });

  it('starts nothing when the runner has already aborted', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    const controller = new AbortController();
    controller.abort();
    const events = await run(h, input(), controller.signal);
    expect(h.spawn.calls).toHaveLength(0);
    expect(events).toEqual([{ type: 'result', ok: false, errorCode: 'cli_error', costUsd: null, claudeSessionId: null, model: null }]);
  });

  it('starts the CLI once for a turn the runner aborted', async () => {
    const h = harness([{ lines: [], exit: OK, hang: true }]);
    const controller = new AbortController();
    const pending = collect(h.turn(input(), controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    const events = await pending;
    expect(h.spawn.calls).toHaveLength(1);
    expect(resultOf(events)?.ok).toBe(false);
  });
});
