/**
 * The course timeline's lane layout (R3-4 walk finding, screenshot 24).
 *
 * On the preview the assignments lane read one word per line: each assignment
 * card is a flex row, and the status select inside it took `width: 100%` from
 * StatusSelect.module.css while `flex: none` stopped it shrinking, so the title
 * column was squeezed to its min-content. jsdom lays nothing out, so the rules
 * that prevent it are pinned from the stylesheet; the walk spec measures the
 * rendered cards (24 R3-4 stream timeline IST.352).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/course/CourseTimeline.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** The first rule whose whole selector is `selector` (not one entry of a list). */
function ruleBody(selector: string, source = CSS): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(source);
  if (!match) throw new Error(`no rule for "${selector}"`);
  return match[1];
}

function columns(body: string): string {
  const match = /grid-template-columns\s*:\s*([^;]+);/.exec(body);
  if (!match) throw new Error('no grid-template-columns');
  return match[1].trim();
}

/** Every `minmax(<n>px, 1fr)` track's floor, in px. */
function laneFloors(tracks: string): number[] {
  return [...tracks.matchAll(/minmax\(\s*(\d+)px\s*,\s*1fr\s*\)/g)].map((m) => Number(m[1]));
}

describe('the two lanes share the width', () => {
  it.each(['.weekRow', '.laneHead'])('%s gives both lanes an equal 1fr share with a 240px floor', (selector) => {
    const floors = laneFloors(columns(ruleBody(selector)));
    expect(floors).toHaveLength(2);
    for (const floor of floors) expect(floor).toBeGreaterThanOrEqual(240);
  });

  it('stacks the lanes only when the timeline itself is too narrow for both floors', () => {
    // A container query on the pane, not the viewport: an open sidebar takes
    // 260px, so a viewport breakpoint would let the two floors overflow.
    expect(ruleBody('.content')).toMatch(/container-type\s*:\s*inline-size/);
    const media = /@container\s*\(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/.exec(CSS);
    expect(media).not.toBeNull();
    // 72px label + two 240px floors + two 16px gaps = 584px.
    expect(Number(media![1])).toBeGreaterThanOrEqual(584);
    expect(Number(media![1])).toBeLessThanOrEqual(640);
    const stacked = columns(ruleBody('.weekRow', media![2]));
    expect(laneFloors(stacked)).toHaveLength(0);
    expect(stacked).not.toMatch(/1fr\s+minmax|1fr\)\s+minmax/);
  });
});

describe('an assignment card reads by line, not by word', () => {
  it('is a grid whose title column can take the room: glyph, a 1fr body, a bounded status column', () => {
    const body = ruleBody('.asgRow');
    expect(body).toMatch(/display\s*:\s*grid/);
    expect(columns(body)).toMatch(/^32px\s+minmax\(0,\s*1fr\)\s+minmax\(\s*[\d.]+(px|rem)\s*,\s*[\d.]+(px|rem)\s*\)$/);
  });

  it('keeps the status select inside its own column instead of the whole row', () => {
    const select = ruleBody('.asgStatus');
    expect(select).toMatch(/width\s*:\s*100%/);
    expect(CSS).not.toMatch(/\.asgRow\s*>\s*select\s*\{[^}]*flex\s*:\s*none/);
  });

  it('wraps a long title at word boundaries and never overflows the card', () => {
    const title = ruleBody('.asgTitle');
    expect(title).toMatch(/overflow-wrap\s*:\s*anywhere/);
    expect(title).not.toMatch(/word-break\s*:\s*break-all/);
  });
});
