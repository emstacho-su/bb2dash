/**
 * Tick orchestration (C-7 Scheduler), plain Node: clock and timers are injected, so the
 * whole thing is unit-testable without Electron and portable to a container (C-13).
 *
 * A tick runs at launch, every `pollIntervalMinutes`, on window focus (at most once per
 * 60 s), on power resume, and on the tray's *Check now* (C-12) through `runOnce()`.
 *
 * Two invariants the tests hold it to:
 *  - Ticks never overlap. A trigger that arrives while one is in flight is dropped, not
 *    queued: the next scheduled tick reads the same rows anyway.
 *  - A tick that cannot read the session or any relation changes nothing — no toast, no
 *    watermark write, no advance of `lastSeenAt`.
 */

import type {
  CourseLabel,
  DueRow,
  GradeRow,
  Notifier,
  RestGet,
  SyncStatusRow,
  Watermark,
  WatermarkStore,
  WebSession,
} from '../types';
import { type Logger, describeError, silentLogger } from '../redact';
import { initialWatermark, reduce } from './reducer';
import { loadOrInitialise } from './watermark';
import { nyTomorrow, shouldRunDueCheck } from './ny-time';
import { gradesSince, readCourseLabels, readDueItems, readNewGrades, readSyncStatus } from './sources';

/** Why a tick ran — carried into the log line and returned to the caller. */
export type TickReason = 'launch' | 'interval' | 'focus' | 'resume' | 'manual' | 'test';

export type TickOutcome =
  | 'fired'
  | 'quiet'
  | 'initialised'
  | 'skipped-busy'
  | 'skipped-no-session'
  | 'skipped-read-failed'
  | 'skipped-write-failed';

export interface TickResult {
  readonly reason: TickReason;
  readonly outcome: TickOutcome;
  readonly toastCount: number;
}

/** Only what the scheduler needs from a timer, so tests can drive it by hand. */
export interface TimerHandle {
  readonly id: unknown;
}

export interface Timers {
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

/** `globalThis`'s timers, with `unref()` left alone: the poller keeps the app alive. */
export const systemTimers: Timers = {
  setInterval: (callback, ms) => ({ id: setInterval(callback, ms) }),
  clearInterval: (handle) => clearInterval(handle.id as ReturnType<typeof setInterval>),
};

/** The rows one tick works from. The test hook (C-10) supplies these directly. */
export interface TickRows {
  readonly sync: SyncStatusRow | null;
  readonly grades: readonly GradeRow[];
  /** `null` when the daily due check did not run on this tick. */
  readonly due: readonly DueRow[] | null;
  readonly courses: readonly CourseLabel[];
}

export interface PollerConfig {
  readonly pollIntervalMinutes: number;
  /** `HH:MM`, New York (C-2). */
  readonly dueReminderTime: string;
}

export interface PollerDeps {
  readonly config: PollerConfig;
  readonly store: WatermarkStore;
  readonly notifier: Notifier;
  /** The web session's access token, or `null` when it is unreadable or expired (C-5). */
  readonly getSession: () => Promise<WebSession | null>;
  /** Bind a `RestGet` to the tick's session. W-25's `core/rest.ts` supplies the transport. */
  readonly createRest: (session: WebSession) => RestGet;
  readonly clock?: () => Date;
  readonly timers?: Timers;
  readonly log?: Logger;
}

export interface Poller {
  /** Launch tick plus the interval. Safe to call twice; the second call is a no-op. */
  start(): Promise<TickResult>;
  stop(): void;
  /** The tray's *Check now* (C-12) and anything else that wants one tick, now. */
  runOnce(reason?: TickReason): Promise<TickResult>;
  /** Window focus. Throttled to at most one tick per 60 s (C-7). */
  onFocus(): Promise<TickResult>;
  /** `powerMonitor` `resume`. */
  onResume(): Promise<TickResult>;
  /** One tick from rows supplied directly — the e2e test hook's `tick(fixture)` (C-10). */
  runWithRows(rows: TickRows, reason?: TickReason): Promise<TickResult>;
}

/** C-7: "on window focus (at most once per 60 s)". */
export const FOCUS_THROTTLE_MS = 60_000;

const MINUTE_MS = 60_000;

function skipped(reason: TickReason, outcome: TickOutcome): TickResult {
  return { reason, outcome, toastCount: 0 };
}

export function createPoller(deps: PollerDeps): Poller {
  const clock = deps.clock ?? (() => new Date());
  const timers = deps.timers ?? systemTimers;
  const log = deps.log ?? silentLogger;

  let inFlight: Promise<TickResult> | null = null;
  let interval: TimerHandle | null = null;
  let started = false;
  let lastFocusTickAt: number | null = null;
  /** C-6: the labels are read once per launch. */
  let courseLabels: readonly CourseLabel[] | null = null;

  /** Serialise every entry point through one in-flight slot; never queue. */
  async function exclusive(
    reason: TickReason,
    body: () => Promise<TickResult>,
  ): Promise<TickResult> {
    if (inFlight) {
      log.info(`tick (${reason}) skipped: a tick is already running`);
      return skipped(reason, 'skipped-busy');
    }
    const run = body().catch((error): TickResult => {
      // Nothing above this point is allowed to reject: a failed tick changes nothing and
      // the next one tries again.
      log.error(`tick (${reason}) failed: ${describeError(error)}`);
      return skipped(reason, 'skipped-read-failed');
    });
    inFlight = run;
    try {
      return await run;
    } finally {
      inFlight = null;
    }
  }

  /** Toasts, then the watermark — C-7 rule 4's order. */
  async function deliver(
    reason: TickReason,
    rows: TickRows,
    now: Date,
    watermark: Watermark,
    advanceTo: Date = now,
  ): Promise<TickResult> {
    const result = reduce({
      sync: rows.sync,
      grades: rows.grades,
      due: rows.due,
      now,
      watermark,
      courses: rows.courses,
      advanceTo,
    });

    for (const toast of result.toasts) {
      try {
        await deps.notifier.show(toast);
      } catch (error) {
        // A toast Windows refused must not cost the watermark write; the key is still
        // recorded so a refused toast is not retried forever.
        log.warn(`notifier refused ${toast.key}: ${describeError(error)}`);
      }
    }

    try {
      await deps.store.write(result.watermark);
    } catch (error) {
      log.error(`watermark write failed: ${describeError(error)}`);
      return { reason, outcome: 'skipped-write-failed', toastCount: result.toasts.length };
    }

    log.info(`tick (${reason}) fired ${result.toasts.length} toast(s)`);
    return {
      reason,
      outcome: result.toasts.length > 0 ? 'fired' : 'quiet',
      toastCount: result.toasts.length,
    };
  }

  async function tick(reason: TickReason): Promise<TickResult> {
    const now = clock();

    const session = await deps.getSession();
    if (!session) {
      log.info(`tick (${reason}) skipped: no readable session`);
      return skipped(reason, 'skipped-no-session');
    }

    const stored = await deps.store.read();
    if (!stored) {
      // First launch (or an unreadable file): record `lastSeenAt = now` and stop. Nothing
      // historical can fire behind it, and the next tick works normally.
      await deps.store.write(initialWatermark(now));
      log.info(`tick (${reason}): watermark initialised, nothing historical fires`);
      return skipped(reason, 'initialised');
    }

    const get = deps.createRest(session);
    let rows: TickRows;
    let advanceTo = now;
    try {
      if (!courseLabels) courseLabels = await readCourseLabels(get);
      const runDue = shouldRunDueCheck({
        now,
        dueReminderTime: deps.config.dueReminderTime,
        dueCheckedOn: stored.dueCheckedOn,
      });
      // R2-1: read from the overlap window behind the watermark, floored at `notifyFloor`.
      const [sync, grades, due] = await Promise.all([
        readSyncStatus(get),
        readNewGrades(get, gradesSince(stored)),
        runDue ? readDueItems(get, nyTomorrow(now)) : Promise.resolve(null),
      ]);

      if (!grades.complete) {
        // R2-2: more rows exist than this tick read. Hold `lastSeenAt` at the last row it
        // did read, so the remainder is still ahead of the watermark next tick. A tick that
        // read nothing at all leaves the watermark exactly where it was.
        const lastRow = grades.rows[grades.rows.length - 1];
        const truncatedAt = lastRow ? Date.parse(lastRow.seen_at) : Number.NaN;
        advanceTo = Number.isNaN(truncatedAt) ? new Date(Date.parse(stored.lastSeenAt)) : new Date(truncatedAt);
        log.warn(
          `tick (${reason}) read ${grades.rows.length} grade row(s) and there are more; ` +
            `holding the watermark at ${advanceTo.toISOString()}`,
        );
      }

      rows = { sync, grades: grades.rows, due, courses: courseLabels };
    } catch (error) {
      log.warn(`tick (${reason}) read failed, changing nothing: ${describeError(error)}`);
      return skipped(reason, 'skipped-read-failed');
    }

    return deliver(reason, rows, now, stored, advanceTo);
  }

  return {
    async start(): Promise<TickResult> {
      if (started) return skipped('launch', 'skipped-busy');
      started = true;
      const minutes = Math.max(1, Math.trunc(deps.config.pollIntervalMinutes));
      interval = timers.setInterval(() => {
        void exclusive('interval', () => tick('interval'));
      }, minutes * MINUTE_MS);
      return exclusive('launch', () => tick('launch'));
    },

    stop(): void {
      if (interval) timers.clearInterval(interval);
      interval = null;
      started = false;
    },

    runOnce(reason: TickReason = 'manual'): Promise<TickResult> {
      return exclusive(reason, () => tick(reason));
    },

    onFocus(): Promise<TickResult> {
      const at = clock().getTime();
      if (lastFocusTickAt !== null && at - lastFocusTickAt < FOCUS_THROTTLE_MS) {
        return Promise.resolve(skipped('focus', 'skipped-busy'));
      }
      lastFocusTickAt = at;
      return exclusive('focus', () => tick('focus'));
    },

    onResume(): Promise<TickResult> {
      return exclusive('resume', () => tick('resume'));
    },

    runWithRows(rows: TickRows, reason: TickReason = 'test'): Promise<TickResult> {
      return exclusive(reason, async () => {
        const now = clock();
        const { watermark } = await loadOrInitialise(deps.store, now);
        return deliver(reason, rows, now, watermark);
      });
    },
  };
}
