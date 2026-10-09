/**
 * What `createWindow` wires for the shell's chrome (Phase 22, task 27), over an `electron` mock
 * that can fire a `webContents` event: the options the window is built with, the title-bar overlay
 * that follows the page's `theme-color`, the right-click menu, and the failed-load page.
 *
 * The pure pieces have their own tests (`title-bar`, `context-menu`, `shell-pages`); this proves
 * `window.ts` joins them up, and that an aborted load never shows the failed-load page.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  constructed: [] as Record<string, unknown>[],
  contentHandlers: {} as Record<string, ((...args: unknown[]) => void)[]>,
  loads: [] as string[],
  overlays: [] as unknown[],
  popups: [] as unknown[],
  menuTemplates: [] as unknown[],
  url: 'about:blank',
  throwOnOverlay: false,
}));

vi.mock('electron', () => {
  const webContents = {
    loadURL(url: string) {
      fake.loads.push(url);
      if (url.startsWith('data:')) {
        fake.url = url;
        return Promise.resolve();
      }
      return Promise.reject(new Error('ERR_CONNECTION_REFUSED (-102)'));
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      (fake.contentHandlers[event] ??= []).push(handler);
      return webContents;
    },
    isCrashed: () => false,
    getURL: () => fake.url,
  };
  class FakeBrowserWindow {
    readonly webContents = webContents;
    constructor(options: Record<string, unknown>) {
      fake.constructed.push(options);
    }
    on() {
      return this;
    }
    once() {
      return this;
    }
    isDestroyed = () => false;
    isMaximized = () => false;
    getNormalBounds = () => ({ x: 0, y: 0, width: 1280, height: 800 });
    setTitleBarOverlay = (overlay: unknown) => {
      if (fake.throwOnOverlay) throw new Error('not on this platform');
      fake.overlays.push(overlay);
    };
  }
  return {
    BrowserWindow: FakeBrowserWindow,
    Menu: {
      buildFromTemplate: (template: unknown) => {
        fake.menuTemplates.push(template);
        return { popup: (options: unknown) => fake.popups.push(options) };
      },
    },
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

import { createWindow, needsReload } from '../../src/main/window';
import { DARK_OVERLAY, LIGHT_OVERLAY, MIN_WIDTH } from '../../src/main/title-bar';
import { LIGHT } from '../../src/main/window-background';

const APP_URL = 'http://127.0.0.1:4321/';

function fire(event: string, ...args: unknown[]): void {
  for (const handler of fake.contentHandlers[event] ?? []) handler(...args);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

beforeEach(() => {
  fake.constructed.length = 0;
  fake.contentHandlers = {};
  fake.loads.length = 0;
  fake.overlays.length = 0;
  fake.popups.length = 0;
  fake.menuTemplates.length = 0;
  fake.url = 'about:blank';
  fake.throwOnOverlay = false;
});

describe('the options the window is built with', () => {
  it('hides the title bar behind an overlay in the dark bar colours, with the new minimum width', () => {
    createWindow(APP_URL);
    const options = fake.constructed[0] ?? {};
    expect(options['titleBarStyle']).toBe('hidden');
    expect(options['titleBarOverlay']).toEqual(DARK_OVERLAY);
    expect(options['minWidth']).toBe(MIN_WIDTH);
    expect(options['minHeight']).toBe(600);
    expect(options['autoHideMenuBar']).toBe(true);
  });
});

describe('the title bar follows the page theme', () => {
  it('sets the light overlay for the light ground, in any case and with white space', async () => {
    createWindow(APP_URL);
    for (const colour of [LIGHT, LIGHT.toUpperCase(), ` ${LIGHT} `]) fire('did-change-theme-color', {}, colour);
    expect(fake.overlays).toEqual([LIGHT_OVERLAY, LIGHT_OVERLAY, LIGHT_OVERLAY]);
    await settle();
  });

  it('sets the dark overlay for the dark ground, null and junk', () => {
    createWindow(APP_URL);
    for (const colour of ['#050505', null, 'rebeccapurple']) fire('did-change-theme-color', {}, colour);
    expect(fake.overlays).toEqual([DARK_OVERLAY, DARK_OVERLAY, DARK_OVERLAY]);
  });

  it('a platform that cannot set the overlay does not throw out of the listener', () => {
    createWindow(APP_URL);
    fake.throwOnOverlay = true;
    expect(() => fire('did-change-theme-color', {}, LIGHT)).not.toThrow();
  });
});

describe('the right-click menu', () => {
  const flags = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

  it('pops a menu built from the template in a field', () => {
    createWindow(APP_URL);
    fire('context-menu', {}, { isEditable: true, selectionText: '', editFlags: flags });
    expect(fake.menuTemplates).toHaveLength(1);
    expect(fake.popups).toHaveLength(1);
  });

  it('pops nothing where the template is empty', () => {
    createWindow(APP_URL);
    fire('context-menu', {}, { isEditable: false, selectionText: '', editFlags: flags });
    expect(fake.popups).toEqual([]);
  });
});

describe('the failed-load page', () => {
  it('shows for a main-frame failure other than an abort, and the window needs a reload while it does', async () => {
    const window = createWindow(APP_URL);
    await settle();
    fake.loads.length = 0;
    fire('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', APP_URL, true);
    expect(fake.loads).toHaveLength(1);
    expect(fake.loads[0]?.startsWith('data:text/html')).toBe(true);
    expect(needsReload(window as never)).toBe(true);
  });

  it('never shows for an aborted load, code -3, nor for a subframe', async () => {
    createWindow(APP_URL);
    await settle();
    fake.loads.length = 0;
    fire('did-fail-load', {}, -3, 'ERR_ABORTED', APP_URL, true);
    fire('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'http://frame.test/', false);
    expect(fake.loads).toEqual([]);
  });

  it('is not shown again while it is already up', async () => {
    createWindow(APP_URL);
    await settle();
    fake.loads.length = 0;
    fire('did-fail-load', {}, -102, 'x', APP_URL, true);
    fire('did-fail-load', {}, -102, 'x', APP_URL, true);
    expect(fake.loads).toHaveLength(1);
  });

  it('the window no longer needs a reload once the app has finished loading over it', async () => {
    const window = createWindow(APP_URL);
    await settle();
    fire('did-fail-load', {}, -102, 'x', APP_URL, true);
    expect(needsReload(window as never)).toBe(true);
    fake.url = APP_URL;
    fire('did-finish-load');
    expect(needsReload(window as never)).toBe(false);
  });
});
