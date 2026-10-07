// The apply worker's pure rules (Phase 23): the start-up checks, the batch, the SQL guard, the
// tool gate and the report. No process, no database, no network.

import { describe, expect, it } from 'vitest';

import { BATCH_MAX_ITEMS, RUN_BUDGET_DEFAULT_USD, assertApplyDsn, loadConfig, parseRunBudget, PATHS } from '../src/config.js';
import { parsePrepared, planBatch, templatedBucket, templatedDecision, type QueueRow } from '../src/batch.js';
import { checkSql, maskSql } from '../src/mcp-sql/guard.js';
import { decide } from '../src/hooks/gate-rules.js';
import { buildReport, parseRunFacts, type ClaudeOutcome, type RunFacts } from '../src/report.js';

const DSN = 'postgresql://inbox_apply_runner.goultdzqcavefcgnifdy:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
const CA = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('the start-up checks', () => {
  const files = (dsn: string | null) => (file: string) => (file === PATHS.dbUrlSecret ? dsn : file.endsWith('.crt') ? CA : null);

  it('loads the DSN, the CA and the default budget', () => {
    const config = loadConfig({ env: {}, readFile: files(`${DSN}\r\n`) });
    expect(config).toEqual({ dbUrl: DSN, dbCa: CA, budgetUsd: RUN_BUDGET_DEFAULT_USD });
  });

  it('refuses to start with an API key or a provider switch in the environment, before reading any secret', () => {
    let read = false;
    const readFile = (file: string) => {
      read = true;
      return files(DSN)(file);
    };
    expect(() => loadConfig({ env: { ANTHROPIC_API_KEY: 'x' }, readFile })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ env: { CLAUDE_CODE_USE_BEDROCK: '1' }, readFile })).toThrow(/CLAUDE_CODE_USE_BEDROCK/);
    expect(read).toBe(false);
  });

  it('refuses a missing secret, another role, the transaction pooler and a weak sslmode, naming no value', () => {
    expect(() => loadConfig({ env: {}, readFile: files(null) })).toThrow(/inbox_apply_db_url is missing or empty/);
    expect(() => assertApplyDsn(DSN.replace('inbox_apply_runner', 'postgres'))).toThrow(/does not log in as inbox_apply_runner/);
    expect(() => assertApplyDsn(DSN.replace(':5432', ':6543'))).toThrow(/transaction pooler/);
    expect(() => assertApplyDsn(DSN.replace('verify-full', 'disable'))).toThrow(/sslmode/);
    expect(() => assertApplyDsn(DSN.replace('?sslmode=verify-full', ''))).toThrow(/sslmode/);
    expect(() => assertApplyDsn('not a url')).toThrow(/inbox_apply_db_url/);
    for (const bad of [DSN.replace('inbox_apply_runner', 'postgres'), 'not a url']) {
      try {
        assertApplyDsn(bad);
      } catch (error) {
        expect(String((error as Error).message)).not.toContain('pw@');
      }
    }
  });

  it('reads the run budget as dollars with at most two decimals, 0.10 to 10.00', () => {
    expect(parseRunBudget(undefined)).toBe(3);
    expect(parseRunBudget(' 1.5 ')).toBe(1.5);
    for (const bad of ['0', '0.05', '10.01', '1.234', 'abc', '-1']) expect(() => parseRunBudget(bad)).toThrow(/APPLY_RUN_BUDGET_USD/);
  });
});

function queueRow(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 3101, kind: 'stack_must_confirm', course_id: 'IST.352', entity: 'assignment', ref: 'assignment:IST.352/x', field: null,
    question: 'Is it graded?', state: 'resolved', accept: null, has_note: false, was_applied: false, applied_at: null,
    resolved_at: '2026-10-07T14:02:11Z', ...over,
  };
}

describe('the batch', () => {
  it('reads what inbox_apply_prepare returns, and refuses a row without an id', () => {
    const prepared = parsePrepared({ params: { trigger: 'followup', after: 1, skip: [3, '4', 'x', -1] }, runs_today: 2, queue: [queueRow()] });
    expect(prepared.runsToday).toBe(2);
    expect(prepared.skip).toEqual([3, 4]);
    expect(prepared.trigger).toBe('followup');
    expect(prepared.queue[0]).toMatchObject({ id: 3101, courseId: 'IST.352', hasNote: false, wasApplied: false });
    expect(parsePrepared({ queue: [] })).toEqual({ queue: [], runsToday: 0, skip: [], trigger: null });
    expect(() => parsePrepared({ queue: [{ kind: 'conflict' }] })).toThrow(/no item id/);
    expect(() => parsePrepared(null)).toThrow(/no queue/);
    expect(() => parsePrepared({ queue: 'x' })).toThrow(/no queue/);
  });

  const row = (over: Partial<Record<string, unknown>>): QueueRow => parsePrepared({ queue: [queueRow(over)] }).queue[0]!;

  it('records by itself only a row that needs no reading and carries no note', () => {
    expect(templatedBucket(row({ was_applied: true, applied_at: '2026-10-07T18:00:00Z' }))).toBe('applied_by_transform');
    expect(templatedBucket(row({ kind: 'conflict', accept: 'keep' }))).toBe('kept');
    expect(templatedBucket(row({ state: 'dismissed' }))).toBe('dismissed');
    expect(templatedBucket(row({}))).toBeNull();
    expect(templatedBucket(row({ kind: 'conflict', accept: 'blackboard' }))).toBeNull();
    // A note can ask for more than the bucket says, so it always gets a reader.
    expect(templatedBucket(row({ was_applied: true, has_note: true }))).toBeNull();
    expect(templatedBucket(row({ state: 'dismissed', has_note: true }))).toBeNull();
  });

  it('a templated record is the shape migration 181 checks', () => {
    const applied = templatedDecision(row({ was_applied: true, applied_at: '2026-10-07T18:00:00Z' }), 'applied_by_transform', 1860);
    expect(applied).toMatchObject({
      schema: 'inbox-decision/1', item: 3101, request: 1860, mode: 'unattended', bucket: 'applied_by_transform',
      change: 'recorded only', rule: 'Applied by apply_resolutions() at 2026-10-07T18:00:00Z.', flagged: null,
      title: 'assignment:IST.352/x', course: 'IST.352',
    });
    expect(templatedDecision(row({ ref: null, state: 'dismissed' }), 'dismissed', 1).title).toBe('item 3101');
    expect(templatedDecision(row({ kind: 'conflict', accept: 'keep' }), 'kept', 1).rule).toMatch(/Keep mine stands/);
  });

  it('splits the queue: templated, at most six for Claude, the rest deferred, skipped rows left out', () => {
    const queue = [
      queueRow({ id: 1, was_applied: true }),
      queueRow({ id: 2, state: 'dismissed', has_note: true }),
      ...[3, 4, 5, 6, 7, 8, 9].map((id) => queueRow({ id })),
      queueRow({ id: 10 }),
    ];
    const plan = planBatch(parsePrepared({ params: { skip: [4, 99] }, queue }));
    expect(plan.templated.map((t) => [t.row.id, t.bucket])).toEqual([[1, 'applied_by_transform']]);
    expect(plan.forClaude.map((r) => r.id)).toEqual([2, 3, 5, 6, 7, 8]);
    expect(plan.forClaude).toHaveLength(BATCH_MAX_ITEMS);
    expect(plan.deferred).toEqual([9, 10]);
    expect(plan.skipped).toEqual([4]);
    expect(planBatch(parsePrepared({ queue: [] }))).toEqual({ templated: [], forClaude: [], deferred: [], skipped: [] });
  });
});

describe('the SQL guard', () => {
  const refused = (sql: unknown, mode: 'query' | 'execute') => {
    const verdict = checkSql(sql, mode);
    return verdict.ok ? null : verdict.reason;
  };

  it('masks comments and string contents, and drops identifier quotes', () => {
    expect(maskSql("select 'net.http_post(' as x -- net.\nfrom t /* vault. */ where a = $$do it$$")).toBe("select '' as x \nfrom t   where a = ''");
    expect(maskSql('select "NET".http_post')).toBe('select net.http_post');
    expect(maskSql("select 'it''s' , e'a\\'b'")).toBe("select '' , e''");
    expect(maskSql("select 'open")).toBeNull();
    expect(maskSql('select /* open')).toBeNull();
    expect(maskSql('select $tag$ open')).toBeNull();
  });

  it('lets a read through the query tool, one statement only', () => {
    expect(refused('select * from assignments a where a.course_id = \'IST.352\'', 'query')).toBeNull();
    expect(refused('with x as (select id from sync_runs order by id desc limit 1) select * from x;', 'query')).toBeNull();
    expect(refused("select decision->>'rule' from attention_items where question like '%delete the net. row%'", 'query')).toBeNull();
    expect(refused('select 1; select 2', 'query')).toMatch(/one statement/);
    expect(refused('update assignments set title = title', 'query')).toMatch(/starts with "update"/);
    expect(refused('select * into t2 from assignments', 'query')).toMatch(/only reads/);
    expect(refused('select inbox_apply_archive(1, 2, \'{}\')', 'query')).toMatch(/only reads/);
    expect(refused('explain select 1', 'query')).toMatch(/starts with "explain"/);
  });

  it("lets the writer's item transaction through", () => {
    const batch = `begin;
select inbox_apply_begin_item(1860, 3101);
update assignments set component_id = 12, source_ref = coalesce(source_ref || ' | ', '') || 'STACK_OVERRIDE "yes" verified_on:2026-10-07' where id = 'IST.352/x';
insert into assignment_progress (assignment_id, status) values ('IST.352/x', 'todo');
select raise_attention((select max(id) from sync_runs), 'stack_must_confirm', 'IST.352', 'assignment', 'r', null, null, null, 'q?', null);
select inbox_apply_archive(1860, 3101, '{"schema":"inbox-decision/1","change":"confirmed; net. and delete are only words here"}'::jsonb);
commit;`;
    expect(refused(batch, 'execute')).toBeNull();
    expect(refused('rollback;', 'execute')).toBeNull();
  });

  it.each([
    ['another schema', "select net.http_post('https://x.example', '{}'::jsonb)", /schema net/],
    ['a quoted schema', 'select "net"."http_post"(\'https://x.example\')', /schema net/],
    ['a bare http function', "select http_post('https://x.example', '{}')", /calls http_post/],
    ['the vault', 'select * from vault.decrypted_secrets', /schema vault/],
    ['the catalog', 'select * from pg_catalog.pg_authid', /schema pg_catalog/],
    ['the search path', "select set_config('search_path', 'net', true)", /set_config/],
    ['a set statement', 'set search_path = net', /starts with "set"/],
    ['a role switch', 'set role postgres', /starts with "set"/],
    ['a do block', "do $$ begin perform 1; end $$", /starts with "do"/],
    ['a delete', 'delete from assignments', /starts with "delete"/],
    ['a delete in a CTE', 'with gone as (delete from assignments returning id) select * from gone', /never deleted/],
    ['a copy', "copy assignments to program 'curl x'", /starts with "copy"/],
    ['ddl', 'create table t (id int)', /starts with "create"/],
    ["the worker's claim", 'select * from inbox_apply_claim()', /inbox_apply_claim/],
    ["the worker's close", "select inbox_apply_close(1, 'done', '{}')", /inbox_apply_close/],
    ['the write log', "insert into inbox_apply_writes (item_id, table_name, op, new_row) values (1, 'x', 'insert', '{}')", /inbox_apply_writes/],
    ['a sync function', "select sync_enqueue('just')", /sync_enqueue/],
    ['a direct archive', "select archive_attention_item(1, '{}'::jsonb)", /archive_attention_item/],
    ['dblink', "select * from dblink('host=x', 'select 1') as t(a int)", /dblink/],
    ['a file read', "select pg_read_file('/etc/passwd')", /pg_read_file/],
  ])('refuses %s', (_label, sql, reason) => {
    expect(refused(sql, 'execute')).toMatch(reason);
  });

  it('refuses text it cannot read', () => {
    expect(refused('', 'query')).toMatch(/non-empty/);
    expect(refused(undefined, 'query')).toMatch(/non-empty/);
    expect(refused(42, 'execute')).toMatch(/non-empty/);
    expect(refused(`select '${'x'.repeat(20_001)}'`, 'query')).toMatch(/longer than/);
    expect(refused("select 'never closed", 'execute')).toMatch(/never closed/);
    expect(refused('select 1\u0000', 'query')).toMatch(/NUL/);
    expect(refused('-- nothing here', 'execute')).toMatch(/no statement/);
  });
});

describe('the tool gate', () => {
  const allowed = (payload: unknown) => {
    const decision = decide(payload);
    return decision.allow ? true : decision.reason;
  };

  it('the session starts the two agents and nothing else', () => {
    expect(allowed({ tool_name: 'Agent', tool_input: { subagent_type: 'inbox-context' } })).toBe(true);
    expect(allowed({ tool_name: 'Task', tool_input: { subagent_type: 'inbox-writer' } })).toBe(true);
    expect(allowed({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose' } })).toMatch(/only the inbox-context and inbox-writer/);
    expect(allowed({ tool_name: 'Agent', tool_input: {} })).toMatch(/only the/);
    expect(allowed({ tool_name: 'Agent', agent_type: 'inbox-context', tool_input: { subagent_type: 'inbox-writer' } })).toMatch(/cannot start another agent/);
  });

  it('only the writer reaches the tool that writes', () => {
    const write = { tool_name: 'mcp__db__execute_sql', tool_input: { sql: 'begin; select inbox_apply_begin_item(1, 2); commit;' } };
    expect(allowed({ ...write, agent_type: 'inbox-writer' })).toBe(true);
    expect(allowed({ ...write, agent_type: 'inbox-context' })).toMatch(/only the inbox-writer agent writes/);
    expect(allowed(write)).toMatch(/only the inbox-writer agent writes/);
  });

  it('everyone reads, through the guard', () => {
    const read = { tool_name: 'mcp__db__query', tool_input: { sql: 'select 1' } };
    expect(allowed(read)).toBe(true);
    expect(allowed({ ...read, agent_type: 'inbox-context' })).toBe(true);
    expect(allowed({ ...read, agent_type: 'inbox-writer' })).toBe(true);
    expect(allowed({ tool_name: 'mcp__db__query', tool_input: { sql: "select net.http_get('https://x.example')" } })).toMatch(/sql refused: sql names the schema net/);
    expect(allowed({ tool_name: 'mcp__db__query', tool_input: {} })).toMatch(/sql refused/);
    expect(allowed({ tool_name: 'mcp__db__execute_sql', agent_type: 'inbox-writer', tool_input: { sql: 'delete from assignments' } })).toMatch(/sql refused/);
  });

  it('the materials tools are allowed; every other tool, agent and unreadable input is refused', () => {
    expect(allowed({ tool_name: 'mcp__bb2dash__search_materials', agent_type: 'inbox-context', tool_input: { query: 'late policy' } })).toBe(true);
    expect(allowed({ tool_name: 'mcp__bb2dash__list_courses' })).toBe(true);
    for (const tool of ['Bash', 'Read', 'Write', 'WebFetch', 'mcp__rag__search_context', 'mcp__db__drop']) {
      expect(allowed({ tool_name: tool, tool_input: {} })).toMatch(/tool not allowed/);
    }
    expect(allowed({ tool_name: 'mcp__db__query', agent_type: 'general-purpose', tool_input: { sql: 'select 1' } })).toMatch(/agent not allowed/);
    expect(allowed({ tool_name: 'mcp__db__query', agent_type: 7, tool_input: { sql: 'select 1' } })).toMatch(/agent_type is not text/);
    expect(allowed(null)).toMatch(/not a JSON object/);
    expect(allowed([])).toMatch(/not a JSON object/);
    expect(allowed({ tool_input: {} })).toMatch(/names no tool/);
    expect(allowed({ tool_name: '' })).toMatch(/names no tool/);
  });
});

describe('the report', () => {
  const facts = (over: Partial<RunFacts> = {}): RunFacts => ({ archivedIds: [], changedIds: [], unarchivedWrites: [], flagged: [], leftIds: [], ...over });
  const finished: ClaudeOutcome = { exitCode: 0, timedOut: false, costUsd: 0.42, error: null, detail: null };

  it('reads the run facts, dropping what is not an id', () => {
    expect(
      parseRunFacts({ archived_ids: [1, 2, 'x'], changed_ids: [1], writes: 2, unarchived_writes: [], left_ids: [9],
        flagged: [{ item: 1, flagged: { item: 50 } }, { item: 'x', flagged: {} }, { item: 2, flagged: null }] }),
    ).toEqual({ archivedIds: [1, 2], changedIds: [1], unarchivedWrites: [], leftIds: [9], flagged: [{ item: 1, flagged: { item: 50 } }] });
    expect(() => parseRunFacts(null)).toThrow(/not an object/);
  });

  it('a clean run is done, and its first line counts from the tables', () => {
    const report = buildReport({ trigger: 'sync', batchIds: [1, 2], priorSkip: [], capped: false, claude: finished,
      facts: facts({ archivedIds: [1, 2, 3], changedIds: [1, 2] }) });
    expect(report.state).toBe('done');
    expect(report.result).toMatchObject({
      lines: ['2 answers applied, 1 recorded only'], archived: 3, changed: 2, recorded_only: 1, left: 0, skip: [], trigger: 'sync', error: null,
      claude: { started: true, exit_code: 0, timed_out: false, cost_usd: 0.42 },
    });
  });

  it('nothing in the queue, or only templated rows: done, and Claude never started', () => {
    expect(buildReport({ trigger: null, batchIds: [], priorSkip: [], capped: false, claude: null, facts: facts() })).toMatchObject({
      state: 'done', result: { lines: ['Nothing to apply'], archived: 0, claude: { started: false }, error: null },
    });
    const templated = buildReport({ trigger: 'sync', batchIds: [], priorSkip: [], capped: false, claude: null, facts: facts({ archivedIds: [5] }) });
    expect(templated.result.lines).toEqual(['1 recorded only']);
  });

  it('an item Claude did not archive fails the request and is skipped by the follow-up', () => {
    const report = buildReport({ trigger: 'sync', batchIds: [1, 2], priorSkip: [7, 8], capped: false, claude: finished,
      facts: facts({ archivedIds: [1], changedIds: [1], leftIds: [2, 8, 9] }) });
    expect(report.state).toBe('failed');
    expect(report.result).toMatchObject({ error: 'not_applied', skip: [2, 8], archived: 1, left: 3 });
    expect(report.result.lines).toEqual([
      '1 answer applied, 1 could not be applied',
      'Some answers could not be applied.',
      'Not applied: 1 item 2.',
      '3 answers still waiting.',
    ]);
  });

  it('an item taken back mid-run is neither applied nor a failure', () => {
    const report = buildReport({ trigger: 'sync', batchIds: [1, 2], priorSkip: [], capped: false, claude: finished,
      facts: facts({ archivedIds: [1], changedIds: [1], leftIds: [] }) });
    expect(report).toMatchObject({ state: 'done', result: { lines: ['1 answer applied'], skip: [], error: null } });
  });

  it("a run that ended badly carries Claude's error and one sentence, with what was archived before it", () => {
    const timedOut: ClaudeOutcome = { exitCode: null, timedOut: true, costUsd: null, error: 'timed_out', detail: 'The run was stopped at 14 minutes.' };
    const report = buildReport({ trigger: 'followup', batchIds: [1, 2, 3], priorSkip: [], capped: false, claude: timedOut,
      facts: facts({ archivedIds: [1], changedIds: [1], leftIds: [2, 3], unarchivedWrites: [2] }) });
    expect(report.state).toBe('failed');
    expect(report.result).toMatchObject({ error: 'timed_out', archived: 1, skip: [2, 3], claude: { started: true, timed_out: true, exit_code: null } });
    expect(report.result.lines).toEqual([
      '1 answer applied, 2 could not be applied',
      'The run was stopped at 14 minutes.',
      'Not applied: 2 items 2, 3.',
      'Written but not archived, check these: 1 item 2.',
      '2 answers still waiting.',
    ]);
    const expired = buildReport({ trigger: 'sync', batchIds: [1], priorSkip: [], capped: false,
      claude: { exitCode: 1, timedOut: false, costUsd: null, error: 'sign_in_expired', detail: null }, facts: facts({ leftIds: [1] }) });
    expect(expired.result.error).toBe('sign_in_expired');
    expect((expired.result.lines as string[])[1]).toBe("The apply worker's Claude sign-in has expired.");
  });

  it("the day's cap is a failure that names itself, and flagged items are listed", () => {
    const capped = buildReport({ trigger: 'sync', batchIds: [], priorSkip: [], capped: true, claude: null, facts: facts({ archivedIds: [5], leftIds: [1, 2] }) });
    expect(capped).toMatchObject({ state: 'failed', result: { error: 'daily_cap', claude: { started: false }, skip: [] } });
    expect((capped.result.lines as string[])[1]).toMatch(/Today's limit on apply runs/);

    const flagged = buildReport({ trigger: 'sync', batchIds: [1, 2], priorSkip: [], capped: false, claude: finished,
      facts: facts({ archivedIds: [1, 2], changedIds: [1], flagged: [{ item: 1, flagged: { item: 3200 } }, { item: 2, flagged: { code_change: 'a new view' } }] }) });
    expect(flagged.result.raised).toEqual([3200]);
    expect(flagged.result.lines).toEqual(['1 answer applied, 1 recorded only', 'Raised for you: 1 item 3200.', 'Flagged for a code change: 1 item 2.']);
  });
});
