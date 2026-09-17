/**
 * C-8 — finding `wt.exe`, including the Windows detail that cost this a bug:
 * the Store execution alias is invisible to `stat` and therefore to
 * `fs.existsSync`.
 */

import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { fileIsPresent, resolveWtPath, wtCandidates } from '../../src/main/wt';

const LOCAL_APP_DATA = 'C:\\Users\\estac\\AppData\\Local';
const ALIAS = join(LOCAL_APP_DATA, 'Microsoft', 'WindowsApps', 'wt.exe');

describe('wtCandidates', () => {
  it('puts the Store execution alias first, then every PATH entry', () => {
    expect(
      wtCandidates({ LOCALAPPDATA: LOCAL_APP_DATA, PATH: 'C:\\tools;C:\\other' }),
    ).toEqual([ALIAS, 'C:\\tools\\wt.exe', 'C:\\other\\wt.exe']);
  });

  it('copes with neither variable being set', () => {
    expect(wtCandidates({})).toEqual([]);
  });

  it('drops empty PATH segments', () => {
    expect(wtCandidates({ PATH: 'C:\\tools;;' })).toEqual(['C:\\tools\\wt.exe']);
  });
});

describe('resolveWtPath', () => {
  const env = { LOCALAPPDATA: LOCAL_APP_DATA, PATH: 'C:\\tools' };

  it('prefers the alias', () => {
    expect(resolveWtPath(env, () => true)).toBe(ALIAS);
  });

  it('falls back to PATH', () => {
    expect(resolveWtPath(env, (path) => path === 'C:\\tools\\wt.exe')).toBe('C:\\tools\\wt.exe');
  });

  it('is null when Windows Terminal is not installed', () => {
    expect(resolveWtPath(env, () => false)).toBeNull();
  });
});

describe('fileIsPresent', () => {
  it('is true for a file that exists', () => {
    expect(fileIsPresent(join(process.cwd(), 'package.json'))).toBe(true);
  });

  it('is false for one that does not', () => {
    expect(fileIsPresent(join(process.cwd(), 'no-such-file.json'))).toBe(false);
  });

  it.runIf(process.platform === 'win32' && process.env.LOCALAPPDATA !== undefined)(
    'sees the wt.exe execution alias that fs.existsSync cannot',
    () => {
      const alias = join(
        process.env.LOCALAPPDATA ?? '',
        'Microsoft',
        'WindowsApps',
        'wt.exe',
      );
      // Only meaningful on a machine that has Windows Terminal; where it is
      // absent both answers are false and the assertion still holds.
      let readable = true;
      try {
        accessSync(alias, constants.F_OK);
      } catch {
        readable = false;
      }
      expect(fileIsPresent(alias)).toBe(readable);
    },
  );
});
