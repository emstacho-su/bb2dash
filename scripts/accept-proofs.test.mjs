// bb2dash :: scripts/accept-proofs.test.mjs
// Unit tests for the acceptance run's read-only proofs (acceptance/README.md, "The proofs"). Pure
// functions plus `run()` driven by a fake client, so nothing here touches a database. Run:
//   node --test scripts/accept-proofs.test.mjs
//
// What is held: a parameter is refused unless it is of its stated type; a statement is refused
// unless it is one read; the transaction is read-only and always rolled back; one JSON line comes
// out, with ids, counts, codes and times and never message text; and each of Phase 21's seven
// proofs decides pass, fail or blocked from the row it is given.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXIT,
  ProofError,
  bindParams,
  coerceParam,
  decide,
  lintProofSql,
  parseArgs,
  parseParamSpec,
  readPackAt,
  run,
  validatePack,
} from './accept-proofs.mjs';
import { PACK_21, SHA, argvFor, columnsOf } from './accept-proofs-kit.mjs';

const UUID_A = '0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e';
const UUID_B = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
const TIME = '2026-10-07T18:00:00.000000Z';
/** The run's own start, as the host hands it over: its clock, milliseconds, Z. */
const SINCE = '2026-10-07T17:55:00.000Z';
const QUESTION_MD5 = '3f2a9c0b1d4e5f60718293a4b5c6d7e8';
const FINGERPRINT = `ap=2026-10-06T21:15:02.118355Z,rp=none,n=143,apn=61,rpn=0,at=${TIME}`;

/**
 * A fake pg.Client: records every query, in either form node-postgres takes (a text with values,
 * or one object); `onQuery(text, values)` returns a result or an Error to throw.
 */
function fakeClient(onQuery = () => ({ rows: [] })) {
  return {
    queries: [],
    connected: false,
    ended: false,
    async connect() {
      this.connected = true;
    },
    async query(first, second) {
      const asked = typeof first === 'string' ? { text: first, values: second } : first;
      const { text, values, queryMode } = asked;
      this.queries.push({ text, values, queryMode });
      const result = onQuery(text, values);
      if (result instanceof Error) throw result;
      return result ?? { rows: [] };
    },
    async end() {
      this.ended = true;
    },
  };
}

/** Runs the CLI against a fake client and the working tree's Phase 21 pack. */
async function runWith({ argv, rows, onQuery, pack = PACK_21, connectError = null }) {
  const out = [];
  const err = [];
  const clients = [];
  const answer = onQuery ?? ((text) => (/^\s*(select|with)\b/i.test(text) ? { rows } : { rows: [] }));
  const code = await run(argv, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    readPack: () => pack,
    clientFactory: async () => {
      const client = fakeClient(answer);
      if (connectError) client.connect = async () => { throw connectError; };
      clients.push(client);
      return client;
    },
  });
  return { code, out, err, clients, line: out.length === 1 ? JSON.parse(out[0]) : null };
}

/** What each of the seven proofs is given on the command line. */
const GIVEN = {
  'planner-fingerprint': {},
  'planner-unchanged': { before: FINGERPRINT },
  turn: { request: '412', tier: 'low', since: SINCE, question_md5: QUESTION_MD5, tool: 'search_materials' },
  'turn-stopped': { request: '417', since: SINCE, question_md5: QUESTION_MD5 },
  'turn-answered-after': { request: '419', since: SINCE, min_wait_s: '15' },
  'spike-archived': {},
  'conversations-archived': { ids: `${UUID_A},${UUID_B}`, since: SINCE },
};

/* ---------------------------------------------------------------------------------------------
 * Arguments
 * ------------------------------------------------------------------------------------------ */

test('parseArgs reads the phase, the proof, the commit and the parameters', () => {
  assert.deepEqual(parseArgs(['21', 'turn', '--sha', SHA, '--param', 'request=412', '--param', 'tier=low']), {
    phase: '21',
    name: 'turn',
    sha: SHA,
    given: { request: '412', tier: 'low' },
  });
  // A value keeps everything after the first "=".
  assert.equal(parseArgs(['21', 'planner-unchanged', '--sha', SHA, '--param', `before=${FINGERPRINT}`]).given.before, FINGERPRINT);
});

test('parseArgs refuses a line it cannot read exactly', () => {
  const refused = (argv, pattern) => assert.throws(() => parseArgs(argv), (error) => error instanceof ProofError && pattern.test(error.message));
  refused([], /usage:/);
  refused(['21'], /usage:/);
  refused(['21', 'turn'], /--sha is required/);
  refused(['21', 'turn', '--sha'], /usage:/);
  refused(['21', 'turn', '--sha', 'HEAD'], /--sha must be a commit id/);
  refused(['21', 'turn', '--sha', 'main'], /--sha must be a commit id/);
  refused(['21', 'turn', '--sha', `${SHA}:../../.env`], /--sha must be a commit id/);
  refused(['../21', 'turn', '--sha', SHA], /phase/);
  refused(['21', 'turn; drop', '--sha', SHA], /proof name/);
  refused(['21', 'turn', '--sha', SHA, '--param', 'request'], /--param takes key=value/);
  refused(['21', 'turn', '--sha', SHA, '--param', 'request=1', '--param', 'request=2'], /given twice/);
  refused(['21', 'turn', '--sha', SHA, '--file', 'x.sql'], /usage:/);
  refused(['21', 'turn', 'extra', '--sha', SHA], /usage:/);
});

test('the pack is read from the commit it is given, never from the working tree', () => {
  const asked = [];
  const gitShow = (sha, file) => {
    asked.push(`${sha}:${file}`);
    return JSON.stringify(PACK_21);
  };
  assert.deepEqual(Object.keys(readPackAt({ phase: '21', sha: SHA, gitShow })).sort(), Object.keys(PACK_21).sort());
  assert.deepEqual(asked, [`${SHA}:acceptance/21/proofs.json`]);
  assert.throws(() => readPackAt({ phase: '21', sha: SHA, gitShow: () => { throw new Error('fatal: path does not exist'); } }), /no acceptance\/21\/proofs\.json at/);
  assert.throws(() => readPackAt({ phase: '21', sha: SHA, gitShow: () => '{ not json' }), /is not valid JSON/);
});

/* ---------------------------------------------------------------------------------------------
 * Parameters
 * ------------------------------------------------------------------------------------------ */

test('a parameter type is one of the eight, with "?" for one that may be left out', () => {
  assert.deepEqual(parseParamSpec('integer'), { type: 'integer', optional: false, choices: null });
  assert.deepEqual(parseParamSpec('text?'), { type: 'text', optional: true, choices: null });
  assert.deepEqual(parseParamSpec('enum:low|mid|high'), { type: 'enum', optional: false, choices: ['low', 'mid', 'high'] });
  for (const known of ['uuid', 'time', 'uuids', 'fingerprint', 'hex32']) assert.equal(parseParamSpec(known).type, known);
  for (const unknown of ['number', 'string', 'json', 'enum:', 'enum:a|b c', 'integer??', '']) {
    assert.throws(() => parseParamSpec(unknown), ProofError, unknown);
  }
});

test('a value is refused unless it is of its type', () => {
  const taken = (spec, raw) => coerceParam(parseParamSpec(spec), raw);
  const refused = (spec, raw) => assert.throws(() => taken(spec, raw), ProofError, `${spec} ${JSON.stringify(raw)}`);

  assert.equal(taken('integer', '412'), '412');
  for (const bad of ['', '-1', '4.5', '1e3', '12a', ' 12', '1;drop table x', '0x10', '9'.repeat(19)]) refused('integer', bad);

  assert.equal(taken('uuid', UUID_A), UUID_A);
  for (const bad of ['', 'spike', UUID_A.toUpperCase(), `${UUID_A}'`, UUID_A.slice(1)]) refused('uuid', bad);

  assert.equal(taken('time', TIME), TIME);
  assert.equal(taken('time', '2026-10-07T18:00:00Z'), '2026-10-07T18:00:00Z');
  assert.equal(taken('time', '2026-10-07T14:00:00.250-04:00'), '2026-10-07T14:00:00.250-04:00');
  for (const bad of ['', 'now()', '2026-10-07', '2026-10-07 18:00:00', '2026-13-40T18:00:00Z', "2026-10-07T18:00:00Z'; --"]) refused('time', bad);

  assert.equal(taken('uuids', `${UUID_A},${UUID_B}`), `{${UUID_A},${UUID_B}}`);
  assert.equal(taken('uuids', UUID_A), `{${UUID_A}}`);
  for (const bad of ['', `${UUID_A},`, `${UUID_A} ${UUID_B}`, `{${UUID_A}}`, Array(51).fill(UUID_A).join(',')]) refused('uuids', bad);

  assert.equal(taken('enum:low|mid|high', 'mid'), 'mid');
  for (const bad of ['', 'LOW', 'lowest', 'low|mid']) refused('enum:low|mid|high', bad);

  assert.equal(taken('fingerprint', FINGERPRINT), FINGERPRINT);
  for (const bad of ['', 'ap=none', FINGERPRINT.replace('n=143', 'n=many'), `${FINGERPRINT};`, FINGERPRINT.replace(',at=', ',at=now()')]) {
    refused('fingerprint', bad);
  }
  // A fingerprint without its two row counts is the form of before the review round, and is not taken.
  refused('fingerprint', FINGERPRINT.replace(',apn=61,rpn=0', ''));
  refused('fingerprint', FINGERPRINT.replace(',rpn=0', ''));

  // hex32: an md5 as Postgres writes one. Exactly 32 characters, lower case.
  assert.equal(taken('hex32', QUESTION_MD5), QUESTION_MD5);
  for (const bad of ['', QUESTION_MD5.toUpperCase(), QUESTION_MD5.slice(1), `${QUESTION_MD5}0`, `${QUESTION_MD5.slice(0, 31)}g`, `${QUESTION_MD5.slice(0, 30)}';`]) {
    refused('hex32', bad);
  }
});

test('a text parameter is a plain name: SQL metacharacters are refused', () => {
  const spec = parseParamSpec('text');
  for (const good of ['search_materials', 'bb2dash-inbox-decisions', 'IST.323', 'get_material_text', 'a1']) {
    assert.equal(coerceParam(spec, good), good);
  }
  const bad = [
    '',
    "a'b",
    'a"b',
    'a;b',
    'a--b',
    'a/*b*/',
    'a b',
    'a\\b',
    '(a)',
    'a,b',
    'a=b',
    '$1',
    'a\nb',
    "search_materials' or '1'='1",
    '-a',
    'a-',
    'x'.repeat(101),
  ];
  for (const value of bad) assert.throws(() => coerceParam(spec, value), ProofError, JSON.stringify(value));
});

test('parameters are bound in the order the proof declares them, and an absent optional one is null', () => {
  const turn = PACK_21.turn;
  const run = { since: SINCE, question_md5: QUESTION_MD5 };
  assert.deepEqual(Object.keys(turn.params), ['request', 'tier', 'since', 'question_md5', 'tool', 'scope']);
  assert.deepEqual(bindParams(turn, { tier: 'low', ...run, request: '412', tool: 'search_materials' }), ['412', 'low', SINCE, QUESTION_MD5, 'search_materials', null]);
  assert.deepEqual(bindParams(turn, { request: '412', tier: 'mid', ...run }), ['412', 'mid', SINCE, QUESTION_MD5, null, null]);
  assert.throws(() => bindParams(turn, { request: '412', ...run }), /parameter "tier" is required/);
  // A turn is never read without the run's start and its question: neither may be left out.
  assert.throws(() => bindParams(turn, { request: '412', tier: 'low', question_md5: QUESTION_MD5 }), /parameter "since" is required/);
  assert.throws(() => bindParams(turn, { request: '412', tier: 'low', since: SINCE }), /parameter "question_md5" is required/);
  assert.throws(() => bindParams(turn, { request: '412', tier: 'low', ...run, model: 'haiku' }), /has no parameter "model"/);
  assert.throws(() => bindParams(turn, { request: 'abc', tier: 'low', ...run }), /parameter "request"/);
  assert.deepEqual(Object.keys(PACK_21['turn-stopped'].params), ['request', 'since', 'question_md5']);
  assert.deepEqual(Object.keys(PACK_21['turn-answered-after'].params), ['request', 'since', 'min_wait_s']);
  assert.deepEqual(Object.keys(PACK_21['conversations-archived'].params), ['ids', 'since']);
  assert.deepEqual(PACK_21['planner-unchanged'].params, { before: 'fingerprint' });
  assert.deepEqual(bindParams(PACK_21['spike-archived'], {}), []);
});

/* ---------------------------------------------------------------------------------------------
 * The statement
 * ------------------------------------------------------------------------------------------ */

test('each of the seven statements is one read with exactly its own placeholders', () => {
  for (const [name, proof] of Object.entries(PACK_21)) {
    assert.equal(lintProofSql(proof.sql, Object.keys(proof.params).length), null, name);
  }
  assert.doesNotThrow(() => validatePack(PACK_21));
});

test('a statement that is not one plain read is refused, with the rule it broke', () => {
  const broke = (sql, pattern, params = 0) => assert.match(lintProofSql(sql, params) ?? 'accepted', pattern, sql);
  broke('', /no statement/);
  broke('select 1; select 2', /one statement/);
  broke('select 1; commit; delete from public.workspace_messages', /one statement/);
  broke("update public.workspace_conversations set archived = true where title = 'spike'", /must start with select or with/);
  broke('with gone as (delete from public.workspace_requests returning id) select count(*) from gone', /"delete"/);
  broke('select id into scratch from public.workspace_requests', /"into"/);
  broke('select id from public.workspace_requests for update', /"update"/);
  broke('select id from public.workspace_requests for share', /"share"/);
  broke("select set_config('role', 'postgres', false)", /set_config/);
  broke('select pg_terminate_backend(1)', /pg_/);
  broke("select nextval('public.workspace_requests_id_seq')", /nextval/);
  broke("select net.http_post('https://example.com')", /schema "net"/);
  broke('select 1 from vault.decrypted_secrets', /schema "vault"/);
  broke('select 1 from auth.users', /schema "auth"/);
  broke("select 1 /* hidden */ ; drop table public.assignments -- '", /no comment/);
  // Message text is never read: not the column, not a question, not a tool call's query.
  broke('select m.content from public.workspace_messages m', /"content"/);
  broke("select e->>'query' from public.workspace_messages m, jsonb_array_elements(m.tool_calls) e", /"query"/);
  broke('select r.note from public.agent_requests r', /"note"/);
  // Placeholders: every parameter is used, and none beyond them.
  broke('select 1 where 1 = $1', /uses \$1, and the proof declares 0 parameter/);
  broke('select 1 where 1 = $1', /does not use \$2/, 2);
  broke('select 1', /does not use \$1/, 1);
  // An updated_at column is not the word "update".
  assert.equal(lintProofSql('select max(p.updated_at) from public.assignment_progress p', 0), null);
});

test('the lint refuses what it could not read the way the server does: a quoted name, a comment, a backslash, a "$" that is no parameter', () => {
  const broke = (sql, pattern, params = 0) => assert.match(lintProofSql(sql, params) ?? 'accepted', pattern, sql);
  // A double-quoted name hid the name from every rule about words (review B-3).
  broke('select true as ok, "pg_terminate_backend"(1) as gone', /no double-quoted name/);
  broke('select true as ok, s.decrypted_secret as k from "vault"."decrypted_secrets" s', /no double-quoted name/);
  broke(`select true as ok, "net"."http_get"('https://example.com') as sent`, /no double-quoted name/);
  broke('select true as ok, U&"pg_sleep"(1) as slept', /no double-quoted name/);
  // The same three, written plain, are still what the word rules refuse.
  broke('select true as ok, pg_terminate_backend(1) as gone', /pg_/);
  broke('select true as ok, s.decrypted_secret as k from vault.decrypted_secrets s', /schema "vault"/);
  broke("select true as ok, net.http_get('https://example.com') as sent", /schema "net"/);
  // `x$y$` is a name to the server and the start of a quoted body to a scanner (review B-1's text).
  broke('select true as ok, 1 as x$y$ ; commit; delete from public.assignments; select 1 as z$y$', /"\$" is only ever a parameter/);
  broke('select true as ok, 1 as x$y$, pg_terminate_backend(1) as z$y$', /"\$" is only ever a parameter/);
  broke('select $body$ one $body$ as ok', /"\$" is only ever a parameter/);
  broke('select 1 as ok where 1 = $1abc', /"\$" is only ever a parameter/, 1);
  // A comment ends for the server at a lone carriage return, and for a scanner at the line's end.
  broke('select true as ok -- a note\r, pg_terminate_backend(1) as gone', /no comment/);
  broke('select true as ok /* a note */', /no comment/);
  // Inside an E literal a backslash hides the closing quote.
  broke("select E'\\'' as ok, pg_terminate_backend(1) as gone, '' as rest", /no backslash/);
  broke("select 'never closed as ok", /never closed/);
  // What a literal holds is not read as words: a quote mark in a time format, a `$` in a pattern, a doubled quote.
  assert.equal(lintProofSql(`select to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS') as stamp, 'it''s; fine' as word, substring($1::text from ',at=(.*)$') as tail`, 1), null);
});

test('a statement names a text column in two ways only: the md5 of a message, and a title held against a literal', () => {
  const broke = (sql, pattern, params = 0) => assert.match(lintProofSql(sql, params) ?? 'accepted', pattern, sql);
  // Renamed, a title's text would reach `detail` under a name no rule knows (review B-4).
  broke('select true as ok, c.title as t from public.workspace_conversations c', /"title"/);
  broke("select true as ok, left(c.title, 40) = 'spike' as short from public.workspace_conversations c", /"title"/);
  broke('select true as ok, a.description as d from public.assignments a', /"description"/);
  broke("select true as ok, e->>'answer' as a from public.workspace_messages m, jsonb_array_elements(m.tool_calls) e", /"answer"/);
  broke('select true as ok, left(m.content, 20) as head from public.workspace_messages m', /"content"/);
  broke('select true as ok, md5(left(m.content, 1)) as first from public.workspace_messages m', /"content"/);
  assert.equal(lintProofSql("select (count(*) = 1) as ok from public.workspace_conversations c where c.title = 'spike'", 0), null);
  assert.equal(lintProofSql('select (md5(m.content) = $1::text) as ok from public.workspace_messages m', 1), null);
});

test('a pack is refused before anything runs when a proof is not whole', () => {
  const broken = (change, pattern) => {
    const pack = JSON.parse(JSON.stringify(PACK_21));
    change(pack);
    assert.throws(() => validatePack(pack), (error) => error instanceof ProofError && pattern.test(error.message));
  };
  broken((pack) => { pack.turn.params.request = 'number'; }, /^turn: parameter "request"/);
  broken((pack) => { delete pack.turn.expect; }, /^turn: no "expect"/);
  broken((pack) => { pack.turn.sql = 'delete from public.workspace_requests where id = $1'; }, /^turn: /);
  broken((pack) => { pack['Bad Name'] = pack.turn; }, /proof name/);
  broken((pack) => { pack.turn.params['bad-key'] = 'text'; }, /^turn: parameter name/);
  assert.throws(() => validatePack([]), ProofError);
});

/* ---------------------------------------------------------------------------------------------
 * The decision
 * ------------------------------------------------------------------------------------------ */

test('one row whose "ok" is true passes; anything else does not', () => {
  assert.deepEqual(decide({ rows: [{ ok: true, request_id: '412' }] }), { pass: true, blocked: false, detail: { request_id: '412' } });
  assert.deepEqual(decide({ rows: [{ ok: false, request_id: '412' }] }), { pass: false, blocked: false, detail: { request_id: '412' } });
  // A comparison with a missing row is null, not true.
  assert.equal(decide({ rows: [{ ok: null, request_id: '412' }] }).pass, false);
  assert.deepEqual(decide({ rows: [] }), { pass: false, blocked: false, detail: { error: 'expected_one_row', rows: 0 } });
  assert.deepEqual(decide({ rows: [{ ok: true }, { ok: true }] }), { pass: false, blocked: false, detail: { error: 'expected_one_row', rows: 2 } });
  assert.deepEqual(decide({ rows: [{ request_id: '412' }] }), { pass: false, blocked: false, detail: { error: 'no_ok_column' } });
  // More than one result (a batch) is never a pass.
  assert.equal(decide([{ rows: [{ ok: true }] }, { rows: [{ ok: true }] }]).pass, false);
});

test('"blocked" outranks both pass and fail', () => {
  assert.deepEqual(decide({ rows: [{ ok: true, blocked: true, requests_in_window: 1 }] }), {
    pass: false,
    blocked: true,
    detail: { requests_in_window: 1 },
  });
  assert.equal(decide({ rows: [{ ok: false, blocked: true }] }).blocked, true);
  assert.equal(decide({ rows: [{ ok: true, blocked: false }] }).pass, true);
});

test('detail holds ids, counts, codes and times, and never message text', () => {
  const when = new Date('2026-10-07T18:00:01.000Z');
  const decided = decide({
    rows: [{ ok: true, request_id: '412', claimed_at: when, tools: [{ tool: 'search_materials', scope: 'IST.323', ok: true }], not_archived: [], tier: 'low', n: 3, none: null }],
  });
  assert.deepEqual(decided.detail, {
    request_id: '412',
    claimed_at: '2026-10-07T18:00:01.000Z',
    tools: [{ tool: 'search_materials', scope: 'IST.323', ok: true }],
    not_archived: [],
    tier: 'low',
    n: 3,
    none: null,
  });
});

test('detail keeps a value only when it is of an allowed shape, at every depth; anything else is the word withheld', () => {
  const detailOf = (row) => decide({ rows: [{ ok: true, ...row }] }).detail;
  // Kept: numbers, true and false, null, and a text that is a uuid, an ISO time, a fingerprint or a short token.
  const kept = {
    n: 3,
    ratio: 0.5,
    yes: true,
    no: false,
    none: null,
    id: UUID_A,
    at: '2026-10-07T14:00:00.250-04:00',
    fingerprint: FINGERPRINT,
    state: 'done',
    model: 'claude-haiku-4-5-20251001',
    scope: 'bb2dash-inbox-decisions',
    course: 'IST.323',
    request_id: '412',
    empty: '',
    ids: [UUID_A, UUID_B],
    nested: { tools: [{ tool: 'search_materials', ok: true }] },
  };
  assert.deepEqual(detailOf(kept), kept);
  assert.deepEqual(detailOf({ big: 412n, when: new Date('2026-10-07T18:00:01.000Z') }), { big: '412', when: '2026-10-07T18:00:01.000Z' });

  // Withheld: a sentence under a name no rule knows (review B-4: `c.title as t`), however short.
  assert.deepEqual(detailOf({ t: 'What does the syllabus say about late work?' }), { t: 'withheld' });
  assert.deepEqual(detailOf({ t: 'Late work, and what it costs' }), { t: 'withheld' });
  // A token holds no blank: plain words with nothing but letters between them are still a sentence.
  assert.deepEqual(detailOf({ t: 'Late work loses ten percent a day' }), { t: 'withheld' });
  assert.deepEqual(detailOf({ t: 'two\nlines' }), { t: 'withheld' });
  assert.deepEqual(detailOf({ t: 'x'.repeat(65) }), { t: 'withheld' });
  // An array of 200-character chunks used to pass the one length limit, chunk by chunk.
  const chunks = Array.from({ length: 5 }, (_, index) => `${index}`.repeat(200));
  assert.deepEqual(detailOf({ chunks }), { chunks: ['withheld', 'withheld', 'withheld', 'withheld', 'withheld'] });
  assert.deepEqual(detailOf({ deep: [{ list: [{ words: 'It is not taken after the third day.' }] }] }), { deep: [{ list: [{ words: 'withheld' }] }] });
  // A key is text too; and a number that is none, a bad date, bytes and a made thing are not shapes of the list.
  assert.deepEqual(detailOf({ keyed: { 'Late work loses ten percent a day.': 1 } }), { keyed: 'withheld' });
  assert.deepEqual(detailOf({ nan: Number.NaN, when: new Date('never'), bytes: Buffer.from('late work'), made: new (class Interval {})() }), {
    nan: 'withheld',
    when: 'withheld',
    bytes: 'withheld',
    made: 'withheld',
  });
});

test('a key named like a text column fails the proof, at any depth, whatever else the row says', () => {
  const said = 'Late work loses ten percent a day.';
  for (const key of ['content', 'prompt', 'title', 'query', 'note', 'history', 'params', 'result', 'description', 'answer']) {
    const refused = { pass: false, blocked: false, detail: { error: 'forbidden_key', key } };
    assert.deepEqual(decide({ rows: [{ ok: true, request_id: '412', [key]: said }] }), refused, key);
    // Wrapped in json (review B-4: `to_jsonb(m) as m`), and inside a list of objects.
    assert.deepEqual(decide({ rows: [{ ok: true, m: { id: UUID_A, role: 'assistant', [key]: said } }] }), refused, `nested ${key}`);
    assert.deepEqual(decide({ rows: [{ ok: true, tools: [{ tool: 'search_materials' }, { deeper: [{ [key]: said }] }] }] }), refused, `listed ${key}`);
    assert.deepEqual(decide({ rows: [{ ok: true, blocked: true, m: { [key.toUpperCase()]: said } }] }), refused, `upper-case ${key}`);
  }
});

/* ---------------------------------------------------------------------------------------------
 * run(): the transaction, the one line, the exit code
 * ------------------------------------------------------------------------------------------ */

test('the statement runs in a read-only transaction with a 15 s limit, and is rolled back', async () => {
  const { code, clients, line } = await runWith({ argv: argvFor('turn', GIVEN.turn), rows: [{ ok: true, request_id: '412' }] });
  assert.equal(code, EXIT.pass);
  assert.equal(clients.length, 1);
  const [client] = clients;
  assert.deepEqual(
    client.queries.map((query) => query.text),
    ['begin', 'set transaction read only', "set local statement_timeout = '15s'", PACK_21.turn.sql, 'rollback'],
  );
  assert.deepEqual(client.queries[3].values, ['412', 'low', SINCE, QUESTION_MD5, 'search_materials', null]);
  assert.equal(client.connected && client.ended, true);
  assert.deepEqual(line, { name: 'turn', pass: true, detail: { request_id: '412' } });
});

test('every statement goes by the extended protocol, with parameters and without, so the server takes one statement', async () => {
  const withParams = await runWith({ argv: argvFor('turn', GIVEN.turn), rows: [{ ok: true, request_id: '412' }] });
  const without = await runWith({ argv: argvFor('spike-archived'), rows: [{ ok: true, archived: 1, listed: 0 }] });
  for (const { clients } of [withParams, without]) {
    assert.equal(clients[0].queries.length, 5);
    // The proof's own statement, and the four around it: none is left to the simple protocol, where a text may hold several.
    for (const query of clients[0].queries) assert.equal(query.queryMode, 'extended', query.text);
  }
  assert.deepEqual(without.clients[0].queries[3].values, []);
});

test('node-postgres sends a text marked extended by the extended protocol, and an unmarked text with no values by the simple one', async () => {
  // The driver's own rule, pinned: a later version that dropped the mark would reopen the simple protocol unseen.
  const { default: pg } = await import('pg');
  assert.equal(new pg.Query({ text: 'select 1', values: [], queryMode: 'extended' }).requiresPreparation(), true);
  assert.equal(new pg.Query({ text: 'select 1', values: [] }).requiresPreparation(), false);
});

test('it is rolled back when the statement throws, and the error is a code, never a verdict', async () => {
  const failure = Object.assign(new Error('column r.stat does not exist'), { code: '42703' });
  const { code, clients, line, err } = await runWith({
    argv: argvFor('turn', GIVEN.turn),
    onQuery: (text) => (/^\s*(select|with)\b/i.test(text) ? failure : { rows: [] }),
  });
  assert.equal(code, EXIT.error);
  assert.equal(clients[0].queries.at(-1).text, 'rollback');
  assert.equal(clients[0].ended, true);
  assert.deepEqual(line, { name: 'turn', pass: false, detail: { error: 'query_failed', sqlstate: '42703' } });
  assert.match(err.join('\n'), /column r\.stat does not exist/);
});

test('when the transaction cannot be made read-only the statement is never sent', async () => {
  const { code, clients } = await runWith({
    argv: argvFor('spike-archived'),
    onQuery: (text) => (text === 'set transaction read only' ? new Error('cannot set transaction read-only') : { rows: [{ ok: true }] }),
  });
  assert.equal(code, EXIT.error);
  assert.deepEqual(
    clients[0].queries.map((query) => query.text),
    ['begin', 'set transaction read only', 'rollback'],
  );
});

test('a failed rollback does not hide the verdict, and a failed connection is an error with no DSN in it', async () => {
  const rolled = await runWith({
    argv: argvFor('spike-archived'),
    onQuery: (text) => (text === 'rollback' ? new Error('connection lost') : { rows: [{ ok: true, archived: 1, listed: 0 }] }),
  });
  assert.equal(rolled.code, EXIT.pass);
  assert.equal(rolled.clients[0].ended, true);
  assert.match(rolled.err.join('\n'), /rollback failed/);

  const down = await runWith({ argv: argvFor('spike-archived'), rows: [], connectError: new Error('getaddrinfo ENOTFOUND aws-0-us-east-1.pooler.supabase.com') });
  assert.equal(down.code, EXIT.error);
  assert.deepEqual(down.line, { name: 'spike-archived', pass: false, detail: { error: 'connection_failed' } });
  assert.equal(down.clients[0].ended, true);
});

test('an unknown proof, a bad parameter and a bad command line open no connection', async () => {
  const unknown = await runWith({ argv: argvFor('turn-fast', { request: '412' }), rows: [] });
  assert.equal(unknown.code, EXIT.error);
  assert.equal(unknown.clients.length, 0);
  assert.deepEqual(unknown.line, { name: 'turn-fast', pass: false, detail: { error: 'unknown_proof' } });

  const bad = await runWith({ argv: argvFor('turn', { request: "412' or '1'='1", tier: 'low' }), rows: [] });
  assert.equal(bad.code, EXIT.error);
  assert.equal(bad.clients.length, 0);
  assert.deepEqual(bad.line, { name: 'turn', pass: false, detail: { error: 'bad_parameter' } });
  // The refused value is not echoed where the wrapper keeps it.
  assert.doesNotMatch(bad.out[0], /or '1'/);

  const usage = await runWith({ argv: ['21'], rows: [] });
  assert.equal(usage.code, EXIT.error);
  assert.equal(usage.clients.length, 0);
  assert.deepEqual(usage.line, { name: null, pass: false, detail: { error: 'usage' } });
});

test('a pack whose statement could write is refused before any connection', async () => {
  const pack = JSON.parse(JSON.stringify(PACK_21));
  pack['spike-archived'].sql = "update public.workspace_conversations set archived = true where title = 'spike'";
  const { code, clients, line } = await runWith({ argv: argvFor('spike-archived'), rows: [], pack });
  assert.equal(code, EXIT.error);
  assert.equal(clients.length, 0);
  assert.deepEqual(line, { name: 'spike-archived', pass: false, detail: { error: 'bad_pack' } });
});

test('message text in a row never reaches the one line that is printed', async () => {
  const answer = 'Late work loses ten percent a day and is not taken after the third day.';
  const { code, out, line } = await runWith({ argv: argvFor('turn', GIVEN.turn), rows: [{ ok: true, request_id: '412', content: answer }] });
  assert.equal(code, EXIT.fail);
  assert.equal(out.length, 1);
  assert.doesNotMatch(out[0], /Late work/);
  assert.deepEqual(line, { name: 'turn', pass: false, detail: { error: 'forbidden_key', key: 'content' } });

  // The same text wrapped in json, and cut into pieces under names no rule knows.
  const wrapped = await runWith({ argv: argvFor('turn', GIVEN.turn), rows: [{ ok: true, request_id: '412', m: { role: 'assistant', content: answer } }] });
  assert.equal(wrapped.code, EXIT.fail);
  assert.doesNotMatch(wrapped.out[0], /Late work/);
  const cut = await runWith({ argv: argvFor('turn', GIVEN.turn), rows: [{ ok: true, request_id: '412', a: answer.slice(0, 36), b: [answer.slice(36)] }] });
  assert.equal(cut.code, EXIT.pass);
  assert.doesNotMatch(cut.out[0], /Late work|third day/);
  assert.deepEqual(cut.line.detail, { request_id: '412', a: 'withheld', b: ['withheld'] });
});

/* ---------------------------------------------------------------------------------------------
 * Phase 21's seven proofs: pass, fail and blocked from canned rows
 * ------------------------------------------------------------------------------------------ */

/** A passing row, and a failing one, in the columns each statement returns. */
const ROWS = {
  'planner-fingerprint': {
    pass: { ok: true, fingerprint: FINGERPRINT, newest_request_id: '866', newest_request_kind: 'sync', newest_request_state: 'done' },
  },
  'planner-unchanged': {
    pass: { ok: true, blocked: false, planner_before: FINGERPRINT, planner_now: FINGERPRINT, requests_in_window: 0, requests_claimed_now: 0 },
    fail: { ok: false, blocked: false, requests_in_window: 0, requests_claimed_now: 0 },
    blocked: { ok: false, blocked: true, requests_in_window: 1, first_request_id: '867', last_request_id: '867', requests_claimed_now: 1 },
  },
  turn: {
    pass: { ok: true, request_id: '412', request_state: 'done', asked_in_this_run: true, question_matches: true, tier: 'low', provider: 'claude-cli', finished: true },
    fail: { ok: false, request_id: '412', request_state: 'done', asked_in_this_run: true, question_matches: false, tier: 'low', provider: 'claude-cli', finished: true },
  },
  'turn-stopped': {
    pass: { ok: true, request_id: '417', request_state: 'cancelled', asked_in_this_run: true, question_matches: true, message_error_code: 'cancelled' },
    fail: { ok: false, request_id: '417', request_state: 'done', asked_in_this_run: true, question_matches: true, message_error_code: null },
  },
  'turn-answered-after': {
    pass: { ok: true, request_id: '419', request_state: 'done', asked_in_this_run: true, min_wait_s: 15, waited_s: 212, claimed_at: new Date('2026-10-07T18:05:00Z') },
    fail: { ok: false, request_id: '419', request_state: 'done', asked_in_this_run: true, min_wait_s: 15, waited_s: 1, claimed_at: new Date('2026-10-07T18:01:29Z') },
  },
  'spike-archived': {
    pass: { ok: true, archived: 1, listed: 0 },
    fail: { ok: false, archived: 0, listed: 1 },
  },
  'conversations-archived': {
    pass: { ok: true, asked_for: 2, found: 2, archived: 2, made_in_this_run: 2, not_archived: [] },
    fail: { ok: false, asked_for: 2, found: 2, archived: 2, made_in_this_run: 1, not_archived: [] },
  },
};

for (const name of Object.keys(GIVEN)) {
  test(`${name}: decides from the row it reads, and prints one line`, async () => {
    assert.ok(PACK_21[name], `${name} is in acceptance/21/proofs.json`);
    const passed = await runWith({ argv: argvFor(name, GIVEN[name]), rows: [ROWS[name].pass] });
    assert.equal(passed.code, EXIT.pass);
    assert.equal(passed.out.length, 1);
    assert.deepEqual(Object.keys(passed.line), ['name', 'pass', 'detail']);
    assert.deepEqual([passed.line.name, passed.line.pass], [name, true]);
    assert.equal(passed.clients[0].queries[3].text, PACK_21[name].sql);
    assert.equal(passed.clients[0].queries[3].values.length, Object.keys(PACK_21[name].params).length);

    const none = await runWith({ argv: argvFor(name, GIVEN[name]), rows: [] });
    assert.equal(none.code, EXIT.fail);
    assert.deepEqual(none.line, { name, pass: false, detail: { error: 'expected_one_row', rows: 0 } });

    if (ROWS[name].fail) {
      const failed = await runWith({ argv: argvFor(name, GIVEN[name]), rows: [ROWS[name].fail] });
      assert.equal(failed.code, EXIT.fail);
      assert.deepEqual([failed.line.pass, 'blocked' in failed.line], [false, false]);
    }
    if (ROWS[name].blocked) {
      const blocked = await runWith({ argv: argvFor(name, GIVEN[name]), rows: [ROWS[name].blocked] });
      assert.equal(blocked.code, EXIT.blocked);
      assert.deepEqual(Object.keys(blocked.line), ['name', 'pass', 'blocked', 'detail']);
      assert.deepEqual([blocked.line.pass, blocked.line.blocked], [false, true]);
    }
  });
}

test('the fingerprint that planner-fingerprint returns is one that planner-unchanged takes', async () => {
  const read = await runWith({ argv: argvFor('planner-fingerprint'), rows: [ROWS['planner-fingerprint'].pass] });
  const again = await runWith({ argv: argvFor('planner-unchanged', { before: read.line.detail.fingerprint }), rows: [ROWS['planner-unchanged'].pass] });
  assert.equal(again.code, EXIT.pass);
  assert.deepEqual(again.clients[0].queries[3].values, [FINGERPRINT]);
});

test('the uuid list reaches the statement as one array value', async () => {
  const { clients } = await runWith({ argv: argvFor('conversations-archived', GIVEN['conversations-archived']), rows: [ROWS['conversations-archived'].pass] });
  assert.deepEqual(clients[0].queries[3].values, [`{${UUID_A},${UUID_B}}`, SINCE]);
});

/* ---------------------------------------------------------------------------------------------
 * The statements against the migrations: every table and every column they name exists
 * ------------------------------------------------------------------------------------------ */

/** What follows a table that has no alias: a word of the statement, not a name for the table. */
const SQL_WORDS = new Set(['where', 'on', 'left', 'right', 'inner', 'cross', 'join', 'order', 'group', 'limit', 'union', 'as']);

test('the column reader finds what the migrations declare', () => {
  assert.ok(columnsOf('workspace_requests').has('claimed_at'));
  assert.ok(columnsOf('workspace_messages').has('tool_calls'));
  assert.ok(columnsOf('agent_requests').has('claim_attempts'), 'a column added by a later migration');
  assert.equal(columnsOf('workspace_requests').has('constraint'), false);
  assert.equal(columnsOf('no_such_table').size, 0);
});

for (const [name, proof] of Object.entries(PACK_21)) {
  test(`${name}: every table and column the statement names is in the migrations`, () => {
    const aliases = new Map();
    for (const match of proof.sql.matchAll(/\b(?:from|join)\s+public\.([a-z_]+)\s+(?:as\s+)?([a-z][a-z0-9_]*)\b/g)) {
      const [, table, alias] = match;
      assert.ok(!SQL_WORDS.has(alias), `public.${table} is read under an alias, not followed by "${alias}"`);
      assert.ok(columnsOf(table).size > 0, `public.${table} is created by a migration`);
      assert.ok(!aliases.has(alias) || aliases.get(alias) === table, `alias ${alias} names one table`);
      aliases.set(alias, table);
    }
    // Every table is read under an alias, so every column it gives can be checked.
    assert.equal([...proof.sql.matchAll(/\bpublic\.[a-z_]+/g)].length, [...proof.sql.matchAll(/\b(?:from|join)\s+public\.[a-z_]+\s+(?:as\s+)?[a-z][a-z0-9_]*\b/g)].length);
    let checked = 0;
    for (const match of proof.sql.matchAll(/\b([a-z][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g)) {
      const [, alias, column] = match;
      if (!aliases.has(alias)) continue;
      assert.ok(columnsOf(aliases.get(alias)).has(column), `${aliases.get(alias)}.${column} (read as ${alias}.${column})`);
      checked += 1;
    }
    assert.ok(checked >= 1, 'at least one column was checked');
  });
}
