/**
 * C-6 — the PostgREST reader the rest of main uses, with the two Electron-side
 * dependencies bound in: the access token comes from the window's cookie jar
 * (`session.ts`) and failures go to the rolling log.
 *
 * The helper itself is `core/rest.ts`; this is thirty lines of wiring so that
 * a container later swaps only this file.
 */

import type { DesktopConfig } from '../core/config';
import { createRestGet } from '../core/rest';
import type { RestGet } from '../core/types';
import { log } from './log';
import { createAccessTokenReader } from './session';

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
  });
}
