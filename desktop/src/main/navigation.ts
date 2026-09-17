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

/**
 * What all three navigation events hand us: where the frame wants to go, whether
 * it is the main frame, and the veto.
 */
interface NavigationEvent {
  readonly url: string;
  readonly isMainFrame: boolean;
  preventDefault(): void;
}

/**
 * P-shell-2 — one decision for every way the window can navigate.
 *
 * `will-navigate` fires for the main frame and for nothing else, so attaching the
 * allowlist to it alone left two doors open: a server-side redirect continues a
 * navigation that was already allowed to start (an allowed origin could 302 the
 * window anywhere), and a subframe could navigate itself off the allowlist
 * without the rule ever seeing it.
 *
 * The answer is `decideNavigation`'s, unchanged. What differs by event is only
 * what happens to an `external` verdict: the MAIN frame is Stack following a
 * link, so it goes to his default browser; a SUBFRAME is the page moving itself,
 * so it is dropped and logged. Handing a frame's target to Chrome would turn any
 * embedded frame into a pop-up.
 */
function guard(
  details: NavigationEvent,
  allowedOrigins: readonly string[],
  source: 'will-navigate' | 'will-redirect' | 'will-frame-navigate',
): void {
  const decision = decideNavigation(details.url, allowedOrigins);
  if (decision.kind === 'allow') return;

  details.preventDefault();

  if (decision.kind === 'external' && details.isMainFrame) {
    log(`${source} to ${new URL(decision.url).origin} handed to the default browser`);
    openExternal(decision.url);
    return;
  }

  const reason =
    decision.kind === 'drop'
      ? decision.reason
      : `subframe to ${new URL(decision.url).origin} is not on the allowlist`;
  log(`${source} dropped (${reason})`);
  recordEvent('navigation-blocked', { source, url: details.url, reason });
}

export function attachNavigationGuards(
  window: BrowserWindow,
  allowedOrigins: readonly string[],
  /** R2-5: the app origin, the only one that may reach the clipboard. */
  appUrl: string = allowedOrigins[0] ?? '',
): void {
  window.webContents.on('will-navigate', (details) => guard(details, allowedOrigins, 'will-navigate'));

  // A redirect is the continuation of a navigation that was already allowed to
  // start, and Chromium does not re-run `will-navigate` for it.
  window.webContents.on('will-redirect', (details) => guard(details, allowedOrigins, 'will-redirect'));

  // Fires for every frame INCLUDING the main one, which `will-navigate` already
  // owns; acting on both would hand the same URL to the browser twice.
  window.webContents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) return;
    guard(details, allowedOrigins, 'will-frame-navigate');
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
