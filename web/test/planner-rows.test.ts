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
  baseSlotHeights,
  blockContentPx,
  buildSlotHeights,
  gridHeightPx,
  pxToSlot,
  slotToPx,
  slotWeights,
  spanPx,
  titleLines,
  weekSlotWeights,
} from '@/lib/planner-rows';

/* ---------------------------------------------------------------------------
 * fast-check setup — 200 runs, deterministic by default, replayable by seed.
 *
 * The seed is FIXED unless something asks for otherwise. An unseeded property
 * draws a new seed from the clock on every run, so a property that is wrong for
 * one table in a few hundred turns the whole suite red at random: the sort of
 * failure that shows up once in six runs and never again, which is a flake
 * report rather than a finding. With a fixed seed a red run is reproducible and
 * a green run means the same thing tomorrow.
 *
 *   FC_SEED=<integer>  replay one reported failure exactly
 *   FC_SEED=random     draw a fresh seed, to fuzz these properties on purpose
 * ------------------------------------------------------------------------ */

const MIN_RUNS = 200;
const DEFAULT_SEED = 20260917;

function fcParams(): { numRuns: number; seed?: number } {
  const raw = process.env.FC_SEED?.trim();
  if (raw === undefined || raw === '') return { numRuns: MIN_RUNS, seed: DEFAULT_SEED };
  if (raw.toLowerCase() === 'random') return { numRuns: MIN_RUNS };
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`FC_SEED must be an integer or "random", got "${raw}"`);
  }
  return { numRuns: MIN_RUNS, seed };
}

function assertProperty<Ts extends [unknown, ...unknown[]]>(property: fc.IProperty<Ts>): void {
  const details = fc.check(property, fcParams());
  if (!details.failed) return;
  const hint = `Property failed — replay with FC_SEED=${details.seed} (path ${details.counterexamplePath ?? '?'})`;
  throw new Error(`${hint}\n${fc.defaultReportMessage(details)}`);
}

/** A whole week's worth of per-slot weights: mostly 1, sometimes crowded. */
const weightsArb = fc.array(fc.integer({ min: 0, max: 7 }), {
  minLength: PLANNER_SLOT_COUNT,
  maxLength: PLANNER_SLOT_COUNT,
});

/** A height table built the only way the app builds one. */
const heightsArb = weightsArb.map((weights) => buildSlotHeights(weights));

/** Any position on the grid, whole slots and halves and everything between. */
const slotArb = fc.double({ min: 0, max: PLANNER_SLOT_COUNT, noNaN: true });

/* ---------------------------------------------------------------------------
 * The table
 * ------------------------------------------------------------------------ */

describe('buildSlotHeights — a row grows with what is on it, and stops', () => {
  it('leaves an uncrowded row at the base height', () => {
    expect(buildSlotHeights([0, 1, 1, 0])).toEqual([24, 24, 24, 24]);
  });

  it('grows a row one base height per concurrent lane', () => {
    expect(buildSlotHeights([1, 2, 3, 4])).toEqual([24, 48, 72, 96]);
  });

  it('caps a row at four base heights, however crowded the slot', () => {
    expect(buildSlotHeights([5, 9, 40])).toEqual([96, 96, 96]);
  });

  it('never leaves a row shorter than the base or taller than the cap', () => {
    assertProperty(
      fc.property(weightsArb, (weights) => {
        for (const height of buildSlotHeights(weights)) {
          expect(height).toBeGreaterThanOrEqual(PLANNER_BASE_SLOT_PX);
          expect(height).toBeLessThanOrEqual(PLANNER_BASE_SLOT_PX * PLANNER_MAX_SLOT_SCALE);
        }
      }),
    );
  });

  it('is the flat Phase 11 table when nothing is crowded', () => {
    expect(buildSlotHeights(new Array(PLANNER_SLOT_COUNT).fill(1))).toEqual(baseSlotHeights());
    expect(baseSlotHeights()).toHaveLength(PLANNER_SLOT_COUNT);
    expect(gridHeightPx(baseSlotHeights())).toBe(PLANNER_SLOT_COUNT * PLANNER_BASE_SLOT_PX);
  });
});

/* ---------------------------------------------------------------------------
 * Weights — who asks a row to grow
 * ------------------------------------------------------------------------ */

describe('slotWeights — what one day column asks of each row', () => {
  it('charges a block to every row it covers, whole or part', () => {
    // 09:00–10:00 is slots 2 … 4; 09:15 starts inside slot 2.
    expect(slotWeights([{ top: 2, height: 2, weight: 1 }], 6)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(slotWeights([{ top: 2.5, height: 1, weight: 1 }], 6)).toEqual([0, 0, 1, 1, 0, 0]);
  });

  it('adds up the blocks that share a row — that is the concurrency', () => {
    const blocks = [
      { top: 1, height: 2, weight: 1 },
      { top: 2, height: 2, weight: 1 },
      { top: 2, height: 1, weight: 1 },
    ];
    expect(slotWeights(blocks, 5)).toEqual([0, 1, 3, 1, 0]);
  });

  it('lets a block ask for more than one lane — a class with nested chips', () => {
    expect(slotWeights([{ top: 0, height: 2, weight: 3 }], 4)).toEqual([3, 3, 0, 0]);
  });

  it('ignores a block that falls outside the drawn hours', () => {
    expect(slotWeights([{ top: -4, height: 2, weight: 1 }], 4)).toEqual([0, 0, 0, 0]);
    expect(slotWeights([{ top: 9, height: 2, weight: 1 }], 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('weekSlotWeights — seven columns share one set of rows', () => {
  it('takes the busiest day per row, never the sum of the week', () => {
    const monday = [{ top: 0, height: 2, weight: 2 }];
    const tuesday = [{ top: 0, height: 2, weight: 2 }];
    // Two days each with two overlapping blocks is still a two-lane row.
    expect(weekSlotWeights([monday, tuesday], 3)).toEqual([2, 2, 0]);
  });

  it('grows a row for the one day that needs it', () => {
    const quiet = [{ top: 0, height: 1, weight: 1 }];
    const busy = [{ top: 1, height: 1, weight: 4 }];
    expect(weekSlotWeights([quiet, busy], 3)).toEqual([1, 4, 0]);
  });

  it('is all zeroes for an empty week', () => {
    expect(weekSlotWeights([[], [], []], 3)).toEqual([0, 0, 0]);
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
    const heights = buildSlotHeights([1, 3, 1]);
    expect(slotToPx(-5, heights)).toBe(0);
    expect(slotToPx(99, heights)).toBe(gridHeightPx(heights));
  });

  it('puts a grown row where its own height says, not where 24px would', () => {
    // Rows 0 and 1 are base; row 2 holds three lanes; row 3 is base again.
    const heights = buildSlotHeights([1, 1, 3, 1]);
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
    const heights = buildSlotHeights([1, 1, 3, 1]);
    // The click that used to land on row 3 at 72px now lands a third of the
    // way into the grown row 2; row 3 starts 48px further down.
    expect(pxToSlot(72, heights)).toBeCloseTo(2 + 1 / 3, 9);
    expect(pxToSlot(84, heights)).toBeCloseTo(2.5, 9);
    expect(pxToSlot(120, heights)).toBeCloseTo(3, 9);
  });

  it('clamps rather than running off either end', () => {
    const heights = buildSlotHeights([1, 1]);
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

  it('grows a class block by exactly the rows it covers', () => {
    // A 3:45–5:05 class with two due items nested in it: slots 15…18 at 3×.
    const weights = new Array(PLANNER_SLOT_COUNT).fill(1);
    for (const slot of [15, 16, 17, 18]) weights[slot] = 3;
    const heights = buildSlotHeights(weights);

    const { topPx, heightPx } = spanPx(15.5, 2.6666666666666665, heights);
    expect(topPx).toBe(396); // 15 base rows, then half of a 72px row
    expect(heightPx).toBeCloseTo(192, 6); // three times the 64px it used to get
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
