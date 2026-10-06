import { describe, expect, it, vi } from 'vitest';

import {
  CANCEL_POLL_MS,
  CONTENT_MAX_CHARS,
  DB_WATCHDOG_MS,
  HEARTBEAT_MS,
  NO_CAP_SENTENCE,
  POLL_INTERVAL_MS,
  STREAM_DELTA_MAX_CHARS,
  STREAM_FLUSH_MS,
  TOOL_CALLS_MAX,
  TURN_TIMEOUT_MS,
} from '../src/config.js';
import { ProviderNotConfiguredError } from '../src/errors.js';
import type { CliTurn } from '../src/providers/claude-cli.js';
import type { StoredToolCall, TurnEvent } from '../src/providers/types.js';
import { SHUTDOWN_GRACE_MS, createRunner, main } from '../src/runner.js';
import { startTurn } from '../src/turn.js';
import { ABORTED, STORED_SESSION_ID, claimOf, delta, result, scriptedTurn, type FakeRpc, type Step } from './helpers/fakes.js';
import { loopHarness as loop, turnHarness as harness, useFakeClock } from './helpers/turn-harness.js';

// The rest of the runner's behaviour, in files small enough to read: each registers its own suites.
import './runner/cli-turn.suite.js';
import './runner/closing.suite.js';
import './runner/db.suite.js';
import './runner/db-tls.suite.js';
import './runner/health.suite.js';
import './runner/replay.suite.js';
import './runner/result-grace.suite.js';

const call = (n: number, ok = true): StoredToolCall => ({ tool: 'search_materials', query: `query ${n}`, scope: null, ok });
const tool = (at: number, id: string, stored: StoredToolCall): Step => ({ at, event: { type: 'tool', id, call: stored } });
const textSent = (fake: FakeRpc): Array<[number, string]> => fake.streams.filter((s) => s.delta !== '').map((s) => [s.seq, s.delta]);
const pollsSent = (fake: FakeRpc) => fake.streams.filter((s) => s.delta === '');

describe('one turn', () => {
  useFakeClock();

  it('routes, begins, flushes every 250 ms with seq from 1 rising by 1, and finishes', async () => {
    const scripted = scriptedTurn([delta(100, 'Hello '), delta(200, 'world'), delta(300, ' again'), result(600)]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });

    expect(fake.begins).toEqual([{ requestId: '41', tier: 'low', provider: 'claude-cli', model: 'haiku' }]);
    expect(textSent(fake)).toEqual([
      [1, 'Hello world'],
      [2, ' again'],
    ]);
    const flushTimes = fake.streams.filter((s) => s.delta !== '').map((s) => s.at - (scripted.startedAt ?? 0));
    expect(flushTimes).toEqual([STREAM_FLUSH_MS, 2 * STREAM_FLUSH_MS]);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({
      requestId: '41',
      state: 'done',
      content: 'Hello world again',
      toolCalls: [],
      errorCode: null,
      costUsd: 0.038524,
      claudeSessionId: STORED_SESSION_ID,
      model: 'claude-haiku-4-5-20251001',
    });
    expect(fake.finishes[0]?.durationMs).toBeGreaterThanOrEqual(600);
  });

  it('hands the provider the claim: the prompt, the history, the stored session id and the budget', async () => {
    const scripted = scriptedTurn([result(10)]);
    const { deps } = harness(scripted.turn, { budgetUsd: 0.5 });
    const history = [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'answer' },
    ] as const;
    const handle = startTurn(deps, claimOf({ history: [...history], claudeSessionId: STORED_SESSION_ID }));
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(scripted.inputs[0]).toMatchObject({
      requestId: '41',
      model: 'haiku',
      prompt: claimOf().prompt,
      history,
      claudeSessionId: STORED_SESSION_ID,
      budgetUsd: 0.5,
    });
  });

  it.each([
    ['Draft a two-week study plan for ECN.304 from the lecture slides', null, 'high', 'opus'],
    ["Explain how a systems analyst's role differs from a project manager's, using the IST.352 slides", null, 'mid', 'sonnet'],
    ['Go on', 'high', 'high', 'opus'],
    ['Go on', null, 'mid', 'sonnet'],
  ] as const)('routes %j (prior tier %s) to %s and begins with the %s alias', async (prompt, priorTier, tier, model) => {
    const { fake, deps } = harness(scriptedTurn([result(10)]).turn);
    const handle = startTurn(deps, claimOf({ prompt, priorTier }));
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(fake.begins[0]).toMatchObject({ tier, provider: 'claude-cli', model });
  });

  it('sends what is left of the text before it finishes', async () => {
    const { fake, deps } = harness(scriptedTurn([delta(10, 'short answer'), result(20)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(textSent(fake)).toEqual([[1, 'short answer']]);
    expect(fake.finishes[0]?.content).toBe('short answer');
  });

  it('splits a delta over 16000 characters before it sends, one seq per piece', async () => {
    const long = 'a'.repeat(STREAM_DELTA_MAX_CHARS * 2 + 500);
    const { fake, deps } = harness(scriptedTurn([delta(10, long), result(400)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    await handle.done;
    const sent = textSent(fake);
    expect(sent.map(([seq]) => seq)).toEqual([1, 2, 3]);
    expect(sent.map(([, text]) => text.length)).toEqual([STREAM_DELTA_MAX_CHARS, STREAM_DELTA_MAX_CHARS, 500]);
    expect(sent.map(([, text]) => text).join('')).toBe(long);
  });

  it('counts characters, not UTF-16 units, and never cuts a character in half', async () => {
    const astral = '\u{1F4D8}'.repeat(STREAM_DELTA_MAX_CHARS + 10);
    const { fake, deps } = harness(scriptedTurn([delta(10, astral), result(400)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    await handle.done;
    const sent = textSent(fake).map(([, text]) => text);
    expect(sent.map((text) => [...text].length)).toEqual([STREAM_DELTA_MAX_CHARS, 10]);
    for (const piece of sent) expect(piece).toBe(Buffer.from(piece, 'utf8').toString('utf8'));
    expect(sent.join('')).toBe(astral);
  });

  it('cuts the content to 100000 characters before it finishes and logs the cut', async () => {
    const steps = Array.from({ length: 11 }, (_, i) => delta(10 + i, String(i % 10).repeat(10_000)));
    const { fake, logs, deps } = harness(scriptedTurn([...steps, result(400)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(3000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]?.content).toHaveLength(CONTENT_MAX_CHARS);
    expect(fake.finishes[0]?.content.endsWith('9')).toBe(true);
    expect(logs.some((line) => /request=41/.test(line) && /content cut/.test(line) && /110000/.test(line))).toBe(true);
  });

  it('stores at most 20 tool calls, the first 20 in call order, logs the cut and still finishes done', async () => {
    const steps = Array.from({ length: TOOL_CALLS_MAX + 1 }, (_, i) => tool(10 + i, `t${i + 1}`, call(i + 1)));
    const { fake, logs, deps } = harness(scriptedTurn([...steps, delta(50, 'done'), result(60)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    const storedCalls = fake.finishes[0]?.toolCalls ?? [];
    expect(storedCalls).toHaveLength(TOOL_CALLS_MAX);
    expect(storedCalls.map((c) => c.query)).toEqual(Array.from({ length: TOOL_CALLS_MAX }, (_, i) => `query ${i + 1}`));
    expect(logs.some((line) => /request=41/.test(line) && /tool calls/.test(line) && /dropped 1\b/.test(line))).toBe(true);
  });

  it('keeps a call in its place when its result arrives later, with failed and denied calls stored too', async () => {
    const scripted = scriptedTurn([
      tool(10, 'a', call(1, false)),
      tool(20, 'b', call(2, false)),
      tool(30, 'c', call(3, false)),
      tool(40, 'b', call(2, true)),
      tool(50, 'a', call(1, true)),
      result(60),
    ]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    await handle.done;
    expect(fake.finishes[0]?.toolCalls).toEqual([call(1, true), call(2, true), call(3, false)]);
    for (const stored of fake.finishes[0]?.toolCalls ?? []) expect(Object.keys(stored)).toEqual(['tool', 'query', 'scope', 'ok']);
  });

  it('passes the model id the stream named, and null when it named none', async () => {
    const named = harness(scriptedTurn([result(10, { model: 'claude-opus-5-5' })]).turn);
    const unnamed = harness(scriptedTurn([result(10, { model: null })]).turn);
    const first = startTurn(named.deps, claimOf());
    const second = startTurn(unnamed.deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first.done, second.done]);
    expect(named.fake.finishes[0]?.model).toBe('claude-opus-5-5');
    expect(unnamed.fake.finishes[0]?.model).toBeNull();
  });

  it("passes the stream's total_cost_usd as reported, never a sum", async () => {
    const { fake, deps } = harness(scriptedTurn([result(10, { costUsd: 0.4321 })]).turn);
    const first = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await first.done;
    const second = startTurn(deps, claimOf({ requestId: '42' }));
    await vi.advanceTimersByTimeAsync(100);
    await second.done;
    expect(fake.finishes.map((f) => f.costUsd)).toEqual([0.4321, 0.4321]);
    const none = harness(scriptedTurn([result(10, { costUsd: null })]).turn);
    const third = startTurn(none.deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await third.done;
    expect(none.fake.finishes[0]?.costUsd).toBeNull();
  });

  it('stores a failed result under its own code, with the text so far', async () => {
    const scripted = scriptedTurn([delta(10, 'Looking'), result(20, { ok: false, errorCode: 'budget_exceeded', costUsd: 0.0214 })]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'budget_exceeded' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'budget_exceeded', content: 'Looking', costUsd: 0.0214 });
  });

  it.each([['usage_limit'], ['sign_in_expired'], ['cli_error']] as const)('stores %s as the provider reported it', async (code) => {
    const { fake, deps } = harness(scriptedTurn([result(10, { ok: false, errorCode: code })]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: code });
  });

  it('stores cli_error for a failed result with no code and for a provider that ends with no result', async () => {
    const noCode = harness(scriptedTurn([result(10, { ok: false, errorCode: null })]).turn);
    const silent: CliTurn = async function* () {
      yield { type: 'delta', text: 'half' } satisfies TurnEvent;
    };
    const noResult = harness(silent);
    const first = startTurn(noCode.deps, claimOf());
    const second = startTurn(noResult.deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([first.done, second.done]);
    expect(noCode.fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cli_error' });
    expect(noResult.fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cli_error', content: 'half', claudeSessionId: null, model: null });
  });

  it('stores provider_not_configured for a stub provider and cli_error for any other throw', async () => {
    const stub: CliTurn = () => {
      throw new ProviderNotConfiguredError('ollama');
    };
    const broken: CliTurn = async function* () {
      yield { type: 'delta', text: 'x' } satisfies TurnEvent;
      throw new Error('spawn claude ENOENT');
    };
    const first = harness(stub);
    const second = harness(broken);
    const a = startTurn(first.deps, claimOf());
    const b = startTurn(second.deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    expect(await a.done).toEqual({ state: 'failed', errorCode: 'provider_not_configured' });
    expect(await b.done).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(first.fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'provider_not_configured', content: '' });
    expect(second.logs.some((line) => /request=41/.test(line) && /ENOENT/.test(line))).toBe(true);
  });

  it('never retries a failed turn on another model', async () => {
    const scripted = scriptedTurn([result(10, { ok: false, errorCode: 'usage_limit' })]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf({ prompt: 'Draft a study plan' }));
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(scripted.inputs).toHaveLength(1);
    expect(fake.begins).toHaveLength(1);
  });
});

describe('Stop, the time limit and the no-cap sentence', () => {
  useFakeClock();

  it('stops within 2 s of a Stop pressed while text is streaming and stores cancelled', async () => {
    const steps = Array.from({ length: 200 }, (_, i) => delta(100 * (i + 1), `word${i} `));
    const scripted = scriptedTurn(steps);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    const stoppedAt = Date.now();
    fake.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cancelled' });
    expect(scripted.abortedAt).not.toBeNull();
    expect((scripted.abortedAt ?? Infinity) - stoppedAt).toBeLessThanOrEqual(2000);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cancelled' });
    expect(fake.finishes[0]?.content.startsWith('word0 word1 ')).toBe(true);
  });

  it('asks with an empty delta when no text was flushed for 2 s, which sends nothing and uses no seq', async () => {
    const scripted = scriptedTurn([delta(100, 'Let me look. '), tool(200, 't1', call(1, false)), delta(9000, 'Found it.'), result(9100)]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(10_000);
    await handle.done;
    expect(textSent(fake)).toEqual([
      [1, 'Let me look. '],
      [2, 'Found it.'],
    ]);
    const polls = pollsSent(fake);
    expect(polls.length).toBeGreaterThanOrEqual(3);
    const times = fake.streams.map((s) => s.at);
    for (let i = 1; i < times.length; i += 1) expect((times[i] ?? 0) - (times[i - 1] ?? 0)).toBeLessThanOrEqual(CANCEL_POLL_MS + STREAM_FLUSH_MS);
  });

  it('stops within 4 s of a Stop pressed during a tool call, when no text is flowing', async () => {
    const scripted = scriptedTurn([delta(100, 'Let me look. '), tool(200, 't1', call(1, false))]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(3000);
    const stoppedAt = Date.now();
    fake.cancel();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cancelled' });
    expect((scripted.abortedAt ?? Infinity) - stoppedAt).toBeLessThanOrEqual(4000);
    expect(fake.finishes[0]).toMatchObject({ errorCode: 'cancelled', content: 'Let me look. ', toolCalls: [call(1, false)] });
  });

  it('kills a turn at 8 minutes and stores timeout', async () => {
    const scripted = scriptedTurn([delta(100, 'thinking about it')]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(TURN_TIMEOUT_MS - 1000);
    expect(fake.finishes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'timeout' });
    expect((scripted.abortedAt ?? 0) - (scripted.startedAt ?? 0)).toBe(TURN_TIMEOUT_MS);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'timeout', content: 'thinking about it' });
  });

  it('ends a turn as stale_claim when the runner itself stops it', async () => {
    const scripted = scriptedTurn([delta(100, 'part')]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    handle.stop('stale_claim');
    await vi.advanceTimersByTimeAsync(100);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'stale_claim' });
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'stale_claim', content: 'part' });
  });

  it('keeps the first reason when two stops race', async () => {
    const scripted = scriptedTurn([delta(100, 'part')]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    fake.cancel();
    await vi.advanceTimersByTimeAsync(2500);
    handle.stop('stale_claim');
    await vi.advanceTimersByTimeAsync(100);
    expect(await handle.done).toEqual({ state: 'failed', errorCode: 'cancelled' });
  });

  it('appends the no-cap sentence as the last line only when the cap does not hold', async () => {
    const holds = harness(scriptedTurn([delta(10, 'The answer.'), result(20)]).turn, { budgetCapHolds: true });
    const open = harness(scriptedTurn([delta(10, 'The answer.'), result(20)]).turn, { budgetCapHolds: false });
    const a = startTurn(holds.deps, claimOf());
    const b = startTurn(open.deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([a.done, b.done]);
    expect(holds.fake.finishes[0]?.content).toBe('The answer.');
    expect(holds.fake.finishes[0]?.content).not.toContain(NO_CAP_SENTENCE);
    const lines = (open.fake.finishes[0]?.content ?? '').split('\n');
    expect(lines[lines.length - 1]).toBe(NO_CAP_SENTENCE);
    expect(open.fake.finishes[0]?.content.startsWith('The answer.')).toBe(true);
    expect(textSent(open.fake)).toEqual([[1, 'The answer.']]);
  });

  it('keeps the no-cap sentence as the last line of a cut answer', async () => {
    const steps = Array.from({ length: 11 }, (_, i) => delta(10 + i, 'z'.repeat(10_000)));
    const open = harness(scriptedTurn([...steps, result(400)]).turn, { budgetCapHolds: false });
    const handle = startTurn(open.deps, claimOf());
    await vi.advanceTimersByTimeAsync(3000);
    await handle.done;
    const content = open.fake.finishes[0]?.content ?? '';
    expect(content.length).toBeLessThanOrEqual(CONTENT_MAX_CHARS);
    expect(content.endsWith(`\n${NO_CAP_SENTENCE}`)).toBe(true);
  });
});

describe('a turn and the database', () => {
  useFakeClock();

  it('does not run the provider when the request is no longer claimed at begin', async () => {
    const scripted = scriptedTurn([result(10)]);
    const { fake, logs, deps } = harness(scripted.turn);
    fake.failBegin();
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    expect(await handle.done).toEqual({ state: 'skipped', errorCode: null });
    expect(scripted.inputs).toHaveLength(0);
    expect(fake.finishes).toHaveLength(0);
    expect(logs.some((line) => /request=41/.test(line) && /begin/.test(line))).toBe(true);
  });

  it('tries workspace_finish again after a failure', async () => {
    const { fake, deps } = harness(scriptedTurn([delta(10, 'ok'), result(20)]).turn);
    fake.failFinish(2);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes).toHaveLength(1);
  });

  it('keeps a turn going when one stream call fails: the stored row is the record', async () => {
    const scripted = scriptedTurn([delta(100, 'one '), delta(400, 'two'), result(600)]);
    const { fake, logs, deps } = harness(scripted.turn);
    const original = fake.rpc.stream;
    let failed = false;
    fake.rpc.stream = async (requestId, seq, text) => {
      if (!failed && text !== '') {
        failed = true;
        throw new Error('statement timeout');
      }
      return original(requestId, seq, text);
    };
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(2000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]?.content).toBe('one two');
    expect(logs.some((line) => /stream/.test(line) && /statement timeout/.test(line))).toBe(true);
  });

  it('removes NUL characters, which the database cannot store', async () => {
    const { fake, deps } = harness(scriptedTurn([delta(10, 'a\u0000b'), result(20)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(fake.finishes[0]?.content).toBe('ab');
    expect(textSent(fake)).toEqual([[1, 'ab']]);
  });

  it('passes a session id only when the provider reported one', async () => {
    const withId = harness(scriptedTurn([result(10)]).turn);
    const without = harness(scriptedTurn([result(10, { ok: false, errorCode: 'cli_error', claudeSessionId: null })]).turn);
    const a = startTurn(withId.deps, claimOf());
    const b = startTurn(without.deps, claimOf());
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([a.done, b.done]);
    expect(withId.fake.finishes[0]?.claudeSessionId).toBe(STORED_SESSION_ID);
    expect(without.fake.finishes[0]?.claudeSessionId).toBeNull();
  });

  it('hands back the stored session id when the provider reported none, so the conversation keeps its session', async () => {
    const nothingRan = harness(scriptedTurn([result(10, { ok: false, errorCode: 'sign_in_expired', claudeSessionId: null })]).turn);
    const handle = startTurn(nothingRan.deps, claimOf({ claudeSessionId: STORED_SESSION_ID }));
    await vi.advanceTimersByTimeAsync(100);
    await handle.done;
    expect(nothingRan.fake.finishes[0]).toMatchObject({ errorCode: 'sign_in_expired', claudeSessionId: STORED_SESSION_ID });
  });

  it('keeps the session id and the model of a turn the runner stopped', async () => {
    const scripted = scriptedTurn([delta(100, 'part')]);
    const { fake, deps } = harness(scripted.turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(500);
    fake.cancel();
    await vi.advanceTimersByTimeAsync(3000);
    await handle.done;
    expect(fake.finishes[0]).toMatchObject({ errorCode: 'cancelled', claudeSessionId: ABORTED.claudeSessionId, model: ABORTED.model });
  });
});

describe('the loop', () => {
  useFakeClock();

  it('polls workspace_claim every 2 s while nothing is queued', async () => {
    const { fake, deps } = loop(scriptedTurn([result(10)]).turn);
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(3 * POLL_INTERVAL_MS + 100);
    expect(fake.claims).toHaveLength(4);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(await running).toBe(0);
  });

  it('answers what is queued oldest first, one turn at a time', async () => {
    const scripted = scriptedTurn([delta(100, 'answer'), result(5000)]);
    const { fake, deps } = loop(scripted.turn);
    fake.queue.push(claimOf({ requestId: '41' }), claimOf({ requestId: '42' }));
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fake.begins.map((b) => b.requestId)).toEqual(['41']);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fake.begins.map((b) => b.requestId)).toEqual(['41', '42']);
    expect(fake.finishes.map((f) => f.requestId)).toEqual(['41', '42']);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    await running;
  });

  it('calls workspace_heartbeat every 30 s on its own timer, during a turn too, and touches the alive file after each success', async () => {
    const scripted = scriptedTurn([delta(100, 'a long answer')]);
    const { fake, touches, deps } = loop(scripted.turn);
    fake.queue.push(claimOf());
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(3 * HEARTBEAT_MS + 500);
    expect(fake.begins).toHaveLength(1);
    expect(fake.finishes).toHaveLength(0);
    expect(fake.heartbeats.map((h) => h.runner)).toEqual(['workspace@test', 'workspace@test', 'workspace@test', 'workspace@test']);
    const gaps = fake.heartbeats.slice(1).map((h, i) => h.at - (fake.heartbeats[i]?.at ?? 0));
    expect(gaps).toEqual([HEARTBEAT_MS, HEARTBEAT_MS, HEARTBEAT_MS]);
    expect(touches).toHaveLength(4);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    await running;
  });

  it('does not touch the alive file when a heartbeat fails', async () => {
    const { fake, touches, logs, deps } = loop(scriptedTurn([result(10)]).turn);
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(100);
    expect(touches).toHaveLength(1);
    fake.breakDatabase();
    await vi.advanceTimersByTimeAsync(2 * HEARTBEAT_MS);
    expect(touches).toHaveLength(1);
    expect(logs.some((line) => /heartbeat failed/.test(line))).toBe(true);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    await running;
  });

  it('exits non-zero, ending the turn in flight, when no heartbeat has succeeded for 180 s', async () => {
    const scripted = scriptedTurn([delta(100, 'part of an answer')]);
    const { fake, logs, deps } = loop(scripted.turn);
    fake.queue.push(claimOf());
    const runner = createRunner(deps);
    const running = runner.run();
    let exitCode: number | null = null;
    void running.then((code) => {
      exitCode = code;
    });
    await vi.advanceTimersByTimeAsync(1000);
    const brokeAt = Date.now();
    fake.breakDatabase();
    await vi.advanceTimersByTimeAsync(DB_WATCHDOG_MS - HEARTBEAT_MS);
    expect(exitCode).toBeNull();
    await vi.advanceTimersByTimeAsync(2 * HEARTBEAT_MS + 15_000);
    expect(exitCode).toBe(1);
    expect(scripted.abortedAt).not.toBeNull();
    expect((scripted.abortedAt ?? 0) - brokeAt).toBeLessThanOrEqual(DB_WATCHDOG_MS + HEARTBEAT_MS);
    expect(logs.some((line) => /watchdog/.test(line))).toBe(true);
  });

  it('does not trip the watchdog while heartbeats succeed', async () => {
    const { deps } = loop(scriptedTurn([result(10)]).turn);
    const runner = createRunner(deps);
    const running = runner.run();
    let exitCode: number | null = null;
    void running.then((code) => {
      exitCode = code;
    });
    await vi.advanceTimersByTimeAsync(3 * DB_WATCHDOG_MS);
    expect(exitCode).toBeNull();
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(await running).toBe(0);
  });

  it.each([['SIGTERM'], ['SIGINT']])('on %s stops polling, kills the turn, finishes it as failed / stale_claim and exits 0', async (signalName) => {
    const scripted = scriptedTurn([delta(100, 'part of an answer')]);
    const { fake, logs, deps } = loop(scripted.turn);
    fake.queue.push(claimOf(), claimOf({ requestId: '42' }));
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(1000);
    const claimsBefore = fake.claims.length;
    runner.shutdown(signalName);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await running).toBe(0);
    expect(scripted.abortedAt).not.toBeNull();
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ requestId: '41', state: 'failed', errorCode: 'stale_claim', content: 'part of an answer' });
    expect(fake.claims).toHaveLength(claimsBefore);
    expect(fake.begins.map((b) => b.requestId)).toEqual(['41']);
    expect(logs.some((line) => line.includes(signalName))).toBe(true);
    const heartbeatsAtExit = fake.heartbeats.length;
    await vi.advanceTimersByTimeAsync(5 * HEARTBEAT_MS);
    expect(fake.heartbeats).toHaveLength(heartbeatsAtExit);
  });

  it.each([
    ['a shutdown', 0],
    ['the watchdog', 1],
  ] as const)('always exits after %s: a turn that cannot finish is left to the stale-claim sweep after 20 s', async (what, expected) => {
    const scripted = scriptedTurn([delta(100, 'part of an answer')]);
    const { fake, logs, deps } = loop(scripted.turn);
    fake.rpc.finish = () => new Promise<void>(() => undefined);
    fake.queue.push(claimOf());
    const runner = createRunner(deps);
    const running = runner.run();
    let exitCode: number | null = null;
    void running.then((code) => {
      exitCode = code;
    });
    await vi.advanceTimersByTimeAsync(1000);
    if (what === 'a shutdown') {
      runner.shutdown('SIGTERM');
    } else {
      // The last heartbeat that succeeded was the one at the start, 1 s ago; the watchdog trips 180 s after it.
      fake.rpc.heartbeat = () => Promise.reject(new Error('connection refused'));
      await vi.advanceTimersByTimeAsync(DB_WATCHDOG_MS - 1000);
    }
    await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS - 1000);
    expect(exitCode).toBeNull();
    await vi.advanceTimersByTimeAsync(1100);
    expect(exitCode).toBe(expected);
    expect(scripted.abortedAt).not.toBeNull();
    expect(logs.some((line) => /request=41/.test(line) && /shutdown grace/.test(line))).toBe(true);
  });

  it('gives a stop less time than the service gives the container', () => {
    expect(SHUTDOWN_GRACE_MS).toBeLessThan(30_000);
  });

  it('exits 0 at once when idle', async () => {
    const { fake, deps } = loop(scriptedTurn([result(10)]).turn);
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(500);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(10);
    expect(await running).toBe(0);
    expect(fake.finishes).toHaveLength(0);
  });

  it('keeps polling after a claim fails', async () => {
    const { fake, logs, deps } = loop(scriptedTurn([result(10)]).turn);
    const original = fake.rpc.claim;
    let failures = 2;
    fake.rpc.claim = async (runner) => {
      if (failures > 0) {
        failures -= 1;
        fake.claims.push(Date.now());
        throw new Error('connection reset');
      }
      return original(runner);
    };
    fake.queue.push(claimOf());
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(3 * POLL_INTERVAL_MS);
    expect(fake.begins).toHaveLength(1);
    expect(logs.some((line) => /claim failed/.test(line) && /connection reset/.test(line))).toBe(true);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    await running;
  });

  it('claims under its runner name', async () => {
    const { fake, deps } = loop(scriptedTurn([result(10)]).turn);
    const seen: string[] = [];
    const original = fake.rpc.claim;
    fake.rpc.claim = async (runner) => {
      seen.push(runner);
      return original(runner);
    };
    const runner = createRunner(deps);
    const running = runner.run();
    await vi.advanceTimersByTimeAsync(100);
    runner.shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(10);
    await running;
    expect(seen[0]).toBe('workspace@test');
  });
});

describe('the entry', () => {
  it('does not start the loop when it is imported', () => {
    expect(typeof main).toBe('function');
  });

  it('refuses to start where its secrets are not mounted, with one line that names no value', async () => {
    const written: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    let exitCode: number;
    try {
      exitCode = await main();
    } finally {
      spy.mockRestore();
    }
    expect(exitCode).toBe(2);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/workspace: cannot start: /);
    expect(written[0]).not.toMatch(/postgres(ql)?:\/\//);
  });
});
