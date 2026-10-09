/**
 * The desktop shell's chrome (Phase 22, task 27; D-1, entries `desktop-title-bar` and
 * `desktop-shell-details`), over the built shell and the local fixture.
 *
 * Proves what the unit suites cannot: that the live window was built with the app's bar as its title
 * bar, that its minimum width is the one `title-bar.ts` computes, that the menu Electron really
 * installed holds no zoom and no quit, that a right click in a field records the four roles and pops
 * no native menu under the test variable, and that a shell pointed at an address nothing listens on
 * shows the failed-load page with its Retry link. Nothing here opens a native dialog.
 */

import { createServer } from 'node:net';

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { startFixtureServer } from './fixture-server';
import type { FixtureServer } from './fixture-server';
import { launchShell, makeUserDataDir, recorded } from './launch';
import { DARK_OVERLAY, LIGHT_OVERLAY, MIN_WIDTH } from '../../src/main/title-bar';
import { LIGHT } from '../../src/main/window-background';

/** An address nothing listens on: a port the OS just handed out and the server gave back. */
async function deadAddress(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}

test.describe.configure({ mode: 'serial' });

test.describe('the chrome of a window that loads', () => {
  let fixture: FixtureServer;
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    app = await launchShell({ fixtureUrl: fixture.url, userDataDir: makeUserDataDir() });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await app.close();
    await fixture.close();
  });

  test('records the options the window was built with as window-chrome, and keeps window-preferences to its six keys', async () => {
    const events = await recorded(app);
    const chrome = events.find((event) => event.kind === 'window-chrome');
    expect(chrome?.payload).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: DARK_OVERLAY,
      autoHideMenuBar: true,
      minWidth: MIN_WIDTH,
    });
    expect((chrome?.payload as { titleBarOverlay: { height: number } }).titleBarOverlay.height).toBe(52);

    const preferences = events.find((event) => event.kind === 'window-preferences');
    expect(Object.keys(preferences?.payload as object).sort()).toEqual(
      ['contextIsolation', 'nodeIntegration', 'partition', 'sandbox', 'spellcheck', 'webSecurity'],
    );
  });

  test('the live window has the new minimum width', async () => {
    const minimum = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getMinimumSize());
    expect(minimum).toEqual([MIN_WIDTH, 600]);
  });

  test('the installed menu is built, and holds no zoom and no quit', async () => {
    const roles = await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      if (menu === null) return null;
      const out: string[] = [];
      const walk = (items: readonly { role?: string; submenu?: { items: readonly unknown[] } | null }[]): void => {
        for (const item of items) {
          if (item.role !== undefined) out.push(String(item.role).toLowerCase());
          if (item.submenu) walk(item.submenu.items as never);
        }
      };
      walk(menu.items as never);
      return out;
    });
    expect(roles).not.toBeNull();
    expect(roles).toEqual(expect.arrayContaining(['reload', 'forcereload', 'toggledevtools']));
    for (const forbidden of ['zoomin', 'zoomout', 'resetzoom', 'quit']) expect(roles).not.toContain(forbidden);
  });

  test('a right click in a field records the four roles and pops no native menu', async () => {
    const before = (await recorded(app)).filter((event) => event.kind === 'context-menu').length;
    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents;
      contents?.emit('context-menu', {}, {
        isEditable: true,
        selectionText: '',
        editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
      });
    });
    const events = (await recorded(app)).filter((event) => event.kind === 'context-menu');
    expect(events).toHaveLength(before + 1);
    expect(events.at(-1)?.payload).toEqual({ roles: ['cut', 'copy', 'paste', 'selectAll'] });
  });

  test('a right click on plain text outside a field records nothing', async () => {
    const before = (await recorded(app)).filter((event) => event.kind === 'context-menu').length;
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.emit('context-menu', {}, {
        isEditable: false,
        selectionText: '',
        editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false },
      });
    });
    expect((await recorded(app)).filter((event) => event.kind === 'context-menu')).toHaveLength(before);
  });

  test("the page's theme-color is turned into the title bar's colours, in any case", async () => {
    await app.evaluate(({ BrowserWindow }, colour) => {
      BrowserWindow.getAllWindows()[0]?.webContents.emit('did-change-theme-color', {}, colour);
    }, LIGHT.toUpperCase());
    const events = (await recorded(app)).filter((event) => event.kind === 'title-bar-overlay');
    expect(events.at(-1)?.payload).toMatchObject({ theme: 'light', overlay: { ...LIGHT_OVERLAY } });
  });

  test('an aborted load does not show the failed-load page', async () => {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'http://x.test/', true);
    });
    expect((await recorded(app)).filter((event) => event.kind === 'load-failed')).toEqual([]);
    await expect(page.locator('h1')).toHaveText('bb2dash e2e fixture');
  });
});

test.describe('a shell that cannot reach the app', () => {
  let app: ElectronApplication;

  test.beforeAll(async () => {
    app = await launchShell({ fixtureUrl: await deadAddress(), userDataDir: makeUserDataDir() });
  });

  test.afterAll(async () => {
    await app.close();
  });

  test('shows the failed-load page with its Retry link', async () => {
    const page = await app.firstWindow();
    const retry = page.getByRole('link', { name: 'Retry' });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await expect(retry).toHaveAttribute('href', /^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await recorded(app)).some((event) => event.kind === 'load-failed')).toBe(true);
  });
});
