/**
 * Phase 22, task 15 (R-46): the planner's week board scrolls inside itself at phone width, and the
 * page does not.
 *
 * Why this is a source test. jsdom lays nothing out, so a width cannot be read from a rendered tree.
 * The measured proof is the walk box's `phone-width.spec.ts` (`route /planner`: the page's
 * `scrollWidth` is at most 390 and the board's `scrollWidth` is above its `clientWidth`). This file
 * pins the stylesheet shape that makes that true, so one careless edit cannot bring the page-wide
 * scroll back:
 *
 *   - `.board` keeps `overflow-x: auto` (`planner-css.test.ts` pins it too) and has no `min-width`
 *     of its own in any block. A `min-width` on the scroller is what made the page wider than the
 *     window: the box itself could not be narrower than 760px.
 *   - The 760px floor sits on the grid's tracks instead. The scroller is then free to be as narrow
 *     as its parent, and the tracks overflow it.
 *   - No vertical scroller anywhere in the stylesheet (`planner-css.test.ts:36-41`).
 *   - `.block`'s `overflow`, `padding` and `line-height` are not touched: planner-rows.ts mirrors
 *     two of them (A3 of the token audit).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLESHEET = 'src/components/planner/PlannerWeek.module.css';
const SOURCE = readFileSync(join(process.cwd(), STYLESHEET), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The widest viewport at which the board's phone-width rules apply, as the stylesheet spells it. */
const PHONE_BREAKPOINT_PX = 900;
/** The floor the board has always had: seven day columns stay readable at this width. */
const BOARD_FLOOR_PX = 760;
/** The grid's own gap between tracks, and its padding on each side (`.board`: gap 1px, padding 1px). */
const BOARD_GAP_PX = 1;
const BOARD_PADDING_PX = 1;
const DAY_COLUMNS = 7;
/** One gutter column plus the day columns. */
const TRACK_COUNT = DAY_COLUMNS + 1;

interface Rule {
  /** The prelude of the enclosing at-rule, or null for a top-level rule. */
  readonly context: string | null;
  readonly selector: string;
  readonly body: string;
}

/** Reads rules out of comment-free CSS, one level of at-rule deep (all this stylesheet uses). */
function readRules(css: string): readonly Rule[] {
  const rules: Rule[] = [];
  const walk = (text: string, context: string | null): void => {
    let cursor = 0;
    while (cursor < text.length) {
      const open = text.indexOf('{', cursor);
      if (open === -1) return;
      const prelude = text.slice(cursor, open).trim();
      let depth = 1;
      let close = open + 1;
      while (close < text.length && depth > 0) {
        if (text[close] === '{') depth += 1;
        if (text[close] === '}') depth -= 1;
        close += 1;
      }
      const inner = text.slice(open + 1, close - 1);
      if (prelude.startsWith('@')) {
        walk(inner, prelude);
      } else {
        rules.push({ context, selector: prelude, body: inner });
      }
      cursor = close;
    }
  };
  walk(css, null);
  return rules;
}

const RULES = readRules(SOURCE);

/** Every rule whose selector list names exactly `selector`, in any block. */
function rulesFor(selector: string): readonly Rule[] {
  return RULES.filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector));
}

function declaration(rule: Rule, property: string): string | null {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(rule.body);
  return match ? match[1].trim() : null;
}

const phoneBlock = (rule: Rule): boolean =>
  rule.context !== null && rule.context.includes(`max-width: ${PHONE_BREAKPOINT_PX}px`);

describe('planner phone width (R-46, task 15) — the board scrolls inside itself', () => {
  it('finds the board in the stylesheet, at the top level and in the phone block', () => {
    const board = rulesFor('.board');
    expect(board.some((rule) => rule.context === null)).toBe(true);
    expect(board.some(phoneBlock)).toBe(true);
  });

  it('keeps overflow-x: auto on the board', () => {
    const topLevel = rulesFor('.board').find((rule) => rule.context === null);
    expect(topLevel && declaration(topLevel, 'overflow-x')).toBe('auto');
  });

  it('gives the board no min-width of its own, in any block', () => {
    const offenders = rulesFor('.board').filter((rule) => declaration(rule, 'min-width') !== null);
    expect(offenders.map((rule) => rule.context ?? 'top level')).toEqual([]);
  });

  it(`puts the ${BOARD_FLOOR_PX}px floor on the day tracks at ${PHONE_BREAKPOINT_PX}px and below`, () => {
    const phone = rulesFor('.board').find(phoneBlock);
    expect(phone).toBeDefined();
    if (!phone) return;

    const columns = declaration(phone, 'grid-template-columns');
    expect(columns).not.toBeNull();
    const dayTracks = /repeat\(\s*7\s*,\s*minmax\(\s*(\d+(?:\.\d+)?)px\s*,\s*1fr\s*\)\s*\)/.exec(columns ?? '');
    expect(dayTracks, 'seven day tracks of minmax(<floor>px, 1fr)').not.toBeNull();

    const gutter = /--planner-gutter\s*:\s*(\d+(?:\.\d+)?)px/.exec(phone.body);
    expect(gutter, 'the phone block sets the gutter').not.toBeNull();

    const trackFloor = Number(dayTracks?.[1]);
    const gutterPx = Number(gutter?.[1]);
    const gaps = (TRACK_COUNT - 1) * BOARD_GAP_PX;
    const padding = 2 * BOARD_PADDING_PX;
    const gridMinimum = gutterPx + DAY_COLUMNS * trackFloor + gaps + padding;

    expect(gridMinimum).toBeGreaterThanOrEqual(BOARD_FLOOR_PX);
    // And not a different board: the floor is the old one, give or take a pixel per track.
    expect(gridMinimum).toBeLessThan(BOARD_FLOOR_PX + DAY_COLUMNS);
  });

  it('keeps the day tracks flexible above the breakpoint (no floor on a wide window)', () => {
    const topLevel = rulesFor('.board').find((rule) => rule.context === null);
    const columns = topLevel ? declaration(topLevel, 'grid-template-columns') : null;
    expect(columns).toMatch(/repeat\(\s*7\s*,\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*\)/);
  });

  it('has no vertical scroller anywhere in the stylesheet', () => {
    expect(SOURCE).not.toMatch(/overflow-y\s*:\s*(auto|scroll)/);
    // A bare `overflow: auto | scroll` scrolls both ways; only `overflow-x` may scroll.
    expect(SOURCE).not.toMatch(/(^|[;\s{])overflow\s*:\s*(auto|scroll)/);
  });

  it('leaves .block clipping, padded and line-height as the planner constants mirror them', () => {
    const block = rulesFor('.block').find((rule) => rule.context === null);
    expect(block).toBeDefined();
    if (!block) return;
    expect(declaration(block, 'overflow')).toBe('hidden');
    expect(declaration(block, 'padding')).toBe('3px 5px');
    expect(declaration(block, 'line-height')).toBe('14px');
  });
});
