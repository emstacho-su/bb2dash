// bb2dash :: scripts/accept-proofs-cli.test.mjs
// The proofs script as a process (acceptance/README.md, "The proofs script"): started by any path
// it runs, it always prints its one JSON line, and it never ends with exit 0 without a verdict.
//   node --test scripts/accept-proofs-cli.test.mjs
//
// The script is started here with a command line it refuses (`21` alone), so it ends before it
// reads a pack, a credential or a database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as proofs from './accept-proofs.mjs';
import { REPO } from './accept-proofs-kit.mjs';

const { EXIT } = proofs;
const SCRIPT = path.join(REPO, 'scripts', 'accept-proofs.mjs');
const USAGE_LINE = { name: null, pass: false, detail: { error: 'usage' } };
const NO_VERDICT_LINE = { name: null, pass: false, detail: { error: 'internal_error' } };

/** A folder that is another way to `scripts/`: a junction on Windows, a symlink elsewhere. Removed by the caller. */
function linkToScripts() {
  const holder = fs.mkdtempSync(path.join(os.tmpdir(), 'bb2dash-accept-proofs-'));
  const link = path.join(holder, 'scripts-by-another-way');
  fs.symlinkSync(path.join(REPO, 'scripts'), link, 'junction');
  return { holder, link };
}

/** Starts the script as the host does, with a command line it refuses, and returns how it ended. */
function start(scriptPath, cwd = REPO) {
  const ended = spawnSync(process.execPath, [scriptPath, '21'], { cwd, encoding: 'utf8', timeout: 60_000 });
  const lines = String(ended.stdout).split(/\r?\n/).filter((line) => line !== '');
  return { status: ended.status, lines: lines.map((line) => JSON.parse(line)), stderr: String(ended.stderr) };
}

test('started by its own path, through a link, or by a relative path, the script runs and prints its one line', () => {
  const { holder, link } = linkToScripts();
  try {
    const ways = {
      'its own path': [SCRIPT],
      'forward slashes, as the host wrapper writes it': [SCRIPT.replace(/\\/g, '/')],
      'a relative path': ['accept-proofs.mjs', path.join(REPO, 'scripts')],
      // The review's case: node gives the module its real path, and the command line keeps the link's.
      'a junction or symlink to the folder': [path.join(link, 'accept-proofs.mjs')],
    };
    // On Windows a drive letter is the same drive in either case.
    if (process.platform === 'win32') ways['another spelling of the drive'] = [SCRIPT[0].toLowerCase() + SCRIPT.slice(1)];
    for (const [way, [scriptPath, cwd]] of Object.entries(ways)) {
      const ended = start(scriptPath, cwd);
      // Not 0 with nothing printed: the usage error is said, in the one line and by the exit code.
      assert.deepEqual({ status: ended.status, lines: ended.lines }, { status: EXIT.error, lines: [USAGE_LINE] }, way);
      assert.match(ended.stderr, /usage: node scripts\/accept-proofs\.mjs/, way);
    }
  } finally {
    fs.rmSync(holder, { recursive: true, force: true });
  }
});

test('whether the file is what node was started with is asked by real path where node does not say', () => {
  const { holder, link } = linkToScripts();
  try {
    const moduleUrl = pathToFileURL(SCRIPT).href;
    // `main: null` is a node that does not say (before 22.18 and 24.2 there is no `import.meta.main`).
    const asked = (argv1, main = null) => proofs.isEntryPoint({ main, argv1, moduleUrl });
    assert.equal(asked(SCRIPT), true);
    assert.equal(asked(path.join(link, 'accept-proofs.mjs')), true);
    assert.equal(asked(path.join(REPO, 'scripts', 'db-test.mjs')), false);
    assert.equal(asked(path.join(holder, 'no-such-file.mjs')), false);
    assert.equal(asked(undefined), false);
    // Where node says it (`import.meta.main`), its word is taken.
    assert.equal(asked(path.join(REPO, 'scripts', 'db-test.mjs'), true), true);
    assert.equal(asked(SCRIPT, false), false);
  } finally {
    fs.rmSync(holder, { recursive: true, force: true });
  }
});

/** A stand-in for `process`: what is written, the exit code, and an `exit` to emit. */
function fakeProcess() {
  const proc = new EventEmitter();
  proc.written = [];
  proc.said = [];
  proc.stdout = { write: (text) => proc.written.push(text) };
  proc.stderr = { write: (text) => proc.said.push(text) };
  proc.exitCode = undefined;
  return proc;
}

const linesOf = (texts) => texts.join('').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));

test('until a verdict is printed the exit code is "no verdict", and a process that ends early still prints one line', async () => {
  // A run that never comes back: the event loop empties and node ends the process by itself.
  const stuck = fakeProcess();
  const late = [];
  proofs.startCli(['21', 'turn'], { proc: stuck, runCli: () => new Promise(() => {}), writeNow: (text) => late.push(text) });
  assert.equal(stuck.exitCode, EXIT.error);
  stuck.emit('exit');
  assert.deepEqual([linesOf(stuck.written), linesOf(late)], [[], [NO_VERDICT_LINE]]);

  // A run that says "pass" and printed nothing is not a pass.
  const silent = fakeProcess();
  const lateSilent = [];
  await proofs.startCli([], { proc: silent, runCli: async () => EXIT.pass, writeNow: (text) => lateSilent.push(text) });
  assert.equal(silent.exitCode, EXIT.error);
  silent.emit('exit');
  assert.deepEqual(linesOf(lateSilent), [NO_VERDICT_LINE]);

  // A run that throws: one line, exit 2, and why on stderr.
  const thrown = fakeProcess();
  const lateThrown = [];
  await proofs.startCli([], { proc: thrown, runCli: async () => { throw new Error('the driver fell over\n    at somewhere'); }, writeNow: (text) => lateThrown.push(text) });
  thrown.emit('exit');
  assert.deepEqual([thrown.exitCode, linesOf(thrown.written), lateThrown], [EXIT.error, [NO_VERDICT_LINE], []]);
  assert.deepEqual(thrown.said, ['accept-proofs: the driver fell over\n']);
});

test('a run that printed its line ends with its own exit code, and nothing is added at the end', async () => {
  for (const code of [EXIT.pass, EXIT.fail, EXIT.blocked, EXIT.error]) {
    const proc = fakeProcess();
    const late = [];
    const line = JSON.stringify({ name: 'turn', pass: code === EXIT.pass, detail: {} });
    await proofs.startCli(['21', 'turn'], { proc, runCli: async (argv, { out }) => { out(line); return code; }, writeNow: (text) => late.push(text) });
    proc.emit('exit');
    assert.deepEqual([proc.exitCode, proc.written, late], [code, [`${line}\n`], []], String(code));
  }
  // A second line is never printed, whatever a run does.
  const twice = fakeProcess();
  await proofs.startCli([], { proc: twice, runCli: async (argv, { out }) => { out('{"first":true}'); out('{"second":true}'); return EXIT.fail; }, writeNow: () => {} });
  assert.deepEqual(twice.written, ['{"first":true}\n']);
});
