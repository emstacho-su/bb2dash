/**
 * H-1 / P-home-1 — the five assignment-type colours must be five colours.
 *
 * Before Phase 12b the `--type-*-bg` tokens were one purple ramp plus a grey:
 * five steps of the same hue, told apart only by lightness. On a 14-column
 * tracker bar that reads as one smear, which is exactly what Stack reported.
 *
 * This suite reads the real `src/app/globals.css` rather than a copy of the
 * values, so the contract cannot drift: change a token and this test is the
 * thing that fails. `var(--x)` indirections are resolved against `:root`, so a
 * Phase 13 restyle may express the tokens as ramp names and still be measured.
 *
 * WHAT IS ASSERTED, AND WHY THESE NUMBERS
 *
 *   1. Every `--type-*-fg` on its own `--type-*-bg` is >= 4.5:1. That pair is
 *      the glyph chip (R · A · Q · P · E), which carries a letter, so WCAG AA
 *      for text is the right bar.
 *   2. Every `--type-*-bg` is >= 3:1 against the ground it sits on, measured
 *      against BOTH grounds the app can put it on: the dark card
 *      (`--color-surface`, what ships today) and white (the light ground a
 *      styling pass would use). A bar segment carries no text but does carry
 *      meaning, so WCAG 1.4.11 non-text contrast, 3:1, is the right bar. This
 *      is the "light and dark" half of the row: the same five tokens are proven
 *      legible on either ground, so Phase 13 can flip the surface without
 *      re-picking the palette.
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `process.cwd()` rather than `import.meta.url`: under the jsdom environment
// the module URL is not a file: URL (same reason as test/audits.test.ts).
const CSS_PATH = join(process.cwd(), 'src', 'app', 'globals.css');

/** The five categories `v_work_items` pre-computes, in ramp order. */
const CATEGORIES = ['reading', 'assignment', 'quiz', 'project', 'exam'] as const;

/** The two grounds a type colour is ever painted on. See (2) in the header. */
const GROUNDS = {
  /** What ships: the Nocturne card. Read from the stylesheet, not hard-coded. */
  dark: null as string | null,
  /** A light styling pass's card. */
  light: '#ffffff',
};

/* ---------------------------------------------------------------------------
 * Reading the stylesheet
 * ------------------------------------------------------------------------ */

const css = readFileSync(CSS_PATH, 'utf8');

/** Every `--name: value;` declaration in the file, last one wins. */
function readCustomProperties(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    out.set(match[1], match[2].trim());
  }
  return out;
}

const PROPS = readCustomProperties(css);

/** Resolve a token to a literal colour, following `var(--x)` chains. */
function resolveToken(name: string, seen = new Set<string>()): string {
  const raw = PROPS.get(name);
  if (raw === undefined) throw new Error(`globals.css declares no ${name}`);
  if (seen.has(name)) throw new Error(`${name} resolves in a circle`);
  seen.add(name);

  const varRef = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(raw);
  if (varRef) return resolveToken(varRef[1], seen);
  return raw;
}

/* ---------------------------------------------------------------------------
 * Colour maths (sRGB -> relative luminance, and CIE76 dE through Lab)
 * ------------------------------------------------------------------------ */

function parseHex(value: string): [number, number, number] {
  const hex = value.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`"${value}" is not a plain hex colour — the type tokens must be literal so they can be measured`);
  }
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export function relativeLuminance(colour: string): number {
  const [r, g, b] = parseHex(colour).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1:1 … 21:1. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toLab(colour: string): [number, number, number] {
  const [r, g, b] = parseHex(colour).map(toLinear);
  const white = [0.95047, 1.0, 1.08883];
  const xyz = [
    r * 0.4124 + g * 0.3576 + b * 0.1805,
    r * 0.2126 + g * 0.7152 + b * 0.0722,
    r * 0.0193 + g * 0.1192 + b * 0.9505,
  ];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [x, y, z] = xyz.map((v, i) => f(v / white[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 colour difference. ~2.3 is a just-noticeable difference. */
export function deltaE(a: string, b: string): number {
  const [la, aa, ba] = toLab(a);
  const [lb, ab, bb] = toLab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

/* ---------------------------------------------------------------------------
 * The contract
 * ------------------------------------------------------------------------ */

const MIN_TEXT_CONTRAST = 4.5; // WCAG AA, the glyph letter on its chip
const MIN_GROUND_CONTRAST = 3; // WCAG 1.4.11, a bar segment against the card
const MIN_DELTA_E = 30; // told apart by hue, not lightness

describe('assignment-type colour tokens', () => {
  it('declares a bg and an fg for all five categories', () => {
    for (const category of CATEGORIES) {
      expect(() => resolveToken(`--type-${category}-bg`)).not.toThrow();
      expect(() => resolveToken(`--type-${category}-fg`)).not.toThrow();
    }
  });

  it.each(CATEGORIES)('%s: the glyph letter is readable on its chip', (category) => {
    const bg = resolveToken(`--type-${category}-bg`);
    const fg = resolveToken(`--type-${category}-fg`);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it.each(CATEGORIES)('%s: the segment is visible on a dark card', (category) => {
    GROUNDS.dark ??= resolveToken('--color-surface');
    const bg = resolveToken(`--type-${category}-bg`);
    expect(contrastRatio(bg, GROUNDS.dark)).toBeGreaterThanOrEqual(MIN_GROUND_CONTRAST);
  });

  it.each(CATEGORIES)('%s: the segment is visible on a light card', (category) => {
    const bg = resolveToken(`--type-${category}-bg`);
    expect(contrastRatio(bg, GROUNDS.light)).toBeGreaterThanOrEqual(MIN_GROUND_CONTRAST);
  });

  it('gives every pair of categories a different hue, not a different lightness', () => {
    const tooClose: string[] = [];
    for (let i = 0; i < CATEGORIES.length; i += 1) {
      for (let j = i + 1; j < CATEGORIES.length; j += 1) {
        const a = resolveToken(`--type-${CATEGORIES[i]}-bg`);
        const b = resolveToken(`--type-${CATEGORIES[j]}-bg`);
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
    const labs = CATEGORIES.map((c) => toLab(resolveToken(`--type-${c}-bg`)));
    const lightnessSpread = Math.max(...labs.map((l) => l[0])) - Math.min(...labs.map((l) => l[0]));
    const chromaSpread = Math.max(
      ...labs.flatMap((p, i) => labs.slice(i + 1).map((q) => Math.hypot(p[1] - q[1], p[2] - q[2]))),
    );
    expect(chromaSpread).toBeGreaterThan(lightnessSpread);
  });
});
