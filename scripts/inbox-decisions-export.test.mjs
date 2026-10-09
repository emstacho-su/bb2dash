// The inbox-decisions exporter on fakes (Phase 23): a temporary vault and log folder, a recorded
// PostgREST, and a recorded command runner. Nothing touches the network or the real vault.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  createRpc,
  DEFAULT_LIMIT,
  DEFAULT_SUPABASE_URL,
  EXIT_UNREACHABLE,
  exportDecisions,
  ExportError,
  isTestQuestion,
  main,
  parseArgs,
  readConfig,
  readServiceKey,
  resolveVault,
  runCommand,
  SERVICE_KEY_FILE,
  SKIP_WHY,
  UnreachableError,
  writeAtomic,
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

/**
 * A recorded rpc: `rows` is what unfiled() returns; filed() answers from `marks` (default true).
 * `extra.unlogged` is what unlogged() returns; `extra.logged` and `extra.skipped` answer per id like `marks`.
 */
function fakeRpc(rows, marks = {}, extra = {}) {
  const calls = [];
  const answer = (table, id) => {
    const value = table?.[id];
    if (value instanceof Error) throw value;
    return value ?? true;
  };
  return {
    calls,
    unfiled: async (limit) => {
      calls.push(['unfiled', limit]);
      // The first read is `rows`; a later read (after a refused skip) is `extra.reread` when given.
      const first = calls.filter((c) => c[0] === 'unfiled').length === 1;
      if (first || extra.reread === undefined) return rows;
      if (extra.reread instanceof Error) throw extra.reread;
      return extra.reread;
    },
    unlogged: async (limit) => {
      calls.push(['unlogged', limit]);
      return extra.unlogged ?? [];
    },
    filed: async (id, filed) => {
      calls.push(['filed', id, filed]);
      return answer(marks, id);
    },
    logged: async (id, logPath) => {
      calls.push(['logged', id, logPath]);
      return answer(extra.logged, id);
    },
    skipped: async (id, why) => {
      calls.push(['skipped', id, why]);
      return answer(extra.skipped, id);
    },
  };
}

/** The decision of an acceptance run's test question: the three-part shape. */
function testQuestion(id, over = {}) {
  return row(id, { ref: 'accept/20261008T1/confirm', entity: 'agent_request', course_id: null, ...over });
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
      rpc: fakeRpc(rows, over.marks, over.extra),
      vault: dirs.vault,
      ingestProject: over.ingestProject ?? path.join(dirs.root, 'ingest'),
      logDir: over.logDir === undefined ? dirs.logDir : over.logDir,
      options: { dryRun: false, ingest: true, notesOnly: false, limit: DEFAULT_LIMIT, ...over.options },
      run: (command, args, cwd) => {
        runs.push({ command, args, cwd });
        return { status: over.ingestStatus ?? 0, stdout: '', stderr: '' };
      },
      log: (line) => lines.push(line),
    },
  };
}

test('arguments: the five options, and anything else is a usage error', () => {
  assert.deepEqual(parseArgs([]), { dryRun: false, ingest: true, notesOnly: false, logDir: null, limit: DEFAULT_LIMIT });
  assert.deepEqual(parseArgs(['--dry-run', '--no-ingest', '--log-dir', 'x/y', '--limit', '5']), {
    dryRun: true, ingest: false, notesOnly: false, logDir: 'x/y', limit: 5,
  });
  assert.equal(parseArgs(['--notes-only']).notesOnly, true);
  assert.throws(() => parseArgs(['--notes-only', '--log-dir', 'x']), (e) => e instanceof ExportError && /--notes-only/.test(e.message));
  assert.throws(() => parseArgs(['--log-dir', 'x', '--notes-only']), ExportError);
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

  assert.deepEqual(result, { filed: [3101, 3104, 3110], skipped: [], logged: [], failed: [] });
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
  const marks = d.rpc.calls.filter((c) => c[0] === 'filed');
  assert.deepEqual(d.rpc.calls.slice(0, 2), [['unfiled', DEFAULT_LIMIT], ['unlogged', DEFAULT_LIMIT]]);
  assert.deepEqual(marks[0], ['filed', 3101, { note_path: 'projects/bb2dash/decisions/inbox-3101.md', log_path: 'docs/inbox-decisions/2026-10-07.md', ingested: true }]);
  assert.deepEqual(marks[2][2].log_path, 'docs/inbox-decisions/2026-10-08.md');
  assert.ok(lines.includes('filed item 3101: projects/bb2dash/decisions/inbox-3101.md, docs/inbox-decisions/2026-10-07.md'));
  // No temporary file is left beside a note or a day file.
  assert.deepEqual(fs.readdirSync(dirs.logDir).sort(), ['2026-10-07.md', '2026-10-08.md']);
});

test('nothing to file: no file, no ingest, no mark', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, []);
  assert.deepEqual(await exportDecisions(d), { filed: [], skipped: [], logged: [], failed: [] });
  assert.deepEqual(lines, ['nothing to file']);
  assert.equal(runs.length, 0);
  assert.equal(fs.existsSync(dirs.logDir), false);
});

test('--dry-run names what it would file and writes nothing', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, [row(3101)], { options: { dryRun: true } });
  assert.deepEqual(await exportDecisions(d), { filed: [], skipped: [], logged: [], failed: [] });
  assert.deepEqual(lines, ['would file item 3101 (2026-10-07)']);
  assert.equal(runs.length, 0);
  assert.deepEqual(d.rpc.calls, [['unfiled', DEFAULT_LIMIT], ['unlogged', DEFAULT_LIMIT]]);
  assert.equal(fs.existsSync(path.join(dirs.vault, 'projects')), false);
});

test('a failed ingest still files the rows, marked ingested false; --no-ingest runs none', async (t) => {
  const failing = deps(t, [row(3101)], { ingestStatus: 1 });
  assert.deepEqual((await exportDecisions(failing.deps)).filed, [3101]);
  assert.equal(failing.deps.rpc.calls.find((c) => c[0] === 'filed')[2].ingested, false);
  assert.ok(failing.lines.some((l) => l.startsWith('ingest: failed (exit 1)')));

  const off = deps(t, [row(3102)], { options: { ingest: false } });
  assert.deepEqual((await exportDecisions(off.deps)).filed, [3102]);
  assert.equal(off.runs.length, 0);
  assert.equal(off.deps.rpc.calls.find((c) => c[0] === 'filed')[2].ingested, false);

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

// ---------------------------------------------------------------------------------------------
// Item 3 of brief 110: the notes-only mode, the unlogged pass, and the test-question rule.
// ---------------------------------------------------------------------------------------------

const NOTES_REL = 'projects/bb2dash/decisions';

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).map((f) => String(f).split(path.sep).join('/')).sort();
}

test('the rpc sends the four new functions their argument names, as the service role', async () => {
  const requests = [];
  const answers = { inbox_decisions_unlogged: '[]', inbox_decision_logged: 'true', inbox_decision_skipped: 'true', inbox_decision_filed: 'true' };
  const fetchImpl = async (url, init) => {
    requests.push({ fn: url.split('/').pop(), body: JSON.parse(init.body), key: init.headers.apikey });
    return new Response(answers[url.split('/').pop()], { status: 200 });
  };
  const rpc = createRpc({ supabaseUrl: 'https://p.supabase.co', serviceKey: KEY, fetchImpl });
  assert.deepEqual(await rpc.unlogged(7), []);
  assert.equal(await rpc.logged(5, 'docs/inbox-decisions/2026-10-07.md'), true);
  assert.equal(await rpc.skipped(6, SKIP_WHY), true);
  assert.equal(await rpc.filed(5, { note_path: 'n' }), true);
  assert.deepEqual(requests.map((r) => r.fn), ['inbox_decisions_unlogged', 'inbox_decision_logged', 'inbox_decision_skipped', 'inbox_decision_filed']);
  assert.deepEqual(requests[0].body, { p_limit: 7 });
  assert.deepEqual(requests[1].body, { p_id: 5, p_log_path: 'docs/inbox-decisions/2026-10-07.md' });
  assert.deepEqual(requests[2].body, { p_id: 6, p_why: SKIP_WHY });
  assert.deepEqual(requests[3].body, { p_id: 5, p_filed: { note_path: 'n' } });
  assert.ok(requests.every((r) => r.key === KEY));
  const odd = createRpc({ supabaseUrl: 'https://p.supabase.co', serviceKey: KEY, fetchImpl: async () => new Response('{"a":1}', { status: 200 }) });
  await assert.rejects(odd.unlogged(1), /not a list/);
});

test('a test question is told by all three parts: an accept/ ref, entity agent_request, no course', () => {
  assert.equal(isTestQuestion(testQuestion(1)), true);
  assert.equal(isTestQuestion(testQuestion(2, { course_id: 'IST.352' })), false);
  assert.equal(isTestQuestion(testQuestion(3, { entity: 'assignment' })), false);
  assert.equal(isTestQuestion(testQuestion(4, { ref: 'agent_request:2515' })), false);
  assert.equal(isTestQuestion(testQuestion(5, { ref: 'xaccept/run/confirm' })), false);
  assert.equal(isTestQuestion(testQuestion(6, { course_id: undefined })), true);
  assert.equal(isTestQuestion(row(7)), false);
  assert.equal(isTestQuestion(null), false);
});

test('--notes-only writes the note under the notes folder only, runs the ingest alone, and marks with the note path only', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, [row(3101), row(3104, { archived_at: '2026-10-08T15:00:00Z' })], {
    logDir: null,
    options: { notesOnly: true },
  });
  const result = await exportDecisions(d);

  assert.deepEqual(result, { filed: [3101, 3104], skipped: [], logged: [], failed: [] });
  // Everything written is a note under the notes folder; no day file, no log folder.
  assert.deepEqual(filesUnder(dirs.root), [
    'vault', 'vault/projects', 'vault/projects/bb2dash', `vault/${NOTES_REL}`,
    `vault/${NOTES_REL}/inbox-3101.md`, `vault/${NOTES_REL}/inbox-3104.md`,
  ].sort());
  assert.equal(fs.existsSync(dirs.logDir), false);
  // The only command this layer starts is the one ingest (the resolver is main's; see the main test below).
  assert.deepEqual(runs.map((r) => [r.command, ...r.args]), [[
    'uv', 'run', 'ingest', '--source', 'obsidian', '--path', dirs.vault,
    '--only', `${NOTES_REL}/inbox-3101.md`, '--only', `${NOTES_REL}/inbox-3104.md`,
  ]]);
  // The mark carries the note path and the ingest flag, and no log_path at all.
  assert.deepEqual(d.rpc.calls, [
    ['unfiled', DEFAULT_LIMIT],
    ['filed', 3101, { note_path: `${NOTES_REL}/inbox-3101.md`, ingested: true }],
    ['filed', 3104, { note_path: `${NOTES_REL}/inbox-3104.md`, ingested: true }],
  ]);
  assert.ok(d.rpc.calls.every((c) => c[0] !== 'filed' || !('log_path' in c[2])));
  assert.ok(lines.includes(`filed item 3101: ${NOTES_REL}/inbox-3101.md`));
});

test('--notes-only does not read the unlogged rows and writes no entry for them', async (t) => {
  const { deps: d, dirs } = deps(t, [], { logDir: null, options: { notesOnly: true }, extra: { unlogged: [row(3101)] } });
  assert.deepEqual(await exportDecisions(d), { filed: [], skipped: [], logged: [], failed: [] });
  assert.deepEqual(d.rpc.calls, [['unfiled', DEFAULT_LIMIT]]);
  assert.deepEqual(filesUnder(dirs.root), ['vault']);
});

test('a later default run writes the entry for a notes-only row and stamps the log once', async (t) => {
  // The row is already filed with a note (an earlier --notes-only run); the database lists it as unlogged.
  const { deps: d, dirs, lines, runs } = deps(t, [], { extra: { unlogged: [row(3101), row(3104, { archived_at: '2026-10-08T15:00:00Z' })] } });
  const result = await exportDecisions(d);

  assert.deepEqual(result, { filed: [], skipped: [], logged: [3101, 3104], failed: [] });
  assert.deepEqual(fs.readdirSync(dirs.logDir).sort(), ['2026-10-07.md', '2026-10-08.md']);
  assert.match(fs.readFileSync(path.join(dirs.logDir, '2026-10-07.md'), 'utf8'), /^## 3101 — /m);
  assert.deepEqual(d.rpc.calls.filter((c) => c[0] === 'logged'), [
    ['logged', 3101, 'docs/inbox-decisions/2026-10-07.md'],
    ['logged', 3104, 'docs/inbox-decisions/2026-10-08.md'],
  ]);
  assert.equal(runs.length, 0, 'no note is written, so nothing is ingested');
  assert.equal(fs.existsSync(path.join(dirs.vault, 'projects')), false);
  assert.ok(lines.includes('logged item 3101: docs/inbox-decisions/2026-10-07.md'));

  // A crash between the entry and the stamp: the next run finds the entry in the file, adds none, and stamps.
  const before = fs.readFileSync(path.join(dirs.logDir, '2026-10-07.md'), 'utf8');
  d.rpc = fakeRpc([], {}, { unlogged: [row(3101)] });
  assert.deepEqual((await exportDecisions(d)).logged, [3101]);
  assert.equal(fs.readFileSync(path.join(dirs.logDir, '2026-10-07.md'), 'utf8'), before);
  // A stamp the database refuses (already logged) is reported, not hidden.
  d.rpc = fakeRpc([], {}, { unlogged: [row(3101)], logged: { 3101: false } });
  const refused = await exportDecisions(d);
  assert.deepEqual(refused.logged, []);
  assert.equal(refused.failed[0].id, 3101);
});

test('the default run files unfiled rows in full first, then logs the unlogged ones', async (t) => {
  const { deps: d, dirs } = deps(t, [row(3110)], { extra: { unlogged: [row(3101)] } });
  const result = await exportDecisions(d);
  assert.deepEqual(result, { filed: [3110], skipped: [], logged: [3101], failed: [] });
  assert.deepEqual(d.rpc.calls.map((c) => c[0]), ['unfiled', 'unlogged', 'filed', 'logged']);
  assert.ok(d.rpc.calls[2][2].log_path.endsWith('.md'));
  assert.ok(fs.existsSync(path.join(dirs.vault, ...NOTES_REL.split('/'), 'inbox-3110.md')));
});

for (const notesOnly of [true, false]) {
  test(`a test question is marked skipped in ${notesOnly ? '--notes-only' : 'the default'} mode: no note, no entry, no ingest of it`, async (t) => {
    const { deps: d, dirs, runs } = deps(t, [testQuestion(3782), row(3101)], {
      logDir: notesOnly ? null : undefined,
      options: { notesOnly },
    });
    const result = await exportDecisions(d);

    assert.deepEqual(result.skipped, [3782]);
    assert.deepEqual(result.filed, [3101]);
    assert.deepEqual(d.rpc.calls.filter((c) => c[0] === 'skipped'), [['skipped', 3782, SKIP_WHY]]);
    assert.equal(d.rpc.calls.some((c) => c[0] === 'filed' && c[1] === 3782), false);
    const notes = path.join(dirs.vault, ...NOTES_REL.split('/'));
    assert.deepEqual(fs.readdirSync(notes), ['inbox-3101.md']);
    assert.equal(runs.length, 1);
    assert.ok(!runs[0].args.some((a) => a.includes('3782')));
    if (!notesOnly) assert.doesNotMatch(fs.readFileSync(path.join(dirs.logDir, '2026-10-07.md'), 'utf8'), /3782/);
  });
}

test('a test question alone writes no file at all, and a skip that throws is counted as not filed', async (t) => {
  const only = deps(t, [testQuestion(3782)]);
  assert.deepEqual(await exportDecisions(only.deps), { filed: [], skipped: [3782], logged: [], failed: [] });
  assert.deepEqual(filesUnder(only.dirs.root), ['vault']);
  assert.equal(only.runs.length, 0);

  const thrown = deps(t, [testQuestion(3783)], { extra: { skipped: { 3783: new Error('connection reset') } } });
  assert.equal((await exportDecisions(thrown.deps)).failed[0].id, 3783);
});

test('a row with an accept/ ref and a course is filed like any other', async (t) => {
  const withCourse = testQuestion(3790, { course_id: 'IST.352' });
  const otherEntity = testQuestion(3791, { entity: 'assignment' });
  const { deps: d, dirs } = deps(t, [withCourse, otherEntity]);
  const result = await exportDecisions(d);
  assert.deepEqual(result, { filed: [3790, 3791], skipped: [], logged: [], failed: [] });
  assert.equal(d.rpc.calls.some((c) => c[0] === 'skipped'), false);
  assert.ok(fs.existsSync(path.join(dirs.vault, ...NOTES_REL.split('/'), 'inbox-3790.md')));
});

test('--dry-run in the default mode names unfiled, unlogged and skipped rows and writes nothing', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, [row(3101), testQuestion(3782)], { options: { dryRun: true }, extra: { unlogged: [row(3104)] } });
  assert.deepEqual(await exportDecisions(d), { filed: [], skipped: [], logged: [], failed: [] });
  assert.deepEqual(lines, ['would file item 3101 (2026-10-07)', 'would skip item 3782 (an acceptance test question)', 'would log item 3104 (2026-10-07)']);
  assert.deepEqual(d.rpc.calls.map((c) => c[0]), ['unfiled', 'unlogged']);
  assert.equal(runs.length, 0);
  assert.deepEqual(filesUnder(dirs.root), ['vault']);
});

// main(): the whole run on fakes, to see every command it starts.

function mainWorld(t, { rows, unlogged = [], markResult = true }) {
  const dirs = tempDirs(t);
  const secrets = path.join(dirs.root, 'secrets');
  const harness = path.join(dirs.root, 'harness');
  fs.mkdirSync(secrets);
  fs.mkdirSync(harness);
  fs.writeFileSync(path.join(secrets, SERVICE_KEY_FILE), `${KEY}\n`);
  const runs = [];
  const fetches = [];
  const lines = [];
  const run = (command, args) => {
    runs.push([command, ...args]);
    if (args[0]?.endsWith('resolve-config.mjs')) {
      return { status: 0, stdout: JSON.stringify({ vault: dirs.vault, ingestProject: path.join(dirs.root, 'ingest'), realmCheck: { ok: true } }), stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  const fetchImpl = async (url, init) => {
    const fn = url.split('/').pop();
    fetches.push({ fn, body: JSON.parse(init.body) });
    if (fn === 'inbox_decisions_unfiled') return new Response(JSON.stringify(rows), { status: 200 });
    if (fn === 'inbox_decisions_unlogged') return new Response(JSON.stringify(unlogged), { status: 200 });
    return new Response(String(markResult), { status: 200 });
  };
  return { dirs, secrets, harness, runs, fetches, lines, run, fetchImpl, env: { SECRETS_DIR: secrets, HARNESS_DIR: harness }, log: (l) => lines.push(l) };
}

test('main --notes-only starts the resolver and the ingest and no other command, reads no unlogged row, and prints one result line', async (t) => {
  const w = mainWorld(t, { rows: [row(3101), testQuestion(3782)] });
  const code = await main(['--notes-only'], { env: w.env, log: w.log, run: w.run, fetchImpl: w.fetchImpl });
  assert.equal(code, 0);
  assert.deepEqual(w.runs, [
    [process.execPath, path.join(w.harness, 'hooks', 'resolve-config.mjs'), '--json', '--require-realm', 'projects'],
    ['uv', 'run', 'ingest', '--source', 'obsidian', '--path', w.dirs.vault, '--only', `${NOTES_REL}/inbox-3101.md`],
  ]);
  assert.deepEqual(w.fetches.map((f) => f.fn), ['inbox_decisions_unfiled', 'inbox_decision_skipped', 'inbox_decision_filed']);
  assert.deepEqual(w.fetches[1].body, { p_id: 3782, p_why: SKIP_WHY });
  assert.deepEqual(w.fetches[2].body, { p_id: 3101, p_filed: { note_path: `${NOTES_REL}/inbox-3101.md`, ingested: true } });
  assert.equal(w.lines.at(-1), 'inbox-decisions-result {"exit_code":0,"filed":1,"skipped":1,"not_filed":0}');
  assert.ok(w.lines.every((l) => !l.includes(KEY)), 'the service key is printed nowhere');
  assert.equal(fs.existsSync(w.dirs.logDir), false);
});

test('main --notes-only with --log-dir exits 2 and files nothing', async (t) => {
  const w = mainWorld(t, { rows: [row(3101)] });
  const code = await main(['--notes-only', '--log-dir', w.dirs.logDir], { env: w.env, log: w.log, run: w.run, fetchImpl: w.fetchImpl });
  assert.equal(code, 2);
  assert.deepEqual(w.runs, []);
  assert.deepEqual(w.fetches, []);
  assert.equal(fs.existsSync(w.dirs.logDir), false);
  assert.deepEqual(filesUnder(w.dirs.vault), []);
  assert.ok(w.lines.some((l) => l.includes('--notes-only')));
});

test('main reports a failure as exit 1 with the counts, and a configuration error as exit 2 with zeros', async (t) => {
  const w = mainWorld(t, { rows: [row(3101)], markResult: false });
  const code = await main(['--notes-only'], { env: w.env, log: w.log, run: w.run, fetchImpl: w.fetchImpl });
  assert.equal(code, 1);
  assert.equal(w.lines.at(-1), 'inbox-decisions-result {"exit_code":1,"filed":0,"skipped":0,"not_filed":1}');

  const lines = [];
  assert.equal(await main([], { env: {}, log: (l) => lines.push(l) }), 2);
  assert.equal(lines.at(-1), 'inbox-decisions-result {"exit_code":2,"filed":0,"skipped":0,"not_filed":0}');
});

// ---------------------------------------------------------------------------------------------
// Round 2 (brief 110): a refused skip files the row; a note that differs only in applied_at is rewritten.
// ---------------------------------------------------------------------------------------------

test('R5: a test-shaped row whose skip the database refuses is filed like any other in --notes-only: note and mark, not skipped, not failed', async (t) => {
  const { deps: d, dirs, runs } = deps(t, [testQuestion(3782), row(3101)], {
    logDir: null,
    options: { notesOnly: true },
    extra: { skipped: { 3782: false } },
  });
  const result = await exportDecisions(d);

  assert.deepEqual(result, { filed: [3782, 3101], skipped: [], logged: [], failed: [] });
  const notes = path.join(dirs.vault, ...NOTES_REL.split('/'));
  assert.deepEqual(fs.readdirSync(notes).sort(), ['inbox-3101.md', 'inbox-3782.md']);
  assert.deepEqual(d.rpc.calls.filter((c) => c[0] === 'skipped'), [['skipped', 3782, SKIP_WHY]]);
  assert.deepEqual(d.rpc.calls.find((c) => c[0] === 'filed' && c[1] === 3782), ['filed', 3782, { note_path: `${NOTES_REL}/inbox-3782.md`, ingested: true }]);
  assert.equal(fs.existsSync(dirs.logDir), false);
  assert.equal(runs.length, 1);
  assert.ok(runs[0].args.includes(`${NOTES_REL}/inbox-3782.md`));
});

test('R5: in the default mode a refused skip gets the note, the day-file entry and the full mark', async (t) => {
  const { deps: d, dirs } = deps(t, [testQuestion(3782)], { extra: { skipped: { 3782: false } } });
  const result = await exportDecisions(d);

  assert.deepEqual(result, { filed: [3782], skipped: [], logged: [], failed: [] });
  assert.ok(fs.existsSync(path.join(dirs.vault, ...NOTES_REL.split('/'), 'inbox-3782.md')));
  assert.match(fs.readFileSync(path.join(dirs.logDir, '2026-10-07.md'), 'utf8'), /^## 3782 — /m);
  assert.deepEqual(d.rpc.calls.find((c) => c[0] === 'filed')[2], {
    note_path: `${NOTES_REL}/inbox-3782.md`,
    log_path: 'docs/inbox-decisions/2026-10-07.md',
    ingested: true,
  });
});

test('R5: a test-shaped row whose skip is accepted still writes no file', async (t) => {
  const { deps: d, dirs, runs } = deps(t, [testQuestion(3782)], { logDir: null, options: { notesOnly: true } });
  assert.deepEqual(await exportDecisions(d), { filed: [], skipped: [3782], logged: [], failed: [] });
  assert.deepEqual(filesUnder(dirs.root), ['vault']);
  assert.equal(runs.length, 0);
});

test('an existing note that differs only in its applied_at line is written again and the row is marked', async (t) => {
  // The first run wrote the note while applied_at was null; the mark failed; a fold then stamped the row.
  const first = deps(t, [row(3101)], { marks: { 3101: new Error('connection reset') } });
  assert.equal((await exportDecisions(first.deps)).failed[0].id, 3101);
  const noteFile = path.join(first.dirs.vault, ...NOTES_REL.split('/'), 'inbox-3101.md');
  const old = fs.readFileSync(noteFile, 'utf8');
  assert.match(old, /^applied_at: null$/m);

  first.deps.rpc = fakeRpc([row(3101, { applied_at: '2026-10-08T03:30:00Z' })]);
  const result = await exportDecisions(first.deps);
  assert.deepEqual(result, { filed: [3101], skipped: [], logged: [], failed: [] });
  const rewritten = fs.readFileSync(noteFile, 'utf8');
  assert.notEqual(rewritten, old);
  assert.match(rewritten, /^applied_at: .*2026-10-08/m);
  assert.deepEqual(fs.readdirSync(path.dirname(noteFile)), ['inbox-3101.md'], 'no temporary file is left');
});

test('a note that differs anywhere but applied_at is still refused, and nothing is overwritten', async (t) => {
  const { deps: d, dirs, lines } = deps(t, [row(3101, { applied_at: '2026-10-08T03:30:00Z' })]);
  const noteFile = path.join(dirs.vault, ...NOTES_REL.split('/'), 'inbox-3101.md');
  fs.mkdirSync(path.dirname(noteFile), { recursive: true });
  // The note a fresh run would write, with its applied_at line left stale AND one other line changed by hand.
  const edited = (await (async () => {
    const probe = deps(t, [row(3101, { applied_at: '2026-10-08T03:30:00Z' })]);
    await exportDecisions(probe.deps);
    return fs.readFileSync(path.join(probe.dirs.vault, ...NOTES_REL.split('/'), 'inbox-3101.md'), 'utf8');
  })()).replace(/^applied_at: .*$/m, 'applied_at: null').replace('Question 3101?', 'Question 3101, as Stack edited it?');
  fs.writeFileSync(noteFile, edited);

  const result = await exportDecisions(d);
  assert.deepEqual(result.filed, []);
  assert.equal(result.failed[0].id, 3101);
  assert.equal(fs.readFileSync(noteFile, 'utf8'), edited);
  assert.ok(lines.some((l) => l.startsWith('not filed item 3101: a different note already exists')));
  assert.equal(d.rpc.calls.some((c) => c[0] === 'filed'), false);
});

// ---------------------------------------------------------------------------------------------
// Round 3 (brief 110): every unlogged row gets its entry; a refused skip is told apart from a row
// another run took; timeouts say so; one copy of runCommand and writeAtomic.
// ---------------------------------------------------------------------------------------------

test('R5: a test-shaped row filed by --notes-only after a refused skip gets its entry and its log stamp at the next default run', async (t) => {
  // First run (notes-only): the skip is refused, so the row is filed with a note and no log path.
  const first = deps(t, [testQuestion(3782)], { logDir: null, options: { notesOnly: true }, extra: { skipped: { 3782: false } } });
  assert.deepEqual((await exportDecisions(first.deps)).filed, [3782]);
  assert.equal(fs.existsSync(first.dirs.logDir), false);

  // Next run (default): the database lists it as unlogged. It gets the entry and the stamp.
  const next = deps(t, [], { extra: { unlogged: [testQuestion(3782)] } });
  const result = await exportDecisions(next.deps);
  assert.deepEqual(result, { filed: [], skipped: [], logged: [3782], failed: [] });
  assert.match(fs.readFileSync(path.join(next.dirs.logDir, '2026-10-07.md'), 'utf8'), /^## 3782 — /m);
  assert.deepEqual(next.deps.rpc.calls.filter((c) => c[0] === 'logged'), [['logged', 3782, 'docs/inbox-decisions/2026-10-07.md']]);
});

test('a refused skip whose row is gone from the re-read list was taken by another run: not skipped, not failed, no file', async (t) => {
  const { deps: d, dirs, lines, runs } = deps(t, [testQuestion(3782)], { extra: { skipped: { 3782: false }, reread: [] } });
  const result = await exportDecisions(d);
  assert.deepEqual(result, { filed: [], skipped: [], logged: [], failed: [] });
  assert.deepEqual(d.rpc.calls.map((c) => c[0]), ['unfiled', 'unlogged', 'skipped', 'unfiled']);
  assert.deepEqual(d.rpc.calls[3], ['unfiled', DEFAULT_LIMIT], 'the same read, the same limit');
  assert.deepEqual(filesUnder(dirs.root), ['vault']);
  assert.equal(runs.length, 0);
  assert.equal(lines.filter((l) => l.includes('another run')).length, 1);
  assert.ok(!lines.some((l) => l.startsWith('not filed')));
});

test('a refused skip whose row is still on the re-read list has a logged write and is filed like any other', async (t) => {
  const { deps: d, dirs } = deps(t, [testQuestion(3782)], { extra: { skipped: { 3782: false }, reread: [testQuestion(3782)] } });
  assert.deepEqual(await exportDecisions(d), { filed: [3782], skipped: [], logged: [], failed: [] });
  assert.ok(fs.existsSync(path.join(dirs.vault, ...NOTES_REL.split('/'), 'inbox-3782.md')));
});

test('a re-read that throws counts the refused row as not filed and writes nothing for it', async (t) => {
  const { deps: d, dirs } = deps(t, [testQuestion(3782)], { logDir: null, options: { notesOnly: true }, extra: { skipped: { 3782: false }, reread: new Error('connection reset') } });
  const result = await exportDecisions(d);
  assert.deepEqual(result.filed, []);
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.failed.map((f) => f.id), [3782]);
  assert.deepEqual(filesUnder(dirs.root), ['vault']);
  assert.equal(d.rpc.calls.some((c) => c[0] === 'filed'), false);
});

test('runCommand puts a spawn error in stderr (a timeout says ETIMEDOUT), and hands env and timeout to the spawn', () => {
  const seen = [];
  const timedOut = (command, args, options) => {
    seen.push({ command, args, options });
    return { status: null, stdout: '', stderr: '', error: { message: 'spawnSync node ETIMEDOUT' } };
  };
  const answer = runCommand('node', ['x.js'], 'cwd', { env: { A: '1' }, timeout: 5000, spawn: timedOut });
  assert.equal(answer.status, 1);
  assert.match(answer.stderr, /ETIMEDOUT/);
  assert.equal(seen[0].options.cwd, 'cwd');
  assert.deepEqual(seen[0].options.env, { A: '1' });
  assert.equal(seen[0].options.timeout, 5000);
  assert.equal(seen[0].options.shell, false);
  // A real stderr is kept, with the error after it.
  const both = runCommand('node', [], 'cwd', { spawn: () => ({ status: 1, stdout: '', stderr: 'boom', error: { message: 'E_X' } }) });
  assert.equal(both.stderr, 'boom\nE_X');
  // No error: stderr as given.
  assert.equal(runCommand('node', [], 'cwd', { spawn: () => ({ status: 0, stdout: 'o', stderr: '' }) }).stderr, '');
  // The real thing, once: the env reaches the child.
  const real = runCommand(process.execPath, ['-e', 'process.stdout.write(process.env.RUNCOMMAND_TEST ?? "")'], process.cwd(), { env: { ...process.env, RUNCOMMAND_TEST: 'ok' } });
  assert.equal(real.stdout, 'ok');
});

test('writeAtomic creates the folder, replaces a file whole and leaves no temporary file', (t) => {
  const { root } = tempDirs(t);
  const file = path.join(root, 'a', 'b', 'state.json');
  writeAtomic(fs, file, 'one');
  writeAtomic(fs, file, 'two');
  assert.equal(fs.readFileSync(file, 'utf8'), 'two');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['state.json']);
});

// ---------------------------------------------------------------------------------------------
// A database that cannot be reached is told apart from every other failure (the scheduled run
// starts five minutes after a logon and after a wake, sometimes before the network is up).
// ---------------------------------------------------------------------------------------------

test('a request that does not reach Supabase is an UnreachableError; one that is answered with an error is not', async () => {
  const down = createRpc({ supabaseUrl: 'https://p.supabase.co', serviceKey: KEY, fetchImpl: async () => { throw new TypeError(`fetch failed ${KEY}`); } });
  await assert.rejects(down.unfiled(5), (error) => error instanceof UnreachableError && /did not reach Supabase/.test(error.message) && !error.message.includes(KEY));
  const refused = createRpc({ supabaseUrl: 'https://p.supabase.co', serviceKey: KEY, fetchImpl: async () => new Response('nope', { status: 500 }) });
  await assert.rejects(refused.unfiled(5), (error) => !(error instanceof UnreachableError) && /HTTP 500/.test(error.message));
});

test('main exits 3 when the first read does not reach Supabase: nothing is written, and the result line says so', async (t) => {
  const w = mainWorld(t, { rows: [row(3101)] });
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const code = await main(['--notes-only'], { env: w.env, log: w.log, run: w.run, fetchImpl });
  assert.equal(code, EXIT_UNREACHABLE);
  assert.equal(code, 3);
  assert.equal(w.lines.at(-1), 'inbox-decisions-result {"exit_code":3,"filed":0,"skipped":0,"not_filed":0}');
  assert.ok(w.lines.some((l) => l.includes('did not reach Supabase')));
  assert.deepEqual(filesUnder(w.dirs.vault), []);
});

test('main still exits 1 when Supabase answers the first read with an error', async (t) => {
  const w = mainWorld(t, { rows: [row(3101)] });
  const code = await main(['--notes-only'], { env: w.env, log: w.log, run: w.run, fetchImpl: async () => new Response('nope', { status: 500 }) });
  assert.equal(code, 1);
});
test('main exits 1, not 3, when Supabase was reached first and a later read was not: exit 3 means nothing was read or written', async (t) => {
  const w = mainWorld(t, { rows: [row(3101)] });
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/inbox_decisions_unlogged')) throw new TypeError('fetch failed');
    return w.fetchImpl(url, init);
  };
  const code = await main([], { env: w.env, log: w.log, run: w.run, fetchImpl });
  assert.equal(code, 1);
  assert.deepEqual(w.fetches.map((f) => f.fn), ['inbox_decisions_unfiled'], 'the first read was answered before the one that failed');
  assert.equal(w.lines.at(-1), 'inbox-decisions-result {"exit_code":1,"filed":0,"skipped":0,"not_filed":0}');
});
