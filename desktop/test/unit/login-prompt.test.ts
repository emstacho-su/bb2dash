/**
 * Brief 100 (2026-10-03), the Electron login prompt. Under `syncLauncher = queue-only` the shell
 * reads the container's open `sync-login-required` Inbox item on each poller tick and opens the
 * container's noVNC login page in the default browser, already unlocked with the password from its
 * file: once per item per New York day, remembered across restarts (round 2, item 2). Never once
 * per tick or per window, never under `terminal`, and the password never reaches a log line.
 *
 * `electron` and the log are mocked; the file read and `openExternal` are injected, so no test
 * reads a real secret or opens a real browser tab.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as string[]);

vi.mock('electron', () => ({
  shell: {
    openExternal: () => Promise.reject(new Error('the real shell.openExternal must never run under test')),
  },
}));

vi.mock('../../src/main/log', () => ({
  log: (message: string) => logged.push(message),
  logError: (context: string, error: unknown) => logged.push(`${context}: ${String(error)}`),
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

import { parseConfig } from '../../src/core/config';
import {
  LOGIN_ITEMS_QUERY,
  LOGIN_ITEMS_RELATION,
  LOGIN_PAGE_URL,
  loginPageUrl,
  newLoginItems,
  passwordFromFileText,
  recordPrompted,
  validateLoginItems,
} from '../../src/core/login-prompt';
import type { LoginPromptStore, PromptedOn } from '../../src/core/login-prompt';
import { LOGIN_PAGE_ORIGIN } from '../../src/core/navigation-policy';
import type { RestGet, WebSession } from '../../src/core/types';
import { OPEN_EXTERNAL_TIMEOUT_MS, createLoginPrompt, withLoginPromptCheck } from '../../src/main/login-prompt';

const ANON = { supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.anon.signature' };
const QUEUE_ONLY = parseConfig({ ...ANON, syncLauncher: 'queue-only', novncPasswordFile: 'C:\\secrets\\novnc_password' });
const TERMINAL = parseConfig({ ...ANON, syncLauncher: 'terminal', novncPasswordFile: 'C:\\secrets\\novnc_password' });
const PASSWORD = 'p&ss w=rd/x?#';
const BOM = '\uFEFF';

/** The shape of the container's item (round 2, item 3): its ref, kind and entity. */
const CONTAINER_ITEM = { ref: 'sync-login-required', kind: 'stack_must_confirm', entity: 'agent_request' };

/** A RestGet over a fixed list of open container item ids, recording each query it was asked. */
function restOver(ids: readonly (string | number)[]) {
  return restOverRows(ids.map((id) => ({ id, ...CONTAINER_ITEM })));
}

/** A RestGet that answers with exactly `rows`, whatever the query asked for. */
function restOverRows(rows: readonly Record<string, unknown>[]) {
  const queries: { relation: string; query: string }[] = [];
  const get: RestGet = async (relation, query, validate) => {
    queries.push({ relation, query });
    return validate(rows);
  };
  return { get, queries };
}

/** 08:00 in New York on 2026-10-03 (EDT, UTC-4). */
const DAY_ONE = new Date('2026-10-03T12:00:00Z');

/** A store in memory, standing in for `userData/login-prompt.json` across "restarts". */
function memoryStore(initial: PromptedOn = {}) {
  let saved: PromptedOn = { ...initial };
  const writes: PromptedOn[] = [];
  const store: LoginPromptStore = {
    read: () => ({ ...saved }),
    write: (promptedOn) => {
      saved = { ...promptedOn };
      writes.push(saved);
    },
  };
  return { store, writes, saved: () => saved };
}

interface HarnessOptions {
  readonly store?: LoginPromptStore;
  readonly now?: () => Date;
}

function harness(fileText: string | Error = PASSWORD, options: HarnessOptions = {}) {
  const opened: string[] = [];
  const reads: string[] = [];
  const prompt = createLoginPrompt(QUEUE_ONLY, {
    store: options.store ?? memoryStore().store,
    now: options.now ?? (() => DAY_ONE),
    readFile: (path) => {
      reads.push(path);
      if (fileText instanceof Error) throw fileText;
      return fileText;
    },
    openExternal: async (url) => {
      opened.push(url);
    },
  });
  if (prompt === null) throw new Error('queue-only must build a login prompt');
  return { prompt, opened, reads };
}

beforeEach(() => {
  logged.length = 0;
});

describe('core/login-prompt — the page and its URL', () => {
  it('is the frozen noVNC login page, on the origin the navigation policy allows', () => {
    expect(LOGIN_PAGE_URL).toBe('http://127.0.0.1:6080/vnc.html');
    expect(new URL(LOGIN_PAGE_URL).origin).toBe(LOGIN_PAGE_ORIGIN);
  });

  it('carries the URL-encoded password in the fragment only, connecting and scaling by itself', () => {
    const built = loginPageUrl(PASSWORD);
    // Round 2, item 1: noVNC reads its options from the fragment too, and a fragment never
    // reaches websockify, so the password is never in a request line or a server log.
    expect(built).not.toContain('?');
    const url = new URL(built);
    expect(url.origin + url.pathname).toBe(LOGIN_PAGE_URL);
    expect(url.search).toBe('');
    const fragment = new URLSearchParams(url.hash.slice(1));
    expect(fragment.get('autoconnect')).toBe('true');
    expect(fragment.get('resize')).toBe('scale');
    expect(fragment.get('password')).toBe(PASSWORD);
    expect(built.indexOf('password=')).toBeGreaterThan(built.indexOf('#'));
    expect(built).toContain(`password=${encodeURIComponent(PASSWORD)}`);
  });

  it('without a password keeps connecting and scaling, and asks in the page', () => {
    expect(loginPageUrl(null)).toBe(`${LOGIN_PAGE_URL}#autoconnect=true&resize=scale`);
  });

  it("reads the container's open item alone: its ref, kind and entity (round 2, item 3)", () => {
    expect(LOGIN_ITEMS_RELATION).toBe('attention_items');
    expect(LOGIN_ITEMS_QUERY).toBe(
      'select=id,ref,kind,entity&ref=eq.sync-login-required&kind=eq.stack_must_confirm&entity=eq.agent_request&state=eq.open',
    );
  });
});

describe('core/login-prompt — the password file text', () => {
  it('strips a BOM, CR and LF', () => {
    expect(passwordFromFileText(`${BOM}${PASSWORD}\r\n`)).toBe(PASSWORD);
    expect(passwordFromFileText(`${PASSWORD}\n`)).toBe(PASSWORD);
    expect(passwordFromFileText(PASSWORD)).toBe(PASSWORD);
  });

  it('keeps inner spaces: they can be part of a password', () => {
    expect(passwordFromFileText('a b\r\n')).toBe('a b');
  });

  it('is null for an empty file, or one of only a BOM and line breaks', () => {
    expect(passwordFromFileText('')).toBeNull();
    expect(passwordFromFileText(`${BOM}\r\n`)).toBeNull();
  });
});

describe('core/login-prompt — which items are due', () => {
  it('returns the open ids not prompted on this New York day, in order', () => {
    expect(newLoginItems(['7', '9'], { 7: '2026-10-03' }, '2026-10-03')).toEqual(['9']);
    expect(newLoginItems(['7'], { 7: '2026-10-03' }, '2026-10-03')).toEqual([]);
    expect(newLoginItems(['7'], { 7: '2026-10-02' }, '2026-10-03')).toEqual(['7']);
    expect(newLoginItems([], {}, '2026-10-03')).toEqual([]);
  });

  it('records today against the prompted ids and keeps only ids still open; a new object', () => {
    const before: PromptedOn = { 7: '2026-10-02', 3: '2026-09-30' };
    const after = recordPrompted(before, ['7', '9'], ['7', '9'], '2026-10-03');
    expect(after).toEqual({ 7: '2026-10-03', 9: '2026-10-03' });
    expect(before).toEqual({ 7: '2026-10-02', 3: '2026-09-30' });
    expect(recordPrompted({ 7: '2026-10-03' }, ['7', '8'], ['8'], '2026-10-03')).toEqual({
      7: '2026-10-03',
      8: '2026-10-03',
    });
  });

  it('validates the rows to string ids', () => {
    expect(validateLoginItems([{ id: 12, ...CONTAINER_ITEM }, { id: '13', ...CONTAINER_ITEM }])).toEqual(['12', '13']);
    expect(() => validateLoginItems({})).toThrow(/array/);
    expect(() => validateLoginItems([null])).toThrow(/row/);
    expect(() => validateLoginItems([{ id: true, ...CONTAINER_ITEM }])).toThrow(/id/);
  });

  it("keeps only the container's item: another ref, kind or entity is dropped", () => {
    expect(
      validateLoginItems([
        { id: 1, ...CONTAINER_ITEM, ref: 'chrome-login-required' },
        { id: 2, ...CONTAINER_ITEM, kind: 'data_gap' },
        { id: 3, ...CONTAINER_ITEM, entity: 'session' },
        { id: 4 },
        { id: 5, ...CONTAINER_ITEM },
      ]),
    ).toEqual(['5']);
  });
});

describe('main/login-prompt — once per New York day, across restarts (round 2, item 2)', () => {
  it('same day: a second check opens nothing', async () => {
    let now = DAY_ONE;
    const { prompt, opened } = harness(PASSWORD, { now: () => now });
    await prompt.check(restOver([41]).get);
    now = new Date('2026-10-03T21:00:00Z'); // 17:00 New York, the same day
    await prompt.check(restOver([41]).get);
    expect(opened).toHaveLength(1);
  });

  it('next day: an item still open opens the page again', async () => {
    let now = DAY_ONE;
    const { prompt, opened } = harness(PASSWORD, { now: () => now });
    await prompt.check(restOver([41]).get);
    now = new Date('2026-10-04T11:30:00Z'); // 07:30 New York, the next morning
    await prompt.check(restOver([41]).get);
    expect(opened).toHaveLength(2);
  });

  it('restart the same day: the remembered date opens nothing new', async () => {
    const shared = memoryStore();
    const first = harness(PASSWORD, { store: shared.store });
    await first.prompt.check(restOver([41]).get);
    expect(shared.saved()).toEqual({ 41: '2026-10-03' });

    const afterRestart = harness(PASSWORD, { store: shared.store, now: () => new Date('2026-10-03T19:00:00Z') });
    await afterRestart.prompt.check(restOver([41]).get);
    expect(first.opened).toHaveLength(1);
    expect(afterRestart.opened).toEqual([]);
  });

  it("the day is New York's, not UTC's, across midnight UTC", async () => {
    let now = new Date('2026-10-03T22:00:00Z'); // 18:00 New York, 2026-10-03
    const { prompt, opened } = harness(PASSWORD, { now: () => now });
    await prompt.check(restOver([41]).get);
    now = new Date('2026-10-04T02:00:00Z'); // UTC is 10-04; New York is still 22:00 on 10-03
    await prompt.check(restOver([41]).get);
    expect(opened).toHaveLength(1);
    now = new Date('2026-10-04T04:30:00Z'); // 00:30 New York, 2026-10-04
    await prompt.check(restOver([41]).get);
    expect(opened).toHaveLength(2);
  });

  it('remembers only ids still open, so the file never grows', async () => {
    const shared = memoryStore({ 7: '2026-10-01' });
    const { prompt } = harness(PASSWORD, { store: shared.store });
    await prompt.check(restOver([41]).get);
    expect(shared.saved()).toEqual({ 41: '2026-10-03' });
  });

  it('a store that will not write keeps the date in memory: no second tab today', async () => {
    const store: LoginPromptStore = {
      read: () => ({}),
      write: () => {
        throw new Error('EPERM: the userData folder is read-only');
      },
    };
    const { prompt, opened } = harness(PASSWORD, { store });
    await prompt.check(restOver([41]).get);
    await prompt.check(restOver([41]).get);
    expect(opened).toHaveLength(1);
    expect(logged.some((line) => /could not be saved/.test(line))).toBe(true);
  });
});

describe('main/login-prompt — only the container item opens the page (round 2, item 3)', () => {
  it("the Chrome skill's item, or any other ref, never opens the page", async () => {
    const { prompt, opened, reads } = harness();
    await prompt.check(restOverRows([{ id: 61, ...CONTAINER_ITEM, ref: 'chrome-login-required' }]).get);
    await prompt.check(restOverRows([{ id: 62, ...CONTAINER_ITEM, ref: 'agent_request:62' }]).get);
    expect(opened).toEqual([]);
    expect(reads).toEqual([]);
  });
});

describe('main/login-prompt — opening the page', () => {
  it('an open item id opens the page once, with the password', async () => {
    const { prompt, opened, reads } = harness(`${BOM}${PASSWORD}\r\n`);
    const { get, queries } = restOver([41]);
    await prompt.check(get);

    expect(queries).toEqual([{ relation: 'attention_items', query: LOGIN_ITEMS_QUERY }]);
    expect(reads).toEqual(['C:\\secrets\\novnc_password']);
    expect(opened).toEqual([loginPageUrl(PASSWORD)]);
  });

  it('a second tick with the same id opens nothing', async () => {
    const { prompt, opened } = harness();
    const { get } = restOver([41]);
    await prompt.check(get);
    await prompt.check(get);
    await prompt.check(get);
    expect(opened).toHaveLength(1);
  });

  it('a new id opens again: one tab per login death', async () => {
    const { prompt, opened } = harness();
    await prompt.check(restOver([41]).get);
    await prompt.check(restOver([]).get);
    await prompt.check(restOver([57]).get);
    expect(opened).toHaveLength(2);
  });

  it('no open item opens nothing and reads no password', async () => {
    const { prompt, opened, reads } = harness();
    await prompt.check(restOver([]).get);
    expect(opened).toEqual([]);
    expect(reads).toEqual([]);
  });

  it('a missing file opens the bare page and logs the path, never a value', async () => {
    const missing = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    const { prompt, opened } = harness(missing);
    await prompt.check(restOver([41]).get);

    expect(opened).toEqual([loginPageUrl(null)]);
    expect(logged.some((line) => line.includes('C:\\secrets\\novnc_password') && line.includes('ENOENT'))).toBe(true);
  });

  it('an empty file opens the bare page and says the file is empty', async () => {
    const { prompt, opened } = harness('\r\n');
    await prompt.check(restOver([41]).get);
    expect(opened).toEqual([loginPageUrl(null)]);
    expect(logged.some((line) => line.includes('is empty'))).toBe(true);
  });

  it('never writes the password or the unlocked URL to the log', async () => {
    const { prompt } = harness(PASSWORD);
    await prompt.check(restOver([41]).get);
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain(PASSWORD);
      expect(line).not.toContain(encodeURIComponent(PASSWORD));
      expect(line).not.toContain('password=');
    }
  });

  it('a browser that will not open frees the id for the next tick, and logs no URL', async () => {
    const opened: string[] = [];
    let fail = true;
    const prompt = createLoginPrompt(QUEUE_ONLY, {
      store: memoryStore().store,
      now: () => DAY_ONE,
      readFile: () => PASSWORD,
      openExternal: async (url) => {
        if (fail) throw new Error(`could not open ${url}`);
        opened.push(url);
      },
    });
    await prompt?.check(restOver([41]).get);
    fail = false;
    await prompt?.check(restOver([41]).get);

    expect(opened).toHaveLength(1);
    for (const line of logged) expect(line).not.toContain(PASSWORD);
  });

  it('a failed read changes nothing and never throws at the poller', async () => {
    const { prompt, opened } = harness();
    const failing: RestGet = async () => {
      throw new Error('PostgREST 503');
    };
    await expect(prompt.check(failing)).resolves.toBeUndefined();
    await prompt.check(restOver([41]).get);
    expect(opened).toHaveLength(1);
  });

  it('a check while one is still running is dropped, not queued', async () => {
    const { prompt, opened } = harness();
    let release: () => void = () => undefined;
    const slow: RestGet = (_relation, _query, validate) =>
      new Promise((resolve) => {
        release = () => resolve(validate([{ id: 41, ...CONTAINER_ITEM }]));
      });
    const first = prompt.check(slow);
    await prompt.check(restOver([41]).get);
    release();
    await first;
    expect(opened).toHaveLength(1);
  });

  it('a browser hand-off that never settles times out, logs one line and frees the next check (round 2, item 4)', async () => {
    expect(OPEN_EXTERNAL_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    const attempts: string[] = [];
    const prompt = createLoginPrompt(QUEUE_ONLY, {
      store: memoryStore().store,
      now: () => DAY_ONE,
      readFile: () => PASSWORD,
      openExternal: (url) => {
        attempts.push(url);
        return new Promise<void>(() => undefined);
      },
      openTimeoutMs: 20,
    });
    await prompt?.check(restOver([41]).get);
    expect(logged.filter((line) => /timed out/.test(line))).toHaveLength(1);
    // Not recorded as opened, and `busy` is free: the next tick tries again.
    await prompt?.check(restOver([41]).get);
    expect(attempts).toHaveLength(2);
    for (const line of logged) expect(line).not.toContain(PASSWORD);
  });

  it('terminal never opens it: no login prompt is built', () => {
    expect(
      createLoginPrompt(TERMINAL, { store: memoryStore().store, readFile: () => PASSWORD, openExternal: async () => undefined }),
    ).toBeNull();
  });
});

describe('main/login-prompt — riding the poller tick', () => {
  const SESSION: WebSession = { accessToken: 'token', expiresAt: 2_000_000_000 };

  it('hands the session through unchanged and checks with a RestGet bound to it', async () => {
    const checked: RestGet[] = [];
    const boundTo: WebSession[] = [];
    const rest = restOver([]).get;
    const read = withLoginPromptCheck(
      async () => SESSION,
      (session) => {
        boundTo.push(session);
        return rest;
      },
      { check: async (get) => void checked.push(get) },
    );
    await expect(read()).resolves.toBe(SESSION);
    expect(boundTo).toEqual([SESSION]);
    expect(checked).toEqual([rest]);
  });

  it('checks nothing when the tick has no session', async () => {
    const checked: RestGet[] = [];
    const read = withLoginPromptCheck(
      async () => null,
      () => restOver([]).get,
      { check: async (get) => void checked.push(get) },
    );
    await expect(read()).resolves.toBeNull();
    expect(checked).toEqual([]);
  });

  it('is the plain session reader when there is no login prompt (terminal)', () => {
    const reader = async () => SESSION;
    expect(withLoginPromptCheck(reader, () => restOver([]).get, null)).toBe(reader);
  });
});
