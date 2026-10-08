/**
 * H-1 / P-home-1 — the five assignment-type colours must be five colours.
 *
 * Before Phase 12b the `--type-*-bg` tokens were one purple ramp plus a grey:
 * five steps of the same hue, told apart only by lightness. On a 14-column
 * tracker bar that reads as one smear, which is exactly what Stack reported.
 *
 * This suite reads the real `src/app/globals.css` rather than a copy of the
 * values, so the contract cannot drift: change a token and this test is the
 * thing that fails. It reads it through `test/css-tokens.ts` (Phase 22, task 3),
 * which keeps one map per theme block (`:root` and `:root[data-theme='light']`),
 * follows `var()` chains inside the block it is asked about, and so lets a
 * Phase 13 restyle express the tokens as ramp names and still be measured. Every
 * assertion below runs once per block, against that block's own card.
 *
 * WHAT IS ASSERTED, AND WHY THESE NUMBERS
 *
 *   1. Every `--type-*-fg` on its own `--type-*-bg` is >= 4.5:1. That pair is
 *      the glyph chip (R · A · Q · P · E), which carries a letter, so WCAG AA
 *      for text is the right bar.
 *   2. Every `--type-*-bg` is >= 3:1 against the card it sits on, in each
 *      block: that block's `--color-surface`. A bar segment carries no text but
 *      does carry meaning, so WCAG 1.4.11 non-text contrast, 3:1, is the right
 *      bar. Until the light block exists (Phase 22, task 8) the light map is the
 *      dark map overlaid by nothing, so both blocks measure today's dark card;
 *      the `'#ffffff'` stand-in this suite used for a light ground is gone.
 *   3. Every pair of `--type-*-bg` values differs by CIE76 dE >= 30.
 *
 *      Note on (3): the row's wording is "3:1 against its neighbour". That is
 *      unachievable for five colours — 3:1 is a luminance ratio, and four
 *      adjacent 3:1 steps need an 81x span of (L + 0.05), while the whole sRGB
 *      range only spans 21x. Five colours told apart by LIGHTNESS is precisely
 *      the one-hue ramp being replaced. They are told apart by HUE instead, and
 *      dE is the measure that says so. 30 is comfortably above the ~2.3
 *      just-noticeable threshold and the palette clears it with margin.
 */

import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  deltaE,
  readGlobalsThemeMaps,
  resolveColour,
  toLab,
  type Colour,
  type ThemeMaps,
  type TokenMap,
} from './css-tokens';

/** The five categories `v_work_items` pre-computes, in ramp order. */
const CATEGORIES = ['reading', 'assignment', 'quiz', 'project', 'exam'] as const;

/** The two theme blocks. Each is measured with its own values and its own card. */
const BLOCKS = ['dark', 'light'] as const;
type Block = (typeof BLOCKS)[number];

/* ---------------------------------------------------------------------------
 * Reading the stylesheet, one map per block (test/css-tokens.ts)
 * ------------------------------------------------------------------------ */

// `src/app/globals.css`, read when the suite loads. The reader resolves
// `var()` chains inside the block it is asked about, so a block that
// re-declares a token is measured with that value and not the other block's.
const THEMES: ThemeMaps = readGlobalsThemeMaps();

/** A token of one block as a colour, following `var()` chains. */
function token(block: Block, name: string): Colour {
  const map: TokenMap = THEMES[block];
  return resolveColour(map, name);
}

/* ---------------------------------------------------------------------------
 * The contract
 * ------------------------------------------------------------------------ */

const MIN_TEXT_CONTRAST = 4.5; // WCAG AA, the glyph letter on its chip
const MIN_GROUND_CONTRAST = 3; // WCAG 1.4.11, a bar segment against the card
const MIN_DELTA_E = 30; // told apart by hue, not lightness

describe.each(BLOCKS)('assignment-type colour tokens, %s block', (block) => {
  it('declares a bg and an fg for all five categories', () => {
    for (const category of CATEGORIES) {
      expect(() => token(block, `--type-${category}-bg`)).not.toThrow();
      expect(() => token(block, `--type-${category}-fg`)).not.toThrow();
    }
  });

  it.each(CATEGORIES)('%s: the glyph letter is readable on its chip', (category) => {
    const bg = token(block, `--type-${category}-bg`);
    const fg = token(block, `--type-${category}-fg`);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each(CATEGORIES)('%s: the segment is visible on the card', (category) => {
    const card = token(block, '--color-surface');
    const bg = token(block, `--type-${category}-bg`);
    expect(contrastRatio(bg, card)).toBeGreaterThanOrEqual(MIN_GROUND_CONTRAST);
  });

  it('gives every pair of categories a different hue, not a different lightness', () => {
    const tooClose: string[] = [];
    for (let i = 0; i < CATEGORIES.length; i += 1) {
      for (let j = i + 1; j < CATEGORIES.length; j += 1) {
        const a = token(block, `--type-${CATEGORIES[i]}-bg`);
        const b = token(block, `--type-${CATEGORIES[j]}-bg`);
        const difference = deltaE(a, b);
        if (difference < MIN_DELTA_E) {
          tooClose.push(`${CATEGORIES[i]}/${CATEGORIES[j]} dE=${difference.toFixed(1)}`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it('spreads the five across the wheel rather than up one ramp', () => {
    // A one-hue ramp has near-identical a*/b* and differs only in L*. Require
    // the chroma spread to be the larger part of the difference.
    const labs = CATEGORIES.map((c) => toLab(token(block, `--type-${c}-bg`)));
    const lightnessSpread = Math.max(...labs.map((l) => l[0])) - Math.min(...labs.map((l) => l[0]));
    const chromaSpread = Math.max(
      ...labs.flatMap((p, i) => labs.slice(i + 1).map((q) => Math.hypot(p[1] - q[1], p[2] - q[2]))),
    );
    expect(chromaSpread).toBeGreaterThan(lightnessSpread);
  });
});
