/**
 * The first sitting's way of shooting (Phase 21's walk, brief 102, task 22):
 * the whole page, and for an answered question a window made tall enough to
 * hold the turn. Shot 02 is the whole page as it stands; 03, 04 and 10 were
 * asked, waited for and shot in the tall window.
 *
 * The retake sitting replaced this for 11, 05, 06, 07 and 08 with "a shot is
 * the window" (`walk21.window.ts`): a full-page shot of a tall window is what
 * hid W-2. It stays for the tests that were not retaken.
 *
 * Not a spec: the config's `testMatch` takes `*.spec.ts` only.
 */

import { expect, type Locator, type Page } from '@playwright/test';
import {
  VIEWPORT,
  ask,
  conversationOf,
  conversationPath,
  expectShown,
  inColumnBox,
  lastTurn,
  openSettled,
  reportTurn,
  turnClosed,
  utcNow,
  walkFailShot,
  walkShot,
  workspaceReady,
} from './walk21.lib';

/** Take a question's shot again from the page as it stands, asking nothing (see `askAndShoot`). */
const RESHOOT = process.env['WALK21_RESHOOT'] === '1';

/** The message column's share of the window's height (`MessageList.module.css`: `max-height: 62dvh`). */
const COLUMN_HEIGHT_SHARE = 0.62;
/** The column's own padding, and room to spare, in pixels. */
const COLUMN_CHROME_PX = 96;
/** No shot is taller than this; a turn that needs more fails its on-screen assertion. */
const SHOT_MAX_HEIGHT_PX = 9000;

/**
 * Runs the shot's assertions, then shoots. A failed assertion saves the screen
 * as `<name>-FAIL.png` and rethrows, so the evidence of what was shown exists.
 */
export async function assertThenShoot(page: Page, name: string, assertions: () => Promise<void>): Promise<void> {
  try {
    await assertions();
  } catch (error) {
    await page.screenshot({ path: walkFailShot(name), fullPage: true });
    throw error;
  }
  await page.screenshot({ path: walkShot(name), fullPage: true });
  console.log(`[walk21] ${name} shot at ${utcNow()}`);
}

/** Whether the element is on screen whole: not scrolled out of the column, not cut by its edge. */
async function wholeOnScreen(locator: Locator): Promise<boolean> {
  if ((await locator.count()) === 0) return false;
  return locator.first().evaluate(
    (element) =>
      new Promise<boolean>((resolve) => {
        const observer = new IntersectionObserver((entries) => {
          observer.disconnect();
          resolve((entries[0]?.intersectionRatio ?? 0) >= 1);
        });
        observer.observe(element);
      }),
  );
}

/**
 * Makes the window tall enough to hold the whole last turn, and brings the turn
 * to the top of the column.
 *
 * The column is 62dvh tall and scrolls inside itself, following an answer to
 * its end. At 1440 by 900 a long answer's badge (above it) and its "Used:" line
 * (under it) are therefore never on screen together, and a shot has to show
 * both. What the page showed before this is printed first, as a reading.
 */
async function fitTurnInShot(page: Page, label: string): Promise<void> {
  const turn = lastTurn(page);
  const before = {
    badgeOnScreen: await wholeOnScreen(turn.locator('[data-tier]')),
    usedOnScreen: await wholeOnScreen(turn.locator('[data-used]')),
    lineOnScreen: await wholeOnScreen(turn.locator('[data-turn-line]')),
  };
  const box = await turn.boundingBox();
  if (box === null) throw new Error('the last turn has no box');
  const needed = Math.ceil((box.height + COLUMN_CHROME_PX) / COLUMN_HEIGHT_SHARE);
  const height = Math.min(SHOT_MAX_HEIGHT_PX, Math.max(VIEWPORT.height, needed));
  await page.setViewportSize({ width: VIEWPORT.width, height });
  // Only the column is scrolled, the turn's top to the column's upper edge; then the window is put back at its top.
  await inColumnBox(turn, { clearPx: 0 });
  await page.evaluate(() => window.scrollTo(0, 0));
  console.log(
    `[walk21] ${label}: at ${VIEWPORT.width}x${VIEWPORT.height} the page showed ${JSON.stringify(before)}; ` +
      `the turn is ${Math.round(box.height)} px tall, shot at ${VIEWPORT.width}x${height}`,
  );
}

export interface LiveQuestion {
  /** The conversation to ask into; null starts one. */
  conversation: string | null;
  question: string;
  shot: string;
  badge: string;
  usedTools: readonly string[];
}

/** What a finished answer's shot must show: done, its badge, text, and the tools on its "Used:" line. */
async function expectAnswered(page: Page, live: LiveQuestion): Promise<void> {
  const turn = lastTurn(page);
  await expect(turn.getByText(live.question, { exact: true })).toBeVisible();
  await expect(turn).toHaveAttribute('data-turn', 'done');
  await expect(turn.locator('[data-tier]')).toHaveText(live.badge);
  await expect(turn.locator('[data-answer-text]')).not.toBeEmpty();
  await expect(turn.locator('[data-turn-line]')).toHaveCount(0);
  for (const tool of live.usedTools) {
    await expect(turn.locator('[data-used]')).toContainText(/^Used: /);
    await expect(turn.locator('[data-used]')).toContainText(tool);
  }
  await fitTurnInShot(page, live.shot);
  // On screen, whole and uncovered: an attribute the shot does not show proves nothing about the shot.
  await expectShown(turn.getByText(live.question, { exact: true }));
  await expectShown(turn.locator('[data-tier]'));
  if (live.usedTools.length > 0) await expectShown(turn.locator('[data-used]'));
}

/**
 * Asks one question, waits for its stored answer, asserts the shot and takes it.
 *
 * With `WALK21_RESHOOT=1` nothing is asked: the shot is taken again of the
 * conversation's last turn as it stands, which must be this question's. It
 * spends no turn, and it works only until the next question is asked.
 */
export async function askAndShoot(page: Page, live: LiveQuestion): Promise<void> {
  if (RESHOOT) {
    if (live.conversation === null) throw new Error('a reshoot needs the conversation: set WALK21_CONVERSATION');
    await openSettled(page, conversationPath(live.conversation));
    await workspaceReady(page);
    await expect(page.locator('li[data-turn]').first()).toBeVisible();
    await reportTurn(page, `${live.shot} (reshoot, nothing asked)`, 'not asked');
  } else {
    await openSettled(page, conversationPath(live.conversation));
    await workspaceReady(page);
    const askedAt = await ask(page, live.question);
    console.log(`[walk21] ${live.shot}: asked at ${askedAt} in conversation ${conversationOf(page)}`);
    await turnClosed(page);
    await reportTurn(page, live.shot, askedAt);
  }
  await assertThenShoot(page, live.shot, () => expectAnswered(page, live));
}
