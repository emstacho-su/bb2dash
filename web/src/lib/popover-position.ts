/**
 * Where an anchored popover goes (Phase 12b, T-2 / P-planner-5).
 *
 * Pure arithmetic over rectangles: no DOM, no React, no dependency. The
 * component measures the anchor, itself and the window and hands the numbers
 * over; this decides, and nothing here reads or writes anything.
 *
 * The rule, in words: sit under the item, centred on it; flip above when there
 * is no room below and there is room above; then clamp into the area the
 * popover is allowed to occupy, which is the viewport intersected with the
 * scrolling planner board, inset by a margin so it never touches an edge. An
 * area too small to hold the popover pins it to the area's top-left rather than
 * pushing it out of sight.
 *
 * Every co-ordinate is viewport-relative, because that is what
 * `getBoundingClientRect()` returns and what `position: fixed` consumes.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type PopoverPlacement = 'below' | 'above';

export interface PopoverPlacementResult {
  top: number;
  left: number;
  placement: PopoverPlacement;
}

export interface PlacePopoverInput {
  /** The element the popover belongs to, in viewport co-ordinates. */
  anchor: Rect;
  /** How big the popover measured. */
  popover: Size;
  viewport: Size;
  /** The scrolling container it must stay inside, when there is one. */
  bounds?: Rect | null;
  /** Clear space between the anchor and the popover. */
  gap?: number;
  /** Clear space kept at every edge of the area. */
  margin?: number;
}

/** Default clear space between the anchor and the popover. */
export const POPOVER_GAP = 8;
/** Default clear space kept at every edge of the allowed area. */
export const POPOVER_EDGE_MARGIN = 8;

/** The edges of a rectangle, as numbers rather than a shape. */
interface Edges {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

function edgesOf(rect: Rect): Edges {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };
}

/** The overlap of two boxes. Returns a new object; neither input is touched. */
function intersect(a: Edges, b: Edges): Edges {
  return {
    top: Math.max(a.top, b.top),
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

/**
 * Hold `value` inside [`min`, `max`]. When the range is empty — the area cannot
 * hold the popover at all — `min` wins, so the popover is pinned to the start
 * of the area instead of being pushed past its end.
 */
function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placePopover(input: PlacePopoverInput): PopoverPlacementResult {
  const gap = input.gap ?? POPOVER_GAP;
  const margin = input.margin ?? POPOVER_EDGE_MARGIN;
  const { anchor, popover } = input;

  const viewportEdges: Edges = {
    top: 0,
    left: 0,
    right: input.viewport.width,
    bottom: input.viewport.height,
  };
  const outer = input.bounds ? intersect(viewportEdges, edgesOf(input.bounds)) : viewportEdges;
  const area: Edges = {
    top: outer.top + margin,
    left: outer.left + margin,
    right: outer.right - margin,
    bottom: outer.bottom - margin,
  };

  const belowTop = anchor.top + anchor.height + gap;
  const aboveTop = anchor.top - gap - popover.height;

  const fitsBelow = belowTop + popover.height <= area.bottom;
  const fitsAbove = aboveTop >= area.top;
  const placement: PopoverPlacement = fitsBelow || !fitsAbove ? 'below' : 'above';

  const wantedTop = placement === 'below' ? belowTop : aboveTop;
  const wantedLeft = anchor.left + anchor.width / 2 - popover.width / 2;

  return {
    top: Math.round(clamp(wantedTop, area.top, area.bottom - popover.height)),
    left: Math.round(clamp(wantedLeft, area.left, area.right - popover.width)),
    placement,
  };
}
