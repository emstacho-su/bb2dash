/**
 * A statement the database refuses (ruling Z1, R2-5): NUL never reaches it inside the stored tool
 * calls, a failure that is the statement's own is not tried again, and a finish refused that way is
 * followed by one minimal close of the same request. Part of runner.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { createRpc, type QueryResult } from '../../src/db.js';
import type { StoredToolCall } from '../../src/providers/types.js';
import { startTurn } from '../../src/turn.js';
import { claimOf, delta, result, scriptedTurn, type Step } from '../helpers/fakes.js';
import { turnHarness, useFakeClock } from '../helpers/turn-harness.js';

/** The character itself, and the six characters JSON writes it as. */
const NUL = '\u0000';
const NUL_ESCAPE = '\\u0000';

const tool = (at: number, id: string, call: StoredToolCall): Step => ({ at, event: { type: 'tool', id, call } });

describe('NUL characters and the stored tool calls (ruling Z1, R2-5)', () => {
  useFakeClock();

  it('takes NUL out of every string of a stored tool call before the finish call, as it does out of the content', async () => {
    const dirty: StoredToolCall = { tool: `search_${NUL}materials`, query: `late${NUL} work${NUL}`, scope: `IST${NUL}.323`, ok: true };
    const { fake, deps } = turnHarness(scriptedTurn([tool(10, 't1', dirty), delta(20, `the ${NUL}answer`), result(30)]).turn);
    const handle = startTurn(deps, claimOf());
    await vi.advanceTimersByTimeAsync(1000);
    expect(await handle.done).toEqual({ state: 'done', errorCode: null });
    expect(fake.finishes[0]?.toolCalls).toEqual([{ tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true }]);
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
    expect(fake.finishes[0]?.toolCalls).toEqual([
      { tool: 'get_material_text', query: null, scope: '12', ok: false, extra: { key: ['a', { deep: 'xy', count: 3, yes: true, none: null }] } },
    ]);
  });

  // What the database is sent, through the real call: the jsonb parameter is JSON text, in which a
  // NUL is the escape the database refuses to store (22P05).
  it('sends workspace_finish a tool-call parameter with no NUL escape, and a content with no NUL', async () => {
    const sent: Array<{ sql: string; params: readonly unknown[] }> = [];
    const query = async (sql: string, params: readonly unknown[] = []): Promise<QueryResult> => {
      sent.push({ sql, params });
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
    expect(toolCalls).toBe('[{"tool":"search_context","query":"week 8","scope":null,"ok":true}]');
    expect(JSON.stringify(finish[0]!.params)).not.toContain(NUL_ESCAPE);
  });
});
