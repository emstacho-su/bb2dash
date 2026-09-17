/**
 * bb2dash — the planner grid's vertical geometry (Phase 12b, P-planner-2/3/4).
 *
 * Phase 11 gave every half-hour row the same 24px and let CSS multiply:
 * `top: calc(var(--slot) * 24px)`. That is fine until two things happen at
 * once. Stack's words: "the height of the block (for that hour, or however long
 * the block with overlapping items is) should scale up instead of cramming
 * assignments and classes into the same block and require scaling".
 *
 * So a row is no longer a constant. It is an entry in a **per-slot height
 * table**, and a slot's position is the cumulative sum of the rows above it.
 * One pure function, `slotToPx`, is that sum, and every consumer goes through
 * it — class blocks, due cards, planner-event segments, the now-line, the
 * gutter's hour labels, the hour rules and the half-hour click targets. Nothing
 * on the grid is allowed to do its own arithmetic, or the click that creates an
 * event at 2 PM lands at 2 PM only on weeks where nothing overlaps.
 *
 * THE RULES OF THE TABLE (Stack, answer 13: "Only hours with overlaps grow;
 * capped."):
 *
 *   * base is Phase 11's 24px, and a row with nothing crowding it stays there,
 *     so a week with no overlaps is pixel-for-pixel the grid he already knows;
 *   * a row grows one base height per concurrent lane — two overlapping blocks
 *     make it 48px, three 72px;
 *   * it stops at 4× (96px). Past the cap the side-by-side lanes carry the rest,
 *     exactly as they did before;
 *   * the seven day columns share one table, because they share one set of
 *     rows: the gutter's "3 PM" has to sit on the same line in all of them. The
 *     busiest day decides a row's height, never the week's total.
 *
 * TWO UNITS, kept apart. A *slot* is a half hour and is fractional — 15:45 is
 * slot 15.5. A *pixel* is where that lands on screen. Placement, clamping and
 * lane assignment all stay in slots (`planner-week.ts`, `planner-events-grid.ts`);
 * this module is the only place the two meet. Because the map is monotonic, a
 * clamp that holds in slots holds in pixels too.
 */

import { PLANNER_SLOT_COUNT } from './planner-week';

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------ */

/** A half-hour row with nothing crowding it — Phase 11's fixed row height. */
export const PLANNER_BASE_SLOT_PX = 24;

/** A row never grows past this many base heights (Stack: "capped"). */
export const PLANNER_MAX_SLOT_SCALE = 4;

/**
 * One line of text inside a block: `--text-xs` (11px) at the `line-height: 1.25`
 * `.block` sets, rounded up. Not a guess — both numbers are in the stylesheet.
 */
export const PLANNER_BLOCK_LINE_PX = 14;

/** `.block { padding: 3px 5px }` — the top and bottom of it. */
export const PLANNER_BLOCK_PADDING_PX = 6;

/** However tall a block gets, a title stops wrapping here. */
export const PLANNER_MAX_TITLE_LINES = 6;

/* ---------------------------------------------------------------------------
 * What each row is asked for
 * ------------------------------------------------------------------------ */

/**
 * A block, as this module sees it: where it sits in slots, and how many lanes'
 * worth of vertical room it asks of the rows it covers.
 *
 * `weight` is 1 for an ordinary block. A class block carrying nested due chips
 * asks for more, because those chips are stacked inside it rather than beside
 * it — that is what makes "a class block with nested due chips grows to fit
 * them" fall out of the same table as an overlap.
 */
export interface RowSpan {
  /** Slots from the top of the grid. */
  top: number;
  /** Height in slots. */
  height: number;
  /** Lanes' worth of room this block asks for; 1 unless it nests something. */
  weight: number;
}

/**
 * What one day column asks of each row: the summed weight of everything drawn
 * on it. With one block per row that is 1; with three overlapping blocks it is
 * 3, which is exactly the lane count `assignLanes` gives them.
 */
export function slotWeights(
  blocks: readonly RowSpan[],
  slotCount: number = PLANNER_SLOT_COUNT,
): number[] {
  const weights = new Array<number>(slotCount).fill(0);
  for (const block of blocks) {
    const first = Math.max(0, Math.floor(block.top));
    const last = Math.min(slotCount, Math.ceil(block.top + block.height));
    for (let slot = first; slot < last; slot += 1) {
      weights[slot] += block.weight;
    }
  }
  return weights;
}

/**
 * The week's demand: the busiest day per row. Monday and Tuesday each having a
 * clash at 3 PM is still a two-lane row, not a four-lane one.
 */
export function weekSlotWeights(
  blocksByDay: readonly (readonly RowSpan[])[],
  slotCount: number = PLANNER_SLOT_COUNT,
): number[] {
  const weights = new Array<number>(slotCount).fill(0);
  for (const day of blocksByDay) {
    const dayWeights = slotWeights(day, slotCount);
    for (let slot = 0; slot < slotCount; slot += 1) {
      weights[slot] = Math.max(weights[slot], dayWeights[slot]);
    }
  }
  return weights;
}

/* ---------------------------------------------------------------------------
 * The table
 * ------------------------------------------------------------------------ */

/** Phase 11's grid: every row the base height. */
export function baseSlotHeights(slotCount: number = PLANNER_SLOT_COUNT): number[] {
  return new Array<number>(slotCount).fill(PLANNER_BASE_SLOT_PX);
}

/** One height per row, from what each row was asked for. */
export function buildSlotHeights(
  weights: readonly number[],
  base: number = PLANNER_BASE_SLOT_PX,
  maxScale: number = PLANNER_MAX_SLOT_SCALE,
): number[] {
  return weights.map((weight) => {
    const lanes = Math.min(Math.max(Math.ceil(weight), 1), maxScale);
    return lanes * base;
  });
}

/** How tall the whole grid is. */
export function gridHeightPx(heights: readonly number[]): number {
  return heights.reduce((total, height) => total + height, 0);
}

/* ---------------------------------------------------------------------------
 * Slots ↔ pixels — the one map
 * ------------------------------------------------------------------------ */

/**
 * Where a slot position sits, in pixels from the top of the grid.
 *
 * Piecewise linear: whole rows sum, and a fraction of a row is that fraction of
 * its own height. Monotonic, continuous, and equal to `slot * 24` for as long
 * as no row has grown. A position off either end is clamped rather than
 * extrapolated — there is no grid out there to point at.
 */
export function slotToPx(slot: number, heights: readonly number[]): number {
  const clamped = Math.min(Math.max(slot, 0), heights.length);
  const whole = Math.floor(clamped);
  let px = 0;
  for (let index = 0; index < whole; index += 1) px += heights[index];
  const fraction = clamped - whole;
  if (fraction > 0 && whole < heights.length) px += heights[whole] * fraction;
  return px;
}

/**
 * The inverse: what time a pixel on the board is. The half-hour click targets
 * are real buttons laid out by `slotToPx`, so nothing in the UI needs to ask —
 * but the map being invertible is what *proves* a click below a grown row still
 * lands on the half hour it looks like, and the tests read the rendered offsets
 * back through this.
 */
export function pxToSlot(px: number, heights: readonly number[]): number {
  if (px <= 0) return 0;
  let remaining = px;
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    if (remaining < height) return index + remaining / height;
    remaining -= height;
  }
  return heights.length;
}

/** A block's box in pixels: what the stylesheet gets as `--top-px` / `--height-px`. */
export function spanPx(
  top: number,
  height: number,
  heights: readonly number[],
): { topPx: number; heightPx: number } {
  const topPx = slotToPx(top, heights);
  const bottomPx = slotToPx(top + height, heights);
  return { topPx, heightPx: Math.max(0, bottomPx - topPx) };
}

/* ---------------------------------------------------------------------------
 * Wrapping (P-planner-4)
 * ------------------------------------------------------------------------ */

/**
 * How many lines of title a block that tall has room for, once the lines it
 * always draws (the head, the room, the status row) have taken theirs.
 *
 * One line is the floor, and a one-line clamp is where the ellipsis comes from:
 * a compact half-hour block keeps the Phase 11 behaviour without a special
 * case. The ceiling stops a very tall block turning a title into a paragraph.
 */
export function titleLines(heightPx: number, otherLines: number): number {
  const rows = Math.floor((heightPx - PLANNER_BLOCK_PADDING_PX) / PLANNER_BLOCK_LINE_PX);
  return Math.min(Math.max(rows - otherLines, 1), PLANNER_MAX_TITLE_LINES);
}
