// bb2dash :: ingest/eval_search.test.mjs
//
//   node --test ingest/eval_search.test.mjs
//
// Phase 18 task 22. The committed eval: ten golden questions, three modes, hit@1/3/10 and MRR.
// Covered here without the network: the golden set's shape, the rank rule (a text-id truth is
// matched by unit, a file truth by any unit of the file), the scoring (EVAL_EMBEDDING_POC.md §3's
// recorded hybrid ranks give MRR 0.950), the drift guard between golden_set.json and
// db/tests/phase18_golden_truth.sql, the key refusal, the --out default, and a full run through an
// injected `post` (30 calls, the MRR bar, the report file).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ev from './eval_search.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(here, 'eval', 'golden_set.json');
const TRUTH_SQL = path.join(here, '..', 'db', 'tests', 'phase18_golden_truth.sql');
const golden = () => JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

test('golden set: the ten EVAL_EMBEDDING_POC §2 queries, each well formed', () => {
  const rows = ev.validateGolden(golden());
  assert.deepEqual(rows.map((r) => r.qid), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const r of rows) {
    assert.ok(r.query && r.course && r.type && r.answer_phrase, `qid ${r.qid} has every field`);
    assert.ok(r.truth.text_ids.length + r.truth.file_ids.length > 0, `qid ${r.qid} has a truth`);
  }
  assert.throws(() => ev.validateGolden([{ qid: 1 }]), /qid 1/);
});

test('golden set: Q7 and Q10 moved to the current documents (149 + 150, 151) after migration 120', () => {
  const byQ = Object.fromEntries(golden().map((r) => [r.qid, r]));
  assert.deepEqual(byQ[7].truth.file_ids, [149, 150], 'the superseded schedules are gone; both current schedules carry the answer (POC §1: a file set when several near-duplicate files carry it)');
  assert.deepEqual(byQ[10].truth.file_ids, [151], 'file 2 is superseded; 13 carries no answer phrase');
});

test('firstHitRank: a text-id truth matches by unit, a file truth by any unit of the file', () => {
  const results = [{ file_id: 4, text_id: 360 }, { file_id: 42, text_id: 271 }, { file_id: 42, text_id: 270 }];
  assert.equal(ev.firstHitRank(results, { text_ids: [270], file_ids: [42] }), 3, 'another unit of the file is not the answer');
  assert.equal(ev.firstHitRank(results, { text_ids: [], file_ids: [42] }), 2);
  assert.equal(ev.firstHitRank(results, { text_ids: [999], file_ids: [] }), null);
  const eleven = Array.from({ length: 11 }, (_, i) => ({ file_id: i === 10 ? 42 : 1, text_id: i }));
  assert.equal(ev.firstHitRank(eleven, { text_ids: [], file_ids: [42] }), null, 'only the top 10 count');
});

test('scoreRanks: §3 recorded hybrid ranks give MRR 0.950, hit@1 9, hit@3 10, hit@10 10', () => {
  const s = ev.scoreRanks([1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  assert.equal(s.mrr.toFixed(3), '0.950');
  assert.deepEqual([s.hit1, s.hit3, s.hit10, s.n], [9, 10, 10, 10]);
  const fts = ev.scoreRanks([null, 1, null, null, null, null, null, null, null, null]);
  assert.equal(fts.mrr.toFixed(3), '0.100', 'a miss scores 0');
});

test('drift guard: golden_set.json and phase18_golden_truth.sql name the same qids, truth ids and phrases', () => {
  const fromSql = ev.parseTruthSql(fs.readFileSync(TRUTH_SQL, 'utf8'));
  const fromJson = golden().map((r) => ({ qid: r.qid, text_ids: r.truth.text_ids, file_ids: r.truth.file_ids, answer_phrase: r.answer_phrase }));
  assert.deepEqual(fromSql, fromJson);
});

test('the truth test follows the runner contract: begin; … rollback; and a `: PASS` row', () => {
  const sql = fs.readFileSync(TRUTH_SQL, 'utf8');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^rollback;\s*$/m);
  assert.doesNotMatch(sql, /^\s*(commit|end)\s*;/im);
  assert.match(sql, /'phase18_golden_truth: PASS'/);
});

test('a publishable key is refused by name; the legacy anon JWT is what search needs', async () => {
  const lines = [];
  const code = await ev.main([], { SB_ANON_JWT: 'sb_publishable_x' }, { post: async () => { throw new Error('never called'); }, log: (l) => lines.push(l), err: (l) => lines.push(l) });
  assert.equal(code, 2);
  assert.match(lines.join('\n'), /publishable/);
  assert.equal(await ev.main([], {}, { log: () => {}, err: () => {} }), 2, 'no key at all');
});

test('--out defaults to ingest/eval/reports/<YYYY-MM-DD>.json', () => {
  const p = ev.defaultOutPath(new Date('2026-09-29T12:00:00Z')).replace(/\\/g, '/');
  assert.ok(p.endsWith('ingest/eval/reports/2026-09-29.json'), p);
});

function fakePost(rankFor) {
  const calls = [];
  const post = async (body) => {
    calls.push(body);
    const row = golden().find((g) => g.query === body.q);
    const rank = rankFor(row.qid, body.mode);
    const hit = row.truth.text_ids.length ? { file_id: row.truth.file_ids[0] ?? 0, text_id: row.truth.text_ids[0] } : { file_id: row.truth.file_ids[0], text_id: 1 };
    const results = Array.from({ length: 10 }, (_, i) => (rank === i + 1 ? hit : { file_id: 9000 + i, text_id: 9000 + i }));
    return { status: 200, body: { mode: body.mode, count: 10, results } };
  };
  return { post, calls };
}

test('a full run: 30 calls (10 queries x fts/vector/hybrid, limit 10), scored=30, report written, exit 0 at the bar', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-')), 'r.json');
  const { post, calls } = fakePost((qid) => (qid === 10 ? 2 : 1));
  const lines = [];
  const code = await ev.main(['--out', out], { SB_ANON_JWT: 'eyJ.legacy.jwt' }, { post, log: (l) => lines.push(l), err: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.equal(calls.length, 30);
  assert.ok(calls.every((c) => c.limit === 10 && ['fts', 'vector', 'hybrid'].includes(c.mode) && !('course' in c)));
  assert.ok(lines.includes('scored=30'), lines.join('\n'));
  const report = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(report.modes.hybrid.mrr.toFixed(3), '0.950');
  assert.equal(report.queries.length, 10);
  assert.equal(report.queries[9].ranks.hybrid, 2);
});

test('a run below the bar (hybrid MRR < 0.900) exits 1', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-')), 'r.json');
  const { post } = fakePost((qid, mode) => (mode === 'hybrid' && qid <= 3 ? null : 1));
  const code = await ev.main(['--out', out], { SB_ANON_JWT: 'eyJ.legacy.jwt' }, { post, log: () => {}, err: () => {} });
  assert.equal(code, 1);
});

test('an HTTP error on any call is not scored as a miss: the run fails', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eval-')), 'r.json');
  const post = async () => ({ status: 401, body: { msg: 'Invalid JWT' } });
  const lines = [];
  const code = await ev.main(['--out', out], { SB_ANON_JWT: 'eyJ.legacy.jwt' }, { post, log: (l) => lines.push(l), err: (l) => lines.push(l) });
  assert.equal(code, 1);
  assert.match(lines.join('\n'), /401/);
  assert.ok(!lines.includes('scored=30'));
});
