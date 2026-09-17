/**
 * C-8 (amended by Q9) — build the argv that opens a terminal and **runs**
 * `claude "/bb-sync <id>"`.
 *
 * Plain Node, no `electron` import and no `child_process` (C-13): this file is
 * the one that a container variant swaps for a `claude -p` argv, which is why
 * it is pure. Everything that touches the operating system — resolving
 * `wt.exe`, spawning, recording under test — lives in `main/sync-terminal.ts`.
 *
 * Never a shell string. The argv array is handed to `spawn` as-is, so nothing
 * in it can be reinterpreted as a command separator.
 */

import type { BuildSyncCommand } from './types';

/** The id comes off a PostgREST row and is checked before any argv exists. */
export const SYNC_ID_PATTERN = /^\d{1,12}$/;

export class InvalidSyncIdError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`sync request id ${JSON.stringify(id)} does not match ${String(SYNC_ID_PATTERN)}`);
    this.name = 'InvalidSyncIdError';
    this.id = id;
  }
}

export function isValidSyncId(id: string): boolean {
  return SYNC_ID_PATTERN.test(id);
}

/** PowerShell's own escape inside a single-quoted string is a doubled quote. */
function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface SyncCommandInput {
  readonly repoDir: string;
  readonly id: string;
  /** Absolute path to `wt.exe`, or `null` to fall back to PowerShell alone. */
  readonly wtPath: string | null;
  /**
   * `BB2DASH_SYNC_DRY_RUN=1`: open the same terminal, in the same directory,
   * with the same title, and print the command instead of running it. It is how
   * the terminal is proved on Stack's machine without starting a real sync.
   */
  readonly dryRun?: boolean;
}

/** What PowerShell is asked to run once the window is open. */
export function syncInitCommand(id: string, dryRun: boolean): string {
  if (!isValidSyncId(id)) throw new InvalidSyncIdError(id);
  return dryRun
    ? `Write-Output 'DRY RUN: claude "/bb-sync ${id}" would run here'`
    : `claude '/bb-sync ${id}'`;
}

const POWERSHELL = 'powershell.exe';
const PS_FLAGS = Object.freeze(['-NoExit', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-Command']);

/**
 * `{ repoDir, id, wtPath }` -> argv. Throws `InvalidSyncIdError` before a single
 * element is built when the id is not `^\d{1,12}$`.
 */
export function buildSyncCommand(input: SyncCommandInput): readonly string[] {
  const { repoDir, id, wtPath } = input;
  if (!isValidSyncId(id)) throw new InvalidSyncIdError(id);

  const dryRun = input.dryRun === true;
  const init = syncInitCommand(id, dryRun);

  if (wtPath === null) {
    // No Windows Terminal: one PowerShell window that sets its own location.
    return Object.freeze([
      POWERSHELL,
      ...PS_FLAGS,
      `Set-Location ${psSingleQuote(repoDir)}; ${init}`,
    ]);
  }

  return Object.freeze([
    wtPath,
    '-d',
    repoDir,
    '--title',
    `bb-sync ${id}`,
    POWERSHELL,
    ...PS_FLAGS,
    init,
  ]);
}

// The PM owns this signature (`core/types.ts`); this fails to compile if the
// builder ever stops satisfying it.
const _conformsToContract: BuildSyncCommand = buildSyncCommand;
void _conformsToContract;

/**
 * First candidate that exists wins; `null` means "PowerShell alone". Pure so
 * the fallback order is testable without a filesystem (C-8).
 */
export function pickWtPath(
  candidates: readonly string[],
  exists: (path: string) => boolean,
): string | null {
  return candidates.find((candidate) => exists(candidate)) ?? null;
}
