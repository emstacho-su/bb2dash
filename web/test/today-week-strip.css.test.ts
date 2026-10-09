/**
 * Phase 22, task 35 (D-5, row 33, entry `week-strip-shape`): in a course card's week strip a
 * plain day is a hairline outline and a meeting day is filled, both in one tone, so the difference
 * is a shape and not a tone alone (2.13:1 in dark, which the tile's checker always printed as
 * "would fail").
 *
 * jsdom loads no stylesheet, so the rules are read from the source, as `planner-css.test.ts` does.
 * The label he chose, "Meeting days as outline", reads the other way round; the build follows the
 * entry and the refined tile, and taste call T-10 lets him turn it round.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(join(process.cwd(), 'src/app/(app)/Today.module.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS);
  if (!match) throw new Error(`no rule for "${selector}" in Today.module.css`);
  return match[1];
}

function declaration(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(body);
  return match ? match[1].trim() : null;
}

/** The colour token an inset ring is drawn in: `inset 0 0 0 1px var(--color-x)`. */
function ringToken(shadow: string | null): string | null {
  const match = /^inset 0 0 0 \S+ var\((--[a-z0-9-]+)\)$/.exec(shadow ?? '');
  return match ? match[1] : null;
}

describe('the week strip of a course card (D-5, row 33)', () => {
  it('draws a plain day as a clear fill inside an inset ring', () => {
    const body = ruleBody('.stripBar');
    expect(declaration(body, 'background')).toBe('transparent');
    expect(ringToken(declaration(body, 'box-shadow'))).not.toBeNull();
  });

  it('fills a meeting day with the token the ring names, and draws no ring on it', () => {
    const ring = ringToken(declaration(ruleBody('.stripBar'), 'box-shadow'));
    const meet = ruleBody('.stripBarMeet');
    expect(ring).not.toBeNull();
    expect(declaration(meet, 'background')).toBe(`var(${ring})`);
    expect(declaration(meet, 'box-shadow')).toBe('none');
  });

  it("still declares the bar's width and height (no box moves)", () => {
    const body = ruleBody('.stripBar');
    expect(declaration(body, 'width')).not.toBeNull();
    expect(declaration(body, 'height')).not.toBeNull();
  });
});
