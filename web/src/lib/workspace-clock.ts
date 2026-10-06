/**
 * bb2dash — the Workspace page's own clock (Phase 21, the review round of
 * 2026-10-06; ruling V4, finding CR-8).
 *
 * The page must not set the browser's wall clock beside the database's: a
 * laptop whose clock is minutes out would call a running service offline, or a
 * stopped one running. So every "how long ago" the Workspace decides by is
 * counted on one clock, this page's monotonic one (`performance.now()`), from a
 * moment this page saw itself. A changed system clock does not move it.
 *
 *   * `useMonotonicNow`  that clock for a render. A render may not read a clock,
 *                        so it is an external store, as `use-now.ts` is for the
 *                        wall clock.
 *   * `stampRead`        the moment this page read a row. The database says how
 *                        old the heartbeat was at that moment
 *                        (`polled_age_seconds`); the time since is this page's.
 *
 * NOTHING HERE IS KEPT IN THE QUERY CACHE. That cache is saved to localStorage,
 * and a monotonic reading means nothing to the next page load. So a stamp is
 * held beside the row, by the row's identity: a row restored from the saved
 * cache is another object, has no stamp, and reads as "not read by this page".
 */

import { useCallback, useSyncExternalStore } from 'react';

/** This page's monotonic clock: ms since the page began. */
export function monotonicNowMs(): number {
  return performance.now();
}

/* ---------------------------------------------------------------------------
 * The clock for a render
 * ------------------------------------------------------------------------ */

let lastRead = 0;
const listeners = new Set<() => void>();

function read(): void {
  lastRead = monotonicNowMs();
  for (const listener of listeners) listener();
}

function snapshot(): number {
  return lastRead;
}

/** Nothing rendered on the server depends on the clock; the first client render re-reads it. */
function serverSnapshot(): number {
  return 0;
}

/**
 * The monotonic clock as external state: re-read when a component subscribes,
 * then every `tickMs`. One store for every caller, so they share one reading.
 */
export function useMonotonicNow(tickMs: number): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);
      read();
      const timer = window.setInterval(read, tickMs);
      return () => {
        window.clearInterval(timer);
        listeners.delete(onChange);
      };
    },
    [tickMs],
  );
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/* ---------------------------------------------------------------------------
 * The moment a row was read
 * ------------------------------------------------------------------------ */

const readAt = new WeakMap<object, number>();

/** Note that this page has just read `row`, and hand it back. */
export function stampRead<Row extends object>(row: Row): Row {
  readAt.set(row, monotonicNowMs());
  return row;
}

/** When this page read `row`, on its own clock; null for a row it did not read itself. */
export function readAtMs(row: object): number | null {
  return readAt.get(row) ?? null;
}
