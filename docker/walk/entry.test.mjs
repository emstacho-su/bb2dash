// bb2dash :: docker/walk/entry.test.mjs
// The script that runs inside the walk box's container (brief 103, task 0): docker/walk/entry.sh.
//
// One part of the walk box's host tests. scripts/walk-box.test.mjs reads this file in, so the one
// command runs all of them:
//
//   node --test scripts/walk-box.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, 'entry.sh');

/* ---------------------------------------------------------------------------------------------
 * The script as it is written
 * ------------------------------------------------------------------------------------------ */

test('docker/walk/entry.sh is a bash script with LF line ends that stops at the first failure', () => {
  const entry = fs.readFileSync(ENTRY);
  assert.equal(entry.includes(0x0d), false, 'a CR in a shell script stops it from running');
  const text = entry.toString('utf8');
  assert.ok(text.startsWith('#!/usr/bin/env bash\n'));
  assert.match(text, /^set -euo pipefail$/m);
});

test('entry.sh copies web/ without what a build must not inherit, and never copies the login file', () => {
  const text = fs.readFileSync(ENTRY, 'utf8');
  for (const left of ['./node_modules', './.next', './e2e/.auth', './e2e/.results', "'./.env*'"]) {
    assert.ok(text.includes(`--exclude=${left}`), `--exclude=${left}`);
  }
  const code = text.replace(/^\s*#.*$/gm, '');
  assert.doesNotMatch(code, /\b(cp|cat|mv|tar)\b[^\n]*\.env\.testing/);
  assert.doesNotMatch(code, /\b(env|printenv|set -x)\b\s*$/m);
});

test('entry.sh gives npm ci and the build a time limit: a box nobody is watching still ends', () => {
  const text = fs.readFileSync(ENTRY, 'utf8');
  const code = text.replace(/^\s*#.*$/gm, '');
  assert.match(code, /^readonly INSTALL_LIMIT_S=[0-9]+$/m);
  assert.match(code, /^readonly BUILD_LIMIT_S=[0-9]+$/m);
  assert.match(code, /timeout [^\n]*"\$INSTALL_LIMIT_S" npm ci\b/);
  assert.match(code, /timeout [^\n]*"\$BUILD_LIMIT_S" npm run build\b/);
});
