/**
 * The window's title bar is the app's bar (Phase 22, task 27; D-1, entry `desktop-title-bar`).
 *
 * `createWindow` builds the window with `titleBarStyle: 'hidden'` and a `titleBarOverlay`: Windows
 * keeps its own three buttons and draws them in the colours below, over the page's own top bar. Every
 * number here is pinned to `web/src/app/globals.css` by `test/unit/title-bar.test.ts`. No Electron
 * import, so the test loads this as plain Node.
 *
 * The overlay is built in the dark bar's colours (the window opens dark, G-3). When the page writes
 * its `theme-color` meta (at boot, on a pick and on a system change) Electron fires
 * `did-change-theme-color` with that colour and `overlayFor` says which overlay it belongs to. The
 * comparison ignores case and white space: the page writes its hexes in lower case and Electron may
 * hand the colour back in upper case, and a plain string comparison could leave the buttons dark on a
 * light bar with every test green.
 */

import { LIGHT } from './window-background';

/** `--nav-height`: the bar's height, and so the overlay's. */
export const BAR_HEIGHT = 52;

/** The three window buttons' width, by the pass's measure (REFINEMENT section 8). */
export const CONTROLS_WIDTH = 138;

/**
 * The `nav scrollWidth` of the idle bar with search collapsed, in the body face as served: the line
 * `unfolded bar at 721: nav scrollWidth=815` of the phone-width run 20261009T031826Z, which W-68
 * recorded under "Idle bar width for task 27" in `103_W68_VERIFICATION.md`.
 */
export const BAR_IDLE_WIDTH = 815;

/** The window's minimum width: the idle bar and the three buttons, rounded up to the next 10. */
export const MIN_WIDTH = Math.ceil((BAR_IDLE_WIDTH + CONTROLS_WIDTH) / 10) * 10;

export interface TitleBarOverlay {
  /** The bar's fill: `--color-surface`. */
  readonly color: string;
  /** The ink of the three buttons' symbols: `--color-text`. */
  readonly symbolColor: string;
  readonly height: number;
}

/** The dark block's `--color-surface` and `--color-text`. */
export const DARK_OVERLAY: TitleBarOverlay = Object.freeze({
  color: '#1d1d1d',
  symbolColor: '#f2f2f2',
  height: BAR_HEIGHT,
});

/** The light block's `--color-surface` and `--color-text`. */
export const LIGHT_OVERLAY: TitleBarOverlay = Object.freeze({
  color: '#ffffff',
  symbolColor: '#111111',
  height: BAR_HEIGHT,
});

export type BarTheme = 'light' | 'dark';

/** `LIGHT` means light, in any case and with white space round it; anything else is dark. */
export function themeOfColour(colour: unknown): BarTheme {
  if (typeof colour !== 'string') return 'dark';
  return colour.replace(/\s+/g, '').toLowerCase() === LIGHT ? 'light' : 'dark';
}

/** The overlay for the colour the page's `theme-color` meta now holds. */
export function overlayFor(colour: unknown): TitleBarOverlay {
  return themeOfColour(colour) === 'light' ? LIGHT_OVERLAY : DARK_OVERLAY;
}

/** A saved window width under the minimum is widened to it before it is used; a wider one is kept. */
export function widenToMinimum(width: number): number {
  return Math.max(width, MIN_WIDTH);
}
