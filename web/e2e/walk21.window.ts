/**
 * The retake sitting's rule, as helpers (Phase 21's walk, 2026-10-07, after W-66
 * fixed the walk's W-1 and W-2): A SHOT IS THE WINDOW, 1440 by 900, never the
 * whole page and never a window made tall. A full-page shot of a tall window is
 * what hid W-2 in the first sitting.
 *
 * Here: the document against its window (W-1), the window shot and its read
 * back, what stands at the column's end (W-2), and the first sitting's archived
 * conversation opened by its row. `walk21.retake.spec.ts` uses all of it;
 * `06 stopped`, `07 offline` and `08 desktop` in `walk21.spec.ts` shoot under
 * the same rule.
 *
 * Not a spec: the config's `testMatch` takes `*.spec.ts` only.
 */

import { readFileSync } from 'node:fs';
import { expect, type Locator, type Page } from '@playwright/test';
import {
  SETTLE_MS,
  SHOW_ARCHIVED_LABEL,
  UNARCHIVE_LABEL,
  VIEWPORT,
  conversationFrom,
  conversationList,
  expectUncovered,
  inColumnBox,
  lastTurn,
  messageColumn,
  openSettled,
  textOrNull,
  utcNow,
  walkFailShot,
  walkShot,
  workspaceReady,
  type InColumn,
} from './walk21.lib';

/** The app's shell is 1 px taller than its window on every screen; more than that is W-1. */
const PAGE_OVER_WINDOW_MAX_PX = 1;
/** Half the gap between two turns: the column's edge then falls between this turn and the one before. */
const TURN_START_CLEAR_PX = 12;
/** A scroll made by the spec has reached the page's own scroll handler. */
const SCROLL_SETTLE_MS = 300;
/** One wheel turn outside the column, far longer than the window. */
const WHEEL_PX = 3000;
/** A device-scaled shot may round each side by a pixel. */
export const SHOT_ROUNDING_PX = 2;

/* ---------------------------------------------------------------------------
 * W-1: the document against its window
 * ------------------------------------------------------------------------ */

/** The document against its window, and the column's content against its box. */
export interface Layout {
  /** `document.documentElement.scrollHeight`. */
  documentHeight: number;
  bodyHeight: number;
  /** `window.innerHeight` and `window.innerWidth`. */
  windowHeight: number;
  windowWidth: number;
  windowScrollY: number;
  columnScrollHeight: number;
  columnClientHeight: number;
  columnScrollTop: number;
  /** How far the column is scrolled from its end. */
  columnFromEnd: number;
}

async function layoutOf(page: Page): Promise<Layout> {
  return messageColumn(page).evaluate((box) => {
    if (!/(auto|scroll)/.test(getComputedStyle(box).overflowY)) throw new Error('the message column does not scroll');
    return {
      documentHeight: document.documentElement.scrollHeight,
      bodyHeight: Math.round(document.body.getBoundingClientRect().height),
      windowHeight: globalThis.innerHeight,
      windowWidth: globalThis.innerWidth,
      windowScrollY: Math.round(globalThis.scrollY),
      columnScrollHeight: box.scrollHeight,
      columnClientHeight: box.clientHeight,
      columnScrollTop: Math.round(box.scrollTop),
      columnFromEnd: Math.round(box.scrollHeight - box.scrollTop - box.clientHeight),
    };
  });
}

/** W-1: however long the conversation, the document is at most 1 px taller than its window. */
export async function expectDocumentFitsWindow(page: Page, label: string): Promise<Layout> {
  const layout = await layoutOf(page);
  console.log(`[walk21] ${label}: layout ${JSON.stringify(layout)}`);
  expect(
    layout.documentHeight,
    `the document is at most ${PAGE_OVER_WINDOW_MAX_PX} px taller than its window (W-1)`,
  ).toBeLessThanOrEqual(layout.windowHeight + PAGE_OVER_WINDOW_MAX_PX);
  return layout;
}

/** The conversation is longer than its column, the page is not, and a wheel turn outside the column goes nowhere. */
export async function expectLongAndContained(page: Page, label: string): Promise<void> {
  expect(page.viewportSize(), "the window is the config's 1440 by 900").toEqual(VIEWPORT);
  const layout = await expectDocumentFitsWindow(page, label);
  expect(layout.columnScrollHeight, 'the conversation is longer than its column').toBeGreaterThan(
    layout.columnClientHeight,
  );
  // Before the fix a wheel turn outside the column scrolled the window into empty space.
  await page.getByRole('heading', { name: 'Workspace', level: 1 }).hover();
  await page.mouse.wheel(0, WHEEL_PX);
  await page.waitForTimeout(SCROLL_SETTLE_MS);
  const moved = await page.evaluate(() => Math.round(globalThis.scrollY));
  const turns = await page.locator('li[data-turn]').count();
  console.log(`[walk21] ${label}: ${turns} turns; a ${WHEEL_PX} px wheel turn on the heading moved the window ${moved} px`);
  expect(moved, 'a wheel turn outside the column moves the window at most 1 px').toBeLessThanOrEqual(
    PAGE_OVER_WINDOW_MAX_PX,
  );
  await page.evaluate(() => globalThis.scrollTo(0, 0));
}

/* ---------------------------------------------------------------------------
 * The window shot, and the file read back
 * ------------------------------------------------------------------------ */

/** A shot's file against the window the page says it has. */
export interface WindowShot {
  /** The width and height the PNG file itself says it has, read back from disk. */
  width: number;
  height: number;
  /** `window.innerWidth`, `window.innerHeight` and `devicePixelRatio`, as the page reports them. */
  windowWidth: number;
  windowHeight: number;
  devicePixelRatio: number;
}

/** The width and height a PNG file says it has (its IHDR chunk). */
function pngSize(path: string): { width: number; height: number } {
  const header = readFileSync(path).subarray(0, 24);
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

/**
 * Runs the shot's assertions, then shoots the window as it is: not the page, and nothing resized.
 * A failed assertion saves the window as `<name>-FAIL.png` and rethrows. The file is then read
 * back from disk, and the window is read from the page, for the caller to compare.
 */
export async function shootWindowAfter(page: Page, name: string, assertions: () => Promise<void>): Promise<WindowShot> {
  try {
    await assertions();
  } catch (error) {
    await page.screenshot({ path: walkFailShot(name) });
    throw error;
  }
  const path = walkShot(name);
  await page.screenshot({ path });
  const reported = await page.evaluate(() => ({
    windowWidth: globalThis.innerWidth,
    windowHeight: globalThis.innerHeight,
    devicePixelRatio: globalThis.devicePixelRatio,
  }));
  return { ...pngSize(path), ...reported };
}

/**
 * Runs the shot's assertions, then shoots the window: 1440 by 900, not the page. A failed
 * assertion saves the window as `<name>-FAIL.png` and rethrows. The file is then read back:
 * a shot that is not the window's size fails the test.
 */
export async function assertThenShootWindow(page: Page, name: string, assertions: () => Promise<void>): Promise<void> {
  const shot = await shootWindowAfter(page, name, async () => {
    expect(page.viewportSize(), "the window is the config's 1440 by 900").toEqual(VIEWPORT);
    await assertions();
  });
  console.log(`[walk21] ${name} shot at ${utcNow()}, ${shot.width} by ${shot.height}`);
  expect({ width: shot.width, height: shot.height }, 'the shot is the window, not the page').toEqual(VIEWPORT);
}

/* ---------------------------------------------------------------------------
 * W-2: what stands at the column's end
 * ------------------------------------------------------------------------ */

/** What stands at the column's end, and whether a reader who stayed there sees it. Never the answer. */
export interface EndReading {
  /** The "Used:" line of the last turn; null when the turn has none. */
  used: InColumn | null;
  /** The line under the last turn (stopped, a limit); null when the turn has none. */
  line: InColumn | null;
  turnHeight: number | null;
  layout: Layout;
  readAt: string;
}

export async function endReading(page: Page, label: string): Promise<EndReading> {
  const turn = lastTurn(page);
  const used = turn.locator('[data-used]');
  const line = turn.locator('[data-turn-line]');
  const box = await turn.boundingBox();
  const reading: EndReading = {
    used: (await used.count()) === 0 ? null : await inColumnBox(used),
    line: (await line.count()) === 0 ? null : await inColumnBox(line),
    turnHeight: box === null ? null : Math.round(box.height),
    layout: await layoutOf(page),
    readAt: utcNow(),
  };
  console.log(`[walk21] ${label}: ${JSON.stringify(reading)}`);
  return reading;
}

/**
 * W-2 shows only where something had to scroll: the column's content is taller than its visible
 * box. In a column that holds the whole answer every line is "inside the box", whatever the page
 * does when the stored row lands, so a short answer proves nothing. It fails the test by name: it
 * is not a pass, and it is not W-2 failing (the third `/code-review`, R3-3).
 */
export function expectTallerThanColumn(reading: EndReading, label: string): void {
  const { columnScrollHeight, columnClientHeight } = reading.layout;
  expect(
    columnScrollHeight,
    `${label}: the answer was too short to show W-2. The column holds ${columnScrollHeight} px of content in a ` +
      `${columnClientHeight} px box (the turn is ${reading.turnHeight} px), so nothing had to scroll. ` +
      'This is not a pass and not a failure of W-2: ask again',
  ).toBeGreaterThan(columnClientHeight);
}

/**
 * The last turn's "Used:" line is wholly inside the column's visible box (W-2).
 *
 * A turn with no "Used:" line is named for what it is before the line is looked for: an answer
 * that used no tool. That is not a failure of W-2; it is a turn with no such line to read W-2 on,
 * and the test fails saying so, not on `undefined` (R3-3).
 */
export function expectUsedLineInside(reading: EndReading, label: string, message: string): void {
  expect(
    reading.used,
    `${label}: the answer used no tool, so the turn has no "Used:" line. ` +
      'This is not a failure of W-2: the turn has no such line to read W-2 on. Ask again',
  ).not.toBeNull();
  expect(reading.used?.inside, message).toBe(true);
}

/* ---------------------------------------------------------------------------
 * The retakes: a standing turn of the first sitting's archived conversation
 * ------------------------------------------------------------------------ */

/** Scrolls the column, and only the column, until the turn's start stands just under the column's upper edge. */
async function scrollColumnToTurnStart(page: Page, turn: Locator): Promise<void> {
  await inColumnBox(turn, { clearPx: TURN_START_CLEAR_PX });
  await page.waitForTimeout(SCROLL_SETTLE_MS);
}

/**
 * Opens an archived conversation the way a reader does: "Show archived" on, then its row.
 * Only the row's link is pressed, never its "Unarchive" button.
 */
export async function openArchivedByRow(page: Page, id: string): Promise<Locator> {
  await openSettled(page, '/workspace');
  await workspaceReady(page);
  const list = conversationList(page);
  await list.getByRole('checkbox', { name: SHOW_ARCHIVED_LABEL }).check();
  const link = list.locator(`a[href$="c=${id}"]`);
  await expect(link, `conversation ${id} is listed under "${SHOW_ARCHIVED_LABEL}"`).toHaveCount(1);
  // `has` is read from inside each row, so the link is named from the page, not from the list.
  const row = list.locator('ul > li').filter({ has: page.locator(`a[href$="c=${id}"]`) });
  await expect(row.getByRole('button', { name: UNARCHIVE_LABEL, exact: true }), 'the row is an archived one').toHaveCount(1);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/workspace\\?c=${id}$`));
  await workspaceReady(page);
  await expect(page.locator('li[data-turn]').first()).toBeAttached();
  await page.waitForTimeout(SETTLE_MS);
  return link;
}

export interface Retake {
  question: string;
  shot: string;
  badge: string;
}

/**
 * Takes an answered turn's shot again without asking anything: the first sitting's archived
 * conversation, opened by its row, the column scrolled to that turn's start, the window as it is.
 *
 * The shot shows what the brief's row 22 (c) names for it: the question and the badge. The
 * "Used:" line of a turn taller than the column is further down than the picture reaches: it is
 * asserted by its text, and where it stands is printed.
 */
export async function retakeAnsweredTurn(page: Page, retake: Retake): Promise<void> {
  const conversation = conversationFrom('WALK21_ARCHIVED_CONVERSATION');
  const link = await openArchivedByRow(page, conversation);
  const turn = page.locator('li[data-turn="done"]').filter({ has: page.getByText(retake.question, { exact: true }) });
  const question = turn.getByText(retake.question, { exact: true });
  const badge = turn.locator('[data-tier]');
  const used = turn.locator('[data-used]');
  await assertThenShootWindow(page, retake.shot, async () => {
    await expect(link).toHaveAttribute('aria-current', 'page');
    await expect(turn, 'one answered turn asks this question').toHaveCount(1);
    await expect(badge).toHaveText(retake.badge);
    await expect(used).toHaveText(/^Used: \S/);
    await expect(turn.locator('[data-answer-text]')).not.toBeEmpty();
    await scrollColumnToTurnStart(page, turn);
    const questionAt = await inColumnBox(question);
    const badgeAt = await inColumnBox(badge);
    const usedAt = await inColumnBox(used);
    const box = await turn.boundingBox();
    const facts = {
      conversation,
      request: await turn.getAttribute('data-request-id'),
      badge: await textOrNull(badge),
      used: await textOrNull(used),
      turnHeight: box === null ? null : Math.round(box.height),
      questionAt,
      badgeAt,
      usedAt,
    };
    console.log(`[walk21] ${retake.shot} (retake, nothing asked): ${JSON.stringify(facts)}`);
    expect(questionAt.inside, "the question is wholly inside the column's visible box").toBe(true);
    expect(badgeAt.inside, "the badge is wholly inside the column's visible box").toBe(true);
    await expectUncovered(question);
    await expectUncovered(badge);
    const layout = await expectDocumentFitsWindow(page, retake.shot);
    expect(layout.windowScrollY, 'the window itself is not scrolled').toBe(0);
  });
}
