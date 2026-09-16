/**
 * Shared fast-check parameters for the L2 property suite.
 *
 * - At least 200 runs per property (Contract §Engine tests).
 * - `FC_SEED=<integer>` replays a run exactly: `FC_SEED=-1234 npx vitest run test/grade-model/properties`.
 * - The seed of every failing run is printed: fast-check's failure report
 *   carries `{ seed, path }`, and `assertProperty` adds a one-line replay hint
 *   in front of it so it is the first thing in the vitest output.
 */

import fc from 'fast-check';

export const MIN_RUNS = 200;

export function seedFromEnv(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`FC_SEED must be an integer, got "${raw}"`);
  }
  return seed;
}

export function fcParams(): { numRuns: number; seed?: number } {
  const seed = seedFromEnv(process.env.FC_SEED);
  return seed === undefined ? { numRuns: MIN_RUNS } : { numRuns: MIN_RUNS, seed };
}

/** Runs a property; a failure is rethrown with the seed to replay it. */
export function assertProperty<Ts extends [unknown, ...unknown[]]>(property: fc.IProperty<Ts>): void {
  const details = fc.check(property, fcParams());
  if (!details.failed) return;
  const hint = `Property failed — replay with FC_SEED=${details.seed} (path ${details.counterexamplePath ?? '?'})`;
  throw new Error(`${hint}\n${fc.defaultReportMessage(details)}`);
}
