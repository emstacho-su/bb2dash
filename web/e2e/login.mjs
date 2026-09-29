/**
 * Save a signed-in session for the walk harness (Phase 17, T-01).
 *
 *   cd web
 *   WALK_BASE_URL=https://<preview-host> node e2e/login.mjs
 *
 * Opens headed Chromium at `<WALK_BASE_URL>/login` (default
 * `http://localhost:3000`, the local `next dev` server) and waits for Stack or
 * the PM to sign in by hand. Nothing here types a credential. Once the browser
 * has left `/login`, the session is written to `e2e/.auth/state.json`, which
 * `web/.gitignore` ignores and which is deleted at phase end.
 *
 * The saved cookie belongs to that host only; a run against another host
 * signs in again with that host's `WALK_BASE_URL`.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.WALK_BASE_URL ?? 'http://localhost:3000';
const STATE_PATH = fileURLToPath(new URL('./.auth/state.json', import.meta.url));

/** Long enough to type a password; short enough that a forgotten window ends. */
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

async function main() {
  const loginUrl = new URL('/login', BASE_URL).toString();
  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    // A protected Vercel preview answers with its SSO wall. A share token from the Vercel
    // connector (`get_access_to_vercel_url`) sets the bypass cookie first; the cookie then
    // rides in the saved state, so the specs reuse it. Never commit the token.
    const shareToken = process.env.WALK_VERCEL_SHARE;
    if (shareToken) {
      const shareUrl = new URL('/', BASE_URL);
      shareUrl.searchParams.set('_vercel_share', shareToken);
      await page.goto(shareUrl.toString());
    }
    await page.goto(loginUrl);
    console.log(`Sign in at ${loginUrl} — waiting up to ${SIGN_IN_TIMEOUT_MS / 60000} minutes.`);

    // Done only when the browser is back on the app's own host and past /login: a redirect to
    // an SSO page on another host must not count as signed in.
    const appHost = new URL(BASE_URL).host;
    await page.waitForURL((url) => url.host === appHost && !url.pathname.startsWith('/login'), {
      timeout: SIGN_IN_TIMEOUT_MS,
    });
    // Not 'networkidle': the app polls (query refetch, heartbeat), so the network never goes quiet.
    await page.waitForLoadState('load');

    mkdirSync(dirname(STATE_PATH), { recursive: true });
    await context.storageState({ path: STATE_PATH });
    console.log(`Session saved to ${STATE_PATH} for ${new URL(BASE_URL).host}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`login.mjs failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
