/**
 * The window's background, from the tokens (Phase 22, task 11; R-53; G-3).
 *
 * `window.ts` used to paint `'#12131a'` behind a page that has not loaded yet. It
 * now asks `windowBackground()`, which is always the app's dark ground: the window
 * is destroyed on close and built again on every open, and each time it opens
 * dark. A person who picked Light sees one dark frame at each open, before the
 * page paints. That is accepted and written down (DECISIONS 2026-10-08).
 *
 * `DARK` is pinned here to `:root`'s `--color-bg` in `web/src/app/globals.css`,
 * so a restyle of the ground that forgets the shell fails this test. The module
 * under test imports nothing from Electron, so it loads here as plain Node.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DARK, windowBackground } from '../../src/main/window-background';

// `process.cwd()` is `desktop/` (vitest runs from the package); the web app is its sibling.
const GLOBALS = join(process.cwd(), '..', 'web', 'src', 'app', 'globals.css');

/** `--color-bg` as `:root` (the dark block) declares it, comments taken out. */
function darkGroundOf(css: string): string | null {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf(':root {');
  if (open < 0) return null;
  const block = stripped.slice(open, stripped.indexOf('}', open));
  return /--color-bg:\s*(#[0-9a-fA-F]{6})\s*;/.exec(block)?.[1] ?? null;
}

describe('windowBackground', () => {
  it("DARK equals :root's --color-bg in web/src/app/globals.css", () => {
    const fromTokens = darkGroundOf(readFileSync(GLOBALS, 'utf8'));
    expect(fromTokens).not.toBeNull();
    expect(DARK.toLowerCase()).toBe(fromTokens?.toLowerCase());
  });

  it('is DARK, and takes no argument', () => {
    expect(windowBackground()).toBe(DARK);
    expect(windowBackground.length).toBe(0);
  });

  it('is the same value on every call: the window always opens on the dark ground', () => {
    expect(windowBackground()).toBe(windowBackground());
  });

  it('is a six-digit hex colour, which is what BrowserWindow takes', () => {
    expect(DARK).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('the old literal is gone from the window', () => {
  it("window.ts no longer holds the old ground, '#12131a'", () => {
    const source = readFileSync(join(process.cwd(), 'src', 'main', 'window.ts'), 'utf8');
    expect(source).not.toContain('12131a');
    expect(source).toContain('windowBackground()');
  });
});
