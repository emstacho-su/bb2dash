// bb2dash :: docker/walk/entry.test.mjs
// The script that runs inside the walk box's container (brief 103, task 0): docker/walk/entry.sh.
//
// Two kinds of test. The first reads the script as it is written. The second runs it: each test
// copies the script into a scratch folder with its four place constants pointed at that folder,
// puts stand-ins for npm, npx and node first on PATH, runs it with a real bash, and reads back the
// exit code, all it printed and every call the stand-ins saw.
//
// What a run proves: the script's own logic. The order of its steps, the exit code of each way it
// can end, what reaches the scratch copy and the output folder, and what is printed.
// What it does not prove: anything about npm, Next, Playwright or the image. Those are the real
// runs in 103_W75_VERIFICATION.md.
//
// A run needs bash with GNU tar and coreutils' timeout, as the image has them: Git Bash on Windows,
// any Linux. On a machine without them the run tests are skipped and say so.
//
// One part of the walk box's host tests. scripts/walk-box.test.mjs reads this file in, so the one
// command runs all of them:
//
//   node --test scripts/walk-box.test.mjs

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, 'entry.sh');
const SOURCE = fs.readFileSync(ENTRY, 'utf8');
/** The script without its comment lines: what bash runs. */
const CODE = SOURCE.replace(/^\s*#.*$/gm, '');

/* ---------------------------------------------------------------------------------------------
 * The script as it is written
 * ------------------------------------------------------------------------------------------ */

test('docker/walk/entry.sh is a bash script with LF line ends that stops at the first failure', () => {
  const entry = fs.readFileSync(ENTRY);
  assert.equal(entry.includes(0x0d), false, 'a CR in a shell script stops it from running');
  assert.ok(SOURCE.startsWith('#!/usr/bin/env bash\n'));
  assert.match(SOURCE, /^set -euo pipefail$/m);
});

test('entry.sh copies web/ without what a build must not inherit', () => {
  for (const left of ['./node_modules', './.next', './e2e/.auth', './e2e/.results', "'./.env*'"]) {
    assert.ok(SOURCE.includes(`--exclude=${left}`), `--exclude=${left}`);
  }
});

test('entry.sh names the login file twice and no more: where it is, and whether it is there', () => {
  // Any other line that names it (a copy, a read, a print) fails here and is looked at.
  const uses = CODE.split('\n')
    .filter((line) => /LOGIN_FILE|\.env\.testing/.test(line))
    .map((line) => line.trim());
  assert.deepEqual(uses, [
    'readonly LOGIN_FILE="$WORK/.env.testing"',
    '[ -f "$LOGIN_FILE" ] || fail "$E_COPY" "the test login file is not mounted at $LOGIN_FILE"',
  ]);
});

test('entry.sh has no command that prints the environment or traces itself, anywhere in a line', () => {
  const printsTheEnvironment = [
    /\bexport\s+-p\b/,
    /\b(declare|typeset)\s+-[A-Za-z]*[px]/,
    /\bprintenv\b/,
    /\bcompgen\b/,
    /\bset\s+-[A-Za-z]*x/,
    /\bxtrace\b/,
    /\/proc\/[^\s/]+\/environ/,
    // `env` and a bare `set` as commands: at the start of a line or after ; & | (
    /(^\s*|[;&|(]\s*)env(\s|$)/m,
    /(^\s*|[;&|(]\s*)set\s*($|[;&|)])/m,
  ];
  for (const pattern of printsTheEnvironment) assert.doesNotMatch(CODE, pattern);
});

test('entry.sh gives npm ci and the build a time limit: a box nobody is watching still ends', () => {
  assert.match(CODE, /^readonly INSTALL_LIMIT_S=[0-9]+$/m);
  assert.match(CODE, /^readonly BUILD_LIMIT_S=[0-9]+$/m);
  assert.match(CODE, /timeout [^\n]*"\$INSTALL_LIMIT_S" npm ci\b/);
  assert.match(CODE, /timeout [^\n]*"\$BUILD_LIMIT_S" npm run build\b/);
});

/* ---------------------------------------------------------------------------------------------
 * A real bash, and paths it can read
 * ------------------------------------------------------------------------------------------ */

/** On Windows: Git for Windows' bash, never the bash.exe under the Windows folder (WSL's launcher). */
function findBash() {
  if (process.platform !== 'win32') return 'bash';
  const windows = (process.env.SystemRoot ?? '').toLowerCase();
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const lower = dir.toLowerCase();
    if ((windows && lower.startsWith(windows)) || lower.includes('windowsapps')) continue;
    // Git Bash has bash.exe on PATH; PowerShell has git.exe (Git/cmd), with bash.exe in Git/bin beside it.
    const candidates = [path.join(dir, 'bash.exe'), ...(fs.existsSync(path.join(dir, 'git.exe')) ? [path.join(dir, '..', 'bin', 'bash.exe')] : [])];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;
  }
  return null;
}

/**
 * On Windows: the folder of Git's own tar, find and timeout. It goes on PATH ahead of the Windows
 * folder, whose tar, find and timeout are other programs with the same names.
 */
function gitToolsDir(bash) {
  if (process.platform !== 'win32' || bash === null) return null;
  const beside = path.dirname(bash);
  return [beside, path.join(beside, '..', 'usr', 'bin')].find((dir) => fs.existsSync(path.join(dir, 'tar.exe'))) ?? null;
}

const BASH = findBash();
const TOOLS_DIR = gitToolsDir(BASH);
const toBashPath = (file) =>
  process.platform === 'win32' ? file.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replaceAll('\\', '/') : file;

/** PATH for a run: the stand-ins first, then (on Windows) Git's tools, then what this process has. */
function pathWith(binDir) {
  return [binDir, ...(TOOLS_DIR === null ? [] : [TOOLS_DIR]), process.env.PATH ?? ''].join(path.delimiter);
}

/** Why the script cannot be run on this machine, or null when it can. */
function whyNoRun() {
  if (BASH === null) return 'no Git Bash on PATH: the run tests need a real bash';
  const asked = spawnSync(BASH, ['-c', 'tar --version && timeout --version'], { encoding: 'utf8', env: { ...process.env, PATH: pathWith(os.tmpdir()) } });
  const said = `${asked.stdout ?? ''}`;
  if (asked.status !== 0 || !said.includes('GNU tar') || !said.includes('coreutils')) {
    return 'entry.sh needs GNU tar and coreutils timeout, as the Playwright image has them: this bash has neither';
  }
  return null;
}

const NO_RUN = whyNoRun();
/** A test that runs the script; skipped, with the reason said, where it cannot run. */
const runTest = (name, fn) => test(name, { skip: NO_RUN ?? false }, fn);

/* ---------------------------------------------------------------------------------------------
 * A scratch box: the worktree, the login file, the stand-ins, the redirected script
 * ------------------------------------------------------------------------------------------ */

/** Values that must never be printed, each in the one place it would come from. */
const SECRET = Object.freeze({
  email: 'sentinel-owner@walkbox.example',
  password: 'sentinel-password-91bc',
  anonKey: 'sentinel-anon-key-7f3a',
  share: 'sentinel-share-token-55de',
  envLocal: 'sentinel-env-local-c4d1',
});

/**
 * The stand-ins. Each logs what it was asked to $W/calls.log ($W is the scratch box of the run in
 * hand) and ends the way the test asked for, through a STUB_ variable.
 */
const STAND_INS = Object.freeze({
  npm: [
    'echo "npm $*" >>"$W/calls.log"',
    'case "$1" in',
    '  ci) [ "${STUB_NPM_CI_EXIT:-0}" = 0 ] || exit "$STUB_NPM_CI_EXIT"; mkdir -p node_modules ;;',
    '  run) echo "build sees a key: ${NEXT_PUBLIC_SUPABASE_ANON_KEY:+yes}" >>"$W/calls.log"; exit "${STUB_BUILD_EXIT:-0}" ;;',
    'esac',
  ],
  npx: [
    'case "$1" in',
    '  next) echo "npx $*" >>"$W/calls.log" ;;',
    '  playwright)',
    '    echo "npx $*" >>"$W/calls.log"',
    '    echo "playwright sees WALK_BASE_URL=$WALK_BASE_URL WALK_SHOTS=$WALK_SHOTS WALK_SHOT_DIR=$WALK_SHOT_DIR" >>"$W/calls.log"',
    '    [ -z "${STUB_WALK_SLEEP_S:-}" ] || sleep "$STUB_WALK_SLEEP_S"',
    '    mkdir -p e2e/.results && echo "{\\"status\\":\\"stub\\"}" >e2e/.results/.last-run.json',
    '    echo "  2 passed (stub)"',
    '    exit "${STUB_PLAYWRIGHT_EXIT:-0}" ;;',
    'esac',
  ],
  node: [
    'case "$1" in',
    // The readiness probe: `node -e <script> <address> <limit>`.
    '  -e) echo "node probe $3" >>"$W/calls.log"; exit "${STUB_PROBE_EXIT:-0}" ;;',
    '  e2e/login.mjs)',
    '    echo "node $* WALK_BASE_URL=$WALK_BASE_URL share=${WALK_VERCEL_SHARE:-none}" >>"$W/calls.log"',
    '    case "${STUB_LOGIN:-ok}" in',
    '      ok) echo "Signing in at $WALK_BASE_URL/login with the test login."; echo "Session saved."; exit 0 ;;',
    // As Playwright 1.63 words them: the call log carries the value typed, the address the token.
    `      fill) printf 'login.mjs failed: locator.fill: Timeout 30000ms exceeded.\\nCall log:\\n  - waiting for locator(%s)\\n  - fill("%s")\\n' "'#password'" "$STUB_TYPED" >&2; exit 1 ;;`,
    `      goto) printf 'login.mjs failed: page.goto: net::ERR_CONNECTION_REFUSED at %s/?_vercel_share=%s\\n' "$WALK_BASE_URL" "$STUB_TYPED" >&2; exit 1 ;;`,
    `      other) printf 'Signing in.\\n'; printf 'TypeError: %s is not a function\\n' "$STUB_TYPED" >&2; exit 1 ;;`,
    '    esac ;;',
    'esac',
  ],
});
const standIn = (name) => `#!/bin/bash\n${STAND_INS[name].join('\n')}\n`;

/** The script's constants that name a place in the container, and where each points in a scratch box. */
const REDIRECTED = Object.freeze({ SRC_WEB: 'src/web', WORK: 'work', NPM_CACHE: 'npm-cache', BOX_OUT: 'out' });

/** The script with its place constants rewritten, and any other constant a test sets. A constant that moved fails here. */
function redirectedScript(boxDir, constants) {
  let text = SOURCE;
  const swap = (name, value) => {
    const pattern = new RegExp(`^readonly ${name}=.*$`, 'gm');
    assert.equal(text.match(pattern)?.length, 1, `exactly one line sets ${name}`);
    text = text.replace(pattern, () => `readonly ${name}=${value}`);
  };
  for (const [name, relative] of Object.entries(REDIRECTED)) swap(name, `'${boxDir}/${relative}'`);
  for (const [name, value] of Object.entries(constants)) swap(name, String(value));
  return text;
}

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root, relative, text = '') {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** A scratch box: a worktree's web/ with what a build must not inherit in it, the login file, the stand-ins. */
function makeBox({ constants = {}, login = true } = {}) {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'walkbox-entry-')));
  made.push(dir);
  write(dir, 'src/web/package.json', '{}\n');
  write(dir, 'src/web/src/app/page.tsx', '// the app\n');
  write(dir, 'src/web/e2e/login.mjs', '// the sign-in\n');
  write(dir, 'src/web/e2e/harness.spec.ts', '// the spec, first cut\n');
  write(dir, 'src/web/node_modules/left/index.js');
  write(dir, 'src/web/.next/BUILD_ID');
  write(dir, 'src/web/.env.local', `NEXT_PUBLIC_SUPABASE_ANON_KEY=${SECRET.envLocal}\n`);
  write(dir, 'src/web/e2e/.auth/state.json', '{}\n');
  write(dir, 'src/web/e2e/.results/old.txt');
  write(dir, 'src/web/tsconfig.tsbuildinfo');
  if (login) write(dir, 'work/.env.testing', `TEST_USER_EMAIL=${SECRET.email}\nTEST_USER_PW=${SECRET.password}\n`);
  for (const sub of ['work', 'out', 'npm-cache', 'bin']) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const name of Object.keys(STAND_INS)) fs.writeFileSync(path.join(dir, 'bin', name), standIn(name), { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'calls.log'), '');
  const bashDir = toBashPath(dir);
  fs.writeFileSync(path.join(dir, 'entry.sh'), redirectedScript(bashDir, constants));
  return { dir, bashDir };
}

const RUN_LIMIT_MS = 60_000;
const SPEC = 'e2e/harness.spec.ts';
const LOCAL = 'http://localhost:3000';

/** What the walk box's host script sets for a build, with the two public settings as --env-file would give them. */
function boxEnv(box, more) {
  const own = /^(path|w|walk_.*|next_public_.*|stub_.*|test_user_.*)$/i;
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !own.test(name)));
  return {
    ...inherited,
    PATH: pathWith(path.join(box.dir, 'bin')),
    W: box.bashDir,
    WALK_BOX_MODE: 'build',
    WALK_BASE_URL: LOCAL,
    WALK_OUT: `${box.bashDir}/out`,
    WALK_SHOTS: '0',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.example',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET.anonKey,
    ...more,
  };
}

/** One call of the script in a box: its exit code, all it printed (stdout and stderr together), every stand-in call so far. */
function runEntry(box, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(BASH, [`${box.bashDir}/entry.sh`, ...args], { env: boxEnv(box, env), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', (chunk) => (out += chunk));
    const limit = setTimeout(() => child.kill(), RUN_LIMIT_MS);
    child.on('error', (error) => reject(new Error(`bash could not be started: ${error.message}`)));
    child.on('close', (status) => {
      clearTimeout(limit);
      const calls = fs.readFileSync(path.join(box.dir, 'calls.log'), 'utf8').split('\n').filter(Boolean);
      resolve({ status, out, calls });
    });
  });
}

/** Each case in a box of its own, side by side: a run is slow on Windows, where every process costs. */
const each = (cases, fn) => Promise.all(cases.map(fn));

const has = (box, relative) => fs.existsSync(path.join(box.dir, relative));
const called = (calls, start) => calls.filter((call) => call.startsWith(start));

function assertNoSecret(out, what) {
  for (const [name, value] of Object.entries(SECRET)) assert.ok(!out.includes(value), `${what}: the ${name} value was printed`);
}

/* ---------------------------------------------------------------------------------------------
 * The script, run
 * ------------------------------------------------------------------------------------------ */

runTest('a new box: copy, npm ci, build, server, sign-in, walk, results, in that order, and it ends with 0', async () => {
  const box = makeBox();
  const { status, out, calls } = await runEntry(box, ['all', SPEC, '--', '-g', 'signed in']);
  assert.equal(status, 0, out);
  assert.deepEqual(
    calls.map((call) => call.split(' ').slice(0, 2).join(' ')),
    ['npm ci', 'npm run', 'build sees', 'npx next', 'node probe', 'node e2e/login.mjs', 'npx playwright', 'playwright sees'],
  );
  assert.match(called(calls, 'npm ci')[0], /^npm ci --cache \S+\/npm-cache --prefer-offline --no-audit --no-fund$/);
  assert.equal(called(calls, 'npx next')[0], 'npx next start -p 3000');
  assert.equal(called(calls, 'node probe')[0], `node probe ${LOCAL}/login`);
  assert.equal(called(calls, 'npx playwright')[0], `npx playwright test -c e2e/playwright.config.ts ${SPEC} -g signed in`);
  assert.equal(called(calls, 'playwright sees')[0], `playwright sees WALK_BASE_URL=${LOCAL} WALK_SHOTS=0 WALK_SHOT_DIR=${box.bashDir}/out/shots`);

  // The scratch copy has the app and the specs, and nothing a build must not inherit.
  for (const kept of ['work/web/package.json', 'work/web/src/app/page.tsx', `work/web/${SPEC}`]) assert.ok(has(box, kept), kept);
  for (const left of ['work/web/node_modules/left', 'work/web/.next', 'work/web/.env.local', 'work/web/e2e/.auth', 'work/web/e2e/.results/old.txt', 'work/web/tsconfig.tsbuildinfo']) {
    assert.ok(!has(box, left), `${left} was copied`);
  }
  // The login file stays where it was mounted: no second copy anywhere in the box.
  assert.ok(!has(box, 'work/web/.env.testing'));
  assert.ok(!has(box, 'out/.env.testing'));

  assert.ok(has(box, 'out/results/.last-run.json'), "Playwright's output folder is copied to the run's");
  assert.ok(has(box, 'out/next.log'), "the server's log is in the run folder");
  assert.match(out, /playwright ended with exit code 0/);
});

runTest("the walk ends with Playwright's own exit code, and its results are kept either way", async () => {
  await each([1, 2], async (code) => {
    const box = makeBox();
    const { status, out } = await runEntry(box, ['all', SPEC, '--'], { STUB_PLAYWRIGHT_EXIT: String(code) });
    assert.equal(status, code, out);
    assert.ok(has(box, 'out/results/.last-run.json'));
    assert.match(out, new RegExp(`playwright ended with exit code ${code}`));
  });
});

runTest('a step that breaks ends the box with that step\'s code, and nothing after it runs', async () => {
  const breaks = [
    { name: 'npm ci', env: { STUB_NPM_CI_EXIT: '1' }, code: 72, last: 'npm ci' },
    { name: 'a setting the web env file does not give', env: { NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, code: 73, last: 'npm ci', says: /does not set NEXT_PUBLIC_SUPABASE_ANON_KEY/ },
    { name: 'a setting given in quotes', env: { NEXT_PUBLIC_SUPABASE_URL: '"https://project.supabase.example"' }, code: 73, last: 'npm ci', says: /in quotes/ },
    { name: 'the build', env: { STUB_BUILD_EXIT: '1' }, code: 73, last: 'build sees' },
    { name: 'the server', env: { STUB_PROBE_EXIT: '1' }, code: 74, last: 'node probe', says: /the server is not running/ },
    { name: 'the sign-in', env: { STUB_LOGIN: 'fill', STUB_TYPED: 'nothing-secret' }, code: 75, last: 'node probe' },
  ];
  await each(breaks, async ({ name, env, code, last, says }) => {
    const box = makeBox();
    const { status, out, calls } = await runEntry(box, ['all', SPEC, '--'], env);
    assert.equal(status, code, `${name}: ${out}`);
    assert.ok(calls.at(-1).startsWith(last), `${name}: the last call was "${calls.at(-1)}"`);
    assert.equal(called(calls, 'npx playwright').length, 0, `${name}: the walk still ran`);
    assert.match(out, /\[walk-box\] FAILED: /);
    if (says) assert.match(out, says);
  });
});

runTest('a box without the login file, and a call it cannot read, end before anything is copied', async () => {
  const noLogin = makeBox({ login: false });
  const first = await runEntry(noLogin, ['all', SPEC, '--']);
  assert.equal(first.status, 71, first.out);
  assert.deepEqual(first.calls, []);
  await each([['all'], ['all', '--', '-g', 'x'], ['sideways', SPEC, '--'], []], async (args) => {
    const box = makeBox();
    const { status, out, calls } = await runEntry(box, args);
    assert.equal(status, 70, `${args.join(' ')}: ${out}`);
    assert.deepEqual(calls, []);
  });
});

runTest('walk, in a kept box: e2e/ is taken again from the worktree, nothing is installed or built, the output has a folder of its own', async () => {
  const box = makeBox();
  assert.equal((await runEntry(box, ['all', SPEC, '--'])).status, 0);
  // The worktree moves on after the build: a spec is edited, one is added, one is removed.
  write(box.dir, `src/web/${SPEC}`, '// the spec, second cut\n');
  write(box.dir, 'src/web/e2e/added.spec.ts', '// new\n');
  fs.rmSync(path.join(box.dir, 'src/web/e2e/login.mjs'));
  write(box.dir, 'src/web/e2e/login.mjs', '// the sign-in, second cut\n');
  const before = fs.readFileSync(path.join(box.dir, 'calls.log'), 'utf8').split('\n').filter(Boolean).length;

  const { status, out, calls } = await runEntry(box, ['walk', 'e2e/added.spec.ts', '--'], { WALK_OUT: `${box.bashDir}/out/exec-1`, WALK_SHOTS: '1' });
  assert.equal(status, 0, out);
  assert.deepEqual(
    calls.slice(before).map((call) => call.split(' ').slice(0, 2).join(' ')),
    ['node probe', 'node e2e/login.mjs', 'npx playwright', 'playwright sees'],
  );
  assert.equal(calls.at(-1), `playwright sees WALK_BASE_URL=${LOCAL} WALK_SHOTS=1 WALK_SHOT_DIR=${box.bashDir}/out/exec-1/shots`);
  assert.equal(fs.readFileSync(path.join(box.dir, `work/web/${SPEC}`), 'utf8'), '// the spec, second cut\n');
  assert.ok(has(box, 'work/web/e2e/added.spec.ts'));
  assert.ok(has(box, 'out/exec-1/results/.last-run.json'));
  // The app is the one the box built: nothing outside e2e/ is taken again.
  assert.ok(has(box, 'work/web/node_modules'));
});

runTest('walk in a box that was never prepared is a wrong call, not a failed test', async () => {
  const box = makeBox();
  const { status, out, calls } = await runEntry(box, ['walk', SPEC, '--']);
  assert.equal(status, 70, out);
  assert.deepEqual(calls, []);
});

runTest('--url: nothing is built or served, that host is signed in to and walked, and the share token goes to the sign-in only there', async () => {
  const host = 'https://bb2dash.example';
  const box = makeBox();
  const url = await runEntry(box, ['all', SPEC, '--'], { WALK_BOX_MODE: 'url', WALK_BASE_URL: host, WALK_VERCEL_SHARE: SECRET.share });
  assert.equal(url.status, 0, url.out);
  assert.deepEqual(
    url.calls.map((call) => call.split(' ').slice(0, 2).join(' ')),
    ['npm ci', 'node e2e/login.mjs', 'npx playwright', 'playwright sees'],
  );
  assert.equal(called(url.calls, 'node e2e/login.mjs')[0], `node e2e/login.mjs WALK_BASE_URL=${host} share=${SECRET.share}`);
  assert.match(called(url.calls, 'playwright sees')[0], new RegExp(`WALK_BASE_URL=${host} `));
  assertNoSecret(url.out, '--url');

  // A build never hands a share token to the sign-in, whatever the environment holds.
  const built = makeBox();
  const build = await runEntry(built, ['all', SPEC, '--'], { WALK_VERCEL_SHARE: SECRET.share });
  assert.equal(build.status, 0, build.out);
  assert.equal(called(build.calls, 'node e2e/login.mjs')[0], `node e2e/login.mjs WALK_BASE_URL=${LOCAL} share=none`);
});

runTest('no value handed in is printed: not the login, not a setting, not the share token', async () => {
  const ways = [
    ['a walk that passes', {}],
    ['a walk that fails', { STUB_PLAYWRIGHT_EXIT: '1' }],
    ['a build that fails', { STUB_BUILD_EXIT: '1' }],
    ['a server that does not start', { STUB_PROBE_EXIT: '1' }],
    ['npm ci that fails', { STUB_NPM_CI_EXIT: '1' }],
  ];
  await each(ways, async ([what, env]) => {
    const box = makeBox();
    const { out } = await runEntry(box, ['all', SPEC, '--'], { WALK_VERCEL_SHARE: SECRET.share, ...env });
    assertNoSecret(out, what);
    assertNoSecret(fs.readFileSync(path.join(box.dir, 'out', 'next.log'), { encoding: 'utf8', flag: 'a+' }), `${what}, next.log`);
  });
});
