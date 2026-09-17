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
  const NEEDLES = [`service${'_'}role`, `sb${'_'}secret`];

  it.each(NEEDLES)('finds no "%s"', (needle) => {
    expect(FILES.filter((file) => read(file).includes(needle))).toEqual([]);
  });

  it('only ever reads BB2DASH_* environment variables', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1] ?? '';
        if (!name.startsWith('BB2DASH_') && name !== 'NODE_ENV' && name !== 'LOCALAPPDATA') {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the APIs Phase 12 excluded are absent by inspection', () => {
  it.each([
    ['shell.openPath', /shell\.openPath/],
    ['a will-download handler', /will-download/],
    ['an auto-updater', /autoUpdater|electron-updater/],
    ['nodeIntegration turned on', /nodeIntegration\s*:\s*true/],
    ['@electron/remote', /@electron\/remote|enableRemoteModule/],
    ['a Blackboard crawl', /blackboard\.syr\.edu|bb_crawler/i],
  ])('finds no %s', (_label, pattern) => {
    const offenders = FILES.filter((file) => {
      // This file names each API in order to forbid it.
      if (file.endsWith('audit.test.ts')) return false;
      return pattern.test(read(file));
    });
    expect(offenders).toEqual([]);
  });
});
