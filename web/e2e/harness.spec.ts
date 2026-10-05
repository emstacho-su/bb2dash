/**
 * The harness's own checks (Phase 17). Both titles are frozen by brief 97:
 *
 * * `signed in` (T-01) — the saved session reaches Home; `01-harness-home.png`.
 * * `no 404` (T-20) — the favicon and apple icon are served, and nothing on
 *   three screens logs a console error or answers 404.
 */

import { expect, test } from '@playwright/test';
import {
  assertNoWrites,
  collectConsole,
  dismissNativeDialogs,
  guardWrites,
  openSignedIn,
  shotPath,
} from './walk';

/** The Sync button's idle title (`src/lib/sync-request-phase.ts`, `phaseTitle('idle', …)`). */
const SYNC_TITLE = 'Ask the sync container to crawl Blackboard';

test('signed in', async ({ page, context }, testInfo) => {
  const writes = await guardWrites(context);
  dismissNativeDialogs(page);

  await openSignedIn(page, '/');
  await expect(page.getByTitle(SYNC_TITLE)).toBeVisible();
  // "Undated" today, "Undated (N)" once W-46's T-17 lands.
  await expect(page.getByRole('button', { name: /^Undated\b/ })).toBeVisible();

  await page.screenshot({ path: shotPath(testInfo, '01-harness-home.png'), fullPage: true });
  assertNoWrites(writes);
});

test('no 404', async ({ page, context }) => {
  const writes = await guardWrites(context);
  dismissNativeDialogs(page);
  const consoleMessages = collectConsole(page);
  const notFound: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) notFound.push(response.url());
  });

  for (const path of ['/', '/login', '/course/IST.352/stream']) {
    await page.goto(path);
    await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
  }

  // The icons Next injects from src/app (T-20): each answers 200 with its type.
  for (const [path, type] of [
    ['/favicon.ico', /image\/(x-icon|vnd\.microsoft\.icon)/],
    ['/apple-icon.png', /image\/png/],
  ] as const) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'] ?? '', path).toMatch(type);
  }

  expect(notFound).toEqual([]);
  expect(consoleMessages).toEqual([]);
  assertNoWrites(writes);
});
