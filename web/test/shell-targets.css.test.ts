/**
 * Larger click targets in the shell (Phase 22, task 36; D-5, named exception 13).
 *
 * The popout's close button and, at 480 px and under, the brand link reach `--size-target` both
 * ways through an `::after`, so no box moves and neither rule gains a min size or padding.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

const POPOUT = read('src/components/popout/Popout.module.css');
const TOP_NAV = read('src/components/shell/TopNav.module.css');

/** The body of the first `@media (<condition>) { … }`, braces balanced. */
function mediaBlock(source: string, condition: string): string {
  const at = source.indexOf(`@media (${condition})`);
  if (at === -1) return '';
  const open = source.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return source.slice(open + 1, end);
}

/** The declarations of the rule whose whole selector is `selector`, or '' when there is none. */
function rule(source: string, selector: string): string {
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').split(',').some((part) => part.trim() === selector)) return match[2] ?? '';
  }
  return '';
}

const SQUARE = /width\s*:\s*var\(--size-target\)[\s\S]*height\s*:\s*var\(--size-target\)|height\s*:\s*var\(--size-target\)[\s\S]*width\s*:\s*var\(--size-target\)/;
const NO_GROWTH = /min-width|min-height|(^|[;\s])padding/;

describe('the popout’s close button', () => {
  const after = rule(POPOUT, '.close::after');

  it('has an ::after that reaches --size-target both ways', () => {
    expect(after).toMatch(/content\s*:/);
    expect(after).toMatch(/position\s*:\s*absolute/);
    expect(after).toMatch(SQUARE);
  });

  it('gains no min size and no padding of its own for it', () => {
    expect(after).not.toMatch(NO_GROWTH);
    expect(rule(POPOUT, '.close')).not.toMatch(/min-width|min-height/);
  });
});

describe('the brand link at 480 px and under', () => {
  const small = mediaBlock(TOP_NAV, 'max-width: 480px');
  const after = rule(small, '.brand::after');

  it('has an ::after that is --size-target square', () => {
    expect(after).toMatch(/content\s*:/);
    expect(after).toMatch(/position\s*:\s*absolute/);
    expect(after).toMatch(SQUARE);
  });

  it('is positioned, so the ::after is centred on the link, and gains no min size or padding', () => {
    expect(rule(small, '.brand')).toMatch(/position\s*:\s*relative/);
    expect(after).not.toMatch(NO_GROWTH);
    expect(rule(small, '.brand')).not.toMatch(NO_GROWTH);
  });

  it('is not drawn above 480 px', () => {
    const outside = TOP_NAV.replace(small, '');
    expect(rule(outside, '.brand::after')).toBe('');
  });
});
