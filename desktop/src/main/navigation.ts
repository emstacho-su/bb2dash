/**
 * C-4 — attach the allowlist to a window. The rule itself is pure and lives in
 * `core/navigation-policy.ts`; this file is the Electron wiring.
 *
 * Downloads are deliberately not intercepted at all: Chromium's default save
 * behaviour stands (R-23).
 */

import { BrowserWindow, shell } from 'electron';

import { decideNavigation, decidePermission, decideWindowOpen } from '../core/navigation-policy';
import { log, logError } from './log';
import { IS_TEST_MODE, recordEvent } from './test-hook';

function openExternal(url: string): void {
  // Under test the URL is recorded: the e2e suite proves the allowlist end to
  // end without opening Stack's browser on every run.
  if (IS_TEST_MODE) {
    recordEvent('open-external', { url });
    return;
  }
  shell.openExternal(url).catch((error: unknown) => {
    logError(`could not hand ${new URL(url).origin} to the default browser`, error);
  });
}

export function attachNavigationGuards(
  window: BrowserWindow,
  allowedOrigins: readonly string[],
  /** R2-5: the app origin, the only one that may reach the clipboard. */
  appUrl: string = allowedOrigins[0] ?? '',
): void {
  window.webContents.on('will-navigate', (event, url) => {
    const decision = decideNavigation(url, allowedOrigins);
    if (decision.kind === 'allow') return;

    event.preventDefault();
    if (decision.kind === 'external') {
      log(`navigation to ${new URL(decision.url).origin} handed to the default browser`);
      openExternal(decision.url);
      return;
    }
    log(`navigation dropped (${decision.reason})`);
  });

  // A new window is never created. http(s) targets — including the signed
  // Storage URLs the Materials screen opens — go to the default browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(url);
    if (decision.kind === 'external') {
      log(`window.open to ${new URL(decision.url).origin} handed to the default browser`);
      openExternal(decision.url);
    } else if (decision.kind === 'drop') {
      log(`window.open dropped (${decision.reason})`);
    }
    return { action: 'deny' };
  });

  // R2-5: deny everything except the app's own clipboard write, which is what the Sync
  // button's "copy the command" uses. Both handlers are set: `setPermissionRequestHandler`
  // covers the async path, `setPermissionCheckHandler` the synchronous `permissions.query`
  // that Chromium consults first — leaving the second one at its default would let a
  // `query()` report "granted" for something the first handler then denies.
  const decide = (permission: string, requestingUrl: string | undefined): boolean => {
    const decision = decidePermission(permission, requestingUrl, appUrl);
    log(decision.allow ? `permission ${decision.reason}` : `permission denied: ${decision.reason}`);
    recordEvent('permission', { permission, requestingUrl, allowed: decision.allow });
    return decision.allow;
  };

  window.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl ?? contents?.getURL();
    callback(decide(permission, requestingUrl));
  });

  window.webContents.session.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    decide(permission, requestingOrigin),
  );
}
