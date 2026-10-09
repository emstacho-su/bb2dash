#!/usr/bin/env node
// bb2dash :: ingest/eval_search.mjs
//
//   node ingest/eval_search.mjs [--out <path>]
//
// Phase 18 task 22 (P-90, P-91, S2-rag-1). The committed re-run of EVAL_EMBEDDING_POC.md: the nine
// golden questions in ingest/eval/golden_set.json (the POC's Q1–Q9; Q10, the IST.323 AI-use
// disclosure, was removed on 2026-09-29 by Stack's call to take the AI policy out of the corpus),
// each POSTed to the `search` edge function in `fts`, `vector` and `hybrid` mode with `limit: 10`
// and no course filter (27 calls), scored by the
// rank of the first ground-truth hit: hit@1, hit@3, hit@10 and MRR (a miss scores 0).
//
// The rank rule is the POC's: a truth with `text_ids` is matched by unit (another unit of the same
// file is not the answer); a truth with only `file_ids` is matched by any unit of those files.
// db/tests/phase18_golden_truth.sql proves the truth still holds on prod (every id current, the
// answer phrase in the unit); eval_search.test.mjs fails if the two files drift apart.
//
// It writes the report to --out (default ingest/eval/reports/<YYYY-MM-DD>.json), prints
// `scored=27` (queries x modes) when every call answered 200, and exits 1 if any call failed or hybrid MRR is below
// 0.900 (the PM's bar; the 2026-09-09 baseline is 0.950). Exit 2: no usable key.
//
// Key: SB_ANON_JWT, the legacy anon JWT (`search` has verify_jwt on). A `sb_publishable_` value is
// refused by name, as ingest/embed_corpus.mjs does. It is read from the process environment only.
//
// Importing this module runs nothing; every piece is exported for eval_search.test.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { assertUsableJwt, DEFAULT_SUPABASE_URL, parseArgs } from './embed_corpus.mjs';

export const MODES = ['fts', 'vector', 'hybrid'];
export const LIMIT = 10;
export const HYBRID_MRR_BAR = 0.9;
const INGEST_DIR = path.dirname(fileURLToPath(import.meta.url));
export const GOLDEN_PATH = path.join(INGEST_DIR, 'eval', 'golden_set.json');

const isIdList = (v) => Array.isArray(v) && v.every((x) => Number.isSafeInteger(x) && x > 0);

/** The golden rows, checked: qid, course, query, type, answer_phrase, and a non-empty truth. */
export function validateGolden(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('golden set: expected a non-empty array');
  for (const r of rows) {
    const ok = Number.isSafeInteger(r?.qid) && typeof r.course === 'string' && typeof r.query === 'string' && r.query
      && typeof r.type === 'string' && typeof r.answer_phrase === 'string' && r.answer_phrase
      && isIdList(r.truth?.text_ids) && isIdList(r.truth?.file_ids)
      && r.truth.text_ids.length + r.truth.file_ids.length > 0;
    if (!ok) throw new Error(`golden set: qid ${r?.qid} is malformed`);
  }
  return rows;
}

/** 1-indexed rank of the first ground-truth hit in the top LIMIT results, or null. */
export function firstHitRank(results, truth) {
  const byText = truth.text_ids.length > 0;
  const top = (results ?? []).slice(0, LIMIT);
  const i = top.findIndex((r) => (byText ? truth.text_ids.includes(Number(r.text_id)) : truth.file_ids.includes(Number(r.file_id))));
  return i < 0 ? null : i + 1;
}

/** hit@1/3/10 counts and MRR over a list of ranks (null = miss). */
export function scoreRanks(ranks) {
  const hit = (k) => ranks.filter((r) => r !== null && r <= k).length;
  const mrr = ranks.length ? ranks.reduce((s, r) => s + (r ? 1 / r : 0), 0) / ranks.length : 0;
  return { n: ranks.length, hit1: hit(1), hit3: hit(3), hit10: hit(10), mrr };
}

/** The truth rows of db/tests/phase18_golden_truth.sql, for the drift guard. */
export function parseTruthSql(sql) {
  const re = /^\s*\((\d+), array\[([\d, ]*)\]::bigint\[\], array\[([\d, ]*)\]::bigint\[\], '((?:[^']|'')*)'\),?\s*$/;
  const ids = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).map(Number);
  return String(sql).split(/\r?\n/).map((line) => line.match(re)).filter(Boolean)
    .map((m) => ({ qid: Number(m[1]), text_ids: ids(m[2]), file_ids: ids(m[3]), answer_phrase: m[4].replace(/''/g, "'") }));
}

export function defaultOutPath(now = new Date()) {
  return path.join(INGEST_DIR, 'eval', 'reports', `${now.toISOString().slice(0, 10)}.json`);
}

/** A `post(body) → {status, body}` for the search function; never throws for an HTTP status. */
export function makeSearchPost(supabaseUrl, jwt) {
  return async (body) => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, apikey: jwt },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 400) }; }
      return { status: res.status, body: parsed };
    } catch (e) {
      return { status: 0, body: { error: `request failed: ${String((e && e.message) || e)}` } };
    }
  };
}

/** Run every golden query in every mode. Returns per-query ranks and any call errors. */
export async function runEval(rows, post) {
  const queries = [];
  const errors = [];
  for (const row of rows) {
    const ranks = {};
    for (const mode of MODES) {
      const res = await post({ q: row.query, mode, limit: LIMIT });
      if (res.status !== 200 || !Array.isArray(res.body?.results)) {
        errors.push(`Q${row.qid} ${mode}: HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
        ranks[mode] = null;
        continue;
      }
      ranks[mode] = firstHitRank(res.body.results, row.truth);
    }
    queries.push({ qid: row.qid, course: row.course, type: row.type, query: row.query, ranks });
  }
  const modes = Object.fromEntries(MODES.map((m) => [m, scoreRanks(queries.map((q) => q.ranks[m]))]));
  return { queries, modes, errors };
}

export async function main(argv = process.argv.slice(2), env = process.env, deps = {}) {
  const log = deps.log ?? ((l) => console.log(l));
  const err = deps.err ?? ((l) => console.error(l));
  const args = parseArgs(argv);
  let jwt;
  try { jwt = assertUsableJwt(env.SB_ANON_JWT); } catch (e) {
    err(String((e && e.message) || e).replace('embed-corpus', 'search'));
    return 2;
  }
  const rows = validateGolden(JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8')));
  const post = deps.post ?? makeSearchPost(env.SUPABASE_URL || DEFAULT_SUPABASE_URL, jwt);
  const { queries, modes, errors } = await runEval(rows, post);

  const out = typeof args.out === 'string' ? args.out : defaultOutPath();
  const report = { run_at: new Date().toISOString(), limit: LIMIT, bar: { hybrid_mrr: HYBRID_MRR_BAR }, modes, queries, errors };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

  for (const m of MODES) {
    const s = modes[m];
    log(`${m}: hit@1=${s.hit1}/${s.n} hit@3=${s.hit3}/${s.n} hit@10=${s.hit10}/${s.n} mrr=${s.mrr.toFixed(3)}`);
  }
  if (errors.length) {
    for (const e of errors) err(e);
    err(`${errors.length} call(s) failed; report in ${out}`);
    return 1;
  }
  log(`scored=${queries.length * MODES.length}`);
  log(`report: ${out}`);
  if (modes.hybrid.mrr < HYBRID_MRR_BAR) {
    err(`hybrid MRR ${modes.hybrid.mrr.toFixed(3)} is below the bar ${HYBRID_MRR_BAR.toFixed(3)}`);
    return 1;
  }
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
// Set the exit code and let the event loop drain: a hard exit while undici is still closing a
// fetch handle aborts node on Windows (libuv `!(handle->flags & UV_HANDLE_CLOSING)`, async.c:94).
if (invokedDirectly) {
  main().then(
    (code) => { process.exitCode = code; },
    (e) => { console.error(String((e && e.stack) || e)); process.exitCode = 1; },
  );
}
