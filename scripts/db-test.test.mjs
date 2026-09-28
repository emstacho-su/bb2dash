// bb2dash :: scripts/db-test.test.mjs
// Unit tests for the SQL test runner (Phase 15, brief 95, task 1). Pure functions plus `run()`
// driven by a fake client, so nothing here touches a database. Run:
//   node --test scripts/db-test.test.mjs
//
// The contract under test is brief 95 section Contract, "The runner scripts/db-test.mjs": the plan
// builder, the loader map, lint before connecting, the 6543 refusal, redaction, the exit mapping,
// the ": PASS" rule and the frozen output strings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  LOADER_MAP,
  buildPlan,
  formatPlanLine,
  parseArgs,
  stripSql,
  lintUnitText,
  assertDsnAllowed,
  redact,
  firstLine,
  findPassRow,
  loadDsn,
  parseEnvFile,
  openClient,
  run,
} from './db-test.mjs';

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'db-test');
const REAL_TESTS_DIR = path.join(import.meta.dirname, '..', 'db', 'tests');
const DSN =
  'postgresql://db_test_runner.goultdzqcavefcgnifdy:s3cr3tpw@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

// A fake pg.Client. `behaviour.onQuery(text, client)` returns a Result, an array of Results, or an
// Error to throw. `behaviour.connectError` makes connect() throw.
function fakeFactory(behaviour) {
  const opened = [];
  const factory = async () => {
    const client = {
      queries: [],
      connected: false,
      ended: false,
      async connect() {
        this.connected = true;
        if (behaviour.connectError) throw behaviour.connectError;
      },
      async query(text) {
        this.queries.push(text);
        const r = behaviour.onQuery(text, this);
        if (r instanceof Error) throw r;
        return r;
      },
      async end() {
        this.ended = true;
      },
    };
    opened.push(client);
    return client;
  };
  factory.opened = opened;
  return factory;
}

function passResult(label) {
  return [
    { command: 'BEGIN', rows: [] },
    { command: 'SELECT', rows: [{ result: label + ': PASS', checks: 1 }] },
  ];
}

function collector() {
  const lines = [];
  return { lines, write: (l) => lines.push(l), text: () => lines.join('\n') };
}

function tmpTestsDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-plan-'));
  for (const n of names) fs.writeFileSync(path.join(dir, n), 'begin;\nselect 1;\nrollback;\n');
  return dir;
}

function emptyDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), tag));
}

// ---------------------------------------------------------------------------------------------
// 1. The loader map and the plan builder
// ---------------------------------------------------------------------------------------------

test('the loader map is frozen and holds exactly the three sprint-1 pairs', () => {
  assert.equal(Object.isFrozen(LOADER_MAP), true);
  assert.deepEqual({ ...LOADER_MAP }, {
    'phase10a_stage_gradebook.sql': 'phase10a_load_fixtures.sql',
    'phase10a_stage_attempts.sql': 'phase10a_load_fixtures.sql',
    'phase12b_085_stage_attempts_v4.sql': 'phase12b_load_fixture.sql',
  });
});

test('buildPlan puts units in name order and numbers them from 01', () => {
  const plan = buildPlan(['b_two.sql', 'a_one.sql', 'c_three.sql']);
  assert.deepEqual(
    plan.map((u) => [u.index, u.name]),
    [
      [1, 'a_one.sql'],
      [2, 'b_two.sql'],
      [3, 'c_three.sql'],
    ],
  );
});

test('buildPlan prefixes each mapped test with its loader and never makes a loader a unit', () => {
  const plan = buildPlan([
    'phase10a_load_fixtures.sql',
    'phase10a_stage_gradebook.sql',
    'phase10a_stage_attempts.sql',
    'phase12b_load_fixture.sql',
    'phase12b_085_stage_attempts_v4.sql',
    'phase12b_073_workload_visibility.sql',
  ]);
  assert.deepEqual(
    plan.map((u) => u.name),
    [
      'phase10a_stage_attempts.sql',
      'phase10a_stage_gradebook.sql',
      'phase12b_073_workload_visibility.sql',
      'phase12b_085_stage_attempts_v4.sql',
    ],
  );
  assert.deepEqual(plan[0].files, ['phase10a_load_fixtures.sql', 'phase10a_stage_attempts.sql']);
  assert.deepEqual(plan[1].files, ['phase10a_load_fixtures.sql', 'phase10a_stage_gradebook.sql']);
  assert.deepEqual(plan[2].files, ['phase12b_073_workload_visibility.sql']);
  assert.deepEqual(plan[3].files, ['phase12b_load_fixture.sql', 'phase12b_085_stage_attempts_v4.sql']);
});

test('buildPlan ignores anything that is not a .sql file', () => {
  const plan = buildPlan(['README.md', 'a.sql', 'notes.txt']);
  assert.deepEqual(
    plan.map((u) => u.name),
    ['a.sql'],
  );
});

test('formatPlanLine prints the frozen --list strings', () => {
  const plan = buildPlan(['phase10a_load_fixtures.sql', 'phase10a_stage_gradebook.sql', 'zz_plain.sql']);
  assert.equal(formatPlanLine(plan[0]), 'unit 01  phase10a_load_fixtures.sql + phase10a_stage_gradebook.sql');
  assert.equal(formatPlanLine(plan[1]), 'unit 02  zz_plain.sql');
});

// ---------------------------------------------------------------------------------------------
// 2. Argument parsing, including the bare positional path
// ---------------------------------------------------------------------------------------------

test('parseArgs maps every documented form', () => {
  assert.deepEqual(parseArgs([]), { mode: 'all', target: null });
  assert.deepEqual(parseArgs(['--list']), { mode: 'list', target: null });
  assert.deepEqual(parseArgs(['--ping']), { mode: 'ping', target: null });
  assert.deepEqual(parseArgs(['--only', 'phase10b_round2.sql']), { mode: 'only', target: 'phase10b_round2.sql' });
  assert.deepEqual(parseArgs(['--file', 'scripts/fixtures/db-test/passes.sql']), {
    mode: 'file',
    target: 'scripts/fixtures/db-test/passes.sql',
  });
});

test('a bare positional path is the --file form', () => {
  assert.deepEqual(parseArgs(['scripts/fixtures/db-test/passes.sql']), {
    mode: 'file',
    target: 'scripts/fixtures/db-test/passes.sql',
  });
});

test('parseArgs refuses unknown flags, missing values and two targets', () => {
  assert.throws(() => parseArgs(['--nope']), /usage/i);
  assert.throws(() => parseArgs(['--only']), /usage/i);
  assert.throws(() => parseArgs(['--file']), /usage/i);
  assert.throws(() => parseArgs(['a.sql', 'b.sql']), /usage/i);
  assert.throws(() => parseArgs(['--only', 'a.sql', '--file', 'b.sql']), /usage/i);
});

// ---------------------------------------------------------------------------------------------
// 3. Lint: comments and dollar-quoted bodies are stripped first
// ---------------------------------------------------------------------------------------------

test('stripSql removes line comments, block comments, dollar-quoted bodies and string literals', () => {
  const stripped = stripSql(
    [
      '-- commit; in a line comment',
      '/* commit; in a block comment */',
      "select 'commit;' as s;",
      'do $$ begin commit; end $$;',
      'do $tag$ commit; $tag$;',
      'begin;',
    ].join('\n'),
  );
  assert.equal(/commit/i.test(stripped), false);
  assert.equal(/begin;/.test(stripped), true);
});

test('lint accepts the repo shape: begin; first, rollback; last', () => {
  assert.equal(lintUnitText('begin;\nselect 1;\nrollback;\n'), null);
});

test('lint accepts a loader + test unit, where begin comes from the loader', () => {
  const loader = 'begin;\ncreate temp table _fx (id int) on commit drop;\n';
  const body =
    "do $$ begin if 1 <> 1 then raise exception 'FAIL'; end if; end $$;\nselect 'x: PASS';\nrollback;\n";
  assert.equal(lintUnitText(loader + body), null);
});

test('lint refuses a missing begin', () => {
  const rule = lintUnitText('select 1;\nrollback;\n');
  assert.match(rule ?? '', /first statement must be `begin;`/);
});

test('lint refuses a missing final rollback', () => {
  const rule = lintUnitText('begin;\nselect 1;\n');
  assert.match(rule ?? '', /last statement must be `rollback;`/);
});

test('lint refuses a top-level commit', () => {
  const rule = lintUnitText('begin;\nselect 1;\ncommit;\n');
  assert.match(rule ?? '', /top-level `commit`/);
});

test('lint refuses a top-level end', () => {
  const rule = lintUnitText('begin;\nselect 1;\nend;\nbegin;\nselect 2;\nrollback;\n');
  assert.match(rule ?? '', /top-level `end`/);
});

// The `rollback` spelling of the case above. The unit goes to the server as one multi-statement
// simple query, so a rollback in the middle ends the transaction block and Postgres commits
// everything after it. This shape used to pass lint (round-2 finding 1).
test('lint refuses a second top-level rollback, the rollback spelling of the same batch split', () => {
  const rule = lintUnitText('begin;\nselect 1;\nrollback;\ndelete from planner_events;\nrollback;\n');
  assert.match(rule ?? '', /only the last statement may be a top-level `rollback`/);
});

test('lint refuses a second top-level rollback even when nothing follows it', () => {
  assert.notEqual(lintUnitText('begin;\nselect 1;\nrollback;\nrollback;\n'), null);
});

test('lint refuses `rollback to savepoint` as the unit terminator', () => {
  const rule = lintUnitText('begin;\nsavepoint s;\nselect 1;\nrollback to savepoint s;\n');
  assert.match(rule ?? '', /`rollback to savepoint` does not end the unit/);
});

test('lint accepts `rollback transaction` and `rollback work`, and refuses `rollback and chain`', () => {
  assert.equal(lintUnitText('begin;\nselect 1;\nrollback transaction;\n'), null);
  assert.equal(lintUnitText('begin;\nselect 1;\nrollback work;\n'), null);
  assert.match(lintUnitText('begin;\nselect 1;\nrollback and chain;\n') ?? '', /plain `rollback;`/);
});

test('the rollback_then_writes.sql fixture fails lint', () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'rollback_then_writes.sql'), 'utf8');
  assert.match(lintUnitText(text) ?? '', /only the last statement may be a top-level `rollback`/);
});

test('lint refuses a unit with no statements at all', () => {
  assert.match(lintUnitText('-- nothing but a comment\n') ?? '', /no statements/);
});

test('lint is not fooled by `on commit drop`, a case ... end, or a semicolon inside a literal', () => {
  const text = [
    'begin;',
    'create temp table _fx (id int) on commit drop;',
    "select case when true then 'a; b' else 'end' end as c;",
    'rollback;',
  ].join('\n');
  assert.equal(lintUnitText(text), null);
});

test('the commits.sql fixture fails lint; passes.sql and fails.sql do not', () => {
  assert.notEqual(lintUnitText(fs.readFileSync(path.join(FIXTURES, 'commits.sql'), 'utf8')), null);
  assert.equal(lintUnitText(fs.readFileSync(path.join(FIXTURES, 'passes.sql'), 'utf8')), null);
  assert.equal(lintUnitText(fs.readFileSync(path.join(FIXTURES, 'fails.sql'), 'utf8')), null);
});

// ---------------------------------------------------------------------------------------------
// 4. The DSN check, redaction and the pass rule
// ---------------------------------------------------------------------------------------------

test('a transaction-pooler DSN on port 6543 is refused, and the message holds no DSN', () => {
  const bad = DSN.replace(':5432/', ':6543/');
  assert.throws(
    () => assertDsnAllowed(bad),
    (err) => {
      assert.match(err.message, /6543/);
      assert.equal(err.message.includes('s3cr3tpw'), false);
      assert.equal(err.message.includes('pooler.supabase.com'), false);
      return true;
    },
  );
});

test('a session-pooler DSN on 5432 is allowed', () => {
  assert.equal(assertDsnAllowed(DSN), DSN);
});

test('redact removes the DSN and its password from any text', () => {
  const msg = 'could not connect to ' + DSN + ' (password s3cr3tpw)';
  const out = redact(msg, DSN);
  assert.equal(out.includes('s3cr3tpw'), false);
  assert.equal(out.includes(DSN), false);
  assert.match(out, /could not connect to/);
});

// Round-2 finding 2: `url.host` is host:port, and a real driver error names the bare host.
test('redact removes the bare hostname too, not only host:port', () => {
  const msg = 'getaddrinfo ENOTFOUND aws-0-us-east-1.pooler.supabase.com';
  const out = redact(msg, DSN);
  assert.equal(out.includes('aws-0-us-east-1.pooler.supabase.com'), false);
  assert.match(out, /getaddrinfo ENOTFOUND/);
});

test('firstLine takes only the first line of a server error', () => {
  assert.equal(firstLine('FAIL something\nCONTEXT: PL/pgSQL function\n'), 'FAIL something');
});

test('findPassRow accepts one Result or an array, and only a ": PASS" first column', () => {
  assert.equal(findPassRow(passResult('x')), true);
  assert.equal(findPassRow({ rows: [{ result: 'x: PASS' }] }), true);
  assert.equal(findPassRow({ rows: [{ result: 'PASS' }] }), false);
  assert.equal(findPassRow({ rows: [{ result: 'x: PASSED' }] }), false);
  assert.equal(findPassRow({ rows: [{ a: 1, result: 'x: PASS' }] }), false, 'only the first column counts');
  assert.equal(findPassRow([]), false);
});

// ---------------------------------------------------------------------------------------------
// 5. Importing the module has no side effects; the two exports a later script reuses
// ---------------------------------------------------------------------------------------------

test('loadDsn and openClient are exported functions', () => {
  assert.equal(typeof loadDsn, 'function');
  assert.equal(typeof openClient, 'function');
});

test('loadDsn reads the process environment first and refuses 6543 from it', () => {
  assert.equal(loadDsn({ env: { BB2DASH_TEST_DB_URL: DSN }, root: import.meta.dirname }), DSN);
  assert.throws(
    () => loadDsn({ env: { BB2DASH_TEST_DB_URL: DSN.replace(':5432/', ':6543/') }, root: import.meta.dirname }),
    /6543/,
  );
});

test('loadDsn fails with a clear config error when nothing sets the variable', () => {
  assert.throws(() => loadDsn({ env: {}, root: emptyDir('db-test-noenv-') }), /BB2DASH_TEST_DB_URL/);
});

// Round-2 finding 3: the file used to go through process.loadEnvFile, so an explicit `env` without
// the variable fell back to the ambient one and the call mutated the real process.env.
test('parseEnvFile handles comments, blanks, an export prefix, quotes and an = inside the value', () => {
  const parsed = parseEnvFile(
    [
      '# a comment',
      '',
      'export A=one',
      'B = two ',
      'C="three"',
      "D='four'",
      'E=postgresql://u:p@h:5432/db?uselibpqcompat=true&sslmode=require',
      'F=has#hash',
      'not a key line',
      '=novalue',
    ].join('\r\n'),
  );
  assert.equal(parsed.A, 'one');
  assert.equal(parsed.B, 'two');
  assert.equal(parsed.C, 'three');
  assert.equal(parsed.D, 'four');
  assert.equal(parsed.E, 'postgresql://u:p@h:5432/db?uselibpqcompat=true&sslmode=require');
  assert.equal(parsed.F, 'has#hash');
  assert.equal('not a key line' in parsed, false);
});

test('loadDsn reads .env.local without writing anything into process.env', () => {
  const root = emptyDir('db-test-envfile-');
  fs.writeFileSync(
    path.join(root, '.env.local'),
    `# local only\nBB2DASH_TEST_DB_URL=${DSN}\nDB_TEST_MARKER_R2=must-not-reach-process-env\n`,
  );
  assert.equal(loadDsn({ env: {}, root }), DSN);
  assert.equal(process.env.DB_TEST_MARKER_R2, undefined, 'loadDsn must not mutate process.env');
});

test('loadDsn with an explicit env does not fall back to the ambient process.env', () => {
  const root = emptyDir('db-test-envfile2-');
  const fileDsn = DSN.replace('/postgres?', '/other_db?');
  fs.writeFileSync(path.join(root, '.env.local'), `BB2DASH_TEST_DB_URL=${fileDsn}\n`);
  // Only `options.env` and the file are consulted, in that order.
  assert.equal(loadDsn({ env: {}, root }), fileDsn);
  assert.equal(loadDsn({ env: { BB2DASH_TEST_DB_URL: DSN }, root }), DSN);
});

// ---------------------------------------------------------------------------------------------
// 6. run(): --list never connects
// ---------------------------------------------------------------------------------------------

test('--list prints the plan, exits 0 and opens no client', async () => {
  const dir = tmpTestsDir([
    'phase10a_load_fixtures.sql',
    'phase10a_stage_gradebook.sql',
    'phase10a_stage_attempts.sql',
    'zz_plain.sql',
  ]);
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run(['--list'], { out: out.write, testsDir: dir, env: {}, clientFactory: factory });
  assert.equal(code, 0);
  assert.equal(factory.opened.length, 0);
  assert.deepEqual(out.lines, [
    'unit 01  phase10a_load_fixtures.sql + phase10a_stage_attempts.sql',
    'unit 02  phase10a_load_fixtures.sql + phase10a_stage_gradebook.sql',
    'unit 03  zz_plain.sql',
  ]);
});

// ---------------------------------------------------------------------------------------------
// 7. run(): lint refuses before a client is opened (exit 2)
// ---------------------------------------------------------------------------------------------

test('a unit that fails lint exits 2, prints the frozen lint line, and opens no client', async () => {
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run(['--file', path.join(FIXTURES, 'commits.sql')], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0, 'no client may be opened for a file that fails lint');
  assert.equal(out.lines.length, 1);
  assert.match(out.lines[0], /^db-test: lint commits\.sql: /);
});

test('lint runs before the credential is read, so a committing file is refused with no DSN at all', async () => {
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run([path.join(FIXTURES, 'commits.sql')], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: {},
    root: emptyDir('db-test-noenv2-'),
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0);
  assert.match(out.lines[0], /^db-test: lint commits\.sql: /);
});

// ---------------------------------------------------------------------------------------------
// 8. run(): the pass, fail and exit contract
// ---------------------------------------------------------------------------------------------

test('a passing unit prints PASS and the summary, and exits 0', async () => {
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('passes') });
  const code = await run(['--file', path.join(FIXTURES, 'passes.sql')], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 0);
  assert.deepEqual(out.lines, ['PASS  passes.sql', 'db-test: passed 1, failed 0, units 1']);
  assert.equal(factory.opened.length, 1);
  assert.equal(factory.opened[0].ended, true);
});

test('a raising unit prints FAIL with the first line of the server error, rolls back, and exits 1', async () => {
  const out = collector();
  const serverError = new Error(
    'FAIL this fixture always fails, on purpose\nCONTEXT: PL/pgSQL function inline_code_block',
  );
  const factory = fakeFactory({ onQuery: (text) => (text === 'rollback' ? { rows: [] } : serverError) });
  const code = await run(['--file', path.join(FIXTURES, 'fails.sql')], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 1);
  assert.deepEqual(out.lines, [
    'FAIL  fails.sql  FAIL this fixture always fails, on purpose',
    'db-test: passed 0, failed 1, units 1',
  ]);
  assert.deepEqual(factory.opened[0].queries.slice(-1), ['rollback'], 'rollback is sent after an error');
});

test('a unit that raises nothing but has no ": PASS" row is a FAIL', async () => {
  const out = collector();
  const factory = fakeFactory({ onQuery: () => [{ rows: [{ result: 'quietly nothing' }] }] });
  const code = await run(['--file', path.join(FIXTURES, 'passes.sql')], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 1);
  assert.equal(out.lines[0], 'FAIL  passes.sql  no result row ends in ": PASS"');
});

test('one broken unit never hides the rest, and each unit gets its own client', async () => {
  const dir = tmpTestsDir(['a_ok.sql', 'b_bad.sql', 'c_ok.sql']);
  fs.writeFileSync(path.join(dir, 'b_bad.sql'), 'begin;\nselect 1 as b_bad_marker;\nrollback;\n');
  const out = collector();
  const factory = fakeFactory({
    onQuery: (text) => {
      if (text === 'rollback') return { rows: [] };
      if (/b_bad_marker/.test(text)) return new Error('FAIL b is broken');
      return passResult('x');
    },
  });
  const code = await run([], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 1);
  assert.deepEqual(out.lines, [
    'PASS  a_ok.sql',
    'FAIL  b_bad.sql  FAIL b is broken',
    'PASS  c_ok.sql',
    'db-test: passed 2, failed 1, units 3',
  ]);
  assert.equal(factory.opened.length, 3, 'one pg.Client per unit');
});

test('a unit is sent as one simple-protocol query, loader text first', async () => {
  const dir = tmpTestsDir(['phase10a_load_fixtures.sql', 'phase10a_stage_gradebook.sql']);
  fs.writeFileSync(path.join(dir, 'phase10a_load_fixtures.sql'), 'begin;\nselect 1 as loader_marker;\n');
  fs.writeFileSync(path.join(dir, 'phase10a_stage_gradebook.sql'), "select 'x: PASS';\nrollback;\n");
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run(['--only', 'phase10a_stage_gradebook.sql'], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 0);
  assert.equal(factory.opened.length, 1);
  assert.equal(factory.opened[0].queries.length, 1, 'one query per unit, not one per file');
  assert.match(factory.opened[0].queries[0], /loader_marker[\s\S]*rollback/);
  assert.deepEqual(out.lines, ['PASS  phase10a_stage_gradebook.sql', 'db-test: passed 1, failed 0, units 1']);
});

test('--only names a loader, which never runs alone: exit 2, no client', async () => {
  const dir = tmpTestsDir(['phase10a_load_fixtures.sql', 'phase10a_stage_gradebook.sql']);
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run(['--only', 'phase10a_load_fixtures.sql'], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0);
  assert.match(out.lines[0], /loader/);
});

test('--only names a file that is not in db/tests: exit 2', async () => {
  const dir = tmpTestsDir(['a.sql']);
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run(['--only', 'nope.sql'], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0);
});

// ---------------------------------------------------------------------------------------------
// 9. run(): exit 2 on config and connection errors, always redacted
// ---------------------------------------------------------------------------------------------

test('a 6543 DSN exits 2 before any client is opened and never prints the DSN', async () => {
  const dir = tmpTestsDir(['a.sql']);
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run([], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN.replace(':5432/', ':6543/') },
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0);
  assert.equal(out.text().includes('s3cr3tpw'), false);
  assert.equal(out.text().includes('pooler.supabase.com'), false);
  assert.match(out.text(), /6543/);
});

// Round-2 finding 4.
test('an empty db/tests exits 2 rather than reporting green having run nothing', async () => {
  const dir = emptyDir('db-test-empty-');
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run([], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0);
  assert.match(out.lines[0], /^db-test: no units found in /);
  assert.equal(
    out.lines.some((l) => l.includes('units 0')),
    false,
    'it must not print a green summary',
  );
});

test('a connection failure exits 2 and its message is redacted', async () => {
  const dir = tmpTestsDir(['a.sql']);
  const out = collector();
  const factory = fakeFactory({
    connectError: new Error(
      'connection to ' + DSN + ' failed: password authentication failed for "db_test_runner" (s3cr3tpw)',
    ),
    onQuery: () => passResult('x'),
  });
  const code = await run([], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(out.text().includes('s3cr3tpw'), false);
  assert.equal(out.text().includes(DSN), false);
  assert.match(out.text(), /^db-test: connection failed: /m);
});

test('a server error that quotes the password is redacted on the FAIL line', async () => {
  const dir = tmpTestsDir(['a.sql']);
  const out = collector();
  const factory = fakeFactory({
    onQuery: (text) => (text === 'rollback' ? { rows: [] } : new Error('FAIL leaked s3cr3tpw here')),
  });
  const code = await run([], {
    out: out.write,
    testsDir: dir,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 1);
  assert.equal(out.text().includes('s3cr3tpw'), false);
});

test('a usage error exits 2 and opens no client', async () => {
  const out = collector();
  const factory = fakeFactory({ onQuery: () => passResult('x') });
  const code = await run(['--nope'], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: {},
    clientFactory: factory,
  });
  assert.equal(code, 2);
  assert.equal(factory.opened.length, 0);
  assert.match(out.lines[0], /^db-test: usage: /);
});

// ---------------------------------------------------------------------------------------------
// 10. run(): --ping
// ---------------------------------------------------------------------------------------------

test('--ping prints the role it connected as and exits 0', async () => {
  const out = collector();
  const factory = fakeFactory({ onQuery: () => ({ rows: [{ current_user: 'db_test_runner' }] }) });
  const code = await run(['--ping'], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 0);
  assert.deepEqual(out.lines, ['db-test: connected as db_test_runner']);
});

test('--ping exits 2 when the connection fails', async () => {
  const out = collector();
  const factory = fakeFactory({ connectError: new Error('no route to host'), onQuery: () => ({ rows: [] }) });
  const code = await run(['--ping'], {
    out: out.write,
    testsDir: REAL_TESTS_DIR,
    env: { BB2DASH_TEST_DB_URL: DSN },
    clientFactory: factory,
  });
  assert.equal(code, 2);
});
