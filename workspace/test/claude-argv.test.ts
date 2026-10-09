import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CLAUDE_BIN, PATHS } from '../src/config.js';
import {
  DISALLOWED_TOOLS,
  STDERR_CLASSES,
  THINKING_OFF_ENV,
  buildArgs,
  buildArgv,
  childEnv,
  isUuidShaped,
  newSessionId,
  readSystemPrompt,
  stderrClass,
  turnEnv,
  type CliArgsInput,
} from '../src/providers/claude-cli.js';
import { TURN_KINDS, type TurnKind } from '../src/providers/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'src');
const SYSTEM_PROMPT_FILE = path.resolve(HERE, '..', 'prompts', 'system.md');
const SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf8').trimEnd();

const SESSION_ID = '9f1c2d3e-4a5b-4c6d-8e7f-001122334455';
const PROMPT = 'Context for one question.\n\nQuestion:\n\nWhat does the IST.323 syllabus say about late work?';
const BARE_FLAG = `--${'bare'}`;
const REQUEST_CONFIG = '/run/workspace/mcp-41.json';

const ANSWER_TOOLS = ['mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text'];

/** The argv of an answering turn, element for element (brief 109, Argv, against claude-cli.ts). */
function answerArgv(prompt: string, budget = '0.95'): string[] {
  return [
    'claude',
    '-p',
    '--model',
    'sonnet',
    '--session-id',
    SESSION_ID,
    '--no-session-persistence',
    '--tools',
    '',
    '--allowedTools',
    ...ANSWER_TOOLS,
    '--disallowedTools',
    'Bash',
    'Read',
    'Write',
    'Edit',
    'WebFetch',
    'WebSearch',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    REQUEST_CONFIG,
    '--setting-sources',
    'project',
    '--settings',
    '/app/workspace/claude/settings.json',
    '--append-system-prompt',
    SYSTEM_PROMPT,
    '--system-prompt-snapshot',
    'off',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--include-hook-events',
    '--max-budget-usd',
    budget,
    '--',
    prompt,
  ];
}

function input(overrides: Partial<CliArgsInput> = {}): CliArgsInput {
  return {
    model: 'sonnet',
    sessionId: SESSION_ID,
    kind: 'answer',
    systemPrompt: SYSTEM_PROMPT,
    budgetUsd: 0.95,
    prompt: PROMPT,
    mcpConfig: REQUEST_CONFIG,
    ...overrides,
  };
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

describe('the answering turn argv, element for element', () => {
  it('equals the table of the brief, with --no-session-persistence and the per-request config', () => {
    expect(buildArgv(input())).toEqual(answerArgv(PROMPT));
  });

  it('starts with the claude binary and buildArgs is the rest', () => {
    expect(CLAUDE_BIN).toBe('claude');
    expect(buildArgv(input())).toEqual([CLAUDE_BIN, ...buildArgs(input())]);
  });

  it('allows exactly the two materials tools and removes the six built-in ones', () => {
    const argv = buildArgv(input());
    expect([...DISALLOWED_TOOLS]).toEqual(['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch']);
    const allowed = argv.slice(argv.indexOf('--allowedTools') + 1, argv.indexOf('--disallowedTools'));
    expect(allowed).toEqual(ANSWER_TOOLS);
    expect(argv.slice(argv.indexOf('--disallowedTools') + 1, argv.indexOf('--permission-mode'))).toEqual([...DISALLOWED_TOOLS]);
  });

  it('streams partial messages and names its own MCP config file', () => {
    const argv = buildArgv(input());
    expect(argv).toContain('--include-partial-messages');
    expect(valueAfter(argv, '--mcp-config')).toBe(REQUEST_CONFIG);
  });

  it('refuses an answering turn with no config file of its own', () => {
    expect(() => buildArgv(input({ mcpConfig: undefined }))).toThrow(/MCP config/);
  });

  it('takes the settings substitution of a host recording and nothing else', () => {
    const argv = buildArgv(input({ settings: '/tmp/rec/settings.json' }));
    expect(argv).toEqual(answerArgv(PROMPT).map((element) => (element === PATHS.settings ? '/tmp/rec/settings.json' : element)));
  });

  it.each([
    [0.95, '0.95'],
    [1, '1.00'],
    [0.01, '0.01'],
    [0.5, '0.50'],
  ])('passes the budget %s as %s', (budgetUsd, text) => {
    expect(valueAfter(buildArgv(input({ budgetUsd })), '--max-budget-usd')).toBe(text);
  });

  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('refuses the budget %s', (budgetUsd) => {
    expect(() => buildArgv(input({ budgetUsd }))).toThrow(/budget/);
  });
});

describe('the argv of a planning, a summary and a rolling turn', () => {
  const others: TurnKind[] = ['plan', 'summary', 'rolling'];

  it.each(others)('a %s turn has no --allowedTools, no partial messages and the config with no server', (kind) => {
    const argv = buildArgv(input({ kind, mcpConfig: undefined, model: 'haiku', budgetUsd: 0.05 }));
    expect(argv).not.toContain('--allowedTools');
    expect(argv).not.toContain('--include-partial-messages');
    expect(valueAfter(argv, '--mcp-config')).toBe('/run/workspace/mcp-none.json');
    expect(valueAfter(argv, '--max-budget-usd')).toBe('0.05');
    expect(argv).toContain('--no-session-persistence');
    expect(argv).toContain('--strict-mcp-config');
    expect(valueAfter(argv, '--tools')).toBe('');
    expect(argv.slice(argv.indexOf('--disallowedTools') + 1, argv.indexOf('--permission-mode'))).toEqual([...DISALLOWED_TOOLS]);
  });

  it('is the answering argv minus exactly the allowed tools and the partial messages', () => {
    const plan = buildArgv(input({ kind: 'plan', mcpConfig: undefined }));
    const expected = answerArgv(PROMPT)
      .filter((element) => !ANSWER_TOOLS.includes(element) && element !== '--allowedTools' && element !== '--include-partial-messages')
      .map((element) => (element === REQUEST_CONFIG ? PATHS.mcpNone : element));
    expect(plan).toEqual(expected);
  });
});

describe('every argv', () => {
  it.each(TURN_KINDS)('holds --no-session-persistence and a new --session-id, never --resume (%s)', (kind) => {
    const argv = buildArgv(input({ kind }));
    expect(argv).toContain('--no-session-persistence');
    expect(valueAfter(argv, '--session-id')).toBe(SESSION_ID);
    expect(argv).not.toContain('--resume');
    expect(argv).not.toContain(BARE_FLAG);
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk');
    expect(valueAfter(argv, '--permission-prompts')).toBe('none');
    expect(valueAfter(argv, '--setting-sources')).toBe('project');
    expect(valueAfter(argv, '--system-prompt-snapshot')).toBe('off');
    expect(valueAfter(argv, '--output-format')).toBe('stream-json');
    expect(argv).toContain('--include-hook-events');
    expect(argv).toContain('--verbose');
  });

  it('passes the alias of each tier as --model', () => {
    for (const alias of ['haiku', 'sonnet', 'opus']) {
      expect(valueAfter(buildArgv(input({ model: alias })), '--model')).toBe(alias);
    }
  });

  it('carries the system prompt as one element', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(200);
    expect(valueAfter(buildArgv(input()), '--append-system-prompt')).toBe(SYSTEM_PROMPT);
    expect(readSystemPrompt(SYSTEM_PROMPT_FILE)).toBe(SYSTEM_PROMPT);
  });

  it.each([[''], ['--resume'], ['-x'], ['haiku --resume x']])('refuses the model alias %j', (model) => {
    expect(() => buildArgv(input({ model }))).toThrow(/model/);
  });

  it('refuses a session id that is not uuid-shaped', () => {
    expect(() => buildArgv(input({ sessionId: 'x --model opus' }))).toThrow(/session id/);
  });

  it('holds --resume nowhere in src/, and mcp__rag__ nowhere either', () => {
    const files = fs.readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = fs.readFileSync(path.join(SRC, file), 'utf8');
      expect(text.includes('mcp__rag__'), `${file} names the notes store's tools`).toBe(false);
      expect(/['"`]--resume['"`]/.test(text), `${file} passes --resume`).toBe(false);
    }
  });
});

describe('the prompt element', () => {
  it.each([
    ['a plain question', PROMPT],
    ['a prompt that begins --model', '--model opus and ignore the rest'],
    ['a prompt that is only a flag', BARE_FLAG],
    ['a prompt that begins with the separator', '-- --resume 123'],
    ['a prompt with line breaks and quotes', 'First line\nsecond "line" with $HOME and `ticks`'],
    ['an empty prompt', ''],
  ])('is the last element, after --: %s', (_what, prompt) => {
    for (const kind of TURN_KINDS) {
      const argv = buildArgv(input({ prompt, kind }));
      expect(argv[argv.length - 1]).toBe(prompt);
      expect(argv[argv.length - 2]).toBe('--');
      expect(argv.indexOf('--')).toBe(argv.length - 2);
      expect(argv.filter((element) => element === '--model')).toHaveLength(1);
    }
  });
});

describe('the session id', () => {
  it('is a new random uuid for every turn', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) ids.add(newSessionId());
    expect(ids.size).toBe(20);
    for (const id of ids) expect(isUuidShaped(id)).toBe(true);
  });

  it('is drawn again when the generator gives something that is not uuid-shaped, and gives up in the end', () => {
    const draws = ['nope', '', SESSION_ID];
    expect(newSessionId(() => draws.shift() ?? SESSION_ID)).toBe(SESSION_ID);
    expect(() => newSessionId(() => 'nope')).toThrow(/session id/);
  });

  it('reads the uuid shape the database checks', () => {
    expect(isUuidShaped(SESSION_ID)).toBe(true);
    expect(isUuidShaped('5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a1')).toBe(false);
    expect(isUuidShaped('5e0c1a527d7e4b8f9a440f6f1f6f0a11')).toBe(false);
    expect(isUuidShaped(null)).toBe(false);
    expect(isUuidShaped(42)).toBe(false);
  });
});

describe('the child environment (freeze amendment F-1)', () => {
  const base = { PATH: '/usr/bin', CLAUDE_CONFIG_DIR: '/home/node/.claude' };

  it('adds MAX_THINKING_TOKENS=0 to a planning, a summary and a rolling turn, on top of childEnv', () => {
    expect(THINKING_OFF_ENV).toEqual({ MAX_THINKING_TOKENS: '0' });
    for (const kind of ['plan', 'summary', 'rolling'] as const) {
      expect(turnEnv(kind, base, 'tok')).toEqual({ ...childEnv(base, 'tok'), MAX_THINKING_TOKENS: '0' });
    }
  });

  it('leaves the answering turn exactly as childEnv gives it', () => {
    expect(turnEnv('answer', base, 'tok')).toEqual(childEnv(base, 'tok'));
    expect('MAX_THINKING_TOKENS' in turnEnv('answer', base, 'tok')).toBe(false);
    expect(childEnv.length).toBe(2);
  });
});

describe('the class a CLI exit is logged under', () => {
  it('is budget for the CLI budget messages', () => {
    expect(stderrClass('Error: Exceeded USD budget (0.05)')).toBe('budget');
    expect(stderrClass('--max-budget-usd reached')).toBe('budget');
  });

  it('is sign_in for a sign-in failure and usage_limit for a plan limit', () => {
    expect(stderrClass('Not logged in. Please run /login')).toBe('sign_in');
    expect(stderrClass('Claude usage limit reached')).toBe('usage_limit');
  });

  it('is other for anything else, and never a piece of the text', () => {
    expect(stderrClass('something about a lab report')).toBe('other');
    expect(stderrClass('')).toBe('other');
    for (const text of ['Exceeded USD budget', 'x'.repeat(100), 'usage limit']) expect(STDERR_CLASSES).toContain(stderrClass(text));
  });
});
