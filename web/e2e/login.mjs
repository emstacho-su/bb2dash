/**
 * Save a signed-in session for the walk harness (Phase 17, T-01).
 *
 *   cd web
 *   WALK_BASE_URL=https://<preview-host> node e2e/login.mjs
 *
 * Opens Chromium at `<WALK_BASE_URL>/login` (default `http://localhost:3000`,
 * the local `next dev` server). With the test login present (below) it fills
 * the form itself, headless; without it, it opens a headed window and waits
 * for a hand sign-in. Once the browser is back on the app's own host and past
 * `/login`, the session is written to `e2e/.auth/state.json`, which
 * `web/.gitignore` ignores and which is deleted at phase end.
 *
 * Test login: `TEST_USER_EMAIL` and `TEST_USER_PW` from the process
 * environment, else from `.env.testing` at the root of the checkout this file
 * lives in (gitignored by the root `.env.*` rule; the canonical copy is the
 * main checkout's, copied into a worktree like `.env.local`). The values are
 * typed into the form and never printed. `WALK_HEADED=1` shows the window.
 *
 * A protected Vercel preview answers with its SSO wall: pass
 * `WALK_VERCEL_SHARE` (a share token from the Vercel connector) to set the
 * bypass cookie first; it then rides in the saved state.
 *
 * The saved cookie belongs to that host only; a run against another host
 * signs in again with that host's `WALK_BASE_URL`.
 *
 * `WALK_STATE_PATH` (optional) saves the session to another file: an absolute
 * `.json` path outside this checkout. The acceptance run's host wrapper uses
 * it to give each sandbox stage a session of its own (`login-state.mjs`).
 * Without it the file is `e2e/.auth/state.json`, as before.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { statePathFrom } from './login-state.mjs';

const BASE_URL = process.env.WALK_BASE_URL ?? 'http://localhost:3000';
const CHECKOUT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STANDARD_STATE_PATH = fileURLToPath(new URL('./.auth/state.json', import.meta.url));
const TEST_ENV_FILE = join(CHECKOUT_ROOT, '.env.testing');

/** Long enough to type a password; short enough that a forgotten window ends. */
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;
/** A scripted sign-in either lands or has failed. */
const SCRIPTED_SIGN_IN_TIMEOUT_MS = 60 * 1000;

/** `KEY=value` (or `KEY: value`) lines; `#` comments and blanks skipped. */
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*[=:]\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function testLogin() {
  const file = readEnvFile(TEST_ENV_FILE);
  const email = process.env.TEST_USER_EMAIL ?? file.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PW ?? file.TEST_USER_PW;
  return email && password ? { email, password } : null;
}

async function main() {
  // Before any browser starts: a path that is refused costs no sign-in.
  const statePath = statePathFrom(process.env, { root: CHECKOUT_ROOT, standard: STANDARD_STATE_PATH });
  const login = testLogin();
  const headed = !login || process.env.WALK_HEADED === '1';
  const loginUrl = new URL('/login', BASE_URL).toString();
  const browser = await chromium.launch({ headless: !headed });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const shareToken = process.env.WALK_VERCEL_SHARE;
    if (shareToken) {
      const shareUrl = new URL('/', BASE_URL);
      shareUrl.searchParams.set('_vercel_share', shareToken);
      await page.goto(shareUrl.toString());
    }
    await page.goto(loginUrl);

    if (login) {
      console.log(`Signing in at ${loginUrl} with the test login (${TEST_ENV_FILE} or the environment).`);
      await page.locator('#email').fill(login.email);
      await page.locator('#password').fill(login.password);
      await page.getByRole('button', { name: /sign in/i }).click();
    } else {
      console.log(`No test login found; sign in by hand at ${loginUrl} — waiting up to ${SIGN_IN_TIMEOUT_MS / 60000} minutes.`);
    }

    // Done only when the browser is back on the app's own host and past /login: a redirect to
    // an SSO page on another host must not count as signed in.
    const appHost = new URL(BASE_URL).host;
    await page.waitForURL((url) => url.host === appHost && !url.pathname.startsWith('/login'), {
      timeout: login ? SCRIPTED_SIGN_IN_TIMEOUT_MS : SIGN_IN_TIMEOUT_MS,
    });
    // Not 'networkidle': the app polls (query refetch, heartbeat), so the network never goes quiet.
    await page.waitForLoadState('load');

    mkdirSync(dirname(statePath), { recursive: true });
    await context.storageState({ path: statePath });
    console.log(`Session saved to ${statePath} for ${appHost}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  // Never echo the form values: only the error's own message.
  console.error(`login.mjs failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
