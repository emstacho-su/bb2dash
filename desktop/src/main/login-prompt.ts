/**
 * Brief 100 (2026-10-03), the Electron login prompt: the wiring. The pure rules are
 * `core/login-prompt.ts`; the one URL this file may hand to the browser is decided by
 * `core/navigation-policy.ts`'s `decideLoginPageOpen`.
 *
 * Under `syncLauncher = queue-only` only. On each poller tick that reads a session, the shell
 * asks PostgREST for the open `sync-login-required` item. The first time it sees an item id it
 * reads the noVNC password from its file and opens the login page once with
 * `shell.openExternal`, then remembers the id, so one login death opens one browser tab — never
 * one per tick and never one per window. The ids live in memory, like the sync watcher's: after a
 * restart an item still open opens the page once more, which is the morning prompt Stack asked for.
 *
 * The password goes only into the URL handed to `openExternal`. No log line carries it or the
 * unlocked URL: a missing or unreadable file is logged by its path and error code, and the page
 * then opens bare (noVNC asks for the password).
 */

import { readFileSync } from 'node:fs';

import { shell } from 'electron';

import { usesSyncTerminal } from '../core/config';
import type { DesktopConfig } from '../core/config';
import {
  LOGIN_ITEMS_QUERY,
  LOGIN_ITEMS_RELATION,
  LOGIN_PAGE_URL,
  loginPageUrl,
  newLoginItems,
  passwordFromFileText,
  validateLoginItems,
} from '../core/login-prompt';
import { decideLoginPageOpen } from '../core/navigation-policy';
import type { RestGet, WebSession } from '../core/types';
import { log, logError } from './log';
import { IS_TEST_MODE, recordEvent } from './test-hook';

export interface LoginPrompt {
  /** One look at the open login item. Opens the page at most once per item id; never rejects. */
  check(get: RestGet): Promise<void>;
}

export interface LoginPromptDeps {
  /** Reads the password file. Injected by the unit tests so none touches a real secret. */
  readonly readFile?: (path: string) => string;
  /** Hands the URL to the default browser. Injected by the unit tests so none opens a tab. */
  readonly openExternal?: (url: string) => Promise<void>;
}

function errorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code === 'string') return code;
  return error instanceof Error ? error.name : 'unknown error';
}

/** Under `BB2DASH_TEST=1` the e2e suite sees that the page would open, never the URL. */
function defaultOpenExternal(url: string): Promise<void> {
  if (IS_TEST_MODE) {
    recordEvent('login-prompt', { page: LOGIN_PAGE_URL, unlocked: url !== loginPageUrl(null) });
    return Promise.resolve();
  }
  return shell.openExternal(url);
}

/** `null` under `syncLauncher = terminal`: the prompt exists only beside the container's runner. */
export function createLoginPrompt(config: DesktopConfig, deps: LoginPromptDeps = {}): LoginPrompt | null {
  if (usesSyncTerminal(config)) return null;

  const passwordFile = config.novncPasswordFile;
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const openExternal = deps.openExternal ?? defaultOpenExternal;
  const prompted = new Set<string>();
  let busy = false;

  function readPassword(): string | null {
    let text: string;
    try {
      text = readFile(passwordFile);
    } catch (error) {
      log(`login prompt: the noVNC password file ${passwordFile} could not be read (${errorCode(error)}); opening the page without it`);
      return null;
    }
    const password = passwordFromFileText(text);
    if (password === null) log(`login prompt: the noVNC password file ${passwordFile} is empty; opening the page without it`);
    return password;
  }

  async function openFor(ids: readonly string[]): Promise<void> {
    const decision = decideLoginPageOpen(loginPageUrl(readPassword()));
    if (decision.kind !== 'external') {
      log(`login prompt: ${LOGIN_PAGE_URL} not opened (${decision.kind === 'drop' ? decision.reason : 'not external'})`);
      return;
    }
    try {
      await openExternal(decision.url);
      log(`login prompt: Blackboard login needed (item ${ids.join(', ')}); opened ${LOGIN_PAGE_URL}`);
    } catch (error) {
      // Freed so the next tick tries again. Only the error's code is logged: its message may
      // quote the unlocked URL.
      for (const id of ids) prompted.delete(id);
      log(`login prompt: could not hand ${LOGIN_PAGE_URL} to the default browser (${errorCode(error)}); the next tick retries`);
    }
  }

  async function check(get: RestGet): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      let openIds: readonly string[];
      try {
        openIds = await get(LOGIN_ITEMS_RELATION, LOGIN_ITEMS_QUERY, validateLoginItems);
      } catch (error) {
        logError('login prompt: the open login item could not be read', error);
        return;
      }
      const fresh = newLoginItems(openIds, prompted);
      if (fresh.length === 0) return;
      // Marked before the browser opens, so a tick arriving meanwhile cannot open a second tab.
      for (const id of fresh) prompted.add(id);
      await openFor(fresh);
    } finally {
      busy = false;
    }
  }

  return { check };
}

/**
 * The poller's session reader with the login check riding on it: each tick reads the session
 * once, so a tick that has one also looks for the login item (owner session, RLS as today).
 * Without a prompt (`terminal`) the reader is returned unchanged.
 */
export function withLoginPromptCheck(
  readSession: () => Promise<WebSession | null>,
  createRest: (session: WebSession) => RestGet,
  prompt: LoginPrompt | null,
): () => Promise<WebSession | null> {
  if (prompt === null) return readSession;
  return async () => {
    const session = await readSession();
    if (session !== null) void prompt.check(createRest(session));
    return session;
  };
}
