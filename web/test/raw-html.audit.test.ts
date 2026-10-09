/**
 * The raw-HTML guard (Phase 19, task 23; P-94, R-76).
 *
 * Blackboard rich text reaches this app in several columns: announcement
 * bodies, item descriptions (`bb_content.detail->'description'`, captured and
 * deliberately not shown, B-39), titles. None of it is ever rendered as HTML.
 * React escapes text by default, so the only ways to break that are the sinks
 * this file scans `web/src` for.
 *
 * Two uses are allowed, one in each of two files, and each file injects one
 * constant written in this repo: `src/app/(app)/layout.tsx` injects
 * `SIDEBAR_BOOT_SCRIPT`, so the rail paints in its remembered state, and
 * `src/app/layout.tsx`, the root layout, injects `THEME_BOOT_SCRIPT`, so the
 * page paints in its theme (Phase 22, task 9). Anything else fails here, and the
 * fix is to render the value as text, or to sanitise it first and then add the
 * file to the list below under its own DECISIONS row.
 *
 * It scans source, not a rendered tree, so a screen no test mounts is covered.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// `process.cwd()` rather than `import.meta.url`: see `audits.test.ts`.
const WEB = process.cwd();
const SRC = join(WEB, 'src');

/**
 * The files that may set raw HTML, as paths from `web/`, each with the one
 * expression it may inject. Exactly two.
 */
const ALLOWED_INJECTIONS: ReadonlyMap<string, string> = new Map([
  ['src/app/(app)/layout.tsx', 'dangerouslySetInnerHTML={{ __html: SIDEBAR_BOOT_SCRIPT }}'],
  ['src/app/layout.tsx', 'dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }}'],
]);
const ALLOWED_RAW_HTML_FILES: readonly string[] = [...ALLOWED_INJECTIONS.keys()].sort();

/**
 * The JSX attribute, exactly what `grep -rl "dangerouslySetInnerHTML=" web/src`
 * matches. A mention in a comment has no `=` after it and is not a use.
 */
const JSX_RAW_HTML = /dangerouslySetInnerHTML\s*=/;

/** Every other way to hand a string to the HTML parser. None is allowed anywhere. */
const OTHER_SINKS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'dangerouslySetInnerHTML as an object key', pattern: /dangerouslySetInnerHTML\s*:/ },
  { name: 'innerHTML assignment', pattern: /\.innerHTML\s*\+?=(?!=)/ },
  { name: 'outerHTML assignment', pattern: /\.outerHTML\s*\+?=(?!=)/ },
  { name: 'insertAdjacentHTML', pattern: /\.insertAdjacentHTML\s*\(/ },
  { name: 'document.write', pattern: /\bdocument\.write(ln)?\s*\(/ },
  { name: 'createContextualFragment', pattern: /\.createContextualFragment\s*\(/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** A path from `web/`, with forward slashes on every platform. */
function fromWeb(file: string): string {
  return relative(WEB, file).split(sep).join('/');
}

const SOURCES: ReadonlyMap<string, string> = new Map(
  walk(SRC)
    .filter((file) => /\.(tsx?|jsx?|mjs|cjs)$/.test(file))
    .map((file) => [fromWeb(file), readFileSync(file, 'utf8')] as const),
);

/** The files of `sources` whose text matches `pattern`, sorted. */
function filesMatching(sources: ReadonlyMap<string, string>, pattern: RegExp): string[] {
  return [...sources].filter(([, text]) => pattern.test(text)).map(([file]) => file).sort();
}

describe('the scanner itself', () => {
  const fixture = new Map([
    ['src/a.tsx', '<div dangerouslySetInnerHTML={{ __html: post.body }} />'],
    ['src/b.tsx', '// never uses `dangerouslySetInnerHTML`, and says so in a comment'],
    ['src/c.ts', 'node.innerHTML = description;'],
    ['src/d.ts', 'if (node.innerHTML === "") return;'],
    ['src/e.ts', 'createElement("div", { dangerouslySetInnerHTML: { __html: body } })'],
    ['src/f.ts', 'el.insertAdjacentHTML("beforeend", body)'],
  ]);

  it('finds the JSX attribute and not a mention of the word', () => {
    expect(filesMatching(fixture, JSX_RAW_HTML)).toEqual(['src/a.tsx']);
  });

  it('finds each other sink, and does not take a comparison for an assignment', () => {
    const hits = OTHER_SINKS.flatMap(({ pattern }) => filesMatching(fixture, pattern)).sort();
    expect(hits).toEqual(['src/c.ts', 'src/e.ts', 'src/f.ts']);
  });

  it('reads the source tree it claims to guard', () => {
    expect(SOURCES.size).toBeGreaterThan(0);
    expect(SOURCES.has('src/app/(app)/layout.tsx')).toBe(true);
  });
});

describe('Blackboard rich text is never rendered as HTML', () => {
  it('finds `dangerouslySetInnerHTML=` in exactly two files, the app layout and the root layout', () => {
    expect(filesMatching(SOURCES, JSX_RAW_HTML)).toEqual([...ALLOWED_RAW_HTML_FILES]);
  });

  it('each allowed use injects its own boot constant and nothing else', () => {
    for (const [file, injection] of ALLOWED_INJECTIONS) {
      const text = SOURCES.get(file) ?? '';
      const uses = text.match(/dangerouslySetInnerHTML\s*=\s*\{\{[^}]*\}\}/g) ?? [];
      expect(uses, file).toEqual([injection]);
    }
  });

  it('finds no other raw-HTML sink anywhere in web/src', () => {
    const offenders = OTHER_SINKS.flatMap(({ name, pattern }) =>
      filesMatching(SOURCES, pattern).map((file) => `${file}: ${name}`),
    );
    expect(offenders).toEqual([]);
  });
});
