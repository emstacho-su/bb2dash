/**
 * C-8 — finding `wt.exe`, including the Windows detail that cost this a bug:
 * the Store execution alias is invisible to `stat` and therefore to
 * `fs.existsSync`.
 */

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

  it('is false for a directory entry it cannot stat but the caller named exactly', () => {
    // `fileIsPresent` is `access(F_OK)`, deliberately: `%LOCALAPPDATA%\Microsoft\
    // WindowsApps\wt.exe` is a Store execution alias whose `stat` fails, so
    // `existsSync` answers false for a file Windows runs happily. That difference
    // cannot be asserted portably — a machine without Windows Terminal has neither —
    // so what is asserted here is the contract the resolver depends on: a name that
    // is not there is false, and the answer never throws.
    expect(() => fileIsPresent('\\\\?\\GLOBALROOT\\nope\\wt.exe')).not.toThrow();
    expect(fileIsPresent('')).toBe(false);
  });
});

describe('the ordering resolveWtPath depends on', () => {
  // The previous version of this test computed its expectation with the same
  // `accessSync` call it was testing, so it could only ever pass. These drive the
  // injected predicate instead, which is the seam that actually decides the argv.
  const env = { LOCALAPPDATA: LOCAL_APP_DATA, PATH: 'C:\\first;C:\\second' };

  it('takes the first present candidate in order, never a later one', () => {
    const seen: string[] = [];
    const present = new Set([ALIAS, 'C:\\first\\wt.exe', 'C:\\second\\wt.exe']);
    const isPresent = (path: string): boolean => {
      seen.push(path);
      return present.has(path);
    };

    expect(resolveWtPath(env, isPresent)).toBe(ALIAS);
    // It stopped at the first hit rather than probing the whole PATH.
    expect(seen).toEqual([ALIAS]);
  });

  it('walks PATH in order when the Store alias is absent', () => {
    expect(
      resolveWtPath(env, (path) => path === 'C:\\first\\wt.exe' || path === 'C:\\second\\wt.exe'),
    ).toBe('C:\\first\\wt.exe');
    expect(resolveWtPath(env, (path) => path === 'C:\\second\\wt.exe')).toBe('C:\\second\\wt.exe');
  });

  it('falls back to PowerShell — a null, not a throw — when nothing is present', () => {
    expect(resolveWtPath(env, () => false)).toBeNull();
    expect(resolveWtPath({}, () => true)).toBeNull();
  });
});
