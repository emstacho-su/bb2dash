/**
 * The block-aware token reader (Phase 22, task 3; P-17; brief 103, "Contrast").
 *
 * Phase 22 puts a second theme block beside today's `:root` in `globals.css`:
 *
 *     :root { ... }                          the dark block, what ships today
 *     :root[data-theme='light'] { ... }      the light block, task 8
 *
 * A contrast test has to measure each block with that block's own values, so this
 * module reads the stylesheet into ONE MAP PER BLOCK. The dark map is `:root`.
 * The light map is the dark map overlaid by the light block, the way the cascade
 * lays it on the page: a name the light block does not declare keeps its dark
 * value, and a `var()` inside the light block resolves against the light map.
 *
 * WHAT IT READS. Top-level rules only. A rule inside an at-rule (`@media`,
 * `@supports`) is skipped, so a theme block is never picked up by accident from
 * somewhere it does not apply unconditionally. Comments are never read. Only
 * custom properties are kept: a theme token is a `--name`.
 *
 * WHAT IT RESOLVES. A colour is a hex, `rgb()` / `rgba()`, `transparent`, a
 * `var()` chain that ends in one of those, or one level of
 * `color-mix(in srgb, A p%, B)` where each of A and B is any of those. A
 * `color-mix` inside a `color-mix` (written out, or reached through a `var()`) is
 * refused, not guessed at; so is any colour space but srgb.
 *
 * HOW IT COMPOSITES. A translucent colour is laid over the ground a pair names,
 * in floating point, with straight alpha. Nothing is rounded on the way. A hex is
 * rounded once, when `toHex` prints it, and a contrast ratio is computed from the
 * unrounded composite, so a ratio is never a ratio of two printed hexes.
 * Example: `color-mix(in srgb, #e9e9ed 16%, transparent)` over `#232532` is
 * 0.16 x #e9e9ed + 0.84 x #232532, which prints `#434450`.
 *
 * Under the jsdom environment `import.meta.url` is not a file: URL, so the live
 * stylesheet is found from `process.cwd()` (vitest runs from `web/`), the same way
 * `test/audits.test.ts` does.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A colour in sRGB with straight (not premultiplied) alpha. Every channel is 0..1. */
export interface Colour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** A theme block's custom properties: `--name` to the value as written. */
export type TokenMap = ReadonlyMap<string, string>;

export interface ThemeMaps {
  /** `:root`. */
  readonly dark: TokenMap;
  /** The dark map overlaid by the light block. Equal to `dark` while there is no light block. */
  readonly light: TokenMap;
  /** Whether the stylesheet holds a light block at all. */
  readonly hasLightBlock: boolean;
}

export const DARK_SELECTOR = ':root';
export const LIGHT_SELECTOR = ":root[data-theme='light']";

/** Alpha below this counts as translucent. Float compositing leaves dust. */
const OPAQUE_EPSILON = 1e-9;
const NOT_A_COLOUR = 'is not a colour the reader reads';

/* ---------------------------------------------------------------------------
 * Reading rules
 * ------------------------------------------------------------------------ */

/** Index just past the string that opens at `start` (a quote). An unclosed string runs to the end. */
function endOfString(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === quote) return i + 1;
    else i += 1;
  }
  return text.length;
}

/** The source with every comment replaced by one space. Strings are walked, so a `/*` inside one stays. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const end = endOfString(source, i);
      out += source.slice(i, end);
      i = end;
    } else if (ch === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      out += ' ';
      i = close < 0 ? source.length : close + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Index of the `}` that closes the `{` at `open`. Throws when it never closes. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      i = endOfString(text, i);
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error('css-tokens: a "{" is never closed');
}

/** One selector, spelled one way: whitespace collapsed, double quotes single, no space inside `[ ]`. */
function normaliseSelector(prelude: string): string {
  return prelude
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\[([^\]]*)\]/g, (_whole, inner: string) => `[${inner.replace(/\s*=\s*/, '=').trim()}]`);
}

/** The custom properties declared directly in a rule body. A nested rule's declarations are not its own. */
function readDeclarations(body: string): ReadonlyMap<string, string> {
  const declarations = new Map<string, string>();
  let segment = '';
  let paren = 0;
  let i = 0;
  const flush = (): void => {
    const colon = segment.indexOf(':');
    const name = colon < 0 ? '' : segment.slice(0, colon).trim();
    if (name.startsWith('--')) {
      const value = segment
        .slice(colon + 1)
        .replace(/\s*!important\s*$/i, '')
        .trim();
      if (value !== '') declarations.set(name, value);
    }
    segment = '';
  };
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'") {
      const end = endOfString(body, i);
      segment += body.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '(') paren += 1;
    if (ch === ')') paren = Math.max(0, paren - 1);
    if (ch === '{' && paren === 0) {
      // A nested rule: its prelude and its body are not this rule's declarations.
      segment = '';
      i = matchingBrace(body, i) + 1;
      continue;
    }
    if (ch === ';' && paren === 0) {
      flush();
      i += 1;
      continue;
    }
    segment += ch;
    i += 1;
  }
  flush();
  return declarations;
}

/** Every top-level style rule's custom properties, by normalised selector. A later rule overrides an earlier one. */
function readRules(source: string): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const text = stripComments(source);
  const rules = new Map<string, ReadonlyMap<string, string>>();
  let prelude = '';
  let paren = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i);
      prelude += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '(') paren += 1;
    if (ch === ')') paren = Math.max(0, paren - 1);
    if (paren === 0 && ch === ';') {
      prelude = ''; // a statement at-rule, such as @import, ends here
      i += 1;
      continue;
    }
    if (paren === 0 && ch === '{') {
      const close = matchingBrace(text, i);
      const selector = normaliseSelector(prelude);
      if (!selector.startsWith('@')) {
        rules.set(selector, new Map([...(rules.get(selector) ?? []), ...readDeclarations(text.slice(i + 1, close))]));
      }
      prelude = '';
      i = close + 1;
      continue;
    }
    prelude += ch;
    i += 1;
  }
  return rules;
}

/** The dark and light maps of a stylesheet. */
export function readThemeMaps(source: string): ThemeMaps {
  const rules = readRules(source);
  const dark: TokenMap = rules.get(DARK_SELECTOR) ?? new Map();
  const lightBlock = rules.get(LIGHT_SELECTOR);
  return {
    dark,
    light: new Map([...dark, ...(lightBlock ?? [])]),
    hasLightBlock: lightBlock !== undefined,
  };
}

/** The two maps of the live `src/app/globals.css`. */
export function readGlobalsThemeMaps(): ThemeMaps {
  return readThemeMaps(readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8'));
}

/* ---------------------------------------------------------------------------
 * Colours
 * ------------------------------------------------------------------------ */

/** A channel written as a number of 0..255 or as a percent, as 0..1. */
function channel(text: string, original: string): number {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value)) throw new Error(`"${original}" ${NOT_A_COLOUR}`);
  return text.endsWith('%') ? value / 100 : value / 255;
}

/** An alpha written as a number of 0..1 or as a percent, as 0..1. */
function alpha(text: string, original: string): number {
  const value = Number.parseFloat(text);
  if (Number.isNaN(value)) throw new Error(`"${original}" ${NOT_A_COLOUR}`);
  return text.endsWith('%') ? value / 100 : value;
}

/** A literal colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()` or `transparent`. */
export function parseColour(text: string): Colour {
  const value = text.trim();
  if (value.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const byte = (index: number): number => Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16) / 255;
    return { r: byte(0), g: byte(1), b: byte(2), a: digits.length === 8 ? byte(3) : 1 };
  }

  const fn = /^rgba?\(\s*([^)]*?)\s*\)$/i.exec(value);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter((part) => part !== '');
    if (parts.length === 3 || parts.length === 4) {
      return {
        r: channel(parts[0], value),
        g: channel(parts[1], value),
        b: channel(parts[2], value),
        a: parts.length === 4 ? alpha(parts[3], value) : 1,
      };
    }
  }
  throw new Error(`"${value}" ${NOT_A_COLOUR}`);
}

/** The value a name finally holds, following `var(--other)` references to something that is not one. */
function followVars(map: TokenMap, name: string, seen: ReadonlySet<string> = new Set()): string {
  const raw = map.get(name);
  if (raw === undefined) throw new Error(`the stylesheet declares no ${name}`);
  if (seen.has(name)) throw new Error(`${name} resolves in a circle`);
  const reference = /^var\(\s*(--[a-z0-9_-]+)\s*\)$/i.exec(raw);
  return reference ? followVars(map, reference[1], new Set([...seen, name])) : raw;
}

/** Split on commas that are not inside parentheses or a string. */
function splitTopLevel(text: string): readonly string[] {
  const parts: string[] = [];
  let current = '';
  let paren = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i);
      current += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '(') paren += 1;
    if (ch === ')') paren -= 1;
    if (ch === ',' && paren === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
    i += 1;
  }
  parts.push(current.trim());
  return parts;
}

interface MixArgument {
  readonly colour: Colour;
  /** The percentage as written, 0..100, or null when the argument gave none. */
  readonly percent: number | null;
}

/** One `color-mix` argument: a colour, a `var()` that ends in one, and an optional percentage. */
function readMixArgument(map: TokenMap, text: string): MixArgument {
  const split = /^(.*?)(?:\s+(\d*\.?\d+)%)?$/s.exec(text.trim());
  const colourText = split ? split[1].trim() : text.trim();
  const percent = split?.[2] === undefined ? null : Number.parseFloat(split[2]);
  if (percent !== null && (percent < 0 || percent > 100)) {
    throw new Error(`color-mix percentage ${percent}% is outside 0 to 100 percent`);
  }

  let literal = colourText;
  if (/^var\(/i.test(colourText)) {
    const reference = /^var\(\s*(--[a-z0-9_-]+)\s*\)$/i.exec(colourText);
    if (!reference) throw new Error(`"${colourText}" ${NOT_A_COLOUR}`);
    literal = followVars(map, reference[1]);
  }
  if (/^color-mix\(/i.test(literal)) throw new Error('a nested color-mix is not read (one level only)');
  return { colour: parseColour(literal), percent };
}

/** `color-mix(in srgb, A p%, B)`, mixed with premultiplied alpha as CSS does. */
function mixColours(map: TokenMap, value: string): Colour {
  const inner = /^color-mix\((.*)\)$/is.exec(value.trim());
  if (!inner) throw new Error(`"${value}" ${NOT_A_COLOUR}`);
  const args = splitTopLevel(inner[1]);
  if (args.length !== 3) throw new Error(`"${value}" ${NOT_A_COLOUR}`);
  if (!/^in\s+srgb$/i.test(args[0])) throw new Error(`color-mix "${args[0]}": only srgb is read`);

  const first = readMixArgument(map, args[1]);
  const second = readMixArgument(map, args[2]);
  const given1 = first.percent;
  const given2 = second.percent;
  const p1 = given1 ?? (given2 === null ? 50 : 100 - given2);
  const p2 = given2 ?? (given1 === null ? 50 : 100 - given1);
  const total = p1 + p2;
  if (total <= 0) throw new Error(`color-mix percentages ${p1}% and ${p2}% leave nothing to mix`);

  // Weights sum to 1. A total under 100% scales the alpha down, as the spec says.
  const w1 = (p1 / total) * first.colour.a;
  const w2 = (p2 / total) * second.colour.a;
  const mixedAlpha = (w1 + w2) * Math.min(total, 100) * 0.01;
  if (w1 + w2 === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (w1 * first.colour.r + w2 * second.colour.r) / (w1 + w2),
    g: (w1 * first.colour.g + w2 * second.colour.g) / (w1 + w2),
    b: (w1 * first.colour.b + w2 * second.colour.b) / (w1 + w2),
    a: mixedAlpha,
  };
}

/** `colour` laid over `ground`, straight alpha, floating point, unrounded. */
function composite(colour: Colour, ground: Colour): Colour {
  const a = colour.a + ground.a * (1 - colour.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (top: number, under: number): number =>
    (colour.a * top + ground.a * (1 - colour.a) * under) / a;
  return { r: mix(colour.r, ground.r), g: mix(colour.g, ground.g), b: mix(colour.b, ground.b), a };
}

const isOpaque = (colour: Colour): boolean => colour.a >= 1 - OPAQUE_EPSILON;

/**
 * A token as a colour. A translucent one is laid over `over`; with no ground it
 * is an error, because a translucent colour has no contrast of its own.
 */
export function resolveColour(map: TokenMap, name: string, over?: Colour): Colour {
  const value = followVars(map, name);
  const colour = /^color-mix\(/i.test(value) ? mixColours(map, value) : parseColour(value);
  const result = over === undefined ? colour : composite(colour, over);
  if (!isOpaque(result) && over === undefined) {
    throw new Error(`${name} is translucent (alpha ${colour.a.toFixed(3)}); name the ground to lay it over`);
  }
  return result;
}

/** `#rrggbb`. The one place a channel is rounded. An unresolved translucent colour cannot be printed. */
export function toHex(colour: Colour): string {
  if (!isOpaque(colour)) throw new Error('a translucent colour has no hex; lay it over a ground first');
  const byte = (value: number): string =>
    Math.min(255, Math.max(0, Math.round(value * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${byte(colour.r)}${byte(colour.g)}${byte(colour.b)}`;
}

/* ---------------------------------------------------------------------------
 * Colour maths (sRGB to relative luminance, and CIE76 dE through Lab)
 * ------------------------------------------------------------------------ */

const toLinear = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function opaque(colour: Colour): Colour {
  if (!isOpaque(colour)) throw new Error('contrast needs an opaque colour; lay it over a ground first');
  return colour;
}

export function relativeLuminance(colour: Colour): number {
  const { r, g, b } = opaque(colour);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio, 1:1 to 21:1, from the colours as they are, unrounded. */
export function contrastRatio(a: Colour, b: Colour): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** CIELAB, D65. */
export function toLab(colour: Colour): readonly [number, number, number] {
  const { r, g, b } = opaque(colour);
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const white = [0.95047, 1.0, 1.08883];
  const xyz = [
    lr * 0.4124 + lg * 0.3576 + lb * 0.1805,
    lr * 0.2126 + lg * 0.7152 + lb * 0.0722,
    lr * 0.0193 + lg * 0.1192 + lb * 0.9505,
  ];
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [x, y, z] = xyz.map((v, i) => f(v / white[i]));
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 colour difference. About 2.3 is a just-noticeable difference. */
export function deltaE(a: Colour, b: Colour): number {
  const [la, aa, ba] = toLab(a);
  const [lb, ab, bb] = toLab(b);
  return Math.hypot(la - lb, aa - ab, ba - bb);
}

/**
 * The contrast of token `fg` on token `bg` in one block's map. `over` names the
 * ground a translucent `bg` sits on (and `fg`, if it is translucent too, sits on
 * the composited `bg`).
 */
export function pairContrast(map: TokenMap, fg: string, bg: string, over?: string): number {
  const ground = over === undefined ? undefined : resolveColour(map, over);
  const background = resolveColour(map, bg, ground);
  const foreground = resolveColour(map, fg, background);
  return contrastRatio(foreground, background);
}
