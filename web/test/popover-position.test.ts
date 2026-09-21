/**
 * Where the planner's small popover goes (T-2, P-planner-5).
 *
 * `placePopover` is the whole of the geometry: the component measures, this
 * decides. Three behaviours have to hold — it sits under the item it was opened
 * from, it flips above when there is no room below, and it never leaves the
 * area it is allowed to be in, which is the viewport intersected with the
 * scrolling planner board.
 */

import { describe, expect, it } from 'vitest';
import {
  POPOVER_EDGE_MARGIN,
  POPOVER_GAP,
  placePopover,
  type Rect,
} from '@/lib/popover-position';

const VIEWPORT = { width: 1200, height: 800 };
const POPOVER = { width: 300, height: 200 };

/** An anchor in the middle of the screen, with room on every side. */
function anchor(over: Partial<Rect> = {}): Rect {
  return { top: 300, left: 450, width: 120, height: 40, ...over };
}

describe('placePopover — the default place', () => {
  it('sits under the anchor, centred on it', () => {
    const at = placePopover({ anchor: anchor(), popover: POPOVER, viewport: VIEWPORT });

    expect(at.placement).toBe('below');
    expect(at.top).toBe(300 + 40 + POPOVER_GAP);
    // 450 + 120/2 - 300/2 = 360
    expect(at.left).toBe(360);
  });

  it('honours the gap it is given', () => {
    const at = placePopover({
      anchor: anchor(),
      popover: POPOVER,
      viewport: VIEWPORT,
      gap: 12,
    });
    expect(at.top).toBe(352);
  });
});

describe('placePopover — flipping', () => {
  it('goes above when the popover would not fit below', () => {
    const at = placePopover({
      anchor: anchor({ top: 700, height: 40 }),
      popover: POPOVER,
      viewport: VIEWPORT,
    });

    expect(at.placement).toBe('above');
    expect(at.top).toBe(700 - POPOVER_GAP - POPOVER.height);
  });

  it('stays below when there is no room either way, and clamps instead', () => {
    const at = placePopover({
      anchor: anchor({ top: 10, height: 40 }),
      popover: { width: 300, height: 800 },
      viewport: VIEWPORT,
    });

    expect(at.placement).toBe('below');
    expect(at.top).toBe(POPOVER_EDGE_MARGIN);
  });

  it('prefers below when both fit', () => {
    const at = placePopover({
      anchor: anchor({ top: 400 }),
      popover: POPOVER,
      viewport: VIEWPORT,
    });
    expect(at.placement).toBe('below');
  });
});

describe('placePopover — clamping to the area', () => {
  it('does not run off the left edge', () => {
    const at = placePopover({
      anchor: anchor({ left: 0, width: 40 }),
      popover: POPOVER,
      viewport: VIEWPORT,
    });
    expect(at.left).toBe(POPOVER_EDGE_MARGIN);
  });

  it('does not run off the right edge', () => {
    const at = placePopover({
      anchor: anchor({ left: 1180, width: 20 }),
      popover: POPOVER,
      viewport: VIEWPORT,
    });
    expect(at.left).toBe(VIEWPORT.width - POPOVER.width - POPOVER_EDGE_MARGIN);
  });

  it('stays inside the scrolling planner when one is given', () => {
    const bounds: Rect = { top: 200, left: 200, width: 500, height: 400 };
    const at = placePopover({
      anchor: anchor({ top: 250, left: 210, width: 40 }),
      popover: POPOVER,
      viewport: VIEWPORT,
      bounds,
    });

    expect(at.left).toBe(bounds.left + POPOVER_EDGE_MARGIN);
    expect(at.top).toBeGreaterThanOrEqual(bounds.top + POPOVER_EDGE_MARGIN);
    expect(at.top + POPOVER.height).toBeLessThanOrEqual(
      bounds.top + bounds.height - POPOVER_EDGE_MARGIN,
    );
  });

  it('flips above rather than overhanging the bottom of the planner', () => {
    const bounds: Rect = { top: 100, left: 100, width: 900, height: 500 };
    const at = placePopover({
      anchor: anchor({ top: 500, left: 400, height: 40 }),
      popover: POPOVER,
      viewport: VIEWPORT,
      bounds,
    });

    expect(at.placement).toBe('above');
    expect(at.top).toBe(500 - POPOVER_GAP - POPOVER.height);
  });

  it('pins to the top of an area too short to hold it', () => {
    const bounds: Rect = { top: 300, left: 100, width: 900, height: 120 };
    const at = placePopover({
      anchor: anchor({ top: 310, left: 400, height: 20 }),
      popover: POPOVER,
      viewport: VIEWPORT,
      bounds,
    });
    expect(at.top).toBe(bounds.top + POPOVER_EDGE_MARGIN);
  });

  it('never returns a fractional pixel', () => {
    const at = placePopover({
      anchor: anchor({ top: 300.4, left: 450.7, width: 121, height: 41 }),
      popover: { width: 301, height: 200 },
      viewport: VIEWPORT,
    });
    expect(Number.isInteger(at.top)).toBe(true);
    expect(Number.isInteger(at.left)).toBe(true);
  });
});

describe('placePopover — purity', () => {
  it('does not touch what it was given', () => {
    const input = {
      anchor: anchor(),
      popover: { ...POPOVER },
      viewport: { ...VIEWPORT },
      bounds: { top: 0, left: 0, width: 1200, height: 800 },
    };
    const before = JSON.stringify(input);
    placePopover(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
