/**
 * The planner grid's vertical geometry (P-planner-2), on its own.
 *
 * Phase 11 drew every half-hour row 24px tall and multiplied in CSS. From 12b a
 * row grows with what is drawn on it, so slot → pixel is no longer a
 * multiplication: it is a cumulative sum over a per-slot height table, and
 * every consumer — class blocks, due cards, event segments, the now-line, the
 * click slots and the gutter labels — has to read the same one.
 *
 * Five properties are what make that safe to do, and they are checked with
 * fast-check over random tables rather than over a handful of examples:
 *
 *   1. monotonic       — a later slot is never higher up the grid;
 *   2. continuous      — no gap at a row boundary, so blocks meet flush;
 *   3. invertible      — `pxToSlot` undoes `slotToPx`, which is what makes a
 *                        pixel on the board readable back as a time;
 *   4. capped          — a row is never shorter than the base or taller than 4×;
 *   5. base case       — a week with nothing overlapping is pixel-for-pixel the
 *                        grid Phase 11 drew. This is the one that says the
 *                        change is invisible until it is needed.
 *
 * `FC_SEED=<integer>` replays a failing run exactly.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PLANNER_SLOT_COUNT } from '@/lib/planner-week';
import {
  PLANNER_BASE_SLOT_PX,
  PLANNER_BLOCK_LINE_PX,
  PLANNER_BLOCK_PADDING_PX,
  PLANNER_MAX_SLOT_SCALE,
  PLANNER_MAX_TITLE_LINES,
  PLANNER_NESTED_CHIP_PX,
  baseSlotHeights,
  blockContentPx,
  buildSlotHeights,
  contentRequiredPx,
  gridHeightPx,
  pxToSlot,
  slotDemandPx,
  slotToPx,
  spanPx,
  titleLines,
  weekSlotDemandPx,
} from '@/lib/planner-rows';

/* ---------------------------------------------------------------------------
 * fast-check setup — 200 runs, replayable by seed.
 * ------------------------------------------------------------------------ */

const MIN_RUNS = 200;

function fcParams(): { numRuns: number; seed?: number } {
  const raw = process.env.FC_SEED;
  if (raw === undefined || raw.trim() === '') return { numRuns: MIN_RUNS };
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) throw new Error(`FC_SEED must be an integer, got "${raw}"`);
  return { numRuns: MIN_RUNS, seed };
}

function assertProperty<Ts extends [unknown, ...unknown[]]>(property: fc.IProperty<Ts>): void {
  const details = fc.check(property, fcParams());
  if (!details.failed) return;
  const hint = `Property failed — replay with FC_SEED=${details.seed} (path ${details.counterexamplePath ?? '?'})`;
  throw new Error(`${hint}\n${fc.defaultReportMessage(details)}`);
}

/** A whole week's worth of per-row demand, in pixels: mostly one lane's worth. */
const demandArb = fc.array(fc.double({ min: 0, max: 240, noNaN: true }), {
  minLength: PLANNER_SLOT_COUNT,
  maxLength: PLANNER_SLOT_COUNT,
});

/** A height table built the only way the app builds one. */
const heightsArb = demandArb.map((demand) => buildSlotHeights(demand));

/** Any position on the grid, whole slots and halves and everything between. */
const slotArb = fc.double({ min: 0, max: PLANNER_SLOT_COUNT, noNaN: true });

/* ---------------------------------------------------------------------------
 * The table
 * ------------------------------------------------------------------------ */

describe('buildSlotHeights — a row is as tall as what is asked of it, and stops', () => {
  it('leaves a row nobody asked much of at the base height', () => {
    expect(buildSlotHeights([0, 12, 24, 0])).toEqual([24, 24, 24, 24]);
  });

  it('gives a row exactly the pixels it was asked for', () => {
    expect(buildSlotHeights([24, 48, 72, 96])).toEqual([24, 48, 72, 96]);
    expect(buildSlotHeights([33.375])).toEqual([33.375]);
  });

  it('caps a row at four base heights, however much is asked of it', () => {
    expect(buildSlotHeights([120, 240, 1000])).toEqual([96, 96, 96]);
  });

  it('never leaves a row shorter than the base or taller than the cap', () => {
    assertProperty(
      fc.property(demandArb, (demand) => {
        for (const height of buildSlotHeights(demand)) {
          expect(height).toBeGreaterThanOrEqual(PLANNER_BASE_SLOT_PX);
          expect(height).toBeLessThanOrEqual(PLANNER_BASE_SLOT_PX * PLANNER_MAX_SLOT_SCALE);
        }
      }),
    );
  });

  it('is the flat Phase 11 table when nothing is crowded', () => {
    const oneLane = new Array(PLANNER_SLOT_COUNT).fill(PLANNER_BASE_SLOT_PX);
    expect(buildSlotHeights(oneLane)).toEqual(baseSlotHeights());
    expect(baseSlotHeights()).toHaveLength(PLANNER_SLOT_COUNT);
    expect(gridHeightPx(baseSlotHeights())).toBe(PLANNER_SLOT_COUNT * PLANNER_BASE_SLOT_PX);
  });
});

/* ---------------------------------------------------------------------------
 * Demand — who asks a row to grow, and for how much
 * ------------------------------------------------------------------------ */

describe('contentRequiredPx — the room a block needs for its content', () => {
  it('is its own lines plus the padding around them', () => {
    expect(contentRequiredPx(1, 0)).toBe(6 + 14);
    expect(contentRequiredPx(3, 0)).toBe(6 + 42);
  });

  it('adds a nested chip once each, with the gap the list sits in', () => {
    expect(PLANNER_NESTED_CHIP_PX).toBe(39);
    expect(contentRequiredPx(3, 1)).toBe(6 + 42 + 2 + 39);
    expect(contentRequiredPx(3, 2)).toBe(6 + 42 + 2 + 39 + 2 + 39);
  });
});

describe('slotDemandPx — what one day column asks of each row', () => {
  it('charges one lane to every row a block covers, whole or part', () => {
    const b = { top: 2, height: 2, requiredPx: 0 };
    expect(slotDemandPx([b], 6)).toEqual([0, 0, 24, 24, 0, 0]);
    expect(slotDemandPx([{ ...b, top: 2.5, height: 1 }], 6)).toEqual([0, 0, 24, 24, 0, 0]);
  });

  it('adds up the blocks that share a row — that is the concurrency', () => {
    const blocks = [
      { top: 1, height: 2, requiredPx: 0 },
      { top: 2, height: 2, requiredPx: 0 },
      { top: 2, height: 1, requiredPx: 0 },
    ];
    expect(slotDemandPx(blocks, 5)).toEqual([0, 24, 72, 24, 0]);
  });

  it('spreads a shortfall over the span of the block, not over the rows it touches', () => {
    // Two slots is 48px; asking for 72 is 24 short, which is 12 a slot — and
    // the block covers exactly two rows, so each one carries 12.
    expect(slotDemandPx([{ top: 0, height: 2, requiredPx: 72 }], 4)).toEqual([36, 36, 0, 0]);
  });

  it('takes the largest shortfall on a shared row rather than their sum', () => {
    const blocks = [
      { top: 0, height: 2, requiredPx: 72 }, // 12px a row
      { top: 0, height: 2, requiredPx: 96 }, // 24px a row
    ];
    // Two lanes, plus the bigger of the two shortfalls — not 24 + 12.
    expect(slotDemandPx(blocks, 3)).toEqual([72, 72, 0]);
  });

  it('asks for nothing extra when a block already fits its span', () => {
    expect(slotDemandPx([{ top: 0, height: 2, requiredPx: 48 }], 3)).toEqual([24, 24, 0]);
    expect(slotDemandPx([{ top: 0, height: 2, requiredPx: 10 }], 3)).toEqual([24, 24, 0]);
  });

  it('ignores a block that falls outside the drawn hours', () => {
    expect(slotDemandPx([{ top: -4, height: 2, requiredPx: 0 }], 4)).toEqual([0, 0, 0, 0]);
    expect(slotDemandPx([{ top: 9, height: 2, requiredPx: 0 }], 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('weekSlotDemandPx — seven columns share one set of rows', () => {
  it('takes the busiest day per row, never the sum of the week', () => {
    const monday = [
      { top: 0, height: 2, requiredPx: 0 },
      { top: 0, height: 2, requiredPx: 0 },
    ];
    // Two days each with two overlapping blocks is still a two-lane row.
    expect(weekSlotDemandPx([monday, monday], 3)).toEqual([48, 48, 0]);
  });

  it('grows a row for the one day that needs it', () => {
    const quiet = [{ top: 0, height: 1, requiredPx: 0 }];
    const busy = [{ top: 1, height: 1, requiredPx: 96 }];
    expect(weekSlotDemandPx([quiet, busy], 3)).toEqual([24, 96, 0]);
  });

  it('is all zeroes for an empty week', () => {
    expect(weekSlotDemandPx([[], [], []], 3)).toEqual([0, 0, 0]);
  });
});

/* ---------------------------------------------------------------------------
 * slotToPx — the one map
 * ------------------------------------------------------------------------ */

describe('slotToPx — the base case is Phase 11, to the pixel', () => {
  it('is a plain multiplication when no row has grown', () => {
    const flat = baseSlotHeights();
    for (let slot = 0; slot <= PLANNER_SLOT_COUNT; slot += 0.5) {
      expect(slotToPx(slot, flat)).toBeCloseTo(slot * PLANNER_BASE_SLOT_PX, 9);
    }
  });

  it('is a plain multiplication at every fractional position too', () => {
    const flat = baseSlotHeights();
    assertProperty(
      fc.property(slotArb, (slot) => {
        expect(slotToPx(slot, flat)).toBeCloseTo(slot * PLANNER_BASE_SLOT_PX, 9);
      }),
    );
  });
});

describe('slotToPx — the properties every consumer relies on', () => {
  it('never goes backwards', () => {
    assertProperty(
      fc.property(heightsArb, slotArb, slotArb, (heights, a, b) => {
        const [low, high] = a <= b ? [a, b] : [b, a];
        expect(slotToPx(low, heights)).toBeLessThanOrEqual(slotToPx(high, heights));
      }),
    );
  });

  it('has no gap at a row boundary, so two blocks meet flush', () => {
    assertProperty(
      fc.property(heightsArb, fc.integer({ min: 1, max: PLANNER_SLOT_COUNT }), (heights, slot) => {
        const below = slotToPx(slot - 1e-9, heights);
        expect(slotToPx(slot, heights)).toBeCloseTo(below, 6);
      }),
    );
  });

  it('starts at the top of the grid and ends at its bottom', () => {
    assertProperty(
      fc.property(heightsArb, (heights) => {
        expect(slotToPx(0, heights)).toBe(0);
        expect(slotToPx(PLANNER_SLOT_COUNT, heights)).toBeCloseTo(gridHeightPx(heights), 9);
      }),
    );
  });

  it('clamps a position off either end of the grid rather than extrapolating', () => {
    const heights = buildSlotHeights([24, 72, 24]);
    expect(slotToPx(-5, heights)).toBe(0);
    expect(slotToPx(99, heights)).toBe(gridHeightPx(heights));
  });

  it('puts a grown row where its own height says, not where 24px would', () => {
    // Rows 0 and 1 are base; row 2 holds three lanes; row 3 is base again.
    const heights = buildSlotHeights([24, 24, 72, 24]);
    expect(heights).toEqual([24, 24, 72, 24]);
    expect(slotToPx(2, heights)).toBe(48);
    expect(slotToPx(2.5, heights)).toBe(84); // halfway down the grown row
    expect(slotToPx(3, heights)).toBe(120);
    expect(slotToPx(4, heights)).toBe(144);
  });
});

describe('pxToSlot — reading a pixel on the board back as a time', () => {
  it('undoes slotToPx', () => {
    assertProperty(
      fc.property(heightsArb, slotArb, (heights, slot) => {
        expect(pxToSlot(slotToPx(slot, heights), heights)).toBeCloseTo(slot, 6);
      }),
    );
  });

  it('undoes slotToPx the other way round, from a pixel', () => {
    assertProperty(
      fc.property(heightsArb, fc.double({ min: 0, max: 2000, noNaN: true }), (heights, px) => {
        const bounded = Math.min(px, gridHeightPx(heights));
        expect(slotToPx(pxToSlot(bounded, heights), heights)).toBeCloseTo(bounded, 6);
      }),
    );
  });

  it('finds the right half-hour under a grown row', () => {
    const heights = buildSlotHeights([24, 24, 72, 24]);
    // The click that used to land on row 3 at 72px now lands a third of the
    // way into the grown row 2; row 3 starts 48px further down.
    expect(pxToSlot(72, heights)).toBeCloseTo(2 + 1 / 3, 9);
    expect(pxToSlot(84, heights)).toBeCloseTo(2.5, 9);
    expect(pxToSlot(120, heights)).toBeCloseTo(3, 9);
  });

  it('clamps rather than running off either end', () => {
    const heights = buildSlotHeights([24, 24]);
    expect(pxToSlot(-10, heights)).toBe(0);
    expect(pxToSlot(9999, heights)).toBe(2);
  });
});

describe('spanPx — what a block hands the stylesheet', () => {
  it('is the Phase 11 arithmetic on an uncrowded week', () => {
    const flat = baseSlotHeights();
    expect(spanPx(15.5, 2.6666666666666665, flat)).toEqual({
      topPx: 372,
      heightPx: 64,
    });
  });

  it('grows a class block to exactly the room its chips asked for', () => {
    // The 3:45–5:05 lecture with two due items nested in it. It needs 130px of
    // the 64 its hours are worth, so its four rows carry 66/2⅔ = 24.75px each.
    const requiredPx = contentRequiredPx(3, 2);
    const heights = buildSlotHeights(weekSlotDemandPx([[{ ...LECTURE, requiredPx }]]));
    expect(heights[16]).toBeCloseTo(48.75, 6);

    const { topPx, heightPx } = spanPx(LECTURE.top, LECTURE.height, heights);
    expect(topPx).toBeCloseTo(384.375, 6); // 15 base rows, then half of a grown one
    expect(heightPx).toBeCloseTo(requiredPx, 6); // 130px, not the 192 CR-5 found
  });

  it('never returns a negative height', () => {
    assertProperty(
      fc.property(heightsArb, slotArb, slotArb, (heights, top, height) => {
        expect(spanPx(top, height, heights).heightPx).toBeGreaterThanOrEqual(0);
      }),
    );
  });
});

/* ---------------------------------------------------------------------------
 * Wrapping (P-planner-4)
 * ------------------------------------------------------------------------ */

/* ---------------------------------------------------------------------------
 * CR-5 — a nested chip is not a lane
 * ------------------------------------------------------------------------ */

/** The IST 323 lecture from the brief: 3:45 – 5:05 PM, four rows, 2⅔ slots. */
const LECTURE = { top: 15.5, height: 8 / 3 };

/** The rows a block spanning `LECTURE` charges, and its height off them. */
function grownHeight(requiredPx: number): number {
  const heights = buildSlotHeights(weekSlotDemandPx([[{ ...LECTURE, requiredPx }]]));
  return spanPx(LECTURE.top, LECTURE.height, heights).heightPx;
}

describe('CR-5 — a class asks for the room its chips need, not a lane per row', () => {
  /**
   * The bug the review found: a chip was worth one lane on *every* row the
   * class spanned, so an 80-minute class (four rows) with one chip made all
   * four 48px and the block 144px — for a chip that needs 39. Three chips put
   * every row on the 96px cap, 288px of block, and since rows are shared with
   * the other six columns the whole board stretched with it.
   */
  it('grows an 80-minute class with one chip to the room it needs, not to 144px', () => {
    const requiredPx = contentRequiredPx(3, 1); // head, room, topic, and one chip
    expect(requiredPx).toBe(89);
    expect(grownHeight(requiredPx)).toBeCloseTo(89, 6);
    expect(grownHeight(requiredPx)).toBeLessThan(96);
  });

  it('grows it once per chip, not once per chip per row', () => {
    expect(grownHeight(contentRequiredPx(3, 2))).toBeCloseTo(130, 6); // was 192
    expect(grownHeight(contentRequiredPx(3, 3))).toBeCloseTo(171, 6); // was 288
  });

  it('leaves a class whose own lines already fit at its Phase 11 height', () => {
    // 2⅔ slots is 64px; head, room and topic need 48.
    expect(contentRequiredPx(3, 0)).toBe(48);
    expect(grownHeight(contentRequiredPx(3, 0))).toBeCloseTo(64, 6);
    expect(grownHeight(0)).toBeCloseTo(64, 6);
  });

  it('gives a block that needs more than its span the room, and barely more', () => {
    assertProperty(
      fc.property(
        fc.double({ min: 0, max: 27, noNaN: true }),
        fc.double({ min: 0.5, max: 8, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        (top, rawHeight, requiredPx) => {
          // Blocks are clamped into the drawn hours before they get here
          // (`slotBox`, `segmentBox`); one hanging off the bottom of the grid
          // is clipped by `slotToPx` and cannot be given its full height.
          const height = Math.min(rawHeight, PLANNER_SLOT_COUNT - top);
          if (height < 0.5) return;

          const heights = buildSlotHeights(weekSlotDemandPx([[{ top, height, requiredPx }]]));
          const grown = spanPx(top, height, heights).heightPx;
          if (requiredPx <= height * PLANNER_BASE_SLOT_PX) return; // nothing was asked for

          const capped = height * PLANNER_BASE_SLOT_PX * PLANNER_MAX_SLOT_SCALE;
          // It gets what it asked for, unless the cap says otherwise …
          expect(grown).toBeGreaterThanOrEqual(Math.min(requiredPx, capped) - 1e-6);
          // … and never a whole extra row more than it asked for.
          expect(grown).toBeLessThan(requiredPx + PLANNER_BASE_SLOT_PX);
        },
      ),
    );
  });

  it('still counts genuine side-by-side blocks as lanes', () => {
    const a = { top: 4, height: 2, requiredPx: 0 };
    const b = { top: 4, height: 2, requiredPx: 0 };
    const c = { top: 4, height: 2, requiredPx: 0 };
    expect(buildSlotHeights(weekSlotDemandPx([[a, b]], 8)).slice(4, 6)).toEqual([48, 48]);
    expect(buildSlotHeights(weekSlotDemandPx([[a, b, c]], 8)).slice(4, 6)).toEqual([72, 72]);
  });

  it('adds a chip block room on top of the lanes it shares its rows with', () => {
    // A class needing 89px of its 64 alongside one clashing block: two lanes
    // and the shortfall, not one or the other.
    const clash = { top: 15.5, height: 8 / 3, requiredPx: 0 };
    const lecture = { ...LECTURE, requiredPx: contentRequiredPx(3, 1) };
    const heights = buildSlotHeights(weekSlotDemandPx([[lecture, clash]]));
    expect(heights[16]).toBeCloseTo(2 * PLANNER_BASE_SLOT_PX + (89 - 64) / (8 / 3), 6);
  });
});

/**
 * F-2(b), from the PM's browser walk: a 55-minute block cut "Trendy Today,
 * Toxic" through the middle of the letters. A block clips at its own edge, and
 * its own edge is wherever the hour puts it — which is almost never a line
 * boundary. The text area is therefore a whole number of lines, and the line
 * after the last one it can afford starts exactly where the clip is.
 */
describe('blockContentPx — the text area is whole lines, never a part of one', () => {
  it('gives a 55-minute block two lines, not two and a half', () => {
    // 55 min is 44px; 38px of it is text area; two 14px lines fit, 2.71 do not.
    expect(blockContentPx(44)).toBe(2 * PLANNER_BLOCK_LINE_PX);
  });

  it('is always a whole number of lines', () => {
    assertProperty(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), (heightPx) => {
        expect(blockContentPx(heightPx) % PLANNER_BLOCK_LINE_PX).toBe(0);
      }),
    );
  });

  it('never asks for more room than the block has to give', () => {
    assertProperty(
      fc.property(
        fc.double({ min: PLANNER_BLOCK_PADDING_PX + PLANNER_BLOCK_LINE_PX, max: 600, noNaN: true }),
        (heightPx) => {
          expect(blockContentPx(heightPx)).toBeLessThanOrEqual(
            heightPx - PLANNER_BLOCK_PADDING_PX,
          );
        },
      ),
    );
  });

  it('keeps one line even for a block too short for one', () => {
    expect(blockContentPx(0)).toBe(PLANNER_BLOCK_LINE_PX);
    expect(blockContentPx(12)).toBe(PLANNER_BLOCK_LINE_PX);
  });

  it('never shrinks when the block grows', () => {
    assertProperty(
      fc.property(
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        (a, b) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(blockContentPx(low)).toBeLessThanOrEqual(blockContentPx(high));
        },
      ),
    );
  });

  it('agrees with titleLines about how many lines there are', () => {
    assertProperty(
      fc.property(fc.double({ min: 0, max: 600, noNaN: true }), (heightPx) => {
        const lines = blockContentPx(heightPx) / PLANNER_BLOCK_LINE_PX;
        // With nothing else on the block, the title may use every line it has.
        expect(titleLines(heightPx, 0)).toBe(Math.min(lines, PLANNER_MAX_TITLE_LINES));
      }),
    );
  });
});

describe('titleLines — the clamp that fits the block', () => {
  it('gives a half-hour block one line, which is where the ellipsis comes from', () => {
    expect(titleLines(PLANNER_BASE_SLOT_PX, 1)).toBe(1);
  });

  it('gives a grown block the lines its height pays for', () => {
    // 192px, less 6px of padding, is 13 lines; three go to the other rows.
    expect(titleLines(192, 3)).toBe(PLANNER_MAX_TITLE_LINES);
    expect(titleLines(6 + PLANNER_BLOCK_LINE_PX * 4, 2)).toBe(2);
  });

  it('never returns fewer than one line, or more than the ceiling', () => {
    assertProperty(
      fc.property(
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.integer({ min: 0, max: 8 }),
        (heightPx, other) => {
          const lines = titleLines(heightPx, other);
          expect(lines).toBeGreaterThanOrEqual(1);
          expect(lines).toBeLessThanOrEqual(PLANNER_MAX_TITLE_LINES);
          expect(Number.isInteger(lines)).toBe(true);
        },
      ),
    );
  });

  it('never shrinks when the block grows', () => {
    assertProperty(
      fc.property(
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        fc.integer({ min: 0, max: 4 }),
        (a, b, other) => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          expect(titleLines(low, other)).toBeLessThanOrEqual(titleLines(high, other));
        },
      ),
    );
  });
});
