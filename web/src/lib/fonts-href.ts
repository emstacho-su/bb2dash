/**
 * The one Google Fonts stylesheet the app loads (Phase 22, task 16; direction D's `fontsHref`):
 * Source Serif 4 at 600 for titles, Source Sans 3 at 400, 500, 600 and 700 for the body, and
 * Source Code Pro at 400 for figures. `display=swap`, so text paints in a fallback face first.
 *
 * Why this is a constant and the root layout links it: `globals.css` carries the same string in
 * its `@import`, as the brief says, but Next 16.3.4's CSS pipeline (Turbopack) drops an
 * `@import` whose URL holds `..`, which the optical-size axis `opsz,wght@8..60,600` does. Tried
 * in `next dev` and in `next build` on 2026-10-08: the same URL without the range stays, with it
 * the import is gone and no font is ever requested. So the stylesheet is also linked from the
 * root layout, which cannot be dropped. If the build ever keeps the `@import`, the browser loads
 * one stylesheet once (the second request is a cache hit).
 *
 * `test/fonts-href.test.ts` pins this string to `direction-d.json` and to the `@import`.
 */
export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400&family=Source+Sans+3:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600&display=swap';

/** The two hosts the stylesheet and the font files come from, for `preconnect`. */
export const GOOGLE_FONTS_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'] as const;
