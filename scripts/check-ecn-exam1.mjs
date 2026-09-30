#!/usr/bin/env node
// bb2dash :: scripts/check-ecn-exam1.mjs
// Optional read-only check (no gate, DECISIONS 2026-09-30): does ECN.304 Exam 1 count toward "graded so far"?
//
//   node scripts/check-ecn-exam1.mjs [--json]
//
// Runs scripts/check-ecn-exam1.sql read-only (begin read only … rollback) as the db_test_runner role
// from .env.local (BB2DASH_TEST_DB_URL, the same credential as scripts/db-test.mjs). Prints one line,
// `ecn304-exam1: PASS|PENDING|FAIL — <detail>`, and exits 0 / 3 / 1. It reads the gradebook's crawl
// history, so it answers correctly whenever it is run after the sync, with or without a Claude session.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openClient } from './db-test.mjs';

export const EXIT = Object.freeze({ PASS: 0, FAIL: 1, PENDING: 3 });
const CHECK = 'ecn304-exam1';
const SQL_FILE = new URL('./check-ecn-exam1.sql', import.meta.url);

/** One output line (or JSON object) for a result row. An unknown state is reported as FAIL. */
export function formatResult(row, { json = false, now = new Date().toISOString() } = {}) {
  const state = row?.state in EXIT ? row.state : 'FAIL';
  const detail = row?.state in EXIT ? String(row.detail ?? '') : `unexpected result ${JSON.stringify(row)}`;
  if (json) return JSON.stringify({ check: CHECK, state, detail, checked_at: now });
  return `${CHECK}: ${state} — ${detail}`;
}

/** Runs the check on an unconnected client; always ends the client. Returns { code, line, row }. */
export async function runCheck({ client, json = false, sql = fs.readFileSync(SQL_FILE, 'utf8') } = {}) {
  await client.connect();
  try {
    await client.query('begin read only');
    try {
      const result = await client.query(sql);
      const row = result.rows[0];
      const line = formatResult(row, { json });
      const state = row?.state in EXIT ? row.state : 'FAIL';
      return { code: EXIT[state], line, row };
    } finally {
      await client.query('rollback');
    }
  } finally {
    await client.end();
  }
}

async function main(argv) {
  const json = argv.includes('--json');
  try {
    const { code, line } = await runCheck({ client: await openClient(), json });
    console.log(line);
    return code;
  } catch (err) {
    console.error(`${CHECK}: FAIL — ${String(err?.message ?? err).split(/\r?\n/)[0]}`);
    return EXIT.FAIL;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
