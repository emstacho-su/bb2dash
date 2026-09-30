/**
 * New builds without a Windows logon (Stack, 2026-09-30).
 *
 * The logon builder (`desktop/launch/logon-build.ps1`, task `Bb2dash-LogonBuild`) used to
 * run only at logon, so a laptop that sleeps for days never built anything new. The app now
 * starts that same task at launch and every `BUILDER_INTERVAL_HOURS`. The builder no-ops
 * when `desktop/` is unchanged and, while the app is running, never repoints `current`, so
 * starting it is always safe; this module only makes sure it is started at most once at a
 * time from here.
 *
 * Portable: the task start is injected (`main/update-os.ts` is the Windows adapter).
 */

import { type Logger, describeError } from '../redact';

export const BUILDER_INTERVAL_HOURS = 6;
export const BUILDER_INTERVAL_MS = BUILDER_INTERVAL_HOURS * 60 * 60 * 1000;

/** What the adapter reports: it started the task, or the task was already running. */
export type BuilderStartOutcome = 'started' | 'already-running';
export type BuilderTriggerOutcome = BuilderStartOutcome | 'in-flight' | 'failed';

export interface BuilderTriggerDeps {
  readonly startTask: () => Promise<BuilderStartOutcome>;
  readonly log: Logger;
  readonly intervalMs?: number;
}

export interface BuilderTrigger {
  /** Start the builder now unless a start from here is still in flight. Never rejects. */
  trigger(reason: string): Promise<BuilderTriggerOutcome>;
  /** Trigger once now, then every interval. */
  start(): void;
  stop(): void;
}

export function createBuilderTrigger(deps: BuilderTriggerDeps): BuilderTrigger {
  const intervalMs = deps.intervalMs ?? BUILDER_INTERVAL_MS;
  let inFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const trigger = async (reason: string): Promise<BuilderTriggerOutcome> => {
    if (inFlight) {
      deps.log.info(`builder trigger (${reason}) skipped: a start is still in flight`);
      return 'in-flight';
    }
    inFlight = true;
    try {
      const outcome = await deps.startTask();
      deps.log.info(
        outcome === 'started'
          ? `builder task started (${reason})`
          : `builder task already running (${reason}); not starting a second`,
      );
      return outcome;
    } catch (error) {
      deps.log.error(`builder task could not be started (${reason}): ${describeError(error)}`);
      return 'failed';
    } finally {
      inFlight = false;
    }
  };

  return {
    trigger,
    start(): void {
      if (timer !== null) return;
      void trigger('app start');
      timer = setInterval(() => void trigger('interval'), intervalMs);
      // The schedule must never be what keeps the process alive; the tray does that.
      (timer as { unref?: () => void }).unref?.();
    },
    stop(): void {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
