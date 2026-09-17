/**
 * Standing audits over the planner's stylesheet.
 *
 * jsdom does not lay anything out, so a rule about wrapping, scrolling or
 * stacking cannot be asserted from a rendered tree — it has to be asserted from
 * the source, the way `audits.test.ts` does for the whole of `src/`. Each rule
 * here is one Stack asked for by name, and each would otherwise be one careless
 * edit away from coming back.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/planner/PlannerWeek.module.css'),
  'utf8',
);

/**
 * The body of one rule, by selector, with comments already stripped. The
 * selector has to start its own line, so `.eventTitle` finds the class's own
 * rule and not the `[data-compact] > .eventTitle` override above it.
 */
function ruleBody(selector: string): string {
  const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(source);
  if (!match) throw new Error(`no rule for "${selector}" in PlannerWeek.module.css`);
  return match[1];
}

describe('P-planner-3 — no scroll bars inside the planner', () => {
  it('has no vertical scroller anywhere in the stylesheet', () => {
    const declarations = CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(
      /overflow(-y)?\s*:\s*(auto|scroll)/g,
    );
    expect(declarations).toBeNull();
  });

  it('leaves the class block clipping rather than scrolling its chips', () => {
    expect(ruleBody('.nested')).not.toMatch(/overflow/);
    expect(ruleBody('.block')).toMatch(/overflow:\s*hidden/);
  });

  it('keeps the board scrolling sideways — seven columns on a narrow window', () => {
    expect(ruleBody('.board')).toMatch(/overflow-x:\s*auto/);
  });
});

describe('P-planner-4 — titles, topics and rooms wrap', () => {
  it.each(['.blockTitle', '.blockTopic', '.blockRoom', '.eventTitle'])(
    '%s wraps instead of running off the end of one line',
    (selector) => {
      const body = ruleBody(selector);
      expect(body).toMatch(/white-space:\s*normal/);
      expect(body).toMatch(/overflow-wrap:\s*anywhere/);
      expect(body).toMatch(/-webkit-line-clamp/);
    },
  );

  it('clamps the block title to what the block height pays for', () => {
    expect(ruleBody('.blockTitle')).toMatch(/-webkit-line-clamp:\s*var\(--title-lines/);
    expect(ruleBody('.eventTitle')).toMatch(/-webkit-line-clamp:\s*var\(--title-lines/);
  });
});

describe('P-planner-7 — the band label cannot be clipped by its own band', () => {
  /**
   * The label was rotated to fit "ASSIGNMENTS" into a 62px gutter, which traded
   * one clipping problem for another: rotated, it needs ~86px of *height*, and
   * a band cell is 29px with one chip in it and shorter still on an empty week.
   * Nothing on the grid may depend on the band happening to be tall.
   */
  it('does not rotate the label into the band height', () => {
    const source = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(source).not.toMatch(/writing-mode/);
    expect(source).not.toMatch(/rotate:/);
  });

  it('keeps the word for a screen reader without asking for room on screen', () => {
    const body = ruleBody('.bandToggleLabel');
    expect(body).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(body).toMatch(/width:\s*1px/);
  });
});

describe('P-planner-7 — an absolutely positioned chip child has an anchor', () => {
  /**
   * `.nestedChip > .blockHead` is `display: contents`, so it generates no box:
   * the visually-hidden `.blockCode` inside it resolves against the nearest
   * *positioned* ancestor. With none on the chip that was the class block, two
   * levels up. The chip anchors it itself.
   */
  it('positions the nested chip, because its hidden course code is absolute', () => {
    expect(ruleBody('.nestedChip')).toMatch(/position:\s*relative/);
    expect(ruleBody('.nestedChip .blockCode')).toMatch(/position:\s*absolute/);
  });
});

describe('P-planner-2 — one row height table, read from the component', () => {
  it.each(['.block', '.slot', '.nowLine', '.hourRule'])(
    '%s is positioned in pixels the component resolved, not slots × a constant',
    (selector) => {
      const body = ruleBody(selector);
      expect(body).toMatch(/top:\s*var\(--top-px\)/);
      expect(body).not.toMatch(/var\(--slot\)/);
    },
  );

  it('sizes the grid from the summed table', () => {
    expect(ruleBody('.dayColumn')).toMatch(/height:\s*var\(--planner-grid-height\)/);
    expect(ruleBody('.gutter')).toMatch(/height:\s*var\(--planner-grid-height\)/);
  });

  it('no longer paints the hour lines as an evenly repeating gradient', () => {
    // An even repeat stops meeting the gutter's labels once a row grows.
    expect(ruleBody('.dayColumn')).not.toMatch(/repeating-linear-gradient/);
  });
});
