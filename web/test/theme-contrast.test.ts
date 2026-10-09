/**
 * The frozen contrast list, measured in both theme blocks (Phase 22, task 8;
 * P-17, PD-7; brief 103, "Contrast").
 *
 * Thirty-eight pairs, fixed at the freeze and not edited since: 32 of text at
 * 4.5:1 and 6 of non-text at 3:1. Each is measured in the dark block (`:root`) and
 * in the light block (`:root[data-theme='light']`) with that block's own values,
 * through `test/css-tokens.ts`. A translucent background is laid over the ground
 * the pair names, in floating point, and the ratio comes from the unrounded
 * composite.
 *
 * The list:
 *   Text, 4.5:1 (32 pairs):
 *     --color-text, --color-muted and --color-accent, each on --color-bg and on
 *       --color-surface (6);
 *     --color-danger on --color-surface, and on --color-danger-bg over
 *       --color-surface (2);
 *     --color-neutral-300, -400, -500 and -600 on --color-surface (4);
 *     --color-accent-100 on --color-accent-800, the badge (1);
 *     each --planner-<kind>-fg on its --planner-<kind>-bg over --color-surface,
 *       six kinds (6);
 *     each --type-<cat>-fg on its --type-<cat>-bg, five categories (5);
 *     --color-accent-200, -300, --color-accent-2, --color-neutral-200,
 *       --color-accent-2-100 and --color-neutral-100, each on --color-surface (6);
 *     --color-accent-400 on --color-bg and on --color-surface (2).
 *   Non-text, 3:1 (6 pairs): each --type-<cat>-bg on --color-surface (5);
 *     --color-accent on --color-bg, the focus ring and the active-link underline (1).
 *
 * The same list is what the designer's "Tile contrast" command measures on the
 * tile; this file measures it on `globals.css`.
 */

import { describe, expect, it } from 'vitest';
import { pairContrast, readGlobalsThemeMaps, type ThemeMaps } from './css-tokens';

const SURFACE = '--color-surface';
const BG = '--color-bg';
const KINDS = ['event', 'task', 'ooo', 'focus', 'worklocation', 'appointment'] as const;
const CATEGORIES = ['reading', 'assignment', 'quiz', 'project', 'exam'] as const;

const MIN_TEXT = 4.5; // WCAG AA
const MIN_NON_TEXT = 3; // WCAG 1.4.11

interface Pair {
  readonly fg: string;
  readonly bg: string;
  /** The ground a translucent background sits on. */
  readonly over?: string;
  readonly min: number;
}

function buildPairs(): readonly Pair[] {
  const text = (fg: string, bg: string, over?: string): Pair => ({ fg, bg, over, min: MIN_TEXT });
  const nonText = (fg: string, bg: string): Pair => ({ fg, bg, min: MIN_NON_TEXT });
  const pairs: Pair[] = [];

  for (const fg of ['--color-text', '--color-muted', '--color-accent']) {
    pairs.push(text(fg, BG), text(fg, SURFACE));
  }
  pairs.push(text('--color-danger', SURFACE));
  pairs.push(text('--color-danger', '--color-danger-bg', SURFACE));
  for (const step of [300, 400, 500, 600]) pairs.push(text(`--color-neutral-${step}`, SURFACE));
  pairs.push(text('--color-accent-100', '--color-accent-800'));
  for (const kind of KINDS) pairs.push(text(`--planner-${kind}-fg`, `--planner-${kind}-bg`, SURFACE));
  for (const category of CATEGORIES) pairs.push(text(`--type-${category}-fg`, `--type-${category}-bg`));
  for (const fg of [
    '--color-accent-200',
    '--color-accent-300',
    '--color-accent-2',
    '--color-neutral-200',
    '--color-accent-2-100',
    '--color-neutral-100',
  ]) {
    pairs.push(text(fg, SURFACE));
  }
  pairs.push(text('--color-accent-400', BG), text('--color-accent-400', SURFACE));

  for (const category of CATEGORIES) pairs.push(nonText(`--type-${category}-bg`, SURFACE));
  pairs.push(nonText('--color-accent', BG));
  return pairs;
}

const PAIRS = buildPairs();
const THEMES: ThemeMaps = readGlobalsThemeMaps();
const BLOCKS = ['dark', 'light'] as const;

const label = (pair: Pair): string =>
  `${pair.fg} on ${pair.bg}${pair.over === undefined ? '' : ` over ${pair.over}`} >= ${pair.min}:1`;

describe('the frozen pair list', () => {
  it('holds 38 pairs: 32 of text and 6 of non-text', () => {
    expect(PAIRS).toHaveLength(38);
    expect(PAIRS.filter((p) => p.min === MIN_TEXT)).toHaveLength(32);
    expect(PAIRS.filter((p) => p.min === MIN_NON_TEXT)).toHaveLength(6);
  });

  it('has no pair twice', () => {
    expect(new Set(PAIRS.map(label)).size).toBe(PAIRS.length);
  });
});

describe.each(BLOCKS)('contrast in the %s block', (block) => {
  it.each(PAIRS.map((pair) => [label(pair), pair] as const))('%s', (_title, pair) => {
    const ratio = pairContrast(THEMES[block], pair.fg, pair.bg, pair.over);
    expect(ratio).toBeGreaterThanOrEqual(pair.min);
  });

  it('every pair of the list passes', () => {
    const failing = PAIRS.filter((pair) => pairContrast(THEMES[block], pair.fg, pair.bg, pair.over) < pair.min).map(
      label,
    );
    expect(failing).toEqual([]);
  });
});
