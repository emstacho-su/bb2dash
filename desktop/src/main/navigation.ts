/**
 * C-4 — attach the allowlist to a window. The rule itself is pure and lives in
 * `core/navigation-policy.ts`; this file is the Electron wiring.
 *
 * Downloads are deliberately not intercepted at all: Chromium's default save
 * behaviour stands (R-23).
 */

import { BrowserWindow, shell } from 'electron';

import { decideNavigation, decideWindowOpen } from '../core/navigation-policy';
import { log, logError } from './log';

function openExternal(url: string): void {
  shell.openExternal(url).catch((error: unknown) => {
    logError(`could not hand ${new URL(url).origin} to the default browser`, error);
  });
}

export function attachNavigationGuards(
  window: BrowserWindow,
  allowedOrigins: readonly string[],
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

  // Nothing in the renderer needs an OS permission: the toasts are main's.
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    log(`permission "${permission}" denied`);
    callback(false);
  });
}
