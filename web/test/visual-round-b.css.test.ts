/**
 * Phase 22, visual round (V-10 to V-13): four rules of the screens-B cluster that the
 * theme walk's shots showed wrong. jsdom lays nothing out, so each rule is asserted
 * from its stylesheet, the way planner-css.test.ts does it.
 *
 *   V-10  the report-card strip's scroll box clips each tile's 1px ring (the card edge
 *         is a box-shadow since task 16); the box pads the ring back in.
 *   V-11  the Stream's "scroll up for weeks" button takes the app's body face.
 *   V-12  the Stream's tags are pills (`--radius-chip`), as tile D draws a tag.
 *   V-13  the gradebook's Seen stamp keeps the size and the colour `tokens.mono` gave it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');
const read = (file: string): string =>
  readFileSync(join(SRC, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(css: string, selector: string): string {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].split(',').some((part) => part.trim() === selector)) return match[2];
  }
  throw new Error(`no rule for "${selector}"`);
}

const STRIP = read('components/grades/ReportCardStrip.module.css');
const TIMELINE = read('components/course/CourseTimeline.module.css');
const GRADEBOOK = read('components/grades/GradebookTable.module.css');

describe('V-10: the report-card strip keeps each tile its whole edge', () => {
  const body = ruleBody(STRIP, '.cards');

  it('is still a sideways scroll box', () => {
    expect(body).toMatch(/overflow-x\s*:\s*auto\s*;/);
  });

  it('pads the ring back inside the box on the top, left and right, and takes the padding back with a margin', () => {
    expect(body).toMatch(/padding\s*:\s*var\(--size-underline\)\s+var\(--size-underline\)\s+calc\(var\(--space-2\)\s*\+\s*var\(--size-underline\)\)\s*;/);
    expect(body).toMatch(/margin\s*:\s*calc\(var\(--size-underline\)\s*\*\s*-1\)\s*;/);
  });
});

describe('V-11: "scroll up for weeks" takes the body face', () => {
  it('names --font-body on .earlier', () => {
    expect(ruleBody(TIMELINE, '.earlier')).toMatch(/font-family\s*:\s*var\(--font-body\)\s*;/);
  });
});

describe('V-12: the Stream tags are pills', () => {
  it.each(['.tentativeTag', '.attendanceTag'])('%s rounds with --radius-chip', (selector) => {
    const body = ruleBody(TIMELINE, selector);
    expect(body).toMatch(/border-radius\s*:\s*var\(--radius-chip\)\s*;/);
    expect(body).not.toMatch(/--radius-md/);
  });

  it('keeps the dashes that say "tentative"', () => {
    expect(ruleBody(TIMELINE, '.tentativeTag')).toMatch(/border\s*:\s*1px\s+dashed/);
  });
});

describe('V-13: the Seen stamp keeps its size', () => {
  const body = ruleBody(GRADEBOOK, '.seenCell');

  it('sets the small size and the quiet colour tokens.mono gave it, on the cell', () => {
    expect(body).toMatch(/font-size\s*:\s*var\(--text-xs\)\s*;/);
    expect(body).toMatch(/color\s*:\s*var\(--color-neutral-400\)\s*;/);
  });

  it('does not put the code face back (D-2: a date is not code)', () => {
    expect(body).not.toMatch(/font-family/);
  });
});
