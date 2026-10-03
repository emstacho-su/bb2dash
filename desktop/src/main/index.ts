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
 * Closing the window destroys it (Stack, 2026-09-30, amending C-12's "close hides"): the
 * renderer processes go away, and the main process, the poller and the tray stay. Tray
 * *Open*, a toast click and a second launch build a new window through
 * `window-controller.ts`. *Quit* from the tray is still the only full exit.
 *
 * The poller is started here and owns itself from then on (`poller-wiring.ts`
 * attaches the focus and power-resume triggers). This file supplies the Electron-shaped
 * things it cannot build for itself — the userData path, the window, and a session
 * reader over the partition's cookies — and routes the tray's *Check now* into
 * `runOnce()`.
 */

import { app, BrowserWindow, ipcMain } from 'electron';

import { allowedOrigins, usesSyncTerminal } from '../core/config';
import type { DesktopConfig } from '../core/config';
import { loadConfig, reportConfigError } from './config';
import { createNamedLogger, log, logError } from './log';
import { createLoginPrompt, withLoginPromptCheck } from './login-prompt';
import { LOGIN_PROMPT_FILENAME, createLoginPromptStore } from './login-prompt-store';
import type { LoginPrompt } from './login-prompt';
import { attachNavigationGuards } from './navigation';
import type { PollerHandle } from './poller-wiring';
import { startPoller } from './poller-wiring';
import { createMainRest, createMainSessionRest } from './rest';
import { createUsableSessionReader } from './session';
import { attachSyncWatcher } from './sync-terminal';
import { IS_TEST_MODE, installShellTestHook, recordEvent } from './test-hook';
import { createBuilderTrigger } from '../core/update/builder-trigger';
import type { BuilderTrigger } from '../core/update/builder-trigger';
import { join } from 'node:path';
import { REMINDER_FILENAME, createReminderStore } from './update-reminder-store';
import { createUpdateFlow } from '../core/update/update-flow';
import type { UpdateFlow } from '../core/update/update-flow';
import { createForceUpdate } from '../core/update/force-update';
import { createUpdateRequestHandler, registerUpdateRequest } from './update-request';
import {
  buildOnDisk,
  createDockerReadyCheck,
  createReadBuilderStatus,
  createStartBuilderTask,
  launchStateDir,
  readLastBuiltSha,
  readLastCheck,
  readRunningTree,
  startUpdateHelper,
  writeForceRequest,
} from './update-os';
import { showUpdatePrompt } from './update-prompt';
import { MENU_CHECK_NOW, createTray } from './tray';
import type { TrayHandle } from './tray';
import {
  createWindow,
  ensureLoaded,
  firstLoad,
  needsReload,
  refreshSessionWithoutWindow,
  showWindow,
} from './window';
import { createWindowController } from './window-controller';
import type { WindowController } from './window-controller';

export const APP_USER_MODEL_ID = 'su.stack.bb2dash';

let windows: WindowController<BrowserWindow> | null = null;
let trayHandle: TrayHandle | null = null;
let config: DesktopConfig | null = null;
let poller: PollerHandle | null = null;
let isQuitting = false;
let builderTrigger: BuilderTrigger | null = null;
let updateFlow: UpdateFlow | null = null;

/**
 * 2026-09-30: when the builder has a newer build than the one running, the next window
 * open asks Update now / Update later. See `core/update/update-flow.ts`.
 */
function createShellUpdateFlow(): UpdateFlow | null {
  const stateDir = launchStateDir();
  if (stateDir === null) {
    log('no LOCALAPPDATA: update checks are off');
    return null;
  }
  const updateLog = createNamedLogger('update');
  return createUpdateFlow({
    runningTree,
    readLastBuiltSha: () => readLastBuiltSha(stateDir),
    buildOnDisk: (tree) => buildOnDisk(stateDir, tree),
    reminders: createReminderStore({ filePath: join(app.getPath('userData'), REMINDER_FILENAME), log: updateLog }),
    now: () => new Date(),
    testMode: IS_TEST_MODE,
    showPrompt: () => showUpdatePrompt(getMainWindow()),
    startUpdate: (tree) => startUpdateHelper({ stateDir, tree }),
    quit,
    record: recordEvent,
    log: updateLog,
  });
}
/** The tree hash of the running logon build, or `null` for a dev run (no updates then). */
const runningTree = readRunningTree();

/** Long enough for the IPC reply to reach the page before the app quits for the swap. */
const RESTART_DELAY_MS = 1_000;

/**
 * 2026-09-30: the account menu's "Update desktop app" (`core/update/force-update.ts`), over
 * the one IPC channel. Only the main window's top frame on the app origin is answered
 * (`update-request.ts`).
 */
function registerForceUpdate(validConfig: DesktopConfig): void {
  const stateDir = launchStateDir();
  const updateLog = createNamedLogger('update');
  const forceUpdate = createForceUpdate({
    runningTree: stateDir === null ? null : runningTree,
    dockerReady: createDockerReadyCheck(),
    requestShortDockerWait: (seconds) => {
      if (stateDir !== null) writeForceRequest(stateDir, seconds);
    },
    startBuilder: createStartBuilderTask(),
    readBuilderStatus: createReadBuilderStatus(),
    readLastBuiltSha: () => (stateDir === null ? null : readLastBuiltSha(stateDir)),
    readLastCheck: () => (stateDir === null ? null : readLastCheck(stateDir)),
    buildOnDisk: (tree) => stateDir !== null && buildOnDisk(stateDir, tree),
    startUpdate: (tree) =>
      stateDir === null
        ? Promise.reject(new Error('no launch state folder'))
        : startUpdateHelper({ stateDir, tree }),
    quitSoon: () => void setTimeout(quit, RESTART_DELAY_MS),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    testMode: IS_TEST_MODE,
    record: recordEvent,
    log: updateLog,
  });
  registerUpdateRequest(
    ipcMain,
    createUpdateRequestHandler({
      appOrigin: new URL(validConfig.appUrl).origin,
      mainWebContentsId: () => {
        const window = getMainWindow();
        return window === null || window.isDestroyed() ? null : window.webContents.id;
      },
      run: () => forceUpdate.request(),
      log: updateLog,
    }),
  );
}

/**
 * 2026-09-30: start the logon builder now and every BUILDER_INTERVAL_HOURS, so new builds
 * happen without a Windows logon. Only for a logon build, and never under the test env.
 */
function startBuilderSchedule(): void {
  if (runningTree === null) {
    log('not running from a logon build: the builder is not scheduled from here');
    return;
  }
  if (IS_TEST_MODE) {
    recordEvent('builder-trigger', { skipped: 'test mode' });
    return;
  }
  builderTrigger = createBuilderTrigger({
    startTask: createStartBuilderTask(),
    log: createNamedLogger('update'),
  });
  builderTrigger.start();
}

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

/** The live window, or `null` before `ready` and while it is closed to the tray. */
export function getMainWindow(): BrowserWindow | null {
  return windows?.current() ?? null;
}

/** The validated config, or `null` before `ready`. */
export function getConfig(): DesktopConfig | null {
  return config;
}

/** Show the window, building a new one when it was closed. Tray, second launch. */
function openMainWindow(initialUrl?: string): void {
  if (windows === null) return;
  try {
    windows.open(initialUrl);
  } catch (error) {
    logError('the window could not be opened', error);
  }
}

function onSecondInstance(): void {
  recordEvent('second-instance', {});
  // Deferred: work done synchronously inside this event can be dropped
  // (electron#35732), and showing a window is exactly that kind of work.
  setImmediate(() => openMainWindow());
}

function quit(): void {
  isQuitting = true;
  app.quit();
}

/** Everything a freshly built window needs: guards, the poller's focus trigger. */
function wireWindow(window: BrowserWindow, validConfig: DesktopConfig): void {
  attachNavigationGuards(window, allowedOrigins(validConfig), validConfig.appUrl);
  poller?.attachWindow(window);
  // Every window open is a chance to offer a waiting update, once the window is on screen.
  window.once('ready-to-show', () => {
    void updateFlow?.onWindowOpened();
  });
  window.on('close', () => {
    if (!isQuitting) log('window closing to the tray: its renderer is released; polling continues');
  });
}

/**
 * Brief 100 round 2, item 2: the login prompt remembers, per item, the New York day it last
 * opened the page, in `userData/login-prompt.json` beside the watermark. `null` under `terminal`.
 */
function createShellLoginPrompt(validConfig: DesktopConfig): LoginPrompt | null {
  return createLoginPrompt(validConfig, {
    store: createLoginPromptStore({
      filePath: join(app.getPath('userData'), LOGIN_PROMPT_FILENAME),
      log: createNamedLogger('login-prompt'),
    }),
  });
}

/**
 * C-7: everything the portable poller needs that only Electron can supply. Under
 * `syncLauncher = queue-only` the login prompt rides each tick's session read (brief 100,
 * 2026-10-03); under `terminal` `loginPrompt` is null and the reader is the plain one.
 */
function startShellPoller(validConfig: DesktopConfig, loginPrompt: LoginPrompt | null): PollerHandle {
  const createRest = createMainSessionRest(validConfig);
  // R2-4: an expired session reads as `null` so the tick skips rather than 401-ing, and
  // a *hidden* window is reloaded (at most once per 10 min) so the web app's own proxy
  // rewrites the cookie. With the window closed, a short-lived hidden page does the same
  // job. Main still never calls the auth API itself (C-5).
  const readSession = createUsableSessionReader({
    appUrl: validConfig.appUrl,
    supabaseUrl: validConfig.supabaseUrl,
    getWindow: () => {
      const window = getMainWindow();
      if (window === null) return null;
      return {
        isVisible: () => window.isVisible(),
        isDestroyed: () => window.isDestroyed(),
        // `needsReload` is true for a window that never loaded or whose renderer died;
        // both are `window.ts`'s to retry, not this reader's.
        hasLoaded: () => !needsReload(window),
      };
    },
    reload: () => {
      const window = getMainWindow();
      if (window !== null) ensureLoaded(window);
    },
    refreshWithoutWindow: () => {
      refreshSessionWithoutWindow(validConfig.appUrl, (page) =>
        attachNavigationGuards(page, allowedOrigins(validConfig), validConfig.appUrl),
      );
    },
  });
  return startPoller({
    userDataDir: app.getPath('userData'),
    appUrl: validConfig.appUrl,
    config: {
      pollIntervalMinutes: validConfig.pollIntervalMinutes,
      dueReminderTime: validConfig.dueReminderTime,
    },
    getSession: withLoginPromptCheck(readSession, createRest, loginPrompt),
    createRest,
    getWindow: getMainWindow,
    openWindowAt: (target) => {
      if (windows === null) throw new Error('the window controller is not ready');
      const opened = windows.open(target);
      // A window built for this route loads it first; one that appeared meanwhile is sent there.
      return opened.created ? firstLoad(opened.window) : opened.window.loadURL(target);
    },
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
  const validConfig = config;
  updateFlow = createShellUpdateFlow();
  registerForceUpdate(validConfig);

  windows = createWindowController<BrowserWindow>({
    create: (initialUrl) => createWindow(validConfig.appUrl, initialUrl),
    onCreated: (window) => wireWindow(window, validConfig),
    show: showWindow,
    log,
  });
  windows.open();

  // Brief 100 task 18: under `queue-only` the Sync button only queues and the container's runner
  // takes the request, so no terminal watcher is attached; the login prompt rides the poller.
  if (usesSyncTerminal(validConfig)) {
    attachSyncWatcher({ config: validConfig, restGet: createMainRest(validConfig) });
  } else {
    log('syncLauncher is queue-only: the Sync button only queues; the container runs the sync');
  }

  // Before the tray, so *Check now* has something to run from its first click. The first
  // window already exists, so the poller attaches its focus trigger to it here; later
  // windows are attached by `wireWindow`.
  poller = startShellPoller(validConfig, createShellLoginPrompt(validConfig));

  trayHandle = createTray({
    onOpen: () => openMainWindow(),
    onCheckNow: () => void runPollerTick('tray'),
    onQuit: quit,
  });

  installShellTestHook({ clickTrayItem: (label) => trayHandle?.click(label) });

  startBuilderSchedule();

  log(
    `bb2dash shell ready (Electron ${process.versions.electron}); ` +
      `tray "${MENU_CHECK_NOW}" runs one tick; polling every ${validConfig.pollIntervalMinutes}m`,
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
    builderTrigger?.stop();
    builderTrigger = null;
  });

  // Closing the window destroys it (2026-09-30), so this fires every time the window is
  // closed. Registering a listener at all is what stops Electron's default quit: the tray
  // is still the app, and only *Quit* ends the process.
  app.on('window-all-closed', () => {
    log('no window open; the tray keeps the app running');
  });

  app.whenReady().then(start).catch((error: unknown) => {
    logError('startup failed', error);
    quit();
  });
}

/**
 * Stack, 2026-09-30: GPU acceleration off. With the window closed to the tray the GPU
 * process (~130 MB working set) was the largest part of what stayed resident, and the shell
 * renders a plain web app that does not need it. Electron honours this only before `ready`,
 * so it runs at import (`test/unit/gpu-off.test.ts` pins the order).
 */
app.disableHardwareAcceleration();

if (app.requestSingleInstanceLock()) {
  bootstrap();
} else {
  log('another instance holds the lock; quitting and focusing it');
  app.quit();
}
