/**
 * The login rule and the login watch (brief 100, "The login watch", 2026-10-03).
 *
 * The runner keeps one login state, `unknown`, `alive` or `dead`, and checks it with one probe:
 * `users/me` on Blackboard's origin, requested without following redirects. It runs on start, then
 * every LOGIN_WATCH_MS while the state is `dead` or `unknown`, and while it is `alive` a keep-alive
 * tick every KEEPALIVE_MINUTES (give or take KEEPALIVE_JITTER_MINUTES) loads the next read-only
 * Ultra page first. A pass's own probe (step 3) goes through the same `check`.
 *
 *   * a dead probe from `alive` or `unknown` first loads `/ultra/` once and waits SETTLE_MS, so a
 *     lapsed Blackboard session whose Microsoft sign-in is still valid comes back without Stack;
 *     only a second dead probe enters `dead`;
 *   * while `dead` the watch only probes: it never navigates, so the noVNC sign-in page is left be;
 *   * entering `dead` calls `sync_login_required()` once per entry;
 *   * entering `alive` calls `sync_login_ok()`, then `sync_enqueue('login')` (the database queues the
 *     day's sync only if none finished done that New York day and none is open);
 *   * the first passing check of a New York day on which no `sync_enqueue('login')` has answered yet
 *     makes that call alone (no `sync_login_ok()`), so a login the keep-alive held overnight still
 *     queues the day's sync; a failed call is retried on the next passing check (W-72, 2026-10-05);
 *   * it never claims, crawls or retries a sync.
 *
 * Ported from the spike's `docker/sync/spike/session-age.mjs`, onto injected ports so it runs on a
 * fake page, a fake RPC client and vitest's fake clock. Nothing here types, clicks or reads a
 * credential.
 */

export const BLACKBOARD_ORIGIN = 'https://blackboard.syracuse.edu';
/** Absolute, because Ultra's <base href> points at the CDN. */
export const PROBE_URL = `${BLACKBOARD_ORIGIN}/learn/api/public/v1/users/me`;
/** The page whose load lets a still-valid Microsoft sign-in log Blackboard back in. */
export const REAUTH_PATH = '/ultra/';
/** The one host skills/bb-sync step 1 spells out, and the only one the spike's Duo login passed (82b). */
export const LOGIN_HOSTS = Object.freeze(['login.microsoftonline.com'] as const);
/** Read-only pages, visited in turn: never a course page, a form or anything that records an action. */
export const KEEPALIVE_PAGES = Object.freeze([
  '/ultra/course',
  '/ultra/stream',
  '/ultra/calendar',
  '/ultra/institution-page',
] as const);
export const DEFAULT_KEEPALIVE_MINUTES = 20;
export const KEEPALIVE_JITTER_MINUTES = 3;
/** The wait after a keep-alive or re-login load, for Ultra's scripts and any sign-in redirect. */
export const SETTLE_MS = 15_000;
/** The check while the login is dead or unknown, so the morning login is seen within a minute. */
export const LOGIN_WATCH_MS = 60_000;
/** R2 item 4: with the keep-alive off (0), the live login is still probed this often, without navigating. */
export const LOGIN_CHECK_MINUTES = 60;
/** The zone whose calendar day the daily sync is counted in, as `sync_login_sync_due` (091) counts it. */
export const SYNC_DAY_TIME_ZONE = 'America/New_York';

/** The RPC both enqueue paths make, as their log lines name it. */
const ENQUEUE_LOGIN_CALL = "sync_enqueue('login')";
/** The log's reading of a null answer: a sync already finished done this New York day. */
const NOTHING_QUEUED = 'nothing queued (already synced today)';
/** The prefix of the daily rule's log line. */
const NEW_DAY_LOG_PREFIX = 'login: new New York day:';
/** The New York wall clock, read part by part (`formatToParts`), so no locale's date pattern matters. */
const SYNC_DAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: SYNC_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MS_PER_MINUTE = 60_000;
const MAX_KEEPALIVE_MINUTES = 1_440;
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

export type LoginState = 'unknown' | 'alive' | 'dead';
export type Verdict = 'alive' | 'dead' | 'error';

export interface ProbeAnswer {
  status: number | null;
  location: string | null;
}

/** What the watch needs from the browser: the tab's address, a navigation, and the probe. */
export interface LoginPort {
  currentUrl(): string;
  goto(url: string): Promise<void>;
  probe(): Promise<ProbeAnswer>;
}

/** The three RPCs the watch may call. It never claims, closes or crawls. */
export interface LoginRpc {
  loginOk(): Promise<number>;
  loginRequired(): Promise<string | null>;
  enqueue(trigger: 'just' | 'login'): Promise<string | null>;
}

export interface ProbeRecord {
  status: number | null;
  verdict: Verdict;
  at: string;
  label: string;
}

export interface LoginWatchDeps {
  page: LoginPort;
  rpc: LoginRpc;
  keepaliveMinutes: number;
  isPassRunning: () => boolean;
  log: (line: string) => void;
  random?: () => number;
  onProbe?: (record: ProbeRecord) => void;
  now?: () => Date;
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLoginHost(url: string | null | undefined): boolean {
  const host = hostOf(url);
  return host !== null && (LOGIN_HOSTS as readonly string[]).includes(host);
}

/** The login rule: 200 is alive; 401, 403 or a tab on a login host is dead; anything else is unknown. */
export function classifyProbe(answer: ProbeAnswer, currentUrl: string): Verdict {
  if (isLoginHost(currentUrl)) return 'dead';
  if (answer.status === HTTP_OK) return 'alive';
  if (answer.status === HTTP_UNAUTHORIZED || answer.status === HTTP_FORBIDDEN) return 'dead';
  if (answer.status !== null && answer.status >= 300 && answer.status < 400 && isLoginHost(answer.location)) {
    return 'dead';
  }
  return 'error';
}

/** KEEPALIVE_MINUTES from the environment: 20 when unset; 0 turns the navigation off (the watch still probes hourly). */
export function parseKeepaliveMinutes(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_KEEPALIVE_MINUTES;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > MAX_KEEPALIVE_MINUTES) {
    throw new Error(`KEEPALIVE_MINUTES must be a number from 0 to ${MAX_KEEPALIVE_MINUTES}, got ${JSON.stringify(raw)}`);
  }
  if (value !== 0 && value <= KEEPALIVE_JITTER_MINUTES) {
    throw new Error(`KEEPALIVE_MINUTES must be 0 or larger than KEEPALIVE_JITTER_MINUTES (${KEEPALIVE_JITTER_MINUTES})`);
  }
  return value;
}

/** The New York calendar day an instant falls on, as 'YYYY-MM-DD'. */
export function syncDayOf(at: Date): string {
  const parts = SYNC_DAY_FORMAT.formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) throw new Error(`syncDayOf: no ${type} for ${at.toISOString()}`);
    return value;
  };
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The delay to the next keep-alive tick: KEEPALIVE_MINUTES give or take the jitter. */
export function keepaliveDelayMs(minutes: number, random: () => number): number {
  const jitter = (random() * 2 - 1) * KEEPALIVE_JITTER_MINUTES;
  return Math.round((minutes + jitter) * MS_PER_MINUTE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';
}

export class LoginWatch {
  state: LoginState = 'unknown';

  private readonly deps: LoginWatchDeps;
  private readonly random: () => number;
  private readonly now: () => Date;
  private pageIndex = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private ticking = false;
  /** An RPC the last transition owed and could not make; retried on the next tick. */
  private owed: 'none' | 'raise' | 'alive' = 'none';
  /** The New York day of the last `sync_enqueue('login')` that answered; null before the first. */
  private enqueuedDay: string | null = null;

  constructor(deps: LoginWatchDeps) {
    this.deps = deps;
    this.random = deps.random ?? Math.random;
    this.now = deps.now ?? (() => new Date());
  }

  /** Probe now, then keep watching on timers until `stop()`. */
  start(): void {
    this.running = true;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  /** The wait before the next tick in the current state. */
  nextDelayMs(): number {
    if (this.state !== 'alive') return LOGIN_WATCH_MS;
    if (this.deps.keepaliveMinutes === 0) return LOGIN_CHECK_MINUTES * MS_PER_MINUTE;
    return keepaliveDelayMs(this.deps.keepaliveMinutes, this.random);
  }

  /**
   * One check, serialised with every other use of the tab: probe, and on a dead answer from
   * `alive` or `unknown`, the silent re-login and a second probe. A pass calls this as its step 3.
   */
  check(label: string): Promise<Verdict> {
    const run = this.chain.then(() => this.checkNow(label));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async checkNow(label: string): Promise<Verdict> {
    await this.payOwed();
    const verdict = await this.probeAndSettle(label);
    if (verdict === 'alive') await this.enqueueIfNewDay();
    return verdict;
  }

  /** The probe, and on a dead answer from `alive` or `unknown` the silent re-login and a second probe. */
  private async probeAndSettle(label: string): Promise<Verdict> {
    const first = await this.probeOnce(label);
    if (first !== 'dead') {
      if (first === 'alive') await this.enter('alive');
      return first;
    }
    if (this.state === 'dead') return 'dead';

    await this.visit(REAUTH_PATH, 'reauth');
    const second = await this.probeOnce(`${label} after-reauth`);
    if (second === 'alive') await this.enter('alive');
    if (second === 'dead') await this.enter('dead');
    return second;
  }

  private keepalive(): Promise<void> {
    const run = this.chain.then(async () => {
      const path = KEEPALIVE_PAGES[this.pageIndex % KEEPALIVE_PAGES.length]!;
      this.pageIndex += 1;
      await this.visit(path, 'keepalive');
      await this.checkNow('after-keepalive');
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  private schedule(delayMs: number | null): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (!this.running || delayMs === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    this.ticking = true;
    try {
      if (this.state === 'alive') {
        if (this.deps.isPassRunning()) {
          this.deps.log('login: keep-alive tick skipped, a pass is running');
        } else if (this.deps.keepaliveMinutes === 0) {
          // The keep-alive is off: probe only, so an overnight death is still seen (R2 item 4).
          await this.check('alive-check');
        } else {
          await this.keepalive();
        }
      } else {
        await this.check('watch');
      }
    } catch (error) {
      this.deps.log(`login: tick failed: ${firstLine(error)}`);
    } finally {
      this.ticking = false;
      this.schedule(this.nextDelayMs());
    }
  }

  private async probeOnce(label: string): Promise<Verdict> {
    let answer: ProbeAnswer;
    try {
      answer = await this.deps.page.probe();
    } catch (error) {
      answer = { status: null, location: null };
      this.deps.log(`login: users/me error ${this.now().toISOString()} ${label} ${firstLine(error)}`);
    }
    const verdict = classifyProbe(answer, this.deps.page.currentUrl());
    const at = this.now().toISOString();
    this.deps.log(`login: users/me ${answer.status ?? 'error'} ${at} ${label} -> ${verdict}`);
    this.deps.onProbe?.({ status: answer.status, verdict, at, label });
    return verdict;
  }

  private async visit(path: string, label: string): Promise<void> {
    try {
      await this.deps.page.goto(`${BLACKBOARD_ORIGIN}${path}`);
    } catch (error) {
      this.deps.log(`login: ${label} ${path} failed: ${firstLine(error)}`);
    }
    await sleep(SETTLE_MS);
  }

  private async enter(next: LoginState): Promise<void> {
    if (next === this.state) return;
    this.deps.log(`login: ${this.state} -> ${next}`);
    this.state = next;
    this.owed = next === 'dead' ? 'raise' : next === 'alive' ? 'alive' : 'none';
    await this.payOwed();
    if (!this.ticking) this.schedule(this.nextDelayMs());
  }

  /** Make the RPCs the last transition owes. A failure is logged and retried on the next check. */
  private async payOwed(): Promise<void> {
    if (this.owed === 'raise' && this.state === 'dead') {
      try {
        await this.deps.rpc.loginRequired();
        this.owed = 'none';
      } catch (error) {
        this.deps.log(`login: sync_login_required failed: ${firstLine(error)}`);
      }
      return;
    }
    if (this.owed === 'alive' && this.state === 'alive') {
      try {
        await this.deps.rpc.loginOk();
        const day = syncDayOf(this.now());
        const queued = await this.deps.rpc.enqueue('login');
        this.enqueuedDay = day;
        this.deps.log(`login: ${ENQUEUE_LOGIN_CALL} -> ${queued ?? NOTHING_QUEUED}`);
        this.owed = 'none';
      } catch (error) {
        this.deps.log(`login: sync_login_ok / sync_enqueue failed: ${firstLine(error)}`);
      }
    }
  }

  /**
   * The daily rule: on a passing check, ask for the day's sync once per New York day. An entry into
   * `alive` already asked (and recorded the day); while its call is still owed, `payOwed` retries it.
   * A failure leaves the day unrecorded, so the next passing check asks again.
   */
  private async enqueueIfNewDay(): Promise<void> {
    // The state is `alive` here: the one caller, `checkNow`, runs this only on an alive verdict,
    // and `probeAndSettle` has called `enter('alive')` before returning one.
    if (this.owed !== 'none') return;
    const today = syncDayOf(this.now());
    if (today === this.enqueuedDay) return;
    try {
      const queued = await this.deps.rpc.enqueue('login');
      this.enqueuedDay = today;
      this.deps.log(`${NEW_DAY_LOG_PREFIX} ${ENQUEUE_LOGIN_CALL} -> ${queued ?? NOTHING_QUEUED}`);
    } catch (error) {
      this.deps.log(`login: ${ENQUEUE_LOGIN_CALL} failed: ${firstLine(error)}`);
    }
  }
}
