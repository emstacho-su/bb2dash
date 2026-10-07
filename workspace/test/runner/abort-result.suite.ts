/**
 * A `result` line the provider reads after the runner aborted the turn (ruling Z1, R2-1): it is not
 * a reported result, and the turn is stored under the abort's own code. A result line read before
 * the abort still stands, as ruling V1 (CR-5) has it. Part of runner.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { CLAUDE_CODE_VERSION, TURN_TIMEOUT_MS } from '../../src/config.js';
import { ALLOWED_TOOLS } from '../../src/hooks/gate-rules.js';
import { createCliTurn, type CliTurnDeps } from '../../src/providers/claude-cli.js';
import type { TurnInput } from '../../src/providers/types.js';
import { startTurn } from '../../src/turn.js';
import {
  CONVERSATION_ID,
  QUESTION,
  STORED_SESSION_ID,
  claimOf,
  collect,
  fakeSpawn,
  resultOf,
  textOf,
  type FakeProcessOptions,
} from '../helpers/fakes.js';
import { turnHarness, useFakeClock } from '../helpers/turn-harness.js';

type Line = Record<string, unknown>;

const TOKEN = 'not-a-real-token-used-by-the-tests';
const OK = { code: 0, signal: null } as const;

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
const textDelta = (text: string): Line => ({
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  session_id: STORED_SESSION_ID,
  parent_tool_use_id: null,
});
const firstPart = textDelta('The first part.');
const lateDelta = textDelta(' And the rest, written while the CLI was being killed.');
const success: Line = { type: 'result', subtype: 'success', is_error: false, session_id: STORED_SESSION_ID, total_cost_usd: 0.01 };
/** What a CLI writes when its turn is cut: an error result, which reads as cli_error. */
const cutShort: Line = { type: 'result', subtype: 'error_during_execution', is_error: true, session_id: STORED_SESSION_ID, total_cost_usd: 0.004 };
const budgetStop: Line = { type: 'result', subtype: 'error_max_budget_usd', is_error: true, session_id: STORED_SESSION_ID, total_cost_usd: 0.02 };

const input = (): TurnInput => ({
  requestId: '41',
  conversationId: CONVERSATION_ID,
  model: 'haiku',
  prompt: QUESTION,
  history: [],
  claudeSessionId: null,
  budgetUsd: 1,
});

function cliTurn(script: FakeProcessOptions, overrides: Partial<CliTurnDeps> = {}) {
  const logs: string[] = [];
  const spawn = fakeSpawn(script);
  const turn = createCliTurn({
    spawn: spawn.spawn,
    readSystemPrompt: () => 'You are read-only.',
    readOauthToken: () => TOKEN,
    baseEnv: { PATH: '/usr/bin' },
    log: (line) => logs.push(line),
    ...overrides,
  });
  return { turn, spawn, logs };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("the CLI turn and a result line read after the runner's abort (ruling Z1, R2-1)", () => {
  /** Short stand-ins for the 1.5 s and the 10 s, so these run on the real clock. */
  const SHORT = { killGraceMs: 30, resultExitGraceMs: 2000 };

  /** Run the script, abort once what it wrote first has been read, and collect the turn's events. */
  async function abortedTurn(script: FakeProcessOptions) {
    const h = cliTurn(script, SHORT);
    const controller = new AbortController();
    const pending = collect(h.turn(input(), controller.signal));
    await wait(20);
    controller.abort();
    return { ...h, events: await pending };
  }

  it.each([
    ['a success result', success],
    ['an error result', cutShort],
    ['a budget stop', budgetStop],
  ])('does not report %s the CLI wrote while it was being killed: the code is the runner\'s to give', { timeout: 3000 }, async (_what, line) => {
    const { events, spawn } = await abortedTurn({ lines: [init, firstPart], exit: OK, hang: true, linesOnKill: [line] });
    expect(spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(events.filter((event) => event.type === 'result')).toHaveLength(1);
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error', reported: false });
  });

  // The case the review named: the last chunk holds deltas and a success result, and is read after the abort.
  it('takes nothing from a last chunk read after the abort: its deltas are no answer text, its success result no result', { timeout: 3000 }, async () => {
    const { events } = await abortedTurn({ lines: [init, firstPart], exit: OK, hang: true, linesOnKill: [lateDelta, success] });
    expect(textOf(events)).toBe('The first part.');
    expect(resultOf(events)).toMatchObject({ ok: false, errorCode: 'cli_error', reported: false });
  });

  it.each([
    ['a success result', success, { ok: true, errorCode: null, costUsd: 0.01 }],
    ['a budget stop', budgetStop, { ok: false, errorCode: 'budget_exceeded', costUsd: 0.02 }],
    ['an error result', cutShort, { ok: false, errorCode: 'cli_error', costUsd: 0.004 }],
  ])('still reports %s read before the abort, as it was written', { timeout: 3000 }, async (_what, line, expected) => {
    const { events } = await abortedTurn({ lines: [init, firstPart, line], exit: OK, hang: true });
    expect(textOf(events)).toBe('The first part.');
    expect(resultOf(events)).toMatchObject({ ...expected, reported: true });
  });

  it('keeps a result read before the abort when more output follows the kill', { timeout: 3000 }, async () => {
    const { events } = await abortedTurn({ lines: [init, firstPart, success], exit: OK, hang: true, linesOnKill: [lateDelta] });
    expect(textOf(events)).toBe('The first part.');
    expect(resultOf(events)).toMatchObject({ ok: true, errorCode: null, reported: true });
  });
});

describe('what a turn is stored as when its result line is read after the abort (ruling Z1, R2-1)', () => {
  useFakeClock();

  function stored(script: FakeProcessOptions, overrides: Partial<CliTurnDeps> = {}) {
    const cli = cliTurn(script, overrides);
    return { ...turnHarness(cli.turn), spawn: cli.spawn };
  }

  // The case the review named, at the 8-minute limit: before the fix this turn was stored `done` with half an answer.
  it('is timeout, never done, when the last chunk (deltas and a success result) is read after the limit killed the CLI', async () => {
    const { fake, spawn, deps } = stored({ lines: [init, firstPart], exit: OK, hang: true, linesOnKill: [lateDelta, success] });
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS - 1000);
    expect(spawn.processes[0]!.kills).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'timeout' });
    expect(spawn.processes[0]!.kills[0]?.signal).toBe('SIGTERM');
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'timeout', content: 'The first part.' });
  });

  it.each([
    ['an error result', cutShort],
    ['a budget stop', budgetStop],
  ])('is timeout, not the code of %s the CLI wrote while the limit was killing it', async (_what, line) => {
    const { fake, deps } = stored({ lines: [init, firstPart], exit: OK, hang: true, linesOnKill: [line] });
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 1000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'timeout' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'timeout', content: 'The first part.' });
  });

  it.each([
    ['a success result', [lateDelta, success]],
    ['an error result', [cutShort]],
  ])('is cancelled when Stop killed the CLI and %s is read after it', async (_what, linesOnKill) => {
    const { fake, deps } = stored({ lines: [init, firstPart], exit: OK, hang: true, linesOnKill });
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    fake.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cancelled' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cancelled', content: 'The first part.' });
  });

  it.each([
    ['a success result', [lateDelta, success]],
    ['an error result', [cutShort]],
  ])('is stale_claim when a shutdown killed the CLI and %s is read after it', async (_what, linesOnKill) => {
    const { fake, deps } = stored({ lines: [init, firstPart], exit: OK, hang: true, linesOnKill });
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    handle.stop('stale_claim');
    await vi.advanceTimersByTimeAsync(5000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'stale_claim' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'stale_claim', content: 'The first part.' });
  });

  // The other order (ruling V1, CR-5): the result line was read, the CLI stayed, and the limit fell
  // while it was being given its time to exit. That time is not an abort of the turn.
  describe('and when the result line was read before the limit fell', () => {
    /** A time to exit longer than the turn's limit, so the limit falls inside it. */
    const STAYS = { resultExitGraceMs: TURN_TIMEOUT_MS + 60_000 };

    it('keeps a success result: the turn is done with its whole answer', async () => {
      const { fake, deps } = stored({ lines: [init, firstPart, success], exit: OK, hang: true, linesOnKill: [lateDelta] }, STAYS);
      const handle = startTurn(deps, claimOf());
      await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 5000);
      expect(await handle.done).toEqual({ state: 'done', errorCode: null });
      expect(fake.finishes[0]).toMatchObject({ state: 'done', errorCode: null, content: 'The first part.', costUsd: 0.01 });
    });

    it('keeps an error result under its own code, not timeout', async () => {
      const { fake, deps } = stored({ lines: [init, firstPart, budgetStop], exit: OK, hang: true }, STAYS);
      const handle = startTurn(deps, claimOf());
      await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS + 5000);
      expect(await handle.done).toEqual({ state: 'failed', errorCode: 'budget_exceeded' });
      expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'budget_exceeded', costUsd: 0.02 });
    });
  });
});
