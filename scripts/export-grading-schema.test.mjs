// bb2dash :: scripts/export-grading-schema.test.mjs
// Static test of the V-1 export query (Phase 16, brief 96, task 5; R-35, P-74). It reads the SQL
// text only; the PM runs the query against prod with execute_sql (a read). Run:
//   node --test --test-reporter=tap scripts/export-grading-schema.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SQL_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'export-grading-schema.sql');
const sql = fs.readFileSync(SQL_PATH, 'utf8');

/** The SQL with `--` comments removed, so a name only in a comment does not count. */
const code = sql
  .split(/\r?\n/)
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const HEADINGS = [
  '## 0. Counts',
  '## 1. Schemes',
  '## 2. Components',
  '## 3. Assignments',
  '## 4. Gradebook columns',
  '## 5. grade_column_links',
];

test('the six section headings are present, in order', () => {
  let last = -1;
  for (const heading of HEADINGS) {
    const at = code.indexOf(`'${heading}'`);
    assert.ok(at > last, `${heading} missing or out of order`);
    last = at;
  }
  assert.ok(!code.includes('## 6.'), 'section 6 is appended by hand, never generated');
});

for (const name of [
  'ai_policy', 'count_expected', 'drop_lowest', 'parent_id', 'bb_column_id',
  'grade_column_links', 'counts_toward_grade', 'America/New_York', 'superseded_by',
]) {
  test(`the query names ${name}`, () => {
    assert.ok(code.includes(name), name);
  });
}

test('every Contract column is read', () => {
  for (const col of [
    's.method', 's.total_points', 's.graded_out_of', 's.letter_scale', 's.ai_policy', 's.notes', 's.confidence',
    'g.weight_pct', 'g.points', 'g.count_expected', 'g.aggregation', 'g.drop_lowest', 'g.rank_weights',
    'g.normalize_to', 'g.is_extra_credit', 'g.parent_id', 'g.notes', 'g.confidence',
    'a.component_id', 'a.points_possible', 'a.bb_column_id', 'a.confidence', 'a.source_ref', 'a.due_at', 'a.due_date',
    'v.possible', 'v.column_kind', 'v.linked_assignments', 'v.counts_toward_grade',
    'l.course_id', 'l.column_id', 'l.component_id', 'l.excluded',
  ]) {
    assert.ok(code.includes(col), col);
  }
});

test('the due day is the New York day of due_at, else due_date', () => {
  assert.match(code, /coalesce\(\(a\.due_at at time zone 'America\/New_York'\)::date, a\.due_date\)/);
});

test('the syllabus file follows the superseded_by chain from the syllabus_path file name', () => {
  assert.match(code, /with recursive/i);
  assert.match(code, /f\.file_name = regexp_replace\(c\.syllabus_path/);
  assert.match(code, /where superseded_by is null/);
});

test('the counts section reads the five tables named by the Contract', () => {
  for (const t of ['grading_schemes', 'grade_components', 'assignments', 'grade_column_links', 'v_gradebook_latest']) {
    assert.ok(code.includes(`(select count(*) from ${t})`), t);
  }
});

test('one read-only statement returning one value', () => {
  const statements = code.split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 1, 'exactly one statement');
  assert.match(statements[0], /^with recursive/i);
  assert.match(statements[0], /select string_agg\(body, E'\\n\\n' order by ord\) \|\| E'\\n' as export\s+from sections$/);
  const stripped = statements[0].replace(/'(?:[^']|'')*'/g, "''");
  for (const word of ['insert', 'update', 'delete', 'drop', 'alter', 'create', 'grant', 'revoke', 'truncate', 'copy', 'call']) {
    assert.ok(!new RegExp(`\\b${word}\\b`, 'i').test(stripped), `no ${word}`);
  }
});
