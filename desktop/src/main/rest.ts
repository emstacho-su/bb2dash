/**
 * C-6 — the PostgREST readers the rest of main uses, with the two Electron-side
 * dependencies bound in: the access token comes from the window's cookie jar
 * (`session.ts`) and failures go to the rolling log.
 *
 * The helper itself is `core/rest.ts`; this is the wiring, so that a container
 * later swaps only this file.
 *
 * There are two callers and they want different things:
 *
 *  - the sync watcher (C-8) makes one read when the renderer files a request, and
 *    wants the token looked up at that moment: `createMainRest`;
 *  - the poller (C-7) reads the session once at the top of a tick and then makes
 *    three relation reads, and must not re-open the cookie jar for each:
 *    `createMainSessionRest`, which is `PollerDeps.createRest`.
 *
 * Both share one error throttle, because C-6's "logged once per relation per hour"
 * is a property of the process, not of a reader instance — and the poller builds a
 * new reader every tick.
 */

import type { DesktopConfig } from '../core/config';
import { createErrorThrottle, createRestGet, createRestGetForToken } from '../core/rest';
import type { RestGet, WebSession } from '../core/types';
import { log } from './log';
import { createAccessTokenReader } from './session';

const shouldLog = createErrorThrottle();

/** A reader that looks the token up per call. Used by the sync watcher (C-8). */
export function createMainRest(config: DesktopConfig): RestGet {
  const getAccessToken = createAccessTokenReader({
    appUrl: config.appUrl,
    supabaseUrl: config.supabaseUrl,
  });

  return createRestGet({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    getAccessToken,
    log,
    shouldLog,
  });
}

/** `PollerDeps.createRest`: a reader bound to the session this tick already read. */
export function createMainSessionRest(
  config: DesktopConfig,
): (session: WebSession) => RestGet {
  return (session) =>
    createRestGetForToken({
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      session,
      log,
      shouldLog,
    });
}
