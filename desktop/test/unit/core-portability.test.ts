/**
 * C-13 (R-28): `desktop/src/core/` is plain Node. Nothing under it may import `electron`,
 * because the whole point of the split is that a container later supplies its own adapters.
 *
 * The check is a grep over every file actually on disk, not over a hand-kept list, so a new
 * file under `core/` is covered the moment it is written.
 *
 * This file used to carry a second C-2 credential audit as well. At integration it was
 * folded into the canonical `audit.test.ts`, extra needle and hard-coded-JWT check
 * included: two audits that each name the strings they forbid make each one flag the
 * other's source, and one of them then has to exempt a file, which is the hole.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

const DESKTOP = resolve(__dirname, '..', '..');
const CORE = join(DESKTOP, 'src', 'core');

/** Block and line comments out, so a grep sees code and not prose. Deliberately crude. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function filesUnder(root: string, extension = '.ts'): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      found.push(...(await filesUnder(full, extension)));
    } else if (entry.name.endsWith(extension)) {
      found.push(full);
    }
  }
  return found;
}

describe('C-13 — core/ imports nothing from electron', () => {
  it('finds the core files at all (a passing grep over an empty set proves nothing)', async () => {
    const files = await filesUnder(CORE);
    expect(files.length).toBeGreaterThanOrEqual(6);
    // One file from each worker's half, so a truncated walk cannot pass this.
    const names = files.map((f) => relative(CORE, f).split(sep).join('/'));
    expect(names).toContain('poller/reducer.ts');
    expect(names).toContain('sync-command.ts');
  });

  it.each([
    ["from 'electron'", /from\s+['"]electron(\/[\w-]+)?['"]/],
    ['require("electron")', /require\(\s*['"]electron(\/[\w-]+)?['"]\s*\)/],
    // A side-effect import has no `from`, so the first pattern misses it.
    ["bare import 'electron'", /^\s*import\s+['"]electron(\/[\w-]+)?['"]/m],
    ['import("electron")', /import\(\s*['"]electron(\/[\w-]+)?['"]\s*\)/],
  ])('no file under core/ uses %s', async (_name, pattern) => {
    const offenders: string[] = [];
    for (const file of await filesUnder(CORE)) {
      const text = await readFile(file, 'utf8');
      if (pattern.test(text)) offenders.push(relative(DESKTOP, file));
    }
    expect(offenders).toEqual([]);
  });

  it('no file under core/ reaches for an Electron-only global', async () => {
    // Comments are stripped first: `core/` documents which Electron object supplies each
    // injected value (`app.getPath('userData')`, `powerMonitor`), and naming it in prose is
    // the opposite of a violation.
    const offenders: string[] = [];
    for (const file of await filesUnder(CORE)) {
      const code = stripComments(await readFile(file, 'utf8'));
      if (/\b(app\.getPath|BrowserWindow|powerMonitor|safeStorage|ipcMain|ipcRenderer)\b/.test(code)) {
        offenders.push(relative(DESKTOP, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only watermark.ts touches the filesystem in core/ (C-13)', async () => {
    const offenders: string[] = [];
    for (const file of await filesUnder(CORE)) {
      const text = await readFile(file, 'utf8');
      const name = relative(CORE, file).split(sep).join('/');
      // The one exception C-13 allows: the file-backed `WatermarkStore`, which is
      // the only way anything in core/ is permitted to reach the disk.
      if (name === 'poller/watermark.ts') continue;
      if (
        /from\s+['"](node:)?fs(\/promises)?['"]/.test(text) ||
        /require\(\s*['"](node:)?fs(\/promises)?['"]\s*\)/.test(text)
      ) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });
});
