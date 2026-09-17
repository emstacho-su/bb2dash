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

/** Restore from minimised, show if hidden (C-12), focus. Each step is independently safe. */
function raise(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
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
        raise(window);
        void window.loadURL(target);
      } catch (error) {
        log.error(`navigation to ${route} failed: ${describeError(error)}`);
        options.recorder?.recordNavigation(route, false);
        return false;
      }

      options.recorder?.recordNavigation(route, true);
      log.info(`navigated to ${route}`);
      return true;
    },
  };
}
