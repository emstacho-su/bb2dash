// node --test scripts/check-ecn-exam1.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EXIT, formatResult, runCheck } from './check-ecn-exam1.mjs';

const SQL = fs.readFileSync(new URL('./check-ecn-exam1.sql', import.meta.url), 'utf8');

function fakeClient(row, log = []) {
  return {
    connect: async () => log.push('connect'),
    query: async (text) => {
      log.push(text.trim().split(/\s+/).slice(0, 3).join(' '));
      return text.includes('exam1_cols') ? { rows: [row] } : { rows: [] };
    },
    end: async () => log.push('end'),
  };
}

test('the query is one read-only statement', () => {
  const body = SQL.replace(/^--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''").trim();
  assert.equal(body.split(';').filter((s) => s.trim()).length, 1);
  assert.doesNotMatch(body, /\b(insert|update|delete|drop|alter|create|grant|truncate)\b/i);
  assert.match(body, /bb_gradebook/);
  assert.match(body, /v_grade_model_items/);
});

test('exit codes: PASS 0, FAIL 1, PENDING 3', () => {
  assert.deepEqual(EXIT, { PASS: 0, FAIL: 1, PENDING: 3 });
});

for (const [state, code] of [['PASS', 0], ['FAIL', 1], ['PENDING', 3]]) {
  test(`${state} prints one line and returns ${code}`, async () => {
    const log = [];
    const { code: got, line } = await runCheck({ client: fakeClient({ state, detail: 'd' }, log) });
    assert.equal(got, code);
    assert.equal(line, `ecn304-exam1: ${state} — d`);
    assert.deepEqual([log[0], log[1], log.at(-2), log.at(-1)], ['connect', 'begin read only', 'rollback', 'end']);
  });
}

test('an unknown state is a FAIL, never a silent pass', async () => {
  const { code, line } = await runCheck({ client: fakeClient({ state: 'MAYBE', detail: 'x' }) });
  assert.equal(code, 1);
  assert.match(line, /FAIL/);
});

test('--json prints the row with the checked time', () => {
  const out = JSON.parse(formatResult({ state: 'PENDING', detail: 'd' }, { json: true, now: '2026-09-30T00:00:00Z' }));
  assert.deepEqual(out, { check: 'ecn304-exam1', state: 'PENDING', detail: 'd', checked_at: '2026-09-30T00:00:00Z' });
});

test('the client is closed even when the query throws', async () => {
  const log = [];
  const client = { ...fakeClient({}, log), query: async (t) => { log.push(t.trim()); if (t.includes('exam1_cols')) throw new Error('boom'); return { rows: [] }; } };
  await assert.rejects(runCheck({ client }), /boom/);
  assert.equal(log.at(-1), 'end');
});
