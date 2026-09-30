/**
 * The Windows adapter behind the update feature (2026-09-30): starting the builder task,
 * and where the running build lives. Every OS call is injected, so nothing here touches
 * Task Scheduler or this machine's %LOCALAPPDATA%.
 */

import { describe, expect, it } from 'vitest';

import {
  BUILDER_TASK_NAME,
  EXIT_TASK_ALREADY_RUNNING,
  createStartBuilderTask,
  launchStateDir,
  startUpdateHelper,
  updateHelperArgv,
} from '../../src/main/update-os';
import type { PowerShellRun } from '../../src/main/update-os';
import { runningTreeFromExecPath } from '../../src/core/update/build-paths';

const TREE = '31215cf503f565cd7113d01b14266e4b2ce1000d';

describe('runningTreeFromExecPath', () => {
  it('reads the tree hash out of a logon build path', () => {
    expect(
      runningTreeFromExecPath(
        `C:\\Users\\stack\\AppData\\Local\\bb2dash-launch\\builds\\${TREE}\\win-unpacked\\bb2dash.exe`,
      ),
    ).toBe(TREE);
  });

  it('accepts forward slashes and any case of the folder names', () => {
    expect(
      runningTreeFromExecPath(`c:/users/stack/appdata/local/BB2DASH-LAUNCH/Builds/${TREE}/Win-Unpacked/bb2dash.exe`),
    ).toBe(TREE);
  });

  it('is null for a dev run or a hand-packed build', () => {
    expect(runningTreeFromExecPath('C:\\x\\node_modules\\electron\\dist\\electron.exe')).toBeNull();
    expect(runningTreeFromExecPath('C:\\x\\desktop\\dist\\win-unpacked\\bb2dash.exe')).toBeNull();
  });

  it('is null for a folder name that is not a 40-hex tree hash', () => {
    expect(
      runningTreeFromExecPath('C:\\l\\bb2dash-launch\\builds\\..\\win-unpacked\\bb2dash.exe'),
    ).toBeNull();
    expect(
      runningTreeFromExecPath(`C:\\l\\bb2dash-launch\\builds\\${TREE.toUpperCase()}x\\win-unpacked\\bb2dash.exe`),
    ).toBeNull();
  });
});

describe('launchStateDir', () => {
  it('is bb2dash-launch under LOCALAPPDATA', () => {
    expect(launchStateDir({ LOCALAPPDATA: 'C:\\Users\\s\\AppData\\Local' })).toBe(
      'C:\\Users\\s\\AppData\\Local\\bb2dash-launch',
    );
  });

  it('honours BB2DASH_LAUNCH_DIR, and is null with neither', () => {
    expect(launchStateDir({ BB2DASH_LAUNCH_DIR: 'D:\\launch' })).toBe('D:\\launch');
    expect(launchStateDir({})).toBeNull();
  });
});

describe('createStartBuilderTask', () => {
  function runner(code: number, stderr = ''): { run: PowerShellRun; scripts: string[] } {
    const scripts: string[] = [];
    return {
      scripts,
      run: async (script) => {
        scripts.push(script);
        return { code, stderr };
      },
    };
  }

  it('starts the named task, and checks it is not already running first', async () => {
    const { run, scripts } = runner(0);
    expect(await createStartBuilderTask(run)()).toBe('started');
    expect(BUILDER_TASK_NAME).toBe('Bb2dash-LogonBuild');
    expect(scripts[0]).toContain(`Get-ScheduledTask -TaskName '${BUILDER_TASK_NAME}'`);
    expect(scripts[0]).toContain(`Start-ScheduledTask -TaskName '${BUILDER_TASK_NAME}'`);
    expect(scripts[0]).toMatch(/State -eq 'Running'/);
  });

  it('maps the already-running exit code', async () => {
    expect(await createStartBuilderTask(runner(EXIT_TASK_ALREADY_RUNNING).run)()).toBe('already-running');
  });

  it('rejects with the reason on any other exit code', async () => {
    await expect(
      createStartBuilderTask(runner(1, 'No MSFT_ScheduledTask objects found').run)(),
    ).rejects.toThrow(/MSFT_ScheduledTask/);
  });
});

describe('updateHelperArgv (Update now)', () => {
  const STATE = 'C:\\Users\\s\\AppData\\Local\\bb2dash-launch';

  it('runs the installed update-now.ps1, hidden, with the tree and the state folder', () => {
    const argv = updateHelperArgv({ stateDir: STATE, tree: TREE }, { SystemRoot: 'C:\\Windows' });
    expect(argv).toEqual([
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      `${STATE}\\launch\\update-now.ps1`,
      '-Tree',
      TREE,
      '-StateDir',
      STATE,
    ]);
  });

  it('refuses anything that is not a tree hash', () => {
    expect(() => updateHelperArgv({ stateDir: STATE, tree: '..\\x' }, {})).toThrow(/tree/);
    expect(() => updateHelperArgv({ stateDir: STATE, tree: `${TREE} -Evil` }, {})).toThrow(/tree/);
  });
});

describe('startUpdateHelper', () => {
  it('fails before spawning when the helper script is not installed', async () => {
    const spawned: string[][] = [];
    await expect(
      startUpdateHelper(
        { stateDir: 'C:\\nowhere', tree: TREE },
        { exists: () => false, spawnDetached: async (argv) => void spawned.push([...argv]) },
      ),
    ).rejects.toThrow(/update-now\.ps1/);
    expect(spawned).toEqual([]);
  });

  it('spawns the argv once the script is there', async () => {
    const spawned: string[][] = [];
    await startUpdateHelper(
      { stateDir: 'C:\\s', tree: TREE },
      { exists: () => true, spawnDetached: async (argv) => void spawned.push([...argv]) },
    );
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toContain(TREE);
  });
});
