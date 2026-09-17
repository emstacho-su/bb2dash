/**
 * C-8 — finding `wt.exe`.
 *
 * Its own file rather than part of `sync-terminal.ts` so the unit suite can
 * drive it without mocking Electron: nothing here imports `electron`, only
 * `node:fs` and `node:path`. (It is not `core/`, because `core/` reaches the
 * filesystem through no path at all.)
 */

import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

import { pickWtPath } from '../core/sync-command';

/**
 * Is this path there?
 *
 * Not `existsSync`: `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` is a Store
 * **execution alias**, a reparse point whose `stat` fails with `EACCES`, so
 * `existsSync` answers `false` for a file Windows runs happily —
 * `wt.exe` would never be found and every sync would fall back to a bare
 * PowerShell window. `access(F_OK)` answers `true`. Checked on Stack's laptop,
 * 2026-09-16.
 */
export function fileIsPresent(path: string): boolean {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** The candidates in the order C-8 fixes: the Store alias, then PATH. */
export function wtCandidates(env: NodeJS.ProcessEnv): readonly string[] {
  const candidates: string[] = [];
  const localAppData = env.LOCALAPPDATA;
  if (localAppData) candidates.push(join(localAppData, 'Microsoft', 'WindowsApps', 'wt.exe'));
  for (const dir of (env.PATH ?? '').split(';')) {
    if (dir.length > 0) candidates.push(join(dir, 'wt.exe'));
  }
  return Object.freeze(candidates);
}

/** The first candidate that is there, or `null` for the PowerShell fallback. */
export function resolveWtPath(
  env: NodeJS.ProcessEnv = process.env,
  isPresent: (path: string) => boolean = fileIsPresent,
): string | null {
  return pickWtPath(wtCandidates(env), isPresent);
}
