/**
 * The claude CLI turn: the argv it starts, what it reads from the recorded streams, the one
 * recovery, the init check, failing closed on the gate, and how it kills. Part of runner.test.ts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CLAUDE_CODE_VERSION, PATHS } from '../../src/config.js';
import { ALLOWED_TOOLS } from '../../src/hooks/gate-rules.js';
import { createCliTurn, isUuidShaped, spawnClaude, type CliTurnDeps } from '../../src/providers/claude-cli.js';
import type { HistoryMessage, TurnInput } from '../../src/providers/types.js';
import { buildPrompt } from '../../src/replay.js';
import {
  CONVERSATION_ID,
  QUESTION,
  STORED_SESSION_ID,
  collect,
  fakeSpawn,
  readFixtureJson,
  readFixtureLines,
  resultOf,
  textOf,
  valueAfter,
  type FakeProcessOptions,
} from '../helpers/fakes.js';

type Line = Record<string, unknown>;

const TOKEN = 'not-a-real-token-used-by-the-tests';
const SYSTEM_PROMPT = 'You are read-only.';
const KILL_GRACE_MS = 30;
const OK = { code: 0, signal: null } as const;
const FAILED = { code: 1, signal: null } as const;

const lookup = readFixtureLines('claude-stream-lookup.jsonl');
const resumeMissing = readFixtureLines('claude-stream-resume-missing.jsonl');
const signInExpired = readFixtureLines('claude-stream-sign-in-expired.jsonl');
const synthetic = readFixtureJson<Record<string, { lines: Line[] }>>('synthetic-rate-limit.json');
const recordings = readFixtureJson<{ fixtures: Record<string, { exitCode: number }> }>('recordings.json');

const HISTORY: HistoryMessage[] = [
  { role: 'user', content: 'When is the IST.323 midterm?' },
  { role: 'assistant', content: 'The schedule lists it in week 8.' },
];

function input(overrides: Partial<TurnInput> = {}): TurnInput {
  return {
    requestId: '41',
    conversationId: CONVERSATION_ID,
    model: 'haiku',
    prompt: QUESTION,
    history: [],
    claudeSessionId: null,
    budgetUsd: 1,
    ...overrides,
  };
}

function harness(scripts: FakeProcessOptions[], overrides: Partial<CliTurnDeps> = {}) {
  const logs: string[] = [];
  const spawn = fakeSpawn(...scripts);
  let promptReads = 0;
  const turn = createCliTurn({
    spawn: spawn.spawn,
    readSystemPrompt: () => {
      promptReads += 1;
      return SYSTEM_PROMPT;
    },
    readOauthToken: () => TOKEN,
    baseEnv: { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/node/.claude', UNSET: undefined },
    log: (line) => logs.push(line),
    killGraceMs: KILL_GRACE_MS,
    ...overrides,
  });
  return { turn, spawn, logs, promptReads: () => promptReads };
}

const run = (h: ReturnType<typeof harness>, turnInput: TurnInput = input(), signal: AbortSignal = new AbortController().signal) =>
  collect(h.turn(turnInput, signal));

const initLine = (overrides: Line = {}): Line => ({
  type: 'system',
  subtype: 'init',
  session_id: STORED_SESSION_ID,
  tools: [...ALLOWED_TOOLS],
  mcp_servers: [
    { name: 'bb2dash', status: 'connected' },
    { name: 'rag', status: 'connected' },
  ],
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
    expect(valueAfter(argv, '--mcp-config')).toBe(PATHS.mcpConfig);
    expect(valueAfter(argv, '--settings')).toBe(PATHS.settings);
    expect(argv[argv.length - 2]).toBe('--');
    expect(argv[argv.length - 1]).toBe(QUESTION);
  });

  it('passes --session-id with a new random uuid on a fresh start, never the conversation id', async () => {
    const first = harness([{ lines: lookup, exit: OK }]);
    const second = harness([{ lines: lookup, exit: OK }]);
    await run(first);
    await run(second);
    const a = valueAfter(first.spawn.calls[0]!.argv, '--session-id');
    const b = valueAfter(second.spawn.calls[0]!.argv, '--session-id');
    expect(isUuidShaped(a)).toBe(true);
    expect(a).not.toBe(CONVERSATION_ID);
    expect(a).not.toBe(b);
    expect(first.spawn.calls[0]!.argv).not.toContain('--resume');
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
    expect(Object.keys(env).filter((name) => /DATABASE_URL|ANTHROPIC/.test(name))).toEqual([]);
  });

  it('reads the recorded turn: the answer text, both tool calls, the cost, the session id and the model id', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    const events = await run(h);
    const recorded = lookup[lookup.length - 1] as { result: string; session_id: string };
    expect(textOf(events)).toBe(recorded.result);
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
      claudeSessionId: recorded.session_id,
      model: 'claude-haiku-4-5-20251001',
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

  it('reads the system prompt file again on every turn', async () => {
    const h = harness([
      { lines: lookup, exit: OK },
      { lines: lookup, exit: OK },
    ]);
    await run(h);
    await run(h);
    expect(h.promptReads()).toBe(2);
  });
});

describe('fresh starts, resumed turns and the one recovery', () => {
  it('replays the stored history in front of the question on a fresh start that has any', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    await run(h, input({ history: HISTORY }));
    const argv = h.spawn.calls[0]!.argv;
    const prompt = argv[argv.length - 1]!;
    expect(prompt).toBe(buildPrompt(HISTORY, QUESTION));
    expect(prompt).toContain('When is the IST.323 midterm?');
    expect(prompt.endsWith(QUESTION)).toBe(true);
    expect(valueAfter(argv, '--session-id')).toBeDefined();
  });

  it('passes --resume with the stored session id on every later turn, and the question alone', async () => {
    const h = harness([{ lines: lookup, exit: OK }]);
    await run(h, input({ claudeSessionId: STORED_SESSION_ID, history: HISTORY }));
    const argv = h.spawn.calls[0]!.argv;
    expect(valueAfter(argv, '--resume')).toBe(STORED_SESSION_ID);
    expect(argv).not.toContain('--session-id');
    expect(argv[argv.length - 1]).toBe(QUESTION);
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk');
  });

  it.each([['not-a-uuid'], [`${STORED_SESSION_ID} --model opus`], ['--fork-session']])(
    'never puts the stored session id %j in argv: a fresh start with replay instead',
    async (stored) => {
      const h = harness([{ lines: lookup, exit: OK }]);
      await run(h, input({ claudeSessionId: stored, history: HISTORY }));
      const argv = h.spawn.calls[0]!.argv;
      expect(argv).not.toContain(stored);
      expect(argv).not.toContain('--resume');
      expect(isUuidShaped(valueAfter(argv, '--session-id'))).toBe(true);
      expect(argv[argv.length - 1]).toBe(buildPrompt(HISTORY, QUESTION));
    },
  );

  it('retries a --resume that exits non-zero before any assistant message, once, as a fresh start with replay', async () => {
    const exit = { code: recordings.fixtures['claude-stream-resume-missing.jsonl']!.exitCode, signal: null };
    const h = harness([
      { lines: resumeMissing, exit, stderr: 'No conversation found with session ID: x' },
      { lines: lookup, exit: OK },
    ]);
    const events = await run(h, input({ claudeSessionId: STORED_SESSION_ID, history: HISTORY }));
    expect(h.spawn.calls).toHaveLength(2);
    const [first, second] = h.spawn.calls;
    expect(valueAfter(first!.argv, '--resume')).toBe(STORED_SESSION_ID);
    expect(second!.argv).not.toContain('--resume');
    const fresh = valueAfter(second!.argv, '--session-id');
    expect(isUuidShaped(fresh)).toBe(true);
    expect(fresh).not.toBe(STORED_SESSION_ID);
    expect(fresh).not.toBe(CONVERSATION_ID);
    expect(second!.argv[second!.argv.length - 1]).toBe(buildPrompt(HISTORY, QUESTION));
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null });
    expect(resultOf(events)?.claudeSessionId).toBe((lookup[0] as { session_id: string }).session_id);
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    expect(h.logs.some((line) => /request=41/.test(line) && /fresh start/.test(line))).toBe(true);
  });

  it('tries the recovery once: a fresh start that fails too is stored as cli_error with no session id', async () => {
    const h = harness([
      { lines: resumeMissing, exit: FAILED },
      { lines: [], exit: FAILED },
    ]);
    const events = await run(h, input({ claudeSessionId: STORED_SESSION_ID }));
    expect(h.spawn.calls).toHaveLength(2);
    expect(resultOf(events)).toEqual({ type: 'result', ok: false, errorCode: 'cli_error', costUsd: null, claudeSessionId: null, model: null });
  });

  it('never reports the session id of a resume that found no session', async () => {
    const h = harness([
      { lines: resumeMissing, exit: FAILED },
      { lines: resumeMissing, exit: FAILED },
    ]);
    const events = await run(h, input({ claudeSessionId: STORED_SESSION_ID }));
    expect(resultOf(events)?.claudeSessionId).toBeNull();
    expect(resultOf(events)?.errorCode).toBe('cli_error');
  });

  it('does not retry a fresh start that fails', async () => {
    const h = harness([{ lines: [], exit: FAILED }]);
    const events = await run(h);
    expect(h.spawn.calls).toHaveLength(1);
    expect(resultOf(events)?.errorCode).toBe('cli_error');
  });

  it('does not retry a resumed turn that reached an assistant message', async () => {
    const h = harness([{ lines: signInExpired, exit: FAILED }]);
    const events = await run(h, input({ claudeSessionId: STORED_SESSION_ID }));
    expect(h.spawn.calls).toHaveLength(1);
    expect(resultOf(events)?.errorCode).toBe('sign_in_expired');
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
    const budgetStop = readFixtureLines('claude-stream-budget-stop.jsonl');
    const exit = { code: recordings.fixtures['claude-stream-budget-stop.jsonl']!.exitCode, signal: null };
    const h = harness([{ lines: budgetStop, exit }]);
    const events = await run(h, input({ budgetUsd: 0.01 }));
    expect(valueAfter(h.spawn.calls[0]!.argv, '--max-budget-usd')).toBe('0.01');
    const recorded = budgetStop[budgetStop.length - 1] as { subtype: string; total_cost_usd: number };
    expect(recorded.subtype).toBe('error_max_budget_usd');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'budget_exceeded', costUsd: recorded.total_cost_usd });
  });

  it('maps a plan rate-limit rejection to usage_limit (synthetic)', async () => {
    const h = harness([{ lines: synthetic.planLimitRejected!.lines, exit: FAILED }]);
    const events = await run(h);
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'usage_limit' });
    expect(h.spawn.processes[0]!.kills).toEqual([]);
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
    ['a third MCP server', { mcp_servers: [{ name: 'bb2dash', status: 'connected' }, { name: 'rag', status: 'connected' }, { name: 'x', status: 'connected' }] }, /mcp_servers/],
    ['an MCP server that is not connected', { mcp_servers: [{ name: 'bb2dash', status: 'failed' }, { name: 'rag', status: 'connected' }] }, /bb2dash/],
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
    const notes = 'mcp__rag__search_context';
    const denied = { ...toolResult('t1') };
    (denied.message as { content: Line[] }).content[0]!.is_error = true;
    const h = harness([
      { lines: [initLine(), toolUse('t1', notes, { query: 'q', collection: 'stack' }), hookResponse(notes, 2), denied, textDelta('I cannot search that.'), success], exit: OK },
    ]);
    const events = await run(h);
    expect(h.spawn.processes[0]!.kills).toEqual([]);
    expect(resultOf(events)?.ok).toBe(true);
    const last = events.flatMap((event) => (event.type === 'tool' ? [event.call] : [])).pop();
    expect(last).toEqual({ tool: 'search_context', query: 'q', scope: 'stack', ok: false });
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
      readSystemPrompt: () => SYSTEM_PROMPT,
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

  it('does not retry a resume the runner aborted', async () => {
    const h = harness([{ lines: [], exit: OK, hang: true }]);
    const controller = new AbortController();
    const pending = collect(h.turn(input({ claudeSessionId: STORED_SESSION_ID }), controller.signal));
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    const events = await pending;
    expect(h.spawn.calls).toHaveLength(1);
    expect(resultOf(events)?.ok).toBe(false);
  });
});
