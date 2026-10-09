/**
 * A statement the database refuses (ruling Z1, R2-5): NUL never reaches it inside the stored tool
 * calls, a failure that is the statement's own is not tried again, and a finish refused that way is
 * followed by one minimal close of the same request. Part of runner.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { DB_WATCHDOG_MS, FINISH_RETRY_MS } from '../../src/config.js';
import { createRpc, isBadStatement, type FinishArgs, type QueryResult } from '../../src/db.js';
import type { StoredToolCall } from '../../src/providers/types.js';
import { createRunner } from '../../src/runner.js';
import { startTurn, type TurnHandle, type TurnOutcome } from '../../src/turn.js';
import { claimOf, contextJson, dbDown, dbRefusal, delta, result, scriptedTurn, type Step } from '../helpers/fakes.js';
import { RETRY_SCHEDULE, loopHarness, turnHarness, useFakeClock } from '../helpers/turn-harness.js';

/** The character itself, and the six characters JSON writes it as. */
const NUL = '\u0000';
const NUL_ESCAPE = '\\u0000';

/** The two steps the runner itself puts in front of the model's calls: its search and its planner feed. */
const RUNNER_STEPS = 2;
const tool = (at: number, id: string, call: StoredToolCall): Step => ({ at, event: { type: 'tool', id, call } });

describe('NUL characters and the stored tool calls (ruling Z1, R2-5)', () => {
  useFakeClock();

  it('takes NUL out of every string of a stored tool call before the finish call, as it does out of the content', async () => {
    const dirty: StoredToolCall = { tool: `search_${NUL}materials`, query: `late${NUL} work${NUL}`, scope: `IST${NUL}.323`, ok: true };
    const { fake, deps } = turnHarness(scriptedTurn([tool(10, 't1', dirty), delta(20, `the ${NUL}answer`), result(30)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]?.toolCalls.slice(RUNNER_STEPS)).toEqual([{ tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true }]);
    expect(fake.finishes[0]?.content).toBe('the answer');
  });

  it('takes it out of keys and values at any depth, and leaves what is not a string as it was', async () => {
    const nested = {
      tool: 'get_material_text',
      query: null,
      scope: '12',
      ok: false,
      [`extra${NUL}`]: { [`ke${NUL}y`]: [`a${NUL}`, { [`dee${NUL}p`]: `x${NUL}y`, count: 3, yes: true, none: null }] },
    } as unknown as StoredToolCall;
    const { fake, deps } = turnHarness(scriptedTurn([tool(10, 't1', nested), result(20)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    await handle.done;
    expect(fake.finishes[0]?.toolCalls.slice(RUNNER_STEPS)).toEqual([
      { tool: 'get_material_text', query: null, scope: '12', ok: false, extra: { key: ['a', { deep: 'xy', count: 3, yes: true, none: null }] } },
    ]);
  });

  // What the database is sent, through the real call: the jsonb parameter is JSON text, in which a
  // NUL is the escape the database refuses to store (22P05).
  it('sends workspace_finish a tool-call parameter with no NUL escape, and a content with no NUL', async () => {
    const sent: Array<{ sql: string; params: readonly unknown[] }> = [];
    const query = async (sql: string, params: readonly unknown[] = []): Promise<QueryResult> => {
      sent.push({ sql, params });
      if (sql.includes('workspace_turn_context')) return { rows: [{ context: contextJson() }] };
      if (sql.includes('workspace_planner_feed')) return { rows: [{ feed: null }] };
      if (sql.includes('workspace_turn_put')) return { rows: [{ kept: 0 }] };
      return { rows: [{ id: '9c9c9c9c-0000-4000-8000-000000000001', ok: true }] };
    };
    const dirty: StoredToolCall = { tool: 'search_context', query: `week ${NUL}8`, scope: null, ok: true };
    const { deps } = turnHarness(scriptedTurn([tool(10, 't1', dirty), delta(20, `Week${NUL} 8.`), result(30)]).turn, { rpc: createRpc(query) });
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    const finish = sent.filter((call) => call.sql.includes('workspace_finish'));
    expect(finish).toHaveLength(1);
    const [, , content, toolCalls] = finish[0]!.params;
    expect(content).toBe('Week 8.');
    expect((JSON.parse(String(toolCalls)) as unknown[]).slice(RUNNER_STEPS)).toEqual([{ tool: 'search_context', query: 'week 8', scope: null, ok: true }]);
    expect(JSON.stringify(finish[0]!.params)).not.toContain(NUL_ESCAPE);
  });
});

/** A failure with a SQLSTATE, as the database raises one. */
const dbError = (code: string, message = 'unsupported Unicode escape sequence'): Error => Object.assign(new Error(message), { code });
/** A session the turn itself reports, so the claim's stored one can be told from it. */
const TURN_SESSION_ID = '7c1d2e3f-4a5b-4c6d-8e7f-90a1b2c3d4e5';

/** The minimal close: failed / cli_error, nothing of a turn, and no session id. */
const minimalClose = (durationMs: number): FinishArgs => ({
  requestId: '41',
  state: 'failed',
  content: '',
  toolCalls: [],
  errorCode: 'cli_error',
  costUsd: null,
  durationMs,
  claudeSessionId: null,
  model: null,
});

const offsets = (times: readonly number[]): number[] => times.map((at) => at - (times[0] ?? 0));

/** How the turn ended, or null while it has not: read without waiting on a turn that may never end. */
function outcomeOf(handle: TurnHandle): { value: TurnOutcome | null } {
  const outcome: { value: TurnOutcome | null } = { value: null };
  void handle.done.then((value) => {
    outcome.value = value;
  });
  return outcome;
}

describe("which failures are the statement's own (ruling Z1, R2-5)", () => {
  it.each([
    ['22P05', 'a character the database cannot store'],
    ['22021', 'a byte sequence that is not the encoding'],
    ['22P02', 'text that is not the type'],
    ['22003', 'a number out of range'],
    ['23505', 'a unique violation'],
    ['23514', 'a check violation'],
    ['42883', 'a function that does not exist'],
    ['42501', 'a privilege that is missing'],
    ['42601', 'a syntax error'],
  ])('reads %s as one (%s): the same statement gets the same answer', (code) => {
    expect(isBadStatement(dbError(code))).toBe(true);
  });

  it.each([
    ['22023', "the functions' own refusal, which keeps its own meaning"],
    ['57014', 'a statement cut at its time limit'],
    ['40001', 'a serialization failure'],
    ['40P01', 'a deadlock'],
    ['53300', 'too many connections'],
    ['P0001', 'an exception raised with no SQLSTATE of its own'],
    ['08006', 'a connection failure'],
    ['57P01', 'the server shutting down'],
    ['XX000', 'an internal error'],
    ['ECONNRESET', "node's own code for a socket that was reset"],
    ['EPIPE', "node's own code, five characters long"],
    ['2200', 'four characters'],
    ['22p05', 'lower case'],
  ])('does not read %s as one (%s)', (code) => {
    expect(isBadStatement(dbError(code))).toBe(false);
  });

  it('does not read a failure with no code as one, nor a value that is not an error', () => {
    expect(isBadStatement(dbDown())).toBe(false);
    expect(isBadStatement(Object.assign(new Error('a number for a code'), { code: 22005 }))).toBe(false);
    expect(isBadStatement(null)).toBe(false);
    expect(isBadStatement(undefined)).toBe(false);
    expect(isBadStatement('22P05')).toBe(false);
  });
});

describe('workspace_finish refused as a statement the database cannot take (ruling Z1, R2-5)', () => {
  useFakeClock();

  /** A turn that answers 20 ms in under a session, a cost and a model of its own; the claim carries the stored session. */
  function answeredTurn() {
    const call: StoredToolCall = { tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true };
    const scripted = scriptedTurn([tool(5, 't1', call), delta(10, 'the answer'), result(20, { claudeSessionId: TURN_SESSION_ID, costUsd: 0.03 })]);
    const h = turnHarness(scripted.turn);
    const start = (): { value: TurnOutcome | null } => outcomeOf(startTurn(h.deps, claimOf()));
    return { ...h, start };
  }

  it.each([['22P05'], ['23514'], ['42883']])('makes exactly one more call after a %s, the minimal close, with no wait', async (code) => {
    const { fake, logs, start } = answeredTurn();
    fake.failFinish(1, dbError(code));
    const outcome = start();
    await vi.advanceTimersByTimeAsync(100);
    expect(outcome.value).not.toBeNull();
    expect(offsets(fake.finishTries)).toEqual([0, 0]);
    expect(fake.finishes).toEqual([minimalClose(20)]);
    expect(logs.filter((line) => /request=41/.test(line) && /finish refused by the database/.test(line))).toHaveLength(1);
    expect(logs.filter((line) => /request=41/.test(line) && /closed as failed \/ cli_error/.test(line))).toHaveLength(1);
    expect(logs.some((line) => /finish failed \(try/.test(line))).toBe(false);
    expect(logs.some((line) => /finish given up/.test(line))).toBe(false);
    // Nothing follows it, however long the clock runs.
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 10 * 60 * 1000);
    expect(fake.finishTries).toHaveLength(2);
  });

  it('gives up with one line when the minimal close is refused too: two calls, no loop', async () => {
    const { fake, logs, start } = answeredTurn();
    fake.failFinish(Number.POSITIVE_INFINITY, dbError('22P05'));
    const outcome = start();
    await vi.advanceTimersByTimeAsync(100);
    expect(outcome.value).not.toBeNull();
    expect(fake.finishTries).toHaveLength(2);
    expect(fake.finishes).toHaveLength(0);
    expect(logs.filter((line) => /request=41/.test(line) && /minimal close failed/.test(line))).toHaveLength(1);
    expect(logs.some((line) => /closed as failed \/ cli_error/.test(line))).toBe(false);
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 10 * 60 * 1000);
    expect(fake.finishTries).toHaveLength(2);
  });

  it('gives up the same way when the minimal close fails on the connection: it is one call, not a schedule', async () => {
    const { fake, logs, start } = answeredTurn();
    const seen = { tries: 0 };
    fake.rpc.finish = async () => {
      seen.tries += 1;
      throw seen.tries === 1 ? dbError('22P05') : dbDown();
    };
    const outcome = start();
    await vi.advanceTimersByTimeAsync(100);
    expect(outcome.value).not.toBeNull();
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 10 * 60 * 1000);
    expect(seen.tries).toBe(2);
    expect(logs.filter((line) => /minimal close failed/.test(line) && /connection refused/.test(line))).toHaveLength(1);
  });

  it('makes the minimal close as soon as a try is refused that way, when earlier tries failed on the connection', async () => {
    const { fake, clock, start } = answeredTurn();
    const original = fake.rpc.finish;
    const triedAt: number[] = [];
    fake.rpc.finish = async (args) => {
      triedAt.push(clock.now());
      if (triedAt.length <= 2) throw dbDown();
      if (triedAt.length === 3) throw dbError('22P05');
      return original(args);
    };
    const outcome = start();
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS);
    expect(outcome.value).not.toBeNull();
    // Tries at 0, 1 and 3 s; the minimal close in the same instant as the refusal, under the turn's own duration.
    expect(offsets(triedAt)).toEqual([0, 1000, 3000, 3000]);
    expect(fake.finishes).toEqual([minimalClose(20)]);
  });

  it.each([
    ['a statement cut at its time limit', dbError('57014', 'canceling statement due to statement timeout')],
    ['a serialization failure', dbError('40001')],
    ['an exception with no SQLSTATE of its own', dbError('P0001')],
    ['a connection failure with a SQLSTATE', dbError('08006', 'connection failure')],
    ['the server shutting down', dbError('57P01')],
    ['a socket that was reset', dbError('ECONNRESET', 'read ECONNRESET')],
    ['a database that cannot be reached', dbDown()],
  ])('still tries the finish again on the schedule after %s, and stores the whole answer', async (_what, failure) => {
    const { fake, logs, start } = answeredTurn();
    fake.failFinish(3, failure);
    const outcome = start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(outcome.value).toEqual({ state: 'done', errorCode: null });
    expect(offsets(fake.finishTries)).toEqual(RETRY_SCHEDULE.slice(0, 4));
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'done', content: 'the answer', errorCode: null, costUsd: 0.03, claudeSessionId: null });
    expect(fake.finishes[0]?.toolCalls).toHaveLength(RUNNER_STEPS + 1);
    expect(logs.some((line) => /finish refused by the database/.test(line))).toBe(false);
  });

  it('still reads a 22023 as a request that is already closed: one call, and no minimal close after it', async () => {
    const { fake, logs, start } = answeredTurn();
    fake.failFinish(Number.POSITIVE_INFINITY, dbRefusal('workspace_finish: request 41 is not claimed or cancelled (it is done)'));
    const outcome = start();
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(outcome.value).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishTries).toHaveLength(1);
    expect(logs.filter((line) => /request=41/.test(line) && /already closed/.test(line))).toHaveLength(1);
    expect(logs.some((line) => /finish refused by the database/.test(line))).toBe(false);
  });
});

describe('workspace_begin refused as a statement the database cannot take (ruling Z1, R2-5)', () => {
  useFakeClock();

  it.each([['22P05'], ['23505'], ['42883']])('goes straight to the close after a %s: one try, no wait, and nothing runs', async (code) => {
    const scripted = scriptedTurn([delta(10, 'never streamed'), result(20)]);
    const { fake, logs, deps } = turnHarness(scripted.turn);
    fake.failBegin(dbError(code));
    const outcome = outcomeOf(startTurn(deps, claimOf()));
    await vi.advanceTimersByTimeAsync(100);
    expect(outcome.value).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(fake.beginTries).toHaveLength(1);
    expect(scripted.inputs).toHaveLength(0);
    expect(fake.streams).toHaveLength(0);
    expect((fake.finishTries[0] ?? Number.NaN) - (fake.beginTries[0] ?? 0)).toBe(0);
    expect(fake.finishes).toEqual([minimalClose(0)]);
    expect(logs.filter((line) => /request=41/.test(line) && /begin refused by the database/.test(line))).toHaveLength(1);
    expect(logs.some((line) => /begin failed \(try/.test(line))).toBe(false);
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(fake.beginTries).toHaveLength(1);
    expect(fake.finishTries).toHaveLength(1);
  });

  it('keeps trying that close on the finish schedule when the database then cannot be reached, as the lost-reply rule does', async () => {
    const { fake, deps } = turnHarness(scriptedTurn([result(10)]).turn);
    fake.failBegin(dbError('22P05'));
    fake.failFinish(2);
    const outcome = outcomeOf(startTurn(deps, claimOf()));
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(outcome.value).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(fake.beginTries).toHaveLength(1);
    expect(offsets(fake.finishTries)).toEqual(RETRY_SCHEDULE.slice(0, 3));
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'failed', errorCode: 'cli_error', content: '' });
  });

  // That close is the minimal one already: refused as a statement, it is the "close that fails too".
  it('sends that close once when the database refuses it as a statement too: no second minimal close, one line, the sweep is left to close it', async () => {
    const { fake, logs, deps } = turnHarness(scriptedTurn([result(10)]).turn);
    fake.failBegin(dbError('22P05'));
    fake.failFinish(Number.POSITIVE_INFINITY, dbError('23514', 'violates check constraint'));
    const outcome = outcomeOf(startTurn(deps, claimOf()));
    await vi.advanceTimersByTimeAsync(100);
    expect(outcome.value).toEqual({ state: 'failed', errorCode: 'cli_error' });
    await vi.advanceTimersByTimeAsync(FINISH_RETRY_MS + 5000);
    expect(fake.finishTries).toHaveLength(1);
    expect(logs.filter((line) => /request=41/.test(line) && /minimal close was refused/.test(line) && /stale-claim sweep/.test(line))).toHaveLength(1);
    expect(logs.some((line) => /finish refused by the database/.test(line))).toBe(false);
  });

  it('still tries a begin again after a statement cut at its time limit', async () => {
    const scripted = scriptedTurn([delta(10, 'the answer'), result(20)]);
    const { fake, deps } = turnHarness(scripted.turn);
    fake.failBegin(dbError('57014', 'canceling statement due to statement timeout'), 2);
    const outcome = outcomeOf(startTurn(deps, claimOf()));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(outcome.value).toEqual({ state: 'done', errorCode: null });
    expect(offsets(fake.beginTries)).toEqual(RETRY_SCHEDULE.slice(0, 3));
    expect(fake.finishes[0]).toMatchObject({ state: 'done', content: 'the answer' });
  });
});

describe('the watchdog and a finish the database refused (ruling Z1, R2-5)', () => {
  useFakeClock();

  // The answer is complete 100 s in, and no heartbeat has succeeded since the start, so the watchdog
  // is due at 180 s. A finish that was being tried again would hold it until 210 s.
  it('is not held: the refused finish and its minimal close are over at once, and the process ends at 180 s', async () => {
    const scripted = scriptedTurn([delta(100, 'a long answer'), result(100_000)]);
    const { fake, logs, deps } = loopHarness(scripted.turn);
    fake.queue.push(claimOf());
    const exit: { code: number | null } = { code: null };
    void createRunner(deps)
      .run()
      .then((code) => {
        exit.code = code;
      });
    await vi.advanceTimersByTimeAsync(1000);
    fake.rpc.heartbeat = () => Promise.reject(dbDown());
    fake.failFinish(Number.POSITIVE_INFINITY, dbError('22P05'));
    await vi.advanceTimersByTimeAsync(DB_WATCHDOG_MS - 1000 - 1000);
    expect(fake.finishTries).toHaveLength(2);
    expect(exit.code).toBeNull();
    await vi.advanceTimersByTimeAsync(1000 + 100);
    expect(exit.code).toBe(1);
    expect(logs.some((line) => /watchdog/.test(line) && /held/.test(line))).toBe(false);
    expect(fake.finishTries).toHaveLength(2);
  });
});
