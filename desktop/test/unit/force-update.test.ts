/**
 * "Update desktop app" in the account menu (Stack, 2026-09-30): start the builder now, wait
 * for it, then restart onto a newer build or say the app is up to date. Every OS step is
 * injected, so nothing here starts a task, reads %LOCALAPPDATA% or quits anything.
 */

import { describe, expect, it } from 'vitest';

import {
  BUILDER_POLL_INTERVAL_MS,
  FAILURE_REASONS,
  FORCE_UPDATE_TIMEOUT_MS,
  createForceUpdate,
} from '../../src/core/update/force-update';
import type { BuilderTaskStatus, ForceUpdateDeps } from '../../src/core/update/force-update';
import type { Logger } from '../../src/core/redact';

const RUNNING = 'b087a07ed75b9560c73cc4ed7dd888a5a8da6800';
const NEWER = '31215cf503f565cd7113d01b14266e4b2ce1000d';
const T0 = 1_790_000_000_000;

function logger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
}

interface Harness {
  readonly deps: ForceUpdateDeps;
  readonly calls: { started: number; swaps: string[]; quits: number; records: unknown[] };
  readonly log: ReturnType<typeof logger>;
}

/**
 * A fake clock that only moves when the flow sleeps, and a builder that reports the given
 * statuses in order (the last one repeats).
 */
function harness(overrides: Partial<ForceUpdateDeps> & { statuses?: BuilderTaskStatus[]; lastBuilt?: string | null } = {}): Harness {
  let clock = T0;
  const statuses = overrides.statuses ?? [
    { running: true, lastRunAt: T0, lastResult: null },
    { running: false, lastRunAt: T0, lastResult: 0 },
  ];
  let poll = 0;
  const calls = { started: 0, swaps: [] as string[], quits: 0, records: [] as unknown[] };
  const log = logger();
  const lastBuilt = overrides.lastBuilt === undefined ? NEWER : overrides.lastBuilt;
  const deps: ForceUpdateDeps = {
    runningTree: RUNNING,
    startBuilder: async () => {
      calls.started += 1;
      return 'started';
    },
    readBuilderStatus: async () => {
      const status = statuses[Math.min(poll, statuses.length - 1)] as BuilderTaskStatus;
      poll += 1;
      return status;
    },
    readLastBuiltSha: () => lastBuilt,
    buildOnDisk: () => true,
    startUpdate: async (tree) => {
      calls.swaps.push(tree);
    },
    quitSoon: () => {
      calls.quits += 1;
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    testMode: false,
    record: (kind, payload) => calls.records.push({ kind, payload }),
    log,
    ...overrides,
  };
  return { deps, calls, log };
}

describe('createForceUpdate', () => {
  it('names its bounds as constants', () => {
    expect(FORCE_UPDATE_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(BUILDER_POLL_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('a newer build: starts the builder, waits, runs the swap helper, then restarts', async () => {
    const { deps, calls } = harness();
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'restarting', build: NEWER.slice(0, 7) });
    expect(calls.started).toBe(1);
    expect(calls.swaps).toEqual([NEWER]);
    expect(calls.quits).toBe(1);
  });

  it('the same build: up to date, no swap, no quit', async () => {
    const { deps, calls } = harness({ lastBuilt: RUNNING });
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'up-to-date', build: RUNNING.slice(0, 7) });
    expect(calls.swaps).toEqual([]);
    expect(calls.quits).toBe(0);
  });

  it('a recorded build that is not on disk is not an update', async () => {
    const { deps, calls } = harness({ buildOnDisk: () => false });
    const result = await createForceUpdate(deps).request();
    expect(result.status).toBe('up-to-date');
    expect(calls.swaps).toEqual([]);
  });

  it('a builder run that exits non-zero: failed, the build failed', async () => {
    const { deps, calls } = harness({
      statuses: [
        { running: true, lastRunAt: T0, lastResult: null },
        { running: false, lastRunAt: T0, lastResult: 3 },
      ],
    });
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'failed', reason: FAILURE_REASONS.buildFailed });
    expect(calls.swaps).toEqual([]);
    expect(calls.quits).toBe(0);
  });

  it('a builder that cannot be started: failed, logged', async () => {
    const { deps, log } = harness({
      startBuilder: async () => {
        throw new Error('Start-ScheduledTask exited 1: C:\\secret\\path');
      },
    });
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'failed', reason: FAILURE_REASONS.builderStart });
    expect(log.lines.some((line) => line.startsWith('error'))).toBe(true);
  });

  it('a builder still running at the deadline: failed, took too long', async () => {
    const { deps } = harness({ statuses: [{ running: true, lastRunAt: T0, lastResult: null }] });
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'failed', reason: FAILURE_REASONS.timedOut });
  });

  it('does not take an older run for this one: waits until the task has run since the request', async () => {
    // Not running yet, last run an hour ago; then it runs; then it is done.
    const { deps, calls } = harness({
      statuses: [
        { running: false, lastRunAt: T0 - 3_600_000, lastResult: 0 },
        { running: true, lastRunAt: T0 + 1_000, lastResult: null },
        { running: false, lastRunAt: T0 + 1_000, lastResult: 0 },
      ],
    });
    const result = await createForceUpdate(deps).request();
    expect(result.status).toBe('restarting');
    expect(calls.swaps).toEqual([NEWER]);
  });

  it('a run that finished between two polls still counts, by its start time', async () => {
    const { deps } = harness({ statuses: [{ running: false, lastRunAt: T0 + 500, lastResult: 0 }] });
    const result = await createForceUpdate(deps).request();
    expect(result.status).toBe('restarting');
  });

  it('a builder that was already running is waited for', async () => {
    const { deps, calls } = harness({
      startBuilder: async () => 'already-running',
      statuses: [
        { running: true, lastRunAt: T0 - 60_000, lastResult: null },
        { running: false, lastRunAt: T0 - 60_000, lastResult: 0 },
      ],
    });
    const result = await createForceUpdate(deps).request();
    expect(result.status).toBe('restarting');
    expect(calls.swaps).toEqual([NEWER]);
  });

  it('a swap helper that will not start: failed, and the app stays open', async () => {
    const { deps, calls } = harness({
      startUpdate: async () => {
        throw new Error('update-now.ps1 is not installed');
      },
    });
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'failed', reason: FAILURE_REASONS.swapFailed });
    expect(calls.quits).toBe(0);
  });

  it('an unreadable builder status: failed', async () => {
    const { deps } = harness({
      readBuilderStatus: async () => {
        throw new Error('powershell timed out');
      },
    });
    expect(await createForceUpdate(deps).request()).toEqual({
      status: 'failed',
      reason: FAILURE_REASONS.builderStatus,
    });
  });

  it('a dev run is not an installed build: failed without starting anything', async () => {
    const { deps, calls } = harness({ runningTree: null });
    expect(await createForceUpdate(deps).request()).toEqual({
      status: 'failed',
      reason: FAILURE_REASONS.notInstalled,
    });
    expect(calls.started).toBe(0);
  });

  it('single flight: a second request while one runs shares it and starts nothing new', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps, calls } = harness({
      startBuilder: async () => {
        calls.started += 1;
        await gate;
        return 'started';
      },
    });
    const flow = createForceUpdate(deps);
    const first = flow.request();
    const second = flow.request();
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(calls.started).toBe(1);
    expect(calls.swaps).toHaveLength(1);
  });

  it('after one finishes, the next request runs again', async () => {
    const { deps, calls } = harness({ lastBuilt: RUNNING });
    const flow = createForceUpdate(deps);
    await flow.request();
    await flow.request();
    expect(calls.started).toBe(2);
  });

  it('test mode: records the request and touches nothing', async () => {
    const { deps, calls } = harness({ testMode: true });
    const result = await createForceUpdate(deps).request();
    expect(result).toEqual({ status: 'up-to-date', build: null });
    expect(calls.started).toBe(0);
    expect(calls.swaps).toEqual([]);
    expect(calls.records).toEqual([{ kind: 'update-request', payload: {} }]);
  });

  it('failure reasons are short and carry no paths', () => {
    for (const reason of Object.values(FAILURE_REASONS)) {
      expect(reason.length).toBeLessThanOrEqual(60);
      expect(reason).not.toMatch(/[\\/:]/);
    }
  });
});
