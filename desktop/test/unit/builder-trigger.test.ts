/**
 * Updates without a Windows logon (Stack, 2026-09-30).
 *
 * The app starts the existing `Bb2dash-LogonBuild` task at launch and every
 * BUILDER_INTERVAL_HOURS, never more than one at a time. The builder already no-ops when
 * `desktop/` is unchanged, so the trigger only has to be cheap and single-flight.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUILDER_INTERVAL_HOURS,
  BUILDER_INTERVAL_MS,
  createBuilderTrigger,
} from '../../src/core/update/builder-trigger';
import type { BuilderStartOutcome } from '../../src/core/update/builder-trigger';
import type { Logger } from '../../src/core/redact';

function logger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the interval', () => {
  it('is a named six hours', () => {
    expect(BUILDER_INTERVAL_HOURS).toBe(6);
    expect(BUILDER_INTERVAL_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe('createBuilderTrigger', () => {
  it('starts the builder once at app start and again every interval', async () => {
    const starts: number[] = [];
    const trigger = createBuilderTrigger({
      startTask: async () => {
        starts.push(Date.now());
        return 'started';
      },
      log: logger(),
    });

    trigger.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(BUILDER_INTERVAL_MS - 1);
    expect(starts).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(starts).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(BUILDER_INTERVAL_MS);
    expect(starts).toHaveLength(3);
    trigger.stop();
  });

  it('never has two starts in flight: a second trigger while the first runs is skipped', async () => {
    let release: (value: BuilderStartOutcome) => void = () => undefined;
    let calls = 0;
    const trigger = createBuilderTrigger({
      startTask: () => {
        calls += 1;
        return new Promise<BuilderStartOutcome>((resolve) => {
          release = resolve;
        });
      },
      log: logger(),
    });

    const first = trigger.trigger('app start');
    const second = await trigger.trigger('interval');
    expect(second).toBe('in-flight');
    expect(calls).toBe(1);

    release('started');
    expect(await first).toBe('started');

    // Free again once the first has settled.
    const third = trigger.trigger('interval');
    release('already-running');
    expect(await third).toBe('already-running');
    expect(calls).toBe(2);
  });

  it('reports a builder that is already running without starting a second one', async () => {
    const log = logger();
    const trigger = createBuilderTrigger({ startTask: async () => 'already-running', log });
    expect(await trigger.trigger('interval')).toBe('already-running');
    expect(log.lines.some((line) => line.includes('already running'))).toBe(true);
  });

  it('logs a failed start and stays usable', async () => {
    const log = logger();
    let fail = true;
    const trigger = createBuilderTrigger({
      startTask: async () => {
        if (fail) throw new Error('task Bb2dash-LogonBuild is not registered');
        return 'started';
      },
      log,
    });
    expect(await trigger.trigger('app start')).toBe('failed');
    expect(log.lines.some((line) => line.startsWith('error'))).toBe(true);

    fail = false;
    expect(await trigger.trigger('interval')).toBe('started');
  });

  it('stop() ends the schedule', async () => {
    let calls = 0;
    const trigger = createBuilderTrigger({
      startTask: async () => {
        calls += 1;
        return 'started';
      },
      log: logger(),
    });
    trigger.start();
    await vi.advanceTimersByTimeAsync(0);
    trigger.stop();
    await vi.advanceTimersByTimeAsync(BUILDER_INTERVAL_MS * 3);
    expect(calls).toBe(1);
  });
});
