/**
 * The colour the window paints behind a page that has not loaded yet (Phase 22,
 * task 11; R-53; G-3).
 *
 * Always the app's dark ground, the `--color-bg` of `:root` in
 * `web/src/app/globals.css`. The window is destroyed on close and built again on
 * every open (since 2026-09-30), and each time it opens on this ground. A person
 * who picked Light sees one dark frame at each open, before the page paints;
 * that is accepted (DECISIONS 2026-10-08).
 *
 * `nativeTheme` is read nowhere in `desktop/`, and this module does not start:
 * the shell has no way to ask the page which theme it is in before it loads, so
 * a second colour would be a guess. `test/unit/window-background.test.ts` pins
 * `DARK` to the stylesheet. No Electron import here, so the test loads it as
 * plain Node.
 */

/** `:root`'s `--color-bg`, the dark block. */
export const DARK = '#050505';

/** What `BrowserWindow`'s `backgroundColor` is given. Takes no argument. */
export function windowBackground(): string {
  return DARK;
}
