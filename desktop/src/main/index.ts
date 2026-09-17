/**
 * C-3 — the shell's bootstrap, in the order the Contract fixes it.
 *
 * 1. `requestSingleInstanceLock()` is the first call: a second launch quits and
 *    the first window is shown instead (inside `setImmediate`, per the research
 *    doc's quirk about work done in `second-instance`).
 * 2. `setAppUserModelId` before `ready`, or the taskbar button is Electron's and
 *    Windows drops every toast silently.
 * 3. Config, window, navigation guards.
 *
 * W-26 owns the poller, the toasts and the deep links. `registerPoller` is the
 * seam: whatever schedules ticks registers its runner here, and the tray's
 * *Check now* and the e2e test hook both call it.
 */

import { app, BrowserWindow } from 'electron';

import { allowedOrigins } from '../core/config';
import type { DesktopConfig } from '../core/config';
import { loadConfig, reportConfigError } from './config';
import { log, logError } from './log';
import { attachNavigationGuards } from './navigation';
import { installTestHook } from './test-hook';
import { createWindow, showWindow } from './window';

export const APP_USER_MODEL_ID = 'su.stack.bb2dash';

let mainWindow: BrowserWindow | null = null;
let config: DesktopConfig | null = null;
let pollerRun: (() => Promise<void>) | null = null;

/**
 * W-26 calls this once with the scheduler's tick runner. Until it does, *Check
 * now* and the test hook log and do nothing rather than pretending to poll.
 */
export function registerPoller(run: () => Promise<void>): void {
  pollerRun = run;
}

/** One tick, never throwing at the caller: the tray and the test hook both use it. */
export async function runPollerTick(): Promise<void> {
  if (pollerRun === null) {
    log('poller tick requested before a poller was registered');
    return;
  }
  try {
    await pollerRun();
  } catch (error) {
    logError('poller tick failed', error);
  }
}

/** The live window, or `null` before `ready`. W-26's deep links need it. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** The validated config, or `null` before `ready`. */
export function getConfig(): DesktopConfig | null {
  return config;
}

function onSecondInstance(): void {
  // Deferred: work done synchronously inside this event can be dropped
  // (electron#35732), and showing a window is exactly that kind of work.
  setImmediate(() => {
    if (mainWindow !== null) showWindow(mainWindow);
  });
}

function start(): void {
  try {
    config = loadConfig();
  } catch (error) {
    reportConfigError(error);
    app.quit();
    return;
  }

  mainWindow = createWindow(config.appUrl);
  attachNavigationGuards(mainWindow, allowedOrigins(config));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  installTestHook({ tick: runPollerTick });
  log(`bb2dash shell ready (Electron ${process.versions.electron})`);
}

function bootstrap(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on('second-instance', onSecondInstance);

  // Windows only, and the window is the app: closing it ends the run. C-12
  // replaces this with hide-to-tray.
  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(start).catch((error: unknown) => {
    logError('startup failed', error);
    app.quit();
  });
}

if (app.requestSingleInstanceLock()) {
  bootstrap();
} else {
  log('another instance holds the lock; quitting and focusing it');
  app.quit();
}
