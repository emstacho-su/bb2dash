/**
 * The nav search stylesheet (walk 17 shot 28, 2026-09-30).
 *
 * On the preview the expanded icon rendered as a grey block instead of the
 * magnifier: `.iconOpen` composed the local `.icon`, which composed `ic` from
 * TopNav.module.css, and the production CSS Modules build (Turbopack) does not
 * carry a composes chain through a local class into another file — the built
 * `iconOpen` was "iconOpen icon" with no `ic`, so the button fell back to the
 * browser's default button face. jsdom applies no CSS and Vitest's CSS Modules
 * stub drops `composes`, so the rule that prevents it is pinned from the
 * stylesheet.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/shell/NavSearch.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** Every `.name { … }` rule body, keyed by class (first rule wins). */
function rules(source: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of source.matchAll(/^\s*\.([A-Za-z][\w-]*)\s*\{([^}]*)\}/gm)) {
    if (!map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}

describe('NavSearch.module.css — composes', () => {
  it('never composes a local class that itself composes from another file', () => {
    const all = rules(CSS);
    const crossFile = new Set(
      [...all].filter(([, body]) => /composes\s*:[^;]*\bfrom\b/.test(body)).map(([name]) => name),
    );
    const chained = [...all].flatMap(([name, body]) => {
      const local = /composes\s*:\s*([^;]+);/.exec(body);
      if (!local || /\bfrom\b/.test(local[1])) return [];
      return local[1]
        .trim()
        .split(/\s+/)
        .filter((target) => crossFile.has(target))
        .map((target) => `${name} → ${target}`);
    });
    expect(chained).toEqual([]);
  });
});

describe('NavSearch.module.css — the field grows leftward from the icon', () => {
  it('orders the field before the icon inside the pill', () => {
    const field = rules(CSS).get('field') ?? '';
    const order = /(?:^|;|\s)order\s*:\s*(-?\d+)/.exec(field);
    expect(order, '.field needs a negative `order`').not.toBeNull();
    expect(Number(order?.[1])).toBeLessThan(0);
  });
});
