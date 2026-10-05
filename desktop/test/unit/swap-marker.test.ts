/**
 * The app quits for an update only once the handed-off helper has written its pending-swap
 * marker naming the build (2026-10-04, W-71). These pin which marker counts as "the helper
 * for this press has started".
 */

import { describe, expect, it } from 'vitest';

import { PENDING_SWAP_FILE, judgeSwapMarker } from '../../src/core/update/swap-marker';

const TREE = '31215cf503f565cd7113d01b14266e4b2ce1000d';
const OTHER = 'a'.repeat(40);

const marker = (text: string, modifiedMs: number) => ({ text, modifiedMs });

describe('judgeSwapMarker', () => {
  it('is the name Invoke-UpdateSwap writes ($script:PendingSwapFile)', () => {
    expect(PENDING_SWAP_FILE).toBe('swap-pending');
  });

  it('waits while there is no marker', () => {
    expect(judgeSwapMarker(null, null, TREE)).toEqual({ kind: 'waiting' });
  });

  it('counts a new marker naming the tree as started, surrounding whitespace and all', () => {
    expect(judgeSwapMarker(marker(TREE, 5), null, TREE)).toEqual({ kind: 'started' });
    expect(judgeSwapMarker(marker(`${TREE}\r\n`, 5), null, TREE)).toEqual({ kind: 'started' });
  });

  it('counts a rewritten marker as new: a later write time than before the press', () => {
    expect(judgeSwapMarker(marker(TREE, 9), marker(TREE, 5), TREE)).toEqual({ kind: 'started' });
    expect(judgeSwapMarker(marker(TREE, 9), marker(OTHER, 5), TREE)).toEqual({ kind: 'started' });
  });

  it('never takes a marker left over from before the press for this helper', () => {
    expect(judgeSwapMarker(marker(TREE, 5), marker(TREE, 5), TREE)).toEqual({ kind: 'waiting' });
    expect(judgeSwapMarker(marker(OTHER, 5), marker(OTHER, 5), TREE)).toEqual({ kind: 'waiting' });
  });

  it('waits through a marker that is still being written (empty or partial)', () => {
    expect(judgeSwapMarker(marker('', 5), null, TREE)).toEqual({ kind: 'waiting' });
    expect(judgeSwapMarker(marker(TREE.slice(0, 12), 5), null, TREE)).toEqual({ kind: 'waiting' });
  });

  it('reports a new marker naming another build', () => {
    expect(judgeSwapMarker(marker(OTHER, 5), null, TREE)).toEqual({ kind: 'other-tree', tree: OTHER });
  });
});
