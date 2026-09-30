/**
 * T-26's planner half, production sitting (2026-09-30, Stack's go-ahead).
 *
 * WRITES THROUGH THE REAL UI. Every row it makes is titled
 * `bb2dash test · <case>` and the `delete …` tests remove them in the same run.
 * It does not use `walk.ts`'s write guard, and `npm run walk` skips it
 * (`--grep-invert "production sitting"`). Run each step with `-g`, against
 * `WALK_BASE_URL` set to production, with the SQL checks between steps
 * (brief 97, T-26 and acceptance step 8).
 *
 * The selectors follow `main`'s planner form (sprint 1), which production runs.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';
import { dismissNativeDialogs, openSignedIn } from './walk';

const REFUSAL = 'A repeating event is limited to 52 occurrences — choose an earlier end date.';

/** The app polls, so 'networkidle' never fires; this is the settle pause instead. */
const SETTLE_MS = 2500;

type Scope = 'This event' | 'This and following events' | 'All events';

interface NewEvent {
  week: string;
  slot: string;
  title: string;
  zone?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  freq: 'daily' | 'weekly' | 'monthly';
  until: string;
}

test.beforeEach(({ page }) => {
  dismissNativeDialogs(page);
});

async function openWeek(page: Page, week: string): Promise<void> {
  await openSignedIn(page, `/planner?week=${week}`);
  await expect(page.getByRole('link', { name: 'Next week' })).toBeVisible();
  await page.waitForTimeout(SETTLE_MS);
}

async function fillNewEvent(page: Page, spec: NewEvent): Promise<Locator> {
  await openWeek(page, spec.week);
  await page.getByRole('button', { name: spec.slot }).click();
  const form = page.locator('form');
  await expect(form.getByRole('heading', { name: 'New planner event' })).toBeVisible();
  await form.getByLabel('Title').fill(spec.title);
  if (spec.zone) await form.getByLabel('Time zone').selectOption(spec.zone);
  await form.getByLabel('Start date').fill(spec.startDate);
  await form.getByLabel('Start time').fill(spec.startTime);
  await form.getByLabel('End date').fill(spec.endDate);
  await form.getByLabel('End time').fill(spec.endTime);
  await form.getByLabel('Repeats').selectOption(spec.freq);
  await form.getByLabel('Ends on').fill(spec.until);
  return form;
}

async function createSeries(page: Page, spec: NewEvent): Promise<void> {
  const form = await fillNewEvent(page, spec);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'New planner event' })).toBeHidden();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByRole('alert').filter({ hasText: /Could not/ })).toHaveCount(0);
}

/** Opens `title` in `week`, deletes it, and answers the scope question with `scope`. */
async function deleteOccurrence(page: Page, week: string, title: string, scope: Scope): Promise<void> {
  await openWeek(page, week);
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  const form = page.locator('form');
  await expect(form.getByRole('heading', { name: 'Edit planner event' })).toBeVisible();
  await form.getByRole('button', { name: 'Delete', exact: true }).click();
  await form.getByRole('button', { name: 'Yes, delete' }).click();
  const ask = page.getByRole('dialog', { name: 'Delete repeating event' });
  if (await ask.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ask.getByRole('radio', { name: scope, exact: true }).check();
    await ask.getByRole('button', { name: 'Delete', exact: true }).click();
  } else {
    // A row the series trigger no longer counts as a member deletes on its own.
    test.info().annotations.push({ type: 'no-scope-question', description: `${title} in ${week}` });
  }
  await expect(page.getByRole('heading', { name: 'Edit planner event' })).toBeHidden();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByRole('alert').filter({ hasText: /Could not/ })).toHaveCount(0);
}

test.describe('production sitting (T-26 planner half)', () => {
  test('create daily', async ({ page }) => {
    await createSeries(page, {
      week: '2026-11-09',
      slot: 'New event, Mon Nov 9, 9:00 AM',
      title: 'bb2dash test · daily',
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      startTime: '09:00',
      endTime: '10:00',
      freq: 'daily',
      until: '2026-11-13',
    });
  });

  test('create monthly', async ({ page }) => {
    await createSeries(page, {
      week: '2026-10-26',
      slot: 'New event, Mon Oct 26, 9:00 AM',
      title: 'bb2dash test · monthly',
      startDate: '2026-10-31',
      endDate: '2026-10-31',
      startTime: '09:00',
      endTime: '10:00',
      freq: 'monthly',
      until: '2026-12-31',
    });
  });

  test('refuse 53', async ({ page }) => {
    const form = await fillNewEvent(page, {
      week: '2026-11-09',
      // 9:00 AM is under the daily series and 1:00 PM under a class meeting.
      slot: 'New event, Mon Nov 9, 8:00 PM',
      title: 'bb2dash test · refuse',
      startDate: '2026-11-09',
      endDate: '2026-11-09',
      startTime: '09:00',
      endTime: '10:00',
      freq: 'daily',
      until: '2026-12-31',
    });
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(REFUSAL)).toBeVisible();
    // Still open: nothing was sent.
    await page.waitForTimeout(SETTLE_MS);
    await expect(form.getByRole('heading', { name: 'New planner event' })).toBeVisible();
    await form.getByRole('button', { name: 'Cancel' }).click();
  });

  test('create la-weekly', async ({ page }) => {
    await createSeries(page, {
      week: '2026-10-26',
      slot: 'New event, Mon Oct 26, 9:00 AM',
      title: 'bb2dash test · la-weekly',
      zone: 'America/Los_Angeles',
      startDate: '2026-10-26',
      endDate: '2026-10-26',
      startTime: '09:00',
      endTime: '10:00',
      freq: 'weekly',
      until: '2026-11-09',
    });
  });

  test('delete monthly', async ({ page }) => {
    await deleteOccurrence(page, '2026-10-26', 'bb2dash test · monthly', 'This event');
    // Dec 31 is now the series' last row.
    await deleteOccurrence(page, '2026-12-28', 'bb2dash test · monthly', 'This event');
  });

  test('delete la-weekly', async ({ page }) => {
    await deleteOccurrence(page, '2026-11-02', 'bb2dash test · la-weekly', 'This and following events');
    // Oct 26 is now the series' last row.
    await deleteOccurrence(page, '2026-10-26', 'bb2dash test · la-weekly', 'This event');
  });

  test('delete daily', async ({ page }) => {
    await deleteOccurrence(page, '2026-11-09', 'bb2dash test · daily', 'All events');
  });
});
