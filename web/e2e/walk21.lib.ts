/**
 * What every file of Phase 21's walk shares (brief 102, task 22). The walk
 * itself, its tests and how to run them, is described at the top of
 * `walk21.spec.ts`. How each sitting shoots is beside this file: the first
 * sitting's way in `walk21.first.ts`, the retake sitting's in
 * `walk21.window.ts`.
 *
 * Here, in this order: the walk's switch and the one way a path into the walk
 * folder is made; the walk's numbers and the page's strings; the hooks every
 * walk file registers; the page's vocabulary (open, ask, read a turn); the one
 * helper for the message column.
 *
 * Not a spec: the config's `testMatch` takes `*.spec.ts` only. Like the specs,
 * it drives the built app from the outside and imports nothing from `src/`.
 */

import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  assertNoWrites,
  coldCache,
  collectConsole,
  dismissNativeDialogs,
  guardWrites,
  openSignedIn,
} from './walk';

/** `__dirname`: this package is CommonJS (see playwright.config.ts). */
export const CHECKOUT_ROOT = join(__dirname, '..', '..');
const SHOT_DIR = join(CHECKOUT_ROOT, 'docs', 'planning', 'sprint-2', 'walks', 'walk-21');

/* ---------------------------------------------------------------------------
 * The switch: the walk runs only when it is asked for
 * ------------------------------------------------------------------------ */

/** The walk's one switch: `WALK21=1`. */
const WALK_SWITCH = 'WALK21';
const ASKED_FOR = process.env[WALK_SWITCH] === '1';
const LIVE = process.env['WALK21_LIVE'] === '1';
/** The one test this run may execute when it is set: its exact name. */
const ONLY = process.env['WALK21_ONLY'] ?? '';

/**
 * Called once at the top of each walk21 spec file, before anything else in it.
 *
 * Without `WALK21=1` every test of the file is skipped where it is declared: no hook runs, no page
 * is opened, nothing is read and nothing is written. A plain `npx playwright test` or
 * `npm run walk` therefore lists the walk as skipped. The walk reads Stack's own conversation list
 * on prod and writes its shots into a tracked folder of dated evidence, and `02 empty` holds only
 * while that list is what it was on the day of the walk: none of that belongs in a run nobody
 * asked for (the third `/code-review`, R3-7).
 */
export function walkOnlyWhenAsked(): void {
  test.skip(!ASKED_FOR, `Phase 21's walk runs only when it is asked for: set ${WALK_SWITCH}=1`);
}

/**
 * For a test that spends nothing, and so needs no `WALK21_LIVE`, but shoots: when `WALK21_ONLY`
 * names another test it stays out of the run, and its dated shot is left as it is. Called once at
 * the top of its group.
 */
export function notWhenAnotherIsNamed(title: string): void {
  test.skip(ONLY !== '' && ONLY !== title, `WALK21_ONLY names another test ("${ONLY}")`);
}

/**
 * A live test runs only when it is asked for twice more: `WALK21_LIVE=1`, and `WALK21_ONLY` set to
 * its exact name. `-g` alone is not enough: it matches a group's name too, and on 2026-10-07 one
 * pattern started five live tests (102a, "The walk's own mistake"). This rule was added after
 * that walk. Called once at the top of each live group.
 */
export function liveOnlyByName(what: string): void {
  test.skip(!LIVE, `${what}: set WALK21_LIVE=1 and WALK21_ONLY to the test's exact name`);
  test.beforeEach(() => {
    test.skip(test.info().title !== ONLY, `not the test WALK21_ONLY names ("${ONLY}")`);
  });
}

/** A shot's name: a bare `.png` file name, so the path made from it stays in the walk folder. */
const SHOT_NAME = /^[0-9a-z][0-9a-z-]*\.png$/i;

/**
 * Where a shot goes: `docs/planning/sprint-2/walks/walk-21/`, by explicit path (the config's
 * `shotDir` stays Phase 17's). The one place a path into that folder is made, and it refuses
 * unless the walk was asked for: no file is written there by a run without the switch.
 */
export function walkShot(name: string): string {
  if (!ASKED_FOR) throw new Error(`no file is written into walk-21/ unless ${WALK_SWITCH}=1`);
  if (!SHOT_NAME.test(name)) throw new Error(`a shot's name is a bare .png file name, not "${name}"`);
  return join(SHOT_DIR, name);
}

/** Where the screen is saved when a shot's assertion fails: `<name>-FAIL.png`, beside the shot. */
export function walkFailShot(name: string): string {
  return walkShot(name.replace(/\.png$/, '-FAIL.png'));
}

/* ---------------------------------------------------------------------------
 * The walk's numbers and the page's strings
 * ------------------------------------------------------------------------ */

/** The app polls, so 'networkidle' never fires; this lets the cold reads land. */
export const SETTLE_MS = 2000;
/** One messages poll (5 s) and a margin: the stored row has replaced the live text. */
export const STORED_SETTLE_MS = 7000;

export const MINUTE_MS = 60_000;
/** The runner ends a turn at 8 minutes; a test waits a little longer than that. */
export const TURN_TIMEOUT_MS = 9 * MINUTE_MS;
export const LIVE_TEST_TIMEOUT_MS = 11 * MINUTE_MS;
/** The offline line shows 120 s after the last heartbeat, at the next 30 s tick. */
export const OFFLINE_WAIT_MS = 175_000;
/** How much answer text must be on the page before Stop is pressed "while text is streaming". */
export const STREAMING_TEXT_MIN_CHARS = 40;

/** The config's window (`playwright.config.ts`). */
export const VIEWPORT = { width: 1440, height: 900 } as const;
/** Sub-pixel layout: an edge may sit this far past the box it is inside. */
const EDGE_SLACK_PX = 0.5;

/** The acceptance script's questions (brief 102, steps 3 to 7), word for word. */
export const QUESTION_LOOKUP = 'What does the IST.323 syllabus say about late work?';
export const QUESTION_DECISION = 'What did I decide about ECN.304 Quiz 2?';
export const QUESTION_DOCUMENT = 'Open the IST.323 syllabus and list its section headings';
export const QUESTION_STANDARD =
  "Explain how a systems analyst's role differs from a project manager's, using the IST.352 slides";
export const QUESTION_DEEP = 'Draft a two-week study plan for ECN.304 from the lecture slides';
/** The retake sitting's one long request (task 21 (d), repeated once): written to take long, and it routes to deep work. */
export const QUESTION_LONG =
  'Draft a detailed four-week study plan for ECN.304 from the lecture slides, deck by deck and slide by slide, with a short self-quiz for each week.';

/** The page's own strings (`src/lib/workspace-labels.ts`). Copied, not imported. */
export const BADGE_LOW = 'Haiku · lookup';
export const BADGE_MID = 'Sonnet · standard';
export const BADGE_HIGH = 'Opus · deep work';
export const COLUMN_START_LINE = 'Ask a question to start a conversation.';
export const QUEUED_LINE = 'Waiting for the Workspace service';
export const OFFLINE_LINE = 'The Workspace service is offline.';
export const STOPPED_SENTENCE = 'You stopped this answer.';
export const BUDGET_SENTENCE = 'Stopped at the per-answer cost limit.';
export const SHOW_ARCHIVED_LABEL = 'Show archived';
export const UNARCHIVE_LABEL = 'Unarchive';

/** Task 5's conversation, which stays in the list until acceptance step 15. */
export const SPIKE_TITLE = 'spike';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONVERSATION_URL = /\/workspace\?c=([0-9a-f-]{36})$/;
/** A file named in an answer: a reading for the PM, not an assertion. */
const FILE_NAME = /\.(pdf|docx?|pptx?|xlsx?)\b/i;

/* ---------------------------------------------------------------------------
 * The hooks every walk file registers
 * ------------------------------------------------------------------------ */

/** The first HTTP status that is a refusal or a failure. */
const HTTP_REFUSED_FROM = 400;

/** Responses the page was refused: status, method, host and path. Never a query string or a body. */
function collectRefusedResponses(page: Page): string[] {
  const refused: string[] = [];
  page.on('response', (response) => {
    if (response.status() < HTTP_REFUSED_FROM) return;
    const url = new URL(response.url());
    refused.push(`${response.status()} ${response.request().method()} ${url.host}${url.pathname}`);
  });
  return refused;
}

/**
 * Called once at the top of each walk21 spec file. Before each test: the write guard, a cold
 * cache, and what the console and the network refuse. After it: both are printed, and a table
 * write the guard aborted fails the test.
 */
export function registerWalkHooks(): void {
  let writes: string[] = [];
  let consoleMessages: string[] = [];
  let refusedResponses: string[] = [];

  test.beforeEach(async ({ page, context }) => {
    writes = await guardWrites(context);
    await coldCache(context);
    consoleMessages = collectConsole(page);
    refusedResponses = collectRefusedResponses(page);
    dismissNativeDialogs(page);
  });

  test.afterEach(() => {
    const testInfo = test.info();
    const report = consoleMessages.length === 0 ? 'none' : consoleMessages.join('\n  ');
    const refused = refusedResponses.length === 0 ? 'none' : refusedResponses.join('\n  ');
    console.log(`[${testInfo.title}] console errors/warnings: ${report}`);
    console.log(`[${testInfo.title}] refused responses: ${refused}`);
    testInfo.annotations.push({ type: 'console', description: report });
    testInfo.annotations.push({ type: 'refused', description: refused });
    assertNoWrites(writes);
  });
}

/* ---------------------------------------------------------------------------
 * The page's vocabulary: open, ask, read a turn
 * ------------------------------------------------------------------------ */

/** A conversation id handed in through the environment; fails clearly when it is missing. */
export function conversationFrom(variable: string): string {
  const id = process.env[variable] ?? '';
  if (!UUID.test(id)) throw new Error(`set ${variable} to the conversation's uuid`);
  return id;
}

export function utcNow(): string {
  return new Date().toISOString();
}

export async function openSettled(page: Page, path: string): Promise<void> {
  await openSignedIn(page, path);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
}

export function conversationPath(id: string | null): string {
  return id === null ? '/workspace' : `/workspace?c=${id}`;
}

export function conversationList(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Conversations' });
}

/** The titles of the listed conversations, in the list's order. */
export async function listedTitles(page: Page): Promise<string[]> {
  const titles = await conversationList(page).locator('ul > li a > span:first-child').allTextContents();
  return titles.map((title) => title.trim());
}

function streamArea(page: Page): Locator {
  return page.locator('[data-workspace-stream]');
}

export function lastTurn(page: Page): Locator {
  return page.locator('li[data-turn]').last();
}

/** The Workspace screen is up and its Realtime channel is joined, so a stream is read from its first delta. */
export async function workspaceReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Workspace', level: 1 })).toBeVisible();
  await expect(streamArea(page)).toHaveAttribute('data-channel', 'joined');
  // A conversation's rows have been read: its turns are counted before a question is asked.
  await expect(page.locator('[data-column-empty="loading"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
}

/** Types the question and presses Ask, as the owner does. Returns when the turn is on the page. */
export async function ask(page: Page, question: string): Promise<string> {
  const turnsBefore = await page.locator('li[data-turn]').count();
  await page.getByRole('textbox', { name: 'Question' }).fill(question);
  const askedAt = utcNow();
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page).toHaveURL(CONVERSATION_URL);
  await expect(page.locator('li[data-turn]')).toHaveCount(turnsBefore + 1);
  await expect(lastTurn(page).getByText(question, { exact: true })).toBeVisible();
  return askedAt;
}

/** The conversation the page is on, from `?c=`. */
export function conversationOf(page: Page): string {
  const match = CONVERSATION_URL.exec(page.url());
  if (match === null || match[1] === undefined) throw new Error(`not on a conversation: ${page.url()}`);
  return match[1];
}

/** Waits until the last turn is closed (done, failed or stopped), whatever way it ended. */
export async function turnClosed(page: Page): Promise<void> {
  await expect(lastTurn(page)).toHaveAttribute('data-turn', /^(done|failed|stopped)$/, { timeout: TURN_TIMEOUT_MS });
  await page.waitForTimeout(STORED_SETTLE_MS);
}

export async function textOrNull(locator: Locator): Promise<string | null> {
  return (await locator.count()) === 0 ? null : ((await locator.first().textContent()) ?? '').trim();
}

/** One line about the last turn: ids, state, badge, "Used:" and the line under it. Never the answer. */
export async function reportTurn(page: Page, label: string, askedAt: string): Promise<void> {
  const turn = lastTurn(page);
  const answer = (await textOrNull(turn.locator('[data-answer-text]'))) ?? '';
  const facts = {
    conversation: conversationOf(page),
    request: await turn.getAttribute('data-request-id'),
    state: await turn.getAttribute('data-turn'),
    badge: await textOrNull(turn.locator('[data-tier]')),
    used: await textOrNull(turn.locator('[data-used]')),
    line: await textOrNull(turn.locator('[data-turn-line]')),
    answerChars: Array.from(answer).length,
    answerNamesAFile: FILE_NAME.test(answer),
    askedAt,
    readAt: utcNow(),
  };
  console.log(`[walk21] ${label}: ${JSON.stringify(facts)}`);
}

/**
 * The element is in the shot: inside the window whole, not cut by the column's
 * edge, and with nothing lying over its middle (the top bar stays in place over
 * a scrolled page, and an intersection ratio does not see that).
 */
export async function expectShown(locator: Locator): Promise<void> {
  await expect(locator).toBeInViewport({ ratio: 1 });
  await expectUncovered(locator);
}

/** Nothing lies over the element's middle: it is what a reader sees at that point of the window. */
export async function expectUncovered(locator: Locator): Promise<void> {
  const uncovered = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top !== null && (top === element || element.contains(top));
  });
  expect(uncovered, 'nothing lies over the element').toBe(true);
}

/* ---------------------------------------------------------------------------
 * The message column: one locator, one helper
 * ------------------------------------------------------------------------ */

/** The message column: the one box of the screen that scrolls (`MessageList.module.css`, `.column`). */
export function messageColumn(page: Page): Locator {
  return page.locator('[data-workspace-stream] > div');
}

/** Where an element stands in the column that scrolls it. */
export interface InColumn {
  /** Wholly inside the column's visible box, and inside the window. */
  inside: boolean;
  /** The element's edges, in pixels from the top of the column's visible box. */
  top: number;
  bottom: number;
  /** The height of the column's visible box. */
  boxHeight: number;
}

/**
 * Where an element stands in the message column. THE ONE PLACE the walk pairs an element with the
 * box that scrolls it: that box is `messageColumn(page)`, which must scroll and must hold the
 * element (the third `/code-review`, R3-10 and R3-11: this was a walk up the element's ancestors,
 * written three times).
 *
 * With `bringToTop` the column, and only the column, is scrolled first, until the element's top
 * stands `clearPx` under the column's upper edge. The window is never moved: `scrollIntoView`
 * would move it too, and the top bar, which stays in place, would then lie over the element. The
 * scroll and the reading are one step in the page, so nothing the page does comes between them.
 *
 * The edge is the column's padding edge (`clientTop` under its border edge). `.column` has no
 * border, so the two are the same line.
 */
export async function inColumnBox(element: Locator, bringToTop?: { clearPx: number }): Promise<InColumn> {
  const column = await messageColumn(element.page()).elementHandle();
  if (column === null) throw new Error('the page has no message column');
  try {
    return await element.first().evaluate(
      (node, { box, slack, clearPx }) => {
        if (!/(auto|scroll)/.test(getComputedStyle(box).overflowY)) throw new Error('the message column does not scroll');
        if (!box.contains(node)) throw new Error('the element is not in the message column');
        const edge = () => box.getBoundingClientRect().top + box.clientTop;
        if (clearPx !== null) box.scrollTop += node.getBoundingClientRect().top - edge() - clearPx;
        const own = node.getBoundingClientRect();
        const boxTop = edge();
        const visibleTop = Math.max(boxTop, 0);
        const visibleBottom = Math.min(boxTop + box.clientHeight, globalThis.innerHeight);
        return {
          inside: own.height > 0 && own.top >= visibleTop - slack && own.bottom <= visibleBottom + slack,
          top: Math.round(own.top - boxTop),
          bottom: Math.round(own.bottom - boxTop),
          boxHeight: box.clientHeight,
        };
      },
      { box: column, slack: EDGE_SLACK_PX, clearPx: bringToTop?.clearPx ?? null },
    );
  } finally {
    await column.dispose();
  }
}
