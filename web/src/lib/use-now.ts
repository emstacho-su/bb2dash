/**
 * bb2dash — the current instant as external state (2026-10-05).
 *
 * A component that reads the clock during render is not idempotent (the React
 * compiler's purity rule says so), and copying it into state from an effect is
 * what the lint config forbids. So the clock is an external store, read through
 * `useSyncExternalStore` like the other browser-only state in the app: the store
 * re-reads `Date.now()` whenever a component subscribes (a mount, or a change of
 * `tickMs`) and then every `tickMs` while one is asked for; `null` means read
 * once and leave it. The server snapshot is 0: nothing rendered on the server
 * depends on the clock, and the first client render re-reads it.
 *
 * One store for every caller, so two buttons on one page share one timer.
 */

import { useCallback, useSyncExternalStore } from 'react';

let lastRead = 0;
const listeners = new Set<() => void>();

function read(): void {
  lastRead = Date.now();
  for (const listener of listeners) listener();
}

function snapshot(): number {
  return lastRead;
}

function serverSnapshot(): number {
  return 0;
}

export function useNow(tickMs: number | null): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      listeners.add(onChange);
      read();
      if (tickMs === null) {
        return () => {
          listeners.delete(onChange);
        };
      }
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
