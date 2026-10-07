/**
 * 08: the walk's conversation inside a second desktop shell instance (Phase 21's
 * walk, brief 102, task 22). The test is `08 desktop` in `walk21.spec.ts`.
 *
 * The instance is the worktree's `desktop/` build under its own
 * `--user-data-dir`, pointed at a local `next start` of the branch
 * (`WALK21_DESKTOP_APP_URL`). Its own profile is its own single-instance lock,
 * config, session and watermark: the running app and
 * `%APPDATA%\bb2dash\config.json` are not read, written or signalled.
 *
 * Not a spec: the config's `testMatch` takes `*.spec.ts` only.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { CHECKOUT_ROOT, MINUTE_MS, SETTLE_MS, textOrNull } from './walk21.lib';
import { expectDocumentFitsWindow, type WindowShot } from './walk21.window';

const DESKTOP_DIR = join(CHECKOUT_ROOT, 'desktop');
const DESKTOP_MAIN = join(DESKTOP_DIR, 'dist', 'main', 'index.js');
const DESKTOP_ELECTRON = join(DESKTOP_DIR, 'node_modules', 'electron', 'package.json');
/** Modules as `desktop/` resolves them, not as `web/` does. */
const requireFromDesktop = createRequire(join(DESKTOP_DIR, 'package.json'));

/**
 * The binary the worktree's `desktop/` installed: the `electron` package's entry point is that
 * path, as `desktop/test/e2e/launch.ts` reads it.
 */
function desktopElectronBinary(): string {
  const binary: unknown = requireFromDesktop('electron');
  if (typeof binary !== 'string' || !existsSync(binary)) throw new Error('desktop/node_modules holds no electron binary');
  return binary;
}

/** The installed app's name, `productName` in `desktop/package.json`: its folder under `%APPDATA%` is named for it. */
function installedProductName(): string {
  const manifest: unknown = requireFromDesktop('./package.json');
  const name = typeof manifest === 'object' && manifest !== null && 'productName' in manifest ? manifest.productName : null;
  if (typeof name !== 'string' || name === '') throw new Error('desktop/package.json names no productName');
  return name;
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
export interface ShellStart {
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  password: string;
}

/** Reads the shell's start values, and fails by name when one is missing. */
export function shellStart(): ShellStart {
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

/** The second instance, and the temp folder this test made for its profile. */
export interface SecondShell {
  app: ElectronApplication;
  userDataDir: string;
}

function removeProfile(userDataDir: string): void {
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

/** Starts the worktree's shell build as a second instance, under a new temp folder as its profile. */
export async function launchSecondShell(start: ShellStart): Promise<SecondShell> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'bb2dash-walk21-'));
  try {
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
    return { app, userDataDir };
  } catch (error) {
    // No instance holds the folder: it is removed here, since no `closeSecondShell` will follow.
    removeProfile(userDataDir);
    throw error;
  }
}

/** Closes the second instance, ending its process if it will not close, and removes its temp profile. */
export async function closeSecondShell(shell: SecondShell): Promise<void> {
  try {
    await shell.app.close();
  } catch (error) {
    console.log(`[walk21] the shell did not close cleanly; ending its process: ${error instanceof Error ? error.message : String(error)}`);
    shell.app.process().kill();
  }
  removeProfile(shell.userDataDir);
}

/** Signs in, in the shell's own window, the way `login.mjs` does in a browser. */
export async function signInToShell(window: Page, start: ShellStart): Promise<void> {
  await window.waitForLoadState('load');
  // A fresh profile has no session: the app sends the window to /login.
  await expect(window).toHaveURL(/\/login(\?|$)/, { timeout: MINUTE_MS });
  await window.locator('#email').fill(start.email);
  await window.locator('#password').fill(start.password);
  await window.getByRole('button', { name: /sign in/i }).click();
  await expect(window).not.toHaveURL(/\/login(\?|$)/, { timeout: MINUTE_MS });
}

/** Workspace from the top bar, then the walk's conversation from the list. Returns the conversation's row. */
export async function openConversationInShell(window: Page, conversation: string): Promise<Locator> {
  await window
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Workspace', exact: true })
    .click();
  await expect(window).toHaveURL(/\/workspace$/);
  const row = window.getByRole('navigation', { name: 'Conversations' }).locator(`a[href$="c=${conversation}"]`);
  await row.click();
  await expect(window).toHaveURL(new RegExp(`/workspace\\?c=${conversation}$`));
  await window.waitForTimeout(SETTLE_MS);
  return row;
}

/** What the running second instance says of itself, asked in its main process. */
export interface ShellFacts {
  /** The Electron version, or null when the process names none. */
  electron: string | null;
  /** `app.getPath('userData')`: the folder the instance itself uses as its profile. */
  ownProfile: string;
  /** `app.getPath('appData')`: the folder an installed app's profile stands in. */
  appData: string;
  packaged: boolean;
}

/** Asks the instance, and takes nothing it answers on trust: a folder it does not name fails here. */
export async function shellFacts(app: ElectronApplication): Promise<ShellFacts> {
  const said: Record<string, unknown> = await app.evaluate(({ app: electronApp }) => ({
    electron: process.versions.electron,
    ownProfile: electronApp.getPath('userData'),
    appData: electronApp.getPath('appData'),
    packaged: electronApp.isPackaged,
  }));
  const { electron: version, ownProfile, appData, packaged } = said;
  if (typeof ownProfile !== 'string' || ownProfile === '' || typeof appData !== 'string' || appData === '') {
    throw new Error('the second instance did not name its user-data folder and its app-data folder');
  }
  return { electron: typeof version === 'string' ? version : null, ownProfile, appData, packaged: packaged === true };
}

/** A path as Windows compares it: resolved, and there without regard to case. */
function pathKey(path: string): string {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Its own profile, asserted before anything is shot. The fact is the running instance's own
 * answer, not a path this test built: the folder IT uses is the temp folder it was started under,
 * and is not the installed app's (`%APPDATA%\bb2dash`), which the walk must not touch (the third
 * `/code-review`, R3-8).
 */
export function expectOwnProfile(facts: ShellFacts, userDataDir: string): void {
  const installed = join(facts.appData, installedProductName());
  expect(facts.ownProfile, "the second instance's own user-data folder is the temp folder it was started under").toBe(
    userDataDir,
  );
  expect(pathKey(facts.ownProfile), "the second instance's own user-data folder is not the installed app's").not.toBe(
    pathKey(installed),
  );
}

/**
 * What the 08 shot must show: the window is the desktop shell on the local build, the walk's
 * conversation is the selected one with its turns in the column and the last one on screen, and
 * W-1 holds in the shell's own window.
 */
export async function expectConversationInShell(window: Page, row: Locator, start: ShellStart, label: string): Promise<void> {
  // Inside the shell: the preload's bridge is there, which no browser has.
  expect(await window.evaluate(() => 'bb2dashDesktop' in globalThis), 'the window is the desktop shell').toBe(true);
  expect(new URL(window.url()).origin, 'the shell shows the local build of the branch').toBe(start.appUrl);
  await expect(window.getByRole('heading', { name: 'Workspace', level: 1 })).toBeVisible();
  // The same conversation: selected in the list, its turns in the column, the last one on screen.
  await expect(row).toHaveAttribute('aria-current', 'page');
  const title = ((await row.locator('span').first().textContent()) ?? '').trim();
  expect(title, 'the row has a title').not.toBe('');
  const turns = window.locator('li[data-turn]');
  await expect(turns.first()).toBeAttached();
  // A conversation's title is its first question (cut at 120 characters; the walk's are shorter).
  await expect(turns.first().getByText(title, { exact: true })).toBeAttached();
  await expect(turns.last().locator('[data-tier]')).toBeAttached();
  await expect(turns.last()).toBeInViewport();
  // The long conversation, and W-1 in the shell's own window: no page scrollbar with travel beyond 1 px.
  const layout = await expectDocumentFitsWindow(window, label);
  expect(layout.columnScrollHeight, 'the conversation is longer than its column').toBeGreaterThan(
    layout.columnClientHeight,
  );
  expect(layout.windowScrollY, 'the window itself is not scrolled').toBe(0);
}

/** The line printed for the 08 shot: what the window holds and what the instance is. Never an answer, never a start value. */
export async function desktopShotFacts(
  window: Page,
  facts: ShellFacts,
  userDataDir: string,
  shot: WindowShot,
): Promise<Record<string, unknown>> {
  const turns = window.locator('li[data-turn]');
  return {
    turns: await turns.count(),
    lastTurn: await turns.last().getAttribute('data-turn'),
    lastBadge: await textOrNull(turns.last().locator('[data-tier]')),
    ownProfileIsTheTempFolder: facts.ownProfile === userDataDir,
    electron: facts.electron,
    packaged: facts.packaged,
    shot: `${shot.width} by ${shot.height}`,
    devicePixelRatio: shot.devicePixelRatio,
  };
}
