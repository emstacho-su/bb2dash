/**
 * bb2dash :: db/fixtures/phase12b/build_load_sql.js
 *
 * Turns the JSON fixtures in this directory into `db/tests/phase12b_load_fixture.sql`, the loader
 * `db/tests/phase12b_085_stage_attempts_v4.sql` starts with. Same arrangement as
 * db/fixtures/phase10a: the JSON is the source of record (the vitest suite reads it too), and
 * `web/test/fixtures.phase12b.test.ts` re-runs this generator in memory and fails if the committed
 * .sql is not what it produces.
 *
 *   node db/fixtures/phase12b/build_load_sql.js        # from the repo root
 *
 * Only the `payload` key of each fixture reaches `bb_raw`; the `_`-prefixed keys are the invented
 * Blackboard responses the fixture was generated from and the notes about it, and they exist for
 * the drift guard, not for the database.
 *
 * CommonJS and dependency-free on purpose: it runs under plain `node` from the repo root and is
 * also `require`d by the vitest suite.
 */

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_DIR = __dirname;
const OUT_PATH = path.join(FIXTURE_DIR, '..', '..', 'tests', 'phase12b_load_fixture.sql');

/** The run every fixture loads under. Not a real crawl; nothing outside a test transaction. */
const FIXTURE_RUN_ID = '00000000-12b0-4000-8000-000000000001';

/** Source files, in load order. One Blackboard shell each. */
const FIXTURE_FILES = ['attempts_v3_empty.json', 'attempts_v4.json'];

const readFixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));

/**
 * Dollar-quote a JSON literal. `$fx$` cannot appear inside JSON produced from these fixtures, but
 * it is checked rather than assumed: a silent quoting break would produce SQL that runs and means
 * something else.
 */
function jsonLiteral(value) {
  const text = JSON.stringify(value);
  if (text.includes('$fx$')) {
    throw new Error('fixture JSON contains the dollar-quote tag $fx$; pick another tag');
  }
  return `$fx$${text}$fx$::jsonb`;
}

function build() {
  const rows = FIXTURE_FILES.map((name) => ({ name, fx: readFixture(name) }))
    .sort((a, b) => a.fx.bb_course_id.localeCompare(b.fx.bb_course_id));
  const lines = [];
  const out = (s = '') => lines.push(s);

  out('-- bb2dash :: db/tests/phase12b_load_fixture.sql');
  out('--');
  out('-- GENERATED FILE - do not edit by hand.');
  out('--   node db/fixtures/phase12b/build_load_sql.js');
  out('-- Source of record: db/fixtures/phase12b/*.json. web/test/fixtures.phase12b.test.ts');
  out('-- regenerates this file in memory and fails if the committed copy differs.');
  out('--');
  out('-- Opens a transaction, registers one fixture crawl, and loads one bb_raw row per shell:');
  out('-- one crawler v4 payload (the chain of docs/planning/sprint-1-hub/evidence/80f_ATTEMPTS_ENDPOINT.md, with every');
  out('-- id, name, URL and sentence invented) and one crawler v3 payload with the empty results');
  out('-- every column really returned, so migration 085 can prove it still folds both.');
  out('--');
  out('-- It never commits. Run the test as');
  out('--');
  out('--   cat db/tests/phase12b_load_fixture.sql db/tests/phase12b_085_stage_attempts_v4.sql \\');
  out('--     | psql "$DATABASE_URL"');
  out('--');
  out('-- or paste the same concatenation into one execute_sql call through the Supabase MCP.');
  out('-- Everything loads under the fixture run id, never a real one.');
  out();
  out('begin;');
  out();
  out('-- The fixture crawl. Registered, because a stage only trusts a run an owner-claimed');
  out('-- agent_requests row registered (migration 035).');
  out('create temp table _fx (run_id uuid primary key, sync_run_id bigint) on commit drop;');
  out();
  out('insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)');
  out(`values ('sync', 'all', 'done', '${FIXTURE_RUN_ID}',`);
  out("        'Phase 12b fixture crawl (db/fixtures/phase12b). Test-only; every test rolls back.',");
  out("        'phase12b fixtures', now(), now());");
  out();
  out('with r as (');
  out('  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)');
  out(`  values ('${FIXTURE_RUN_ID}', 'ok', now(), now(), 'manual', 'blackboard', 'all')`);
  out('  returning id)');
  out(`insert into _fx (run_id, sync_run_id) select '${FIXTURE_RUN_ID}', r.id from r;`);

  for (const { name, fx } of rows) {
    out();
    out(`-- ${fx.course_id} (${fx.bb_course_id}) from ${name} - crawler v${fx.payload.crawler.version}`);
    out('insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at) values');
    out(`  ('${FIXTURE_RUN_ID}', 'course', '${fx.bb_course_id}',`);
    out(`   ${jsonLiteral(fx.payload)},`);
    out(`   '${fx.captured_at}'::timestamptz);`);
  }

  out();
  out('-- Deliberately no commit. The test file that follows asserts and rolls back.');
  out();
  return lines.join('\n');
}

module.exports = { build, FIXTURE_FILES, FIXTURE_RUN_ID, OUT_PATH };

if (require.main === module) {
  fs.writeFileSync(OUT_PATH, build(), 'utf8');
  process.stdout.write(`wrote ${path.relative(process.cwd(), OUT_PATH)}\n`);
}
