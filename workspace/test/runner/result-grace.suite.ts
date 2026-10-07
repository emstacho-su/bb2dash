/**
 * A CLI that stays after its `result` line (ruling V1, CR-5): it gets 10 s to exit, is killed, and
 * the result is kept; a turn that produced a result is never stored as `timeout`. Part of
 * runner.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { CLAUDE_CODE_VERSION, RESULT_EXIT_GRACE_MS, TURN_TIMEOUT_MS } from '../../src/config.js';
import { ALLOWED_TOOLS } from '../../src/hooks/gate-rules.js';
import { KILL_GRACE_MS, OUTPUT_CLOSE_MS, createCliTurn, type CliTurn, type CliTurnDeps } from '../../src/providers/claude-cli.js';
import type { ResultEvent, TurnInput } from '../../src/providers/types.js';
import { startTurn } from '../../src/turn.js';
import {
  CONVERSATION_ID,
  QUESTION,
  STORED_SESSION_ID,
  claimOf,
  collect,
  fakeSpawn,
  readFixtureLines,
  resultOf,
  textOf,
  type FakeProcessOptions,
} from '../helpers/fakes.js';
import { turnHarness, useFakeClock } from '../helpers/turn-harness.js';

type Line = Record<string, unknown>;

const TOKEN = 'not-a-real-token-used-by-the-tests';
/** Short stand-ins for the 10 s and the 1.5 s, so the suite runs on the real clock. */
const GRACE_MS = 60;
const KILL_MS = 30;
const OK = { code: 0, signal: null } as const;
const FAILED = { code: 1, signal: null } as const;

const lookup = readFixtureLines('claude-stream-lookup.jsonl');
const budgetStop = readFixtureLines('claude-stream-budget-stop.jsonl');
const resumeMissing = readFixtureLines('claude-stream-resume-missing.jsonl');

const init: Line = {
  type: 'system',
  subtype: 'init',
  session_id: STORED_SESSION_ID,
  tools: [...ALLOWED_TOOLS],
  mcp_servers: [
    { name: 'bb2dash', status: 'connected' },
    { name: 'rag', status: 'connected' },
  ],
  model: 'claude-haiku-4-5-20251001',
  permissionMode: 'dontAsk',
  apiKeySource: 'none',
  claude_code_version: CLAUDE_CODE_VERSION,
};
const answer: Line = {
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'The whole answer.' } },
  session_id: STORED_SESSION_ID,
  parent_tool_use_id: null,
};
const success: Line = { type: 'result', subtype: 'success', is_error: false, session_id: STORED_SESSION_ID, total_cost_usd: 0.01 };
const ANSWERED = [init, answer, success];

const input = (overrides: Partial<TurnInput> = {}): TurnInput => ({
  requestId: '41',
  conversationId: CONVERSATION_ID,
  model: 'haiku',
  prompt: QUESTION,
  history: [],
  claudeSessionId: null,
  budgetUsd: 1,
  ...overrides,
});

function harness(scripts: FakeProcessOptions[], overrides: Partial<CliTurnDeps> = {}) {
  const logs: string[] = [];
  const spawn = fakeSpawn(...scripts);
  const turn = createCliTurn({
    spawn: spawn.spawn,
    readSystemPrompt: () => 'You are read-only.',
    readOauthToken: () => TOKEN,
    baseEnv: { PATH: '/usr/bin' },
    log: (line) => logs.push(line),
    killGraceMs: KILL_MS,
    resultExitGraceMs: GRACE_MS,
    ...overrides,
  });
  return { turn, spawn, logs };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('the time a CLI gets to exit after its result line', () => {
  it('is 10 s, and with the kill sequence still far inside the 8-minute limit', () => {
    expect(RESULT_EXIT_GRACE_MS).toBe(10000);
    expect(RESULT_EXIT_GRACE_MS + KILL_GRACE_MS + OUTPUT_CLOSE_MS).toBeLessThan(TURN_TIMEOUT_MS);
  });

  // Every other case here hands the turn a short stand-in. This one hands it none, so it is the
  // provider's own default that is read: the constant above, to the millisecond.
  it('is the 10 s itself when the turn is built with no time of its own: nothing at 9.999 s, SIGTERM at 10 s', async () => {
    vi.useFakeTimers();
    try {
      const h = harness([{ lines: ANSWERED, exit: OK, hang: true }], { resultExitGraceMs: undefined });
      const pending = collect(h.turn(input(), new AbortController().signal));
      // The whole stream is read here, the result line included, at no cost on the clock.
      await vi.advanceTimersByTimeAsync(0);
      const kills = h.spawn.processes[0]!.kills;
      await vi.advanceTimersByTimeAsync(RESULT_EXIT_GRACE_MS - 1);
      expect(kills).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(kills.map((kill) => kill.signal)).toEqual(['SIGTERM']);
      const events = await pending;
      expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, reported: true });
      expect(textOf(events)).toBe('The whole answer.');
      expect(h.logs.filter((line) => /did not exit within 10 s of its result line/.test(line))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('kills a CLI that is still there after that time, and keeps the result', { timeout: 3000 }, async () => {
    const h = harness([{ lines: ANSWERED, exit: OK, hang: true }]);
    const started = Date.now();
    const events = await collect(h.turn(input(), new AbortController().signal));
    const kills = h.spawn.processes[0]!.kills;
    expect(kills.map((kill) => kill.signal)).toEqual(['SIGTERM']);
    expect(kills[0]!.at - started).toBeGreaterThanOrEqual(GRACE_MS - 5);
    expect(textOf(events)).toBe('The whole answer.');
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    expect(resultOf(events)).toEqual({
      type: 'result',
      ok: true,
      errorCode: null,
      costUsd: 0.01,
      claudeSessionId: STORED_SESSION_ID,
      model: 'claude-haiku-4-5-20251001',
      reported: true,
    });
    const said = h.logs.filter((line) => /did not exit/.test(line));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/request=41/);
    expect(said[0]).toMatch(/result is kept/);
  });

  // Ruling X1. The kill is the runner's own and has its line; the exit on SIGTERM it causes is not a second event.
  it('does not also log a CLI it killed after the result line as an exit on a signal', { timeout: 3000 }, async () => {
    const h = harness([{ lines: ANSWERED, exit: OK, hang: true, stderr: 'Terminated' }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    expect(h.spawn.processes[0]!.kills.map((kill) => kill.signal)).toEqual(['SIGTERM']);
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, reported: true });
    expect(h.logs.filter((line) => /did not exit/.test(line))).toHaveLength(1);
    expect(h.logs.filter((line) => /the CLI exited/.test(line))).toEqual([]);
  });

  // The line the guard keeps back is still written for an exit the runner did not cause.
  it('still logs a CLI that exits non-zero by itself after its result line', async () => {
    const h = harness([{ lines: budgetStop, exit: FAILED, stderr: 'the budget is used up' }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    expect(h.spawn.processes[0]!.kills).toEqual([]);
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'budget_exceeded', reported: true });
    const said = h.logs.filter((line) => /the CLI exited/.test(line));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/request=41/);
    expect(said[0]).toMatch(/the CLI exited 1: the budget is used up/);
    expect(h.logs.some((line) => /did not exit/.test(line))).toBe(false);
  });

  it('kills nothing when the CLI exits by itself inside that time', { timeout: 3000 }, async () => {
    const h = harness([{ lines: ANSWERED, exit: OK }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    await wait(GRACE_MS + KILL_MS + 30);
    expect(h.spawn.processes[0]!.kills).toEqual([]);
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, reported: true });
    expect(h.logs.some((line) => /did not exit/.test(line))).toBe(false);
  });

  it('goes on to SIGKILL and closes the output when the CLI ignores SIGTERM and its pipe stays open', { timeout: 3000 }, async () => {
    const h = harness([{ lines: ANSWERED, exit: OK, hang: true, ignoreSigterm: true, holdsOutput: true }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    expect(h.spawn.processes[0]!.kills.map((kill) => kill.signal)).toEqual(['SIGTERM', 'SIGKILL', 'closeOutput']);
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, costUsd: 0.01 });
    expect(textOf(events)).toBe('The whole answer.');
  });

  it('keeps the whole lookup recording when the CLI stays after it', { timeout: 3000 }, async () => {
    const h = harness([{ lines: lookup, exit: OK, hang: true }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, costUsd: 0.038524, reported: true });
    expect(textOf(events)).toBe((lookup[lookup.length - 1] as { result: string }).result);
    expect(events.flatMap((event) => (event.type === 'tool' ? [event.call.ok] : [])).filter(Boolean)).toHaveLength(2);
  });

  it('keeps an error result as it was reported: a budget stop that stays is budget_exceeded, not cli_error', { timeout: 3000 }, async () => {
    const h = harness([{ lines: budgetStop, exit: FAILED, hang: true }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'budget_exceeded', costUsd: 0.021355, reported: true });
  });

  it('still makes the one recovery: a resume that found no session and then stayed is started again as fresh', { timeout: 3000 }, async () => {
    const h = harness([
      { lines: resumeMissing, exit: FAILED, hang: true },
      { lines: ANSWERED, exit: OK },
    ]);
    const events = await collect(h.turn(input({ claudeSessionId: STORED_SESSION_ID }), new AbortController().signal));
    expect(h.spawn.calls).toHaveLength(2);
    expect(h.spawn.calls[0]!.argv).toContain('--resume');
    expect(h.spawn.calls[1]!.argv).toContain('--session-id');
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null });
  });

  it("keeps the result when the runner's abort arrives while the CLI is being given its time", { timeout: 3000 }, async () => {
    const h = harness([{ lines: ANSWERED, exit: OK, hang: true }], { resultExitGraceMs: 2000 });
    const controller = new AbortController();
    const pending = collect(h.turn(input(), controller.signal));
    await wait(40);
    controller.abort();
    const events = await pending;
    expect(h.spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, costUsd: 0.01, reported: true });
  });

  it('says a result was not reported when the turn was cut before its result line', { timeout: 3000 }, async () => {
    const h = harness([{ lines: [init, answer], exit: OK, hang: true }]);
    const controller = new AbortController();
    const pending = collect(h.turn(input(), controller.signal));
    await wait(40);
    controller.abort();
    const events = await pending;
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error', reported: false });
  });

  it('says a result was not reported when the process ends with no result line', async () => {
    const h = harness([{ lines: [init, answer], exit: FAILED }]);
    const events = await collect(h.turn(input(), new AbortController().signal));
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error', reported: false });
  });
});

describe('a turn that produced a result and the 8-minute limit', () => {
  useFakeClock();

  const untilAborted = (signal: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener('abort', () => resolve(), { once: true });
    });

  /** A provider whose answer is complete, and whose process is still there when the runner stops the turn. */
  function lingering(result: Partial<ResultEvent>): CliTurn {
    return async function* (_input, signal) {
      yield { type: 'delta', text: 'The whole answer.' };
      await untilAborted(signal);
      yield { type: 'result', ok: true, errorCode: null, costUsd: 0.02, claudeSessionId: STORED_SESSION_ID, model: 'claude-haiku-4-5-20251001', ...result };
    };
  }

  it('is never stored as timeout: the limit falling on a reported result keeps the answer', async () => {
    const { fake, deps } = turnHarness(lingering({ reported: true }));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]).toMatchObject({ state: 'done', errorCode: null, content: 'The whole answer.', costUsd: 0.02 });
  });

  it('keeps a reported error result under its own code, not timeout', async () => {
    const { fake, deps } = turnHarness(lingering({ reported: true, ok: false, errorCode: 'budget_exceeded' }));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'budget_exceeded' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'budget_exceeded' });
  });

  it('is still stored as timeout when the limit cut the turn before any result', async () => {
    const { fake, deps } = turnHarness(lingering({ reported: false, ok: false, errorCode: 'cli_error' }));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'timeout' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'timeout', content: 'The whole answer.' });
  });

  it.each([['cancelled'], ['stale_claim']] as const)("lets the runner's other stops stand over a reported result: %s", async (code) => {
    const { fake, deps } = turnHarness(lingering({ reported: true }));
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    handle.stop(code);
    await vi.advanceTimersByTimeAsync(100);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: code });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: code });
  });
});
