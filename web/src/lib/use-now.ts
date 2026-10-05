/**
 * bb2dash — the current instant as state (2026-10-05).
 *
 * A component that reads the clock during render is not idempotent (the React
 * compiler's purity rule says so), so a component that needs "now" takes it from
 * here: read once on mount, then re-read every `tickMs` while the caller wants a
 * ticking clock, and left alone (`null`) when it does not. The Sync button ticks
 * while a request is open, so a queued row that nothing claims turns to
 * "waiting on the container…" on time, and stops once the request closes.
 */

import { useEffect, useState } from 'react';

export function useNow(tickMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tickMs === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), tickMs);
    return () => window.clearInterval(timer);
  }, [tickMs]);
  return now;
}
