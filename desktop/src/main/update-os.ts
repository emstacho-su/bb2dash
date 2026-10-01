/**
 * The Windows adapter behind updates (2026-09-30). Everything OS-bound the update feature
 * needs lives here, thin, so the decisions stay in `core/update/` (CLAUDE.md: keep
 * OS-bound code behind thin adapters; R-28):
 *
 *  - start the logon builder's scheduled task (`Start-ScheduledTask`),
 *  - resolve which build is running and where the launch state lives,
 *  - read the builder's `state.json` and check a build is on disk,
 *  - spawn the detached *Update now* helper (`launch/update-now.ps1`).
 *
 * Nothing here takes a value from the renderer. The task name and every script are
 * constants; the variable inputs to a spawn are a path this process built itself and a
 * tree hash checked against `^[0-9a-f]{40}$`, each one argv element, never a shell string.
 */

import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { win32 } from 'node:path';

import type { BuilderStartOutcome } from '../core/update/builder-trigger';
import { type BuildCheck, type BuilderTaskStatus, parseBuildCheck } from '../core/update/force-update';
import {
  BUILDS_FOLDER,
  EXE_NAME,
  UNPACKED_FOLDER,
  isTree,
  runningTreeFromExecPath,
} from '../core/update/build-paths';
import { parseLastBuiltSha } from '../core/update/update-check';

export const UPDATE_HELPER_SCRIPT = 'update-now.ps1';
const LAUNCH_SCRIPTS_FOLDER = 'launch';
const STATE_FILE = 'state.json';
const CHECK_FILE = 'last-check.json';

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
  readonly stdout: string;
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
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ code: 0, stderr: String(stderr), stdout: String(stdout) });
          return;
        }
        const code = (error as { code?: unknown }).code;
        if (typeof code === 'number') {
          resolve({ code, stderr: String(stderr), stdout: String(stdout) });
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

/**
 * The builder task's state, last start time (epoch ms, 0 for never) and last exit code, as
 * one `State|LastRunMs|LastTaskResult` line. Fixed text: the task name is a constant.
 * Task Scheduler reports "never ran" as a 1999 date, hence the year check.
 */
const BUILDER_STATUS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  `$task = Get-ScheduledTask -TaskName '${BUILDER_TASK_NAME}'`,
  '$info = $task | Get-ScheduledTaskInfo',
  '$ms = 0',
  'if ($info.LastRunTime -and $info.LastRunTime.Year -ge 2000) { $ms = ([DateTimeOffset] $info.LastRunTime).ToUnixTimeMilliseconds() }',
  "Write-Output ('{0}|{1}|{2}' -f $task.State, $ms, $info.LastTaskResult)",
].join('; ');

const STATUS_LINE = /^([A-Za-z]+)\|(\d+)\|(-?\d+)$/;
const RUNNING_STATES: readonly string[] = ['Running', 'Queued'];

/** One status line (the last non-empty line of the output); throws on anything else. */
export function parseBuilderStatus(stdout: string): BuilderTaskStatus {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const match = STATUS_LINE.exec(lines.at(-1) ?? '');
  if (match === null) throw new Error('unexpected builder status output');
  const [, state = '', lastRunMs = '0', lastResult = '0'] = match;
  const running = RUNNING_STATES.includes(state);
  const lastRunAt = Number(lastRunMs);
  return Object.freeze({
    running,
    lastRunAt: lastRunAt > 0 ? lastRunAt : null,
    lastResult: running ? null : Number(lastResult),
  });
}

/** Read `Bb2dash-LogonBuild`'s status from Task Scheduler. */
export function createReadBuilderStatus(run: PowerShellRun = runPowerShell): () => Promise<BuilderTaskStatus> {
  return async () => {
    const result = await run(BUILDER_STATUS_SCRIPT);
    if (result.code !== 0) {
      throw new Error(
        `Get-ScheduledTaskInfo ${BUILDER_TASK_NAME} exited ${result.code}: ${result.stderr.trim().slice(0, STDERR_LIMIT)}`,
      );
    }
    return parseBuilderStatus(result.stdout);
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

/** The builder's recorded `lastBuiltSha`, or `null` when there is no readable state. */
export function readLastBuiltSha(stateDir: string): string | null {
  const path = win32.join(stateDir, STATE_FILE);
  if (!existsSync(path)) return null;
  return parseLastBuiltSha(readFileSync(path, 'utf8'));
}

/** How long the app's Docker check may take before Docker counts as not running. */
export const DOCKER_CHECK_TIMEOUT_MS = 10_000;
/** Docker Desktop's own CLI, machine-wide install; `docker` on PATH otherwise. */
const DOCKER_DESKTOP_EXE = 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
/** The per-user install, relative to %LOCALAPPDATA% (Stack's laptop has this one, 2026-09-30). */
const DOCKER_DESKTOP_USER_EXE = 'Programs\\DockerDesktop\\resources\\bin\\docker.exe';

/** Where to look for docker.exe, in order; the last resort is `docker` on PATH. */
function dockerCandidates(env: NodeJS.ProcessEnv): string[] {
  const local = env['LOCALAPPDATA'];
  return [DOCKER_DESKTOP_EXE, ...(local ? [`${local}\\${DOCKER_DESKTOP_USER_EXE}`] : [])];
}
/** The same probe the builder's Test-DockerReady uses: a server version means the engine answers. */
const DOCKER_VERSION_ARGS = Object.freeze(['version', '--format', '{{.Server.Version}}']);

export type DockerExec = (
  file: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<{ readonly code: number; readonly stdout: string }>;

/** execFile, argv list, no shell, hidden, bounded; a non-zero exit resolves with its code. */
const execDocker: DockerExec = (file, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { windowsHide: true, timeout: timeoutMs }, (error, stdout) => {
      if (error === null) {
        resolve({ code: 0, stdout: String(stdout) });
        return;
      }
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'number') resolve({ code, stdout: String(stdout) });
      else reject(error);
    });
  });

export interface DockerCheckIo {
  readonly exists: (path: string) => boolean;
  readonly exec: DockerExec;
}

/** Is the Docker engine answering? Never rejects: any failure is "not ready". */
export function createDockerReadyCheck(
  io: DockerCheckIo = { exists: existsSync, exec: execDocker },
  env: NodeJS.ProcessEnv = process.env,
): () => Promise<boolean> {
  return async () => {
    const file = dockerCandidates(env).find((path) => io.exists(path)) ?? 'docker';
    try {
      const result = await io.exec(file, DOCKER_VERSION_ARGS, DOCKER_CHECK_TIMEOUT_MS);
      return result.code === 0 && result.stdout.trim() !== '';
    } catch {
      return false;
    }
  };
}

/**
 * The app's request to the next builder run (`force-request.json`): a shorter Docker wait,
 * since the app has just checked Docker itself. Start-ScheduledTask cannot pass arguments,
 * so it travels as a file the builder consumes (`Get-DockerWaitSeconds`).
 */
export const FORCE_REQUEST_FILE = 'force-request.json';

export function forceRequestJson(dockerWaitSeconds: number, now: Date): string {
  const requestedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return JSON.stringify({ requestedAt, dockerWaitSeconds });
}

/** Write `force-request.json` atomically (temp file, then rename). */
export function writeForceRequest(stateDir: string, dockerWaitSeconds: number, now: Date = new Date()): void {
  const path = win32.join(stateDir, FORCE_REQUEST_FILE);
  const temp = `${path}.tmp`;
  writeFileSync(temp, forceRequestJson(dockerWaitSeconds, now), 'utf8');
  renameSync(temp, path);
}

/** The builder's `last-check.json`, or `null` when there is none or it is malformed. */
export function readLastCheck(stateDir: string): BuildCheck | null {
  const path = win32.join(stateDir, CHECK_FILE);
  if (!existsSync(path)) return null;
  return parseBuildCheck(readFileSync(path, 'utf8'));
}

/** Whether `builds/<tree>/win-unpacked/bb2dash.exe` exists. */
export function buildOnDisk(stateDir: string, tree: string): boolean {
  if (!isTree(tree)) return false;
  return existsSync(win32.join(stateDir, BUILDS_FOLDER, tree, UNPACKED_FOLDER, EXE_NAME));
}

export interface UpdateHelperTarget {
  readonly stateDir: string;
  readonly tree: string;
}

function helperScriptPath(stateDir: string): string {
  return win32.join(stateDir, LAUNCH_SCRIPTS_FOLDER, UPDATE_HELPER_SCRIPT);
}

/** The helper's argv: the installed `update-now.ps1`, hidden, with a validated tree. */
export function updateHelperArgv(target: UpdateHelperTarget, env: NodeJS.ProcessEnv = process.env): readonly string[] {
  if (!isTree(target.tree)) throw new Error('refusing to update to something that is not a tree hash');
  return Object.freeze([
    powershellPath(env),
    '-NoProfile',
    '-NonInteractive',
    '-WindowStyle',
    'Hidden',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    helperScriptPath(target.stateDir),
    '-Tree',
    target.tree,
    '-StateDir',
    target.stateDir,
  ]);
}

/**
 * Start one process that outlives this app: detached, no console, unreferenced. Resolves
 * once it is running, rejects when it could not start (the `error`/`spawn` race, as in
 * `sync-terminal.ts`).
 */
export function spawnDetached(argv: readonly string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const [command, ...args] = argv;
    if (command === undefined) {
      reject(new Error('empty argv'));
      return;
    }
    let child;
    try {
      child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true, ...(cwd === undefined ? {} : { cwd }) });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export interface UpdateHelperIo {
  readonly exists: (path: string) => boolean;
  readonly spawnDetached: (argv: readonly string[], cwd?: string) => Promise<void>;
}

/** Update now: spawn `update-now.ps1`, which waits for this app to exit and swaps builds. */
export async function startUpdateHelper(
  target: UpdateHelperTarget,
  io: UpdateHelperIo = { exists: existsSync, spawnDetached },
): Promise<void> {
  const argv = updateHelperArgv(target);
  const script = helperScriptPath(target.stateDir);
  if (!io.exists(script)) {
    throw new Error(`${script} is not installed; re-run register-logon-task.ps1 or wait for the next build`);
  }
  // Never inherit this app's working folder: the task starts the app in `current`, and a
  // junction that is some process's cwd cannot be removed and repointed.
  await io.spawnDetached(argv, target.stateDir);
}
