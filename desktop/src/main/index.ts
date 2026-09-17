/**
 * C-3 / C-7 / C-12 — the shell's bootstrap, in the order the Contract fixes it.
 *
 * 1. `requestSingleInstanceLock()` is the first call: a second launch quits and
 *    the first window is shown instead (inside `setImmediate`, per the research
 *    doc's quirk about work done in `second-instance`).
 * 2. `setAppUserModelId` before `ready`, or the taskbar button is Electron's and
 *    Windows drops every toast silently.
 * 3. Config, window, navigation guards, sync watcher, poller, tray.
 *
 * Closing the window hides it (C-12): the app keeps running and polling, and
 * *Quit* from the tray is the only exit.
 *
 * The poller is started here and owns itself from then on (`poller-wiring.ts`
 * attaches the focus and power-resume triggers). This file supplies the three
 * Electron-shaped things it cannot build for itself — the userData path, the
 * window, and a session reader over the partition's cookies — and routes the
 * tray's *Check now* into `runOnce()`.
 */

import { app, BrowserWindow } from 'electron';

import { allowedOrigins } from '../core/config';
import type { DesktopConfig } from '../core/config';
import { loadConfig, reportConfigError } from './config';
import { createNamedLogger, log, logError } from './log';
import { attachNavigationGuards } from './navigation';
import type { PollerHandle } from './poller-wiring';
import { startPoller } from './poller-wiring';
import { createMainRest, createMainSessionRest } from './rest';
import { readWebSession } from './session';
import { attachSyncWatcher } from './sync-terminal';
import { installShellTestHook, recordEvent } from './test-hook';
import { MENU_CHECK_NOW, createTray } from './tray';
import type { TrayHandle } from './tray';
import { createWindow, showWindow } from './window';

export const APP_USER_MODEL_ID = 'su.stack.bb2dash';

let mainWindow: BrowserWindow | null = null;
let trayHandle: TrayHandle | null = null;
let config: DesktopConfig | null = null;
let poller: PollerHandle | null = null;
let isQuitting = false;

/**
 * One tick, never throwing at the caller: the tray and the e2e suite both use it.
 * The recorded event is what `test/e2e/shell.spec.ts` asserts, so it is emitted
 * whether or not a poller is there to run.
 */
export async function runPollerTick(source: string): Promise<void> {
  recordEvent('poller-tick', { source, registered: poller !== null });
  if (poller === null) {
    log(`poller tick requested by ${source} before the poller started`);
    return;
  }
  try {
    const result = await poller.runOnce();
    log(`poller tick from ${source}: ${result.outcome} (${result.toastCount} toast(s))`);
  } catch (error) {
    logError(`poller tick from ${source} failed`, error);
  }
}

/** The live window, or `null` before `ready`. The deep links need it. */
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/** The validated config, or `null` before `ready`. */
export function getConfig(): DesktopConfig | null {
  return config;
}

function onSecondInstance(): void {
  recordEvent('second-instance', {});
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

/** C-7: everything the portable poller needs that only Electron can supply. */
function startShellPoller(validConfig: DesktopConfig): PollerHandle {
  return startPoller({
    userDataDir: app.getPath('userData'),
    appUrl: validConfig.appUrl,
    config: {
      pollIntervalMinutes: validConfig.pollIntervalMinutes,
      dueReminderTime: validConfig.dueReminderTime,
    },
    getSession: () =>
      readWebSession({ appUrl: validConfig.appUrl, supabaseUrl: validConfig.supabaseUrl }),
    createRest: createMainSessionRest(validConfig),
    getWindow: getMainWindow,
    log: createNamedLogger('poller'),
  });
}

function start(): void {
  try {
    config = loadConfig();
  } catch (error) {
    reportConfigError(error);
    // Non-zero, and `exit` rather than `quit`: nothing is wired up yet, and a test
    // harness that launched with a bad config must see a failed process rather than
    // a clean exit it could mistake for a normal quit.
    app.exit(1);
    return;
  }

  mainWindow = createWindow(config.appUrl);
  attachNavigationGuards(mainWindow, allowedOrigins(config), config.appUrl);
  hideOnClose(mainWindow);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  attachSyncWatcher({ config, restGet: createMainRest(config) });

  // Before the tray, so *Check now* has something to run from its first click.
  poller = startShellPoller(config);

  trayHandle = createTray({
    window: mainWindow,
    showWindow,
    onCheckNow: () => void runPollerTick('tray'),
    onQuit: quit,
  });

  installShellTestHook({ clickTrayItem: (label) => trayHandle?.click(label) });

  log(
    `bb2dash shell ready (Electron ${process.versions.electron}); ` +
      `tray "${MENU_CHECK_NOW}" runs one tick; polling every ${config.pollIntervalMinutes}m`,
  );
}

function bootstrap(): void {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.on('second-instance', onSecondInstance);
  app.on('before-quit', () => {
    isQuitting = true;
    // Detach the interval and the power listener so the process can actually end.
    poller?.stop();
    poller = null;
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
