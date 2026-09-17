/**
 * C-10 — Playwright for Electron over the built shell.
 *
 * `electronApp.evaluate` runs in the **main** process, which is the documented
 * way to reach APIs Playwright cannot drive: the tray, the cookie jar, the
 * window's own state. Everything the operating system would otherwise do — the
 * terminal spawn, opening the default browser — is recorded instead, under
 * `BB2DASH_TEST=1`.
 */

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { FIXTURE_REQUEST_ID, startFixtureServer } from './fixture-server';
import type { FixtureServer } from './fixture-server';
import {
  fixtureAuthCookie,
  launchShell,
  makeUserDataDir,
  recorded,
  spawnSecondInstance,
} from './launch';

const YEAR_2030 = 1_900_000_000;

test.describe.configure({ mode: 'serial' });

test.describe('the shell', () => {
  let fixture: FixtureServer;
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    app = await launchShell({ fixtureUrl: fixture.url, userDataDir: makeUserDataDir() });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // The sync watcher reads R4 with the session's bearer token, so the
    // partition needs a session before the button is pressed.
    const cookie = fixtureAuthCookie(YEAR_2030);
    await app.evaluate(
      async ({ session }, input) => {
        await session.fromPartition('persist:bb2dash').cookies.set({
          url: input.url,
          name: input.cookie.name,
          value: input.cookie.value,
          expirationDate: input.expirationDate,
        });
      },
      { url: fixture.url, cookie, expirationDate: YEAR_2030 },
    );
  });

  test.afterAll(async () => {
    await app.close();
    await fixture.close();
  });

  test('opens one window, on the configured app URL', async () => {
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(page.url()).toBe(`${fixture.url}/`);
    await expect(page.locator('h1')).toHaveText('bb2dash e2e fixture');
  });

  test('locks down webPreferences', async () => {
    const prefs = (await recorded(app)).find((event) => event.kind === 'window-preferences');

    expect(prefs?.payload).toEqual({
      partition: 'persist:bb2dash',
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    });
  });

  test('and the renderer really has none of what those flags forbid', async () => {
    // The flags are only worth what they deny, so assert the denial too.
    const reachable = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>).require,
      module: typeof (globalThis as Record<string, unknown>).module,
      process: typeof (globalThis as Record<string, unknown>).process,
      electron: typeof (globalThis as Record<string, unknown>).electron,
    }));

    expect(reachable).toEqual({
      require: 'undefined',
      module: 'undefined',
      process: 'undefined',
      electron: 'undefined',
    });
  });

  test('exposes the frozen preload object and no IPC', async () => {
    const exposed = await page.evaluate(() => {
      const api = (window as unknown as { bb2dashDesktop?: Record<string, unknown> })
        .bb2dashDesktop;
      return {
        keys: api === undefined ? null : Object.keys(api),
        frozen: api === undefined ? null : Object.isFrozen(api),
        hasRequire: 'require' in window,
        hasProcess: 'process' in window,
      };
    });

    expect(exposed.keys).toEqual(['version']);
    expect(exposed.frozen).toBe(true);
    expect(exposed.hasRequire).toBe(false);
    expect(exposed.hasProcess).toBe(false);
  });

  test('has a tray with Open / Check now / Quit', async () => {
    const menu = (await recorded(app)).find((event) => event.kind === 'tray-menu');
    expect(menu?.payload).toEqual({ labels: ['Open bb2dash', 'Check now', 'Quit'] });
  });

  test('creates no second window: window.open goes to the default browser', async () => {
    await page.click('#popup');

    await expect
      .poll(async () => (await recorded(app)).filter((event) => event.kind === 'open-external'))
      .toHaveLength(1);
    expect((await recorded(app)).at(-1)?.payload).toEqual({ url: 'https://example.com/popup' });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });

  test('opens the sync terminal when the app files a request', async () => {
    await page.click('#sync');
    await expect(page.locator('#status')).toHaveText('posted 201');

    await expect
      .poll(async () => (await recorded(app)).filter((event) => event.kind === 'sync-terminal'))
      .toHaveLength(1);

    const spawn = (await recorded(app)).find((event) => event.kind === 'sync-terminal');
    const { argv, cwd } = spawn?.payload as { argv: string[]; cwd: string };

    expect(argv.at(-1)).toBe(`claude '/bb-sync ${FIXTURE_REQUEST_ID}'`);
    expect(argv).toContain('-NoExit');
    expect(argv).toContain(cwd);
    if (argv[0]?.toLowerCase().endsWith('wt.exe')) {
      expect(argv.slice(1, 5)).toEqual(['-d', cwd, '--title', `bb-sync ${FIXTURE_REQUEST_ID}`]);
    } else {
      expect(argv[0]).toBe('powershell.exe');
    }
  });

  test('opens no second terminal for the same request', async () => {
    await page.click('#sync');
    await page.waitForTimeout(500);
    expect((await recorded(app)).filter((event) => event.kind === 'sync-terminal')).toHaveLength(1);
  });

  test('runs one poller tick from the tray', async () => {
    await app.evaluate(() => {
      const hook = (globalThis as { __bb2dashTest?: { clickTrayItem: (label: string) => void } })
        .__bb2dashTest;
      hook?.clickTrayItem('Check now');
    });

    const events = await recorded(app);
    expect(events.filter((event) => event.kind === 'tray-click')).toHaveLength(1);
    const ticks = events.filter((event) => event.kind === 'poller-tick');
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.payload).toMatchObject({ source: 'tray' });
  });

  // Last of the page-driven tests: the prevented navigation leaves Playwright
  // waiting on a navigation that, by design, never happens.
  test('keeps an outside link out of the window and hands it to the browser', async () => {
    const before = (await recorded(app)).filter((event) => event.kind === 'open-external').length;
    await page.evaluate(() => document.getElementById('leave')?.click());

    await expect
      .poll(async () => (await recorded(app)).filter((event) => event.kind === 'open-external'))
      .toHaveLength(before + 1);

    expect((await recorded(app)).at(-1)?.payload).toEqual({ url: 'https://example.com/outside' });
    expect(page.url()).toBe(`${fixture.url}/`);
  });

  test('hides to the tray on close, and the process stays alive', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());

    await expect
      .poll(async () =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
      )
      .toBe(false);

    // Still one window, and main still answers: the process did not quit.
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isReady())).toBe(true);
  });
});

test.describe('session persistence', () => {
  let fixture: FixtureServer;
  const userDataDir = makeUserDataDir();

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    const first = await launchShell({ fixtureUrl: fixture.url, userDataDir });
    await first.firstWindow();

    const cookie = fixtureAuthCookie(YEAR_2030);
    await first.evaluate(
      async ({ session }, input) => {
        const jar = session.fromPartition('persist:bb2dash').cookies;
        await jar.set({
          url: input.url,
          name: input.cookie.name,
          value: input.cookie.value,
          expirationDate: input.expirationDate,
        });
        await jar.flushStore();
      },
      { url: fixture.url, cookie, expirationDate: YEAR_2030 },
    );
    await first.close();
  });

  test.afterAll(async () => {
    await fixture.close();
  });

  test('the auth cookie survives a relaunch, carrying its expirationDate', async () => {
    const second = await launchShell({ fixtureUrl: fixture.url, userDataDir });
    await second.firstWindow();

    const cookies = await second.evaluate(
      ({ session }, url) => session.fromPartition('persist:bb2dash').cookies.get({ url }),
      fixture.url,
    );

    const auth = cookies.find((cookie) => cookie.name === 'sb-localfixture-auth-token');
    expect(auth, 'the auth cookie is still in the persisted partition').toBeDefined();
    expect(auth?.expirationDate).toBeGreaterThan(Date.now() / 1000);
    expect(auth?.session).toBeFalsy();

    await second.close();
  });
});

test.describe('single instance', () => {
  let fixture: FixtureServer;
  const userDataDir = makeUserDataDir();

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
  });

  test.afterAll(async () => {
    await fixture.close();
  });

  test('a second launch quits and leaves the first window alone', async () => {
    const first = await launchShell({ fixtureUrl: fixture.url, userDataDir });
    await first.firstWindow();

    const exitCode = await spawnSecondInstance({ fixtureUrl: fixture.url, userDataDir });

    expect(exitCode, 'the second launch quits instead of opening a window').toBe(0);
    expect(await first.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
      1,
    );

    // The first instance saw the second and raised its window.
    await expect
      .poll(async () => (await recorded(first)).filter((event) => event.kind === 'second-instance'))
      .toHaveLength(1);
    expect(
      await first.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()),
    ).toBe(true);

    await first.close();
  });
});
