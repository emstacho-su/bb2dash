/**
 * The e2e test surface (C-10): under `BB2DASH_TEST=1` the notifier and the deep-link
 * navigator record instead of touching the OS, and `globalThis.__bb2dashTest` exposes
 * `recorded()` and `tick(fixture)` for `electronApp.evaluate`.
 *
 * The hook is *merged* into whatever is already on `globalThis.__bb2dashTest` rather than
 * assigned over it, because W-25's sync-terminal recorder installs its own entries there
 * (C-8) and neither worker may clobber the other's.
 *
 * Nothing here exists outside test mode: `installTestHook` returns immediately when
 * `BB2DASH_TEST` is not `1`.
 */

import type { Toast } from '../core/types';
import type { TickResult, TickRows } from '../core/poller/scheduler';

/** True when the shell is running under the Playwright suite. */
export function isTestMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['BB2DASH_TEST'] === '1';
}

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

/** What `recorded()` returns for this worker's half of the surface. */
export interface RecordedState {
  readonly toasts: readonly RecordedToast[];
  readonly navigations: readonly RecordedNavigation[];
}

interface TestHookSurface {
  recorded?: () => Record<string, unknown>;
  tick?: (fixture: TickRows) => Promise<TickResult>;
  clickToast?: (key: string) => boolean;
  resetNotifications?: () => void;
  [extra: string]: unknown;
}

function surface(): TestHookSurface {
  const host = globalThis as typeof globalThis & { __bb2dashTest?: TestHookSurface };
  if (!host.__bb2dashTest) host.__bb2dashTest = {};
  return host.__bb2dashTest;
}

export interface TestHookParts {
  readonly recorder: Recorder;
  /** Drives one tick from fixture rows — the poller's `runWithRows`. */
  readonly tick: (fixture: TickRows) => Promise<TickResult>;
  /** Replays a recorded toast's click through the real deep-link validator. */
  readonly clickToast: (key: string) => boolean;
}

/**
 * Install (or extend) `globalThis.__bb2dashTest`. Existing entries are preserved, and an
 * existing `recorded()` is called and merged so W-25's recorded spawns stay visible.
 */
export function installTestHook(parts: TestHookParts, env: NodeJS.ProcessEnv = process.env): void {
  if (!isTestMode(env)) return;
  const hook = surface();
  const previousRecorded = hook.recorded;

  hook.recorded = (): Record<string, unknown> => ({
    ...(previousRecorded ? previousRecorded() : {}),
    toasts: parts.recorder.toasts(),
    navigations: parts.recorder.navigations(),
  });
  hook.tick = (fixture: TickRows) => parts.tick(fixture);
  hook.clickToast = (key: string) => parts.clickToast(key);
  hook.resetNotifications = () => parts.recorder.reset();
}
