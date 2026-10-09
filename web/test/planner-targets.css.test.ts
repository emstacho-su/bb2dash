/**
 * Phase 22, task 36 (D-5, row 31, entry `pointer-targets`; default 5 of amendment 3): the planner's
 * done box and event title get larger hit areas from a `::after`, and no box moves.
 *
 * A block is 24px for a half hour. The done box is 12px inside 3px and 5px of padding, and a tick
 * WRITES to the planner, so its larger area may never lie over the title:
 *
 *   - the done box's area is the `::after` of the label that wraps it (`display: contents`, so the
 *     box stays a flex child of the head row). The label is static, so the block, which is
 *     `position: absolute` and clips to its own edge, is the box the area is placed in; the box
 *     itself sits inside `.blockBody`, which clips and would cut an area drawn from the box;
 *   - the area starts at the block's top-left corner and ends at the box's own right edge, which is
 *     the edge on the title's side in a compact block (one row, the title to the right);
 *   - in a compact block it is the block's full height; in a taller block the title is on the row
 *     below, so it stops at the box's own bottom edge and never lies over the title;
 *   - the title's area is the rest of the block: its `::after` fills the block, the title stays
 *     static, and the box sits above it (`z-index`), so the box's centre is the box and the title's
 *     first pixel is the title;
 *   - `.block` keeps its `overflow`, `padding` and `line-height` (A3: `planner-rows.ts` mirrors them).
 *
 * jsdom lays nothing out, so the rules are read from the source. The measured proof is the walk
 * box's `planner targets` case of `theme-walk.spec.ts` (W-67): it presses the title's first pixel
 * and never the done box.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/planner/PlannerWeek.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS);
  if (!match) throw new Error(`no rule for "${selector}" in PlannerWeek.module.css`);
  return match[1];
}

function declaration(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(body);
  return match ? match[1].trim() : null;
}

const AREA = '.eventDoneArea::after';
const COMPACT_AREA = ".eventBlock[data-compact='true'] .eventDoneArea::after";

describe('planner targets (D-5, row 31, default 5)', () => {
  it('wraps the done box in a label that adds no box of its own', () => {
    expect(declaration(ruleBody('.eventDoneArea'), 'display')).toBe('contents');
    expect(declaration(ruleBody('.eventDoneArea'), 'position')).toBeNull();
  });

  it("draws the done box's area from an absolute ::after at the block's top-left corner", () => {
    const body = ruleBody(AREA);
    expect(declaration(body, 'content')).toBe("''");
    expect(declaration(body, 'position')).toBe('absolute');
    expect(declaration(body, 'top')).toBe('0');
    expect(declaration(body, 'left')).toBe('0');
  });

  it("ends the area at the box's own right edge: the block's left padding plus the box", () => {
    expect(declaration(ruleBody(AREA), 'width')).toBe('calc(var(--size-5) + var(--size-12))');
  });

  it("stops a tall block's area at the box's own bottom edge, above the title's row", () => {
    expect(declaration(ruleBody(AREA), 'height')).toBe(
      'calc(var(--size-3) + var(--size-underline) + var(--size-12))',
    );
  });

  it("spans the block's full height in a compact block, where nothing is under the box", () => {
    expect(declaration(ruleBody(COMPACT_AREA), 'height')).toBe('100%');
  });

  it("gives the title the rest of the block: its ::after fills the block", () => {
    const body = ruleBody('.eventTitle::after');
    expect(declaration(body, 'content')).toBe("''");
    expect(declaration(body, 'position')).toBe('absolute');
    expect(declaration(body, 'inset')).toBe('0');
    // The title stays static, so the block (position: absolute) is the box the ::after fills.
    expect(declaration(ruleBody('.eventTitle'), 'position')).toBeNull();
  });

  it("puts the done box and its area above the title's area, so the box's centre is the box", () => {
    expect(declaration(ruleBody('.eventDone'), 'z-index')).toBe('1');
    expect(declaration(ruleBody(AREA), 'z-index')).toBe('1');
  });

  it('keeps the Join link clickable above the title area', () => {
    expect(declaration(ruleBody('.eventLink'), 'position')).toBe('relative');
  });

  it('makes a band chip a box its own area is placed in', () => {
    expect(declaration(ruleBody('.eventChip'), 'position')).toBe('relative');
  });

  it("leaves .block's overflow, padding and line-height alone (A3)", () => {
    const body = ruleBody('.block');
    expect(declaration(body, 'overflow')).toBe('hidden');
    expect(declaration(body, 'padding')).toBe('3px 5px');
    expect(declaration(body, 'line-height')).toBe('14px');
  });
});
