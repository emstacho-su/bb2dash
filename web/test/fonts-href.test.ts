/**
 * The fonts stylesheet (Phase 22, task 16; direction D's `fontsHref`).
 *
 * `globals.css` holds the Google Fonts `@import`, and Next's CSS pipeline drops it when the URL
 * holds the optical-size range `8..60` (see `lib/fonts-href.ts`), so the root layout links the
 * same stylesheet too. This file keeps the three copies of the string equal: the JSON the
 * direction was picked from, the `@import`, and the constant the layout links. It also keeps the
 * layout honest: the link is in the document head, not behind a condition.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOGLE_FONTS_HREF, GOOGLE_FONTS_ORIGINS } from '@/lib/fonts-href';

const WEB = process.cwd();
const COMMENTS = /\/\*[\s\S]*?\*\//g;

const globals = readFileSync(join(WEB, 'src', 'app', 'globals.css'), 'utf8').replace(COMMENTS, '');
const layout = readFileSync(join(WEB, 'src', 'app', 'layout.tsx'), 'utf8');
const direction = JSON.parse(
  readFileSync(join(WEB, '..', 'docs', 'planning', 'sprint-2', 'evidence', '103_style_tiles', 'direction-d.json'), 'utf8'),
) as { fontsHref: string };

describe('the fonts stylesheet', () => {
  it("equals direction D's fontsHref", () => {
    expect(GOOGLE_FONTS_HREF).toBe(direction.fontsHref);
  });

  it('is the one @import of globals.css, written as the JSON has it', () => {
    const imports = globals.match(/@import url\('[^']*'\);/g) ?? [];
    expect(imports.filter((rule) => rule.includes('fonts.googleapis.com'))).toEqual([`@import url('${GOOGLE_FONTS_HREF}');`]);
  });

  it('loads Source Serif 4 at 600, Source Sans 3 at 400 to 700 and Source Code Pro at 400, and no Inter', () => {
    expect(GOOGLE_FONTS_HREF).toContain('family=Source+Serif+4:opsz,wght@8..60,600');
    expect(GOOGLE_FONTS_HREF).toContain('family=Source+Sans+3:wght@400;500;600;700');
    expect(GOOGLE_FONTS_HREF).toContain('family=Source+Code+Pro:wght@400');
    expect(GOOGLE_FONTS_HREF).toContain('display=swap');
    expect(GOOGLE_FONTS_HREF).not.toContain('Inter');
  });

  it('is linked from the root layout, with a preconnect for each host, whatever the build does to the @import', () => {
    expect(layout).toContain("from '@/lib/fonts-href'");
    expect(layout).toMatch(/<link\s+rel="stylesheet"\s+href=\{GOOGLE_FONTS_HREF\}/);
    for (const origin of GOOGLE_FONTS_ORIGINS) expect(origin.startsWith('https://')).toBe(true);
    expect(layout).toContain('GOOGLE_FONTS_ORIGINS');
  });
});
