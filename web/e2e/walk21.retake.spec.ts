/**
 * Phase 21's walk, THE RETAKE SITTING (2026-10-07, after W-66 fixed the walk's
 * W-1 and W-2). The walk, its switch and how a live test is run are described
 * at the top of `walk21.spec.ts`: without `WALK21=1` every test here is
 * skipped, and each one needs `WALK21_LIVE=1` and `WALK21_ONLY` set to its
 * exact name.
 *
 * Five shots were taken again under one rule: A SHOT IS THE WINDOW, 1440 by
 * 900, never the whole page and never a window made tall. A full-page shot of
 * a tall window is what hid W-2 in the first sitting. Where the proof is
 * further up or down a conversation than fits, the column is scrolled, as a
 * reader would (`scrollColumnToTurnStart`). Every window shot first asserts
 * that the document is at most 1 px taller than its window (W-1; the app's
 * shell is 1 px taller than the window on every screen, which is not this
 * phase's). The rule's helpers are `walk21.window.ts`.
 *
 * * `retake 11` and `retake 05` ask nothing. They open the first sitting's
 *   archived conversation by its row under "Show archived"
 *   (`WALK21_ARCHIVED_CONVERSATION`) and shoot the standing turn with the
 *   column scrolled to that turn's START. A turn taller than the column cannot
 *   show its badge and its "Used:" line together, and the brief's row 22 (c)
 *   names the badge for these two shots: the question and the badge are
 *   asserted inside the column's visible box, the "Used:" line by its text,
 *   and where that line stands is printed. (The sitting first shot them at the
 *   turn's end, with the "Used:" line in view and the badge out of it. Those
 *   takes were replaced; 102a's section on the retake sitting says how the
 *   choice of "start" reached it.)
 * * `w2 document haiku` and `long opus` each spend a turn and take no shot.
 *   They stay at the column's end, scroll nothing and reload nothing, and read
 *   whether the turn's last line is wholly inside the column's visible box
 *   once the stored row has landed (W-2). An answer that cannot show W-2 fails
 *   by name, and is not a pass: one too short to make the column scroll
 *   (`w2 document haiku`), or one that used no tool and so has no "Used:" line.
 *   `long opus` is also the turn task 21 (d) is repeated on: the PM reads the
 *   container's health while it waits.
 * * `06 stopped`, `07 offline` and `08 desktop` are the first sitting's tests
 *   under the window rule. They stand in `walk21.spec.ts`.
 * * `w1 numbers` asks nothing and shoots nothing: it prints the document's
 *   height against the window's, and the column's content against its box.
 */

import { expect, test } from '@playwright/test';
import {
  BADGE_HIGH,
  BADGE_LOW,
  BADGE_MID,
  LIVE_TEST_TIMEOUT_MS,
  MINUTE_MS,
  QUESTION_DEEP,
  QUESTION_DOCUMENT,
  QUESTION_LONG,
  QUESTION_STANDARD,
  SETTLE_MS,
  STORED_SETTLE_MS,
  TURN_TIMEOUT_MS,
  ask,
  conversationFrom,
  conversationOf,
  conversationPath,
  lastTurn,
  liveOnlyByName,
  openSettled,
  registerWalkHooks,
  reportTurn,
  utcNow,
  walkOnlyWhenAsked,
  workspaceReady,
} from './walk21.lib';
import {
  endReading,
  expectDocumentFitsWindow,
  expectLongAndContained,
  expectTallerThanColumn,
  expectUsedLineInside,
  openArchivedByRow,
  retakeAnsweredTurn,
} from './walk21.window';

walkOnlyWhenAsked();
registerWalkHooks();

/** After the stored row's lines are on the page: the column follows them in the same frame. */
const AFTER_ROW_MS = 1000;
/** The stored row follows a closed request within one read; a minute covers a missed broadcast and a poll. */
const STORED_ROW_TIMEOUT_MS = MINUTE_MS;

// The retake sitting (2026-10-07). See the header: a shot is the window, and nothing is made tall.
test.describe('second sitting, W-1 and W-2 on the real page (WALK21_LIVE=1)', () => {
  liveOnlyByName('reads the first sitting\'s conversation, or spends a live turn');
  test.setTimeout(LIVE_TEST_TIMEOUT_MS);

  // Nothing is asked: the first sitting's Sonnet turn, shot again at the window's size.
  test('retake 11', async ({ page }) => {
    await retakeAnsweredTurn(page, { question: QUESTION_STANDARD, shot: '11-standard-sonnet.png', badge: BADGE_MID });
  });

  // Nothing is asked: the first sitting's Opus turn, shot again at the window's size.
  test('retake 05', async ({ page }) => {
    await retakeAnsweredTurn(page, { question: QUESTION_DEEP, shot: '05-deep-opus.png', badge: BADGE_HIGH });
  });

  // One Haiku turn, in a new conversation. W-2 live: the reader stays at the end, and the "Used:" line lands in view.
  test('w2 document haiku', async ({ page }) => {
    await openSettled(page, '/workspace');
    await workspaceReady(page);
    const askedAt = await ask(page, QUESTION_DOCUMENT);
    console.log(`[walk21] w2 document haiku: asked at ${askedAt} in conversation ${conversationOf(page)}`);
    const turn = lastTurn(page);
    // From here nothing is scrolled and nothing is reloaded.
    await expect(turn).toHaveAttribute('data-turn', /^(done|failed|stopped)$/, { timeout: TURN_TIMEOUT_MS });
    await reportTurn(page, 'w2 document haiku, as the turn closed', askedAt);
    // The "Used:" line arrives with the stored row.
    await expect(
      turn.locator('[data-used]'),
      'the stored row brings a "Used:" line (an answer that used no tool has none, and cannot show W-2)',
    ).toBeAttached({ timeout: STORED_ROW_TIMEOUT_MS });
    await page.waitForTimeout(AFTER_ROW_MS);
    const landed = await endReading(page, 'w2 document haiku, the stored row has landed');
    await page.waitForTimeout(STORED_SETTLE_MS);
    const settled = await endReading(page, 'w2 document haiku, settled');
    await reportTurn(page, 'w2 document haiku', askedAt);
    await expect(turn).toHaveAttribute('data-turn', 'done');
    await expect(turn.locator('[data-tier]')).toHaveText(BADGE_LOW);
    await expect(turn.locator('[data-used]')).toContainText('get_material_text');
    // Before the line's place is read: a column with nothing to scroll proves nothing about W-2.
    expectTallerThanColumn(landed, 'w2 document haiku');
    expectUsedLineInside(landed, 'w2 document haiku', 'the "Used:" line landed wholly inside the column\'s visible box (W-2)');
    expectUsedLineInside(settled, 'w2 document haiku', 'and it is still there once the page has settled');
    await expectDocumentFitsWindow(page, 'w2 document haiku');
  });

  // One Opus turn on a long request, in the same conversation, never stopped. While it waits the PM
  // reads the container's health and the request's state 60 s and 120 s after the claim (task 21 (d)).
  test('long opus', async ({ page }) => {
    await openSettled(page, conversationPath(conversationFrom('WALK21_CONVERSATION')));
    await workspaceReady(page);
    const askedAt = await ask(page, QUESTION_LONG);
    const turn = lastTurn(page);
    await expect(turn).toHaveAttribute('data-request-id', /^\d+$/);
    console.log(
      `[walk21] long opus: asked at ${askedAt}, request ${await turn.getAttribute('data-request-id')}, conversation ${conversationOf(page)}`,
    );
    // From here nothing is scrolled, nothing is reloaded and Stop is not pressed.
    await expect(turn).toHaveAttribute('data-turn', /^(done|failed|stopped)$/, { timeout: TURN_TIMEOUT_MS });
    console.log(`[walk21] long opus: the page showed the turn closed at ${utcNow()}`);
    await page.waitForTimeout(STORED_SETTLE_MS);
    await reportTurn(page, 'long opus', askedAt);
    const settled = await endReading(page, 'long opus, settled');
    await expect(turn.locator('[data-tier]')).toHaveText(BADGE_HIGH);
    // However it ended (done, the cost limit, the time limit), the reader who stayed at the end sees the turn's last line.
    if (settled.line !== null) {
      expect(settled.line.inside, "the line under the answer is wholly inside the column's visible box").toBe(true);
    } else {
      // No line under the answer: the last line is the "Used:" line, when the answer used a tool.
      expectUsedLineInside(settled, 'long opus', 'the "Used:" line landed wholly inside the column\'s visible box (W-2)');
    }
    await expectDocumentFitsWindow(page, 'long opus');
  });

  // Nothing is asked and nothing is shot: W-1's numbers on the real page, for both sittings' conversations.
  test('w1 numbers', async ({ page }) => {
    const listed = conversationFrom('WALK21_CONVERSATION');
    const archived = conversationFrom('WALK21_ARCHIVED_CONVERSATION');
    await openSettled(page, conversationPath(listed));
    await workspaceReady(page);
    await expect(page.locator('li[data-turn]').first()).toBeAttached();
    await page.waitForTimeout(SETTLE_MS);
    await expectLongAndContained(page, `w1 numbers, this sitting's conversation ${listed}`);
    await openArchivedByRow(page, archived);
    await expectLongAndContained(page, `w1 numbers, the first sitting's conversation ${archived}`);
  });
});
