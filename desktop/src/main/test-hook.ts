/**
 * C-10 — the one seam the e2e suites use, shared by both halves of the shell.
 *
 * Under `BB2DASH_TEST=1` the pieces that would touch the operating system record
 * instead: the terminal spawn and the tray menu (C-8, C-12) as *events*, and the
 * toasts and deep-link navigations (C-7) through a `Recorder`. Both halves land on
 * one object, `globalThis.__bb2dashTest`, reachable from the main process alone —
 * Playwright calls it through `electronApp.evaluate`. It is not exposed to the
 * renderer and it is not an IPC channel.
 *
 * The surface is **merged**, never assigned over: `index.ts` installs the tray part
 * and `poller-wiring.ts` installs the poller part, in that order, and neither may
 * clobber the other. `recorded()` is rebuilt from named slots rather than by
 * wrapping the previous one, so installing twice cannot nest it.
 *
 * ```
 * globalThis.__bb2dashTest = {
 *   recorded(): { events, toasts, navigations },  // plus anything a foreign installer added
 *   tick(fixture),          // one poller tick from fixture rows      (W-26)
 *   clickToast(key),        // replay a recorded toast's click        (W-26)
 *   resetNotifications(),   // clear the toast/navigation recorder    (W-26)
 *   clickTrayItem(label),   // fire a tray menu item by label         (W-25)
 * }
 * ```
 */

import type { Toast } from '../core/types';
import type { TickResult, TickRows } from '../core/poller/scheduler';

/** True when the shell is running under a Playwright suite. */
export function isTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['BB2DASH_TEST'] === '1';
}

/**
 * The process-wide answer, read once at import. `recordEvent` is called from hot
 * paths that have no `env` to hand; `installTestHook` takes one so the unit suite
 * can drive it without touching `process.env`.
 */
export const IS_TEST_MODE = isTestMode();

// --- W-25's half: a flat event log ------------------------------------------

export interface RecordedEvent {
  readonly kind: string;
  readonly at: string;
  readonly payload: unknown;
}

const events: RecordedEvent[] = [];

/** Append one event. A no-op outside test mode, so callers need no branch. */
export function recordEvent(kind: string, payload: unknown): void {
  if (!IS_TEST_MODE) return;
  events.push(Object.freeze({ kind, at: new Date().toISOString(), payload }));
}

/** A copy, newest last. */
export function recordedEvents(): readonly RecordedEvent[] {
  return events.slice();
}

// --- W-26's half: a toast / navigation recorder ------------------------------

export interface RecordedToast extends Toast {
  /** ISO instant, so a test can assert ordering without depending on array position. */
  readonly shownAt: string;
}

export interface RecordedNavigation {
  readonly route: string;
  readonly accepted: boolean;
  readonly at: string;
}

export interface Recorder {
  recordToast(toast: Toast): void;
  recordNavigation(route: string, accepted: boolean): void;
  toasts(): readonly RecordedToast[];
  navigations(): readonly RecordedNavigation[];
  reset(): void;
}

/** An in-memory recorder. One per process; `createNotifier` and `createDeeplink` share it. */
export function createRecorder(clock: () => Date = () => new Date()): Recorder {
  let toasts: RecordedToast[] = [];
  let navigations: RecordedNavigation[] = [];
  return {
    recordToast(toast) {
      toasts = [...toasts, { ...toast, shownAt: clock().toISOString() }];
    },
    recordNavigation(route, accepted) {
      navigations = [...navigations, { route, accepted, at: clock().toISOString() }];
    },
    toasts: () => toasts,
    navigations: () => navigations,
    reset() {
      toasts = [];
      navigations = [];
    },
  };
}

/** What `recorded()` returns once both halves have installed. */
export interface RecordedState {
  readonly events: readonly RecordedEvent[];
  readonly toasts: readonly RecordedToast[];
  readonly navigations: readonly RecordedNavigation[];
}

// --- the shared surface ------------------------------------------------------

type RecordedFn = () => Record<string, unknown>;

interface TestHookSurface {
  recorded?: RecordedFn;
  tick?: (fixture: TickRows) => Promise<TickResult>;
  clickToast?: (key: string) => boolean;
  resetNotifications?: () => void;
  clickTrayItem?: (label: string) => void;
  [extra: string]: unknown;
}

/** Marks the `recorded` this module owns, so a re-install does not capture its own output. */
const OURS = Symbol.for('bb2dash.test-hook.recorded');

/** Whatever a foreign installer put on `recorded` before us; its keys are preserved. */
let foreignRecorded: RecordedFn | null = null;
/** Set once `installTestHook` has run; until then `recorded()` reports events only. */
let pollerRecorder: Recorder | null = null;

/**
 * The shared object, created on first use. The slots are module state but the object
 * is the run's; a host that has to be created is a new run, so both slots are cleared
 * with it. (Only a unit suite ever sees that happen twice in one process.)
 */
function surface(): TestHookSurface {
  const host = globalThis as typeof globalThis & { __bb2dashTest?: TestHookSurface };
  if (!host.__bb2dashTest) {
    // A plain property, deliberately: a non-configurable one would make the second
    // installer throw. Nothing outside the main process can see it.
    host.__bb2dashTest = {};
    foreignRecorded = null;
    pollerRecorder = null;
  }
  return host.__bb2dashTest;
}

/**
 * Rebuild `recorded` from the slots. Called by every installer, so the result is the
 * same however many times, and in whichever order, they ran.
 */
function refreshRecorded(hook: TestHookSurface): void {
  const existing = hook.recorded;
  if (existing && (existing as { [OURS]?: true })[OURS] !== true) {
    foreignRecorded = existing;
  }

  const captured = foreignRecorded;
  const recorded: RecordedFn = () => ({
    ...(captured ? captured() : {}),
    events: recordedEvents(),
    ...(pollerRecorder
      ? { toasts: pollerRecorder.toasts(), navigations: pollerRecorder.navigations() }
      : {}),
  });
  (recorded as { [OURS]?: true })[OURS] = true;
  hook.recorded = recorded;
}

export interface TestHookParts {
  readonly recorder: Recorder;
  /** Drives one tick from fixture rows — the poller's `runWithRows`. */
  readonly tick: (fixture: TickRows) => Promise<TickResult>;
  /** Replays a recorded toast's click through the real deep-link validator. */
  readonly clickToast: (key: string) => boolean;
  /** Fires a tray menu item by label; Playwright cannot click a Windows tray icon. */
  readonly clickTrayItem?: (label: string) => void;
}

/**
 * Install (or extend) `globalThis.__bb2dashTest` with the poller half. Existing
 * entries, including a foreign `recorded()`, are preserved.
 */
export function installTestHook(parts: TestHookParts, env: NodeJS.ProcessEnv = process.env): void {
  if (!isTestMode(env)) return;
  const hook = surface();
  pollerRecorder = parts.recorder;
  hook.tick = (fixture: TickRows) => parts.tick(fixture);
  hook.clickToast = (key: string) => parts.clickToast(key);
  hook.resetNotifications = () => parts.recorder.reset();
  if (parts.clickTrayItem) hook.clickTrayItem = parts.clickTrayItem;
  refreshRecorded(hook);
}

export interface ShellTestHookParts {
  /** Fires a tray menu item by label (C-12). */
  readonly clickTrayItem: (label: string) => void;
}

/**
 * The shell half, installed by `index.ts` before the poller exists. It brings
 * `recorded()` into being so the e2e suite can read `events` even on a run where
 * the poller never started.
 */
export function installShellTestHook(
  parts: ShellTestHookParts,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isTestMode(env)) return;
  const hook = surface();
  hook.clickTrayItem = (label: string) => parts.clickTrayItem(label);
  refreshRecorded(hook);
}
