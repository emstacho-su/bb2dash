/**
 * The title bar (Phase 22, task 27; D-1, entry `desktop-title-bar`).
 *
 * The window's own title bar is the app's bar: `titleBarStyle: 'hidden'` with a `titleBarOverlay`
 * of the bar's fill, the ink of Windows' three buttons, and the bar's height. Every number lives
 * in `title-bar.ts`, pinned here to `web/src/app/globals.css` the way `window-background.test.ts`
 * pins `DARK`, so a restyle that moves the bar and forgets the shell fails here.
 *
 * Also pinned: which theme a colour belongs to (the page writes its `theme-color` hex in lower
 * case and Electron may hand it back in upper case, so the comparison ignores case and white
 * space), the window's minimum width, and the widening of a saved width that is under it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  BAR_HEIGHT,
  BAR_IDLE_WIDTH,
  CONTROLS_WIDTH,
  DARK_OVERLAY,
  LIGHT_OVERLAY,
  MIN_WIDTH,
  overlayFor,
  themeOfColour,
  widenToMinimum,
} from '../../src/main/title-bar';
import { DARK, LIGHT } from '../../src/main/window-background';

const GLOBALS = join(process.cwd(), '..', 'web', 'src', 'app', 'globals.css');

/** A custom property of one theme block of the stylesheet, comments taken out. */
function tokenOf(selector: string, name: string): string {
  const stripped = readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf(`${selector} {`);
  if (open < 0) throw new Error(`globals.css has no ${selector} block`);
  const block = stripped.slice(open, stripped.indexOf('\n}', open));
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1];
  if (value === undefined) throw new Error(`${selector} declares no ${name}`);
  return value.trim();
}

const DARK_BLOCK = ':root';
const LIGHT_BLOCK = ":root[data-theme='light']";
/** The light block declares only what differs; the rest is the dark block's. */
const lightOrDark = (name: string): string => {
  try {
    return tokenOf(LIGHT_BLOCK, name);
  } catch {
    return tokenOf(DARK_BLOCK, name);
  }
};

describe('the overlay colours are the two blocks of globals.css', () => {
  it("the dark fill is the dark block's --color-surface and its symbols are --color-text", () => {
    expect(DARK_OVERLAY.color.toLowerCase()).toBe(tokenOf(DARK_BLOCK, '--color-surface'));
    expect(DARK_OVERLAY.symbolColor.toLowerCase()).toBe(tokenOf(DARK_BLOCK, '--color-text'));
  });

  it("the light fill is the light block's --color-surface and its symbols are --color-text", () => {
    expect(LIGHT_OVERLAY.color.toLowerCase()).toBe(lightOrDark('--color-surface'));
    expect(LIGHT_OVERLAY.symbolColor.toLowerCase()).toBe(lightOrDark('--color-text'));
  });

  it('the height is --nav-height, 52', () => {
    expect(`${BAR_HEIGHT}px`).toBe(tokenOf(DARK_BLOCK, '--nav-height'));
    expect(DARK_OVERLAY.height).toBe(BAR_HEIGHT);
    expect(LIGHT_OVERLAY.height).toBe(BAR_HEIGHT);
    expect(BAR_HEIGHT).toBe(52);
  });

  it("LIGHT equals the light block's --color-bg, and DARK the dark block's", () => {
    expect(LIGHT.toLowerCase()).toBe(tokenOf(LIGHT_BLOCK, '--color-bg'));
    expect(DARK.toLowerCase()).toBe(tokenOf(DARK_BLOCK, '--color-bg'));
  });

  it('the two overlays differ in both colours', () => {
    expect(DARK_OVERLAY.color).not.toBe(LIGHT_OVERLAY.color);
    expect(DARK_OVERLAY.symbolColor).not.toBe(LIGHT_OVERLAY.symbolColor);
  });
});

describe('which theme a colour belongs to', () => {
  it('LIGHT maps to the light overlay', () => {
    expect(themeOfColour(LIGHT)).toBe('light');
    expect(overlayFor(LIGHT)).toEqual(LIGHT_OVERLAY);
  });

  it('LIGHT in upper case, or with white space round it, maps to light too', () => {
    expect(themeOfColour(LIGHT.toUpperCase())).toBe('light');
    expect(themeOfColour(` ${LIGHT} `)).toBe('light');
    expect(themeOfColour(`\t${LIGHT.toUpperCase()}\n`)).toBe('light');
  });

  it('DARK, null, junk and any other colour map to dark', () => {
    for (const value of [DARK, DARK.toUpperCase(), null, undefined, '', 'rebeccapurple', '#ffffff', '#f4f4f5', 42, {}, [LIGHT]]) {
      expect(themeOfColour(value), String(value)).toBe('dark');
      expect(overlayFor(value)).toEqual(DARK_OVERLAY);
    }
  });
});

describe('the minimum width', () => {
  it('CONTROLS_WIDTH is 138', () => {
    expect(CONTROLS_WIDTH).toBe(138);
  });

  it("BAR_IDLE_WIDTH is the 'unfolded bar at 721' nav scrollWidth W-68 recorded for this task", () => {
    const record = readFileSync(
      join(process.cwd(), '..', 'docs', 'planning', 'sprint-2', 'verification', '103_W68_VERIFICATION.md'),
      'utf8',
    );
    const section = record.split(/^## Idle bar width for task 27\r?\n/m)[1]?.split(/^## /m)[0] ?? '';
    const printed = /unfolded bar at 721: nav scrollWidth=(\d+)/.exec(section)?.[1];
    expect(printed).toBeDefined();
    expect(BAR_IDLE_WIDTH).toBe(Number(printed));
  });

  it('MIN_WIDTH is BAR_IDLE_WIDTH plus CONTROLS_WIDTH rounded up to the next 10, and not under 900', () => {
    expect(MIN_WIDTH).toBe(Math.ceil((BAR_IDLE_WIDTH + CONTROLS_WIDTH) / 10) * 10);
    expect(MIN_WIDTH % 10).toBe(0);
    expect(MIN_WIDTH).toBeGreaterThanOrEqual(BAR_IDLE_WIDTH + CONTROLS_WIDTH);
    expect(MIN_WIDTH).toBeLessThan(BAR_IDLE_WIDTH + CONTROLS_WIDTH + 10);
    expect(MIN_WIDTH).toBeGreaterThanOrEqual(900);
    expect(MIN_WIDTH).toBe(960);
  });
});

describe('a saved width under the minimum', () => {
  it('is widened to MIN_WIDTH', () => {
    expect(widenToMinimum(900)).toBe(MIN_WIDTH);
    expect(widenToMinimum(MIN_WIDTH - 1)).toBe(MIN_WIDTH);
    expect(widenToMinimum(0)).toBe(MIN_WIDTH);
  });

  it('a width at the minimum or wider is kept', () => {
    expect(widenToMinimum(MIN_WIDTH)).toBe(MIN_WIDTH);
    expect(widenToMinimum(MIN_WIDTH + 1)).toBe(MIN_WIDTH + 1);
    expect(widenToMinimum(1280)).toBe(1280);
  });
});
