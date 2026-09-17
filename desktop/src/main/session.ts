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

/** The decoded session, or `null` when there is none the shell can use. */
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
