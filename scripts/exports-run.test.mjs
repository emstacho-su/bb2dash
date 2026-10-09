// The scheduled runner on fakes (Phase 23 follow-ups, item 3): a temporary checkout with a
// `.git/HEAD`, a temporary state folder, and a recorded command runner. Nothing starts a real
// command, and nothing is written outside the temporary folders (never the real home folder).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  EXPORTER_KEY,
  LOG_FILE,
  STATE_FILE,
  STATE_SCHEMA,
  checkoutIsOnMain,
  main,
  parseArgs,
  parseResultLine,
  scrub,
} from './exports-run.mjs';

const KEY = 'sb_secret_TESTONLY_not_a_real_key';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl';
const STATE_KEYS = ['schema', 'started_at', 'ended_at', 'exit_code', 'reason', 'exporters'];
const EXPORTER_STATE_KEYS = ['exit_code', 'filed', 'skipped', 'not_filed'];
const HEAD_MAIN = 'ref: refs/heads/main\n';

function world(t, { head = HEAD_MAIN, dotGit = 'dir' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exports-run-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, 'checkout');
  const stateDir = path.join(root, 'state', '.bb2dash-exports');
  const secrets = path.join(root, 'secrets');
  const harness = path.join(root, 'harness');
  fs.mkdirSync(repoRoot);
  if (dotGit === 'dir') {
    fs.mkdirSync(path.join(repoRoot, '.git'));
    if (head !== null) fs.writeFileSync(path.join(repoRoot, '.git', 'HEAD'), head);
  } else if (dotGit === 'file') {
    fs.writeFileSync(path.join(repoRoot, '.git'), `gitdir: ${path.join(root, 'main-checkout', '.git', 'worktrees', 'x')}\n`);
  }
  const runs = [];
  let tick = 0;
  const lines = [];
  return {
    root, repoRoot, stateDir, secrets, harness, runs, lines,
    argv: ['--secrets-dir', secrets, '--harness-dir', harness],
    deps(exporter) {
      return {
        repoRoot,
        stateDir,
        log: (l) => lines.push(l),
        now: () => new Date(Date.UTC(2026, 9, 9, 12, 0, tick++)),
        run: (command, args, options) => {
          runs.push({ command, args, options });
          return typeof exporter === 'function' ? exporter({ command, args, options }) : exporter;
        },
      };
    },
    state: () => JSON.parse(fs.readFileSync(path.join(stateDir, STATE_FILE), 'utf8')),
    logText: () => fs.readFileSync(path.join(stateDir, LOG_FILE), 'utf8'),
  };
}

const result = (json) => `inbox-decisions-export: x\ninbox-decisions-result ${JSON.stringify(json)}\n`;
const exporterOk = (status, json) => ({ status, stdout: result(json), stderr: '' });

function assertShape(state) {
  assert.deepEqual(Object.keys(state), STATE_KEYS);
  assert.equal(state.schema, 1);
  assert.equal(state.schema, STATE_SCHEMA);
  assert.deepEqual(Object.keys(state.exporters), ['inbox-decisions']);
  assert.deepEqual(Object.keys(state.exporters[EXPORTER_KEY]), EXPORTER_STATE_KEYS);
  assert.match(state.started_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.match(state.ended_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.ok([0, 1, 2].includes(state.exit_code));
  assert.ok([null, 'not_main', 'config', 'error'].includes(state.reason));
  for (const k of EXPORTER_STATE_KEYS) assert.equal(typeof state.exporters[EXPORTER_KEY][k], 'number');
}

test('arguments: both folders are required, and anything else is refused', () => {
  assert.deepEqual(parseArgs(['--secrets-dir', 's', '--harness-dir', 'h']), { secretsDir: 's', harnessDir: 'h' });
  for (const bad of [[], ['--secrets-dir', 's'], ['--harness-dir', 'h'], ['--secrets-dir', '--harness-dir', 'h'], ['--secrets-dir', 's', '--harness-dir', 'h', '--now'], ['x']]) {
    assert.throws(() => parseArgs(bad), /usage/, JSON.stringify(bad));
  }
});

test('the guard reads .git/HEAD as a file and wants ref: refs/heads/main; a .git file, a branch, a hash and no .git all fail', (t) => {
  const check = (opts) => checkoutIsOnMain(world(t, opts).repoRoot);
  assert.equal(check({}), true);
  assert.equal(check({ head: 'ref: refs/heads/main' }), true);
  assert.equal(check({ head: 'ref: refs/heads/fix/phase23-followups\n' }), false);
  assert.equal(check({ head: 'ref: refs/heads/main-old\n' }), false);
  assert.equal(check({ head: '0123456789abcdef0123456789abcdef01234567\n' }), false);
  assert.equal(check({ head: null }), false);
  assert.equal(check({ dotGit: 'file' }), false);
  assert.equal(check({ dotGit: 'none' }), false);
});

test('a clean run: exit 0, and the state file holds exactly the fixed keys', async (t) => {
  const w = world(t);
  const code = await main(w.argv, w.deps(exporterOk(0, { exit_code: 0, filed: 16, skipped: 1, not_filed: 0 })));
  assert.equal(code, 0);
  const state = w.state();
  assertShape(state);
  assert.deepEqual(state, {
    schema: 1,
    started_at: '2026-10-09T12:00:00.000Z',
    ended_at: '2026-10-09T12:00:01.000Z',
    exit_code: 0,
    reason: null,
    exporters: { 'inbox-decisions': { exit_code: 0, filed: 16, skipped: 1, not_filed: 0 } },
  });
});

test('a failed run: the exporter exits 1 with rows not filed; the state says exit 1, reason error, and the counts', async (t) => {
  const w = world(t);
  const code = await main(w.argv, w.deps(exporterOk(1, { exit_code: 1, filed: 3, skipped: 0, not_filed: 2 })));
  assert.equal(code, 1);
  const state = w.state();
  assertShape(state);
  assert.equal(state.exit_code, 1);
  assert.equal(state.reason, 'error');
  assert.deepEqual(state.exporters[EXPORTER_KEY], { exit_code: 1, filed: 3, skipped: 0, not_filed: 2 });
});

test('a thrown error: exit 1, reason error, the state is still written, and no message is stored in it', async (t) => {
  const w = world(t);
  const code = await main(w.argv, w.deps(() => {
    throw new Error(`spawn exploded for ${w.secrets} with ${KEY}`);
  }));
  assert.equal(code, 1);
  const state = w.state();
  assertShape(state);
  assert.equal(state.exit_code, 1);
  assert.equal(state.reason, 'error');
  const raw = fs.readFileSync(path.join(w.stateDir, STATE_FILE), 'utf8');
  assert.ok(!raw.includes('exploded') && !raw.includes(KEY) && !raw.includes(w.secrets));
  // The log may name the error, but never the key.
  assert.match(w.logText(), /exploded/);
  assert.ok(!w.logText().includes(KEY));
});

test('a checkout that is not on main exits 2 with reason not_main, starts no command, and still writes the state', async (t) => {
  for (const opts of [{ head: 'ref: refs/heads/fix/x\n' }, { dotGit: 'file' }, { dotGit: 'none' }]) {
    const w = world(t, opts);
    const code = await main(w.argv, w.deps(exporterOk(0, { exit_code: 0, filed: 1, skipped: 0, not_filed: 0 })));
    assert.equal(code, 2, JSON.stringify(opts));
    assert.deepEqual(w.runs, [], 'nothing is filed');
    const state = w.state();
    assertShape(state);
    assert.equal(state.exit_code, 2);
    assert.equal(state.reason, 'not_main');
    assert.deepEqual(state.exporters[EXPORTER_KEY], { exit_code: 2, filed: 0, skipped: 0, not_filed: 0 });
  }
});

test('missing or odd arguments exit 2 with reason config, start no command, and still write the state', async (t) => {
  const w = world(t);
  assert.equal(await main([], w.deps(exporterOk(0, {}))), 2);
  assert.deepEqual(w.runs, []);
  const state = w.state();
  assertShape(state);
  assert.equal(state.exit_code, 2);
  assert.equal(state.reason, 'config');
});

test('an exporter that exits 2 (its configuration) is exit 2, reason config, with its own counts', async (t) => {
  const w = world(t);
  const code = await main(w.argv, w.deps(exporterOk(2, { exit_code: 2, filed: 0, skipped: 0, not_filed: 0 })));
  assert.equal(code, 2);
  const state = w.state();
  assertShape(state);
  assert.equal(state.reason, 'config');
  assert.equal(state.exporters[EXPORTER_KEY].exit_code, 2);
});

test('an exporter that is killed, or says nothing, or exits 0 without its result line, is exit 1 with reason error', async (t) => {
  for (const answer of [{ status: null, stdout: '', stderr: '' }, { status: 3, stdout: 'whatever', stderr: '' }, { status: 0, stdout: 'no result line here\n', stderr: '' }]) {
    const w = world(t);
    assert.equal(await main(w.argv, w.deps(answer)), 1, JSON.stringify(answer));
    const state = w.state();
    assertShape(state);
    assert.equal(state.exit_code, 1);
    assert.equal(state.reason, 'error');
  }
});

test('the only command the runner starts is the exporter, with --notes-only and the two folders in its environment', async (t) => {
  const w = world(t);
  await main(w.argv, w.deps(exporterOk(0, { exit_code: 0, filed: 0, skipped: 0, not_filed: 0 })));
  assert.equal(w.runs.length, 1);
  const exporter = path.join(path.resolve(import.meta.dirname), 'inbox-decisions-export.mjs');
  // The runner is told its checkout by `repoRoot`; the exporter is always the sibling script of the runner itself.
  assert.deepEqual([w.runs[0].command, ...w.runs[0].args], [process.execPath, exporter, '--notes-only']);
  assert.equal(w.runs[0].options.cwd, w.repoRoot);
  assert.equal(w.runs[0].options.env.SECRETS_DIR, w.secrets);
  assert.equal(w.runs[0].options.env.HARNESS_DIR, w.harness);

  // And the source starts one command only: no git, no gh, no docker.
  const source = fs.readFileSync(path.join(import.meta.dirname, 'exports-run.mjs'), 'utf8');
  assert.equal((source.match(/spawnSync\(/g) ?? []).length, 1);
  assert.equal((source.match(/node:child_process/g) ?? []).length, 1);
  assert.doesNotMatch(source, /['"`](git|gh|docker|docker-compose|uv)['"`]/);
});

test('the key never reaches the state file or the log, and no path is stored in the state', async (t) => {
  const w = world(t);
  const noisy = {
    status: 1,
    stdout: `fetch failed with ${KEY}\nheader eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl\n${result({ exit_code: 1, filed: 0, skipped: 0, not_filed: 1 })}`,
    stderr: `stderr also has ${KEY}`,
  };
  await main(w.argv, w.deps(noisy));
  const raw = fs.readFileSync(path.join(w.stateDir, STATE_FILE), 'utf8');
  for (const text of [raw, w.logText(), w.lines.join('\n')]) {
    assert.ok(!text.includes(KEY));
    assert.ok(!text.includes(JWT));
  }
  for (const p of [w.root, w.secrets, w.harness, w.repoRoot]) assert.ok(!raw.includes(p));
  assert.match(w.logText(), /not filed|fetch failed/);
});

test('scrub removes the key forms; parseResultLine takes the last result line and refuses a malformed one', () => {
  assert.equal(scrub(`a ${KEY} b ${JWT} c`), 'a <redacted> b <redacted> c');
  const good = { exit_code: 0, filed: 1, skipped: 2, not_filed: 3 };
  assert.deepEqual(parseResultLine(`x\ninbox-decisions-result {"exit_code":9,"filed":0,"skipped":0,"not_filed":0}\n${result(good)}`), { filed: 1, skipped: 2, notFiled: 3 });
  assert.equal(parseResultLine('nothing'), null);
  assert.equal(parseResultLine('inbox-decisions-result {nope'), null);
  assert.equal(parseResultLine('inbox-decisions-result {"filed":-1,"skipped":0,"not_filed":0}'), null);
  assert.equal(parseResultLine('inbox-decisions-result {"filed":"2","skipped":0,"not_filed":0}'), null);
});

test('the state folder is created, the state is replaced whole each run, and the log rolls', async (t) => {
  const w = world(t);
  const ok = exporterOk(0, { exit_code: 0, filed: 1, skipped: 0, not_filed: 0 });
  await main(w.argv, { ...w.deps(ok), maxLogBytes: 400 });
  const first = w.state();
  await main(w.argv, { ...w.deps(exporterOk(0, { exit_code: 0, filed: 0, skipped: 0, not_filed: 0 })), maxLogBytes: 400 });
  assert.equal(first.exporters[EXPORTER_KEY].filed, 1);
  assert.equal(w.state().exporters[EXPORTER_KEY].filed, 0);
  // Only the state and the log (and its one rolled copy) are there: no temporary file is left.
  for (let i = 0; i < 6; i += 1) await main(w.argv, { ...w.deps(ok), maxLogBytes: 400 });
  assert.deepEqual(fs.readdirSync(w.stateDir).sort(), [LOG_FILE, `${LOG_FILE}.1`, STATE_FILE].sort());
  assert.ok(fs.statSync(path.join(w.stateDir, LOG_FILE)).size < 4000);
});

test('a state folder that cannot be written is exit 1 with one line, never a throw', async (t) => {
  const w = world(t);
  fs.mkdirSync(path.dirname(w.stateDir), { recursive: true });
  fs.writeFileSync(w.stateDir, 'a file where the folder should be');
  const code = await main(w.argv, w.deps(exporterOk(0, { exit_code: 0, filed: 0, skipped: 0, not_filed: 0 })));
  assert.equal(code, 1);
  assert.ok(w.lines.some((l) => l.includes('could not write')));
});
