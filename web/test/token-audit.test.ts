/**
 * The token audit (Phase 22, task 1; P-15, R-53; brief 103, "Token audit").
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
 * NOT IN SCOPE. Imperative style writes (`element.style.height = …`, today
 * only `InboxCard.tsx`, a measured height) are not counted, and comments are
 * never read, in CSS or in TypeScript.
 *
 * It scans source, not a rendered tree, so a screen no test mounts is covered.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  scanSource,
  unresolvedReferences,
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

/** 1px and 2px are hairlines, outlines and nudges, with or without a minus. */
const HAIRLINES: Allowance = { sizes: ['1px', '2px'] };

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

/** What this file lets through in `path`. */
function allowanceFor(_path: string): Allowance {
  return HAIRLINES;
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
function rules(path: string, source: string): FindingRule[] {
  return scanSource(path, source, HAIRLINES).findings.map((finding) => finding.rule);
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
      if (path === GLOBALS) problems.push(`${path} is the token file and has no baseline.`);
      else if (clusterOf(path) !== cluster) problems.push(`${path} is listed in ${cluster}.json but belongs to "${clusterOf(path)}".`);
      else if (!SCANS.has(path) && allowed !== 0) problems.push(`${path} has a baseline of ${allowed} and no longer exists. Remove it from ${cluster}.json.`);
    }

    expect(problems).toEqual([]);
  });
});
