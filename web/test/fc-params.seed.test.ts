/**
 * R-51 (T-22): the property suites run on a fixed seed by default, so a clean
 * run on one machine is a clean run on every machine. `FC_SEED=random` opts
 * back into a fresh seed per run; `FC_SEED=<integer>` replays one.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_SEED, MIN_RUNS, fcParams, seedFromEnv } from './grade-model/fc-params';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fcParams seed', () => {
  it('uses the fixed seed when FC_SEED is unset', () => {
    vi.stubEnv('FC_SEED', undefined);
    expect(fcParams().seed).toBe(FIXED_SEED);
    expect(fcParams().numRuns).toBe(MIN_RUNS);
  });

  it('uses the fixed seed when FC_SEED is blank', () => {
    vi.stubEnv('FC_SEED', '  ');
    expect(fcParams().seed).toBe(FIXED_SEED);
  });

  it('lets fast-check pick a seed when FC_SEED=random', () => {
    vi.stubEnv('FC_SEED', 'random');
    const params = fcParams();
    expect(params.seed).toBeUndefined();
    expect('seed' in params).toBe(false);
    expect(params.numRuns).toBe(MIN_RUNS);
  });

  it('replays an explicit integer seed', () => {
    vi.stubEnv('FC_SEED', '-1234');
    expect(fcParams().seed).toBe(-1234);
  });

  it('refuses a seed that is neither an integer nor "random"', () => {
    expect(() => seedFromEnv('1.5')).toThrow(/FC_SEED/);
    expect(() => seedFromEnv('RANDOMLY')).toThrow(/FC_SEED/);
  });

  it('keeps the fixed seed a safe integer', () => {
    expect(Number.isSafeInteger(FIXED_SEED)).toBe(true);
  });
});
