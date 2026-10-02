// Phase 14 task 4 — the noVNC spike's only program. Deleted in task 15.
//
// It opens Chromium on the container's display with the persistent `bb-profile`, lands on Blackboard
// Ultra, and then does two things for as long as the container runs:
//   * logs every host the top frame passes through (the `LOGIN_HOSTS:` line in 82b comes from this), and
//   * logs `users/me <status> <iso time> +<minutes since start>` every PROBE_MINUTES.
// Stack logs in by hand through noVNC. Nothing here types, clicks or reads a credential.
//
// The probe is a request from the browser's own cookie jar, so each probe also touches the session:
// the overnight log measures a login touched every PROBE_MINUTES, not an untouched one.

import { chromium } from 'playwright';

const BLACKBOARD_ORIGIN = 'https://blackboard.syracuse.edu';
const START_URL = `${BLACKBOARD_ORIGIN}/ultra/`;
const PROBE_URL = `${BLACKBOARD_ORIGIN}/learn/api/public/v1/users/me`;
const PROFILE_DIR = process.env.BB_PROFILE_DIR ?? '/home/pwuser/bb-profile';
const DEFAULT_PROBE_MINUTES = 30;
const MS_PER_MINUTE = 60_000;
const PROBE_TIMEOUT_MS = 30_000;
const NAVIGATION_TIMEOUT_MS = 60_000;

function probeMinutes() {
  const raw = process.env.PROBE_MINUTES;
  if (raw === undefined || raw === '') return DEFAULT_PROBE_MINUTES;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`PROBE_MINUTES must be a positive number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function probe(context, startedAt) {
  const elapsed = Math.round((Date.now() - startedAt) / MS_PER_MINUTE);
  const at = new Date().toISOString();
  try {
    const response = await context.request.get(PROBE_URL, {
      maxRedirects: 0,
      timeout: PROBE_TIMEOUT_MS,
      failOnStatusCode: false,
    });
    log(`users/me ${response.status()} ${at} +${elapsed}m`);
  } catch (error) {
    log(`users/me error ${at} +${elapsed}m ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

async function main() {
  const intervalMs = probeMinutes() * MS_PER_MINUTE;
  const startedAt = Date.now();
  log(`session-age: start ${new Date(startedAt).toISOString()} probe=${intervalMs / MS_PER_MINUTE}m profile=${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    // P-102: the sandbox stays on. Playwright defaults this to false and would add --no-sandbox itself.
    chromiumSandbox: true,
    viewport: null,
    args: ['--window-position=0,0', '--window-size=1440,900'],
  });

  const seenHosts = new Set();
  const page = context.pages()[0] ?? (await context.newPage());
  context.on('page', (opened) => watch(opened));
  watch(page);

  function watch(target) {
    target.on('framenavigated', (frame) => {
      if (frame !== target.mainFrame()) return;
      const host = hostOf(frame.url());
      if (host === null || host === '' || seenHosts.has(host)) return;
      seenHosts.add(host);
      log(`host ${host} ${new Date().toISOString()}`);
    });
  }

  try {
    await page.goto(START_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    log(`session-age: first load failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }

  await probe(context, startedAt);
  const timer = setInterval(() => {
    probe(context, startedAt).catch((error) => log(`session-age: probe crashed: ${String(error)}`));
  }, intervalMs);

  const stop = async (signal) => {
    clearInterval(timer);
    log(`session-age: ${signal}, closing the browser so the profile is flushed`);
    try {
      await context.close();
    } catch (error) {
      log(`session-age: close failed: ${String(error)}`);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  context.on('close', () => {
    log('session-age: the browser closed; exiting so the container restarts it');
    process.exit(1);
  });
}

main().catch((error) => {
  log(`session-age: launch failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  process.exit(1);
});
