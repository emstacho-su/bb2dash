/**
 * The work-type colours are ONE URGENCY SCALE (Phase 22, amendment 2, G-4; it
 * replaces Phase 12b's H-1 / P-home-1 five-hue rule).
 *
 * The app has one hue. Red marks what is most urgent, so the five assignment
 * types are a scale and not five unrelated colours: exam is the one red, project
 * is a second red, and quiz, assignment and reading are greys, each quieter
 * against the card than the one before.
 *
 * This suite reads the real `src/app/globals.css` rather than a copy of the
 * values, so the contract cannot drift: change a token and this test is the thing
 * that fails. It reads it through `test/css-tokens.ts`, which keeps one map per
 * theme block (`:root` and `:root[data-theme='light']`) and follows `var()` chains
 * inside the block it is asked about. Every assertion runs once per block.
 *
 * THE RULE, quoted from the designer's final report of 2026-10-08:
 *
 *   In each theme, against that theme's card and its picked-day fill: exam is
 *   #ff0000 (`--color-accent-500`). Project is a second red: chroma at least 40,
 *   hue within 15 degrees of exam, chroma no higher than exam, dE at least 30
 *   from exam. Quiz, assignment and reading are greys (chroma at most 5), each
 *   with less contrast against the card than the one before, neighbours at least
 *   20 L* apart. Every pair of the five differs by dE at least 20. Every bar is at
 *   least 3:1 on both grounds and every chip letter at least 4.5:1.
 *
 * "The card" is the block's `--color-surface`. "The picked-day fill" is the
 * block's `--color-neutral-900`, which is what `.daySelected`'s
 * `var(--color-accent-900)` resolves to in direction D. Chroma, hue and L* are
 * CIELAB's, and dE is CIE76. The order clause runs inside the three greys: quiz,
 * then assignment, then reading. The numbers are `direction-d.json`'s `typeScale`.
 *
 * Why the old pair rule is gone: on the dark card a grey reaches 3:1 only from
 * L* 43.8 up, which leaves less than 30 a step between three greys. So a floor on
 * the contrast of each bar and a smaller step between neighbours replace
 * "every pair dE >= 30" and "chroma spread beats lightness spread".
 *
 * Kept from before: the category tokens exist, and the glyph letter on its chip
 * is WCAG AA text (4.5:1).
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

/** The five categories `v_work_items` pre-computes, in ramp order (least urgent first). */
const CATEGORIES = ['reading', 'assignment', 'quiz', 'project', 'exam'] as const;
/** The three greys, from the quietest against the card to the loudest the order clause reads. */
const GREYS = ['quiz', 'assignment', 'reading'] as const;

/** The two theme blocks. Each is measured with its own values and its own card. */
const BLOCKS = ['dark', 'light'] as const;
type Block = (typeof BLOCKS)[number];

// `src/app/globals.css`, read when the suite loads.
const THEMES: ThemeMaps = readGlobalsThemeMaps();

/** A token of one block as a colour, following `var()` chains inside that block. */
function token(block: Block, name: string): Colour {
  const map: TokenMap = THEMES[block];
  return resolveColour(map, name);
}

const bar = (block: Block, category: string): Colour => token(block, `--type-${category}-bg`);
const card = (block: Block): Colour => token(block, '--color-surface');
const pickedDay = (block: Block): Colour => token(block, '--color-neutral-900');

/** CIELAB chroma and hue (degrees) of a colour. */
function chromaAndHue(colour: Colour): { chroma: number; hue: number } {
  const [, a, b] = toLab(colour);
  return { chroma: Math.hypot(a, b), hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** The shortest angle between two hues, 0 to 180. */
function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360;
  return gap > 180 ? 360 - gap : gap;
}

/* ---------------------------------------------------------------------------
 * The contract
 * ------------------------------------------------------------------------ */

const MIN_TEXT_CONTRAST = 4.5; // WCAG AA, the glyph letter on its chip
const MIN_BAR_CONTRAST = 3; // WCAG 1.4.11, a bar against the card and the picked day
const PROJECT_MIN_CHROMA = 40;
const PROJECT_MAX_HUE_GAP = 15; // degrees from exam
const PROJECT_MIN_EXAM_GAP = 30; // from exam
const GREY_MAX_CHROMA = 5;
const GREY_MIN_STEP = 20; // L*, between neighbours
const MIN_PAIR_DELTA_E = 20; // every pair of the five
const EXAM_RED = '#ff0000';

describe.each(BLOCKS)('assignment-type colour tokens, %s block', (block) => {
  it('declares a bg and an fg for all five categories', () => {
    for (const category of CATEGORIES) {
      expect(() => token(block, `--type-${category}-bg`)).not.toThrow();
      expect(() => token(block, `--type-${category}-fg`)).not.toThrow();
    }
  });

  it.each(CATEGORIES)('%s: the glyph letter is readable on its chip', (category) => {
    const fg = token(block, `--type-${category}-fg`);
    expect(contrastRatio(fg, bar(block, category))).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('exam is #ff0000, the step --color-accent-500 names', () => {
    const exam = bar(block, 'exam');
    const red = token(block, '--color-accent-500');
    expect([exam.r, exam.g, exam.b]).toEqual([red.r, red.g, red.b]);
    expect(exam).toMatchObject({ r: 1, g: 0, b: 0 });
    expect(EXAM_RED).toBe('#ff0000');
  });

  it('project is a second red: chroma >= 40, hue within 15 degrees of exam, chroma <= exam, dE >= 30 from exam', () => {
    const exam = chromaAndHue(bar(block, 'exam'));
    const project = chromaAndHue(bar(block, 'project'));
    expect(project.chroma).toBeGreaterThanOrEqual(PROJECT_MIN_CHROMA);
    expect(hueGap(project.hue, exam.hue)).toBeLessThanOrEqual(PROJECT_MAX_HUE_GAP);
    expect(project.chroma).toBeLessThanOrEqual(exam.chroma);
    expect(deltaE(bar(block, 'project'), bar(block, 'exam'))).toBeGreaterThanOrEqual(PROJECT_MIN_EXAM_GAP);
  });

  it.each(GREYS)('%s is a grey: chroma <= 5', (category) => {
    expect(chromaAndHue(bar(block, category)).chroma).toBeLessThanOrEqual(GREY_MAX_CHROMA);
  });

  it('quiz, assignment, reading: each has less contrast against the card than the one before', () => {
    const [quiz, assignment, reading] = GREYS.map((c) => contrastRatio(bar(block, c), card(block)));
    expect(quiz).toBeGreaterThan(assignment);
    expect(assignment).toBeGreaterThan(reading);
  });

  it('quiz, assignment, reading: neighbours are at least 20 L* apart', () => {
    const [quiz, assignment, reading] = GREYS.map((c) => toLab(bar(block, c))[0]);
    expect(Math.abs(quiz - assignment)).toBeGreaterThanOrEqual(GREY_MIN_STEP);
    expect(Math.abs(assignment - reading)).toBeGreaterThanOrEqual(GREY_MIN_STEP);
  });

  it('every pair of the five differs by dE >= 20', () => {
    const tooClose: string[] = [];
    for (let i = 0; i < CATEGORIES.length; i += 1) {
      for (let j = i + 1; j < CATEGORIES.length; j += 1) {
        const difference = deltaE(bar(block, CATEGORIES[i]), bar(block, CATEGORIES[j]));
        if (difference < MIN_PAIR_DELTA_E) {
          tooClose.push(`${CATEGORIES[i]}/${CATEGORIES[j]} dE=${difference.toFixed(1)}`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it.each(CATEGORIES)('%s: the bar is at least 3:1 on the card and on the picked-day fill', (category) => {
    expect(contrastRatio(bar(block, category), card(block))).toBeGreaterThanOrEqual(MIN_BAR_CONTRAST);
    expect(contrastRatio(bar(block, category), pickedDay(block))).toBeGreaterThanOrEqual(MIN_BAR_CONTRAST);
  });
});
