/**
 * C-2 puts the config at %APPDATA%/bb2dash/config.json. Electron names the
 * userData folder after package.json's productName, falling back to name,
 * which is bb2dash-desktop: without productName the shipped app looked for its
 * config in %APPDATA%/bb2dash-desktop and refused to start (Stack, 2026-09-17).
 * The e2e suite passes its own --user-data-dir, so only this audit can see it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const EXPECTED_APP_NAME = 'bb2dash';

describe('userData folder name', () => {
  it('package.json productName matches the folder C-2 and the README name', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      productName?: string;
    };
    expect(pkg.productName).toBe(EXPECTED_APP_NAME);
  });

  it('electron-builder uses the same productName', () => {
    const yml = readFileSync(join(process.cwd(), 'electron-builder.yml'), 'utf8');
    expect(yml).toMatch(new RegExp('^productName: ' + EXPECTED_APP_NAME + '\\s*$', 'm'));
  });
});
