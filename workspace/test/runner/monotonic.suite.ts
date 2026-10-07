/**
 * The runner's durations on a monotonic clock (ruling Z1, R2-2). A step of the wall clock, forward
 * (the laptop slept) or backward (the VM's clock was set), changes none of them: not the retry
 * window of a begin or a finish, not the turn's limit, not the watchdog or its hold, not the 2 s
 * between two asks about a Stop, not the duration that is stored.
 *
 * Each case steps the wall clock in the middle of a wait (`clock.stepWallClock`) and reads what the
 * runner did on the harness's clock, which only the timers move. Part of runner.test.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { DB_WATCHDOG_MS, FINISH_RETRY_MS, HEARTBEAT_MS, TURN_TIMEOUT_MS } from '../../src/config.js';
import type { CliTurn } from '../../src/providers/claude-cli.js';
import type { StoredToolCall, TurnEvent } from '../../src/providers/types.js';
import { SHUTDOWN_GRACE_MS, createRunner, monotonicNow } from '../../src/runner.js';
import { startTurn } from '../../src/turn.js';
import { ABORTED, claimOf, dbDown, delta, result, scriptedTurn, type Step } from '../helpers/fakes.js';
import { RETRY_SCHEDULE, loopHarness, turnHarness, useFakeClock } from '../helpers/turn-harness.js';

const HOUR_MS = 60 * 60 * 1000;
/** The two ways a wall clock steps: forward past every window the runner keeps, and backward as far. */
const STEPS = [
  ['forward', HOUR_MS],
  ['backward', -HOUR_MS],
] as const;

const offsets = (times: readonly number[]): number[] => times.map((at) => at - (times[0] ?? 0));

describe('the retry window and a step of the wall clock (ruling Z1, R2-2)', () => {
  useFakeClock();

  it.each(STEPS)('makes the same twelve finish tries at the same times when the wall clock steps %s in the middle of them', async (_way, step) => {
    const { fake, logs, deps, clock } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    fake.failFinish(Number.POSITIVE_INFINITY);
    const ended = { yes: false };
    void startTurn(deps, claimOf()).done.then(() => {
      ended.yes = true;
    });
    // Five tries are made in the first 20 s: at 0, 1, 3, 7 and 15 s.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fake.finishTries).toHaveLength(5);
    clock.stepWallClock(step);
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS);
    expect(offsets(fake.finishTries)).toEqual(RETRY_SCHEDULE);
    expect(logs.filter((line) => /finish given up after 110 s/.test(line))).toHaveLength(1);
    expect(ended.yes).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fake.finishTries).toHaveLength(RETRY_SCHEDULE.length);
  });

  it('stores the answer on the try the schedule names when the database comes back after the wall clock stepped forward', async () => {
    const { fake, deps, clock } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    // The tries at 0 to 60 s fail; the ninth, 75 s after the first, goes through.
    fake.failFinish(8);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(20_000);
    clock.stepWallClock(HOUR_MS);
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'done', content: 'the answer' });
    expect(offsets(fake.finishTries)).toEqual(RETRY_SCHEDULE.slice(0, 9));
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
  });
});

describe("the turn's 8-minute limit and a step of the wall clock during begin's retries (ruling Z1, R2-2)", () => {
  useFakeClock();

  /** Begin fails at 0 s, 1 s and 3 s and goes through at 7 s; the wall clock steps at 5 s, between two tries. */
  async function beginAcrossAStep(turn: CliTurn, step: number) {
    const h = turnHarness(turn);
    h.fake.failBegin(dbDown(), 3);
    const handle = startTurn(h.deps, claimOf());
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.fake.beginTries).toHaveLength(3);
    h.clock.stepWallClock(step);
    await vi.advanceTimersByTimeAsync(2000);
    expect(offsets(h.fake.beginTries)).toEqual(RETRY_SCHEDULE.slice(0, 4));
    expect(h.fake.begins).toHaveLength(1);
    return { ...h, handle };
  }

  it('does not give the turn a limit of 0 when the wall clock stepped forward: the answer is stored done', async () => {
    const { fake, handle } = await beginAcrossAStep(scriptedTurn([delta(100, 'the answer'), result(200)]).turn, HOUR_MS);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'done', errorCode: null, content: 'the answer' });
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
  });

  it.each(STEPS)('kills the turn 8 minutes of running time after its start when the wall clock stepped %s, no sooner and no later', async (_way, step) => {
    const { fake } = await beginAcrossAStep(scriptedTurn([delta(100, 'part of an answer')]).turn, step);
    // 7 s of the 8 minutes have run. One second before the limit nothing is finished; one second after, the turn is.
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS - 7000 - 1000);
    expect(fake.finishTries).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'timeout', content: 'part of an answer', durationMs: TURN_TIMEOUT_MS });
  });
});

describe('a turn in flight and a step of the wall clock (ruling Z1, R2-2)', () => {
  useFakeClock();

  /** A provider turn on timers alone: each event comes `afterMs` after the one before it, whatever the wall clock says. */
  function timerTurn(steps: ReadonlyArray<readonly [afterMs: number, event: TurnEvent]>): CliTurn {
    return async function* () {
      for (const [afterMs, event] of steps) {
        await new Promise((resolve) => setTimeout(resolve, afterMs));
        yield event;
      }
    };
  }

  it.each(STEPS)('stores the duration as the time the turn ran when the wall clock stepped %s in the middle of it', async (_way, step) => {
    const answered: TurnEvent = { ...ABORTED, ok: true, errorCode: null };
    const { fake, deps, clock } = turnHarness(timerTurn([[100, { type: 'delta', text: 'the answer' }], [500, answered]]));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(300);
    clock.stepWallClock(step);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]).toMatchObject({ state: 'done', content: 'the answer', durationMs: 600 });
  });

  it('still asks every 2 s whether the request is claimed after the wall clock stepped backward: a Stop during a tool call stops the turn within 4 s', async () => {
    const call: StoredToolCall = { tool: 'search_materials', query: 'late work', scope: null, ok: false };
    const tool: Step = { at: 200, event: { type: 'tool', id: 't1', call } };
    const { fake, deps, clock } = turnHarness(scriptedTurn([delta(100, 'Let me look. '), tool]).turn);
    void startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(3000);
    clock.stepWallClock(-HOUR_MS);
    fake.cancel();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cancelled', content: 'Let me look. ' });
  });
});

describe('the watchdog, its hold and a step of the wall clock (ruling Z1, R2-2)', () => {
  useFakeClock();

  function running(turn: CliTurn, queued = true) {
    const loop = loopHarness(turn);
    if (queued) loop.fake.queue.push(claimOf());
    const runner = createRunner(loop.deps);
    const exit: { code: number | null } = { code: null };
    void runner.run().then((code) => {
      exit.code = code;
    });
    return { ...loop, runner, exit };
  }

  it.each(STEPS)('trips after 180 s of running time without a heartbeat when the wall clock stepped %s, no sooner and no later', async (_way, step) => {
    const { fake, logs, clock, exit } = running(scriptedTurn([result(10)]).turn, false);
    // The heartbeat at the start succeeded. From 10 s on none does, and the wall clock steps.
    await vi.advanceTimersByTimeAsync(10_000);
    fake.rpc.heartbeat = () => Promise.reject(dbDown());
    clock.stepWallClock(step);
    await vi.advanceTimersByTimeAsync(DB_WATCHDOG_MS - 10_000 - 1000);
    expect(exit.code).toBeNull();
    expect(logs.some((line) => /watchdog/.test(line))).toBe(false);
    await vi.advanceTimersByTimeAsync(1000 + 100);
    expect(exit.code).toBe(1);
  });

  /**
   * A turn whose answer is complete 100 s in. From 1 s on no heartbeat succeeds and the finish call
   * never returns, so only the hold decides when the process ends: the watchdog is due at 180 s and
   * the finish's window ends at 210 s. The wall clock steps at 150 s.
   */
  it.each(STEPS)('holds the watchdog for the 110 s of running time a finish is given, and no longer, when the wall clock stepped %s', async (_way, step) => {
    const { fake, logs, clock, exit } = running(scriptedTurn([delta(100, 'a long answer'), result(100_000)]).turn);
    await vi.advanceTimersByTimeAsync(1000);
    fake.rpc.heartbeat = () => Promise.reject(dbDown());
    fake.rpc.finish = () => new Promise<void>(() => undefined);
    await vi.advanceTimersByTimeAsync(149_000);
    clock.stepWallClock(step);
    // 205 s: past the 180 s, inside the window. The watchdog is held.
    await vi.advanceTimersByTimeAsync(55_000);
    expect(logs.filter((line) => /watchdog/.test(line) && /held/.test(line))).toHaveLength(1);
    expect(exit.code).toBeNull();
    // The heartbeat at 210 s finds the window over; the turn cannot finish, so the process ends 20 s later.
    await vi.advanceTimersByTimeAsync(5000 + SHUTDOWN_GRACE_MS - 1000);
    expect(exit.code).toBeNull();
    await vi.advanceTimersByTimeAsync(1000 + 100);
    expect(exit.code).toBe(1);
    expect(logs.some((line) => /watchdog/.test(line) && /exiting/.test(line))).toBe(true);
  });

  it('stores a finished answer when the database comes back inside the window, although the wall clock stepped forward in the middle of the finish', async () => {
    const { fake, logs, clock, runner, exit } = running(scriptedTurn([delta(100, 'a long answer'), result(100_000)]).turn);
    await vi.advanceTimersByTimeAsync(1000);
    fake.breakDatabase();
    await vi.advanceTimersByTimeAsync(149_000);
    clock.stepWallClock(HOUR_MS);
    // 185 s: the watchdog was due at 180 s and is held; the finish is still being tried.
    await vi.advanceTimersByTimeAsync(35_000);
    expect(exit.code).toBeNull();
    expect(fake.finishes).toHaveLength(0);
    expect(logs.filter((line) => /watchdog/.test(line) && /held/.test(line))).toHaveLength(1);
    expect(logs.some((line) => /finish given up/.test(line))).toBe(false);
    // The database comes back; the try at 190 s stores the answer.
    fake.repairDatabase();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'done', content: 'a long answer', errorCode: null });
    expect(exit.code).toBeNull();
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(exit.code).toBe(0);
  });
});

describe('the clock the runner is started with (ruling Z1, R2-2)', () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
  const readSrc = (file: string): string => fs.readFileSync(path.join(SRC, file), 'utf8');
  /** A read of the wall clock, as source spells it. */
  const WALL_CLOCK = /\bDate\.now\(|\bnew Date\(/;

  it('is performance.now(): a step of the wall clock does not move it', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-07T04:00:00Z'));
      const before = monotonicNow();
      vi.setSystemTime(new Date('2026-10-07T09:00:00Z'));
      const passed = monotonicNow() - before;
      expect(passed).toBeGreaterThanOrEqual(0);
      expect(passed).toBeLessThan(60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is the clock main() hands the loop and every turn', () => {
    expect(readSrc('runner.ts')).toMatch(/^\s+now: monotonicNow,$/m);
  });

  // Wall-clock stays only where a time is written or logged: the stamp on a log line, the alive
  // file's own time, and the healthcheck that compares that file's time with now.
  it('leaves the wall clock to the log stamp, the alive file and the healthcheck that reads it', () => {
    const files = fs
      .readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.ts'))
      .map((name) => name.replaceAll(path.sep, '/'))
      .sort();
    expect(files).toContain('turn.ts');
    expect(files).toContain('db-retry.ts');
    expect(files.filter((file) => WALL_CLOCK.test(readSrc(file)))).toEqual(['alive.ts', 'healthcheck.ts', 'runner.ts']);
    const inRunner = readSrc('runner.ts')
      .split('\n')
      .filter((line) => WALL_CLOCK.test(line));
    expect(inRunner).toHaveLength(1);
    expect(inRunner[0]).toContain('new Date().toISOString()');
  });
});
