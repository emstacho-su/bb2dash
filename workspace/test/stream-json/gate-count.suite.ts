/**
 * The gate rule after the review round (rulings V1, CR-1 and CR-6): a tool result that is not an
 * error needs a gate allow (a PreToolUse hook response with exit 0) for that tool name, counted per
 * name and never paired to a call by arrival order; an error result needs none, and its call is
 * stored with ok false while the turn goes on. Tested on hand-built lines and on the event order of
 * the two recordings that carry tool calls and hook events. Part of stream-json.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { mapTurnEnd } from '../../src/errors.js';
import { readFixtureLines } from '../helpers/fakes.js';
import {
  SEARCH,
  blockStart,
  deltasOf,
  hookResponse,
  initLine,
  replay,
  resultLine,
  stopsOf,
  textDelta,
  toolResult,
  toolUse,
  toolUsesInOneLine,
  toolUsesInOneMessage,
  type Line,
} from '../helpers/stream-lines.js';

const MATERIAL_TEXT = 'mcp__bb2dash__get_material_text';

const isHookResponse = (line: Line): boolean => line.type === 'system' && line.subtype === 'hook_response';
const hookToolOf = (line: Line): string => String(line.hook_name).replace(/^PreToolUse:/, '');

/** The index of the line that carries the result of each tool call, by tool-use id. */
function resultIndexes(lines: readonly Line[]): Map<string, number> {
  const found = new Map<string, number>();
  lines.forEach((line, index) => {
    if (line.type !== 'user') return;
    for (const block of (line.message as { content: Line[] }).content) {
      if (block.type === 'tool_result') found.set(String(block.tool_use_id), index);
    }
  });
  return found;
}

/** The same lines with the first tool result marked as an error. */
function withFirstResultAsError(lines: readonly Line[]): Line[] {
  let done = false;
  return lines.map((line) => {
    if (done || line.type !== 'user') return line;
    const message = line.message as { content: Line[] };
    if (!message.content.some((block) => block.type === 'tool_result')) return line;
    done = true;
    return { ...line, message: { ...message, content: message.content.map((block) => ({ ...block, is_error: true })) } };
  });
}

describe('an error result needs no gate answer', () => {
  it.each([
    ['a tool the CLI does not have', 'Read', { file_path: '/etc/passwd' }, { tool: 'Read', query: null, scope: null, ok: false }],
    ['an allowed tool the CLI refused before the gate ran', SEARCH, { q: 'late work' }, { tool: 'search_materials', query: 'late work', scope: null, ok: false }],
  ])('does not end the turn on an error result for %s: the call is stored ok false and the answer goes on', (_what, name, input, stored) => {
    const { signals, summary } = replay([
      initLine(),
      toolUse('t1', name, input),
      toolResult('t1', true),
      blockStart('text'),
      textDelta('I could not look that up.'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(summary.toolCalls).toEqual([stored]);
    expect(deltasOf(signals)).toBe('I could not look that up.');
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('sends the tool signal again for the error result, so the stored call is the one with its result', () => {
    const { signals } = replay([initLine(), toolUse('t1', 'Read'), toolResult('t1', true)]);
    const tools = signals.flatMap((signal) => (signal.kind === 'tool' ? [signal] : []));
    expect(tools.map((signal) => [signal.id, signal.call.ok])).toEqual([
      ['t1', false],
      ['t1', false],
    ]);
  });

  it('lets a later, allowed call of the same turn answer after an error result with no gate answer', () => {
    const { signals, summary } = replay([
      initLine(),
      toolUse('t1', 'Read'),
      toolResult('t1', true),
      toolUse('t2', SEARCH, { q: 'late work' }),
      hookResponse(SEARCH, 0),
      toolResult('t2'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls.map((call) => [call.tool, call.ok])).toEqual([
      ['Read', false],
      ['search_materials', true],
    ]);
  });
});

describe('a result that is not an error needs a gate allow for its tool name', () => {
  it('ends the turn as cli_error on a result that is not an error with no gate answer at all', () => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), toolResult('t1'), resultLine()]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]).toMatchObject({ errorCode: 'cli_error' });
    expect(stopsOf(signals)[0]?.reason).toMatch(/search_materials/);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('ends the turn when the only gate answer was a deny (exit 2) and the result is not an error', () => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), hookResponse(SEARCH, 2), toolResult('t1'), resultLine()]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]).toMatchObject({ errorCode: 'cli_error' });
    expect(summary.toolCalls[0]?.ok).toBe(false);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('counts per tool name: two results that are not errors with one allow, and the second ends the turn', () => {
    const { signals, summary } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'first' }),
      hookResponse(SEARCH, 0),
      toolResult('t1'),
      toolUse('t2', SEARCH, { q: 'second' }),
      toolResult('t2'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(summary.toolCalls.map((call) => call.ok)).toEqual([true, false]);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('never takes an allow for one tool as an allow for another', () => {
    const { signals } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'x' }),
      toolUse('t2', OPEN, { text_id: 5 }),
      hookResponse(SEARCH, 0),
      hookResponse(SEARCH, 0),
      toolResult('t1'),
      toolResult('t2'),
    ]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.reason).toMatch(/get_material_text/);
  });

  it('counts an allow whenever it arrives before the result, before the call line included', () => {
    const { signals, summary } = replay([initLine(), hookResponse(SEARCH, 0), toolUse('t1', SEARCH, { q: 'x' }), toolResult('t1'), resultLine()]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls[0]?.ok).toBe(true);
  });

  it('counts the result of a call once, however many user lines repeat it', () => {
    const { signals, summary } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'x' }),
      hookResponse(SEARCH, 0),
      toolResult('t1'),
      toolResult('t1'),
      toolResult('t1'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls).toEqual([{ tool: 'search_materials', query: 'x', scope: null, ok: true }]);
    expect(signals.filter((signal) => signal.kind === 'tool')).toHaveLength(2);
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('keeps the first result of a call: a repeated line cannot turn an error into an answer', () => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), toolResult('t1', true), toolResult('t1'), resultLine()]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls[0]?.ok).toBe(false);
  });

  it('passes three calls of one tool with three allows, whatever order the results come in', () => {
    const { signals, summary } = replay([
      initLine(),
      ...toolUsesInOneMessage([
        { id: 'a', name: SEARCH, input: { q: 'one' } },
        { id: 'b', name: SEARCH, input: { q: 'two' } },
        { id: 'c', name: SEARCH, input: { q: 'three' } },
      ]),
      hookResponse(SEARCH, 0),
      hookResponse(SEARCH, 0),
      hookResponse(SEARCH, 0),
      toolResult('c'),
      toolResult('a'),
      toolResult('b'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls.map((call) => [call.query, call.ok])).toEqual([
      ['one', true],
      ['two', true],
      ['three', true],
    ]);
  });
});

const OPEN = 'mcp__bb2dash__get_material_text';

describe('two calls of one tool in one message, one of them denied', () => {
  const calls = [
    { id: 'a', name: SEARCH, input: { q: 'quiz 2', course: 'IST.323' } },
    { id: 'b', name: SEARCH, input: { q: 'quiz 2', course: 'ECN.304' } },
  ];

  // The gate's two answers carry the tool name and nothing that says which call each one is for.
  it.each([
    ['the allow first, the first call answered', [0, 2], 'a'],
    ['the deny first, the first call answered', [2, 0], 'a'],
    ['the allow first, the second call answered', [0, 2], 'b'],
    ['the deny first, the second call answered', [2, 0], 'b'],
  ] as const)('gives each call its own result and kills nothing: %s', (_what, exits, answered) => {
    const denied = answered === 'a' ? 'b' : 'a';
    const { signals, summary } = replay([
      initLine(),
      ...toolUsesInOneMessage(calls),
      ...exits.map((exit) => hookResponse(SEARCH, exit)),
      toolResult(denied, true),
      toolResult(answered),
      blockStart('text'),
      textDelta('One collection answered.'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(summary.toolCalls).toEqual([
      { tool: 'search_materials', query: 'quiz 2', scope: 'IST.323', ok: answered === 'a' },
      { tool: 'search_materials', query: 'quiz 2', scope: 'ECN.304', ok: answered === 'b' },
    ]);
    expect(deltasOf(signals)).toBe('One collection answered.');
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('reads both calls the same way when they arrive in one assistant line and their results in one user line', () => {
    const bothResults: Line = {
      type: 'user',
      message: {
        role: 'user',
        content: [
          { tool_use_id: 'a', type: 'tool_result', content: '<scrubbed>', is_error: true },
          { tool_use_id: 'b', type: 'tool_result', content: '<scrubbed>' },
        ],
      },
      parent_tool_use_id: null,
    };
    const { signals, summary } = replay([
      initLine(),
      toolUsesInOneLine(calls),
      hookResponse(SEARCH, 2),
      hookResponse(SEARCH, 0),
      bothResults,
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls.map((call) => call.ok)).toEqual([false, true]);
  });

  it('ends the turn when both come back answered: two results that are not errors against one allow', () => {
    const { signals } = replay([
      initLine(),
      ...toolUsesInOneMessage(calls),
      hookResponse(SEARCH, 0),
      hookResponse(SEARCH, 2),
      toolResult('a'),
      toolResult('b'),
    ]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]).toMatchObject({ errorCode: 'cli_error' });
  });
});

describe('the gate rule on the recorded event order', () => {
  const lookup = readFixtureLines('claude-stream-lookup.jsonl');
  const budgetStop = readFixtureLines('claude-stream-budget-stop.jsonl');

  it('lookup: each allow is in the stream before the result of its call', () => {
    const allows = lookup.flatMap((line, index) => (isHookResponse(line) && line.exit_code === 0 ? [{ index, tool: hookToolOf(line) }] : []));
    const results = [...resultIndexes(lookup).values()].sort((a, b) => a - b);
    expect(allows.map((allow) => allow.tool)).toEqual([SEARCH, MATERIAL_TEXT]);
    expect(results).toHaveLength(2);
    expect(allows[0]!.index).toBeLessThan(results[0]!);
    expect(allows[1]!.index).toBeLessThan(results[1]!);
    expect(allows[1]!.index).toBeGreaterThan(results[0]!);
  });

  it('lookup: passes as recorded, both calls ok', () => {
    const { signals, summary } = replay(lookup);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls.map((call) => [call.tool, call.ok])).toEqual([
      ['search_materials', true],
      ['get_material_text', true],
    ]);
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('lookup with the gate answers taken out: stopped at the first result, and none of the answer is streamed', () => {
    const { signals, summary } = replay(lookup.filter((line) => !isHookResponse(line)));
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.reason).toMatch(/search_materials/);
    expect(deltasOf(signals)).toBe('');
    expect(summary.toolCalls).toHaveLength(1);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('lookup with only the second gate answer taken out: the first call passes, the second ends the turn', () => {
    let seen = 0;
    const lines = lookup.filter((line) => !isHookResponse(line) || (seen += 1) === 1);
    const { signals, summary } = replay(lines);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.reason).toMatch(/get_material_text/);
    expect(summary.toolCalls.map((call) => call.ok)).toEqual([true, false]);
  });

  it('lookup with the gate answers taken out and the first result an error: the first call is ok false and the turn goes on to the second', () => {
    const { signals, summary } = replay(withFirstResultAsError(lookup.filter((line) => !isHookResponse(line))));
    expect(summary.toolCalls.map((call) => [call.tool, call.ok])).toEqual([
      ['search_materials', false],
      ['get_material_text', false],
    ]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.reason).toMatch(/get_material_text/);
  });

  it('lookup with the first result an error: no stop, and the unused allow is not needed', () => {
    const { signals, summary } = replay(withFirstResultAsError(lookup));
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls.map((call) => call.ok)).toEqual([false, true]);
    expect(mapTurnEnd(summary)).toBeNull();
  });

  it('budget stop: the allow arrives after the result line and no tool result ever does', () => {
    const resultAt = budgetStop.findIndex((line) => line.type === 'result');
    const allowAt = budgetStop.findIndex((line) => isHookResponse(line) && line.exit_code === 0);
    expect(resultAt).toBeGreaterThan(-1);
    expect(allowAt).toBeGreaterThan(resultAt);
    expect(resultIndexes(budgetStop).size).toBe(0);
  });

  it('budget stop: passes as recorded, the cut-off call ok false, stored as budget_exceeded', () => {
    const { signals, summary } = replay(budgetStop);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(summary.toolCalls).toEqual([{ tool: 'search_materials', query: 'late work policy', scope: 'IST.323', ok: false }]);
    expect(mapTurnEnd(summary)).toBe('budget_exceeded');
  });
});
