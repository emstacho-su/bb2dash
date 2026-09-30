// bb2dash :: scripts/sync-on-sonnet.test.mjs
// The bb-sync skill's Step -1 relaunch (Stack, 2026-09-30): when a sync session is not on Sonnet,
// the skill runs this script, which opens a new Windows Terminal in the repo running
// `claude --model sonnet '/bb-sync <id>'`, and stops. A skill's own `model:` frontmatter is not
// applied in auto mode, so the launch flag is the one reliable way onto Sonnet. Spawn is injected;
// nothing here opens a real terminal. Run: node --test scripts/sync-on-sonnet.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SYNC_MODEL, buildRelaunch, isValidRequestId, main } from './sync-on-sonnet.mjs';

const REPO = 'C:\\Users\\stack\\projects\\bb2dash';

test('the model is sonnet, the same value the desktop and web commands pass', () => {
  assert.equal(SYNC_MODEL, 'sonnet');
});

test('request ids: positive integers only', () => {
  for (const ok of ['1', '389', '1234567890']) assert.equal(isValidRequestId(ok), true, ok);
  for (const bad of ['', '0', '-1', '3.5', '389;calc', "389' ; calc", '12345678901', 'abc', ' 389']) {
    assert.equal(isValidRequestId(bad), false, bad);
  }
});

test('builds wt.exe argv: the repo dir, a titled tab, PowerShell running claude on sonnet', () => {
  const { file, args } = buildRelaunch('389', REPO);
  assert.equal(file, 'wt.exe');
  assert.deepEqual(args, [
    '-d',
    REPO,
    '--title',
    'bb-sync 389',
    'powershell.exe',
    '-NoExit',
    '-NoLogo',
    '-Command',
    "claude --model sonnet '/bb-sync 389'",
  ]);
});

test('refuses a bad id before building anything', () => {
  assert.throws(() => buildRelaunch("389'; calc", REPO), /request id/);
});

test('main spawns detached with no shell and exits 0', () => {
  const calls = [];
  const out = [];
  const code = main(['389'], {
    repoRoot: REPO,
    spawn: (file, args, opts) => {
      calls.push({ file, args, opts });
      return { unref() {} };
    },
    log: (line) => out.push(line),
  });
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, 'wt.exe');
  assert.equal(calls[0].opts.detached, true);
  assert.notEqual(calls[0].opts.shell, true);
  assert.match(out.join('\n'), /bb-sync 389.*sonnet/);
});

test('main exits 2 on a missing or bad id and spawns nothing', () => {
  let spawned = 0;
  const deps = { repoRoot: REPO, spawn: () => ((spawned += 1), { unref() {} }), log: () => {} };
  assert.equal(main([], deps), 2);
  assert.equal(main(['x'], deps), 2);
  assert.equal(spawned, 0);
});

test('main exits 1 when the spawn throws (wt.exe missing), and says so', () => {
  const out = [];
  const code = main(['389'], {
    repoRoot: REPO,
    spawn: () => {
      throw new Error('spawn wt.exe ENOENT');
    },
    log: (line) => out.push(line),
  });
  assert.equal(code, 1);
  assert.match(out.join('\n'), /could not open/i);
});
