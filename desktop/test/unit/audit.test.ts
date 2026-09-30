/**
 * Standing audits over the whole of `desktop/src` and `desktop/test`, run as
 * tests so they cannot be forgotten at review time. The shape is copied from
 * `web/test/audits.test.ts`.
 *
 * 1. No service-role credential, ever (C-2). The shell carries the same legacy
 *    anon JWT the browser bundle carries and RLS is the boundary; a
 *    service-role JWT or a secret API key in this tree would hand every row to
 *    anything that read the config or the unpacked build. The two needles are
 *    assembled from fragments below so this file does not match itself.
 * 2. Only `BB2DASH_*` environment variables are read, so a credential cannot
 *    arrive through the environment either.
 * 3. The APIs Phase 12 excluded stay excluded (brief, Definition of done):
 *    no `shell.openPath`, no download interception, no auto-updater, no
 *    `nodeIntegration`, no `@electron/remote`, no crawl.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from `desktop/`, which is where `vitest.config.mts` lives.
const ROOTS = [join(process.cwd(), 'src'), join(process.cwd(), 'test')];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root)).filter((file) => /\.(ts|mts|js|mjs)$/.test(file));

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

describe('no service-role credential anywhere in the desktop package', () => {
  // Assembled from fragments on purpose: written out whole, the needle would
  // match this file and the audit would have to exempt itself. Every file in
  // the package is scanned, this one included.
  const NEEDLES = [`service${'_'}role`, `sb${'_'}secret`, `SUPABASE${'_'}SERVICE`];

  it.each(NEEDLES)('finds no "%s"', (needle) => {
    expect(FILES.filter((file) => read(file).includes(needle))).toEqual([]);
  });

  // A key pasted into a source file would not contain any of the needles above.
  it('finds no hard-coded JWT under src/', () => {
    const SOURCES = FILES.filter((file) => file.startsWith(join(process.cwd(), 'src')));
    const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./;
    expect(SOURCES.filter((file) => JWT.test(read(file)))).toEqual([]);
  });

  it('only ever reads BB2DASH_* environment variables', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1] ?? '';
        // `LOCALAPPDATA` and `PATH` are how `wt.exe` is located (C-8); neither
        // can carry a credential, and nothing else in the environment is read.
        const ALLOWED = ['NODE_ENV', 'LOCALAPPDATA', 'PATH'];
        if (!name.startsWith('BB2DASH_') && !ALLOWED.includes(name)) {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * What Phase 12 excluded, as [label, pattern, a planted string the pattern must catch].
 *
 * The planted string proves each pattern would fire: a pattern that matches nothing
 * (Phase 12's `blackboard.syr.edu` never matched the real host, `blackboard.syracuse.edu`)
 * passes the scan while guarding nothing. P-63 added the host, an embedded `<webview>`,
 * a start-at-login registration and the dropped OneDrive mirror.
 */
const EXCLUDED: ReadonlyArray<readonly [string, RegExp, string]> = [
  ['shell.openPath', /shell\.openPath/, 'shell.openPath(file)'],
  ['a will-download handler', /will-download/, "session.on('will-download', h)"],
  ['an auto-updater', /autoUpdater|electron-updater/, "import 'electron-updater'"],
  ['nodeIntegration turned on', /nodeIntegration\s*:\s*true/, 'nodeIntegration: true'],
  ['@electron/remote', /@electron\/remote|enableRemoteModule/, "require('@electron/remote')"],
  [
    'a Blackboard crawl',
    /blackboard\.syr(acuse)?\.edu|bb_crawler/i,
    "fetch('https://blackboard.syracuse.edu/learn/api/public/v1/courses')",
  ],
  ['an embedded webview', /<webview|webviewTag\s*:\s*true/, 'webPreferences: { webviewTag: true }'],
  ['a start-at-login registration', /setLoginItemSettings/, 'app.setLoginItemSettings({ openAtLogin: true })'],
  ['a OneDrive mirror', /onedrive/i, "join(home, 'OneDrive', 'bb2dash')"],
];

/**
 * Tests that legitimately name the Blackboard host: the navigation policy hands it to the
 * default browser, which is the opposite of crawling it.
 */
const HOST_NAMING_TESTS = ['navigation-policy.test.ts'];

describe('the APIs Phase 12 excluded are absent by inspection', () => {
  it.each(EXCLUDED)('catches a planted %s', (_label, pattern, planted) => {
    expect(pattern.test(planted)).toBe(true);
  });

  it('catches a planted <webview> tag as well as the webPreferences flag', () => {
    expect(EXCLUDED.some(([, pattern]) => pattern.test('<webview src="https://example.com">'))).toBe(true);
  });

  it.each(EXCLUDED.map(([label, pattern]) => [label, pattern] as const))('finds no %s', (label, pattern) => {
    const offenders = FILES.filter((file) => {
      // This file names each API in order to forbid it.
      if (file.endsWith('audit.test.ts')) return false;
      if (label === 'a Blackboard crawl' && HOST_NAMING_TESTS.some((name) => file.endsWith(name))) {
        return false;
      }
      return pattern.test(read(file));
    });
    expect(offenders).toEqual([]);
  });
});
