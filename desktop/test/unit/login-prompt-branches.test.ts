/**
 * Brief 100 round 2, item 8: the login prompt's remaining branches and its small rules.
 *
 *  - the real default password reader (a temp file, never the real secret);
 *  - the `BB2DASH_TEST=1` branch, which records `login-prompt` instead of opening a browser;
 *  - a navigation-policy refusal, which logs and records nothing so the next tick retries;
 *  - one source each for the page origin, the BOM and the id-row check.
 *
 * Modules are re-imported per case with `vi.doMock`, so each case picks its own test-mode flag
 * or policy answer. `electron`'s `shell.openExternal` rejects: no case may reach it.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseConfig } from '../../src/core/config';
import { idOfRow, validateIdRows } from '../../src/core/id-rows';
import type { LoginPromptStore, PromptedOn } from '../../src/core/login-prompt';
import type { RestGet } from '../../src/core/types';

const ANON = { supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature' };
const CONTAINER_ITEM = { ref: 'sync-login-required', kind: 'stack_must_confirm', entity: 'agent_request' };
const DAY_ONE = new Date('2026-10-03T12:00:00Z');
const PASSWORD = 'dummy-novnc-pass';

const fake = vi.hoisted(() => ({
  logged: [] as string[],
  events: [] as { kind: string; payload: unknown }[],
  shellCalls: 0,
}));

vi.mock('electron', () => ({
  shell: {
    openExternal: () => {
      fake.shellCalls += 1;
      return Promise.reject(new Error('the real shell.openExternal must never run under test'));
    },
  },
}));

vi.mock('../../src/main/log', () => ({
  log: (message: string) => fake.logged.push(message),
  logError: (context: string) => fake.logged.push(context),
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bb2dash-login-branches-'));
  fake.logged.length = 0;
  fake.events.length = 0;
  fake.shellCalls = 0;
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../src/main/test-hook');
  vi.doUnmock('../../src/core/navigation-policy');
  rmSync(dir, { recursive: true, force: true });
});

function memoryStore() {
  const writes: PromptedOn[] = [];
  const store: LoginPromptStore = { read: () => ({}), write: (promptedOn) => void writes.push(promptedOn) };
  return { store, writes };
}

const openItem: RestGet = async (_relation, _query, validate) => validate([{ id: 41, ...CONTAINER_ITEM }]);

function queueOnly(passwordFile: string) {
  return parseConfig({ ...ANON, syncLauncher: 'queue-only', novncPasswordFile: passwordFile });
}

function mockTestHook(testMode: boolean): void {
  vi.doMock('../../src/main/test-hook', () => ({
    IS_TEST_MODE: testMode,
    recordEvent: (kind: string, payload: unknown) => fake.events.push({ kind, payload }),
  }));
}

describe('the real default password reader', () => {
  it('reads the configured file itself, BOM and CRLF stripped', async () => {
    mockTestHook(false);
    const file = join(dir, 'novnc_password');
    writeFileSync(file, `\uFEFF${PASSWORD}\r\n`, 'utf8');
    const { createLoginPrompt } = await import('../../src/main/login-prompt');
    const { loginPageUrl } = await import('../../src/core/login-prompt');
    const opened: string[] = [];
    const prompt = createLoginPrompt(queueOnly(file), {
      store: memoryStore().store,
      now: () => DAY_ONE,
      openExternal: async (url) => void opened.push(url),
    });
    await prompt?.check(openItem);
    expect(opened).toEqual([loginPageUrl(PASSWORD)]);
  });
});

describe('BB2DASH_TEST=1', () => {
  it('records login-prompt once, never the URL, and never calls shell.openExternal', async () => {
    mockTestHook(true);
    const file = join(dir, 'novnc_password');
    writeFileSync(file, PASSWORD, 'utf8');
    const { createLoginPrompt } = await import('../../src/main/login-prompt');
    const { store, writes } = memoryStore();
    const prompt = createLoginPrompt(queueOnly(file), { store, now: () => DAY_ONE });
    await prompt?.check(openItem);
    await prompt?.check(openItem);

    expect(fake.events).toEqual([
      { kind: 'login-prompt', payload: { page: 'http://127.0.0.1:6080/vnc.html', unlocked: true } },
    ]);
    expect(JSON.stringify(fake.events)).not.toContain(PASSWORD);
    expect(fake.shellCalls).toBe(0);
    expect(writes).toEqual([{ 41: '2026-10-03' }]);
  });

  it('says unlocked: false when there is no password file', async () => {
    mockTestHook(true);
    const { createLoginPrompt } = await import('../../src/main/login-prompt');
    const prompt = createLoginPrompt(queueOnly(join(dir, 'absent')), { store: memoryStore().store, now: () => DAY_ONE });
    await prompt?.check(openItem);
    expect(fake.events).toEqual([
      { kind: 'login-prompt', payload: { page: 'http://127.0.0.1:6080/vnc.html', unlocked: false } },
    ]);
  });
});

describe('a navigation-policy refusal', () => {
  it('logs the reason, opens nothing and records nothing, so the next tick retries', async () => {
    mockTestHook(false);
    vi.doMock('../../src/core/navigation-policy', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../src/core/navigation-policy')>()),
      decideLoginPageOpen: () => ({ kind: 'drop', reason: 'refused for the test' }),
    }));
    const { createLoginPrompt } = await import('../../src/main/login-prompt');
    const opened: string[] = [];
    const { store, writes } = memoryStore();
    const prompt = createLoginPrompt(queueOnly(join(dir, 'absent')), {
      store,
      now: () => DAY_ONE,
      readFile: () => PASSWORD,
      openExternal: async (url) => void opened.push(url),
    });
    await prompt?.check(openItem);
    await prompt?.check(openItem);

    expect(opened).toEqual([]);
    expect(writes).toEqual([]);
    expect(fake.logged.filter((line) => /refused for the test/.test(line))).toHaveLength(2);
  });
});

describe('one source each', () => {
  const SRC = join(__dirname, '..', '..', 'src');

  function sourceFiles(root: string): string[] {
    return readdirSync(root).flatMap((name) => {
      const full = join(root, name);
      return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
    });
  }

  function code(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('the page URL is built from LOGIN_PAGE_ORIGIN: the loopback origin is spelled once', () => {
    const spelled = sourceFiles(SRC).filter((file) => code(file).includes('127.0.0.1:6080'));
    expect(spelled.map((file) => file.replace(SRC, '').replace(/\\/g, '/'))).toEqual(['/core/navigation-policy.ts']);
  });

  it('no source file holds a raw byte-order mark: it is written as an escape', () => {
    const raw = sourceFiles(SRC).filter((file) => readFileSync(file, 'utf8').includes('\uFEFF'));
    expect(raw).toEqual([]);
  });

  it('sync-terminal.ts and the login prompt share core/id-rows.ts', () => {
    expect(readFileSync(join(SRC, 'main', 'sync-terminal.ts'), 'utf8')).toMatch(/from '\.\.\/core\/id-rows'/);
    expect(readFileSync(join(SRC, 'core', 'login-prompt.ts'), 'utf8')).toMatch(/from '\.\/id-rows'/);
  });

  it('the shared check: a number or string id, as a string; anything else throws by name', () => {
    expect(idOfRow({ id: 12 })).toBe('12');
    expect(idOfRow({ id: '13' })).toBe('13');
    expect(() => idOfRow(null)).toThrow(/row object/);
    expect(() => idOfRow({ id: true })).toThrow(/an id/);
    expect(validateIdRows([{ id: 1 }, { id: '2' }])).toEqual(['1', '2']);
    expect(() => validateIdRows({})).toThrow(/array/);
  });
});
