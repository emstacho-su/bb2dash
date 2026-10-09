import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLAN_BUDGET_USD, PLAN_TIMEOUT_MS } from '../src/config.js';
import { LINES } from '../src/lines.js';
import type { CliTurn } from '../src/providers/claude-cli.js';
import type { ResultEvent, StoredToolCall, TurnEvent, TurnInput, TurnKind } from '../src/providers/types.js';
import type { Retriever } from '../src/retrieve.js';
import { startTurn, type TurnHandle } from '../src/turn.js';
import { ABORTED, claimOf, contextJson, dbRefusal, result, STORED_SESSION_ID } from './helpers/fakes.js';
import { ONE_PASSAGE, NOTHING_FOUND, turnHarness, useFakeClock } from './helpers/turn-harness.js';
import { attachmentFixture, readContractJson } from './helpers/context24.js';

const FENCE = '```';
const PLAN_TEXT = `${FENCE}json\n{"queries":[{"q":"membrane transport","kinds":["material","upload","memory"],"course":null}],"feed":{"from":null,"to":null}}\n${FENCE}`;
const COURSES = [{ id: 'BIO.110', title: 'Intro Biology', display_id: 'BIO.110' }];
const resultEvent = (overrides: Partial<ResultEvent> = {}): TurnEvent => result(0, overrides).event;

type Handler = (input: TurnInput, signal: AbortSignal) => AsyncIterable<TurnEvent>;

/** A provider that answers by the kind of turn it is asked for, and remembers each input. */
function byKind(handlers: Partial<Record<TurnKind, Handler>> = {}): { turn: CliTurn; inputs: TurnInput[] } {
  const inputs: TurnInput[] = [];
  const defaults: Record<TurnKind, Handler> = {
    plan: async function* () {
      yield { type: 'delta', text: PLAN_TEXT };
      yield resultEvent({ costUsd: 0.0016 });
    },
    answer: async function* () {
      yield { type: 'delta', text: 'the answer' };
      yield resultEvent();
    },
    summary: async function* () {
      yield resultEvent();
    },
    rolling: async function* () {
      yield resultEvent();
    },
  };
  return {
    inputs,
    turn: (input, signal) => {
      inputs.push(input);
      return (handlers[input.kind] ?? defaults[input.kind])(input, signal);
    },
  };
}

const standardContext = (overrides: Record<string, unknown> = {}) =>
  contextJson({
    options: { depth: 'standard', format: 'plain', routine_id: null, course_display_id: null, course_ids: null },
    courses: COURSES,
    ...overrides,
  });

const kindsOf = (inputs: readonly TurnInput[]): TurnKind[] => inputs.map((input) => input.kind);

async function finished(handle: TurnHandle, ms = 200) {
  await vi.advanceTimersByTimeAsync(ms);
  return handle.done;
}

describe('the stages of a turn', () => {
  useFakeClock();
  afterEach(() => undefined);

  it('plans on Standard, searches with the plan, answers with the passages, and stores the facts before the answer', async () => {
    const provider = byKind();
    const { fake, deps, search } = turnHarness(provider.turn);
    fake.context = standardContext();
    fake.feed = readContractJson('planner-feed.json');
    const handle = startTurn(deps, claimOf());
    expect(await finished(handle)).toEqual({ state: 'done', errorCode: null });

    expect(kindsOf(provider.inputs)).toEqual(['plan', 'answer']);
    const [plan, answer] = provider.inputs;
    expect(plan).toMatchObject({ model: 'haiku', budgetUsd: PLAN_BUDGET_USD, systemPrompt: 'prompt:plan' });
    expect(plan?.prompt).toContain(claimOf().prompt);
    expect(answer).toMatchObject({ model: 'sonnet', budgetUsd: 0.95, mcpConfig: '/run/workspace/mcp-41.json' });
    expect(answer?.prompt).toContain('[M9001]');
    expect(answer?.prompt).toContain('Planner and grades, read 2026-10-08 14:05 New York time.');
    expect(search.requests[0]?.plan.queries[0]?.q).toBe('membrane transport');

    expect(fake.puts[0]).toMatchObject({ requestId: '41', runner: 'workspace@test' });
    expect(fake.puts[0]?.facts).toMatchObject({ depth: 'standard', tier: 'mid', planState: 'planned', retrievalState: 'found', foundN: 1, passagesN: 1, memoryN: 0, feedRows: 5, planCostUsd: 0.0016 });
    expect(fake.puts[0]?.facts?.promptBytes).toBe(Buffer.byteLength(answer?.prompt ?? '', 'utf8'));
    expect(fake.puts[0]?.sources.map((row) => [row.kind, row.origin])).toEqual([
      ['material', 'auto'],
      ['feed', 'auto'],
    ]);
    // Facts were put before the answering turn started: the put is not after the finish.
    expect(fake.puts).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'done', content: 'the answer', claudeSessionId: null });
    expect(fake.finishes[0]?.toolCalls.map((call) => call.tool)).toEqual(['search', 'planner_feed']);
  });

  it('plans nothing on Quick and gives the answer the whole budget and four searches', async () => {
    const provider = byKind();
    const { fake, deps } = turnHarness(provider.turn);
    fake.context = contextJson({ options: { depth: 'quick', format: 'plain', routine_id: null, course_display_id: null, course_ids: ['BIO.110'] }, courses: COURSES });
    const files: string[] = [];
    const handle = startTurn({ ...deps, mcpFiles: { write: (id, limits) => { files.push(JSON.stringify(limits)); return `/run/workspace/mcp-${id}.json`; }, remove: () => undefined } }, claimOf());
    await finished(handle);
    expect(kindsOf(provider.inputs)).toEqual(['answer']);
    expect(provider.inputs[0]).toMatchObject({ model: 'haiku', budgetUsd: 1 });
    expect(fake.puts[0]?.facts).toMatchObject({ planState: 'skipped', tier: 'low', planMs: 0, planCostUsd: 0 });
    expect(files).toEqual([JSON.stringify({ maxSearches: 4, maxReads: 10, courses: ['BIO.110'] })]);
  });

  it('gives a planned answer three searches, the scope and the budget minus the planning share', async () => {
    const provider = byKind();
    const { fake, deps } = turnHarness(provider.turn);
    fake.context = standardContext({ options: { depth: 'deep', format: 'plain', routine_id: null, course_display_id: 'BIO.110', course_ids: ['BIO.110', 'BIO.110.lab'] } });
    const limits: unknown[] = [];
    const handle = startTurn({ ...deps, mcpFiles: { write: (id, l) => { limits.push(l); return `/run/workspace/mcp-${id}.json`; }, remove: () => undefined } }, claimOf());
    await finished(handle);
    expect(provider.inputs[1]).toMatchObject({ model: 'opus', budgetUsd: 0.95 });
    expect(limits).toEqual([{ maxSearches: 3, maxReads: 10, courses: ['BIO.110', 'BIO.110.lab'] }]);
    // The scope reaches the search, and the course scope is on the stored step.
    expect(fake.finishes[0]?.toolCalls[0]).toMatchObject({ tool: 'search', scope: 'BIO.110' });
  });

  it('skips the planning turn under a budget of 0.10', async () => {
    const provider = byKind();
    const { fake, deps } = turnHarness(provider.turn, { budgetUsd: 0.09 });
    fake.context = standardContext();
    await finished(startTurn(deps, claimOf()));
    expect(kindsOf(provider.inputs)).toEqual(['answer']);
    expect(provider.inputs[0]?.budgetUsd).toBe(0.09);
    expect(fake.puts[0]?.facts?.planState).toBe('skipped');
  });

  it('routes Auto on the question and the last auto tier from the context', async () => {
    const provider = byKind();
    const { fake, deps } = turnHarness(provider.turn);
    fake.context = contextJson({ last_auto_tier: 'mid', courses: COURSES });
    await finished(startTurn(deps, claimOf({ prompt: 'and the second one?' })));
    expect(fake.begins[0]).toMatchObject({ tier: 'mid', model: 'sonnet' });
    expect(kindsOf(provider.inputs)).toEqual(['plan', 'answer']);
  });
});

describe('a planning turn that goes wrong never fails the answer', () => {
  useFakeClock();

  it.each([
    ['text that is not a plan', async function* () { yield { type: 'delta', text: 'Sure, here you go: not json' } as TurnEvent; yield resultEvent(); }],
    ['a budget stop', async function* () { yield resultEvent({ ok: false, errorCode: 'budget_exceeded' }); }],
    ['an error end', async function* () { yield resultEvent({ ok: false, errorCode: 'cli_error' }); }],
  ])('falls back on %s, and the log holds the length and a class, never the text', async (_what, plan) => {
    const provider = byKind({ plan });
    const { fake, deps, logs, search } = turnHarness(provider.turn);
    fake.context = standardContext();
    const handle = startTurn(deps, claimOf());
    expect(await finished(handle)).toEqual({ state: 'done', errorCode: null });
    expect(kindsOf(provider.inputs)).toEqual(['plan', 'answer']);
    expect(fake.puts[0]?.facts?.planState).toBe('fallback');
    expect(search.requests[0]?.plan.queries[0]?.q).toBe(claimOf().prompt);
    expect(logs.join('\n')).not.toContain('not json');
    expect(logs.join('\n')).not.toContain('Sure, here you go');
  });

  it('logs the rejected output as its length and a class', async () => {
    const provider = byKind({ plan: async function* () { yield { type: 'delta', text: 'SECRET words, not a plan' }; yield resultEvent(); } });
    const { fake, deps, logs } = turnHarness(provider.turn);
    fake.context = standardContext();
    await finished(startTurn(deps, claimOf()));
    const line = logs.find((text) => text.includes('plan: fallback'));
    expect(line).toContain('rejected length=24 class=not_json');
    expect(logs.join('\n')).not.toContain('SECRET');
  });

  it('falls back when the planning turn runs past 20 s, and the answer goes on', async () => {
    const provider = byKind({
      plan: async function* (_input, signal) {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
        yield ABORTED;
      },
    });
    const { fake, deps, logs } = turnHarness(provider.turn);
    fake.context = standardContext();
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(PLAN_TIMEOUT_MS - 100);
    expect(provider.inputs.map((input) => input.kind)).toEqual(['plan']);
    expect(await finished(handle, 500)).toEqual({ state: 'done', errorCode: null });
    expect(kindsOf(provider.inputs)).toEqual(['plan', 'answer']);
    expect(fake.puts[0]?.facts?.planState).toBe('fallback');
    expect(logs.some((line) => line.includes('ran out of time'))).toBe(true);
  });

  it.each(['sign_in_expired', 'usage_limit'] as const)('fails the request with %s and starts no answering turn', async (code) => {
    const provider = byKind({ plan: async function* () { yield resultEvent({ ok: false, errorCode: code }); } });
    const { fake, deps, search } = turnHarness(provider.turn);
    fake.context = standardContext();
    const handle = startTurn(deps, claimOf());
    expect(await finished(handle)).toEqual({ state: 'failed', errorCode: code });
    expect(kindsOf(provider.inputs)).toEqual(['plan']);
    expect(search.requests).toHaveLength(0);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: code, content: '' });
  });

  it('stores cancelled and starts no answering process when Stop is pressed during the planning turn', async () => {
    const provider = byKind({
      plan: async function* (_input, signal) {
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
        yield ABORTED;
      },
    });
    const { fake, deps, search } = turnHarness(provider.turn);
    fake.context = standardContext();
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(500);
    fake.cancel();
    expect(await finished(handle, 3000)).toEqual({ state: 'failed', errorCode: 'cancelled' });
    expect(kindsOf(provider.inputs)).toEqual(['plan']);
    expect(search.requests).toHaveLength(0);
    expect(fake.puts).toHaveLength(0);
    expect(fake.finishes).toHaveLength(1);
    expect(fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cancelled' });
  });
});

describe('nothing matched', () => {
  useFakeClock();

  it('stores empty for a planner question the feed answers, and opens with the sentence, which names course files and uploads and not the planner', async () => {
    const provider = byKind();
    const { fake, deps, search } = turnHarness(provider.turn);
    search.result = NOTHING_FOUND;
    fake.context = contextJson({ courses: COURSES });
    fake.feed = readContractJson('planner-feed.json');
    expect(await finished(startTurn(deps, claimOf({ prompt: 'What is due this week?' })))).toEqual({ state: 'done', errorCode: null });
    expect(fake.puts[0]?.facts).toMatchObject({ retrievalState: 'empty', feedRows: 5, passagesN: 0, memoryN: 0 });
    expect(fake.finishes[0]?.content).toBe(`${LINES.empty}\n\nthe answer`);
    expect(fake.streams.filter((call) => call.delta !== '').map((call) => call.delta).join('')).toBe(`${LINES.empty}\n\nthe answer`);
    expect(LINES.empty).toMatch(/course files or uploads/);
    expect(LINES.empty).not.toMatch(/planner/i);
  });

  it('stores attached_only for a question with an attached file that was read, and adds no such line', async () => {
    const provider = byKind();
    const { fake, deps, search } = turnHarness(provider.turn);
    search.result = { state: 'ok', hits: [], found: 0, ms: 0, attachments: [attachmentFixture({ state: 'read', unitsTotal: 2, unitsRead: 2, leftOutUnitIds: [] })] };
    fake.context = contextJson({ courses: COURSES, attachments: [{ ord: 1, kind: 'file', id: 412, title: 'Week 5 slides.pptx', state: 'ready' }] });
    await finished(startTurn(deps, claimOf({ prompt: 'Explain the attached file.' })));
    expect(fake.puts[0]?.facts).toMatchObject({ retrievalState: 'attached_only', attachments: [{ kind: 'file', id: 412, state: 'read' }] });
    expect(fake.finishes[0]?.content).toBe('the answer');
    expect(fake.puts[0]?.sources.map((row) => [row.kind, row.origin])).toEqual([['material', 'attached']]);
  });

  it('searches a short follow-up with the previous question after it, and stores found with no such line when that text finds the passages', async () => {
    const provider = byKind();
    const { fake, deps, search } = turnHarness(provider.turn);
    const retrieve: Retriever = async (request) => {
      search.requests.push(request);
      return request.plan.queries[0]?.q.includes('Explain facilitated diffusion.') ? ONE_PASSAGE : NOTHING_FOUND;
    };
    // Quick plans nothing: the fallback plan is the search, so the previous question is put after the short one.
    fake.context = contextJson({
      options: { depth: 'quick', format: 'plain', routine_id: null, course_display_id: null, course_ids: null },
      courses: COURSES,
      messages: [
        { id: 'a', role: 'user', content: 'Explain facilitated diffusion.', created_at: '2026-10-08T14:00:02+00:00', error_code: null },
        { id: 'b', role: 'assistant', content: 'Carrier proteins.', created_at: '2026-10-08T14:00:09+00:00', error_code: null },
      ],
    });
    await finished(startTurn({ ...deps, retrieve }, claimOf({ prompt: 'and active transport?' })));
    expect(fake.puts[0]?.facts).toMatchObject({ retrievalState: 'found', passagesN: 1 });
    expect(fake.finishes[0]?.content).toBe('the answer');
    expect(search.requests[0]?.plan.queries[0]?.q).toBe('and active transport?\nExplain facilitated diffusion.');
  });

  it('puts the sentence first on plain and nothing on rich', async () => {
    for (const format of ['plain', 'rich'] as const) {
      const provider = byKind();
      const { fake, deps, search } = turnHarness(provider.turn);
      search.result = NOTHING_FOUND;
      fake.context = contextJson({ options: { depth: 'auto', format, routine_id: null, course_display_id: null, course_ids: null } });
      await finished(startTurn(deps, claimOf()));
      expect(fake.puts[0]?.facts?.retrievalState).toBe('empty');
      expect(fake.finishes[0]?.content.startsWith(LINES.empty)).toBe(format === 'plain');
      expect(provider.inputs.at(-1)?.systemPrompt).toContain(`prompt:format-${format}`);
    }
  });

  it('says it could not search when the search failed, stores failed, and still answers', async () => {
    const provider = byKind();
    const { fake, deps, search } = turnHarness(provider.turn);
    search.result = { state: 'failed', hits: [], found: 0, attachments: [], ms: 10000 };
    await finished(startTurn(deps, claimOf()));
    expect(fake.puts[0]?.facts).toMatchObject({ retrievalState: 'failed', foundN: 0, retrievalMs: expect.any(Number) });
    expect(fake.finishes[0]?.content).toBe(`${LINES.search_failed}\n\nthe answer`);
    expect(fake.finishes[0]?.state).toBe('done');
    expect(fake.finishes[0]?.toolCalls[0]).toMatchObject({ tool: 'search', ok: false });
  });

  it('names an attachment that is not read, failed, missing or cut', async () => {
    const provider = byKind();
    const { fake, deps, search } = turnHarness(provider.turn);
    const read = (id: number, state: 'not_ready' | 'failed' | 'missing') => attachmentFixture({ kind: 'upload', id, title: `f${id}.pdf`, state, units: [], unitsTotal: 0, unitsRead: 0, leftOutUnitIds: [] });
    search.result = { state: 'ok', hits: ONE_PASSAGE.hits, found: 1, ms: 0, attachments: [read(1, 'not_ready'), read(2, 'failed'), read(3, 'missing')] };
    fake.context = contextJson({
      attachments: [1, 2, 3].map((id) => ({ ord: id, kind: 'upload', id, title: `f${id}.pdf`, state: 'stored' })),
    });
    await finished(startTurn(deps, claimOf()));
    expect(fake.finishes[0]?.content).toBe(
      [
        'The attached file "f1.pdf" has not been read yet, so this answer does not use it.',
        'The attached file "f2.pdf" could not be read, so this answer does not use it.',
        'The attached file "f3.pdf" is no longer there, so this answer does not use it.',
        '',
        'the answer',
      ].join('\n'),
    );
    expect(fake.puts[0]?.facts?.attachments.map((a) => a.state)).toEqual(['not_ready', 'failed', 'missing']);
  });
});

describe('sources from the answering turn', () => {
  useFakeClock();

  it('stores a unit the model opened by id as an origin tool row from the call input, in a second put with no facts', async () => {
    const open: StoredToolCall = { tool: 'get_material_text', query: null, scope: '9003', ok: true };
    const duplicate: StoredToolCall = { tool: 'get_material_text', query: null, scope: '9001', ok: true };
    const unanswered: StoredToolCall = { tool: 'get_material_text', query: null, scope: '77', ok: false };
    const search: StoredToolCall = { tool: 'search_materials', query: 'x', scope: null, ok: true };
    const provider = byKind({
      answer: async function* () {
        for (const [id, call] of [['t1', search], ['t2', open], ['t3', duplicate], ['t4', unanswered]] as const) yield { type: 'tool', id, call } as TurnEvent;
        yield { type: 'delta', text: 'the answer' };
        yield resultEvent();
      },
    });
    const { fake, deps } = turnHarness(provider.turn);
    await finished(startTurn(deps, claimOf()));
    expect(fake.puts).toHaveLength(2);
    expect(fake.puts[1]?.facts).toBeNull();
    expect(fake.puts[1]?.sources).toEqual([
      { kind: 'material', origin: 'tool', file_id: null, text_id: 9003, document_id: null, doc_text_id: null, course_id: null, unit_kind: null, unit_no: null, similarity: null, title: null },
    ]);
    expect(fake.finishes[0]?.toolCalls.slice(2)).toEqual([search, open, duplicate, unanswered]);
  });

  it('keeps the answer when a put fails, and logs it', async () => {
    const provider = byKind();
    const { fake, deps, logs } = turnHarness(provider.turn);
    fake.failPut(5);
    expect(await finished(startTurn(deps, claimOf()))).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]?.content).toBe('the answer');
    expect(logs.some((line) => line.includes('turn_put failed'))).toBe(true);
  });

  it('keeps the answer when the planner feed fails, with the feed absent from the prompt and the sources', async () => {
    const provider = byKind();
    const { fake, deps } = turnHarness(provider.turn);
    fake.failFeed();
    await finished(startTurn(deps, claimOf()));
    expect(provider.inputs[0]?.prompt).not.toContain('Planner and grades');
    expect(fake.puts[0]?.sources.some((row) => row.kind === 'feed')).toBe(false);
    expect(fake.puts[0]?.facts?.feedRows).toBe(0);
    expect(fake.finishes[0]?.toolCalls[1]).toMatchObject({ tool: 'planner_feed', ok: false });
  });
});

describe('the context and the answering turn files', () => {
  useFakeClock();

  it('skips a request the context refuses, and closes one whose context cannot be read', async () => {
    const refused = turnHarness(byKind().turn);
    refused.fake.failContext(dbRefusal('workspace_turn_context: request 41 is not claimed by workspace@test'), 1);
    expect(await finished(startTurn(refused.deps, claimOf()))).toEqual({ state: 'skipped', errorCode: null });
    expect(refused.fake.begins).toHaveLength(0);
    expect(refused.fake.finishes).toHaveLength(0);

    const unreadable = turnHarness(byKind().turn);
    unreadable.fake.context = 'not an object';
    expect(await finished(startTurn(unreadable.deps, claimOf()))).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(unreadable.fake.begins).toHaveLength(0);
    expect(unreadable.fake.finishes[0]).toMatchObject({ state: 'failed', errorCode: 'cli_error', content: '' });
  });

  it('writes the MCP config before the answering turn and removes it after, even when the turn throws', async () => {
    const events: string[] = [];
    const provider = byKind({
      answer: async function* () {
        events.push('answering');
        throw new Error('the provider failed');
      },
    });
    const { fake, deps } = turnHarness(provider.turn, {
      mcpFiles: { write: (id) => { events.push(`write ${id}`); return `/run/workspace/mcp-${id}.json`; }, remove: (file) => { events.push(`remove ${file}`); } },
    });
    expect(await finished(startTurn(deps, claimOf()))).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(events).toEqual(['write 41', 'answering', 'remove /run/workspace/mcp-41.json']);
    expect(fake.finishes).toHaveLength(1);
  });

  it('closes the request as cli_error when the config file cannot be written', async () => {
    const provider = byKind();
    const { fake, deps } = turnHarness(provider.turn, { mcpFiles: { write: () => { throw new Error('EACCES'); }, remove: () => undefined } });
    expect(await finished(startTurn(deps, claimOf()))).toEqual({ state: 'failed', errorCode: 'cli_error' });
    expect(kindsOf(provider.inputs)).not.toContain('answer');
  });

  it('logs ids, counts, states and timings: never the question, a passage or an answer', async () => {
    const provider = byKind();
    const { fake, deps, logs } = turnHarness(provider.turn);
    fake.context = standardContext();
    fake.feed = readContractJson('planner-feed.json');
    await finished(startTurn(deps, claimOf({ prompt: 'A distinctive question about osmosis in the dialysis lab' })));
    const text = logs.join('\n');
    expect(text).toContain('prepared plan=planned retrieval=found');
    for (const forbidden of ['distinctive question', 'osmosis', 'Synthetic passage', 'the answer', 'Lab Report 2']) expect(text).not.toContain(forbidden);
    expect(STORED_SESSION_ID).toBeDefined();
  });
});
