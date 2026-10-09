/**
 * Smooth sidebar and search (Phase 22, task 30; D-3, named exception 8; defaults 19).
 *
 * Nothing animates `width`. Under 1024 px the courses drawer slides by `transform` and its scrim
 * fades; from 1024 px up the side panel switches with no motion. The search field fades in and moves
 * by `--motion-shift`. jsdom paints nothing, so the rules are read from the stylesheets.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SIDEBAR = read('src/components/shell/CourseSidebar.module.css');
const SEARCH = read('src/components/shell/NavSearch.module.css');
const GLOBALS = read('src/app/globals.css');

/** The body of the first `@media (<condition>) { … }`, braces balanced; '' when there is none. */
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

/** The source with the body of one media block taken out: the rules that apply at every width. */
function outsideMedia(source: string, condition: string): string {
  const block = mediaBlock(source, condition);
  return block === '' ? source : source.replace(block, '');
}

/** The declarations of the rule whose whole selector is `selector`, or '' when there is none. */
function rule(source: string, selector: string): string {
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').split(',').some((part) => part.trim() === selector)) return match[2] ?? '';
  }
  return '';
}

const DRAWER = 'max-width: 1023.98px';

describe('nothing animates width', () => {
  for (const [name, source] of [
    ['CourseSidebar.module.css', SIDEBAR],
    ['NavSearch.module.css', SEARCH],
  ] as const) {
    it(`${name}: no transition or animation value names width, and no @keyframes block does`, () => {
      const animated = [...source.matchAll(/(?:transition|animation)[a-z-]*\s*:[^;]*/g)].map((m) => m[0]);
      expect(animated.filter((value) => /\bwidth\b/.test(value))).toEqual([]);
      const keyframes = [...source.matchAll(/@keyframes\s+[\w-]+\s*\{/g)];
      for (const frame of keyframes) {
        const open = source.indexOf('{', frame.index);
        let depth = 0;
        let end = open;
        for (; end < source.length; end += 1) {
          if (source[end] === '{') depth += 1;
          if (source[end] === '}') {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        expect(source.slice(open, end), frame[0]).not.toMatch(/\bwidth\b/);
      }
    });
  }
});

describe('the courses drawer (under 1024 px)', () => {
  const drawer = mediaBlock(SIDEBAR, DRAWER);

  it('moves its rail by transform over --motion-enter-lg', () => {
    const rail = rule(drawer, '.rail');
    expect(rail).toMatch(/transition\s*:[^;]*transform[^;]*var\(--motion-enter-lg\)/);
  });

  it('fades its scrim with opacity', () => {
    expect(rule(drawer, '.scrim')).toMatch(/transition\s*:[^;]*opacity/);
  });

  it('closes by sliding the rail out by its own width, not by narrowing it', () => {
    const closed = rule(drawer, ":global(html[data-sidebar='closed']) .rail");
    expect(closed).toMatch(/transform\s*:\s*translateX\(/);
    expect(closed).not.toMatch(/(^|[;\s])width\s*:\s*0\b/);
  });

  it('writes the closed offset with the sign of the side --sidebar-side names (default 19)', () => {
    const side = /--sidebar-side\s*:\s*([a-z-]+)\s*;/.exec(GLOBALS)?.[1];
    const closed = rule(drawer, ":global(html[data-sidebar='closed']) .rail");
    const offset = /translateX\(\s*(-?)100%\s*\)/.exec(closed);

    expect(['row', 'row-reverse'], `--sidebar-side in globals.css is ${String(side)}`).toContain(side);
    expect(offset, 'the closed drawer offsets the rail by 100% of its width').not.toBeNull();
    // `row` puts the rail on the left, so it leaves by -100%; `row-reverse` puts it on the right: 100%.
    expect(offset?.[1] === '-' ? 'row' : 'row-reverse', 'move --sidebar-side and this sign together').toBe(side);
  });
});

describe('from 1024 px up the side panel switches with no motion', () => {
  it('has no transition on .rail outside the drawer block', () => {
    const flow = outsideMedia(SIDEBAR, DRAWER).replace(/@media[^{]*\{[\s\S]*?\n\}/g, '');
    expect(rule(flow, '.rail')).not.toMatch(/transition/);
  });
});

describe('the search field', () => {
  it('arrives by opacity and transform, moving by --motion-shift', () => {
    const frames = /@keyframes\s+nav-search-grow\s*\{([\s\S]*?\n)\}/.exec(SEARCH)?.[1] ?? '';

    expect(frames).toMatch(/opacity\s*:/);
    expect(frames).toMatch(/transform\s*:[^;]*var\(--motion-shift\)/);
    expect(rule(SEARCH, '.field')).toMatch(/animation\s*:\s*nav-search-grow\s+var\(--motion-enter\)\s+var\(--ease-out\)/);
  });
});
