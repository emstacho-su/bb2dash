/**
 * The Windows adapter behind updates (2026-09-30). Everything OS-bound the update feature
 * needs lives here, thin, so the decisions stay in `core/update/` (CLAUDE.md: keep
 * OS-bound code behind thin adapters; R-28):
 *
 *  - start the logon builder's scheduled task (`Start-ScheduledTask`),
 *  - resolve which build is running and where the launch state lives.
 *
 * Nothing here takes a value from the renderer. The task name and every script are
 * constants; the only variable input to a spawn is a path this process built itself.
 */

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { win32 } from 'node:path';

import type { BuilderStartOutcome } from '../core/update/builder-trigger';
import { runningTreeFromExecPath } from '../core/update/build-paths';

export const BUILDER_TASK_NAME = 'Bb2dash-LogonBuild';
export const APP_TASK_NAME = 'Bb2dash-App';
export const LAUNCH_STATE_FOLDER = 'bb2dash-launch';
/** The exit code the task-start script uses for "the builder is already running". */
export const EXIT_TASK_ALREADY_RUNNING = 3;
const POWERSHELL_TIMEOUT_MS = 30_000;
const STDERR_LIMIT = 300;

/**
 * Checked before started: Task Scheduler's own `MultipleInstances IgnoreNew` would drop a
 * second start anyway, but this way the log says which one happened.
 */
const START_BUILDER_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  `$task = Get-ScheduledTask -TaskName '${BUILDER_TASK_NAME}'`,
  `if ($task.State -eq 'Running') { exit ${EXIT_TASK_ALREADY_RUNNING} }`,
  `Start-ScheduledTask -TaskName '${BUILDER_TASK_NAME}'`,
  'exit 0',
].join('; ');

export interface PowerShellResult {
  readonly code: number;
  readonly stderr: string;
}
export type PowerShellRun = (script: string) => Promise<PowerShellResult>;

export function powershellPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env['SystemRoot'] ?? 'C:\\Windows';
  return win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/** Run one fixed script in Windows PowerShell 5.1, hidden, and report its exit code. */
export const runPowerShell: PowerShellRun = (script) =>
  new Promise((resolve, reject) => {
    execFile(
      powershellPath(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: POWERSHELL_TIMEOUT_MS },
      (error, _stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stderr: String(stderr) });
          return;
        }
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'number') {
          resolve({ code, stderr: String(stderr) });
          return;
        }
        // Not an exit code: powershell.exe itself could not start, or the timeout fired.
        reject(error);
      },
    );
  });

/** `Start-ScheduledTask Bb2dash-LogonBuild`, unless it is already running. */
export function createStartBuilderTask(run: PowerShellRun = runPowerShell): () => Promise<BuilderStartOutcome> {
  return async () => {
    const result = await run(START_BUILDER_SCRIPT);
    if (result.code === 0) return 'started';
    if (result.code === EXIT_TASK_ALREADY_RUNNING) return 'already-running';
    throw new Error(
      `Start-ScheduledTask ${BUILDER_TASK_NAME} exited ${result.code}: ${result.stderr.trim().slice(0, STDERR_LIMIT)}`,
    );
  };
}

/** `%LOCALAPPDATA%\bb2dash-launch`, or `BB2DASH_LAUNCH_DIR` when set; `null` with neither. */
export function launchStateDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const override = env['BB2DASH_LAUNCH_DIR'];
  if (override !== undefined && override !== '') return override;
  const local = env['LOCALAPPDATA'];
  if (local === undefined || local === '') return null;
  return win32.join(local, LAUNCH_STATE_FOLDER);
}

/**
 * The tree hash of the running build, from the executable's resolved path (the app is
 * started through the `current` junction). `null` for a dev run or a hand-packed build.
 */
export function readRunningTree(execPath: string = process.execPath): string | null {
  try {
    return runningTreeFromExecPath(realpathSync.native(execPath));
  } catch {
    return null;
  }
}
