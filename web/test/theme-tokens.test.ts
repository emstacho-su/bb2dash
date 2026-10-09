/**
 * The block-aware token reader (Phase 22, task 3; P-17; brief 103, "Contrast").
 *
 * `css-tokens.ts` reads `globals.css` into one map per theme block. Phase 22
 * adds a light block, `:root[data-theme='light']`, beside today's `:root`, and
 * every contrast test has to measure each block with that block's own values.
 * This file holds the reader's own cases, on fixtures written out here.
 *
 * NOTHING IN THIS FILE READS THE LIVE `globals.css`. `DARK_ROOT` below is a
 * verbatim copy of `:root` as it stood at a5042fa (`globals.css` lines 20-165).
 * Task 8 changes the live values; these cases must not move with them. The
 * suites that measure the live file are `type-tokens.contrast.test.ts` and, from
 * task 8, `theme-contrast.test.ts`.
 *
 * The last describe block reads the LIVE `globals.css` (Phase 22, task 8) and holds
 * what direction D's token set promises: both theme blocks, the 18 layout tokens
 * as `main` had them, `color-scheme` per block.
 *
 * WHAT IS PINNED
 *
 *   1. Blocks. A light block never moves the dark map. The light map is the
 *      dark map overlaid by the light block, and a `var()` inside the light
 *      block resolves against the light map.
 *   2. Compositing. `color-mix(in srgb, A p%, B)` is mixed and laid over the
 *      ground a pair names in floating point. A number is rounded once, when a
 *      hex is printed, never on the way to a contrast ratio.
 *   3. The two numbers the brief quotes from today's tokens: `--color-neutral-600`
 *      on `--color-surface` is 3.52, and `--color-danger` on `--color-danger-bg`
 *      over `--color-surface` is 3.94. Task 8 changes both pairs in the live file,
 *      which is why they are measured here on the copy.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  DARK_SELECTOR,
  LIGHT_SELECTOR,
  pairContrast,
  parseColour,
  readGlobalsThemeMaps,
  readThemeMaps,
  resolveColour,
  toHex,
} from './css-tokens';

/** `:root` of `globals.css` at a5042fa, lines 20-165, byte for byte. */
const DARK_ROOT = `:root {
  /* — roles ————————————————————————————————————————————————————————— */
  --color-bg: #161826;
  --color-surface: #232532;
  --color-text: #e9e9ed;
  --color-accent: #9184d9;
  --color-accent-2: #a7a1db;
  --color-divider: color-mix(in srgb, #e9e9ed 16%, transparent);
  --color-muted: color-mix(in srgb, var(--color-text) 55%, transparent);

  /* — tonal ramps (OKLCH-generated, one shared lightness scale) ————— */
  --color-neutral-100: #f3f5fe;
  --color-neutral-200: #e4e7f5;
  --color-neutral-300: #cfd3e5;
  --color-neutral-400: #b2b6ca;
  --color-neutral-500: #9397ab;
  --color-neutral-600: #75798c;
  --color-neutral-700: #595d6c;
  --color-neutral-800: #3f424d;
  --color-neutral-900: #292b31;

  --color-accent-100: #f5f4ff;
  --color-accent-200: #e7e5fe;
  --color-accent-300: #d2cefd;
  --color-accent-400: #b5abfc;
  --color-accent-500: #968ae0;
  --color-accent-600: #796cbf;
  --color-accent-700: #5d5294;
  --color-accent-800: #423a6a;
  --color-accent-900: #2b2741;

  --color-accent-2-100: #f5f4ff;
  --color-accent-2-200: #e7e5fe;
  --color-accent-2-300: #d2cefd;
  --color-accent-2-400: #b5afe8;
  --color-accent-2-500: #9690c9;
  --color-accent-2-600: #7972a9;
  --color-accent-2-700: #5c5783;
  --color-accent-2-800: #423e5d;
  --color-accent-2-900: #2b293a;

  /* — semantic aliases used by app chrome ——————————————————————————— */
  --color-danger: #e0736c;
  --color-danger-bg: color-mix(in srgb, #e0736c 16%, transparent);
  --color-hover: color-mix(in srgb, var(--color-text) 7%, transparent);
  --color-active: color-mix(in srgb, var(--color-text) 14%, transparent);

  /* — type ——————————————————————————————————————————————————————————— */
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-heading-weight: 500;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --text-xs: 11px;
  --text-sm: 12.5px;
  --text-base: 13.5px;
  --text-md: 15px;
  --text-lg: 17px;
  --text-xl: 20px;
  --text-2xl: 28px;

  /* — spacing (Nocturne's 0.70x scale) ————————————————————————————— */
  --space-1: 2.8px;
  --space-2: 5.6px;
  --space-3: 8.4px;
  --space-4: 11.2px;
  --space-6: 16.8px;
  --space-8: 22.4px;
  --space-12: 33.6px;

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 14px;

  /* — elevation (hairline edge + ambient darkness on a dark ground) ——— */
  --shadow-sm: 0 0 0 1px #3f424d;
  --shadow-md: 0 0 0 1px #595d6c, 0 6px 18px rgba(0, 0, 0, 0.55);
  --shadow-lg: 0 0 0 1px #9397ab, 0 16px 40px rgba(0, 0, 0, 0.65);

  /* — layout ————————————————————————————————————————————————————————— */
  --nav-height: 52px;
  --content-max: 1240px;

  /* Course sidebar. THIS is the token that flips the side: \`row\` puts the rail
     on the left (the Google Classroom convention), \`row-reverse\` puts it on the
     right. The shell row, the overlay drawer and the rail's own hairline all
     read it as a flex-direction, so one value moves all three. */
  --sidebar-side: row-reverse; /* row = left, row-reverse = right (Stack, 2026-09-14) */
  --sidebar-width: 260px;

  /* — assignment-type hues (effort tracker glyph + segment tints, T-15) —
     reading · assignment · quiz · project · exam.

     P-home-1 / H-1: these were one purple ramp plus a grey — five steps of the
     same hue, told apart only by lightness, which on a 14-column tracker bar
     reads as one smear. They are now five HUES at a deliberately common
     lightness, so the category is carried by colour and the bar's own heights
     stay the only thing lightness means.

     The five luminances sit in a narrow band (0.170–0.172) chosen so the same
     token works on either ground: >= 3:1 against the dark card (WCAG 1.4.11,
     a bar segment carries meaning) and >= 4.5:1 for white on it (WCAG AA, the
     glyph chip carries a letter). Above the band the letter fails; below it the
     segment does. \`test/type-tokens.contrast.test.ts\` measures all of it
     straight out of this file, on a light ground as well as this dark one, so
     the Phase 13 restyle has a check rather than a judgement call.

     Literal hexes, not ramp names, because no ramp holds these hues. A restyle
     may reintroduce \`var(--…)\` references; the test resolves them. */
  --type-reading-bg: #137e92; /* teal */
  --type-reading-fg: #ffffff;
  --type-assignment-bg: #725fde; /* violet — the accent family */
  --type-assignment-fg: #ffffff;
  --type-quiz-bg: #9d6811; /* amber */
  --type-quiz-fg: #ffffff;
  --type-project-bg: #1a8352; /* green */
  --type-project-fg: #ffffff;
  --type-exam-bg: #c8435a; /* rose */
  --type-exam-fg: #ffffff;

  /* — planner-event kinds (Phase 11b) — one bg / fg / edge per kind, all on the
     ramps above. Kind is the colour; a course never recolours a block (Q5).
     Out of office adds a hatch, working location a dashed edge and an
     appointment slot a dotted one, so the six read apart without colour too. */
  --planner-event-bg: var(--color-accent-700);
  --planner-event-fg: var(--color-accent-100);
  --planner-event-edge: var(--color-accent-300);
  --planner-task-bg: var(--color-neutral-800);
  --planner-task-fg: var(--color-neutral-100);
  --planner-task-edge: var(--color-neutral-300);
  --planner-ooo-bg: var(--color-danger-bg);
  --planner-ooo-fg: var(--color-text);
  --planner-ooo-edge: var(--color-danger);
  --planner-ooo-hatch: color-mix(in srgb, var(--color-danger) 14%, transparent);
  --planner-focus-bg: var(--color-accent-900);
  --planner-focus-fg: var(--color-accent-200);
  --planner-focus-edge: var(--color-accent-500);
  --planner-worklocation-bg: var(--color-neutral-900);
  --planner-worklocation-fg: var(--color-neutral-200);
  --planner-worklocation-edge: var(--color-neutral-500);
  --planner-appointment-bg: color-mix(in srgb, var(--color-accent-2-700) 40%, transparent);
  --planner-appointment-fg: var(--color-accent-2-100);
  --planner-appointment-edge: var(--color-accent-2-400);

  color-scheme: dark;
}`;

/** What a fixture is built from: the verbatim block, then whatever a case appends. */
const withBlocks = (...extra: readonly string[]): string => [DARK_ROOT, ...extra].join('\n');

const LIGHT_SURFACE_BLOCK = ":root[data-theme='light'] { --color-surface: #ffffff; }";

const hexOf = (css: string, block: 'dark' | 'light', name: string, over?: string): string => {
  const maps = readThemeMaps(css);
  const map = maps[block];
  return toHex(resolveColour(map, name, over === undefined ? undefined : resolveColour(map, over)));
};

describe('the selectors the reader knows', () => {
  it('names the two blocks the brief names', () => {
    expect(DARK_SELECTOR).toBe(':root');
    expect(LIGHT_SELECTOR).toBe(":root[data-theme='light']");
  });
});

describe('reading blocks', () => {
  it('reads every custom property of the verbatim :root into the dark map', () => {
    const declared = DARK_ROOT.split('\n').filter((line) => /^\s*--[a-z0-9-]+\s*:/i.test(line));
    const { dark } = readThemeMaps(withBlocks());
    expect(dark.size).toBe(declared.length);
    expect(dark.get('--color-surface')).toBe('#232532');
    expect(dark.get('--color-divider')).toBe('color-mix(in srgb, #e9e9ed 16%, transparent)');
    expect(dark.get('--sidebar-side')).toBe('row-reverse');
  });

  it('with no light block, the light map is the dark map and says so', () => {
    const maps = readThemeMaps(withBlocks());
    expect(maps.hasLightBlock).toBe(false);
    expect([...maps.light.entries()]).toEqual([...maps.dark.entries()]);
  });

  it("a light block does not move the dark ground: appending :root[data-theme='light'] { --color-surface: #ffffff; } leaves the dark --color-surface at #232532", () => {
    const maps = readThemeMaps(withBlocks(LIGHT_SURFACE_BLOCK));
    expect(maps.hasLightBlock).toBe(true);
    expect(maps.dark.get('--color-surface')).toBe('#232532');
    expect(maps.light.get('--color-surface')).toBe('#ffffff');
  });

  it('the light map is the dark map overlaid by the light block, nothing else', () => {
    const base = readThemeMaps(withBlocks());
    const maps = readThemeMaps(withBlocks(LIGHT_SURFACE_BLOCK));
    expect(maps.dark.size).toBe(base.dark.size);
    expect(maps.light.size).toBe(base.dark.size);
    expect(maps.light.get('--color-bg')).toBe('#161826');
    for (const [name, value] of maps.dark) {
      if (name !== '--color-surface') expect(maps.light.get(name)).toBe(value);
    }
  });

  it('a name only the light block declares reaches the light map and not the dark one', () => {
    const maps = readThemeMaps(withBlocks(":root[data-theme='light'] { --only-light: #101010; }"));
    expect(maps.light.get('--only-light')).toBe('#101010');
    expect(maps.dark.has('--only-light')).toBe(false);
  });

  it('a var() in the light block resolves against the light map, not the dark one', () => {
    const css = withBlocks(":root[data-theme='light'] { --color-text: #111111; --color-surface: #ffffff; }");
    // --color-muted is `color-mix(in srgb, var(--color-text) 55%, transparent)`:
    // 0.55 x #111111 over a white card in light, 0.55 x #e9e9ed over #232532 in dark.
    expect(hexOf(css, 'light', '--color-muted', '--color-surface')).toBe('#7c7c7c');
    expect(hexOf(css, 'dark', '--color-muted', '--color-surface')).toBe('#909199');
  });

  it('reads the selector however it is quoted and spaced', () => {
    for (const selector of [
      ':root[data-theme="light"]',
      ":root[data-theme='light']",
      ":root[data-theme = 'light']",
    ]) {
      const maps = readThemeMaps(`:root { --a: #000000; }\n${selector} { --a: #ffffff; }`);
      expect(maps.hasLightBlock, selector).toBe(true);
      expect(maps.light.get('--a'), selector).toBe('#ffffff');
      expect(maps.dark.get('--a'), selector).toBe('#000000');
    }
  });

  it('a space before the bracket is a descendant selector, not the light block', () => {
    const maps = readThemeMaps(":root { --a: #000000; }\n:root [data-theme='light'] { --a: #ffffff; }");
    expect(maps.hasLightBlock).toBe(false);
    expect(maps.light.get('--a')).toBe('#000000');
  });

  it('a later rule for the same selector wins, and a declaration repeated in a block takes the last', () => {
    const maps = readThemeMaps(':root { --a: #111111; --a: #222222; --b: #333333; }\n:root { --a: #444444; }');
    expect(maps.dark.get('--a')).toBe('#444444');
    expect(maps.dark.get('--b')).toBe('#333333');
  });

  it('ignores comments, whatever they hold', () => {
    const maps = readThemeMaps(
      [
        '/* :root { --ghost: #123456; } */',
        ':root {',
        '  --a: #111111; /* --a: #999999; and a } brace */',
        "  /* it's { odd; */ --b: #222222;",
        '}',
      ].join('\n'),
    );
    expect(maps.dark.get('--a')).toBe('#111111');
    expect(maps.dark.get('--b')).toBe('#222222');
    expect(maps.dark.has('--ghost')).toBe(false);
  });

  it('an @import with a semicolon in its URL does not swallow the :root after it', () => {
    const maps = readThemeMaps("@import url('https://f.example/css2?a=1;b=2&display=swap');\n:root { --a: #111111; }");
    expect(maps.dark.get('--a')).toBe('#111111');
  });

  it('reads only top-level rules: a :root inside an at-rule is not a theme block', () => {
    const maps = readThemeMaps(
      ':root { --a: #111111; }\n@media (max-width: 720px) { :root { --a: #999999; --b: #888888; } }',
    );
    expect(maps.dark.get('--a')).toBe('#111111');
    expect(maps.dark.has('--b')).toBe(false);
  });

  it('reads no other selector into either map', () => {
    const maps = readThemeMaps(':root { --a: #111111; }\n.card { --a: #999999; --c: #777777; }');
    expect(maps.dark.get('--a')).toBe('#111111');
    expect(maps.dark.has('--c')).toBe(false);
    expect(maps.hasLightBlock).toBe(false);
  });

  it('keeps a value that holds a semicolon inside parentheses or a string whole', () => {
    const maps = readThemeMaps(":root { --u: url('a;b'); --a: #111111; }");
    expect(maps.dark.get('--u')).toBe("url('a;b')");
    expect(maps.dark.get('--a')).toBe('#111111');
  });

  it('a stylesheet with no :root has an empty dark map', () => {
    const maps = readThemeMaps('.card { --a: #111111; }');
    expect(maps.dark.size).toBe(0);
  });
});

describe('resolving a token to a colour', () => {
  const { dark } = readThemeMaps(withBlocks());

  it('follows var() chains to a literal', () => {
    expect(toHex(resolveColour(dark, '--planner-event-bg'))).toBe('#5d5294');
    expect(toHex(resolveColour(dark, '--color-neutral-600'))).toBe('#75798c');
  });

  it('says so when a name is declared nowhere', () => {
    expect(() => resolveColour(dark, '--nope')).toThrow(/declares no --nope/);
    expect(() => resolveColour(new Map([['--a', 'var(--nope)']]), '--a')).toThrow(/declares no --nope/);
  });

  it('says so when a chain runs in a circle', () => {
    const loop = new Map([
      ['--a', 'var(--b)'],
      ['--b', 'var(--a)'],
    ]);
    expect(() => resolveColour(loop, '--a')).toThrow(/circle/);
  });

  it('reads #rgb, #rgba, #rrggbb and #rrggbbaa', () => {
    expect(toHex(parseColour('#abc'))).toBe('#aabbcc');
    expect(toHex(parseColour('#AABBCC'))).toBe('#aabbcc');
    expect(parseColour('#abc8').a).toBeCloseTo(0x88 / 255, 12);
    expect(parseColour('#aabbcc80').a).toBeCloseTo(0x80 / 255, 12);
  });

  it('reads rgb() and rgba(), commas or spaces, a percent or a number for alpha', () => {
    expect(toHex(parseColour('rgb(255, 0, 128)'))).toBe('#ff0080');
    expect(toHex(parseColour('rgb(255 0 128)'))).toBe('#ff0080');
    expect(parseColour('rgba(0, 0, 0, 0.55)').a).toBeCloseTo(0.55, 12);
    expect(parseColour('rgb(0 0 0 / 40%)').a).toBeCloseTo(0.4, 12);
  });

  it('reads transparent as alpha 0 and refuses a colour name it does not know', () => {
    expect(parseColour('transparent').a).toBe(0);
    expect(() => parseColour('rebeccapurple')).toThrow(/not a colour/);
    expect(() => parseColour('#12')).toThrow(/not a colour/);
  });
});

describe('compositing color-mix over a ground', () => {
  const css = withBlocks();

  it('prints today\'s --color-divider on the card as #434450', () => {
    // 0.16 x #e9e9ed + 0.84 x #232532, floating point, rounded when printed.
    expect(hexOf(css, 'dark', '--color-divider', '--color-surface')).toBe('#434450');
  });

  it("prints today's --color-danger-bg on the card as #41313b", () => {
    expect(hexOf(css, 'dark', '--color-danger-bg', '--color-surface')).toBe('#41313b');
  });

  it('follows a var() argument and a var() chain that ends in a colour-mix', () => {
    // --planner-ooo-bg is var(--color-danger-bg), itself a colour-mix.
    expect(hexOf(css, 'dark', '--planner-ooo-bg', '--color-surface')).toBe('#41313b');
    // --color-hover is color-mix(in srgb, var(--color-text) 7%, transparent).
    expect(hexOf(css, 'dark', '--color-hover', '--color-surface')).toBe('#31333f');
  });

  it('mixes two opaque colours with no ground, and defaults a missing percentage to the rest', () => {
    const map = new Map([
      ['--a', 'color-mix(in srgb, #ff0000 25%, #0000ff)'],
      ['--b', 'color-mix(in srgb, #000000, #ffffff)'],
      ['--c', 'color-mix(in srgb, #ff0000, #0000ff 75%)'],
    ]);
    expect(toHex(resolveColour(map, '--a'))).toBe('#4000bf');
    expect(toHex(resolveColour(map, '--b'))).toBe('#808080');
    expect(toHex(resolveColour(map, '--c'))).toBe('#4000bf');
  });

  it('keeps the mixed alpha when the second colour is transparent, then lays it over the ground', () => {
    const map = new Map([['--t', 'color-mix(in srgb, #ffffff 40%, transparent)']]);
    const mixed = resolveColour(map, '--t', parseColour('#000000'));
    expect(mixed.a).toBe(1);
    expect(mixed.r).toBeCloseTo(0.4, 12);
  });

  it('a transparent token over a ground is the ground', () => {
    const map = new Map([['--t', 'transparent']]);
    expect(toHex(resolveColour(map, '--t', parseColour('#232532')))).toBe('#232532');
  });

  it('an opaque colour ignores the ground', () => {
    expect(toHex(resolveColour(darkMap(css), '--color-text', parseColour('#000000')))).toBe('#e9e9ed');
  });

  it('refuses to print or measure a translucent colour that was given no ground', () => {
    const map = readThemeMaps(css).dark;
    expect(() => toHex(resolveColour(map, '--color-divider'))).toThrow(/ground/);
    expect(() => pairContrast(map, '--color-text', '--color-divider')).toThrow(/ground/);
  });

  it('reads one level of colour-mix and refuses more, or another colour space', () => {
    const nested = new Map([['--n', 'color-mix(in srgb, color-mix(in srgb, #fff 50%, #000) 50%, #000)']]);
    expect(() => resolveColour(nested, '--n')).toThrow(/nested/);
    const viaVar = new Map([
      ['--inner', 'color-mix(in srgb, #ffffff 50%, #000000)'],
      ['--n', 'color-mix(in srgb, var(--inner) 50%, #000000)'],
    ]);
    expect(() => resolveColour(viaVar, '--n')).toThrow(/nested/);
    const oklab = new Map([['--o', 'color-mix(in oklab, #ffffff 50%, #000000)']]);
    expect(() => resolveColour(oklab, '--o')).toThrow(/srgb/);
  });

  it('refuses a percentage outside 0 to 100', () => {
    const map = new Map([['--p', 'color-mix(in srgb, #ffffff 120%, #000000)']]);
    expect(() => resolveColour(map, '--p')).toThrow(/percent/);
  });
});

describe("contrast on today's tokens, measured from the verbatim copy", () => {
  const css = withBlocks();
  const { dark: map } = readThemeMaps(css);

  it('--color-neutral-600 on --color-surface is 3.52', () => {
    expect(pairContrast(map, '--color-neutral-600', '--color-surface').toFixed(2)).toBe('3.52');
  });

  it('--color-danger on --color-danger-bg over --color-surface is 3.94', () => {
    expect(pairContrast(map, '--color-danger', '--color-danger-bg', '--color-surface').toFixed(2)).toBe('3.94');
  });

  it('a pair that is not translucent is the plain WCAG ratio, in either order', () => {
    const forward = pairContrast(map, '--color-text', '--color-bg');
    expect(forward).toBeCloseTo(pairContrast(map, '--color-bg', '--color-text'), 12);
    expect(forward).toBeGreaterThan(4.5);
    expect(contrastRatio(parseColour('#000000'), parseColour('#ffffff'))).toBeCloseTo(21, 12);
  });

  it('contrast comes from the unrounded composite, and only a printed hex is rounded', () => {
    const over = resolveColour(map, '--color-surface');
    const exact = pairContrast(map, '--color-danger', '--color-danger-bg', '--color-surface');
    const composite = resolveColour(map, '--color-danger-bg', over);
    const fromRounded = contrastRatio(resolveColour(map, '--color-danger'), parseColour(toHex(composite)));
    // The two differ by about 0.02: a printed hex moves each channel by up to half
    // a step. If the reader rounded on the way, they would be the same number.
    expect(exact).not.toBe(fromRounded);
    expect(Math.abs(exact - fromRounded)).toBeLessThan(0.05);
    expect(Number.isInteger(composite.r * 255)).toBe(false);
  });
});

/** The dark map of a fixture, for cases that only need one expression. */
function darkMap(css: string) {
  return readThemeMaps(css).dark;
}


/* ---------------------------------------------------------------------------
 * The live stylesheet (task 8)
 * ------------------------------------------------------------------------ */

/** The 18 tokens that hold layout. A direction does not change them. */
const LAYOUT_TOKENS = [
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-6',
  '--space-8',
  '--space-12',
  '--nav-height',
  '--content-max',
  '--sidebar-width',
  '--sidebar-side',
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-md',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
] as const;

const GLOBALS = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
const COMMENTS = /\/\*[\s\S]*?\*\//g;
const LIVE = readGlobalsThemeMaps();
const MAIN = readThemeMaps(DARK_ROOT).dark;

/** The `color-scheme` a block declares, read from the block's own text. */
function colourSchemeOf(selector: string): string | null {
  const stripped = GLOBALS.replace(COMMENTS, '');
  const open = stripped.indexOf(`${selector} {`);
  if (open < 0) return null;
  const body = stripped.slice(open, stripped.indexOf('}', open));
  return /color-scheme:\s*([a-z]+)\s*;/.exec(body)?.[1] ?? null;
}

/** The light block on its own: the stylesheet with the dark block taken out. */
function lightBlockOnly(): ReadonlyMap<string, string> {
  return readThemeMaps(GLOBALS.replace(/:root \{[\s\S]*?\n\}/, '')).light;
}

const squeeze = (value: string): string => value.replace(/\s+/g, ' ').replace(/"/g, "'").trim();

describe('globals.css, direction D', () => {
  const evidence = join(process.cwd(), '..', 'docs', 'planning', 'sprint-2', 'evidence', '103_style_tiles');
  const direction = JSON.parse(readFileSync(join(evidence, 'direction-d.json'), 'utf8')) as {
    dark: Record<string, string>;
    light: Record<string, string>;
    tileOnly: { dark: Record<string, string> };
  };

  it('has a light block', () => {
    expect(LIVE.hasLightBlock).toBe(true);
  });

  it("the dark block holds every name of the JSON's dark map at its value, and the light block its light map", () => {
    const wrongDark = Object.entries(direction.dark).filter(([k, v]) => squeeze(LIVE.dark.get(k) ?? '') !== squeeze(v));
    expect(wrongDark.map(([k]) => k)).toEqual([]);
    const light = lightBlockOnly();
    const wrongLight = Object.entries(direction.light).filter(([k, v]) => squeeze(light.get(k) ?? '') !== squeeze(v));
    expect(wrongLight.map(([k]) => k)).toEqual([]);
  });

  it('the three exit names the JSON holds under tileOnly are declared in :root at its values', () => {
    for (const [name, value] of Object.entries(direction.tileOnly.dark)) {
      expect(squeeze(LIVE.dark.get(name) ?? ''), name).toBe(squeeze(value));
    }
  });

  it("the light block lacks none of :root's --color-* and --shadow-* names", () => {
    const light = lightBlockOnly();
    const wanted = [...LIVE.dark.keys()].filter((name) => /^--(color|shadow)-/.test(name));
    expect(wanted.length).toBeGreaterThan(60);
    expect(wanted.filter((name) => !light.has(name))).toEqual([]);
  });

  it('color-scheme is dark in :root and light in the light block', () => {
    expect(colourSchemeOf(':root')).toBe('dark');
    expect(colourSchemeOf(":root[data-theme='light']")).toBe('light');
  });

  it("the 18 layout tokens equal main's values (the verbatim copy), in both blocks", () => {
    expect(LAYOUT_TOKENS).toHaveLength(18);
    for (const name of LAYOUT_TOKENS) {
      expect(MAIN.has(name), name).toBe(true);
      expect(LIVE.dark.get(name), name).toBe(MAIN.get(name));
      expect(LIVE.light.get(name), name).toBe(MAIN.get(name));
    }
  });

  it('declares no system-preference copy of either block', () => {
    expect(GLOBALS.replace(COMMENTS, '')).not.toMatch(/@media\s*\(prefers-color-scheme/);
  });

  it('every colour token in a block resolves: no name points at a name nobody declares', () => {
    for (const block of ['dark', 'light'] as const) {
      const map = LIVE[block];
      const over = resolveColour(map, '--color-surface');
      const broken: string[] = [];
      for (const name of map.keys()) {
        if (!/^--(color|planner|type)-/.test(name)) continue;
        try {
          resolveColour(map, name, over);
        } catch (error) {
          broken.push(`${name}: ${(error as Error).message}`);
        }
      }
      expect(broken, block).toEqual([]);
    }
  });
});

describe('the visual round: radios (V-9)', () => {
  const css = GLOBALS.replace(COMMENTS, '');

  it('a radio is drawn in the ink: one weightless rule on :where(input[type=radio]) with accent-color', () => {
    const rule = /:where\(input\[type='radio'\]\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule.replace(/\s+/g, ' ').trim()).toBe('accent-color: var(--color-accent);');
  });
});
