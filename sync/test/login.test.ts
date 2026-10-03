// Task 9 (R-83, R-87; 2026-10-03): the login rule and the login watch, on fakes and a fake clock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLACKBOARD_ORIGIN,
  DEFAULT_KEEPALIVE_MINUTES,
  KEEPALIVE_JITTER_MINUTES,
  KEEPALIVE_PAGES,
  LOGIN_HOSTS,
  LOGIN_WATCH_MS,
  LoginWatch,
  PROBE_URL,
  REAUTH_PATH,
  SETTLE_MS,
  classifyProbe,
  keepaliveDelayMs,
  parseKeepaliveMinutes,
  type LoginPort,
  type LoginRpc,
} from '../src/login.js';

const MINUTE = 60_000;

/** A page whose users/me answers come from a script, one per probe; the last one repeats. */
function fakePage(statuses: number[], startUrl = `${BLACKBOARD_ORIGIN}/ultra/course`) {
  const answers = [...statuses];
  const calls: string[] = [];
  let current = startUrl;
  const port: LoginPort = {
    currentUrl: () => current,
    goto: vi.fn(async (url: string) => {
      calls.push(`goto ${url}`);
      current = url;
    }),
    probe: vi.fn(async () => {
      const status = answers.length > 1 ? answers.shift()! : answers[0]!;
      calls.push(`probe ${status}`);
      return { status, location: null };
    }),
  };
  return {
    port,
    calls,
    setUrl: (u: string) => {
      current = u;
    },
    setAnswers: (next: number[]) => {
      answers.splice(0, answers.length, ...next);
    },
  };
}

function fakeRpc() {
  const calls: string[] = [];
  const rpc: LoginRpc = {
    loginOk: vi.fn(async () => {
      calls.push('sync_login_ok');
      return 1;
    }),
    loginRequired: vi.fn(async () => {
      calls.push('sync_login_required');
      return '7';
    }),
    enqueue: vi.fn(async (trigger: 'just' | 'login') => {
      calls.push(`sync_enqueue(${trigger})`);
      return '42';
    }),
  };
  return { rpc, calls };
}

function makeWatch(
  page: ReturnType<typeof fakePage>,
  rpc: ReturnType<typeof fakeRpc>,
  opts: { keepaliveMinutes?: number; passRunning?: () => boolean; random?: () => number } = {},
) {
  return new LoginWatch({
    page: page.port,
    rpc: rpc.rpc,
    keepaliveMinutes: opts.keepaliveMinutes ?? DEFAULT_KEEPALIVE_MINUTES,
    isPassRunning: opts.passRunning ?? (() => false),
    random: opts.random ?? (() => 0.5),
    log: () => {},
  });
}

describe('the named constants', () => {
  it('match the frozen Contract', () => {
    expect(DEFAULT_KEEPALIVE_MINUTES).toBe(20);
    expect(KEEPALIVE_JITTER_MINUTES).toBe(3);
    expect(KEEPALIVE_PAGES).toEqual(['/ultra/course', '/ultra/stream', '/ultra/calendar', '/ultra/institution-page']);
    expect(SETTLE_MS).toBe(15000);
    expect(LOGIN_WATCH_MS).toBe(60000);
    expect(LOGIN_HOSTS).toEqual(['login.microsoftonline.com']);
    expect(PROBE_URL).toBe('https://blackboard.syracuse.edu/learn/api/public/v1/users/me');
    expect(REAUTH_PATH).toBe('/ultra/');
  });
});

describe('classifyProbe (the login rule)', () => {
  it('reads 200 as alive', () => {
    expect(classifyProbe({ status: 200, location: null }, `${BLACKBOARD_ORIGIN}/ultra/stream`)).toBe('alive');
  });

  it.each([401, 403])('reads users/me %i as dead', (status) => {
    expect(classifyProbe({ status, location: null }, `${BLACKBOARD_ORIGIN}/ultra/stream`)).toBe('dead');
  });

  it.each(LOGIN_HOSTS.map((h) => [h]))('reads a page on %s as dead, whatever users/me says', (host) => {
    expect(classifyProbe({ status: 200, location: null }, `https://${host}/common/oauth2/authorize`)).toBe('dead');
  });

  it('reads a redirect to a login host as dead, and any other answer as an error', () => {
    expect(classifyProbe({ status: 302, location: 'https://login.microsoftonline.com/x' }, BLACKBOARD_ORIGIN)).toBe('dead');
    expect(classifyProbe({ status: 302, location: 'https://blackboard.syracuse.edu/x' }, BLACKBOARD_ORIGIN)).toBe('error');
    expect(classifyProbe({ status: 500, location: null }, BLACKBOARD_ORIGIN)).toBe('error');
    expect(classifyProbe({ status: null, location: null }, BLACKBOARD_ORIGIN)).toBe('error');
  });
});

describe('KEEPALIVE_MINUTES', () => {
  it('defaults to 20, accepts 0 (off), and refuses junk or a value inside the jitter', () => {
    expect(parseKeepaliveMinutes(undefined)).toBe(20);
    expect(parseKeepaliveMinutes('')).toBe(20);
    expect(parseKeepaliveMinutes('0')).toBe(0);
    expect(parseKeepaliveMinutes('45')).toBe(45);
    expect(() => parseKeepaliveMinutes('abc')).toThrow(/KEEPALIVE_MINUTES/);
    expect(() => parseKeepaliveMinutes('-1')).toThrow(/KEEPALIVE_MINUTES/);
    expect(() => parseKeepaliveMinutes('3')).toThrow(/KEEPALIVE_JITTER_MINUTES/);
    expect(() => parseKeepaliveMinutes('1441')).toThrow(/KEEPALIVE_MINUTES/);
  });

  it('lands each tick within plus or minus the jitter', () => {
    expect(keepaliveDelayMs(20, () => 0)).toBe(17 * MINUTE);
    expect(keepaliveDelayMs(20, () => 0.5)).toBe(20 * MINUTE);
    expect(keepaliveDelayMs(20, () => 1)).toBe(23 * MINUTE);
  });
});

describe('the login watch, on a fake clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a dead start re-logs in once, raises sync_login_required once, then only probes every LOGIN_WATCH_MS', async () => {
    const page = fakePage([401]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 1);

    expect(watch.state).toBe('dead');
    expect(page.calls).toEqual(['probe 401', `goto ${BLACKBOARD_ORIGIN}${REAUTH_PATH}`, 'probe 401']);
    expect(rpc.calls).toEqual(['sync_login_required']);

    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_MS * 3);
    expect(page.calls.slice(3)).toEqual(['probe 401', 'probe 401', 'probe 401']);
    expect(rpc.calls).toEqual(['sync_login_required']);
    watch.stop();
  });

  it('while dead nothing navigates, so the sign-in page Stack types into is left alone', async () => {
    const page = fakePage([401]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 1);
    page.setUrl('https://login.microsoftonline.com/common/login');
    const gotosBefore = page.calls.filter((c) => c.startsWith('goto')).length;
    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_MS * 10);
    expect(page.calls.filter((c) => c.startsWith('goto')).length).toBe(gotosBefore);
    expect(page.port.currentUrl()).toBe('https://login.microsoftonline.com/common/login');
    watch.stop();
  });

  it('dead -> alive calls sync_login_ok, then sync_enqueue(login), once', async () => {
    const page = fakePage([401]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 1);
    expect(watch.state).toBe('dead');

    page.setAnswers([200]);
    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_MS);
    expect(watch.state).toBe('alive');
    expect(rpc.calls).toEqual(['sync_login_required', 'sync_login_ok', 'sync_enqueue(login)']);

    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_MS * 5);
    expect(rpc.calls).toEqual(['sync_login_required', 'sync_login_ok', 'sync_enqueue(login)']);
    watch.stop();
  });

  it('an alive start calls sync_login_ok then sync_enqueue(login), and raises nothing', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(watch.state).toBe('alive');
    expect(rpc.calls).toEqual(['sync_login_ok', 'sync_enqueue(login)']);
    watch.stop();
  });

  it('while alive it ticks every KEEPALIVE_MINUTES (+/- jitter) and loads KEEPALIVE_PAGES in turn, then probes', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc, { random: () => 0.5 });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    page.calls.length = 0;

    await vi.advanceTimersByTimeAsync(20 * MINUTE - 2);
    expect(page.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2 + SETTLE_MS);
    expect(page.calls).toEqual([`goto ${BLACKBOARD_ORIGIN}/ultra/course`, 'probe 200']);

    for (let i = 0; i < 4; i += 1) await vi.advanceTimersByTimeAsync(20 * MINUTE + SETTLE_MS);
    expect(page.calls.filter((c) => c.startsWith('goto'))).toEqual([
      `goto ${BLACKBOARD_ORIGIN}/ultra/course`,
      `goto ${BLACKBOARD_ORIGIN}/ultra/stream`,
      `goto ${BLACKBOARD_ORIGIN}/ultra/calendar`,
      `goto ${BLACKBOARD_ORIGIN}/ultra/institution-page`,
      `goto ${BLACKBOARD_ORIGIN}/ultra/course`,
    ]);
    expect(rpc.calls).toEqual(['sync_login_ok', 'sync_enqueue(login)']);
    watch.stop();
  });

  it('the jitter moves the tick: random 0 ticks at 17 minutes', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc, { random: () => 0 });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    page.calls.length = 0;
    await vi.advanceTimersByTimeAsync(17 * MINUTE + SETTLE_MS);
    expect(page.calls[0]).toBe(`goto ${BLACKBOARD_ORIGIN}/ultra/course`);
    watch.stop();
  });

  it('a tick during a pass is skipped, and the next one runs', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    let passRunning = false;
    const watch = makeWatch(page, rpc, { passRunning: () => passRunning });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    page.calls.length = 0;

    passRunning = true;
    await vi.advanceTimersByTimeAsync(20 * MINUTE + SETTLE_MS);
    expect(page.calls).toEqual([]);

    passRunning = false;
    await vi.advanceTimersByTimeAsync(20 * MINUTE + SETTLE_MS);
    expect(page.calls).toEqual([`goto ${BLACKBOARD_ORIGIN}/ultra/course`, 'probe 200']);
    watch.stop();
  });

  it('a dead keep-alive probe loads /ultra/ once first, and a 200 after it raises nothing', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    page.calls.length = 0;

    page.setAnswers([401, 200]);
    await vi.advanceTimersByTimeAsync(20 * MINUTE + SETTLE_MS * 2 + 1);
    expect(page.calls).toEqual([
      `goto ${BLACKBOARD_ORIGIN}/ultra/course`,
      'probe 401',
      `goto ${BLACKBOARD_ORIGIN}${REAUTH_PATH}`,
      'probe 200',
    ]);
    expect(watch.state).toBe('alive');
    expect(rpc.calls).toEqual(['sync_login_ok', 'sync_enqueue(login)']);
    watch.stop();
  });

  it('alive -> dead raises again, once, after the silent re-login fails', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(1);

    page.setAnswers([401]);
    await vi.advanceTimersByTimeAsync(20 * MINUTE + SETTLE_MS * 2 + 1);
    expect(watch.state).toBe('dead');
    expect(rpc.calls).toEqual(['sync_login_ok', 'sync_enqueue(login)', 'sync_login_required']);

    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_MS * 3);
    expect(rpc.calls.filter((c) => c === 'sync_login_required')).toHaveLength(1);

    // And back: the next entry into alive queues again (the database decides if it is due).
    page.setAnswers([200]);
    await vi.advanceTimersByTimeAsync(LOGIN_WATCH_MS);
    expect(rpc.calls.slice(-2)).toEqual(['sync_login_ok', 'sync_enqueue(login)']);
    watch.stop();
  });

  it('KEEPALIVE_MINUTES=0 stops the ticks while alive', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc, { keepaliveMinutes: 0 });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    page.calls.length = 0;
    await vi.advanceTimersByTimeAsync(6 * 60 * MINUTE);
    expect(page.calls).toEqual([]);
    watch.stop();
  });

  it('a probe that errors changes nothing and is tried again on the next tick', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    page.port.probe = vi.fn(async () => {
      throw new Error('net::ERR_CONNECTION_RESET');
    });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(watch.state).toBe('unknown');
    expect(rpc.calls).toEqual([]);
    expect(watch.nextDelayMs()).toBe(LOGIN_WATCH_MS);
    watch.stop();
  });

  it('an RPC that throws is logged, not fatal, and the state still moves', async () => {
    const page = fakePage([401]);
    const rpc = fakeRpc();
    rpc.rpc.loginRequired = vi.fn(async () => {
      throw new Error('connection terminated');
    });
    const lines: string[] = [];
    const watch = new LoginWatch({
      page: page.port, rpc: rpc.rpc, keepaliveMinutes: 20, isPassRunning: () => false,
      random: () => 0.5, log: (l) => lines.push(l),
    });
    watch.start();
    await vi.advanceTimersByTimeAsync(SETTLE_MS + 1);
    expect(watch.state).toBe('dead');
    expect(lines.some((l) => l.includes('sync_login_required failed'))).toBe(true);
    watch.stop();
  });

  it('records every probe for the probe.js state file', async () => {
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const seen: { status: number | null; verdict: string }[] = [];
    const watch = new LoginWatch({
      page: page.port, rpc: rpc.rpc, keepaliveMinutes: 20, isPassRunning: () => false,
      random: () => 0.5, log: () => {}, onProbe: (r) => seen.push({ status: r.status, verdict: r.verdict }),
    });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(seen).toEqual([{ status: 200, verdict: 'alive' }]);
    watch.stop();
  });
});

describe('a pass\'s own check', () => {
  it('runs the same probe and silent re-login, and moves the state', async () => {
    vi.useFakeTimers();
    try {
      const page = fakePage([401, 401]);
      const rpc = fakeRpc();
      const watch = makeWatch(page, rpc);
      const pending = watch.check('pass');
      await vi.advanceTimersByTimeAsync(SETTLE_MS + 1);
      expect(await pending).toBe('dead');
      expect(watch.state).toBe('dead');
      expect(rpc.calls).toEqual(['sync_login_required']);

      // Already dead: a pass's check only probes.
      page.calls.length = 0;
      page.setAnswers([401]);
      expect(await watch.check('pass')).toBe('dead');
      expect(page.calls).toEqual(['probe 401']);
    } finally {
      vi.useRealTimers();
    }
  });
});
