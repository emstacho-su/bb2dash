/**
 * C-8 (amended) — the Sync terminal's argv, and the id check that runs before
 * a single element of it exists.
 */

import { describe, expect, it } from 'vitest';

import {
  InvalidSyncIdError,
  buildSyncCommand,
  isValidSyncId,
  pickWtPath,
  syncInitCommand,
} from '../../src/core/sync-command';

const WT = 'C:\\Users\\estac\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';
const REPO = 'C:\\Users\\estac\\projects\\bb2dash';

describe('the id check', () => {
  it.each(['1', '42', '999999999999'])('accepts %s', (id) => {
    expect(isValidSyncId(id)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['thirteen digits', '1234567890123'],
    ['letters', 'abc'],
    ['mixed', '12a'],
    ['negative', '-1'],
    ['decimal', '1.0'],
    ['leading space', ' 12'],
    ['trailing space', '12 '],
    ['a command separator', '1; Remove-Item C:\\'],
    ['a newline', '1\n2'],
    ['a quote', "1'"],
  ])('rejects %s', (_label, id) => {
    expect(isValidSyncId(id)).toBe(false);
    expect(() => buildSyncCommand({ repoDir: REPO, id, wtPath: WT })).toThrowError(
      InvalidSyncIdError,
    );
  });

  it('carries the offending id on the error', () => {
    try {
      buildSyncCommand({ repoDir: REPO, id: 'nope', wtPath: null });
      throw new Error('expected buildSyncCommand to throw');
    } catch (error) {
      expect((error as InvalidSyncIdError).id).toBe('nope');
    }
  });
});

describe('buildSyncCommand with Windows Terminal', () => {
  it('is exactly the argv the Contract fixes', () => {
    expect(buildSyncCommand({ repoDir: REPO, id: '77', wtPath: WT })).toEqual([
      WT,
      '-d',
      REPO,
      '--title',
      'bb-sync 77',
      'powershell.exe',
      '-NoExit',
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      "claude '/bb-sync 77'",
    ]);
  });

  it('runs the command rather than typing it (Q9)', () => {
    const argv = buildSyncCommand({ repoDir: REPO, id: '5', wtPath: WT });
    expect(argv.at(-1)).toBe("claude '/bb-sync 5'");
    expect(argv.join(' ')).not.toContain('PSConsoleReadLine');
    expect(argv).toContain('-NoExit');
  });

  it('keeps the repo path in its own argv element, unquoted', () => {
    const argv = buildSyncCommand({ repoDir: 'C:\\path with spaces\\repo', id: '1', wtPath: WT });
    expect(argv[2]).toBe('C:\\path with spaces\\repo');
  });

  it('returns a frozen array', () => {
    expect(Object.isFrozen(buildSyncCommand({ repoDir: REPO, id: '1', wtPath: WT }))).toBe(true);
  });
});

describe('buildSyncCommand without Windows Terminal', () => {
  it('falls back to PowerShell alone and sets its own location', () => {
    expect(buildSyncCommand({ repoDir: REPO, id: '9', wtPath: null })).toEqual([
      'powershell.exe',
      '-NoExit',
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Set-Location 'C:\\Users\\estac\\projects\\bb2dash'; claude '/bb-sync 9'`,
    ]);
  });

  it("doubles a single quote in the repo path, PowerShell's own escape", () => {
    const argv = buildSyncCommand({ repoDir: "C:\\Stack's repo", id: '1', wtPath: null });
    expect(argv.at(-1)).toBe(`Set-Location 'C:\\Stack''s repo'; claude '/bb-sync 1'`);
  });
});

describe('the dry run', () => {
  it('prints the command instead of running it, keeping everything else identical', () => {
    const live = buildSyncCommand({ repoDir: REPO, id: '12', wtPath: WT });
    const dry = buildSyncCommand({ repoDir: REPO, id: '12', wtPath: WT, dryRun: true });

    expect(dry.slice(0, -1)).toEqual(live.slice(0, -1));
    expect(dry.at(-1)).toBe(`Write-Output 'DRY RUN: claude "/bb-sync 12" would run here'`);
    expect(dry.at(-1)).not.toMatch(/^claude /);
  });

  it('still refuses a malformed id', () => {
    expect(() => syncInitCommand('oops', true)).toThrowError(InvalidSyncIdError);
  });
});

describe('pickWtPath', () => {
  const LOCAL = 'C:\\local\\wt.exe';
  const ON_PATH = 'C:\\tools\\wt.exe';

  it('prefers the WindowsApps alias', () => {
    expect(pickWtPath([LOCAL, ON_PATH], () => true)).toBe(LOCAL);
  });

  it('falls back to the next candidate on PATH', () => {
    expect(pickWtPath([LOCAL, ON_PATH], (path) => path === ON_PATH)).toBe(ON_PATH);
  });

  it('is null when nothing exists, which selects the PowerShell fallback', () => {
    expect(pickWtPath([LOCAL, ON_PATH], () => false)).toBeNull();
    expect(pickWtPath([], () => true)).toBeNull();
  });
});
