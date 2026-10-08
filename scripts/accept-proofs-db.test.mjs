// bb2dash :: scripts/accept-proofs-db.test.mjs
// The acceptance run's proofs against a real Postgres that lives in this process (PGlite: Postgres
// compiled to WASM, a dev dependency of scripts/). Nothing here reaches a network or the real
// database. Run, after `npm ci` in scripts/:
//   node --test scripts/accept-proofs-db.test.mjs
//
// What is held: the server itself refuses a second statement and a write, whatever the lint read;
// and each of Phase 21's seven statements decides right on rows made for the case.
//
// The tables are the ones the statements read, with the columns they name and no others; a test
// holds each of those columns against the migrations.

import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';

import { EXIT, run, runReadOnly } from './accept-proofs.mjs';
import { PACK_21, argvFor, columnsOf } from './accept-proofs-kit.mjs';

/** table -> column -> its type here. The names are the migrations'; the types are the plain ones a statement needs. */
const TABLES = {
  assignments: { id: 'text primary key' },
  assignment_progress: { assignment_id: 'text primary key', updated_at: 'timestamptz not null default now()' },
  reading_progress: { reading_id: 'bigint primary key', updated_at: 'timestamptz not null default now()' },
  agent_requests: {
    id: 'bigint generated always as identity primary key',
    created_at: 'timestamptz not null default now()',
    kind: 'text not null',
    state: "text not null default 'queued'",
    claimed_at: 'timestamptz',
    finished_at: 'timestamptz',
  },
  workspace_conversations: {
    id: 'uuid primary key',
    created_at: 'timestamptz not null default now()',
    title: 'text not null',
    archived: 'boolean not null default false',
  },
  workspace_messages: {
    id: 'uuid primary key',
    conversation_id: 'uuid not null',
    role: 'text not null',
    request_id: 'bigint',
    tier: 'text',
    provider: 'text',
    model: 'text',
    content: "text not null default ''",
    tool_calls: "jsonb not null default '[]'::jsonb",
    finished: 'boolean not null default false',
    error_code: 'text',
  },
  workspace_requests: {
    id: 'bigint primary key',
    created_at: 'timestamptz not null default now()',
    conversation_id: 'uuid not null',
    user_message_id: 'uuid not null',
    state: "text not null default 'queued'",
    claimed_at: 'timestamptz',
    finished_at: 'timestamptz',
    error_code: 'text',
  },
};

const ddlOf = ([table, columns]) => `create table public.${table} (${Object.entries(columns).map(([name, type]) => `${name} ${type}`).join(', ')});`;

/** SQLSTATE: a prepared statement holds one command. */
const ONE_COMMAND_ONLY = '42601';
/** SQLSTATE: a write inside a read-only transaction. */
const READ_ONLY_TRANSACTION = '25006';

let db;

before(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(Object.entries(TABLES).map(ddlOf).join('\n'));
});

beforeEach(async () => {
  await db.exec(`truncate ${Object.keys(TABLES).map((table) => `public.${table}`).join(', ')} restart identity;`);
});

after(async () => {
  await db?.close();
});

/**
 * The in-process database behind a pg.Client's face. A query is sent the way node-postgres sends
 * it: by the extended protocol when it is asked for (`queryMode: 'extended'`) or has values, and
 * by the simple protocol, where one text may hold several statements, when it is a bare text.
 */
function clientOn(database) {
  return {
    async connect() {},
    async end() {},
    async query(first, second) {
      const asked = typeof first === 'string' ? { text: first, values: second } : first;
      const extended = asked.queryMode === 'extended' || (asked.values ?? []).length > 0;
      if (extended) return database.query(asked.text, asked.values ?? []);
      const results = await database.exec(asked.text);
      return results.length === 1 ? results[0] : results;
    },
  };
}

const countOf = async (table) => (await db.query(`select count(*)::integer as n from public.${table}`)).rows[0].n;
const unexpectedRollbackError = (error) => assert.fail(`rollback failed: ${error.message}`);

test('every table and column these cases are made of is in the migrations', () => {
  for (const [table, columns] of Object.entries(TABLES)) {
    for (const column of Object.keys(columns)) assert.ok(columnsOf(table).has(column), `${table}.${column}`);
  }
});

/* ---------------------------------------------------------------------------------------------
 * Read-only in fact: what the server refuses, whatever the lint read
 * ------------------------------------------------------------------------------------------ */

/** The review's text: the lint read `$y$ … $y$` as a quoted body and saw one select; the server sees four statements. */
const FOUR_STATEMENTS = 'select true as ok, 1 as x$y$ ; commit; delete from public.assignments; select 1 as z$y$';

test('the server refuses a second statement: a text of four cannot write', async () => {
  await db.exec("insert into public.assignments (id) values ('a'), ('b'), ('c')");
  await assert.rejects(runReadOnly(clientOn(db), FOUR_STATEMENTS, [], unexpectedRollbackError), (error) => error.code === ONE_COMMAND_ONLY);
  assert.equal(await countOf('assignments'), 3);

  // The control, so the refusal above is the protocol's and not this file's: by the simple
  // protocol the same text runs whole, its `commit` ends the read-only transaction, and the
  // delete after it is kept.
  const simple = clientOn(db);
  await simple.query('begin');
  await simple.query('set transaction read only');
  const results = await simple.query(FOUR_STATEMENTS);
  await simple.query('rollback');
  assert.equal(results.length, 4);
  assert.equal(await countOf('assignments'), 0);
});

test('the server refuses a write inside the one statement: the transaction is read-only', async () => {
  await db.exec("insert into public.assignments (id) values ('a'), ('b'), ('c')");
  const write = 'with gone as (delete from public.assignments returning id) select count(*) from gone';
  await assert.rejects(runReadOnly(clientOn(db), write, [], unexpectedRollbackError), (error) => error.code === READ_ONLY_TRANSACTION);
  assert.equal(await countOf('assignments'), 3);
});

/* ---------------------------------------------------------------------------------------------
 * Phase 21's seven proofs, each on rows made for the case
 * ------------------------------------------------------------------------------------------ */

/** The run's start as the host hands it over, and three moments around it. */
const SINCE = '2026-10-07T18:00:00.000Z';
const IN_RUN = '2026-10-07T18:05:00Z';
/** Half a minute before the start: inside the 60 seconds a proof allows for a host clock that runs ahead. */
const JUST_BEFORE = '2026-10-07T17:59:30Z';
/** Two minutes before: an earlier run's. */
const BEFORE_RUN = '2026-10-07T17:58:00Z';

const QUESTION = 'What is due this week, and for which course?';
const OTHER_QUESTION = 'What was due last week, and for which course?';
const ANSWER = 'The reading response is due on Friday; the handbook has the rule.';
const SEEDED_TEXT = /due this week|due last week|reading response|handbook/;

const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');

/** Runs one proof of the working tree's Phase 21 pack against the in-process database: its exit code and its one line. */
async function prove(name, params = {}) {
  const out = [];
  const err = [];
  const code = await run(argvFor(name, params), {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    readPack: () => PACK_21,
    clientFactory: async () => clientOn(db),
  });
  assert.equal(out.length, 1, 'one line is printed');
  // Whatever a proof decides, what was typed and answered stays in the database.
  assert.doesNotMatch(out[0], SEEDED_TEXT);
  const line = JSON.parse(out[0]);
  return { code, line, detail: line.detail, why: err.join('\n') };
}

async function seedConversation({ id = randomUUID(), title = 'A conversation', createdAt = IN_RUN, archived = false } = {}) {
  await db.query('insert into public.workspace_conversations (id, created_at, title, archived) values ($1, $2, $3, $4)', [id, createdAt, title, archived]);
  return id;
}

/**
 * One question as the app stores it: the user's message, its request, and the answer unless
 * `answer` is null. `claimedAfterS` is how long the request waited before the runner took it.
 */
async function seedTurn({ request, question = QUESTION, createdAt = IN_RUN, claimedAfterS = 2, state = 'done', errorCode = null, answer = {} }) {
  const conversation = await seedConversation({ createdAt });
  const userMessage = randomUUID();
  await db.query("insert into public.workspace_messages (id, conversation_id, role, content, finished) values ($1, $2, 'user', $3, true)", [userMessage, conversation, question]);
  await db.query(
    `insert into public.workspace_requests (id, created_at, conversation_id, user_message_id, state, claimed_at, finished_at, error_code)
     values ($1, $2::timestamptz, $3, $4, $5, $2::timestamptz + make_interval(secs => $6::integer), $2::timestamptz + interval '90 seconds', $7)`,
    [request, createdAt, conversation, userMessage, state, claimedAfterS, errorCode],
  );
  if (answer === null) return conversation;
  const { tier = 'low', finished = true, errorCode: answerError = null, toolCalls = [] } = answer;
  await db.query(
    `insert into public.workspace_messages (id, conversation_id, role, request_id, tier, provider, model, content, tool_calls, finished, error_code)
     values ($1, $2, 'assistant', $3, $4, 'claude-cli', 'claude-haiku-4-5', $5, $6::jsonb, $7, $8)`,
    [randomUUID(), conversation, request, tier, ANSWER, JSON.stringify(toolCalls), finished, answerError],
  );
  return conversation;
}

const USED_SEARCH = [{ tool: 'search_materials', scope: 'IST.323', ok: true }];
const turnOf = (request, more = {}) => ({ request: String(request), tier: 'low', since: SINCE, question_md5: md5(QUESTION), ...more });

test("turn: this run's request, asking the step's question, answered at the tier with the tool, passes", async () => {
  await seedTurn({ request: 412, answer: { toolCalls: USED_SEARCH } });
  const passed = await prove('turn', turnOf(412, { tool: 'search_materials' }));
  assert.equal(passed.code, EXIT.pass, passed.why);
  assert.deepEqual(
    { ...passed.detail, conversation_id: null, message_id: null },
    {
      request_id: 412,
      request_state: 'done',
      request_error_code: null,
      conversation_id: null,
      created_at: '2026-10-07T18:05:00.000Z',
      claimed_at: '2026-10-07T18:05:02.000Z',
      finished_at: '2026-10-07T18:06:30.000Z',
      run_started_at: SINCE,
      asked_in_this_run: true,
      question_matches: true,
      message_id: null,
      tier: 'low',
      provider: 'claude-cli',
      model: 'claude-haiku-4-5',
      finished: true,
      message_error_code: null,
      tools: USED_SEARCH,
      asked_after_earlier: true,
    },
  );
  assert.equal((await prove('turn', turnOf(412, { tool: 'search_materials', scope: 'IST.323' }))).code, EXIT.pass);
  assert.equal((await prove('turn', turnOf(412))).code, EXIT.pass);
  // The tier, the tool and the scope are each held.
  assert.equal((await prove('turn', turnOf(412, { tier: 'mid' }))).code, EXIT.fail);
  assert.equal((await prove('turn', turnOf(412, { tool: 'get_material_text' }))).code, EXIT.fail);
  assert.equal((await prove('turn', turnOf(412, { tool: 'search_materials', scope: 'ECN.304' }))).code, EXIT.fail);
  // And a request that is not there is no row, which is no pass.
  assert.deepEqual((await prove('turn', turnOf(999))).detail, { error: 'expected_one_row', rows: 0 });
});

test("turn: a request from before the run fails, however right it is; the 60 seconds are for the host's clock", async () => {
  await seedTurn({ request: 300, createdAt: BEFORE_RUN });
  const old = await prove('turn', turnOf(300));
  assert.equal(old.code, EXIT.fail);
  assert.deepEqual([old.detail.asked_in_this_run, old.detail.question_matches], [false, true]);

  await seedTurn({ request: 301, createdAt: JUST_BEFORE });
  assert.equal((await prove('turn', turnOf(301))).code, EXIT.pass);
});

test('turn: a request whose user message is another question fails', async () => {
  await seedTurn({ request: 413, question: OTHER_QUESTION });
  const other = await prove('turn', turnOf(413));
  assert.equal(other.code, EXIT.fail);
  assert.deepEqual([other.detail.asked_in_this_run, other.detail.question_matches], [true, false]);
  // The same request passes when the step's question is that one.
  assert.equal((await prove('turn', turnOf(413, { question_md5: md5(OTHER_QUESTION) }))).code, EXIT.pass);
});

test('turn: a request that failed, and an answer that is not finished, fail', async () => {
  await seedTurn({ request: 414, state: 'failed', errorCode: 'cli_error', answer: { errorCode: 'cli_error' } });
  await seedTurn({ request: 415, answer: { finished: false } });
  await seedTurn({ request: 416, answer: null });
  for (const request of [414, 415, 416]) assert.equal((await prove('turn', turnOf(request))).code, EXIT.fail, String(request));
});

test('turn: one request cannot stand for two steps: a step that names the one before it must be the later request', async () => {
  await seedTurn({ request: 440 });
  await seedTurn({ request: 441 });
  assert.equal((await prove('turn', turnOf(441, { after: '440' }))).code, EXIT.pass);
  // Step 9 handed step 7's request (the same question, the same tier), or its own id twice.
  for (const [request, after] of [[440, '441'], [441, '441']]) {
    const same = await prove('turn', turnOf(request, { after }));
    assert.equal(same.code, EXIT.fail, `${request} after ${after}`);
    assert.deepEqual([same.detail.asked_in_this_run, same.detail.question_matches, same.detail.asked_after_earlier], [true, true, false]);
  }
});

const stoppedOf = (request, more = {}) => ({ request: String(request), since: SINCE, question_md5: md5(QUESTION), ...more });
const STOPPED = { state: 'cancelled', errorCode: 'cancelled' };

test('turn-stopped: cancelled, with no answer begun or an answer that ends cancelled, passes', async () => {
  await seedTurn({ request: 417, ...STOPPED, answer: null });
  await seedTurn({ request: 418, ...STOPPED, answer: { tier: 'high', errorCode: 'cancelled' } });
  for (const request of [417, 418]) assert.equal((await prove('turn-stopped', stoppedOf(request))).code, EXIT.pass, String(request));
  // Done is not stopped, and neither is an answer that ended some other way.
  await seedTurn({ request: 419 });
  await seedTurn({ request: 420, ...STOPPED, answer: { tier: 'high', errorCode: null } });
  for (const request of [419, 420]) assert.equal((await prove('turn-stopped', stoppedOf(request))).code, EXIT.fail, String(request));
});

test('turn-stopped: a stop from before the run fails, and so does a stop of another question', async () => {
  await seedTurn({ request: 302, ...STOPPED, answer: null, createdAt: BEFORE_RUN });
  const old = await prove('turn-stopped', stoppedOf(302));
  assert.equal(old.code, EXIT.fail);
  assert.deepEqual([old.detail.asked_in_this_run, old.detail.question_matches], [false, true]);

  await seedTurn({ request: 421, ...STOPPED, answer: null, question: OTHER_QUESTION });
  const other = await prove('turn-stopped', stoppedOf(421));
  assert.equal(other.code, EXIT.fail);
  assert.deepEqual([other.detail.asked_in_this_run, other.detail.question_matches], [true, false]);
});

test('turn-stopped: a stop that names the step before it must be the later request', async () => {
  await seedTurn({ request: 442 });
  await seedTurn({ request: 443, ...STOPPED, answer: null });
  assert.equal((await prove('turn-stopped', stoppedOf(443, { after: '442' }))).code, EXIT.pass);
  const earlier = await prove('turn-stopped', stoppedOf(443, { after: '443' }));
  assert.equal(earlier.code, EXIT.fail);
  assert.equal(earlier.detail.asked_after_earlier, false);
});

const waitedOf = (request, more = {}) => ({ request: String(request), since: SINCE, min_wait_s: '15', question_md5: md5(QUESTION), ...more });

test('turn-answered-after: a request that waited but asks another question fails', async () => {
  await seedTurn({ request: 436, claimedAfterS: 212, question: OTHER_QUESTION });
  const other = await prove('turn-answered-after', waitedOf(436));
  assert.equal(other.code, EXIT.fail);
  assert.deepEqual([other.detail.asked_in_this_run, other.detail.question_matches, other.detail.waited_s], [true, false, 212]);
  assert.equal((await prove('turn-answered-after', waitedOf(436, { question_md5: md5(OTHER_QUESTION) }))).code, EXIT.pass);
});

test('turn-answered-after: a request claimed at once fails, and one that waited passes', async () => {
  await seedTurn({ request: 430, claimedAfterS: 1 });
  const atOnce = await prove('turn-answered-after', waitedOf(430));
  assert.equal(atOnce.code, EXIT.fail);
  assert.deepEqual([atOnce.detail.min_wait_s, atOnce.detail.waited_s], [15, 1]);

  await seedTurn({ request: 431, claimedAfterS: 14 });
  assert.equal((await prove('turn-answered-after', waitedOf(431))).code, EXIT.fail);

  await seedTurn({ request: 432, claimedAfterS: 15 });
  await seedTurn({ request: 433, claimedAfterS: 212 });
  for (const request of [432, 433]) assert.equal((await prove('turn-answered-after', waitedOf(request))).code, EXIT.pass, String(request));
  assert.equal((await prove('turn-answered-after', waitedOf(433))).detail.waited_s, 212);
});

test('turn-answered-after: a wait from before the run fails, and so does a question that waited and was not answered', async () => {
  await seedTurn({ request: 303, claimedAfterS: 212, createdAt: BEFORE_RUN });
  const old = await prove('turn-answered-after', waitedOf(303));
  assert.equal(old.code, EXIT.fail);
  assert.equal(old.detail.asked_in_this_run, false);

  await seedTurn({ request: 434, claimedAfterS: 212, state: 'failed', errorCode: 'timeout', answer: { errorCode: 'timeout' } });
  await seedTurn({ request: 435, claimedAfterS: 212, answer: null });
  for (const request of [434, 435]) assert.equal((await prove('turn-answered-after', waitedOf(request))).code, EXIT.fail, String(request));
});

/** Three assignments with a progress row each, and two reading rows, changed on three days. */
async function seedPlanner() {
  await db.exec(`
    insert into public.assignments (id) values ('a'), ('b'), ('c');
    insert into public.assignment_progress (assignment_id, updated_at)
      values ('a', '2026-10-01T12:00:00Z'), ('b', '2026-10-02T12:00:00Z'), ('c', '2026-10-03T12:00:00Z');
    insert into public.reading_progress (reading_id, updated_at) values (1, '2026-10-01T09:00:00Z'), (2, '2026-10-02T09:00:00Z');
  `);
}

const PLANNER = 'ap=2026-10-03T12:00:00.000000Z,rp=2026-10-02T09:00:00.000000Z,n=3,apn=3,rpn=2';

test('planner: the fingerprint counts the progress rows, so deleting a row that is not the newest changes it', async () => {
  await seedPlanner();
  const first = await prove('planner-fingerprint');
  assert.equal(first.code, EXIT.pass, first.why);
  const before = first.detail.fingerprint;
  assert.ok(before.startsWith(`${PLANNER},at=`), before);
  assert.equal((await prove('planner-unchanged', { before })).code, EXIT.pass);

  // Not the newest row: the two newest-change times stand, and only the count tells.
  await db.exec("delete from public.assignment_progress where assignment_id = 'a'");
  const changed = await prove('planner-unchanged', { before });
  assert.equal(changed.code, EXIT.fail);
  assert.equal('blocked' in changed.line, false);
  assert.equal(changed.detail.planner_before, before);
  assert.ok(changed.detail.planner_now.startsWith(`${PLANNER.replace('apn=3', 'apn=2')},at=`), changed.detail.planner_now);

  // The same for a reading row.
  const second = (await prove('planner-fingerprint')).detail.fingerprint;
  await db.exec('delete from public.reading_progress where reading_id = 1');
  const third = await prove('planner-unchanged', { before: second });
  assert.equal(third.code, EXIT.fail);
  assert.ok(third.detail.planner_now.includes(',apn=2,rpn=1,at='), third.detail.planner_now);
});

/** A sync that ran and ended long before: request 1 of every case below. */
const OLD_SYNC = "insert into public.agent_requests (created_at, kind, state, claimed_at, finished_at) values ('2026-09-01T10:00:00Z', 'sync', 'done', '2026-09-01T10:00:05Z', '2026-09-01T10:20:00Z')";
const CLAIMED_JUST_NOW = "insert into public.agent_requests (created_at, kind, state, claimed_at) values (now() - interval '10 minutes', 'sync', 'claimed', now() - interval '9 minutes')";
/** The three ways a request moves after the fingerprint was read: it is filed, it is taken, it ends. */
const MOVES = ["insert into public.agent_requests (kind) values ('sync')", 'update public.agent_requests set claimed_at = now() where id = 1', 'update public.agent_requests set finished_at = now() where id = 1'];
const UNDO_MOVE = "delete from public.agent_requests where id > 1; update public.agent_requests set claimed_at = '2026-09-01T10:00:05Z', finished_at = '2026-09-01T10:20:00Z' where id = 1";
/** A planner change that is not the newest row's: only the count tells. */
const CHANGE_PLANNER = "delete from public.assignment_progress where assignment_id = 'a'";

test('planner-unchanged: a planner that reads the same passes, also when a sync ran in between or is running', async () => {
  await seedPlanner();
  await db.exec(OLD_SYNC);
  const before = (await prove('planner-fingerprint')).detail.fingerprint;
  const quiet = await prove('planner-unchanged', { before });
  assert.equal(quiet.code, EXIT.pass, quiet.why);
  assert.deepEqual([quiet.detail.requests_in_window, quiet.detail.requests_claimed_now], [0, 0]);

  // What did not change was not changed by anyone: a sync beside the walk takes nothing from that.
  for (const moved of MOVES) {
    await db.exec(moved);
    const same = await prove('planner-unchanged', { before });
    assert.equal(same.code, EXIT.pass, moved);
    assert.equal('blocked' in same.line, false, moved);
    assert.ok(same.detail.requests_in_window >= 1, moved);
    await db.exec(UNDO_MOVE);
  }
  await db.exec(CLAIMED_JUST_NOW);
  const running = await prove('planner-unchanged', { before });
  assert.equal(running.code, EXIT.pass);
  // Request 2 was the one the loop filed and took away again.
  assert.deepEqual([running.detail.requests_claimed_now, running.detail.first_claimed_request_id], [1, 3]);
});

test('planner-unchanged: a planner that changed is blocked when a sync could have changed it, and fails when none could', async () => {
  await seedPlanner();
  await db.exec(OLD_SYNC);
  const before = (await prove('planner-fingerprint')).detail.fingerprint;
  await db.exec(CHANGE_PLANNER);
  assert.equal((await prove('planner-unchanged', { before })).code, EXIT.fail);

  // One filed, one taken and one ended after the fingerprint was read: each may be what changed it.
  for (const moved of MOVES) {
    await db.exec(moved);
    const blocked = await prove('planner-unchanged', { before });
    assert.equal(blocked.code, EXIT.blocked, moved);
    assert.deepEqual([blocked.line.pass, blocked.line.blocked], [false, true], moved);
    assert.ok(blocked.detail.requests_in_window >= 1, moved);
    await db.exec(UNDO_MOVE);
  }

  // Taken before the fingerprint and not ended: a sync is running now.
  await db.exec(CLAIMED_JUST_NOW);
  const running = await prove('planner-unchanged', { before });
  assert.equal(running.code, EXIT.blocked);
  assert.deepEqual([running.detail.requests_in_window, running.detail.requests_claimed_now], [0, 1]);

  // A claim nobody ended, days old, is not a running sync: it must not turn a failure into "repeat the run" for ever.
  await db.exec("update public.agent_requests set created_at = now() - interval '5 days', claimed_at = now() - interval '5 days' where state = 'claimed'");
  const stale = await prove('planner-unchanged', { before });
  assert.equal(stale.code, EXIT.fail);
  assert.deepEqual([stale.detail.requests_claimed_now, stale.detail.stale_claims], [0, 1]);
});

test('planner-fingerprint: blocked while a sync or an Inbox apply is waiting or running, so a run stops before it spends anything', async () => {
  await seedPlanner();
  await db.exec(OLD_SYNC);
  const quiet = await prove('planner-fingerprint');
  assert.equal(quiet.code, EXIT.pass, quiet.why);
  assert.deepEqual([quiet.detail.requests_open_now, quiet.detail.first_open_request_id, quiet.detail.stale_claims], [0, null, 0]);

  await db.exec("insert into public.agent_requests (kind) values ('inbox_feedback')");
  const waiting = await prove('planner-fingerprint');
  assert.equal(waiting.code, EXIT.blocked);
  assert.deepEqual([waiting.line.pass, waiting.line.blocked], [false, true]);
  assert.deepEqual([waiting.detail.requests_open_now, waiting.detail.first_open_request_id], [1, 2]);

  await db.exec("update public.agent_requests set state = 'claimed', claimed_at = now() where id = 2");
  assert.equal((await prove('planner-fingerprint')).code, EXIT.blocked);

  // It ends: a run may start.
  await db.exec("update public.agent_requests set state = 'done', finished_at = now() where id = 2");
  assert.equal((await prove('planner-fingerprint')).code, EXIT.pass);

  // A request nobody took or ended, days old, stops no run; it is counted so that someone closes it.
  await db.exec("insert into public.agent_requests (created_at, kind) values (now() - interval '5 days', 'sync')");
  await db.exec("insert into public.agent_requests (created_at, kind, state, claimed_at) values (now() - interval '5 days', 'sync', 'claimed', now() - interval '5 days')");
  const stale = await prove('planner-fingerprint');
  assert.equal(stale.code, EXIT.pass, stale.why);
  assert.deepEqual([stale.detail.requests_open_now, stale.detail.stale_claims], [0, 2]);
});

test("spike-archived: exactly one conversation titled 'spike' is archived, and none is listed", async () => {
  assert.equal((await prove('spike-archived')).code, EXIT.fail);
  const spike = await seedConversation({ title: 'spike', createdAt: '2026-10-01T10:00:00Z' });
  await seedConversation({ title: 'spike of another kind' });
  const listed = await prove('spike-archived');
  assert.equal(listed.code, EXIT.fail);
  assert.deepEqual(listed.detail, { archived: 0, listed: 1 });

  await db.query('update public.workspace_conversations set archived = true where id = $1', [spike]);
  const archived = await prove('spike-archived');
  assert.equal(archived.code, EXIT.pass, archived.why);
  assert.deepEqual(archived.detail, { archived: 1, listed: 0 });

  await seedConversation({ title: 'spike', archived: true });
  assert.equal((await prove('spike-archived')).code, EXIT.fail);
});

test("conversations-archived: every one named is there, archived, and this run's", async () => {
  const own = await seedConversation({ archived: true });
  const second = await seedConversation({ archived: true, createdAt: JUST_BEFORE });
  const passed = await prove('conversations-archived', { ids: `${own},${second}`, since: SINCE });
  assert.equal(passed.code, EXIT.pass, passed.why);
  assert.deepEqual(passed.detail, { asked_for: 2, found: 2, archived: 2, made_in_this_run: 2, not_archived: [] });

  // An archived conversation of an earlier run proves nothing about this one.
  const earlier = await seedConversation({ archived: true, createdAt: BEFORE_RUN });
  const old = await prove('conversations-archived', { ids: `${own},${earlier}`, since: SINCE });
  assert.equal(old.code, EXIT.fail);
  assert.deepEqual(old.detail, { asked_for: 2, found: 2, archived: 2, made_in_this_run: 1, not_archived: [] });

  const listed = await seedConversation();
  const missing = randomUUID();
  const notYet = await prove('conversations-archived', { ids: `${own},${listed},${missing}`, since: SINCE });
  assert.equal(notYet.code, EXIT.fail);
  assert.deepEqual({ ...notYet.detail, not_archived: [...notYet.detail.not_archived].sort() }, {
    asked_for: 3,
    found: 2,
    archived: 1,
    made_in_this_run: 2,
    not_archived: [listed, missing].sort(),
  });
});
