/**
 * Brief 100 task 18, round 2 item 9: `syncLauncher = queue-only` with the container's login item
 * open, end to end over the built shell.
 *
 * The fixture serves two open Inbox items: the container's (`sync-login-required`) and the Chrome
 * skill's (`chrome-login-required`). Under `BB2DASH_TEST=1` the prompt records `login-prompt`
 * instead of calling `shell.openExternal`, so no browser opens; the password file is a fixture,
 * so the real secret is never read. Two poller ticks the same day open the page once; pressing
 * Sync opens no terminal.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

import { startFixtureServer } from './fixture-server';
import type { FixtureServer } from './fixture-server';
import { fixtureAuthCookie, launchShell, makeUserDataDir, recorded } from './launch';

const YEAR_2030 = 1_900_000_000;
const FIXTURE_PASSWORD = 'e2e-fixture-novnc-pass';

test.describe.configure({ mode: 'serial' });

test.describe('queue-only with the container login item open', () => {
  let fixture: FixtureServer;
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    fixture = await startFixtureServer();
    const secrets = mkdtempSync(join(tmpdir(), 'bb2dash-e2e-secrets-'));
    const novncPasswordFile = join(secrets, 'novnc_password');
    writeFileSync(novncPasswordFile, `${FIXTURE_PASSWORD}\r\n`, 'utf8');

    app = await launchShell({
      fixtureUrl: fixture.url,
      userDataDir: makeUserDataDir(),
      syncLauncher: 'queue-only',
      novncPasswordFile,
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');

    // The poller reads the Inbox with the session's bearer token.
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

  test('records login-prompt once, unlocked; no browser and no terminal open', async () => {
    const checkNow = () =>
      app.evaluate(() => {
        const hook = (globalThis as { __bb2dashTest?: { clickTrayItem: (label: string) => void } })
          .__bb2dashTest;
        hook?.clickTrayItem('Check now');
      });
    const prompts = async () => (await recorded(app)).filter((event) => event.kind === 'login-prompt');

    await checkNow();
    await expect.poll(async () => (await prompts()).length).toBe(1);

    // The same New York day: a second tick opens nothing. Sync only queues under queue-only.
    await checkNow();
    await page.evaluate(() => document.getElementById('sync')?.click());
    await expect(page.locator('#status')).toHaveText('posted 201');
    await page.waitForTimeout(1_500);

    const events = await recorded(app);
    expect(events.filter((event) => event.kind === 'poller-tick')).toHaveLength(2);
    expect(await prompts()).toHaveLength(1);
    expect((await prompts())[0]?.payload).toEqual({ page: 'http://127.0.0.1:6080/vnc.html', unlocked: true });
    expect(events.filter((event) => event.kind === 'open-external')).toEqual([]);
    expect(events.filter((event) => event.kind === 'sync-terminal')).toEqual([]);
    expect(JSON.stringify(events)).not.toContain(FIXTURE_PASSWORD);
  });
});
