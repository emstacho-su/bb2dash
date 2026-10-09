import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ALLOWED_TOOLS, decide, runGate } from '../src/hooks/gate-rules.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(HERE, '..');
const BUILT_GATE = path.join(PACKAGE, 'dist', 'hooks', 'tool-gate.js');
const SETTINGS = path.join(PACKAGE, 'claude', 'settings.json');
const DENY = 2;
const SILENT = 0;

/** The notes store's search, which the gate no longer allows. */
const NOTES_SEARCH = ['mcp', 'rag', 'search_context'].join('__');
const LIST_COURSES = 'mcp__bb2dash__list_courses';

function payload(toolName: unknown, toolInput: unknown = {}): Record<string, unknown> {
  return { hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, tool_use_id: 'toolu_test' };
}

interface GateRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** The built gate, run the way the CLI runs a command hook: the payload on stdin. */
function runBuiltGate(stdin: string | null): GateRun {
  const result = spawnSync(process.execPath, [BUILT_GATE], {
    input: stdin ?? undefined,
    stdio: stdin === null ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('the gate rules', () => {
  it('names the two allowed tools and nothing else', () => {
    expect([...ALLOWED_TOOLS]).toEqual(['mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text']);
  });

  it('allows the two materials tools', () => {
    expect(decide(payload('mcp__bb2dash__search_materials', { q: 'late work', course: 'IST.323' }))).toEqual({ allow: true });
    expect(decide(payload('mcp__bb2dash__get_material_text', { text_id: 12 }))).toEqual({ allow: true });
  });

  it('no longer allows the course lister or the notes store: the course list is in the context, the notes are not read', () => {
    expect(decide(payload(LIST_COURSES)).allow).toBe(false);
    for (const collection of ['bb2dash', 'bb2dash-inbox-decisions', 'stack', undefined]) {
      expect(decide(payload(NOTES_SEARCH, { query: 'quiz 2', collection })).allow).toBe(false);
    }
  });

  it.each([
    ['Bash'],
    ['Read'],
    ['Write'],
    ['Edit'],
    ['WebFetch'],
    ['WebSearch'],
    ['Task'],
    ['ToolSearch'],
    ['EndConversation'],
    ['mcp__supabase__execute_sql'],
    ['mcp__supabase__apply_migration'],
    ['mcp__supabase_admin__list_tables'],
    ['mcp__claude_ai_Supabase__execute_sql'],
    [['mcp', 'rag', 'get_document'].join('__')],
    [LIST_COURSES],
    [NOTES_SEARCH],
    ['mcp__bb2dash__search_materials '],
    ['MCP__BB2DASH__SEARCH_MATERIALS'],
    ['mcp__bb2dash__delete_everything'],
    ['constructor'],
    ['__proto__'],
  ])('denies %s', (toolName) => {
    const decision = decide(payload(toolName, { collection: 'bb2dash' }));
    expect(decision.allow).toBe(false);
  });

  it.each([[undefined], [null], [7], [''], [['mcp__bb2dash__search_materials']], [{}]])(
    'denies a payload whose tool_name is %j',
    (toolName) => {
      expect(decide({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: {} }).allow).toBe(false);
    },
  );

  it.each([[null], ['mcp__bb2dash__search_materials'], [7], [[payload('mcp__bb2dash__search_materials')]]])(
    'denies a payload that is not an object: %j',
    (value) => {
      expect(decide(value).allow).toBe(false);
    },
  );
});

describe('runGate', () => {
  it('stays silent with exit code 0 for an allowed call', () => {
    expect(runGate(JSON.stringify(payload('mcp__bb2dash__get_material_text', { text_id: 3 })))).toEqual({ exitCode: SILENT, stderr: '' });
  });

  it('answers a denial with exit code 2 and the reason for stderr', () => {
    expect(runGate(JSON.stringify(payload('Bash', { command: 'ls' })))).toEqual({ exitCode: DENY, stderr: 'tool not allowed: Bash' });
  });

  it.each([[''], ['not json'], ['{"tool_name":'], ['[]'], ['null']])('exits 2 for the stdin text %j', (text) => {
    expect(runGate(text).exitCode).toBe(DENY);
  });

  it('exits 2 when the rule itself throws', () => {
    const outcome = runGate(JSON.stringify(payload('mcp__bb2dash__search_materials')), () => {
      throw new Error('boom');
    });
    expect(outcome.exitCode).toBe(DENY);
    expect(outcome.stderr).not.toBe('');
  });
});

// dist/ is built once per run by test/global-setup.ts.
describe('the built gate, run as a process', () => {
  it('is built where the image and the hook command expect it', () => {
    expect(fs.existsSync(BUILT_GATE)).toBe(true);
  });

  it.each(ALLOWED_TOOLS.map((name) => [name]))('exits 0 with empty stdout for %s', (toolName) => {
    const run = runBuiltGate(JSON.stringify(payload(toolName, { q: 'x', text_id: 1 })));
    expect(run.status).toBe(SILENT);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('');
  });

  it('never prints a permission decision for an allowed call', () => {
    const run = runBuiltGate(JSON.stringify(payload('mcp__bb2dash__search_materials', { q: 'x' })));
    expect(run.status).toBe(SILENT);
    expect(run.stdout).not.toMatch(/permissionDecision/);
    expect(run.stdout).toBe('');
  });

  it('exits 2 for an unknown tool, 0 for a listed materials tool and 2 for input that is not JSON (what docker/apply/gate-built.test.mjs also checks)', () => {
    expect(runBuiltGate(JSON.stringify(payload(NOTES_SEARCH, { query: 'x', collection: 'bb2dash' }))).status).toBe(DENY);
    expect(runBuiltGate(JSON.stringify(payload('mcp__bb2dash__get_material_text', { text_id: 1 }))).status).toBe(SILENT);
    expect(runBuiltGate('not json').status).toBe(DENY);
  });

  it.each([['Bash'], ['Write'], ['Task'], ['mcp__supabase__execute_sql'], [LIST_COURSES]])(
    'denies %s with exit code 2 and a reason on stderr',
    (toolName) => {
      const run = runBuiltGate(JSON.stringify(payload(toolName, { command: 'ls' })));
      expect(run.status).toBe(DENY);
      expect(run.stderr.trim()).not.toBe('');
      expect(run.stdout).toBe('');
    },
  );

  it.each([
    ['non-JSON stdin', 'not json'],
    ['empty stdin', ''],
    ['a missing tool_name', JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: {} })],
    ['a tool name that is a number', JSON.stringify(payload(7, { q: 'x' }))],
    ['a tool name that is null', JSON.stringify(payload(null, { q: 'x' }))],
  ])('exits 2, never 1, for %s', (_what, stdin) => {
    const run = runBuiltGate(stdin);
    expect(run.status).toBe(DENY);
    expect(run.stdout).toBe('');
  });

  it('exits 2 when stdin cannot be read at all', () => {
    const run = runBuiltGate(null);
    expect(run.status).toBe(DENY);
    expect(run.stdout).toBe('');
  });
});

describe('claude/settings.json', () => {
  const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as {
    hooks: Record<string, Array<{ matcher?: string; hooks: Array<Record<string, unknown>> }>>;
  };

  it('wires exactly one PreToolUse command hook, for all tools', () => {
    expect(Object.keys(settings.hooks)).toEqual(['PreToolUse']);
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    const entry = settings.hooks.PreToolUse?.[0];
    expect(entry?.matcher).toBe('*');
    expect(entry?.hooks).toEqual([
      { type: 'command', command: 'node /app/workspace/dist/hooks/tool-gate.js', timeout: 600 },
    ]);
  });
});
