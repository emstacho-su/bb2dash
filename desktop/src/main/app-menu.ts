/**
 * The app's own menu (Phase 22, task 27; D-1, entry `desktop-shell-details`).
 *
 * A built menu, never `null`, held in the window's menu bar that stays hidden until Alt
 * (`autoHideMenuBar`): Reload, Force reload, the developer tools, Minimise and Close, as role items.
 * No File, Edit or Help. No zoom items: zoomed, the bar is no longer 52 window pixels and the three
 * buttons stop matching it (taste call T-6). No Quit: the tray's Quit stays the only full exit.
 *
 * Pure: a template, so `test/unit/app-menu.test.ts` needs no Electron. `index.ts` builds and installs
 * it from an `app.on('ready')` listener.
 */

import type { MenuItemConstructorOptions } from 'electron';

export function appMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];
}
