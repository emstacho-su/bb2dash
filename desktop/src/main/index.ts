/**
 * C-3 / C-12 — the shell's bootstrap, in the order the Contract fixes it.
 *
 * 1. `requestSingleInstanceLock()` is the first call: a second launch quits and
 *    the first window is shown instead (inside `setImmediate`, per the research
 *    doc's quirk about work done in `second-instance`).
 * 2. `setAppUserModelId` before `ready`, or the taskbar button is Electron's and
 *    Windows drops every toast silently.
 * 3. Config, window, navigation guards, sync watcher, tray.
 *
 * Closing the window hides it (C-12): the app keeps running and polling, and
 * *Quit* from the tray is the only exit.
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
import { createMainRest } from './rest';
import { attachSyncWatcher } from './sync-terminal';
import { installTestHook, recordEvent } from './test-hook';
import { MENU_CHECK_NOW, createTray } from './tray';
import type { TrayHandle } from './tray';
import { createWindow, showWindow } from './window';

export const APP_USER_MODEL_ID = 'su.stack.bb2dash';

let mainWindow: BrowserWindow | null = null;
let trayHandle: TrayHandle | null = null;
let config: DesktopConfig | null = null;
let pollerRun: (() => Promise<void>) | null = null;
let isQuitting = false;

/**
 * W-26 calls this once with the scheduler's tick runner. Until it does, *Check
 * now* and the test hook log and do nothing rather than pretending to poll.
 */
export function registerPoller(run: () => Promise<void>): void {
  pollerRun = run;
  log('poller registered');
}

/** One tick, never throwing at the caller: the tray and the test hook both use it. */
export async function runPollerTick(source: string): Promise<void> {
  recordEvent('poller-tick', { source, registered: pollerRun !== null });
  if (pollerRun === null) {
    log(`poller tick requested by ${source} before a poller was registered`);
    return;
  }
  try {
    await pollerRun();
  } catch (error) {
    logError(`poller tick from ${source} failed`, error);
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

/** C-12: the close button hides the window; only `Quit` ends the process. */
function hideOnClose(window: BrowserWindow): void {
  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
    log('window hidden to the tray; polling continues');
  });
}

function quit(): void {
  isQuitting = true;
  app.quit();
}

function start(): void {
  try {
    config = loadConfig();
  } catch (error) {
    reportConfigError(error);
    quit();
    return;
  }

  mainWindow = createWindow(config.appUrl);
  attachNavigationGuards(mainWindow, allowedOrigins(config));
  hideOnClose(mainWindow);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  attachSyncWatcher({ config, restGet: createMainRest(config) });

  trayHandle = createTray({
    window: mainWindow,
    showWindow,
    onCheckNow: () => void runPollerTick('tray'),
    onQuit: quit,
  });

  installTestHook({
    tick: () => runPollerTick('test-hook'),
    clickTrayItem: (label) => trayHandle?.click(label),
  });

  log(
    `bb2dash shell ready (Electron ${process.versions.electron}); ` +
      `tray "${MENU_CHECK_NOW}" runs one tick`,
  );
}

function bootstrap(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on('second-instance', onSecondInstance);
  app.on('before-quit', () => {
    isQuitting = true;
  });

  // C-12: the window is hidden, not destroyed, so this normally never fires.
  // If it ever does, the tray is still the app and the process stays alive.
  app.on('window-all-closed', () => {
    log('every window is gone; the tray keeps the app running');
  });

  app.whenReady().then(start).catch((error: unknown) => {
    logError('startup failed', error);
    quit();
  });
}

if (app.requestSingleInstanceLock()) {
  bootstrap();
} else {
  log('another instance holds the lock; quitting and focusing it');
  app.quit();
}
