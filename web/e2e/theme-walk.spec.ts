/**
 * Phase 22's theme walk (brief 103, task 16; R-53, P-76). The proof that every surface of the
 * app is drawn in both themes, and the source of the PM's shots at task 22.
 *
 *   node scripts/walk-box.mjs web/e2e/theme-walk.spec.ts [-- -g "13 login"]
 *
 * 64 cases, titles frozen so `-g` can pick them: `NN <slug> [<theme>]` for the 31 rows of the
 * brief's screen inventory (62), `motion off under reduced motion` (1) and `planner targets` (1).
 * The last two are not surfaces and take no shot.
 *
 * It asserts that each surface is reached in the theme it asks for, and that the page printed
 * no hydration message. It writes no shot unless `WALK_SHOTS=1`, and then only through
 * `shotPath22`. Every case takes `test` from `./walk22.lib`, whose automatic fixture guards the
 * context, so a case that tried to write the database fails.
 *
 * Reduced motion is emulated for the whole file, so a panel is at rest on its first frame.
 *
 * Themes. The default is Dark, so a `[dark]` case stores nothing. A `[light]` case puts `light` in
 * `localStorage['bb2dash.theme']` before its first load, and every case asserts `html[data-theme]`.
 *
 * Windows. Rows 01 to 12 make the window as tall as the top bar plus the content pane before the
 * shot, with the width unchanged, so the parts of a screen below the first windowful are in the
 * shot and judged. Rows 13 to 16 scroll as documents and are shot whole. Rows 17 to 31 are shot in
 * the config's window, 1440 by 900; row 31 shows the frame with the pane scrolled to its end.
 *
 * Fonts. Every case awaits `document.fonts.ready` and the first family of `--font-body` holding a
 * face with status `loaded` before it shoots (`document.fonts.check()` also answers true when the
 * file never arrived).
 *
 * The cases of rows 19 to 21, 30 and `planner targets` reach states in other workers' components
 * by role and name, as the brief's inventory words them; a case that cannot reach its state says
 * which element it looked for.
 */

import { type BrowserContext, type Locator, type Page } from '@playwright/test';
import { A1_POPOUT, coldCache, failReads, fulfillView, openSignedIn } from './walk';
import { expect, quietSync, shotPath22, shotsAsked22, test } from './walk22.lib';

test.use({ reducedMotion: 'reduce' });

/* ---------------------------------------------------------------------------
 * What the cases share
 * ------------------------------------------------------------------------ */

const THEME_KEY = 'bb2dash.theme';
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

/** The app polls, so 'networkidle' never fires; this lets the cold reads land. */
const SETTLE_MS = 2500;
const FONT_WAIT_MS = 30_000;
/** After a window is resized the layout needs a moment before a shot. */
const RESIZE_SETTLE_MS = 400;
/** How far the planner's week navigation may walk looking for a due item. */
const MAX_WEEKS_FORWARD = 10;

const DESKTOP = { width: 1440, height: 900 } as const;
const RAIL_WIDTH = { width: 1280, height: 900 } as const;
const DRAWER_WIDTH = { width: 800, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;

// Found by role and name, never by `title` (task 32 takes the title off). Their names carry a count badge
// when something is unseen, so the match is not exact.
const activityButton = (page: Page): Locator => page.getByRole('button', { name: 'Activity' });
const announcementsButton = (page: Page): Locator => page.getByRole('button', { name: 'Announcements' });

/** Inventory row 12's fixture: one answered question, in sample text. */
const WORKSPACE_CONVERSATION = '22222222-2222-4222-8222-222222222201';
const WORKSPACE_QUESTION = '22222222-2222-4222-8222-222222222202';
const WORKSPACE_ANSWER = '22222222-2222-4222-8222-222222222203';
const WORKSPACE_REQUEST_ID = 22_001;
const WORKSPACE_PATH = `/workspace?c=${WORKSPACE_CONVERSATION}`;

/** Row 18's pasted URL, as `item-popout.spec.ts` builds it (`IST466_SESSION_ID` = 105). */
const SESSION_POPOUT = '/course/IST.466/classwork?view=timeline&item=session:105';

/** Rows 21 and `planner targets`: the fixture week's rows. */
const FIXTURE_SERIES_ID = '33333333-3333-4333-8333-333333333301';
const FIXTURE_SERIES_EVENT_ID = '33333333-3333-4333-8333-333333333302';
const FIXTURE_TASK_EVENT_ID = '33333333-3333-4333-8333-333333333303';
const FIXTURE_TASK_TITLE = 'Walk task, sample';
const FIXTURE_SERIES_TITLE = 'Walk series, sample';

async function useTheme(context: BrowserContext, theme: Theme): Promise<void> {
  if (theme !== 'light') return;
  await context.addInitScript(
    ([key, value]: readonly [string, string]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage disabled: the page keeps its default theme, and the case says so.
      }
    },
    [THEME_KEY, 'light'] as const,
  );
}

/** Console messages React prints when the server HTML and the client disagree. */
function collectHydrationMessages(page: Page): string[] {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (/hydrat/i.test(message.text())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    if (/hydrat/i.test(error.message)) messages.push(`pageerror: ${error.message}`);
  });
  return messages;
}

/** Waits for the first family of `--font-body` to hold a loaded face. */
async function bodyFontLoaded(page: Page): Promise<void> {
  const family = await page.evaluate(async () => {
    await document.fonts.ready;
    const named = getComputedStyle(document.documentElement).getPropertyValue('--font-body');
    return (named.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
  });
  expect(family, 'the first family of --font-body').not.toBe('');
  await expect
    .poll(
      () =>
        page.evaluate(
          (name: string) =>
            [...document.fonts].some((face) => face.family.replace(/^['"]|['"]$/g, '') === name && face.status === 'loaded'),
          family,
        ),
      { message: `a face of ${family} with status "loaded"`, timeout: FONT_WAIT_MS },
    )
    .toBe(true);
}

/** Opens a signed-in address and settles. */
async function openAt(page: Page, address: string, viewport: { width: number; height: number } = DESKTOP): Promise<void> {
  await page.setViewportSize(viewport);
  await openSignedIn(page, address);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
}

async function fulfillWorkspaceFixture(context: BrowserContext): Promise<void> {
  const now = new Date();
  const earlier = new Date(now.getTime() - 5 * 60_000).toISOString();
  await fulfillView(context, 'workspace_conversations', [
    { id: WORKSPACE_CONVERSATION, created_at: earlier, updated_at: earlier, title: 'What is due this week?', archived: false },
  ]);
  await fulfillView(context, 'workspace_messages', [
    {
      id: WORKSPACE_QUESTION,
      conversation_id: WORKSPACE_CONVERSATION,
      role: 'user',
      request_id: null,
      tier: null,
      content: 'What is due this week?',
      tool_calls: [],
      finished: true,
      error_code: null,
      created_at: earlier,
    },
    {
      id: WORKSPACE_ANSWER,
      conversation_id: WORKSPACE_CONVERSATION,
      role: 'assistant',
      request_id: WORKSPACE_REQUEST_ID,
      tier: 'mid',
      content: 'Sample answer: the reading for the week and the second quiz are due on Friday.',
      tool_calls: [{ tool: 'search_materials', query: 'due this week', scope: 'IST.323', ok: true }],
      finished: true,
      error_code: null,
      created_at: now.toISOString(),
    },
  ]);
  await fulfillView(context, 'workspace_requests', [
    {
      id: WORKSPACE_REQUEST_ID,
      created_at: earlier,
      conversation_id: WORKSPACE_CONVERSATION,
      user_message_id: WORKSPACE_QUESTION,
      state: 'done',
      claimed_at: earlier,
      finished_at: now.toISOString(),
      error_code: null,
    },
  ]);
  await fulfillView(context, 'v_workspace_status', [
    { polled_at: now.toISOString(), runner: 'walk22', open_requests: 0, oldest_open_at: null, polled_age_seconds: 5 },
  ]);
}

/** A planner event row of the fixture week: today at noon New York, one hour. */
function plannerRow(id: string, title: string, kind: 'event' | 'task', seriesId: string | null): Record<string, unknown> {
  const starts = new Date();
  starts.setUTCHours(16, 0, 0, 0);
  const ends = new Date(starts.getTime() + 60 * 60_000);
  const stamp = new Date(starts.getTime() - 24 * 60 * 60_000).toISOString();
  return {
    id,
    kind,
    title,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    time_zone: 'America/New_York',
    all_day: false,
    location_kind: null,
    location: null,
    notes: null,
    done: false,
    course_id: null,
    series_id: seriesId,
    series_detached: false,
    created_at: stamp,
    updated_at: stamp,
  };
}

/** Rows 21 and `planner targets`: the planner's week read answers with the fixture rows. */
async function fulfillPlannerFixture(context: BrowserContext, rows: readonly Record<string, unknown>[]): Promise<void> {
  await fulfillView(context, 'planner_events', rows);
}

/** The planner's grid is on screen. */
async function openPlanner(page: Page, viewport: { width: number; height: number } = DESKTOP): Promise<void> {
  await openAt(page, '/planner', viewport);
  await expect(page.getByRole('link', { name: 'Next week' })).toBeVisible();
}

/** Pages forward a week at a time until `target` shows. */
async function weekHolding(page: Page, target: Locator): Promise<void> {
  for (let week = 0; week <= MAX_WEEKS_FORWARD; week += 1) {
    if (await target.first().isVisible()) return;
    await page.getByRole('link', { name: 'Next week' }).click();
    await page.waitForLoadState('load');
    await page.waitForTimeout(SETTLE_MS);
  }
  await expect(target.first(), `not found within ${MAX_WEEKS_FORWARD} weeks`).toBeVisible();
}

/** The window made as tall as the top bar plus the content pane, width unchanged. */
async function growWindowToContent(page: Page): Promise<void> {
  const size = page.viewportSize() ?? DESKTOP;
  const height = await page.evaluate(() => {
    const bar = document.querySelector('nav')?.getBoundingClientRect().height ?? 0;
    const pane = document.querySelector('main')?.scrollHeight ?? document.documentElement.scrollHeight;
    return Math.ceil(bar + pane);
  });
  await page.setViewportSize({ width: size.width, height: Math.max(height, size.height) });
  await page.waitForTimeout(RESIZE_SETTLE_MS);
}

/* ---------------------------------------------------------------------------
 * The 31 surfaces
 * ------------------------------------------------------------------------ */

type WindowMode = 'tall' | 'document' | 'config';

interface Surface {
  nn: string;
  slug: string;
  window: WindowMode;
  /** Whether the case runs signed in under a quiet Sync label. */
  quiet?: boolean;
  /** Reaches the surface's state and asserts something of it is on screen. */
  reach: (page: Page, context: BrowserContext) => Promise<void>;
}

const route =
  (path: string, ready: (page: Page) => Locator) =>
  async (page: Page): Promise<void> => {
    await openAt(page, path);
    await expect(ready(page).first()).toBeVisible();
  };

const barVisible = (page: Page): Locator => page.getByRole('navigation', { name: 'Primary' });

/** The signed-out pages: the app's session cookies are removed, so /login stays the login page. */
async function openSignedOut(page: Page, context: BrowserContext, path: string): Promise<void> {
  await context.clearCookies();
  await page.setViewportSize(DESKTOP);
  await page.goto(path);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
}

const SURFACES: readonly Surface[] = [
  { nn: '01', slug: 'home', window: 'tall', quiet: true, reach: route('/', barVisible) },
  {
    nn: '02',
    slug: 'planner',
    window: 'tall',
    quiet: true,
    reach: async (page) => {
      await openPlanner(page);
    },
  },
  { nn: '03', slug: 'inbox', window: 'tall', quiet: true, reach: route('/inbox', barVisible) },
  { nn: '04', slug: 'announcements', window: 'tall', quiet: true, reach: route('/announcements', barVisible) },
  { nn: '05', slug: 'grades', window: 'tall', quiet: true, reach: route('/grades', barVisible) },
  { nn: '06', slug: 'materials', window: 'tall', quiet: true, reach: route('/materials', barVisible) },
  {
    nn: '07',
    slug: 'course-stream',
    window: 'tall',
    quiet: true,
    reach: route('/course/IST.352/stream', (page) => page.getByRole('combobox')),
  },
  { nn: '08', slug: 'course-classwork', window: 'tall', quiet: true, reach: route('/course/IST.471/classwork', barVisible) },
  { nn: '09', slug: 'course-grades', window: 'tall', quiet: true, reach: route('/course/IST.466/grades', barVisible) },
  { nn: '10', slug: 'course-info', window: 'tall', quiet: true, reach: route('/course/IST.466/info', barVisible) },
  {
    nn: '11',
    slug: 'assignment-page',
    window: 'tall',
    quiet: true,
    reach: route('/course/IST.471/assignment/IST.471/a1-proposal', barVisible),
  },
  {
    nn: '12',
    slug: 'workspace',
    window: 'tall',
    quiet: true,
    reach: async (page, context) => {
      await fulfillWorkspaceFixture(context);
      await openAt(page, WORKSPACE_PATH);
      await expect(page.getByText('Sample answer: the reading for the week')).toBeVisible();
    },
  },
  {
    nn: '13',
    slug: 'login',
    window: 'document',
    reach: async (page, context) => {
      await openSignedOut(page, context, '/login');
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    },
  },
  {
    nn: '14',
    slug: 'privacy',
    window: 'document',
    reach: async (page, context) => {
      await openSignedOut(page, context, '/privacy');
      await expect(page.getByText('Privacy', { exact: true })).toBeVisible();
    },
  },
  {
    nn: '15',
    slug: 'terms',
    window: 'document',
    reach: async (page, context) => {
      await openSignedOut(page, context, '/terms');
      await expect(page.getByText('Terms of service', { exact: true })).toBeVisible();
    },
  },
  {
    nn: '16',
    slug: 'not-found',
    window: 'document',
    // Signed in, as phone-width.spec.ts opens it: the proxy sends a signed-out visitor to /login.
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/no-such-page');
      await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible();
    },
  },
  {
    nn: '17',
    slug: 'assignment-popout',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, A1_POPOUT);
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    nn: '18',
    slug: 'session-popout',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, SESSION_POPOUT);
      // The Stream's own side panel shares the label, so the popout is found by role alone.
      await expect(page.getByRole('dialog').first()).toBeVisible();
    },
  },
  {
    nn: '19',
    slug: 'planner-item-popover',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openPlanner(page);
      const dueItem = page.locator('a[aria-haspopup="dialog"]');
      await weekHolding(page, dueItem);
      await dueItem.first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    nn: '20',
    slug: 'planner-event-form',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openPlanner(page);
      await page.getByRole('button', { name: /^New event, / }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();
    },
  },
  {
    nn: '21',
    slug: 'series-scope-dialog',
    window: 'config',
    quiet: true,
    reach: async (page, context) => {
      await fulfillPlannerFixture(context, [plannerRow(FIXTURE_SERIES_EVENT_ID, FIXTURE_SERIES_TITLE, 'event', FIXTURE_SERIES_ID)]);
      await openPlanner(page);
      await page.getByText(FIXTURE_SERIES_TITLE).first().click();
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      const scope = page.getByRole('dialog', { name: 'Delete repeating event' });
      if (!(await scope.isVisible())) {
        // Delete asks once before it removes anything; the answer opens the scope dialog.
        await page.getByRole('button', { name: /^(Yes|Confirm|Delete)/ }).last().click();
      }
      await expect(scope).toBeVisible();
    },
  },
  {
    nn: '22',
    slug: 'search',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await page.getByRole('combobox', { name: 'Search materials' }).fill('syllabus');
      await page.waitForTimeout(SETTLE_MS);
    },
  },
  {
    nn: '23',
    slug: 'bell',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/');
      await announcementsButton(page).click();
      await expect(page.getByRole('menu', { name: 'Announcements' })).toBeVisible();
    },
  },
  {
    nn: '24',
    slug: 'activity',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/');
      await activityButton(page).click();
      await expect(page.getByRole('menu').filter({ hasText: 'Activity' })).toBeVisible();
    },
  },
  {
    nn: '25',
    slug: 'account-menu',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/');
      await page.getByRole('button', { name: 'Account', exact: true }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      // The theme control is W-67's component, mounted in this menu by W-68 (task 10).
      await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();
      await expect(page.getByRole('menuitemradio')).toHaveCount(3);
    },
  },
  {
    nn: '26',
    slug: 'courses-sidebar',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/', RAIL_WIDTH);
      await expect(page.locator('#course-sidebar')).toBeVisible();
      // The shot is the drawer and its scrim at 800 px.
      await page.setViewportSize(DRAWER_WIDTH);
      await page.waitForTimeout(RESIZE_SETTLE_MS);
      const toggle = page.getByRole('button', { name: 'Courses sidebar', exact: true });
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      await expect(page.locator('#course-sidebar')).toBeVisible();
    },
  },
  {
    nn: '27',
    slug: 'nav-menu',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/', PHONE);
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(page.locator('#primary-nav-menu')).toBeVisible();
    },
  },
  {
    nn: '28',
    slug: 'sync-toast',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/');
      await page.getByTestId('sync-button').click();
      await expect(page.getByTestId('sync-button').locator('xpath=..').getByRole('status')).toBeVisible();
    },
  },
  {
    nn: '29',
    slug: 'error-notice',
    window: 'config',
    quiet: true,
    reach: async (page, context) => {
      await coldCache(context);
      await failReads(context, ['attention_items']);
      await openAt(page, '/inbox');
      // Inbox.module.css `.problem` composes the shared notice, which is the red one.
      await expect(page.locator('[class*="problem"]').first()).toBeVisible();
    },
  },
  {
    nn: '30',
    slug: 'planner-wizard',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openPlanner(page);
      await page.getByRole('button', { name: 'New event', exact: true }).click();
      const wizard = page.getByRole('dialog', { name: 'New planner event' });
      await expect(wizard).toBeVisible();
      await wizard.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(wizard).toBeVisible();
    },
  },
  {
    nn: '31',
    slug: 'frame-scrolled',
    window: 'config',
    quiet: true,
    reach: async (page) => {
      await openAt(page, '/grades');
      const pane = page.locator('main').first();
      await pane.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      const facts = await page.evaluate(() => {
        const pane = document.querySelector('main');
        const bar = document.querySelector('nav');
        return {
          documentHeight: document.documentElement.scrollHeight,
          windowHeight: window.innerHeight,
          paneScrollTop: pane?.scrollTop ?? 0,
          barTop: bar?.getBoundingClientRect().top ?? Number.NaN,
        };
      });
      console.log(`31 frame-scrolled: ${JSON.stringify(facts)}`);
      expect(facts.documentHeight, 'the document is as tall as the window and no taller').toBeLessThanOrEqual(facts.windowHeight);
      expect(facts.paneScrollTop, 'the pane scrolled').toBeGreaterThan(0);
      expect(facts.barTop, "the top bar's top edge").toBe(0);
    },
  },
];

/* ---------------------------------------------------------------------------
 * The 62 surface cases
 * ------------------------------------------------------------------------ */

for (const surface of SURFACES) {
  for (const theme of THEMES) {
    test(`${surface.nn} ${surface.slug} [${theme}]`, async ({ page, context }) => {
      const hydration = collectHydrationMessages(page);
      await useTheme(context, theme);
      if (surface.quiet === true) await quietSync(context);

      await surface.reach(page, context);

      // The theme is the one the case asked for, stamped before paint.
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await bodyFontLoaded(page);
      if (surface.window === 'tall') await growWindowToContent(page);

      if (shotsAsked22()) {
        await page.screenshot({
          path: shotPath22(`${surface.nn}-${surface.slug}-${theme}.png`),
          fullPage: surface.window === 'document',
        });
      }
      expect(hydration, `${surface.nn} ${surface.slug} [${theme}]: hydration messages`).toEqual([]);
    });
  }
}

/* ---------------------------------------------------------------------------
 * The two cases that are not surfaces
 * ------------------------------------------------------------------------ */

test('motion off under reduced motion', async ({ page, context }) => {
  await quietSync(context);
  await openAt(page, '/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  // The first frame of the panel: at rest, with no transition running.
  const first = await menu.evaluate((element) => {
    const style = getComputedStyle(element);
    return { opacity: style.opacity, duration: style.transitionDuration };
  });
  expect(first.opacity, "the panel's opacity on its first frame").toBe('1');
  expect(first.duration.split(',').every((part) => part.trim() === '0s'), `transition-duration ${first.duration}`).toBe(true);
  const exit = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-exit').trim());
  // The build's minifier writes a zero time as `0s`; both spellings are zero.
  expect(exit, 'the exit duration under reduced motion').toMatch(/^0(ms|s)$/);
});

test('planner targets', async ({ page, context }) => {
  await quietSync(context);
  await fulfillPlannerFixture(context, [plannerRow(FIXTURE_TASK_EVENT_ID, FIXTURE_TASK_TITLE, 'task', null)]);
  await openPlanner(page);
  const title = page.getByText(FIXTURE_TASK_TITLE).first();
  await expect(title).toBeVisible();
  const box = await title.boundingBox();
  if (box === null) throw new Error('the fixture task has no box');

  // The element at the title's first pixel is the title and not the done box; the element at the
  // done box's centre is the checkbox. The press is on the title only: the done box is never pressed.
  const block = title.locator('xpath=ancestor-or-self::*[.//input[@type="checkbox"]][1]');
  const checkbox = block.locator('input[type="checkbox"]').first();
  const check = await checkbox.boundingBox();
  if (check === null) throw new Error('the fixture task has no done box');
  const hit = await page.evaluate(
    ([titleX, titleY, boxX, boxY]: readonly number[]) => {
      const at = (x: number, y: number): string => {
        const element = document.elementFromPoint(x, y);
        return element === null ? 'none' : `${element.tagName.toLowerCase()}${element instanceof HTMLInputElement ? `[${element.type}]` : ''}`;
      };
      return { atTitle: at(titleX, titleY), atBox: at(boxX, boxY) };
    },
    [box.x + 1, box.y + box.height / 2, check.x + check.width / 2, check.y + check.height / 2] as const,
  );
  console.log(`planner targets: ${JSON.stringify(hit)}`);
  expect(hit.atBox, "the element at the done box's centre").toBe('input[checkbox]');
  expect(hit.atTitle, "the element at the title's first pixel is not the checkbox").not.toBe('input[checkbox]');

  await page.mouse.click(box.x + 1, box.y + box.height / 2);
  await expect(page.getByRole('dialog')).toBeVisible();
});
