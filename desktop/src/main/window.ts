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
import { BrowserWindow, screen } from 'electron';
import { app } from 'electron';

import { log, logError } from './log';
import { resourcePath } from './resources';
import { recordEvent } from './test-hook';

const STATE_FILE = 'window-state.json';
const SAVE_DEBOUNCE_MS = 500;
const DEFAULT_SIZE = Object.freeze({ width: 1280, height: 800 });
export const PARTITION = 'persist:bb2dash';

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

/** Create the window. It is created once per run and reused (C-12). */
export function createWindow(appUrl: string): BrowserWindow {
  const saved = readWindowState();
  const icon = resourcePath('build', 'icon.ico');

  const window = new BrowserWindow({
    ...(saved ? saved.bounds : { ...DEFAULT_SIZE }),
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#12131a',
    title: 'bb2dash',
    // The default Electron menu stays installed — Reload and the devtools
    // accelerators keep working — but it is hidden until Alt is pressed, so the
    // shell reads as an app rather than a browser window (PM, 2026-09-17).
    autoHideMenuBar: true,
    ...(icon === null ? {} : { icon }),
    webPreferences: { ...WEB_PREFERENCES, preload: preloadPath() },
  });

  recordEvent('window-preferences', { ...WEB_PREFERENCES });

  if (saved?.isMaximized) window.maximize();
  window.once('ready-to-show', () => window.show());
  trackWindowState(window);

  window.webContents.on('render-process-gone', (_event, details) => {
    log(`renderer gone: ${details.reason}`);
  });

  void window.loadURL(appUrl).catch((error: unknown) => {
    logError(`could not load ${appUrl}`, error);
  });

  return window;
}

/** Restore, show and focus — what the tray, a second launch and a toast all want. */
export function showWindow(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}
