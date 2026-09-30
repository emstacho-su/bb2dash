/**
 * R-43 (T-11, run by W-45): a pasted `?item=` link opens clean.
 *
 * Each URL is loaded twice — with the persisted query cache warm, then with it
 * cleared before any app script runs — and neither load may log React's #418
 * (a hydration text mismatch). `02-popout-pasted.png` is the cold load of the
 * IST.471 A1 link, the one acceptance step 6 pastes.
 */

import { expect, test, type Page } from '@playwright/test';
import {
  A1_POPOUT,
  assertNoWrites,
  coldCache,
  collectConsole,
  dismissNativeDialogs,
  guardWrites,
  openSignedIn,
  shotPath,
} from './walk';

const HYDRATION_ERROR = /418/;

/** The assignment page itself, which shares `AssignmentDetailBody` with the popout. */
const A1_PAGE = '/course/IST.471/assignment/IST.471/a1-proposal';

/**
 * A pasted `?item=session:` URL over IST.466's timeline. The timeline's session rows open a
 * side panel, not a link, so the URL is built from a real session: IST.466 on 2026-09-29, a
 * starred day (`sessions` id 105, read 2026-09-29).
 */
const IST466_SESSION_ID = 105;

async function sessionPopoutUrl(_page: Page): Promise<string> {
  return `/course/IST.466/classwork?view=timeline&item=session:${IST466_SESSION_ID}`;
}

/** Loads `url` warm, then cold, and returns every #418 line either load printed. */
async function loadWarmThenCold(page: Page, url: string): Promise<string[]> {
  const context = page.context();
  const messages = collectConsole(page);
  await openSignedIn(page, url);
  await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
  await page.reload();
  await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires

  // From here on every navigation in this context starts with no persisted cache.
  await coldCache(context);
  await openSignedIn(page, url);
  await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
  return messages.filter((line) => HYDRATION_ERROR.test(line));
}

test('assignment popout pasted into a new tab', async ({ page, context }, testInfo) => {
  const writes = await guardWrites(context);
  dismissNativeDialogs(page);

  expect(await loadWarmThenCold(page, A1_POPOUT)).toEqual([]);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: shotPath(testInfo, '02-popout-pasted.png') });
  assertNoWrites(writes);
});

test('session popout pasted into a new tab', async ({ page, context }) => {
  const writes = await guardWrites(context);
  dismissNativeDialogs(page);

  const url = await sessionPopoutUrl(page);
  expect(await loadWarmThenCold(page, url)).toEqual([]);
  await expect(page.getByRole('dialog')).toBeVisible();
  assertNoWrites(writes);
});

test('assignment page pasted into a new tab', async ({ page, context }) => {
  const writes = await guardWrites(context);
  dismissNativeDialogs(page);

  expect(await loadWarmThenCold(page, A1_PAGE)).toEqual([]);
  assertNoWrites(writes);
});
