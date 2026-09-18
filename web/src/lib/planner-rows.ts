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
 *   * **and, separately, by however much a block needs that its own span does
 *     not give it.** A class carrying nested due chips is one lane wide and
 *     taller than its hours; it asks for the shortfall once, spread over its
 *     own span, not for a lane on every row it touches (CR-5). Charging it a
 *     lane per row made an 80-minute class with one 39px chip 144px tall, and
 *     three chips put every row on the cap;
 *   * it stops at 4× (96px). Past the cap the side-by-side lanes carry the rest,
 *     exactly as they did before, and a block's own content clips — on a whole
 *     line, per `blockContentPx`;
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
 * One line of text inside a block. `.block` sets `line-height: 14px` outright
 * rather than the 1.25 it used to, because this arithmetic counts lines: 1.25
 * on 11px text is 13.75px, three of those end 0.75px past a 42px text area, and
 * that sliver is how a line gets half drawn (F-2).
 */
export const PLANNER_BLOCK_LINE_PX = 14;

/** `.block { padding: 3px 5px }` — the top and bottom of it. */
export const PLANNER_BLOCK_PADDING_PX = 6;

/** However tall a block gets, a title stops wrapping here. */
export const PLANNER_MAX_TITLE_LINES = 6;

/**
 * The status quick-edit inside a nested chip: one line box, plus
 * `.statusSelect`'s 3px padding and 1px border, top and bottom.
 */
const STATUS_SELECT_PX = PLANNER_BLOCK_LINE_PX + 2 * 3 + 2 * 1;

/**
 * A due chip nested in a class block, top to bottom: `.nestedChip`'s 1px
 * padding, its title line, the 1px row gap, the status control, the other 1px
 * of padding. 39px — and, before CR-5, it was being charged as a whole 24px
 * lane on every row of the class, four of them on an 80-minute lecture.
 */
export const PLANNER_NESTED_CHIP_PX = 1 + PLANNER_BLOCK_LINE_PX + 1 + STATUS_SELECT_PX + 1;

/** `.nested { margin-top: 2px; gap: 2px }` — above the list, and between chips. */
export const PLANNER_NESTED_GAP_PX = 2;

/**
 * The chrome above the hour rows — the day heads and the two bands — measured
 * in base rows. Only the pre-hydration placeholder uses it, and only to hold a
 * space open; the real board is laid out by the browser, not by this number.
 */
export const PLANNER_CHROME_ROWS = 4;

/* ---------------------------------------------------------------------------
 * What each row is asked for
 * ------------------------------------------------------------------------ */

/**
 * A block, as this module sees it: where it sits in slots, and how much room
 * its content needs whether or not its hours give it that much.
 *
 * `requiredPx` is 0 for a block that is happy with whatever its span is worth,
 * which is nearly all of them. A class carrying nested due chips is the case it
 * exists for: the chips stack inside the block, so the block needs pixels, not
 * a second lane.
 */
export interface RowSpan {
  /** Slots from the top of the grid. */
  top: number;
  /** Height in slots. */
  height: number;
  /** Pixels this block's content needs; 0 when its own span already suffices. */
  requiredPx: number;
}

/**
 * How much taller than the base a block needs each of its own rows to be.
 *
 * The shortfall is spread across the block's **span**, not across the rows it
 * happens to touch, so that the block ends up exactly as tall as it asked: a
 * 2⅔-slot block short by 25px asks each row for 25 / 2⅔ ≈ 9.4px, and gets
 * 2⅔ × 9.4 ≈ 25px back. Spreading over the four rows it overlaps instead would
 * hand it only two-thirds of what it needs (CR-5).
 */
function shortfallPerRow(block: RowSpan, base: number): number {
  if (block.height <= 0) return 0;
  const shortfall = block.requiredPx - block.height * base;
  return shortfall > 0 ? shortfall / block.height : 0;
}

/**
 * What one day column asks of each row, in pixels.
 *
 * Two demands, added: one base height per block drawn on the row — the lane
 * rule, unchanged, so three overlapping blocks still make a 72px row — plus the
 * largest per-row shortfall among those blocks. The lanes add up because they
 * sit side by side; the shortfalls do not, because a row only has to be as tall
 * as the hungriest block on it needs it to be.
 */
export function slotDemandPx(
  blocks: readonly RowSpan[],
  slotCount: number = PLANNER_SLOT_COUNT,
  base: number = PLANNER_BASE_SLOT_PX,
): number[] {
  const lanes = new Array<number>(slotCount).fill(0);
  const extra = new Array<number>(slotCount).fill(0);

  for (const block of blocks) {
    const first = Math.max(0, Math.floor(block.top));
    const last = Math.min(slotCount, Math.ceil(block.top + block.height));
    const perRow = shortfallPerRow(block, base);
    for (let slot = first; slot < last; slot += 1) {
      lanes[slot] += 1;
      extra[slot] = Math.max(extra[slot], perRow);
    }
  }

  return lanes.map((count, slot) => count * base + extra[slot]);
}

/**
 * The week's demand: the busiest day per row. Monday and Tuesday each having a
 * clash at 3 PM is still a two-lane row, not a four-lane one.
 */
export function weekSlotDemandPx(
  blocksByDay: readonly (readonly RowSpan[])[],
  slotCount: number = PLANNER_SLOT_COUNT,
  base: number = PLANNER_BASE_SLOT_PX,
): number[] {
  const demand = new Array<number>(slotCount).fill(0);
  for (const day of blocksByDay) {
    const dayDemand = slotDemandPx(day, slotCount, base);
    for (let slot = 0; slot < slotCount; slot += 1) {
      demand[slot] = Math.max(demand[slot], dayDemand[slot]);
    }
  }
  return demand;
}

/* ---------------------------------------------------------------------------
 * The table
 * ------------------------------------------------------------------------ */

/** Phase 11's grid: every row the base height. */
export function baseSlotHeights(slotCount: number = PLANNER_SLOT_COUNT): number[] {
  return new Array<number>(slotCount).fill(PLANNER_BASE_SLOT_PX);
}

/**
 * One height per row: what the row was asked for, floored at the base and
 * capped at `maxScale` of it. A fractional height is fine and often right — a
 * block's shortfall rarely divides evenly into its span, and CSS lays out
 * subpixels without complaint.
 */
export function buildSlotHeights(
  demandPx: readonly number[],
  base: number = PLANNER_BASE_SLOT_PX,
  maxScale: number = PLANNER_MAX_SLOT_SCALE,
): number[] {
  return demandPx.map((px) => Math.min(Math.max(px, base), base * maxScale));
}

/** How tall the whole grid is. */
export function gridHeightPx(heights: readonly number[]): number {
  return heights.reduce((total, height) => total + height, 0);
}

/**
 * What the pre-hydration placeholder holds open (P-planner-7).
 *
 * The grid itself cannot be rendered before hydration — the server has none of
 * the week's rows and its clock is UTC — but its *height* can be, and that is
 * what stops the page jumping when the real board arrives a moment later. It is
 * the base grid plus the chrome above it: exactly right on a week with no
 * overlaps, which is most of them, and short by however much a crowded week
 * grew. Approximate is the point; a reserved height nobody can compute exactly
 * still beats a one-line placeholder swapping for 700 pixels of grid.
 */
export function reservedBoardHeightPx(slotCount: number = PLANNER_SLOT_COUNT): number {
  return (slotCount + PLANNER_CHROME_ROWS) * PLANNER_BASE_SLOT_PX;
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
 * The room a block's content needs, in pixels: the lines it draws itself, plus
 * any due chips nested inside it, plus the block's own padding.
 *
 * This is what a block hands the row table as `requiredPx`. It is measured, not
 * estimated: every term is a value in `PlannerWeek.module.css`.
 */
export function contentRequiredPx(textLines: number, nestedChips: number): number {
  const chips =
    nestedChips <= 0
      ? 0
      : PLANNER_NESTED_GAP_PX +
        nestedChips * PLANNER_NESTED_CHIP_PX +
        (nestedChips - 1) * PLANNER_NESTED_GAP_PX;
  return PLANNER_BLOCK_PADDING_PX + textLines * PLANNER_BLOCK_LINE_PX + chips;
}

/**
 * A due card is drawn at `.itemBlock`'s `min-height` however short its span,
 * so that — not its one slot — is the height its text has to be counted from.
 */
export const PLANNER_DUE_CARD_MIN_PX = 2 * PLANNER_BASE_SLOT_PX;

/**
 * How tall a block's text area is: the most whole lines that fit, and not one
 * pixel more (F-2, the PM's browser walk).
 *
 * A block's own height is whatever its hours make it, which is almost never a
 * multiple of a line — so clipping at the block's edge cut "Trendy Today,
 * Toxic" through the middle of the letters. Sizing the text area to whole lines
 * instead puts the clip exactly where the next line begins: every line that is
 * drawn is drawn completely, and the one that does not fit is not drawn at all.
 *
 * One line is the floor. A block too short even for that shows one and clips;
 * a sliver of text is bad, but a block with nothing in it says less than
 * nothing.
 */
export function blockContentPx(heightPx: number): number {
  const available = heightPx - PLANNER_BLOCK_PADDING_PX;
  const lines = Math.max(1, Math.floor(available / PLANNER_BLOCK_LINE_PX));
  return lines * PLANNER_BLOCK_LINE_PX;
}

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
