/**
 * The app's own menu (Phase 22, task 27; D-1, entry `desktop-shell-details`).
 *
 * A built menu, never `null` (`shell.spec.ts` reads `Menu.getApplicationMenu()`), that holds
 * Reload, Force reload, the developer tools, Minimise and Close, as role items. No File, Edit or
 * Help. No zoom: zoomed, the bar is no longer 52 window pixels and the three buttons stop matching
 * it (taste call T-6). No Quit: the tray's Quit stays the only full exit.
 */

import { describe, expect, it } from 'vitest';

import { appMenuTemplate } from '../../src/main/app-menu';

interface Item {
  readonly role?: string;
  readonly label?: string;
  readonly submenu?: readonly Item[];
  readonly click?: unknown;
  readonly type?: string;
}

/** Every leaf item of a template, however deep. */
function leaves(items: readonly Item[]): Item[] {
  return items.flatMap((item) => (item.submenu === undefined ? [item] : leaves(item.submenu)));
}

const template = appMenuTemplate() as readonly Item[];
const roles = leaves(template)
  .filter((item) => item.type !== 'separator')
  .map((item) => item.role);

describe('the app menu template', () => {
  it('is not empty, so a built menu is always installed', () => {
    expect(template.length).toBeGreaterThan(0);
    expect(roles.length).toBeGreaterThan(0);
  });

  it('every item is a role item: a role and no click handler of its own', () => {
    for (const item of leaves(template)) {
      if (item.type === 'separator') continue;
      expect(typeof item.role, JSON.stringify(item)).toBe('string');
      expect(item.click, JSON.stringify(item)).toBeUndefined();
    }
  });

  it('holds reload, forceReload and toggleDevTools, minimize and close', () => {
    expect(roles).toEqual(expect.arrayContaining(['reload', 'forceReload', 'toggleDevTools', 'minimize', 'close']));
  });

  it('holds no zoom item and no quit', () => {
    for (const forbidden of ['zoomIn', 'zoomOut', 'resetZoom', 'quit']) {
      expect(roles, forbidden).not.toContain(forbidden);
    }
  });

  it('has no top-level label File, Edit or Help', () => {
    const labels = template.map((item) => item.label);
    for (const forbidden of ['File', 'Edit', 'Help']) expect(labels).not.toContain(forbidden);
  });

  it('is a fresh template on every call, so nothing a caller does to one reaches the next', () => {
    expect(appMenuTemplate()).not.toBe(appMenuTemplate());
    expect(appMenuTemplate()).toEqual(appMenuTemplate());
  });
});
