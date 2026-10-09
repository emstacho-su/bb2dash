/**
 * The drag strip for pages with no bar (Phase 22, task 27; D-1).
 *
 * In the desktop shell the app's bar is the window's title bar, so a page with no bar needs a
 * handle on the window. `body::before` is that handle: as tall as the title-bar area (a browser
 * reports 0px, so nothing is drawn or reserved there), out of the flow, the first box of body, and
 * it never takes a click.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = /body::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

describe('body::before, the drag strip', () => {
  it('exists, once', () => {
    expect(rule).not.toBe('');
    expect(css.match(/body::before/g)).toHaveLength(1);
  });

  it('is as tall as the title-bar area and 0px in a browser', () => {
    expect(rule).toContain('height: env(titlebar-area-height, 0px);');
  });

  it('is a drag region, out of the flow, and takes no click', () => {
    expect(rule).toContain('app-region: drag;');
    expect(rule).toContain('position: fixed;');
    expect(rule).toContain('pointer-events: none;');
  });

  it('draws nothing of its own: no fill, no border, no shadow', () => {
    expect(rule).not.toMatch(/background|border|box-shadow|color:/);
  });
});
