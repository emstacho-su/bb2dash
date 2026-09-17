/**
 * C-5 — read the web session's access token out of the window's cookie jar.
 *
 * Login happens on the web app's own `/login` page inside the window;
 * `@supabase/ssr` writes the auth cookie into the `persist:bb2dash` partition
 * with a 400-day `Max-Age`, which is what makes it survive a restart (a
 * session-flagged cookie would not: electron#9995).
 *
 * Main reads that cookie, holds the token in memory for the length of one
 * PostgREST read, and **never refreshes it** — refresh-token rotation stays the
 * renderer's, so the two can never race. Nothing here writes a token to disk or
 * to a log.
 */

import { session as electronSession } from 'electron';

import { authCookieBaseName, decodeSession, isExpired } from '../core/session-decode';
import type { RawCookie } from '../core/session-decode';
import type { WebSession } from '../core/types';
import { log, logError } from './log';
import { recordEvent } from './test-hook';
import { PARTITION } from './window';

/**
 * Cookies of the partition, url-scoped to the app first (the auth cookie is set
 * on the app origin) and falling back to the whole jar.
 */
async function readCookies(appUrl: string): Promise<readonly RawCookie[]> {
  const jar = electronSession.fromPartition(PARTITION).cookies;
  const scoped = await jar.get({ url: appUrl });
  const rows = scoped.length > 0 ? scoped : await jar.get({});
  return rows.map((cookie) => ({ name: cookie.name, value: cookie.value }));
}

export interface SessionSource {
  readonly appUrl: string;
  readonly supabaseUrl: string;
}

/** The decoded session, expired or not. Use `readUsableSession` for the poller's answer. */
export async function readWebSession(source: SessionSource): Promise<WebSession | null> {
  try {
    const cookies = await readCookies(source.appUrl);
    return decodeSession(cookies, authCookieBaseName(source.supabaseUrl));
  } catch (error) {
    logError('the partition cookies could not be read', error);
    return null;
  }
}

/**
 * R2-4 — how long to leave between reloads of a hidden window.
 *
 * Reloading is how an expired session gets refreshed (see `readUsableSession`), and it is
 * cheap but not free: it re-runs the app's whole render. Ten minutes is far more often
 * than the access token's hour and far less often than the poller's 15-minute tick, so a
 * long sleep costs one reload, not one per tick.
 */
export const HIDDEN_RELOAD_MIN_INTERVAL_MS = 10 * 60 * 1000;

export interface UsableSessionOptions extends SessionSource {
  /** The single reused window (C-12), or `null` before it exists. */
  readonly getWindow: () => { isVisible(): boolean; isDestroyed(): boolean } | null;
  /** Reload that window. Injected so the unit suite needs no Electron. */
  readonly reload: () => void;
  readonly now?: () => number;
}

/**
 * R2-4 — the session the poller may actually use, and the nudge that gets a new one.
 *
 * `index.ts` used to hand the poller a bare `readWebSession`, which returns whatever is in
 * the cookie jar including a token that expired hours ago. Every tick then sent that token
 * and every PostgREST read came back 401 — logged once an hour by C-6's throttle, so
 * silently in practice, and no toast ever fired again.
 *
 * Two halves:
 *
 *  1. An expired session reads as `null`, so the tick skips instead of 401-ing (C-5: main
 *     never refreshes).
 *  2. While the window is *visible* the page refreshes itself and there is nothing to do.
 *     Hidden to the tray (C-12) it does not: supabase-js stops its auto-refresh timer when
 *     the document is hidden, so an hour after hide-to-tray the cookie is stale and stays
 *     stale. So main reloads the hidden window, and the *web app* refreshes the cookie —
 *     `web/src/proxy.ts` runs on every route the shell can reach and calls
 *     `supabase.auth.getUser()` through a `createServerClient` whose `setAll` writes the
 *     rotated cookie onto the response (`web/src/lib/supabase/proxy-session.ts`). Main
 *     still never calls the auth API itself, so C-5 stands: this is a navigation, not a
 *     token operation.
 */
export function createUsableSessionReader(
  options: UsableSessionOptions,
): () => Promise<WebSession | null> {
  const now = options.now ?? (() => Date.now());
  let lastReloadAt = 0;
  let loggedExpiry = false;

  return async () => {
    const webSession = await readWebSession(options);
    if (webSession !== null && !isExpired(webSession, now())) {
      loggedExpiry = false;
      return webSession;
    }

    if (!loggedExpiry) {
      log(
        webSession === null
          ? 'no web session in the partition; skipping the tick'
          : 'the web session has expired; skipping the tick',
      );
      loggedExpiry = true;
    }

    const window = options.getWindow();
    if (window === null || window.isDestroyed() || window.isVisible()) {
      // A visible window refreshes itself; a missing one has nothing to reload.
      return null;
    }

    const at = now();
    if (at - lastReloadAt < HIDDEN_RELOAD_MIN_INTERVAL_MS) return null;
    lastReloadAt = at;

    log('reloading the hidden window so the web app can refresh the session cookie');
    recordEvent('hidden-reload', { reason: webSession === null ? 'no-session' : 'expired' });
    try {
      options.reload();
    } catch (error) {
      logError('the hidden window could not be reloaded', error);
    }
    // This tick is still skipped: the reload is asynchronous and the next tick reads the
    // cookie the page will have rewritten by then.
    return null;
  };
}

/**
 * The access token a PostgREST read needs, or `null`. An expired token is
 * `null` too: C-5 says the tick is skipped and retried, never refreshed here.
 */
export function createAccessTokenReader(
  source: SessionSource,
  now: () => number = () => Date.now(),
): () => Promise<string | null> {
  let loggedExpiry = false;

  return async () => {
    const webSession = await readWebSession(source);
    if (webSession === null) return null;

    if (isExpired(webSession, now())) {
      if (!loggedExpiry) {
        log('the web session has expired; skipping the tick until the page refreshes it');
        loggedExpiry = true;
      }
      return null;
    }

    loggedExpiry = false;
    return webSession.accessToken;
  };
}
