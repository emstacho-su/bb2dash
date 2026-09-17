/**
 * C-10 — the one seam the e2e suite uses. Under `BB2DASH_TEST=1` the pieces
 * that would touch the operating system record instead: the terminal spawn
 * (C-8) and, when W-26's `notify.ts` lands, the toasts (C-7).
 *
 * `globalThis.__bb2dashTest` exists only in test mode, and it is reachable from
 * the main process alone — Playwright calls it through `electronApp.evaluate`.
 * It is not exposed to the renderer and is not an IPC channel.
 */

export const IS_TEST_MODE = process.env.BB2DASH_TEST === '1';

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

export interface TestHookHandlers {
  /** Run one poller tick, as the tray's *Check now* does. */
  readonly tick: () => Promise<void>;
  /** Fire a tray menu item by label: Playwright cannot click a tray icon. */
  readonly clickTrayItem: (label: string) => void;
}

export function installTestHook(handlers: TestHookHandlers): void {
  if (!IS_TEST_MODE) return;
  Object.defineProperty(globalThis, '__bb2dashTest', {
    value: Object.freeze({
      recorded: (): readonly RecordedEvent[] => recordedEvents(),
      tick: (): Promise<void> => handlers.tick(),
      clickTrayItem: (label: string): void => handlers.clickTrayItem(label),
    }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
