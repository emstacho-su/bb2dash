/**
 * The seam between the portable poller (`core/poller/*`) and Electron.
 *
 * It owns nothing of its own: it builds the watermark store over `userData`, the notifier,
 * the deep-link navigator and the scheduler, then attaches the three Electron triggers —
 * window focus, `powerMonitor` `resume`, and the tray's *Check now* (C-12) — and installs
 * the e2e test hook (C-10).
 *
 * ---------------------------------------------------------------------------------------
 * TODO (W-25 seam, W-26 shim): the Contract has `main/index.ts` bootstrap the poller. Until
 * W-25's `index.ts` lands, this file is the whole integration point and `index.ts` should
 * call it once, after the window exists:
 *
 *     const poller = startPoller({ userDataDir: app.getPath('userData'), appUrl, ... });
 *     // tray "Check now" -> void poller.runOnce();
 *     // before-quit      -> poller.stop();
 *
 * If W-25 exports a `registerPoller(handle)` hook from `index.ts`, pass the returned
 * `PollerHandle` to it; the shape is `RegisterPoller` below. W-26 does not edit `index.ts`.
 * ---------------------------------------------------------------------------------------
 */

import { join } from 'node:path';

import { powerMonitor, type BrowserWindow } from 'electron';

import type { RestGet, WebSession } from '../core/types';
import { type Logger, createRedactingLogger, describeError } from '../core/redact';
import {
  type Poller,
  type PollerConfig,
  type TickResult,
  type TickRows,
  createPoller,
} from '../core/poller/scheduler';
import { createFileWatermarkStore } from '../core/poller/watermark';
import { createDeeplink } from './deeplink';
import { createNotifier } from './notify';
import { createRecorder, installTestHook, isTestMode } from './test-hook';

/** C-7: `userData/notify-watermark.json`. */
export const WATERMARK_FILENAME = 'notify-watermark.json';

export interface PollerWiringDeps {
  /** `app.getPath('userData')`. Passed in so `core/` never imports `electron`. */
  readonly userDataDir: string;
  /** `config.appUrl` — the base a validated route is resolved against. */
  readonly appUrl: string;
  readonly config: PollerConfig;
  /** C-5: the web session's token from the partition's cookies, or `null`. */
  readonly getSession: () => Promise<WebSession | null>;
  /** W-25's `core/rest.ts`, already bound to the anon key and the Supabase URL. */
  readonly createRest: (session: WebSession) => RestGet;
  /** The single reused window (C-12). */
  readonly getWindow: () => BrowserWindow | null;
  readonly log?: Logger;
  readonly env?: NodeJS.ProcessEnv;
}

export interface PollerHandle {
  /** The tray's *Check now* (C-12). */
  runOnce(): Promise<TickResult>;
  /** Attach the focus trigger to a window; call again if the window is ever replaced. */
  attachWindow(window: BrowserWindow): void;
  /** Detach the timers and the power listener. */
  stop(): void;
  /** Exposed so `index.ts` can route a toast click that arrived before the window existed. */
  navigate(route: string): boolean;
}

/** The hook `main/index.ts` is expected to export; see the TODO at the top of this file. */
export type RegisterPoller = (handle: PollerHandle) => void;

/** A last-resort logger when W-25's rolling file is not wired yet. Redacted either way. */
function consoleLogger(): Logger {
  return createRedactingLogger((level, line) => {
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  });
}

export function startPoller(deps: PollerWiringDeps): PollerHandle {
  const env = deps.env ?? process.env;
  const log = deps.log ?? consoleLogger();
  const recorder = isTestMode(env) ? createRecorder() : undefined;

  const store = createFileWatermarkStore({
    filePath: join(deps.userDataDir, WATERMARK_FILENAME),
    log,
  });

  const deeplink = createDeeplink({
    appUrl: deps.appUrl,
    getWindow: deps.getWindow,
    ...(recorder ? { recorder } : {}),
    log,
  });

  const notifier = createNotifier({
    onClick: (route) => {
      deeplink.navigate(route);
    },
    ...(recorder ? { recorder } : {}),
    log,
    env,
  });

  const poller: Poller = createPoller({
    config: deps.config,
    store,
    notifier,
    getSession: deps.getSession,
    createRest: deps.createRest,
    log,
  });

  const onResume = (): void => {
    void poller.onResume().catch((error) => log.error(`resume tick failed: ${describeError(error)}`));
  };
  powerMonitor.on('resume', onResume);

  const attachedWindows = new WeakSet<BrowserWindow>();
  const attachWindow = (window: BrowserWindow): void => {
    if (attachedWindows.has(window)) return;
    attachedWindows.add(window);
    // The 60 s throttle lives in the scheduler, not here, so it is unit-tested.
    window.on('focus', () => {
      void poller.onFocus().catch((error) => log.error(`focus tick failed: ${describeError(error)}`));
    });
  };

  const initialWindow = deps.getWindow();
  if (initialWindow) attachWindow(initialWindow);

  if (recorder) {
    installTestHook(
      {
        recorder,
        tick: (fixture: TickRows) => poller.runWithRows(fixture),
        clickToast: (key: string): boolean => {
          const toast = recorder.toasts().find((candidate) => candidate.key === key);
          if (!toast) return false;
          return deeplink.navigate(toast.route);
        },
      },
      env,
    );
  }

  void poller.start().catch((error) => log.error(`launch tick failed: ${describeError(error)}`));

  return {
    runOnce: () => poller.runOnce('manual'),
    attachWindow,
    stop: () => {
      powerMonitor.removeListener('resume', onResume);
      poller.stop();
    },
    navigate: (route: string) => deeplink.navigate(route),
  };
}
