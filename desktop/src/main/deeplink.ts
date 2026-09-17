/**
 * Deep links (C-7 Delivery): a clicked toast restores, focuses and shows the window, then
 * loads `new URL(route, appUrl)`.
 *
 * The allowlist itself is `core/route.ts` — pure, portable, and unit-tested there. This file
 * is only the Electron half: window state and `loadURL`. Nothing else in the shell may call
 * `loadURL` with a value that has not been through `isAllowedRoute`.
 */

import type { BrowserWindow } from 'electron';

import { isAllowedRoute } from '../core/route';
import { type Logger, describeError, silentLogger } from '../core/redact';
import type { Recorder } from './test-hook';
// R2-10: one `showWindow`. This file used to carry a private `raise()` that did the same
// three steps *without* the `isDestroyed()` guard, so a toast clicked after the window had
// gone threw inside the click handler instead of being reported as a refused navigation.
import { showWindow } from './window';

export interface DeeplinkOptions {
  /** The single app origin the window may navigate to (C-2, C-4). */
  readonly appUrl: string;
  /** The reused window, or `null` before it exists. C-12: it is created once. */
  readonly getWindow: () => BrowserWindow | null;
  /** Supplied under `BB2DASH_TEST=1`; every attempt is recorded, accepted or not. */
  readonly recorder?: Recorder;
  readonly log?: Logger;
}

export interface Deeplink {
  /** True when the route validated and the window was asked to load it. */
  navigate(route: string): boolean;
}

/**
 * R2-8 — a `loadURL` rejection that does not mean the navigation failed.
 *
 * Chromium aborts the load it was asked for whenever something supersedes it, and the web
 * app's own proxy redirects (`/` -> `/login` when the session has gone, for one). The
 * window did navigate; `loadURL` just never resolved for *that* URL. Treating it as a
 * failure would report every redirect as a broken deep link.
 */
export function isBenignLoadFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ERR_ABORTED|\(-3\)/.test(message);
}

export function createDeeplink(options: DeeplinkOptions): Deeplink {
  const log = options.log ?? silentLogger;

  return {
    navigate(route: string): boolean {
      if (!isAllowedRoute(route)) {
        // The route is a shell-authored string, never a credential, so it is safe to log.
        log.warn(`refused deep link ${JSON.stringify(String(route).slice(0, 120))}`);
        options.recorder?.recordNavigation(String(route), false);
        return false;
      }

      let target: string;
      try {
        target = new URL(route, options.appUrl).toString();
      } catch (error) {
        log.error(`appUrl is not a valid base URL: ${describeError(error)}`);
        options.recorder?.recordNavigation(route, false);
        return false;
      }

      const window = options.getWindow();
      if (!window || window.isDestroyed()) {
        log.warn(`no window to navigate to ${route}`);
        options.recorder?.recordNavigation(route, false);
        return false;
      }

      try {
        showWindow(window);
      } catch (error) {
        log.error(`raising the window for ${route} failed: ${describeError(error)}`);
        options.recorder?.recordNavigation(route, false);
        return false;
      }

      // R2-8: `void loadURL(...)` left the rejection unhandled and reported success for a
      // load that never happened — a clicked toast said it worked while the window sat on
      // the old screen. The click handler cannot wait for the load, so the outcome is
      // recorded when it is known. A *synchronous* throw is still answered immediately.
      let pending: Promise<void>;
      try {
        pending = window.loadURL(target);
      } catch (error) {
        log.error(`navigation to ${route} failed: ${describeError(error)}`);
        options.recorder?.recordNavigation(route, false);
        return false;
      }

      pending.then(
        () => {
          options.recorder?.recordNavigation(route, true);
          log.info(`navigated to ${route}`);
        },
        (error: unknown) => {
          if (isBenignLoadFailure(error)) {
            // The app redirected or superseded this load: the window did navigate, just
            // not to the URL that was asked for. Not a failure.
            options.recorder?.recordNavigation(route, true);
            log.info(`navigated to ${route} (superseded by the app's own redirect)`);
            return;
          }
          options.recorder?.recordNavigation(route, false);
          log.error(`navigation to ${route} failed: ${describeError(error)}`);
        },
      );

      return true;
    },
  };
}
