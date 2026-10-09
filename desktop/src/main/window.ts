/**
 * C-3 — the one `BrowserWindow`, and its bounds across restarts.
 *
 * `webPreferences` is the security baseline the research doc names and the DoD
 * asserts: a `persist:` partition so the web app's auth cookie survives a
 * restart, a preload that exposes one frozen object, `nodeIntegration` off,
 * `contextIsolation` on, `sandbox` on, `webSecurity` on. There is no IPC
 * channel besides the test hook.
 *
 * Window state lives in `userData/window-state.json`, written 500 ms after the
 * last move or resize and again on close, and is restored only when the saved
 * rectangle still intersects a connected display — otherwise a window saved on
 * a monitor that is now unplugged would open off-screen.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BrowserWindow, Menu, screen } from 'electron';
import { app } from 'electron';

import { contextMenuTemplate } from './context-menu';
import { failedLoadDataUrl, showsLoadFailed } from './load-failed';
import { log, logError } from './log';
import { resourcePath } from './resources';
import { IS_TEST_MODE, recordEvent } from './test-hook';
import { MIN_WIDTH, overlayFor, themeOfColour, DARK_OVERLAY, widenToMinimum } from './title-bar';
import { windowBackground } from './window-background';

const STATE_FILE = 'window-state.json';
const SAVE_DEBOUNCE_MS = 500;
const DEFAULT_SIZE = Object.freeze({ width: 1280, height: 800 });
export const PARTITION = 'persist:bb2dash';

/**
 * R2-7 — recovering a window that has nothing in it.
 *
 * Two ways that happens, and both used to be terminal. `loadURL` rejects when the app URL
 * is unreachable, which is the ordinary case of opening the shell before the wifi is up:
 * the old code logged and left a blank window that never retried. And
 * `render-process-gone` was logged and nothing else, leaving a window whose renderer is
 * dead — no content, no reload, and closing it only hides it to the tray (C-12).
 *
 * The backoff is deliberately coarse. This is a laptop coming out of a tunnel, not a
 * service: a handful of tries over about a minute, then wait for the person to do
 * something. Tray *Open* retries immediately, which is the "do something".
 */
const LOAD_RETRY_DELAYS_MS = Object.freeze([2_000, 5_000, 15_000, 30_000]);

/**
 * The security baseline, in one place so the e2e suite can assert the exact
 * object the window was built with (C-10) rather than a copy of it.
 */
export const WEB_PREFERENCES = Object.freeze({
  partition: PARTITION,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
});

function preloadPath(): string {
  return join(__dirname, '..', 'preload', 'index.js');
}

interface WindowState {
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly isMaximized: boolean;
}

function stateFilePath(): string {
  return join(app.getPath('userData'), STATE_FILE);
}

function isWindowState(value: unknown): value is WindowState {
  if (value === null || typeof value !== 'object') return false;
  const record = value as { bounds?: unknown; isMaximized?: unknown };
  const bounds = record.bounds as Record<string, unknown> | undefined;
  if (!bounds || typeof record.isMaximized !== 'boolean') return false;
  return (['x', 'y', 'width', 'height'] as const).every(
    (key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]),
  );
}

/** A saved rectangle counts only while some display still overlaps it. */
function intersectsADisplay(bounds: WindowState['bounds']): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    );
  });
}

export function readWindowState(): WindowState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFilePath(), 'utf8'));
    if (!isWindowState(parsed)) return null;
    return intersectsADisplay(parsed.bounds) ? parsed : null;
  } catch {
    return null;
  }
}

function writeWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  try {
    const state: WindowState = {
      // `getNormalBounds` is the un-maximized rectangle, which is what should
      // be restored when the window is later un-maximized.
      bounds: window.getNormalBounds(),
      isMaximized: window.isMaximized(),
    };
    writeFileSync(stateFilePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch (error) {
    logError('window state could not be written', error);
  }
}

function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writeWindowState(window);
    }, SAVE_DEBOUNCE_MS);
  };

  window.on('move', schedule);
  window.on('resize', schedule);
  window.on('maximize', schedule);
  window.on('unmaximize', schedule);
  window.on('close', () => {
    if (timer !== null) clearTimeout(timer);
    writeWindowState(window);
  });
}

/** Windows that are showing the failed-load page (task 27): they have no app in them. */
const failedPages = new WeakSet<BrowserWindow>();
/** Windows whose failed-load page is scheduled but not yet loading (see wireChrome). */
const failedPageQueued = new WeakSet<BrowserWindow>();
const failedPageTimers = new WeakMap<BrowserWindow, NodeJS.Timeout>();
/** If loading never reports that it stopped, the failed-load page is shown this long after the failure. */
const FAILED_PAGE_FALLBACK_MS = 1_000;

/**
 * R2-7 — is this window showing the app, or is it blank?
 *
 * `webContents.getURL()` is empty for a window whose load never succeeded, and
 * `isCrashed()` is true for one whose renderer died. Either way the window is useless and
 * `ensureLoaded` should put the app back in it.
 */
export function needsReload(window: BrowserWindow): boolean {
  if (window.isDestroyed()) return false;
  try {
    // The failed-load page is a page, so its URL is not empty; the window still has no app in it.
    return failedPages.has(window) || window.webContents.isCrashed() || window.webContents.getURL() === '';
  } catch {
    return false;
  }
}

/** Every window's loader, so `showWindow` and the retry timer share one implementation. */
const loaders = new WeakMap<BrowserWindow, () => void>();

/** The first `loadURL` of every window, so a deep link can wait on a window it just built. */
const firstLoads = new WeakMap<BrowserWindow, Promise<void>>();

/**
 * R2-8 for a rebuilt window: the promise of its first load, rejecting with that load's own
 * error even when the loader goes on to retry. Resolves at once for an unknown window.
 */
export function firstLoad(window: BrowserWindow): Promise<void> {
  return firstLoads.get(window) ?? Promise.resolve();
}

/**
 * R2-7 — load `appUrl`, and keep trying on the backoff if it will not load.
 *
 * Attached by `createWindow`; also reachable through `showWindow`, so the tray's *Open*
 * on a blank window is a retry rather than a shrug.
 */
export function ensureLoaded(window: BrowserWindow): void {
  loaders.get(window)?.();
}

function attachLoader(window: BrowserWindow, appUrl: string, initialUrl: string = appUrl): void {
  let attempt = 0;
  let timer: NodeJS.Timeout | null = null;
  let loading = false;
  // A window rebuilt for a toast click opens at that route (2026-09-30), and retries it;
  // once anything has loaded, every later reload (crash, tray Open) is the app root again.
  let target = initialUrl;

  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const load = (): void => {
    if (window.isDestroyed() || loading) return;
    loading = true;
    clear();
    const url = target;
    const pending = window.webContents.loadURL(url);
    if (!firstLoads.has(window)) firstLoads.set(window, pending);
    pending.then(
      () => {
        loading = false;
        attempt = 0;
        target = appUrl;
        failedPages.delete(window);
        log(`loaded ${new URL(url).origin}`);
      },
      (error: unknown) => {
        loading = false;
        logError(`could not load ${url}`, error);
        // What the load's own promise rejected with, for the e2e suite (a no-op outside the test variable).
        recordEvent('load-rejected', { url, message: error instanceof Error ? error.message : String(error) });
        const delay = LOAD_RETRY_DELAYS_MS[Math.min(attempt, LOAD_RETRY_DELAYS_MS.length - 1)];
        attempt += 1;
        if (attempt > LOAD_RETRY_DELAYS_MS.length) {
          log('giving up on automatic reload; the tray\'s Open will try again');
          return;
        }
        log(`retrying the load in ${delay}ms (attempt ${attempt})`);
        timer = setTimeout(load, delay);
        // A pending retry must not be the reason the process stays alive; the poller's
        // interval already does that job, and only until Quit.
        timer.unref?.();
      },
    );
  };

  loaders.set(window, () => {
    attempt = 0;
    load();
  });

  window.webContents.on('render-process-gone', (_event, details) => {
    log(`renderer gone: ${details.reason}; reloading`);
    recordEvent('render-process-gone', { reason: details.reason });
    attempt = 0;
    loading = false;
    target = appUrl;
    load();
  });

  window.on('closed', clear);
  load();
}

/**
 * The shell's own chrome (task 27), all of it inside listeners: the title-bar overlay follows the
 * page's theme, the right-click menu, and the page shown when the app cannot be loaded.
 */
function wireChrome(window: BrowserWindow, appUrl: string): void {
  const contents = window.webContents;

  // The page rewrites its theme-color meta at boot, on a pick and on a system change; Electron
  // reports it here. There is no IPC for this: the page never talks to main.
  contents.on('did-change-theme-color', (_event, color) => {
    const overlay = overlayFor(color);
    recordEvent('title-bar-overlay', { color: color ?? null, theme: themeOfColour(color), overlay: { ...overlay } });
    try {
      if (!window.isDestroyed()) window.setTitleBarOverlay({ ...overlay });
    } catch (error) {
      logError('the title bar overlay could not be set', error);
    }
  });

  contents.on('context-menu', (_event, params) => {
    const template = contextMenuTemplate(params);
    if (template.length === 0) return;
    recordEvent('context-menu', { roles: template.map((item) => item.role ?? null) });
    // Under the test variable the roles are recorded and no native menu is popped.
    if (IS_TEST_MODE) return;
    Menu.buildFromTemplate(template).popup({ window });
  });

  // Only a real failure of the main frame: never an aborted load (code -3), never a subframe.
  contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    if (!showsLoadFailed(errorCode, isMainFrame)) return;
    // Already showing it, or about to: a retry that fails again leaves the page as it is.
    if (failedPages.has(window) && (failedPageQueued.has(window) || contents.getURL().startsWith('data:'))) return;
    failedPages.add(window);
    failedPageQueued.add(window);
    recordEvent('load-failed', { errorCode });
    // Not now. Electron settles the failing load's promise when loading stops (did-stop-loading),
    // with the error it recorded; a navigation started before that supersedes it, and the promise
    // rejects with ERR_ABORTED (-3) in place of the real code. deeplink.ts treats -3 as benign, so an
    // offline deep link would be reported as a success and the log would lose the cause (S-2, observed
    // in test/e2e/chrome.spec.ts). So the page is shown on the turn after loading has stopped, and a
    // timer shows it anyway if loading never reports that it stopped.
    const fallback = setTimeout(showFailedPage, FAILED_PAGE_FALLBACK_MS);
    fallback.unref?.();
    failedPageTimers.set(window, fallback);
  });

  const showFailedPage = (): void => {
    const timer = failedPageTimers.get(window);
    if (timer !== undefined) clearTimeout(timer);
    failedPageTimers.delete(window);
    setImmediate(() => {
      failedPageQueued.delete(window);
      if (window.isDestroyed() || !failedPages.has(window)) return;
      contents.loadURL(failedLoadDataUrl(appUrl)).catch((error: unknown) => {
        logError('the failed-load page could not be shown', error);
      });
    });
  };

  contents.on('did-stop-loading', () => {
    if (failedPageQueued.has(window) && failedPageTimers.has(window)) showFailedPage();
  });

  // The app loaded over the page (the Retry link, or the backoff): the window has an app in it again.
  contents.on('did-finish-load', () => {
    try {
      // A failed load also finishes (on Chromium's own error page, while getURL still names the address
      // that failed), so a finish while the failed-load page is still being scheduled is the failure
      // and not the app. Only an http(s) page after that counts.
      if (!failedPageQueued.has(window) && /^https?:/.test(contents.getURL())) failedPages.delete(window);
    } catch {
      // A destroyed window has nothing to clear.
    }
  });
}

/**
 * Create the window. Closing it destroys it (2026-09-30), and `window-controller.ts`
 * builds a new one on the next open; `initialUrl` is that window's first load when a
 * toast click is what opened it.
 */
export function createWindow(appUrl: string, initialUrl?: string): BrowserWindow {
  const saved = readWindowState();
  const icon = resourcePath('build', 'icon.ico');

  const window = new BrowserWindow({
    // A width saved under the new minimum is widened to it before it is used (task 27).
    ...(saved ? { ...saved.bounds, width: widenToMinimum(saved.bounds.width) } : { ...DEFAULT_SIZE }),
    // The idle bar and the three window buttons (title-bar.ts).
    minWidth: MIN_WIDTH,
    minHeight: 600,
    show: false,
    backgroundColor: windowBackground(),
    title: 'bb2dash',
    // The default Electron menu stays installed — Reload and the devtools
    // accelerators keep working — but it is hidden until Alt is pressed, so the
    // shell reads as an app rather than a browser window (PM, 2026-09-17).
    autoHideMenuBar: true,
    // The window's title bar is the app's bar: Windows keeps its three buttons and draws them in the
    // dark bar's colours; the theme listener below re-colours them when the page changes theme.
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...DARK_OVERLAY },
    ...(icon === null ? {} : { icon }),
    webPreferences: { ...WEB_PREFERENCES, preload: preloadPath() },
  });

  recordEvent('window-preferences', { ...WEB_PREFERENCES });
  // The options the window was built with, under a kind of their own: shell.spec.ts compares the
  // six keys of 'window-preferences' exactly.
  const minWidth = MIN_WIDTH;
  recordEvent('window-chrome', {
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...DARK_OVERLAY },
    autoHideMenuBar: true,
    minWidth,
  });

  if (saved?.isMaximized) window.maximize();
  window.once('ready-to-show', () => window.show());
  trackWindowState(window);
  wireChrome(window, appUrl);

  // R2-7: owns the initial load, the retry backoff and the crash reload.
  attachLoader(window, appUrl, initialUrl ?? appUrl);

  return window;
}

/**
 * 2026-09-30 — how long the window-less refresh page lives after its load settles. Long
 * enough for the web app's own client code to run once after the proxy has rewritten the
 * cookie; short enough that the renderer is gone again well inside a poll interval.
 */
export const SESSION_REFRESH_LINGER_MS = 20_000;
/** The page is destroyed after this whatever its load did. */
export const SESSION_REFRESH_TIMEOUT_MS = 60_000;

let refreshPage: BrowserWindow | null = null;

/**
 * Closing the window destroys it now, so R2-4's "reload the hidden window" has nothing to
 * reload. This does the same thing with a page that exists only for the refresh: a hidden
 * window in the same partition loads the app once — the web app's proxy rewrites the
 * cookie on that navigation — and is destroyed again. Main still never calls the auth API
 * (C-5). One page at a time; returns `null` when one is already running.
 */
export function refreshSessionWithoutWindow(
  appUrl: string,
  attachGuards: (window: BrowserWindow) => void,
): BrowserWindow | null {
  if (refreshPage !== null) return null;

  const page = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { ...WEB_PREFERENCES, preload: preloadPath() },
  });
  refreshPage = page;

  let finished = false;
  let deadline: NodeJS.Timeout | null = null;
  const finish = (reason: string): void => {
    if (finished) return;
    finished = true;
    if (deadline !== null) clearTimeout(deadline);
    refreshPage = null;
    log(`session refresh page closed (${reason})`);
    if (!page.isDestroyed()) page.destroy();
  };

  // Code review (LOW): anything that throws while the page is being wired must still free
  // the slot and destroy the page, or every later refresh returns null and the hidden
  // page leaks for the life of the process.
  try {
    attachGuards(page);
    deadline = setTimeout(() => finish('timed out'), SESSION_REFRESH_TIMEOUT_MS);
    deadline.unref?.();

    const linger = (): void => {
      const timer = setTimeout(() => finish('done'), SESSION_REFRESH_LINGER_MS);
      timer.unref?.();
    };
    page.webContents.loadURL(appUrl).then(linger, (error: unknown) => {
      logError('the session refresh page could not load the app', error);
      linger();
    });
  } catch (error) {
    logError('the session refresh page could not be set up', error);
    finish('setup failed');
    return null;
  }
  return page;
}

/**
 * Restore, show and focus — what the tray, a second launch and a toast all want.
 *
 * R2-7: a window that is blank or crashed is also reloaded here, so the tray's *Open* is
 * the manual retry after the backoff has given up.
 */
export function showWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  if (needsReload(window)) {
    log('the window has no content; reloading it');
    ensureLoaded(window);
  }
}
