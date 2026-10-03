/**
 * bb2dash :: db/fixtures/phase14/scrub_crawl.mjs
 *
 * The recorded crawl Phase 14's tests replay (brief 100, task 8; P-35): the nine `bb_raw` rows of a
 * real crawler v4 run, with every value Stack wrote, every value written to him about his work, his
 * grades and any contact field removed before a byte reaches the repo, which is public.
 *
 *   node db/fixtures/phase14/scrub_crawl.mjs --from-db [--run <uuid>]   read prod, scrub, write both
 *   node db/fixtures/phase14/scrub_crawl.mjs                            rebuild the loader from the JSON
 *   node db/fixtures/phase14/scrub_crawl.mjs --check                    exit 1 if the loader drifted
 *
 * `--from-db` reads the run through the SQL test credential (`scripts/db-test.mjs`'s `openClient`,
 * the read-only-on-bb_raw role `db_test_runner`), scrubs in memory, and only then writes
 * `crawl_v4_scrubbed.json`. The unscrubbed payloads are never written anywhere.
 *
 * The JSON is the source of record. `db/tests/phase14_load_crawl_v4.sql` is generated from it and
 * never edited by hand; `sync/test/fixture-scrub.test.ts` rebuilds it in memory and fails if the
 * committed copy differs, and asserts that no `SCRUB_FIELDS` key holds a value.
 *
 * Importing this module runs nothing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export const FIXTURE_PATH = path.join(HERE, 'crawl_v4_scrubbed.json');
export const LOADER_PATH = path.join(REPO_ROOT, 'db', 'tests', 'phase14_load_crawl_v4.sql');

/** The default source: request 39 -> sync_runs 62, the parity baseline (brief 100 task 2). */
export const SOURCE_RUN_ID = '3b5174b8-1347-448f-96db-50a0b635dc58';

/** The run every fixture row loads under. Not a real crawl; nothing outside a test transaction. */
export const FIXTURE_RUN_ID = '00000000-1491-4000-8000-000000000001';

/** The shape of a crawler v4 run: one memberships row, seven courses, one calendar row. */
export const EXPECTED_KINDS = Object.freeze({ calendar: 1, course: 7, memberships: 1 });

/**
 * Keys whose value is removed (set to null) wherever they appear, at any depth.
 *
 *   studentSubmission, studentComments   text Stack wrote (P-35)
 *   feedback, instructorFeedback         text written to Stack about his work
 *   score, manualScore, effectiveScore,  his grades; `displayGrade` holds the grade text and score
 *   displayScore, displayGrade
 *   receipt, receiptId                   his submission receipts
 *   email                                a contact field
 *   body, description                    professors' prose: announcement and content bodies carry
 *                                        their email addresses and phone numbers, and their
 *                                        materials stay out of the repo (`course context/` is
 *                                        gitignored for the same reason)
 *
 * The crawl's shape stays (ids, titles, names, paths, durable URLs, dates, statuses), so it still
 * replays as a crawl.
 */
export const SCRUB_FIELDS = Object.freeze([
  'studentSubmission',
  'studentComments',
  'feedback',
  'instructorFeedback',
  'score',
  'manualScore',
  'effectiveScore',
  'displayScore',
  'displayGrade',
  'receipt',
  'receiptId',
  'email',
  'body',
  'description',
]);

const SCRUB_SET = new Set(SCRUB_FIELDS);

/** Empty means null, an empty string, an empty array or an empty object. */
export function isEmptyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * A scrubbed copy of `value` and the number of non-empty values it removed. Never mutates its input.
 */
export function scrubValue(value) {
  if (Array.isArray(value)) {
    let removed = 0;
    const out = value.map((item) => {
      const r = scrubValue(item);
      removed += r.removed;
      return r.value;
    });
    return { value: out, removed };
  }
  if (value !== null && typeof value === 'object') {
    let removed = 0;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (SCRUB_SET.has(key)) {
        if (!isEmptyValue(inner)) removed += 1;
        out[key] = null;
        continue;
      }
      const r = scrubValue(inner);
      removed += r.removed;
      out[key] = r.value;
    }
    return { value: out, removed };
  }
  return { value, removed: 0 };
}

/** Every `SCRUB_FIELDS` key in `value` that still holds something, as dotted paths. */
export function unscrubbedPaths(value, at = '$') {
  if (Array.isArray(value)) return value.flatMap((item, i) => unscrubbedPaths(item, `${at}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => {
      const here = `${at}.${key}`;
      if (SCRUB_SET.has(key) && !isEmptyValue(inner)) return [here];
      return unscrubbedPaths(inner, here);
    });
  }
  return [];
}

/** Build the fixture object from bb_raw rows (kind, bb_course_id, captured_at, payload). */
export function buildFixture(rows, source) {
  let removed = 0;
  const scrubbed = [...rows]
    .map((row) => ({
      kind: String(row.kind),
      bb_course_id: row.bb_course_id ?? null,
      captured_at: new Date(row.captured_at).toISOString(),
      payload: row.payload,
    }))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at) || a.kind.localeCompare(b.kind))
    .map((row) => {
      const r = scrubValue(row.payload);
      removed += r.removed;
      return { ...row, payload: r.value };
    });
  return {
    _source: { ...source, scrub_fields: [...SCRUB_FIELDS], values_removed: removed },
    rows: scrubbed,
  };
}

/** Count rows per kind. */
export function kindCounts(rows) {
  return rows.reduce((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] ?? 0) + 1 }), {});
}

/** Do two kind-count objects hold the same kinds with the same counts? */
export function sameCounts(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => a[k] === b[k]);
}

const DOLLAR_TAG = '$fx14$';

function jsonLiteral(value) {
  const text = JSON.stringify(value);
  if (text.includes(DOLLAR_TAG)) {
    throw new Error(`fixture JSON contains the dollar-quote tag ${DOLLAR_TAG}; pick another tag`);
  }
  return `${DOLLAR_TAG}${text}${DOLLAR_TAG}::jsonb`;
}

function sqlText(value) {
  return value === null ? 'null' : `'${String(value).replace(/'/g, "''")}'`;
}

/** The loader SQL for a fixture object. Opens the transaction; never commits. */
export function buildLoadSql(fixture) {
  const lines = [
    '-- bb2dash :: db/tests/phase14_load_crawl_v4.sql',
    '--',
    '-- GENERATED FILE - do not edit by hand.',
    '--   node db/fixtures/phase14/scrub_crawl.mjs',
    '-- Source of record: db/fixtures/phase14/crawl_v4_scrubbed.json. sync/test/fixture-scrub.test.ts',
    '-- regenerates this file in memory and fails if the committed copy differs.',
    '--',
    `-- Opens a transaction and lands the scrubbed recorded crawl (${fixture.rows.length} bb_raw rows of crawler v4`,
    `-- run ${fixture._source.run_id}) under the fixture run id ${FIXTURE_RUN_ID}, never a real one.`,
    '-- The rows also stay in the temp table _fx14_raw, so the test that follows can load them again.',
    '-- It never commits: db/tests/phase14_091_sync_runner.sql follows it and rolls back.',
    '',
    'begin;',
    '',
    'create temp table _fx14_raw (',
    '  seq          int primary key,',
    '  kind         text not null,',
    '  bb_course_id text,',
    '  payload      jsonb not null,',
    '  captured_at  timestamptz not null',
    ') on commit drop;',
  ];
  fixture.rows.forEach((row, i) => {
    lines.push('');
    lines.push(`-- ${i + 1}. ${row.kind}${row.bb_course_id ? ` ${row.bb_course_id}` : ''}`);
    lines.push('insert into _fx14_raw (seq, kind, bb_course_id, payload, captured_at) values');
    lines.push(`  (${i + 1}, ${sqlText(row.kind)}, ${sqlText(row.bb_course_id)},`);
    lines.push(`   ${jsonLiteral(row.payload)},`);
    lines.push(`   ${sqlText(row.captured_at)}::timestamptz);`);
  });
  lines.push('');
  lines.push('insert into bb_raw (run_id, kind, bb_course_id, payload, captured_at)');
  lines.push(`select '${FIXTURE_RUN_ID}', f.kind, f.bb_course_id, f.payload, f.captured_at`);
  lines.push('  from _fx14_raw f order by f.seq;');
  lines.push('');
  lines.push('-- Deliberately no commit. The test file that follows asserts and rolls back.');
  lines.push('');
  return lines.join('\n');
}

export function readFixture(file = FIXTURE_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The committed loader with line endings normalised, so a CRLF checkout compares equal. */
export function readLoader(file = LOADER_PATH) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

async function readRunFromDb(runId) {
  const { openClient } = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'db-test.mjs')).href);
  const client = await openClient();
  await client.connect();
  try {
    const result = await client.query(
      `select r.kind, r.bb_course_id, r.captured_at, r.payload,
              (select s.id from sync_runs s where s.run_id = r.run_id
                  and s.scope is distinct from 'unregistered' order by s.id desc limit 1) as sync_run_id,
              (select a.id from agent_requests a where a.run_id = r.run_id and a.kind = 'sync'
                order by a.id limit 1) as request_id
         from bb_raw r where r.run_id = $1 order by r.captured_at`,
      [runId],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
}

export async function main(argv = process.argv.slice(2), out = (line) => process.stdout.write(`${line}\n`)) {
  if (argv.includes('--from-db')) {
    const runId = argValue(argv, '--run') ?? SOURCE_RUN_ID;
    const rows = await readRunFromDb(runId);
    const counts = kindCounts(rows);
    if (!sameCounts(counts, EXPECTED_KINDS)) {
      out(`scrub_crawl: run ${runId} has kinds ${JSON.stringify(counts)}, expected ${JSON.stringify(EXPECTED_KINDS)}; nothing written`);
      return 1;
    }
    const fixture = buildFixture(rows, {
      run_id: runId,
      sync_run_id: rows[0]?.sync_run_id === null || rows[0]?.sync_run_id === undefined ? null : Number(rows[0].sync_run_id),
      request_id: rows[0]?.request_id === null || rows[0]?.request_id === undefined ? null : Number(rows[0].request_id),
      crawler_version: 4,
    });
    const left = unscrubbedPaths(fixture.rows);
    if (left.length > 0) {
      out(`scrub_crawl: ${left.length} scrub field(s) still hold values; nothing written`);
      return 1;
    }
    fs.writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 1)}\n`, 'utf8');
    out(`scrub_crawl: wrote ${path.relative(REPO_ROOT, FIXTURE_PATH)} (${fixture.rows.length} rows, ${fixture._source.values_removed} values removed)`);
  }

  const sql = buildLoadSql(readFixture());
  if (argv.includes('--check')) {
    const same = fs.existsSync(LOADER_PATH) && readLoader() === sql;
    out(same ? 'scrub_crawl: loader matches the fixture' : 'scrub_crawl: loader differs from the fixture; run without --check');
    return same ? 0 : 1;
  }
  fs.writeFileSync(LOADER_PATH, sql, 'utf8');
  out(`scrub_crawl: wrote ${path.relative(REPO_ROOT, LOADER_PATH)}`);
  return 0;
}

const invokedDirectly =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (invokedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stdout.write(`scrub_crawl: ${String(err?.message ?? err).split('\n')[0]}\n`);
      process.exitCode = 2;
    },
  );
}
