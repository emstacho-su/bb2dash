/**
 * What the turn and loop suites share: a turn or a loop wired to the fake database and a scripted
 * provider, the fake clock both run on, and the clock the runner is handed for its durations.
 */

import { afterEach, beforeEach, vi } from 'vitest';

import type { CliTurn } from '../../src/providers/claude-cli.js';
import { createProviders } from '../../src/providers/index.js';
import type { RunnerDeps } from '../../src/runner.js';
import type { TurnDeps } from '../../src/turn.js';
import { fakeRpc, type FakeRpc } from './fakes.js';

/** When each try of a begin or a finish is made, in ms after the first: 1 s, 2 s, 4 s and 8 s apart, then every 15 s, the last at 110 s. */
export const RETRY_SCHEDULE = [0, 1000, 3000, 7000, 15_000, 30_000, 45_000, 60_000, 75_000, 90_000, 105_000, 110_000];

/**
 * The clock a harness hands the runner (ruling Z1, R2-2), and the wall clock beside it. `now` moves
 * only as the timers run. `stepWallClock` moves the wall clock alone, the way a sleeping laptop or
 * a resynced VM does: no timer fires and no time passes.
 */
export interface TestClock {
  /** Milliseconds that pass as the timers run and in no other way. */
  readonly now: () => number;
  /** Step the wall clock by `ms`; a negative number steps it backwards. */
  stepWallClock(ms: number): void;
}

export function testClock(): TestClock {
  let stepped = 0;
  return {
    now: () => Date.now() - stepped,
    stepWallClock(ms) {
      stepped += ms;
      vi.setSystemTime(Date.now() + ms);
    },
  };
}

export interface TurnHarness {
  /** Its recorded times are read on `clock.now`. */
  readonly fake: FakeRpc;
  readonly logs: string[];
  readonly deps: TurnDeps;
  readonly clock: TestClock;
}

export function turnHarness(turn: CliTurn, overrides: Partial<TurnDeps> = {}): TurnHarness {
  const clock = testClock();
  const fake = fakeRpc(clock.now);
  const logs: string[] = [];
  const deps: TurnDeps = {
    rpc: fake.rpc,
    providers: createProviders({ claudeCli: turn }),
    log: (line) => logs.push(line),
    budgetUsd: 1,
    budgetCapHolds: true,
    now: clock.now,
    ...overrides,
  };
  return { fake, logs, deps, clock };
}

export interface LoopHarness {
  /** Its recorded times are read on `clock.now`. */
  readonly fake: FakeRpc;
  readonly logs: string[];
  readonly touches: number[];
  readonly deps: RunnerDeps;
  readonly clock: TestClock;
}

export function loopHarness(turn: CliTurn): LoopHarness {
  const clock = testClock();
  const fake = fakeRpc(clock.now);
  const logs: string[] = [];
  const touches: number[] = [];
  const deps: RunnerDeps = {
    rpc: fake.rpc,
    providers: createProviders({ claudeCli: turn }),
    log: (line) => logs.push(line),
    budgetUsd: 1,
    budgetCapHolds: true,
    now: clock.now,
    runnerName: 'workspace@test',
    touchAlive: () => touches.push(clock.now()),
  };
  return { fake, logs, touches, deps, clock };
}

/** A fake clock for the suite that calls it: the turn and the loop run on timers. */
export function useFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T04:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
}
