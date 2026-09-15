/**
 * bb2dash :: db/fixtures/phase10a/build_load_sql.js
 *
 * Turns the JSON fixtures in this directory into `db/tests/phase10a_load_fixtures.sql`, the
 * loader every Phase 10a SQL test starts with.
 *
 * Why generate rather than hand-write the SQL: the JSON files are the source of record (W-18's
 * vitest suite reads them too), and a second hand-maintained copy of the same payloads inside a
 * .sql file would drift the first time a fixture changed. `web/test/fixtures.phase10a.test.ts`
 * re-runs this generator in memory and fails if the committed .sql is not what it produces.
 *
 *   node db/fixtures/phase10a/build_load_sql.js        # from the repo root
 *
 * Payloads for the same Blackboard shell are MERGED into one `bb_raw` row, because that is what
 * a real crawler v3 run posts (one row per shell, carrying gradebook and attempts together) and
 * because migration 035's `bb_raw_run_kind_shell_uidx` refuses a second row for the same shell in
 * the same run. All rows load under the fixture run id, never under the real crawl's, so the
 * loader can never collide with prod data.
 *
 * CommonJS and dependency-free on purpose: it runs under plain `node` from the repo root and is
 * also `require`d by the vitest suite, which loads the crawler the same way.
 */

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE_DIR = __dirname;
const OUT_PATH = path.join(FIXTURE_DIR, '..', '..', 'tests', 'phase10a_load_fixtures.sql');

/** The run every fixture loads under. Not a real crawl; nothing outside a test transaction. */
const FIXTURE_RUN_ID = '00000000-10a0-4000-8000-000000000001';

/** Source files, in load order. Same-shell payloads merge. */
const FIXTURE_FILES = [
  'gradebook_ECN304.json',
  'gradebook_IST323.json',
  'gradebook_IST471.json',
  'attempts_synthetic.json',
];

const readFixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));

/**
 * One bb_raw row per Blackboard shell, payload keys merged in file order. Returns rows sorted by
 * bb_course_id so the generated SQL is stable whatever the filesystem hands back.
 */
function mergeShells(files) {
  const byShell = new Map();
  for (const name of files) {
    const fx = readFixture(name);
    const prev = byShell.get(fx.bb_course_id);
    if (!prev) {
      byShell.set(fx.bb_course_id, {
        bb_course_id: fx.bb_course_id,
        course_id: fx.course_id,
        captured_at: fx.captured_at,
        sources: [name],
        payload: { ...fx.payload },
      });
      continue;
    }
    prev.sources.push(name);
    prev.payload = { ...prev.payload, ...fx.payload };
  }
  return [...byShell.values()].sort((a, b) => a.bb_course_id.localeCompare(b.bb_course_id));
}

/**
 * Dollar-quote a JSON literal. `$fx$` cannot appear inside JSON produced from these fixtures
 * (JSON.stringify escapes nothing to `$`, and no fixture value contains the sequence), but it is
 * checked rather than assumed: a silent quoting break would produce SQL that runs and means
 * something else.
 */
function jsonLiteral(value) {
  // Compact, not pretty: the readable copy is the .json fixture, and this file exists to be
  // piped into psql. One payload per line keeps the generated SQL small enough to paste whole.
  const text = JSON.stringify(value);
  if (text.includes('$fx$')) {
    throw new Error('fixture JSON contains the dollar-quote tag $fx$; pick another tag');
  }
  return `$fx$${text}$fx$::jsonb`;
}

function build() {
  const shells = mergeShells(FIXTURE_FILES);
  const lines = [];
  const out = (s = '') => lines.push(s);

  out('-- bb2dash :: db/tests/phase10a_load_fixtures.sql');
  out('--');
  out('-- GENERATED FILE - do not edit by hand.');
  out('--   node db/fixtures/phase10a/build_load_sql.js');
  out('-- Source of record: db/fixtures/phase10a/*.json. web/test/fixtures.phase10a.test.ts');
  out('-- regenerates this file in memory and fails if the committed copy differs.');
  out('--');
  out('-- Opens a transaction, registers one fixture crawl, and loads one bb_raw row per shell.');
  out('-- It never commits: every Phase 10a test file ends with `rollback;`. Run a test as');
  out('--');
  out('--   cat db/tests/phase10a_load_fixtures.sql db/tests/phase10a_stage_gradebook.sql \\');
  out('--     | psql "$DATABASE_URL"');
  out('--');
  out('-- or paste the same concatenation into one execute_sql call through the Supabase MCP.');
  out('--');
  out('-- The gradebook payloads are Stack\'s real columns from crawl bf2f81e5 (2026-09-14); the');
  out('-- attempts payload is synthetic, because no crawl on record carries an `attempts` key.');
  out('-- Everything loads under the fixture run id, never the real one, so nothing here can');
  out('-- collide with or overwrite prod data even if a transaction were left open.');
  out();
  out('begin;');
  out();
  out('-- The fixture crawl. run_transform and every 10a view only trust a run an owner-claimed');
  out('-- agent_requests row registered (migration 035), so the fixture has to be registered too.');
  out('create temp table _fx (run_id uuid primary key, sync_run_id bigint) on commit drop;');
  out();
  out('insert into agent_requests (kind, scope, state, run_id, note, claimed_by, claimed_at, finished_at)');
  out(`values ('sync', 'all', 'done', '${FIXTURE_RUN_ID}',`);
  out("        'Phase 10a fixture crawl (db/fixtures/phase10a). Test-only; every test rolls back.',");
  out("        'phase10a fixtures', now(), now());");
  out();
  out('with r as (');
  out('  insert into sync_runs (run_id, status, started_at, finished_at, trigger, source, scope)');
  out(`  values ('${FIXTURE_RUN_ID}', 'ok', now(), now(), 'manual', 'blackboard', 'all')`);
  out('  returning id)');
  out(`insert into _fx (run_id, sync_run_id) select '${FIXTURE_RUN_ID}', r.id from r;`);

  for (const shell of shells) {
    out();
    out(`-- ${shell.course_id} (${shell.bb_course_id}) from ${shell.sources.join(' + ')}`);
    out('insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at) values');
    out(`  ('${FIXTURE_RUN_ID}', 'course', '${shell.bb_course_id}',`);
    out(`   ${jsonLiteral(shell.payload)},`);
    out(`   '${shell.captured_at}'::timestamptz);`);
  }

  out();
  out('-- Deliberately no commit. The test file that follows asserts and rolls back.');
  out();
  return lines.join('\n');
}

module.exports = { build, mergeShells, FIXTURE_FILES, FIXTURE_RUN_ID, OUT_PATH };

if (require.main === module) {
  fs.writeFileSync(OUT_PATH, build(), 'utf8');
  process.stdout.write(`wrote ${path.relative(process.cwd(), OUT_PATH)}\n`);
}
