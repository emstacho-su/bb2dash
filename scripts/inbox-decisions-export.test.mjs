// The inbox-decisions exporter on fakes (Phase 23): a temporary vault and log folder, a recorded
// PostgREST, and a recorded command runner. Nothing touches the network or the real vault.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_LIMIT,
  DEFAULT_SUPABASE_URL,
  ExportError,
  SERVICE_KEY_FILE,
  createRpc,
  exportDecisions,
  parseArgs,
  readConfig,
  readServiceKey,
  resolveVault,
} from './inbox-decisions-export.mjs';

const KEY = 'sb_secret_TESTONLY_not_a_real_key';

function row(id, over = {}) {
  return {
    id,
    kind: 'stack_must_confirm',
    course_id: 'IST.352',
    entity: 'assignment',
    ref: `assignment:IST.352/item-${id}`,
    field: null,
    question: `Question ${id}?`,
    resolution: { value: 'yes' },
    resolution_note: null,
    resolved_at: '2026-10-07T14:02:11Z',
    applied_at: null,
    archived_at: '2026-10-07T18:31:02Z',
    archived_by: 'inbox-apply request 1860',
    decision: { schema: 'inbox-decision/1', item: id, request: 1860, mode: 'unattended', bucket: 'kept', change: 'recorded only', rule: '' },
    ...over,
  };
}

function tempDirs(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-export-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const vault = path.join(root, 'vault');
  const logDir = path.join(root, 'log');
  fs.mkdirSync(vault);
  return { root, vault, logDir };
}

/** A recorded rpc: `rows` is what unfiled() returns; filed() answers from `marks` (default true). */
function fakeRpc(rows, marks = {}) {
  const calls = [];
  return {
    calls,
    unfiled: async (limit) => {
      calls.push(['unfiled', limit]);
      return rows;
    },
    filed: async (id, filed) => {
      calls.push(['filed', id, filed]);
      const answer = marks[id];
      if (answer instanceof Error) throw answer;
      return answer ?? true;
    },
  };
}

function deps(t, rows, over = {}) {
  const dirs = tempDirs(t);
  const lines = [];
  const runs = [];
  return {
    dirs,
    lines,
    runs,
    deps: {
      rpc: fakeRpc(rows, over.marks),
      vault: dirs.vault,
      ingestProject: over.ingestProject ?? path.join(dirs.root, 'ingest'),
      logDir: dirs.logDir,
      options: { dryRun: false, ingest: true, limit: DEFAULT_LIMIT, ...over.options },
      run: (command, args, cwd) => {
        runs.push({ command, args, cwd });
        return { status: over.ingestStatus ?? 0, stdout: '', stderr: '' };
      },
      log: (line) => lines.push(line),
    },
  };
}

test('arguments: the four options, and anything else is a usage error', () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, ingest: true, logDir: null, limit: DEFAULT_LIMIT });
  assert.deepEqual(parseArgs(['--dry-run', '--no-ingest', '--log-dir', 'x/y', '--limit', '5']), {
    dryRun: true, ingest: false, logDir: 'x/y', limit: 5,
  });
  for (const bad of [['--nope'], ['--log-dir'], ['--limit', '0'], ['--limit', '501'], ['--limit', 'many'], ['extra']]) {
    assert.throws(() => parseArgs(bad), ExportError);
  }
});

test('configuration: SECRETS_DIR and HARNESS_DIR are required, and the URL must be an https origin', () => {
  const options = parseArgs([]);
  assert.throws(() => readConfig({ env: { HARNESS_DIR: 'h' }, options }), /SECRETS_DIR is not set/);
  assert.throws(() => readConfig({ env: { SECRETS_DIR: 's' }, options }), /HARNESS_DIR is not set/);
  assert.throws(() => readConfig({ env: { SECRETS_DIR: 's', HARNESS_DIR: 'h', SUPABASE_URL: 'http://x' }, options }), /https origin/);
  const config = readConfig({ env: { SECRETS_DIR: 's', HARNESS_DIR: 'h' }, options, repoRoot: path.resolve('repo') });
  assert.equal(config.supabaseUrl, DEFAULT_SUPABASE_URL);
  assert.equal(config.logDir, path.resolve('repo', 'docs', 'inbox-decisions'));
  assert.equal(
    readConfig({ env: { SECRETS_DIR: 's', HARNESS_DIR: 'h' }, options: parseArgs(['--log-dir', 'elsewhere']) }).logDir,
    path.resolve('elsewhere'),
  );
});

test('the service key is read from its file, trimmed, and a missing or odd one is a configuration error', (t) => {
  const { root } = tempDirs(t);
  assert.throws(() => readServiceKey(root), /could not read bb2dash_mcp_service_key/);
  fs.writeFileSync(path.join(root, SERVICE_KEY_FILE), `﻿${KEY}\r\n`);
  assert.equal(readServiceKey(root), KEY);
  fs.writeFileSync(path.join(root, SERVICE_KEY_FILE), 'two values');
  assert.throws(() => readServiceKey(root), /empty or holds more than one value/);
  fs.writeFileSync(path.join(root, SERVICE_KEY_FILE), '  \n');
  assert.throws(() => readServiceKey(root), ExportError);
});

test('the vault must resolve to the projects realm, or nothing is filed', (t) => {
  const { vault } = tempDirs(t);
  const answer = (status, config) => () => ({ status, stdout: JSON.stringify(config), stderr: '' });
  const good = { vault, ingestProject: 'ingest-here', realmCheck: { ok: true } };

  const calls = [];
  const resolved = resolveVault({
    harnessDir: 'harness',
    run: (command, args, cwd) => {
      calls.push({ command, args, cwd });
      return { status: 0, stdout: JSON.stringify(good), stderr: '' };
    },
  });
  assert.deepEqual(resolved, { vault, ingestProject: 'ingest-here' });
  assert.equal(calls[0].command, process.execPath);
  assert.deepEqual(calls[0].args, [path.join('harness', 'hooks', 'resolve-config.mjs'), '--json', '--require-realm', 'projects']);

  for (const [label, run] of [
    ['a non-zero exit', answer(2, good)],
    ['a failed realm check', answer(0, { ...good, realmCheck: { ok: false } })],
    ['no vault', answer(0, { ...good, vault: '' })],
    ['a vault folder that is not there', answer(0, { ...good, vault: path.join(vault, 'missing') })],
    ['an answer that is not JSON', () => ({ status: 0, stdout: 'vault=x realm=projects ok', stderr: '' })],
  ]) {
    assert.throws(() => resolveVault({ harnessDir: 'harness', run }), /nothing was filed/, label);
  }
});

test('the rpc posts to the two functions as the service role and never prints the key', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/inbox_decisions_unfiled')) return new Response(JSON.stringify([row(1)]), { status: 200 });
    return new Response('true', { status: 200 });
  };
  const rpc = createRpc({ supabaseUrl: 'https://p.supabase.co', serviceKey: KEY, fetchImpl });
  assert.equal((await rpc.unfiled(7)).length, 1);
  assert.equal(await rpc.filed(1, { note_path: 'n', log_path: 'l', ingested: true }), true);
  assert.equal(requests[0].url, 'https://p.supabase.co/rest/v1/rpc/inbox_decisions_unfiled');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.apikey, KEY);
  assert.equal(requests[0].init.headers.authorization, `Bearer ${KEY}`);
  assert.deepEqual(JSON.parse(requests[0].init.body), { p_limit: 7 });
  assert.deepEqual(JSON.parse(requests[1].init.body), { p_id: 1, p_filed: { note_path: 'n', log_path: 'l', ingested: true } });

  const refusing = createRpc({
    supabaseUrl: 'https://p.supabase.co',
    serviceKey: KEY,
    fetchImpl: async () => new Response(`permission denied for key ${KEY}`, { status: 403 }),
  });
  await assert.rejects(refusing.unfiled(1), (error) => /HTTP 403/.test(error.message) && !error.message.includes(KEY));
  const unreachable = createRpc({
    supabaseUrl: 'https://p.supabase.co',
    serviceKey: KEY,
    fetchImpl: async () => {
      throw new Error(`connect failed with ${KEY}`);
    },
  });
  await assert.rejects(unreachable.filed(1, {}), (error) => /did not reach Supabase/.test(error.message) && !error.message.includes(KEY));
  const odd = createRpc({ supabaseUrl: 'https://p.supabase.co', serviceKey: KEY, fetchImpl: async () => new Response('{"a":1}', { status: 200 }) });
  await assert.rejects(odd.unfiled(1), /not a list/);
});

test('files each decision: the note, the day file, one ingest, then the mark', async (t) => {
  const rows = [row(3101), row(3104, { archived_at: '2026-10-08T03:30:00Z' }), row(3110, { archived_at: '2026-10-08T15:00:00Z' })];
  const { deps: d, dirs, lines, runs } = deps(t, rows);
  const result = await exportDecisions(d);

  assert.deepEqual(result, { filed: [3101, 3104, 3110], failed: [] });
  for (const id of [3101, 3104, 3110]) {
    const note = fs.readFileSync(path.join(dirs.vault, 'projects', 'bb2dash', 'decisions', `inbox-${id}.md`), 'utf8');
    assert.match(note, new RegExp(`^attention_item: ${id}$`, 'm'));
  }
  // 03:30Z on the 8th is still the 7th in New York: two entries on the 7th, one on the 8th.
  const seventh = fs.readFileSync(path.join(dirs.logDir, '2026-10-07.md'), 'utf8');
  assert.deepEqual(seventh.match(/^## (\d+) — /gm), ['## 3101 — ', '## 3104 — ']);
  assert.match(fs.readFileSync(path.join(dirs.logDir, '2026-10-08.md'), 'utf8'), /^# Inbox decisions — 2026-10-08\n\n## 3110 — /);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].command, 'uv');
  assert.equal(runs[0].cwd, d.ingestProject);
  assert.deepEqual(runs[0].args, [
    'run', 'ingest', '--source', 'obsidian', '--path', dirs.vault,
    '--only', 'projects/bb2dash/decisions/inbox-3101.md',
    '--only', 'projects/bb2dash/decisions/inbox-3104.md',
    '--only', 'projects/bb2dash/decisions/inbox-3110.md',
  ]);
  assert.deepEqual(d.rpc.calls[0], ['unfiled', DEFAULT_LIMIT]);
  assert.deepEqual(d.rpc.calls[1], ['filed', 3101, { note_path: 'projects/bb2dash/decisions/inbox-3101.md', log_path: 'docs/inbox-decisions/2026-10-07.md', ingested: true }]);
  assert.deepEqual(d.rpc.calls[3][2].log_path, 'docs/inbox-decisions/2026-10-08.md');
  assert.ok(lines.includes('filed item 3101: projects/bb2dash/decisions/inbox-3101.md, docs/inbox-decisions/2026-10-07.md'));
  // No temporary file is left beside a note or a day file.
  assert.deepEqual(fs.readdirSync(dirs.logDir).sort(), ['2026-10-07.md', '2026-10-08.md']);
});

test('nothing to file: no file, no ingest, no mark', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, []);
  assert.deepEqual(await exportDecisions(d), { filed: [], failed: [] });
  assert.deepEqual(lines, ['nothing to file']);
  assert.equal(runs.length, 0);
  assert.equal(fs.existsSync(dirs.logDir), false);
});

test('--dry-run names what it would file and writes nothing', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, [row(3101)], { options: { dryRun: true } });
  assert.deepEqual(await exportDecisions(d), { filed: [], failed: [] });
  assert.deepEqual(lines, ['would file item 3101 (2026-10-07)']);
  assert.equal(runs.length, 0);
  assert.deepEqual(d.rpc.calls, [['unfiled', DEFAULT_LIMIT]]);
  assert.equal(fs.existsSync(path.join(dirs.vault, 'projects')), false);
});

test('a failed ingest still files the rows, marked ingested false; --no-ingest runs none', async (t) => {
  const failing = deps(t, [row(3101)], { ingestStatus: 1 });
  assert.deepEqual((await exportDecisions(failing.deps)).filed, [3101]);
  assert.equal(failing.deps.rpc.calls[1][2].ingested, false);
  assert.ok(failing.lines.some((l) => l.startsWith('ingest: failed (exit 1)')));

  const off = deps(t, [row(3102)], { options: { ingest: false } });
  assert.deepEqual((await exportDecisions(off.deps)).filed, [3102]);
  assert.equal(off.runs.length, 0);
  assert.equal(off.deps.rpc.calls[1][2].ingested, false);

  const noProject = deps(t, [row(3103)], { ingestProject: '' });
  noProject.deps.ingestProject = '';
  assert.deepEqual((await exportDecisions(noProject.deps)).filed, [3103]);
  assert.equal(noProject.runs.length, 0);
});

test('a re-run after a crash files nothing twice: an identical note is kept and the day file skips the item', async (t) => {
  const first = deps(t, [row(3101)], { marks: { 3101: new Error('connection reset') } });
  const crashed = await exportDecisions(first.deps);
  assert.deepEqual(crashed.filed, []);
  assert.equal(crashed.failed[0].id, 3101);
  const logFile = path.join(first.dirs.logDir, '2026-10-07.md');
  const before = fs.readFileSync(logFile, 'utf8');

  // The same row comes back unfiled; this time the mark goes through.
  first.deps.rpc = fakeRpc([row(3101)]);
  assert.deepEqual((await exportDecisions(first.deps)).filed, [3101]);
  assert.equal(fs.readFileSync(logFile, 'utf8'), before);
});

test('never overwrites a different note, never files a row that is not inbox-decision/1, and one bad row does not stop the rest', async (t) => {
  const rows = [
    row(3101),
    row(3102, { decision: { change: 'confirmed', note_id: 'bb2dash-inbox-decision-3102' } }),
    row(3103, { archived_at: 'never' }),
    row(3104),
  ];
  const { deps: d, dirs, lines } = deps(t, rows, { marks: { 3104: false } });
  const notes = path.join(dirs.vault, 'projects', 'bb2dash', 'decisions');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, 'inbox-3101.md'), 'a note Stack wrote by hand\n');

  const result = await exportDecisions(d);
  assert.deepEqual(result.filed, []);
  assert.deepEqual(result.failed.map((f) => f.id).sort(), [3101, 3102, 3103, 3104]);
  assert.equal(fs.readFileSync(path.join(notes, 'inbox-3101.md'), 'utf8'), 'a note Stack wrote by hand\n');
  assert.equal(fs.existsSync(path.join(notes, 'inbox-3102.md')), false);
  assert.ok(lines.some((l) => l.startsWith('not filed item 3101: a different note already exists')));
  assert.ok(lines.some((l) => l === 'not filed item 3102: not an inbox-decision/1 record'));
  assert.ok(lines.some((l) => l.startsWith('not filed item 3103: ') && l.includes('archived_at')));
  assert.ok(lines.some((l) => l.startsWith('not filed item 3104: the database did not mark it')));
  // Only the rows that were written are marked: 3104 was, the other three never reach the database.
  assert.deepEqual(d.rpc.calls.filter((c) => c[0] === 'filed').map((c) => c[1]), [3104]);
});
