/**
 * Brief 100 (2026-10-03), the Electron login prompt: the wiring. The pure rules are
 * `core/login-prompt.ts`; the one URL this file may hand to the browser is decided by
 * `core/navigation-policy.ts`'s `decideLoginPageOpen`.
 *
 * Under `syncLauncher = queue-only` only. On each poller tick that reads a session, the shell
 * asks PostgREST for the container's open `sync-login-required` item. When an item has not opened
 * the page yet on this New York day, it reads the noVNC password from its file, opens the login
 * page once with `shell.openExternal`, and records the date against the item id in `userData`
 * (round 2, item 2). So one login death opens one tab a day — never one per tick or per window —
 * a restart the same day opens nothing new, and an item still open the next morning opens the
 * page again, which is the morning prompt Stack asked for.
 *
 * The password goes only into the URL handed to `openExternal`. No log line carries it or the
 * unlocked URL: a missing or unreadable file is logged by its path and error code, and the page
 * then opens without it (noVNC asks for the password).
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
  recordPrompted,
  validateLoginItems,
} from '../core/login-prompt';
import type { LoginPromptStore, PromptedOn } from '../core/login-prompt';
import { decideLoginPageOpen } from '../core/navigation-policy';
import { nyDate } from '../core/poller/ny-time';
import type { RestGet, WebSession } from '../core/types';
import { log, logError } from './log';
import { IS_TEST_MODE, recordEvent } from './test-hook';

/**
 * Round 2, item 4: how long the browser hand-off may take. `shell.openExternal` has been seen to
 * never settle; without a limit `busy` stays set and every later check is dropped.
 */
export const OPEN_EXTERNAL_TIMEOUT_MS = 15_000;

/** Settles `true` with `work`, or `false` when `ms` pass first; never rejects for the timeout. */
function settlesWithin(work: Promise<void>, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), ms);
    work.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface LoginPrompt {
  /** One look at the open login item. Opens the page at most once per item per day; never rejects. */
  check(get: RestGet): Promise<void>;
}

export interface LoginPromptDeps {
  /** The per-item New York date of the last prompt (`main/login-prompt-store.ts` in the app). */
  readonly store: LoginPromptStore;
  /** The clock the New York date is read from. */
  readonly now?: () => Date;
  /** Reads the password file. Injected by the unit tests so none touches a real secret. */
  readonly readFile?: (path: string) => string;
  /** Hands the URL to the default browser. Injected by the unit tests so none opens a tab. */
  readonly openExternal?: (url: string) => Promise<void>;
  /** `OPEN_EXTERNAL_TIMEOUT_MS` unless a test shortens it. */
  readonly openTimeoutMs?: number;
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
export function createLoginPrompt(config: DesktopConfig, deps: LoginPromptDeps): LoginPrompt | null {
  if (usesSyncTerminal(config)) return null;

  const passwordFile = config.novncPasswordFile;
  const now = deps.now ?? (() => new Date());
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const openExternal = deps.openExternal ?? defaultOpenExternal;
  const openTimeoutMs = deps.openTimeoutMs ?? OPEN_EXTERNAL_TIMEOUT_MS;
  /** Read from the store on the first check, then kept here; every change is written back. */
  let promptedOn: PromptedOn | null = null;
  let busy = false;

  function remembered(): PromptedOn {
    if (promptedOn === null) promptedOn = deps.store.read();
    return promptedOn;
  }

  function remember(next: PromptedOn): void {
    // Memory first: a store that will not write must still not open a second tab today.
    promptedOn = next;
    try {
      deps.store.write(next);
    } catch (error) {
      log(`login prompt: the prompt record could not be saved (${errorCode(error)}); a restart today may open the page again`);
    }
  }

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

  /** True when the browser took the page. */
  async function openFor(ids: readonly string[]): Promise<boolean> {
    const decision = decideLoginPageOpen(loginPageUrl(readPassword()));
    if (decision.kind !== 'external') {
      log(`login prompt: ${LOGIN_PAGE_URL} not opened (${decision.kind === 'drop' ? decision.reason : 'not external'})`);
      return false;
    }
    try {
      if (!(await settlesWithin(openExternal(decision.url), openTimeoutMs))) {
        log(`login prompt: handing ${LOGIN_PAGE_URL} to the default browser timed out after ${openTimeoutMs} ms; the next tick retries`);
        return false;
      }
      log(`login prompt: Blackboard login needed (item ${ids.join(', ')}); opened ${LOGIN_PAGE_URL}`);
      return true;
    } catch (error) {
      // Not recorded, so the next tick tries again. Only the error's code is logged: its message
      // may quote the unlocked URL.
      log(`login prompt: could not hand ${LOGIN_PAGE_URL} to the default browser (${errorCode(error)}); the next tick retries`);
      return false;
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
      const today = nyDate(now());
      const due = newLoginItems(openIds, remembered(), today);
      if (due.length === 0) return;
      if (await openFor(due)) remember(recordPrompted(remembered(), openIds, due, today));
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
