/**
 * What the turn and loop suites share: a turn or a loop wired to the fake database and a scripted
 * provider, and the fake clock both run on.
 */

import { afterEach, beforeEach, vi } from 'vitest';

import type { CliTurn } from '../../src/providers/claude-cli.js';
import { createProviders } from '../../src/providers/index.js';
import type { RunnerDeps } from '../../src/runner.js';
import type { TurnDeps } from '../../src/turn.js';
import { fakeRpc, type FakeRpc } from './fakes.js';

export interface TurnHarness {
  readonly fake: FakeRpc;
  readonly logs: string[];
  readonly deps: TurnDeps;
}

export function turnHarness(turn: CliTurn, overrides: Partial<TurnDeps> = {}): TurnHarness {
  const fake = fakeRpc();
  const logs: string[] = [];
  const deps: TurnDeps = {
    rpc: fake.rpc,
    providers: createProviders({ claudeCli: turn }),
    log: (line) => logs.push(line),
    budgetUsd: 1,
    budgetCapHolds: true,
    ...overrides,
  };
  return { fake, logs, deps };
}

export interface LoopHarness {
  readonly fake: FakeRpc;
  readonly logs: string[];
  readonly touches: number[];
  readonly deps: RunnerDeps;
}

export function loopHarness(turn: CliTurn): LoopHarness {
  const fake = fakeRpc();
  const logs: string[] = [];
  const touches: number[] = [];
  const deps: RunnerDeps = {
    rpc: fake.rpc,
    providers: createProviders({ claudeCli: turn }),
    log: (line) => logs.push(line),
    budgetUsd: 1,
    budgetCapHolds: true,
    runnerName: 'workspace@test',
    touchAlive: () => touches.push(Date.now()),
  };
  return { fake, logs, touches, deps };
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
