// The apply worker's pure rules (Phase 23): the start-up checks, the batch, the SQL guard, the
// tool gate and the report. No process, no database, no network.

import { describe, expect, it } from 'vitest';

import { BATCH_MAX_ITEMS, RUN_BUDGET_DEFAULT_USD, assertApplyDsn, loadConfig, parseRunBudget, PATHS } from '../src/config.js';
import { parsePrepared, planBatch, templatedBucket, templatedDecision as decisionOf, templatedRecord, type QueueRow } from '../src/batch.js';

/** The record of a row the worker archives itself; the bucket named is the one the test expects it to get. */
function templatedDecision(row: QueueRow, bucket: string, requestId: number): Record<string, unknown> {
  const record = templatedRecord(row);
  if (record === null || record.bucket !== bucket) throw new Error(`expected a ${bucket} row, got ${record?.bucket ?? 'a row for a reader'}`);
  return decisionOf(record, requestId);
}
import { checkQuery, checkWrite } from '../src/mcp-sql/guard.js';
import { lex, statements } from '../src/mcp-sql/lexer.js';
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
    expect(prepared.queue[0]).toMatchObject({ id: 3101, courseId: 'IST.352', entity: 'assignment', hasNote: false, wasApplied: false });
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
    // A confirmed notice about a request names no course row: recorded here, never sent to Claude.
    expect(templatedBucket(row({ entity: 'agent_request', ref: 'inbox-apply-failed' }))).toBe('recorded_elsewhere');
    expect(templatedBucket(row({ entity: 'agent_request', ref: 'agent_request:580', has_note: true }))).toBeNull();
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
    expect(templatedDecision(row({ entity: 'agent_request' }), 'recorded_elsewhere', 1).rule).toMatch(/A notice about a request/);
  });

  /** A session-link answer as 185's inbox_apply_prepare returns it: the file, Stack's pick, the file's link now. */
  const sessionRow = (link: Record<string, unknown>, over: Partial<Record<string, unknown>> = {}): QueueRow =>
    row({
      entity: 'bb_file', ref: 'session_link/2489', field: 'session_id', course_id: 'GEO.103.lecture',
      session_link: { file_id: 2489, pick: 45, file_found: true, file_current: true, file_session_id: 45, ...link },
      ...over,
    });

  it('reads the session link of a row, and none where prepare sent none or sent it broken', () => {
    expect(sessionRow({}).sessionLink).toEqual({ fileId: 2489, pick: 45, fileCurrent: true, fileSessionId: 45 });
    expect(sessionRow({ pick: null, file_session_id: null }).sessionLink).toEqual({ fileId: 2489, pick: null, fileCurrent: true, fileSessionId: null });
    // A file that is gone or superseded is not current, whatever else the object says.
    expect(sessionRow({ file_found: false }).sessionLink?.fileCurrent).toBe(false);
    expect(sessionRow({ file_current: false }).sessionLink?.fileCurrent).toBe(false);
    expect(row({}).sessionLink).toBeNull();
    expect(row({ session_link: 'x' }).sessionLink).toBeNull();
    expect(row({ session_link: { file_id: 'x', pick: 45 } }).sessionLink).toBeNull();
  });

  it('records a session answer by itself when the file shows what link_file_sessions did with it', () => {
    // His pick is on the file: the fold applied it (123, 163).
    expect(templatedBucket(sessionRow({}))).toBe('applied_by_transform');
    expect(templatedDecision(sessionRow({}), 'applied_by_transform', 9).rule).toBe(
      'File 2489 carries session 45, his pick, set by link_file_sessions (migrations 123, 163).',
    );
    // "None": the file stays unlinked, which is the answer applied.
    const none = sessionRow({ pick: null, file_session_id: null }, { accept: 'none' });
    expect(templatedBucket(none)).toBe('applied_by_transform');
    expect(templatedDecision(none, 'applied_by_transform', 9).rule).toMatch(/^Answered none: file 2489 is unlinked/);
  });

  it('sends a session answer to a reader when it carries a note or the file does not agree with it', () => {
    expect(templatedBucket(sessionRow({}, { has_note: true }))).toBeNull();
    // A pick that is not on the file: answered since the last fold, or declined by one that read
    // it. The row cannot say which, so nothing is recorded on a promise.
    expect(templatedBucket(sessionRow({ file_session_id: null }))).toBeNull();
    // The file carries another session than the one he picked.
    expect(templatedBucket(sessionRow({ file_session_id: 44 }))).toBeNull();
    // "None", and the file is linked all the same.
    expect(templatedBucket(sessionRow({ pick: null, file_session_id: 44 }, { accept: 'none' }))).toBeNull();
    // Neither a pick nor "none".
    expect(templatedBucket(sessionRow({ pick: null, file_session_id: null }))).toBeNull();
    // The file is gone or superseded.
    expect(templatedBucket(sessionRow({ file_current: false }))).toBeNull();
    // A dismissed one is still just dismissed.
    expect(templatedBucket(sessionRow({ file_session_id: 44 }, { state: 'dismissed' }))).toBe('dismissed');
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

describe('the tokenizer', () => {
  const words = (sql: string) => {
    const lexed = lex(sql);
    return lexed.ok ? lexed.tokens.map((t) => (t.kind === 'word' || t.kind === 'symbol' ? t.text : t.kind)).join(' ') : `REFUSED: ${lexed.reason}`;
  };

  it('drops comments, empties strings, and lower-cases names, quoted ones too', () => {
    expect(words("SELECT 'net.http_post(' AS x -- net.\nFROM t /* vault. /* nested */ still */ WHERE a = $$do it$$")).toBe('select string as x from t where a = string');
    expect(words('select "NET"."Http_Post"(1)')).toBe('select net . http_post ( number )');
    expect(words("select 'it''s', E'a\\'b', $tag$ x $tag$")).toBe('select string , string , string');
  });

  it('reads the spellings the first guard misread, as the server does', () => {
    // A `$` inside a name is part of the name, not the start of a dollar quote.
    expect(words("select 1 as x$y$, inbox_apply_close(1) as z$y$")).toBe('select number as x$y$ , inbox_apply_close ( number ) as z$y$');
    // A quote inside a quoted identifier is part of the identifier.
    expect(words(`select 1 as "'", set_config('a', 'b', true) as "'"`)).toBe("select number as ' , set_config ( string , string , true ) as '");
    // `--` inside a quoted identifier is not a comment.
    expect(words('select 1 as "--", inbox_apply_claim()')).toBe('select number as -- , inbox_apply_claim ( )');
    // In a standard string a backslash is a backslash: the string ends at the next quote.
    expect(words("select '\\', pg_sleep(1), '\\\\'")).toBe('select string , pg_sleep ( number ) , string');
    // ... so a value that ends in a backslash is an ordinary string.
    expect(words("update assignments set description = 'C:\\tmp\\' where id = 'x'")).toBe('update assignments set description = string where id = string');
  });

  it('refuses what it does not read', () => {
    expect(words('select U&"inbox\\005fapply\\005fclose"(1)')).toMatch(/REFUSED: a Unicode-escaped/);
    expect(words("select U&'\\0041'")).toMatch(/REFUSED: a Unicode-escaped/);
    expect(words("select 'open")).toMatch(/REFUSED: a string is never closed/);
    expect(words('select "open')).toMatch(/REFUSED: a quoted identifier is never closed/);
    expect(words('select /* open')).toMatch(/REFUSED: a comment is never closed/);
    expect(words('select $tag$ open')).toMatch(/REFUSED: a dollar-quoted string is never closed/);
    expect(words('select $1')).toMatch(/REFUSED: a \$n parameter/);
    expect(words('select 1 $ 2')).toMatch(/REFUSED: a stray \$/);
    expect(words('select ""')).toMatch(/REFUSED: an empty quoted identifier/);
    expect(words('select 1\u0000')).toMatch(/REFUSED: sql holds a NUL/);
  });

  it('splits statements on the semicolons that are not inside a string', () => {
    const lexed = lex("select ';' ; update t set a = 1;;");
    expect(lexed.ok && statements(lexed.tokens).map((s) => s[0]!.text)).toEqual(['select', 'update']);
  });
});

describe('the SQL guard: a read', () => {
  const refused = (sql: unknown) => {
    const verdict = checkQuery(sql);
    return verdict.ok ? null : verdict.reason;
  };

  it('lets one select through', () => {
    expect(refused("select * from assignments a where a.course_id = 'IST.352'")).toBeNull();
    expect(refused('with x as (select id from sync_runs order by id desc limit 1) select * from x;')).toBeNull();
    expect(refused("select decision->>'rule' from attention_items where question like '%delete the net. row%'")).toBeNull();
    expect(refused('select inbox_apply_run_facts(1)')).toBeNull();
  });

  it.each([
    ['two statements', 'select 1; select 2', /one statement at a time/],
    ['a write', 'update assignments set title = title', /starts with "update"/],
    ['another schema', "select net.http_get('https://x.example')", /schema net/],
    ['a quoted schema', 'select "net"."http_get"(\'https://x.example\')', /schema net/],
    ['the catalog', 'select * from pg_catalog.pg_authid', /schema pg_catalog/],
    ['a sleep', 'select pg_sleep(600)', /calls pg_sleep/],
    ['an advisory lock', 'select pg_advisory_lock(1400910002)', /calls pg_advisory_lock/],
    ['a setting', "select set_config('inbox_apply.item', '1', false)", /calls set_config/],
    ['a query given as text', "select query_to_xml('select 1', true, false, '')", /calls query_to_xml/],
    ['a tsquery rewrite from a query', "select ts_rewrite('a'::tsquery, 'select 1')", /calls ts_rewrite/],
    ['an explain', 'explain select 1', /starts with "explain"/],
    ['a do block', 'do $$ begin perform 1; end $$', /starts with "do"/],
    ["a bypass spelled with a $ in a name", "select 1 as x$y$, pg_sleep(1) as z$y$", /calls pg_sleep/],
    ['a bypass spelled with a quote in a name', `select 1 as "'", set_config('a', 'b', true) as "'"`, /calls set_config/],
    ['a bypass spelled with a backslash', "select '\\', pg_sleep(1), '\\\\'", /calls pg_sleep/],
    ['a Unicode-escaped name', 'select U&"pg\\005fsleep"(1)', /Unicode-escaped/],
  ])('refuses %s', (_label, sql, reason) => {
    expect(refused(sql)).toMatch(reason);
  });

  it('refuses text it cannot read', () => {
    expect(refused('')).toMatch(/non-empty/);
    expect(refused(undefined)).toMatch(/non-empty/);
    expect(refused(`select '${'x'.repeat(20_001)}'`)).toMatch(/longer than/);
    expect(refused("select 'never closed")).toMatch(/never closed/);
    expect(refused('-- nothing here')).toMatch(/no statement/);
  });
});

describe('the SQL guard: a write statement', () => {
  const refused = (sql: unknown) => {
    const verdict = checkWrite(sql);
    return verdict.ok ? null : verdict.reason;
  };

  it('lets the skill\'s writes through', () => {
    for (const sql of [
      "update assignments set component_id = 12, source_ref = coalesce(source_ref || ' | ', '') || 'STACK_OVERRIDE \"yes\" verified_on:2026-10-07' where id = 'IST.352/x' returning *",
      "update public.assignments set description = 'C:\\tmp\\' where id = 'IST.352/x'",
      "insert into assignment_progress (assignment_id, status) values ('IST.352/x', 'todo') on conflict (assignment_id) do update set status = excluded.status returning *",
      "insert into course_staff (course_id, name, role) values ('IST.352', 'A. Person', 'ta')",
      "update courses set group_notes = 'Team 3; the word delete in a string is only a word' where id = 'IST.352'",
      "update assignments set due_at = to_timestamp('2026-10-16 23:59', 'YYYY-MM-DD HH24:MI') where id in (select id from assignments where series_key = 'lab' and course_id = 'IST.323')",
      "update assignments set points_possible = cast('10' as numeric(6, 2)), updated_at = now() where id = 'x'",
      "select raise_attention((select max(id) from sync_runs), 'stack_must_confirm', 'IST.352', 'assignment', 'r', null, null, null, 'q?', null)",
      "select public.raise_attention(null, 'stack_must_confirm', null, 'assignment', 'r', null, null, null, 'q?', null);",
    ]) {
      expect(refused(sql), sql).toBeNull();
    }
  });

  it.each([
    ['a post through pg_net', "update assignments set title = title where id = 'x' and net.http_post('https://x.example', '{}'::jsonb) is not null", /schema net/],
    ['a quoted pg_net call', 'update assignments set title = title where "net"."http_post"(\'https://x.example\') > 0', /schema net/],
    ['a bare http call', "update assignments set title = title where http_post('https://x.example', '{}') > 0", /calls http_post, which a write statement may not call/],
    ['the bypass with a $ in a name', "select 1 as x$y$, net.http_post('https://x.example') as z$y$", /only select a write may be/],
    ["the worker's close", "update assignments set title = title where inbox_apply_close(1, 'done', '{}'::jsonb) is null", /calls inbox_apply_close/],
    ["the worker's claim", "insert into course_staff (name) select 'x' from inbox_apply_claim()", /calls inbox_apply_claim/],
    ['the archive call, which is the server\'s', "select inbox_apply_archive(1, 2, '{}'::jsonb)", /only select a write may be/],
    ['a read as a write', 'select * from assignments', /only select a write may be/],
    ['a query given as text', "update assignments set title = query_to_xml('select 1', true, false, '')::text", /calls query_to_xml/],
    ['an unknown function', "update assignments set title = pg_sleep(1)::text", /calls pg_sleep, which a write statement may not call/],
    ['a function of another schema', "update assignments set title = extensions.digest('a', 'sha256')::text", /schema extensions/],
    ['a qualified call outside public', "update assignments set title = myschema.f(1)", /calls myschema\.f; only public/],
    ['a quoted name used as a call', 'update assignments set title = "values"(1)', /calls values, which a write statement may not call/],
    ['another table', "update attention_items set state = 'open'", /an update is on one of/],
    ['the write log', "insert into inbox_apply_writes (item_id, table_name, op, new_row) values (1, 'x', 'insert', '{}')", /an insert goes into one of/],
    ['an insert into courses', "insert into courses (id) values ('x')", /an insert goes into one of/],
    ['a queue row for pg_net', "insert into net.http_request_queue (url) values ('https://x.example')", /an insert goes into one of/],
    ['a delete', "delete from assignments where id = 'x'", /starts with "delete"/],
    ['a delete inside a CTE', "with gone as (delete from assignments returning id) update courses set group_notes = 'x'", /starts with "with"/],
    ['two statements', "update assignments set title = 'a'; update assignments set title = 'b'", /one statement at a time/],
    ['a transaction word', 'commit', /starts with "commit"/],
    ['a do block', 'do $$ begin perform 1; end $$', /starts with "do"/],
    ['a set', 'set role postgres', /starts with "set"/],
    ['a merge', 'update assignments set title = (select 1 from (merge into x using y on true when matched then delete) m)', /"merge" is not part of a write statement/],
    ['a Unicode-escaped name', 'update assignments set title = U&"net".x', /Unicode-escaped/],
  ])('refuses %s', (_label, sql, reason) => {
    expect(refused(sql)).toMatch(reason);
  });
});

describe('the tool gate', () => {
  const allowed = (payload: unknown) => {
    const decision = decide(payload);
    return decision.allow ? true : decision.reason;
  };
  const item = { request: 1860, item: 3101, statements: ["update assignments set component_id = 12 where id = 'IST.352/x'"], record: { bucket: 'needs_change', change: 'confirmed', rule: '' } };

  it('the session starts the two agents and nothing else', () => {
    expect(allowed({ tool_name: 'Agent', tool_input: { subagent_type: 'inbox-context' } })).toBe(true);
    expect(allowed({ tool_name: 'Task', tool_input: { subagent_type: 'inbox-writer' } })).toBe(true);
    expect(allowed({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose' } })).toMatch(/only the inbox-context and inbox-writer/);
    expect(allowed({ tool_name: 'Agent', tool_input: {} })).toMatch(/only the/);
    expect(allowed({ tool_name: 'Agent', agent_type: 'inbox-context', tool_input: { subagent_type: 'inbox-writer' } })).toMatch(/cannot start another agent/);
  });

  it('only the writer reaches the tool that writes', () => {
    const write = { tool_name: 'mcp__db__apply_item', tool_input: item };
    expect(allowed({ ...write, agent_type: 'inbox-writer' })).toBe(true);
    expect(allowed({ ...write, agent_type: 'inbox-context' })).toMatch(/only the inbox-writer agent writes/);
    expect(allowed(write)).toMatch(/only the inbox-writer agent writes/);
  });

  it('an item is checked statement by statement before the server sees it', () => {
    const write = (over: Record<string, unknown>) => allowed({ tool_name: 'mcp__db__apply_item', agent_type: 'inbox-writer', tool_input: { ...item, ...over } });
    expect(write({ statements: [] })).toBe(true);
    expect(write({ statements: [item.statements[0], "update assignments set title = title where net.http_post('https://x.example') > 0"] })).toMatch(/apply_item refused: statement 2: sql names the schema net/);
    expect(write({ statements: ['delete from assignments'] })).toMatch(/statement 1: a write statement is an insert/);
    expect(write({ statements: 'update assignments set title = title' })).toMatch(/statements must be a list/);
    expect(write({ statements: Array.from({ length: 13 }, () => item.statements[0]) })).toMatch(/at most 12 statements/);
    expect(write({ request: '1860' })).toMatch(/request must be the request id/);
    expect(write({ item: 0 })).toMatch(/item must be the item id/);
    expect(write({ record: 'confirmed' })).toMatch(/record must be the inbox-decision\/1 object/);
    expect(write({ record: { change: 'x'.repeat(20_001) } })).toMatch(/the record is longer than/);
    // "Closed itself" is how a question nobody answered is archived: on Stack's answer it would
    // make link_file_sessions read the answer as never given (163).
    expect(write({ record: { change: 'recorded only', closed_itself: true } })).toMatch(/the record may not carry closed_itself/);
    expect(write({ record: { change: 'recorded only', closed_itself: false } })).toMatch(/the record may not carry closed_itself/);
    expect(allowed({ tool_name: 'mcp__db__apply_item', agent_type: 'inbox-writer', tool_input: null })).toMatch(/the arguments are not an object/);
  });

  it('everyone reads, through the guard', () => {
    const read = { tool_name: 'mcp__db__query', tool_input: { sql: 'select 1' } };
    expect(allowed(read)).toBe(true);
    expect(allowed({ ...read, agent_type: 'inbox-context' })).toBe(true);
    expect(allowed({ ...read, agent_type: 'inbox-writer' })).toBe(true);
    expect(allowed({ tool_name: 'mcp__db__query', tool_input: { sql: "select net.http_get('https://x.example')" } })).toMatch(/sql refused: sql names the schema net/);
    expect(allowed({ tool_name: 'mcp__db__query', tool_input: {} })).toMatch(/sql refused/);
  });

  it('the materials tools are allowed; every other tool, agent and unreadable input is refused', () => {
    expect(allowed({ tool_name: 'mcp__bb2dash__search_materials', agent_type: 'inbox-context', tool_input: { query: 'late policy' } })).toBe(true);
    expect(allowed({ tool_name: 'mcp__bb2dash__list_courses' })).toBe(true);
    for (const tool of ['Bash', 'Read', 'Write', 'WebFetch', 'mcp__rag__search_context', 'mcp__db__execute_sql', 'mcp__db__drop']) {
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
    // Items 2 and 3 were never reached: they are not in skip, so the follow-up takes them.
    expect(report.result).toMatchObject({ error: 'timed_out', archived: 1, skip: [], claude: { started: true, timed_out: true, exit_code: null } });
    expect(report.result.lines).toEqual([
      '1 answer applied, 2 not reached',
      'The run was stopped at 14 minutes.',
      'Not reached: 2 items 2, 3.',
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
