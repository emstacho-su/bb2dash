/**
 * The token audit (Phase 22, tasks 1 and 2; P-15, P-16, R-53; brief 103, "Token audit").
 *
 * R-53's definition of done is "no hard-coded colours or sizes outside
 * `globals.css`". Nothing checked that, so this file does. It scans every
 * `.css`, `.ts` and `.tsx` file under `web/src` except `globals.css` and
 * counts, per file, what is not a token:
 *
 *   1. colour literals (`#hex`, `rgb()` and its family, CSS named colours),
 *      and in TypeScript a string literal that is a colour;
 *   2. every `color-mix(`, because a tint is a colour the token set does not name;
 *   3. size literals, `<number>px` and `<number>rem`, in a declaration value;
 *   4. TSX `style=` keys that are not custom properties.
 *
 * A fifth pass counts nothing. It fails when a `var(--name)` is declared
 * nowhere: not in `globals.css`, not in the same module, not as a TSX inline
 * style key.
 *
 * THE RATCHET. Each file's count is written down in
 * `test/token-audit.baseline/<cluster>.json`. A count above its baseline fails:
 * someone added a literal. A count below it fails too, so a sweep lowers the
 * JSON in the commit that removes the literals and the record never goes stale.
 * A file that is not in a JSON has a baseline of 0.
 *
 * THE ALLOWLIST. What counts 0 on purpose is in `token-audit.allowlist.ts`,
 * frozen at task 2 (P-16): the breakpoints (A1), 1px and 2px (A2), the
 * declarations a test pins or a TypeScript constant mirrors (A3), the theme's
 * page backgrounds in `theme-preference.ts` (A4) and two inline style keys
 * (A5). This file checks every entry against the live tree, so an entry that
 * went stale fails here. A literal that is not let through is removed or
 * becomes a token; the allowlist is not edited.
 *
 * NOT IN SCOPE. Imperative style writes (`element.style.height = …`, today
 * only `InboxCard.tsx`, a measured height) are not counted, and comments are
 * never read, in CSS or in TypeScript.
 *
 * It scans source, not a rendered tree, so a screen no test mounts is covered.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as plannerRows from '@/lib/planner-rows';
import {
  CONTAINER_WIDTHS,
  HAIRLINE_SIZES,
  INLINE_STYLE_KEYS,
  MEDIA_WIDTHS,
  PINNED_DECLARATIONS,
  THEME_BACKGROUNDS,
  type PinnedDeclaration,
  type PinnedStyleKey,
  type SourceBacking,
} from './token-audit.allowlist';
import {
  parseCss,
  sameDeclaration,
  scanSource,
  unresolvedReferences,
  widthLengths,
  type Allowance,
  type FileScan,
  type FindingRule,
} from './token-audit.scan';

// `process.cwd()` rather than `import.meta.url`: see `audits.test.ts`.
const WEB = process.cwd();
const SRC = join(WEB, 'src');
const BASELINE_DIR = join(WEB, 'test', 'token-audit.baseline');

/** The token file. It is where literals belong, so its count is never taken. */
const GLOBALS = 'web/src/app/globals.css';

/** What a fixture is let through unless it says otherwise: A2 alone. */
const HAIRLINES: Allowance = { sizes: HAIRLINE_SIZES };

/** The modules a constant-backed A3 entry may name, as imported here. */
const CONSTANT_MODULES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  'web/src/lib/planner-rows.ts': plannerRows,
};

/* ---------------------------------------------------------------------------
 * The cluster map
 * ------------------------------------------------------------------------ */

const CLUSTERS = ['foundation', 'shell', 'screens-a', 'screens-b'] as const;
type Cluster = (typeof CLUSTERS)[number];
type ClusterMap = readonly (readonly [prefix: string, cluster: Cluster])[];

/**
 * Who owns which file, as path prefixes from the repository root (brief 103,
 * "Files"). The longest prefix that matches a path wins, so `ThemeMenu.*` is
 * foundation's although it sits in the shell folder. A prefix that ends in a
 * file name is an exact-file entry: the eight top-level files of `(app)/`
 * belong to two clusters, so the folder itself is no prefix.
 */
const CLUSTER_MAP: ClusterMap = [
  // foundation (W-67): tokens, the root layout, the public pages, lib.
  ['web/src/app/globals.css', 'foundation'],
  ['web/src/app/layout.tsx', 'foundation'],
  ['web/src/app/not-found.tsx', 'foundation'],
  ['web/src/app/NotFound.module.css', 'foundation'],
  ['web/src/app/login/', 'foundation'],
  ['web/src/app/privacy/', 'foundation'],
  ['web/src/app/terms/', 'foundation'],
  ['web/src/styles/tokens.module.css', 'foundation'],
  ['web/src/lib/', 'foundation'],
  ['web/src/proxy.ts', 'foundation'],
  ['web/src/components/shell/ThemeMenu.', 'foundation'],
  // shell (W-68): the top bar, its panels, the popouts.
  ['web/src/components/shell/', 'shell'],
  ['web/src/components/popout/', 'shell'],
  ['web/src/components/shared/QueryState.tsx', 'shell'],
  ['web/src/app/(app)/Shell.module.css', 'shell'],
  ['web/src/app/(app)/layout.tsx', 'shell'],
  // screens-a (W-69): Home, planner, tracker, Inbox, Announcements.
  ['web/src/app/(app)/page.tsx', 'screens-a'],
  ['web/src/app/(app)/Today.tsx', 'screens-a'],
  ['web/src/app/(app)/Today.module.css', 'screens-a'],
  ['web/src/app/(app)/NeedsAttention.tsx', 'screens-a'],
  ['web/src/app/(app)/NeedsAttention.module.css', 'screens-a'],
  ['web/src/app/(app)/CourseGradeFigure.tsx', 'screens-a'],
  ['web/src/app/(app)/planner/', 'screens-a'],
  ['web/src/app/(app)/inbox/', 'screens-a'],
  ['web/src/app/(app)/announcements/', 'screens-a'],
  ['web/src/components/planner/', 'screens-a'],
  ['web/src/components/tracker/', 'screens-a'],
  ['web/src/components/inbox/', 'screens-a'],
  ['web/src/components/announcements/', 'screens-a'],
  // screens-b (W-70): course tabs, the Stream timeline, Grades, Materials, Workspace.
  ['web/src/app/(app)/course/', 'screens-b'],
  ['web/src/app/(app)/grades/', 'screens-b'],
  ['web/src/app/(app)/materials/', 'screens-b'],
  ['web/src/app/(app)/workspace/', 'screens-b'],
  ['web/src/components/course/', 'screens-b'],
  ['web/src/components/grades/', 'screens-b'],
  ['web/src/components/materials/', 'screens-b'],
  ['web/src/components/workspace/', 'screens-b'],
];

/** The path's cluster, or why it has none. */
function clusterOf(path: string, map: ClusterMap = CLUSTER_MAP): Cluster | 'none' | 'ambiguous' {
  const matches = map.filter(([prefix]) => path.startsWith(prefix));
  if (matches.length === 0) return 'none';
  const longest = Math.max(...matches.map(([prefix]) => prefix.length));
  const winners = matches.filter(([prefix]) => prefix.length === longest);
  return winners.length === 1 ? winners[0][1] : 'ambiguous';
}

/* ---------------------------------------------------------------------------
 * The live tree, read once
 * ------------------------------------------------------------------------ */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** A path from the repository root, with forward slashes on every platform. */
function fromRepo(file: string): string {
  return `web/${relative(WEB, file).split(sep).join('/')}`;
}

/** Every `.css`, `.ts` and `.tsx` file under `web/src`, `globals.css` included. */
const SOURCES: ReadonlyMap<string, string> = new Map(
  walk(SRC)
    .filter((file) => /\.(css|tsx?)$/.test(file))
    .map((file) => [fromRepo(file), readFileSync(file, 'utf8')] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1)),
);

/** A file named from the repository root: a source file, or the test that pins one. */
function readRepo(path: string): string {
  return readFileSync(join(WEB, '..', path), 'utf8');
}

/** A selector with its whitespace collapsed and one kind of quote, so both spellings of an attribute compare equal. */
const plainSelector = (selector: string): string => selector.trim().replace(/\s+/g, ' ').replace(/"/g, "'");

/** A4's values: `--color-bg` in each theme block the token file holds today. */
function themeBackgrounds(tokens: string): string[] {
  const blocks = THEME_BACKGROUNDS.blocks.map(plainSelector);
  return parseCss(tokens)
    .declarations.filter(({ at, property }) => at.length === 0 && property === THEME_BACKGROUNDS.token)
    .filter(({ selector }) => blocks.includes(plainSelector(selector)))
    .map(({ value }) => value);
}

/** What the allowlist lets through in `path`. `tokens` is the token file's text, for A4. */
function allowanceFor(path: string, tokens: string = SOURCES.get(THEME_BACKGROUNDS.tokens) ?? ''): Allowance {
  return {
    sizes: HAIRLINE_SIZES,
    declarations: PINNED_DECLARATIONS.filter((entry) => entry.file === path),
    colours: path === THEME_BACKGROUNDS.file ? themeBackgrounds(tokens) : [],
    styleKeys: INLINE_STYLE_KEYS.filter((entry) => entry.file === path).map((entry) => entry.key),
  };
}

/** How many places in its file a source backing's pattern matches. Exactly one is a live pin. */
function placesMatching({ file, pattern }: SourceBacking): number {
  const everywhere = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  return [...readRepo(file).matchAll(everywhere)].length;
}

const SCANS: ReadonlyMap<string, FileScan> = new Map(
  [...SOURCES].map(([path, source]) => [path, scanSource(path, source, allowanceFor(path))] as const),
);

/** The audited files: everything scanned except the token file. */
const AUDITED: readonly string[] = [...SCANS.keys()].filter((path) => path !== GLOBALS);

function readBaseline(cluster: Cluster): Record<string, number> {
  const file = join(BASELINE_DIR, `${cluster}.json`);
  if (!existsSync(file)) throw new Error(`no baseline for "${cluster}": ${file}`);
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>;
}

/* ---------------------------------------------------------------------------
 * The scanner, on fixtures
 * ------------------------------------------------------------------------ */

/** The rules a fixture's findings fall under, in source order. */
function rules(path: string, source: string, allow: Allowance = HAIRLINES): FindingRule[] {
  return scanSource(path, source, allow).findings.map((finding) => finding.rule);
}

const TS_JSDOC = [
  '/**',
  ' * Phase 11 let CSS multiply: `top: calc(var(--slot) * 24px)`.',
  ' */',
  'export const BASE_SLOT = 24;',
].join('\n');

describe('the scanner: what counts', () => {
  it.each<[string, string, string, FindingRule[]]>([
    ['`#fff` counts 1', 'a.module.css', '.a { color: #fff; }', ['colour']],
    ['`rgba(0,0,0,.5)` counts 1', 'a.module.css', '.a { background: rgba(0,0,0,.5); }', ['colour']],
    [
      '`color-mix(in srgb, var(--a) 10%, transparent)` counts 1',
      'a.module.css',
      '.a { background: color-mix(in srgb, var(--a) 10%, transparent); }',
      ['color-mix'],
    ],
    ['`white` counts 1', 'a.module.css', '.a { color: white; }', ['colour']],
    ['`padding: 13px` counts 1', 'a.module.css', '.a { padding: 13px; }', ['size']],
    [
      '`minmax(14rem, 18rem)` counts 2',
      'a.module.css',
      '.a { grid-template-columns: minmax(14rem, 18rem); }',
      ['size', 'size'],
    ],
    ['`style={{ padding: 0 }}` counts 1', 'a.tsx', 'const a = <i style={{ padding: 0 }} />;', ['style-key']],
    [
      '`const s = { padding: 0 }` with `style={s}` counts 1',
      'a.tsx',
      'const s = { padding: 0 };\nconst a = <i style={s} />;',
      ['style-key'],
    ],
    ['`style={pick()}` counts 1', 'a.tsx', 'const a = <i style={pick()} />;', ['style-key']],
  ])('%s', (_label, path, source, expected) => {
    expect(rules(path, source)).toEqual(expected);
  });

  it.each<[string, string, string, FindingRule[]]>([
    ['a custom property declared in a module', 'a.module.css', '.a { --planner-gutter: 62px; }', ['size']],
    ['a literal inside an at-rule block', 'a.module.css', '@media (max-width: 720px) { .a { gap: 4px; } }', ['size']],
    ['a literal in a keyframe', 'a.module.css', '@keyframes k { to { transform: translateY(4px); } }', ['size']],
    ['a literal beside a hairline', 'a.module.css', '.a { padding: 1px 6px; }', ['size']],
    ['12px, which only ends in 2px', 'a.module.css', '.a { width: 12px; }', ['size']],
    ['half a pixel', 'a.module.css', '.a { border-width: 0.5px; }', ['size']],
    ['a hex and the tint around it', 'a.module.css', '.a { color: color-mix(in srgb, #e0736c 16%, transparent); }', ['color-mix', 'colour']],
    ['two named colours in a gradient', 'a.module.css', '.a { background: linear-gradient(red, blue); }', ['colour', 'colour']],
    ['an 8-digit hex and `oklch()`', 'a.module.css', '.a { color: #11223344; fill: oklch(60% 0.1 20); }', ['colour', 'colour']],
    ['the last declaration with no semicolon', 'a.module.css', '.a { color: var(--color-text); gap: 3px }', ['size']],
    ['a colour string in TypeScript', 'layout.tsx', "export const viewport = { themeColor: '#161826' };", ['colour']],
    ['a named colour string in TypeScript', 'a.ts', "export const FILL = 'white';", ['colour']],
    ['a colour function in a template literal', 'a.ts', 'export const tint = (a: number) => `rgba(0, 0, 0, ${a})`;', ['colour']],
    ['a colour in a JSX attribute string', 'a.tsx', 'const a = <path fill="#fff" />;', ['colour']],
    ['a tint in a TypeScript string', 'a.ts', "export const T = 'color-mix(in srgb, var(--color-text) 7%, transparent)';", ['color-mix']],
    ['two plain keys beside a custom property', 'a.tsx', "const a = <i style={{ top: 0, '--x': v, left: 0 }} />;", ['style-key', 'style-key']],
    ['a spread inside the style object', 'a.tsx', 'const a = <i style={{ ...base }} />;', ['style-key']],
    ['a conditional style expression', 'a.tsx', 'const a = <i style={on ? { top: 0 } : undefined} />;', ['style-key']],
    ['a name that is not a const object in the file', 'a.tsx', 'const a = (style: object) => <i style={style} />;', ['style-key']],
    ['a style after an apostrophe in JSX text', 'a.tsx', "const a = <p>Don't <b style={{ top: 0 }}>go</b></p>;", ['style-key']],
    ['a style after a comment inside the tag', 'a.tsx', 'const a = (\n  <i\n    // why: \'quoted\'\n    style={{ top: 0 }}\n  />\n);', ['style-key']],
  ])('%s counts', (_label, path, source, expected) => {
    expect(rules(path, source)).toEqual(expected);
  });
});

describe('the scanner: what counts 0', () => {
  it.each<[string, string, string]>([
    ['`var(--color-text)`', 'a.module.css', '.a { color: var(--color-text); }'],
    ['`transparent`', 'a.module.css', '.a { background: transparent; }'],
    ['`currentColor`', 'a.module.css', '.a { border-color: currentColor; }'],
    ['`/* #fff */`', 'a.module.css', '.a { /* #fff */ color: var(--color-text); }\n/* .b { padding: 13px; } */'],
    ["`style={{ '--x': v }}`", 'a.tsx', "const a = <i style={{ '--x': v }} />;"],
    ["`style={{ ['--x' as string]: v }}`", 'a.tsx', "const a = <i style={{ ['--x' as string]: v }} />;"],
    [
      "`const s = { ['--x' as string]: v }` with `style={s}`",
      'a.tsx',
      "const s = { ['--x' as string]: v };\nconst a = <i style={s} />;",
    ],
    ['a `.ts` JSDoc comment holding `var(--slot) * 24px`', 'planner-rows.ts', TS_JSDOC],
    // Imperative writes are outside the audit's scope (brief 103): the key is not a `style=` key.
    ["`box.style.height = 'auto'`", 'a.tsx', "box.style.height = 'auto';\nbox.style.height = `${box.scrollHeight}px`;"],
    ['`inherit`, `initial`, `unset` and `revert`', 'a.module.css', '.a { color: inherit; fill: initial; stroke: unset; background: revert; }'],
    ['a hairline, signed or not', 'a.module.css', '.a { border: 1px solid var(--color-divider); margin: -1px; outline-offset: 2px; top: -2px; }'],
    ['a property that only looks like a colour', 'a.module.css', '.a { white-space: nowrap; }'],
    ['a class name that is also a colour name', 'a.module.css', ".a { composes: tan from './b.module.css'; }"],
    ['a hex inside a CSS string', 'a.module.css', ".a::before { content: '#fff 13px'; }"],
    ['a token whose name ends in a size', 'a.module.css', '.a { gap: var(--gap-12px); width: var(--white); }'],
    ['a unit that is not px or rem', 'a.module.css', '.a { width: 62dvh; height: 1.5em; flex: 1 0 100%; line-height: 1.25; }'],
    ['a breakpoint, which is not a declaration value', 'a.module.css', '@media (max-width: 720px) { .a { color: var(--color-text); } }'],
    ['a style in a line comment', 'a.tsx', 'const a = <i />; // <i style={{ top: 0 }} />'],
    ['a string that only starts like a hex', 'a.ts', "export const ANCHOR = '#section';\nexport const WORD = 'whitespace';"],
    ['`currentColor` and `none` in JSX attributes', 'a.tsx', 'const a = <path fill="none" stroke="currentColor" />;'],
    ['a `style` that is not a JSX attribute', 'a.tsx', 'const style = { top: 0 };\nexport const props = { style };'],
  ])('%s', (_label, path, source) => {
    expect(rules(path, source)).toEqual([]);
  });

  it('reports the line and the literal, so a failure says where to look', () => {
    const { findings } = scanSource('a.module.css', '.a {\n  color: var(--color-text);\n  padding: 3px 5px;\n}\n', HAIRLINES);
    expect(findings).toEqual([
      { rule: 'size', line: 3, text: '3px' },
      { rule: 'size', line: 3, text: '5px' },
    ]);
  });
});

describe('unresolved references', () => {
  const globals = scanSource(GLOBALS, ':root { --color-text: #e9e9ed; --space-2: 5.6px; }');

  function unresolvedIn(path: string, source: string, others: [string, string][] = []) {
    const scans = new Map<string, FileScan>([[GLOBALS, globals], [path, scanSource(path, source)]]);
    for (const [otherPath, otherSource] of others) scans.set(otherPath, scanSource(otherPath, otherSource));
    return unresolvedReferences(scans, GLOBALS);
  }

  it('a fixture `var(--nope)` is unresolved, once', () => {
    expect(unresolvedIn('web/src/a.module.css', '.a {\n  color: var(--nope);\n}')).toEqual([
      { path: 'web/src/a.module.css', name: '--nope', line: 2 },
    ]);
  });

  it('resolves a name `globals.css` declares', () => {
    expect(unresolvedIn('web/src/a.module.css', '.a { color: var(--color-text); gap: var(--space-2); }')).toEqual([]);
  });

  it('resolves a name the same module declares, and not one another module declares', () => {
    const own = '.a { --own: 1; }\n.b { order: var(--own); }';
    expect(unresolvedIn('web/src/a.module.css', own)).toEqual([]);
    expect(
      unresolvedIn('web/src/b.module.css', '.b { order: var(--own); }', [['web/src/a.module.css', own]]),
    ).toEqual([{ path: 'web/src/b.module.css', name: '--own', line: 1 }]);
  });

  it('resolves a name a TSX inline style key sets, in either spelling and through a const', () => {
    const tsx = [
      "const style = { ['--top-px' as string]: `${top}px` };",
      "const a = <i style={style}><b style={{ '--lane': 1, ['--height-px' as string]: h }} /></i>;",
    ].join('\n');
    const css = '.a { top: var(--top-px); height: var(--height-px); order: var(--lane); }';
    expect(unresolvedIn('web/src/a.module.css', css, [['web/src/A.tsx', tsx]])).toEqual([]);
  });

  it('still asks for a declaration when the reference carries a fallback', () => {
    expect(unresolvedIn('web/src/a.module.css', '.a { order: var(--nope, 2); }')).toHaveLength(1);
  });

  it('reads a reference inside a TypeScript string, and never one inside a comment', () => {
    expect(unresolvedIn('web/src/A.tsx', "const a = <i style={{ color: 'var(--nope)' }} />;")).toEqual([
      { path: 'web/src/A.tsx', name: '--nope', line: 1 },
    ]);
    expect(unresolvedIn('web/src/lib/planner-rows.ts', TS_JSDOC)).toEqual([]);
    expect(unresolvedIn('web/src/a.module.css', '/* var(--nope) */ .a { color: var(--color-text); }')).toEqual([]);
  });

  it('finds none in the live tree', () => {
    const unresolved = unresolvedReferences(SCANS, GLOBALS).map(
      ({ path, name, line }) => `${path}:${line} var(${name})`,
    );
    expect(unresolved).toEqual([]);
  });
});

/* ---------------------------------------------------------------------------
 * The cluster map
 * ------------------------------------------------------------------------ */

describe('the cluster map', () => {
  it('reads the tree it claims to guard', () => {
    expect(SOURCES.size).toBeGreaterThan(200);
    expect(SOURCES.has(GLOBALS)).toBe(true);
    expect(SOURCES.has('web/src/styles/tokens.module.css')).toBe(true);
    expect(AUDITED).not.toContain(GLOBALS);
  });

  it('puts every scanned file in exactly one cluster', () => {
    const lost = [...SOURCES.keys()]
      .map((path) => [path, clusterOf(path)] as const)
      .filter(([, cluster]) => cluster === 'none' || cluster === 'ambiguous')
      .map(([path, cluster]) => `${path}: ${cluster}`);
    expect(lost).toEqual([]);
  });

  it('lets the longest prefix win, so ThemeMenu.* is foundation inside the shell folder', () => {
    expect(clusterOf('web/src/components/shell/ThemeMenu.tsx')).toBe('foundation');
    expect(clusterOf('web/src/components/shell/ThemeMenu.module.css')).toBe('foundation');
    expect(clusterOf('web/src/components/shell/TopNav.tsx')).toBe('shell');
  });

  it('holds the eight top-level files of (app)/ as exact entries, two for shell and six for screens-a', () => {
    const topLevel = [...SOURCES.keys()].filter((path) => /^web\/src\/app\/\(app\)\/[^/]+$/.test(path));
    expect(topLevel).toHaveLength(8);
    expect(topLevel.filter((path) => clusterOf(path) === 'shell')).toEqual([
      'web/src/app/(app)/Shell.module.css',
      'web/src/app/(app)/layout.tsx',
    ]);
    expect(topLevel.filter((path) => clusterOf(path) === 'screens-a')).toHaveLength(6);
    expect(clusterOf('web/src/app/(app)/Unowned.tsx')).toBe('none');
  });

  it('refuses a path under no prefix, and a path under two prefixes of equal length', () => {
    const map: ClusterMap = [
      ['web/src/a/', 'shell'],
      ['web/src/a/', 'screens-a'],
      ['web/src/b/', 'screens-b'],
    ];
    expect(clusterOf('web/src/c/x.ts', map)).toBe('none');
    expect(clusterOf('web/src/a/x.ts', map)).toBe('ambiguous');
    expect(clusterOf('web/src/b/x.ts', map)).toBe('screens-b');
  });
});

/* ---------------------------------------------------------------------------
 * The allowlist, entry by entry (task 2, P-16)
 * ------------------------------------------------------------------------ */

/** Every at-rule of that name in a stylesheet under `web/src`, with its file. */
function atRulesNamed(name: string): { path: string; prelude: string }[] {
  return [...SOURCES]
    .filter(([path]) => path.endsWith('.css'))
    .flatMap(([path, source]) =>
      parseCss(source)
        .atRules.filter((rule) => rule.name === name)
        .map(({ prelude }) => ({ path, prelude })),
    );
}

describe('A1: breakpoints', () => {
  it('reads the widths a condition compares with, and no other length', () => {
    expect(widthLengths('(max-width: 720px)')).toEqual(['720px']);
    expect(widthLengths('screen and (min-width: 481px) and (max-width: 1023.98px)')).toEqual(['481px', '1023.98px']);
    expect(widthLengths('(width <= 45em)')).toEqual(['45em']);
    expect(widthLengths('(600px <= width <= 900px)')).toEqual(['600px', '900px']);
    expect(widthLengths('sidebar (max-inline-size: 600px)')).toEqual(['600px']);
    expect(widthLengths('(prefers-reduced-motion: reduce)')).toEqual([]);
    expect(widthLengths('(max-height: 500px) and (max-device-width: 400px)')).toEqual([]);
  });

  it('gives a width condition that holds a function or a group back whole, so wrapping a value hides nothing', () => {
    expect(widthLengths('(max-width: calc(700px))')).toEqual(['max-width: calc(700px)']);
    expect(widthLengths('(max-width: calc((700px)))')).toEqual(['max-width: calc((700px))']);
    expect(widthLengths('(min-width: calc(100vw - (2 * 10px)))')).toEqual(['min-width: calc(100vw - (2 * 10px))']);
    expect(widthLengths('sidebar (min-width: min(600px, 50%))')).toEqual(['min-width: min(600px, 50%)']);
    expect(widthLengths('(max-width: var(--breakpoint))')).toEqual(['max-width: var(--breakpoint)']);
    expect(widthLengths('(600px <= width <= calc(900px))')).toEqual(['600px <= width <= calc(900px)']);

    // Arithmetic on allowed values is another width: 720px + 720px is 1440px, and it is not let through.
    const wrapped = ['(max-width: calc(720px))', '(max-width: calc(720px + 720px))', '(min-width: max(640px, 720px))'];
    expect(wrapped.flatMap(widthLengths)).toHaveLength(3);
    expect(wrapped.flatMap(widthLengths).filter((width) => MEDIA_WIDTHS.includes(width))).toEqual([]);
  });

  it('reads each width condition of a grouped condition, and not the height beside it', () => {
    expect(widthLengths('((max-height: 500px) or (min-width: 600px))')).toEqual(['600px']);
    expect(widthLengths('((max-height: calc(500px)) or (min-width: 600px))')).toEqual(['600px']);
    expect(widthLengths('(not (max-width: 700px)) and (max-height: calc(400px))')).toEqual(['700px']);
  });

  it('breakpoint set equals {480, 620, 640, 720, 760, 820, 900, 1023.98}', () => {
    expect(MEDIA_WIDTHS).toEqual(['480px', '620px', '640px', '720px', '760px', '820px', '900px', '1023.98px']);

    const queries = atRulesNamed('media').filter(({ prelude }) => widthLengths(prelude).length > 0);
    const strays = queries
      .filter(({ prelude }) => widthLengths(prelude).some((width) => !MEDIA_WIDTHS.includes(width)))
      .map(({ path, prelude }) => `${path}: @media ${prelude}`);
    expect(queries.length).toBeGreaterThan(0);
    expect(strays).toEqual([]);
  });

  it('the one @container entry is 600px in CourseTimeline.module.css', () => {
    expect(CONTAINER_WIDTHS).toEqual([
      { file: 'web/src/components/course/CourseTimeline.module.css', width: '600px' },
    ]);

    const live = atRulesNamed('container').flatMap(({ path, prelude }) =>
      widthLengths(prelude).map((width) => ({ file: path, width })),
    );
    const allowed = ({ file, width }: { file: string; width: string }): boolean =>
      CONTAINER_WIDTHS.some((entry) => entry.file === file && entry.width === width);
    expect(live.length).toBeGreaterThan(0);
    expect(live.filter((found) => !allowed(found)).map(({ file, width }) => `${file}: @container ${width}`)).toEqual([]);
  });
});

describe('A2: hairlines', () => {
  it('lets 1px and 2px through and nothing else', () => {
    expect(HAIRLINE_SIZES).toEqual(['1px', '2px']);
    expect(rules('a.module.css', '.a { inset: 1px -1px 2px -2px; gap: 3px; }', { sizes: HAIRLINE_SIZES })).toEqual(['size']);
  });
});

describe('A3: declarations a test pins or a TypeScript constant mirrors', () => {
  const named = ({ file, selector, property, value }: PinnedDeclaration): string =>
    `${file} ${selector} { ${property}: ${value} }`;

  const block: Allowance = {
    sizes: HAIRLINE_SIZES,
    declarations: [{ selector: '.block', property: 'padding', value: '3px 5px' }],
  };
  const twoSizes: FindingRule[] = ['size', 'size'];

  it('counts a named declaration 0 whole, and the same value under another selector as before', () => {
    expect(rules('a.module.css', '.block {\n  padding:  3px\n    5px;\n}', block)).toEqual([]);
    expect(rules('a.module.css', '.block { padding: 3px 5px; }\n.other { padding: 3px 5px; }', block)).toEqual(twoSizes);
    expect(rules('a.module.css', '.block, .other { padding: 3px 5px; }', block)).toEqual(twoSizes);
  });

  it('counts the declaration again once its value changes, or once it sits inside an at-rule', () => {
    const inMedia = '@media (max-width: 720px) { .block { padding: 3px 5px; } }';
    expect(rules('a.module.css', '.block { padding: 3px 6px; }', block)).toEqual(twoSizes);
    expect(rules('a.module.css', inMedia, block)).toEqual(twoSizes);
  });

  it('holds nine entries, no declaration twice, each with a reason', () => {
    const keys = PINNED_DECLARATIONS.map(({ file, selector, property }) => `${file} ${selector} ${property}`);
    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(keys.length);
    expect(PINNED_DECLARATIONS.filter(({ reason }) => reason.trim().length < 20).map(named)).toEqual([]);
  });

  it('every A3 entry matches a live declaration', () => {
    const stale = PINNED_DECLARATIONS.filter((entry) => {
      const live = parseCss(SOURCES.get(entry.file) ?? '').declarations;
      return live.filter((declaration) => sameDeclaration(declaration, entry)).length !== 1;
    });
    expect(stale.map(named)).toEqual([]);
  });

  it('a constant-backed entry equals its imported constant', () => {
    const mirrored = PINNED_DECLARATIONS.flatMap((entry) =>
      entry.backing.kind === 'constant' ? [{ entry, backing: entry.backing }] : [],
    );
    expect(mirrored).toHaveLength(3);
    for (const { entry, backing } of mirrored) {
      const constant = CONSTANT_MODULES[backing.module]?.[backing.name];
      const pixels = backing.pixels.exec(entry.value);
      expect(typeof constant, `${backing.module} exports ${backing.name}`).toBe('number');
      expect(pixels, `${named(entry)} holds no pixel count`).not.toBeNull();
      expect(Number(pixels?.[1]) * backing.times, `${named(entry)} against ${backing.name}`).toBe(constant);
    }
  });

  it("a source-backed entry's regex matches its named line", () => {
    const sourced = PINNED_DECLARATIONS.flatMap((entry) =>
      entry.backing.kind === 'source' ? [{ entry, backing: entry.backing }] : [],
    );
    expect(sourced).toHaveLength(6);
    const lost = sourced
      .map(({ entry, backing }) => ({ entry, backing, places: placesMatching(backing) }))
      .filter(({ places }) => places !== 1)
      .map(({ entry, backing, places }) => `${named(entry)}: ${backing.file} matches ${backing.pattern} ${places} times`);
    expect(lost).toEqual([]);
  });
});

describe('A4: the theme backgrounds in theme-preference.ts', () => {
  const tokens = [
    ':root {',
    '  --color-bg: #161826;',
    '  --color-surface: #232532;',
    '}',
    ':root[data-theme="light"] { --color-bg: #F6F5FB; }',
  ].join('\n');
  const themeFile = "export const THEME_BG = { dark: '#161826', light: '#f6f5fb' } as const;";
  const elsewhere = 'web/src/lib/other.ts';

  it('is a rule over one file, the token file, the two theme blocks and --color-bg', () => {
    expect(THEME_BACKGROUNDS).toEqual({
      file: 'web/src/lib/theme-preference.ts',
      tokens: 'web/src/app/globals.css',
      blocks: [':root', ":root[data-theme='light']"],
      token: '--color-bg',
    });
    expect(clusterOf(THEME_BACKGROUNDS.file)).toBe('foundation');
  });

  it("reads each block's --color-bg from the token file, and no other block's or token's", () => {
    expect(themeBackgrounds(tokens)).toEqual(['#161826', '#F6F5FB']);
    expect(themeBackgrounds('.card { --color-bg: #000000; }\n@media print { :root { --color-bg: #ffffff; } }')).toEqual([]);
  });

  it('lets a hex equal to either one through in that file, whatever its case', () => {
    expect(rules(THEME_BACKGROUNDS.file, themeFile, allowanceFor(THEME_BACKGROUNDS.file, tokens))).toEqual([]);
  });

  it('still counts any other hex there, and the same hexes in any other file', () => {
    const other = "export const THEME_BG = { dark: '#161826', light: '#ffffff' } as const;";
    expect(rules(THEME_BACKGROUNDS.file, other, allowanceFor(THEME_BACKGROUNDS.file, tokens))).toEqual(['colour']);
    expect(rules(elsewhere, themeFile, allowanceFor(elsewhere, tokens))).toEqual(['colour', 'colour']);
  });

  it('holds on the live tree before the light block and the file exist, with nothing to edit when they arrive', () => {
    const live = themeBackgrounds(SOURCES.get(GLOBALS) ?? '');
    expect(live.length).toBeGreaterThanOrEqual(1);
    expect(live.length).toBeLessThanOrEqual(2);
    expect(live.filter((value) => !/^#[0-9a-f]{6}$/i.test(value))).toEqual([]);
    expect(allowanceFor(THEME_BACKGROUNDS.file).colours).toEqual(live);
    expect(allowanceFor(GLOBALS).colours).toEqual([]);
  });
});

describe('A5: inline style keys a pre-existing test asserts on', () => {
  /**
   * Whether `source` sets the entry's key in exactly one `style=`, read with
   * nothing let through. The entry is the one key its test reads back. The
   * scanner lets the name through anywhere in the file, so this is what stops
   * a second key of that name from counting 0.
   */
  function setsItsKeyOnce({ file, key }: PinnedStyleKey, source: string): boolean {
    const { findings } = scanSource(file, source);
    return findings.filter((finding) => finding.rule === 'style-key' && finding.text === key).length === 1;
  }

  it('A5 holds exactly two keys', () => {
    expect(INLINE_STYLE_KEYS.map(({ file, key }) => `${file}: ${key}`)).toEqual([
      'web/src/components/planner/PlannerWeek.tsx: height',
      'web/src/app/(app)/course/[id]/classwork/CourseClasswork.tsx: marginLeft',
    ]);
  });

  it('an entry names one key: a second key of that name in its file fails it', () => {
    const [height, marginLeft] = INLINE_STYLE_KEYS;
    const reserve = 'const reserve = <div style={{ height: h }} />;';
    const indents = ['a', 'b', 'c'].map((depth) => `<li style={{ marginLeft: ${depth} }} />`).join('');
    expect(setsItsKeyOnce(height, reserve)).toBe(true);
    expect(setsItsKeyOnce(height, `${reserve}\nconst second = <div style={{ height: 13 }} />;`)).toBe(false);
    expect(setsItsKeyOnce(height, 'const reserve = <div style={{ width: w }} />;')).toBe(false);
    expect(setsItsKeyOnce(marginLeft, `const tree = <ul>${indents}</ul>;`)).toBe(false);
  });

  it('each is a key its file sets today, once, read back by exactly one line of its test', () => {
    const dead = INLINE_STYLE_KEYS.filter(
      (entry) => !setsItsKeyOnce(entry, SOURCES.get(entry.file) ?? '') || placesMatching(entry.backing) !== 1,
    );
    expect(dead.map(({ file, key }) => `${file}: ${key}`)).toEqual([]);
  });

  it('counts the key 0 in its own file, and any other key or file as before', () => {
    const [{ file }] = INLINE_STYLE_KEYS;
    const neighbour = 'web/src/components/planner/Other.tsx';
    const source = 'const a = <i style={{ height: h, width: w }} />;';
    expect(rules(file, source, allowanceFor(file))).toEqual(['style-key']);
    expect(rules(neighbour, source, allowanceFor(neighbour))).toEqual(['style-key', 'style-key']);
  });
});

/* ---------------------------------------------------------------------------
 * The ratchet
 * ------------------------------------------------------------------------ */

describe('the ratchet', () => {
  it.each(CLUSTERS)('%s: every file is at its baseline, no higher and no lower', (cluster) => {
    const baseline = readBaseline(cluster);
    const problems: string[] = [];

    for (const path of AUDITED) {
      if (clusterOf(path) !== cluster) continue;
      const { findings } = SCANS.get(path)!;
      const allowed = baseline[path] ?? 0;
      if (findings.length > allowed) {
        const found = findings.map((finding) => `    ${finding.line}: ${finding.text} (${finding.rule})`);
        problems.push(
          [`${path} counts ${findings.length}, above its baseline of ${allowed}. Use a token:`, ...found].join('\n'),
        );
      } else if (findings.length < allowed) {
        problems.push(
          `${path} counts ${findings.length}, below its baseline of ${allowed}. ` +
            `Set it to ${findings.length} in ${cluster}.json in this commit.`,
        );
      }
    }

    for (const [path, allowed] of Object.entries(baseline)) {
      const owner = clusterOf(path);
      if (path === GLOBALS) {
        problems.push(`${path} is the token file and has no baseline.`);
      } else if (owner !== cluster) {
        problems.push(`${path} is listed in ${cluster}.json but belongs to "${owner}".`);
      } else if (!SCANS.has(path) && allowed !== 0) {
        problems.push(`${path} has a baseline of ${allowed} and no longer exists. Remove it from ${cluster}.json.`);
      }
    }

    expect(problems).toEqual([]);
  });
});
