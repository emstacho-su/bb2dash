/**
 * C-1 — the preload exposes one frozen object and opens no IPC channel.
 *
 * It is checked as source rather than by importing it: a preload runs in a
 * sandboxed renderer context that this test environment does not have, and the
 * property worth protecting is what the file is allowed to contain.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PRELOAD = readFileSync(join(process.cwd(), 'src', 'preload', 'index.ts'), 'utf8');
const PACKAGE = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

describe('the preload', () => {
  it('carries the same version as package.json', () => {
    expect(PRELOAD).toContain(`const VERSION = '${PACKAGE.version}'`);
  });

  it('exposes exactly one frozen object', () => {
    const exposures = [...PRELOAD.matchAll(/exposeInMainWorld\(/g)];
    expect(exposures).toHaveLength(1);
    expect(PRELOAD).toContain("exposeInMainWorld('bb2dashDesktop', Object.freeze(");
  });

  it('opens no IPC channel', () => {
    for (const forbidden of ['ipcRenderer', 'ipcMain', 'invoke(', 'sendSync', 'exposeInIsolatedWorld']) {
      expect(PRELOAD).not.toContain(forbidden);
    }
  });
});
