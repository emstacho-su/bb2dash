/**
 * C-12 (Q4) — the tray. Closing the window hides it; the app keeps running and
 * polling, and *Quit* is the only exit.
 *
 * The icon is the 16 px PNG derived from `build/icon.png` by
 * `scripts/make-icons.mjs`. The menu is built from a plain list of
 * `{ label, click }` so the e2e suite can fire an item by its label through the
 * test hook — Playwright cannot click a Windows tray icon.
 */

import { Menu, Tray, nativeImage } from 'electron';
import type { BrowserWindow } from 'electron';

import { log } from './log';
import { resourcePath } from './resources';
import { IS_TEST_MODE, recordEvent } from './test-hook';

export const TRAY_TOOLTIP = 'bb2dash';
export const MENU_OPEN = 'Open bb2dash';
export const MENU_CHECK_NOW = 'Check now';
export const MENU_QUIT = 'Quit';

export interface TrayItem {
  readonly label: string;
  readonly click: () => void;
}

export interface TrayOptions {
  readonly window: BrowserWindow;
  readonly showWindow: (window: BrowserWindow) => void;
  readonly onCheckNow: () => void;
  readonly onQuit: () => void;
}

export interface TrayHandle {
  readonly tray: Tray;
  /** Fire a menu item by label. The e2e suite's only way in. */
  readonly click: (label: string) => void;
}

function trayImage(): Electron.NativeImage {
  const png = resourcePath('build', 'tray-16.png') ?? resourcePath('build', 'icon.ico');
  if (png === null) {
    log('no tray icon on disk; the tray will show the system placeholder');
    return nativeImage.createEmpty();
  }
  return nativeImage.createFromPath(png);
}

export function createTray(options: TrayOptions): TrayHandle {
  const items: readonly TrayItem[] = Object.freeze([
    { label: MENU_OPEN, click: () => options.showWindow(options.window) },
    { label: MENU_CHECK_NOW, click: options.onCheckNow },
    { label: MENU_QUIT, click: options.onQuit },
  ]);

  const tray = new Tray(trayImage());
  tray.setToolTip(TRAY_TOOLTIP);
  tray.setContextMenu(
    Menu.buildFromTemplate(
      items.map((item) => ({ label: item.label, click: (): void => item.click() })),
    ),
  );
  tray.on('click', () => options.showWindow(options.window));

  recordEvent('tray-menu', { labels: items.map((item) => item.label) });
  log(`tray created (${items.map((item) => item.label).join(' / ')})`);

  return {
    tray,
    click: (label: string): void => {
      const item = items.find((candidate) => candidate.label === label);
      if (item === undefined) {
        log(`tray item "${label}" does not exist`);
        return;
      }
      if (IS_TEST_MODE) recordEvent('tray-click', { label });
      item.click();
    },
  };
}
