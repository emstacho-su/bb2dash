/**
 * The shell's own pages (Phase 22, task 27; D-1, entry `desktop-shell-details`): the update
 * prompt, redrawn in direction D, and the page a window shows when the app cannot be loaded.
 *
 * Both are `data:` pages with no preload and no IPC, so their colours cannot reach the tokens at
 * run time. Each hex in either page is instead a value the dark block of `globals.css` declares,
 * checked here, and neither page holds the one red, `#ff0000`, nor the old blue or navy.
 * Both keep the system face: their CSP allows no web font.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { failedLoadDataUrl, failedLoadHtml, showsLoadFailed } from '../../src/main/load-failed';
import { promptHtml } from '../../src/main/update-prompt';

const APP_URL = 'https://web-xi-ten-uy9xk6c6p0.vercel.app';
const GLOBALS = join(process.cwd(), '..', 'web', 'src', 'app', 'globals.css');

/** Every `#rrggbb` the dark block declares as a value, lower case. */
function darkBlockHexes(): ReadonlySet<string> {
  const stripped = readFileSync(GLOBALS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const open = stripped.indexOf(':root {');
  const block = stripped.slice(open, stripped.indexOf('\n}', open));
  return new Set((block.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toLowerCase()));
}

const hexesIn = (page: string): string[] => (page.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((hex) => hex.toLowerCase());

const PAGES: readonly (readonly [string, string])[] = [
  ['the update prompt', promptHtml()],
  ['the failed-load page', failedLoadHtml(APP_URL)],
];

describe.each(PAGES)('%s: colour', (_name, page) => {
  it('holds hexes and every one is a value the dark block of globals.css declares', () => {
    const declared = darkBlockHexes();
    const used = hexesIn(page);
    expect(used.length).toBeGreaterThan(3);
    expect(used.filter((hex) => !declared.has(hex))).toEqual([]);
  });

  it('holds neither #ff0000, nor the old blue #4f6bed, nor the old navy #12131a', () => {
    const lower = page.toLowerCase();
    for (const hex of ['#ff0000', '#4f6bed', '#12131a']) expect(lower).not.toContain(hex);
  });

  it('keeps the system face and names no web font', () => {
    expect(page).toMatch(/system-ui/);
    expect(page).not.toMatch(/@font-face|fonts\.googleapis|url\(/);
  });

  it('declares the dark colour scheme', () => {
    expect(page).toContain('color-scheme: dark');
  });
});

describe('the failed-load page', () => {
  const page = failedLoadHtml(APP_URL);

  it('holds one link, to the app address, and it says Retry', () => {
    const links = [...page.matchAll(/<a\s[^>]*>([^<]*)<\/a>/g)];
    expect(links).toHaveLength(1);
    expect(links[0]?.[0]).toContain(`href="${APP_URL}"`);
    expect(links[0]?.[1]).toBe('Retry');
  });

  it('has a CSP that starts default-src none, allows inline style only, and holds no script', () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(page)?.[1] ?? '';
    expect(csp.startsWith("default-src 'none'")).toBe(true);
    expect(csp).toContain("style-src 'unsafe-inline'");
    expect(csp).not.toMatch(/script-src/);
    expect(page).not.toContain('<script');
  });

  it('has a drag strip as tall as the title-bar area, and a browser would draw nothing', () => {
    expect(page).toContain('app-region: drag');
    expect(page).toContain('env(titlebar-area-height, 0px)');
  });

  it('writes the address into the attribute escaped, so it cannot break out of it', () => {
    const hostile = 'https://example.test/?a=1&b="><script>alert(1)</script>';
    const escaped = failedLoadHtml(hostile);
    expect(escaped).not.toContain('<script');
    expect(escaped).not.toContain('"><script');
    expect(escaped).toContain('&amp;b=&quot;&gt;&lt;script&gt;');
  });

  it('is one sentence of text beside the link', () => {
    const text = page
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<title>[\s\S]*?<\/title>/g, '')
      .replace(/<a\s[\s\S]*?<\/a>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(text.length).toBeGreaterThan(10);
    expect(text.match(/[.!?]/g)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('is loaded from a data: URL that decodes to the same page', () => {
    const url = failedLoadDataUrl(APP_URL);
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toBe(page);
  });
});

describe('showsLoadFailed(errorCode, isMainFrame)', () => {
  it('is false for an aborted load: code -3 is not a failed load', () => {
    expect(showsLoadFailed(-3, true)).toBe(false);
  });

  it('is true for a real failure of the main frame', () => {
    expect(showsLoadFailed(-105, true)).toBe(true);
    expect(showsLoadFailed(-106, true)).toBe(true);
    expect(showsLoadFailed(-102, true)).toBe(true);
  });

  it('is false for any code when it is not the main frame', () => {
    for (const code of [-3, -105, -106, -2, 0]) expect(showsLoadFailed(code, false), String(code)).toBe(false);
  });
});

describe('the update prompt, redrawn', () => {
  const page = promptHtml();

  it('is the dark ground with a filled ink pill for Update now and grey pills for the rest', () => {
    expect(page).toMatch(/button\.primary\s*\{[^}]*background:\s*#fafafa/);
    expect(page).toMatch(/border-radius:\s*999px/);
  });

  it('keeps its mechanism: the title prefix, the answers and the CSP', () => {
    expect(page).toContain('bb2dash-update:');
    for (const answer of ['update-now', 'one-hour', 'four-hours', 'tomorrow']) expect(page).toContain(answer);
    expect(page).toContain("default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
  });
});
