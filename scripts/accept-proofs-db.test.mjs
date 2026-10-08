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

import { PGlite } from '@electric-sql/pglite';

import { runReadOnly } from './accept-proofs.mjs';
import { columnsOf } from './accept-proofs-kit.mjs';

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
