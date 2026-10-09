/**
 * R3-1 — the Upcoming strip shows its scrollbar (the "slider").
 *
 * jsdom lays nothing out, so the rule is asserted from the stylesheet, the way
 * planner-css.test.ts does for the planner.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/tracker/UpcomingTracker.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(String.raw`^${escaped}\s*\{([^}]*)\}`, 'm').exec(CSS);
  if (!match) throw new Error(`no rule for "${selector}"`);
  return match[1];
}

describe('Upcoming strip — a visible scrollbar (R3-1)', () => {
  it('does not hide the scrollbar', () => {
    expect(ruleBody('.tracker')).not.toMatch(/scrollbar-width\s*:\s*none/);
    expect(CSS).not.toMatch(/\.tracker::-webkit-scrollbar\s*\{[^}]*display\s*:\s*none/);
  });

  it("leaves its bar to the app's one scrollbar block", () => {
    // `scrollbar-width` and `scrollbar-color` make Chromium draw the standard bar with arrow buttons,
    // which switches off the `::-webkit-scrollbar` rules of `globals.css`. The strip keeps none of its own,
    // so it is drawn like every other box (Phase 22, task 38; H-5, row 34).
    expect(ruleBody('.tracker')).not.toMatch(/scrollbar-(width|color)\s*:/);
    expect(CSS).not.toMatch(/::-webkit-scrollbar/);
  });
});
