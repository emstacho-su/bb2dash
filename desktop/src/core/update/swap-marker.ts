/**
 * Has the Update now helper for this press started? (2026-10-04, W-71)
 *
 * The helper (`desktop/launch/update-now.ps1`, `Invoke-UpdateSwap`) writes
 * `<stateDir>\swap-pending` first thing, with the tree it is switching to as its only
 * content, and removes it when the swap is over. The app quits for the swap only once that
 * marker names its build, so a helper that never ran (the 2026-10-04 failure: the app quit,
 * nothing swapped) leaves the app running on its build instead.
 *
 * A marker counts only when it was written after the press: one whose write time is
 * unchanged since before the helper was started is left over from an earlier run that was
 * killed before its cleanup, and says nothing about this one.
 *
 * `other-tree` is the second line of defence. The helper refuses first: `Invoke-UpdateSwap`
 * will not touch a marker naming another build that is younger than its own two waits, so it
 * writes nothing and exits, and the app then times out waiting. The app only sees `other-tree`
 * when another helper writes the marker after this press.
 */

import { isTree } from './build-paths';

/** `$script:PendingSwapFile` in `Bb2dashLaunch.psm1`; keep the two in step. */
export const PENDING_SWAP_FILE = 'swap-pending';

/** What one read of the marker saw: its text and its last-write time (epoch ms). */
export interface SwapMarkerSnapshot {
  readonly text: string;
  readonly modifiedMs: number;
}

export type SwapMarkerVerdict =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'started' }
  | { readonly kind: 'other-tree'; readonly tree: string };

const WAITING: SwapMarkerVerdict = Object.freeze({ kind: 'waiting' });
const STARTED: SwapMarkerVerdict = Object.freeze({ kind: 'started' });

/**
 * `seen` is the marker now, `before` the marker as it was before the helper was started
 * (`null` for none). Waiting covers no marker, a left-over one and one still being written.
 */
export function judgeSwapMarker(
  seen: SwapMarkerSnapshot | null,
  before: SwapMarkerSnapshot | null,
  tree: string,
): SwapMarkerVerdict {
  if (seen === null) return WAITING;
  if (before !== null && seen.modifiedMs === before.modifiedMs) return WAITING;
  const named = seen.text.trim();
  if (!isTree(named)) return WAITING;
  if (named === tree) return STARTED;
  return Object.freeze({ kind: 'other-tree', tree: named });
}
