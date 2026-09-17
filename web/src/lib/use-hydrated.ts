'use client';

/**
 * Whether this render may use browser-only state.
 *
 * False on the server and during hydration, true on every client render after
 * that. `useSyncExternalStore` hydrates with `getServerSnapshot` and then
 * re-renders with `getSnapshot`, so a component can render the same markup the
 * server sent and switch to the real thing straight after — without an effect,
 * a flash of state, or React throwing the server tree away (error #418).
 *
 * Why /planner needs it: the grid hydrates inside a Suspense boundary, after
 * `PersistQueryClientProvider` has restored the week from localStorage, and the
 * server reads "today" and "now" in UTC. Either one makes the first client
 * render differ from the server HTML.
 */

import { useSyncExternalStore } from 'react';

/** Nothing to subscribe to: the value changes once, at hydration. */
function subscribe(): () => void {
  return () => {};
}

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
