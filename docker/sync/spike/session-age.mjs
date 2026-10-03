// Phase 14 task 4 — the noVNC spike's only program. Deleted in task 15.
//
// It opens Chromium on the container's display with the persistent `bb-profile`, lands on Blackboard
// Ultra, and then, for as long as the container runs:
//   * logs every host the top frame passes through (the `LOGIN_HOSTS:` line in 82b comes from this);
//   * keeps the login alive (Stack, 2026-10-03): every KEEPALIVE_MINUTES, give or take JITTER_MINUTES, it
//     loads the next read-only Ultra page in KEEPALIVE_PAGES, then logs `users/me <status> …`;
//   * on a dead probe it loads Ultra once and lets a Microsoft redirect finish, so a login whose
//     Blackboard session lapsed while the Microsoft sign-in is still valid comes back without Stack;
//   * while the login stays dead it only probes, every LOGIN_WATCH_SECONDS, and never navigates, so the
//     sign-in page Stack types into through noVNC is left alone.
// Nothing here types, clicks or reads a credential.

import { chromium } from 'playwright';

const BLACKBOARD_ORIGIN = 'https://blackboard.syracuse.edu';
const START_URL = `${BLACKBOARD_ORIGIN}/ultra/`;
const PROBE_URL = `${BLACKBOARD_ORIGIN}/learn/api/public/v1/users/me`;
/** Read-only pages, visited in turn. Never a course page, a form or anything that records an action. */
const KEEPALIVE_PAGES = ['/ultra/course', '/ultra/stream', '/ultra/calendar', '/ultra/institution-page'];
const PROFILE_DIR = process.env.BB_PROFILE_DIR ?? '/home/pwuser/bb-profile';
const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1_000;
const PROBE_TIMEOUT_MS = 30_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
/** Time for Ultra's own scripts, and any sign-in redirect, to settle after a load. */
const SETTLE_MS = 15_000;
const HTTP_OK = 200;

/** A positive number from the environment, bounded so `setTimeout` never overflows 32 bits. */
function envNumber(name, fallback, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${name} must be a number from 0 to ${max}, got ${JSON.stringify(raw)}`);
  }
  return value;
}

const KEEPALIVE_MINUTES = envNumber('KEEPALIVE_MINUTES', 20, 1440);
const JITTER_MINUTES = envNumber('JITTER_MINUTES', 3, 60);
const LOGIN_WATCH_SECONDS = envNumber('LOGIN_WATCH_SECONDS', 60, 3600);
if (KEEPALIVE_MINUTES <= JITTER_MINUTES) {
  throw new Error('KEEPALIVE_MINUTES must be larger than JITTER_MINUTES');
}

function log(line) {
  process.stdout.write(`${line}\n`);
}

function firstLine(error) {
  return error instanceof Error ? error.message.split('\n')[0] : String(error);
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextKeepaliveMs() {
  const jitter = (Math.random() * 2 - 1) * JITTER_MINUTES;
  return Math.round((KEEPALIVE_MINUTES + jitter) * MS_PER_MINUTE);
}

async function main() {
  const startedAt = Date.now();
  const elapsed = () => `+${Math.round((Date.now() - startedAt) / MS_PER_MINUTE)}m`;
  log(`session-age: start ${new Date(startedAt).toISOString()} keepalive=${KEEPALIVE_MINUTES}±${JITTER_MINUTES}m watch=${LOGIN_WATCH_SECONDS}s profile=${PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    // P-102: the sandbox stays on. Playwright defaults this to false and would add --no-sandbox itself.
    chromiumSandbox: true,
    viewport: null,
    args: ['--window-position=0,0', '--window-size=1440,900', '--hide-crash-restore-bubble'],
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

  async function probe(label) {
    try {
      const response = await context.request.get(PROBE_URL, {
        maxRedirects: 0,
        timeout: PROBE_TIMEOUT_MS,
        failOnStatusCode: false,
      });
      log(`users/me ${response.status()} ${new Date().toISOString()} ${elapsed()} ${label}`);
      return response.status();
    } catch (error) {
      log(`users/me error ${new Date().toISOString()} ${elapsed()} ${label} ${firstLine(error)}`);
      return null;
    }
  }

  async function visit(path, label) {
    try {
      await page.goto(`${BLACKBOARD_ORIGIN}${path}`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      await sleep(SETTLE_MS);
      const landed = new URL(page.url());
      log(`${label} ${path} -> ${landed.host}${landed.pathname} ${new Date().toISOString()} ${elapsed()}`);
    } catch (error) {
      log(`${label} ${path} failed ${new Date().toISOString()} ${elapsed()} ${firstLine(error)}`);
    }
  }

  let stopping = false;
  const stop = async (signal) => {
    stopping = true;
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
    // A requested stop closes the browser too; only an unasked close is a crash.
    if (stopping) return;
    log('session-age: the browser closed; exiting so the container restarts it');
    process.exit(1);
  });

  await visit('/ultra/', 'start');
  let alive = (await probe('start')) === HTTP_OK;
  let pageIndex = 0;

  while (!stopping) {
    if (alive) {
      await sleep(nextKeepaliveMs());
      if (stopping) break;
      await visit(KEEPALIVE_PAGES[pageIndex % KEEPALIVE_PAGES.length], 'keepalive');
      pageIndex += 1;
      alive = (await probe('after-keepalive')) === HTTP_OK;
      if (!alive) {
        // One load of Ultra lets a still-valid Microsoft sign-in log Blackboard back in by itself.
        await visit('/ultra/', 'reauth');
        alive = (await probe('after-reauth')) === HTTP_OK;
        if (!alive) log(`session-age: login dead at ${new Date().toISOString()} ${elapsed()}; waiting for Stack`);
      }
    } else {
      await sleep(LOGIN_WATCH_SECONDS * MS_PER_SECOND);
      if (stopping) break;
      alive = (await probe('watch')) === HTTP_OK;
      if (alive) log(`session-age: login back at ${new Date().toISOString()} ${elapsed()}`);
    }
  }
}

main().catch((error) => {
  log(`session-age: launch failed: ${firstLine(error)}`);
  process.exit(1);
});
