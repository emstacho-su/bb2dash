/**
 * The fail-closed rule on the tool gate: a tool that ran with no PreToolUse hook response, or with
 * one whose exit code is neither 0 nor 2, stops the turn as cli_error. Part of stream-json.test.ts.
 */

import { describe, expect, it } from 'vitest';

import { mapTurnEnd } from '../../src/errors.js';
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
} from '../helpers/stream-lines.js';

describe('failing closed on the gate', () => {
  it('stops the turn as cli_error when a tool result arrives with no PreToolUse hook response', () => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), toolResult('t1'), resultLine()]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(summary.violation).not.toBeNull();
    expect(mapTurnEnd(summary)).toBe('cli_error');
    expect(summary.toolCalls[0]?.ok).toBe(false);
  });

  it.each([[1], [3], [127], [-1]])('stops the turn as cli_error when the hook exits %s', (exitCode) => {
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), hookResponse(SEARCH, exitCode)]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(mapTurnEnd({ ...summary, result: null })).toBe('cli_error');
  });

  it('stops the turn when the hook response carries no exit code at all', () => {
    const response = { ...hookResponse(SEARCH, 0), exit_code: undefined };
    const { signals } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), response]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
  });

  it('does not fail a turn that ended before a tool ran: no gate response and no result is a call that never happened', () => {
    const ended = resultLine({ subtype: 'error_max_budget_usd', is_error: true });
    const { signals, summary } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), ended]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(summary.toolCalls).toEqual([{ tool: 'search_materials', query: 'x', scope: null, ok: false }]);
    expect(mapTurnEnd(summary)).toBe('budget_exceeded');
  });

  it('says nothing more once it has stopped a turn, but still reads the result line', () => {
    const { signals, summary } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'x' }),
      toolResult('t1'),
      blockStart('text'),
      textDelta('text after an ungated call'),
      toolUse('t2', SEARCH, { q: 'y' }),
      resultLine({ total_cost_usd: 0.5 }),
    ]);
    expect(stopsOf(signals)).toHaveLength(1);
    expect(deltasOf(signals)).toBe('');
    expect(summary.text).toBe('');
    expect(summary.toolCalls).toHaveLength(1);
    expect(summary.result?.totalCostUsd).toBe(0.5);
    expect(mapTurnEnd(summary)).toBe('cli_error');
  });

  it('does not count a hook response for another tool', () => {
    const { signals } = replay([
      initLine(),
      toolUse('t1', SEARCH, { q: 'x' }),
      hookResponse('mcp__bb2dash__list_courses', 0),
      toolResult('t1'),
    ]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
  });

  it('ignores hook events that are not PreToolUse', () => {
    const other = { ...hookResponse(SEARCH, 0), hook_event: 'PostToolUse', hook_name: `PostToolUse:${SEARCH}` };
    const { signals } = replay([initLine(), toolUse('t1', SEARCH, { q: 'x' }), other, toolResult('t1')]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
  });

  it('accepts EndConversation with no hook response, stores nothing for it and lets the turn finish', () => {
    const { signals, summary } = replay([
      initLine(),
      blockStart('text'),
      textDelta('Goodbye.'),
      toolUse('end1', 'EndConversation', {}),
      toolResult('end1'),
      resultLine(),
    ]);
    expect(stopsOf(signals)).toEqual([]);
    expect(summary.toolCalls).toEqual([]);
    expect(summary.violation).toBeNull();
    expect(mapTurnEnd(summary)).toBeNull();
    expect(summary.text).toBe('Goodbye.');
  });

  it('stops the turn when model output arrives before any init line', () => {
    const { signals, summary } = replay([blockStart('text'), textDelta('hello')]);
    expect(stopsOf(signals)[0]?.errorCode).toBe('cli_error');
    expect(deltasOf(signals)).toBe('');
    expect(summary.violation).not.toBeNull();
  });
});
