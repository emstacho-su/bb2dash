import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CLAUDE_BIN, PATHS } from '../src/config.js';
import {
  DISALLOWED_TOOLS,
  buildArgs,
  buildArgv,
  isUuidShaped,
  planSession,
  readSystemPrompt,
  type CliArgsInput,
} from '../src/providers/claude-cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT_FILE = path.resolve(HERE, '..', 'prompts', 'system.md');
const SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_FILE, 'utf8').trimEnd();

const CONVERSATION_ID = '0b0e7c1e-58a3-4d0b-9d5e-1d2c3b4a5f60';
const NEW_SESSION_ID = '9f1c2d3e-4a5b-4c6d-8e7f-001122334455';
const STORED_SESSION_ID = '5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a11';
const PROMPT = 'What does the IST.323 syllabus say about late work?';
const BARE_FLAG = `--${'bare'}`;

const HEAD = ['claude', '-p', '--model', 'haiku'];

/** The Contract's argv after the session pair, element for element (brief 102, "Argv, frozen"). */
function tail(prompt: string, budget = '1.00'): string[] {
  return [
    '--tools',
    '',
    '--allowedTools',
    'mcp__bb2dash__search_materials',
    'mcp__bb2dash__get_material_text',
    'mcp__bb2dash__list_courses',
    'mcp__rag__search_context',
    '--disallowedTools',
    'Bash',
    'Read',
    'Write',
    'Edit',
    'WebFetch',
    'WebSearch',
    'mcp__rag__get_document',
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    '/run/workspace/mcp.json',
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
    model: 'haiku',
    session: { mode: 'fresh', sessionId: NEW_SESSION_ID },
    systemPrompt: SYSTEM_PROMPT,
    budgetUsd: 1,
    prompt: PROMPT,
    ...overrides,
  };
}

function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

describe('the argv, element for element', () => {
  it('equals the Contract list on a fresh start', () => {
    expect(buildArgv(input())).toEqual([...HEAD, '--session-id', NEW_SESSION_ID, ...tail(PROMPT)]);
  });

  it('equals the Contract list on a resumed turn', () => {
    const argv = buildArgv(input({ session: { mode: 'resume', sessionId: STORED_SESSION_ID } }));
    expect(argv).toEqual([...HEAD, '--resume', STORED_SESSION_ID, ...tail(PROMPT)]);
  });

  it('starts with the claude binary and buildArgs is the rest', () => {
    expect(CLAUDE_BIN).toBe('claude');
    expect(buildArgv(input())).toEqual([CLAUDE_BIN, ...buildArgs(input())]);
  });

  it('passes the alias of each tier as --model', () => {
    for (const alias of ['haiku', 'sonnet', 'opus']) {
      expect(valueAfter(buildArgv(input({ model: alias })), '--model')).toBe(alias);
    }
  });

  it('passes --permission-mode dontAsk on both forms', () => {
    const fresh = buildArgv(input());
    const resumed = buildArgv(input({ session: { mode: 'resume', sessionId: STORED_SESSION_ID } }));
    expect(valueAfter(fresh, '--permission-mode')).toBe('dontAsk');
    expect(valueAfter(resumed, '--permission-mode')).toBe('dontAsk');
    expect(valueAfter(fresh, '--permission-prompts')).toBe('none');
    expect(valueAfter(resumed, '--permission-prompts')).toBe('none');
  });

  it('carries seven disallowed names, mcp__rag__get_document among them', () => {
    expect([...DISALLOWED_TOOLS]).toEqual(['Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'mcp__rag__get_document']);
    const argv = buildArgv(input());
    const from = argv.indexOf('--disallowedTools') + 1;
    const to = argv.indexOf('--permission-mode');
    expect(argv.slice(from, to)).toHaveLength(7);
    expect(argv.slice(from, to)).toContain('mcp__rag__get_document');
  });

  it('disables the built-in tools with an empty --tools value', () => {
    expect(valueAfter(buildArgv(input()), '--tools')).toBe('');
  });

  it('holds --setting-sources project, --system-prompt-snapshot off and --include-hook-events', () => {
    const argv = buildArgv(input());
    expect(valueAfter(argv, '--setting-sources')).toBe('project');
    expect(valueAfter(argv, '--system-prompt-snapshot')).toBe('off');
    expect(argv).toContain('--include-hook-events');
    expect(argv).toContain('--strict-mcp-config');
    expect(argv).toContain('--include-partial-messages');
    expect(argv).toContain('--verbose');
    expect(valueAfter(argv, '--output-format')).toBe('stream-json');
  });

  it('names the in-image MCP config and settings paths', () => {
    const argv = buildArgv(input());
    expect(PATHS.mcpConfig).toBe('/run/workspace/mcp.json');
    expect(PATHS.settings).toBe('/app/workspace/claude/settings.json');
    expect(valueAfter(argv, '--mcp-config')).toBe(PATHS.mcpConfig);
    expect(valueAfter(argv, '--settings')).toBe(PATHS.settings);
  });

  it('takes the two recording substitutions and nothing else', () => {
    const paths = { mcpConfig: '/tmp/rec/mcp.json', settings: '/tmp/rec/settings.json' };
    const argv = buildArgv(input({ paths }));
    const expected = [...HEAD, '--session-id', NEW_SESSION_ID, ...tail(PROMPT)].map((element) => {
      if (element === PATHS.mcpConfig) return paths.mcpConfig;
      if (element === PATHS.settings) return paths.settings;
      return element;
    });
    expect(argv).toEqual(expected);
  });

  it('carries the system prompt file as one element', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(200);
    expect(valueAfter(buildArgv(input()), '--append-system-prompt')).toBe(SYSTEM_PROMPT);
    expect(readSystemPrompt(SYSTEM_PROMPT_FILE)).toBe(SYSTEM_PROMPT);
  });

  it.each([
    [1, '1.00'],
    [0.01, '0.01'],
    [0.5, '0.50'],
  ])('passes the budget %s as %s', (budgetUsd, text) => {
    expect(valueAfter(buildArgv(input({ budgetUsd })), '--max-budget-usd')).toBe(text);
  });

  it.each([[0], [-1], [Number.NaN], [Number.POSITIVE_INFINITY]])('refuses the budget %s', (budgetUsd) => {
    expect(() => buildArgv(input({ budgetUsd }))).toThrow(/budget/);
  });

  it('never passes the bare flag', () => {
    expect(buildArgv(input())).not.toContain(BARE_FLAG);
    expect(buildArgv(input({ session: { mode: 'resume', sessionId: STORED_SESSION_ID } }))).not.toContain(BARE_FLAG);
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
    for (const session of [
      { mode: 'fresh', sessionId: NEW_SESSION_ID } as const,
      { mode: 'resume', sessionId: STORED_SESSION_ID } as const,
    ]) {
      const argv = buildArgv(input({ prompt, session }));
      expect(argv[argv.length - 1]).toBe(prompt);
      expect(argv[argv.length - 2]).toBe('--');
      expect(argv.indexOf('--')).toBe(argv.length - 2);
      expect(argv.filter((element) => element === '--model')).toHaveLength(1);
      expect(valueAfter(argv, '--model')).toBe('haiku');
    }
  });
});

describe('the session pair', () => {
  it('starts fresh with a new random uuid when nothing is stored', () => {
    const start = planSession({ storedSessionId: null, conversationId: CONVERSATION_ID });
    expect(start.mode).toBe('fresh');
    expect(isUuidShaped(start.sessionId)).toBe(true);
    expect(start.sessionId).not.toBe(CONVERSATION_ID);
  });

  it('draws a different uuid for every fresh start', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) ids.add(planSession({ storedSessionId: null, conversationId: CONVERSATION_ID }).sessionId);
    expect(ids.size).toBe(20);
  });

  it("never uses the conversation's id, even if the generator returns it", () => {
    const draws = [CONVERSATION_ID, CONVERSATION_ID, NEW_SESSION_ID];
    const start = planSession({ storedSessionId: null, conversationId: CONVERSATION_ID }, () => draws.shift() ?? NEW_SESSION_ID);
    expect(start).toEqual({ mode: 'fresh', sessionId: NEW_SESSION_ID });
  });

  it('gives up rather than use the conversation id when the generator only returns that', () => {
    expect(() => planSession({ storedSessionId: null, conversationId: CONVERSATION_ID }, () => CONVERSATION_ID)).toThrow(/session id/);
  });

  it('resumes the stored session id on every later turn', () => {
    expect(planSession({ storedSessionId: STORED_SESSION_ID, conversationId: CONVERSATION_ID })).toEqual({
      mode: 'resume',
      sessionId: STORED_SESSION_ID,
    });
  });

  it.each([
    ['not-a-uuid'],
    [''],
    ['5E0C1A52-7D7E-4B8F-9A44-0F6F1F6F0A11'],
    [`${STORED_SESSION_ID} --model opus`],
    ['--fork-session'],
    [`${STORED_SESSION_ID}\n`],
  ])('never puts the stored id %j in argv: a fresh start instead', (stored) => {
    const start = planSession({ storedSessionId: stored, conversationId: CONVERSATION_ID }, () => NEW_SESSION_ID);
    expect(start).toEqual({ mode: 'fresh', sessionId: NEW_SESSION_ID });
    const argv = buildArgv(input({ session: start }));
    // An empty stored id cannot be told apart from the empty --tools value, so it is checked by position.
    if (stored !== '') expect(argv).not.toContain(stored);
    expect(argv).not.toContain('--resume');
    expect(valueAfter(argv, '--session-id')).toBe(NEW_SESSION_ID);
  });

  it.each([['fresh'], ['resume']] as const)('refuses to build a %s argv around an id that is not uuid-shaped', (mode) => {
    expect(() => buildArgv(input({ session: { mode, sessionId: 'x --model opus' } }))).toThrow(/session id/);
  });

  it.each([[''], ['--resume'], ['-x'], ['haiku --resume x']])('refuses the model alias %j', (model) => {
    expect(() => buildArgv(input({ model }))).toThrow(/model/);
  });

  it('reads the uuid shape the database checks', () => {
    expect(isUuidShaped(STORED_SESSION_ID)).toBe(true);
    expect(isUuidShaped('5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a1')).toBe(false);
    expect(isUuidShaped('5e0c1a527d7e4b8f9a440f6f1f6f0a11')).toBe(false);
    expect(isUuidShaped(null)).toBe(false);
    expect(isUuidShaped(42)).toBe(false);
  });
});
