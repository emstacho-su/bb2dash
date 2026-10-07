/**
 * Phase 21's walk screenshots (brief 102, task 22): `walk-21/02` … `08`, `10`
 * and `11`, with the live turns of tasks 19 and 21 inside the same walk.
 *
 * Run from `web/` against the branch preview, after `e2e/login.mjs` has saved
 * a session for that host, with `WALK_BASE_URL` (and `WALK_VERCEL_SHARE` for
 * `login.mjs`) set:
 *
 *   npx playwright test -c e2e/playwright.config.ts walk21
 *
 * * `02 empty` reads standing data and runs by default. It is taken first in
 *   the walk, before any live turn, while the list holds only task 5's 'spike'.
 * * Every other test needs live state (the test container answering, stopped,
 *   or under the 0.01 cap) and most spend a turn of Stack's Claude plan, so
 *   each is skipped unless `WALK21_LIVE=1` and `WALK21_ONLY` is its exact name:
 *
 *     WALK21_LIVE=1 WALK21_ONLY="03 lookup haiku" npx playwright test -c e2e/playwright.config.ts walk21 -g "03 lookup haiku"
 *
 *   Run them one at a time, while each one's state holds, in the order they
 *   stand here. The PM reads the brief's selects between them. `-g` matches a
 *   group's name as well as a test's, so no group here is named after a test,
 *   and `WALK21_ONLY` holds even when a pattern selects more than it should.
 * * `03 lookup haiku` starts the walk's conversation and prints its id. The
 *   tests after it ask into that conversation: pass the id back as
 *   `WALK21_CONVERSATION`. The cap turn starts a conversation of its own and
 *   its follow-up takes that id as `WALK21_CAP_CONVERSATION`.
 * * Each test asserts what its shot must show before it shoots. When an
 *   assertion fails, the screen is saved as `<name>-FAIL.png` and the test
 *   fails: the assertion is never relaxed to fit the screen.
 * * The message column scrolls inside itself, so a long answer's badge and its
 *   "Used:" line are not on screen together at 1440 by 900. A turn's shot is
 *   taken in a window made tall enough to hold the whole turn (`fitTurnInShot`),
 *   and what the page showed at 1440 by 900 is printed first.
 * * `WALK21_RESHOOT=1` takes a question's shot again without asking: the
 *   conversation's last turn must still be that question's.
 * * The page writes only as the signed-in owner does: `workspace_ask` and
 *   `workspace_cancel` are RPC calls and pass `guardWrites`. The one table
 *   write is the list's own "Archive" button, in `archive the walk
 *   conversations` only, on the conversations named in `WALK21_ARCHIVE`;
 *   anything else is aborted and fails the test. `stop a waiting question`
 *   presses Stop on a question no runner has claimed (`WALK21_STOP_CONVERSATION`).
 * * A line is printed per turn with its ids, state, badge and "Used:" line.
 *   An answer's text is never printed: it can hold course material.
 * * Shots go to `docs/planning/sprint-2/walks/walk-21/` by explicit path; the
 *   config's `shotDir` stays Phase 17's.
 * * `08 desktop` is the same conversation inside a second desktop shell
 *   instance: the worktree's `desktop/` build under its own `--user-data-dir`,
 *   pointed at a local `next start` of the branch (`WALK21_DESKTOP_APP_URL`).
 *   It never touches the running app or `%APPDATA%\bb2dash\config.json`.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  assertNoWrites,
  coldCache,
  collectConsole,
  dismissNativeDialogs,
  guardWrites,
  openSignedIn,
} from './walk';

/** `__dirname`: this package is CommonJS (see playwright.config.ts). */
const CHECKOUT_ROOT = join(__dirname, '..', '..');
const SHOT_DIR = join(CHECKOUT_ROOT, 'docs', 'planning', 'sprint-2', 'walks', 'walk-21');

/** The app polls, so 'networkidle' never fires; this lets the cold reads land. */
const SETTLE_MS = 2000;
/** One messages poll (5 s) and a margin: the stored row has replaced the live text. */
const STORED_SETTLE_MS = 7000;

const MINUTE_MS = 60_000;
/** The runner ends a turn at 8 minutes; a test waits a little longer than that. */
const TURN_TIMEOUT_MS = 9 * MINUTE_MS;
const LIVE_TEST_TIMEOUT_MS = 11 * MINUTE_MS;
/** The offline line shows 120 s after the last heartbeat, at the next 30 s tick. */
const OFFLINE_WAIT_MS = 175_000;
/** How much answer text must be on the page before Stop is pressed "while text is streaming". */
const STREAMING_TEXT_MIN_CHARS = 40;

/** The config's window (`playwright.config.ts`). */
const VIEWPORT = { width: 1440, height: 900 } as const;
/** The message column's share of the window's height (`MessageList.module.css`: `max-height: 62dvh`). */
const COLUMN_HEIGHT_SHARE = 0.62;
/** The column's own padding, and room to spare, in pixels. */
const COLUMN_CHROME_PX = 96;
/** No shot is taller than this; a turn that needs more fails its on-screen assertion. */
const SHOT_MAX_HEIGHT_PX = 9000;

/** The acceptance script's questions (brief 102, steps 3 to 7), word for word. */
const QUESTION_LOOKUP = 'What does the IST.323 syllabus say about late work?';
const QUESTION_DECISION = 'What did I decide about ECN.304 Quiz 2?';
const QUESTION_DOCUMENT = 'Open the IST.323 syllabus and list its section headings';
const QUESTION_STANDARD =
  "Explain how a systems analyst's role differs from a project manager's, using the IST.352 slides";
const QUESTION_DEEP = 'Draft a two-week study plan for ECN.304 from the lecture slides';

/** The page's own strings (`src/lib/workspace-labels.ts`). Copied, not imported. */
const BADGE_LOW = 'Haiku · lookup';
const BADGE_MID = 'Sonnet · standard';
const BADGE_HIGH = 'Opus · deep work';
const COLUMN_START_LINE = 'Ask a question to start a conversation.';
const QUEUED_LINE = 'Waiting for the Workspace service';
const OFFLINE_LINE = 'The Workspace service is offline.';
const STOPPED_SENTENCE = 'You stopped this answer.';
const BUDGET_SENTENCE = 'Stopped at the per-answer cost limit.';

/** Task 5's conversation, which stays in the list until acceptance step 15. */
const SPIKE_TITLE = 'spike';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONVERSATION_URL = /\/workspace\?c=([0-9a-f-]{36})$/;
/** A file named in an answer: a reading for the PM, not an assertion. */
const FILE_NAME = /\.(pdf|docx?|pptx?|xlsx?)\b/i;

const LIVE = process.env['WALK21_LIVE'] === '1';
/** The one live test this run may execute: its exact name. */
const ONLY = process.env['WALK21_ONLY'] ?? '';
/** Take a question's shot again from the page as it stands, asking nothing (see `askAndShoot`). */
const RESHOOT = process.env['WALK21_RESHOOT'] === '1';

/**
 * A live test runs only when it is asked for twice: `WALK21_LIVE=1`, and `WALK21_ONLY` set to
 * its exact name. `-g` alone is not enough: it matches a group's name too, and on 2026-10-07 one
 * pattern started five live tests (102a, "The walk's own mistake"). This rule was added after
 * that walk. Called once at the top of each live group.
 */
function liveOnlyByName(what: string): void {
  test.skip(!LIVE, `${what}: set WALK21_LIVE=1 and WALK21_ONLY to the test's exact name`);
  test.beforeEach(() => {
    test.skip(test.info().title !== ONLY, `not the test WALK21_ONLY names ("${ONLY}")`);
  });
}

/** The first HTTP status that is a refusal or a failure. */
const HTTP_REFUSED_FROM = 400;

let writes: string[] = [];
let consoleMessages: string[] = [];
let refusedResponses: string[] = [];

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

/** A conversation id handed in through the environment; fails clearly when it is missing. */
function conversationFrom(variable: string): string {
  const id = process.env[variable] ?? '';
  if (!UUID.test(id)) throw new Error(`set ${variable} to the conversation's uuid`);
  return id;
}

function utcNow(): string {
  return new Date().toISOString();
}

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
  console.log(`[walk21] ${name} shot at ${utcNow()}`);
}

async function openSettled(page: Page, path: string): Promise<void> {
  await openSignedIn(page, path);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
}

function conversationPath(id: string | null): string {
  return id === null ? '/workspace' : `/workspace?c=${id}`;
}

function conversationList(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Conversations' });
}

/** The titles of the listed conversations, in the list's order. */
async function listedTitles(page: Page): Promise<string[]> {
  const titles = await conversationList(page).locator('ul > li a > span:first-child').allTextContents();
  return titles.map((title) => title.trim());
}

function streamArea(page: Page): Locator {
  return page.locator('[data-workspace-stream]');
}

function lastTurn(page: Page): Locator {
  return page.locator('li[data-turn]').last();
}

/** The Workspace screen is up and its Realtime channel is joined, so a stream is read from its first delta. */
async function workspaceReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Workspace', level: 1 })).toBeVisible();
  await expect(streamArea(page)).toHaveAttribute('data-channel', 'joined');
  // A conversation's rows have been read: its turns are counted before a question is asked.
  await expect(page.locator('[data-column-empty="loading"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
}

/** Types the question and presses Ask, as the owner does. Returns when the turn is on the page. */
async function ask(page: Page, question: string): Promise<string> {
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
function conversationOf(page: Page): string {
  const match = CONVERSATION_URL.exec(page.url());
  if (match === null || match[1] === undefined) throw new Error(`not on a conversation: ${page.url()}`);
  return match[1];
}

/** Waits until the last turn is closed (done, failed or stopped), whatever way it ended. */
async function turnClosed(page: Page): Promise<void> {
  await expect(lastTurn(page)).toHaveAttribute('data-turn', /^(done|failed|stopped)$/, { timeout: TURN_TIMEOUT_MS });
  await page.waitForTimeout(STORED_SETTLE_MS);
}

async function textOrNull(locator: Locator): Promise<string | null> {
  return (await locator.count()) === 0 ? null : ((await locator.first().textContent()) ?? '').trim();
}

/** One line about the last turn: ids, state, badge, "Used:" and the line under it. Never the answer. */
async function reportTurn(page: Page, label: string, askedAt: string): Promise<void> {
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
 * The element is in the shot: inside the window whole, not cut by the column's
 * edge, and with nothing lying over its middle (the top bar stays in place over
 * a scrolled page, and an intersection ratio does not see that).
 */
async function expectShown(locator: Locator): Promise<void> {
  await expect(locator).toBeInViewport({ ratio: 1 });
  const uncovered = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top !== null && (top === element || element.contains(top));
  });
  expect(uncovered, 'nothing lies over the element').toBe(true);
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
  // Only the column is scrolled. `scrollIntoView` would move the window too, and the
  // top bar, which stays in place, would then lie over the top of the turn.
  await turn.evaluate((element) => {
    let column = element.parentElement;
    while (column !== null && !/(auto|scroll)/.test(getComputedStyle(column).overflowY)) {
      column = column.parentElement;
    }
    if (column === null) throw new Error('the turn is in no scrolling column');
    column.scrollTop += element.getBoundingClientRect().top - column.getBoundingClientRect().top;
    window.scrollTo(0, 0);
  });
  console.log(
    `[walk21] ${label}: at ${VIEWPORT.width}x${VIEWPORT.height} the page showed ${JSON.stringify(before)}; ` +
      `the turn is ${Math.round(box.height)} px tall, shot at ${VIEWPORT.width}x${height}`,
  );
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

interface LiveQuestion {
  /** The conversation to ask into; null starts one. */
  conversation: string | null;
  question: string;
  shot: string;
  badge: string;
  usedTools: readonly string[];
}

/**
 * Asks one question, waits for its stored answer, asserts the shot and takes it.
 *
 * With `WALK21_RESHOOT=1` nothing is asked: the shot is taken again of the
 * conversation's last turn as it stands, which must be this question's. It
 * spends no turn, and it works only until the next question is asked.
 */
async function askAndShoot(page: Page, live: LiveQuestion): Promise<void> {
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

test.describe('standing data (before any live turn)', () => {
  test('02 empty', async ({ page }) => {
    await openSettled(page, '/workspace');
    await assertThenShoot(page, '02-empty.png', async () => {
      await workspaceReady(page);
      // The Workspace link is the active one in the top bar.
      await expect(
        page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Workspace', exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      // The list holds task 5's 'spike' conversation and nothing else.
      await expect(conversationList(page).locator('ul > li')).toHaveCount(1);
      expect(await listedTitles(page), "the list holds only task 5's conversation").toEqual([SPIKE_TITLE]);
      // An empty message column: no turn, and the line that says how to start one.
      await expect(page.locator('li[data-turn]')).toHaveCount(0);
      await expect(page.locator('[data-column-empty="start"]')).toHaveText(COLUMN_START_LINE);
      await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
    });
  });
});

test.describe('the five questions (acceptance steps 3 to 7; WALK21_LIVE=1)', () => {
  liveOnlyByName('spends a live turn on the test container');
  test.setTimeout(LIVE_TEST_TIMEOUT_MS);

  test('03 lookup haiku', async ({ page }) => {
    await askAndShoot(page, {
      conversation: null,
      question: QUESTION_LOOKUP,
      shot: '03-lookup-haiku.png',
      badge: BADGE_LOW,
      usedTools: ['search_materials'],
    });
  });

  test('04 decision haiku', async ({ page }) => {
    await askAndShoot(page, {
      conversation: conversationFrom('WALK21_CONVERSATION'),
      question: QUESTION_DECISION,
      shot: '04-decision-haiku.png',
      badge: BADGE_LOW,
      usedTools: ['search_context · bb2dash-inbox-decisions'],
    });
  });

  test('10 document haiku', async ({ page }) => {
    await askAndShoot(page, {
      conversation: conversationFrom('WALK21_CONVERSATION'),
      question: QUESTION_DOCUMENT,
      shot: '10-document-haiku.png',
      badge: BADGE_LOW,
      usedTools: ['get_material_text'],
    });
  });

  test('11 standard sonnet', async ({ page }) => {
    await askAndShoot(page, {
      conversation: conversationFrom('WALK21_CONVERSATION'),
      question: QUESTION_STANDARD,
      shot: '11-standard-sonnet.png',
      badge: BADGE_MID,
      usedTools: [],
    });
  });

  test('05 deep opus', async ({ page }) => {
    await askAndShoot(page, {
      conversation: conversationFrom('WALK21_CONVERSATION'),
      question: QUESTION_DEEP,
      shot: '05-deep-opus.png',
      badge: BADGE_HIGH,
      usedTools: [],
    });
  });
});

// The name of a group must hold no test's name: `-g` matches the group's name too, and a
// group named after its tests runs all of them (it did once, on 2026-10-07; see 102a).
test.describe('task 21 live states (WALK21_LIVE=1)', () => {
  liveOnlyByName('needs the test container in a named state');
  test.setTimeout(LIVE_TEST_TIMEOUT_MS);

  // Run while the container holds WORKSPACE_TURN_BUDGET_USD=0.01. No shot: the nine are named.
  test('cap turn', async ({ page }) => {
    await openSettled(page, '/workspace');
    await workspaceReady(page);
    const askedAt = await ask(page, QUESTION_DEEP);
    await turnClosed(page);
    await reportTurn(page, 'cap turn', askedAt);
    const turn = lastTurn(page);
    await expect(turn).toHaveAttribute('data-turn', 'failed');
    await expect(turn.locator('[data-turn-line]')).toHaveText(BUDGET_SENTENCE);
  });

  // A reading, not a verdict: what a budget-stopped session does when it is asked again.
  test('cap follow-up', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_CAP_CONVERSATION')));
    await workspaceReady(page);
    const askedAt = await ask(page, QUESTION_LOOKUP);
    await turnClosed(page);
    await reportTurn(page, 'cap follow-up', askedAt);
  });

  test('06 stopped', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_CONVERSATION')));
    await workspaceReady(page);
    const askedAt = await ask(page, QUESTION_DEEP);
    const turn = lastTurn(page);
    const text = turn.locator('[data-answer-text]');
    // Text is streaming: the request is claimed and the answer is being written on the page.
    await expect(async () => {
      expect(await turn.getAttribute('data-turn')).toBe('streaming');
      expect(Array.from((await textOrNull(text)) ?? '').length).toBeGreaterThanOrEqual(STREAMING_TEXT_MIN_CHARS);
    }).toPass({ timeout: TURN_TIMEOUT_MS, intervals: [250] });
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    console.log(`[walk21] 06-stopped.png: Stop pressed at ${utcNow()} on request ${await turn.getAttribute('data-request-id')}`);
    await assertThenShoot(page, '06-stopped.png', async () => {
      await expect(turn).toHaveAttribute('data-turn', 'stopped');
      await expect(text).not.toBeEmpty();
      await expect(turn.locator('[data-turn-line]')).toHaveText(STOPPED_SENTENCE);
      await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
      await fitTurnInShot(page, '06-stopped.png');
      // The sentence stands under the partial answer, and both are on screen.
      const answerBox = await text.boundingBox();
      const lineBox = await turn.locator('[data-turn-line]').boundingBox();
      expect(answerBox !== null && lineBox !== null && lineBox.y >= answerBox.y + answerBox.height - 1).toBe(true);
      await expectShown(turn.locator('[data-turn-line]'));
      await expectShown(turn.locator('[data-tier]'));
      await expect(text).toBeInViewport();
    });
    await reportTurn(page, '06-stopped.png', askedAt);
  });

  // Run within three minutes of `docker compose -p bb2dash-wt21 --profile workspace stop workspace`.
  test('07 offline', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_CONVERSATION')));
    await assertThenShoot(page, '07-offline.png', async () => {
      const offline = page.locator('[data-workspace-offline]');
      await expect(offline).toBeVisible({ timeout: OFFLINE_WAIT_MS });
      await expect(offline).toHaveText(OFFLINE_LINE);
    });
  });

  // Run while the container is still stopped: the question waits, and does not expire.
  test('queued question', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_CONVERSATION')));
    await workspaceReady(page);
    const askedAt = await ask(page, QUESTION_LOOKUP);
    const turn = lastTurn(page);
    await expect(turn).toHaveAttribute('data-turn', 'queued');
    await expect(turn.locator('[data-turn-line]')).toHaveText(QUEUED_LINE);
    await reportTurn(page, 'queued question', askedAt);
  });
});

/** The Supabase REST path of the one table the list's Archive button writes. */
const ARCHIVE_WRITE = '**/rest/v1/workspace_conversations?**';

/**
 * Lets the list's own Archive write through, and nothing else: a PATCH of
 * `workspace_conversations`. Registered after `guardWrites`, so it is asked
 * first; every other write still reaches the guard and fails the test.
 */
async function allowArchive(context: BrowserContext): Promise<string[]> {
  const allowed: string[] = [];
  await context.route(ARCHIVE_WRITE, async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    allowed.push(`${request.method()} ${new URL(request.url()).pathname}`);
    await route.continue();
  });
  return allowed;
}

test.describe('tidying (WALK21_LIVE=1)', () => {
  liveOnlyByName('writes as the owner (Stop, Archive)');
  test.setTimeout(3 * MINUTE_MS);

  // Stop on a question no runner has claimed: it is cancelled where it waits, and spends no turn.
  test('stop a waiting question', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_STOP_CONVERSATION')));
    await expect(page.getByRole('heading', { name: 'Workspace', level: 1 })).toBeVisible();
    const turn = lastTurn(page);
    await expect(turn).toHaveAttribute('data-turn', 'queued');
    await expect(turn.locator('[data-turn-line]')).toHaveText(QUEUED_LINE);
    const request = await turn.getAttribute('data-request-id');
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(turn).toHaveAttribute('data-turn', 'stopped');
    await expect(turn.locator('[data-turn-line]')).toHaveText(STOPPED_SENTENCE);
    await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
    // The row itself, not only the page's mark: the cancel has answered and the rows were re-read.
    await page.waitForTimeout(STORED_SETTLE_MS);
    await expect(turn).toHaveAttribute('data-turn', 'stopped');
    console.log(`[walk21] stopped waiting request ${request} in conversation ${conversationOf(page)} at ${utcNow()}`);
  });

  test('archive the walk conversations', async ({ page, context }) => {
    const ids = (process.env['WALK21_ARCHIVE'] ?? '').split(',').filter((id) => id !== '');
    expect(ids.length, 'WALK21_ARCHIVE names at least one conversation').toBeGreaterThan(0);
    for (const id of ids) expect(id, 'WALK21_ARCHIVE holds uuids').toMatch(UUID);

    const allowed = await allowArchive(context);
    await openSettled(page, '/workspace');
    await workspaceReady(page);
    const list = conversationList(page);
    for (const id of ids) {
      const row = list.locator('ul > li').filter({ has: page.locator(`a[href$="c=${id}"]`) });
      await expect(row, `conversation ${id} is listed`).toHaveCount(1);
      await row.getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(row, `conversation ${id} left the list`).toHaveCount(0);
    }
    expect(allowed.length, 'one Archive write per conversation').toBe(ids.length);
    expect(await listedTitles(page), "the list holds only task 5's conversation again").toEqual([SPIKE_TITLE]);
    console.log(`[walk21] archived ${ids.length} conversation(s); the list reads ${JSON.stringify(await listedTitles(page))}`);
  });
});

/* ---------------------------------------------------------------------------
 * 08: the same conversation inside a second desktop shell instance
 * ------------------------------------------------------------------------ */

const DESKTOP_DIR = join(CHECKOUT_ROOT, 'desktop');
const DESKTOP_MAIN = join(DESKTOP_DIR, 'dist', 'main', 'index.js');
const DESKTOP_ELECTRON = join(DESKTOP_DIR, 'node_modules', 'electron', 'package.json');

/**
 * The binary the worktree's `desktop/` installed: the `electron` package's entry point is that
 * path, as `desktop/test/e2e/launch.ts` reads it. Resolved from `desktop/`, not from `web/`.
 */
function desktopElectronBinary(): string {
  const binary: unknown = createRequire(join(DESKTOP_DIR, 'package.json'))('electron');
  if (typeof binary !== 'string' || !existsSync(binary)) throw new Error('desktop/node_modules holds no electron binary');
  return binary;
}

/** `KEY=value` lines of an env file; `#` comments and blanks skipped. Values are never printed. */
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (match !== null && match[1] !== undefined && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

/** What the second shell instance is started with. No value of it is ever printed. */
interface ShellStart {
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  password: string;
}

/** Reads the shell's start values, and fails by name when one is missing. */
function shellStart(): ShellStart {
  const appUrl = process.env['WALK21_DESKTOP_APP_URL'] ?? '';
  expect(appUrl, 'WALK21_DESKTOP_APP_URL is the local `next start` of the branch').toMatch(
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/,
  );
  expect(existsSync(DESKTOP_MAIN), 'desktop/dist is built (npm run build in desktop/)').toBe(true);
  expect(existsSync(DESKTOP_ELECTRON), 'desktop/node_modules is installed (npm ci in desktop/)').toBe(true);

  // The two public Supabase values and the test login: read here, handed on, never printed.
  const web = readEnvFile(join(CHECKOUT_ROOT, 'web', '.env.local'));
  const login = readEnvFile(join(CHECKOUT_ROOT, '.env.testing'));
  const start: ShellStart = {
    appUrl,
    supabaseUrl: web['NEXT_PUBLIC_SUPABASE_URL'] ?? '',
    supabaseAnonKey: web['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? '',
    email: process.env['TEST_USER_EMAIL'] ?? login['TEST_USER_EMAIL'] ?? '',
    password: process.env['TEST_USER_PW'] ?? login['TEST_USER_PW'] ?? '',
  };
  expect(
    start.supabaseUrl !== '' && start.supabaseAnonKey !== '',
    'web/.env.local holds the two public Supabase values',
  ).toBe(true);
  expect(start.email !== '' && start.password !== '', '.env.testing holds the test login').toBe(true);
  return start;
}

/** Signs in, in the shell's own window, the way `login.mjs` does in a browser. */
async function signInToShell(window: Page, start: ShellStart): Promise<void> {
  await window.waitForLoadState('load');
  // A fresh profile has no session: the app sends the window to /login.
  await expect(window).toHaveURL(/\/login(\?|$)/, { timeout: MINUTE_MS });
  await window.locator('#email').fill(start.email);
  await window.locator('#password').fill(start.password);
  await window.getByRole('button', { name: /sign in/i }).click();
  await expect(window).not.toHaveURL(/\/login(\?|$)/, { timeout: MINUTE_MS });
}

test.describe('the desktop shell (WALK21_LIVE=1)', () => {
  liveOnlyByName('starts a second desktop shell instance');
  test.setTimeout(5 * MINUTE_MS);

  test('08 desktop', async () => {
    const start = shellStart();
    const conversation = conversationFrom('WALK21_CONVERSATION');
    const userDataDir = mkdtempSync(join(tmpdir(), 'bb2dash-walk21-'));
    // Its own profile: its own single-instance lock, config, session and watermark. The running
    // app and `%APPDATA%\bb2dash\config.json` are not read, written or signalled.
    const app = await electron.launch({
      executablePath: desktopElectronBinary(),
      args: [DESKTOP_MAIN, `--user-data-dir=${userDataDir}`],
      cwd: DESKTOP_DIR,
      env: {
        ...process.env,
        BB2DASH_APP_URL: start.appUrl,
        BB2DASH_SUPABASE_URL: start.supabaseUrl,
        BB2DASH_SUPABASE_ANON_KEY: start.supabaseAnonKey,
        BB2DASH_SYNC_DRY_RUN: '1',
      },
    });
    try {
      const window = await app.firstWindow();
      await signInToShell(window, start);

      // Workspace from the top bar, then the walk's conversation from the list.
      await window
        .getByRole('navigation', { name: 'Primary' })
        .getByRole('link', { name: 'Workspace', exact: true })
        .click();
      await expect(window).toHaveURL(/\/workspace$/);
      const row = window.getByRole('navigation', { name: 'Conversations' }).locator(`a[href$="c=${conversation}"]`);
      await row.click();
      await expect(window).toHaveURL(new RegExp(`/workspace\\?c=${conversation}$`));
      await window.waitForTimeout(SETTLE_MS);

      const shot = '08-desktop.png';
      try {
        // Inside the shell: the preload's bridge is there, which no browser has.
        expect(await window.evaluate(() => 'bb2dashDesktop' in globalThis), 'the window is the desktop shell').toBe(true);
        expect(new URL(window.url()).origin, 'the shell shows the local build of the branch').toBe(start.appUrl);
        await expect(window.getByRole('heading', { name: 'Workspace', level: 1 })).toBeVisible();
        // The same conversation: selected in the list, its turns in the column, the last one on screen.
        await expect(row).toHaveAttribute('aria-current', 'page');
        const turns = window.locator('li[data-turn]');
        await expect(turns.first()).toBeAttached();
        await expect(turns.first().getByText(QUESTION_LOOKUP, { exact: true })).toBeAttached();
        await expect(turns.last().locator('[data-tier]')).toBeAttached();
        await expect(turns.last()).toBeInViewport();
      } catch (error) {
        await window.screenshot({ path: join(SHOT_DIR, shot.replace(/\.png$/, '-FAIL.png')) });
        throw error;
      }
      await window.screenshot({ path: join(SHOT_DIR, shot) });
      const shell = await app.evaluate(({ app: electronApp }) => ({
        electron: process.versions.electron,
        ownProfile: electronApp.getPath('userData'),
        packaged: electronApp.isPackaged,
      }));
      const facts = {
        turns: await window.locator('li[data-turn]').count(),
        lastTurn: await window.locator('li[data-turn]').last().getAttribute('data-turn'),
        lastBadge: await textOrNull(window.locator('li[data-turn]').last().locator('[data-tier]')),
        ownProfileIsTheTempFolder: shell.ownProfile === userDataDir,
        electron: shell.electron,
        packaged: shell.packaged,
      };
      console.log(`[walk21] ${shot} shot at ${utcNow()} in a second shell instance: ${JSON.stringify(facts)}`);
    } finally {
      try {
        await app.close();
      } catch (error) {
        console.log(`[walk21] the shell did not close cleanly; ending its process: ${error instanceof Error ? error.message : String(error)}`);
        app.process().kill();
      }
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
  });
});

