/**
 * R2-7 — a window with nothing in it must not stay that way.
 *
 * Two ways that used to happen and both were terminal: `loadURL` rejects when the app URL
 * is unreachable (opening the shell before the wifi is up), and `render-process-gone` was
 * logged and nothing else. Either left a blank window that never retried — and closing it
 * only hides it to the tray (C-12), so there was no way back short of Quit and relaunch.
 *
 * `electron` is mocked; `window.ts` is exercised for real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  /** Resolve or reject the next `loadURL`. */
  loadFails: 0,
  loads: [] as string[],
  /** `webContents.on(event)` handlers, so a test can play Chromium. */
  contentHandlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  windowHandlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  url: 'about:blank',
  crashed: false,
  destroyed: false,
  minimized: false,
  visible: true,
  calls: [] as string[],
  constructed: [] as Record<string, unknown>[],
}));

vi.mock('electron', () => {
  const webContents = {
    loadURL(url: string) {
      fake.loads.push(url);
      if (fake.loadFails > 0) {
        fake.loadFails -= 1;
        return Promise.reject(new Error('ERR_NAME_NOT_RESOLVED (-105)'));
      }
      fake.url = url;
      return Promise.resolve();
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      (fake.contentHandlers[event] ??= []).push(handler);
      return webContents;
    },
    isCrashed: () => fake.crashed,
    getURL: () => fake.url,
    session: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} },
  };

  class FakeBrowserWindow {
    readonly webContents = webContents;
    constructor(options: Record<string, unknown>) {
      fake.constructed.push(options);
    }
    on(event: string, handler: (...args: unknown[]) => void) {
      (fake.windowHandlers[event] ??= []).push(handler);
      return this;
    }
    once(event: string, handler: (...args: unknown[]) => void) {
      (fake.windowHandlers[event] ??= []).push(handler);
      return this;
    }
    isDestroyed = () => fake.destroyed;
    isMinimized = () => fake.minimized;
    isVisible = () => fake.visible;
    isMaximized = () => false;
    maximize = () => fake.calls.push('maximize');
    restore = () => {
      fake.calls.push('restore');
      fake.minimized = false;
    };
    show = () => {
      fake.calls.push('show');
      fake.visible = true;
    };
    focus = () => fake.calls.push('focus');
    getNormalBounds = () => ({ x: 0, y: 0, width: 1280, height: 800 });
  }

  return {
    BrowserWindow: FakeBrowserWindow,
    screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1536, height: 864 } }] },
    app: { getPath: () => 'C:\\fake\\userData' },
  };
});

vi.mock('../../src/main/log', () => ({
  log: () => undefined,
  logError: () => undefined,
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

vi.mock('../../src/main/resources', () => ({ resourcePath: () => null }));

import { createWindow, ensureLoaded, needsReload, showWindow } from '../../src/main/window';

const APP_URL = 'http://127.0.0.1:4321/';

function fireContent(event: string, ...args: unknown[]): void {
  for (const handler of fake.contentHandlers[event] ?? []) handler(...args);
}

/** Let every pending microtask settle, then advance the retry timer. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  fake.loadFails = 0;
  fake.loads.length = 0;
  fake.contentHandlers = {};
  fake.windowHandlers = {};
  fake.url = 'about:blank';
  fake.crashed = false;
  fake.destroyed = false;
  fake.minimized = false;
  fake.visible = true;
  fake.calls.length = 0;
  fake.constructed.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the initial load', () => {
  it('loads the app URL once when it works', async () => {
    createWindow(APP_URL);
    await settle();
    expect(fake.loads).toEqual([APP_URL]);
  });
});

describe('R2-7 — a load that fails is retried', () => {
  it('retries on a backoff instead of leaving a blank window', async () => {
    fake.loadFails = 2;
    createWindow(APP_URL);
    await settle();
    expect(fake.loads).toHaveLength(1);

    // Before the fix this was `void loadURL(...).catch(log)`: one attempt, then a blank
    // window forever.
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(fake.loads).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(fake.loads).toHaveLength(3);
    expect(fake.url).toBe(APP_URL);
  });

  it('waits the whole delay, not less', async () => {
    fake.loadFails = 1;
    createWindow(APP_URL);
    await settle();

    await vi.advanceTimersByTimeAsync(1_900);
    await settle();
    expect(fake.loads).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(fake.loads).toHaveLength(2);
  });

  it('gives up after the backoff is exhausted rather than retrying forever', async () => {
    fake.loadFails = 99;
    createWindow(APP_URL);
    await settle();

    for (const delay of [2_000, 5_000, 15_000, 30_000, 30_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(delay);
      await settle();
    }

    // Four delays in the table, so five attempts in total and then silence.
    expect(fake.loads).toHaveLength(5);
  });

  it('a success resets the backoff, so the next outage starts from the top', async () => {
    fake.loadFails = 1;
    createWindow(APP_URL);
    await settle();
    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(fake.loads).toHaveLength(2); // the retry succeeded

    // The renderer now dies and its reload fails once. The next retry must come after the
    // *first* delay again, not the second — otherwise every later outage inherits a
    // backoff earned by an earlier one.
    fake.loadFails = 1;
    fireContent('render-process-gone', {}, { reason: 'crashed' });
    await settle();
    expect(fake.loads).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(2_000);
    await settle();
    expect(fake.loads).toHaveLength(4);
  });
});

describe('R2-7 — a dead renderer is reloaded', () => {
  it('reloads after render-process-gone', async () => {
    createWindow(APP_URL);
    await settle();
    expect(fake.loads).toHaveLength(1);

    fireContent('render-process-gone', {}, { reason: 'crashed' });
    await settle();

    // Before the fix this only wrote a log line and left a dead window behind.
    expect(fake.loads).toHaveLength(2);
  });

  it('reloads again if the renderer dies twice', async () => {
    createWindow(APP_URL);
    await settle();
    fireContent('render-process-gone', {}, { reason: 'crashed' });
    await settle();
    fireContent('render-process-gone', {}, { reason: 'oom' });
    await settle();
    expect(fake.loads).toHaveLength(3);
  });
});

describe('needsReload', () => {
  it('is true for a window that never loaded anything', async () => {
    const window = createWindow(APP_URL);
    fake.loadFails = 1;
    fake.url = '';
    expect(needsReload(window)).toBe(true);
  });

  it('is true for a crashed renderer', async () => {
    const window = createWindow(APP_URL);
    await settle();
    fake.crashed = true;
    expect(needsReload(window)).toBe(true);
  });

  it('is false for a healthy window', async () => {
    const window = createWindow(APP_URL);
    await settle();
    expect(needsReload(window)).toBe(false);
  });

  it('is false for a destroyed window, which is nobody\u2019s to reload', async () => {
    const window = createWindow(APP_URL);
    await settle();
    fake.destroyed = true;
    expect(needsReload(window)).toBe(false);
  });
});

describe('R2-7 — the tray\u2019s Open is the manual retry', () => {
  it('reloads a blank window when it is shown', async () => {
    fake.loadFails = 99;
    const window = createWindow(APP_URL);
    await settle();
    for (const delay of [2_000, 5_000, 15_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(delay);
      await settle();
    }
    const exhausted = fake.loads.length;
    fake.url = '';

    fake.loadFails = 0;
    showWindow(window);
    await settle();

    expect(fake.loads.length).toBe(exhausted + 1);
    expect(fake.url).toBe(APP_URL);
  });

  it('does not reload a window that is already showing the app', async () => {
    const window = createWindow(APP_URL);
    await settle();
    showWindow(window);
    await settle();
    expect(fake.loads).toHaveLength(1);
    expect(fake.calls).toContain('focus');
  });

  it('does nothing at all for a destroyed window', async () => {
    const window = createWindow(APP_URL);
    await settle();
    fake.destroyed = true;
    fake.calls.length = 0;
    showWindow(window);
    expect(fake.calls).toEqual([]);
  });

  it('ensureLoaded on an unknown window is a no-op, not a throw', () => {
    expect(() => ensureLoaded({} as never)).not.toThrow();
  });
});

describe('the window Electron is asked for', () => {
  it('carries the C-3 security flags and the hidden menu bar', async () => {
    createWindow(APP_URL);
    await settle();
    const options = fake.constructed[0] ?? {};
    expect(options['autoHideMenuBar']).toBe(true);
    expect(options['webPreferences']).toMatchObject({
      partition: 'persist:bb2dash',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
  });
});
