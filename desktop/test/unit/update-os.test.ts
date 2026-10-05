/**
 * The Windows adapter behind the update feature (2026-09-30): starting the builder task,
 * where the running build lives, and starting the Update now helper. Every OS call is
 * injected, so nothing here touches Task Scheduler or this machine's %LOCALAPPDATA%. Two
 * small exceptions run for real: `runHidden` against `node` itself and `readSwapMarker`
 * against a temp folder.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BUILDER_TASK_NAME,
  DOCKER_CHECK_TIMEOUT_MS,
  EXIT_TASK_ALREADY_RUNNING,
  FORCE_REQUEST_FILE,
  HELPER_HANDOFF_TIMEOUT_MS,
  HELPER_START_TIMEOUT_MS,
  MARKER_POLL_MS,
  createDockerReadyCheck,
  createReadBuilderStatus,
  forceRequestJson,
  createStartBuilderTask,
  parseBuilderStatus,
  launchStateDir,
  readSwapMarker,
  runHidden,
  startUpdateHelper,
  updateHelperArgv,
} from '../../src/main/update-os';
import type { DockerExec, HelperRun, PowerShellRun, UpdateHelperIo } from '../../src/main/update-os';
import { runningTreeFromExecPath } from '../../src/core/update/build-paths';
import type { SwapMarkerSnapshot } from '../../src/core/update/swap-marker';

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
        return { code, stderr, stdout: '' };
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

  it('runs the installed update-now.ps1, hidden, with the tree, the state folder and -Detach', () => {
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
      '-Detach',
    ]);
  });

  it('refuses anything that is not a tree hash', () => {
    expect(() => updateHelperArgv({ stateDir: STATE, tree: '..\\x' }, {})).toThrow(/tree/);
    expect(() => updateHelperArgv({ stateDir: STATE, tree: `${TREE} -Evil` }, {})).toThrow(/tree/);
  });
});

describe('startUpdateHelper (stage 1 hands off, then the helper’s marker; W-71)', () => {
  const STATE_DIR = 'C:\\s';
  const MARKER_PATH = `${STATE_DIR}\\swap-pending`;
  const OTHER = 'a'.repeat(40);
  const FRESH: SwapMarkerSnapshot = Object.freeze({ text: TREE, modifiedMs: 2_000 });

  interface HarnessOptions {
    readonly installed?: boolean;
    /** The marker as it was before stage 1 ran. */
    readonly before?: SwapMarkerSnapshot | null;
    /** What each read after stage 1 returns, in order; the last one repeats. */
    readonly after?: ReadonlyArray<SwapMarkerSnapshot | null>;
    readonly run?: HelperRun;
  }

  /** Fake OS: a clock that only `sleep` moves, a scripted marker, a recorded stage-1 run. */
  function harness(options: HarnessOptions = {}) {
    const after = options.after ?? [FRESH];
    let clock = 0;
    let ran = false;
    let readsAfterRun = 0;
    const runs: Array<{ argv: readonly string[]; cwd: string; timeoutMs: number }> = [];
    const markerPaths: string[] = [];
    const io: UpdateHelperIo = {
      exists: () => options.installed ?? true,
      readMarker: (path) => {
        markerPaths.push(path);
        if (!ran) return options.before ?? null;
        const next = after[Math.min(readsAfterRun, after.length - 1)] ?? null;
        readsAfterRun += 1;
        return next;
      },
      run: async (argv, cwd, timeoutMs) => {
        runs.push({ argv: [...argv], cwd, timeoutMs });
        ran = true;
        return (options.run ?? (async () => 0))(argv, cwd, timeoutMs);
      },
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
    };
    return { io, runs, markerPaths, elapsed: () => clock, readsAfterRun: () => readsAfterRun };
  }

  const start = (io: UpdateHelperIo) => startUpdateHelper({ stateDir: STATE_DIR, tree: TREE }, io);

  it('fails before running anything when the helper script is not installed', async () => {
    const h = harness({ installed: false });
    await expect(start(h.io)).rejects.toThrow(/update-now\.ps1/);
    expect(h.runs).toEqual([]);
  });

  it('runs stage 1 with -Detach in the state folder, bounded, and resolves once the marker names the tree', async () => {
    const h = harness({ after: [null, null, FRESH] });
    await expect(start(h.io)).resolves.toBeUndefined();
    expect(h.runs).toHaveLength(1);
    expect(h.runs[0]?.argv).toEqual(updateHelperArgv({ stateDir: STATE_DIR, tree: TREE }));
    expect(h.runs[0]?.argv.at(-1)).toBe('-Detach');
    expect(h.runs[0]?.cwd).toBe(STATE_DIR);
    expect(h.runs[0]?.timeoutMs).toBe(HELPER_HANDOFF_TIMEOUT_MS);
    expect(h.elapsed()).toBe(2 * MARKER_POLL_MS);
    expect(new Set(h.markerPaths)).toEqual(new Set([MARKER_PATH]));
  });

  it('rejects when stage 1 exits non-zero, without waiting for a marker', async () => {
    const h = harness({ run: async () => 6 });
    await expect(start(h.io)).rejects.toThrow(/-Detach exited 6/);
    expect(h.readsAfterRun()).toBe(0);
  });

  it('rejects when stage 1 ends without an exit code', async () => {
    const h = harness({ run: async () => null });
    await expect(start(h.io)).rejects.toThrow(/without an exit code/);
  });

  it('rejects when stage 1 cannot be spawned or does not exit in time', async () => {
    const spawnError = harness({ run: async () => Promise.reject(new Error('spawn powershell.exe ENOENT')) });
    await expect(start(spawnError.io)).rejects.toThrow(/ENOENT/);
    const timedOut = harness({ run: async () => Promise.reject(new Error('did not exit within 30000 ms')) });
    await expect(start(timedOut.io)).rejects.toThrow(/30000 ms/);
  });

  it('rejects when the marker never appears before the bound', async () => {
    const h = harness({ after: [null] });
    await expect(start(h.io)).rejects.toThrow(/did not start within/);
    expect(h.elapsed()).toBeGreaterThanOrEqual(HELPER_START_TIMEOUT_MS);
    expect(h.elapsed()).toBeLessThan(HELPER_START_TIMEOUT_MS + MARKER_POLL_MS);
  });

  it('rejects at once when a new marker names another build', async () => {
    const h = harness({ after: [{ text: OTHER, modifiedMs: 2_000 }] });
    await expect(start(h.io)).rejects.toThrow(new RegExp(`names build ${OTHER}`));
    expect(h.elapsed()).toBe(0);
  });

  it('does not take a marker left over from before the press for the helper', async () => {
    const stale: SwapMarkerSnapshot = { text: TREE, modifiedMs: 1_000 };
    const never = harness({ before: stale, after: [stale] });
    await expect(start(never.io)).rejects.toThrow(/did not start within/);
    const rewritten = harness({ before: stale, after: [stale, stale, FRESH] });
    await expect(start(rewritten.io)).resolves.toBeUndefined();
  });

  it('rejects when the marker cannot be read', async () => {
    const h = harness();
    const io: UpdateHelperIo = {
      ...h.io,
      readMarker: () => {
        throw new Error('EACCES: permission denied');
      },
    };
    await expect(start(io)).rejects.toThrow(/EACCES/);
  });
});

describe('runHidden (the real stage-1 runner)', () => {
  const node = process.execPath;

  it('resolves the exit code of a process it waited for', async () => {
    expect(await runHidden([node, '-e', 'process.exit(0)'], tmpdir(), 10_000)).toBe(0);
    expect(await runHidden([node, '-e', 'process.exit(3)'], tmpdir(), 10_000)).toBe(3);
  });

  it('stops a process that runs past the bound and rejects', async () => {
    await expect(runHidden([node, '-e', 'setTimeout(() => {}, 20000)'], tmpdir(), 300)).rejects.toThrow(
      /did not exit within 300 ms/,
    );
  });

  it('rejects when the program cannot be started', async () => {
    await expect(runHidden([join(tmpdir(), 'no-such-program-w71.exe')], tmpdir(), 10_000)).rejects.toThrow(/ENOENT/);
    await expect(runHidden([], tmpdir(), 10_000)).rejects.toThrow(/empty argv/);
  });
});

describe('readSwapMarker', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('is null when there is no marker, and the text and write time when there is one', () => {
    dir = mkdtempSync(join(tmpdir(), 'bb2dash-swap-marker-'));
    const path = join(dir, 'swap-pending');
    expect(readSwapMarker(path)).toBeNull();
    writeFileSync(path, TREE, 'utf8');
    const seen = readSwapMarker(path);
    expect(seen?.text).toBe(TREE);
    expect(seen?.modifiedMs).toBeGreaterThan(0);
  });

  it('throws on anything but a missing file', () => {
    dir = mkdtempSync(join(tmpdir(), 'bb2dash-swap-marker-'));
    // A folder where the file should be: reading it fails with EISDIR, not ENOENT.
    expect(() => readSwapMarker(dir as string)).toThrow();
  });
});

describe('parseBuilderStatus / createReadBuilderStatus', () => {
  it('reads state|lastRunMs|lastResult', () => {
    expect(parseBuilderStatus('Running|1790000000000|267009\r\n')).toEqual({
      running: true,
      lastRunAt: 1_790_000_000_000,
      lastResult: null,
    });
    expect(parseBuilderStatus('Ready|1790000000000|0')).toEqual({
      running: false,
      lastRunAt: 1_790_000_000_000,
      lastResult: 0,
    });
    expect(parseBuilderStatus('Queued|0|0').running).toBe(true);
    expect(parseBuilderStatus('Ready|0|3')).toEqual({ running: false, lastRunAt: null, lastResult: 3 });
  });

  it('takes the last line, so a warning printed first does not matter', () => {
    expect(parseBuilderStatus('WARNING: x\nReady|5|0').lastResult).toBe(0);
  });

  it('throws on anything else', () => {
    for (const bad of ['', 'Ready', 'Ready|x|0', 'Ready|1|0|extra', '; rm|1|0']) {
      expect(() => parseBuilderStatus(bad)).toThrow(/builder status/);
    }
  });

  it('asks Task Scheduler about the named task only', async () => {
    const scripts: string[] = [];
    const read = createReadBuilderStatus(async (script) => {
      scripts.push(script);
      return { code: 0, stderr: '', stdout: 'Ready|1790000000000|0' };
    });
    expect(await read()).toEqual({ running: false, lastRunAt: 1_790_000_000_000, lastResult: 0 });
    expect(scripts[0]).toContain(`Get-ScheduledTask -TaskName '${BUILDER_TASK_NAME}'`);
    expect(scripts[0]).toContain('Get-ScheduledTaskInfo');
  });

  it('rejects when the query fails', async () => {
    const read = createReadBuilderStatus(async () => ({ code: 1, stderr: 'no task', stdout: '' }));
    await expect(read()).rejects.toThrow(/no task/);
  });
});

describe('Docker readiness and the short-wait request (PM round 3)', () => {
  it('runs docker version with an argv list and a short timeout; ready on exit 0 with a server version', async () => {
    const seen: Array<{ file: string; args: readonly string[]; timeoutMs: number }> = [];
    const ready = createDockerReadyCheck({
      exists: () => false,
      exec: async (file, args, timeoutMs) => {
        seen.push({ file, args, timeoutMs });
        return { code: 0, stdout: '29.1.2\n' };
      },
    });
    expect(await ready()).toBe(true);
    expect(seen).toEqual([
      { file: 'docker', args: ['version', '--format', '{{.Server.Version}}'], timeoutMs: DOCKER_CHECK_TIMEOUT_MS },
    ]);
    expect(DOCKER_CHECK_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it('prefers Docker Desktop’s own docker.exe when it is installed', async () => {
    const files: string[] = [];
    await createDockerReadyCheck({
      exists: () => true,
      exec: async (file) => {
        files.push(file);
        return { code: 0, stdout: '29.1.2' };
      },
    })();
    expect(files[0]).toBe('C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe');
  });

  it('finds a per-user Docker Desktop install under %LOCALAPPDATA% (Stack’s laptop, 2026-09-30)', async () => {
    const files: string[] = [];
    const perUser = 'C:\\Users\\stack\\AppData\\Local\\Programs\\DockerDesktop\\resources\\bin\\docker.exe';
    await createDockerReadyCheck(
      {
        exists: (p) => p === perUser,
        exec: async (file) => {
          files.push(file);
          return { code: 0, stdout: '29.8.1' };
        },
      },
      { LOCALAPPDATA: 'C:\\Users\\stack\\AppData\\Local' },
    )();
    expect(files[0]).toBe(perUser);
  });

  it('is not ready on a non-zero exit, an empty server version, or a spawn failure', async () => {
    const check = (exec: DockerExec) => createDockerReadyCheck({ exists: () => false, exec })();
    expect(await check(async () => ({ code: 1, stdout: '' }))).toBe(false);
    expect(await check(async () => ({ code: 0, stdout: '  ' }))).toBe(false);
    expect(
      await check(async () => {
        throw new Error('ENOENT');
      }),
    ).toBe(false);
  });

  it('the short-wait request is a small JSON the builder reads', () => {
    expect(forceRequestJson(30, new Date(Date.UTC(2026, 8, 30, 5, 0, 0)))).toBe(
      '{"requestedAt":"2026-09-30T05:00:00Z","dockerWaitSeconds":30}',
    );
    expect(FORCE_REQUEST_FILE).toBe('force-request.json');
  });
});
