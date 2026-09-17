/**
 * R2-4 — the session the poller may actually use.
 *
 * `index.ts` handed the poller a bare `readWebSession`, which returns whatever is in the
 * cookie jar including a token that expired hours ago. Every tick then sent that token, and
 * every PostgREST read came back 401 — logged once an hour by C-6's throttle, so silently
 * in practice. No toast fired again until the app was restarted.
 *
 * The second half is the nudge: supabase-js stops its auto-refresh timer while the document
 * is hidden, so a window hidden to the tray (C-12) never renews the cookie on its own. Main
 * reloads it, and the web app's own proxy rewrites the cookie. Main never calls the auth
 * API itself, so C-5 stands.
 *
 * `electron` is mocked; the cookie jar is the only thing faked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  cookies: [] as { name: string; value: string }[],
}));

vi.mock('electron', () => ({
  session: {
    fromPartition: () => ({
      cookies: {
        get: async () => fake.cookies,
      },
    }),
  },
}));

vi.mock('../../src/main/log', () => ({
  log: () => undefined,
  logError: () => undefined,
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

import {
  HIDDEN_RELOAD_MIN_INTERVAL_MS,
  createUsableSessionReader,
} from '../../src/main/session';

const APP_URL = 'https://web-xi-ten-uy9xk6c6p0.vercel.app';
const SUPABASE_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
const COOKIE_NAME = 'sb-goultdzqcavefcgnifdy-auth-token';

/** A cookie in the `@supabase/ssr` shape, expiring at `expiresAtSeconds`. */
function setCookie(expiresAtSeconds: number): void {
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 'stack', exp: expiresAtSeconds })).toString('base64url'),
    'fixture-signature',
  ].join('.');
  const payload = JSON.stringify({
    access_token: accessToken,
    token_type: 'bearer',
    expires_at: expiresAtSeconds,
    refresh_token: 'fixture-refresh',
  });
  fake.cookies = [
    { name: COOKIE_NAME, value: `base64-${Buffer.from(payload).toString('base64url')}` },
  ];
}

interface FakeWindow {
  visible: boolean;
  destroyed: boolean;
  loaded: boolean;
}

function reader(options: { window?: FakeWindow | null; nowMs: () => number }) {
  const reloads: number[] = [];
  const state =
    options.window === undefined
      ? { visible: false, destroyed: false, loaded: true }
      : options.window;
  const read = createUsableSessionReader({
    appUrl: APP_URL,
    supabaseUrl: SUPABASE_URL,
    getWindow: () =>
      state === null
        ? null
        : {
            isVisible: () => state.visible,
            isDestroyed: () => state.destroyed,
            hasLoaded: () => state.loaded,
          },
    reload: () => reloads.push(options.nowMs()),
    now: options.nowMs,
  });
  return { read, reloads, state };
}

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 8, 17, 12, 0, 0);

beforeEach(() => {
  fake.cookies = [];
});

describe('a live session', () => {
  it('is returned', async () => {
    setCookie((T0 + HOUR) / 1000);
    const { read, reloads } = reader({ nowMs: () => T0 });
    const session = await read();
    expect(session?.accessToken).toContain('.');
    expect(reloads).toEqual([]);
  });
});

describe('R2-4 — an expired session is null, not a 401 machine', () => {
  it('reads as null once the token has expired', async () => {
    setCookie((T0 - HOUR) / 1000);
    const { read } = reader({ nowMs: () => T0 });
    // Before the fix this returned the stale token and every read 401'd, silently.
    expect(await read()).toBeNull();
  });

  it('reads as null when there is no cookie at all', async () => {
    const { read } = reader({ nowMs: () => T0 });
    expect(await read()).toBeNull();
  });

  it('comes back to life when the cookie is renewed', async () => {
    setCookie((T0 - HOUR) / 1000);
    const { read } = reader({ nowMs: () => T0 });
    expect(await read()).toBeNull();

    setCookie((T0 + HOUR) / 1000);
    expect(await read()).not.toBeNull();
  });
});

describe('R2-4 — the hidden window is reloaded so the web app can refresh the cookie', () => {
  it('reloads a hidden window when the session has expired', async () => {
    setCookie((T0 - HOUR) / 1000);
    const { read, reloads } = reader({ window: { visible: false, destroyed: false, loaded: true }, nowMs: () => T0 });

    await read();

    expect(reloads).toEqual([T0]);
  });

  it('does not reload a visible window: the page refreshes itself', async () => {
    setCookie((T0 - HOUR) / 1000);
    const { read, reloads } = reader({ window: { visible: true, destroyed: false, loaded: true }, nowMs: () => T0 });
    await read();
    expect(reloads).toEqual([]);
  });

  it('does not reload a destroyed window, or none at all', async () => {
    setCookie((T0 - HOUR) / 1000);
    const destroyed = reader({ window: { visible: false, destroyed: true, loaded: true }, nowMs: () => T0 });
    await destroyed.read();
    expect(destroyed.reloads).toEqual([]);

    const none = reader({ window: null, nowMs: () => T0 });
    await none.read();
    expect(none.reloads).toEqual([]);
  });

  it('reloads at most once per HIDDEN_RELOAD_MIN_INTERVAL_MS, however many ticks', async () => {
    setCookie((T0 - HOUR) / 1000);
    let now = T0;
    const { read, reloads } = reader({
      window: { visible: false, destroyed: false, loaded: true },
      nowMs: () => now,
    });

    await read();
    expect(reloads).toEqual([T0]);

    // The poller ticks every 15 minutes by default, plus focus and resume: without the
    // throttle a long sleep would be one reload per tick.
    for (const offset of [1_000, 60_000, HIDDEN_RELOAD_MIN_INTERVAL_MS - 1]) {
      now = T0 + offset;
      await read();
    }
    expect(reloads).toEqual([T0]);

    now = T0 + HIDDEN_RELOAD_MIN_INTERVAL_MS;
    await read();
    expect(reloads).toEqual([T0, T0 + HIDDEN_RELOAD_MIN_INTERVAL_MS]);
  });

  it('is ten minutes: more often than the token expires, less often than a tick', () => {
    expect(HIDDEN_RELOAD_MIN_INTERVAL_MS).toBe(10 * 60 * 1000);
    expect(HIDDEN_RELOAD_MIN_INTERVAL_MS).toBeLessThan(HOUR);
  });

  it('still returns null on the tick that triggered the reload', async () => {
    // The reload is asynchronous: the fresh cookie is there for the *next* tick.
    setCookie((T0 - HOUR) / 1000);
    const { read } = reader({ window: { visible: false, destroyed: false, loaded: true }, nowMs: () => T0 });
    expect(await read()).toBeNull();
  });

  it('survives a reload that throws', async () => {
    setCookie((T0 - HOUR) / 1000);
    const read = createUsableSessionReader({
      appUrl: APP_URL,
      supabaseUrl: SUPABASE_URL,
      getWindow: () => ({ isVisible: () => false, isDestroyed: () => false, hasLoaded: () => true }),
      reload: () => {
        throw new Error('the window went away mid-reload');
      },
      now: () => T0,
    });
    await expect(read()).resolves.toBeNull();
  });

  it('never reloads while the session is healthy', async () => {
    setCookie((T0 + 24 * HOUR) / 1000);
    let now = T0;
    const { read, reloads } = reader({
      window: { visible: false, destroyed: false, loaded: true },
      nowMs: () => now,
    });
    for (const offset of [0, HOUR, 2 * HOUR]) {
      now = T0 + offset;
      await read();
    }
    expect(reloads).toEqual([]);
  });
});

describe('R2-4 — a window that has never loaded is not reloaded', () => {
  it('leaves a booting window alone', async () => {
    // Found by the packed-exe smoke, not by a test: a window is created with `show: false`
    // and only shown on `ready-to-show`, so at launch it is *not visible* and *not loaded*.
    // The very first tick therefore "reloaded" a window whose first load was still in
    // flight, fighting `window.ts`'s own retry for no reason.
    setCookie((T0 - HOUR) / 1000);
    const { read, reloads } = reader({
      window: { visible: false, destroyed: false, loaded: false },
      nowMs: () => T0,
    });

    await read();

    expect(reloads).toEqual([]);
  });

  it('leaves a window with a dead renderer alone: window.ts owns that reload', async () => {
    setCookie((T0 - HOUR) / 1000);
    const { read, reloads, state } = reader({
      window: { visible: false, destroyed: false, loaded: false },
      nowMs: () => T0,
    });
    await read();
    expect(reloads).toEqual([]);

    // Once it has content again, the session nudge resumes.
    if (state !== null) state.loaded = true;
    await read();
    expect(reloads).toEqual([T0]);
  });
});
