/**
 * Phase 22's phone-width walk (brief 103, task 5; R-46, P-79). Written first, run RED before the
 * nav fold, and the proof of tasks 12 to 16: 54 cases, titles frozen so `-g` can pick them.
 *
 *   node scripts/walk-box.mjs web/e2e/phone-width.spec.ts [-- -g "open state"]
 *
 * It asserts widths and positions only, and reads: every case takes `test` from `./walk22.lib`,
 * whose automatic fixture guards the context, and every route and open-state case pins the Sync
 * label with `quietSync` (idle unless the case is about the longest label).
 *
 * Reduced motion is emulated for the whole file. A panel mounts see-through and scaled, and a rect
 * read on its first frame is true only when motion is off (brief 103, amendment 3, H-6).
 *
 * Themes. The default is Dark, so a `[dark]` case stores nothing. A `[light]` case puts `light` in
 * `localStorage['bb2dash.theme']` before its first load, because an emulated light system no
 * longer makes the page light. Nothing reads that key before task 9, so until then both cases
 * render today's dark and only widths are asserted.
 *
 * Fonts. `globals.css` loads the body face with `display=swap`, so a bar measured in the fallback
 * face is narrower than the real one. Every case that reads a width first waits for the first
 * family of `--font-body` to hold a face with status `loaded` (`document.fonts.check()` also
 * answers true when the file never arrived, so it is not used).
 */

import { type BrowserContext, type Locator, type Page } from '@playwright/test';
import { A1_POPOUT, fulfillView, openSignedIn } from './walk';
import { LONGEST_SYNC_PHASE_22, SYNC_LABEL_22, expect, quietSync, test } from './walk22.lib';

test.use({ reducedMotion: 'reduce' });

/* ---------------------------------------------------------------------------
 * What the cases share
 * ------------------------------------------------------------------------ */

const PHONE = { width: 390, height: 844 } as const;
const FOLD_STEP = { width: 721, height: 900 } as const;
const DESKTOP_MINIMUM = { width: 900, height: 700 } as const;

/** The app polls, so 'networkidle' never fires; this lets the cold reads land. */
const SETTLE_MS = 2500;
/** A font file from the network can take a while in a cold box. */
const FONT_WAIT_MS = 30_000;
/** A rect read is rounded to this many decimals when it is printed. */
const PRINT_DECIMALS = 1;

const THEME_KEY = 'bb2dash.theme';
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

/**
 * Activity and Announcements carry a count badge when something is unseen, and the badge is part of
 * the accessible name ("Activity 44"). They are found by role and a name that allows the count: a
 * substring match (not exact), so it also survives the title coming off the bar's icon buttons.
 */
const ACTIVITY_NAME = 'Activity';
const ANNOUNCEMENTS_NAME = 'Announcements';

const NAV_LINK_LABELS = ['Home', 'Planner', 'Inbox', 'Grades', 'Materials', 'Workspace'] as const;

/** Row 01 to 16 of the brief's inventory, in order: the path of each. */
const ROUTES = [
  '/',
  '/planner',
  '/inbox',
  '/announcements',
  '/grades',
  '/materials',
  '/course/IST.352/stream',
  '/course/IST.471/classwork',
  '/course/IST.466/grades',
  '/course/IST.466/info',
  '/course/IST.471/assignment/IST.471/a1-proposal',
  '/workspace',
  '/login',
  '/privacy',
  '/terms',
  '/no-such-page',
] as const;

/** Inventory row 12's fixture: one answered question, in sample text. Nothing is read from the database. */
const WORKSPACE_CONVERSATION = '22222222-2222-4222-8222-222222222201';
const WORKSPACE_QUESTION = '22222222-2222-4222-8222-222222222202';
const WORKSPACE_ANSWER = '22222222-2222-4222-8222-222222222203';
const WORKSPACE_REQUEST_ID = 22_001;
const WORKSPACE_PATH = `/workspace?c=${WORKSPACE_CONVERSATION}`;

/**
 * The two boxes that scroll sideways so the page does not, by their frozen hooks (brief 103,
 * "Panels and wide content"): the gradebook's wrapper and the planner's board.
 */
const SCROLL_BOXES: Readonly<Record<string, string>> = {
  '/course/IST.466/grades': '[data-scroll-box="gradebook"]',
  '/planner': '[data-planner-board="true"]',
};

/** The path a route case opens: the `/workspace` case opens row 12's conversation. */
function addressOf(path: (typeof ROUTES)[number]): string {
  return path === '/workspace' ? WORKSPACE_PATH : path;
}

async function useTheme(context: BrowserContext, theme: Theme): Promise<void> {
  if (theme !== 'light') return;
  await context.addInitScript(
    ([key, value]: readonly [string, string]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Storage disabled: the page keeps its default theme, and only widths are asserted.
      }
    },
    [THEME_KEY, 'light'] as const,
  );
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

/** Waits for the first family of `--font-body` to hold a loaded face, and says which family it was. */
async function bodyFontLoaded(page: Page): Promise<string> {
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
  return family;
}

/** Opens a signed-in address at a viewport, settles, and waits for the body font. */
async function openAt(page: Page, viewport: { width: number; height: number }, address: string): Promise<void> {
  await page.setViewportSize(viewport);
  await openSignedIn(page, address);
  await page.waitForLoadState('load');
  await page.waitForTimeout(SETTLE_MS);
  await bodyFontLoaded(page);
}

function pageScrollWidth(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth);
}

function navOf(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Primary' });
}

function navScrollWidth(page: Page): Promise<number> {
  return navOf(page).evaluate((element) => element.scrollWidth);
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

async function rectOf(target: Locator): Promise<Rect> {
  return target.evaluate((element) => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    return { left, right, top, bottom };
  });
}

const printed = (value: number): string => value.toFixed(PRINT_DECIMALS);

/** Prints and asserts that a visible element lies inside the viewport horizontally. */
async function expectInsideViewport(page: Page, label: string, target: Locator): Promise<Rect> {
  await expect(target, `${label} is visible`).toBeVisible();
  const rect = await rectOf(target);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  console.log(`${label}: left=${printed(rect.left)} right=${printed(rect.right)} innerWidth=${innerWidth}`);
  expect(rect.left, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(rect.right, `${label} right edge (innerWidth ${innerWidth})`).toBeLessThanOrEqual(innerWidth);
  return rect;
}

/* ---------------------------------------------------------------------------
 * Routes: every inventory row 01 to 16 at 390 px, in both themes
 * ------------------------------------------------------------------------ */

for (const path of ROUTES) {
  for (const theme of THEMES) {
    test(`route ${path} [${theme}]`, async ({ page, context }) => {
      await useTheme(context, theme);
      const signedOut = path === '/login';
      if (!signedOut) await quietSync(context);
      if (path === '/workspace') await fulfillWorkspaceFixture(context);

      if (signedOut) {
        // The app's session cookies are removed, so /login stays the login page.
        await context.clearCookies();
        await page.setViewportSize(PHONE);
        await page.goto(path);
        await expect(page).toHaveURL(/\/login(\?|$)/);
        await page.waitForLoadState('load');
        await page.waitForTimeout(SETTLE_MS);
        await bodyFontLoaded(page);
      } else {
        await openAt(page, PHONE, addressOf(path));
      }

      const scrollWidth = await pageScrollWidth(page);
      console.log(`route ${path} [${theme}]: page scrollWidth=${scrollWidth}`);
      expect(scrollWidth, `route ${path} [${theme}]: page scrollWidth`).toBeLessThanOrEqual(PHONE.width);

      const boxSelector = SCROLL_BOXES[path];
      if (boxSelector !== undefined) {
        // The table or the week is wider than the phone, so it must scroll inside its own box.
        const box = page.locator(boxSelector).first();
        await expect(box, `route ${path} [${theme}]: the scroll box ${boxSelector}`).toBeVisible();
        const { scroll, client } = await box.evaluate((element) => ({
          scroll: element.scrollWidth,
          client: element.clientWidth,
        }));
        console.log(`route ${path} [${theme}]: box scrollWidth=${scroll} clientWidth=${client}`);
        expect(scroll, `route ${path} [${theme}]: box scrollWidth above its clientWidth`).toBeGreaterThan(client);
      }
    });
  }
}

/* ---------------------------------------------------------------------------
 * The assignment popout (inventory row 17) at 390 px
 * ------------------------------------------------------------------------ */

for (const theme of THEMES) {
  test(`popout assignment [${theme}]`, async ({ page, context }) => {
    await useTheme(context, theme);
    await quietSync(context);
    await openAt(page, PHONE, A1_POPOUT);

    await expectInsideViewport(page, `popout assignment [${theme}] dialog`, page.getByRole('dialog'));
    const scrollWidth = await pageScrollWidth(page);
    console.log(`popout assignment [${theme}]: page scrollWidth=${scrollWidth}`);
    expect(scrollWidth, `popout assignment [${theme}]: page scrollWidth`).toBeLessThanOrEqual(PHONE.width);
  });
}

/* ---------------------------------------------------------------------------
 * The seven open states of the brief, on `/` at 390 px
 * ------------------------------------------------------------------------ */

/** The press of Sync that answers with an error, registered after `quietSync` so it is asked first. */
async function failTheSyncPress(context: BrowserContext): Promise<void> {
  await context.route(
    (url) => url.pathname.endsWith('/rest/v1/agent_requests'),
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ message: 'the walk answers this press with an error' }),
      });
    },
  );
}

/** The Sync button's own box, which holds its toast and its alert. */
function syncWrap(page: Page): Locator {
  return page.getByTestId('sync-button').locator('xpath=..');
}

interface OpenState {
  n: number;
  name: string;
  /** Opens the state and returns the elements that must lie inside the viewport, labelled. */
  open: (page: Page, context: BrowserContext) => Promise<Record<string, Locator>>;
  /** Also asserted: the nav does not scroll sideways with the state open (state 7). */
  navMustFit?: boolean;
}

const OPEN_STATES: readonly OpenState[] = [
  {
    n: 1,
    name: 'bell',
    open: async (page) => {
      await page.getByRole('button', { name: ANNOUNCEMENTS_NAME }).click();
      return { panel: page.getByRole('menu', { name: 'Announcements' }) };
    },
  },
  {
    n: 2,
    name: 'activity',
    open: async (page) => {
      await page.getByRole('button', { name: ACTIVITY_NAME }).click();
      return { panel: page.getByRole('menu').filter({ hasText: 'Activity' }) };
    },
  },
  {
    n: 3,
    name: 'account',
    open: async (page) => {
      await page.getByRole('button', { name: 'Account', exact: true }).click();
      return { panel: page.getByRole('menu') };
    },
  },
  {
    n: 4,
    name: 'nav-menu',
    open: async (page) => {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      return { panel: page.locator('#primary-nav-menu') };
    },
  },
  {
    n: 5,
    name: 'sync-toast',
    open: async (page) => {
      await page.getByTestId('sync-button').click();
      return { toast: syncWrap(page).getByRole('status') };
    },
  },
  {
    n: 6,
    name: 'sync-error',
    open: async (page, context) => {
      await failTheSyncPress(context);
      await page.getByTestId('sync-button').click();
      return { toast: syncWrap(page).getByRole('alert') };
    },
  },
  {
    n: 7,
    name: 'search',
    navMustFit: true,
    open: async (page) => {
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      const field = page.getByRole('combobox', { name: 'Search materials' });
      await field.fill('syllabus');
      const pill = field.locator('xpath=..');
      return { pill, popover: pill.locator(':scope > div') };
    },
  },
];

for (const state of OPEN_STATES) {
  for (const theme of THEMES) {
    test(`open state ${state.n} ${state.name} [${theme}]`, async ({ page, context }) => {
      await useTheme(context, theme);
      await quietSync(context);
      await openAt(page, PHONE, '/');

      const shown = await state.open(page, context);
      for (const [part, target] of Object.entries(shown)) {
        await expectInsideViewport(page, `open state ${state.n} ${state.name} [${theme}] ${part}`, target);
      }
      if (state.navMustFit === true) {
        const scrollWidth = await navScrollWidth(page);
        console.log(`open state ${state.n} ${state.name} [${theme}]: nav scrollWidth=${scrollWidth}`);
        expect(scrollWidth, `open state ${state.n}: nav scrollWidth with search open`).toBeLessThanOrEqual(PHONE.width);
      }
    });
  }
}

/* ---------------------------------------------------------------------------
 * Reachability: every control of the bar can be pressed at 390 px
 * ------------------------------------------------------------------------ */

/** The bar's seven controls at phone width, by role and name (Sync by its test id). */
function barControls(page: Page): Record<string, Locator> {
  return {
    Menu: page.getByRole('button', { name: 'Menu', exact: true }),
    Sync: page.getByTestId('sync-button'),
    Search: page.getByRole('button', { name: 'Search', exact: true }),
    'Courses sidebar': page.getByRole('button', { name: 'Courses sidebar', exact: true }),
    Activity: page.getByRole('button', { name: ACTIVITY_NAME }),
    Announcements: page.getByRole('button', { name: ANNOUNCEMENTS_NAME }),
    Account: page.getByRole('button', { name: 'Account', exact: true }),
  };
}

/** Inside the viewport, and the element at its centre is the element itself (nothing lies over it). */
async function expectReachable(page: Page, label: string, target: Locator): Promise<void> {
  await expectInsideViewport(page, label, target);
  const covered = await target.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    const hit = document.elementFromPoint(left + width / 2, top + height / 2);
    return hit === null || !(hit === element || element.contains(hit));
  });
  expect(covered, `${label}: something lies over its centre`).toBe(false);
}

for (const theme of THEMES) {
  test(`reachability [${theme}]`, async ({ page, context }) => {
    await useTheme(context, theme);
    await quietSync(context);
    await openAt(page, PHONE, '/');

    for (const [name, control] of Object.entries(barControls(page))) {
      await expectReachable(page, `reachability [${theme}] ${name}`, control);
    }

    // Menu lists the six pages, and each can be pressed.
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    const menu = page.locator('#primary-nav-menu');
    for (const label of NAV_LINK_LABELS) {
      await expectReachable(page, `reachability [${theme}] ${label} link`, menu.getByRole('link', { name: label, exact: true }));
    }
    await menu.getByRole('link', { name: 'Planner', exact: true }).click();
    await expect(page).toHaveURL(/\/planner(\?|$)/);
  });
}

/* ---------------------------------------------------------------------------
 * The sidebar toggle, and the bar at three widths
 * ------------------------------------------------------------------------ */

test('sidebar toggle', async ({ page, context }) => {
  await quietSync(context);
  await openAt(page, PHONE, '/');

  const toggle = page.getByRole('button', { name: 'Courses sidebar', exact: true });
  await expect(toggle).toHaveAttribute('aria-controls', 'course-sidebar');
  const before = await page.evaluate(() => document.documentElement.getAttribute('data-sidebar'));
  await toggle.click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-sidebar')), {
      message: `html[data-sidebar] after the press (it was ${String(before)})`,
    })
    .not.toBe(before);
});

test('unfolded bar at 721', async ({ page, context }) => {
  await quietSync(context);
  await openAt(page, FOLD_STEP, '/');

  await expect(navOf(page)).toBeVisible();
  const scrollWidth = await navScrollWidth(page);
  // Recorded, not asserted: open item 3 of the brief wants the number.
  console.log(`unfolded bar at 721: nav scrollWidth=${scrollWidth}`);
});

test('bar at 390 longest label', async ({ page, context }) => {
  await quietSync(context, LONGEST_SYNC_PHASE_22);
  await openAt(page, PHONE, '/');

  await expect(page.getByTestId('sync-button')).toContainText(SYNC_LABEL_22[LONGEST_SYNC_PHASE_22]);
  const scrollWidth = await navScrollWidth(page);
  console.log(`bar at 390 longest label: nav scrollWidth=${scrollWidth}`);
  expect(scrollWidth, 'bar at 390 longest label: nav scrollWidth').toBeLessThanOrEqual(PHONE.width);
});

test('bar at 900 longest label', async ({ page, context }) => {
  await quietSync(context, LONGEST_SYNC_PHASE_22);
  await openAt(page, DESKTOP_MINIMUM, '/');

  await expect(page.getByTestId('sync-button')).toContainText(SYNC_LABEL_22[LONGEST_SYNC_PHASE_22]);
  // Search is collapsed: its field is not mounted.
  await expect(page.getByRole('combobox', { name: 'Search materials' })).toHaveCount(0);
  const scrollWidth = await navScrollWidth(page);
  console.log(`bar at 900 longest label: nav scrollWidth=${scrollWidth}`);
  expect(scrollWidth, 'bar at 900 longest label: nav scrollWidth').toBeLessThanOrEqual(DESKTOP_MINIMUM.width);
});

