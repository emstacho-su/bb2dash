// Task 9 (R-83, R-87; 2026-10-03): the login rule and the login watch, on fakes and a fake clock.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BLACKBOARD_ORIGIN,
  DAILY_NULL_RETRY_MINUTES,
  DAILY_SYNC_NOT_BEFORE_HOUR,
  DEFAULT_KEEPALIVE_MINUTES,
  KEEPALIVE_JITTER_MINUTES,
  KEEPALIVE_PAGES,
  LOGIN_CHECK_MINUTES,
  LOGIN_HOSTS,
  LOGIN_WATCH_MS,
  LoginWatch,
  PROBE_URL,
  REAUTH_PATH,
  SETTLE_MS,
  SYNC_DAY_TIME_ZONE,
  classifyProbe,
  keepaliveDelayMs,
  parseKeepaliveMinutes,
  syncDayOf,
  type LoginPort,
  type LoginRpc,
} from '../src/login.js';

const MINUTE = 60_000;
/** Noon in New York, far from either midnight, so the daily rule never fires inside a case that is not about it. */
const MIDDAY_UTC = '2026-10-05T16:00:00Z';

/** Move the fake clock (timers and Date) forward to an instant. */
async function advanceTo(iso: string): Promise<void> {
  await vi.advanceTimersByTimeAsync(Date.parse(iso) - Date.now());
}

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
  opts: {
    keepaliveMinutes?: number;
    passRunning?: () => boolean;
    random?: () => number;
    log?: (line: string) => void;
  } = {},
) {
  return new LoginWatch({
    page: page.port,
    rpc: rpc.rpc,
    keepaliveMinutes: opts.keepaliveMinutes ?? DEFAULT_KEEPALIVE_MINUTES,
    isPassRunning: opts.passRunning ?? (() => false),
    random: opts.random ?? (() => 0.5),
    log: opts.log ?? (() => {}),
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
    vi.setSystemTime(new Date(MIDDAY_UTC));
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

  it('R2 item 4: KEEPALIVE_MINUTES=0 stops the navigation only; the watch still probes every LOGIN_CHECK_MINUTES', async () => {
    expect(LOGIN_CHECK_MINUTES).toBe(60);
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc, { keepaliveMinutes: 0 });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    page.calls.length = 0;

    await vi.advanceTimersByTimeAsync(60 * MINUTE - 2);
    expect(page.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(page.calls).toEqual(['probe 200']);

    // An overnight death is seen at the next hourly check: silent re-login, then the raise.
    page.setAnswers([401]);
    await vi.advanceTimersByTimeAsync(60 * MINUTE + SETTLE_MS + 1);
    expect(watch.state).toBe('dead');
    expect(rpc.calls).toEqual(['sync_login_ok', 'sync_enqueue(login)', 'sync_login_required']);
    expect(page.calls.filter((c) => c.startsWith('goto'))).toEqual([`goto ${BLACKBOARD_ORIGIN}${REAUTH_PATH}`]);
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
    vi.setSystemTime(new Date(MIDDAY_UTC));
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

// W-72 (2026-10-05): the first passing check at or after 06:00 each New York day asks
// sync_enqueue('login') once, so a login the keep-alive held all night still queues the day's sync
// (DECISIONS 2026-10-03), in the morning rather than at midnight (round 2, R2-2).
describe('the daily rule: one sync_enqueue(login) per New York day', () => {
  const ENQUEUE = 'sync_enqueue(login)';
  const NEW_DAY_LINE = "login: new New York day: sync_enqueue('login') -> ";

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function enqueues(rpc: ReturnType<typeof fakeRpc>): number {
    return rpc.calls.filter((c) => c === ENQUEUE).length;
  }

  it('pins the daily rule\'s constants', () => {
    expect(SYNC_DAY_TIME_ZONE).toBe('America/New_York');
    expect(DAILY_SYNC_NOT_BEFORE_HOUR).toBe(6);
  });

  it('the day is the America/New_York calendar day, across the 2026-11-01 fall-back', () => {
    expect(syncDayOf(new Date('2026-10-05T03:59:59Z'))).toBe('2026-10-04');
    expect(syncDayOf(new Date('2026-10-05T04:00:00Z'))).toBe('2026-10-05');
    // 2026-11-01 begins on EDT (04:00Z); the clocks fall back at 06:00Z, so 04:30Z is already the 1st.
    expect(syncDayOf(new Date('2026-11-01T03:59:59Z'))).toBe('2026-10-31');
    expect(syncDayOf(new Date('2026-11-01T04:30:00Z'))).toBe('2026-11-01');
    // 2026-11-02 begins on EST (05:00Z): 04:30Z is still 23:30 on the 1st.
    expect(syncDayOf(new Date('2026-11-02T04:30:00Z'))).toBe('2026-11-01');
    expect(syncDayOf(new Date('2026-11-02T04:59:59Z'))).toBe('2026-11-01');
    expect(syncDayOf(new Date('2026-11-02T05:00:00Z'))).toBe('2026-11-02');
  });

  it.each([
    ['the keep-alive visit', DEFAULT_KEEPALIVE_MINUTES],
    ['the hourly probe (KEEPALIVE_MINUTES=0)', 0],
  ])('alive across New York midnight in October: no call at 00:01 or 05:59, one on the first passing check at or after 06:00 (%s)', async (_path, minutes) => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const lines: string[] = [];
    const watch = makeWatch(page, rpc, { keepaliveMinutes: minutes, log: (l) => lines.push(l) });
    watch.start();

    // 00:01 and 05:59:59 New York (EDT, UTC-4): passing checks, no call.
    await advanceTo('2026-10-05T04:01:00Z');
    expect(watch.state).toBe('alive');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE]);
    await advanceTo('2026-10-05T09:59:59Z');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE]);

    // The first passing check at or after 06:00 New York (10:00Z; 10:05:15Z on the keep-alive's cadence).
    await advanceTo('2026-10-05T10:21:00Z');
    // No sync_login_ok: there is no login item to archive, only the day's sync to ask for.
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, ENQUEUE]);
    expect(lines.filter((l) => l.startsWith(NEW_DAY_LINE))).toEqual([`${NEW_DAY_LINE}42`]);

    await advanceTo('2026-10-06T03:59:00Z');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, ENQUEUE]);
    watch.stop();
  });

  it('a dead -> alive entry at 03:00 New York still calls, records the day, and the daily rule adds none after 06:00', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const lines: string[] = [];
    const watch = makeWatch(page, rpc, { log: (l) => lines.push(l) });
    watch.start();
    await advanceTo('2026-10-05T03:30:00Z');

    // The login dies before midnight and stays dead across it.
    page.setAnswers([401]);
    await advanceTo('2026-10-05T07:00:00Z');
    expect(watch.state).toBe('dead');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, 'sync_login_required']);

    // Stack logs in at 03:00 New York (07:00Z): a real login calls at any hour; it is the day's one call.
    page.setAnswers([200]);
    await advanceTo('2026-10-05T07:02:00Z');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, 'sync_login_required', 'sync_login_ok', ENQUEUE]);
    await advanceTo('2026-10-05T23:00:00Z');
    expect(watch.state).toBe('alive');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, 'sync_login_required', 'sync_login_ok', ENQUEUE]);
    expect(lines.some((l) => l.startsWith(NEW_DAY_LINE))).toBe(false);
    watch.stop();
  });

  it('a same-day re-entry after the daily call keeps the entry\'s own call (the database answers it), then none', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await advanceTo('2026-10-05T10:21:00Z');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, ENQUEUE]);

    page.setAnswers([401]);
    await advanceTo('2026-10-05T12:00:00Z');
    expect(watch.state).toBe('dead');

    page.setAnswers([200]);
    await advanceTo('2026-10-05T23:00:00Z');
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, ENQUEUE, 'sync_login_required', 'sync_login_ok', ENQUEUE]);
    watch.stop();
  });

  it('a failed daily call is retried on the next passing check, then not again that day', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const lines: string[] = [];
    const watch = makeWatch(page, rpc, { log: (l) => lines.push(l) });
    watch.start();
    await advanceTo('2026-10-05T03:30:00Z');

    let failNext = true;
    rpc.rpc.enqueue = vi.fn(async (trigger: 'just' | 'login') => {
      rpc.calls.push(`sync_enqueue(${trigger})`);
      if (failNext) {
        failNext = false;
        throw new Error('connection terminated\n    at Socket.<anonymous>');
      }
      return '43';
    });

    // The first check at or after 06:00 New York (10:05:15Z) fails: logged, the day not recorded.
    await advanceTo('2026-10-05T10:06:00Z');
    expect(enqueues(rpc)).toBe(2);
    expect(lines).toContain("login: sync_enqueue('login') failed: connection terminated");
    expect(lines.some((l) => l.startsWith(NEW_DAY_LINE))).toBe(false);

    // The next passing check (10:25:30Z) asks again and succeeds.
    await advanceTo('2026-10-05T10:26:00Z');
    expect(enqueues(rpc)).toBe(3);
    expect(lines.filter((l) => l.startsWith(NEW_DAY_LINE))).toEqual([`${NEW_DAY_LINE}43`]);

    await advanceTo('2026-10-05T23:00:00Z');
    expect(enqueues(rpc)).toBe(3);
    watch.stop();
  });

  it('an entry whose own call failed is retried by the entry path alone, never doubled by the daily rule', async () => {
    vi.setSystemTime(new Date(MIDDAY_UTC));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    let failNext = true;
    rpc.rpc.enqueue = vi.fn(async (trigger: 'just' | 'login') => {
      rpc.calls.push(`sync_enqueue(${trigger})`);
      if (failNext) {
        failNext = false;
        throw new Error('connection terminated');
      }
      return '44';
    });
    const watch = makeWatch(page, rpc);
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE]);

    // The next check pays the entry's debt (sync_login_ok, then the call), which records the day.
    await vi.advanceTimersByTimeAsync(20 * MINUTE + SETTLE_MS);
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, 'sync_login_ok', ENQUEUE]);
    await vi.advanceTimersByTimeAsync(3 * 60 * MINUTE);
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE, 'sync_login_ok', ENQUEUE]);
    watch.stop();
  });

  /** An enqueue that answers from a script, one answer per call (the last repeats), noting each call's time. */
  function scriptEnqueue(rpc: ReturnType<typeof fakeRpc>, answers: (string | null)[]): number[] {
    const script = [...answers];
    const times: number[] = [];
    rpc.rpc.enqueue = vi.fn(async (trigger: 'just' | 'login') => {
      rpc.calls.push(`sync_enqueue(${trigger})`);
      times.push(Date.now());
      return script.length > 1 ? script.shift()! : script[0]!;
    });
    return times;
  }

  const NOTHING_LINE = `${NEW_DAY_LINE}nothing queued (already synced today)`;

  it('a daily null does not record the day: it asks again no sooner than an hour later, and an id records it', async () => {
    expect(DAILY_NULL_RETRY_MINUTES).toBe(60);
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const lines: string[] = [];
    const watch = makeWatch(page, rpc, { log: (l) => lines.push(l) });
    watch.start();
    await advanceTo('2026-10-05T03:30:00Z');
    const times = scriptEnqueue(rpc, [null, '45']);

    // 10:05:15Z (06:05 New York): null. The checks at 10:25:30Z and 10:45:45Z are inside the hour.
    await advanceTo('2026-10-05T11:05:00Z');
    expect(enqueues(rpc)).toBe(2);
    expect(lines.filter((l) => l.startsWith(NEW_DAY_LINE))).toEqual([NOTHING_LINE]);

    // 11:06:00Z, the first passing check an hour or more after the null: an id, which records the day.
    await advanceTo('2026-10-05T11:07:00Z');
    expect(enqueues(rpc)).toBe(3);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(DAILY_NULL_RETRY_MINUTES * MINUTE);
    expect(lines.filter((l) => l.startsWith(NEW_DAY_LINE))).toEqual([NOTHING_LINE, `${NEW_DAY_LINE}45`]);

    await advanceTo('2026-10-06T03:59:00Z');
    expect(enqueues(rpc)).toBe(3);
    watch.stop();
  });

  it('an entry at 00:00:40 New York answered null does not record the day: the daily rule asks at 06:00, and its id records it', async () => {
    vi.setSystemTime(new Date('2026-10-05T04:00:40Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const lines: string[] = [];
    const times = scriptEnqueue(rpc, [null, '46']);
    const watch = makeWatch(page, rpc, { log: (l) => lines.push(l) });
    watch.start();
    await vi.advanceTimersByTimeAsync(1);
    // The entry's own log line is unchanged.
    expect(lines).toContain("login: sync_enqueue('login') -> nothing queued (already synced today)");
    expect(rpc.calls).toEqual(['sync_login_ok', ENQUEUE]);

    await advanceTo('2026-10-05T09:59:59Z');
    expect(enqueues(rpc)).toBe(1);
    await advanceTo('2026-10-05T10:21:00Z');
    expect(enqueues(rpc)).toBe(2);
    expect(syncDayOf(new Date(times[0]!))).toBe(syncDayOf(new Date(times[1]!)));
    expect(lines.filter((l) => l.startsWith(NEW_DAY_LINE))).toEqual([`${NEW_DAY_LINE}46`]);

    await advanceTo('2026-10-06T03:59:00Z');
    expect(enqueues(rpc)).toBe(2);
    watch.stop();
  });

  it('a null answered all day: at most one call an hour, one "nothing queued" line a day', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const lines: string[] = [];
    const times = scriptEnqueue(rpc, [null]);
    const watch = makeWatch(page, rpc, { log: (l) => lines.push(l) });
    watch.start();

    // The entry's null (23:00 New York on the 4th) backs the daily rule off too; then 00:00-05:59 waits.
    await advanceTo('2026-10-05T09:59:59Z');
    expect(enqueues(rpc)).toBe(1);

    // 06:00 to 23:59:59 New York on the 5th: 18 hours.
    await advanceTo('2026-10-06T03:59:59Z');
    const daily = times.slice(1);
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.length).toBeLessThanOrEqual(18);
    times.slice(1).forEach((t, i) => {
      expect(t - times[i]!).toBeGreaterThanOrEqual(DAILY_NULL_RETRY_MINUTES * MINUTE);
    });
    expect(lines.filter((l) => l === NOTHING_LINE)).toHaveLength(1);

    // The next New York day logs its own first null, once.
    await advanceTo('2026-10-06T23:00:00Z');
    expect(lines.filter((l) => l === NOTHING_LINE)).toHaveLength(2);
    watch.stop();
  });

  it('the 2026-11-01 fall-back: 06:00 New York is 11:00Z on the 1st and the 2nd, not 10:00Z', async () => {
    vi.setSystemTime(new Date('2026-11-01T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();

    // The 1st begins at 04:00Z (EDT); the clocks fall back at 06:00Z, so 10:59:59Z is 05:59:59 EST.
    await advanceTo('2026-11-01T10:59:59Z');
    expect(enqueues(rpc)).toBe(1);
    await advanceTo('2026-11-01T11:21:00Z');
    expect(enqueues(rpc)).toBe(2);

    // The 2nd begins at 05:00Z (EST); 06:00 is 11:00Z again.
    await advanceTo('2026-11-02T10:59:59Z');
    expect(enqueues(rpc)).toBe(2);
    await advanceTo('2026-11-02T11:21:00Z');
    expect(enqueues(rpc)).toBe(3);
    expect(rpc.calls.filter((c) => c === 'sync_login_ok')).toHaveLength(1);
    watch.stop();
  });

  it.each([
    ['dead (users/me 401)', [401], 'dead', ['sync_login_required']],
    ['unknown (users/me 500)', [500], 'unknown', []],
  ])('a watch that is %s across New York midnight and 06:00 never enqueues', async (_name, answers, state, calls) => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage(answers);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await advanceTo('2026-10-05T12:00:00Z');
    expect(watch.state).toBe(state);
    expect(rpc.calls).toEqual(calls);
    watch.stop();
  });

  it('an unknown watch whose probe throws across midnight and 06:00 never enqueues', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    page.port.probe = vi.fn(async () => {
      throw new Error('net::ERR_CONNECTION_RESET');
    });
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await advanceTo('2026-10-05T12:00:00Z');
    expect(watch.state).toBe('unknown');
    expect(rpc.calls).toEqual([]);
    watch.stop();
  });

  it('an alive watch whose checks fail around 06:00 waits for the next passing check', async () => {
    vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
    const page = fakePage([200]);
    const rpc = fakeRpc();
    const watch = makeWatch(page, rpc);
    watch.start();
    await advanceTo('2026-10-05T09:50:00Z');

    page.setAnswers([500]);
    await advanceTo('2026-10-05T11:00:00Z');
    expect(watch.state).toBe('alive');
    expect(enqueues(rpc)).toBe(1);

    page.setAnswers([200]);
    await advanceTo('2026-10-05T11:30:00Z');
    expect(enqueues(rpc)).toBe(2);
    watch.stop();
  });
});
