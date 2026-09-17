/**
 * Whether /planner's Assignments band is open (Phase 12b, P-planner-1).
 *
 * Stack asked for the band to be collapsible and **closed on arrival**: on most
 * days it holds a handful of date-only readings he has already seen, and it was
 * pushing the hour rows below the fold. Closed is therefore the default, not
 * merely the last state — a browser with no memory of him still opens closed.
 *
 * The storage rules are `lib/sidebar-preference.ts`'s, deliberately: read and
 * write are best-effort and never throw. A blocked-cookies browser, a private
 * window or a full quota all throw on `localStorage`, and none of those is a
 * reason to fail the planner — the default is a correct answer in all three.
 * As there, the swallowed error is the point, not an oversight.
 */

export const PLANNER_BAND_STORAGE_KEY = 'bb2dash.planner.assignments';

export type BandState = 'open' | 'closed';

/** What a reader with no stored choice gets (Stack: "hidden on default"). */
export const BAND_DEFAULT: BandState = 'closed';

function isBandState(value: unknown): value is BandState {
  return value === 'open' || value === 'closed';
}

/** The stored choice, or null when there is none, it is junk, or storage throws. */
export function readStoredBand(): BandState | null {
  try {
    const raw = globalThis.localStorage?.getItem(PLANNER_BAND_STORAGE_KEY);
    return isBandState(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Remember the choice. Silent no-op where storage is unavailable — see header. */
export function writeStoredBand(state: BandState): void {
  try {
    globalThis.localStorage?.setItem(PLANNER_BAND_STORAGE_KEY, state);
  } catch {
    /* storage unavailable; the preference simply does not survive the reload */
  }
}

/** The stored choice wins; without one, the band is closed. */
export function resolveBand(stored: BandState | null): BandState {
  return stored ?? BAND_DEFAULT;
}

/** The other state — what the toggle writes. */
export function toggleBand(state: BandState): BandState {
  return state === 'open' ? 'closed' : 'open';
}
