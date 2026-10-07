/**
 * Opening and closing a request against a database that fails (rulings V1, CR-2 and CR-3):
 * `workspace_finish()` and `workspace_begin()` on one retry schedule, what a 22023 means for each,
 * and the watchdog standing back while a finish is being retried. Part of runner.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { DB_WATCHDOG_MS, FINISH_BACKOFF_FIRST_MS, FINISH_BACKOFF_MAX_MS, FINISH_RETRY_MS, HEARTBEAT_MS, TURN_TIMEOUT_MS } from '../../src/config.js';
import { SHUTDOWN_GRACE_MS, createRunner } from '../../src/runner.js';
import { startTurn } from '../../src/turn.js';
import { STORED_SESSION_ID, claimOf, dbDown, dbRefusal, delta, result, scriptedTurn, type FakeRpc } from '../helpers/fakes.js';
import { loopHarness, turnHarness, useFakeClock } from '../helpers/turn-harness.js';

/** When each try is made, in ms after the first: 1 s, 2 s, 4 s and 8 s apart, then every 15 s, the last at 170 s. */
const SCHEDULE = [0, 1000, 3000, 7000, 15_000, 30_000, 45_000, 60_000, 75_000, 90_000, 105_000, 120_000, 135_000, 150_000, 165_000, 170_000];

const offsets = (times: readonly number[]): number[] => times.map((at) => at - (times[0] ?? 0));

describe('the retry schedule', () => {
  it('is 1 s doubling to a 15 s cap, for 170 s, which ends before the watchdog would', () => {
    expect(FINISH_RETRY_MS).toBe(170000);
    expect(FINISH_BACKOFF_FIRST_MS).toBe(1000);
    expect(FINISH_BACKOFF_MAX_MS).toBe(15000);
    expect(FINISH_RETRY_MS).toBeLessThan(DB_WATCHDOG_MS);
    expect(SCHEDULE[SCHEDULE.length - 1]).toBe(FINISH_RETRY_MS);
  });
});

describe('workspace_finish against a database that fails', () => {
  useFakeClock();

  it('is tried again after 1 s, 2 s, 4 s and 8 s, then every 15 s, for 170 s', async () => {
    const { fake, deps } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    fake.failFinish(Number.POSITIVE_INFINITY);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    await handle.done;
    expect(offsets(fake.finishTries)).toEqual(SCHEDULE);
  });

  it('gives the answer up after 170 s, says so once, and tries no more', async () => {
    const { fake, logs, deps } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    fake.failFinish(Number.POSITIVE_INFINITY);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS - 1000);
    expect(logs.some((line) => /finish given up/.test(line))).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes).toHaveLength(0);
    const givenUp = logs.filter((line) => /finish given up/.test(line));
    expect(givenUp).toHaveLength(1);
    expect(givenUp[0]).toMatch(/request=41/);
    expect(givenUp[0]).toMatch(/170 s/);
    expect(logs.filter((line) => /request=41/.test(line) && /finish failed/.test(line)).length).toBeGreaterThan(3);
    const tries = fake.finishTries.length;
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(fake.finishTries).toHaveLength(tries);
  });

  it.each([
    [4, 15_000],
    [8, 75_000],
    [15, 170_000],
  ])('stores the whole answer when the database comes back after %s failed tries', async (failures, storedAfter) => {
    const { fake, logs, deps } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    fake.failFinish(failures);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'done', content: 'the answer', errorCode: null });
    expect(offsets(fake.finishTries).pop()).toBe(storedAfter);
    expect(logs.some((line) => /finish given up/.test(line))).toBe(false);
  });

  it('reads a 22023 as a request that is already closed: logged, not tried again', async () => {
    const { fake, logs, deps } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    fake.failFinish(Number.POSITIVE_INFINITY, dbRefusal('workspace_finish: request 41 is done, not claimed or cancelled'));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishTries).toHaveLength(1);
    expect(logs.some((line) => /request=41/.test(line) && /already closed/.test(line))).toBe(true);
    expect(logs.some((line) => /finish given up/.test(line))).toBe(false);
  });

  it('stops trying on a 22023 that comes after failures of another kind', async () => {
    const { fake, deps } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(20)]).turn);
    const original = fake.rpc.finish;
    let tries = 0;
    fake.rpc.finish = async (args) => {
      tries += 1;
      if (tries <= 2) throw dbDown();
      if (tries === 3) throw dbRefusal('workspace_finish: request 41 is failed, not claimed or cancelled');
      return original(args);
    };
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    await handle.done;
    expect(tries).toBe(3);
  });

  it('says it is finishing only while the finish is being made', async () => {
    const { fake, deps } = turnHarness(scriptedTurn([delta(10, 'the answer'), result(5000)]).turn);
    fake.failFinish(3);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    expect(handle.finishingSince()).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(handle.finishingSince()).toBe(fake.finishTries[0]);
    await vi.advanceTimersByTimeAsync(10_000);
    await handle.done;
    expect(handle.finishingSince()).toBeNull();
  });
});

describe('workspace_begin against a database that fails', () => {
  useFakeClock();

  it('reads a 22023 on the first try as nothing to close: nothing runs and nothing is finished', async () => {
    const scripted = scriptedTurn([result(10)]);
    const { fake, logs, deps } = turnHarness(scripted.turn);
    fake.failBegin(dbRefusal('workspace_begin: request 41 is not claimed (it is cancelled)'));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(await handle.done).toEqual({ state: 'skipped', errorCode: null });
    expect(fake.beginTries).toHaveLength(1);
    expect(scripted.inputs).toHaveLength(0);
    expect(fake.finishTries).toHaveLength(0);
    expect(logs.some((line) => /request=41/.test(line) && /begin refused/.test(line))).toBe(true);
  });

  it('tries again after any other failure, on the same schedule, and then answers the request', async () => {
    const scripted = scriptedTurn([delta(10, 'the answer'), result(20)]);
    const { fake, logs, deps } = turnHarness(scripted.turn);
    fake.failBegin(dbDown(), 3);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(offsets(fake.beginTries)).toEqual(SCHEDULE.slice(0, 4));
    expect(fake.begins).toHaveLength(1);
    expect(scripted.inputs).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'done', content: 'the answer' });
    expect(logs.some((line) => /request=41/.test(line) && /begin failed/.test(line) && /connection refused/.test(line))).toBe(true);
  });

  it('does not read a failure with another SQLSTATE as "no longer claimed"', async () => {
    const scripted = scriptedTurn([delta(10, 'the answer'), result(20)]);
    const { fake, deps } = turnHarness(scripted.turn);
    fake.failBegin(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }), 1);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(5000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.beginTries).toHaveLength(2);
    expect(fake.finishes).toHaveLength(1);
  });

  /** A begin whose first try fails with `failure` and whose second the function refuses with `refusal`. */
  function beginRefusedAfter(fake: FakeRpc, failure: Error, refusal: string): { tries: number } {
    const seen = { tries: 0 };
    const original = fake.rpc.begin;
    fake.rpc.begin = async (...args) => {
      seen.tries += 1;
      if (seen.tries === 1) throw failure;
      if (seen.tries === 2) throw dbRefusal(refusal);
      return original(...args);
    };
    return seen;
  }

  // Ruling X1. A begin that committed and whose reply was lost is refused on the next try, and the
  // request is still claimed with its assistant row unfinished: that is not "nothing to close".
  it.each([
    ['a database that could not be reached', dbDown()],
    ['a statement the database cut', Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })],
  ])('closes the request as failed / cli_error when a 22023 follows %s in the same turn', async (_what, failure) => {
    const scripted = scriptedTurn([delta(10, 'never streamed'), result(20)]);
    const { fake, logs, deps } = turnHarness(scripted.turn);
    const seen = beginRefusedAfter(fake, failure, 'workspace_begin: request 41 already has its assistant message');
    const handle = startTurn(deps, claimOf({ claudeSessionId: STORED_SESSION_ID }));
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(seen.tries).toBe(2);
    expect(scripted.inputs).toHaveLength(0);
    expect(fake.streams).toHaveLength(0);
    expect(fake.finishes).toEqual([
      {
        requestId: '41',
        state: 'failed',
        content: '',
        toolCalls: [],
        errorCode: 'cli_error',
        costUsd: null,
        durationMs: FINISH_BACKOFF_FIRST_MS,
        claudeSessionId: STORED_SESSION_ID,
        model: null,
      },
    ]);
    expect(logs.some((line) => /request=41/.test(line) && /begin refused after a failed try/.test(line))).toBe(true);
    expect(logs.some((line) => /begin refused, nothing ran/.test(line))).toBe(false);
  });

  it('keeps trying to close a request whose begin was refused after a failure, on the finish schedule', async () => {
    const { fake, deps } = turnHarness(scriptedTurn([result(10)]).turn);
    beginRefusedAfter(fake, dbDown(), 'workspace_begin: request 41 already has its assistant message');
    fake.failFinish(2);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(offsets(fake.finishTries)).toEqual(SCHEDULE.slice(0, 3));
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'failed', errorCode: 'cli_error', content: '' });
  });

  it('asks for the close once when the request turns out to be closed already: the finish is refused and not tried again', async () => {
    const { fake, logs, deps } = turnHarness(scriptedTurn([result(10)]).turn);
    beginRefusedAfter(fake, dbDown(), 'workspace_begin: request 41 is not claimed (it is cancelled)');
    fake.failFinish(Number.POSITIVE_INFINITY, dbRefusal('workspace_finish: request 41 is failed, not claimed or cancelled'));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(fake.finishTries).toHaveLength(1);
    expect(fake.finishes).toHaveLength(0);
    expect(logs.some((line) => /request=41/.test(line) && /already closed/.test(line))).toBe(true);
  });

  it('closes the request as failed / cli_error when begin still cannot be made after 170 s', async () => {
    const scripted = scriptedTurn([delta(10, 'never streamed'), result(20)]);
    const { fake, logs, deps } = turnHarness(scripted.turn);
    fake.failBegin(dbDown());
    const handle = startTurn(deps, claimOf({ claudeSessionId: STORED_SESSION_ID }));
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS - 1000);
    expect(fake.finishTries).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(offsets(fake.beginTries)).toEqual(SCHEDULE);
    expect(scripted.inputs).toHaveLength(0);
    expect(fake.streams).toHaveLength(0);
    expect(fake.finishes).toEqual([
      {
        requestId: '41',
        state: 'failed',
        content: '',
        toolCalls: [],
        errorCode: 'cli_error',
        costUsd: null,
        durationMs: FINISH_RETRY_MS,
        claudeSessionId: STORED_SESSION_ID,
        model: null,
      },
    ]);
    expect(logs.some((line) => /request=41/.test(line) && /begin could not be made/.test(line))).toBe(true);
  });

  it('keeps trying to close a request it could not begin, on the finish schedule', async () => {
    const { fake, deps } = turnHarness(scriptedTurn([result(10)]).turn);
    fake.failBegin(dbDown());
    fake.failFinish(2);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 10_000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(offsets(fake.finishTries)).toEqual(SCHEDULE.slice(0, 3));
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cli_error' });
  });

  it('counts the 8-minute limit from the start of the turn, the time spent on begin included', async () => {
    const scripted = scriptedTurn([delta(100, 'part of an answer')]);
    const { fake, deps } = turnHarness(scripted.turn);
    // Tries at 0 s to 60 s fail; the ninth, 75 s in, goes through.
    fake.failBegin(dbDown(), 8);
    const turnStartedAt = Date.now();
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS - 1000);
    expect((scripted.startedAt ?? 0) - turnStartedAt).toBe(75_000);
    expect(scripted.abortedAt).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect((scripted.abortedAt ?? 0) - turnStartedAt).toBe(TURN_TIMEOUT_MS);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'timeout', content: 'part of an answer' });
    handle.stop('stale_claim');
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS);
    await handle.done;
  });

  it('stops trying when the runner stops the turn, and closes the request under the runner\'s own reason', async () => {
    const scripted = scriptedTurn([result(10)]);
    const { fake, deps } = turnHarness(scripted.turn);
    fake.failBegin(dbDown());
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(20_000);
    const triesBefore = fake.beginTries.length;
    handle.stop('stale_claim');
    await vi.advanceTimersByTimeAsync(100);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'stale_claim' });
    expect(fake.beginTries).toHaveLength(triesBefore);
    expect(scripted.inputs).toHaveLength(0);
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'failed', errorCode: 'stale_claim', content: '' });
  });
});

describe('the watchdog and a finish that is being retried', () => {
  useFakeClock();

  /** A turn whose answer is complete 100 s in, on a database that stopped answering 1 s in. */
  function longTurnOnABrokenDatabase() {
    const scripted = scriptedTurn([delta(100, 'a long answer'), result(100_000)]);
    const loop = loopHarness(scripted.turn);
    loop.fake.queue.push(claimOf());
    const runner = createRunner(loop.deps);
    const exit: { code: number | null } = { code: null };
    void runner.run().then((code) => {
      exit.code = code;
    });
    return { ...loop, runner, exit, scripted };
  }

  it('does not end the process while the finish is inside its 170 s, and the answer is stored when the database comes back', async () => {
    const { fake, logs, runner, exit } = longTurnOnABrokenDatabase();
    await vi.advanceTimersByTimeAsync(1000);
    fake.breakDatabase();
    // The last heartbeat that succeeded was at the start; the watchdog is due at 180 s, 80 s into the finish.
    await vi.advanceTimersByTimeAsync(DB_WATCHDOG_MS + HEARTBEAT_MS);
    expect(exit.code).toBeNull();
    expect(fake.finishes).toHaveLength(0);
    expect(fake.finishTries.length).toBeGreaterThan(5);
    expect(logs.filter((line) => /watchdog/.test(line) && /held/.test(line))).toHaveLength(1);

    fake.repairDatabase();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'done', content: 'a long answer', errorCode: null });
    await vi.advanceTimersByTimeAsync(2 * DB_WATCHDOG_MS);
    expect(exit.code).toBeNull();

    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(exit.code).toBe(0);
  });

  it('ends the process once the 170 s are over and the database is still gone', async () => {
    const { fake, logs, exit } = longTurnOnABrokenDatabase();
    await vi.advanceTimersByTimeAsync(1000);
    fake.breakDatabase();
    // The finish began at 100 s, so its window ends at 270 s.
    await vi.advanceTimersByTimeAsync(100_000 + FINISH_RETRY_MS - 1000 - 5000);
    expect(exit.code).toBeNull();
    await vi.advanceTimersByTimeAsync(5000 + HEARTBEAT_MS + SHUTDOWN_GRACE_MS);
    expect(exit.code).toBe(1);
    expect(fake.finishes).toHaveLength(0);
    expect(logs.some((line) => /request=41/.test(line) && /finish given up/.test(line))).toBe(true);
    expect(logs.some((line) => /watchdog/.test(line) && /exiting/.test(line))).toBe(true);
  });

  it('is not held past the window by a finish call that never returns', async () => {
    const { fake, exit } = longTurnOnABrokenDatabase();
    await vi.advanceTimersByTimeAsync(1000);
    fake.rpc.heartbeat = () => Promise.reject(dbDown());
    fake.rpc.finish = () => new Promise<void>(() => undefined);
    await vi.advanceTimersByTimeAsync(100_000 + FINISH_RETRY_MS - 1000 - 5000);
    expect(exit.code).toBeNull();
    await vi.advanceTimersByTimeAsync(5000 + HEARTBEAT_MS + SHUTDOWN_GRACE_MS);
    expect(exit.code).toBe(1);
  });

  it('still ends a turn that is not finishing: the hold is for the finish alone', async () => {
    const scripted = scriptedTurn([delta(100, 'part of an answer')]);
    const { fake, logs, deps } = loopHarness(scripted.turn);
    fake.queue.push(claimOf());
    const runner = createRunner(deps);
    let exitCode: number | null = null;
    void runner.run().then((code) => {
      exitCode = code;
    });
    await vi.advanceTimersByTimeAsync(1000);
    fake.breakDatabase();
    await vi.advanceTimersByTimeAsync(DB_WATCHDOG_MS + SHUTDOWN_GRACE_MS);
    expect(exitCode).toBe(1);
    expect(scripted.abortedAt).not.toBeNull();
    expect(logs.some((line) => /watchdog/.test(line) && /held/.test(line))).toBe(false);
  });
});
