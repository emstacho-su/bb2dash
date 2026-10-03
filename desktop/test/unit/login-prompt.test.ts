/**
 * Brief 100 (2026-10-03), the Electron login prompt. Under `syncLauncher = queue-only` the shell
 * reads the open `sync-login-required` Inbox item on each poller tick and, the first time it sees
 * an item id, opens the container's noVNC login page once in the default browser, already
 * unlocked with the password from its file. Never once per tick or per window, never under
 * `terminal`, and the password never reaches a log line.
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
  validateLoginItems,
} from '../../src/core/login-prompt';
import { LOGIN_PAGE_ORIGIN } from '../../src/core/navigation-policy';
import type { RestGet, WebSession } from '../../src/core/types';
import { createLoginPrompt, withLoginPromptCheck } from '../../src/main/login-prompt';

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

function harness(fileText: string | Error = PASSWORD) {
  const opened: string[] = [];
  const reads: string[] = [];
  const prompt = createLoginPrompt(QUEUE_ONLY, {
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

describe('core/login-prompt — which items are new', () => {
  it('returns the open ids not prompted yet, in order', () => {
    expect(newLoginItems(['7', '9'], new Set(['7']))).toEqual(['9']);
    expect(newLoginItems(['7'], new Set(['7']))).toEqual([]);
    expect(newLoginItems([], new Set())).toEqual([]);
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

  it('terminal never opens it: no login prompt is built', () => {
    expect(createLoginPrompt(TERMINAL, { readFile: () => PASSWORD, openExternal: async () => undefined })).toBeNull();
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
