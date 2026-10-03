/**
 * Phase 19's walk screenshots (brief 99, task 28): `walk-19/01` … `06`.
 *
 * Run from `web/` against the phase's preview, after `e2e/login.mjs` has saved
 * a session for that host:
 *
 *   npx playwright test -c e2e/playwright.config.ts walk19
 *
 * * 01–03 read standing data and run by default. Every route is loaded cold
 *   from the address bar (no persisted query cache), and the console's errors
 *   and warnings are printed after each test (Phase 17: walk direct loads).
 * * 04–06 need live state (a sync claimed and crawling; a sync reaped as
 *   interrupted), so they are skipped unless `WALK19_LIVE=1`; run each with
 *   `-g` while its state holds.
 * * Each test asserts what its shot must show before it shoots. When an
 *   assertion fails, the screen is saved as `<name>-FAIL.png` and the test
 *   fails: the assertion is never relaxed to fit the screen.
 * * Read-only: `guardWrites` aborts any table write and fails the test.
 * * Shots go to `docs/planning/sprint-2/walks/walk-19/` by explicit path;
 *   the config's `shotDir` stays Phase 17's.
 */

import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  assertNoWrites,
  coldCache,
  collectConsole,
  dismissNativeDialogs,
  guardWrites,
  openSignedIn,
} from './walk';

/** `__dirname`: this package is CommonJS (see playwright.config.ts). */
const SHOT_DIR = join(__dirname, '..', '..', 'docs', 'planning', 'sprint-2', 'walks', 'walk-19');

/** The app polls, so 'networkidle' never fires; this lets the cold reads land. */
const SETTLE_MS = 2000;

/** IST.466's two same-titled lessons and the two files the brief names (acceptance step 1). */
const INFORMATION_TITLE = 'Information';
const ETHICS_FILE = 'Ethics Criteria.pptx';
const ETHICS_ITEM = /Ethics vs\./;
const LECTURE_FILE = 'LectureM3_IST466Fall 2026 (2).pptx';

/** IST.352's WK01 folder whose ghost copy migration 130 removed; the ghost's old title. */
const WK01_SDE = 'WK01 - The Systems Development Environment';
const WK01_GHOST = 'WK01 - Chapter 1';

/** The course whose Stream holds both New and Changed material posts on prod. */
const STREAM_COURSE = 'IST.352';

/** `MaterialPost`'s date: "synced Thu · Oct 1" (`formatDay`). */
const CRAWL_DATE = /^synced \w{3} · \w{3} \d{1,2}$/;

/** The reaper's two Inbox texts (acceptance step 5). */
const INTERRUPTED_ITEM =
  /^A Blackboard sync (did not finish within 30 minutes|was claimed but never started its crawl)/;

const LIVE = process.env['WALK19_LIVE'] === '1';

let writes: string[] = [];
let consoleMessages: string[] = [];

test.beforeEach(async ({ page, context }) => {
  writes = await guardWrites(context);
  await coldCache(context);
  consoleMessages = collectConsole(page);
  dismissNativeDialogs(page);
});

test.afterEach(() => {
  const testInfo = test.info();
  const report = consoleMessages.length === 0 ? 'none' : consoleMessages.join('\n  ');
  console.log(`[${testInfo.title}] console errors/warnings: ${report}`);
  testInfo.annotations.push({ type: 'console', description: report });
  assertNoWrites(writes);
});

/**
 * Runs the shot's assertions, then shoots. A failed assertion saves the screen
 * as `<name>-FAIL.png` and rethrows, so the evidence of what was shown exists.
 */
async function assertThenShoot(page: Page, name: string, assertions: () => Promise<void>): Promise<void> {
  try {
    await assertions();
  } catch (error) {
    await page.screenshot({ path: join(SHOT_DIR, name.replace(/\.png$/, '-FAIL.png')), fullPage: true });
    throw error;
  }
  await page.screenshot({ path: join(SHOT_DIR, name), fullPage: true });
}

async function openSettled(page: Page, path: string): Promise<void> {
  await openSignedIn(page, path);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
}

/** A Classwork node as drawn: its recursion depth, its own title and its whole text (files included). */
type DrawnNode = { depth: number; folder: boolean; title: string; text: string };

/** Every drawn Classwork node, in document order (the tree renders as a flat run of siblings). */
async function drawnNodes(page: Page): Promise<DrawnNode[]> {
  return page.locator('[data-content-id][data-depth]').evaluateAll((els) =>
    els.map((el) => ({
      depth: Number(el.getAttribute('data-depth')),
      folder: el.getAttribute('data-folder') === 'true',
      title: (el.querySelector(':scope > div > span')?.textContent ?? '').trim(),
      text: (el.textContent ?? '').replace(/\s+/g, ' '),
    })),
  );
}

/** A root node and the nodes drawn under it, up to the next root. */
function subtreeAt(nodes: readonly DrawnNode[], rootIndex: number): DrawnNode[] {
  const next = nodes.findIndex((node, index) => index > rootIndex && node.depth === 0);
  return nodes.slice(rootIndex + 1, next === -1 ? nodes.length : next);
}

async function waitForTree(page: Page): Promise<void> {
  await expect(page.getByText('Blackboard content', { exact: true })).toBeVisible();
  // The header's count replaces "loading…" once the tree read has landed.
  await expect(page.getByText(/^\d+ items? · \d+ files?$/)).toBeVisible();
  await expect(page.locator('[data-content-id]').first()).toBeVisible();
}

test.describe('standing data (acceptance steps 1–3)', () => {
  test('01 IST.466 classwork', async ({ page }) => {
    await openSettled(page, '/course/IST.466/classwork');
    await assertThenShoot(page, '01-ist466-classwork.png', async () => {
      await waitForTree(page);
      await expect(page.getByText(ETHICS_FILE).first()).toBeVisible();
      await expect(page.getByText(LECTURE_FILE, { exact: true })).toBeVisible();

      const nodes = await drawnNodes(page);
      const informationRoots = nodes.flatMap((node, index) =>
        node.depth === 0 && node.title === INFORMATION_TITLE ? [index] : [],
      );
      expect(informationRoots, 'two "Information" lessons at the top level').toHaveLength(2);
      for (const index of informationRoots) {
        expect(subtreeAt(nodes, index).length, 'each "Information" lesson is drawn with its children').toBeGreaterThan(0);
      }
      const lectureUnderInformation = informationRoots.some((index) =>
        subtreeAt(nodes, index).some((node) => node.text.includes(LECTURE_FILE)),
      );
      expect(lectureUnderInformation, `${LECTURE_FILE} sits under an "Information" lesson`).toBe(true);
      const ethicsUnderItem = nodes.some((node) => ETHICS_ITEM.test(node.title) && node.text.includes(ETHICS_FILE));
      expect(ethicsUnderItem, `${ETHICS_FILE} sits under its "Ethics vs." item`).toBe(true);
    });
  });

  test('02 IST.352 classwork', async ({ page }) => {
    await openSettled(page, '/course/IST.352/classwork');
    await assertThenShoot(page, '02-ist352-classwork.png', async () => {
      await waitForTree(page);
      const wk01Titles = (await drawnNodes(page))
        .filter((node) => node.folder && /^WK01\b/.test(node.title))
        .map((node) => node.title);
      console.log(`[02] WK01 folders drawn: ${JSON.stringify(wk01Titles)}`);
      expect(wk01Titles.filter((title) => title === WK01_SDE), `one "${WK01_SDE}" folder`).toHaveLength(1);
      expect(wk01Titles, 'no WK01 folder is drawn twice').toEqual([...new Set(wk01Titles)]);
      await expect(page.getByText(WK01_GHOST)).toHaveCount(0);
      // Phase 17's removed-items toggle stays folded: the shot shows what Blackboard lists now.
      await expect(page.getByRole('button', { name: /Blackboard no longer lists$/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  test('03 stream history', async ({ page }) => {
    await openSettled(page, `/course/${STREAM_COURSE}/stream`);
    await assertThenShoot(page, '03-stream-history.png', async () => {
      const block = page.getByRole('region', { name: 'New and changed materials' });
      await expect(block).toBeVisible();
      const posts = block.locator('li[data-change]');
      await expect(posts.first()).toBeVisible();
      // Every post shown (not the folded "N earlier") says New or Changed and carries its crawl date.
      const shown = block.locator(':scope > ul > li[data-change]');
      const count = await shown.count();
      expect(count).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const post = shown.nth(index);
        await expect(post.getByText(/^(New|Changed)$/)).toBeVisible();
        await expect(post.locator('time')).toHaveText(CRAWL_DATE);
      }
      await block.scrollIntoViewIfNeeded();
    });
  });
});

test.describe('live state (acceptance steps 4–5; WALK19_LIVE=1)', () => {
  test.skip(!LIVE, 'needs a running or interrupted sync on prod: set WALK19_LIVE=1 and run with -g');

  test('04 home sync running', async ({ page }) => {
    await openSettled(page, '/');
    await assertThenShoot(page, '04-home-sync-running.png', async () => {
      await expect(page.getByText(/sync running/).first()).toBeVisible();
    });
  });

  test('05 home interrupted', async ({ page }) => {
    await openSettled(page, '/');
    await assertThenShoot(page, '05-home-interrupted.png', async () => {
      await expect(page.getByText(/last sync interrupted/).first()).toBeVisible();
    });
  });

  test('06 inbox interrupted', async ({ page }) => {
    await openSettled(page, '/inbox');
    await assertThenShoot(page, '06-inbox-interrupted.png', async () => {
      await expect(page.getByText(INTERRUPTED_ITEM).first()).toBeVisible();
    });
  });
});
