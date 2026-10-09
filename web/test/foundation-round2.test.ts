/**
 * Round 2 of the first code review, for the foundation files (Phase 22).
 *
 *   R2-9    the preconnect to fonts.googleapis.com carries no `crossOrigin` (the stylesheet is not a
 *           CORS request and could not reuse a CORS connection); the one for fonts.gstatic.com does
 *           (the font files are); `globals.css` says above its `@import` that the build drops it.
 *   R2-tip  the drawn label of an icon button has an empty alternative text, so it is drawn and not
 *           spoken and adds nothing to the button's accessible name.
 *   R2-notice  the comment in `tokens.module.css` does not quote the compose line, so the brief's
 *           "Notice files" command counts the 13 files that really compose the class.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = process.cwd();
const read = (...parts: string[]): string => readFileSync(join(WEB, ...parts), 'utf8');
const layout = read('src', 'app', 'layout.tsx');
const globals = read('src', 'app', 'globals.css');
const tokens = read('src', 'styles', 'tokens.module.css');

describe('R2-9: the font preconnects', () => {
  it('only the gstatic preconnect is a CORS one', () => {
    // One mapped <link> whose crossOrigin is set for the second origin only.
    expect(layout).toMatch(/crossOrigin=\{origin === GOOGLE_FONTS_ORIGINS\[1\] \? '' : undefined\}/);
    expect(layout).not.toMatch(/crossOrigin=""/);
  });

  it('the second origin is the font files host', async () => {
    const { GOOGLE_FONTS_ORIGINS } = await import('@/lib/fonts-href');
    expect(GOOGLE_FONTS_ORIGINS[0]).toBe('https://fonts.googleapis.com');
    expect(GOOGLE_FONTS_ORIGINS[1]).toBe('https://fonts.gstatic.com');
  });

  it('globals.css says above its @import that the build drops it and the layout link loads', () => {
    const at = globals.indexOf("@import url('https://fonts.googleapis.com");
    expect(at).toBeGreaterThan(0);
    const above = globals.slice(0, at);
    const lastComment = above.slice(above.lastIndexOf('/*'));
    expect(lastComment).toMatch(/build drops this @import/);
    expect(lastComment).toMatch(/layout/);
  });
});

describe('R2-tip: the drawn label is not spoken', () => {
  it("the generated content is attr(data-tip) with an empty alternative text: `attr(data-tip) / ''`", () => {
    const rule = /\.tip\[data-tip\]::after\s*\{[^}]*\}/.exec(tokens)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).toContain("content: attr(data-tip) / '';");
    expect(rule).not.toMatch(/content:\s*attr\(data-tip\)\s*;/);
  });
});

describe('R2-notice: the compose line is not quoted in the tokens module', () => {
  it('"composes: errorNotice from" is in no line of tokens.module.css', () => {
    expect(tokens).not.toContain('composes: errorNotice from');
  });

  it('the class itself is still declared', () => {
    expect(tokens).toMatch(/^\.errorNotice\s*\{/m);
    expect(tokens).toMatch(/^\.errorNotice::before\s*\{/m);
  });
});

describe('V-14: no drawn label behind its own open panel', () => {
  const hover = tokens.indexOf(".tip[data-tip]:hover::after");
  const focus = tokens.indexOf(".tip[data-tip]:focus-visible::after");
  const open = tokens.indexOf(".tip[data-tip][aria-expanded='true']::after");

  it('has a rule for a trigger that says it is open, and it shows no label', () => {
    expect(open).toBeGreaterThan(0);
    const rule = /\.tip\[data-tip\]\[aria-expanded='true'\]::after\s*\{([^}]*)\}/.exec(tokens)?.[1] ?? '';
    expect(rule.trim()).toBe('display: none;');
  });

  it('comes after the hover and the focus rules, which weigh the same, so it wins on both', () => {
    expect(hover).toBeGreaterThan(0);
    expect(focus).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(hover);
    expect(open).toBeGreaterThan(focus);
  });
});
