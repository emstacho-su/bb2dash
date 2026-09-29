/**
 * Phase 17's walk screenshots 03–21, the `staged link` test (T-26) and the
 * forced failed read (CR-7, screenshot 18). Brief 97's task list names what
 * each screenshot must show; each test asserts that much before it shoots.
 *
 * Read-only: `guardWrites` aborts any table write and fails the test. The
 * sitting rows (11, 14, 15, 19, 20, 21 and `staged link`) exist only during
 * T-26's production sitting, so run those with `-g` then.
 */

import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  A1_POPOUT,
  SIDEBAR_KEY,
  STAGED_LABEL,
  assertNoWrites,
  coldCache,
  dismissNativeDialogs,
  failReads,
  fulfillView,
  guardWrites,
  openSignedIn,
  shotPath,
} from './walk';

let writes: string[] = [];

test.beforeEach(async ({ page, context }) => {
  writes = await guardWrites(context);
  dismissNativeDialogs(page);
});

test.afterEach(() => {
  assertNoWrites(writes);
});

/** How far the week navigation may walk looking for a block (CR-5). */
const MAX_WEEKS_FORWARD = 10;

/**
 * T-19's `failing` calendar-push row, written here from the Contract's
 * `v_scheduler_heartbeat` columns (the harness does not import W-46's test).
 */
function heartbeatFixture(now: Date): Record<string, unknown>[] {
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
  return [
    {
      job: 'transform',
      cron_jobname: 'bb2dash-transform-tick',
      tick_seconds: 120,
      last_tick_at: ago(60),
      last_ok_at: ago(60),
      consecutive_failures: 0,
      last_error: null,
      stage: 'ok',
    },
    {
      job: 'calendar_push',
      cron_jobname: 'bb2dash-calendar-push',
      tick_seconds: 120,
      last_tick_at: ago(90),
      last_ok_at: ago(6 * 3600),
      consecutive_failures: 3,
      last_error: 'refresh token revoked (invalid_grant): re-run scripts/google-consent.mjs',
      stage: 'failing',
    },
  ];
}

/** The planner's day-by-day grid is on screen. */
async function openPlanner(page: Page, query = ''): Promise<void> {
  await openSignedIn(page, `/planner${query}`);
  // ◂ ▸ are plain links (PlannerWeekHeader's WeekPager), so a week is linkable.
  await expect(page.getByRole('link', { name: 'Next week' })).toBeVisible();
  await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
}

/** Pages forward a week at a time until `target` shows, or fails after MAX_WEEKS_FORWARD. */
async function weekHolding(page: Page, target: Locator): Promise<void> {
  for (let week = 0; week <= MAX_WEEKS_FORWARD; week += 1) {
    if (await target.first().isVisible()) return;
    await page.getByRole('link', { name: 'Next week' }).click();
    await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
  }
  await expect(target.first(), `not found within ${MAX_WEEKS_FORWARD} weeks`).toBeVisible();
}

/** A due item's popover trigger on the planner grid. */
function dueItems(page: Page): Locator {
  return page.locator('a[aria-haspopup="dialog"]');
}

async function openWithSidebar(context: BrowserContext, state: 'open' | 'closed'): Promise<void> {
  await context.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage disabled: the viewport default applies.
      }
    },
    [SIDEBAR_KEY, state] as const,
  );
}

test.describe('screens (T-12 … T-21)', () => {
  test('03 stream IST.352', async ({ page }, testInfo) => {
    await openSignedIn(page, '/course/IST.352/stream');
    await page.waitForLoadState('load'); await page.waitForTimeout(2000); // the app polls, so 'networkidle' never fires
    await expect(page.getByRole('combobox').first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '03-stream-ist352.png'), fullPage: true });
  });

  test('04 classwork IST.352', async ({ page }, testInfo) => {
    await openSignedIn(page, '/course/IST.352/classwork');
    await expect(page.getByText('WK01 - The Systems Development Environment')).toHaveCount(1);
    await expect(page.getByText('WK01 - Chapter 1')).toHaveCount(0);
    await expect(page.getByText(/Show 2 items Blackboard no longer lists/)).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '04-classwork-ist352.png'), fullPage: true });
  });

  test('05 IST.466 timeline', async ({ page }, testInfo) => {
    await openSignedIn(page, '/course/IST.466/classwork?view=timeline');
    await expect(page.getByText('Attendance and participation count').first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '05-ist466-timeline.png'), fullPage: true });
  });

  test('06 home undated', async ({ page }, testInfo) => {
    await openSignedIn(page, '/');
    const undated = page.getByRole('button', { name: /^Undated \(\d+\)/ });
    await expect(undated).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: shotPath(testInfo, '06-home-undated.png'), fullPage: true });
  });

  test('07 materials folded', async ({ page }, testInfo) => {
    await openSignedIn(page, '/materials');
    const header = page.locator('button[aria-expanded][aria-controls]').first();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: shotPath(testInfo, '07-materials-folded.png'), fullPage: true });
    // Stack's stored fold state is left as it was found.
    await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  test('08 home push failing', async ({ page, context }, testInfo) => {
    await fulfillView(context, 'v_scheduler_heartbeat', heartbeatFixture(new Date()));
    await openSignedIn(page, '/');
    await expect(page.getByText(/Google Calendar push has failed 3 times since/)).toBeVisible();
    await expect(page.getByText(/re-run scripts\/google-consent\.mjs/)).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '08-home-push-failing.png'), fullPage: true });
  });

  test('09 planner 1440', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPlanner(page);
    await expect(page.getByText(/GEO/).first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '09-planner-1440.png'), fullPage: true });
  });

  test('10 planner 1040 with the sidebar open', async ({ page, context }, testInfo) => {
    await openWithSidebar(context, 'open');
    await page.setViewportSize({ width: 1040, height: 900 });
    await openPlanner(page);
    await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'open');
    await page.screenshot({ path: shotPath(testInfo, '10-planner-1040.png'), fullPage: true });
  });

  test('12 popover above', async ({ page }, testInfo) => {
    await openPlanner(page);
    await weekHolding(page, dueItems(page));
    const card = dueItems(page).last();
    // Put the card at the bottom edge, so the popover has no room below it.
    await card.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await card.click();
    await expect(page.locator('[role="dialog"][data-placement]')).toHaveAttribute('data-placement', 'above');
    await page.screenshot({ path: shotPath(testInfo, '12-popover-above.png') });
  });

  test('13 popover right clamp', async ({ page }, testInfo) => {
    await openPlanner(page, '?week=2026-09-21');
    const cards = dueItems(page);
    await expect(cards.first()).toBeVisible();
    // Sunday is the rightmost column: take the card whose left edge is furthest right.
    // Hidden duplicates (zero-size boxes) never win: they cannot be clicked.
    const lefts = await cards.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? r.left : Number.NEGATIVE_INFINITY;
      }),
    );
    const rightmost = lefts.indexOf(Math.max(...lefts));
    await cards.nth(rightmost).click();
    const popover = page.locator('[role="dialog"][data-placement]');
    await expect(popover).toBeVisible();
    const box = await popover.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error('the popover has no box');
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({ path: shotPath(testInfo, '13-popover-right-clamp.png') });
  });

  test('16 CR-1 return to today', async ({ page }, testInfo) => {
    await openSignedIn(page, '/');
    const strip = page.getByRole('tablist', { name: 'Effort by day' });
    await expect(strip).toBeVisible();
    await strip.evaluate((el) => el.scrollBy({ left: 900 }));
    await page.getByRole('button', { name: 'Earlier days' }).click();
    await page.screenshot({ path: shotPath(testInfo, '16-cr1-return-today.png') });
  });

  test('17 CR-5 IST.323 Monday block with Quiz #5', async ({ page }, testInfo) => {
    await openPlanner(page);
    await weekHolding(page, page.getByText(/Quiz #5/));
    await page.screenshot({ path: shotPath(testInfo, '17-cr5-ist323.png'), fullPage: true });
  });
});

test.describe('forced failed read (CR-7)', () => {
  test('18 course card could not be loaded', async ({ page, context }, testInfo) => {
    await coldCache(context);
    await failReads(context, ['v_course_grade', 'grading_schemes', 'grade_components', 'v_grade_model_items']);
    await openSignedIn(page, '/');
    await expect(page.getByText('could not be loaded').first()).toBeVisible();
    await expect(page.getByText('could not be worked out').first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '18-cr7-could-not-load.png'), fullPage: true });
  });
});

test.describe('production sitting (T-26)', () => {
  test('11 monthly on Oct 31', async ({ page }, testInfo) => {
    await openPlanner(page, '?week=2026-10-26');
    await expect(page.getByText(/bb2dash test · monthly/).first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '11-monthly-oct31.png'), fullPage: true });
  });

  test('14 chip matches', async ({ page }, testInfo) => {
    await openSignedIn(page, A1_POPOUT);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('matches', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: STAGED_LABEL })).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '14-chip-matches.png') });
  });

  test('15 chip differs', async ({ page }, testInfo) => {
    await openSignedIn(page, A1_POPOUT);
    await expect(page.getByRole('dialog').getByText('differs', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '15-chip-differs.png') });
  });

  test('19 refuses 53 occurrences', async ({ page }, testInfo) => {
    await openPlanner(page, '?week=2026-11-09');
    await page.getByRole('button', { name: 'New event, Mon Nov 9, 9:00 AM' }).click();
    const form = page.locator('form');
    await form.getByLabel('Title').fill('bb2dash test · refuse-53');
    await form.getByLabel('Repeats').selectOption('daily');
    await form.getByLabel('Ends on').fill('2026-12-31');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByText('A repeating event is limited to 52 occurrences — choose an earlier end date.'),
    ).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '19-refuse-53.png') });
    await form.getByRole('button', { name: 'Cancel' }).click();
  });

  test('20 LA weekly on Nov 2', async ({ page }, testInfo) => {
    await openPlanner(page, '?week=2026-11-02');
    await expect(page.getByText(/bb2dash test · la-weekly/).first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '20-la-weekly-nov2.png'), fullPage: true });
  });

  test('21 materials my submissions', async ({ page }, testInfo) => {
    await openSignedIn(page, '/materials');
    await expect(page.getByText('My submissions').first()).toBeVisible();
    await page.screenshot({ path: shotPath(testInfo, '21-materials-my-submissions.png'), fullPage: true });
  });

  test('staged link', async ({ page }) => {
    const expected = process.env.WALK_STAGED_HREF;
    test.skip(!expected, 'set WALK_STAGED_HREF to the value for the merge order in force (T-26)');
    await openSignedIn(page, A1_POPOUT);
    const link = page.getByRole('dialog').getByRole('link', { name: STAGED_LABEL });
    await expect(link).toHaveAttribute('href', expected ?? '');
    const submit = page.getByRole('button', { name: /\bSubmit\b/ }).or(
      page.getByRole('link', { name: /\bSubmit\b/ }),
    );
    await expect(submit).toHaveCount(0);
  });
});
