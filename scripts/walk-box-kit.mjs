// bb2dash :: scripts/walk-box-kit.mjs
// What the walk box's two host test files share: a worktree and a home folder made for one test,
// the fixed times and names the exact docker calls are written with, and the values that must never
// leave the files or the environment they are in. No test here.

import { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WalkBoxError } from './walk-box.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NOW = new Date('2026-10-08T05:15:00.000Z');
export const RUN_ID = '20261008T051500Z';
export const CONTAINER = 'bb2dash-walk22-20261008t051500z';
export const LATER = new Date('2026-10-08T05:22:30.000Z');
export const LATER_RUN_ID = '20261008T052230Z';
export const COMMIT = '0123456789abcdef0123456789abcdef01234567';

/** Values that must never leave the files or the environment they are in. */
export const SECRET_KEY = 'sentinel-anon-key-7f3a';
export const SECRET_PASSWORD = 'sentinel-password-91bc';
export const SECRET_SHARE = 'sentinel-share-token-55de';

export const posix = (file) => file.split(path.sep).join('/');

const made = [];
/** A scratch folder, taken away when the test run ends. */
export function scratch(prefix) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

export function write(root, relative, text = '') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** A worktree and a home folder, both made for the test: a checkout, its specs, the two input files. */
export function fixture({ env = {} } = {}) {
  const root = scratch('walkbox-root-');
  write(root, '.git', 'gitdir: somewhere/else\n');
  write(root, 'web/package.json', JSON.stringify({ devDependencies: { '@playwright/test': '1.63.0' } }));
  write(root, 'web/e2e/harness.spec.ts');
  write(root, 'web/e2e/theme/walk22.spec.ts');
  write(root, 'web/e2e/walk.ts');
  write(root, 'web/src/elsewhere.spec.ts');
  write(root, 'docker/walk/entry.sh');
  const home = scratch('walkbox-home-');
  const webEnv = write(home, '.bb2dash-walk/web.env', `NEXT_PUBLIC_SUPABASE_ANON_KEY=${SECRET_KEY}\n`);
  const loginEnv = write(home, 'projects/bb2dash/.env.testing', `TEST_USER_PW=${SECRET_PASSWORD}\n`);
  const outBase = path.join(home, '.bb2dash-walk', '22');
  return { root, home, cwd: root, env, now: NOW, webEnv, loginEnv, outBase };
}

/**
 * The run.json a `--keep` run leaves in its box's folder, with anything else laid over it. `null`
 * leaves the folder without a record.
 */
export function keptBox(f, more = {}) {
  const dir = path.join(f.outBase, RUN_ID);
  fs.mkdirSync(dir, { recursive: true });
  if (more === null) return null;
  const record = {
    schema: 1,
    run_id: RUN_ID,
    command: 'run',
    container: CONTAINER,
    kept: true,
    mode: 'build',
    base_url: 'http://localhost:3000',
    worktree: posix(f.root),
    commit: COMMIT,
    dirty: false,
    ...more,
  };
  fs.writeFileSync(path.join(dir, 'run.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

/** What parseArgs gives for a plain run of these specs, with anything else laid over it. */
export const run = (specs, more = {}) => ({ command: 'run', url: null, keep: false, container: null, specs, extra: [], ...more });

/** The call must be refused: a WalkBoxError whose message matches. */
export function refusal(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof WalkBoxError, `a WalkBoxError, not ${error?.name}: ${error?.message}`);
    assert.match(error.message, pattern);
    return true;
  });
}
