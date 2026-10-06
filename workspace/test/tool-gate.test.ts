import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  ALLOWED_TOOLS,
  COLLECTION_DENY_REASON,
  RAG_COLLECTIONS,
  decide,
  runGate,
} from '../src/hooks/gate-rules.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE = path.resolve(HERE, '..');
const BUILT_GATE = path.join(PACKAGE, 'dist', 'hooks', 'tool-gate.js');
const SETTINGS = path.join(PACKAGE, 'claude', 'settings.json');
const BUILD_TIMEOUT_MS = 120_000;
const DENY = 2;
const SILENT = 0;

const SEARCH_CONTEXT = 'mcp__rag__search_context';

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
  it('names the four allowed tools and the two collections', () => {
    expect([...ALLOWED_TOOLS]).toEqual([
      'mcp__bb2dash__search_materials',
      'mcp__bb2dash__get_material_text',
      'mcp__bb2dash__list_courses',
      'mcp__rag__search_context',
    ]);
    expect([...RAG_COLLECTIONS]).toEqual(['bb2dash', 'bb2dash-inbox-decisions']);
    expect(COLLECTION_DENY_REASON).toBe('collection must be one of: bb2dash, bb2dash-inbox-decisions');
  });

  it('allows the three materials tools', () => {
    expect(decide(payload('mcp__bb2dash__search_materials', { q: 'late work', course: 'IST.323' }))).toEqual({ allow: true });
    expect(decide(payload('mcp__bb2dash__get_material_text', { text_id: 12 }))).toEqual({ allow: true });
    expect(decide(payload('mcp__bb2dash__list_courses'))).toEqual({ allow: true });
  });

  it.each(RAG_COLLECTIONS.map((name) => [name]))('allows search_context on %s', (collection) => {
    expect(decide(payload(SEARCH_CONTEXT, { query: 'quiz 2', collection }))).toEqual({ allow: true });
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
    ['mcp__rag__get_document'],
    ['mcp__bb2dash__search_materials '],
    ['MCP__BB2DASH__SEARCH_MATERIALS'],
    ['mcp__bb2dash__delete_everything'],
    ['constructor'],
    ['__proto__'],
  ])('denies %s', (toolName) => {
    const decision = decide(payload(toolName, { collection: 'bb2dash' }));
    expect(decision.allow).toBe(false);
  });

  it('denies search_context with no collection, with the collection sentence as the reason', () => {
    expect(decide(payload(SEARCH_CONTEXT, { query: 'quiz 2' }))).toEqual({ allow: false, reason: COLLECTION_DENY_REASON });
    expect(decide(payload(SEARCH_CONTEXT))).toEqual({ allow: false, reason: COLLECTION_DENY_REASON });
    expect(decide({ hook_event_name: 'PreToolUse', tool_name: SEARCH_CONTEXT })).toEqual({
      allow: false,
      reason: COLLECTION_DENY_REASON,
    });
  });

  it.each([['stack'], ['estac'], ['ist466'], [''], ['bb2dash,bb2dash-inbox-decisions'], ['bb2dash-inbox']])(
    'denies search_context on the collection %j, which is off the list',
    (collection) => {
      expect(decide(payload(SEARCH_CONTEXT, { query: 'x', collection }))).toEqual({
        allow: false,
        reason: COLLECTION_DENY_REASON,
      });
    },
  );

  it.each([['Bb2dash'], [' bb2dash'], ['bb2dash '], ['BB2DASH-INBOX-DECISIONS'], ['bb2dash\n']])(
    'compares the collection exactly: %j is denied',
    (collection) => {
      expect(decide(payload(SEARCH_CONTEXT, { query: 'x', collection })).allow).toBe(false);
    },
  );

  it.each([[['bb2dash']], [7], [null], [{ name: 'bb2dash' }], [true]])(
    'denies a collection that is not a string: %j',
    (collection) => {
      expect(decide(payload(SEARCH_CONTEXT, { query: 'x', collection })).allow).toBe(false);
    },
  );

  it.each([[undefined], [null], [7], [''], [['mcp__bb2dash__list_courses']], [{}]])(
    'denies a payload whose tool_name is %j',
    (toolName) => {
      expect(decide({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: {} }).allow).toBe(false);
    },
  );

  it.each([[null], ['mcp__bb2dash__list_courses'], [7], [[payload('mcp__bb2dash__list_courses')]]])(
    'denies a payload that is not an object: %j',
    (value) => {
      expect(decide(value).allow).toBe(false);
    },
  );
});

describe('runGate', () => {
  it('stays silent with exit code 0 for an allowed call', () => {
    expect(runGate(JSON.stringify(payload('mcp__bb2dash__list_courses')))).toEqual({ exitCode: SILENT, stderr: '' });
  });

  it('answers a denial with exit code 2 and the reason for stderr', () => {
    expect(runGate(JSON.stringify(payload(SEARCH_CONTEXT, { query: 'x', collection: 'stack' })))).toEqual({
      exitCode: DENY,
      stderr: COLLECTION_DENY_REASON,
    });
  });

  it.each([[''], ['not json'], ['{"tool_name":'], ['[]'], ['null']])('exits 2 for the stdin text %j', (text) => {
    expect(runGate(text).exitCode).toBe(DENY);
  });

  it('exits 2 when the rule itself throws', () => {
    const outcome = runGate(JSON.stringify(payload('mcp__bb2dash__list_courses')), () => {
      throw new Error('boom');
    });
    expect(outcome.exitCode).toBe(DENY);
    expect(outcome.stderr).not.toBe('');
  });
});

describe('the built gate, run as a process', () => {
  beforeAll(() => {
    execFileSync(process.execPath, [path.join(PACKAGE, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], {
      cwd: PACKAGE,
      stdio: 'pipe',
    });
  }, BUILD_TIMEOUT_MS);

  it('is built where the image and the hook command expect it', () => {
    expect(fs.existsSync(BUILT_GATE)).toBe(true);
  });

  it.each(ALLOWED_TOOLS.map((name) => [name]))('exits 0 with empty stdout for %s', (toolName) => {
    const run = runBuiltGate(JSON.stringify(payload(toolName, { q: 'x', query: 'x', collection: 'bb2dash' })));
    expect(run.status).toBe(SILENT);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('');
  });

  it('never prints a permission decision for an allowed call', () => {
    const run = runBuiltGate(JSON.stringify(payload(SEARCH_CONTEXT, { query: 'x', collection: 'bb2dash-inbox-decisions' })));
    expect(run.status).toBe(SILENT);
    expect(run.stdout).not.toMatch(/permissionDecision/);
    expect(run.stdout).toBe('');
  });

  it('denies a collection off the list with exit code 2 and the reason on stderr', () => {
    const run = runBuiltGate(JSON.stringify(payload(SEARCH_CONTEXT, { query: 'x', collection: 'estac' })));
    expect(run.status).toBe(DENY);
    expect(run.stderr.trim()).toBe(COLLECTION_DENY_REASON);
    expect(run.stdout).toBe('');
  });

  it.each([['Bash'], ['Write'], ['Task'], ['mcp__supabase__execute_sql'], ['mcp__rag__get_document']])(
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
    ['a collection that is an array', JSON.stringify(payload(SEARCH_CONTEXT, { collection: ['bb2dash'] }))],
    ['a collection that is a number', JSON.stringify(payload(SEARCH_CONTEXT, { collection: 7 }))],
    ['a collection that is null', JSON.stringify(payload(SEARCH_CONTEXT, { collection: null }))],
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
