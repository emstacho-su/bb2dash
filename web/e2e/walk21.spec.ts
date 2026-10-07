/**
 * Phase 21's walk screenshots (brief 102, task 22): `walk-21/02` … `08`, `10`
 * and `11`, with the live turns of tasks 19 and 21 inside the same walk.
 *
 * THE WALK RUNS ONLY WHEN IT IS ASKED FOR. Without `WALK21=1` every test in
 * every walk21 file is skipped where it is declared: no page is opened, nothing
 * is read and no file is written into the walk folder. A plain
 * `npx playwright test` or `npm run walk` lists the walk as skipped.
 *
 * Run from `web/` against the branch preview, after `e2e/login.mjs` has saved
 * a session for that host, with `WALK_BASE_URL` (and `WALK_VERCEL_SHARE` for
 * `login.mjs`) set:
 *
 *   WALK21=1 npx playwright test -c e2e/playwright.config.ts walk21
 *
 * The walk is two test files and four of helpers. This one holds the first
 * sitting's tests, in the order they are walked; `walk21.retake.spec.ts` holds
 * the retake sitting's own. The name `walk21` selects both. The helpers:
 * `walk21.lib.ts` (what every file shares), `walk21.first.ts` (the first
 * sitting's way of shooting: the page, in a window made tall),
 * `walk21.window.ts` (the retake sitting's: a shot is the window) and
 * `walk21.desktop.ts` (the second shell instance).
 *
 * * `02 empty` reads standing data and needs only the switch. It is taken first
 *   in the walk, before any live turn, while the list holds only task 5's
 *   'spike'. When `WALK21_ONLY` names another test it stays out of the run.
 * * Every other test needs live state (the test container answering, stopped,
 *   or under the 0.01 cap) and most spend a turn of Stack's Claude plan, so
 *   each is skipped unless `WALK21_LIVE=1` is set too and `WALK21_ONLY` is its
 *   exact name:
 *
 *     WALK21=1 WALK21_LIVE=1 WALK21_ONLY="03 lookup haiku" npx playwright test -c e2e/playwright.config.ts walk21 -g "03 lookup haiku"
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
 *   "Used:" line are not on screen together at 1440 by 900. In the first
 *   sitting a turn's shot was taken in a window made tall enough to hold the
 *   whole turn (`fitTurnInShot`), and what the page showed at 1440 by 900 was
 *   printed first. Shots 03, 04 and 10 are that sitting's.
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
 * * Shots go to `docs/planning/sprint-2/walks/walk-21/` by explicit path
 *   (`walkShot`, which refuses without the switch); the config's `shotDir`
 *   stays Phase 17's.
 * * `06 stopped`, `07 offline` and `08 desktop` are the first sitting's tests
 *   under the retake sitting's rule: each shoots the window as it is, and first
 *   asserts that the document is at most 1 px taller than its window (W-1).
 * * `08 desktop` is the same conversation inside a second desktop shell
 *   instance: the worktree's `desktop/` build under its own `--user-data-dir`,
 *   pointed at a local `next start` of the branch (`WALK21_DESKTOP_APP_URL`).
 *   It never touches the running app or `%APPDATA%\bb2dash\config.json`.
 */

import { expect, test, type BrowserContext } from '@playwright/test';
import {
  BADGE_HIGH,
  BADGE_LOW,
  BADGE_MID,
  BUDGET_SENTENCE,
  COLUMN_START_LINE,
  LIVE_TEST_TIMEOUT_MS,
  MINUTE_MS,
  OFFLINE_LINE,
  OFFLINE_WAIT_MS,
  QUESTION_DECISION,
  QUESTION_DEEP,
  QUESTION_DOCUMENT,
  QUESTION_LOOKUP,
  QUESTION_STANDARD,
  QUEUED_LINE,
  SPIKE_TITLE,
  STOPPED_SENTENCE,
  STORED_SETTLE_MS,
  STREAMING_TEXT_MIN_CHARS,
  TURN_TIMEOUT_MS,
  UUID,
  ask,
  conversationFrom,
  conversationList,
  conversationOf,
  conversationPath,
  expectShown,
  expectUncovered,
  inColumnBox,
  lastTurn,
  listedTitles,
  liveOnlyByName,
  notWhenAnotherIsNamed,
  openSettled,
  registerWalkHooks,
  reportTurn,
  textOrNull,
  turnClosed,
  utcNow,
  walkOnlyWhenAsked,
  workspaceReady,
} from './walk21.lib';
import { askAndShoot, assertThenShoot } from './walk21.first';
import {
  closeSecondShell,
  desktopShotFacts,
  expectConversationInShell,
  expectOwnProfile,
  launchSecondShell,
  openConversationInShell,
  shellFacts,
  shellStart,
  signInToShell,
} from './walk21.desktop';
import {
  assertThenShootWindow,
  endReading,
  expectDocumentFitsWindow,
  expectShotIsTheWindow,
  shootWindowAfter,
} from './walk21.window';

walkOnlyWhenAsked();
registerWalkHooks();

const EMPTY_TEST = '02 empty';

test.describe('standing data (before any live turn)', () => {
  notWhenAnotherIsNamed(EMPTY_TEST);

  test(EMPTY_TEST, async ({ page }) => {
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
    const line = turn.locator('[data-turn-line]');
    // The window as it is (the retake sitting's rule): nothing is scrolled and nothing is made tall.
    await assertThenShootWindow(page, '06-stopped.png', async () => {
      await expect(turn).toHaveAttribute('data-turn', 'stopped');
      await expect(text).not.toBeEmpty();
      await expect(line).toHaveText(STOPPED_SENTENCE);
      await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
      // The sentence stands under the partial answer, in the column's visible box, with answer text above it.
      const answerBox = await text.boundingBox();
      const lineBox = await line.boundingBox();
      expect(answerBox !== null && lineBox !== null && lineBox.y >= answerBox.y + answerBox.height - 1).toBe(true);
      const lineAt = await inColumnBox(line);
      console.log(`[walk21] 06-stopped.png: the stopped sentence in the column ${JSON.stringify(lineAt)}`);
      expect(lineAt.inside, "the stopped sentence is wholly inside the column's visible box").toBe(true);
      await expectUncovered(line);
      await expect(text).toBeInViewport();
      await expectDocumentFitsWindow(page, '06-stopped.png');
    });
    await expect(turn.locator('[data-tier]')).toHaveText(BADGE_HIGH);
    // The runner's stored row then replaces the live text. The reader stayed at the end: the sentence is still in view.
    await page.waitForTimeout(STORED_SETTLE_MS);
    await reportTurn(page, '06-stopped.png', askedAt);
    const settled = await endReading(page, '06-stopped.png, after the stored row');
    expect(settled.line?.inside, 'the stopped sentence stays in view when the stored row lands').toBe(true);
    await expectDocumentFitsWindow(page, '06-stopped.png, after the stored row');
  });

  // Run within three minutes of `docker compose -p bb2dash-wt21 --profile workspace stop workspace`.
  test('07 offline', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_CONVERSATION')));
    const offline = page.locator('[data-workspace-offline]');
    await assertThenShootWindow(page, '07-offline.png', async () => {
      await expect(offline).toBeVisible({ timeout: OFFLINE_WAIT_MS });
      await expect(offline).toHaveText(OFFLINE_LINE);
      // Under the composer, and on screen whole.
      const questionBox = await page.getByRole('textbox', { name: 'Question' }).boundingBox();
      const offlineBox = await offline.boundingBox();
      expect(
        questionBox !== null && offlineBox !== null && offlineBox.y >= questionBox.y + questionBox.height - 1,
        'the offline line stands under the composer',
      ).toBe(true);
      await expectShown(offline);
      // The long conversation above it: turns in the column, more of them than the column holds.
      await expect(lastTurn(page)).toBeInViewport();
      const layout = await expectDocumentFitsWindow(page, '07-offline.png');
      expect(layout.columnScrollHeight, 'the conversation is longer than its column').toBeGreaterThan(
        layout.columnClientHeight,
      );
      expect(layout.windowScrollY, 'the window itself is not scrolled').toBe(0);
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

/** 08's shot: the same conversation inside a second desktop shell instance (`walk21.desktop.ts`). */
const DESKTOP_SHOT = '08-desktop.png';

test.describe('the desktop shell (WALK21_LIVE=1)', () => {
  liveOnlyByName('starts a second desktop shell instance');
  test.setTimeout(5 * MINUTE_MS);

  test('08 desktop', async () => {
    const start = shellStart();
    const conversation = conversationFrom('WALK21_CONVERSATION');
    const shell = await launchSecondShell(start);
    try {
      const window = await shell.app.firstWindow();
      await signInToShell(window, start);
      const row = await openConversationInShell(window, conversation);
      const facts = await shellFacts(shell.app);
      // The window as the shell opened it: not resized, and not the whole page.
      const shot = await shootWindowAfter(window, DESKTOP_SHOT, async () => {
        // Its own profile, asserted before anything is shot.
        expectOwnProfile(facts, shell.userDataDir);
        await expectConversationInShell(window, row, start, DESKTOP_SHOT);
      });
      expectShotIsTheWindow(shot);
      const printed = await desktopShotFacts(window, facts, shell.userDataDir, shot);
      console.log(`[walk21] ${DESKTOP_SHOT} shot at ${utcNow()} in a second shell instance: ${JSON.stringify(printed)}`);
    } finally {
      await closeSecondShell(shell);
    }
  });
});
